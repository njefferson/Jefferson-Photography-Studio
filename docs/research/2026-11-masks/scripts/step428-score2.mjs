// Child of the step 428 runner (send 2). Usage: node step428-score2.mjs <open|natural> . Scores every smoothly carried mask of a planted picture with research/whole/score.mjs (run as a child, one mask each), keeps the scorer's own words in research/whole/maps-recipe/scores-smooth-raw-<input>.txt and writes the figures it copied to research/whole/maps-recipe/scores-smooth-<input>.md, one line for each mask. Calculates nothing but the bar's comparison.
// Prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
console.log('MADE TO FAIL: before any real mask, a child that exits 7 stands for a failing scorer and must be reported as 7 (known figure 7); and a built-in block of the scorer words with overlap 0.5000 and band 9 must be read as 0.5000 and 9 (known figures 0.5000 and 9)');
console.log('nothing below is trustworthy if the plant is not reported as 7 and the block as 0.5000 and 9');
const plant = spawnSync('node', ['-e', 'process.exit(7)'], { encoding: 'utf8' });
console.log('plant exit code: ' + plant.status);
const parse = (block) => {
  const g = (re) => { const m = re.exec(block); return m ? m[1] : '?'; };
  return { taken: g(/subject taken: ([0-9.]+)/), other: g(/else taken: ([0-9.]+)/), oiu: g(/overlap over union at a half: ([0-9.]+)/), band: g(/widest band along the boundary: ([0-9]+) px/) };
};
const t = parse('subject taken: 0.1\nelse taken: 0.2\noverlap over union at a half: 0.5000 (soft: 0.4)\nwidest band along the boundary: 9 px (1 wrong)');
console.log('plant line: overlap ' + t.oiu + ' band ' + t.band);

const WHOLE = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole';
const input = process.argv[2] || 'open';
const index = JSON.parse(readFileSync(WHOLE + '/maps-recipe/index/index-smooth-' + input + '-planted.json', 'utf8'));
const raw = [], md = ['# Scores of the 2.79 recipe on the planted pictures, masks carried back by bilinear interpolation of the weights, input ' + input + ' (step 428, send 2). Figures are the scorer\'s own words, copied; the bar is overlap over union 0.9000 or more and widest band 4 pixels or less.'];
let n = 0, met = 0;
for (const e of index) {
  if (!e.file) continue;
  const r = spawnSync('node', [WHOLE + '/score.mjs', e.file, WHOLE + '/planted/' + e.picture + '-truth.png', e.subject], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const out = (r.stdout || '').trim();
  raw.push('### ' + e.picture + ' | ' + input + ' | ' + e.subject + ' | ' + e.rendering + ' | exit ' + r.status);
  raw.push(out);
  if (r.stderr) raw.push('stderr: ' + r.stderr.trim());
  const p = parse(out);
  const bar = Number(p.oiu) >= 0.9 && Number(p.band) <= 4;
  n++; if (bar) met++;
  md.push(e.picture + ' | ' + input + ' | ' + e.subject + ' | ' + e.rendering + ' | subject taken ' + p.taken + ' | else taken ' + p.other + ' | overlap over union ' + p.oiu + ' | widest band ' + p.band + ' px | bar ' + (bar ? 'met' : 'not met'));
}
md.push('Masks scored: ' + n + '; at the bar by these two figures: ' + met);
writeFileSync(WHOLE + '/maps-recipe/scores-smooth-raw-' + input + '.txt', raw.join('\n') + '\n');
writeFileSync(WHOLE + '/maps-recipe/scores-smooth-' + input + '.md', md.join('\n') + '\n');
console.log(input + ': ' + n + ' masks scored, ' + met + ' at the bar');
process.exit(0);
