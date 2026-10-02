// Image decoding. Three real paths, no big WASM dependency:
//   - JPEG/PNG: native bitmap decode.
//   - Lossy linear DNG (8-bit, baseline-JPEG tile, Photometric 34892): decode
//     natively; gamma-2.2 -> linear happens in the shader.
//   - Mosaiced DNG (14-bit, lossless-JPEG, Photometric 32803 = CFA): pure-JS
//     LJ92 decode + demosaic -> linear float. (Verified bit-exact vs LibRaw.)
// Anything else (e.g. Nikon NEF compression) falls back to the embedded preview
// until its decoder lands.
// It also holds what everything that reads a decoded photograph shares: the
// pixel reader (linearAt), the sensor-clip test read before the lens flat
// (pinTest), and the at-open automatics measured from it — gray-world balance,
// auto exposure, auto recover and the tap-to-balance patch.

import type { ImportedFile } from "./import";
import { Tiff, type Ifd } from "./raw/tiff";
import { decodeMosaicedDng } from "./raw/dngRaw";
import { decodeNef } from "./raw/nef";
import { camToSrgbLinear, nikonColorMatrix } from "./color";
import { srgbToLinear } from "./icc";
import { lensGeom, lensRadius, lensLerp, SENSOR_PIN, type BrushMask } from "./pipeline";

/** The photograph's sky selection, built once from the undegraded decode —
 *  gray-world balance only, no exposure, correction or look — so it never
 *  moves as the photograph is graded (skyfine.ts). `mask` is the 384 px
 *  bitmap `buildSkyMask` grows (null when no clear sky was found), `fine` its
 *  refinement to the picture's edges. Every sky-aware operation reads this one
 *  selection: the look's smoothing and depth, the tile, the batch export. */
export interface SkySelection {
  mask: BrushMask | null;
  fine: BrushMask | null;
  /** The turn it was found at (sky.ts `skyTurn`, 0..3): which edge of the file
   *  was taken as up. A picture shown at any other turn must not read it
   *  (decision 070) — its sky is on a different edge. */
  turn: number;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** The sky selection, once it has been built — by the decode worker on the
   *  lane that decoded this photograph (a moment after the picture itself,
   *  so the picture never waits on it), or on this thread when no worker is
   *  running. Absent until then; `skySelReady` says when. */
  skySel?: SkySelection;
  /** Resolves with the selection when the worker posts it, or null if the
   *  lane died first — the caller then builds it on this thread. Absent when
   *  the decode was not asked for a selection. */
  skySelReady?: Promise<SkySelection | null>;
  /** 8-bit gamma-encoded RGBA (JPEG/preview/lossy-linear path). */
  pixels?: Uint8ClampedArray;
  /** Linear float RGBA (mosaiced-raw path). Present instead of `pixels`. */
  linear?: Float32Array;
  /** What the linear copy was corrected with at decode (the lens flat,
   *  decision 021), so a later strength re-applies as a ratio against it.
   *  Absent on 8-bit sources, which take the correction inside the grade. */
  lensApplied?: import("./lensflat").LensApplied;
  /** Camera-native -> linear sRGB 3x3 (row-major), applied after white balance.
   *  Present only for camera-native raw (NEF, mosaiced DNG); absent when the
   *  source is already display/profiled (JPEG, preview, lossy-linear DNG). */
  camMatrix?: number[];
  /** True when these are true (un-white-balanced) sensor values. */
  isRaw: boolean;
  /** Display rotation in 90-degree CW steps, from the file's Orientation tag. */
  rotate?: number;
  /** Honesty note for the user when the open succeeded but NOT as raw — e.g.
   *  a Canon CR2 opened via its embedded JPEG preview. The UI must surface
   *  this (hint/alert), or the user believes they're editing raw data. */
  previewNotice?: string;
}

/** Clamp `v` into [lo, hi]. */
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** THE WHITE-BALANCE GAIN RANGE every slider and every clamp in the app shares.
 *  The track maps 0..`WB_GAIN_STEPS` exponentially onto `WB_GAIN_LO`..
 *  `WB_GAIN_HI` (main.ts toPos/fromPos). It was 0.02..16 over 1000 steps while
 *  the gains were scaled to unit luma; scaled so the SMALLEST is 1 (below), an
 *  infrared balance's largest gain is the whole spread between its channels —
 *  18.6 at the R0.42/G7.8/B2.1 measured on real files — which 16 cannot hold.
 *  So the track is EXTENDED rather than re-spaced: 1300 steps over 0.02 x
 *  800^1.3 keeps every one of the old 1000 positions on exactly the value it
 *  had (each step is still 800^(1/1000)), and a balance saved on the old track
 *  comes back to the same number. */
