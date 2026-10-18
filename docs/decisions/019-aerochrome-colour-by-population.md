# 019 · Aerochrome's saturation by population: foliage and sky each their own amount, nothing colourless touched

## Context

Reported on 2026-09-18 from staging 2.50.10: the look's saturation reads too
high across the whole frame, and it needs to be aimed at the foliage and at
the sky as two separate amounts, with everything that has no colour left as
it is. The report came with a better sky made by hand — the lens colour
correction raised to 1.5 and the sky's saturation taken slightly down — and
the judgement that the depth candidates from 017's second stage read as
night. The pale centre of a clear sky in these frames is the lens's hot spot,
which is data, not a defect of the look; the depth was flattening it.

What the look actually did, read from `LOOKS.eir` and the two pipelines: a
GLOBAL saturation of 3.0 on every raw pixel (faded only in deep shadow), and
a power curve of 2 on the aqua and blue chips of the eight-band mixer —
`s^(1/2)` — which lifts the palest blues the most: a pixel at saturation
0.02 leaves the chip at 0.14. Between them, bare ground, grey walls, an
overcast sky and clouds all took colour. The foliage's own bands sat at 1;
its colour came entirely from the global gain.

Intended outcome: the look's saturation lands on the foliage and on the sky,
each set separately and each visible on a slider of its own, and a pixel
that arrives without colour leaves without colour. **The framing that
settles the shape is the one that produced the idea: think about what
needs to happen to which PORTION of the photograph, never about the whole.**
The sky is a place in the picture; the foliage is a population by what it
is; the neutrals are a population by what they lack. Each gets its own
treatment and nothing acts on the frame.

## Looked up

**The field's answer to "leave neutrals alone" is a selection, not a
curve.** darktable's *color balance rgb* separates chroma, vibrance and
saturation, and its vibrance "prioritizes colours with low chroma" — the
OPPOSITE of what is wanted here, since it colours neutrals first
([darktable manual, color balance rgb](https://docs.darktable.org/usermanual/4.6/en/module-reference/processing-modules/color-balance-rgb/)).
Its answer for aiming a boost at a population is the parametric mask on
chroma and hue, and Lightroom's is the colour range mask and Select Sky. So
the mechanism is a gate on the pixel's own chroma, combined with a hue or a
position, and the question is only where the gate's numbers sit.

**Rob Shea's own Lightroom workflow masks, too.** Shea's colour-infrared edit
in Lightroom Classic (2021-12-23) is white balance, a colour-swap profile,
then the masking tools; the 850 nm monochrome full edit (2023-09-04) is a
set of "advanced masking techniques"; and the 2020 colour swap through
Lightroom's LOCAL hue adjustment is a masked hue shift rather than a global
one. Same shape as this record: portions, each with its own treatment. The
specific masks and what is done inside each are in the videos (the posts
are embeds), and the course outline teaches "Vibrance, Saturation, Color
Hot Spots" as one lesson and Masks as a chapter after the global look —
the same order this record lands on. The captions cannot be read from this
container (a sign-in check on the player, keyed on the address); the video
ids are in IR-SCIENCE.md 4b-vi for a machine that can.

**The app already has the foliage as a control, and the sky as a place.**
The Colour tab's Foliage band owns the warm half of the hue wheel, follows
the channel swap, and multiplies saturation about the pixel's own — so a
truly neutral pixel is already untouched by it, and only a NEAR-neutral one
(a cast of 0.03 that a gain of 3 makes 0.09) is not. What was missing is the
gate: a boost that fades to nothing below a chroma floor. That is `bandGain`
in `src/pipeline.ts`, mirrored by name in the shader. And the sky selection
built at open (017, 018) is exactly "where the sky is": Sky colour smoothing
and Sky depth already act through it, and its saturation joins them as
`skySat`, gated on each pixel's own colour so a cloud stays a cloud.

## Weighed against

- **017 (archived)** — put the film's saturation on the sky through the
  eight-band chips at a power of 2, and its second stage darkened the sky
  through the new selection. Both were measurements of the app's own output
  against a scan; the report above is the judgement of the pictures, and it
  ranks above the scan. The depth stays as a slider at 0.
- **018, one sky selection** — the sky's saturation could ride the SELECTION
  instead of the hue band. Rejected below; the selection stays the smoothing
  and depth's, and 018's reader-side work is unchanged.
- **013, splotchy chroma** — the global gain of 3.0 was that record's
  multiplier on the mottle (IR-SCIENCE 4c-vi: at saturation 3.0 the sky is
  peppered and the foliage stipples; at 1.0 both are clean). Removing it
  removes the multiplier from every pixel that is not foliage or sky.
- **The scope gate** — `EditParams.sat` is declared whole-frame "by
  definition; per-population saturation is hsl and the masks"; this record
  is the look taking that sentence seriously.

## Options

1. **Global saturation 1, the aqua and blue chips back to 1; the foliage's
   amount on the existing Foliage band with every band BOOST gated by the
   pixel's own chroma** (`bandGain`, `SAT_GUARD_LO..HI`, HSV saturation in
   linear light at the band stage — none of the boost below the floor, all
   of it above the ceiling; reductions stay ungated, because taking colour
   out of a neutral costs nothing); **and the sky's amount through the sky
   SELECTION** — a Sky saturation slider beside Sky depth, `skySat`, scaling
   each sky pixel's chroma about its luma where the refined bitmap says sky,
   gated on the pixel's own saturation (`SKY_SAT_GATE_LO..HI`, display
   space) so a cloud, a haze and an overcast sky stay grey. The two amounts
   are the look's `raw.foliage` triplet and `skySat`, chosen from rendered
   sheets; the reader sees both and moves either.
