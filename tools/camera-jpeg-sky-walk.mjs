#!/usr/bin/env node
// THE LENS HOT SPOT STAYS INSIDE THE SKY SELECTION ON A CAMERA JPEG.
//
//   node tools/camera-jpeg-sky-walk.mjs
//
// NOT in .branch-guard's `also=`: it decodes a 20-megapixel photograph in a real
// browser, which is seconds rather than milliseconds, and it needs the owner's
// own file. It is a `*-walk.mjs`, so tools/walk-all.mjs runs it by name
// (`--only=camera-jpeg-sky`) and nothing else has to list it.
//
// NEEDS NO SERVER AND NO BUILD. It bundles the app's own `decode`, `prepareSkySource`
// and `buildSkySelectionFrom` from src/ when it runs (esbuild, as lens-order-walk
// does) and runs them in a Chromium page that serves the photograph from a made-up
// origin. Those are the functions the decode worker and the sky worker run, so the
// selection it reads is the one the app builds. The cost of that is stated: it
// measures src/, not dist/, and a stale build is not its business (walk-all.mjs
// refuses one for the sweep).
//
// WHAT WENT WRONG, and why only a picture or this walk could show it. From 95d8ea7
// the sky selection's gray-world balance left out every cell whose block holds a
// pixel `pinTest` calls clipped, and for an 8-bit source `pinTest` calls an 8-bit
// 255 clipped. A camera JPEG's 255 is the camera's own rendering of a bright
// area, not a sensor that stopped, and on NIR_1597.JPG that flagged 10.5% of the
// cells (its blown foliage). Leaving them out moved the balance's green and blue
// gains up by 69% and 55%, and the lens hot spot's pale centre, the least coloured
// part of the sky, fell out of the selection: under Aerochrome a soft dark blob in
// the middle of the sky. Every function did what it said. Fixed in a54f622 by giving
// an 8-bit source no `clip` flag (src/skyfine.ts `SkySource.clip`); this walk holds
// the OUTCOME, so any other route to the same hole is caught as well.
//
// WHAT IT READS. The selection the app builds for NIR_1597.JPG, both the coarse
// bitmap (384 px on the long edge, what a strip tile and the Masks tab read) and the
// refinement (1024 px, what the open photograph's look reads), and asks two things
// of each:
//   1  THE HOT SPOT IS IN THE SKY. A disc of 0.02 half-diagonals about the lens's
//      own hot-spot centre is at least 98% selected. The centre is the app's own
//      answer: the matched shipped profile's brightness centre, else its colour
//      centre, else the frame's geometric centre (`centre` in src/lensstore.ts,
//      which says an absent centre IS the geometric one). For the 16-50 at 19.5 mm
//      that profile carries none, so it is the middle of the frame, which is where
//      the blob sat.
//   2  THE SKY HAS NO HOLE IN IT. No unselected patch that the selection fully
//      encloses is larger than 0.05% of the mask. A hole is what a hot spot cut out
//      of the sky looks like wherever the lens put it.
// It also needs the frame upright (orientation 1), because a profile's centre is in
// the sensor's axes and the mask is in the picture's.
//
// MEASURED, authoring 2026-10-10, on NIR_1597.JPG at 5568 by 3712. The fixed tree:
// disc 100% selected in both masks, no enclosed hole in the coarse mask, the largest
// in the refined mask 16 cells of 699,392 (0.002%), the sky 74.0% of the frame. The
// clip flag planted back (PLANT below): 10.5% of cells flagged, which is the figure
// the record gives, an enclosed hole of 1,219 cells in the coarse mask and 8,326 in
// the refined one (1.2%), centred about 0.03 of the frame left of and below the
// middle, with the middle inside it. Both bounds sit between the two readings by more
// than an order of magnitude on each side.
//
// PLANT, which made this walk print the failure before it was trusted: in
// src/skyfine.ts `prepareSkySource`, make `clip` `new Uint8Array(w * h)` always
// (it is `lin ? new Uint8Array(w * h) : null`) and put `if (!c && pinned(sx, sy)) c = 1;`
// back after `n++` in the 8-bit branch: the build before a54f622. The result is
// recorded in the NOTES entry of the release that added this file.

