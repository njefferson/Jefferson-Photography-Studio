// Step 2, part 1. Usage: node step2-inputs.mjs <frame>. Decodes the photograph as the harness's countDecode does, calls placeDecode on a grid the size of the guide itself
// (w and h the guide's width and height, k of 1, fromW and fromH the same), and writes the two pictures a model is fed, once, as PNG under inputs2/:
//   <frame>-colour.png (RGB from placeDecode's pixels) and <frame>-grey.png (RGB, three equal channels, from its light).
// Prints the guide's size, and whether a resize would be needed for the model (longer side not 1024). Exits 0 whatever it finds.
console.log('MADE TO FAIL: a planted colour pixel 10 200 30 against a planted grey byte 199 must be reported as one mismatch (known figure 1); a planted pair 10 200 30 and 200 must be reported as 0 mismatches (known figure 0)');
console.log('MADE TO FAIL: a planted guide of 2800 by 1864 must give a longer side of 2800, which is not 1024, so a resize is called for (known figure: resize needed true)');
console.log('nothing below is trustworthy unless the plant lines read 1 and 0 and true');
import { readFileSync, mkdirSync } from 'node:fs';

const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const OUT = SCRATCH + '/inputs2';
const M = await import(SCRATCH + '/scratch/step452-bundle.mjs');
const P = await import(WHOLE + '/png.mjs');
mkdirSync(OUT, { recursive: true });

/** Takes colour RGBA bytes and grey light bytes of the same pixel count; gives the number of pixels whose largest colour byte differs from the grey byte. */
function mismatches(rgba, grey) {
  let bad = 0;
  for (let i = 0; i < grey.length; i++) {
    const a = rgba[4 * i], b = rgba[4 * i + 1], c = rgba[4 * i + 2];
    const top = a > b ? (a > c ? a : c) : (b > c ? b : c);
    if (top !== grey[i]) bad++;
  }
  return bad;
}
console.log('plant: mismatches of the wrong pair ' + mismatches(Uint8Array.from([10, 200, 30, 255]), Uint8Array.from([199])) + ', of the right pair ' + mismatches(Uint8Array.from([10, 200, 30, 255]), Uint8Array.from([200])));
console.log('plant: resize needed for a guide 2800 by 1864: ' + (Math.max(2800, 1864) !== 1024));

const frame = process.argv[2];
if (!frame) { console.log('use: node step2-inputs.mjs <frame>'); process.exit(0); }
try {
  const meta = JSON.parse(readFileSync(WHOLE + '/frames/' + frame + '-open.json', 'utf8'));
  const { resolve } = await import('/home/user/Jefferson-Photography-Studio/tools/owner-images.mjs');
  const path = await resolve(meta.file);
  const bytes = readFileSync(path);
  const t0 = Date.now();
  const imported = await M.importFile(new File([bytes], meta.file));
  const img = await M.decode({ ...imported, bytes: imported.bytes.slice() });
  const tDecode = (Date.now() - t0) / 1000;
  if (img.width !== meta.width || img.height !== meta.height) throw new Error('the decode is ' + img.width + ' by ' + img.height + ' and the kept picture ' + meta.width + ' by ' + meta.height);
  // the guide's size is learnt from a one-pixel call, then the real call is made on a grid of exactly that size
  const probe = M.placeDecode(img, { w: 1, h: 1, k: 1, fromW: 1, fromH: 1 });
  const gw = probe.guideW, gh = probe.guideH;
  const t1 = Date.now();
  const own = M.placeDecode(img, { w: gw, h: gh, k: 1, fromW: gw, fromH: gh });
  const tPlace = (Date.now() - t1) / 1000;
  if (own.guideW !== gw || own.guideH !== gh) throw new Error('the guide changed size between two calls');
  if (own.light.length !== gw * gh || own.pixels.length !== gw * gh * 4) throw new Error('light ' + own.light.length + ' or pixels ' + own.pixels.length + ' not the guide size');
  const n = gw * gh;
  const colour = new Uint8Array(n * 3), grey = new Uint8Array(n * 3);
  for (let i = 0; i < n; i++) {
    colour[3 * i] = own.pixels[4 * i]; colour[3 * i + 1] = own.pixels[4 * i + 1]; colour[3 * i + 2] = own.pixels[4 * i + 2];
    const v = own.light[i]; grey[3 * i] = v; grey[3 * i + 1] = v; grey[3 * i + 2] = v;
  }
  P.writePNG(OUT + '/' + frame + '-colour.png', gw, gh, 3, colour);
  P.writePNG(OUT + '/' + frame + '-grey.png', gw, gh, 3, grey);
  const bad = mismatches(own.pixels, own.light);
  console.log(frame + ': photograph ' + img.width + ' by ' + img.height + '; guide ' + gw + ' by ' + gh + ' (' + n + ' pixels); longer side ' + Math.max(gw, gh) + (Math.max(gw, gh) === 1024 ? ', so no resize is made for the model' : ', not 1024, so the model script resizes') + '; gains ' + own.gains.map((g) => g.toFixed(4)).join(' '));
  console.log(frame + ': contract check, pixels whose largest colour byte differs from the grey byte: ' + bad + ' of ' + n + (bad ? ' (THE CONTRACT DOES NOT HOLD HERE)' : ' (holds)'));
  console.log(frame + ': decode ' + tDecode.toFixed(1) + ' s, placeDecode ' + tPlace.toFixed(1) + ' s');
  console.log(frame + ': written ' + OUT + '/' + frame + '-colour.png and ' + OUT + '/' + frame + '-grey.png');
} catch (e) {
  console.log('stopped: ' + (e && e.message ? e.message : e));
}
process.exit(0);
