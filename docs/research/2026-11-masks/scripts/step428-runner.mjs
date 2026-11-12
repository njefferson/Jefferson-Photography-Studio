// Step 428 runner. Usage: node step428-runner.mjs <label> <kind> [args...]. kind is build, harness (args: open|natural, frames|planted, optional picture), score (args: input), or sheets (args: input, picture or all).
// Runs each child with the app's folder as the working folder; exits 0 whatever its children do; each child's exit code and whole output go to a file under progress/.
import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, mkdirSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const APP = '/home/user/Jefferson-Photography-Studio';
const label = process.argv[2] || 'nolabel';
const kind = process.argv[3] || 'build';
const args = process.argv.slice(4);
mkdirSync(SCRATCH + '/progress', { recursive: true });
const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const mask = (t) => String(t).replace(/[0-9a-fA-F]{7,}/g, 'masked');
const free = () => { const st = statfsSync(SCRATCH); return Math.floor((st.bavail * st.bsize) / 1048576); };

say('free megabytes on the scratchpad disk: ' + free());
say('California time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');
lines.push('MADE TO FAIL: the plant child exits 7, known figure 7');
lines.push('nothing below is trustworthy if the plant is not reported as 7');
const plant = spawnSync('node', ['-e', 'process.exit(7)'], { cwd: APP, env: process.env, encoding: 'utf8' });
say('plant exit code: ' + plant.status);

const run = (name, cmd, a) => {
  const r = spawnSync(cmd, a, { cwd: APP, env: process.env, encoding: 'utf8', maxBuffer: 1 << 29 });
  say('child ' + name + ' exit code: ' + r.status);
  writeFileSync(SCRATCH + '/progress/step-428-' + label + '-' + name + '.txt', mask((r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || '')));
  return r;
};
if (free() < 2000) say('stopped: the disk is under 2000 megabytes free');
else if (kind === 'build') run('build', 'node', [SCRATCH + '/scratch/step428-build.mjs']);
else if (kind === 'harness') run('harness', 'node', [SCRATCH + '/scratch/step428-harness.mjs', ...args]);
else if (kind === 'score') run('score', 'node', [SCRATCH + '/scratch/step428-score.mjs', ...args]);
else if (kind === 'digest') run('digest', 'node', [SCRATCH + '/scratch/step428-digest.mjs']);
else if (kind === 'sheets') run('sheets', 'node', [SCRATCH + '/scratch/step428-sheets.mjs', ...args]);
else if (kind === 'smooth') run('smooth', 'node', [SCRATCH + '/scratch/step428-smooth.mjs', ...args]);
else if (kind === 'score2') run('score2', 'node', [SCRATCH + '/scratch/step428-score2.mjs', ...args]);
else if (kind === 'compose') run('compose', 'node', [SCRATCH + '/scratch/step428-compose.mjs', ...args]);
else say('unknown kind ' + kind);
writeFileSync(SCRATCH + '/progress/step-428-run-' + label + '.txt', mask(lines.join('\n')) + '\n');
process.exit(0);
