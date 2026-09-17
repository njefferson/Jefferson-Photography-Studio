# 001 · A .zip developed unattended now matches what you saw on screen

*Filed while it was called "a batched raw and the same raw opened are 150°
apart", which is what it measured before anyone knew what it was.*

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

**DONE, 2026-09-17, and it took four measurements to get to a cause.** Arm A
eliminated the pairing: the canvas showed `NIR_0063.dng` and the batch frame read
was `NIR_0063.jpg`, the same photograph. Arm B eliminated the renderer: exporting
the OPEN photograph runs `compileEdit` on the CPU with the live params, and it
read hue 195 and lightness 38.6 — identical to the canvas, which draws through
`gl.ts`. So the two implementations of the edit agree, and resolution is not the
confound either. Arm C printed both parameter sets field by field. Arm D drove the
batch the way the app drives it, and that is where the ground moved.

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

## Outcome

**Shipped 2026-09-17. The 150° was four faults compounding, and the first one was
in the instrument.**

`pickGrade` sets the chosen grade and THEN opens the file picker. The walk wrote
to `#batchFiles` first, so the picker callback ran with no grade chosen and took
its fallback — `{ kind: "look", look: currentLook() }` whenever a photograph is
open. **The walk therefore never once ran the Auto batch it reported.** That also
settles the clue this record called the sharpest available: the swap fix measured
as changing nothing because it changed the built-in/auto assembly, and the walk
was running the look branch. The diagnosis was right and the test was reading a
different path.

With the grade actually chosen, three real faults were left, each measured:

- `batchParamsFor` re-derived the opening ruling instead of using
  `freshBaseline`, the function that exists to be the one copy of it. It
  gray-world balanced every file including camera-rendered ones that open at
  `[1,1,1]`, moved exposure on a file that opens at 1, and took the channel swap
  from `neutralLook()`, where it is hardcoded false — so an Auto batch of a raw
  ran with the swap OFF while the screen had it on. Measured: batch hue 255
  against the screen's 195.
- `withColour` was inferred from the grade's shape, `grade.kind !== "auto"`. So
  "copy the current edit" with nothing dialled in counted as a look, and the
  colour half of the depth lift fired on an unlooked frame with both bands driven
  to their 2.0 ceiling — the case `solveLift`'s own comment records as "not a
  correction, it is a new default", measured at 44 of 44 practice frames. That is
  the 150° itself: batch hue 345 against the screen's 195, 2.2 points of
  lightness apart. The grade carries `hasLook` now, which is the screen's own
  `activeLook !== null`, rather than being guessed from the shape.
- `batchParamsFor` never snapped its measurements to what the sliders hold, while
  `establishFreshEdit` does (`syncToUI(); syncFromUI()`). On a frame whose colour
  sits in three nearly equal hue bands — 195 at 34.2%, 345 at 29.0%, 15 at
  27.4% — that unsnapped drift was enough to reorder them. Forcing the live
  params into the batch put 195 back on top, which is what identified the residue
  as the rounding rather than the pipeline.

After: all four arms of the walk read 0° apart, and 0.0 to 0.2 points of
lightness. Before: camera JPEG 30° and 1.8 points on Auto, raw 60° on Auto, raw
150° and 2.2 points under "copy the current edit".

**What turned out wrong in this record.** Its Options section led with the
two-renderer story, and that was a plausible reading of `export.ts` and `gl.ts`
that measured false in one run. Its Rejected section had the channel swap down as
measured wrong; the swap was right and the measurement was broken. Roadmap item
011's duplication of the edit across two implementations is still a real
liability — it is just not this defect, and it now has a measurement saying the
two agree on at least one frame.

## Rank

**First.** It is the only item on this roadmap that is a live correctness defect
in a shipped feature rather than an unscoped design direction, and it is the
cheapest test of the architectural story that everything else in this app's
render paths is downstream of the missing recipe value. Placed above "Creative"
and "Big image" deliberately: those are both explicitly unscoped and awaiting the
owner's design answers, so nothing is displaced by putting a measurable defect in
front of them. Move it down if the unattended-develop path is not in use.
