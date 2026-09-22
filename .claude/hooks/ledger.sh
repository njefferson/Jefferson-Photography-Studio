#!/bin/bash
# What this session has actually READ, as opposed to produced. Every tool
# result lands here; ident-guard.mjs searches it before a call goes out.
#
# IT NEVER FAILS A TOOL CALL. A PostToolUse hook runs after the work is done,
# so a non-zero exit here could only report a problem with the RECORDING, and
# the cost of that is a refusal on the next call the guard cannot verify —
# which is the correct place for it to surface, not here.
set -uo pipefail
PAYLOAD="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f .claude/hooks/ledger.mjs ] || exit 0
printf '%s' "$PAYLOAD" | node .claude/hooks/ledger.mjs || true
exit 0
