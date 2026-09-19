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

// ---- 3b. A RECORD ABOUT PICTURES NAMES THE PICTURES IT OPENED.
//
// THE OWNER'S INSTRUCTION, 2026-09-19, in those words: this is a VISUAL APP,
// not a MATH APP. Store it as a lesson and gate decision outcomes by it.
// (Hub LESSONS §328.)
//
// WHAT IT COST. A look's amounts were chosen from SEVEN rendered comparison
// sheets. Five were sent to the owner. NONE were opened. Four rounds of
// analysis about how the photographs look -- a named recommendation, an
// "exchange rate" of colour gained per unit of noise, a paragraph on what each
// candidate costs -- were written off saturation figures and a chroma residual
// pooled into blocks. Opening all seven took one pass and found two defects
// that were shipping: a grey asphalt car park covered in red speckle in a frame
// summarised as "overcast, the gate holds it grey", and a foliage amount taken
// from a range ("0.59 to 0.82") read as uniform when its top end is a flat
// crimson mass. It also found a frame with NO SKY IN IT sitting in a seven-frame
// sky corpus, its grey flower stems reported for days as "hazy sky staying
// grey"; and that the residual the whole recommendation rested on is invisible
// on the very frame where it was most dramatic.
//
// WHY IT IS MECHANICAL. No parser tells looking from claiming to have looked.
// What a parser CAN do is compare two lists. A record that names frame
// identifiers must carry "## Looked at", and every frame named ANYWHERE in the
// record must appear in it -- measure seven, look at two, report on seven, and
// the commit is refused. BOTH DIRECTIONS, like every other declared list in
// this family, so the section cannot be padded with frames the record does not
// otherwise discuss.
//
// AND WHY A PARAGRAPH WAS NOT ENOUGH. CLAUDE.md already carried "A LOOK CHOICE
// IS SHOWN, NEVER DESCRIBED" -- render the candidates, send the pictures, never
// substitute adjectives. That rule was followed to the letter: the candidates
// were rendered and the pictures were sent. It says how to present a choice to
// the OWNER. It never said the session must open what it rendered before
// reasoning about it, and a rule obeyed while the failure happens inside it is
// a rule that needed a mechanism.
const FRAME = /\bNIR_\d{4}\b/g;
const ALLOW = join(DIR, "..", "..", ".looked-allow");
const allowed = new Map();
const allowRows = [];
if (existsSync(ALLOW)) {
  for (const line of readFileSync(ALLOW, "utf8").split("\n")) {
    const t = line.replace(/#.*$/, "").trim();
    if (!t) continue;
    const [file, ...frames] = t.split(/\s+/);
    allowed.set(file, new Set(frames));
    allowRows.push(`${file}: ${frames.join(" ")}`);
  }
}
for (const [k, f] of byKey) {
  if (!claimed.has(k)) continue;
  const text = readFileSync(join(DIR, f), "utf8");
  const looked = body(text, "Looked at");
  // Frames named outside the "## Looked at" section itself.
  const elsewhere = new Set([...text.replace(looked ? looked : "", "").matchAll(FRAME)].map((m) => m[0]));
  const seen = new Set(looked ? [...looked.matchAll(FRAME)].map((m) => m[0]) : []);
  if (!elsewhere.size && !seen.size) continue;          // not a record about pictures
  // THE BACKLOG THAT PREDATES THE RULE, declared per record+frame in
  // .looked-allow, checked both ways and printed on every run, so it can only
  // shrink. Same shape as .contract-allow and .scope-allow, and for the same
  // reason: switching a rule on across a repo that has never had it either
  // blocks all work or gets switched off, and a declared list is the third
  // option. A frame on this list is an ADMISSION that a record cites a
  // measurement nobody looked at -- not an exemption from looking. Take one off
  // by opening the render and writing what it showed.
  for (const n of [...allowed.get(f) || []]) elsewhere.delete(n);
  if (!elsewhere.size && !seen.size) continue;
  if (!looked) {
    fail(`docs/decisions/${f} names ${elsewhere.size} frame(s) and has no "## Looked at". `
       + `A number is a pointer to where to look, never a substitute for looking (LESSONS 328).`);
    continue;
  }
  const unopened = [...elsewhere].filter((n) => !seen.has(n)).sort();
  if (unopened.length) {
    fail(`docs/decisions/${f} measures ${unopened.join(", ")} but "## Looked at" does not name `
       + `${unopened.length === 1 ? "it" : "them"}. Open the render and say what it showed, or stop citing the frame.`);
  }
  const padded = [...seen].filter((n) => !elsewhere.has(n)).sort();
  if (padded.length) {
    fail(`docs/decisions/${f} lists ${padded.join(", ")} under "## Looked at" and discusses `
       + `${padded.length === 1 ? "it" : "them"} nowhere else. The section is not a checklist to pad.`);
  }
}
// BOTH DIRECTIONS ON THE BACKLOG TOO: a declared pair whose record no longer
// cites that frame is a stale excuse, and a stale excuse is how a list stops
// shrinking without anyone noticing.
for (const [f, frames] of allowed) {
  if (!existsSync(join(DIR, f))) { fail(`.looked-allow names ${f}, which is not a decision record.`); continue; }
  const text = readFileSync(join(DIR, f), "utf8");
  const cited = new Set([...text.matchAll(FRAME)].map((m) => m[0]));
  const stale = [...frames].filter((n) => !cited.has(n)).sort();
  if (stale.length) fail(`.looked-allow excuses ${f} for ${stale.join(", ")}, which it no longer cites. Remove the row.`);
}
if (allowRows.length) {
  console.log(`\n  unlooked backlog (${allowRows.length} record${allowRows.length === 1 ? "" : "s"}) — cited from measurement, never opened:`);
  for (const r of allowRows) console.log(`    ${r}`);
}
if (!bad) ok(`every record about pictures names the frames it opened, both ways`);

// ---- 4. THE RANK IS THE FILE ORDER, so it is printed rather than asserted:
// nothing can check that a priority is CORRECT, only that it is visible.
if (!bad) {
  console.log("\n  rank (roadmap file order):");
  open.forEach((item, i) => console.log(`    ${String(i + 1).padStart(2)}. ${keyOf(item.text)}  ${titleOf(item.text)}`));
}

console.log(bad ? `\n${bad} FAILED\n` : "\n  every open item carries its research, what it was weighed against, and why.\n");
process.exit(bad ? 1 : 0);
