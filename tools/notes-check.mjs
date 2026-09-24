#!/usr/bin/env node
// THE ⓘ ROADMAP IS PARSED OUT OF NOTES.md, AND THE PARSER FAILS TO AN EMPTY LIST.
//
//   node tools/notes-check.mjs
//
// Wired into .branch-guard's `also=`, so it runs on every commit. It is
// milliseconds: it reads one file.
//
// WHY IT EXISTS, and it is not hypothetical. `vite.config.ts` builds the in-app
// Roadmap by finding "## Next capability release", reading the `- [ ]` bullets
// under it, and STOPPING AT THE NEXT `## ` heading. Its whole body is inside a
// try/catch that returns [] — so every way of getting this wrong produces an
// empty roadmap, a clean build, a green deploy, and a dialog with nothing in it.
//
// Measured 2026-09-14: a session appending a section to NOTES.md anchored it on
// the string "## Shipped (roadmap archive)" and used a plain replace. That
// heading is MENTIONED, in quotes, inside the roadmap section's own blockquote,
// 800 lines above the real heading — so the section landed inside the roadmap,
// its `## ` stopped the parser before the first bullet, and **the in-app
// Roadmap went from 18 items to 0**. It shipped to staging and to production
// across five commits and nothing anywhere went red.
//
// So this asserts the OUTPUT of the same parse rather than the shape of the
// file: what the reader would actually see. A count is only a check when
// something knows it should be non-zero.

import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// WHAT THIS CANNOT SEE, said here so its green is not read as more (hub
// LESSONS §352). It refuses a TICKED item left in the open roadmap: the tidy
// mistake. It cannot see the hurried one, an UNTICKED item whose work has
// already shipped, because nothing in NOTES.md says so. A commit that both fixes
// something and files its bullet has to archive the bullet in the same commit.
const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const notes = readFileSync(join(repo, "NOTES.md"), "utf8");
const lines = notes.split("\n");

/** The same walk vite.config.ts does — deliberately a copy of the ALGORITHM and
 *  not an import, because the point is to check what that code will produce. It
 *  is six lines; a shared helper would be a third place to keep in step. */
function checklist(headingRe) {
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return null; // the heading itself is gone
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (m) items.push(m[2]);
  }
  return items;
}

/** Every top-level checkbox bullet under the heading `re`, WITH ITS BOX STATE.
 *
 *  Takes the same heading pattern `checklist` takes.
 *  Returns `[{ done, text }]` in file order, or `[]` when the heading is
 *  missing — the heading's own presence is asserted separately above, so this
 *  never needs to distinguish "no heading" from "no bullets". The tick check
 *  below is its only caller and reads `done`; `checklist` stays the text-only
 *  view because the two vite.config.ts parsers it mirrors are text-only. */
function boxes(re) {
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (m) out.push({ done: m[1] !== " ", text: m[2] });
  }
  return out;
}

/** Every checkbox bullet under the heading `re`, WITH THE BODY THAT FOLLOWS IT.
 *
 *  Takes the same heading pattern the two parsers above take.
 *  Returns `[{ done, text, body }]` in file order, where `body` is the raw lines
 *  between this bullet and the next one (or the next `## `), or `[]` when the
 *  heading is missing. The freshness check below is its only caller and it needs
 *  the body, because an entry's date is almost never on the bullet's own line —
 *  it sits in a "SHIPPED"/"FIXED" paragraph a dozen lines down. */
function entries(re) {
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return [];
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (m) out.push({ done: m[1] !== " ", text: m[2], body: [] });
    else if (out.length) out[out.length - 1].body.push(lines[i]);
  }
  return out;
}

/** The window `notesPage()` in vite.config.ts will actually render, READ OUT OF
 *  THAT FILE rather than restated here.
 *
 *  Takes nothing; reads `vite.config.ts` beside this tool.
 *  Returns `{ size, reversed }` — the `.slice` bound, and whether the chain
 *  reverses the archive before slicing.
 *  THROWS rather than defaulting if the shape is gone. A default would leave
 *  this gate confidently checking a number the app no longer uses, which is the
 *  defect class this repo pays for most often — `tools/patch-note-check.mjs`
 *  reads its two patterns out of the same file for the same reason. */
