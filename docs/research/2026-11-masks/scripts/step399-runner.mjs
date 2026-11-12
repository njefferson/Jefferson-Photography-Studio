import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync } from 'node:fs';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const APP = '/home/user/Jefferson-Photography-Studio';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const summary = SCRATCH + '/progress/step-399-' + label + '.txt';

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

const run = (name, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: APP, env: process.env, encoding: 'utf8', maxBuffer: 1 << 28 });
  say('child ' + name + ' exit code: ' + r.status);
  writeFileSync(SCRATCH + '/progress/step-399-' + label + '-' + name + '.txt', mask(strip((r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || ''))));
  return r;
};

if (stage === 'checks') {
  for (const c of ['decisions-check', 'notes-check', 'roadmap-copy-check', 'hub-surface-gates']) run(c, 'node', ['tools/' + c + '.mjs']);
} else {
  say('unknown stage');
}
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
