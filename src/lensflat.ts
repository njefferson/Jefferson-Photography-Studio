// The measured lens correction as a flat-field pass on the LINEAR working copy,
// applied at decode before anything is measured or graded (decision 021;
// IR-SCIENCE.md §9c — RawPedia, the DNG GainMap, Lightroom and darktable all
// finish the correction before the grade). One radial gain table from the
// matched curve and the photograph's strength, read between bin centres as the
// DNG GainMap reads its gains; one in-place multiply per pixel; and a RE-APPLY
// BY RATIO, so a strength change, Bypass, Undo and the bare-decode hold reach
// the uncorrected picture without a second 80 MB buffer — exact in float
// because nothing here clips. The gain arithmetic is the one source
// compileEdit's in-grade stage (kept for 8-bit sources, which have no linear
// copy) and the shader also use, so no two of them can disagree about a ring.
//
// AND THIS FILE DECIDES WHICH HALF A SOURCE MAY TAKE (`lensCurveForSource`).
// The colour half is a ratio between camera-native channels measured on raw
// linear data; a camera JPEG has been through the camera's matrix and tone
// curve, where the same ratios read 3.5x the raw answer in red and 2.3x in blue
// (lensprofile.ts). RawTherapee applies a flat field to raw files only and its
// JPEG/TIFF source carries no flat-field code at all; darktable applies gain
// maps in rawprepare, to raw data. So a camera-rendered source takes the
// brightness half and no colour.
import { lensGainsFor, lensGeom, lensLerp, lensRadius, LENS_GAIN_HI, LENS_GAIN_LO, type LensCurve } from "./pipeline";
import type { DecodedImage } from "./decode";

/** The per-bin gains one strength applies: red, blue and the brightness half on
 *  green (and on red and blue through `gr`/`gb`, which already carry it). */
export interface LensGains {
  n: number;
  gr: Float32Array;
  gb: Float32Array;
  gg: Float32Array;
  /** The hot spot's centre the tables are laid about (`LensCurve.centre`). */
  c: [number, number];
}

/** What a decoded photograph was corrected with, carried on the image so a
 *  later strength can be applied as a ratio against it. */
export interface LensApplied {
  /** `lensPlanStamp` of the curve; two plans with one stamp share a curve. */
  stamp: string;
  strength: number;
  gains: LensGains | null;
}

/** The plan handed to a decode: the curve matched to the file and the strength
 *  it opens at, full with a matched lens (`lensStrengthAtOpen`, decision 085). */
export interface LensPlan {
  curve: LensCurve;
  strength: number;
  stamp: string;
}

/** The gain tables — pipeline.ts's `lensGainsFor`, re-exported so every caller
 *  of this module reaches the one source rather than a second copy. */
export const lensGains = lensGainsFor;

/**
 * THE HALVES A SOURCE MAY TAKE, in the axes of its pixels.
 * @param curve  the curve matched to the photograph (`currentLensCurve` /
 *   `lensCurveFor` in main.ts, the export's `lens`), or null.
 * @param src  what was decoded: `isRaw` (false for a camera JPEG, PNG, HEIC or
 *   a raw's embedded preview), and `turn`, the quarter-turns clockwise the
 *   decoder already rotated the pixels from the sensor — non-zero only for a
 *   camera JPEG the browser turned upright by its EXIF Orientation.
 * @returns the curve unchanged for raw data; for a camera-rendered source the
 *   brightness half alone with the colour half dropped, or null when that
 *   leaves nothing. `centre` is turned by `turn` so it lands on the hot spot
 *   in the rotated pixels.
 * What the result must satisfy: every path that applies a curve to a decoded
 *   picture passes it through here first — the open photograph's texture
 *   (`syncLensTexture`), `lensForEdit` (the grade, tiles, sky map), the export
 *   and the drawn export — and the diagnostic and the cards read it too, so
 *   what they report is what lands (LN1, 2026-10-02).
 */
export function lensCurveForSource(curve: LensCurve | null | undefined, src: { isRaw?: boolean; turn?: number }): LensCurve | null {
  if (!curve) return null;
  let centre = curve.centre;
  const k = (((src.turn ?? 0) % 4) + 4) % 4;
  if (centre && k) {
    let x = Number(centre[0]) || 0, y = Number(centre[1]) || 0;
    // A quarter-turn clockwise carries (x, y) to (-y, x): the top edge's
    // middle, (0, -1), lands on the right edge's, (1, 0).
    for (let i = 0; i < k; i++) { const t = x; x = -y; y = t; }
    centre = [x, y];
  }
  if (src.isRaw) return centre === curve.centre ? curve : { ...curve, centre };
  if (!curve.bump || curve.bump.length < 2) return null;
  return { bump: curve.bump, centre };
}

