// Step 4, part 1, the index. Usage: node step4-index.mjs. Reads pictures4/index-<frame>.json for the eight frames and writes pictures4/index.txt: for each frame-subject the evening's whole picture, the new magnified picture or pictures,
// and for each of the four masks each place's letter and centre. Exits 0 whatever it finds.
console.log('MADE TO FAIL: the formatter on a built-in entry with 4 masks of 3 places and one picture must give 7 lines and 12 places (known figures 7 and 12)');
console.log('MADE TO FAIL: the real run must count 22 frame-subjects, 88 mask lines and 264 places, and every picture file named must exist (known figures 22, 88, 264 and 0 missing)');
console.log('nothing below is trustworthy unless the plant lines read 7 and 12, then 22, 88, 264 and 0');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const FRAMES = ['NIR_1827', 'NIR_3742', 'NIR_3461', 'NIR_3466', 'NIR_1651', 'NIR_3705', 'NIR_3710', 'NIR_1873'];

/** Lines for one entry; gives { lines, places }. */
function format(e) {
  const lines = [e.frame + ' ' + e.subject, '  the evening whole picture: ' + e.whole, '  the new magnified picture' + (e.pictures.length > 1 ? 's' : '') + ': ' + e.pictures.map((p) => p.file).join(' and ')];
  let places = 0;
  for (const m of e.masks) {
    places += m.places.length;
    lines.push('  ' + m.mask + ' (' + m.words + '): ' + (m.places.length ? m.places.map((p) => p.crop + ' centre ' + p.centre[0] + ',' + p.centre[1]).join('; ') : 'no places: ' + m.none));
  }
  return { lines, places };
}
{
  const fake = { frame: 'F', subject: 'S', whole: '/w.png', pictures: [{ file: '/p.png' }], masks: [1, 2, 3, 4].map((i) => ({ mask: 'm' + i, words: 'w', places: [{ crop: 'A', centre: [1, 2] }, { crop: 'B', centre: [3, 4] }, { crop: 'C', centre: [5, 6] }] })) };
  const f = format(fake);
  console.log('plant: built-in entry gives ' + f.lines.length + ' lines and ' + f.places + ' places');
}
try {
  const out = [
    'Step 1 of the fine read: the magnified pictures. For each frame-subject, the evening whole picture (pictures3), the new magnified picture or pictures (pictures4), and the three places of each of the four masks (letter and centre, as the evening index gives them).',
    'Each magnified picture is 1484 by 1599 pixels. Per row: the context crop, the bare crop at three times, the banded crop at three times.',
    '',
  ];
  let entries = 0, maskLines = 0, places = 0, missing = 0;
  for (const fr of FRAMES) {
    const idx = JSON.parse(readFileSync(SCRATCH + '/pictures4/index-' + fr + '.json', 'utf8'));
    for (const e of idx) {
      const f = format(e);
      entries++; maskLines += e.masks.length; places += f.places;
      for (const p of e.pictures) if (!existsSync(p.file)) missing++;
      if (!existsSync(e.whole)) missing++;
      out.push(...f.lines, '');
    }
  }
  console.log('real: ' + entries + ' frame-subjects, ' + maskLines + ' mask lines, ' + places + ' places, ' + missing + ' files missing');
  writeFileSync(SCRATCH + '/pictures4/index.txt', out.join('\n'));
  console.log('wrote ' + SCRATCH + '/pictures4/index.txt');
} catch (e) { console.log('stopped: ' + (e && e.stack ? e.stack : e)); }
process.exit(0);
