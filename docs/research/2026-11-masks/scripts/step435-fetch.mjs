// step435-fetch.mjs: step 435's fetcher. Takes one label; holds its four addresses inside itself; asks each once with curl through
// the session's own network, follows a redirect and prints the host and path it led to (never the signed query); writes each body
// as returned under the scratchpad's models435 folder. Prints the status and the bytes. Exits 0 whatever it finds.
import { spawnSync } from 'node:child_process';
import { writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

console.log('MADE TO FAIL: the planted file below holds 5 bytes and the instrument must report 5 (known figure 5)');
console.log('MADE TO FAIL: the planted address at plant.invalid must fail with a curl exit other than 0');
console.log('nothing below is trustworthy unless the plant read 5 and the planted address failed');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const MODELS = SCRATCH + '/models435';
mkdirSync(MODELS, { recursive: true });
const label = process.argv[2] || 'nolabel';
const HF = 'https://huggingface.co/';

const GROUPS = {
  slim: [
    [HF + 'Xenova/slimsam-77-uniform/resolve/main/onnx/vision_encoder.onnx', 'slimsam/vision_encoder.onnx'],
    [HF + 'Xenova/slimsam-77-uniform/resolve/main/onnx/prompt_encoder_mask_decoder.onnx', 'slimsam/prompt_encoder_mask_decoder.onnx'],
  ],
  mobile: [
    [HF + 'Acly/MobileSAM/resolve/main/mobile_sam_image_encoder.onnx', 'mobilesam/mobile_sam_image_encoder.onnx'],
    [HF + 'Acly/MobileSAM/resolve/main/sam_mask_decoder_single.onnx', 'mobilesam/sam_mask_decoder_single.onnx'],
  ],
};

const plantPath = MODELS + '/plant-' + label + '.txt';
writeFileSync(plantPath, 'hello');
console.log('plant bytes read: ' + statSync(plantPath).size);

function fetchOne(url, file) {
  const r = spawnSync('curl', ['-sS', '-L', '--max-time', '540', '-A', 'Mozilla/5.0 (X11; Linux x86_64) research fetcher', '-o', file, '-w', '%{http_code} %{size_download} %{num_redirects} %{url_effective}', url], { encoding: 'utf8' });
  const out = (r.stdout || '').trim().split(' ');
  const eff = out.slice(3).join(' ');
  let where = eff;
  try { const u = new URL(eff); where = u.host + u.pathname; } catch (e) { where = 'unparsed'; }
  return { code: r.status, http: out[0], bytes: out[1], redirects: out[2], where, err: (r.stderr || '').trim().split('\n')[0] };
}

const pl = fetchOne('https://plant.invalid/none', MODELS + '/plant-fail-' + label + '.html');
console.log('plant address result: curl exit ' + pl.code + ', status ' + pl.http + ', err [' + pl.err + ']');

const list = GROUPS[label] || [];
console.log('label ' + label + ' holds ' + list.length + ' addresses');
for (const [url, name] of list) {
  const file = MODELS + '/' + name;
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  if (existsSync(file) && statSync(file).size > 0) { console.log('ALREADY ON DISK, not asked again: ' + name + ' ' + statSync(file).size + ' bytes'); continue; }
  const t0 = Date.now();
  const r = fetchOne(url, file);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const size = existsSync(file) ? statSync(file).size : 0;
  console.log('FETCH ' + name + ': curl exit ' + r.code + ', status ' + r.http + ', bytes ' + r.bytes + ' (on disk ' + size + '), redirects ' + r.redirects + ', ended at ' + r.where + ', seconds ' + secs + (r.err ? ', ERR ' + r.err : '') + ', asked ' + url);
}
console.log('done with ' + list.length + ' addresses');
process.exit(0);
