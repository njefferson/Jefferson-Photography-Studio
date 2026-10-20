// Per-photograph channel alignment on the raw mosaic: where red and blue sit against green is measured on each frame's own photosites at decode and removed there.
//
// WHY, AND WHY HERE (decision 061). The lens puts red and blue a fraction of a
// photosite away from green, growing toward the corners, and the sign reverses
// between focal lengths and lenses, so no constant is right for every frame.
// The camera records one colour axis, so an edge's colour error lands on the
// same axis that separates foliage from sky, and the Aerochrome mixer turns a
// blue error red at about 2.1 times. Raw pipelines correct channel geometry on
// the raw, before demosaic and before any colour transform (darktable's order
// puts raw chromatic aberration at 312 and the channel mixer at 347; dcraw -C
// rescales red and blue about the centre before demosaic; RawTherapee fits red
// and blue shifts per tile against green on the raw). This is that, and the
// fit is the tile-and-polynomial one: nothing a grade does afterwards can undo
// an error the swap and the mixer have already amplified (decision 021's reason).
//
// METHOD. In each 128 photosite tile the red (or blue) sites are fitted as a
// gain times the green picture displaced by a shift, plus an offset, by
// Gauss-Newton, the green being made at every site first (a green site keeps
// its value, a red or blue site takes the mean of its four green neighbours).
// A tile that cannot be trusted (too few sites, a flat patch or a single
// straight edge, a gain outside a sane range, a shift over 2.5 photosites)
// reports itself untrusted and takes no part. A robust fit over the trusted
// tiles then gives, per colour, a constant term and a radial polynomial,
// s(x, y) = (ax, ay) + (k1 + k3 * rho^2) * (X, Y), with (X, Y) the position
// from the centre over the half diagonal and rho its length. Units are
// photosites of the full mosaic; a positive shift means the colour's picture
// lies to the right of (or below) the green picture. It was proved on exact
// plants first (a colour moved by a whole lattice step reads that step within
// 0.1; an analytic scene with radial shifts reads them back within 0.1).
//
// APPLYING IT. Each colour's own lattice is read again at p + s(p) with a
// bilinear read, in place, so the colour's picture now lies where green's does.
// A shift smaller than a dead zone is not applied at all (it would blur the
// colour for nothing), and neither is one the fit cannot support.
//
// THE TWO HALVES SHIP TOGETHER. The editing copy's 2x2 collapse (demosaic.ts
// `demosaicBinned`) reads red and blue at the centre of each quad, where the
// averaged green sits; this alignment removes the lens's part. Either alone
// turned the other side of a post blue (decision 061, Rejected).
//
// THE ESTIMATE TRAVELS WITH THE PHOTOGRAPH (`DecodedImage.chromatic`): the
// export re-reads the file, applies the stored numbers to the frame it reads,
// and never measures again, so the screen and the export move the same way.

import type { RawCfa } from "./demosaic";

/** One colour's fitted offset against green, in photosites of the full mosaic.
 *  Plain data, so a decode worker can post it and an export worker can receive
 *  it. `ax`, `ay`, `k1`, `k3` are the fit s = (ax, ay) + (k1 + k3 rho^2)(X, Y);
 *  `corner` is the mean over the four corners of the part along the outward
 *  direction; `rms` the root mean square length of the tile residuals; `used`
 *  the trusted tiles; `applied` whether the colour was moved. */
export interface ChannelFit {
  ax: number;
  ay: number;
  k1: number;
  k3: number;
  corner: number;
  rms: number;
  used: number;
  applied: boolean;
}

/** What was measured on one frame. `red` and `blue` are null when nothing could
 *  be fitted (`why` then says so); `width` and `height` are the frame the fit is
 *  for, `ms` the time the measurement took and `tiles` the tiles it read. */
export interface ChromaticShifts {
  red: ChannelFit | null;
  blue: ChannelFit | null;
  width: number;
  height: number;
  ms: number;
  tiles: number;
  why?: string;
}

