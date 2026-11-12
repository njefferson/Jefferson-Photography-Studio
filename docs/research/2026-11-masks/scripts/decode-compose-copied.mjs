// compose-copied.mjs: the picture of a copied recipe for a pair of frames, 1590 pixels wide. A row for each subject both frames' samples name, four columns:
// 1 the second frame with its samples; 2 the recipe fitted on the first frame applied to the second by the drawn way; 3 the same by the decode way; 4 the second frame's own mask by the decode way.
// Each mask is drawn over the second frame as the sheet maker draws it (magenta tint by weight, outline at a half in yellow) under a title with the share of the frame it takes at a half.
// Use: node compose-copied.mjs <first frame> <second frame> <out.png> [standin]
//   Reads research/decode/copies/<way>-<first>-to-<second>-<subject slug>.png and research/decode/masks/decode-<second>-<subject slug>.png. A file that is absent draws NOT YET MADE.
//   With the word standin the drawn way's files are used in the decode way's place and every title says so; standin is for trying the script, and a picture made with it is never a result.
// What it cannot show: the panels bring the frame down to 385 pixels wide, so a region's place is shown and an edge's few pixels are not; a copied recipe is read by the region clause alone.
console.log('MADE TO FAIL: the layout for 3 subject rows on built-in sizes must give a picture 1590 pixels wide and 886 tall (known figures 1590 and 886)');
console.log('nothing below is trustworthy unless the plant line reads 1590 by 886');

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { writePNG, readGrey, readRGB } from '../whole/png.mjs';
import { text, blank, paste } from '../whole/draw.mjs';
import { areaDown, tintedWhole, shareAtHalf, drawSamples, samplesOf } from '../whole/compare/lib.mjs';
import { maskPath, copyPath, has, subjectsOf, label, WHOLE } from './lib.mjs';

const PW = 385, PH = 256, TB = 24, HEAD = 20, GAP = 10, ROWGAP = 6;
const WIDTH = 4 * PW + 5 * GAP;
const heightFor = (rows) => HEAD + rows * (TB + PH + ROWGAP) + 8;
console.log('plant: layout ' + WIDTH + ' by ' + heightFor(3));

const [A, B, out, flag] = process.argv.slice(2);
if (!out) { console.log('use: node compose-copied.mjs <first frame> <second frame> <out.png> [standin]'); process.exit(0); }
const standin = flag === 'standin';

const inA = subjectsOf(A), subjects = subjectsOf(B).filter((s) => inA.includes(s));
const frame = readRGB(WHOLE + '/frames/' + B + '-open.png'), W = frame.width, H = frame.height;
const small = areaDown(frame.data, W, H, PW, PH, 3);
const sheet = blank(WIDTH, heightFor(subjects.length), [20, 20, 20]);
text(sheet, GAP, 3, 'COPIED RECIPE. FITTED ON ' + A + ', APPLIED TO ' + B + (standin ? '. STAND-IN, NOT A RESULT' : ''), 2, [255, 255, 255]);

/** Takes a mask file path; gives the mask when the file stands at the frame's size, else null. */
function read(path) {
  if (!has(path)) return null;
  const m = readGrey(path);
  return m.width === W && m.height === H ? m : null;
}
const notes = [];
subjects.forEach((subject, r) => {
  const y = HEAD + r * (TB + PH + ROWGAP);
  const colour = (c) => GAP + c * (PW + GAP);
  const cells = [
    ['1 ' + subject.toUpperCase() + ' SAMPLES', 'samples'],
    ['2 DRAWN WAY COPY', read(copyPath('drawn', A, B, subject))],
    [standin ? '3 STAND-IN DRAWN COPY' : '3 DECODE WAY COPY', read(copyPath(standin ? 'drawn' : 'decode', A, B, subject))],
    [standin ? '4 STAND-IN OWN MASK' : '4 OWN MASK DECODE WAY', read(maskPath(standin ? 'drawn' : 'decode', B, subject))],
  ];
  cells.forEach((c, k) => {
    let panel, t = c[0];
    if (c[1] === 'samples') {
      panel = { width: PW, height: PH, data: Uint8Array.from(small) };
      drawSamples(panel, samplesOf(B), W, H, PW / W);
    } else if (!c[1]) {
      panel = blank(PW, PH, [45, 45, 60]);
      text(panel, 20, PH / 2 - 10, 'NOT YET MADE', 4, [255, 255, 255]);
      notes.push(subject + ' column ' + (k + 1) + ': not made');
    } else {
      panel = tintedWhole(small, areaDown(c[1].data, W, H, PW, PH, 1), PW, PH);
      t += ' ' + shareAtHalf(c[1].data).toFixed(1) + '%';
      notes.push(subject + ' column ' + (k + 1) + ': drawn, ' + shareAtHalf(c[1].data).toFixed(1) + ' percent at a half');
    }
    label(sheet, colour(k) + 4, y + 5, t, [255, 255, 255], 31);
    paste(sheet, panel, 0, 0, PW, PH, colour(k), y + TB);
  });
});
mkdirSync(dirname(out), { recursive: true });
writePNG(out, sheet.width, sheet.height, 3, sheet.data);
console.log('written ' + out + ' (' + sheet.width + ' by ' + sheet.height + ') for ' + subjects.length + ' subjects: ' + subjects.join(', '));
for (const n of notes) console.log('panel: ' + n);
process.exit(0);