export const WB_GAIN_LO = 0.02;
export const WB_GAIN_STEPS = 1300;
export const WB_GAIN_HI = WB_GAIN_LO * Math.pow(800, WB_GAIN_STEPS / 1000);

/**
 * Scale a gain triple so its SMALLEST gain is exactly 1.
 *
 * That is what LibRaw's `scale_colors` does (`pre_mul[c] /= dmax` with dmax the
 * minimum when highlights are clipped) and what RawTherapee's getImage does
 * ("adjust gain so the maximum raw value of the least scaled channel just hits
 * max"): the least-gained channel's sensor ceiling stays at white, and the
 * picture's brightness is the exposure's business, not the balance's. It
 * replaces scaling to unit Rec.709 luma (`lumNormalize`), which was called
 * brightness-preserving and was not: Rec.709 weights belong to sRGB primaries,
 * not to camera channels, and on an infrared balance it put the least-gained
 * channel's ceiling about 3.8 stops below white.
 * @param g  three channel gains at any common scale, all above 0.
 * @returns the same ratios with the smallest at 1, each clamped into
 *   `WB_GAIN_LO`..`WB_GAIN_HI`, so a result here can always be written straight
 *   into `params.wb` and onto the sliders. A triple with a gain that is not a
 *   positive finite number is returned clamped and unscaled.
 * What the result must satisfy: its ratios are `g`'s unless a clamp bit, and
 *   its smallest entry is 1. Brightness moves with it, so every caller that
 *   replaces a balance on screen re-derives exposure (autoExposure) or holds it
 *   (exposureHoldingNeutral) in the same step.
 */
export function unitMinGains(g: ArrayLike<number>): [number, number, number] {
  const lo = Math.min(g[0], g[1], g[2]);
  const s = lo > 0 && Number.isFinite(lo) ? 1 / lo : 1;
  return [clampNum(g[0] * s, WB_GAIN_LO, WB_GAIN_HI), clampNum(g[1] * s, WB_GAIN_LO, WB_GAIN_HI), clampNum(g[2] * s, WB_GAIN_LO, WB_GAIN_HI)];
}

/**
 * DID THE SENSOR CLIP HERE — asked of the value the sensor recorded, not the
 * corrected one.
 *
 * A raw's linear copy carries the decode-time lens flat (decision 021). Its
 * gains run from about 0.56 to 1.14 on the shipped profiles, so a photosite
 * pinned at white reads below the pin in the centre of most of them and an
 * unclipped one is lifted over it near the edge. LibRaw tests saturation on the
 * raw values (`scale_colors`'s `maximum - 25`) and darktable runs highlight
 * reconstruction before its lens module; this divides the flat back out.
 * @param img  the decode; `img.lensApplied.gains`, when present, is the flat
 *   its linear copy carries now.
 * @returns a test of one image pixel (x, y): true when any channel, divided by
 *   the flat at that pixel, is at or above `SENSOR_PIN`. An 8-bit source has no
 *   flat in its pixels and is tested as decoded (255 reads 1).
 * What the result must satisfy: it agrees with the clip test `compileEdit` and
 *   the shader make for highlight recovery (`lensRadius` from the flat's own
 *   `lensGeom` at the pixel centre, read by `lensLerp`, exactly as
 *   `applyLensFlat` laid it). Consumers: grayWorldMeans,
 *   autoExposure, autoRecover, tap-to-balance in main.ts, prepareSkySource.
 */
export function pinTest(img: DecodedImage): (x: number, y: number) => boolean {
  const lin = img.linear;
  if (!lin) {
    return (x, y) => {
      const [r, g, b] = linearAt(img, x, y);
      return r >= SENSOR_PIN || g >= SENSOR_PIN || b >= SENSOR_PIN;
    };
  }
  const { width, height } = img;
  const flat = img.lensApplied?.gains ?? null;
  const floor = pinFloor(img);
  if (!flat) {
    return (x, y) => {
      const o = (y * width + x) * 4;
      return lin[o] >= floor || lin[o + 1] >= floor || lin[o + 2] >= floor;
    };
  }
  const geo = lensGeom(width / Math.max(1, height), flat.c);
  return (x, y) => {
    const o = (y * width + x) * 4;
    const r = lin[o], g = lin[o + 1], b = lin[o + 2];
    // Below the floor no channel can be at the pin before the flat, whatever
    // ring it sits in, so the bin is only looked up for the few bright samples.
    if (!(r >= floor || g >= floor || b >= floor)) return false;
    const rad = lensRadius((x + 0.5) / width, (y + 0.5) / height, geo);
    return r / lensLerp(flat.gr, rad, flat.n) >= SENSOR_PIN || g / lensLerp(flat.gg, rad, flat.n) >= SENSOR_PIN || b / lensLerp(flat.gb, rad, flat.n) >= SENSOR_PIN;
  };
}

