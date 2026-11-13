// Correction route, step 1: a copy of step3-stage.mjs changed only to read research/whole/samples-added.json, to read its coarse map from masks5/mobilesam-colour-<frame>-<slug>.png and to write to masks5/. Original header follows.
// Step 3, part 1 (cue edge, step 1). Usage: node step3-stage.mjs <frame>. Child of the step 452 runner.
// Decodes the photograph once as countDecode of step452-harness.mjs does, counts the ten cues on the decode (placeDecode, placeCueValues, placeStructureValues on the thinned grid), and for each subject
// of the frame's first sample set reads MobileSAM's coarse map on the colour picture (masks2/mobilesam-colour-<frame>-<slug>.png, byte over 255) and makes two masks by the fixed stage of the plan:
//   way one  sure pixels as sureOf gives them (draw-in 48), labels on the counted grid (sure taken 0, sure left 1, the rest 2), sampleMaskFit with the cue height left out, sampleMaskWeights, each band pixel the fit's
//            weight brought to the frame by bilinear interpolation as cueStage brings it, each sure pixel the map's value, then the plain guided filter, radius 8, regularisation 0.001, guide = placeDecode's light over 255;
//   way two  the same, except only the sure pixels within 144 pixels of the map's edge (the map crossing a half) take part in the fit; the others are labelled rest. Band, weights and filter as in way one.
// Writes masks3/cue-all-<frame>-<slug>.png and masks3/cue-near-<frame>-<slug>.png, one byte a pixel at the frame's size, and masks3/index-<frame>.json (a reason in words where the fit gives no result, and no mask).
// The helpers boxMean, guided, weightedGuided, sureOf and the cue stage's pattern are copied unchanged from R/scripts/refine-lib.mjs (cueStage is split here so that way two can hide sure pixels from the fit).
console.log('MADE TO FAIL: the plain guided filter of a step edge under a guide holding the same step must read 0.00 and 1.00 five pixels either side of it (known figures 0.00 and 1.00), and the weighted filter with every weight one must equal the plain filter (known figure 0.0000 largest difference)');
console.log('MADE TO FAIL: a planted wrong expectation, that the weighted filter leaves the cut at a half where a ramp misplaced by 10 pixels put it, column 110, must be reported as failing (the guide changes at column 100)');
console.log('MADE TO FAIL: a planted map whose edge is misplaced by 20 pixels (half at column 220) over planted cues and a guide whose step lies at column 200 must come back from the stage as this script feeds it (the same function, both ways) cut at a half at column 200 to within 3 pixels (known column 200)');
console.log('nothing below is trustworthy unless the plant lines read 0.00 and 1.00, 0.0000, the planted wrong expectation is reported as failing, and the stage plant reads within 3 of 200 for both ways');
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const OUT = SCRATCH + '/masks5';
const M = await import(SCRATCH + '/scratch/step452-bundle.mjs');
const P = await import(WHOLE + '/png.mjs');
const { distanceTo } = await import(WHOLE + '/edt.mjs');
mkdirSync(OUT, { recursive: true });

const SEP_PIXELS_MAX = 1.2e6;
const LEAVE_OUT = ['height'];
const CELL = 48, NEAR = 144, RADIUS = 8, EPS = 0.001;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const clamp01 = (v) => (v > 0 ? (v < 1 ? v : 1) : 0);

