#!/usr/bin/env node
// THE MASK PANEL SAYS WHAT IT CAN DO, AND A MASK CAN BE NAMED AND LEFT.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/mask-panel-walk.mjs [--port=8131] [--plant]
//
// WHY IT EXISTS (decision 040). Three things were reported about the mask
// panel as a SURFACE rather than about what a mask computes, and each of them
// is invisible to every instrument this repo already runs.
//
//   1. Add, subtract and intersect SHIPPED in 2.53 and were asked for again
//      from the device. The control that offers them is on the second mask and
//      later — the first has nothing above it to join — so a reader who has
//      made one mask never learns they exist. Every gate was green while that
//      was true, which is the whole point: a capability that cannot be found
//      is worse than a missing one, because nothing reports it.
//   2. A mask could not be named.
//   3. Nothing said you were finished with one. It stayed selected with its
//      editor open, and moving on meant guessing that tapping elsewhere was
//      allowed rather than being told.
//
// WHAT IS ASSERTED AND WHY EACH. That the panel carries the sentence about
// combining BEFORE any mask exists, because that is the reader who needs it.
// That a name survives an unrelated edit and an undo — a name that vanishes on
// undo is worse than no rename, and `MaskLayer.name` rides inside
// `params.masks`, which `cloneParams` spreads and `applySnapshot` assigns
// wholesale, so this is the check that those two keep doing that. That an empty
// name returns the derived one rather than leaving a blank row. And that
// pressing the selected mask leaves it, with the editor gone and nothing armed.
//
// THE RENAME IS DRIVEN THROUGH THE DIALOG, not by writing the field: the
// control is a button that opens the shared modal, and a walk that set
// `mask.name` directly would pass against a rename button wired to nothing.
//
// AND A SAVED MASK IS A RECIPE, NOT A BITMAP (040's third point). This is the
// check the whole feature turns on, and it cannot be made by asking whether the
// mask came back: a stored bitmap would come back too, and would be the PREVIOUS
// photograph's sky laid over this one. So it saves a Sky mask on one frame,
// opens a DIFFERENT frame, applies it, and asserts the coverage matches the sky
// this frame actually has rather than the one it was saved from. The two frames
// are chosen to have visibly different amounts of sky, because a check between
// two frames that happen to agree would pass on a bitmap.
//
// --plant makes the name check read the row it wrote rather than the row after
// the undo, which is the shape of the defect this exists for. Two checks must
// go red.
import { openMasks, setMaskValue } from "./walk-input.mjs";
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const PLANT = process.argv.includes("--plant");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };
const settle = async (p) => { await p.waitForTimeout(350); await p.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))); };

const rows = (p) => p.evaluate(() => [...document.querySelectorAll("#maskList .mask-row")].map((r) => ({
  label: r.querySelector(".mask-pick")?.textContent ?? "",
  pressed: r.querySelector(".mask-pick")?.getAttribute("aria-pressed") === "true",
  hasRename: !!r.querySelector(".mask-ren"),
})));
const editorOpen = (p) => p.evaluate(() => !document.getElementById("maskEditor")?.hidden);

/** Drive the rename dialog the way a reader does: press the pencil, type, confirm. */
async function rename(p, i, text) {
  await p.locator("#maskList .mask-row").nth(i).locator(".mask-ren").click();
  await p.waitForSelector("#askInput", { state: "visible", timeout: 20000 });
  await p.fill("#askInput", text);
  await p.click("#askOk");
  await settle(p);
}

