// Camera profiles for the Temperature and Tint: reading one from a file's tags, keeping the ones the reader loads for a camera, and listing what a photograph can be read through.
//
// WHAT A PROFILE IS HERE. Adobe's editors read a raw file's white through the camera profile chosen for it, so the same gains are a different Temperature and Tint under a different profile (record 102). Only the numbers that reading needs are taken from a profile file: its name, the camera it names, and its two colour matrices with their calibration illuminants (DNG tags 50936, 50708, 50721, 50722, 50778 and 50779). The hue and saturation tables, the look table, the tone curve and the forward matrices are not read and not stored, and the picture is never rendered through a profile: the profile decides the two numbers, not the colour route.
//
// WHERE THE PROFILE COMES FROM, in this order for every camera. First the profile the file embeds, where it carries one; then one the reader has loaded for that camera through the door in the Basic tab (a profile file, or a zip of them); then the camera's stock matrix, the one the app already holds for the bodies it knows. A loaded profile is kept on this device under the camera it names and is offered only for a photograph from that camera. Nothing here ships a profile: the two Nikon Z 50 files this was built against are the reader's to load, and their matrices are not in this app.
//
// WHICH ONE A PHOTOGRAPH OPENS UNDER. The pages of the infrared profile pack's author say to start with the Infrared Temp -100 profile and to switch to the other when the temperature reaches an end of the scale, and say nothing about carrying a choice from one photograph to the next. So a photograph opens under, in order: the choice saved with its own edit; the choice a held balance was kept under; the profile the reader last switched to for that camera; the profile the file embeds; the Infrared Temp -100 profile when both of the pack's two are loaded, else the newest loaded one; the stock matrix. The reader's switch is the only thing that writes a choice.

import { Tiff } from "./raw/tiff";
import { makeColourSpec, type ColourSpec } from "./kelvin";
import { dngCalibration, dngCameraToSrgb, nikonColorMatrix } from "./color";
import { cameraModel } from "./decode";
import { readZipIndex, readZipEntryPrefix } from "./zip";

/** A camera profile reduced to what the Temperature and Tint read: its name (tag 50936, or the file's name when it carries none), the camera it names (UniqueCameraModel), and its colour matrices (XYZ to camera, nine numbers each) with their calibration illuminants (EXIF LightSource codes), `null` where the file has none. */
export interface CameraProfile { name: string; camera: string; cm1: number[]; ill1: number | null; cm2: number[] | null; ill2: number | null }

/** A profile the reader loaded: the profile, the key its camera is matched by (`cameraKey`), and when it was loaded as the device's own clock wrote it. */
export interface LoadedProfile extends CameraProfile { key: string; made: string }

/** The largest file taken for a camera profile. The two read for record 102 are about 110 KB each; this is eighteen times that. */
export const PROFILE_FILE_MAX = 2 * 1024 * 1024;
/** The most profile entries read out of one zip, the most kept on the device in all, and the longest name or camera text kept. A pack of two profiles for each of 496 cameras holds 992 entries. */
export const PROFILE_PACK_ENTRIES = 1200;
export const PROFILES_KEPT_MAX = 1200;
export const PROFILE_TEXT_MAX = 60;

const KEY = "ips-camprofiles-v1";
const LAST_KEY = "ips-camprofile-last-v1";

/** A camera's name reduced to the letters and digits that tell two bodies apart, so the EXIF Model of a Nikon file ("NIKON Z 50") and the UniqueCameraModel of a profile ("Nikon Z 50") meet.
 *  @param text  a model string, or undefined.
 *  @returns lower-case letters and digits only; empty for nothing. What it must satisfy: case, spaces and punctuation never separate two spellings of one body, and two bodies whose names differ in a letter or digit never meet (a Z 50 and a Z 50_2 stay apart). */