2. The sky's amount on the Colour tab's Sky hue band instead of the
   selection, gated the same way.
3. Keep the global gain and add the gate to it.
4. Gate the eight-band chips' power curve the same way.

## Rejected

- **2**: a hue band is not a place. "Teals and blues wherever they are"
  reaches water, shade with a blue cast and a blue car, and it was the
  first draft of this record — corrected the same hour on the framing
  above, that the sky is a portion of the photograph. The selection is what
  the app builds at open for exactly this, and smoothing and depth already
  read it; a third sky tool on a different notion of "sky" would be the
  inconsistency 018 exists to remove. The two sliders are named apart: the
  band says *(teals & blues)* in its title, and the selection's note says
  which is which.
- **3**: a global gain with a gate still puts one amount on the foliage and
  the sky, and the report asks for two.
- **4**: the chips' power curve was chosen for a reason that still holds
  outside a look — an unmixed infrared sky sits near saturation 0.05, where
  a multiplier does nothing (the comment at `hslAt`'s use site). Changing
  it would change every saved look and every reader's chip edit. Left as it
  is; the look no longer relies on it. Named in the report as its own
  question.

## Rank

Fourth: its mechanism is on the branch; its amounts are finished inside the
panel (022) after the correction has moved (021), from sheets rendered
through the app's own controls, and chosen from pictures.

## Looked at

The seven arm sheets, opened as images on 2026-09-19 after four rounds of
analysis had been written from their numbers alone. What each showed, and
where it contradicts what the numbers had been taken to mean.

- **NIR_2082** — a grey asphalt car park and a brick wall carrying dense red
  speckle, thousands of scattered red pixels, in all four arms. Its numbers
  read "foliage 0.69, colourless 51%" and it had been summarised as "overcast,
  the gate holds it grey". This record's stated purpose is that nothing
  colourless is touched; this frame is that claim failing in the shipped build,
  and no statistic in the set said so.
- **NIR_0627** — **no sky in it at all.** A macro of a flower spike against a
  blurred background. Its sky reading of 0.10 had been reported for days as
  "hazy sky staying grey"; those are grey flower stems. The sky conclusions
  here rest on six frames, not seven. Its background red is also the worst
  foliage rendering in the set: clipped to a flat posterized mass with hard
  contours and pure black voids.
- **NIR_0063** — identical across all four arms, as the numbers said. But at
  foliage 1.6 it reads 0.82 and the central tree is a flat crimson mass with
  its internal structure gone, the lower half crushed to black. The foliage
  range was reported as "0.59 to 0.82 against the film's 0.60" as though
  uniformly fine. It is not; the top of that range is overcooked.
- **NIR_1651** — four panels indistinguishable by eye. This is the frame whose
  corner residual was most dramatic (6.8x corner against centre, rising 15%
  across the arms) and the frame the exchange-rate recommendation leaned on
  hardest. Nothing visible changes. **A residual that moves is not a defect
  that shows**, and that sentence cost a recommendation.
- **NIR_3406** — identical across all four, confirming the lift pins it at the
  slider's cap. Its sky is large, smooth and clean; the banding that dominates
  the other two frames is not present here.
- **NIR_1644** — the sky deepens visibly from 1.0 to 2.0, the most convincing
  sky of the eight panels that change. The defect running through it is
  **contour banding** in the cloud gradient — flat plateaus with hard stepped
  edges — present at the shipped 1.0 and becoming more chromatically distinct
  as the amount rises. Two rounds had described this as "corner blotch",
  because local residual was the statistic available and the statistic chose
  the vocabulary.
- **NIR_1376** — the same banding, worst as a stepped arc around the tree
  crown, plus **a grey halo hugging the crown itself** in every panel. That
  halo is the sky selection's edge falloff, it is decision 023's subject, and
  it had never been mentioned in any record. Its grass also carries scattered
  red speckle from the foliage band, constant across the arms.

The second outcome's candidate, opened on the owner's own photographs once it
was built into the look table: each frame as a full-frame sheet beside the build
before the change, and the places the owner's direction names as crops at 2:1,
the lit cloud also at full size.

- NIR_1716.NEF: the full frame (the build before the change, the candidate and
  Pink IR side by side), the lit cloud at 2:1 and at full size, the dark upper
  right sky at full size and the foliage at 2:1. The sky is a slate blue where the
  build before was grey, with Pink IR's strong teal on the same frame well beyond
  it in colour and in the same direction. The lit cloud is a pale blue and not
  white, with a soft mottle across its lit part that the grey build does not have.
  The dark sky is a blue grey with a fine colour grain and no blotch. The foliage
  is a lighter brick red than the grey build's deep red, with small blue dots
  along some right-hand edges of branches against bright sky.
- NIR_3460.NEF: the full frame with Pink IR beside it, the near pylon's lattice at
  2:1 and the lower clear sky at 2:1. The sky goes from slate and black to a deep
  blue, the cloud stays white with a blue cast, and the meadow reads salmon red
  where the grey build's was a pale pink white. The gaps in the lattice are clean:
  the sky seen through them is the same blue as around them, with no grey block,
  patch or rim. The members lit from the left carry a vivid blue outline with a
  red rim on the far side, where the grey build shows a faint red rim only. The
  wires are thin and dark with no bright red wire.
- NIR_3471.NEF: the full frame, the blurred leaves at the upper left at 2:1, the
  leaves along the top at 2:1 and the willow's sky gaps at 2:1. The pale sky
  becomes a clear blue with a visible mottle in its darker parts. The blurred
  leaves carry no teal. Every thin edge against bright sky carries a vivid blue
  outline with a red rim on the other side: the trunk's edge, the leaf edges, the
  holes in the leaf mass and the fine willow branches. That is the defect named
  as still wrong, and the grey build has none of it.
- NIR_3461.NEF: the full frame, the wires at 2:1 and the middle pylon at 2:1. The
  two red wires are thin and dark in both builds and the candidate adds no bright
  red wire; the faint pink blotches in the pale sky are in both. The sky under the
  cloud bank is blue slate, the bank stays white, the meadow reads orange red
  where the grey build's was pale, and the pylon's members carry thin blue
  fringes, fewer than NIR_3460's.
- NIR_3467.NEF: the full frame only. The sky is blue with white wisps, the
  building's walls stay grey and white with the cladding faintly red, the pale
  tower face stays pale, and the field reads strong red where the grey build's
  was pale. No crop of this frame was opened.

## Measured properly, 2026-09-19 — what the sky's amount can and cannot do

Re-rendered as four separate BUILDS at declared `skySat` 1.0, 1.5, 1.8 and 2.0,
foliage 1.6 throughout, each in a git worktree so the repository being measured
is never modified, and each driven only by the look button so the lift behaves
as it does for a reader.

**The declared amount is a FLOOR the lift raises per frame.** Three of seven
practice frames are pinned at the slider's cap of 2.0 by the lift whatever the
look declares, so the look's number cannot reach them: NIR_3406, NIR_0063 and
NIR_2082 are identical on all four arms. Only NIR_1376 (0.461 → 0.605) and
NIR_1644 (0.504 → 0.642) respond meaningfully against the film's 0.66.

**And the corpus was wrong by one.** NIR_0627 was carried through every arm as
a seventh sky frame, reading 0.101 / 0.103 / 0.104 / 0.105 and reported as haze
the gate correctly holds grey. It is a macro of a flower spike with no sky in
it; that reading is grey stems. Every sky conclusion here rests on six frames,
and the bottom of the quoted range is not a sky at all.

**So it widens the frame-to-frame spread rather than narrowing it** — 0.24 to
0.50 at 1.0, 0.25 to 0.64 at 2.0 — because the lift has already spent the cap
on the weak skies and only the deep ones have room to move. Whether that is
right is the judgement: a hazy sky staying hazy is arguably correct, but it is
the opposite of what the hue-band arms appeared to show.

**The blotch cost, at the scale a blotch has.** NIR_1376's corner-against-centre
improves (0.81x → 0.75x) and its rise is proportional to the colour gained.
NIR_1644's worsens (1.49x → 1.74x), its left corner going 0.0094 → 0.0138 while
its centre moves 0.0076 → 0.0083. NIR_1651's left corner rises 15% while its
centre and right do not move at all — from a corner already 6.8x its centre
before this control touches it. NIR_3406 is carried as a control and reads
identically on all four arms to four decimals, which is what makes the rest of
the movement the amount rather than the instrument.

**The exchange rate.** On NIR_1644, saturation gained per unit of corner
residual added: 47 at 1.5, 33 at 1.8, 31 at 2.0. Best at 1.5 and a third worse
above it. That narrows the call without making it — the remaining half is
whether the deeper blue on two frames is wanted at that price, which is an
appearance and not a measurement.

**Two instrument defects fixed rather than noted.**

- Check 10d of `tools/aerochrome-walk.mjs` read the sky's saturation with
  Restore depth ON, where the lift tops the amount to the cap — it returned
  0.332 at a declared 1.0 and 0.332 at 1.8, asserting nothing it claimed to.
  It now reads with the lift off, where the same frame gives 0.2576 and 0.3186,
  and the floor is re-measured at 0.21.
- And the mean it asserts cannot see a collapse, because the population is
  "pixels whose saturation clears 0.18": as the amount falls fewer pixels
  qualify and the survivors are the most saturated, so the mean goes UP. At the
  slider's 0, 1209 pixels qualified with a HIGHER mean than the 15690 at 1.0.
  Check 10d2 asserts the population SIZE, which is what actually falls.

## Outcome

**Shipped 2026-09-19 as foliage 1.6, sky 1.8.** The mechanism landed with 2.51
and is unchanged: `LOOKS.eir` global `raw.sat` 1.0, the foliage's amount on the
Colour tab's Foliage band with every band boost gated by `bandGain`'s
`SAT_GUARD_LO..HI`, and the sky's amount as `skySat` through the selection
built at open, gated by `SKY_SAT_GATE_LO..HI`. What was open was the two
amounts, which this record says are chosen from pictures once 021 had moved
(it shipped as 2.52).

**Why 1.8 and not 2.0**, which reads marginally deeper: 2.0 is the slider's
ceiling, and the Restore-depth lift's job is to top each frame up toward it
individually. At a declared 2.0 every frame arrives pinned at the cap and the
lift has nothing left to contribute for this parameter. 1.8 keeps room for it
to work. Between the two there is little visible difference; between 1.0 and
1.8 there is a clear one on the frames that respond, which is the change this
ships.

**Foliage: 1.6, shipped.** Rendered as arms on seven practice raws through the
app's own `folSat` slider, which is `params.foliage[1]`, which is what
`raw.foliage` sets — the right control. At 1.6 the foliage population reads
saturation 0.59 to 0.82 against the film's 0.60 (IR-SCIENCE 4b-iii). It comes
DOWN from the 2.0 the branch was carrying.

**Sky: still open, and the arms that were meant to settle it measured the
wrong control.** The harness set the slider with id `skySat`. That is the
Colour tab's sky hue BAND — `params.sky[1]` — and not `skySatSel`, which is
`EditParams.skySat` and the thing this record chose. So three rendered arms,
every per-frame saturation taken off them, the corner and blotch measurements
taken off the same renders, and the value that was briefly committed to
`LOOKS.eir` were all about a stage this record's **Rejected** section had
already ruled out: *"a hue band is not a place. Teals and blues wherever they
are reaches water, shade with a blue cast and a blue car."*

`skySat` reverted to its shipped 1.0. The sky's amount is chosen when arms
driven through `skySatSel` exist.

**What made it possible, and what it says about the instrument.** The two
controls sit one line apart in `syncFromUI` and their ids differ by a
three-letter suffix; both are ranges on 0..2; both are called "sky
saturation" in conversation. Nothing in the harness read back which parameter
it had moved, so every run was self-consistent and wrong together. The
arms script now sets `skySatSel` for `--sky=` and records BOTH values in its
per-frame output, so a future run states which stage it measured rather than
leaving it to the argument name.

**And the walk could not have caught it.** `tools/aerochrome-walk.mjs` asserts
the look's declared amounts, so it followed `LOOKS.eir` to whatever was put
there. Its check 10d reads the rendered sky's saturation against a floor, and
on NIR_0063 that reading was 0.332 with the shipped look and 0.332 with the
sky at 1.8 — because with Restore depth on, the lift tops the selection's
amount up per frame and had already reached the slider's cap of 2 in both
cases. A check whose reading does not move when the thing it names moves is
not asserting it; that is recorded here for whoever sets the sky's amount
next.

## Outcome, 2026-10-17 (second): the global saturation raised to 2.4, with the foliage band at 1.3, measured on five frames and shipped on the owner's yes, with its cost named

**What was asked, and what was decided.** The owner's direction of 2026-10-16 (California time) is
that under Aerochrome the sky takes the colour the channel swap gives it, and that no stage
raises it past the file. The sky selection's amount, the stage this record added, was taken
out of Aerochrome the same day, with the corrections that had grown round it, and that left
the sky grey: colour strength 17.7 of 255 on NIR_1716's sky, where Pink IR's own mapping, the
swap with its saturation, reads 43.1, and the grey sky was taken up as a defect to fix. This
record's first outcome is the other half of the same story: it took the global
saturation from 3.0 to 1.0 so that bare ground, grey walls and an overcast sky stopped taking
colour, and moved the amounts onto the foliage band and the sky selection. With the selection's
amount gone, what is left of that mechanism is global saturation 1.0 and the foliage band. The
change that was tried to give the sky the swap's colour again was a pair of numbers in
Aerochrome's row, and it carried an exit: where the sky's colour cannot be had without bare
ground, grey walls or overcast taking colour they do not hold, nothing is built. The
measurements below show the exit's condition met in part (a cloud, a pale wall and the
foliage-like ground take colour with the sky), and the pair was measured first and put to the
owner with that cost named. The owner answered yes on 2026-10-17 (California time) to landing it
with the vivid blue outlines and red rims on thin edges against bright sky named as still wrong,
and record 061 next for them. The pair is in the look table now, and the sections below say
what it is and what it costs.

