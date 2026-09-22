#!/bin/bash
# A value this session has never read cannot be used as if it had been.
# .claude/hooks/ident-guard.mjs carries the reasoning and the measurements.
#
# THE SHIM FAILS OPEN, and the .mjs it calls does NOT — the asymmetry is the
# whole design. A missing LEDGER refuses one class of call, and the session can
# still read, write and report its way out of it. A broken SHIM on a `.*`
# matcher takes away every tool, including the ones needed to diagnose or
# remove it, and there is no way out from inside. Unrecoverable-from-inside is
# what decides it, not severity. Same reading as harness-guard.sh beside it,
# the opposite of plan-guard.sh, and each says which.
set -uo pipefail
PAYLOAD="$(cat)"   # ONCE: the payload is consumed by the first reader.
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f .claude/hooks/ident-guard.mjs ] || exit 0
printf '%s' "$PAYLOAD" | exec node .claude/hooks/ident-guard.mjs
