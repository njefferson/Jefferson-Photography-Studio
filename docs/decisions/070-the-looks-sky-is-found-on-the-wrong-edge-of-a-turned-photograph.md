# 070 · The look's sky is found on the wrong edge of a turned photograph

## Context

Found 2026-09-26, while a learned sky selection was built, and recorded in 052
as one of three facts not fixed. Measured again for this record the same day.

**`buildSkySelectionFrom` in `src/skyfine.ts` passes rotation 0 to
`buildSkyMask`.** Rotation is the one input that tells the detector which edge
of the picture is up: the border it finds runs down each column from the top of
the picture as shown, and sky is everything above it. `SkySource` carries no
rotation, so on a photograph turned on its side the look's own sky is seeded
from the edge that is up in the file, which is a side of the picture as it is
shown.

**Measured on three practice frames the file stores turned** (each carries
rotation 3), with the look's selection built as the app builds it and then at
the frame's own rotation, both drawn over the frame and opened:

- **NIR_1651**: 18.2% of the frame at rotation 0, against 52.2%. At rotation 0
  the selection is the sky down the left side; it never reaches the cloud or
  the clear sky right of the tree. At its rotation it is all of the sky down to
  the crown, cloud included.
- **NIR_1644**: 32.6% against 37.2%. At rotation 0 the selection stops along a
  level line and leaves out most of the band of white cloud behind the crowns;
  at its rotation it runs down to them.
- **NIR_0627**, which has no sky: 59.0% against 57.7%. The rotation does not
  touch what 029 is about.

All three are among the seven frames the look's sky depth was solved on
(IR-SCIENCE 4b-iv).

**The reader's Sky mask does not have this.** `regenerateSkyMask` in
`src/main.ts` passes `renderer.rotation`, `skyPrepFor` keys its cache on the
image and the rotation, and a quarter-turn rebuilds the mask
(`rebuildSkyMasks`). `renderer.rotation` is the turn the reader sees: set from
the file's own turn when a photograph is shown (`img.rotate`, in
`showDecoded`), replaced by a stored edit's turn when one is restored
(`applyView`) and by a gallery example's fixed turn (`openGalleryPhoto`), and
moved a quarter by the Rotate button. The look's pair reads none of these, and
is not rebuilt on a turn either.

**Everything that reads the look's selection inherits it.** On a turned
photograph:

- Sky colour smoothing, Sky saturation and Sky depth act on the wrong region,
  on screen and in the export, so NIR_1651's clear sky right of the tree is not
  deepened at all.
- Restore depth's lift (`solveLift`) measures the sky's saturation through
  `skyMaskFor`: on the open photograph (`applyLift`), on tiles (`makeThumb`)
  and in a batch (`batchParamsFor`).
- The shadow cast (`shadowCastFor`) takes the sky out of its measurement
  through `skyMaskFor`, so the report's Shadow light line takes out the wrong
  part.
- Tiles build their sky from `skyMaskFor`. A batch's sky stages take the pair
  the sky worker built at decode, or build it with `buildSkySelectionFrom`,
  without going through `skyMaskFor`.
