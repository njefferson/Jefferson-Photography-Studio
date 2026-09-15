// The per-lens IR hot-spot correction that comes WITH the app, as opposed to
// one the reader measured for themselves (lensstore.ts). Chosen from the
// photograph's own EXIF, or from a manual lens pick when the file names no
// lens; it needs nothing set by hand.
//
// THIS FILE IS NOW A LOOKUP, NOT AN ALGORITHM. It used to carry its own EXIF
// parser (JPEG only, which is why these profiles never ran on a raw file), its
// own nearest-focal-length snap, and its own apply path multiplying
// gamma-encoded 8-bit pixels. All three are gone: the profiles are the same
// shape as a measured one, `matchIn` answers "which of these fits this frame"
// for both, and the pipeline applies the result. What is left here is the part
// that is genuinely about the SHIPPED table — the manual picker's lists, and
// turning a manual pick into a match.

import { matchIn, type StoredProfile } from "./lensstore";
import { SHIPPED_PROFILES, SHIPPED_LENSES, SHIPPED_ANCHORS } from "./hotspotProfiles";
import type { ExifSubset } from "./exif";

/** Short names for the manual picker, in the order they were measured in. */
export function lensNames(): string[] {
  return Object.keys(SHIPPED_ANCHORS);
}

/** The focal lengths actually measured for a lens. Offered by the manual
 *  picker, and the range a match is clamped to rather than extrapolated past. */
export function flAnchors(lensShort: string): number[] {
  return SHIPPED_ANCHORS[lensShort] ?? [];
}

/** The full EXIF model string for a short name, so a manual pick can go through
 *  the same matcher as an automatic one instead of a second lookup. */
function modelFor(lensShort: string): string | null {
  for (const [model, short] of Object.entries(SHIPPED_LENSES)) if (short === lensShort) return model;
  return null;
}

/** The shipped profile for a photograph, from its own EXIF. */
export function findShipped(ex: ExifSubset | null): StoredProfile | null {
  return matchIn(SHIPPED_PROFILES, ex);
}

/** The shipped profile for a lens the reader picked by hand, at a focal length
 *  and — when the file recorded one — the frame's own aperture. Built as a
 *  synthetic EXIF so the manual route cannot drift from the automatic one. */
export function findShippedManual(lensShort: string, fl: number, ex: ExifSubset | null): StoredProfile | null {
  const lens = modelFor(lensShort);
  if (!lens || !(fl > 0)) return null;
  return matchIn(SHIPPED_PROFILES, { lens, focalLength: [fl, 1], fNumber: ex?.fNumber });
}

/** The short name for a lens EXIF names, or null when it is not one of ours. */
export function shortFor(lens: string | null | undefined): string | null {
  return (lens && SHIPPED_LENSES[lens.trim()]) ?? null;
}

/** Does this profile know a colour correction, or only a brightness one? The
 *  2026-07 handoff measured brightness alone and ships neutral colour; saying
 *  "it corrects the colour too" of a profile that cannot would be a lie the
 *  reader has no way to check. */
export function hasColour(p: StoredProfile | null): boolean {
  return !!p && p.kr.some((v) => Math.abs(v - 1) > 1e-4);
}

