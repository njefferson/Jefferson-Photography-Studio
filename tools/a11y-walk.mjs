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
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
