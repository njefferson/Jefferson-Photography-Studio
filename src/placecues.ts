// The arithmetic behind the test page's Separation check: eight cues read off each counted pixel, the histograms, distances and thresholds that compare two labelled places on a cue, the best pair of cues together, the selections fitted as ranges of whole bins and joined, and the finished rows, fitted selections and masks that come out. Pure functions on plain arrays: it reads no file, draws nothing and holds no page code, so the container can prove it with planted arrays. It chooses nothing: every figure is printed with its definition and a selection fitted on a photograph is printed as fitted there, never as a result.

/** The eight cues in order: lightness, saturation, the three channel differences, texture at two window sizes and height. A cue number is an index into this list. */
export const PLACE_CUES: readonly string[] = ["lightness", "saturation", "red against green", "red against blue", "green against blue", "texture at 5", "texture at 15", "height"];

/** The bins of a histogram, the bins of a joint histogram on one side, and the fewest pixels a label needs to take part. */
const NB = 64;
const NJ = 16;
const MIN_PIXELS = 50;
/** How each cue is scaled: 0 from 0 to 1, 1 from minus one to one, 2 logarithmic from one part in 1024 to 1. */
const KIND: readonly number[] = [0, 0, 1, 1, 1, 2, 2, 0];

/** The kinds of selection, in the order they are fitted. */
const KIND_SINGLE = "single range";
const KIND_BOTH = "only where both";
const KIND_SUBTRACT = "subtract";

/** A target as the places module gives it: a title in words and the indices of the labels it joins. */
export interface PlaceTargetLike { title: string; places: number[] }
/** One range of whole bins of one cue, [lo, hi), with the cue's name and the range in the cue's own units. */
export interface PlacePart { cue: string; lo: number; hi: number; from: number; to: number }
/** One fitted selection as plain data: its kind, its one or two ranges and its balanced share on the photograph it was fitted on. */
export interface PlaceSelection { kind: string; parts: PlacePart[]; balanced: number }
/** One target's fitted selections, empty where the photograph had too few pixels, and the kind of join that fitted better. */
export interface PlaceFitTarget { title: string; selections: PlaceSelection[]; bestJoined: string }
/** A photograph's fitted selections as plain data that survives being stored as text. */
export interface PlaceFit { photograph: string; targets: PlaceFitTarget[] }
/** A titled mask, one byte for each counted pixel, 1 where the selection takes it; `data`, `mask` and `taken` are the same array under three spellings, so a caller reads whichever name it was written to. */
export interface PlaceMask { title: string; data: Uint8Array; mask: Uint8Array; taken: Uint8Array }
/** What a selection takes: for each label the pixels taken and the label's total, the share, and the target's share of the labelled pixels taken. */
export interface PlaceReading { taken: number[]; totals: number[]; shares: number[]; takenLabelled: number; targetShare: number }

/** The cues of one run: their names in the order of the arrays, each one's scale kind, and the numbers of the cues that take part in the pair rows and the fits. */
interface CueSet { names: string[]; kinds: number[]; fit: number[] }

/** The scale kind of a cue by its name: that of the same name among the eight, else 0 (from 0 to 1, the scale every structure cue has). Takes the name and returns 0, 1 or 2. */
function kindOfName(name: string): number {
  const i = PLACE_CUES.indexOf(name);
  return i >= 0 ? KIND[i] : 0;
}

/** The cue set of a run. Takes the number of cue arrays, the cues' names in the order of the arrays (the eight standing where none is given, and `cue N` for an array past the names), and the names of cues to leave out of the pair rows and the fits. Returns the set. */
function cueSetOf(count: number, cueNames?: ArrayLike<string> | null, leaveOut?: ArrayLike<string> | null): CueSet {
  const names: string[] = [];
  for (let c = 0; c < count; c++) {
    if (cueNames && c < cueNames.length && typeof cueNames[c] === "string") names.push(cueNames[c]);
    else names.push(c < PLACE_CUES.length ? PLACE_CUES[c] : `cue ${c + 1}`);
  }
  const out = new Set<string>();
  if (leaveOut) for (let i = 0; i < leaveOut.length; i++) out.add(leaveOut[i]);
  const fit: number[] = [];
  for (let c = 0; c < count; c++) if (!out.has(names[c])) fit.push(c);
  return { names, kinds: names.map(kindOfName), fit };
}

/** The value of a bin edge in a cue's own units (edge 0 of a logarithmic cue is 0, since what falls under the scale sits in the first bin). Takes the scale kind and the edge from 0 to 64. Returns a number. */
function edgeOfKind(k: number, edge: number): number {
  if (k === 0) return edge / NB;
  if (k === 1) return -1 + (2 * edge) / NB;
  return edge === 0 ? 0 : Math.pow(2, 10 * (edge / NB - 1));
}

