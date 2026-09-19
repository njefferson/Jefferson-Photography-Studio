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
// With all three, the per-window fit uses whichever separates there. Built
// once per photograph beside the bitmap, sampled bilinearly by the shader
// (u_skyFineTex) and by compileEdit (the brush sampler), never rebuilt per
// edit.

import type { BrushMask } from "./pipeline";
import { linearAt, type DecodedImage, type SkySelection } from "./decode";
import { buildSkyMask } from "./sky";
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
/** Regularisation on the guide's covariance, in guide units squared (every
 *  channel runs 0..1). Smaller follows fainter edges and admits more noise. */
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
  const { w, h, r: I1, b: I2, l: I3 } = guide;
  const n = w * h;
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
  srcW: number;
  srcH: number;
  cam: number[] | null;
}

/**
 * Take the small copy the selection is built from.
 * @param img  the decoded photograph, its buffers still present.
 * @returns a SkySource at SKY_FINE_EDGE on the long edge, each pixel the box
 *   mean of its source block, read straight from the linear buffer when there
 *   is one and through `linearAt` otherwise.
 * What the result must satisfy: it is complete before the decode's buffer is
 * transferred — the worker calls this first and posts the picture second —
 * and it carries enough for `buildSkySelectionFrom` to need nothing else.
 */
export function prepareSkySource(img: DecodedImage): SkySource {
  const { width: srcW, height: srcH } = img;
  const sc = Math.min(1, SKY_FINE_EDGE / Math.max(srcW, srcH));
  const w = Math.max(1, Math.round(srcW * sc)), h = Math.max(1, Math.round(srcH * sc));
  const rgb = new Float32Array(w * h * 3);
  const lin = img.linear;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * srcH) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * srcW) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / w));
      let r = 0, g = 0, b = 0, n = 0;
      if (lin) {
        for (let sy = y0; sy < y1; sy++) { let o = (sy * srcW + x0) * 4; for (let sx = x0; sx < x1; sx++, o += 4) { const pr = lin[o], pg = lin[o + 1], pb = lin[o + 2]; if (pr === pr && pg === pg && pb === pb) { r += pr; g += pg; b += pb; n++; } } }
      } else {
        for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) { const q = linearAt(img, sx, sy); r += q[0]; g += q[1]; b += q[2]; n++; }
      }
      const o = (y * w + x) * 3;
      if (n) { rgb[o] = r / n; rgb[o + 1] = g / n; rgb[o + 2] = b / n; }
    }
  }
  return { w, h, rgb, srcW, srcH, cam: img.camMatrix ?? null };
}

/**
 * Build the sky selection from a SkySource.
 * @param src  from prepareSkySource, for THIS photograph.
 * @param refine  false to stop at the coarse bitmap (a tile needs no more).
 * @returns the coarse bitmap (null when buildSkyMask finds no clear sky) and
 *   its refinement (null with it, and null when `refine` is false). Gray-world
 *   gains are taken from the copy itself, the same statistic the main thread
 *   computes over the full frame.
 * What the result must satisfy: it is the selection `DecodedImage.skySel`
 * carries and every sky-aware stage reads — built at gray-world balance and
 * nothing else, so it never moves as the photograph is graded.
 */
export function buildSkySelectionFrom(src: SkySource, refine = true): SkySelection {
  const { w, h, rgb } = src;
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < w * h; i++) { r += rgb[i * 3]; g += rgb[i * 3 + 1]; b += rgb[i * 3 + 2]; }
  r = Math.max(1e-4, r / (w * h)); g = Math.max(1e-4, g / (w * h)); b = Math.max(1e-4, b / (w * h));
  const mean = (r + g + b) / 3;
  const l = 0.2126 * (mean / r) + 0.7152 * (mean / g) + 0.0722 * (mean / b) || 1;
  const cl = (v: number) => Math.max(0.02, Math.min(16, v));
  const wb: [number, number, number] = [cl(mean / r / l), cl(mean / g / l), cl(mean / b / l)];
  const sample = (x: number, y: number): [number, number, number] => { const o = (y * w + x) * 3; return [rgb[o], rgb[o + 1], rgb[o + 2]]; };
  const res = buildSkyMask(sample, w, h, 0, src.cam, wb, BRUSH_MAX_EDGE, 1, 0.5);
  if (!res.found) return { mask: null, fine: null };
  if (!refine) return { mask: res.mask, fine: null };
  const guide = buildSkyGuide(sample, w, h, wb);
  return { mask: res.mask, fine: refineSkyMask(res.mask, guide) };
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
const GRAD_STOP = 0.06;
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

