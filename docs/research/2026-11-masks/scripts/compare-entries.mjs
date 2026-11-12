// entries.mjs: fixes the entries of the comparison from the map folders' index files, by figures and never by eye, and writes entries.json and entries.md.
// An entry is one variant of a kind. For each learned kind found as a folder research/whole/maps-<kind> (the clicked models' maps-points and the fitted classifier's
// maps-features, each with an index.json somewhere below it; the old scene-class folder maps-classes and the recipe's are other kinds and are left out here):
//   the first entry is the candidate with the highest mean overlap over union, mask cut at a half, over the planted pictures' masks in their coarse form,
//   counted by this script's own loop (lib.mjs iouAtHalf, not score.mjs); a candidate is a (kind, variant, input) triple of the index rows; a tie goes to the
//   candidate with more planted masks, then to the name that sorts first;
//   the second entry is the best such candidate on an input other than the first's.
// The scene-class kind (compare/classes, drawn by classes.mjs) has its two inputs, open and natural, as its two entries. The recipe's entry is its rendering
// "Refined to edges" on the picture as it opens, in the smooth (bilinear carried) form, from maps-recipe/index.
// A kind whose folder holds no index file, or no planted mask that stands, has no entry and says why.
// Use: node entries.mjs            writes compare/entries.json and compare/entries.md
//      node entries.mjs trial      also writes compare/trial/index-trial.json: every entry's masks as they stand, in the form of the final index
//                                  (a list of { entry, picture, subject, input, file }), for the composing scripts to be tried on before the edge stage has run
console.log('MADE TO FAIL: the picking rule on three built-in candidates with mean overlaps 0.80 on open, 0.90 on natural and 0.85 on open must pick the natural one first and the 0.85 open one second (known figures 0.90 then 0.85)');
console.log('nothing below is trustworthy unless the plant line reads 0.90 natural then 0.85 open');

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { readdirSync } from 'node:fs';
import { readGrey } from '../png.mjs';
import { WHOLE, COMPARE, readJSON, walkFiles, resolveRow, loadTruth, valuesOf, iouAtHalf, slug } from './lib.mjs';

/**
 * Orders candidates by mean (high first), then by count (more first), then by name. Takes [{ key, input, mean, n }]; gives { first, second } where second is the best on an input other than the first's (or null).
 */
export function pickTwo(cands) {
  const s = cands.slice().sort((a, b) => b.mean - a.mean || b.n - a.n || (a.key < b.key ? -1 : 1));
  const first = s[0] || null;
  const second = first ? s.find((c) => c.input !== first.input) || null : null;
  return { first, second };
}

{
  const r = pickTwo([{ key: 'a', input: 'open', mean: 0.8, n: 15 }, { key: 'b', input: 'natural', mean: 0.9, n: 15 }, { key: 'c', input: 'open', mean: 0.85, n: 15 }]);
  console.log('plant: first ' + r.first.mean.toFixed(2) + ' ' + r.first.input + ', second ' + r.second.mean.toFixed(2) + ' ' + r.second.input);
}

const truths = new Map();
/** The planted mean of a list of rows: the mean over the rows whose masks stand and whose picture is a planted one. Gives { mean, n }. */
function plantedMean(rows) {
  let s = 0, n = 0;
  for (const r of rows) {
    if (!r.picture.startsWith('plant-') || !existsSync(r.file)) continue;
    if (!truths.has(r.picture)) truths.set(r.picture, loadTruth(r.picture));
    const t = truths.get(r.picture), vals = valuesOf(t.regions, r.subject);
    if (!vals.length) continue;
    const m = readGrey(r.file);
    if (m.width !== t.width || m.height !== t.height) continue;
    s += iouAtHalf(m.data, t.data, vals).iou; n++;
  }
  return { mean: n ? s / n : 0, n };
}

/** The rows of every index.json below a folder, each with its file resolved. Gives a list. */
function rowsBelow(dir) {
  const out = [];
  for (const ip of walkFiles(dir, (n) => n === 'index.json')) {
    let j = readJSON(ip);
    if (!Array.isArray(j)) j = j.entries || j.rows || [];
    for (const r of j) if (r && r.file && r.picture && r.subject) out.push({ ...r, file: resolveRow(r.file, ip), indexFile: ip });
  }
  return out;
}

const figure = (p) => p.mean.toFixed(4) + ' over ' + p.n + ' planted masks';
// The count of planted masks a complete candidate holds: one for each name each planted picture's samples carry.
const EXPECTED = Object.values(readJSON(WHOLE + '/samples.json').planted).reduce((a, e) => a + new Set(e.sets[0].samples.map((s) => s.name)).size, 0);
const groups = [];
const trial = [];
const noteLines = [];

// The learned kinds that have a folder of their own.
const kinds = readdirSync(WHOLE).filter((n) => n.startsWith('maps-') && n !== 'maps-recipe' && n !== 'maps-classes').sort().map((n) => ({ id: n.slice(5), dir: WHOLE + '/' + n }));
kinds.push({ id: 'classes', dir: COMPARE + '/classes' });

