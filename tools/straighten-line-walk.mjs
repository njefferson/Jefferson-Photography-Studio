#!/usr/bin/env node
// STRAIGHTEN TO A LINE YOU DRAW.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/straighten-line-walk.mjs [--port=8131] [--shots=DIR]
//
// WHY IT EXISTS (decision 038). Asked from the device: straightening should let
// you draw a line on the photograph and have the frame turn to it. Today the
// control is an ANGLE — a slider, tenth-degree nudges and a grid — so the
// reader sets a number and judges the result. What they know is not an angle:
// it is that THIS edge should be level.
//
// WHAT IS ASSERTED AND WHY EACH.
//
//   1. The tool arms and says what it is waiting for, and the label changes
//      with it — the pressed fill is the colour half of that signal and the
//      label is the half that survives grayscale.
//   2. ONE TAP MOVES NOTHING. The frame must not turn until the second end
//      lands, because that is what makes the gesture abandonable.
//   3. THE MAGNITUDE IS THE LINE'S OWN SLOPE, to a tenth. A line drawn six
//      degrees off level must move the frame by six degrees, not by five and
//      not by ninety.
//   4. AND THE ANSWER IS ANTISYMMETRIC: the same line drawn the other way up
//      gives the opposite angle. A line has no direction, so an implementation
//      that read `atan2` without folding it would fail here and nowhere else.
//   5. NEAR-VERTICAL IS READ AS A VERTICAL. Past 45 degrees the reader drew a
//      doorframe, and an honest reading of the slope would turn the photograph
//      almost ninety degrees — which is the one case every implementation of
//      this has to handle.
//   6. ONE GESTURE IS ONE UNDO STEP.
//   7. A DRAG PLACES NOTHING, so a stray movement while the tool is armed
//      cannot drop a point; and disarming clears a half-placed line.
//
// WHAT THIS WALK CANNOT SETTLE, AND SAYS SO. Which DIRECTION is negative is a
// fact about this pipeline's geometry — `levelHorizon` records the same thing
// about its own sign — and no number printed here distinguishes "levelled" from
// "tilted twice as far the other way". So it saves a before and an after
// screenshot and they are OPENED. A number is a pointer to where to look.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const arg = (n, d) => (process.argv.find((a) => a.startsWith(`--${n}=`)) || `--${n}=${d}`).split("=")[1];
const PORT = arg("port", "8131");
const SHOTS = arg("shots", "");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(350); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };
const angle = (p) => p.evaluate(() => Number(document.getElementById("straighten")?.value ?? "NaN"));
const armed = (p) => p.evaluate(() => ({
  pressed: document.getElementById("cropLine")?.getAttribute("aria-pressed") === "true",
  label: document.getElementById("cropLine")?.textContent ?? "",
  said: document.getElementById("cropLevelNote")?.textContent ?? "",
}));

/** The two ends of a line at `deg`, in client coordinates. `deg` is the SCREEN
 *  slope, positive downward to the right, which is what `atan2(dy, dx)` reports.
 *
 *  CENTRED HIGH AND LENGTH-CAPPED PER SLOPE, because the straighten pill floats
 *  over the BOTTOM of the photograph. A fixed reach put a near-vertical line's
 *  lower end inside that pill, so the second tap pressed the tool's own button
 *  instead of landing on the frame — and the failure that produced read as the
 *  app ignoring an upright edge. The instrument was wrong, not the app. */
async function ends(p, deg) {
  const box = await p.locator("#cropOverlay").boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height * 0.36;
  const r = (deg * Math.PI) / 180;
  const cap = Math.min(
    (box.width * 0.34) / Math.max(0.08, Math.abs(Math.cos(r))),
    (box.height * 0.26) / Math.max(0.08, Math.abs(Math.sin(r))),
  );
  const dx = Math.cos(r) * cap, dy = Math.sin(r) * cap;
  return [{ x: cx - dx, y: cy - dy }, { x: cx + dx, y: cy + dy }];
}
const tap = async (p, pt) => { await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(120); };
/** Back to level between checks, THROUGH THE SLIDER rather than through Reset:
 *  Reset disables itself when there is nothing to reset, so a walk that pressed
 *  it would throw a timeout instead of reporting a finding the first time a
 *  check left the frame already level. The slider is always there and always
 *  reaches `applyStraighten`, which is the door under test anyway. */
const level = async (p) => { await p.fill("#straighten", "0"); await settle(p); };

/** Arm the tool, draw a line at `deg`, and give back the angle it landed on.
 *  `flip` taps the two ends in the other order — the SAME line drawn the other
 *  way round, which is the only thing that exercises the fold to (-90, 90]. */
