// A strip tile drawn from plain inputs, so the page and the decode worker draw the same picture.
//
// WHY THIS IS A MODULE OF ITS OWN. A tile used to be drawn by `makeThumb` in
// main.ts: the baseline the photograph would open at, the look the set is
// wearing, the lift solved for it, and its pixels through `compileEdit` — all on
// the page's thread, two tiles at a time, every one asking the page for its own
// sky selection and solving the lift there. A set of ninety paid all of that on
// the thread the controls are answered on, and on a look press every tile was
// drawn again. Nothing in that work needs the screen. It needs the decoded
// photograph and a handful of values the editor holds, and this module takes
// those values as one plain object (`TileInputs`) so that `decode.worker.ts` can
// do the whole job beside the decode and hand back JPEG bytes.
//
// ONE COPY, TWO CALLERS, ON PURPOSE. The page still draws a tile where there is
// no worker (an offline-first app has to), and for the quick look; the worker
// draws every strip tile it can. Both call
// `renderTile`, so the worker's tile cannot drift from the page's — the proof
// is a byte comparison over the practice set, not a promise in a comment.
// (Callers on the page, read by grep 2026-10-05: the strip's fallback in
// `oneThumbnail` and the quick look's two draws, each on a decode of its own.
// Nothing draws a tile from the open photograph's decode.)
//
// WHAT THIS FILE MUST NOT DO: read the editor's state. Everything the old
// `makeThumb` read from main.ts (the live edit, the look bias, the session
// look, the lift switches, the lens strength a file opens at) arrives in
// `TileInputs`, taken at one moment by `tileInputsFor` in main.ts. A new read of
// a main.ts variable here would work on the page and be undefined in the worker.

import { linearAt, grayWorldWB, autoExposure, autoRecover, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS, type DecodedImage } from "./decode";
import {
  compileEdit, cloneParams, sampleBrush, skyBandCentre, bandWeight, rgb2hsv, TONE_DEFAULT, CROP_DEFAULT, MIX3_DEFAULT,
  type EditParams, type BrushMask, type LensCurve, type SourceFlat,
} from "./pipeline";
import { buildSkyMap } from "./skymap";
import { lensGains, applyLensFlat, lensPlanStamp, lensCurveForSource, turnOfOrientation } from "./lensflat";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// --- What a slider can hold -----------------------------------------------------
// Every control the editor reads back into the edit (`syncFromUI`) has a step, so a
// value that something WRITES at full precision stays at full precision until the
// first time any slider at all is touched, and is then rounded to the step: the
// picture moves, by one or two levels in 255, under a press that changed nothing.
// Measured 2026-10-06 on the owner's frames, Natural IR, Hue shift pressed with the
// value it already held: the lift's answer (tone points, the Foliage band's
// saturation, the sky's amount) moved six raws that way, and on a camera JPEG
// `applyLook`'s auto exposure did. A second press moved nothing: it is a snap, once.
// The remedy is at the WRITER: whoever puts a value on a slider's field puts it on the
// slider's grid, so what is drawn is what the slider will read back. These functions
// are that grid, in one place, for the page and for the decode worker alike.

/** The integer slider position of a value on an exponential track.
 *  @param v  the value, clamped into `lo`..`hi` first.
 *  @param lo  the value at position 0 (above 0).
 *  @param hi  the value at position `steps`.
 *  @param steps  the track's length in positions (default 1000, the exposure track's).
 *  @returns the nearest whole position, 0..`steps`. It is main.ts `toPos`, which
 *  delegates here, so the white-balance and exposure sliders and `snapGain` and
 *  `snapExposure` cannot disagree about where a value sits. */
export function trackPos(v: number, lo: number, hi: number, steps = 1000): number {
  return Math.round((steps * Math.log(clamp(v, lo, hi) / lo)) / Math.log(hi / lo));
}

/** The value at a slider position on an exponential track.
 *  @param p  the position, clamped into 0..`steps` first.
 *  @param lo  the value at position 0.
 *  @param hi  the value at position `steps`.
 *  @param steps  the track's length in positions (default 1000).
 *  @returns the value there, in `lo`..`hi`. It is main.ts `fromPos`, which
 *  delegates here; `trackVal(trackPos(v))` is what a slider hands back for `v`. */
export function trackVal(p: number, lo: number, hi: number, steps = 1000): number {
  return lo * Math.pow(hi / lo, clamp(p, 0, steps) / steps);
}

/** The exposure slider's track: it spans `EXPOSURE_LO`..`EXPOSURE_HI` over 1000 positions. */
export const EXPOSURE_LO = 0.05;
export const EXPOSURE_HI = 64;

/** A white-balance gain as its slider will read it back.
 *  @param v  a gain, from `grayWorldWB` or a look's bias, at full precision.
 *  @returns the gain at the nearest position of the white-balance track
 *  (`WB_GAIN_LO`..`WB_GAIN_HI` over `WB_GAIN_STEPS`). What it must satisfy:
 *  `snapGain(snapGain(v)) === snapGain(v)`, and it is the number `syncFromUI`
 *  would store for a slider `syncToUI` had set from `v`. */
export function snapGain(v: number): number {
  return trackVal(trackPos(v, WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS), WB_GAIN_LO, WB_GAIN_HI, WB_GAIN_STEPS);
}

/** An exposure as its slider will read it back.
 *  @param v  an exposure multiplier, from `autoExposure`, at full precision.
 *  @returns the value at the nearest position of the exposure track
 *  (`EXPOSURE_LO`..`EXPOSURE_HI` over 1000). Idempotent, like `snapGain`. */
export function snapExposure(v: number): number {
  return trackVal(trackPos(v, EXPOSURE_LO, EXPOSURE_HI), EXPOSURE_LO, EXPOSURE_HI);
}

/** A value on a range slider's grid: steps counted from `min`, clamped into `min`..`max`.
 *  @param v  the value.
 *  @param min  the slider's minimum, which is where its steps start from.
 *  @param max  the slider's maximum.
 *  @param step  the slider's step.
 *  @param places  the decimals `step` has, so the result is the same number the
 *  slider's own value string parses to (1.98, not 1.9800000000000002).
 *  @returns the nearest grid value, which a range input holds as it is. */
function onStep(v: number, min: number, max: number, step: number, places: number): number {
  return Number(clamp(min + Math.round((v - min) / step) * step, min, max).toFixed(places));
}

