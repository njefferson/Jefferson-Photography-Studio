// step435-runner.mjs: the runner of step 435. Takes one label; holds every tool path and flag inside itself.
// The label is a stage name followed by a number (a new label each run). Each child runs with the folder it needs as its working
// folder; each child's whole output is kept in its own file under progress/, and this run's summary in progress/step-435-<label>.txt.
// Exits 0 whatever its children do.
import { spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const S = SCRATCH + '/scratch';
const WHOLE = SCRATCH + '/research/whole';
const OUT = WHOLE + '/maps-points';
const RT = SCRATCH + '/rt435';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const num = Number((label.match(/[0-9]+$/) || ['0'])[0]);
const summary = SCRATCH + '/progress/step-435-' + label + '.txt';

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const ID = SCRATCH.split('/')[4];
const mask = (t) => String(t).split(ID).map((part) => part.replace(/[0-9a-fA-F]{7,}/g, 'masked')).join(ID);

const st = statfsSync(SCRATCH);
say('free megabytes on the scratchpad disk: ' + Math.floor((st.bavail * st.bsize) / (1024 * 1024)));
say('California time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
say('node: ' + process.version);

const plant = spawnSync('node', ['-e', 'process.exit(7)'], { cwd: S, env: process.env, encoding: 'utf8' });
say('plant exit code: ' + plant.status);
say('label: ' + label + ', stage: ' + stage + ', number: ' + num);

mkdirSync(OUT, { recursive: true });

const run = (name, cmd, args, cwd, minutes) => {
  const t0 = Date.now();
  const r = spawnSync(cmd, args, { cwd: cwd || S, env: process.env, encoding: 'utf8', maxBuffer: 1 << 28, timeout: (minutes || 9) * 60 * 1000 });
  const out = SCRATCH + '/progress/step-435-' + label + '-' + name + '.txt';
  say('child ' + name + ' exit code: ' + r.status + (r.signal ? ' signal ' + r.signal : '') + (r.error ? ' error ' + r.error.message : '') + ', seconds ' + ((Date.now() - t0) / 1000).toFixed(1) + ', output ' + out);
  writeFileSync(out, mask((r.stdout || '') + '\n--- stderr ---\n' + (r.stderr || '')));
  return r;
};

if (stage === 'check') {
  for (const f of ['step435-fetch.mjs', 'step435-maps.mjs', 'step435-probe.mjs']) {
    if (!existsSync(S + '/' + f)) { say('not written yet, not checked: ' + f); continue; }
    run('check-' + f.replace(/\./g, '_'), 'node', ['--check', S + '/' + f], S);
  }
} else if (stage === 'slim' || stage === 'mobile') {
  run('fetch', 'node', [S + '/step435-fetch.mjs', stage], S);
} else if (stage === 'rt') {
  // The runtime's node package from npm's registry with npm's switch that runs no install script, into rt435 under the scratchpad.
  run('npm-install', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'onnxruntime-node'], RT);
  say('onnxruntime-node folder: ' + (existsSync(RT + '/node_modules/onnxruntime-node') ? 'present' : 'absent'));
} else if (stage === 'rtweb') {
  run('npm-install-web', 'npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', 'onnxruntime-web'], RT);
  say('onnxruntime-web folder: ' + (existsSync(RT + '/node_modules/onnxruntime-web') ? 'present' : 'absent'));
} else if (stage === 'probe') {
  run('probe', 'node', [S + '/step435-probe.mjs', 'x'], S);
} else if (stage === 'maps') {
  // maps<digit>: the last digit picks the part: 1 frames on open, 2 planted on open, etc. Model and inputs are arguments of the maps script.
  // The number mod 100 picks the part: 1 to 6 SlimSAM (frames then planted, each on open, natural, bright), 7 to 12 MobileSAM the same.
  // A number of 101 to 112 is the same part asked again under a new label.
  const k = ((num - 1) % 100) % 12;
  const model = k < 6 ? 'slim' : 'mobile', set = (k % 6) < 3 ? 'frames' : 'planted', inp = ['open', 'natural', 'bright'][k % 3];
  const args = [S + '/step435-maps.mjs', model, set, inp];
  run('maps-' + model + '-' + set + '-' + inp, 'node', args, S, 9.5);
} else if (stage === 'maptest') {
  // One picture only, to see the instrument before the long runs: 1 SlimSAM planted open on plant-straight, 2 MobileSAM the same.
  run('maptest', 'node', [S + '/step435-maps.mjs', num === 1 ? 'slim' : 'mobile', 'planted', 'open', 'plant-straight'], S, 9.5);
} else if (stage === 'score') {
  const samples = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
  const SLUG = { 'Sky': 'sky', 'Foliage': 'foliage', 'Built things': 'built', 'Water': 'water' };
  const rows = [];
  const means = {};
  let all = '';
  for (const model of ['slimsam', 'mobilesam']) for (const way of ['joint', 'each']) for (const name of Object.keys(samples.planted)) {
    const subjects = [...new Set(samples.planted[name].sets[0].samples.map((s) => s.name))];
    for (const inp of ['open', 'natural', 'bright']) for (const subj of subjects) {
      const m = OUT + '/' + model + '-' + way + '-' + inp + '-' + name + '-' + SLUG[subj] + '.png';
      if (!existsSync(m)) { say('no mask: ' + m.split('/').pop()); continue; }
      const r = spawnSync('node', [WHOLE + '/score.mjs', m, WHOLE + '/planted/' + name + '-truth.png', subj], { cwd: WHOLE, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120000 });
      const t = r.stdout || '';
      all += '=== ' + model + ' ' + way + ' ' + name + ' ' + inp + ' ' + subj + ' exit ' + r.status + '\n' + t + (r.stderr ? '--- stderr ---\n' + r.stderr : '') + '\n';
      const g = (re) => { const x = re.exec(t); return x ? x[1] : 'not read'; };
      const plantOk = /plant: overlap over union 0\.8750, widest band 6/.test(t) ? 'plant read 0.8750 and 6' : 'PLANT NOT AS KNOWN';
      const iou = g(/overlap over union at a half: ([0-9.]+)/);
      const k = model + ' ' + way + ' ' + inp;
      (means[k] = means[k] || []).push(Number(iou));
      rows.push('- ' + model + ', ' + way + ', ' + inp + ', ' + name + ', ' + subj + ': subject taken ' + g(/subject taken: ([0-9.]+)/) + ', else taken ' + g(/else taken: ([0-9.]+)/) +
        ', overlap over union at a half ' + iou + ' (soft ' + g(/\(soft: ([0-9.]+)\)/) + '), widest band ' + g(/widest band along the boundary: ([0-9]+) px/) +
        ' px (' + g(/px \(([0-9,]+) wrong pixels touching/) + ' wrong pixels touching the boundary, ' + g(/, ([0-9,]+) wrong pixels apart from it/) + ' apart from it); ' + plantOk + '; exit ' + r.status);
    }
  }
  const meanLines = Object.keys(means).map((k) => '- ' + k + ': mean overlap over union ' + (means[k].reduce((a, b) => a + b, 0) / means[k].length).toFixed(4) + ' over ' + means[k].length + ' planted masks');
  writeFileSync(SCRATCH + '/progress/step-435-' + label + '-all.txt', mask(all));
  writeFileSync(OUT + '/scores.md', '# Scores of the masks of the models prompted by points on the planted pictures (step 435)\n\nEach line: model, way (joint: all of a subject\'s sample centres in one prompt; each: one prompt for each sample, joined by the larger value), input, planted picture, subject, then the figures score.mjs printed against the truth step 423 wrote before any method ran. The whole output of every run is kept in progress/step-435-' + label + '-all.txt.\n\n' + rows.join('\n') + '\n\n## Mean overlap over union at a half, planted pictures, for each model, way and input\n\n' + meanLines.join('\n') + '\n');
  for (const l of meanLines) say(l);
  say('rows written: ' + rows.length);
} else if (stage === 'contact') {
  // contact1: MobileSAM joint (the highest mean); contact2: SlimSAM joint (its best), each over the eight frames.
  const model = num % 2 === 1 ? 'mobilesam' : 'slimsam';
  run('contact-' + model, 'node', [S + '/step435-contact.mjs', model, 'joint'], S, 9.5);
} else if (stage === 'sheets') {
  // sheets: arguments by number: the model, way and input the contact pictures draw come from the file sheets-pick.json in progress/.
  const pick = JSON.parse(readFileSync(SCRATCH + '/progress/step-435-pick.json', 'utf8'));
  const samples = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
  const SLUG = { 'Sky': 'sky', 'Foliage': 'foliage', 'Built things': 'built', 'Water': 'water' };
  mkdirSync(OUT + '/sheets', { recursive: true });
  let all = '';
  const stems = Object.keys(samples.frames);
  const part = num === 1 ? stems.slice(0, 4) : num === 2 ? stems.slice(4) : [];
  for (const stem of part) {
    const subjects = [...new Set(samples.frames[stem].sets[0].samples.map((s) => s.name))];
    for (const inp of ['open', 'natural', 'bright']) for (const subj of subjects) {
      const m = OUT + '/' + pick.model + '-' + pick.way + '-' + inp + '-' + stem + '-' + SLUG[subj] + '.png';
      const o = OUT + '/sheets/' + pick.model + '-' + pick.way + '-' + inp + '-' + stem + '-' + SLUG[subj];
      const f = WHOLE + '/frames/' + stem + '-' + inp + '.png';
      if (!existsSync(m) || !existsSync(f)) { say('missing: ' + m.split('/').pop() + ' or its frame'); continue; }
      const r = spawnSync('node', [WHOLE + '/sheet.mjs', f, m, o, pick.model.toUpperCase() + ' ' + pick.way, inp, stem, subj], { cwd: WHOLE, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 120000 });
      all += '=== ' + stem + ' ' + inp + ' ' + subj + ' exit ' + r.status + '\n' + (r.stdout || '') + (r.stderr ? '--- stderr ---\n' + r.stderr : '') + '\n';
      say('sheet ' + stem + ' ' + inp + ' ' + subj + ': exit ' + r.status + (/plant: 50\.0 percent, 200/.test(r.stdout || '') ? ', plant read 50.0 and 200' : ', PLANT NOT AS KNOWN'));
    }
  }
  writeFileSync(SCRATCH + '/progress/step-435-' + label + '-all.txt', mask(all));
} else {
  say('unknown stage');
}
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
