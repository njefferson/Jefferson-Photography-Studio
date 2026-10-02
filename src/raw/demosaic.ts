// Bayer demosaic + black/white-level normalization -> linear RGB: a binned half-size proxy, and RCD at full resolution.
//
// For the live editing proxy we use 2x2-quad binning: each Bayer quad collapses
// to one linear RGB pixel (R, average of the two greens, B). This demosaics for
// free and halves each dimension (keeping GPU memory sane on the iPad). It is
// NOT free of artefacts: red and blue each come from one photosite, a diagonal
// site apart, so the two channels misregister by about half a proxy pixel at
// every edge (decision 061 measured it on the pylon frames).
//
// Full resolution — the export, and the native-resolution working copy that
// replaces the proxy once it is built — demosaics with RCD, Ratio Corrected
// Demosaicing (Luis Sanz Rodriguez), ported from darktable's
// src/iop/demosaicing/rcd.c, which is that program's default demosaic
// (`demosaicing_method; // $DEFAULT: DT_IOP_DEMOSAIC_RCD`), tiled the way Ingo
// Weyrich tiled it for RawTherapee. It replaced a bilinear 3x3 average of
// same-coloured neighbours, which zippers and puts false colour along every
// edge. As darktable and RawTherapee do, it runs on black-subtracted,
// WHITE-BALANCED photosites ("scale raw RGB channels to balance white and help
// demosaicing", darktable temperature.c; RawTherapee scales colours in its
// preprocess), and the balance is divided back out afterwards, because this
// app applies the reader's white balance later, inside the edit.

import { applyPost, type PostStage } from "./dngOpcodes";

export interface LinearImage {
  width: number;
  height: number;
  /** RGBA float, row-major, linear, normalized to ~0..1 (may exceed 1 at clipping). */
  linear: Float32Array;
}

/** A raw Bayer frame plus the metadata needed to interpret it.
 *
 *  The decoders deliver it already cropped to the picture (a DNG's ActiveArea
 *  and DefaultCrop) and with every per-photosite black level already
 *  subtracted, so `black` is a single number for every reader — 0 whenever the
 *  file's black varied by site, row or column, with `white` then the white
 *  level minus the largest black (DNG 1.7.1.0 chapter 5's scale). */
export interface RawCfa {
  cfa: Uint16Array;
  width: number;
  height: number;
  /** 2x2 color indices [tl,tr,bl,br], 0=R 1=G 2=B, phased from this frame's
   *  own top-left photosite. */
  pattern: number[];
  black: number;
  white: number;
  /** Samples per pixel. Absent (or 1) for a mosaic. 3 for a LinearRaw DNG:
   *  `cfa` then holds R,G,B interleaved per pixel and needs no demosaic, and
   *  `pattern` is unused. */
  samples?: number;
  /** Work done after demosaic, per pixel (a DNG's OpcodeList3, and the
   *  reference-camera matrix of a ForwardMatrix profile whose calibration is
   *  not diagonal). Absent for nearly every file. Plain data: an export worker
   *  receives it. */
  post?: PostStage;
}

/**
 * The half-size editing proxy: each 2x2 Bayer quad becomes one linear RGB pixel.
 *
 * @param cfa     full-frame single-channel sensor values
 * @param width   the frame's width in photosites
 * @param height  the frame's height in photosites
 * @param pattern 2x2 color indices [tl,tr,bl,br], 0=R 1=G 2=B
 * @param black   black level (subtracted)
 * @param white   white level (maps to 1.0)
 * @returns a LinearImage of floor(width/2) x floor(height/2) RGBA floats, alpha
 *   1, each channel max(0, (v - black) / (white - black)) with the two greens
 *   averaged. Consumers: the decode paths (nef.ts, dngRaw.ts) hand it to the
 *   renderer as the working copy, and the at-open automatics measure it, so
 *   its scale must be the same normalised linear one the full-resolution
 *   demosaic below produces.
 */
export function demosaicBinned(
  cfa: Uint16Array,
  width: number,
  height: number,
  pattern: number[],
  black: number,
  white: number,
): LinearImage {
  const ow = width >> 1;
  const oh = height >> 1;
  const out = new Float32Array(ow * oh * 4);
  const scale = 1 / Math.max(1, white - black);
  // Where each color sits in the 2x2 quad (indices 0..3 = tl,tr,bl,br).
  const quadOffset = [0, 1, width, width + 1];
  const rPos = pattern.indexOf(0);
  const bPos = pattern.indexOf(2);
  const gPos: number[] = [];
  for (let i = 0; i < 4; i++) if (pattern[i] === 1) gPos.push(i);

  const norm = (v: number) => Math.max(0, (v - black) * scale);

  for (let y = 0; y < oh; y++) {
    for (let x = 0; x < ow; x++) {
      const base = (y * 2) * width + x * 2;
      const r = norm(cfa[base + quadOffset[rPos]]);
      const b = norm(cfa[base + quadOffset[bPos]]);
      const g = (norm(cfa[base + quadOffset[gPos[0]]]) + norm(cfa[base + quadOffset[gPos[1]]])) * 0.5;
      const o = (y * ow + x) * 4;
      out[o] = r;
      out[o + 1] = g;
      out[o + 2] = b;
      out[o + 3] = 1;
    }
  }
  return { width: ow, height: oh, linear: out };
}

