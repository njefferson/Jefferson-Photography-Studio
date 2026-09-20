#!/usr/bin/env node
// THE HAND CORRECTION'S SIZE IS KNOWN BEFORE THE FIRST MARK, AND IT GOES SMALL.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/fix-brush-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS (decision 040). Two halves of one report: the correction brush
// "only gives me a big brush that doesn't get small enough", and "I can't see
// until I touch the canvas".
//
// THE SECOND HALF IS A TOUCH PROBLEM AND IS CHECKED AS ONE. A ring that only
// follows a pointer answers nothing on a tablet, where there is no hover — so
// what is asserted is that the ring is up from the moment a mode is ARMED and
// while the size slider is MOVING, both of which happen before any contact
// with the picture.
//
// THE FIRST HALF IS MEASURED ON THE MASK, not on the slider's own number. A
// control can report any radius it likes; what matters is how much of the
// frame one dab actually moves, so both ends of the track are stamped and the
// coverage read through the matte — the same instrument mask-fix-walk uses,
// and for the same reason: the matte's yellow is a colour the photograph does
// not have.
//
// --plant skips arming the mode. Three checks must go red.
import { chromium } from "playwright-core";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(500); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };

const ring = (p) => p.evaluate(() => {
  const el = document.getElementById("fixBrush");
  return { shown: !!el && !el.hidden, px: el ? parseFloat(el.style.width || "0") : 0 };
});
const coverage = (p) => p.evaluate(() => {
  const c = document.getElementById("view");
  const oc = document.createElement("canvas"); oc.width = c.width; oc.height = c.height;
  oc.getContext("2d").drawImage(c, 0, 0);
  const d = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height).data;
  let n = 0, y = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const V = Math.max(r, g, b); n++;
    if (g > 0.75 * r && b < 0.6 * g && V > 0.45) y++;
  }
  return y / n;
});
const setSize = async (p, t) => {
  await p.evaluate((x) => {
    const el = document.getElementById("mSkyFixSize");
    el.value = x; el.dispatchEvent(new Event("input", { bubbles: true }));
  }, String(t));
  await p.waitForTimeout(150);
};
/** One dab at a fraction of the canvas, with no drag. */
const dab = async (p, fx, fy) => {
  const box = await p.locator("#view").boundingBox();
  const x = box.x + box.width * fx, y = box.y + box.height * fy;
  await p.mouse.move(x, y); await p.mouse.down(); await p.mouse.move(x + 1, y); await p.mouse.up();
  await settle(p);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage(); p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);
  await p.click("#ptab-masks"); await p.click("#addSky"); await settle(p);
  await p.click("#mMatte"); await settle(p);

  check("nothing is showing before a mode is armed", !(await ring(p)).shown);

  // ARMED, AND THE RING IS UP BEFORE ANYTHING HAS BEEN TOUCHED.
  if (!PLANT) { await p.click("#mSkyFixAdd"); await p.waitForTimeout(200); }
  const armed = await ring(p);
  check("arming a hand mode shows the ring, with no contact", PLANT ? false : armed.shown,
    armed.shown ? `${armed.px.toFixed(0)}px across` : "nothing showing");

  await setSize(p, 0);
  const small = await ring(p);
  await setSize(p, 1);
  const big = await ring(p);
  check("the ring is up while the size slider moves", PLANT ? false : small.shown && big.shown);
  check("and it says how big the brush is", PLANT ? false : big.px > small.px * 8,
    `${small.px.toFixed(0)}px at the small end, ${big.px.toFixed(0)}px at the large`);

  // AND THE MASK AGREES WITH THE RING. Measured, not taken from the control.
  await setSize(p, 0);
  const before = await coverage(p);
  await dab(p, 0.30, 0.72);           // low in the frame, outside the sky
  const afterSmall = (await coverage(p)) - before;
  await p.click("#mSkyFixClear"); await settle(p);
  await setSize(p, 1);
  const before2 = await coverage(p);
  await dab(p, 0.30, 0.72);
  const afterBig = (await coverage(p)) - before2;
  check("the smallest dab is a small mark", PLANT ? false : afterSmall > 0 && afterSmall < 0.002,
    `${(100 * afterSmall).toFixed(3)}% of the frame`);
  check("and the largest is a large one", PLANT ? false : afterBig > afterSmall * 20,
    `${(100 * afterBig).toFixed(2)}% against ${(100 * afterSmall).toFixed(3)}%`);

  if (!PLANT) {
    await p.click("#mSkyFixAdd"); await p.waitForTimeout(200); // press again = off
    check("turning the mode off takes the ring away", !(await ring(p)).shown);
  }
  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
