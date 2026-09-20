#!/usr/bin/env node
// THE GRADE TAB'S CONTROLS BEHAVE LIKE THE REST OF THE APP.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/grade-controls-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS (decision 035). Three defects reported together 2026-09-20:
// the wheel destroyed the hue you chose when you pulled its amount to zero,
// double-tap-to-put-back could not reach any of the six grade sliders, and the
// Shadow colour slider reduced as it rose.
//
// THE FIRST IS ASSERTED AS A TRANSITION, NOT AN END STATE. "The hue is still
// 200" is also what a build where the wheel drag never arrived would produce,
// so the drag is confirmed to have DONE something — the amount must actually
// have fallen — before the hue is asked about. An end-state check here would
// pass for the wrong reason on a broken build, which is the same trap
// quicklook-keys-walk names.
//
// THE SECOND IS ASSERTED THROUGH THE REAL GESTURE, not by calling the handler:
// the whole defect was that the element had no id for the lookup to find, and
// a test that passes the element in directly would never have seen it.
//
// --plant skips the double-tap and the centre drag. Three checks must go red.
import { chromium } from "playwright-core";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(400); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
const val = (p, id) => p.evaluate((i) => (document.getElementById(i))?.value ?? "", id);
const setRange = async (p, id, v) => {
  await p.evaluate(([i, x]) => {
    const el = document.getElementById(i);
    el.value = x;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, [id, String(v)]);
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
  await p.click("#ptab-grade"); await settle(p);

  // --- the six sliders exist and can be found by id ------------------------
  const ids = await p.evaluate(() =>
    [...document.querySelectorAll("#gradeWheels input[type=range]")].map((e) => e.id));
  check("every grade slider has an id", ids.length === 6 && ids.every(Boolean),
    ids.length ? ids.join(" ") : "none found");

  // --- double-tap puts one back --------------------------------------------
  const HUE = "gradeHue0", AMT = "gradeAmount0";
  // A HARNESS THAT DIES AT THE FIRST FAILURE REPORTS ONLY WHAT IT REACHED.
  // Without ids there is no `#gradeHue0` to click, so every check below threw
  // a timeout and the run ended having said one thing — which is the same
  // shape of blind spot as a sweep that walks the pages it could open. The
  // dependent checks are refused explicitly instead, so a broken build still
  // prints the whole list.
  const haveIds = await p.evaluate(() => !!document.getElementById("gradeHue0") && !!document.getElementById("gradeAmount0"));
  if (!haveIds) {
    check("double-tap puts a grade Hue slider back", false, "no #gradeHue0 to reach — the gesture is keyed by id");
    check("and a grade Amount slider", false, "no #gradeAmount0 to reach");
    check("the drag to the centre took the amount off", false, "cannot read the amount without an id");
    check("...and kept the hue it was on", false, "cannot read the hue without an id");
  } else {
  await setRange(p, AMT, 60);
  await setRange(p, HUE, 200);
  const moved = await val(p, HUE);
  if (!PLANT) { await p.dblclick(`#${HUE}`); await settle(p); }
  const backHue = await val(p, HUE);
  check("double-tap puts a grade Hue slider back", moved === "200" && backHue === "0",
    `set to ${moved}, then ${backHue} (baseline 0)`);
  await setRange(p, HUE, 200); // put it back for the wheel test below
  const amtMoved = await val(p, AMT);
  if (!PLANT) { await p.dblclick(`#${AMT}`); await settle(p); }
  const backAmt = await val(p, AMT);
  check("and a grade Amount slider", amtMoved === "60" && backAmt === "0",
    `set to ${amtMoved}, then ${backAmt} (baseline 0)`);

  // --- the wheel keeps the hue when the amount is taken off ----------------
  await setRange(p, AMT, 60);
  const hueBefore = await val(p, HUE);
  const amtAfterSet = Number(await val(p, AMT));
  const box = await p.locator("#gradeWheels .grade-wheel").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  if (!PLANT) {
    // THE GRAB HAS TO START ON THE PUCK. A first version of this walk pressed
    // at 3 o'clock and pulled in from there, then reported the hue as lost —
    // but 3 o'clock IS hue 90 under this wheel's convention (0 at twelve,
    // clockwise), so the very first move of that drag set a new hue correctly
    // and the app was behaving. Suspect the instrument first: the gesture the
    // report describes is taking hold of the puck where it already sits and
    // pulling it to the middle, so the start point is computed from the values
    // on screen rather than picked.
    const PUCK_MAX = 33;
    const rad = (Number(hueBefore) * Math.PI) / 180;
    const r0 = (amtAfterSet / 100) * PUCK_MAX;
    const px = cx + Math.sin(rad) * r0, py = cy - Math.cos(rad) * r0;
    await p.mouse.move(px, py);
    await p.mouse.down();
    for (let i = 8; i >= 0; i--) await p.mouse.move(cx + (px - cx) * i / 8, cy + (py - cy) * i / 8);
    await p.mouse.up();
    await settle(p);
  }
  const amtAfter = Number(await val(p, AMT));
  const hueAfter = await val(p, HUE);
  // THE DRAG MUST HAVE DONE SOMETHING before its not-doing-something is a pass.
  check("the drag to the centre took the amount off", PLANT || amtAfter < 20,
    `amount ${amtAfter}`);
  check("...and kept the hue it was on", PLANT ? false : hueAfter === hueBefore,
    `${hueBefore} -> ${hueAfter}`);
  }

  // --- right is MORE colour in the shadows, measured on the picture --------
  // NOT THE LABEL. The first fix for this renamed the control so that its NAME
  // rose as the slider moved right while the colour in the photograph still
  // fell, and a check written against the label passed on it. The convention
  // is about what happens on screen, so this reads the screen: the mean
  // saturation of the DARK pixels, which is the population the control acts
  // on, at each end of the track.
  const darkSat = (pg) => pg.evaluate(() => {
    const c = document.getElementById("view");
    const oc = document.createElement("canvas"); oc.width = c.width; oc.height = c.height;
    oc.getContext("2d").drawImage(c, 0, 0);
    const d = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height).data;
    let n = 0, sat = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
      const V = Math.max(r, g, b), m = Math.min(r, g, b);
      if (V > 0.45 || V < 0.02) continue;   // the shadow band the control reaches
      n++; sat += (V - m) / V;
    }
    return n ? sat / n : 0;
  });
  await p.click("#ptab-grade"); await settle(p);
  await setRange(p, "shadowSat", 0);
  const atLeft = await darkSat(p);
  await setRange(p, "shadowSat", 1);
  const atRight = await darkSat(p);
  check("dragging the shadow slider right puts colour BACK in the shadows",
    PLANT ? false : atRight > atLeft * 1.2,
    `dark-pixel saturation ${atLeft.toFixed(3)} at the left, ${atRight.toFixed(3)} at the right`);
  // AND IT RESTS WHERE IT DOES NOTHING. A control that only takes something
  // away has to open at the end that takes nothing, and with right increasing
  // that end is the right one.
  await p.click("#resetBtn").catch(() => {});
  await settle(p);
  const rest = await p.evaluate(() => {
    const el = document.getElementById("shadowSat");
    return { value: el.value, text: (el.closest("label")?.textContent ?? "").trim() };
  });
  check("and a photograph opens with its shadow colour untouched", rest.value === "1",
    `opens at ${rest.value}, label "${rest.text}"`);

  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