export function cameraKey(text: string | undefined): string {
  return (text ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** The tags of one directory, as `Ifd` and `dngCalibration` offer them. */
type Tags = { num(tag: number): number[]; str(tag: number): string | undefined };

/** Whether a list is nine finite numbers. @param m  the candidate. @returns true for a usable colour matrix. */
function isMatrix(m: ReadonlyArray<number> | null | undefined): m is number[] {
  return !!m && m.length === 9 && m.every((x) => Number.isFinite(x) && Math.abs(x) < 100);
}

/** A number kept to six places, so a stored profile stays small. @param x  a matrix entry. @returns it rounded. */
function six(x: number): number {
  return Math.round(x * 1e6) / 1e6;
}

/** The profile a directory of tags holds.
 *  @param t  the tags (a profile file's first directory, or a DNG's).
 *  @param fallbackName  the name to use when the tags carry none, normally the file's name without its extension.
 *  @returns `profile`, or `problem`, a sentence for the reader, when the tags name no camera or carry no colour matrix.
 *  What it must satisfy: a returned profile passes `profileProblem`; the camera is the UniqueCameraModel as written; the name is the profile's own, cut to `PROFILE_TEXT_MAX`. */
export function profileFromTags(t: Tags, fallbackName: string): { profile: CameraProfile } | { problem: string } {
  const camera = t.str(50708);
  if (!camera) return { problem: "That file names no camera, so it is not a camera profile." };
  const cm1 = t.num(50721);
  if (!isMatrix(cm1)) return { problem: "That file carries no colour matrix, so it is not a camera profile." };
  const cm2 = t.num(50722);
  const name = (t.str(50936) ?? fallbackName).trim().slice(0, PROFILE_TEXT_MAX) || "Camera profile";
  const profile: CameraProfile = {
    name,
    camera: camera.slice(0, PROFILE_TEXT_MAX),
    cm1: cm1.map(six),
    ill1: t.num(50778)[0] ?? null,
    cm2: isMatrix(cm2) ? cm2.map(six) : null,
    ill2: t.num(50779)[0] ?? null,
  };
  const bad = profileProblem(profile);
  return bad ? { problem: `That file is not a usable camera profile: ${bad}.` } : { profile };
}

/** Whether a profile is one this version can read a white through.
 *  @param p  the candidate, as built or as read from storage.
 *  @returns null when it is usable, or a sentence fragment naming what is wrong.
 *  What it must satisfy: `readProfileFile` and the store apply it to the same records, so a profile is never stored at one door and refused at the other; a usable profile has a name and a camera that are text of 1 to `PROFILE_TEXT_MAX` characters, a first matrix of nine finite numbers, a second that is null or the same, and illuminant codes that are null or whole numbers from 0 to 255. */
export function profileProblem(p: unknown): string | null {
  const o = p as Partial<CameraProfile> | null;
  if (!o || typeof o !== "object") return "it is not a record";
  if (typeof o.name !== "string" || !o.name.trim() || o.name.length > PROFILE_TEXT_MAX) return "its name is empty or too long";
  if (typeof o.camera !== "string" || !o.camera.trim() || o.camera.length > PROFILE_TEXT_MAX) return "its camera is empty or too long";
  if (!isMatrix(o.cm1)) return "its first colour matrix is not nine numbers";
  if (o.cm2 !== null && o.cm2 !== undefined && !isMatrix(o.cm2)) return "its second colour matrix is not nine numbers";
  for (const c of [o.ill1, o.ill2]) {
    if (c !== null && c !== undefined && !(Number.isInteger(c) && c >= 0 && c <= 255)) return "an illuminant code is not a whole number from 0 to 255";
  }
  return null;
}

/** The profile in a picked file.
 *  @param bytes  the whole file.
 *  @param fallbackName  the file's name without its extension, used when the profile names itself nothing.
 *  @returns `profile`, or `problem`, a sentence for the reader.
 *  What it must satisfy: never throws on any bytes; a file larger than `PROFILE_FILE_MAX` is refused before it is read; nothing is stored here. */
export function readProfileFile(bytes: Uint8Array, fallbackName: string): { profile: CameraProfile } | { problem: string } {
  if (bytes.length < 16) return { problem: "That file is too small to be a camera profile." };
  if (bytes.length > PROFILE_FILE_MAX) return { problem: "That file is too large to be a camera profile; they are about 100 KB." };
  try {
    const ifd = new Tiff(bytes).allIfds()[0];
    if (!ifd) return { problem: "That file is not a camera profile." };
    return profileFromTags(ifd, fallbackName);
  } catch {
    return { problem: "That file could not be read as a camera profile." };
  }
}

/** Whether a zip entry is a profile a reader meant to send. @param path  the entry name from the central directory, folders included. @returns true only for a real .dcp: the two kinds of debris a Mac's own Compress adds (the `__MACOSX` folder and the `._` forks) are excluded. */
export function isPackedProfile(path: string): boolean {
  if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) return false;
  const base = path.slice(path.lastIndexOf("/") + 1);
  return !base.startsWith("._") && /\.dcp$/i.test(base);
}

/** Every profile in a zip, read one at a time.
 *  @param file  the picked archive.
 *  @returns `profiles`, the usable ones in the zip's own order; `unreadable`, how many entries were not profiles; `tooBig`, how many declared or inflated past `PROFILE_FILE_MAX`; `beyond`, how many were left unread because the pack held more than `PROFILE_PACK_ENTRIES`; rejects only when the file is not a readable zip.
 *  What it must satisfy: an entry whose central directory says it is over the ceiling is refused before it is inflated, and one that lies is stopped at the ceiling (the prefix reader), as the colour-table pack's reader does; a damaged entry counts as unreadable and does not stop the pack. */
export async function readProfilePack(file: Blob): Promise<{ profiles: CameraProfile[]; unreadable: number; tooBig: number; beyond: number }> {
  const entries = (await readZipIndex(file)).filter((e) => isPackedProfile(e.name));
  const read = entries.slice(0, PROFILE_PACK_ENTRIES);
  const profiles: CameraProfile[] = [];
  let unreadable = 0, tooBig = 0;
  for (const e of read) {
    if (e.size > PROFILE_FILE_MAX) { tooBig++; continue; }
    try {
      const bytes = await readZipEntryPrefix(file, e, PROFILE_FILE_MAX + 1);
      if (bytes.length > PROFILE_FILE_MAX) { tooBig++; continue; }
      const base = (e.name.slice(e.name.lastIndexOf("/") + 1)).replace(/\.dcp$/i, "");
      const got = readProfileFile(bytes, base);
      if ("profile" in got) profiles.push(got.profile); else unreadable++;
    } catch {
      unreadable++;
    }
  }
  return { profiles, unreadable, tooBig, beyond: entries.length - read.length };
}

let cache: LoadedProfile[] | null = null;

/** Every loaded profile this version can use.
 *  @returns the list, newest first. A record that fails `profileProblem` is left out; a private window or cleared storage reads as an empty list. What it must satisfy: the list is read from storage once and kept until a write, so asking for it on every redraw costs nothing. */
function readAll(): LoadedProfile[] {
  if (cache) return cache;
  const out: LoadedProfile[] = [];
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? JSON.parse(raw) : [];
    if (Array.isArray(v)) {
      for (const p of v) {
        if (profileProblem(p) || typeof p.key !== "string" || !p.key) continue;
        out.push({ name: p.name, camera: p.camera, cm1: p.cm1, ill1: p.ill1 ?? null, cm2: p.cm2 ?? null, ill2: p.ill2 ?? null, key: p.key, made: typeof p.made === "string" ? p.made : "" });
      }
    }
  } catch {
    /* nothing kept, or storage unreadable: an empty list */
  }
  cache = out;
  return out;
}

