# 017 · Aerochrome's sky is bright and pale where the film's is dark and saturated

## Context

Measured 2026-09-18 while holding Restore depth's four candidates to the film
(`IR-SCIENCE.md` §9m): every candidate lands on the film's hue angles, but the
sky's saturation and value do not — the film's sky (4b-iii, lighter filter)
reads saturation **0.66 at value 0.32**, the red-filter photograph **0.92**;
the app's Aerochrome reads 0.38 / 0.37 / 0.57 / 0.76 at value 0.64–0.89 on
NIR_3406, 0063, 1651 and 1376, under every Restore-depth setting. The hue bands
were solved onto the film in 4b-iii to within 1.7°; nothing has been solved for
the sky's depth, and it is now the largest measured distance to the film left
in the look. The sky mottle stage (013's sky half, §9l) is in place, which is
the precondition: a darker, more saturated sky multiplies the residual, and
without the stage this would have reopened the defect it fixes.

Intended outcome: Aerochrome's sky sits at the film's saturation and value on
the six solve frames, the foliage and neutrals stay where 4b-iii and §9m put
them, and the sky residual stays below Pink IR's with the stage on.

## Looked up

**The film's own numbers**, already measured in this repository from the two
surviving photographs of *Making the most of Kodak aerochrome*
(AlternativePhotography.com, 2012): sky 204.0° at saturation 0.66 and value
0.32 with the lighter filter; 217.1° at 0.92 with the red filter. The same
source states the axis — a darker filter gives a darker sky and more contrast —
and that its mechanism is exposure.

**The field's lever is the sky's own hue band**, not a global move. Life Pixel's
Aerochrome emulation tutorial works the HSL panel: red and orange hue and
luminance for the foliage, *aqua and blue sliders to fine-tune skies*, moving
cyan toward blue by hue and setting the sky's depth by luminance
(lifepixel.com, "How to emulate the look of Aerochrome film"). Kolari Vision's
550 nm processing guide does the same in the HSL panel after the swap. Both are
the app's Sky band triplet — hue, saturation, luminance — which `hslAt` and the
band sliders already carry.

**What the film's sky is NOT made of**: David Kennard's EIR emulation warns that
the mixer alone leaves things pale and reaches for a curves pass pulling the
black point in, harder on blue — and this repository already records that a
per-channel curve desaturates highlights toward white (016 and 4c). A curve
darkens the sky by darkening everything.

## Weighed against

- **013, Aerochrome splotchy chroma** — its sky half shipped as the smoothing
  stage; a deeper sky raises the stage's input. The export-path measurement of
  the stage with Restore depth on (in progress at the time of writing) gives
  the fraction it removes, which is what says whether a deeper sky is
  affordable. This item is sequenced after that number exists.
- **016, foliage tonality** — the same look, a different population; the two
  solves must be checked against each other on the six frames, the way the
  band solve was checked hold-one-out.
- **4b-iii's closing item** — the share of the frame carrying no colour (13.8%
  on the film against 28–45% here) is a highlight roll-off question and stays
  separate; the sky's depth is a band question.
- **Restore depth (§9m)** — decided: A as it ships. Its colour half targets a
  sky saturation of 0.50, below the film's 0.66; once the look carries the
  film's sky the lift finds nothing to do there, which is the right order.
- **`.scope-allow`** — `EditParams.sky` is already `selection`; nothing new is
  whole-frame.

## Options

1. **Saturation by the look's aqua and blue bands, value by a depth carried by
   the sky SELECTION** — the two halves separated by measurement on
   2026-09-18 (`IR-SCIENCE.md` §4b-iv). The band's saturation is a power
   curve, so one setting collapses the frames' spread: power 2 puts three of
   seven skies in the film's window and moves the pale four halfway, foliage
   and hue untouched, the export's sky residual LOWER than shipped (17.4 → 3.3
   on the defect frame against 21.9 → 4.0), the speckle unchanged. That half
   is ready; which picture ships is the owner's, from the sheets. The value
   half cannot be a band (see Rejected) and is a selection problem first: the
   sky bitmap refined to the working copy's edges, a depth keyed on the map's
   LOCAL sky chroma rather than the pixel's, and a window that leaves an
   overcast sky pale. Prototyped twice; reaches 0.40–0.51 on clear skies at
   the film's saturation, export residual halving with the sky's chroma (17.4
   → 1.6 on the defect frame, mean chroma 80.5 → 40.0); not shippable on the
   384 px feathered mask.
2. Move Restore depth's cool-band reference to the film's 0.66 and add a
   luminance target.
