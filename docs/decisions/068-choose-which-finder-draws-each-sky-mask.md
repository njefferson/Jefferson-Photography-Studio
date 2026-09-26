# 068 · Choose which finder draws each Sky mask

## Context

The app has two ways to find a sky. Today's hand-built finder (a horizon, then
a grow by colour) draws every Sky mask. A learned one (two segmentation models,
fused) was built as the look's own selection on 2026-09-26, compared with
today's whole frame against whole frame, and taken out the same day (052).

**That verdict stands, and this record does not reopen it.** As the look's
automatic selection, the learned one was better only on NIR_0627, which has no
sky. On the photographs with sky it was worse, and on NIR_1827 the two renders
nearly match. It was taken out. It does not come back as the look's automatic
selection, and it is never the default.

**What is left to decide is narrower: whether a reader may choose it.** Whether
the learned finder should exist at all as a second finder the reader can choose
on a Sky mask, so that a mask could be drawn by whichever finder misses less
sky on the photograph in front of the reader, without losing the hand
corrections, Reach and Feather already on it; and if it should, how far the
choice reaches: the whole photograph, a painted region, or one mask.

- **The learned finder is never applied without the reader choosing it on a
  mask.** A mask with no stored choice is always drawn by today's finder, and
  that default does not change.
- **A reader may choose it on any Sky mask**, including, once 052's Option 1 is
  built, the Sky mask the look reads. That choice is the point of this record:
  a reader who picks the learned finder there picks it for the look's sky on
  that one photograph.
- **Whether any switch is built is decided by a comparison**, once 052's
  Option 1, 069 and 070 have landed, on a Sky mask, on practice frames that
  neither finder was developed on. A switch is built only if each finder loses
  somewhere the other does not. Otherwise today's finder stays alone and
  nothing is built.

**What each of the learned selection's faults touches, read off the source and
the six whole-frame comparisons of 2026-09-26.** These are facts for building on
a Sky mask. None of them changes the verdict.

- **The clouds.** The learned selection took the white clouds of NIR_1651 and
  NIR_1644 into the sky, and the look's sky stages turned them blue-grey. The
  finder took them in; the stages tinted them. The stages also have a defect
  of their own: none has a guard against white. Sky colour smoothing tints a
  neutral pixel, Sky saturation then reads the tint, and Sky depth has no
  per-pixel gate, so it darkens whatever the selection holds (069). Under 052's
  Option 1 that defect reaches cloud in a Sky mask whichever finder drew it:
  069 records the Sky mask's own colour grow taking NIR_1651's cloud too. 069
  is the remedy for the stages' half. None of it changes the verdict: through
  the look, the learned selection rendered these frames worse.
- **The steel.** The learned selection took in the steel of NIR_3461's near
  pylon, which is narrower than one pixel of its 1024 px map, and the stages
  dulled it. That steel arrives red on one face from the foliage band (061), so
  it is not a pixel without colour, and 069's guard is not shown to spare it.
  This one is the finder's resolution and the stages together.
- **The missed sky.** The learned selection left out a sliver above NIR_3466's
  roof and a band beside NIR_1651's upper tree. This lives in the finder. On a
  Sky mask, Add by hand covers what a finder leaves out.
- **NIR_1827**, the sixth frame, has sky. The two renders nearly match. Along
  the treetops, where today's render has a thin pale rim against the sky, the
  learned one has a soft pink-red fringe; and parts of the broken cloud at the
  upper right come out bluer.
- **Today's finder claims sky on NIR_0627**, a flower macro with no sky in it:
  about three quarters of the frame (75.9% on the acceptance instrument after
  the horizon landed). The 2026-09-20 rule in `NOTES.md` on what the Sky mask
  is for does not count that as a failure: a photograph with no sky is one the
  reader does not reach for the Sky mask on. 029 is still open on it. It is the
  one frame where the learned finder did better, and it has no sky.

