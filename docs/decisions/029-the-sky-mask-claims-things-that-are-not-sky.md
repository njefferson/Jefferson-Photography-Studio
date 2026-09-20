# 029 · The Sky mask claims things that are not sky

## Context

Measured 2026-09-20 on the shipped build, on practice frames that were never in
the acceptance corpus:

- **NIR_0627 — 76.4% of the frame selected as sky.** It is a MACRO of a flower
  spike. There is no sky in it at all. The coarse seed alone claims 58% before
  the grow runs.
- **NIR_0172 — 47.4%.** A wooden playhouse under trees. The selection covers the
  playhouse's walls, roof and railings, the tyre swing, and the grass in front
  of it. The only real sky is a band at top right.
- **canopy — 19.5%.** A road under a canopy.

Against the three frames the acceptance walk has been using — NIR_0063 18.3%,
NIR_1644 37.4%, NIR_1651 51.0% — every one of which has a large obvious sky, so
covering MORE always read as improvement.

**This is the defect a reader actually meets.** Any sky adjustment on such a
frame lands on a building, a lawn and a flower stem. It is not a subtle rim or
a missed corner; it is the mask being wrong about most of the photograph.

**And it was invisible because of the corpus.** A corpus of one KIND of
photograph measures one kind of failure. Three sky-dominated frames cannot see
over-selection, and the whole of 023's tuning was steered by them — including a
tolerance widening that looked free on all three (NIR_0063 +0.1 points,
NIR_1644 +0.2) and takes NIR_0627 from 76% to 87%.

## Looked up

The prior art is in `IR-SCIENCE.md` §9n, researched 2026-09-20 for the adjacent
question of inverting the key. Two findings bear directly here.

**Every established classical sky detector keys a POSITIVE sky property, and
reports its misclassification rate as a headline number** — Luo & Etz 90.4%
correct blue-sky detection at 13% misclassification; Shen & Wang >95% on a
thousand images at ~150 ms. The 13% is the relevant figure: the field treats
false-positive sky as the metric that matters, and this app has never measured
it. Its acceptance walk bounds coverage of sky and reports spill without
bounding it.

**And the open-set segmentation literature names the shape of this failure**:
whichever class is treated as the default becomes the catch-all that absorbs
every unmodelled thing. A seed that asks "is this region high and smooth and
roughly this colour" and then floods will absorb a defocused garden, because
nothing in it asks whether the photograph has a sky at all.

## Built already

Do not write a second one of any of these.

- **The coarse seed itself is `buildSkyMask` in `src/sky.ts`.** It is the
  subject of this item, not a gap. It measures depth from the display-top edge
  (so it is orientation-dependent — `rotate` is an input and a hard-coded zero
  has already cost one wrong measurement), smoothness, and colour, and it
  returns `{ found, mask }`. The `found` flag exists; what does not exist is any
  standard it must meet before setting it.
- **The grow is built and is correct work.** `growSkyByColour`, `skyGrowKey` and
  `skyGrowGradient` in `src/skyfine.ts`, with `buildSkyGuide` supplying three
  grade-invariant channels. `skyGrowKey` and `skyGrowGradient` are exported
  specifically so the grow's own decision can be read from outside.
- **The acceptance instrument is `tools/mask-truth-walk.mjs`**, and as of
  2026-09-20 it carries the five-frame corpus including a NO-SKY check: a frame
  declared to have no sky must select at most 2% of itself. That check is what
  makes this item measurable.
- **The fast probe is `tools/sky-probe.mjs`** — esbuild-bundles decode, seed and
  grow for node and reports a selection in seconds with no browser. Its `--why`
  mode answers why the grow stopped somewhere, from the grow's own key.
- **The research is in `IR-SCIENCE.md`**: §4c-v measures that a population's
  chromaticity direction is a camera property stable to 1.9° out of sample, and
  §9n carries the prior art on sky detection and why keying the complement
  fails.
- **`.not-sky`** carries declared corrections to the walk's own truth, with four
  guards. It is empty, and its header records why the one row it held was
  withdrawn.
- **`tools/scope-check.mjs`** lists every consumer of the selection, which is
  the list of things that move when this item lands.

## Weighed against

