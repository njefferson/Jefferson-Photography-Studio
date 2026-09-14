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

// A bullet with no title renders as a blank row. The parser takes the bold span
// or the text before the first em-dash; both empty is a row with nothing in it.
const blank = (road || []).filter((t) => {
  const bold = t.match(/^\*\*(.+?)\*\*/);
  return !((bold ? bold[1] : t.split(" — ")[0]).replace(/\*\*|`|_/g, "").trim());
});
check("every roadmap item has a title to render", blank.length, 0);

console.log(failed ? `\n  ${failed} check(s) failed\n` : "\n  the ⓘ roadmap and the archive both have content\n");
process.exit(failed ? 1 : 0);
