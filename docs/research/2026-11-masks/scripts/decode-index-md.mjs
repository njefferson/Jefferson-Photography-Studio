// index-md.mjs: merges the harness's per-run index files into research/decode/masks/index.json and research/decode/copies/index.json (each a list of rows naming file, way, frame and subject),
// and writes research/decode/index.md: every comparison picture and every copied-recipe picture by full path, under the judging step that opens it, each marked missing if it is not on disk.
// Use: node index-md.mjs     (takes nothing; reads the samples file and the two folders)
// What it cannot show: that a picture on disk is a good one; it lists and checks that the file stands, nothing more.
console.log('MADE TO FAIL: the list of frame-subjects the samples file gives must count 22 (known figure 22), and the judging split must put 4 frames under step 454 and 4 under step 455 (known figures 4 and 4)');
console.log('nothing below is trustworthy unless the plant line reads 22 and 4 and 4');

import { readFileSync, writeFileSync, readdirSync, mkdirSync } from 'node:fs';
import { D, slug, has, subjectsOf, framesOf } from './lib.mjs';

const JUDGE = { 454: ['NIR_3461', 'NIR_3466', 'NIR_1827', 'NIR_1651'], 455: ['NIR_3742', 'NIR_3705', 'NIR_3710', 'NIR_1873'] };
const PAIRS = [['NIR_3705', 'NIR_3710'], ['NIR_3461', 'NIR_3466'], ['NIR_3742', 'NIR_1873']];
{
  let n = 0; for (const f of framesOf()) n += subjectsOf(f).length;
  console.log('plant: ' + n + ' frame-subjects; step 454 holds ' + JUDGE[454].length + ' frames and step 455 holds ' + JUDGE[455].length + ' (known 22, 4, 4)');
}

/** Takes a folder; gives the rows of every index-*.json in it, in file-name order. */
function merge(dir) {
  const rows = [];
  for (const n of readdirSync(dir).filter((x) => /^index-.*\.json$/.test(x)).sort()) rows.push(...JSON.parse(readFileSync(dir + '/' + n, 'utf8')));
  return rows;
}
mkdirSync(D + '/pictures', { recursive: true });
const masks = merge(D + '/masks'), copies = merge(D + '/copies');
writeFileSync(D + '/masks/index.json', JSON.stringify(masks, null, 1));
writeFileSync(D + '/copies/index.json', JSON.stringify(copies, null, 1));
console.log('merged: ' + masks.length + ' mask rows, ' + copies.length + ' copy rows');

const lines = ['# The pictures of the decode comparison (written by index-md.mjs)', '', 'D is ' + D + '. Each picture is listed by full path under the judging step that opens it; MISSING means the file is not on disk.', ''];
let expected = 0, standing = 0;
for (const step of [454, 455]) {
  lines.push('## Step ' + step + ' opens', '');
  for (const f of JUDGE[step]) {
    lines.push('### ' + f);
    for (const s of subjectsOf(f)) {
      const p = D + '/pictures/comparison-' + f + '-' + slug(s) + '.png';
      expected++; if (has(p)) standing++;
      lines.push('- ' + s + ': ' + p + (has(p) ? '' : ' MISSING'));
    }
    lines.push('');
  }
  if (step === 455) {
    lines.push('### The copied-recipe pictures', '');
    for (const [a, b] of PAIRS) {
      const p = D + '/pictures/copied-' + a + '-to-' + b + '.png';
      expected++; if (has(p)) standing++;
      lines.push('- ' + a + ' to ' + b + ' (' + subjectsOf(a).filter((x) => subjectsOf(b).includes(x)).join(', ') + '): ' + p + (has(p) ? '' : ' MISSING'));
    }
    lines.push('');
  }
}
lines.push('## Count', '', expected + ' pictures expected, ' + standing + ' on disk.', '');
writeFileSync(D + '/index.md', lines.join('\n'));
console.log('index.md written: ' + expected + ' expected, ' + standing + ' on disk');
process.exit(0);
