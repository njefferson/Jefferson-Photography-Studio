#!/usr/bin/env node
// THE ACCESSIBILITY SWEEP — every surface that deploys, both themes, by finger.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/a11y-walk.mjs [--port=8131]
//
//   npm install --no-save esbuild playwright-core axe-core
//
// NOT in .branch-guard's `also=`: it drives a real browser over seven pages and
// decodes RAW files, which is minutes, not milliseconds. Run it before ANY UI
// release, which is what CLAUDE.md has always said and what nothing in the
// repository could hold, because until now this walk was not in the repository.
//
// IT LIVES HERE NOW BECAUSE IT WAS THE LAST INSTRUMENT THAT DID NOT. It was
// rebuilt in the scratchpad before each release, its result written into the
// notes, and nothing in the repo held it — so a session that did not know it
// existed shipped without it, and a container that went away took it with it.
// Both `NOTES.md` and the live status page carried that as an open debt.
//
// WHAT CHANGED BESIDES THE LOCATION, and it is the part that matters. The
// scratchpad version carried this line in its own words:
//
//     A NEW SURFACE JOINS THIS LIST IN THE SAME COMMIT THAT CREATES IT, or it
//     ships unmeasured — which is how .ql-btn stayed 34px for as long as it did.
//
// True, and it refused nothing. Measured on the run that wrote this: ir.html
// declares FIFTEEN dialogs and the sweep visited three; the axe pass ran on
// ir.html alone while seven pages deploy. The list is an assertion now
// (tools/surfaces.mjs), checked both ways against the BUILD, so a surface that
// arrives unmeasured fails rather than being noticed later by somebody.
//
// THE SECTIONS, each a standing claim rather than a one-release probe. The
// headings each prints are the source; this is a copy of them, and it said
// "four" at 430px while seven ran at 402px.
//   0  every deployed page and dialog is declared, and every declaration exists
//   1  axe over every page, in both themes and both shapes
//   2  hit areas at 402px and 900px, on every page and inside every dialog
//   3  the colours that carry meaning, read COMPOSITED (hub LESSONS §293)
//   4  the palette spec still describes what the app paints
//   5  decoration that paints has a box to paint in
//   6  the (i) control, and orientation that is moved rather than copied
//   7  the start screen while the editor is being prepared, and when it cannot be
//   8  the busy card while a keep waits for the last session's delete
//   9  the busy card offering to skip a file that has not finished reading
//  10  the session strip offering to skip a later file of a set
//  11  the line that says the look's sky is still being refined
//  12  Temperature and Tint, the hold, the standing line and the way out of it
//  13  the test page with a press running: the progress line, the pressed button, the targets and axe
//
// Feature-specific a11y probes stay in the scratchpad, per release. What makes
// this one repo-worthy is the coverage assertion: it is the only thing here
// that knows what the app is made of.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: a walk measures `dist`, and nothing used to connect that
// directory to this tree. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync, mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repo, surfaces, allowed, check as checkSurfaces } from "./surfaces.mjs";
import { sweepRenders } from "./palette-spec.mjs";
import { slowBuild } from "./slow-build.mjs";
import { slowStorage } from "./slow-storage.mjs";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
// `--only=7` (or `--only=1,7`) runs those sections alone; section 0, the
// coverage assertion, always runs because it costs nothing and is the one that
// knows what exists. Without it, everything runs, as before.
const ONLY = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1]?.split(",").map(Number).filter((n) => !Number.isNaN(n));
const want = (n) => !ONLY || !ONLY.length || ONLY.includes(n);
// `--plant-temperature` (with `--only=12`) makes a Temperature press move nothing: the slider's input and change events are stopped before the app sees them. Every
// Temperature check in section 12 has to FAIL on it, which is what shows they can.
const PLANT_TEMPERATURE = process.argv.includes("--plant-temperature");
const BASE = `http://127.0.0.1:${PORT}`;
const axeSrc = readFileSync(join(repo, "node_modules/axe-core/axe.min.js"), "utf8");
const EX = join(repo, "public/examples");
const ONE = join(EX, "NIR_0063.dng");
const THEMES = ["dark", "light"];
/** THE TWO SHAPES THIS APP IS ACTUALLY HELD IN, declared once beside the themes
 *  because they are the same kind of parameter and were not being treated as
 *  one. The desktop entry is what every section here used to use; the phone
 *  entry is the REPORTED geometry of the reader's own device — 402x812 at
 *  device pixel ratio 2, with touch — taken from a §7f diagnostic rather than
 *  guessed at.
 *
 *  WHY IT IS HERE AT ALL (hub LESSONS 347). A layout defect lived at phone
 *  width for the whole life of the start card: pressing Home left the editor
 *  drawer on screen under the start card, which on a phone is two thirds of the
 *  window. Twelve walks in this directory are ones where the viewport is
 *  load-bearing and exactly one of them ran at phone size, so the question "do
 *  the walks test phone width?" answered YES — section 2 below has always run
 *  at 430 — while nine walks that would have seen it were somewhere else. A
 *  width visited by one instrument reads as covered. */