/** A figure in words: three decimals, with no trailing noise. Takes a number and returns its text. */
function fmt(v: number): string {
  if (!Number.isFinite(v)) return "none";
  return v.toFixed(3);
}

/**
 * The bin of a value on a cue's scale: 64 bins, from 0 to 1 for lightness, saturation and height, from minus one to one for the three differences, and logarithmic from one part in 1024 to 1 for the two textures, with what falls under the scale in the first bin.
 * @param cue the cue number, an index into PLACE_CUES.
 * @param v the value on the cue's scale.
 * @returns a whole number from 0 to 63; a value off either end of the scale gives the nearest bin, and a value that is not a number gives 0. Every histogram, threshold and range in this module counts in these bins.
 */
export function placeBinOf(cue: number, v: number): number {
  return binOfKind(KIND[cue], v);
}

/** The bin of a value on a scale kind. Takes the kind (0 from 0 to 1, 1 from minus one to one, 2 logarithmic) and the value, and returns a whole number from 0 to 63; a value that is not a number gives 0. */
function binOfKind(k: number, v: number): number {
  if (!(v === v)) return 0;
  let t: number;
  if (k === 0) t = v;
  else if (k === 1) t = (v + 1) / 2;
  else t = v <= 1 / 1024 ? 0 : Math.log2(v) / 10 + 1;
  const b = Math.floor(t * NB);
  return b < 0 ? 0 : b > NB - 1 ? NB - 1 : b;
}

/**
 * Counts, for one label, the pixels in each of the 64 bins of one cue.
 * @param cue the cue number, an index into PLACE_CUES.
 * @param values the cue's value for each counted pixel.
 * @param labels one byte for each counted pixel holding its label.
 * @param label the label whose pixels are counted.
 * @returns a Float64Array of 64 counts, whose sum is the number of pixels of the label; place Hellinger and threshold read it, each normalising it to its own total.
 */
export function placeHistogram(cue: number, values: ArrayLike<number>, labels: ArrayLike<number>, label: number): Float64Array {
  const h = new Float64Array(NB);
  const n = Math.min(values.length, labels.length);
  for (let i = 0; i < n; i++) if (labels[i] === label) h[placeBinOf(cue, values[i])]++;
  return h;
}

/**
 * The Hellinger distance between two histograms, each normalised to its own total: the square root of one minus the sum over the bins of the square root of the product of the two shares.
 * @param a the first histogram, any length.
 * @param b the second histogram, the same length as the first.
 * @returns 0 for the same histogram and 1 for histograms sharing no bin; NaN where either histogram is empty, which a caller never asks for because a label under 50 pixels takes no part.
 */
export function placeHellinger(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let sa = 0, sb = 0;
  for (let i = 0; i < a.length; i++) { sa += a[i]; sb += b[i]; }
  if (!(sa > 0) || !(sb > 0)) return NaN;
  let bc = 0;
  for (let i = 0; i < a.length; i++) bc += Math.sqrt((a[i] / sa) * (b[i] / sb));
  const d = 1 - bc;
  return Math.sqrt(d > 0 ? d : 0);
}

/**
 * The threshold figure for two histograms of 64 bins: over the 63 edges between bins, the edge and the side that give the largest mean of the share of each label on its own side.
 * @param a the first label's histogram.
 * @param b the second label's histogram.
 * @returns an object with `edge` (1 to 63, the number of bins below it), `firstBelow` (true where the first label is the one below the edge) and `balanced` (the mean of the two shares, from 0 to 1, the balanced share); the first of equal best is kept; balanced is NaN where either histogram is empty.
 */
export function placeThreshold(a: ArrayLike<number>, b: ArrayLike<number>): { edge: number; firstBelow: boolean; balanced: number } {
  let sa = 0, sb = 0;
  for (let i = 0; i < NB; i++) { sa += a[i]; sb += b[i]; }
  if (!(sa > 0) || !(sb > 0)) return { edge: 1, firstBelow: true, balanced: NaN };
  let best = { edge: 1, firstBelow: true, balanced: -1 };
  let ca = 0, cb = 0;
  for (let e = 1; e < NB; e++) {
    ca += a[e - 1]; cb += b[e - 1];
    const belowA = ca / sa, belowB = cb / sb;
    const s1 = (belowA + (1 - belowB)) / 2;
    const s2 = ((1 - belowA) + belowB) / 2;
    if (s1 > best.balanced) best = { edge: e, firstBelow: true, balanced: s1 };
    if (s2 > best.balanced) best = { edge: e, firstBelow: false, balanced: s2 };
  }
  return best;
}

