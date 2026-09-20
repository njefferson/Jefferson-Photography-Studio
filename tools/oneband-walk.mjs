// THE ONE-BAND SENTENCE SURVIVES A SWITCH.
//
// A camera-rendered infrared JPEG can arrive with all its colour in one band.
// The app then correctly does NOT gray-world balance it under a colour look —
// balancing manufactures a second band and crushes the frame — and says so in
// #lookState. That sentence was written by applyLook and gated on an identity
// check against the photo it was measured on; applyLook runs on a FIRST visit
// and never again, so every return visit showed the flat frame with the look
// lit and no explanation.
//
// Two photos, a look, and a switch away and back. The assertion is about the
// SECOND visit, which is the one that was broken.
//
// THE FIXTURES ARE CAMERA-RENDERED, and made rather than found: the practice
// raws in this repository carry no embedded preview, and the frames this was
// reported on could not be reached. Each is a JPEG of a practice raw's BARE
// DECODE — what "Hold: Untouched" shows, which is the same red-flooded,
// unbalanced state a camera writes for infrared. Check 0 is the control that
// says so: it asserts the fixture really is one-band, because the interesting
// check passes vacuously on a file that has two bands, and the first fixture
// tried (canopy.jpg, an app EXPORT) was exactly that and said so.
//
// Measured on three builds: production 2.46.6 fails check 1, the 2.46.16 that
// was on the reader's device fails it identically, and the fix passes. So the
// defect is not a regression from either — it is what a return visit has always
// done.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const PORT = (process.argv.find(a => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const EX = new URL("./fixtures/", import.meta.url).pathname;
const SET = [EX + "camera-ir-a.jpg", EX + "camera-ir-b.jpg"];
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  console.log(`        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};
const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader","--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  p.on("dialog", d => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", SET);
  await p.waitForFunction((n) => document.querySelectorAll("#sessionThumbs .session-thumb").length === n, SET.length, { timeout: 300000 });
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForTimeout(2500);

  const state = () => p.evaluate(() => {
    const el = document.getElementById("lookState");
    return { hidden: !!el?.hidden, len: (el?.textContent || "").length };
  });
  // BY ID, NOT BY LABEL. This matched the first button whose text starts with
  // the string, which was fine while exactly one button said "Aerochrome" --
  // and the day a second look shipped under that name, the walk would have gone
  // on passing while measuring a different look entirely. A label is product
  // copy and changes; an id is the thing being tested.
  const press = async (id) => {
    await p.evaluate((t) => document.getElementById(t)?.click(), id);
    await p.waitForTimeout(1600);
  };
  const stepTo = async (i) => {
    await p.evaluate((n) => document.querySelectorAll("#sessionThumbs .session-thumb")[n].click(), i);
    await p.waitForFunction((n) => document.querySelectorAll("#sessionThumbs .session-thumb")[n]?.classList.contains("active"), i, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await p.waitForTimeout(1200);
  };

  await press("lookAero");
  const first = await state();
  console.log(`        photo 0, first visit, look on: ${JSON.stringify(first)}`);

  // THE CONTROL. If the sentence is hidden here too, this file is not one-band
  // and the walk is measuring nothing — say so rather than passing vacuously.
  check("0 the fixture is a one-band file, so there is something to assert", first.hidden, false);

  await stepTo(1);
  await stepTo(0);
  const back = await state();
  check("1 the sentence is still there after switching away and back", back, first);

  // ── the choice ──────────────────────────────────────────────────────────
  // "Balance it anyway" is the rendering this app used to give these files
  // before 2026-09-11, when skipping the balance became the policy. It has to
  // CHANGE THE PICTURE — a button that relabels itself and leaves the canvas
  // alone is the shape of defect this whole walk exists for — and it has to
  // survive undo and a switch like any other edit.
  const shot = () => p.evaluate(() => {
    const c = document.querySelector("canvas");
    const g = c.getContext("webgl2") || c.getContext("webgl");
    const w = 64, h = 64;
    const buf = new Uint8Array(w * h * 4);
    if (g) {
      const fx = Math.floor((c.width - w) / 2), fy = Math.floor((c.height - h) / 2);
      g.readPixels(fx, fy, w, h, g.RGBA, g.UNSIGNED_BYTE, buf);
    }
    let r = 0, gg = 0, b = 0, dark = 0;
    for (let i = 0; i < buf.length; i += 4) {
      r += buf[i]; gg += buf[i + 1]; b += buf[i + 2];
      if (Math.max(buf[i], buf[i + 1], buf[i + 2]) < 16) dark++;
    }
    const n = buf.length / 4;
    return { r: +(r / n).toFixed(1), g: +(gg / n).toFixed(1), b: +(b / n).toFixed(1), crushed: +(dark / n).toFixed(3) };
  });
  const before = await shot();
  await p.evaluate(() => document.getElementById("lookForceBalance")?.click());
  await p.waitForTimeout(1600);
  const after = await shot();
  const label = await p.evaluate(() => document.getElementById("lookForceBalance")?.textContent.trim());
  console.log(`        unbalanced rgb(${before.r},${before.g},${before.b}) crushed ${(before.crushed*100).toFixed(1)}%`);
  console.log(`        balanced   rgb(${after.r},${after.g},${after.b}) crushed ${(after.crushed*100).toFixed(1)}%`);
  const moved = Math.abs(before.r - after.r) + Math.abs(before.g - after.g) + Math.abs(before.b - after.b);
  check("2 the button exists and says what it will do next", label, "Back to the camera's colour");
  check("3 pressing it CHANGES THE PICTURE, not just the label", moved > 12, true);

  // THE SECOND PRESS, which nothing asserted and which did not work.
  // Check 3 proved the first press changes the picture; the label flipped on
  // every press after that and the picture never moved again. A toggle is two
  // states, and a walk that only exercises the first one measures half a
  // control — the same half-measurement as check 2 asserting the label.
  await p.evaluate(() => document.getElementById("lookForceBalance")?.click());
  await p.waitForTimeout(1600);
  const backAgain = await shot();
  check("3b and pressing it again puts the picture back", 
    Math.abs(backAgain.r - before.r) < 6 && Math.abs(backAgain.b - before.b) < 6, true);
  console.log(`        back      rgb(${backAgain.r},${backAgain.g},${backAgain.b}) — opened at rgb(${before.r},${before.g},${before.b})`);
  await p.evaluate(() => document.getElementById("lookForceBalance")?.click());
  await p.waitForTimeout(1600);

  await p.keyboard.press("Control+z");
  await p.waitForTimeout(1200);
  const undone = await shot();
  check("4 and one press is one undo step", Math.abs(undone.r - before.r) < 6 && Math.abs(undone.b - before.b) < 6, true);

  await p.evaluate(() => document.getElementById("lookForceBalance")?.click());
  await p.waitForTimeout(1600);
  await stepTo(1);
  await stepTo(0);
  const kept = await p.evaluate(() => document.getElementById("lookForceBalance")?.getAttribute("aria-pressed"));
  check("5 the choice survives leaving the photo and coming back", kept, "true");
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
