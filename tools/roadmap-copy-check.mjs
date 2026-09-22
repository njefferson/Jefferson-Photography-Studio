#!/usr/bin/env node
// THE ⓘ DIALOG'S ROADMAP IS READER COPY, AND IT WAS THE DECISION TITLES.
//
// Reported from the device 2026-09-22. The roadmap behind the ⓘ was rendering
// each open bullet's BOLD TITLE, and a bold title is a decision title: written
// to be argued with, ranked, and cited by key. Twenty-six of them were on that
// screen and not one was written for somebody holding the app — "A mask keys
// the photograph, not the grade", "Colour cannot finish a selection an occluder
// has split", "(superseded detail) The live view at full resolution".
//
// So every open bullet declares its own `Shown as:` line and that is what
// ships. This refuses the commit when one is missing, because a missing line
// used to mean the title fell through to the screen and nothing said so —
// vite.config.ts now drops such a bullet instead of guessing, which is safe but
// SILENT, and a roadmap quietly losing items is its own defect.
//
// THE PATTERN IS READ OUT OF vite.config.ts, not copied. `SHOWN_AS` is declared
// there because the build parses it; one rule in two places, one of them
// updated, is the defect class this repository has the most lessons about, and
// `tools/patch-note-check.mjs` beside this already reads its two filters the
// same way.
//
// `internal` IS A REAL ANSWER. Some queue items are not changes anybody can
// see — a walk's coverage, a record kept open on purpose so its reasoning is
// not re-derived. Those say `internal` and are left out of the reader's list
// rather than dressed up for it. Saying so is the point: the bullet has
// answered the question.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { internalWords } from "./reader-words.mjs";

const root = process.argv.find((a) => a.startsWith("--repo="))?.slice(7) ?? ".";
let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`ok    ${s}`);

/** THE `Shown as:` PATTERN, READ OUT OF vite.config.ts.
 *
 *  Takes `repo`, the repository root. Returns the RegExp declared there as
 *  `SHOWN_AS`, which is the one the build actually parses NOTES.md with.
 *  Throws when it is absent or is no longer a one-line literal.
 *
 *  What the caller relies on: this gate and the build agree about what counts
 *  as a declared line, because there is one literal and this reads it. */
function shownAsPattern(repo) {
  const src = readFileSync(join(repo, "vite.config.ts"), "utf8");
  const m = src.match(/^const SHOWN_AS = (\/.*\/[a-z]*);$/m);
  if (!m) throw new Error("vite.config.ts no longer declares SHOWN_AS as a one-line regex literal — this gate reads it from there on purpose, so fix the reader rather than copying the pattern here");
  const body = m[1].replace(/^\//, "").replace(/\/[a-z]*$/, "");
  const flags = m[1].match(/\/([a-z]*)$/)[1];
  return new RegExp(body, flags);
}

console.log("\n=== roadmap copy · the ⓘ dialog's own words ===\n");

const SHOWN_AS = shownAsPattern(root);
const lines = readFileSync(join(root, "NOTES.md"), "utf8").split("\n");
const start = lines.findIndex((l) => /^##\s+Next capability release/i.test(l));
if (start < 0) { console.log("FAIL  NOTES.md has no \"Next capability release\" heading — the roadmap has no source"); process.exit(1); }

const shown = [], hidden = [];
for (let i = start + 1; i < lines.length; i++) {
  if (/^##\s/.test(lines[i])) break;
  const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
  if (!m) continue;
  if (m[1].toLowerCase() === "x") continue;           // shipped; it lives in the archive
  const key = (m[2].match(/decision:\s*(\d+)/) || [])[1] ?? "??";
  const title = (m[2].match(/^\*\*(.+?)\*\*/) || [null, m[2].split(" — ")[0]])[1].replace(/\*\*|`|_/g, "").trim();

  let line = "";
  for (let j = i + 1; j < lines.length; j++) {
    if (/^-\s+\[[ xX]\]\s/.test(lines[j]) || /^##\s/.test(lines[j])) break;
    const sa = lines[j].match(SHOWN_AS);
    if (sa) { line = sa[1].trim(); break; }
  }

  if (!line) { fail(`${key} has no "Shown as:" line, so the reader would be shown nothing or shown "${title}"`); continue; }
  if (/^internal$/i.test(line)) { hidden.push([key, title]); continue; }

  const words = internalWords(line);
  if (words.length) fail(`${key}: the reader's line says ${words.map((w) => `"${w}"`).join(", ")} — ${line}`);
  shown.push([key, line]);
}

// PRINT IT ON EVERY RUN, pass or fail. The same two-exposure design the
// decision gate uses: no parser tells reading from having-read, so the words
// the app will put on somebody's screen arrive unasked at the commit boundary.
console.log(`  the reader is shown ${shown.length} line(s):\n`);
for (const [key, line] of shown) console.log(`    ${key}  ${line}`);
if (hidden.length) {
  console.log(`\n  ${hidden.length} declared internal — real work, no visible change:\n`);
  for (const [key, title] of hidden) console.log(`    ${key}  ${title}`);
}
console.log("");
if (!bad) ok("every open item says how it says itself, in the reader's words");
console.log(bad ? `\n${bad} failed\n` : "");
process.exit(bad ? 1 : 0);
