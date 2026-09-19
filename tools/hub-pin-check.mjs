#!/usr/bin/env node
/**
 * hub-pin-check.mjs — the hub commit is written in two files and they must
 * never disagree.
 *
 *   node tools/hub-pin-check.mjs
 *
 * `.doctrine-sync` records the hub commit this repository has RECONCILED with;
 * `doctrine-sync.mjs --adopt` moves it, and moving it is an assertion that
 * somebody read the drift. The pin in a workflow's
 * `uses: .../hub-gates.yml@<sha>` line is the commit CI RUNS THE HUB'S GATES
 * FROM, because the shared gates — privacy, quotes, the no-grid rule, the
 * branch guard's artefact check — are the hub's files and a runner has to
 * fetch them from somewhere.
 *
 * **They are the same fact and they drift silently.** Adopting is one command
 * and editing a workflow is another, and the second one is easy to skip because
 * nothing about the tree looks different afterwards. What it costs: CI keeps
 * running the hub's gates from an older commit, every one of them goes green,
 * and a rule added to the hub in between is enforced NOWHERE while the marker
 * in this repository says it has been read and applied.
 *
 * That is hub LESSONS §117 almost exactly — a CI step pinned to a commit from
 * before the gate it runs existed.
 *
 * A pin BEHIND the marker is the failure. A pin AHEAD of it is also refused:
 * that is CI enforcing rules this repository has not reconciled with, which is
 * a different problem with the same fix — read the drift, then adopt.
 *
 * ## It looks for the CALL, not for a filename
 *
 * The first version of this named `.github/workflows/gates.yml`. Across the
 * family that file is called `gates.yml`, `deploy.yml`, `security.yml`, `ci.yml`
 * and `spine.yml` — five names for one job — so a copy carrying the constant
 * would have reported "nothing runs the hub's gates" in four repositories that
 * run them perfectly well. A gate whose failure message is wrong is worse than
 * one that does not run, because somebody acts on it.
 *
 * So it reads every workflow and finds the calls. That also catches something
 * the constant could not: TWO workflows calling the hub at DIFFERENT commits,
 * which is one repository running two versions of the shared gates and no file
 * anywhere saying so.
 *
 * ## Why this is NOT a hub gate, which is the interesting part
 *
 * The hub's shared gates live in the hub and take `--repo .`, precisely so five
 * divergent copies cannot exist. This one cannot follow that rule, and the
 * reason is the same circularity it exists to break: **CI fetches the hub AT
 * that pin, so a gate that validates the pin would be fetched at the very commit
 * it is checking.** A pin left behind far enough would check out a hub that does
 * not contain this file, and the step would fail with a missing module rather
 * than a diagnosis — which is hub LESSONS §117 one level up, wearing the costume
 * of its own fix.
 *
 * So it is repo-local on purpose, it reads only files in this repository, and it
 * needs the hub for nothing. Every sibling that pins the hub owes its own copy
 * for the same reason, and that is stated in §117 rather than left to be
 * rediscovered. The copies are byte-identical — the heading below is read off
 * the directory rather than typed in — so a diff between any two is a finding.
 *
 * Wired as a `.branch-guard also=` entry, so it runs on every commit rather
 * than when somebody remembers — and for the same reason: a commit must not
 * depend on the hub being checked out beside this repository.
 *
 * ## Two files agreeing is not the same as the commit existing on a branch
 *
 * The check above compares two strings in this repository. Both can agree
 * perfectly on a commit that is on NO BRANCH of the hub, and after a history
 * rewrite that is exactly what every pin is.
 *
 * The hub's history was rewritten on 2026-09-18 to remove chat-session
 * trailers, which gave every commit a new SHA. Measured on 2026-09-19 against
 * the five hub commits the hub's own census records siblings pinning: four are
 * unreachable from `main` — 3f2a373 (2026-09-02), a75d92d (2026-08-26),
 * 61a3f9a (2026-08-22) and 042400b (2026-09-03), all dated before the rewrite.
 * The fifth, 50207f0, was re-pinned after it and is on `main`.
 *
 * **And they still work**, which is why nothing noticed: GitHub keeps serving a
 * commit that no ref reaches, so `actions/checkout` fetches it, the gates run,
 * and CI is green — out of a tree frozen before the rewrite, which can never
 * contain a gate added since and still carries the trailers the rewrite
 * removed. A pin like that is not behind; it is off the line entirely, and
 * `doctrine-sync --adopt` cannot move it because the marker agrees with it.
 *
 * So the ancestry check below is the second question — is this commit on the
 * hub's `main` at all — and it needs the hub, which this file may not have. It
 * SKIPS rather than fails when the hub is not beside this repository, and it
 * PRINTS the skip: a declared check that quietly stops running is the fail-open
 * this whole family of hooks exists because of, and `branch-guard --artefact`
 * prints the checks it skips for the same reason.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const MARKER = '.doctrine-sync';
const WORKFLOWS = '.github/workflows';

const read = (relative) => {
  try {
    return readFileSync(join(REPO, relative), 'utf8');
  } catch {
    return null;
  }
};

/** Whether a pinned hub commit is reachable from the hub's `main`. Takes the
 *  40-character pin; gives back `{ ok, skipped, why }`. What it must satisfy:
 *  it never fails on a question it could not ask — a hub that is not checked
 *  out beside this repository, or a clone that has never seen the commit,
 *  comes back `skipped` with the reason printed, because a pin the hub pushed
 *  five minutes ago is legitimately absent from a stale clone and refusing the
 *  commit for that would teach everyone to bypass this hook. */
