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
each set separately and each visible on the reader's own Sky and Foliage
sliders, and a pixel that arrives without colour leaves without colour.

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

**The app already has the two populations as controls.** The Colour tab's
Sky and Foliage bands each own half the hue wheel, follow the channel swap,
and multiply saturation about the pixel's own — so a truly neutral pixel is
already untouched by them, and only a NEAR-neutral one (a cast of 0.03 that
a gain of 3 makes 0.09) is not. What was missing is the gate: a boost that
fades to nothing below a chroma floor. That is `bandGain` in
`src/pipeline.ts`, mirrored by name in the shader.

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

1. **The look drives the existing Sky and Foliage bands, global saturation
   1, the aqua and blue chips back to 1, and every band BOOST is gated by the
   pixel's own chroma** (`SAT_GUARD_LO..HI`, HSV saturation in linear light
   at the band stage — none of the boost below the floor, all of it above
   the ceiling). Reductions stay ungated: taking colour out of a neutral
   costs nothing. The two amounts are the look's `raw.sky` and
   `raw.foliage` triplets, chosen from rendered sheets; the reader sees them
   on the Colour tab and moves either.
2. The sky's amount through the sky SELECTION (a third slider beside Sky
   depth), the foliage through its hue band.
3. Keep the global gain and add the gate to it.
4. Gate the eight-band chips' power curve the same way.

## Rejected

- **2**: two "Sky saturation" sliders with different meanings in one app,
  and an overcast sky is grey — a selection would colour it, a chroma gate
  leaves it. The hue band with the gate gives a blue sky more blue and a grey
  one nothing, which is the rule as stated.
- **3**: a global gain with a gate still puts one amount on the foliage and
  the sky, and the report asks for two.
- **4**: the chips' power curve was chosen for a reason that still holds
  outside a look — an unmixed infrared sky sits near saturation 0.05, where
  a multiplier does nothing (the comment at `hslAt`'s use site). Changing
  it would change every saved look and every reader's chip edit. Left as it
  is; the look no longer relies on it. Named in the report as its own
  question.

## Rank

Done in the release that carries it (2.51), above everything open: it is the
look the app is named for, on a defect reported from the device with the
better rendering already found by hand.