**Measured first, on NIR_1716's sky (the pixels the page's own refined selection holds at one
half or more, 46 percent of the frame; colour strength is the mean over them of the largest
channel minus the smallest; page renders, sky lane off, software graphics in a container).**
The grey is the global saturation, not the fitted mixer. From Pink IR's own mapping (swap,
saturation 3.0, contrast 1.0, hue -21) one control at a time: 43.07; hue 4: 44.81; contrast
1.28: 46.19; global saturation 3.0 to 1.0: 13.24, a factor of 0.29 on its own; Aerochrome's
fitted mixer put in: 21.26, a factor of 1.6 up; its foliage band: 21.40; Aerochrome as it
stands, with its own lift and its eight-band hue shifts: 17.75 (the shifts move the sky's hue
from 165 to 203 and its strength not at all). From Aerochrome as it stands, with the mixer
replaced by the identity the sky reads 11.23, and with global saturation 2 it reads 35.47, with 3
it reads 55.12. So the mixer gives back 1.6 of the 3.5 the lower saturation took, and the sentence
that the fitted mixer takes the swap's colour out of the sky is not borne out. The mixer does the
other job: it takes the foliage from 14.5 to 68 with the band in, and the foliage then moves
little with saturation (68 at 1, 87 at 2, 98 at 3, hue 6 to 5) because it is already near the
top of the range.

