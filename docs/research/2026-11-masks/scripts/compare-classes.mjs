// classes.mjs: the scene-class kind's coarse masks, drawn again from the kept class maps by the rule of step 438: each class goes to the one name
// whose samples hold the most sample pixels in that class, to no name where no sample falls in it and to no name on a tie; a subject's coarse weight
// is the model's own confidence (softmax of the kept scores brought to the model's input size by the head's own x8 bilinear step) summed over the
// classes it owns, then brought to the picture's size by bilinear interpolation. Nothing else is done to it: the edge stage is step 440's.
// Use: node classes.mjs            for every frame and planted picture the samples file holds, on the open and the natural-hue inputs
// Reads maps-classes/classmaps/<picture>-<input>-logits.npy (150 scores on a grid of 96 by 64, a numpy file of plain float32 numbers), samples.json.
// Writes compare/classes/masks/classes-<input>-<picture>-<subject>.png (the mask file form of inputs.md), compare/classes/index.json (one row for each
// mask: file, kind, variant, input, picture, subject, classes) and compare/classes/empty.txt (how many subject cases the rule leaves empty).
console.log('MADE TO FAIL: the class rule on a built-in 10 by 10 label map, columns 0 to 4 class 3 and columns 5 to 9 class 5 apart from the bottom row which is class 9, with name A sampling the left, name B the right, and each of them sampling three pixels of the bottom row, must give class 3 to A, class 5 to B, class 7 (held by nobody) to no name and class 9 (held equally by both) to no name (known figures 3, 5, 0 and 0)');
console.log('nothing below is trustworthy unless the plant line reads A 3, B 5, none 0, tie 0');

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { writePNG } from '../png.mjs';
import { WHOLE, COMPARE, resizeBilinear, slug, readJSON } from './lib.mjs';

/** Reads a numpy file of float32 numbers. Takes a path; gives { shape, data }. Throws on any other kind. */
export function readNpy(path) {
  const buf = readFileSync(path);
  if (buf[0] !== 147 || buf.toString('latin1', 1, 6) !== 'NUMPY') throw new Error('not a numpy file: ' + path);
  const major = buf[6], hl = major === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8), start = (major === 1 ? 10 : 12);
  const head = buf.toString('latin1', start, start + hl);
  const descr = /'descr':\s*'([^']+)'/.exec(head)[1], fortran = /'fortran_order':\s*(True|False)/.exec(head)[1];
  const shape = /'shape':\s*\(([^)]*)\)/.exec(head)[1].split(',').map((s) => s.trim()).filter(Boolean).map(Number);
  if (descr !== '<f4' || fortran !== 'False') throw new Error('only little-endian float32 in C order is read: ' + descr + ' ' + fortran);
  const n = shape.reduce((a, b) => a * b, 1);
  const copy = buf.buffer.slice(buf.byteOffset + start + hl, buf.byteOffset + start + hl + n * 4);
  return { shape, data: new Float32Array(copy) };
}

/**
 * The owner of each class under the rule. Takes the label map (bytes, w by h), the samples (name, x, y, r as fractions) and the class count.
 * Gives { owner, names, counts }: owner[c] is the index in `names` of the one name whose samples hold the most sample pixels in class c, or -1 where no sample falls in it or two names tie;
 * counts[k][c] is name k's sample pixels in class c. A name's sample pixels are the union of its discs (a pixel counts once for a name).
 */
export function assignClasses(labels, w, h, samples, ncls) {
  const names = [];
  for (const s of samples) if (!names.includes(s.name)) names.push(s.name);
  const counts = names.map(() => new Int32Array(ncls));
  names.forEach((nm, k) => {
    const hit = new Uint8Array(w * h);
    for (const s of samples) {
      if (s.name !== nm) continue;
      const cx = s.x * w, cy = s.y * h, rr = s.r * Math.min(w, h);
      const y0 = Math.max(0, Math.floor(cy - rr - 1)), y1 = Math.min(h - 1, Math.ceil(cy + rr + 1)), x0 = Math.max(0, Math.floor(cx - rr - 1)), x1 = Math.min(w - 1, Math.ceil(cx + rr + 1));
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if ((x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= rr * rr) hit[y * w + x] = 1;
    }
    for (let i = 0; i < w * h; i++) if (hit[i]) counts[k][labels[i]]++;
  });
  const owner = new Int16Array(ncls).fill(-1);
  for (let c = 0; c < ncls; c++) {
    let best = 0, who = -1, tie = false;
    for (let k = 0; k < names.length; k++) {
      const v = counts[k][c];
      if (v > best) { best = v; who = k; tie = false; } else if (v === best && v > 0) tie = true;
    }
    owner[c] = best > 0 && !tie ? who : -1;
  }
  return { owner, names, counts };
}

{
  const lab = new Uint8Array(100);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) lab[y * 10 + x] = y === 9 ? 9 : (x < 5 ? 3 : 5);
  const r = assignClasses(lab, 10, 10, [{ name: 'A', x: 0.2, y: 0.5, r: 0.15 }, { name: 'B', x: 0.8, y: 0.5, r: 0.15 }, { name: 'A', x: 0.25, y: 0.95, r: 0.1 }, { name: 'B', x: 0.75, y: 0.95, r: 0.1 }], 12);
  const nm = (c) => (r.owner[c] < 0 ? 'none' : r.names[r.owner[c]]);
  console.log('plant: class 3 to ' + nm(3) + ', class 5 to ' + nm(5) + ', class 7 to ' + nm(7) + ' ' + (r.owner[7] < 0 ? 0 : 1) + ', class 9 to ' + nm(9) + ' ' + (r.owner[9] < 0 ? 0 : 1));
  console.log('plant: A 3, B 5, none 0, tie 0 expected; read A ' + (r.owner[3] === 0 ? 3 : 'wrong') + ', B ' + (r.owner[5] === 1 ? 5 : 'wrong') + ', none ' + (r.owner[7] < 0 ? 0 : 'wrong') + ', tie ' + (r.owner[9] < 0 ? 0 : 'wrong'));
}

