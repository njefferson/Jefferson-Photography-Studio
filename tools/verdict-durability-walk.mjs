#!/usr/bin/env node
// A VERDICT PRESSED AT THE INSTANT THE PAGE RELOADS.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/verdict-durability-walk.mjs [--port=8131]
//
// NOT in .branch-guard's `also=`: it decodes RAW files in a real browser.
//
// WHAT IT LOOKS FOR, and why the other verdict walk could not. `Session.setMark`
// opens a database, reads a row and puts it back under strict durability. A
// keypress is one event. Reload between them and the mark is gone — always the
// LAST one pressed, because the ones before it had time to land. The existing
// scratchpad walk hit this by accident: its check 10 reloads right after the
// final press, failed intermittently for weeks, and was written off as flaky.
// It was not flaky. It was the product, and the intermittency was how close the
// race ran.
//
// IT IS NOT A CONTRIVED SEQUENCE ON THE TARGET DEVICE. iPadOS discards
// background tabs and reloads them by itself, so "the page came back a moment
// after I pressed X" is what a long culling session looks like.
//
// IT KILLS THE PAGE RATHER THAN RELOADING IT, and that correction is the
// instrument lesson here. The first version issued the press and location
// .reload() from inside the page in one task, which sounds tight and is not:
// reload only QUEUES a navigation, the document keeps running, and the write
// commits before unload. Against a build with the synchronous mirror REMOVED it
// passed all four checks — a negative control coming back green, which means
// the walk was measuring nothing.
//
// Closing the page destroys the renderer with the write in flight, which is
// what a discarded tab actually does, and is the only version of this that
// fails against the defect. The context stays open so the storage does.
//
// Plant to prove it still works: remove the notePending(id, mark) call from the
// top of setMark in src/session.ts, rebuild, and checks 3 and 4 fail.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const FOUR = ["NIR_0063.dng", "NIR_0102.dng", "NIR_0152.dng", "NIR_0172.dng"].map((f) => `${DIR}/${f}`);

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};

/** The verdict on each tile, read the way a reader reads it: the word on the
 *  badge. Never the class, and never the store. */
const marks = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#sessionThumbs .session-thumb")]
      .map((b) => b.querySelector(".session-thumb-mark")?.textContent?.trim() || "-")
      .join(","),
  );

