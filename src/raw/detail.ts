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
 * (post-denoise).
 *
 * A ROW IS FILLED WHERE IT IS READ, NOT ACROSS THE WHOLE IMAGE — the same fix
 * the denoiser carries, and this file CLAIMED to carry it: the sentence here
 * used to say luma rows were cached in a small ring "like the denoiser, so
 * scanning exports stay close to 1x decode cost", above a Map that filled every
 * pixel of a source row the first time any tap landed on it. A comment is not a
 * ring.
 *
 * MEASURED, on 700,000 output pixels of a 1000x700 source, counting the samples
 * the fill takes against the pixels the picture asks for: 2.0 samples per pixel
 * scanning row by row, 4.4 through a 30% crop, 75.6 down a four-degree slant,
 * and 1001 down the columns. On the real export path a 1.88-megapixel crop of a
 * 20.9-megapixel raw took 4.8 seconds sharpened, and 207 seconds sharpened and
 * straightened by four degrees — 110 seconds a megapixel against 2.6, for the
 * same picture. The horizon leveller makes that combination ordinary.
 *
 * Under a straighten of a few degrees, consecutive output pixels move down the
 * source by sin(angle), so the source row changes every handful of pixels and a
 * ring of ten evicts constantly; each miss paid a full image width of decode for
 * the three or four pixels actually wanted. Filling on demand makes the cost
 * proportional to the pixels actually touched, which is what a cache is for.
 *
 * The values are unchanged — the same sampler is called for the same
 * coordinates and the luma is stored in the same float32 array it always was,
 * so it rounds where it always rounded. `detailparity.mjs` asserts that rather
 * than assuming it, over four scan orders including the slant.
 *
 * A GENERATION COUNTER RATHER THAN CLEARING THE FLAGS, for the reason the
 * denoiser gives: clearing `width` flags per miss puts most of the thrashing
 * cost straight back.
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

  interface LumaRow {
    y: number;
    /** FLOAT32 ON PURPOSE. The luma is a double computed from the sampler's
     *  values and has always been stored here, so it has always been rounded to
     *  float32 before anything read it back. A wider array would be more
     *  accurate and would change every sharpened pixel in the app. */
    l: Float32Array;
    /** How many blocks of this generation are filled — `blocks` means the row is
     *  whole, which is the ordinary case one output row into a full-frame export
     *  and lets the span check below be a single comparison. */
    full: number;
    /** Which generation filled each BLOCK of sixteen pixels. Equal to `gen`
     *  means present. A miss fills sixteen pixels rather than the five thousand
     *  six hundred an image-wide fill would, and the extra samples inside a
     *  block cannot change a value: the sampler is asked for coordinates it
     *  would have been asked for anyway. */
    seen: Int32Array;
    gen: number;
  }
  /** Sixteen pixels, aligned — see LumaRow.seen for why sixteen. */
  const BLOCK = 16, BSHIFT = 4;
  const blocks = ((width + BLOCK - 1) >> BSHIFT) || 1;
  const ring: LumaRow[] = [];
  const byY = new Map<number, LumaRow>();
  let nextSlot = 0;
  const getLumaRow = (y: number): LumaRow => {
    const cy = y < 0 ? 0 : y >= height ? height - 1 : y;
    const hit = byY.get(cy);
    if (hit) return hit;
    let row: LumaRow;
    if (ring.length < rowSpan) {
      row = { y: cy, l: new Float32Array(width), seen: new Int32Array(blocks), gen: 1, full: 0 };
      ring.push(row);
    } else {
      // Oldest slot, round-robin — the eviction order the Map had, and the right
      // one for a scan that drifts in one direction.
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
  /** Make sure this row holds every pixel the seven taps at cx will read, then
   *  get out of the inner loop's way.
   *
   *  ONCE PER TAP ROW, NOT ONCE PER TAP, and getting there took three measured
   *  attempts. Asking a small function for each of the forty-nine taps cost 18%
   *  on an ordinary whole-frame export — 33.2 seconds to 39.3 — whether it
   *  tested one pixel or a block of sixteen, so the expense was never the test:
   *  it was replacing forty-nine array loads with forty-nine calls. Hoisted to
   *  one call per tap row, with the whole-row short circuit above, the same
   *  export is 34.6 seconds — 4% over the eager fill it replaces — while the
   *  straightened crop that cost 207 seconds costs 8.8. The dx loop below reads
   *  straight out of the row again.
   *
   *  (A fourth attempt held the seven row objects while y stood still, to skip
   *  seven map lookups per pixel. It is NOT here: round-robin eviction can
   *  recycle a row that is still being held, and the parity harness said so.
   *  It was worth two seconds.) */
  const fillSpan = (row: LumaRow, cx: number): void => {
    if (row.full === blocks) return;
    let lo = cx + tapOff[0];
    if (lo < 0) lo = 0;
    let hi = cx + tapOff[DETAIL_R * 2];
    if (hi > width - 1) hi = width - 1;
    const bHi = hi >> BSHIFT;
    for (let b = lo >> BSHIFT; b <= bHi; b++) {
      if (row.seen[b] === row.gen) continue;
      const x1 = Math.min(width, (b << BSHIFT) + BLOCK);
      for (let i = b << BSHIFT; i < x1; i++) {
        const s = raw(i, row.y);
        row.l[i] = s[0] * REC[0] + s[1] * REC[1] + s[2] * REC[2];
      }
      row.seen[b] = row.gen;
      row.full++;
    }
  };

  // One array for the life of this sampler — see LinearSampler on why.
  const scratch: [number, number, number] = [0, 0, 0];
  return (x, y) => {
    // THE CENTRE COLOUR, HELD AS THREE NUMBERS AND NOT AS AN ARRAY. `base` is
    // allowed to hand back a buffer it reuses — the contract on LinearSampler
    // says so in those words — and when denoise is off `makeRowDenoiser` returns
    // the RAW sampler unchanged, so `base` and `raw` are then the same function
    // with the same scratch array. Holding the array across the forty-nine taps
    // below meant the centre colour became whatever the last tap sampled: a
    // wrong pixel wherever a tap missed the cache, which is the first pixel of
    // every row on an ordinary export and most of the picture on a straightened
    // one. Only ever visible with denoise at zero and sharpen or texture up.
    const cb = base(x, y);
    const c0 = cb[0], c1 = cb[1], c2 = cb[2];
    const cx = x < 0 ? 0 : x >= width ? width - 1 : x;
    let sumS = 0, sumT = 0, wsumS = 0, wsumT = 0, Lc = 0;
    let k = 0;
    for (let dy = -DETAIL_R; dy <= DETAIL_R; dy++) {
      const row = getLumaRow(y + tapOff[dy + DETAIL_R]);
      fillSpan(row, cx);
      const l = row.l;
      for (let dx = -DETAIL_R; dx <= DETAIL_R; dx++, k++) {
        let sx = cx + tapOff[dx + DETAIL_R];
        if (sx < 0) sx = 0;
        else if (sx >= width) sx = width - 1;
        const L = l[sx];
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
    scratch[0] = c0 * gain;
    scratch[1] = c1 * gain;
    scratch[2] = c2 * gain;
    return scratch;
  };
}
