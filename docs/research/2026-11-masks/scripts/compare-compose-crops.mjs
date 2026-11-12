// compose-crops.mjs: the crops picture of one picture and one subject: the same eight panels as the comparison picture, as 360 by 360 crops at full size, at two places.
// Place A is the 360 by 360 window where the entries' masks, cut at a half, differ on the most pixels (a pixel differs where some of the masks that stand take it and some do not);
// place B is the best such window that does not overlap A. With fewer than two masks standing, "differ" has no meaning, and the window holding the most edge of the masks that stand
// is taken instead (and the header says so); with none standing, the windows are centred on the first and the last sample.
// Sixteen crops in four rows of four: row 1 and 2 place A (panels 1 to 4, then 5 to 8), rows 3 and 4 place B. Each crop has a badge (place letter and panel number) at its top left and a white bar
// exactly 4 pixels wide, with a one pixel black rim, at its bottom left to read a band's width against. The picture is 1446 wide and 1494 tall, under the 1500 limit.
// Use: node compose-crops.mjs <picture> <subject> <index.json> <out.png>   (index.json as for compose-comparison.mjs)
console.log('MADE TO FAIL: the window search on a built-in 60 by 60 cell grid whose cell at column 10 row 40 holds 50 and every other cell 1 must put the first window over that cell (a window is 18 cells across), and the second window must not overlap the first and must not hold that cell (known figures column 10 row 40 inside the first, 0 of that cell in the second)');
console.log('nothing below is trustworthy unless the plant line reads first holds the cell yes, apart yes and second holds the cell no');

import { writePNG, readGrey } from '../png.mjs';
import { text, fillRect, blank, paste } from '../draw.mjs';
import { buildSlots, loadFrame, samplesOf, drawSamples, tintedWindow, isEdge, fitScale } from './lib.mjs';

const CROP = 360, CELL = 20, SPAN = CROP / CELL, GAP = 2, HEAD = 48;
const WIDTH = 4 * CROP + 3 * GAP, HEIGHT = HEAD + 4 * CROP + 3 * GAP;

/**
 * Picks two windows of SPAN by SPAN cells on a grid of cell scores (a Float64Array, cw by ch). Gives { a: [cx, cy], b: [cx, cy] }: the best window, and the best that does not overlap it.
 * A tie goes to the window met first, reading rows from the top.
 */
export function twoWindows(cells, cw, ch) {
  const sum = (cx, cy) => { let s = 0; for (let y = cy; y < cy + SPAN; y++) for (let x = cx; x < cx + SPAN; x++) s += cells[y * cw + x]; return s; };
  const all = [];
  for (let cy = 0; cy + SPAN <= ch; cy++) for (let cx = 0; cx + SPAN <= cw; cx++) all.push([cx, cy, sum(cx, cy)]);
  let a = all[0];
  for (const w of all) if (w[2] > a[2]) a = w;
  let b = null;
  for (const w of all) if ((Math.abs(w[0] - a[0]) >= SPAN || Math.abs(w[1] - a[1]) >= SPAN) && (!b || w[2] > b[2])) b = w;
  return { a: [a[0], a[1]], b: b ? [b[0], b[1]] : [a[0], a[1]] };
}

{
  const cells = new Float64Array(3600).fill(1);
  cells[40 * 60 + 10] = 50;
  const r = twoWindows(cells, 60, 60);
  const holds = (w) => w[0] <= 10 && 10 < w[0] + SPAN && w[1] <= 40 && 40 < w[1] + SPAN;
  console.log('plant: first holds the cell ' + (holds(r.a) ? 'yes' : 'no') + ', apart ' + (Math.abs(r.a[0] - r.b[0]) >= SPAN || Math.abs(r.a[1] - r.b[1]) >= SPAN ? 'yes' : 'no') + ', second holds the cell ' + (holds(r.b) ? 'yes' : 'no'));
}

const [picture, subject, indexPath, out] = process.argv.slice(2);
if (!out) { console.log('use: node compose-crops.mjs <picture> <subject> <index.json> <out.png>'); process.exit(0); }

const frame = loadFrame(picture), W = frame.width, H = frame.height;
const slots = buildSlots(picture, subject, indexPath);
const masks = new Map();
for (const s of slots) if (s.kind === 'mask') { const m = readGrey(s.file); if (m.width === W && m.height === H) masks.set(s.n, m.data); }
const list = [...masks.values()];

