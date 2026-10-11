#!/usr/bin/env node
// A SLIDER PRESSED AT THE VALUE IT ALREADY HOLDS MOVES NOTHING.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/slider-own-value-walk.mjs [--port=8131]
//
// NOT in .branch-guard's `also=`: it drives a real browser against a real build and
// decodes RAW files. It is a `*-walk.mjs`, so tools/walk-all.mjs runs it by name
// (`--only=slider-own-value`), and nothing else has to list it.
//
// WHAT WENT WRONG, and why only a picture could show it (2026-10-03, found in the
// comparison sheets; fixed in a54f622 and held here). A look writes the white
// balance, the exposure and the lift at FULL PRECISION. Every slider they land on
// has a step, and `syncFromUI` reads the stepped value back the first time ANY
// slider is touched — so a press at the value the slider already showed rounded
// the photograph's state under the reader's hand. Setting Natural IR's Hue shift to
// its own 0 moved six of seven frames by up to 3 levels in 255 (75 to 127 for a
// real Hue change). Every function involved did what it said; the picture was
// wrong, and nothing read a picture before and after a press that should have
// changed none. A camera-rendered file is in the frames below because `applyLook`
// balances and exposes it itself, so the exposure's rounding reaches it too.
//
// THE FIX is that the numbers are written on the sliders' grid where they are made
// (`snapGain`, `snapExposure` and `snapLift` in src/tile.ts, called from
// `applyLook` in src/main.ts and from `solveLift`/`scaleLift`). This walk holds
// the OUTCOME rather than those calls, so any other path that writes a full-
// precision value to a stepped control is caught too: it presses a slider at its
// own value after each look and counts the pixels of the canvas that moved.
//
// WHAT IT READS. The canvas the reader sees (`#view`, read with readPixels), once
// the picture has stopped changing, before and after the press, and compares every
// pixel and channel in the page. Zero pixels moved is the only passing answer: a
// tolerance would be a number somebody chose, and 1 level in 255 is exactly the
// size of the defect on a JPEG.
//
// THE POSITIVE CONTROL. A walk that always reads zero is a walk that is not
// looking. After each own-value press the same slider is moved to a value it does
// not hold, and the canvas must move: if it does not, the instrument cannot see a
// change and the zeros above it mean nothing.
//
// FRAMES. Three raws of the practice set (public/examples) — NIR_1651 and NIR_1667
// have a sky, NIR_1688 has none — and a practice JPEG, because a camera-rendered
// file is balanced and exposed by `applyLook` itself and is the only place the
// exposure rounding showed. Under Natural IR and under Aerochrome, the two looks
// whose lift reaches different fields.
//
// PLANT, which made this walk print the failure before it was trusted: in
// src/tile.ts make `snapGain`, `snapExposure` and `snapLift` return what they are
// given (the build before a54f622). The result is recorded in the NOTES entry of
// the release that added this file.

console.log(`MADE TO FAIL
  Quantity 1: this walk's own pixel counter, run on two planted 4 by 2 RGBA buffers that differ in exactly two pixels (one
  red channel by 1, one blue channel by 3, an alpha difference of 9 that must be ignored), must read 2 pixels, a largest
  step of 3 and a total of 4 channel steps. A third buffer equal to the first must read 0 pixels.
  Quantity 2: in the page, a slider moved to a value it does not hold must move the canvas (the positive control below,
  read after every own-value press). A build in which that reads 0 pixels cannot show a move at all.
  Nothing printed below is trustworthy if either is absent or reads another number. Quantity 1 stops the walk with exit 2
  before the browser opens; quantity 2 is its last check, and the walk is red when it does not hold.`);

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist, REPO_ROOT } from "./fresh-dist.mjs";
import { join } from "node:path";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const EX = join(REPO_ROOT, "public/examples");
const ALL_FRAMES = ["NIR_1651.dng", "NIR_1667.dng", "NIR_1688.dng", "canopy.jpg"];
// `--frames=NIR_1651.dng,canopy.jpg` runs fewer, for a quick look while editing the walk.
const asked = (process.argv.find((a) => a.startsWith("--frames=")) || "").split("=")[1];
const FRAMES = asked ? asked.split(",").map((s) => s.trim()).filter((s) => ALL_FRAMES.includes(s)) : ALL_FRAMES;
if (!FRAMES.length) { console.log("no frame matched --frames="); process.exit(2); }
const LOOKS = [["lookNatural", "Natural IR"], ["lookEir", "Aerochrome"]];

