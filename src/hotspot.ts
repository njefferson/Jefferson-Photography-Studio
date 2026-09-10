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
