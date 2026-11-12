// compose-comparison.mjs: the comparison picture of one frame and one subject, 1576 pixels wide and 1267 tall.
// Top row, three panels: 1 the frame with its samples; 2 the mask from the drawn picture; 3 the mask from the decode, each mask drawn over the frame as the sheet maker draws it (magenta tint by weight, outline at a half in yellow),
// under a title that names which mask it is and the share of the frame it takes at a half. Under them three places spaced evenly along the edge of the mask from the decode cut at a half (or along the other mask's edge where that one has none),
// each place a row of three crops of 240 by 240 pixels at the frame's own size: the bare frame, the drawn way's edge, the decode way's edge, each edge a line one pixel wide, with a mark four pixels wide at the bottom left of each crop.
// The three places are outlined and lettered A, B and C on the three top panels.
// Use: node compose-comparison.mjs <frame> <subject> <out.png> [standin]
//   Reads research/decode/masks/drawn-<frame>-<subject slug>.png and decode-<frame>-<subject slug>.png. A mask file that is absent draws NOT YET MADE. With the word standin the drawn mask is used in the decode way's place and every title says so;
//   standin is for trying the script before the decode way stands, and a picture made with it is never a result.
// What it cannot show: the top panels bring the frame down to 512 pixels wide, so an edge's place within a few pixels is the crops' to show; the crops hold three places of the frame only.
console.log('MADE TO FAIL: the layout on built-in sizes must give a picture 1576 pixels wide and 1267 tall, not over 1600 either way (known figures 1576 and 1267)');
console.log('nothing below is trustworthy unless the plant line reads 1576 by 1267');

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { writePNG, readGrey, readRGB } from '../whole/png.mjs';
import { text, fillRect, blank, paste } from '../whole/draw.mjs';
import { areaDown, tintedWhole, shareAtHalf, drawSamples, samplesOf } from '../whole/compare/lib.mjs';
import { maskPath, has, innerEdge, noEdge, pickPlaces, rectOutline, cropWithEdge, label, WHOLE } from './lib.mjs';

const PW = 512, PH = 341, TB = 24, HEAD = 20, GAP = 10, CROP = 240, LABEL = 18, ROWGAP = 6;
const WIDTH = 3 * PW + 4 * GAP, TOP = HEAD + TB + PH, HEIGHT = TOP + GAP + 3 * (LABEL + TB + CROP + ROWGAP) + 8;
console.log('plant: layout ' + WIDTH + ' by ' + HEIGHT);

const [picture, subject, out, flag] = process.argv.slice(2);
if (!out) { console.log('use: node compose-comparison.mjs <frame> <subject> <out.png> [standin]'); process.exit(0); }
const standin = flag === 'standin';

const frame = readRGB(WHOLE + '/frames/' + picture + '-open.png'), W = frame.width, H = frame.height;
const small = areaDown(frame.data, W, H, PW, PH, 3);
const drawnFile = maskPath('drawn', picture, subject);
let decodeFile = maskPath('decode', picture, subject);
let decodeNote = 'DECODE';
if (standin) { decodeFile = drawnFile; decodeNote = 'STAND-IN DRAWN'; }
const drawn = has(drawnFile) ? readGrey(drawnFile) : null;
const decode = has(decodeFile) ? readGrey(decodeFile) : null;
for (const [nm, m] of [['drawn', drawn], ['decode', decode]]) if (m && (m.width !== W || m.height !== H)) { console.log('the ' + nm + ' mask is ' + m.width + ' by ' + m.height + ', not ' + W + ' by ' + H + ': it is not drawn'); }
const okD = drawn && drawn.width === W && drawn.height === H ? drawn : null;
const okC = decode && decode.width === W && decode.height === H ? decode : null;

// the three places: along the edge of the decode way's mask, else along the drawn way's where that has none
let along = 'DECODE', guide = okC;
if (!guide || noEdge(guide.data)) { guide = okD; along = 'DRAWN'; }
const edgeG = guide && !noEdge(guide.data) ? innerEdge(guide.data, W, H) : null;
const places = edgeG ? pickPlaces(edgeG, W, H, CROP) : [];
if (!places.length) { for (const f of [0.17, 0.5, 0.83]) places.push({ x0: Math.min(W - CROP, Math.floor(f * W - CROP / 2)), y0: Math.floor((H - CROP) / 2) }); along = 'NO EDGE: EVEN'; }
const edgeD = okD && !noEdge(okD.data) ? innerEdge(okD.data, W, H) : null;
const edgeC = okC && !noEdge(okC.data) ? innerEdge(okC.data, W, H) : null;

const sheet = blank(WIDTH, HEIGHT, [20, 20, 20]);
text(sheet, GAP, 3, 'COMPARISON. ' + picture + '. ' + subject + '. TINT = THE MASK, YELLOW = ITS EDGE AT A HALF' + (standin ? '. STAND-IN, NOT A RESULT' : ''), 2, [255, 255, 255]);
const notes = [];
const letters = ['A', 'B', 'C'];