/** The instrument: how many pixels differ between two RGBA buffers of one size,
 *  the largest single-channel step, and the sum of steps. Alpha is not read.
 *  It is a string so the page runs the very same function the self-check below
 *  proves. */
const COUNT_SRC = `(a, b) => {
  let pixels = 0, max = 0, sum = 0;
  for (let i = 0; i < a.length; i += 4) {
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    if (d) { pixels++; if (d > max) max = d; sum += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); }
  }
  return { pixels, max, sum };
}`;
const count = (0, eval)(COUNT_SRC);
{
  const a = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255, 70, 80, 90, 255, 100, 110, 120, 255]);
  const b = Uint8Array.from(a); b[4] += 1; b[10] += 3; b[11] = 246; // alpha moved by 9
  const same = count(a, Uint8Array.from(a)), diff = count(a, b);
  const good = diff.pixels === 2 && diff.max === 3 && diff.sum === 4 && same.pixels === 0;
  console.log(`MADE TO FAIL reading 1: planted pair reads ${diff.pixels} pixels, largest step ${diff.max}, ${diff.sum} channel steps; identical pair reads ${same.pixels} pixels. ${good ? "As known." : "WRONG - nothing below is trustworthy."}`);
  if (!good) process.exit(2);
}

let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};
const note = (s) => console.log(`        ${s}`);

/** A sampled fingerprint of the canvas the reader sees: one read of the whole
 *  buffer, every 5th pixel hashed, because it is taken every few hundred
 *  milliseconds. Sampling can miss a change; the comparison below it cannot. */
const fingerprint = (p) => p.evaluate(() => {
  const c = document.querySelector("#view");
  const g = c.getContext("webgl2") || c.getContext("webgl");
  const b = new Uint8Array(c.width * c.height * 4);
  g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, b);
  let x = 2166136261;
  for (let k = 0; k < b.length; k += 20) { x ^= b[k]; x = Math.imul(x, 16777619); x ^= b[k + 1]; x = Math.imul(x, 16777619); x ^= b[k + 2]; x = Math.imul(x, 16777619); }
  return `${c.width}x${c.height}:${x >>> 0}`;
});

/** Wait until the canvas has not changed for `quiet` ms AND the sky worker has no
 *  request outstanding and has been silent for `quiet` ms. The look's sky map is
 *  asked of the worker after a look is pressed and lands seconds later in software
 *  graphics; a canvas that is merely still can be waiting for it, and a read taken
 *  then moves when it lands, which is not the press. A worker that never answers
 *  one request is waited for 60 s at most. Polls synchronous page state, never a
 *  Promise predicate (CLAUDE.md). Returns whether it settled. */
async function settle(p, quiet, max = 300000) {
  const t0 = Date.now();
  let last = "", since = Date.now();
  while (Date.now() - t0 < max) {
    const f = await fingerprint(p);
    if (f !== last) { last = f; since = Date.now(); }
    const w = await p.evaluate(() => ({ out: window.__sky.posted - window.__sky.answered, quiet: performance.now() - window.__sky.last }));
    const workerStill = (w.out <= 0 && w.quiet >= quiet) || w.quiet >= 60000;
    if (workerStill && Date.now() - since >= quiet) return true;
    await p.waitForTimeout(400);
  }
  return false;
}