const TILE = 128;
/** Photosites read beyond a tile's edge: a tile's sites reach 2.5 (the shift
 *  limit) plus 1 (the gradient) plus 1 (the bilinear read) beyond themselves. */
const PAD = 8;
const MAXW = TILE + 2 * PAD + 2;
const MIN_TILES = 12;
/** A shift whose largest size over the frame is under this is not applied. */
const DEAD_ZONE = 0.08;
/** A shift whose largest size over the frame is over this is not believed. */
const BELIEVE_LIMIT = 1.5;

const WV = new Float32Array(MAXW * MAXW);
const WG = new Float32Array(MAXW * MAXW);
const NM = new Float64Array(16);
const NR = new Float64Array(4);
const PHI = new Float64Array(4);

const clock = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

interface TileOut { cx: number; cy: number; sx: number; sy: number; sig: number; ok: boolean }

/** Solves the n by n system in the first n*n entries of `m` (row-major) with the
 *  right-hand side in the first n entries of `r`, by elimination with a row swap.
 *  Returns false when the system is singular, true otherwise, the solution
 *  being left in `r`. Both arrays are overwritten. */
function solveSmall(m: Float64Array, r: Float64Array, n: number): boolean {
  for (let c = 0; c < n; c++) {
    let p = c, best = Math.abs(m[c * n + c]);
    for (let k = c + 1; k < n; k++) { const a = Math.abs(m[k * n + c]); if (a > best) { best = a; p = k; } }
    if (!(best > 1e-18)) return false;
    if (p !== c) {
      for (let j = 0; j < n; j++) { const t = m[c * n + j]; m[c * n + j] = m[p * n + j]; m[p * n + j] = t; }
      const t = r[c]; r[c] = r[p]; r[p] = t;
    }
    const d = m[c * n + c];
    for (let k = c + 1; k < n; k++) {
      const f = m[k * n + c] / d;
      if (f === 0) continue;
      for (let j = c; j < n; j++) m[k * n + j] -= f * m[c * n + j];
      r[k] -= f * r[c];
    }
  }
  for (let c = n - 1; c >= 0; c--) {
    let s = r[c];
    for (let j = c + 1; j < n; j++) s -= m[c * n + j] * r[j];
    r[c] = s / m[c * n + c];
  }
  return true;
}

/** Bilinear read of a plane of width `W` and height `H` at a fractional
 *  position, the position held inside the plane. Returns the interpolated value. */
function bil(G: Float32Array, W: number, H: number, x: number, y: number): number {
  if (x < 0) x = 0; else if (x > W - 1.001) x = W - 1.001;
  if (y < 0) y = 0; else if (y > H - 1.001) y = H - 1.001;
  const x0 = x | 0, y0 = y | 0, fx = x - x0, fy = y - y0;
  const i = y0 * W + x0;
  return (G[i] * (1 - fx) + G[i + 1] * fx) * (1 - fy) + (G[i + W] * (1 - fx) + G[i + W + 1] * fx) * fy;
}

/** Fills the window buffers for the box [wx0, wx1) by [wy0, wy1) of the frame:
 *  `WV` the normalised mosaic, `WG` green at every site. The window's origin
 *  must be even so a site keeps its parity locally. Returns nothing; what the
 *  caller relies on is that a green value at a red or blue site is the mean of
 *  that site's neighbours that exist in the FRAME, not only in the window. */
