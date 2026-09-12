// Keeping a lens profile the reader measured, and putting it back to work.
//
// WHY THIS EXISTS. The rig measured a lens and printed numbers, and nothing in
// the app read them: the output was data to hand to a developer to paste into
// `hotspotProfiles.ts`. That is not a feature, it is a collection form — and it
// is why the whole thing still read as a debug screen no matter where the
// button was put (owner, 2026-09-10, and the question was the right one).
//
// WHAT GETS APPLIED, and what deliberately does not. A measurement gives three
// things and they are not equally trustworthy:
//
//   kr / kb   the centre's colour against the frame's own edges. Ratios between
//             channels, so an achromatic falloff divides straight out of them
//             whatever its shape. Well determined. APPLIED.
//   falloff   the whole radial brightness profile, hot-spot and vignette
//             together. Correcting it would flatten the corners too, which is
//             what the Vignette slider is for. NOT applied (owner call).
//   bump      the hot-spot's share of that brightness. Reported as a RANGE
//             because one flat frame cannot separate it from the lens's own
//             falloff. A range is not a correction. NOT applied.
//
// So a measured profile contributes the COLOUR half. The brightness half stays
// with the shipped scalar profile and the Hot-spot slider, which is honest
// about what each of them knows.
//
// THIS FILE ONLY KEEPS AND MATCHES. Applying is the pipeline's job — the curve
// goes to `compileEdit` and to the shader as a texture, so it composes with
// everything else, costs one uniform to bypass, and reaches the export the same
// way every other stage does. It used to multiply the decoded pixels here,
// which worked and meant the preview and the export each had their own copy of
// the same idea.

import type { ExifSubset } from "./exif";
import { shapeProblem, NBINS } from "./lensprofile";

const KEY = "ips-lens-profiles-v1";


export interface StoredProfile {
  /** "16-50@19@f5.6" — lens, focal length, aperture. */
  key: string;
  /** The full lens model string, for matching a photograph's EXIF. */
  model: string;
  fl: number;
  ap: number;
  /** Red and blue against green, per radial bin, 1 in the reference ring. */
  kr: number[];
  kb: number[];
  /** For the reader: what it was measured from and when. */
  frames: number;
  source: string;
  camera: string;
  measured: string;
  /** The hot-spot's share of the centre's brightness, per radial bin, in
   *  LINEAR space, at the LOW end of the measured range.
   *
   *  A measurement reports this as a RANGE, because one flat frame cannot
   *  separate the hot-spot from the lens's own vignette, and for a long time
   *  that was the reason not to apply it at all. What settled it is that the two
   *  errors are not equally recoverable: under-corrected, the Hot-spot slider
   *  finishes the job by hand; over-corrected, no control puts the centre back.
   *  So the low end is applied and the range is what it came from. The profiles
   *  that ship with the app were already doing this — a reader's own
   *  measurement of their own lens on their own body has a better claim to it,
   *  not a worse one (owner call, 2026-09-10). */
  bump?: number[];
  /** True for a profile that came with the app rather than from this device. */
  builtIn?: boolean;
  /** Present when this is a blend of two measurements rather than one of them,
   *  so the panel can say so and a test can tell the two apart. */
  blend?: { loFl: number; hiFl: number; t: number };
}

