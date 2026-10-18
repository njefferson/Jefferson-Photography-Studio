# 088 · The look's sky map lands seconds after the picture, and is built again on every visit

## Context

Under Aerochrome the picture is drawn first and the look's sky follows it: the sky
colour smoothing, the depth key and the saturation stage's second gate (073's
option 2) all read the **sky map**, a 128 texel wide map of the sky's own colour
that the sky map lane (a worker) builds from the open photograph after the picture
is on screen. Until it lands the sky is drawn without it, and then the picture
changes under the reader's eyes. The lane builds it again on every visit to a
photograph and on every edit that moves a field it reads.

**Where the wait is, read from the app's own report on the devices, 2026-10-11**
(the Last switch line and the hold watch; the reader's iPad and PC, not the
container): the iPad on 2.65.12 waited 450 ms for the selection, 50 ms for the
second lift solve and **5.2 s for the sky map**; on 2.65.13, 508 ms, 51 ms and
**7.6 s**; the PC (Firefox, 12 cores) on 2.65.13 waited 405 ms for the selection and
38 ms for the lift, and its hold watch listed the sky map as a stage in force for
more than 10.55 s. So the map is the longest part by about ten times on the iPad
and by more than twenty on the PC. The 45 s selection wait the container shows is
software graphics holding the page's first draw, and is not a device figure.

**What the lane's time follows** (measured 2026-10-13 in the container, software
graphics, so a ratio and not a device time): the lane's build time follows the
texel count at about 2 to 3 ms a texel at every width tried. On NIR_3461 the lane
built a 32 wide map in 2.4 s and the full 128 wide one in 23.3 s (0.10); on NIR_1651 16
wide took 0.5 s, 48 wide 4.3 s, 64 wide 7.2 s, 96 wide 13.7 s and the full map 19 to 21 s.
Scaled to the devices' 5.2 to 7.6 s, a 32 wide map is about 0.5 to 0.8 s. Not measured
on a device.

