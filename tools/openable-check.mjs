#!/usr/bin/env node
// WHAT THE APP WILL OPEN IS WRITTEN IN SIX PLACES. THEY AGREE OR THE COMMIT
// DOES NOT LAND.
//
//   node tools/openable-check.mjs
//
// `OPENABLE_EXT` in src/main.ts decides what a picked file is allowed to be.
// Five `accept` attributes in ir.html tell the PICKER the same thing by hand —
// and on iOS an extension missing from `accept` is a file the reader cannot
// select at all, so the two disagreeing does not degrade, it hides the feature
// while every gate stays green.
//
// Adding decision 043's `.ipskeep` meant touching six places. This repository
// has an EditParams rule about five places and a lesson about one rule in two,
// so six by hand was never going to hold.
//
// DERIVED, NEVER A TYPED COPY. The list comes out of the regex in the source —
// the same design as patch-note-check.mjs reading INTERNAL_PATH out of
// vite.config.ts — so this file cannot be the seventh place to update.
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const main = readFileSync(join(repo, "src/main.ts"), "utf8");
const html = readFileSync(join(repo, "ir.html"), "utf8");

let failed = 0;
const check = (name, got, want) => {
  const ok = got === want;
  if (!ok) failed++;
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${ok ? "" : `\n          got  ${got}\n          want ${want}`}`);
};

console.log("\n=== what the app will open · one list, six places ===\n");

// THE SOURCE OF TRUTH. Stop rather than guess if it is renamed or reshaped:
// a gate that silently starts checking nothing is the fail-open this whole
// commit chain exists to close.
const m = main.match(/const OPENABLE_EXT = \/\\\.\(([a-z0-9|]+)\)\$\/i;/);
if (!m) {
  console.error("  OPENABLE_EXT is not where this expects it in src/main.ts, or no longer has");
  console.error("  the shape /\\.(a|b|c)$/i. Fix this gate rather than removing it — it is the");
  console.error("  only thing holding the picker's accept lists to what the app can open.\n");
  process.exit(1);
}
const want = m[1].split("|").sort();
console.log(`          OPENABLE_EXT says: ${want.join(", ")}\n`);

// WHICH ACCEPT LISTS THIS GOVERNS, and the narrowing is a measurement rather
// than a taste. ir.html carries nine accept attributes; only five are pickers
// that route into `openPicked`. The other four are different doors — a look
// importer (.ipslook,.json), a LUT importer (.cube), a JSON/txt importer, and
// the lens rig's own picker, which takes calibration frames and deliberately
// does NOT take a look. A gate that held all nine to one list would be wrong
// four times on its first run, and a gate that is wrong is a gate somebody
// switches off.
//
// So: a list claiming `.dng` is claiming to open photographs, and must carry
// the whole set. The exceptions are DECLARED, with their reason, and printed
// every run so the list can only shrink.
const EXCEPT = [
  {
    accept: "image/*,.dng,.nef,.DNG,.NEF,.zip,.ZIP,application/zip",
    why: "the lens rig's picker: calibration frames, not an editing session. It "
       + "never routes through openPicked, so a look or a keep file arriving "
       + "there would have nothing to open them. It also spells both cases by "
       + "hand, which is its own older convention.",
  },
];

const all = [...html.matchAll(/accept="([^"]*)"/g)].map((a) => a[1]);
const claimsPhotos = all.filter((a) => /(^|,)\s*\.dng\b/i.test(a));
const excused = [], governed = [];
for (const a of claimsPhotos) (EXCEPT.some((e) => e.accept === a) ? excused : governed).push(a);

check("the photograph pickers were found at all", governed.length > 0, true);
check("every declared exception is still in the markup",
  EXCEPT.every((e) => all.includes(e.accept)), true);

const norm = (list) => [...new Set(list.split(",").map((x) => x.trim())
  .filter((x) => x.startsWith(".")).map((x) => x.slice(1).toLowerCase()))].sort().join(",");

let n = 0;
for (const acc of governed) {
  n++;
  check(`picker ${n} offers exactly what the app can open`, norm(acc), want.join(","));
}

console.log(`\n          ${governed.length} photograph picker(s) held to the source`);
for (const e of excused) {
  const why = EXCEPT.find((x) => x.accept === e).why;
  console.log(`          excused: ${e.slice(0, 44)}\n                   ${why.replace(/\s+/g, " ").slice(0, 96)}`);
}
console.log(`          ${all.length - claimsPhotos.length} other picker(s) claim no photographs and are not this gate's business\n`);

console.log(failed ? `  ${failed} check(s) failed\n` : "  the picker offers exactly what the app can open\n");
process.exit(failed ? 1 : 0);