const settled = (page, n) =>
  page.waitForFunction(
    (n) => {
      const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")];
      return t.length === n && t.every((b) => !b.disabled);
    },
    n,
    { timeout: 300000 },
  );

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  let page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
  await page.goto(`${BASE}/ir.html`);
  await page.waitForSelector("#welcomeFile", { state: "attached" });
  await page.setInputFiles("#welcomeFile", FOUR);
  await settled(page, FOUR.length);
  await page.waitForTimeout(2000);

  // ONE mark with room to land, then move to the next photo. The pair is the
  // point: a build that loses everything and a build that loses only the last
  // press produce different answers, and an assertion that reads just the
  // racing photo cannot tell them apart.
  await page.click("#sessionThumbs .session-thumb:nth-child(2)");
  await page.waitForTimeout(1500);
  await page.click("#sessionPick");
  await page.waitForTimeout(1500);
  await page.click("#sessionThumbs .session-thumb:nth-child(3)");
  await page.waitForTimeout(1500);
  check("1 one verdict has landed, and the next photo is open", await marks(page), "-,Pick,-,-");

  // THE PRESS, THEN THE TAB GOES. Not awaited — awaiting the evaluate is
  // already more time than the defect needs.
  void page.evaluate(() => document.getElementById("sessionReject").click()).catch(() => {});
  await page.close({ runBeforeUnload: false });

  page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
  await page.goto(`${BASE}/ir.html`);
  await page.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
  await page.click("#resumeSession");
  await settled(page, FOUR.length);
  await page.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await page.waitForTimeout(1500);

  const after = await marks(page);
  check("2 the verdicts that had time to land are still there", after.split(",")[1], "Pick");
  check("3 and so is the one pressed as the page went away", after, "-,Pick,Reject,-");

  // U is a decision too: clearing a verdict and reloading at once must not put
  // the old one back. Asserted as a TRANSITION, because "no mark" is also what
  // a build that lost the clear produces on a photo that never had one.
  await page.click("#sessionThumbs .session-thumb:nth-child(2)");
  await page.waitForTimeout(1500);
  const before4 = await marks(page);
  void page.evaluate(() => document.getElementById("sessionPick").click()).catch(() => {}); // same verdict again = clear
  await page.close({ runBeforeUnload: false });
  page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
  await page.goto(`${BASE}/ir.html`);
  await page.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
  await page.click("#resumeSession");
  await settled(page, FOUR.length);
  await page.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await page.waitForTimeout(1500);
  check("4 clearing a verdict survives the same race", `${before4} -> ${await marks(page)}`, "-,Pick,Reject,- -> -,-,Reject,-");

  // 5 AND 6 — AN EDIT ON THE OPEN PHOTO, WITHOUT LEAVING IT (decision 077).
  // The durable copy used to be written only on a switch, Home or a LUT, so a
  // slider moved on the photo that is open was in memory and nowhere else.
  // 5 kills the tab after the edit has settled and a second has passed, with no
  // event of any kind, which is what a discarded tab is; 6 hides the page and
  // closes it 300 ms later, before any timer could have written it, so only
  // the hidden handler can have saved it.
  const resume = async () => {
    page = await ctx.newPage();
    page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
    await page.goto(`${BASE}/ir.html`);
    await page.waitForSelector("#resumeSession:not([hidden])", { timeout: 120000 });
    await page.click("#resumeSession");
    await settled(page, FOUR.length);
    await page.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
    await page.waitForTimeout(1500);
  };
  const setExpo = (v) => page.evaluate((v) => {
    const el = document.getElementById("expo");
    el.value = String(v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  }, v);
  const expoOn = async (n) => {
    await page.click(`#sessionThumbs .session-thumb:nth-child(${n})`);
    await page.waitForTimeout(1500);
    return page.evaluate(() => Number(document.getElementById("expo").value));
  };
  await page.click("#sessionThumbs .session-thumb:nth-child(3)");
  await page.waitForTimeout(1500);
  const expo5 = await page.evaluate(() => { const el = document.getElementById("expo"); return Math.round((Number(el.min) + (Number(el.max) - Number(el.min)) * 0.8) / Number(el.step || 0.01)) * Number(el.step || 0.01); });
  await setExpo(expo5);
  // WAIT FOR THE DRAWN FRAME, NOT A CLOCK. This container draws in software,
  // and an exposure change on a session holds the page for about 3.4 s from the
  // NEXT frame on. A fixed 2.5 s, and then a check that the page was free, both
  // killed the tab while it was still drawing, before the save's timer could
  // run, and both read as the save failing (measured 2026-09-28 with the save's
  // own log: scheduled at the change, never run before the kill). Two animation
  // frames resolve only after the frame that draws the change has finished;
  // the save's second, with room, follows.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(1500);
  await page.close({ runBeforeUnload: false });
  await resume();
  const got5 = await expoOn(3);
  check(`5 an exposure moved on the open photo survives the tab being killed once it has settled\n        set ${expo5}, read back ${got5}`, Math.abs(got5 - expo5) < 1e-6, true);

  await page.click("#sessionThumbs .session-thumb:nth-child(4)");
  await page.waitForTimeout(1500);
  const expo6 = await page.evaluate(() => { const el = document.getElementById("expo"); return Math.round((Number(el.min) + (Number(el.max) - Number(el.min)) * 0.25) / Number(el.step || 0.01)) * Number(el.step || 0.01); });
  await setExpo(expo6);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { get: () => "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // The hide's own save cancels the pending one-second save, so from here
  // nothing but the hide can have written this edit. The page is only told it
  // is hidden, so unlike a hidden page on the device it goes on drawing the
  // change in software for seconds; the kill waits for that frame, or it lands
  // before the write can commit and measures the container (2026-09-28).
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(300);
  await page.close({ runBeforeUnload: false });
  await resume();
  const got6 = await expoOn(4);
  check(`6 and one moved just before the page was hidden is written by the hide itself\n        set ${expo6}, read back ${got6}`, Math.abs(got6 - expo6) < 1e-6, true);

  await ctx.close();
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
