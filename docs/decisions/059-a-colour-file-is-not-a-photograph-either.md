# 059 · A colour file is not a photograph either

## Context

2026-09-24, the same session as 058: tools that need no photograph were
unreachable until one was opened, because the panel that holds them is
hidden whenever no photo is open.

**The gating was wrong for the LUT library specifically.**
`setStartScreen()` (`src/main.ts`) sets `panel.hidden = up || !current` —
the WHOLE side panel, every tab, is hidden whenever no photo is open, with no
exception. The "Imported LUTs" section 057 put on Grade holds an import
button, a stored-LUT list (Apply/Share/Delete per entry) and the
currently-applied strip (name, strength, Remove) — and only that last part
actually needs an open photo. Importing a file or a pack, browsing what is
already stored, sharing or deleting an entry: none of it reads or writes
anything about a specific photograph. All of it was unreachable until one was
opened anyway, because it lived inside the gated panel along with everything
that does need one.

## Looked up

**This app had already solved the identical problem once**, for lens
measurement, and said so in its own comments. `src/main.ts`, right above
where `lensDlg` is wired: *"A LENS IS NOT A PHOTOGRAPH, so every route to
this works with nothing open: the start screen, the version panel, and the
Corrections card for when you are already looking at the sliders it
replaces."* A single shared `<dialog id="lensDlg">`, opened by `openLens()`
from three separate buttons (`welcomeLensBtn`, `verLens`, `lensMeasureBtn`),
each just calling the same function — closing whichever of `infoDlg`/`verDlg`
was open first so two modals never stack. The dialog itself has no idea which
button opened it. That pattern, not a new one, is what this record applies to
LUTs.

Nothing external — this is app-internal navigation, read from the source
rather than researched.

## Weighed against

**057** relocated the whole "Imported LUTs" block onto Grade, reasoning that
it composes with the channel-mixer's swap chip and the two should sit near
each other. This record doesn't move that reasoning: the part that
genuinely belongs beside the swap chip — the strip showing what's applied
to THIS photo right now — stays exactly where 057 put it. Only the library
half, which was riding along for no reason other than convenience at the
time, comes out.

**058**, shipped earlier the same session, added `updateLookUI()` calls
inside `applyLutToEdit()` and the `lutRemoveBtn` handler so a stacked LUT
badges the active Look. Both keep working unchanged here — `applyLutToEdit`
doesn't care where the button that called it lives, and the new dialog's
Apply handler calls the same function.

## Depends

- touches 057 — same section of Grade, split rather than relocated again:
  the applied-LUT strip stays, the library half moves out.
- touches 058 — same `applyLutToEdit`/`renderLutList` machinery; the badge
  and the dialog compose without either knowing about the other.

## Options

**A shared `<dialog id="lutManageDlg">`, the same pattern as `lensDlg`.**
Chosen. The import button, the hidden file input and the stored-LUT list
move out of `#sec-grade` into the new dialog, opened from three places:
`welcomeLutBtn` on the start screen, `infoLutBtn` in the (i) dialog's
Settings (beside the Rob Shea recommend-link added earlier this session —
the exact place a reader learns LUTs exist at all), and `lutManageBtn` on
Grade, replacing the old inline import button as a teaser into the same
dialog — mirroring `lensMeasureBtn`'s role on Corrections. The
currently-applied strip (`#lutActive`) stays on Grade, tied to `current` as
it always was. Every id the app's JS already addressed (`lutImportBtn`,
`lutFile`, `lutList`) is unchanged — 057's own finding that these are
id-based, not tab-based, meant moving the markup changed no application
logic, only where it renders. One addition: the Apply button now closes
the dialog on success (`if (lutManageDlg.open) lutManageDlg.close()`), so
applying from Grade with a photo open shows the result immediately instead
of leaving the reader looking at a list.

2. Leave the panel gated, add a note telling the reader to open a photo
   first. Rejected below.
3. Un-gate the whole panel/tab system from `current`. Rejected below.
4. Duplicate the list markup — one copy inline on Grade, one in a dialog.
   Rejected below.

## Rejected

**2, a note instead of a fix.** Doesn't fix the defect — the reader
would still have to open some photo, for no reason connected to what
they're trying to do, just to read a sentence explaining why. This app
already has a real answer built and proven; reaching for a smaller one here
would be choosing not to use it.