/**
 * Reads the eight cues off the counted pixels.
 * @param drawn the counted pixels' bytes, four to a pixel (red, green, blue, alpha); the test page gives the photograph's own data here (placeDecode's pixels), never the drawn picture.
 * @param lin the counted pixels' linear channels at one balance, three floats to a pixel, any common scale (each difference is over the sum); the test page gives placeDecode's shares.
 * @param light the lightness of the whole frame as one byte to a pixel, row by row, width times height long; the test page gives placeDecode's light.
 * @param width the frame's width in pixels.
 * @param height the frame's height in pixels.
 * @param cols each counted pixel's column in the full frame.
 * @param rows each counted pixel's row in the full frame.
 * @returns eight Float32Arrays in the order of PLACE_CUES, one value for each counted pixel: lightness (the largest of the pixel's bytes over 255), saturation (largest less smallest over largest, 0 where the largest is 0), the three differences of linear channels over their sum (0 where the sum is 0), the standard deviation of the frame's lightness in a square window of 5 and of 15 pixels centred on the pixel and clipped at the frame's edge, over 255, and the row over the last row. Their scales are those placeBinOf reads.
 */
export function placeCueValues(drawn: ArrayLike<number>, lin: ArrayLike<number>, light: ArrayLike<number>, width: number, height: number, cols: ArrayLike<number>, rows: ArrayLike<number>): Float32Array[] {
  const n = Math.min(cols.length, rows.length);
  const out: Float32Array[] = [];
  for (let c = 0; c < PLACE_CUES.length; c++) out.push(new Float32Array(n));
  const W1 = width + 1;
  const s = new Float64Array(W1 * (height + 1));
  const q = new Float64Array(W1 * (height + 1));
  for (let y = 0; y < height; y++) {
    let rs = 0, rq = 0;
    for (let x = 0; x < width; x++) {
      const v = light[y * width + x];
      rs += v; rq += v * v;
      s[(y + 1) * W1 + x + 1] = s[y * W1 + x + 1] + rs;
      q[(y + 1) * W1 + x + 1] = q[y * W1 + x + 1] + rq;
    }
  }
  const windowStd = (cx: number, cy: number, half: number): number => {
    const x0 = Math.max(0, cx - half), x1 = Math.min(width - 1, cx + half);
    const y0 = Math.max(0, cy - half), y1 = Math.min(height - 1, cy + half);
    const cnt = (x1 - x0 + 1) * (y1 - y0 + 1);
    const a = (y1 + 1) * W1 + x1 + 1, b = y0 * W1 + x1 + 1, c = (y1 + 1) * W1 + x0, d = y0 * W1 + x0;
    const sum = s[a] - s[b] - s[c] + s[d];
    const sq = q[a] - q[b] - q[c] + q[d];
    const mean = sum / cnt;
    const v = sq / cnt - mean * mean;
    return v > 0 ? Math.sqrt(v) / 255 : 0;
  };
  const diff = (a: number, b: number): number => { const t = a + b; return t === 0 ? 0 : (a - b) / t; };
  const last = height > 1 ? height - 1 : 1;
  for (let k = 0; k < n; k++) {
    const r = drawn[4 * k], g = drawn[4 * k + 1], b = drawn[4 * k + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    out[0][k] = mx / 255;
    out[1][k] = mx === 0 ? 0 : (mx - mn) / mx;
    const lr = lin[3 * k], lg = lin[3 * k + 1], lb = lin[3 * k + 2];
    out[2][k] = diff(lr, lg);
    out[3][k] = diff(lr, lb);
    out[4][k] = diff(lg, lb);
    out[5][k] = windowStd(cols[k], rows[k], 2);
    out[6][k] = windowStd(cols[k], rows[k], 7);
    out[7][k] = rows[k] / last;
  }
  return out;
}

/** The bin of every value of every cue. Takes the cue arrays and the cue set, and returns one Uint8Array of bins for each array, each on its cue's own scale. */
function binsOf(cues: ArrayLike<number>[], cs: CueSet): Uint8Array[] {
  return cues.map((v, c) => {
    const b = new Uint8Array(v.length);
    for (let i = 0; i < v.length; i++) b[i] = binOfKind(cs.kinds[c], v[i]);
    return b;
  });
}

/** An internal range of whole bins [lo, hi) of one cue by number. */
interface Range { ci: number; lo: number; hi: number }

/** The mask a selection takes over the binned cues. Takes the bins, the one or two ranges and the kind, and returns one byte for each pixel, 1 where taken. */
function applyBins(bins: Uint8Array[], ranges: Range[], kind: string): Uint8Array {
  if (!ranges.length) return new Uint8Array(0);
  const r0 = ranges[0], b0 = bins[r0.ci];
  const n = b0.length;
  const m = new Uint8Array(n);
  const r1 = ranges.length > 1 ? ranges[1] : null;
  const b1 = r1 ? bins[r1.ci] : null;
  for (let i = 0; i < n; i++) {
    let ok = b0[i] >= r0.lo && b0[i] < r0.hi;
    if (ok && r1 && b1) {
      const inside = b1[i] >= r1.lo && b1[i] < r1.hi;
      ok = kind === KIND_SUBTRACT ? !inside : inside;
    }
    if (ok) m[i] = 1;
  }
  return m;
}

/** The target and the other labelled pixels of one cue's bins, within a subset when one is given. Takes the bins, the roles (1 target, 2 other, 0 left out) and the subset, and returns the two 64-bin count arrays, target first. */
function roleHist(b: Uint8Array, role: Uint8Array, sub: Uint8Array | null): [Float64Array, Float64Array] {
  const t = new Float64Array(NB), o = new Float64Array(NB);
  for (let i = 0; i < b.length; i++) {
    if (sub && !sub[i]) continue;
    const r = role[i];
    if (r === 1) t[b[i]]++; else if (r === 2) o[b[i]]++;
  }
  return [t, o];
}

/** The best range of whole bins over two histograms. Takes the target's and the others' counts, the denominators for the two shares, the counts to subtract from where the range is removed, and whether it is removed, and returns the range with the mean of the target's share inside and the others' share outside, or null. */
function scan(t: Float64Array, o: Float64Array, dT: number, dO: number, baseT: number, baseO: number, subtract: boolean): { lo: number; hi: number; score: number } | null {
  const ct = new Float64Array(NB + 1), co = new Float64Array(NB + 1);
  for (let i = 0; i < NB; i++) { ct[i + 1] = ct[i] + t[i]; co[i + 1] = co[i] + o[i]; }
  let best: { lo: number; hi: number; score: number } | null = null;
  for (let lo = 0; lo < NB; lo++) {
    for (let hi = lo + 1; hi <= NB; hi++) {
      const tr = ct[hi] - ct[lo], orr = co[hi] - co[lo];
      const tIn = subtract ? baseT - tr : tr;
      const oIn = subtract ? baseO - orr : orr;
      const score = 0.5 * ((dT > 0 ? tIn / dT : 0) + (dO > 0 ? (dO - oIn) / dO : 1));
      if (!best || score > best.score) best = { lo, hi, score };
    }
  }
  return best;
}

/** The best range over the cues that take part within a subset. Takes the bins, the roles, the subset or null, the denominators and base counts of scan, whether the range is removed and the cue set, and returns the range with its cue and score, or null. */
function bestOver(bins: Uint8Array[], role: Uint8Array, sub: Uint8Array | null, dT: number, dO: number, baseT: number, baseO: number, subtract: boolean, cs: CueSet): (Range & { score: number }) | null {
  let best: (Range & { score: number }) | null = null;
  for (const c of cs.fit) {
    const [t, o] = roleHist(bins[c], role, sub);
    const r = scan(t, o, dT, dO, baseT, baseO, subtract);
    if (r && (!best || r.score > best.score)) best = { ci: c, lo: r.lo, hi: r.hi, score: r.score };
  }
  return best;
}

/** The mean of the target's share inside a mask and the others' share outside it. Takes the mask, the roles and the two totals, and returns a number from 0 to 1. */
function balancedOf(mask: Uint8Array, role: Uint8Array, T: number, O: number): number {
  let tIn = 0, oIn = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) { if (role[i] === 1) tIn++; else if (role[i] === 2) oIn++; }
  return 0.5 * ((T > 0 ? tIn / T : 0) + (O > 0 ? (O - oIn) / O : 1));
}

