# 083 · Housekeeping: walks that cannot see what they claim, and paths into dead sessions

## Context

Asked 2026-09-29: several housekeeping items before the app is called
finished. These are the ones found and not fixed, each measured when found.

- **A walk runs half its cases in every fresh container, and says nothing.**
  `tools/agreement-walk.mjs` takes its camera-JPEG pair from a folder inside
  an earlier session's scratch space. That folder exists in no container
  since, and the walk drops a set whose files are missing without a word, so
  it has checked raw files only.
- **The same walk cannot tell a batch that honours a look's sky setting from
  one that ignores it.** Measured 2026-09-29 (record **078**): run on
  NIR_1661.NEF against a build planted to ignore Bold Pink's sky opt-out in a
  batch, and against the real build, it printed the same verdict for both,
  10.2° of hue apart against a bar of 15, with the batch's mean colour two
  levels apart between the builds. The walk counts pixels per hue and never
  weighs how saturated they are, so a change in saturation reads only through
  pixels crossing its grey floor. On that frame the batch's largest hue bin
  (165°, the sky) is not the screen's (315°, the foliage) in either build,
  with the means within about a level: close shares flipping a coarse bin,
  or a real difference, and not yet told apart.
- **A tool's default output points into a dead session.** `tools/look-sheet.mjs`
  writes to an earlier session's scratch folder when no `--out` is given.
- **The architecture document's pipeline diagram is short of the pipeline.**
  It is generated from a source comment, and that comment leaves out the lens
  flat at decode, highlight recovery, the three-channel mix and the three sky
  stages.
- **Counts in prose that no gate holds**: a spelled count in a source comment
  in src/skyfine.ts, one in a NOTES.md section on the Sky mask, and one in
  record **023**. Each was right when written and nothing notices when the
  thing counted changes.
- **The diagnostic report read empty in a headless capture** (2026-09-29),
  while it fills on a device. Either the capture read it before it was written
  or the headless path takes a branch the device does not.
- **GitHub reported open Dependabot alerts on this repository** in the push
  output of 2026-09-29. Nobody has read them.

Not listed here: the hub's stray remote branch of the same name as this
session's. It is the hub's, not this repository's, and deleting a remote
branch is a manual step a session cannot take, so it is a status line in the
report rather than an item on this roadmap.

## Looked up

Nothing outside the repository bears on these: each is a fact about this
repository's own tools and text, measured here. The one general point is this
repository's own (hub LESSONS 11 and 7g): a check that cannot fail is not a
check, and a walk that drops a case silently is a check that cannot fail for
that case.

## Weighed against

- Record **078**, whose batch check found the walk's blindness; its screen
  half was proven by reading the slider on a planted build instead.
- Record **023**, one of the three prose counts.
- NOTES.md, "Verify before claiming fixed": make a new test fail once before
  trusting it — the agreement walk's JPEG set has not run, let alone failed,
  in any container since the folder went.

## Depends

- touches 078 — its verification found the agreement walk's blindness.
- touches 023 — one of the prose counts is in it.

## Options

1. **Fix each, and refuse the class.** Chosen.
   - A gate refusing any path into a session's scratch space in a tracked
     tool, which is the cause of the first and third items; the walk's
     camera-JPEG pair comes from the owner's shared files instead.
   - The agreement walk asserts that the largest hue bin agrees, beside the
     distance, and fails when a declared set's files are missing.
   - The architecture comment carries the stages it leaves out.
   - The three prose counts either derived or cut.
   - The diagnostic report measured on a headless run and on the device, and
     the difference named.
   - The Dependabot alerts read and each triaged.
2. Fix each item as a one-off, with no gate.
3. Leave the list to be picked off between other work.

## Rejected

- **2, one-offs.** Two of the items are one mistake, a path into a session
  that ends, made twice; without a gate it is made a third time.
- **3, between other work.** Two of these weaken the proof of whatever is
  verified with the agreement walk, so they are not idle.

## Rank

At the end, with the other release-readiness items, before the practice
photographs (record 082). It was written second, after Bold Pink (record
078), on the argument that two of its items weaken the agreement walk the
items after it are verified with. The owner set the order on 2026-09-29: the
lens correction first, and this with the release-readiness work. The lens
correction's own verification does not lean on the agreement walk, which
does not exercise the decode-time flat; it uses the lens-order walk, whose
files sat in an earlier session's folder and were moved to the owner's shared
set under 015 on 2026-09-29, where the walk was run to a pass and made to fail
once.

## Looked at

- NIR_1661.NEF, 2026-09-29: opened under Bold Pink on the screen, in record
  078's three-panel sheet. The batch output the agreement walk measured on it
  was not opened: the finding here is about the walk's numbers, what they can
  and cannot tell apart, and not about how the batch looks.