console.log(`MADE TO FAIL
  Quantity 1: this walk's own mask counter, run on a planted 8 by 6 mask of known bytes (every cell selected except a 2 by 2
  block that the selection encloses and one corner cell that touches the border), must read 43 selected cells, a largest
  enclosed hole of 4, a disc on the block of 4 cells with 0 selected, and a disc beside it of 4 cells with 4 selected. A mask
  with every cell selected must read a largest enclosed hole of 0.
  Quantity 2: the app's own decode(), run in the page on the photograph, must return exactly the size the file's own JPEG
  header gives (read here from its SOF marker), and the refined mask must have a long edge of exactly 1024 (SKY_FINE_EDGE)
  and the coarse mask a long edge of exactly 384 (BRUSH_MAX_EDGE).
  Nothing printed below is trustworthy if either is absent or reads another number. Quantity 1 stops the walk with exit 2
  before the browser opens; quantity 2 stops it with exit 2 before any selection is judged.`);

import { chromium } from "playwright-core";
import { build } from "esbuild";
import { resolve as ownerImage } from "./owner-images.mjs";
import { REPO_ROOT } from "./fresh-dist.mjs";
import { readFileSync } from "node:fs";

const NAME = "NIR_1597.JPG";
/** Half-diagonals: the radius of the disc about the hot spot's centre. */
const DISC = 0.02;
/** The least a disc about the hot spot may be selected. */
const DISC_MIN = 0.98;
/** The most an enclosed unselected patch may be, as a share of the mask. */
const HOLE_MAX = 0.0005;

/** The instrument: facts about one selection mask. A string, so the page runs the
 *  very same function the self-check below proves.
 *  Takes `m` `{ w, h, data }` (a cell is selected at 128 or more), `ox` and `oy`
 *  (the disc's centre as an offset from the middle of the mask in half-diagonals,
 *  x right and y down) and `rho` (its radius in half-diagonals). Returns `selected`
 *  cells, the area of the `largestHole` (4-connected unselected cells that do not
 *  touch the border), and the cells `inDisc` and `selInDisc` selected within it. */
const ANALYSE_SRC = `(m, ox, oy, rho) => {
  const { w, h, data } = m;
  let selected = 0;
  for (let i = 0; i < data.length; i++) if (data[i] >= 128) selected++;
  const seen = new Uint8Array(w * h);
  let largestHole = 0;
  for (let s = 0; s < w * h; s++) {
    if (seen[s] || data[s] >= 128) continue;
    let touches = false, area = 0;
    const stack = [s]; seen[s] = 1;
    while (stack.length) {
      const i = stack.pop(); area++;
      const x = i % w, y = (i / w) | 0;
      if (x === 0 || y === 0 || x === w - 1 || y === h - 1) touches = true;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= w * h) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        if (!seen[j] && data[j] < 128) { seen[j] = 1; stack.push(j); }
      }
    }
    if (!touches && area > largestHole) largestHole = area;
  }
  const half = Math.hypot(w, h) / 2;
  const cx = w / 2 + ox * half, cy = h / 2 + oy * half, r = rho * half;
  let inDisc = 0, selInDisc = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x + 0.5 - cx, dy = y + 0.5 - cy;
    if (dx * dx + dy * dy <= r * r) { inDisc++; if (data[y * w + x] >= 128) selInDisc++; }
  }
  return { selected, largestHole, inDisc, selInDisc };
}`;
const analyse = (0, eval)(ANALYSE_SRC);

/** The photograph's own size from its first SOF marker. Takes the file's bytes;
 *  returns `{ w, h }`, or null when no marker is found. */