/** A COARSE POINT ESTIMATE, NOT THE EXPORT'S PIXELS: bilinear, the average of
 *  the same-coloured neighbours in the 3x3 window around (x, y).
 *
 *  Takes the frame `c`, an integer pixel `x`, `y` (clamped to the frame), and
 *  `out`, into which it writes linear camera R, G, B on the same scale as the
 *  RCD tiles; returns nothing. The native channel is the photosite itself.
 *
 *  It stays for one job: the export's coarse maps (clarity and dehaze, glow)
 *  read one pixel every 20 to 30, then blur over 3% of the frame. RCD has no
 *  single-pixel form — every value needs a tile worked through four stages —
 *  so a map grid that dense would cost a whole-frame RCD per map, in every
 *  worker, for numbers the blur then averages away. The preview builds the same
 *  maps from its binned copy. Every pixel the export SAVES comes from
 *  `makeDemosaicSampler`; this must never be used for those.
 *
 *  WHY THERE ARE TWO OF THESE. An export of a 21-megapixel raw calls this once
 *  per source pixel, and the version above allocated an array AND TWO CLOSURES
 *  on every one of those calls — sixty-odd million short-lived objects for one
 *  photograph. The arithmetic below is character for character what it was; the
 *  only change is where the numbers are put and that `at` and `colorAt` are
 *  written out rather than built per call. Proven by hashing the exported
 *  file: identical bytes, measurably less time.
 *
 *  @param c    the frame (a mosaic, or a 3-sample LinearRaw frame, read as is).
 *  @param x    the pixel's column in the frame.
 *  @param y    its row.
 *  @param out  receives the camera-native linear R,G,B, 1.0 = the frame's white.
 *  @returns nothing; `out` holds the pixel, after the frame's after-demosaic
 *    stage (`c.post`) when it has one. Every full-resolution consumer — the
 *    export, the native-resolution rebuild — reads pixels only through this,
 *    so it must agree with the binned preview's colour and levels.
 *
 *  At the border the neighbour is read by REFLECTION, not clamping: the colour
 *  is chosen by the neighbour's position, so the photosite read must be one of
 *  that colour, and clamping -1 to 0 read the other parity (decision 061). */
export function demosaicPixelLinearInto(c: RawCfa, x: number, y: number, out: { [i: number]: number }): void {
  const { cfa, width, height, pattern, black, white } = c;
  const scale = 1 / Math.max(1, white - black);
  if (c.samples === 3) {
    // A LinearRaw DNG is already demosaiced: the pixel is read, not built.
    const cx0 = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy0 = y < 0 ? 0 : y >= height ? height - 1 : y;
    const i = (cy0 * width + cx0) * 3;
    out[0] = Math.max(0, (cfa[i] - black) * scale);
    out[1] = Math.max(0, (cfa[i + 1] - black) * scale);
    out[2] = Math.max(0, (cfa[i + 2] - black) * scale);
    if (c.post) applyPost(c.post, cx0, cy0, out);
    return;
  }
  for (let ch = 0; ch < 3; ch++) {
    if (pattern[(y & 1) * 2 + (x & 1)] === ch) {
      const cx0 = x < 0 ? 0 : x >= width ? width - 1 : x;
      const cy0 = y < 0 ? 0 : y >= height ? height - 1 : y;
      out[ch] = Math.max(0, (cfa[cy0 * width + cx0] - black) * scale);
      continue;
    }
    let sum = 0;
    let n = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const xx = x + dx, yy = y + dy;
        if (pattern[(yy & 1) * 2 + (xx & 1)] === ch) {
          const cx = xx < 0 ? -xx : xx >= width ? 2 * (width - 1) - xx : xx;
          const cy = yy < 0 ? -yy : yy >= height ? 2 * (height - 1) - yy : yy;
          sum += Math.max(0, (cfa[cy * width + cx] - black) * scale);
          n++;
        }
      }
    }
    out[ch] = n ? sum / n : 0;
  }
  if (c.post) applyPost(c.post, x, y, out);
}