/** A lift's answer as the sliders it lands on will read it back.
 *  @param r  a lift: tone points, the Foliage and Sky bands (hue, saturation,
 *  luminance each) and the sky's amount, as `solveLift` and `scaleLift` make them.
 *  @returns `r` with every field that lives on a slider put on that slider's grid:
 *  the five tone points by the tone sliders' half-percent steps about their
 *  defaults (the order the curve is in cannot change: a point moves by at most
 *  half a step), each band's hue by whole degrees and its saturation and
 *  luminance by hundredths, the sky's amount by hundredths; `pull` and anything
 *  else on `r` pass through. What it must satisfy: syncFromUI reads back every
 *  field it writes exactly, so a slider press after a lift moves nothing. The
 *  ranges and steps are ir.html's (tone0..4 -25..25 by 0.5, folHue and skyHue
 *  -60..60 by 1, folSat and skySat 0..2 by 0.01, folLum and skyLum 0.5..1.5 by
 *  0.01, skySatSel 0..2 by 0.01). Consumers: `solveLift`, `scaleLift`. */
export function snapLift<T extends { tone: number[]; foliage: number[]; sky: number[]; skySat: number }>(r: T): T {
  const band = (b: number[]) => [onStep(b[0], -60, 60, 1, 0), onStep(b[1], 0, 2, 0.01, 2), onStep(b[2], 0.5, 1.5, 0.01, 2)];
  return {
    ...r,
    tone: r.tone.map((v, i) => TONE_DEFAULT[i] + onStep((v - TONE_DEFAULT[i]) * 100, -25, 25, 0.5, 1) / 100),
    foliage: band(r.foliage),
    sky: band(r.sky),
    skySat: onStep(r.skySat, 0, 2, 0.01, 2),
  };
}

/** The JPEG quality a strip tile is stored at. One number for the page's encode
 *  and the worker's, so the two cannot disagree about what a tile weighs. */
export const TILE_QUALITY = 0.72;

// --- The lens halves a tile reads (they were main.ts's, and the worker has no main.ts) ---

/** The curve a GRADE should carry for a photograph: none for a raw, whose
 *  pixels already hold the flat (decision 021); the matched curve for an 8-bit
 *  source, turned with the file's orientation.
 *  @param img  the decode, or null; only `linear` and `isRaw` are read.
 *  @param curve  the curve matched to the file, or null.
 *  @param orientation  the file's EXIF orientation tag, when it has one.
 *  @returns the curve to hand `compileEdit`, or null. What the result must
 *  satisfy: it is what main.ts `lensForEdit` hands every compileEdit and
 *  buildSkyMap call for a picture — that function now delegates here. */
export function lensForSource(img: { linear?: Float32Array; isRaw?: boolean } | null | undefined, curve: LensCurve | null, orientation: number | undefined): LensCurve | null {
  if (img?.linear) return null;
  // A camera-rendered source takes the brightness half alone (LN1), and a
  // camera JPEG arrives turned upright by the browser, so the hot spot's
  // centre turns with it. Raw data is never turned at decode.
  return lensCurveForSource(curve, { isRaw: !!img?.isRaw, turn: img?.isRaw ? 0 : turnOfOrientation(orientation) });
}

/** The flat a raw's pixels DO carry, which highlight recovery divides back out
 *  so it tests the value the sensor recorded.
 *  @param img  the decode, or null/undefined.
 *  @returns `img.lensApplied.gains` for a raw, null for an 8-bit source (whose
 *  pixels carry none) or when nothing was laid. Every compileEdit and
 *  buildSkyMap call for a picture passes this beside `lensForSource`. */
export function srcFlatOf(img: DecodedImage | null | undefined): SourceFlat | null {
  return img?.linear ? img.lensApplied?.gains ?? null : null;
}

/** Bring a decode's linear copy to the correction an edit asks for, by ratio
 *  against what is already in it (decision 021).
 *  @param img  a decode; one with no `linear` copy is left alone.
 *  @param curve  the curve matched to that file, or null for none.
 *  @param p  the edit's `lensFix` and `lensBypass`.
 *  @returns true when the pixels changed, so the caller re-uploads or re-reads.
 *  What the result must satisfy: afterwards `img.lensApplied` names exactly the
 *  gains in `img.linear`. Consumers: `ensureLensApplied` for the open
 *  photograph, and `renderTile` for a tile drawn from a photograph's own edit,
 *  whose decode laid the opening strength (decision 085), so the strip and the
 *  photograph show one correction. */
export function bringLensTo(img: DecodedImage, curve: LensCurve | null, p: Pick<EditParams, "lensFix" | "lensBypass">): boolean {
  if (!img.linear) return false;
  const strength = curve && !p.lensBypass ? (p.lensFix ?? 0) : 0;
  const stamp = curve ? lensPlanStamp(curve) : "";
  const have = img.lensApplied ?? { stamp: "", strength: 0, gains: null };
  if (have.stamp === stamp && have.strength === strength) return false;
  const next = lensGains(curve, strength);
  applyLensFlat(img.linear, img.width, img.height, next, have.gains);
  img.lensApplied = { stamp, strength, gains: next };
  return true;
}

// --- The baseline a photograph opens at ---

/** WHAT OPENING A PHOTOGRAPH APPLIES BEFORE ANYBODY TOUCHES ANYTHING.
 *
 *  Takes `img`, a decoded photograph.
 *  Returns the four values the standing ruling fixes per file kind — white
 *  balance, exposure, highlight recovery and the channel swap. Denoise is NOT
 *  here: both callers want it and they measure it differently on purpose (a
 *  260px tile is not denoised at all), which is a difference by decision rather
 *  than by drift.
 *
 *  BOTH CALLERS MUST USE IT, and that is the whole point. `establishFreshEdit`
 *  applies this to the open photograph and `renderTile` renders a tile for a
 *  photograph nobody has opened — and a tile is a CLAIM about what opening will
 *  do. They were two copies of one ruling, and the moment the ruling changed for
 *  camera-rendered files only one copy heard about it: the tile kept rendering a
 *  JPEG at gray-world balance, with the channel swap inherited from whichever
 *  photograph happened to be open, while opening the same file gave wb [1,1,1]
 *  and no swap. Thumbnail and photograph stopped matching, which is the exact
 *  defect the tile walk already exists for.
 *
 *  RAW measures itself: gray-world balance, auto exposure, and recovery only
 *  where a camera matrix says the numbers are sensor values. CAMERA-RENDERED
 *  opens as the camera made it — no balance, no exposure move, no recovery —
 *  because it was already developed through the camera's own preset. */
export function freshBaseline(img: DecodedImage): {
  wb: [number, number, number];
  exposure: number;
  recover: number;
  swapRB: boolean;
} {
  const wb: [number, number, number] = img.isRaw ? grayWorldWB(img) : [1, 1, 1];
  return {
    wb,
    exposure: img.isRaw ? autoExposure(img, wb) : 1,
    recover: img.isRaw ? (img.camMatrix ? autoRecover(img) : 0) : 0,
    // THE CHANNEL SWAP IS A CHOICE, NOT A STARTING STATE. `EditParams` defaults
    // it true, so every photograph opened with red and blue already exchanged.
    // A raw absorbs that — it arrives unbalanced, gray-world balances it first,
    // and the swap lands on channels something has pulled apart. A
    // camera-rendered file has no balance by design, so the swap is performed on
    // a finished rendering with nothing before it and no cast correction after:
    // step 2 of the channel-swap route with steps 1 and 3 missing, and the flat
    // purple this file's own look table already names.
    swapRB: img.isRaw,
  };
}

