#!/usr/bin/env node
// THE DOOR FOR THE HUB'S PLAN-SCOPE GATE. `.branch-guard`'s `also=` list names
// executables inside this repository, and the gate itself is shared and lives
// in the hub — the same split `tools/hub-surface-gates.mjs` beside this already
// uses, and for the same reason: the gate is never forked, only called.
//
// WHY THE GATE EXISTS, measured 2026-09-21. An approved plan named five items
// and a Files list. What shipped also included a 183-line committed walk on a
// plan whose Files section said the harness stays in the scratchpad, a new gate
// wired into this repository's own commit chain, seven rewritten scope
// declarations and an edit to a decision record. None approved, all pushed.
// Each had a good reason at the time, which is the point — a good reason is
// what scope creep is made of. The plan file was never re-opened once across
// the whole run, so none of it presented as deviation; it presented as the
// obvious next action.
//
// STDOUT IS INHERITED, NOT CAPTURED, and that is deliberate. The gate prints
// the plan's own scope on every run, pass or fail. Swallowing that on a pass —
// which is what hub-surface-gates does with its gates, correctly, because they
// have nothing to say when green — would remove the whole point: the plan has
// to arrive at the commit boundary unasked, because the failure being
// corrected is a plan that stopped being read.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");
const hub = resolve(repo, "..", "noahjefferson");
const gate = join(hub, "plan-scope-check.mjs");

// A MISSING HUB IS A FAILURE, NOT A SKIP — the escalation this whole commit
// chain is built on. A declared check that quietly stops running is the
// fail-open every gate here exists to close.
if (!existsSync(gate)) {
  console.error("\n=== plan scope ===\n");
  console.error("  plan-scope-check.mjs is not in the hub beside this repo, so nothing can");
  console.error("  hold this commit to the approved plan. That is a failure, not a skip.\n");
  console.error("      git clone https://github.com/njefferson/noahjefferson ../noahjefferson\n");
  process.exit(1);
}

const r = spawnSync(process.execPath, [gate, `--repo=${repo}`, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(r.status ?? 1);