function fillWindow(c: RawCfa, k: number, wx0: number, wy0: number, wx1: number, wy1: number): void {
  const { cfa, width: W, height: H, pattern, black } = c;
  const LW = wx1 - wx0;
  for (let y = wy0; y < wy1; y++) {
    let li = (y - wy0) * LW;
    for (let x = wx0, gi = y * W + wx0; x < wx1; x++, gi++, li++) {
      const a = (cfa[gi] - black) * k;
      WV[li] = a > 0 ? a : 0;
    }
  }
  for (let y = wy0; y < wy1; y++) {
    const row = (y & 1) << 1;
    for (let x = wx0; x < wx1; x++) {
      const li = (y - wy0) * LW + (x - wx0);
      if (pattern[row | (x & 1)] === 1) { WG[li] = WV[li]; continue; }
      let s = 0, n = 0;
      const gi = y * W + x;
      if (x > 0) { const a = (cfa[gi - 1] - black) * k; s += a > 0 ? a : 0; n++; }
      if (x < W - 1) { const a = (cfa[gi + 1] - black) * k; s += a > 0 ? a : 0; n++; }
      if (y > 0) { const a = (cfa[gi - W] - black) * k; s += a > 0 ? a : 0; n++; }
      if (y < H - 1) { const a = (cfa[gi + W] - black) * k; s += a > 0 ? a : 0; n++; }
      WG[li] = n ? s / n : 0;
    }
  }
}

/** Estimates the shift of one colour's sites against green over one tile, from
 *  the window buffers `WV` and `WG`.
 *
 *  Takes the window's origin (`ox`, `oy`, even) and width `LW` and height `LH`;
 *  the colour's lattice parities `px` and `py`; the tile's box [`x0`, `x1`) by
 *  [`y0`, `y1`) in the frame; and the frame's size `W` by `H` (sites within 4 of
 *  the frame edge are left out). Returns { cx, cy, sx, sy, sig, ok }: the tile
 *  centre, the shift in photosites, its uncertainty along the weakest gradient
 *  direction, and whether the tile may be trusted. What the caller relies on: a
 *  tile on a flat patch or a single straight edge comes back with a large `sig`
 *  and `ok` false, never a confident wrong shift. */
function tileShift(ox: number, oy: number, LW: number, LH: number, px: number, py: number, x0: number, y0: number, x1: number, y1: number, W: number, H: number): TileOut {
  const margin = 4;
  let sx = 0, sy = 0, a = 1, n = 0, sig = Infinity, resVar = 0, lamMin = 0;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const xs = x0 < margin ? margin : x0;
  const xe = x1 > W - margin ? W - margin : x1;
  const ys = y0 < margin ? margin : y0;
  const ye = y1 > H - margin ? H - margin : y1;
  const xa = xs + (((xs & 1) === px) ? 0 : 1);
  const ya = ys + (((ys & 1) === py) ? 0 : 1);
  const bad = (): TileOut => ({ cx, cy, sx, sy, sig: Infinity, ok: false });
  for (let it = 0; it < 5; it++) {
    NM.fill(0); NR.fill(0);
    let sCC = 0, cnt = 0, sgx2 = 0, sgxgy = 0, sgy2 = 0;
    for (let y = ya; y < ye; y += 2) {
      const row = (y - oy) * LW - ox;
      for (let x = xa; x < xe; x += 2) {
        const c = WV[row + x];
        if (c >= 0.97) continue;
        const qx = x - sx - ox, qy = y - sy - oy;
        const g = bil(WG, LW, LH, qx, qy);
        if (g >= 0.97) continue;
        const gx = (bil(WG, LW, LH, qx + 1, qy) - bil(WG, LW, LH, qx - 1, qy)) * 0.5;
        const gy = (bil(WG, LW, LH, qx, qy + 1) - bil(WG, LW, LH, qx, qy - 1)) * 0.5;
        PHI[0] = g; PHI[1] = 1; PHI[2] = -gx; PHI[3] = -gy;
        for (let p = 0; p < 4; p++) {
          const fp = PHI[p];
          NR[p] += fp * c;
          for (let q = p; q < 4; q++) NM[p * 4 + q] += fp * PHI[q];
        }
        sCC += c * c; cnt++;
        sgx2 += gx * gx; sgxgy += gx * gy; sgy2 += gy * gy;
      }
    }
    n = cnt;
    if (cnt < 200) return bad();
    for (let p = 0; p < 4; p++) for (let q = 0; q < p; q++) NM[p * 4 + q] = NM[q * 4 + p];
    const rhs0 = NR[0], rhs1 = NR[1], rhs2 = NR[2], rhs3 = NR[3];
    if (!solveSmall(NM, NR, 4)) return bad();
    const th0 = NR[0], th1 = NR[1], th2 = NR[2], th3 = NR[3];
    a = th0;
    const ss = sCC - th0 * rhs0 - th1 * rhs1 - th2 * rhs2 - th3 * rhs3;
    resVar = Math.max(1e-14, ss / Math.max(1, cnt - 4));
    const m11 = sgx2 / cnt, m12 = sgxgy / cnt, m22 = sgy2 / cnt;
    const tr = m11 + m22, det = m11 * m22 - m12 * m12;
    lamMin = tr * 0.5 - Math.sqrt(Math.max(0, tr * tr * 0.25 - det));
    if (!(a > 0.05) || !Number.isFinite(a)) return bad();
    let dx = th2 / a, dy = th3 / a;
    if (dx > 1) dx = 1; else if (dx < -1) dx = -1;
    if (dy > 1) dy = 1; else if (dy < -1) dy = -1;
    sx += dx; sy += dy;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) break;
  }
  sig = lamMin > 1e-12 ? Math.sqrt(resVar / (n * lamMin * a * a)) : Infinity;
  const ok = n >= 200 && a >= 0.15 && a <= 8 && Math.abs(sx) < 2.5 && Math.abs(sy) < 2.5 && sig <= 0.25;
  return { cx, cy, sx, sy, sig, ok };
}