// ---- copied from refine-lib.mjs ----
function boxMean(src, W, H, r, out) {
  const tmp = new Float64Array(W * H);
  const pre = new Float64Array(W + 1);
  for (let y = 0; y < H; y++) {
    const o = y * W;
    for (let x = 0; x < W; x++) pre[x + 1] = pre[x] + src[o + x];
    for (let x = 0; x < W; x++) tmp[o + x] = pre[Math.min(W, x + r + 1)] - pre[Math.max(0, x - r)];
  }
  const cx = new Float64Array(W);
  for (let x = 0; x < W; x++) cx[x] = Math.min(W, x + r + 1) - Math.max(0, x - r);
  const acc = new Float64Array(W);
  for (let y = 0; y <= Math.min(H - 1, r); y++) { const o = y * W; for (let x = 0; x < W; x++) acc[x] += tmp[o + x]; }
  for (let y = 0; y < H; y++) {
    const cy = Math.min(H, y + r + 1) - Math.max(0, y - r), o = y * W;
    for (let x = 0; x < W; x++) out[o + x] = acc[x] / (cx[x] * cy);
    const add = y + r + 1, sub = y - r;
    if (add < H) { const a = add * W; for (let x = 0; x < W; x++) acc[x] += tmp[a + x]; }
    if (sub >= 0) { const s = sub * W; for (let x = 0; x < W; x++) acc[x] -= tmp[s + x]; }
  }
  return out;
}
function guided(I, p, W, H, r, eps) {
  const n = W * H, t = new Float64Array(n);
  const mI = boxMean(I, W, H, r, new Float64Array(n));
  const mp = boxMean(p, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = I[i] * p[i];
  const mIp = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = I[i] * I[i];
  const mII = boxMean(t, W, H, r, new Float64Array(n));
  const a = mIp, b = mII;
  for (let i = 0; i < n; i++) {
    let v = mII[i] - mI[i] * mI[i];
    if (v < 0) v = 0;
    const ai = (mIp[i] - mI[i] * mp[i]) / (v + eps);
    a[i] = ai;
    b[i] = mp[i] - ai * mI[i];
  }
  const mA = boxMean(a, W, H, r, mI), mB = boxMean(b, W, H, r, mp);
  const q = new Float64Array(n);
  for (let i = 0; i < n; i++) q[i] = clamp01(mA[i] * I[i] + mB[i]);
  return q;
}
function weightedGuided(I, p, c, W, H, r, eps) {
  const n = W * H, t = new Float64Array(n);
  const mc = boxMean(c, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * I[i];
  const mI = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * p[i];
  const mp = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * I[i] * p[i];
  const mIp = boxMean(t, W, H, r, new Float64Array(n));
  for (let i = 0; i < n; i++) t[i] = c[i] * I[i] * I[i];
  const mII = boxMean(t, W, H, r, new Float64Array(n));
  const wa = mIp, wb = mII;
  for (let i = 0; i < n; i++) {
    const w = mc[i];
    if (!(w > 1e-9)) { wa[i] = 0; wb[i] = 0; continue; }
    const eI = mI[i] / w, ep = mp[i] / w;
    let v = mII[i] / w - eI * eI;
    if (v < 0) v = 0;
    const ai = (mIp[i] / w - eI * ep) / (v + eps);
    wa[i] = w * ai;
    wb[i] = w * (ep - ai * eI);
  }
  const sA = boxMean(wa, W, H, r, mI), sB = boxMean(wb, W, H, r, mp), sW = boxMean(mc, W, H, r, t);
  const q = new Float64Array(n);
  for (let i = 0; i < n; i++) q[i] = sW[i] > 1e-12 ? clamp01((sA[i] * I[i] + sB[i]) / sW[i]) : clamp01(p[i]);
  return q;
}
function sureOf(p, W, H, cell) {
  const n = W * H;
  const dh = distanceTo(W, H, (i) => !(p[i] >= 0.9));
  const dl = distanceTo(W, H, (i) => !(p[i] <= 0.1));
  const hi = new Uint8Array(n), lo = new Uint8Array(n);
  let nh = 0, nl = 0;
  for (let i = 0; i < n; i++) {
    if (dh[i] > cell) { hi[i] = 1; nh++; }
    if (dl[i] > cell) { lo[i] = 1; nl++; }
  }
  return { hi, lo, nh, nl };
}
function toBytes(q) {
  const b = new Uint8Array(q.length);
  for (let i = 0; i < q.length; i++) b[i] = Math.round(255 * clamp01(q[i]));
  return b;
}
// ---- end of the copies ----

/** Takes a map p (0 to 1) and its size; gives, for every pixel, the distance in pixels to the map's edge: a pixel whose side of a half differs from a 4-neighbour's. A map wholly on one side has no edge and every distance is a huge number. */
function edgeDistance(p, W, H) {
  const seed = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x, s = p[i] >= 0.5;
    if ((x > 0 && (p[i - 1] >= 0.5) !== s) || (x < W - 1 && (p[i + 1] >= 0.5) !== s) || (y > 0 && (p[i - W] >= 0.5) !== s) || (y < H - 1 && (p[i + W] >= 0.5) !== s)) seed[i] = 1;
  }
  return distanceTo(W, H, (i) => seed[i] === 1);
}

/**
 * The stage as this script feeds it. Takes the guide I (0 to 1), the coarse map p, its sure pixels, the counted cues cu ({ cues, cueNames, k, w, h }), the frame size, and nearOk (null for way one, else a Uint8Array that is 1 where a
 * sure pixel may take part in the fit). Gives { q, reason, nSubject, nOther }: q the refined map (Float64Array, 0 to 1) or null with the fit's reason in words; nSubject and nOther the counted pixels each side that took part.
 * What the result must satisfy: each sure pixel of the whole frame keeps the map's value before the filter, whatever the fit read; the band takes the fit's weight; the last step is the plain guided filter under I.
 */
function stage(I, p, sure, cu, W, H, nearOk) {
  const { cues, cueNames, k, w, h } = cu;
  const n = w * h, labels = new Uint8Array(n);
  let nSubject = 0, nOther = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * k * W + x * k, ok = nearOk ? nearOk[i] === 1 : true;
    const l = sure.hi[i] && ok ? 0 : sure.lo[i] && ok ? 1 : 2;
    labels[y * w + x] = l;
    if (l === 0) nSubject++; else if (l === 1) nOther++;
  }
  const rec = M.sampleMaskFit(cues, cueNames, labels, ['subject', 'other', 'rest'], 'subject', 'cue edge', LEAVE_OUT);
  if (typeof rec === 'string' || !rec) return { q: null, reason: 'the fit gave no recipe: ' + String(rec), nSubject, nOther };
  const wt = M.sampleMaskWeights(rec, cues, cueNames);
  if (typeof wt === 'string' || !wt) return { q: null, reason: 'the weights gave no result: ' + String(wt), nSubject, nOther };
  const mid = new Float64Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    const gy = Y / k, y0 = Math.min(h - 1, Math.floor(gy)), y1 = Math.min(h - 1, y0 + 1), fy = Math.min(1, gy - y0);
    for (let X = 0; X < W; X++) {
      const i = Y * W + X;
      if (sure.hi[i] || sure.lo[i]) { mid[i] = p[i]; continue; }
      const gx = X / k, x0 = Math.min(w - 1, Math.floor(gx)), x1 = Math.min(w - 1, x0 + 1), fx = Math.min(1, gx - x0);
      const top = wt[y0 * w + x0] * (1 - fx) + wt[y0 * w + x1] * fx, bot = wt[y1 * w + x0] * (1 - fx) + wt[y1 * w + x1] * fx;
      mid[i] = top * (1 - fy) + bot * fy;
    }
  }
  return { q: guided(I, mid, W, H, RADIUS, EPS), reason: '', nSubject, nOther };
}

