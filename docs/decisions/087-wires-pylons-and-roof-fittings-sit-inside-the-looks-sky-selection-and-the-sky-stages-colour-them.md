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

**Seen on staging on 2026-10-14, the build's own artefacts** (the reader tested the
build above on the iPad and judged the wires and pylons right): the sky between the
members of a pylon's lattice reads grey with blocky blue patches (NIR_3460's lower
pylon; NIR_3461 and NIR_3463 where their lattices show it), a thin cirrus streak turns
grey with a hard edge (NIR_3471) and leaf edges carry a grey fringe (NIR_3471 and the
crowns of NIR_1703). Each was traced to its cause before anything was changed
(Option 6, whose text holds the traced causes).

**Seen on 2026-10-15 on the tree with Option 6 built and not shipped** (the sheets of
2026-10-14 showed it and the reader circled the place on NIR_3471): out-of-focus leaves
in front of the sky at the upper left turn dark teal in the body, and the sky seen
through the gaps of the blurred foliage reads pale pink and stands apart from the
maroon round it. The head build (staging) had neither. The Looked at entry for
NIR_3471 of 2026-10-14 names the teal leaves and calls them "the cost stated under
Option 6", and Option 6's text states no such cost: the sentence pointed at nothing, and
the leaves were found by the first render and not weighed. Traced before anything was
changed (Option 12, whose text holds the traced cause).

**Seen on 2026-10-15 on the tree with Option 12 built and not shipped** (the sheets of the first
send, opened at 2:1): in NIR_1651's thin cloud a cyan streak with a pinkish mottle and a small
cyan patch, and in the dense blurred foliage of NIR_3471 a vivid blue spot, none of which
staging has. The crop script cuts one finished render for both halves and enlarges it pixel for
pixel, so neither the crop nor the zoom makes a difference between them. What the two are, measured stage by
stage before any further change, is under Built and measured, 2026-10-15, second send: the
cloud trace is Option 12's own cut leaving holes in thin cloud (put right by Option 17), and the
foliage spot is the sky's own colour seen through a real gap (not changed).

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

**Searched again 2026-10-14, for how a thin-structure mask keeps the gaps between
members and thin bright cloud** (one search): the pages found are the reference pages
for opening and closing by reconstruction (the Open Inventor reference,
`SoOpeningByReconstructionProcessing` and `SoClosingByReconstructionProcessing`) and the
Pylene library's documentation of opening by reconstruction. They say a top-hat by
reconstruction detects small bright (or dark) structures without the artefacts a plain
top-hat makes at the boundary concavities of large structures, and that scikit-image
carries area openings and closings for structures under an area. They say nothing about
keeping the sky in the gaps between members or keeping thin cloud, and they leave
open whether a reconstruction keeps a gap; so what was tried (Options 7 and 8) was
tried on the frames and is judged there. Hysteresis thresholding, the standard rule for
edges, was prototyped from the idea and its source was not read.

**Searched again 2026-10-15, for how a weak response is kept only where it is joined to a
strong one** (one search, for a route no record holds): the pages found are the
hysteresis-thresholding descriptions in a United States edge-tracing patent (on
patents.google.com, found by searching for hysteresis thresholding with connected
components) and an image-processing user guide's page on the same
(geodict-userguide.math2market.de). They say two thresholds split pixels into strong, weak and
background, a weak pixel is kept only if it connects to a strong one, and that labelling the
connected components of the weak-or-strong mask and keeping those that contain a strong pixel
is the usual implementation. They say nothing about a patch's size, about sky, or about what a
kept piece does to its neighbours, so the cost of keeping a whole piece that touches a strong
pixel is judged on the frames (Option 17).

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
  on NIR_1651, rendered with the sky lane on, the selection the page uploaded equals the
  production code's own byte for byte (0 of 698,368 bytes on each) and equals the
  page-built one (whether the sky worker or the page built the uploaded one in those
  renders was not read; the section of 2026-10-15 on reach, below, asked the shipped
  worker directly); on NIR_3461 that same code differs from the head build's captured
  selection in 100,452 bytes, so the thin-structure removal changes what the page
  uploads. A 16-bit TIFF of NIR_3461 and of NIR_3467 at half scale (2800 by
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

**What this build costs, seen in the pictures and not measured (2026-10-13). The first
two are put right by Option 6, 2026-10-14; the third is the intended reading.**

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

## Built and measured on the page, 2026-10-15, second send (before the change)

The same instrument as the first send (page renders, software graphics in a container, the sky
lane off), with the four arms the look's two sky stages allow: both on, saturation off,
smoothing off, both off. Staging's head build on one port and the tree (Option 12) on another;
the head's and the tree's pictures of NIR_1651 equal the first send's in every pixel (mean 0.000,
0 pixels over 12). Coordinates are the canvas's (NIR_1651 is a portrait of 1864 by 2800, shown
turned three quarters against the file's grid; NIR_3471 is 2800 by 1864). "Cyan measure" is
(green plus blue) over 2 minus red of the 7 by 7 mean. Each line reads head, then tree.

- **NIR_1651, the streak at 152,800.** Selection 0 and map weight 43; selection 254 and map
  weight 18 (its nine texels 126 0 151, 28 0 151, 0 40 0). Smoothing alone moves it by +1.5 in
  red and +0.7; saturation alone by nothing and by -20.3, +4.1, +17.8. Drawn (207.4, 221.3,
  229.4), cyan measure 17.9, and (189.2, 225.1, 245.6), cyan measure 46.1.
- **The cyan spot at 373,878.** Selection 89, weight 145: saturation alone -10.8, +2.3, +9.4,
  drawn (187.8, 212.6, 226.3), cyan 31.6. Selection 255, weight 44: smoothing alone +1.4 in
  red, saturation alone -30.1, +6.2, +25.3, drawn (168.7, 216.6, 243.8), cyan 61.5.
- **The pink place at 209,854.** Weight 227: drawn (169.5, 198.6, 215.6), cyan 37.6. Weight 150:
  smoothing alone +3.0, -0.8, -2.3 neutralises it, and the saturation stage's gate (the pixel's
  own saturation, 0.05 to 0.13) then lets almost nothing through: drawn (182.1, 195.9, 204.8),
  cyan 18.3, redder than its neighbours.
- **The right spot at 1768,822.** Selection 174, weight 190, cyan 22.6; selection 255, weight 108,
  saturation alone -21.6, +4.6, +19.2, drawn (146.7, 176.1, 192.4), cyan 37.6.
- **What that says.** At all four the tree's sky map has less weight than the head's (Option
  12's cut), and at the streak, the cyan spot and the right spot the tree's per-pixel selection
  also holds the cloud where the head's held less or none (the ramp now starts at 0.12, Option 6).
  Smoothing flattens the cloud's own chroma
  toward the sky's colour and so takes the pixel under the saturation stage's gate; saturation
  then multiplies what is left by up to 3. Where the map has no weight the cloud keeps its own
  chroma, which varies across thin cloud by a few levels either way, and saturation multiplies
  that into a streak where it points to cyan and a mottle where the map beside it is greyer.
  So it is a map hole beside a held selection, in thin cloud: not the saturation stage by
  itself (it does the same on open sky), and not smoothing by itself (it moves each place by 3
  levels or less). Blue is at 255 in 8 of the 49 pixels with saturation alone at the streak and
  19 at the cyan spot (2 and 5 as drawn), so the clip adds to the cyan; Sky colour smoothing sits
  at 1 of 1 and Sky saturation at 2 of 2 under this look, so neither has room left.
- **Why the map has holes there.** At those pixels the coarse bitmap read 255 before the removal
  and 0, 0 and 0 on the tree (the head: 0, 88, 177). The cut is the not-plain flag: a pixel over
  0.05 of the scale whose element window is at least half such pixels. Thin cloud's own texture
  reaches 0.05 to 0.14 (the windows read 58, 82 and 47 percent over 0.05 at the streak, the
  cyan spot and the right spot), so the flag finds it. The connected pieces of that flag on
  NIR_1651: 79 in all, 78 of them with a largest response under 0.25 (0.06 to 0.15; 281, 155,
  97 pixels and smaller, 1,057 grid pixels in all) and one of 322,673 pixels with a largest
  response of 1.16, which is the foliage and the hillside. On NIR_3471 the pieces are 310, 300
  of them under 0.25 (3,203 grid pixels in all), and the blurred leaves sit inside pieces of
  15,335 pixels (largest response 0.48), 14,323 (0.56) and 443,074.
- **NIR_3471's vivid blue spot at 77,433** (and the gaps at 141,337 and 42,359). Selection 0 and
  map weight 26 on the head; selection 252 and map weight 0 on the tree (its nine texels are all
  0 but one of 66), so smoothing does nothing and saturation alone moves it by -18.2, +3.8,
  +16.0 to (53.7, 86.9, 105.4). The open sky above it, at 159,312, with both stages away is
  (73.5, 86.0, 93.0), and the spot is (71.9, 83.1, 89.4): within 1.6, 2.9 and 3.6 levels; the
  stage moves the open sky by -20.8, +4.3, +18.4 on the tree, the spot by -18.2, +3.8, +16.0, and
  the pixel passes the stage's second gate (its chroma points at the sky's). The picture beneath
  is the sky's own colour seen through a real gap, and the head left it grey because its ramp
  (from 0.05) took the pixel out of the selection (response 0.128 there, selection before the
  removal 255). The gaps read the same: saturation alone -21.2, +4.4, +18.7 at 141,337 (selection
  255, weight 9) and -14.9, +3.1, +13.2 at 42,359 (selection 249, weight 39). Nothing is changed
  for it.
