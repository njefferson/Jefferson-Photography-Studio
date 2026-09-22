# 016 · The foliage is the right colour and reads as a blob

## Context

Reported from the iPad, 2026-09-17, on the Aerochrome look: the foliage looks
like the right colour but just a blob of it, with the question of how to add the
detail back the way the film actually looks, or the way people who edit these
files normally do it. The same message says the research had been done and not
applied holistically, which is the accurate charge — the hot-spot work of the
previous day had gone into `IR-SCIENCE.md` section 9 while the reference
workflows' foliage method had not been read at all.

Measured before anything was changed, on the lone oak frame: the canopy is 1.57
million pixels, 30% of the frame, classified once on the shipped render and held
fixed. Fine texture reads **40.15** with the luminance bilateral off, **34.11**
under the 5×5 filter this app shipped until 2026-09-16, and **30.76** under the
13×13 that replaced it. So the denoiser costs the canopy 23% of its modelling
and the widening is a third of that — and the commit that widened it claimed
detail was not the price, on a busy-block metric taken from a different frame.

The canopy is not clipped (1.1% of foliage pixels at or above 250 in red) and
the look widens its tonal range rather than compressing it (spread 125 with the
look, 65 without). The missing thing is texture, not exposure or range.

Intended outcome: the canopy reads as leaves, the sky keeps the speckle fix that
the widening bought, and the look carries whatever it takes rather than leaving
it on the reader to find.

## Looked up

