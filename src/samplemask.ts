// A mask made from named samples: for one placed name, a recipe fitted from the nine cues' counts at the counted pixels (the name's pixels against the pooled pixels of the other placed names, each cue in 64 bins), a weight from 0 to 1 for every counted pixel read from a recipe on any photograph's cues, the three renderings of those weights the test page draws (the weight, the cut at a half, the cut refined to the photograph's edges by a guided filter), the share of each name a mask takes, and a text form for keeping a recipe on the device. Pure functions on plain arrays: it reads no file, draws nothing, decodes nothing and keeps nothing, so the container can prove it with planted arrays. It chooses nothing: the form, the renderings and the sizes are those of decision record 110.
import { PLACE_CUES, placeBinOf } from "./placecues";

/** The bins of each cue, and the fewest counted pixels the subject and the others each need for a fit. */
const NB = 64;
const MIN_PIXELS = 50;
/** The renderings the page draws, in the record's order, named as the page prints them. */
const RENDERINGS: readonly string[] = ["Weight", "Cut at a half", "Refined to edges"];
/** The name that takes no part in a fit: the pixels no sample holds. */
const REST = "rest";
/** The guided filter's regularisation, and the radius it has at 1024 on the grid's longer side (the editor's own pair). */
const EPSILON = 0.005;
const RADIUS_AT_1024 = 12;
/** The longest text a recipe is read from, in characters. */
const TEXT_MAX = 262144;

/** A recipe as plain data: the subject's name, the photograph it was fitted on, the other names pooled, the cues' names in order with each one's scale kind (0 from 0 to 1, 1 from minus one to one, 2 logarithmic), for each cue the subject's 64 counts and the others' 64 counts, and the two totals. Each cue's counts sum to its side's total. */
export interface SampleMaskRecipe {
  subject: string;
  photograph: string;
  others: string[];
  cues: string[];
  kinds: number[];
  subjectCounts: number[][];
  otherCounts: number[][];
  subjectTotal: number;
  otherTotal: number;
}

/** What a mask takes, with every array one entry for each name in the order the names were given: `shares` the share of the name's counted pixels whose weight is a half or more, `totals` the name's counted pixels, `taken` those taken, and `takenAll` the count of all counted pixels taken whatever their label. */
export interface SampleMaskCoverage {
  names: string[];
  shares: number[];
  totals: number[];
  taken: number[];
  takenAll: number;
}

/** The scale kind of a cue by its name: 1 for the three channel differences, 2 for the two textures, else 0 (from 0 to 1, the scale every other cue has, the edge alignments among them). Takes the cue's name and returns 0, 1 or 2. */
function kindOfCue(name: string): number {
  const i = PLACE_CUES.indexOf(name);
  if (i === 2 || i === 3 || i === 4) return 1;
  if (i === 5 || i === 6) return 2;
  return 0;
}

/** The bin of a value on a scale kind, through the cue module's own bin of a value so the two never differ. Takes the kind (0, 1 or 2) and the value and returns a whole number from 0 to 63; a value that is not a number gives 0. */
function binOf(kind: number, v: number): number {
  return placeBinOf(kind === 1 ? 2 : kind === 2 ? 5 : 0, v);
}

/**
 * The names of the renderings, in the order the decision record lists them.
 * @returns a new array of three names, "Weight", "Cut at a half" and "Refined to edges", each one a name sampleMaskRender accepts.
 */
export function sampleMaskRenderings(): string[] {
  return RENDERINGS.slice();
}

/**
 * Fits a recipe for one placed name against the other placed names.
 * @param cues one array of values for each cue, one value for each counted pixel.
 * @param cueNames the cues' names in the order of the arrays; an array with no name is called `cue N`.
 * @param labels one byte for each counted pixel indexing the names.
 * @param names the placed names, the name rest last; rest takes no part.
 * @param subject the name the mask is made for.
 * @param photograph the name of the photograph the cues were counted on, kept in the recipe.
 * @param leaveOut the names of cues the fit does not read, none where it is empty or null.
 * @returns a recipe, or a reason in words where the subject is not among the names, is rest, or the subject or the other names pooled hold fewer than 50 counted pixels (the reason names both counts), or no cue is left to read. Another name takes part among the others only where it holds 50 counted pixels or more. Every cue's counts sum to its side's total, which sampleMaskWeights relies on.
 */