// ---------------------------------------------------------------------------
// RCD, in tiles.
//
// darktable computes RCD on overlapping tiles and keeps only each tile's
// interior: "The calculated data at the tiling borders RCD_BORDER must be 10 to
// be stable" (rcd.c). Every stage reads at most four photosites away and the
// stages chain, so a pixel nearer a tile's edge than ten sites depends on data
// the tile does not hold. Here the interior is 64 x 64, so a tile reads 84 x 84.
//
// THE FRAME EDGE IS REFLECTED, NOT CLAMPED. darktable fills the outermost nine
// pixels of the frame from its PPG demosaic instead. Reflecting the photosite
// grid about the edge row and column (-1 -> 1, width -> width - 2) keeps every
// site's colour, because a reflection about a site moves it by an even number of
// sites — the same reason the bilinear demosaic this replaced had to reflect
// (decision 061: clamping read the other parity and drew a line of the wrong
// colour along all four edges of every export). So RCD runs to the edge.

const RCD_BORDER = 10;
const RCD_SHIFT = 6;
/** The side of a tile's interior, in pixels: what one tile computation yields. */
export const DEMOSAIC_TILE = 1 << RCD_SHIFT;
const RCD_TS = DEMOSAIC_TILE + 2 * RCD_BORDER;
const RCD_N = RCD_TS * RCD_TS;
const RCD_EPS = 1e-5;
const RCD_EPSSQ = 1e-10;
/** Bytes one cached tile holds: 64 x 64 pixels of three float32 channels. */
const TILE_BYTES = DEMOSAIC_TILE * DEMOSAIC_TILE * 3 * 4;
/** Bytes of one RCD workspace (the arrays `makeRcdWorkspace` allocates). */
const RCD_WORKSPACE_BYTES = (RCD_N * 6.5 + 3 * (RCD_TS - 8) + RCD_TS) * 4 + RCD_TS * 2 * 4;

/** The scratch arrays one RCD tile computation needs, allocated once and reused
 *  for every tile so that a frame of five thousand tiles makes no garbage. */
export interface RcdWorkspace {
  cfa: Float32Array;
  rgb: Float32Array;
  vh: Float32Array;
  /** P/Q diagonal direction, and before that the low-pass filter: no stage
   *  uses both, so darktable shares the buffer and so does this. */
  pq: Float32Array;
  phpf: Float32Array;
  qhpf: Float32Array;
  bufV: Float32Array;
  bufH: Float32Array;
  xs: Int32Array;
  ys: Int32Array;
}

/** A fresh workspace for `demosaicTileInto`. Takes nothing. Returns arrays
 *  sized for one 84 x 84 RCD tile, about 190 KB in all; nothing in them carries
 *  over between tiles, because `demosaicTileInto` clears what it reads before
 *  each one, so one workspace serves any number of tiles of any frame. */
export function makeRcdWorkspace(): RcdWorkspace {
  return {
    cfa: new Float32Array(RCD_N),
    rgb: new Float32Array(3 * RCD_N),
    vh: new Float32Array(RCD_N),
    pq: new Float32Array(RCD_N >> 1),
    phpf: new Float32Array(RCD_N >> 1),
    qhpf: new Float32Array(RCD_N >> 1),
    bufV: new Float32Array(3 * (RCD_TS - 8)),
    bufH: new Float32Array(RCD_TS),
    xs: new Int32Array(RCD_TS),
    ys: new Int32Array(RCD_TS),
  };
}

const balances = new WeakMap<RawCfa, Float32Array>();

/** THE WHITE BALANCE THE DEMOSAIC RUNS UNDER, from the photosites themselves.
 *
 *  Takes the frame `c`. Returns three multipliers [R, G, B], each in (0, 1],
 *  the largest exactly 1: gray-world, the mean photosite of each colour after
 *  black subtraction (over one row pair in four), inverted and scaled so the
 *  dimmest channel keeps its level. Cached per frame object.
 *
 *  WHY FROM THE DATA, AND NOT THE CAMERA'S OR THE READER'S. On these files the
 *  camera's recorded balance is a 5200 K placeholder, not a measurement
 *  (IR-SCIENCE.md section 3), and developing at it puts green at zero — RCD's
 *  ratios would then divide by a channel with nothing in it. The reader's
 *  balance moves with a slider, and the demosaic is built once, for the
 *  native-resolution working copy as well as the export, so a balance that
 *  depended on it would make the two disagree after every change. Gray-world on
 *  the photosites is the estimator the app opens with, it belongs to the file,
 *  and every path that demosaics the same frame gets the same numbers.
 *
 *  What depends on it: `demosaicTileInto` multiplies each photosite by its
 *  colour's value before RCD and divides the result by it afterwards, so the
 *  values must be positive and finite. A frame with a channel at zero comes
 *  back unbalanced, [1, 1, 1]. */
