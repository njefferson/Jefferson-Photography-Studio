// Correction route, step 1: a copy of step3-compose.mjs changed only to read samples-added.json (Ground left out of the subjects), to draw five panels (the frame with its samples, the added ones as squares with a plus; MobileSAM before from masks2, MobileSAM
// after from masks5, way two before from masks3/cue-near, way two after from masks5/cue-near), to make no edges picture, and to write pictures5/whole-<frame>-<slug>.png and pictures5/index-<frame>.json with the three places of each after mask. Original header follows.
// Step 3, part 2 (cue edge, step 1). Usage: node step3-compose.mjs <frame>. A copy of step2-compose.mjs changed to draw four masks. For each subject of the frame's first sample set it composes two pictures under pictures3/,
// 1576 pixels wide, from the frame as it opens (research/whole/frames) and four masks:
//   the recipe (research/decode/masks/decode-<frame>-<slug>.png); MobileSAM on the colour picture, as it is (masks2/mobilesam-colour-...); MobileSAM with the cue stage fitted on every sure pixel (masks3/cue-all-...);
//   MobileSAM with the cue stage fitted on sure pixels near the edge (masks3/cue-near-...).
//   whole-<frame>-<slug>.png   five panels of the whole frame: 1 the frame with its samples, then the four masks, each a magenta tint by weight with its outline at a half in yellow, and on each mask panel a white square with a
//                              black rim whose area is one hundredth of the frame.
//   edges-<frame>-<slug>.png   for each of the four masks a row of three places along its own edge (the inner edge; the edge pixels at one sixth, one half and five sixths of their count in raster order, the 240 by 240 window
//                              centred on each and moved to lie in the frame), each a pair of crops at the frame's own size: the bare frame and the mask's line one pixel wide, with the white mark four pixels wide (black rim)
//                              at the bottom left of every crop. A mask not made, or with no edge at a half, has its panel and row say so, with the reason where masks3/index-<frame>.json gives one.
// Writes pictures3/index-<frame>.json (the paths and the places). Exits 0 whatever it finds.
console.log('MADE TO FAIL: the layout on built-in sizes must give a whole picture 1576 pixels wide, and an edges picture 1576 wide (known figures 1576 and 1576)');
console.log('MADE TO FAIL: innerEdge of a built-in 5 by 5 mask holding a 3 by 3 block of 255 must count 8 edge pixels, and the places by raster order of that edge at one sixth, one half and five sixths must read 2,1 3,2 2,3 (known figures 8 and 2,1 3,2 2,3)');
console.log('MADE TO FAIL: the square of one hundredth on a 512 by 341 panel must have a side whose square over the panel area reads 0.0101 (side 42; known figure 0.0101), and on a 2800 by 1864 frame a side of 228.5 pixels (known figure 228.5)');
console.log('MADE TO FAIL: a built-in mask of all 255 and one of all 0 must both be reported as having no edge (known figures true and true), and the 5 by 5 block mask as having one (known figure false)');
console.log('MADE TO FAIL: a built-in text of 20 words of 9 letters (199 characters) wrapped at 85 must give 3 lines, the longest 79 (8 words and 7 spaces; known figures 3 and 79)');
console.log('nothing below is trustworthy unless the plant lines read 1576 and 1576, 8 and 2,1 3,2 2,3, 0.0101 and 228.5, true true false, 3 and 79');
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const OUTD = SCRATCH + '/pictures5';
const { readRGB, readGrey, writePNG } = await import(WHOLE + '/png.mjs');
const { text, fillRect, blank, paste, circle, put } = await import(WHOLE + '/draw.mjs');
mkdirSync(OUTD, { recursive: true });

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const PW = 512, PH = 341, TB = 24, HEAD = 40, GAP = 10, CROP = 240, WIDTH = 3 * PW + 4 * GAP;
const TINT = [255, 0, 200], LINE = [255, 230, 0], CROPLINE = [255, 0, 60];