/** The quarter-turns clockwise a browser applies to a camera JPEG from its EXIF
 *  Orientation (1 none, 3 half, 6 a quarter clockwise, 8 three quarters).
 *  @param orientation  a JPEG's IFD0 tag (`ExifSubset.orientation`, which is
 *    absent for a raw file and for a file with none).
 *  @returns 0..3; the mirrored values (2, 4, 5, 7), which no camera writes for
 *    a photograph, read as their unmirrored turn.
 *  Consumer: `lensCurveForSource`'s `turn` for a source the browser decoded. */
export function turnOfOrientation(orientation: number | undefined): number {
  switch (orientation) {
    case 3: case 4: return 2;
    case 6: case 5: return 1;
    case 8: case 7: return 3;
    default: return 0;
  }
}

/**
 * WHAT THE CORRECTION DOES TO THE MIDDLE OF THE FRAME, as the diagnostic
 * report's "Centre gains" line — the only place a hot-spot lives, and the only
 * number that answers "why is it a blue circle".
 *
 * It used to work this out itself, from the stored bins through `lensGain`,
 * and so it reported a correction nothing applies: no area anchor (the
 * normalisation every renderer has carried since 2026-09-17), and a brightness
 * half kept even where the renderers drop it for a length mismatch. Now it
 * reads the one source, as the card's `centreEffect` does.
 * @param curve  the matched curve (`currentLensCurve` in main.ts), or null.
 * @param strength  the strength that lands: 0 under Bypass.
 * @returns the line's text: the gain landing on red, blue and brightness at the
 *   centre bin (red and blue each include the brightness half, as they do when
 *   applied), blue over red with a named verdict, and how many of the three
 *   factors sit at the 0.5..2 clamp.
 * What the result must satisfy: every gain it prints equals `lensGains(curve,
 *   strength)` at bin 0 to the three decimals printed — `gr[0]`, `gb[0]`,
 *   `gg[0]`, or 1 where that is null — so it reports what lands.
 *   `tools/lens-diagnostic-check.mjs` holds it there over every shipped profile.
 *   Consumer: `lensCentreDiagnostic` in main.ts.
 */
export function lensCentreLine(curve: LensCurve | null | undefined, strength: number): string {
  if (!curve) return "no correction on this photograph";
  const g = lensGains(curve, strength);
  const gr = g ? g.gr[0] : 1, gb = g ? g.gb[0] : 1, gc = g ? g.gg[0] : 1;
  const colourOn = !!(curve.kr && curve.kb && Math.min(curve.kr.length, curve.kb.length) > 1);
  if (!colourOn) return `brightness only · centre ${gc.toFixed(3)}x`;
  const ratio = gr > 1e-6 ? gb / gr : Infinity;
  // Named rather than left as a bare number: the ratio is the finding, and a
  // report that makes the reader judge whether 1.9 is a lot has not reported.
  const verdict =
    ratio >= 1.6 ? " — THE MIDDLE IS BEING PUSHED STRONGLY BLUE" :
    ratio >= 1.25 ? " — the middle is being pushed noticeably blue" :
    ratio <= 0.8 ? " — the middle is being pushed red" : " — close to neutral";
  // The clamp bounds each FACTOR (lensGain), not the product, so the colour
  // halves are read back out of red and blue by dividing the brightness away.
  // Float32 tables, so the edge is a tolerance rather than equality.
  const hit = (v: number) => v >= LENS_GAIN_HI - 1e-5 || v <= LENS_GAIN_LO + 1e-5;
  const clamped = [gc > 0 ? gr / gc : gr, gc > 0 ? gb / gc : gb, gc].filter(hit).length;
  return (
    `red ${gr.toFixed(3)}x · blue ${gb.toFixed(3)}x · brightness ${gc.toFixed(3)}x` +
    ` · blue over red ${ratio.toFixed(2)}x${verdict}` +
    (clamped ? ` · ${clamped} of 3 hit the safety clamp — the measurement is out of range` : "")
  );
}