3. Anchor auto-exposure below the sky.
4. A curves pass with the black point pulled in, harder on blue.

## Rejected

- **2, through the lift**: the lift is per-frame adaptive and runs under every
  look, so a film-derived target would colour Pink IR's sky too; and its
  references are constants measured under a different Aerochrome — adding one
  more is the fitted-constants pattern 013's gate exists to name.
- **3, exposure**: whole-frame, and right for its own reason (the 97th
  percentile at 0.85 is the reference renderers' shape); the sky's value is a
  property of the look, not of the exposure.
- **4, curves**: darkens everything to darken the sky, and per-channel curves
  desaturate highlights toward white — the exact trade 016 measured.
- **The band's luminance for the value half — measured and rejected
  2026-09-18.** Luminance 0.5 on the aqua and blue bands lands the sky at
  0.31–0.50 and darkens by more than a tenth 41% of NIR_1376, 55% of NIR_3406
  and 42% of NIR_1651; decomposed by chroma as shipped, the bulk is the pale
  IR-bright field, the concrete apron and the horizon haze, which share the
  sky's hue band at a chroma no gate separates from a pale sky. A saturation
  weighting (darktable's colour-equaliser threshold) spares the greys and not
  those. A hue band cannot tell a pale-blue field from a pale-blue sky.
- **A mask-carried depth on TODAY'S mask — prototyped twice and rejected for
  shipping, 2026-09-18.** Reaches the film's value where the mask is right and
  costs three things the pictures show and the film instrument cannot: a pale
  rim at every sky boundary (the 384 px feathered bitmap's ramp, and the
  horizon haze falling below the chroma gates), a snowstorm of pale dots on an
  overcast sky (a depth keyed on a pixel's own hue or chroma darkens half of a
  hazy sky's pixels and leaves the rest), and a seam under a cloud. The
  hue-and-chroma-gated version fixed the mask's false positive on a frame with
  no sky (NIR_0627, 58% "sky" by the mask, 0.1% of the frame moved) and left
  every grey neutral at 0.0% darkened, so the gating is right; the selection
  under it is not fine enough for a luma multiplier.

## Measured, 2026-09-18

Seven frames, Restore depth on, through the app, film instrument, hold-one-out;
the sheets sent the same day carry A, the saturation candidate, the band
luminance at 0.5 and the gated mask prototype on every frame, numbers under
each. Every figure is in `IR-SCIENCE.md` §4b-iv. The saturation half awaits
the owner's pick from the pictures; the value half is re-ranked behind a
boundary-accurate sky selection, which is the selection 006 (mask by subject)
also needs.

## Outcome, part one — the saturation half, 2026-09-18

**Shipped on the owner's pick from the sheets:** the look's aqua and blue bands
carry a saturation power of 2 (`src/main.ts` `LOOKS.eir.raw.hsl`, `35,2,1` and
`0,2,1`). Measured through the app with Restore depth on: three of seven
skies inside the film's window (1376 0.81, 1644 0.87, 1651 0.70 against
0.66–0.92), the pale four halfway (3406 0.38 → 0.56, 0063 0.38 → 0.57, 0627
0.17 → 0.39, 2082 0.21 → 0.37); foliage saturation, value and every hue angle
unchanged to two decimals; the export's sky residual on the defect frame 17.4
→ 3.3 against the shipped 21.9 → 4.0; the speckle unchanged. `aerochrome-walk`
drives all three sliders of every band and holds the sky's saturation on
NIR_0063 above 0.53 (0.393 before, 0.570 after). Every figure in
`IR-SCIENCE.md` §4b-iv.

**What turned out wrong on the way.** The plan's arithmetic overshot the
render by 0.06 (√0.38 = 0.62 predicted on 3406, 0.56 measured): the lift's
colour half re-solves against the bands. And the eye read the pale dots above
3406's roof as worse under the deeper blue; two instruments said the same
dots at the same excess. Contrast is not more speckle.

**Still open — the value half.** Not a band (its luminance darkens the pale
ground and haze that share the sky's hue) and not affordable on today's
128-texel sky weight (a rim at every roofline, a snowstorm on an overcast
sky, a seam under a cloud). Stage two: the sky bitmap refined to the working
copy's edges by a guided filter against its luma, a depth keyed on the map's
LOCAL sky chroma with a window that leaves an overcast sky pale, a Sky depth
slider, `skyDepth` on the look. The selection is the one 006 needs too.

## Rank

Part one shipped. The open remainder sits directly above 006 (mask by
subject), because both wait on the same thing — a sky selection accurate to
the picture's edges — and this one has the measured method and the
instruments for it. Above it stay 012–015, which are reported defects.
