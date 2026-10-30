#!/usr/bin/env node
// A TEMPERATURE MOVE WARMS THE PICTURE YOU SEE, WITH THE RED AND BLUE SWAP ON OR OFF (record 104).
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/temperature-walk.mjs [--port=8131]
//
// WHY THIS EXISTS. The Temperature and Tint controls were checked for what they READ (tools/join-fold-check.mjs holds the arithmetic both
// ways) and for preview against export (arm 6 of tools/agreement-walk.mjs types a number), and NOT ONE of them dragged the control and looked
// at the picture. So the swap, which is on for every raw at open and comes after the gains in the render, reversed the drag on screen for as
// long as the control existed: a drag toward warmer raised the red gain, the swap handed it to the screen's blue, and the photograph got bluer
// while the number rose. This walk drags the real sliders, with the real events a finger makes, and reads what the screen shows.
//
// WHAT IT ASSERTS, per frame and per swap state (on and off), each with a way to fail:
//   1. Ten one-step events of the Temperature thumb toward warmer RAISE the red over the blue of a near-neutral patch of the picture, and
//      raise the figure in the Temperature box. The direction only, never an equal size: a move after the swap is a third to a half as strong
//      per mired as the same move before it (record 104 measured 1.2 to 1.3 percent against 2.3 to 3.7), so asserting a size would assert the
//      wrong thing.
//   2. Twenty events toward cooler then LOWER both, below where the warmer move left them.
//   3. Ten events of the Tint thumb toward magenta LOWER the green over the red-and-blue mean of the patch and raise the Tint box; twenty back
//      toward green raise the first and lower the second. The swap does not reverse Tint, which is why it is held here too.
//   4. A typed 600 K reads back in the box as 600 within a kelvin on a raw (the case that read 2000 before record 103); on a camera JPEG, whose
//      rendered colour spec cannot express a white that cool, a typed 3000 K reads back as 3000.
//   5. Ten one-step events and one ten-step event land on the same white, within one gain-track step: the drag measures from where the slider
//      last stood, never from a thumb a clamped reading gives (step 239's fourth finding), and never rounds a small move back to the grid
//      point it started on. The swap-off route lands on the gain track, whose step is about 2.7 mired at the Z 50's infrared whites, so its bar
//      is 3 mired; the swap-on route is exact, so its bar is the box's own rounding to a whole kelvin, 0.6 mired.
//
// THE PATCH is the 3 percent of the picture's pixels with the least spread between their channels (among those neither near black nor near
// white), picked ONCE from the picture the arm begins on and read again at the same pixels after each move. It is a data-defined near-neutral
// set and not a neutral object chosen by eye. The pictures are read off the canvas the reader sees (#view).
//
// MADE TO FAIL, in three layers. (a) Before any page is opened, the patch reader is run on a planted picture of known colours in the
// browser and must read red over blue 2.00 on one and 1.00 on a second whose neutral half it must pick; the direction and landing
// predicates are run on planted wrong pairs and must refuse them. (b) `--plant=reverse` makes every thumb event go the opposite way while the
// walk still asserts the direction it names, `--plant=offset` makes the ten-step event twenty-five steps, and `--plant=typed` compares the box to a
// number five kelvin off the one typed; each must end red, with the failing checks named. `--arms=N` runs only the first N arms, which a planted run needs. (c) The run on the unplanted app must end green. A walk that passes both plants has not been shown to see anything.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
import { resolve as ownerImage } from "./owner-images.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = (process.argv.find((a) => a.startsWith("--plant=")) || "--plant=").split("=")[1];
// `--arms=N` runs only the first N of the four arms (a planted run needs one to end red; the unplanted run takes all four, which is the default).
const ARMS = Number((process.argv.find((a) => a.startsWith("--arms=")) || "--arms=4").split("=")[1]) || 4;
const BASE = `http://127.0.0.1:${PORT}`;
const EX = new URL("../public/examples", import.meta.url).pathname;
// THE OWNER'S CAMERA JPEG, by name through tools/owner-images.mjs (hub LESSONS 369), the same file arm 6 of the agreement walk caches.
let J1;
try { J1 = await ownerImage("NIR_2821.JPG"); }
catch (e) { console.log(`\ncould not fetch the owner's camera JPEG (${e.message}) — the walk cannot run without it\n`); process.exit(2); }
const FRAMES = [[`${EX}/NIR_0063.dng`, "practice raw"], [J1, "camera JPEG"]];

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

