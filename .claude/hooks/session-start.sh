#!/bin/bash
# Printed into every session in this repo, because everything it says was
# already written down and none of it was being read. A session that had to
# grep to find the pipeline order, did not know docs/ARCHITECTURE.md existed,
# and shipped a change based on two functions it had just read is the reason
# this file exists. See tools/session-brief.mjs.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0

# The hooks and checks below read the hub at /root/.claude/hub, and a fresh
# container has no clone there until the environment's setup script puts one.
# Where it has not, clone the hub and wire its dispatcher here, before anything
# prints, as the hub's own start hook does. The three variables let a test point
# the path at an empty folder, the source at a local copy, and skip the install.
HUB_CLONE_PATH="${HUB_CLONE_PATH:-/root/.claude/hub}"
HUB_CLONE_SOURCE="${HUB_CLONE_SOURCE:-https://github.com/njefferson/noahjefferson.git}"
if [ ! -f "$HUB_CLONE_PATH/hook-dispatch.mjs" ]; then
  if git clone --quiet "$HUB_CLONE_SOURCE" "$HUB_CLONE_PATH" >/dev/null 2>&1; then
    echo "session-start: the hub clone was absent; cloned it from $HUB_CLONE_SOURCE into $HUB_CLONE_PATH"
    if [ -n "${HUB_CLONE_DRY:-}" ]; then
      echo "session-start: install line (dry run, not run): node $HUB_CLONE_PATH/hook-dispatch.mjs --install"
    else
      node "$HUB_CLONE_PATH/hook-dispatch.mjs" --install 2>&1 || echo "session-start: the dispatcher install from the clone failed"
    fi
  else
    echo "session-start: the hub clone was absent and cloning it from $HUB_CLONE_SOURCE into $HUB_CLONE_PATH failed; the gates are not wired"
  fi
fi

# The hub's start lines first — its heading, the branch lines (which branch this
# repository is on and where its work commits) and the one line naming the short
# page. It lives in the hub and takes --repo, so it is not copied here.
node /root/.claude/hub/session-brief.mjs --repo . 2>/dev/null || true
# Then this app's own, which is generated from the app.
node tools/session-brief.mjs --repo . 2>/dev/null || true
# And install the commit hook, because a fresh container has none and the guard
# that refuses a commit on the wrong branch cannot fire if it was never written.
node /root/.claude/hub/branch-guard.mjs --repo . --install >/dev/null 2>&1 || true

# And the patch-note refusal, for the same reason: the subject of a commit does
# not exist when pre-commit runs, so the gate that reads it is a `commit-msg`
# hook — and a fresh container has none.
if [ -f .githooks/commit-msg ]; then
  cp .githooks/commit-msg .git/hooks/commit-msg 2>/dev/null && chmod +x .git/hooks/commit-msg 2>/dev/null
fi