**The white-foliage method**, from the reference video transcribed for section 9h
(robsheaphotography.com, "How do you get white foliage in infrared
photography"): take the foliage hue's saturation down in the colour mixer, then
push that same hue's luminance up — *increase the brightness so it pops a little
bit more*.

**Subtractive colour**, from the same source ("using subtractive colour to
enhance infrared photos"): the canopy's colour casts onto bark and branches, so
find the cast's hue, add 180°, and put the complement into the shadows only. The
structure goes neutral and the canopy stands off it. The article is explicit that
painting the branches by hand is the alternative and is too slow to do.

**The film look needs curves, not more saturation** — davidkennardphotography.com,
"Creating Kodak EIR / Aerochrome style digital photos": a channel mixer alone
leaves foliage *much pinker than most film EIR / Aerochrome images — I would call
it candy floss pink*, and the look needs the mixer plus a curves pass pulling the
black and white points in, harder on blue.

**And the caution this repository already carried**: a tone curve applied
independently per channel desaturates highlights toward white, which is the
standard approach in most raw software and exactly what `src/pipeline.ts` does.
Leaning on per-channel contrast for canopy modelling trades colour for flatness.

**Mid-frequency local contrast is the field's own detail lever** and this app
already implements it — `src/raw/detail.ts`, a band-pass between two detail
blurs folded back as a hue-preserving luminance gain, which is what Lightroom's
Texture slider is. Its own header says it runs on linear data right after
denoise, which is where the loss happens.

## Weighed against

**`013` — Aerochrome is the right colour and comes out splotchy.** Same look,
same day's reports, and the two must not be confused: 013 owns the CHROMA
blotch and the absence of a colour-noise stage, this owns the LUMINANCE texture
and the structure inside the canopy. They touch different filters — the floor
moved here is the luma bilateral's, and `params.chroma` is untouched — so
nothing here re-opens 013 or prejudges it. What this does owe 013 is the honest
statement that lowering the luma floor raises the sky's pale luminance speckle
4.3%, which is the population section 4c-xxii widened the kernel for.

**`NOTES.md` "## The sky, traced from the photosite forward"** and section
4c-xxii: the 13×13 widening cleared 76% of a deep sky's speckle. That gain is
real and is not given back here. It is why the radius is left alone.

**`015` — the lens correction against the reference.** Already shipped its first
commit and awaiting the device pass; it is about the centre of the frame washing
out, not about the canopy. No overlap beyond both being reported the same week.

## Depends

- distinct-from 013 — same look and the same day's reports, and the two must
  not be confused: 013 owns the CHROMA blotch, this owns the LUMINANCE texture
  inside the canopy. They touch different filters, so nothing here re-opens 013
  or prejudges it.

## Options

**Chosen: lower the look's denoise floor to 0.45 and have the look carry 0.25 of
mid-frequency local contrast.** Two halves of one decision — the floor cleans
the sky and flattens the canopy, so the look that raises the floor owes the
structure back. Measured on both populations:

- Floor 0.80 → 0.45: canopy texture 30.78 → 34.03, **+11.6% per unit
  brightness**, with the canopy's mean luma unmoved (121.1 → 120.0). The sky's
  speckle rises 4.3%, 2.645 → 2.758.
- Plus `texture: 0.25`: 35.25, **+16.0% per unit luma**, canopy luma 119.5 — it
  does not brighten the canopy at all. The sky pays another 1.9%.

Together they recover **48% of the canopy's loss for 6.2% of the sky's gain**,
and both land on sliders the reader can see and drag. 0.40 of texture reaches
56% for 7.3% and is one drag away; 0.25 is the moderate amount, chosen so the
default does not crunch bark edges on a frame nobody has checked.

## Rejected

**The foliage hue's own luminance, which is what the reference video actually
demonstrates.** Rejected on measurement. Lifting the canopy's three bands as a
ladder — 1.06, 1.10, 1.14, 1.18, 1.22 — raises texture 5.9%, 9.6%, 12.9%, 15.6%,
17.7% and the canopy's mean luma 5.9%, 9.6%, 13.1%, 16.2%, 19.0%. Texture per
unit luma is flat at 0.254 the whole way and falls above 1.10. It is a
brightness control; a brighter population measures more local variation for
free. The video's own words for it say so, and reading it as a detail fix was
this repository's error rather than the source's. Shipping it would have been
+15.6% on a number and a brighter tree.

**The shadow subtractive tint — and this one was measured twice, because the
first measurement would have shipped a defect.** The canopy's output hue is
5.8°, so the complement is 186°. On the oak it does exactly what the method
says: at balance 0 the dark structure loses 3.6%, 7.7%, 14.0%, 20.1% and 24.8%
of its saturation at amounts 0.18, 0.35, 0.55, 0.70 and 0.80, while the bright
leaves lose 0.5%, 1.0%, 1.5%, 1.9% and 2.2% — eleven times more effect on the
bark than on the leaves, and at 0.70 the crop shows trunk and limbs reading as
dark wood with the canopy visibly unchanged. That was a finished-looking fix.

**Then the second frame.** The tint is weighted by LUMA ALONE and is ADDITIVE in
display RGB, so it lands on every dark thing in a photograph and asks nothing
about hue. On the carport frame, 858,273 dark pixels that carry no colour as it
ships — deep roof shade and the aircraft — measure saturation 0.005 at hue 359,
and with the tint at 0.70 measure **0.989 at hue 201**. Grey shade driven to
saturated teal, because adding a luma-free tint vector to a near-black pixel
clamps one channel to zero and leaves the other two positive.

So it is rejected at every amount, not at 0.18. The method is sound and it is a
**per-photograph hand edit**: in the source's own workflow a photographer picks
the amount while looking at that frame, and a look constant is a claim about
every frame including the ones whose shadows are a roof. The control stays where
it is, on the Grade tab's shadow wheel. What the bark actually needs is a
luminance-weighted saturation REDUCTION — multiplicative, so near-black stays
near-black — and the app has no such control, because `hslAt`'s saturation is
selected by hue and the trunk shares the canopy's hue exactly. That is a new
pipeline stage rather than a constant. Every number is in `IR-SCIENCE.md`
section 9j.

**Per-channel black and white points**, Kennard's curves pass. Measured at
+3.0% canopy texture, the weakest of the three, and this repository already
carries the reason to distrust it: per-channel contrast desaturates highlights
toward white, which is the mechanism behind the very washing-out the canopy's
pale highlights already show.

**Shrinking the denoise radius.** Swept 11×11, 9×9 and 7×7 with sigma held at
R/2 so only the extent moves: the narrowest recovers 29% of the canopy's loss
and hands back 28% of the sky's gain — very nearly the widening's own trade run
backwards. Strength and local contrast both beat it because neither touches the
kernel the sky fix depends on.

**Raising saturation further.** It is already 3.0 and 013 is open precisely
because of what that amplification does to the residual. More of it cannot add
structure that is not there.

**Sharpening the canopy** (`sharpen`, the high-frequency band). Rejected as the
wrong band: the canopy's missing modelling is leaf-cluster scale, which is what
the mid-frequency band-pass covers, and the high-frequency pass re-introduces
exactly the grain the denoise floor exists to remove — `detail.ts`'s own header
says the high-pass is measured pre-denoise, so sharpening after denoising puts
some of it back.

**Making the radius a reader control instead.** Deferred, not rejected on
merit: it is a second slider for a kernel whose two populations pull opposite
ways, and the measurement above says strength already reaches further than the
radius does. If the sky ever needs the 13×13 back on a frame where the canopy
needs 7×7, that is the item to open.

## Rank

Directly after `013`, and above `014` and `015`. It is the same look and the
same week's device report as 013, it is a defect this repository introduced in
the commit before it, and the fix is measured on both populations rather than
proposed. It sits below 013 because 013's chroma stage is the larger piece of
work on the same look and because the splotch is visible on more frames than the
blob is — a canopy that reads flat is a frame that looks dull, and a mottled
gravel bed is a frame that looks broken.

## Outcome

**The chosen work is on `main`.** The `eir` look carries `denoise: 0.45` and
`texture: 0.25` in `src/main.ts`, with the comment block above the entry holding
the measurements the choice was made on. `applyLook` applies the denoise as a
FLOOR and the texture as a look-owned value that never overwrites a hand-dragged
one, so a reader who has already moved either keeps what they set. The
mid-frequency band-pass is real in both render paths rather than approximated in
one, both values land on reader sliders, and `tools/aerochrome-walk.mjs` pins
the pair as `FLOOR` and `TEXTURE` so neither can drift silently.

**The introducing commit is not named here.** This checkout is shallow and the
commit sits below its graft, so the SHA could not be read. Naming one would be a
value produced to look like a value that was read.

### What survived

**Whether Aerochrome should carry a Shadow colour amount of its own.**
`shadowSat` is absent from the `eir` entry. That is an appearance choice, and
this repo's rule is that such a choice is SHOWN with candidates rendered through
the real pipeline, never argued in prose — so it is not settled by this record
and should not be settled by reading it.

The crimson trunk went where this record routed it: to a luminance-weighted
saturation reduction, which shipped as the separate Shadow colour control rather
than as part of the foliage work. That was the rejected option here and the
rejection held.

### What turned out wrong

Nothing in the code. This item sat open at rank 11 with its chosen work already
shipped, and no gate could see it — the decision gate asks whether an open item
HAS a record, never whether that item's work has LANDED. It was found by an
audit that compared all 24 open items against `main`, one agent per item, each
verdict then adversarially re-checked in the opposite direction.