// ----------------------------------------------------------------------------------------------------------------- the predicates
/** Takes two readings of one number, before and after a move. Returns true when the second is larger than the first by more than a tenth of a percent of it. */
const rose = (before, after) => after > before * 1.001;
/** Takes two readings. Returns true when the second is smaller than the first by more than a tenth of a percent of it. */
const fell = (before, after) => after < before * 0.999;
/** Takes two whites in mired and a bar in mired. Returns true when they are no further apart than the bar. */
const together = (a, b, bar) => Math.abs(a - b) <= bar;
/** Takes the number a box shows and the number typed. Returns true when the box reads the typed number within a kelvin. */
const typedLanded = (shown, typed) => Math.abs(shown - typed) <= 1;

// ----------------------------------------------------------------------------------------------------------------- the patch reader
// Source text, because the same function is run in the page on the real canvas and on a planted picture. `d` is RGBA bytes; `pick` is true on
// the first read of an arm, which chooses the patch and keeps it on the window; every read returns the sums over the kept patch.
const PATCH = `(d, pick) => {
  const n = d.length / 4;
  if (pick) {
    const hist = new Array(256).fill(0);
    const spread = new Int16Array(n);
    for (let i = 0; i < n; i++) {
      const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
      if (d[4 * i + 3] === 0 || l < 40 || l > 215) { spread[i] = -1; continue; }
      spread[i] = mx - mn; hist[mx - mn]++;
    }
    let eligible = 0; for (let s = 0; s < 256; s++) eligible += hist[s];
    const want = Math.max(50, Math.floor(eligible * 0.03));
    let cut = 0, acc = 0; for (; cut < 256; cut++) { acc += hist[cut]; if (acc >= want) break; }
    const idx = []; for (let i = 0; i < n; i++) if (spread[i] >= 0 && spread[i] <= cut) idx.push(i);
    window.__tpatch = idx;
  }
  const p = window.__tpatch || [];
  let sr = 0, sg = 0, sb = 0;
  for (const i of p) { sr += d[4 * i]; sg += d[4 * i + 1]; sb += d[4 * i + 2]; }
  return { n: p.length, rb: sr / sb, gm: sg / ((sr + sb) / 2) };
}`;
/** Takes a Playwright page on the app. Returns the patch reading of the picture on screen: { n, rb, gm }, rb the red over the blue and gm the green over the red-and-blue mean of the patch. */
const readPatch = (page, pick) => page.evaluate(`(() => {
  const c = document.querySelector("#view");
  const o = document.createElement("canvas");
  o.width = c.width; o.height = c.height;
  o.getContext("2d").drawImage(c, 0, 0);
  return (${PATCH})(o.getContext("2d").getImageData(0, 0, o.width, o.height).data, ${pick ? "true" : "false"});
})()`);
/** Takes a page. Waits until the picture on screen stops changing (three equal reads in a row, a quarter of a second apart) and returns nothing. */
const settle = async (page) => {
  let last = -1, same = 0;
  for (let i = 0; i < 100; i++) {
    const h = await page.evaluate(() => {
      const cv = document.querySelector("#view"), g = cv.getContext("webgl2");
      const b = new Uint8Array(cv.width * cv.height * 4);
      g.readPixels(0, 0, cv.width, cv.height, g.RGBA, g.UNSIGNED_BYTE, b);
      let x = 0; for (let k = 0; k < b.length; k += 4) x = (x * 31 + b[k] + 3 * b[k + 1] + 7 * b[k + 2]) % 99991;
      return x;
    });
    if (h === last) { if (++same >= 3) return; } else { same = 0; last = h; }
    await page.waitForTimeout(250);
  }
};

