// Correction route, step 1: a copy of step2-models.mjs changed only to read research/whole/samples-added.json, to run MobileSAM on the colour picture only (use: node step5-models.mjs mobile <frame>) and to write to masks5/. Original header follows.
// Step 2, part 2. Usage: node step2-models.mjs <slim|mobile> <frame>. Runs one model on the colour and the grey input picture of one frame (inputs2/<frame>-colour.png and -grey.png, written by step2-inputs.mjs),
// as scratch/step435-maps.mjs runs it: resize to a longest side of 1024 only if the picture's longer side is not 1024 (the triangle filter of step 435), SlimSAM normalised by the preprocessor's mean and spread and
// padded with zero to 1024 by 1024 with the best of three masks, MobileSAM given the resized picture, a padding point of label minus one and the frame's original size. One joint prompt for each subject of the
// frame's first sample set (that subject's sample centres inside, every other name's outside). The logit is brought to the frame's own size (2800 by 1864) and written as one byte, round(255 x sigmoid).
// Files: masks2/<mobilesam|slimsam>-<colour|grey>-<frame>-<subject slug>.png. Exits 0 whatever it finds.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

console.log('MADE TO FAIL: a planted resize of a 2800 by 1864 picture to a longest side of 1024 must give a height of 682 (known figure 682)');
console.log('MADE TO FAIL: a planted logit of 0 must be written as the byte 128 (known figure 128)');
console.log('MADE TO FAIL: a planted bilinear of the 2 by 2 grid 0 10 20 30 to 4 by 4 must read 0 at its first sample and 30 at its last (known figures 0 and 30)');
console.log('MADE TO FAIL: a planted colour pixel 10 200 30 against a grey byte 199 must be reported as one mismatch, and against 200 as none (known figures 1 and 0)');
console.log('nothing below is trustworthy unless the plant lines read 682, 128 and 0 30, and 1 and 0');

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const IN = SCRATCH + '/inputs2';
const OUT = SCRATCH + '/masks5';
const MODELS = SCRATCH + '/models435';
const require = createRequire(SCRATCH + '/rt435/package.json');
const { readRGB, writePNG } = await import(WHOLE + '/png.mjs');
mkdirSync(OUT, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function shapeFor(h, w) { const s = 1024 / Math.max(h, w); return [Math.floor(h * s + 0.5), Math.floor(w * s + 0.5)]; }
function byteOf(l) { return Math.max(0, Math.min(255, Math.round(255 / (1 + Math.exp(-l))))); }
function bilinear(src, h, w, dh, dw) {
  const out = new Float32Array(dh * dw);
  const sy = h / dh, sx = w / dw;
  const x0 = new Int32Array(dw), x1 = new Int32Array(dw), fx = new Float32Array(dw);
  for (let x = 0; x < dw; x++) { let u = (x + 0.5) * sx - 0.5; if (u < 0) u = 0; let a = Math.floor(u); if (a > w - 1) a = w - 1; x0[x] = a; x1[x] = Math.min(a + 1, w - 1); fx[x] = u - a; }
  for (let y = 0; y < dh; y++) {
    let v = (y + 0.5) * sy - 0.5; if (v < 0) v = 0; let b = Math.floor(v); if (b > h - 1) b = h - 1; const b1 = Math.min(b + 1, h - 1), fy = v - b;
    const r0 = b * w, r1 = b1 * w, o = y * dw;
    for (let x = 0; x < dw; x++) {
      const top = src[r0 + x0[x]] * (1 - fx[x]) + src[r0 + x1[x]] * fx[x];
      const bot = src[r1 + x0[x]] * (1 - fx[x]) + src[r1 + x1[x]] * fx[x];
      out[o + x] = top * (1 - fy) + bot * fy;
    }
  }
  return out;
}
function axisWeights(inN, outN) {
  const scale = inN / outN, fs = Math.max(scale, 1), support = fs;
  const res = [];
  for (let i = 0; i < outN; i++) {
    const center = (i + 0.5) * scale;
    let lo = Math.floor(center - support + 0.5); if (lo < 0) lo = 0;
    let hi = Math.floor(center + support + 0.5); if (hi > inN) hi = inN;
    const w = []; let sum = 0;
    for (let x = lo; x < hi; x++) { const d = Math.abs((x + 0.5 - center) / fs); const v = d < 1 ? 1 - d : 0; w.push(v); sum += v; }
    for (let k = 0; k < w.length; k++) w[k] /= sum || 1;
    res.push({ lo, w });
  }
  return res;
}
function resizeRGB(data, w, h, nw, nh) {
  const wx = axisWeights(w, nw), wy = axisWeights(h, nh);
  const tmp = new Float32Array(h * nw * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < nw; x++) {
    const { lo, w: ws } = wx[x]; let r = 0, g = 0, b = 0;
    for (let k = 0; k < ws.length; k++) { const p = (y * w + lo + k) * 3; r += ws[k] * data[p]; g += ws[k] * data[p + 1]; b += ws[k] * data[p + 2]; }
    const o = (y * nw + x) * 3; tmp[o] = r; tmp[o + 1] = g; tmp[o + 2] = b;
  }
  const out = new Float32Array(nh * nw * 3);
  for (let y = 0; y < nh; y++) {
    const { lo, w: ws } = wy[y];
    for (let x = 0; x < nw; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = 0; k < ws.length; k++) { const p = ((lo + k) * nw + x) * 3; r += ws[k] * tmp[p]; g += ws[k] * tmp[p + 1]; b += ws[k] * tmp[p + 2]; }
      const o = (y * nw + x) * 3;
      out[o] = Math.round(r); out[o + 1] = Math.round(g); out[o + 2] = Math.round(b);
    }
  }
  return out;
}
/** Takes RGB bytes of a colour picture and the grey bytes (three equal channels) of the same pixels; gives the number of pixels whose largest colour byte differs from the grey byte. */
function mismatches(col, grey, n) {
  let bad = 0;
  for (let i = 0; i < n; i++) {
    const a = col[3 * i], b = col[3 * i + 1], c = col[3 * i + 2];
    if ((a > b ? (a > c ? a : c) : (b > c ? b : c)) !== grey[3 * i]) bad++;
  }
  return bad;
}
console.log('plant: height ' + shapeFor(1864, 2800)[0] + ', byte ' + byteOf(0) + ', bilinear ' + (() => { const b = bilinear(new Float32Array([0, 10, 20, 30]), 2, 2, 4, 4); return b[0] + ' ' + b[15]; })());
console.log('plant: mismatches ' + mismatches(Uint8Array.from([10, 200, 30]), Uint8Array.from([199, 199, 199]), 1) + ' and ' + mismatches(Uint8Array.from([10, 200, 30]), Uint8Array.from([200, 200, 200]), 1));

