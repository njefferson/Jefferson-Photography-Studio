# 087 · Wires, pylons and roof fittings sit inside the look's sky selection, and the sky stages colour them

## Context

Seen on both devices on 2026-10-11, on production 2.65.13 and staging 2.65.14:
under Aerochrome the sky reads well until the look's selection and sky map land,
and then the wires and the pylon lattice carry red and blue splotches. A second
frame carried dots over open sky and cloud (its photograph is not known; the
frames shot with the first were rendered and looked at, below, and the dots are
069's option 12).

**What paints each defect, measured 2026-10-13 on the reader's own raws by taking
the sky stages away one at a time through the app's own sliders, every picture
opened.** On NIR_3461 (pylons and wires, 77 mm):

- **The wires go red in two steps, and both are needed.** The foliage band gives
  a wire its colour: with the band at 0 the wires are grey. The look's selection
  then holds the wire at full weight, the coarse bitmap and the refined one both
  reading 1.00 on the wire's own pixels, and the sky saturation stage multiplies
  the colour the wire arrived with. With saturation at 0 the wires fall to thin
  dark maroon. 061's reading (the foliage band paints the wire) holds on this
  build, and so does the reading that the saturation stage makes it full red.
- **The soft pink discs beside the wires** are the colour smoothing stage pulling
  clean sky toward a map texel that one tap on a wire has polluted. That is 069's
  option 12; what this record adds is that the coarse bitmap the map is weighted
  by holds the wire at weight 1, so a tap on a wire counts in full.
- **Red on one face of each pylon member and light blue on the other** is 061's
  fringe, multiplied by saturation inside a selection that holds the members.
- **On NIR_3467 (a building, no wires) the roofline carries a red glow and the
  antenna tips blue ones.** The same stage on the same kind of structure. The
  wall is a different defect (073's option 2).

**Why the selection holds them.** The coarse bitmap is grown by colour and
connectivity from a seed above the horizon search (028, 052), and a wire has the
sky's own colour on both sides of it; the refinement fits a guided filter over a
window of 12 pixels at the 1024 grid, which a wire a pixel or two wide cannot
move. A wire is not sky, and it is the shape the selection cannot see.

**Measured on the page, by the prototype of 2026-10-13** (a scratch build, never
committed): taking the thin structures out of the look's selection took the wires
from full red to thin dark maroon, nearly all the pink discs, the blue lattice
spots and the roofline glow, on NIR_3461, NIR_3463 and NIR_1703, and on NIR_3467
the roofline glow and the antenna tips; red pixels inside the unchanged selection
fell from 17,809 to 12,655 on NIR_3461 and from 15,818 to 11,833 on NIR_3463. It
left the reddened wall of NIR_3467 (4% fewer red pixels), one wire at the right
pylon's foot, and a few specks. Those are what 073's gate (option 2) takes.

## Looked up

The test that finds a line and not an edge is the top-hat transform of image
morphology: a closing (maximum, then minimum, over a structuring element) fills a
dark feature narrower than the element, an opening fills a bright one, and the
closing minus the picture, or the picture minus its opening, is large on a line and
zero on an edge or on a region wider than the element, because a long thin line
cannot contain a square element. Source: scikit-image's documentation of the black
top-hat and of attribute operators, read 2026-10-13 (one search for a route no
record holds).

Nothing outside the app was found that does this to a sky selection in particular.
The field's selections are learned (Lightroom's Select Sky), and 052 records what a
learned selection did to these frames.

## Built already

- `thinStructures` and `subtractThin` in `src/skyfine.ts`, and `buildSkySelectionFrom`
  calling both, so the sky worker, the page's fallback, the decode worker's held
  bitmaps, the strip's tiles and the export all hold the same selection. **The
  builder has five call sites in four files, and each reaches it:** the sky worker
  (`src/sky.worker.ts`, refined, the path the devices use), the client's fallback
  when no worker can be made (`src/skyClient.ts`, refined), the page's own
  refinement for a photograph the worker answered null for (`syncSkyMap` in
  `src/main.ts`), and the two sites that need the coarse bitmap alone (a call in
  `src/main.ts` and the decode worker's held masks, `src/decode.worker.ts`), which
  take the same subtraction on the coarse bitmap. The strip's tiles and the export
  read the selection those paths stored on the photograph (`skySel`), so none
  builds the old one.
- **The instrument** (session scratchpad, not in the repository): the app's own
  decoder and selection code bundled for a page and for node, fed the reader's raws
  with the shipped lens flat laid. Its selection from the head build equals the
  page's captured selection byte for byte on six frames (0 of 698,368 bytes), and
  the production function equals the page prototype byte for byte on six frames.
  Every figure under Options is read off it.

## Built and measured on the page, 2026-10-13

The build (this record's route, 073's gate and 069's map together) was rendered
through the app on the reader's raws, software graphics in a container and not a
device, the sky lane off so the page builds the selection and the map, and every
picture opened (`## Looked at`). The head build's picture of each frame is the
before. Counts are over the whole canvas of 2800 by 1864.

- **Red the saturation stage makes** (pixels the stage moved by more than 24 levels
  that read as red in the picture with the stage on, compared with the picture with
  the stage off): NIR_3461 23,191 before and 0 after; NIR_3463 22,179 and 0;
  NIR_3467 315,356 and 0; NIR_1703 49,407 and 0; NIR_1651 19,472 and 0; NIR_3460
  12,718 and 0, NIR_3462 25,520 and 0 and NIR_3466 3,242 and 0 (those three before
  counts are against the picture with both sky stages away, so they hold the smoothing
  stage's moves); NIR_3471 about 1.38 million and 0;
  NIR_3472 about 1.13 million and 0. Both routes together are measured; which of
  the two removes a given pixel was not split here, and the prototype above is the
  one place route B stood alone.
- **What the selection holds.** Pixels at half or more of the refined bitmap (the
  1024 grid): NIR_3461 473,001 before and 428,790 after (9.3% fewer); NIR_3463 6.8%;
  NIR_3467 2.2%; NIR_1703 3.6%; NIR_1651 4.8%; NIR_3460 8.0%; NIR_3462 6.3%; NIR_3466
  1.1%. **On the two willow
  frames it is 76.3% fewer on NIR_3471 and 73.0% on NIR_3472**, because the willow's
  strands and leaves are thin structure and so is most of the sky seen through them.
- **The sky away from the structures.** Pixels the selection holds fully, more than
  16 grid pixels from any place its value changed: after against before, the mean
  difference is 0.36 levels on NIR_3461, 0.38 on NIR_3463, 0.56 on NIR_1703, 0.52
  on NIR_3460, 0.67 on NIR_1651, 0.32 on NIR_3462 and 0.52 on NIR_3466, and the share
  differing by more than 12 levels is 0.195%, 0.205%, 0.000%, 0.117%, 0.002%, 0.127%
  and 0.002%. NIR_3467's 1.138% is the wall: the
  selection holds it fully, and 23,133 of its 27,399 pixels over 12 sit in six
  blocks at the wall, where 073's gate acts on purpose. Region means over open
  cloud and sky read the same before and after to within 0.3 levels on NIR_1651
  (three regions) and on NIR_1703 (four).
- **No wire is still bright red.** The red count above is 0 on every frame, and
  crops of NIR_3461's right pylon (the insulator strings, the wires across the
  sky below it, and its foot) show the wires dark and thin and the lattice
  members dark. The dotted insulator strings keep their small dark-red dots.

- **The sky worker builds this selection, and the export draws it.** On NIR_3461 and
  on NIR_1651, rendered with the sky lane on, the selection the page uploaded when the
  lane's worker built it equals the production code's own byte for byte (0 of 698,368
  bytes on each) and equals the page-built one; on NIR_3461 that same code differs from
  the head build's captured selection in 100,452 bytes, so the thin-structure removal
  reaches the worker. A 16-bit TIFF of NIR_3461 and of NIR_3467 at half scale (2800 by
  1864), saved through the Export tab, was set beside the screen's picture of the same
  size: the mean absolute difference is 2.82 levels with 9.17% of pixels over 12 on
  NIR_3461, and 4.22 with 13.88% on NIR_3467. That is the export's sharpness and not a
  colour: it is made from the full-size photograph halved, the screen from the 2800 px
  working copy. Opened at four crops each, on NIR_3461 the export shows the same as the
  screen: the wires dark maroon and thin, no pink disc, no blue lattice spot. On
  NIR_3467 the head build's glows round the antennas and dish and the red and blue
  stains on the wall are gone from the screen and absent from the export; the screen
  still carries a one pixel red edge along the white antennas and the box's top edge
  (061's ground), and the export shows it much fainter.

**What this build costs, seen in the pictures and not measured.**

- **The sky between a lattice's struts and between willow strands goes grey with
  blue blobs.** The members leave the selection with a margin, so a gap narrower
  than the margin is no longer the look's sky: on NIR_3460's left pylon legs the sky
  inside the lattice reads flat grey with scattered blue patches where it was one
  blue, and a grey haze edges each member; on NIR_3471's upper right the sky
  between strands is greyer-blue. That is 065's ground, and this build made it
  more visible, not less. At the whole-frame size it reads as steel.
- **A cirrus streak is a line.** On NIR_3471's left sky the thin pale streaks went
  from pale cyan to neutral grey with hard edges, and the leaves' edges carry a pale
  grey halo. The cost of a test that finds lines is that a thin bright cloud
  streak is one.
- **Foliage the selection used to hold reads as foliage.** The crown tips of
  NIR_1703 and the leaves of NIR_3471 and NIR_3472 no longer take the stage's
  boost: dark red with pale tips where they were scarlet. That is the intended
  reading (the stage is the sky's), and a reader who liked the scarlet loses it.

## Weighed against

- **052**, whose Option 1 (the look reads the reader's visible Sky mask) was
  rendered the same day as a prototype: it cleared a third of NIR_3467's wall and
  left every wire, disc, lattice spot and roofline glow, because the reader's mask
  holds the same wires (on NIR_3461 the look's selection is at least half over 67.7%
  of the frame and the reader's mask over 68.6%). Not built here. The selection being
  wrong is 052's ground; this removes the one kind of wrongness that reaches every
  frame with a wire, and 052's surface question stays open.
- **061**, whose reading of the red wire holds and whose remedy for it (042's stage
  for the look's own bands) is not what cleared it here: the selection no longer
  holds the wire, so the saturation stage never sees it.
- **065**, the sky between a lattice's struts: that is sky the selection misses. This
  takes the struts themselves out, and the margin it leaves takes some of the sky
  between them with them (the cost above).
- **069 and 073**, which this feeds: 069's option 12 is the map's half of the discs,
  073's option 2 is the stage's half of the red.
- **013**, whose round discs along wires are the same discs.
- **028**, sky seen between leaves: foliage is not a line and is not touched, though
  the willow's strands are, which is the cost above.

## Depends

- touches 052 — 052's Option 1 was rendered and does not reach these defects; whichever of the two changes what the selection holds moves the other's evidence.
- touches 061 — the red wire is 061's, now cleared at the selection and not at the band.
- touches 065 — the lattice's struts leave the selection; the sky between them is 065's, and the margin costs some of it.
- touches 069 — the map's weighting (069's option 12) reads the coarse bitmap this changes.
- touches 073 — the willow frames are 073's, and this takes most of the willow out of the selection while the border search is still wrong there.
- touches 013 — the discs are 013's.
- touches 028 — foliage between sky is 028's and is not thin structure.

## Options

1. **Take the thin structures out of the look's selection, in the one builder every
   path shares.** Chosen. A black and a white top-hat of luminance, square element,
   run on the 1024 px source the selection is built from; the result, spread, scales
   the refined bitmap and, by its largest value over each coarse pixel, the coarse
   bitmap. It can only take sky away. A uniform picture and a cloud edge are
   untouched; a cloud streak thinner than the element is not an edge but a line,
   and goes with the wires (the cost above).
   **The figures, and what each rests on** (all read off the instrument, on NIR_3461,
   NIR_3463, NIR_3467 and NIR_1703, 2026-10-13; the element is a plateau and the
   ramp and the spread are not, and each is named as which):
   - **Element 11 pixels at the 1024 grid (radius 5), 1.07% of the long edge.**
     The structures are already taken out at 7 pixels: that removes 84 to 88% of what
     11 removes (7.8 against 9.1% of NIR_3461's selection, 5.6 against 6.5% of
     NIR_3463's, 1.6 against 1.9% of NIR_3467's, 3.0 against 3.4% of NIR_1703's). 11
     leaves two pixels each side, about the 1.3 grid pixels the binned working copy
     shifts red against blue (061: 0.48 preview pixel). Not on an edge: from 7 to 13
     pixels the removed share moves by at most 1.9 points of the selection, and the
     smooth places touched stay at or under 0.1% (110 of 218,547 on NIR_3461 at 11
     pixels). At 17 pixels they grow to 1,614 (0.74%), ten times, which is where the
     element starts to read smooth sky as structure.
   - **Contrast ramp 0.05 to 0.12 of the frame's own 95th percentile of luminance.**
     The least settled of the four. Lowering its start to 0.03 takes out 3.3 to 3.7
     points more of the selection and touches five times as many smooth places (548 of
     218,547 on NIR_3461), so the noise floor of smooth sky lies between 0.03 and
     0.05; raising it to 0.08 to 0.2 halves what is removed (4.4% against 9.1% of
     NIR_3461's selection). Where in that range the ramp belongs is read off the
     renders: the renders above are at 0.05, and a sweep of renders at 0.08 against the
     lattice and cirrus costs is queued, not done.
   - **Spread 2 pixels.** Not a plateau either (removed share on NIR_3461 3.5% at 0,
     6.7% at 1, 9.1% at 2, 11.4% at 3). Chosen as the 1.3 pixels of the binned copy's
     softening and one pixel for the edge's own width, and rendered at 2.
   - **Scaling.** The element and the spread are scaled by the grid's longest edge over
     1024, so a photograph smaller than the grid is judged at the same fraction of its
     frame; at the 1024 grid they are 5 and 2.
2. **052's Option 1, the look reads the reader's Sky mask.** Rendered 2026-10-13 and
   not chosen here: see Weighed against.
3. **Lower the foliage band.** 061 rejected it.
4. **A gate on the saturation stage alone** (073's option 2). Chosen as well, as its
   own record's option: it reaches every red pixel the stage makes and no blue fringe
   and none of the discs, so neither stands in for the other.
5. **A learned selection.** 052 built it and took it out.
6. **A smaller margin, or a margin that keeps the sky between members** (a spread of
   0 or 1, or a selection that puts back the sky a gap holds). Not built. Spread 0
   removes 3.5% of NIR_3461's selection against 9.1% at 2, and the 1.3 pixel shift
   of the binned copy is what the margin is for (061). Whether a spread of 1 keeps
   a member's red edge out of the stages and gives the gaps back is read off a
   render, and none was made. Open; the render sweep above is where it is decided.

## Rejected

- **2, for these defects.** The reader's mask holds the same wires. It is not rejected
  as a surface (052 stays open); it is shown not to be the cause.
- **3, lowering the foliage band.** 061: it greys all foliage, and the grass loses its
  red.
- **4 alone.** It leaves the blue lattice fringes, the roofline's blue tips and the
  discs, which are not red.
- **5.** 052's boundary: the learned selection took clouds in and dulled the steel.

## Rank

**Above 069, below 070, from 2026-10-13.** It changes what the look's selection
holds, which every record below it measures: 069's acceptance renders and its map,
073's border search on the willow frames, 052's Option 1, 013's discs and 068's
comparison of finders. Built after them, each would be measured again. 070 shipped
and stays above.

## Looked at

- NIR_3461.NEF, 2026-10-13: the whole frame under Aerochrome from the head build, from the page prototype and from this build, whole frame and at 2:1 crops of the wires, the pylons, the horizon, the low sky and the right pylon's insulators, mid span and foot, with a difference picture. Head: the wires thin and bright red, soft pink discs along them and round the pylons, light-blue spots on the middle pylons. This build: the wires dark maroon and thin, the discs and blue spots gone, no red wire anywhere including the right pylon's foot; the open sky and the clouds read the same. Also 2026-10-14: the whole frame drawn with the sky lane on and its worker building the selection, which reads the same, and the export at half scale beside the screen's picture, whole frame and four 2:1 crops (the right pylon's crown with its wire, the left pylon's lattice, three wires over cloud, the foliage clump): the same dark thin wires, lattice and dark red clump in both, the export sharper.
- NIR_3463.NEF, 2026-10-13: the whole frame from the head build and from this build, crops at the right pylon's top, the wires over blue sky and the middle pylon, a horizon sheet and a difference picture. Head: bright red wires, red halos at the crossarms, brown discs on the sky beside the wires, a red line along the horizon and pink haze over the distant pylons. This build: the wires dark, the halos, discs, horizon line and haze gone, a faint neutral smudge round the middle pylon's legs.
- NIR_3467.NEF, 2026-10-13: the whole frame from the head build, from the page prototype and from this build. Head: the long wall red with grey mottle, a red glow along the roofline and down the right edge, blue tips on two antennas. Prototype: the roofline glow and the antenna tips gone; the wall as red as before. This build: the wall a muted rose-grey like the foliage band's own colour, the roofline glow and the antenna tips gone. Also 2026-10-14: 2:1 crops of the antennas at the roofline, the box's top edge, the building's right edge and the wall, the head build's screen picture beside this build's, and this build's screen picture beside its export at half scale. Head: red and cyan glows round the antennas and the dish, blue and red stains on the wall. This build: the glows and stains gone from both the screen and the export; the screen keeps a one pixel red edge along the white antennas and the box's top edge, the export shows it much fainter.
- NIR_1703.NEF, 2026-10-13: the whole frame and crops of the left crown, the two right crowns and the centre crown, from the head build and from this build. Head: scarlet crown tips with a red halo against the dark sky. This build: dark red crowns with pale tips, no halo, the cloud and sky the same; a faint lighter rim round the left crown.
- NIR_1651.NEF, 2026-10-13: the whole frame (a portrait, shown turned a quarter against the file's grid) and crops of the cloud, the treetop and the cyan band, from the head build and from this build, and the arm with the saturation stage away. Head: a pink-red blotch over the cloud beside the crown and scarlet tips at the top. This build: the blotch gone, the tips a muted rose; the cloud and the cyan band read the same. Also 2026-10-14: the whole frame drawn with the sky lane on and its worker building the selection: a muted rose crown with dark red twigs, no pink blotch in the cloud, the cloud drawn in flat patches, which is not this record's ground.
- NIR_3460.NEF, 2026-10-13: the whole frame from the head build and from this build and crops of the wires over open sky, the pylon crossarms and the left pylon's legs. Head: red wires, pink dots and discs over the open sky, blue patches at the legs. This build: wires dark, dots and discs gone, the sky smooth; inside the lattice the sky reads grey with blue patches, the cost above.
- NIR_3462.NEF, 2026-10-13: the whole frame from the head build and from this build. Head: red wires with pink dots on the right wires, red crossarms, red blotches on the pylons' tops. This build: thin dark red-brown wires, the dots and blotches gone, the open sky and cloud the same.
- NIR_3466.NEF, 2026-10-13: the whole frame from the head build and from this build, and crops of the antennas, the roofline and the right edge of the building. Head: a red outline along the roof and antennas and a pink smear off the right edge into the sky. This build: the outline dark, the smear gone, the sky beside the building clean; the wall's own rust mottle is unchanged.
- NIR_3471.NEF, 2026-10-13: the whole frame and crops of the sky, the willow, the leaves and the upper right, from the head build and from this build. Head: a scarlet block over the right willow, scarlet leaf masses at upper left and upper centre. This build: all of it dark rose and maroon, no scarlet; the open sky the same, the thin cirrus streaks at the left now grey and the leaf edges haloed pale grey, the upper right sky between strands greyer.
- NIR_3472.NEF, 2026-10-13: the whole frame from the head build and from this build. Head: scarlet strands across the lower right willow and the upper right, scarlet leaves at upper left. This build: dark rose and maroon, the open sky in the middle the same, the blue at upper right kept.