/**
 * The value below which no sample of this decode can be sensor-clipped, read
 * as it is stored: `SENSOR_PIN` times the lowest gain the lens flat in its
 * linear copy carries on any channel and ring (never above `SENSOR_PIN`).
 * @param img  the decode.
 * @returns that floor; `SENSOR_PIN` for a decode whose pixels carry no flat.
 * What the result must satisfy: a pixel whose every stored channel is below it
 *   is one `pinTest` calls unclipped, so a loop that already holds the stored
 *   values may skip `pinTest` for it — which is how prepareSkySource keeps the
 *   test off the hot path of a read of every pixel.
 */
export function pinFloor(img: DecodedImage): number {
  const flat = img.linear ? img.lensApplied?.gains ?? null : null;
  if (!flat) return SENSOR_PIN;
  let lowest = Infinity;
  for (let i = 0; i < flat.n; i++) lowest = Math.min(lowest, flat.gr[i], flat.gg[i], flat.gb[i]);
  return SENSOR_PIN * Math.min(1, lowest);
}

/**
 * The frame's channel means for gray-world balance, sensor-clipped samples
 * left out.
 *
 * In infrared the red channel floods and clips first; a clipped sample holds
 * the pin, not the scene, so counting it caps red's mean and inflates red's
 * gain — and this one balance drives the open baseline, the sky selection and
 * a look's own balance. LibRaw's auto white balance (`scale_colors`) drops any
 * 8x8 block holding a photosite above `maximum - 25`; this grid samples single
 * pixels, so a sample with any channel at the pin is dropped. LibRaw does not
 * drop near-black blocks, and neither does this.
 * @param img  the decoded photograph (raw or already-profiled).
 * @returns the linear mean of each channel over a grid of about 256 samples on
 *   the short edge, each at least 1e-4, taken over the samples `pinTest` passes.
 *   A frame where every sample clipped has no colour left to read, and takes
 *   the means of all of them rather than none.
 * What the result must satisfy: it reads the photograph only — never an edit —
 *   so the balance built from it does not move as the photograph is graded.
 *   Consumers: grayWorldWB, and the IR tab's Auto WB in main.ts, which holds
 *   the brightness of this grey when it rebalances.
 */
export function grayWorldMeans(img: DecodedImage): [number, number, number] {
  const { width, height } = img;
  const pinned = pinTest(img);
  let r = 0, g = 0, b = 0, n = 0, ar = 0, ag = 0, ab = 0, an = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [pr, pg, pb] = linearAt(img, x, y);
      ar += pr; ag += pg; ab += pb; an++;
      if (pinned(x, y)) continue;
      r += pr; g += pg; b += pb; n++;
    }
  }
  if (!n) { r = ar; g = ag; b = ab; n = Math.max(1, an); }
  return [Math.max(1e-4, r / n), Math.max(1e-4, g / n), Math.max(1e-4, b / n)];
}

/**
 * Gray-world gains from three channel means.
 * @param r  red's mean; `g`, `b` green's and blue's, all above 0.
 * @returns the gains that make the three equal, scaled so the smallest is 1
 *   (`unitMinGains`).
 * What the result must satisfy: `r * gains[0] === g * gains[1] === b * gains[2]`
 *   up to the clamp. Consumers: grayWorldWB on this thread, and
 *   `buildSkySelectionFrom` (skyfine.ts) on the decode copy, so the two take one
 *   rule for one balance.
 */
export function grayWorldFromMeans(r: number, g: number, b: number): [number, number, number] {
  const mean = (r + g + b) / 3;
  return unitMinGains([mean / r, mean / g, mean / b]);
}