async function drawLine(p, deg, flip = false) {
  await p.click("#cropLine");
  const [a, b] = await ends(p, deg);
  await tap(p, flip ? b : a);
  await tap(p, flip ? a : b);
  await settle(p);
  return angle(p);
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader", "--no-sandbox"],
});
try {
  const ctx = await b.newContext({ viewport: { width: 1100, height: 850 } });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);
  await p.click("#ptab-crop");
  await p.click("#straightenBtn");
  await p.waitForFunction(() => !document.getElementById("cropTools")?.hidden, null, { timeout: 20000 });
  await settle(p);
  if (SHOTS) { mkdirSync(SHOTS, { recursive: true }); await p.screenshot({ path: join(SHOTS, "01-before.png") }); }

  // 1 · IT ARMS, AND SAYS WHAT IT WANTS.
  const off = await armed(p);
  await p.click("#cropLine");
  await settle(p);
  const on = await armed(p);
  check("the tool arms, and both the state and the label say so",
    !off.pressed && on.pressed && on.label !== off.label && /tap one end/i.test(on.said),
    `"${off.label}" -> "${on.label}" · "${on.said}"`);

  // 2 · ONE TAP MOVES NOTHING.
  const [a6, b6] = await ends(p, 6);
  await tap(p, a6);
  await settle(p);
  const afterOne = await angle(p);
  const mid = await armed(p);
  check("one end placed, and the frame has not moved",
    afterOne === 0 && mid.pressed && /other end/i.test(mid.said),
    `angle ${afterOne}° · "${mid.said}"`);

  // 3 · THE MAGNITUDE IS THE LINE'S OWN SLOPE.
  await tap(p, b6);
  await settle(p);
  const six = await angle(p);
  const done = await armed(p);
  check("a line six degrees off level moves the frame by six degrees",
    Math.abs(Math.abs(six) - 6) <= 0.2, `${six}° against 6.0° drawn`);
  check("and the tool disarms itself once the line is complete",
    !done.pressed && /levelled to your line/i.test(done.said), `"${done.said}"`);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, "02-levelled-to-a-6-degree-line.png") });

  // 6 · ONE GESTURE IS ONE UNDO STEP. Asserted here, while there is exactly
  // one thing to undo.
  await p.click("#undoBtn");
  await settle(p);
  const undone = await angle(p);
  check("one gesture is one undo step", undone === 0, `back to ${undone}° after one Undo`);

  // 4 · A LINE HAS NO DIRECTION. The same two ends tapped the other way round
  // is the same edge and must give the same angle — and this is the ONLY check
  // that exercises the fold to (-90, 90]. An implementation that took atan2 at
  // face value reads this line as 174 degrees off level, lands on the clamp,
  // and passes every other check in this file.
  const flipped = await drawLine(p, 6, true);
  check("the same line tapped the other way round gives the same angle",
    Math.abs(flipped - six) <= 0.2, `${flipped}° against ${six}° tapped the other way`);
  await level(p);

  // ...AND A LINE TILTED THE OTHER WAY GIVES THE OPPOSITE ANGLE, which is a
  // different property from the one above and catches a sign that is right
  // only on one side of level.
  const minusSix = await drawLine(p, -6);
  check("a line tilted the other way gives the opposite angle",
    Math.abs(minusSix + six) <= 0.2, `${minusSix}° against ${six}°`);
  await level(p);

  // 5 · NEAR-VERTICAL IS A VERTICAL, not an eighty-four degree turn.
  const upright = await drawLine(p, 84);
  check("a near-vertical line is read as an upright edge",
    Math.abs(Math.abs(upright) - 6) <= 0.2, `${upright}° from a line 84° off level`);
  if (SHOTS) await p.screenshot({ path: join(SHOTS, "03-levelled-to-an-upright-edge.png") });
  await level(p);

  // 7 · A DRAG PLACES NOTHING, AND DISARMING CLEARS A HALF-DRAWN LINE.
  await p.click("#cropLine");
  const [ad] = await ends(p, 6);
  await p.mouse.move(ad.x, ad.y);
  await p.mouse.down();
  await p.mouse.move(ad.x + 40, ad.y + 6, { steps: 4 });
  await p.mouse.up();
  await settle(p);
  const afterDrag = await angle(p);
  const stillWaiting = await armed(p);
  check("a drag places nothing",
    afterDrag === 0 && stillWaiting.pressed && /tap one end/i.test(stillWaiting.said),
    `angle ${afterDrag}° · "${stillWaiting.said}"`);
  await tap(p, ad); // one end down...
  await p.click("#cropLine"); // ...and the tool pressed again
  await settle(p);
  const abandoned = await armed(p);
  const lineGone = await p.evaluate(() => !!document.getElementById("straightenLine")?.hasAttribute("hidden"));
  check("pressing it again abandons a half-drawn line, and the line goes with it",
    !abandoned.pressed && lineGone && (await angle(p)) === 0,
    `pressed ${abandoned.pressed}, line hidden ${lineGone}`);

  if (SHOTS) console.log(`\n  shots in ${SHOTS} — OPEN THEM. The numbers above cannot tell levelled from tilted twice as far the other way.\n`);
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
