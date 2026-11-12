// step423-runner.mjs: the runner of step 423. Takes one label; holds every tool path and flag inside itself.
import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, readFileSync } from 'node:fs';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const APP = '/home/user/Jefferson-Photography-Studio';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const summary = SCRATCH + '/progress/step-423-' + label + '.txt';

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const mask = (t) => String(t).replace(/[0-9a-fA-F]{7,}/g, 'masked');

const st = statfsSync(SCRATCH);
say('free megabytes on the scratchpad disk: ' + Math.floor((st.bavail * st.bsize) / (1024 * 1024)));
say('California time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

const plant = spawnSync('node', ['-e', 'process.exit(7)'], { cwd: APP, env: process.env, encoding: 'utf8' });
say('plant exit code: ' + plant.status);
say('label: ' + label + ', stage: ' + stage);

const run = (name, cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd: cwd || APP, env: process.env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: 9 * 60 * 1000 });
  say('child ' + name + ' exit code: ' + r.status + (r.signal ? ' signal ' + r.signal : '') + (r.error ? ' error ' + r.error.message : ''));
  writeFileSync(SCRATCH + '/progress/step-423-' + label + '-' + name + '.txt', mask((r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || '')));
  return r;
};

// The six frames of IR-SCIENCE.md section 4b-x, and the photographs pressed on the test page as the record research/masks/press-figures.md names them.
const SIX = ['NIR_3461', 'NIR_3466', 'NIR_1644', 'NIR_1827', 'NIR_1651', 'NIR_0627'];
const PRESSED = ['NIR_3742', 'NIR_3729', 'NIR_4095', 'NIR_4079', 'NIR_4045', 'NIR_3705', 'NIR_3710', 'NIR_3205'];

if (stage === 'list') {
  run('owner-list', 'node', ['tools/owner-images.mjs', '--list']);
  run('fresh-dist', 'node', ['tools/fresh-dist.mjs']);
  const index = JSON.parse(readFileSync(APP + '/tools/owner-images.json', 'utf8'));
  for (const stem of SIX.concat(PRESSED)) {
    const hits = index.files.filter((f) => f.name.startsWith(stem + '.')).map((f) => f.name + ' ' + f.size + ' bytes');
    say('in the list: ' + stem + ' -> ' + (hits.length ? hits.join(', ') : 'none'));
  }
} else if (stage === 'fetch') {
  const index = JSON.parse(readFileSync(APP + '/tools/owner-images.json', 'utf8'));
  const names = [];
  for (const stem of SIX.concat(PRESSED)) {
    const raw = index.files.find((f) => f.name === stem + '.NEF');
    const any = raw || index.files.find((f) => f.name.startsWith(stem + '.'));
    if (any) names.push(any.name); else say('not in the list, not fetched: ' + stem);
  }
  for (const n of names) {
    const r = run('fetch-' + n.replace(/\./g, '_'), 'node', ['tools/owner-images.mjs', '--fetch', n]);
    say('  ' + n + ': ' + mask(String(r.stdout || '').trim().split('\n').pop()));
  }
} else {
  say('unknown stage');
}
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
