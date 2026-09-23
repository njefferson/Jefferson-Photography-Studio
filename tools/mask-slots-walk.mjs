#!/usr/bin/env node
// DOES A BITMAP MASK PAST THE FOURTH ONE ACTUALLY RENDER?
//
//   node tools/mask-slots-walk.mjs [--port=8131] [--frame=NIR_1644]
//
// WHY IT EXISTS. MAX_BITMAP_MASKS went from 4 to 8 with groups (026), because
// under a group model the 4 capped bitmap COMPONENTS a single adjustment could
// combine rather than bitmap masks per photograph. The extra four live on a
// SECOND LAYER of a 2D-array atlas: slot >> 2 picks the layer, slot & 3 the
// channel, written three times — in the shader's mask loop, in maskWeightOf,
// and in the two JS packers in gl.ts. Nothing else in the app notices if one
// of those drifts. A mask on layer 1 would simply read layer 0's data, which
// on a photograph whose masks resemble each other looks like the app working.
//
// SO THE TEST NEEDS TWO BITMAPS THAT DIFFER, and it gets them the cheapest way
// there is: the four low slots are EMPTY brush masks (created and never
// painted, so their bitmaps are all zero, and active by their own default
// adjustment so they are uploaded rather than dropped), and the fifth mask is
// a SKY mask, whose bitmap is nonzero exactly where the sky is. The sky mask
// therefore lands in slot 4 — layer 1, channel 0 — and it is the only mask in
// the frame that can darken anything.
//
// The assertion is not "something changed". It is that the sky mask renders
// THE SAME PICTURE from slot 4 as it does from slot 0, because empty masks
// contribute nothing: same frame, same look, same brightness, measured alone
// first. Aliasing to layer 0 reads an empty brush mask, so the darkening
// disappears entirely and the number lands back at the unmasked reading.
//
// MADE TO FAIL FIRST by forcing the layer to 0 in the shader
// (`float(s >> 2)` -> `0.0`): "a sky mask in slot 4 renders as it does in slot
// 0" failed with the frame undarkened, which is the aliasing this exists to
// catch.
import { openMasks } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const arg = (k, d) => { const a = process.argv.find((x) => x.startsWith(`--${k}=`)); return a ? a.slice(k.length + 3) : d; };
const PORT = arg("port", "8131");
const FRAME = arg("frame", "NIR_1644");
const RAW = `${new URL("../public/examples/", import.meta.url).pathname}${FRAME}.dng`;
const BRIGHT = 0.35;   // hard enough that the darkening cannot be mistaken for noise
const EMPTIES = 4;     // fills slots 0..3, so the sky mask lands on layer 1

let failed = 0;
const check = (label, ok, detail) => { if (!ok) failed++; console.log(`${ok ? "ok  " : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`); };

const hash = (p) => p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2");
  const d = new Uint8Array(cv.width * cv.height * 4); g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, d);
  let h = 2166136261; for (let k = 0; k < d.length; k += 16) { h ^= d[k]; h = Math.imul(h, 16777619); } return (h >>> 0).toString(16); });
const settle = async (p) => { let last = "", n = 0; for (let i = 0; i < 90; i++) { const h = await hash(p); if (h === last) { if (++n >= 2) return; } else { n = 0; last = h; } await p.waitForTimeout(200); } };
const mean = (p) => p.evaluate(() => { const cv = document.querySelector("#view"); const g = cv.getContext("webgl2");
  const W = cv.width, H = cv.height, d = new Uint8Array(W * H * 4); g.readPixels(0, 0, W, H, g.RGBA, g.UNSIGNED_BYTE, d);
  let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2]; return s / (W * H * 3); });

/** Open the frame under the look with the Masks tab up and the coverage tint
 *  OFF, and hand back the page.
 *
 *  Takes the browser and the port; returns the page, ready for masks.
 *
 *  What the result must satisfy: the coverage TINT is off. It is drawn in the
 *  shader, so it lands in the pixels readPixels reads and not merely in a
 *  screenshot — a walk that leaves it on measures the overlay going on and off
 *  rather than the masks. The press happens before any slider is touched, so
 *  it flips the persistent preference instead of restoring a tint that had
 *  stepped aside, and the button is read back to prove it. */
