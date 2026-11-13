// Step 5, part 3: writes pictures5/index.txt from pictures5/index-<frame>.json and research/whole/samples-added.json: for each of the 12 frame-subjects the full paths of its whole and magnified pictures, each after mask's three places by letter and centre,
// and the plan's regions that lie on it; then the four sample pictures and each added sample's name, x, y and r. Exits 0 whatever it finds.
console.log('MADE TO FAIL: the count of frame-subjects read from the four index files must be 12, of added samples 9, and of regions listed 5 numbers (1 to 5) each at least once (known figures 12, 9 and 5)');
console.log('nothing below is trustworthy unless the plant line reads 12, 9 and 5');
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const P5 = SCRATCH + '/pictures5';
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const FR = ['NIR_3742', 'NIR_3461', 'NIR_1873', 'NIR_3710'];
// the plan's five regions, as the plan names them
const REGIONS = [
  [1, 'NIR_3742', 'Built things', 'the bright tree on the island taken (about 3 to 5 hundredths); Foliage samples on that tree'],
  [2, 'NIR_3461', 'Sky', 'the sky inside the big left pylon taken into Built things and left out of Sky (about 5 to 11 hundredths); Sky samples in the lattice'],
  [2, 'NIR_3461', 'Built things', 'the same region seen from Built things'],
  [3, 'NIR_3461', 'Built things', 'the flap of cloud by the right pylon taken (about 1 to 2 hundredths); a Sky sample on it'],
  [4, 'NIR_1873', 'Foliage', 'the foreground pine at the lower right left out (about 4 to 10 hundredths); Foliage samples on it'],
  [5, 'NIR_3710', 'Foliage', 'the stony ground along the bottom taken; Ground samples on it (the new name)'],
];
try {
  const added = JSON.parse(readFileSync(SCRATCH + '/research/whole/samples-added.json', 'utf8'));
  const orig = JSON.parse(readFileSync(SCRATCH + '/research/whole/samples.json', 'utf8'));
  const lines = [];
  let n = 0;
  lines.push('Correction route, step 1. The 12 frame-subjects of the four frames. Pictures in ' + P5 + '.');
  lines.push('Each whole picture has five panels: the frame with its samples (added ones as squares with a plus), MobileSAM before, MobileSAM after, way two before, way two after.');
  lines.push('Each magnified picture shows the two after masks at three places each (the edge pixels at one sixth, one half and five sixths of their count in raster order), A, B, C.');
  lines.push('');
  for (const f of FR) {
    const idx = JSON.parse(readFileSync(P5 + '/index-' + f + '.json', 'utf8'));
    for (const s of idx) {
      n++;
      const sl = slug(s.subject), fine = P5 + '/fine-' + f + '-' + sl + '.png';
      lines.push(f + ' ' + s.subject);
      lines.push('  whole picture: ' + s.whole + (existsSync(s.whole) ? '' : ' (MISSING)'));
      lines.push('  magnified picture: ' + fine + (existsSync(fine) ? '' : ' (MISSING)'));
      for (const m of s.masks) lines.push('  ' + m.mask + ' places: ' + (m.places.length ? m.places.map((p) => p.crop + ' centre ' + p.centre.join(',')).join('; ') : 'none (' + m.edge + ')'));
      const rg = REGIONS.filter((r) => r[1] === f && r[2] === s.subject);
      lines.push('  regions of the plan on it: ' + (rg.length ? rg.map((r) => 'region ' + r[0] + ', ' + r[3]).join(' | ') : 'none'));
      lines.push('');
    }
  }
  lines.push('The four sample pictures (the frame at half size with all its samples, the added ones as squares with a plus), each with a full-size zoom of every added sample:');
  let na = 0;
  for (const f of FR) {
    lines.push('  ' + P5 + '/samples-' + f + '.png');
    const o = orig.frames[f].sets[0].samples.length, a = added.frames[f].sets[0].samples;
    a.slice(o).forEach((s, i) => { na++; lines.push('    added ' + f + ' ' + s.name + ' x ' + s.x + ' y ' + s.y + ' r ' + s.r + ' (' + s.placedBy + '); zoom ' + P5 + '/samples-' + f + '-zoom-' + (i + 1) + '.png'); });
  }
  console.log('plant: frame-subjects ' + n + ', added samples ' + na + ', regions ' + new Set(REGIONS.map((r) => r[0])).size);
  writeFileSync(P5 + '/index.txt', lines.join('\n') + '\n');
  console.log('written ' + P5 + '/index.txt (' + lines.length + ' lines)');
} catch (e) { console.log('stopped: ' + (e && e.stack ? e.stack : e)); }
process.exit(0);
