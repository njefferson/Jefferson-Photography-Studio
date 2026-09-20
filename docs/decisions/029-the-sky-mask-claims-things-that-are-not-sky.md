# 029 · The Sky mask claims things that are not sky

## Context

Measured 2026-09-20 on the shipped build, on practice frames that were never in
the acceptance corpus:

- **NIR_0627 — 76.4% of the frame selected as sky.** It is a MACRO of a flower
  spike. There is no sky in it at all. The coarse seed alone claims 58% before
  the grow runs.
- **NIR_0172 — 47.4%.** A wooden playhouse under trees. The selection covers the
  playhouse's walls, roof and railings, the tyre swing, and the grass in front
  of it. **The line that used to stand here said "the only real sky is a band at
  top right" and it is wrong** — opened, that band is dark branches and pale
  leaves against a background blown to near-white. Sky-coloured pixels are 2.1%
  of the frame and their largest connected run is 1,261 px in the BOTTOM-RIGHT
  corner. This frame's sky is present and achromatic, so it is unkeyable by hue,
  and it belongs nearer NIR_0627's no-sky class than to the corpus.
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
  in front. The band at top right that an earlier reading of this picture called
  sky is branches and pale leaves; see the correction in Context.
- **NIR_1651** — the frame 023 was tuned on. A conifer under a cloud deck; the
  selection is roughly right and misses a band of clear sky at one corner.
  Opened many times, untinted and magnified, to establish that the band is sky.
- **NIR_0063** and **NIR_1644** — the other two corpus frames, whose missed-maps
  were opened when the acceptance split was built. Both sky-dominated, both
  roughly correct, and between them the reason none of this was visible.
  NIR_1644's missed map was opened again after the horizon landed, before and
  after side by side: the extra spill it reports is the feather sitting in the
  notches between crowns the mask now reaches into, not a tree taken whole.

Opened again on 2026-09-20, before and after the horizon, as overlays at the
mask's own scale:

- **NIR_1877** — sky on the right of a pale conifer stand. Before, thin slivers
  of it; after, the whole of it with the treeline hugged.
- **canopy** — the road under a canopy. Before, a strip down the left only;
  after, the sky on both sides of the canopy.
- **NIR_1830** — a tree trunk against a lake. Before, a wide selection that
  included the LAKE; after, the lake is out and what remains is a band down the
  trunk.
- **NIR_1688** — a forest across a river. Before, a band across the top that took
  the forest and the far shore; after, a thin strip of the pale gap at the top.
- **NIR_1638** — a river between conifers. The sky is a strip at the top centre.
  After, vertical cyan bands stand down the two foreground trunks: the artefact
  named in the Outcome, seen rather than inferred.
- **NIR_1873** — a lakeside forest with no sky in it. Before, nothing selected;
  after, a band down the trunk at the left and a strip at the top right. Nothing
  in what is selected is sky.

## Outcome

**Option 1 landed on 2026-09-20 and this record stays OPEN.** The seed now asks
where the sky ENDS before anything asks what colour it is —
`src/skyhorizon.ts`, the published border-position method (Shen & Wang 2013;
IR-SCIENCE.md §9o carries the physics, the four adaptations and every number
below). The region above that border seeds the existing colour fill; the paper's
two post-processing tests give the refusal this record asked for.

**What it fixed, coarse-mask coverage over all 44 practice frames, every
overlay opened.**

- **NIR_0172, the playhouse — 22.2% to 12.1%,** and the picture is the evidence
  rather than the number: the walls, the roof, the tyre swing and the lawn are
  out of the selection. That frame's real remainder is the sky above the canopy.
- **NIR_1830 — 30.5% to 10.0%.** The lake is out.
- **NIR_1688 — 13.9% to 4.1%.** The forest and the far shore are out.
- And in the other direction, because the same change is what makes the border
  reach: **NIR_1651 30.3% to 52.2%** (023's corner band and the whole left half
  of that sky), **NIR_1877 4.9% to 22.9%**, **canopy 5.5% to 19.2%**, **NIR_1873
  nothing at all to 7.4%**. Every frame still reports a sky; none is refused.
- On the acceptance instrument, `canopy`'s reachable open sky went 68.1% to
  99.5%, its uncovered reachable sky 30.8% to 7.1%, and its spill 12% to 3%.

**What it did NOT fix, which is why this stays open.** NIR_0627, the macro of a
flower spike, is unchanged: 76.4% to 75.9% of the frame on the acceptance
instrument. Its defocused garden background is smooth, occupies the top half,
and has no edge in it — so the border runs to the bottom of the frame honestly,
the energy optimum is interior, and both of the paper's no-sky tests decline to
fire. Under the ranking stated 2026-09-20 this is the lower half of the
requirement — a photograph with no sky selecting one is not a failure, because
the reader turns the mask off — but it is the picture this record was written
about and the record does not close until it is answered.

**And one new artefact, named rather than hidden.** A tree TRUNK is smooth down
its length: the gradient across its edges is high and along its interior is not,
so a column running down the middle of one carries the border deep with no step
from its neighbours to announce it, and the paper's §2.3.2 column refinement
never triggers. NIR_1638, NIR_1830 and NIR_1873 each keep a vertical band of
selection down a trunk; NIR_1638 reads 11.1% of the frame against 7.8% before
this work, and NIR_1873 — a lakeside forest with no sky in it, which used to
report none — now reads 7.4%, ALL of it the band down one trunk and a strip at
the top right. That one is a straight regression by the second half of the
ranking and it is the trunk artefact rather than a separate defect.
Running the refinement on every photograph instead of on a stepped border was
measured and is worse — it costs NIR_1651 half its sky, 52.2% to 34.6% — and it
does not clear NIR_1638's trunks anyway, so the trigger is not the remedy.

**THE ACCEPTANCE INSTRUMENT CANNOT MEASURE NIR_0172 AND THAT IS NOW KNOWN.**
`tools/mask-truth-walk.mjs` learns the sky's colour from the pixels the mask
covers. On a frame where the mask covers a playhouse it learns the playhouse:
the walk reports its target at hue 0° before this change and hue 359° after,
both within a degree of the building's own warm red and 160-odd degrees from
every verified sky in the set. It then calls the building sky and reports the
mask for not covering enough of it — which is why that frame's numbers move the
wrong way (open sky 79.6% to 57.1%) while the picture plainly improves. The
frame is not an acceptance frame and must not become one without a truth the
walk does not derive from the mask.