/** THE SHAPE A CURVE HAS TO HAVE TO BE APPLIED AT ALL.
 *
 *  Every curve that exists — 30 shipped, 130 measured — is exactly NBINS long
 *  and carries no non-finite bin. The checks here are for what arrives from
 *  somewhere else: a backup file edited by hand, a payload from a future or
 *  older rig, a JSON round trip that turned a NaN into a null and then into a
 *  zero. A zero is the dangerous one, because it is a perfectly good number and
 *  the correction it asks for used to be a hundredfold.
 *
 *  Bounds rather than just finiteness, because a bin far outside what any lens
 *  has ever measured is corruption whichever way it reads, and clamping it in
 *  the pipeline would apply a plausible-looking correction nobody measured. The
 *  pipeline clamps as well; this refuses.
 *
 *  THE TWO CURVES ARE DIFFERENT KINDS OF NUMBER AND NEED DIFFERENT BOUNDS, which
 *  is why they are two functions rather than one with arguments. A colour curve
 *  is a RATIO against green and sits around 1; every one that exists is between
 *  0.772 and 1.460, and a 0 in it is the null bin that used to ask for a
 *  hundredfold correction. A brightness curve is a SHARE of the centre's
 *  brightness and sits between 0 and about 1.5 — a 0 means no hot-spot at that
 *  radius, which is the ordinary reading out at the edges of every profile that
 *  ships.
 *
 *  One bound was applied to both for about ten minutes. Every profile with a
 *  brightness curve was then refused on read, so nothing matched any photograph
 *  and the panel simply did not appear — no error, no note, the correction just
 *  silently absent. Caught by a probe that opened a photograph and asked whether
 *  the card was showing. */
function bandProblem(name: string, a: unknown, n: number, lo: number, hi: number): string | null {
  if (!Array.isArray(a)) return `no ${name} curve`;
  if (a.length !== n) return `its ${name} curve has ${a.length} radius bands where this version reads ${n}`;
  for (let i = 0; i < a.length; i++) {
    const v = a[i];
    if (typeof v !== "number" || !Number.isFinite(v)) return `its ${name} curve has no number at band ${i + 1}`;
    if (v < lo || v > hi) return `its ${name} curve reads ${v} at band ${i + 1}, which no lens measures`;
  }
  return null;
}
/** A colour curve: red or blue against green, 1 in the reference ring. */
export function colourProblem(a: unknown, n: number): string | null {
  return bandProblem("colour", a, n, 0.2, 5);
}
/** A brightness curve: the hot-spot's share of the centre, 0 where there is
 *  none. */
export function bumpProblem(a: unknown, n: number): string | null {
  return bandProblem("brightness", a, n, 0, 4);
}

function read(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // READ IS WHERE A CORRUPT PROFILE ACTUALLY ENTERS. It used to check that kr
    // and kb were arrays and nothing about what was in them, so a stored curve
    // with a zero or a null in it was handed to the pipeline as a measurement.
    return (v as StoredProfile[]).filter((p) =>
      p && !colourProblem(p.kr, NBINS) && !colourProblem(p.kb, NBINS)
        && (p.bump === undefined || !bumpProblem(p.bump, NBINS)));
  } catch {
    return []; // a private window, cleared storage, or something else's key
  }
}

function write(list: StoredProfile[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    return true;
  } catch {
    return false; // out of quota, or storage refused — the caller must say so
  }
}

export function listProfiles(): StoredProfile[] {
  return read();
}

/** Take a rig payload and keep its colour terms. Replaces any profile already
 *  stored under the same key — re-measuring a lens should improve it, not
 *  leave two answers to one question. */
/** What one profile in a payload did to what was already kept. Re-measuring
 *  REPLACES a profile with the same lens, focal length and aperture — which is
 *  what a reader who re-shoots a lens wants — and a silent replace can put a
 *  one-frame measurement over a four-frame one with nothing said. */
export interface SaveChange {
  key: string;
  what: "added" | "replaced" | "kept" | "refused";
  /** Why a measurement was refused, in words, when it was. */
  why?: string;
  /** Frames behind the profile that was displaced, or that stood its ground. */
  wasFrames?: number;
  frames: number;
}

/** Put one profile into the list, or say why it did not go in.
 *
 *  ONE RULE, BOTH DOORS. Measuring and restoring each had their own copy of
 *  this, and only one of them was fixed when the rule changed — which is how a
 *  four-frame f/22 was displaced by a two-frame one in the first place. A
 *  backup is not exempt: a file restored over a newer, deeper measurement would
 *  silently undo it, and a backup taken before the shape check knew better can
 *  carry a frame with the sun in its corner.
 *
 *  Frames are the one thing comparable between two measurements of the same
 *  lens, focal length and aperture: more of them average out the sky's own
 *  gradient. EQUAL frames still replaces — re-measuring to the same depth is a
 *  deliberate refresh, and refusing it would leave no way to correct a
 *  measurement except deleting it first. */
