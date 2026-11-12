// step423-plant.mjs: the planted pictures. Each is joined, at the frames' own size, from windows of real frames that hold one kind of
// thing only (chosen by eye on the opened frames), each window filled out to its region by mirror tiling, along a boundary this script
// draws: straight, stepped or curved. The truth is written FIRST, for every picture, before any picture or sample: truth/<name>-truth.png
// (grey, each pixel its region's number) and <name>-truth.json (number to name). Then <name>-open.png from the frames as they open and
// <name>-natural.png from their natural-hue pictures, the same windows and boundary, and samples placed well inside each region.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readRGB, writePNG, readGrey } from '../research/whole/png.mjs';
import { distanceTo } from '../research/whole/edt.mjs';

console.log('MADE TO FAIL: a planted 40 by 40 truth split at x 25 must give a sample for the left region at x 12, since that is the point farthest inside it (known figure 12)');
console.log('nothing below is trustworthy unless the planted line reads a left sample at 12');

const W0 = dirname(dirname(fileURLToPath(import.meta.url))) + '/research/whole';
const P = W0 + '/planted';
mkdirSync(P, { recursive: true });
const W = 2800, H = 1864, SHORT = Math.min(W, H);

// Windows holding one kind only: frame stem, x, y, width, height in the frame's own pixels.
const WIN = {
  SKY_A: ['NIR_3466', 0, 0, 2800, 700, 'Sky'],
  SKY_B: ['NIR_1827', 0, 0, 2800, 950, 'Sky'],
  SKY_C: ['NIR_1651', 1120, 28, 490, 252, 'Sky'],
  FOL_A: ['NIR_3705', 0, 1484, 2800, 380, 'Foliage'],
  FOL_B: ['NIR_3742', 140, 462, 2240, 518, 'Foliage'],
  FOL_C: ['NIR_1873', 630, 0, 700, 532, 'Foliage'],
  // Moved down and in after the first pictures were opened: the window first chosen (1330, 840, 630 by 462) held the roof's edge and a
  // strip of sky at its top right, which the mirror tiling spread through every built region.
  BLT_A: ['NIR_3466', 1344, 952, 588, 350, 'Built things'],
  WAT_A: ['NIR_1873', 784, 1428, 504, 392, 'Water'],
  WAT_B: ['NIR_3742', 0, 1260, 462, 590, 'Water'],
};
const T = Math.PI * 2;
const steps = (tops, x) => tops[Math.min(tops.length - 1, Math.floor(x / (W / tops.length)))] * H;
// Each planted picture: its boundary kinds, and a function giving the window of the region a pixel lies in.
const PLANTS = {
  'plant-straight': { kinds: 'straight, slanted', at: (x, y) => (y < 0.50 * H + 0.08 * H * (x / W) ? 'SKY_A' : 'FOL_A') },
  'plant-stepped': { kinds: 'stepped', at: (x, y) => (y < steps([0.35, 0.50, 0.42, 0.60, 0.38, 0.55, 0.45, 0.52], x) ? 'SKY_B' : 'BLT_A') },
  'plant-curved': { kinds: 'curved', at: (x, y) => (y < 0.5 * H + 0.12 * H * Math.sin(T * 1.5 * x / W) ? 'SKY_C' : 'FOL_B') },
  'plant-three': { kinds: 'stepped above, straight below', at: (x, y) => (y < steps([0.30, 0.40, 0.34, 0.45, 0.32, 0.42, 0.36, 0.40], x) ? 'SKY_A' : y < 0.78 * H ? 'BLT_A' : 'WAT_B') },
  'plant-shore': { kinds: 'curved', at: (x, y) => (y < 0.55 * H + 0.10 * H * Math.sin(T * x / W + 0.6) + 0.04 * H * Math.sin(T * 3.3 * x / W) ? 'FOL_C' : 'WAT_A') },
  'plant-built-foliage': { kinds: 'straight, slanted', at: (x, y) => (x < 0.45 * W + 0.05 * W * (y / H) ? 'BLT_A' : 'FOL_A') },
  'plant-island': { kinds: 'straight above, curved below', at: (x, y) => (y < 0.30 * H ? 'SKY_B' : y < 0.68 * H + 0.10 * H * Math.sin(T * 2 * x / W) ? 'FOL_C' : 'WAT_A') },
};

/** Up to `n` samples inside region `code` of a label array, the first at the point farthest inside, the rest spread by farthest-point choice. */
function placeInside(lab, w, h, code, n, rFrac, short) {
  const d = distanceTo(w, h, (i) => lab[i] !== code);
  const r = rFrac * short;
  const cand = [];
  let best = 0;
  const stepPx = Math.max(1, Math.round(short / 120));
  for (let y = 0; y < h; y += stepPx) for (let x = 0; x < w; x += stepPx) {
    const i = y * w + x;
    if (lab[i] !== code) continue;
    const e = Math.min(d[i], x + 1, y + 1, w - x, h - y);
    if (e > best) best = e;
    cand.push([x, y, e]);
  }
  const floor = Math.min(0.10 * short, 0.8 * best);
  const ok = cand.filter((c) => c[2] >= floor);
  const chosen = [];
  if (!ok.length) return { samples: [], deepest: best, floor };
  chosen.push(ok.reduce((a, b) => (b[2] > a[2] ? b : a)));
  while (chosen.length < n) {
    let far = null, fd = -1;
    for (const c of ok) {
      const m = Math.min(...chosen.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
      if (m > fd) { fd = m; far = c; }
    }
    if (!far || fd < 2 * r) break;
    chosen.push(far);
  }
  return { samples: chosen.map((c) => ({ x: c[0] / w, y: c[1] / h, r: rFrac, inside: Math.round(c[2]) })), deepest: best, floor };
}

{
  const w = 40, h = 40, lab = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) lab[y * w + x] = x < 25 ? 1 : 2;
  const s = placeInside(lab, w, h, 1, 1, 0.05, 40).samples[0];
  console.log('planted: a left sample at ' + Math.round(s.x * w));
}