export function sampleMaskFit(cues: ArrayLike<number>[], cueNames: ArrayLike<string> | null, labels: ArrayLike<number>, names: ArrayLike<string>, subject: string, photograph: string, leaveOut?: ArrayLike<string> | null): SampleMaskRecipe | string {
  let si = -1;
  for (let i = 0; i < names.length; i++) if (names[i] === subject) { si = i; break; }
  if (si < 0) return `the name ${subject} is not among the placed names`;
  if (subject === REST) return "rest takes no mask: it is the pixels no sample holds";
  const skip = new Set<string>();
  if (leaveOut) for (let i = 0; i < leaveOut.length; i++) skip.add(leaveOut[i]);
  const used: number[] = [];
  const usedNames: string[] = [];
  for (let c = 0; c < cues.length; c++) {
    const nm = cueNames && c < cueNames.length && typeof cueNames[c] === "string" ? cueNames[c] : `cue ${c + 1}`;
    if (skip.has(nm) || usedNames.indexOf(nm) >= 0) continue;
    used.push(c);
    usedNames.push(nm);
  }
  if (!used.length) return "no cue is left to read";
  let n = labels.length;
  for (const c of used) n = Math.min(n, cues[c].length);
  const counts = new Float64Array(names.length);
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    if (l >= 0 && l < names.length) counts[l]++;
  }
  const role = new Uint8Array(names.length);
  const others: string[] = [];
  let otherTotal = 0;
  for (let l = 0; l < names.length; l++) {
    if (l === si) { role[l] = 1; continue; }
    if (names[l] === REST || counts[l] < MIN_PIXELS) continue;
    role[l] = 2;
    others.push(names[l]);
    otherTotal += counts[l];
  }
  const subjectTotal = counts[si];
  if (subjectTotal < MIN_PIXELS || otherTotal < MIN_PIXELS) {
    return `too few counted pixels: ${subject} holds ${subjectTotal} and the other names together hold ${otherTotal}, and each side needs ${MIN_PIXELS} or more`;
  }
  const kinds = usedNames.map(kindOfCue);
  const subjectCounts: number[][] = [];
  const otherCounts: number[][] = [];
  for (let k = 0; k < used.length; k++) {
    const arr = cues[used[k]];
    const kind = kinds[k];
    const hs = new Float64Array(NB);
    const ho = new Float64Array(NB);
    for (let i = 0; i < n; i++) {
      const l = labels[i];
      if (l < 0 || l >= names.length) continue;
      const r = role[l];
      if (r === 1) hs[binOf(kind, arr[i])]++;
      else if (r === 2) ho[binOf(kind, arr[i])]++;
    }
    subjectCounts.push(Array.from(hs));
    otherCounts.push(Array.from(ho));
  }
  return { subject, photograph, others, cues: usedNames, kinds, subjectCounts, otherCounts, subjectTotal, otherTotal };
}

/**
 * Checks that a value is a recipe this module could have made. Takes any value and returns null where it is one, else a reason in words: the fields present and of the right type, every cue named once with a scale kind of 0, 1 or 2, 64 finite counts of 0 or more for each cue on each side, both totals 50 or more, and each cue's counts summing to its side's total.
 */
function recipeProblem(r: unknown): string | null {
  if (!r || typeof r !== "object") return "the recipe is not an object";
  const o = r as Record<string, unknown>;
  if (typeof o.subject !== "string" || !o.subject) return "the recipe has no subject name";
  if (typeof o.photograph !== "string") return "the recipe has no photograph name";
  if (!Array.isArray(o.others) || o.others.some((x) => typeof x !== "string")) return "the recipe's other names are not a list of names";
  if (!Array.isArray(o.cues) || !o.cues.length || o.cues.some((x) => typeof x !== "string")) return "the recipe's cues are not a list of names";
  const cues = o.cues as string[];
  if (new Set(cues).size !== cues.length) return "the recipe names a cue twice";
  if (!Array.isArray(o.kinds) || o.kinds.length !== cues.length || o.kinds.some((x) => x !== 0 && x !== 1 && x !== 2)) return "the recipe's scale kinds do not match its cues";
  const st = o.subjectTotal, ot = o.otherTotal;
  if (typeof st !== "number" || typeof ot !== "number" || !(st >= MIN_PIXELS) || !(ot >= MIN_PIXELS) || !Number.isFinite(st) || !Number.isFinite(ot)) return "the recipe's totals are not counts of 50 or more";
  const sides: [string, unknown, number][] = [["subject", o.subjectCounts, st], ["others", o.otherCounts, ot]];
  for (const [side, counts, total] of sides) {
    if (!Array.isArray(counts) || counts.length !== cues.length) return `the recipe's ${side} counts do not match its cues`;
    for (const h of counts) {
      if (!Array.isArray(h) || h.length !== NB) return `a cue's ${side} counts are not ${NB} numbers`;
      let sum = 0;
      for (const v of h) {
        if (typeof v !== "number" || !Number.isFinite(v) || v < 0) return `a cue's ${side} counts hold a value that is not a count`;
        sum += v;
      }
      if (Math.abs(sum - total) > 0.5) return `a cue's ${side} counts do not sum to the ${side} total`;
    }
  }
  return null;
}

