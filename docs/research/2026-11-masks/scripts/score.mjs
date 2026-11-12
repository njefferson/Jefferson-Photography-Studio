// score.mjs: scores one mask against one planted truth for one subject, over every pixel of the picture.
// Use: node score.mjs <mask.png> <truth.png> <subject>
//   mask.png   one value from 0 to 1 for each pixel, as a grey PNG at the picture's size (byte / 255).
//   truth.png  a planted picture's truth (grey, each pixel its region's number); its names are read from the .json beside it
//              (the same path with -truth.png turned to -truth.json).
//   subject    a region's name as the truth's .json gives it (Sky, Foliage, Built things, Water), any letter case.
// Prints, with no file written:
//   subject taken    the mean mask weight over the subject's pixels (0 to 1);
//   else taken       the mean mask weight over every other pixel;
//   overlap/union    with the mask cut at a half: subject pixels taken over (subject pixels plus other pixels taken);
//                    the soft form, the sum of the smaller of weight and truth over the sum of the larger, beside it;
//   widest band      the wrong pixels at a half that touch the truth's boundary, followed through wrong pixels (8-connected):
//                    the farthest of them from the boundary, plus one, in pixels; with the count of those pixels and of the
//                    wrong pixels that do not touch it.
// What it cannot show: anything about a real photograph (it needs a truth), and anything finer than the truth's own boundary.
import { readFileSync, existsSync } from 'node:fs';
import { readGrey } from './png.mjs';
import { distanceTo } from './edt.mjs';

console.log('MADE TO FAIL: on a built-in 100 by 100 truth whose subject is the left half, a mask taking the left half and a band 6 pixels wide beyond it and leaving out a 10 by 10 block inside must read overlap over union 0.8750 and widest band 6 (known figures 0.8750 and 6)');
console.log('nothing below is trustworthy unless the plant line reads 0.8750 and 6');

/** The figures for weights `w` (0 to 1, one per pixel) against a boolean subject `t`, at width by height. */
export function scoreArrays(w, t, width, height) {
  const n = width * height;
  let sw = 0, ns = 0, ow = 0, no = 0, tp = 0, fp = 0, fn = 0, mn = 0, mx = 0;
  for (let i = 0; i < n; i++) {
    const wi = w[i], ti = t[i] ? 1 : 0;
    if (ti) { sw += wi; ns++; } else { ow += wi; no++; }
    const m = wi >= 0.5;
    if (m && ti) tp++; else if (m) fp++; else if (ti) fn++;
    mn += Math.min(wi, ti); mx += Math.max(wi, ti);
  }
  const at = (i) => t[i] ? 1 : 0;
  const bound = new Uint8Array(n);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, v = at(i);
    if ((x > 0 && at(i - 1) !== v) || (x < width - 1 && at(i + 1) !== v) || (y > 0 && at(i - width) !== v) || (y < height - 1 && at(i + width) !== v)) bound[i] = 1;
  }
  const d = distanceTo(width, height, (i) => bound[i] === 1);
  const wrong = (i) => (w[i] >= 0.5) !== (t[i] ? true : false);
  const seen = new Uint8Array(n);
  const stack = [];
  for (let i = 0; i < n; i++) if (bound[i] && wrong(i)) { seen[i] = 1; stack.push(i); }
  let band = 0, bandMax = -1;
  while (stack.length) {
    const i = stack.pop();
    band++;
    if (d[i] > bandMax) bandMax = d[i];
    const x = i % width, y = (i - x) / width;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const X = x + dx, Y = y + dy;
      if (X < 0 || Y < 0 || X >= width || Y >= height) continue;
      const j = Y * width + X;
      if (!seen[j] && wrong(j)) { seen[j] = 1; stack.push(j); }
    }
  }
  let wrongAll = 0;
  for (let i = 0; i < n; i++) if (wrong(i)) wrongAll++;
  return {
    subjectTaken: ns ? sw / ns : 0, elseTaken: no ? ow / no : 0,
    iou: tp + fp + fn ? tp / (tp + fp + fn) : 0, softIou: mx ? mn / mx : 0,
    widestBand: bandMax < 0 ? 0 : Math.round(bandMax) + 1, bandPixels: band, wrongElsewhere: wrongAll - band,
    tp, fp, fn, subjectPixels: ns, otherPixels: no,
  };
}

const fmt = (v) => v.toLocaleString('en-US');
{
  const W = 100, H = 100, w = new Float64Array(W * H), t = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = y * W + x;
    t[i] = x < 50 ? 1 : 0;
    w[i] = x < 56 && !(x >= 10 && x < 20 && y >= 40 && y < 50) ? 1 : 0;
  }
  const s = scoreArrays(w, t, W, H);
  console.log('plant: overlap over union ' + s.iou.toFixed(4) + ', widest band ' + s.widestBand);
}

const [maskPath, truthPath, subject] = process.argv.slice(2);
if (maskPath && truthPath && subject) {
  const jsonPath = truthPath.replace(/-truth\.png$/, '-truth.json');
  if (!existsSync(maskPath) || !existsSync(truthPath) || !existsSync(jsonPath)) {
    console.log('not scored: a file is missing (' + [maskPath, truthPath, jsonPath].filter((p) => !existsSync(p)).join(', ') + ')');
    process.exit(0);
  }
  const m = readGrey(maskPath), tr = readGrey(truthPath);
  const names = JSON.parse(readFileSync(jsonPath, 'utf8')).regions;
  const want = names.filter((r) => r.name.toLowerCase() === subject.toLowerCase()).map((r) => r.value);
  if (m.width !== tr.width || m.height !== tr.height) { console.log('not scored: the mask is ' + m.width + ' by ' + m.height + ' and the truth ' + tr.width + ' by ' + tr.height); process.exit(0); }
  if (!want.length) { console.log('not scored: the truth has no region named ' + subject + ' (it has ' + names.map((r) => r.name).join(', ') + ')'); process.exit(0); }
  const n = m.width * m.height, w = new Float64Array(n), t = new Uint8Array(n);
  for (let i = 0; i < n; i++) { w[i] = m.data[i] / 255; t[i] = want.includes(tr.data[i]) ? 1 : 0; }
  const s = scoreArrays(w, t, m.width, m.height);
  console.log('mask: ' + maskPath);
  console.log('truth: ' + truthPath + ', subject ' + subject + ' (' + fmt(s.subjectPixels) + ' pixels of ' + fmt(n) + ')');
  console.log('subject taken: ' + s.subjectTaken.toFixed(4));
  console.log('else taken: ' + s.elseTaken.toFixed(4));
  console.log('overlap over union at a half: ' + s.iou.toFixed(4) + ' (soft: ' + s.softIou.toFixed(4) + '); taken right ' + fmt(s.tp) + ', taken wrongly ' + fmt(s.fp) + ', left wrongly ' + fmt(s.fn));
  console.log('widest band along the boundary: ' + s.widestBand + ' px (' + fmt(s.bandPixels) + ' wrong pixels touching the boundary, ' + fmt(s.wrongElsewhere) + ' wrong pixels apart from it)');
} else {
  console.log('use: node score.mjs <mask.png> <truth.png> <subject>');
}
process.exit(0);
