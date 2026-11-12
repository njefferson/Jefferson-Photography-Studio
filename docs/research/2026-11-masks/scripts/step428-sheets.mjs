// Child of the step 428 runner. Usage: node step428-sheets.mjs <open|natural> [limit]. Draws every mask of a real frame the harness wrote with research/whole/sheet.mjs (run as a child, one mask each), over the picture the mask was made on, and writes the sheet maker's own words for each to research/whole/maps-recipe/sheets-raw-<input>.txt.
// Sheets go to research/whole/maps-recipe/sheets/. Prints and exits 0 whatever it finds.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
console.log('MADE TO FAIL: before any real mask, a child that exits 7 stands for a failing sheet maker and must be reported as 7 (known figure 7)');
console.log('nothing below is trustworthy if the plant is not reported as 7');
const plant = spawnSync('node', ['-e', 'process.exit(7)'], { encoding: 'utf8' });
console.log('plant exit code: ' + plant.status);

const WHOLE = '/tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole';
const input = process.argv[2] || 'open';
const limit = Number(process.argv[3] || 100000);
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
mkdirSync(WHOLE + '/maps-recipe/sheets', { recursive: true });
const index = JSON.parse(readFileSync(WHOLE + '/maps-recipe/index/index-' + input + '-frames.json', 'utf8'));
const out = [];
let done = 0;
for (const e of index) {
  if (!e.file || done >= limit) continue;
  const sheet = WHOLE + '/maps-recipe/sheets/sheet-' + slug(e.rendering) + '-' + input + '-' + e.picture + '-' + slug(e.subject);
  const r = spawnSync('node', [WHOLE + '/sheet.mjs', WHOLE + '/frames/' + e.picture + '-' + input + '.png', e.file, sheet, 'recipe 2.79 ' + e.rendering, input, e.picture, e.subject], { encoding: 'utf8', maxBuffer: 1 << 28 });
  out.push('### ' + e.picture + ' | ' + input + ' | ' + e.subject + ' | ' + e.rendering + ' | exit ' + r.status + ' | ' + sheet + '.png');
  out.push((r.stdout || '').trim().split('\n').slice(3).join('\n'));
  if (r.stderr) out.push('stderr: ' + r.stderr.trim());
  done++;
}
writeFileSync(WHOLE + '/maps-recipe/sheets-raw-' + input + '.txt', out.join('\n') + '\n');
console.log(input + ': ' + done + ' sheets drawn');
process.exit(0);
