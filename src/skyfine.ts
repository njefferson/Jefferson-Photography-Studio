// The sky selection refined to the picture's own edges. `buildSkyMask` grows
// a 384 px bitmap and feathers it; the colour-smoothing stage blends chroma
// through it, and a soft edge under a chroma blend is invisible. A DEPTH
// multiplies luma through it, and a soft edge under a luma multiplier is a
// pale rim along every roofline and a halo around every crown — measured on
// two prototypes on 2026-09-18 (IR-SCIENCE.md §4b-iv). This module takes that
// bitmap up to the working copy's scale and snaps it to the photograph's
// edges with a guided filter (He, Sun and Tang, "Guided Image Filtering",
// ECCV 2010 / TPAMI 2013, the field's tool for joint upsampling and mask
// feathering): inside every window the output is a LINEAR FUNCTION OF THE
// GUIDE, so it inherits the guide's edges and keeps the mask's own values
// away from them, and it is O(N) through summed-area tables. The guide is
// THREE channels of the gray-world-balanced linear frame — red share, blue
// share and gamma luma — because no one of them separates a sky from all of
// its neighbours in an infrared frame: IR-bright foliage is as bright as the
// sky (luma alone read the bright sky round a crown as the crown's side and
// left a halo), and pale horizon haze is as neutral as a dark roof (colour
// alone read the haze band above a roofline as roof and left a pale rim).
// With all three, the per-window fit uses whichever separates there — once the
// two colour shares are brought to luma's spread inside `refineSkyMask`; before
// 2026-10-02 one ε sat 16-50 times above their variance at an edge and the fit
// ran on luma alone while this sentence said otherwise. Built
// once per photograph beside the bitmap, sampled bilinearly by the shader
// (u_skyFineTex) and by compileEdit (the brush sampler), never rebuilt per
// edit.

import type { BrushMask } from "./pipeline";
import { linearAt, pinTest, pinFloor, grayWorldFromMeans, type DecodedImage, type SkySelection } from "./decode";
import { buildSkyMask, skyTurn } from "./sky";
import { BRUSH_MAX_EDGE, sampleBrush } from "./pipeline";

/** Working scale cap for the refined mask: its longer edge, in pixels. A
 *  2800 px frame gets 1024, which puts the mask's edge within about three
 *  working pixels of the photograph's — against the 20-odd of the 128-texel
 *  weight the depth rode on in the prototypes. */
export const SKY_FINE_EDGE = 1024;
/** Guided-filter window radius in guide pixels. The bitmap's feathered edge,
 *  upsampled, spans a few tens of these; the window has to reach across that
 *  ramp to pull it to the photograph's edge, and a window wider still lets
 *  the sky's own gradient leak into the fit. */
export const SKY_FINE_RADIUS = 12;
/** Regularisation on the guide's covariance, in LUMA units squared: the colour
 *  shares are scaled to luma's frame spread before the fit (`refineSkyMask`),
 *  so this one ε lands on them at 0.005/k² in their own units, k being luma's
 *  spread over theirs — 39 to 178 on NIR_1651, NIR_1667 and NIR_1376, so
 *  3e-5 to 1.3e-4, under their 9e-5 to 3e-4 variance in a window that straddles
 *  the selection's edge, where the colour has to act. Smaller follows fainter
 *  edges and admits more noise: measured on those three frames, ε 1e-4 in these
 *  units moved edge coverage by at most 1.3 points over 0.005 and raised the
 *  selection's grain in the edge band by 8% to 47% (IR-SCIENCE.md 4b-v). */
export const SKY_FINE_EPS = 0.005;
const REC = [0.2126, 0.7152, 0.0722];

/** The three-channel guide the refinement follows, at the refined mask's
 *  scale: red share and blue share after gray-world balance, and gamma luma
 *  normalised to the frame's own bright end. */
export interface SkyGuide {
  w: number;
  h: number;
  /** Red share R/(R+G+B). */
  r: Float32Array;
  /** Blue share B/(R+G+B). */
  b: Float32Array;
  /** Gamma luma, 0..1 against the frame's 99.5th percentile. */
  l: Float32Array;
}

/**
 * Build the guide for `refineSkyMask` from the photograph's linear pixels.
 * @param sample  linear camera-native RGB at full-res image pixel (x, y) — the
 *                same sampler buildSkyMask reads.
 * @param srcW,srcH  full image dimensions.
 * @param wb  the gray-world gains buildSkyMask used (auto, never the live edit,
 *            so the guide does not move as the photograph is graded).
 * @returns the guide at the refined scale (longer edge SKY_FINE_EDGE or the
 *   image's own if smaller), each guide pixel the box mean of its source block.
 * What the result must satisfy: every channel is finite and within 0..1 at
 * every pixel, and `w`/`h` are what `refineSkyMask` sizes its output to — a
 * guide from one photograph must never be used to refine another's bitmap.
 */
export function buildSkyGuide(
  sample: (x: number, y: number) => ArrayLike<number>,
  srcW: number,
  srcH: number,
  wb: [number, number, number],
): SkyGuide {
  const s = Math.min(1, SKY_FINE_EDGE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * s));
  const h = Math.max(1, Math.round(srcH * s));
  const r = new Float32Array(w * h);
  const b = new Float32Array(w * h);
  const l = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * srcH) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * srcW) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / w));
      let sr = 0, sg = 0, sb = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const q = sample(sx, sy);
        const qr = q[0] * wb[0], qg = q[1] * wb[1], qb = q[2] * wb[2];
        if (!Number.isFinite(qr) || !Number.isFinite(qg) || !Number.isFinite(qb)) continue;
        sr += qr; sg += qg; sb += qb; n++;
      }
      const i = y * w + x;
      if (n === 0) { r[i] = 0; b[i] = 0; l[i] = 0; continue; }
      sr /= n; sg /= n; sb /= n;
      const sum = Math.max(1e-9, Math.max(0, sr) + Math.max(0, sg) + Math.max(0, sb));
      r[i] = Math.min(1, Math.max(0, sr / sum));
      b[i] = Math.min(1, Math.max(0, sb / sum));
      l[i] = Math.pow(Math.max(0, REC[0] * sr + REC[1] * sg + REC[2] * sb), 1 / 2.2);
    }
  }
  // Luma against the frame's own bright end, so a dark frame's edges weigh
  // what a bright one's do against the same eps.
  const sorted = Float32Array.from(l).sort();
  const hi = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.995))] || 1;
  for (let i = 0; i < l.length; i++) l[i] = Math.min(1, l[i] / hi);
  return { w, h, r, b, l };
}

/** A channel's spread across the frame, robustly: 1.4826 × its median absolute
 *  deviation from its median (the normal-consistent MAD), over at most 65,536
 *  evenly strided pixels. Used by `refineSkyMask` to bring the guide's channels
 *  to one range; 0 for a channel that does not vary. */
function robustSpread(a: Float32Array): number {
  const step = Math.max(1, Math.floor(a.length / 65536));
  const t: number[] = [];
  for (let i = 0; i < a.length; i += step) if (Number.isFinite(a[i])) t.push(a[i]);
  if (!t.length) return 0;
  t.sort((x, y) => x - y);
  const m = t[t.length >> 1];
  const d = t.map((v) => Math.abs(v - m)).sort((x, y) => x - y);
  return 1.4826 * d[d.length >> 1];
}

/** Box mean of `src` over a (2r+1)² window clamped at the borders, into `out`,
 *  through a summed-area table held in `sat` (sized (w+1)·(h+1)). */
