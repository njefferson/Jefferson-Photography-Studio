// step423-trial.mjs: tries score.mjs and sheet.mjs on a mask built by hand to be wrong by known amounts, on the planted picture
// plant-three, subject Water. The mask is the truth's water, plus a band of 12 rows of built things above the water line, plus a
// 200 by 200 block of sky at (100, 100), less a 100 by 100 block of water at (1000, 1650). Every known figure is counted here from
// the truth with this script's own loops, then the two tools are run as children and their figures printed beside these.
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readGrey, writePNG } from '../research/whole/png.mjs';

console.log('MADE TO FAIL: the hand-built mask is wrong by a band of 12 rows along the water line, so score.mjs must read a widest band of 12 (known figure 12), and the overlap over union this script counts');
console.log('nothing below is trustworthy unless the band line reads known 12 beside read 12');

const WH = dirname(dirname(fileURLToPath(import.meta.url))) + '/research/whole';
const T = WH + '/planted/plant-three-truth.png';
const tr = readGrey(T), W = tr.width, H = tr.height, n = W * H;
const regions = JSON.parse(readFileSync(WH + '/planted/plant-three-truth.json', 'utf8')).regions;
const water = regions.find((r) => r.name === 'Water').value;
let y0 = H;
for (let y = 0; y < H && y0 === H; y++) if (tr.data[y * W + 10] === water) y0 = y;
const m = new Uint8Array(n);
let tp = 0, fp = 0, fn = 0, ws = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, isW = tr.data[i] === water;
  let take = isW;
  if (y >= y0 - 12 && y < y0) take = true;
  if (x >= 100 && x < 300 && y >= 100 && y < 300) take = true;
  if (x >= 1000 && x < 1100 && y >= 1650 && y < 1750) take = false;
  m[i] = take ? 255 : 0;
  if (isW) ws++;
  if (take && isW) tp++; else if (take) fp++; else if (isW) fn++;
}
mkdirSync(WH + '/trial', { recursive: true });
const maskPath = WH + '/trial/plant-three-water-handwrong.png';
writePNG(maskPath, W, H, 1, m);
const iou = tp / (tp + fp + fn);
console.log('the water line is at row ' + y0 + '; water pixels ' + ws.toLocaleString('en-US') + '; taken right ' + tp.toLocaleString('en-US') + ', taken wrongly ' + fp.toLocaleString('en-US') + ', left wrongly ' + fn.toLocaleString('en-US'));
console.log('known: overlap over union ' + iou.toFixed(4) + ', subject taken ' + (tp / ws).toFixed(4) + ', else taken ' + (fp / (n - ws)).toFixed(4) + ', widest band 12, wrong pixels apart from the boundary ' + (200 * 200 + 100 * 100).toLocaleString('en-US') + ', share of the frame at a half ' + (((tp + fp) / n) * 100).toFixed(1) + ' percent');

const s = spawnSync('node', [WH + '/score.mjs', maskPath, T, 'Water'], { cwd: WH, encoding: 'utf8' });
console.log('--- score.mjs, exit ' + s.status);
console.log((s.stdout || '') + (s.stderr || ''));
const read = (re) => { const k = (s.stdout || '').match(re); return k ? k[1] : 'not read'; };
console.log('band: known 12, read ' + read(/widest band along the boundary: (\d+) px/));
console.log('overlap over union: known ' + iou.toFixed(4) + ', read ' + read(/overlap over union at a half: ([0-9.]+)/));
console.log('subject taken: known ' + (tp / ws).toFixed(4) + ', read ' + read(/subject taken: ([0-9.]+)/));
console.log('else taken: known ' + (fp / (n - ws)).toFixed(4) + ', read ' + read(/else taken: ([0-9.]+)/));

const out = WH + '/trial/plant-three-water-handwrong-sheet';
const k = spawnSync('node', [WH + '/sheet.mjs', WH + '/planted/plant-three-open.png', maskPath, out, 'HAND-BUILT WRONG MASK', 'AS IT OPENS', 'PLANT-THREE', 'WATER'], { cwd: WH, encoding: 'utf8' });
console.log('--- sheet.mjs, exit ' + k.status);
console.log((k.stdout || '') + (k.stderr || ''));
const sh = (k.stdout || '').match(/taken at a half: ([0-9.]+) percent/);
console.log('share of the frame: known ' + (((tp + fp) / n) * 100).toFixed(1) + ', read ' + (sh ? sh[1] : 'not read'));
process.exit(0);
