# 084 · A foliage colour and a sky colour, chosen by name

## Context

Asked on 2026-09-29, for later: a very simple hue, saturation and lightness
tool for making creative colour combinations in infrared photographs.

**What a combination is here.** This camera records essentially one colour
axis, from foliage to sky (IR-SCIENCE.md 4b-ix). A 3x3 mixer can place only two
of three colour targets on it, and a hue band places the third (4c-i). The
sources read describe their results the same way (4b-xi): a colour for the
foliage and a colour for the sky.

**What the app already has.** About a dozen colour controls. Every hue control
but one is a shift or a fixed mapping; the exception, the Grade tab's wheels,
sets an absolute hue as a tint by brightness band. A colour mask's Pick colour
also names an absolute hue, but to select what the mask covers, not to set a
colour. None lets a reader choose the colour one part of the photograph should
become: a grade wheel inside a mask adds a chosen tint to a part, but does not
land it on that colour. The Colour tab's global Hue
shift cannot move sky and foliage apart. The two boxes named Sky and Foliage
can, each with Hue (plus or minus 60 degrees), Saturation and Luminance. The
looks and the channel mixer's presets are the ready-made pairs.

**What the renders found (Looked at).** Three palettes the sources name were
rendered on both frames, NIR_1376.NEF (the oak) and NIR_3716.NEF (towers over
dry grassland): gold foliage under a blue sky, pink under teal, white under
blue. They were chosen as one per conversion class (590, 650 to 665 and 720 nm,
4b-xi), not by a count; orange under blue is named by at least as many sources
and was not rendered. Each was reached in three to five slider moves on the
Colour tab. **But as a photograph opens, with the swap on and no look, the box
named Sky acts on the foliage and the box named Foliage acts on the sky.** On
NIR_1376.NEF, moving only Foliage saturation to 0 turns the sky grey and leaves
the tree pink; moving only Sky saturation to 0 turns the tree and the grass
grey-white and leaves the sky teal. The small grey text under each box says so,
"(reds & golds — swapped)" under Sky. White foliage under a blue sky could be
reached only by using each box for the subject the other is named after.

NOTES.md has this under "The per-colour boxes are named for subjects and keyed
on hue, 2026-09-16". It was found then under Aerochrome, left as a copy decision
and never settled. That entry takes the bare swap as the case where the names
hold. On these two frames as they open, the bare swap is reversed too. The
rule places the Sky box at 210 degrees, and with the swap on at that angle's
reflection, 30 degrees: it assumes the sky is blue before the swap, as in
visible light. In infrared the swap is what turns the sky blue, so on these
frames the sky is teal and the foliage pink, and the pink is inside the Sky
box.

**So the gap is not what the controls can reach. It is that a reader has to
find a colour by sliding, and the two controls named for the two subjects point
at the wrong ones.**

## Looked up

Four researchers; a skeptic then re-checked each report claim by claim against
every cited source it could reach. Of 178 claims, 139 were supported, 23 partly
and 16 could not be reached. None was judged unsupported. A second reader then
checked this record's sentences against those verdicts, and the ones that said
more than their source were corrected. The infrared practice is written into
IR-SCIENCE.md 4b-xi with its sources; the points below are the ones this record
rests on.

- **The editors' colour mixers are shifts.** Lightroom's Color Mixer (eight
  fixed bands) and Point Color (sample, then shift), Capture One's Color Editor
  (up to 30 ranges), and darktable's color zones and color equalizer move a band
  or a sampled colour relative to where it is. RawTherapee's HSV equaliser has
  three curves, H, S and V (read from its source; its manual page could not be
  reached). None of the Lightroom, Capture One and darktable tools lets a reader
  name a destination per band, and what RawTherapee's H curve does was not
  read. A
  destination was found in one replace-colour dialog: Photoshop Elements'
  Replace Color sets the new colour with sliders or through a Result colour
  picker. Lightroom's Color Grading wheels and Capture One's Normalize also take
  a colour, as a global tint and for white balance. Other destination tools were
  not checked (below). Point Color was not on the iPad as of Adobe's June 2026
  mobile help, and the feature request still read Open for Voting. All read.
- **Apple's guidelines say an app that lets people choose colours should prefer
  the system colour controls**, a colour well that opens the system picker when
  tapped (Human Interface Guidelines, read).