**Why a first, coarse map had a halo, on the build before 087, 069's option 12 and
073** (rendered and opened 2026-10-13 on NIR_1651 and NIR_3461, by writing the page's
own coarse and full maps into the renderer and drawing again): the coarse map's texel
is four times the full one's footprint, so the colour a polluted texel carries reaches
87 px of a 2800 px frame into clean cloud. The pollution is a red tuft of foliage at
the crown's top that the look's selection holds as sky (052 and 073's ground), and,
beside pylons, a tap that lands on a wire or a lattice member at the selection's full
weight (069's option 12). Filling the texels that hold no sky sample, the first
guess, changes no picture and no number. What the coarse map of the built tree
shows is under "Built and measured on the page, 2026-10-14".

**Why the map was kept in a database of its own.** A first form of the kept map put a
second object store in `ips-masks` and moved that database from version 1 to 2.
Exercised with two pages of two builds in one browser context, a tab still running
the older build could not open the database at the version it asks for
(VersionError); its saved-mask list stayed drawn from before, pressing a saved mask
said "That saved mask is no longer on this device" and adding one said "This device
refused to store it", both false, until the tab was reloaded. Nothing was lost on disk.

## Looked up

- A masked, renormalised average that drops a cell with no valid support rather than
  filling it is the usual choice for estimates over irregular holes (Liu et al.,
  "Image Inpainting for Irregular Holes Using Partial Convolutions", ECCV 2018, read
  2026-10-13). That is what `buildSkyMap` already does for a texel's colour, so the
  remaining pollution is in what the selection counts as valid, not in the averaging.
- A median is the simple robust choice for small blocks, and a scale estimate needs
  enough samples: four taps cannot carry a spread of their own, and the neighbouring
  texels are the data that can (the Hampel test and robust statistics pages, read
  2026-10-13). That is 069's option 12, which this record's coarse map is built with.
- IndexedDB refuses an open at a version lower than the stored one; a database kept
  at version 1 and a second one for the kept maps cannot disagree.

## Built already

- **The coarse map first** (`SKY_MAP_COARSE_W` 32 in `src/skymap.ts`, the `coarse` job
  in `src/sky.worker.ts`, `onCoarse` in `src/skyClient.ts` and `syncSkyMap` in
  `src/main.ts`): for the first map of a photograph's selection the lane builds and
  posts the 32 wide map, the page uploads it and draws, and the 128 wide one replaces it
  when it lands. A later edit keeps the map on screen until its own lands. The coarse
  and the full map are one function at two widths, so they carry the same robust
  estimate (069's option 12) and the same unchanged weight and depth bytes.
- **The map kept per photograph**, in a database of its own: `ips-skymaps`, one store
  `maps`, one row per photograph keyed by its stamp (name, byte length and a strided
  digest), holding the full map and the whole text of what it was built from, capped at
  160 rows and the oldest out; `ips-masks` stays at version 1. The text holds the edit's
  whole map key (nulls left out so a session round trip does not change it), the pipeline
  version, the lens profiles' stamp, the lens flat, the size and pitch, the selection's
  turn and a digest of every byte of the selection's bitmap, so a row answers only an
  ask whose text is equal to the last character. A map is neither kept nor read when the
  edit holds a mask or a warp.
- **The hint** (`keptSkyMapHint`, localStorage): tells the page at once whether the store
  will hold the map. The store is read first only then, because a store answer arrives
  as an event and a page held by its own draw delivers it late: read in front of every
  first map it moved the lane's ask from 1.0 s to 45.6 s after the press in the container.
- **The strip waits only for the reader** (`draw(byReader)` in `src/main.ts`). The
  activity clock the stale-tile redraw pass waits on is stamped by every draw; the lane's
  coarse and full landings and a kept map read back from the store now draw with
  `draw(false)` and do not stamp it, so a map that lands seconds after a look was pressed
  does not push the strip's redraw back by the lane's build time. Added 2026-10-14 after
  the tile truth walk went red (Built and measured, below).
- **The report**: the Last switch line says where the first sky map came from and when
  the coarse and the full maps landed, after the ask and after the picture, with the
  lane's own build clock for each; the Holds line counts the kept maps; the Sky map line
  says which direction the saturation stage's second gate read and from how many texels.
- Step 25's candidate gates A, B and C on the saturation stage are taken out of the tree
  and `SkyMap.luma` with them (073's route replaces B with a reference a wall cannot
  pollute).

## Built and measured on the page, 2026-10-14

The build as it stands in the tree (087's selection, 073's second gate and 069's
option 12 together with this record's coarse map) was served and rendered through the
app on the reader's raws, software graphics in a container and not a device. The
coarse map was held on screen by keeping the lane's full answer from the page
(`harness/step60-capture.mjs` in the session scratchpad, mode coarse; its own
made-to-fail reading is a throwaway worker posting a coarse, a full and a selection
answer, which delivers two of three with the hold and three of three without it), so the
picture opened is the one drawn with the 32 wide map alone: the uploaded map read
32 by 21 and the full answer was held back once, on both frames. Every picture named
below was opened (`## Looked at`).

- **The halo on NIR_1651, where the earlier coarse picture carried it.** The earlier
  coarse picture (the build with the head's estimator and selection) showed scarlet
  tips at the crown's top with a pink wash across the cloud beside them, and a broad
  warm brown fringe along the tree's right edge against the dark sky. The coarse
  picture of this build shows the crown's tips muted rose and dark red, clean cloud
  around them with no pink wash, and a thin warm fringe still along the right edge.
  The full-map picture of this build carries the same thin fringe, so what is left
  there is not the coarse map's. What took the crown-top halo away cannot be split
  between 087's selection and 069's estimator here, because both changed under it.
- **The discs beside the pylons on NIR_3461, the worst case before.** The earlier
  coarse picture drew soft orange-brown discs about a coarse texel across beside the
  middle and the right pylons, and red wires and lattice members. This build's coarse
  picture draws the wires dark and thin and the lattice dark and pale grey, with no
  disc and no red. The full picture of this build reads the same, with a pale grey haze
  hugging the lattice's legs that is a little wider than in the coarse one; that haze is
  087's cost and not the coarse map's.
- **What the second gate reads from the coarse map.** On NIR_3461 the sky colour
  direction read 139 degrees from 136 texels of the coarse map and 139 degrees from
  2,651 of the full one; on NIR_1651, 135 degrees from 268 texels of the coarse map and
  139 degrees from 4,491 of the full one (the report's Sky map line on each run). The
  direction agrees within 4 degrees, against a ramp that starts at 30.
- **What the map costs a look that has no smoothing and no depth.** 073's second gate
  reads the map, so the map is built whenever the saturation is up, and the head build
  built none for a look such as Pink IR, whose lift sets the saturation to 0.77. On the six
  practice raws, after the Pink IR press, the tile truth walk went red on this build and
  green on the head (D1, D2 and C3): the strip's redraw began 10 to 12 s after the press on
  this build against 4 to 5 s on the head. The page's workers recorded from outside show why:
  the lane was asked for a map at once, its coarse answer reached the page 3.2 s later and
  the full one 6.3 s later, and the strip's decode jobs began at 9.6 s. In the container's
  software graphics each landing is a full draw of about 3 s that holds the main thread, and
  the redraw pass started when they were done; the lane's own build was 20 ms and 198 ms.
  Stamping the activity clock was not the cause here (the same 10 to 12 s with
  `draw(false)`), and it would have been the larger share on a device, where a draw costs
  milliseconds and the lane 5 to 7 s. The walk now waits for the redraw to begin and prints
  how long it took (head 0.5 s after its call, this build 6.3 s; the toggle 3.6 s and 3.5 s),
  and a plant that freezes the strip's tiles makes seven of its checks fail, so the wait
  cannot pass on nothing. The cost on a device is not measured.
- **Not measured here.** The time on a device. Neither frame's run caught the coarse
  picture standing still before the full map landed, so the container cannot show the
  coarse picture as a state a reader sees for long; the wait on the iPad and the PC
  stays read from the reader's reports and scaled by the lane's ratio. The Last switch
  line on NIR_3461 and NIR_1651, beside the head build's, is the reader's run on
  staging.

## Weighed against

- **069**, whose option 12 is the estimator the coarse and the full map are built with,
  and whose acceptance renders read the map this record changes when it lands.
- **087**, whose selection weights the map's taps, and which takes the wire a tap would
  have landed on out of the weight.
- **073**, whose route D reads the sky colour direction off this map, so the map is now
  built whenever the saturation is up and not only for smoothing or depth.
- **052**, which would put the look's selection in front of the reader; the selection
  wait is the part of the wait this record does not shorten.
- **the sky map lane**'s own staging entry of 2026-10-06 and its list of later work:
  nothing in it names a record, so this one is new.

## Depends

- touches 069 — the estimator in `buildSkyMap` is 069's option 12, and a change to it moves what the coarse map shows.
- touches 087 — the selection and the coarse bitmap the map is weighted by come from the shared builder 087 changes.
- touches 073 — route D reads the map's colour direction, and the map is built when the saturation is up.
- touches 052 — the selection's wait is 052's side of the same gap between the picture and the sky.

## Options

1. **The coarse map first, 32 wide, with the robust estimate; the map kept per
   photograph in its own database; the hint and the report lines.** Chosen. It takes the
   longest wait on the devices (the map, 5.2 to 7.6 s on the iPad, over 10.55 s on the PC)
   to about a tenth of the lane's time for a first visit, and to a store read for a
   return visit, and it changes no selection, shader or export line, because both read the
   map's bytes.
   **The figures, and what each rests on:**
   - **32 texels wide.** The lane's time follows the texel count at 2 to 3 ms a texel
     over 16, 32, 48, 64, 96 and 128 wide, so 32 wide costs 0.10 of the full build on
     NIR_3461 (2.4 s against 23.3 s) and about 0.06 to 0.09 by the texel count. A wider
     map lands later in proportion (48 wide at 0.22 to 0.26, 64 wide at 0.34 to 0.35, 96
     wide at 0.72 of the full time) and shrinks the halo in proportion to the texel without
     taking it to nothing before 96. The width was a choice among these ratios and not a
     plateau; with the robust estimate and 087's selection the coarse picture showed no
     crown halo and no disc on the two frames rendered, so the halo is no longer the
     width's to settle (Built and measured on the page, 2026-10-14).
   - **160 rows kept.** A map is 128 by 85 by 4 bytes, about 43 KB, so the cap holds under
     7 MB. A choice of size, not a measured limit; the oldest goes first.
2. **A bigger coarse map, 48, 64 or 96 wide.** Not built: see Rejected.
3. **The coarse map held inside the selection's own edge** (the weight and depth key of a
   texel whose weight byte is under 250 set to 0 in the coarse build only). Not built as the
   remedy: see Rejected. It was the fallback if the robust estimate did not clear the halo,
   and it is not needed: the built coarse picture shows no crown halo and no disc.
4. **Fill the texels that hold no sky sample from their nearest neighbour.** Refuted.
5. **Keep the kept map in the masks database at version 2.** Built first and taken out.
6. **Read the store in front of every first map.** Built first and taken out.
7. **Keep the selection per photograph as well.** Not built: see Rejected.
8. **For a look with no smoothing and no depth, build only the coarse map.** Not built:
   see Rejected.

## Rejected

- **2, a wider coarse map.** It trades the halo for time at the rate the texel count sets,
  and a halo that comes from a tuft the selection holds is not the texel's to clear.
- **3, holding the coarse map inside the selection's edge.** It clears the crown's halo only
  where the polluting thing sits at the selection's edge. A pylon lies wholly inside the
  selection, so the discs beside it stay, and it leaves straight texel edges where the partly
  sky texels were switched off. It is a stand-in for a picture the full map replaces within
  seconds, and the estimator clears more of the same pollution at its cause.
- **4, filling empty texels.** Rendered on NIR_1651: fill and coarse look the same, the
  haze is as visible, and the zone numbers do not move (the sky band's target chroma 0.0308
  in both). The empty texels are not the cause.
- **5, the second store in `ips-masks`.** A tab on the older build loses its saved-mask list
  and its saving, with two messages that are false, until it is reloaded; a database of its own
  costs one more open and nothing else.
- **6, the store read first.** The lane's ask moved from 1.0 s to 45.6 s after the press
  in the container, because the page held by its own draw delivers the store's answer late.
  A photograph that was not kept would have started its map later than before the change.
- **7, keeping the selection.** On the devices the selection wait is about 0.5 s against the
  map's 5.2 to 7.6 s, so it is the smaller part, and the 45 s the container shows is not a
  device figure. It is 052's side, and it is not shortened here.
- **8, the coarse map alone for a gate-only build.** The second gate's direction read 139
  degrees from 136 texels of the coarse map and 139 from 2,651 of the full on NIR_3461 (135
  and 139 on NIR_1651), so the coarse map would do for it, and it would save one of the two
  landing draws. It halves the extra draw and does not remove it, and a coarse map kept
  under the same key as a full one would be served to a later ask that wants the full map
  (the key leaves smoothing and depth out), so it needs its own key first. Left for a
  device measurement of the cost above to say whether it is worth that.

## Rank

**Above 069, below 087, from 2026-10-13.** 069's acceptance renders and its estimator read
the map this record changes when it lands, and 087's selection is what the map is weighted
by; built after both, each would be measured again against a map that arrived late.

**Nothing left to rank, from 2026-10-17.** See the Outcome below. The roadmap item stays on the
open list, declared internal and saying what survives, only because archiving it today would trip
the notes page's freshness check (`tools/notes-check.mjs`); it moves to the archive when that
check's window can take it.

## Outcome, 2026-10-17: built and shipped, and no built-in look asks for a sky map any more

**What landed.** The coarse map first, the kept map in its own database (`ips-skymaps`), the lane's
two answers and the report's Last switch and Sky map lines landed in 4ac12b5, which production
serves from 2026-10-14 (version 2.65.15). In the container, software graphics and not a device, the
lane built the 32 wide map in 2.4 s against 23.3 s for the full one on NIR_3461, and the coarse
picture of the built tree carried no crown halo and no disc beside the pylons (Built and measured on
the page, 2026-10-14). The devices' waits (5.2 s and 7.6 s on the iPad, over 10.55 s on the PC) were
read before the change and were never re-read after it: no pass on a device recorded a result.

**What changed under it.** The record existed to shorten a wait that Aerochrome, and Pink IR through
its lift, imposed by asking for a map. Record 087's Outcome of 2026-10-17 took Sky saturation and Sky
colour smoothing out of Aerochrome's row, Restore depth stopped topping the sky up under it, and
the saturation stage's second gate was switched off (`SKY_SAT_SECOND_GATE` in `src/pipeline.ts`), so
no built-in look asks the sky lane for a map. The two landing draws that the cost recorded above
(the strip's redraw held back after a look press) was made of no longer happen under Pink IR: on one
frame in the container the strip's first tile moved 6.0 s after the press with no map asked, where
the build that still asked for one took 15.8 s (record 087's Outcome).

**What survives.** The map still lands coarse first and is kept per photograph for a reader who moves
the Sky colour smoothing or the Sky depth slider by hand, with the refining line saying so, and the
lane, the kept database and the robust estimate are used there unchanged. Option 8 (the coarse map
alone for a look with no smoothing and no depth) has no look left to serve and is not needed. No
code of this record was deleted.

## Looked at

- NIR_1651.NEF, 2026-10-14: the whole frame (a portrait) from the run with the lane on and the full map, and 960 by 860 crops at the crown's top and at the tree's right edge against the dark sky, of three pictures: the earlier build's coarse picture, this build's coarse picture with the full answer held back, and this build's full picture. Earlier coarse: scarlet tips at the crown's top, a pink wash in the cloud beside them, a broad warm brown fringe along the right edge. This build's coarse: muted rose and dark red tips, clean cloud, a thin warm fringe at the right edge that the full picture carries too. The clouds read as flat patches in all three, which is not this record's ground.
- NIR_3461.NEF, 2026-10-14: the whole frame from the run with the lane on and the full map, and 560 by 560 crops at the middle pylon and at the right pylon's crossarms, of the earlier build's coarse picture, this build's coarse picture with the full answer held back, and this build's full picture. Earlier coarse: red wires and lattice members, soft orange-brown discs beside the middle and right pylons. This build's coarse: wires dark and thin, lattice dark and pale grey, no disc, no red; the full picture the same, with the pale grey haze at the lattice's legs a little wider.
