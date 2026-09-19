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

## Outcome

Shipped 2026-09-19, option 1 as written. The mechanism landed with 2.51 —
`LOOKS.eir` global `raw.sat` 1.0, the foliage's amount on the Colour tab's
Foliage band with every band boost gated by `bandGain`'s `SAT_GUARD_LO..HI`,
and the sky's amount as `skySat` through the selection built at open, gated
by `SKY_SAT_GATE_LO..HI`. What stayed open until now was the two amounts,
because the record said they are chosen from pictures after the correction
had moved (021), and 021 shipped as 2.52. **Foliage 1.6, sky 1.8.**

The amounts were rendered as four arms through the app's own sliders on
seven practice raws, composed into per-frame sheets, and chosen from the
pictures. At foliage 1.6 the foliage population reads saturation 0.59 to
0.82 against the film's 0.60 (IR-SCIENCE 4b-iii).

**What the sky's amount does and does not reach, measured across seven
frames.** At `skySat` 1.0 the sky population reads 0.10 to 0.50; at 1.5,
0.15 to 0.73; at 1.8, 0.18 to 0.79. Only two frames carry a sky deep enough
to reach the film's 0.66 at any amount — NIR_1376 and NIR_1644, which land
at 0.79 with 1.8, between the film's two filter references (0.66 with a
yellow filter, 0.92 with a red). The other five are haze and overcast, and
the saturation gate deliberately holds them near grey: NIR_0627 moves 0.10
to 0.18 across the whole range. The amount therefore does not flatten the
set to one number, and was never going to — what it does is narrow the
spread, and 1.8 narrows it more than 1.5 because the weak-sky frames gain
proportionally more (NIR_1651 +20%, NIR_3406 +10% from 1.5 to 1.8) while
the two strong ones gain least (+8%, +13%), the guard's upper range having
taken them.

**What turned out wrong: the first corner measurement was at the wrong
spatial scale, and a splotch is not grain.** The sky was reported as
splotchier in the corners at the higher amount, and the first instrument
measured chroma residual against a 5x5 local mean — which cannot see a
patch that has drifted off-colour over thirty pixels, because the local
mean drifts with it. Re-measured by pooling the chroma into 24-pixel blocks
and taking each block's distance from its 3x3 block neighbourhood, the
answer inverts: the blotch roughly doubles to triples between 1.0 and 1.5
(NIR_3406 0.0060/0.0093/0.0083 to 0.0105/0.0129/0.0131, left/centre/right;
NIR_1644 0.0094/0.0076/0.0113 to 0.0204/0.0190/0.0183) and then adds
nothing much between 1.5 and 1.8 (NIR_3406 +6 to +12%, NIR_1644 flat or
slightly down). **The cost is paid at 1.5; 1.8 is close to free.**

**And it is not a corner phenomenon.** Corner over centre at the blotch
scale is 0.89 / 1.01 / 1.06 on NIR_3406 across the three amounts and 1.48 /
1.07 / 1.29 on NIR_1644 — the corners and the centre track together. One
frame does have a genuinely blotchy corner, NIR_1651's left at 0.0158
against a centre of 0.0012, and it reads that way at the SHIPPING amount of
1.0, before this change touches it. So the corner residual is in the data
the look multiplies, not something the amount introduces there, and a
corner-shaped remedy would be aimed at the wrong variable. The frame-wide
chroma denoise that 013 is about is the remedy, and it is ranked.

Two things found on the way and not fixed here. NIR_1376's centre band
spikes to 0.0238 at 1.8 — five times its 1.0 reading and 2.4 times its 1.5
one — while its corners barely move, which is the shape of the selection
admitting cloud structure at the higher amount rather than of noise; that
is 018's and 023's territory and is recorded on 013. And NIR_0627 and
NIR_2082 give no blotch reading at all: neither has a top band with enough
sky blocks at 80% purity to pool, which is itself the finding that the gate
is holding those frames grey as designed.

NOTES.md "Aerochrome's two amounts, chosen from pictures" carries the
per-frame numbers.