/** Mean over the source pixels each result pixel covers; takes the bytes, source size, result size and channels; gives a Uint8Array. */
function areaDown(src, sw, sh, dw, dh, ch) {
  const out = new Uint8Array(dw * dh * ch), xs = new Int32Array(dw + 1), ys = new Int32Array(dh + 1);
  for (let i = 0; i <= dw; i++) xs[i] = Math.round((i * sw) / dw);
  for (let j = 0; j <= dh; j++) ys[j] = Math.round((j * sh) / dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const x0 = xs[x], x1 = Math.max(xs[x + 1], x0 + 1), y0 = ys[y], y1 = Math.max(ys[y + 1], y0 + 1), area = (x1 - x0) * (y1 - y0);
    for (let c = 0; c < ch; c++) {
      let s = 0;
      for (let yy = y0; yy < y1; yy++) { let o = (yy * sw + x0) * ch + c; for (let xx = x0; xx < x1; xx++) { s += src[o]; o += ch; } }
      out[(y * dw + x) * ch + c] = Math.round(s / area);
    }
  }
  return out;
}
/** The pixels at 128 or more with a 4-neighbour under 128, a line one pixel wide. Takes bytes, width, height; gives a Uint8Array of 1 on the edge. */
function innerEdge(b, w, h) {
  const e = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (b[i] < 128) continue;
    if ((x > 0 && b[i - 1] < 128) || (x < w - 1 && b[i + 1] < 128) || (y > 0 && b[i - w] < 128) || (y < h - 1 && b[i + w] < 128)) e[i] = 1;
  }
  return e;
}
/** What a mask cut at a half holds: 'empty' (no pixel at a half), 'full' (none under a half) or 'edge'. Takes the bytes. */
function kindOf(b) {
  let hi = 0, lo = 0;
  for (let i = 0; i < b.length; i++) { if (b[i] >= 128) hi++; else lo++; if (hi && lo) return 'edge'; }
  return hi ? 'full' : 'empty';
}
/** The places of a mask's own edge: the window of `size` centred on the edge pixels at one sixth, one half and five sixths of their count in raster order, moved to lie inside the frame. Takes the edge, width, height, size; gives { x0, y0, cx, cy, n } for each. */
function places(edge, w, h, size) {
  const list = [];
  for (let i = 0; i < edge.length; i++) if (edge[i]) list.push(i);
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  return [1 / 6, 3 / 6, 5 / 6].map((q) => {
    const idx = Math.min(list.length - 1, Math.floor(q * list.length)), p = list[idx], cx = p % w, cy = (p - cx) / w;
    return { x0: clamp(cx - (size >> 1), 0, Math.max(0, w - size)), y0: clamp(cy - (size >> 1), 0, Math.max(0, h - size)), cx, cy, n: list.length };
  });
}
/** The tint by weight and the outline at a half over a picture: takes RGB bytes, a mask of the same size, width and height; gives { width, height, data } with an outline one pixel wide. */
function tintedWhole(frame, mask, w, h) {
  const im = { width: w, height: h, data: new Uint8Array(w * h * 3) };
  for (let i = 0; i < w * h; i++) { const a = 0.55 * (mask[i] / 255); for (let c = 0; c < 3; c++) im.data[3 * i + c] = Math.round(frame[3 * i + c] * (1 - a) + TINT[c] * a); }
  const e = innerEdge(mask, w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x, v = mask[i] >= 128;
    if (e[i] || (!v && ((x > 0 && mask[i - 1] >= 128) || (x < w - 1 && mask[i + 1] >= 128) || (y > 0 && mask[i - w] >= 128) || (y < h - 1 && mask[i + w] >= 128)))) put(im, x, y, LINE);
  }
  return im;
}
/** The white square with a black rim whose area is one hundredth of a PW by PH panel, at its bottom right. Takes the panel; gives the side in pixels. */
function hundredth(panel) {
  const s = Math.round(Math.sqrt(0.01 * PW * PH)), x = PW - 8 - s, y = PH - 8 - s;
  fillRect(panel, x - 2, y - 2, s + 4, s + 4, [0, 0, 0]);
  fillRect(panel, x, y, s, s, [255, 255, 255]);
  return s;
}
/** The white L with a black rim, each arm 4 pixels wide and 24 long, at the bottom left of a picture of size s. */
function bandMark(im, s) {
  const x = 6, yb = s - 6;
  fillRect(im, x - 1, yb - 25, 6, 26, [0, 0, 0]); fillRect(im, x - 1, yb - 5, 26, 6, [0, 0, 0]);
  fillRect(im, x, yb - 24, 4, 24, [255, 255, 255]); fillRect(im, x, yb - 4, 24, 4, [255, 255, 255]);
}
/** A crop of the frame at (x0, y0), size by size, at the frame's own size, with the edge (or null) as a line one pixel wide, and the four-pixel mark. */
function crop(frame, x0, y0, size, edge) {
  const im = { width: size, height: size, data: new Uint8Array(size * size * 3) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y0 + y) * frame.width + (x0 + x), o = (y * size + x) * 3;
    im.data[o] = frame.data[3 * i]; im.data[o + 1] = frame.data[3 * i + 1]; im.data[o + 2] = frame.data[3 * i + 2];
    if (edge && edge[i]) put(im, x, y, CROPLINE);
  }
  bandMark(im, size);
  return im;
}
/** Breaks a string into lines of at most `width` characters at spaces (a word longer than the width is cut). Takes the string and the width; gives a list of strings. */
function wrap(s, width) {
  const out = []; let line = '';
  for (const word of String(s).split(/\s+/)) {
    let wd = word;
    while (wd.length > width) { if (line) { out.push(line); line = ''; } out.push(wd.slice(0, width)); wd = wd.slice(width); }
    if (!line) line = wd; else if ((line + ' ' + wd).length <= width) line += ' ' + wd; else { out.push(line); line = wd; }
  }
  if (line) out.push(line);
  return out;
}
const label = (im, x, y, s, c, max) => text(im, x, y, String(s).length > max ? String(s).slice(0, max) : s, 2, c);
/** A panel title: at scale 2 where it fits the panel's width, else at scale 1. */
function panelTitle(im, x, y, s) {
  if (String(s).length * 12 <= PW - 8) text(im, x, y, s, 2, [255, 255, 255]);
  else text(im, x, y + 4, s, 1, [255, 255, 255]);
}