function jpegSize(buf) {
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
    i += 2 + buf.readUInt16BE(i + 2);
  }
  return null;
}

{
  const w = 8, h = 6;
  const data = new Uint8Array(w * h).fill(255);
  for (const [x, y] of [[3, 2], [4, 2], [3, 3], [4, 3]]) data[y * w + x] = 0; // the block the selection encloses
  data[0] = 0; // a corner cell: it touches the border, so it is not a hole
  const onBlock = analyse({ w, h, data }, 0, 0, 0.2);  // a disc of radius 1 about (4, 3)
  const beside = analyse({ w, h, data }, 0.4, 0, 0.2); // the same disc two cells to the right
  const full = analyse({ w, h, data: new Uint8Array(w * h).fill(255) }, 0, 0, 0.2);
  const good = onBlock.selected === 43 && onBlock.largestHole === 4 && onBlock.inDisc === 4 && onBlock.selInDisc === 0
    && beside.inDisc === 4 && beside.selInDisc === 4 && full.largestHole === 0;
  console.log(`MADE TO FAIL reading 1: planted mask reads ${onBlock.selected} selected, largest hole ${onBlock.largestHole}, disc on the block ${onBlock.selInDisc} of ${onBlock.inDisc}, disc beside it ${beside.selInDisc} of ${beside.inDisc}; the full mask reads hole ${full.largestHole}. ${good ? "As known." : "WRONG - nothing below is trustworthy."}`);
  if (!good) process.exit(2);
}

let path;
try {
  path = await ownerImage(NAME);
} catch (e) {
  console.log(`\ncould not get the owner's photograph ${NAME} (${e.message}). It comes through tools/owner-images.mjs from the Drive host drive.usercontent.google.com when it is not already in the cache; a refused host is a fact about this machine and says nothing about the photograph.\n`);
  process.exit(2);
}
const jpg = readFileSync(path);
const size = jpegSize(jpg);
if (!size) { console.log(`\nno JPEG size could be read from ${path}\n`); process.exit(2); }

