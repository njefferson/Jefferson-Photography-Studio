#!/bin/bash
# Doctrine §11c, made mechanical. A rule in a file did not stop this happening a
# fourth time; a Stop hook runs whether anything was remembered or not.
# Canonical script: noahjefferson/stop-guard.mjs — never fork it.
#
# FAILS OPEN ON PURPOSE when the hub is not checked out. A guard that blocks
# every turn because a sibling repo is missing gets switched off within a day,
# and a switched-off guard is worse than none. The session brief already says
# loudly when the hub is absent.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-$(dirname "$0")/../..}" || exit 0
[ -f ../noahjefferson/stop-guard.mjs ] || exit 0
exec node ../noahjefferson/stop-guard.mjs
