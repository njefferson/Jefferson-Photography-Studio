// Step 5 (correction route), part 1: a look aid. Usage: node step5-crop.mjs <frame> <x0> <y0> <w> <h> <step> <name> [mask file].
// Crops the window x0,y0,w,h of research/whole/frames/<frame>-open.png at the frame's own pixels (step 1) or every step-th pixel (step 2 and more, nearest), draws a grid line every 100 frame pixels in frame coordinates
// (a short tick row and column of labels, the label being the frame coordinate), and, if a mask file is given, its line at a half in yellow. Writes pictures5/crop-<name>.png. Exits 0 whatever it finds.
console.log('MADE TO FAIL: a planted 400 by 300 frame whose pixel (x,y) holds red x and green y; a crop of window 100,50 at step 2 must hold (a) at crop pixel (51,26), off every grid line, the frame pixel 202,102, and (b) at crop pixel (50,26), on the grid column of frame x 200, the grid colour 0,255,255, and the grid column for frame x 200 must be 50 (both must read as known)');
console.log('MADE TO FAIL: the same planted crop with step 1 must hold at crop pixel (30,20) the frame pixel 130,70 (known figure 130,70)');
console.log('nothing below is trustworthy unless plant (a) reads 202,102, plant (b) reads 0,255,255 and column 50, and the step 1 plant reads 130,70');
import { mkdirSync } from 'node:fs';
const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const { readRGB, readGrey, writePNG } = await import(WHOLE + '/png.mjs');
const { text, blank, put } = await import(WHOLE + '/draw.mjs');
mkdirSync(SCRATCH + '/pictures5', { recursive: true });

/** Takes a frame { width, height, data }, window x0,y0,w,h, step, mask bytes or null; gives { im, colOf } where im is the crop picture with grid and mask line, colOf(x) the crop column of a frame column. */
function crop(fr, x0, y0, w, h, step, mask) {
  const cw = Math.floor(w / step), ch = Math.floor(h / step);
  const im = blank(cw, ch, [0, 0, 0]);
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const sx = x0 + x * step, sy = y0 + y * step;
    if (sx >= fr.width || sy >= fr.height) continue;
    const i = sy * fr.width + sx, o = (y * cw + x) * 3;
    im.data[o] = fr.data[3 * i]; im.data[o + 1] = fr.data[3 * i + 1]; im.data[o + 2] = fr.data[3 * i + 2];
    if (mask) {
      const v = mask[i] >= 128;
      const nb = (dx, dy) => { const X = sx + dx, Y = sy + dy; return X >= 0 && Y >= 0 && X < fr.width && Y < fr.height && (mask[Y * fr.width + X] >= 128) !== v; };
      if (v && (nb(1, 0) || nb(-1, 0) || nb(0, 1) || nb(0, -1))) put(im, x, y, [255, 230, 0]);
    }
  }
  const colOf = (X) => Math.round((X - x0) / step);
  for (let X = Math.ceil(x0 / 100) * 100; X < x0 + w; X += 100) {
    const c = colOf(X);
    for (let y = 0; y < ch; y += 2) put(im, c, y, [0, 255, 255]);
    text(im, c + 2, 2, 'X' + X, 1, [0, 255, 255]);
  }
  for (let Y = Math.ceil(y0 / 100) * 100; Y < y0 + h; Y += 100) {
    const r = Math.round((Y - y0) / step);
    for (let x = 0; x < cw; x += 2) put(im, x, r, [0, 255, 255]);
    text(im, 2, r + 2, 'Y' + Y, 1, [0, 255, 255]);
  }
  return { im, colOf };
}
{
  const fr = { width: 400, height: 300, data: new Uint8Array(400 * 300 * 3) };
  for (let y = 0; y < 300; y++) for (let x = 0; x < 400; x++) { const o = (y * 400 + x) * 3; fr.data[o] = x & 255; fr.data[o + 1] = y & 255; fr.data[o + 2] = 90; }
  const a = crop(fr, 100, 50, 200, 150, 2, null);
  const p = (26 * a.im.width + 51) * 3, g = (26 * a.im.width + 50) * 3;
  console.log('plant (a): step 2, crop pixel 51,26 (off every grid line) known frame pixel 202,102; read ' + a.im.data[p] + ',' + a.im.data[p + 1]);
  console.log('plant (b): step 2, crop pixel 50,26 (on the grid column of frame x 200) known grid colour 0,255,255; read ' + a.im.data[g] + ',' + a.im.data[g + 1] + ',' + a.im.data[g + 2] + '; the grid column of frame x 200 is ' + a.colOf(200) + ' (known 50)');
  const b = crop(fr, 100, 50, 200, 150, 1, null);
  const q = (20 * b.im.width + 30) * 3;
  console.log('plant: step 1, crop pixel 30,20 holds frame pixel ' + b.im.data[q] + ',' + b.im.data[q + 1]);
}
const [frame, x0, y0, w, h, step, name, maskFile] = process.argv.slice(2);
if (!name) { console.log('use: node step5-crop.mjs <frame> <x0> <y0> <w> <h> <step> <name> [mask]'); process.exit(0); }
try {
  const fr = readRGB(WHOLE + '/frames/' + frame + '-open.png');
  const m = maskFile ? readGrey(maskFile).data : null;
  const { im } = crop(fr, +x0, +y0, +w, +h, +step, m);
  const f = SCRATCH + '/pictures5/crop-' + name + '.png';
  writePNG(f, im.width, im.height, 3, im.data);
  console.log(f + ' ' + im.width + ' by ' + im.height + ' (frame ' + fr.width + ' by ' + fr.height + ')');
} catch (e) { console.log('stopped: ' + (e && e.stack ? e.stack : e)); }
process.exit(0);