/**
 * Gray-world white balance over a subsampled grid, in linear space.
 * @param img  the decoded photograph (raw or already-profiled).
 * @returns gains that make the frame's unclipped channel means equal
 *   (grayWorldMeans), smallest gain 1 — the balance the sky selection, the
 *   auto-baseline and a look's own balance all start from, so it is the one
 *   balance the selection is allowed to be built at (a selection built at the
 *   live edit would drift with the grade). Brightness is not its business:
 *   every path that applies it re-derives exposure with `autoExposure`.
 */
export function grayWorldWB(img: DecodedImage): [number, number, number] {
  const [r, g, b] = grayWorldMeans(img);
  return grayWorldFromMeans(r, g, b);
}

/**
 * THE EXPOSURE THAT KEEPS ONE COLOUR AS BRIGHT AS IT WAS when the balance
 * changes to make it neutral — for the two controls that move the balance alone
 * (tap-to-balance and the IR tab's Auto WB).
 *
 * Gains with their smallest at 1 do not hold brightness by themselves (that was
 * never true of the unit-luma scaling either, which only looked as if it did),
 * so a control that replaces the balance and leaves exposure where it was would
 * jump the picture by stops. This holds the LUMINANCE of the colour being
 * balanced, measured where luminance means something: after the camera matrix,
 * in linear sRGB, where Rec.709 weights are the luminance row.
 * @param img  the photograph; its `camMatrix`, when it has one, is the
 *   conversion the luminance is read after.
 * @param lin  the camera-native linear colour being balanced: the tapped patch,
 *   or gray-world's frame means.
 * @param wbOld  the balance `lin` is shown at now; `exposureOld` the exposure.
 * @param wbNew  the new balance, which makes `lin` neutral.
 * @returns the exposure under `wbNew` that puts `lin` at the luminance it had,
 *   or `exposureOld` when either luminance is not a positive finite number.
 *   Unclamped: the caller holds it to its slider.
 * What the result must satisfy: Rec.709 luma of `cam * (result * wbNew * lin)`
 *   equals that of `cam * (exposureOld * wbOld * lin)`.
 */
export function exposureHoldingNeutral(
  img: DecodedImage,
  lin: ArrayLike<number>,
  wbOld: ArrayLike<number>,
  exposureOld: number,
  wbNew: ArrayLike<number>,
): number {
  const lumaOf = (r: number, g: number, b: number) => {
    const m = img.camMatrix;
    if (m) {
      const cr = m[0] * r + m[1] * g + m[2] * b;
      const cg = m[3] * r + m[4] * g + m[5] * b;
      const cb = m[6] * r + m[7] * g + m[8] * b;
      r = cr; g = cg; b = cb;
    }
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const before = exposureOld * lumaOf(lin[0] * wbOld[0], lin[1] * wbOld[1], lin[2] * wbOld[2]);
  const after = lumaOf(lin[0] * wbNew[0], lin[1] * wbNew[1], lin[2] * wbNew[2]);
  const e = before / after;
  return before > 0 && after > 0 && Number.isFinite(e) ? e : exposureOld;
}

/**
 * Exposure that puts the bright end of the balanced frame at 0.85.
 *
 * The bright end is the 97th percentile of CHANNEL values after balance and
 * the camera matrix, every channel of every sample pooled, as RawTherapee's
 * auto levels pool them — not of luma, which does not bound a channel's
 * clipping (a saturated pixel's top channel can be several times its luma), and
 * which weighted red and blue the other way round from the picture once the
 * swap exchanged them; pooled channels do not care about the swap. Samples the
 * sensor clipped are left out, as dcraw maps the clip level to white rather
 * than counting it: with more than 3% of a frame blown, the old percentile
 * landed on the pin and placed it at 0.85 instead of white. 97% and 0.85 are
 * kept, because on the owner's six raws they hold every at-open exposure within
 * 0.02 stops of what the luma percentile gave.
 * @param img  the decoded photograph.
 * @param wb  the balance it will be shown at.
 * @returns the exposure multiplier, clamped to 0.05..16 — inside the exposure
 *   slider's range, so the value round-trips through it exactly. Auto stops at
 *   16x; brightening further is a taste call left to the slider. A frame with
 *   nothing unclipped is measured over every sample.
 * What the result must satisfy: under `wb` and the result, at most 3% of the
 *   unclipped samples' channel values sit above 0.85. Consumers: freshBaseline
 *   and autoAdjust in main.ts, and every path that re-derives exposure after
 *   substituting a balance (applyLook, makeThumb).
 */
export function autoExposure(img: DecodedImage, wb: [number, number, number]): number {
  const cm = img.camMatrix;
  const { width, height } = img;
  const pinned = pinTest(img);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  // Typed, so the sort is numeric and three values a sample cost little more
  // than the one luma did.
  const cap = 3 * Math.ceil(width / step) * Math.ceil(height / step);
  const vals = new Float32Array(cap);
  const all = new Float32Array(cap);
  let nv = 0, na = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let [r, g, b] = linearAt(img, x, y);
      r *= wb[0];
      g *= wb[1];
      b *= wb[2];
      if (cm) {
        const cr = cm[0] * r + cm[1] * g + cm[2] * b;
        const cg = cm[3] * r + cm[4] * g + cm[5] * b;
        const cb = cm[6] * r + cm[7] * g + cm[8] * b;
        r = cr; g = cg; b = cb;
      }
      all[na++] = r; all[na++] = g; all[na++] = b;
      if (!pinned(x, y)) { vals[nv++] = r; vals[nv++] = g; vals[nv++] = b; }
    }
  }
  const use = nv ? vals.subarray(0, nv) : all.subarray(0, na);
  use.sort();
  const p = use[Math.floor(use.length * 0.97)] || 1e-4;
  return clampNum(0.85 / Math.max(p, 1e-4), 0.05, 16);
}

