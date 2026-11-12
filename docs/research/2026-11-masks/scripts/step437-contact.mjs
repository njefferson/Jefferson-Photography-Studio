// step437-contact.mjs: composes step 437's contact pictures, to be opened.
// Use: node step437-contact.mjs <fit> <job> [<job> ...]     a job is frame:<picture> or pair:<from>:<to>
//   frame:  one picture for a frame, a row for each subject its samples name and a last row for the patches given no subject, a column
//           for each input (open, natural, bright); 1622 pixels wide and at most 1939 tall.
//   pair:   one picture for a carried pair, a row for each subject both pictures' samples name and a last row for no subject, and for
//           each input two columns, the mask carried from the first photograph and the second photograph's own; 1976 pixels wide.
// Every panel is the whole frame as it opens, brought down by area averaging, with the mask drawn as the sheet maker draws it (a magenta
// tint by weight and the outline at a half in yellow, by compare/lib.mjs tintedWindow) and the samples of the picture the fit was made
// on drawn in their colours; a carried panel draws no samples, the fit's samples lying on another photograph. Each panel's title gives
// the share of the frame at a half, counted on the full-size mask. Writes under research/whole/maps-features/pictures. Exits 0 whatever it finds.
import { existsSync, mkdirSync } from 'node:fs';

console.log('MADE TO FAIL: a built-in 4 by 2 mask whose left half is 255, tinted over a black frame, must read 140 in the red of its top left pixel (known figure 140)');
console.log('nothing below is trustworthy unless the plant line reads 140');

const SCRATCH = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad';
const R = SCRATCH + '/research/whole';
const MF = R + '/maps-features';
const { readGrey, readRGB, writePNG } = await import(R + '/png.mjs');
const { text, fillRect, blank, paste } = await import(R + '/draw.mjs');
const { areaDown, tintedWindow, drawSamples, samplesOf, shareAtHalf } = await import(R + '/compare/lib.mjs');

{
  const m = new Uint8Array([255, 255, 0, 0, 255, 255, 0, 0]), f = new Uint8Array(8 * 3);
  const im = tintedWindow(f, m, 4, 2, 0, 0, 4, 2, 1);
  console.log('plant: red of the top left pixel ' + im.data[0]);
}

const INPUTS = ['open', 'natural', 'bright'];
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');
const BG = [28, 28, 28], WHITE = [255, 255, 255], GREY = [170, 170, 170];
const GAP = 8, HEAD = 34, TITLE = 22;
mkdirSync(MF + '/pictures', { recursive: true });

/** The frame as it opens, brought down to pw by ph; gives { small, W, H }. */
function frameSmall(pic, pw) {
  const p = pic.startsWith('plant-') ? R + '/planted/' + pic + '-open.png' : R + '/frames/' + pic + '-open.png';
  const f = readRGB(p), ph = Math.round((f.height * pw) / f.width);
  return { small: areaDown(f.data, f.width, f.height, pw, ph, 3), W: f.width, H: f.height, ph };
}

/** One panel: the mask over the small frame, with samples where given; or a grey panel saying the mask is missing. Gives { im, share }. */
function panel(fs, pw, maskPath, samples) {
  if (!existsSync(maskPath)) {
    const im = blank(pw, fs.ph, [60, 60, 60]);
    text(im, 10, 10, 'NO MASK ON DISK', 2, WHITE);
    return { im, share: NaN };
  }
  const m = readGrey(maskPath);
  const small = areaDown(m.data, m.width, m.height, pw, fs.ph, 1);
  const im = tintedWindow(fs.small, small, pw, fs.ph, 0, 0, pw, fs.ph, 1);
  if (samples) drawSamples(im, samples, fs.W, fs.H, pw / fs.W);
  return { im, share: shareAtHalf(m.data) };
}
const pct = (v) => (Number.isFinite(v) ? v.toFixed(1) + '%' : '-');

