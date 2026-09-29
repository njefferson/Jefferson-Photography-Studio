# 069 · The look's sky adjustments tint and darken what has no colour

## Context

Found 2026-09-26, while a learned sky selection was built, exported beside
today's and taken out, and recorded in 052 as one of three facts not fixed.
**The look's three sky stages have no guard against white.** Read off the
shader in `src/gl.ts` and `compileEdit` in `src/pipeline.ts`, in the order they
run:

- **Sky colour smoothing** (`skySmooth`) blends each selected pixel's chroma
  toward the sky colour of its texel in the 128-texel-wide sky map
  (`SKY_MAP_W` in `src/skymap.ts`), gated on the pixel's chroma DISTANCE from
  that colour (`SKY_GATE_LO..HI`, 0.12 to 0.25). The gate was built to spare a
  branch, which sits far from the sky. A neutral pixel under a pale sky sits
  close to it, so a cloud inside the selection is pulled toward the sky's
  colour.
- **Sky saturation** (`skySat`) is gated on the pixel's own saturation
  (`SKY_SAT_GATE_LO..HI`, 0.05 to 0.13, decision 019) so that a cloud stays
  grey. It runs after the smoothing and reads the pixel the smoothing has just
  tinted, so the gate that exists to spare the cloud reads a cloud that is no
  longer grey.
- **Sky depth** (`skyDepth`) multiplies the pixel's value through the refined
  selection and the sky map's keying byte. The key is per photograph and its
  grey guard is per texel (IR-SCIENCE 4b-v); nothing reads the pixel itself. A
  cloud inside a blue texel is darkened with the sky round it.

**What that did, looked at.** On the whole-frame exports of 2026-09-26 the
learned selection took NIR_1651's cloud and NIR_1644's band of cloud behind the
crowns into the sky, and the stages turned both blue-grey, with patches of
green and pink in them. Under today's selection both stayed white. NIR_3461's
near pylon went dull, with round red glows, where the learned selection covered
its steel. 052's verdict on that selection stands. As the look's automatic
selection it was better only on the one frame with no sky. On the photographs
with sky it was worse, and on NIR_1827 the two renders nearly match, differing
only along the treetops and in the broken cloud at the upper right. It was
taken out. What this record takes from those exports is a fact about the
stages: the blue-grey cloud is what they do to cloud inside any selection that
holds it.

**Of the steel, only one part is this record's.** 052 puts the cover down to
the learned selection: it is built at 1024 px and the steel is narrower than one
of its pixels, so it took steel in. That part is 052's and nothing here changes it.
Under that cover Sky depth darkened the steel and the smoothing pulled it toward
the sky's colour; for steel that arrives without colour, that is this defect.
But 061 measured NIR_3461's steel arriving red: the foliage band, which runs
before the sky stages, paints the wires and one face of each pylon member, so
that steel arrives carrying colour and a guard on what arrives without colour
leaves the stages acting on it as they do today. And the round red glows are
not the steel's pixels at all. They are the smoothing's texels averaging red
wire into the sky round it (013, 061): sky pixels that arrive with colour and
are moved. So this record covers pale steel under a selection that covers it,
and does not claim the red steel, the glows or the cover.

Cloud is sky by the Sky mask's own purpose (`NOTES.md` "## What the Sky mask is
FOR, ruled 2026-09-20": all of the sky and not more), and the Sky mask's colour
grow takes NIR_1651's cloud in for that reason. Any selection that holds all of
the sky holds cloud.

**And the rotation fix brings those clouds into the look's own selection.**
NIR_1651 and NIR_1644 are turned photographs, and the look's selection
is built as though they were not (070). Built at their own rotation, the
selection map takes NIR_1651's cloud and most of NIR_1644's band in. That is
read off selection maps drawn over the frames, not off renders through the
stages: no export with the selection built at their rotation has been made. So
this defect is not waiting on a new finder. 070 puts those clouds inside the
look's own selection, and 052's Option 1 puts every cloud the reader's Sky mask
holds under these stages. That they would then go blue-grey is expected from
what the stages did to cloud on 2026-09-26, and is confirmed by render (Options).

**The rule this breaks is already written.** 019's intended outcome is that "a
pixel that arrives without colour leaves without colour". The film says the
same thing physically: Kodak's data puts clouds near-white, with the film's
dark sky coming from its slow infrared layer seeing almost nothing of clear
skylight (IR-SCIENCE 4b-viii), and the film reference built outside the app
kept NIR_1651's cloud white with a per-pixel guard on the infrared axis
(4b-vii). 019 wrote the rule for one stage. The other two never had it, and the
one that has it reads the pixel after the smoothing has moved it.

**How a guard on the stages differs from what 052 rejected.** 052 tried "a
per-pixel whiteness weight subtracting cloud" as a fix for the SELECTION. A
guard is not a selection. The selection keeps the cloud, so the reader's Sky
mask, its matte, its coverage line, its hand corrections and its own five
adjustments are untouched, and nothing is carved out of the sky to leave an
edge through a wisp. What changes is what the three stages do to a pixel inside
it: they move only colour that arrived. The guard puts 019's question, whether
this pixel carries colour, and not the whiteness weight's, whether this pixel
is sky.

**But the whiteness weight's three measured failures were failures of a
per-pixel reading, and a guard reads per pixel too.** It missed NIR_1651's
cloud, read the bright haze round NIR_1827's sun as white, and was grainy near
the horizon. Each is a check any guard must pass before it ships, beside two
from the same family, both measured on Sky depth read per pixel: it snowed a
pale sky, darkening half its pixels and sparing the rest, which is why its key
is per photograph today (IR-SCIENCE 4b-iv and 4b-v); and on NIR_1651 it spared
the cloud and not the clear sky beneath it, with a seam at the gate's width
rather than at the cloud's edge (4b-iv).

**And one more, which is the smoothing's own purpose.** 013's sky speckle is
single pale pixels, much less saturated than the sky round them, and giving
them the sky's colour back is what Sky colour smoothing was built to do. A guard
that reads a lone dot as "arrived without colour" brings the speckle back, and
under Sky depth leaves the dot standing pale in a darkened sky. A dot and a
cloud are both pale. What separates them is size, and a rule that read size
would need a width that nothing here fixes without choosing it on these frames.
So the speckle is a check the rule must pass as it stands, and can fail it; it
is not a parameter to set.

## Looked up

- **Kodak's own data for the film**: AEROCHROME III Infrared Film 1443 (AS-77 /
  TI-2562) and EKTACHROME EIR (TI-2323), read in full 2026-09-25 and modelled in
  IR-SCIENCE 4b-viii. Skylight through the Wratten 12 is mostly green with very
  little infrared, so the infrared layer barely exposes and a clear sky renders
  blue and dark; clouds render near-white. The film's dark sky belongs to clear
  skylight, not to everything above the horizon.
- **Photoshop's Blend If**: Adobe, *Layer opacity and blending modes*
  (helpx.adobe.com/photoshop/using/layer-opacity-blending.html), read
  2026-09-26. Beside a layer's mask, the Underlying Layer sliders set which
  pixels of the picture below may be changed, by their brightness per channel,
  and split sliders give a range of partial blending so there is no hard edge.
  The mask says where; Blend If says which pixels, by what they are. It reads
  brightness, not colour.
- **Lightroom's answer to a sky adjustment that spills**: intersect the sky
  mask with a range mask (Fstoppers, *Sky masking in Lightroom: fix halos and
  gaps*, fstoppers.com/lightroom/sky-masking-lightroom-fix-halos-and-gaps-721200,
  read 2026-09-25). That is the selection route, the one the whiteness weight
  took.
- **What a saturation control does to a neutral**, read off the app's own
  stages rather than a source: a stage that multiplies chroma about luma leaves
  a pixel with no chroma where it is, by construction, and a blend toward a
  target colour does not. That is why Sky saturation alone would never tint a
  cloud, and why the smoothing before it does.

So the field keeps two things apart: the mask decides where an adjustment
applies, and a guard on the adjustment decides which pixels it may change. The
film decides what the guard keeps: a cloud comes out white.

- **How the field tells a lone outlier from a region**, for option 7
  (IR-SCIENCE 9p, with the sources): RawTherapee's impulse noise reduction and
  defringe, read in its source; the robust bilateral filter (arXiv
  1505.00074); the guided filter, the rolling guidance filter and joint
  bilateral upsampling; darktable's hot pixels, ROAD and the Hampel
  identifier. Every method decides by how much support a pixel finds round it,
  and the ones with no fitted constant take their scale either from a
  structure already computed or from the data's own spread. In this app that
  structure is the sky map.