function renderWindow() {
  const vite = readFileSync(join(repo, "vite.config.ts"), "utf8");
  const at = vite.indexOf("const shipped = checklist(");
  if (at < 0) {
    throw new Error(
      "cannot find `const shipped = checklist(` in vite.config.ts — notesPage() was\n" +
        "      renamed or restructured, so this gate is measuring nothing. Fix the gate.",
    );
  }
  // COMMENTS ARE STRIPPED BEFORE LOOKING FOR THE CALL, and that is load-bearing:
  // the chain's own comment explains the `.reverse()` that was REMOVED, so a
  // plain search for the word finds it in the prose and reports the opposite of
  // the truth. Three gates in this family have read a comment as code.
  const chain = vite.slice(at, vite.indexOf(";", at)).replace(/\/\/[^\n]*/g, "");
  const m = chain.match(/\.slice\(\s*0\s*,\s*(\d+)\s*\)/);
  if (!m) throw new Error("found the shipped chain in vite.config.ts but no `.slice(0, N)` in it. Fix the gate.");
  return { size: Number(m[1]), reversed: /\.reverse\(\s*\)/.test(chain) };
}

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n          got ${JSON.stringify(got)}  want ${JSON.stringify(want)}`}`);
};

console.log("\n=== NOTES.md · what the ⓘ dialog will be built from ===\n");

// Each heading exactly once, AT THE START OF A LINE. Both are mentioned inside
// prose elsewhere in this file, which is exactly how the anchor above went
// wrong, so a bare indexOf is not enough here either.
for (const h of ["## Next capability release", "## Shipped (roadmap archive)"]) {
  const n = lines.filter((l) => l.startsWith(h)).length;
  check(`"${h}" is a heading, exactly once`, n, 1);
}