/**
 * Grow the sky selection outward from the coarse seed, through the guide, by
 * colour AND connectivity — the reader's Sky mask reading which pixels ARE the
 * sky and not only where it is (decision 023).
 *
 * @param mask  the 384 px bitmap from buildSkyMask, for THIS photograph.
 * @param guide  from buildSkyGuide, for the SAME photograph.
 * @param reach  the mask's Reach, scaling the colour tolerance as it scales
 *   buildSkyMask's own growth tolerances — 1 is the shipped default.
 * @param feather  the mask's Feather, setting how much of the tolerance is a
 *   ramp rather than a plateau, exactly as colorMaskWeight uses it.
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
 * adjustment neutral, failed too: switching a look away and back does not
 * return the same photograph, so the walk was measuring that and not this. A
 * test that fails for a reason other than the one it names is worse than no
 * test. Isolating it properly needs the mask-truth walk's trick of solving
 * coverage per pixel from two overlay reads, which is a real piece of work and
 * buys nothing a signature already guarantees.
 */
export function growSkyByColour(mask: BrushMask, guide: SkyGuide, reach = 1, feather = 0.5): BrushMask {
  const W = guide.w, H = guide.h, N = W * H;
  const out = new Uint8Array(N);
  // The seed, at the guide's grid, sampled BILINEARLY and then cut at half.
  // Nearest-neighbour was tried first and is visible in the photograph: the
  // seed is 384 px against the guide's 1024, so its own boundary arrives
  // magnified nearly three times, and wherever the grow stops at a colour
  // edge rather than running past it that staircase is what shows — stepped
  // blocks down the left of NIR_1651 and along its cloud. Bilinear was
  // avoided at first because a ramp would seed the grow with half-strength
  // pixels along the seed's feather; that reason went when membership became
  // binary, and the cut at SEED_CUT removes the ramp anyway.
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
  if (!sr.length) return { w: W, h: H, data: out }; // no seed: no sky, as before
  // The sky's own centre and spread, robustly — median and MAD, the same shape
  // buildSkyMask uses to learn its model, so one outlier band of haze cannot
  // drag the target off the sky.
  const med = (a: number[]): number => { const t = Float64Array.from(a).sort(); return t[t.length >> 1]; };
  const mr = med(sr), mb = med(sb);
  const madOf = (a: number[], m: number): number => 1.4826 * med(a.map((v) => Math.abs(v - m)));
  const spread = Math.min(SKY_GROW_SPREAD_MAX, Math.max(SKY_GROW_SPREAD_MIN, Math.hypot(madOf(sr, mr), madOf(sb, mb))));
  const edge = SKY_GROW_TOL * spread * Math.max(0.1, reach);
  const plateau = edge * (1 - Math.min(1, Math.max(0, feather)));
  /** This pixel's weight from its colour alone, 0 outside the tolerance. */
  const weightAt = (p: number): number => {
    const d = Math.hypot(guide.r[p] - mr, guide.b[p] - mb);
    if (d >= edge) return 0;
    if (d <= plateau) return 1;
    const t = (d - plateau) / Math.max(1e-6, edge - plateau);
    return 1 - t * t * (3 - 2 * t); // smoothstep, as smooth01 elsewhere
  };
  // The photograph's own edges, from the guide's luma — central differences,
  // the same measure buildSkyMask takes on its normalised luma one stage
  // earlier. A pixel ON an edge may be selected (the mask has to reach the
  // edge) but is never propagated THROUGH, which is what stops the flood
  // crossing a crown into whatever shares the sky's colour behind it.
  const grad = new Float32Array(N);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const gx = guide.l[y * W + Math.min(W - 1, x + 1)] - guide.l[y * W + Math.max(0, x - 1)];
      const gy = guide.l[Math.min(H - 1, y + 1) * W + x] - guide.l[Math.max(0, y - 1) * W + x];
      grad[y * W + x] = Math.hypot(gx, gy);
    }
  }
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
      if (weightAt(q) <= 0) continue;    // outside the sky's colour: stop here
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
