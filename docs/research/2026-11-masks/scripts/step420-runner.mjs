import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, readFileSync } from 'node:fs';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const APP = '/home/user/Jefferson-Photography-Studio';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const summary = SCRATCH + '/progress/step-420-' + label + '.txt';

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
  writeFileSync(SCRATCH + '/progress/step-420-' + label + '-' + name + '.txt', mask(strip(r.stdout || '') + '\n--- stderr ---\n' + strip(r.stderr || '')));
  return r;
};

const CHECKS = ['typecheck', 'preview-version-check', 'manifest-shots-check', 'hub-surface-gates', 'notes-check', 'hub-pin-check', 'token-check', 'palette-spec-check', 'lens-store-check', 'lens-diagnostic-check', 'join-fold-check', 'contract-check', 'architecture-check', 'decisions-check', 'scope-check', 'stamp-check', 'one-pool-check', 'patch-note-check', 'roadmap-copy-check', 'pool-budget-check', 'shadow-cast-check', 'keepfile-check', 'openable-check', 'mask-turn-check'];

if (stage === 'build') {
  run('build', 'npm', ['run', 'build']);
  run('architecture-write', 'node', ['tools/architecture-check.mjs', '--write']);
  for (const c of CHECKS) run(c, 'node', ['tools/' + c + '.mjs']);
} else if (stage === 'arch') {
  // After the new file is staged: the module map's write again, then the two checks that read tracked files.
  run('architecture-write', 'node', ['tools/architecture-check.mjs', '--write']);
  for (const c of ['architecture-check', 'contract-check', 'typecheck']) run(c, 'node', ['tools/' + c + '.mjs']);
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
  writeFileSync(SCRATCH + '/diff-staged-8.txt', mask(a.stdout || ''));
  writeFileSync(SCRATCH + '/diff-unstaged-8.txt', mask(b.stdout || ''));
  say('staged diff lines: ' + (a.stdout || '').split('\n').length + ', unstaged diff lines: ' + (b.stdout || '').split('\n').length);
} else if (stage === 'record') {
  const text = readFileSync(SCRATCH + '/scope-verdict-8.txt', 'utf8');
  const first = text.split('\n')[0];
  say('verdict first line: ' + first);
  const lr = readFileSync(SCRATCH + '/scope-lines-read-8.txt', 'utf8').trim();
  say('lines read: ' + lr);
  run('record', 'node', ['tools/plan-scope-check.mjs', '--repo=' + APP, '--record', '--verdict=' + first, '--lines-read=' + lr], text);
} else if (stage === 'commit') {
  const subject = 'New: the test page makes a mask from your samples, draws it over the photograph, and tries a mask kept from another photograph before you keep it';
  const body = 'Each placed name gets its mask in more than one rendering, with the share of each name it takes. A mask kept from another photograph is listed whether or not its name is placed, and is redone by samples.';
  run('commit', 'git', ['-C', APP, 'commit', '-m', subject, '-m', body]);
  run('log', 'git', ['-C', APP, 'log', '-1']);
} else {
  say('unknown stage');
}
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
