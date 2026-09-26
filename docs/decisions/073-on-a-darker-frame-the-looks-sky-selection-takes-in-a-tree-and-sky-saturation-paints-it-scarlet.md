# 073 · On a darker frame the look's sky selection takes in a tree, and Sky saturation paints it scarlet

## Context

**Found 2026-09-26** while answering whether a Kolari IR Chrome filter helps. Under
Aerochrome, NIR_3471 (taken through the filter, 2.4 stops darker than NIR_3472 of
the same scene) showed a soft-edged scarlet block about 1.9 megapixels across over
the centre of a weeping willow, brighter as well as redder (value 0.65 against 0.35
with the stage off); NIR_3472 showed smaller scarlet strands at upper right.

**Diagnosed by rendering the frame with one stage at a time set to neutral,
through the app's own export, every render opened.** Sky saturation at 0 removes
the block on both frames and nothing else does; Sky colour smoothing at 0 removes
only a lattice of dots inside it. The boost correlates 0.977 with 1 + 1.8 × the
refined sky selection, and 99.5% of the block's red pixels sit where that
selection is above half. Two things combine:

- **The selection swallowed the willow.** On NIR_3471 it covers 45.7% of the frame
  against 20.5% on NIR_3472. The border search (IR-SCIENCE 9o) ran to the bottom
  of the frame in some columns and 1,135 to 2,431 pixels deep across most of the
  right half, stepping by up to 235 rows between neighbouring columns, well past
  the 85-row trigger for its column clean-up, which ran and cleared nothing; the
  bright real sky at the top centre was left out. Its smoothness threshold came
  out at 0.334 on the darker frame against 0.187 on the other. The thresholds are
  quantiles of the photograph's own gradient, so a noisier frame raises them and
  more texture counts as smooth sky. That last link is a pointer, not a measurement.
- **Sky saturation asks only whether a pixel has colour**, not whether it is the
  sky's colour. Its gate (saturation 0.05 to 0.13) is fully open on foliage at
  0.67, so anything the selection holds is multiplied by up to 2.8 in chroma, and
  red rises while green and blue clamp.

The frame was shot 2.4 stops under, but the second half is general: any saturated
thing inside the look's selection gets the same boost, which is also where 069's
tinting lives.

## Looked up

- The border method is Shen and Wang (IJARS 10(10), 2013), recorded with its
  sources in IR-SCIENCE 9o; its thresholds are a sweep over 120 values, taken here
  as quantiles of the photograph's gradient rather than the paper's fixed range.
- Nothing yet on how the method behaves as noise rises; that is the research this
  record needs before an option is chosen.

## Built already

- `src/skyhorizon.ts`: the border search, its quantile thresholds and
  `SKY_PARTIAL_STEP` (1/3) for the column clean-up.
- `src/sky.ts`: every pixel above the border is a seed and seeds are selected
  regardless of colour; the fill then carries the selection on.
- `src/pipeline.ts` and `src/gl.ts`: Sky saturation, `1 + skySat × fine × gate`
  with the gate on the pixel's own saturation; the look sets `skySat` 1.8.
- The depth key already weighs the sky's HUE (`hueWeight`, 175 to 245 degrees, in
  `src/skymap.ts`), so a hue test for the sky exists in the app.

## Weighed against

- **052**: the look's selection is what 052 would show the reader; a selection
  that holds a tree is the case for showing it.
- **069**: the same sky stages act on whatever the selection holds; this is the
  saturated half of what 069 describes for the colourless half.
- **070**: another way the border search goes wrong on one kind of frame.

## Depends

- touches 052 — the selection this record finds swallowing a tree is the one 052 would make visible.
- touches 069 — both are the look's sky stages acting on what the selection holds; a guard on either stage moves what the other has to answer for.
- touches 070 — both are the border search failing on one kind of frame; a change to how it runs moves the other's evidence.

## Options

1. **Research first, then choose**: how the border method behaves as a frame's
   noise rises, and whether measuring the gradient after the denoise, or scaling
   the thresholds by the frame's own measured noise, keeps the border in the sky.
   Proposed.
2. **Gate Sky saturation on the sky's hue as well as on saturation**, reusing the
   hue band the depth key already carries, so a tree inside the selection is not
   boosted whatever the selection does.
3. Both.
4. Leave it: the frame was shot well under.

## Rejected

- **4, leave it**: the hue half is not about exposure, and NIR_3472, properly
  exposed, shows the same boost on willow strands in front of the sky.

## Rank

After 052 and before 013. It can move what the look's selection holds on frames
069's checks are rendered on, so it goes where 052 goes, and 069's acceptance renders
are repeated once either changes, as 069 already says for 052 and 070.

## Looked at

- NIR_3471, 2026-09-26: the stage sheet of full exports at the look's settings and with Sky saturation 0, Sky colour smoothing 0, both 0, foliage amount 1, the colour mixer bands reset, the 3×3 mixer at identity and the swap off, whole frame and the willow enlarged; the block goes only with Sky saturation 0. And the border drawn over the frame beside the coarse selection: the seed plunging down whole columns into the willow, the selection over the right half, the bright real sky at top centre left out.
- NIR_3472, 2026-09-26: the control sheet at the look's settings, Sky saturation 0, smoothing 0 and both 0; the scarlet strands in front of the sky at upper right go only with Sky saturation 0.
