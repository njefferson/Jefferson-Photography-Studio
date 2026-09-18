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
// FOUR SECTIONS, each a standing claim rather than a one-release probe:
//   0  every deployed page and dialog is declared, and every declaration exists
//   1  axe over every page, in both themes
//   2  hit areas at 430px and 900px, on every page and inside every dialog
//   3  the colours that carry meaning, read COMPOSITED (hub LESSONS §293)
//
// Feature-specific a11y probes stay in the scratchpad, per release. What makes
// this one repo-worthy is the coverage assertion: it is the only thing here
// that knows what the app is made of.

import { chromium } from "/home/user/Jefferson-Photography-Studio/node_modules/playwright-core/index.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { repo, surfaces, allowed, check as checkSurfaces } from "./surfaces.mjs";
import { sweepRenders } from "./palette-spec.mjs";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const axeSrc = readFileSync(join(repo, "node_modules/axe-core/axe.min.js"), "utf8");
const EX = join(repo, "public/examples");
const ONE = join(EX, "NIR_0063.dng");
const THEMES = ["dark", "light"];
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
  console.log("\n1 — axe over every deployed page, in both themes");
  for (const s of surfaces()) {
    for (const theme of THEMES) {
      const page = await browser.newPage({ viewport: { width: 1100, height: 850 }, colorScheme: theme });
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
        }
        await page.addScriptTag({ content: axeSrc });
        const r = await page.evaluate(async (rules) => await window.axe.run(document, { runOnly: rules }), RULES);
        const serious = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
        const line = `${s.file} [${theme}]`;
        if (serious.length) { fail(`${line}: ${serious.length} serious/critical`); for (const v of serious) for (const n of v.nodes) note(`[${v.impact}] ${v.id}: ${n.target.join(" ")}`); }
        else ok(`${line}: nothing serious or critical${r.violations.length ? ` (${r.violations.length} minor)` : ""}`);
        for (const v of r.violations.filter((v) => !serious.includes(v))) note(`  minor · ${v.id} x${v.nodes.length}`);
      } finally { await page.close(); }
    }
  }

  // ── 2 ────────────────────────────────────────────────────────────────────
  console.log("\n2 — hit areas at 430px and 900px, on every page and inside every dialog");
  for (const s of surfaces()) {
    for (const vw of [430, 900]) {
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
          const tabs = await page.evaluate(() =>
            [...document.querySelectorAll("#panelTabs .ptab")].map((t) => t.id).filter(Boolean));
          for (const id of tabs) {
            const on = await page.evaluate((t) => {
              const b2 = document.getElementById(t);
              if (!b2) return false;
              b2.click();
              return b2.getAttribute("aria-selected") === "true";
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
            await page.evaluate((b) => document.getElementById(b)?.click(), id);
            await page.waitForTimeout(250);
          }
        }
      } finally { await page.close(); }
    }
  }

  // ── 3 ────────────────────────────────────────────────────────────────────
  console.log("\n3 — the colours that carry meaning, read composited");
  for (const theme of THEMES) {
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
  console.log("\n4 — the palette spec still describes what the app paints");
  {
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
  console.log("\n5 — decoration that paints has a box to paint in");
  {
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
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
