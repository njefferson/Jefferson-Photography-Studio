# 057 · Imported LUTs were on the wrong tab

## Context

Reported in chat 2026-09-24: "LUTs is in export and doesn't belong there? I
need a r<->b swap near them I can use in conjunction with them, or make them
have an invert button each?"

**The location complaint was right.** `ir.html`'s `export` tab held Keep-file,
Export & Save, My looks, then, after two `<hr>`s, "Profiles & LUTs" (the
`.cube`/`.dcp` export buttons) and finally "Imported LUTs" itself. Picking and
applying a third-party colour file is not an export action — it changes the
live preview and every export alike, which is exactly what the panel's own
note said ("recolours the finished image on top of everything above — in the
preview and every export alike"). It sat there because the LUT-import work
(055/056) bolted the importer onto the nearest thing that already said
".cube" — the export buttons — not because it belonged to the export job.

**A working R⇄B swap already existed, twice, and neither copy was near it.**
`#swapBtn` is a one-tap toggle on the **IR** tab, wired to `params.swapRB`.
The channel mixer's own "R⇄B swap" preset chip (`MIX3_PRESETS[1]`,
`src/main.ts`) lives on the **Grade** tab and writes the same permutation into
`params.mix3`. Both were live, both are ordinary `EditParams` fields, and per
`pipeline.ts`'s own doc comment they are meant to compose: "swap + mix + hue
compose." So the two proposed alternatives — a duplicate swap control next to
LUTs, or a per-LUT invert button — were both answering a need that a plain
relocation already satisfies for less.

## Looked up

Nothing external — this is app-internal layout and pipeline order, verified by
reading the code rather than researching a domain. Three questions were
answered directly from source:

**Does a swap already compose with a LUT, or would new pipeline code be
needed?** Traced both the CPU path (`compileEdit`, `src/pipeline.ts`) and the
GPU path (`src/gl.ts`). In both, `swapRB`/`mix3` run early (right after the
camera colour matrix) and the imported LUT is unconditionally the LAST colour
stage — `sampleLut3d` (`src/lut3d.ts`) is a pure function of whatever RGB
triple arrives, with no awareness of what produced it. Confirmed identical
order in both render paths (this repo keeps them numerically identical on
purpose, per `docs/ARCHITECTURE.md`'s note on `pipeline.ts`), and confirmed
the export path calls the same `compileEdit` rather than a separate
implementation (`src/export.ts`, `src/export.worker.ts`). So turning on
either swap and applying a LUT already produces the combined result today, in
preview and in every export route — nothing in the pipeline needed to change.

**What would a per-LUT "invert" button actually mean?** `sampleLut3d` treats
the lattice as an opaque RGB→RGB mapping with no assumption of monotonicity or
channel independence — there is no single well-defined "inverse" of an
arbitrary imported lattice. The one operation cheap enough to build — swap R
and B going INTO the sampler, mirroring the existing 3-line `swapRB` block —
is a coincidental homonym for "invert," not an actual reversal, and it is a
different operation from the existing global swap (which runs before the
whole grade, not at the LUT's own doorstep). Direct evidence the ambiguity is
real: the LUT pack's own `IR Invert.cube` does not behave like a plain
per-channel value inversion (measured in the prior session — black stays
black, white stays white, saturated colour fails a linearity test that grey
passes), so even a LUT author's own use of the word "invert" doesn't mean
literal inversion.

**Would relocating the block break anything mechanical?** Every JS reference
(`$("lutImportBtn")`, `registerPicker("lutFile", ...)`, `renderLutList`,
`applyLutToEdit`) is id-based; none queries by tab or section. No walk or gate
(`tools/control-walk.mjs`, `tools/a11y-walk.mjs`, `tools/openable-check.mjs`,
`.control-allow`) hardcodes which tab these ids belong to.

## Weighed against

**054, "The export panel says save twice"**, filed the same week, is a live
record about the Export tab already being confusing — its rejected option was
explicitly "collapse to one control," and the lesson there is disambiguate,
not add more. Adding a duplicate swap control to Export (rather than moving
LUTs off it) would have gone the opposite direction from that record's own
conclusion.

Searched for precedent of a control deliberately duplicated across two tabs
for convenience anywhere in this app. Found none — every control here lives
in exactly one place.

## Depends

- touches 054 — same tab, same crowding question, argued the opposite
  direction (054 disambiguates what's on Export; this removes a block that
  didn't belong there at all).

## Options

**Move "Imported LUTs" from Export to Grade, directly after the channel
mixer's R⇄B swap chip.** Chosen. Gets the stated need — a swap usable in
conjunction with a LUT — from a control that already exists and already
composes correctly, for a markup-only change: no new EditParams field, no new
pipeline operation, no new persisted state.

2. Leave LUTs in Export and add a duplicate R⇄B swap toggle next to them.
   Rejected below.
3. Give each imported LUT its own "invert" button. Rejected below.

## Rejected

**2, a duplicate swap toggle next to LUTs.** This app has never duplicated a
control across two tabs, and Export already has an open complaint about being
crowded with too many similarly-named things (054). Adding a fourth
colour-adjacent control to a tab whose own record says to disambiguate rather
than add would repeat the mistake that record exists to fix. It also produces
a worse result than relocation: the reader would have a swap toggle in Export
and a DIFFERENT swap chip in Grade's mixer doing the visually identical thing
by a different mechanism (`swapRB` vs `mix3`), which is confusing rather than
convenient.

**3, a per-LUT invert button.** Costed two ways. A flag scoped to whichever
LUT is currently applied (living on `params.lut`, not the stored record) is
cheap — `params.lut` is a nested object `cloneParams`/`applySnapshot` already
copy whole by spread, and LUT fields don't reach `syncFromUI`, the
debounced-slider array, or `stampOf` (a saved look carries no LUT field). A
flag persisted per stored `LutRecord` is expensive — a schema change to
`LutRecord`/the cheap `LutMeta` projection `listLuts()` deliberately returns
to avoid holding every lattice in memory, an async `putLut()` write on every
toggle, and a new store↔live-edit coupling this panel avoids everywhere else
(the Delete button's own confirm text says a stored LUT's removal does not
reach whatever is already applied). But the cost comparison doesn't matter:
at either cost, "invert" has no fixed, predictable meaning for an arbitrary
imported LUT (see Looked up). A button whose effect a reader can't predict
from its label is worse than no button, and the relocation achieves the
underlying want — swap, then apply a LUT, together — without inventing one.

## Rank

Shipped immediately alongside the same session's other LUT work rather than
queued. It is a location correction with no design content, whose fix is a
markup move with no new state, and it needed only reading the existing
pipeline to confirm nothing else had to change. Nothing above it in the queue
touches this panel.

## Outcome

Shipped in the same commit as the relocation itself. `ir.html:1063-1097`
moved from `sec-export` to the end of `sec-grade`, directly after
`#mix3Reset`; a one-line trail note replaces it in Export; the IR tab's note
naming "the Colour tab's channel mixer" was corrected to "Grade," the
mislabel it always had. No id changed, no JS changed, no `EditParams` field
changed.

Verified: `tsc --noEmit` clean; the full fast commit-gate set green;
`tools/control-walk.mjs`'s failure set is byte-identical before and after the
move (54 pre-existing backlog items, unrelated to this — confirmed by running
the walk against the unmoved tree first); `tools/a11y-walk.mjs` passes in
full on both themes and both viewport widths.

**Needs your hands, and it's a taste question the record can't answer:** does
Grade now read right, or does stacking a sixth block (shadows/wheels, toned
mono, grain, vignette, mixer, LUTs) under one tab start to feel like the same
crowding 054 found in Export? If so, that's its own future item.