/** WHICH PROFILE SUPPLIES WHICH HALF OF THE LENS CORRECTION.
 *
 *  Takes `measured`, the reader's own profile for this frame's EXIF (null when
 *  they have none), and `shipped`, the profile from the table that ships with
 *  the app (null when nothing matched).
 *  Returns `{ colour, bump, brightness, heldBack }` — the profile whose `kr`/`kb`
 *  to apply, the radial brightness curve to apply, the profile that curve came
 *  from so a report can NAME it, and the reader's profile whose colour was
 *  withheld on provenance (null when none was). Any of them may be null.
 *
 *  THE RESULT IS WHAT EVERY RENDER PATH MUST USE — the open photograph's GPU
 *  upload (`syncLensTexture`), the thumbnails (`lensCurveFor`), the export, and
 *  both halves of the diagnostic. Three of those carried their own copy of this
 *  rule and one of them had a different rule, which is the defect this exists to
 *  make impossible: a reader's measurement with no brightness curve took the
 *  open photograph's brightness correction away while the thumbnails kept it,
 *  so the strip showed a corrected hot-spot and the photograph above it did not.
 *
 *  The rule, and both clauses are load-bearing. ONE PROFILE, WHOLE: a
 *  measurement that carries a brightness curve supersedes the shipped one in
 *  full, because taking half of each means two ideas of where the frame's centre
 *  is. AND NEVER LOSE A HALF NOBODY MEASURED: a measurement's `bump` comes back
 *  as a RANGE rather than a correction and is often absent, and "supersedes in
 *  full" must not mean superseding a correction that exists with one that does
 *  not. Both profiles are matched against the same frame's EXIF, so the fallback
 *  is never another lens.
 *
 *  Colour is withheld from a shipped profile that has none rather than applied
 *  as a flat 1 — see `hasColour`.
 *
 *  AND PROVENANCE DECIDES THE COLOUR HALF, because ownership is not quality.
 *  `kr`/`kb` are ratios between channels across the field, and a ratio measured
 *  on a camera-RENDERED frame carries the camera matrix and its tone curve as
 *  well as the lens — 3.5x the raw answer in red and 2.3x in blue on sixteen
 *  frames, because the camera's own green row multiplies a camera-space residual
 *  by 2.7 (`lensprofile.ts`). So a rendered measurement does not supply colour
 *  over a shipped profile measured from raw.
 *
 *  This is not hypothetical and it is not the reader's doing. The rig called
 *  `sniff(bytes)` without the filename; a NEF and a DNG share a TIFF magic
 *  number; every NEF fell through to its embedded JPEG preview, so every profile
 *  stored before that was fixed says `rendered` — INCLUDING the ones measured
 *  from raw files — while the panel beside it said the raw was better. The
 *  shipped table was re-measured from real raw afterwards, and those earlier
 *  profiles were still overriding it on any device that holds them. Measured on
 *  22 of them against their shipped counterparts: centre blue up to 20.5% apart
 *  and always the same direction, centre red 3.3%.
 *
 *  BRIGHTNESS IS NOT WITHHELD. Red carries the brightness half and the tone
 *  curve does not reach it; the same 22 profiles differ from the raw table by at
 *  most 4.3 points there. An unstated source is treated as the weaker one — it
 *  is not a claim of raw — and a blend across two anchors of different sources
 *  reads `raw+rendered`, which is likewise not a claim of raw. */
export function lensHalves(
  measured: StoredProfile | null | undefined,
  shipped: StoredProfile | null | undefined,
): {
  colour: StoredProfile | null;
  bump: ArrayLike<number> | null;
  brightness: StoredProfile | null;
  heldBack: StoredProfile | null;
} {
  const mine = measured ?? null;
  const theirs = shipped ?? null;
  // Only stands down when there is something better to stand down TO: a shipped
  // profile that is raw AND actually knows a colour. Withholding the reader's
  // colour in favour of nothing would leave the frame uncorrected, which is a
  // worse answer than the one this exists to avoid.
  const heldBack =
    mine && mine.source !== "raw" && theirs?.source === "raw" && hasColour(theirs)
      ? mine
      : null;
  // `brightness` is worked out HERE and not by the caller, because the caller
  // that worked it out for itself was the diagnostic, and it named the shipped
  // profile while the render used the reader's. One rule, one answer, one place.
  const brightness = mine?.bump ? mine : theirs?.bump ? theirs : null;
  return {
    colour: heldBack ? theirs : mine ?? (hasColour(theirs) ? theirs : null),
    bump: brightness?.bump ?? null,
    brightness,
    heldBack,
  };
}

/** One bin's gamma-space bump as the linear-space bump that costs the same
 *  light at mid-grey, where a correctly exposed flat sits.
 *
 *  USED BY THE GENERATOR, NOT AT RUNTIME. The 2026-07 profiles were measured
 *  AND applied on gamma-encoded pixels — the module they came from stated that
 *  as a requirement — and the pipeline works in linear light, where the same
 *  number is a different correction: at the largest bump it is 10% of the light
 *  rather than 22%. Converting at generation time means the app only ever holds
 *  one space. It goes when the last handout profile is replaced by a measured
 *  one. */
export function bumpToLinear(bump: number): number {
  if (!(bump > 0)) return 0;
  const mid = 0.5;
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 1 / (lin(mid / (1 + bump)) / lin(mid)) - 1;
}