/** Write the list back. @param list  the profiles to keep. @returns true when storage took it; false when storage refused (out of room, or a window that keeps nothing), in which case the list in memory is put back as it was. */
function writeAll(list: LoadedProfile[]): boolean {
  const was = cache;
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
    cache = list;
    return true;
  } catch {
    cache = was;
    return false;
  }
}

/** The profiles loaded for a camera.
 *  @param keys  the keys of the photograph's camera (`PhotoCamera.keys`).
 *  @returns the loaded profiles whose camera key is one of them, newest first. What it must satisfy: a profile loaded for another body is never in the result. */
export function loadedFor(keys: ReadonlyArray<string>): LoadedProfile[] {
  return keys.length ? readAll().filter((p) => keys.includes(p.key)) : [];
}

/** How many profiles are kept in all. @returns the count. */
export function loadedCount(): number {
  return readAll().length;
}

/** Keep profiles the reader loaded, each under the camera it names, replacing one of the same camera and name.
 *  @param profiles  the profiles read from the files.
 *  @returns `stored`, how many went in; `full`, how many did not fit under `PROFILES_KEPT_MAX`; `refused`, true when the device would not keep them (nothing is then changed).
 *  What it must satisfy: afterwards `loadedFor` lists each stored profile first among its camera's, and an unusable profile is never stored. */