// ---- the plants ----
let plantsOk = true;
{
  const W = 60, H = 20, I = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) I[y * W + x] = x >= 30 ? 1 : 0;
  const q = guided(I, I, W, H, 4, 0.001);
  const a = q[10 * W + 25].toFixed(2), b = q[10 * W + 34].toFixed(2);
  console.log('plant step: ' + a + ' ' + b);
  if (a !== '0.00' || b !== '1.00') plantsOk = false;
}
{
  const W = 50, H = 40, I = new Float64Array(W * H), p = new Float64Array(W * H), c = new Float64Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) { I[i] = ((i * 37) % 101) / 100; p[i] = ((i * 53) % 89) / 88; }
  const a = guided(I, p, W, H, 5, 0.01), b = weightedGuided(I, p, c, W, H, 5, 0.01);
  let d = 0;
  for (let i = 0; i < W * H; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  console.log('plant weights one: largest difference ' + d.toFixed(4));
  if (d.toFixed(4) !== '0.0000') plantsOk = false;
}
{
  const W = 200, H = 20, I = new Float64Array(W * H), p = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    I[y * W + x] = x >= 100 ? 0.8 : 0.2;
    p[y * W + x] = Math.min(1, Math.max(0, (x - 80) / 60));
  }
  const sure = sureOf(p, W, H, 8), c = new Float64Array(W * H);
  for (let i = 0; i < W * H; i++) c[i] = sure.hi[i] || sure.lo[i] ? 1 : 0;
  const q = weightedGuided(I, p, c, W, H, 64, 0.001);
  let col = -1;
  for (let x = 0; x < W; x++) if (q[10 * W + x] >= 0.5) { col = x; break; }
  console.log('PLANT: expected (known wrong) the cut at a half at column 110; read column ' + col + '; reported as ' + (col === 110 ? 'NOT FAILING, the instrument cannot be trusted' : 'failing (as it must)'));
  if (col === 110) plantsOk = false;
}
{
  const W = 500, H = 40, n = W * H, p = new Float64Array(n), I = new Float64Array(n);
  const names = [...M.PLACE_CUES, ...M.PLACE_STRUCTURE_CUES];
  const cues = names.map(() => new Float32Array(n).fill(0.1));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    p[i] = Math.min(1, Math.max(0, (x - 210) / 20)); // half at column 220, 20 pixels from the truth
    I[i] = x >= 200 ? 0.8 : 0.2;
    cues[0][i] = (x >= 200 ? 0.8 : 0.2) + ((i * 37) % 101) / 101 * 0.04;
  }
  const cu = { cues, cueNames: names, k: 1, w: W, h: H };
  const sure = sureOf(p, W, H, CELL), dEdge = edgeDistance(p, W, H), near = new Uint8Array(n);
  for (let i = 0; i < n; i++) near[i] = dEdge[i] <= NEAR ? 1 : 0;
  for (const [way, nearOk] of [['one', null], ['two', near]]) {
    const r = stage(I, p, sure, cu, W, H, nearOk);
    let col = -1;
    if (r.q) for (let x = 0; x < W; x++) if (r.q[20 * W + x] >= 0.5) { col = x; break; }
    const good = r.q && Math.abs(col - 200) <= 3;
    console.log('plant stage way ' + way + ': known column 200; map misplaced to 220; column read ' + col + (r.q ? '' : ' (' + r.reason + ')') + '; counted pixels in the fit ' + r.nSubject + ' and ' + r.nOther + '; ' + (good ? 'within 3' : 'NOT within 3'));
    if (!good) plantsOk = false;
  }
}
if (!plantsOk) {
  console.log('STOPPED: a plant read wrong; no mask is made. Nothing is tuned.');
  process.exit(0);
}

