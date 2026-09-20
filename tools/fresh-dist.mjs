#!/usr/bin/env node
// IS THE BUILD ON :8131 THE BUILD THIS TREE WOULD MAKE?
//
// Every walk in this directory measures `dist`, served by a python http.server
// somebody started in another shell. Nothing connected that directory to the
// source tree, so a walk run after an edit and before a build measures the
// PREVIOUS build and says nothing about it — it prints the same green it would
// print for the change.
//
// WHAT IT COST, 2026-09-20, and this file exists because of that hour. The
// one-thread banner defect was fixed, and the fix was verified by planting the
// defect back and watching the walk go red. It did not go red: `all checks
// passed` with the defect in the source. The plant was real and the walk was
// right — `dist` was five minutes old and the plant was in `src`. Every number
// that session had taken off a walk was suddenly a number about an unknown
// build, and the "made to fail once" discipline this repo runs on had been
// satisfied by a build that did not contain the thing being tested.
//
// MTIME, NOT A HASH, AND THE LIMIT IS STATED. Comparing modification times
// catches the whole real failure — edit, forget to build, run a walk — for the
// cost of a stat per tracked file. It cannot catch a build made from different
// CONTENT at the same time, and a checkout that rewrites mtimes reads as stale.
// Both of those fail toward "go and build", which costs three seconds and is
// never wrong to do.
//
// TRACKED FILES ONLY: `git ls-files`, so a scratch file dropped in the tree
// does not tell every walk the build is stale.
import { statSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

/** THE NEWEST SOURCE FILE AGAINST THE BUILD, as two timestamps and a verdict.
 *
 *  Takes `repo`, the repository root (default: the current directory). Reads
 *  the mtime of `dist/ir.html` — the page every walk opens, rewritten by every
 *  build — and of every tracked file the build is made FROM, and returns
 *  `{ ok, builtAt, newest, newestFile, reason }`. `ok` is false when there is
 *  no build at all or when any source is newer than it.
 *
 *  What the caller relies on: `ok === false` is never a reason to carry on. A
 *  walk that ignores it is measuring a build nobody can name. */
export function distFreshness(repo = ".") {
  const built = join(repo, "dist", "ir.html");
  if (!existsSync(built)) return { ok: false, builtAt: 0, newest: 0, newestFile: "", reason: "there is no dist/ir.html — nothing has been built" };
  const builtAt = statSync(built).mtimeMs;
  // What a build reads. `public/` is copied verbatim, the html pages are the
  // entry points, and the config decides what becomes of all of it.
  const globs = ['"src/*"', '"src/**/*"', '"public/*"', '"public/**/*"', '"*.html"', '"vite.config.ts"', '"package.json"', '"package-lock.json"', '"tsconfig.json"'];
  const files = execSync(`git -C ${repo} ls-files ${globs.join(" ")}`, { encoding: "utf8" })
    .split("\n").map((s) => s.trim()).filter(Boolean);
  let newest = 0, newestFile = "";
  for (const rel of files) {
    const p = join(repo, rel);
    if (!existsSync(p)) continue; // deleted but still indexed; not a source
    const m = statSync(p).mtimeMs;
    if (m > newest) { newest = m; newestFile = rel; }
  }
  const ok = newest <= builtAt;
  return { ok, builtAt, newest, newestFile, reason: ok ? "" : `${newestFile} is newer than dist/ir.html` };
}

/** REFUSE THE WALK RATHER THAN MEASURE THE WRONG BUILD.
 *
 *  Takes `repo`, the repository root (default: the current directory). Prints
 *  nothing and returns nothing when the build is current; otherwise prints what
 *  is stale and the command that fixes it, and exits the process with code 2 —
 *  the same code the walks already use for "this did not run", so a sweep
 *  reports it as a refusal rather than as a failed check.
 *
 *  What the caller relies on: it either returns or does not come back. A walk
 *  calls it before launching a browser, so a stale build costs a second rather
 *  than a full run. */
export function requireFreshDist(repo = ".") {
  const f = distFreshness(repo);
  if (f.ok) return;
  console.error(`\n  THE BUILD IS STALE — ${f.reason}.`);
  console.error("  A walk against it measures the previous build and says nothing about this tree.\n");
  console.error("    npm run build\n");
  process.exit(2);
}

// Run directly: say which it is, and exit 0/2 so a shell can branch on it.
if (process.argv[1] && process.argv[1].endsWith("fresh-dist.mjs")) {
  const f = distFreshness(process.argv.find((a) => a.startsWith("--repo="))?.split("=")[1] ?? ".");
  console.log(f.ok ? "  the build is current" : `  STALE — ${f.reason}`);
  process.exit(f.ok ? 0 : 2);
}
