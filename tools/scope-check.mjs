#!/usr/bin/env node
// EVERY KNOB DECLARES WHETHER IT TOUCHES THE WHOLE PHOTOGRAPH OR A SELECTION.
//
// The standing rule, stated twice this week in this repository: a correction is
// not applied to the whole photograph when it should act on a selection —
// ESPECIALLY when the thing being corrected is already easy to separate. It was
// prose both times, and prose does not refuse a commit.
//
// WHAT THAT COST, measured 2026-09-17. Three whole-frame constants shipped in
// one day — a denoise floor, a mid-frequency texture amount and a shadow
// desaturation — and every one of them passed eleven commit gates and five
// browser walks, because not one gate asks whether the knob should have been
// aimed at a selection instead. Green the whole way. Meanwhile `src/sky.ts`
// exports `buildSkyMask`, `compileEdit` has had a mask stage with four mask
// types for months, and NO look and NO correction uses either: the sky is the
// easiest population in an infrared frame to separate, and every fix aimed at
// it has been global.
//
// A DECLARED LIST, NOT A PATTERN, for the reason every other list-gate in this
// family is one (`.contract-allow`, `.copy-allow`, `.example-allow`): no parser
// can tell a legitimately global knob from a lazily global one. Exposure IS
// global. White balance IS global. A sky's colour noise is not. So the gate does
// not judge — it refuses a knob that has not been THOUGHT about, and makes the
// answer visible in a diff.
//
//   name = scope : why
//
//   scope is one of
//     whole-frame   acts on every pixel, and the `why` must say why that is
//                   right rather than merely easier
//     selection     already aimed, or aimable, at a mask or a population
//     not-pixels    geometry, files, UI state — nothing to aim
//
// Both directions, like every other declared list here: a name that is no
// longer a field fails too, so a rename cannot silently drop its declaration.
//
//   node tools/scope-check.mjs            check (runs on every commit)
//   node tools/scope-check.mjs --list     print a seed for .scope-allow
import { readFileSync, existsSync } from "node:fs";

const repo = process.argv.find((a) => a.startsWith("--repo="))?.slice(7) ?? ".";

/** The field names of one TypeScript interface, read out of a source file.
 *  Takes the file text and the interface name; returns the names declared at
 *  the interface's own indent level, in source order.
 *  What the result must satisfy: it is the set the gate holds `.scope-allow` to
 *  in BOTH directions, so a field this misses is a field nothing asks about —
 *  which is the failure the whole gate exists to prevent. Brace-counted rather
 *  than regex-matched over the block, because these interfaces carry nested
 *  object types (`crop`, `masks`) whose inner keys are not fields. */
export function interfaceFields(src, name) {
  const open = src.indexOf(`interface ${name} {`);
  if (open < 0) return null;
  let i = src.indexOf("{", open), depth = 0, end = -1;
  for (let k = i; k < src.length; k++) {
    if (src[k] === "{") depth++;
    else if (src[k] === "}") { depth--; if (depth === 0) { end = k; break; } }
  }
  if (end < 0) return null;
  const body = src.slice(i + 1, end);
  const out = [];
  let d = 0, inBlock = false, inLine = false;
  let line = "";
  for (let k = 0; k < body.length; k++) {
    const c = body[k], n = body[k + 1];
    if (inBlock) { if (c === "*" && n === "/") { inBlock = false; k++; } continue; }
    if (inLine) { if (c === "\n") { inLine = false; line = ""; } continue; }
    if (c === "/" && n === "*") { inBlock = true; k++; continue; }
    if (c === "/" && n === "/") { inLine = true; continue; }
    if (c === "{" || c === "(" || c === "[") { d++; continue; }
    if (c === "}" || c === ")" || c === "]") { d--; continue; }
    if (c === "\n") {
      if (d === 0) {
        const m = line.match(/^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\??\s*:/);
        if (m) out.push(m[1]);
      }
      line = "";
      continue;
    }
    line += c;
  }
  return out;
}

const pipeline = readFileSync(`${repo}/src/pipeline.ts`, "utf8");
const main = readFileSync(`${repo}/src/main.ts`, "utf8");
const edit = interfaceFields(pipeline, "EditParams");
const look = interfaceFields(main, "Look");
if (!edit || !look) {
  console.error("scope gate: could not find EditParams in src/pipeline.ts or Look in src/main.ts.");
  console.error("  Those two interfaces ARE the knob list. If one was renamed, rename it here too —");
  console.error("  a gate that cannot find its subject must fail, never pass quietly.");
  process.exit(2);
}

