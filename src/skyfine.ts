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
// COLOUR, not luma — the red share and the blue share of the gray-world-
// balanced linear frame — because in an infrared frame luma is the wrong
// cue: IR-bright foliage is as bright as the sky or brighter, and a first
// guide that carried luma read the bright sky around a crown as the crown's
// side and left a pale halo round it. Colour is the fact buildSkyMask's own
// cluster rests on. Built once per photograph beside the bitmap, sampled
// bilinearly by the shader (u_skyFineTex) and by compileEdit (the brush
// sampler), never rebuilt per edit.

import type { BrushMask } from "./pipeline";

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
/** Regularisation on the guide's covariance, in guide units squared (both
 *  channels run 0..1). Smaller follows fainter edges and admits more noise. */
export const SKY_FINE_EPS = 0.005;

/** The two-channel COLOUR guide the refinement follows — red share and blue
 *  share after gray-world balance, both 0..1, at the refined mask's scale. */
export interface SkyGuide {
  w: number;
  h: number;
  /** Red share R/(R+G+B). */
  l: Float32Array;
  /** Blue share B/(R+G+B). */
  c: Float32Array;
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
 * What the result must satisfy: `l` (red share) and `c` (blue share) are
 * finite and within 0..1 at every pixel, and `w`/`h` are what `refineSkyMask`
 * sizes its output to — a guide from one photograph must never be used to
 * refine another's bitmap.
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
  const l = new Float32Array(w * h);
  const c = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor((y * srcH) / h), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * srcH) / h));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor((x * srcW) / w), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * srcW) / w));
      let r = 0, g = 0, b = 0, n = 0;
      for (let sy = y0; sy < y1; sy++) for (let sx = x0; sx < x1; sx++) {
        const q = sample(sx, sy);
        const qr = q[0] * wb[0], qg = q[1] * wb[1], qb = q[2] * wb[2];
        if (!Number.isFinite(qr) || !Number.isFinite(qg) || !Number.isFinite(qb)) continue;
        r += qr; g += qg; b += qb; n++;
      }
      const i = y * w + x;
      if (n === 0) { l[i] = 0; c[i] = 0; continue; }
      r /= n; g /= n; b /= n;
      const sum = Math.max(1e-9, Math.max(0, r) + Math.max(0, g) + Math.max(0, b));
      l[i] = Math.min(1, Math.max(0, r / sum));
      c[i] = Math.min(1, Math.max(0, b / sum));
    }
  }
  return { w, h, l, c };
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
 * What the result must satisfy: away from any guide edge it equals the
 * upsampled bitmap (a flat window fits a = 0, b = the mask's mean), and across
 * a guide edge inside one window it steps with the guide — so a pixel on the
 * sky side of a roofline keeps the sky's weight and one across it takes the
 * roof's, whatever the feather did. A bitmap that selects nothing refines to
 * nothing; the caller's "no sky found" stays true.
 */
export function refineSkyMask(mask: BrushMask, guide: SkyGuide, r = SKY_FINE_RADIUS, eps = SKY_FINE_EPS): BrushMask {
  const { w, h, l: I1, c: I2 } = guide;
  const n = w * h;
  const p = new Float32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) p[y * w + x] = maskAt(mask, (x + 0.5) / w, (y + 0.5) / h);
  const sat = new Float64Array((w + 1) * (h + 1));
  const tmp = new Float32Array(n);
  const mean = (src: Float32Array) => { const o = new Float32Array(n); boxMean(src, w, h, r, o, sat); return o; };
  const prod = (a: Float32Array, b: Float32Array) => { for (let i = 0; i < n; i++) tmp[i] = a[i] * b[i]; return mean(tmp); };
  const m1 = mean(I1), m2 = mean(I2), mp = mean(p);
  const c11 = prod(I1, I1), c22 = prod(I2, I2), c12 = prod(I1, I2), c1p = prod(I1, p), c2p = prod(I2, p);
  // Per-window linear fit q = a1·I1 + a2·I2 + b: a from the 2x2 covariance
  // (regularised by eps on the diagonal), b from the means. Written back over
  // the correlation buffers, which are not read again.
  const a1 = c11, a2 = c22, b = c12;
  for (let i = 0; i < n; i++) {
    const v11 = c11[i] - m1[i] * m1[i] + eps;
    const v22 = c22[i] - m2[i] * m2[i] + eps;
    const v12 = c12[i] - m1[i] * m2[i];
    const k1 = c1p[i] - m1[i] * mp[i];
    const k2 = c2p[i] - m2[i] * mp[i];
    const det = v11 * v22 - v12 * v12;
    const A1 = det > 1e-12 ? (v22 * k1 - v12 * k2) / det : 0;
    const A2 = det > 1e-12 ? (v11 * k2 - v12 * k1) / det : 0;
    const B = mp[i] - A1 * m1[i] - A2 * m2[i];
    a1[i] = A1; a2[i] = A2; b[i] = B;
  }
  const ma1 = mean(a1), ma2 = mean(a2), mb = mean(b);
  const data = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const q = ma1[i] * I1[i] + ma2[i] * I2[i] + mb[i];
    data[i] = Math.round(255 * Math.min(1, Math.max(0, Number.isFinite(q) ? q : 0)));
  }
  return { w, h, data };
}
