// Per-lens IR hot-spot correction from the SHIPPED measurements — a separate,
// earlier correction from the manual `hotspot`/`hotspotSize` sliders in
// pipeline.ts/gl.ts: this one is chosen from the file's own EXIF (or a manual
// lens + focal-length pick) and needs nothing set by hand. Bump-only (vignette
// excluded), so it composes safely with the Vignette slider.
//
// The profile data is the 2026-07-10 measurement handoff, unchanged. Its apply
// path is NOT: it multiplied gamma-encoded 8-bit pixels, which meant it could
// not run on a raw file at all, and it snapped a frame to the nearest measured
// focal length. Both are dealt with below; the old path is gone rather than
// kept beside this one, because a function that applies these numbers in the
// wrong space is exactly the thing a later session would find and call.

import { HOTSPOT_PROFILE_DATA as DATA } from "./hotspotProfiles";

export function lensNames(): string[] {
  return Object.keys(DATA.fl_anchors);
}

export function flAnchors(lensShort: string): number[] {
  return DATA.fl_anchors[lensShort] ?? [];
}

// --- The shipped profiles as a PIPELINE curve -------------------------------
// TWO CHANGES from the ported module, and the second one is the reason this
// could not be a straight move.
//
// 1. NEAREST BECOMES BETWEEN. `nearestFL` snaps a 30mm frame to the 36mm
//    anchor and applies a correction measured 6mm away at full strength. The
//    anchors are 19/36/50 and 50/130/250 — a frame is almost never on one.
//    Blended in log focal length, the same mix `lensstore.ts` uses, and clamped
//    at both ends: outside the measured range the nearest end is used as it is,
//    never extrapolated.
//
// 2. GAMMA BECOMES LINEAR, AND THE NUMBERS HAVE TO BE CONVERTED FOR IT. The
//    shipped profiles were measured AND applied on gamma-encoded 8-bit pixels —
//    the ported `apply` above states that as a requirement, and it came from the
//    same rig as the data. The pipeline works in linear light, so applying the
//    same number there would be a different correction: at the largest bump
//    (0.110 at 16-50@19) multiplying encoded values takes 22% of the light out,
//    and multiplying linear ones takes 10%. Neither number is wrong; they are
//    answers to different questions.
//
//    So each bin is converted to the linear gain that reproduces what the frame
//    used to get, at the working point a flat is exposed for. A flat is a
//    mid-tone by construction — the rig refuses one that is blown or dark — so
//    mid-grey is not an arbitrary choice of point, it is where the measurement
//    lives. The conversion is exact there and close either side of it.
const MID = 0.5; // encoded mid-grey: where a correctly exposed flat sits

function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

/** One bin's gamma-space bump as the linear-space bump that costs the same
 *  light at mid-grey. Returns a bump (0 = no correction), not a gain, so it
 *  keeps the shape the shipped data is written in. */
export function bumpToLinear(bump: number): number {
  if (!(bump > 0)) return 0;
  const g = srgbToLinear(MID / (1 + bump)) / srgbToLinear(MID);
  return 1 / g - 1;
}

/** Blend in log focal length; clamped, never extrapolated. */
function logMix(v: number, a: number, b: number): number {
  if (a === b) return 0;
  return Math.min(1, Math.max(0, Math.log(v / a) / Math.log(b / a)));
}

/** The shipped bump curve for a lens at a focal length, in LINEAR space and
 *  interpolated between anchors. `null` when the lens is not one of the two
 *  that were measured. */
export function bumpCurve(lensShort: string, fl: number): Float64Array | null {
  const anchors = DATA.fl_anchors[lensShort];
  if (!anchors || !anchors.length) return null;
  const at = (a: number) => DATA.profiles[lensShort + "@" + a] ?? null;
  const sorted = [...anchors].sort((x, y) => x - y);
  let lo = sorted[0], hi = sorted[sorted.length - 1];
  if (fl <= lo) hi = lo;
  else if (fl >= hi) lo = hi;
  else {
    for (let i = 0; i < sorted.length - 1; i++) {
      if (fl >= sorted[i] && fl <= sorted[i + 1]) { lo = sorted[i]; hi = sorted[i + 1]; break; }
    }
  }
  const a = at(lo), b = at(hi);
  if (!a || !b) return null;
  const t = lo === hi ? 0 : logMix(fl, lo, hi);
  const n = Math.min(a.length, b.length);
  const out = new Float64Array(n);
  // Converted first, then blended: what is being mixed is the correction that
  // will actually be applied, not the number it was written down as.
  for (let i = 0; i < n; i++) out[i] = bumpToLinear(a[i]) * (1 - t) + bumpToLinear(b[i]) * t;
  return out;
}

/** Which of the two shipped lenses a frame was taken with, and where between
 *  the anchors it falls. Reads a lens name from ANY exif reader — the ported
 *  parser above only understands JPEG, which is the whole reason these
 *  profiles have never run on a raw file. */
export function matchShipped(lens: string | null | undefined, fl: number | null | undefined):
  { short: string; fl: number } | null {
  if (!lens || !fl) return null;
  const short = DATA.lens_map[lens];
  return short ? { short, fl } : null;
}

/** What to tell the reader: which lens, and whether the frame sits between two
 *  measured focal lengths or outside them. */
export function shippedNote(short: string, fl: number): string {
  const a = [...(DATA.fl_anchors[short] ?? [])].sort((x, y) => x - y);
  if (!a.length) return "";
  const r = Math.round(fl);
  // On an anchor: say so plainly. "between 19 and 36mm, at 36mm" is true and
  // reads like the app cannot tell where the frame is.
  if (a.some((x) => Math.abs(x - fl) < 0.5)) return `measured at ${r}mm`;
  if (fl < a[0]) return `measured at ${a[0]}mm, this frame is ${r}mm`;
  if (fl > a[a.length - 1]) return `measured at ${a[a.length - 1]}mm, this frame is ${r}mm`;
  for (let i = 0; i < a.length - 1; i++) {
    if (fl >= a[i] && fl <= a[i + 1]) return `between ${a[i]} and ${a[i + 1]}mm, at ${r}mm`;
  }
  return "";
}