**And today a choice on a mask would reach nothing the comparison showed.**
Those six renders were the look's sky stages reading the learned selection. A
Sky mask drives its own five adjustments and any whole-photo tool aimed at it,
never the look's sky stages: `regenerateSkyMask` writes the mask's `brush` and
`fine` and never the look's `skyBitmap` or `skyFine`. Until 052's Option 1 is
built, a finder chosen on a mask changes that mask's adjustments and whatever
is aimed at it, and leaves the look's sky where it was, which is two skies on
one photograph.

## Looked up

Read 2026-09-26, from the vendor's own documentation where it would load; a
source that is not the vendor's says "third-party" beside it.

- **darktable 5.6** is the only editor that lets the user pick the model. One
  model is active per task, chosen in preferences, AI, "like a radio button",
  and it applies to every image. It does not find a sky by itself; the user
  clicks the object. Sources:
  docs.darktable.org/usermanual/development/en/preferences-settings/ai/ and
  docs.darktable.org/usermanual/development/en/darkroom/masking-and-blending/masks/ai-masking/.
- **Photoshop** chooses where Select Subject runs, Cloud or Device, in
  Preferences, Image Processing, for the whole app; Adobe says the cloud gives
  "more detailed results". That is where the work runs, not a model the user
  picks. Source for the Cloud or Device choice:
  helpx.adobe.com/photoshop/desktop/make-selections/automatic-color-based-selections/improved-select-subject-and-remove-background-results.html.
  Select, Sky is a one-click command of its own (third-party:
  jkost.com/blog/2020/10/adobe-announces-updates-to-photoshop-2021-v22.html).
- **Affinity** (by Canva, 3.x) offers its built-in selection tools and Canva
  AI versions of them, and the user picks which to run each time. Source
  (third-party): amateurphotographer.com/review/affinity-by-canva-review/;
  Affinity's own help pages load their text by script and returned nothing.
- **Lightroom Classic, Lightroom and Camera Raw** document no model choice.
  Each mask picks a category, and there are two separate sky finders, Select
  Sky and Landscape, Sky, each making a mask of its own. A detected mask is
  kept to a region by adding, subtracting or intersecting a brush, a gradient
  or a range mask. Sources:
  helpx.adobe.com/lightroom-classic/desktop/process-and-develop-photos/masking.html
  and
  helpx.adobe.com/camera-raw/desktop/edit-and-enhance-images/masking-and-local-adjustments/masking.html.
- **Capture One, DxO PhotoLab, Luminar Neo and Pixelmator Pro** pick a
  category per mask and offer no model choice. Capture One's Combine Masks
  adds, subtracts or intersects; DxO has no intersect and its users invert
  twice to get one. Sources:
  support.captureone.com/hc/en-us/articles/14055231933853-AI-Masking,
  support.captureone.com/hc/en-us/articles/30695491704349-Combine-Masks,
  forum.dxo.com/t/local-adjustments-more-masks-interactions/53942,
  support.skylum.com/editing-tools/masking-options/mask-ai and
  support.apple.com/guide/pixelmator-pro/make-intelligent-selections-pixefcaa405e/mac.

**So the field has a model choice for the whole app (darktable), a processing
choice for the whole app (Photoshop), a choice of tool per use (Affinity), and
a category per mask everywhere else. No editor picks a model for a painted
region. Region control is always done by composing masks: add, subtract,
intersect.**

## Built already

What exists that this item will use, so a second one does not get written:

- **The Sky mask's finder has one door.** `regenerateSkyMask` in `src/main.ts`
  is the one place a Sky mask's selection is made: `buildSkyMask` in
  `src/sky.ts` (the 384 px seed, with its horizon from `src/skyhorizon.ts`),
  then `growSkyByColour` or `refineSkyMask` in `src/skyfine.ts`, then
  `applyMaskFix` replays the hand strokes. Adding the mask, Reach, Feather, the
  colour toggle, a saved mask applied, and `rebuildSkyMasks` on rotate, flip
  and reopening a kept file all come through it. A second finder is a branch
  here, not a second function.
