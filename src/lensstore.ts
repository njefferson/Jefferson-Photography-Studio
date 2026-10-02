// Keeping a lens profile the reader measured, and putting it back to work.
//
// WHY THIS EXISTS. The rig measured a lens and printed numbers, and nothing in
// the app read them: the output was data to hand to a developer to paste into
// `hotspotProfiles.ts`. That is not a feature, it is a collection form — and it
// is why the whole thing still read as a debug screen no matter where the
// button was put (2026-09-10, and the question was worth asking).
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
//   bump      the hot-spot's share of that brightness. Measured as a RANGE,
//             because one flat frame cannot separate it from the lens's own
//             falloff, and turned into a curve on save by `bumpFrom`. APPLIED
//             when present: `lensHalves` (hotspot.ts) takes the reader's own
//             brightness curve over the shipped one. This entry said "NOT
//             applied" after that stopped being true (corrected 2026-09-29).
//
// So a measured profile contributes its colour half, and its brightness half
// when it carries one; otherwise the brightness comes from the shipped profile.
//
// THIS FILE ONLY KEEPS AND MATCHES. Applying is the pipeline's job — the curve
// goes to `compileEdit` and to the shader as a texture, so it composes with
// everything else, costs one uniform to bypass, and reaches the export the same
// way every other stage does. It used to multiply the decoded pixels here,
// which worked and meant the preview and the export each had their own copy of
// the same idea.

import type { ExifSubset } from "./exif";
import { fnv1a } from "./stamp";
import { shapeProblem, NBINS, SPOT_CENTRE_MAX } from "./lensprofile";

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
  /** Where the hot spot's centre sat in the flats, as an offset `[x, y]` from
   *  the frame's geometric centre (x right, y down, the SENSOR's axes) in units
   *  of the half-diagonal. Estimated by the rig (`spotCentre`, lensprofile.ts)
   *  and absent on every profile measured before it did — absent IS the
   *  geometric centre, which is what those were measured about, so an old
   *  profile applies exactly as it always did. DNG FixVignetteRadial and lensfun
   *  both carry an optical centre for the same reason. */
  centre?: [number, number];
  /** The focus distance the flats were shot at, in metres, when their files
   *  recorded one (EXIF SubjectDistance). The match weighs it as lensfun does,
   *  in reciprocal distance. Absent on every profile from a Nikon Z 50, which
   *  does not write it. */
  dist?: number;
  /** Present when this is a blend of two measurements rather than one of them,
   *  so the panel can say so and a test can tell the two apart. */
  blend?: { loFl: number; hiFl: number; t: number };
  /** Present when two APERTURES were blended for this frame — the two that
   *  bracket it, mixed linearly in 1/N (lensfun's aperture axis). */
  apBlend?: { loAp: number; hiAp: number; t: number };
  /** HOW FAR THE MATCHER HAD TO REACH to answer for this frame, in RawTherapee's
   *  units (`ffInfo::distance`): two per doubling of the f-number — one per
   *  STOP — against one per doubling of focal length, combined as a Euclidean
   *  distance, and zero on an axis the measurements bracket.
   *
   *  Set by the matcher, never stored, and undefined when the frame carries no
   *  focal length — there is no reach to report without something to measure
   *  against, and a missing measurement must not read as a good one. It exists
   *  so precedence can weigh FIT as well as ownership: a store holding one
   *  profile answered for every frame, at any aperture, at full strength. */
  reach?: number;
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
/** Whether a stored COLOUR curve is one this version can apply.
 *  Takes `a`, the candidate curve as read from storage or a payload, and `n`,
 *  the band count this build indexes by (always NBINS).
 *  Returns null when the curve is usable, or a sentence naming what is wrong
 *  with it, for showing to the reader.
 *  DEPENDS BOTH WAYS: `saveFromPayload` and `read` must apply this to the SAME
 *  curves, or a profile is stored at one door and refused at the other. */
export function colourProblem(a: unknown, n: number): string | null {
  return bandProblem("colour", a, n, 0.2, 5);
}
/** Whether a stored BRIGHTNESS curve is one this version can apply.
 *  Takes `a`, the candidate curve, and `n`, the band count this build indexes
 *  by (always NBINS).
 *  Returns null when the curve is usable, or a sentence naming what is wrong.
 *  WHATEVER `bumpFrom` RETURNS MUST PASS THIS. Those two disagreed once — this
 *  demanded NBINS while bumpFrom returned a curve as long as whatever falloff
 *  it was handed — and profiles saved cleanly and were then refused on every
 *  read, silently, taking their colour curves with them. Held together now by
 *  tools/lens-store-check.mjs. */