function boxMean(src: Float32Array, w: number, h: number, r: number, out: Float32Array, sat: Float64Array): void {
  const W1 = w + 1;
  sat.fill(0);
  for (let y = 1; y <= h; y++) {
    let row = 0;
    for (let x = 1; x <= w; x++) {
      row += src[(y - 1) * w + (x - 1)];
      sat[y * W1 + x] = sat[(y - 1) * W1 + x] + row;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(h, y + r + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(w, x + r + 1);
      const sum = sat[y1 * W1 + x1] - sat[y0 * W1 + x1] - sat[y1 * W1 + x0] + sat[y0 * W1 + x0];
      out[y * w + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
}

/** The bitmap's weight at image-uv, bilinear on texel centres with clamped
 *  neighbours — the read the pipeline's brush sampler makes, so the refined
 *  mask starts from the same values the coarse one would have been sampled
 *  at. */
function maskAt(m: BrushMask, u: number, v: number): number {
  const fx = Math.min(1, Math.max(0, u)) * m.w - 0.5;
  const fy = Math.min(1, Math.max(0, v)) * m.h - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  const cx = (i: number) => Math.max(0, Math.min(m.w - 1, i));
  const cy = (i: number) => Math.max(0, Math.min(m.h - 1, i));
  const x0 = cx(ix), x1 = cx(ix + 1), y0 = cy(iy), y1 = cy(iy + 1);
  const s = (x: number, y: number) => m.data[y * m.w + x];
  const top = s(x0, y0) * (1 - tx) + s(x1, y0) * tx;
  const bot = s(x0, y1) * (1 - tx) + s(x1, y1) * tx;
  return (top * (1 - ty) + bot * ty) / 255;
}

/**
 * Refine the coarse sky bitmap to the guide's edges.
 * @param mask  the 384 px feathered bitmap from buildSkyMask (image-uv).
 * @param guide  from buildSkyGuide, for THIS photograph.
 * @param r,eps  the window radius and regularisation (SKY_FINE_RADIUS/EPS).
 * @returns a BrushMask at the guide's size, 0..255, image-uv like the input,
 *   sampled by compileEdit's brush sampler and the shader's u_skyFineTex.
 * What the result must satisfy: the bitmap is read as a HARD selection (its
 * feather cut at half) and the filter grows its own edge from the guide, so
 * away from any guide edge the result is the selection's own value, 0 or 1
 * (a flat window fits a = 0, b = that value), and across a guide edge it
 * steps with the guide — a pixel on the sky side of a roofline keeps the
 * sky's 1 and one across it takes the roof's 0, whatever the feather did.
 * Fed the FEATHERED bitmap instead, the filter kept the feather wherever the
 * window did not reach the edge and, worse, learned the sky's own gradient as
 * "less sky" — the refined sky sloped to 0.85 over the 200 px above a
 * roofline and the depth left a pale band there (rim +0.13, 2026-09-18). A
 * bitmap that selects nothing refines to nothing; the caller's "no sky found"
 * stays true.
 */
export function refineSkyMask(mask: BrushMask, guide: SkyGuide, r = SKY_FINE_RADIUS, eps = SKY_FINE_EPS): BrushMask {
  const { w, h, l: I3 } = guide;
  const n = w * h;
  // THE COLOUR SHARES BROUGHT TO LUMA'S SPREAD before anything is fitted. One ε
  // goes on every channel's variance (He, Sun & Tang, TPAMI 2013 eq. 19:
  // Σ_k + εU, U the identity), which assumes channels that share one range —
  // their colour guide is RGB. These do not: a red or blue share varies 7 to
  // 12 times less than gamma luma across a frame (std 0.019-0.031 against
  // 0.17-0.23), so its variance in a window straddling the selection's edge,
  // 9e-5 to 3e-4, sat 16 to 50 times under the old ε of 0.005, and a channel
  // whose variance is far under ε gets a coefficient near zero ("patches with
  // variance much smaller than ε are smoothed", §3.2). The filter ran on luma
  // alone while this file said it used whichever channel separates. Scaled
  // here, inside the filter, so the guide keeps its own units for the grow
  // (skyGrowKey, skyGrowGradient), which reads them as shares.
  const sl = Math.max(1e-3, robustSpread(I3));
  const scaled = (a: Float32Array): Float32Array => {
    const k = sl / Math.max(1e-6, robustSpread(a));
    const o = new Float32Array(n);
    for (let i = 0; i < n; i++) o[i] = a[i] * k;
    return o;
  };
  const I1 = scaled(guide.r), I2 = scaled(guide.b);
  const p = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = maskAt(mask, (x + 0.5) / w, (y + 0.5) / h) >= 0.5 ? 1 : 0;
  const sat = new Float64Array((w + 1) * (h + 1));
  const tmp = new Float32Array(n);
  const mean = (src: Float32Array) => { const o = new Float32Array(n); boxMean(src, w, h, r, o, sat); return o; };
  const prod = (a: Float32Array, b: Float32Array) => { for (let i = 0; i < n; i++) tmp[i] = a[i] * b[i]; return mean(tmp); };
  const m1 = mean(I1), m2 = mean(I2), m3 = mean(I3), mp = mean(p);
  const c11 = prod(I1, I1), c22 = prod(I2, I2), c33 = prod(I3, I3);
  const c12 = prod(I1, I2), c13 = prod(I1, I3), c23 = prod(I2, I3);
  const c1p = prod(I1, p), c2p = prod(I2, p), c3p = prod(I3, p);
  // Per-window linear fit q = a·I + b: a from the 3x3 covariance (eps on the
  // diagonal) by the adjugate, b from the means. Written back over the
  // correlation buffers, which are not read again.
  const a1 = c11, a2 = c22, a3 = c33, b = c12;
  for (let i = 0; i < n; i++) {
    const v11 = c11[i] - m1[i] * m1[i] + eps, v22 = c22[i] - m2[i] * m2[i] + eps, v33 = c33[i] - m3[i] * m3[i] + eps;
    const v12 = c12[i] - m1[i] * m2[i], v13 = c13[i] - m1[i] * m3[i], v23 = c23[i] - m2[i] * m3[i];
    const k1 = c1p[i] - m1[i] * mp[i], k2 = c2p[i] - m2[i] * mp[i], k3 = c3p[i] - m3[i] * mp[i];
    const A11 = v22 * v33 - v23 * v23, A12 = v13 * v23 - v12 * v33, A13 = v12 * v23 - v13 * v22;
    const A22 = v11 * v33 - v13 * v13, A23 = v12 * v13 - v11 * v23, A33 = v11 * v22 - v12 * v12;
    const det = v11 * A11 + v12 * A12 + v13 * A13;
    let x1 = 0, x2 = 0, x3 = 0;
    if (det > 1e-15) {
      x1 = (A11 * k1 + A12 * k2 + A13 * k3) / det;
      x2 = (A12 * k1 + A22 * k2 + A23 * k3) / det;
      x3 = (A13 * k1 + A23 * k2 + A33 * k3) / det;
    }
    const B = mp[i] - x1 * m1[i] - x2 * m2[i] - x3 * m3[i];
    a1[i] = x1; a2[i] = x2; a3[i] = x3; b[i] = B;
  }
  const ma1 = mean(a1), ma2 = mean(a2), ma3 = mean(a3), mb = mean(b);
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const q = ma1[i] * I1[i] + ma2[i] * I2[i] + ma3[i] * I3[i] + mb[i];
    data[i] = Math.round(255 * Math.min(1, Math.max(0, Number.isFinite(q) ? q : 0)));
  }
  return { w, h, data };
}

/** Everything the selection is built from, at SKY_FINE_EDGE on the long
 *  edge: linear RGB after gray-world balance is NOT applied here (the gains
 *  ride separately, as buildSkyMask wants them), the camera matrix and the
 *  full-size dimensions the bitmap's uv refers to. Small enough to keep after
 *  the decode's own buffer has been transferred away. */
export interface SkySource {
  w: number;
  h: number;
  /** Linear RGB, interleaved, w*h*3. */
  rgb: Float32Array;
  /** 1 where the cell's source block holds a sensor-clipped pixel (decode.ts
   *  pinTest, read before the lens flat), 0 elsewhere; w*h. The gray-world
   *  balance the selection is built at leaves those cells out, as LibRaw's
   *  auto white balance drops any block holding a clipped photosite.
   *
   *  ABSENT FOR AN 8-BIT SOURCE, which then counts every cell, and that is
   *  deliberate rather than a gap: a pin is a fact about a SENSOR, and a camera
   *  JPEG's 255 is the camera's own rendering of a bright area, not a recording
   *  that stopped. Leaving those cells out of an infrared JPEG's balance (10.5%
   *  of NIR_1597's cells, its blown foliage) raised the balance's green and blue
   *  gains by 69% and 55%, and the lens hotspot's pale centre, the sky's least
   *  coloured part, fell out of the selection: under Aerochrome a dark blob in
   *  the sky, from 95d8ea7 (which began treating an 8-bit 255 as clipped) until
   *  this copy stopped flagging it. Also absent on a copy taken before this
   *  existed. */
  clip?: Uint8Array;
  srcW: number;
  srcH: number;
  cam: number[] | null;
  /** Which edge is up (sky.ts `skyTurn`, 0..3). The selection is seeded from
   *  the edge this puts at the top, so it is part of what the selection IS. */
  turn: number;
}

/**
 * Take the small copy the selection is built from.
 * @param img  the decoded photograph, its buffers still present.
 * @param turn  which edge is up, as sky.ts `skyTurn` gives it; omitted, the
 *   file's own turn (`img.rotate`), which is how a photograph opens.
 * @returns a SkySource at SKY_FINE_EDGE on the long edge, each pixel the box
 *   mean of its source block, read straight from the linear buffer when there
 *   is one and through `linearAt` otherwise, carrying `turn`, and, for a
 *   source with a linear copy (a raw's sensor values) only, a `clip` flag on
 *   every cell whose block holds a pixel `pinTest` calls clipped. An 8-bit
 *   source gets none (see `SkySource.clip` for why) and is not tested at all,
 *   which also spares a 20-megapixel JPEG a closure call per pixel.
 * What the result must satisfy: it is complete before the decode's buffer is
 * transferred — the worker calls this first and posts the picture second —
 * and it carries enough for `buildSkySelectionFrom` to need nothing else,
 * including the turn: a copy taken at one turn builds that turn's sky. A raw's
 * copy is unchanged by the 8-bit rule (same cells, same `clip`); a source with
 * no linear copy carries none.
 */
export function prepareSkySource(img: DecodedImage, turn = img.rotate ?? 0): SkySource {
  const { width: srcW, height: srcH } = img;
  const sc = Math.min(1, SKY_FINE_EDGE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * sc)), h = Math.max(1, Math.round(srcH * sc));
  const rgb = new Float32Array(w * h * 3);
  const lin = img.linear;
  const clip = lin ? new Uint8Array(w * h) : null;
  const pinned = pinTest(img);
  const fl = pinFloor(img); // below it on every channel, pinTest is known to say no
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * srcH) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * srcW) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / w));
      let r = 0, g = 0, b = 0, n = 0, c = 0;
      if (lin) {
        for (let sy = y0; sy < y1; sy++) { let o = (sy * srcW + x0) * 4; for (let sx = x0; sx < x1; sx++, o += 4) { const pr = lin[o], pg = lin[o + 1], pb = lin[o + 2]; if (pr === pr && pg === pg && pb === pb) { r += pr; g += pg; b += pb; n++; if (!c && (pr >= fl || pg >= fl || pb >= fl) && pinned(sx, sy)) c = 1; } } }
      } else {
        for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) { const q = linearAt(img, sx, sy); r += q[0]; g += q[1]; b += q[2]; n++; }
      }
      const o = (y * w + x) * 3;
      if (n) { rgb[o] = r / n; rgb[o + 1] = g / n; rgb[o + 2] = b / n; }
      if (clip) clip[y * w + x] = c;
    }
  }
  return clip
    ? { w, h, rgb, clip, srcW, srcH, cam: img.camMatrix ?? null, turn: skyTurn(turn) }
    : { w, h, rgb, srcW, srcH, cam: img.camMatrix ?? null, turn: skyTurn(turn) };
}

