// step423-2-runner.mjs: the runner of step 423's second send. Takes one label; holds every tool path and flag inside itself.
// The label is a stage name followed by a number; the number picks the frame or the report where a stage needs one.
import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const APP = '/home/user/Jefferson-Photography-Studio';
const S = SCRATCH + '/scratch';
const WHOLE = SCRATCH + '/research/whole';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const num = Number((label.match(/[0-9]+$/) || ['0'])[0]);
const summary = SCRATCH + '/progress/step-423-2-' + label + '.txt';

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
// The session's own folder name is printed below; every other run of seven or more hex-set characters in what is written is masked.
const ID = SCRATCH.split('/')[4];
const mask = (t) => String(t).split(ID).map((part) => part.replace(/[0-9a-fA-F]{7,}/g, 'masked')).join(ID);

const st = statfsSync(SCRATCH);
say('free megabytes on the scratchpad disk: ' + Math.floor((st.bavail * st.bsize) / (1024 * 1024)));
say('California time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
say('scratchpad: ' + SCRATCH);
say('node: ' + process.version);

const plant = spawnSync('node', ['-e', 'process.exit(7)'], { cwd: APP, env: process.env, encoding: 'utf8' });
say('plant exit code: ' + plant.status);
say('label: ' + label + ', stage: ' + stage + ', number: ' + num);

mkdirSync(WHOLE + '/frames', { recursive: true });
mkdirSync(WHOLE + '/planted', { recursive: true });

const run = (name, cmd, args, cwd) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: cwd || APP, env: process.env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 9 * 60 * 1000 });
  const out = SCRATCH + '/progress/step-423-2-' + label + '-' + name + '.txt';
  say('child ' + name + ' exit code: ' + r.status + (r.signal ? ' signal ' + r.signal : '') + (r.error ? ' error ' + r.error.message : '') + ', seconds ' + ((Date.now() - t0) / 1000).toFixed(1) + ', output ' + out);
  writeFileSync(out, mask((r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || '')));
  return r;
};

// The frames: the four of IR-SCIENCE.md section 4b-x the list holds, the three pressed photographs the list holds, and one with no sky.
const FRAMES = ['NIR_3461.NEF', 'NIR_3466.NEF', 'NIR_1827.NEF', 'NIR_1651.NEF', 'NIR_3742.NEF', 'NIR_3705.NEF', 'NIR_3710.NEF', 'NIR_1873.NEF'];
const TRANSCRIPT = '/root/.claude/projects/-home-user/' + ID + '.jsonl';

if (stage === 'check') {
  const files = ['step423-2-build.mjs', 'step423-render.mjs', 'step423-hue.mjs', 'step423-samples.mjs', 'step423-marks.mjs', 'step423-plant.mjs', 'step423-trial.mjs'].map((f) => [S, f])
    .concat(['score.mjs', 'sheet.mjs', 'png.mjs', 'draw.mjs', 'edt.mjs'].map((f) => [WHOLE, f]));
  for (const [d, f] of files) {
    if (!existsSync(d + '/' + f)) { say('not written yet, not checked: ' + f); continue; }
    run('check-' + f.replace(/\./g, '_'), 'node', ['--check', d + '/' + f], d);
  }
} else if (stage === 'build') {
  run('build', 'node', [S + '/step423-2-build.mjs'], APP);
} else if (stage === 'fetch') {
  run('fetch-NIR_1873', 'node', ['tools/owner-images.mjs', '--fetch', 'NIR_1873.NEF'], APP);
} else if (stage === 'render') {
  // render99: every one of the seven held frames whose opening picture is not yet on disk, so that no frame is rendered twice.
  const list = num === 99 ? FRAMES.slice(0, 7) : [FRAMES[num % 10]];
  for (const f of list) {
    if (existsSync(WHOLE + '/frames/' + f.replace(/\.NEF$/, '') + '-open.png')) { say('already rendered, not rendered again: ' + f); continue; }
    say('frame: ' + f);
    run('render-' + f.replace(/\./g, '_'), 'node', [S + '/step423-render.mjs', f], S);
  }
} else if (stage === 'hue') {
  const list = num === 99 ? FRAMES : [FRAMES[num % 10]];
  for (const f of list) run('hue-' + f.replace(/\./g, '_'), 'node', [S + '/step423-hue.mjs', f.replace(/\.NEF$/, '')], S);
} else if (stage === 'samples') {
  run('samples', 'node', [S + '/step423-samples.mjs', TRANSCRIPT, String(num % 1000)], S);
} else if (stage === 'marks') {
  // marks2: NIR_1651 alone, after one of its samples was moved off the branch tips.
  // marks52: the three planted pictures whose built window was moved.
  run('marks', 'node', [S + '/step423-marks.mjs', num >= 50 ? 'planted' : 'frames'].concat(num === 2 ? ['NIR_1651'] : num === 52 ? ['plant-stepped,plant-three,plant-built-foliage'] : []), S);
} else if (stage === 'plant') {
  run('plant', 'node', [S + '/step423-plant.mjs'], S);
} else if (stage === 'trial') {
  run('trial', 'node', [S + '/step423-trial.mjs'], S);
} else {
  say('unknown stage');
}
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