const [modelName, frame] = process.argv.slice(2);
if (!frame) { console.log('use: node step2-models.mjs <slim|mobile> <frame>'); process.exit(0); }
let ort;
try { ort = require('onnxruntime-node'); } catch (e) { console.log('not run: the runtime did not load: ' + String(e && e.message).split('\n')[0]); process.exit(0); }
const dir = modelName === 'slim' ? 'slimsam' : 'mobilesam';
const files = modelName === 'slim' ? ['vision_encoder.onnx', 'prompt_encoder_mask_decoder.onnx'] : ['mobile_sam_image_encoder.onnx', 'sam_mask_decoder_single.onnx'];
const MODEL = modelName === 'slim' ? 'slimsam' : 'mobilesam';
let enc, dec;
try {
  enc = await ort.InferenceSession.create(MODELS + '/' + dir + '/' + files[0], { executionProviders: ['cpu'] });
  dec = await ort.InferenceSession.create(MODELS + '/' + dir + '/' + files[1], { executionProviders: ['cpu'] });
} catch (e) { console.log('not run: a model did not load: ' + String(e && e.message).split('\n')[0]); process.exit(0); }
console.log('models loaded: ' + MODEL + ' (' + files.join(', ') + ')');

async function encode(im) {
  const [nh, nw] = shapeFor(im.height, im.width);
  const same = nh === im.height && nw === im.width;
  let small;
  if (same) { small = new Float32Array(im.data.length); for (let i = 0; i < small.length; i++) small[i] = im.data[i]; } else small = resizeRGB(im.data, im.width, im.height, nw, nh);
  const t0 = Date.now();
  if (modelName === 'slim') {
    const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
    const t = new Float32Array(3 * 1024 * 1024);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 3; c++) t[c * 1048576 + y * 1024 + x] = (small[(y * nw + x) * 3 + c] / 255 - mean[c]) / sd[c];
    const r = await enc.run({ pixel_values: new ort.Tensor('float32', t, [1, 3, 1024, 1024]) });
    return { nh, nw, resized: !same, secs: (Date.now() - t0) / 1000, emb: r.image_embeddings, pe: r.image_positional_embeddings };
  }
  const r = await enc.run({ input_image: new ort.Tensor('float32', small, [nh, nw, 3]) });
  return { nh, nw, resized: !same, secs: (Date.now() - t0) / 1000, emb: r.image_embeddings };
}
async function decode(e, H, W, pts, labs) {
  const t0 = Date.now();
  const n = pts.length;
  if (modelName === 'slim') {
    const p = new Float32Array(n * 2);
    pts.forEach((q, i) => { p[2 * i] = q[0] * e.nw; p[2 * i + 1] = q[1] * e.nh; });
    const l = new BigInt64Array(n); labs.forEach((v, i) => { l[i] = BigInt(v); });
    const r = await dec.run({ input_points: new ort.Tensor('float32', p, [1, 1, n, 2]), input_labels: new ort.Tensor('int64', l, [1, 1, n]), image_embeddings: e.emb, image_positional_embeddings: e.pe });
    const sc = r.iou_scores.data; let best = 0; for (let k = 1; k < 3; k++) if (sc[k] > sc[best]) best = k;
    const low = r.pred_masks.data.subarray(best * 65536, (best + 1) * 65536);
    const full = bilinear(low, 256, 256, 1024, 1024);
    const crop = new Float32Array(e.nh * e.nw);
    for (let y = 0; y < e.nh; y++) crop.set(full.subarray(y * 1024, y * 1024 + e.nw), y * e.nw);
    return { logits: bilinear(crop, e.nh, e.nw, H, W), iou: sc[best], pick: best, secs: (Date.now() - t0) / 1000 };
  }
  const p = new Float32Array((n + 1) * 2), l = new Float32Array(n + 1);
  pts.forEach((q, i) => { p[2 * i] = q[0] * e.nw; p[2 * i + 1] = q[1] * e.nh; l[i] = labs[i]; });
  l[n] = -1;
  const r = await dec.run({
    image_embeddings: e.emb, point_coords: new ort.Tensor('float32', p, [1, n + 1, 2]), point_labels: new ort.Tensor('float32', l, [1, n + 1]),
    mask_input: new ort.Tensor('float32', new Float32Array(65536), [1, 1, 256, 256]), has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([H, W]), [2]),
  });
  return { logits: r.masks.data, iou: r.iou_predictions.data[0], pick: 0, secs: (Date.now() - t0) / 1000, dims: r.masks.dims.join('x') };
}