/** A range as plain data. Takes the range and the cue set, and returns the part with the cue's name and the range in the cue's own units. */
function partOf(r: Range, cs: CueSet): PlacePart {
  return { cue: cs.names[r.ci], lo: r.lo, hi: r.hi, from: edgeOfKind(cs.kinds[r.ci], r.lo), to: edgeOfKind(cs.kinds[r.ci], r.hi) };
}

/** The name a part carries: its cue's name, or, for a part kept in the old form that carries a cue by its place among the eight, the name of that one of the eight. Takes the part and returns the name, empty where it carries neither. */
function nameOfPart(p: PlacePart): string {
  const c: unknown = p.cue;
  if (typeof c === "number") return c >= 0 && c < PLACE_CUES.length ? PLACE_CUES[c] : "";
  return typeof c === "string" ? c : "";
}

/** A part back to a range. Takes the part and the cue set, and returns the range at the place of the part's cue among this run's cues, or null where the run does not count that cue or the range has no width. */
function rangeOf(p: PlacePart, cs: CueSet): Range | null {
  const ci = cs.names.indexOf(nameOfPart(p));
  if (ci < 0 || !(p.hi > p.lo)) return null;
  return { ci, lo: p.lo, hi: p.hi };
}

/** The selections fitted for one target over binned cues. Takes the bins, the roles (1 target, 2 other, 0 left out) and the cue set, and returns the single range, the range joined Only where both and the range joined Subtract, as plain data with the kind that fitted better, or null where the target or the others have under 50 pixels. */
function fitBins(bins: Uint8Array[], role: Uint8Array, cs: CueSet): { selections: PlaceSelection[]; bestJoined: string } | null {
  let T = 0, O = 0;
  for (let i = 0; i < role.length; i++) { if (role[i] === 1) T++; else if (role[i] === 2) O++; }
  if (T < MIN_PIXELS || O < MIN_PIXELS) return null;
  const first = bestOver(bins, role, null, T, O, 0, 0, false, cs);
  if (!first) return null;
  const r1: Range = { ci: first.ci, lo: first.lo, hi: first.hi };
  const m1 = applyBins(bins, [r1], KIND_SINGLE);
  const selections: PlaceSelection[] = [{ kind: KIND_SINGLE, parts: [partOf(r1, cs)], balanced: balancedOf(m1, role, T, O) }];
  let T1 = 0, O1 = 0;
  for (let i = 0; i < m1.length; i++) if (m1[i]) { if (role[i] === 1) T1++; else if (role[i] === 2) O1++; }
  if (T1 > 0) {
    const both = bestOver(bins, role, m1, T1, O1, 0, 0, false, cs);
    if (both) {
      const r2: Range = { ci: both.ci, lo: both.lo, hi: both.hi };
      selections.push({ kind: KIND_BOTH, parts: [partOf(r1, cs), partOf(r2, cs)], balanced: balancedOf(applyBins(bins, [r1, r2], KIND_BOTH), role, T, O) });
    }
    const sub = bestOver(bins, role, m1, T, O, T1, O1, true, cs);
    if (sub) {
      const r2: Range = { ci: sub.ci, lo: sub.lo, hi: sub.hi };
      selections.push({ kind: KIND_SUBTRACT, parts: [partOf(r1, cs), partOf(r2, cs)], balanced: balancedOf(applyBins(bins, [r1, r2], KIND_SUBTRACT), role, T, O) });
    }
  }
  let bestJoined = "";
  let bestScore = -1;
  for (const s of selections) if (s.kind !== KIND_SINGLE && s.balanced > bestScore) { bestScore = s.balanced; bestJoined = s.kind; }
  return { selections, bestJoined };
}