interface RadialFit { ax: number; ay: number; k1: number; k3: number; used: number; resRms: number }

const median = (arr: number[]): number => {
  if (!arr.length) return 0;
  const s = arr.slice().sort((p, q) => p - q);
  return s[s.length >> 1];
};

/** Fits s = (ax, ay) + (k1 + k3 rho^2)(X, Y) to the trusted tiles of one colour,
 *  weighting each by 1 / (sig^2 + 0.0025) and reweighting three more times by
 *  Tukey's biweight on the residual scale so a few wrong tiles cannot move it.
 *  Takes the tiles `tiles` and the frame's size `W` by `H`. Returns the four
 *  coefficients, the number of tiles used and the root mean square residual;
 *  all coefficients are 0 when fewer than `MIN_TILES` tiles were trusted, so a
 *  frame with nothing to measure fits to no shift at all. */
function fitRadial(tiles: TileOut[], W: number, H: number): RadialFit {
  const use = tiles.filter((t) => t.ok);
  const Rm = Math.hypot(W, H) / 2;
  const rows = use.map((t) => {
    const X = (t.cx - W / 2) / Rm, Y = (t.cy - H / 2) / Rm;
    return { X, Y, r2: X * X + Y * Y, sx: t.sx, sy: t.sy, w: 1 / (t.sig * t.sig + 0.0025) };
  });
  const out: RadialFit = { ax: 0, ay: 0, k1: 0, k3: 0, used: rows.length, resRms: 0 };
  if (rows.length < MIN_TILES) return out;
  let rw = rows.map(() => 1);
  let th = [0, 0, 0, 0];
  for (let pass = 0; pass < 4; pass++) {
    const M = new Float64Array(16), R = new Float64Array(4);
    rows.forEach((q, i) => {
      const w = q.w * rw[i];
      const rx = [1, 0, q.X, q.X * q.r2], ry = [0, 1, q.Y, q.Y * q.r2];
      for (let p = 0; p < 4; p++) {
        R[p] += w * (rx[p] * q.sx + ry[p] * q.sy);
        for (let k = 0; k < 4; k++) M[p * 4 + k] += w * (rx[p] * rx[k] + ry[p] * ry[k]);
      }
    });
    if (!solveSmall(M, R, 4)) break;
    th = [R[0], R[1], R[2], R[3]];
    const res = rows.map((q) => {
      const fx = th[0] + (th[2] + th[3] * q.r2) * q.X, fy = th[1] + (th[2] + th[3] * q.r2) * q.Y;
      return Math.hypot(q.sx - fx, q.sy - fy);
    });
    const scale = Math.max(0.03, 1.4826 * median(res));
    rw = res.map((r) => { const u = r / (4.685 * scale); return u >= 1 ? 0 : (1 - u * u) * (1 - u * u); });
  }
  out.ax = th[0]; out.ay = th[1]; out.k1 = th[2]; out.k3 = th[3];
  let ss = 0;
  for (const q of rows) {
    const fx = th[0] + (th[2] + th[3] * q.r2) * q.X, fy = th[1] + (th[2] + th[3] * q.r2) * q.Y;
    ss += (q.sx - fx) ** 2 + (q.sy - fy) ** 2;
  }
  out.resRms = Math.sqrt(ss / rows.length);
  return out;
}

