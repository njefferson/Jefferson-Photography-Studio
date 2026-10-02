// Detail: capture sharpening (high frequency) + Texture (mid frequency), on
// LINEAR data, mirroring the denoise pattern (raw/denoise.ts).
//
// Both are a luminance high-pass built from the pixel's neighbourhood and folded
// back as a HUE-PRESERVING luminance gain (multiply all three channels alike),
// so colour never shifts — only local contrast changes:
//   sharpen = Lc - blurX              (finer than sigma X — edges/detail)
//   texture = blurS - blurT            (a band between sigma S and T — surface structure)
// Clarity/dehaze already own the LOW band (a big blurred map, see localmap.ts),
// so sharpen/texture stay in the high/mid bands and don't fight it.
//
// Placement mirrors denoise: it runs on linear sensor data right AFTER denoise
// and BEFORE white balance / exposure — the GPU preview shader (gl.ts)
// implements the identical formula inline, so keep the constants below in sync
// with the u_sharpen/u_texture block there.
//
// FIVE THINGS CHANGED ON 2026-10-02, each the way the reference does it:
//
// 1. THE HIGH-PASS IS MEASURED FROM THE DENOISED PICTURE. It used to be taken
//    from the raw, pre-denoise neighbourhood and multiplied onto the denoised
//    centre, so Sharpen 1 put back 1.54x the raw's OWN noise on a flat field.
//    darktable's order runs denoise (9.0) before sharpen (35.0) and each module
//    reads the one before; its sharpen builds its blur from its own input. The
//    shader does the same through a luminance pre-pass (gl.ts, u_detailTex).
// 2. A SOFT THRESHOLD on the sharpening, as darktable's sharpen.c has it
//    (`detail = |diff| > threshold ? copysign(|diff| - threshold, diff) : 0`).
//    Without one, every flat region's grain was sharpened — in this app, the
//    infrared sky. The threshold here is RELATIVE to the local mean, so it
//    means the same at every exposure (darktable's is 0.5 L*, which is about 2%
//    of the luminance at mid-grey).
// 3. CAPTURE SHARPENING AT NATIVE RESOLUTION. The sharpen blur's sigma is in
//    NATIVE sensor pixels and its taps are one sampler pixel apart; the export
//    used to space them `proxyFactor` (2 for a raw) apart to copy the preview,
//    and a stride-2 kernel has no response at the sensor's Nyquist, so the
//    finest detail was never sharpened. RawTherapee's capture sharpening works
//    on full-resolution luminance with a radius measured in sensor pixels. The
//    preview APPROXIMATES it on a proxy whose texel is `pitch` native pixels —
//    with the sigma `sharpenSigmaTexels` gives, NOT sigma/pitch. A proxy texel
//    is the BOX MEAN of pitch x pitch sensor pixels, and a box of width p adds
//    (p^2 - 1)/12 to a blur's variance; sigma/pitch drops it, and seen at the
//    preview's own scale the preview then showed 0.65-0.72 of the export's
//    sharpening (NIR_1651 and NIR_3697, Sharpen 1, review 2026-10-02). With the
//    box's variance kept it shows 0.97-1.02 of it.
// 4. A PURE RATIO. The gain divided by (Lc + 0.05) on values taken BEFORE
//    exposure and white balance, so the same edge sharpened differently
//    depending on how the frame was exposed in camera. It is Lout / Lc now with
//    RawTherapee's 0.00001 floor (`YNew / max(YOld, 0.00001f)`), so the result
//    scales with the input.
// 5. THE TEXTURE BLUR IS THE GAUSSIAN IT NAMES. Sigma 2 sat in a 7x7 window,
//    +/-1.5 sigma; it has the 13x13 RawTherapee gives a sigma above 1.5.
//    Texture stays in PREVIEW units (its taps `step` apart at export): it is a
//    mid-frequency band the reader tuned by eye on the proxy, not a sensor
//    property.

import type { LinearSampler } from "./denoise";

const REC = [0.2126, 0.7152, 0.0722];

