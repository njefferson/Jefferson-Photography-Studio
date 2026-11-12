// refine.mjs: brings one coarse map to a picture's edges by one stage (step 436, 11 November 2026). Helpers in refine-lib.mjs.
// Use: node refine.mjs <coarse.png> <picture.png> <out.png> <stage> <radius> <regularisation> <cell>
//   coarse.png  a coarse map brought to the picture's size, one value 0 to 1 a pixel as a grey PNG (byte / 255);
//   picture.png the picture the map is laid on (RGB PNG at the same size); its Rec. 709 grey is the guide;
//   out.png     the refined mask, in the mask file's form (inputs.md): an 8-bit grey PNG, the byte round(255 times the value);
//   stage       plain, weighted or cues (refine-lib.mjs says what each does);
//   radius      the guided filter's radius in pixels (for cues, the radius of the small filter over the whole);
//   regularisation  the guided filter's regularisation on a 0 to 1 scale;
//   cell        the coarse map's own grid cell in pixels at the picture's size, by which the sure regions are drawn in
//               (read by weighted and cues; plain does not read it).
// Prints the plants, then the stage, the sure pixels' counts and the time taken; writes the one out file and nothing else.
// What it cannot show: whether a refined mask is right; score.mjs says that on a planted truth, and an opened picture on a frame.
import { readGrey, readRGB, writePNG } from './png.mjs';
import { grey, guided, weightedGuided, refine, toBytes } from './refine-lib.mjs';

console.log('MADE TO FAIL: the plain guided filter of a step edge under a guide holding the same step must read 0.00 and 1.00 five pixels either side of it (known figures 0.00 and 1.00), and the weighted filter with every weight one must equal the plain filter (known figure 0.0000 largest difference)');
console.log('MADE TO FAIL: a planted wrong expectation, that the weighted filter leaves the cut at a half where a ramp misplaced by 10 pixels put it, column 110, must be reported as failing (the guide changes at column 100)');
console.log('nothing below is trustworthy unless the plant lines read 0.00, 1.00 and 0.0000 and the planted wrong expectation is reported as failing');

// Plant one: a step kept.
{
  const W = 60, H = 20, I = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) I[y * W + x] = x >= 30 ? 1 : 0;
  const q = guided(I, I, W, H, 4, 0.001);
  console.log('plant step: ' + q[10 * W + 25].toFixed(2) + ' ' + q[10 * W + 34].toFixed(2));
}
// Plant two: every weight one gives the plain filter.
{
  const W = 50, H = 40, I = new Float64Array(W * H), p = new Float64Array(W * H), c = new Float64Array(W * H).fill(1);
  for (let i = 0; i < W * H; i++) { I[i] = ((i * 37) % 101) / 100; p[i] = ((i * 53) % 89) / 88; }
  const a = guided(I, p, W, H, 5, 0.01), b = weightedGuided(I, p, c, W, H, 5, 0.01);
  let d = 0;
  for (let i = 0; i < W * H; i++) d = Math.max(d, Math.abs(a[i] - b[i]));
  console.log('plant weights one: largest difference ' + d.toFixed(4));
}
// Plant three: the planted wrong expectation.
{
  const W = 200, H = 20, I = new Float64Array(W * H), p = new Float64Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    I[y * W + x] = x >= 100 ? 0.8 : 0.2;
    p[y * W + x] = Math.min(1, Math.max(0, (x - 80) / 60));
  }
  const ctx = { I, rgb: null, W, H, cell: 8 };
  const { q } = await refine(ctx, p, 'weighted', 64, 0.001);
  let col = -1;
  for (let x = 0; x < W; x++) if (q[10 * W + x] >= 0.5) { col = x; break; }
  console.log('PLANT: expected (known wrong) the cut at a half at column 110; read column ' + col + '; reported as ' + (col === 110 ? 'NOT FAILING, the instrument cannot be trusted' : 'failing (as it must)'));
}

const [coarsePath, picPath, outPath, stage, rs, es, cs] = process.argv.slice(2);
if (!cs) {
  console.log('use: node refine.mjs <coarse.png> <picture.png> <out.png> <plain|weighted|cues> <radius> <regularisation> <cell>');
  process.exit(0);
}
const t0 = Date.now();
const m = readGrey(coarsePath), pic = readRGB(picPath);
if (m.width !== pic.width || m.height !== pic.height) {
  console.log('not refined: the coarse map is ' + m.width + ' by ' + m.height + ' and the picture ' + pic.width + ' by ' + pic.height);
  process.exit(0);
}
const W = m.width, H = m.height, p = new Float64Array(W * H);
for (let i = 0; i < W * H; i++) p[i] = m.data[i] / 255;
const I = grey(pic.data, W, H);
const ctx = { I, rgb: pic.data, W, H, cell: Number(cs) };
const { q, reason } = await refine(ctx, p, stage, Number(rs), Number(es));
if (!q) {
  console.log('not refined: ' + reason);
  process.exit(0);
}
writePNG(outPath, W, H, 1, toBytes(q));
console.log('refined: ' + outPath + ' by ' + stage + ', radius ' + rs + ', regularisation ' + es + ', cell ' + cs);
if (ctx.sure) console.log('sure pixels: ' + ctx.sure.nh + ' taken, ' + ctx.sure.nl + ' left, of ' + W * H);
console.log('time: ' + (Date.now() - t0) + ' ms, reading and writing included');
process.exit(0);
