#!/usr/bin/env node
// EVERY CONTROL IN THE APP, WITH WHAT IT SAYS AND WHAT IT PROMISES.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/control-check.mjs [--port=8131] [--list]
//
// WHY IT EXISTS. On 2026-09-16 the owner reported four controls in one sitting,
// by hand, from the device: a "Share" button in the bar beside the photograph
// that shared the APP; a "Tutorials" button that left you on the landing screen;
// "Batch process", whose two words describe what Quick look does; and "Measure
// lens" sitting in a row of things you do to the open photograph. Nothing in
// this repository could have found any of them. The accessibility walk measures
// CONFORMANCE — contrast, hit area, a name being present — and every one of
// those four passed it, because each had a name and the name was simply wrong.
//
// So this asks the question no conformance check asks: DOES THE VISIBLE LABEL
// SAY WHAT THE CONTROL DOES? Half of that is taste and cannot be parsed. The
// other half is mechanical, and it is the half that produced three of the four:
//
//   THE TOOLTIP RULE. A `title` is a HOVER. There is no hover on a tablet, so
//   anything a title says and the visible label does not is a sentence the
//   reader this app is built for will never see. "Share" + title "Share this
//   app or copy its link" reads, on the device, as one word — and the word was
//   wrong. Measured when this was written: 43 of 268 controls carried a title,
//   and the rule is not "no titles" (a title that RESTATES the label is a
//   desktop nicety and harmless) but "no title that carries what the label
//   lacks".
//
// It also PRINTS THE INVENTORY, grouped by surface, so reviewing every control
// in the app is one read of one page rather than a person tapping through it.
//
// `.control-allow` declares the honest exceptions, one `page#id` per line with
// a reason after `—`, checked BOTH WAYS and printed on every run: a list that
// hides what it excuses is a list nobody audits.
import { chromium } from "playwright-core";
import { requireFreshDist } from "./fresh-dist.mjs";
// BEFORE THE BROWSER: this renders through the build in `dist`, and a stale one
// renders the PREVIOUS build's pictures. See tools/fresh-dist.mjs.
requireFreshDist();
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PAGES, repo } from "./surfaces.mjs";

const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const BASE = `http://127.0.0.1:${PORT}`;
const LIST = process.argv.includes("--list");
const ALLOW = join(repo, ".control-allow");
// A bundled practice frame, so the editor is actually up when ir.html is swept.
const OPEN_WITH = "NIR_0063.dng";

/** The declared exceptions as a Map of `page#id` to its stated reason.
 *
 *  Takes nothing; reads `.control-allow` beside the repo root.
 *  Returns an empty Map when the file is absent, which is the state a repo
 *  adopting this gate starts in. Every key it returns is printed by the run and
 *  is asserted to still exist in the app, so the file can only shrink by
 *  somebody deleting a line — never by a control quietly going away. */