**023, the item this came out of.** 023 fixed the grow — the selection now
spreads by colour and connectivity rather than by a coarse bitmap — and its
remaining defect is a band of genuine sky missed on NIR_1651. That band is
missed because `skyGrowKey` fits its target to a seed which on that frame is
**100% cloud deck**: of 211,602 seeded guide pixels, zero sit below the cloud's
lower edge. So 023's residual and this item have the same root, and it is the
seed rather than the grow.

**The tolerance lever is spent, and that is now measured rather than assumed.**
Widening the colour edge 1.25x takes NIR_1651's band from 30% to 88% recovered
for 1.8 points of frame coverage — which is why it looked like the answer — and
the same change takes NIR_0627 to 87%. A lever that fixes the corpus and wrecks
everything outside it is not a fix.

**026 and 028** are about combining and extending selections. Both assume the
selection is roughly right to begin with.

## Depends

- touches 023 — 023's grow is correct work and is shipped; this is the layer
  UNDER it. The grow spreads from wherever the seed puts it, so a seed that
  starts in a flower macro's background spreads through a flower macro's
  background. The dependency runs the other way and is declared on 023, which
  cannot finish until the seed is right.
- touches 026 — masks combine by set operators, which assumes each selection is
  roughly right before anything is combined with it.
- touches 028 — 028 sizes itself by what the selection leaves disconnected, and
  every one of those numbers moves when the seed changes.
- touches 013 — the look's sky population reads this selection, and on a frame
  where the selection is a building the look is grading a building.
- touches 016 — the same, for foliage.

## Options

1. **Ask first whether the photograph HAS a sky, and let the mask decline.**
   The seed currently answers "where is the sky" on every frame, and has no way
   to answer "there isn't one". A macro of a flower has no region that is sky by
   any of the properties the heuristic uses — it has a region that is *smooth,
   high and cool-ish*, which is not the same claim. Give `buildSkyMask` a
   confidence and a refusal, measured against the no-sky frames.
2. Fit the seed's colour target to the camera rather than the frame, per
   IR-SCIENCE 4c-v, so a scene with no sky cannot manufacture one from its own
   background.
3. Bound spill in the acceptance walk and tune the existing constants against
   the widened corpus until both bounds hold.
4. A subject/background segmentation, which is what the field ships.

## Rejected

- **3 — tune the existing constants.** Measured and refuted before proposing
  anything: the tolerance is the only lever with real range, and the direction
  that fixes NIR_1651 makes NIR_0627 worse. Three independent analyses swept it.
  There is no setting of the current constants that satisfies both ends.
- **4 — segmentation.** It is what Adobe ships and it is out of scope for an
  offline on-device app with no model. Recorded because it is the honest
  comparison, not because it is available.

## Rank

**Above 023, at the top, and the dependency argument decides it rather than
the severity.**

The test this queue uses is whether work above would have to be redone. 023's
remaining defect is caused by the seed being cloud-only on that frame; 028 is
sized entirely by what the current selection leaves behind; 013 and 016 tune
looks that read this selection. Every one of those is measured against a
selection that is wrong about most of some photographs. Changing the seed moves
all of them, so anything tuned first is tuned against ground that is going to
move.

Severity agrees but is not the argument: 76% of a frame with no sky in it is a
larger defect than a missed band in one corner of one frame.

## Looked at

Every frame below was rendered through the app's own selection and OPENED, not
read off a coverage figure.

- **NIR_0627** — the macro. The selection is the entire defocused background of
  a garden: a smooth blue field across three quarters of the frame, with the
  flower spike and a few leaves standing out of it unselected. There is no sky
  anywhere in the photograph. This single picture is the item.
- **NIR_0172** — the playhouse. The selection covers the wooden structure's
  walls, roof and railings, the tyre swing hanging from a branch, and the grass
  in front. The band of real sky at top right is also taken, correctly, and is a
  small part of what is selected.
- **NIR_1651** — the frame 023 was tuned on. A conifer under a cloud deck; the
  selection is roughly right and misses a band of clear sky at one corner.
  Opened many times, untinted and magnified, to establish that the band is sky.
- **NIR_0063** and **NIR_1644** — the other two corpus frames, whose missed-maps
  were opened when the acceptance split was built. Both sky-dominated, both
  roughly correct, and between them the reason none of this was visible.
