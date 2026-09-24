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
// A RECORD SAYS WHAT WAS WRONG AND WHAT IT MEASURED, NEVER WHO SAID IT OR WHERE.
// Measured 2026-09-24: two records opened with a chat message pasted in after
// "Reported in chat", a third credited its decisions to "the reader's
// follow-up", and every privacy gate passed, because each of those patterns
// anchors on a name or on "the owner" and none of these carried either. These
// are the shapes that got through, and they are refused in every record, open
// or archived. "The reader wants X" stays legal: a record describing what
// readers in general want is the job. Only provenance is refused.
const PROVENANCE = [
  [/\b(?:asked|reported|said|filed|raised|mentioned|told)\s+in\s+(?:the\s+|this\s+)?(?:session'?s?\s+)?chat\b/i, "chat provenance"],
  [/\bin\s+(?:this|the)\s+(?:session'?s?\s+)?chat\b/i, "chat provenance"],
  [/\bthe\s+reader'?s\s+follow-up\b/i, "a decision credited to a reader"],
  [/\bthe\s+reader\s+asked\b/i, "a request credited to a reader"],
  [/\bowner[- ](?:report|ask|asked|caught)\b/i, "a report credited by role"],
  [/\(owner[,)]/i, "a report credited by role"],
];
let provenanceHits = 0;
for (const f of files) {
  const text = readFileSync(join(DIR, f), "utf8");
  text.split("\n").forEach((line, i) => {
    for (const [re, what] of PROVENANCE) {
      if (re.test(line)) { provenanceHits++; fail(`docs/decisions/${f}:${i + 1} carries ${what}. Say what was wrong and what it measured; never who said it or where.`); }
    }
  });
}
if (!provenanceHits) ok("no record says who asked, or that it was asked in chat");

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

// ---- 3c. THE QUEUE'S DEPENDENCIES, DECLARED AND CHECKED.
//
// The roadmap's ORDER is its priority, and until now the REASON for an order
// lived only in prose. Nothing could read it, so nothing checked it, and the
// order could be changed by anyone without the reasoning noticing.
//
// WHAT IT COST, and it is sitting in the queue rather than hypothetical: item
// 010 is titled "(superseded detail) The live view at full resolution", its own
// record opens with "Superseded by 009 and grouped with it and 011", and it has
// been sitting OPEN, below eighteen other things, because nothing ever forced
// the question. An obsolete item that nobody is required to look at is
// indistinguishable from a real one.
//
// THE EDGES WERE ALREADY WRITTEN. 010 carries a supersede and a grouping; 013
// says it overlaps the highlight roll-off work and that the two should be
// measured together and NOT fixed in the same change; 016 says 013 looks like
// the same defect and deliberately is not -- 013 owns the chroma blotch, 016
// owns the luminance texture. This gives that prose a shape it can be read in.
// It does not invent relationships.
//
// ONE DIRECTION IS EVER DECLARED. "A needs B" is also "B blocks A", and both
// are printed from the one line, because the question is asked in both
// directions -- why is this ahead of that, and what is waiting on this.
const EDGE_KINDS = ["needs", "superseded-by", "together", "touches", "distinct-from"];
const EDGE_RE = new RegExp(`^\\s*-\\s+(${EDGE_KINDS.join("|")})\\s+(\\d{3})\\b\\s*(?:—|--|-|:)?\\s*(.*)$`, "i");

/** The edges a record declares.
 *
 *  Takes a record's full text; returns one entry per declared edge, each with
 *  its `kind`, the key it points `to`, and the `why` written on the same line.
 *
 *  What the result must satisfy: a line that LOOKS like an edge and names an
 *  unknown kind is not silently dropped -- section 3c below refuses it -- so
 *  this returning nothing for a "## Depends" that has content is a failure, not
 *  an empty graph. */
function dependsOf(text) {
  const b = body(text, "Depends");
  if (!b) return [];
  const out = [];
  for (const line of b.split("\n")) {
    const m = EDGE_RE.exec(line);
    if (m) out.push({ kind: m[1].toLowerCase(), to: m[2], why: m[3].trim() });
    else if (/^\s*-\s+\S/.test(line)) out.push({ kind: null, raw: line.trim() });
  }
  return out;
}

/** The decision keys a record CITES in prose, in this repo's own citation
 *  forms only.
 *
 *  Takes the record text and its own key; returns the set of other keys it
 *  names as `**NNN**`, `` `NNN` ``, "decision NNN", or a bold span opening with
 *  the number.
 *
 *  What the result must satisfy, and it is the whole reason the patterns are
 *  narrow: a first pass matched any three-digit run and pulled in IR-SCIENCE
 *  section numbers and measured values -- 052, 064, 081 -- across most of the
 *  records. A detector that flags noise produces a backlog nobody reads, which
 *  is the failure hub LESSONS 332 is about. The "## Depends" section is cut out
 *  first, so a declared edge is never its own evidence of being undeclared. */
function citesOf(text, self) {
  const cut = text.replace(/^##\s+Depends\b[\s\S]*?(?=^##\s|$(?![\s\S]))/mi, "");
  const body_ = cut.replace(/^#\s+.*$/m, ""); // the title line names its own key
  const found = new Set();
  for (const re of [/\*\*(\d{3})\b/g, /`(\d{3})`/g, /\bdecisions?\s+(\d{3})\b/gi]) {
    for (const m of body_.matchAll(re)) if (m[1] !== self) found.add(m[1]);
  }
  return found;
}

const rankOf = new Map(open.map((item, i) => [keyOf(item.text), i]));
const isArchivedKey = new Set(archived.map((i) => keyOf(i.text)).filter(Boolean));
const edges = new Map();   // key -> declared edges
for (const [k, f] of byKey) {
  if (!claimed.has(k)) continue;
  edges.set(k, dependsOf(readFileSync(join(DIR, f), "utf8")));
}

for (const [k, list] of edges) {
  const f = byKey.get(k);
  for (const e of list) {
    if (!e.kind) { fail(`docs/decisions/${f} has a "## Depends" line that names no relation: ${e.raw.slice(0, 90)}. Use one of ${EDGE_KINDS.join(", ")}.`); continue; }
    if (e.to === k) { fail(`docs/decisions/${f} declares ${e.kind} on itself.`); continue; }
    if (!byKey.has(e.to)) { fail(`docs/decisions/${f} declares ${e.kind} ${e.to}, which is not a record.`); continue; }
    if (!e.why) fail(`docs/decisions/${f} declares ${e.kind} ${e.to} with no reason on the line. The reason is the point.`);
  }
}

// A cycle in `needs` is an order nothing can satisfy, and it reads as a
// perfectly sensible pair of sentences from inside either record.
{
  const seen = new Map(); // 0 visiting, 1 done
  const path = [];
  const walk = (k) => {
    if (seen.get(k) === 1) return;
    if (seen.get(k) === 0) { fail(`needs makes a cycle: ${[...path.slice(path.indexOf(k)), k].join(" -> ")}. Nothing can be built first.`); return; }
    seen.set(k, 0); path.push(k);
    for (const e of edges.get(k) ?? []) if (e.kind === "needs" && byKey.has(e.to)) walk(e.to);
    path.pop(); seen.set(k, 1);
  };
  for (const k of edges.keys()) walk(k);
}

// THE CHECK THAT MAKES THE REASONING LOAD-BEARING: the order must not
// contradict what the records say about it.
for (const [k, list] of edges) {
  if (!rankOf.has(k)) continue;                       // archived items are done
  for (const e of list) {
    if (e.kind === "needs") {
      if (isArchivedKey.has(e.to)) continue;          // already shipped: satisfied
      if (!rankOf.has(e.to)) continue;                // not on the queue at all
      if (rankOf.get(e.to) > rankOf.get(k)) {
        fail(`${k} needs ${e.to} and sits ABOVE it (rank ${rankOf.get(k) + 1} against ${rankOf.get(e.to) + 1}). `
          + `Either the order is wrong or the edge is: "${e.why.slice(0, 80)}"`);
      }
    }
    if (e.kind === "superseded-by" && isArchivedKey.has(e.to)) {
      fail(`${k} is still OPEN at rank ${rankOf.get(k) + 1} and says it is superseded by ${e.to}, which has SHIPPED. `
        + `Archive it, or drop the edge and say what survived: "${e.why.slice(0, 80)}"`);
    }
  }
}

// CITED IN PROSE, RELATION UNDECLARED. This is what grows the graph out of what
// is already written instead of out of somebody's memory.
const dependsAllowFile = join(repo, ".depends-allow");
const dependsAllow = existsSync(dependsAllowFile)
  ? readFileSync(dependsAllowFile, "utf8").split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean)
  : [];
const dependsAllowed = new Set(dependsAllow);
const usedAllow = new Set();
const undeclared = [];
for (const [k, list] of edges) {
  const f = byKey.get(k);
  const declared = new Set(list.filter((e) => e.kind).map((e) => e.to));
  for (const to of citesOf(readFileSync(join(DIR, f), "utf8"), k)) {
    if (!byKey.has(to) || declared.has(to)) continue;
    const row = `${k} ${to}`;
    if (dependsAllowed.has(row)) { usedAllow.add(row); continue; }
    undeclared.push(`${k} cites ${to} and declares no relation to it`);
  }
}
for (const row of undeclared) fail(`${row}. Add a "## Depends" line (${EDGE_KINDS.join(" / ")}) or declare the pair in .depends-allow.`);
for (const row of dependsAllow) {
  if (!usedAllow.has(row)) fail(`.depends-allow excuses "${row}", which no longer cites it. Remove the row.`);
}
if (dependsAllow.length) {
  console.log(`\n  undeclared pairs (${dependsAllow.length}) — cited in prose, relation never stated:`);
  for (const r of dependsAllow) console.log(`    ${r}`);
}
if (!bad) ok(`every declared dependency is real, acyclic, and agrees with the order`);

// ---- 4. THE RANK IS THE FILE ORDER, so it is printed rather than asserted:
// nothing can check that a priority is CORRECT, only that it is visible.
if (!bad) {
  console.log("\n  rank (roadmap file order):");
  // AND WHAT HOLDS EACH ONE THERE. A rank with no reason beside it is a number
  // somebody can change; a rank that prints "after 013" is a number with an
  // argument attached, and the argument is checked above.
  const blockedBy = (k) => (edges.get(k) ?? []).filter((e) => e.kind === "needs")
    .map((e) => isArchivedKey.has(e.to) ? null : e.to).filter(Boolean);
  const blocks = (k) => [...edges].filter(([, l]) => l.some((e) => e.kind === "needs" && e.to === k))
    .map(([o]) => o).filter((o) => rankOf.has(o));
  open.forEach((item, i) => {
    const k = keyOf(item.text);
    const after = blockedBy(k), before = blocks(k);
    const why = [after.length ? `after ${after.join(", ")}` : "", before.length ? `holds ${before.join(", ")}` : ""]
      .filter(Boolean).join(" · ");
    console.log(`    ${String(i + 1).padStart(2)}. ${k}  ${titleOf(item.text)}${why ? `   [${why}]` : ""}`);
  });

  // ---- 4b. THE QUESTIONS THE ORDER CANNOT ANSWER ON ITS OWN, printed on
  // request. `--graph` is read-only and is for a session or a person thinking
  // about the queue rather than committing to it: where a new item has to go,
  // what has quietly gone obsolete, what is one piece of work filed as two,
  // and which pairs claim the same ground.
  if (process.argv.includes("--graph")) {
    const title = (k) => {
      const it = [...open, ...archived].find((i) => keyOf(i.text) === k);
      return it ? titleOf(it.text) : k;
    };
    const where = (k) => rankOf.has(k) ? `rank ${rankOf.get(k) + 1}` : "shipped";
    const pairs = (kind) => {
      const out = [];
      for (const [k, l] of edges) for (const e of l) if (e.kind === kind) out.push([k, e.to, e.why]);
      return out;
    };

    console.log("\n=== the queue as a graph ===");

    const obsolete = pairs("superseded-by");
    console.log(`\n  OBSOLETE OR BECOMING SO (${obsolete.length}) — the item is replaced by other work:`);
    for (const [k, to, why] of obsolete) {
      const state = isArchivedKey.has(to) ? "SHIPPED — archive this one or say what survived" : `${where(to)}, not yet shipped`;
      console.log(`    ${k} (${where(k)}) superseded by ${to} [${state}]`);
      console.log(`       ${title(k)}`);
      console.log(`       ${why.slice(0, 100)}`);
    }
    if (!obsolete.length) console.log("    none declared.");

    const tog = pairs("together");
    console.log(`\n  ONE PIECE OF WORK, FILED AS TWO (${tog.length}):`);
    for (const [k, to, why] of tog) {
      const apart = rankOf.has(k) && rankOf.has(to) ? Math.abs(rankOf.get(k) - rankOf.get(to)) : null;
      console.log(`    ${k} + ${to}  (${where(k)} and ${where(to)}${apart !== null ? `, ${apart} apart` : ""})`);
      console.log(`       ${why.slice(0, 100)}`);
    }
    if (!tog.length) console.log("    none declared.");

    const tou = pairs("touches");
    console.log(`\n  SAME GROUND — a change to one may move the other (${tou.length}):`);
    for (const [k, to, why] of tou) {
      console.log(`    ${k} (${where(k)}) touches ${to} (${where(to)})`);
      console.log(`       ${why.slice(0, 100)}`);
    }
    if (!tou.length) console.log("    none declared.");

    // CONTENDED GROUND, derived rather than declared: one item everything else
    // is waiting on the answer from. It falls straight out of the touches
    // above, and it is the shape a flat list cannot show — the first run of
    // this found 003 and 004 touched by four of the top five open items while
    // sitting at ranks 11 and 12, which is a question about the order that
    // nobody had been able to see.
    const contention = new Map();
    for (const [k, to] of tou) {
      if (!contention.has(to)) contention.set(to, []);
      contention.get(to).push(k);
    }
    const hot = [...contention].filter(([, from]) => from.length > 1)
      .sort((a, b) => b[1].length - a[1].length);
    console.log(`\n  CONTENDED GROUND (${hot.length}) — several items wait on what one of them settles:`);
    for (const [to, from] of hot) {
      const above = from.filter((k) => rankOf.has(k) && rankOf.has(to) && rankOf.get(k) < rankOf.get(to));
      console.log(`    ${to} (${where(to)}) is touched by ${from.length}: ${from.join(", ")}`);
      console.log(`       ${title(to)}`);
      if (above.length) console.log(`       ${above.length} of them sit ABOVE it — they will be built against answers it has not given.`);
    }
    if (!hot.length) console.log("    none — no item is touched by more than one other.");

    const dis = pairs("distinct-from");
    console.log(`\n  LOOKS RELATED AND IS NOT (${dis.length}) — recorded so it is not re-conflated:`);
    for (const [k, to, why] of dis) console.log(`    ${k} is NOT ${to} — ${why.slice(0, 95)}`);
    if (!dis.length) console.log("    none declared.");

    // WHERE A NEW ITEM GOES. The earliest rank its needs allow, so inserting is
    // a lookup rather than an argument.
    console.log("\n  EARLIEST RANK EACH ITEM COULD TAKE, given what it needs:");
    for (const item of open) {
      const k = keyOf(item.text);
      const after = blockedBy(k);
      const floor = after.length ? Math.max(...after.map((a) => rankOf.get(a) + 1)) + 1 : 1;
      const now = rankOf.get(k) + 1;
      const slack = now - floor;
      console.log(`    ${k}  now ${String(now).padStart(2)}, earliest ${String(floor).padStart(2)}`
        + `${slack > 0 ? `  (${slack} free)` : "  (pinned)"}`);
    }
    console.log("");
  }

  // ---- 5. AND THE TOP ITEM'S BOUNDARIES, PRINTED UNASKED (hub LESSONS 329).
  //
  // A rejected option is not history, it is a live boundary: it is written down
  // precisely BECAUSE it looks reasonable, which is what makes it the route a
  // session reinvents. Record 019's Rejected section said "a hue band is not a
  // place" and noted that this had been the record's own first draft, corrected
  // within the hour -- and the session implementing that record then built a
  // harness that drove the hue band, rendered three arms through it, and sent
  // five comparison sheets to the owner off the wrong control. The sentence
  // that would have stopped it was in the file that was open.
  //
  // This does not refuse anything and is not declared a gate. No parser tells
  // reading from having-read. It puts the sentence in front of whoever is about
  // to commit, which is the one thing a parser can do here.
  // ---- 5b. WHAT IS ALREADY BUILT FOR THE ITEM ABOUT TO BE WORKED.
  //
  // THE GAP THIS CLOSES, named by the owner 2026-09-19: a capability gets built
  // as a dependency of a LATER capability, and when that later item finally
  // comes up the session does not know the dependency exists and builds a
  // second one. It is not "forgot to read the record" -- the record may not
  // mention it, because the thing was built for a different item.
  //
  // Measured the day it was named. `maskprobe.mjs` was written to measure the
  // sky refinement's EDGE, and IR-SCIENCE 4b-v cites its control reading ("a
  // 25 px ramp across a hard edge comes back 4 px wide"). Item 018 needed
  // exactly that measurement. The session did not find it and wrote a second
  // instrument measuring the same edge a different way. Same day, the guided
  // filter itself -- built for the look's sky stages -- WAS found, but only
  // because 018's record happened to name it.
  //
  // So the top-ranked record must carry `## Built already`, listing what exists
  // that this item will use, and every path it names must EXIST. Required only
  // of the item at the TOP of the queue, which is the one about to be worked:
  // that makes it a step before starting rather than a backfill across every
  // open record, and it bites at exactly the moment the failure happens.
  // Any record that carries the section has its paths checked, top or not.
  const topKey = open[0] ? keyOf(open[0].text) : null;
  for (const [k, f] of byKey) {
    if (!claimed.has(k)) continue;
    const text = readFileSync(join(DIR, f), "utf8");
    const built = body(text, "Built already");
    if (!built) {
      if (k === topKey) {
        fail(`docs/decisions/${f} is next up and has no "## Built already". `
           + `List what EXISTS that this item will use — modules, tools, walks — before starting it, `
           + `or a second one gets built (LESSONS 330).`);
      }
      continue;
    }
    // Every backticked path in the section must be a real file.
    const paths = [...built.matchAll(/`([\w./-]+\.(?:ts|mjs|js|md|json|html|css))`/g)].map((m) => m[1]);
    const missing = paths.filter((rel) => !existsSync(join(DIR, "..", "..", rel)));
    if (missing.length) {
      fail(`docs/decisions/${f} "## Built already" names ${missing.join(", ")}, which does not exist. `
         + `A citation pointing at nothing is how the second instrument gets written.`);
    }
  }
  if (!bad) ok(`the next item says what is already built for it, and those files exist`);

  const top = open[0];
  if (top) {
    const k = keyOf(top.text);
    const f = byKey.get(k);
    if (f) {
      const text = readFileSync(join(DIR, f), "utf8");
      const first = (h) => {
        const b = body(text, h);
        if (!b) return null;
        const line = b.split("\n").map((l) => l.trim()).filter(Boolean)[0] || "";
        return line.replace(/^[-*\d.]+\s*/, "").replace(/\*\*/g, "").slice(0, 150);
      };
      const chosen = first("Options"), rejected = body(text, "Rejected");
      const built = body(text, "Built already");
      if (built) {
        console.log(`\n  ALREADY BUILT for ${k} — do not write a second one (LESSONS 330):`);
        for (const line of built.split("\n")) {
          const m = /^\s*-\s+(.*)$/.exec(line);
          if (m) console.log(`    ${m[1].replace(/\*\*/g, "").slice(0, 120)}`);
        }
      }
      console.log(`\n  before the first edit on ${k} (LESSONS 329):`);
      if (chosen) console.log(`    chosen    ${chosen}`);
      if (rejected) {
        for (const line of rejected.split("\n")) {
          const m = /^\s*-\s+\*\*(.+?)\*\*\s*:?\s*(.*)$/.exec(line);
          if (m) console.log(`    REJECTED  ${m[1]} — ${m[2].replace(/\*\*/g, "").slice(0, 110)}`);
        }
      }
    }
  }
}

console.log(bad ? `\n${bad} FAILED\n` : "\n  every open item carries its research, what it was weighed against, and why.\n");
process.exit(bad ? 1 : 0);