export function bumpProblem(a: unknown, n: number): string | null {
  return bandProblem("brightness", a, n, 0, 4);
}

/** Whether a stored hot-spot CENTRE is one this version can apply.
 *  Takes `c`, the candidate as read from storage or a payload (absent is
 *  allowed: it is the geometric centre).
 *  Returns null when it is usable or absent, or a sentence naming what is
 *  wrong. A centre more than a quarter of the half-diagonal off the middle is
 *  not a lens's optical centre, it is a cloud or a ramp the estimate followed —
 *  the rig refuses to write one (`spotCentre`), and this refuses to read one.
 *  DEPENDS BOTH WAYS like the curve checks: `saveFromPayload` and `read` apply
 *  it to the same field, held by tools/lens-store-check.mjs. */
export function centreProblem(c: unknown): string | null {
  if (c === undefined) return null;
  if (!Array.isArray(c) || c.length !== 2) return "its hot-spot centre is not a pair of numbers";
  for (const v of c) if (typeof v !== "number" || !Number.isFinite(v) || Math.abs(v) > SPOT_CENTRE_MAX) return `its hot-spot centre reads ${JSON.stringify(c)}, further from the middle than any lens puts one`;
  return null;
}

/** What the last read had to set aside, for the diagnostic report. A profile
 *  that vanishes without a word is the defect this pair of counters exists to
 *  make visible — the reader has no other way to know their measurement is not
 *  being used. */
export let droppedProfiles = 0;
export let droppedBumps = 0;

function read(): StoredProfile[] {
  droppedProfiles = 0;
  droppedBumps = 0;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const v = JSON.parse(raw);
    if (!Array.isArray(v)) return [];
    // READ IS WHERE A CORRUPT PROFILE ACTUALLY ENTERS. It used to check that kr
    // and kb were arrays and nothing about what was in them, so a stored curve
    // with a zero or a null in it was handed to the pipeline as a measurement.
    //
    // A BAD BRIGHTNESS CURVE DROPS THE BRIGHTNESS CURVE, NOT THE MEASUREMENT.
    // This used to refuse the whole profile when `bump` failed — and `bump` is
    // the half this file's own header calls a range rather than a correction,
    // while kr/kb are the half it calls well determined and APPLIED. So a fault
    // in the part that is not applied by default destroyed the part that is,
    // and it did it SILENTLY: the reader measured a lens, saw it save, and the
    // correction never came back. Reported as hot-spot removal that had worked
    // like magic and then stopped.
    //
    // The two doors also disagreed, which is what let a bad curve in. `bumpFrom`
    // builds the curve from `falloff` and accepts any falloff of two bands or
    // more, so it returns a curve of THAT length; saveFromPayload validated kr
    // and kb and never looked at what it had just derived; and read demanded
    // exactly NBINS. A payload whose falloff was not 80 bands long — an older
    // rig, which this same function already tolerates elsewhere by design —
    // saved cleanly and was then invisible for ever.
    const out: StoredProfile[] = [];
    for (const p of v as StoredProfile[]) {
      if (!p || colourProblem(p.kr, NBINS) || colourProblem(p.kb, NBINS)) {
        droppedProfiles++;
        continue;
      }
      // A CENTRE THAT IS NOT ONE IS DROPPED, NOT THE PROFILE: absent is the
      // geometric centre, which is a correction that exists. Same rule as a
      // bad brightness curve above.
      const q = centreProblem(p.centre) ? { ...p, centre: undefined } : p;
      if (q.bump !== undefined && bumpProblem(q.bump, NBINS)) {
        droppedBumps++;
        out.push({ ...q, bump: undefined });
        continue;
      }
      out.push(q);
    }
    return out;
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
/** Every stored profile this version can use.
 *  Takes nothing.
 *  Returns the validated list from `read` — so a profile with an unusable
 *  brightness curve appears here WITHOUT that curve rather than not at all.
 *  Callers may assume every entry has usable kr/kb; they may not assume `bump`
 *  is present. */
export function listProfiles(): StoredProfile[] {
  return read();
}
/** A short string that changes whenever the stored profiles change.
 *  Takes nothing.
 *  Returns a stamp derived from the stored list, for cheap change detection by
 *  anything caching a match.
 *  It must change when a profile is added, removed or replaced, or a cache
 *  keyed on it will serve a match from a profile that is no longer there. */
export function profilesStamp(): string {
  let raw = "";
  try {
    raw = localStorage.getItem(KEY) ?? "";
  } catch {
    return "0"; // private window: nothing stored, nothing to invalidate
  }
  return fnv1a(raw);
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
/** Whether a profile carries a colour measurement at all.
 *  Takes `p`, anything with `kr` and `kb` curves.
 *  Returns true when any band differs from 1 — a flat 1 means the measurement
 *  found no colour rather than measuring none.
 *  Used to rank profiles (colour beats frame count) when one replaces another
 *  under the same key. */
export function saysAnythingAboutColour(p: { kr: ArrayLike<number>; kb: ArrayLike<number> }): boolean {
  for (const a of [p.kr, p.kb]) for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - 1) > 1e-9) return true;
  return false;
}

