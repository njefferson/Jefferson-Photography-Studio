// Child of the step 428 runner. Usage: node step428-harness.mjs <open|natural> <frames|planted>. Makes the 2.79 recipe's three renderings for every picture of that scope and every named subject, from the kept pictures and the samples file, through the bundle of the four recipe modules.
// Writes masks under research/whole/maps-recipe and an index file for the run there; no raw is decoded, nothing is drawn, no browser. Prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
console.log('MADE TO FAIL: this harness ends with a plant whose expectation is known to be wrong (a subject weight expected to read exactly 1 where the record gives 201 over 202); it must be reported as failing (known figure 0.995049 read)');
console.log('nothing below is trustworthy if the plant is not reported as failing');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const WHOLE = SCRATCH + '/research/whole';
const OUT = WHOLE + '/maps-recipe';
const M = await import(SCRATCH + '/scratch/step428-bundle.mjs');
const P = await import(WHOLE + '/png.mjs');
const input = process.argv[2] || 'open';
const scope = process.argv[3] || 'frames';
const only = process.argv[4] || '';
mkdirSync(OUT, { recursive: true });
mkdirSync(OUT + '/index', { recursive: true });

const SEP_PIXELS_MAX = 1.2e6; // the test page's constant, src/debug.ts line 3014
const LEAVE_OUT = ['height']; // MASK_LEAVE_OUT, src/debug.ts line 4231
const samplesFile = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

// Plant first: the same disjoint pair as step 418, written out here, through the bundle just built.
{
  const N = 200, n = 500, labels = new Uint8Array(n);
  const cn = ['lightness', 'red against green', 'texture at 5'];
  const cues = cn.map(() => new Float32Array(n));
  for (let i = 0; i < n; i++) {
    const l = i < N ? 0 : i < 2 * N ? 1 : 2; labels[i] = l;
    cues[0][i] = l === 0 ? 0.2 : l === 1 ? 0.8 : 0.5; cues[1][i] = 0.1; cues[2][i] = 0.05;
  }
  const r = M.sampleMaskFit(cues, cn, labels, ['sky', 'foliage', 'rest'], 'sky', 'planted one', null);
  const w = typeof r === 'object' ? M.sampleMaskWeights(r, cues, cn) : null;
  const read = w ? w[0] : NaN;
  console.log('PLANT: a subject pixel expected to weigh exactly 1 (known wrong; the record gives 0.995049); read ' + read.toFixed(6) + ' ; reported as ' + (read === 1 ? 'NOT FAILING, the instrument cannot be trusted' : 'failing (as it must)'));
}

const index = [];
let zeroSetPictures = 0;
const todo = [];
if (scope === 'frames') for (const k of Object.keys(samplesFile.frames)) todo.push({ name: k, set: samplesFile.frames[k].sets[0], dir: WHOLE + '/frames', kind: 'frame' });
else for (const k of Object.keys(samplesFile.planted)) todo.push({ name: k, set: samplesFile.planted[k].sets[0], dir: WHOLE + '/planted', kind: 'planted' });

