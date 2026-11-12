// step423-render.mjs: one frame, rendered once, as the editor opens it with no look, through the app's own modules on the CPU route.
// Takes a file name the app's list holds. The file comes through tools/owner-images.mjs resolve(); it is read through importFile,
// decoded by decode (no lens plan, as the test page's read), set to freshBaseline's balance, exposure, recovery and swap, the
// measured denoise taken by measuredStrength and laid by makeRowDenoiser, the sliders' grids applied, and every pixel of the working
// copy developed by compileEdit. Writes research/whole/frames/<stem>-open.png at the working copy's own size, and a figures file beside it.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import * as M from './step423-bundle.mjs';
import { resolve } from '/home/user/Jefferson-Photography-Studio/tools/owner-images.mjs';
import { writePNG } from '../research/whole/png.mjs';

console.log('MADE TO FAIL: a planted grey of linear 0.25 in every channel, through compileEdit at a neutral edit with no matrix, must read 137 in every channel (known figure 137)');
console.log('nothing below is trustworthy unless the planted line reads 137 137 137');

const SCRATCH = dirname(dirname(fileURLToPath(import.meta.url)));
const FRAMES = SCRATCH + '/research/whole/frames';
mkdirSync(FRAMES, { recursive: true });

/** The test page's own neutral edit (src/debug.ts pictureParams), every control at its neutral value, then `over` on top. */
function neutral(over) {
  const p = {
    wb: [1, 1, 1], exposure: 1, recover: 0, swapRB: false, hue: 0, sat: 1, contrast: 1, denoise: 0,
    tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1],
    tone: [...M.TONE_DEFAULT], toneR: [...M.TONE_DEFAULT], toneG: [...M.TONE_DEFAULT], toneB: [...M.TONE_DEFAULT],
    lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false, forceBalance: false,
    hsFix: 1, hsBypass: false, vignette: 0, clarity: 0, dehaze: 0, sharpen: 0, texture: 0,
    hsl: M.hslDefault(), bwOn: false, bwMix: [1, 1, 1], grade: [...M.GRADE_DEFAULT], grainAmt: 0, grainSize: 1.5,
    vigAmt: 0, vigMid: 0.5, mix3: [...M.MIX3_DEFAULT], spots: [], crop: { ...M.CROP_DEFAULT }, straighten: 0,
  };
  return { ...p, ...JSON.parse(JSON.stringify(over)) };
}
const byte = (v) => Math.max(0, Math.min(255, Math.round(v * 255)));

{
  const e = M.compileEdit(neutral({}), undefined, 1, undefined, null, null, null, null);
  const out = new Float32Array(4);
  e(0.25, 0.25, 0.25, out, 0, 0.5, 0.5);
  console.log('planted: ' + byte(out[0]) + ' ' + byte(out[1]) + ' ' + byte(out[2]));
}

const name = process.argv[2];
const stem = name.replace(/\.[^.]+$/, '');
const t0 = Date.now();
const path = await resolve(name);
const bytes = readFileSync(path);
const file = new File([bytes], name);
const imported = await M.importFile(file);
console.log('read: ' + name + ', kind ' + imported.kind + ', ' + (bytes.length / (1024 * 1024)).toFixed(1) + ' MB');
const img = await M.decode({ ...imported, bytes: imported.bytes.slice() });
const tDecode = Date.now() - t0;
const w = img.width, h = img.height;
console.log('decoded: ' + w + ' by ' + h + ', isRaw ' + img.isRaw + ', rotate ' + (img.rotate ?? 0) + ', camera matrix ' + (img.camMatrix ? 'yes' : 'no') + ', linear copy ' + (img.linear ? 'yes' : 'no') + ', lens laid ' + (img.lensApplied ? 'yes' : 'none') + ', seconds ' + (tDecode / 1000).toFixed(1));

const base = M.freshBaseline(img);
const wb = base.wb.map((g) => M.snapGain(g));
const exposure = M.snapExposure(base.exposure);
const sampler = (x, y) => M.linearAt(img, x, y);
const measured = img.linear ? M.measuredStrength(sampler, w, h) : 0;
// The Noise reduction slider's own step is 0.01 (src/main.ts, the line that opens a photograph with snapStep(..., 0.01), "the #dn slider's own step").
const denoise = Math.round(measured * 100) / 100;
console.log('baseline: gains ' + base.wb.map((g) => g.toFixed(4)).join(', ') + ' snapped ' + wb.map((g) => g.toFixed(4)).join(', ')
  + '; exposure ' + base.exposure.toFixed(4) + ' snapped ' + exposure.toFixed(4) + '; recover ' + base.recover + '; swap ' + base.swapRB
  + '; denoise measured ' + measured.toFixed(4) + ' on the slider ' + denoise.toFixed(2));

const p = neutral({ wb, exposure, recover: base.recover, swapRB: base.swapRB, denoise });
const den = M.makeRowDenoiser(sampler, w, h, denoise, 1, 0, 0);
const edit = M.compileEdit(p, img.camMatrix, w / h, undefined, null, null, null, M.srcFlatOf(img));
const out = new Float32Array(4);
const rgb = new Uint8Array(w * h * 3);
const t1 = Date.now();
for (let y = 0; y < h; y++) {
  for (let x = 0; x < w; x++) {
    const s = den(x, y);
    edit(s[0], s[1], s[2], out, 0, (x + 0.5) / w, (y + 0.5) / h);
    const o = (y * w + x) * 3;
    rgb[o] = byte(out[0]); rgb[o + 1] = byte(out[1]); rgb[o + 2] = byte(out[2]);
  }
}
const tDev = Date.now() - t1;
const png = FRAMES + '/' + stem + '-open.png';
writePNG(png, w, h, 3, rgb);
let sum = [0, 0, 0];
for (let i = 0; i < w * h; i++) { sum[0] += rgb[3 * i]; sum[1] += rgb[3 * i + 1]; sum[2] += rgb[3 * i + 2]; }
console.log('mean bytes: ' + sum.map((v) => (v / (w * h)).toFixed(1)).join(', '));
// Every figure is rounded to at most four places, so that no long run of digits is written.
const r4 = (v) => Math.round(v * 10000) / 10000;
writeFileSync(FRAMES + '/' + stem + '-open.json', JSON.stringify({
  file: name, width: w, height: h, rotate: img.rotate ?? 0, isRaw: img.isRaw, lensLaid: !!img.lensApplied,
  gainsMeasured: base.wb.map(r4), gains: wb.map(r4), exposureMeasured: r4(base.exposure), exposure: r4(exposure), recover: r4(base.recover), swapRB: base.swapRB,
  denoiseMeasured: r4(measured), denoise, decodeSeconds: r4(tDecode / 1000), developSeconds: r4(tDev / 1000),
  route: 'importFile, decode with no lens plan, freshBaseline, sliders snapped, measuredStrength and makeRowDenoiser, compileEdit per pixel; no look',
}, null, 1));
console.log('wrote ' + png + ' (' + w + ' by ' + h + '), develop seconds ' + (tDev / 1000).toFixed(1));
process.exit(0);
