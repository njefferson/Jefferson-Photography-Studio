# 084 · HSL adjustments and channel swaps, for making infrared looks

## Context

Asked on 2026-09-29: a simple tool for hue, saturation and lightness
adjustments on infrared photographs, with channel swaps, for making different
looks. The first version of this record, written the same day, chose named
colour swatches instead. That answered a different question and is Rejected, 1
below: the tool is the one asked for, and this record decides only how it is
built.

**What making a look is, in the field.** Two stages, in most recipes read
(IR-SCIENCE.md 4b-xi): a remap first (a channel swap, a hue rotation, an Invert
in Color mode, or a swap profile or LUT), then hue, saturation and lightness
moves by colour band. The remaps have names and stated results: Rob Shea's
green-to-red swap gives red and green, the green-to-blue swap yellow and purple,
the plain swap orange foliage under a teal sky (4b-xi). A look is the pair: a
remap and the band moves on top of it.

**What the app has, and where.** Every piece is already here, spread over three
tabs:
- the R⇄B swap button on the IR tab;
- the 3x3 channel mixer on the Grade tab, with five presets (Identity, R⇄B swap,
  Channel cycle, Copper, Film rotation) and nine sliders from −2 to 2;
- the eight-band colour mixer on the Colour tab, with Pick color from photo and
  Drag on photo to adjust, beside global Hue shift and the Sky and Foliage
  boxes;
- the looks on the IR tab, and My looks for saving.

A reader making a look today goes to the IR tab for the swap, to the Grade tab
for any other remap, typed as nine numbers, and to the Colour tab for the bands.

