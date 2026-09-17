#!/usr/bin/env node
// EVERY ROADMAP ITEM CARRIES ITS REASONING, AND THE TWO CANNOT DRIFT APART.
//
//   node tools/decisions-check.mjs
//
// Wired into .branch-guard's `also=`, so it runs on every commit. Text only, one
// directory and one file read, milliseconds.
//
// ## Why it exists
//
// An idea for this app had nothing structured to be compared against. The
// roadmap in NOTES.md is a ranked list of titles; the reasoning for past work is
// spread across fifteen thousand lines of dated sections that no item links to;
// and NOTHING ANYWHERE RECORDED WHAT WAS CONSIDERED AND REJECTED. So rejected
// ideas got re-derived, and work got added to piles already known to be piles.
//
// Measured 2026-09-16, both halves in one evening. A fitted eight-band array was
// added to a look system already known to be a scatter of fitted constants, and
// nothing at decision time said so. And the 150-degree batch/open divergence went
// through three diagnoses — gray-world balance, the channel swap, the depth lift
// — each abandoned with a sentence in chat, none recorded, so a fourth attempt
// would have started from zero for the fourth time.
//
// ## The shape is MADR's, not one invented here
//
// Markdown Architectural Decision Records (adr.github.io/madr) put Considered
// Options and a per-option walk through the REJECTED alternatives at the centre
// of the record, for the reason that source states plainly: most decisions are
// interesting because there were two or three viable options, and recording only
// the winner discards the analysis. The sections below are that template trimmed
// to what this app's process actually needs.
//
// ## What it checks, both directions
//
// Both directions is the whole point. A one-way check lets a record be deleted
// while its bullet stands, or a bullet be dropped while its record rots —
// `.contract-allow`, `surfaces.mjs` and `architecture-check.mjs` in this repo are
// all two-way for the same reason.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = join(repo, "docs/decisions");
const lines = readFileSync(join(repo, "NOTES.md"), "utf8").split("\n");

let bad = 0;
const fail = (s) => { bad++; console.log(`FAIL  ${s}`); };
const ok = (s) => console.log(`  ok    ${s}`);

/** THE SAME WALK vite.config.ts DOES, deliberately a copy and not an import.
 *
 *  Takes a heading pattern; returns `[{ done, text }]` for the top-level
 *  checkbox bullets under it, in file order, stopping at the next `## `.
 *  tools/notes-check.mjs states the reason for copying rather than sharing: the
 *  point is to check what the BUILD will produce, and a shared helper would be a
 *  third place to keep in step. File order IS rank order — that is the roadmap's
 *  stated convention, so the index of an item is its priority. */
function boxes(headingRe) {
  const start = lines.findIndex((l) => headingRe.test(l));
  if (start < 0) return null;
  const items = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break;
    const m = lines[i].match(/^-\s+\[([ xX])\]\s+(.+)$/);
    if (m) items.push({ done: m[1].toLowerCase() === "x", text: m[2], line: i + 1 });
  }
  return items;
}

/** The record key an item declares, or null.
 *
 *  Takes a bullet's text. Returns the three-digit key from a trailing
 *  `<!-- decision: NNN -->`. An HTML comment is used so the key is invisible to
 *  the in-app ⓘ dialog, which renders each bullet's leading bold span — the key
 *  must never reach a reader's screen, and it must not disturb the bullet regex
 *  above, which takes everything after the checkbox as one blob. */
const keyOf = (text) => (text.match(/<!--\s*decision:\s*(\d{3})\s*-->/) ?? [])[1] ?? null;

/** The first bold span of a bullet, which is what the dialog shows and what a
 *  human calls the item. Takes the bullet text; returns the title or the first
 *  60 characters when a bullet has no bold span (notes-check refuses those, so
 *  this is only a fallback for a readable message). */
const titleOf = (text) => (text.match(/\*\*(.+?)\*\*/) ?? [, text.slice(0, 60)])[1];

