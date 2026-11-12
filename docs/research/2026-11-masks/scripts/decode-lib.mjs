// lib.mjs: the helpers step 452's composing scripts share (the mask files' names, the inner edge of a mask, the three places along an edge, a crop with its edge and its four-pixel mark).
// Imported by the scripts beside it; never run alone. The mask files are under research/decode/masks and research/decode/copies, named by the harness (scratch/step452-harness.mjs).
console.log('MADE TO FAIL: innerEdge of a built-in 5 by 5 mask holding a 3 by 3 block of 255 must count 8 edge pixels (the block less its centre), and pickPlaces on a built-in 1000 by 600 mask holding a 400 by 300 block must give 3 windows, all inside the frame, none overlapping (known figures 8 and 3 and 0)');
console.log('nothing below is trustworthy unless the plant lines read 8 and 3 windows and 0 overlapping');

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { fillRect, put, text } from '../whole/draw.mjs';

export const D = dirname(fileURLToPath(import.meta.url));
export const WHOLE = dirname(D) + '/whole';

/** A name as it stands in a file name: lower case, anything but letters and digits to a hyphen. Takes a string; gives a string. */
export function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

/**
 * The path of the mask file for a way (drawn or decode), a frame and a subject. Gives a path; the file may be absent.
 * The drawn way's mask stands from 11 November (research/whole/maps-recipe/smooth/frame, the rendering Refined to edges carried smoothly) and is read from there when the file stands; the harness reproduced it byte for byte
 * on two frame-subjects (progress/step-452-check1-*.txt), so a drawn mask the harness writes under research/decode/masks is the same file. The decode way's mask is only ever under research/decode/masks.
 */
export function maskPath(way, picture, subject) {
  const old = WHOLE + '/maps-recipe/smooth/frame/recipe-refined-to-edges-open-' + picture + '-' + slug(subject) + '.png';
  if (way === 'drawn' && existsSync(old)) return old;
  return D + '/masks/' + way + '-' + picture + '-' + slug(subject) + '.png';
}

/** The path of the copied-recipe mask for a way, the frame the recipe was fitted on, the frame it was applied to and a subject. Gives a path; the file may be absent. */
export function copyPath(way, from, to, subject) { return D + '/copies/' + way + '-' + from + '-to-' + to + '-' + slug(subject) + '.png'; }

/** Takes a path; gives true when the file stands. */
export function has(path) { return existsSync(path); }

/** The names the samples of a frame hold, in the order placed, each once, trimmed, without rest. Takes the frame's name; gives a list of strings. */
export function subjectsOf(picture) {
  const S = JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8'));
  const out = [];
  for (const s of S.frames[picture].sets[0].samples) {
    const n = String(s.name).trim();
    if (n && n !== 'rest' && !out.includes(n)) out.push(n);
  }
  return out;
}

/** The frames the samples file holds, in its order. Gives a list of names. */
export function framesOf() { return Object.keys(JSON.parse(readFileSync(WHOLE + '/samples.json', 'utf8')).frames); }

/** The inner edge of a mask cut at a half: the pixels at 128 or more that have a 4-neighbour under 128, a line one pixel wide. Takes the bytes, the width and the height; gives a Uint8Array of 1 on the edge. */
export function innerEdge(b, w, h) {
  const e = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = y * w + x;
    if (b[i] < 128) continue;
    if ((x > 0 && b[i - 1] < 128) || (x < w - 1 && b[i + 1] < 128) || (y > 0 && b[i - w] < 128) || (y < h - 1 && b[i + w] < 128)) e[i] = 1;
  }
  return e;
}

/** True when a mask cut at a half has no edge to follow: no pixel at 128 or more, or no pixel under it. Takes the bytes; gives a boolean. */
export function noEdge(b) {
  let hi = 0, lo = 0;
  for (let i = 0; i < b.length; i++) { if (b[i] >= 128) hi++; else lo++; if (hi && lo) return false; }
  return true;
}

/**
 * Three windows of `size` by `size` pixels placed evenly along the edge of a mask. Takes the edge (innerEdge's result), the width, the height and the size.
 * Rule (step 453): the edge pixels are walked along each connected stretch, the stretches longest first; the windows are centred on the pixels at one sixth, one half and five sixths of the whole length so walked, each moved to lie inside the frame;
 * a window that would overlap an earlier one takes the next pixel of the walk that does not overlap it. So the spacing is even by length along the walked stretches.
 * Gives a list of { x0, y0 } (top left of each window), fewer than three when the edge has fewer pixels than that; the windows are inside the frame and no two overlap.
 */