// way two = MobileSAM with the cue stage fitted on sure pixels near the edge. Before = the first samples (masks2, masks3); after = the added samples (masks5).
const KINDS = [
  { id: 'mobilesam-before', words: 'MobileSAM before, on the first samples', dir: '/masks2', stem: 'mobilesam-colour', stage: null },
  { id: 'mobilesam-after', words: 'MobileSAM after, with the added samples', dir: '/masks5', stem: 'mobilesam-colour', stage: null },
  { id: 'cue-near-before', words: 'way two before: MobileSAM and the cue stage near the edge, first samples', dir: '/masks3', stem: 'cue-near', stage: '/masks3' },
  { id: 'cue-near-after', words: 'way two after: MobileSAM and the cue stage near the edge, added samples', dir: '/masks5', stem: 'cue-near', stage: '/masks5' },
];
const maskFile = (k, frame, sl) => SCRATCH + k.dir + '/' + k.stem + '-' + frame + '-' + sl + '.png';
const WHOLE_H = HEAD + 2 * (TB + PH + GAP);
const ROW_H = 24 + 18 + CROP + 10, EDGES_H = 64 + 4 * ROW_H;
const NAME_COLOUR = { sky: [0, 220, 255], foliage: [60, 255, 60], 'built things': [255, 150, 0], water: [120, 120, 255], ground: [230, 190, 90] };