export function demosaicBalance(c: RawCfa): Float32Array {
  const hit = balances.get(c);
  if (hit) return hit;
  const { cfa, width, height, pattern, black } = c;
  const sum = [0, 0, 0];
  const cnt = [0, 0, 0];
  // One row PAIR in four, so both rows of the mosaic are always counted: a
  // quarter of the photosites, millions on any real frame, at a quarter of the
  // pass — it runs before the first tile of the editor's banded build, where a
  // whole-frame pass would be a stall the slicing exists to prevent.
  for (let y = 0; y < height; y += (y & 1) ? 7 : 1) {
    const c0 = pattern[(y & 1) * 2], c1 = pattern[(y & 1) * 2 + 1];
    let s0 = 0, s1 = 0;
    const row = y * width;
    for (let x = 0; x < width; x += 2) {
      const a = cfa[row + x] - black;
      if (a > 0) s0 += a;
      if (x + 1 < width) {
        const b = cfa[row + x + 1] - black;
        if (b > 0) s1 += b;
      }
    }
    sum[c0] += s0; cnt[c0] += (width + 1) >> 1;
    sum[c1] += s1; cnt[c1] += width >> 1;
  }
  const mean = sum.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
  const mul = new Float32Array([1, 1, 1]);
  if (mean.every((m) => m > 0 && Number.isFinite(m))) {
    const lo = Math.min(mean[0], mean[1], mean[2]);
    for (let i = 0; i < 3; i++) mul[i] = lo / mean[i];
  }
  balances.set(c, mul);
  return mul;
}

/** Reflect a coordinate into [0, n) about the first and last site, keeping its
 *  parity, so the photosite read has the colour its position names. */
function reflect(v: number, n: number): number {
  if (n <= 1) return 0;
  const p = 2 * (n - 1);
  v %= p;
  if (v < 0) v += p;
  return v < n ? v : p - v;
}

/** RCD ONE TILE: the 64 x 64 pixels whose top-left is (tx * 64, ty * 64).
 *
 *  Takes the frame `c`, its balance `mul` from `demosaicBalance`, the tile's
 *  column `tx` and row `ty` in tile units, a workspace `ws` from
 *  `makeRcdWorkspace`, and a destination `dst` written from float `dstOff`
 *  onward as 64 rows of 64 pixels of three floats, row-major, whatever part of
 *  the tile lies outside the frame included (those pixels are computed from the
 *  reflected grid and are the caller's to ignore). Returns nothing.
 *
 *  Each pixel is linear camera RGB on the same scale `demosaicBinned` uses —
 *  max(0, (v - black) / (white - black)) — non-negative, and exactly that value
 *  in the channel the photosite itself measured, so the native samples pass
 *  through untouched. Every other value is RCD's, computed on the balanced
 *  photosites and divided back by the balance. The result is a function of the
 *  frame and the tile's position only — no state survives from one tile to the
 *  next — so a tile computed twice, or in any order, comes out identical, which
 *  the tile cache in `makeDemosaicSampler` and the banded build both rely on.
 *
 *  The arithmetic is darktable's rcd.c step for step, including its packed
 *  half-width indexing of the low-pass and diagonal arrays. */
