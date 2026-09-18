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

## Rank

Directly after 018, wherever 018 sits: it multiplies the selection 018 hands
the mask, at the same shader stage, and building it on the coarse bitmap
first would mean building it twice. It does not wait on 019 or 021.
