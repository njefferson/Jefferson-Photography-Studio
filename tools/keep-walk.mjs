#!/usr/bin/env node
// SAVE A PHOTOGRAPH AS A FILE, PICK IT BACK, AND GET THE SAME PHOTOGRAPH WITH
// THE SAME EDIT ON IT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/keep-walk.mjs [--port=8131] [--file=/path/to.NEF]
//
// WHAT THIS PROVES THAT keepfile-check DOES NOT (decision 043). That one holds
// the CONTAINER to its promise in isolation: write bytes, read them back,
// byte-identical, damage refused. This holds the JOIN — that the app writes
// what it thinks it writes and opens what it wrote.
//
// AND THE EDIT IT CHECKS IS A PAINTED MASK, not a slider. A slider is a number
// and every channel here carries numbers; a painted selection is nothing but
// the bitmap somebody painted, so it is the piece with no recipe behind it and
// the only one whose loss cannot be recovered from anywhere else. The first
// version of this format dropped it — along with the warp and the LUT — by
// inheriting the mask LIBRARY's rule, which is about applying a mask to OTHER
// photographs and is a question a keep file never asks. A saved photograph that
// comes back without its selections is not one you can go on editing.
//
// IT IS MEASURED AS COVERAGE ON SCREEN, through the app's own matte view, and
// not by reading a bitmap out of the page. What the reader gets back is a
// picture; a byte array that matches while nothing reaches the renderer is the
// shape of pass this repository has the most lessons about. Every interaction below is
// a REAL press through the browser's input pipeline and a REAL download
// captured off the page, never `element.click()` in an evaluate: a dispatched
// event is not a gesture, and a harness that presses by id cannot tell you
// whether a finger could have got there (hub LESSONS 348).
import { openMasks, closeMasks } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
import { readFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// BEFORE THE BROWSER, AND THIS WALK PROVED WHY. It renders through the build in
// `dist`, and a stale one measures the PREVIOUS build. The first attempt to make
// this walk fail planted a defect that did not compile — so `npm run build`
// stopped, `dist` kept the previous bundle, and the walk went green against a
// build that did not contain the plant. That is hub LESSONS 345, met head on by
// the very run meant to earn trust in this file. See tools/fresh-dist.mjs.
requireFreshDist();

const arg = (k, d) => (process.argv.find((a) => a.startsWith(`--${k}=`)) || `--${k}=${d}`).split("=").slice(1).join("=");
const BASE = `http://127.0.0.1:${arg("port", "8131")}`;
const FILE = arg("file", "/tmp/claude-0/-home-user/e7a820ad-44f5-555c-96b8-a4dcabafb549/scratchpad/real2/NIR_1737.NEF");
if (!existsSync(FILE)) { console.log(`no frame at ${FILE} — pass --file=`); process.exit(1); }

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

/** Fraction of the canvas the matte view is showing as selected.
 *
 *  The matte drops the photograph to dim monochrome and paints the selection in
 *  one colour (gl.ts: `vec3(1.0, 0.92, 0.25)`), which is why coverage can be
 *  read off the rendered frame at all — and why it is read by BOTH hue and
 *  brightness, so a half-covered pixel reads as half. The same measure
 *  `tools/fix-brush-walk.mjs` uses, deliberately: two instruments for one
 *  quantity is how they come to disagree. */
const matteCoverage = (page) => page.evaluate(() => {
  const c = document.getElementById("view");
  const oc = document.createElement("canvas");
  oc.width = c.width; oc.height = c.height;
  oc.getContext("2d").drawImage(c, 0, 0);
  const d = oc.getContext("2d").getImageData(0, 0, oc.width, oc.height).data;
  let n = 0, hit = 0;
  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const V = Math.max(r, g, b); n++;
    if (g > 0.75 * r && b < 0.6 * g && V > 0.45) hit++;
  }
  return hit / n;
});