/**
 * Auto position for the Recover-highlights slider: 0.7 when the frame has real
 * sensor clipping, 0 when it doesn't (the at-open ruling, rev. 2 of 2026-07-25).
 * 0.7 is calibrated on the D5300 full-spectrum reference frame — the lowest
 * clean value there was 0.6, plus margin. Clipping test: more than 0.05% of
 * sampled pixels with a channel at the pin (`pinTest`, read before the lens
 * flat, the same test recovery itself makes).
 * @param img  the decoded photograph.
 * @returns 0.7 or 0; 0 for a source with no linear copy, which has no sensor
 *   values to have clipped.
 * What the result must satisfy: the trigger is the owner's ruling — the share
 *   (0.05%) and the value (0.7) are not tuning knobs. 0.05% catches any visible
 *   blown area (the D5300 reference frame is about 13% clipped) and ignores
 *   single glints and border slivers (hillside.dng's 5-row edge strip stays 0).
 *   Consumers: freshBaseline and autoAdjust in main.ts.
 */
export function autoRecover(img: DecodedImage): number {
  if (!img.linear) return 0;
  const { width, height } = img;
  const pinned = pinTest(img);
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  let clipped = 0;
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (pinned(x, y)) clipped++;
      n++;
    }
  }
  return n && clipped / n > 0.0005 ? 0.7 : 0;
}

const WB_DARK_LIN = 0.02;
const WB_PATCH = 2; // 5x5 — one pixel of a raw frame is not a measurement
/** The fewest UNCLIPPED pixels a patch must keep to carry a balance: a 3x3's
 *  worth, the smallest patch with a centre and all its neighbours. */
const WB_MIN_SAMPLES = 9;

/**
 * Average the small patch a tap landed on, clipped pixels left out, and say
 * whether what is left can carry a white balance (main.ts tap-to-balance).
 *
 * RawTherapee's spot white balance (getSpotWB) sums a picked spot's samples
 * only where no channel is at its clip level, and so does this: a clipped
 * pixel is not averaged in at any share of the patch. It used to be, up to a
 * quarter of it, into a ratio that does not exist — the sensor stopped counting
 * before the real value. The clip is read before the lens flat (`pinTest`).
 * @param img  the decoded photograph.
 * @param cx  the tapped pixel's column in `img`; `cy` its row.
 * @returns `verdict` "blown" when fewer than `WB_MIN_SAMPLES` of the 5x5
 *   patch's pixels are unclipped, "dark" when what is left is near black
 *   (below 0.02 on every channel, where a ratio is noise), and "ok" otherwise;
 *   `lin` the mean of the unclipped pixels, or of all of them when the patch
 *   is refused as blown.
 * What the result must satisfy: on "ok", `lin` holds no clipped pixel, so the
 *   gains taken from it are ratios the photograph actually recorded.
 */
