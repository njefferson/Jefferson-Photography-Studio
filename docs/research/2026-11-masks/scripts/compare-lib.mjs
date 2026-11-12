// lib.mjs: the helpers the comparison scripts of step 438 share (paths, resizing, the count at a half, outlines, panels, the slots of a
// comparison picture). Imported by the scripts beside it; never run alone.
console.log('MADE TO FAIL: areaDown of a built-in 4 by 4 grey picture whose left two columns are 0 and right two are 255 must read 0 255 0 255 as a 2 by 2 picture, and resizeBilinear of the two values 0 and 1 to four values must read 0 0.25 0.75 1 (known figures 0 255 0 255 and 0 0.25 0.75 1)');
console.log('nothing below is trustworthy unless the plant lines read 0 255 0 255 and 0 0.25 0.75 1');

import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, isAbsolute } from 'node:path';
import { readGrey, readRGB } from '../png.mjs';
import { text, fillRect, blank, circle, put } from '../draw.mjs';

export const COMPARE = dirname(fileURLToPath(import.meta.url));
export const WHOLE = dirname(COMPARE);

/** Reads a JSON file. Takes a path; gives the parsed value. */
export function readJSON(path) { return JSON.parse(readFileSync(path, 'utf8')); }

/** A name as it stands in a file name: lower case, spaces to hyphens. Takes a string; gives a string. */
export function slug(s) { return String(s).toLowerCase().replace(/ /g, '-'); }

/** Walks a folder and gives the full paths of the files whose name and path pass `pred`; an absent folder gives an empty list. */
export function walkFiles(dir, pred, out = []) {
  if (!existsSync(dir)) return out;
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walkFiles(p, pred, out);
    else if (pred(n, p)) out.push(p);
  }
  return out;
}

/** Resolves the file an index row names: as written when it is a full path that stands, else beside the index file. Gives a path. */
export function resolveRow(file, indexPath) {
  if (isAbsolute(file) && existsSync(file)) return file;
  const beside = join(dirname(indexPath), file);
  return existsSync(beside) ? beside : file;
}

/** For each output position the two source positions and the weight of the second, on the bilinear rule with the pixel centres aligned. */
function axisOf(n, m) {
  const i0 = new Int32Array(m), i1 = new Int32Array(m), f = new Float32Array(m), scale = n / m;
  for (let o = 0; o < m; o++) {
    let s = (o + 0.5) * scale - 0.5;
    if (s < 0) s = 0;
    const a = Math.floor(s);
    i0[o] = Math.min(a, n - 1); i1[o] = Math.min(a + 1, n - 1); f[o] = s - a;
  }
  return { i0, i1, f };
}

/** Brings one plane of floats, sw by sh, to dw by dh by bilinear interpolation (the rule of the scene-class head's own step). Gives a Float32Array. */
export function resizeBilinear(src, sw, sh, dw, dh) {
  const out = new Float32Array(dw * dh), ax = axisOf(sw, dw), ay = axisOf(sh, dh);
  for (let y = 0; y < dh; y++) {
    const ra = ay.i0[y] * sw, rb = ay.i1[y] * sw, fy = ay.f[y];
    for (let x = 0; x < dw; x++) {
      const x0 = ax.i0[x], x1 = ax.i1[x], fx = ax.f[x];
      out[y * dw + x] = (src[ra + x0] * (1 - fx) + src[ra + x1] * fx) * (1 - fy) + (src[rb + x0] * (1 - fx) + src[rb + x1] * fx) * fy;
    }
  }
  return out;
}

/** Brings a picture of `ch` bytes a pixel, sw by sh, down to dw by dh by the mean over the source pixels each result pixel covers. Gives a Uint8Array. */
export function areaDown(src, sw, sh, dw, dh, ch = 1) {
  const out = new Uint8Array(dw * dh * ch), xs = new Int32Array(dw + 1), ys = new Int32Array(dh + 1);
  for (let i = 0; i <= dw; i++) xs[i] = Math.round((i * sw) / dw);
  for (let j = 0; j <= dh; j++) ys[j] = Math.round((j * sh) / dh);
  for (let y = 0; y < dh; y++) for (let x = 0; x < dw; x++) {
    const x0 = xs[x], x1 = Math.max(xs[x + 1], x0 + 1), y0 = ys[y], y1 = Math.max(ys[y + 1], y0 + 1), area = (x1 - x0) * (y1 - y0);
    for (let c = 0; c < ch; c++) {
      let s = 0;
      for (let yy = y0; yy < y1; yy++) { let o = (yy * sw + x0) * ch + c; for (let xx = x0; xx < x1; xx++) { s += src[o]; o += ch; } }
      out[(y * dw + x) * ch + c] = Math.round(s / area);
    }
  }
  return out;
}