try {
  const samples = JSON.parse(readFileSync(WHOLE + '/samples-added.json', 'utf8'));
  const meta = JSON.parse(readFileSync(WHOLE + '/frames/' + frame + '-open.json', 'utf8'));
  const W = meta.width, H = meta.height; // the frame's own size
  const smp = samples.frames[frame].sets[0].samples;
  const names = []; for (const s of smp) if (!names.includes(s.name)) names.push(s.name);
  console.log(frame + ': first sample set of ' + samples.frames[frame].sets.length + ', ' + smp.length + ' samples, subjects ' + names.join(', ') + '; frame ' + W + ' by ' + H);
  const colour = readRGB(IN + '/' + frame + '-colour.png'), grey = readRGB(IN + '/' + frame + '-grey.png');
  if (colour.width !== grey.width || colour.height !== grey.height) throw new Error('the two inputs differ in size');
  const bad = mismatches(colour.data, grey.data, colour.width * colour.height);
  console.log(frame + ': input pictures ' + colour.width + ' by ' + colour.height + '; contract check from the files, pixels whose largest colour byte differs from the grey byte: ' + bad + (bad ? ' (THE CONTRACT DOES NOT HOLD)' : ' (holds)'));
  let written = 0;
  for (const [kind, im] of [['colour', colour]]) {
    const e = await encode(im);
    console.log('  ' + MODEL + ' ' + kind + ': input ' + im.width + ' by ' + im.height + ', ' + (e.resized ? 'resized to ' + e.nw + ' by ' + e.nh : 'longer side already 1024, no resize (' + e.nw + ' by ' + e.nh + ')') + ', encoder ' + e.secs.toFixed(2) + ' s');
    for (const subj of names) {
      const others = smp.filter((s) => s.name !== subj), mine = smp.filter((s) => s.name === subj);
      const jp = mine.concat(others).map((s) => [s.x, s.y]), jl = mine.map(() => 1).concat(others.map(() => 0));
      const jr = await decode(e, H, W, jp, jl);
      const jb = new Uint8Array(W * H);
      let on = 0;
      for (let i = 0; i < W * H; i++) { jb[i] = byteOf(jr.logits[i]); if (jb[i] >= 128) on++; }
      const file = OUT + '/' + MODEL + '-' + kind + '-' + frame + '-' + slug(subj) + '.png';
      writePNG(file, W, H, 1, jb);
      written++;
      console.log('    ' + subj + ': inside ' + mine.length + ', outside ' + others.length + ', predicted ' + jr.iou.toFixed(3) + (modelName === 'slim' ? ' (mask ' + jr.pick + ')' : ', logits ' + jr.dims) + ', decode ' + jr.secs.toFixed(2) + ' s, ' + (on / (W * H) * 100).toFixed(1) + ' percent at a half, ' + file);
    }
  }
  console.log(frame + ' ' + MODEL + ': done, ' + written + ' masks written, each ' + W + ' by ' + H + ' one byte a pixel');
} catch (e) {
  console.log('stopped: ' + (e && e.message ? e.message : e));
}
process.exit(0);
