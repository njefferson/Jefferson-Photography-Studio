#!/usr/bin/env node
// A HAND CORRECTION ON A GENERATED SELECTION HAS TO SURVIVE THE NEXT REACH.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/mask-fix-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS. Decision 031's whole claim is that a correction is kept as
// the STROKE it was, not painted into the bitmap — because `regenerateSkyMask`
// assigns `brush` and `fine` wholesale, so paint in either would go with the
// next Reach drag, the next Feather drag, or the colour toggle. Nothing else
// in this repository asserts that. A version of this feature that stamped the
// bitmap would pass every other walk, look right on screen, and lose the
// reader's work the first time they touched a slider.
//
// HOW IT READS THE SELECTION: through the MATTE. The coverage tint keeps the
// photograph's own colour, and under the looks that swap red and blue the
// foliage renders the same cyan the tint uses; the matte paints the selection
// in a colour nothing else on the canvas has, so a share of the frame in that
// colour IS the coverage. (Mode 0's arithmetic is what mask-truth-walk
// inverts; this deliberately does not touch it.)
//
// THE BASELINE IS TAKEN BEFORE ANY CORRECTION, at the reach the test will use
// later. Without it, "the correction survived" cannot be told apart from "the
// regeneration happened to land near the old number".
//
// --plant skips the arming press. Three of its checks must go red.
import { openMasks } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
const PORT = (process.argv.find(a=>a.startsWith("--port="))||"--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
const OUT = "/tmp/mask-fix";
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
let failed = 0;
const check = (n, ok, d="") => { console.log(`${ok?"ok  ":"FAIL"}  ${n}${d?" — "+d:""}`); if(!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(700); await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))); };

// Coverage, read as the share of the canvas that is the MATTE's own yellow.
const coverage = (p) => p.evaluate(() => {
  const c = document.getElementById("view");
  const oc = document.createElement("canvas"); oc.width = c.width; oc.height = c.height;
  oc.getContext("2d").drawImage(c, 0, 0);
  const d = oc.getContext("2d").getImageData(0,0,oc.width,oc.height).data;
  let n = 0, y = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i]/255, g = d[i+1]/255, b = d[i+2]/255;
    const V = Math.max(r,g,b); n++;
    if (g > 0.75*r && b < 0.6*g && V > 0.45) y++;
  }
  return { share: y/n, png: oc.toDataURL("image/png") };
});
const drag = async (p, x0, y0, x1, y1) => {
  const box = await p.locator("#view").boundingBox();
  const X = (f) => box.x + box.width * f, Y = (f) => box.y + box.height * f;
  await p.mouse.move(X(x0), Y(y0)); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(X(x0 + (x1-x0)*i/8), Y(y0 + (y1-y0)*i/8));
  await p.mouse.up();
  await settle(p);
};

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage(); p.on("dialog", d=>d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(()=>document.getElementById("welcome")?.hidden, null, {timeout:300000});
  await p.waitForFunction(()=>!document.getElementById("busy")?.hasAttribute("open"), null, {timeout:300000});
  await settle(p);
  await openMasks(p); await p.click("#addSky"); await settle(p);
  await p.click("#mMatte"); await settle(p);
  const before = await coverage(p);
  writeFileSync(join(OUT, "1-before.png"), Buffer.from(before.png.split(",")[1], "base64"));

  const setReach = async (v) => {
    await p.evaluate((val) => { const el = document.getElementById("mSkyReach");
      el.value = val; el.dispatchEvent(new Event("input", {bubbles:true})); el.dispatchEvent(new Event("change", {bubbles:true})); }, String(v));
    await settle(p); await settle(p);
    // a slider drag steps the overlay aside; one press of Show mask brings it back
    if ((await p.getAttribute("#mOutline","aria-pressed")) !== null) { await p.click("#mOutline"); await settle(p); }
  };

  // THE UNCORRECTED BASELINE AT THE REACH THE TEST WILL USE LATER, taken
  // before anything is corrected — otherwise "it survived" cannot be told
  // apart from "the regeneration happened to land near the old number".
  await setReach(1.3);
  const base13 = await coverage(p);
  await setReach(1);
  const base1 = await coverage(p);
  check("Reach is back where it started", Math.abs(base1.share - before.share) < 0.01,
    `${(100*before.share).toFixed(1)}% -> ${(100*base1.share).toFixed(1)}%`);

  // TAKE OUT a swathe across the middle of the sky.
  if (!PLANT) { await p.click("#mSkyFixCut"); await settle(p); }
  check("the mode is armed", PLANT || (await p.getAttribute("#mSkyFixCut","aria-pressed")) === "true");
  await drag(p, 0.10, 0.18, 0.90, 0.18);
  const cut = await coverage(p);
  writeFileSync(join(OUT, "2-after-cut.png"), Buffer.from(cut.png.split(",")[1], "base64"));
  check("taking out by hand removes selection", base1.share - cut.share > 0.01,
    `${(100*base1.share).toFixed(1)}% -> ${(100*cut.share).toFixed(1)}%`);
  const status1 = (await p.textContent("#mSkyStatus")) || "";
  check("the line counts the correction", PLANT ? !status1.includes("by hand") : status1.includes("1 correction by hand"), status1.trim());

  // THE POINT OF THE WHOLE DESIGN: a Reach drag regenerates the selection from
  // the photograph, and the correction has to come back on top of it.
  await setReach(1.3);
  const cut13 = await coverage(p);
  writeFileSync(join(OUT, "3-after-reach.png"), Buffer.from(cut13.png.split(",")[1], "base64"));
  check("the correction survives a Reach drag", base13.share - cut13.share > 0.01,
    `Reach 1.3 reads ${(100*cut13.share).toFixed(1)}% with the correction against ${(100*base13.share).toFixed(1)}% without it`);
  const status2 = (await p.textContent("#mSkyStatus")) || "";
  check("and the line still counts it", PLANT ? true : status2.includes("1 correction by hand"), status2.trim());

  // Clear by hand puts it back, at the reach now in force.
  if (!PLANT) { await p.click("#mSkyFixClear"); await settle(p); }
  const cleared = await coverage(p);
  writeFileSync(join(OUT, "4-cleared.png"), Buffer.from(cleared.png.split(",")[1], "base64"));
  check("Clear by hand puts the selection back", PLANT ? true : Math.abs(cleared.share - base13.share) < 0.01,
    `${(100*cut13.share).toFixed(1)}% -> ${(100*cleared.share).toFixed(1)}%, baseline ${(100*base13.share).toFixed(1)}%`);

  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed?1:0);