function allowList() {
  if (!existsSync(ALLOW)) return new Map();
  const out = new Map();
  for (const raw of readFileSync(ALLOW, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const [key, ...why] = line.split("—");
    out.set(key.trim(), why.join("—").trim() || "(no reason given)");
  }
  return out;
}

/** Every control on whatever is currently on screen, read from the live DOM.
 *
 *  Takes `page`, a Playwright page, and `where`, the surface label to stamp on
 *  each row.
 *  Returns one row per control: its id, its VISIBLE text, its aria-label, its
 *  title and the surface. Scoped to the open dialog when there is one, because
 *  a modal's backdrop makes everything behind it unreachable and counting it
 *  would report controls the reader cannot touch. The tooltip rule below is its
 *  only consumer and reads `text`, `aria` and `title`. */
async function controlsOn(page, where) {
  return page.evaluate((w) => {
    const root = document.querySelector("dialog[open]") || document;
    const sel = "button, [role=button], summary, a[href], input[type=button], input[type=submit]";
    const out = [];
    for (const el of root.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;                 // not on screen at all
      if (el.closest("[hidden]") || el.hidden) continue;
      // `innerText` IS THE RENDERED TEXT, and a <summary> inside a collapsed
      // <details> renders as nothing — so the Help dialog's nested sections came
      // back nameless and the gate reported a defect that was its own. Fall back
      // to textContent, which is the label the DOM actually carries. Suspect the
      // instrument first (CLAUDE.md), and this is the third time that sentence
      // has paid for itself in this file's lifetime of one afternoon.
      const text = (el.innerText || el.textContent || el.value || "").replace(/\s+/g, " ").trim();
      out.push({
        where: w,
        id: el.id || "",
        tag: el.tagName.toLowerCase(),
        text,
        aria: (el.getAttribute("aria-label") || "").trim(),
        title: (el.getAttribute("title") || "").trim(),
      });
    }
    return out;
  }, where);
}

// Words the label is not required to repeat: they carry no meaning on their own.
const STOP = new Set(["the","a","an","and","or","to","of","it","its","this","that","is","for","with","on","in","from","your","you","as","at","by","one","all","no","not","be","into","when","what","which","so","if","up","out","then","there","here","also","just","every","each","any","use","used","like","than","only","still","them","they"]);
const words = (s) => s.toLowerCase().replace(/[^a-z0-9 ]+/g, " ").split(/\s+/).filter((w) => w && !STOP.has(w));

/** The words a control's title says that its own visible label and aria-label
 *  do not.
 *
 *  Takes a row from `controlsOn`.
 *  Returns the array of uncovered words — empty when the title merely restates
 *  what is already readable, which is the passing case. The caller treats a
 *  non-empty result as a FAIL unless the control is declared in
 *  `.control-allow`; nothing else reads it. */
function uncovered(row) {
  if (!row.title) return [];
  const have = new Set([...words(row.text), ...words(row.aria)]);
  return words(row.title).filter((w) => !have.has(w));
}

const served = await fetch(`${BASE}/ir.html`).then((r) => r.ok).catch(() => false);
if (!served) {
  console.error(`\nNothing is serving dist on :${PORT}.\n\n    python3 -m http.server ${PORT} --directory dist\n`);
  process.exit(2);
}

const allow = allowList();
const rows = [];
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium", args: ["--use-gl=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const s of PAGES) {
    const page = await br.newPage({ viewport: { width: 900, height: 900 } });
    page.on("dialog", (d) => d.accept());
    await page.goto(`${BASE}/${s.file}`, { waitUntil: "load" });
    await page.waitForTimeout(700);
    // COLD FIRST, WHERE THERE IS A COLD STATE. Opening a photograph is what
    // makes the editor exist — and it HIDES the start screen, so doing only that
    // traded one blind spot for another and lost the welcome card's five
    // controls while gaining the panel's. A page can have more than one resting
    // state, and sweeping one of them is not sweeping the page.
    if (s.file === "ir.html") rows.push(...(await controlsOn(page, `${s.file} · start screen`)));
    // A PHOTOGRAPH FIRST, OR THE EDITOR IS NOT THERE. Measured the day this was
    // written: with nothing open, #panel is `hidden` and the bar's edit actions
    // lay out at 0x0 — so a cold sweep of ir.html misses every panel control and
    // the Hold buttons, and reports green having looked at none of them. That is
    // the shape of gate this repository keeps paying for, and the coverage check
    // at the bottom is the half that can refuse.
    //
    // ONLY WHERE THERE IS SOMETHING TO OPEN, AND ON A BOUNDED WAIT. The first
    // version did this on every page: five of the seven have no `#file` and no
    // `#welcome`, so `setInputFiles` threw into a swallowing catch and then the
    // walk waited 300 SECONDS EACH for a condition that could never become true
    // — half an hour of a sweep that had already finished its work. A wait whose
    // condition cannot be reached is the same defect as a guessed sleep, one
    // layer down.
    const openable = await page.$("#file");
    if (openable && existsSync(join(repo, "dist", "examples", OPEN_WITH))) {
      await page.setInputFiles("#file", join(repo, "dist", "examples", OPEN_WITH)).catch(() => {});
      const up = await page
        .waitForFunction(() => document.getElementById("welcome")?.hidden, null, { timeout: 90000 })
        .then(() => true)
        .catch(() => false);
      // SAY SO RATHER THAN SWEEP AN EMPTY EDITOR. Falling through quietly is how
      // the first version reported green over a page it never opened.
      if (!up) console.log(`  (${s.file}: the practice frame never opened — the editor's controls are not in this run)`);
      await page.waitForTimeout(1500);
    }
    rows.push(...(await controlsOn(page, s.file === "ir.html" ? `${s.file} · with a photo open` : s.file)));
    // Every panel tab on ir.html is its own set of controls and only one is on
    // screen at a time — a sweep of the page at rest sees one of eleven.
    const tabs = await page.evaluate(() =>
      [...document.querySelectorAll("#panelTabs .ptab")].map((t) => t.id).filter(Boolean));
    for (const t of tabs) {
      await page.evaluate((i) => document.getElementById(i)?.click(), t);
      await page.waitForTimeout(120);
      rows.push(...(await controlsOn(page, `${s.file} · ${t}`)));
      // AND THE TOOLS THAT ARM, which are not a tab and are not on screen at
      // rest. The crop bar floats over the photograph and only exists while the
      // tool is armed — five controls the coverage check below found missing,
      // reachable with one press. Everything else still unreached is genuinely
      // state-dependent (a waiting update, a file with GPS in it, a finished
      // export) and is declared in .control-allow with what would make it
      // appear, rather than quietly counted as looked at.
      if (t === "ptab-crop") {
        await page.evaluate(() => document.getElementById("cropBtn")?.click());
        await page.waitForTimeout(250);
        rows.push(...(await controlsOn(page, `${s.file} · crop armed`)));
        await page.evaluate(() => document.getElementById("cropBtn")?.click());
        await page.waitForTimeout(150);
      }
    }
    for (const id of s.dialogs) {
      const opened = await page.evaluate((i) => {
        const d = document.getElementById(i);
        if (!d) return false;
        try { if (!d.open) d.showModal(); } catch { return false; }
        return true;
      }, id);
      if (!opened) continue;
      await page.waitForTimeout(150);
      rows.push(...(await controlsOn(page, `${s.file} · ${id}`)));
      await page.evaluate(() => document.querySelector("dialog[open]")?.close());
    }
    await page.close();
  }
} finally { await br.close(); }