// `Look`'s per-kind blocks (`raw`, `jpeg`) hold the same knob names as the look
// level, so they are one entry rather than three.
const knobs = [...new Set([...edit.map((f) => `EditParams.${f}`), ...look.map((f) => `Look.${f}`)])];

const ALLOW = `${repo}/.scope-allow`;
const SCOPES = new Set(["whole-frame", "selection", "not-pixels"]);
const declared = new Map();
const malformed = [];
if (existsSync(ALLOW)) {
  const lines = readFileSync(ALLOW, "utf8").split("\n");
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].replace(/#.*$/, "").trim();
    if (!raw) continue;
    const m = raw.match(/^([A-Za-z_][A-Za-z0-9_.]*)\s*=\s*([a-z-]+)\s*(?::\s*(.*))?$/);
    if (!m) { malformed.push(`${ALLOW}:${i + 1} is not \`name = scope : why\` — ${raw}`); continue; }
    const [, nm, scope, why] = m;
    if (!SCOPES.has(scope)) { malformed.push(`${ALLOW}:${i + 1} scope "${scope}" is not one of ${[...SCOPES].join(", ")}`); continue; }
    // THE REASON IS THE POINT, and only for whole-frame. `selection` and
    // `not-pixels` need no defence; acting on every pixel does.
    if (scope === "whole-frame" && (!why || why.trim().length < 12)) {
      malformed.push(`${ALLOW}:${i + 1} ${nm} is whole-frame and must say WHY on the same line — not just that it is`);
      continue;
    }
    declared.set(nm, { scope, why: (why ?? "").trim() });
  }
}

if (process.argv.includes("--list")) {
  console.log("# Every knob says whether it acts on the whole photograph or on a");
  console.log("# selection. tools/scope-check.mjs checks it both ways and refuses a");
  console.log("# whole-frame entry that does not say why. See that file's header for");
  console.log("# what this cost when it was prose.");
  console.log("#   name = whole-frame : why acting on every pixel is right here");
  console.log("#   name = selection   : aimed at a mask or a population");
  console.log("#   name = not-pixels  : geometry, files, UI state");
  for (const k of knobs) console.log(`${k} = ${declared.get(k)?.scope ?? "whole-frame"}${declared.get(k)?.why ? ` : ${declared.get(k).why}` : " : "}`);
  process.exit(0);
}

const problems = [...malformed];
for (const k of knobs) {
  if (!declared.has(k)) {
    problems.push(`${k} does not say whether it acts on the whole photograph or a selection — add it to .scope-allow`);
  }
}
for (const nm of declared.keys()) {
  if (!knobs.includes(nm)) problems.push(`.scope-allow names ${nm}, which is not a field of EditParams or Look any more — remove or rename the line`);
}

const counts = { "whole-frame": 0, selection: 0, "not-pixels": 0 };
for (const v of declared.values()) if (counts[v.scope] !== undefined) counts[v.scope]++;

console.log(`\n=== scope gate · ${knobs.length} knobs ===\n`);
if (problems.length) {
  for (const p of problems) console.log(`FAIL  ${p}`);
  console.log(`\n  ${problems.length} problem${problems.length === 1 ? "" : "s"}. The rule this enforces: a correction is not`);
  console.log(`  applied to the whole photograph when it should act on a selection --`);
  console.log(`  especially when the thing it corrects is already easy to separate.`);
  console.log(`\n  \`node tools/scope-check.mjs --list\` prints a seed.\n`);
  process.exit(1);
}
// PRINTED ON EVERY RUN, like every other declared list in this family, so the
// whole-frame count is in front of whoever is adding the next knob rather than
// in a file they would have to open.
console.log(`  ok    every knob declares its scope, both directions`);
console.log(`        whole-frame ${counts["whole-frame"]} · selection ${counts.selection} · not-pixels ${counts["not-pixels"]}`);
console.log(`\n  the whole-frame knobs and why each one is allowed to be:`);
for (const k of knobs) {
  const d = declared.get(k);
  if (d.scope === "whole-frame") console.log(`        ${k.padEnd(26)} ${d.why}`);
}
console.log("");