// The cell scores.
const cw = Math.floor(W / CELL), ch = Math.floor(H / CELL), cells = new Float64Array(cw * ch);
let basis;
if (list.length >= 2) {
  basis = 'THE MASKS DIFFER MOST';
  for (let y = 0; y < ch * CELL; y++) for (let x = 0; x < cw * CELL; x++) {
    const i = y * W + x;
    let s = 0;
    for (const m of list) if (m[i] >= 128) s++;
    if (s > 0 && s < list.length) cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)]++;
  }
} else if (list.length === 1) {
  basis = 'THE ONE MASK HAS THE MOST EDGE';
  for (let y = 0; y < ch * CELL; y++) for (let x = 0; x < cw * CELL; x++) if (isEdge(list[0], W, H, x, y)) cells[Math.floor(y / CELL) * cw + Math.floor(x / CELL)]++;
} else basis = 'NO MASK STANDS, SO THE SAMPLES';
let wins;
if (list.length >= 1) wins = twoWindows(cells, cw, ch);
else {
  const ss = samplesOf(picture), pick = (s) => [Math.max(0, Math.min(cw - SPAN, Math.round((s.x * W - CROP / 2) / CELL))), Math.max(0, Math.min(ch - SPAN, Math.round((s.y * H - CROP / 2) / CELL)))];
  wins = { a: ss.length ? pick(ss[0]) : [0, 0], b: ss.length ? pick(ss[ss.length - 1]) : [SPAN, SPAN] };
}
const places = [{ L: 'A', x: wins.a[0] * CELL, y: wins.a[1] * CELL }, { L: 'B', x: wins.b[0] * CELL, y: wins.b[1] * CELL }];

const sheet = blank(WIDTH, HEIGHT, [20, 20, 20]);
const head1 = ('CROPS AT FULL SIZE. ' + picture + '. ' + subject + '. WHITE BAR = 4 PIXELS WIDE. TINT = MASK, YELLOW = EDGE AT A HALF').slice(0, 118);
const head2 = ('A = X ' + places[0].x + ' Y ' + places[0].y + ' (' + basis + '). B = X ' + places[1].x + ' Y ' + places[1].y + ' (BEST OTHER WINDOW)').slice(0, 118);
const head3 = ('PANELS ' + slots.map((s) => (s.kind === 'samples' ? s.n + ' FRAME' : (s.title.match(/^(\d+) ([^ :]+)/) || [0, s.n, '?']).slice(1, 3).join(' '))).join(', ')).slice(0, 118);
text(sheet, 6, 1, head1, 2, [255, 255, 255]);
text(sheet, 6, 17, head2, 2, [255, 255, 255]);
text(sheet, 6, 33, head3, 2, [255, 255, 255]);

const notes = [];
places.forEach((p, pi) => {
  slots.forEach((s, k) => {
    const gx = (k % 4) * (CROP + GAP), gy = HEAD + (pi * 2 + Math.floor(k / 4)) * (CROP + GAP);
    let tile;
    if (s.kind === 'samples') {
      tile = blank(CROP, CROP, [0, 0, 0]);
      for (let y = 0; y < CROP; y++) for (let x = 0; x < CROP; x++) {
        const X = p.x + x, Y = p.y + y, o = (y * CROP + x) * 3, i = Y * W + X;
        tile.data[o] = frame.data[3 * i]; tile.data[o + 1] = frame.data[3 * i + 1]; tile.data[o + 2] = frame.data[3 * i + 2];
      }
      drawSamples(tile, samplesOf(picture), W, H, 1, p.x, p.y);
    } else if (s.kind === 'mask' && masks.has(s.n)) tile = tintedWindow(frame.data, masks.get(s.n), W, H, p.x, p.y, CROP, CROP, 3);
    else {
      tile = blank(CROP, CROP, [45, 45, 60]);
      text(tile, 14, 150, s.kind === 'mask' ? 'MASK SIZE DOES NOT MATCH' : s.kind === 'none' ? 'NO ENTRY' : 'NOT YET MADE', s.kind === 'mask' ? 2 : 4, [255, 255, 255]);
    }
    if (s.kind === 'samples' || s.kind === 'mask') {
      fillRect(tile, 7, CROP - 38, 6, 30, [0, 0, 0]);
      fillRect(tile, 8, CROP - 37, 4, 28, [255, 255, 255]);
    }
    fillRect(tile, 0, 0, 32, 18, [0, 0, 0]);
    text(tile, 2, 2, p.L + s.n, 2, [255, 255, 255]);
    paste(sheet, tile, 0, 0, CROP, CROP, gx, gy);
  });
  notes.push('place ' + p.L + ' at X ' + p.x + ' Y ' + p.y + ' (' + basis + ')');
});
writePNG(out, sheet.width, sheet.height, 3, sheet.data);
console.log('written ' + out + ' (' + sheet.width + ' by ' + sheet.height + ')');
for (const n of notes) console.log(n);
console.log('masks standing: ' + list.length + ' of ' + slots.filter((s) => s.kind === 'mask' || s.kind === 'notmade').length + ' entries');
process.exit(0);
