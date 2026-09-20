# 031 · A generated selection can be corrected by hand

## Context

**The Sky mask is generated and there is no way to fix it.** 029 measured what
it gets wrong — 75.9% of NIR_0627, a macro of a flower spike; the walls and
roof of the playhouse in NIR_0172; a band down each foreground trunk in
NIR_1638 — and 023 and 029 between them have now spent two rounds making the
generator better. Some of that is fixed. What is not
fixed is that when it IS wrong, on this photograph, the reader has one lever:
drag Reach and hope.

Three facts about the code make it uncorrectable today, and each was read
rather than assumed:

- **`regenerateSkyMask` (`src/main.ts`) assigns `m.brush = res.mask` and then
  `m.fine = …` wholesale.** Any hand work in either is destroyed by a Reach
  drag, a Feather drag, or the "Follow the sky's colour" toggle. There is
  nowhere for a correction to live that survives the next regeneration.
- **The only overlay is `mix(outside, inside, cov)` in `src/gl.ts` — a 32%
  cyan tint over the graded photograph.** Under the `eir` and `red` looks the
  swap is on, so IR-bright foliage renders cyan: the population that
  over-selects is the population the overlay hides. There is no view that
  shows the mask by itself.
- **`updateSkyStatus` reports a percentage.** That sentence is equally true of
  a sky and of a playhouse. 029's defect was found with a harness, not by
  looking at the app, and this is why.

## Looked up

**Every editor that generates a selection ships a way to correct it, and the
correction is a LAYER rather than an edit to the generated thing.**

- **Lightroom**: a Select Sky mask is one component of a mask, and the reader
  adds to it and subtracts from it with a brush, a radial, a linear gradient or
  a Color Range — the generated component stays a component. Adobe's masking
  help documents Add, Subtract and Intersect Mask With as the operations, and
  the standard answer to halos and gaps round trees is to intersect a Select
  Sky with a Color Range rather than to re-run the sky detector harder.
- **darktable**: every module's mask is drawn masks and a parametric mask
  combined per pixel, with a mask manager that unions, intersects, differences
  and excludes shapes, and a refinement chain applied to the finished mask
  (details threshold, feathering guide, feathering radius, blurring radius,
  mask opacity, mask contrast). Its raster masks let a later module reuse an
  earlier one's finished mask by name. The reader never edits the generated
  weight; they add terms to it.
- **darktable also ships the view.** The mask icon paints the mask as a yellow
  overlay over a MONOCHROME image — solid yellow is 100%, visible grey is 0% —
  and an eye icon suspends the mask while keeping the blend, so the effect can
  be seen unmasked. Both are for the case this record is about: judging what
  is selected rather than judging the result.
- **And the infrared literature says the same thing in fewer words.**
  IR-SCIENCE.md §9n records a practitioner source whose documented remedy for
  the sky/foliage separation failing is manual painting. That is the field's
  answer for this subject, not a fallback from it.

## Built already

Do not write a second one of any of these.

- **The brush machinery is the whole of the rasteriser.** `stampBrush` in
  `src/main.ts` with its `hard = 0.55` falloff, `sampleBrush` in
  `src/pipeline.ts` with its half-texel convention, the packed brush atlas in
  `src/gl.ts`, copy-on-write plus `rev` for undo equality, and `snapSig`
  dropping `data`. A Sky mask already rides all of it — its bitmap lives in the
  same `brush` field.
- **`src/skyhorizon.ts` and `src/sky.ts`** generate the selection, and
  `skyPrepare` holds the photograph-only half so a regeneration is cheap.
- **`refineSkyMask` in `src/skyfine.ts`** takes the coarse bitmap to 1024 and
  snaps it to the photograph's edges; `MaskLayer.fine` is what the sky-aware
  stages read.
- **`tools/mask-truth-walk.mjs`** is the acceptance instrument AND it is
  coupled to the overlay — see Rejected.
- **`tools/scope-check.mjs`** lists every consumer of the selection.

## Weighed against

**029**, which owns the generator and is still open on the flower macro. This
record is the other half of the same complaint and does not replace it: a
reader should not have to correct a selection that could have been right. But
029 cannot reach every photograph — the flower macro's background has no edge
in it and no classical test distinguishes it from an overcast sky — so a
correction layer is what makes the mask usable on the frames the generator will
never get.

**026**, masks combine by set operators in a group — SHIPPED. That is the
combination of several MASKS. This is correction WITHIN one mask, which 026
does not give: a subtract group takes the other mask's whole shape, and there
is no shape for "this branch here".

