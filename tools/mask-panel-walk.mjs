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
// --plant makes the name check read the row it wrote rather than the row after
// the undo, which is the shape of the defect this exists for. Two checks must
// go red.
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
  await p.click("#ptab-masks");
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

  await p.evaluate(() => {
    const el = document.getElementById("mBrightness");
    el.value = "1.4";
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
  });
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
  await ctx.close();
} finally { await b.close(); }
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
