#!/usr/bin/env node
// EVERY EXPORTED FUNCTION STATES ITS CONTRACT: what it takes, what it gives
// back, and what its output has to satisfy.
//
// WHY THIS EXISTS, with the bill attached. This repository already comments
// heavily and the comments are good — they carry WHY a thing is the way it is
// and what the alternative cost. That is history, and history is not a contract.
//
//   `bumpFrom` in src/lensstore.ts had a careful paragraph explaining what it
//   derives and why it refuses to guess. It never said that what it returns has
//   to satisfy `bumpProblem`. So a later commit tightened `bumpProblem` and
//   nothing connected the two: profiles saved cleanly and were refused on every
//   read afterwards, wholesale, and a measured lens silently stopped working.
//
// A reader of `bumpFrom` who had been told "the curve this returns must pass
// bumpProblem" would have seen that regression while typing it. That sentence
// is what this gate is for.
//
// WHAT IT CHECKS, mechanically:
//   1. a /** */ block sits immediately above every exported function
//   2. the block names every parameter
//   3. the block says what comes back, for anything that returns a value
//
// The third thing — what the output must SATISFY, and who depends on it — is a
// CHECKLIST rather than a gate, because no parser can tell a real invariant from
// a sentence shaped like one. It is the half that catches regressions, so it is
// written into CLAUDE.md where it will be read.
//
// EXISTING DEBT IS A DECLARED LIST, not a pattern, and it is checked BOTH WAYS
// so it cannot quietly grow: `.contract-allow` names the functions written
// before this rule. A new function is not on it and so must carry its contract.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const repo = process.argv.find((a) => a.startsWith("--repo="))?.slice(7) ?? ".";
const files = execSync(`git -C ${repo} ls-files "src/*.ts" "src/**/*.ts"`, { encoding: "utf8" })
  .split("\n").filter(Boolean);

const ALLOW = `${repo}/.contract-allow`;
const allowed = new Set(
  existsSync(ALLOW)
    ? readFileSync(ALLOW, "utf8").split("\n").map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean)
    : [],
);

const RETURNY = /\b(returns?|gives? back|yields?|hands? back|->|=>|the \w+ it (?:finds|builds|makes))\b/i;
let bad = 0, checked = 0, covered = 0;
const seen = new Set();
const problems = [];

for (const rel of files) {
  const src = readFileSync(`${repo}/${rel}`, "utf8").split("\n");
  for (let i = 0; i < src.length; i++) {
    const m = /^export (?:async )?function (\w+)\s*\(([^)]*)/.exec(src[i]);
    if (!m) continue;
    const [, name, firstArgs] = m;
    const id = `${rel}:${name}`;
    checked++;
    if (allowed.has(id)) { seen.add(id); covered++; continue; }

    // the signature may wrap; gather to the closing paren
    let sig = src[i], j = i;
    while (!/\)\s*:?[^)]*\{?\s*$/.test(sig.slice(sig.indexOf("("))) && j < src.length - 1 && j - i < 25) sig += " " + src[++j];
    const params = (sig.slice(sig.indexOf("(") + 1, sig.lastIndexOf(")")) || "")
      .split(/,(?![^<(]*[>)])/).map((p) => /(\w+)\s*[?:=]/.exec(p.trim())?.[1]).filter(Boolean);
    const voidish = /\)\s*:\s*void\b/.test(sig) || /\)\s*:\s*Promise<void>/.test(sig);

    // the doc block immediately above
    let k = i - 1;
    while (k >= 0 && src[k].trim() === "") k--;
    if (k < 0 || !src[k].trim().endsWith("*/")) { problems.push(`${id} — no /** */ block above it`); bad++; continue; }
    let start = k;
    while (start >= 0 && !src[start].trim().startsWith("/*")) start--;
    const doc = src.slice(Math.max(0, start), k + 1).join(" ");

    const missing = params.filter((p) => !new RegExp(`\\b${p}\\b`).test(doc));
    if (missing.length) { problems.push(`${id} — its comment never names ${missing.join(", ")}`); bad++; continue; }
    if (!voidish && !RETURNY.test(doc)) { problems.push(`${id} — its comment never says what comes back`); bad++; continue; }
    covered++;
  }
}

for (const id of allowed) if (!seen.has(id)) problems.push(`.contract-allow names ${id}, which is not an exported function any more — remove the line`);
bad += problems.length - bad > 0 ? 0 : 0;

if (process.argv.includes("--list")) {
  // Seed the backlog. Printed rather than written, so adopting it is a
  // deliberate act and shows up in a diff like every other declared list here.
  console.log("# Functions written before contracts were required. This list can only\n" +
              "# SHRINK: a new exported function is not on it and so must state what it\n" +
              "# takes, what it gives back, and what its result has to satisfy.\n" +
              "# tools/contract-check.mjs checks it both ways.");
  for (const p of problems) console.log(p.split(" — ")[0]);
  process.exit(0);
}
console.log(`\n=== function contracts · ${repo} ===\n`);
console.log(`  ${covered}/${checked} exported functions state their contract (${allowed.size} on the declared backlog)\n`);
for (const p of problems) console.log(`FAIL  ${p}`);
const failed = problems.length;
console.log(failed
  ? `\n${failed} exported function(s) without a contract. Say what it takes, what it does, what it returns —\nand what the result has to satisfy, which is the half that catches regressions.`
  : "  every exported function states what it takes and what it gives back.");
process.exit(failed ? 1 : 0);