const road = checklist(/^##\s+Next capability release/i);
const shipped = checklist(/^##\s+Shipped \(roadmap archive\)/i);

if (road === null) { failed++; console.log("  FAIL  the roadmap heading is missing entirely"); }
else {
  console.log(`          roadmap: ${road.length} item(s) — first: ${JSON.stringify((road[0] || "").slice(0, 52))}`);
  check("the roadmap parses to something the dialog can show", road.length > 0, true);
}
if (shipped === null) { failed++; console.log("  FAIL  the archive heading is missing entirely"); }
else {
  console.log(`          archive: ${shipped.length} item(s)`);
  check("the shipped archive parses to something notes.html can show", shipped.length > 0, true);
}

// THE ROADMAP IS WHAT IS COMING, NOT WHAT CAME (owner rule, 2026-09-16). A
// shipped item MOVES to the archive below, and its record reaches the reader
// through the patch notes; leaving it ticked here puts a finished thing in a
// list somebody opened to find out what is NEXT.
//
// EIGHT HAD COLLECTED, and no gate could see them because the two parsers
// disagree about the same section: vite.config.ts's `roadmap()` takes every
// bullet whatever its box, while `notesPage()` filters `!i.done` for that same
// heading. One file, two answers — so the ⓘ dialog showed the ticked ones and
// the public page did not, and nothing was wrong enough to notice. This is the
// half that can refuse.
const ticked = boxes(/^##\s+Next capability release/i).filter((b) => b.done);
if (ticked.length) {
  console.log("          still ticked in the roadmap — move each to the archive:");
  for (const t of ticked) console.log(`            - ${t.text.slice(0, 66)}`);
}
check("the roadmap holds only OPEN items", ticked.length, 0);

// A bullet with no title renders as a blank row. The parser takes the bold span
// or the text before the first em-dash; both empty is a row with nothing in it.
const blank = (road || []).filter((t) => {
  const bold = t.match(/^\*\*(.+?)\*\*/);
  return !((bold ? bold[1] : t.split(" — ")[0]).replace(/\*\*|`|_/g, "").trim());
});
check("every roadmap item has a title to render", blank.length, 0);

// WHAT READERS SEE UNDER "RECENTLY SHIPPED" HAS TO BE RECENT (decision 045).
//
// `notesPage()` renders a WINDOW of the archive, and which entries land in it
// depends on the archive's own order — one fact split across two files. It
// drifted: the chain reversed the section under a comment saying "NOTES keeps
// newest last" while the file ran newest-FIRST, so the window reached back to
// July 2026 and about eighteen of the most recently shipped entries sat outside
// it and never rendered at all. Every check above was green on that, because
// they all ask whether the section PARSES, never whether what it parses to is
// what a reader should be shown.
//
// IT IS NOT A SORTED-ORDER CHECK, and that is from measurement rather than
// taste. On the day this was written the archive had 13 inversions across its 81
// dated pairs and they SURVIVE the fix, so a monotonicity assertion would refuse
// correct work on its first run — and a gate that refuses correct work is one
// somebody switches off. This asserts the property the reader actually cares
// about: nothing in the rendered window is much older than the newest thing in
// the archive. About 80 days before the fix; about 4 after.
// AND IT MEASURES THE DATE AN ENTRY CARRIES, WHICH IS NOT ALWAYS ITS SHIP DATE.
// Only 8 of 114 entries carried an explicit SHIPPED/FIXED date when this was
// written; the rest open with the date the thing was reported or asked for. So
// a ship marker is preferred where there is one and the first date is the
// fallback, and every message below says "dated" rather than "shipped". The
// proxy is safe in this direction — a report never postdates its own fix, so an
// entry cannot look fresher than it is — but a check whose sentence claims more
// than its predicate tests is the defect this file already has a lesson about.
const FRESH_DAYS = 14;
const DATE = /\b(20\d\d-\d\d-\d\d)\b/;
const SHIPPED = /\*\*(?:SHIPPED|FIXED|DONE|LANDED)\b[^*]*?(20\d\d-\d\d-\d\d)/i;
const dateOf = (e) => {
  const all = `${e.text}\n${e.body.join("\n")}`;
  return (all.match(SHIPPED) || all.match(DATE) || [])[1] ?? null;
};
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);

/** THE `Shown as:` PATTERN, READ OUT OF vite.config.ts, as roadmap-copy-check
 *  reads it. Takes nothing. Returns the RegExp the build parses NOTES.md with,
 *  so this gate and notesPage() agree on which entries render. Throws when it is
 *  no longer a one-line literal, so a rename cannot make the two disagree quietly. */
function shownAsPattern() {
  const src = readFileSync(join(repo, "vite.config.ts"), "utf8");
  const m = src.match(/^const SHOWN_AS = (\/.*\/[a-z]*);$/m);
  if (!m) throw new Error("vite.config.ts no longer declares SHOWN_AS as a one-line regex literal. Fix the reader rather than copying the pattern here.");
  return new RegExp(m[1].replace(/^\//, "").replace(/\/[a-z]*$/, ""), m[1].match(/\/([a-z]*)$/)[1]);
}

// THE WINDOW IS WHAT RENDERS, NOT WHAT THE SLICE BOUND SAYS. notesPage() drops
// an entry with no `Shown as:` line, or one declared `internal`, BEFORE it
// slices. This used to slice the unfiltered archive and print "shows the FIRST
// 12" while the page carried 5, because entries archived before 2026-09-22
// predate the line. So the filter is the build's own, and the count printed is
// the count rendered.
const SHOWN_AS = shownAsPattern();
const shownLineOf = (e) => { for (const l of e.body) { const m = l.match(SHOWN_AS); if (m) return m[1].trim(); } return ""; };
const arch = entries(/^##\s+Shipped \(roadmap archive\)/i).filter((e) => e.done);
const renders = arch.filter((e) => { const t = shownLineOf(e); return t && !/^internal$/i.test(t); });
const win = renderWindow();
const shown = (win.reversed ? [...renders].reverse() : renders).slice(0, win.size);
const allDates = arch.map(dateOf).filter(Boolean).sort();
const newest = allDates[allDates.length - 1];
const shownDated = shown.map((e) => ({ e, d: dateOf(e) })).filter((x) => x.d);
const undated = shown.length - shownDated.length;

// PRINTED ON EVERY RUN, pass or fail — the two-exposure design the decision
// records and plan-scope-check already use. A number nobody reads is not a check.
console.log(
  `          notes.html renders ${shown.length} entr${shown.length === 1 ? "y" : "ies"}: ` +
    `${win.reversed ? "the LAST" : "the FIRST"} ${win.size} of the ${renders.length} archived item(s) that carry a ` +
    `Shown as: line (${arch.length - renders.length} of ${arch.length} do not), read from vite.config.ts`,
);
check("notes.html renders at least one shipped entry", shown.length > 0, true);

if (!newest || !shownDated.length) {
  console.log(`  ok    no dated archive entry to measure freshness against (${undated} undated in the window)`);
} else {
  const stale = shownDated.filter((x) => daysBetween(x.d, newest) > FRESH_DAYS);
  const oldestShown = shownDated.map((x) => x.d).sort()[0];
  console.log(
    `          newest date in the archive: ${newest}; oldest in the window: ${oldestShown} ` +
      `(span ${daysBetween(oldestShown, newest)}d, limit ${FRESH_DAYS}d; ${undated} undated, not judged)`,
  );
  if (stale.length) {
    console.log("          these are in the window and are not recent — the archive's order and notesPage() disagree:");
    for (const x of stale.slice(0, 6)) console.log(`            - ${x.d}  ${x.e.text.replace(/\*\*/g, "").slice(0, 60)}`);
    if (stale.length > 6) console.log(`            … and ${stale.length - 6} more`);
  }
  check(`everything in the rendered window is dated within ${FRESH_DAYS} days of the newest`, stale.length, 0);
}

console.log(failed ? `\n  ${failed} check(s) failed\n` : "\n  the ⓘ roadmap and the archive both have content\n");
process.exit(failed ? 1 : 0);