if (process.argv[2] !== 'all') { console.log('use: node classes.mjs all'); process.exit(0); }

const MC = WHOLE + '/maps-classes', OUT = COMPARE + '/classes';
mkdirSync(OUT + '/masks', { recursive: true });
let NAMES = [];
const csv = MC + '/fetched/code1/objectInfo150.csv';
if (existsSync(csv)) NAMES = readFileSync(csv, 'utf8').split('\n').slice(1).filter((l) => l.trim()).map((l) => l.split(',')[5].split(';')[0]);
const SAMPLES = readJSON(WHOLE + '/samples.json');
const FW = 2800, FH = 1864;
const rows = [], empty = { frames: [], planted: [], casesFrames: 0, casesPlanted: 0 };
const t0 = Date.now();

for (const group of ['frames', 'planted']) {
  for (const [pic, entry] of Object.entries(SAMPLES[group])) {
    const samples = entry.sets[0].samples;
    for (const input of ['open', 'natural']) {
      const f = MC + '/classmaps/' + pic + '-' + input + '-logits.npy';
      if (!existsSync(f)) { console.log('no class map for ' + pic + ' ' + input); continue; }
      const { shape, data } = readNpy(f);
      const C = shape[0], h = shape[1], w = shape[2], H = h * 8, W = w * 8, HW = H * W;
      const planes = new Float32Array(C * HW);
      for (let c = 0; c < C; c++) planes.set(resizeBilinear(data.subarray(c * h * w, (c + 1) * h * w), w, h, W, H), c * HW);
      const mx = new Float32Array(HW).fill(-Infinity), lab = new Uint8Array(HW), sm = new Float32Array(HW);
      for (let c = 0; c < C; c++) { const o = c * HW; for (let i = 0; i < HW; i++) { const v = planes[o + i]; if (v > mx[i]) { mx[i] = v; lab[i] = c; } } }
      for (let c = 0; c < C; c++) { const o = c * HW; for (let i = 0; i < HW; i++) sm[i] += Math.exp(planes[o + i] - mx[i]); }
      const { owner, names } = assignClasses(lab, W, H, samples, C);
      names.forEach((subject, k) => {
        const mine = [];
        for (let c = 0; c < C; c++) if (owner[c] === k) mine.push(c);
        const wgt = new Float32Array(HW);
        for (const c of mine) { const o = c * HW; for (let i = 0; i < HW; i++) wgt[i] += Math.exp(planes[o + i] - mx[i]) / sm[i]; }
        const big = resizeBilinear(wgt, W, H, FW, FH), bytes = new Uint8Array(FW * FH);
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.round(255 * Math.max(0, Math.min(1, big[i])));
        const file = OUT + '/masks/classes-' + input + '-' + pic + '-' + slug(subject) + '.png';
        writePNG(file, FW, FH, 1, bytes);
        const cl = mine.map((c) => NAMES[c] || String(c));
        rows.push({ file, kind: 'scene-class', variant: 'each class to the name with the most sample pixels in it', input, picture: pic, subject, classes: cl, empty: mine.length === 0 });
        if (group === 'frames') empty.casesFrames++; else empty.casesPlanted++;
        if (!mine.length) empty[group].push(pic + ' ' + input + ' ' + subject);
      });
      console.log(pic + ' ' + input + ': ' + names.map((n, k) => n + ' ' + (Array.from(owner).filter((o) => o === k).length) + ' classes').join(', ') + ' (' + ((Date.now() - t0) / 1000).toFixed(0) + ' s)');
    }
  }
}
writeFileSync(OUT + '/index.json', JSON.stringify(rows, null, 1));
const total = empty.casesFrames + empty.casesPlanted, emptyAll = empty.frames.length + empty.planted.length;
const lines = ['The rule leaves ' + emptyAll + ' of ' + total + ' subject cases empty: ' + empty.frames.length + ' of ' + empty.casesFrames + ' on the frames and ' + empty.planted.length + ' of ' + empty.casesPlanted + ' on the planted pictures (a case is a picture, an input and a subject sampled).',
  'Frames: ' + (empty.frames.join('; ') || 'none'), 'Planted: ' + (empty.planted.join('; ') || 'none')];
writeFileSync(OUT + '/empty.txt', lines.join('\n') + '\n');
for (const l of lines) console.log(l);
console.log('index: ' + OUT + '/index.json (' + rows.length + ' masks)');
process.exit(0);
