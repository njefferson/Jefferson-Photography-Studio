// Correction route, step 1: a copy of step4-fine.mjs changed only to read pictures5/index-<frame>.json, to draw the two after masks (MobileSAM after and way two after) in two columns, and to write to pictures5/. Original header follows.
// Step 4, part 1 (the magnified pictures). Usage: node step4-fine.mjs <frame>. For each subject of the frame in pictures3/index-<frame>.json it makes one picture pictures4/fine-<frame>-<slug>.png
// (or -part1 and -part2 if the twelve rows cannot fit in 1600 pixels on the longer side). For each of the four masks (the recipe, MobileSAM as it is, way one, way two), at each of its places A, B and C
// as the evening's index gives them, a row of three crops: the context crop (the evening's 240 by 240 window at the frame's own size, the mask's line in red, the central 80 by 80 outlined, the 4-pixel mark);
// the bare crop (the central 80 by 80, each pixel a 3 by 3 block, 240 by 240, only a 12-pixel mark); the banded crop (the same, with the line at a half thin and solid in yellow, the two borders of the band
// of distance 4 or less dashed in blue, and the 12-pixel mark). Writes pictures4/index-<frame>.json. Exits 0 whatever it finds.
console.log('MADE TO FAIL: on a planted 200 by 150 mask with a straight vertical edge, the band borders read from the composed bytes of the banded crop must lie 12 display pixels from the line on each side (known figures 12 and 12)');
console.log('MADE TO FAIL: the magnified window of a planted place at 100,75 on a planted frame must hold, at the display pixel 121,121 (the block whose corner is the window centre), the value of the frame pixel at 100,75 (known figure 100,75,139)');
console.log('MADE TO FAIL: every picture written must have a longer side of 1600 or less (known figure true; each size is printed)');
console.log('nothing below is trustworthy unless the plant lines read 12 and 12, 100,75,139 twice, and true');
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const OUTD = SCRATCH + '/pictures5';
const { readRGB, readGrey, writePNG } = await import(WHOLE + '/png.mjs');
const { text, fillRect, blank, paste, put } = await import(WHOLE + '/draw.mjs');
const { distanceTo } = await import(WHOLE + '/edt.mjs');
mkdirSync(OUTD, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const CROP = 240, AREA = 80, K = 3, BAND = 4, MAXSIDE = 1600;
const MARGIN = 8, CGAP = 4, COLGAP = 12, TITLE = 11, ROWGAP = 4, ROWP = TITLE + CROP + ROWGAP, HEAD = 66;
const COLW = 3 * CROP + 2 * CGAP;
const CROPLINE = [255, 0, 60], LINEY = [255, 255, 0], BANDB = [30, 60, 255];
const KINDS = [
  { id: 'mobilesam-after', words: 'MobileSAM after (added samples)' },
  { id: 'cue-near-after', words: 'way two after (cue stage near the edge)' },
];
const TITLE_COLOURS = [[0, 255, 255], [170, 255, 170]];

/** The pixels at 128 or more with a 4-neighbour under 128 (the evening's innerEdge). */
function innerEdge(b, w, h) {
  const e = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (b[i] < 128) continue;
    if ((x > 0 && b[i - 1] < 128) || (x < w - 1 && b[i + 1] < 128) || (y > 0 && b[i - w] < 128) || (y < h - 1 && b[i + w] < 128)) e[i] = 1;
  }
  return e;
}
/** The evening's white L with a black rim, arms 4 wide and 24 long, at the bottom left. */
function bandMark(im, s) {
  const x = 6, yb = s - 6;
  fillRect(im, x - 1, yb - 25, 6, 26, [0, 0, 0]); fillRect(im, x - 1, yb - 5, 26, 6, [0, 0, 0]);
  fillRect(im, x, yb - 24, 4, 24, [255, 255, 255]); fillRect(im, x, yb - 4, 24, 4, [255, 255, 255]);
}
/** The same L at the magnified scale: arms 12 display pixels (four frame pixels) wide and 36 long. */
function bigMark(im, s) {
  const x = 6, yb = s - 6;
  fillRect(im, x - 1, yb - 37, 14, 38, [0, 0, 0]); fillRect(im, x - 1, yb - 13, 38, 14, [0, 0, 0]);
  fillRect(im, x, yb - 36, 12, 36, [255, 255, 255]); fillRect(im, x, yb - 12, 36, 12, [255, 255, 255]);
}
/** The evening's crop of the frame at (x0, y0), size by size, at the frame's own size, with the edge (or null) as a 1-pixel line, and the 4-pixel mark. */
function contextCrop(frame, x0, y0, size, edge) {
  const im = { width: size, height: size, data: new Uint8Array(size * size * 3) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y0 + y) * frame.width + (x0 + x), o = (y * size + x) * 3;
    im.data[o] = frame.data[3 * i]; im.data[o + 1] = frame.data[3 * i + 1]; im.data[o + 2] = frame.data[3 * i + 2];
    if (edge && edge[i]) put(im, x, y, CROPLINE);
  }
  bandMark(im, size);
  return im;
}
function outline(im, x, y, w, h) {
  fillRect(im, x - 1, y - 1, w + 2, 1, [0, 0, 0]); fillRect(im, x - 1, y + h, w + 2, 1, [0, 0, 0]);
  fillRect(im, x - 1, y - 1, 1, h + 2, [0, 0, 0]); fillRect(im, x + w, y - 1, 1, h + 2, [0, 0, 0]);
  fillRect(im, x, y, w, 1, [255, 255, 255]); fillRect(im, x, y + h - 1, w, 1, [255, 255, 255]);
  fillRect(im, x, y, 1, h, [255, 255, 255]); fillRect(im, x + w - 1, y, 1, h, [255, 255, 255]);
}
/** The central 80 by 80 of a place: its top left in the frame, moved only as far as needed to lie inside. */
function areaOf(cx, cy, w, h) {
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  return { x: clamp(cx - (AREA >> 1), 0, Math.max(0, w - AREA)), y: clamp(cy - (AREA >> 1), 0, Math.max(0, h - AREA)) };
}
/** The 80 by 80 window of the frame at (x0, y0), each pixel a 3 by 3 block: 240 by 240. */
function magnify(frame, x0, y0) {
  const S = AREA * K, im = { width: S, height: S, data: new Uint8Array(S * S * 3) };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const i = (y0 + ((y / K) | 0)) * frame.width + (x0 + ((x / K) | 0)), o = (y * S + x) * 3;
    im.data[o] = frame.data[3 * i]; im.data[o + 1] = frame.data[3 * i + 1]; im.data[o + 2] = frame.data[3 * i + 2];
  }
  return im;
}
/** Traces the frame pixels where pred(x, y) holds, over the window at (x0, y0) and one pixel around it, as a thin line through the block centres joining each pixel to its neighbours (right, down, down-right, down-left). Dashed draws a 3-wide stroke with gaps. */
function trace(im, x0, y0, w, h, pred, colour, dashed) {
  const plot = (X, Y) => {
    if (dashed) {
      if ((((2 * X + Y) % 24) + 24) % 24 >= 12) return;
      put(im, X, Y, colour); put(im, X - 1, Y, colour); put(im, X + 1, Y, colour); put(im, X, Y - 1, colour); put(im, X, Y + 1, colour);
    } else put(im, X, Y, colour);
  };
  const NB = [[1, 0], [0, 1], [1, 1], [-1, 1]];
  for (let y = Math.max(0, y0 - 1); y <= Math.min(h - 1, y0 + AREA); y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(w - 1, x0 + AREA); x++) {
    if (!pred(x, y)) continue;
    const X = (x - x0) * K + 1, Y = (y - y0) * K + 1;
    plot(X, Y);
    for (const [dx, dy] of NB) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h || !pred(nx, ny)) continue;
      for (let t = 1; t <= K; t++) plot(X + dx * t, Y + dy * t);
    }
  }
}
/** The banded crop: the magnified window, the band's two borders dashed in blue (band pixels with a 4-neighbour outside the band), the line (the edge pixels) thin and solid in yellow, the 12-pixel mark. */
function bandedCrop(frame, edge, dist, x0, y0) {
  const w = frame.width, h = frame.height, im = magnify(frame, x0, y0);
  const inBand = (x, y) => dist[y * w + x] <= BAND;
  const border = (x, y) => inBand(x, y) && ((x > 0 && !inBand(x - 1, y)) || (x < w - 1 && !inBand(x + 1, y)) || (y > 0 && !inBand(x, y - 1)) || (y < h - 1 && !inBand(x, y + 1)));
  trace(im, x0, y0, w, h, border, BANDB, true);
  trace(im, x0, y0, w, h, (x, y) => edge[y * w + x] === 1, LINEY, false);
  bigMark(im, CROP);
  return im;
}
function bareCrop(frame, x0, y0) { const im = magnify(frame, x0, y0); bigMark(im, CROP); return im; }
function wrap(s, width) {
  const out = []; let line = '';
  for (const word of String(s).split(/\s+/)) {
    if (!line) line = word; else if ((line + ' ' + word).length <= width) line += ' ' + word; else { out.push(line); line = word; }
  }
  if (line) out.push(line);
  return out;
}
/** The layout of a picture: columns (lists of mask numbers), each mask three place rows. Gives { width, height }. */
const layoutSize = (cols) => ({ width: 2 * MARGIN + cols.length * COLW + (cols.length - 1) * COLGAP, height: HEAD + Math.max(...cols.map((c) => c.length * 3)) * ROWP + 3 });