/** The roles of a target over the labels. Takes the labels, the places the target joins and which labels take part, and returns one byte for each pixel: 1 for a pixel of a target place, 2 for a pixel of another label that takes part, 0 otherwise. */
function rolesOf(labels: Uint8Array, places: number[], takesPart: ArrayLike<number>): Uint8Array {
  const role = new Uint8Array(labels.length);
  const inTarget = new Set(places);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (!takesPart[l]) continue;
    role[i] = inTarget.has(l) ? 1 : 2;
  }
  return role;
}

/**
 * Fits the single range, the Only where both join and the Subtract join for one target.
 * @param cues the eight cue arrays of placeCueValues.
 * @param labels one byte for each counted pixel holding its label.
 * @param takesPart for each label, 1 where it has 50 pixels or more and is not the rest, else 0; a label that does not take part is left out of the fit.
 * @param places the labels the target joins.
 * @param cueNames optional, the cues' names in the order of the arrays; the eight standing where none is given.
 * @param leaveOut optional, the names of cues to leave out of the fit.
 * @returns null where the target or the other labelled pixels number under 50; otherwise `selections`, the fitted selections as plain data (the single range first, then the join that keeps the pixels both ranges hold, then the join that removes the second range from the first), each with its ranges in bins and in the cue's own units and its balanced share on this photograph, and `bestJoined`, the kind of join with the larger balanced share. The data turns to text and back unchanged, and placeApply reads it.
 */
export function placeFitTarget(cues: ArrayLike<number>[], labels: Uint8Array, takesPart: ArrayLike<number>, places: number[], cueNames?: ArrayLike<string> | null, leaveOut?: ArrayLike<string> | null): { selections: PlaceSelection[]; bestJoined: string } | null {
  const cs = cueSetOf(cues.length, cueNames, leaveOut);
  return fitBins(binsOf(cues, cs), rolesOf(labels, places, takesPart), cs);
}