/**
 * Gives a weight from 0 to 1 for every counted pixel from a recipe and one photograph's cues.
 * The two sides' histograms are balanced to the smaller total M: s = (n_S times M over N_S, plus 1) over (M plus 64), and o likewise for the others. A pixel's evidence D is the sum over the recipe's cues of ln s less ln o at its bin, and its weight is 1 over (1 plus e to the power minus D).
 * @param recipe a recipe as sampleMaskFit gives or sampleMaskFromText reads.
 * @param cues one array of values for each cue, one value for each counted pixel, in any order.
 * @param cueNames the cues' names in the order of the arrays; the recipe's cues are found among them by name.
 * @returns a Float32Array with one weight for each counted pixel, every one from 0 to 1 and none not a number, or a reason in words where the recipe is not one this module could have made or a cue it reads is not among those given (the reason names it). A cue given that the recipe does not read is not read. A pixel whose bin on every cue holds no sample of either side weighs exactly a half.
 */
export function sampleMaskWeights(recipe: SampleMaskRecipe, cues: ArrayLike<number>[], cueNames: ArrayLike<string>): Float32Array | string {
  const bad = recipeProblem(recipe);
  if (bad) return bad;
  const k = recipe.cues.length;
  const arrays: ArrayLike<number>[] = [];
  for (let c = 0; c < k; c++) {
    let at = -1;
    for (let j = 0; j < cueNames.length && j < cues.length; j++) if (cueNames[j] === recipe.cues[c]) { at = j; break; }
    if (at < 0) return `the recipe reads the cue ${recipe.cues[c]}, which is not among the cues given`;
    arrays.push(cues[at]);
  }
  let n = arrays[0].length;
  for (const a of arrays) n = Math.min(n, a.length);
  const M = Math.min(recipe.subjectTotal, recipe.otherTotal);
  const tables: Float64Array[] = [];
  for (let c = 0; c < k; c++) {
    const t = new Float64Array(NB);
    for (let b = 0; b < NB; b++) {
      const s = ((recipe.subjectCounts[c][b] * M) / recipe.subjectTotal + 1) / (M + NB);
      const o = ((recipe.otherCounts[c][b] * M) / recipe.otherTotal + 1) / (M + NB);
      t[b] = Math.log(s) - Math.log(o);
    }
    tables.push(t);
  }
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let d = 0;
    for (let c = 0; c < k; c++) d += tables[c][binOf(recipe.kinds[c], arrays[c][i])];
    out[i] = 1 / (1 + Math.exp(-d));
  }
  return out;
}

/** The box sums of a field over the grid, by running sums. Takes the field (gw times gh, row by row), the grid's width and height, the radius and a scratch array of (gw + 1) times (gh + 1), and writes into `out` (gw times gh) the sum over the places within the radius in each direction that lie inside the grid. Gives back nothing. */
function boxSums(src: Float64Array, gw: number, gh: number, r: number, sat: Float64Array, out: Float64Array): void {
  const w1 = gw + 1;
  for (let y = 0; y < gh; y++) {
    let row = 0;
    for (let x = 0; x < gw; x++) {
      row += src[y * gw + x];
      sat[(y + 1) * w1 + x + 1] = sat[y * w1 + x + 1] + row;
    }
  }
  for (let y = 0; y < gh; y++) {
    const y0 = Math.max(0, y - r), y1 = Math.min(gh - 1, y + r) + 1;
    for (let x = 0; x < gw; x++) {
      const x0 = Math.max(0, x - r), x1 = Math.min(gw - 1, x + r) + 1;
      out[y * gw + x] = sat[y1 * w1 + x1] - sat[y0 * w1 + x1] - sat[y1 * w1 + x0] + sat[y0 * w1 + x0];
    }
  }
}