export function sampleForWb(img: DecodedImage, cx: number, cy: number):
  { verdict: "ok" | "blown" | "dark"; lin: [number, number, number] } {
  const pinned = pinTest(img);
  let r = 0, g = 0, b = 0, n = 0, ar = 0, ag = 0, ab = 0, an = 0;
  for (let dy = -WB_PATCH; dy <= WB_PATCH; dy++) {
    for (let dx = -WB_PATCH; dx <= WB_PATCH; dx++) {
      const x = clampNum(cx + dx, 0, img.width - 1);
      const y = clampNum(cy + dy, 0, img.height - 1);
      const [pr, pg, pb] = linearAt(img, x, y);
      ar += pr; ag += pg; ab += pb; an++;
      if (pinned(x, y)) continue;
      r += pr; g += pg; b += pb; n++;
    }
  }
  if (n < WB_MIN_SAMPLES) return { verdict: "blown", lin: [ar / an, ag / an, ab / an] };
  const lin: [number, number, number] = [r / n, g / n, b / n];
  if (Math.max(lin[0], lin[1], lin[2]) < WB_DARK_LIN) return { verdict: "dark", lin };
  return { verdict: "ok", lin };
}

/** Linear RGB at an image pixel, from whichever buffer the decoder produced.
 *
 *  IT LIVES HERE RATHER THAN IN main.ts because everything that reads a decoded
 *  photograph needs it — the thumbnails, the frame measurements, the sky mask —
 *  and because a function inside the page module cannot be timed by the test
 *  page or moved into a worker. A copy of it in either place would be a second
 *  implementation of the one thing that must not have two. The automatics
 *  above live here for the same reason. */
export function linearAt(img: DecodedImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  if (img.linear) {
    return [
      Math.max(1e-4, img.linear[i]),
      Math.max(1e-4, img.linear[i + 1]),
      Math.max(1e-4, img.linear[i + 2]),
    ];
  }
  const p = img.pixels!;
  const toLin = (v: number) => Math.max(1e-4, srgbToLinear(v / 255));
  return [toLin(p[i]), toLin(p[i + 1]), toLin(p[i + 2])];
}

/** TIFF/EXIF Orientation (tag 274) -> display rotation in 90-degree CW steps. */
function orientationToRotate(ifds: Ifd[]): number {
  const o = ifds[0]?.num(274)[0];
  if (o === 6) return 1;
  if (o === 3) return 2;
  if (o === 8) return 3;
  return 0;
}

const PHOTO_LINEAR_RAW = 34892;
const PHOTO_CFA = 32803;
const COMP_JPEG = 7;
const COMP_LOSSY_DNG = 34892;

export async function decode(file: ImportedFile): Promise<DecodedImage> {
  if (file.kind === "jpeg" || file.kind === "png") {
    return { ...(await decodeBitmap(file.bytes)), isRaw: false };
  }
  if (file.kind === "nef") {
    try {
      const img = decodeNef(file.bytes);
      const ifds = new Tiff(file.bytes).allIfds();
      return {
        width: img.width,
        height: img.height,
        linear: img.linear,
        camMatrix: camToSrgbLinear(nikonColorMatrix(cameraModel(ifds))),
        isRaw: true,
        rotate: orientationToRotate(ifds),
      };
    } catch {
      // Only claim High-Efficiency when the file's own data says so — a
      // damaged classic NEF blamed on HE sends the user chasing the wrong fix.
      throw new Error(
        nefLooksHighEfficiency(file.bytes)
          ? "This NEF couldn't be decoded — it's a Nikon “High Efficiency” NEF (Z8/Z9, Z50 II HE/HE*), which isn't supported. " +
              "Convert it to DNG with the free Adobe DNG Converter and it will open here."
          : "This NEF couldn't be decoded — the file may be damaged or use a Nikon variant this app doesn't know yet. " +
              "Converting it to DNG with the free Adobe DNG Converter usually works.",
      );
    }
  }
  if (file.kind === "dng" || file.kind === "tiff") {
    return decodeDng(file.bytes, file);
  }
  // Unknown type: give the browser's own decoder one chance (Safari opens
  // HEIC this way), then fail with directions instead of a dead end.
  try {
    return { ...(await decodeBitmap(file.bytes)), isRaw: false };
  } catch {
    throw new Error(
      isHeic(file.bytes)
        ? "This is a HEIC photo, which this browser can't decode. Open this app in Safari to use it, or export the photo as JPEG from Photos first."
        : file.rawBrand
          ? `This is a ${file.rawBrand} raw file, which this app can't decode. ` +
            "Convert it to DNG with the free Adobe DNG Converter and it will open here."
          : "This file type isn't supported. Use JPEG, PNG, DNG or Nikon NEF — any other camera's RAW converts with the free Adobe DNG Converter.",
    );
  }
}

