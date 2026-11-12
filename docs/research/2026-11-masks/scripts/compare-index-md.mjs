// index-md.mjs: writes index.md, the comparison and crops pictures by full path under the judging step that opens them.
// Use: node index-md.mjs <pictures folder> <out.md>
//   The pictures folder holds comparison-<picture>-<subject>.png and crops-<picture>-<subject>.png (the subject as slug(): lower case, hyphens), as the run note says.
//   The judging steps and their frames are read from judging.json beside this file; the subjects of a frame are the names its samples (the first set) carry in samples.json.
// A picture listed with "missing" is not on disk. Prose and lists only, no table.
console.log('MADE TO FAIL: the subjects of a built-in sample list holding Sky twice and Water once must read Sky and Water, in that order, once each (known figures 2)');
console.log('nothing below is trustworthy unless the plant line reads Sky Water');

import { writeFileSync, existsSync } from 'node:fs';
import { COMPARE, readJSON, samplesOf, slug } from './lib.mjs';

/** The distinct names of a sample list in the order met. Takes a list of { name }; gives a list of strings. */
function subjectsOf(samples) { return [...new Set(samples.map((s) => s.name))]; }
console.log('plant: ' + subjectsOf([{ name: 'Sky' }, { name: 'Water' }, { name: 'Sky' }]).join(' '));

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.log('use: node index-md.mjs <pictures folder> <out.md>'); process.exit(0); }
const judging = readJSON(COMPARE + '/judging.json');
const lines = ['# The comparison pictures, by the step that opens them', '', 'Each frame and subject has a comparison picture (eight panels, 1400 wide) and a crops picture (sixteen full-size crops, 1446 wide). A step opens every picture under its heading and writes a Picture line for each.', ''];
let missing = 0, total = 0;
for (const [step, frames] of Object.entries(judging)) {
  lines.push('## Step ' + step);
  for (const f of frames) {
    for (const subj of subjectsOf(samplesOf(f))) {
      for (const kind of ['comparison', 'crops']) {
        const p = dir + '/' + kind + '-' + f + '-' + slug(subj) + '.png';
        total++;
        if (!existsSync(p)) missing++;
        lines.push('- ' + f + ', ' + subj + ', ' + kind + ': ' + p + (existsSync(p) ? '' : ' (missing)'));
      }
    }
  }
  lines.push('');
}
writeFileSync(out, lines.join('\n'));
console.log('written ' + out + ': ' + total + ' pictures listed, ' + missing + ' missing');
process.exit(0);