for (const item of todo) {
  if (only && item.name !== only) continue;
  const path = item.dir + '/' + item.name + '-' + input + '.png';
  const t0 = Date.now();
  const im = P.readRGB(path);
  const W = im.width, H = im.height;
  const rgba = new Uint8ClampedArray(W * H * 4);
  const light = new Uint8Array(W * H);
  for (let p = 0, q = 0, s = 0; p < W * H; p++, q += 4, s += 3) {
    const r = im.data[s], g = im.data[s + 1], b = im.data[s + 2];
    rgba[q] = r; rgba[q + 1] = g; rgba[q + 2] = b; rgba[q + 3] = 255;
    light[p] = r > g ? (r > b ? r : b) : (g > b ? g : b);
  }
  // thin(): every k-th pixel of every k-th row
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / SEP_PIXELS_MAX)));
  const w = Math.floor(W / k), h = Math.floor(H / k), n = w * h;
  const tdata = new Uint8ClampedArray(n * 4);
  const cols = new Int32Array(n), rows = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * k * W + x * k) * 4, o = (y * w + x) * 4;
    tdata[o] = rgba[s]; tdata[o + 1] = rgba[s + 1]; tdata[o + 2] = rgba[s + 2]; tdata[o + 3] = 255;
    cols[y * w + x] = x * k; rows[y * w + x] = y * k;
  }
  // no linear camera copy exists for a kept 8-bit picture: the page's own fallback, the drawn channels over 255
  const linear = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { linear[3 * i] = tdata[4 * i] / 255; linear[3 * i + 1] = tdata[4 * i + 1] / 255; linear[3 * i + 2] = tdata[4 * i + 2] / 255; }
  const eight = M.placeCueValues(tdata, linear, light, W, H, cols, rows);
  const structure = M.placeStructureValues(light, W, H, cols, rows);
  const cues = [...eight, ...structure];
  const cueNames = [...M.PLACE_CUES, ...M.PLACE_STRUCTURE_CUES];
  const t1 = Date.now();
  const samples = item.set.samples;
  const names = M.placeSampleNames(samples);
  const got = M.placeSampleLabels(samples, W, H, cols, rows);
  const subjects = names.slice(0, names.length - 1);
  console.log(item.name + ' ' + input + ': ' + W + ' by ' + H + ', k ' + k + ', counted ' + n + ', cues ' + cueNames.length + ' in ' + (t1 - t0) + ' ms; names ' + names.map((nm, i) => nm + ' ' + got.counts[i]).join(', ') + ', overlap ' + got.overlap);
  for (const subject of subjects) {
    const tf = Date.now();
    const rec = M.sampleMaskFit(cues, cueNames, got.labels, names, subject, item.name, LEAVE_OUT);
    if (typeof rec === 'string' || !rec) {
      console.log('  ' + subject + ': no recipe: ' + rec);
      index.push({ picture: item.name, kind: item.kind, input, subject, recipe: 'none', words: String(rec) });
      continue;
    }
    const wts = M.sampleMaskWeights(rec, cues, cueNames);
    if (typeof wts === 'string' || !wts) {
      console.log('  ' + subject + ': no weights: ' + wts);
      index.push({ picture: item.name, kind: item.kind, input, subject, recipe: 'fitted', weights: 'none', words: String(wts) });
      continue;
    }
    const against = rec.others ? rec.others.join('|') : '';
    for (const rendering of M.sampleMaskRenderings()) {
      const v = M.sampleMaskRender(wts, rendering, light, W, H, cols, rows);
      const bytes = new Uint8Array(W * H);
      for (let y = 0; y < H; y++) {
        const gy = Math.min(h - 1, Math.floor(y / k)) * w;
        for (let x = 0; x < W; x++) { const val = v[gy + Math.min(w - 1, Math.floor(x / k))]; bytes[y * W + x] = Math.round(255 * (val < 0 ? 0 : val > 1 ? 1 : val)); }
      }
      const file = OUT + '/' + item.kind + '/recipe-' + slug(rendering) + '-' + input + '-' + item.name + '-' + slug(subject) + '.png';
      mkdirSync(OUT + '/' + item.kind, { recursive: true });
      P.writePNG(file, W, H, 1, bytes);
      let atHalf = 0; for (let i = 0; i < v.length; i++) if (v[i] >= 0.5) atHalf++;
      index.push({ picture: item.name, kind: item.kind, input, subject, rendering, file, against, countedAtHalf: atHalf, counted: v.length });
    }
    console.log('  ' + subject + ': fitted against ' + against + ' in ' + (Date.now() - tf) + ' ms; three renderings written');
  }
}
writeFileSync(OUT + '/index/index-' + input + '-' + scope + (only ? '-' + only : '') + '.json', JSON.stringify(index, null, 1));
console.log('index written: ' + index.length + ' entries');
process.exit(0);