/** Takes a frame name; decodes the photograph once as countDecode of step452-harness.mjs does and counts the ten cues on the decode. Gives { W, H, k, w, h, n, cols, rows, light, cues, cueNames }. */
async function countDecode(frame) {
  const meta = JSON.parse(readFileSync(WHOLE + '/frames/' + frame + '-open.json', 'utf8'));
  const { resolve } = await import('/home/user/Jefferson-Photography-Studio/tools/owner-images.mjs');
  const path = await resolve(meta.file);
  const bytes = readFileSync(path);
  const imported = await M.importFile(new File([bytes], meta.file));
  const img = await M.decode({ ...imported, bytes: imported.bytes.slice() });
  const W = img.width, H = img.height;
  if (W !== meta.width || H !== meta.height) throw new Error('the decode of ' + frame + ' is ' + W + ' by ' + H + ' and the kept picture is ' + meta.width + ' by ' + meta.height);
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / SEP_PIXELS_MAX)));
  const w = Math.floor(W / k), h = Math.floor(H / k), n = w * h;
  const cols = new Int32Array(n), rows = new Int32Array(n);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { cols[y * w + x] = x * k; rows[y * w + x] = y * k; }
  const own = M.placeDecode(img, { w, h, k, fromW: W, fromH: H });
  if (own.light.length !== W * H) throw new Error('the light is ' + own.light.length + ' long, not ' + (W * H));
  const eight = M.placeCueValues(own.pixels, own.shares, own.light, W, H, cols, rows);
  const structure = M.placeStructureValues(own.light, W, H, cols, rows);
  return { W, H, k, w, h, n, cols, rows, light: own.light, cues: [...eight, ...structure], cueNames: [...M.PLACE_CUES, ...M.PLACE_STRUCTURE_CUES] };
}