/** True when a NEF's raw data is High Efficiency (TicoRAW / JPEG XS), which
 *  this app does not decode. Takes the file's bytes; returns true only when the
 *  CFA raw IFD's first strip opens with the JPEG XS start-of-codestream and
 *  capabilities markers (ff 10 ff 50), the test LibRaw makes, or when that IFD
 *  carries a Compression other than 34713. HE files keep Compression 34713, so
 *  the Compression test alone never fired on one, and the reader got the
 *  generic "damaged" text instead of the HE one. Any parse trouble returns
 *  false: never claim HE without the data saying so. The caller shows the HE
 *  message only after the classic decode has already failed. */
function nefLooksHighEfficiency(bytes: Uint8Array): boolean {
  try {
    const ifds = new Tiff(bytes).allIfds();
    const cfa = ifds.find((d) => d.num(262)[0] === PHOTO_CFA);
    const comp = cfa?.num(259)[0];
    const off = cfa?.num(273)[0];
    if (off !== undefined && off + 4 <= bytes.length
      && bytes[off] === 0xff && bytes[off + 1] === 0x10 && bytes[off + 2] === 0xff && bytes[off + 3] === 0x50) return true;
    return comp !== undefined && comp !== 34713 && comp !== 1;
  } catch {
    return false;
  }
}

/** HEIC/HEIF container sniff: ISO-BMFF 'ftyp' with a HEIF brand. */
function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const tag = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (tag !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ["heic", "heix", "hevc", "heif", "mif1", "msf1"].includes(brand);
}

function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

async function decodeBitmap(bytes: Uint8Array): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  const bmp = await createImageBitmap(toBlob(bytes));
  const { canvas, ctx } = make2d(bmp.width, bmp.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, pixels: data };
}

/** The one place this module touches a canvas — and therefore the one thing
 *  that stopped it running in a worker. A worker has no `document`, but it does
 *  have OffscreenCanvas, and both give the same 2D context and the same
 *  getImageData bytes. Environment-sniffed rather than split into two modules,
 *  so the worker and the main thread run the SAME decoder and the equivalence
 *  is by construction, not by review. */
function make2d(w: number, h: number): { canvas: { width: number; height: number }; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof document === "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })! };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return { canvas, ctx };
}

async function decodeDng(bytes: Uint8Array, file?: ImportedFile): Promise<DecodedImage> {
  const ifds = new Tiff(bytes).allIfds();

  // Lossy linear DNG (8-bit) -> native baseline-JPEG decode.
  const linearRaw = ifds.find(
    (d) => d.num(254)[0] === 0 && d.num(262)[0] === PHOTO_LINEAR_RAW && isJpegComp(d.num(259)[0]),
  );
  if (linearRaw) {
    return { ...(await decodeTiledJpeg(bytes, linearRaw)), isRaw: true, rotate: orientationToRotate(ifds) };
  }

  // Mosaiced DNG -> pure-JS decode + demosaic (Compression 7 = lossless JPEG,
  // Compression 1 = uncompressed, used by the bundled example files).
  const cfaRaw = ifds.find(
    (d) => d.num(254)[0] === 0 && d.num(262)[0] === PHOTO_CFA && (d.num(259)[0] === COMP_JPEG || d.num(259)[0] === 1),
  );
  if (cfaRaw) {
    const img = decodeMosaicedDng(bytes, cfaRaw);
    const cm = readCameraMatrix(ifds) ?? nikonColorMatrix(cameraModel(ifds));
    return {
      width: img.width,
      height: img.height,
      linear: img.linear,
      camMatrix: camToSrgbLinear(cm),
      isRaw: true,
      rotate: orientationToRotate(ifds),
    };
  }

  // Fallback: embedded preview. A third-party raw (CR2/ARW/… — TIFF-based, so
  // it sniffs as "dng") lands here: the open SUCCEEDS but the user must be
  // told it's the baked-in JPEG preview, not their raw data.
  const preview = pickLargestPreview(bytes, ifds);
  if (preview) {
    const decoded = await decodeBitmap(preview);
    const notice = file?.rawBrand
      ? `This is a ${file.rawBrand} raw file — the app opened its built-in JPEG preview, not the raw data. ` +
        "For true raw editing, convert it to DNG with the free Adobe DNG Converter."
      : undefined;
    return { ...decoded, isRaw: false, previewNotice: notice };
  }
  const isDngByName = /\.dng$/i.test(file?.name ?? "");
  throw new Error(
    file?.rawBrand
      ? `This is a ${file.rawBrand} raw file, which this app can't decode. ` +
        "Convert it to DNG with the free Adobe DNG Converter and it will open here."
      : isDngByName
        ? "No decodable image found in this DNG."
        : "No decodable image found in this TIFF file.",
  );
}