/**
 * Applies a fitted selection to a photograph's cues.
 * @param cues the eight cue arrays of placeCueValues for the photograph.
 * @param selection a fitted selection, as plain data or as read back from text.
 * @param cueNames optional, the cues' names in the order of the arrays; the eight standing where none is given. Each range finds its cue by name, so the arrays may come in any order.
 * @returns one byte for each counted pixel, 1 where the selection takes it: for a single range, the pixels in the range; for Only where both, those in both ranges; for Subtract, those in the first and not in the second; all 0 where a range names a cue that is not among the arrays.
 */
export function placeApply(cues: ArrayLike<number>[], selection: PlaceSelection, cueNames?: ArrayLike<string> | null): Uint8Array {
  const n = cues.length ? cues[0].length : 0;
  const cs = cueSetOf(cues.length, cueNames);
  const ranges: Range[] = [];
  for (const p of selection.parts) { const r = rangeOf(p, cs); if (!r) return new Uint8Array(n); ranges.push(r); }
  const bins: Uint8Array[] = cues.map(() => new Uint8Array(0));
  // Each used cue is binned on its own scale.
  for (const r of ranges) {
    const b = new Uint8Array(n);
    const v = cues[r.ci];
    for (let i = 0; i < n; i++) b[i] = binOfKind(cs.kinds[r.ci], v[i]);
    bins[r.ci] = b;
  }
  return applyBins(bins, ranges, selection.kind);
}

/**
 * Reads what a mask takes.
 * @param mask one byte for each counted pixel, 1 where the selection takes it.
 * @param labels one byte for each counted pixel holding its label.
 * @param sky null, or one byte for each pixel that is 1 where the app's sky selection holds it; a pixel the sky selection holds is then not counted as taken.
 * @param places the labels the target joins.
 * @param takesPart for each label, 1 where it takes part (50 pixels or more, not the rest), else 0.
 * @returns for each label the pixels taken, the label's total and the share taken; `takenLabelled`, the pixels taken that belong to a label that takes part; and `targetShare`, the share of those that belong to a target place (NaN where none is taken). Every share is from 0 to 1.
 */
export function placeRead(mask: Uint8Array, labels: Uint8Array, sky: Uint8Array | null, places: number[], takesPart: ArrayLike<number>): PlaceReading {
  const nl = takesPart.length;
  const taken = new Array<number>(nl).fill(0), totals = new Array<number>(nl).fill(0);
  for (let i = 0; i < labels.length; i++) {
    const l = labels[i];
    if (l < nl) totals[l]++;
    if (mask[i] && !(sky && sky[i]) && l < nl) taken[l]++;
  }
  const inTarget = new Set(places);
  let takenLabelled = 0, targetTaken = 0;
  for (let l = 0; l < nl; l++) {
    if (!takesPart[l]) continue;
    takenLabelled += taken[l];
    if (inTarget.has(l)) targetTaken += taken[l];
  }
  return { taken, totals, shares: taken.map((t, l) => (totals[l] > 0 ? t / totals[l] : NaN)), takenLabelled, targetShare: takenLabelled > 0 ? targetTaken / takenLabelled : NaN };
}

/** The words for a selection's ranges. Takes the parts and the kind and returns the text with each range in the cue's own units. */
function partsText(parts: PlacePart[], kind: string): string {
  const r = (p: PlacePart): string => `${nameOfPart(p) || String(p.cue)} ${fmt(p.from)} to ${fmt(p.to)}`;
  if (parts.length === 0) return "no range";
  if (parts.length === 1) return r(parts[0]);
  return `${r(parts[0])}, ${kind === KIND_SUBTRACT ? "subtract" : "only where both"} ${r(parts[1])}`;
}

/** The words for what a reading takes. Takes the reading, the label names and which labels take part, and returns the segments: what each label gives, and the target's share. */
function readSegments(rd: PlaceReading, names: string[], takesPart: ArrayLike<number>, prefix: string): string[] {
  const each: string[] = [];
  for (let l = 0; l < names.length; l++) if (takesPart[l]) each.push(`${names[l]} ${fmt(rd.shares[l])}`);
  return [`${prefix}takes ${each.join(", ")}`, `${prefix}target share of the pixels taken ${fmt(rd.targetShare)}`];
}