export function pickPlaces(edge, w, h, size) {
  // Step 453's put-right: the edge's pixels are walked ALONG each connected stretch (8-neighbours, a depth-first walk that prefers the four straight neighbours), the stretches taken longest first, and
  // the places are taken at one sixth, one half and five sixths of the whole length so walked, not of the raster order.
  const seen = new Uint8Array(edge.length);
  const stretches = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]];
  for (let s = 0; s < edge.length; s++) {
    if (!edge[s] || seen[s]) continue;
    const walk = [];
    const stack = [s];
    seen[s] = 1;
    while (stack.length) {
      const p = stack.pop();
      walk.push(p);
      const px = p % w, py = (p - px) / w;
      for (let d = dirs.length - 1; d >= 0; d--) {
        const nx = px + dirs[d][0], ny = py + dirs[d][1];
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (edge[q] && !seen[q]) { seen[q] = 1; stack.push(q); }
      }
    }
    stretches.push(walk);
  }
  stretches.sort((a, b) => b.length - a.length);
  const list = [];
  for (const st of stretches) for (const p of st) list.push(p);
  const out = [];
  if (!list.length) return out;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  for (const q of [1 / 6, 3 / 6, 5 / 6]) {
    const start = Math.floor(q * list.length);
    const stride = Math.max(1, Math.floor(list.length / 200));
    for (let t = 0; t < list.length; t += stride) {
      const p = list[(start + t) % list.length];
      const x0 = clamp((p % w) - (size >> 1), 0, w - size), y0 = clamp(Math.floor(p / w) - (size >> 1), 0, h - size);
      if (out.some((o) => Math.abs(o.x0 - x0) < size && Math.abs(o.y0 - y0) < size)) continue;
      out.push({ x0, y0 });
      break;
    }
  }
  return out;
}

{
  const m = new Uint8Array(25);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) m[y * 5 + x] = 255;
  let n = 0; for (const v of innerEdge(m, 5, 5)) n += v;
  const big = new Uint8Array(1000 * 600);
  for (let y = 100; y < 400; y++) for (let x = 200; x < 600; x++) big[y * 1000 + x] = 255;
  const pl = pickPlaces(innerEdge(big, 1000, 600), 1000, 600, 240);
  let overlaps = 0, inside = 0;
  for (let i = 0; i < pl.length; i++) {
    if (pl[i].x0 >= 0 && pl[i].y0 >= 0 && pl[i].x0 + 240 <= 1000 && pl[i].y0 + 240 <= 600) inside++;
    for (let j = i + 1; j < pl.length; j++) if (Math.abs(pl[i].x0 - pl[j].x0) < 240 && Math.abs(pl[i].y0 - pl[j].y0) < 240) overlaps++;
  }
  console.log('plant: innerEdge counts ' + n + ' edge pixels (known 8); pickPlaces gives ' + pl.length + ' windows, ' + inside + ' inside the frame, ' + overlaps + ' overlapping (known 3, 3, 0)');
}

/** An outline of a rectangle, `thick` pixels, drawn on an RGB picture. Takes the picture, the corner, the size, the colour and the thickness. */
export function rectOutline(im, x, y, w, h, c, thick) {
  fillRect(im, x, y, w, thick, c); fillRect(im, x, y + h - thick, w, thick, c);
  fillRect(im, x, y, thick, h, c); fillRect(im, x + w - thick, y, thick, h, c);
}

/** The mark that reads a band against: an L of two white arms, each exactly 4 pixels wide and 24 long, with a black rim of one pixel, at the bottom left of a picture of size `s`. */
export function bandMark(im, ox, oy, s) {
  const x = ox + 6, yb = oy + s - 6;
  fillRect(im, x - 1, yb - 25, 6, 26, [0, 0, 0]); fillRect(im, x - 1, yb - 5, 26, 6, [0, 0, 0]);
  fillRect(im, x, yb - 24, 4, 24, [255, 255, 255]); fillRect(im, x, yb - 4, 24, 4, [255, 255, 255]);
}

/**
 * A crop of `size` by `size` pixels of an RGB frame at (x0, y0), at the frame's own size, with the edge of up to one mask drawn over it as a line one pixel wide and the four-pixel mark at the bottom left.
 * Takes the frame (width, height, data), the corner, the size, the mask's inner edge (or null for none) and the line's colour. Gives a { width, height, data } picture of the size asked.
 */
export function cropWithEdge(frame, x0, y0, size, edge, colour) {
  const im = { width: size, height: size, data: new Uint8Array(size * size * 3) };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = (y0 + y) * frame.width + (x0 + x), o = (y * size + x) * 3;
    im.data[o] = frame.data[3 * i]; im.data[o + 1] = frame.data[3 * i + 1]; im.data[o + 2] = frame.data[3 * i + 2];
    if (edge && edge[i]) put(im, x, y, colour);
  }
  bandMark(im, 0, 0, size);
  return im;
}

/** Letters at scale 2 on a picture, cut to `max` characters. Takes the picture, the corner, the string, the colour and the most characters; gives nothing. */
export function label(im, x, y, s, c, max) { text(im, x, y, String(s).length > max ? String(s).slice(0, max) : s, 2, c); }
