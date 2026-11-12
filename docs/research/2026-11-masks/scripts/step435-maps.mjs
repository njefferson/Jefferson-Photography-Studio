// step435-maps.mjs: step 435's maps of the models prompted by points, run from ONNX files in node.
// Use: node step435-maps.mjs <slim|mobile> <frames|planted> <inputs, comma list of open,natural,bright> [only: a picture name]
// For each picture of the set and each input: the picture is resized so its longest side is 1024 (a triangle filter widened by the
// shrink, as the picture library's bilinear resize does), encoded once, and for each subject its masks are made two ways:
//   joint: one prompt, all the subject's samples' centres inside, every other name's centres outside;
//   each:  one prompt for each of the subject's samples, that centre inside and the other names' centres outside, the masks joined
//          by the larger weight at each pixel.
// Where a model gives several masks the one it scores best is taken. The model's logit is brought to the picture's size by bilinear
// interpolation before any cut and written as the mask file of inputs.md: one byte a pixel, round(255 x sigmoid(logit)).
// Files: research/whole/maps-points/<model>-<way>-<input>-<picture>-<subject slug>.png, and index.json beside them (merged).
// A bright-only picture not on disk beside the others is made here by the plan's rule under maps-points/inputs-bright and said so.
// Exits 0 whatever it finds.
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readRGB, writePNG } from '../research/whole/png.mjs';

console.log('MADE TO FAIL: a planted resize of a 2800 by 1864 picture to a longest side of 1024 must give a height of 682 (known figure 682)');
console.log('MADE TO FAIL: a planted logit of 0 must be written as the byte 128 (known figure 128)');
console.log('MADE TO FAIL: a planted bilinear of the 2 by 2 grid 0 10 20 30 to 4 by 4 must read 0 at its first sample and 30 at its last (known figures 0 and 30)');
console.log('nothing below is trustworthy unless the three plant lines read 682, 128 and 0 30');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const WHOLE = SCRATCH + '/research/whole';
const OUT = WHOLE + '/maps-points';
const MODELS = SCRATCH + '/models435';
const require = createRequire(SCRATCH + '/rt435/package.json');
mkdirSync(OUT, { recursive: true });
mkdirSync(OUT + '/inputs-bright', { recursive: true });

const SLUG = { 'Sky': 'sky', 'Foliage': 'foliage', 'Built things': 'built', 'Water': 'water' };

/** The size a picture is resized to for a longest side of 1024: [height, width], rounded half up. */
function shapeFor(h, w) { const s = 1024 / Math.max(h, w); return [Math.floor(h * s + 0.5), Math.floor(w * s + 0.5)]; }
/** The byte of a mask file for a logit: round(255 x sigmoid), so a logit of 0 is 128. */
function byteOf(l) { return Math.max(0, Math.min(255, Math.round(255 / (1 + Math.exp(-l))))); }
/** Bilinear interpolation of a h by w float grid to dh by dw, half-pixel centres, edges clamped; returns a Float32Array of dh*dw. */
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
console.log('plant: height ' + shapeFor(1864, 2800)[0] + ', byte ' + byteOf(0) + ', bilinear ' + (() => { const b = bilinear(new Float32Array([0, 10, 20, 30]), 2, 2, 4, 4); return b[0] + ' ' + b[15]; })());

/** Triangle-filter weights for one axis, as the picture library's bilinear resize makes them: for each output index the first input index and the weights. */
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
/** Resizes RGB bytes (w by h) to nw by nh with the triangle filter; returns a Float32Array of nh*nw*3, values 0 to 255, rows top to bottom, channels interleaved. */
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