export function keepProfiles(profiles: ReadonlyArray<CameraProfile>): { stored: number; full: number; refused: boolean } {
  const now = new Date().toISOString();
  const incoming: LoadedProfile[] = [];
  for (const p of profiles) {
    if (profileProblem(p)) continue;
    incoming.push({ ...p, key: cameraKey(p.camera), made: now });
  }
  const same = (a: LoadedProfile, b: LoadedProfile) => a.key === b.key && a.name === b.name;
  const kept = readAll().filter((old) => !incoming.some((n) => same(n, old)));
  const room = Math.max(0, PROFILES_KEPT_MAX - kept.length);
  const take = incoming.filter((n) => n.key).slice(0, room);
  if (!take.length) return { stored: 0, full: incoming.length, refused: false };
  const ok = writeAll([...take, ...kept]);
  return ok ? { stored: take.length, full: incoming.length - take.length, refused: false } : { stored: 0, full: 0, refused: true };
}

/** Forget one loaded profile. @param key  its camera key. @param name  its name. @returns true when it was there and is gone; false when it was not kept, or storage refused. A last choice that named it is left as it is: `chooseProfile` passes over a token that names nothing available. */
export function forgetProfile(key: string, name: string): boolean {
  const list = readAll();
  const next = list.filter((p) => !(p.key === key && p.name === name));
  if (next.length === list.length) return false;
  return writeAll(next);
}

/** The choice the reader last switched to for a camera.
 *  @param keys  the keys of the photograph's camera.
 *  @returns the saved choice token, or null when there is none or storage is unreadable. */
export function lastChoice(keys: ReadonlyArray<string>): string | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const map = raw ? JSON.parse(raw) : null;
    if (!map || typeof map !== "object") return null;
    for (const k of keys) if (typeof map[k] === "string" && map[k]) return map[k];
  } catch {
    /* a window that keeps nothing */
  }
  return null;
}

/** Remember the reader's switch for a camera. @param keys  the keys of the photograph's camera. @param token  the choice token. Writes it under each key and returns nothing; a refused write leaves the memory as it was, which the next read shows. */
export function rememberChoice(keys: ReadonlyArray<string>, token: string): void {
  if (!keys.length || !token) return;
  try {
    const raw = localStorage.getItem(LAST_KEY);
    const map = raw ? JSON.parse(raw) : {};
    const next = map && typeof map === "object" ? map : {};
    for (const k of keys) next[k] = token;
    localStorage.setItem(LAST_KEY, JSON.stringify(next));
  } catch {
    /* a window that keeps nothing remembers nothing */
  }
}

/** What a photograph's file says about its camera, found once from its own bytes: whether it is a raw, the camera's name and the keys profiles are matched by, the profile the file embeds, the stock matrix the app holds for it, and the matrix `fold` that takes the file's raw values to the channels its gains act on. */
export interface PhotoCamera {
  isRaw: boolean;
  model: string | undefined;
  keys: string[];
  embedded: { name: string; spec: ColourSpec } | null;
  stock: { name: string; words: string; spec: ColourSpec } | null;
  fold: number[];
}

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Two 3x3 matrices multiplied. @param a  row-major. @param b  row-major. @returns a times b, row-major. */
function times(a: ReadonlyArray<number>, b: ReadonlyArray<number>): number[] {
  const o = new Array<number>(9).fill(0);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) for (let k = 0; k < 3; k++) o[r * 3 + c] += a[r * 3 + k] * b[k * 3 + c];
  return o;
}

/** The stock matrix of a body, with the words that name it.
 *  @param model  the camera's model string, or undefined.
 *  @returns the matrix the decoder renders a NEF of that body through (`nikonColorMatrix`), a short name for the option, and the words for the line under the sliders; for a body the app holds no matrix for, the Z 50's, said plainly. */