function topPanel(k, title, mask) {
  const x = GAP + k * (PW + GAP), y = HEAD;
  let panel;
  let t = title;
  if (mask === 'samples') {
    panel = { width: PW, height: PH, data: Uint8Array.from(small) };
    drawSamples(panel, samplesOf(picture), W, H, PW / W);
  } else if (!mask) {
    panel = blank(PW, PH, [45, 45, 60]);
    text(panel, 20, PH / 2 - 14, 'NOT YET MADE', 4, [255, 255, 255]);
  } else {
    panel = tintedWhole(small, areaDown(mask.data, W, H, PW, PH, 1), PW, PH);
    t += ' ' + shareAtHalf(mask.data).toFixed(1) + '%';
  }
  places.forEach((p, i) => {
    const sx = Math.round(p.x0 * PW / W), sy = Math.round(p.y0 * PH / H), sw = Math.round(CROP * PW / W), sh = Math.round(CROP * PH / H);
    rectOutline(panel, sx - 1, sy - 1, sw + 2, sh + 2, [0, 0, 0], 4);
    rectOutline(panel, sx, sy, sw, sh, [255, 255, 255], 2);
    text(panel, sx + 4, sy + 4, letters[i], 3, [255, 255, 255]);
  });
  label(sheet, x + 4, y + 5, t, [255, 255, 255], 42);
  paste(sheet, panel, 0, 0, PW, PH, x, y + TB);
}
topPanel(0, '1 THE FRAME WITH ITS SAMPLES', 'samples');
topPanel(1, '2 MASK FROM THE DRAWN PICTURE', okD);
topPanel(2, '3 MASK FROM THE ' + decodeNote, okC);
notes.push('drawn mask ' + (okD ? 'drawn, ' + shareAtHalf(okD.data).toFixed(1) + ' percent at a half' : 'not made'));
notes.push('decode mask ' + (okC ? 'drawn, ' + shareAtHalf(okC.data).toFixed(1) + ' percent at a half' + (standin ? ' (STAND-IN: the drawn way)' : '') : 'not made'));

// the three rows of crops
places.forEach((p, i) => {
  const y = TOP + GAP + i * (LABEL + TB + CROP + ROWGAP);
  label(sheet, GAP, y + 1, 'PLACE ' + letters[i] + ' AT X ' + p.x0 + ' Y ' + p.y0 + ' OF ' + W + ' BY ' + H + '. ALONG THE EDGE OF THE ' + along + ' WAY MASK', [255, 255, 0], 100);
  const cols = [
    ['BARE FRAME', null, [255, 255, 255]],
    ['DRAWN WAY EDGE', edgeD, [255, 230, 0]],
    [standin ? 'STAND-IN EDGE' : 'DECODE WAY EDGE', edgeC, [0, 230, 255]],
  ];
  cols.forEach((c, j) => {
    const x = GAP + j * (CROP + GAP);
    const im = cropWithEdge(frame, p.x0, p.y0, CROP, c[1], c[2]);
    label(sheet, x + 4, y + LABEL + 5, c[0] + (j > 0 && !c[1] ? ' NONE' : ''), [255, 255, 255], 20);
    paste(sheet, im, 0, 0, CROP, CROP, x, y + LABEL + TB);
  });
});
// the key, to the right of the crops
const kx = GAP + 3 * (CROP + GAP) + 20, ky = TOP + GAP + LABEL + TB + 10;
const key = [
  'KEY',
  'THE CROPS ARE AT THE FRAMES OWN SIZE',
  'YELLOW LINE: THE DRAWN WAY MASK AT A HALF',
  'CYAN LINE: THE DECODE WAY MASK AT A HALF',
  'EACH LINE IS ONE PIXEL WIDE',
  'WHITE L WITH BLACK RIM: A MARK 4 PIXELS WIDE',
  'TO READ HOW FAR A LINE LIES FROM THE EDGE',
  'THE THING ITSELF HAS',
  'PLACES A, B, C ARE OUTLINED ON THE THREE',
  'PANELS ABOVE',
];
key.forEach((s, i) => label(sheet, kx, ky + i * 20, s, i === 0 ? [255, 255, 0] : [220, 220, 220], 46));
mkdirSync(dirname(out), { recursive: true });
writePNG(out, sheet.width, sheet.height, 3, sheet.data);
console.log('written ' + out + ' (' + sheet.width + ' by ' + sheet.height + ')');
for (const n of notes) console.log('panel: ' + n);
console.log('places: ' + places.map((p, i) => letters[i] + ' at ' + p.x0 + ',' + p.y0).join('; ') + ' along the ' + along + ' mask');
process.exit(0);
