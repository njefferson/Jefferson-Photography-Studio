# 007 · Tiles for a photo you have not opened yet

## Context

A tile for a photo that HAS been opened matches the photograph to 0.004 on a
centre-against-edge measure; one that has not is 0.052 off, on a flat with a 43%
hot spot. The lens correction is not the cause — present at full strength on both
sides. The automatic depth lift is worked out twice, once for the tile and once
when the photo opens, and the two answers differ on a frame whose middle is near
white.

The stated fix is to render an unopened photo's tile through the same code the
open path uses, which means lifting the opening baseline out of
`establishFreshEdit` as a pure function — a refactor of a load-bearing function
with undo semantics attached.

## Looked up

**Nothing external applies.** Like 001, this is a divergence between two paths in
one codebase. What this item needed and did not have was not research but a
CONTROL: several measurements were taken against the wrong comparison.

## Weighed against

**Same defect class as 001**, on a different pair of paths — the four assemblers
each rebuilding the at-open ruling. The refactor this item names (a pure baseline
function) is the structural fix for both, which is the argument for treating them
as one piece of work rather than two.

Depends on the `EditParams` five-places rule in `CLAUDE.md`: `establishFreshEdit`
writes the Reset baseline and `origParams`, so extracting from it touches undo.

## Options

**Extract the opening baseline as a pure function and call it from both paths.**
The stated fix, and the one that closes 001 as well if 001's cause turns out to
be the same class.

Patch the thumbnail path's lift to match. Narrower, and leaves the two copies in
place to diverge again.

## Rejected

**"Nothing re-checks a tile's stamp when its photo gains an edit."**
`restripForGrade` is called only on a grade move, so a call was added where the
edit is stored. Measured on builds with and without it: **tiles already redraw
after their photos are opened either way**, and the added call only shifted which
tile won a debounce race. Removed rather than shipped.

**The 0.2726 re-measurement of 2026-09-13.** It measured the provisional preview —
the camera's embedded JPEG a tile shows the instant a photo lands — not this app's
render. The tell was that it came out 0.2726 and 0.2730 on two different
photographs, and a per-photo divergence does not agree to three decimals across
frames. Waiting for `.provisional` to clear gives 0.0000 on both. **It was
published in a commit message before it was checked.**

**Tile-against-tile as the control.** It proves only that two readings agree, and
they can agree by both going through `makeThumb`. The right control is the tile
for an unopened photo against the PHOTOGRAPH that appears when it is opened, by
canvas screenshot — a WebGL canvas cannot be read with `getImageData` without a
preserved drawing buffer. Screenshot the CANVAS, never `#stage`: dark margins
around the picture wreck a centre-against-edge ratio harder than any hot spot
(0.62 against 1.98 on one frame).

**"No shipped profile can match these frames."** Asserted from a provenance
comment naming a NIKON Z 50 against fixtures from a Z50_2. `matchAny` keys on
`p.model === ex.lens` — the LENS; the body is not part of matching. The app,
asked directly, reports the match and why colour is withheld. **Ask the app
before concluding something about its matching.**

## Rank

**Seventh**, and it may merge upward into 001. Held here rather than promoted
because the refactor it requires is load-bearing and 001's instrumentation should
say first whether one extraction closes both.
