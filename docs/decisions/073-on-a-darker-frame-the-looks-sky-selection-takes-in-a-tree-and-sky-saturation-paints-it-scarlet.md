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

## Built 2026-10-13: option 2, a second gate on Sky saturation read against the photograph's own sky colour

**What was built.** The stage now multiplies its boost by one more weight,
`1 - smooth(30°, 60°, angle) × smooth(0.01, 0.03, chroma)` (`skyRefWeight` in
`src/pipeline.ts`, the shader's `u_skyRef` in `src/gl.ts`, `compileEdit`'s `skyRef`
term for term). `angle` is between the pixel's own chroma, its red and blue minus its
luma, and the **reference**, and `chroma` is the pixel's chroma, so a grey pixel is not
asked. The reference (`skyReference`) is the median chroma of the sky map's wholly
selected texels (weight byte 250 or more) that lie in the blue quadrant (red minus
luma below 0, blue minus luma above 0, length at least 0.02), found when at least 3
texels and 1/1024 of the map's texels qualify; where none is found the gate stays open.
The map is built whenever the saturation is up, not only for smoothing or depth, and the
report's Sky map line says which direction the stage read and from how many texels. It
does not change what the selection holds, and it does not touch the foliage band.

**The hue band the option first named is not what was built.** The depth key's band
(175 to 245 degrees on the rendered mean colour's HSV hue) is a hue in another space,
and the reference is read off the photograph. On these frames the two would not be told
apart: the reference points 135 to 139 degrees on all seven frames below, within 4
degrees. It is read and not fixed because a direction fixed in advance presumes the
look gives every photograph's sky the same colour, and the white point it is derived
at moves that per photograph (069's option 10 traced the cast to the gray-world white
point), and because it adds one more constant to a record that already carries too
many (069's Rejected 2). That is a reason and not a measurement; no frame here
separates them.

**What the ramp's ends rest on** (read off the head build's captures of seven frames,
2026-10-13: for each pixel the angle between its chroma, from the picture with the
stage away, and the reference read off that capture's map). Sky pixels are those the
look's selection holds at half or more, inside a wholly selected blue-quadrant texel,
and not moved by more than 24 levels by the stage. Red pixels are those the stage moved
by more than 24 levels that read as red.
- Sky pixels: the median angle is 2.0 to 3.7 degrees on the six frames; the 99th percentile
  is 8.3 on NIR_3461, 8.3 on NIR_3467, 11.6 on NIR_3463 and 7.7 on NIR_1703, the four
  frames where the selection holds mostly sky (on NIR_3471 and NIR_3472 the selection
  holds the willow, and the same read puts 12.8% and 2.8% of the "sky" pixels past 30
  degrees, which is the tree the gate is for). On NIR_3461 and NIR_3463, 0.22% and 0.31%
  of the "sky" pixels lie past 30 degrees; they were not looked at one by one, and the
  wires the head build's selection held are the likely cause.
- Red pixels the stage makes: the smallest angle on each frame is 137.7 (NIR_3471),
  142.1 (NIR_3467), 144.0 (NIR_3461), 145.3 (NIR_3472), 147.6 (NIR_3463) and 150.1
  (NIR_1703); the first percentile is 150.1 to 156.3.
- So the sky's worst case sits about 12 degrees from the reference and the stage's red
  at 138 or more: the ramp 30 to 60 degrees has 18 degrees to spare on the sky side and
  77 on the red side. Any ramp in that gap gives these frames the same verdict; this one
  was chosen with room on both sides and not tuned inside the gap.
- NIR_1651 is left out of both counts: it is a portrait frame shown a quarter turn
  against the file's grid, and the script that read these lays the selection on the
  canvas without the turn, so 37.8% of its "sky" read as far from the reference, which is
  the grid read the wrong way up and not the sky.

**The reference was found on all seven frames**, from 116 texels (NIR_3471) and 196
(NIR_3472) to 5,033 (NIR_1703). The gate's open case, where nothing is found, was not
reached by any frame here; the willow frames, where it was expected, found a reference.

**What it did, rendered 2026-10-13 with route 087 under it** (both together; the split
was not taken): the pixels the stage moved by more than 24 levels that read as red went
from 315,356 to 0 on NIR_3467's wall, from about 1.38 million to 0 on NIR_3471 and from
about 1.13 million to 0 on NIR_3472. The wall reads a muted rose-grey, the willow dark
rose and maroon with no scarlet, and the open sky regions measured on NIR_3471 (the
centre and the left) read the same before and after to within 1.1 levels (087 has the
regions). What the gate cannot see is a wall or a tree whose own
colour lies along the sky's, and what it costs is in 087: a leaf the selection used to
hold is dark red now where it was scarlet.

## Weighed against

- **052**: the look's selection is what 052 would show the reader; a selection
  that holds a tree is the case for showing it.
- **087**: the willow frames lose 73% to 76% of the selection to the thin-structure
  test, so this gate and that route cover the same pixels twice on them. This gate is
  what cleared the wall of NIR_3467, which 087's route left.
- **069**: the same sky stages act on whatever the selection holds; this is the
  saturated half of what 069 describes for the colourless half.
- **070**: another way the border search goes wrong on one kind of frame.

## Depends

- touches 052 — the selection this record finds swallowing a tree is the one 052 would make visible.
- touches 069 — both are the look's sky stages acting on what the selection holds; a guard on either stage moves what the other has to answer for.
- touches 070 — both are the border search failing on one kind of frame; a change to how it runs moves the other's evidence.
- touches 087 — the willow frames lose most of the selection to the thin-structure test, so the gate and the test cover the same pixels there, and the wall is what the test left and the gate took.

## Options

1. **Research first, then choose**: how the border method behaves as a frame's
   noise rises, and whether measuring the gradient after the denoise, or scaling
   the thresholds by the frame's own measured noise, keeps the border in the sky.
   Proposed.
2. **Gate Sky saturation on the sky's hue as well as on saturation**, reusing the
   hue band the depth key already carries, so a tree inside the selection is not
   boosted whatever the selection does. **Chosen, and built 2026-10-13 against the
   photograph's own sky colour direction and not the depth key's band** (the section
   above has what was built, what its ramp rests on and what it did). The wording
   above is the option as first written; the band is not what runs.
3. Both.
4. Leave it: the frame was shot well under.

## Rejected

- **4, leave it**: the hue half is not about exposure, and NIR_3472, properly
  exposed, shows the same boost on willow strands in front of the sky.
- **2 with the depth key's fixed band as the reference.** Not built, and not refuted: no
  frame here separates a fixed direction from the one read off the map, which agree to
  within 4 degrees on all seven. It was set aside for the reasons above (a direction fixed
  in advance presumes every sky is one colour; one more constant), and a frame whose
  sky the look colours differently is what would decide it.

## Rank

After 052 and before 013. It can move what the look's selection holds on frames
069's checks are rendered on, so it goes where 052 goes, and 069's acceptance renders
are repeated once either changes, as 069 already says for 052 and 070.

**From 2026-10-13 its stage half, option 2, is built**, and what is open is option 1: the
border search under noise. On the willow frames 087's thin-structure test now takes most
of the selection, so what the border search still gets wrong decides what is left of the
sky there: the bright sky at the top centre of NIR_3471 and NIR_3472 was left out before
and is not looked at again here.

## Looked at

- NIR_3471, 2026-09-26: the stage sheet of full exports at the look's settings and with Sky saturation 0, Sky colour smoothing 0, both 0, foliage amount 1, the colour mixer bands reset, the 3×3 mixer at identity and the swap off, whole frame and the willow enlarged; the block goes only with Sky saturation 0. And the border drawn over the frame beside the coarse selection: the seed plunging down whole columns into the willow, the selection over the right half, the bright real sky at top centre left out.
- NIR_3472, 2026-09-26: the control sheet at the look's settings, Sky saturation 0, smoothing 0 and both 0; the scarlet strands in front of the sky at upper right go only with Sky saturation 0.
- NIR_3471.NEF, 2026-10-13: the whole frame and crops of the willow, the leaves and the upper right sky from the head build and from the build with option 2 and 087's route (087 describes them). Head: a scarlet block over the right willow and scarlet leaf masses. Build: dark rose and maroon, no scarlet; the sky centre and left the same.
- NIR_3472.NEF, 2026-10-13: the whole frame from the head build and from the build. Head: scarlet strands across the lower right willow and upper right and scarlet leaves at upper left. Build: dark rose and maroon, no scarlet, the blue at upper right kept.
- NIR_3467.NEF, 2026-10-13: the whole frame from the head build and from the build. Head: the long wall red with grey mottle. Build: the wall a muted rose-grey, the roofline glow and antenna tips gone.
- NIR_3461.NEF, 2026-10-13: the head build's picture and the build's, whole frame, whose pixels were read for their angle from the sky colour: the sky within 8.3 degrees at the 99th percentile.
- NIR_3463.NEF, 2026-10-13: the head build's picture and the build's, whole frame, read the same way: the sky within 11.6 degrees at the 99th percentile.
- NIR_1703.NEF, 2026-10-13: the head build's picture and the build's, whole frame and crown crops, read the same way: the sky within 7.7 degrees at the 99th percentile, the stage's red at 150 degrees or more.
- NIR_1651.NEF, 2026-10-13: the head build's picture and the build's, whole frame, a portrait shown a quarter turn against the file's grid; left out of the angle counts for that reason.