function place(list: StoredProfile[], entry: StoredProfile, falloff: ArrayLike<number> | undefined): SaveChange {
  const problem = shapeProblem(falloff ?? [], entry.kr, entry.kb);
  if (problem) return { key: entry.key, what: "refused", frames: entry.frames, why: problem };
  const at = list.findIndex((x) => x.key === entry.key);
  if (at < 0) {
    list.push(entry);
    return { key: entry.key, what: "added", frames: entry.frames };
  }
  // COLOUR BEATS FRAME COUNT, AND NOTHING ELSE DOES.
  //
  // The rank was frame count alone, on the sound reasoning that more frames of
  // sky average out the sky's own gradient. It ranked a profile that measures
  // NO colour above one that does, because the first was shot more times.
  //
  // That is not a hypothetical. The floor that stopped raw frames measuring
  // colour was on the rendered scale for the whole life of the feature, so a
  // device can hold a generation of six-frame profiles with a flat 1 for
  // colour — and measured against one real device, fifteen freshly measured
  // colour-carrying profiles were about to be turned away by them. The run
  // would have reported "kept", correctly and uselessly, and the correction
  // would have stayed brightness-only with nothing saying why.
  //
  // So the comparison is two-level: a profile that says something about colour
  // outranks one that says nothing, and only within the same kind does the
  // frame count decide.
  const mine = saysAnythingAboutColour(entry), theirs = saysAnythingAboutColour(list[at]);
  const better = mine !== theirs ? mine : entry.frames >= list[at].frames;
  if (!better) {
    return { key: entry.key, what: "kept", wasFrames: list[at].frames, frames: entry.frames };
  }
  const was = list[at].frames;
  list[at] = entry;
  return { key: entry.key, what: "replaced", wasFrames: was, frames: entry.frames };
}
/** Store the profiles from a measuring run.
 *  Takes `payload`: the rig's block of numbers — `camera`, `measured`, a
 *  `profiles` map of curves keyed by lens and focal length, and `lens_map` from
 *  short names to models.
 *  Writes the usable ones to storage, replacing an existing entry for the same
 *  key when the new one is better (colour beats frame count).
 *  Returns how many were saved, which keys were skipped, whether the write
 *  succeeded, and a per-key list of what happened for reporting to the reader.
 *  EVERY CURVE IT STORES MUST PASS THE CHECKS `read` APPLIES — colourProblem on
 *  kr and kb, bumpProblem on the derived bump — or it saves something that will
 *  never load. That is exactly the bug this comment is standing on. */
