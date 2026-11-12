// Child of the step 428 runner (send 2). Usage: node step428-smooth.mjs <open|natural> <frames|planted>. For every mask the harness wrote of that input and scope, takes the counted grid's values back out of the mask (the mask carries each grid cell as one flat block, so the cell's value is the byte at the cell's first pixel), carries the grid back to the picture's size by bilinear interpolation of the weights with cell centres at (cell + 0.5) times k, and writes the result under research/whole/maps-recipe/smooth/<kind>/ with a new index. No mask is made again; no model runs.
// Prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
console.log('MADE TO FAIL: a built-in grid of four cells holding 0, 0, 255, 255 at k 3 carried to 12 pixels must read 85 at pixel 5 (known figure 85); a read of 0 or 255 there means the carrying is nearest-pixel and not smooth');
console.log('nothing below is trustworthy unless the plant line reads 85');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const WHOLE = SCRATCH + '/research/whole';
const OUT = WHOLE + '/maps-recipe';
const P = await import(WHOLE + '/png.mjs');

/** Takes a grid of w by h bytes, the step k and a picture size W by H; gives W by H bytes by bilinear interpolation, cell centres at (cell + 0.5) times k, edges clamped. The result is between the grid's least and greatest value everywhere. */
function carry(grid, w, h, k, W, H) {
  const x0 = new Int32Array(W), x1 = new Int32Array(W), fx = new Float32Array(W);
  for (let X = 0; X < W; X++) {
    let g = (X + 0.5) / k - 0.5;
    if (g < 0) g = 0; if (g > w - 1) g = w - 1;
    const a = Math.floor(g); x0[X] = a; x1[X] = Math.min(w - 1, a + 1); fx[X] = g - a;
  }
  const out = new Uint8Array(W * H);
  for (let Y = 0; Y < H; Y++) {
    let g = (Y + 0.5) / k - 0.5;
    if (g < 0) g = 0; if (g > h - 1) g = h - 1;
    const b = Math.floor(g), b1 = Math.min(h - 1, b + 1), fy = g - b;
    const r0 = b * w, r1 = b1 * w;
    for (let X = 0; X < W; X++) {
      const f = fx[X];
      const top = grid[r0 + x0[X]] * (1 - f) + grid[r0 + x1[X]] * f;
      const bot = grid[r1 + x0[X]] * (1 - f) + grid[r1 + x1[X]] * f;
      out[Y * W + X] = Math.round(top * (1 - fy) + bot * fy);
    }
  }
  return out;
}

{
  const o = carry(new Uint8Array([0, 0, 255, 255]), 4, 1, 3, 12, 1);
  console.log('plant: pixel 5 reads ' + o[5] + ' (known 85); pixel 0 reads ' + o[0] + ', pixel 11 reads ' + o[11]);
}

const input = process.argv[2] || 'open';
const scope = process.argv[3] || 'frames';
const kind = scope === 'frames' ? 'frame' : 'planted';
const index = JSON.parse(readFileSync(OUT + '/index/index-' + input + '-' + scope + '.json', 'utf8'));
mkdirSync(OUT + '/smooth/' + kind, { recursive: true });
const next = [];
let done = 0;
for (const e of index) {
  if (!e.file) { next.push(e); continue; }
  const m = P.readGrey(e.file);
  const W = m.width, H = m.height;
  const k = Math.max(1, Math.ceil(Math.sqrt((W * H) / 1.2e6)));
  const w = Math.floor(W / k), h = Math.floor(H / k);
  const grid = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) grid[y * w + x] = m.data[(y * k) * W + x * k];
  const bytes = carry(grid, w, h, k, W, H);
  const file = e.file.replace('/maps-recipe/' + kind + '/', '/maps-recipe/smooth/' + kind + '/');
  P.writePNG(file, W, H, 1, bytes);
  let half = 0; for (let i = 0; i < bytes.length; i++) if (bytes[i] >= 128) half++;
  next.push({ ...e, file, carried: 'bilinear', fromFile: e.file });
  done++;
  if (done % 20 === 0) console.log('  ' + done + ' masks carried; last ' + file.split('/').pop() + ', ' + (half / bytes.length * 100).toFixed(1) + ' percent at a half');
}
writeFileSync(OUT + '/index/index-smooth-' + input + '-' + scope + '.json', JSON.stringify(next, null, 1));
console.log(input + ' ' + scope + ': ' + done + ' masks carried smoothly; index written');
process.exit(0);
