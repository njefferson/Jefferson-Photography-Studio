// Child of the step 428 runner. Usage: node step428-digest.mjs. Reads the scorer's raw words in research/whole/maps-recipe/scores-raw-*.txt and writes research/whole/maps-recipe/scores.md, one line for each mask, copying the scorer's figures and calculating nothing.
// Prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync } from 'node:fs';
console.log('MADE TO FAIL: a built-in block of the scorer words with overlap 0.5000 and band 9 must be read as 0.5000 and 9 (known figures 0.5000 and 9)');
console.log('nothing below is trustworthy if the plant line does not read 0.5000 and 9');
const parse = (block) => {
  const g = (re) => { const m = re.exec(block); return m ? m[1] : '?'; };
  return { taken: g(/subject taken: ([0-9.]+)/), other: g(/else taken: ([0-9.]+)/), oiu: g(/overlap over union at a half: ([0-9.]+)/), band: g(/widest band along the boundary: ([0-9]+) px/) };
};
const t = parse('subject taken: 0.1\nelse taken: 0.2\noverlap over union at a half: 0.5000 (soft: 0.4)\nwidest band along the boundary: 9 px (1 wrong)');
console.log('plant line: overlap ' + t.oiu + ' band ' + t.band);

const WHOLE = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole';
const lines = ['# Scores of the 2.79 recipe on the planted pictures (step 428). Figures are the scorer\'s own words, copied; the bar is overlap over union 0.9000 or more and widest band 4 pixels or less.'];
let n = 0, met = 0;
for (const input of ['open', 'natural']) {
  const raw = readFileSync(WHOLE + '/maps-recipe/scores-raw-' + input + '.txt', 'utf8').split('\n### ').map((s, i) => (i === 0 ? s.replace(/^### /, '') : s));
  for (const blk of raw) {
    if (!blk.trim()) continue;
    const head = blk.split('\n')[0];
    const f = head.split(' | ');
    const p = parse(blk);
    const bar = Number(p.oiu) >= 0.9 && Number(p.band) <= 4;
    n++; if (bar) met++;
    lines.push(f[0] + ' | ' + f[1] + ' | ' + f[2] + ' | ' + f[3] + ' | subject taken ' + p.taken + ' | else taken ' + p.other + ' | overlap over union ' + p.oiu + ' | widest band ' + p.band + ' px | bar ' + (bar ? 'met' : 'not met'));
  }
}
lines.push('Masks scored: ' + n + '; at the bar by these two figures: ' + met);
writeFileSync(WHOLE + '/maps-recipe/scores.md', lines.join('\n') + '\n');
console.log('scores.md written: ' + n + ' masks, ' + met + ' at the bar');
process.exit(0);