- At open, the sky worker builds the pair a photograph starts from when its
  decode is given `sky: true`: a set, the strip, a resumed session, a keep file
  and a batch. A photograph picked on its own or opened from the gallery is
  not (052's third fact): its coarse half comes from `skyMaskFor` at open and
  the refined pair from `syncSkyMap` on the first edit with Sky depth or Sky
  saturation, both on the main thread. The fix has to reach both.

**And it has already cost measurements.** 023 found the same hard-coded 0 in
`tools/sky-probe.mjs` and fixed the instrument, noting that NIR_1651's seed had
read 9.7% of the frame against the app's own 30%; the app's own path kept the
0. IR-SCIENCE 4b-v, measured through the app, records Sky depth barely moving
NIR_1651 because the bitmap finds 9.7% of the frame, "the cloud-topped strip at
the top edge", and gives the frame's cloud as the reason. 9.7% is the figure
023 got at rotation 0, so that reading was very probably this defect.

**What the fix does to NIR_1651's and NIR_1644's clouds is a prediction, not a
render.** Built at
their rotation, the selection maps take NIR_1651's cloud and most of NIR_1644's
band in. Under the learned selection the same stages turned such cloud
blue-grey, so this is expected to put blue-grey cloud on turned photographs
with cloud in the sky unless 069 is in. No export with the selection built at
their rotation has been made; the renders are this item's acceptance.

## Looked up

- **Adobe, *Masking* in Lightroom Classic**
  (helpx.adobe.com/lightroom-classic/desktop/process-and-develop-photos/masking.html),
  read 2026-09-26: "Update AI Masks" is offered for when an AI mask needs
  updating, including when the image "has been rotated". A detected selection
  is treated as a function of which way the picture is turned, and redone when
  that changes.
- **Shen and Wang, "Sky Region Detection in a Single Image for Autonomous
  Ground Robot Navigation"**, International Journal of Advanced Robotic Systems
  10(10), 2013 (doi 10.5772/56884), read 2026-09-20 for IR-SCIENCE 9o and the
  method this app's border follows: one border row per column, the first row
  from the top whose gradient passes a threshold, and sky is everything above
  it. The method is only defined once "up" is known.

So the field tells its sky detectors which way is up, and redoes the detection
when that changes. This app already does both, for the reader's Sky mask only.

## Built already

What exists that this item will use, so a second one does not get written
(LESSONS 330):

- **The builder**: `prepareSkySource`, `SkySource` and `buildSkySelectionFrom`
  in `src/skyfine.ts`, the last with the 0 in its call to `buildSkyMask`.
- **The detector**: `buildSkyMask` in `src/sky.ts` already takes `rotate` and
  hands it to `skyPrepare`'s horizon search, its seed band and `depthOf`, so
  passing the reader's rotation is enough. The comment in `buildSkyMask` saying
  only `depthOf` depends on the rotation is stale.
- **The pattern to copy**: `regenerateSkyMask` and `skyPrepFor` in
  `src/main.ts`, which build at `renderer.rotation` and cache per image and
  rotation; and `rebuildSkyMasks`, which runs on a turn and on reopening a kept
  photograph. Beside them, `syncSkyMap` and the open path in `showDecoded`
  assign the look's pair, `skyMaskFor` builds and holds its coarse half, and
  `img.skySel` carries the pair on the photograph.
- **The worker path**: given `sky: true`, the decode worker
  (`src/decode.worker.ts`) prepares the `SkySource` beside the picture, and
  `src/decodeClient.ts` hands it to `requestSkySelection` in `src/skyClient.ts`,
  where the sky worker (`src/sky.worker.ts`) builds the pair, or the main
  thread does when there is no worker.
- **Instruments**: `tools/sky-probe.mjs` already passes each frame's own
  rotation; `tools/look-sheet.mjs` renders a frame through the build in `dist`,
  so once this lands it renders the look's sky at the frame's rotation;
  `tools/rotation-walk.mjs` asserts that a turn survives leaving the
  photograph, and is where a check that the look's sky follows the turn
  belongs.

## Weighed against

- **052, "The look's sky adjustments read a selection the reader cannot
  see"**: recorded this defect and is the item it bears on most. **The relation
  is touches, not superseded-by and not needs.** Its Option 1 makes the three
  sky stages read the reader's Sky mask, which is built at `renderer.rotation`,
  so on the open photograph it would retire this path for those three stages.
  It would not retire it for tiles, a batch, Restore depth's lift or the shadow
  cast, which read the look's selection through `skyMaskFor` or, for a batch's
  sky stages, straight from the pair the sky worker built at decode, and have
  no reader's mask to read; and the mask Option 1 seeds at open would most
  naturally be seeded from the pair the sky worker already builds at decode,
  which is this one. It is not needs either: this fix is a parameter, a
  rotation on `skyMaskFor`'s cache and `shadowCastFor`'s, and a rebuild, and
  waits on nothing in 052.
- **029, "The Sky mask claims things that are not sky"**: its Built already
  names the hard-coded zero as having cost one measurement. This is the same
  zero in the app rather than the instrument. NIR_0627 is 029's frame, and the
  rotation leaves it as it is.
- **023, "The Sky mask reads the sky's colour as well as its place"**: it fixed
  this zero in its probe and left the app's.
- **034, "The red cast in the shadows comes off by hand, and should not have
  to"**: its measurement of the shadow cast takes the sky out through this
  selection.
- **013, "Aerochrome is the right colour and comes out splotchy"**: it tunes the
  sky the look renders, and NIR_1651 and NIR_1644, both turned, are among the
  frames the sky's chroma has been measured on.
- The white guard (069) is declared below: this cannot ship before it.

## Depends

- needs 069 — built at its rotation, the look's selection map takes NIR_1651's cloud and most of NIR_1644's band in; under the learned selection the same stages turned such cloud blue-grey, so fixed alone this is expected to ship blue-grey cloud on turned photographs with cloud in the sky. A prediction from the selection maps, not a render; the renders are this item's acceptance.
- touches 052 — its Option 1 retires this path for the three sky stages on the open photograph but not for tiles, a batch, the lift or the shadow cast, and its seeded mask would start from this pair; whichever lands first, the other is measured on what it leaves.
- touches 029 — the seed is 029's subject, and this decides which edge it is seeded from on a turned photograph.
- touches 023 — 023 fixed the same zero in its probe; the app's own path kept it.
- touches 034 — the shadow cast takes the sky out of its measurement through this selection.
- touches 013 — 013 tunes the look's sky on frames that include turned ones, whose sky this moves.

## Options

1. **Build the look's selection at the rotation the reader sees, on every path,
   and again when it turns.** Chosen.
   - `SkySource` carries the rotation and `buildSkySelectionFrom` passes it to
     `buildSkyMask`. The decode worker's `SkySource` carries the file's own
     turn (`img.rotate`), so the pair the sky worker builds at decode is built
     at it. The pair records the rotation it was built at, and is
     rebuilt when the rotation shown differs from it: after `applyView`
     restores a stored edit's turn, after a gallery example's fixed turn, and
     on the Rotate button, beside `rebuildSkyMasks`.
   - `skyMaskFor` takes the rotation. It returns `img.skySel`'s coarse half
     only when that was built at the same rotation, and keys its cache,
     `skyMaskOf`, on the image and the rotation, as `skyPrepFor` keys its
     cache; `shadowCastFor` keys its own, `shadowCastOf`, the same way. Each
     caller passes the rotation its picture is shown at: the open
     photograph `renderer.rotation` (the open path, `applyLift`, the shadow
     cast); a tile and a batch `img.rotate`, which is the turn `makeThumb` lays
     a tile out at and `runBatch` exports at. A batch's sky stages, which take
     the sky worker's pair or build their own rather than calling `skyMaskFor`,
     build at that same turn. With that, the lift and the shadow cast follow.
   - `syncSkyMap`, which builds the refined pair on the main thread when the
     decode built none (a photograph picked on its own or opened from the
     gallery), builds at `renderer.rotation`.
   - One rule: every path that means the sky builds it from the same inputs as
     the reader's Sky mask, so the two never disagree about which edge is up.
   - **Before it ships**, NIR_1651 and NIR_1644 are rendered through
     `tools/look-sheet.mjs` with 069 in, and opened whole frame and at 1:1: the
     look's sky reaches the clear sky right of NIR_1651's tree and down to
     NIR_1644's crowns, and the cloud stays white, with no seam where it meets
     clear sky. These are 069's cloud checks, which cannot run before this.
     `tools/rotation-walk.mjs` gains the check that the look's sky follows a
     quarter-turn.
2. The file's own rotation only, taken at decode.
3. Wait for 052's Option 1 to retire the path.
4. Find the up edge from the picture: run the detector from all four edges and
   keep the best.

## Rejected

- **2, the file's rotation only.** A quarter-turn by hand, and a turn restored with a stored edit (`NOTES.md` "## A quarter-turn that stays turned, 2026-09-14"), would leave the look's sky on the old edge while the reader's Sky mask moves to the new one. The learned build made exactly this choice, reading the file's own turn rather than the renderer's.
- **3, wait for 052.** Option 1 retires this path for the three stages on the open photograph only; tiles, a batch, the lift and the shadow cast keep it, and the mask Option 1 seeds would start from it.
- **4, guess the up edge from the picture.** The reader has already said which way is up by turning the photograph, and the camera by its orientation tag. Guessing it from content is a confidence question of the kind 029 raised for whether there is a sky at all and left unanswered on NIR_0627, and where the guess differed from the turn the look's sky and the reader's Sky mask would disagree on the same photograph: two skies again.

## Rank

**Second, directly below the white guard (069) and above 052.** Argued by what
would be redone.

- **It needs the guard.** Fixed alone, the selection maps show it bringing
  NIR_1651's cloud and most of NIR_1644's band into the look's own selection,
  under stages that turned such cloud blue-grey under the learned selection.
  That is a prediction, and the render is this item's acceptance.
- **Above 052**, because 052's Option 1 is built and measured over this
  selection on turned photographs; the mask its Option 1 seeds would start from
  this pair; and this path survives 052 for tiles, a batch, the lift and the
  shadow cast. Fixed after 052, 052's acceptance on every turned frame would be
  measured again.
- **Above 013 and 066**, which tune the look's sky over frames that include
  turned ones.
- **Above the finder choice (068)**, which compares the two finders on Sky
  masks after 052's Option 1, on practice frames neither finder was developed
  on. The mask Option 1 seeds would start from this pair, so any of those
  frames that is turned would be seeded on the wrong edge until this lands.

It costs a parameter, a rotation on `skyMaskFor`'s cache and `shadowCastFor`'s,
and a rebuild when the rotation changes; nothing ranked above it changes shape
because of it.

## Looked at

- NIR_1651, 2026-09-26: the look's selection built at rotation 0 and at the frame's own rotation, each drawn in yellow over the frame as displayed, full frame side by side; and the whole-frame exports through today's selection and the learned one, side by side.
- NIR_1644, 2026-09-26: the same two sheets; where each selection stops above the crowns, against the band of white cloud in the exports.
- NIR_0627, 2026-09-26: the two selections, full frame side by side.