- **For option 9, looked up 2026-09-27: the brightness route.**
  - Fstoppers, *Everything You Need to Know About Lightroom Masking (Part 2)*:
    the way to darken a blue sky and keep its clouds white is the sky mask
    intersected with a luminosity range that removes the white clouds.
  - photographylife.com, *Range Masks Explained*: the same route, a local
    adjustment restricted to the pixels of its mask that fall inside a
    luminance range.
  - darktable user manual, *mask refinement & additional controls*: a mask is
    refined with guided-filter feathering, which makes it follow the edges of
    the picture itself.
  - Otsu, *A threshold selection method from gray-level histograms* (IEEE
    Transactions on Systems, Man and Cybernetics, 1979): the standard
    threshold for a picture holding two populations, placed where the
    between-class variance is greatest, with no parameter to set.
  - Ashman's D (Ashman, Bird and Zepf, *Detecting bimodality in astronomical
    datasets*, 1994): sqrt(2)·|mu1 − mu2| / sqrt(s1² + s2²), the standard
    measure of whether two classes are separate populations; D > 2 is the
    standard condition for a clean separation.
  - So the field's answer and this app's gap are the same shape: Lightroom's
    reader chooses the luminance range by eye for each photograph, and this
    app's look has no reader choosing it, so the two ends and the decision
    whether to act at all come from the photograph through those two
    statistics.

- **Where the infrared field puts the white point** (read 2026-09-28): Rob
  Shea, "White Balancing Color Infrared Photography" (2025): *"Use the white
  balance picker and click on a neutral element in your image, such as clouds
  or pavement. Color neutral elements will not have a color cast."* Kolari
  Vision's custom DNG tutorial exists for the same reason: an infrared raw's
  white point sits outside the converter's range and is set on the picture.
- **Gray-world's documented failure** (Stanford Psych221, "Color Balancing
  Algorithms"; US patent 9007484, "Alleviating dominant color failure in
  automatic white balance"): a scene dominated by one colour pulls the average
  toward it, and the correction puts the opposite colour on what is neutral. In
  infrared the dominant population is bright foliage.

## Built already

What exists that this item will use, so a second one does not get written
(LESSONS 330):

- **The three stages**: the sky block of the shader in `src/gl.ts` and
  `compileEdit` in `src/pipeline.ts`, with `SKY_GATE_LO`, `SKY_SAT_GATE_LO` and
  their pairs. The two must compute the same picture, which
  `tools/agreement-walk.mjs` checks.
- **The sky map**: `buildSkyMap` in `src/skymap.ts`, with its per-photograph
  depth key and its per-texel grey guard (`SKY_DEPTH_GREY_LO..HI`).
- **The definition of colourless in the sky**: 019's `SKY_SAT_GATE_LO..HI` on
  the pixel's own saturation, which Sky saturation already uses and this record
  extends.
- **Instruments**: `tools/look-sheet.mjs` renders a frame through the build in
  `dist`, the app's own path, with `--file` naming the frame;
  `tools/sky-stage-walk.mjs` measures the exported sky whole and fails a
  smoothing stage that moves nothing; `tools/aerochrome-walk.mjs` checks the
  look's declared amounts; the report's "Sky map" line prints each photograph's
  depth key; `tools/film-reference.mjs` carries the per-pixel infrared guard
  that kept NIR_1651's cloud white, for comparison.

## Weighed against

- **019, "Aerochrome's saturation by population: foliage and sky each their
  own amount, nothing colourless touched"**: the rule is 019's, and so is the
  one gate that already carries it. This extends it from one stage to three and
  moves where it is read.
- **013, "Aerochrome is the right colour and comes out splotchy"**: Sky colour
  smoothing is 013's stage, and its sky half was resolved by giving pale grain
  the sky's colour back. The guard must not undo that. 013's round discs along
  wires are the smoothing's texels averaging a wire's colour into the sky round
  it: the sky's pixels moved, not the wire's. This record does not claim them.
- **061, "Red and blue do not line up at thin edges, and Aerochrome paints the
  difference"**: on NIR_3461 it measured the red on the steel as the foliage
  band's, painted before the sky stages run, and the round discs as the
  smoothing spreading red wire. Both arrive with colour, so the guard leaves
  both as they are. Its remedy for the red is 042's stage for the look's own
  bands.
- **052, "The look's sky adjustments read a selection the reader cannot see"**:
  it rejected the whiteness weight as a selection fix and recorded this defect,
  and its Option 1 puts the reader's Sky mask, cloud included, under these
  stages. The steel's cover by a 1024 px selection is its finding and stays
  with it.
- **023, "The Sky mask reads the sky's colour as well as its place"**: its grow
  takes NIR_1651's cloud into the Sky mask on purpose, which is what reaches
  these stages under 052.
- **066, "Aerochrome is rendered from a model of the film, not tuned toward
  it"**: a film model makes cloud white from the film's own curves. If it
  replaces these stages, this rule is the one its clouds must meet, and the
  guard goes only with the stage it sits in.
- The rotation (070) declares its relation from its own side. It said it
  could not ship before this until 2026-09-27; it touches this now, and ranks
  above it (070, Rank).

## Depends

- touches 019 — the rule is 019's and so is the gate that carries it; this extends it to all three stages and moves where it is read, so a change to either definition moves the other.
- touches 013 — Sky colour smoothing is 013's stage and its sky half works by giving pale grain the sky's colour back; a guard that reads grain as colourless undoes it.
- touches 052 — 052 rejected a whiteness weight as a selection fix, and its Option 1 puts every cloud the Sky mask holds under these stages; this is what those clouds meet there.
- touches 023 — the Sky mask's colour grow takes cloud into the sky on purpose, and under 052 that cloud reaches these stages.
- touches 066 — a film model renders cloud white from the film's own behaviour; this rule is what its clouds must meet if it replaces these stages. Option 10 (2026-09-28) found the cloud's cyan is gray-world's white point amplified by a look derived at it, and a look derived at a neutral white point is 066's ground; on practice copies, and on the owner's raws (2026-09-29) the cast enters there on every frame and turns a cloud cyan only where it is left off neutral and arrives above 019's gate.
- needs 015 — the grey patch these stages were being tuned against is, on the
  cell-tower set, the lens's uncorrected centre drift (015, Looked at). With
  015 on at open, what arrives at these stages changes.
- distinct-from 061 — both are about NIR_3461's steel under the look, and they are different pixels: 061's steel arrives red from the foliage band and its discs are sky moved toward red wire, neither of which this guard reaches; this record's are the steel and cloud that arrive without colour.

## Found on the device, 2026-09-26

- **A hand remedy for the grey patch.** In a Sky mask, moving the grade's
  highlights toward blue, with a larger amount, removes the grey blobs from the
  sky.
  - It is a grade applied by hand over a mask the reader drew.
  - It is evidence for what the sky should arrive as — the sky's colour, not
    white — and not an option in itself.
  - Looked at, 2026-09-26: the reader's own export with that grade, on
    NIR_3698, from the 2026-09-26 cell-tower set.
    - The sky is an even blue, lighter toward the treeline, with no grey patch.
    - What is left is a fine mottle of grain, reddish in the upper left.
- **And what it was.** The same frame rendered by the app at lens correction 0
  and 1 has a near-grey sky centre at 0 and a blue one at 1: chroma 6.3 against
  20.3. The blob the grade covered is the lens's centre drift, left uncorrected
  because the correction opened off (015). What reaches these stages changes
  once it opens on, so this record needs 015.

## Options

