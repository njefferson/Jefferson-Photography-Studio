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
- **NIR_1651** — the conifer under the cloud deck, opened twice on the real
  canvas under the eir look while building the matte. With the coverage tint
  the picture is a blue sky and a red tree and there is NO WAY TO SEE where the
  mask is: the tint is 32% cyan over a sky that is already cyan. With the matte
  the sky is solid yellow, the conifer is dim monochrome, and the silhouette is
  crisp to the needle. That pair is the whole argument for the control.

## Outcome

**BOTH HALVES SHIPPED 2026-09-20.** The matte first, then the strokes.

`Matte`, beside `Show mask` in the mask editor, drops the photograph to dim
monochrome and paints the selection in the mask's own yellow — darktable's
arrangement, and for its reason: judging a selection and judging a result are
different jobs and the second one's view is no good for the first. Measured on
NIR_1651 under the eir look, reading the real canvas: with the tint, 0.0% of
the frame carries the matte's colour and 7.5% reads grey; with the matte, 54.0%
is the mask's yellow and 45.0% is grey, against 53% coverage from the mask
itself. Pressing it again returns the tint exactly. The walk was made to fail
first — with the press removed, three of its five checks go red.

**Two things were deliberately not done, both from reading rather than from
running.**

- **Overlay mode 0 is untouched, to the character.**
  `tools/mask-truth-walk.mjs` hardcodes that blend's constants and inverts them
  to recover coverage. Changing the existing mode would not fail anything: the
  walk keeps solving, against the wrong constants, and reports plausible
  coverage, edge-band and spill numbers on every frame. The instrument this
  repo judges the sky mask with would start lying with nothing going red.
- **Nothing was added to the data model.** The matte is a preference on the
  session, not a field on `EditParams` or `MaskLayer`: no undo entry, no
  snapshot, no export path, nothing to migrate. The correction strokes are
  where the model changes, and that is the part still to build.

### The strokes

`Add by hand` and `Take out by hand` arm the canvas the way `Paint` does, and a
drag records a STROKE on the mask — image-uv points, a radius as a fraction of
the bitmap's longer edge, and which way it goes — rather than painting a
bitmap. `regenerateSkyMask` replays the list over whatever the generator
produces next, so Reach, Feather and the colour toggle keep working and the
hand work stays where it was put. `Clear by hand` drops the list.

**Measured on NIR_1651, reading the real canvas through the matte.** One
take-out stroke across the sky moved coverage 54.0% to 39.6%. Dragging Reach
from 1 to 1.3 — which regenerates the seed, the refinement and the colour grow
from the photograph — left it at 39.8%, against 54.2% for the same Reach with
no correction: the stroke survived the regeneration that would have destroyed
paint. Clearing it returned exactly the uncorrected 54.2%. The walk was made to
fail first; with the arming press removed, the correction check goes red.

**One rasteriser, and it is the reason the design works.** `stampSegment` in
`pipeline.ts` decides a segment's dab spacing, and both the live preview under
the finger and `rebuildFix`'s replay call it. A stroke therefore cannot change
shape when it is finished, or when Reach is next dragged.

**The live preview is incremental and the first version was not.** Rebuilding
the whole composite on every pointermove replays the stroke so far on each
move, so the hundredth move of a drag replays a hundred segments over a
1024 px bitmap. The preview now stamps only the new segment into a buffer
allocated at pointerdown; `endFix` replays from the automatic bitmaps anyway,
and the dabs are identical because both go through `stampSegment`.

**AND IT REACHES THE EXPORT, which is the one thing that had to be measured
rather than reasoned about.** The preview is the GPU shader; the export is
`compileEdit` on the CPU, rendered from `cloneParams(params)`. A composite
stripped from the clone to save undo memory — which reads as prudent and was
proposed — would have put the corrected mask on screen and the uncorrected one
in the saved file, and the one arm nobody would think to drive is the only arm
that shows it. Measured by exporting NIR_1651 twice, with and without a
take-out stroke, and reading the app's own uncompressed 16-bit TIFF. At full
size: in the stroke's band 85.3% of sampled pixels moved, by up to 31,951 of
65,535; below it and above it, 0.00% moved and the largest difference was
ZERO. `tools/mask-fix-export-walk.mjs` repeats it at quarter size, which is
the same CPU path and sixteen times quicker, and reads 85.9% and 0.00%. The
correction is in the file, and it is only where it was put.

That walk PINS the export format and checks the bytes that arrive. The Format
control is a remembered preference, so a walk that takes whatever is selected
reads a JPEG on one run and a TIFF on the next — which it did, and died inside
its own decoder with no clue which export was wrong.

**Durability is the mask's, not better and not worse.** `editToJson` writes
`masks: []` — no mask has ever survived a durable resume, and the corrections
do not either. They survive a photograph switch within a session, because that
path keeps the live objects.

### What is NOT verified, and it needs a hand on the tablet

**Stroke smoothness.** Every dab bumps the mask's `rev`, which is what both GPU
atlases key their upload signature on, so a correction re-uploads the coarse
atlas (about 390 KB) AND the refined one (about 2.8 MB) on every pointermove.
Painting a brush mask has always re-uploaded the first of those and feels
fine; the second is seven times larger and has never been in a drag before.
Every measurement here is Chromium on a container with a software rasteriser,
where this is not a fair test either way. If a correction drags heavily on the
tablet, the remedy is known and is not a redesign: upload the dab's bounding
box with `texSubImage3D` instead of the whole atlas.

**And a ring under the finger.** The paint brush and the sticker brush both
show one; a correction does not, so its size is only visible by trying it.
Deliberately left out of this slice rather than forgotten.

### And the a11y sweep had never seen a mask editor at all

Found while checking that these controls would be measured: the accessibility
walk visits every panel TAB, and the mask editors are `hidden` until a mask
exists and one is selected. A hidden control has no bounding box, so the
target-size sweep skipped it — which means Show mask, Invert, Delete mask,
Reach, Feather, the join radios and the whole brush row had never been in a
sweep either. The same shape as the defect that made the walk visit tabs in
the first place, and as the one that made it enter crop mode: a sweep reports
on what it managed to see, and nothing in its output tells that apart from
coverage. `tools/a11y-walk.mjs` now adds a Sky mask and measures its editor as
its own state, in both themes and at both widths.

**And it found one on its first run, which is the whole point of a new check.**
The "×" beside each mask in the list — the only way to delete a mask from
there — measured 29x44 by finger at both widths, against the 44px bar. One
glyph plus ten pixels of padding. It has been that size for as long as the
mask list has existed, and nothing could see it. `min-width: 44px` rather than
more padding, so the glyph stays centred and the row's layout does not move.
