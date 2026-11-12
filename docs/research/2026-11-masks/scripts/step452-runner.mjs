// Step 452 runner. Usage: node step452-runner.mjs <label>. It takes only a label; the children it runs are read from scratch/step452-job.json, a list of { name, script, args } written with the Write tool before each run (script is a full path to a node file under the scratchpad).
// Runs each child with the app's folder as the working folder, up to four side by side (each writes its own files); exits 0 whatever its children do; each child's exit code and whole output go to a file under progress/ named for the label.
import { spawn, spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, mkdirSync, readFileSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const APP = '/home/user/Jefferson-Photography-Studio';
const label = process.argv[2] || 'nolabel';
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

const runOne = (job) => new Promise((done) => {
  const child = spawn('node', [job.script, ...(job.args || [])], { cwd: APP, env: process.env });
  let out = '', err = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { err += d; });
  child.on('error', (e) => { err += String(e); });
  child.on('close', (code) => {
    say('child ' + job.name + ' exit code: ' + code);
    writeFileSync(SCRATCH + '/progress/step-452-' + label + '-' + job.name + '.txt', mask(out + '\n--- stderr ---\n' + err));
    done(code);
  });
});

const jobs = JSON.parse(readFileSync(SCRATCH + '/scratch/step452-job.json', 'utf8'));
say('jobs: ' + jobs.length);
if (free() < 2000) say('stopped: the disk is under 2000 megabytes free');
else {
  let next = 0;
  const lane = async () => { while (next < jobs.length) { const j = jobs[next++]; await runOne(j); } };
  await Promise.all([lane(), lane(), lane(), lane()].slice(0, Math.min(4, jobs.length)));
}
writeFileSync(SCRATCH + '/progress/step-452-run-' + label + '.txt', mask(lines.join('\n')) + '\n');
process.exit(0);
