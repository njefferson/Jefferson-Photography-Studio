# 045 · The shipped list shows readers the oldest twelve

## Context

Found 2026-09-22, while archiving 039 and 038.

`notesPage()` in `vite.config.ts` builds the public `/notes` page's "Recently
shipped" list as `checklist(archive).filter(done).reverse().slice(0, 12)`, under
the comment *NOTES keeps newest last; readers want newest first*.

**The archive does not keep newest last.** Measured over its 114 entries: 82
carry a date, and of the 81 dated pairs in file order only 13 are inversions —
so the file runs **newest-FIRST**, from 2026-09-21 at the top down to 2026-07-04
near the bottom, about 84% monotonic. Three entries sat at the very end because
the sessions that appended them followed the comment rather than the file.

So `reverse()` turns the newest-first file oldest-first, and `slice(0, 12)` then
hands the reader a window reaching back to **July 2026** while roughly eighteen
of the most recently shipped items — everything from 2026-09-17 to 2026-09-21 —
sit outside it and are never rendered at all. The reader's list of what shipped
recently is the oldest twelve things in the archive.

**The defect demonstrated itself during that archiving.** 039 and 038 were first
placed at the top of the section, following the entry already there, and the
built page showed them absent from `/notes` entirely. Nineteen commit gates were
green on that placement. It was found by reading the built HTML, not by a check.

## Looked up

**The field puts the ordering in the DATA and the newest first.** Keep a
Changelog 1.0.0 (keepachangelog.com/en/1.0.0) states it as a principle — the
latest version comes first — and Common Changelog (common-changelog.org), a
stricter subset of it, keeps the same latest-first rule while tightening how
entries are sorted within a release.

That matters for which half to change. The archive already follows the field's
convention; the renderer is the half that contradicts it. Re-sorting the file to
satisfy the renderer would move this repo AWAY from the documented convention to
accommodate one `reverse()` call.

**Nothing outside bears on the second question** — how to keep it from drifting
again — because that is about this repo's own gate chain.

## Weighed against

`NOTES.md` "## Versioning" owns what a release number means and is untouched by
this; the in-app patch notes come from the filtered git log, not from this
section, so this cannot move them.

**The nearest previous work is 041**, the panel's scroll cues, whose lesson was
that a fix aimed at a corner somebody happened to look at gets taken twice. The
same trap is live here: "move the three entries that are in the wrong place" is
the corner fix, and it leaves the renderer still disagreeing with the file.

`tools/notes-check.mjs` already parses both checklist sections and already exists
because a `## ` in the wrong place silently emptied the in-app Roadmap across
five commits. This is the same file's second blind spot: it checks that the
sections PARSE, never that what they parse to is what the reader should see.

## Depends

- touches 041 — 041 is the other recently-archived reader-facing surface defect,
  and its lesson about corner fixes is what rules out the three-entry move here.
  Neither changes what the other computes.
- distinct-from 022 — 022 is the look's own finishing panel, a different surface
  with a different renderer. It is named here only because both are "a panel
  shows the wrong subset", and conflating them would send a session to
  `src/look.ts` for a defect that lives in `vite.config.ts`.

## Options

**Align the renderer to the data: drop the `reverse()`, take the first twelve,
and move the three tail entries to the top so the file is uniformly
newest-first.** Chosen.

It is a one-line change to `notesPage()` plus a three-entry move, and it leaves
the file matching the convention the field documents and the convention most
sessions here have actually followed. The comment that was wrong gets corrected
rather than obeyed.

Verified against the measurement: the first twelve entries after the move are
dated 2026-09-18 to 2026-09-22, which is the answer the list is supposed to give.

**And the gate lands in the same commit**, because this repo's whole gate history
is that a convention in a file is the thing that drifts. It goes in
`tools/notes-check.mjs`, which already parses this section.

**The gate is designed from the measurement, not from taste.** Strict
monotonicity is not available: 13 of 81 dated pairs are inversions today and
would still be after the fix, so a sorted-order check would refuse correct work
on its first run, which is how a gate gets switched off. What the reader actually
cares about is checkable instead — **every entry in the rendered window is within
14 days of the newest dated entry in the archive.** Today that spans about eighty
days and fails; after the fix it spans four and passes. Undated entries cannot be
judged, so the count of them inside the window is declared and printed.

## Rejected

**Moving only the three misplaced entries.** It makes `/notes` correct this
afternoon and leaves the renderer reading the file backwards, so the next session
that appends at the bottom — following the same comment, which would still be
there — recreates the defect. This is 041's corner fix with a different corner.

**Sorting the rendered list by a parsed date.** Only 82 of 114 entries carry any
date and only **8** carry an explicit SHIPPED/FIXED one; the rest would sort as
undated and be silently dropped or clumped. A renderer that quietly omits a
third of the archive is a worse defect than the one being fixed, and it would be
invisible for the same reason this one was.

**Re-ordering the whole archive newest-last to satisfy the comment.** The largest
possible diff — eighteen multi-paragraph entries moved — to make the file
disagree with the documented convention, and it fights what sessions here
actually do, so it would drift straight back.

**Rendering the whole archive with no window.** 114 entries, most of them several
paragraphs, on a page a reader opens to find out what changed. The bound is the
feature; MoleBridge's changelog page is the precedent for why a panel a reader
must scroll past thirty releases to leave punishes them for opening it.

**Leaving it and writing the convention into CLAUDE.md.** An instruction in a
file has never once refused the commit it forbade, and this repo has more lessons
about that than about anything else.

## Rank

**Above the additions, below the defects that change what the app computes.**

It is reader-facing and it actively mis-states what shipped, on a public page, so
it is a defect rather than an improvement. It does not invalidate anything ranked
above it — nothing on the schedule reads this section — so by the dependency test
it does not go to the top; being found today does not privilege it either.

What argues for it over the remaining additions is that it is cheap, it is
already measured, and the surface it corrupts is the one a reader consults to
find out whether a thing they were waiting for has arrived — which is the same
question the archived 039 and 038 were being answered wrongly on for a day.