// --- Shared constants (mirror these literals in gl.ts) ---
export const DETAIL_RS = 3; // sharpen window, +/-3 taps (7x7) one sampler pixel apart
export const DETAIL_R = 6; // texture window, +/-6 taps (13x13): +/-3 sigma of sigma T
export const DETAIL_SIGMA_S = 1.0; // sharpen blur sigma, in NATIVE sensor pixels
export const DETAIL_SIGMA_M = 1.0; // texture band's inner blur sigma, in taps
export const DETAIL_SIGMA_T = 2.0; // texture band's outer blur sigma, in taps
export const DETAIL_KS = 2.2; // sharpen strength (slider 0..1)
export const DETAIL_KT = 2.4; // texture strength (slider -1..1)
export const DETAIL_THRESH = 0.02; // soft threshold on sharpen's high-pass, as a fraction of the local mean
export const DETAIL_EPS = 1e-5; // ratio floor (RawTherapee's) — not a shadow floor
export const DETAIL_GAIN_MIN = 0.25; // clamp the luminance gain so haloes stay bounded
export const DETAIL_GAIN_MAX = 3.0;

/** THE SHARPEN BLUR'S SIGMA IN SAMPLER PIXELS, for a sampler whose pixel spans
 *  `pitch` native sensor pixels.
 *
 *  @param pitch native pixels per sampler pixel: 1 at export, 2 on a raw's
 *               half-size proxy, the scale factor on an 8-bit proxy.
 *  @returns sqrt(DETAIL_SIGMA_S^2 + (p^2 - 1)/12) / p, p = max(1, pitch) —
 *           exactly DETAIL_SIGMA_S at pitch 1.
 *
 *  What the result must satisfy: the CPU (makeRowDetail) and the shader
 *  (gl.ts, u_sharpK) both take it from here, so the two sides cannot disagree;
 *  and on a proxy it is the blur that, applied to the box-averaged texels,
 *  matches the native-resolution sharpening box-averaged to the same texels —
 *  the (p^2 - 1)/12 is the variance a width-p box adds, which sigma/pitch
 *  dropped (header, item 3). */
export function sharpenSigmaTexels(pitch: number): number {
  const p = Number.isFinite(pitch) && pitch > 1 ? pitch : 1;
  return Math.sqrt(DETAIL_SIGMA_S * DETAIL_SIGMA_S + (p * p - 1) / 12) / p;
}

/** Gaussian weights over a [-r..r]^2 window, row-major, in tap-index units.
 *  @param sigma the blur's sigma in taps.
 *  @param r     the window's half-width in taps.
 *  @returns (2r+1)^2 unnormalised weights; the caller divides by their sum, as
 *  the shader does. */
function gauss(sigma: number, r: number): number[] {
  const w: number[] = [];
  const inv = 1 / (2 * sigma * sigma);
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      w.push(Math.exp(-(dx * dx + dy * dy) * inv));
    }
  }
  return w;
}
const WM = gauss(DETAIL_SIGMA_M, DETAIL_R);
const WT = gauss(DETAIL_SIGMA_T, DETAIL_R);

/** THE GAIN DETAIL APPLIES TO ONE PIXEL, from the three blurs around it — the
 *  one formula, so the CPU sampler below and anything that checks it cannot
 *  hold two versions.
 *
 *  @param lc      the denoised luminance at the pixel.
 *  @param blurX   the sharpen blur (sigma DETAIL_SIGMA_S native pixels); unused
 *                 when `sharpen` is 0.
 *  @param blurM   the texture band's inner blur; unused when `texture` is 0.
 *  @param blurT   the texture band's outer blur; unused when `texture` is 0.
 *  @param sharpen the slider, 0..1.
 *  @param texture the slider, -1..1.
 *  @returns the factor to multiply all three channels by, in
 *  [DETAIL_GAIN_MIN, DETAIL_GAIN_MAX].
 *
 *  What the result must satisfy: it is the shader's `gain` in gl.ts's detail
 *  block, number for number. A pixel whose relative high-pass is inside the
 *  threshold gets no sharpening at all (gain 1 when texture is 0), and scaling
 *  the whole neighbourhood by any exposure leaves the gain unchanged above the
 *  1e-5 floor. */
export function detailGain(lc: number, blurX: number, blurM: number, blurT: number, sharpen: number, texture: number): number {
  let lout = lc;
  if (sharpen > 0) {
    const ref = blurX > DETAIL_EPS ? blurX : DETAIL_EPS;
    const rel = (lc - blurX) / ref;
    const soft = rel > DETAIL_THRESH ? rel - DETAIL_THRESH : rel < -DETAIL_THRESH ? rel + DETAIL_THRESH : 0;
    lout += DETAIL_KS * sharpen * soft * ref;
  }
  if (texture !== 0) lout += DETAIL_KT * texture * (blurM - blurT);
  let gain = lout / (lc > DETAIL_EPS ? lc : DETAIL_EPS);
  if (gain < DETAIL_GAIN_MIN) gain = DETAIL_GAIN_MIN;
  else if (gain > DETAIL_GAIN_MAX) gain = DETAIL_GAIN_MAX;
  return gain;
}

