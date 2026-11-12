// step437-ortcheck.mjs: loads the fetched ONNX file of DINOv2 small in the ONNX runtime's node package, prints what the file takes and
// gives, runs it once at 224 by 224 and once on one frame at 1,400 by 938, and prints the shapes and times. Writes nothing.
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { prep } from './step437-prep.mjs';

console.log('MADE TO FAIL: a 224 by 224 input must give 257 tokens (1 + 16 by 16) of 384 numbers each (known figure 257)');
console.log('MADE TO FAIL: the planted 4 by 2 picture of 0, 255, 0, 255 ... must area-halve to two pixels of 127.5 (known figure 127.5)');
console.log('nothing below is trustworthy unless the token line reads 257 by 384 and the plant reads 127.5');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const MODEL = SCRATCH + '/models437/dinov2-small/' + (process.argv[2] || 'model_q4f16.onnx');
const require = createRequire(SCRATCH + '/ort437/package.json');
const ort = require('onnxruntime-node');

{
  const p = { width: 4, height: 2, data: new Uint8Array(24) };
  for (let i = 0; i < 8; i++) for (let c = 0; c < 3; c++) p.data[3 * i + c] = i % 2 ? 255 : 0;
  const t = prep(p, 2, 1, true);
  console.log('plant: ' + t.raw[0].toFixed(1) + ' and ' + t.raw[1].toFixed(1));
}

console.log('model file: ' + MODEL + ', bytes ' + statSync(MODEL).size.toLocaleString('en-US'));
let session;
try {
  const t0 = Date.now();
  session = await ort.InferenceSession.create(MODEL, { graphOptimizationLevel: 'all', intraOpNumThreads: 4, executionProviders: ['cpu'] });
  console.log('loaded in ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s; inputs ' + session.inputNames.join(', ') + '; outputs ' + session.outputNames.join(', '));
  if (session.inputMetadata) console.log('input metadata: ' + JSON.stringify(session.inputMetadata));
  if (session.outputMetadata) console.log('output metadata: ' + JSON.stringify(session.outputMetadata));
} catch (e) {
  console.log('NOT LOADED: ' + String(e && e.message || e).split('\n').slice(0, 6).join(' | '));
  process.exit(0);
}

async function runAt(name, w, h, rgb) {
  const x = rgb ? prep(rgb, w, h, false).tensor : new Float32Array(3 * w * h);
  const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', x, [1, 3, h, w]) };
  try {
    const t0 = Date.now();
    const out = await session.run(feeds);
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    for (const k of session.outputNames) console.log(name + ': output ' + k + ' type ' + out[k].type + ' dims ' + out[k].dims.join(' by ') + ' in ' + secs + ' s');
    const o = out[session.outputNames[0]];
    console.log(name + ': tokens ' + o.dims[1] + ' by ' + o.dims[2]);
    let s = 0, nn = 0;
    for (let i = 0; i < Math.min(o.data.length, 384 * 50); i++) { const v = Number(o.data[i]); if (Number.isFinite(v)) { s += Math.abs(v); nn++; } }
    console.log(name + ': mean size of the first fifty tokens ' + (s / Math.max(1, nn)).toFixed(4) + ', finite ' + nn + ' of ' + Math.min(o.data.length, 384 * 50));
    return o;
  } catch (e) {
    console.log(name + ': NOT RUN: ' + String(e && e.message || e).split('\n').slice(0, 6).join(' | '));
    return null;
  }
}

await runAt('blank 224', 224, 224, null);
const { readRGB } = await import(SCRATCH + '/research/whole/png.mjs');
const im = readRGB(SCRATCH + '/research/whole/frames/NIR_3705-open.png');
await runAt('NIR_3705 open at 1400 by 938', 1400, 938, im);
console.log('memory in use megabytes: ' + Math.floor(process.memoryUsage().rss / (1024 * 1024)));
process.exit(0);