/**
 * The cut weights refined to the photograph's edges by the guided filter on the grid of counted pixels. The grid's columns are the counted pixels' distinct columns in order and its rows their distinct rows; p is the cut, the guide is the frame's lightness at the counted pixel over 255, the radius is the whole number nearest 12 times the grid's longer side over 1024 and at least 1, epsilon is 0.005, and a box mean is taken over the places in the window that hold a counted pixel.
 * @param cut one value, 0 or 1, for each counted pixel.
 * @param light the frame's lightness, one byte for each pixel of the whole frame, row by row.
 * @param width the frame's width.
 * @param cols each counted pixel's column in the whole frame.
 * @param rows each counted pixel's row in the whole frame.
 * @returns a Float32Array with one value from 0 to 1 for each counted pixel (the filter's output held to that range), none not a number.
 */
function refineToEdges(cut: ArrayLike<number>, light: ArrayLike<number>, width: number, cols: ArrayLike<number>, rows: ArrayLike<number>): Float32Array {
  const n = cut.length;
  const out = new Float32Array(n);
  if (!n) return out;
  let maxC = 0, maxR = 0;
  for (let i = 0; i < n; i++) { if (cols[i] > maxC) maxC = cols[i]; if (rows[i] > maxR) maxR = rows[i]; }
  const colIdx = new Int32Array(maxC + 1).fill(-1);
  const rowIdx = new Int32Array(maxR + 1).fill(-1);
  for (let i = 0; i < n; i++) { colIdx[cols[i]] = 0; rowIdx[rows[i]] = 0; }
  let gw = 0, gh = 0;
  for (let x = 0; x <= maxC; x++) if (colIdx[x] === 0) colIdx[x] = gw++;
  for (let y = 0; y <= maxR; y++) if (rowIdx[y] === 0) rowIdx[y] = gh++;
  const g = gw * gh;
  const r = Math.max(1, Math.round((RADIUS_AT_1024 * Math.max(gw, gh)) / 1024));
  const hold = new Float64Array(g);
  const I = new Float64Array(g);
  const p = new Float64Array(g);
  for (let i = 0; i < n; i++) {
    const at = rowIdx[rows[i]] * gw + colIdx[cols[i]];
    hold[at] = 1;
    I[at] = light[rows[i] * width + cols[i]] / 255;
    p[at] = cut[i];
  }
  const sat = new Float64Array((gw + 1) * (gh + 1));
  const cnt = new Float64Array(g);
  boxSums(hold, gw, gh, r, sat, cnt);
  const mI = new Float64Array(g), mp = new Float64Array(g), mII = new Float64Array(g), mIp = new Float64Array(g);
  const field = new Float64Array(g);
  const meanInto = (dst: Float64Array): void => {
    boxSums(field, gw, gh, r, sat, dst);
    for (let at = 0; at < g; at++) dst[at] = cnt[at] > 0 ? dst[at] / cnt[at] : 0;
  };
  field.set(I); meanInto(mI);
  field.set(p); meanInto(mp);
  for (let at = 0; at < g; at++) field[at] = I[at] * I[at];
  meanInto(mII);
  for (let at = 0; at < g; at++) field[at] = I[at] * p[at];
  meanInto(mIp);
  const a = mII, b = mIp;
  for (let at = 0; at < g; at++) {
    if (!hold[at]) { a[at] = 0; b[at] = 0; continue; }
    let v = mII[at] - mI[at] * mI[at];
    if (v < 0) v = 0;
    const cov = mIp[at] - mI[at] * mp[at];
    const ai = cov / (v + EPSILON);
    a[at] = ai;
    b[at] = mp[at] - ai * mI[at];
  }
  const mA = mI, mB = mp;
  field.set(a); meanInto(mA);
  field.set(b); meanInto(mB);
  for (let i = 0; i < n; i++) {
    const at = rowIdx[rows[i]] * gw + colIdx[cols[i]];
    const q = mA[at] * I[at] + mB[at];
    out[i] = q < 0 ? 0 : q > 1 ? 1 : q === q ? q : 0;
  }
  return out;
}

/**
 * Gives the weights as one rendering draws them.
 * @param weights one weight from 0 to 1 for each counted pixel, as sampleMaskWeights gives.
 * @param rendering one of the names sampleMaskRenderings lists: Weight, Cut at a half or Refined to edges.
 * @param lightness the frame's lightness, one byte for each pixel of the whole frame, row by row; read only by Refined to edges.
 * @param width the whole frame's width in pixels.
 * @param height the whole frame's height in pixels.
 * @param cols each counted pixel's column in the whole frame.
 * @param rows each counted pixel's row in the whole frame.
 * @returns a Float32Array with one value from 0 to 1 for each counted pixel and none not a number: Weight the weight itself, Cut at a half 1 where the weight is a half or more and else 0, Refined to edges the guided filter of that cut guided by the frame's lightness at each counted pixel. Throws a RangeError for a name not among the renderings, or for Refined to edges where the lightness is shorter than width times height or the columns or rows are fewer than the weights, since a page asks only for listed names.
 */
