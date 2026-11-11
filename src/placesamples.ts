// Named circular samples placed on a photograph, turned into the labels of the counted pixels for the test page's Separation check: which names are in use and in what order, each pixel's name, the count of pixels for each name and of overlap between names, a smaller copy of the samples for the half and quarter readings, and a text form for keeping them on the device.
//
// This module holds no page code: it reads no file, draws nothing and touches no storage. A sample is a name and a circle whose centre is a fraction of the frame's width and height and whose radius is a fraction of the frame's shorter side (record 109).

import type { PlaceTarget } from "./placesdata";

/** A sample: its name, its centre x and y as fractions of the frame's width and height (0 to 1), and its radius r as a fraction of the frame's shorter side (above 0). */
export interface PlaceSample { name: string; x: number; y: number; r: number }

/** What labelling the counted pixels by samples gives: labels, one byte for each counted pixel indexing the names (the last name, rest, for a pixel no sample holds or two names hold); counts, the number of pixels for each name in the names' order (rest included, with the overlap in it); overlap, the number of pixels held by samples of two or more names. */
export interface PlaceSampleLabels { labels: Uint8Array; counts: number[]; overlap: number }

/** The name the report gives to the pixels no sample holds, and the name a sample may not take: a sample carrying it holds nothing here. */
const REST = "rest";

/** The longest name a sample may carry in its kept text, in characters, after trimming. */
const NAME_MAX = 40;

/** The most samples the kept text may hold. */
const SAMPLES_MAX = 64;

/** The version the kept text carries. */
const TEXT_VERSION = 1;

/** Takes name, any value. Returns it as a trimmed string; a value that is not a string gives an empty string. */
function trimmed(name: unknown): string {
  return typeof name === "string" ? name.trim() : "";
}

/** Takes samples, a list of samples. Returns the distinct trimmed names in the order each was first placed, with "rest" last. A name that is empty after trimming, and a sample named "rest", add no name; so the list is never empty and its last entry is always "rest". Consumed by placeSampleLabels, whose label bytes index this list, and by placeSampleTargets. */
export function placeSampleNames(samples: readonly PlaceSample[]): string[] {
  const out: string[] = [];
  for (const s of samples) {
    const n = trimmed(s && s.name);
    if (n === "" || n === REST || out.indexOf(n) >= 0) continue;
    out.push(n);
  }
  out.push(REST);
  return out;
}

/** Takes samples; width and height, the frame's size in pixels; cols and rows, each counted pixel's column and row in the whole frame, as the places module's labelling takes them. Returns {labels, counts, overlap}: labels holds one byte for each counted pixel (the length of the shorter of cols and rows) indexing placeSampleNames(samples); a pixel lies in a sample when its distance from the sample's centre, x times width and y times height, is at most r times the shorter of width and height; a pixel held by samples of one name takes that name; a pixel held by samples of two different names takes "rest" and is counted in overlap; a pixel held by none is "rest". counts has one entry for each name, "rest" last, and sums to the number of pixels. A width or height that is not above 0, or a sample whose figures are not finite, holds nothing. Consumed by the places part of the test page, which reads the labels as it reads the places module's. */
export function placeSampleLabels(samples: readonly PlaceSample[], width: number, height: number, cols: ArrayLike<number>, rows: ArrayLike<number>): PlaceSampleLabels {
  const names = placeSampleNames(samples);
  const rest = names.length - 1;
  const n = Math.min(cols.length, rows.length);
  const owner = new Int16Array(n).fill(-1);
  const side = Math.min(width, height);
  if (width > 0 && height > 0) {
    for (const s of samples) {
      const ni = names.indexOf(trimmed(s && s.name));
      if (ni < 0 || ni === rest) continue;
      const cx = s.x * width, cy = s.y * height, rad = s.r * side;
      if (!Number.isFinite(cx) || !Number.isFinite(cy) || !Number.isFinite(rad) || !(rad > 0)) continue;
      const r2 = rad * rad;
      for (let i = 0; i < n; i++) {
        const dx = cols[i] - cx, dy = rows[i] - cy;
        if (dx * dx + dy * dy > r2) continue;
        const o = owner[i];
        if (o === -1) owner[i] = ni;
        else if (o !== ni) owner[i] = -2;
      }
    }
  }
  const labels = new Uint8Array(n);
  const counts: number[] = names.map(() => 0);
  let overlap = 0;
  for (let i = 0; i < n; i++) {
    const o = owner[i];
    const l = o >= 0 ? o : rest;
    if (o === -2) overlap++;
    labels[i] = l;
    counts[l]++;
  }
  return { labels, counts, overlap };
}

/** Takes names, the list placeSampleNames gives (the last entry being "rest"). Returns one target for each name but the last, in the places module's shape, its title the name and its places the name's index: [{title: names[0], places: [0]}, ...]. Consumed by the report, which fits and counts a selection for each target. */
export function placeSampleTargets(names: readonly string[]): PlaceTarget[] {
  const out: PlaceTarget[] = [];
  for (let i = 0; i < names.length - 1; i++) out.push({ title: names[i], places: [i] });
  return out;
}

/** Takes samples and factor, a number to multiply each radius by. Returns new samples with the same names and centres and each radius multiplied by factor; the list given is not changed. Consumed by the report's readings at half and at a quarter of each sample's radius. */
export function placeSampleShrink(samples: readonly PlaceSample[], factor: number): PlaceSample[] {
  return samples.map((s) => ({ name: s.name, x: s.x, y: s.y, r: s.r * factor }));
}

/** Takes samples. Returns them as one line of text carrying a version, for keeping on the device; placeSamplesFromText reads it back to the same samples. Consumed by the surface's keeping of a photograph's samples. */
export function placeSamplesToText(samples: readonly PlaceSample[]): string {
  return JSON.stringify({ v: TEXT_VERSION, samples: samples.map((s) => ({ name: s.name, x: s.x, y: s.y, r: s.r })) });
}

/** Takes text, what placeSamplesToText gave. Returns the samples it holds, the names trimmed. Text of another shape or version, a figure that is not a finite number, an x or y outside 0 to 1, an r not above 0, a name empty after trimming or over forty characters, or more than sixty-four samples gives an empty list and never part of one. Consumed by the surface when it starts from kept samples. */
export function placeSamplesFromText(text: string): PlaceSample[] {
  let v: any;
  try { v = JSON.parse(String(text)); } catch { return []; }
  if (!v || typeof v !== "object" || v.v !== TEXT_VERSION || !Array.isArray(v.samples) || v.samples.length > SAMPLES_MAX) return [];
  const out: PlaceSample[] = [];
  for (const s of v.samples) {
    if (!s || typeof s !== "object" || typeof s.name !== "string") return [];
    const name = s.name.trim();
    const { x, y, r } = s;
    if (name === "" || name.length > NAME_MAX) return [];
    if (typeof x !== "number" || typeof y !== "number" || typeof r !== "number") return [];
    if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(r)) return [];
    if (x < 0 || x > 1 || y < 0 || y > 1 || !(r > 0)) return [];
    out.push({ name, x, y, r });
  }
  return out;
}