function place(list: StoredProfile[], entry: StoredProfile, falloff: ArrayLike<number> | undefined): SaveChange {
  const problem = shapeProblem(falloff ?? [], entry.kr, entry.kb);
  if (problem) return { key: entry.key, what: "refused", frames: entry.frames, why: problem };
  const at = list.findIndex((x) => x.key === entry.key);
  if (at < 0) {
    list.push(entry);
    return { key: entry.key, what: "added", frames: entry.frames };
  }
  if (entry.frames < list[at].frames) {
    return { key: entry.key, what: "kept", wasFrames: list[at].frames, frames: entry.frames };
  }
  const was = list[at].frames;
  list[at] = entry;
  return { key: entry.key, what: "replaced", wasFrames: was, frames: entry.frames };
}

export function saveFromPayload(payload: {
  camera?: string;
  measured?: string;
  profiles?: Record<string, {
    kr: number[]; kb: number[]; frames: number; source: string;
    falloff?: number[]; bump_range?: number[];
  }>;
  lens_map?: Record<string, string>;
}): { saved: number; skipped: string[]; ok: boolean; changes: SaveChange[] } {
  const shortToModel = new Map<string, string>();
  for (const [model, short] of Object.entries(payload.lens_map ?? {})) shortToModel.set(short, model);
  const list = read();
  let saved = 0;
  const skipped: string[] = [];
  const changes: SaveChange[] = [];
  for (const [key, p] of Object.entries(payload.profiles ?? {})) {
    // THE APERTURE IS OPTIONAL IN THE KEY. It was added to the group key after
    // the rig had already been shipping profiles without it, and a payload from
    // the older shape came back "saved 0" — SILENTLY. The reader presses the
    // button, sees no error, and has nothing. Tolerating both shapes costs
    // three characters; anything still unreadable is named to the caller rather
    // than dropped, which is the part that actually mattered.
    const m = /^(.+)@(\d+(?:\.\d+)?)(?:@f([\d.?]+))?$/.exec(key);
    if (!m) { skipped.push(key); continue; }
    // THE SAME CHECK AS ON READ, AT THE OTHER DOOR. This used to accept any pair
    // of arrays with two or more entries, so a curve of the wrong length was
    // stored and then applied at the wrong radii, and a curve with a zero in it
    // was applied as a hundredfold correction on one ring.
    const bad = colourProblem(p?.kr, NBINS) ?? colourProblem(p?.kb, NBINS);
    if (bad) { skipped.push(key); continue; }
    const entry: StoredProfile = {
      key,
      model: shortToModel.get(m[1]) ?? m[1],
      fl: Number(m[2]),
      ap: m[3] ? Number(m[3]) || NaN : NaN,
      kr: p.kr,
      kb: p.kb,
      bump: bumpFrom(p.falloff, p.bump_range),
      frames: p.frames ?? 0,
      source: p.source ?? "",
      camera: payload.camera ?? "",
      measured: payload.measured ?? "",
    };
    const change = place(list, entry, p.falloff);
    changes.push(change);
    if (change.what === "refused" || change.what === "kept") continue;
    saved++;
  }
  return { saved, skipped, ok: saved > 0 ? write(list) : true, changes };
}

/** The bump curve to apply, from what a measurement reports.
 *
 *  `bump_range` is one number for the whole frame — the hot-spot's share of the
 *  CENTRE's brightness — and the correction needs a value per radial bin. The
 *  shape comes from `falloff`, which carries hot-spot and vignette together:
 *  its excess over the reference ring, scaled so the centre lands on the low end
 *  of the range, is the hot-spot's part of it. Without a falloff there is no
 *  shape to scale and nothing is applied, rather than a guess at one. */
function bumpFrom(falloff?: number[], range?: number[]): number[] | undefined {
  const lo = range?.[0];
  if (!Array.isArray(falloff) || falloff.length < 2 || !(typeof lo === "number") || !(lo > 0)) return undefined;
  const peak = falloff[0] - 1;
  if (!(peak > 1e-6)) return undefined;
  const scale = lo / peak;
  return falloff.map((v) => Math.max(0, Math.round((v - 1) * scale * 1e5) / 1e5));
}

