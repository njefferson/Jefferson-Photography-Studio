// Step 5, part 2: prints the size and the share at a half (bytes 128 or more) of every mask of masks5, beside the share of the same mask before (masks2 for MobileSAM, masks3 for the cue stage). Exits 0 whatever it finds.
console.log('MADE TO FAIL: a planted 10 by 10 mask with 25 bytes of 200, 5 of 127 and the rest 0 must read a share at a half of 0.2500 (known figure 0.2500), and a planted mask of all 128 must read 1.0000 (known figure 1.0000)');
console.log('nothing below is trustworthy unless the plant lines read 0.2500 and 1.0000');
import { existsSync, readdirSync } from 'node:fs';
const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const { readGrey } = await import(SCRATCH + '/research/whole/png.mjs');
/** Takes mask bytes; gives the share of them at 128 or more. */
const share = (b) => { let n = 0; for (let i = 0; i < b.length; i++) if (b[i] >= 128) n++; return n / b.length; };
{
  const p = new Uint8Array(100); for (let i = 0; i < 25; i++) p[i] = 200; for (let i = 25; i < 30; i++) p[i] = 127;
  console.log('plant: share ' + share(p).toFixed(4) + ' and ' + share(new Uint8Array(100).fill(128)).toFixed(4));
}
try {
  const files = readdirSync(SCRATCH + '/masks5').filter((f) => f.endsWith('.png')).sort();
  for (const f of files) {
    const g = readGrey(SCRATCH + '/masks5/' + f);
    const before = f.startsWith('mobilesam-colour') ? SCRATCH + '/masks2/' + f : SCRATCH + '/masks3/' + f;
    let b = 'no before mask';
    if (existsSync(before)) { const h = readGrey(before); b = 'before ' + (share(h.data) * 100).toFixed(2) + ' percent'; }
    console.log(f + ': ' + g.width + ' by ' + g.height + ', after ' + (share(g.data) * 100).toFixed(2) + ' percent at a half; ' + b);
  }
  for (const fr of ['NIR_3742', 'NIR_3461', 'NIR_1873', 'NIR_3710']) for (const id of ['cue-all', 'cue-near']) {
    const names = readdirSync(SCRATCH + '/masks5').filter((f) => f.startsWith('mobilesam-colour-' + fr + '-')).map((f) => f.slice(('mobilesam-colour-' + fr + '-').length));
    for (const n of names) if (!existsSync(SCRATCH + '/masks5/' + id + '-' + fr + '-' + n)) console.log('NO MASK: ' + id + '-' + fr + '-' + n);
  }
} catch (e) { console.log('stopped: ' + (e && e.stack ? e.stack : e)); }
process.exit(0);
