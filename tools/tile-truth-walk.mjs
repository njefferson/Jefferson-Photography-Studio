#!/usr/bin/env node
// A TILE IS A CLAIM, AND FOUR THINGS COULD MAKE IT FALSE.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/tile-truth-walk.mjs [--port=8131]
//
// NOT in .branch-guard's `also=`: it drives a real browser against a real build
// and decodes RAW files, which is minutes, not milliseconds. Run it before any
// release that touches makeThumb, the preview store, the stamps, or the lift.
//
// IT LIVES IN THE REPO RATHER THAN THE SCRATCHPAD ON PURPOSE, for the reason
// class-width-walk.mjs gives in its own header: it is the only instrument that
// can answer its question, and a scratchpad copy is gone with the container.
//
// WHAT IT LOOKS FOR, and why reading the source cannot. Every one of these is a
// picture that is WRONG rather than code that is wrong — the functions all do
// what they say, and what they say is only true under conditions no single file
// states. The only way to tell a cache hit from a fresh render, or a redrawn
// tile from an untouched one, is to render both and measure.
//
//   A  A KEPT PREVIEW COMES BACK UNDER THE GRADE IT WAS MADE UNDER.
//      previewKey had the file, the pipeline, the size and the lens profiles in
//      it, under a header claiming the list was complete. Scan a folder under
//      Aerochrome, press B&W IR, scan it again: every tile came back
//      Aerochrome.
//   B  OPENING A PHOTOGRAPH FLATTENED ITS TILE. makeThumb cleared tone/sky/
//      foliage unconditionally and re-solved them only for a photo with no own
//      edit — so a photo that HAD been opened, and carried its own solved
//      curve, had it thrown away and never put back.
//   C  RESTORE DEPTH NEVER REDREW THE STRIP. Its strength slider called
//      restripForGrade; the on/off toggle beside it did not.
//   D  THE OPEN PHOTO'S OWN TILE WAS THE ONE A LOOK COULD NOT REACH. ownEdit
//      answered with the liveEdits snapshot, which is seeded on ARRIVAL and
//      rewritten only on the way out — so for the photo actually open it was
//      the state the reader came in on, its stamp never moved, and nothing ever
//      marked the tile stale.
//
// WHAT IT MEASURES, AND WHY TWICE. Every tile is read two ways: a hash of the
// JPEG BYTES, which answers "is this the same stored picture", and a 32x32 RGB
// signature, which answers "is this the same photograph" when the encoder is
// not byte-deterministic. It also reads the blob URL itself, because that is
// the only way to tell a tile that was REDRAWN to the same picture from one
// that was never touched — and C is as much about not redrawing forty tiles
// that cannot have changed as it is about redrawing the ones that did.
//
// PLANTS, each of which made this walk print the failure before the fix landed:
//   A  drop `gradeStampAt` from the getPreview/putPreview calls in main.ts.
//      A5 then reads back the app's own "3 of 3 came back from this device".
//   B  put `tone: [...TONE_DEFAULT]` back, unconditional, in makeThumb.  23.53
//   C  delete the restripForGrade() call from the irLift handler.
//   D  delete the `view.id === activePhotoId` line from ownEdit.
//
// MEASURED, both builds, 2026-09-14: eight of these go red against the tree as
// it was before this release and all of them are green after it. Three checks
// pass on BOTH builds on purpose — A1, A2/A3 (the store works at all) and D2/D3
// (a look reaches an unopened photo and leaves a graded one alone). They are
// the controls: without them a build that simply never caches, or never
// redraws, would read as a clean sheet.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const DIR = "/home/user/Jefferson-Photography-Studio/public/examples";
const F = (...n) => n.map((x) => `${DIR}/${x}`);

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}\n        got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`);
};
const note = (s) => console.log(`        ${s}`);

/** Read every tile matching `sel` three ways: the blob URL (was it redrawn),
 *  a hash of the stored JPEG bytes (is it the same stored picture), and a
 *  32x32 RGB signature (is it the same photograph). */
const readTiles = (page, sel) =>
  page.evaluate(async (sel) => {
    const out = [];
    for (const img of document.querySelectorAll(sel)) {
      const src = img.getAttribute("src") || "";
      const row = { src, alt: img.alt || "", hash: "", sig: null, err: null };
      if (src.startsWith("blob:")) {
        try {
          const buf = await (await fetch(src)).arrayBuffer();
          const u8 = new Uint8Array(buf);
          let h = 2166136261;
          for (let i = 0; i < u8.length; i++) { h ^= u8[i]; h = Math.imul(h, 16777619); }
          row.hash = (h >>> 0).toString(36) + "." + u8.length.toString(36);
          const bm = await createImageBitmap(new Blob([buf]));
          const cv = document.createElement("canvas");
          cv.width = 32; cv.height = 32;
          const cx = cv.getContext("2d", { willReadFrequently: true });
          cx.drawImage(bm, 0, 0, 32, 32);
          const d = cx.getImageData(0, 0, 32, 32).data;
          const sig = [];
          for (let i = 0; i < d.length; i += 4) sig.push(d[i], d[i + 1], d[i + 2]);
          row.sig = sig;
          bm.close();
        } catch (e) { row.err = String(e); }
      }
      out.push(row);
    }
    return out;
  }, sel);

/** Mean absolute difference per channel, 0-255. The honest unit: it is what a
 *  reader would call "the same picture" or "a different one". */
const mad = (a, b) => {
  if (!a || !b || a.length !== b.length) return NaN;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return +(s / a.length).toFixed(2);
};

/** Wait until nothing in `sel` has changed its src for `quiet` ms. Polls
 *  SYNCHRONOUS DOM state, never a Promise predicate (CLAUDE.md). The app's
 *  regrade is debounced 900ms, so `quiet` has to clear that with room for the
 *  render that follows it. */
async function settle(page, sel, { quiet = 2200, max = 300000, lead = 1200 } = {}) {
  await page.waitForTimeout(lead);
  const t0 = Date.now();
  let last = null, since = Date.now();
  while (Date.now() - t0 < max) {
    const now = await page.evaluate(
      (s) => [...document.querySelectorAll(s)].map((i) => i.getAttribute("src") || "").join("|"),
      sel,
    );
    if (now !== last) { last = now; since = Date.now(); }
    else if (Date.now() - since >= quiet) return;
    await page.waitForTimeout(250);
  }
  console.log(`        (settle timed out after ${max}ms on ${sel})`);
}

async function freshPage(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 950 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.log(`FAIL  page error: ${e.message}`); failed++; });
  await page.goto(`${BASE}/ir.html`);
  await page.waitForSelector("#quickFiles", { state: "attached" });
  // Start from nothing kept, so round one is a real render and round two is a
  // real question about the store rather than about what was left behind.
  await page.evaluate(
    () =>
      new Promise((r) => {
        let n = 0;
        const done = () => { if (++n === 2) r(); };
        for (const db of ["ips-previews", "ips-session"]) {
          const rq = indexedDB.deleteDatabase(db);
          rq.onsuccess = rq.onerror = rq.onblocked = done;
        }
      }),
  );
  return { ctx, page };
}

/** Open a set through the app's own front door and wait for every tile to be a
 *  real render rather than the camera's embedded preview. */
async function openSession(page, files) {
  await page.setInputFiles("#welcomeFile", files);
  await page.waitForFunction(
    (n) => document.querySelectorAll("#sessionThumbs .session-thumb").length === n,
    files.length,
    { timeout: 300000 },
  );
  await page.waitForFunction(
    (n) => {
      const tiles = [...document.querySelectorAll("#sessionThumbs .session-thumb")];
      return (
        tiles.length === n &&
        tiles.every((t) => !t.classList.contains("provisional") && !t.classList.contains("saving") && t.querySelector("img"))
      );
    },
    files.length,
    { timeout: 600000 },
  );
  await settle(page, "#sessionThumbs .session-thumb img");
}

/** Wait for a grid of `n` finished tiles. THE CELL COUNT IS NOT ENOUGH: a cell
 *  exists before its picture does, and reading then gives tiles with no src at
 *  all — which came back as NaN differences and one accidental hash match, a
 *  result that looked like a finding and was the instrument. */
async function gridReady(page, n) {
  await page.waitForFunction(
    (n) => {
      const c = document.getElementById("qlCount");
      if (!c || /Decoding/.test(c.textContent || "")) return false;
      const imgs = [...document.querySelectorAll("#qlGrid .ql-tile img")];
      return imgs.length === n && imgs.every((i) => (i.getAttribute("src") || "").startsWith("blob:"));
    },
    n,
    { timeout: 600000 },
  );
  await settle(page, "#qlGrid .ql-tile img", { lead: 400, quiet: 800 });
}

async function quickScan(page, files) {
  await page.setInputFiles("#quickFiles", files);
  await gridReady(page, files.length);
}

const pressLook = async (page, id) => {
  await page.click("#ptab-ir");
  await page.click(`#${id}`);
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  // ── A ────────────────────────────────────────────────────────────────────
  // A kept preview must be a picture of the grade it comes back under.
  //
  // THE APP'S OWN SENTENCE IS THE INSTRUMENT. After every scan it tells the
  // reader "N of M came back from this device — no decoding needed", and that
  // line is the whole defect in one reading: scan a folder under a second look
  // and a build with this wrong says three of three came back, which is a claim
  // that three pictures of Aerochrome are pictures of B&W IR.
  {
    console.log("\nA — a kept preview comes back under the grade it was made under");
    const set = F("NIR_0063.dng", "NIR_0102.dng", "NIR_0152.dng");
    const note_ = (page) => page.evaluate(() => (document.getElementById("qlReuseNote")?.textContent || "").trim());
    const closeGrid = async (page) => {
      await page.click("#qlClose");
      await page.waitForFunction(() => !document.getElementById("quickLook")?.hasAttribute("open"));
    };
    // A look needs a frame to be applied to. It is not part of the scan and
    // never enters the grid.
    const armed = async (page, look) => {
      await page.setInputFiles("#welcomeFile", F("NIR_0172.dng"));
      await page.waitForSelector("#ptab-ir", { state: "visible", timeout: 300000 });
      await pressLook(page, look);
    };

    const one = await freshPage(browser);
    const two = await freshPage(browser);
    try {
      await armed(one.page, "lookAero");
      await quickScan(one.page, set);
      const aero = await readTiles(one.page, "#qlGrid .ql-tile img");
      const firstNote = await note_(one.page);
      await closeGrid(one.page);

      // The same folder, the same look: this is what the store is FOR, and if
      // it does not come back here the rest of the section measures nothing.
      await quickScan(one.page, set);
      const again = await readTiles(one.page, "#qlGrid .ql-tile img");
      const sameLookNote = await note_(one.page);
      await closeGrid(one.page);

      check("A1 nothing was kept before the first scan", firstNote, "");
      check("A2 the same folder under the same look comes back", sameLookNote, "3 of 3 came back from this device — no decoding needed.");
      check("A3 and comes back as the same pictures", again.filter((t, i) => t.hash === aero[i].hash).length, 3);

      // Now a different look over the same three files.
      await pressLook(one.page, "lookMono");
      await quickScan(one.page, set);
      const mono = await readTiles(one.page, "#qlGrid .ql-tile img");
      const otherLookNote = await note_(one.page);

      // GROUND TRUTH, from a device that has never seen these files: whatever a
      // scan under this look renders from nothing is what a scan under this
      // look must produce.
      await armed(two.page, "lookMono");
      await quickScan(two.page, set);
      const fresh = await readTiles(two.page, "#qlGrid .ql-tile img");

      check("A4 the tiles were readable in every round", [aero, again, mono, fresh].map((r) => r.filter((t) => t.sig).length).join("/"), "3/3/3/3");
      // THE DEFECT IN THE APP'S OWN WORDS.
      check("A5 nothing comes back for a look it was never scanned under", otherLookNote, "");
      for (let i = 0; i < mono.length; i++) {
        note(`${fresh[i].alt || i}: vs a first-ever scan under this look ${mad(mono[i].sig, fresh[i].sig)}, vs the look it was first scanned under ${mad(mono[i].sig, aero[i].sig)}`);
      }
      check("A6 the second look renders the second look", mono.filter((t, i) => mad(t.sig, fresh[i].sig) < 3).length, 3);
      check("A7 and not the first one", mono.filter((t, i) => mad(t.sig, aero[i].sig) < 3).length, 0);
    } finally {
      await one.ctx.close();
      await two.ctx.close();
    }
  }

  // ── B ────────────────────────────────────────────────────────────────────
  // Whether a photograph has been OPENED must not change its tile.
  //
  // Two sessions rather than a before-and-after in one, because in one session
  // there is nothing to compare against: opening a photo does not change its
  // stamp (the first visit lands on the same creative state the tile already
  // showed, which is deliberate), so the tile is not redrawn and the defect
  // stays latent until something else forces a render. A first attempt here
  // used a no-op restripe as the trigger and measured 0.00 on a build with the
  // defect in it — a check that cannot fail is not a check.
  {
    console.log("\nB — whether a photo has been opened must not change its tile");
    const set = F("NIR_0063.dng", "NIR_0102.dng", "NIR_0152.dng", "NIR_0172.dng");
    const sel = "#sessionThumbs .session-thumb img";
    const tileTwo = async (openIt) => {
      const { ctx, page } = await freshPage(browser);
      try {
        await openSession(page, set);
        if (openIt) {
          await page.click("#sessionThumbs .session-thumb:nth-child(2)");
          await page.waitForTimeout(2500);
        }
        // The same look either way, pressed on whichever photo is open. It is
        // what forces every tile to be rendered again, which is the only
        // moment the two builds can differ.
        await pressLook(page, "lookAero");
        await settle(page, sel);
        const tiles = await readTiles(page, sel);
        return tiles[1];
      } finally {
        await ctx.close();
      }
    };
    const untouched = await tileTwo(false);
    const opened = await tileTwo(true);
    check("B1 both sessions rendered the tile", !!(untouched.sig && opened.sig), true);
    const d = mad(untouched.sig, opened.sig);
    note(`${untouched.alt}: never opened vs opened first, same look, ${d}`);
    // THE THRESHOLD IS A MEASUREMENT, NOT A TASTE. On the build before this the
    // same two tiles measured 23.53 apart — the lift leaving the tile the
    // moment the photo was tapped, because makeThumb cleared the curve it had
    // already solved. With the curve kept they measure 2.08, which is the JPEG
    // encoder and the 32px resample. 3 sits between those two numbers with an
    // order of magnitude of room.
    check("B2 the same picture either way", d < 3, true);
  }

  // ── C and D ──────────────────────────────────────────────────────────────
  // Restore depth redraws the tiles it changes and only those; and a look
  // reaches the tile of the photograph you are looking at.
  {
    console.log("\nC, D — the toggle, and a look on the photo you are looking at");
    const { ctx, page } = await freshPage(browser);
    try {
      const set = F("NIR_0063.dng", "NIR_0102.dng", "NIR_0152.dng", "NIR_0172.dng", "NIR_0627.dng", "NIR_1638.dng");
      await openSession(page, set);
      const sel = "#sessionThumbs .session-thumb img";
      // Open 1, 2 and 3 (the first opens itself), and leave 4, 5 and 6 alone.
      for (const n of [2, 3]) {
        await page.click(`#sessionThumbs .session-thumb:nth-child(${n})`);
        await page.waitForTimeout(2500);
      }
      await settle(page, sel);

      // D — a look. It changes the OPEN photo and the future of every photo not
      // yet opened; photos 1 and 2 were graded and left, and a look pressed
      // here is not about them, so their tiles must not move.
      const preLook = await readTiles(page, sel);
      await pressLook(page, "lookAero");
      await settle(page, sel);
      const postLook = await readTiles(page, sel);
      const byLook = preLook.map((t, i) => mad(t.sig, postLook[i].sig));
      byLook.forEach((m, i) =>
        note(`${preLook[i].alt || i}: ${m} after the look` + (i === 2 ? "  <- open" : i < 2 ? "  <- opened and left" : "  <- never opened")),
      );
      check("D1 the open photo's own tile follows the look", byLook[2] > 5, true);
      check("D2 and so does every photo not yet opened", byLook.slice(3).filter((m) => m > 5).length, 3);
      check("D3 and the two graded and left do not", byLook.slice(0, 2).filter((m) => m > 5).length, 0);

      // C — the toggle.
      const before = await readTiles(page, sel);
      await page.click("#irLift");
      await settle(page, sel);
      const after = await readTiles(page, sel);
      const picture = before.map((t, i) => mad(t.sig, after[i].sig));
      const redrawn = before.map((t, i) => t.src !== after[i].src);
      before.forEach((t, i) =>
        note(
          `${t.alt || i}: picture moved ${picture[i]}, ${redrawn[i] ? "redrawn" : "untouched"}` +
            (i === 2 ? "  <- open" : i < 2 ? "  <- opened and left" : "  <- never opened"),
        ),
      );
      // THE TOGGLE REACHES EVERY UNOPENED TILE, and moves the ones it has
      // something to put back on. Restore depth is a TOP-UP since 2026-09-18:
      // it starts from the look's own amounts and adds only where a frame
      // measures short, so a frame that already measures where it should be is
      // untouched by design — NIR_1638 under Pink IR redraws and moves 0. The
      // old check counted three moved pictures and read that as the toggle not
      // reaching the tile; the redraw is what says it reached, the movement
      // says it had something to do there.
      check("C1 the three unopened tiles are redrawn for the toggle", redrawn.slice(3).filter(Boolean).length, 3);
      check("C1b ...and the ones the lift had something to put back on move", picture.slice(3).filter((m) => m > 3).length >= 1, true);
      check("C2 so does the open photo's, whose curve was just taken away", picture[2] > 3, true);
      // COUNTED, not "are these two untouched". Zero redraws passes that on a
      // build where the toggle redraws nothing at all, which is the defect.
      // Four is the only number that is both fixes at once: everything that
      // changed was redrawn, and nothing that could not change was.
      check("C3 exactly four tiles were redrawn", redrawn.filter(Boolean).length, 4);

      // ── E ────────────────────────────────────────────────────────────────
      // THE REDRAW WAITS FOR THE READER. A look marks every other tile stale,
      // and the pass then decoded the neighbours on every lane but one
      // beginning a second after the press — beside the reader, who was still
      // working on the open photograph. On a set of 128 that is minutes of the
      // machine being busy for tiles nobody is looking at yet. So: press a
      // look, then keep a slider moving, and no tile may be redrawn while the
      // hand is still going; stop, and they must all arrive.
      //
      // MEASURED AS SRC CHANGES, not as decode counts: a redrawn tile is a new
      // blob, which is the same thing the checks above read, and it needs no
      // hook into the app.
      console.log("\nE — the tile redraw waits for the reader to stop");
      const eBefore = await readTiles(page, sel);
      await pressLook(page, "lookEir");
      // FOUR SECONDS OF A MOVING SLIDER, chosen from both builds' behaviour:
      // the build before this marks the tiles stale 0.9s after the press and
      // its first redrawn tile lands about two seconds in, so a window shorter
      // than that would pass on the defect. Each move is ~160ms apart, well
      // inside the app's 1.5s idle window, so a build that yields never starts.
      const busyUntil = Date.now() + 4000;
      let moves = 0;
      while (Date.now() < busyUntil) {
        await page.evaluate((v) => { const el = document.getElementById("sat"); if (el) { el.value = String(v); el.dispatchEvent(new Event("input", { bubbles: true })); } }, 1 + (moves % 5) * 0.02);
        moves++;
        await page.waitForTimeout(160);
      }
      const eBusy = await readTiles(page, sel);
      const movedWhileBusy = eBefore.filter((t, i) => t.src !== eBusy[i].src).length;
      note(`${moves} slider moves over 4s; tiles redrawn in that window: ${movedWhileBusy}`);
      check("E1 no tile is redrawn while the reader's hand is still moving", movedWhileBusy, 0);
      await settle(page, sel, { quiet: 2500, lead: 5000 });
      const eIdle = await readTiles(page, sel);
      const movedAfter = eBefore.filter((t, i) => t.src !== eIdle[i].src).length;
      note(`tiles redrawn once the hand stopped: ${movedAfter} of ${eBefore.length}`);
      check("E2 ...and they are redrawn once it stops", movedAfter >= 3, true);
    } finally {
      await ctx.close();
    }
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