export function removeProfile(key: string): void {
  write(read().filter((p) => p.key !== key));
}

export function clearProfiles(): void {
  write([]);
}

/** A number that is 0 at `a`, 1 at `b`, in proportion rather than in units.
 *  50mm to 55mm is a small move and 200mm to 205mm a smaller one; 24mm to 29mm
 *  is not. Apertures are the same shape of quantity — f/4 to f/5.6 is one stop
 *  wherever it sits. */
const logMix = (v: number, a: number, b: number) =>
  a === b ? 0 : Math.min(1, Math.max(0, Math.log(v / a) / Math.log(b / a)));

/** The stored profile that best fits a photograph, or null.
 *
 *  THE LENS DOES NOT STOP AT THE FOCAL LENGTHS THAT HAPPENED TO BE MEASURED.
 *  Picking the nearest profile means a lens measured at 50mm and 250mm hands a
 *  130mm frame the 50mm curve unchanged — the hot-spot's whole character
 *  changes across a zoom, so that is a measurement applied where it does not
 *  belong. Between two measurements the curves are BLENDED, bin by bin, on a
 *  proportional focal-length axis.
 *
 *  It never extrapolates. Outside the measured range the nearest end is used
 *  as-is: a lens curve continued past where anybody looked is a guess wearing
 *  a measurement's clothes, and it would be applied silently to every frame.
 *
 *  Aperture chooses the SET first, focal length interpolates within it. A
 *  hot-spot changes more with aperture than with anything else — measured on a
 *  real lens: 0.19 at f/29 and 0.00 at f/5.3, nearly the same focal length —
 *  so blending across apertures would average two different lenses. The set
 *  nearest the frame's aperture is used, and the note says when that set was
 *  not shot at this frame's aperture. */
export function findProfile(ex: ExifSubset | null): StoredProfile | null {
  return matchIn(read(), ex);
}

/** Pick the profile for a photograph out of a list of candidates.
 *
 *  ONE MATCHER, TWO CALLERS. The profiles that ship with the app and the ones
 *  the reader measured are the same shape from the same rig, and "which of
 *  these fits this frame" is one question. It was two implementations — this
 *  one, and a nearest-focal-length snap in hotspot.ts — which is how the
 *  shipped table ended up ignoring aperture entirely while this one had
 *  handled it for weeks. */
