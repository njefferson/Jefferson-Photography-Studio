// step437-scores.mjs: joins step 437's three part files into research/whole/maps-features/index.json and writes
// research/whole/maps-features/scores.md from the scorer's outputs, which the runner keeps under maps-features/score-out,
// one file for each planted mask, named for the mask file.
// Use: node step437-scores.mjs
// The index is a list, one entry for each mask, each { file, kind, variant, input, picture, subject }; a carried mask's entry also
// carries "from", and its variant names the photograph it was carried from. Exits 0 whatever it finds.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

console.log('MADE TO FAIL: a built-in scorer output reading overlap over union at a half 0.8750 and a widest band of 6 px must be read back as 0.8750 and 6 (known figures 0.8750 and 6)');
console.log('MADE TO FAIL: the mean of the two figures 0.5 and 0.7 must read 0.6000 (known figure 0.6000)');
console.log('nothing below is trustworthy unless the plant lines read 0.8750 and 6, and 0.6000');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const MF = SCRATCH + '/research/whole/maps-features';
const INPUTS = ['open', 'natural', 'bright'], FITS = ['near', 'linear'];

/** Reads the scorer's figures out of its printed output. Gives { iou, soft, band, subjectTaken, elseTaken } or null where it did not score. */
function parse(text) {
  const iou = /overlap over union at a half: ([0-9.]+) \(soft: ([0-9.]+)\)/.exec(text);
  const band = /widest band along the boundary: ([0-9]+) px/.exec(text);
  const st = /subject taken: ([0-9.]+)/.exec(text), et = /else taken: ([0-9.]+)/.exec(text);
  if (!iou || !band) return null;
  return { iou: Number(iou[1]), soft: Number(iou[2]), band: Number(band[1]), subjectTaken: st ? Number(st[1]) : NaN, elseTaken: et ? Number(et[1]) : NaN };
}
const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN);

{
  const p = parse('subject taken: 0.9000\nelse taken: 0.0100\noverlap over union at a half: 0.8750 (soft: 0.8800); taken right 1\nwidest band along the boundary: 6 px (3 wrong pixels touching the boundary, 0 wrong pixels apart from it)');
  console.log('plant: read back ' + p.iou.toFixed(4) + ' and ' + p.band);
  console.log('plant: mean ' + mean([0.5, 0.7]).toFixed(4));
}

const rows = [], carried = [];
for (const inp of INPUTS) {
  const f = MF + '/part-' + inp + '.json';
  if (!existsSync(f)) { console.log('part file missing: ' + f); continue; }
  const j = JSON.parse(readFileSync(f, 'utf8'));
  rows.push(...j.rows);
  carried.push(...j.carried);
}
writeFileSync(MF + '/index.json', JSON.stringify([...rows, ...carried], null, 1));
console.log('index: ' + MF + '/index.json, ' + rows.length + ' masks and ' + carried.length + ' carried masks');

const lines = [], by = new Map();
let missing = 0;
for (const r of rows.filter((x) => x.picture.startsWith('plant-'))) {
  const base = r.file.slice(r.file.lastIndexOf('/') + 1).replace(/\.png$/, '');
  const out = MF + '/score-out/' + base + '.txt';
  const p = existsSync(out) ? parse(readFileSync(out, 'utf8')) : null;
  if (!p) { missing++; lines.push('- ' + r.picture + ' ' + r.subject + ', ' + r.variant + ', ' + r.input + ': not scored (' + (existsSync(out) ? 'the scorer printed no figures' : 'no scorer output') + ')'); continue; }
  const meets = p.iou >= 0.9 && p.band <= 4;
  lines.push('- ' + r.picture + ' ' + r.subject + ', ' + r.variant + ', ' + r.input + ': overlap over union at a half ' + p.iou.toFixed(4) + ' (soft ' + p.soft.toFixed(4) + '), widest band ' + p.band + ' px, subject taken ' + p.subjectTaken.toFixed(4) + ', else taken ' + p.elseTaken.toFixed(4) + '; bar ' + (meets ? 'met' : 'not met'));
  const key = r.variant + '|' + r.input;
  if (!by.has(key)) by.set(key, []);
  by.get(key).push({ ...p, meets });
}

const means = [];
for (const f of FITS) for (const inp of INPUTS) {
  const list = by.get(f + '|' + inp) || [];
  means.push({ fit: f, input: inp, mean: mean(list.map((x) => x.iou)), n: list.length, met: list.filter((x) => x.meets).length, half: list.filter((x) => x.iou > 0.5).length, bandMedian: list.length ? list.map((x) => x.band).sort((a, b) => a - b)[Math.floor(list.length / 2)] : NaN });
}
const best = means.filter((m) => m.n).sort((a, b) => b.mean - a.mean)[0];

const md = ['# Planted scores of the fitted classifier\'s coarse masks (step 437, second send, 11 November 2026)', '',
  'Each mask was scored by research/whole/score.mjs, run as a child of scratch/step437-runner.mjs, once for each mask, over every pixel of the picture. The bar of the plan: overlap over union 0.9 or more and a widest band of 4 px or less. These masks are coarse, on cells of 28 pixels brought to the picture\'s size by smooth interpolation, with no edge stage, so a band is the coarse grid\'s and the edge stage is step 440\'s.', '',
  'What these figures cannot show: anything of a mask on a photograph, which the planted pictures stand in for by mirror tiling with no soft edge, wire or lattice; and anything of the method after the edge stage.', '',
  '## One line for each mask', '', ...lines, '',
  '## The mean overlap over union at a half on the planted pictures, each fit on each input', '',
  ...means.map((m) => '- ' + m.fit + ', ' + m.input + ': ' + (m.n ? m.mean.toFixed(4) : 'none') + ' over ' + m.n + ' masks; ' + m.half + ' pass an overlap of a half; ' + m.met + ' meet the bar; median widest band ' + m.bandMedian + ' px'), '',
  'The highest: ' + (best ? best.fit + ' on ' + best.input + ', ' + best.mean.toFixed(4) : 'none') + '.', '',
  missing ? missing + ' planted masks were not scored.' : 'Every planted mask was scored.'];
writeFileSync(MF + '/scores.md', md.join('\n') + '\n');
for (const m of means) console.log('mean ' + m.fit + ' ' + m.input + ': ' + (m.n ? m.mean.toFixed(4) : 'none') + ' over ' + m.n + ', met ' + m.met + ', above a half ' + m.half + ', median band ' + m.bandMedian);
console.log('highest: ' + (best ? best.fit + ' ' + best.input + ' ' + best.mean.toFixed(4) : 'none') + '; not scored ' + missing);
console.log('scores: ' + MF + '/scores.md');
process.exit(0);