/** WIRES, PYLON MEMBERS, ROOF FITTINGS AND CROWN TIPS ARE TAKEN OUT OF THE LOOK'S
 *  SELECTION (decision 087). The selection holds a wire at full weight, so the sky
 *  stages colour it: Sky saturation triples the colour the foliage band gave it (a
 *  full red wire), and the sky map averages a tap that lands on it into the sky round
 *  it (the soft discs). A wire is not sky, and is the shape the selection cannot see:
 *  it is narrower than the window the guided filter fits.
 *  The test is the one image morphology gives for lines. A closing (maximum, then
 *  minimum, over a square element) fills a dark feature narrower than the element and
 *  an opening fills a bright one, so the closing minus the picture, or the picture
 *  minus its opening, is large on a line and zero on an edge or on a region wider
 *  than the element, and a long thin line cannot contain a square element. Cloud edges
 *  are steps, and cloud is wider than the element, so neither is touched.
 *  The four numbers, and what each rests on and how far each can move before the
 *  result does, are in decision 087 (its Context, Looked at and Option 6). In short:
 *  the element is 2·SKY_THIN_RADIUS+1 = 11 grid pixels, 1.07% of the long edge, wider
 *  than the structures it is for with the margin the half size binning and the lens
 *  soften an edge by (decision 061); the contrast is read against the frame's own 95th
 *  percentile of luminance, so a dark frame and a bright one are judged alike, and a
 *  structure counts from SKY_THIN_LO of it and in full from SKY_THIN_HI; and the margin
 *  FADES over SKY_THIN_SPREAD + 1 grid pixels round what counts (`coneSpread`), because
 *  what a structure leaks into the pixels beside it fades with distance. All of them
 *  are scaled by the grid's longest edge over SKY_FINE_EDGE, so a photograph smaller
 *  than the grid is judged at the same fraction of its frame.
 *  WHAT CHANGED ON 2026-10-14 AND WHY (decision 087, Option 6). The ramp ran from 0.05
 *  to 0.12 and the margin was a 5 by 5 square of the largest value near it. On the
 *  frames read that took the sky out of a lattice's gaps and left blocky blue islands
 *  where a few pixels of gap survived (the square), turned thin cirrus grey (a bright
 *  streak whose response sits at 0.05 to 0.16 of the scale, the very band the ramp
 *  began in) and put a pale rim round every leaf and crown (the same margin, round the
 *  dark slivers of sky the dark half finds between bright leaves). A wire over open sky
 *  responds at 0.05 to 0.07 at this grid, the same band, and does not need the guard:
 *  the saturation stage's second gate (decision 073) takes the boost off its colour and
 *  the robust sky map (decision 069) keeps its taps out of the sky's colour. So a thin
 *  response only counts from SKY_THIN_LO, the old ramp's end, and counts in full from
 *  SKY_THIN_HI, above anything thin cloud reached on the frames read and under what a
 *  lattice's members reach. The ramp and the fading margin are the fine selection's
 *  only: the coarse bitmap the sky map is weighted by is cut hard (`subtractThin`) and
 *  by a stricter test, SKY_PLAIN_LO below (decision 087, Option 12). */
export const SKY_THIN_RADIUS = 5;
export const SKY_THIN_SPREAD = 2;
export const SKY_THIN_LO = 0.12;
export const SKY_THIN_HI = 0.25;
/** THE MAP IS BUILT FROM PLAIN SKY ONLY (decision 087, Option 12). The sky colour map is
 *  an estimate of the sky's own colour, and an estimate is taken from the pixels known to
 *  be sky and not from the band where the picture is uncertain: the trimap of image
 *  matting keeps the colour samples to the definite region and leaves the band between
 *  regions to the matte. So the coarse bitmap the map is weighted by is cut, beside
 *  wherever a structure is (SKY_THIN_LO), wherever the sky stops being plain: a window of
 *  the element's own size in which at least SKY_PLAIN_SHARE of the pixels stand out from
 *  their surroundings by more than SKY_PLAIN_LO of the frame's own scale. 0.05 sits 6 to
 *  12 robust sigmas above the held sky's own response (median 0.004 to 0.007 on six
 *  frames, IR-SCIENCE 9t), the figure the removal began at on 2026-10-13; the window is
 *  the element, the scale a structure is measured at; and the share is a majority, the
 *  same structural constant as the map's own five of nine. The per-pixel selection does
 *  not use it (SKY_THIN_LO and SKY_THIN_HI do), because a per-pixel weight that followed
 *  every feature left grey between a lattice's members and turned thin cirrus grey. What
 *  it is for: out-of-focus leaves respond at 0.05 to 0.12 and the selection holds them
 *  as sky, so a map built from the taps that land on them pulled the sky stages' colour
 *  onto them (a teal leaf, a pink disc in a gap between leaves); and why a share and not
 *  every feature: a cut at every feature left holes in thin cloud, which the smoothing
 *  stage draws as pale patches round them (NIR_1651).
 *  AND ONLY A PIECE THAT HOLDS A DEFINITE STRUCTURE COUNTS (decision 087, Option 17). Thin
 *  cloud's own texture responds 0.06 to 0.15 of the scale and passes the share test in
 *  58 to 82 percent of an element window, so the cut above still cut holes in it, and the
 *  per-pixel selection holds the cloud, so the saturation stage multiplied the colour a
 *  hole left unsmoothed into cyan streaks and rimmed patches (NIR_1651, NIR_1716,
 *  NIR_1824). Out-of-focus foliage and structures sit in connected pieces that reach
 *  SKY_THIN_HI (0.48 to 1.24 on the frames read); thin cloud's pieces peak at 0.06 to 0.20.
 *  So the flag keeps a connected piece only when some pixel of it reaches SKY_THIN_HI
 *  (`keepStrongPieces`, hysteresis thresholding by connection), and clears the rest. */