for (const k of kinds) {
  const rows = rowsBelow(k.dir);
  const label = k.id === 'points' ? 'CLICKED' : k.id === 'features' ? 'FITTED' : k.id === 'classes' ? 'SCENE-CLASS' : k.id.toUpperCase();
  const g = { id: k.id, label, entries: [], reasons: [], reason: '', candidates: [] };
  if (!rows.length) {
    g.reason = 'NO INDEX FILE STANDS';
    g.reasons = [g.reason, g.reason];
    noteLines.push('- ' + k.id + ' (' + label + '): no index file stands under ' + k.dir + ', so this kind has no entry.');
    groups.push(g);
    continue;
  }
  const by = new Map();
  for (const r of rows) {
    const key = r.kind + ' | ' + r.variant + ' | ' + r.input;
    if (!by.has(key)) by.set(key, { key, kind: r.kind, variant: r.variant, input: r.input, rows: [] });
    by.get(key).rows.push(r);
  }
  const cands = [...by.values()].map((c) => ({ ...c, ...plantedMean(c.rows) }));
  g.candidates = cands.map((c) => ({ key: c.key, input: c.input, mean: c.mean, n: c.n, masks: c.rows.length }));
  let chosen;
  if (k.id === 'classes') chosen = ['open', 'natural'].map((inp) => cands.find((c) => c.input === inp)).filter(Boolean);
  else {
    // A candidate must cover every planted picture and subject the samples file holds, so a variant with two masks cannot outrank one with all of them;
    // where none covers them all, the candidates with the most masks stand and the notes say so.
    const full = cands.filter((c) => c.n === EXPECTED), most = Math.max(0, ...cands.map((c) => c.n));
    const eligible = full.length ? full : cands.filter((c) => c.n === most && c.n > 0);
    if (!full.length && eligible.length) noteLines.push('- ' + k.id + ': no candidate has all ' + EXPECTED + ' planted masks standing; the candidates with the most (' + most + ') are the ones weighed.');
    const { first, second } = pickTwo(eligible.map((c) => ({ key: c.key, input: c.input, mean: c.mean, n: c.n })));
    chosen = [first, second].filter(Boolean).map((p) => cands.find((c) => c.key === p.key));
  }
  chosen.forEach((c, i) => {
    const id = k.id === 'classes' ? 'classes-' + c.input : k.id + '-' + (i === 0 ? 'first' : 'second');
    g.entries.push({ id, kind: c.kind, variant: c.variant, input: c.input, planted: { mean: c.mean, n: c.n }, masks: c.rows.length });
    for (const r of c.rows) trial.push({ entry: id, picture: r.picture, subject: r.subject, input: r.input, file: r.file });
  });
  for (let i = g.entries.length; i < 2; i++) g.reasons[i] = cands.some((c) => c.n > 0) ? 'NO SECOND ENTRY: ONLY ONE INPUT HAS PLANTED MASKS' : 'NO PLANTED MASK STANDS';
  g.reason = g.reasons[0] || '';
  groups.push(g);
  noteLines.push('- ' + k.id + ' (' + label + '), ' + cands.length + ' candidates:');
  for (const c of cands.slice().sort((a, b) => b.mean - a.mean)) noteLines.push('  - ' + c.key + ': mean overlap over union at a half ' + figure(c) + (g.entries.some((e) => e.kind === c.kind && e.variant === c.variant && e.input === c.input) ? ' (an entry)' : ''));
  if (!g.entries.length) noteLines.push('  - no entry: no candidate has a planted mask that stands');
}

// The recipe's entry.
const recipe = { entry: null, reason: 'NO RECIPE INDEX STANDS' };
{
  const files = walkFiles(WHOLE + '/maps-recipe/index', (n) => /^index-smooth-open-(frames|planted)\.json$/.test(n));
  const rows = [];
  for (const ip of files) for (const r of readJSON(ip)) if (r.rendering === 'Refined to edges' && r.input === 'open') rows.push({ ...r, file: resolveRow(r.file, ip) });
  if (rows.length) {
    const p = plantedMean(rows);
    recipe.entry = { id: 'recipe', kind: 'recipe', variant: 'REFINED TO EDGES', input: 'open', planted: p, masks: rows.length };
    recipe.reason = '';
    for (const r of rows) trial.push({ entry: 'recipe', picture: r.picture, subject: r.subject, input: 'open', file: r.file });
    noteLines.unshift('- recipe: the 2.79 recipe\'s rendering Refined to edges on the picture as it opens, carried smoothly, ' + rows.length + ' masks; mean overlap over union at a half ' + figure(p) + '. It goes in as it stands, with no edge stage.');
  }
}

writeFileSync(COMPARE + '/entries.json', JSON.stringify({ recipe, groups }, null, 1));
const md = ['# The entries of the comparison (fixed by figures, step 438)', '',
  'Every figure is the mean overlap over union at a half over the planted pictures\' masks in their coarse form, counted by compare/lib.mjs iouAtHalf (the script\'s own loop, not the scorer). The bar for a final mask is 0.9 and a widest band of 4 pixels; these figures are for choosing which variant goes forward and are not a measure of a mask on a photograph. A learned kind\'s candidate must hold all ' + EXPECTED + ' planted masks (one for each name each planted picture\'s samples carry) to be weighed.', '',
  ...noteLines, '',
  'Entries in the order the pictures draw them (panel 2 is the recipe; panels 3 and 4, 5 and 6, 7 and 8 are the two entries of each kind in the order below):',
  '- recipe: ' + (recipe.entry ? 'recipe, open' : recipe.reason),
  ...groups.map((g) => '- ' + g.id + ': ' + (g.entries.map((e) => e.id + ' (' + e.input + ', ' + e.variant + ')').join('; ') || g.reason))];
writeFileSync(COMPARE + '/entries.md', md.join('\n') + '\n');
for (const l of md) console.log(l);
if (process.argv[2] === 'trial') {
  mkdirSync(COMPARE + '/trial', { recursive: true });
  writeFileSync(COMPARE + '/trial/index-trial.json', JSON.stringify(trial, null, 1));
  console.log('trial index: ' + COMPARE + '/trial/index-trial.json (' + trial.length + ' rows)');
}
console.log('entries: ' + COMPARE + '/entries.json');
process.exit(0);