// ONE ROW PER CONTROL, and the dedup key is the CONTROL rather than the place
// it was seen. Keying on the surface counted the top bar once per panel tab and
// once per dialog — eleven tabs and fifteen dialogs on ir.html alone — which
// turned 5 real findings into 50 identical lines and a control count of 526.
// The instrument was wrong before the finding was; a repeated failure is the
// shape that says so.
//
// A control with no id keeps its surface in the key: those are built in script,
// many to a grid, and two of them on different surfaces are genuinely two.
const seen = new Map();
for (const r of rows) {
  const page = r.where.split(" \u00b7 ")[0];
  const k = r.id ? `${page}|${r.id}` : `${r.where}|${r.text}|${r.title}`;
  if (!seen.has(k)) seen.set(k, r);
}
const all = [...seen.values()];
const key = (r) => `${r.where.split(" · ")[0]}#${r.id || r.text.slice(0, 24)}`;

if (LIST) {
  const lines = all.filter((r) => uncovered(r).length).map((r) => `${key(r)} — WHY`);
  writeFileSync(ALLOW + ".seed", [...new Set(lines)].sort().join("\n") + "\n");
  console.log(`seed written to ${ALLOW}.seed`);
}

console.log(`\n=== every control in the app · ${all.length} on ${PAGES.length} pages ===\n`);
let last = "";
for (const r of all) {
  if (r.where !== last) { console.log(`\n  ${r.where}`); last = r.where; }
  const name = r.text || r.aria || "(no name)";
  const t = r.title ? `   [title: ${r.title}]` : "";
  console.log(`    ${(r.id || "-").padEnd(20)} ${name.slice(0, 54)}${t}`);
}