export const SKY_PLAIN_LO = 0.05;
export const SKY_PLAIN_SHARE = 0.5;
/** WHETHER `buildSkySelectionFrom` TAKES THE THIN STRUCTURES OUT OF THE SELECTION AT ALL
 *  (route B, Options 6, 12 and 17 of decision 087, with `thinFlags`, `keepStrongPieces`,
 *  `coneSpread` and `subtractThin`). False since 2026-10-17 (decision 087, Outcome): the
 *  removal cleaned wires, pylon members and roof fittings that Sky saturation had painted,
 *  and the smoothing's discs beside them, and no built-in look carries those two stages any
 *  more, so the selection is again the one of the build before 2026-10-14. The functions stay
 *  in this file, switched off, for a later plan. What it must satisfy: every path that builds
 *  the selection goes through `buildSkySelectionFrom`, so the sky worker, the page, the decode
 *  worker's bitmaps, the strip's tiles and the export all hold the same selection with it off,
 *  as they did with it on. */
export const SKY_THIN_REMOVAL = false;

/** Maximum (or minimum) filter over a square element, separable.
 *  @param a  one value per pixel, w by h.
 *  @param w,h  its size.
 *  @param R  the element's half width in pixels; the element is 2R+1 wide.
 *  @param isMax  true for the maximum, false for the minimum.
 *  @returns a new array of the same size whose each pixel is the extreme of `a` over
 *  the element centred on it, clamped at the borders. What it must satisfy: with
 *  isMax it is never below `a`, and without it never above. */
function squareFilter(a: Float32Array, w: number, h: number, R: number, isMax: boolean): Float32Array {
  const t = new Float32Array(w * h), o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let m = a[y * w + x];
      const x1 = Math.min(w - 1, x + R);
      for (let k = Math.max(0, x - R); k <= x1; k++) { const v = a[y * w + k]; if (isMax ? v > m : v < m) m = v; }
      t[y * w + x] = m;
    }
  }
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - R), y1 = Math.min(h - 1, y + R);
    for (let x = 0; x < w; x++) {
      let m = t[y * w + x];
      for (let k = y0; k <= y1; k++) { const v = t[k * w + x]; if (isMax ? v > m : v < m) m = v; }
      o[y * w + x] = m;
    }
  }
  return o;
}

/**
 * Spread an array's values outward with a margin that fades (decision 087, Option 6).
 * @param a  one value per pixel, 0 to 1, w by h.
 * @param w,h  its size.
 * @param S  the margin's radius in pixels; the margin reaches every pixel closer than
 *   S + 1 pixels (straight-line distance) to a pixel with a value, and 0 or less leaves
 *   the array as it is.
 * @returns a new array in which each pixel is the largest of `a`'s values over the
 *   pixels within reach, each times (1 - distance / (S + 1)): a value counts in full
 *   at its own pixel and fades in a straight line to nothing S + 1 pixels away, round
 *   and not square. What it must satisfy: never below `a` at a pixel, never above the
 *   largest value in `a`, equal to `a` for S 0, and 0 wherever no value of `a` lies
 *   within reach, so a pixel the margin does not reach is exactly as it was; this is
 *   `thinStructures`' margin, where a hard 5 by 5 square of the largest value in its
 *   place left blocky islands in a lattice's gaps and a pale rim round every leaf.
 */
export function coneSpread(a: Float32Array, w: number, h: number, S: number): Float32Array {
  if (S <= 0) return Float32Array.from(a);
  const dx: number[] = [], dy: number[] = [], kw: number[] = [];
  for (let j = -S; j <= S; j++) for (let i = -S; i <= S; i++) {
    const d = Math.hypot(i, j);
    if (d < S + 1) { dx.push(i); dy.push(j); kw.push(1 - d / (S + 1)); }
  }
  const m = dx.length;
  const ox = Int32Array.from(dx), oy = Int32Array.from(dy), ok = Float64Array.from(kw);
  const lin = new Int32Array(m);
  for (let i = 0; i < m; i++) lin[i] = oy[i] * w + ox[i];
  const o = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const rowInner = y >= S && y < h - S;
    for (let x = 0; x < w; x++) {
      const p = y * w + x;
      const v = a[p];
      if (!(v > 0)) continue;
      if (rowInner && x >= S && x < w - S) {
        // away from every border no offset can leave the picture, so no test per offset
        for (let i = 0; i < m; i++) { const u = v * ok[i], q = p + lin[i]; if (u > o[q]) o[q] = u; }
      } else {
        for (let i = 0; i < m; i++) {
          const xx = x + ox[i], yy = y + oy[i];
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
          const u = v * ok[i];
          if (u > o[yy * w + xx]) o[yy * w + xx] = u;
        }
      }
    }
  }
  return o;
}

/** The pieces of the contrast of thin features in a selection source, before any ramp or margin.
 *  @param src  from prepareSkySource; only its grid (`w`, `h`) and `rgb` are read.
 *  @returns `L`, luminance (the square root of the mean linear channel) per source pixel;
 *    `opened` and `closed`, its opening and closing by the square element; `scale`, the
 *    frame's own 95th percentile of luminance; `S`, the margin's radius at this grid; and
 *    `R`, the element's radius at this grid. The contrast of a pixel is the larger of `closed - L` (a dark line) and `L - opened`
 *    (a bright one), over `scale`; it is left to the caller to form it in double
 *    precision, so that the ramp reads the same numbers it always has.
 *    Not exported: `thinFlags` is its one caller.
 *  What it must satisfy: a function of `rgb` and the grid alone; `closed` is never below
 *  `L` and `opened` never above it; all equal over a uniform picture. */
function thinResponse(src: SkySource): { L: Float32Array; opened: Float32Array; closed: Float32Array; scale: number; S: number; R: number } {
  const { w, h, rgb } = src;
  const n = w * h;
  const grow = Math.max(w, h) / SKY_FINE_EDGE;
  const R = Math.max(1, Math.round(SKY_THIN_RADIUS * grow));
  const S = Math.max(1, Math.round(SKY_THIN_SPREAD * grow));
  const L = new Float32Array(n);
  for (let i = 0; i < n; i++) L[i] = Math.sqrt(Math.max(0, (rgb[i * 3] + rgb[i * 3 + 1] + rgb[i * 3 + 2]) / 3));
  // The scale the contrast is read on: the frame's 95th percentile of L, from a 512-bin histogram.
  let top = 1e-6;
  for (let i = 0; i < n; i++) if (L[i] > top) top = L[i];
  const hist = new Uint32Array(512);
  for (let i = 0; i < n; i++) hist[Math.min(511, Math.floor((L[i] / top) * 511))]++;
  let acc = 0, p95 = 511;
  for (let b = 0; b < 512; b++) { acc += hist[b]; if (acc >= n * 0.95) { p95 = b; break; } }
  const scale = Math.max(1e-6, (p95 / 511) * top);
  const opened = squareFilter(squareFilter(L, w, h, R, false), w, h, R, true);
  const closed = squareFilter(squareFilter(L, w, h, R, true), w, h, R, false);
  return { L, opened, closed, scale, S, R };
}

/** Keep the connected pieces of a flag that hold a strong response, and nothing else
 *  (hysteresis thresholding by connection, decision 087 Option 17).
 *  @param flag  1 where a pixel is flagged, 0 elsewhere, w by h.
 *  @param resp  the pixel's response, the same grid; a piece is kept when any pixel of it
 *    has a response of `strong` or more.
 *  @param w,h  the grid.
 *  @param strong  the response that makes a piece definite.
 *  @returns a new array, 1 on every pixel of every 8-connected piece of `flag` in which
 *    some pixel's response is at least `strong`, and 0 everywhere else, including every
 *    piece in which none is. What it must satisfy: never above `flag` at a pixel; a piece
 *    is kept whole or not at all; with `strong` at 0 it equals `flag`; and a flag whose
 *    every piece holds a strong pixel comes back unchanged. */
export function keepStrongPieces(flag: Uint8Array, resp: Float32Array, w: number, h: number, strong: number): Uint8Array {
  const out = new Uint8Array(w * h), seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  const piece = new Int32Array(w * h);
  for (let i0 = 0; i0 < w * h; i0++) {
    if (!flag[i0] || seen[i0]) continue;
    let sp = 0, n = 0, hit = false;
    seen[i0] = 1; stack[sp++] = i0;
    while (sp) {
      const i = stack[--sp];
      piece[n++] = i;
      if (resp[i] >= strong) hit = true;
      const x = i % w, y = (i / w) | 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const xx = x + dx, yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (flag[j] && !seen[j]) { seen[j] = 1; stack[sp++] = j; }
      }
    }
    if (hit) for (let k = 0; k < n; k++) out[piece[k]] = 1;
  }
  return out;
}

