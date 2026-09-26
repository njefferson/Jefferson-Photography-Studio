# 066 · Aerochrome is rendered from a model of the film, not tuned toward it

## Context

The Aerochrome look reaches the film's colours by per-hue band shifts and
saturation stages tuned against the film's measured numbers (4b-iii). On
2026-09-25 two tuned candidates were built and inspected at full resolution,
96 tiles of 1400 by 932 on NIR_3461 and NIR_3466, each opened:

- **Aerochrome tuned to the film** (Sky depth 0.35, the look's sky saturation
  at its maximum 2, Foliage saturation 2, Foliage luminance 1.5, lens profile
  at 1). The sky darkens, but a light halo about 200 px wide stands beside
  every building and pylon leg (the sky's brightness against the shipped look
  0.91 at 10 px from the NIR_3466 building's edge, 0.65 in open sky), the
  sky inside the near pylon's lattice is not darkened at all, the tall
  building's pale face is darkened as if it were sky (210 to 135) with a
  bright round hole in it, the lit grass clips to flat white (22.8% of one
  tile at 245 or more in every channel, against 2.6% as shipped), and the grey
  road carries twice the red speckle (38.3% of road pixels at saturation 0.35
  or more, against 18.3%).
- **Pink IR tuned to the film** (global saturation 3, band values solved):
  orange foliage and grass, cladding ringed in yellow-green and purple, red
  and blue fringes on every steel member, mottled cloud, and the upper sky
  crushed to black (29–37% of the corner tiles at 12 or below). Applied to
  the second frame with the first frame's values, its foliage lands 16° off.

Every one of those numbers was reached by moving the app's own controls and
measuring its own output, which is the loop IR-SCIENCE 4b-viii and 4b-ix now
replace with what the film and the field say.

## Looked up

IR-SCIENCE.md 4b-viii and 4b-ix, researched 2026-09-25, carry the sources in
full. What bears on this record:

- **The film, from Kodak's data sheets** (AS-77/TI-2562, TI-2323): the
  infrared layer takes visible red and green too (only about 53% of its
  daylight exposure is infrared) and is deliberately about 1.4 stops slower
  than the other two; the tone curves are steep (gradients 2.6–4.3, about
  three stops from dense to clear). The film's red foliage is dense magenta
  and yellow dye from foliage being dark in the visible, not a saturated
  infrared record; its dark sky is the slow infrared layer seeing almost
  nothing of skylight; clouds come out near-white; overexposed foliage drifts
  toward magenta-pink.
- **This camera's one colour axis is a red-to-infrared ratio**, a vegetation
  index scaled by one camera constant; the film's green layer is not in the
  file and must be synthesised.
- **The published practice for a missing band** is a blend built per pixel
  from the bands measured, with its weights driven by a vegetation index
  (satpy `NDVIHybridGreen`; GOES-16's synthetic green), or a colour lookup
  fitted to registered reference images (Hogervorst and Toet 2010).
- **Colour at low frequency, re-attached to the clean infrared detail with an
  edge-aware filter** (Limmer and Lensch 2016), and a gain that shrinks where
  the colour signal is weak rather than amplifying it (Lim and Silverstein,
  HP Labs 2004): no saturation gain improves the chroma's signal-to-noise.
- **No LUT claims Aerochrome from a 665–720 nm file**; the infrared-specific
  LUTs are channel swaps expecting the frame before any swap, and PictureFX's
  Aerochrome maps mid-grey to mauve.
- **Practitioners say Aerochrome from a 720 nm camera works "to a lesser
  degree"** (LifePixel), and Kennard's filter test reaches red foliage with a
  blue sky only at 580 nm and below.

## Weighed against

- **052, "The look's sky adjustments read a selection the reader cannot see"**:
  the current look darkens the sky through a selection, and that selection is
  where the halo comes from (052's 2026-09-25 measurements). A per-pixel film
  model derives the sky's darkness from the index itself, so whether it needs
  a sky selection at all is the first thing its build has to measure.
- **013, "Aerochrome is the right colour and comes out splotchy"**: the chroma
  noise this record's model has to control is 013's defect; the model's
  low-frequency colour is the literature's answer to it.
- **017, "Aerochrome's sky depth against the film"** (archived): the sky-depth
  stage this model would replace.
- **016 and 019** (archived): the look's population work, which a film model
  supersedes if it ships.
- **061, "Red and blue do not line up at thin edges"**: edges the model's
  colour re-attachment has to respect.
- **065 and 028**: sky the selection cannot reach, which a per-pixel model
  would not need to reach.
- **The two-image route** (IR-SCIENCE 4b-ix): an infrared frame and an
  ordinary colour frame give the film's real mapping; this record approximates
  it from one image.

## Depends

- touches 052 — the model derives the sky per pixel; whether it still needs the look's selection is measured when it is built.
- touches 013 — the chroma noise the model controls is 013's defect.
- touches 017 — the sky-depth stage this model would replace.
- touches 061 — the colour re-attachment has to respect the edges 061 corrects.
- touches 065 — sky inside a lattice, which a per-pixel model does not need a selection to reach.
- touches 028 — sky through a canopy, the same.
- touches 016 — the look's foliage population work, which this model supersedes if it ships.
- touches 019 — the look's sky population work, the same.

## Options

1. **A film model.** Chosen.
   - Take the two things the file measures: infrared luminance, and the
     vegetation index on the one colour axis.
   - Synthesise the film's three layer exposures from them. The infrared
     layer comes mostly from luminance, and the red and green layers from the
     index, in the way satellites build a missing green. The mapping is
     fitted from reflectance spectra run through Kodak's curves (4b-viii), or
     from registered reference frames.
   - Run those exposures through the film's own characteristic curves and
     dyes.
   - Carry the colour at low frequency and re-attach it to the infrared
     detail with an edge-aware filter.
   - The two balances the sources describe (Kodak's own, and a scan balanced
     so grey reads neutral) are rendered and shown before one is chosen.
2. Keep tuning the current look's band shifts, saturation stages and sky
   depth against the film's numbers.
3. Pink IR re-tuned as the Aerochrome button.
4. An existing Aerochrome LUT over one of the looks.
5. Leave Aerochrome as it ships.

## Rejected

- **2, keep tuning.** Measured on 2026-09-25 at full resolution: the tuned
  look halos at every edge, darkens a pale building as sky, clips the grass to
  white and reddens a grey road. Those numbers came from the app's own
  controls, and the dark sky depends on a selection that is wrong over whole
  regions. Tuning more constants against one frame's numbers is the loop the
  research replaces.
- **3, Pink IR.** At full resolution it gives orange foliage, ringed cladding,
  fringed steel, mottled cloud and a crushed sky. It misses the film on the
  second frame by 16° in foliage. Its saturation of 3 amplifies the channel
  residual that 4c-iv names.
- **4, a LUT.** None exists for this input. The Aerochrome LUTs are for
  ordinary colour photos (PictureFX turns grey mauve) or for full-spectrum
  captures with a filter. The infrared LUTs are channel swaps that undo the
  app's own swap when applied last.
- **5, leave it.** Its sky is not dark and the film's is.

## Rank

**Seventh**, after 069, 070, 052, 013, 068 and 065, and above 061, in the
Aerochrome work the queue now leads with (settled 2026-09-25). It sits below
the white guard (069) and the rotation fix (070) because both change the sky it
is measured against: 069 is the rule its clouds must meet if it replaces the sky
stages, and 070 moves the look's own sky on a turned photograph. It sits below
052 and 013 because both change the ground it is measured on: the sky
selection, and the chroma noise the model must control. It sits below 068,
which follows the three records it needs directly and changes nothing this
model is measured on, since today's finder stays the default on every Sky mask.
It sits below 065 because a fill changes which sky a reader's mask holds. It
sits above 061 because 061's channel alignment touches thin edges only, which
the model's colour re-attachment respects, and nothing in the model is tuned
against them. Its first measurement decides whether it needs 052 at all.

## Looked at

- NIR_3461, 2026-09-25: as shipped, Aerochrome tuned to the film and Pink IR tuned to the film, lens profile at 1, each cut into 16 tiles of 1400 by 932 and every tile opened; 1:1 crops of the halo at the near pylon, the round discs, the white blotches in the darkened sky and the clipped grass.
- NIR_3466, 2026-09-25: the same three renders and tiles, every tile opened; 1:1 crops of the halo beside the tall building, the building face darkened as sky, the red on the grey road, the cloud mottle and the crushed upper sky.