async function openFrame(b, port) {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${port}/ir.html`);
  await p.setInputFiles("#file", [RAW]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);
  await p.evaluate(() => document.getElementById("lookEir")?.click()); await settle(p);
  await openMasks(p);
  return p;
}

/** Move a slider and let the render settle.
 *  Takes the page, the input's id and the value; returns nothing.
 *  What it must satisfy: the change reaches the app through the same `input`
 *  event a finger produces, so the app's own listener chain runs. */
async function setSlider(p, id, v) {
  await p.evaluate(([i, x]) => { const el = document.getElementById(i); if (!el) return;
    el.value = String(x); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); }, [id, v]);
  await settle(p);
}

/** Turn the coverage tint off once, and prove it went off.
 *  Takes the page; returns nothing. Counts a failure rather than throwing, so
 *  a run still reports the rest. */
async function tintOff(p) {
  await p.click("#mOutline"); await settle(p);
  const pressed = await p.getAttribute("#mOutline", "aria-pressed");
  check("the coverage tint is off before anything is read", pressed === "false", `Show mask reads aria-pressed=${pressed}`);
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  // A: the sky mask on its own — slot 0, layer 0. The reference picture.
  const p1 = await openFrame(b, PORT);
  const bare = await mean(p1);
  await p1.click("#addSky"); await settle(p1);
  await tintOff(p1);
  await setSlider(p1, "mBrightness", BRIGHT);
  const alone = await mean(p1);
  check("the Sky mask darkens the frame from slot 0", alone < bare - 1, `unmasked ${bare.toFixed(2)} -> ${alone.toFixed(2)}`);
  await p1.context().close();

  // B: four empty brush masks first, so the same sky mask lands in slot 4 —
  // the second layer of the atlas.
  const p2 = await openFrame(b, PORT);
  for (let i = 0; i < EMPTIES; i++) { await p2.click("#addBrush"); await settle(p2); }
  const added = await p2.evaluate(() => document.querySelectorAll(".mask-pick").length);
  check(`${EMPTIES} empty brush masks were accepted`, added === EMPTIES, `the list holds ${added}`);
  await tintOff(p2);
  // READ THE EMPTIES BEFORE THE SKY MASK JOINS THEM. Taken afterwards this
  // number carries the sky mask's own default adjustment — addMask gives a new
  // sky mask saturation 1.3, so it is already changing the photograph before
  // any slider is touched, and the first version of this walk reported that
  // 1.96 as the empty masks failing to be empty.
  const withEmpties = await mean(p2);
  check("empty brush masks change nothing", Math.abs(withEmpties - bare) < 0.5,
    `unmasked ${bare.toFixed(2)} -> ${withEmpties.toFixed(2)} with ${EMPTIES} empty masks`);
  await p2.click("#addSky"); await settle(p2);
  await setSlider(p2, "mBrightness", BRIGHT);
  const slot4 = await mean(p2);
  await p2.context().close();

  console.log(`\n  unmasked ${bare.toFixed(2)} · sky mask alone (slot 0) ${alone.toFixed(2)} · sky mask behind ${EMPTIES} empties (slot ${EMPTIES}) ${slot4.toFixed(2)}\n`);
  // THE ASSERTION. Empty masks contribute nothing, so the two pictures are the
  // same picture. Aliasing to layer 0 reads an empty brush mask instead and
  // the darkening vanishes, landing this back at `bare`.
  check(`a Sky mask in slot ${EMPTIES} renders as it does in slot 0`, Math.abs(slot4 - alone) < 1.0,
    `slot 0 ${alone.toFixed(2)} vs slot ${EMPTIES} ${slot4.toFixed(2)}, and undarkened would be ${bare.toFixed(2)}`);
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed — a bitmap mask past the fourth is not reading its own layer of the atlas` : "\nbitmap masks reach the second atlas layer");
process.exit(failed ? 1 : 0);
