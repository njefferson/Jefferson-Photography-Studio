# 046 · The control sweep reaches two thirds of the controls

## Context

Found 2026-09-22, in the minute after `tools/control-check.mjs` was renamed
`tools/control-walk.mjs` so that `walk-all.mjs` would pick it up.

**The rename was called "the whole fix" before anyone ran the file.** Running it
is what showed that the rename is necessary and not sufficient: the walk exits 1.

Measured on the built tree at 2.58:

- `ir.html` — 139 of 219 declared controls reached, 18 declared unreachable in
  `.control-allow`, **62 unexcused**
- `macro.html` — 7 of 13 reached, none declared, **6 unexcused**
- `debug.html` — 3 of 6 reached, none declared, **3 unexcused**
- `index.html` — 3 of 6 reached, 3 declared, clean

**71 controls the markup declares are never reached and are not excused.** The
walk's own header explains why that is a failure and not a note: a sweep can
only refuse what it reached, and the first version of that file reported green
over a top bar laid out at 0x0 and a panel that was `hidden`, having never
opened a photograph. Coverage is the half that makes the rest mean anything.

**The rot is visible in which ids are missing.** `ir.html#keptOpen` and
`ir.html#cropLine` are among the 71 — the controls that shipped in 2.57 this
morning, for keeping a photograph and for straightening to a drawn line. Every
feature that adds a control widens this gap, and nothing was running to say so.

**Re-measured 2026-09-24 on the 2.62.10 build: 54 unexcused, down from 71.**
`ir.html` 163 of 225 reached with 17 declared, leaving 45; `macro.html` 7 of
13, leaving 6; `debug.html` 3 of 6, leaving 3; `index.html` clean. `#keptOpen`
is reached now and `#cropLine` still is not. Thirty of the 45 on the editor
sit in groups the triage can take one at a time: the stickers panel (`stk*`,
nine), the busy dialog (`busy*`, four), the lens rig's run controls
(`lensStop`, `lensUse`, `lensBackup2`, `lensCopy2`, `lensSave2`), the session
and finish dialogs (`session*`, `finish*`, five), the quick look (`ql*`,
three), and installed-only or failure-only states (`shareBtn`, `a2hsInstall`,
`a2hsClose`, `glLostReload`). The other fifteen are single controls.

## Looked up

**Nothing outside bears on it, and that is the honest answer.** This is not a
question about a medium, a process or a piece of equipment; it is about the
coverage of one harness against one app's own markup. The relevant prior art is
in this repository: `tools/surfaces.mjs` already solves the same shape for pages
and dialogs by checking BOTH directions against the BUILD rather than the source
tree, and `control-walk.mjs` already copies that design. What is missing is not
a technique but the triage.

## Weighed against

**024 is what exposed this** — it extended the walk by 189 lines and shipped,
and because nothing invoked the file the extension was never run. The rename
that made it runnable is what produced this item.

`NOTES.md` "## Accessibility standing rule" holds the NEVER-CHURN list of
patterns already verified correct; anything done here must not re-open those.

**The precedent for what NOT to do is already written in this repo**: a walk was
once committed failing on purpose, with the note that softening the assertion so
it passes is the one thing not to do. A check that found something and was then
adjusted until it stopped is worse than no check.

## Depends

- touches 024 — 024 extended this walk and its commit is what left the file
  unrunnable; a change to what the walk asserts moves what 024's Outcome claims.
- distinct-from 012 — 012 is also about a control a reader cannot reach, but
  that is a DEFECT IN THE APP (no route back from full view) while this is a gap
  in the INSTRUMENT. Conflating them would send a session to fix the sweep when
  the reader's problem is the app, or the reverse.

## Options

**Triage all 71 into one of two answers, control by control, and let the sweep
stay red until that is done.** Chosen.

Each unreached control is either (a) genuinely unreachable headlessly — it
exists only when installed as a standalone app, only with a GPS-bearing file,
only mid-export, only after a failure — in which case it earns a line in
`.control-allow` with the reason and the condition that would reach it; or (b)
reachable and simply not reached, in which case the sweep is extended to press
it. The existing 24 declarations are the model: each names the state that would
reveal the control, so the file reads as a map of the app's conditional surfaces
rather than as a list of excuses.

**The sweep is red in the meantime, and that is the point.** It was red before
today; the only change is that it is now visible. A red `walk-all` is a cost
paid by every pre-release sweep until this is worked, and that cost is the
honest signal.

## Rejected

**Declaring all 71 in `.control-allow` to get green now.** This is the option
that looks like tidying and is actually the failure this repo has the most
lessons about. Thirty-odd of them are plainly reachable — a crop line, a kept
dialog's open button — and excusing a reachable control manufactures coverage
that does not exist. Green bought that way is worse than red.

**Leaving the file named `control-check.mjs` so the sweep never runs it.** That
is the state that produced this: a gate asserted in four source comments and
invoked by nothing, going redder with every release.

**Making the coverage section print a warning instead of failing.** The same
softening in a different costume, and the walk's own header forbids it in
writing.

**Fixing it all in the commit that renamed the file.** 71 controls is triage
work with a judgement per control, and burying it inside a rename would put an
unreviewable diff under a one-line subject.

## Rank

**At the boundary, above the additions and below the reader-facing defects.**

It is an instrument gap, not something a reader can see, so it does not outrank
the defects that change what the app does. But it does not wait behind the
additions either: it is red on every sweep from now on, every capability release
widens it, and the pre-release walk is the instrument those releases are checked
with. Nothing ranked above it has to be redone once it is fixed, so by the
dependency test it does not go to the top.