const [fit, ...jobs] = process.argv.slice(2);
for (const job of jobs) {
  const t0 = Date.now();
  const parts = job.split(':');
  if (parts[0] === 'frame') {
    const pic = parts[1], PW = 530;
    const fs = frameSmall(pic, PW), samples = samplesOf(pic);
    const names = [...new Set(samples.map((s) => s.name))];
    const rowsN = names.length + 1, rowH = TITLE + fs.ph + GAP;
    const sheet = blank(3 * PW + 4 * GAP, HEAD + rowsN * rowH, BG);
    text(sheet, GAP, 10, 'FITTED DINOV2 SMALL ' + fit.toUpperCase() + ' - ' + pic + ' - COARSE, NO EDGE STAGE - COLUMNS OPEN, NATURAL, BRIGHT', 2, WHITE);
    const shares = [];
    [...names, null].forEach((name, ri) => {
      INPUTS.forEach((inp, ci) => {
        const file = name ? MF + '/masks/features-' + fit + '-' + inp + '-' + pic + '-' + slug(name) + '.png' : MF + '/nosubject/features-' + fit + '-' + inp + '-' + pic + '.png';
        const { im, share } = panel(fs, PW, file, samples);
        const x = GAP + ci * (PW + GAP), y = HEAD + ri * rowH;
        text(sheet, x, y + 4, (name || 'no subject') + ' - ' + inp + ' - ' + pct(share), 2, name ? WHITE : GREY);
        paste(sheet, im, 0, 0, PW, fs.ph, x, y + TITLE);
        shares.push((name || 'no subject') + ' ' + inp + ' ' + pct(share));
      });
    });
    const out = MF + '/pictures/contact-' + fit + '-' + pic + '.png';
    writePNG(out, sheet.width, sheet.height, 3, sheet.data);
    console.log('picture ' + out + ' (' + sheet.width + ' by ' + sheet.height + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s): ' + shares.join('; '));
  } else if (parts[0] === 'pair') {
    const [, from, to] = parts, PW = 320;
    const fs = frameSmall(to, PW), toSamples = samplesOf(to);
    const fromNames = [...new Set(samplesOf(from).map((s) => s.name))], toNames = new Set(toSamples.map((s) => s.name));
    const names = fromNames.filter((n) => toNames.has(n));
    const rowsN = names.length + 1, rowH = 24 + TITLE + fs.ph + GAP;
    const sheet = blank(6 * PW + 7 * GAP, HEAD + rowsN * rowH, BG);
    text(sheet, GAP, 10, 'FITTED DINOV2 SMALL ' + fit.toUpperCase() + ' - CARRIED FROM ' + from + ' TO ' + to + ' BESIDE ' + to + ' OWN - COARSE', 2, WHITE);
    const shares = [];
    [...names, null].forEach((name, ri) => {
      const y = HEAD + ri * rowH;
      text(sheet, GAP, y + 4, name || 'no subject', 2, name ? WHITE : GREY);
      INPUTS.forEach((inp, ii) => {
        for (const [k, which] of [[0, 'carried'], [1, 'own']]) {
          const file = which === 'carried'
            ? (name ? MF + '/carried/features-' + fit + '-' + inp + '-' + from + '-to-' + to + '-' + slug(name) + '.png' : MF + '/nosubject/features-' + fit + '-' + inp + '-' + from + '-to-' + to + '.png')
            : (name ? MF + '/masks/features-' + fit + '-' + inp + '-' + to + '-' + slug(name) + '.png' : MF + '/nosubject/features-' + fit + '-' + inp + '-' + to + '.png');
          const { im, share } = panel(fs, PW, file, which === 'own' ? toSamples : null);
          const x = GAP + (2 * ii + k) * (PW + GAP);
          text(sheet, x, y + 26, inp + ' ' + which + ' ' + pct(share), 2, which === 'carried' ? [255, 200, 120] : WHITE);
          paste(sheet, im, 0, 0, PW, fs.ph, x, y + 24 + TITLE);
          shares.push((name || 'no subject') + ' ' + inp + ' ' + which + ' ' + pct(share));
        }
      });
    });
    const out = MF + '/pictures/carried-' + fit + '-' + from + '-to-' + to + '.png';
    writePNG(out, sheet.width, sheet.height, 3, sheet.data);
    console.log('picture ' + out + ' (' + sheet.width + ' by ' + sheet.height + ', ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s): ' + shares.join('; '));
  } else console.log('unknown job ' + job);
}
process.exit(0);