**What the renders found (Looked at).** Eight remaps and three band moves were
rendered on two of the owner's raws, the oak (NIR_1376.NEF) and towers over dry
grassland (NIR_3716.NEF), each made only with controls a reader has. And, as a
photograph opens with the swap on and no look, the box named Sky acts on the
foliage and the box named Foliage on the sky (NOTES.md, "The per-colour boxes
are named for subjects and keyed on hue, 2026-09-16"; renders below).

## Looked up

The first version's research stands where it bears on this question, and a
second round on 2026-09-29, web only, added the remaps' own results, the
strength control and the tablet. The infrared practice from both rounds is in
IR-SCIENCE.md 4b-xi with sources and read status. The points on editors, touch
and accessibility below were read in the first round and are stated here with
their sources; they are not infrared science, so they are not in IR-SCIENCE.

- **The remaps and what they give.** Rob Shea's Photoshop actions state their
  mixer settings, and the Lightroom profiles state their results: RB, orange
  foliage and a teal sky; RB with green to red, red and green; RB with green to
  blue, yellow and purple (the actions and the profiles are matched by name
  only); RB with green split, orange foliage and a natural
  blue sky; Hue 180, orange and blue; Invert, complementary colours with
  brightness untouched (read). irlab.uk offers R and B, G and B, R and G, and a
  rotation each way (read). Kennard's three-way rotation gives candy-pink
  foliage and a greenish sky (read). ON1 presets name ten or more swap methods,
  each giving different sky and foliage colours (read).
- **The band moves practitioners make after the swap.** Kolari desaturates the
  reds, greens and yellows and raises their lightness, turns yellow's hue for
  white or yellow foliage, and takes yellow's saturation to 0 for white leaves.
  LifePixel takes cyan's saturation down and its lightness up for cyan
  highlights. An Affinity tutorial raises cyan's saturation and lowers its
  luminosity for a deeper sky (all read).
- **A strength control on a look is common.** Luminar's Mood slider, ON1's
  effect opacity, Kolari's Soft and Deep pairs, Photomator's LUT intensity
  (read).
- **Colour controls are shifts, and they are keyed on colour.** Lightroom's
  Color Mixer, Capture One's Color Editor and darktable's color zones move a
  band relative to where it is (first round, read). After a swap profile,
  Lightroom's HSL and Temp act reversed (Rob Shea, read). The swapped sky will
  most likely be darkened with the Red, Orange and Yellow sliders, and the
  foliage may be under Blue, Purple or Magenta (Kept Light, read 2026-10-01);
  the tip to reach it with the targeted picker rests on a snippet.
  Per-band hue reaches only neighbouring hues in Lightroom mobile (forum, read);
  this record reads that as the big changes coming from the remap.
- **On a tablet.** Lightroom on the iPad swaps only through a profile installed
  from a desktop; Darkroom has eight bands with a picker and no mixer; Affinity
  Photo 2 and Pixelmator Pro have a mixer; Swap RGB offers three swaps with an
  amount slider (read). Photoshop on the iPad appears to have no mixer (snippet).
- **By touch and for colour-vision deficiency** (first round, read). WCAG 2.5.7:
  a drag needs a tap alternative. WCAG 1.4.1: colour must not be the only way a
  thing is shown. Apple asks for 44 points.
- **Not researched.** How the system colour picker behaves in Safari on the
  iPad; which swap names suit a colour-blind reader; whether the remaps stay
  distinguishable under deuteranopia and protanopia. The build's plan takes up
  the ones its design depends on.

## Weighed against

- **NOTES.md, "The per-colour boxes are named for subjects and keyed on hue,
  2026-09-16"**: the open naming question. With the swap on, the box named Sky
  takes the foliage. This record's panel settles it by keying the band a subject
  takes from the photograph, not from the boxes' names.
- **A mask is a place, and the ordinary controls act inside it** (**042**,
  open). A band is not a place: a pale-blue field or a building's cladding takes
  the sky's band. A mask is the reader's way to keep a colour where it belongs,
  and the panel has to work inside one.
- **The sky selection's open defects** (**052**, **069**, **073**, open).
- **Bold Pink** (**078**), the looks and the mixer's presets: ready-made looks
  today. A look sets many things at once; this is a way to make one.
- **The screens assessed as a whole** (**079**) and what follows it: they read
  the screens as they stand, and this changes the IR, Grade and Colour tabs.
- **Big image** (**003**): moves where the drawer's controls live.

## Depends

- touches 042 — the panel acts inside a mask, which is how a reader keeps a
  colour off a pale-blue field or cladding that a band cannot tell apart.
- touches 017 — 017 found a band cannot tell a pale-blue field from a pale-blue
  sky; the band moves inherit exactly that limit.
- touches 019 — its Rejected section says a hue band is not a place. This record
  uses bands to recolour, and names masks as the place.
- touches 052 — the look's sky selection is the other way to find the sky; if it
  lands, keying on places can be weighed again.
- touches 069 — a remap multiplies a cast the white point leaves on a neutral,
  as 069 traced on asphalt under the look's mixer; the panel adds no tint of its
  own, and does not fix that cast.
- touches 073 — the sky selection takes in a tree on darker frames, one reason
  keying on places is not chosen now.
- distinct-from 078 — Bold Pink is a look with its own numbers, not a way to make
  a look.
- touches 079 — 079 assesses the screens as they stand; this changes three tabs,
  so it comes first.
- touches 003 — 003 moves where the drawer's controls live; this adds to them,
  so it comes after.

## Built already

What building this will use, so a second one does not get written
(LESSONS 330):

- **The swap and the mixer.** `swapRB` and the swap button; `MIX3_PRESETS`,
  `mix3Sliders` and the Grade tab's grid in `src/main.ts`; `EditParams.mix3` in
  `src/pipeline.ts`. A swap chip is a preset that writes these, visible on the
  Grade tab and undoable.
- **The bands.** The eight-chip colour mixer (`HSL_CENTERS` in
  `src/pipeline.ts`), Pick color from photo, which reads the pixel as displayed,
  after the mixer, and Drag on photo to adjust, which reads the colour with the
  mixer neutralised, before it.
- **The two boxes.** Sky and Foliage in `ir.html`; `bandWeight` and
  `skyBandCentre` in `src/pipeline.ts`, which decide which pixels each takes;
  `updateBandLabels` in `src/main.ts`; the matching shader in `src/gl.ts`.
- **The band stage's guard.** A boost is gated on the pixel's own saturation
  (`bandGain`), so a pixel that arrives with no colour gets none.
- **A strength.** `#lutStrength` scales a LUT today; a look has none.
- **Saving.** My looks and look links (`src/look.ts`).
- **Masks.** A mask carries its own Sky and Foliage values (042), held to the
  same plus or minus 60 degrees as the tab's boxes.
- **The instrument.** A scratch copy of `tools/look-sheet.mjs` that renders
  candidates made only of controls a reader has, and refuses two different
  recipes that render the same picture.

## Options

1. **One infrared colour panel: a row of swap chips, the colour bands under it,
   one Strength, and Save as a look.** Chosen.
   - **The swap row.** One press per remap, each written onto the existing swap
     button and mixer, where it stays visible and undoable. The set is the
     remaps that gave a distinct two-colour picture on both of the owner's raws
     rendered (Looked at): R and B swapped, G and B swapped, and R and G swapped
     (fainter on the towers),
     each named for what it does, with its result beside the name. The
     three-way rotation gave nearly the plain swap on both, so it stays the
     Grade tab's Film rotation chip and is not a separate swap here. This app's
     readings of the three green-reassigned swaps, and Hue 180 without the swap,
     put one cast over the whole frame; they join the row only if the sources'
     full mappings are found and give the stated results on this camera.
   - **The bands under it.** The existing eight-band mixer, entered by Pick
     color from photo or Drag on photo, so a reader starts from what the
     photograph holds rather than a band's name; that is the intent, and it
     was not rendered here. Rendered, a fixed band was a weak lever: on the oak
     the orange band only eased the pink, on the towers it barely moved, and
     the cyan band's deeper sky also tinted pale grass and rocks on the oak and
     banded the towers' pale sky (Looked at).
   - **The Sky and Foliage boxes key on the photograph.** Their band is taken
     from where the sky and the foliage sit after the chosen remap, not from an
     angle that assumes the sky is blue before the swap. That is meant to
     settle the 2026-09-16 naming question.
   - **One Strength** for the panel's result, as the field's looks carry.
   - **Save as a look**, through My looks.
   - Every control is a button or a slider with a tap alternative, 44 points,
     and each swap chip shows its name in words (WCAG 1.4.1 and 2.5.7).
   - **Known limits.** It keys on hue, so a pale-blue field or cladding follows
     the sky; the remedy is a mask. This camera records essentially one colour
     axis (4b-ix), so some remaps give near-identical pictures on some frames;
     the chips offered are the ones that differ (Looked at).
2. Named swatches: a foliage colour and a sky colour, chosen by name.
3. The mixer's nine sliders as the swap tool.
4. The colours keyed on places, the look's sky selection and the rest.

## Rejected

- **2, named swatches.** The first version of this record, chosen on
  2026-09-29 and rejected the same day: it replaced hue, saturation and lightness
  adjustments with destinations, which is not the tool asked for, and it offered
  no swap. What it found stays true and is kept here: the Sky and Foliage boxes
  act on each other's subject on a frame as it opens.
- **3, the nine sliders.** Nine numbers from −2 to 2 is not a simple swap. The
  sliders stay on the Grade tab for anyone who wants them; the chips write them.
- **4, keyed on places.** The look's sky selection is where the hardest open
  defects sit (052, 069, 073). If 052 and 073 land, this is weighed again.

## Rank

At the end of the product work, after 011 and before the housekeeping and
release-readiness records (083, 082, 079, 080, 081). The sky-selection items it
touches (052, 069, 073) sit above it, and none has to wait for it. Big image
(003) sits above it and moves where the drawer's controls live, so building
this first would place it twice. And 079, 080 and 081 read the screens as they
stand, so this has to come before them, or three tabs change under their
assessment. Nothing it declares is a `needs`.

## Looked at

Each frame opened in the app with its EXIF and lens fix, on the build of
2026-09-29 (v2.64.4), fresh for every candidate, the whole frame rendered
through the app's own pipeline with controls a reader has.

- NIR_1376.NEF, 2026-09-29, the first version's renders: the oak. Foliage
  saturation alone to 0 turns the sky grey and leaves the tree pink; Sky
  saturation alone to 0 turns the tree grey-white and leaves the sky teal. Gold
  under blue (global saturation 1.6; Foliage hue +60 and saturation 1.8; Sky hue
  +30 and saturation 1.8; each box moving the other subject): a golden-tan tree
  under a deep navy sky with visible grain. Pink under teal (global saturation
  1.8, Foliage saturation 1.8, Sky saturation 1.6): a rose-pink tree under a
  green-teal sky. White under blue, set by the boxes' names (global saturation
  1.6, Foliage saturation 0 and luminance 1.2, Sky hue +30 and saturation 2): a
  gold tree under a grey sky, the opposite of what was asked; set the other way
  round, a white tree under a petrol-blue sky, blue also on the rocks and the
  fence wire.