/**
 * Apply (or re-apply) the flat to a linear RGBA buffer in place.
 * @param linear  Float32 RGBA, `w * h * 4`, the decode's working copy.
 * @param w  width in pixels; `h` height. The radius is measured on the flat
 *   (`lensGeom` of `w / h`, about the gains' own centre), as every other
 *   applier measures it.
 * @param next  the gains to land, or null for none.
 * @param prev  the gains already in the buffer, or null for none; each pixel
 *   is multiplied by `next / prev`, each read between bins at that pixel's
 *   radius, so the pass is its own inverse.
 * @returns nothing; the buffer is changed in place. A pixel keeps its value
 *   where `next` and `prev` agree, and a `prev` gain of 0 is left alone rather
 *   than divided by.
 * What the result must satisfy: applying `next` then re-applying with
 *   `prev = next` and `next = null` returns the buffer to within float
 *   rounding of its original — `tools/lens-order-walk.mjs` reads the canvas
 *   hash back after Bypass on and off to hold this.
 */
export function applyLensFlat(linear: Float32Array, w: number, h: number, next: LensGains | null, prev: LensGains | null): void {
  if (!next && !prev) return;
  const aspect = w / Math.max(1, h);
  const gN = next ? lensGeom(aspect, next.c) : null;
  const gP = prev ? lensGeom(aspect, prev.c) : null;
  const sameCentre = !!(gN && gP && gN.cx === gP.cx && gN.cy === gP.cy);
  // Each table read between bins at the pixel's own radius, through the same
  // lensLerp and lensRadius the grade and the shader use, so a ring is the same
  // ring in every place. The RATIO is taken after the reads, never between two
  // tables, because a straight line through ratios is not the ratio of two
  // straight lines and the round trip would stop being exact.
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    let o = y * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const u = (x + 0.5) / w;
      let fr = 1, fg = 1, fb = 1;
      const rN = gN ? lensRadius(u, v, gN) : 0;
      if (next) {
        fr = lensLerp(next.gr, rN, next.n);
        fg = lensLerp(next.gg, rN, next.n);
        fb = lensLerp(next.gb, rN, next.n);
      }
      if (prev) {
        const rP = sameCentre ? rN : lensRadius(u, v, gP!);
        const pr = lensLerp(prev.gr, rP, prev.n), pg = lensLerp(prev.gg, rP, prev.n), pb = lensLerp(prev.gb, rP, prev.n);
        fr = pr > 0 ? fr / pr : 1;
        fg = pg > 0 ? fg / pg : 1;
        fb = pb > 0 ? fb / pb : 1;
      }
      linear[o] *= fr;
      linear[o + 1] *= fg;
      linear[o + 2] *= fb;
    }
  }
}

/**
 * A stable name for a curve, for telling one plan from another.
 * @param curve  the matched curve or null.
 * @returns a short string that is equal for equal curves and "" for none.
 * Consumer: `LensApplied.stamp` and the decode request, compared by
 *   `ensureLensApplied` in main.ts to decide whether a re-apply is due.
 */
export function lensPlanStamp(curve: LensCurve | null | undefined): string {
  if (!curve) return "";
  const sig = (a?: ArrayLike<number>) => (a && a.length ? `${a.length}:${Number(a[0]).toFixed(4)}:${Number(a[a.length >> 1]).toFixed(4)}:${Number(a[a.length - 1]).toFixed(4)}` : "-");
  return `${sig(curve.kr)}|${sig(curve.kb)}|${sig(curve.bump)}|${sig(curve.centre)}`;
}

/**
 * Lay the lens flat on a freshly decoded raw, before anything reads it.
 * @param img  the decode; only one with a `linear` copy is touched.
 * @param plan  the curve and strength, or null.
 * @returns nothing; `img.linear` is corrected in place and `img.lensApplied`
 *   records the gains so a later strength re-applies by ratio.
 * What the result must satisfy: it runs BEFORE `prepareSkySource` and before
 *   the caller measures balance, exposure or denoise — the whole point of
 *   decision 021 — in the worker and on this thread alike.
 */
export function applyLensPlan(img: DecodedImage, plan: LensPlan | null): void {
  if (!img.linear) return;
  const gains = plan ? lensGains(plan.curve, plan.strength) : null;
  if (gains) applyLensFlat(img.linear, img.width, img.height, gains, null);
  img.lensApplied = { stamp: plan?.stamp ?? "", strength: plan?.strength ?? 0, gains };
}