export function matchIn(list: StoredProfile[], ex: ExifSubset | null): StoredProfile | null {
  if (!ex?.lens) return null;
  const model = ex.lens.trim();
  const fl = ex.focalLength && ex.focalLength[1] ? ex.focalLength[0] / ex.focalLength[1] : NaN;
  const ap = ex.fNumber && ex.fNumber[1] ? ex.fNumber[0] / ex.fNumber[1] : NaN;
  const mine = list.filter((p) => p.model === model);
  if (!mine.length) return null;
  if (!Number.isFinite(fl)) return mine[0];

  // 1. the aperture set nearest this frame's, keeping unrecorded apertures
  //    together as their own set rather than pretending they are any value.
  const sets = new Map<string, StoredProfile[]>();
  for (const p of mine) {
    const k = Number.isFinite(p.ap) ? p.ap.toFixed(2) : "?";
    (sets.get(k) ?? sets.set(k, []).get(k)!).push(p);
  }
  // Scored on BOTH axes, not aperture first. Aperture-first was fine while every
  // set spanned the focal range; the profiles that ship with the app do not —
  // seven apertures at one focal length and one aperture at another — and a
  // 50mm f/8 frame chose the f/5.3 set, whose only member was measured at
  // 130mm. Nearer in aperture, and the wrong lens position entirely.
  //
  // The focal cost is how far OUTSIDE a set's measured range the frame falls:
  // zero when the set brackets it, because interpolating inside a range is not
  // a reach. Both terms are log ratios, so they are the same kind of distance
  // and add without a fudge factor.
  let best: StoredProfile[] = [];
  let bestCost = Infinity;
  for (const [k, list2] of sets) {
    const apCost = k === "?" || !Number.isFinite(ap) ? 0.4 : Math.abs(Math.log(Number(k) / ap));
    const fls = list2.map((q) => q.fl);
    const lo = Math.min(...fls), hi = Math.max(...fls);
    const flCost = fl >= lo && fl <= hi ? 0 : Math.abs(Math.log(fl / (fl < lo ? lo : hi)));
    const cost = apCost + flCost;
    if (cost < bestCost) { bestCost = cost; best = list2; }
  }

  // 2. within it, bracket the frame's focal length and blend.
  const by = [...best].sort((a, z) => a.fl - z.fl);
  if (by.length === 1) return by[0];
  if (fl <= by[0].fl) return by[0];
  if (fl >= by[by.length - 1].fl) return by[by.length - 1];
  let lo = by[0], hi = by[by.length - 1];
  for (let i = 0; i < by.length - 1; i++) {
    if (fl >= by[i].fl && fl <= by[i + 1].fl) { lo = by[i]; hi = by[i + 1]; break; }
  }
  if (lo === hi || lo.fl === hi.fl) return lo;
  const t = logMix(fl, lo.fl, hi.fl);
  // Landing exactly on an anchor is not a blend of anything. Returning a
  // synthetic "blended 0% / 100%" is arithmetically identical and reads to the
  // reader as if the app could not tell where the frame was.
  if (t <= 0) return lo;
  if (t >= 1) return hi;
  const n = Math.min(lo.kr.length, hi.kr.length, lo.kb.length, hi.kb.length);
  const kr: number[] = [], kb: number[] = [];
  for (let i = 0; i < n; i++) {
    kr.push(lo.kr[i] + (hi.kr[i] - lo.kr[i]) * t);
    kb.push(lo.kb[i] + (hi.kb[i] - lo.kb[i]) * t);
  }
  // The bump blends on the same mix, and only when BOTH ends carry one — a
  // blend against a missing half would quietly halve the correction.
  let bump: number[] | undefined;
  if (lo.bump && hi.bump) {
    const bn = Math.min(lo.bump.length, hi.bump.length);
    bump = [];
    for (let i = 0; i < bn; i++) bump.push(lo.bump[i] + (hi.bump[i] - lo.bump[i]) * t);
  }
  return {
    key: `${lo.key}+${hi.key}`,
    model,
    fl: Math.round(fl),
    ap: lo.ap,
    kr,
    kb,
    bump,
    builtIn: lo.builtIn && hi.builtIn,
    frames: lo.frames + hi.frames,
    source: lo.source === hi.source ? lo.source : `${lo.source}+${hi.source}`,
    camera: lo.camera || hi.camera,
    measured: lo.measured || hi.measured,
    blend: { loFl: lo.fl, hiFl: hi.fl, t },
  };
}

/** How far a match had to reach, in words, so the reader can judge it. */
export function matchNote(p: StoredProfile, ex: ExifSubset | null): string {
  const fl = ex?.focalLength && ex.focalLength[1] ? ex.focalLength[0] / ex.focalLength[1] : NaN;
  const ap = ex?.fNumber && ex.fNumber[1] ? ex.fNumber[0] / ex.fNumber[1] : NaN;
  // "your measurements" is a claim about where the numbers came from, and it is
  // false of a profile that shipped with the app. One note serves both cards,
  // so it has to know which it is describing.
  const mine = !p.builtIn;
  const bits: string[] = [];
  if (p.blend) {
    const pc = Math.round(p.blend.t * 100);
    bits.push(mine
      ? `blended between your ${p.blend.loFl}mm and ${p.blend.hiFl}mm measurements (${100 - pc}% / ${pc}%)`
      : `between the ${p.blend.loFl}mm and ${p.blend.hiFl}mm profiles (${100 - pc}% / ${pc}%)`);
  } else if (Number.isFinite(fl) && Math.round(fl) !== Math.round(p.fl)) {
    bits.push(`measured at ${p.fl}mm, this frame is ${Math.round(fl)}mm`);
  }
  if (Number.isFinite(ap) && Number.isFinite(p.ap) && Math.abs(ap - p.ap) > 0.15) {
    bits.push(`measured at f/${p.ap}, this frame is f/${ap.toFixed(1)}`);
  } else if (!Number.isFinite(p.ap) && !mine) {
    // The 2026-07 pair recorded no aperture, and the hot-spot moves a long way
    // with one: 0.00 wide open against 0.19 stopped right down, on one lens.
    bits.push("measured at an aperture that was not recorded");
  }
  return bits.join("; ");
}