let failed = 0;
const fail = (s) => { failed++; console.log(`  FAIL  ${s}`); };

console.log(`\n=== the tooltip rule: a hover is not a label on a touch screen ===\n`);
const used = new Set();
const bad = [];
for (const r of all) {
  const miss = uncovered(r);
  if (!miss.length) continue;
  const k = key(r);
  if (allow.has(k)) { used.add(k); continue; }
  bad.push([k, r, miss]);
}
for (const [k, r, miss] of bad) {
  fail(`${k}: the label reads "${r.text || r.aria}" and only the tooltip says ${JSON.stringify(miss.join(" "))}`);
}
if (!bad.length) console.log("  ok    no control hides its meaning in a tooltip");

console.log(`\n=== every control with no name at all ===\n`);
// The same declarations cover this rule: #askOk and #askCancel have no label
// until whatever is asking writes one, and that is a fact about the control
// rather than about which rule caught it.
const nameless = all.filter((r) => !r.text && !r.aria && !(allow.has(key(r)) && used.add(key(r))));
for (const r of nameless) fail(`${key(r)}: a ${r.tag} with no visible text and no aria-label`);
if (!nameless.length) console.log("  ok    every control has a name");

console.log(`\n=== coverage: every control the markup declares was reached ===\n`);
const reached = new Set(all.map((r) => r.id).filter(Boolean));
for (const s of PAGES) {
  const html = readFileSync(join(repo, "dist", s.file), "utf8");
  const declared = [...html.matchAll(/<(?:button|summary|a)\s[^>]*\bid="([^"]+)"/g)].map((m) => m[1]);
  const missed = declared.filter((id) => !reached.has(id));
  const excused = missed.filter((id) => allow.has(`${s.file}#${id}`));
  excused.forEach((id) => used.add(`${s.file}#${id}`));
  const real = missed.filter((id) => !allow.has(`${s.file}#${id}`));
  console.log(`    ${s.file.padEnd(24)} ${declared.length - missed.length}/${declared.length} reached${excused.length ? `, ${excused.length} declared unreachable` : ""}`);
  for (const id of real) fail(`${s.file}#${id}: declared in the markup and never reached by this sweep`);
}

// LAST, BECAUSE `used` IS NOT COMPLETE UNTIL THE COVERAGE PASS HAS RUN. This
// block sat above it and reported every coverage declaration as unnecessary —
// 79 failures, none of them real, from a gate checking its own bookkeeping
// before the bookkeeping was done.
if (allow.size) {
  console.log(`\n=== declared exceptions · ${allow.size} ===\n`);
  for (const [k, why] of allow) {
    console.log(`    ${k} — ${why}`);
    if (!used.has(k)) fail(`${k} is declared in .control-allow and no longer needs to be — delete the line`);
  }
}

// EVERY CONTROL THE MARKUP DECLARES HAS TO HAVE BEEN LOOKED AT.
//
// This is the half that makes the rest mean something. A sweep can only refuse
// what it reached, and "reached" is invisible from the output: the first version
// of this file reported green over a top bar whose edit actions were laid out at
// 0x0 and a panel that was `hidden`, having never opened a photograph. Both
// directions, like tools/surfaces.mjs: an id in the built page that the sweep
// never saw FAILS, and a declaration for a control that no longer exists FAILS
// too. Read from `dist/`, not the source tree, for the same reason surfaces.mjs
// does — a page can be generated at build time.
console.log(failed ? `\n  ${failed} control(s) to answer for\n` : `\n  every control says what it does, in words the reader can see\n`);
process.exit(failed ? 1 : 0);