{
  const m = new Uint8Array(25);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m[y * 5 + x] = 255;
  const e = innerEdge(m, 5, 5); let n = 0; for (const v of e) n += v;
  const pl = places(e, 5, 5, 1);
  const side = Math.round(Math.sqrt(0.01 * PW * PH));
  console.log('plant: layout whole ' + WIDTH + ' by ' + WHOLE_H + ', edges ' + WIDTH + ' by ' + EDGES_H);
  console.log('plant: innerEdge counts ' + n + '; places ' + pl.map((p) => p.cx + ',' + p.cy).join(' '));
  console.log('plant: square side ' + side + ', area over the panel ' + (side * side / (PW * PH)).toFixed(4) + '; on 2800 by 1864 the side is ' + Math.sqrt(0.01 * 2800 * 1864).toFixed(1));
  console.log('plant: no edge: all 255 ' + (kindOf(new Uint8Array(25).fill(255)) !== 'edge') + ', all 0 ' + (kindOf(new Uint8Array(25)) !== 'edge') + '; the block mask ' + (kindOf(m) !== 'edge'));
  const wr = wrap(('abcdefghi ').repeat(20).trim(), 85);
  console.log('plant: wrap gives ' + wr.length + ' lines, the longest ' + Math.max(...wr.map((l) => l.length)));
}