- **Its joins.** The mask's `op` in `src/pipeline.ts`, grouped by
  `maskGroups` and `groupWeight`: "Subtract from it" and "Only where both" in
  v2.62 on main, and "Add to it" in v2.63 on staging. They are the region
  control this record chooses: a learned Sky mask "Only where both" a Brush
  keeps it inside a painted area, and today's Sky mask "Add to it" a learned
  one picks up the strips the first missed.
- **A field on a mask travels by itself.** `cloneParams` copies each mask
  whole and `snapSig` serialises it, so a switch followed by one `flushRecord`
  is one undo step, as the colour toggle already is; saved masks
  (`src/maskstore.ts`) and kept files carry it. The five places rule for an
  `EditParams` field does not apply to a mask field.
- **The learned finder, on no published branch.** Commits a963548 (the build)
  and ed11d08 (an export waits for the sky), kept on the local branch
  held/learned-sky-rejected. In src/skysegrun.ts at those commits,
  `learnedSkySelection` returns a 384 px coarse map and a 1024 px refined map,
  the sizes of a Sky mask's `brush` and `fine`; src/skyseg.ts holds the pure
  half, `fuseSky`, `coarseFrom` and `segPicture`. The models load lazily in the
  one sky worker (`src/skyClient.ts`, `src/sky.worker.ts`). Two things there
  made the download eager and must not come back: the worker ran the models for
  every photograph opened, and `public/sw.js` fetched them at install. It also
  passed the file's own rotation where a mask needs the renderer's.
- **Its fusion constants were set on the six comparison frames.** At a963548,
  src/skyseg.ts says everything in it was first written and measured against
  six practice frames, and IR-SCIENCE.md 4b-xi there names them: NIR_3461,
  NIR_3466, NIR_1644, NIR_1827, NIR_1651 and NIR_0627. `SEG_AGREE` (0.9) is
  documented as 1.00 on five of them and 0.35 on the one where it failed; the
  floor that counts BiSeNetV2's towers, poles and streetlights as sky was set
  from NIR_3461's right pylon against NIR_3466's pale face; and the minimum of
  sure sky, `SEG_MIN_SEED`, was added because NIR_0627 found sky in a corner.
  A comparison on those six measures the learned finder on the frames it was
  fitted to.
- **Its cost, measured in the container only.** 23.5 MB to download
  (BiSeNetV2 7.0 MB, u2netp 2.3 MB, the WebAssembly runtime about 14 MB), run
  on one thread, with the selection ready 21 to 60 s after open. The total,
  the BiSeNetV2 size, the one thread and the timing are IR-SCIENCE.md 4b-xi as
  committed at a963548; u2netp's size is its model file there, and the
  runtime's is the sky worker's own note at ed11d08. Nothing was timed on the
  iPad, and that build's test page carries a button for it.
- **Instruments.** `tools/mask-truth-walk.mjs`, `tools/sky-probe.mjs` and
  `tools/sky-stage-walk.mjs`; and `tools/a11y-walk.mjs`, which must reach any
  new control on the Sky mask's panel.

## Weighed against

- **052, "The look's sky adjustments read a selection the reader cannot see"**:
  its Option 1, chosen and not built, is what gives a finder on a mask anything
  to reach. Once the look's sky stages read a reader-visible Sky mask, a reader
  who chooses the learned finder on that mask chooses it for the look's sky on
  that photograph, and that choice is what this record is for. 052's
  2026-09-26 paragraph records the learned selection that was built as the
  look's automatic selection and taken out. This record does not bring that
  back: the learned finder is never the default, it draws a mask only when the
  reader chooses it there, and a switch is built only if the comparison in
  Option 1 finds each finder losing somewhere the other does not. 052's
  Rejected 3, "Two skies in one app is the inconsistency 018 exists to remove",
  is why this needs 052.
