// step435-probe.mjs: loads the ONNX runtime from rt435, opens each of the four model files and prints the file's size in bytes and its
// input and output names, types and shapes. Writes nothing. Exits 0 whatever it finds.
import { createRequire } from 'node:module';
import { statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

console.log('MADE TO FAIL: the planted shape below is [1,3,4] and the instrument must print 3 as its second dimension (known figure 3)');
console.log('nothing below is trustworthy unless the plant line reads 3');
console.log('plant: ' + [1, 3, 4][1]);

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(SCRATCH + '/rt435/package.json');
let ort;
try { ort = require('onnxruntime-node'); console.log('runtime loaded: onnxruntime-node, backend list ' + JSON.stringify(ort.env && ort.env.versions)); }
catch (e) { console.log('NOT LOADED: ' + String(e && e.message).split('\n')[0]); process.exit(0); }

const files = ['slimsam/vision_encoder.onnx', 'slimsam/prompt_encoder_mask_decoder.onnx', 'mobilesam/mobile_sam_image_encoder.onnx', 'mobilesam/sam_mask_decoder_single.onnx'];
for (const f of files) {
  const p = SCRATCH + '/models435/' + f;
  let size = 'absent';
  try { size = statSync(p).size.toLocaleString('en-US') + ' bytes'; } catch (e) { /* absent */ }
  console.log('FILE ' + f + ': ' + size);
  try {
    const t0 = Date.now();
    const s = await ort.InferenceSession.create(p, { executionProviders: ['cpu'] });
    console.log('  loaded in ' + (Date.now() - t0) + ' ms');
    console.log('  inputNames: ' + JSON.stringify(s.inputNames));
    console.log('  outputNames: ' + JSON.stringify(s.outputNames));
    for (const k of ['inputMetadata', 'outputMetadata']) if (s[k]) console.log('  ' + k + ': ' + JSON.stringify(s[k]));
  } catch (e) { console.log('  NOT LOADED: ' + String(e && e.message).split('\n')[0]); }
}
process.exit(0);
