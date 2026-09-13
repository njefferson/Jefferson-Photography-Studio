#!/usr/bin/env node
// THE GATE THAT ONLY CI RUNS FINDS THINGS THREE PUSHES LATE.
//
// The hub's surface gates — the ones that read this app's own published copy —
// ran in CI and nowhere else, so a placeholder added here went red on the
// runner after the commit, after the push to staging, and after two more
// commits on top of it. Three red Gates runs, none of which could refuse
// anything. The fix is not a reminder: it is running them where the commit is.
//
// ONLY THE FAST ONES. Measured on this repo: example 64ms, quote 60ms, docs
// 66ms — and privacy 10.7s, third-person 19.1s. Thirty seconds on every commit
// would be routed around within the day, which is worse than leaving them in
// CI, where they still run on every push and nothing is waiting on them.
//
//   node tools/hub-surface-gates.mjs
//
// Wired into .branch-guard's `also=` list, so it runs on every commit.
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const hub = resolve(repo, "..", "noahjefferson");

// A MISSING HUB IS A FAILURE, NOT A SKIP. The same escalation the commit hook
// itself is built on: a declared check that quietly stops running is the
// fail-open the gate exists to close. The hub is already required to generate
// this hook, so its absence is a broken checkout rather than a legitimate one.
if (!existsSync(hub)) {
  console.error("\n=== hub surface gates ===\n");
  console.error("  The hub is not checked out beside this repo, so the gates that read");
  console.error("  this app's published copy cannot run. That is a failure, not a skip.\n");
  console.error("      git clone https://github.com/njefferson/noahjefferson ../noahjefferson\n");
  process.exit(1);
}

// Two argument shapes, because the gates have two: --repo for the ones that
// walk a repo's surfaces, a bare path for docs-check.
const GATES = [
  ["example-check.mjs", ["--repo", repo], "placeholders and examples on a surface"],
  ["quote-check.mjs", ["--repo", repo], "set-apart quotations"],
  ["docs-check.mjs", [repo], "no tables or grids in tracked markdown"],
];

let bad = 0;
for (const [file, args, what] of GATES) {
  const path = join(hub, file);
  if (!existsSync(path)) {
    console.error(`  FAIL  ${file} is not in the hub — the gate list here names a file that moved`);
    bad++;
    continue;
  }
  try {
    execFileSync(process.execPath, [path, ...args], { stdio: "pipe" });
    console.log(`  ok    ${what}`);
  } catch (e) {
    console.error(`\n--- ${file} ---`);
    process.stderr.write(e.stdout?.toString() || "");
    process.stderr.write(e.stderr?.toString() || "");
    bad++;
  }
}

if (bad) {
  console.error(`\n  ${bad} hub surface gate(s) failed. These also run in CI — fixing it here`);
  console.error("  is the difference between a commit that is refused and a run that is red.\n");
  process.exit(1);
}
process.exit(0);