const open = boxes(/^##\s+Next capability release/i);
const archived = boxes(/^##\s+Shipped \(roadmap archive\)/i);
if (!open || !archived) {
  fail("NOTES.md is missing the roadmap or the archive heading — notes-check.mjs says more");
  process.exit(1);
}

console.log(`\n=== decision records · ${open.length} open, ${archived.length} archived ===\n`);

// ---- 1. EVERY OPEN ITEM HAS A KEY, AND THAT RECORD EXISTS.
const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^\d{3}-.+\.md$/.test(f)) : [];
const byKey = new Map(files.map((f) => [f.slice(0, 3), f]));
const claimed = new Set();
for (const item of open) {
  const k = keyOf(item.text);
  if (!k) { fail(`roadmap line ${item.line}, "${titleOf(item.text)}" has no <!-- decision: NNN --> key`); continue; }
  if (!byKey.has(k)) { fail(`roadmap line ${item.line}, "${titleOf(item.text)}" names decision ${k}, which does not exist in docs/decisions/`); continue; }
  claimed.add(k);
}
// An ARCHIVED item may carry a key; it is not required, because the archive
// predates this system by 93 entries and backfilling those would be inventing
// reasoning nobody has. What is required is that a key it DOES carry resolves.
for (const item of archived) {
  const k = keyOf(item.text);
  if (!k) continue;
  if (!byKey.has(k)) { fail(`archived "${titleOf(item.text)}" names decision ${k}, which does not exist`); continue; }
  claimed.add(k);
}
if (!bad) ok(`every roadmap item that names a record has one (${claimed.size} claimed)`);

// ---- 2. AND THE OTHER DIRECTION: no orphan records.
for (const [k, f] of byKey) {
  if (!claimed.has(k)) fail(`docs/decisions/${f} is claimed by no roadmap item — delete it or put its key back on the bullet`);
}

// ---- 2b. A RECORD IS ABOUT THE ITEM THAT CLAIMS IT.
//
// Existence is not enough and this check is why. The backfill assigned keys in
// roadmap order and wrote the records in a different order, so two of eleven
// were swapped — 006 held the tiles item's reasoning under the mask item's key.
// Checks 1 and 2 were both green: each key resolved, each record was claimed.
// **A gate that only counts is a gate that says a filing cabinet is full.**
//
// The title comparison is deliberately loose. A record's `# NNN · Title` is
// written for a human and a roadmap bullet's bold span carries em-dashes,
// slashes and parenthetical asides, so an exact match would fail on honest
// edits and get the gate switched off. Comparing significant WORDS catches a
// record that is about a different item entirely, which is the only failure
// that matters here.
const words = (s) => new Set(String(s).toLowerCase().replace(/[^a-z0-9 ]+/g, " ")
  .split(/\s+/).filter((w) => w.length > 3));
for (const item of [...open, ...archived]) {
  const k = keyOf(item.text);
  if (!k || !byKey.has(k)) continue;
  const head = readFileSync(join(DIR, byKey.get(k)), "utf8").split("\n")[0] ?? "";
  const want = words(titleOf(item.text));
  const got = words(head.replace(/^#\s*\d{3}\s*[·.-]?\s*/, ""));
  if (!want.size) continue;
  const shared = [...want].filter((w) => got.has(w)).length;
  if (shared / want.size < 0.5) {
    fail(`docs/decisions/${byKey.get(k)} is titled "${head.replace(/^#\s*/, "")}" but is claimed by "${titleOf(item.text)}" — the record is about a different item`);
  }
}
if (!bad) ok("every record is about the item that claims it");

// ---- 3. EVERY RECORD IS FILLED IN. A heading with nothing under it is the
// slot this whole system exists to refuse: the shape of having done the
// thinking, without the thinking.
const OPEN_SECTIONS = ["Context", "Looked up", "Weighed against", "Options", "Rejected", "Rank"];
const body = (text, h) => {
  const m = text.match(new RegExp(`^##\\s+${h}\\b[^\\n]*\\n([\\s\\S]*?)(?=^##\\s|$(?![\\s\\S]))`, "mi"));
  return m ? m[1].trim() : null;
};
for (const [k, f] of byKey) {
  if (!claimed.has(k)) continue;
  const text = readFileSync(join(DIR, f), "utf8");
  const isArchived = archived.some((i) => keyOf(i.text) === k);
  const need = isArchived ? [...OPEN_SECTIONS, "Outcome"] : OPEN_SECTIONS;
  const thin = need.filter((h) => {
    const b = body(text, h);
    return !b || b.replace(/\s+/g, " ").length < 40;
  });
  if (thin.length) fail(`docs/decisions/${f} has no real body under ${thin.map((t) => `"## ${t}"`).join(", ")}`);
}
if (!bad) ok(`every record carries all ${OPEN_SECTIONS.length} sections with a body`);

// ---- 4. THE RANK IS THE FILE ORDER, so it is printed rather than asserted:
// nothing can check that a priority is CORRECT, only that it is visible.
if (!bad) {
  console.log("\n  rank (roadmap file order):");
  open.forEach((item, i) => console.log(`    ${String(i + 1).padStart(2)}. ${keyOf(item.text)}  ${titleOf(item.text)}`));
}

console.log(bad ? `\n${bad} FAILED\n` : "\n  every open item carries its research, what it was weighed against, and why.\n");
process.exit(bad ? 1 : 0);
