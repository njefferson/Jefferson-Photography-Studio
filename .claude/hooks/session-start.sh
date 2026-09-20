#!/bin/bash
# Printed into every session in this repo, because everything it says was
# already written down and none of it was being read. A session that had to
# grep to find the pipeline order, did not know docs/ARCHITECTURE.md existed,
# and shipped a change based on two functions it had just read is the reason
# this file exists. See tools/session-brief.mjs.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
# The family brief first — branch, doctrine drift, the repo map, the lessons
# index. It lives in the hub and takes --repo, so it is not copied here.
node ../noahjefferson/session-brief.mjs --repo . 2>/dev/null || true
# Then this app's own, which is generated from the app.
node tools/session-brief.mjs --repo . 2>/dev/null || true
# And install the commit hook, because a fresh container has none and the guard
# that refuses a commit on the wrong branch cannot fire if it was never written.
node ../noahjefferson/branch-guard.mjs --repo . --install >/dev/null 2>&1 || true

# And the patch-note refusal, for the same reason: the subject of a commit does
# not exist when pre-commit runs, so the gate that reads it is a `commit-msg`
# hook — and a fresh container has none.
if [ -f .githooks/commit-msg ]; then
  cp .githooks/commit-msg .git/hooks/commit-msg 2>/dev/null && chmod +x .git/hooks/commit-msg 2>/dev/null
fi