**What was tried.** In `src/main.ts` Aerochrome's raw global saturation from 1.0 to 2.4 and its
Foliage band's saturation from 1.96 to 1.3, first through the page's sliders on three frames and
then built into the look table and pressed as a reader would press it (the lift left the band at 1.3
on three frames and at 1.32 on the fourth). Nothing else of the mapping moved: the mixer, the hue
shift, the contrast, the eight-band hue shifts, Sky saturation 0 and Sky colour smoothing 0 stayed,
and so did the camera-JPEG side. 2.4 is where the sky reads what Pink IR's own mapping reads on
NIR_1716 (43.05 against 43.07 through the sliders, 40.65 built), given the mixer's 1.6. 1.3 is the
band at which the foliage on that frame keeps the strength it has (65.05 against 68.27, hue 6.8
against 5.9; 65.75 built); the band at its old value with the higher saturation takes the foliage to
91.87. Pink IR was unchanged by the edit, pixel for pixel (0.0000 percent of the frame differing on
NIR_1716 against the earlier render and on NIR_3460 against the build before 2026-10-14). The pair
was taken out of the look table again after that measurement, so the owner could be asked with the
measurement in hand. On the owner's yes it is back: `LOOKS.eir` carries a global saturation of 2.4
and a foliage band of 1.3 (the band's amount is the look's, and the Restore-depth lift moves it a
little per frame, to 1.32 on NIR_3461).