- **The full-resolution export.** NIR_1651 exported as a 16-bit TIFF at 3728 by 5600 from both
  builds (lane off), the press to the Ready line 191.4 s on the head and 207.9 s on the tree, one
  run each in a container's software graphics (a pointer and not a timing; step 76 times it).
  Opened at 1:1: the tree's export carries the cyan streak with its mottle and the small cyan
  speck at the same places, the head's does not, so the trace is not a screen artefact.
- **Twelve further photographs with thin cloud**, chosen by opening contact sheets of the
  reader's camera JPEGs in the shared index (every sheet opened) and rendered under Aerochrome
  from the head and from the tree: full frame at 3:1, and at 2:1 the three windows where the
  two differ most, each opened. They are NIR_1667, NIR_1649, NIR_1707, NIR_1712, NIR_1716,
  NIR_1749, NIR_1763, NIR_1739, NIR_1824, NIR_3473 and NIR_3474 (raws) and NIR_1805, a
  camera JPEG with no raw in the index. The other camera's files in the index (the DSC_
  series) hold no sky and were not rendered, and the one HEIC was not opened. **The trace is
  on the tree on NIR_1716** (cyan patches inside the cloud puffs and orange-brown rims along
  their tops, where the head's clouds are plain grey), **on NIR_1824** (cyan flecks and pale
  blue mottle inside the clouds with brown edge tints), **on NIR_1667** (more saturated, patchy
  cyan along the cloud's underside and a few orange dots, where the head is smoother) **and
  faintly on NIR_1749** (cyan mottle in the pale band of the cirrus). It is not on NIR_1649
  (34 pixels over 12 levels differ between the builds), NIR_1707, NIR_1712, NIR_1739,
  NIR_1763, NIR_1805, NIR_3473 or NIR_3474, where the tree shows what the first send cleared
  and nothing new: the grey patches of NIR_1712's sky, the halos round NIR_1739's dead
  branches and NIR_1763's crown, the dark blocky rims round NIR_1805's needles and the grey
  rectangles round NIR_1824's clouds are gone. At 3:1 none of the twelve shows it; at 2:1 the
  four do. Pixels over 12 levels between the builds: 22,153; 34; 77,686; 47,939; 22,583;
  1,129; 7,046; 126,581; 148,369; 1,875; 9,862 and 77,404, in the order named above.
- **The instrument.** The offline emulation of the two stages had been 2.85 levels from the page
  on NIR_1651 and the first send recorded that it cannot judge a turned frame. It could not
  because it read the displayed picture and the file-grid map in one orientation. With the
  quarter turn applied (gl.ts u_rot) the emulated head and tree pictures of NIR_1651 are 0.218
  and 0.218 levels from the page's with 0 pixels over 6, and NIR_3471's are 0.070 and 0.083; that
  note is withdrawn.

## Built and measured on the page, 2026-10-15, second send (after the change: Option 17)

The same instrument and the same frames, rendered from the build with Option 17 (tag fix6 in
the session's sheets), every sheet opened; the head build's pictures are the before and route
D's (Option 12) are the middle. Counts are pixels over 12 levels against the head, over the
whole canvas.

- **The selection.** Rebuilt offline from the captured sources of eight frames, route H's
  per-pixel selection equals route D's in 0 of 698,368 bytes on each (NIR_1651, NIR_3471,
  NIR_3460, NIR_3461, NIR_3463, NIR_3467, NIR_3472 and NIR_1703); the coarse bitmap has 257
  to 1,092 values higher and none lower; and the not-plain flag is above 0 on 0 pixels that
  route D lacked. Coarse pixels below half, route D then route H: NIR_1651 49,469 and
  49,112; NIR_3471 90,229 and 89,928; NIR_3460 45,769 and 44,867; NIR_3461 38,442 and 37,483;
  NIR_3463 29,340 and 28,677; NIR_3467 31,393 and 31,150; NIR_3472 91,522 and 91,315;
  NIR_1703 41,795 and 41,541.
- **The traces on NIR_1651.** At the streak (152,800) the sky map's weight is 255 in all nine
  texels where route D's was 18 (126 0 151, 28 0 151, 0 40 0), and the drawn colour is
  (203.4, 222.1, 232.8) with cyan measure 24.1 against route D's 46.1 and the head's 17.9; at
  the cyan spot (373,878) weight 251 (route D 44, head 145), drawn cyan measure 37.2 against
  61.5 and 31.6; at the pink place (209,854) weight 255 and 37.5, as the head's 37.6; at the
  right spot (1768,822) weight 255, drawn 25.5 against 37.6 and 22.6. At 2:1 the streak, the
  pinkish mottle and the cyan patch near 1766,822 are gone; **a faint light-blue smear
  remains near the cyan spot and at the left of the cloud boxes, much fainter than route
  D's, which the head does not have.** At full resolution (3728 by 5600) the export carries
  no streak and no patch, and the same faint smear is seen at the cyan spot only.
- **NIR_3471, the blurred foliage.** Unchanged from route D, which is what the selection
  check above says: the blurred leaf maroon with no teal, the gaps and the cluster with no
  pale disc standing apart, at 3:1; the cirrus edges, the leaf tips, the upper left and the
  willow's upper right at 1:1 the same as route D's and, against the head, the cirrus soft in
  both with no change visible, the leaf tips the same, and the sky between the willow's
  strands blue and smooth where the head has a pale smear. The vivid blue spot at the lower
  left (77,433) is route D's, the sky's own colour through a real gap, recorded and not
  changed.
- **The further photographs, route H against route D (pixels over 12 levels against the
  head, then against route D's picture):** NIR_1716 28,590 (D 22,583; H against D 5,115) and
  NIR_1824 158,578 (D 148,369; H against D 2,395): the cyan flecks and patches inside the
  cloud puffs are smoothed into a more even light-blue cast over the lit parts, the brown rims
  are fainter, and **the count against the head went up, not down**: route H's cloud is
  further from the head's grey than route D's, by the light-blue cast, while the flecks and
  rims that read as defects are fewer. NIR_1667 25,471 (D 22,153): the patchy cyan along the
  cloud's underside is smoother and the cloud is bluer than the head's grey, as above. NIR_1749 2,038 (D 1,129): the mottle in the cirrus's pale
  band is gone. NIR_1649 10, NIR_1707 78,807, NIR_1712 49,926, NIR_1739 128,473, NIR_1763
  7,069, NIR_1805 76,957, NIR_3473 1,924, NIR_3474 10,589: as route D.
- **What is not cleared.** The light-blue cast in the lit parts of clouds on NIR_1716,
  NIR_1824 and NIR_1667 and the faint smear on NIR_1651 are smaller than route D's and are
  still there. Their cause is not the map's hole but the per-pixel selection holding cloud
  (Option 6's ramp, from 0.12) where the head's ramp (from 0.05) held less of it, so the
  saturation stage multiplies the cloud's own chroma; clearing them is a change to the
  per-pixel selection, which is Rejected 14's route and brings back the grey cirrus, so it is
  not built, and the cost is stated. NIR_1763's dead branches carry a cyan edge that the head
  lacks, for the same reason.
- **The pylons, willow and crowns, route H against the head (every sheet opened):** NIR_3460's
  lattice blue to the members with no grey block and no rim, the far pylon's crossarms and
  the wires dark and thin; NIR_3461's and NIR_3463's lattices and legs likewise; NIR_3467's
  roofline, antennas and dish at 3:1 the same as the head's, with the one pixel red edge on
  the white antennas in both; NIR_3472's upper right with the sky between the strands even
  blue; NIR_1703's left crown straight against the sky with no halo and the leaf tips the
  same at 1:1.

## Built and measured on the page, 2026-10-15: reach, the removal taken away, and costs

The tree with Options 6, 12 and 17, in a container's software graphics and not on a device,
every picture opened; the sheets are in the session's scratch folders and not in the
repository. The head's pictures are the ones of the earlier sections.

- **The sky worker builds this selection.** The built sky worker (the bundle the page loads,
  started directly as a module worker and handed a 1024 px copy of NIR_3460's source) answered a
  refined selection that equals the tree's own code in 0 of 698,368 bytes and route D's (the first
  send of 2026-10-15) in 0, while the head's code differs from it in 90,075 (the control that must
  differ); its coarse bitmap equals the tree's code in 0 of 98,304 bytes and differs from route D's
  in 1,030 (Option 17's cut reaches the worker) and from the head's in 7,082. The refined selection
  the page itself uploaded to the card equals the worker's answer in 0 bytes. **What this does not
  say, found while reading it:** in the container's picker open of NIR_3460 the decode lane was
  posted with the selection copy switched off and returned none, so the page built the first
  selection itself, and the only sky worker that ran was the map lane (it answered the coarse and
  then the full map); the page's own selection worker was never started. `main.ts` asks for the
  copy at the head start and at the first photograph's decode, so which call posted it off was not
  read. The worker's answer above is a direct ask of the shipped bundle, handed the copy an earlier
  capture took from the decode lane in a flow that returns one; it is not the route this run's photograph
  took. The 2026-10-13 sentence that the selection "the page uploaded when the lane's worker built
  it" equals the production code's is narrowed in place to what was read.
- **The export draws it.** A 16-bit TIFF at half scale (2800 by 1864) of NIR_3460 and of NIR_3471
  through the Export tab, the sky lane on, set beside the screen's picture reduced to the same
  size: the whole-picture mean absolute difference is 3.97 levels with 13.10% of pixels over 12
  levels on NIR_3460 and 6.78 with 21.65% on NIR_3471, the press to the Ready line 225.6 s and
  176.9 s (a pointer in software graphics, not a timing). Opened at 2:1, left the screen and right the
  export. **NIR_3460:** the lattice and the far pylon read blue to the members with no grey block in
  both, the wires dark and thin over open sky in both; the screen's one pixel red and cyan edges on
  the members and its red dots along the wires and the far pylon's thin members are far fainter or
  absent in the export; the largest differences of the frame are in the foreground grass, where the
  export is smoother and softer than the screen's picture, so the sky is not where the two differ.
  **NIR_3471:** the blurred leaves at the upper left are maroon with no teal in both, the gaps in the
  dense blurred mass blue with pale pinkish spots inside the mass in both, the cluster beside the
  trunk and the cirrus the same in both with the cirrus soft-edged, the screen's red speckle on
  bright leaf tips at the lower right of the cirrus crop near-white in the export, and the willow's
  strands at the upper right dark red and thin on the screen and brown-grey and fainter in the
  export with the sky between them an even blue in both. So the export carries this selection (the
  head's grey blocks and teal leaves are in neither picture) and differs from the screen in
  sharpness and in the colour of thin edges, as it did on 2026-10-13.
- **The removal taken away.** NIR_3460 and NIR_3461 under Aerochrome from this build with its three
  bundled copies of the subtraction (the shared chunk, the sky worker and the decode worker) made
  to return the selection they were given, so the per-pixel selection and the coarse bitmap both
  skip the removal and nothing else changes; the sky lane off, so the page builds both; compared with
  this build's own render of the same frames. Pixels over 12 levels against this build: 40,825 on
  NIR_3460 and 46,267 on NIR_3461 of about 5.2 million (mean 0.51 and 0.52 levels), and the sky map's
  report differs (NIR_3460's palest texel 0.041 against 0.050). Opened whole frame and in 2:1 crops
  (the lattice, the far pylon and the wires over cloud on NIR_3460; the four windows where the pictures
  differ most on NIR_3461), this build left and the removal off right: **with the removal off the wires
  over open sky and cloud read dark and thin with the same dark red specks along them, and no bright red
  wire and no pink disc appears in any crop**; the pylons read as this build's with the members
  blue-black where this build's are dark maroon; and **the faint warm-grey glow that this build carries
  beside the outer edges of the legs of the right and the far pylons is absent** (seen at the foot of
  NIR_3460's far pylon and at NIR_3461's right pylon). The sentence in Option 6 that wires over open
  sky are kept clean by 073's second gate and 069's robust map is therefore supported by a render, on
  these two frames and for wires over open sky; the other half of what the render shows is not in the
  earlier text: on these two frames the removal's own visible work at 2:1 is the members' colour and a
  faint glow it adds, and what it does on NIR_3467's roofline and antennas, on NIR_3463 and on NIR_1703's
  crowns, where the 2026-10-13 prototype showed it, was not rendered with it off here. Whether the
  removal still earns its cost on the pylon frames is a question for those frames, queued.
- **What this build costs, added to Options 6, 12 and 17.** A faint warm-grey glow beside the outer
  edges of pylon legs at 2:1 that the removal-off picture lacks (its cause is not traced; the fading
  margin of Option 6 is the likely one, since the removal off has none); the head's broad grey rim
  round the lattice is gone and this one is a thin warm-grey edge. The lines of this record that
  say the lattice reads blue "with no rim" were written against the head's grey rim; the glow was
  seen when the same crops were set beside the removal-off render. The selection builder takes 2 to 14
  percent longer per selection than the head's, which already carried the top-hat: timed in node on
  the container's processor from the captured sources, medians of five alternating runs with a browser
  render running beside it, the head took 1,463, 1,621, 1,706 and 1,705 ms and this build 1,638, 1,661,
  1,951 and 1,733 ms on NIR_3460, NIR_3461, NIR_3471 and NIR_1651 (spreads 139 to 598 ms), the extra
  being the connected-piece labelling and the second round margin; it runs in the sky worker, so what a
  reader waits for is not this figure and step 76 measures the export. The light-blue cast in cloud
  highlights (NIR_1716, NIR_1824, NIR_1667), NIR_1763's cyan edge and NIR_3471's blue spot are under
  Option 17 and the second send above, and the willow frames still lose 24% (NIR_3471) and 17% (NIR_3472)
  of the selection the border search holds (Option 6).

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
- touches 061 — the red wire is 061's, now cleared at the selection and not at the band; and since the Outcome of 2026-10-17 the outlines on thin edges against bright sky that Aerochrome's global saturation of 2.4 makes are 061's ground, with 061 next.
- touches 065 — the lattice's struts leave the selection; the sky between them is 065's, and the margin costs some of it.
- touches 069 — the map's weighting (069's option 12) reads the coarse bitmap this changes, and is the only guard left for a thin structure whose piece never reaches a strong response (Option 17).
- touches 073 — the willow frames are 073's, and this takes most of the willow out of the selection while the border search is still wrong there.
- touches 013 — the discs are 013's.
- touches 028 — foliage between sky is 028's and is not thin structure.
- touches 088 — the sky map's weight is the coarse bitmap this record cuts, and Options 12 and 17 change what the map is built from; 088's Rejected 3 (the coarse map held inside the selection's edge) is a different cut, by the selection's edge, and is not rebuilt.
- touches 019 — the Outcome of 2026-10-17 takes Sky saturation out of Aerochrome's row, and 019's second outcome gives the sky its colour back through the global saturation and the foliage band instead; the two outcomes are one change seen from the two records.
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
     **Changed 2026-10-14 (Option 6): the ramp runs from 0.12 to 0.25.** The cause read
     on the renders: a thin cirrus streak responds at 0.054 to 0.16 of the scale
     (NIR_3471, 344 pixels read), the wings of bright members at 0.05 to 0.12, and a wire
     over open sky at 0.05 to 0.07 at this grid (NIR_3461's wires, 15 pixels), so the old
     ramp began inside what the sky itself produces. Wires over open sky are kept clean by
     073's second gate and 069's robust map, which a render with no removal at all shows
     on NIR_3460 and NIR_3461 (the section "Built and measured on the page, 2026-10-15:
     reach, the removal taken away, and costs", below). Above 0.25 lie 0.05% to 0.15% of the sky pixels
     the selection holds on the six frames with sky, and on NIR_3461's lattice 749 pixels,
     the members, whose 90th percentile is 0.29.
   - **Spread 2 pixels.** Not a plateau either (removed share on NIR_3461 3.5% at 0,
     6.7% at 1, 9.1% at 2, 11.4% at 3). Chosen as the 1.3 pixels of the binned copy's
     softening and one pixel for the edge's own width, and rendered at 2.
     **Changed 2026-10-14 (Option 6): still 2 pixels, but the margin fades.** It was a
     5 by 5 square of the largest flag near each flagged pixel, full strength at its
     edge; it is now a round margin that counts in full at the flag and fades in a
     straight line to nothing 3 pixels away (`coneSpread`). What a structure leaks into
     the pixels beside it was measured on NIR_3460, NIR_3461 and NIR_3463 as the chroma
     the picture's sky pixels differ from the sky's own colour by, against their distance
     from a member whose response is 0.25 or more: 0.048 to 0.075 at 1 to 1.5 grid
     pixels, 0.022 to 0.045 at 2 to 2.5, 0.015 to 0.037 from 3 to 8 (those bins also hold
     the neighbourhood of other members, so they overstate one member's wing), and 0.005
     beyond 12. The leak falls off with distance and does not step at an edge, which a
     square of one strength cannot say and a fading margin can. The radius of 2 is the
     record's own and was not moved.
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
6. **A margin that fades, and a ramp that starts where the sky stops producing it.**
   **Chosen and built 2026-10-14**, for the three artefacts the reader saw on staging
   (Context). In `src/skyfine.ts`: the contrast ramp runs from 0.12 to 0.25 of the
   frame's 95th percentile of luminance (it was 0.05 to 0.12), and the margin is
   `coneSpread`, round, in full at a flag and fading in a straight line to nothing 3
   grid pixels away (it was the largest flag in a 5 by 5 square). Nothing else moved:
   the element, the scaling, the five call sites and the coarse bitmap's rule (the
   largest value over each coarse pixel) is the one thing that moved a second time, see
   the next paragraph; the element, the scaling and the five call sites are as they were, so the sky worker, the page,
   the decode worker, the strip and the export still hold one selection.
   **The coarse bitmap is cut hard, found by the first render of this build on
   NIR_3467.** Built first with the coarse bitmap fading like the fine selection (each
   value times one minus the largest flag in its footprint, the footprint now carrying
   the round margin's small values), the page render of that build showed a faint
   grey-pink smudge beside the dish that the head build and the ramp-only variant did
   not have. The map's taps weigh sky by the coarse bitmap alone, and a pixel the
   structure had coloured, kept at a fraction of its weight, still pulled the map. So
   the coarse bitmap is cut to nothing wherever a flag, margin included, reaches any
   part of the coarse pixel, and left as it was elsewhere (the same cut the head made
   through its square), while the fine selection keeps the fading margin. In the
   offline emulation of the map and the sky stages (validated against page captures:
   selection 0 bytes different, picture mean within 0.27 of a level) the smudge goes
   and the lattice reads as clean as the fading coarse bitmap.
   **What each artefact is, traced and opened (measured 2026-10-14, every picture opened):**
   - **The sky between a lattice's members** is taken by the fine selection and not by
     the sky map (thinning only the map leaves the picture blue like a render with no
     removal; thinning only the fine selection gives the grey). Inside the fine
     selection the square margin is the largest part: on NIR_3460 it alone takes 56% of
     the sky the removal takes (18,555 of 32,957 pixels), 82% of them the sky's colour,
     and its edge leaves blocky islands where a few pixels of a gap survive. The ramp's
     weak band is the second part (the grey triangles in the lattice go with it), and
     the bright half is a third: it flags a pocket between two members as a bright
     feature narrower than the element.
   - **A thin cirrus streak** is the bright half at 0.054 to 0.16 of the scale, with the
     margin round it: the ramp began inside what thin cloud produces.
   - **Leaf edges** are the dark half, which in infrared finds the dark slivers of sky
     between bright leaves, with the same margin round them and isolated weak flags
     turned into 5 by 5 squares.
   The coarse bitmap the map is weighted by and the map itself are not what paints
   any of the three.
   **Costs, stated:** a wire over open sky and a thin member of low contrast no longer
   carry a margin (they respond under 0.12), so what keeps their colour clean is 073's
   second gate and 069's robust map, shown for wires over open sky by renders of NIR_3460 and
   NIR_3461 with no removal at all (the section of 2026-10-15 on reach, the removal taken away
   and costs); on the
   willow frames the removal keeps 76% (NIR_3471) and 83% (NIR_3472) of the held
   selection where it kept 24% and 27% (the willow's strands respond below 0.12 more
   often than a lattice's members do), so the willow rests on 073's gate more than
   before; and the round margin lets a
   member's cyan and red edge back into the sky stages a pixel or two sooner than the
   square did, which the renders show as a thinner pale edge, not as a defect.
7. **Hysteresis by distance:** a weak flag counts only within the margin's reach of a
   strong one. Prototyped, not built: with the strong level at the ramp's old end (0.12)
   a cirrus streak kept a beige bead where its brightest few pixels reach 0.16, and
   with the strong level at 0.25 the lattice kept grey patches in the wings. The rule is
   standard for edges (two thresholds, weak kept where joined to strong); it is the
   idea of this option that the data here do not support, because a wire over open sky
   and a thin cloud sit in the same weak band and a rule that keeps weak flags next to
   strong ones keeps the patches too.
8. **Top-hat by reconstruction**, so the flag does not mark the concavities of large
   structures (the reference pages for opening and closing by reconstruction say this
   is what it is for). A full reconstruction restores anything joined to a larger
   structure, which includes a wire running out of a pylon, so only a size-limited one
   (five steps of conditional dilation under the picture) was prototyped, with the old
   ramp and a round margin of 2. It kept 96.3% of NIR_3460's held selection against the
   margin's 94.8% and 46.0% of NIR_3471's against 35.5%, and the cirrus streak stayed
   beige, so it restored nothing the cirrus needed. Not built.
9. **A smaller square margin** (spread 1), with the old ramp. Prototyped on NIR_3460's
   lattice: it kept 94.1% of the held selection against the head's 92.0%, and the blocks
   and the grey patches the square makes stayed visible; it does not touch cirrus, which
   is the ramp's. Not built. A round margin of radius 1 with the new ramp reads as clean
   as radius 2 on the same lattice; radius 2 was kept because the leak measured above
   reaches 2 to 3 pixels, and the record's own figure was not moved.
10. **A higher ramp alone, with the square margin kept.** Prototyped on NIR_3460's
   lattice (ramp 0.12 to 0.25, square of 2): the cirrus clears, and a brown-grey band
   stays round every member and along the lattice's gaps, because that band is the
   square's. Not built.
11. **The coarse bitmap fading with the margin** (each value times one minus the largest
   flag in its footprint, the margin's small values included). Built first as part of
   Option 6 and taken out the same day, on the render of the build on NIR_3467 (the
   smudge beside the dish, Option 6).
12. **The map is built from plain sky only: the coarse bitmap is cut at structures and
   wherever the sky stops being plain, a majority of an element-sized window standing out
   by more than 0.05 of the frame's scale, and the per-pixel selection stays as Option 6
   has it.** **Chosen and built 2026-10-15**, for the teal blurred leaves and the pale
   pink discs in the gaps of blurred foliage (Context). In `src/skyfine.ts`:
   `thinFlags` returns two arrays from one top-hat, `fine` (the ramp 0.12 to 0.25 and the
   round margin, byte for byte what Option 6 builds) and `plain` (1 at a structure, a
   response over 0.12, and at a pixel over `SKY_PLAIN_LO` = 0.05 in whose window of the
   element's own size, 11 grid pixels, at least `SKY_PLAIN_SHARE` = one half of the
   pixels are over 0.05; spread by the same round margin); `subtractThin` cuts the
   coarse bitmap by `plain` and the refinement by `fine`. The first form cut at every
   pixel over 0.05 and is Option 16. **What the defect is, traced and opened
   (2026-10-15, NIR_3471):**
   - The selection before any removal already holds the whole foliage mass the horizon
     search's border leaves above it (decision 073 traced that on this frame and it was
     not retraced here): 25,952 of the 30,800 selection
     pixels in the upper left box (canvas 0,100 to 480,580) and 34,278 of 36,100 in the
     willow's upper box. Out-of-focus leaves respond to the top-hat weakly, at 0.05 to
     0.12 of the scale, in the band thin cirrus lives in. The head's ramp (from 0.05) and
     square margin took 46% of the upper left box out of the selection and 89% of the
     upper right box, which is why staging showed neither defect, and Option 6's ramp
     (from 0.12) does not: with the ramp change alone the box holds 24,336, with the margin
     change alone 17,842, with both 25,075, against the head's 14,055. What holds the
     foliage is the selection's seeding above the border; what changed is that the ramp
     stopped taking it out.
   - What paints the leaf and the discs is **the sky map and not the per-pixel
     selection**, found by exchanging the two between the builds (the emulation of the
     stages reproduces the page's picture to 0.07 and 0.11 of a level over the whole
     canvas). The tree's refinement with the head's coarse bitmap draws no teal leaf and
     no pink gap, and the head's refinement with the tree's coarse bitmap draws both (every
     tile opened; in the pink box the tree's picture is 3.85 levels from the head's, the
     one with the head's coarse bitmap 0.81 and the one with the tree's coarse bitmap 3.74).
     And inside the map it is **the smoothing stage**: with Sky saturation away the leaf
     is still teal, with Sky colour smoothing away it is not. The map's weight is 255
     over the leaves because the coarse bitmap holds them, so the smoothing stage pulls a
     leaf's chroma (small, because the leaf is dark and blurred toward the sky) toward the
     sky's colour, and the taps that land on leaves pollute the colour of the texels round
     the gaps, which pulls the pale sky seen through a gap toward the red of the leaves.
   - **Why the map and the selection want different things.** The one search made for
     this (telling defocused foreground from sky in a sky mask, 2026-10-15) found nothing
     on defocus itself. What it found is the trimap of image matting: definite
     foreground, definite background and an uncertain band between them, with the
     per-pixel opacity estimated only inside the band (Sun, Tang and Tai, Semantic Image
     Matting, CVPR 2021, arxiv.org/abs/2104.08201, which also names trees and nets as
     the foregrounds that make opacity partial; and the SkyMatte dataset page,
     csie.ntu.edu.tw/~cyy/skymatte, whose authors annotated trimaps by hand and kept
     leaves among its foreground subjects). The inference is this record's and no page
     says it: the map is an estimate of the sky's colour and wants only pixels known to
     be sky, the definite region; the per-pixel selection is the matte, and has to reach
     the sky between a lattice's members, so it must not follow every feature, which is
     what left grey between members and turned cirrus grey (Option 6). So the two are cut
     differently, and the map's cut is the strict one.
   - **The figure, and what it rests on:** 0.05 is the response the removal began at on
     2026-10-13, 6 to 12 robust sigmas above the held sky's own response (median 0.004
     to 0.007 and a robust sigma of 0.004 to 0.007 on six frames, IR-SCIENCE 9t), and
     lowering it to 0.03 touched five times as many smooth places (Option 1, the
     ramp): between 0.03 and 0.05 lies the noise floor of smooth sky, so over 0.05 the
     picture stands out from plain sky. It was not chosen on the blurred frames and
     nothing was swept. **The window and the share are structural and were not fitted:**
     the window is the element, 11 grid pixels, the scale a structure is measured at and
     the same one the thin test already uses; the share is a majority, one half, as the
     map's own median asks five of nine neighbours (decision 069, Option 12); a mass of
     leaves is a window whose majority stands out, and a wisp of cloud or a lone leaf is
     not. The margin is the round margin of Option 6, and its positive support is the 5
     by 5 square the head cut by.
   - **Costs, stated:** the map is built from less sky where the sky is not plain, 14,883
     of the 67,949 held coarse pixels cut on NIR_3460 where the tree cut 11,729 and the
     head 12,121, and 50,964 of 65,422 on NIR_3471 where the tree cut 43,105 and the
     head 43,534, so on a frame whose selection holds foliage the smoothing stage acts on
     less of the picture, as it did on staging; and the per-pixel selection still holds
     the blurred leaves (the second gate of decision 073 keeps their red), so an
     isolated blurred leaf in open sky whose window is mostly flat is not cut and keeps
     the sky map's pull (not found on the eight frames, which is not the same as absent);
     and **thin cloud still shows a trace of the holes the first form made**: on NIR_1651's
     cloud (portrait picture) one small cyan blotch near canvas 1766,822 and a faint cyan
     streak with a pinkish mottle at the left of canvas 120,680, visible at 2:1 and
     not at the whole-frame size, which the head and Option 6 do not have. They are fewer
     and fainter than the first form's rings; the map's weight there differs from Option 6's
     in 273 of 10,880 texels and its chroma by more than 8 bytes in 38. They were measured on
     the page on 2026-10-15 (second send) and are Option 17's ground; the first form's
     rings, the same defect at every flagged pixel, are Option 16's.
13. **A test of colour distance to the sky's own colour, in the selection's builder.**
   Measured 2026-10-15 and not built. The pixels the ramp change releases (the weak
   responses, which are where blurred leaves and thin cirrus sit) are no further from the
   sky's colour than the sky is: the distance of the guide's red and blue shares from the
   median of the seeds', in the grow's own spreads, reads 0.20, 1.06, 2.39 at the 10th,
   50th and 90th percentile for sky never flagged and 0.18, 0.66, 1.87 for the released
   pixels over NIR_3471 (the upper left leaf component alone: median 1.02), and the
   offset along the axis from the sky's colour to neutral overlaps as well (sky -0.064,
   -0.002, 0.058; released leaf pixels -0.030, 0.012, 0.063). The look separates leaves
   from sky by multiplying a raw difference that is smaller than the sky's own variation
   across the frame, so a test in the selection's colour has nothing to read.
14. **The ramp back to 0.05 in the per-pixel selection.** Not built: it brings back what
   Option 6 took out. With the ramp's weak band in the refinement the sky inside a
   lattice and between willow strands reads grey with blue patches and thin cirrus grey
   (Option 6, the traced causes), and it does nothing for the map except by the same
   cut Option 12 makes.
15. **A guard on the Sky colour smoothing stage, so a low-chroma pixel the map holds is
   not pulled to the sky's colour.** Not built, and not rebuilt: it is a rule read on each
   pixel as it arrives, which decision 069 built, failed and rejected (its Rejected 1, and
   9 and 11 for the readings that followed), and it would change the shader and
   `compileEdit` together, which the agreement walk holds to one picture.
16. **The first form of Option 12: the coarse bitmap cut at every pixel over 0.05.** Built
   and rendered through the page on all eight frames on 2026-10-15, every picture
   opened, and not kept. It cleared the teal leaf and the pale pink discs and left the
   lattices, the willow and the wall as good as Option 6 has them, and it left holes in
   thin cloud: on NIR_1651 salmon rings and cyan patches in the cloud (canvas boxes
   1520,800 and 120,680 of the portrait picture) which neither the head nor the tree
   has. A weak flag in cloud cut the coarse bitmap in a texel or two, the weight there
   went to 0, and the smoothing stage pulls the cloud round the hole toward the sky's
   colour and leaves the hole as it arrived. It cut 15,020 of NIR_1651's 62,669 held
   coarse pixels where the tree cut 12,911 and the form kept cuts 13,683. The offline
   emulation of the stages read NIR_1651's emulated picture 2.85 levels from the page's,
   which is why only the page showed it; the emulation lacked the quarter turn, and with it
   the emulation reads that frame to 0.2 of a level (Built and measured, second send).
17. **The map's cut keeps only the not-plain regions that hold a definite structure:
   hysteresis by connection, with `SKY_THIN_HI` as the strong level.** **Chosen and built
   2026-10-15 (second send)**, for the cyan streaks, the pink mottle and the rimmed cyan
   patches in thin cloud that Option 12's cut leaves (Built and measured, second send). In
   `src/skyfine.ts`, `thinFlags` forms the not-plain flag as before, labels its connected
   pieces (8 neighbours, before the margin), keeps a piece only if some pixel in it has a
   response of `SKY_THIN_HI` or more, clears every other piece, and then spreads what is left
   by the same round margin (`keepStrongPieces`). `fine`, the per-pixel selection, is not
   touched, so the lattices, the wires, the cirrus and the leaf edges Option 6 cleared are as
   Option 6 has them.
   - **What it rests on.** The rule is the standard one for choosing between a weak and a
     strong response: hysteresis thresholding keeps a weak response only where it connects to a
     strong one, and labelling connected components is its usual implementation (the one
     search made, under Looked up). No figure is new: `SKY_THIN_HI` is the level Option 6
     chose as above anything thin cloud reached on the frames read and under what a lattice's
     members reach, and the pieces measured here agree with it: the connected pieces of thin
     cloud on NIR_1651 peak at 0.06 to 0.15, those of NIR_3471's cirrus at 0.07 to 0.20, and
     the foliage masses and the pylons' main pieces sit inside pieces that peak at 0.48 to
     1.24 (NIR_3471's 15,335 and 14,323 pixel pieces 0.48 and 0.56, NIR_3460's lattice 0.69,
     NIR_3461's 0.65). It was not chosen on the frames that judge the result and nothing was
     swept.
   - **What the emulation said before the build** (validated against the page, 0.218 levels on
     NIR_1651 and 0.083 on NIR_3471): on NIR_1651 1 piece kept and 78 dropped (1,057 grid
     pixels), coarse pixels below half 49,469 on the tree and 49,112 with this route, the
     streak and the mottle gone from the picture; on NIR_3471 10 kept and 300 dropped (3,203
     grid pixels), coarse pixels below half 90,229 and 89,928, the blurred leaf, the gaps and
     the cluster the same picture as the tree's (mean 0.095 levels from it, 812 pixels over
     12). What it releases is cloud, not what carries the blurred foliage.
   - **Costs, stated:** a mass of blurred foliage in which no response reaches
     `SKY_THIN_HI` anywhere along its connected flagged pixels is no longer cut, and the map
     takes its colour again (Found 74.4's isolated leaf, widened from a lone leaf to a mass
     with no sharp edge in it); on the frames read every blurred leaf mass sits inside a
     piece that reaches 0.48 or more, which is the frames read and not a guarantee. A thin
     structure of low contrast (a response of 0.12 to 0.25 with nothing stronger joined to
     it) no longer cuts the coarse bitmap, where Option 6 cut it: on the pylon frames that is
     194 of NIR_3460's 199 pieces (2,849 grid pixels) and 398 of NIR_3461's 400 (2,132), the
     small ones (wire crossings, insulators, a far pylon's thin members) and none of the main
     lattice; the robust map of decision 069 is what keeps a polluted tap out, and the wires
     are read on the page. And `plain` is no longer above 0 wherever `fine`
     is above 0 (the contract in `thinFlags` says so).
18. **Raising the cut's amplitude level (`SKY_PLAIN_LO`) so thin cloud's texture is not
   flagged.** Reasoned from the numbers above and not rendered, not built: thin cloud's
   pieces respond 0.06 to 0.15 and Option 12 measured out-of-focus leaves at 0.05 to 0.12, so
   no level under 0.15 lets cloud through and keeps the leaves, and a level over 0.15 is
   Option 17's strong level without its connection test.
19. **A size limit on the pieces cut.** Reasoned and not rendered, not built: it separates
   by area (the cloud pieces here are 13 to 281 grid pixels, the foliage pieces 15,335 and
   more), but the limit would be read off these frames (decision 069, Rejected 2), a blurred
   leaf's size on the picture depends on the lens and the distance, and a leaf further from
   the camera would fall under it.
20. **Following the map's cut in the per-pixel selection**, so the saturation stage and the
   smoothing stage agree at a hole. It is Option 14's route and Rejected 14's cost: the cut
   is the weak band's, and carrying it into the selection brings back the grey between a
   lattice's members and the grey cirrus.

## Rejected

- **2, for these defects.** The reader's mask holds the same wires. It is not rejected
  as a surface (052 stays open); it is shown not to be the cause.
- **3, lowering the foliage band.** 061: it greys all foliage, and the grass loses its
  red.
- **4 alone.** It leaves the blue lattice fringes, the roofline's blue tips and the
  discs, which are not red.
- **5.** 052's boundary: the learned selection took clouds in and dulled the steel.
- **7, hysteresis by distance.** A wire over open sky (0.05 to 0.07) and a thin cloud
  (0.054 to 0.16) sit in one weak band, so a rule that keeps weak flags next to strong
  ones keeps a bead in the cirrus (strong at 0.12) or the lattice's grey patches
  (strong at 0.25). It is the standard rule for edges and these frames do not support
  it.
- **8, top-hat by reconstruction.** A full reconstruction restores a wire joined to a
  pylon, so the wires the removal is for would not be flagged where they leave a
  larger structure; the size-limited one restored nothing the cirrus needed.
- **9, a smaller square margin.** The square's edge is what makes the blocks, at any
  size.
- **10, a higher ramp with the square kept.** It clears the cirrus and leaves the
  brown-grey band the square puts round every member.
- **11, a fading coarse bitmap.** A coarse pixel kept at a fraction of its weight beside
  a structure still lets the colour the structure gave it into the sky map; the cut is
  hard in the coarse bitmap and fading only in the fine selection.
- **13, colour distance to the sky's own colour in the builder.** The weak responses are
  no further from the sky's colour than the sky is from itself across a frame, so the
  test has nothing to read; the look's red against blue is a raw difference smaller than
  the sky's own variation, multiplied afterwards.
- **14, the ramp back to 0.05 in the per-pixel selection.** It brings back the grey between
  a lattice's members and the grey cirrus, which Option 6 was built to remove; the map is
  where the leaves are cut, and that is Option 12.
- **15, a guard on the smoothing stage.** A rule read on each pixel as it arrives is
  decision 069's Rejected 1, built and failed; the teal is the smoothing stage's, and the
  remedy is that the map it reads is not built from what is not sky.
- **16, the coarse bitmap cut at every pixel over 0.05.** It leaves holes in thin cloud and
  the smoothing stage draws them as patches; the cut has to be where the sky is not
  plain over a window, not at each feature.
- **18, a higher amplitude level for the cut.** No level under 0.15 separates thin cloud from
  out-of-focus leaves (they respond 0.06 to 0.15 and 0.05 to 0.12), and a level over 0.15 is
  Option 17's strong level without its connection test.
- **19, a size limit on the pieces cut.** It would be read off these frames (069's Rejected
  2), and a blurred leaf's size on the picture follows the lens and the distance.
- **20, the map's cut carried into the per-pixel selection.** It is Option 14, Rejected 14:
  grey between a lattice's members and grey cirrus.

## Rank

**Above 069, below 070, from 2026-10-13.** It changes what the look's selection
holds, which every record below it measures: 069's acceptance renders and its map,
073's border search on the willow frames, 052's Option 1, 013's discs and 068's
comparison of finders. Built after them, each would be measured again. 070 shipped
and stays above.

**Nothing left to rank, from 2026-10-17.** The Outcome section below takes the stages this
record cleaned up after out of Aerochrome, so the defects of its Context are gone at their
cause. The code of the removal (route B, Options 6, 12 and 17) stays in `src/skyfine.ts`
switched off by `SKY_THIN_REMOVAL`, for a later plan. The roadmap item stays on the open list,
declared internal and saying what survives, only because archiving it today would trip the
notes page's freshness check (`tools/notes-check.mjs`); it moves to the archive when that
check's window can take it.

## Outcome, 2026-10-17: Aerochrome's Sky saturation and the corrections that cleaned up after it are taken out

**What was decided, and why.** The owner's direction of 2026-10-16 (California time):
under Aerochrome the sky takes the colour Aerochrome's own mapping gives it and no more,
every other look renders as it did before the work of 2026-10-14 (step 60's commit), and
nothing is built. The reason is the trace below: every sky stage of this record, of 013,
069, 073 and 088 is a correction, and the stage they correct is Sky saturation.

**The trace, measured on NIR_1716's sky (the pixels the page's own refined selection holds
at one half or more, 46 percent of the frame; colour strength is the mean over them of the
largest channel minus the smallest, 0 to 255; the landed build's own pages, sky lane off,
software graphics in a container).** The opened frame, no look: 12.6. Aerochrome's own
mapping with both sky stages at 0: 17.7. The smoothing added alone: 17.7, the same, its
mean colour unchanged to a tenth. Sky saturation added alone: 38.5, 2.2 times the mapping
and 20.7 levels of colour the mapping does not give (2.2 times in the lit cloud, 2.9 times in
the dark sky at the upper right, which is the 1 + 2 the stage can give). Both: 38.3. Outside
the selection, foliage and ground: 64.19 with both stages off and 64.38 with both on, so the
foliage's red does not depend on them. Pink IR on the same frame: its own mapping 43.1, then
Restore depth's top-up of Sky saturation to 0.63 on this frame, 68.8.

**What was taken out.** In `src/main.ts` Aerochrome's row carries Sky saturation 0 and Sky
colour smoothing 0, and `liftSky: false`, the field Bold Pink carries (078), because
`solveLift` raises Sky saturation toward 2 from the look's own value wherever it is under the
reference. In `src/pipeline.ts` `SKY_SAT_SECOND_GATE` is false, read by `compileEdit` and by
`gl.ts` `setSkyMap`, so 073's second gate reads nothing; and `syncSkyMap` builds a map only for
Sky colour smoothing or Sky depth, as it did before 2026-10-14, so Sky saturation alone, from a
reader's slider or from Restore depth under another look, asks for no map, no coarse map, no kept
map and no refining line. In `src/skyfine.ts` `SKY_THIN_REMOVAL` is false, read by
`buildSkySelectionFrom`, so the selection is again byte for byte the one of the build before
2026-10-14: route B, Options 6, 12 and 17 do not act. `PREVIEW_PIPELINE` moves to 97, since a
cached picture of Aerochrome is now wrong. Nothing was deleted and nothing was added to a look.

**What stays in the source, switched off, and is named for a later plan.** `thinFlags`,
`thinStructures`, `subtractThin`, `keepStrongPieces` and `coneSpread` in `src/skyfine.ts`;
`skyReference`, `skyRefWeight`, the `u_skyRef` uniform and the shader's `gw` in `src/pipeline.ts`
and `src/gl.ts`; the robust map (`weightedMedian`, `medianChromaOver3x3`), the coarse map and the
sky map lane's two answers (`src/skymap.ts`, `src/sky.worker.ts`, `src/skyClient.ts`), the kept map
database (`src/maskstore.ts`) and the refining line (`#skyRefine`) in `src/main.ts`, `ir.html` and
`src/style.css`. A reader who moves the Sky colour smoothing or the Sky depth slider by hand still
meets all of them, as before. No built-in look reads them.

**What was measured after, on page renders (software graphics in a container, not a device).**
Pink IR on NIR_3460 and NIR_1716, the build before 2026-10-14 (the commit before step 60's work,
built from its own worktree) against this build, compared pixel for pixel: 0 differing pixels on
both, largest difference 0; the same build rendered twice reads 0 as well (the instrument is
steady), and the landed build against the earlier one reads 47 percent of the frame differing,
0.77 percent by more than 12 levels, largest 54 (the instrument sees a difference). Aerochrome on
NIR_1716 from this build equals the landed build's arm with both sky stages at 0 in every pixel:
colour strength 17.7 in the sky, 21.1 in the lit cloud. Under Pink IR the landed build's
refining line came up 43.8 s after the press on NIR_1716 and was gone 63.6 s after it, with a
coarse map at 22.6 s and the full map at 43.8 s, and the strip's first tile moved 15.8 s after
the press; this build asked for no map (the report's Sky map line reads "none built"), the line
never came up in 150 s, and the strip's first tile moved 6.0 s after the press.
The dark third of NIR_1716's sky, chroma residual against the 25 pixel mean: 2.1 in this build,
1.7 in the landed build, 5.2 with Sky saturation alone and 5.9 under the landed build's Pink IR:
the speckle 013's smoothing was built to clean does not show without the stage that amplified it
(the 1:1 crop was opened). The wires on NIR_3460 and NIR_3461 are thin and dark red-brown or dark
red and none is bright red; the faint warm smear beside NIR_3461's middle pylon and the grey
blocks and blue patches in the lattices are absent; NIR_3471's blurred leaves carry no teal and no
pale disc stands out of the sky between them; NIR_1716's lit cloud is white with a slight cool
tint where it was pale cyan, with no fleck or rim at 1:1.

**What it costs, and what turned out wrong.** At the end of this removal Aerochrome's sky was
what its mapping gave: slate grey and white cloud where it had been teal and blue (17.7 against
38.3 of colour on NIR_1716). Sky saturation 2 was part of the look's fit to the film references
that took the six-raw mean from 6.82 to 4.92 (the look table's own comment), so the look moved
away from those numbers on purpose; record 066's film model stays unbuilt. What turned out wrong
is the order the work went in: the stage raised the sky's colour past the file's, and seven
corrections were then added one after another, each of which made the next defect (the
smoothing's discs, the second gate, the removal's grey blocks, route H's cyan streaks, the coarse
map's halo, the refining line), where the fix was to stop the stage.

**What followed, the same day: the grey sky was given its colour back by the look's own mapping,
and no stage of this record came back.** The grey was the global saturation (3.0 taken down to 1.0
is a factor of 0.29 by itself), not a missing sky stage, so Aerochrome's row now carries a global
saturation of 2.4 and a foliage band of 1.3 and nothing else of the mapping moved (record 019,
second outcome: the sky reads 40.65 of colour on NIR_1716 against Pink IR's own 43.07, its foliage
stays red in hue, Pink IR is unchanged pixel for pixel). Its named cost is not this record's
removal and is not undone by it: a cloud that is pale blue and not white, ground at 1.5 to 1.7
times its colour, and a vivid blue outline with a red rim on thin dark edges against bright sky
(NIR_3471's leaves and willow, NIR_3460's lattice members), which is the file's red and blue not
lining up at thin edges, scaled with the sky's colour. Those outlines are record 061's ground and
that record is next. The wires, the pylon gaps and the blurred leaves of this record's Context
stay as the removal left them: the wires thin and dark, the sky between the members one colour,
no teal leaf.

## Looked at

- NIR_3461.NEF, 2026-10-13: the whole frame under Aerochrome from the head build, from the page prototype and from this build, whole frame and at 2:1 crops of the wires, the pylons, the horizon, the low sky and the right pylon's insulators, mid span and foot, with a difference picture. Head: the wires thin and bright red, soft pink discs along them and round the pylons, light-blue spots on the middle pylons. This build: the wires dark maroon and thin, the discs and blue spots gone, no red wire anywhere including the right pylon's foot; the open sky and the clouds read the same. Also 2026-10-14: the whole frame drawn with the sky lane on and its worker building the selection, which reads the same, and the export at half scale beside the screen's picture, whole frame and four 2:1 crops (the right pylon's crown with its wire, the left pylon's lattice, three wires over cloud, the foliage clump): the same dark thin wires, lattice and dark red clump in both, the export sharper. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the left pylon's lattice and crossarm, the right pylon's crossarms and insulators, and the wires over blue sky. Head: a blue patch with a hard edge in the cloud beside the crossarm and a grey blur right of the lower crossarm. This build: both gone, the sky inside and round the tower in its own colour, the wires over open sky dark and thin with no disc. Also 2026-10-15, the build of Option 12 beside staging's head, page renders: the whole frame and a 2:1 crop of the left pylon's legs and the pylons behind it (canvas 1000,1080). Head: a grey haze round the left pylon's legs and members and between the crossarms. This build: the sky round and inside the pylon blue, the members with a thin light-blue edge where the head had grey, the wires dark and thin. Also 2026-10-15 (the section on reach, the removal taken away and costs), this build beside the same build with the removal off, page renders with the sky lane off: the whole frame with the removal off and four 2:1 windows where the two pictures differ most (canvas 1000,1200; 2040,1040; 2080,800; 1600,1200). The wires over open sky and cloud are dark and thin with the same dark red specks along them in both, with no bright red wire and no pink disc; the members read blue-black with the removal off where this build's are dark maroon; a faint warm-grey glow beside the right pylon's legs is in this build and absent with the removal off. Also 2026-10-17 (the Outcome section), page renders of the landed build beside the build with Aerochrome's sky stages and their corrections taken out, sky lane off: the whole frame at half size and 2:1 crops of the wires over cloud (canvas 360,200), the middle pylon (900,800) and the far right pylon (2060,520). The sky is one flat grey where the landed build's is blue, with no patch, rim or block round any member; the wires are thin and dark red in both; the faint warm-grey smear beside the middle pylon's lower leg that the landed build carries is absent; the foliage and the grass are the same red in both.
- NIR_3463.NEF, 2026-10-13: the whole frame from the head build and from this build, crops at the right pylon's top, the wires over blue sky and the middle pylon, a horizon sheet and a difference picture. Head: bright red wires, red halos at the crossarms, brown discs on the sky beside the wires, a red line along the horizon and pink haze over the distant pylons. This build: the wires dark, the halos, discs, horizon line and haze gone, a faint neutral smudge round the middle pylon's legs. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the left pylon's upper crossarm, its lower lattice and the right pylon. Head: grey patches and a halo between the crossarm's members, blocky blue-grey patches in the lower lattice. This build: the sky between the members dark or blue as it is round them, no patches, the wires dark and thin. Also 2026-10-15, the build of Option 12 beside staging's head, page renders: the whole frame and 2:1 crops of the left pylon and the middle pylons (canvas 1040,1280). Head: a grey haze round the left pylon's legs and over the middle pylon's top. This build: the haze gone, the sky blue to the members, dark red specks along some members in both.
- NIR_3467.NEF, 2026-10-13: the whole frame from the head build, from the page prototype and from this build. Head: the long wall red with grey mottle, a red glow along the roofline and down the right edge, blue tips on two antennas. Prototype: the roofline glow and the antenna tips gone; the wall as red as before. This build: the wall a muted rose-grey like the foliage band's own colour, the roofline glow and the antenna tips gone. Also 2026-10-14: 2:1 crops of the antennas at the roofline, the box's top edge, the building's right edge and the wall, the head build's screen picture beside this build's, and this build's screen picture beside its export at half scale. Head: red and cyan glows round the antennas and the dish, blue and red stains on the wall. This build: the glows and stains gone from both the screen and the export; the screen keeps a one pixel red edge along the white antennas and the box's top edge, the export shows it much fainter. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the antennas at the roofline, the right antennas with the wall and the dish with the tree and the stair. The same in both: the one pixel red edge on the white antennas stays, the wall's stains are absent, and there is no grey-pink smudge beside the dish (a build whose coarse bitmap faded had one, Option 11). Also 2026-10-15, the build of Option 12 beside staging's head, page renders: the whole frame and a 2:1 crop of the wall (canvas 1080,800). The same in both: the wall's mottle and its blue vertical lines at the crop; the antennas and the dish were not in this crop and were not opened on this build.
- NIR_1703.NEF, 2026-10-13: the whole frame and crops of the left crown, the two right crowns and the centre crown, from the head build and from this build. Head: scarlet crown tips with a red halo against the dark sky. This build: dark red crowns with pale tips, no halo, the cloud and sky the same; a faint lighter rim round the left crown. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the left crown with the dead snag, the tall tree's top and the centre crown. Head: a pale grey halo round the left crown and the snag against the dark sky. This build: no halo, the crown straight against the sky; the tall tree and the centre crown read the same. Also 2026-10-15, the build of Option 12 beside staging's head, page renders: the whole frame, a 2:1 crop of the left crown and the snag (canvas 120,960) and the same at 1:1. Head: a pale grey halo round the left crown and the snag. This build: no halo, the crown and the snag straight against the sky, the leaf tips unchanged at 1:1.
- NIR_1651.NEF, 2026-10-13: the whole frame (a portrait, shown turned a quarter against the file's grid) and crops of the cloud, the treetop and the cyan band, from the head build and from this build, and the arm with the saturation stage away. Head: a pink-red blotch over the cloud beside the crown and scarlet tips at the top. This build: the blotch gone, the tips a muted rose; the cloud and the cyan band read the same. Also 2026-10-14: the whole frame drawn with the sky lane on and its worker building the selection: a muted rose crown with dark red twigs, no pink blotch in the cloud, the cloud drawn in flat patches, which is not this record's ground. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the crown's right edge, the cloud edge and the treetop. The grey rim on the leaf tips against the dark sky is gone; the thin warm fringe at the tree's right edge is in both, and the cloud and the treetop read the same. Also 2026-10-15, page renders of staging's head, Option 6's tree, the first form of Option 12 and the build of Option 12 (Option 16 and its costs): the whole frame, and 2:1 crops of the cloud at canvas 120,680 and 1520,800 and of the crown's edge at 1040,840, with the edge at 1:1 (canvas 1350,950). The first form's cloud carried salmon rings and cyan patches that neither the head nor Option 6 had; this build's cloud has one small cyan blotch near 1766,822 and a faint cyan streak with a pinkish mottle at the left of the 120,680 box, and reads smooth at the whole-frame size; the crown's edge reads the same at 1:1 and the crown shows no grey rim.
- NIR_3460.NEF, 2026-10-13: the whole frame from the head build and from this build and crops of the wires over open sky, the pylon crossarms and the left pylon's legs. Head: red wires, pink dots and discs over the open sky, blue patches at the legs. This build: wires dark, dots and discs gone, the sky smooth; inside the lattice the sky reads grey with blue patches, the cost above. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the lower pylon's lattice, the upper pylon with its crossarm and insulator, the far pylon's crossarms and wires, the leaves at the left edge and the cloud. Head: grey sky with blocky blue patches inside the lattice and a grey rim round the tower's legs, a grey halo round the leaf crowns on dark sky. This build: the lattice's sky blue throughout with no patches and no rim, the leaves crisp on the dark sky, the wires dark and thin, the cloud the same. Also 2026-10-15, the build of Option 12 beside staging's head, page renders (and the emulated pictures of the first form's route): the whole frame and 2:1 crops of the lower pylon's lattice (canvas 480,960) and the far pylon's crossarms (1680,960). Head: a grey rim round the legs and blocky blue patches inside the lattice. This build: the lattice's sky blue to the members with no patch and no rim, a thin light-blue edge on the members, the wires dark and thin. Also 2026-10-15 (the section on reach, the removal taken away and costs): the build's half-scale export beside the screen's picture reduced to the same size, sky lane on, 2:1 crops of the lattice (canvas 480,960), the far pylon (1680,960), the wires over cloud (1900,500) and the grass where the two differ most (720,1360). The sky blue to the members with no grey block and the wires dark and thin in both; the screen's one pixel red and cyan edges and its red dots along the wires and the far pylon's members far fainter or absent in the export; the grass smoother and softer in the export. And this build beside the same build with the removal off, page renders with the sky lane off: the whole frame and 2:1 crops of the lattice, the far pylon, the wires over cloud and the windows where the two differ most (canvas 480,960; 1720,1040; 480,120). The wires dark and thin with the same dark red specks in both, no bright red wire; the members blue-black with the removal off where this build's are dark maroon; the faint warm-grey glow at the foot of the far pylon and beside the right pylon's legs is in this build and absent with the removal off. Also 2026-10-17 (the Outcome section), the landed build beside the build with Aerochrome's sky stages and their corrections taken out, page renders with the sky lane off: the whole frame at half size and 2:1 crops of the lower pylon's lattice (canvas 300,640), the far pylon's crossarms (1780,640) and the wires over cloud (2300,420). The sky inside the lattice and round the members is one grey, with no grey block, blue patch or rim; the wires are thin dark red-brown where the landed build's are black with a thin red line, and none is bright red; the far pylon's members read the same in both; the foliage at the left edge is the same red.
- NIR_3462.NEF, 2026-10-13: the whole frame from the head build and from this build. Head: red wires with pink dots on the right wires, red crossarms, red blotches on the pylons' tops. This build: thin dark red-brown wires, the dots and blotches gone, the open sky and cloud the same.
- NIR_3466.NEF, 2026-10-13: the whole frame from the head build and from this build, and crops of the antennas, the roofline and the right edge of the building. Head: a red outline along the roof and antennas and a pink smear off the right edge into the sky. This build: the outline dark, the smear gone, the sky beside the building clean; the wall's own rust mottle is unchanged.
- NIR_3471.NEF, 2026-10-13: the whole frame and crops of the sky, the willow, the leaves and the upper right, from the head build and from this build. Head: a scarlet block over the right willow, scarlet leaf masses at upper left and upper centre. This build: all of it dark rose and maroon, no scarlet; the open sky the same, the thin cirrus streaks at the left now grey and the leaf edges haloed pale grey, the upper right sky between strands greyer. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the thin cirrus at the left, the leaves at the upper left and the top, the willow's upper right sky between strands and the willow over the bright sky, and a 4:1 crop of the out-of-focus leaves at the upper left. Head: grey cirrus with hard edges, a pale grey halo on the leaves, grey sky between strands. This build: the cirrus cooler and soft-edged, no leaf halo, the sky between strands blue; the out-of-focus leaves at the upper left read dark teal in the body with maroon edges where the head read grey-maroon (Option 6's build; the sentence that called it a stated cost pointed at nothing, Context). Also 2026-10-15, page renders of staging's head, Option 6's tree and the first form and the second form of Option 12, and emulated pictures of the same: the whole frame, 3:1 crops of the blurred leaf (canvas 90,180), the gap discs (20,310) and the cluster (240,200), and 1:1 crops of the upper left (0,100), the willow's upper right (1580,0), the leaf tips (100,0), the cirrus (760,600 and 900,900) and the cluster (180,140). The build of Option 12 against the head: the blurred leaf maroon with the sky between the leaves blue, no teal leaf; the gaps in the foliage blue at the top and pale grey-pink in the dense mass as the head has them, no disc standing out; the cluster's sky bluer than the head's grey and with no pale disc; at 1:1 the leaves are crisp and the willow's sky between strands blue and smooth where the head has a pale smear; the cirrus edges are soft in both and no change is visible at 1:1 at the two cirrus boxes; the leaf tips read the same in both and the trunk's pale rim is in both. The head's picture was rendered again from its own build on 8133 and equals the earlier capture in every pixel. Also 2026-10-15 (the section on reach, the removal taken away and costs): this build's half-scale export beside the screen's picture reduced to the same size, sky lane on, 2:1 crops of the upper left leaves (canvas 0,100), the gaps in the dense blurred mass (0,300), the cluster beside the trunk (240,200), the cirrus (760,600) and the willow's upper right (1580,0). The blurred leaves maroon with no teal in both; the gaps blue with pale pinkish spots inside the mass in both; the cluster and the cirrus the same in both with the cirrus soft-edged, the screen's red speckle on the bright leaf tips at the lower right of the cirrus crop near-white in the export; the willow's strands dark red and thin on the screen and brown-grey and fainter in the export, the sky between them an even blue in both. Also 2026-10-17 (the Outcome section), the landed build beside the build with Aerochrome's sky stages and their corrections taken out, page renders with the sky lane off: the whole frame at half size and 2:1 crops of the out-of-focus leaves at the upper left (canvas 0,80) and of the sky seen through the foliage above the dense mass (520,0 and 1000,0). The blurred leaves are maroon in both with no teal leaf; the sky through the gaps and between the willow's strands is an even pale grey-blue in the new build and an even blue in the landed one, with no pale disc standing out; the pale pinkish spots inside the dense mass are in both.
- NIR_1667.NEF, 2026-10-15 (second send), page renders of staging's head, Option 12 and Option 17: the whole frame at 3:1 and the three 2:1 windows where the builds differ most (canvas 1840,320; 2480,760; 1600,1600). Head: smooth grey and blue cloud. Option 12: patchy cyan along the cloud's underside with a few orange dots. Option 17: the cloud smoother, bluer than the head's grey.
- NIR_1649.NEF, same: the whole frame and the largest window (1320,1440). The builds differ in 10 pixels over 12 levels and the sheets read the same.
- NIR_1707.NEF, same: the whole frame and the two largest windows (160,400; 1000,160). The grey patches of the head's sky are gone in both of the others, and the cloud reads the same in them.
- NIR_1712.NEF, same: the whole frame and the two largest windows (320,320; 1240,360). As NIR_1707.
- NIR_1716.NEF, same: the whole frame and the three largest windows (1760,0; 1720,240; 1440,0) for Option 12 and (1680,0 and the same two) for Option 17 against Option 12. Head: plain grey puffs. Option 12: cyan patches inside the puffs and orange-brown rims along their tops. Option 17: fewer and fainter patches and rims, the lit parts of the puffs with a light-blue cast the head lacks. Also 2026-10-17 (the Outcome section), the landed build beside the build with Aerochrome's sky stages and their corrections taken out, page renders with the sky lane off: the whole frame at half size, 2:1 crops of the lit cloud (canvas 980,560) and the clouds at the upper right (1440,0), and 1:1 crops of the lit cloud (980,520, 900 by 640) and of the dark sky (1500,60, 700 by 500). The lit cloud is white with a slight cool tint where the landed build's is pale cyan, with no patch, fleck or rim at 1:1; the dark sky is a smooth neutral grey with the cloud's detail kept and no speckle, where the landed build's is teal; a faint warm tint along some cloud edges in the upper right crop is the mapping's own, since the new build's picture equals the landed build's with both sky stages at 0 in every pixel.
- NIR_1749.NEF, same: the whole frame and the largest two windows (1520,320; 1200,280). Option 12: cyan mottle in the pale band of the cirrus. Option 17: the band plain.
- NIR_1763.NEF, same: the whole frame and the three largest windows (1840,400; 1440,200; 1040,280). The crown's halo gone in both; the dead branches carry a cyan edge in both that the head lacks.
- NIR_1739.NEF, same: the whole frame and the two largest windows (1840,520; 1720,760). The halos round the dead branches are gone in both; nothing new.
- NIR_1824.NEF, same: the whole frame and the three largest windows (1120,40; 600,120; 1440,120). Head: grey rectangles round the clouds. Option 12: the rectangles gone, cyan flecks and pale blue mottle in the clouds with brown edge tints. Option 17: the flecks smoothed into a light-blue cast over the lit parts, the brown tints fainter.
- NIR_3473.NEF, same: the whole frame and the two largest windows (1000,0 and 1120,240). The builds differ in 1,875 pixels over 12 levels and the sheets read the same.
- NIR_3474.NEF, same: the whole frame and the two largest windows (1320,0 and 1480,240). The builds differ in 9,862 pixels over 12 levels and the sheets read the same.
- NIR_1805.JPG, same (a camera JPEG, with no raw in the index): the whole frame and the two largest windows (360,1280; 400,1520). The dark blocky rims round the needles in the head are gone in both of the others.
- NIR_3472.NEF, 2026-10-13: the whole frame from the head build and from this build. Head: scarlet strands across the lower right willow and the upper right, scarlet leaves at upper left. This build: dark rose and maroon, the open sky in the middle the same, the blue at upper right kept. Also 2026-10-14, Option 6's build beside staging's head: the whole frame and 2:1 crops of the cirrus, the leaves and the upper right. The cirrus softer and cooler, the leaves the same, the grey-pink patches in the upper right sky between strands gone. Also 2026-10-15, the build of Option 12 beside staging's head, page renders: the whole frame and a 2:1 crop of the upper right (canvas 2040,40). Head: grey halos and blocky grey patches round the blurred branches and between the strands. This build: the sky between the strands even blue, the blurred branches' rings blue-grey, the thin strands dark, the leaves the same.