const b = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  const ctx = await b.newContext({ viewport: { width: 1280, height: 950 } });
  const p = await ctx.newPage();
  p.on("dialog", (d) => d.accept());
  await p.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p.setInputFiles("#file", ["public/examples/NIR_1651.dng"]);
  await p.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p);
  await openMasks(p);
  await settle(p);

  // 1 · THE SENTENCE IS THERE BEFORE ANY MASK IS, which is the reader it is for.
  const note = await p.evaluate(() => {
    const el = document.getElementById("maskCombineNote");
    return { shown: !!el && !el.hidden && getComputedStyle(el).display !== "none", text: (el?.textContent ?? "").trim() };
  });
  check("the panel says masks combine, with no mask made yet",
    note.shown && /subtract/i.test(note.text) && /overlap|both/i.test(note.text),
    note.shown ? `"${note.text.slice(0, 64)}…"` : "the line is not shown");

  await p.click("#addRadial");
  await settle(p);
  const fresh = await rows(p);
  check("a new mask takes the derived name", fresh.length === 1 && /^Radial 1$/.test(fresh[0].label),
    `row reads "${fresh[0]?.label ?? "(none)"}"`);
  check("and the row offers a rename", !!fresh[0]?.hasRename);

  // 2 · A NAME IS WRITTEN, THEN AN UNRELATED EDIT, THEN UNDO.
  await rename(p, 0, "Sky over the barn");
  const named = await rows(p);
  check("the name replaces the derived one", named[0]?.label === "Sky over the barn",
    `row reads "${named[0]?.label ?? "(none)"}"`);

  await setMaskValue(p, "brightness", 1.4);
  await settle(p);
  const afterEdit = await rows(p);
  check("it survives an unrelated edit", afterEdit[0]?.label === "Sky over the barn",
    `row reads "${afterEdit[0]?.label ?? "(none)"}"`);

  // THE ONE THAT MATTERS: the name rides inside params.masks, and undo replaces
  // that array wholesale. A field dropped on the way back is lost in silence.
  await p.keyboard.press("Control+z");
  await settle(p);
  const afterUndo = PLANT ? afterEdit : await rows(p);
  check("and it survives an undo of that edit", afterUndo[0]?.label === "Sky over the barn",
    `row reads "${afterUndo[0]?.label ?? "(none)"}"`);

  // 3 · AN EMPTY NAME GOES BACK TO THE DERIVED ONE, rather than a blank row.
  await rename(p, 0, "");
  const cleared = PLANT ? named : await rows(p);
  check("an empty name gives the derived one back", /^Radial 1$/.test(cleared[0]?.label ?? ""),
    `row reads "${cleared[0]?.label ?? "(none)"}"`);

  // 4 · PRESSING THE SELECTED MASK LEAVES IT.
  //
  // A NEW MASK ARRIVES ALREADY SELECTED — `addMask` sets selectedMask to the
  // one it just made, which is right and is what the reader wants. The first
  // version of this section clicked once to "select" it and measured the
  // DESELECT, then clicked again and measured the re-select, and reported both
  // as failures of the app. Read the state rather than assume it.
  const armed = await rows(p);
  check("a mask is selected the moment it is made", armed[0]?.pressed === true && (await editorOpen(p)),
    `pressed ${armed[0]?.pressed}, editor ${(await editorOpen(p)) ? "open" : "closed"}`);

  await p.locator("#maskList .mask-row").nth(0).locator(".mask-pick").click();
  await settle(p);
  const left = await rows(p);
  const stillOpen = await editorOpen(p);
  check("pressing the selected one leaves it, and the editor goes",
    left[0]?.pressed === false && !stillOpen,
    `pressed ${left[0]?.pressed}, editor ${stillOpen ? "still open" : "closed"}`);
  check("...and the mask is still there, not deleted", left.length === 1,
    `${left.length} row(s)`);

  await p.locator("#maskList .mask-row").nth(0).locator(".mask-pick").click();
  await settle(p);
  const back = await rows(p);
  check("...and pressing it once more comes back to it",
    back[0]?.pressed === true && (await editorOpen(p)),
    `pressed ${back[0]?.pressed}`);

  // 5 · A SAVED MASK IS A RECIPE. Save a Sky mask here, then put it on another
  // photograph and read what it selects THERE.
  await p.locator("#maskList .mask-row").nth(0).locator(".mask-keep").click();
  await p.waitForSelector("#askInput", { state: "visible", timeout: 20000 });
  await p.fill("#askInput", "Radial keeper");
  await p.click("#askOk");
  await settle(p);
  const savedRows = await p.evaluate(() => ({
    shown: !document.getElementById("savedMaskRow")?.hidden,
    labels: [...document.querySelectorAll("#savedMaskList .mask-pick")].map((e) => e.textContent ?? ""),
  }));
  check("a saved mask appears in the saved list", savedRows.shown && savedRows.labels.some((l) => l.startsWith("Radial keeper")),
    savedRows.labels.join(" | ") || "the list is empty");

  // AND A BRUSH MASK REFUSES IN WORDS rather than by a missing control.
  await p.click("#addBrush");
  await settle(p);
  await p.locator("#maskList .mask-row").nth(1).locator(".mask-keep").click();
  await p.waitForSelector("#askDlg[open]", { timeout: 20000 });
  const refusal = await p.evaluate(() => ({
    title: document.getElementById("askTitle")?.textContent ?? "",
    body: document.getElementById("askBody")?.textContent ?? "",
    hasInput: !document.getElementById("askInputRow")?.hidden,
  }));
  check("a painted mask says why it cannot be saved",
    /cannot be saved/i.test(refusal.title) && /brush|painted/i.test(refusal.body) && !refusal.hasInput,
    `"${refusal.title}"`);
  await p.click("#askOk");
  await settle(p);

  // 6 · A SAVED SKY MASK IS RE-DETECTED, NOT RESTORED.
  // Save the Sky mask from THIS frame, then open a different one in the SAME
  // browser context and apply it. IndexedDB is per-origin and shared across
  // pages in a context but NOT across contexts — the first version of this
  // section opened a fresh context under a comment saying a fresh context would
  // lose the store, and then reported the empty list as the app failing.
  await p.click("#addSky");
  await p.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 120000 });
  await settle(p);
  const skyHere = await p.evaluate(() => document.getElementById("mSkyStatus")?.textContent ?? "");
  const pctHere = Number((skyHere.match(/(\d+)% of the frame/) ?? [])[1] ?? -1);
  const skyRow = await p.evaluate(() => document.querySelectorAll("#maskList .mask-row").length - 1);
  await p.locator("#maskList .mask-row").nth(skyRow).locator(".mask-keep").click();
  await p.waitForSelector("#askInput", { state: "visible", timeout: 20000 });
  await p.fill("#askInput", "The sky");
  await p.click("#askOk");
  await settle(p);
  check("the first frame's sky was measured, so there is something to compare",
    pctHere >= 0, `${pctHere}% of the frame here`);

  const p2 = await ctx.newPage();
  p2.on("dialog", (d) => d.accept());
  await p2.goto(`http://127.0.0.1:${PORT}/ir.html`);
  await p2.setInputFiles("#file", ["public/examples/NIR_0063.dng"]);
  await p2.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
  await p2.waitForFunction(() => !document.getElementById("busy")?.hasAttribute("open"), null, { timeout: 300000 });
  await settle(p2);
  await openMasks(p2);
  await settle(p2);
  const carried = await p2.evaluate(() => ({
    shown: !document.getElementById("savedMaskRow")?.hidden,
    labels: [...document.querySelectorAll("#savedMaskList .mask-pick")].map((e) => e.textContent ?? ""),
  }));
  check("the saved list is drawn on a fresh load, not only after a save",
    carried.shown && carried.labels.some((l) => l.startsWith("The sky")),
    carried.labels.join(" | ") || "nothing carried over");

  // THE CHECK THE FEATURE TURNS ON. Put the saved sky on this other frame and
  // read what it selects HERE. A stored bitmap would carry the first frame's
  // number across; a recipe re-detects and reports this frame's own.
  const idx = carried.labels.findIndex((l) => l.startsWith("The sky"));
  await p2.locator("#savedMaskList .mask-pick").nth(idx).click();
  await p2.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 120000 });
  await settle(p2);
  const skyThere = await p2.evaluate(() => document.getElementById("mSkyStatus")?.textContent ?? "");
  const pctThere = Number((skyThere.match(/(\d+)% of the frame/) ?? [])[1] ?? -1);
  // Against a FRESH sky mask made on this frame, which is the ground truth for
  // "what this photograph's sky actually is".
  await p2.click("#addSky");
  await p2.waitForFunction(() => !document.getElementById("skyControls")?.hidden, null, { timeout: 120000 });
  await settle(p2);
  const skyFresh = await p2.evaluate(() => document.getElementById("mSkyStatus")?.textContent ?? "");
  const pctFresh = Number((skyFresh.match(/(\d+)% of the frame/) ?? [])[1] ?? -1);
  console.log(`\n  frame A ${pctHere}%   saved-applied on frame B ${pctThere}%   fresh on frame B ${pctFresh}%\n`);
  check("the saved sky was RE-DETECTED on the new frame, not restored from the old",
    pctThere >= 0 && pctFresh >= 0 && Math.abs(pctThere - pctFresh) <= 2,
    `applied ${pctThere}% against a fresh ${pctFresh}% on the same frame (frame A was ${pctHere}%)`);
  await p2.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
