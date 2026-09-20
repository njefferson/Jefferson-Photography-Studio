#!/usr/bin/env node
// DOUBLE-TAP PUTS A CONTROL BACK WHERE THE PHOTO OPENED — every control it is
// claimed for, including the one that is not an input.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/double-tap-walk.mjs [--port=8131]
//
// The gesture has no visible affordance: nothing on screen moves when it is
// wired and nothing moves when it is not. It has never had a check, and the
// sliders have carried it since 2026-09-09 on the strength of one manual try.
//
// The tone curve's five points are the interesting half. They are SVG circles,
// not `input[type="range"]`, so the delegation that covers every slider could
// not see them and the baseline map that holds "where the photo opened" had
// nowhere to put them. They also capture the pointer for their own drag, which
// is why the timed touch path matters at least as much here as on a slider.
//
// BACK TO WHERE THE PHOTO OPENED, NOT TO A STRAIGHT LINE. Restore depth solves a
// curve per frame at open, so a photograph does not open on the diagonal — a
// point that went back to TONE_DEFAULT would mean something different from the
// same gesture on the slider beside it, and different from Reset.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const EX = "/home/user/Jefferson-Photography-Studio/public/examples";

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const p = await br.newPage({ viewport: { width: 1000, height: 820 }, hasTouch: true });
  await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p.setInputFiles("#file", [`${EX}/NIR_0063.dng`]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForTimeout(2000);
  await p.click("#ptab-tone").catch(() => {});
  await p.waitForTimeout(600);

  const dotCy = (i) => p.evaluate((k) =>
    Number(document.querySelectorAll("#toneSvg .tone-dot")[k]?.getAttribute("cy")), i);

  const opened = await dotCy(2);
  if (!Number.isFinite(opened)) { fail("no tone curve on screen — the walk cannot see its own case"); }
  else {
    // A photograph opens on a SOLVED curve, so the middle point is not at 50.
    // Said out loud because it is the whole reason the baseline is captured
    // rather than assumed.
    console.log(`  the photo opened with the middle point at cy ${opened.toFixed(1)}${Math.abs(opened - 50) < 0.5 ? "  (straight line — Restore depth may be off)" : ""}`);

    // MOVE IT, by the same pointer path a finger takes.
    const box = await p.evaluate(() => {
      const d = document.querySelectorAll("#toneSvg .tone-dot")[2].getBoundingClientRect();
      return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
    });
    await p.mouse.move(box.x, box.y);
    await p.mouse.down();
    await p.mouse.move(box.x, box.y - 40, { steps: 8 });
    await p.mouse.up();
    await p.waitForTimeout(500);
    const moved = await dotCy(2);
    if (!(Math.abs(moved - opened) > 1)) { fail(`the drag did not move the point (${opened.toFixed(1)} -> ${moved.toFixed(1)}) — nothing after this proves anything`); }
    else {
      ok(`a drag moves the middle point (cy ${opened.toFixed(1)} -> ${moved.toFixed(1)})`);

      // RE-READ THE DOT'S POSITION. It MOVED — that is what the drag was for —
      // and the first version of this walk went on tapping where it used to be,
      // 40px away, hitting a grid line. Two taps on a grid line do nothing, the
      // point stayed where the drag left it, and the walk reported the gesture
      // broken. A stale coordinate is the instrument, not the app.
      const at = await p.evaluate(() => {
        const d = document.querySelectorAll("#toneSvg .tone-dot")[2].getBoundingClientRect();
        return { x: d.x + d.width / 2, y: d.y + d.height / 2 };
      });
      // DOUBLE-TAP IT. The timed touch path, because that is the one the target
      // device takes and the one a captured pointer does not break.
      await p.touchscreen.tap(at.x, at.y);
      await p.waitForTimeout(90);
      await p.touchscreen.tap(at.x, at.y);
      await p.waitForTimeout(600);
      const backTo = await dotCy(2);
      Math.abs(backTo - opened) < 1.5
        ? ok(`double-tap puts it back where the photo opened (cy ${backTo.toFixed(1)})`)
        : fail(`double-tap left the point at cy ${backTo.toFixed(1)}, not the ${opened.toFixed(1)} the photo opened with`);
    }
  }

  // AND THE SLIDERS, which have carried this gesture untested since it shipped.
  // #sat is on the COLOR tab. The first version of this walk asked for Basic,
  // the slider was hidden, its box came back at the origin, and the taps went to
  // the top-left corner of the page — "element is not visible" was the only
  // trace, and it was in Playwright's log rather than in the walk's own output.
  await p.click("#ptab-color").catch(() => {});
  await p.waitForTimeout(400);
  const sl = await p.evaluate(() => {
    const el = document.getElementById("sat");
    if (!el) return null;
    const was = el.value;
    el.value = String(Number(was) + 0.5);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    const r = el.getBoundingClientRect();
    return { was, now: el.value, x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (!sl) fail("no saturation slider to test");
  else {
    await p.waitForTimeout(300);
    // A tap on a range input sets it to the tapped position, so both taps land
    // on the same spot on purpose: what is being tested is the second tap
    // arriving inside the window, not where the first one left the value.
    await p.touchscreen.tap(sl.x, sl.y);
    await p.waitForTimeout(90);
    await p.touchscreen.tap(sl.x, sl.y);
    await p.waitForTimeout(500);
    const after = await p.evaluate(() => document.getElementById("sat").value);
    after === sl.was
      ? ok(`double-tap puts a slider back too (${sl.now} -> ${after})`)
      : fail(`double-tap left the slider at ${after}, not the ${sl.was} the photo opened with`);
  }
} finally { await br.close(); }
console.log(bad ? `\n${bad} failed\n` : "\ndouble-tap returns every control it is offered on\n");
process.exit(bad ? 1 : 0);