/**
 * Wrap a linear-RGB sampler with sharpen + texture.
 *
 * @param base    the DENOISED sampler (after the noise stage and its aim):
 *                both the neighbourhood the high-pass is measured from and the
 *                centre colour the gain scales — one picture, as darktable's
 *                sharpen reads its own input.
 * @param width   the sampler's width in pixels.
 * @param height  the sampler's height in pixels.
 * @param sharpen the Sharpen slider, 0..1.
 * @param texture the Texture slider, -1..1.
 * @param step    how many sampler pixels apart the TEXTURE taps sit: the
 *                proxy factor at export, so the band is the one the reader
 *                previewed; 1 on the proxy itself.
 * @param pitch   how many NATIVE sensor pixels one sampler pixel spans: 1 at
 *                export, 2 on a raw's half-size proxy. The sharpen sigma is
 *                `sharpenSigmaTexels(pitch)` sampler pixels.
 * @returns a sampler giving the detailed colour, or `base` itself when both
 *          sliders are off. Its array is reused by the next call.
 *
 * What the result must satisfy: at every pixel it is `base` times
 * `detailGain(...)` of that pixel's own blurs, which is what the shader computes
 * at the same texel when its taps match (u_detailPx, u_texel, u_sharpK); the
 * GPU parity harness holds the two together. Consumers: export.ts (wrapped in
 * AIM_TEXTURE's aimedSampler) and the sky map's pre-pass in main.ts.
 *
 * A ROW IS FILLED WHERE IT IS READ, NOT ACROSS THE WHOLE IMAGE — the same fix
 * the denoiser carries. Measured when that landed, on 700,000 output pixels of
 * a 1000x700 source: 2.0 samples per pixel scanning row by row, 4.4 through a
 * 30% crop, 75.6 down a four-degree slant, and 1001 down the columns, against
 * an image-wide fill; on the real export path a straightened crop went from 207
 * seconds to 8.8. Under a straighten of a few degrees the source row changes
 * every handful of pixels, so a whole-row fill paid an image width of decode
 * for three or four pixels.
 *
 * THE ROW HOLDS THE DENOISED COLOUR AS WELL AS ITS LUMA, so each pixel is
 * denoised ONCE: the neighbourhood is the denoised picture now, and asking
 * `base` again for the centre would run the 13x13 bilateral a second time per
 * pixel. A GENERATION COUNTER RATHER THAN CLEARING THE FLAGS, for the reason
 * the denoiser gives: clearing `width` flags per miss puts most of the
 * thrashing cost straight back.
 */