// ----------------------------------------------------------------------------------------------------------------- the controls
/** Takes a page, a slider's id and a signed number of steps. Moves the slider by that many whole steps, ONE EVENT PER STEP with a short wait between, the way a finger drags it, and returns the value it ends on. */
const dragSteps = async (page, id, steps) => {
  const dir = steps < 0 ? -1 : 1;
  let v = null;
  for (let i = 0; i < Math.abs(steps); i++) {
    v = await page.evaluate(([i2, d]) => { const el = document.getElementById(i2); el.value = String(Number(el.value) + d); el.dispatchEvent(new Event("input", { bubbles: true })); return el.value; }, [id, dir]);
    await page.waitForTimeout(40);
  }
  return v;
};
/** Takes a page, a slider's id and a signed number of steps. Moves the slider by that many steps in ONE event and returns the value it ends on. */
const jumpSteps = (page, id, steps) => page.evaluate(([i2, d]) => { const el = document.getElementById(i2); el.value = String(Number(el.value) + d); el.dispatchEvent(new Event("input", { bubbles: true })); return el.value; }, [id, steps]);
/** Takes a page. Returns the Temperature box (kelvin) and the Tint box as numbers. */
const boxes = (page) => page.evaluate(() => [Number(document.getElementById("balTNum").value), Number(document.getElementById("balTiNum").value)]);
/** Takes a page and the swap state wanted. Goes to the IR tab, where the swap button is, presses it until the page is in that state, comes back to the Basic tab and returns nothing. THROWS when the button would not go to that state. */
const setSwap = async (page, on) => {
  await page.click("#ptab-ir");
  const now = await page.evaluate(() => document.getElementById("swapBtn").getAttribute("aria-pressed") === "true");
  if (now !== on) { await page.click("#swapBtn"); await page.waitForTimeout(600); }
  const after = await page.evaluate(() => document.getElementById("swapBtn").getAttribute("aria-pressed") === "true");
  await page.click("#ptab-basic");
  if (after !== on) throw new Error(`the swap button would not go ${on ? "on" : "off"}`);
};
/** Takes a file and the swap state wanted. Opens a page on the app with the file, the Basic tab showing, the swap in that state and the picture settled. Returns the page. */
const openArm = async (br, file, swapOn) => {
  const page = await br.newPage({ viewport: { width: 1000, height: 820 } });
  await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await page.setInputFiles("#file", [file]);
  await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await page.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await page.waitForTimeout(2500);
  await page.click("#ptab-basic");
  await setSwap(page, swapOn);
  await settle(page);
  return page;
};