/** Where a colour's offset against green is, at the four corners of a frame.
 *  Takes the fit `f` (a `ChannelFit`) and the frame's size `width` by `height`.
 *  Returns four [x, y] shifts in photosites, in the order top-left, top-right,
 *  bottom-left, bottom-right. What the callers rely on: it evaluates the same
 *  polynomial `alignChannels` applies, so the diagnostic and the measurement
 *  scripts report what the alignment does. */
export function cornerShifts(f: ChannelFit, width: number, height: number): [number, number][] {
  const Rm = Math.hypot(width, height) / 2;
  const out: [number, number][] = [];
  for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const X = (sx * width / 2) / Rm, Y = (sy * height / 2) / Rm;
    const r = f.k1 + f.k3 * (X * X + Y * Y);
    out.push([f.ax + r * X, f.ay + r * Y]);
  }
  return out;
}

/** Turns a fit into the stored form and decides whether it is applied.
 *  Takes the fit `f` from `fitRadial` and the frame's size `W` by `H`. Returns a
 *  `ChannelFit`. It is applied when enough tiles were trusted, its largest size
 *  over the frame (the four corners and the centre) is at least the dead zone,
 *  and at most the limit it is believed to. */
function settle(f: RadialFit, W: number, H: number): ChannelFit {
  const fit: ChannelFit = { ax: f.ax, ay: f.ay, k1: f.k1, k3: f.k3, corner: 0, rms: f.resRms, used: f.used, applied: false };
  const Rm = Math.hypot(W, H) / 2;
  let biggest = Math.hypot(f.ax, f.ay);
  let rad = 0;
  const corners = cornerShifts(fit, W, H);
  const signs = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
  for (let i = 0; i < 4; i++) {
    biggest = Math.max(biggest, Math.hypot(corners[i][0], corners[i][1]));
    const X = (signs[i][0] * W / 2) / Rm, Y = (signs[i][1] * H / 2) / Rm;
    rad += corners[i][0] * X + corners[i][1] * Y;
  }
  fit.corner = rad / 4;
  fit.applied = f.used >= MIN_TILES && Number.isFinite(biggest) && biggest >= DEAD_ZONE && biggest <= BELIEVE_LIMIT;
  return fit;
}

/** Measures how far red and blue sit from green on a mosaic.
 *
 *  Takes the frame `c`, a Bayer mosaic as the decoders hand it (black already
 *  subtracted per site, cropped to the picture). Returns a `ChromaticShifts`:
 *  the red and blue fits in photosites of this frame, the time it took and the
 *  tiles read. Nothing in `c` is changed. For a frame it cannot measure (a
 *  LinearRaw frame, which has no mosaic; a mosaic with other than one red, one
 *  blue and two greens in its quad; a frame under four tiles across) both fits
 *  are null and `why` says which.
 *
 *  What the result must satisfy: it is a function of the frame alone (the same
 *  frame measured twice gives the same numbers), and `alignChannels` of the same
 *  frame with it moves red and blue onto green. About 330 tiles are read
 *  whatever the frame's size (every tile of a small frame, one in four of a
 *  twenty-megapixel one), which on the owner's frames moved the corner offset
 *  by no more than 0.03 photosite against reading every tile. */