// --- Restore depth: the lift, solved for a frame -----------------------------
// The complaint this answers: an infrared frame with no open sky in it opens
// pale and grey however it is graded. Measured across the 44 bundled practice
// frames at their open baseline with Aerochrome on — the ones WITH sky land at
// a median luminance near 0.44, warm-half (foliage, ground, bark) saturation
// near 0.35 and cool-half near 0.50; the ones WITHOUT land at 0.50–0.67 median
// luminance and 0.16–0.24 warm saturation. That gap is what "drab" is, and it
// is a full stop of lift and half the colour.
//
// Neither automatic is wrong. Auto exposure anchors the 97th percentile of the
// frame's unclipped channel values at 0.85 (decode.ts autoExposure), so a
// histogram with no dark region gets lifted whole. Gray-world balance makes the frame's own average neutral —
// and in an infrared frame that is nine tenths foliage, the average IS the
// foliage, so the balance neutralises the one material the false-colour looks
// need a cast on. There is no white balance that both neutralises the dominant
// material and leaves it coloured, so the colour has to come from the creative
// layer. That is what this is: an explicit press, landing on the tone points
// and the two band sliders, one undo step, and a no-op on a frame that already
// measures where it should be.
const FLAT_LUM_REF = 0.44;
const FLAT_WARM_REF = 0.35;
const FLAT_COOL_REF = 0.5;
// SINCE 019 THE COLOUR HALF COMPOSES WITH THE LOOK AND AIMS AT PORTIONS. It
// used to start from neutral bands and write its own answer over whatever the
// look had set, and its cool half pushed the Sky HUE band — teals and blues
// wherever they are. Now it starts from the look's own amounts (the Foliage
// band and the Sky saturation of the look, or neutral with no look) and only
// TOPS UP: the warm half through the Foliage band, gated by bandGain so a
// grey stays grey, and the sky through `skySat` — where the sky IS, read
// through the sky bitmap — so a frame with no sky, or an overcast one, gets
// no sky boost at all. The references are the same numbers; what they are
// measured on changed: FLAT_COOL_REF is now the SKY's mean saturation by
// place, not the cool hue half's.
const FLAT_TONE_MAX = 0.22; // the tone points clamp at ±0.25 of their default
// "Shadows alive", as a measurement rather than a taste guess: the pull may not
// take the frame's lower quartile below half of where it started. Relative on
// purpose — an absolute floor stops dead on a frame that already contains real
// black (a shaded wood at midday: its 5th percentile is 0.000 before anything
// is done to it) and would refuse the pull its midtones plainly need.
const FLAT_SHADOW_KEEP = 0.5;
const FLAT_SHADOW_FLOOR = 0.02;
// Divisions along the short edge of the sampling grid. It runs on every open
// now, not on a button press, so its cost is paid on every photo — and it is
// resolution-independent (a fixed grid, not a fraction of the pixels), so this
// number IS the cost. 64 was checked against 128 across the practice set before
// it was lowered: see the calibration note in NOTES.
const LIFT_GRID = 64;
const LIFT_BISECT = 6;
const FLAT_BAND_MAX = 2; // the sky/foliage saturation sliders' own ceiling
const SKY_SAT_MAX = 2;   // the Sky saturation slider's own ceiling (EditParams.skySat)
/** A band with nothing done to it: hue shift 0, saturation 1, lightness 1 —
 *  the same triple `pcReset` writes and the same one the tile starts from.
 *  Named because three places were spelling it out and a fourth needed it. */
export const BAND_NEUTRAL: [number, number, number] = [0, 1, 1];
/** Where the lift starts from: the look's own per-population amounts, so the
 *  lift tops up rather than overwrites. Neutral with no look. */
export interface LiftBase { foliage: [number, number, number]; sky: [number, number, number]; skySat: number; liftSky: boolean }
/** The lift's starting point with no look on the frame.
 *  @returns a fresh neutral `LiftBase` (neutral bands, no sky amount, the sky
 *  top-up allowed). Fresh each call: callers write into the arrays they get. */
export const liftBaseNeutral = (): LiftBase => ({ foliage: [...BAND_NEUTRAL], sky: [...BAND_NEUTRAL], skySat: 0, liftSky: true });

/** Take a solved lift part of the way. Scaling the ANSWER rather than the
 *  targets keeps the solve idempotent and keeps every intermediate value on the
 *  same sliders — half strength is half the tone pull and half the extra
 *  saturation, not a different correction.
 *  @param r  a solved lift (`solveLift`'s result, not null).
 *  @param amt  how far to go, 0..1; at 1 or more `r` itself comes back.
 *  @param base  the look's own amounts the answer is interpolated from.
 *  @returns `r` with its tone, foliage, sky, sky amount and pull moved `amt` of
 *  the way from neutral (or from `base`) to the answer. */
export function scaleLift<T extends { tone: number[]; foliage: number[]; sky: number[]; skySat: number; pull: number }>(r: T, amt: number, base: LiftBase = liftBaseNeutral()): T {
  if (amt >= 1) return r;
  const mix = (from: number, to: number) => from + (to - from) * amt;
  // A mix of two grid values is not on the grid (half of 1.97 and 1.0), so the part-way
  // answer is put back on it, as `solveLift` does for the whole one.
  return snapLift({
    ...r,
    tone: r.tone.map((v, i) => mix(TONE_DEFAULT[i], v)),
    foliage: [r.foliage[0], mix(base.foliage[1], r.foliage[1]), r.foliage[2]],
    sky: [r.sky[0], mix(base.sky[1], r.sky[1]), r.sky[2]],
    skySat: mix(base.skySat, r.skySat),
    pull: r.pull * amt,
  });
}

/** MEASURED, NOT CHOSEN. Fifteen frames that carry a false-colour look sit at
 *  0.0606 to 0.1729; the one that cannot sits at exactly 0.0000. This is three
 *  times below the lowest frame that works, and everything above zero. */
export const COOL_BAND_FLOOR = 0.02;

/** How much cool-band colour the frame has BEFORE anything is done to it —
 *  bands neutral, so a boost left over from the last photo is not counted as
 *  this one's. The same quantity, from the same function, that the lift solves
 *  against.
 *  @param img  the decode.
 *  @param p  the edit to measure under.
 *  @param swapRB  which swap to measure under: `measureFrame` picks the cool
 *    band's hue from it — 30 degrees with the swap on, 210 with it off — so
 *    asking about a look means asking under that look's swap rather than under
 *    the one still on screen.
 *  @param lens  the curve `measureFrame` renders through (see its note).
 *  @returns the cool band's mean saturation. */