export function saveFromPayload(payload: {
  camera?: string;
  measured?: string;
  profiles?: Record<string, {
    kr: number[]; kb: number[]; frames: number; source: string;
    falloff?: number[]; bump_range?: number[]; centre?: number[]; dist?: number;
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
      // VALIDATED AT THE DOOR IT IS CREATED AT. Derived here and judged on
      // read, with nothing checking it in between, is how a profile came to be
      // saved and then refused for ever. A curve that will not pass the reader
      // is not stored: the colour half is the measurement's real contribution
      // and it goes in either way.
      bump: (() => { const b = bumpFrom(p.falloff, p.bump_range);
                     return b && !bumpProblem(b, NBINS) ? b : undefined; })(),
      frames: p.frames ?? 0,
      source: p.source ?? "",
      camera: payload.camera ?? "",
      measured: payload.measured ?? "",
      // The rig's estimate of where the spot sat; a centre the reader would
      // refuse is not stored, and the profile goes in about the middle.
      ...(p.centre !== undefined && !centreProblem(p.centre) ? { centre: [p.centre[0], p.centre[1]] as [number, number] } : {}),
      ...(typeof p.dist === "number" && p.dist > 0 && Number.isFinite(p.dist) ? { dist: p.dist } : {}),
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
 *  shape to scale and nothing is applied, rather than a guess at one.
 *
 *  NBINS EXACTLY, because the curve it returns is indexed per radial bin and
 *  that is the contract the reader enforces. This used to accept any falloff of
 *  two bands or more and return a curve of THAT length, while the reader
 *  refused anything that was not NBINS — so a payload from a rig with a
 *  different band count saved cleanly and was then refused on every read, and
 *  refused WHOLESALE, taking the colour curves with it. A measured lens stopped
 *  working and nothing said so. tools/lens-store-check.mjs holds the two ends
 *  together now. */
export function bumpFrom(falloff?: number[], range?: number[]): number[] | undefined {
  const lo = range?.[0];
  if (!Array.isArray(falloff) || falloff.length !== NBINS || !(typeof lo === "number") || !(lo > 0)) return undefined;
  const peak = falloff[0] - 1;
  if (!(peak > 1e-6)) return undefined;
  const scale = lo / peak;
  return falloff.map((v) => Math.max(0, Math.round((v - 1) * scale * 1e5) / 1e5));
}
/** Forget one stored profile.
 *  Takes `key`, the profile's storage key.
 *  Writes the list back without it; returns nothing.
 *  Anything holding a match from that profile must re-ask, so callers refresh
 *  through `profilesStamp` rather than keeping the old result. */
export function removeProfile(key: string): void {
  write(read().filter((p) => p.key !== key));
}
/** Forget every stored profile.
 *  Takes nothing, writes an empty list, returns nothing.
 *  The reader's own measurements are gone after this and the app falls back to
 *  the profiles that ship with it — which still correct, so nothing on screen
 *  announces the loss unless the caller says so. */
export function clearProfiles(): void {
  write([]);
}

/** A number that is 0 at `a`, 1 at `b`, in proportion rather than in units.
 *  50mm to 55mm is a small move and 200mm to 205mm a smaller one; 24mm to 29mm
 *  is not. */
const logMix = (v: number, a: number, b: number) =>
  a === b ? 0 : Math.min(1, Math.max(0, Math.log(v / a) / Math.log(b / a)));
/** The stored profile that fits a photograph.
 *  Takes `ex`, the frame's EXIF subset (lens, focal length, aperture, make and
 *  model), or null when it carries none.
 *  Returns the best matching profile, blended across focal lengths and
 *  apertures where two bracket the frame — or null when nothing matches, which
 *  includes every profile measured on another body (`matchIn`).
 *  Reads through `read`, so a profile whose brightness curve is unusable can
 *  still be returned here for its colour. */
export function findProfile(ex: ExifSubset | null): StoredProfile | null {
  return matchIn(read(), ex);
}

/** The camera a frame was taken on, in the same spelling the rig records:
 *  make and model joined by a space, runs of space collapsed. */
function cameraOf(ex: ExifSubset | null): string {
  return [ex?.make, ex?.model].filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}
const bodyOf = (p: StoredProfile) => (p.camera ?? "").replace(/\s+/g, " ").trim();

/** THE BODY HAS TO MATCH, AND SO DOES THE LENS — BOTH HALVES, OR NEITHER.
 *
 *  `kr`/`kb` are how much red and blue the centre has against green across the
 *  frame. In infrared that is two things multiplied together: how the lens's
 *  transmission varies across the field, which is the lens, and what the sensor
 *  does with the wavelengths that reach it — which is set by the filter inside
 *  the CONVERTED BODY. A 720nm conversion has almost no blue to measure; a
 *  full-spectrum one has a great deal.
 *
 *  This used to withhold the COLOUR alone, and only when both cameras were
 *  known and differed, calling the brightness half "internal reflection inside
 *  the lens barrel, which is geometry, and it transfers". It does not, reliably:
 *  Kolari shows the sensor stack and the conversion filter making or removing
 *  the spot on the same lens — an AR coating reduced it and a removed
 *  hot-mirror stack took it away. And the reference refuses outright:
 *  RawTherapee's `ffInfo::distance` (rtengine/ffmanager.cc) returns INFINITY
 *  when maker, model or lens differ, and its `find()` returns nothing when every
 *  distance is infinite. So a profile from another body, or from a frame whose
 *  make and model are not recorded, matches nothing here, both halves at once,
 *  and `withheldFor` says why.
 *
 *  WHAT THIS CANNOT SEE. EXIF records no conversion, so a second NIKON Z 50
 *  converted differently is the same body to this test; only the reader can
 *  tell, and the card says so (IR-SCIENCE.md 9c).
 *
 *  The manual pick is the exception, as RawTherapee's is: a reader who chooses
 *  a profile by hand has said which one they want, and `anyBody` lets it
 *  through. */
/** The profile that fits a photograph, out of a list the caller supplies.
 *  Takes `list`, the candidates; `ex`, the frame's EXIF subset; and `opts`,
 *  where `anyBody` skips the body test for a lens the reader picked by hand.
 *  Returns the best match — blended across the focal lengths and the
 *  apertures that bracket the frame, its `reach` set — or null when no
 *  profile of this lens on this body exists.
 *  ONE MATCHER, TWO CALLERS — the shipped table and the reader's own profiles
 *  are the same shape and must be matched by the same rules; a second
 *  implementation is how the shipped table came to ignore aperture.
 *  What the result must satisfy: never a profile whose `camera` differs from
 *  the frame's make and model unless `anyBody`; `tools/lens-store-check.mjs`
 *  holds that, the bracketing and the reach units. */
export function matchIn(list: StoredProfile[], ex: ExifSubset | null, opts?: { anyBody?: boolean }): StoredProfile | null {
  return matchAny(list, ex, !!opts?.anyBody);
}

/** WHY NOTHING MATCHED, when a profile of this lens exists for another body.
 *  Takes `list` and `ex`, as `matchIn`.
 *  Returns the body the profiles were measured on and the one the frame names
 *  ("" when it names none), or null when there is no such profile or one
 *  matched. Consumer: the lens cards and the diagnostic, which must say why a
 *  lens the app knows is not being corrected rather than offer to identify it. */
export function withheldFor(list: StoredProfile[], ex: ExifSubset | null): { measuredOn: string; frame: string } | null {
  if (!ex?.lens) return null;
  const model = ex.lens.trim();
  const lens = list.filter((p) => p.model === model);
  if (!lens.length) return null;
  const body = cameraOf(ex);
  if (lens.some((p) => bodyOf(p) === body)) return null;
  return { measuredOn: bodyOf(lens[0]) || "a camera that was not recorded", frame: body };
}

/** One stop of aperture, in reach units: RawTherapee's `2 * log2(a1 / a2)` at a
 *  ratio of root two. Exported so the precedence rule in hotspot.ts measures
 *  "a stop" in the matcher's own units. */
export const REACH_STOP = 1;
/** What an unrecorded aperture costs: a little over a stop, as it did when
 *  reach was measured in natural logs (0.4 there). */
const UNKNOWN_AP = 1.15;

/** Two profiles mixed at `t` (0 is `a`): colour linearly; the brightness curve
 *  with a missing end read as a measured zero (see below); the centre with a
 *  missing end read as the geometric centre, and absent when both are. */
function mixProfiles(a: StoredProfile, b: StoredProfile, t: number): Pick<StoredProfile, "kr" | "kb" | "bump" | "centre" | "dist"> {
  const n = Math.min(a.kr.length, b.kr.length, a.kb.length, b.kb.length);
  const kr: number[] = [], kb: number[] = [];
  for (let i = 0; i < n; i++) {
    kr.push(a.kr[i] + (b.kr[i] - a.kr[i]) * t);
    kb.push(a.kb[i] + (b.kb[i] - a.kb[i]) * t);
  }
  // THE BUMP BLENDS ON THE SAME MIX, AND A MISSING END IS A MEASURED ZERO.
  //
  // This used to blend only when BOTH ends carried a curve, reasoning that a
  // blend against a missing half would quietly halve the correction. Refusing
  // removes ALL of it, which is the larger error and the one that was shipping:
  // a frame at 57mm f/8 sits 14% of the way from a 50mm anchor with a real
  // hot-spot to a 130mm anchor with none, and got no brightness correction at
  // all while the report said a profile was correcting it.
  //
  // A MISSING BUMP IS NOT AN UNKNOWN. `bumpFrom` returns undefined at a range of
  // zero or a centre no brighter than the reference ring — the rig found no
  // hot-spot — and the generator deliberately stores nothing rather than a flat
  // zero curve. The shipped table agrees with the physics on this: across the
  // 44 profiles of the 50-250mm the curve APPEARS as the lens stops down and is
  // absent wide open, which is how a hot-spot behaves (IR-SCIENCE.md §1), so the
  // absences sit exactly where no hot-spot is expected. The same holds across
  // apertures, which is the axis the curve comes and goes along.
  //
  // The one case where missing means unreadable rather than zero is a reader's
  // own profile whose curve `read()` set aside. Blending that toward zero
  // under-corrects; refusing it corrected nothing at all. Under-correcting
  // leaves a disc the Hot-spot slider can finish, which is the trade the
  // generator's own header already names.
  let bump: number[] | undefined;
  if (a.bump || b.bump) {
    const bn = a.bump && b.bump ? Math.min(a.bump.length, b.bump.length) : (a.bump ?? b.bump)!.length;
    const at = (p: StoredProfile, i: number) => (p.bump ? p.bump[i] : 0);
    const out: number[] = [];
    for (let i = 0; i < bn; i++) out.push(at(a, i) + (at(b, i) - at(a, i)) * t);
    // A blend that lands on nothing stays nothing: a flat zero curve would make
    // the report name a brightness source that does not move a pixel, which is
    // the contradiction this whole thread started as.
    bump = out.some((v) => v > 1e-6) ? out : undefined;
  }
  let centre: [number, number] | undefined;
  if (a.centre || b.centre) {
    const ca = a.centre ?? [0, 0], cb = b.centre ?? [0, 0];
    centre = [ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t];
  }
  const dist = a.dist !== undefined && b.dist !== undefined ? 1 / ((1 - t) / a.dist + t / b.dist) : undefined;
  return { kr, kb, bump, centre, dist };
}

function matchAny(list: StoredProfile[], ex: ExifSubset | null, anyBody: boolean): StoredProfile | null {
  if (!ex?.lens) return null;
  const model = ex.lens.trim();
  const fl = ex.focalLength && ex.focalLength[1] ? ex.focalLength[0] / ex.focalLength[1] : NaN;
  const ap = ex.fNumber && ex.fNumber[1] ? ex.fNumber[0] / ex.fNumber[1] : NaN;
  const dist = typeof ex.subjectDistance === "number" && ex.subjectDistance > 0 ? ex.subjectDistance : NaN;
  const body = cameraOf(ex);
  const mine = list.filter((p) => p.model === model && (anyBody || bodyOf(p) === body));
  if (!mine.length) return null;
  if (!Number.isFinite(fl)) return mine[0];

  // 1. Each aperture set, brought to this frame's focal length — bracketed and
  //    blended where two anchors straddle it, the nearer end where none do —
  //    with how far OUTSIDE its measured range the frame falls. Unrecorded
  //    apertures stay together as their own set rather than pretending they are
  //    any value.
  const sets = new Map<string, StoredProfile[]>();
  for (const p of mine) {
    const k = Number.isFinite(p.ap) ? p.ap.toFixed(2) : "?";
    (sets.get(k) ?? sets.set(k, []).get(k)!).push(p);
  }
  type Cand = { p: StoredProfile; ap: number; flCost: number; cost: number };
  const cands: Cand[] = [];
  for (const [k, set] of sets) {
    const by = [...set].sort((a, z) => a.fl - z.fl);
    const lo0 = by[0].fl, hi0 = by[by.length - 1].fl;
    // Focal distance in RawTherapee's unit: one per doubling.
    const flCost = fl >= lo0 && fl <= hi0 ? 0 : Math.abs(Math.log2(fl / (fl < lo0 ? lo0 : hi0)));
    let p: StoredProfile;
    if (by.length === 1 || fl <= lo0) p = by[0];
    else if (fl >= hi0) p = by[by.length - 1];
    else {
      let lo = by[0], hi = by[by.length - 1];
      for (let i = 0; i < by.length - 1; i++) {
        if (fl >= by[i].fl && fl <= by[i + 1].fl) { lo = by[i]; hi = by[i + 1]; break; }
      }
      const t = lo === hi || lo.fl === hi.fl ? 0 : logMix(fl, lo.fl, hi.fl);
      // Landing exactly on an anchor is not a blend of anything. Returning a
      // synthetic "blended 0% / 100%" is arithmetically identical and reads to
      // the reader as if the app could not tell where the frame was.
      if (t <= 0) p = lo;
      else if (t >= 1) p = hi;
      else {
        p = {
          ...mixProfiles(lo, hi, t),
          key: `${lo.key}+${hi.key}`,
          model,
          fl: Math.round(fl),
          ap: lo.ap,
          builtIn: lo.builtIn && hi.builtIn,
          frames: lo.frames + hi.frames,
          source: lo.source === hi.source ? lo.source : `${lo.source}+${hi.source}`,
          camera: lo.camera || hi.camera,
          measured: lo.measured || hi.measured,
          blend: { loFl: lo.fl, hiFl: hi.fl, t },
        };
      }
    }
    // Aperture in RawTherapee's unit, `2 * log2(a1 / a2)`, "more important for
    // vignette": one per STOP, so a stop weighs what a doubling of focal length
    // does. It was |ln| on both axes until 2026-10-02, which made a stop half
    // of a doubling.
    const apAt = k === "?" ? NaN : Number(k);
    const apCost = !Number.isFinite(apAt) || !Number.isFinite(ap) ? UNKNOWN_AP : Math.abs(2 * Math.log2(apAt / ap));
    // Focus distance as lensfun weighs it, in RECIPROCAL distance — dioptres
    // here, one per dioptre — and only when both ends recorded one.
    const dCost = Number.isFinite(dist) && p.dist !== undefined ? Math.abs(1 / p.dist - 1 / dist) : 0;
    cands.push({ p, ap: apAt, flCost, cost: Math.hypot(apCost, flCost, dCost) });
  }

  // 2. THE TWO APERTURES THAT BRACKET THE FRAME, mixed in 1/N, as lensfun's
  //    vignetting interpolation places a calibration on an `a = 4 / aperture`
  //    axis (lens.cpp `__vignetting_dist`). It took the single nearest set
  //    until 2026-10-02 — while the shipped table's own numbers say brightness
  //    is the aperture-dependent half (the 50-250 at 50mm: centre bump 0.0241
  //    at f/8, 0.0502 at f/13), so a frame between two measured stops got the
  //    nearer stop's spot, whole. Each side is the nearest set ON that side by
  //    the same distance, so a set measured at another focal length entirely
  //    only wins a side that has nothing nearer.
  const reached = (p: StoredProfile, reach: number): StoredProfile => ({ ...p, reach });
  let best = cands[0];
  for (const c of cands) if (c.cost < best.cost) best = c;
  if (!Number.isFinite(ap)) return reached(best.p, best.cost);
  let below: Cand | null = null, above: Cand | null = null;
  for (const c of cands) {
    if (!Number.isFinite(c.ap)) continue;
    if (c.ap <= ap && (!below || c.cost < below.cost)) below = c;
    if (c.ap >= ap && (!above || c.cost < above.cost)) above = c;
  }
  // Bracketed in aperture, the aperture is not a reach; what is left is how far
  // outside its focal range either end had to go. A bracket whose ends had to
  // go further in focal length than the single nearest set is from the frame
  // altogether is not an interpolation of THIS frame — measured on the owner's
  // NIR_1688, 91mm f/5: f/4.5 exists only at 50mm and f/5.3 only at 130mm —
  // and the nearest set stands alone, as lensfun's inverse-distance weights
  // would all but give it.
  const reach = below && above ? Math.max(below.flCost, above.flCost) : Infinity;
  if (!below || !above || below === above || below.ap === above.ap || reach > best.cost) {
    const one = !below || !above || reach > best.cost ? best : below;
    return reached(one.p, one.cost);
  }
  const t = (1 / below.ap - 1 / ap) / (1 / below.ap - 1 / above.ap);
  if (t <= 0) return reached(below.p, reach);
  if (t >= 1) return reached(above.p, reach);
  const lo = below.p, hi = above.p;
  return {
    ...mixProfiles(lo, hi, t),
    key: `${lo.key}~${hi.key}`,
    model,
    fl: Math.round(fl),
    ap,
    builtIn: lo.builtIn && hi.builtIn,
    frames: lo.frames + hi.frames,
    source: lo.source === hi.source ? lo.source : `${lo.source}+${hi.source}`,
    camera: lo.camera || hi.camera,
    measured: lo.measured || hi.measured,
    ...(lo.blend ? { blend: lo.blend } : hi.blend ? { blend: hi.blend } : {}),
    apBlend: { loAp: below.ap, hiAp: above.ap, t },
    reach,
  };
}
/** How to describe a match to the reader.
 *  Takes `p`, the profile that matched, and `ex`, the frame's EXIF subset.
 *  Returns a sentence naming where the numbers came from and how exactly they
 *  fit — the blend between focal lengths and between apertures, whether the
 *  aperture was recorded, and where the hot spot's centre was found.
 *  It must stay honest about a blend: a profile applied at a focal length
 *  nobody measured, described as a measurement, is the failure it guards. */
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
  if (p.apBlend) {
    const pc = Math.round(p.apBlend.t * 100);
    bits.push(`between f/${p.apBlend.loAp} and f/${p.apBlend.hiAp} (${100 - pc}% / ${pc}%)`);
  } else if (Number.isFinite(ap) && Number.isFinite(p.ap) && Math.abs(ap - p.ap) > 0.15) {
    bits.push(`measured at f/${p.ap}, this frame is f/${ap.toFixed(1)}`);
  } else if (!Number.isFinite(p.ap) && !mine) {
    // The 2026-07 pair recorded no aperture, and the hot-spot moves a long way
    // with one: 0.00 wide open against 0.19 stopped right down, on one lens.
    bits.push("measured at an aperture that was not recorded");
  }
  // WHERE THE SPOT WAS FOUND, when it was not the middle: a reader comparing
  // the card with the picture can then see why the correction is off-centre.
  if (p.centre && Math.hypot(p.centre[0], p.centre[1]) >= 0.005) {
    const pct = (v: number) => `${Math.abs(Math.round(v * 100))}%`;
    const side = [p.centre[0] ? `${pct(p.centre[0])} ${p.centre[0] > 0 ? "right" : "left"}` : "", p.centre[1] ? `${pct(p.centre[1])} ${p.centre[1] > 0 ? "down" : "up"}` : ""].filter(Boolean).join(" and ");
    bits.push(`its hot spot sits ${side} of the middle, measured from the flats`);
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
/** Which focal lengths of a lens have not been measured yet.
 *  Takes `model`, the lens as EXIF spells it, `atFl`, the focal length the
 *  reader is asking about, and the list of stored profiles.
 *  Returns the gaps worth filling, for telling the reader what to shoot next.
 *  Advice only — nothing in the pipeline reads it. */
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
/** What the stored profiles add up to.
 *  Takes nothing; reads the stored list.
 *  Returns a per-lens summary of the focal lengths measured and how many frames
 *  went into each, for the measuring panel.
 *  Reporting only; it must not be used to decide whether a profile applies —
 *  that is `matchIn`'s job and it has rules this does not. */
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
/** The stored profiles as text the reader can keep.
 *  Takes nothing; reads the stored list.
 *  Returns the same block of numbers the rig emits, so a backup can be handed
 *  straight back to `importText` on another device.
 *  The two must stay the same shape — a backup this writes that importText
 *  cannot read is a backup that is not one. */
export function exportAll(): string {
  return JSON.stringify({
    format: BACKUP_FORMAT,
    version: 1,
    saved: new Date().toISOString().slice(0, 10),
    profiles: read(),
  });
}
/** Restore profiles from a block of text.
 *  Takes `text`, a payload previously written by `exportAll` or by the rig.
 *  Parses it and stores what is usable through `saveFromPayload`.
 *  Returns what was saved and what was skipped, with a reason per key.
 *  Text from outside is the reason the curve checks exist: it is the one door
 *  where a hand-edited or older-format profile actually arrives. */
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
