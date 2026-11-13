// Step 5 (correction route), part 1. Usage: node step5-samples.mjs. Writes research/whole/samples-added.json (a copy of samples.json in which the first set of NIR_3742, NIR_3461, NIR_1873 and NIR_3710 has the added samples appended,
// each with placedBy), checks that the original samples stand unchanged beside only the added ones, and draws pictures5/samples-<frame>.png (the frame at half size, original samples as circles with the name's first letter, added samples
// as squares in white with a plus and the letter) and, for each added sample, pictures5/samples-<frame>-zoom-<n>.png (a 360 by 360 window of the frame at its own size, the sample's circle and cross). Exits 0 whatever it finds.
console.log('MADE TO FAIL: the check on a planted copy of samples.json with one added sample must read unchanged true and added 1 (known figures true and 1); on a planted copy where one original sample is moved by 0.001 it must read unchanged false (known figure false); on a planted copy with one original removed it must read unchanged false (known figure false)');
console.log('nothing below is trustworthy unless the plant lines read true 1, false, false');
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
const SCRATCH = '/tmp/claude-0/-home-user/b3f240d3-0ca6-5704-9020-a2a0578bf6ab/scratchpad/masks-decode';
const WHOLE = SCRATCH + '/research/whole';
const { readRGB, writePNG } = await import(WHOLE + '/png.mjs');
const { text, blank, circle, fillRect, put } = await import(WHOLE + '/draw.mjs');
mkdirSync(SCRATCH + '/pictures5', { recursive: true });
const BY = 'session, 12 November 2026, on regions both fine-read judges named wrong';
// Each: frame, name, x, y (fractions), what it lies on.
const ADDS = [
  ['NIR_3742', 'Foliage', 0.454, 0.461, 'region 1, the tall bright tree on the island (its body)'],
  ['NIR_3742', 'Foliage', 0.371, 0.536, 'region 1, the bright tree-shrub on the island at the left of the tall tree'],
  ['NIR_3461', 'Sky', 0.076, 0.16, 'region 2, sky seen between members high in the big left pylon'],
  ['NIR_3461', 'Sky', 0.096, 0.496, 'region 2, sky seen between members low in the big left pylon'],
  ['NIR_3461', 'Sky', 0.929, 0.453, 'region 3, the cloud flap by the right pylon (upper of the two horizontal taken blobs)'],
  ['NIR_1873', 'Foliage', 0.768, 0.896, 'region 4, a needle tuft of the foreground pine at the lower right'],
  ['NIR_1873', 'Foliage', 0.618, 0.907, 'region 4, a needle tuft of the foreground pine, lower middle'],
  ['NIR_3710', 'Ground', 0.5, 0.94, 'region 5, the stony ground along the bottom (middle)'],
  ['NIR_3710', 'Ground', 0.79, 0.95, 'region 5, the stony ground along the bottom (right)'],
];
const R = 0.04;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
/** Takes the original and the added file's objects and the four frames; gives { unchanged, added: {frame: n} }: unchanged is true if every original sample of every frame and set is the same, in order, as the added file's first samples, and nothing else in the file differs. */
function check(orig, added, frames) {
  let unchanged = true; const n = {};
  const strip = (o, drop) => { const c = JSON.parse(JSON.stringify(o)); if (drop) for (const f of frames) c.frames[f].sets[0].samples = c.frames[f].sets[0].samples.slice(0, orig.frames[f].sets[0].samples.length); return c; };
  for (const f of frames) {
    const o = orig.frames[f].sets[0].samples, a = added.frames[f].sets[0].samples;
    if (a.length < o.length) { unchanged = false; n[f] = a.length - o.length; continue; }
    for (let i = 0; i < o.length; i++) if (!same(o[i], a[i])) unchanged = false;
    n[f] = a.length - o.length;
  }
  if (!same(orig, strip(added, true))) unchanged = false;
  return { unchanged, added: n };
}
const FR = ['NIR_3742', 'NIR_3461', 'NIR_1873', 'NIR_3710'];
const orig = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
{
  const c = JSON.parse(JSON.stringify(orig)); c.frames.NIR_3742.sets[0].samples.push({ name: 'Foliage', x: 0.5, y: 0.5, r: 0.04, placedBy: 'plant' });
  const r1 = check(orig, c, FR);
  const m = JSON.parse(JSON.stringify(c)); m.frames.NIR_3461.sets[0].samples[0].x += 0.001;
  const r2 = check(orig, m, FR);
  const d = JSON.parse(JSON.stringify(c)); d.frames.NIR_1873.sets[0].samples.shift();
  const r3 = check(orig, d, FR);
  console.log('plant: one added: unchanged ' + r1.unchanged + ', added ' + r1.added.NIR_3742 + '; one original moved: unchanged ' + r2.unchanged + '; one original removed: unchanged ' + r3.unchanged);
}
try {
  const out = JSON.parse(JSON.stringify(orig));
  for (const [f, name, x, y] of ADDS) out.frames[f].sets[0].samples.push({ name, x, y, r: R, placedBy: BY });
  const chk = check(orig, out, FR);
  console.log('check of the file to be written: original samples unchanged ' + chk.unchanged + '; counts of the originals ' + FR.map((f) => f + ' ' + orig.frames[f].sets[0].samples.length).join(', ') + '; counts added ' + FR.map((f) => f + ' ' + chk.added[f]).join(', '));
  if (!chk.unchanged) { console.log('STOPPED: the added file does not hold the originals unchanged; nothing written'); process.exit(0); }
  writeFileSync(WHOLE + '/samples-added.json', JSON.stringify(out, null, 1));
  console.log('written ' + WHOLE + '/samples-added.json');
  const COL = { sky: [0, 220, 255], foliage: [60, 255, 60], 'built things': [255, 150, 0], water: [120, 120, 255], ground: [230, 190, 90] };
  for (const f of FR) {
    const fr = readRGB(WHOLE + '/frames/' + f + '-open.png'), W = fr.width, H = fr.height, w = W >> 1, h = H >> 1;
    const im = { width: w, height: h, data: new Uint8Array(w * h * 3) };
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
      let s = 0; for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) s += fr.data[((2 * y + dy) * W + 2 * x + dx) * 3 + c];
      im.data[(y * w + x) * 3 + c] = s >> 2;
    }
    const smp = out.frames[f].sets[0].samples, nOrig = orig.frames[f].sets[0].samples.length;
    smp.forEach((s, i) => {
      const col = COL[s.name.toLowerCase()] || [255, 255, 255], cx = s.x * w, cy = s.y * h, r = s.r * Math.min(w, h);
      if (i < nOrig) { circle(im, cx, cy, r, col, 2); text(im, Math.round(cx - 5), Math.round(cy - 7), s.name[0], 2, col); }
      else {
        const q = Math.round(r);
        fillRect(im, Math.round(cx - q) - 2, Math.round(cy - q) - 2, 2 * q + 5, 5, [0, 0, 0]); fillRect(im, Math.round(cx - q) - 2, Math.round(cy + q) - 2, 2 * q + 5, 5, [0, 0, 0]);
        fillRect(im, Math.round(cx - q) - 2, Math.round(cy - q) - 2, 5, 2 * q + 5, [0, 0, 0]); fillRect(im, Math.round(cx + q) - 2, Math.round(cy - q) - 2, 5, 2 * q + 5, [0, 0, 0]);
        fillRect(im, Math.round(cx - q) - 1, Math.round(cy - q) - 1, 2 * q + 3, 3, [255, 255, 255]); fillRect(im, Math.round(cx - q) - 1, Math.round(cy + q) - 1, 2 * q + 3, 3, [255, 255, 255]);
        fillRect(im, Math.round(cx - q) - 1, Math.round(cy - q) - 1, 3, 2 * q + 3, [255, 255, 255]); fillRect(im, Math.round(cx + q) - 1, Math.round(cy - q) - 1, 3, 2 * q + 3, [255, 255, 255]);
        text(im, Math.round(cx - 11), Math.round(cy - 7), '+' + s.name[0], 2, [255, 255, 255]);
      }
    });
    fillRect(im, 0, 0, w, 36, [20, 20, 20]);
    text(im, 8, 4, f + '. CIRCLES = THE SAMPLES OF THE TEST PAGE (' + nOrig + '). SQUARES WITH A PLUS = ADDED BY A SESSION (' + (smp.length - nOrig) + ').', 2, [255, 255, 255]);
    text(im, 8, 21, 'COLOUR OF A CIRCLE: SKY CYAN, FOLIAGE GREEN, BUILT THINGS ORANGE, WATER BLUE, GROUND TAN. LETTER = THE NAME.', 1, [255, 255, 0]);
    const file = SCRATCH + '/pictures5/samples-' + f + '.png';
    writePNG(file, w, h, 3, im.data);
    console.log(f + ': ' + file + ' (' + w + ' by ' + h + '); ' + nOrig + ' original and ' + (smp.length - nOrig) + ' added samples drawn');
    let n = 0;
    smp.slice(nOrig).forEach((s) => {
      n++;
      const S = 360, cx = Math.round(s.x * W), cy = Math.round(s.y * H), r = Math.round(s.r * Math.min(W, H));
      const x0 = Math.max(0, Math.min(W - S, cx - S / 2)), y0 = Math.max(0, Math.min(H - S, cy - S / 2));
      const z = blank(S, S, [0, 0, 0]);
      for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const i = ((y0 + y) * W + x0 + x) * 3, o = (y * S + x) * 3; z.data[o] = fr.data[i]; z.data[o + 1] = fr.data[i + 1]; z.data[o + 2] = fr.data[i + 2]; }
      circle(z, cx - x0, cy - y0, r, [255, 255, 255], 2);
      for (let d = -12; d <= 12; d++) { put(z, cx - x0 + d, cy - y0, [255, 0, 60]); put(z, cx - x0, cy - y0 + d, [255, 0, 60]); }
      text(z, 4, 4, f + ' +' + s.name + ' ' + s.x + ',' + s.y + ' CENTRE ' + cx + ',' + cy + ' R ' + r, 1, [255, 255, 0]);
      const zf = SCRATCH + '/pictures5/samples-' + f + '-zoom-' + n + '.png';
      writePNG(zf, S, S, 3, z.data);
      console.log('  added ' + n + ': ' + s.name + ' x ' + s.x + ' y ' + s.y + ' r ' + s.r + ' (centre pixel ' + cx + ',' + cy + ', radius ' + r + ' px) zoom ' + zf);
    });
  }
  console.log('what each added sample is meant to lie on:');
  for (const a of ADDS) console.log('  ' + a[0] + ' ' + a[1] + ' ' + a[2] + ',' + a[3] + ': ' + a[4]);
} catch (e) { console.log('stopped: ' + (e && e.stack ? e.stack : e)); }
process.exit(0);