- **029, "The Sky mask claims things that are not sky"**: open on NIR_0627.
  Its Rejected 4 turned segmentation down as "out of scope for an offline
  on-device app with no model". A model now exists at a963548 that runs in the
  app's own worker with no server and, once downloaded, offline. It has been
  timed only in the container, not on the iPad. So that reason no longer holds
  for a finder the reader chooses; the 2026-09-20 rule on what the Sky mask is
  for still answers a photograph with no sky by the reader not reaching for the
  Sky mask.
- **018, "One sky selection, built at open, for every sky-aware tool"**: "the
  sky is one thing in the app rather than three". After 052, a photograph
  still has one sky, the Sky mask the look reads, whichever finder the reader
  chose for it. Before 052 it would have two.
- **031, "A generated selection can be corrected by hand"**: hand strokes are
  stored and replayed over whatever the finder returns, so a switch keeps
  them. Its own Depends says "A correction stroke recorded against one
  generated selection and replayed onto a different one is a different
  correction", so the status line says which finder the strokes were drawn
  against.
- **032, "A mask keys the photograph, not the grade"**: its Rejected 3 is why
  the choice is stored on the mask, and why a mask without a stored choice is
  always drawn by today's finder. The default does not change, so nothing
  moves what a finished photograph selects.
- **042, "A mask is a place, and the ordinary controls act inside it"**: its
  stage 2 rule, that a control which cannot act shows disabled with its reason,
  applies to Reach and Feather on a learned mask, whose thresholds are fixed.
- **049, "Show the border and let it be moved"**: the border it moves is
  today's finder's horizon, one depth per column. A learned mask has no such
  border, so 049's control, once built, shows disabled there with the reason.
  Its Rejected section bounds options 2 and 3.
- **050, "The mask system is short of standard convention"**: its rejected "A
  control for 'constrain this mask to that region'" is why a region here is a
  composition and not a control.
- **065, "Sky inside a lattice cannot be filled into the Sky mask"**: its Rank
  sets it below this record, because this comparison says whether a Sky mask
  can be drawn by a second finder, and so whether a fill's strokes are
  replayed onto one finder or two. The learned selection did take the sky
  inside NIR_3461's near pylon, and the steel with it. A mask with no stored
  choice is drawn by today's finder, so on every Sky mask as it is added the
  fill keeps all of its work. 065's Rejected 3, a mask type of its own, is why
  the choice here is a switch on the Sky mask and not a second Sky mask type.

## Depends

- needs 052 — until the look's sky stages read a reader-visible Sky mask, a finder the reader chooses on a mask never reaches the look's sky, and the photograph has two skies.
- needs 069 — the comparison is judged through the look's sky stages, and until they have a guard against white, cloud in a Sky mask is turned blue-grey whichever finder drew it.
- needs 071 — the learned finder downloads 23.5 MB of models on demand, and until the update path keeps on-demand files across releases they would be deleted and downloaded again after every release.
- needs 070 — the Sky mask 052's Option 1 seeds would most naturally start from the look's own selection, which is built at rotation 0 on a turned photograph, and three of the six frames are turned; the Sky mask's own finder already reads the renderer's rotation, so the comparison waits until both paths agree which edge is up.
- touches 013 — Sky colour smoothing is 013's stage and the comparison is judged through it; a mask with no stored choice is drawn by today's finder, so nothing built here moves what 013 tunes against.
- touches 061 — NIR_3461's pylon steel arrives red on one face from the foliage band, so what the sky stages do to steel a Sky mask takes in is not the white guard's to fix.
- touches 029 — 029 is open on NIR_0627, the one frame where the learned finder did better, and it has no sky; an answer to either changes what the other has left.
- touches 031 — hand strokes are replayed over whichever finder draws the mask, and a stroke replayed onto a different selection is a different correction.
- touches 018 — a second finder is a second way to build the sky; per mask, with the look reading that mask, the photograph still has one.
- touches 032 — the choice is stored on the mask, a mask without one is always drawn by today's finder, and the default does not change, so nothing moves a finished photograph's selection.
- touches 042 — Reach and Feather cannot act on a learned mask and show disabled with the reason, by 042's stage 2 rule.
- touches 049 — 049's movable border belongs to today's finder's horizon, which a learned mask does not have.
- touches 050 — a finder kept to a region is the composition 050 already names, not a control of its own.
- touches 065 — a learned Sky mask may take a lattice's sky without a stroke, which changes what 065's fill has left to do on that mask; on a mask with no stored choice, drawn by today's finder, it changes nothing.