/** What a set of profiles covers, and where the holes are.
 *
 *  ONE ANSWER, TWO PLACES THAT ASK IT. The rig reports coverage for the run
 *  that just finished; the reader wants the same picture of what is KEPT, at
 *  any time, so they can go out and shoot the frames that are missing. Working
 *  it out twice is how the two would come to disagree about what a gap is. */
export interface LensCoverage {
  short: string;
  model: string;
  /** Ascending focal lengths, each with the apertures measured there. */
  atFl: { fl: number; aps: string[]; frames: number }[];
  /** Plain sentences naming what is not covered. Empty when nothing stands out. */
  gaps: string[];
  profiles: number;
}

/** What is still missing from a set of measurements, in words, as the next trip
 *  out rather than as a complaint.
 *
 *  ONE COPY, THREE CALLERS' WORTH OF HISTORY. This lived twice — once here for
 *  the stored panel and once in the rig for the run just measured — and the two
 *  had drifted into different bugs. The panel looked only at focal lengths with
 *  exactly ONE aperture, so a real store's 130mm (f/5.3 and f/29) was never
 *  examined and the report named 135mm alone. The rig's copy reported only when
 *  NO single-aperture focal length shared with the sweep, and then named all of
 *  them — so one tied and one untied produced silence. Under-reporting a gap is
 *  worse than reporting none: the reader plans the next trip out from it.
 *
 *  `aps` are the aperture LABELS already formatted for the reader ("f/8"), so
 *  the two callers compare the same strings they print. */
export function gapsFor(model: string, atFl: { fl: number; aps: string[] }[]): string[] {
  const gaps: string[] = [];
  const fls = atFl.map((e) => e.fl);
  const zoom = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i.exec(model);
  if (zoom && fls.length) {
    const lo = Number(zoom[1]), hi = Number(zoom[2]);
    if (fls[fls.length - 1] < hi * 0.9) gaps.push(`nothing above ${fls[fls.length - 1]}mm on a lens that reaches ${hi}mm`);
    if (fls[0] > lo * 1.1) gaps.push(`nothing below ${fls[0]}mm on a lens that starts at ${lo}mm`);
    // Wider than this and a blend across the gap is a guess rather than an
    // interpolation. Measured by leave-one-out on real anchors.
    for (let i = 0; i < fls.length - 1; i++) {
      if (fls[i + 1] / fls[i] > 2.2) gaps.push(`a gap between ${fls[i]}mm and ${fls[i + 1]}mm`);
    }
  }
  const sweeps = atFl.filter((e) => e.aps.length >= 3);
  if (!sweeps.length) {
    gaps.push("no focal length shot at three or more apertures, so how the hot-spot changes with aperture is not measured anywhere");
    return gaps;
  }
  // Untied means sharing nothing with ANY sweep — not "measured at exactly one
  // aperture", and not "none of them shares".
  const orphan = atFl.filter((e) => !sweeps.includes(e)
    && !e.aps.some((a) => sweeps.some((sw) => sw.aps.includes(a))));
  if (orphan.length) {
    const names = orphan.map((e) => e.fl + "mm");
    gaps.push(`${names.join(" and ")} ${names.length === 1 ? "shares" : "share"} no aperture with the sweep at ${sweeps.map((sw) => sw.fl + "mm").join(" or ")}, so focal length and aperture cannot be told apart there — one frame at an aperture already in the sweep would tie ${names.length === 1 ? "it" : "them"} in`);
  }
  return gaps;
}