function onTheHubsBranch(pin) {
  const hub = join(dirname(REPO), 'noahjefferson');
  if (!existsSync(join(hub, '.git')))
    return { skipped: true, why: `not checked: the hub is not beside this repository, so nothing here can say whether ${pin.slice(0, 7)} is on its main` };
  const git = (...args) => execFileSync('git', ['-C', hub, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    if (git('cat-file', '-t', pin) !== 'commit')
      return { skipped: true, why: `not checked: the hub clone beside this repository does not have ${pin.slice(0, 7)}` };
  } catch {
    return { skipped: true, why: `not checked: the hub clone beside this repository does not have ${pin.slice(0, 7)}` };
  }
  for (const ref of ['origin/main', 'main']) {
    try {
      git('rev-parse', '--verify', `${ref}^{commit}`);
      execFileSync('git', ['-C', hub, 'merge-base', '--is-ancestor', pin, ref], { stdio: 'ignore' });
      return { ok: true, why: `${pin.slice(0, 7)} is on the hub's ${ref}, so the gates come from a commit the hub can still reach` };
    } catch { /* not this ref, or not an ancestor of it */ }
  }
  return {
    ok: false,
    why: `${pin.slice(0, 7)} is on NO BRANCH of the hub — the gates would be fetched from a frozen tree that can never contain anything added since. A rewritten history does this to every pin, and the two files agreeing cannot see it. Re-pin to the hub's current main and adopt the marker with it.`,
  };
}

console.log(`\n=== the hub pin · ${basename(REPO)} ===\n`);

const failures = [];

// A MISSING FILE IS A FAILURE, never a skip. A check that quietly stops running
// is the fail-open this whole family of hooks exists because of.
const markerSource = read(MARKER);
if (markerSource === null) failures.push(`${MARKER} is missing — this repository has reconciled with nothing`);

let files = [];
try {
  files = readdirSync(join(REPO, WORKFLOWS)).filter((f) => /\.ya?ml$/.test(f));
} catch {
  failures.push(`${WORKFLOWS} is missing — nothing runs the hub's gates`);
}

// THE PIN MOVED HOUSE ON 2026-08-29. It used to be `HUB_SHA:`, an env var
// feeding a hand-written `actions/checkout` of the hub inside the gates job.
// The gates are now CALLED — `uses: .../hub-gates.yml@<sha>` — so the ref after
// the `@` is the same fact in its new place, and the hub works out which commit
// to run the gates from by reading that ref off its own `github.workflow_ref`.
// One pin instead of two, which is this file's own argument applied to itself.
//
// Anchored on a full 40-character SHA at the end of the line, so an abbreviated
// pin or a branch name is not read as a pin at all and fails LOUDLY below.
const calls = [];
for (const file of files) {
  const source = read(join(WORKFLOWS, file)) || '';
  if (!/hub-gates\.yml@/.test(source)) continue;
  for (const line of source.split('\n')) {
    const hit = /hub-gates\.yml@([0-9a-f]{40})\s*$/.exec(line);
    if (hit) calls.push({ file, pin: hit[1] });
    else if (/hub-gates\.yml@/.test(line))
      failures.push(`${WORKFLOWS}/${file} calls hub-gates.yml at "${line.trim().split('@')[1] || ''}", which is not a full 40-character commit SHA`);
  }
}

if (failures.length === 0 && calls.length === 0)
  failures.push(`no workflow in ${WORKFLOWS} calls hub-gates.yml — nothing runs the hub's gates`);

const distinct = [...new Set(calls.map((c) => c.pin))];
if (failures.length === 0 && distinct.length > 1)
  failures.push(
    'two workflows call the hub at different commits, so this repository runs two versions of the shared gates: ' +
      calls.map((c) => `${c.file} at ${c.pin.slice(0, 7)}`).join(', '),
  );

if (failures.length === 0) {
  const marker = markerSource.trim();
  const pin = distinct[0];
  if (!/^[0-9a-f]{40}$/.test(marker)) {
    failures.push(`${MARKER} reads "${marker}", which is not a full commit SHA`);
  } else if (pin !== marker) {
    failures.push(
      `the doctrine marker is ${marker.slice(0, 7)} and CI checks the hub out at ${pin.slice(0, 7)}`,
    );
  } else {
    const where = calls.map((c) => c.file).join(', ');
    console.log(`  ok    ${MARKER} and ${WORKFLOWS}/${where} both read ${marker.slice(0, 7)}`);
    console.log('  ok    CI runs the hub gates from the commit this repository has reconciled with');
    const verdict = onTheHubsBranch(pin);
    if (verdict.ok || verdict.skipped) {
      console.log(`  ${verdict.ok ? 'ok   ' : 'skip '} ${verdict.why}`);
      console.log('\nThe pin moves with the marker, because they are the same fact.\n');
      process.exit(0);
    }
    failures.push(verdict.why);
  }
}

for (const failure of failures) console.log(`  FAIL  ${failure}`);
console.error(
  '\nThe hub commit is written in two places and they have drifted. CI checks the hub\n' +
    'out at the pin in the `uses:` line to run the shared gates, so a pin left behind\n' +
    'means those gates go\n' +
    'green while running checks that never heard of the rules this repository has\n' +
    'already adopted. Move them together:\n\n' +
    '  node ../noahjefferson/doctrine-sync.mjs --repo . --adopt\n' +
    '  then move the hub-gates.yml pin in the calling workflow to the same commit\n',
);
process.exit(1);