const frame = process.argv[2];
if (!frame) { console.log('use: node step3-stage.mjs <frame>'); process.exit(0); }
try {
  const tAll = Date.now();
  const samplesFile = JSON.parse(readFileSync(WHOLE + '/samples-added.json', 'utf8'));
  const names = M.placeSampleNames(samplesFile.frames[frame].sets[0].samples);
  const subjects = names.slice(0, names.length - 1);
  let t0 = Date.now();
  const c = await countDecode(frame);
  console.log(frame + ': decoded and counted in ' + (Date.now() - t0) + ' ms; ' + c.W + ' by ' + c.H + ', k ' + c.k + ', counted ' + c.n + ', cues ' + c.cueNames.length + '; subjects ' + subjects.join(', '));
  const I = new Float64Array(c.W * c.H);
  for (let i = 0; i < I.length; i++) I[i] = c.light[i] / 255;
  const index = [];
  for (const subject of subjects) {
    const sl = slug(subject);
    const mapFile = SCRATCH + '/masks5/mobilesam-colour-' + frame + '-' + sl + '.png';
    if (!existsSync(mapFile)) { console.log('  ' + subject + ': the coarse map ' + mapFile + ' does not stand'); index.push({ frame, subject, way: 'both', file: null, reason: 'the coarse map does not stand' }); continue; }
    const g = P.readGrey(mapFile);
    if (g.width !== c.W || g.height !== c.H) { console.log('  ' + subject + ': the coarse map is ' + g.width + ' by ' + g.height); index.push({ frame, subject, way: 'both', file: null, reason: 'the coarse map is ' + g.width + ' by ' + g.height }); continue; }
    const p = new Float64Array(c.W * c.H);
    for (let i = 0; i < p.length; i++) p[i] = g.data[i] / 255;
    t0 = Date.now();
    const sure = sureOf(p, c.W, c.H, CELL);
    const dEdge = edgeDistance(p, c.W, c.H), near = new Uint8Array(c.W * c.H);
    for (let i = 0; i < near.length; i++) near[i] = dEdge[i] <= NEAR ? 1 : 0;
    const prep = Date.now() - t0;
    console.log('  ' + subject + ': sure taken ' + sure.nh + ', sure left ' + sure.nl + ' of ' + c.W * c.H + ' (sure pixels and the edge distance took ' + prep + ' ms)');
    for (const [way, id, nearOk] of [['one', 'cue-all', null], ['two', 'cue-near', near]]) {
      t0 = Date.now();
      const r = stage(I, p, sure, c, c.W, c.H, nearOk);
      let entry;
      if (!r.q) {
        entry = { frame, subject, way, id, file: null, reason: r.reason, sureTaken: sure.nh, sureLeft: sure.nl, fitSubject: r.nSubject, fitOther: r.nOther, ms: Date.now() - t0 };
        console.log('    way ' + way + ': NO MASK. ' + r.reason + '; counted pixels in the fit ' + r.nSubject + ' and ' + r.nOther + '; ' + entry.ms + ' ms');
      } else {
        const file = OUT + '/' + id + '-' + frame + '-' + sl + '.png';
        P.writePNG(file, c.W, c.H, 1, toBytes(r.q));
        entry = { frame, subject, way, id, file, reason: '', sureTaken: sure.nh, sureLeft: sure.nl, fitSubject: r.nSubject, fitOther: r.nOther, ms: Date.now() - t0 };
        console.log('    way ' + way + ': ' + file + '; counted pixels in the fit ' + r.nSubject + ' subject and ' + r.nOther + ' other; ' + entry.ms + ' ms');
      }
      index.push(entry);
    }
  }
  writeFileSync(OUT + '/index-' + frame + '.json', JSON.stringify(index, null, 1));
  console.log(frame + ': ' + index.filter((e) => e.file).length + ' masks written, ' + index.filter((e) => !e.file).length + ' without a mask; total ' + (Date.now() - tAll) + ' ms; index ' + OUT + '/index-' + frame + '.json');
} catch (e) {
  console.log('stopped: ' + (e && e.stack ? e.stack : e));
}
process.exit(0);