{
  const g = new Uint8Array(16);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) g[y * 4 + x] = x < 2 ? 0 : 255;
  console.log('plant: areaDown reads ' + Array.from(areaDown(g, 4, 4, 2, 2)).join(' '));
  console.log('plant: resizeBilinear reads ' + Array.from(resizeBilinear(new Float32Array([0, 1]), 2, 1, 4, 1)).map((v) => v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')).join(' '));
}

/** The planted picture's truth: { data, width, height, regions }. Takes the picture's name. */
export function loadTruth(picture) {
  const t = readGrey(WHOLE + '/planted/' + picture + '-truth.png');
  return { data: t.data, width: t.width, height: t.height, regions: readJSON(WHOLE + '/planted/' + picture + '-truth.json').regions };
}

/** The truth values of the regions named `subject` (any letter case). Gives a list of numbers. */
export function valuesOf(regions, subject) {
  return regions.filter((r) => r.name.toLowerCase() === String(subject).toLowerCase()).map((r) => r.value);
}

/** Counts a mask (bytes) against a truth (bytes) for the truth values `values`, the mask cut at a half (byte 128 or more). Gives { tp, fp, fn, iou }; iou is tp over tp plus fp plus fn. */
export function iouAtHalf(mask, truth, values) {
  const want = new Uint8Array(256);
  for (const v of values) want[v] = 1;
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < mask.length; i++) {
    const m = mask[i] >= 128, t = want[truth[i]] === 1;
    if (m && t) tp++; else if (m) fp++; else if (t) fn++;
  }
  return { tp, fp, fn, iou: tp + fp + fn ? tp / (tp + fp + fn) : 0 };
}

{
  const m = new Uint8Array(100), t = new Uint8Array(100);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) { m[y * 10 + x] = x < 6 ? 255 : 0; t[y * 10 + x] = x < 5 ? 1 : 2; }
  console.log('plant: iouAtHalf reads ' + iouAtHalf(m, t, [1]).iou.toFixed(4) + ' (known figure 0.8333)');
}

/** True where the mask cut at a half differs from a 4-neighbour. Takes the bytes, the width, the height, a pixel; gives a boolean. */
export function isEdge(b, w, h, x, y) {
  const i = y * w + x, v = b[i] >= 128;
  return (x > 0 && (b[i - 1] >= 128) !== v) || (x < w - 1 && (b[i + 1] >= 128) !== v) || (y > 0 && (b[i - w] >= 128) !== v) || (y < h - 1 && (b[i + w] >= 128) !== v);
}

/** The share of pixels at a half or more, in percent. */
export function shareAtHalf(b) {
  let n = 0;
  for (let i = 0; i < b.length; i++) if (b[i] >= 128) n++;
  return (n / b.length) * 100;
}

export const TINT = [255, 0, 200], LINE = [255, 230, 0];

/** The window of sw by sh at (x0, y0) of an RGB picture `frame` (size w by h) with the mask (bytes, the same size) drawn as the sheet maker draws it: a magenta tint by weight and the outline at a half in yellow, `thick` pixels wide (1 or 3). Gives a { width, height, data } picture. */
export function tintedWindow(frame, mask, w, h, x0, y0, sw, sh, thick) {
  const im = { width: sw, height: sh, data: new Uint8Array(sw * sh * 3) };
  const r = thick >= 3 ? 1 : 0;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const X = x0 + x, Y = y0 + y;
    if (X >= w || Y >= h) continue;
    const i = Y * w + X, a = 0.55 * (mask[i] / 255), o = (y * sw + x) * 3;
    for (let c = 0; c < 3; c++) im.data[o + c] = Math.round(frame[3 * i + c] * (1 - a) + TINT[c] * a);
  }
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const X = x0 + x, Y = y0 + y;
    let hit = false;
    for (let dy = -r; dy <= r && !hit; dy++) for (let dx = -r; dx <= r && !hit; dx++) {
      const A = X + dx, B = Y + dy;
      if (A >= 0 && B >= 0 && A < w && B < h && isEdge(mask, w, h, A, B)) hit = true;
    }
    if (hit && X < w && Y < h) put(im, x, y, LINE);
  }
  return im;
}

