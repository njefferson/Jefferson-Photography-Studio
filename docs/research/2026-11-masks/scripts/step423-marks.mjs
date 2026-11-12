// step423-marks.mjs: draws every sample of research/whole/samples.json over its frame as it opens, so that each sample's place can be
// checked by eye. Takes "frames" or "planted". Writes research/whole/samples-check/<name>-samples.png, one per frame or planted picture,
// at the frame's own size with a title band above: each sample a circle of its own radius, marked with the first letter of its name
// (S sky, F foliage, B built things, W water) and its set's number.
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readRGB, writePNG } from '../research/whole/png.mjs';
import { text, circle, fillRect, blank, paste } from '../research/whole/draw.mjs';

console.log('MADE TO FAIL: a planted 100 by 100 picture with one sample at x 0.5, y 0.5, r 0.4 must mark the pixel 40 to the right of the centre and leave the pixel 30 above the centre unmarked (known figure 40)');
console.log('nothing below is trustworthy unless the planted line reads marked at 40 yes and inside unmarked');

const W = dirname(dirname(fileURLToPath(import.meta.url))) + '/research/whole';
const COL = { 'Sky': [40, 120, 255], 'Foliage': [0, 200, 60], 'Built things': [255, 140, 0], 'Water': [0, 230, 230] };
const BAND = 60;

function mark(im, samples, setNo, off) {
  const short = Math.min(im.width, im.height - off);
  for (const s of samples) {
    const c = COL[s.name] || [255, 0, 255];
    const cx = s.x * im.width, cy = off + s.y * (im.height - off), r = s.r * short;
    circle(im, cx, cy, r, [0, 0, 0], 7);
    circle(im, cx, cy, r, c, 4);
    const lab = s.name[0] + setNo;
    fillRect(im, Math.round(cx - 18), Math.round(cy - 18), 36 + (lab.length - 2) * 18, 36, [0, 0, 0]);
    text(im, Math.round(cx - 15), Math.round(cy - 14), lab, 4, c);
  }
}

{
  const im = blank(100, 100, [128, 128, 128]);
  mark(im, [{ name: 'Sky', x: 0.5, y: 0.5, r: 0.4 }], 1, 0);
  const at = (x, y) => im.data[(y * 100 + x) * 3 + 2];
  console.log('planted: marked at 40 ' + (at(90, 50) !== 128 ? 'yes' : 'no') + ', inside ' + (at(50, 20) === 128 ? 'unmarked' : 'marked'));
}

const which = process.argv[2] || 'frames';
const all = JSON.parse(readFileSync(W + '/samples.json', 'utf8'));
const group = which === 'planted' ? all.planted || {} : all.frames;
mkdirSync(W + '/samples-check', { recursive: true });
const only = process.argv[3] ? process.argv[3].split(',') : null;
for (const [name, f] of Object.entries(group)) {
  if (only && !only.includes(name)) continue;
  const src = readRGB(which === 'planted' ? W + '/planted/' + name + '-open.png' : W + '/frames/' + name + '-open.png');
  const im = blank(src.width, src.height + BAND, [20, 20, 20]);
  paste(im, src, 0, 0, src.width, src.height, 0, BAND);
  text(im, 10, 10, 'SAMPLES ON ' + name + ' AS IT OPENS. ' + f.sets.map((s, k) => 'SET ' + (k + 1) + ' ' + s.placedBy).join('. '), 5, [255, 255, 255]);
  f.sets.forEach((s, k) => mark(im, s.samples, k + 1, BAND));
  const out = W + '/samples-check/' + name + '-samples.png';
  writePNG(out, im.width, im.height, 3, im.data);
  console.log('wrote ' + out + ': ' + f.sets.map((s) => s.samples.length).join(' and ') + ' samples');
}
process.exit(0);