/**
 * Builds the report: the rows, this photograph's fitted selections and the masks.
 * @param cues the eight cue arrays of placeCueValues.
 * @param labels one byte for each counted pixel holding its label.
 * @param names the names of the labels, the label byte being an index; a label named "rest" takes no part.
 * @param targets the targets in the form of PLACE_TARGETS, each with a title and the labels it joins as `places`.
 * @param sky one byte for each counted pixel, 1 where the app's sky selection holds the pixel at a weight of 0.5 or more.
 * @param photograph the photograph's name.
 * @param kept the selections kept from other photographs, each a PlaceFit as read back from text.
 * @param cueNames optional, the cues' names in the order of the cue arrays, which may be any number; the eight stand where none is given. A cue named among the eight keeps that one's scale, any other name is binned from 0 to 1.
 * @param leaveOut optional, the names of cues to leave out of the pair rows and the fits; a cue left out is still read when a kept selection names it.
 * @returns `rows`, the finished text rows in order (the counted pixels by label; one row for each pair of labels with the distance, threshold and balanced share of each cue that takes part and the best two cues together; for each target the selections fitted here, each with its read and its read with the sky selection removed; for each selection kept from another photograph one row naming it with its read here, or, where it names a cue this run does not count, one row saying it is not read here with that cue's name, and taking nothing); `fits`, this photograph's fitted selections as plain data; and `masks`, titled byte arrays for the water and the built things where those targets are given and otherwise for the first two targets, the best single range and the best joined selection, kept from another photograph where one holds that target and fitted here otherwise. A label of under 50 pixels is printed as too few to count and takes no part in a distance or a fit.
 */
