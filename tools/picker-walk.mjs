#!/usr/bin/env node
// EVERY WAY INTO THE FILE PICKER STILL WORKS, AND A WEDGED ONE RECOVERS.
//
// Reported on an installed iPad: batch process, the Files picker, Search, a
// letter typed — and the picker closed by itself. After that NO file could be
// opened from any entry point until the app was force-quit. On iOS a document
// picker dismissed that way can leave WebKit believing one is still presented
// for the element it was opened from, and every later click on that element is
// ignored in silence.
//
// The app answers it by never reusing an input: the element is replaced with a
// fresh clone immediately before the picker opens, for the five driven in code
// and — through a capturing pointerdown — for the five inside a <label>.
//
// WHAT THIS CAN AND CANNOT PROVE, said plainly because it matters here. It
// proves every path still opens a picker and still delivers its files, and that
// an element deliberately wedged is not the element the next attempt uses. It
// CANNOT prove the stuck picker clears on the device: this is Chromium, and the
// bug is WebKit's, in standalone mode. That is what the report's picker counter
// is for.
import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const EX = new URL("./fixtures/", import.meta.url).pathname;
let failed = 0;
const check = (name, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"}  ${name}`);
  console.log(`        got ${JSON.stringify(got)} want ${JSON.stringify(want)}`);
};