1. **FAILED, built 2026-09-26: one rule for the three sky stages, stated once:
   what arrives without colour leaves without colour, and at its own value.**
   Nothing is chosen now. It was built and failed three of its own checks
   (Rejected, 1, and "Built and measured, 2026-09-26" below), and every other
   option here was already rejected, so the record needs a new option.
   - One weight, read once on the pixel as it ARRIVES at the first sky stage,
     before anything has tinted it, and every stage multiplies by it. Smoothing
     moves only colour that was there; Sky saturation reads what arrived, not
     what the smoothing made; Sky depth darkens only what arrived carrying
     colour.
   - The weight is 019's gate as it stands: `SKY_SAT_GATE_LO..HI` on the
     arriving pixel's own saturation, the gate Sky saturation already carries,
     read on the same pixel in the same pass. No new constant and no new pass:
     the rule written for one stage becomes the rule for three, and if 019's
     definition ever moves it moves for all three at once.
   - Read per pixel, as 019's gate is, and that is its risk: 013's speckle and
     the snow a per-pixel key left on a pale sky are both pale pixels a
     per-pixel guard may spare. Both are acceptance checks below, and either
     can fail the option. Neither is answered by reading over a neighbourhood
     or by moving the gate: a width or a threshold chosen by rendering these
     frames is a constant tuned to them (Rejected, 2). If a check fails, this
     option fails as written and the record goes back to its options.
   - The smoothing's distance gate stays: it guards the other side, a coloured
     thing that is not sky, such as a branch. Sky depth's per-photograph key and
     per-texel grey guard stay: they decide whether a sky is blue enough to
     darken at all.
   - The selection is not touched. The Sky mask, and under 052 the look, keeps
     the cloud.
   - **Before it ships**, each check is rendered through `tools/look-sheet.mjs`
     and opened, whole frame and at 1:1. The haze round NIR_1827's sun: as it
     is today unless the film says otherwise, shown rather than argued. The sky
     near the horizon on NIR_1827 and NIR_3461: no grain. 013's speckle frames
     (IR-SCIENCE 9l: three of ten carry it): the speckle stays gone. A pale sky
     that Sky depth still darkens, found by its key on the report's "Sky map"
     line: no pale dots left standing in it. And `tools/sky-stage-walk.mjs`
     still passes, so the smoothing still moves the sky it moved, and
     `tools/agreement-walk.mjs` holds the shader and `compileEdit` to one
     picture.
   - **Waiting for 070**: NIR_1651's cloud and NIR_1644's band, white rather
     than blue-grey, with no seam where cloud meets clear sky. The app builds
     the look's selection at rotation 0, whose map on these two frames leaves
     NIR_1651's cloud and most of NIR_1644's band outside it, and
     `tools/look-sheet.mjs` renders the app's path, so no instrument puts them
     under these stages at this rank. They are run as 070's acceptance, and 070
     does not ship until they pass.
   - **Waiting for a selection that covers steel**: NIR_3461's near pylon, the
     steel that arrives pale keeping its colour and value. Today's selection is
     0 inside that pylon (052), and no ranked item is built to cover that
     steel, so there is nothing there for the guard to act on and this option
     promises nothing for steel. The one recorded way it would be covered is a
     reader choosing the learned finder on the Sky mask the look reads, once
     052's Option 1 is in, and 068 builds that choice only if its comparison
     finds each finder losing somewhere the other does not. The steel that
     arrives red is 061's, and is not a check of this option.
2. Tune each stage against the practice frames: a narrower smoothing window, a
   higher saturation gate, and a depth threshold fitted to NIR_1651 and
   NIR_1644.
3. Take the cloud out of the selection: 052's per-pixel whiteness weight.
4. The film reference's guard: a pixel on the infrared-bright side of the axis
   inside the selection is left alone (4b-vii, the axis above +0.04).
5. Guard the smoothing alone, since it is the stage that adds the colour.
6. Leave it: today's selection leaves most cloud out.
7. **REJECTED before a render, 2026-09-26: read the surroundings, not the
   pixel.** Option 1's own finding, researched (IR-SCIENCE 9p) and designed as
   three rules on the four sky-map texels round each pixel. B scales each stage
   by how colourless the sky's colour is at the pixel's own brightness, only
   where those four texels disagree; A also pulls each pixel toward the texels
   it resembles; C gives Sky depth A's choice as well. A reading of the code
   against every recorded failure rejected A and C before anything was
   measured: which texel a pixel resembles follows its own noise, which is
   Rejected 1 again. B was measured off the sky map itself on the eight frames,
   with no render, and its texels disagree along every edge of the selection
   ("Measured before a render" below). Nothing is chosen, and the record holds
   no option that stands.
8. **MEASURED OFF THE MAP, 2026-09-26, and not rendered: build each texel from
   sky samples only.** A tap counts as sky where the refined selection scores it
   above one half (the level the refinement already cuts at); a texel with less
   than one sample of sky is filled from its neighbours ring by ring (pull-push
   fill, Gortler et al. 1996); the photograph's depth key and the grey guard's
   reference keep today's samples, so Sky depth is unchanged. Against bars fixed
   and hashed before the run: edge disagreement fell from 31–83% to 0–14% and
   passes on six of seven frames with sky; it created at most 3 red-ward texels
   on any frame; the key is bit-identical to today on every frame. It fails on
   NIR_1703, whose edge band stays at 14.4%, and every disagreeing cell there
   traces to red crown tips the refined selection itself scores as sky, which the
   fill then spreads. What is left of this record is the look's selection
   holding what is not sky (073, 052), not the map.

9. **REJECTED after renders, 2026-09-28: a cloud guard, bright AND
   colourless, with its ends taken from the photograph.** Numbered after
   8 (the map from sky samples only), above. Both of
   its forms were built, rendered beside today's build, opened, and taken out;
   neither passed its checks ("Built and rendered" below, and Rejected, 9).
   - **What the field does.** Lightroom's standard answer to "darken a blue
     sky, keep the clouds white" is the sky mask intersected with a luminance
     range that removes the bright tones, and darktable refines such a mask
     with a guided filter so it follows the picture's own edges (Looked up).
     The mask says where; the range says which pixels, by their brightness.
   - **Why brightness alone was not enough.** The first form spared every
     bright pixel, and a pale clear sky low toward the horizon is bright too:
     on NIR_1661, NIR_3406 and NIR_3461's clear band it lost its blue.
     Brightness cannot tell pale low sky from cloud. A cloud is bright AND
     colourless; a pale low sky is bright and still blue.
   - **One weight, 1 − bright × colourless**, and all three stages multiply
     by it: the smoothing's amount, the sky-saturation boost and the
     sky-depth factor. Every existing gate stays: the smoothing's distance
     gate that spares branches, 019's saturation gate, and Sky depth's key
     and grey guard.
   - **Bright is read on the pixel's luma as it ARRIVES at the sky block**,
     before the smoothing moves anything, as smoothstep(sky class mean, cloud
     class mean, luma). The two ends come from the photograph, not from
     constants fitted to frames (Rejected, 2): inside the look's selection,
     where the sky map already samples each photograph (`buildSkyMap`), the
     arriving luma is split in two by Otsu's method, the standard threshold
     for a picture with two populations. That the brighter class is the
     cloud is the film's physics, not a fit: clear skylight carries little
     infrared, so a clear sky renders dark and a cloud near-white (IR-SCIENCE
     4b-viii). Bright is 0 everywhere unless Ashman's D between the two
     classes is above 2, the standard condition for a clean separation.
   - **Colourless is read at the sky map's scale, never per pixel.** Per
     pixel, chroma is 013's speckle, and that is option 1's failure. Each
     texel of the map carries its mean HSV saturation over ALL its selected
     samples as they arrive (`SkyMap.sat`, one byte per texel), not the sky
     target colour the map already stores; a texel with no selected sample
     carries the photograph's mean. Colourless is that mean read through
     019's `SKY_SAT_GATE_LO..HI`, the existing definition of colourless in
     the sky, so there is no new constant.
   - **Why it is not option 1 again.** Option 1 read chroma per pixel, the
     small residual the look multiplies by thirteen (4c-xxi). Here the only
     per-pixel reading is luma, the large number, and a speckle dot is pale
     in colour, not bright; the colour is read over a texel's footprint.
     That is the argument; the renders are the test.
   - **Where it lives.** The split rides the sky map (`SkyMap.cloud`) to the
     shader as two uniforms, and the texel means as an R8 texture sampled
     with the same bilinear read `sampleSkyMap` makes; `compileEdit` reads
     the same numbers, so export and screen agree. The report's "Sky map"
     line prints D, whether the guard is on, and the two ends. The
     selection, the Sky mask and every other stage are unchanged.
   - **Its checks** are the ones the plan named, each rendered and opened:
     NIR_1651's cloud white with its clear sky unchanged; NIR_1644's band of
     cloud behind the crowns white with no seam at the crowns; NIR_1827's sun
     haze as today with no grain at the horizon; NIR_3406, 013's speckle frame,
     with no rust blotches at 1:1; NIR_3461's horizon without grain; and a
     clear sky with no cloud, NIR_1661, identical to today. After the first
     form's renders, the check that decides it: NIR_1661, NIR_3406 and
     NIR_3461's clear band unchanged from today, while NIR_1651's and
     NIR_1644's cloud stay white. Rendered 2026-09-28, the refined form
     passes the clear sky and fails the cloud: both clouds are cyan as today
     (below).

