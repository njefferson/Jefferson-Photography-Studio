#!/usr/bin/env node
// EVERY WALK IN THIS DIRECTORY, IN ONE COMMAND.
//
//   python3 -m http.server 8131 --directory dist   (in another shell)
//   node tools/walk-all.mjs [--only=tile-truth,journey]
//
// WHY IT EXISTS. The pre-release sweep was a session typing ten commands from
// memory, which means the sweep was whatever that session remembered — and the
// walks it forgot were indistinguishable from walks that passed. This runs
// EVERY `*-walk.mjs` on disk, so adding one to this directory adds it to the
// sweep with nothing to remember.
//
// It refuses to start if nothing is serving dist, because ten walks each failing
// to connect is ten minutes of output that says nothing about the build.
//
// Sequential on purpose: each drives a real browser and decodes RAW files, and
// running them at once makes every timing number in switch-instrument a
// measurement of the other walks.

import { readdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { requireFreshDist } from "./fresh-dist.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const pick = only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null;

const walks = readdirSync(here)
  .filter((f) => f.endsWith("-walk.mjs"))
  .filter((f) => !pick || pick.some((p) => f.startsWith(p)))
  .sort();

const serving = await fetch(`http://127.0.0.1:${PORT}/ir.html`).then((r) => r.ok).catch(() => false);
if (!serving) {
  console.error(`\nNothing is serving dist on :${PORT}.\n\n    python3 -m http.server ${PORT} --directory dist\n`);
  process.exit(2);
}
if (!walks.length) { console.error("no walks matched"); process.exit(2); }
// AND THE BUILD IS THE ONE THIS TREE WOULD MAKE. Each walk refuses a stale dist
// itself; this refuses once instead of thirty-six times, for the same reason
// the serving check above it exists.
requireFreshDist();

const run = (file) =>
  new Promise((res) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, [join(here, file), `--port=${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => res({ file, code, out, ms: Date.now() - t0 }));
  });

console.log(`\n=== ${walks.length} walks, on :${PORT} ===\n`);
const results = [];
for (const w of walks) {
  process.stdout.write(`  ${basename(w, ".mjs").padEnd(26)} `);
  const r = await run(w);
  results.push(r);
  const last = r.out.trim().split("\n").filter(Boolean).pop() || "(no output)";
  console.log(`${r.code === 0 ? "ok  " : "FAIL"}  ${(r.ms / 1000).toFixed(0)}s  ${last.slice(0, 70)}`);
}

const bad = results.filter((r) => r.code !== 0);
for (const r of bad) {
  console.log(`\n--- ${r.file} ---`);
  // WITH THE LINES ABOVE IT, because a walk prints its MEASUREMENT on the line
  // before its verdict — "showing's five parts 70 ms vs 70 ms" then "ok 8 …".
  // Printing only the lines matching FAIL gives the name of the check and not
  // one number from it, so the only way to learn anything is to run the walk
  // again, by which time the load that produced the failure is gone. Three
  // lines of context is the difference between a report and a prompt to re-run.
  const lines = r.out.split("\n");
  let last = -1;
  for (const [i, line] of lines.entries()) {
    if (!/FAIL|Error|error/.test(line)) continue;
    const from = Math.max(last + 1, i - 3);
    if (from > last + 1) console.log("  ...");
    for (let j = from; j <= i; j++) console.log("  " + lines[j]);
    last = i;
  }
}
const total = (results.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0);
console.log(bad.length ? `\n${bad.length} of ${results.length} failed (${total}s)\n` : `\nall ${results.length} walks passed (${total}s)\n`);
process.exit(bad.length ? 1 : 0);