// ---- the bright-only picture, by the plan's rule, for a picture whose -bright.png is not on disk ----
const KR = 0.2126, KG = 0.7152, KB = 0.0722;
const unitC = (r, g, b) => { const y = KR * r + KG * g + KB * b; const cb = b - y, cr = r - y; const n = Math.hypot(cb, cr); return [cb / n, cr / n]; };
const GREEN = unitC(0, 1, 0), BLUE = unitC(0, 0, 1);
const smooth = (y) => { const t = Math.max(0, Math.min(1, (y - 0.4) / 0.2)); return t * t * (3 - 2 * t); };
/** The natural-hue re-mapping of step 423 with one change: a pixel on the pink side takes the green direction by a weight rising smoothly from 0 at a brightness of 0.40 to 1 at 0.60 and keeps its own chroma by the rest. Returns the new RGB bytes. */
function brightOnly(src, n) {
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) { const R = src[3 * i] / 255, G = src[3 * i + 1] / 255, B = src[3 * i + 2] / 255; const Y = KR * R + KG * G + KB * B, cb = B - Y, cr = R - Y; a += cb * cb; b += cb * cr; c += cr * cr; }
  a /= n; b /= n; c /= n;
  const tr = a + c, det = a * c - b * b, l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det));
  let ax = Math.abs(b) > 1e-12 ? [l1 - c, b] : (a >= c ? [1, 0] : [0, 1]);
  const nn = Math.hypot(ax[0], ax[1]); ax = [ax[0] / nn, ax[1] / nn];
  if (ax[1] - ax[0] < 0) ax = [-ax[0], -ax[1]];
  const out = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    const R = src[3 * i] / 255, G = src[3 * i + 1] / 255, B = src[3 * i + 2] / 255;
    const Y = KR * R + KG * G + KB * B, cb = B - Y, cr = R - Y;
    const t = cb * ax[0] + cr * ax[1];
    const d = t >= 0 ? GREEN : BLUE, m = Math.abs(t);
    let ncb = m * d[0], ncr = m * d[1];
    if (t >= 0) { const wgt = smooth(Y); ncb = wgt * ncb + (1 - wgt) * cb; ncr = wgt * ncr + (1 - wgt) * cr; }
    const r2 = Y + ncr, b2 = Y + ncb, g2 = (Y - KR * r2 - KB * b2) / KG;
    out[3 * i] = Math.max(0, Math.min(255, Math.round(r2 * 255)));
    out[3 * i + 1] = Math.max(0, Math.min(255, Math.round(g2 * 255)));
    out[3 * i + 2] = Math.max(0, Math.min(255, Math.round(b2 * 255)));
  }
  return out;
}
{
  // plant: a bright pink pixel (Y above 0.60) must go green-largest, a dark pink pixel (Y below 0.40) must keep its red-largest colour; teal and pink anchors set the axis.
  const p = new Uint8Array([255, 230, 240, 255, 230, 240, 90, 40, 60, 90, 40, 60, 100, 120, 140]);
  const r = brightOnly(p, 5);
  const big = (i) => (r[3 * i + 1] >= r[3 * i] && r[3 * i + 1] >= r[3 * i + 2] ? 'green' : r[3 * i] >= r[3 * i + 2] ? 'red' : 'blue');
  console.log('plant: bright pink pixel is ' + big(0) + ', dark pink pixel is ' + big(2) + ' (known: green and red)');
}

function inputPath(set, name, inp) {
  const base = WHOLE + '/' + set + '/' + name + '-' + inp + '.png';
  if (inp !== 'bright') return { path: base, made: false };
  if (existsSync(base)) return { path: base, made: false };
  const own = OUT + '/inputs-bright/' + name + '-bright.png';
  if (!existsSync(own)) {
    const op = WHOLE + '/' + set + '/' + name + '-open.png';
    const im = readRGB(op);
    writePNG(own, im.width, im.height, 3, brightOnly(im.data, im.width * im.height));
    console.log('MADE the bright-only picture myself (not on disk beside the others): ' + own);
  }
  return { path: own, made: true };
}

// ---- the runtime and the models ----
const [modelName, setName, inputsArg, only] = process.argv.slice(2);
if (!inputsArg) { console.log('use: node step435-maps.mjs <slim|mobile> <frames|planted> <inputs> [picture]'); process.exit(0); }
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

const samples = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
const recs = setName === 'frames' ? samples.frames : samples.planted;
const folder = setName === 'frames' ? 'frames' : 'planted';
const indexPath = OUT + '/index.json';
const readIndex = () => (existsSync(indexPath) ? JSON.parse(readFileSync(indexPath, 'utf8')) : []);
const logPath = OUT + '/run-log-' + MODEL + '.json';
const runLog = existsSync(logPath) ? JSON.parse(readFileSync(logPath, 'utf8')) : { model: MODEL, runtime: 'onnxruntime-node ' + ort.env.versions.node, pictures: {} };

/** Encodes a picture once; returns what the decoder needs and the picture's sizes. */
async function encode(im) {
  const [nh, nw] = shapeFor(im.height, im.width);
  const small = resizeRGB(im.data, im.width, im.height, nw, nh);
  const t0 = Date.now();
  if (modelName === 'slim') {
    const mean = [0.485, 0.456, 0.406], sd = [0.229, 0.224, 0.225];
    const t = new Float32Array(3 * 1024 * 1024);
    for (let y = 0; y < nh; y++) for (let x = 0; x < nw; x++) for (let c = 0; c < 3; c++) t[c * 1048576 + y * 1024 + x] = (small[(y * nw + x) * 3 + c] / 255 - mean[c]) / sd[c];
    const r = await enc.run({ pixel_values: new ort.Tensor('float32', t, [1, 3, 1024, 1024]) });
    return { nh, nw, secs: (Date.now() - t0) / 1000, emb: r.image_embeddings, pe: r.image_positional_embeddings };
  }
  const r = await enc.run({ input_image: new ort.Tensor('float32', small, [nh, nw, 3]) });
  return { nh, nw, secs: (Date.now() - t0) / 1000, emb: r.image_embeddings };
}
/** One prompt: pts as [x, y] fractions with labels (1 inside, 0 outside); returns { logits: Float32Array of H*W, iou, secs }. */
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
  l[n] = -1; // the padding point the decoder asks for when no box is given
  const r = await dec.run({
    image_embeddings: e.emb, point_coords: new ort.Tensor('float32', p, [1, n + 1, 2]), point_labels: new ort.Tensor('float32', l, [1, n + 1]),
    mask_input: new ort.Tensor('float32', new Float32Array(65536), [1, 1, 256, 256]), has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor('float32', new Float32Array([H, W]), [2]),
  });
  return { logits: r.masks.data, iou: r.iou_predictions.data[0], pick: 0, secs: (Date.now() - t0) / 1000, dims: r.masks.dims.join('x') };
}

