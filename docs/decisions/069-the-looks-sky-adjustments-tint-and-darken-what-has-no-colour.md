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
- The rotation (070) declares its relation from its own side: it cannot ship
  before this.

## Depends

- touches 019 — the rule is 019's and so is the gate that carries it; this extends it to all three stages and moves where it is read, so a change to either definition moves the other.
- touches 013 — Sky colour smoothing is 013's stage and its sky half works by giving pale grain the sky's colour back; a guard that reads grain as colourless undoes it.
- touches 052 — 052 rejected a whiteness weight as a selection fix, and its Option 1 puts every cloud the Sky mask holds under these stages; this is what those clouds meet there.
- touches 023 — the Sky mask's colour grow takes cloud into the sky on purpose, and under 052 that cloud reaches these stages.
- touches 066 — a film model renders cloud white from the film's own behaviour; this rule is what its clouds must meet if it replaces these stages.
- distinct-from 061 — both are about NIR_3461's steel under the look, and they are different pixels: 061's steel arrives red from the foliage band and its discs are sky moved toward red wire, neither of which this guard reaches; this record's are the steel and cloud that arrive without colour.

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

## Rejected

- **1, one rule read on each pixel as it arrives — built 2026-09-26, and failed.** Read per pixel it cannot tell 013's speckle from a cloud, which is the risk this record named before it was built. At the look's own settings NIR_3406's sky filled with rust-coloured blotches at 1:1 where today's is even; with Sky depth at 0.5 that whole sky snowed with pale dots; NIR_3461 and NIR_3466 took grain above the horizon and dotted cloud edges; NIR_1651's small cloud mottled. Moving its gate or reading it over a width chosen on these frames is 2.
- **2, tune the constants.** Constants fitted to six frames fix those six and move on the next. 029 refused this shape for the seed, where no setting of its constants satisfied both ends, and 013 refused a per-photograph strength fitted to one positive example. Three gates reading three different states of one pixel is how this defect arose, and tuning keeps three.
- **3, take the cloud out of the selection.** 052 measured it and rejected it: it missed NIR_1651's cloud, read NIR_1827's sun haze as white and was grainy near the horizon. It also moves the wrong thing. By the purpose ruling cloud is sky and the Sky mask holds it; carving it out moves the reader's matte, coverage, corrections and five adjustments in order to fix three stages, and puts an edge through every wisp.
- **4, the infrared axis.** It is the one reading known to have kept NIR_1651's cloud white, and it stays the comparison the first render is checked against. As the rule it tests whether a pixel is sky, which is the selection's question put in the stages' place; it needs the linear axis carried past the grade to stages that run after it; a camera-rendered file has no such axis; and its +0.04 was fitted on seven frames.
- **5, the smoothing alone.** Sky depth darkens a cloud grey with no tint at all, and the film leaves it near-white. Half the rule is a second place for the other half to be forgotten.
- **7, read the surroundings at the sky map's scale — designed, measured off the map, and rejected before a render.** The texels along the selection's edge average the sky with whatever the bitmap's feather took in, so they disagree with their neighbours on every frame: 31% to 83% of the cells along the edge, against 0% to 8% inside the sky. A rule that acts where the neighbours disagree therefore acts in a band about two texels wide along every treeline, roofline and horizon, and there it hands the stages to the pixel's own reading, which is Option 1's grain in the place Option 1 grained. None of the three rules reaches the inside of a cloud wider than two texels either. What would make the surroundings readable is a map whose edge texels carry the sky's colour; that is a change to how the map is built, not to the stages, and it is not an option here until it is researched.
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

## Rank

**It holds no standing option as of 2026-09-26**, so what waits on it waits on
research, not on a build.

**First, above the rotation (070) and 052.** Argued by what would be redone,
not by severity.

- **The rotation needs it**, and says so in its own record: built at their
  rotation, the look's selection maps take NIR_1651's cloud and most of
  NIR_1644's band in, and these stages turned such cloud blue-grey on
  2026-09-26. That is a prediction from the maps; the render that confirms it
  is 070's acceptance.
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
- NIR_3461, 2026-09-26: the sky-map sheet, the pale cloud band at upper left, and B's gate on every pylon, along the wires and along the horizon.
- NIR_1651, 2026-09-26: the sky-map sheet, the pale texels inside the treetop and B's gate on a diagonal through the cloud and round the treetop.
- NIR_1827, 2026-09-26: the sky-map sheet, B's band along the treeline.
- NIR_3466, 2026-09-26: the sky-map sheet, the pale cloud streak at upper left, and B's gate round the building and along the horizon.
- NIR_1644, 2026-09-26: the sky-map sheet, B's gate in a band down the right side.
- NIR_0627, 2026-09-26: the sky-map sheet, B's gate on every outline of the blurred background.
