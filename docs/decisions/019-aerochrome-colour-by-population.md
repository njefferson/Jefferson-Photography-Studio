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

## Progress, 2026-09-19 — the foliage is settled, the sky is not

The mechanism landed with 2.51 and is unchanged: `LOOKS.eir` global `raw.sat`
1.0, the foliage's amount on the Colour tab's Foliage band with every band
boost gated by `bandGain`'s `SAT_GUARD_LO..HI`, and the sky's amount as
`skySat` through the selection built at open, gated by `SKY_SAT_GATE_LO..HI`.
What was open was the two amounts, which this record says are chosen from
pictures once 021 had moved (it shipped as 2.52).

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

