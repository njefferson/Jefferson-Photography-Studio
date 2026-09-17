#!/usr/bin/env node
// A MEASUREMENT HARNESS STATES WHAT WOULD FALSIFY IT, OR IT DOES NOT RUN.
//
// A `PreToolUse` gate on Bash. It reads the command, finds any `node <path>`
// pointing at a scratchpad measurement script, and refuses unless that file
// carries a MADE TO FAIL block: a stated quantity the instrument must reproduce
// from something already known, printed before its own results, with the run
// disowning itself when the quantity is absent.
//
// WHY, measured in one session on 2026-09-17. Eleven harnesses were written.
// The three that carried such a block:
//   - refused their own eight-row table when a chroma statistic read two
//     renderings 1.13x apart on a difference plainly visible in two
//     screenshots — the statistic was averaging a whole sky at a 4 px lag when
//     the artefact is clustered and 10-25 px across;
//   - caught a reference arm that had rendered the unfiltered frame because a
//     pre-pass parameter had been handed to the wrong function, reading as a
//     stage that changed nothing rather than a stage that never ran;
//   - caught a sky-mask arm winning on the residual by removing the colour, and
//     printed it as the loss it is.
// The ones without a block produced confident numbers that were quietly wrong
// and were acted on. The cost of the block is six lines; the cost of its
// absence was most of a paid day.
//
// NARROW ON PURPOSE. It gates scripts under a scratchpad/trace path — the place
// this repo's own rule puts throwaway measurement harnesses ("Scratch harnesses
// live OUTSIDE the repo, in the session scratchpad"). It does not gate the
// repo's own committed tools, which have their own gates and their own review,
// and it does not gate node one-liners with `-e`, which cannot hold a block and
// are not measurements.
//
// AND IT FAILS OPEN, unlike plan-guard.sh beside it. That one refuses a WRITE
// and a missing gate silently restoring the ability to push is worse than a
// stall. This one refuses a READ-ONLY measurement, so an unreachable gate that
// blocked every harness in the session would be switched off within a day —
// which is the failure mode that leaves no gate at all.
import { readFileSync } from "node:fs";

/** The scratchpad harness paths a shell command would run under node.
 *  Takes the command string; returns the matched paths, absolute.
 *  What the caller relies on: a path is returned ONLY when the command actually
 *  invokes node on it, so `cat`, `sed` and an editor never trip the gate — the
 *  point is to gate RUNNING an instrument, never reading or writing one.
 *
 *  IT RESOLVES AGAINST A `cd` IN THE SAME COMMAND, and the first version did
 *  not — it required the literal string "scratchpad" in the argument, so
 *  `cd $S/trace && node skymask.mjs` sailed through, which is the exact form
 *  every harness in the session that motivated this gate was run with. Made to
 *  fail once and it did not fail; that is the only reason this paragraph and
 *  the resolution below exist. */
export function harnessPaths(cmd) {
  const out = [];
  // Every directory the command cd's into, in order. A bare script name is
  // resolved against the LAST one, which is what the shell would do.
  const cds = [...cmd.matchAll(/(?:^|[\s;&|(])cd\s+("[^"]+"|'[^']+'|\S+)/g)]
    .map((m) => m[1].replace(/^["']|["']$/g, ""));
  // `node x.mjs`, `nohup node x.mjs`, and the same after `&&`, `;`, `|` or a
  // subshell. Deliberately not a shell parser: a command this misses is a
  // harness that runs without the block, which fails open by design.
  const re = /(?:^|[\s;&|(])(?:nohup\s+)?(?:timeout\s+\S+\s+)?node\s+(?:--[\w-]+(?:=\S+)?\s+)*("[^"]+"|'[^']+'|\S+)/g;
  for (const m of cmd.matchAll(re)) {
    const raw = m[1].replace(/^["']|["']$/g, "");
    if (!/\.(mjs|js|cjs)$/.test(raw)) continue;
    const abs = raw.startsWith("/") ? raw : cds.length ? `${cds[cds.length - 1].replace(/\/$/, "")}/${raw}` : raw;
    if (!/scratchpad/.test(abs)) continue;
    out.push(abs);
  }
  return out;
}

/** Whether a harness states what would falsify it.
 *  Takes the file's text; returns true when the marker reaches the harness's
 *  OWN OUTPUT rather than sitting in its header prose.
 *
 *  THE TEST IS THE MARKER INSIDE A console.log, and the first version was a
 *  list of disowning phrases instead — "not trustworthy", "nothing below", and
 *  so on. It refused a harness that carried a real control saying "the control
 *  did NOT fire", which is a false positive, and a gate that refuses correct
 *  work is a gate somebody routes around within a day. Requiring it to be
 *  PRINTED is both narrower and closer to the point: the value of the block is
 *  that the run disowns itself in front of whoever reads the numbers, and a
 *  control in a comment cannot do that.
 *
 *  DELIBERATELY SHALLOW past that. No parser tells a real control from a
 *  sentence shaped like one — the same reason .contract-allow's fourth part is
 *  a checklist — so this refuses a harness that never considered the question
 *  and cannot refuse one that considered it badly. */
export function statesItsControl(src) {
  return /console\.log\([^)]{0,400}MADE TO FAIL/is.test(src)
    || /MADE TO FAIL[^`'"]{0,400}`\s*\)/is.test(src);
}

const payload = readFileSync(0, "utf8");
let cmd = "";
try {
  const j = JSON.parse(payload);
  if ((j.tool_name ?? j.toolName) !== "Bash") process.exit(0);
  cmd = j.tool_input?.command ?? j.toolInput?.command ?? "";
} catch {
  process.exit(0); // unparseable payload — fail open, see the header
}
if (!cmd) process.exit(0);

const bad = [];
for (const p of harnessPaths(cmd)) {
  let src = "";
  try { src = readFileSync(p, "utf8"); } catch { continue; } // not written yet
  if (!statesItsControl(src)) bad.push(p);
}
if (!bad.length) process.exit(0);

const reason = [
  `This harness does not state what would falsify it: ${bad.join(", ")}`,
  "",
  "Add a MADE TO FAIL block before its own results: name one quantity the",
  "instrument must reproduce from something already known — a figure from",
  "IR-SCIENCE.md, an earlier run, a report from the device — print it, and say",
  "in words that nothing below is trustworthy if it is absent.",
  "",
  "Measured 2026-09-17: of eleven harnesses in one session, the three with such",
  "a block each caught a wrong instrument before its numbers were acted on. One",
  "read two renderings 1.13x apart on a difference visible at a glance. The ones",
  "without produced confident wrong numbers that were acted on.",
].join("\n");
process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "deny",
    permissionDecisionReason: reason,
  },
}));
process.exit(2);
