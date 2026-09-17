# 001 · A batched raw and the same raw opened are 150° apart

## Context

`tools/agreement-walk.mjs` renders one photograph two ways and compares the
largest 30° hue bin. On a raw, **on Auto with no look applied at all**, opening
the file reads hue 195 and batching it reads 345 — 150° apart, 2.2 points of
lightness apart. It has been red on every run this session and it is red in
production: "Develop unattended" is the feature, so a set developed unattended
may not be the rendering the reader saw.

The walk exists because there is no value in this app meaning "how photograph X
renders". There is one mutable `params` meaning "how the OPEN photograph
renders", and four separate paths reconstruct the at-open ruling by hand:
`establishFreshEdit`, `makeThumb`, `batchParamsFor`, `openPhotoExportJob`.
`freshBaseline` was extracted to be the single copy and two of the four use it.

## Looked up

**Nothing external, and that is the correct answer here rather than a gap.**
This is a divergence between two paths in one codebase, not a question about a
real-world medium, so Doctrine §11e's research step has nothing outside this
repo to reach for. The one place it WOULD apply: if the cause turns out to be
colour management on the export path — an ICC profile embedded by `src/icc.ts`
that the canvas comparison does not carry — then how a browser applies an
embedded profile to a decoded JPEG is a solved, documented thing and must be
read rather than derived.

## Weighed against

Overlaps decision **007, "Tiles for a photo you have not opened yet"**, which is
the same defect class on a different pair of paths: the depth lift worked out
twice, once for the tile and once when the photo opens, with the two answers
differing. 006's own text already names the fix as "lifting the opening baseline
out of `establishFreshEdit` as a pure function". If that refactor lands, both
items may close together — which is an argument for doing 006's refactor once
rather than patching two paths separately.

Previous work on this exact number: `NOTES.md` "## The camera-JPEG tile
disagrees under the new Aerochrome — OPEN, 2026-09-16" recorded the second arm
of the same walk, and wrongly attributed this raw arm to the unconditional
gray-world balance in `batchParamsFor`.

## Options

**Instrument the batch path and discriminate before changing anything.** Log the
resolved `EditParams` the batch actually uses against the open photograph's, field
by field, and find which fields differ. Chosen because two diagnoses have already
been asserted from reading and both were wrong; the next step must produce
evidence, not a hypothesis.

Make `batchParamsFor` call `freshBaseline` for its Auto case, closing the
assembler gap structurally rather than per-field. Correct in principle and still
the likely eventual shape — but it was attempted in the form of the swap field
alone and changed nothing, so it must not be attempted again until the
instrumentation says which fields are actually in play.

Compare exported BYTES rather than canvas pixels. The walk reads the batch's
stored JPEG through `createImageBitmap` and the open photograph through
`readPixels`; a colour-management or tone difference between those two routes
would produce a real divergence that no pipeline change could fix. This has to be
ruled in or out before any pipeline conclusion is trusted.

## Rejected

**Gray-world balance, 2026-09-16.** `batchParamsFor` opens with
`grayWorldWB(img)` unconditionally, and that was written up as the cause. It is
not: `freshBaseline` also gray-world balances a raw, so both paths do the same
thing on the fixture in question. A real defect for camera-rendered files, which
open at `wb [1,1,1]` — but not this one, and it is a separate item.

**The channel swap, 2026-09-16, and this one was coded.** `neutralLook()` gives
`swapRB: false` while `freshBaseline` gives `swapRB: img.isRaw`, so on Auto a raw
appeared to open with the swap on and batch with it off — a clean 150°-shaped
explanation. The fix was written, commented, built, and the walk came back
**byte-identical: batch hue 345, unchanged.** Backed out. The trace afterwards
confirmed `runBatch` does call `batchParamsFor`, so it was not dead code, and
**why that edit changed nothing is itself unexplained and is the sharpest clue
available.**

## Rank

**First.** It is the only item on this roadmap that is a live correctness defect
in a shipped feature rather than an unscoped design direction, and it is the
cheapest test of the architectural story that everything else in this app's
render paths is downstream of the missing recipe value. Placed above "Creative"
and "Big image" deliberately: those are both explicitly unscoped and awaiting the
owner's design answers, so nothing is displaced by putting a measurable defect in
front of them. Move it down if the unattended-develop path is not in use.