export function coolContent(img: DecodedImage, p: EditParams, swapRB: boolean, lens: LensCurve | null): number {
  const neutral = cloneParams(p);
  neutral.sky = [...BAND_NEUTRAL] as typeof neutral.sky;
  neutral.foliage = [...BAND_NEUTRAL] as typeof neutral.foliage;
  neutral.swapRB = swapRB;
  return measureFrame(neutral, img, 96, null, lens).coolSat;
}

/** DOES THIS FILE HAVE ONLY ONE BAND — no cool band for a false-colour look to
 *  work with. A property of the FILE, measured under the swap because that is
 *  the state a colour look puts the frame in.
 *  @param img  the decode.
 *  @param baseline  the edit to measure from (its bands and swap are neutralised).
 *  @param lens  the curve to measure through.
 *  @returns true for a camera-rendered file whose cool content is under
 *  `COOL_BAND_FLOOR`; always false for a raw. */
export function isOneBand(img: DecodedImage, baseline: EditParams, lens: LensCurve | null): boolean {
  return !img.isRaw && coolContent(img, baseline, true, lens) < COOL_BAND_FLOOR;
}

/** Median luminance and per-band saturation of the frame as the given params
 *  render it — sampled on a coarse grid through the SAME compileEdit the
 *  preview and the export use, so what is measured is what is shown. Bands are
 *  weighted by the pipeline's own bandWeight, never a second definition of
 *  "cool".
 *  @param p  the edit to render the samples through.
 *  @param img  the decode.
 *  @param divisions  grid divisions along the short edge.
 *  @param skyMask  the sky bitmap, or null; with it the sky's own saturation
 *    stage is in what is measured and `skySat` is read by place.
 *  @param lens  the lens curve the grade carries (`lensForSource`). A caller
 *    that measures the OPEN photograph passes its own; the tile and the batch
 *    pass the OPEN photograph's curve too, which is what this measured before
 *    it left main.ts (see NOTES: carried as it was, not changed).
 *  @returns the five numbers the lift solves against. */
export function measureFrame(p: EditParams, img: DecodedImage, divisions: number, skyMask: BrushMask | null, lens: LensCurve | null): { lumP50: number; lumP25: number; warmSat: number; coolSat: number; skySat: number } {
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / divisions));
  // The lens curve too: this measures what the pipeline produces, and the
  // correction is part of it. With a sky bitmap the edit runs with a position,
  // so the sky's own saturation stage (skySat) is in what is measured — the
  // lift solves that stage against the SKY population, by place, below.
  const edit = compileEdit(p, img.camMatrix, img.width / Math.max(1, img.height), undefined, lens, null, skyMask, srcFlatOf(img));
  const px = new Float32Array(3);
  const lums: number[] = [];
  let warmW = 0, warmS = 0, coolW = 0, coolS = 0, skyW = 0, skyS = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const [r, g, b] = linearAt(img, x, y);
      const u = (x + 0.5) / img.width, v = (y + 0.5) / img.height;
      // The position always goes in as mu/mv: recovery reads the flat there,
      // whether or not the spatial stages run.
      edit(r, g, b, px, 0, skyMask ? u : undefined, skyMask ? v : undefined, u, v);
      const cr = clamp(px[0], 0, 1), cg = clamp(px[1], 0, 1), cb = clamp(px[2], 0, 1);
      lums.push(0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
      const [h, sat] = rgb2hsv(cr, cg, cb);
      const wS = bandWeight(h, skyBandCentre(p.swapRB, p.mix3), 55, 105);
      coolW += wS; coolS += sat * wS;
      warmW += 1 - wS; warmS += sat * (1 - wS);
      if (skyMask && sampleBrush(skyMask, u, v) > 0.5) { skyW++; skyS += sat; }
    }
  }
  lums.sort((a, b) => a - b);
  return {
    lumP50: lums[lums.length >> 1] ?? 0,
    lumP25: lums[Math.floor(lums.length * 0.25)] ?? 0,
    warmSat: warmW > 0 ? warmS / warmW : 0,
    coolSat: coolW > 0 ? coolS / coolW : 0,
    skySat: skyW > 0 ? skyS / skyW : 0,
  };
}

/** The tone curve for a black-point pull of `k`: the shadow point moves the
 *  full distance, the mid and three-quarter points progressively less, so the
 *  highlights stay where the exposure put them. k = 0 is the identity. */
function flatTone(k: number): [number, number, number, number, number] {
  return [0, TONE_DEFAULT[1] - k, TONE_DEFAULT[2] - k * 0.55, TONE_DEFAULT[3] - k * 0.2, 1];
}

/** Solve the lift for a photograph as it is currently rendered, and return the
 *  values to apply — or null when the frame already measures where a frame with
 *  open sky lands, which is the no-op case and must stay one. Pure: it changes
 *  nothing, so open, applyLook, the toggle, the batch and the tile can all use it.
 *  @param withColour  whether a look is on the frame (the colour half runs only then).
 *  @param img  the decode.
 *  @param params  the edit to solve against.
 *  @param skyMask  the sky bitmap at the turn the picture is shown at, or null.
 *  @param base0  the look's own amounts the lift tops up.
 *  @param lens  the curve the grade carries for `img` (`lensForSource`).
 *  @returns the tone curve, bands, sky amount and pull to apply, or null. */
