// step437-fetch.mjs: step 437's fetcher. Takes one group name; holds its addresses inside itself; asks each once with curl through the
// session's own network; follows a redirect and prints the host and path it led to (never a signed query); writes each body as
// returned. Text pages go under research/whole/maps-features/pages (with a copy whose markup is taken out); model files go under the
// scratchpad's models437 folder. A file already on disk is not asked again. Prints the status, the bytes and the first line of a
// short body. Exits 0 whatever it finds.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, statSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

console.log('MADE TO FAIL: the planted file below holds 5 bytes and the instrument must report 5 (known figure 5)');
console.log('MADE TO FAIL: the planted address at plant.invalid must fail with a curl exit other than 0');
console.log('nothing below is trustworthy unless the plant read 5 and the planted address failed');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const PAGES = SCRATCH + '/research/whole/maps-features/pages';
const MODELS = SCRATCH + '/models437';
mkdirSync(PAGES, { recursive: true });
mkdirSync(MODELS, { recursive: true });

const group = process.argv[2] || 'none';
const HF = 'https://huggingface.co/';
const RAW = 'https://raw.githubusercontent.com/';

// Each entry: [address, kind, file name]; kind 'page' is text kept under PAGES, 'model' a binary kept under MODELS.
const GROUPS = {
  search: [
    [HF + 'api/models?search=dinov2-small&limit=100', 'page', 'search-dinov2-small.json'],
    [HF + 'api/models?search=dinov2-small&filter=onnx&limit=100', 'page', 'search-dinov2-small-onnx.json'],
  ],
  listing: [
    [HF + 'api/models/Xenova/dinov2-small/tree/main', 'page', 'xenova-tree-root.json'],
    [HF + 'api/models/Xenova/dinov2-small/tree/main/onnx', 'page', 'xenova-tree-onnx.json'],
    [HF + 'Xenova/dinov2-small/raw/main/README.md', 'page', 'xenova-README.md'],
    [HF + 'Xenova/dinov2-small/raw/main/config.json', 'page', 'xenova-config.json'],
    [HF + 'Xenova/dinov2-small/raw/main/preprocessor_config.json', 'page', 'xenova-preprocessor_config.json'],
  ],
  model: [
    [HF + 'Xenova/dinov2-small/resolve/main/onnx/model_q4f16.onnx', 'model', 'dinov2-small/model_q4f16.onnx'],
  ],
  licence: [
    [HF + 'facebook/dinov2-small/raw/main/README.md', 'page', 'facebook-dinov2-small-README.md'],
    [RAW + 'facebookresearch/dinov2/main/LICENSE', 'page', 'dinov2-LICENSE.txt'],
  ],
};

function decode(s) {
  return s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&#(\d+);/g, (m, d) => String.fromCharCode(Number(d)));
}
function textOf(html) {
  let h = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  h = h.replace(/<\/(p|div|h[1-6]|li|tr|blockquote|section|pre|dt|dd)>/gi, '\n').replace(/<br\s*\/?>/gi, '\n');
  h = h.replace(/<[^>]+>/g, ' ');
  return decode(h).replace(/[ \t]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const plantPath = PAGES + '/plant-' + group + '.txt';
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

const pl = fetchOne('https://plant.invalid/none', PAGES + '/plant-fail-' + group + '.html');
console.log('plant address result: curl exit ' + pl.code + ', status ' + pl.http + ', err [' + pl.err + ']');

const list = GROUPS[group] || [];
console.log('group ' + group + ' holds ' + list.length + ' addresses');
for (const [url, kind, name] of list) {
  const file = (kind === 'model' ? MODELS : PAGES) + '/' + name;
  mkdirSync(file.slice(0, file.lastIndexOf('/')), { recursive: true });
  if (existsSync(file) && statSync(file).size > 0) { console.log('ALREADY ON DISK, not asked again: ' + name + ' ' + statSync(file).size + ' bytes'); continue; }
  const t0 = Date.now();
  const r = fetchOne(url, file);
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  let first = '';
  const size = existsSync(file) ? statSync(file).size : 0;
  if (existsSync(file) && (kind === 'page' || size < 4096)) {
    const body = readFileSync(file, 'utf8');
    const t = /<html/i.test(body) ? textOf(body) : body;
    first = t.split('\n')[0].slice(0, 140);
    if (kind === 'page' && /<html/i.test(body)) writeFileSync(file + '.txt', 'ADDRESS: ' + url + '\nSTATUS: ' + r.http + '\n\n' + t + '\n');
  }
  console.log('FETCH ' + name + ': curl exit ' + r.code + ', status ' + r.http + ', bytes ' + r.bytes + ' (on disk ' + size + '), redirects ' + r.redirects + ', ended at ' + r.where + ', seconds ' + secs + (first ? ', first line [' + first + ']' : '') + (r.err ? ', ERR ' + r.err : '') + ', asked ' + url);
}
console.log('done with ' + list.length + ' addresses');
process.exit(0);