**What it cost, measured (colour strength; now is Aerochrome before the change, pink is Pink
IR's own mapping with the lift's sky amount at 0, the file is the swap alone).** The file's
colour is close to one axis: the sky's channel differences are about -1.1 times the foliage's, so a
linear mixer or the global saturation scales the sky and everything that carries its direction
together, and nothing among the swap, the mixer, the global saturation and the foliage band
separates a cloud, a pale wall or an overcast sky from the open sky. They rise with it, to what the
swap gives them and no further: NIR_3460's lit cloud 10.55 now, 25.66 pink, 24.4 after; its pale
sign panel 27.87 now, 93.71 pink, 73.85 after; NIR_3467's grey wall 8.25 now, 18.38 pink, 18.43
after; NIR_1716's lit cloud 21.1 now, 48.99 pink, 53.8 after. Those populations take the colour the
file holds, at the sky's rate, and the cloud is no longer white: it is a pale blue of saturation 0.16
to 0.25. The foliage-direction populations are the other side of the one number: NIR_3467's field
78.9 now and 117.6 after, its cladding 35.8 and 61.1; NIR_3460's meadow 43.7 and 75.6 (1.5 to 1.7
times) with the band at 1.3. With the band at 1.0 they hold (field 80.3, cladding 43.9, meadow 54.1)
and the foliage falls to 0.67 of its strength on NIR_1716 (45.45) and reads salmon where it read
red. Left at its old 1.96 with the higher saturation, the field and the meadow go solid red (195.3
and 130.3). The band is the one control that chooses between holding the foliage and holding the
ground. This record's first outcome made it the foliage's amount so that the ground stayed quiet,
and how red the ground reads against how red the foliage reads is a taste question.

