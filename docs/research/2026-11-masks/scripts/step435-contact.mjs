// step435-contact.mjs: one contact picture for each frame of a model and way: a row for each subject the frame's samples name and a
// column for each input (open, natural, bright), each panel the mask drawn over the picture it was made on the way sheet.mjs draws it
// (magenta tint by weight, outline at a half in yellow), at 640 pixels wide so the whole picture is no wider than 2,000.
// Use: node step435-contact.mjs <model: slimsam|mobilesam> <way: joint|each> [only: a frame stem]
// Writes research/whole/maps-points/contact/<model>-<way>-<frame>.png and prints each panel's share at a half. Exits 0 whatever it finds.
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { readRGB, readGrey, writePNG } from '../research/whole/png.mjs';
import { text, blank, paste } from '../research/whole/draw.mjs';

console.log('MADE TO FAIL: a planted 8 by 4 mask whose left half is 255 and right half 0, averaged down by 4 to 2 by 1, must read 255 and 0 (known figures 255 and 0)');
console.log('nothing below is trustworthy unless the plant line reads 255 and 0');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const WHOLE = SCRATCH + '/research/whole';
const OUT = WHOLE + '/maps-points';
mkdirSync(OUT + '/contact', { recursive: true });
const SLUG = { 'Sky': 'sky', 'Foliage': 'foliage', 'Built things': 'built', 'Water': 'water' };
const PW = 640, GAP = 10, BAND = 60, LAB = 30, TINT = [255, 0, 200], LINE = [255, 230, 0];

/** Box-averages w by h one-channel bytes (stride channels, channel c) to pw by ph; returns a Float32Array. */
function boxDown(data, w, h, ch, c, pw, ph) {
  const out = new Float32Array(pw * ph);
  for (let y = 0; y < ph; y++) {
    const y0 = Math.floor((y * h) / ph), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * h) / ph));
    for (let x = 0; x < pw; x++) {
      const x0 = Math.floor((x * w) / pw), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * w) / pw));
      let s = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) { s += data[(yy * w + xx) * ch + c]; n++; }
      out[y * pw + x] = s / n;
    }
  }
  return out;
}
{
  const w = 8, h = 4, d = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[y * w + x] = x < 4 ? 255 : 0;
  const r = boxDown(d, w, h, 1, 0, 2, 1);
  console.log('plant: ' + r[0] + ' and ' + r[1]);
}

const [model, way, only] = process.argv.slice(2);
if (!way) { console.log('use: node step435-contact.mjs <model> <way> [frame]'); process.exit(0); }
const samples = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
for (const [stem, rec] of Object.entries(samples.frames)) {
  if (only && only !== stem) continue;
  const names = []; for (const s of rec.sets[0].samples) if (!names.includes(s.name)) names.push(s.name);
  const inputs = ['open', 'natural', 'bright'];
  // the size of a panel from the first picture
  const first = readRGB(WHOLE + '/frames/' + stem + '-open.png');
  const PH = Math.round((PW * first.height) / first.width);
  const sheet = blank(GAP + inputs.length * (PW + GAP), BAND + names.length * (PH + LAB + GAP), [20, 20, 20]);
  const title = model.toUpperCase() + ' ' + way.toUpperCase() + '. FRAME ' + stem + '. ROWS ARE SUBJECTS, COLUMNS ARE INPUTS: OPEN, NATURAL, BRIGHT-ONLY';
  text(sheet, 10, 10, title, Math.max(2, Math.min(4, Math.floor((sheet.width - 20) / (title.length * 6)))), [255, 255, 255]);
  for (let ci = 0; ci < inputs.length; ci++) {
    const inp = inputs[ci];
    let fp = WHOLE + '/frames/' + stem + '-' + inp + '.png';
    if (!existsSync(fp)) fp = OUT + '/inputs-bright/' + stem + '-bright.png';
    const f = readRGB(fp);
    const chans = [0, 1, 2].map((c) => boxDown(f.data, f.width, f.height, 3, c, PW, PH));
    for (let ri = 0; ri < names.length; ri++) {
      const subj = names[ri];
      const mp = OUT + '/' + model + '-' + way + '-' + inp + '-' + stem + '-' + SLUG[subj] + '.png';
      const x0 = GAP + ci * (PW + GAP), y0 = BAND + ri * (PH + LAB + GAP);
      if (!existsSync(mp)) { text(sheet, x0, y0 + 6, 'NO MASK ' + inp.toUpperCase() + ' ' + subj.toUpperCase(), 3, [255, 120, 120]); continue; }
      const m = readGrey(mp);
      let on = 0; for (let i = 0; i < m.data.length; i++) if (m.data[i] >= 128) on++;
      const share = (on / m.data.length) * 100;
      const md = boxDown(m.data, m.width, m.height, 1, 0, PW, PH);
      const panel = { width: PW, height: PH, data: new Uint8Array(PW * PH * 3) };
      for (let i = 0; i < PW * PH; i++) {
        const a = 0.55 * (md[i] / 255);
        for (let c = 0; c < 3; c++) panel.data[3 * i + c] = Math.round(chans[c][i] * (1 - a) + TINT[c] * a);
      }
      for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
        const i = y * PW + x, v = md[i] >= 128;
        if ((x > 0 && (md[i - 1] >= 128) !== v) || (x < PW - 1 && (md[i + 1] >= 128) !== v) || (y > 0 && (md[i - PW] >= 128) !== v) || (y < PH - 1 && (md[i + PW] >= 128) !== v)) {
          panel.data[3 * i] = LINE[0]; panel.data[3 * i + 1] = LINE[1]; panel.data[3 * i + 2] = LINE[2];
        }
      }
      text(sheet, x0, y0 + 6, inp.toUpperCase() + '. ' + subj.toUpperCase() + '. TAKEN ' + share.toFixed(1) + '%', 3, [255, 255, 255]);
      paste(sheet, panel, 0, 0, PW, PH, x0, y0 + LAB);
      console.log(stem + ' ' + inp + ' ' + subj + ': ' + share.toFixed(1) + ' percent at a half');
    }
  }
  const out = OUT + '/contact/' + model + '-' + way + '-' + stem + '.png';
  writePNG(out, sheet.width, sheet.height, 3, sheet.data);
  console.log('contact: ' + out + ' (' + sheet.width + ' by ' + sheet.height + ')');
}
process.exit(0);
