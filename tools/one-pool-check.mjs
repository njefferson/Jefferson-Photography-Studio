#!/usr/bin/env node
// ONE FUNCTION DECIDES HOW MANY EXPORT WORKERS START.
//
//   node tools/one-pool-check.mjs
//
// WHY IT EXISTS. The pool size was worked out in two places — the gate that
// approves a parallel export and the code that actually starts the workers —
// and on 2026-09-20 one of them learned that a 16-bit TIFF band weighs six
// bytes a pixel and the other did not. `workerCount` is monotonically larger
// at four bytes, so the spawn could only ever exceed what the gate approved:
// measured at 629 MB against a 600 MB ceiling on a tablet-class device, and
// that ceiling exists because such a device kills the tab rather than swapping.
//
// A TEST THAT RE-DERIVES THE ARITHMETIC WOULD NOT HAVE CAUGHT IT — both sides
// were individually correct. What was wrong was that there were two sides. So
// this refuses the SHAPE: `workerCount` may be called from exactly one place.
import { readFileSync } from "node:fs";

const SRC = "src/exportparallel.ts";
const src = readFileSync(SRC, "utf8");
let failed = 0;
const check = (n, ok, d = "") => { console.log(`${ok ? "ok  " : "FAIL"}  ${n}${d ? " — " + d : ""}`); if (!ok) failed++; };

// Calls, not the declaration and not a mention inside a comment.
const lines = src.split("\n");
const callers = [];
let inBlockComment = false;
lines.forEach((line, i) => {
  const t = line.trim();
  if (inBlockComment) { if (t.includes("*/")) inBlockComment = false; return; }
  if (t.startsWith("/*")) { if (!t.includes("*/")) inBlockComment = true; return; }
  if (t.startsWith("*") || t.startsWith("//")) return;
  if (/\bexport function workerCount\b/.test(line)) return;   // the declaration
  if (/\bworkerCount\s*\(/.test(line)) callers.push(`${i + 1}: ${t}`);
});

check("workerCount is called from exactly one place", callers.length === 1,
  callers.length ? callers.join(" | ") : "no call at all — the pool size comes from somewhere else now");
check("...and that place is approvedWorkers",
  callers.length === 1 && /return workerCount\(job, bytesPerPixel\(opts\)\)/.test(callers[0]),
  callers[0] ?? "");
// Both consumers must go through it, or the single call site proves nothing.
for (const who of ["canRunParallel", "exportBands"]) {
  const body = src.slice(src.indexOf(`function ${who}(`));
  check(`${who} asks approvedWorkers`, /approvedWorkers\(job, opts\)/.test(body.slice(0, 2000)));
}
console.log(failed ? `\n${failed} failed` : "\nall checks passed");
process.exit(failed ? 1 : 0);