export function sampleMaskRender(weights: ArrayLike<number>, rendering: string, lightness: ArrayLike<number>, width: number, height: number, cols: ArrayLike<number>, rows: ArrayLike<number>): Float32Array {
  const n = weights.length;
  if (rendering === RENDERINGS[0]) {
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) { const w = weights[i]; out[i] = w >= 0 ? (w <= 1 ? w : 1) : 0; }
    return out;
  }
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = weights[i] >= 0.5 ? 1 : 0;
  if (rendering === RENDERINGS[1]) return cut;
  if (rendering !== RENDERINGS[2]) throw new RangeError(`${rendering} is not a rendering of the mask`);
  if (cols.length < n || rows.length < n || lightness.length < width * height) throw new RangeError("Refined to edges needs the lightness of the whole frame and a column and a row for each counted pixel");
  return refineToEdges(cut, lightness, width, cols, rows);
}

/**
 * Counts what a mask takes of each name.
 * @param weights one weight for each counted pixel.
 * @param labels one byte for each counted pixel indexing the names.
 * @param names the placed names, rest last.
 * @returns a coverage object: for each name in order the share of its counted pixels whose weight is a half or more (0 for a name with no pixels), its pixels, the pixels taken, and the count of all counted pixels taken whatever their label. Every share is from 0 to 1.
 */
export function sampleMaskCoverage(weights: ArrayLike<number>, labels: ArrayLike<number>, names: ArrayLike<string>): SampleMaskCoverage {
  const m = names.length;
  const totals = new Array<number>(m).fill(0);
  const taken = new Array<number>(m).fill(0);
  let takenAll = 0;
  const n = Math.min(weights.length, labels.length);
  for (let i = 0; i < n; i++) {
    const l = labels[i];
    const hit = weights[i] >= 0.5;
    if (hit) takenAll++;
    if (l >= 0 && l < m) { totals[l]++; if (hit) taken[l]++; }
  }
  const shares = totals.map((t, l) => (t > 0 ? taken[l] / t : 0));
  const list: string[] = [];
  for (let l = 0; l < m; l++) list.push(names[l]);
  return { names: list, shares, totals, taken, takenAll };
}

/**
 * Writes a recipe as text for keeping on the device.
 * @param recipe a recipe as sampleMaskFit gives.
 * @returns a string of JSON holding the recipe's fields and no other; sampleMaskFromText reads it back to a recipe giving the same weights.
 */
export function sampleMaskToText(recipe: SampleMaskRecipe): string {
  return JSON.stringify({
    subject: recipe.subject,
    photograph: recipe.photograph,
    others: recipe.others,
    cues: recipe.cues,
    kinds: recipe.kinds,
    subjectCounts: recipe.subjectCounts,
    otherCounts: recipe.otherCounts,
    subjectTotal: recipe.subjectTotal,
    otherTotal: recipe.otherTotal,
  });
}

/**
 * Reads a recipe from the text sampleMaskToText wrote.
 * @param text the kept text.
 * @returns the recipe, or null for text it cannot read: not a string, longer than the limit, not JSON, or JSON that is not a recipe this module could have made (a missing field, a wrong type, a scale kind other than 0, 1 or 2, a cue named twice, counts that are not 64 whole numbers of 0 or more, or counts that do not sum to their total). A recipe returned passes the checks sampleMaskWeights makes of it.
 */
export function sampleMaskFromText(text: string): SampleMaskRecipe | null {
  if (typeof text !== "string" || !text || text.length > TEXT_MAX) return null;
  let raw: unknown;
  try { raw = JSON.parse(text); } catch { return null; }
  if (recipeProblem(raw)) return null;
  const o = raw as SampleMaskRecipe;
  return {
    subject: o.subject,
    photograph: o.photograph,
    others: o.others.slice(),
    cues: o.cues.slice(),
    kinds: o.kinds.slice(),
    subjectCounts: o.subjectCounts.map((h) => h.slice()),
    otherCounts: o.otherCounts.map((h) => h.slice()),
    subjectTotal: o.subjectTotal,
    otherTotal: o.otherTotal,
  };
}
