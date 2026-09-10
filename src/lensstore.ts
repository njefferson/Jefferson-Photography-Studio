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

import type { ExifSubset } from "./exif";

const KEY = "ips-lens-profiles-v1";

/** 8-bit sRGB -> linear, and back. Built once. */
const SRGB_TO_LINEAR = (() => {
  const t = new Float64Array(256);
  for (let i = 0; i < 256; i++) {
    const c = i / 255;
    t[i] = c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  return t;
})();
function linearToSrgb8(v: number): number {
  if (!(v > 0)) return 0;
  if (v >= 1) return 255;
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

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
  if (!ex?.lens) return null;
  const model = ex.lens.trim();
  const fl = ex.focalLength && ex.focalLength[1] ? ex.focalLength[0] / ex.focalLength[1] : NaN;
  const ap = ex.fNumber && ex.fNumber[1] ? ex.fNumber[0] / ex.fNumber[1] : NaN;
  const mine = read().filter((p) => p.model === model);
  if (!mine.length) return null;
  if (!Number.isFinite(fl)) return mine[0];

  // 1. the aperture set nearest this frame's, keeping unrecorded apertures
  //    together as their own set rather than pretending they are any value.
  const sets = new Map<string, StoredProfile[]>();
  for (const p of mine) {
    const k = Number.isFinite(p.ap) ? p.ap.toFixed(2) : "?";
    (sets.get(k) ?? sets.set(k, []).get(k)!).push(p);
  }
  let best: StoredProfile[] = [];
  let bestCost = Infinity;
  for (const [k, list] of sets) {
    const cost = k === "?" || !Number.isFinite(ap) ? 0.4 : Math.abs(Math.log(Number(k) / ap));
    if (cost < bestCost) { bestCost = cost; best = list; }
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
  const n = Math.min(lo.kr.length, hi.kr.length, lo.kb.length, hi.kb.length);
  const kr: number[] = [], kb: number[] = [];
  for (let i = 0; i < n; i++) {
    kr.push(lo.kr[i] + (hi.kr[i] - lo.kr[i]) * t);
    kb.push(lo.kb[i] + (hi.kb[i] - lo.kb[i]) * t);
  }
  return {
    key: `${lo.key}+${hi.key}`,
    model,
    fl: Math.round(fl),
    ap: lo.ap,
    kr,
    kb,
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
  const bits: string[] = [];
  if (p.blend) {
    const pc = Math.round(p.blend.t * 100);
    bits.push(`blended between your ${p.blend.loFl}mm and ${p.blend.hiFl}mm measurements (${100 - pc}% / ${pc}%)`);
  } else if (Number.isFinite(fl) && Math.round(fl) !== Math.round(p.fl)) {
    bits.push(`measured at ${p.fl}mm, this frame is ${Math.round(fl)}mm`);
  }
  if (Number.isFinite(ap) && Number.isFinite(p.ap) && Math.abs(ap - p.ap) > 0.15) {
    bits.push(`measured at f/${p.ap}, this frame is f/${ap.toFixed(1)}`);
  }
  return bits.join("; ");
}

/** Move a frame from one correction strength to another, in place.
 *
 *  WHY A DELTA RATHER THAN A PRISTINE COPY. The scalar hot-spot correction
 *  keeps an untouched copy of the frame and re-applies from it whenever the
 *  reader moves Strength. That works because it only ever runs on the 8-bit
 *  path; a raw frame is a Float32 RGBA at full size — 330 MB for 20 megapixels
 *  — and a second one of those on a phone is not a copy, it is a crash.
 *
 *  A colour gain is invertible, so it does not need one. Going from strength a
 *  to strength b is a multiply by g(b)/g(a), and going back to 0 returns the
 *  original values exactly in floating point. That is what makes the untouched
 *  decode one press away without holding it in memory (Doctrine §14).
 *
 *  The 8-bit path still rounds at every step, so callers with a pristine copy
 *  should keep using it there; this is what serves the raw path. */
export function applyColourDelta(
  img: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array },
  p: StoredProfile,
  from: number,
  to: number,
): void {
  if (from === to) return;
  const nb = Math.min(p.kr.length, p.kb.length);
  if (nb < 2) return;
  const w = img.width, h = img.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const Rd = Math.sqrt(cx * cx + cy * cy);
  const gr = new Float32Array(nb), gb = new Float32Array(nb);
  const gain = (k: number, s: number) => { const v = 1 + (k - 1) * s; return v > 1e-3 ? 1 / v : 1; };
  for (let i = 0; i < nb; i++) {
    gr[i] = gain(p.kr[i], to) / gain(p.kr[i], from);
    gb[i] = gain(p.kb[i], to) / gain(p.kb[i], from);
  }
  const lin = img.linear, px = img.pixels;
  for (let y = 0; y < h; y++) {
    const dy = y - cy, dy2 = dy * dy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const i = Math.min(nb - 1, ((Math.sqrt(dx * dx + dy2) / Rd) * nb) | 0);
      const o = (y * w + x) * 4;
      if (lin) { lin[o] *= gr[i]; lin[o + 2] *= gb[i]; }
      else if (px) {
        px[o] = linearToSrgb8(SRGB_TO_LINEAR[px[o]] * gr[i]);
        px[o + 2] = linearToSrgb8(SRGB_TO_LINEAR[px[o + 2]] * gb[i]);
      }
    }
  }
}

/** Apply a measured colour profile to a decoded frame, in place.
 *
 *  Runs on the DECODED pixels before white balance and the channel swap, the
 *  same place and for the same reason as the scalar hot-spot correction:
 *  correcting after the false-colour swap would move the colour rather than fix
 *  it. Handles both the 8-bit and the linear-float paths, because a profile the
 *  reader measured from their own raw frames should work on raw frames — the
 *  shipped profiles cannot, and say so.
 *
 *  `strength` scales the correction; 0 is off, 1 is the measurement. */
export function applyColour(
  img: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array },
  p: StoredProfile,
  strength = 1,
): void {
  const px = img.pixels, lin = img.linear;
  if ((!px && !lin) || strength === 0) return;
  const nb = Math.min(p.kr.length, p.kb.length);
  if (nb < 2) return;
  const w = img.width, h = img.height;
  const cx = (w - 1) / 2, cy = (h - 1) / 2;
  const Rd = Math.sqrt(cx * cx + cy * cy);
  // One divide per bin rather than per pixel, and the strength folded in here.
  const gr = new Float32Array(nb), gb = new Float32Array(nb);
  for (let i = 0; i < nb; i++) {
    const kr = 1 + (p.kr[i] - 1) * strength;
    const kb = 1 + (p.kb[i] - 1) * strength;
    gr[i] = kr > 1e-3 ? 1 / kr : 1;
    gb[i] = kb > 1e-3 ? 1 / kb : 1;
  }
  if (lin) {
    for (let y = 0; y < h; y++) {
      const dy = y - cy, dy2 = dy * dy;
      for (let x = 0; x < w; x++) {
        const dx = x - cx;
        const i = Math.min(nb - 1, ((Math.sqrt(dx * dx + dy2) / Rd) * nb) | 0);
        const o = (y * w + x) * 4;
        lin[o] *= gr[i];
        lin[o + 2] *= gb[i];
      }
    }
    return;
  }
  // THE 8-BIT PATH LINEARISES FIRST, and this is not a nicety. The gains were
  // measured in linear light; multiplying an sRGB-ENCODED value by one of them
  // applies roughly its 1/2.4 power instead, so a 20% correction lands as 8%.
  // The shipped scalar correction multiplies encoded values directly and is
  // wrong in the same direction — smaller, because its gains are smaller.
  // One LUT per bin per channel would be 160 tables; instead the two 256-entry
  // sRGB conversions are built once and the gain is applied between them.
  const toLin = SRGB_TO_LINEAR, toEnc = linearToSrgb8;
  for (let y = 0; y < h; y++) {
    const dy = y - cy, dy2 = dy * dy;
    for (let x = 0; x < w; x++) {
      const dx = x - cx;
      const i = Math.min(nb - 1, ((Math.sqrt(dx * dx + dy2) / Rd) * nb) | 0);
      const o = (y * w + x) * 4;
      px![o] = toEnc(toLin[px![o]] * gr[i]);
      px![o + 2] = toEnc(toLin[px![o + 2]] * gb[i]);
    }
  }
}