**3, un-gate the whole panel.** Every OTHER tab genuinely assumes an open
photo throughout its rendering — masks key a selection on the frame,
Corrections shows lens-fix sliders against it, Crop shows guides over it.
Decoupling `panel.hidden` from `current` generally is an app-wide change
with real risk (eleven tabs' worth of render paths to re-audit) to solve a
problem that exists on exactly one of them. The LUT library is the only
tab content with no dependency on `current` at all; treat it as the
exception it is, the way lens measurement already was.

**4, duplicate the markup.** `renderLutList()` targets `$("lutList")` by a
single id; a second copy either needs a second id and a second render path
kept in sync by hand — the defect class this repository has the most
lessons about, a rule stated in two places where only one gets updated —
or the same id twice in the DOM, which is invalid HTML and means
`getElementById` silently only ever finds the first one. One list, moved,
costs neither.

## Rank

Shipped immediately alongside 058, same session. Cause and fix were
already established by an existing in-app precedent (lensDlg) —
there was no design content to invent, so the ranking question the queue
exists to answer doesn't arise. Nothing above it in the queue touches the
Grade tab or the start screen's button list.

## Outcome

Shipped in the same session as 058. `ir.html`: `#sec-grade`'s "Imported
LUTs" block trimmed to the sub-title, a `lutManageBtn` teaser, and the
`#lutActive` strip; a new `<dialog id="lutManageDlg">` (added after
`lensDlg`) carries the import button, `#lutFile`, `#lutList` and their
explanatory notes, split from the strip's own note as described above; the
start screen gained `welcomeLutBtn` beside `welcomeLensBtn`; the (i)
dialog's Settings section gained `infoLutBtn` as its first row.
`src/main.ts`: a new `openLutManage()` mirroring `openLens()` exactly (same
modal-stacking guard, same tap-outside-to-dismiss), wired to all three
buttons; `openLens()`'s own closing list extended to include
`lutManageDlg` so the two stay mutually exclusive; the Apply handler in
`renderLutList()` closes `lutManageDlg` on success.

**Verified functionally, all nine checks green**, headless, against the
real build: the dialog opens from the start screen with no photo at all;
the real Rob Shea pack imports and lists there (18 entries) with nothing
open; pressing Apply with no photo toasts and leaves the dialog open
(nothing silently lost); the (i) dialog's `infoLutBtn` closes `infoDlg` and
opens `lutManageDlg`; on Grade with a photo open, `lutManageBtn` opens the
same dialog, importing and applying there closes it and the `lutActive`
strip shows the result immediately.

`tsc --noEmit` clean; the full fast gate set green after regenerating
`docs/ARCHITECTURE.md` (mechanical, `main.ts`'s line count moved).
`tools/a11y-walk.mjs` required `lutManageDlg` added to `tools/surfaces.mjs`'s
`PAGES` list (hub LESSONS §28's own gate, caught immediately) — with that
one line, section 0 passes (7 pages declared both ways) and section 2's
generic per-dialog hit-area sweep covers the new dialog at both widths with
no further wiring, since it opens every declared dialog by id rather than
by driving a trigger button.

**What this cost, and what is not yet known.** `tools/control-walk.mjs`
(advisory, not a commit gate) was reported going from 54 to 57 unreached
controls — `lutManageClose`, `lutManageCloseTop` and `lutImportBtn`, all
inside the new dialog. The explanation first written here was wrong: that
sweep does not drive trigger buttons, it opens every dialog declared in
`tools/surfaces.mjs`'s `PAGES` with `showModal()` and sweeps what is
inside, and `lutManageDlg` is declared there. So those three should have
been reached, and they are: re-measured 2026-09-24 against the build of the
next staging candidate, the sweep reports 54 controls to answer for, with
`lutManageClose`, `lutManageCloseTop` and `lutImportBtn` all reached. The
54-to-57 figure was never true of this dialog.

**What was not re-litigated.** The currently-applied strip's own copy
("A LUT recolours the finished image on top of everything above...") was
trimmed of the storage/pack sentences that now belong to the dialog instead
— a wording split, not a new claim; nothing it says changed.