export function estimateChromatic(c: RawCfa): ChromaticShifts {
  const t0 = clock();
  const W = c.width, H = c.height;
  const none = (why: string): ChromaticShifts => ({ red: null, blue: null, width: W, height: H, ms: clock() - t0, tiles: 0, why });
  if (c.samples === 3) return none("a LinearRaw frame has no mosaic to measure");
  const nR = c.pattern.filter((v) => v === 0).length, nG = c.pattern.filter((v) => v === 1).length, nB = c.pattern.filter((v) => v === 2).length;
  if (nR !== 1 || nG !== 2 || nB !== 1) return none("the colour pattern is not a Bayer quad");
  if (W < 4 * TILE || H < 4 * TILE) return none("the frame is too small to measure");
  const k = 1 / Math.max(1, c.white - c.black);
  const nx = Math.ceil(W / TILE), ny = Math.ceil(H / TILE);
  const total = nx * ny;
  const every = total >= 1000 ? 4 : total >= 500 ? 2 : 1;
  const ri = c.pattern.indexOf(0), bi = c.pattern.indexOf(2);
  const redTiles: TileOut[] = [], blueTiles: TileOut[] = [];
  let considered = 0;
  for (let ty = 0; ty < ny; ty++) {
    for (let tx = 0; tx < nx; tx++) {
      if ((tx + ty) % every !== 0) continue;
      considered++;
      const x0 = tx * TILE, y0 = ty * TILE;
      const x1 = Math.min(W, x0 + TILE), y1 = Math.min(H, y0 + TILE);
      const wx0 = Math.max(0, x0 - PAD), wy0 = Math.max(0, y0 - PAD);
      const wx1 = Math.min(W, x1 + PAD), wy1 = Math.min(H, y1 + PAD);
      fillWindow(c, k, wx0, wy0, wx1, wy1);
      redTiles.push(tileShift(wx0, wy0, wx1 - wx0, wy1 - wy0, ri & 1, ri >> 1, x0, y0, x1, y1, W, H));
      blueTiles.push(tileShift(wx0, wy0, wx1 - wx0, wy1 - wy0, bi & 1, bi >> 1, x0, y0, x1, y1, W, H));
    }
  }
  const red = settle(fitRadial(redTiles, W, H), W, H);
  const blue = settle(fitRadial(blueTiles, W, H), W, H);
  const out: ChromaticShifts = { red, blue, width: W, height: H, ms: clock() - t0, tiles: considered };
  if (red.used < MIN_TILES && blue.used < MIN_TILES) out.why = "too little detail in the frame to measure";
  return out;
}

/** Moves one colour onto green by reading its own lattice at p + s(p).
 *  Takes the frame `c`, the colour `ch` (0 red, 2 blue) and its fit `f`.
 *  Returns nothing; the colour's sites in `c.cfa` are replaced by the bilinear
 *  read of the colour's lattice, indices held inside the lattice. What it must
 *  satisfy: a site's new value is between the smallest and largest of the four
 *  lattice values it blends, so nothing leaves the 16-bit range. */