## Options

1. **By mask.** Chosen, as the shape a choice takes if a choice survives the
   comparison below.
   - A two-way choice on the Sky mask's panel: today's finder, first and the
     default, and the learned one. It is on every Sky mask, including, once
     052's Option 1 is built, the Sky mask the look reads. A mask with no
     choice stored is always drawn by today's finder, the default does not
     change, and every photograph already finished keeps its sky.
   - One choice is one undo step. The hand strokes are kept and replayed onto
     the new selection, and the status line says which finder drew the mask
     and which one the strokes were drawn against.
   - Region control is the joins that exist, not a new control: a learned Sky
     mask "Only where both" a Brush, or today's Sky mask "Add to it" a learned
     one.
   - The models download only when the reader chooses the learned finder on a
     mask. Before the first download the reader is told its size in words;
     offline before it, the mask stays with today's finder and says so. While
     the learned finder runs, a live region says it is finding the sky, its
     arrival adds no undo step, and an export waits for it. Its time is
     measured on the iPad before it is offered; the container's 21 to 60 s
     measures the container.
   - Reach and Feather show disabled with the reason on a learned mask.
   - **The first step is not the switch.** Once 052's Option 1, 069 and 070
     have landed, the two finders are compared again on a Sky mask, whole
     frame, through the look, on practice frames that neither finder was
     developed on: not the six of 2026-09-26, which the learned finder's fusion
     constants were set on (Built already), and not the frames today's finder
     is measured on in `tools/mask-truth-walk.mjs`. No constant in either
     finder is tuned against practice frames for it. If the learned finder
     still loses wherever there is sky, today's finder stays alone and no
     switch is built. The switch is built only if each finder loses somewhere
     the other does not. Either way the learned finder is never the default
     and never draws a mask the reader has not chosen it on.
2. **The whole photo.** One choice per photograph, or one for the whole app
   as darktable has it.
3. **By painted region.** The reader paints an area and picks the finder
   inside it.
4. **No switch.** Today's finder stays the only finder on a Sky mask.

## Rejected

- **2, the whole photo.** As one setting for the app it is darktable's shape: it draws every Sky mask on every photograph with the learned finder without the reader choosing it on any of them, and changing it moves what every finished photograph selects, which 032's Rejected 3 calls "the one thing a non-destructive editor may not do". Per photograph, the choice is made once for the photograph rather than on a mask, so it draws Sky masks the reader never chose it for, and it moves the sky in every mask at once, which is 049's objection to one control: it "moves every column including all the ones that are already right". It is also the cheapest to build, which is why it is written down.
- **3, by painted region.** No editor surveyed does it; every one composes masks instead. It costs the reader most (paint, pick, then judge a seam where the two finders meet) and costs most to build (a stored region, two runs, a blend, strokes replayed across both). It is the shape 050 already refused: "It is already Radial plus Only where both, and adding a second route to it would give the app two ways to do one thing that can disagree." It is 049's rejected shape too, where "a moved column would obey a different rule from the detected column beside it and a reader would have to know which". And a finder run inside a drawn area moves what the reader drew, which 018's Rejected 3 refuses for brush masks.
- **4, no switch.** Not the answer now, though it may be where this ends, and it is where this ends unless the comparison finds each finder losing somewhere the other does not. The verdict on the learned selection as the look's automatic selection stands (Context). What is not yet known is whether, as the finder a reader chooses for one Sky mask, it finds sky today's finder misses on practice frames neither was developed on, once 052's Option 1, 069 and 070 have landed. With one finder the reader has only hand strokes for whatever it misses.

