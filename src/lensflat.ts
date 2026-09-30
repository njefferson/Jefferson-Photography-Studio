// The measured lens correction as a flat-field pass on the LINEAR working copy,
// applied at decode before anything is measured or graded (decision 021;
// IR-SCIENCE.md §9c — RawPedia, the DNG GainMap, Lightroom and darktable all
// finish the correction before the grade). One radial gain table from the
// matched curve and the photograph's strength; one in-place multiply per pixel;
// and a RE-APPLY BY RATIO, so a strength change, Bypass, Undo and the bare-decode
// hold reach the uncorrected picture without a second 80 MB buffer — exact in
// float because nothing here clips. The gain arithmetic is the one source
// compileEdit's in-grade stage (kept for 8-bit sources, which have no linear
// copy) also uses, so the two cannot disagree about a ring.
import { lensBin, lensGainsFor, LENS_GAIN_HI, LENS_GAIN_LO, type LensCurve } from "./pipeline";
import type { DecodedImage } from "./decode";

/** The per-bin gains one strength applies: red, blue and the brightness half on
 *  green (and on red and blue through `gr`/`gb`, which already carry it). */
export interface LensGains {
  n: number;
  gr: Float32Array;
  gb: Float32Array;
  gg: Float32Array;
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
 * @param w  width in pixels; `h` height. The radius mapping uses `w / h`, the
 *   source aspect, as every other caller of `lensBin` does.
 * @param next  the gains to land, or null for none.
 * @param prev  the gains already in the buffer, or null for none; the buffer
 *   is multiplied by `next / prev` per bin, so the pass is its own inverse.
 * @returns nothing; the buffer is changed in place. A pixel keeps its value
 *   where `next` and `prev` agree, and a `prev` bin of 0 is left alone rather
 *   than divided by.
 * What the result must satisfy: applying `next` then re-applying with
 *   `prev = next` and `next = null` returns the buffer to within float
 *   rounding of its original — `tools/lens-order-walk.mjs` reads the canvas
 *   hash back after Bypass on and off to hold this.
 */
export function applyLensFlat(linear: Float32Array, w: number, h: number, next: LensGains | null, prev: LensGains | null): void {
  if (!next && !prev) return;
  if (next && prev && next.n !== prev.n) {
    // Different bin counts cannot be divided ring for ring: undo the old table
    // first, then lay the new one — two passes, still exact.
    applyLensFlat(linear, w, h, null, prev);
    applyLensFlat(linear, w, h, next, null);
    return;
  }
  const n = (next ?? prev)!.n;
  const aspect = w / Math.max(1, h);
  const rr = new Float32Array(n), rg = new Float32Array(n), rb = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const pr = prev ? prev.gr[i] : 1, pg = prev ? prev.gg[i] : 1, pb = prev ? prev.gb[i] : 1;
    rr[i] = pr > 0 ? (next ? next.gr[i] : 1) / pr : 1;
    rg[i] = pg > 0 ? (next ? next.gg[i] : 1) / pg : 1;
    rb[i] = pb > 0 ? (next ? next.gb[i] : 1) / pb : 1;
  }
  // One bin per pixel through the same lensBin the grade used, so a ring is the
  // same ring in both places.
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    let o = y * w * 4;
    for (let x = 0; x < w; x++, o += 4) {
      const i = lensBin((x + 0.5) / w, v, aspect, n);
      linear[o] *= rr[i];
      linear[o + 1] *= rg[i];
      linear[o + 2] *= rb[i];
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
  return `${sig(curve.kr)}|${sig(curve.kb)}|${sig(curve.bump)}`;
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