/** The whole picture, tinted and outlined, from an RGB frame and a mask of the same size, one pixel of outline. */
export function tintedWhole(frame, mask, w, h) { return tintedWindow(frame, mask, w, h, 0, 0, w, h, 1); }

/** The size of letters that fits `len` characters in `width` pixels, between `min` and `max` units. */
export function fitScale(len, width, max = 5, min = 1) { return Math.max(min, Math.min(max, Math.floor((width - 20) / (len * 6)))); }

const NAME_COLOUR = { sky: [0, 220, 255], foliage: [60, 255, 60], 'built things': [255, 150, 0], water: [120, 120, 255] };

/** Draws the samples of a set (the app's PlaceSample form) on a picture that shows the frame at `scale` of its size, offset by (x0, y0) of the frame. */
export function drawSamples(im, samples, w, h, scale, x0 = 0, y0 = 0) {
  for (const s of samples) {
    const col = NAME_COLOUR[s.name.toLowerCase()] || [255, 255, 255];
    const cx = s.x * w * scale - x0 * scale, cy = s.y * h * scale - y0 * scale, rr = s.r * Math.min(w, h) * scale;
    circle(im, cx, cy, rr, col, 2);
    text(im, Math.round(cx - 5), Math.round(cy - 7), s.name[0], 2, col);
  }
}

/** The samples of a picture's first set. Gives a list. */
export function samplesOf(picture) {
  const S = readJSON(WHOLE + '/samples.json');
  const g = picture.startsWith('plant-') ? S.planted : S.frames;
  return g[picture] ? g[picture].sets[0].samples : [];
}

/** The picture as it opens (RGB bytes, w, h). */
export function loadFrame(picture) {
  const p = picture.startsWith('plant-') ? WHOLE + '/planted/' + picture + '-open.png' : WHOLE + '/frames/' + picture + '-open.png';
  return readRGB(p);
}

/**
 * The eight slots of a comparison picture for one picture and one subject: the frame with its samples, the recipe, and the two entries of each learned kind.
 * Takes the picture, the subject and the path of a mask index (a list of { entry, picture, subject, file }); reads entries.json beside this file.
 * Gives a list of { n, kind, title, file }; kind is samples, mask, none (no entry) or notmade (an entry whose mask the index does not hold).
 * The comparison picture and the crops picture both draw their panels from it, so their panel numbers agree.
 */
export function buildSlots(picture, subject, indexPath) {
  const E = readJSON(COMPARE + '/entries.json');
  const rows = existsSync(indexPath) ? readJSON(indexPath) : [];
  const find = (id) => rows.find((r) => r.entry === id && r.picture === picture && String(r.subject).toLowerCase() === String(subject).toLowerCase() && existsSync(resolveRow(r.file, indexPath)));
  const slots = [{ n: 1, kind: 'samples', title: '1 THE FRAME WITH ITS SAMPLES' }];
  const add = (label, entry, why) => {
    const n = slots.length + 1;
    if (!entry) { slots.push({ n, kind: 'none', title: n + ' ' + label + ': NO ENTRY', why }); return; }
    const r = find(entry.id);
    // The title names the kind, the model where it is not the label, a short variant and the input; a long variant is left to entries.md, which gives each in full.
    const kindUp = String(entry.kind).toUpperCase(), variantUp = String(entry.variant).toUpperCase();
    const t = [n, label, label.startsWith(kindUp) ? '' : kindUp, variantUp.length <= 16 ? variantUp : '', String(entry.input).toUpperCase()].filter(Boolean).join(' ');
    if (!r) slots.push({ n, kind: 'notmade', title: t, why: 'NOT YET MADE' });
    else slots.push({ n, kind: 'mask', title: t, file: resolveRow(r.file, indexPath), entryId: entry.id });
  };
  add('RECIPE 2.79', E.recipe.entry, E.recipe.reason);
  for (const g of E.groups) for (let k = 0; k < 2; k++) add(g.label, g.entries[k], g.reasons[k] || g.reason);
  return slots;
}