**The case against option 1, recorded as the open risk and not as a
rejection.** A switch asks the reader to choose, photograph by photograph,
between two finders that fail in different ways. That is the work 052's
Rejected 2 says the reader wants to inherit rather than do; it rejected an
option because it "still makes them build the sky selection by hand on every
photograph". The learned finder's only win, NIR_0627, is a photograph on which,
by the 2026-09-20 rule on what the Sky mask is for, the reader does not reach
for the Sky mask, and 052's Option 1 leaves open whether a photograph may have
no seeded mask, which may answer it without a 23.5 MB download. So the order
this record carries is: the white guard, the rotation fix and 052's Option 1
first, then the comparison on a Sky mask, on frames neither finder was
developed on. If the learned finder still loses wherever there is sky, today's
finder stays alone and no switch is built. The switch is built only if each
finder loses somewhere the other does not. The learned finder is never the
default, and it draws a mask only when the reader chooses it there.

## Rank

**Sixth: below 069, 071, 070, 052 and 013, above 065.** 071 went in second on 2026-09-26, and this needs it.

**The three it needs are reasons, not a sequence.** This record says only that
all three come before it; the order they go in among themselves (069, then 070,
then 052) is argued in their own records, not here.

- **It needs 069**, because the comparison is judged through the look's sky
  stages, and until they have a guard against white, cloud in a Sky mask is
  turned blue-grey whichever finder drew it.
- **It needs 070**, because the Sky mask 052's Option 1 seeds would most
  naturally start from the look's own selection, which is built on the wrong
  edge of a turned photograph until 070 lands, and three of the six frames are
  turned.
- **It needs 052**, because until the look reads a reader-visible Sky mask, a
  finder the reader chooses on a mask never reaches the look's sky, and the
  photograph has two skies.

**Below 013, which it does not need.** Sky colour smoothing is 013's stage and
the comparison is judged through it, so comparing first would judge through a
stage 013 then changes. Nothing here moves what 013 tunes against, because a
mask with no stored choice is drawn by today's finder.

**Above 065, where 065's own Rank sets it.** 065 sits below this item because
this comparison says whether a Sky mask can be drawn by a second finder, and so
whether a fill's strokes are replayed onto one finder or two. The answer is
bounded before it arrives: a mask with no stored choice is drawn by today's
finder, so on every Sky mask as it is added the fill keeps all of its work, and
where the learned selection took NIR_3461's lattice sky it took the steel with
it.

## Looked at

- NIR_3461, 2026-09-26: the export through today's selection and through the learned one, whole frame side by side, opened again while writing this record. With the learned selection the halo beside the near pylon goes, the pylon's steel turns from pale to a dull red-brown, and the low hills on the horizon come out paler.
- NIR_3466, 2026-09-26: the same pair, whole frame, and the tall building and its roof enlarged. With the learned selection the halo beside the building and the pale spot on its face go, and a pale sliver of sky stands above the right of the roof where the selection missed it.
- NIR_1651, 2026-09-26: the same pair, whole frame. With the learned selection the white cloud deck turns blue-grey with a round glow near the tree's top right, and a lighter band stands beside the upper tree where sky was missed.
- NIR_1644, 2026-09-26: the same pair, whole frame. With the learned selection the white cloud band behind the treetops turns blue-grey with a faint green and pink tint.
- NIR_1827, 2026-09-26: the same pair, whole frame, a difference image of the two, and the treetops and the upper right enlarged, opened again for this revision. They nearly match. Along the treetops, where today's render has a thin pale rim against the sky, the learned one has a soft pink-red fringe; and parts of the broken cloud at the upper right come out bluer.
- NIR_0627, 2026-09-26: the same pair, whole frame. Today's selection takes the defocused garden behind the flower as sky, and it renders a bright red with dark-rimmed grey blotches; through the learned selection, which takes none of it, it stays a darker red with softer blotches.
