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
   *  LINEAR space. Present only on the profiles that SHIP with the app, where
   *  it is the LOW end of the measured range — see hotspotProfiles.ts. A
   *  profile the reader measured carries colour only, on the owner's call: one
   *  flat frame reports the bump as a range, and a range is not a correction. */
  bump?: number[];
  /** True for a profile that came with the app rather than from this device. */
  builtIn?: boolean;
  /** Present when this is a blend of two measurements rather than one of them,
   *  so the panel can say so and a test can tell the two apart. */
  blend?: { loFl: number; hiFl: number; t: number };
}

function read(): StoredProfile[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as StoredProfile[]).filter((p) => p && Array.isArray(p.kr) && Array.isArray(p.kb)) : [];
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
export function saveFromPayload(payload: {
  camera?: string;
  measured?: string;
  profiles?: Record<string, { kr: number[]; kb: number[]; frames: number; source: string }>;
  lens_map?: Record<string, string>;
}): { saved: number; skipped: string[]; ok: boolean } {
  const shortToModel = new Map<string, string>();
  for (const [model, short] of Object.entries(payload.lens_map ?? {})) shortToModel.set(short, model);
  const list = read();
  let saved = 0;
  const skipped: string[] = [];
  for (const [key, p] of Object.entries(payload.profiles ?? {})) {
    // THE APERTURE IS OPTIONAL IN THE KEY. It was added to the group key after
    // the rig had already been shipping profiles without it, and a payload from
    // the older shape came back "saved 0" — SILENTLY. The reader presses the
    // button, sees no error, and has nothing. Tolerating both shapes costs
    // three characters; anything still unreadable is named to the caller rather
    // than dropped, which is the part that actually mattered.
    const m = /^(.+)@(\d+(?:\.\d+)?)(?:@f([\d.?]+))?$/.exec(key);
    if (!m || !Array.isArray(p?.kr) || !Array.isArray(p?.kb) || p.kr.length < 2) { skipped.push(key); continue; }
    const entry: StoredProfile = {
      key,
      model: shortToModel.get(m[1]) ?? m[1],
      fl: Number(m[2]),
      ap: m[3] ? Number(m[3]) || NaN : NaN,
      kr: p.kr,
      kb: p.kb,
      frames: p.frames ?? 0,
      source: p.source ?? "",
      camera: payload.camera ?? "",
      measured: payload.measured ?? "",
    };
    const at = list.findIndex((x) => x.key === key);
    if (at >= 0) list[at] = entry; else list.push(entry);
    saved++;
  }
  return { saved, skipped, ok: saved > 0 ? write(list) : true };
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
    const gaps: string[] = [];
    const zoom = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i.exec(mine[0].model);
    if (zoom) {
      const lo = Number(zoom[1]), hi = Number(zoom[2]);
      if (fls[fls.length - 1] < hi * 0.9) gaps.push(`nothing above ${fls[fls.length - 1]}mm on a lens that reaches ${hi}mm`);
      if (fls[0] > lo * 1.1) gaps.push(`nothing below ${fls[0]}mm on a lens that starts at ${lo}mm`);
      for (let i = 0; i < fls.length - 1; i++) {
        // Wider than this and a blend across the gap is a guess rather than an
        // interpolation. Measured by leave-one-out on real anchors: across a
        // 19-50mm hole the blend reproduces the hidden 36mm measurement to
        // within 1.5 points of gain, which is why the bar is not tighter.
        if (fls[i + 1] / fls[i] > 2.2) gaps.push(`a gap between ${fls[i]}mm and ${fls[i + 1]}mm`);
      }
    }
    const sweeps = atFl.filter((e) => e.aps.length >= 3);
    if (!sweeps.length) {
      gaps.push("no focal length shot at three or more apertures, so how the hot-spot changes with aperture is not measured anywhere");
    } else {
      const single = atFl.filter((e) => e.aps.length === 1);
      const orphan = single.filter((e) => !e.aps.some((a) => sweeps[0].aps.includes(a)));
      if (orphan.length) {
        gaps.push(`${orphan.map((e) => e.fl + "mm").join(" and ")} share no aperture with the sweep at ${sweeps[0].fl}mm, so focal length and aperture cannot be told apart there — one frame at an aperture already in the sweep would tie them together`);
      }
    }
    out.push({ short, model: mine[0].model, atFl, gaps, profiles: mine.length });
  }
  return out.sort((a, b) => a.short.localeCompare(b.short));
}
