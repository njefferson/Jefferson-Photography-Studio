#!/usr/bin/env node
// EVERY var() NAMES A PROPERTY THAT EXISTS.
//
// `color: var(--txt-1)` where nothing defines `--txt-1` is not an error and
// does not warn: the declaration becomes invalid at computed-value time, which
// for an inherited property means INHERIT. So the element quietly takes its
// parent's colour and looks plausible, and every contrast sweep that reads the
// rendered DOM agrees with it — the element really is that colour, it just
// isn't the colour anyone wrote.
//
// Found while reverse-mapping rendered colours back to tokens for the palette
// spec: the crop bar declared --txt-1 in three places and no stylesheet in this
// repo has ever defined it. The eighty real tokens are all spelled --txt,
// --txt-2, --txt-3. Three declarations, doing nothing, for as long as they had
// existed.
//
// A var() WITH a fallback — var(--x, #fff) — is deliberate and is not checked.
// The bare form is the one that fails silently.
//
//   node tools/token-check.mjs [--repo .]
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const arg = process.argv.find((a) => a.startsWith("--repo="));
const root = arg ? arg.split("=")[1] : ".";
const ROOTS = ["src", "public"];
const SKIP = /node_modules|[/\\]dist[/\\]|[/\\]\.git[/\\]/;

const files = [];
const walk = (d) => {
  let ents;
  try { ents = readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of ents) {
    const p = join(d, e.name);
    if (SKIP.test(p + "/")) continue;
    if (e.isDirectory()) walk(p);
    else if (/\.(css|ts|js|html)$/.test(e.name)) files.push(p);
  }
};
for (const r of ROOTS) { try { if (statSync(join(root, r)).isDirectory()) walk(join(root, r)); } catch {} }

const defined = new Set();
const used = new Map();                       // name -> Set of "file:line"
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/(--[a-zA-Z0-9_-]+)\s*:/g)) defined.add(m[1]);
  // setProperty("--x", ...) counts as a definition: the app writes some tokens
  // from script (--session-h, --croptools-h) and they are never in a stylesheet.
  for (const m of src.matchAll(/setProperty\(\s*["'`](--[a-zA-Z0-9_-]+)/g)) defined.add(m[1]);
  const lines = src.split("\n");
  for (const [i, line] of lines.entries())
    for (const m of line.matchAll(/var\(\s*(--[a-zA-Z0-9_-]+)\s*\)/g)) {
      if (!used.has(m[1])) used.set(m[1], new Set());
      used.get(m[1]).add(`${relative(root, f)}:${i + 1}`);
    }
}

const dead = [...used.keys()].filter((k) => !defined.has(k)).sort();
console.log(`token-check: ${defined.size} defined, ${used.size} referenced without a fallback`);
if (!dead.length) { console.log("ok    every bare var() names a property something defines"); process.exit(0); }
for (const d of dead) {
  console.log(`FAIL  ${d} is used but never defined — the declaration is dropped and the property inherits`);
  for (const at of [...used.get(d)].sort()) console.log(`        ${at}`);
}
process.exit(1);