function stockFor(model: string | undefined): { name: string; words: string; spec: ColourSpec } | null {
  const known = /D5300/i.test(model ?? "") ? "Nikon D5300" : /Z ?50\b/i.test(model ?? "") ? "Nikon Z 50" : null;
  const spec = makeColourSpec(nikonColorMatrix(model), undefined, null, undefined);
  if (!spec) return null;
  return known
    ? { name: `${known}'s own colour matrix`, words: `${known}'s own colour matrix, with no profile`, spec }
    : { name: "The Nikon Z 50's colour matrix", words: `the Nikon Z 50's colour matrix, with no profile, because this app holds no matrix for ${model ?? "this camera"}`, spec };
}

/** What a photograph's file says about its camera.
 *  @param isRaw  `DecodedImage.isRaw`: true for a camera-native raw, false for a file the camera already developed.
 *  @param bytes  the file's own bytes, to find its camera and its calibration; absent when they are not to hand.
 *  @returns the facts above. For a developed file nothing is embedded and no stock matrix applies. For a NEF the stock matrix is the model's; a NEF names no profile. For a DNG the embedded profile is the file's own two calibrations (sets 1 and 2 of its colour tags, the pair the SDK reads), with the analog balance and camera calibration folded in exactly when the picture is rendered with them folded in (`dngCameraToSrgb` gives no `pre`), and the stock matrix is offered too when the body is one the app holds a matrix for.
 *  What it must satisfy: never throws; the `fold` and the matrices are the channels the gains really act on, so a figure and the picture cannot disagree about them. */
export function photoCamera(isRaw: boolean, bytes: Uint8Array | undefined): PhotoCamera {
  const none: PhotoCamera = { isRaw, model: undefined, keys: [], embedded: null, stock: null, fold: IDENTITY };
  if (!isRaw) return none;
  if (!bytes) return { ...none, stock: stockFor(undefined) };
  try {
    const ifds = new Tiff(bytes).allIfds();
    const model = cameraModel(ifds);
    const unique = ifds.map((d) => d.str(50708)).find((s) => !!s);
    const keys = [...new Set([cameraKey(unique), cameraKey(model)].filter((k) => k))];
    const cal = dngCalibration(ifds);
    let fold = IDENTITY;
    let embedded: PhotoCamera["embedded"] = null;
    if (cal) {
      const ab = cal.ifd.num(50727);
      const AB = [ab[0] ?? 1, 0, 0, 0, ab[1] ?? 1, 0, 0, 0, ab[2] ?? 1];
      const sigOk = (cal.ifd.str(50931) ?? "") === (cal.ifd.str(50932) ?? "");
      const CC = cal.cc.length === 9 && sigOk ? cal.cc : IDENTITY;
      fold = dngCameraToSrgb(ifds)?.pre ? IDENTITY : times(AB, CC);
      const spec = makeColourSpec(cal.ifd.num(50721), cal.ifd.num(50778)[0], cal.ifd.num(50722), cal.ifd.num(50779)[0], fold) ?? makeColourSpec(cal.cm, cal.illuminant, null, undefined, fold);
      if (spec) embedded = { name: cal.ifd.str(50936) ?? "This file's own colour matrix", spec };
    }
    const stock = !cal || /Z ?50\b|D5300/i.test(model ?? "") ? stockFor(model) : null;
    return { isRaw, model, keys, embedded, stock, fold };
  } catch {
    return { ...none, stock: stockFor(undefined) };
  }
}

/** One way a photograph's gains can be read as a Temperature and Tint. `token` is what the edit saves ("embedded", "stock", "rendered", or "loaded:" and the profile's name); `kind` says which it is; `name` is the profile's or matrix's own name; `label` is the line the switch lists; `words` is the sentence for the line under the sliders; `spec` is what the arithmetic reads through. */
export interface ProfileChoice { token: string; kind: "embedded" | "loaded" | "stock" | "rendered"; name: string; label: string; words: string; spec: ColourSpec }