export function demosaicTileInto(c: RawCfa, mul: Float32Array, tx: number, ty: number, ws: RcdWorkspace, dst: Float32Array, dstOff: number): void {
  const TS = RCD_TS, N = RCD_N;
  const w1 = TS, w2 = 2 * TS, w3 = 3 * TS, w4 = 4 * TS;
  const { cfa: raw, width: W, height: H, pattern, black, white } = c;
  const scale = 1 / Math.max(1, white - black);
  const { cfa, rgb, vh, pq, phpf, qhpf, bufV, bufH, xs, ys } = ws;
  const lpf = pq;
  const ox = (tx << RCD_SHIFT) - RCD_BORDER;
  const oy = (ty << RCD_SHIFT) - RCD_BORDER;
  const fc = (row: number, col: number): number => pattern[(((row + oy) & 1) << 1) | ((col + ox) & 1)];
  const G = N;
  const clip = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const sqr = (v: number) => v * v;

  rgb.fill(0); vh.fill(0); pq.fill(0); phpf.fill(0); qhpf.fill(0);
  for (let i = 0; i < TS; i++) {
    xs[i] = reflect(ox + i, W);
    ys[i] = reflect(oy + i, H);
  }

  // Step 0: fill the tile with balanced, non-negative photosites. Like rcd.c,
  // the value goes into cfa and into BOTH colour planes this row carries; the
  // one that is not native here is overwritten by the steps below.
  for (let row = 0; row < TS; row++) {
    const c0 = fc(row, 0), c1 = fc(row, 1);
    const m0 = mul[c0], m1 = mul[c1];
    const src = ys[row] * W;
    const p0 = c0 * N, p1 = c1 * N;
    for (let col = 0, indx = row * TS; col < TS; col++, indx++) {
      const a = (raw[src + xs[col]] - black) * scale;
      const v = (a > 0 ? a : 0) * (col & 1 ? m1 : m0);
      cfa[indx] = v;
      rgb[p0 + indx] = v;
      rgb[p1 + indx] = v;
    }
  }

  // STEP 1: vertical and horizontal interpolation directions.
  const VW = TS - 8;
  for (let row = 3; row < Math.min(TS - 3, 5); row++) {
    const vb = (row - 3) * VW;
    for (let col = 4, indx = row * TS + col; col < TS - 4; col++, indx++) {
      bufV[vb + col - 4] = sqr((cfa[indx - w3] - cfa[indx - w1] - cfa[indx + w1] + cfa[indx + w3]) - 3 * (cfa[indx - w2] + cfa[indx + w2]) + 6 * cfa[indx]);
    }
  }
  let v0 = 0, v1 = VW, v2 = 2 * VW;
  for (let row = 4; row < TS - 4; row++) {
    for (let col = 3, indx = row * TS + col; col < TS - 3; col++, indx++) {
      bufH[col - 3] = sqr((cfa[indx - 3] - cfa[indx - 1] - cfa[indx + 1] + cfa[indx + 3]) - 3 * (cfa[indx - 2] + cfa[indx + 2]) + 6 * cfa[indx]);
    }
    for (let col = 4, indx = (row + 1) * TS + col; col < TS - 4; col++, indx++) {
      bufV[v2 + col - 4] = sqr((cfa[indx - w3] - cfa[indx - w1] - cfa[indx + w1] + cfa[indx + w3]) - 3 * (cfa[indx - w2] + cfa[indx + w2]) + 6 * cfa[indx]);
    }
    for (let col = 4, indx = row * TS + col; col < TS - 4; col++, indx++) {
      const vStat = Math.max(RCD_EPSSQ, bufV[v0 + col - 4] + bufV[v1 + col - 4] + bufV[v2 + col - 4]);
      const hStat = Math.max(RCD_EPSSQ, bufH[col - 4] + bufH[col - 3] + bufH[col - 2]);
      vh[indx] = vStat / (vStat + hStat);
    }
    const t = v0; v0 = v1; v1 = v2; v2 = t;
  }

  // STEP 2: the low-pass filter, at the red and blue sites.
  for (let row = 2; row < TS - 2; row++) {
    for (let col = 2 + (fc(row, 0) & 1), indx = row * TS + col, lp = indx >> 1; col < TS - 2; col += 2, indx += 2, lp++) {
      lpf[lp] = cfa[indx]
        + 0.5 * (cfa[indx - w1] + cfa[indx + w1] + cfa[indx - 1] + cfa[indx + 1])
        + 0.25 * (cfa[indx - w1 - 1] + cfa[indx - w1 + 1] + cfa[indx + w1 - 1] + cfa[indx + w1 + 1]);
    }
  }

  // STEP 3: green at the red and blue sites.
  for (let row = 4; row < TS - 4; row++) {
    for (let col = 4 + (fc(row, 0) & 1), indx = row * TS + col, lp = indx >> 1; col < TS - 4; col += 2, indx += 2, lp++) {
      const cfai = cfa[indx];
      const nGrad = RCD_EPS + Math.abs(cfa[indx - w1] - cfa[indx + w1]) + Math.abs(cfai - cfa[indx - w2]) + Math.abs(cfa[indx - w1] - cfa[indx - w3]) + Math.abs(cfa[indx - w2] - cfa[indx - w4]);
      const sGrad = RCD_EPS + Math.abs(cfa[indx + w1] - cfa[indx - w1]) + Math.abs(cfai - cfa[indx + w2]) + Math.abs(cfa[indx + w1] - cfa[indx + w3]) + Math.abs(cfa[indx + w2] - cfa[indx + w4]);
      const wGrad = RCD_EPS + Math.abs(cfa[indx - 1] - cfa[indx + 1]) + Math.abs(cfai - cfa[indx - 2]) + Math.abs(cfa[indx - 1] - cfa[indx - 3]) + Math.abs(cfa[indx - 2] - cfa[indx - 4]);
      const eGrad = RCD_EPS + Math.abs(cfa[indx + 1] - cfa[indx - 1]) + Math.abs(cfai - cfa[indx + 2]) + Math.abs(cfa[indx + 1] - cfa[indx + 3]) + Math.abs(cfa[indx + 2] - cfa[indx + 4]);
      const lpfi = lpf[lp];
      const nEst = cfa[indx - w1] * (lpfi + lpfi) / (RCD_EPS + lpfi + lpf[lp - w1]);
      const sEst = cfa[indx + w1] * (lpfi + lpfi) / (RCD_EPS + lpfi + lpf[lp + w1]);
      const wEst = cfa[indx - 1] * (lpfi + lpfi) / (RCD_EPS + lpfi + lpf[lp - 1]);
      const eEst = cfa[indx + 1] * (lpfi + lpfi) / (RCD_EPS + lpfi + lpf[lp + 1]);
      const vEst = (sGrad * nEst + nGrad * sEst) / (nGrad + sGrad);
      const hEst = (wGrad * eEst + eGrad * wEst) / (eGrad + wGrad);
      const central = vh[indx];
      const neighbourhood = 0.25 * (vh[indx - w1 - 1] + vh[indx - w1 + 1] + vh[indx + w1 - 1] + vh[indx + w1 + 1]);
      const disc = Math.abs(0.5 - central) < Math.abs(0.5 - neighbourhood) ? neighbourhood : central;
      rgb[G + indx] = clip(disc) * (hEst - vEst) + vEst;
    }
  }

  // STEP 4.0: the P/Q diagonal colour-difference high-pass filters.
  for (let row = 3; row < TS - 3; row++) {
    for (let col = 3, indx = row * TS + col, i2 = indx >> 1; col < TS - 3; col += 2, indx += 2, i2++) {
      phpf[i2] = sqr((cfa[indx - w3 - 3] - cfa[indx - w1 - 1] - cfa[indx + w1 + 1] + cfa[indx + w3 + 3]) - 3 * (cfa[indx - w2 - 2] + cfa[indx + w2 + 2]) + 6 * cfa[indx]);
      qhpf[i2] = sqr((cfa[indx - w3 + 3] - cfa[indx - w1 + 1] - cfa[indx + w1 - 1] + cfa[indx + w3 - 3]) - 3 * (cfa[indx - w2 + 2] + cfa[indx + w2 - 2]) + 6 * cfa[indx]);
    }
  }
  // STEP 4.1: the P/Q diagonal discrimination strength.
  for (let row = 4; row < TS - 4; row++) {
    for (let col = 4 + (fc(row, 0) & 1), indx = row * TS + col, i2 = indx >> 1, i3 = (indx - w1 - 1) >> 1, i4 = (indx + w1 - 1) >> 1; col < TS - 4; col += 2, indx += 2, i2++, i3++, i4++) {
      const pStat = Math.max(RCD_EPSSQ, phpf[i3] + phpf[i2] + phpf[i4 + 1]);
      const qStat = Math.max(RCD_EPSSQ, qhpf[i3 + 1] + qhpf[i2] + qhpf[i4]);
      pq[i2] = pStat / (pStat + qStat);
    }
  }
  // STEP 4.2: red at the blue sites and blue at the red ones.
  for (let row = 4; row < TS - 4; row++) {
    const col0 = 4 + (fc(row, 0) & 1);
    const C = (2 - fc(row, col0)) * N;
    for (let col = col0, indx = row * TS + col, p1 = indx >> 1, p2 = (indx - w1 - 1) >> 1, p3 = (indx + w1 - 1) >> 1; col < TS - 4; col += 2, indx += 2, p1++, p2++, p3++) {
      const central = pq[p1];
      const neighbourhood = 0.25 * (pq[p2] + pq[p2 + 1] + pq[p3] + pq[p3 + 1]);
      const disc = Math.abs(0.5 - central) < Math.abs(0.5 - neighbourhood) ? neighbourhood : central;
      const g0 = rgb[G + indx];
      const nwGrad = RCD_EPS + Math.abs(rgb[C + indx - w1 - 1] - rgb[C + indx + w1 + 1]) + Math.abs(rgb[C + indx - w1 - 1] - rgb[C + indx - w3 - 3]) + Math.abs(g0 - rgb[G + indx - w2 - 2]);
      const neGrad = RCD_EPS + Math.abs(rgb[C + indx - w1 + 1] - rgb[C + indx + w1 - 1]) + Math.abs(rgb[C + indx - w1 + 1] - rgb[C + indx - w3 + 3]) + Math.abs(g0 - rgb[G + indx - w2 + 2]);
      const swGrad = RCD_EPS + Math.abs(rgb[C + indx - w1 + 1] - rgb[C + indx + w1 - 1]) + Math.abs(rgb[C + indx + w1 - 1] - rgb[C + indx + w3 - 3]) + Math.abs(g0 - rgb[G + indx + w2 - 2]);
      const seGrad = RCD_EPS + Math.abs(rgb[C + indx - w1 - 1] - rgb[C + indx + w1 + 1]) + Math.abs(rgb[C + indx + w1 + 1] - rgb[C + indx + w3 + 3]) + Math.abs(g0 - rgb[G + indx + w2 + 2]);
      const nwEst = rgb[C + indx - w1 - 1] - rgb[G + indx - w1 - 1];
      const neEst = rgb[C + indx - w1 + 1] - rgb[G + indx - w1 + 1];
      const swEst = rgb[C + indx + w1 - 1] - rgb[G + indx + w1 - 1];
      const seEst = rgb[C + indx + w1 + 1] - rgb[G + indx + w1 + 1];
      const pEst = (nwGrad * seEst + seGrad * nwEst) / (nwGrad + seGrad);
      const qEst = (neGrad * swEst + swGrad * neEst) / (neGrad + swGrad);
      rgb[C + indx] = g0 + clip(disc) * (qEst - pEst) + pEst;
    }
  }
  // STEP 4.3: red and blue at the green sites.
  for (let row = 4; row < TS - 4; row++) {
    for (let col = 4 + (fc(row, 1) & 1), indx = row * TS + col; col < TS - 4; col += 2, indx += 2) {
      const central = vh[indx];
      const neighbourhood = 0.25 * (vh[indx - w1 - 1] + vh[indx - w1 + 1] + vh[indx + w1 - 1] + vh[indx + w1 + 1]);
      const disc = clip(Math.abs(0.5 - central) < Math.abs(0.5 - neighbourhood) ? neighbourhood : central);
      const g1 = rgb[G + indx];
      const n1 = RCD_EPS + Math.abs(g1 - rgb[G + indx - w2]);
      const s1 = RCD_EPS + Math.abs(g1 - rgb[G + indx + w2]);
      const wl = RCD_EPS + Math.abs(g1 - rgb[G + indx - 2]);
      const e1 = RCD_EPS + Math.abs(g1 - rgb[G + indx + 2]);
      const gN = rgb[G + indx - w1], gS = rgb[G + indx + w1], gW = rgb[G + indx - 1], gE = rgb[G + indx + 1];
      for (let C = 0; C <= 2 * N; C += 2 * N) {
        const snAbs = Math.abs(rgb[C + indx - w1] - rgb[C + indx + w1]);
        const ewAbs = Math.abs(rgb[C + indx - 1] - rgb[C + indx + 1]);
        const nGrad = n1 + snAbs + Math.abs(rgb[C + indx - w1] - rgb[C + indx - w3]);
        const sGrad = s1 + snAbs + Math.abs(rgb[C + indx + w1] - rgb[C + indx + w3]);
        const wGrad = wl + ewAbs + Math.abs(rgb[C + indx - 1] - rgb[C + indx - 3]);
        const eGrad = e1 + ewAbs + Math.abs(rgb[C + indx + 1] - rgb[C + indx + 3]);
        const nEst = rgb[C + indx - w1] - gN;
        const sEst = rgb[C + indx + w1] - gS;
        const wEst = rgb[C + indx - 1] - gW;
        const eEst = rgb[C + indx + 1] - gE;
        const vEst = (nGrad * sEst + sGrad * nEst) / (nGrad + sGrad);
        const hEst = (eGrad * wEst + wGrad * eEst) / (eGrad + wGrad);
        rgb[C + indx] = g1 + disc * (hEst - vEst) + vEst;
      }
    }
  }

  // The interior, unbalanced: what the rest of the app calls camera RGB.
  const i0 = 1 / mul[0], i1 = 1 / mul[1], i2 = 1 / mul[2];
  for (let ry = 0; ry < DEMOSAIC_TILE; ry++) {
    let o = dstOff + ry * DEMOSAIC_TILE * 3;
    for (let rx = 0, idx = (ry + RCD_BORDER) * TS + RCD_BORDER; rx < DEMOSAIC_TILE; rx++, idx++, o += 3) {
      const r = rgb[idx], g = rgb[G + idx], b = rgb[2 * N + idx];
      dst[o] = (r > 0 ? r : 0) * i0;
      dst[o + 1] = (g > 0 ? g : 0) * i1;
      dst[o + 2] = (b > 0 ? b : 0) * i2;
    }
  }
}

