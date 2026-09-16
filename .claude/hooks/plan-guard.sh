#!/bin/bash
# Doctrine §0d, made mechanical. Plan mode reached a session as a PARAGRAPH and
# `git push` ran anyway; on the turn the paragraph was absent, a merge went to
# production. This refuses at the tool layer instead.
# Canonical script: noahjefferson/plan-guard.mjs — never fork it.
#
# IT FAILS CLOSED, WHICH IS THE OPPOSITE OF `stop-guard.sh` BESIDE IT, and the
# difference is deliberate. That one blocks a TURN, so a missing hub making
# every turn fail would get it switched off within a day. This one blocks a
# WRITE during plan mode — and a missing hub silently restoring the ability to
# push to main is the exact defect it exists to prevent. Fail-open here would
# be a gate that is absent precisely when the clone is in a state nobody
# checked.
#
# But it fails closed ONLY FOR PLAN MODE. If the gate is unreachable and the
# session is not planning, ordinary work proceeds — blocking everything on a
# missing sibling is the "switched off within a day" failure again.
set -uo pipefail

# ONCE. The payload is consumed by the first reader; a second read gets nothing
# and every check silently evaluates empty (the trap in this API's own
# reference example).
PAYLOAD="$(cat)"

cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || true
GATE=""
[ -f ./plan-guard.mjs ] && GATE=./plan-guard.mjs
[ -z "$GATE" ] && [ -f ../noahjefferson/plan-guard.mjs ] && GATE=../noahjefferson/plan-guard.mjs

if [ -n "$GATE" ]; then
  printf '%s' "$PAYLOAD" | exec node "$GATE"
fi

# NO GATE. Decide here rather than waving it through: a crude match is enough,
# because the only question at this point is whether the session is planning.
case "$PAYLOAD" in
  *'"permission_mode":"plan"'*|*'"permission_mode": "plan"'*)
    printf '%s' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"PLAN MODE, and plan-guard.mjs could not be found — refusing rather than assuming. Say so in plain text and stop (Doctrine §0d)."}}'
    exit 2
    ;;
esac
exit 0
