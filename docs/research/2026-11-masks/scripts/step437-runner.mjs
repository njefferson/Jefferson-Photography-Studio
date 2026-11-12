// step437-runner.mjs: step 437's labelled runner. Takes one label (a new one each run); the stage is the label less its trailing
// digits. Holds every tool path and flag inside itself; runs each child with the folder it needs as its working folder; keeps each
// child's whole output in progress/step-437-<label>-<child>.txt and writes each child's exit code to progress/step-437-<label>.txt.
// Runs up to four children side by side where each writes its own files. Exits 0 whatever its children do.
import { spawn, spawnSync } from 'node:child_process';
import { statfsSync, writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import os from 'node:os';

console.log('MADE TO FAIL: the plant below is a child that exits 7 and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const R = SCRATCH + '/research/whole';
const S = SCRATCH + '/scratch';
const ORT = SCRATCH + '/ort437';
const MF = R + '/maps-features';
const label = process.argv[2] || 'nolabel';
const stage = label.replace(/[0-9]+$/, '');
const summary = SCRATCH + '/progress/step-437-' + label + '.txt';

const lines = [];
const say = (s) => { lines.push(s); console.log(s); };
const mask = (t) => String(t).replace(/[0-9a-fA-F]{7,}/g, 'masked');

const st = statfsSync(SCRATCH);
say('free megabytes on the scratchpad disk: ' + Math.floor((st.bavail * st.bsize) / (1024 * 1024)));
say('California time: ' + new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));

const plant = spawnSync('node', ['-e', 'process.exit(7)'], { cwd: SCRATCH, env: process.env, encoding: 'utf8' });
say('plant exit code: ' + plant.status);
say('label: ' + label + ', stage: ' + stage);

/** Runs one child to its end; its output goes whole to its own file (outPath where given, else the progress folder). */
function runOne(name, cmd, args, cwd, outPath) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const p = spawn(cmd, args, { cwd, env: process.env });
    const out = [], err = [];
    p.stdout.on('data', (d) => out.push(d));
    p.stderr.on('data', (d) => err.push(d));
    p.on('close', (code) => {
      const secs = ((Date.now() - t0) / 1000).toFixed(1);
      writeFileSync(outPath || SCRATCH + '/progress/step-437-' + label + '-' + name + '.txt', mask(Buffer.concat(out).toString('utf8') + '\n--- stderr ---\n' + Buffer.concat(err).toString('utf8')));
      say('child ' + name + ' exit code: ' + code + ' (' + secs + ' s)');
      resolve(code);
    });
    p.on('error', (e) => { say('child ' + name + ' did not start: ' + e.message); resolve(-1); });
  });
}

/** Runs the children four at a time. Each child is [name, cmd, args, cwd]. */
async function runAll(children, width) {
  let k = 0;
  const lane = async () => { while (k < children.length) { const c = children[k++]; await runOne(...c); } };
  await Promise.all(Array.from({ length: Math.min(width, children.length) }, lane));
}

const NODE = 'node';
const NPM = 'npm';
const INPUTS = ['open', 'natural', 'bright'];
const FRAMES = ['NIR_3461', 'NIR_3466', 'NIR_1827', 'NIR_1651', 'NIR_3742', 'NIR_3705', 'NIR_3710', 'NIR_1873'];
const PLANTED = ['plant-straight', 'plant-stepped', 'plant-curved', 'plant-three', 'plant-shore', 'plant-built-foliage', 'plant-island'];

const children = [];
let width = 1;
if (stage === 'probe') {
  say('total memory megabytes: ' + Math.floor(os.totalmem() / (1024 * 1024)) + ', free: ' + Math.floor(os.freemem() / (1024 * 1024)));
  say('processors: ' + os.cpus().length + ', node ' + process.version + ', platform ' + process.platform + ' ' + process.arch);
  children.push(['npm-version', NPM, ['--version'], SCRATCH]);
} else if (stage.startsWith('fetch-')) {
  children.push(['fetch', NODE, [S + '/step437-fetch.mjs', stage.slice(6)], SCRATCH]);
} else if (stage === 'install-node') {
  children.push(['npm', NPM, ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', ORT, 'onnxruntime-node'], SCRATCH]);
} else if (stage === 'install-web') {
  children.push(['npm', NPM, ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--prefix', ORT, 'onnxruntime-web'], SCRATCH]);
} else if (stage === 'ortcheck') {
  children.push(['ortcheck', NODE, [S + '/step437-ortcheck.mjs', 'model_q4f16.onnx'], S]);
} else if (stage === 'feattest') {
  children.push(['features', NODE, [S + '/step437-features.mjs', 'open', 'NIR_3705'], S]);
} else if (/^feat-(open|natural|bright)-(all|frames|planted|[a-e])$/.test(stage)) {
  const [, input, part] = /^feat-(open|natural|bright)-(all|frames|planted|[a-e])$/.exec(stage);
  const pics = [...FRAMES, ...PLANTED];
  const chosen = part === 'all' ? pics : part === 'frames' ? FRAMES : part === 'planted' ? PLANTED : pics.slice('abcde'.indexOf(part) * 3, 'abcde'.indexOf(part) * 3 + 3);
  children.push(['features', NODE, [S + '/step437-features.mjs', input, ...chosen], S]);
} else if (stage === 'fitplant') {
  children.push(['fit-plant', NODE, [S + '/step437-fit.mjs'], S]);
} else if (stage === 'fit') {
  for (const input of INPUTS) children.push(['fit-' + input, NODE, [S + '/step437-fit.mjs', input], S]);
  width = 3;
} else if (stage === 'score') {
  // The scorer on every planted mask the three part files list, four side by side, each output kept under maps-features/score-out;
  // then the summary child, which writes the index and scores.md.
  mkdirSync(MF + '/score-out', { recursive: true });
  for (const input of INPUTS) {
    const part = MF + '/part-' + input + '.json';
    if (!existsSync(part)) { say('part file missing: ' + part); continue; }
    for (const r of JSON.parse(readFileSync(part, 'utf8')).rows) {
      if (!r.picture.startsWith('plant-')) continue;
      const base = r.file.slice(r.file.lastIndexOf('/') + 1).replace(/\.png$/, '');
      children.push([base, NODE, [R + '/score.mjs', r.file, R + '/planted/' + r.picture + '-truth.png', r.subject], R, MF + '/score-out/' + base + '.txt']);
    }
  }
  say('scorer children: ' + children.length);
  width = 4;
} else if (stage === 'contact-near' || stage === 'contact-linear') {
  const fit = stage.slice(8);
  children.push(['contact-a', NODE, [S + '/step437-contact.mjs', fit, 'frame:NIR_3461', 'frame:NIR_3466', 'frame:NIR_1827'], S]);
  children.push(['contact-b', NODE, [S + '/step437-contact.mjs', fit, 'frame:NIR_1651', 'frame:NIR_3742', 'frame:NIR_3705'], S]);
  children.push(['contact-c', NODE, [S + '/step437-contact.mjs', fit, 'frame:NIR_3710', 'frame:NIR_1873'], S]);
  children.push(['contact-d', NODE, [S + '/step437-contact.mjs', fit, 'pair:NIR_3705:NIR_3710', 'pair:NIR_3461:NIR_3466', 'pair:NIR_3742:NIR_1873'], S]);
  width = 4;
} else {
  say('unknown stage');
}
await runAll(children, width);
if (stage === 'score') await runOne('scores', NODE, [S + '/step437-scores.mjs'], S);
say('done');
writeFileSync(summary, mask(lines.join('\n')) + '\n');
process.exit(0);