- NIR_3716.NEF, 2026-09-29, the first version's renders: towers over dry
  grassland, with the oak's recipes. The same one-box tests give the same
  reversal: Foliage saturation 0 greys the sky, Sky saturation 0 greys the
  ground and the trees. Gold under blue: a pale periwinkle sky over tan-gold
  grass and trees. Pink under teal: a vivid turquoise sky over pink ground and
  trees. White under blue, set the other way round: a light cyan-blue sky over
  white ground and trees.

- NIR_1376.NEF, 2026-09-29, the oak: eight remaps. Each remap was made with
  the swap button off and the mixer set to the whole mapping from the camera's
  channels, except the first (the swap as a raw opens) and Hue 180 (global Hue
  shift, swap off).
  - R and B swapped, as it opens: a pale pink-white tree under a dark teal-grey
    sky, the grass near white and faintly pink.
  - R and B swapped, green also to the red output ([0,1,1 / 0,1,0 / 1,0,0], this
    app's reading of Rob Shea's G to R): the whole frame pink-red, a salmon tree
    under a brownish-mauve sky, pink grass. It differs from the stated red and green.
  - Green split to red and blue ([0,.5,1 / 0,1,0 / 1,.5,0]): the whole frame
    lilac-magenta, a lilac tree under a dusty purple sky. It differs from the stated orange
    and natural blue.
  - Green also to the blue output ([0,0,1 / 0,1,0 / 1,1,0]): a lavender tree under
    a slate-blue sky, lilac grass. A blue-violet cast, differing from the stated yellow and
    purple.
  - No swap, Hue shift 180: the whole frame lime-green, a chartreuse tree under a
    dark green sky. It differs from the stated orange and blue.
  - G and B swapped ([1,0,0 / 0,0,1 / 0,1,0], irlab.uk's): a sage-green tree under
    a plum-mauve sky, pale grey-green grass. Two colours, as 4b-xi records for
    Rob Shea's green-under-purple extra.
  - R and G swapped ([0,1,0 / 1,0,0 / 0,0,1], irlab.uk's): an icy lavender-white
    tree under an olive-khaki sky, silvery grass. Two colours.
  - The three-way rotation ([0,0,1 / 1,0,0 / 0,1,0], Kennard's, and the Film
    rotation chip): a pale dusty-pink tree under a dark slate-grey sky, the grass
    near white. Nearly the plain swap, with the teal gone from the sky, and not
    the greenish sky Kennard describes: on this camera's one colour axis
    (4b-ix) two remaps give almost one picture.
  - So this app's readings of the three green-reassigned swaps, and Hue 180
    without the swap, each put one cast over the whole frame. The sources state
    each mapping only as "green fully to" an output, and what their full
    matrices are, and whether they give the stated results on this camera, was
    not established.
  - Corrected 2026-10-01, for both frames: the casts in these four readings
    are at least partly the app's. Hue 180 went through a hue control that
    applied the YIQ rotation transposed, which turns grey lime at 180°, so
    its lime frame is that defect's (fixed on the session branch, "Fixed: Hue
    no longer tints grey…"). The three green-reassigned matrices have rows
    summing to 2/1/1, 1.5/1/1.5 and 1/1/2, so each adds a red, magenta or blue
    gain over the whole frame before any mapping shows; darktable's channel
    mixer offers "normalize channels" for exactly this. Both are owed a
    re-render — Hue 180 through the corrected control, the three readings with
    each row normalised to 1 — before they are read as what the mappings do.
- NIR_1376.NEF, 2026-09-29, the oak: three band moves on the plain swap,
  each one band of the eight-band mixer.
  - Orange band (30 degrees, the Sky box's centre under the swap),
    saturation 0 and luminance 1.6 (the move Kolari makes on the yellow band
    for white leaves): the tree eases from pink toward a paler grey-pink with
    whiter tips, and the grass whitens. Not white foliage: much of the pink sits
    outside the orange band.
  - Orange band, hue +15 and saturation 1.4 (toward gold): barely moves; the tree
    is a slightly warmer dusty rose, not gold.
  - Cyan band (180 degrees), saturation 1.6 and luminance 0.75 (the deeper-sky
    move): the sky deepens to a dark emerald-teal, and the pale grass and the
    rocks take a mint cast. The band catches them too (017: a colour is not a
    place).
  - So a fixed band is a weak lever on this frame: where the swapped foliage
    sits is not where a band's name says. A band entered from the photograph
    (Pick color, Drag on photo) starts where the colour is.

- NIR_3716.NEF, 2026-09-29, towers over dry grassland: the same eight remaps.
  - R and B swapped, as it opens: a pale teal-mint sky with white clouds over
    pale pink-grey grassland and white-pink trees.
  - The three green-reassigned readings and Hue 180 behave as on the oak: the
    whole frame salmon-pink, lilac-magenta, periwinkle-violet and lime-green in
    turn, one cast each.
  - G and B swapped: a pale lilac sky with white clouds over sage-green grassland
    and trees. Two colours, as on the oak.
  - R and G swapped: a pale cream-khaki sky over silvery lavender-grey grassland
    and white trees. Warm above and cool below, fainter than on the oak.
  - The three-way rotation: a pale grey-blue sky over the same pink-beige
    grassland. Nearly the plain swap again.
- NIR_3716.NEF, 2026-09-29: the three band moves on the plain swap.
  - Orange band, saturation 0 and luminance 1.6: the grass a little greyer, the
    trees still pink-white. Barely a change.
  - Orange band, hue +15 and saturation 1.4: nearly identical to the frame as it
    opens.
  - Cyan band, saturation 1.6 and luminance 0.75: the sky a saturated
    teal-turquoise, with horizontal banding across it and the hazy treeline at
    left broken into mottled cyan patches. A large saturation move on a smooth
    pale sky shows its steps.
