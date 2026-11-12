// Step 2, part 4. Usage: node step2-index.mjs. Joins pictures2/index-<frame>.json (one for each frame) into pictures2/index.json and pictures2/index.txt: for each frame-subject the full paths of its whole picture and
// edges picture, and for the edges picture the place (x and y of the top left of the 240 by 240 crop, in frame pixels) of each crop for each mask. Prints the counts, and checks that every named file stands.
console.log('MADE TO FAIL: a built-in list of two parts holding 2 and 3 frame-subjects must be counted as 5 (known figure 5), and a planted path that does not stand must be counted as 1 missing (known figure 1)');
console.log('nothing below is trustworthy unless the plant line reads 5 and 1');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const D = SCRATCH + '/pictures2';
const FRAMES = ['NIR_3461', 'NIR_3466', 'NIR_1827', 'NIR_1651', 'NIR_3742', 'NIR_3705', 'NIR_3710', 'NIR_1873'];
const missing = (files) => files.filter((f) => !existsSync(f)).length;
console.log('plant: ' + ([[1, 2], [3, 4, 5]].flat().length) + ' frame-subjects in the planted parts, ' + missing([SCRATCH + '/does-not-stand.png']) + ' missing');

const all = [];
for (const f of FRAMES) all.push(...JSON.parse(readFileSync(D + '/index-' + f + '.json', 'utf8')));
const lines = [];
lines.push('Index of the pictures of step 2. Each frame-subject has a whole picture and an edges picture. For the edges picture each mask lists its three crops by the x and y of the top left in frame pixels (each crop is 240 by 240 at the frame\'s own size, 2800 by 1864 frame).');
let miss = 0;
for (const e of all) {
  lines.push('');
  lines.push(e.frame + ' ' + e.subject);
  lines.push('  whole: ' + e.whole);
  lines.push('  edges: ' + e.edges);
  miss += missing([e.whole, e.edges]);
  for (const m of e.masks) {
    miss += missing([m.file]);
    lines.push('  ' + m.mask + ' (' + m.file + '): ' + (m.places.length ? m.places.map((p) => p.crop + ' at x ' + p.x + ' y ' + p.y).join('; ') + ' (' + m.edge + ')' : 'no crop, ' + m.edge));
  }
}
writeFileSync(D + '/index.json', JSON.stringify(all, null, 1));
writeFileSync(D + '/index.txt', lines.join('\n') + '\n');
console.log('frame-subjects ' + all.length + '; files named that do not stand: ' + miss + '; written ' + D + '/index.txt and ' + D + '/index.json');
process.exit(0);
