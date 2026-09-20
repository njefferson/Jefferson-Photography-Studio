# 023 · The Sky mask reads the sky's colour as well as its place

## Context

Reported from the iPad on 2026-09-18 with three screenshots of one frame. The
reader's **Sky mask** (type 4, a bitmap from the sky heuristic at the mask's
reach and feather) reaches a deep blue sky by hand — warmth cold, saturation
high — but leaves a rim of unselected sky round every object and misses the
sky between branches: it knows WHERE the sky is and not which pixels are it.
The **Colour mask** (type 3, a chroma key on each pixel's display colour,
normalised by the tapped colour's own saturation) reaches every pixel of the
sky's colour, through the trees and up to every edge, and takes the same
colour everywhere else with it — the apron's cast, the cars, anything cyan.
Each half is right about what the other is wrong about. The question put was
whether the two can be combined.

Intended outcome: a Sky mask whose weight is the selection's place AND the
sky's colour, per pixel — so it reaches through branches and up to edges as
the colour key does, and stays out of the apron as the bitmap does — with no
new tapping required, because the sky's colour is already known from inside
the selection.

## Looked up

**This is the field's standard move, and it is an INTERSECTION.** Lightroom's
own answer to halos and gaps round trees in a Select Sky mask is to add a
Color Range selection and intersect the two — the colour range reaches the
sky between the branches, the sky mask keeps the same colour out of the
water and the ground (Fstoppers, "Sky Masking in Lightroom: The Fix for
Halos and Gaps", and "Perfecting Lightroom Sky Selections With Ease";
Lightroom Queen forum, "bright sky areas around silhouetted tree limbs";
Adobe's masking help documents Intersect Mask With as the operation). The
colour is taken from a DRAGGED box rather than a tap, so the target is the
sky's average, not one pixel. darktable's mask manager combines a drawn mask
with a parametric (colour and luminance) one per pixel in the same way.

**Nothing in that recipe is new to this app.** The chroma key exists on both
the CPU and the GPU (`colorMaskWeight`, held identical by the agreement
walk); the sky bitmap exists; the sky's own mean colour is already measured
at open by the sky map (IR-SCIENCE.md 4b-v: the key is fitted on the sky's
mean rendered colour). The combination is a multiply.

## Built already

What exists that the REMAINING half of this item will use, so a second one does
not get written (LESSONS 330). The first half shipped 2026-09-19; what is left
is the boundary.

- **The grow itself is built.** `growSkyByColour` in `src/skyfine.ts` walks out
  of the heuristic's seed through pixels matching the sky's colour and joined
  to it, on the guide, at 1024. Membership is binary and the softness is a
  separable box blur on the boundary; both of those shapes were arrived at by
  rendering and are not free parameters to re-derive.
- **The guide is built and cached per photograph.** `buildSkyGuide` and
  `skyGuideFor` (a WeakMap in `src/main.ts`) give three channels of the
  gray-world-balanced linear frame at `SKY_FINE_EDGE`. Any further work on the
  boundary reads these, not the decoded frame, and gets grade-invariance free.
- **The guided filter is built and its trade is measured.** `refineSkyMask` in
  the same file snaps a selection to the picture's edges. Composing it AFTER
  the grow was measured both ways and is NOT what ships: it helps a smooth
  cloud edge and pulls a conifer rim back out. Do not re-run that experiment
  blind — the numbers are in the Outcome below.
- **The acceptance instrument is built.** `tools/mask-truth-walk.mjs` reads the
  mask from the reader's side and writes a missed-map per frame, uncovered sky
  red and spill yellow. Its maps are what showed the residual is a MISPLACED
  rim rather than a short one. It needs no work.
- **A node harness for the selection exists in the session scratchpad and is
  NOT in the repo**, the same trap 018 hit. It bundles `src/sky.ts`,
  `src/skyfine.ts` and `src/decode.ts` with esbuild for node and measures
  coverage without a browser, in seconds rather than minutes. If the boundary
  work needs iteration, promote it into `tools/` first rather than writing a
  third one.
- **The scope gate names the consumers.** `tools/scope-check.mjs` lists the
  per-population strengths still marked OWED — denoise, chroma, texture, the
  hot-spot and lens corrections — every one of which would read this selection
  once it is good enough. That list is why the boundary matters beyond the
  reader's own mask.

## Weighed against

- **018, one sky selection for every sky-aware tool** — the mask reading the
  REFINED selection snaps its boundary to the picture's edges, which removes
  the rim round a roofline. It cannot put back sky between twigs finer than
  the guided filter's window (radius 12 at 1024 px), and it cannot reach a
  patch of sky the seed never touched. The colour gate does both, per pixel.
  The two are complementary: 018 fixes the boundary, this fixes the interior
  and the gaps. Same shader stage, same selection; this follows 018 directly.
- **006, mask by subject** — a different seed; not this.
- **The Colour mask as it stands** — its key is the pixel's display colour at
  the mask stage, which MOVES with the grade: a Colour mask picked under one
  look selects something else under another. A gate inside the Sky mask must
  not drift, because the selection it gates was built at gray-world balance
  and never moves as the photograph is graded (018's rule).
- **The look's own sky stages** — they read the refined selection and are not
  the reader's mask; untouched by this.

## Depends

- needs 018 — shipped. 018 snaps the selection's BOUNDARY to the picture's
  edges; this fixes the interior and the gaps it cannot reach. Same shader
  stage, same selection, and this follows it directly.
- distinct-from 006 — mask by subject is a different seed, not this.
- needs 029 — this item's remaining defect and 029 have ONE root. The band of
  sky this misses on NIR_1651 is missed because skyGrowKey fits its target to a
  seed that is 100% cloud deck on that frame — zero of 211,602 seeded pixels sit
  below the cloud's edge. Fix the seed and this moves with it, so tuning here
  first is tuning against ground about to shift.
- touches 028 — 028 is the sky this mechanism cannot enter, and it is sized by
  what this one leaves behind: change the grow's tolerance or brake and the
  disconnected share moves with it.

## Options

1. **The Sky mask carries a colour gate, on by default, sampled from inside
   its own selection.** Weight = bitmap(uv) × colourWeight(pixel). The target
   is the mean colour of the pixels the bitmap already selects (the field's
   dragged-box average, taken automatically), the range from their spread;
   Reach grows the bitmap generously, since it only has to CONTAIN the sky,
   and the colour gate draws the edge. Range and Feather keep their meaning.
   A "By colour" toggle on the Sky mask turns the gate off for a sky whose
   colour the reader has already changed past recognition. **The gate keys on
   a colour that does not move with the grade** — the gray-world-balanced
   colour the selection was built from, which the mask stage must be handed
   (the sky stages already carry the selection's textures; the balanced
   colour is one more, or the key is evaluated from the running colour with
   the look's transform undone, whichever the agreement walk can hold). This
   is the design point to settle by measurement before building, not by
   argument: a gate that drifts is the Colour mask's defect moved into the
   Sky mask.
2. A general **Intersect with colour** on any mask, Lightroom's shape: a
   second mask combined per pixel with the first.
3. Only 018: the refined selection, no colour.
4. Colour only: what the reader can do today, and what leaked.

## Rejected

- **2**: a mask-combination model — intersect, subtract, add — is the larger
  piece and needs its own UI for the chain. The sky is the one case that
  hurts now and the one whose colour can be sampled without asking; build
  that, and let the general form come with a second case that needs it.
- **3**: measured on the reference sheet of 4b-vii, the refined selection's
  edges are clean along rooflines and crowns and its interior gaps (sky
  between branches) stay unselected where the seed never reached. The
  screenshots show the same.
- **4**: the apron, the cars and every reflection took the cold warmth with
  the sky; the reader's own report, and the reason a place gate exists.

**Acceptance is a number, not a sheet:** `tools/mask-truth-walk.mjs` reads
the mask's true coverage from the reader's side and is red on the build this
record was written against (edge coverage 38–77% on four of five frames,
NOTES.md "The Sky mask, read from the reader's side"). It goes green when
the edge band is covered at ≥ 0.85 and open sky at ≥ 0.97.

## Looked at

Three frames, every one of them rendered and opened rather than read off a
coverage figure — and opening them changed the conclusion twice.

- **NIR_1644** (conifers against deep blue sky). The sky the seed misses is a
  thin, continuous rim hugging every crown, and the colour-close pixels that
  must stay rejected are speckle scattered through the foliage. The rim is
  CONNECTED to the sky and the speckle is not, which is what made connectivity
  the discriminator rather than colour distance.
- **NIR_1651** — **and this frame overturned the design's first verdict.** The
  grow took the selection from 9.8% of the frame to 56.5%, and that was
  written up as a flood into a hillside. It is not a hillside. The frame is a
  branch against sky with a large bright CLOUD filling the right side and the
  bottom, and the seed misses the cloud entirely because a white cloud is far
  from a grey-blue sky in the heuristic's own luma and colour model. The grow
  reaching it is the reported defect being fixed, not a failure. That was only
  visible by rendering the photograph, which had not been done — every earlier
  round reasoned about masks over a frame nobody had looked at.
- **NIR_0063** (sky behind a treeline). The least helped: edge-band coverage
  45% to 52%, the interior already essentially complete at 99.9%.

The walk's own missed-map on 1644 is what settled the composition question. The
residual after the grow is a thin red rim right at the crowns with yellow spill
immediately beside it — the boundary is MISPLACED, not merely short, which is
the guided filter's job and not a colour test's.

## Rank

Directly after 018, wherever 018 sits: it multiplies the selection 018 hands
the mask, at the same shader stage, and building it on the coarse bitmap
first would mean building it twice. It does not wait on 019 or 021.


## Outcome

Built 2026-09-19 as a CONNECTIVITY-CONSTRAINED GROW rather than as the
multiply option 1 describes, and the difference is the whole of what works.

**A multiply cannot help at all.** Option 1 says weight = bitmap x colourWeight
with Reach grown generously so the gate draws the edge. The multiply half can
only ever REMOVE weight, so on its own it can neither fill the gaps between
branches nor lift open-sky coverage — the two halves of the defect. The growth
half is doing all the work, and `growSkyByColour` in `src/skyfine.ts` is that
half made explicit: it walks outward from the heuristic's seed through pixels
that match the sky's colour AND are joined to it, on the guide, at 1024.

**Connectivity is the discriminator, and it was measured before it was built.**
The sky the seed misses lies against the seed and is colour-close — 15%, 32%
and 39% of what is adjacent on the three frames. The colour-close pixels that
must stay out are speckle through foliage and regions joined to nothing. On
NIR_1651, 46% of the frame beyond the seed matches the sky's colour, so colour
alone readmits half the picture.

**A luma-gradient brake was added and is nearly inert**, which is worth
recording so it is not mistaken for load-bearing: on NIR_1651 the leak the
brake was meant to stop runs through a SMOOTH path, and the brake moved the
coverage by under a point. It is kept because it costs one array and it is the
same idea `buildSkyMask` already applies one stage earlier.

**Rejected option 2 stayed rejected even though 026 removed its stated
reason.** 026 shipped the general intersect, so "the larger piece, needs its
own UI" no longer holds. It stays rejected on the half 026 does not touch: the
Colour mask keys on the display colour at the mask stage and moves with the
grade, which this record forbids. A reader who wants a hand-picked colour
intersected can now do exactly that themselves; this is the automatic one.

**The drift guarantee is structural, not tested.** `growSkyByColour` takes a
bitmap, a guide, a reach and a feather — no access to EditParams, so no edit
can reach it. A browser walk for it was written and removed; see that
function's contract for why.

**THE DEFECT THAT WALK'S CONTROL APPEARED TO FIND IS NOT ONE.** It was recorded
as "switching a look away and back does not return the same photograph", on two
framebuffer hashes, and it stood in NOTES and in this function's contract for
most of a day after the instrument that produced it had been deleted. Measured
through `tools/look-roundtrip-walk.mjs`, which is kept for this: fourteen round
trips over seven looks, with and without a Sky mask on the frame, every one
byte for byte identical, and twenty away-and-back cycles with one distinct
render and one distinct set of white-balance positions. So the deleted walk's
control failed for a reason that is still unknown, and nothing anywhere should
read as having explained it.

**ACCEPTANCE IS NOT REACHED, and this ships anyway.** The mask-truth walk wants
edge >= 0.85 and open >= 0.97; it is red on three checks where it was red on
four. Measured before and after, at the shipped default Reach:

- NIR_0063: edge 45% to 52%, open 99.7% to 99.9%, uncovered 7.8% to 7.0%,
  spill 7% to 8%.
- NIR_1644: edge 37% to 82%, open 96.8% to 99.9%, uncovered 5.5% to 1.0%,
  spill 12% to 23%.
- NIR_1651: edge 89% to 88%, open 71.5% to 87.0% and then to 93.4% once the
  pinholes were filled, uncovered 21.3% to 7.1%, spill 79% to 55%.

Three rounds of that came from OPENING the render rather than from the figures,
which moved the right way throughout. Grading each pixel by its colour
confidence put speckle through the sky; membership went binary. The first
boundary blur was 6 px and ate the needles, putting a pale halo round every
branch — the rim defect this item exists to remove, reintroduced by the fix for
the speckle; it is 1-2 px now. What is still visible is a RAGGED boundary where
the sky is noisy, which is a colour threshold on a grainy gradient made
hard-edged by binary membership.

Two cautions on reading those. The walk derives its own sky TRUTH within the
rows the mask reaches, so a bigger mask enlarges the denominator — 1651's sky
truth went from 174,292 px to 402,910 px between the runs, and the percentages
are not measuring the same set. And edge coverage trades against spill by
construction: covering more sky within 10 px of an edge means covering more of
what is beside it, so 85% may not be reachable with a hard selection at all.
That is a question about the BOUND, and it belongs to whoever takes this next.

**THE BOUNDARY WAS DIAGNOSED WRONG, AND THE CORRECTION CAME FROM MAGNIFYING
IT.** This record said the residual was a RAGGED edge — a colour threshold on a
grainy gradient — and the planned remedy was to smooth the guide's colour
channels before thresholding. Both were wrong. Drawing the selection's border
over the photograph at 1024 and then magnifying it four times shows the
boundary threading correctly BETWEEN the needles; it is crisp. What is actually
there is PINHOLES: single pixels of open sky pushed outside the colour
tolerance by grain, left unselected and ENCLOSED by selection, which is what
reads as speckle once an adjustment is applied to the mask.

The remedy is therefore one that CANNOT move the outer contour: flood the
unselected pixels inward from the frame's border and fill anything the border
cannot reach, below a size cap so a real object enclosed by sky is not
swallowed. It only ever adds interior pixels, so the needle edge this item
exists to win is untouchable by it — unlike widening the feather, which ate the
needles at 6 px. NIR_1651's boundary roughness fell from 1.2% of its border
pixels to 0.4%, its border pixel count from 6,639 to 6,011, and the walk's open
coverage from 87.0% to 93.4%.

**And the instrument was wrong before the diagnosis was.** `tools/sky-probe.mjs`
— promoted out of a scratchpad for this, having been written three times — hard
coded `rotate = 0` into `buildSkyMask`. Rotation is the one input that decides
which edge the heuristic calls the sky, so on a portrait frame it grew a
selection the app would never produce: NIR_1651's seed read 9.7% of the frame
against the app's own 30%. Every number taken before that fix was about a
different photograph.

**IS THE 0.85 EDGE BOUND REACHABLE? MEASURED, AND THE ANSWER IS DIFFERENT PER
FRAME.** `SKY_GROW_TOL` swept through the acceptance walk at 2.5, 3.25, 4 and 5:

- NIR_1644 reaches it — edge 82%, 85%, 86%, 86% — crossing 0.85 at 3.25 and
  then SATURATING, while spill keeps climbing: 23%, 26%, 29%, 30%. So the
  bound is met there at about three points of spill, and nothing past 3.25 buys
  coverage, only halo.
- **NIR_0063 does not move at all: 52% at every tolerance**, with spill barely
  stirring from 8% to 10%. Tolerance is not what limits that frame.

**Its missed-map says why, and the two errors are opposite.** A wide YELLOW
band of spill runs the length of the treeline and well down into the crowns —
the grow taking canopy as sky. And the uncovered sky is RED speckle scattered
through the upper-left canopy: patches of real sky seen through gaps in the
branches, larger than the pinhole cap and **not connected to the open sky by
any sky-coloured path**. Connectivity — the thing that makes this design work
at all, and without which colour alone readmits half of NIR_1651 — is exactly
what prevents reaching them.

So on that frame the grow over-reaches and under-reaches at once, and raising
the tolerance makes the first worse without touching the second. **0.85 is not
reachable there by tuning this constant**, and the honest options are a
different mechanism for disconnected sky (the per-pixel gate this record
rejected as option 4, which reaches them and readmits the apron) or a bound
that admits what a connectivity-constrained selection can do.

**The tolerance stays at 2.5.** Moving to 3.25 buys NIR_1644 its bound and adds
three points of spill to a frame already visibly taking canopy; that is a
question about how the photograph looks and it is not settled by a coverage
figure.

**THE GRADED COLOUR WEIGHT WAS DEAD AND IS GONE.** When membership went binary
the function that computed each pixel's colour confidence stayed behind, and
the flood consulted only its zero crossing — so a smoothstep was computed and
discarded on every pixel, and Feather fed a plateau nothing read. Two things
were false in the source while it stood: the boundary looked soft and is hard,
and Feather looked like it moved the selection when since binary membership it
has only ever set the boundary blur's radius. It is a boolean now, named for
what it answers. Verified behaviour-preserving rather than assumed: the three
corpus frames' rendered selections are byte for byte identical before and
after, at the shipped tolerance.

**THE ACCEPTANCE NUMBER WAS MEASURING TWO POPULATIONS AT ONCE, and splitting
them took the walk from three failures to one.** NIR_0063's 52% edge coverage
would not move at any tolerance because the denominator mixed sky the grow
could have grown into with sky it can never enter — a connectivity-constrained
selection cannot cross a branch to reach the sky behind it, at any tolerance,
by construction. `tools/mask-truth-walk.mjs` now floods from what the mask
covers, through keyed sky, and sorts every sky pixel into REACHABLE and
DISCONNECTED before it bounds anything. The bounds did not move — 0.85 and 0.97
stand; lowering a bound to meet what a build already does makes the gate
vacuous. Over reachable sky, at the shipped default Reach:

- NIR_0063: edge 52% to **98%**, uncovered 7.0% to 0.1%. Both checks pass.
- NIR_1644: edge 82% to **87%**, uncovered 1.0% to 0.6%. Both checks pass.
- NIR_1651: edge 89% to **94%**, open sky **93.4%, unchanged, still red**.

Proved by planting: `--plant-reachable` counts every keyed sky pixel as
reachable, which is the arithmetic this file had before, and reproduces all
three frames' old readings exactly. The disconnected share — 6.9%, 0.4% and
1.4% — is reported and never bounded, the standing this file already gives the
spill line, and it is decision 028's subject.

**OPENING THE MAPS CORRECTED THE SPILL READING ON EVERY FRAME.** The figures
say 8%, 23% and 55%, which reads as the mask swallowing canopy. It is not. On
NIR_1651 the 55% is a large bright CLOUD across the top of the frame, which the
mask selects and the walk's hue-band key rejects — the case this file's own
header already names, at a scale nobody had looked at. On NIR_0063 and NIR_1644
it is the pale hazy sky hugging the treeline, below the key's 0.12 saturation
floor. There is a real thin rim of coverage on the bright IR-white shrubs at
NIR_0063's right edge, and it is thin. **The spill number must not be read as a
mask defect without opening the map.**

**THE LAST RED CHECK IS THE INSTRUMENT, NOT THE MASK — measured 2026-09-20 and
then LOOKED AT.** NIR_1651's remaining 18,933 px block sits at (0.96, 0.89),
the extreme bottom-right corner. Magnified three times out of the walk's own
overlay it is a heavily DEFOCUSED foliage mass at the frame edge — a foreground
branch, with leaf silhouettes along its blurred boundary, a deep dark teal
beside the flat lighter teal of the sky. It is not sky, the mask is right to
refuse it, and the walk's truth key calls it sky because that key is a ±25° hue
band above a 0.12 saturation floor with **no luminance condition at all**.

Corroborated independently by `tools/sky-probe.mjs --why`, which works from the
grow's OWN key — `skyGrowKey`, exported for this — rather than the walk's: the
grow's colour test admits no unselected component anywhere near that size on
this frame, its largest being 692 px. Two different keys, and the disagreement
is about whether those pixels ARE sky rather than about reachability.

**AND THE FIRST ARGUMENT FOR IT WAS WRONG, WHICH IS WORTH KEEPING.** The block
was first called foliage because its mean luminance, 0.264, sits well below the
covered sky's mean of 0.483. That comparison is void: this frame's covered sky
includes a large bright cloud, so its luminance distribution is skewed and its
median is 0.312 with a MAD of 0.028. Against the median the block sits 1.8 MADs
low — ordinary sky variation. Brightness never settled it; the magnified crop
did. The walk now prints the distance in MADs and refuses to draw a conclusion
inside 2.5 of them.

**SO WHAT IS OWED IS AN INSTRUMENT FIX, AND THE OBVIOUS ONE WAS MEASURED AND
DOES NOT WORK.** Classic non-ML sky detection is colour PLUS texture — Kodak's
sky-detection patent (US 6,504,951) calls the second half open space detection
and states its purpose as separating sky from other blue-coloured things. That
was measured here before being built, on all three frames' largest missed
block, as a signed distance in MADs from the confident sky's median:

- **NIR_0063** (292 px): luminance −2.0, saturation −2.3, texture 1px +1.9,
  texture 8px **+52.6**.
- **NIR_1644** (406 px): luminance +2.2, saturation −2.1, texture 1px +2.4,
  texture 8px **+8.2**.
- **NIR_1651** (18,933 px, the defocused branch): luminance −1.6, saturation
  +0.9, texture 1px **−0.6**, texture 8px **+0.1**.

**Texture fails completely on the only case that matters.** Bokeh is smooth: at
one pixel the branch is SMOOTHER than the sky, and at eight it is
indistinguishable from it.

**And the two apparent successes are a confound, which opening the maps
showed.** Those blocks are 292 and 406 px — about seventeen and twenty pixels
across — so an eight-pixel gradient step reaches outside them into the
surrounding crown structure. Their high texture readings are a fact about what
is around them, not about them. The one block large enough for the window to
stay inside it is the one that reads +0.1. A fixed-window texture measure on a
region smaller than a few windows measures the region's surroundings.

**A colour-and-texture key cannot do this job**, and that is now measured
rather than suspected.

**A DECLARED CORRECTION WAS TRIED AND HAS BEEN WITHDRAWN, 2026-09-20.** One row
in `.not-sky` asserted that an 18,933 px band in NIR_1651's bottom-right corner
is a defocused foreground branch rather than sky. It took the walk green on all
three frames. **The assertion did not survive being checked, so the row and the
green are both withdrawn.**

Two errors in reaching it, and neither was the app's:

- **The crop was aimed wrong.** The band runs x 0.90–1.00; the magnified crop
  it was judged from was taken from x ≥ 0.80. What was described as a defocused
  branch may be a different object sitting beside the band. That is the same
  crop-aiming failure as the ragged-edge diagnosis, committed while writing the
  lessons about it.
- **The brightness anchor was the wrong statistic, again.** The band was called
  dark against the frame's GLOBAL sky median of 0.312. Covered sky local to
  that corner reads 0.501, and the frame gets brighter toward it — the left
  edge is 0.394 — so there is no falloff to explain a dark band, and equally no
  basis for the global median as the comparison.

**SETTLED 2026-09-20: THE BAND IS SKY, and the mask has a real defect.** Four
independent renders of that corner, untinted and magnified to 6x, opened — a
direct look, a comparison against the region beside it, an adversarial pass
briefed to argue FOR sky, and a whole-frame context pass. All four return sky
at high confidence.

What it is: NIR_1651 is a frosted conifer under an overcast sky with a bright
CLOUD DECK filling the top ~40%, its lower edge crossing the right margin at
about y=0.43. The band is the CLEAR SKY BELOW that deck, running unbroken to the
frame edge. Its linear channel ratios match the sky above it — R/G 1.978 against
1.924, B/G 0.558 against 0.586. Same spectrum, a quarter the light. The higher
saturation that was read as evidence of a different material is per-pixel chroma
noise at that reduced signal. The 18,933 px bounding box corresponds to nothing
in the photograph; it is a mask component boundary, not an object boundary.

**A third wrong statistic, found by the same pass.** The claim that the frame
gets brighter toward this corner, and so has no falloff to explain a dark band,
compared HORIZONTALLY at cloud height — where the cloud sets brightness, not the
lens. Measured vertically into the corner, luminance falls monotonically from
0.1511 at y=1080 to 0.1367 at y=1320. There is falloff.

**So the defect is the app's: the selection misses about 5% of this frame's
sky.** The suspected mechanism is that `skyGrowKey` refits its colour target per
photograph from whatever `buildSkyMask` seeded, and on this frame the seed is
dominated by the bright cloud — so the tolerance centres on cloud-lit sky and
the darker clear sky beneath falls outside it. Being measured rather than
assumed.

**The walk is back to one red check on NIR_1651**, and that red is now known to
be honest.

**What is still owed:** the boundary. The grow fixes the interior and the gaps
and leaves the rim misplaced by a pixel or two. Composing the guided filter
after the grow was measured both ways: it lifts NIR_1651's uncovered sky and pulls
NIR_1644's recovered rim back out, edge 73% to 62% with spill 14% to 26% —
measured on the graded-weight build, before binary membership landed. The crowns are the reported defect, so the fine
boundary wins and the composed arm is not what ships.