/** Camera Model string (tag 272) from any IFD that carries it. */
export function cameraModel(ifds: Ifd[]): string | undefined {
  for (const d of ifds) {
    const m = d.str(272);
    if (m) return m;
  }
  return undefined;
}

/** Camera ColorMatrix (XYZ -> camera), preferring the daylight calibration.
 *  Adobe DNGs carry two: ColorMatrix1 for CalibrationIlluminant1 (often
 *  Illuminant A / tungsten) and ColorMatrix2 for CalibrationIlluminant2
 *  (usually D65). IR shooting is daylight-only and dcraw/LibRaw likewise
 *  render from the D65 matrix — picking the tungsten one bends every color
 *  (the D5300 twins mismatched exactly this way, 2026-07-25). */
export function readCameraMatrix(ifds: Ifd[]): number[] | undefined {
  // EXIF LightSource ranking, best first: D65, D55, D75, D50, daylight/fine
  // weather, untagged, then anything else (tungsten et al).
  const rank = (ill: number | undefined) =>
    ill === 21 ? 0 : ill === 20 ? 1 : ill === 22 ? 2 : ill === 23 ? 3 : ill === 1 || ill === 9 ? 4 : ill === undefined ? 5 : 6;
  let best: number[] | undefined;
  let bestRank = Infinity;
  for (const d of ifds) {
    for (const [mTag, iTag] of [
      [50722, 50779],
      [50721, 50778],
    ] as const) {
      const cm = d.num(mTag);
      if (cm.length !== 9) continue;
      const r = rank(d.num(iTag)[0]);
      if (r < bestRank) {
        bestRank = r;
        best = cm;
      }
    }
  }
  return best;
}

function isJpegComp(c: number | undefined) {
  return c === COMP_JPEG || c === COMP_LOSSY_DNG;
}

/** Decode a tiled or single-strip baseline-JPEG image and composite it. */
async function decodeTiledJpeg(bytes: Uint8Array, ifd: Ifd): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  const width = ifd.num(256)[0];
  const height = ifd.num(257)[0];
  const { ctx } = make2d(width, height);

  const tileOffsets = ifd.num(324);
  if (tileOffsets.length) {
    const tileW = ifd.num(322)[0];
    const tileH = ifd.num(323)[0];
    const counts = ifd.num(325);
    const across = Math.ceil(width / tileW);
    for (let i = 0; i < tileOffsets.length; i++) {
      const bmp = await createImageBitmap(toBlob(slice(bytes, tileOffsets[i], counts[i])));
      ctx.drawImage(bmp, (i % across) * tileW, Math.floor(i / across) * tileH);
      bmp.close();
    }
  } else {
    const stripOffsets = ifd.num(273);
    const stripCounts = ifd.num(279);
    const rowsPerStrip = ifd.num(278)[0] || height;
    for (let i = 0; i < stripOffsets.length; i++) {
      const bmp = await createImageBitmap(toBlob(slice(bytes, stripOffsets[i], stripCounts[i])));
      ctx.drawImage(bmp, 0, i * rowsPerStrip);
      bmp.close();
    }
  }
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, pixels: data };
}

function slice(bytes: Uint8Array, offset: number, length: number) {
  return bytes.subarray(offset, offset + length);
}

export function pickLargestPreview(bytes: Uint8Array, ifds: Ifd[]): Uint8Array | undefined {
  const cands: { off: number; len: number; area: number }[] = [];
  for (const d of ifds) {
    const w = d.num(256)[0] ?? 0;
    const h = d.num(257)[0] ?? 0;
    if (d.num(259)[0] === COMP_JPEG && d.num(273).length) {
      cands.push({ off: d.num(273)[0], len: d.num(279)[0], area: w * h });
    }
    if (d.num(513).length) {
      cands.push({ off: d.num(513)[0], len: d.num(514)[0], area: w * h });
    }
  }
  cands.sort((a, b) => b.area - a.area || b.len - a.len);
  for (const c of cands) {
    const s = slice(bytes, c.off, c.len);
    if (s[0] === 0xff && s[1] === 0xd8) return s;
  }
  return undefined;
}
