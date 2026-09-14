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
} finally {
  await browser.close();
}
console.log(failed ? `\n${failed} check(s) failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