/** HOW MANY TILES THE EXPORT'S DEMOSAIC CACHE HOLDS for a frame of `srcPixels`
 *  photosites. Returns 4 * sqrt(srcPixels) / 64 tiles, plus four: more than
 *  three full rows of tiles across a 3:2 frame (1.22 * sqrt(px) / 64 wide).
 *
 *  Three rows is what the export's access pattern needs and no more. It reads
 *  the source a row at a time, the denoiser's taps reach a dozen rows either
 *  side, and a straightened frame's output row crosses the source on a slant —
 *  so the rows being read at any moment straddle at most two tile rows, and the
 *  slant adds a few tiles at each end. A cache smaller than that recomputes
 *  every tile it needs, round and round, which costs time and never memory.
 *  Consumers: `makeDemosaicSampler` allocates exactly this many, and
 *  `demosaicCacheBytes` bills exactly them, so the two cannot drift. */
function demosaicCacheTiles(srcPixels: number): number {
  return Math.ceil((4 * Math.sqrt(Math.max(0, srcPixels))) / DEMOSAIC_TILE) + 4;
}

/** WHAT ONE EXPORT'S DEMOSAIC HOLDS IN MEMORY, in bytes, for a frame of
 *  `srcPixels` photosites: its tile cache, the table that finds a tile in it,
 *  and its RCD workspace. Returns an upper bound of what `makeDemosaicSampler`
 *  allocates for that frame — about 14 MB at 21 megapixels, 24 MB at 61.
 *
 *  Consumer: the export's worker budget (`perWorkerMb` in exportparallel.ts),
 *  which bills it once per thread, because every worker builds its own sampler
 *  over its own decode. It must never come in under the allocation: a tablet
 *  kills the tab rather than swapping. */
