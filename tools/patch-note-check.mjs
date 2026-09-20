#!/usr/bin/env node
// A PATCH NOTE SAYS WHICH OF THE FOUR THINGS IT IS.
//
//   node tools/patch-note-check.mjs              (pre-commit: the gate is installed)
//   node tools/patch-note-check.mjs --msg=FILE   (commit-msg: this subject)
//   node tools/patch-note-check.mjs --above-main (every user-facing subject above main)
//
// WHY IT EXISTS, reported from the device 2026-09-20. Five notes were in the ⓘ
// dialog and not one of them said whether it was a defect put right or
// something new, so a reader could not tell a thing they had been waiting for
// from a thing that had been broken. One of them ended "and says what it cost",
// which is about the app's own diagnostic report and means nothing to anybody
// reading a list of changes. The verdict from the device was that the notes
// were useless to the reader and to everyone else.
//
// So every user-facing subject opens with Fixed, New, Faster or Changed. Four
// words, because three of them are the whole vocabulary of a release and the
// fourth is what is left: Fixed is something that was wrong, New is something
// that was not there, Faster is the same thing taking less time, Changed is the
// same thing behaving differently on purpose.
//
// IT DOES NOT CARRY ITS OWN COPY OF "USER-FACING". That question is already
// answered in vite.config.ts, by the two patterns the ⓘ dialog itself filters
// with, and this reads THOSE — a second copy is the defect class that cost this
// repo most of a day: one rule in two places, one of them updated. If either
// pattern is renamed or moved this gate stops with an error rather than
// quietly measuring a rule nobody uses.
//
// AND IT CHECKS ITS OWN INSTALLATION, because the refusal lives in a
// `commit-msg` hook and `.git/hooks` is empty in a fresh container and after
// every clone. A gate that is absent looks exactly like a gate that passed.
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const repo = process.argv.find((a) => a.startsWith("--repo="))?.split("=")[1] ?? ".";
const LEAD = /^(Fixed|New|Faster|Changed): \S/;
let failed = 0;
const fail = (m) => { console.error(`  FAIL  ${m}`); failed++; };

/** THE TWO FILTERS THE ⓘ DIALOG ACTUALLY USES, read out of vite.config.ts.
 *
 *  Takes `root`, the repository root. Returns `{ path, subject }`, both real
 *  RegExp objects built from the literals declared there as `INTERNAL_PATH` and
 *  `INTERNAL_SUBJECT`. Throws when either is absent.
 *
 *  What the caller relies on: these are the SAME patterns the build filters the
 *  patch notes with, never a restatement of them. A commit this says is
 *  user-facing is one the reader will see. */
export function readFilters(root = ".") {
  const src = readFileSync(join(root, "vite.config.ts"), "utf8");
  const grab = (name) => {
    const m = src.match(new RegExp(`^const ${name} = (/.*/[gimsuy]*);`, "m"));
    if (!m) throw new Error(`vite.config.ts no longer declares ${name} as a one-line regex literal — this gate reads it from there on purpose, so fix the reader rather than copying the pattern here`);
    const body = m[1].slice(1, m[1].lastIndexOf("/"));
    const flags = m[1].slice(m[1].lastIndexOf("/") + 1);
    return new RegExp(body, flags);
  };
  return { path: grab("INTERNAL_PATH"), subject: grab("INTERNAL_SUBJECT") };
}

/** DOES THE READER SEE THIS COMMIT.
 *
 *  Takes `subject` (the commit's first line), `paths` (the files it touches),
 *  and `f` (the filters from `readFilters`). Returns true when the ⓘ dialog
 *  would list it: the subject is not an internal one and at least one touched
 *  file reaches the reader.
 *
 *  What the caller relies on: it agrees with `filteredLog` in vite.config.ts by
 *  construction, because it applies that file's own patterns in the same order.
 *  A commit touching nothing is internal there and here. */
export function readerFacing(subject, paths, f) {
  if (f.subject.test(subject)) return false;
  if (!paths.length) return false;
  return !paths.every((p) => f.path.test(p));
}

const filters = readFilters(repo);
const msgArg = process.argv.find((a) => a.startsWith("--msg="))?.split("=")[1];

if (msgArg) {
  // COMMIT-MSG: the subject about to be written, against the files staged for it.
  const subject = readFileSync(msgArg, "utf8").split("\n")[0].trim();
  if (subject.startsWith("#") || !subject) process.exit(0); // an aborted commit
  const paths = execSync(`git -C ${repo} diff --cached --name-only`, { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
  if (!readerFacing(subject, paths, filters)) process.exit(0);
  if (!LEAD.test(subject)) {
    console.error("\n  THIS COMMIT REACHES THE READER, AND ITS SUBJECT DOES NOT SAY WHICH OF THE FOUR THINGS IT IS.\n");
    console.error(`    ${subject}\n`);
    console.error("  Commit subjects ARE the in-app patch notes. Open with one of:\n");
    console.error("    Fixed:    something was wrong and now is not");
    console.error("    New:      something that was not there before");
    console.error("    Faster:   the same thing, taking less time");
    console.error("    Changed:  the same thing, behaving differently on purpose\n");
    console.error("  An internal commit needs no prefix — it is one that touches only");
    console.error("  tools, docs and dotfiles, or whose subject starts Roadmap:/Notes:/Docs:.\n");
    process.exit(1);
  }
  process.exit(0);
}

if (process.argv.includes("--above-main")) {
  // EVERY USER-FACING SUBJECT ABOVE MAIN — what the reader will get on merge.
  const base = execSync(`git -C ${repo} rev-parse --verify --quiet origin/main || git -C ${repo} rev-parse --verify main`, { encoding: "utf8", shell: "/bin/bash" }).trim();
  const out = execSync(`git -C ${repo} log ${base}..HEAD --pretty=format:"%h|%s" --name-only`, { encoding: "utf8" });
  let cur = null; const commits = [];
  for (const line of out.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^([0-9a-f]{7,})\|(.*)$/);
    if (m) { cur = { hash: m[1], subject: m[2], paths: [] }; commits.push(cur); }
    else cur?.paths.push(line.trim());
  }
  const facing = commits.filter((c) => readerFacing(c.subject, c.paths, filters));
  console.log(`\n  ${facing.length} of ${commits.length} commit(s) above main reach the reader\n`);
  for (const c of facing) {
    const ok = LEAD.test(c.subject);
    console.log(`  ${ok ? "ok  " : "FAIL"}  ${c.hash}  ${c.subject}`);
    if (!ok) failed++;
  }
  process.exit(failed ? 1 : 0);
}

// PRE-COMMIT: the refusal itself is a commit-msg hook, so check it is there.
const tracked = join(repo, ".githooks", "commit-msg");
const live = join(repo, ".git", "hooks", "commit-msg");
if (!existsSync(tracked)) fail(".githooks/commit-msg is missing — the tracked source of the patch-note refusal");
else if (!existsSync(live)) fail(".git/hooks/commit-msg is MISSING. Install it:  cp .githooks/commit-msg .git/hooks/ && chmod +x .git/hooks/commit-msg");
else if (readFileSync(tracked, "utf8") !== readFileSync(live, "utf8")) fail(".git/hooks/commit-msg has drifted from the tracked copy — git is running the OLD rule.");
if (!failed) console.log("  ok    the patch-note refusal is installed and current");
process.exit(failed ? 1 : 0);
