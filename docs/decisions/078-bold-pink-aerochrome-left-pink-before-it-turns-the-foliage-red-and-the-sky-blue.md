# 078 · Bold Pink, Aerochrome left pink before it turns the foliage red and the sky blue

## Context

Asked 2026-09-29, from the stage sheets of the trace of the owner's seven raws
(record **069**, "Traced on the owner's raws"): the picture at the tone-curve
step, kept as a look named Bold Pink. Those sheets show Aerochrome as it ships,
stage by stage, with nothing moved. At the tone-curve step the foliage is
magenta-pink and the sky teal.

Under Aerochrome, three stages after the tone curve move a pixel:

- the colour mixer (the look's `hsl`), whose band shifts turn the magenta
  red (+43° at 320°) and move green and aqua toward blue (+54° at 120°, +35°
  at 180°);
- Sky colour smoothing and Sky saturation, which smooth and deepen the sky's
  colour where the sky is.

Sky depth ships at 0 and moves nothing. So Bold Pink, as settings, is
Aerochrome with the colour mixer neutral and both sky stages at 0.

**Restore depth has three halves, and one of them would undo this.** Read
2026-09-29 in `solveLift` (src/main.ts): it lifts the tone when the frame's
median is bright, the foliage band from the measured warm saturation, and Sky
saturation when the sky it MEASURES on the rendered frame is below the
reference (`needsSky`). The sky half starts from the look's own value and
rises to the slider's ceiling of 2 (`solveSky`). Sky saturation deepens the
sky's own colour; it does not move its hue. Measured 2026-09-29 on a build
planted to skip Bold Pink's opt-out, its Sky saturation of 0 was topped up to
0.33 on NIR_1661.NEF and 1.87 on NIR_3466.NEF, where the real build holds it at
0 on both: a deeper green-teal than the picture that was asked for. The tone
and foliage halves run before the sky stages and are in that picture.
The batch builds its own base and carries the flag the same way. A batch
planted to ignore it moved its output's mean colour on NIR_1661.NEF by about
two levels, which the agreement walk cannot tell from the real build; so the
batch half is shown by the batch agreeing with the screen under Bold Pink, not
by a plant that failed.

**Help describes Aerochrome as Bold Pink.** Its paragraph on the looks calls
Aerochrome "deep magenta foliage over a teal sky". The trace shows that is the
look before its mixer and its sky stages; as it ships, the foliage is red and
the sky blue.

**Rendered before any code, on NIR_1651, NIR_1661, NIR_1703, NIR_1827,
NIR_3461, NIR_3466 and NIR_3698** (2026-09-29, each opened; Looked at below),
beside Aerochrome and Pink IR. Bold Pink is its own look on every frame, and
not Pink IR under another name: its pink is deeper and bluer, magenta where Pink
IR's is salmon or rose, and its sky is a quiet grey-green where Pink IR's is a
saturated teal, jade or turquoise. Its sky is never blue, as the published route
says it will not be before its sky step. Where a cloud arrives neutral, on
NIR_1703 and NIR_1827, it stays grey-white under Bold Pink, and Pink IR tints it
throughout. Its foliage figures sit within 0.02 of Aerochrome's on every frame,
so resetting the mixer moves the foliage's hue and not how much colour it has.

**The built button, rendered on the same seven after the build** (2026-09-29,
each opened beside the picture above): the same picture on six, byte for byte
on NIR_1661.NEF. On NIR_3461.NEF the grass is a little more vivid, foliage
0.42 against 0.38, because the built look solves Restore depth's foliage lift
with the mixer already neutral, where the hand-set arm solved it under
Aerochrome's mixer and then reset the mixer.

## Looked up

- **Kolari Vision, "How to Emulate Kodak Aerochrome with the 550nm IR
  Filter"** (kolarivision.com, read 2026-09-29). The published route is two
  swaps. After the first, red with blue, the picture has "red foliage and green
  sky"; a second swap, blue with green, turns the sky blue. The app's route is
  different in its parts (one swap, a nine-number mixer, a colour mix, then
  the sky stages), and the same in its order: the sky goes blue last, after
  the foliage's colour is set. Bold Pink stops before
  that step, so its green-teal sky is what the route looks like at that point,
  not a defect of the look.
- Nothing outside the repo decides whether the app should carry it. It is the
  app's own Aerochrome with two of its stages left out, it claims no film, and
  the film's physics (IR-SCIENCE.md 4b) is unchanged by leaving stages out. The
  choice is made from pictures (CLAUDE.md, "a look choice is shown, never
  described").

## Weighed against

- **Aerochrome rendered from a model of the film** (record **066**, open, a
  film model chosen). It replaces how Aerochrome renders. A Bold Pink derived
  from Aerochrome's entry would change when that lands, under readers who chose
  it for how it looks today; it carries today's numbers as its own.
- **The look's sky adjustments tint and darken what has no colour** (record
  **069**, open). Bold Pink turns both sky adjustments off, so 069's work on
  them does not reach it. A change 069 makes upstream, at the white point,
  moves Bold Pink's colours with every other look's.
- **A look opens its own finishing panel** (record **022**, shipped). The
  panel opens only for a look that declares steps.
- **Pink IR**, the app's existing pink-and-teal look: on a raw, the red-blue
  swap with saturation 3.0, and neither a channel mix nor a colour mix. Whether Bold Pink reads as its own look beside
  it is what the three-panel renders below are for.
- NOTES.md, "Both amounts shipped: foliage 1.6, sky 1.8": the foliage amount
  Bold Pink copies, and the sky amount it leaves off.

## Depends

- touches 066 — 066 replaces how Aerochrome renders; Bold Pink keeps today's
  numbers as its own entry, so it stands when 066 lands, and whether it follows
  the film model is 066's to say.
- touches 069 — Bold Pink leaves off the sky stages 069 corrects; a change 069
  makes at the white point moves Bold Pink too, and its renders are redone then.
- touches 022 — the finishing panel opens only for a look that declares steps;
  Bold Pink declares none.

## Built already

What exists that building this will use, so a second one does not get written
(LESSONS 330):

- **The looks.** `LOOKS`, `applyLook`, `pressLook`, `lookButtons`, the `ui` map
  and `BUILTIN_NAMES` in src/main.ts; the look grid and its note in ir.html.
  Declaration order in `LOOKS` is the Default-look picker's and the batch
  chooser's order.
- **Restore depth.** `LiftBase`, `liftBaseFor`, `solveLift`, `scaleLift` and
  `applyLift` in src/main.ts. The screen and the tiles build the base through
  `liftBaseFor`; `batchParamsFor` builds its own inline.
- **The sky stages at 0.** `syncSkyMap` builds no sky map and no fine selection
  when Sky colour smoothing and Sky saturation are both 0, which is the state
  the tone-curve picture was in.
- **The walks.** `tools/look-roundtrip-walk.mjs` (its list of look buttons),
  `tools/aerochrome-walk.mjs` (Aerochrome and Pink IR as they ship),
  `tools/agreement-walk.mjs` (the screen and the saved file agree under
  Aerochrome), `tools/a11y-walk.mjs` and `tools/control-walk.mjs`.
- **The checks.** `tools/scope-check.mjs` enumerates the `Look` type's fields
  against `.scope-allow`; `tools/stamp-check.mjs` and
  `tools/preview-version-check.mjs` hold the stamp and the preview version.
- **The instrument.** `tools/look-sheet.mjs`, whose scratch copy made the
  renders below.

## Options

1. **A built-in look, Bold Pink, beside Aerochrome in the IR tab.** Chosen.
   - Its own entry in `LOOKS`, carrying Aerochrome's numbers of 2026-09-29 by
     value: the swap, the nine-number mixer, the denoise floor and texture, and
     per kind the same saturation, contrast and foliage band.
   - The colour mixer neutral, Sky colour smoothing 0, Sky saturation 0, Sky
     depth 0.
   - Restore depth keeps its tone and foliage halves and skips its sky half for
     this look. The look carries a flag; the lift's base carries it, and the
     screen, the tiles and the batch all build the lift from that base.
   - No finishing panel, and nothing under its name on the button, like B&W IR
     and Sepia IR. The note under the looks says what it is.
2. A saved look in My looks, holding those settings.
3. Bold Pink derived from Aerochrome's entry by reference.
4. Restore depth left to top up the sky, as it does for every other look.
5. Aerochrome's finishing panel carried over.
6. A second state on the Aerochrome button.

## Rejected

- **2, a saved look.** It lives on the device that saved it. What was asked
  for is a named look in the app.
- **3, by reference.** Record 066 replaces Aerochrome's rendering, and Bold
  Pink would change with it, silently.
- **4, the sky top-up left on.** It raises Sky saturation from 0 toward 2
  wherever the measured sky is under the reference: to 0.33 on NIR_1661 and
  1.87 on NIR_3466, measured. The sky comes out a deeper green-teal than the
  picture that was asked for.
- **5, Aerochrome's finishing panel.** Its steps give the film's references
  (a sky of 0.66 to 0.92, foliage scarlet) and a Sky saturation step for a look
  whose sky stage is off. Every reason on it would be false here.
- **6, a second state on Aerochrome's button.** That button says there is
  nothing to flip because its swap is part of the recipe. A second state hides
  a look behind a press, and 066 will replace the state it would sit beside.

## Rank

First. It is built in the plan that records it, asked for on 2026-09-29.
Going first redoes nothing on the list: it adds a look and changes none. And
nothing on the list has to come first for it to be right: 066 and 069 touch it
and neither is a `needs`. Bold Pink keeps its own numbers when 066 lands, and a
change 069 makes at the white point moves it with every other look, when its
renders are redone.

## Looked at

Every frame below was opened in the app with its EXIF and lens fix, rendered
three ways through the app's own pipeline and shown whole, side by side:
Aerochrome as it ships, Bold Pink set the way a reader would (the Aerochrome
button, then the colour mixer reset and Sky colour smoothing and Sky saturation
at 0), and Pink IR as it ships.

- NIR_1651.NEF, 2026-09-29: Aerochrome's tree red over a deep blue sky, the
  cloud band white edged cyan. Bold Pink's tree deep magenta over a grey-green
  sky, the cloud grey-white edged mint. Pink IR's tree pale salmon-pink over a
  near-black teal sky, the cloud cyan. Two different pinks: Bold Pink's deeper
  and bluer, its sky lighter.
- NIR_1661.NEF, 2026-09-29: Aerochrome's sunlit pines white-pink and its shaded
  pines red under a clear blue sky, one branch at the top right scarlet. Bold
  Pink's pines white-pink and deep magenta in shade under a muted grey-green
  sky with pale green wisps. Pink IR's pines pale pink-white, dusty pink in
  shade, under a saturated turquoise sky. Bold Pink's sky is the quieter of the
  two pinks'.
- NIR_1703.NEF, 2026-09-29: under dense cloud. Aerochrome's spruce orange-red,
  the cloud grey-white and blue only in the upper corners. Bold Pink's spruce
  magenta, the cloud still grey-white with dark grey-green corners: with no sky
  stage, a cloud that arrives neutral stays neutral. Pink IR's spruce rose-pink
  and the whole cloud tinted turquoise.
- NIR_1827.NEF, 2026-09-29: cirrus over a line of conifers. Aerochrome's
  conifers orange-red, the cirrus grey-white, deep blue in the upper right.
  Bold Pink's conifers hot magenta, the cirrus grey-white, the gaps between it
  dark grey-green. Pink IR's conifers rose-pink and the cirrus tinted teal
  throughout.
- NIR_3461.NEF, 2026-09-29: pylons over dry grass. Aerochrome's grass
  salmon-red under a clear blue sky, the cloud white. Bold Pink's grass
  magenta-pink under a grey-green sky, the cloud grey-white. Pink IR's grass
  pale pink-white under a saturated jade sky, the cloud mint.
- NIR_3466.NEF, 2026-09-29: a hangar over dry grass, a road in front.
  Aerochrome's grass salmon-red under a blue sky, the cirrus white. Bold Pink's
  grass magenta under a grey-green sky, the cirrus grey-white. Pink IR's grass
  pale pink under a darker jade sky.
- NIR_3698.NEF, 2026-09-29: oaks, a dead tree and a mast over pale grass.
  Aerochrome's foliage terracotta-red under a pale blue sky. Bold Pink's
  foliage vivid magenta under a pale grey-green sky. Pink IR's foliage light
  pink under a mint-turquoise sky.