// ----------------------------------------------------------------------------------------------------------------- made to fail, before any page of the app
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  {
    const planted = await br.newPage();
    // Two planted pictures, built in the page: (1) every pixel the same colour, red 200, green 150, blue 100, so the patch reads red over blue 2.00 and green over the red-and-blue mean 1.00;
    // (2) half of the pixels that colour and half neutral grey, so a patch of the least-spread pixels must be the grey and read red over blue 1.00.
    const one = await planted.evaluate(`(() => { const d = new Uint8ClampedArray(4 * 2500); for (let i = 0; i < 2500; i++) { d[4*i] = 200; d[4*i+1] = 150; d[4*i+2] = 100; d[4*i+3] = 255; } return (${PATCH})(d, true); })()`);
    const two = await planted.evaluate(`(() => { const d = new Uint8ClampedArray(4 * 2500); for (let i = 0; i < 2500; i++) { const grey = i % 2 === 0; d[4*i] = grey ? 120 : 200; d[4*i+1] = grey ? 120 : 150; d[4*i+2] = grey ? 120 : 100; d[4*i+3] = 255; } return (${PATCH})(d, true); })()`);
    // The picture changes and the patch is kept: a second read, without picking, of a picture whose red is doubled at the same pixels must read red over blue 4.00.
    const three = await planted.evaluate(`(() => { const d = new Uint8ClampedArray(4 * 2500); for (let i = 0; i < 2500; i++) { d[4*i] = 100; d[4*i+1] = 150; d[4*i+2] = 100; d[4*i+3] = 255; } (${PATCH})(d, true); for (let i = 0; i < 2500; i++) d[4*i] = 200; return (${PATCH})(d, false); })()`);
    await planted.close();
    const okPatch = Math.abs(one.rb - 2) < 1e-9 && Math.abs(one.gm - 1) < 1e-9 && Math.abs(two.rb - 1) < 1e-9 && Math.abs(three.rb - 2) < 1e-9;
    console.log(`MADE TO FAIL: the patch reader reads red over blue ${one.rb.toFixed(2)} on a picture of one colour (known 2.00), ${two.rb.toFixed(2)} on a half-grey picture (known 1.00, the grey picked), and ${three.rb.toFixed(2)} on a picture whose red was doubled at the kept pixels (known 2.00): ${okPatch ? "as known" : "WRONG"}`);
    const okPred = rose(1, 0.95) === false && rose(1, 1.05) === true && fell(1, 1.05) === false && fell(1, 0.95) === true && together(565.24, 590.24, 3) === false && together(565.24, 566.1, 3) === true && typedLanded(603, 600) === false && typedLanded(600.4, 600) === true;
    console.log(`MADE TO FAIL: the direction and landing predicates refuse a planted fall as a rise (1 to 0.95), a planted rise as a fall, whites 25 mired apart as together, and a typed 600 read as 603, and accept their right readings: ${okPred ? "as known" : "WRONG"}`);
    if (!(okPatch && okPred)) { console.log("THE INSTRUMENT IS BROKEN: nothing below is trustworthy; no page of the app was opened."); await br.close(); process.exit(3); }
    console.log("MADE TO FAIL: nothing below is trustworthy if the two lines above are absent or say WRONG." + (PLANT ? ` THIS RUN IS PLANTED (${PLANT}): it must end red.` : ""));
  }

  // --------------------------------------------------------------------------------------------------------------- the arms
  const sign = PLANT === "reverse" ? -1 : 1;           // the planted reversal: every thumb event goes the opposite way from the one the walk names
  const tenStep = PLANT === "offset" ? 25 : 10;        // the planted offset: the ten-step event is twenty-five steps
  const ARM_LIST = FRAMES.flatMap(([file, name]) => [true, false].map((swapOn) => [file, name, swapOn])).slice(0, ARMS);
  for (const [file, name, swapOn] of ARM_LIST) {
    const label = `${name}, swap ${swapOn ? "on" : "off"}`;
    let page;
    try {
      page = await openArm(br, file, swapOn);
      const start = await readPatch(page, true);
      const box0 = await boxes(page);
      if (!(start.n >= 50) || !(start.rb > 0)) { fail(`${label}: the picture has no near-neutral patch to read (${start.n} pixels)`); continue; }
      console.log(`  ${label.padEnd(26)} at open: the patch is ${start.n} pixels, red over blue ${start.rb.toFixed(4)}, green over the red-blue mean ${start.gm.toFixed(4)}; the boxes read ${box0[0]} K and tint ${box0[1]}`);

      // 1. TEN ONE-STEP EVENTS TOWARD WARMER
      await dragSteps(page, "balT", 10 * sign);
      await settle(page);
      const warm = await readPatch(page, false), box1 = await boxes(page);
      console.log(`  ${"".padEnd(26)} ten steps toward warmer: red over blue ${warm.rb.toFixed(4)} (${((warm.rb / start.rb - 1) * 100).toFixed(2)} percent), the box ${box1[0]} K`);
      if (!rose(start.rb, warm.rb)) fail(`${label}: ten steps of Temperature toward warmer did not raise the red over the blue of the patch (${start.rb.toFixed(4)} to ${warm.rb.toFixed(4)}), so the picture did not get warmer`);
      else ok(`${label}: ten steps toward warmer raise the patch's red over blue`);
      if (!rose(box0[0], box1[0])) fail(`${label}: ten steps of Temperature toward warmer did not raise the box (${box0[0]} K to ${box1[0]} K)`);
      else ok(`${label}: ten steps toward warmer raise the Temperature box`);
      const miredTen = 1e6 / box1[0];

      // 2. TWENTY EVENTS TOWARD COOLER
      await dragSteps(page, "balT", -20 * sign);
      await settle(page);
      const cool = await readPatch(page, false), box2 = await boxes(page);
      console.log(`  ${"".padEnd(26)} twenty steps toward cooler: red over blue ${cool.rb.toFixed(4)}, the box ${box2[0]} K`);
      if (!fell(warm.rb, cool.rb) || !fell(start.rb, cool.rb)) fail(`${label}: twenty steps of Temperature toward cooler did not lower the red over the blue of the patch below where the warmer move left it and below where it began (${start.rb.toFixed(4)}, ${warm.rb.toFixed(4)}, ${cool.rb.toFixed(4)})`);
      else ok(`${label}: twenty steps toward cooler lower the patch's red over blue below both`);
      if (!fell(box1[0], box2[0]) || !fell(box0[0], box2[0])) fail(`${label}: twenty steps of Temperature toward cooler did not lower the box below where it began (${box0[0]}, ${box1[0]}, ${box2[0]} K)`);
      else ok(`${label}: twenty steps toward cooler lower the Temperature box below both`);

      // 3. TINT, TEN STEPS TOWARD MAGENTA AND TWENTY BACK
      const tiBefore = await boxes(page), gBefore = await readPatch(page, false);
      await dragSteps(page, "balTi", 10 * sign);
      await settle(page);
      const mag = await readPatch(page, false), tiMag = await boxes(page);
      await dragSteps(page, "balTi", -20 * sign);
      await settle(page);
      const grn = await readPatch(page, false), tiGrn = await boxes(page);
      console.log(`  ${"".padEnd(26)} tint: green over the red-blue mean ${gBefore.gm.toFixed(4)} then ${mag.gm.toFixed(4)} after ten toward magenta, ${grn.gm.toFixed(4)} after twenty back; the box ${tiBefore[1]}, ${tiMag[1]}, ${tiGrn[1]}`);
      if (!fell(gBefore.gm, mag.gm) || !rose(mag.gm, grn.gm)) fail(`${label}: Tint toward magenta did not lower the patch's green against its red and blue, or toward green did not raise it (${gBefore.gm.toFixed(4)}, ${mag.gm.toFixed(4)}, ${grn.gm.toFixed(4)})`);
      else ok(`${label}: Tint toward magenta lowers the patch's green, and back raises it`);
      if (!(tiMag[1] > tiBefore[1]) || !(tiGrn[1] < tiMag[1]) || !(tiGrn[1] < tiBefore[1])) fail(`${label}: the Tint box did not follow the thumb, up toward magenta and then down below where it began (${tiBefore[1]}, ${tiMag[1]}, ${tiGrn[1]})`);
      else ok(`${label}: the Tint box follows the thumb`);

      // 4. A TYPED NUMBER: 600 K on a raw, the case that read 2000 before record 103. A camera JPEG is read through the rendered colour spec, whose gains cannot
      //    express a white below about a thousand kelvin (measured on this walk's first run: a typed 600 read back as 992 K at the tint it stood at, the nearest white
      //    its gains can show), so on a JPEG the walk types 3000 K, which they can.
      const typedAsk = name === "practice raw" ? 600 : 3000;
      await page.evaluate((k) => { const el = document.getElementById("balTNum"); el.value = String(k); el.dispatchEvent(new Event("change", { bubbles: true })); }, typedAsk);
      await page.waitForTimeout(800);
      await settle(page);
      const typed = (await boxes(page))[0];
      console.log(`  ${"".padEnd(26)} ${typedAsk} K typed: the box reads ${typed} K`);
      // the planted offset for this check: the walk compares the box to a number five kelvin off the one it typed
      if (!typedLanded(typed, typedAsk + (PLANT === "typed" ? 5 : 0))) fail(`${label}: a typed ${typedAsk} K reads back as ${typed} K`);
      else ok(`${label}: a typed ${typedAsk} K lands`);

      // 5. TEN ONE-STEP EVENTS AGAINST ONE TEN-STEP EVENT, on a second page of the same file in the same state
      const page2 = await openArm(br, file, swapOn);
      try {
        await jumpSteps(page2, "balT", tenStep * sign);
        await settle(page2);
        const jump = await boxes(page2);
        const miredJump = 1e6 / jump[0], bar = swapOn ? 0.6 : 3;
        console.log(`  ${"".padEnd(26)} one event of ${tenStep}: the white is ${miredJump.toFixed(2)} mired against ${miredTen.toFixed(2)} after ten events of one (bar ${bar} mired)`);
        if (!together(miredTen, miredJump, bar)) fail(`${label}: ten one-step events end at ${miredTen.toFixed(2)} mired and one ten-step event at ${miredJump.toFixed(2)}, further apart than one gain-track step (${bar} mired)`);
        else ok(`${label}: ten one-step events and one ten-step event land together`);
      } finally { await page2.close(); }
    } catch (e) {
      fail(`${label}: the arm could not run — ${e}`);
    } finally { if (page) await page.close(); }
  }
} finally { await br.close(); }
console.log(bad ? `\n${bad} failed${PLANT ? ` (planted: ${PLANT}, the expected ending)` : ""}\n` : "\na Temperature move warms the picture you see, with the swap on and off\n");
process.exit(bad ? 1 : 0);