const bundle = (await build({
  stdin: {
    contents: `export { decode } from "${REPO_ROOT}/src/decode";
      export { prepareSkySource, buildSkySelectionFrom } from "${REPO_ROOT}/src/skyfine";
      export { readExifSubset } from "${REPO_ROOT}/src/exif";
      export * as Hotspot from "${REPO_ROOT}/src/hotspot";`,
    resolveDir: REPO_ROOT, loader: "ts",
  },
  bundle: true, format: "iife", globalName: "__A", platform: "browser", write: false, logLevel: "warning",
})).outputFiles[0].text;

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};
const note = (s) => console.log(`        ${s}`);

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const ctx = await browser.newContext({ viewport: { width: 800, height: 600 } });
  const p = await ctx.newPage();
  p.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
  await p.route("http://walk.invalid/**", (r) => {
    if (new URL(r.request().url()).pathname === "/f.jpg") r.fulfill({ status: 200, contentType: "image/jpeg", body: jpg });
    else r.fulfill({ status: 200, contentType: "text/html", body: "<!doctype html><title>walk</title>" });
  });
  await p.goto("http://walk.invalid/");
  await p.addScriptTag({ content: bundle });
  const r = await p.evaluate(async ({ analyseSrc, rho }) => {
    const analyseIn = (0, eval)(analyseSrc);
    const bytes = new Uint8Array(await (await fetch("/f.jpg")).arrayBuffer());
    const ex = __A.readExifSubset(bytes);
    const shipped = __A.Hotspot.findShipped(ex);
    const halves = __A.Hotspot.lensHalves(null, shipped);
    const centre = (halves.brightness ?? halves.colour)?.centre ?? null;
    const [ox, oy] = centre ?? [0, 0];
    const img = await __A.decode({ name: "f.jpg", kind: "jpeg", bytes, looksTranscoded: false });
    const src = __A.prepareSkySource(img, img.rotate ?? 0);
    const sel = __A.buildSkySelectionFrom(src);
    const dims = (m) => (m ? [m.w, m.h] : null);
    return {
      lens: ex?.lens ?? null, orientation: ex?.orientation ?? null, matched: !!shipped, centre, decoded: [img.width, img.height],
      clipped: src.clip ? src.clip.reduce((n, v) => n + (v ? 1 : 0), 0) : null, cells: src.w * src.h,
      maskDims: dims(sel.mask), fineDims: dims(sel.fine),
      mask: sel.mask ? analyseIn(sel.mask, ox, oy, rho) : null,
      fine: sel.fine ? analyseIn(sel.fine, ox, oy, rho) : null,
    };
  }, { analyseSrc: ANALYSE_SRC, rho: DISC });

  // QUANTITY 2, before any selection is judged.
  const wantFine = [Math.round(size.w * 1024 / Math.max(size.w, size.h)), Math.round(size.h * 1024 / Math.max(size.w, size.h))];
  const sized = r.decoded[0] === size.w && r.decoded[1] === size.h
    && !!r.maskDims && Math.max(...r.maskDims) === 384 && !!r.fineDims && r.fineDims[0] === wantFine[0] && r.fineDims[1] === wantFine[1];
  console.log(`MADE TO FAIL reading 2: decode() returned ${r.decoded.join("x")} (header ${size.w}x${size.h}); coarse mask ${r.maskDims ? r.maskDims.join("x") : "none"} (long edge must be 384); refined ${r.fineDims ? r.fineDims.join("x") : "none"} (must be ${wantFine.join("x")}). ${sized ? "As known." : "WRONG - nothing below is trustworthy."}`);
  if (!sized) { await ctx.close(); process.exitCode = 2; throw new Error("instrument"); }

  console.log(`\n${NAME}  (${r.lens ?? "no lens in its EXIF"})`);
  if (!r.matched || r.orientation !== 1) {
    console.log(`\nthe walk needs this photograph upright (orientation ${r.orientation}) and its lens matched to a shipped profile (matched ${r.matched}): without both it cannot place the hot spot, and it cannot see its own case\n`);
    await ctx.close(); process.exitCode = 2; throw new Error("frame");
  }
  note(`hot-spot centre ${r.centre ? JSON.stringify(r.centre) + " from the profile" : "the geometric centre of the frame (the profile carries none)"}; the copy carries ${r.clipped === null ? "no clip flag (an 8-bit source takes none)" : `a clip flag on ${r.clipped} of ${r.cells} cells (${(100 * r.clipped / r.cells).toFixed(1)}%)`}`);
  check("the sky is found, coarse bitmap and refinement both", [!!r.mask, !!r.fine], [true, true]);
  for (const [label, m, dims] of [["coarse bitmap", r.mask, r.maskDims], ["refinement", r.fine, r.fineDims]]) {
    if (!m) continue;
    const cells = dims[0] * dims[1];
    const disc = m.inDisc ? m.selInDisc / m.inDisc : 0;
    const hole = m.largestHole / cells;
    note(`${label} ${dims.join("x")}: sky ${(100 * m.selected / cells).toFixed(1)}% of the frame; disc about the hot spot ${m.selInDisc} of ${m.inDisc} selected; largest enclosed hole ${m.largestHole} cells (${(100 * hole).toFixed(3)}%)`);
    check(`${label}: the hot spot is inside the sky (a disc of ${DISC} half-diagonals at least ${DISC_MIN * 100}% selected)`, m.inDisc > 0 && disc >= DISC_MIN, true);
    check(`${label}: no hole larger than ${HOLE_MAX * 100}% of the mask is cut out of the sky`, hole <= HOLE_MAX, true);
  }
  await ctx.close();
} catch (e) {
  if (e.message !== "instrument" && e.message !== "frame") { console.log(`FAIL  ${e.message}`); failed++; }
} finally {
  await browser.close();
}
if (process.exitCode === 2) process.exit(2);
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