/** sRGB's primaries and white (D65), row-major linear sRGB to XYZ: the colour space a camera-developed file is in. */
const SRGB_TO_XYZ = [0.412453, 0.35758, 0.180423, 0.212671, 0.71516, 0.072169, 0.019334, 0.119193, 0.950227];
/** The inverse of a 3x3 as a plain function of the nine numbers, for the one matrix above. @param m  row-major, not singular. @returns the inverse, row-major. */
function invert(m: ReadonlyArray<number>): number[] {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [A / det, -(b * i - c * h) / det, (b * f - c * e) / det, B / det, (a * i - c * g) / det, -(a * f - c * d) / det, C / det, -(a * h - b * g) / det, (a * e - b * d) / det];
}

/** The one way to read a photograph the camera already developed: through sRGB, relative to the file's own white. @returns the choice. What it must satisfy: gains of 1, 1 and 1 read as daylight, 6504 K or near it, because sRGB's white is D65; no profile applies. */
export function renderedChoice(): ProfileChoice {
  const spec = makeColourSpec(invert(SRGB_TO_XYZ), undefined, null, undefined) as ColourSpec;
  return { token: "rendered", kind: "rendered", name: "the file's own colour space", label: "The file's own colour space (sRGB)", words: "Read relative to the file's own white (daylight), because the camera already developed it. A camera profile does not apply to it.", spec };
}

/** Every way a photograph can be read.
 *  @param cam  `photoCamera` for the photograph.
 *  @param loaded  the profiles loaded for its camera (`loadedFor`).
 *  @returns the choices in the order the switch lists them: the profile the file embeds, each loaded profile newest first, the stock matrix; a developed file has the one rendered choice. A loaded profile whose matrices cannot be used is left out. */
export function choicesFor(cam: PhotoCamera, loaded: ReadonlyArray<LoadedProfile>): ProfileChoice[] {
  if (!cam.isRaw) return [renderedChoice()];
  const out: ProfileChoice[] = [];
  const more = " A profile for this camera can be loaded.";
  if (cam.embedded) {
    out.push({ token: "embedded", kind: "embedded", name: cam.embedded.name, label: `${cam.embedded.name} (in this file)`, words: `Read through ${cam.embedded.name}, the profile this file carries.${more}`, spec: cam.embedded.spec });
  }
  for (const p of loaded) {
    const spec = makeColourSpec(p.cm1, p.ill1 ?? undefined, p.cm2, p.ill2 ?? undefined, cam.fold);
    if (spec) out.push({ token: `loaded:${p.name}`, kind: "loaded", name: p.name, label: `${p.name} (loaded)`, words: `Read through ${p.name}, which you loaded for the ${p.camera}.${more}`, spec });
  }
  if (cam.stock) out.push({ token: "stock", kind: "stock", name: cam.stock.name, label: `${cam.stock.name} (no profile)`, words: `Read through ${cam.stock.words}.${more}`, spec: cam.stock.spec });
  return out;
}

/** The choice a photograph reads under, by the order in this file's header.
 *  @param choices  `choicesFor` for the photograph.
 *  @param saved  the choice saved with the photograph's edit (`EditParams.profile`), or undefined.
 *  @param held  the choice the held balance was kept under, or null.
 *  @param last  the choice the reader last switched to for this camera (`lastChoice`), or null.
 *  @returns the chosen entry of `choices`, or null when `choices` is empty. A token that names nothing now available (a loaded profile since forgotten, or one kept for another body) is passed over to the next rule, never an error.
 *  What it must satisfy: with two loaded profiles named Infrared Temp -100 and Infrared Temp -50 and nothing else deciding, the -100 is chosen; the result is always one of `choices`. */
export function chooseProfile(choices: ReadonlyArray<ProfileChoice>, saved: string | null | undefined, held: string | null | undefined, last: string | null | undefined): ProfileChoice | null {
  const find = (t: string | null | undefined) => (t ? choices.find((c) => c.token === t) : undefined);
  const byRule = find(saved) ?? find(held) ?? find(last) ?? choices.find((c) => c.kind === "embedded");
  if (byRule) return byRule;
  const loaded = choices.filter((c) => c.kind === "loaded");
  const start = loaded.find((c) => /infrared temp\s*[-−–]\s*100\b/i.test(c.name));
  const other = loaded.find((c) => /infrared temp\s*[-−–]\s*50\b/i.test(c.name));
  if (start && other) return start;
  return loaded[0] ?? choices.find((c) => c.kind === "stock") ?? choices[0] ?? null;
}