const frameName = process.argv[2];
if (!frameName) { console.log('use: node step5-compose.mjs <frame>'); process.exit(0); }
try {
  const samplesFile = JSON.parse(readFileSync(WHOLE + '/samples-added.json', 'utf8'));
  const samples = samplesFile.frames[frameName].sets[0].samples;
  // the subjects as the original samples name them: a name with no added mark, the new name Ground left out
  const subjects = []; for (const s of samples) { const n = String(s.name).trim(); if (n && n !== 'rest' && n !== 'Ground' && !subjects.includes(n)) subjects.push(n); }
  const frame = readRGB(WHOLE + '/frames/' + frameName + '-open.png'), W = frame.width, H = frame.height;
  const small = areaDown(frame.data, W, H, PW, PH, 3);
  const stageIdx = { '/masks3': JSON.parse(readFileSync(SCRATCH + '/masks3/index-' + frameName + '.json', 'utf8')), '/masks5': JSON.parse(readFileSync(SCRATCH + '/masks5/index-' + frameName + '.json', 'utf8')) };
  console.log(frameName + ': frame ' + W + ' by ' + H + ', subjects ' + subjects.join(', '));
  const index = [];
  for (const subject of subjects) {
    const sl = slug(subject);
    const masks = KINDS.map((k) => {
      const file = maskFile(k, frameName, sl);
      const rec = { ...k, file, data: null, bad: null, why: '' };
      if (!existsSync(file)) {
        rec.bad = 'NO MASK';
        const ent = k.stage ? stageIdx[k.stage].find((e) => slug(e.subject) === sl && e.id === k.stem) : null;
        rec.why = ent && ent.reason ? ent.reason : 'the file does not stand';
        return rec;
      }
      const g = readGrey(file);
      if (g.width !== W || g.height !== H) { rec.bad = 'SIZE ' + g.width + ' BY ' + g.height; rec.why = 'the mask is not the frame\'s size'; return rec; }
      rec.data = g.data; rec.kind = kindOf(g.data);
      return rec;
    });
    // ---- the whole picture ----
    const whole = blank(WIDTH, WHOLE_H, [20, 20, 20]);
    label(whole, GAP, 4, 'WHOLE. ' + frameName + '. ' + subject + '. TINT = THE MASK BY WEIGHT. YELLOW LINE = ITS EDGE AT A HALF.', [255, 255, 255], 130);
    label(whole, GAP, 22, 'WHITE SQUARE = ONE HUNDREDTH OF THE FRAME. PANEL 1: CIRCLE = FIRST SAMPLE, SQUARE WITH PLUS = ADDED.', [255, 255, 0], 130);
    const panels = [{ title: '1 the frame with its samples, added ones marked', samples: true }].concat(masks.map((m, i) => ({ title: (i + 2) + ' ' + m.words, m })));
    let sqSide = 0;
    panels.forEach((p, k) => {
      const col = k % 3, row = Math.floor(k / 3), x = GAP + col * (PW + GAP), y = HEAD + row * (TB + PH + GAP);
      let panel;
      if (p.samples) {
        panel = { width: PW, height: PH, data: Uint8Array.from(small) };
        const sc = PW / W;
        for (const s of samples) {
          const c = NAME_COLOUR[s.name.toLowerCase()] || [255, 255, 255];
          const cx = s.x * W * sc, cy = s.y * H * sc, rr = s.r * Math.min(W, H) * sc;
          if (!s.placedBy) { circle(panel, cx, cy, rr, c, 2); text(panel, Math.round(cx - 5), Math.round(cy - 7), s.name[0], 2, c); }
          else {
            const q = Math.round(rr), x0 = Math.round(cx - q), y0 = Math.round(cy - q);
            fillRect(panel, x0 - 1, y0 - 1, 2 * q + 3, 3, [0, 0, 0]); fillRect(panel, x0 - 1, y0 + 2 * q - 1, 2 * q + 3, 3, [0, 0, 0]); fillRect(panel, x0 - 1, y0 - 1, 3, 2 * q + 3, [0, 0, 0]); fillRect(panel, x0 + 2 * q - 1, y0 - 1, 3, 2 * q + 3, [0, 0, 0]);
            fillRect(panel, x0, y0, 2 * q + 1, 1, [255, 255, 255]); fillRect(panel, x0, y0 + 2 * q, 2 * q + 1, 1, [255, 255, 255]); fillRect(panel, x0, y0, 1, 2 * q + 1, [255, 255, 255]); fillRect(panel, x0 + 2 * q, y0, 1, 2 * q + 1, [255, 255, 255]);
            text(panel, Math.round(cx - 11), Math.round(cy - 7), '+' + s.name[0], 2, [255, 255, 255]);
          }
        }
      } else if (!p.m.data) {
        panel = blank(PW, PH, [45, 45, 60]);
        text(panel, 20, 20, p.m.bad, 3, [255, 255, 255]);
        wrap(p.m.why, 82).slice(0, 14).forEach((ln, j) => text(panel, 20, 60 + j * 12, ln, 1, [255, 200, 200]));
      } else {
        panel = tintedWhole(small, areaDown(p.m.data, W, H, PW, PH, 1), PW, PH);
        sqSide = hundredth(panel);
      }
      panelTitle(whole, x + 4, y + 5, p.title);
      paste(whole, panel, 0, 0, PW, PH, x, y + TB);
    });
    const wholeFile = OUTD + '/whole-' + frameName + '-' + sl + '.png';
    writePNG(wholeFile, whole.width, whole.height, 3, whole.data);
    // ---- the edges picture ----
    // the three places of each AFTER mask's own edge (the evening's innerEdge and places); no edges picture is made here, step5-fine.mjs draws them magnified
    const idxEdges = [];
    masks.forEach((m) => {
      if (!m.id.endsWith('-after')) return;
      const letters = ['A', 'B', 'C'];
      if (!m.data) { idxEdges.push({ mask: m.id, file: m.file, edge: m.bad + ': ' + m.why, places: [] }); return; }
      if (m.kind !== 'edge') { idxEdges.push({ mask: m.id, file: m.file, edge: 'none (' + m.kind + ' at a half)', places: [] }); return; }
      const e = innerEdge(m.data, W, H), pl = places(e, W, H, CROP);
      idxEdges.push({ mask: m.id, file: m.file, edge: 'edge pixels ' + pl[0].n, places: pl.map((p, k) => ({ crop: letters[k], x: p.x0, y: p.y0, width: CROP, height: CROP, centre: [p.cx, p.cy] })) });
    });
    console.log('  ' + subject + ': whole ' + whole.width + ' by ' + whole.height + ' (square side ' + sqSide + ' on the panel, ' + (sqSide * sqSide / (PW * PH)).toFixed(4) + ' of its area); masks ' + masks.map((m) => m.id + ' ' + (m.data ? m.kind : m.bad)).join(', '));
    console.log('    ' + wholeFile + '; places ' + idxEdges.map((r) => r.mask + ' ' + (r.places.length ? r.places.map((p) => p.crop + '(' + p.centre.join(',') + ')').join(' ') : 'none')).join('; '));
    index.push({ frame: frameName, subject, whole: wholeFile, masks: idxEdges });
  }
  writeFileSync(OUTD + '/index-' + frameName + '.json', JSON.stringify(index, null, 1));
  console.log(frameName + ': ' + index.length + ' frame-subjects composed');
} catch (e) {
  console.log('stopped: ' + (e && e.stack ? e.stack : e));
}
process.exit(0);