**030**, a mask can only act in one place. That is about WHERE a mask acts, not
whether it is right.

**023** is closed; its residual moved to 029.

## Depends

- needs 029 — the generator is still moving. A correction stroke recorded
  against one generated selection and replayed onto a different one is a
  different correction, so the stroke format and the composite have to be
  built against a seed that has stopped changing underneath them.
- touches 026 — both are about combining weights into one selection, and the
  group algebra is where a fifth term would otherwise be expected to go.
- touches 018 — the refined selection is what the corrections compose with,
  and 018 is what made there be one of them.
- touches 023 — 023 built the colour grow this corrects on top of, and its
  "Follow the sky's colour" toggle is one of the three things that currently
  throws hand work away.
- distinct-from 030 — 030 is about a mask acting in more than one place in the
  pipeline. This is about one mask's own shape being wrong. They are
  re-conflated because both sound like "a mask should be able to do more".

## Options

1. **A correction layer on the mask: a list of strokes, a materialised
   composite, and a matte view.** `MaskLayer` gains `fix?: readonly FixStroke[]`
   — the record of what the reader added and took out — and `eff?: BrushMask`,
   the automatic bitmap with every stroke stamped over it, which every render
   path reads in place of the automatic one. A regeneration rebuilds `eff` from
   the new automatic plus the same strokes, so Reach stays live and the hand
   work survives it. Beside it a second overlay mode that paints the mask
   grey-on-black, so what is selected can be judged without the photograph's
   own colour arguing with the tint.
2. A parametric mask type in darktable's shape — four-handle trapezoids over
   several channels, multiplied. That is record 032.
3. Better automatic keys.
4. Subject/background segmentation.

## Rejected

- **3 and 4 for this record.** Both are about making the generator better,
  which is 029 and 032. Neither gives the reader anything on the photograph in
  front of them. 4 is additionally out of scope for an offline on-device app
  with no model, and is recorded because it is the honest comparison.
- **Painting into `m.brush` directly**, which is the obvious shortcut and is
  how a session would build this in an hour. It is refused because
  `regenerateSkyMask` overwrites that field, so the first Reach drag after a
  correction silently discards it — which is the defect this record exists to
  remove, reintroduced one level down.
- **Changing overlay mode 0 to drop the cyan.** This one is a trap and it was
  found by reading `tools/mask-truth-walk.mjs`, which hardcodes that blend's
  exact constants and inverts them to recover coverage. Removing the cyan from
  the existing mode does not fail anything: the walk keeps solving, against the
  wrong constants, and reports plausible coverage, edge-band and spill numbers
  on every frame. **The instrument this repo uses to judge the sky mask would
  start lying with nothing going red.** So the matte is a NEW mode and mode 0's
  shader does not change a character; if it ever does, that walk changes in the
  same commit.
- **Stripping `eff` from `cloneParams` to save undo memory**, which reads as
  prudent and is an export defect: `makeThumb` and the export path both render
  from `cloneParams(params)`, so a stripped composite means the preview shows
  the corrected mask and the saved file shows the uncorrected one. The right
  contract is the one this repo already uses for `brush` — copy-on-write, the
  buffer always freshly allocated and never mutated in place, shared by
  reference across snapshots. And the memory question answers itself:
  `regenerateSkyMask` already allocates a fresh 1024-edge bitmap on every Reach
  gesture and shares it the same way, so this adds no new memory class.

## Rank

**At the top, above 029's remainder.** The dependency test this queue uses asks
whether work above would have to be redone. Nothing above it would; but the
ordering argument runs the other way here and is declared as `needs 029`: the
strokes compose with a generated selection, and a generator still moving under
them makes every correction a different correction. So it sits after 029 — and
after 023, which is only still on the list because it is waiting for the
on-device pass — and before anything that reads the selection, because the
looks' population work (013, 016) is tuned against whatever the selection
finally is, hand corrections included.

## Looked at

- **NIR_0627** — the macro of a flower spike, opened as an overlay at the
  mask's own scale before and after 029's first half. Unchanged at roughly
  three quarters of the frame. Its background is smooth, fills the top half and
  carries no edge, so there is nothing for a border to find and nothing for a
  colour model to be suspicious of. This is the photograph that says the
  generator will not reach every frame.
- **NIR_0172** — the playhouse, opened the same way. The generator improved it
  from most of the frame to the sky above the canopy, and what is left over is
  exactly the shape a stroke fixes: a few small regions, not a re-tuning.
- **NIR_1638** — a river between conifers, opened after 029's first half. A
  vertical band of selection stands down each foreground trunk. Two strokes.
