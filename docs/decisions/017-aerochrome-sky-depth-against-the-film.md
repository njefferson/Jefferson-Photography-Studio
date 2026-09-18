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

1. **Solve the look's Sky band saturation and luminance against the film**, the
   way 4b-iii solved the hue bands: targets 0.66 at 0.32 (lighter filter, the
   reference the angles were solved to) on the six solve frames, hold-one-out,
   with the film's spread as a ceiling; verified by substituting back through
   the real pipeline and measuring as the film was measured; rendered as a
   sheet beside the shipped look before anything ships; the sky residual
   measured with the stage on beside each candidate. In-house method, and the
   lever the field uses.
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

## Rank

Directly after 013 and before 016: it is the largest measured distance to the
film left in the look, it depends on 013's stage being in place (it is), and
016's remaining half is a texture question that this does not touch. It waits
on one number — the stage's removed fraction with Restore depth on — and then
it is a solve with an existing method.