export function demosaicCacheBytes(srcPixels: number): number {
  const tiles = demosaicCacheTiles(srcPixels);
  const px = Math.max(0, srcPixels);
  // The tile-index table holds one int per tile of the frame; bounded for any
  // frame up to 4:1 by the area plus a row and a column of partial tiles.
  const tableBytes = 4 * (Math.ceil(px / (DEMOSAIC_TILE * DEMOSAIC_TILE)) + Math.ceil((3 * Math.sqrt(px)) / DEMOSAIC_TILE) + 1);
  return tiles * (TILE_BYTES + 5) + tableBytes + RCD_WORKSPACE_BYTES;
}

/** A full-resolution demosaic of one pixel, written into `out`: linear camera
 *  RGB, the same scale and the same values as the tiles above. */
export type DemosaicSampler = (x: number, y: number, out: { [i: number]: number }) => void;

/** FULL-RESOLUTION RCD, ONE PIXEL AT A TIME, FOR A CALLER THAT WALKS THE FRAME.
 *
 *  Takes the frame `c`. Returns a sampler: given an integer pixel (x, y) — values
 *  outside the frame are clamped to its edge — it writes that pixel's linear
 *  camera RGB into `out[0..2]`. The values are `demosaicTileInto`'s, so they do
 *  not depend on the order pixels are asked for.
 *
 *  The export's sampler chain (denoise, heal, warp, the local maps) asks for
 *  source pixels one at a time and never holds a frame, and RCD cannot be done
 *  one pixel at a time: each pixel needs a neighbourhood ten sites wide already
 *  worked through four stages. So whole tiles are computed on first touch and
 *  kept in a cache, evicted by a clock (second-chance) sweep, sized by
 *  `demosaicCacheTiles` and billed by `demosaicCacheBytes`. A LinearRaw frame
 *  (`samples` 3) is read through `demosaicPixelLinearInto` instead, and the
 *  frame's `post` stage is applied to every pixel either way. Consumers:
 *  `exportImage` in export.ts, whose row-wise walk keeps the hit rate near one,
 *  and through it every export band a worker runs. */