export function solveLift(withColour: boolean, img: DecodedImage, params: EditParams, skyMask: BrushMask | null, base0: LiftBase, lens: LensCurve | null): { tone: [number, number, number, number, number]; foliage: [number, number, number]; sky: [number, number, number]; skySat: number; pull: number } | null {
  // Measure the frame WITHOUT a lift on it. The creative grade — tone included
  // — carries across opens by design, so `params.tone` on a fresh open is
  // whatever the last photo ended with; measuring that and then deciding
  // "already dark enough" left the previous photo's curve sitting on this one,
  // and a chain of opens ratcheted the whole set down (measured: medians
  // reaching 0.167 against a 0.44 target). Solving from the default curve every
  // time makes it idempotent: the same frame gives the same answer however many
  // times this runs, and pressing the toggle twice is a round trip.
  const base = cloneParams(params);
  base.tone = [...TONE_DEFAULT] as typeof base.tone;
  // THE SAME ARGUMENT, FOR THE OTHER TWO. The paragraph above was written about
  // tone and the fix was applied to tone alone, while sky and foliage carry
  // across opens exactly as tone does — so the frame being MEASURED still wore
  // the previous photo's band boost. Two consequences, both reported: the
  // saturation tests could read as already satisfied and the lift did nothing
  // at open, and where it did fire it solved against a boosted measurement, so
  // pressing the toggle off and on (which restores the bands first) produced a
  // different answer from the one the photo opened with. A toggle whose two
  // states disagree is the bug; making all three start from neutral is what
  // makes the solve idempotent.
  base.sky = [...base0.sky] as typeof base.sky;
  base.foliage = [...base0.foliage] as typeof base.foliage;
  base.skySat = base0.skySat;
  const before = measureFrame(base, img, LIFT_GRID, skyMask, lens);
  // Only ever pull DOWN and push UP: a frame already at or past the reference
  // is left exactly as it is rather than being dragged to the average.
  //
  // The COLOUR half runs only when a look is on the frame. The sky and foliage
  // bands are defined by hue, and it is a look — the channel swap above all —
  // that puts a frame's materials into those bands in the first place; the
  // references were measured on frames wearing one. Solved against a bare
  // opened frame instead, nothing clears them and the boost fires on
  // everything: measured, 44 of 44 practice frames "adapted" at open with no
  // look, which is not a correction, it is a new default. The tonal half has no
  // such dependency — a frame opens too bright or it does not.
  const needsTone = before.lumP50 > FLAT_LUM_REF + 0.01;
  const needsWarm = withColour && before.warmSat < FLAT_WARM_REF - 0.01;
  // The sky by PLACE: only with a bitmap, only where one found a sky, and
  // only when that sky has some colour to scale (an overcast reads near 0 and
  // is left alone — the gate in the stage would leave it anyway).
  // And only when the look allows it: Bold Pink's sky stages are off on
  // purpose, and a top-up from 0 deepens its sky past the look (078).
  const needsSky = withColour && base0.liftSky && !!skyMask && before.skySat > 1e-4 && before.skySat < FLAT_COOL_REF - 0.01;
  if (!needsTone && !needsWarm && !needsSky) {
    // Nothing to do for THIS frame — but the tone it inherited may be a lift
    // solved for a different one, so hand back the neutral curve rather than
    // leaving that in place. The bands and the sky's amount go back to the
    // look's own.
    return snapLift({ tone: [...TONE_DEFAULT] as [number, number, number, number, number], foliage: [...base.foliage] as [number, number, number], sky: [...base.sky] as [number, number, number], skySat: base0.skySat, pull: 0 });
  }
  const trial = cloneParams(base);
  const shadowFloor = Math.max(FLAT_SHADOW_FLOOR, before.lumP25 * FLAT_SHADOW_KEEP);
  let k = 0;
  if (needsTone) {
    let lo = 0, hi = FLAT_TONE_MAX;
    for (let i = 0; i < LIFT_BISECT; i++) {
      const mid = (lo + hi) / 2;
      trial.tone = flatTone(mid);
      const m = measureFrame(trial, img, LIFT_GRID, skyMask, lens);
      // Two stopping conditions: the median reaching the reference, and the
      // shadows not being crushed to get there — whichever binds first.
      if (m.lumP50 > FLAT_LUM_REF && m.lumP25 > shadowFloor) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  trial.tone = flatTone(k);
  const after = measureFrame(trial, img, LIFT_GRID, skyMask, lens);
  const solve = (measured: number, ref: number) => (measured > 1e-4 ? clamp(ref / measured, 1, FLAT_BAND_MAX) : 1);
  // The sky's amount scales chroma by (1 + skySat), so the top-up that reaches
  // the reference from a measured mean is a ratio on (1 + skySat), never below
  // the look's own amount and never past the slider's ceiling.
  const solveSky = (from: number, measured: number) => (measured > 1e-4 ? clamp((1 + from) * FLAT_COOL_REF / measured - 1, base0.skySat, SKY_SAT_MAX) : from);
  if (withColour) {
    trial.foliage = [base.foliage[0], clamp(base.foliage[1] * solve(after.warmSat, FLAT_WARM_REF), 1, FLAT_BAND_MAX), base.foliage[2]];
    trial.sky = [...base.sky] as typeof trial.sky; // the Sky HUE band is the look's and the reader's; the lift no longer writes it
    if (needsSky) trial.skySat = solveSky(base.skySat, after.skySat);
    const check = measureFrame(trial, img, LIFT_GRID, skyMask, lens);
    trial.foliage[1] = clamp(trial.foliage[1] * solve(check.warmSat, FLAT_WARM_REF), 1, FLAT_BAND_MAX);
    if (needsSky) trial.skySat = solveSky(trial.skySat ?? base0.skySat, check.skySat);
  }
  // ON THE SLIDERS' GRID, AT THE WRITER. The solve above is continuous; the sliders it
  // lands on are not, and the first slider touched afterwards rounded every one of
  // these under the picture (snapLift says what that cost and where it was measured).
  return snapLift({
    tone: trial.tone as [number, number, number, number, number],
    foliage: trial.foliage as [number, number, number],
    sky: trial.sky as [number, number, number],
    skySat: trial.skySat ?? base0.skySat,
    pull: k,
  });
}

// --- The tile ----------------------------------------------------------------

/** What a tile takes from the photograph's OWN edit — the values the old
 *  `makeThumb` read straight off `own.params`, kept raw (undefined stays
 *  undefined) because `lensFix` and `forceBalance` fall back differently from
 *  how `cloneParams` defaults them. */
export type TileOwn = Pick<EditParams, "wb" | "exposure" | "recover" | "swapRB" | "tone" | "sky" | "foliage" | "lensFix" | "lensBypass" | "hsFix" | "hsBypass" | "forceBalance">;

/** EVERYTHING A TILE READS THAT IS NOT THE PHOTOGRAPH: plain data, structured-
 *  cloneable, taken at one moment by main.ts `tileInputsFor` so a tile is a
 *  claim about one state of the editor — the same moment its stamp is taken.
 *  It carries no function and no DOM object: it crosses into the decode worker. */
export interface TileInputs {
  /** Longest edge of the tile, in pixels (260 for the strip). */
  maxEdge: number;
  /** The curve matched to THIS file (`lensCurveFor`, or the open photograph's own). */
  lens: LensCurve | null;
  /** This file's EXIF orientation tag, for `lensForSource`. */
  orientation: number | undefined;
  /** The OPEN photograph's curve and EXIF orientation. `measureFrame` read the
   *  open photograph's lens state for every tile, whichever file the tile is of
   *  (a raw is unaffected: its pixels carry the flat). Carried over as it was,
   *  so moving the tile off the page changed no picture; NOTES records it. */
  liftCurve: LensCurve | null;
  liftOrientation: number | undefined;
  /** `cloneParams` of the edit the tile starts from — the photograph's own, or
   *  the live one — with masks, spots, stickers, warp and LUT emptied: the tile
   *  clears the first, second and last itself, and neither the stickers nor the
   *  warp field is read by `compileEdit` or `buildSkyMap`. */
  base: EditParams;
  /** The photograph's own edit, or null for one never opened. */
  own: TileOwn | null;
  /** The WB bias the live look baked in (`lookBias`). */
  lookBias: [number, number, number];
  /** The look the set is wearing, for a tile with no edit of its own: its swap
   *  and its mixer (null mixer = the default). Null when `own` is set. */
  sessLook: { swapRB: boolean; mix3: number[] | null } | null;
  /** The lift's session controls (`autoLift`, `liftAmount`) and whether a look
   *  is active (the colour half runs only then). */
  autoLift: boolean;
  liftAmount: number;
  withColour: boolean;
  /** The lift's starting point under the active look, for a raw and for a
   *  camera-rendered file (`img.camMatrix` picks one). */
  liftBase: { raw: LiftBase; jpeg: LiftBase };
  /** `lensStrengthAtOpen` for this file's EXIF: the strength a tile claims the
   *  open will use (any card), and the shipped card's own. */
  lensOpen: number;
  hsShipped: number;
}

/** WHERE A TILE'S TIME WENT, in milliseconds, read off the clock of the thread
 *  that drew it. One tile, one set of numbers, and nothing the reader wrote.
 *
 *  `decode` is the caller's (the file read into a picture and the lens flat laid,
 *  in the decode worker or on the page), `encode` is the caller's (the JPEG), and
 *  `selection`, `lift` and `pixels` are `renderTile`'s own. They are disjoint, so
 *  they can be added up: `total` less their sum is what is left, the baseline the
 *  tile starts from (white balance, exposure, the one-band test) and the glue
 *  between the parts, which the report names `rest` rather than hiding it. */
export interface TileTimings {
  /** The file decoded and the lens flat laid. */
  decode: number;
  /** Building the coarse sky bitmap the tile asked for, for the lift and for its own sky. */
  selection: number;
  /** Solving the lift, the selection above taken out of it. */
  lift: number;
  /** The tile's own sky map, `compileEdit` and the per-pixel pass. */
  pixels: number;
  /** The JPEG encode. */
  encode: number;
  /** From the start of the job to the bytes being ready. */
  total: number;
}

/** What `renderTile` itself measured: the three parts it owns, and its whole. */
export type RenderTimings = Pick<TileTimings, "selection" | "lift" | "pixels" | "total">;

/** A drawn tile before it is encoded, with what drawing it cost (`ms`). */
export interface TilePixels { rgba: Uint8ClampedArray<ArrayBuffer>; width: number; height: number; ms: RenderTimings }

/** How a tile asks for the coarse sky bitmap of a photograph at a turn
 *  (decision 070): the page passes its cached `skyMaskFor`, the worker builds it
 *  from its own decoded copy. Both mean `buildSkySelectionFrom(prepareSkySource(
 *  img, turn), false).mask`, so the two paths see the same bytes. */
export type SkyFor = (img: DecodedImage, turn: number) => BrushMask | null;

/** Build a small gamma-encoded tile for the strip — auto white balanced (so RAW
 *  infrared isn't a magenta smear) but ungraded, so it just says "which photo
 *  is this". Cheap: nearest-sampled at thumb resolution. This is the whole of
 *  what `makeThumb` did after the decode, with the editor's state passed in.
 *  @param img  the decoded photograph, lens flat laid (it may be changed:
 *    an own edit brings the flat to its strength, as the open photograph's is).
 *  @param inp  everything else the tile reads (`TileInputs`).
 *  @param skyFor  the coarse sky of `img` at a turn.
 *  @returns the tile's RGBA pixels and size, already laid out at the file's own
 *  display rotation, and `ms`, what drawing it cost: the selection, the lift and
 *  the pixels, and the whole. What the result must satisfy: the picture the same
 *  photograph opens into under the same edit — the tile walk and the agreement
 *  walk hold it — and `ms` is reporting only, so no clock read below changes a
 *  pixel; its three parts are disjoint and their sum never exceeds `total`. */
export function renderTile(img: DecodedImage, inp: TileInputs, skyFor: SkyFor): TilePixels {
  const t0 = performance.now();
  // THE SELECTION'S TIME IS TAKEN OUT OF THE LIFT'S. The lift asks for the coarse
  // sky bitmap as it starts, and the tile asks again for its own sky further
  // down; the page's `skyMaskFor` and the worker's own copy both build on the
  // first ask and answer from memory after, so the cost lands where it was paid.
  let selection = 0;
  const skyTimed: SkyFor = (im, turn) => {
    const s0 = performance.now();
    try { return skyFor(im, turn); } finally { selection += performance.now() - s0; }
  };
  const s = Math.min(1, inp.maxEdge / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const own = inp.own;
  // Render the thumb through the REAL pipeline with the photo's own auto
  // baseline PLUS the live creative state (swap/looks/grade persist across
  // opens), so a thumbnail matches what tapping it will show — a bare
  // WB+matrix render diverged the moment a look was active (caught on the
  // device, IMG_1256: yellow/blue thumb vs the teal/orange it opened into).
  // Spatial/per-image extras (masks, glow, clarity, LUT, grain) are cleared —
  // they need maps or textures a thumb doesn't have.
  // THE LOOK'S WB BIAS HAS TO COME WITH IT. applyLook bakes the bias INTO
  // params.wb (dividing the previous one out), and this line replaced params.wb
  // wholesale with the photo's own gray-world balance — so the bias was dropped
  // and every look's tiles shared one neutral white balance.
  //
  // That is invisible for some looks and total for others. aero, goldie and red
  // have IDENTICAL swapRB and hue; they differ almost only by wbBias. Strip the
  // bias and all three render as Aerochrome, whichever one is selected, while
  // mono/sepia/natural still change because their difference is swap, sat or
  // tint. Same multiply batchParamsFor already does for a built-in look.
  // WITH `own`, EVERY VALUE COMES FROM THAT PHOTO'S OWN EDIT — balance,
  // exposure and grade alike — because it has all of them already measured and
  // there is nothing to guess. Without it the photo has never been opened, so
  // the tile is a claim about what opening it WILL do: its own measured balance
  // and exposure, under the live look, which is what establishFreshEdit
  // applies.
  // THE SAME BASELINE THE OPEN APPLIES, not a second copy of the ruling. This
  // line used to be `grayWorldWB(img)` unconditionally — correct for a raw and
  // wrong for a camera-rendered file, which opens at wb [1,1,1] as the camera
  // made it. See freshBaseline.
  const base = own ? null : freshBaseline(img);
  // AND THE LOOK THE SET IS WEARING, because the baseline is only half the
  // claim. establishFreshEdit applies `freshBaseline` and then, in the next two
  // lines, applies the SESSION LOOK -- and applyLook overwrites both the channel
  // swap and the mixer. This function stopped at the baseline, so a tile for a
  // photograph nobody has opened stated the mapping of an open that will not
  // happen.
  //
  // It was nearly invisible while every look that clears the swap also has
  // sat 0 (B&W IR, Sepia IR, HIE B&W) -- Natural IR on a raw was already wrong
  // and nobody could see 1.2 saturation of the other swap. The rotation makes it
  // total: swap AND rotation compose to a G<->B exchange, so the tile would be a
  // different picture from the one tapping it opens. `lookBias` below is the
  // same fact about white balance, and it is taken from the look rather than the
  // baseline for exactly this reason.
  const sessLook = own ? null : inp.sessLook;
  const gw = own ? own.wb : base!.wb;
  const bias = own ? ([1, 1, 1] as [number, number, number]) : inp.lookBias;
  const wb: [number, number, number] = [
    clamp(gw[0] * bias[0], WB_GAIN_LO, WB_GAIN_HI),
    clamp(gw[1] * bias[1], WB_GAIN_LO, WB_GAIN_HI),
    clamp(gw[2] * bias[2], WB_GAIN_LO, WB_GAIN_HI),
  ];
  // The open photograph's lens state, which `measureFrame` always read (see TileInputs).
  const liftLens = lensForSource(img, inp.liftCurve, inp.liftOrientation);
  const p: EditParams = {
    ...inp.base,
    // An own edit carries its own correction strength. Without one, the tile
    // claims what opening the photo will do, and that is `lensStrengthAtOpen`
    // — full with a matched lens, 0 with no match — asked of THIS file's
    // EXIF, the same question the open asks
    // (decision 015, reversed; see initHotspot). A tile that corrected
    // differently from the open photograph would be the exact
    // strip-against-photo disagreement `lensHalves` exists to make impossible.
    // A raw's tile carries the flat in its pixels already (the decode laid the
    // opening strength, lensPlanFor, and an own edit's strength is brought to
    // it below, after the sky mask); this is what an 8-bit source's grade
    // reads. `hsFix` is the shipped card's own control and set beside it so
    // the tile does not carry the OPEN photograph's, which the clone above
    // would otherwise hand it.
    lensFix: own ? (own.lensFix ?? inp.lensOpen) : inp.lensOpen,
    lensBypass: own ? own.lensBypass : false,
    hsFix: own ? own.hsFix : inp.hsShipped,
    hsBypass: own ? own.hsBypass : false,
    forceBalance: own ? (own.forceBalance ?? false) : false,
    wb,
    exposure: own ? own.exposure : base!.exposure,
    denoise: 0,
    // Nor colour-smoothed, for the same reason: a 260px tile has already thrown
    // away the high-frequency colour this removes, so running it would cost a
    // neighbourhood pass per tile to change nothing anybody can see.
    chroma: 0,
    // Nor despeckled: a stray pixel in the full frame is a fraction of one tile
    // pixel, and the downscale has already averaged it away.
    despeckle: 0,
    recover: own ? (own.recover ?? 0) : base!.recover,
    // INHERITED FROM WHICHEVER PHOTOGRAPH WAS OPEN, WHICH IS A DIFFERENT FRAME'S
    // ANSWER. `cloneParams(params)` above carries the live swap onto a tile for a
    // file nobody has opened, so a camera JPEG's tile was swapped whenever a raw
    // was on screen and the same file opened unswapped. The tile is a claim about
    // what opening WILL do, so it takes the claim from the same place the open
    // does. A photograph with its own edit keeps its own answer.
    swapRB: own ? own.swapRB : sessLook ? sessLook.swapRB : base!.swapRB,
    // With a session look the mapping is the LOOK's; with none, the live mixer
    // rides into the next open untouched (establishFreshEdit does not clear it),
    // so the clone above is already the right answer and this leaves it alone.
    ...(sessLook ? { mix3: sessLook.mix3 ? [...sessLook.mix3] : [...MIX3_DEFAULT] } : {}),
    masks: [],
    spots: [],
    glow: 0,
    clarity: 0,
    dehaze: 0,
    sharpen: 0,
    // ZERO EVEN WHEN THE LOOK CARRIES ONE, and that is the same fact as
    // `denoise: 0` above rather than a second decision. Aerochrome brings
    // `texture` to give back the modelling its denoise floor costs (Look.texture)
    // -- and a 260px tile is not denoised at all, so it never paid that cost.
    // Running the mid-frequency high-pass here would be adding structure to a
    // downscale that has already averaged the band it works in away. Change one
    // of these two lines and the other stops being true.
    texture: 0,
    grainAmt: 0,
    vigAmt: 0,
    lut: null,
    crop: { ...CROP_DEFAULT },
    straighten: 0,
    // Solved for THIS photo, not inherited from whichever one happens to be
    // open. Tone, sky and foliage stopped being a shared creative choice the
    // moment Restore depth started writing them per frame — so cloning the live
    // params handed every tile another frame's correction, and tapping it
    // re-solved and showed something different. That is exactly the defect the
    // thumbnails were fixed for once before (a thumb must match its open).
    //
    // CONDITIONAL ON `own`, WHICH IT WAS NOT. Clearing these three
    // unconditionally fixed the `!own` case and broke the other one in the same
    // line: a photo that HAS been opened carries its own solved curve in
    // own.params, and this threw it away — while the re-solve below is gated on
    // `!own` and could not put it back. Restore depth is on by default, so that
    // was every opened photo: the tile went flat the moment the photo was
    // tapped, which reads as the app quietly undoing something. The values here
    // are this frame's own answer; only the live ones were ever another
    // frame's.
    tone: own ? [...own.tone] : [...TONE_DEFAULT],
    sky: own ? [...own.sky] : [0, 1, 1],
    foliage: own ? [...own.foliage] : [0, 1, 1],
  };
  // A LOOK NEEDS A WHITE BALANCE TO WORK ON, AND A CAMERA-RENDERED FILE OPENS
  // WITHOUT ONE — and this function is the half of that rule that stopped doing
  // it. `applyLook` gray-world balances a non-raw before applying a look and
  // re-derives exposure to go with it, because a false-colour look on a JPEG
  // otherwise applies its swap to channels nothing has pulled apart; the comment
  // there still says "makeThumb has always done both together, which is why the
  // tile looked right while the photo did not". That stopped being true when
  // this function started taking its baseline from `freshBaseline`, which gives
  // a camera-rendered file [1,1,1] — correct for a tile with no look on it, and
  // the removal of the balance a look needs.
  //
  // MEASURED, under Aerochrome on a camera JPEG nobody had opened: the tile came
  // out at wb [1,1,1] and exposure 1 while opening the same file gave wb
  // [0.209, 1.270, 0.638] and exposure 2.49, and the tile's largest hue band sat
  // 150 degrees from the photograph's — 39 of 46 fields identical and the
  // balance carrying all of it. The raw arm of the same test was 0 degrees
  // throughout, because a raw is gray-world balanced by `freshBaseline` anyway
  // and there was nothing for this to remove.
  //
  // The one-band test and the exposure re-derive both come with it, for the
  // reasons `applyLook` states at length: a camera JPEG can arrive with nothing
  // in the cool band, where balancing manufactures a second band by crushing red
  // sixfold; and a balance without a matching exposure just makes the picture
  // dark. `forceBalance` is false on a tile because nobody has opened the photo
  // to set it, which is the same state `applyLook` calls untouched.
  if (sessLook && !own && !img.isRaw && !isOneBand(img, p, liftLens)) {
    // ON THE SLIDERS' GRID, as `applyLook` writes them for the open photograph: the
    // balance first, and the exposure measured through the balance that was kept.
    const gw = grayWorldWB(img);
    p.wb = [
      snapGain(clamp(gw[0] * bias[0], WB_GAIN_LO, WB_GAIN_HI)),
      snapGain(clamp(gw[1] * bias[1], WB_GAIN_LO, WB_GAIN_HI)),
      snapGain(clamp(gw[2] * bias[2], WB_GAIN_LO, WB_GAIN_HI)),
    ];
    p.exposure = snapExposure(autoExposure(img, p.wb));
  }
  let liftMs = 0;
  if (inp.autoLift && !own) {
    const liftBase = img.camMatrix ? inp.liftBase.raw : inp.liftBase.jpeg;
    // A TILE IS LAID OUT AT THE FILE'S OWN TURN (below), so its sky is found
    // at that turn too (070) — the lift's sky population with it. Asked for
    // before the solve's clock starts, in the order the call always made it.
    const liftSky = inp.withColour ? skyTimed(img, img.rotate ?? 0) : null;
    const l0 = performance.now();
    const solved = solveLift(inp.withColour, img, p, liftSky, liftBase, liftLens);
    const lift = solved && scaleLift(solved, inp.liftAmount, liftBase);
    if (lift) { p.tone = lift.tone as typeof p.tone; p.sky = lift.sky as typeof p.sky; p.foliage = lift.foliage as typeof p.foliage; p.skySat = lift.skySat; }
    liftMs = performance.now() - l0;
  }
  // THE PHOTO'S DISPLAY ROTATION, which this never applied. `img.rotate` is the
  // EXIF Orientation tag as 90-degree CW steps, and the main view has always
  // honoured it — so a frame shot in portrait opened upright and its THUMBNAIL
  // lay on its side, in the strip and in the Quick look grid alike, both of
  // which are built from here. Nineteen of the forty-four practice files carry
  // Orientation 8, so it was not a corner case; measured before this, a
  // portrait frame's tile came out 512x341 while the photo itself opened
  // 932x1400.
  //
  // Applied by mapping DESTINATION pixels back to source, so there is still one
  // pass and no second buffer. The aspect handed to compileEdit stays the
  // SOURCE aspect: the edit is computed in the photo's own space, and only the
  // laying-out of the result turns.
  const rot = ((((img.rotate ?? 0) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const turned = rot === 1 || rot === 3;
  const ow = turned ? h : w;
  const oh = turned ? w : h;
  // THE SKY STAGES REACH THE TILE when the look carries them: the map is built
  // from the tile's own sampler at the tile's size (cheap at 128 texels), and
  // the coarse bitmap stands in for the refined one — at 260 px it is the
  // finer of the two. Without this a tile under Aerochrome would show a sky
  // half again as bright as the photograph's, and the agreement walk would
  // say so.
  const tileSky = ((p.skySmooth ?? 0) > 0 || (p.skyDepth ?? 0) > 0 || (p.skySat ?? 0) > 0) ? skyTimed(img, rot) : null;
  const pixelsFrom = performance.now(); // what follows is the tile's own pixels
  // A RAW'S DECODE LAID THE OPENING STRENGTH, 1 with a matched lens (lensPlanFor,
  // decision 085), and an own edit may carry another. Nothing downstream
  // re-applies it for a raw — `lensForEdit` hands the grade no curve when the
  // flat is in the pixels — so the pixels are brought to the edit's strength
  // here, as the open photograph's are, or the tile shows a correction the
  // photograph does not. AFTER the sky mask, not before: the open photograph's
  // selection was built at decode, at the opening strength, and a later
  // strength does not rebuild it, so the tile's is built from the same pixels.
  // Nothing above reads pixels for an own edit. An edit saved before `lensFix`
  // existed carries none, and opening it keeps the fresh open's strength
  // (applySnapshot merges over it), so the tile does the same.
  if (own) bringLensTo(img, inp.lens, { lensFix: own.lensFix ?? inp.lensOpen, lensBypass: own.lensBypass });
  const tileSample = (x: number, y: number) => linearAt(img, Math.min(img.width - 1, Math.floor(x / s)), Math.min(img.height - 1, Math.floor(y / s)));
  const tileLens = lensForSource(img, inp.lens, inp.orientation);
  const tileMap = tileSky ? buildSkyMap(tileSample, w, h, p, img.camMatrix, w / h, undefined, tileLens, tileSky, srcFlatOf(img)) : null;
  const edit = compileEdit(p, img.camMatrix, w / h, undefined, tileLens, tileMap, tileSky, srcFlatOf(img));
  const px = new Float32Array(3);
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      // (x, y) in the un-turned thumbnail grid that lands at (ox, oy).
      const x = rot === 0 ? ox : rot === 1 ? oy : rot === 2 ? w - 1 - ox : w - 1 - oy;
      const y = rot === 0 ? oy : rot === 1 ? h - 1 - ox : rot === 2 ? h - 1 - oy : ox;
      const sx = Math.min(img.width - 1, Math.floor(x / s));
      const sy = Math.min(img.height - 1, Math.floor(y / s));
      const [r, g, b] = linearAt(img, sx, sy);
      edit(r, g, b, px, 0, tileMap ? (x + 0.5) / w : undefined, tileMap ? (y + 0.5) / h : undefined, (x + 0.5) / w, (y + 0.5) / h);
      const i = (oy * ow + ox) * 4;
      out[i] = Math.round(255 * clamp(px[0], 0, 1));
      out[i + 1] = Math.round(255 * clamp(px[1], 0, 1));
      out[i + 2] = Math.round(255 * clamp(px[2], 0, 1));
      out[i + 3] = 255;
    }
  }
  const done = performance.now();
  return { rgba: out, width: ow, height: oh, ms: { selection, lift: liftMs, pixels: done - pixelsFrom, total: done - t0 } };
}