10. **MEASURED AND RENDERED 2026-09-28, open, not built: the cloud's colour is
    the white point's, and the look multiplies it.** Traced stage by stage on
    NIR_1651, NIR_1644, NIR_3406 and NIR_3461 ("Measured and rendered,
    2026-09-28", below).
    - **LABELLED 2026-09-29: what those four files were.** NIR_1651 and
      NIR_1644 were the practice DNGs in `public/examples/`: no EXIF, so no
      camera and no lens fix. NIR_1644 has no original in the owner's set at
      all. NIR_3406 was a real NEF, the carport, and it is not in the owner's
      set. NIR_3461 was the owner's NEF, opened with its lens fix. So every
      figure below from NIR_1651, NIR_1644 or NIR_3406 describes a file the
      app does not open the way it opens a reader's raw.
    - **CORRECTED 2026-09-29, on the owner's seven raws** ("Traced on the
      owner's raws, 2026-09-29", below). Where the cast enters holds: on every
      frame, gray-world leaves the cloud and the clear sky on one side of the
      white point, with one hue, and the foliage on the other. What does not
      hold is that the cast makes the cloud cyan. On four of the six frames
      with cloud, gray-world leaves the cloud within 0.05 of neutral, it
      arrives at the sky stages under 019's gate, and it leaves white
      (NIR_1703, NIR_1827, NIR_3461, NIR_3466). The cloud goes cyan on two:
      NIR_1651's bright band, left at 0.12, and NIR_1661's wisps, left at
      0.17. Both arrive above the gate's top (0.13) and Sky saturation more
      than doubles them. So a cyan cloud needs two things: a cloud the white
      point leaves off neutral, and a gate that reads it as coloured. The one
      neutral away from the sky in the set (NIR_3466's road) is also off
      neutral, on the foliage's side, and the look turns it maroon. That is
      the white point's other half, and it is not in the sky stages at all.
    - **Where it enters.** At open, before any look, NIR_1651's cloud and its
      clear sky carry one cast: hue 173–175, saturation 0.09, in three places
      across the frame. A cast that is the same everywhere is a white point,
      not a lens. The look's mapping takes the cloud to 0.15, and the three sky
      stages to 0.36–0.38. NIR_3461's dense cloud arrives at 0.03 and stays
      there through every stage.
    - **What decides it.** The white point is gray-world over the whole frame
      (`grayWorldWB`, `src/decode.ts`). The field's documented failure of
      gray-world is a scene dominated by one colour, which takes the opposite
      colour onto everything neutral. The field's own infrared practice sets the
      white point on something neutral, clouds or pavement (Looked up).
    - **What moving it alone does.** A white point taken from each frame's cloud
      is a small move: 3% less red and 7% more blue on NIR_1651, 4% and 8% on
      NIR_1644, nothing on NIR_3461. Under the look as it ships, the clouds turn
      white. And the look turns over:
      - NIR_1651's clear sky goes from blue (hue 204) to a reddish grey (hue 4);
      - NIR_1644's upper sky drops from saturation 0.85 to 0.53;
      - the foliage loses its white highlights (0.80 to 0.96, 0.56 to 0.90);
      - on NIR_1651, red haze spreads from the crown into the cloud and down
        beside the trunk.
    - **What that says.** The look's numbers were derived at gray-world's white
      point (IR-SCIENCE 4c-v), so a white point that is right for the cloud is
      wrong for the look. And a 3–7% move in the white point swings the sky
      from blue to grey. So the white point cannot be fixed under today's look,
      only with the look derived again at it, which is 066's ground (Depends).

## Rejected

- **1, one rule read on each pixel as it arrives — built 2026-09-26, and failed.** Read per pixel it cannot tell 013's speckle from a cloud, which is the risk this record named before it was built. At the look's own settings NIR_3406's sky filled with rust-coloured blotches at 1:1 where today's is even; with Sky depth at 0.5 that whole sky snowed with pale dots; NIR_3461 and NIR_3466 took grain above the horizon and dotted cloud edges; NIR_1651's small cloud mottled. Moving its gate or reading it over a width chosen on these frames is 2.
- **2, tune the constants.** Constants fitted to six frames fix those six and move on the next. 029 refused this shape for the seed, where no setting of its constants satisfied both ends, and 013 refused a per-photograph strength fitted to one positive example. Three gates reading three different states of one pixel is how this defect arose, and tuning keeps three.
- **3, take the cloud out of the selection.** 052 measured it and rejected it: it missed NIR_1651's cloud, read NIR_1827's sun haze as white and was grainy near the horizon. It also moves the wrong thing. By the purpose ruling cloud is sky and the Sky mask holds it; carving it out moves the reader's matte, coverage, corrections and five adjustments in order to fix three stages, and puts an edge through every wisp.
- **4, the infrared axis.** It is the one reading known to have kept NIR_1651's cloud white, and it stays the comparison the first render is checked against. As the rule it tests whether a pixel is sky, which is the selection's question put in the stages' place; it needs the linear axis carried past the grade to stages that run after it; a camera-rendered file has no such axis; and its +0.04 was fitted on seven frames.
- **5, the smoothing alone.** Sky depth darkens a cloud grey with no tint at all, and the film leaves it near-white. Half the rule is a second place for the other half to be forgotten.
- **7, read the surroundings at the sky map's scale — designed, measured off the map, and rejected before a render.** The texels along the selection's edge average the sky with whatever the bitmap's feather took in, so they disagree with their neighbours on every frame: 31% to 83% of the cells along the edge, against 0% to 8% inside the sky. A rule that acts where the neighbours disagree therefore acts in a band about two texels wide along every treeline, roofline and horizon, and there it hands the stages to the pixel's own reading, which is Option 1's grain in the place Option 1 grained. None of the three rules reaches the inside of a cloud wider than two texels either. What would make the surroundings readable is a map whose edge texels carry the sky's colour; that is a change to how the map is built, not to the stages, and it is not an option here until it is researched.
- **8, the map from sky samples only — measured off the map, and failed before a render.** It is 7's missing half, researched and built in the scratch harness: each texel averages only the taps the refined selection scores as sky, and a texel with less than one such tap is filled from its neighbours. Against bars fixed before the run, the edge disagreement fell from 31–83% to 0–14%, and it passed on six of seven frames with sky. On NIR_1703 the edge band stays at 14.4%, and every disagreeing cell there traces to red crown tips the selection itself scores as sky, which the fill then spreads. What it cannot fix is what the selection holds (073, 052), so it was not rendered and it is not built.

- **9, the cloud guard, built in two forms 2026-09-27 and 2026-09-28, and taken out.** Brightness alone turned NIR_1651's and NIR_1644's cloud white and greyed the pale low clear sky on NIR_1661, NIR_3406 and NIR_3461. Brightness with colour read at the sky map's scale kept those skies blue and lost the cloud: on these frames a cloud arrives at the sky stages with MORE saturation (0.10 to 0.15 on NIR_1651) than a pale clear sky (0.07 to 0.09 on NIR_3406), and a wispy band's texel mixes cloud with the blue between the wisps. So neither brightness nor arriving saturation separates cloud from pale clear sky on these frames; whatever does is not in the colour a pixel arrives with.
  - **LABELLED 2026-09-29.** NIR_1651, NIR_1644, NIR_1661 and NIR_1827 in both forms' renders were the practice DNGs (no EXIF, no lens fix). NIR_3406 was a real NEF outside the owner's set. NIR_3461 was the owner's NEF. The comparison that rejected the refined form, 0.10 to 0.15 against 0.07 to 0.09, set a practice copy against a file outside the set.
  - **CORRECTED 2026-09-29, on the owner's seven raws.** Medians of each region as it arrives at the sky stages:
    - Dense cloud arrives LESS saturated than every clear sky measured: 0.030 to 0.069 (NIR_1703, NIR_1827, NIR_3461, NIR_3466), against clear sky from 0.116 (NIR_3698) to 0.443 (NIR_1827).
    - Thin cloud arrives as saturated as pale clear sky: NIR_1661's wisps at 0.269 and its own low clear sky at 0.268.
    - NIR_1651's bright band arrives at 0.177, between NIR_3461's clear band at 0.170 and NIR_1661's low sky at 0.268.

    So the order the rejection gave, cloud above pale clear sky, is wrong for dense cloud. Its conclusion still stands on the owner's files: the ranges overlap, so no absolute gate on arriving saturation separates cloud from pale clear sky. What the owner's files add is that the clouds that go cyan are the thin and off-neutral ones. Both forms were rendered only on the frames above. Rendering them on the owner's seven is open and not built.
- **10 as rendered, the cloud's white point under today's look (2026-09-28).** It turns the cloud white on NIR_1651 and NIR_1644. It also takes the blue out of their clear skies, the white highlights out of their foliage, and on NIR_1651 spreads red haze from the crown into the cloud. The white point is right and the look is not derived at it; 10 stays open for the two together.
  - **LABELLED 2026-09-29.** Those renders were NIR_1651 and NIR_1644 as practice DNGs, and NIR_3461 as the owner's NEF. They moved the white balance, which the 2026-09-29 trace does not, so they were not redone. On the owner's files they are open.
- **6, leave it.** Refuted by the rotation (070): read off the selection maps, at the right rotation the look's own selection takes NIR_1651's cloud and most of NIR_1644's band in, and 052's Option 1 takes in every cloud the Sky mask holds. The defect is waiting on fixes already ranked, not on a new finder.

## Built and measured, 2026-09-26

**What was built.** 019's gate read once on the pixel before the smoothing and
multiplied into the smoothing, Sky saturation and Sky depth, in the shader and in
`compileEdit` alike. It was committed as a45cf07 on the work branch and taken off
it the same day; it is on no branch. Nothing reached staging.

**What the numbers said, and why they were not the verdict.** The walk case
written for it, pixels that arrive under saturation 0.04 and are moved by more
than 2 levels with Sky depth at 0.5 on the walk's own frame, read 25.6% on the
build before and none after, and the Aerochrome walk was otherwise green; the
sky-stage walk passed. The rule did exactly what it says. The agreement walk
was not run: the tree was reset before it started, and its stale-build check
refused. The pictures are what failed it.

**Whole frames, today beside the guard, at the look's own settings and with Sky
depth at 0.5, every pair opened, then 1:1 where they differed:**

- NIR_3406 (the one speckle frame any record names; IR-SCIENCE 9l's other two
  are named nowhere): worse. The speckle is back at the look's own settings, and
  under Sky depth the sky is covered in pale dots.
- NIR_3461: mixed, and fails. Under Sky depth the cloud keeps its own white
  where today it goes grey, but a grainy pale band sits above the horizon and
  the cloud edges break into dots. At the look's own settings the red glow
  round the far pylon is fainter.
- NIR_3466: mixed, and fails the same way. The clouds and the building's pale
  face keep their value, and the low sky beside the building grains.
- NIR_1651: worse under Sky depth. The small cloud mottles and a pale band runs
  along the tree's left edge.
- NIR_1703: better under Sky depth. Today the cloud is an even grey with square
  white blocks in it; with the guard the cloud is white and the blocks are gone.
- NIR_1827: better at the look's own settings. The red haze bleeding from the
  treetops into the pale sky goes; its sun haze is unchanged; its depth key is
  0.00, so Sky depth never reaches it.
- NIR_1644 and NIR_0627: the same.

**What it shows for the next option.** The gains and the failures are all pale
pixels. What separates them is what surrounds them: the haze round NIR_1827's
trees is a pale pixel in pale sky, and a speckle dot is a pale pixel alone in
saturated blue. The sky map already carries each texel's own colour, so a rule
can read the surroundings without a width chosen on these frames. That is an
observation, not a chosen option; it is researched and written as an option
before anything is built.

## Measured before a render, 2026-09-26

**The instrument.** A scratch build that hands the app's own sky map to the
harness, opened on the eight frames at the look's own settings with lens colour
correction at 1, as this record's renders use, and again on NIR_3406, NIR_1703
and NIR_3461 with correction at its default, which is off. Nothing was
rendered: every number below is read off the map's bytes, and each frame's
sheet draws them over its export.

**Where candidate B's gate fires.** The share of bilinear cells whose four
texels disagree by more than half the smoothing's own tolerance, inside the
sky and along the selection's edge: NIR_3406 0% and 31%, NIR_1703 3% and 83%,
NIR_3461 8% and 65%, NIR_1651 0% and 35%, NIR_1827 1% and 60%, NIR_3466 0% and
54%, NIR_1644 1% and 49%. On NIR_0627, the frame with no sky, it fires on
every outline the bitmap draws. The sheets show the edge share as one band
along the treeline, the roofline, the building, the horizon and every pylon.

**The question the design left for a measurement.** Whether the inside of a
cloud can be told from the palest clear sky by its texel's colour relative to
its sky's mean, which is what the grey guard reads.

- With correction at 1, NIR_3406's clear sky has no texel below 0.43 of its
  mean and 99% of it above 0.65, while 8% of NIR_1703's sky and 16% of NIR_3461's sits between the
  guard's top (0.25) and 0.43. Read alone, that is a gap.
- With correction at its default, NIR_3406's palest twentieth reads 0.36 and
  9% of its clear sky sits in that same band: the hot-spot centre, drawn as
  a round patch where the lens put it. So on the path a reader gets without
  touching the correction, no cut on a texel's own colour spares those clouds
  from Sky depth without sparing a hot-spot centre, which is the pale centre
  inside a ring that the guard's window was set to avoid (IR-SCIENCE 4b-v).
- NIR_1703's colourless patch sits at the frame's centre, and the correction
  changed nothing on that frame. Whether it is cloud or an uncorrected hot
  spot is not established, and Option 1's gain on it is recorded as a gain on
  a colourless patch rather than on a cloud until it is.

**What it shows for the next option.** Two things, both measured. A rule that
reads the surroundings needs edge texels that carry the sky, which is a change
to how the map is built. And Sky depth's half of this record, clouds kept
white, cannot be separated by colour from an uncorrected hot spot; it turns on
whether the hot spot is corrected, not on these stages.

## Built and rendered, 2026-09-27 (option 9, first form: brightness alone)

**Labelled 2026-09-29.** The four practice files below were NIR_1651, NIR_1644,
NIR_1827 and NIR_1661, all DNGs with no EXIF and no lens fix. NIR_3406 was a
real NEF outside the owner's set. NIR_3461 was the owner's NEF. The pictures
are as they were seen, and on the owner's raws they are not yet rendered.

**What was built.** Option 9 as written, in `buildSkyMap`, the shader and
`compileEdit`, on the work branch and not committed. Nothing reached staging,
and the code was taken out on 2026-09-28 after the refined form's renders.

**How it was rendered.** Today's build (7d21a73) beside the candidate, under
the Aerochrome chip at its own settings (smoothing 1, Sky saturation as the
report printed it, Sky depth 0), with lens correction as the app opened each
file: off on the four practice files, on at 1 on NIR_3406 and NIR_3461. The
whole frame is the screen's canvas through a scratch copy of
`tools/look-sheet.mjs`, and the 1:1 crops are from the full-size export of the
same edit. Sky depth at 0.5 was not rendered.

**What the report's "Sky map" line printed.** The guard engaged on all six:

- NIR_1651: D 6.32, on; sky 0.309, cloud 0.768.
- NIR_1644: D 4.06, on; sky 0.360, cloud 0.767.
- NIR_1827: D 2.87, on; sky 0.426, cloud 0.748; its depth key is 0.
- NIR_3461: D 2.63, on; sky 0.345, cloud 0.617.
- NIR_3406: D 2.48, on; sky 0.510, cloud 0.786. Its sky has no cloud.
- NIR_1661: D 2.47, on; sky 0.290, cloud 0.498. Its sky has faint wisps and
  no cloud bank.

**What the pictures show, opened whole and at 1:1:**

- NIR_1651: better. Today the cloud is cyan; with the guard it is white, pale
  blue only where it thins, with no seam where it meets the clear sky and no
  grain. The clear sky under it and beside the tree is the same.
- NIR_1644: better. The band of cloud behind the crowns goes from cyan to
  white; the crowns' edges are the same in both, with no seam or halo; the
  dark blue above is the same.
- NIR_1827: better. The red haze in the pale sky and the red halo along the
  treetops are much fainter; the sun haze is near-white in both; no grain at
  the horizon.
- NIR_3461: mixed. The round red glows round the far pylon and beside the
  near pylon's leg are gone. But the clear sky between the cloud and the
  horizon goes from blue to a grey-blue, smooth, without grain.
- NIR_3406: worse. The lower half of its cloudless sky goes from pale blue to
  a near-white grey, and at 1:1 it carries a faint warm mottle where today's
  is even. The upper sky and the roofline are the same.
- NIR_1661: worse. The lower half of the sky goes from blue to slate grey,
  the clear sky and not only its wisps; the red halos round the treetops are
  fainter.

**What it shows.** Where a sky holds a real bank of cloud, D is 4 and more
and the guard does what it is for. Where a sky is clear and pales toward the
horizon, D read 2.47 to 2.63, just over the bar, so the bimodality test did
not hold the guard off, and the ramp between the two class means spared the
pale low sky and took its colour. That is the check this option named for a
clear sky, and it fails it on three frames. Moving the bar to where these
six frames would pass is Rejected 2.

## Built and rendered, 2026-09-28 (option 9, refined: bright × colourless)

**Labelled 2026-09-29.** The same six files as the first form, and the same
label: four practice DNGs, NIR_3406 outside the owner's set, NIR_3461 the
owner's NEF. The measurement under "Why, measured" set NIR_1651's practice copy
against NIR_3406. Rejected 9 carries the same comparison made on the owner's
seven.

**What was built.** The design now written as option 9: `SkyMap.sat`, each
texel's mean arriving saturation over its selected samples, clamped to the
display range, uploaded as an R8 texture; the weight 1 − bright ×
colourless, in the shader and `compileEdit` alike. Uncommitted, on the work
branch; nothing reached staging. Rendered as the first form was, on the same
six frames, with today's renders reused (the same build, 7d21a73) and the
first form beside them. D and the two ends are the first form's: that half
did not change.

**What the pictures show, whole and at 1:1:**

- NIR_1651: the same as today. The cloud is cyan again; the first form's
  white is gone.
- NIR_1644: the same as today. The band behind the crowns is cyan again.
- NIR_1827: the same as today, red haze and treetop halo included.
- NIR_1661: the same as today. The low clear sky keeps its blue.
- NIR_3461: the same as today. The clear band keeps its blue, and the round
  red glows by the pylons are back.
- NIR_3406: between today and the first form. The low sky is a little paler
  than today's pale blue, with none of the first form's warm mottle.

**Why, measured.** On the first form's exports, where a pixel brighter than
its photograph's cloud mean passed through all three stages untouched and so
shows its arriving colour, NIR_1651's cloud reads HSV saturation 0.10 to
0.15, the top of 019's gate (0.05 to 0.13) and above it, while NIR_3406's
pale clear sky reads 0.07 to 0.09, inside it. NIR_1644's brightest cloud
reads about 0.05, but the band is wispy and a texel's footprint mixes it
with the blue between the wisps. So the look's cloud arrives carrying more
colour than a pale clear sky does, and 019's gate, read at the map's scale,
calls the cloud coloured and the pale sky partly colourless. Across these
frames the order is the wrong way round for any absolute gate on arriving
saturation.

**What it shows.** The refined form passes the clear-sky half of the check
that decides it (NIR_1661 and NIR_3461's clear band unchanged, NIR_3406
nearly so) and fails the cloud half: NIR_1651's and NIR_1644's cloud do not
stay white. As written, the refinement undoes the first form everywhere
except NIR_3406's low sky.

## Measured and rendered, 2026-09-28 (option 10: where the cloud's colour enters)

**Labelled 2026-09-29.** NIR_1651 and NIR_1644 here were the practice DNGs, with
no lens fix, and NIR_1644 has no original in the owner's set. NIR_3406 was a
real NEF outside the owner's set. NIR_3461 was the owner's NEF with its lens
fix. The next section traces the owner's seven raws without moving anything.
The D renders move the white balance, so they were not redone.

**The instrument.** A scratch harness through today's build (d71f8e8's code),
the view at three stages per frame: A as opened, with no look; B the Aerochrome
chip with smoothing, Sky depth and Sky saturation at 0; C the chip as it ships
(smoothing 1, Sky saturation 2, or 1.8 on NIR_1644). Every sheet was opened
before a box was chosen, and each box is a region seen in it. Then a fourth
render, D: the white balance moved at A until the frame's cloud box reads
neutral (a measured Newton step on the two ratios, because a gain moves every
displayed channel), the opening balance restored, the chip chosen, and the
same offset applied to the chip's sliders, as a reader would.

**Saturation of each box, A, B, C:**

- NIR_1651: dense cloud 0.09, 0.15, 0.38; thin cloud 0.09, 0.15, 0.36; clear
  sky 0.09, 0.08, 0.33. At A all three sit at hue 172–175.
- NIR_1644: upper sky 0.20, 0.41, 0.85. Its cloud box for D is on the band's
  bright right end; its first box landed on crowns and is not used.
- NIR_3406, no cloud: low sky 0.05, 0.08, 0.13; upper sky 0.05, 0.09, 0.18.
- NIR_3461: dense cloud 0.03, 0.03, 0.03; clear sky 0.08, 0.16, 0.37.

**D, the white point from the cloud, against C:**

- NIR_1651: slider offset red −5, blue +10 (gains ×0.967, ×1.069). Clouds
  0.38 and 0.36 to 0.02; clear sky hue 204 to 4 at 0.33; foliage 0.80 to 0.96.
- NIR_1644: red −6, blue +12 (×0.961, ×1.084). Cloud band 0.33 to 0.03; upper
  sky 0.85 to 0.53; foliage 0.56 to 0.90.
- NIR_3461: red 0, blue +2. Cloud 0.03 to 0.02; clear sky 0.37 to 0.26.

**What the pictures show.** C beside D, whole frame:

- **NIR_1651.** D's cloud is white-grey with no cyan. Red haze fills the cloud
  round the crown, and runs as a band down the clear sky right of the trunk.
  The clear sky is flat slate where C's is deep blue. The tree is solid
  orange-red, with none of C's pink-white tips.
- **NIR_1644.** D's band behind the crowns is white. The sky above is dark
  slate-blue where C's is blue, and the forest is solid orange-red.
- **NIR_3461.** Nearly the same, the clear sky a little less blue.

## Traced on the owner's raws, 2026-09-29

**What was traced.** The seven owner raws this record names: NIR_1651.NEF,
NIR_1661.NEF, NIR_1703.NEF, NIR_1827.NEF, NIR_3461.NEF, NIR_3466.NEF and
NIR_3698.NEF, fetched through `tools/owner-images.mjs`. Four regions were traced
through every stage, in order, where the frame has them: a cloud, a clear sky,
foliage, and a neutral away from the sky. **No setting was moved.** Each file
was opened in the built app on a fresh page, so the lens fix matched from EXIF
opened at strength 1 on all seven. Then the Aerochrome chip was pressed. Each
box was chosen on the app's own render, as opened and under the chip, before a
number was read.

**The instrument, and what it had to reproduce.** The app's own state was
captured, not rebuilt: the params, the linear image, the fine selection and the
sky map.

- A scratch copy of the app, differing by one line that reads that state,
  rendered a canvas byte-identical to the shipped build's on all seven files,
  as opened and under the chip.
- A copy of `compileEdit` with a tap after every stage (27) ran over the
  captured state in node. It returned exactly what the shipped `compileEdit`
  returns on every traced pixel, and its first tap equalled the pre-pass
  exactly. The pre-pass was composed as `syncSkyMap` composes it.
- Every region's mean matched the app's own GPU render of the same region
  within 0.5 of a level of 255, as opened and under the chip.
- The decode stages were read from the same NEF by `readNefCfa` and
  `demosaicBinned`.

**The settings the app chose.** Restore depth raised Sky saturation to 2 on six
frames and left 1.8 on NIR_1661. Sky depth was 0 and recovery 0 on all seven.
**Black level:** the four per-site values in MakerNote 0x3D read 1008 on all
seven files. The app averages them to one number, and on these files the
average loses nothing.

**How the figures read.** Saturation is the region's median per pixel. Hue is
the hue of the region's mean. "After white balance" is camera-native linear,
before the matrix and the swap. "Arrives" is the display value entering the
three sky stages, and "leaves" is the value after them.

- **NIR_1651.NEF**, no neutral in the frame. The bright cloud band: 0.117 after
  white balance at hue 42, cyan from the swap (hue 173), arrives at 0.177,
  leaves at 0.423. Clear sky: hue 40 after white balance, arrives at 0.314,
  leaves at 0.735. Foliage sits at hue 220 after white balance.
- **NIR_1661.NEF**, no certain neutral: the pale patch between the trunks may be
  water. The wisps: 0.168 after white balance at hue 40, arrive at 0.269, leave
  at 0.619. The low pale clear sky: 0.164 at hue 40, arrives at 0.268, leaves
  at 0.606. Foliage at hue 222.
- **NIR_1703.NEF**, no neutral. Dense cloud: 0.050 at hue 38, arrives at 0.069,
  leaves at 0.086. The darkest sky, at the upper right, which may be thin
  cloud: hue 44, arrives at 0.259, leaves at 0.615.
- **NIR_1827.NEF**, no neutral. A puff: 0.036 at hue 44, arrives at 0.055,
  leaves at 0.052. The red rims, which are 061's ground, raise its upper
  quartile to 0.224. Clear sky: hue 47, arrives at 0.443, leaves at 0.947. Its
  depth key is 0.
- **NIR_3461.NEF**, no neutral that a box can hold: the pylon steel is thinner
  than one. Dense cloud: 0.020 at hue 67, arrives at 0.034, leaves at 0.035.
  The clear band: hue 51, arrives at 0.170, leaves at 0.445.
- **NIR_3466.NEF**, the neutral is the road's asphalt.
  - The cloud streak: 0.018 at hue 65, arrives at 0.030, leaves at 0.031.
  - Clear sky: hue 53, arrives at 0.171, leaves at 0.444.
  - The asphalt: 0.052 after white balance at hue 232, the foliage's side of
    the white point. It is 0.098 after the matrix and the swap. The 3x3 mixer
    takes it to 0.255, where the same mixer leaves the cloud at 0.043. The
    foliage band takes it to 0.406. It arrives red, at hue 7 and 0.549.
  - Opened at 1:1, the road is dark grey as opened and maroon under the chip.
- **NIR_3698.NEF**, no cloud in the frame and no certain neutral. Clear sky:
  0.062 at hue 44, arrives at 0.116, leaves at 0.296.

**What it shows.**

- **The cast enters at the white balance, on every frame.** After gray-world,
  cloud and clear sky sit at camera-native hue 38 to 67, and foliage and the
  asphalt at 220 to 232. Gray-world puts the frame's mean at neutral, which
  leaves the sky on one side of it and the ground on the other.
- **How far a cloud is left off neutral depends on the frame.** Dense cloud is
  left at 0.018 to 0.050. NIR_1651's bright band, in a frame the tree
  dominates, is left at 0.117, and NIR_1661's thin wisps at 0.168.
- **The look's mapping amplifies the ground side and not the sky side.** The
  swap turns the sky side cyan and the ground side magenta. The 3x3 mixer then
  multiplies NIR_3466's asphalt by 2.6 and leaves its cloud where it was.
- **The sky stages decide the cloud.**
  - Arriving under 019's gate top (0.13), a cloud is spared: 0.030 to 0.031,
    0.034 to 0.035, 0.055 to 0.052 and 0.069 to 0.086.
  - Arriving above it, a cloud is more than doubled: 0.177 to 0.423 and 0.269
    to 0.619.
  - Sky colour smoothing moved no cloud measurably on any frame.
  - Every clear sky arrives above the gate except NIR_3698's (0.116, inside
    it), and every clear sky is more than doubled.
