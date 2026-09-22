#!/usr/bin/env node
// THE APP SHELL'S GRID, AT EVERY WIDTH, WITH THE UPDATE STRIP BOTH WAYS.
//
// WHY IT EXISTS, reported from an iPhone 2026-09-22: a landscape photograph on
// a phone held in portrait gave a black screen that could not be tapped out of.
// The only way back was to turn rotation lock off and rotate to landscape.
//
// `.sw-strip` is placed with `grid-area: swstrip`. The desktop template
// declares that area; the phone template (max-width: 760px) did NOT. A grid
// item whose named area does not exist in the template in force does not fall
// back to the normal flow — it AUTO-PLACES INTO THE IMPLICIT GRID. Measured at
// 302x656 with the strip shown, before the fix: one column became
// `16px 0px 286px`, three rows became five, the stage collapsed to 16x62 and
// the top bar to 16px wide. The whole app in a sliver down one edge, nothing on
// it big enough to press, and the update strip the only working control there.
// Rotating past 760px left the media query for the template that DOES declare
// the area, which is the entire reason the workaround worked.
//
// IT NEEDED A WAITING WORKER TO APPEAR AT ALL, which is why it survived from
// the strip landing (2026-09-10) until somebody happened to be holding a phone
// at the moment an update was ready. A defect that needs two rare states at
// once is exactly the kind no screenshot sweep finds.
//
// THE INVARIANT IS THE ONE THAT BROKE, AND IT NEEDS NO KNOWLEDGE OF THE
// TEMPLATE. Showing the strip must not change the COLUMN COUNT, and must add at
// most one row. Anything else means an item landed outside the explicit grid.
// Asserting that rather than "the phone template contains the word swstrip"
// catches the whole class: any future grid-area pointing at an area some
// breakpoint forgot to declare fails here, whatever it is called.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
requireFreshDist();

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.6.1 Mobile/15E148 Safari/604.1";

// The reader's own layout viewport from the report (a 402px iPhone at 1.33x
// page zoom), the same phone unzoomed, and a width past the 760px breakpoint.
const WIDTHS = [
  [302, 656, "iPhone at 1.33x page zoom"],
  [402, 874, "iPhone, no page zoom"],
  [900, 700, "past the 760px breakpoint"],
];

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

const READ = `(() => {
  const app = document.getElementById("app");
  const cs = getComputedStyle(app);
  const tracks = (v) => v.trim().split(/\\s+/).filter(Boolean).length;
  const w = (el) => (el ? Math.round(el.getBoundingClientRect().width) : -1);
  return {
    cols: tracks(cs.gridTemplateColumns), rows: tracks(cs.gridTemplateRows),
    colText: cs.gridTemplateColumns,
    app: w(app), stage: w(document.getElementById("stage")),
    bar: w(document.querySelector(".bar")), strip: w(document.getElementById("swStrip")),
    vw: innerWidth, scrollW: document.documentElement.scrollWidth,
  };
})()`;

const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
try {
  for (const [width, height, label] of WIDTHS) {
    const ctx = await br.newContext({ viewport: { width, height }, deviceScaleFactor: 2, isMobile: width < 760, hasTouch: true, userAgent: UA });
    const page = await ctx.newPage();
    try {
      await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
      await page.waitForTimeout(900);
      await page.evaluate(() => { const d = document.getElementById("welcomeDlg"); if (d?.open) d.close(); });
      await page.waitForTimeout(300);

      const before = await page.evaluate(READ);
      // §7h's state: a worker is waiting, so the reader is told in words.
      await page.evaluate(() => { document.getElementById("swStrip").hidden = false; });
      await page.waitForTimeout(500);
      const after = await page.evaluate(READ);

      console.log(`  ${label.padEnd(30)} ${width}x${height}`);
      console.log(`  ${"".padEnd(30)} strip hidden: ${before.cols} col / ${before.rows} row · stage ${before.stage} · bar ${before.bar}`);
      console.log(`  ${"".padEnd(30)} strip shown : ${after.cols} col / ${after.rows} row · stage ${after.stage} · bar ${after.bar} · strip ${after.strip}`);

      if (after.cols !== before.cols) {
        fail(`${label}: showing the update strip changed the column count ${before.cols} -> ${after.cols} (${after.colText}) — it landed outside the explicit grid`);
      } else if (after.rows > before.rows + 1) {
        fail(`${label}: showing the update strip added ${after.rows - before.rows} rows — it landed outside the explicit grid`);
      } else if (after.stage < before.stage) {
        fail(`${label}: the stage narrowed from ${before.stage} to ${after.stage} when the strip appeared`);
      } else if (after.bar !== before.bar) {
        fail(`${label}: the top bar changed width ${before.bar} -> ${after.bar} when the strip appeared — its controls have moved off the screen`);
      } else if (after.scrollW > after.vw + 1) {
        fail(`${label}: the page overflows its viewport by ${after.scrollW - after.vw}px with the strip shown`);
      } else if (after.strip < 1) {
        fail(`${label}: the update strip has no width, so the reader is not told after all`);
      } else {
        ok(`${label}: the strip takes a row and the shell is unchanged`);
      }
    } catch (e) {
      fail(`${label}: the walk could not run — ${e}`);
    } finally { await ctx.close(); }
  }
} finally { await br.close(); }
console.log(bad ? `\n${bad} failed\n` : "\nthe update strip never leaves the explicit grid\n");
process.exit(bad ? 1 : 0);