/** The two flag arrays the removal reads: what is a structure (for the per-pixel
 *  selection) and where the sky is not plain (for the coarse bitmap the map is built from). */
export interface ThinFlags {
  /** 0 to 1, the structure flag `thinStructures` documents. */
  fine: Float32Array;
  /** 0 to 1, above 0 wherever the sky is not plain: within the margin's reach (a round
   *  margin of the same radius) of a pixel in a connected piece, of what is a structure
   *  (over SKY_THIN_LO) or stands out by more than SKY_PLAIN_LO of the scale inside a
   *  window of the element's own size in which at least SKY_PLAIN_SHARE of the pixels
   *  stand out, that holds a pixel of SKY_THIN_HI or more (`keepStrongPieces`); 0 where
   *  the sky is plain, and in a piece that never reaches SKY_THIN_HI, which is thin cloud's
   *  own texture. Only whether it is above 0 is read. */
  plain: Float32Array;
}

/**
 * Find the thin structures in a selection source, and where the sky is not plain.
 * @param src  from prepareSkySource; only its grid (`w`, `h`) and `rgb` are read.
 * @returns `fine`: one value per source pixel, 0 to 1: 1 on a structure narrower than
 *   the element that stands out from its surroundings by SKY_THIN_HI of the frame's own
 *   95th percentile of luminance or more, 0 where nothing stands out by SKY_THIN_LO or
 *   more within reach, and in between a margin that fades over SKY_THIN_SPREAD + 1 grid
 *   pixels (scaled, see above; `coneSpread`); and `plain`: 1 where the sky is not plain,
 *   spread by the same round margin, 0 where it is (decision 087 Options 12 and 17; see
 *   `ThinFlags` for what not plain is, and `keepStrongPieces` for the piece rule).
 *   Luminance is the square root of the mean
 *   linear channel; the larger of the black top-hat (closing minus the picture, for dark
 *   lines) and the white top-hat (the picture minus its opening, for bright ones) is
 *   read. What it must satisfy: both are a function of `rgb` and the grid alone, so
 *   every path that builds the selection from one source finds the same flags; a
 *   uniform picture gives 0 everywhere in both; a line of one pixel across a flat field
 *   whose contrast is SKY_THIN_HI of the scale or more gives 1 along it in both; a
 *   square wider than the element gives 0 inside it in both; a streak of low contrast
 *   (thin cloud, under SKY_THIN_LO) gives 0 everywhere in `fine`, because a thin cloud
 *   is sky; `plain` is above 0 only within the margin's reach of a connected piece that
 *   holds a pixel of SKY_THIN_HI or more, so wherever `fine` is 1 it is above 0, and a
 *   thin structure or a patch of texture whose connected piece never reaches SKY_THIN_HI
 *   (thin cloud's own texture, which responds 0.06 to 0.15) leaves `plain` at 0, where
 *   Option 12 had cut the map's weight there and the smoothing stage drew a hole.
 */
export function thinFlags(src: SkySource): ThinFlags {
  const { w, h } = src;
  const n = w * h;
  const { L, opened, closed, scale, S, R } = thinResponse(src);
  const fine = new Float32Array(n), stands = new Float32Array(n), structure = new Uint8Array(n), resp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const d = Math.max(closed[i] - L[i], L[i] - opened[i]) / scale;
    resp[i] = d;
    const t = Math.min(1, Math.max(0, (d - SKY_THIN_LO) / (SKY_THIN_HI - SKY_THIN_LO)));
    fine[i] = t * t * (3 - 2 * t);
    stands[i] = d > SKY_PLAIN_LO ? 1 : 0;
    structure[i] = d > SKY_THIN_LO ? 1 : 0;
  }
  // The share of each element-sized window that stands out, by a summed-area table.
  const share = new Float32Array(n);
  boxMean(stands, w, h, R, share, new Float64Array((w + 1) * (h + 1)));
  const notPlain = new Uint8Array(n);
  for (let i = 0; i < n; i++) notPlain[i] = structure[i] || (stands[i] && share[i] >= SKY_PLAIN_SHARE) ? 1 : 0;
  // HYSTERESIS BY CONNECTION (Option 17): only the connected pieces that hold a definite structure count.
  const kept = keepStrongPieces(notPlain, resp, w, h, SKY_THIN_HI);
  return { fine: coneSpread(fine, w, h, S), plain: coneSpread(Float32Array.from(kept), w, h, S) };
}

/**
 * Find the thin structures in a selection source.
 * @param src  from prepareSkySource; only its grid (`w`, `h`) and `rgb` are read.
 * @returns the `fine` array of `thinFlags`, one value per source pixel, 0 to 1.
 *   What it must satisfy: it equals `thinFlags(src).fine` at every pixel; a uniform
 *   picture gives 0 everywhere, a line of SKY_THIN_HI contrast gives 1 along it, a
 *   square wider than the element gives 0 inside it.
 */
export function thinStructures(src: SkySource): Float32Array {
  return thinFlags(src).fine;
}

/**
 * Take the thin structures out of a selection.
 * @param sel  the selection `buildSkySelectionFrom` has built before this step: the
 *   coarse bitmap and, unless the caller wanted none, its refinement.
 * @param thin  from `thinStructures`, on the grid the selection was built from
 *   (`w` by `h`); the refinement is on that grid and the coarse bitmap is on its own.
 * @param w,h  the grid `thin` is on.
 * @param plain  the flags the coarse bitmap is cut by, on the same grid, from
 *   `thinFlags`; omitted, `thin` itself.
 * @returns a selection whose refinement is each value times one minus `thin` at the
 *   same place (the fading margin), and whose coarse bitmap is each value cut to 0
 *   wherever `plain` is above 0 anywhere in the coarse pixel's footprint, and left as it
 *   was where it is 0 everywhere in it: a hard cut, not a fade, because the sky map's
 *   taps weigh sky by this bitmap alone and a fading weight at a structure's edge let a
 *   pixel that the structure had coloured pull the map (a grey-pink smudge beside a
 *   dish, decision 087 Option 6). What it must satisfy: no value is ever above its
 *   input, so the step can only take sky away; with `thin` and `plain` all 0 the result
 *   equals `sel`; every coarse value is either its input or 0; and the turn and the "no
 *   sky" answer (null bitmaps) are unchanged.
 */
export function subtractThin(sel: SkySelection, thin: Float32Array, w: number, h: number, plain: Float32Array = thin): SkySelection {
  let fine: BrushMask | null = null;
  if (sel.fine) {
    const f = sel.fine;
    const data = new Uint8Array(f.data.length);
    for (let y = 0; y < f.h; y++) {
      const sy = Math.min(h - 1, Math.floor((y * h) / f.h));
      for (let x = 0; x < f.w; x++) {
        const sx = Math.min(w - 1, Math.floor((x * w) / f.w));
        data[y * f.w + x] = Math.round(f.data[y * f.w + x] * (1 - thin[sy * w + sx]));
      }
    }
    fine = { w: f.w, h: f.h, data };
  }
  let mask: BrushMask | null = null;
  if (sel.mask) {
    const m = sel.mask;
    const data = new Uint8Array(m.data.length);
    for (let y = 0; y < m.h; y++) {
      const y0 = Math.floor((y * h) / m.h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / m.h));
      for (let x = 0; x < m.w; x++) {
        const x0 = Math.floor((x * w) / m.w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / m.w));
        let big = 0;
        for (let yy = y0; yy < Math.min(h, y1); yy++) for (let xx = x0; xx < Math.min(w, x1); xx++) if (plain[yy * w + xx] > big) big = plain[yy * w + xx];
        data[y * m.w + x] = big > 0 ? 0 : m.data[y * m.w + x];
      }
    }
    mask = { w: m.w, h: m.h, data };
  }
  return { mask, fine, turn: sel.turn };
}

/**
 * Build the sky selection from a SkySource.
 * @param src  from prepareSkySource, for THIS photograph.
 * @param refine  false to stop at the coarse bitmap (a tile needs no more).
 * @returns the coarse bitmap (null when buildSkyMask finds no clear sky), its
 *   refinement (null with it, and null when `refine` is false), both with the thin
 *   structures taken out (`thinStructures`, decision 087), and the turn
 *   both were found at, which is `src.turn`. Gray-world gains are taken from
 *   the copy itself, a raw's clipped cells left out, by the same rule the main
 *   thread's grayWorldWB applies over the full frame (grayWorldFromMeans); an
 *   8-bit copy carries no `clip` and counts every cell (`SkySource.clip`),
 *   which grayWorldWB (decode.ts) does NOT do for an 8-bit frame: its `pinTest`
 *   still tests the 255s as decoded. So for an 8-bit source this balance and
 *   grayWorldWB are two rules, and the Masks tab's sky layer
 *   (`regenerateSkyMask`, `skyGuideFor`, `skyPrepFor` in main.ts) takes
 *   grayWorldWB.
 * What the result must satisfy: it is the selection `DecodedImage.skySel`
 * carries and every sky-aware stage reads — built at gray-world balance and
 * nothing else, so it never moves as the photograph is graded; and seeded from
 * the edge `src.turn` puts at the top, the same turn the reader's Sky mask is
 * built at (decision 070), so the two never disagree about which edge is up.
 * A caller showing the picture at another turn must not use it.
 */
