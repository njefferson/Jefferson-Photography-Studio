#!/usr/bin/env node
// EVERY WALK IN THIS DIRECTORY, IN ONE COMMAND.
//
//   node tools/walk-all.mjs [--only=tile-truth,journey] [--port=8131]
//
// IT STARTS AND STOPS THE SERVER OVER dist ITSELF, through tools/launch.mjs, and prints
// the machine's renderer string once. A picture walk (the twenty-one in launch.mjs's
// PICTURE_WALKS) is SKIPPED with one printed line on a software renderer and runs where
// the renderer is a chip; a skipped walk prints no verdict. A server already answering
// on the port is used as it is and left running.
//
// WHY IT EXISTS. The pre-release sweep was a session typing ten commands from
// memory, which means the sweep was whatever that session remembered — and the
// walks it forgot were indistinguishable from walks that passed. This runs
// EVERY `*-walk.mjs` on disk, so adding one to this directory adds it to the
// sweep with nothing to remember.
//
// It refuses to start if dist cannot be served, because ten walks each failing
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
import { PICTURE_WALKS, startServer, readRenderer } from "./launch.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const PORT = (process.argv.find((a) => a.startsWith("--port=")) || "--port=8131").split("=")[1];
const only = (process.argv.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const pick = only ? only.split(",").map((s) => s.trim()).filter(Boolean) : null;
// A WALK THAT BRINGS ITS OWN SERVER is not handed the port the build is served on. It
// would try to bind that port, find the server already holding it and refuse, and the
// sweep would report a failure that is about the sweep and not the build. It keeps the
// port its own --port defaults to (8137), which it opens and closes itself.
const OWN_SERVER = new Set(["offline-shell-walk.mjs"]);

const walks = readdirSync(here)
  .filter((f) => f.endsWith("-walk.mjs"))
  .filter((f) => !pick || pick.some((p) => f.startsWith(p)))
  .sort();

if (!walks.length) { console.error("no walks matched"); process.exit(2); }
// AND THE BUILD IS THE ONE THIS TREE WOULD MAKE. Each walk refuses a stale dist
// itself; this refuses once instead of thirty-six times, for the same reason
// the serving check below exists.
requireFreshDist();

// THE SERVER OVER dist: started here, once, by the launch module, and stopped at the end through its own
// child handle with the port read to confirm. One already answering on the port is used and left alone.
const serving = await fetch(`http://127.0.0.1:${PORT}/ir.html`).then((r) => r.ok).catch(() => false);
let server = null;
if (!serving) {
  try { server = await startServer(Number(PORT)); }
  catch (e) { console.error(`\nCould not serve dist on :${PORT}: ${e.message}\n`); process.exit(2); }
  console.log(`serving dist on :${PORT} (started by this sweep)`);
} else console.log(`serving dist on :${PORT} (already answering, left running)`);

// THE MACHINE'S RENDERER, once. A picture walk reads the drawn picture and is skipped on a software one.
let renderer = { renderer: "unread", software: "" };
try { renderer = await readRenderer(); }
catch (e) { renderer = { renderer: `unread (${e.message.split("\n")[0]})`, software: "no browser" }; }
console.log(`renderer: ${renderer.renderer}`);

const run = (file) =>
  new Promise((res) => {
    const t0 = Date.now();
    const p = spawn(process.execPath, OWN_SERVER.has(file) ? [join(here, file)] : [join(here, file), `--port=${PORT}`], { stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    p.on("close", (code) => res({ file, code, out, ms: Date.now() - t0 }));
  });

console.log(`\n=== ${walks.length} walks, on :${PORT} ===\n`);
const results = [];
const skipped = [];
for (const w of walks) {
  process.stdout.write(`  ${basename(w, ".mjs").padEnd(26)} `);
  if (PICTURE_WALKS.includes(w) && renderer.software) {
    skipped.push(w);
    console.log(`skip  ${w} reads the drawn picture and this machine draws through ${renderer.software} (${renderer.renderer.slice(0, 60)}); no verdict`);
    continue;
  }
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
  // THE VERDICT LINE, WHATEVER WORDS IT CARRIES (step 271). Only lines with FAIL, Error or error in them were kept, so a walk whose verdict reads "4 failed" or
  // "61 control(s) to answer for" lost it from this account of its failure. A walk's last line is its verdict, so it is printed in full here unless a block above
  // already printed it, and a walk that printed nothing says so.
  let lastAt = lines.length - 1;
  while (lastAt >= 0 && lines[lastAt].trim() === "") lastAt--;
  if (lastAt < 0) console.log("  verdict: (no output)");
  else if (lastAt > last) {
    if (lastAt > last + 1) console.log("  ...");
    console.log("  verdict: " + lines[lastAt].trim());
  }
}
const total = (results.reduce((n, r) => n + r.ms, 0) / 1000).toFixed(0);
console.log(bad.length ? `\n${bad.length} of ${results.length} failed (${total}s)\n` : `\nall ${results.length} walks that ran passed (${total}s)\n`);
if (skipped.length) console.log(`${skipped.length} picture walk(s) skipped on a software renderer, with no verdict: ${skipped.join(", ")}\n`);
// THE SERVER THIS SWEEP STARTED IS STOPPED BY ITS OWN HANDLE, and the port is read to confirm it.
if (server) console.log(`server on :${PORT} ${(await server.stop()) ? "stopped, port closed" : "STILL ANSWERING after the stop"}`);
// THE EXIT WAITS FOR WHAT WAS PRINTED (step 271): `process.exit` ends the process at once and a pipe is written to asynchronously, so the failure detail above could
// be cut short for whoever read this through one. The code is set and the output says when its queue is empty before the process ends.
process.exitCode = bad.length ? 1 : 0;
process.stdout.write("", () => process.exit());
