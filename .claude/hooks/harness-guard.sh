#!/bin/bash
# A measurement harness states what would falsify it, or it does not run.
# tools/harness-guard.mjs carries the reasoning and the measurements.
#
# IT FAILS OPEN, deliberately and unlike plan-guard.sh beside it. That one
# refuses a WRITE, and a missing gate silently restoring the ability to push is
# worse than a stall. This refuses a READ-ONLY measurement — a gate that blocked
# every harness in a session because node or the script moved would be switched
# off within a day, which is the failure that leaves no gate at all.
set -uo pipefail
PAYLOAD="$(cat)"   # ONCE: the payload is consumed by the first reader.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f tools/harness-guard.mjs ] || exit 0
printf '%s' "$PAYLOAD" | exec node tools/harness-guard.mjs