export function buildSkySelectionFrom(src: SkySource, refine = true): SkySelection {
  const { w, h, rgb, clip } = src;
  // A RAW'S CLIPPED CELLS LEFT OUT, as grayWorldMeans leaves clipped samples
  // out; a frame where every cell clipped has nothing else to read and counts
  // them all. An 8-bit copy has no `clip` and counts every cell.
  let r = 0, g = 0, b = 0, n = 0;
  for (let i = 0; i < w * h; i++) { if (clip && clip[i]) continue; r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; n++; }
  if (!n) { for (let i = 0; i < w * h; i++) { r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; } n = w * h; }
  r = Math.max(1e-4, r / n); g = Math.max(1e-4, g / n); b = Math.max(1e-4, b / n);
  const wb = grayWorldFromMeans(r, g, b);
  const sample = (x: number, y: number): [number, number, number] => { const o = (y * w + x) * 3; return [rgb[o], rgb[o + 1], rgb[o + 2]]; };
  // AT THE TURN THE PICTURE IS SHOWN AT (070). This was a literal 0: the border
  // runs down each column from the display's top edge, so on a photograph
  // turned on its side the look's sky was seeded from a side of the picture.
  const turn = skyTurn(src.turn ?? 0);
  const res = buildSkyMask(sample, w, h, turn, src.cam, wb, BRUSH_MAX_EDGE, 1, 0.5);
  if (!res.found) return { mask: null, fine: null, turn };
  // THE THIN STRUCTURES COME OUT OF EVERY PATH'S SELECTION HERE, the coarse bitmap
  // included (decision 087), WHILE `SKY_THIN_REMOVAL` IS ON: the sky worker the devices
  // use, the page's fallback, the decode worker's held bitmaps, the strip's tiles and
  // the export all build the selection through this function, so they all hold one
  // selection, with the removal or without it. It is OFF since 2026-10-17 (decision
  // 087, Outcome), and then the selection is what it was before 2026-10-14, byte for
  // byte: the removal cleaned up after Sky saturation, which no built-in look carries.
  const flags = SKY_THIN_REMOVAL ? thinFlags(src) : null;
  const cut = (sel: SkySelection): SkySelection => (flags ? subtractThin(sel, flags.fine, w, h, flags.plain) : sel);
  if (!refine) return cut({ mask: res.mask, fine: null, turn });
  const guide = buildSkyGuide(sample, w, h, wb);
  return cut({ mask: res.mask, fine: refineSkyMask(res.mask, guide), turn });
}

/** Outer colour tolerance for the grow, in units of the sky's own chroma
 *  spread. Set by measurement on the three mask-truth frames: the sky's own
 *  90th percentile sits at 1.43, 1.46 and 1.63, so a pixel four spreads out is
 *  well past anything the seed itself contains, and the connectivity bound
 *  rather than this number is what actually stops the grow. */
export const SKY_GROW_TOL = 2.5;
/** Floor on that spread, so a frame whose sky is very uniform does not produce
 *  an impossibly tight gate. In guide units (every channel runs 0..1). */
export const SKY_GROW_SPREAD_MIN = 0.004;
/** Cap on it, so a frame whose seed caught a gradient does not admit the
 *  whole photograph. */
export const SKY_GROW_SPREAD_MAX = 0.03;
/** A seed pixel: the coarse bitmap is read as a HARD selection at half, the
 *  same cut refineSkyMask makes, so the two paths start from one idea of what
 *  the seed selected. */
const SEED_CUT = 128;
/** Luma-gradient above which the grow may SELECT a pixel but must not continue
 *  THROUGH it — the photograph's own edges, as a brake on the flood.
 *
 *  It exists because colour and connectivity alone are not enough, which was
 *  measured rather than assumed. On NIR_1651 the sky and the hillside below
 *  the tree share a colour, and the grow finds a path between them through the
 *  crown: sweeping the tolerance there gives 10.6% of the frame at 1.0 and
 *  36.5% at 1.25 — a cliff, not a slope, which is the signature of a leak
 *  rather than of a threshold set slightly wrong. Below the cliff the grow
 *  adds nothing at all; above it the whole lower frame floods. No tolerance
 *  is safe, so the brake is structural.
 *
 *  Near buildSkyMask's own 0.045 seed-smoothness bound, which is the same idea
 *  on the same quantity one stage earlier; this one runs on the guide's gamma
 *  luma at 1024 rather than on normalised linear luma at 384. */
export const GRAD_STOP = 0.06;
/** Widest soft edge Feather can ask for, in guide pixels at SKY_FINE_EDGE.
 *  Feather 0.5, the default, is half of this.
 *
 *  SMALL ON PURPOSE, and 12 was tried first. The grow's boundary is already
 *  per-pixel accurate because it IS a colour boundary, so the blur is only
 *  there to give Feather something to do. At 12 — a 6 px radius at the
 *  default — it ate the needles: NIR_1651 came back with a pale halo round
 *  every branch and stepped blocks down the left edge, which is the rim
 *  defect this whole item exists to remove, reintroduced by the softening.
 *  An isotropic blur cannot know about edges; at this width it cannot do much
 *  harm either. */
const FEATHER_MAX_PX = 3;
/** Largest ENCLOSED unselected patch, in guide pixels, that counts as grain
 *  rather than as a thing. A pinhole from noise is one to a handful of pixels;
 *  a bird against the sky is orders of magnitude bigger, and filling it would
 *  be selecting an object as sky. */
const PINHOLE_MAX_PX = 24;
/** REACH PAST BRANCHES (decision 028): the largest disconnected patch of the
 *  sky's colour that switch admits, as a share of the guide's pixels, so the cap
 *  scales with the guide and is not one resolution's pixel count.
 *
 *  WHERE THE NUMBER COMES FROM. The only sizes of sky-coloured gaps in a crown
 *  that the records measure are the largest blocks decision 023 found the grow
 *  missing, 292, 406 and 430 pixels, about seventeen to twenty pixels across, on
 *  the acceptance walk's canvas. This takes the largest of them, 430, over that
 *  canvas's size, about 1300 thousand pixels (read off 023's own figures for
 *  NIR_1651, where 174,292 pixels were about 13% of the frame). It was NOT tried
 *  against a render and NOT tuned on any frame record 028 names; the canvas size
 *  is an estimate, and the size the walk prints beside its lines replaces it if
 *  the two differ. A cap generous enough to take every speck on an oak frame is
 *  generous enough to take a car roof (028, Rejected 2), which is why the switch
 *  is off by default and the cap stays small. */
export const REACH_PAST_MAX_FRAC = 430 / (1300 * 1000);

/** What the grow decides with: which pixels seeded it, where the sky's colour
 *  sits, how far from there still counts, and the test itself.
 *
 *  Takes the coarse bitmap, the guide for the SAME photograph, and the mask's
 *  Reach; gives back the seeded map, the sky's median red and blue share, the
 *  clamped spread, the resulting tolerance, and `matches` — or null when
 *  nothing seeds, which is the caller's "no sky" case.
 *
 *  What the result must satisfy: `growSkyByColour` is its only production
 *  caller and consults `matches` for every pixel it admits, so this IS the
 *  selection's boundary rather than a model of it. It is exported for one
 *  reason — `tools/sky-probe.mjs` has to ask WHY the grow stopped somewhere,
 *  and answering that from a reimplementation would be a second instrument
 *  free to disagree with the first. Keep it pure and keep it the only copy.
 *
 *  The seed is read at the guide's grid, sampled BILINEARLY and cut at half.
 *  Nearest-neighbour was tried first and is visible in the photograph: the
 *  seed is 384 px against the guide's 1024, so its own boundary arrives
 *  magnified nearly three times, and wherever the grow stops at a colour edge
 *  rather than running past it that staircase is what shows — stepped blocks
 *  down the left of NIR_1651 and along its cloud. Bilinear was avoided at
 *  first because a ramp would seed the grow with half-strength pixels along
 *  the seed's feather; that reason went when membership became binary, and the
 *  cut at SEED_CUT removes the ramp anyway.
 *
 *  THE TEST IS BINARY and the tolerance is its only parameter. It used to
 *  return a weight and the weight was dead — a plateau computed from Feather,
 *  a smoothstep above it, and a flood that consulted only the zero crossing
 *  before writing a flat 255. Feather sets the boundary blur's radius and
 *  nothing else. */