function alignOne(c: RawCfa, ch: number, f: ChannelFit): void {
  const { cfa, width: W, height: H, pattern } = c;
  const at = pattern.indexOf(ch);
  const px = at & 1, py = at >> 1;
  const nu = ((W - 1 - px) >> 1) + 1, nv = ((H - 1 - py) >> 1) + 1;
  const plane = new Uint16Array(nu * nv);
  for (let w = 0; w < nv; w++) {
    const row = (py + 2 * w) * W + px;
    for (let u = 0; u < nu; u++) plane[w * nu + u] = cfa[row + 2 * u];
  }
  const Rm = Math.hypot(W, H) / 2;
  const cxm = W / 2, cym = H / 2;
  for (let w = 0; w < nv; w++) {
    const y = py + 2 * w;
    const Y = (y - cym) / Rm;
    for (let u = 0; u < nu; u++) {
      const x = px + 2 * u;
      const X = (x - cxm) / Rm;
      const r = f.k1 + f.k3 * (X * X + Y * Y);
      let fu = u + (f.ax + r * X) * 0.5;
      let fw = w + (f.ay + r * Y) * 0.5;
      if (fu < 0) fu = 0; else if (fu > nu - 1) fu = nu - 1;
      if (fw < 0) fw = 0; else if (fw > nv - 1) fw = nv - 1;
      const u0 = Math.min(nu - 2, fu | 0), w0 = Math.min(nv - 2, fw | 0);
      const du = fu - u0, dw = fw - w0;
      const i = w0 * nu + u0;
      const val = (plane[i] * (1 - du) + plane[i + 1] * du) * (1 - dw) + (plane[i + nu] * (1 - du) + plane[i + nu + 1] * du) * dw;
      cfa[y * W + x] = Math.round(val);
    }
  }
}

/** Moves red and blue onto green on a mosaic, with numbers already measured.
 *
 *  Takes the frame `c`, a Bayer mosaic, and `s`, the `ChromaticShifts` measured
 *  on the SAME frame (decode's own, or the copy that travels with the
 *  photograph to an export). Returns true when any colour was moved, false when
 *  nothing was to be moved or when `s` was measured on a frame of another size,
 *  which it will not apply. `c.cfa` is changed in place.
 *
 *  What the callers rely on: the decode paths and the export's `getSource` read
 *  the same frame from the same file and call this with the same numbers, so
 *  the editing copy and the exported pixels are moved the same way; and it does
 *  not measure, so an export never pays for the estimate again. */
export function alignChannels(c: RawCfa, s: ChromaticShifts): boolean {
  if (c.samples === 3) return false;
  if (s.width !== c.width || s.height !== c.height) return false;
  let moved = false;
  if (s.red?.applied) { alignOne(c, 0, s.red); moved = true; }
  if (s.blue?.applied) { alignOne(c, 2, s.blue); moved = true; }
  return moved;
}

/** Measures a mosaic and moves red and blue onto green, once, at decode.
 *  Takes the frame `c` as `estimateChromatic` does. Returns the measurement
 *  (`ChromaticShifts`), whose `ms` is the time of the whole step; `c.cfa` is
 *  changed in place when the measurement says to move a colour. The caller
 *  stores the result with the photograph (`DecodedImage.chromatic`) so the
 *  export can apply it without measuring again. */
export function alignToGreen(c: RawCfa): ChromaticShifts {
  const t0 = clock();
  const s = estimateChromatic(c);
  alignChannels(c, s);
  s.ms = clock() - t0;
  return s;
}

// What the page last opened, for the report (diagnostic.ts). It is the PAGE
// thread's state: a decode worker's copy of this module never reaches the report,
// so decodeClient.ts notes each result as it arrives.
let last: ChromaticShifts | null = null;

/** Remembers the measurement of the photograph the page just received.
 *  Takes `s`, the photograph's `ChromaticShifts` or undefined for a source that
 *  is not a mosaic. Returns nothing; an undefined `s` leaves what was noted
 *  before, so opening a JPEG does not erase the last raw's figures. */
export function noteChromatic(s: ChromaticShifts | undefined): void {
  if (s) last = s;
}

/** The measurement `noteChromatic` last remembered, or null when this session
 *  has opened no raw. Returns it as stored; the report's line is built from it
 *  and names nothing the reader wrote. */
export function lastChromatic(): ChromaticShifts | null {
  return last;
}
