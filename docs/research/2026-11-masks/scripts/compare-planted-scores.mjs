// planted-scores.mjs: scores every planted mask of a final index with the scorer (score.mjs, as a child) and writes planted-scores.md.
// Use: node planted-scores.mjs <index.json> <out.md>
//   index.json   a list of { entry, picture, subject, input, file }; the rows whose picture is a planted one (plant-...) are scored. The final index is research/whole/final/index.json
//                (step 440 writes it); compare/trial/index-trial.json is the same form made from the masks as they stand.
//   out.md       one line for each mask, with the bar beside it (overlap over union 0.9 or more and a widest band of 4 pixels or less), then for each entry the count that meets it.
// The scorer is run as a child, four at a time; its two lines are read as they stand. A mask the scorer does not score is written as not scored.
console.log('MADE TO FAIL: the scorer run on a mask made from plant-straight\'s own truth for Sky must read overlap over union 1.0000 and a widest band of 0 px, and the reading of the line "overlap over union at a half: 0.9904 (soft: 0.9" and "widest band along the boundary: 71 px" must give 0.9904 and 71 (known figures 1.0000, 0, 0.9904 and 71)');
console.log('nothing below is trustworthy unless the plant lines read 1.0000, 0 px, 0.9904 and 71');

import { spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { readGrey, writePNG } from '../png.mjs';
import { WHOLE, COMPARE, readJSON, resolveRow, loadTruth, valuesOf } from './lib.mjs';

const BAR_IOU = 0.9, BAR_BAND = 4;

/** Reads the scorer's text. Gives { iou, band } or null where either line is missing. */
export function parseScore(out) {
  const a = /overlap over union at a half: ([0-9.]+)/.exec(out), b = /widest band along the boundary: ([0-9]+) px/.exec(out);
  return a && b ? { iou: Number(a[1]), band: Number(b[1]) } : null;
}

/** Runs the scorer on one mask and truth; gives a promise of { iou, band } or { error }. */
function score(mask, truth, subject) {
  return new Promise((resolve) => {
    const c = spawn('node', [WHOLE + '/score.mjs', mask, truth, subject]);
    let out = '';
    c.stdout.on('data', (d) => { out += d; });
    c.stderr.on('data', (d) => { out += d; });
    c.on('close', () => resolve(parseScore(out) || { error: out.split('\n').filter((l) => /not scored|Error/.test(l))[0] || 'no figures read' }));
  });
}

{
  const p = parseScore('x\noverlap over union at a half: 0.9904 (soft: 0.9908); taken right\nwidest band along the boundary: 71 px (1 wrong)');
  console.log('plant: parse reads ' + p.iou.toFixed(4) + ' and ' + p.band);
  const t = loadTruth('plant-straight'), v = valuesOf(t.regions, 'Sky'), m = new Uint8Array(t.data.length);
  for (let i = 0; i < m.length; i++) m[i] = v.includes(t.data[i]) ? 255 : 0;
  mkdirSync(COMPARE + '/trial', { recursive: true });
  const f = COMPARE + '/trial/self-mask-plant-straight-sky.png';
  writePNG(f, t.width, t.height, 1, m);
  const s = await score(f, WHOLE + '/planted/plant-straight-truth.png', 'Sky');
  console.log('plant: the scorer reads ' + (s.error ? s.error : s.iou.toFixed(4) + ' and ' + s.band + ' px') + ' on the truth\'s own mask');
}

const [indexPath, outPath] = process.argv.slice(2);
if (!indexPath || !outPath) { console.log('use: node planted-scores.mjs <index.json> <out.md>'); process.exit(0); }
const rows = readJSON(indexPath).filter((r) => r.picture.startsWith('plant-'));
const results = new Array(rows.length);
let next = 0;
async function worker() {
  while (next < rows.length) {
    const k = next++, r = rows[k], file = resolveRow(r.file, indexPath);
    if (!existsSync(file)) { results[k] = { error: 'mask file missing' }; continue; }
    results[k] = await score(file, WHOLE + '/planted/' + r.picture + '-truth.png', r.subject);
  }
}
await Promise.all([worker(), worker(), worker(), worker()]);

const meets = (s) => !s.error && s.iou >= BAR_IOU && s.band <= BAR_BAND;
const lines = ['# The planted masks scored (step 438 script, run on ' + indexPath + ')', '',
  'The bar beside every line: overlap over union ' + BAR_IOU.toFixed(4) + ' or more with the mask cut at a half, and a widest band of wrong pixels along the boundary of ' + BAR_BAND + ' pixels or less. The figures are the scorer\'s (score.mjs).', ''];
const entries = [...new Set(rows.map((r) => r.entry))];
for (const e of entries) {
  lines.push('## ' + e);
  let ok = 0, n = 0;
  rows.forEach((r, k) => {
    if (r.entry !== e) return;
    const s = results[k];
    n++;
    if (meets(s)) ok++;
    lines.push('- ' + r.picture + ' ' + r.subject + ' (' + r.input + '): ' + (s.error ? 'not scored, ' + s.error : 'overlap over union ' + s.iou.toFixed(4) + ', widest band ' + s.band + ' px') + '; bar ' + BAR_IOU.toFixed(4) + ' and ' + BAR_BAND + ' px; ' + (meets(s) ? 'meets the bar' : 'does not meet the bar'));
  });
  lines.push('- COUNT for ' + e + ': ' + ok + ' of ' + n + ' planted masks meet the bar', '');
}
if (!entries.length) lines.push('No planted mask stands in the index.');
writeFileSync(outPath, lines.join('\n') + '\n');
for (const l of lines.filter((x) => x.startsWith('- COUNT'))) console.log(l);
console.log('written ' + outPath + ' (' + rows.length + ' planted masks)');
process.exit(0);