// ---- plants, before any picture ----
let plantOk = true;
{
  const W = 200, H = 150, fr = { width: W, height: H, channels: 3, data: new Uint8Array(W * H * 3).fill(100) };
  const m = new Uint8Array(W * H); for (let y = 0; y < H; y++) for (let x = 100; x < W; x++) m[y * W + x] = 255;
  const e = innerEdge(m, W, H), d = distanceTo(W, H, (i) => e[i] === 1);
  const a = areaOf(100, 75, W, H), im = bandedCrop(fr, e, d, a.x, a.y);
  const cols = (c) => { const s = new Set(); for (let y = 0; y < CROP; y++) for (let x = 0; x < CROP; x++) { const o = (y * CROP + x) * 3; if (im.data[o] === c[0] && im.data[o + 1] === c[1] && im.data[o + 2] === c[2]) s.add(x); } return [...s].sort((p, q) => p - q); };
  const lc = cols(LINEY), bc = cols(BANDB);
  const lineCol = lc.reduce((p, q) => p + q, 0) / lc.length;
  const left = bc.filter((x) => x < lineCol), right = bc.filter((x) => x > lineCol);
  const lb = (left[0] + left[left.length - 1]) / 2, rb = (right[0] + right[right.length - 1]) / 2;
  console.log('plant 1: planted 200 by 150 mask, edge column 100, window x ' + a.x + '..' + (a.x + AREA - 1) + '; line columns read ' + lc.join(',') + ' (known 121); band border columns read ' + bc.join(',') + '; the borders lie ' + (lineCol - lb) + ' and ' + (rb - lineCol) + ' display pixels from the line (known figures 12 and 12)');
  if (lineCol - lb !== 12 || rb - lineCol !== 12) plantOk = false;
  const f2 = { width: W, height: H, channels: 3, data: new Uint8Array(W * H * 3) };
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const o = (y * W + x) * 3; f2.data[o] = x; f2.data[o + 1] = y; f2.data[o + 2] = (x * 7 + y * 13) & 255; }
  const a2 = areaOf(100, 75, W, H), b = bareCrop(f2, a2.x, a2.y), bd = bandedCrop(f2, e, d, a2.x, a2.y);
  const rd = (im2, X, Y) => { const o = (Y * CROP + X) * 3; return im2.data[o] + ',' + im2.data[o + 1] + ',' + im2.data[o + 2]; };
  const known = '100,75,' + ((100 * 7 + 75 * 13) & 255);
  const r1 = rd(b, 121, 121), r2 = rd(magnify(f2, a2.x, a2.y), 120, 120), r3 = rd(magnify(f2, a2.x, a2.y), 122, 122);
  console.log('plant 2: planted place centre 100,75, window top left ' + a2.x + ',' + a2.y + '; known value ' + known + '; read in the bare crop at display 121,121: ' + r1 + '; at 120,120 and 122,122 of the magnified window: ' + r2 + ' and ' + r3);
  if (r1 !== known || r2 !== known || r3 !== known) plantOk = false;
  const sz = layoutSize([[0], [1]]);
  console.log('plant 3 (layout before any picture): single picture ' + sz.width + ' by ' + sz.height + ', longer side ' + Math.max(sz.width, sz.height) + ' (limit ' + MAXSIDE + ')');
}