/** Keep the canvas under `name` for comparing later: the whole buffer, read once. */
const keep = (p, name) => p.evaluate((name) => {
  const c = document.querySelector("#view");
  const g = c.getContext("webgl2") || c.getContext("webgl");
  const b = new Uint8Array(c.width * c.height * 4);
  g.readPixels(0, 0, c.width, c.height, g.RGBA, g.UNSIGNED_BYTE, b);
  (window.__kept = window.__kept || {})[name] = b;
  return [c.width, c.height];
}, name);
const compare = (p, a, b) => p.evaluate(`(${COUNT_SRC})(window.__kept[${JSON.stringify(a)}], window.__kept[${JSON.stringify(b)}])`);

/** Press the slider `id` at the value it already holds, the way a finger that
 *  lands on the thumb and lifts again leaves it: the same value, an input and a change. */
const pressOwn = (p, id) => p.evaluate((id) => {
  const el = document.getElementById(id);
  el.value = el.value;
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el.value;
}, id);
const moveTo = (p, id, v) => p.evaluate(([id, v]) => {
  const el = document.getElementById(id);
  el.value = String(v);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
  return el.value;
}, [id, v]);

/** Runs in the page before anything else: stamps the moment the sky worker's first
 *  answer is handed back, so the walk reads the picture after the look's sky has
 *  landed and not between the picture and the sky. */
function INIT() {
  const M = (window.__sky = { delivered: null, posted: 0, answered: 0, last: performance.now() });
  const W = window.Worker;
  window.Worker = function (url, opts) {
    const w = new W(url, opts);
    if (/sky\.worker/.test(String(url))) {
      const post = w.postMessage.bind(w);
      w.postMessage = (...a) => { M.posted++; M.last = performance.now(); return post(...a); };
      w.addEventListener("message", () => { M.answered++; M.last = performance.now(); if (M.delivered === null) M.delivered = performance.now(); });
    }
    return w;
  };
  window.Worker.prototype = W.prototype;
}

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  let control = 0, controlRead = 0;
  for (const name of FRAMES) {
    console.log(`\n${name}`);
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
    const p = await ctx.newPage();
    p.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
    p.on("dialog", (d) => d.accept());
    await p.addInitScript(INIT);
    try {
      await p.goto(`${BASE}/ir.html`);
      await p.setInputFiles("#file", [join(EX, name)]);
      await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
      await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
      // THE LOOK'S SKY BEFORE ANYTHING IS READ: the picture is up first and the
      // look's sky follows, and a read between the two moves when the sky lands.
      await p.waitForFunction(() => window.__sky && window.__sky.delivered !== null, null, { timeout: 90000 }).catch(() => {});
      await settle(p, 4000);
      for (const [id, label] of LOOKS) {
        await p.evaluate((id) => document.getElementById(id).click(), id);
        const settled = await settle(p, 6000);
        const size = await keep(p, "a");
        await p.waitForTimeout(1500);
        await keep(p, "a2");
        const still = await compare(p, "a", "a2");
        check(`${name} ${label}: the picture is still before the press (${size[0]}x${size[1]})`, [settled, still.pixels], [true, 0]);
        const held = await pressOwn(p, "hue");
        await settle(p, 3000);
        await keep(p, "b");
        const own = await compare(p, "a", "b");
        note(`Hue shift pressed at its own ${held}: ${own.pixels} pixels moved, largest step ${own.max} of 255`);
        check(`${name} ${label}: a slider pressed at its own value moves 0 pixels`, own.pixels, 0);
        // The positive control: a value the slider does not hold must move the canvas.
        await moveTo(p, "hue", 30);
        await settle(p, 3000);
        await keep(p, "c");
        const real = await compare(p, "b", "c");
        note(`positive control, Hue shift to 30: ${real.pixels} pixels moved, largest step ${real.max}`);
        control++;
        if (real.pixels > 0) controlRead++;
      }
    } finally {
      await ctx.close();
    }
  }
  // The positive control is a check of the instrument, so it is counted once, here.
  check("the positive control moved the canvas every time (the walk can see a change)", controlRead, control);
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