export function coverage(list: StoredProfile[]): LensCoverage[] {
  const byLens = new Map<string, StoredProfile[]>();
  for (const p of list) {
    const short = /^([^@]+)@/.exec(p.key)?.[1] ?? p.model;
    (byLens.get(short) ?? byLens.set(short, []).get(short)!).push(p);
  }
  const out: LensCoverage[] = [];
  for (const [short, mine] of byLens) {
    const byFl = new Map<number, { aps: string[]; frames: number }>();
    for (const p of mine) {
      const fl = Math.round(p.fl);
      const e = byFl.get(fl) ?? byFl.set(fl, { aps: [], frames: 0 }).get(fl)!;
      e.aps.push(Number.isFinite(p.ap) ? `f/${p.ap}` : "aperture not recorded");
      e.frames += p.frames;
    }
    const fls = [...byFl.keys()].sort((a, b) => a - b);
    const atFl = fls.map((fl) => ({
      fl,
      aps: byFl.get(fl)!.aps.sort((x, y) => (parseFloat(x.slice(2)) || 1e9) - (parseFloat(y.slice(2)) || 1e9)),
      frames: byFl.get(fl)!.frames,
    }));
    const gaps = gapsFor(mine[0].model, atFl);
    out.push({ short, model: mine[0].model, atFl, gaps, profiles: mine.length });
  }
  return out.sort((a, b) => a.short.localeCompare(b.short));
}

// --- Backing it up, and putting it back ------------------------------------
// WHY THIS EXISTS. A measurement is a trip out with the camera, a set of sky
// frames and a run of the rig, and it lives in `localStorage` — which is not
// storage the app owns. A browser may clear it: iOS Safari drops site data
// after a stretch of not visiting, "Clear website data" takes it, and a device
// short of room evicts. `navigator.storage.persist()` asks the browser to keep
// it and the browser is free to say no, silently. None of that is a reason to
// store it somewhere else — every browser store has the same property — but it
// is a reason the reader must be able to get their measurements OUT, and back
// IN on another device or after a clear. A warning with no remedy is just bad
// news delivered on time.

const BACKUP_FORMAT = "ips-lens-backup";

/** Everything kept on this device, as one file's worth of text. */
export function exportAll(): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    saved: new Date().toISOString().slice(0, 10),
    profiles: read(),
  });
}

/** Read a backup, or a rig payload, back in.
 *
 *  BOTH SHAPES, because the reader has two files that look like the same thing:
 *  what the rig printed after a measurement, and what this app wrote as a
 *  backup. Refusing one of them because of a header would be a distinction only
 *  the code cares about. */
export function importText(text: string): { saved: number; skipped: string[]; ok: boolean; changes: SaveChange[] } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { saved: 0, skipped: ["that file is not the numbers — it did not read as JSON"], ok: true, changes: [] };
  }
  const d = data as { format?: string; profiles?: unknown };
  if (d?.format === BACKUP_FORMAT && Array.isArray(d.profiles)) {
    const list = read();
    const changes: SaveChange[] = [];
    const skipped: string[] = [];
    let saved = 0;
    for (const raw of d.profiles as StoredProfile[]) {
      if (!raw?.key || !Array.isArray(raw.kr) || !Array.isArray(raw.kb) || raw.kr.length < 2) {
        skipped.push(raw?.key ?? "(a profile with no key)");
        continue;
      }
      // A stored profile carries its bump curve rather than the falloff it came
      // from, so the shape check here sees the colour half only. That is the
      // half that caught both real bad profiles.
      const change = place(list, { ...raw, frames: raw.frames ?? 0 }, undefined);
      changes.push(change);
      if (change.what === "refused" || change.what === "kept") continue;
      saved++;
    }
    return { saved, skipped, ok: saved > 0 ? write(list) : true, changes };
  }
  if (d?.profiles && typeof d.profiles === "object") {
    return saveFromPayload(data as Parameters<typeof saveFromPayload>[0]);
  }
  return { saved: 0, skipped: ["that file has no lens profiles in it"], ok: true, changes: [] };
}