- **Infrared results are described as a foliage colour and a sky colour.**
  Kennard names the results as pairs: red foliage with a blue sky, pink with
  teal, yellow with blue, orange with blue. Kolari's LUT pack has soft and deep
  pairs of gold and of pink vegetation. Rob Shea's Lightroom profile update adds
  a Sky series so the sky's hue can be chosen for the filter, and a White
  profile that keeps the sky blue and turns the foliage white. Rob Shea's PRO LUTs
  carry 23 names: colour names (Amber, Candy, Flamingo, Gold, Mint, Pink,
  Purple, Rose, Sage, Teal, Violet, Wheat, White), six Sky names, Neon, and the
  remaps Invert, Split and Swap; what each one denotes was not read. All read.
- **Simple colour tools take one of two shapes.** Pick a colour on the photo,
  then three shifts and a range (Point Color, Apple Photos' Selective Color).
  Replace Color picks the same way and sets the new colour with sliders or a
  Result picker. Snapseed's Selective places a point on the photo instead and
  has no hue control. Or choose two colours from swatches: VSCO's Split Tone
  has six swatches each for shadows and highlights and one slider; Photoshop's
  Duotone picks each ink from the colour picker or its ink books, with a curve
  per ink. All read.
- **By touch and for colour-vision deficiency.** WCAG 2.5.7 names a colour wheel
  as its example: a drag must have a tap alternative, and typed values count.
  WCAG 1.4.1: colour must not be the only way a thing is shown, and where the
  task is telling colours apart, a lightness difference is not enough. A
  colour-blind reader on Adobe's forum asked for colour names or numbers; a
  Metabase issue asks for names on hover and larger swatches; two colour-blind
  photographers on Fstoppers describe working around the lack, one pushing a
  colour's saturation to see whether it is present, the other reading a hex code
  into a naming site. Apple asks for 44 points, Google for 48 dp. All read.
- **Not used:** two claims that hue wheels are hard to hit by finger rested on
  snippets from hosts this environment refused (eleken.co, the USPTO patent
  server), so nothing here depends on them.
- **Not researched, named by the completeness critic.** Colour-harmony rules
  (a second colour derived from the first); GIMP's Rotate Colors and the iPad
  apps' colour-replacement tools (Pixelmator Pro, Photomator), DaVinci
  Resolve's Color Warper and DxO's colour wheel as destinations; the tablet
  apps a reader already knows (Procreate, Affinity Photo, Darkroom); what the
  system colour picker shows when a web page asks for one in Safari on the iPad;
  how far Lightroom's per-band hue travels; which palettes the sources name
  most; which set of colour names suits a colour-blind reader; and whether the
  palettes stay distinguishable under deuteranopia and protanopia. Each is one
  read or one render, and the build's plan takes up the ones its design depends
  on.

## Weighed against

- **NOTES.md, "The per-colour boxes are named for subjects and keyed on hue,
  2026-09-16"**: the open naming question. The chosen option settles it by
  making the boxes find their subjects, and its premise is corrected above.
- **A mask is a place, and the ordinary controls act inside it** (**042**,
  open). A hue band is not a place: a pale-blue field or a building's cladding
  takes the sky's or the foliage's colour. A mask is the reader's way to keep a
  colour where it belongs, and the swatches have to work inside one.
- **The sky selection's open defects** (**052**, **069**, **073**, open). The
  look's sky selection is the other way to find the sky, and it is where the
  hardest open work sits.
- **Bold Pink** (**078**), the looks and the channel mixer's presets: the
  ready-made pairs today. A look sets many things at once; this is a way to
  choose two colours.
- **The screens assessed as a whole** (**079**) and what follows it: they read
  the screens as they stand, and this changes the Colour tab.
- **Big image** (**003**): moves where the drawer's controls live.
- NOTES.md's roadmap archive, "Black & white for 720nm" and the grade entry
  beside it: a true two-ink duotone is recorded as possible later. It tones a
  black-and-white picture by brightness; this colours two subjects, and is a
  different thing.

## Depends

- touches 042 — the swatches act inside a mask, which is how a reader keeps a
  colour off a pale-blue field or cladding that a hue band cannot tell apart.
- touches 017 — 017 found a band cannot tell a pale-blue field from a pale-blue
  sky; the chosen route keys on hue and inherits exactly that limit.
- touches 019 — its Rejected section says a hue band is not a place. This record
  does not use a band as a place; it uses one to recolour, and names masks as
  the place.
- touches 052 — option 8 keys on the look's sky selection, which 052 makes
  visible; if it lands, option 8 can be weighed again.
- touches 069 — a blend toward a target colour tints what has no colour, and a
  neutral tinted upstream can still be pushed by a band, like 069's asphalt;
  the swatches write shifts, not blends, so they add no tint of their own.
- touches 073 — the sky selection takes in a tree on darker frames, one reason
  option 8 is not chosen now.
- distinct-from 078 — Bold Pink is a look with its own numbers, not a way to
  choose colours.
- touches 079 — 079 assesses the screens as they stand; this changes the Colour
  tab, so it comes first.
- touches 003 — 003 moves where the drawer's controls live; this adds to one of
  its tabs, so it comes after.

## Built already

What building this will use, so a second one does not get written
(LESSONS 330):

- **The two boxes.** Sky and Foliage in `ir.html` (`skyHue`, `skySat`,
  `skyLum`, `folHue`, `folSat`, `folLum`); `bandWeight` and `skyBandCentre` in
  `src/pipeline.ts`, which decide which pixels each box takes; `updateBandLabels`
  in `src/main.ts`, which writes the small grey text; the matching shader in
  `src/gl.ts`.
- **The band stage's guard.** A boost is gated on the pixel's own saturation
  (`bandGain`), so a pixel that arrives with no colour gets none. A neutral
  already tinted upstream can still be pushed, as 069 traced on asphalt under
  the look's mixer; reductions, hue and luminance are not gated.
- **The mixer, the pick and the drag.** The eight-chip Color mixer; Pick color
  from photo, which reads the pixel as displayed, after the mixer; and Drag on
  photo to adjust, which reads the colour with the mixer neutralised, before it.
- **A readout of an absolute hue.** The Grade tab's wheels, where a reader sets
  a hue rather than a shift, as a tint by brightness band.
- **Masks.** A mask carries its own Sky and Foliage values (042). Its offset
  sliders run to 120 degrees, but the value is held to the same plus or minus
  60 as the tab's boxes (`foliageAt`, `skyBandAt`), so a mask reaches no further.
- **The instrument.** A scratch copy of `tools/look-sheet.mjs` that renders
  candidates made only of controls a reader has; it made the renders below and
  refuses two different recipes that render the same picture.

## Options

1. **Two rows of named swatches, Foliage and Sky, each a destination, with one
   Strength.** Chosen.
   - Foliage names from the results the sources describe (gold, yellow, orange,
     pink, red, purple, green, white); sky names from teal to deep blue, with
     grey. 4b-xi also records a purple sky and a green-teal sky; whether those
     join the list is the build's to decide. The exact set is fixed when it is
     built, from 4b-xi.
   - Every swatch shows its name and its angle in degrees, and is a button: a
     tap chooses it, with nothing to drag (WCAG 1.4.1 and 2.5.7), at 44 points.
   - A choice is a destination. The app finds where that subject sits on this
     photograph and writes the shift that lands it there onto the existing Sky
     and Foliage boxes, where it is visible and undoable. The swatches are a
     front end on controls that exist, like Drag on photo.
   - A destination has precedent: Replace Color sets its new colour through a
     Result picker. What makes it safe here is that the swatch writes a shift
     onto the boxes, not a blend toward the colour, so a pixel with no colour
     is not tinted (the failure 069 records for blends).
   - The boxes find their subjects from the photograph instead of assuming
     where a swap puts the sky. That settles the 2026-09-16 naming question as
     a consequence: the boxes then act on what they are named for.
   - A pixel that arrives with no colour gets none (the band stage's guard,
     `bandGain`). A neutral already tinted upstream can still be pushed; 069
     traces where that tint enters, at the white balance, and the swatches do
     not fix it.
   - Known limits, stated rather than hidden. It keys on hue, so a pale-blue
     field or cladding follows the sky or the foliage; the remedy is a mask. And
     whether the boxes' plus or minus 60 degrees reaches every named colour from
     where this camera's foliage opens was not measured. If it does not, the
     build widens the boxes' range or composes the shift with the global Hue
     shift; a mask is held to the same range, so it is no way round.
2. Fix only which subject each box takes, and leave every control a shift.
3. More looks, one per palette.
4. A colour wheel with two handles, one for the foliage and one for the sky.
5. Pick a colour on the photo, then shift it.
6. A destination for every one of the mixer's eight chips.
7. Three free destinations: foliage, sky and neutrals.
8. The two colours keyed on places, the look's sky selection and the rest,
   rather than on hue.
9. Choose one colour and derive the other by a harmony rule.
10. A free colour for each subject through the system colour picker.

## Rejected

- **2, the boxes fixed and nothing else.** A reader still finds a colour by
  sliding, where the results the sources describe are where a colour ends up
  (gold foliage, a teal sky), not a shift. It is not wasted: it is the first
  half of option 1.
- **3, more looks.** A look sets the swap, the mixer and the sky stages at once,
  and a combination not on the list stays out of reach. Eight foliage colours
  by five skies is forty looks. That is the catalogue answer the LUT sellers
  give (Rob Shea's PRO set alone is 23 treatments in 10 styles each); a way to
  choose two colours is the smaller one.
- **4, a wheel with two handles.** WCAG 2.5.7 needs a tap alternative anyway, and
  a wheel shows no name or number unless one is added. The one colour-blind
  reader found who asked for anything asked for names or numbers, and the two
  photographers worked around their absence. Two handles on one wheel is a
  hidden state on a tablet: which handle a finger lands on decides which
  subject moves.
- **5, pick then shift.** The app already has it (Pick color from photo, Drag on
  photo to adjust), and it is the shift the ask is about getting past.
- **6, eight destinations.** It promises colours this frame does not hold. The
  frame has two populations with colour (4b-ix); eight destinations on it would
  leave six with nothing of their own to move, or with a stray patch to push.
- **7, three free destinations.** A destination for things with no colour is a
  tint on them, the failure 069 records. The chosen option gives a pixel that
  arrives with no colour none. Of the sources read, LifePixel's basics tutorial
  turns the cyan highlights white with saturation and lightness controls a
  reader already has, and Kolari takes a cast out of the clouds and ground
  through a blue-channel mask.
- **8, keyed on places.** The look's sky selection is where the hardest open
  defects sit: a tree taken in and painted scarlet (073), a selection the reader
  cannot see (052), neutrals tinted (069). A simple tool keyed on it would wait
  on all of them and inherit them. Option 1 states its own limit and has a
  remedy that exists, a mask. If 052 and 073 land, this is weighed again.
- **9, one colour and a rule.** Not researched here (the critic's gap). The
  results read are described as two colours chosen together (Kennard's pairs)
  or as a series that varies the sky's hue for the filter and camera (Rob
  Shea's Sky series); none read derives one from the other.
- **10, a free colour through the system picker.** Apple's guidelines prefer the
  system controls, and the build should weigh a colour well beside the
  swatches. Not chosen as the tool: a free choice offers colours the boxes
  cannot reach from where the subject sits, and whether the picker shows names
  or numbers was not researched.

## Rank

At the end of the product work, after 011 and before the housekeeping and
release-readiness records (083, 082, 079, 080, 081). It was asked for later.
The sky-selection items it touches (052, 069, 073) sit above it, and none has
to wait for it. Big image (003) sits above it and moves where the drawer's
controls live, so building this first would place it twice. And 079, 080 and
081 read the screens as they stand, so this has to come before them, or the
Colour tab changes under their assessment. Nothing it declares is a `needs`.

## Looked at

Each frame opened in the app with its EXIF and lens fix, on the build of
2026-09-29, fresh for every candidate, the whole frame rendered through the
app's own pipeline with controls a reader has.

- NIR_1376.NEF, 2026-09-29: the oak. As it opens, swap on and no look, a pale
  pink-white tree under a dark teal-grey sky, the grass near white. Foliage
  saturation alone to 0 turns the sky grey and leaves the tree pink; Sky
  saturation alone to 0 turns the tree grey-white and leaves the sky teal.
  Gold under blue (global saturation 1.6; Foliage hue +60 and saturation 1.8;
  Sky hue +30 and saturation 1.8; each box moving the other subject): a
  golden-tan tree under a deep navy sky with visible grain, the grass near white
  with a faint warmth. Pink under teal (global saturation 1.8, Foliage
  saturation 1.8, Sky saturation 1.6): a rose-pink tree under a green-teal sky.
  White under blue, first set by the boxes' names (global saturation 1.6,
  Foliage saturation 0 and luminance 1.2, Sky hue +30 and saturation 2): a gold
  tree under a grey sky, the opposite of what was asked. Set the other way round
  (global saturation 1.6, Sky saturation 0 and luminance 1.2, Foliage hue +30
  and saturation 2): a white tree under a petrol-blue sky, blue also on the
  rocks at the bottom and on the fence wire.
- NIR_3716.NEF, 2026-09-29: towers over dry grassland, with the oak's recipes.
  As it opens, a pale teal sky over pink-tinted grass and trees. The same
  one-box tests give the same reversal: Foliage saturation 0 greys the sky, Sky
  saturation 0 greys the ground and the trees. Gold under blue: a pale
  periwinkle sky over tan-gold grass and trees; the whole grassland takes the
  foliage colour. Pink under teal: a vivid turquoise sky over pink ground and
  trees. White under blue, set the other way round: a light cyan-blue sky over
  white ground and trees.
