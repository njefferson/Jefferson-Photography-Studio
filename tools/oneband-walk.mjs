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
  const press = async (label) => {
    await p.evaluate((t) => {
      const b2 = [...document.querySelectorAll("button")].find((x) => (x.textContent || "").trim().startsWith(t));
      b2?.click();
    }, label);
    await p.waitForTimeout(1600);
  };
  const stepTo = async (i) => {
    await p.evaluate((n) => document.querySelectorAll("#sessionThumbs .session-thumb")[n].click(), i);
    await p.waitForFunction((n) => document.querySelectorAll("#sessionThumbs .session-thumb")[n]?.classList.contains("active"), i, { timeout: 300000 });
    await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await p.waitForTimeout(1200);
  };

  await press("Aerochrome");
  const first = await state();
  console.log(`        photo 0, first visit, look on: ${JSON.stringify(first)}`);

  // THE CONTROL. If the sentence is hidden here too, this file is not one-band
  // and the walk is measuring nothing — say so rather than passing vacuously.
  check("0 the fixture is a one-band file, so there is something to assert", first.hidden, false);

  await stepTo(1);
  await stepTo(0);
  const back = await state();
  check("1 the sentence is still there after switching away and back", back, first);
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
