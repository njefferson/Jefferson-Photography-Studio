// sheet.mjs: draws one mask over its frame at the frame's own size, and a second picture of full-size crops where the mask's edge
// crosses the frame.
// Use: node sheet.mjs <frame.png> <mask.png> <out> <method> <input> <frame name> <subject>
//   frame.png  the picture the mask was made on (RGB PNG); mask.png one value 0 to 1 a pixel as a grey PNG at the same size.
//   out        the path without .png; writes <out>.png (a title band above the whole frame, the mask's weight as a magenta tint,
//              its outline at a half in yellow, 3 pixels wide) and <out>-crops.png (up to six crops of 400 by 400 at full size,
//              where the outline is densest, each labelled with its place in the frame).
// Prints the share of the frame at a half or more, the count of outline pixels, and each crop's place. Writes nothing else.
// What it cannot show: a sheet is a picture to be opened; the figures it prints are not a measure of a mask (score.mjs is, on a truth).
import { readRGB, readGrey, writePNG } from './png.mjs';
import { text, fillRect, blank, paste } from './draw.mjs';

console.log('MADE TO FAIL: a built-in 200 by 100 frame with a mask on its left half must read a share of 50.0 percent and 200 edge pixels before the outline is widened (known figures 50.0 and 200)');
console.log('nothing below is trustworthy unless the plant line reads 50.0 percent and 200');

const BAND = 60, CROP = 400, TINT = [255, 0, 200], LINE = [255, 230, 0];

/** The pixels whose cut at a half differs from a 4-neighbour's. */
function edgeOf(w, width, height) {
  const e = new Uint8Array(width * height);
  let n = 0;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = y * width + x, v = w[i] >= 128;
    if ((x > 0 && (w[i - 1] >= 128) !== v) || (x < width - 1 && (w[i + 1] >= 128) !== v) || (y > 0 && (w[i - width] >= 128) !== v) || (y < height - 1 && (w[i + width] >= 128) !== v)) { e[i] = 1; n++; }
  }
  return { e, n };
}

{
  const W = 200, H = 100, w = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) w[y * W + x] = x < 100 ? 255 : 0;
  let on = 0;
  for (let i = 0; i < W * H; i++) if (w[i] >= 128) on++;
  console.log('plant: ' + ((on / (W * H)) * 100).toFixed(1) + ' percent, ' + edgeOf(w, W, H).n);
}

const [framePath, maskPath, out, method, input, frameName, subject] = process.argv.slice(2);
if (!subject) { console.log('use: node sheet.mjs <frame.png> <mask.png> <out> <method> <input> <frame name> <subject>'); process.exit(0); }
const f = readRGB(framePath), m = readGrey(maskPath);
if (f.width !== m.width || f.height !== m.height) { console.log('not drawn: the frame is ' + f.width + ' by ' + f.height + ' and the mask ' + m.width + ' by ' + m.height); process.exit(0); }
const W = f.width, H = f.height, n = W * H;
const { e, n: edges } = edgeOf(m.data, W, H);
let on = 0;
for (let i = 0; i < n; i++) if (m.data[i] >= 128) on++;
const share = (on / n) * 100;

// The frame with the tint by weight and the outline, at the frame's own size.
const pic = { width: W, height: H, data: new Uint8Array(n * 3) };
for (let i = 0; i < n; i++) {
  const a = 0.55 * (m.data[i] / 255);
  for (let c = 0; c < 3; c++) pic.data[3 * i + c] = Math.round(f.data[3 * i + c] * (1 - a) + TINT[c] * a);
}
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  if (!e[y * W + x]) continue;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
    const X = x + dx, Y = y + dy;
    if (X < 0 || Y < 0 || X >= W || Y >= H) continue;
    const o = (Y * W + X) * 3;
    pic.data[o] = LINE[0]; pic.data[o + 1] = LINE[1]; pic.data[o + 2] = LINE[2];
  }
}
const title = method + '. INPUT ' + input + '. FRAME ' + frameName + '. SUBJECT ' + subject + '. TAKEN AT A HALF ' + share.toFixed(1) + '%';
const sheet = blank(W, H + BAND, [20, 20, 20]);
paste(sheet, pic, 0, 0, W, H, 0, BAND);
// The title's letters are made as large as fit the frame's width, five units at most and two at least.
const fit = (len, width) => Math.max(2, Math.min(5, Math.floor((width - 20) / (len * 6))));
text(sheet, 10, 10, title, fit(title.length, W), [255, 255, 255]);
writePNG(out + '.png', sheet.width, sheet.height, 3, sheet.data);

// The crops: the 400 by 400 windows, on a 200-pixel grid, holding the most outline, taken greedily without overlap.
const cells = [];
for (let y0 = 0; y0 + CROP <= H; y0 += 200) for (let x0 = 0; x0 + CROP <= W; x0 += 200) {
  let c = 0;
  for (let y = y0; y < y0 + CROP; y += 2) for (let x = x0; x < x0 + CROP; x += 2) c += e[y * W + x];
  if (c > 0) cells.push([x0, y0, c]);
}
cells.sort((a, b) => b[2] - a[2]);
const picked = [];
for (const c of cells) {
  if (picked.length >= 6) break;
  if (picked.some((p) => Math.abs(p[0] - c[0]) < CROP && Math.abs(p[1] - c[1]) < CROP)) continue;
  picked.push(c);
}
const LAB = 40, GAP = 10;
const cols = 3, rows = Math.max(1, Math.ceil(picked.length / cols));
const crops = blank(cols * CROP + (cols + 1) * GAP, BAND + rows * (CROP + LAB + GAP), [20, 20, 20]);
const ctitle = (picked.length ? 'CROPS AT FULL SIZE. ' : 'NO EDGE AT A HALF, SO NO CROP. ') + method + '. ' + input + '. ' + frameName + '. ' + subject;
text(crops, 10, 10, ctitle, fit(ctitle.length, crops.width), [255, 255, 255]);
picked.forEach(([x0, y0], k) => {
  const cx = GAP + (k % cols) * (CROP + GAP), cy = BAND + Math.floor(k / cols) * (CROP + LAB + GAP);
  text(crops, cx, cy + 6, 'X ' + x0 + ' Y ' + y0, 4, [255, 255, 255]);
  paste(crops, pic, x0, y0, CROP, CROP, cx, cy + LAB);
});
writePNG(out + '-crops.png', crops.width, crops.height, 3, crops.data);
console.log('sheet: ' + out + '.png (' + W + ' by ' + (H + BAND) + '), crops: ' + out + '-crops.png');
console.log('taken at a half: ' + share.toFixed(1) + ' percent of the frame; outline pixels ' + edges.toLocaleString('en-US'));
console.log('crops at: ' + (picked.length ? picked.map((p) => p[0] + ',' + p[1]).join('; ') : 'none'));
process.exit(0);
