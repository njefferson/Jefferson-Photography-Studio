// count.mjs: step 438's own count of a mask against a truth, written apart from score.mjs and sharing none of its code, so the two can be set side by side.
// Use: node count.mjs <mask.png> <truth.png> <subject>
//   mask.png   one value from 0 to 1 for each pixel as a grey PNG (byte / 255); truth.png a planted picture's truth with its -truth.json beside it;
//   subject    a region's name as that json gives it, any letter case.
// Prints the pixels taken right, taken wrongly and left wrongly with the mask cut at a half (byte 128 or more), and the overlap over union, tp over (tp plus fp plus fn).
// It does not measure a band: the widest band is the scorer's figure. Writes nothing.
console.log('MADE TO FAIL: on a built-in truth whose subject is the left 5 of 10 columns of a 10 by 10 picture and a mask taking the left 6 columns, it must read taken right 50, taken wrongly 10, left wrongly 0 and overlap over union 0.8333 (known figures 50, 10, 0 and 0.8333)');
console.log('nothing below is trustworthy unless the plant line reads 50 10 0 0.8333');

import { existsSync } from 'node:fs';
import { readGrey } from '../png.mjs';
import { readJSON } from './lib.mjs';

/** Counts bytes of a mask against truth bytes for the subject's truth values; takes (mask, truth, values) and gives { tp, fp, fn, iou } with the mask cut at byte 128. */
function count(mask, truth, values) {
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < mask.length; i++) {
    const t = values.indexOf(truth[i]) >= 0, m = mask[i] >= 128;
    if (t && m) tp++;
    if (!t && m) fp++;
    if (t && !m) fn++;
  }
  return { tp, fp, fn, iou: tp / (tp + fp + fn) };
}

{
  const m = new Uint8Array(100), t = new Uint8Array(100);
  for (let i = 0; i < 100; i++) { m[i] = i % 10 < 6 ? 200 : 20; t[i] = i % 10 < 5 ? 3 : 4; }
  const c = count(m, t, [3]);
  console.log('plant: ' + c.tp + ' ' + c.fp + ' ' + c.fn + ' ' + c.iou.toFixed(4));
}

const [maskPath, truthPath, subject] = process.argv.slice(2);
if (maskPath && truthPath && subject) {
  const jsonPath = truthPath.replace(/-truth\.png$/, '-truth.json');
  if (!existsSync(maskPath) || !existsSync(truthPath) || !existsSync(jsonPath)) { console.log('not counted: a file is missing'); process.exit(0); }
  const m = readGrey(maskPath), t = readGrey(truthPath);
  const values = readJSON(jsonPath).regions.filter((r) => r.name.toLowerCase() === subject.toLowerCase()).map((r) => r.value);
  if (m.width !== t.width || m.height !== t.height || !values.length) { console.log('not counted: sizes differ or the truth has no region named ' + subject); process.exit(0); }
  const c = count(m.data, t.data, values);
  console.log('count: mask ' + maskPath + ', subject ' + subject);
  console.log('taken right ' + c.tp + ', taken wrongly ' + c.fp + ', left wrongly ' + c.fn);
  console.log('overlap over union at a half: ' + c.iou.toFixed(4));
} else console.log('use: node count.mjs <mask.png> <truth.png> <subject>');
process.exit(0);
