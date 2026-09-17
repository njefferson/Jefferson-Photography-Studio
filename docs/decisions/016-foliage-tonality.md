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

**The shadow subtractive tint, at the value measured.** The canopy's output hue
is 6.4°, so the complement is 186°; at amount 0.18 into the shadow band the
render moves by 2 points of red and nothing else, and the trunk stays exactly
the crimson it was. The trunk is not a luminance shadow — it is a midtone at the
canopy's own hue — so a shadow tint at that strength cannot reach it. Not
shipped, and the finding is recorded in section 9i rather than shipped on the
method's authority. The bark colour is real and is not fixed by this item.

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