- **The sheets show the same.**
  - NIR_1651's band is faintly cyan from the swap and vivid only after Sky
    saturation.
  - NIR_1661's wisps turn pale blue only at Sky saturation.
  - The dense clouds of NIR_1703, NIR_1827, NIR_3461 and NIR_3466 stay white
    at every stage.
  - On NIR_3461 the wires first read as red dotted lines at Sky colour
    smoothing, which is 013's and 061's ground and not this record's.

**What it does not do.** It moves nothing, so the white-point renders (option
10's D) and option 9's two forms are still unrendered on the owner's files. The
asphalt's maroon comes from the look's mapping and the foliage band, outside
the sky stages, and it is IR-SCIENCE 4d's ground, not this record's.

## Rendered on the owner's raws, 2026-09-29 (option 10's D)

**What was rendered.** NIR_1651.NEF, NIR_1661.NEF and NIR_1703.NEF, fetched
through `tools/owner-images.mjs` and opened in the app built from 438ce77's
source (built 14:10 UTC), each with its lens fix at strength 1. Two renders per frame, on a fresh page each:

- **As it ships:** the Aerochrome chip pressed at the white point the app
  chose at open (gray-world).
- **The white point from the cloud:** with the swap off, the red and blue
  white-balance sliders moved until the cloud box the trace chose reads
  R = G = B on screen, within 1.5 levels; the swap back on; then the chip. The chip is the one
  printed Aerochrome (`#lookEir`), as in the trace; a first run pressed the chip
  printed Pink IR and was discarded unrecorded. Only a reader's
  controls were used: the swap button, the white-balance sliders and the chip.

Each render was opened whole frame before any box was read, and the boxes were
read off the saved renders as pointers. As each frame opened, the cloud box read
on the full canvas matched the trace's own read of it to 0.1 of a level, so
these renders start from the state the trace measured. Read off the smaller
saved renders, the traced boxes as shipped sit within 1.2 levels of the
trace's. Boxes are fractions of the frame, left, top, right, bottom.

**Option 9's two forms were not rendered.** Neither was committed: both were
built on the work branch and taken out on 2026-09-28, so there is no build of
either to render the owner's raws through.

- **NIR_1651.NEF.** The sliders moved red 500 to 496 and blue 665 to 678.
  - As it ships: the cloud blue-white with a vivid cyan-blue band at its lower
    right, the clear sky steel blue, the tree red with pink-white tips.
  - From the cloud: the traced band goes white-grey (saturation 0.42 to 0.02).
    The rest of the cloud turns salmon-red: the upper cloud (0.35, 0.05, 0.65,
    0.15) goes from hue 202 at 0.18 to hue 10 at 0.42. The clear sky goes flat mid grey (0.74 to 0.05).
    The tree goes solid saturated red, the pink-white tips gone (0.77 to 1.00),
    and red speckle spreads from the crown into the grey sky on both sides.
- **NIR_1661.NEF.** The sliders moved red 504 to 497 and blue 659 to 678.
  - As it ships: a deep blue sky, the wisps pale blue (hue 200 at 0.62), the
    near pines white to pale pink, the trees behind them red, and the branch at
    the upper right vivid red.
  - From the cloud: the wisps go white-grey (0.62 to 0.03), and the whole sky
    goes flat grey, the deep blue at the top included (0.3, 0.02, 0.7, 0.12:
    0.92 to 0.04). The near pines go from white and pale pink to saturated red
    (0.05, 0.3, 0.3, 0.5: 0.08 to 0.96), so every tree in the frame is red.
- **NIR_1703.NEF.**
  - As it ships: the dense cloud grey-white (hue 205 at 0.09), blue only in the
    upper corners and along the dark streaks, and the trees red.
  - From the cloud, with the sliders moved red 498 to 496 and blue 670 to 675:
    the cloud box already near neutral goes grey-white (0.09 to 0.03). The blue
    in the corners and streaks mostly goes grey (the traced clear sky 0.62 to
    0.07); a dark blue patch stays at the right edge below the top corner
    (0.91, 0.10, 0.99, 0.20: hue 216 at 0.29),
    the trees go solid red, and a red fringe runs along the treetops against
    the sky.

**What it shows.**

- **The cloud box goes white on every frame** (0.42 to 0.02, 0.62 to 0.03,
  0.09 to 0.03), on slider moves of 2 to 7 down on red and 5 to 19 up on blue,
  out of 1000.
- **Only the box, on NIR_1651.** The rest of the same cloud goes salmon-red,
  further from neutral than it was, on the other side. As it ships, the two
  parts differ in display saturation (0.42 and 0.18), and a white point set on
  one does not whiten the other.
- **Every clear sky loses its blue.** Steel blue, deep blue and the corner blue
  go flat grey (0.74 to 0.05, 0.92 to 0.04, 0.62 to 0.07), all but one patch on
  NIR_1703. The trace found
  cloud and clear sky on the same side of gray-world's white point, with one
  hue; moving the white point to the cloud takes the sky with it.
- **The foliage goes solid red.** The white and pale pink tips go (NIR_1651's
  tree 0.77 to 1.00, NIR_1661's near pines 0.08 to 0.96). Red speckle spreads
  from NIR_1651's crown into the sky, and a red fringe runs along NIR_1703's
  treetops.
- **So on the owner's raws, as on the practice copies (2026-09-28), moving the
  white point alone breaks the look as it ships, and on NIR_1651 one white
  point does not neutralise the whole cloud.** That agrees with option 10's
  reading. No render here tests a look derived again at a moved white point,
  which is 066's ground, so these renders do not establish that it would hold.

## Rank

**After 015 (2026-09-26)**, which it now needs (Depends): turning the lens correction on at open changes what reaches these stages. 075 and 076 sit between (2026-09-27): they are the open path's two silent waits, share no ground with these stages, and were built beside 015. Below that, the order argued here stands.

**Option 10 (2026-09-28) moves the question upstream, not the rank.** The
cloud's cyan is the white point's, and fixing it needs the look derived again at
a neutral white point, which is 066's ground. So what waits here waits on that
derivation, and this record's cloud checks become 066's.

**Corrected 2026-09-29: upstream AND at the gate, and the rank stands.** Option
10 was measured on practice copies. On the owner's seven raws the cast does
enter at the white point, on every frame. But a cloud goes cyan only where the
white point leaves it off neutral and it arrives above 019's gate, which is two
of the six frames with cloud. So the question sits in two places: the white
point, with a look derived at it (066's ground), and a gate in these stages
that reads a cloud left off neutral as coloured. Neither changes which items
above or below this one would be redone, so the rank does not move.

**It holds no standing option as of 2026-09-26**, so what waits on it waits on
research, not on a build.
Option 8 put what is left of it in the selection rather than the map or the
stages: the one frame it failed on fails where the selection holds treetops,
which is 073's and 052's ground. The rank stands because the rotation still
needs this record's answer, whatever that answer turns out to act on.

**Below the rotation (070) from 2026-09-27, and above 052.** Argued by what
would be redone, not by severity.

- **The rotation no longer waits for this.** It did, on the prediction that
  built at the turn shown the look's selection takes NIR_1651's cloud and most
  of NIR_1644's band in, under stages that turned such cloud blue-grey on
  2026-09-26. Upright photographs already take their cloud under these stages,
  so the rotation makes turned ones behave as upright ones do and goes first;
  its renders of those two frames are this record's cloud checks.
- **052's Option 1 puts every cloud the reader's Sky mask holds under these
  stages.** Built first, it would ship blue cloud, or be judged against stages
  about to change.
- **013 and 066 tune the sky the look renders.** The guard changes what the
  smoothing and the depth do to every pale pixel in it, so either one tuned
  first would be tuned again.
- **The finder choice filed beside this (068)** compares the two finders
  through these stages, on practice frames neither finder was developed on, so
  it comes after them.

Nothing it is ranked above changes shape because of it, since it does not
change which pixels are selected. Its own acceptance renders are repeated once
070 and 052 move the selection. That is a re-render of fixed checks, and it
costs less than measuring 052's selection through stages about to change, which
is the argument that puts it above 052.

## Looked at

- NIR_1651, 2026-09-26: the whole-frame export through today's selection beside the learned selection's, one sheet, full frame; and the look's own selection at rotation 0 and at the frame's rotation, drawn in yellow over the frame as displayed, full frame side by side.
- NIR_1644, 2026-09-26: the same two sheets; the band of cloud behind the crowns in both.
- NIR_3461, 2026-09-26: the whole-frame exports through today's selection and the learned one, side by side; the near pylon at the left edge.
- NIR_1827, 2026-09-26: the whole-frame exports through today's selection and the learned one, side by side, and a difference image of the two; the haze round the sun. They nearly match; what differs lies along the treetops and in the broken cloud at the upper right.
- NIR_3406, 2026-09-26: option 1's guard beside today's build, whole-frame exports at the look's own settings and with Sky depth at 0.5; the sky at 1:1 at 2400,300 in both builds at the look's own settings.
- NIR_3461, 2026-09-26: the guard beside today's build, whole frames at both settings; at 1:1, the horizon at 1400,2450 and the cloud edge at 3700,300 with Sky depth at 0.5, and the far pylon at 4100,1100 at the look's own settings.
- NIR_3466, 2026-09-26: the guard beside today's build, whole frames at both settings.
- NIR_1703, 2026-09-26: the guard beside today's build, whole frames at both settings, and today's alone at both.
- NIR_1827, 2026-09-26: the guard beside today's build, whole frames at both settings; the tall tree at 1:1 at 1300,1000 at the look's own settings.
- NIR_1651, 2026-09-26: the guard beside today's build, whole frames at both settings.
- NIR_1644, 2026-09-26: the guard beside today's build, whole frame with Sky depth at 0.5.
- NIR_0627, 2026-09-26: the guard beside today's build, whole frame at the look's own settings.
- NIR_3406, 2026-09-26: the sky-map sheet with correction at 1 and again at its default, each texel's colour relative to its sky's mean on the left and candidate B's gate on the right, over the export; the round pale patch at the hot-spot centre with correction off, and the band along the roofline in both.
- NIR_1703, 2026-09-26: the sky-map sheet, the pale patch at the frame's centre and B's band along the whole treeline; and today's export with Sky depth at 0.5 again, the colourless patch with the guard's square white blocks in it.
- NIR_1703, 2026-09-26: option 8's cause sheet. Its 278 disagreeing edge cells are outlined by cause over the frame, and two crops are shown in colour. Every cell traces to a red-leaning seed: 62 hold one, 72 are the texel's own red sky-scored taps, and 144 were carried in by the fill. None comes from two ordinary seeds, and the fill creates none. In the left crop the selection's line runs inside a red crown and the fill carries it inward.
- NIR_3461, 2026-09-26: the sky-map sheet, the pale cloud band at upper left, and B's gate on every pylon, along the wires and along the horizon.
- NIR_1651, 2026-09-26: the sky-map sheet, the pale texels inside the treetop and B's gate on a diagonal through the cloud and round the treetop.
- NIR_1827, 2026-09-26: the sky-map sheet, B's band along the treeline.
- NIR_3466, 2026-09-26: the sky-map sheet, the pale cloud streak at upper left, and B's gate round the building and along the horizon.
- NIR_1644, 2026-09-26: the sky-map sheet, B's gate in a band down the right side.
- NIR_0627, 2026-09-26: the sky-map sheet, B's gate on every outline of the blurred background.
- NIR_3698, 2026-09-26: the reader's own export with the Sky mask's highlights pushed toward blue (above); and the app's own export at lens correction 0 and 1, whose sky centre is near-grey at 0 and blue at 1.
- NIR_1651, 2026-09-27: option 9 beside today's build, the whole frame on screen, and at 1:1 the cloud's lower edge at 1350,950 and the tree's edge against clear sky at 150,1400. The cloud white rather than cyan, the clear sky the same, no seam.
- NIR_1644, 2026-09-27: option 9 beside today's build, whole frame, and at 1:1 the crowns in the cloud at 400,800 and the band's upper edge at 1250,550. The band white rather than cyan, no seam at the crowns.
- NIR_1827, 2026-09-27: option 9 beside today's build, whole frame, and at 1:1 the treetops at 1650,1100 and the red haze at 1100,600. The red haze and the treetop halo fainter, the sun haze the same.
- NIR_3461.NEF, 2026-09-27: option 9 beside today's build, whole frame, and at 1:1 the horizon at 1400,2450, the near pylon at 4400,1500 and the far pylon at 4100,1100. The red glows gone; the low clear sky grey-blue rather than blue.
- NIR_3406, 2026-09-27: option 9 beside today's build, whole frame, and at 1:1 the low sky at 2300,1300 and the roofline at 2900,1700. The low sky near-white grey with a faint warm mottle where today's is an even pale blue.
- NIR_1661, 2026-09-27: option 9 beside today's build, whole frame, and at 1:1 the low sky among the treetops at 800,1000 and the wisps at 700,550. The lower half of the clear sky slate grey rather than blue.
- NIR_1651, 2026-09-28: the refined option 9 beside today's build and the first form, whole frame and at 1:1 at the same two places. The cloud cyan as today.
- NIR_1644, 2026-09-28: the same three, whole frame and at 1:1 at the same two places. The band behind the crowns cyan as today.
- NIR_1827, 2026-09-28: the same three, whole frame and at 1:1 at the same two places. As today, red haze included.
- NIR_1661, 2026-09-28: the same three, whole frame and at 1:1 at the same two places. The low clear sky blue as today.
- NIR_3461.NEF, 2026-09-28: the same three, whole frame and at 1:1 at the same three places. The clear band blue and the red glows back, as today.
- NIR_3406, 2026-09-28: the same three, whole frame and at 1:1 at the same two places. The low sky a little paler than today, without the first form's mottle.
- NIR_1651, 2026-09-28: the three stages side by side, as opened, the look with its sky stages off, and the look as it ships; then the look as it ships beside the same with the white point from the cloud. The cloud cyan only at C; white at D, with red haze round the crown and a slate clear sky.
- NIR_1644, 2026-09-28: the same four renders. The band behind the crowns cyan at C and white at D; the upper sky slate at D.
- NIR_3406, 2026-09-28: the three stages. The sky a faint cool grey at A, pale blue at C.
- NIR_3461.NEF, 2026-09-28: the same four renders. The dense cloud near-white at every stage and in D; the clear sky a little less blue in D.
- NIR_1651.NEF, 2026-09-29: the app's own render as opened and under the chip, turned for display with a grid, to place the boxes; then the stage sheet, fourteen stages in order with the boxes drawn. The bright band faintly cyan from the swap on and vivid cyan-blue at Sky saturation; the clear sky deep teal-blue there; the tree lilac-white after white balance, magenta through the bands and red at the HSL mixer.
- NIR_1661.NEF, 2026-09-29: the same two sheets, thirteen stages (no tone curve written). The wisps and the low pale sky grey through the mapping and pale blue only at Sky saturation; the pale patch between the trunks seen and left unboxed.
- NIR_1703.NEF, 2026-09-29: the same two sheets, fourteen stages. The dense cloud grey-white at every stage; blue only in the upper corners and the dark streaks at Sky saturation.
- NIR_1827.NEF, 2026-09-29: the same two sheets, fourteen stages. The puff white at every stage with red rims under the chip; the broad haze grey-white; blue only where the sky is clear, at Sky saturation.
- NIR_3461.NEF, 2026-09-29: the same two sheets, fourteen stages. The dense cloud white at every stage; the clear band teal at the mixer, slate at the HSL mixer and blue at Sky saturation; the wires red and dotted from Sky colour smoothing on.
- NIR_3466.NEF, 2026-09-29: the same two sheets, fourteen stages, and the road at 1:1 from the app's own render in both states: dark grey as opened, maroon with a fine red mottle under the chip. The cloud streak white at every stage.
- NIR_3698.NEF, 2026-09-29: the same two sheets, fourteen stages. The clear sky grey after white balance, grey-green through the mapping and light blue at Sky saturation, paler toward the centre.
- NIR_1651.NEF, 2026-09-29: option 10's D on the owner's raw, the Aerochrome chip at the white point chosen at open beside the same chip at the white point taken from the cloud, whole frame on screen. The traced band white-grey from the cloud; the rest of the cloud salmon-red, the clear sky flat grey, the tree solid red with red speckle spreading into the sky.
- NIR_1661.NEF, 2026-09-29: the same two renders, whole frame. From the cloud the wisps white-grey and the whole sky flat grey; every tree red, the near pines included.
- NIR_1703.NEF, 2026-09-29: the same two renders, whole frame. From the cloud the dense cloud grey-white as before, the blue corners and streaks mostly grey with a dark blue patch at the right edge, the trees solid red with a red fringe along the treetops.