const SIZES = [
  { name: "desktop", opts: { viewport: { width: 1100, height: 850 } } },
  { name: "phone", opts: { viewport: { width: 402, height: 812 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
const RULES = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

let failed = 0;
const fail = (s) => { failed++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);
const note = (s) => console.log(`        ${s}`);

/** Hit areas, measured by REACHABLE area rather than bounding box. A control can
 *  extend its own with a pseudo-element — the zoom buttons are 40x40 boxes with
 *  a 45x45 hit area — and a range input's box is its TRACK while the thing a
 *  finger has to hit is the THUMB. A box-only sweep called all of those failures
 *  and buried the one real one underneath them. */
const HIT = () => {
  const owns = (el, target) => { let n = el; while (n) { if (n === target) return true; n = n.parentElement; } return false; };
  const out = [];
  // Scoped to the open dialog when there is one: a modal's backdrop intercepts
  // elementFromPoint, so every control BEHIND it measures as its bare box and
  // reads as a failure. Those controls are not reachable during a modal by
  // design, which is the opposite of the defect.
  // INLINE IN A SENTENCE IS EXEMPT, and that is the standard rather than a way
  // past it: SC 2.5.8's Inline exception covers a target "in a sentence, or
  // whose size is otherwise constrained by the line-height of non-target text".
  // Enlarging a link in the middle of a paragraph breaks the paragraph. Tested
  // structurally, not by tag — a <button> styled as a link mid-sentence is the
  // same case, and this app has one — so: laid out inline, and sharing its
  // parent with real text.
  const inSentence = (e) => {
    if (!/^inline/.test(getComputedStyle(e).display)) return false;
    const p = e.parentElement;
    if (!p) return false;
    return [...p.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
  };
  // COUNTED AND PRINTED, never silent. An exemption nobody sees is an exemption
  // that grows: this one is the difference between "the sweep found nothing"
  // and "the sweep looked at nothing", and only the printed list tells them
  // apart. Same reason .copy-allow and .example-allow print on every run.
  const exempt = [];
  const root = document.querySelector("dialog[open]") || document;
  for (const e of root.querySelectorAll("button, a[href], [role=button], [role=radio], [role=tab]")) {
    const r = e.getBoundingClientRect();
    if (!r.width || !r.height || getComputedStyle(e).visibility === "hidden") continue;
    if (inSentence(e)) { exempt.push(e.id || e.textContent.trim().slice(0, 24) || e.tagName); continue; }
    const cx = r.x + r.width / 2, cy = r.y + r.height / 2;
    const reach = (dx, dy) => { let n = 0; for (; n < 30; n++) { const el = document.elementFromPoint(cx + dx * (r.width / 2 + n), cy + dy * (r.height / 2 + n)); if (!el || !owns(el, e)) break; } return n; };
    const w = r.width + reach(-1, 0) + reach(1, 0), h = r.height + reach(0, -1) + reach(0, 1);
    if (w < 44 || h < 44) out.push(`${e.id || e.className || e.tagName} ${Math.round(w)}x${Math.round(h)}`);
  }
  return { small: out, exempt };
};

/** A SAVED MASK IS A SURFACE, AND IT IS HIDDEN UNTIL ONE IS SAVED (decision
 *  040). `#savedMaskRow` starts `hidden`, so a sweep that only opens the Masks
 *  tab walks past the whole feature seeing nothing — the same shape as the mask
 *  editor itself, which was unmeasured for its whole life for exactly this
 *  reason. This makes a Sky mask, names it through the real dialog and saves
 *  it, so both passes below see the editor AND the saved list a reader sees.
 *
 *  Takes `page`. Returns true when the saved list is on screen, false with the
 *  reason printed when any step would not happen — never a silent skip, because
 *  a sweep that quietly measured nothing is indistinguishable from a clean one. */
const makeAndSaveMask = async (page, where) => {
  const added = await page.evaluate(() => {
    // Masks are a PLACE now, not a tab (decision 042) — the opener sits above
    // the tab strip. Clicking the old #ptab-masks here would find nothing and
    // the sweep would report a clean run over a surface it never reached.
    document.getElementById("maskPlaceOpen")?.click();
    const add = document.getElementById("addSky");
    if (!add) return false;
    add.click();
    return true;
  });
  if (!added) { fail(`${where}: no Add control, so the mask editor and the saved list are unmeasured`); return false; }
  const shown = await page.waitForFunction(
    () => !document.getElementById("skyControls")?.hidden, null, { timeout: 60000 },
  ).then(() => true).catch(() => false);
  if (!shown) { fail(`${where}: the mask editor would not open, so its controls are unmeasured`); return false; }
  await page.waitForTimeout(600);
  const kept = await page.evaluate(() => {
    const rows = document.querySelectorAll("#maskList .mask-row");
    const keep = rows[rows.length - 1]?.querySelector(".mask-keep");
    if (!keep) return false;
    keep.click();
    return true;
  });
  if (!kept) { fail(`${where}: no Keep control on the mask row, so the saved list is unmeasured`); return false; }
  const asked = await page.waitForSelector("#askInput", { state: "visible", timeout: 20000 }).then(() => true).catch(() => false);
  if (!asked) { fail(`${where}: saving would not ask for a name, so the saved list is unmeasured`); return false; }
  await page.fill("#askInput", "Sky to keep");
  await page.click("#askOk");
  const listed = await page.waitForFunction(
    () => !document.getElementById("savedMaskRow")?.hidden, null, { timeout: 20000 },
  ).then(() => true).catch(() => false);
  if (!listed) { fail(`${where}: the mask saved but the saved list stayed hidden`); return false; }
  await page.waitForTimeout(300);
  return true;
};

/** A PICKED MASK IS A STATE OF THE WHOLE PANEL (042, stage 2). Takes the page,
 *  with a mask just made and the mask place still open, and a label; closes
 *  the place with a real press and returns true once the chip row and the
 *  heading's "Editing" line are showing, false (with a failure) when they do
 *  not. What the caller relies on: after true, the tabs are the picked mask's —
 *  its controls live, the rest inert with the note saying why — which is the
 *  state a reader works in and the one a sweep of the open mask place never
 *  reaches, because the chips and the heading hide while the place is open. */
const pickedMaskState = async (page, where) => {
  const close = page.locator("#maskPlaceClose");
  if (!(await close.isVisible().catch(() => false))) { fail(`${where}: the mask place is not open, so the picked-mask state is unmeasured`); return false; }
  await close.click();
  const shown = await page.waitForFunction(
    () => { const t = document.getElementById("maskTarget"), c = document.getElementById("maskChips"); return !!t && !!c && !t.hidden && !c.hidden && c.children.length > 1; }, null, { timeout: 20000 },
  ).then(() => true).catch(() => false);
  if (!shown) { fail(`${where}: closing the mask place left no chip row or Editing line, so the picked-mask state is unmeasured`); return false; }
  await page.waitForTimeout(400);
  return true;
};

/** The colour a reader actually sees: the first ancestor that paints, composited
 *  down. `getComputedStyle` hands back the rgba AS WRITTEN, so a 15% accent over
 *  a dark surface reads as the accent while it is on screen as near-black — a
 *  pressed button measured rgb(30,34,42) against an unpressed rgb(65,65,65),
 *  darker than the control it was meant to stand out from, and the check that
 *  compared the two declarations passed. (Hub LESSONS §293.) */
const COMPOSITE = () => {
  const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : [0, 0, 0, 0]; };
  const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => Math.round(fg[i] * a + bg[i] * (1 - a))); };
  window.__composited = (el) => {
    let stack = [], n = el;
    while (n) { const c = parse(getComputedStyle(n).backgroundColor); if ((c[3] ?? 1) > 0) stack.push(c); if ((c[3] ?? 1) === 1) break; n = n.parentElement; }
    if (!stack.length) return [255, 255, 255];
    let out = stack.pop().slice(0, 3);
    while (stack.length) out = over(stack.pop(), out);
    return out;
  };
};

const browser = await chromium.launch({
  executablePath: "/opt/pw-browsers/chromium",
  args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  // ── 0 ────────────────────────────────────────────────────────────────────
  console.log("\n0 — every surface that deploys is declared, and every declaration deploys");
  const bad = checkSurfaces();
  if (bad.length) { for (const b of bad) fail(b); }
  else ok(`${surfaces().length} pages declared both ways`);
  const ex = allowed();
  if (ex.length) { note("not opened, and why:"); for (const a of ex) note(`  ${a.where} — ${a.why}`); }
  else note("nothing excused — every declared dialog is opened below");

  // ── 1 ────────────────────────────────────────────────────────────────────
  if (want(1)) console.log("\n1 — axe over every deployed page, in both themes and both shapes");
  if (want(1)) for (const s of surfaces()) {
    for (const theme of THEMES) for (const size of SIZES) {
      const page = await browser.newPage({ ...size.opts, colorScheme: theme });
      page.on("dialog", (d) => d.accept());
      try {
        await page.goto(`${BASE}/${s.file}`);
        await page.waitForTimeout(900);
        // The editor pages have a second state worth sweeping: axe on a welcome
        // screen measures the welcome screen. One photo is enough to build the
        // whole of the chrome; three was three decodes for the same answer.
        if (s.file === "ir.html") {
          await page.setInputFiles("#file", ONE);
          await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
          // AND WITH A LOOK ON, so its finishing panel (decision 022) is a measured
          // surface: axe and the hit areas see the panel open, as a reader does.
          await page.evaluate(() => document.getElementById("lookEir")?.click());
          await page.waitForTimeout(2000);
          await page.waitForTimeout(2500);
          // AND WITH A MASK MADE AND SAVED, so axe reads the mask editor and
          // the saved list rather than the Add row with everything behind it
          // still `hidden`.
          await makeAndSaveMask(page, `${s.file} [${theme} ${size.name}] sky mask`);
        }
        await page.addScriptTag({ content: axeSrc });
        const r = await page.evaluate(async (rules) => await window.axe.run(document, { runOnly: rules }), RULES);
        const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        // THE SHAPE IS IN THE LABEL, because this section now runs twice per theme
        // and two identical lines would make a phone-only failure unattributable.
        const line = `${s.file} [${theme} ${size.name}]`;
        if (serious.length) { fail(`${line}: ${serious.length} serious/critical`); for (const v of serious) for (const n of v.nodes) note(`[${v.impact}] ${v.id}: ${n.target.join(" ")}`); }
        else ok(`${line}: nothing serious or critical${r.violations.length ? ` (${r.violations.length} minor)` : ""}`);
        for (const v of r.violations.filter((v) => !serious.includes(v))) note(`  minor · ${v.id} x${v.nodes.length}`);
        // AND WITH THAT MASK PICKED (042, stage 2): the chip row, the Editing
        // line and the tabs acting on the mask, which the open place hides.
        if (s.file === "ir.html" && await pickedMaskState(page, `${line} picked mask`)) {
          const rp = await page.evaluate(async (rules) => await window.axe.run(document, { runOnly: rules }), RULES);
          const sp = rp.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
          if (sp.length) { fail(`${line} with a mask picked: ${sp.length} serious/critical`); for (const v of sp) for (const n of v.nodes) note(`[${v.impact}] ${v.id}: ${n.target.join(" ")}`); }
          else ok(`${line} with a mask picked: nothing serious or critical${rp.violations.length ? ` (${rp.violations.length} minor)` : ""}`);
          for (const v of rp.violations.filter((v) => !sp.includes(v))) note(`  minor · ${v.id} x${v.nodes.length}`);
        }
      } finally { await page.close(); }
    }
  }

  // ── 2 ────────────────────────────────────────────────────────────────────
  // 402 REPLACES THE 430 THIS SECTION USED TO RUN AT, and the replacement is
  // the point rather than a tidy-up: 430 was a round number standing in for
  // "a phone", and 402 is the width the reader's own diagnostic reports. It is
  // also narrower, so nothing that passed at 430 is now unmeasured.
  if (want(2)) console.log("\n2 — hit areas at 402px and 900px, on every page and inside every dialog");
  if (want(2)) for (const s of surfaces()) {
    for (const vw of [402, 900]) {
      const page = await browser.newPage({ viewport: { width: vw, height: 850 } });
      page.on("dialog", (d) => d.accept());
      try {
        await page.goto(`${BASE}/${s.file}`);
        await page.waitForTimeout(900);
        if (s.file === "ir.html") {
          await page.setInputFiles("#file", ONE);
          await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
          // AND WITH A LOOK ON, so its finishing panel (decision 022) is a measured
          // surface: axe and the hit areas see the panel open, as a reader does.
          await page.evaluate(() => document.getElementById("lookEir")?.click());
          await page.waitForTimeout(2000);
          await page.waitForTimeout(2000);
        }
        const { small, exempt } = await page.evaluate(HIT);
        if (small.length) fail(`${s.file} ${vw}px: ${small.join(" · ")}`);
        else ok(`${s.file} ${vw}px: all >= 44`);
        if (exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${exempt.join(" · ")}`);
        for (const id of s.dialogs) {
          const opened = await page.evaluate((i) => { const d = document.getElementById(i); if (!d) return false; try { if (!d.open) d.showModal(); } catch { return false; } return true; }, id);
          if (!opened) { fail(`${s.file} ${vw}px #${id}: would not open — declare it in .a11y-allow with a reason, or fix it`); continue; }
          // A BUTTON LABELLED AT OPEN TIME IS EMPTY WHEN OPENED COLD, and an
          // empty button measures its padding. #askDlg's two came back 41x19
          // that way and read as a finding. Seeded with "OK", which is the
          // SHORTEST label this app actually passes to askDialog — so the
          // measurement is the tightest real case rather than a flattering one.
          const seeded = await page.evaluate(() => {
            const out = [];
            for (const b of document.querySelectorAll("dialog[open] button")) {
              if (!b.textContent.trim() && !b.querySelector("img, svg") && !b.getAttribute("aria-label")) { b.textContent = "OK"; out.push(b.id || b.className); }
            }
            return out;
          });
          if (seeded.length) note(`(labelled at open time, seeded "OK" to measure: ${seeded.join(", ")})`);
          await page.waitForTimeout(350);
          const inside = await page.evaluate(HIT);
          if (inside.small.length) fail(`${s.file} ${vw}px #${id}: ${inside.small.join(" · ")}`);
          else ok(`${s.file} ${vw}px #${id}: all >= 44`);
          if (inside.exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${inside.exempt.join(" · ")}`);
          await page.evaluate(() => document.querySelector("dialog[open]")?.close());
          await page.waitForTimeout(150);
        }

        // AND THE MODES, which are not dialogs and are not on screen at rest.
        //
        // The crop bar is a whole panel of controls that only exists once you
        // enter crop or straighten, so this sweep — which measures what is
        // rendered — had never seen one of them. Measured the first time it
        // was pointed at them: Reset and Done were 28px tall, in a bar used by
        // finger on a tablet, for the life of the bar. Everything around them
        // was correct, which is what made it invisible: the ratio chips buy
        // their 44 with a ::before extension and the straighten nudges declare
        // min-height outright, so nothing about the bar looked unconsidered.
        //
        // Same shape as the palette sweep that only visited the state the app
        // boots into: a sweep reports on the states it visited, and nothing
        // says which ones those were.
        // EVERY PANEL TAB, for the reason crop mode needed visiting: a tab that
        // is not selected is `hidden`, so its controls are not rendered and this
        // sweep has never measured one. Twelve tabs, and the first run of this
        // found SEVENTY-ONE controls under the floor behind them — including
        // Export & Save, the app's primary action, at 34px.
        //
        // A page, a dialog, a mode and a TAB are four different things, and only
        // the first two were ever in the list.
        if (s.file === "ir.html") {
          // THE MASK PLACE IS SWEPT BESIDE THE TABS (decision 042). It left the
          // tab strip in 2.60, and this enumeration is what used to reach its
          // controls — so without the extra entry below, moving masks out of
          // the strip would have silently removed a whole surface from the
          // sweep while every check stayed green. That is the exact failure
          // tools/surfaces.mjs exists to refuse, one level down.
          const tabs = await page.evaluate(() =>
            [...document.querySelectorAll("#panelTabs .ptab")].map((t) => t.id).filter(Boolean));
          tabs.push("maskPlaceOpen");
          for (const id of tabs) {
            const on = await page.evaluate((t) => {
              const b2 = document.getElementById(t);
              if (!b2) return false;
              b2.click();
              // A tab says aria-selected; the mask place's opener says
              // aria-expanded, and it hides itself once the place is up.
              return t === "maskPlaceOpen"
                ? !document.getElementById("maskPlace")?.hidden
                : b2.getAttribute("aria-selected") === "true";
            }, id);
            if (!on) { fail(`${s.file} ${vw}px tab #${id}: would not select, so its controls are unmeasured`); continue; }
            // SETTLE ON A COUNT, NOT ON A CLOCK. A flat 260ms wait passed this
            // tab twice while the Stickers panel's top row was still `hidden`,
            // waiting on the sticker catalogue — so the sweep measured the
            // controls that had arrived and reported that every control passed.
            // Four of them were 40px. The same failure as the tabs themselves,
            // one level down: a sweep reports on what it managed to see, and
            // nothing in the output distinguishes that from coverage.
            const settled = await page.evaluate(async () => {
              const n = () => document.querySelectorAll("#panel button:not([hidden]), #panel select, #panel input").length;
              let last = -1, same = 0;
              for (let i = 0; i < 40; i++) {            // 40 x 50ms ceiling
                await new Promise((r) => requestAnimationFrame(() => setTimeout(r, 50)));
                const c = n();
                same = c === last ? same + 1 : 0;
                last = c;
                if (same >= 3) return { count: c, ms: i * 50 };
              }
              return { count: last, ms: 2000, capped: true };
            });
            if (settled.capped) note(`${id}: control count never settled, measured ${settled.count} after 2s`);
            const inside = await page.evaluate(HIT);
            if (inside.small.length) fail(`${s.file} ${vw}px tab ${id}: ${inside.small.join(" · ")}`);
            else ok(`${s.file} ${vw}px tab ${id}: all >= 44`);
            if (inside.exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${inside.exempt.join(" · ")}`);
            // THE PINNED HEADING, IN BOTH OF ITS STATES. It is a nowrap row that
            // gains a 44px button at scrollTop 12, and a row that runs out of
            // width ellipsises in silence — measured, the Grade tab's sub-line
            // wanted 234px of 224 and ended in "...grain & vignette" that nobody
            // would think to look for. Checked at rest AND scrolled, because the
            // tight state is the one that only exists after an interaction.
            const clip = await page.evaluate(async () => {
              const body = document.getElementById("panelBody");
              const out = [];
              for (const top of [0, 400]) {
                body.scrollTop = top;
                body.dispatchEvent(new Event("scroll"));
                await new Promise((r) => setTimeout(r, 40));
                for (const el of [document.getElementById("sectionTitle"), document.getElementById("sectionSub")]) {
                  if (!el || getComputedStyle(el).display === "none") continue;
                  if (el.scrollWidth > el.clientWidth + 1) out.push(`@${top} #${el.id} "${el.textContent}" needs ${el.scrollWidth} of ${el.clientWidth}`);
                }
              }
              body.scrollTop = 0;
              body.dispatchEvent(new Event("scroll"));
              return out;
            });
            if (clip.length) fail(`${s.file} ${vw}px tab ${id}: heading clipped — ${clip.join(" · ")}`);
          }
        }

        if (s.file === "ir.html") {
          for (const [mode, id] of [["crop", "cropBtn"], ["straighten", "straightenBtn"]]) {
            const on = await page.evaluate((b) => {
              document.getElementById("ptab-crop")?.click();
              const el = document.getElementById(b);
              if (!el) return false;
              el.click();
              return el.getAttribute("aria-pressed") === "true";
            }, id);
            if (!on) { fail(`${s.file} ${vw}px ${mode}: the mode would not turn on, so its controls are unmeasured`); continue; }
            await page.waitForTimeout(500);
            const inside = await page.evaluate(HIT);
            if (inside.small.length) fail(`${s.file} ${vw}px ${mode} mode: ${inside.small.join(" · ")}`);
            else ok(`${s.file} ${vw}px ${mode} mode: all >= 44`);
            if (inside.exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${inside.exempt.join(" · ")}`);
            // THE LINE TOOL'S ARMED STATE IS ITS OWN SURFACE (038): the label
            // changes to what the app is waiting for and the fill goes to the
            // accent, and a sweep that only ever saw the resting button would
            // measure neither. Same shape as the mask editor and the kept list:
            // a state nothing reaches is a state nothing measures.
            if (mode === "straighten") {
              const lineOn = await page.evaluate(() => {
                const b2 = document.getElementById("cropLine");
                if (!b2) return false;
                b2.click();
                return b2.getAttribute("aria-pressed") === "true";
              });
              if (!lineOn) fail(`${s.file} ${vw}px straighten: the line tool would not arm, so its armed state is unmeasured`);
              else {
                await page.waitForTimeout(250);
                const armedHit = await page.evaluate(HIT);
                if (armedHit.small.length) fail(`${s.file} ${vw}px line tool armed: ${armedHit.small.join(" · ")}`);
                else ok(`${s.file} ${vw}px line tool armed: all >= 44`);
                await page.evaluate(() => document.getElementById("cropLine")?.click());
                await page.waitForTimeout(150);
              }
            }
            await page.evaluate((b) => document.getElementById(b)?.click(), id);
            await page.waitForTimeout(250);
          }
        }

        // A MASK'S OWN EDITOR IS A STATE, and every control in it was
        // unmeasured until 2026-09-20. The mask panels are `hidden` until a
        // mask exists and one is selected, and a hidden control has no
        // bounding box, so the tab sweep above walks the Masks tab seeing the
        // Add row and nothing else. Show mask, Matte, Invert, Delete, Reach,
        // Feather, the join radios and the hand-correction row had never been
        // in a sweep — the same shape as the tabs themselves and as crop mode:
        // a sweep reports on what it managed to see, and nothing in its output
        // distinguishes that from coverage. A Sky mask opens the largest of
        // those editors. THE SAVED LIST IS THE SAME SHAPE ONE LEVEL ON: it is
        // `hidden` until a mask has been saved, so the mask is saved here and
        // both are swept together, in the commit that creates it.
        if (s.file === "ir.html" && await makeAndSaveMask(page, `${s.file} ${vw}px sky mask`)) {
          const inside = await page.evaluate(HIT);
          if (inside.small.length) fail(`${s.file} ${vw}px sky mask editor and saved list: ${inside.small.join(" · ")}`);
          else ok(`${s.file} ${vw}px sky mask editor and saved list: all >= 44`);
          if (inside.exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${inside.exempt.join(" · ")}`);
          if (await pickedMaskState(page, `${s.file} ${vw}px picked mask`)) {
            const picked = await page.evaluate(HIT);
            if (picked.small.length) fail(`${s.file} ${vw}px with a mask picked (chips, Editing line, tabs): ${picked.small.join(" · ")}`);
            else ok(`${s.file} ${vw}px with a mask picked (chips, Editing line, tabs): all >= 44`);
            if (picked.exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${picked.exempt.join(" · ")}`);
          }
        }

        // THE PICK/REJECT SHEET IS A STATE, AND SO IS ITS WAITING HALF.
        // Every cell exists from the moment the sheet opens, named and
        // numbered, before a byte is read (decision 033) — so there is a
        // populated grid to measure that never existed before, and a reader
        // can press a reject on a cell whose picture has not arrived. Both
        // halves are swept: while the run is still going, when every cell is
        // waiting, and again when it has finished and the tiles carry
        // pictures. The grid's busy flag is what tells them apart; the
        // header's wording is copy and must stay free to change, which is
        // what three walks polling that sentence cost on 2026-09-20.
        if (s.file === "ir.html") {
          await page.setInputFiles("#quickFiles", [ONE, join(EX, "NIR_0102.dng")]);
          const up = await page.waitForFunction(
            () => (document.getElementById("qlGrid")?.children.length ?? 0) > 0, null, { timeout: 60000 },
          ).then(() => true).catch(() => false);
          if (!up) fail(`${s.file} ${vw}px quick look: the sheet would not open, so its tiles are unmeasured`);
          else {
            const waiting = await page.evaluate(HIT);
            if (waiting.small.length) fail(`${s.file} ${vw}px quick look, still reading: ${waiting.small.join(" · ")}`);
            else ok(`${s.file} ${vw}px quick look, still reading: all >= 44`);
            await page.waitForFunction(
              () => !document.getElementById("qlGrid")?.dataset.busy, null, { timeout: 300000 },
            ).catch(() => {});
            await page.waitForTimeout(400);
            const filled = await page.evaluate(HIT);
            if (filled.small.length) fail(`${s.file} ${vw}px quick look, tiles in: ${filled.small.join(" · ")}`);
            else ok(`${s.file} ${vw}px quick look, tiles in: all >= 44`);
            if (filled.exempt.length) note(`inline in a sentence, exempt (SC 2.5.8): ${filled.exempt.join(" · ")}`);
            await page.evaluate(() => document.getElementById("qlClose")?.click());
            await page.waitForTimeout(250);
          }
        }
      } finally { await page.close(); }
    }
  }

  // ── 3 ────────────────────────────────────────────────────────────────────
  if (want(3)) console.log("\n3 — the colours that carry meaning, read composited");
  if (want(3)) for (const theme of THEMES) {
    const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, colorScheme: theme });
    page.on("dialog", (d) => d.accept());
    try {
      await page.goto(`${BASE}/ir.html`);
      await page.addInitScript(COMPOSITE);
      await page.setInputFiles("#file", [ONE, join(EX, "NIR_0102.dng")]);
      await page.waitForFunction(() => document.querySelectorAll("#sessionThumbs .session-thumb").length >= 2, null, { timeout: 300000 });
      await page.waitForTimeout(2500);
      await page.evaluate(COMPOSITE);
      await page.click("#sessionPick");
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => {
        const probe = document.createElement("span");
        probe.style.color = "var(--accent)";
        document.body.append(probe);
        const accent = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
        probe.remove();
        return {
          accent,
          pressed: window.__composited(document.getElementById("sessionPick")),
          unpressed: window.__composited(document.getElementById("sessionReject")),
          activeRing: getComputedStyle(document.querySelector(".session-thumb.active")).outlineWidth,
          pickedRing: getComputedStyle(document.querySelector(".session-thumb.picked:not(.active)") || document.querySelector(".session-thumb.picked")).outlineWidth,
        };
      });
      // IS the accent, not merely different from its neighbour. In the light
      // theme a faint accent over cream lands on a mid-grey that differs from
      // everything and reads as on nothing.
      const near = (a, b, tol) => a.every((v, i) => Math.abs(v - b[i]) <= tol);
      note(`[${theme}] accent rgb(${m.accent}) · pressed rgb(${m.pressed}) · unpressed rgb(${m.unpressed})`);
      if (near(m.pressed, m.accent, 24)) ok(`[${theme}] the pressed verdict button IS the accent`);
      else fail(`[${theme}] the pressed verdict button is rgb(${m.pressed}), not the accent rgb(${m.accent})`);
      if (!near(m.unpressed, m.accent, 24)) ok(`[${theme}] and its unpressed neighbour is not`);
      else fail(`[${theme}] the unpressed neighbour is the accent too — pressed says nothing`);
    } finally { await page.close(); }
  }
  // ── 4 ────────────────────────────────────────────────────────────────────
  //
  // THE COMMITTED PALETTE SPEC'S `_renders` LIST, RE-MEASURED.
  //
  // `palettes/studio.json` tells the hub's palette gate which text-on-accent-
  // wash pairings this app actually paints; every pairing NOT on that list has
  // its floor downgraded from a failure to a forecast. So a short list is not a
  // smaller gate, it is a quieter one — add a hint to a selected row, forget to
  // regenerate, and the contrast failure it introduces is reported as a screen
  // nobody has built.
  //
  // palette-spec-check.mjs covers the other half without a browser: it holds
  // the spec to the sha256 of public/palette.css. It cannot see this half,
  // because `_renders` is measured from the whole app rather than from the
  // colour tokens — which is why it belongs here, in the walk that already has
  // a browser open on every surface.
  //
  // The sweep is IMPORTED from the generator rather than reimplemented. Two
  // implementations of one measurement is how a check comes to agree with
  // itself and with nothing else.
  if (want(4)) console.log("\n4 — the palette spec still describes what the app paints");
  if (want(4)) {
    const spec = JSON.parse(readFileSync(join(repo, "palettes/studio.json"), "utf8"));
    const swept = await sweepRenders(browser, PORT);
    for (const t of swept.trouble) fail(`the sweep could not account for ${t}`);
    for (const k of swept.skipped) note(`off-role, recorded not dropped: ${k}`);
    const had = new Set(spec._renders ?? []);
    const now = new Set(swept.pairs);
    const added = [...now].filter((x) => !had.has(x)).sort();
    const gone = [...had].filter((x) => !now.has(x)).sort();
    for (const a of added) fail(`the app paints ${a} and palettes/studio.json does not list it — regenerate the spec`);
    for (const g of gone) fail(`palettes/studio.json lists ${g} and the app no longer paints it — regenerate the spec`);
    if (!added.length && !gone.length && !swept.trouble.length)
      ok(`all ${now.size} measured pairings match palettes/studio.json`);
  }
  // 5 — THE THINGS NOTHING ELSE IN HERE LOOKS AT.
  //
  // Every check above this one measures a CONTROL: its hit area, its name, its
  // role, the contrast of its text. Marking an element decorative — no role, no
  // name, `pointer-events: none` — takes it out of the population every one of
  // those samples, and it then ships broken in plain sight.
  //
  // Measured: both panel scroll cues had rendered as a flat 10px pill with the
  // arrow drawn OUTSIDE it, underneath, for the life of the feature. The cue is
  // `display: flex` with `height: 0` (on purpose, so it floats without taking
  // space in the flow) and a flex container's default `align-items: stretch`
  // sizes its item to its CONTAINER — so the pill was stretched to nothing and
  // all 10px of it was padding and border.
  //
  // So: anything that PAINTS — a background or a border a reader can see — is
  // asserted to have a box big enough to paint into, whether or not anybody can
  // press it. Deliberately about the box and not about the glyph: a glyph that
  // overflows is the symptom, and a box collapsed by its container is the class.
  if (want(5)) console.log("\n5 — decoration that paints has a box to paint in");
  if (want(5)) {
    const page = await browser.newPage({ viewport: { width: 900, height: 780 }, deviceScaleFactor: 2 });
    for (const s of surfaces()) {
      await page.goto(`${BASE}/${s.file}`, { waitUntil: "load" });
      if (s.file === "ir.html") {
        await page.setInputFiles("#file", ONE);
        await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
        await page.evaluate(() => { const b = document.getElementById("panelBody"); if (b) { b.scrollTop = 400; b.dispatchEvent(new Event("scroll")); } });
      }
      await page.waitForTimeout(250);
      const thin = await page.evaluate(() => {
        const out = [];
        for (const el of document.querySelectorAll("*")) {
          const cs = getComputedStyle(el);
          if (cs.visibility === "hidden" || cs.display === "none" || cs.opacity === "0") continue;
          const paints = (cs.backgroundColor && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.backgroundColor)) ||
            (parseFloat(cs.borderTopWidth) > 0 && !/rgba\(0, 0, 0, 0\)|transparent/.test(cs.borderTopColor));
          if (!paints) continue;
          const b = el.getBoundingClientRect();
          if (!b.width && !b.height) continue;          // laid out away, not collapsed
          // ONLY BOXES WITH THEIR OWN TEXT IN THEM. A rule, a divider, a
          // hairline, a dot: one axis thin on purpose and nothing inside to
          // clip. The class of bug this is for is a box that HOLDS something and
          // was sized by its container instead of its content.
          const mine = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
          if (!mine) continue;
          // ASK THE BROWSER, do not do the arithmetic. The first version of this
          // computed what a line "needs" from font-size, padding and borders,
          // and a 1.1 multiplier put nine tab buttons at 104x44 one pixel under
          // a need of 45 — nine false positives against one real find. The
          // browser already lays the content out and already knows whether it
          // fits: scrollHeight against clientHeight is the vertical twin of the
          // scrollWidth test the heading check uses. A real scroller is excluded
          // by its own overflow, which is what makes it a scroller.
          if (/auto|scroll/.test(cs.overflowY)) continue;
          // SIX PIXELS, AND THE NUMBER IS MEASURED RATHER THAN CHOSEN. At >1px
          // this reports the class of bug it is for AND every glyph whose line
          // box runs a hair past its padding, which is invisible and everywhere:
          // the collapsed cue wants 21px in 8 (a shortfall of 13), while the
          // zoom buttons want 45 in 42 (3) and a .seg chip wants 14 in 12 (2).
          // One real find against four that would teach the next reader to skip
          // the section. A container-collapsed box is an order-of-magnitude
          // mismatch, so the gate sits in the gap between 3 and 13.
          if (el.scrollHeight <= el.clientHeight + 6) continue;
          out.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).join(".") : ""} ${Math.round(b.width)}x${Math.round(b.height)}, content wants ${el.scrollHeight} in ${el.clientHeight}`);
        }
        return [...new Set(out)];
      });
      if (thin.length) fail(`${s.file}: painted box too small to hold what is in it — ${thin.join(" · ")}`);
      else ok(`${s.file}: every painted box has room for its content`);
    }
    await page.close();
  }

  // ── 6 ──────────────────────────────────────────────────
  // DOCTRINE 7e, ASSERTED RATHER THAN BELIEVED. The baseline says every app
  // carries an (i) control in its own chrome, accessibly named for what it
  // OPENS; that a first-time reader is told what the app is, what it will not
  // do and how to install it; and that the same words live permanently behind
  // the (i) afterwards — MOVED, never copied.
  //
  // Nothing checked any of it. The editor's first-run half was missing for the
  // whole life of the app and the audit that found it was a session reading
  // the repository by hand, which is the thing a gate exists to replace.
  //
  // THE "MOVED, NEVER COPIED" HALF IS THE ONE WORTH MEASURING, and it is
  // measurable: the start screen's route and the (i)'s route must land on the
  // SAME element. Two buttons that open two copies of the same prose pass a
  // human read and fail this.
  if (want(6)) console.log("\n6 — the (i) control, and orientation that is moved rather than copied");
  if (want(6)) {
    const page = await browser.newPage(SIZES[1].opts); // at the reader's own shape
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
    await page.waitForTimeout(900);
    const info = await page.evaluate(() => {
      const b = document.getElementById("infoBtn");
      if (!b) return null;
      const r = b.getBoundingClientRect();
      return { name: (b.getAttribute("aria-label") || b.textContent || "").trim(), w: Math.round(r.width), h: Math.round(r.height), inChrome: !b.closest("dialog") };
    });
    if (!info) fail("there is no (i) control on ir.html at all");
    else if (!info.inChrome) fail("the (i) control is inside a dialog rather than in the app's own chrome");
    else if (info.name.length < 12) fail(`the (i) control's accessible name does not say what it opens — "${info.name}"`);
    else ok(`the (i) is in the chrome, ${info.w}x${info.h}, named "${info.name}"`);

    // The two routes to orientation, and whether they are one place or two.
    const routes = await page.evaluate(() => {
      const out = {};
      for (const id of ["welcomeWhat", "jumpWhat"]) out[id] = !!document.getElementById(id);
      return out;
    });
    if (!routes.welcomeWhat) fail("the start screen has no route to what this app is and how to install it");
    else if (!routes.jumpWhat) fail("the (i) panel has no route to what this app is and how to install it");
    else {
      const landed = [];
      for (const [id, pre] of [["welcomeWhat", null], ["jumpWhat", "infoBtn"]]) {
        await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
        await page.waitForTimeout(700);
        if (pre) { await page.click(`#${pre}`); await page.waitForTimeout(500); }
        await page.click(`#${id}`);
        await page.waitForTimeout(700);
        landed.push(await page.evaluate(() => {
          const d = document.getElementById("helpDlg");
          const q = document.getElementById("helpQuickStart");
          const i = document.getElementById("helpInstall");
          return { open: !!d?.open, quick: !!(q && q.open), install: !!(i && i.open),
            // the first words of the section, so two COPIES of the prose show up
            // as two different landings rather than as one shared destination
            text: (q?.textContent || "").replace(/\s+/g, " ").trim().slice(0, 90) };
        }));
      }
      const [a, b2] = landed;
      if (!a.open || !b2.open) fail(`a route did not open Help — start screen ${a.open}, (i) ${b2.open}`);
      else if (!a.quick || !a.install || !b2.quick || !b2.install) fail("a route opened Help without expanding what this is and how to install it");
      else if (a.text !== b2.text || !a.text) fail("the two routes land on DIFFERENT words — orientation has been copied, not moved");
      else ok(`both routes open the same orientation, expanded: "${a.text.slice(0, 60)}…"`);
    }
    await page.close();
  }
  /** axe over the page as it stands — serious and critical fail, the rest are
   *  counted. Sections 7 and 8 measure states only a plant can reach, one page
   *  at a time, so they share this rather than each carrying a copy. */
  const axeLine = async (page, line) => {
    await page.addScriptTag({ content: axeSrc });
    const r = await page.evaluate(async (rules) => await window.axe.run(document, { runOnly: rules }), RULES);
    const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    if (serious.length) { fail(`${line}: ${serious.length} serious/critical`); for (const v of serious) for (const n of v.nodes) note(`[${v.impact}] ${v.id}: ${n.target.join(" ")}`); }
    else ok(`${line}: nothing serious or critical${r.violations.length ? ` (${r.violations.length} minor)` : ""}`);
  };
  /** PRESS A SKIP BY KEYBOARD AND SAY WHERE THE FOCUS WENT (decision 075's
   *  review). A Skip hides itself once its read is given up, and a hidden
   *  button that still holds the focus leaves a keyboard or screen-reader
   *  reader on the page's <body>. Read in the press's own task, right after the
   *  app's handler: the browser moves focus off a hidden element only later, so
   *  a focus still ON the pressed button, or on <body>, is the failure. */
  const pressSkipByKeyboard = async (page, id) => {
    await page.evaluate((id) => {
      window.__afterSkip = null;
      document.getElementById(id).addEventListener("click", () => {
        const a = document.activeElement;
        window.__afterSkip = { id: a?.id || a?.tagName || "(none)", same: a === document.getElementById(id), body: !a || a === document.body, shown: !!a && a.getClientRects().length > 0 };
      }, { once: true });
    }, id);
    await page.focus(`#${id}`);
    await page.keyboard.press("Enter");
    await page.waitForFunction(() => window.__afterSkip, null, { timeout: 5000 }).catch(() => {});
    return page.evaluate(() => window.__afterSkip);
  };
  // ── 7 ──────────────────────────────────────────────────
  // THE START SCREEN WHILE THE EDITOR IS BEING PREPARED (decision 071). The
  // start card gained a live region that speaks only when the build is slow, a
  // busy card that waits for it, and a panel for a build the driver refused —
  // three states no other section can reach, because the container builds the
  // editor's graphics in about twenty milliseconds. tools/slow-build.mjs makes
  // the build slow from outside, so every state here is the real app's.
  if (want(7)) console.log("\n7 — the start screen while the editor is being prepared, and when it cannot be");
  if (want(7)) {
    // PRESENT AND EMPTY AT PARSE, or its first words are not announced: a live
    // region created with its text in it is not a change.
    const html = await fetch(`${BASE}/ir.html`).then((r) => r.text());
    if (/<p id="preparing" role="status" aria-live="polite"><\/p>/.test(html)) ok("the preparing line is a live region, present and empty in the page as served");
    else fail("the preparing line is not an empty role=status live region in the page as served");
    for (const theme of THEMES) for (const size of SIZES) {
      const where = `[${theme} ${size.name}]`;
      // A FRESH PAGE HAS NO RECORD OF A BUILD, so this launch expects a cold
      // one and the words are up from the start; eight seconds leaves room to
      // look at the count, then at a photo waiting in the busy card.
      const page = await browser.newPage({ ...size.opts, colorScheme: theme });
      page.on("dialog", (d) => d.accept());
      try {
        await page.addInitScript(slowBuild, { delay: 8000, par: true });
        await page.goto(`${BASE}/ir.html`, { waitUntil: "commit" });
        await page.waitForFunction(() => window.__bw && window.__bw.linkAt > 0 && performance.now() - window.__bw.linkAt > 2300, null, { timeout: 60000, polling: 100 });
        const said = await page.evaluate(() => [document.getElementById("preparing")?.textContent ?? "", document.getElementById("preparingFor")?.textContent ?? ""]);
        if (!said[0]) fail(`${where} the preparing line is empty while the editor is being prepared`);
        else note(`${where} showing: "${said[0]}" "${said[1]}"`);
        await axeLine(page, `ir.html ${where} start screen, preparing`);
        await page.setInputFiles("#welcomeFile", join(EX, "canopy.jpg"));
        await page.waitForFunction(() => document.getElementById("busy")?.open, null, { timeout: 5000 }).catch(() => {});
        const busy = await page.evaluate(() => ({ open: !!document.getElementById("busy")?.open, text: document.getElementById("busyText")?.textContent ?? "", early: !window.__bw.releasedAt }));
        if (!busy.open || !busy.early) fail(`${where} a photo chosen during the build did not raise the busy card before the build ended`);
        else { note(`${where} busy card: "${busy.text}"`); await axeLine(page, `ir.html ${where} busy card, waiting for the editor`); }
      } finally { await page.close(); }
    }
    // THE PANEL FOR A BUILD THE DRIVER REFUSED, which covers the whole page:
    // axe, and its two buttons against the touch minimum.
    for (const theme of THEMES) {
      const page = await browser.newPage({ ...SIZES[1].opts, colorScheme: theme });
      page.on("dialog", (d) => d.accept());
      try {
        await page.addInitScript(slowBuild, { delay: 300, par: true, fail: true });
        await page.goto(`${BASE}/ir.html`, { waitUntil: "commit" });
        const up = await page.waitForFunction(() => document.getElementById("glBroken")?.hidden === false, null, { timeout: 30000 }).then(() => true).catch(() => false);
        if (!up) { fail(`[${theme} phone] a refused build did not raise its panel`); continue; }
        await axeLine(page, `ir.html [${theme} phone] the editor could not get ready`);
        const small = await page.evaluate(() => [...document.querySelectorAll("#glBroken button")].map((b) => { const r = b.getBoundingClientRect(); return { id: b.id, w: Math.round(r.width), h: Math.round(r.height) }; }).filter((b) => b.w < 44 || b.h < 44));
        if (small.length) fail(`[${theme} phone] #glBroken: ${small.map((b) => `${b.id} ${b.w}x${b.h}`).join(" · ")}`);
        else ok(`[${theme} phone] #glBroken: all >= 44`);
      } finally { await page.close(); }
    }
  }
  // ── 8 ──────────────────────────────────────────────────
  // THE BUSY CARD WHILE A KEEP WAITS FOR THE LAST SESSION'S DELETE (decision
  // 075). It gains a count beside its sentence and a button into the report,
  // shown only for as long as that wait lasts — which in a container is never,
  // because a delete here takes milliseconds. tools/slow-storage.mjs holds the
  // delete open and says the browser's allowance is spent, so the state
  // measured is the real app's own, reached by real presses.
  if (want(8)) console.log("\n8 — the busy card while a keep waits for the last session's delete");
  if (want(8)) {
    const tmp = mkdtempSync(join(tmpdir(), "a11y-8-"));
    const cp = (names, off) => names.map((n, i) => { const to = join(tmp, n); copyFileSync(join(EX, ["canopy.jpg", "hillside.jpg", "lodge.jpg"][(i + off) % 3]), to); return to; });
    const SET = cp(["e1.jpg", "e2.jpg"], 0), KEEP = cp(["k1.jpg", "k2.jpg"], 1);
    try {
      for (const theme of THEMES) for (const size of SIZES) {
        const where = `[${theme} ${size.name}]`;
        const page = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
        page.on("dialog", (d) => d.accept());
        try {
          await page.addInitScript(slowStorage, { slow: 9000, estimate: "none" });
          await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
          await page.setInputFiles("#file", SET);
          await page.waitForFunction(() => { const t = [...document.querySelectorAll("#sessionThumbs .session-thumb")]; return t.length === 2 && t.every((x) => !x.disabled) && !document.getElementById("busy").open; }, null, { timeout: 120000 });
          await page.waitForTimeout(800);
          await page.click("#sessionDone");
          await page.waitForFunction(() => document.getElementById("sessionStrip").hidden && !document.getElementById("busy").open, null, { timeout: 60000 });
          await page.setInputFiles("#quickFiles", KEEP);
          await page.waitForFunction(() => (document.getElementById("qlGrid")?.children.length ?? 0) >= 2 && !document.getElementById("qlKeep").disabled && !document.getElementById("qlGrid").dataset.busy, null, { timeout: 120000 });
          await page.click("#qlKeep");
          const up = await page.waitForFunction(() => document.getElementById("busyReport")?.hidden === false, null, { timeout: 8000 }).then(() => true).catch(() => false);
          if (!up) { fail(`${where} the keep's wait never showed the card's report button`); continue; }
          const card = await page.evaluate(() => { const r = document.getElementById("busyReport").getBoundingClientRect(); return { text: document.getElementById("busyText").textContent, count: document.getElementById("busyCount").textContent, w: Math.round(r.width), h: Math.round(r.height) }; });
          note(`${where} busy card: "${card.text}" · "${card.count}" · report button ${card.w}x${card.h}`);
          await axeLine(page, `ir.html ${where} busy card, waiting for the last session's delete`);
          if (card.w >= 44 && card.h >= 44) ok(`${where} #busyReport: ${card.w}x${card.h}`);
          else fail(`${where} #busyReport: ${card.w}x${card.h}, under 44`);
          await page.click("#busyReport");
          await page.waitForFunction(() => document.getElementById("verDlg")?.open, null, { timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(300);
          // ON TOP, BY HIT TEST — `open` alone is true of a report stuck under
          // the card, which is the state this check exists to refuse.
          const onTop = await page.evaluate(() => { const d = document.getElementById("verDlg"); if (!d.open) return false; const r = d.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && d.contains(hit); });
          if (onTop) ok(`${where} pressing it opens the report above the card`);
          else fail(`${where} pressing the card's report button did not bring the report above the card`);
          // WHERE THE FOCUS GOES WHEN THE WAIT ENDS (decision 075's review), one
          // ordering per theme. Dark: the report closed at once, the focus back
          // on the button, and then the wait ends and hides it — read at that
          // moment. Light: the report still open when the wait ends, and closed
          // after — read once it has closed. <body>, or a hidden button, fails.
          const live = () => page.evaluate(() => { const a = document.activeElement; const d = a?.closest("dialog"); return { id: a?.id || a?.tagName || "(none)", body: !a || a === document.body, shown: !!a && a.getClientRects().length > 0 && (!d || d.open) }; });
          if (theme === "dark") {
            await page.keyboard.press("Escape");
            await page.waitForFunction(() => !document.getElementById("verDlg").open, null, { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(200);
            const back = await live();
            await page.evaluate(() => {
              window.__atHide = null;
              const b = document.getElementById("busyReport");
              new MutationObserver((_, mo) => { if (!b.hidden) return; const a = document.activeElement; window.__atHide = { id: a?.id || a?.tagName || "(none)", same: a === b, body: !a || a === document.body, shown: !!a && a.getClientRects().length > 0 }; mo.disconnect(); }).observe(b, { attributes: true, attributeFilter: ["hidden"] });
            });
            await page.waitForFunction(() => window.__atHide, null, { timeout: 60000 }).catch(() => {});
            const at = await page.evaluate(() => window.__atHide);
            if (back.id === "busyReport" && at && !at.same && !at.body && at.shown) ok(`${where} closing the report returns to its button, and when the wait ends and hides it the focus goes to #${at.id}, still on screen`);
            else fail(`${where} the report button's focus at the end of the wait: back on ${back.id} after closing the report; when it hid, ${at ? (at.same ? "still on the hidden button" : at.body ? "on <body>" : `on ${at.id}, not on screen`) : "never hidden"}`);
          } else {
            await page.waitForFunction(() => document.getElementById("busyReport").hidden, null, { timeout: 60000 }).catch(() => {});
            await page.waitForTimeout(500);
            await page.keyboard.press("Escape");
            await page.waitForFunction(() => !document.getElementById("verDlg").open, null, { timeout: 5000 }).catch(() => {});
            await page.waitForTimeout(300);
            const at = await live();
            if (!at.body && at.shown) ok(`${where} the report still open when the wait ended: closing it puts the focus on #${at.id}, on screen`);
            else fail(`${where} the report still open when the wait ended: closing it leaves the focus ${at.body ? "on <body>" : `on ${at.id}, not on screen`}`);
          }
        } finally { await page.close(); }
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  // ── 9 ──────────────────────────────────────────────────
  // THE BUSY CARD OFFERING TO SKIP A FILE THAT HAS NOT FINISHED READING
  // (decision 075's review). Shown only once a file has taken longer than it
  // should — never, in a container, where every read is local. A head read
  // that never arrives is planted from outside, so the offer is the app's own.
  if (want(9)) console.log("\n9 — the busy card offering to skip a file that has not finished reading");
  if (want(9)) {
    const tmp = mkdtempSync(join(tmpdir(), "a11y-9-"));
    const SET = [["s1.jpg", "canopy.jpg"], ["s2-HANGSNIFF.jpg", "hillside.jpg"]].map(([n, from]) => { const to = join(tmp, n); copyFileSync(join(EX, from), to); return to; });
    try {
      for (const theme of THEMES) for (const size of SIZES) {
        const where = `[${theme} ${size.name}]`;
        const page = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
        page.on("dialog", (d) => d.accept());
        try {
          await page.addInitScript(slowStorage, { hangSniff: "HANGSNIFF" });
          await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
          await page.setInputFiles("#file", SET);
          const up = await page.waitForFunction(() => document.getElementById("busySkip")?.hidden === false, null, { timeout: 20000 }).then(() => true).catch(() => false);
          if (!up) { fail(`${where} a file whose head never arrived was never offered to be skipped`); continue; }
          const card = await page.evaluate(() => { const r = document.getElementById("busySkip").getBoundingClientRect(); return { text: document.getElementById("busyText").textContent, label: document.getElementById("busySkip").textContent, w: Math.round(r.width), h: Math.round(r.height) }; });
          note(`${where} busy card: "${card.text}" · "${card.label}" ${card.w}x${card.h}`);
          await axeLine(page, `ir.html ${where} busy card, offering to skip a file`);
          if (card.w >= 44 && card.h >= 44) ok(`${where} #busySkip: ${card.w}x${card.h}`);
          else fail(`${where} #busySkip: ${card.w}x${card.h}, under 44`);
          const went = await pressSkipByKeyboard(page, "busySkip");
          if (went && !went.same && !went.body && went.shown) ok(`${where} pressing #busySkip by keyboard hands the focus to #${went.id}, still on screen`);
          else fail(`${where} pressing #busySkip by keyboard leaves the focus ${went ? (went.same ? "on the hidden button" : went.body ? "on <body>" : `on ${went.id}, not on screen`) : "unread"}`);
        } finally { await page.close(); }
      }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  // ── 10 ─────────────────────────────────────────────────
  // THE SESSION STRIP OFFERING TO SKIP A LATER FILE OF A SET (decision 075's
  // review). Once a set has a photo on screen, a read past its limit is offered
  // beside Done rather than on a card over the editor. The limit is a minute of
  // visible time, so both shapes stall side by side and share it; each is then
  // measured in both themes. The stalled read is planted from outside.
  if (want(10)) console.log("\n10 — the session strip offering to skip a later file of a set");
  if (want(10)) {
    const tmp = mkdtempSync(join(tmpdir(), "a11y-10-"));
    const SET = [["a1.jpg", "canopy.jpg"], ["b2-STALLMID.jpg", "hillside.jpg"], ["c3.jpg", "lodge.jpg"]].map(([n, from]) => { const to = join(tmp, n); copyFileSync(join(EX, from), to); return to; });
    const lines = [];
    const stalled = async (size) => {
      const page = await browser.newPage({ ...size.opts, colorScheme: "dark", serviceWorkers: "block" });
      page.on("dialog", (d) => d.accept());
      try {
        await page.addInitScript(slowStorage, { slowFullRead: { match: "STALLMID", ms: 600000 } });
        await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
        await page.setInputFiles("#file", SET);
        const up = await page.waitForFunction(() => document.getElementById("stripSkip")?.hidden === false, null, { timeout: 90000 }).then(() => true).catch(() => false);
        if (!up) { lines.push(["fail", `[${size.name}] a later file past its limit was never offered in the strip`]); return; }
        for (const theme of THEMES) {
          const where = `[${theme} ${size.name}]`;
          await page.emulateMedia({ colorScheme: theme });
          await page.waitForTimeout(300);
          const m = await page.evaluate(() => {
            const b = document.getElementById("stripSkip"), d = document.getElementById("sessionDone");
            const r = b.getBoundingClientRect(), q = d.getBoundingClientRect();
            const inView = (x) => x.left >= 0 && x.right <= innerWidth + 0.5 && x.top >= 0 && x.bottom <= innerHeight + 0.5;
            return { label: b.textContent, w: Math.round(r.width), h: Math.round(r.height), skipIn: inView(r), doneIn: inView(q), scroll: document.documentElement.scrollWidth > innerWidth, card: document.getElementById("busy").open };
          });
          lines.push(["note", `${where} strip: "${m.label}" ${m.w}x${m.h}; busy card ${m.card ? "UP" : "down"}`]);
          await axeLine(page, `ir.html ${where} the session strip offering to skip a file`);
          lines.push(m.w >= 44 && m.h >= 44 ? ["ok", `${where} #stripSkip: ${m.w}x${m.h}`] : ["fail", `${where} #stripSkip: ${m.w}x${m.h}, under 44`]);
          lines.push(m.skipIn && m.doneIn && !m.scroll ? ["ok", `${where} Skip and Done both inside the window, no sideways scroll`] : ["fail", `${where} Skip ${m.skipIn ? "in" : "OUT OF"} view, Done ${m.doneIn ? "in" : "OUT OF"} view, sideways scroll ${m.scroll}`]);
          lines.push(!m.card ? ["ok", `${where} no card over the editor while it is offered`] : ["fail", `${where} a card is up over the editor while the strip offers Skip`]);
        }
        const went = await pressSkipByKeyboard(page, "stripSkip");
        lines.push(went && !went.same && !went.body && went.shown ? ["ok", `[${size.name}] pressing #stripSkip by keyboard hands the focus to #${went.id}, still on screen`] : ["fail", `[${size.name}] pressing #stripSkip by keyboard leaves the focus ${went ? (went.same ? "on the hidden button" : went.body ? "on <body>" : `on ${went.id}, not on screen`) : "unread"}`]);
      } finally { await page.close(); }
    };
    // A SET OF TWO, where the Skip leaves one photo and the strip hides at the
    // set's end: the control the Skip handed the focus to hides with it, and
    // the focus must go somewhere still on screen, not to <body>.
    const TWO = [SET[0], (() => { const to = join(tmp, "b9-STALLMID.jpg"); copyFileSync(join(EX, "lodge.jpg"), to); return to; })()];
    const stalledTwo = async (size) => {
      const page = await browser.newPage({ ...size.opts, colorScheme: "dark", serviceWorkers: "block" });
      page.on("dialog", (d) => d.accept());
      try {
        await page.addInitScript(slowStorage, { slowFullRead: { match: "STALLMID", ms: 600000 } });
        await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
        await page.setInputFiles("#file", TWO);
        const up = await page.waitForFunction(() => document.getElementById("stripSkip")?.hidden === false, null, { timeout: 90000 }).then(() => true).catch(() => false);
        if (!up) { lines.push(["fail", `[${size.name}, a set of two] the second file past its limit was never offered in the strip`]); return; }
        await pressSkipByKeyboard(page, "stripSkip");
        await page.waitForFunction(() => document.getElementById("sessionStrip").hidden && !document.getElementById("busy").open, null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(500);
        const at = await page.evaluate(() => { const a = document.activeElement; const d = a?.closest("dialog"); return { id: a?.id || a?.tagName || "(none)", body: !a || a === document.body, shown: !!a && a.getClientRects().length > 0 && (!d || d.open), strip: document.getElementById("sessionStrip").hidden }; });
        lines.push(at.strip && !at.body && at.shown ? ["ok", `[${size.name}, a set of two] after the Skip the strip hid with one photo left, and the focus is on #${at.id}, on screen`] : ["fail", `[${size.name}, a set of two] after the Skip ${at.strip ? "the strip hid and" : "the strip is STILL up and"} the focus is ${at.body ? "on <body>" : `on ${at.id}, not on screen`}`]);
      } finally { await page.close(); }
    };
    try {
      // The axe lines print as they run; the rest are gathered and printed after.
      await Promise.all([...SIZES.map((size) => stalled(size)), ...SIZES.map((size) => stalledTwo(size))]);
      for (const [kind, line] of lines) (kind === "ok" ? ok : kind === "fail" ? fail : note)(line);
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  // ── 11 ─────────────────────────────────────────────────
  // THE LINE THAT SAYS THE LOOK'S SKY IS STILL BEING REFINED (decision 089).
  // Under Aerochrome the sky colour reaches the picture after it: the sky map
  // lane builds a coarse map and then the full one, seconds apart on a tablet,
  // and a standing line in the stage says so in words between the ask and the
  // answer. It is a surface of its own (a live region over the photograph, in
  // none of the pages' dialogs), so it joins the sweep here, in the commit that
  // creates it. The state is the app's own and is reached by the app's own
  // presses: a practice raw, the Aerochrome button, and the lane's real build,
  // which takes seconds in a container too. Every check polls the page's TEXT,
  // synchronous DOM state, never a promise or a worker's answer.
  // SINCE 2026-10-17 THE AEROCHROME PRESS ALONE BRINGS NO LINE (decision 087,
  // Outcome): the look carries no sky stage, so the section first asserts the line
  // stays empty after the press, then moves the Sky colour smoothing slider by hand,
  // which is the route to the line that is left, and measures the surface there.
  if (want(11)) console.log("\n11 — the line that says the look's sky is still being refined");
  if (want(11)) {
    // PRESENT AND EMPTY AT PARSE, or its first words are not announced: a live
    // region created, or revealed, with its text in it is not a change.
    const html = await fetch(`${BASE}/ir.html`).then((r) => r.text());
    if (/<p id="skyRefine" role="status" aria-live="polite" aria-atomic="true"><\/p>/.test(html)) ok("the refining line is a live region, present and empty in the page as served");
    else fail("the refining line is not an empty role=status live region in the page as served");
    for (const theme of THEMES) for (const size of SIZES) {
      const where = `[${theme} ${size.name}]`;
      const page = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
      page.on("dialog", (d) => d.accept());
      try {
        await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
        const standing = await page.evaluate(() => {
          const el = document.getElementById("skyRefine");
          return !el ? null : { text: el.textContent, hiddenAncestor: !!el.closest("[hidden]"), live: el.getAttribute("aria-live"), role: el.getAttribute("role"), shown: getComputedStyle(el).display !== "none" };
        });
        if (!standing) { fail(`${where} there is no #skyRefine on ir.html`); continue; }
        if (standing.text !== "" || standing.hiddenAncestor || !standing.shown || standing.live !== "polite" || standing.role !== "status") {
          fail(`${where} #skyRefine at rest: text "${standing.text}", inside something hidden ${standing.hiddenAncestor}, rendered ${standing.shown}, aria-live ${standing.live}, role ${standing.role}`);
          continue;
        }
        ok(`${where} #skyRefine at rest: empty, rendered, not inside anything hidden, polite status`);
        await page.setInputFiles("#file", ONE);
        await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 120000 });
        await page.waitForTimeout(1500);
        await page.evaluate(() => { document.querySelector("#ptab-ir")?.click(); document.querySelector("#lookEir")?.click(); });
        // AEROCHROME ASKS FOR NO SKY MAP SINCE 2026-10-17 (decision 087, Outcome): the
        // look carries no Sky saturation and no Sky colour smoothing, so nothing asks
        // the sky lane for a map and the line stays empty. This is the check that
        // used to wait for the line to come up; it now asserts the line is GONE after
        // the press. The window is a time because the absence of a line has no event
        // to wait for: 20 s, against the seconds this practice raw's lane took to
        // bring the line up under the build that still asked (the failing line of the
        // control run prints that time).
        const goneAfter = 20000;
        const pressed = Date.now();
        const cameUp = await page.waitForFunction(() => (document.getElementById("skyRefine")?.textContent ?? "").length > 0, null, { timeout: goneAfter, polling: 200 }).then(() => true).catch(() => false);
        if (cameUp) { fail(`${where} the line came up ${Date.now() - pressed} ms after Aerochrome was pressed, so the look asks the sky lane for a map again`); continue; }
        ok(`${where} the line stayed empty for ${goneAfter / 1000} s after Aerochrome was pressed: the look asks for no sky map`);
        // THE LINE STILL APPEARS FOR A READER WHO MOVES THE SKY COLOUR SMOOTHING (or the
        // Sky depth) SLIDER BY HAND, because those two stages still read the map, and
        // the surface is measured there: the same slider the reader has, moved the same
        // way, and the lane's real build. The words come a moment after the lane is
        // asked, and stay until its full answer lands. Polled as text.
        await page.evaluate(() => { const el = document.getElementById("skySmooth"); el.value = "1"; el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
        const up = await page.waitForFunction(() => (document.getElementById("skyRefine")?.textContent ?? "").length > 0, null, { timeout: 120000, polling: 200 }).then(() => true).catch(() => false);
        if (!up) { fail(`${where} the line never said the sky was being refined after the Sky colour smoothing slider was moved to 1 by hand`); continue; }
        const m = await page.evaluate(() => {
          const el = document.getElementById("skyRefine");
          const cs = getComputedStyle(el);
          const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          const fg = parse(cs.color), bg = parse(cs.backgroundColor);
          const a = bg.length > 3 ? bg[3] : 1;
          // THE WORST BACKDROP FOR LIGHT TEXT ON DARK GLASS is a white picture behind it.
          const worst = [0, 1, 2].map((i) => bg[i] * a + 255 * (1 - a));
          const L1 = lum(fg), L2 = lum(worst);
          const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
          const r = el.getBoundingClientRect();
          // Every control's box, now, and again with the line emptied and refilled in the same task.
          const boxes = () => [...document.querySelectorAll("button, input, select, textarea, a[href], [role=tab]")].filter((n) => n.getClientRects().length).map((n) => { const b = n.getBoundingClientRect(); return [n.id || n.tagName, Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)].join(":"); });
          const words = el.textContent;
          const withLine = boxes();
          el.textContent = "";
          const without = boxes();
          el.textContent = words;
          const moved = withLine.filter((x, i) => x !== without[i]);
          // WHAT IS UNDER THE MIDDLE OF THE LINE, by hit test: it must not be the line.
          const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { words, fontPx: parseFloat(cs.fontSize), ratio: Math.round(ratio * 100) / 100, position: cs.position, pe: cs.pointerEvents, moved, takesTap: hit === el, inView: r.left >= 0 && r.right <= innerWidth + 0.5 && r.top >= 0 && r.bottom <= innerHeight + 0.5, scroll: document.documentElement.scrollWidth > innerWidth, anim: cs.animationName, trans: cs.transitionDuration };
        });
        note(`${where} the line says: "${m.words}" (${m.fontPx}px, ${m.ratio}:1 over the worst backdrop)`);
        if (m.words.trim().length >= 12) ok(`${where} the meaning is in words`); else fail(`${where} the line's words are too short to say anything: "${m.words}"`);
        if (m.fontPx >= 11) ok(`${where} text is ${m.fontPx}px, at or over the 11px floor`); else fail(`${where} text is ${m.fontPx}px, under the 11px floor`);
        if (m.ratio >= 4.5) ok(`${where} text reads ${m.ratio}:1 over the worst backdrop`); else fail(`${where} text reads ${m.ratio}:1 over the worst backdrop, under 4.5`);
        if (m.position === "absolute" && m.moved.length === 0) ok(`${where} absolutely placed, and emptying then refilling it moves no control`); else fail(`${where} position ${m.position}; controls moved by it: ${m.moved.join(" ")}`);
        if (m.pe === "none" && !m.takesTap) ok(`${where} takes no tap (pointer-events none)`); else fail(`${where} pointer-events ${m.pe}, takes a tap ${m.takesTap}`);
        if (m.inView && !m.scroll) ok(`${where} wholly inside the window, no sideways scroll`); else fail(`${where} line in view ${m.inView}, sideways scroll ${m.scroll}`);
        if ((m.anim === "none" || m.anim === "") && /^0s(, 0s)*$/.test(m.trans)) ok(`${where} no animation and no transition, so nothing for reduced motion to switch off`); else fail(`${where} animation "${m.anim}", transition "${m.trans}"`);
        await axeLine(page, `ir.html ${where} the editor while the look's sky is being refined`);
        // AND IT GOES: the full map lands and the line empties. Polled as text.
        const gone = await page.waitForFunction(() => (document.getElementById("skyRefine")?.textContent ?? "") === "", null, { timeout: 300000, polling: 500 }).then(() => true).catch(() => false);
        if (gone) ok(`${where} the line emptied when the sky was done`); else fail(`${where} the line was still up five minutes after the Sky colour smoothing slider was moved`);
      } finally { await page.close(); }
    }
  }
  // ── 12 ─────────────────────────────────────────────────
  // THE BALANCE CONTROLS (decisions 101 and 102): Temperature (in kelvin) and Tint above the three gains, a
  // typed number beside each, the profile switch above them and the door that loads a profile below them, the
  // line that says which profile the figures are read through, the hold, the standing line that says a balance
  // is held and names it, and the exit beside it. A new surface joins the sweep in the commit that creates it,
  // so this section is that commit's share.
  //
  // WHAT IT ASSERTS, each as a standing claim. The controls exist in the Basic tab, named in words, 44px or
  // more where a finger lands; the typed boxes and the name box paint from the calibrated tokens (the text,
  // the ground and the rail are the tokens' own values, and clear 4.5 and 3 to 1); no input among them
  // carries a placeholder; the hold's announcements go to a live region that is in the page as served,
  // empty, and outside anything hidden; and Temperature, in kelvin since record 102, moves the gains the way
  // the claim says (a warmer white is red up against blue, and the sum of the three track positions, which is
  // their geometric mean, stays put), with each thumb saying its reading in words, the line under the sliders
  // naming the profile the figure goes through (in the page, and not as a note), the profile switch listing
  // what is available and showing the one in force, and the door answering a file that is not for this
  // photograph's camera, and one that is not a profile at all, in words, without moving a figure.
  //
  // THE STANDING LINE IS ASSERTED WHERE EVERY TAB AND THE STAGE SHOW IT, which is the claim a first build
  // got wrong by putting it inside the Basic tab: a state that changes what every raw opens at, visible from
  // one of twelve tabs, is not standing. So the strip that holds the sentence and the exit is asserted to be
  // in the page as served before both the stage and the panel, hidden at rest, and, once a balance is held,
  // outside the panel and the stage, spanning both, above the photograph and not over it, readable (the text
  // token, 4.5 to 1), and still SHOWN with a different tab open and the Basic section not showing, with the
  // exit on the screen and the topmost thing at its centre (reachable by TOUCH on the phone shape: a tap, not
  // a click). The exit is pressed from that other tab and the gains are asserted back at the positions the
  // photograph opened at. Run in both themes and both shapes.
  if (want(12)) console.log("\n12 — Temperature and Tint, the hold, the standing line and the way out of it");
  if (want(12)) {
    const html = await fetch(`${BASE}/ir.html`).then((r) => r.text());
    if (/<p id="balLive" class="sr-only" role="status" aria-live="polite" aria-atomic="true"><\/p>/.test(html)) ok("the hold's announcements go to a live region, present and empty in the page as served");
    else fail("the hold's live region is not an empty role=status live region in the page as served");
    const tags = [...html.matchAll(/<(?:input|button)\b[^>]*\bid="(?:balT|balTi|balTNum|balTiNum|balName|balHoldBtn|balApply|balBack|profLoadBtn|profForgetBtn)"[^>]*>/g)].map((m) => m[0]);
    if (tags.length === 10 && !tags.some((t) => /\bplaceholder\s*=/.test(t))) ok("the ten balance controls are in the page as served and none carries a placeholder");
    else fail(`the balance controls in the page as served: ${tags.length} of 10 found, ${tags.filter((t) => /\bplaceholder\s*=/.test(t)).length} with a placeholder`);
    if (/<select id="balProfile"><\/select>/.test(html) && /<p id="balScale" class="bal-scale"><\/p>/.test(html) && !/<p id="balScale"[^>]*\bclass="[^"]*\bnote\b/.test(html)) ok("the profile switch and the line under the sliders are in the page as served, and the line is not a note");
    else fail("the profile switch or the line under the sliders is missing from the page as served, or the line is a note");
    const stripAt = html.indexOf('<div id="balStrip" class="bal-strip" hidden>');
    const stageAt = html.indexOf('<main id="stage">');
    const panelAt = html.indexOf('<aside id="panel"');
    const sentenceAt = html.indexOf('<p id="balHeld"');
    const exitAt = html.indexOf('<button id="balBack"');
    if (stripAt > 0 && stageAt > stripAt && panelAt > stageAt && sentenceAt > stripAt && exitAt > sentenceAt && exitAt < stageAt) ok("the standing strip is in the page as served before the stage and the panel, hidden, and holds the sentence and then the exit");
    else fail(`the standing strip in the page as served: strip at ${stripAt}, sentence at ${sentenceAt}, exit at ${exitAt}, stage at ${stageAt}, panel at ${panelAt}`);
    /** WHAT FIVE STEPS OF THE TEMPERATURE SLIDER TO THE RIGHT HAVE TO DO, by the route the swap decides (record 104). Takes `where` (the state's label), `swapOn` (whether the
     *  red and blue swap is on), the three gain slider positions before and after (`g0`, `g1`), and the two boxes before and after (`b0`, `b1`, each with `kelvin`). Prints one
     *  ok or FAIL line; returns nothing.
     *  SWAP OFF: the camera-space gains move, red goes up against blue and the sum of the three track positions (the gains' geometric mean, the picture's overall level) stays. The
     *  gains move on whole positions of a 1300-step track and five steps of the thumb are a few mired, so the first run of this section (step 208) read red up by one, green down
     *  by one and blue where it was (585/674/726 to 586/673/726): red minus blue is what is read, and it has to grow while the sum stays.
     *  SWAP ON: the move goes to the screen-side gains (`params.wbScreen`), which no control holds, so it is read in two parts that only the screen-side gains can satisfy
     *  together: the camera-space positions are EXACTLY what they were, and the white the box names (the white of both sets of gains) is five mired warmer. The thumb is one
     *  step to a mired, and the boxes are whole kelvin, so the allowance is one mired plus what rounding each box to a kelvin can hide at that white. A press that moved nothing
     *  fails both parts, and so does a press that moved the camera-space gains with the swap on. */
    const judgeWarmer = (where, swapOn, g0, g1, b0, b1) => {
      const sum = (g) => g[0] + g[1] + g[2];
      if (swapOn) {
        const by = 1e6 / b0.kelvin - 1e6 / b1.kelvin;
        const tol = 1 + 0.5e6 / (b0.kelvin * b0.kelvin) + 0.5e6 / (b1.kelvin * b1.kelvin);
        if (g1.join("/") === g0.join("/") && Math.abs(by - 5) <= tol) ok(`${where} with the swap on, Temperature +5 steps warmer left the camera gains at ${g0.join("/")} and moved the white ${by.toFixed(1)} mired warmer (${b0.kelvin} K to ${b1.kelvin} K), so the move went to the screen-side gains`);
        else fail(`${where} with the swap on, Temperature +5 moved the camera gains ${g0.join("/")} to ${g1.join("/")} and the white ${by.toFixed(1)} mired warmer (${b0.kelvin} K to ${b1.kelvin} K); the gains should not move and the white should move 5 mired, within ${tol.toFixed(1)}`);
      } else {
        const r0 = g0[0] - g0[2], r1 = g1[0] - g1[2];
        if (r1 > r0 && sum(g1) === sum(g0)) ok(`${where} with the swap off, Temperature +5 steps warmer put red up against blue (red minus blue ${r0} to ${r1}, gains ${g0.join("/")} to ${g1.join("/")}); the three positions still sum to ${sum(g1)}`);
        else fail(`${where} with the swap off, Temperature +5 moved the gains ${g0.join("/")} to ${g1.join("/")} (red minus blue ${r0} to ${r1}, sum ${sum(g0)} to ${sum(g1)})`);
      }
    };
    for (const theme of THEMES) for (const size of SIZES) {
      const where = `[${theme} ${size.name}]`;
      const page = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
      page.on("dialog", (d) => d.accept());
      if (PLANT_TEMPERATURE) await page.addInitScript(() => { for (const type of ["input", "change"]) window.addEventListener(type, (e) => { if (e.target && e.target.id === "balT") e.stopImmediatePropagation(); }, true); });
      const press = (sel) => (size.name === "phone" ? page.tap(sel) : page.click(sel));
      try {
        await page.goto(`${BASE}/ir.html`, { waitUntil: "load" });
        const standing = await page.evaluate(() => {
          const el = document.getElementById("balLive");
          return !el ? null : { text: el.textContent, hiddenAncestor: !!el.closest("[hidden]"), live: el.getAttribute("aria-live"), role: el.getAttribute("role"), shown: getComputedStyle(el).display !== "none" };
        });
        if (!standing || standing.text !== "" || standing.hiddenAncestor || !standing.shown || standing.live !== "polite" || standing.role !== "status") { fail(`${where} #balLive at rest: ${JSON.stringify(standing)}`); continue; }
        ok(`${where} #balLive at rest: empty, rendered, outside anything hidden, a polite status`);
        await page.setInputFiles("#file", ONE);
        await page.waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 300000 });
        await page.waitForTimeout(1500);
        await page.evaluate(COMPOSITE);
        await page.evaluate(() => document.getElementById("ptab-basic")?.click());
        await page.waitForTimeout(300);
        const gains = () => page.evaluate(() => ["wbR", "wbG", "wbB"].map((i) => Number(document.getElementById(i).value)));
        const opened = await gains();
        // 1 — present, named in words, and big enough to land on.
        const at = await page.evaluate(() => {
          const q = (id) => document.getElementById(id);
          const label = (id) => (q(id)?.closest("label")?.textContent ?? "").replace(/\s+/g, " ").trim();
          const box = (id) => { const r = q(id).getBoundingClientRect(); return { w: Math.round(r.width), h: Math.round(r.height), fontPx: parseFloat(getComputedStyle(q(id)).fontSize) }; };
          return {
            inBasic: ["balT", "balTi", "balTNum", "balTiNum", "balHoldBtn", "balName", "balApply", "balProfile", "profLoadBtn", "balScale"].every((id) => !!q(id)?.closest("#sec-basic")),
            sliderNames: [label("balT"), label("balTi"), label("balProfile")],
            typedNames: [q("balTNum").getAttribute("aria-label") ?? "", q("balTiNum").getAttribute("aria-label") ?? ""],
            nameLabel: label("balName"),
            buttons: ["balHoldBtn", "balApply", "profLoadBtn"].map((id) => [id, (q(id).textContent ?? "").trim(), box(id)]),
            boxes: ["balTNum", "balTiNum", "balName", "balProfile"].map((id) => [id, box(id)]),
            sliders: ["balT", "balTi"].map((id) => [id, box(id)]),
            exitHiddenAtRest: q("balStrip").hidden && q("balStrip").getClientRects().length === 0 && q("balHeld").textContent === "" && q("balHoldBtn").getAttribute("aria-pressed") === "false" && q("balApply").disabled,
            keptHiddenAtRest: q("balKeptRow").hidden,
            numbers: q("balTNum").type === "number" && q("balTiNum").type === "number",
          };
        });
        if (at.inBasic) ok(`${where} Temperature, Tint, their boxes, the profile switch, the line and the door, the hold, the name and the set button are all in the Basic tab`); else fail(`${where} some balance control is outside the Basic tab`);
        if (at.sliderNames.every((n) => n.length >= 8) && at.typedNames.every((n) => n.length >= 10) && at.nameLabel.length >= 10) ok(`${where} named in words: "${at.sliderNames.join('", "')}", boxes "${at.typedNames.join('", "')}", "${at.nameLabel}"`);
        else fail(`${where} a balance control's name is too short to say what it is: ${JSON.stringify([at.sliderNames, at.typedNames, at.nameLabel])}`);
        const small = [...at.buttons.filter(([, , b]) => b.w < 44 || b.h < 44).map(([id, , b]) => `#${id} ${b.w}x${b.h}`), ...at.boxes.filter(([, b]) => b.h < 44).map(([id, b]) => `#${id} ${b.w}x${b.h}`), ...at.sliders.filter(([, b]) => b.h < 28).map(([id, b]) => `#${id} ${b.w}x${b.h}`)];
        if (small.length) fail(`${where} under the floor: ${small.join(" · ")}`); else ok(`${where} buttons and boxes are 44px or more, the sliders have the app's own 28px track`);
        const tiny = at.boxes.filter(([, b]) => b.fontPx < 16).map(([id, b]) => `#${id} ${b.fontPx}px`);
        if (tiny.length) fail(`${where} type under 16px, which makes iOS zoom the page on focus: ${tiny.join(" · ")}`); else ok(`${where} the boxes' type is 16px or more`);
        if (at.exitHiddenAtRest && at.keptHiddenAtRest && at.numbers) ok(`${where} at rest nothing is held: the standing strip is hidden and takes no row, the hold is unpressed, the set button is off, the kept list is hidden`);
        else fail(`${where} the controls at rest: ${JSON.stringify({ exitHiddenAtRest: at.exitHiddenAtRest, keptHiddenAtRest: at.keptHiddenAtRest, numbers: at.numbers })}`);
        // 2 — painted from the calibrated tokens, and clearing the floors.
        const paint = await page.evaluate(() => {
          const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
          const token = (prop, name) => { const p = document.createElement("span"); p.style[prop] = `var(${name})`; document.body.append(p); const v = rgb(getComputedStyle(p)[prop]); p.remove(); return v; };
          const same = (a, b) => a.length === 3 && b.length === 3 && a.every((v, i) => Math.abs(v - b[i]) <= 1);
          const out = [];
          for (const id of ["balTNum", "balTiNum", "balName"]) {
            const el = document.getElementById(id), cs = getComputedStyle(el);
            const fg = rgb(cs.color), bg = rgb(cs.backgroundColor), rail = rgb(cs.borderTopColor), ground = window.__composited(el.parentElement);
            out.push({ id, text: same(fg, token("color", "--txt")), ground: same(bg, token("backgroundColor", "--surface-2")), rail: same(rail, token("borderTopColor", "--line-2")), textRatio: Math.round(ratio(fg, bg) * 100) / 100, railRatio: Math.round(ratio(rail, ground) * 100) / 100 });
          }
          for (const id of ["balT", "balTi"]) {
            const lab = document.getElementById(id).closest("label"), cs = getComputedStyle(lab);
            out.push({ id: `${id} label`, text: same(rgb(cs.color), token("color", "--txt-2")), ground: true, rail: true, textRatio: Math.round(ratio(rgb(cs.color), window.__composited(lab)) * 100) / 100, railRatio: 99 });
          }
          // The line under the sliders (record 102): the second text token on the panel's ground, like the labels above it.
          const scale = document.getElementById("balScale"), scs = getComputedStyle(scale);
          out.push({ id: "balScale", text: same(rgb(scs.color), token("color", "--txt-2")), ground: true, rail: true, textRatio: Math.round(ratio(rgb(scs.color), window.__composited(scale)) * 100) / 100, railRatio: 99 });
          return out;
        });
        for (const p of paint) {
          if (p.text && p.ground && p.rail) ok(`${where} #${p.id} paints from the tokens (text, ground, rail)`); else fail(`${where} #${p.id} paints a colour of its own: token text ${p.text}, ground ${p.ground}, rail ${p.rail}`);
          if (p.textRatio >= 4.5 && p.railRatio >= 3) ok(`${where} #${p.id} text ${p.textRatio}:1 and rail ${p.railRatio === 99 ? "n/a" : p.railRatio + ":1"}`); else fail(`${where} #${p.id} text ${p.textRatio}:1 (floor 4.5), rail ${p.railRatio}:1 (floor 3)`);
        }
        // 1b — THE PROFILE SWITCH (record 102): a real select, at least one entry, each entry in words, one selected, and the line under the
        // sliders names the one selected and is words in the page and not a note.
        const prof = await page.evaluate(() => {
          const sel = document.getElementById("balProfile"), line = document.getElementById("balScale");
          const opts = [...sel.options].map((o) => o.textContent ?? "");
          return { tag: sel.tagName, count: opts.length, opts, selected: sel.options[sel.selectedIndex]?.textContent ?? "", line: line.textContent ?? "", lineIsNote: line.classList.contains("note"), lineShown: line.getClientRects().length > 0, rowShown: document.getElementById("balProfileRow").getClientRects().length > 0, doorShown: document.getElementById("balDoor").getClientRects().length > 0, forgetHidden: document.getElementById("profForgetBtn").hidden };
        });
        if (prof.tag === "SELECT" && prof.count >= 1 && prof.opts.every((t) => t.length >= 8) && prof.selected && prof.rowShown && prof.doorShown) ok(`${where} the profile switch is a select that lists ${prof.count} (${prof.opts.map((t) => `"${t}"`).join(", ")}) and shows "${prof.selected}"`);
        else fail(`${where} the profile switch: ${JSON.stringify(prof)}`);
        if (/^Read /.test(prof.line) && prof.line.includes(prof.selected.replace(/ \((?:in this file|loaded|no profile)\)$/, "")) && !prof.lineIsNote && prof.lineShown) ok(`${where} the line under the sliders names the profile in force and is not a note: "${prof.line}"`);
        else fail(`${where} the line under the sliders reads "${prof.line}" for the selected "${prof.selected}" (a note ${prof.lineIsNote}, shown ${prof.lineShown})`);
        if (prof.forgetHidden) ok(`${where} the forget button is hidden while the profile in force is not one the reader loaded`); else fail(`${where} the forget button shows for a profile the reader did not load`);
        // 3 — one state, and in kelvin (record 102): five steps of the Temperature slider to the right are a warmer white, so red goes up
        // against blue (swap off), or the screen-side gains move by five mired and the camera-space gains stay (swap on, record 104); the typed
        // Kelvin box reads a higher number, the thumb says its reading in words, and Tint keeps its reading to within the grid.
        const boxesNow = () => page.evaluate(() => ({ kelvin: Number(document.getElementById("balTNum").value), tint: Number(document.getElementById("balTiNum").value), valuetext: document.getElementById("balT").getAttribute("aria-valuetext") ?? "", tintText: document.getElementById("balTi").getAttribute("aria-valuetext") ?? "" }));
        // THE PRESS IS JUDGED BY THE ROUTE THE SWAP DECIDES (record 104, `judgeWarmer` above the loop): with the swap off it moves the camera-space
        // gains, with the swap on, which is how a raw opens, it moves the screen-side gains and leaves the camera-space ones exactly where they were.
        // Step 7 below takes the other route too, so both are read in every state.
        const swapPressed = () => page.evaluate(() => document.getElementById("swapBtn")?.getAttribute("aria-pressed") === "true");
        const warmer = async () => {
          await page.evaluate(() => { const el = document.getElementById("balT"); el.value = String(Number(el.value) + 5); el.dispatchEvent(new Event("input", { bubbles: true })); el.dispatchEvent(new Event("change", { bubbles: true })); });
          await page.waitForTimeout(300);
        };
        const swapOn = await swapPressed();
        const before = await boxesNow();
        await warmer();
        const moved = await gains();
        const typed = await boxesNow();
        judgeWarmer(where, swapOn, opened, moved, before, typed);
        if (Number.isFinite(before.kelvin) && typed.kelvin > before.kelvin) ok(`${where} the typed Temperature box follows the gains in kelvin (${before.kelvin} to ${typed.kelvin})`); else fail(`${where} the typed Temperature box reads ${typed.kelvin} after reading ${before.kelvin}; five steps warmer should read higher`);
        if (typed.valuetext === `${typed.kelvin} kelvin` && /^tint -?\d+$/.test(typed.tintText)) ok(`${where} the thumbs say their readings in words ("${typed.valuetext}", "${typed.tintText}")`); else fail(`${where} the thumbs' spoken values are "${typed.valuetext}" and "${typed.tintText}", the boxes read ${typed.kelvin} and ${typed.tint}`);
        if (Math.abs(typed.tint - before.tint) <= 2) ok(`${where} Tint kept its reading while Temperature moved (${before.tint} to ${typed.tint})`); else fail(`${where} Temperature moved Tint from ${before.tint} to ${typed.tint}`);
        // 3b — THE DOOR. A profile whose camera is not this photograph's is kept and not offered, and the live region says so in words; a file that
        // is not a profile is named as such; neither moves a figure. The practice file names no camera at all, so no profile can be for it.
        const stand = Buffer.alloc(320);
        stand.write("II", 0, "latin1"); stand.writeUInt16LE(17234, 2); stand.writeUInt32LE(8, 4); stand.writeUInt16LE(5, 8);
        const entry = (n, tag, type, count, value) => { const at = 10 + n * 12; stand.writeUInt16LE(tag, at); stand.writeUInt16LE(type, at + 2); stand.writeUInt32LE(count, at + 4); stand.writeUInt32LE(value, at + 8); };
        entry(0, 50708, 2, 12, 100); entry(1, 50721, 10, 9, 120); entry(2, 50778, 3, 1, 21); entry(3, 50779, 3, 1, 21); entry(4, 50936, 2, 14, 200);
        stand.writeUInt32LE(0, 10 + 5 * 12);
        stand.write("Walk Camera\0", 100, "latin1"); stand.write("Walk profile\0\0", 200, "latin1");
        [1, 0, 0, 0, 1, 0, 0, 0, 1].forEach((v, i) => { stand.writeInt32LE(v, 120 + i * 8); stand.writeInt32LE(1, 124 + i * 8); });
        const boxesBefore = await boxesNow();
        await page.setInputFiles("#profFile", { name: "walk.dcp", mimeType: "application/octet-stream", buffer: stand });
        const said = await page.waitForFunction(() => /camera profile/.test(document.getElementById("balLive")?.textContent ?? ""), null, { timeout: 10000 }).then(() => page.evaluate(() => document.getElementById("balLive").textContent)).catch(() => "");
        if (/kept on this device/.test(said) && /None is for this photograph's camera/.test(said)) ok(`${where} loading a profile for another camera says so in words: "${said}"`); else fail(`${where} loading a profile for another camera announced "${said}"`);
        await page.setInputFiles("#profFile", { name: "walk.jpg", mimeType: "image/jpeg", buffer: Buffer.from("not a profile at all, just some text that is long enough to read") });
        const refused = await page.waitForFunction(() => /not a camera profile|could not be read|names no camera/.test(document.getElementById("balLive")?.textContent ?? ""), null, { timeout: 10000 }).then(() => true).catch(() => false);
        if (refused) ok(`${where} a file that is not a camera profile is named as such in the live region`); else fail(`${where} a file that is not a camera profile was not refused in words`);
        const boxesAfter = await boxesNow();
        if (boxesAfter.kelvin === boxesBefore.kelvin && boxesAfter.tint === boxesBefore.tint) ok(`${where} loading profiles moved no figure (${boxesAfter.kelvin} K, tint ${boxesAfter.tint})`); else fail(`${where} loading profiles moved the figures from ${boxesBefore.kelvin} K and ${boxesBefore.tint} to ${boxesAfter.kelvin} K and ${boxesAfter.tint}`);
        // 4 — hold it, and the standing line, the exit, the set button and the announcement all follow.
        await press("#balHoldBtn");
        const heldUp = await page.waitForFunction(() => document.getElementById("balHoldBtn").getAttribute("aria-pressed") === "true" && !document.getElementById("balStrip").hidden && (document.getElementById("balLive").textContent ?? "").length > 0, null, { timeout: 10000 }).then(() => true).catch(() => false);
        if (!heldUp) { fail(`${where} pressing Hold did not show the standing strip and announce`); continue; }
        const held = await page.evaluate(() => {
          const q = (id) => document.getElementById(id);
          const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          const line = q("balHeld"), cs = getComputedStyle(line);
          const fg = rgb(cs.color), bg = window.__composited(line);
          const x = lum(fg), y = lum(bg);
          const probe = document.createElement("span"); probe.style.color = "var(--txt)"; document.body.append(probe); const txt = rgb(getComputedStyle(probe).color); probe.remove();
          const row = q("balKept").querySelector("button.mask-pick");
          const strip = q("balStrip"), sr = strip.getBoundingClientRect(), gr = q("stage").getBoundingClientRect(), pr = q("panel").getBoundingClientRect();
          return {
            stripOutside: !strip.closest("#panel") && !strip.closest("#stage") && strip.getClientRects().length > 0,
            stripSpans: sr.left <= gr.left + 1 && sr.right >= Math.max(gr.right, pr.right) - 1,
            stripAbove: sr.bottom <= gr.top + 1 && sr.height > 0,
            stripBox: `${Math.round(sr.left)},${Math.round(sr.top)} ${Math.round(sr.width)}x${Math.round(sr.height)} against the stage at ${Math.round(gr.left)},${Math.round(gr.top)} and the panel's right edge at ${Math.round(pr.right)}`,
            words: line.textContent, fontPx: parseFloat(cs.fontSize), ratio: Math.round(((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)) * 100) / 100, token: fg.every((v, i) => Math.abs(v - txt[i]) <= 1),
            live: q("balLive").textContent, exitShown: !strip.hidden && q("balBack").getClientRects().length > 0, exitLabel: (q("balBack").textContent ?? "").trim(),
            applyOn: !q("balApply").disabled, nameKept: q("balName").value, keptShown: !q("balKeptRow").hidden, keptRow: row ? { text: row.textContent, pressed: row.getAttribute("aria-pressed") } : null,
          };
        });
        note(`${where} the standing line says: "${held.words}" (${held.fontPx}px, ${held.ratio}:1), announced: "${held.live}"`);
        if (held.words.trim().length >= 12 && held.words.includes(held.nameKept)) ok(`${where} the standing line is words and names the balance`); else fail(`${where} the standing line is "${held.words}", the name box says "${held.nameKept}"`);
        if (held.stripOutside && held.stripSpans && held.stripAbove) ok(`${where} the standing strip is outside the panel and the stage, spans both, and sits above the photograph (${held.stripBox})`);
        else fail(`${where} the standing strip is not where every tab and the stage show it: outside ${held.stripOutside}, spans both ${held.stripSpans}, above the stage ${held.stripAbove} (${held.stripBox})`);
        if (held.ratio >= 4.5 && held.token && held.fontPx >= 11) ok(`${where} the standing line is the --txt token, ${held.ratio}:1, ${held.fontPx}px`); else fail(`${where} the standing line reads ${held.ratio}:1 at ${held.fontPx}px, token text ${held.token}`);
        if (held.exitShown && held.exitLabel.length >= 12 && held.applyOn && held.keptShown && held.keptRow && held.keptRow.pressed === "true" && /^Held/.test(held.keptRow.text)) ok(`${where} held: the exit "${held.exitLabel}" is shown, the set button is on, the kept list says Held in words`);
        else fail(`${where} held, the controls read ${JSON.stringify({ exitShown: held.exitShown, exitLabel: held.exitLabel, applyOn: held.applyOn, keptShown: held.keptShown, keptRow: held.keptRow })}`);
        const inside = await page.evaluate(HIT);
        if (inside.small.length) fail(`${where} held, under 44: ${inside.small.join(" · ")}`); else ok(`${where} held: every button, the exit and the kept rows included, is 44 or more`);
        await axeLine(page, `ir.html ${where} the Basic tab with a balance held`);
        // 4b — FROM ANOTHER TAB. The Basic section is not showing, and the strip with its sentence and its exit still is,
        // the exit is on the screen, and the topmost thing at its centre is the exit itself (so a finger lands on it).
        await page.evaluate(() => document.getElementById("ptab-color")?.click());
        await page.waitForTimeout(300);
        const away = await page.evaluate(() => {
          const q = (id) => document.getElementById(id);
          const btn = q("balBack"), r = btn.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return {
            basicShowing: q("sec-basic").getClientRects().length > 0,
            tabNow: document.querySelector('#panelTabs [aria-selected="true"]')?.id ?? "",
            stripShown: !q("balStrip").hidden && q("balStrip").getClientRects().length > 0,
            words: q("balHeld").textContent ?? "",
            onScreen: r.width > 0 && r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth,
            topmostIsExit: !!top && (top === btn || btn.contains(top)),
            box: `${Math.round(r.width)}x${Math.round(r.height)}`,
          };
        });
        if (!away.basicShowing && away.tabNow === "ptab-color" && away.stripShown && away.words.includes(held.nameKept)) ok(`${where} with the Color tab open and the Basic section not showing, the strip still says: "${away.words}"`);
        else fail(`${where} from the Color tab the strip is not standing: ${JSON.stringify({ basicShowing: away.basicShowing, tabNow: away.tabNow, stripShown: away.stripShown, words: away.words })}`);
        if (away.onScreen && away.topmostIsExit) ok(`${where} from the Color tab the exit is on the screen (${away.box}) and is the topmost thing at its centre`);
        else fail(`${where} from the Color tab the exit is out of reach: on screen ${away.onScreen}, topmost at its centre ${away.topmostIsExit} (${away.box})`);
        // 5 — the way out, from that other tab and by finger on the phone: the gains go back to where the photograph opened.
        await press("#balBack");
        const out = await page.waitForFunction(() => document.getElementById("balHoldBtn").getAttribute("aria-pressed") === "false" && document.getElementById("balStrip").hidden && document.getElementById("balHeld").textContent === "", null, { timeout: 10000 }).then(() => true).catch(() => false);
        await page.evaluate(() => document.getElementById("ptab-basic")?.click());
        await page.waitForTimeout(200);
        const back = await gains();
        if (out && back.join("/") === opened.join("/")) ok(`${where} the exit (${size.name === "phone" ? "tapped" : "clicked"}) ended the hold and put the gains back at ${back.join("/")}, where the photograph opened`);
        else fail(`${where} after the exit: hold ended ${out}, gains ${back.join("/")} against ${opened.join("/")} at open`);
        // 6 — forgetting the kept balance empties the list.
        const forget = await page.evaluate(() => { const b = document.querySelector('#balKept button.mask-del'); if (!b) return null; const name = b.getAttribute("aria-label"); b.click(); return name; });
        const listGone = await page.waitForFunction(() => document.getElementById("balKeptRow").hidden, null, { timeout: 5000 }).then(() => true).catch(() => false);
        if (forget && /^Forget /.test(forget) && listGone) ok(`${where} the kept row's forget button ("${forget}") empties the list`); else fail(`${where} forgetting the kept balance: button "${forget}", list hidden ${listGone}`);
        // 7 — THE OTHER ROUTE (record 104). The press in step 3 took the route the page opened on. The swap button is pressed once, now that the hold is over and the gains
        // stand at the balance the photograph opened at, so the same press is judged by the other claim too: both routes are read in every theme and shape.
        const swapBefore = await swapPressed();
        await page.evaluate(() => document.getElementById("swapBtn")?.click());
        await page.waitForTimeout(300);
        const swapNow = await swapPressed();
        if (swapNow === swapBefore) fail(`${where} the swap button did not change its state (pressed ${swapBefore})`);
        else {
          const g0 = await gains(), b0 = await boxesNow();
          await warmer();
          judgeWarmer(`${where} (the other route)`, swapNow, g0, await gains(), b0, await boxesNow());
        }
      } finally { await page.close(); }
    }
  }
  // ── 13 ─────────────────────────────────────────────────
  // THE TEST PAGE WITH A PRESS RUNNING (record 106). Every other section measures the test page at rest, where its
  // progress line still holds the words it had at parse and its rows are empty. The press changes that line at each
  // check, run and frame and fills the rows, and nothing here had read the page in that state. The walk presses the
  // Picture checks button, waits until the progress line's words differ from the parse-time ones (no longer than 60 s),
  // and measures the page there in both themes and both shapes: the line is still a polite status region in view, in
  // words, at the text floor and the contrast floor, the pressed button says it is running, every control is 44 or
  // more, and axe finds nothing serious. A second change of the words is waited for too, so it is a press that is
  // moving and not one that said its first words and stopped. The page is then closed without waiting for the press
  // to end: the press is about two minutes under the container's software drawing, and its figures are the probe's.
  if (want(13)) console.log("\n13 — the test page with a press running: the progress line, the pressed button, the targets and axe");
  if (want(13)) {
    for (const theme of THEMES) for (const size of SIZES) {
      const where = `[${theme} ${size.name}]`;
      const page = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
      page.on("dialog", (d) => d.accept());
      try {
        await page.goto(`${BASE}/debug.html`, { waitUntil: "load" });
        const rest = await page.evaluate(() => document.getElementById("dPicProgress")?.textContent ?? null);
        if (rest === null) { fail(`${where} debug.html has no #dPicProgress, so the running press is unmeasured`); continue; }
        await page.evaluate(() => document.getElementById("dPictures")?.click());
        const moved = await page.waitForFunction((was) => (document.getElementById("dPicProgress")?.textContent ?? "") !== was, rest, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
        if (!moved) { fail(`${where} the progress line still read its parse-time words 60 s after the button was pressed, so no running state was reached`); continue; }
        const first = await page.evaluate(() => document.getElementById("dPicProgress").textContent);
        ok(`${where} the progress line changed from "${rest.slice(0, 30)}..." to "${first}" after the press`);
        await page.evaluate(COMPOSITE);
        const m = await page.evaluate(() => {
          const el = document.getElementById("dPicProgress");
          const btn = document.getElementById("dPictures");
          const cs = getComputedStyle(el);
          const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
          const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
          const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
          const fg = parse(cs.color), bg = window.__composited(el);
          const L1 = lum(fg), L2 = lum(bg);
          const r = el.getBoundingClientRect();
          return {
            words: el.textContent, role: el.getAttribute("role"), live: el.getAttribute("aria-live"), label: el.getAttribute("aria-label") || "",
            fontPx: parseFloat(cs.fontSize), ratio: Math.round(((Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05)) * 100) / 100,
            shown: cs.display !== "none" && cs.visibility !== "hidden", hiddenAncestor: !!el.closest("[hidden]"),
            inView: r.left >= -0.5 && r.right <= innerWidth + 0.5, scroll: document.documentElement.scrollWidth > innerWidth,
            btnText: btn.textContent, btnDisabled: btn.disabled,
          };
        });
        note(`${where} the line says: "${m.words}" (${m.fontPx}px, ${m.ratio}:1)`);
        if (m.role === "status" && m.live === "polite" && m.label.length >= 12 && m.shown && !m.hiddenAncestor) ok(`${where} the line is still a polite status region with the label "${m.label}", rendered and not inside anything hidden`);
        else fail(`${where} the line while running: role ${m.role}, aria-live ${m.live}, label "${m.label}", rendered ${m.shown}, inside something hidden ${m.hiddenAncestor}`);
        if (m.words.trim().length >= 12) ok(`${where} the running state is in words`); else fail(`${where} the line's words are too short to say anything: "${m.words}"`);
        if (m.fontPx >= 11) ok(`${where} text is ${m.fontPx}px, at or over the 11px floor`); else fail(`${where} text is ${m.fontPx}px, under the 11px floor`);
        if (m.ratio >= 4.5) ok(`${where} text reads ${m.ratio}:1 against what is behind it`); else fail(`${where} text reads ${m.ratio}:1 against what is behind it, under 4.5`);
        if (m.inView && !m.scroll) ok(`${where} the line is inside the window width and the page has no sideways scroll`); else fail(`${where} line inside the width ${m.inView}, sideways scroll ${m.scroll}`);
        if (/Running/.test(m.btnText) && m.btnDisabled) ok(`${where} the pressed button says "${m.btnText}" and is disabled while the press runs`); else fail(`${where} the pressed button reads "${m.btnText}", disabled ${m.btnDisabled}`);
        const inside = await page.evaluate(HIT);
        if (inside.small.length) fail(`${where} press running, under 44: ${inside.small.join(" · ")}`); else ok(`${where} press running: every button is 44 or more`);
        // A SECOND CHANGE: the words move on again, so the press is going and not stopped on its first line.
        const again = await page.waitForFunction((was) => (document.getElementById("dPicProgress")?.textContent ?? "") !== was, first, { timeout: 60000, polling: 100 }).then(() => true).catch(() => false);
        if (again) ok(`${where} the words moved on again while the press ran`); else fail(`${where} the words did not move for 60 s after the first change, so the press is not running`);
        await axeLine(page, `debug.html ${where} with a press running`);
      } finally { await page.close(); }
    }
  }
  // ── 14 ─────────────────────────────────────────────────
  // THE TEST PAGE'S DOOR AND ITS SEPARATION CHECK (records 108 and 084). Three states beyond section 13's: (a) at rest, the file
  // input and the Separation controls (a labelled file input, two radios for what a tap sets, four labelled number boxes, two
  // buttons, the second disabled until the picture is drawn); (b) after step 1, with the first picture on the page and its words;
  // (c) after step 3 has run on the practice photograph with two typed points, with every picture of the three white points on the
  // page. In each: every control is named and 44 or more, every canvas is an image with words as its label and a caption, text
  // meets the floors, the page has no sideways scroll, and axe finds nothing serious. Only structure is read: under the container's
  // software drawing nothing is judged about the pictures themselves.
  if (want(14)) console.log("\n14 — the test page's door and Separation check: at rest, after step 1, after step 3");
  if (want(14)) {
    const PIC = `() => { const out = []; for (const cv of document.querySelectorAll("#dSepPics canvas")) { const fig = cv.closest("figure"); out.push({ role: cv.getAttribute("role"), label: cv.getAttribute("aria-label") || "", cap: (fig && fig.querySelector("figcaption") ? fig.querySelector("figcaption").textContent : "").length }); } return out; }`;
    // THE REPORT'S ROWS, as name and value, read off the page. Used by the rows the 8 November diagnostics added (record 106).
    const READ_ROWS = () => [...document.querySelectorAll("#dPicResults .dbg-row")].map((r) => ({ k: r.querySelector(".dbg-k")?.textContent ?? "", v: r.querySelector(".dbg-v")?.textContent ?? "" }));
    // THE SWEEP IS PRESSED ONCE, in the first theme and shape this section visits. Its counts do not change with theme or shape and a press is
    // about ten minutes in the container, so the other pairs check the button, the progress region and the rows of that one press, and press nothing.
    const SWEEP_PAIR = { theme: THEMES[0], size: SIZES[0] };
    let sweepRowsSeen = null;
    for (const theme of THEMES) for (const size of SIZES) {
      const where = `[${theme} ${size.name}]`;
      const first = theme === SWEEP_PAIR.theme && size === SWEEP_PAIR.size;
      const page = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
      page.on("dialog", (d) => d.accept());
      try {
        await page.goto(`${BASE}/debug.html`, { waitUntil: "load" });
        const controls = await page.evaluate(() => {
          const names = (id) => { const el = document.getElementById(id); if (!el) return null; const l = document.querySelector(`label[for="${id}"]`) || el.closest("label"); return { name: (el.getAttribute("aria-label") || (l ? l.textContent : "") || el.textContent || "").trim(), h: el.getBoundingClientRect().height, disabled: !!el.disabled }; };
          const ids = ["dPicFile", "dSepStart", "dSepGo", "dSepSweep", "dSepTapNeutral", "dSepTapFoliage", "dSepNX", "dSepNY", "dSepFX", "dSepFY"];
          return Object.fromEntries(ids.map((i) => [i, names(i)]));
        });
        for (const [id, c] of Object.entries(controls)) {
          if (!c) fail(`${where} #${id} is missing from debug.html`);
          else if (c.name.length < 8) fail(`${where} #${id} has no name of at least 8 characters ("${c.name}")`);
          else ok(`${where} #${id} is named: "${c.name.slice(0, 50)}"`);
        }
        if (controls.dSepGo && controls.dSepGo.disabled) ok(`${where} step 3 is disabled until the picture is drawn`); else fail(`${where} step 3 is not disabled at rest`);
        if (controls.dSepSweep && controls.dSepSweep.disabled) ok(`${where} the sweep is disabled until the picture is drawn`); else fail(`${where} the sweep is not disabled at rest`);
        if (controls.dSepSweep && controls.dSepSweep.h >= 44) ok(`${where} the sweep button is 44 or more high`); else fail(`${where} the sweep button is under 44 high`);
        let hit = await page.evaluate(HIT);
        if (hit.small.length) fail(`${where} at rest, under 44: ${hit.small.join(" · ")}`); else ok(`${where} at rest: every button is 44 or more`);
        await axeLine(page, `debug.html ${where} with the Separation controls at rest`);
        // (b) step 1
        await page.evaluate(() => document.getElementById("dSepStart")?.click());
        const drawn = await page.waitForFunction(() => /^The photograph is drawn|^Stopped/.test(document.getElementById("dPicProgress")?.textContent ?? ""), null, { timeout: 900000, polling: 200 }).then(() => true).catch(() => false);
        const said = await page.evaluate(() => document.getElementById("dPicProgress")?.textContent ?? "");
        if (!drawn || /^Stopped/.test(said)) { fail(`${where} step 1 did not reach the drawn picture: "${said}"`); continue; }
        ok(`${where} step 1 reached "${said.slice(0, 40)}..."`);
        let pics = await page.evaluate(`(${PIC})()`);
        if (pics.length >= 1 && pics.every((p) => p.role === "img" && p.label.length >= 40 && p.cap >= 40)) ok(`${where} after step 1: ${pics.length} picture(s), each an image with words as its label and a caption`); else fail(`${where} after step 1: pictures ${JSON.stringify(pics)}`);
        if (await page.evaluate(() => !document.getElementById("dSepGo").disabled)) ok(`${where} step 3 is enabled once the picture is drawn`); else fail(`${where} step 3 is still disabled after step 1`);
        if (await page.evaluate(() => !document.getElementById("dSepSweep").disabled)) ok(`${where} the sweep is enabled once the picture is drawn`); else fail(`${where} the sweep is still disabled after step 1`);
        hit = await page.evaluate(HIT);
        if (hit.small.length) fail(`${where} after step 1, under 44: ${hit.small.join(" · ")}`); else ok(`${where} after step 1: every button is 44 or more`);
        await axeLine(page, `debug.html ${where} after step 1`);
        // (b1) WHAT THE DRAWING SURFACE GAVE BACK AND THE PLANTED COLOURED PICTURE (record 106, 8 November 2026). The planted coloured picture
        // goes through the photograph's own path and must read as known; each diagnostic row must be present and name a format or a type.
        // Only the words are read: no picture is judged.
        const afterStep1 = await page.evaluate(READ_ROWS);
        const plantedRow = afterStep1.find((r) => r.k === "A planted coloured picture, through the photograph's path");
        if (plantedRow && /^read as known/.test(plantedRow.v)) ok(`${where} the planted coloured picture reads as known: "${plantedRow.v.slice(0, 60)}..."`); else fail(`${where} the planted coloured picture does not read as known: "${plantedRow ? plantedRow.v.slice(0, 160) : "no row"}"`);
        const WHEN = "after the photograph's first draw";
        const needRows = [`Drawing surface, ${WHEN}: the upload`, `Drawing surface, ${WHEN}: the draw and the read-back`, `Drawing surface, ${WHEN}: what the context supports`, `Drawn frame, ${WHEN}: each channel's mean and top`, `Drawing surface, ${WHEN}: the read-back's bytes before the display-P3 conversion`, `Drawn frame, ${WHEN}: values at nine places after the conversion`, "A float texture upload and read-back on a context of its own"];
        const missingRows = needRows.filter((n) => !afterStep1.some((r) => r.k === n));
        if (!missingRows.length) ok(`${where} all ${needRows.length} diagnostic rows are present after step 1`); else fail(`${where} diagnostic rows missing after step 1: ${missingRows.join(" | ")}`);
        // (b1a) THE SEPARATION MEASURE'S ROWS (records 084 and 106, plan of 9 November 2026): the measure read its own planted counts as known, the
        // pixels were labelled once and the labels row names the four shares and whether a sky was found, the first picture carries the split and
        // the distance (or says it is undefined and why), and the labelling has its two time rows. Only the words are read: no picture is judged.
        await page.waitForFunction(() => [...document.querySelectorAll("#dPicResults .dbg-k")].some((k) => k.textContent === "Time: every row added together"), null, { timeout: 120000, polling: 200 }).catch(() => null);
        const afterStep1Measure = await page.evaluate(READ_ROWS);
        const measureNeed = [
          ["The separation measure, planted first", /^read as known/, "reads its planted counts as known"],
          ["The photograph's drawn size", /\d+ by \d+ pixels/, "names the drawn size"],
          ["The photograph's pixels, labelled", /sky \d+ · neutral \d+ · foliage \d+ · other \d+ of \d+ thinned pixels .*(sky selection|the sky selection).* sky weight 0\.5/, "names the four labels, whether a sky was found and the figures"],
          ["The first picture: the four labels and the separation measure", /sky: .*foliage: .*other: .*the control, neutral: .*whole frame: .*sky to foliage (Hellinger distance \d\.\d{4}|distance undefined \(.+\))/, "carries the split, the control and the distance or why it is undefined"],
          ["Time: separation: the sky selection's build", /ms|s \(/, "has its time row"],
          ["Time: separation: the label pass", /ms|s \(/, "has its time row"],
        ];
        for (const [k, re, what] of measureNeed) {
          const r = afterStep1Measure.find((x) => x.k === k);
          if (r && re.test(r.v)) ok(`${where} after step 1, the row "${k}" ${what}`); else fail(`${where} after step 1, the row "${k}" ${r ? `does not match: "${r.v.slice(0, 200)}"` : "is missing"}`);
        }
        const uploadRow = afterStep1.find((r) => r.k === `Drawing surface, ${WHEN}: the upload`);
        if (uploadRow && /internal format (RGBA32F|RGBA16F|RGBA8)/.test(uploadRow.v) && /type (FLOAT|HALF_FLOAT|UNSIGNED_BYTE)/.test(uploadRow.v)) ok(`${where} the upload row names an internal format and a type`); else fail(`${where} the upload row names no format: "${uploadRow ? uploadRow.v.slice(0, 120) : "no row"}"`);
        const readRow = afterStep1.find((r) => r.k === `Drawing surface, ${WHEN}: the draw and the read-back`);
        if (readRow && /read-back asks for RGBA and UNSIGNED_BYTE/.test(readRow.v) && /first error after the draw/.test(readRow.v)) ok(`${where} the read-back row names the format, the type and the errors`); else fail(`${where} the read-back row is incomplete: "${readRow ? readRow.v.slice(0, 120) : "no row"}"`);
        if (first) {
          // THE PLANTED PICTURE SEEN FAILING, ONCE: the page flag exchanges two of its colours, so the check must read as not known.
          const swapPage = await browser.newPage({ ...size.opts, colorScheme: theme, serviceWorkers: "block" });
          try {
            await swapPage.goto(`${BASE}/debug.html?plantswap=1`, { waitUntil: "load" });
            await swapPage.evaluate(() => document.getElementById("dSepStart")?.click());
            const swapDrawn = await swapPage.waitForFunction(() => /^The photograph is drawn|^Stopped/.test(document.getElementById("dPicProgress")?.textContent ?? ""), null, { timeout: 900000, polling: 200 }).then(() => true).catch(() => false);
            const swapRows = swapDrawn ? await swapPage.evaluate(READ_ROWS) : [];
            const swapRow = swapRows.find((r) => r.k === "A planted coloured picture, through the photograph's path");
            if (swapRow && /^did not read as known/.test(swapRow.v) && /plantswap/.test(swapRow.v)) ok(`${where} with the page flag the planted coloured picture reads as NOT known (the walk's own made-to-fail)`); else fail(`${where} with the page flag the planted coloured picture did not read as not known: "${swapRow ? swapRow.v.slice(0, 160) : "no row"}"`);
          } finally { await swapPage.close(); }
        }
        // (b2) TAP FEEDBACK: a typed spot reads at once. The points line is a live region present from parse; after the pair is typed it says
        // in words whether the spot is usable, blown out or too dark, and the first picture's label names the spot with its letter and state
        // (the mark is a letter in a square with words beside it, which the label repeats). Only the words are read: no picture is judged.
        const live = await page.evaluate(() => { const el = document.getElementById("dSepHint"); return { role: el?.getAttribute("role"), live: el?.getAttribute("aria-live") }; });
        if (live.role === "status" && live.live === "polite") ok(`${where} the points line is a polite live region present from parse`); else fail(`${where} the points line is not a polite status region: ${JSON.stringify(live)}`);
        const hint0 = await page.evaluate(() => document.getElementById("dSepHint")?.textContent ?? "");
        await page.fill("#dSepNX", "30");
        await page.fill("#dSepNY", "30");
        await page.dispatchEvent("#dSepNY", "change");
        const spoke = await page.waitForFunction((was) => { const t = document.getElementById("dSepHint")?.textContent ?? ""; return t !== was && /^The neutral spot at/.test(t) && /(is usable|is blown out|too dark)/.test(t); }, hint0, { timeout: 900000, polling: 200 }).then(() => true).catch(() => false);
        const spokenWords = await page.evaluate(() => document.getElementById("dSepHint")?.textContent ?? "");
        if (spoke) ok(`${where} a typed neutral spot is answered in words: "${spokenWords.slice(0, 70)}..."`); else fail(`${where} a typed neutral spot was not answered in words: "${spokenWords}"`);
        const marked = await page.evaluate(() => { const cv = document.querySelector("#dSepPics canvas"); const fig = cv && cv.closest("figure"); return { label: cv ? cv.getAttribute("aria-label") || "" : "", cap: fig && fig.querySelector("figcaption") ? fig.querySelector("figcaption").textContent : "" }; });
        if (/Marked: N, the neutral spot, (usable|blown out|too dark)/.test(marked.label) && marked.cap === marked.label) ok(`${where} the picture's label and caption name the spot by its letter and its state`); else fail(`${where} the picture's label does not name the typed spot and its state: "${marked.label.slice(-120)}"`);
        hit = await page.evaluate(HIT);
        if (hit.small.length) fail(`${where} after a typed spot, under 44: ${hit.small.join(" · ")}`); else ok(`${where} after a typed spot: every button is 44 or more`);
        await axeLine(page, `debug.html ${where} after a typed spot`);
        // (b3) THE SWEEP: pressed on the practice photograph. Its progress line is the polite live region present from parse and moves on while it
        // runs; when it ends the progress line says it is done, the list holds a row per setting, each drawn row carries the 72 hue counts and the
        // ten saturation bands in words, and one row names how many settings were counted and how long it took. Only structure is read.
        if (!first) {
          // The other three pairs press nothing: the button, the progress region and the planted picture's row are read as they stand.
          const regions = await page.evaluate(() => { const el = document.getElementById("dPicProgress"); const b = document.getElementById("dSepSweep"); return { role: el?.getAttribute("role"), live: el?.getAttribute("aria-live"), label: el?.getAttribute("aria-label") || "", enabled: !!b && !b.disabled, h: b ? b.getBoundingClientRect().height : 0 }; });
          if (regions.role === "status" && regions.live === "polite" && regions.label.length >= 8) ok(`${where} the progress region is a polite status region with a label, present from parse`); else fail(`${where} the progress region is not a labelled polite status region: ${JSON.stringify(regions)}`);
          if (regions.enabled && regions.h >= 44) ok(`${where} the sweep button is enabled and 44 or more high once the picture is drawn (not pressed here: the sweep was pressed once, in ${SWEEP_PAIR.theme} ${SWEEP_PAIR.size.name})`); else fail(`${where} the sweep button is not enabled and 44 high: ${JSON.stringify(regions)}`);
        } else {
        await page.evaluate(() => document.getElementById("dSepSweep")?.click());
        const sweepStarted = await page.waitForFunction(() => /^Sweep \d+ of \d+/.test(document.getElementById("dPicProgress")?.textContent ?? ""), null, { timeout: 900000, polling: 200 }).then(() => true).catch(() => false);
        if (sweepStarted) ok(`${where} the sweep's progress line names the setting and the count`); else fail(`${where} the sweep's progress line never named a setting`);
        const sweepBusy = await page.evaluate(() => { const b = document.getElementById("dSepSweep"); return { text: b?.textContent ?? "", disabled: !!b?.disabled }; });
        if (/Running/.test(sweepBusy.text) && sweepBusy.disabled) ok(`${where} the sweep button says "Running…" and is disabled while it runs`); else fail(`${where} the sweep button reads "${sweepBusy.text.slice(0, 40)}", disabled ${sweepBusy.disabled}, while it runs`);
        const swept = await page.waitForFunction(() => /^Sweep done\.|^Stopped/.test(document.getElementById("dPicProgress")?.textContent ?? ""), null, { timeout: 3600000, polling: 500 }).then(() => true).catch(() => false);
        const sweptSaid = await page.evaluate(() => document.getElementById("dPicProgress")?.textContent ?? "");
        if (!swept || /^Stopped/.test(sweptSaid)) { fail(`${where} the sweep did not finish: "${sweptSaid}"`); continue; }
        ok(`${where} the sweep finished: "${sweptSaid.slice(0, 60)}..."`);
        const sweepRows = await page.evaluate(() => {
          const rows = [...document.querySelectorAll("#dPicResults .dbg-row")].map((r) => ({ k: r.querySelector(".dbg-k")?.textContent ?? "", v: r.querySelector(".dbg-v")?.textContent ?? "" }));
          const sw = rows.filter((r) => /^Sweep \d+ of \d+/.test(r.k));
          const drawn = sw.filter((r) => r.v !== "not run");
          const counts = drawn.filter((r) => { const m = /hue counts: ([\d ]+)$/.exec(r.v); const s = /saturation bands of every pixel, 0 to 10 percent first: ([\d ]+) · hue counts/.exec(r.v); return m && s && m[1].trim().split(/\s+/).length === 72 && s[1].trim().split(/\s+/).length === 10; });
          return { sweep: sw.length, drawn: drawn.length, counted: counts.length, summary: rows.some((r) => r.k === "The sweep" && /settings counted/.test(r.v) && /in [\d.]+ (ms|s)/.test(r.v)) };
        });
        if (sweepRows.drawn >= 1 && sweepRows.counted === sweepRows.drawn) ok(`${where} the sweep wrote ${sweepRows.sweep} rows, ${sweepRows.drawn} drawn, each with 72 hue counts and 10 saturation bands`); else fail(`${where} the sweep's rows: ${JSON.stringify(sweepRows)}`);
        if (sweepRows.summary) ok(`${where} one row names how many settings were counted and how long the sweep took`); else fail(`${where} no summary row for the sweep`);
        hit = await page.evaluate(HIT);
        if (hit.small.length) fail(`${where} after the sweep, under 44: ${hit.small.join(" · ")}`); else ok(`${where} after the sweep: every button is 44 or more`);
        await axeLine(page, `debug.html ${where} after the sweep`);
        // THE SWEEP'S ROWS MUST CARRY COLOUR AND THE DIAGNOSTICS: a row of the sweep with no pixel at or above the floor is a failure (a sweep
        // that reads nothing is not a sweep that passed), and the rows of the sweep's first draw are present. Read from the one press.
        const afterSweep = await page.evaluate(READ_ROWS);
        sweepRowsSeen = afterSweep;
        const zeroRows = afterSweep.filter((r) => /^Sweep \d+ of \d+/.test(r.k) && r.v !== "not run" && !/^not run/.test(r.v) && (/ (\d+) of \d+ pixels at or above the floor/.exec(r.v) || [])[1] === "0");
        if (zeroRows.length === 0) ok(`${where} no sweep row reads 0 pixels at or above the floor`); else fail(`${where} ${zeroRows.length} sweep row(s) read 0 pixels at or above the floor, the first: "${zeroRows[0].k}"`);
        const sweepNeed = ["Drawing surface, after the sweep's first draw: the upload", "Drawing surface, after the sweep's first draw: the draw and the read-back", "Drawing surface, after the sweep's first draw: what the context supports", "Drawn frame, after the sweep's first draw: each channel's mean and top", "Drawing surface, after the sweep's first draw: the read-back's bytes before the display-P3 conversion", "Drawn frame, after the sweep's first draw: values at nine places after the conversion"];
        const sweepMissing = sweepNeed.filter((n) => !afterSweep.some((r) => r.k === n));
        if (!sweepMissing.length) ok(`${where} the diagnostic rows of the sweep's first draw are present`); else fail(`${where} diagnostic rows missing after the sweep: ${sweepMissing.join(" | ")}`);
        // THE SWEEP'S SPLIT (records 084 and 106, plan of 9 November 2026): every drawn row carries the separation figures between its floor count
        // and its saturation bands (sky, foliage, other, the neutral control, the whole frame, and the distance or why it is undefined), the
        // settings row carries the measure's four figures, and the labelling has its time row. A row that is not split says so and fails here.
        const drawnRows = afterSweep.filter((r) => /^Sweep \d+ of \d+/.test(r.k) && !/^not run/.test(r.v));
        const splitRows = drawnRows.filter((r) => /percent under it · separation, sky: .*foliage: .*other: .*the control, neutral: .*whole frame: .*sky to foliage (Hellinger distance \d\.\d{4}, angle between the circular means .+|distance undefined \(.+\)) · saturation bands/.test(r.v));
        if (drawnRows.length >= 1 && splitRows.length === drawnRows.length) ok(`${where} each of the ${drawnRows.length} drawn sweep rows carries the separation figures and the distance or why it is undefined`); else fail(`${where} ${drawnRows.length - splitRows.length} of ${drawnRows.length} drawn sweep rows lack the separation figures, the first: "${(drawnRows.find((r) => !splitRows.includes(r)) || { v: "" }).v.slice(0, 200)}"`);
        const settingsRow = afterSweep.find((r) => r.k === "The sweep's own settings");
        if (settingsRow && /sky weight 0\.5/.test(settingsRow.v) && /vegetation index at most -0\.05/.test(settingsRow.v) && /colourless under 1 percent/.test(settingsRow.v)) ok(`${where} the sweep's settings row carries the measure's four figures`); else fail(`${where} the sweep's settings row lacks the measure's figures: "${settingsRow ? settingsRow.v.slice(0, 200) : "no row"}"`);
        const labelTime = afterSweep.find((r) => r.k === "Time: sweep: the labelled counts and the measure");
        if (labelTime) ok(`${where} the labelled counts have their time row: "${labelTime.v.slice(0, 40)}"`); else fail(`${where} no time row for the sweep's labelled counts`);
        // The same rows under every other theme and shape, from that one press, with nothing pressed again.
        for (const t2 of THEMES) for (const s2 of SIZES) {
          if (t2 === theme && s2 === size) continue;
          await page.emulateMedia({ colorScheme: t2 });
          await page.setViewportSize(s2.opts.viewport);
          const w2 = `[${t2} ${s2.name}, rows of the one sweep press]`;
          const have = await page.evaluate(READ_ROWS);
          if (have.filter((r) => /^Sweep \d+ of \d+/.test(r.k)).length === sweepRows.sweep) ok(`${w2} the sweep's ${sweepRows.sweep} rows are still on the page`); else fail(`${w2} the sweep's rows changed with the theme or shape`);
          const h2 = await page.evaluate(HIT);
          if (h2.small.length) fail(`${w2} under 44: ${h2.small.join(" · ")}`); else ok(`${w2} every button is 44 or more`);
          if (!(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))) ok(`${w2} no sideways scroll`); else fail(`${w2} the page scrolls sideways`);
          await axeLine(page, `debug.html ${w2}`);
        }
        await page.emulateMedia({ colorScheme: theme });
        await page.setViewportSize(size.opts.viewport);
        }
        // (c) step 3, two points typed
        for (const [id, v] of [["dSepNX", "30"], ["dSepNY", "30"], ["dSepFX", "60"], ["dSepFY", "60"]]) await page.fill(`#${id}`, v);
        await page.evaluate(() => document.getElementById("dSepGo")?.click());
        const done = await page.waitForFunction(() => /^Done\.|^Stopped/.test(document.getElementById("dPicProgress")?.textContent ?? ""), null, { timeout: 1800000, polling: 500 }).then(() => true).catch(() => false);
        const fin = await page.evaluate(() => document.getElementById("dPicProgress")?.textContent ?? "");
        if (!done || /^Stopped/.test(fin)) { fail(`${where} step 3 did not finish: "${fin}"`); continue; }
        pics = await page.evaluate(`(${PIC})()`);
        if (pics.length >= 4 && pics.every((p) => p.role === "img" && p.label.length >= 40 && p.cap >= 40)) ok(`${where} after step 3: ${pics.length} pictures, each an image with words as its label and a caption`); else fail(`${where} after step 3: pictures ${JSON.stringify(pics.slice(0, 3))}`);
        const scroll = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (!scroll) ok(`${where} after step 3: no sideways scroll`); else fail(`${where} after step 3: the page scrolls sideways`);
        hit = await page.evaluate(HIT);
        if (hit.small.length) fail(`${where} after step 3, under 44: ${hit.small.join(" · ")}`); else ok(`${where} after step 3: every button is 44 or more`);
        await axeLine(page, `debug.html ${where} after step 3`);
      } finally { await page.close(); }
    }
  }
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
