# 013 · Aerochrome is the right colour and comes out splotchy

## Context

Reported from the iPad, 2026-09-17, with two frames: the colour is right and the
picture is very splotchy. In the frames sent, the foliage breaks into hard-edged
white and red patches rather than reading as leaves, and the gravel carries a
coarse blue and grey mottle that the subject matter does not have.

This is feedback on a look that shipped to production the same day, which is what
makes it urgent rather than merely ranked: the colour decision was approved on
rendered sheets and the sheets did not show this, so something about the frames
that were shown differed from the frames being shot.

What the look does, from the app rather than from memory. `LOOKS.eir` carries
`mix3` with coefficients as large as −1.44 and 1.37, then `raw.sat` **3.0** and
`raw.contrast` 1.15, plus a denoise FLOOR of 0.8. `src/raw/denoise.ts` is a 5×5
bilateral on LINEAR sensor data, run immediately after decode and before white
balance, exposure and saturation — its own header says so, and says why: IR
editing multiplies channels by large factors, so noise has to go while it is
small. Its range weighting is on **relative luma**, and `rangeSigma` is
`0.1·s²`, so the shipped floor of 0.8 gives sigma 0.064.

The intended outcome: the same colour, without the patches.

## Looked up

**Searched before touching anything, and it named the mechanism.** A tone or
contrast control applied per channel produces mottling and blotches at higher
values; and the standard order in raw processing is to reduce COLOUR noise first
and hard — colour blotches rarely carry real information, so strong chroma
reduction costs little — while luminance speckle overlaps genuine texture in hair,
fabric and foliage and deserves a lighter hand. RawTherapee exposes this as a
chrominance curve that reduces chroma noise as a function of the pixel's own
chroma: strong where saturation is low, weak where it is high.

Sources: RawPedia's Noise Reduction page
(https://rawpedia.rawtherapee.com/Noise_Reduction), Adobe's Camera Raw sharpening
and noise reduction documentation
(https://helpx.adobe.com/camera-raw/desktop/using/sharpening-noise-reduction-camera-raw.html),
and the pixls.us discussion of saturation methods
(https://discuss.pixls.us/t/what-is-the-best-way-to-boost-the-colors-saturation/6935).

**What that says about this app, specifically.** There is ONE denoise, it is
luma-guided, and there is no chroma-specific stage anywhere — so a 3× saturation
and a mixer with coefficients over 1.4 are being applied to chroma noise that
nothing removed, on frames where the red channel is flooded and the blue and green
channels are the quiet ones carrying most of the noise. That is the documented
recipe for exactly what the frames show, and none of it needed deriving.

This has to be written into `IR-SCIENCE.md` with the sources named, per the
standing rule, as part of doing the work.

## Weighed against

**`NOTES.md` "## Still open, carried forward" already names it**: chroma smoothing
is recorded there as the one untried lever for the grain, from the session that
approved the Aerochrome sheets. This item is that line with a reason and a source
behind it.

Overlaps the **highlight roll-off** item — 28–45% of the coloured frame going
colourless against the film's 13.8% — which the same search already traced to the
per-channel tone curve at `src/pipeline.ts`'s `out[0..2] = toGamma((n - 0.5) * con
+ 0.5)`. Both are consequences of where colour is handled relative to tone, and a
fix for one may move the other; they should be measured together and not fixed in
the same change.

Weighed against the denoise floor itself, raised to 0.8 on the owner's call on the
grain sheets. The floor is not the answer here — raising a luma-guided bilateral
far enough to flatten chroma patches smears the leaf texture, which is the
trade the sources describe and warn against.

## Options

**THE SHEET IS RENDERED, 2026-09-17, AND IT SPLITS THE DEFECT IN TWO.** Five
candidates on a real raw, every step a control on the device, shown 1:1 at the
frame's splotchiest 600x450 block — found by chroma variance and then held fixed,
so every step of the ladder shows the same piece of the same photograph.

At saturation 3.0 the sky carries visible speckle and the foliage stipples into
hard red and white flecks; at 2.0 and 1.5 both soften; at 1.0 the sky is clean and
the foliage is smooth. So the splotch IS amplification, and the amount is large.

**The shipped look with the existing denoise at its maximum is indistinguishable
from the shipped look.** That arm was included to find out whether the
luminance-guided bilateral could reach this at all. It cannot, and that closes the
cheapest possible fix before it was attempted.

**But there are two artefacts and only one of them is chroma noise.** The sky
speckle is chroma noise amplified, which is what a chroma stage is for. The
foliage stipple is saturation driving adjacent leaves to the gamut edge so they
snap to pure red or pure white, losing the mid-tones between them — per-pixel
clipping, which a spatial chroma blur will soften but not undo. **A fix aimed only
at noise will clean the sky and leave the leaves flecked**, and that has to be
said before it is built rather than discovered after.

What the naive fix costs, stated because it is not free: pulling saturation back
does not change which colours the look makes, it drains them. The colourless share
of the whole frame moves 4.9% at 3.0, 8.8% at 2.0, 12.5% at 1.5 and 19.2% at 1.0,
and the largest hue bin's share of the coloured pixels moves 56% to 63%.

**And the per-kind split decides whether any of this applies.** `raw.sat` is 3.0
and `jpeg.sat` is 1.35, so a camera JPEG never sees the amplification. The same
ladder on a real camera JPEG moves its colourless share 2.4% to 5.9% across the
whole range and its largest bin not at all. Which file kind a splotch report came
from is the first question, not a detail.

**A chroma-specific denoise before saturation, separate in strength from the
luminance one.** Chosen, because it is what the field does and what the frames
call for. The existing bilateral stays as the luminance hand; the new stage works
on the colour difference channels and can be strong, because colour blotches carry
no detail. Scoped as a pipeline stage with a matching shader, since `pipeline.ts`
and `gl.ts` must compute the same picture.

**Reduce `raw.sat` from 3.0.** Rejected as the primary fix — see below — but kept
as a measurement worth taking, because knowing how much of the splotch is
amplification and how much is the underlying noise tells you how strong the chroma
stage has to be.

**Wait for the highlight roll-off work and do both at once.** Not chosen. They
are separable, the reported defect is in production now, and bundling two colour
changes makes neither measurable.

## Rejected

**Turn the saturation down.** The colour was approved by looking, on the owner's
own frames, and this record exists because the colour is right. Fixing a noise
problem by removing the thing that was chosen is answering a different question.

**Raise the denoise floor.** Named above: it trades the leaf texture for the
patches, which is the specific trade the sources say to avoid by splitting the two.

**Assume it is the tone curve, because that mechanism is already written down in
`CLAUDE.md`.** The per-channel curve desaturates highlights toward WHITE, which is
the roll-off item; the frames show saturated patches with hard edges, which is not
the same artefact. Reaching for the explanation already in hand is how three wrong
diagnoses got written in one evening on a different item.

**Diagnose it from the two frames sent.** They establish that it is real and what
it looks like; they cannot say whether the patches survive at sat 1.0, which is
one render away and is the first measurement.

## Rank

**Second.** It is in production, it is about the look currently being judged, and
its first step is cheap — render the same frame at several saturations and with
the chroma stage stubbed, and the sheet says how much of the splotch is
amplification. Below the full-view item because that one takes the photograph away
entirely; above everything else because a look nobody wants to use is a look that
did not ship.

**And it will be SHOWN, not described** — the candidates go back as pictures on
the owner's own frames, per the standing rule and because the last four colour
decisions were all made by looking.