export function skyGrowKey(
  mask: BrushMask,
  guide: SkyGuide,
  reach = 1,
): { seeded: Uint8Array; mr: number; mb: number; spread: number; edge: number; matches: (p: number) => boolean } | null {
  const W = guide.w, H = guide.h, N = W * H;
  const seeded = new Uint8Array(N);
  const sr: number[] = [], sb: number[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (sampleBrush(mask, (x + 0.5) / W, (y + 0.5) / H) * 255 >= SEED_CUT) {
        const p = y * W + x;
        seeded[p] = 1;
        sr.push(guide.r[p]);
        sb.push(guide.b[p]);
      }
    }
  }
  if (!sr.length) return null;
  // The sky's own centre and spread, robustly — median and MAD, the same shape
  // buildSkyMask uses to learn its model, so one outlier band of haze cannot
  // drag the target off the sky.
  const med = (a: number[]): number => { const t = Float64Array.from(a).sort(); return t[t.length >> 1]; };
  const mr = med(sr), mb = med(sb);
  const madOf = (a: number[], m: number): number => 1.4826 * med(a.map((v) => Math.abs(v - m)));
  const spread = Math.min(SKY_GROW_SPREAD_MAX, Math.max(SKY_GROW_SPREAD_MIN, Math.hypot(madOf(sr, mr), madOf(sb, mb))));
  const edge = SKY_GROW_TOL * spread * Math.max(0.1, reach);
  const matches = (p: number): boolean => Math.hypot(guide.r[p] - mr, guide.b[p] - mb) < edge;
  return { seeded, mr, mb, spread, edge, matches };
}

/** The photograph's own edges, from the guide's luma — central differences,
 *  the same measure buildSkyMask takes on its normalised luma one stage
 *  earlier.
 *
 *  Takes the guide; gives back one value per guide pixel.
 *
 *  What the result must satisfy: it is read against GRAD_STOP and nothing
 *  else. A pixel ON an edge may be SELECTED — the mask has to reach the edge —
 *  but is never propagated THROUGH, which is what stops the flood crossing a
 *  crown into whatever shares the sky's colour behind it. Exported beside
 *  `skyGrowKey` and for the same reason: the probe that asks why the grow
 *  stopped has to read the real brake, not a copy of it. */
export function skyGrowGradient(guide: SkyGuide): Float32Array {
  const W = guide.w, H = guide.h;
  const grad = new Float32Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = guide.l[y * W + Math.min(W - 1, x + 1)] - guide.l[y * W + Math.max(0, x - 1)];
      const gy = guide.l[Math.min(H - 1, y + 1) * W + x] - guide.l[Math.max(0, y - 1) * W + x];
      grad[y * W + x] = Math.hypot(gx, gy);
    }
  }
  return grad;
}

/**
 * Admit the small disconnected patches of the sky's colour the flood did not
 * reach — "Reach past branches" (decision 028), the pinhole fill generalised.
 *
 * @param out  the selection so far, one byte per guide pixel with 255 selected
 *   and 0 not; changed in place.
 * @param matches  the grow's own colour test from `skyGrowKey`, true where a
 *   pixel is the sky's colour, so the switch asks the same question the flood did.
 * @param w  the guide's width in pixels.
 * @param h  the guide's height in pixels.
 * @returns how many pixels it admitted, 0 when none qualified.
 *
 * What the result must satisfy: it only ever raises a byte from below 128 to
 * 255 and never lowers one, so the contour the flood drew is untouched and only
 * unselected pixels change. A patch is a 4-connected set of unselected pixels
 * that each match the sky's colour, and it is admitted whole or not at all: whole
 * when it holds no more than `max(PINHOLE_MAX_PX, REACH_PAST_MAX_FRAC * w * h)`
 * pixels, so a hillside or a wall of the same colour, which is far larger, stays
 * out, and a patch the pinhole fill already declined at 24 pixels or fewer can
 * never be refused here. SIZE ALONE decides, never distance to the selection
 * (028, Rejected 3). `growSkyByColour` is its only caller and calls it only when
 * the reader has turned the switch on, after the pinhole fill and before the
 * feather, so Feather softens what this admits like everything else.
 */
export function admitSkyPastBranches(out: Uint8Array, matches: (p: number) => boolean, w: number, h: number): number {
  const N = w * h;
  const cap = Math.max(PINHOLE_MAX_PX, Math.round(N * REACH_PAST_MAX_FRAC));
  // 1 where a pixel is unselected, matches the sky's colour and has not been
  // looked at yet; a patch is walked once and its pixels cleared as they are met.
  const open = new Uint8Array(N);
  for (let p = 0; p < N; p++) if (out[p] < 128 && matches(p)) open[p] = 1;
  const queue = new Int32Array(N);
  let admitted = 0;
  for (let p0 = 0; p0 < N; p0++) {
    if (!open[p0]) continue;
    let head = 0, tail = 0;
    open[p0] = 0;
    queue[tail++] = p0;
    while (head < tail) {
      const p = queue[head++], x = p % w, y = (p / w) | 0;
      if (x > 0 && open[p - 1]) { open[p - 1] = 0; queue[tail++] = p - 1; }
      if (x < w - 1 && open[p + 1]) { open[p + 1] = 0; queue[tail++] = p + 1; }
      if (y > 0 && open[p - w]) { open[p - w] = 0; queue[tail++] = p - w; }
      if (y < h - 1 && open[p + w]) { open[p + w] = 0; queue[tail++] = p + w; }
    }
    if (tail <= cap) {
      for (let i = 0; i < tail; i++) out[queue[i]] = 255;
      admitted += tail;
    }
  }
  return admitted;
}

/**
 * Grow the sky selection outward from the coarse seed, through the guide, by
 * colour AND connectivity — the reader's Sky mask reading which pixels ARE the
 * sky and not only where it is (decision 023).
 *
 * @param mask  the 384 px bitmap from buildSkyMask, for THIS photograph.
 * @param guide  from buildSkyGuide, for the SAME photograph.
 * @param reach  the mask's Reach, scaling the colour tolerance as it scales
 *   buildSkyMask's own growth tolerances — 1 is the shipped default.
 * @param feather  the mask's Feather, setting the boundary blur's radius, up
 *   to FEATHER_MAX_PX. It does NOT move the colour tolerance and has not since
 *   membership became binary — the ramp it used to set was computed and never
 *   read. Selection is all-or-nothing and the softness is on the boundary.
 * @param pastBranches  the mask's "Reach past branches" switch (028), off when
 *   omitted: when on, after the flood and the pinhole fill have settled, every
 *   small disconnected patch of the sky's colour is admitted as well
 *   (`admitSkyPastBranches`), which is how sky seen between leaves is taken. Off,
 *   the result is exactly what it was before the switch existed.
 * @returns a BrushMask at the GUIDE's size, 0..255, image-uv like the input —
 *   the same shape refineSkyMask returns, so it drops into `MaskLayer.fine`
 *   and is read by compileEdit's brush sampler and the shader's mask atlas
 *   with no other change.
 *
 * What the result must satisfy, and why it is a grow rather than a multiply:
 * every selected pixel is reachable from a seed pixel through a chain of
 * pixels that each match the sky's colour. **A per-pixel multiply cannot
 * express that, and cannot help at all** — it only ever removes weight, so it
 * can neither fill the gaps between branches nor lift open-sky coverage,
 * which are the defect. Measured on the three mask-truth frames before this
 * was written: the sky the seed misses lies AGAINST the seed and is
 * colour-close (15%, 32% and 39% of what is near it), while the colour-close
 * pixels the mask must keep rejecting are speckle scattered through foliage
 * and blobs disconnected from any sky. On NIR_1651 46% of the frame BEYOND
 * the seed matches the sky's colour, against a true sky of about 13% — so
 * colour alone readmits the hillside, and connectivity is the whole of what
 * separates the two. That is the sky's colour AND its place, with place
 * meaning "joined to the sky" rather than "inside a coarse bitmap".
 *
 * It CANNOT DRIFT WITH THE GRADE, which is the design point record 023 left
 * to be settled — *a gate that drifts is the Colour mask's defect moved into
 * the Sky mask*. The guarantee is STRUCTURAL rather than tested, and that is
 * deliberate: this function's parameters are a bitmap, a guide, a reach and a
 * feather, so it has no access to EditParams at all and no edit can reach it
 * even by mistake. The guide itself is three channels of the gray-world
 * balanced linear frame, built once per photograph beside the bitmap and never
 * rebuilt per edit. The Colour mask's own key reads the display colour at the
 * mask stage and does move; nothing of that is imported here.
 *
 * A BROWSER WALK FOR IT WAS WRITTEN AND THEN REMOVED, which is worth knowing
 * before writing a second one. It built the selection under one look, rebuilt
 * it under another, and compared the frame rendered back under the first — and
 * it failed on correct code. Its control, the same comparison with the mask's
 * adjustment neutral, failed too, so the walk was measuring something other
 * than this and was deleted: a test that fails for a reason other than the one
 * it names is worse than no test.
 *
 * WHAT IT WAS MEASURING IS NOT WHAT THIS COMMENT SAID IT WAS. It said the
 * control failed because switching a look away and back does not return the
 * same photograph — which was recorded as an open defect on that walk's two
 * framebuffer hashes and is NOT TRUE. Re-measured through
 * `tools/look-roundtrip-walk.mjs`: fourteen round trips over seven looks, with
 * and without a Sky mask, byte for byte identical, and twenty away-and-back
 * cycles with one distinct render. So the deleted walk's control failed for a
 * reason still unknown, and nothing here should be read as having explained
 * it. Isolating drift properly needs the mask-truth walk's trick of solving
 * coverage per pixel from two overlay reads, which is a real piece of work and
 * buys nothing the signature above already guarantees.
 */
