// step423-hue.mjs: the natural-hue re-mapping of one frame, as IR-SCIENCE.md section 4b-x words it: the swap render's one colour axis
// re-mapped so that its foliage side goes green and its sky side goes blue, with the brightness kept.
// Takes a frame's stem; reads research/whole/frames/<stem>-open.png, writes <stem>-natural.png and <stem>-natural.json beside it.
// The method, in full:
//   Y = 0.2126 R + 0.7152 G + 0.0722 B on the display values (0 to 1); Cb = B - Y; Cr = R - Y.
//   The frame's axis is the major eigenvector of the mean of [Cb Cb, Cb Cr; Cb Cr, Cr Cr] over every pixel (taken about neutral, not
//   about the mean), turned so that Cr - Cb is positive along it: the pink side, which is the foliage side in the swap render.
//   t is each pixel's projection on that axis. A pixel with t >= 0 gets the chroma t times the unit chroma of pure green; one with
//   t < 0 gets -t times the unit chroma of pure blue. The chroma across the axis is dropped. Y is kept; R = Y + Cr, B = Y + Cb,
//   G = (Y - 0.2126 R - 0.0722 B) / 0.7152, each clamped to 0 to 1. The chroma's length is kept as it was (no gain).
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readRGB, writePNG } from '../research/whole/png.mjs';

console.log('MADE TO FAIL: a planted grey of 128 must come out 128 128 128, a planted pink of 200 150 170 must come out with green its largest channel, and a planted teal of 140 160 175 with blue its largest (known figure 128)');
console.log('nothing below is trustworthy unless the planted line reads 128 128 128, green and blue');

const KR = 0.2126, KG = 0.7152, KB = 0.0722;
const unit = (r, g, b) => { const y = KR * r + KG * g + KB * b; const cb = b - y, cr = r - y; const n = Math.hypot(cb, cr); return [cb / n, cr / n]; };
const GREEN = unit(0, 1, 0), BLUE = unit(0, 0, 1);

/** Re-maps RGB bytes in place-free fashion; returns the new bytes and the axis. */
function remap(src, n) {
  let a = 0, b = 0, c = 0;
  for (let i = 0; i < n; i++) {
    const R = src[3 * i] / 255, G = src[3 * i + 1] / 255, B = src[3 * i + 2] / 255;
    const Y = KR * R + KG * G + KB * B, cb = B - Y, cr = R - Y;
    a += cb * cb; b += cb * cr; c += cr * cr;
  }
  a /= n; b /= n; c /= n;
  const tr = a + c, det = a * c - b * b, l1 = tr / 2 + Math.sqrt(Math.max(0, (tr * tr) / 4 - det)), l2 = tr - l1;
  let ax = Math.abs(b) > 1e-12 ? [l1 - c, b] : (a >= c ? [1, 0] : [0, 1]);
  const nn = Math.hypot(ax[0], ax[1]); ax = [ax[0] / nn, ax[1] / nn];
  if (ax[1] - ax[0] < 0) ax = [-ax[0], -ax[1]];
  const out = new Uint8Array(n * 3);
  let pos = 0;
  for (let i = 0; i < n; i++) {
    const R = src[3 * i] / 255, G = src[3 * i + 1] / 255, B = src[3 * i + 2] / 255;
    const Y = KR * R + KG * G + KB * B, cb = B - Y, cr = R - Y;
    const t = cb * ax[0] + cr * ax[1];
    const d = t >= 0 ? GREEN : BLUE, m = Math.abs(t);
    if (t > 0) pos++;
    const ncb = m * d[0], ncr = m * d[1];
    const r2 = Y + ncr, b2 = Y + ncb, g2 = (Y - KR * r2 - KB * b2) / KG;
    out[3 * i] = Math.max(0, Math.min(255, Math.round(r2 * 255)));
    out[3 * i + 1] = Math.max(0, Math.min(255, Math.round(g2 * 255)));
    out[3 * i + 2] = Math.max(0, Math.min(255, Math.round(b2 * 255)));
  }
  return { out, axis: ax, spread: [l1, l2], foliageSide: pos / n };
}

{
  // The plant: grey, pink, teal, with the pink and teal repeated so that the axis runs between them.
  const p = new Uint8Array([128, 128, 128, 200, 150, 170, 140, 160, 175, 200, 150, 170, 140, 160, 175]);
  const r = remap(p, 5).out;
  const largest = (i) => (r[3 * i + 1] >= r[3 * i] && r[3 * i + 1] >= r[3 * i + 2] ? 'green' : r[3 * i + 2] >= r[3 * i] ? 'blue' : 'red');
  console.log('planted: ' + r[0] + ' ' + r[1] + ' ' + r[2] + ', ' + largest(1) + ' and ' + largest(2));
}

const stem = process.argv[2];
const FR = dirname(dirname(fileURLToPath(import.meta.url))) + '/research/whole/frames/';
const im = readRGB(FR + stem + '-open.png');
const n = im.width * im.height;
const { out, axis, spread, foliageSide } = remap(im.data, n);
let dy = 0;
for (let i = 0; i < n; i++) {
  const y0 = KR * im.data[3 * i] + KG * im.data[3 * i + 1] + KB * im.data[3 * i + 2];
  const y1 = KR * out[3 * i] + KG * out[3 * i + 1] + KB * out[3 * i + 2];
  dy = Math.max(dy, Math.abs(y1 - y0));
}
writePNG(FR + stem + '-natural.png', im.width, im.height, 3, out);
const r4 = (v) => Math.round(v * 10000) / 10000;
writeFileSync(FR + stem + '-natural.json', JSON.stringify({
  from: stem + '-open.png', axisCbCr: axis.map(r4), spread: spread.map((v) => r4(v * 1000)), spreadUnit: 'thousandths',
  foliageSideShare: r4(foliageSide), largestBrightnessChangeInBytes: r4(dy),
  method: 'IR-SCIENCE.md 4b-x natural hue: the one colour axis (major eigenvector of Cb Cr about neutral, signed toward pink) re-mapped, pink side to green, teal side to blue, chroma length kept, Rec. 709 brightness kept, across-axis chroma dropped',
}, null, 1));
console.log(stem + ': axis Cb ' + axis[0].toFixed(4) + ' Cr ' + axis[1].toFixed(4) + '; spread along ' + (spread[0] * 1000).toFixed(3) + ' and across ' + (spread[1] * 1000).toFixed(3) + ' thousandths; foliage side ' + (foliageSide * 100).toFixed(1) + ' percent; largest brightness change ' + dy.toFixed(2) + ' bytes (clamping)');
process.exit(0);