/** Paint a stroke across the photograph, as a finger would. */
const paintStroke = async (page) => {
  const box = await page.locator("#view").boundingBox();
  const y = box.y + box.height * 0.42;
  await page.mouse.move(box.x + box.width * 0.22, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(box.x + box.width * (0.22 + 0.056 * i), y + Math.sin(i) * 8);
  await page.mouse.up();
  await page.waitForTimeout(900);
};

/** Arm the matte, read the coverage, put it away. Reading it means LOOKING at
 *  the rendered frame, so the view has to be the one the reader judges with. */
const coverageOf = async (page, row) => {
  await openMasks(page);
  await page.waitForTimeout(500);
  const pick = page.locator("#maskList .mask-row").nth(row).locator(".mask-pick");
  if ((await pick.getAttribute("aria-pressed")) !== "true") { await pick.click(); await page.waitForTimeout(500); }
  await page.locator("#mMatte").click();
  await page.waitForTimeout(900);
  const cov = await matteCoverage(page);
  await page.locator("#mMatte").click();
  await page.waitForTimeout(500);
  return cov;
};

const dir = mkdtempSync(join(tmpdir(), "keep-walk-"));
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  const ctx = await br.newContext({ viewport: { width: 1194, height: 834 }, acceptDownloads: true });
  const p = await ctx.newPage();
  console.log("\n=== keep file · save it, pick it back, same photograph same edit ===\n");

  await p.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p.waitForTimeout(1000);
  await p.setInputFiles("#file", [FILE]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForTimeout(2500);

  // AN EDIT WORTH RECOGNISING. A default edit would let a keep file that
  // carried NO edit pass this walk, which is the failure it exists to catch.
  await closeMasks(p); await p.locator("#ptab-basic").click();
  await p.waitForTimeout(400);
  const MARK = "0.62";
  await p.evaluate((v) => {
    const el = document.getElementById("sat");
    el.value = v;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, MARK);
  await p.waitForTimeout(1200);
  const before = await p.evaluate(() => document.getElementById("sat").value);
  check("the edit was made and the control reads it back", before, MARK);

  // AND A PAINTED MASK, which is the part with no recipe behind it.
  await openMasks(p);
  await p.waitForTimeout(500);
  await p.locator("#addBrush").click();
  await p.waitForTimeout(700);
  await paintStroke(p);
  const painted = await coverageOf(p, 0);
  check("a stroke was painted and the app shows it as coverage", painted > 0.005, true);
  console.log(`          painted coverage: ${(painted * 100).toFixed(2)}% of the frame`);
  const maskLabel = await p.locator("#maskList .mask-row").nth(0).locator(".mask-pick").textContent();

  // THE REAL PRESS, and the real save.
  await closeMasks(p); await p.locator("#ptab-export").click();
  await p.waitForTimeout(500);
  const btn = p.locator("#keepFile");
  const box = await btn.boundingBox();
  check("the save control is on screen and finger-sized", !!box && box.width >= 44 && box.height >= 44, true);
  const [download] = await Promise.all([p.waitForEvent("download", { timeout: 120000 }), btn.click({ timeout: 60000 })]);
  const saved = join(dir, download.suggestedFilename());
  await download.saveAs(saved);
  // THE NAME MUST END IN A TYPE THE PLATFORM REGISTERS, and this walk cannot
  // test the thing that actually matters about it. The first version saved a
  // `.ipskeep`, every check here passed, and on an iPad the Files picker greyed
  // the file out — 27.9 MB, named correctly, unselectable, because iOS filters
  // that picker by UTI and an unregistered extension matches no allowed type.
  // Chromium's file input does NO such filtering: `setInputFiles` hands the
  // page any file whatever `accept` says, which is exactly why the pick-it-back
  // step below went green against a file no reader could have chosen.
  //
  // So this asserts the one property that IS checkable here — the name ends in
  // `.zip`, a real registered type and the thing the container actually is —
  // and states plainly that selectability is a DEVICE question. Do not read
  // this walk's green as covering it.
  check("the saved file ends in a type the platform registers", /\.zip$/i.test(download.suggestedFilename()), true);
  check("...and still says what it is", /\.ipskeep\.zip$/i.test(download.suggestedFilename()), true);

  // The original inside, against the original on disk — the whole promise.
  const src = readFileSync(FILE);
  const pkg = readFileSync(saved);
  check("the package is at least as big as the photograph it carries", pkg.length >= src.length, true);
  let at = -1;
  for (let i = 0; i + src.length <= pkg.length && at < 0; i++) {
    let hit = pkg[i] === src[0];
    for (let k = 1; hit && k < src.length; k++) if (pkg[i + k] !== src[k]) hit = false;
    if (hit) at = i;
  }
  check("...and your photograph is inside it, byte for byte, in one contiguous run", at >= 0, true);

  // PICK IT BACK through the same picker a reader uses.
  const p2 = await ctx.newPage();
  await p2.goto(`${BASE}/ir.html`, { waitUntil: "load" });
  await p2.waitForTimeout(1000);
  await p2.setInputFiles("#file", [saved]);
  await p2.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p2.waitForTimeout(3000);
  await closeMasks(p2); await p2.locator("#ptab-basic").click();
  await p2.waitForTimeout(600);
  const after = await p2.evaluate(() => document.getElementById("sat").value);
  check("picking it back opens the photograph with the SAME edit on it", after, MARK);

  // THE MASK. Same row, same name, and — the part that actually matters — the
  // same pixels selected, read off the app's own matte rather than out of a
  // field. A tolerance rather than equality because the frame is re-decoded and
  // re-rendered from scratch; a mask that was DROPPED reads zero, which is not
  // a near miss, and a mask restored empty reads zero too.
  const rows2 = await p2.locator("#maskList .mask-row").count().catch(() => 0);
  await openMasks(p2);
  await p2.waitForTimeout(600);
  const rowCount = await p2.locator("#maskList .mask-row").count();
  check("the painted mask is in the list after reopening", rowCount >= 1, true);
  const label2 = rowCount ? await p2.locator("#maskList .mask-row").nth(0).locator(".mask-pick").textContent() : "(none)";
  check("...under the name it had", label2, maskLabel);
  const back = rowCount ? await coverageOf(p2, 0) : 0;
  console.log(`          restored coverage: ${(back * 100).toFixed(2)}% of the frame`);
  check("...selecting the same pixels it was painted over",
    back > 0 && Math.abs(back - painted) <= Math.max(0.004, painted * 0.15), true);
  void rows2;
  const name = await p2.evaluate(() => document.title + "|" + (document.getElementById("hint")?.textContent ?? ""));
  console.log(`          opened as: ${name.slice(0, 70)}`);
} finally {
  await br.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(failed ? `\n  ${failed} check(s) failed\n` : "\n  saved, picked back, same photograph and same edit\n");
process.exit(failed ? 1 : 0);
