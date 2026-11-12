import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, readFileSync } from 'node:fs';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const APP = '/home/user/Jefferson-Photography-Studio';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const summary = SCRATCH + '/progress/step-400-' + label + '.txt';

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const mask = (t) => String(t).replace(/[0-9a-fA-F]{7,}/g, 'masked');
// Leaves out every line from the owner's messages opener to its closer and writes the count of lines left out in their place.
const strip = (t) => {
  const out = [];
  let inside = false;
  let dropped = 0;
  for (const l of String(t).split('\n')) {
    if (!inside && l.includes('THE OWNER' + "'" + 'S MESSAGES')) { inside = true; dropped++; continue; }
    if (inside) {
      dropped++;
      if (l.includes('--- end of the owner' + "'" + 's messages ---')) { inside = false; out.push('[owner messages left out: ' + dropped + ' lines]'); dropped = 0; }
      continue;
    }
    out.push(l);
  }
  if (inside) out.push('[owner messages left out, no closer seen: ' + dropped + ' lines]');
  return out.join('\n');
};

const st = statfsSync(SCRATCH);
say('free megabytes on the scratchpad disk: ' + Math.floor((st.bavail * st.bsize) / 1048576));
say('California time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

const plant = spawnSync('node', ['-e', 'process.exit(7)'], { cwd: APP, env: process.env, encoding: 'utf8' });
say('plant exit code: ' + plant.status);
say('label: ' + label + ', stage: ' + stage);

const run = (name, cmd, args, input) => {
  const r = spawnSync(cmd, args, { cwd: APP, env: process.env, encoding: 'utf8', maxBuffer: 1 << 28, input });
  say('child ' + name + ' exit code: ' + r.status);
  writeFileSync(SCRATCH + '/progress/step-400-' + label + '-' + name + '.txt', mask(strip((r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''))));
  return r;
};

if (stage === 'checks') {
  for (const c of ['decisions-check', 'notes-check', 'roadmap-copy-check', 'hub-surface-gates']) run(c, 'node', ['tools/' + c + '.mjs']);
} else if (stage === 'scope') {
  const sp = run('scope-plain', 'node', ['tools/plan-scope-check.mjs', '--repo=' + APP]);
  const text = strip(sp.stdout || '');
  const m = /the diff holds ([0-9,]+) lines/.exec(text);
  say('diff lines: ' + (m ? m[1] : 'not found'));
  const b = /base[^\n]*/i.exec(text);
  say('base line: ' + (b ? mask(b[0]) : 'not found'));
} else if (stage === 'diffs') {
  const a = spawnSync('git', ['-C', APP, 'diff', '--cached'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const b = spawnSync('git', ['-C', APP, 'diff'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const c = spawnSync('git', ['-C', APP, 'diff', 'HEAD'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  writeFileSync(SCRATCH + '/diff-staged-5.txt', mask(a.stdout || ''));
  writeFileSync(SCRATCH + '/diff-unstaged-5.txt', mask(b.stdout || ''));
  writeFileSync(SCRATCH + '/diff-head-5.txt', mask(c.stdout || ''));
  say('staged diff lines: ' + (a.stdout || '').split('\n').length + ', unstaged diff lines: ' + (b.stdout || '').split('\n').length + ', head diff lines: ' + (c.stdout || '').split('\n').length);
} else if (stage === 'record') {
  const text = readFileSync(SCRATCH + '/scope-verdict-5.txt', 'utf8');
  const first = text.split('\n')[0];
  say('verdict first line: ' + first);
  const lr = readFileSync(SCRATCH + '/scope-lines-read-5.txt', 'utf8').trim();
  say('lines read: ' + lr);
  run('record', 'node', ['tools/plan-scope-check.mjs', '--repo=' + APP, '--record', '--verdict=' + first, '--lines-read=' + lr], text);
} else if (stage === 'commit') {
  const subject = "Docs: the device's first figures, the field's pages read first-hand, and the record for labelling by samples";
  const body = 'Each page is named with how it was read and each figure with its limits.';
  run('commit', 'git', ['-C', APP, 'commit', '-m', subject, '-m', body]);
  run('log', 'git', ['-C', APP, 'log', '-1']);
} else {
  say('unknown stage');
}
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
