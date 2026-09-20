#!/usr/bin/env node
// THE DECIDING KEYS, AND WHETHER THEY CAN BE REACHED AT ALL.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/quicklook-keys-walk.mjs
//
// NOT in .branch-guard's `also=`: it drives a real browser against a real
// build, which is tens of seconds, not milliseconds. Run it before any release
// that touches the quick look, beside tools/class-width-walk.mjs.
//
// IT LIVES IN THE REPO RATHER THAN THE SCRATCHPAD ON PURPOSE, for the reason
// class-width-walk.mjs gives in its own header: a scratchpad copy is gone with
// the container, and the next session to meet this defect would build it again
// from nothing.
//
// WHAT IT LOOKS FOR, and why reading the source cannot. P/X/U/C were wired to
// `qlGrid`, which means they fire only with focus INSIDE the grid. The dialog
// opens with its grid empty, so the browser's initial focus goes to the first
// focusable thing in it — the Close button, a SIBLING of the grid — and every
// tile is born tabIndex -1. Reading the handler tells you the keys are correct,
// which they were: they were unreachable until the reader clicked a tile, and
// clicking a tile is itself the pick. The only instrument that can tell those
// two states apart is one that presses a key without clicking first.
//
// SO THIS WALK NEVER CALLS .focus() ITSELF. Doing so would place focus exactly
// where the defect prevents it from going, and the walk would pass against the
// broken build — which is the whole failure mode it exists to catch.
//
// Plant to prove it still works: remove the focusQuickCursor(false) call from
// openQuickLook's tile loop, rebuild, and check 1 fails.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const BASE = "http://127.0.0.1:8131";
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const SET_A = ["canopy.dng", "hillside.dng", "lodge.dng", "NIR_1830.dng"].map((f) => `${DIR}/${f}`);
const SET_B = ["NIR_1873.dng", "NIR_1877.dng"].map((f) => `${DIR}/${f}`);

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

/** The mark on one cell, read the way a reader reads it: the word on the badge,
 *  and what the tile tells an assistive technology. Never the class. */
const cellMark = (page, i) =>
  page.evaluate((n) => {
    const cell = document.querySelectorAll("#qlGrid .ql-cell")[n];
    if (!cell) return "no such cell";
    const badge = cell.querySelector(".ql-badge");
    const tile = cell.querySelector(".ql-tile");
    const word = badge && !badge.hidden ? badge.textContent : "";
    return `${word || "none"}/${tile?.getAttribute("aria-pressed") ?? "?"}`;
  }, i);

async function openFolder(page, files) {
  await page.setInputFiles("#quickFiles", files);
  // POLL THE HEADER TEXT, which is synchronous DOM state. waitForFunction does
  // not await a Promise predicate — a Promise object is truthy, so a poll
  // written that way "passes" instantly (CLAUDE.md, Verify before claiming).
  await page.waitForFunction(
    (n) => {
      const c = document.getElementById("qlCount");
      return !!c && !document.getElementById("qlGrid")?.dataset.busy && document.querySelectorAll("#qlGrid .ql-cell").length === n;
    },
    files.length,
    { timeout: 240000 },
  );
}

const b = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await b.newPage({ viewport: { width: 1280, height: 950 } });
  page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
  await page.goto(`${BASE}/ir.html`);
  await page.waitForSelector("#quickFiles", { state: "attached" });

  await openFolder(page, SET_A);

  // 1 — THE WHOLE POINT. No click has happened; the reader has pressed one key.
  await page.keyboard.press("p");
  check("1 P marks the first photo with no click first", await cellMark(page, 0), "Pick/true");

  // 2 — the cursor moves, and X marks where it lands.
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("x");
  check("2 ArrowRight then X marks the second photo", await cellMark(page, 1), "Reject/false");

  // 3 — U takes it off again. ASSERTED AS A TRANSITION, not as an end state:
  //     "no mark" is also what a build where the keys never arrive produces, so
  //     an end-state check here passes for the wrong reason on a broken build.
  const before3 = await cellMark(page, 1);
  await page.keyboard.press("u");
  check("3 U clears the mark", `${before3} -> ${await cellMark(page, 1)}`, "Reject/false -> none/false");

  // 4 — focus comes back out of Compare. Opened by its BUTTON, which is the
  //     route that strands focus outside the grid; the C key already leaves
  //     focus on the tile it was pressed from.
  await page.click("#qlCompare");
  await page.waitForSelector("#qlCompareDlg[open]");
  await page.click("#cmpClose");
  await page.waitForFunction(() => !document.getElementById("qlCompareDlg")?.hasAttribute("open"));
  // A DIALOG'S `open` ATTRIBUTE IS GONE ONE TASK BEFORE ITS `close` EVENT FIRES.
  // close() removes the attribute and restores the focus synchronously, then
  // QUEUES the event — so a harness that polls for the attribute and acts at
  // once is measuring the moment before every close handler has run, and this
  // check failed against a correct build for exactly that reason. Yielding one
  // frame and one task is the boundary itself, not a guess at a duration.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0))));
  await page.keyboard.press("p");
  check("4 P still marks after Compare was opened and closed", await cellMark(page, 1), "Pick/true");

  // 5 — a second folder in one sitting. End leaves the cursor at the far end of
  //     the first folder; the next folder is shorter, and the keys must still
  //     land on its first photo.
  await page.keyboard.press("End");
  await page.click("#qlClose");
  await page.waitForFunction(() => !document.getElementById("quickLook")?.hasAttribute("open"));
  await openFolder(page, SET_B);
  await page.keyboard.press("p");
  check("5 P marks the first photo of a second folder", await cellMark(page, 0), "Pick/true");
} finally {
  await b.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