export function makeDemosaicSampler(c: RawCfa): DemosaicSampler {
  // A LinearRaw frame is already demosaiced: the point reader is exact, and it
  // applies the after-demosaic stage itself.
  if (c.samples === 3) return (x, y, out) => demosaicPixelLinearInto(c, x, y, out);
  const W = c.width, H = c.height;
  const nx = Math.max(1, Math.ceil(W / DEMOSAIC_TILE));
  const ny = Math.max(1, Math.ceil(H / DEMOSAIC_TILE));
  const cap = Math.max(1, Math.min(nx * ny, demosaicCacheTiles(W * H)));
  const per = DEMOSAIC_TILE * DEMOSAIC_TILE * 3;
  const data = new Float32Array(cap * per);
  const slotOf = new Int32Array(nx * ny).fill(-1);
  const keyOf = new Int32Array(cap).fill(-1);
  const ref = new Uint8Array(cap);
  const ws = makeRcdWorkspace();
  const mul = demosaicBalance(c);
  const mask = DEMOSAIC_TILE - 1;
  let hand = 0;
  return (x, y, out) => {
    x = x < 0 ? 0 : x >= W ? W - 1 : x;
    y = y < 0 ? 0 : y >= H ? H - 1 : y;
    const tx = x >> RCD_SHIFT, ty = y >> RCD_SHIFT;
    const key = ty * nx + tx;
    let s = slotOf[key];
    if (s < 0) {
      while (ref[hand]) { ref[hand] = 0; hand = hand + 1 === cap ? 0 : hand + 1; }
      s = hand;
      hand = hand + 1 === cap ? 0 : hand + 1;
      if (keyOf[s] >= 0) slotOf[keyOf[s]] = -1;
      keyOf[s] = key;
      slotOf[key] = s;
      demosaicTileInto(c, mul, tx, ty, ws, data, s * per);
    }
    ref[s] = 1;
    const o = s * per + (((y & mask) << RCD_SHIFT) + (x & mask)) * 3;
    out[0] = data[o];
    out[1] = data[o + 1];
    out[2] = data[o + 2];
    // The frame's after-demosaic stage (a DNG's OpcodeList3, a reference-camera
    // matrix), as the point reader and the binned preview apply it.
    if (c.post) applyPost(c.post, x, y, out);
  };
}
