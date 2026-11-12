// Child of the step 428 runner. Usage: node step428-score.mjs <open|natural|both> [limit]. Scores every mask of a planted picture the harness wrote with research/whole/score.mjs (run as a child, one mask each), and writes the child's own words for each to research/whole/maps-recipe/scores-raw-<input>.txt.
// Prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
console.log('MADE TO FAIL: before any real mask, a child that exits 7 stands for a failing scorer and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');
const plant = spawnSync('node', ['-e', 'process.exit(7)'], { encoding: 'utf8' });
console.log('plant exit code: ' + plant.status);

const WHOLE = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole';
const which = process.argv[2] || 'open';
const limit = Number(process.argv[3] || 100000);
for (const input of which === 'both' ? ['open', 'natural'] : [which]) {
  const index = JSON.parse(readFileSync(WHOLE + '/maps-recipe/index/index-' + input + '-planted.json', 'utf8'));
  const out = [];
  let done = 0;
  for (const e of index) {
    if (!e.file || done >= limit) continue;
    const r = spawnSync('node', [WHOLE + '/score.mjs', e.file, WHOLE + '/planted/' + e.picture + '-truth.png', e.subject], { encoding: 'utf8', maxBuffer: 1 << 28 });
    out.push('### ' + e.picture + ' | ' + input + ' | ' + e.subject + ' | ' + e.rendering + ' | exit ' + r.status);
    out.push((r.stdout || '').trim());
    if (r.stderr) out.push('stderr: ' + r.stderr.trim());
    done++;
  }
  writeFileSync(WHOLE + '/maps-recipe/scores-raw-' + input + '.txt', out.join('\n') + '\n');
  console.log(input + ': ' + done + ' masks scored');
}
process.exit(0);
