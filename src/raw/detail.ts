// Detail: capture sharpening (high frequency) + Texture (mid frequency), on
// LINEAR data, mirroring the denoise pattern (raw/denoise.ts).
//
// Both are a luminance high-pass built from the pixel's neighbourhood and folded
// back as a HUE-PRESERVING luminance gain (multiply all three channels alike),
// so colour never shifts — only local contrast changes. Two Gaussian blurs of
// the linear luma give three bands:
//   sharpen = Lc - blurS       (finer than sigma S — edges/detail)
//   texture = blurS - blurT     (a band between sigma S and T — surface structure)
// Clarity/dehaze already own the LOW band (a big blurred map, see localmap.ts),
// so sharpen/texture stay in the high/mid bands and don't fight it.
//
// Placement mirrors denoise: it runs on linear sensor data right AFTER denoise
// and BEFORE white balance / exposure amplify things — the GPU preview shader
// (gl.ts) implements the identical formula inline, so keep the constants below
// in sync with the u_sharpen/u_texture block there. GPU==CPU parity is verified
// in a headless harness the same way the bilateral is.
//
// Note (accepted for v1): the high-pass is measured from the RAW (pre-denoise)
// neighbourhood while the gain scales the DENOISED centre — cheap on the GPU (no
// per-neighbour denoise) and matched on the CPU. With denoise off (the common
// case) raw == denoised, so it's a pure unsharp; with denoise on, strong
// sharpening can re-introduce a little of the grain denoise removed, as in most
// pipelines that sharpen after denoise.

import type { LinearSampler } from "./denoise";

const REC = [0.2126, 0.7152, 0.0722];

// --- Shared constants (mirror these literals in gl.ts) ---
export const DETAIL_R = 3; // 7x7 neighbourhood (the larger, texture, radius)
export const DETAIL_SIGMA_S = 1.0; // sharpen blur sigma (high-frequency cut)
export const DETAIL_SIGMA_T = 2.0; // texture blur sigma (mid-frequency cut)
export const DETAIL_KS = 2.2; // sharpen strength (slider 0..1)
export const DETAIL_KT = 2.4; // texture strength (slider -1..1)
export const DETAIL_EPS = 0.05; // shadow floor for the relative high-pass — also
                                // keeps sharpening from amplifying deep-shadow noise
export const DETAIL_GAIN_MIN = 0.25; // clamp the luminance gain so haloes stay bounded
export const DETAIL_GAIN_MAX = 3.0;

/** Gaussian weights for the two blurs over the [-R..R]^2 window, row-major. */
function gauss(sigma: number): number[] {
  const w: number[] = [];
  const inv = 1 / (2 * sigma * sigma);
  for (let dy = -DETAIL_R; dy <= DETAIL_R; dy++) {
    for (let dx = -DETAIL_R; dx <= DETAIL_R; dx++) {
      w.push(Math.exp(-(dx * dx + dy * dy) * inv));
    }
  }
  return w;
}
const WS = gauss(DETAIL_SIGMA_S);
const WT = gauss(DETAIL_SIGMA_T);

/**
 * Wrap a linear-RGB sampler with sharpen + texture. `raw` supplies the
 * neighbourhood the high-pass is measured from (pre-denoise, matching the
 * shader's fetchLin); `base` supplies the centre colour the gain scales
 * (post-denoise). Luma rows are cached in a small ring, like the denoiser, so
 * scanning exports stay close to 1x decode cost.
 */
export function makeRowDetail(
  raw: LinearSampler,
  base: LinearSampler,
  width: number,
  height: number,
  sharpen: number,
  texture: number,
  step = 1,
): LinearSampler {
  if (sharpen <= 0 && texture === 0) return base;

  // The GPU preview taps in PROXY texels (gl.ts uses `* u_texel`, and the live
  // texture is downscaled by `step` — a half-res RAW bin, or toPreview's copy).
  // One proxy texel spans `step` native pixels, so at export we tap the SAME
  // 7x7 grid at `step`-pixel spacing to reproduce the previewed footprint. The
  // WS/WT weights are in tap-index units, so they stay identical — only the
  // sample positions widen. step === 1 leaves the sampling byte-identical.
  const tapOff = new Int32Array(DETAIL_R * 2 + 1);
  for (let d = -DETAIL_R; d <= DETAIL_R; d++) tapOff[d + DETAIL_R] = Math.round(d * step);
  const rowSpan = tapOff[DETAIL_R * 2] * 2 + 4; // rows the vertical taps reach + scan margin

  const lumaRows = new Map<number, Float32Array>();
  const getLumaRow = (y: number): Float32Array => {
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    let row = lumaRows.get(cy);
    if (!row) {
      row = new Float32Array(width);
      for (let x = 0; x < width; x++) {
        const [r, g, b] = raw(x, cy);
        row[x] = r * REC[0] + g * REC[1] + b * REC[2];
      }
      lumaRows.set(cy, row);
      while (lumaRows.size > rowSpan) {
        lumaRows.delete(lumaRows.keys().next().value!);
      }
    }
    return row;
  };

  return (x, y) => {
    const c = base(x, y);
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    let sumS = 0, sumT = 0, wsumS = 0, wsumT = 0, Lc = 0;
    let k = 0;
    for (let dy = -DETAIL_R; dy <= DETAIL_R; dy++) {
      const row = getLumaRow(y + tapOff[dy + DETAIL_R]);
      for (let dx = -DETAIL_R; dx <= DETAIL_R; dx++, k++) {
        let sx = cx + tapOff[dx + DETAIL_R];
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const L = row[sx];
        if (dx === 0 && dy === 0) Lc = L;
        sumS += L * WS[k];
        wsumS += WS[k];
        sumT += L * WT[k];
        wsumT += WT[k];
      }
    }
    const blurS = sumS / wsumS;
    const blurT = sumT / wsumT;
    const hp = DETAIL_KS * sharpen * (Lc - blurS) + DETAIL_KT * texture * (blurS - blurT);
    let gain = 1 + hp / (Lc + DETAIL_EPS);
    if (gain < DETAIL_GAIN_MIN) gain = DETAIL_GAIN_MIN;
    else if (gain > DETAIL_GAIN_MAX) gain = DETAIL_GAIN_MAX;
    return [c[0] * gain, c[1] * gain, c[2] * gain];
  };
}