// The truth, first, for every picture.
const reflect = (v, n) => { const m = ((v % (2 * n)) + 2 * n) % (2 * n); return m < n ? m : 2 * n - 1 - m; };
const labels = {};
for (const [name, p] of Object.entries(PLANTS)) {
  const keys = [];
  const lab = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = p.at(x + 0.5, y + 0.5);
    let c = keys.indexOf(k);
    if (c < 0) { keys.push(k); c = keys.length - 1; }
    lab[y * W + x] = c + 1;
  }
  const truthPng = P + '/' + name + '-truth.png';
  if (existsSync(truthPng)) {
    // A truth already written is never written again: it is read back and checked to be this picture's.
    const old = readGrey(truthPng);
    let same = old.width === W && old.height === H;
    for (let i = 0; same && i < W * H; i++) if (old.data[i] !== lab[i]) same = false;
    console.log('truth already on disk for ' + name + ', not written again; equal to this boundary: ' + same);
    // The regions stand; only the record of which window filled each region is brought up to date, and only while the regions are equal.
    const tj = JSON.parse(readFileSync(P + '/' + name + '-truth.json', 'utf8'));
    let moved = 0;
    if (same) tj.regions.forEach((r, c) => {
      const k = keys[c], win = { frame: WIN[k][0], x: WIN[k][1], y: WIN[k][2], width: WIN[k][3], height: WIN[k][4] };
      if (JSON.stringify(r.window) !== JSON.stringify(win)) { r.window = win; moved++; }
    });
    if (moved) { writeFileSync(P + '/' + name + '-truth.json', JSON.stringify(tj, null, 1)); console.log('  the window recorded for ' + moved + ' region(s) brought up to date; the regions are unchanged'); }
  } else {
    writePNG(truthPng, W, H, 1, lab);
    const counts = keys.map((_, c) => { let n = 0; for (let i = 0; i < W * H; i++) if (lab[i] === c + 1) n++; return n; });
    writeFileSync(P + '/' + name + '-truth.json', JSON.stringify({
      picture: name, width: W, height: H, boundary: p.kinds,
      regions: keys.map((k, c) => ({ value: c + 1, name: WIN[k][5], window: { frame: WIN[k][0], x: WIN[k][1], y: WIN[k][2], width: WIN[k][3], height: WIN[k][4] }, shareOfPicture: Math.round((counts[c] / (W * H)) * 10000) / 10000 })),
      form: 'the truth picture is grey, one byte a pixel, holding the region value above; written before any picture and before any method',
    }, null, 1));
    console.log('truth written: ' + name + ' (' + p.kinds + '): ' + keys.map((k, c) => WIN[k][5] + ' ' + ((counts[c] / (W * H)) * 100).toFixed(1) + ' percent').join(', '));
  }
  labels[name] = { lab, keys };
}

// The pictures, from the frames as they open and from their natural-hue pictures.
const cache = {};
const src = (stem, kind) => cache[stem + kind] || (cache[stem + kind] = readRGB(W0 + '/frames/' + stem + '-' + kind + '.png'));
for (const kind of ['open', 'natural']) {
  for (const [name, { lab, keys }] of Object.entries(labels)) {
    const out = new Uint8Array(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const [stem, wx, wy, ww, wh] = WIN[keys[lab[y * W + x] - 1]];
      const s = src(stem, kind);
      const sx = wx + reflect(x, ww), sy = wy + reflect(y, wh);
      const o = (y * W + x) * 3, q = (sy * s.width + sx) * 3;
      out[o] = s.data[q]; out[o + 1] = s.data[q + 1]; out[o + 2] = s.data[q + 2];
    }
    writePNG(P + '/' + name + '-' + kind + '.png', W, H, 3, out);
    console.log('picture written: ' + name + '-' + kind + '.png');
  }
}

// The samples, well inside each region, four to a region where it is wide enough.
const all = JSON.parse(readFileSync(W0 + '/samples.json', 'utf8'));
all.planted = {};
for (const [name, { lab, keys }] of Object.entries(labels)) {
  const samples = [];
  keys.forEach((k, c) => {
    const got = placeInside(lab, W, H, c + 1, 4, 0.04, SHORT);
    for (const s of got.samples) samples.push({ name: WIN[k][5], x: Math.round(s.x * 1000) / 1000, y: Math.round(s.y * 1000) / 1000, r: 0.04 });
    console.log('samples: ' + name + ' ' + WIN[k][5] + ': ' + got.samples.length + ', the deepest point ' + Math.round(got.deepest) + ' px inside, each at least ' + Math.round(got.floor) + ' px inside (a radius is ' + Math.round(0.04 * SHORT) + ' px)');
  });
  all.planted[name] = { file: name, sets: [{ from: 'placed by step 423 inside the planted regions, after the truth was written', placedBy: 'step 423', samples }] };
}
writeFileSync(W0 + '/samples.json', JSON.stringify(all, null, 1));
console.log('samples written for ' + Object.keys(all.planted).length + ' planted pictures');
process.exit(0);
