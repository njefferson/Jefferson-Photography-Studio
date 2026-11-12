// compose-comparison.mjs: the comparison picture of one picture and one subject: eight panels in two columns, 1400 pixels wide and under 2000 tall.
// Panel 1 is the frame as it opens with its samples drawn; panel 2 the 2.79 recipe's entry; panels 3 to 8 the two entries of each learned kind in the order entries.md gives.
// Each mask panel is the mask drawn over the frame as the sheet maker draws it (magenta tint by weight, outline at a half in yellow), under a title naming the entry's kind,
// input and variant and the share of the frame taken at a half. A kind with no entry has a panel that says NO ENTRY; an entry whose mask the index does not hold says NOT YET MADE.
// Use: node compose-comparison.mjs <picture> <subject> <index.json> <out.png>
//   index.json  a list of { entry, picture, subject, input, file }: research/whole/final/index.json after step 440, compare/trial/index-trial.json before it.
// What it cannot show: the panels are the frame brought down to 685 pixels wide, so a band of a few pixels is the crops picture's to show.
console.log('MADE TO FAIL: the layout on a built-in set of eight empty slots must give a picture 1400 pixels wide and not more than 2000 tall (known figures 1400 and 2000)');
console.log('nothing below is trustworthy unless the plant line reads width 1400 and a height not over 2000');

import { writePNG } from '../png.mjs';
import { text, fillRect, blank, paste } from '../draw.mjs';
import { areaDown, buildSlots, loadFrame, samplesOf, drawSamples, tintedWhole, shareAtHalf, fitScale } from './lib.mjs';
import { readGrey } from '../png.mjs';

const PW = 685, PH = 456, TB = 24, HEAD = 20, GAP = 10, ROWGAP = 6;
const WIDTH = 2 * PW + 3 * GAP, HEIGHT = HEAD + 4 * (TB + PH) + 3 * ROWGAP + 8;
console.log('plant: layout ' + WIDTH + ' by ' + HEIGHT);

const [picture, subject, indexPath, out] = process.argv.slice(2);
if (!out) { console.log('use: node compose-comparison.mjs <picture> <subject> <index.json> <out.png>'); process.exit(0); }

const frame = loadFrame(picture), W = frame.width, H = frame.height;
const small = areaDown(frame.data, W, H, PW, PH, 3);
const slots = buildSlots(picture, subject, indexPath);
const sheet = blank(WIDTH, HEIGHT, [20, 20, 20]);
text(sheet, GAP, 3, 'COMPARISON. ' + picture + '. ' + subject + '. TINT = THE MASK, YELLOW = ITS EDGE AT A HALF', 2, [255, 255, 255]);
const notes = [];
slots.forEach((s, k) => {
  const col = k % 2, row = Math.floor(k / 2);
  const x = GAP + col * (PW + GAP), y = HEAD + row * (TB + PH + ROWGAP);
  let title = s.title, panel;
  if (s.kind === 'samples') {
    panel = { width: PW, height: PH, data: Uint8Array.from(small) };
    drawSamples(panel, samplesOf(picture), W, H, PW / W);
    notes.push(s.n + ': frame with ' + samplesOf(picture).length + ' samples');
  } else if (s.kind === 'mask') {
    const m = readGrey(s.file);
    if (m.width !== W || m.height !== H) { panel = blank(PW, PH, [60, 20, 20]); text(panel, 10, 10, 'MASK SIZE DOES NOT MATCH', 3, [255, 255, 255]); title += ' (SIZE MISMATCH)'; }
    else {
      const share = shareAtHalf(m.data);
      panel = tintedWhole(small, areaDown(m.data, W, H, PW, PH, 1), PW, PH);
      title += ' ' + share.toFixed(1) + '%';
      notes.push(s.n + ': ' + s.entryId + ' drawn, ' + share.toFixed(1) + ' percent of the frame at a half');
    }
  } else {
    panel = blank(PW, PH, [45, 45, 60]);
    text(panel, 20, PH / 2 - 14, s.kind === 'none' ? 'NO ENTRY' : 'NOT YET MADE', 5, [255, 255, 255]);
    text(panel, 20, PH / 2 + 30, String(s.why || ''), fitScale(String(s.why || '').length, PW, 3, 1), [220, 220, 220]);
    notes.push(s.n + ': ' + (s.kind === 'none' ? 'no entry (' + s.why + ')' : 'not yet made'));
  }
  const t = title.length > 56 ? title.slice(0, 55) : title;
  text(sheet, x + 4, y + 5, t, 2, [255, 255, 255]);
  paste(sheet, panel, 0, 0, PW, PH, x, y + TB);
});
writePNG(out, sheet.width, sheet.height, 3, sheet.data);
console.log('written ' + out + ' (' + sheet.width + ' by ' + sheet.height + ')');
for (const n of notes) console.log('panel ' + n);
process.exit(0);
