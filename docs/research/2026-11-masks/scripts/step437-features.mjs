// step437-features.mjs: makes and keeps the DINOv2 small features of pictures on one input.
// Use: node step437-features.mjs <input> <picture> [<picture> ...]   (input open, natural or bright; a picture is a frame's stem or a
// planted picture's name). Each picture is brought by area averaging to 1,400 by 938 (half the frame's size, 100 by 67 patches of 14),
// cut into tiles of the model's own size, 224 by 224, that lap by half (stride 112 across and down, the last tile set flush with the
// edge), run in batches of 8, and the 16 by 16 patch tokens of each tile joined into one 67 by 100 grid, each patch the mean of the
// tiles holding it weighted by a pyramid window (its distance from the tile's edge across times down), so a patch near a tile's edge
// counts least. Writes R/maps-features/features/<picture>-<input>.f32 (float32, row by column by 384) and a .json beside it with the
// shape, the model, the runtime and the seconds taken. Exits 0 whatever it finds.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { prep } from './step437-prep.mjs';

console.log('MADE TO FAIL: a planted 224 by 224 picture is one tile, so its joined grid must equal the model\'s own output for it, largest difference 0.000000 (known figure 0)');
console.log('nothing below is trustworthy unless the plant line reads a largest difference of 0.000000');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const R = SCRATCH + '/research/whole';
const OUT = R + '/maps-features/features';
mkdirSync(OUT, { recursive: true });
const MODEL_NAME = 'model_q4f16.onnx';
const MODEL = SCRATCH + '/models437/dinov2-small/' + MODEL_NAME;
const require = createRequire(SCRATCH + '/ort437/package.json');
const ort = require('onnxruntime-node');
const { readRGB } = await import(R + '/png.mjs');

const T = 224, P = 14, G = 16, D = 384, STRIDE = 112, BATCH = 8;
const W = 1400, H = 938, COLS = W / P, ROWS = H / P;

const session = await ort.InferenceSession.create(MODEL, { graphOptimizationLevel: 'all', intraOpNumThreads: 4, executionProviders: ['cpu'] });

function starts(n) {
  const s = [];
  for (let p = 0; p + T <= n; p += STRIDE) s.push(p);
  if (s[s.length - 1] !== n - T) s.push(n - T);
  return s;
}

/** Runs the tiles of a normalised 3 by h by w tensor and joins them into a rows by cols by 384 grid. */
async function featuresOf(tensor, w, h) {
  const xs = starts(w), ys = starts(h), tiles = [];
  for (const y of ys) for (const x of xs) tiles.push([x, y]);
  const cols = w / P, rows = h / P;
  const acc = new Float64Array(rows * cols * D), wsum = new Float64Array(rows * cols);
  const win = new Float64Array(G);
  for (let i = 0; i < G; i++) win[i] = Math.min(i + 0.5, G - i - 0.5);
  const plane = w * h;
  for (let b0 = 0; b0 < tiles.length; b0 += BATCH) {
    const part = tiles.slice(b0, b0 + BATCH), nb = part.length;
    const x = new Float32Array(nb * 3 * T * T);
    part.forEach(([tx, ty], k) => {
      for (let c = 0; c < 3; c++) for (let yy = 0; yy < T; yy++) {
        const src = c * plane + (ty + yy) * w + tx, dst = ((k * 3 + c) * T + yy) * T;
        x.set(tensor.subarray(src, src + T), dst);
      }
    });
    const out = await session.run({ pixel_values: new ort.Tensor('float32', x, [nb, 3, T, T]) });
    const o = out.last_hidden_state.data, ntok = out.last_hidden_state.dims[1];
    part.forEach(([tx, ty], k) => {
      const r0 = ty / P, c0 = tx / P;
      for (let r = 0; r < G; r++) for (let c = 0; c < G; c++) {
        const wt = win[r] * win[c], g = (r0 + r) * cols + (c0 + c), src = (k * ntok + 1 + r * G + c) * D;
        wsum[g] += wt;
        for (let d = 0; d < D; d++) acc[g * D + d] += wt * o[src + d];
      }
    });
  }
  const f = new Float32Array(rows * cols * D);
  for (let g = 0; g < rows * cols; g++) for (let d = 0; d < D; d++) f[g * D + d] = acc[g * D + d] / wsum[g];
  return { f, rows, cols, tiles: tiles.length };
}

{
  const p = { width: T, height: T, data: new Uint8Array(T * T * 3) };
  for (let i = 0; i < T * T; i++) { p.data[3 * i] = (i * 7) % 256; p.data[3 * i + 1] = (i >> 8) % 256; p.data[3 * i + 2] = 90; }
  const t = prep(p, T, T, false).tensor;
  const joined = await featuresOf(t, T, T);
  const direct = (await session.run({ pixel_values: new ort.Tensor('float32', t, [1, 3, T, T]) })).last_hidden_state.data;
  let md = 0;
  for (let g = 0; g < G * G; g++) for (let d = 0; d < D; d++) md = Math.max(md, Math.abs(joined.f[g * D + d] - direct[(1 + g) * D + d]));
  console.log('plant: largest difference ' + md.toFixed(6) + ' over ' + joined.tiles + ' tile');
}

const [input, ...pictures] = process.argv.slice(2);
for (const pic of pictures) {
  const dir = pic.startsWith('plant-') ? R + '/planted' : R + '/frames';
  let file = dir + '/' + pic + '-' + input + '.png';
  if (input === 'bright' && !existsSync(file)) file = R + '/maps-features/bright/' + pic + '-bright.png';
  if (!existsSync(file)) { console.log(pic + ' ' + input + ': NO PICTURE at ' + file); continue; }
  const t0 = Date.now();
  const im = readRGB(file);
  const t = prep(im, W, H, false).tensor;
  const t1 = Date.now();
  const { f, rows, cols, tiles } = await featuresOf(t, W, H);
  const t2 = Date.now();
  writeFileSync(OUT + '/' + pic + '-' + input + '.f32', Buffer.from(f.buffer));
  writeFileSync(OUT + '/' + pic + '-' + input + '.json', JSON.stringify({
    picture: file, size: [im.width, im.height], broughtTo: [W, H], rows, cols, dim: D, layout: 'row, column, feature; float32',
    cellOfFrame: [im.width / cols, im.height / rows], tile: T, stride: STRIDE, tiles, joined: 'mean weighted by a pyramid window',
    model: 'Xenova/dinov2-small onnx/' + MODEL_NAME, runtime: 'onnxruntime-node 1.31.1, CPU, 4 threads',
    secondsPrep: (t1 - t0) / 1000, secondsModel: (t2 - t1) / 1000,
  }, null, 1));
  let s = 0;
  for (let i = 0; i < f.length; i++) s += Math.abs(f[i]);
  console.log(pic + ' ' + input + ': ' + rows + ' by ' + cols + ' by ' + D + ' from ' + tiles + ' tiles; prep ' + ((t1 - t0) / 1000).toFixed(1) + ' s, model ' + ((t2 - t1) / 1000).toFixed(1) + ' s; mean size ' + (s / f.length).toFixed(4) + (input === 'bright' && file.includes('maps-features') ? ' (bright picture made by this step)' : ''));
}
process.exit(0);