export function placeReport(cues: ArrayLike<number>[], labels: Uint8Array, names: string[], targets: PlaceTargetLike[], sky: Uint8Array, photograph: string, kept: PlaceFit[], cueNames?: ArrayLike<string> | null, leaveOut?: ArrayLike<string> | null): { rows: string[]; fits: PlaceFit; masks: PlaceMask[] } {
  const rows: string[] = [];
  const n = labels.length;
  const nl = names.length;
  const cs = cueSetOf(cues.length, cueNames, leaveOut);
  const bins = binsOf(cues, cs);
  const counts = new Array<number>(nl).fill(0);
  for (let i = 0; i < n; i++) if (labels[i] < nl) counts[labels[i]]++;
  const takesPart = new Array<number>(nl).fill(0);
  for (let l = 0; l < nl; l++) takesPart[l] = counts[l] >= MIN_PIXELS && names[l] !== "rest" ? 1 : 0;

  // Row 1: the counted pixels by label.
  rows.push("Counted pixels by label: " + names.map((nm, l) => `${nm} ${counts[l]}${counts[l] < MIN_PIXELS ? ", too few to count" : ""}`).join(" · "));

  // Histograms of each label on each cue, and the joint histograms of each pair of cues.
  const pairs: [number, number][] = [];
  for (let i = 0; i < cs.fit.length; i++) for (let j = i + 1; j < cs.fit.length; j++) pairs.push([cs.fit[i], cs.fit[j]]);
  const hist: Float64Array[][] = [];
  const joint: Float64Array[][] = [];
  for (let l = 0; l < nl; l++) {
    hist.push(cues.map(() => new Float64Array(NB)));
    joint.push(pairs.map(() => new Float64Array(NJ * NJ)));
  }
  const step = NB / NJ;
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (l >= nl || !takesPart[l]) continue;
    for (const c of cs.fit) hist[l][c][bins[c][i]]++;
    for (let p = 0; p < pairs.length; p++) joint[l][p][Math.floor(bins[pairs[p][0]][i] / step) * NJ + Math.floor(bins[pairs[p][1]][i] / step)]++;
  }
  for (let a = 0; a < nl; a++) {
    if (!takesPart[a]) continue;
    for (let b = a + 1; b < nl; b++) {
      if (!takesPart[b]) continue;
      const segs: string[] = [];
      for (const c of cs.fit) {
        const d = placeHellinger(hist[a][c], hist[b][c]);
        const th = placeThreshold(hist[a][c], hist[b][c]);
        segs.push(`${cs.names[c]} distance ${fmt(d)}, threshold ${fmt(edgeOfKind(cs.kinds[c], th.edge))} with ${th.firstBelow ? names[a] : names[b]} below, balanced share ${fmt(th.balanced)}`);
      }
      let bestD = -1, bestP = 0;
      for (let p = 0; p < pairs.length; p++) {
        const d = placeHellinger(joint[a][p], joint[b][p]);
        if (d > bestD) { bestD = d; bestP = p; }
      }
      if (pairs.length) segs.push(`best two cues together ${cs.names[pairs[bestP][0]]} with ${cs.names[pairs[bestP][1]]}, distance ${fmt(bestD)} on ${NJ} by ${NJ} bins`);
      rows.push(`${names[a]} against ${names[b]}: ${segs.join(" · ")}`);
    }
  }
  for (let l = 0; l < nl; l++) if (names[l] !== "rest" && !takesPart[l]) rows.push(`${names[l]}: too few to count, ${counts[l]} pixels, and it takes no part in a distance or a fit`);

  // Fits, one target at a time.
  const fits: PlaceFit = { photograph, targets: [] };
  const roleOfTarget: Uint8Array[] = [];
  for (let t = 0; t < targets.length; t++) {
    const tg = targets[t];
    const role = rolesOf(labels, tg.places, takesPart);
    roleOfTarget.push(role);
    const f = fitBins(bins, role, cs);
    if (!f) {
      fits.targets.push({ title: tg.title, selections: [], bestJoined: "" });
      rows.push(`${tg.title}, fitted here: too few pixels to fit, the target or the other labelled pixels number under ${MIN_PIXELS}`);
      continue;
    }
    fits.targets.push({ title: tg.title, selections: f.selections, bestJoined: f.bestJoined });
    for (const s of f.selections) {
      const rd = placeRead(applyParts(bins, s, cs), labels, null, tg.places, takesPart);
      const rs = placeRead(applyParts(bins, s, cs), labels, sky, tg.places, takesPart);
      rows.push(`${tg.title}, ${s.kind}, fitted here: ${[partsText(s.parts, s.kind), `balanced share ${fmt(s.balanced)}`, ...readSegments(rd, names, takesPart, ""), ...readSegments(rs, names, takesPart, "with the sky selection removed, ")].join(" · ")}`);
    }
  }

  // Selections kept from other photographs, read here.
  for (const k of kept) {
    for (const kt of k.targets) {
      const ti = targets.findIndex((x) => x.title === kt.title);
      if (ti < 0) { rows.push(`${kt.title}, kept from ${k.photograph}: no target of that title here`); continue; }
      for (const s of kt.selections) {
        const ranges = s.parts.map((p) => rangeOf(p, cs));
        if (ranges.some((r) => r === null)) {
          const missing = s.parts.filter((p) => !cs.names.includes(nameOfPart(p))).map((p) => nameOfPart(p) || "a cue with no name");
          rows.push(`${kt.title}, ${s.kind}, kept from ${k.photograph}: not read here, ${missing.length ? `it names ${missing.join(" and ")}, which this run does not count` : "a range of it has no width"}, and it takes nothing`);
          continue;
        }
        const rd = placeRead(applyParts(bins, s, cs), labels, null, targets[ti].places, takesPart);
        const rs = placeRead(applyParts(bins, s, cs), labels, sky, targets[ti].places, takesPart);
        rows.push(`${kt.title}, ${s.kind}, kept from ${k.photograph}, read here: ${[partsText(s.parts, s.kind), `balanced share there ${fmt(s.balanced)}`, ...readSegments(rd, names, takesPart, ""), ...readSegments(rs, names, takesPart, "with the sky selection removed, ")].join(" · ")}`);
      }
    }
  }

  // The masks: the water and the built things where given, else the first two targets.
  let pick: number[] = [];
  for (let t = 0; t < targets.length; t++) if (/water/i.test(targets[t].title) || /built/i.test(targets[t].title)) pick.push(t);
  if (!pick.length) pick = targets.slice(0, 2).map((_, t) => t);
  const masks: PlaceMask[] = [];
  const push = (title: string, data: Uint8Array): void => { masks.push({ title, data, mask: data, taken: data }); };
  for (const t of pick) {
    const ft = fits.targets[t];
    let source: PlaceFitTarget | null = null, from = "";
    for (const k of kept) {
      const kt = k.targets.find((x) => x.title === targets[t].title && x.selections.length > 0);
      if (kt) { source = kt; from = k.photograph; break; }
    }
    const usingKept = source !== null;
    const src = source ?? ft;
    if (!src || !src.selections.length) continue;
    const where = usingKept ? `kept from ${from}` : "fitted on this photograph";
    const single = src.selections.find((s) => s.kind === KIND_SINGLE);
    const joined = src.selections.find((s) => s.kind === src.bestJoined);
    if (single) push(`${targets[t].title}: best single range, ${where}`, applyParts(bins, single, cs));
    if (joined) push(`${targets[t].title}: best joined selection (${joined.kind}), ${where}`, applyParts(bins, joined, cs));
  }
  return { rows, fits, masks };
}

/** A fitted selection over binned cues. Takes the bins, the selection and the cue set, and returns its mask; all 0 where a range names a cue this run does not count. */
function applyParts(bins: Uint8Array[], s: PlaceSelection, cs: CueSet): Uint8Array {
  const ranges: Range[] = [];
  for (const p of s.parts) { const r = rangeOf(p, cs); if (!r) return new Uint8Array(bins.length ? bins[0].length : 0); ranges.push(r); }
  return applyBins(bins, ranges, s.kind);
}