const inputs = inputsArg.split(',');
const added = [];
for (const [name, rec] of Object.entries(recs)) {
  if (only && only !== name) continue;
  const smp = rec.sets[0].samples;
  console.log('picture ' + name + ': ' + rec.sets.length + ' set(s) in the samples file, the first used, ' + smp.length + ' samples');
  const names = []; for (const s of smp) if (!names.includes(s.name)) names.push(s.name);
  for (const inp of inputs) {
    const { path, made } = inputPath(folder, name, inp);
    if (!existsSync(path)) { console.log('not made: no picture at ' + path); continue; }
    const im = readRGB(path);
    const H = im.height, W = im.width;
    const e = await encode(im);
    console.log('  ' + name + ' ' + inp + (made ? ' (bright-only made by this step)' : '') + ': ' + W + ' by ' + H + ', resized ' + e.nw + ' by ' + e.nh + ', encoder ' + e.secs.toFixed(2) + ' s');
    const entry = { size: [W, H], resized: [e.nw, e.nh], encoderSeconds: Number(e.secs.toFixed(2)), brightMadeHere: made, masks: {} };
    for (const subj of names) {
      const others = smp.filter((s) => s.name !== subj), mine = smp.filter((s) => s.name === subj);
      // joint
      const jp = mine.concat(others).map((s) => [s.x, s.y]), jl = mine.map(() => 1).concat(others.map(() => 0));
      const jr = await decode(e, H, W, jp, jl);
      const jb = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) jb[i] = byteOf(jr.logits[i]);
      const jf = MODEL + '-joint-' + inp + '-' + name + '-' + SLUG[subj] + '.png';
      writePNG(OUT + '/' + jf, W, H, 1, jb);
      added.push({ file: jf, kind: MODEL, variant: 'joint', input: inp, picture: name, subject: subj });
      // each
      const best = new Float32Array(W * H); // larger weight at each pixel, kept as the logit (sigmoid is increasing, so the larger logit is the larger weight)
      best.fill(-1e9);
      const ious = []; let dsecs = jr.secs;
      for (const s of mine) {
        const r = await decode(e, H, W, [[s.x, s.y]].concat(others.map((o) => [o.x, o.y])), [1].concat(others.map(() => 0)));
        for (let i = 0; i < W * H; i++) if (r.logits[i] > best[i]) best[i] = r.logits[i];
        ious.push(Number(r.iou.toFixed(4))); dsecs += r.secs;
      }
      const eb = new Uint8Array(W * H);
      for (let i = 0; i < W * H; i++) eb[i] = byteOf(best[i]);
      const ef = MODEL + '-each-' + inp + '-' + name + '-' + SLUG[subj] + '.png';
      writePNG(OUT + '/' + ef, W, H, 1, eb);
      added.push({ file: ef, kind: MODEL, variant: 'each', input: inp, picture: name, subject: subj });
      let lo = 1e9, hi = -1e9; for (let i = 0; i < W * H; i += 997) { if (jr.logits[i] < lo) lo = jr.logits[i]; if (jr.logits[i] > hi) hi = jr.logits[i]; }
      entry.masks[subj] = { inside: mine.length, outside: others.length, jointPredictedIoU: Number(jr.iou.toFixed(4)), eachPredictedIoU: ious, jointLogitRange: [Number(lo.toFixed(2)), Number(hi.toFixed(2))], decodeSeconds: Number(dsecs.toFixed(2)), maskDims: jr.dims || '' };
      console.log('    ' + subj + ': inside ' + mine.length + ', outside ' + others.length + ', joint predicted ' + jr.iou.toFixed(3) + ' (logit range ' + lo.toFixed(1) + ' to ' + hi.toFixed(1) + (jr.pick !== undefined && modelName === 'slim' ? ', mask ' + jr.pick : '') + '), each predicted ' + JSON.stringify(ious) + ', decodes ' + dsecs.toFixed(2) + ' s');
    }
    runLog.pictures[name + '-' + inp] = entry;
    writeFileSync(logPath, JSON.stringify(runLog, null, 1));
  }
}
const keep = readIndex().filter((x) => !added.some((a) => a.file === x.file));
writeFileSync(indexPath, JSON.stringify(keep.concat(added), null, 1));
console.log('done: ' + added.length + ' masks written; index.json holds ' + (keep.length + added.length));
process.exit(0);