export function makeRowDetail(
  base: LinearSampler,
  width: number,
  height: number,
  sharpen: number,
  texture: number,
  step = 1,
  pitch = 1,
): LinearSampler {
  if (sharpen <= 0 && texture === 0) return base;

  // Texture taps in PROXY texels, `step` sampler pixels apart, so the band is
  // the one the reader tuned; the weights are in tap-index units and stay put.
  const tapOff = new Int32Array(DETAIL_R * 2 + 1);
  for (let d = -DETAIL_R; d <= DETAIL_R; d++) tapOff[d + DETAIL_R] = Math.round(d * step);
  // Sharpen taps one sampler pixel apart, sigma in native pixels carried to
  // this sampler's scale (sharpenSigmaTexels).
  const sigX = sharpenSigmaTexels(pitch);
  const WX = gauss(sigX, DETAIL_RS);
  const reach = Math.max(texture !== 0 ? tapOff[DETAIL_R * 2] : 0, sharpen > 0 ? DETAIL_RS : 0);
  const rowSpan = reach * 2 + 4; // rows the vertical taps reach + scan margin

  interface DetailRow {
    y: number;
    /** FLOAT32: the luma the blurs read. */
    l: Float32Array;
    /** The denoised colour, three per pixel — the centre the gain scales. */
    c: Float32Array;
    /** How many blocks of this generation are filled — `blocks` means whole. */
    full: number;
    /** Which generation filled each BLOCK of sixteen pixels. */
    seen: Int32Array;
    gen: number;
  }
  /** Sixteen pixels, aligned — a miss fills sixteen rather than a whole row. */
  const BLOCK = 16, BSHIFT = 4;
  const blocks = ((width + BLOCK - 1) >> BSHIFT) || 1;
  const ring: DetailRow[] = [];
  const byY = new Map<number, DetailRow>();
  let nextSlot = 0;
  const getRow = (y: number): DetailRow => {
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    const hit = byY.get(cy);
    if (hit) return hit;
    let row: DetailRow;
    if (ring.length < rowSpan) {
      row = { y: cy, l: new Float32Array(width), c: new Float32Array(width * 3), seen: new Int32Array(blocks), gen: 1, full: 0 };
      ring.push(row);
    } else {
      // Oldest slot, round-robin — the right eviction for a scan that drifts
      // in one direction.
      row = ring[nextSlot];
      nextSlot = (nextSlot + 1) % rowSpan;
      byY.delete(row.y);
      row.y = cy;
      row.gen++;
      row.full = 0;
    }
    byY.set(cy, row);
    return row;
  };
  /** Make sure this row holds every pixel the taps at cx will read. Once per
   *  tap ROW, not once per tap: forty-nine calls per pixel cost 18% of a
   *  whole-frame export when that was measured; one per row costs 4%. */
  const fillSpan = (row: DetailRow, cx: number): void => {
    if (row.full === blocks) return;
    let lo = cx - reach;
    if (lo < 0) lo = 0;
    let hi = cx + reach;
    if (hi > width - 1) hi = width - 1;
    const bHi = hi >> BSHIFT;
    for (let b = lo >> BSHIFT; b <= bHi; b++) {
      if (row.seen[b] === row.gen) continue;
      const x1 = Math.min(width, (b << BSHIFT) + BLOCK);
      for (let i = b << BSHIFT; i < x1; i++) {
        // Read at once: `base` may hand back an array it reuses.
        const s = base(i, row.y);
        const r = s[0], g = s[1], bl = s[2];
        row.c[i * 3] = r; row.c[i * 3 + 1] = g; row.c[i * 3 + 2] = bl;
        row.l[i] = r * REC[0] + g * REC[1] + bl * REC[2];
      }
      row.seen[b] = row.gen;
      row.full++;
    }
  };

  // One array for the life of this sampler — see LinearSampler on why.
  const scratch: [number, number, number] = [0, 0, 0];
  return (x, y) => {
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    // The centre row first, so its colour is read before any eviction below
    // can recycle it; the ring holds at least rowSpan rows, more than the taps
    // reach, so the centre row survives the loops anyway.
    const crow = getRow(cy);
    fillSpan(crow, cx);
    const c0 = crow.c[cx * 3], c1 = crow.c[cx * 3 + 1], c2 = crow.c[cx * 3 + 2];
    const Lc = crow.l[cx];
    let blurX = 0, blurM = 0, blurT = 0;
    if (sharpen > 0) {
      let sum = 0, wsum = 0, k = 0;
      for (let dy = -DETAIL_RS; dy <= DETAIL_RS; dy++) {
        const row = getRow(cy + dy);
        fillSpan(row, cx);
        const l = row.l;
        for (let dx = -DETAIL_RS; dx <= DETAIL_RS; dx++, k++) {
          let sx = cx + dx;
          if (sx < 0) sx = 0;
          else if (sx >= width) sx = width - 1;
          sum += l[sx] * WX[k];
          wsum += WX[k];
        }
      }
      blurX = sum / wsum;
    }
    if (texture !== 0) {
      let sumM = 0, sumT = 0, wsumM = 0, wsumT = 0, k = 0;
      for (let dy = -DETAIL_R; dy <= DETAIL_R; dy++) {
        const row = getRow(cy + tapOff[dy + DETAIL_R]);
        fillSpan(row, cx);
        const l = row.l;
        for (let dx = -DETAIL_R; dx <= DETAIL_R; dx++, k++) {
          let sx = cx + tapOff[dx + DETAIL_R];
          if (sx < 0) sx = 0;
          else if (sx >= width) sx = width - 1;
          const L = l[sx];
          sumM += L * WM[k];
          wsumM += WM[k];
          sumT += L * WT[k];
          wsumT += WT[k];
        }
      }
      blurM = sumM / wsumM;
      blurT = sumT / wsumT;
    }
    const gain = detailGain(Lc, blurX, blurM, blurT, sharpen, texture);
    scratch[0] = c0 * gain;
    scratch[1] = c1 * gain;
    scratch[2] = c2 * gain;
    return scratch;
  };
}