export function growSkyByColour(mask: BrushMask, guide: SkyGuide, reach = 1, feather = 0.5, pastBranches = false): BrushMask {
  const W = guide.w, H = guide.h, N = W * H;
  const out = new Uint8Array(N);
  const key = skyGrowKey(mask, guide, reach);
  if (!key) return { w: W, h: H, data: out }; // no seed: no sky, as before
  const { seeded, matches: matchesSky } = key;
  const grad = skyGrowGradient(guide);
  // Flood from the seed through 4-neighbours. A pixel whose colour weight is
  // zero is not selected AND does not propagate, so the grow stops at the
  // photograph's own colour edges and the speckle beyond them is never
  // reached. The queue is a typed ring: 700k pixels, one pass.
  const queue = new Int32Array(N);
  let head = 0, tail = 0;
  for (let p = 0; p < N; p++) {
    if (!seeded[p]) continue;
    out[p] = 255; // the seed is sky by the heuristic's own finding
    queue[tail++] = p;
  }
  while (head < tail) {
    const p = queue[head++];
    const x = p % W, y = (p / W) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (out[q] || seeded[q]) continue; // already settled
      if (!matchesSky(q)) continue;      // outside the sky's colour: stop here
      // MEMBERSHIP IS BINARY; THE SOFTNESS GOES ON THE BOUNDARY BELOW.
      // Grading each pixel by its own colour confidence instead put SPECKLE
      // through the selection — a sky is a smooth gradient, so a wide band of
      // it sits mid-ramp, and neighbouring pixels took visibly different
      // weights the moment a strong adjustment was applied. Seen on NIR_1651
      // in the app, not inferred: the darkened sky came back grainy where the
      // old narrow selection had been clean.
      out[q] = 255;
      if (grad[q] < GRAD_STOP) queue[tail++] = q; // on an edge: selected, not crossed
    }
  }
  // PINHOLES. Grain pushes the odd single pixel of open sky outside the colour
  // tolerance, so the flood steps around it and leaves an unselected speck
  // ENCLOSED by selection. Magnified 4x on NIR_1651 they are everywhere in the
  // open sky, and under a strong adjustment they are the speckle the reader
  // sees — the selection's boundary itself is crisp and threads between the
  // needles correctly, which is what the same picture showed.
  //
  // THE FIX CANNOT MOVE THE OUTER CONTOUR, WHICH IS WHY IT IS THIS ONE. Flood
  // the UNSELECTED pixels inward from the frame's border; anything unselected
  // the border cannot reach is enclosed. Filling those only ever ADDS interior
  // pixels, so the needle edge this item exists to win is untouchable by it —
  // unlike widening the feather, which ate the needles at 6 px and put a pale
  // halo round every branch.
  //
  // The size cap keeps a real object enclosed by sky — a bird, a branch tip
  // island — from being swallowed. A pinhole is grain, a few pixels at most.
  {
    const outside = new Uint8Array(N);
    const q2 = new Int32Array(N);
    let h2 = 0, t2 = 0;
    const pushIfOpen = (p: number) => { if (!outside[p] && out[p] < 128) { outside[p] = 1; q2[t2++] = p; } };
    for (let x = 0; x < W; x++) { pushIfOpen(x); pushIfOpen((H - 1) * W + x); }
    for (let y = 0; y < H; y++) { pushIfOpen(y * W); pushIfOpen(y * W + W - 1); }
    while (h2 < t2) {
      const p = q2[h2++], x = p % W, y = (p / W) | 0;
      if (x > 0) pushIfOpen(p - 1);
      if (x < W - 1) pushIfOpen(p + 1);
      if (y > 0) pushIfOpen(p - W);
      if (y < H - 1) pushIfOpen(p + W);
    }
    // Every unselected pixel the border could not reach is enclosed. Measure
    // each enclosed component and fill the small ones.
    const seenHole = new Uint8Array(N);
    for (let p0 = 0; p0 < N; p0++) {
      if (out[p0] >= 128 || outside[p0] || seenHole[p0]) continue;
      const comp: number[] = [];
      let h3 = 0;
      seenHole[p0] = 1; comp.push(p0);
      while (h3 < comp.length) {
        const p = comp[h3++], x = p % W, y = (p / W) | 0;
        for (const n of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, y > 0 ? p - W : -1, y < H - 1 ? p + W : -1]) {
          if (n < 0 || seenHole[n] || outside[n] || out[n] >= 128) continue;
          seenHole[n] = 1; comp.push(n);
        }
      }
      if (comp.length <= PINHOLE_MAX_PX) for (const p of comp) out[p] = 255;
    }
  }

  // REACH PAST BRANCHES (028), when the reader has turned it on. The flood only
  // walks through pixels JOINED to the sky, so sky seen between leaves, joined to
  // the open sky by no sky-coloured path, is never entered at any tolerance. This
  // is the pinhole fill at a size that fill refuses: each connected patch of the
  // sky's colour left unselected is admitted when it is small, and left out when
  // it is large, which is what keeps a hillside of the same colour out. Off by
  // default and absent from every older mask, because the cap cannot tell a gap
  // in a canopy from a small thing of the same colour (028, Rejected 2).
  if (pastBranches) admitSkyPastBranches(out, matchesSky, W, H);

  // The soft edge, from the BOUNDARY rather than from colour: a separable box
  // blur whose radius comes from Feather, which is how a region mask has
  // always been softened here and what buildSkyMask's own feather does one
  // stage earlier. Radius 0 leaves the selection hard.
  const rad = Math.round(Math.min(1, Math.max(0, feather)) * FEATHER_MAX_PX);
  if (rad <= 0) return { w: W, h: H, data: out };
  const tmp = new Float32Array(N), acc = new Float32Array(N);
  const span = 2 * rad + 1;
  for (let y = 0; y < H; y++) {           // horizontal
    let sum = 0;
    for (let x = -rad; x <= rad; x++) sum += out[y * W + Math.min(W - 1, Math.max(0, x))];
    for (let x = 0; x < W; x++) {
      tmp[y * W + x] = sum / span;
      sum -= out[y * W + Math.min(W - 1, Math.max(0, x - rad))];
      sum += out[y * W + Math.min(W - 1, Math.max(0, x + rad + 1))];
    }
  }
  for (let x = 0; x < W; x++) {           // vertical
    let sum = 0;
    for (let y = -rad; y <= rad; y++) sum += tmp[Math.min(H - 1, Math.max(0, y)) * W + x];
    for (let y = 0; y < H; y++) {
      acc[y * W + x] = sum / span;
      sum -= tmp[Math.min(H - 1, Math.max(0, y - rad)) * W + x];
      sum += tmp[Math.min(H - 1, Math.max(0, y + rad + 1)) * W + x];
    }
  }
  for (let p = 0; p < N; p++) out[p] = Math.round(Math.min(255, Math.max(0, acc[p])));
  return { w: W, h: H, data: out };
}