const frameName = process.argv[2];
if (!frameName) { console.log('use: node step4-fine.mjs <frame>'); process.exit(0); }
if (!plantOk) { console.log('STOPPED: a plant reads wrong, no picture made'); process.exit(0); }
try {
  const ev = JSON.parse(readFileSync(SCRATCH + '/pictures5/index-' + frameName + '.json', 'utf8'));
  const frame = readRGB(WHOLE + '/frames/' + frameName + '-open.png'), W = frame.width, H = frame.height;
  console.log(frameName + ': frame ' + W + ' by ' + H + ', subjects ' + ev.map((s) => s.subject).join(', '));
  const index = [];
  for (const s of ev) {
    const sl = slug(s.subject);
    // per mask: its rows of three crops, made once
    const rowsOf = KINDS.map((k, mi) => {
      const rec = s.masks.find((m) => m.mask === k.id);
      if (!rec || !rec.places.length) return { k, mi, none: rec ? rec.edge : 'not in the evening index', rows: [], places: [] };
      const g = readGrey(rec.file);
      if (g.width !== W || g.height !== H) return { k, mi, none: 'SIZE ' + g.width + ' BY ' + g.height, rows: [], places: [] };
      const e = innerEdge(g.data, W, H), d = distanceTo(W, H, (i) => e[i] === 1);
      const rows = rec.places.map((p) => {
        const a = areaOf(p.centre[0], p.centre[1], W, H);
        const ctx = contextCrop(frame, p.x, p.y, CROP, e);
        outline(ctx, a.x - p.x, a.y - p.y, AREA, AREA);
        return { p, a, crops: [ctx, bareCrop(frame, a.x, a.y), bandedCrop(frame, e, d, a.x, a.y)] };
      });
      return { k, mi, rows, places: rec.places.map((p, j) => ({ crop: p.crop, centre: p.centre, area: areaOf(p.centre[0], p.centre[1], W, H) })) };
    });
    const single = [[0], [1]];
    let parts = [{ name: '', cols: single }];
    const sz = layoutSize(single);
    if (Math.max(sz.width, sz.height) > MAXSIDE) throw new Error('a single picture would be ' + sz.width + ' by ' + sz.height + ', over ' + MAXSIDE);
    const pics = [];
    for (const part of parts) {
      const { width, height } = layoutSize(part.cols);
      const pic = blank(width, height, [20, 20, 20]);
      const order = part.cols.flat().map((mi) => KINDS[mi].words).join(', then ');
      const headLines = [
        [[255, 255, 255], 'FINE EDGES. ' + frameName + '. ' + s.subject + '. Two masks made with the added samples, each at its three places A, B and C along its own edge (the edge pixels at one sixth, one half and five sixths of their count in raster order). Order in this picture, left column then right: ' + order + '.'],
        [[255, 255, 0], 'EACH ROW HAS THREE CROPS, LEFT TO RIGHT. 1 CONTEXT: 240 BY 240 FRAME PIXELS AT THE SIZE OF THE FRAME, THE MASK LINE IN RED (1 PIXEL WIDE), THE CENTRAL 80 BY 80 OUTLINED IN WHITE WITH A BLACK RIM, WHITE L WITH BLACK RIM = A MARK 4 FRAME PIXELS WIDE.'],
        [[255, 255, 0], '2 BARE: THAT CENTRAL 80 BY 80 AT THREE TIMES THE SIZE OF THE FRAME (EACH FRAME PIXEL A 3 BY 3 BLOCK), 240 BY 240, NOTHING DRAWN BUT THE WHITE L MARK, 12 DISPLAY PIXELS WIDE = 4 FRAME PIXELS.'],
        [[255, 255, 0], '3 BANDED: THE SAME MAGNIFIED CROP WITH THE MASK LINE AT A HALF (YELLOW, THIN, SOLID) AND THE TWO BORDERS OF THE BAND (BLUE, DARKER THAN THE LINE, DASHED). THE BAND IS 4 FRAME PIXELS EITHER SIDE OF THE LINE = 12 DISPLAY PIXELS. BOTH MAGNIFIED CROPS ARE AT THREE TIMES THE SIZE OF THE FRAME.'],
      ];
      let hy = 3;
      for (const [c, t] of headLines) for (const ln of wrap(t, Math.floor((width - 2 * MARGIN) / 6))) { text(pic, MARGIN, hy, ln, 1, c); hy += 9; }
      if (hy > HEAD) throw new Error('head text too tall: ' + hy);
      part.cols.forEach((col, ci) => {
        let r = 0;
        for (const mi of col) {
          const R = rowsOf[mi], x0 = MARGIN + ci * (COLW + COLGAP);
          if (!R.rows.length) {
            const y = HEAD + r * ROWP;
            text(pic, x0, y + 2, frameName + '. ' + s.subject + '. ' + R.k.words + ': NO CROP. ' + R.none, 1, [255, 120, 120]);
            r += 3; continue;
          }
          R.rows.forEach((row) => {
            const y = HEAD + r * ROWP;
            const t = frameName + '. ' + s.subject + '. ' + R.k.words + '. Place ' + row.p.crop + ', centre ' + row.p.centre[0] + ',' + row.p.centre[1] + '.';
            if (t.length * 6 > COLW) console.log('  WARNING title too wide: ' + t);
            text(pic, x0, y + 2, t, 1, TITLE_COLOURS[mi]);
            row.crops.forEach((c, j) => paste(pic, c, 0, 0, CROP, CROP, x0 + j * (CROP + CGAP), y + TITLE));
            r++;
          });
        }
      });
      const file = OUTD + '/fine-' + frameName + '-' + sl + part.name + '.png';
      writePNG(file, pic.width, pic.height, 3, pic.data);
      const longer = Math.max(pic.width, pic.height);
      console.log('  plant 3: ' + file + ' is ' + pic.width + ' by ' + pic.height + ', longer side ' + longer + ' <= ' + MAXSIDE + ': ' + (longer <= MAXSIDE));
      console.log('    masks and places drawn: ' + part.cols.flat().map((mi) => rowsOf[mi].k.id + ' ' + (rowsOf[mi].rows.length ? rowsOf[mi].rows.map((r2) => r2.p.crop + '(' + r2.p.centre.join(',') + ')').join(' ') : 'none: ' + rowsOf[mi].none)).join('; '));
      pics.push({ file, width: pic.width, height: pic.height, part: part.name || null, masks: part.cols.flat().map((mi) => KINDS[mi].id) });
    }
    if (parts.length > 1) console.log('  ' + s.subject + ': split in two (-part1, -part2), a single picture would be ' + sz.width + ' by ' + sz.height);
    index.push({ frame: frameName, subject: s.subject, whole: s.whole, pictures: pics, masks: rowsOf.map((R) => ({ mask: R.k.id, words: R.k.words, none: R.none || null, places: R.places })) });
  }
  writeFileSync(OUTD + '/index-' + frameName + '.json', JSON.stringify(index, null, 1));
  console.log(frameName + ': ' + index.length + ' frame-subjects done');
} catch (e) {
  console.log('stopped: ' + (e && e.stack ? e.stack : e));
}
process.exit(0);