**And what the pictures showed, which the strengths could not.** Built and pressed, the look's
pictures were opened on five frames, with Aerochrome as it stood beside the build and Pink IR beside
both. The sky is a clear blue (NIR_1716 40.65, hue 203, against Pink IR's own 43.07, and 0.60 of the
68.15 Pink IR reads when its lift adds its own sky amount), and the foliage stays red in hue (6.8
degrees) but is a lighter coral where it was a deep red (its saturation 0.62 against 0.80). Against
that: the lit cloud on NIR_1716 reads pale blue instead of white, with a soft mottle across the lit part
at 1:1 that the grey build does not have; the darkest third of that sky reads 3.4 against the 25 wide
mean where the grey build reads 2.1, the landed build 1.7 and Pink IR 6.1 (the same statistic as the
section on the removal in the record on wires and pylons); and on bright sky against dark thin objects
every edge gets a vivid blue outline with a red rim on the other side, which is the file's red and blue
not lining up at thin edges, scaled with the sky's colour. Vivid blue pixels (blue over both other
channels by more than 60 levels) are 1.99 percent of NIR_3471's sky-gap box where the grey build has
none (0.000), 1.60 percent of NIR_3460's lattice box where it has 0.001, and 0.27 percent of NIR_3461's
middle pylon box where it has none; Pink IR reads 0.64 percent of the lattice box. The landed build
has no such outline on NIR_3471 either (its picture of the same crop was opened beside the grey
build's). The pylon gaps themselves are clean, with no grey block, patch or rim, the wires are thin and
dark with no bright red wire, and the blurred leaves carry no teal; those defects stay gone.

**Why the exit applies in part, what shipped despite it, and what is left.** The sky takes the swap's colour only with the cloud, a pale
wall, the thin edges and the foliage-like ground taking colour in proportion, because the file's colour
is one axis and nothing among the swap, the mixer, the global saturation and the foliage band acts on a
place or on an edge. That is the cost the record's first outcome removed the global saturation to
avoid, and it came back with the sky's colour. What a later change would have to separate is the sky
from the cloud and from edges, which is what the sky selection's stage with its gates did and what was
taken out of the look as the cause of the splotches; or a different model of the film's colour (the
roadmap's film model), not another number. What shipped is `raw: { sat: 2.4, contrast: 1.28,
foliage: [-2, 1.3, 1.05] }` in Aerochrome's row, and the cost above stands: a pale blue cloud, the
foliage-like ground at 1.5 to 1.7 times its colour, and the vivid blue outline with a red rim on thin
dark edges against bright sky, which is still wrong and is record 061's. The band at 1.0 would hold the
ground instead of the foliage (a salmon where it reads red); it is the one number to move if the ground
matters more than the foliage's depth, and it is measured above.

**What the mixer is not.** The fitted mixer was not replaced: the measurement shows it is not what greys
the sky, and a mixer that separates the sky from the cloud cannot be had, since the two share one
direction. The sky band on the Colour tab was not used, for the reason this record already gives
against it. `tools/aerochrome-walk.mjs` pinned the global saturation at 1 and the foliage band at 1.96,
which the look no longer carries; the walk is brought to 2.4 and 1.3 in the landing of this change.

**Landed, and checked against what was measured.** The look table was edited to the pair and the
tree built once. Aerochrome was then pressed as a reader presses it, through the page's own look
button, on NIR_1716, NIR_3460, NIR_3471, NIR_3461 and NIR_3467 (sky lane off, software graphics in a
container), and each full-frame render was compared pixel for pixel with the candidate's own captures
from the measurement: 0.0000 percent of the frame differing on all five, largest difference 0. Pink IR on
NIR_1716 and NIR_3460 was compared the same way with the build before 2026-10-14: 0.0000 percent of the
frame differing on both, largest difference 0, so the other looks are as they were. The comparer was
checked on a planted pair of known difference and then on real pictures, where the candidate against
the grey build reads 85.8 to 100 percent of the frame differing on the same five frames, so it does
fire. What is still wrong is as named above and is record 061's: the vivid blue outline and red rim on
thin edges against bright sky, a pale blue cloud with a soft mottle at full size, and the ground at 1.5
to 1.7 times its colour.

