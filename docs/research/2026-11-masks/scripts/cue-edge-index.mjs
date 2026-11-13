// Step 3, part 3. Usage: node step3-index.mjs. Joins pictures3/index-<frame>.json (one for each frame) into pictures3/index.json and pictures3/index.txt: for each frame-subject the full paths of its whole picture and
// edges picture, and for the edges picture the place (x and y of the top left of the 240 by 240 crop, in frame pixels) of each crop for each of the four masks. Also joins masks3/index-<frame>.json into masks3/index.json
// and masks3/index.txt (each mask's sure counts, the counted pixels that took part in the fit, the time, or the reason for no mask). Prints the counts, and checks that every named file stands.
console.log('MADE TO FAIL: a built-in list of two parts holding 2 and 3 frame-subjects must be counted as 5 (known figure 5), and a planted path that does not stand must be counted as 1 missing (known figure 1)');
console.log('nothing below is trustworthy unless the plant line reads 5 and 1');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const D = SCRATCH + '/pictures3', MD = SCRATCH + '/masks3';
const FRAMES = ['NIR_3461', 'NIR_3466', 'NIR_1827', 'NIR_1651', 'NIR_3742', 'NIR_3705', 'NIR_3710', 'NIR_1873'];
const missing = (files) => files.filter((f) => !existsSync(f)).length;
console.log('plant: ' + ([[1, 2], [3, 4, 5]].flat().length) + ' frame-subjects in the planted parts, ' + missing([SCRATCH + '/does-not-stand.png']) + ' missing');

const all = [], made = [];
for (const f of FRAMES) { all.push(...JSON.parse(readFileSync(D + '/index-' + f + '.json', 'utf8'))); made.push(...JSON.parse(readFileSync(MD + '/index-' + f + '.json', 'utf8'))); }
const lines = [];
lines.push('Index of the pictures of the cue edge step 1. Each frame-subject has a whole picture and an edges picture. For the edges picture each of the four masks lists its three crops by the x and y of the top left in frame pixels (each crop is 240 by 240 at the frame\'s own size, 2800 by 1864 frame).');
let miss = 0, noMask = 0;
for (const e of all) {
  lines.push('');
  lines.push(e.frame + ' ' + e.subject);
  lines.push('  whole: ' + e.whole);
  lines.push('  edges: ' + e.edges);
  miss += missing([e.whole, e.edges]);
  for (const m of e.masks) {
    if (m.places.length === 0 && /^NO MASK/.test(m.edge)) noMask++; else miss += missing([m.file]);
    lines.push('  ' + m.mask + ' (' + m.file + '): ' + (m.places.length ? m.places.map((p) => p.crop + ' at x ' + p.x + ' y ' + p.y).join('; ') + ' (' + m.edge + ')' : 'no crop, ' + m.edge));
  }
}
writeFileSync(D + '/index.json', JSON.stringify(all, null, 1));
writeFileSync(D + '/index.txt', lines.join('\n') + '\n');
const ml = ['Index of the stage masks: for each, the sure pixels taken and left, the counted pixels that took part in the fit (subject side, other side), the time in ms, and the file or the reason for no mask.'];
for (const e of made) ml.push(e.frame + ' ' + e.subject + ' way ' + e.way + ': sure taken ' + e.sureTaken + ', sure left ' + e.sureLeft + ', fit ' + e.fitSubject + ' and ' + e.fitOther + ', ' + e.ms + ' ms, ' + (e.file ? e.file : 'NO MASK: ' + e.reason));
writeFileSync(MD + '/index.json', JSON.stringify(made, null, 1));
writeFileSync(MD + '/index.txt', ml.join('\n') + '\n');
miss += missing(made.filter((e) => e.file).map((e) => e.file));
console.log('frame-subjects ' + all.length + '; stage masks listed ' + made.length + ', made ' + made.filter((e) => e.file).length + ', no mask ' + made.filter((e) => !e.file).length + '; mask rows without a mask in pictures ' + noMask + '; files named that do not stand: ' + miss);
console.log('written ' + D + '/index.txt, ' + D + '/index.json, ' + MD + '/index.txt, ' + MD + '/index.json');
process.exit(0);