// Every file input in the page, and how it is reached: a label the reader taps,
// or a button that opens it in code. Both kinds have to end up fresh.
const PATHS = [
  { id: "file",              via: "label" },
  { id: "welcomeFile",       via: "label" },
  { id: "welcomeQuickFiles", via: "label" },
  { id: "stickerImport",     via: "label" },
  { id: "quickFiles",        via: "button", btn: "barQuickBtn" },
  { id: "batchFiles",        via: "button", btn: null },
  { id: "lookFile",          via: "button", btn: "lookImportBtn" },
  { id: "lutFile",           via: "button", btn: "lutImportBtn" },
];

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const p = await b.newPage({ viewport: { width: 1280, height: 950 } });
  p.on("dialog", (d) => d.accept());
  // ANSWER THE PICKER, OR THE WALK HANGS ON IT. Clicking a file input really
  // does open a chooser here, and Playwright holds the click until something
  // responds — the first run of this walk sat for two minutes with no output
  // and had to be killed. Cancelling (no files) is also the closest thing to
  // the reported failure: a picker that comes back empty.
  let chooserCount = 0;
  p.on("filechooser", (fc) => { chooserCount++; void fc.setFiles([]).catch(() => {}); });
  // A DEAD MODULE IS ONE DEFECT, NOT ELEVEN. The first green-field run of this
  // walk failed every check at once — including opening a photo — because a
  // `const` was read before its declaration and the whole bundle threw at boot.
  // Eleven failures with no cause in any of them is a worse report than one
  // line saying the page did not start, so the page's own errors come first.
  const pageErrors = [];
  p.on("pageerror", (e) => pageErrors.push(e.message.slice(0, 200)));
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForTimeout(900);

  // ── 1 ──────────────────────────────────────────────────────────────────
  // Every declared input is present and registered. A path that silently
  // stopped existing would otherwise make check 2 pass by not running.
  console.log("\n0 — the app started");
  check("0 no error was thrown while the page loaded", pageErrors, []);
  if (pageErrors.length) {
    console.log("        everything below measures a page that did not start; fix this first");
  }

  console.log("\n1 — every file input the app declares is still there");
  const present = await p.evaluate((ids) => ids.filter((i) => !document.getElementById(i)), PATHS.map((x) => x.id));
  check("1 no declared input is missing", present, []);

  // ── 2 ──────────────────────────────────────────────────────────────────
  // THE ELEMENT IS NEVER THE SAME ONE TWICE. Stamp each input, drive its own
  // route, and read the stamp back: a surviving stamp means the element was
  // reused, which is the state that wedges.
  console.log("\n2 — opening a picker replaces the element rather than reusing it");
  for (const path of PATHS) {
    const same = await p.evaluate(async ({ id, via, btn }) => {
      const before = document.getElementById(id);
      if (!before) return "absent";
      // A JS PROPERTY, NOT A data- ATTRIBUTE. `cloneNode` copies attributes, so
      // a data-stamp rides onto the fresh element and every check reads REUSED
      // whatever the app does — which is exactly what the first run of this
      // walk reported, eight times, about code that was working. An expando is
      // not cloned, so it distinguishes the two elements the way this needs.
      before.__walkStamp = "old";
      if (via === "label") {
        const label = before.closest("label");
        if (!label) return "no label";
        // The capturing pointerdown is what swaps a label-wrapped input, and it
        // is dispatched on the label exactly as a finger would.
        label.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      } else if (btn) {
        document.getElementById(btn)?.click();
      } else {
        // Batch has no single button: it is opened from inside its own dialog.
        document.getElementById("welcomeBatchBtn")?.click();
        await new Promise((r) => setTimeout(r, 200));
        document.getElementById("bcAuto")?.click();
      }
      await new Promise((r) => setTimeout(r, 250));
      const after = document.getElementById(id);
      document.querySelector("dialog[open]")?.close();
      return after?.__walkStamp === "old" ? "REUSED" : "replaced";
    }, path);
    check(`2 ${path.id} (${path.via})`, same, "replaced");
    await p.waitForTimeout(150);
  }

  // ── 3 ──────────────────────────────────────────────────────────────────
  // A WEDGED ELEMENT IS NOT THE ONE THE NEXT ATTEMPT USES. This is the defect
  // itself, planted: an input whose click does nothing, exactly as iOS leaves
  // one. The app must not be holding that element when the reader tries again.
  console.log("\n3 — an element that has stopped responding is not reused");
  const recovered = await p.evaluate(async () => {
    const el = document.getElementById("quickFiles");
    let clicks = 0;
    el.click = () => { clicks++; };       // wedged: accepts the call, does nothing
    el.__walkStamp = "wedged";
    document.getElementById("barQuickBtn").click();   // first press, on the wedged one
    await new Promise((r) => setTimeout(r, 200));
    const after = document.getElementById("quickFiles");
    return { stillWedged: after?.__walkStamp === "wedged", deadClicks: clicks };
  });
  check("3 the wedged element is gone after one press", recovered.stillWedged, false);

  // ── 4 ──────────────────────────────────────────────────────────────────
  // AND THE FILES STILL ARRIVE. Replacing elements is worthless if the new one
  // no longer delivers what was picked — which is the way this change could
  // break the app while every check above stayed green.
  console.log("\n4 — a picked file still reaches the app");
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForTimeout(900);
  await p.setInputFiles("#file", EX + "camera-ir-a.jpg");
  const opened = await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 120000 })
    .then(() => true).catch(() => false);
  check("4 the photo opened", opened, true);

  // ── 5 ──────────────────────────────────────────────────────────────────
  console.log("\n5 — the report can say a picker never came back");
  const line = await p.evaluate(async () => {
    document.getElementById("verTag")?.click();
    for (let i = 0; i < 100; i++) {
      const v = document.getElementById("verDlgText")?.value || "";
      if (v && !/Gathering/.test(v)) {
        document.getElementById("verClose")?.click();
        return (v.match(/^File pickers\s{2,}(.+)$/m) || [])[1] ?? "(absent)";
      }
      await new Promise((r) => setTimeout(r, 100));
    }
    return "(timed out)";
  });
  console.log(`        report says: ${line}`);
  check("5 the picker count is in the report", /opened|not opened/.test(line), true);

  // ── 6 ──────────────────────────────────────────────────────────────────
  // ONE WINDOW THAT NEVER CAME BACK MUST NOT KILL EVERY LATER PRESS. Measured
  // on a phone, 2026-09-18: "4 opened, 0 came back". Press one never returned
  // (an un-heard cancel is enough); from press two the app raised its modal
  // offer BEFORE issuing the click, a modal makes the page inert, and every
  // press after that was dead by the app's own hand. So: leave one open
  // outstanding, then press again with a chooser that answers — the chooser
  // must be asked, and once it answers the count must read nothing
  // outstanding and the offer must not be sitting there.
  console.log("\n6 — one window that never came back does not kill the next press");
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForTimeout(900);
  // Press one, answered by NOBODY: the chooser handler is detached for it, so
  // the app hears neither change nor cancel — the un-heard cancel, planted.
  const chooserBefore = chooserCount;
  p.removeAllListeners("filechooser");
  const silent = p.waitForEvent("filechooser", { timeout: 5000 }).then((fc) => fc).catch(() => null);
  await p.click("#barQuickBtn");
  const fc1 = await silent;
  check("6a the first press asked for a chooser", !!fc1, true);
  // Press two: answered. On the old build the offer's modal opens before the
  // click and the chooser is never asked; on the fixed build it is.
  const asked2 = p.waitForEvent("filechooser", { timeout: 4000 }).then(async (fc) => { await fc.setFiles([]); return true; }).catch(() => false);
  await p.click("#barQuickBtn", { force: true });
  const gotChooser2 = await asked2;
  check("6b the second press still opens a chooser", gotChooser2, true);
  await p.waitForTimeout(300);
  const after6 = await p.evaluate(() => ({
    offerUp: !!document.querySelector("#askDlg[open]") && /Files window/.test(document.getElementById("askTitle")?.textContent || ""),
  }));
  check("6c the wedge offer is not up after a window that came back", after6.offerUp, false);
  // Re-arm the answering handler for everything after this.
  p.on("filechooser", (fc) => { chooserCount++; void fc.setFiles([]).catch(() => {}); });
  chooserCount += chooserBefore ? 0 : 0;

  // ── 7 ──────────────────────────────────────────────────────────────────
  // AND A REAL WEDGE STILL RAISES THE OFFER — after the click, not before it.
  // Planted the way iOS leaves it: the click dispatches, a chooser is asked
  // for, and nothing ever comes back (the chooser handler is detached, so
  // Playwright holds every chooser unanswered). NOT a stubbed click that
  // dispatches a synthetic event: Chromium answers an untrusted click on a
  // file input with an immediate `cancel`, which reads as a window that came
  // back — the first version of this check planted that and measured nothing.
  // Three dead presses: the offer is up after the third press and not before
  // (the two PREVIOUS opens are the signature), and the third open was counted
  // — the click was issued — before the offer appeared.
  console.log("\n7 — a picker that is really dead still gets the offer, after the click");
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForTimeout(900);
  p.removeAllListeners("filechooser");
  let deadChoosers = 0;
  p.on("filechooser", () => { deadChoosers++; }); // held, never answered
  const offerAt = [];
  for (let i = 0; i < 3; i++) {
    await p.click("#barQuickBtn", { force: true });
    await p.waitForTimeout(250);
    offerAt.push(await p.evaluate(() => !!document.querySelector("#askDlg[open]")));
  }
  check("7a three dead presses each asked for a chooser", deadChoosers, 3);
  check("7b the offer is up after the third press and not before", offerAt, [false, false, true]);
  const line7 = await p.evaluate(() => (document.getElementById("askBody")?.textContent || "").slice(0, 60));
  console.log(`        offer says: ${line7}…`);
  await p.evaluate(() => document.querySelector("dialog[open]")?.close());
  p.removeAllListeners("filechooser");
  p.on("filechooser", (fc) => { chooserCount++; void fc.setFiles([]).catch(() => {}); });

  // ── 8 ──────────────────────────────────────────────────────────────────
  // A TOUCH THAT BECOMES A SCROLL COUNTS NOTHING. pointerdown on a label with
  // no activation used to count an open that could never return.
  console.log("\n8 — a touch on a label that never activates it counts no open");
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.waitForTimeout(900);
  const scrolled = await p.evaluate(async () => {
    const label = document.getElementById("welcomeQuickFiles")?.closest("label");
    for (let i = 0; i < 3; i++) label?.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 100));
    document.getElementById("verTag")?.click();
    for (let i = 0; i < 100; i++) {
      const v = document.getElementById("verDlgText")?.value || "";
      if (v && !/Gathering/.test(v)) { document.getElementById("verClose")?.click(); return (v.match(/^File pickers\s{2,}(.+)$/m) || [])[1] ?? "(absent)"; }
      await new Promise((r) => setTimeout(r, 100));
    }
    return "(timed out)";
  });
  console.log(`        report says: ${scrolled}`);
  check("8 three scroll-touches on the label count no open", /^not opened/.test(scrolled), true);

  console.log(`\n        ${chooserCount} real file chooser(s) opened during this walk`);
} finally { await b.close(); }
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
