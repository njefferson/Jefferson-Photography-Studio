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
luminance one. BUILT AND MEASURED, 2026-09-17 — one variable, saturation
untouched.** It reuses the existing bilateral's own 5x5 neighbourhood and
accumulates a second, spatial-only mean beside it: luminance from the
edge-preserving bilateral as before, colour mixed toward the plain blur. Four
adds per tap, no extra samples, no extra exponential, and 0 recombines into
exactly the old output. Both renderers carry it — `src/raw/denoise.ts` and the
shader in `src/gl.ts`, which is a third pair of hand-synchronised math and a cost
worth naming.

At 0.25 and 0.50 the sky's coarse speckle is largely gone and the foliage keeps
its texture, with the colourless share steady near 5% across the whole ladder —
the colour is not drained, which is the whole difference from pulling saturation
back.

**Its failure mode appears at 1.00 and names the next variable**: leaf and sky
boundaries grow a fine blue-and-red pepper, because luminance is kept sharp while
colour is a plain blur, so a dark gap between leaves keeps its brightness and
takes the average colour around it. Unguided chroma smoothing bleeding across a
high-contrast edge. The remedy — a much looser range term on the chroma half, so
it stops crossing luma edges — is deliberately NOT in this pass, because it is the
second variable and the first has not been judged yet.

The original reasoning, kept: chosen because it is what the field does and what
the frames call for. The existing bilateral stays as the luminance hand; the new stage works
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

**THE PREVIOUS ENTRY WAS WRONG ABOUT THE FIXTURE, AND THE CORRECTION IS THE
FINDING — 2026-09-17, later the same day.** It said the raw in the scratchpad did
not have the grey speckle. It does. Two instrument faults hid it, and both are
worth more than the conclusion they broke: a fitted screenshot of a whole frame is
a downscale and averages single-pixel dots away, so the render looked clean at
724px and is dense with pepper at 1:1; and the metric was the share of pixels with
NO hue, an absolute, while these dots are merely pale and much less saturated than
the sky around them. A whole ablation was run and reported against a frame said to
lack the artefact.

**The reading that works** is the tenth percentile of chroma over the median
inside a sky block: near 0.94 on an even sky, 0.65 to 0.72 on both of these
frames, worsening with sky depth. See IR-SCIENCE.md 4c-ix for the numbers, the
ablation and the sources.

**What it settles.** No stage of the look creates it — with no look at all the
ratio is already 0.67. ISO 100, so not gain noise: it is shot noise on the channel
an infrared conversion starves, which is why it is worst where the sky is deepest
and why no shooting change reaches it. **And neither smoother in this app touches
it**, denoise at 1.00 or the new chroma stage at 1.00, measured at 1:1 and looked
at. A bilateral's range weight treats a lone unlike pixel as an edge and keeps it,
so it preserves outliers by construction; the documented remedy for impulse noise
is a median, a rank statistic rather than a weighted mean. The chroma stage
inherits the flaw because it mixes toward a mean of the same neighbourhood.

**So the Colour noise slider is not the answer to this one**, and a floor on the
look would not have helped — which answers the standing question about a floor
with a measurement rather than a preference, at least for this artefact.

**The superseded entry, kept because the way it failed is the point —
"this repository cannot reproduce it", 2026-09-17.**
Three frames from the device show a different thing from the one measured above:
the sky peppered with pale ACHROMATIC dots, densest where the sky is deepest and
gone where it goes pale near the horizon, with the rest of each picture clean.
That is not the coloured hue speckle the chroma stage was built against.

The pipeline was ablated one stage at a time on the raw in the scratchpad — no
look at all, as shipped, Restore depth off, saturation 1, contrast 1, and the
mixer back to Identity — scanning a column of blocks down the sky and reporting
each block's luminance against the share of its pixels carrying no hue.

**The frame does not have the signature.** As shipped, the top three sky blocks
read 0.00% with no hue, median chroma 95 to 126 and rising with depth; the
rendered picture's sky is clean. The only blocks with any colourless share are the
bright foreground at 76 to 80% luminance, which is the highlight roll-off already
recorded as its own item and is the opposite end of the scale from the reported
artefact. The camera JPEG in the scratchpad is worse as a fixture: it is a
one-band file and renders under this look as a green monochrome, so it answers a
different question entirely.

**So the ablation is unspent, not failed.** It runs, its control arm is honest and
its readings are sound; it has no frame to run on. What this item needs next is
one raw that shows the grey sky speckle, in the scratchpad, where the 44 practice
DNGs cannot help (IR-SCIENCE.md section 7) and neither can a screen photograph.
Guessing the stage from the code without it is the move this record already
carries two entries against.

**One thing the code makes worth checking FIRST when such a frame arrives**, so it
is written down rather than rediscovered: `src/pipeline.ts`'s band stage clamps
each channel with `Math.max(0, ...)` before `rgb2hsv` and then rebuilds the pixel
with `hsv2rgb`, so a channel the mixer pushed below zero is not merely clipped —
the pixel's hue and saturation are recomputed from a number that is no longer its
own. `LOOKS.eir.mix3` carries -1.44, -0.47 and -0.06, and saturation 3.0 runs
before that stage and pushes more pixels past zero. A deep sky in a swapped
infrared frame is where the quiet channel sits closest to zero. That is a
hypothesis with a mechanism, and it stays a hypothesis.

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

## Rejected, measured 2026-09-17

**A per-photograph measured strength.** 4c-xiii proposed it and 4c-xiv killed it.
Built, and swept over fifteen real frames: a whole-frame median reads BACKWARDS,
and a per-block high percentile orders the four calibration frames correctly and
then collapses at fifteen, with a frame that needs nothing reading within six
thousandths of the frame that does. A single number per photograph cannot say
"clean except for one part", and that is the defect's shape. A composite that does
separate is a fit over one positive example and is refused for the same reason
this record exists.

**A local gate on chroma magnitude.** The chrominance-curve shape named under
Looked up, built for the theory that a deep infrared sky is nearly colourless in
the raw. The theory is wrong: 4c-xi's 97.9% is inter-channel CORRELATION, not
per-pixel neutrality, and the defective frame's sky band measures the HIGHEST
local chroma in the frame. Swept with the gate in, the edge bleeding disappeared
completely and both camera JPEGs returned byte-identical readings at every
step — because only about 5% of one frame and none of the others sat below the
knee, so the stage was off rather than selective. Recorded in 4c-xv as the shape
of mistake it is: a gate that removes the cost by removing the operation reads as
a fix in every number except the one it was built for.

**WITHDRAWN 2026-09-17 — the plain global colour blur is the CAUSE at strength,
not a trade.** This paragraph used to read that the blur measurably clears the sky
it was built for and that choosing a strength was a look decision. Every
measurement behind that was a fine-grain chroma figure, and that statistic has now
been shown blind to this defect: it read the two shipped looks 1.13× apart on a
difference plainly visible in two screenshots. Rebuilt to sweep the lag, report
the sky's dark third separately and print the 95th percentile, it reads 2.03× —
and the blur sweep on top of the shipped look reads 1.85× at chroma 0.2, 2.00× at
0.4, **2.63× at 0.7 and 3.47× at 1.0**. Despeckle 0.5 reads 2.05×: nothing.

A colour blur does not remove chroma error, it averages it — which consolidates
fine grain into patches the size of its own window, and the patches are what the
eye objects to. So the fine-grain number improving while the 1:1 crop stays
peppered was never a contradiction. `LOOKS.eir` carries `chroma: 0`, so nothing
shipped on the wrong side of this; what changes is that the blur is off the table
as a remedy at any strength, and the four rejections above it were made on the
same blind statistic and are therefore not safe rejections either.

**And the cause is now located.** The mixer's green row is `[−1.44, 1.37, 1.02]`
— signal gain 0.95, noise gain 2.23 to 3.83 — and rendering the look with the
mixer at identity reads 0.70×, BELOW the clean reference. Saturation 1.5 instead
of 3.0 reads 0.55×. Both knobs are the look's identity, and both amplify signal
and noise in the same proportion, so the separation and the grain cannot be
decoupled anywhere downstream. Full numbers in `IR-SCIENCE.md` section 9k; the
instrument's own failure is hub LESSONS §320.

## Outcome, part one — the sky half, 2026-09-17

**Resolved for the sky by `skySmooth`** (`src/skymap.ts`, commit on the
`claude/infrared-editor-bugs-ux-t3fe29` branch the same day): the rendered sky's
chroma is smoothed AFTER the look amplifies it, inside `buildSkyMask`'s own
selection, luma untouched, mean chroma preserved by construction. That is
4c-xxi's one untested direction with its stated cost removed by the owner's
instruction to act on the sky and nothing else. Measured on the three frames of
ten that show the defect: residual 15.9 → 4.7 where Pink IR reads 8.7, 4.4 → 1.7,
8.7 → 3.4; 0 bytes changed outside the sky; mean 27.4 → 27.4. Aerochrome carries
it at 1. IR-SCIENCE.md 9l has every number and the two harness errors that
preceded it.

**What turned out wrong on the way.** The first shipped build targeted a sky
16% more saturated than the rendered one, because the map was built from the
raw source while the pixels come through the pre-pass; the harness had not
shown it because the harness built its map from the pre-passed render. Caught
by the shipped-path control before it reached staging. Both paths now build
from the same sampler.

**Still open — the other half of this record.** The gravel and any coloured
mottle OFF the sky bitmap are untouched by construction, and this record stays
open for them. The withdrawn claim above stands: the colour blur is not the
remedy for those either. What is known now that was not: the amplification is
saturation first and the mixer second (4c-xxi's ablation), the defect is
frame-dependent (four of ten frames had Aerochrome cleaner than Pink IR
already), and a fix that works is one that acts on a SELECTION. The gravel
needs its own.

## Rank

**Re-ranked 2026-09-26: fourth, below 069, 070 and 052.** It sits below the white guard (069) and the rotation fix (070) because the guard changes what this stage does to every pale pixel in the sky, and the rotation moves the selection this stage smooths through on a turned photograph. The Aerochrome work leads the queue; this sits below 052 because 052 changes the sky population this stage smooths, and above 066 because 066's film model is tuned against the chroma this stage leaves. The round discs along wires and round pylons, seen at full resolution on NIR_3461 in both the shipped and the tuned look, are this stage's own texels averaging a wire's colour in.

**Originally second.** It is in production, it is about the look currently being judged, and
its first step is cheap — render the same frame at several saturations and with
the chroma stage stubbed, and the sheet says how much of the splotch is
amplification. Below the full-view item because that one takes the photograph away
entirely; above everything else because a look nobody wants to use is a look that
did not ship.

**And it will be SHOWN, not described** — the candidates go back as pictures on
the owner's own frames, per the standing rule and because the last four colour
decisions were all made by looking.

**Outcome, part one, corrected 2026-09-18.** The shipped stage corrupted every
TIFF export: a channel pushed a hundredth past 1.0 wrapped in the 16-bit write
(yellow-green sky, cyan branches), invisible on screen and in JPEGs. The first
diagnosis blamed the blend's reach and was wrong; the walk that measures the
exported file whole (`tools/sky-stage-walk.mjs`) is what caught both the defect
and the misdiagnosis. Stage output and the 16-bit write now clamp; the
chroma-distance gate stays. IR-SCIENCE §9l-ii.


**What 019 handed this record, 2026-09-19 — and why the figures are withdrawn.**
A two-scale sky-blotch measurement was made across four frames and written here
as evidence for this item. It is withdrawn: the renders it read were made by
moving the Colour tab's sky hue BAND (`skySat`) rather than the look's
selection amount (`skySatSel`), so the figures describe a stage this record is
not about. Two things from that work do survive, because they are about the
instrument rather than the data.

- **Measure a splotch at the scale a splotch has.** Chroma residual against a
  5x5 local mean measures grain; a patch that has drifted off-colour over tens
  of pixels drags the local mean with it and reads as clean. Pool the chroma
  into 24-pixel blocks and take each block's distance from its 3x3 block
  neighbourhood. The two scales disagreed in direction, not just in magnitude,
  which is the reason to run both.
- **A harness states which model field it moved.** Nothing in that chain
  recorded it, so a precise number was produced about the wrong stage and
  nothing downstream could tell. The arms script records both sky values per
  frame now.

So the first candidate rendered for THIS record starts by measuring at both
scales, through `skySatSel`, and printing which control it drove.

## Looked at

- NIR_3461, 2026-09-25: as shipped and tuned to the film, lens profile at 1, every 1400 by 932 tile opened at full resolution; the round discs along the wires and round the near and far pylons, and a 1:1 crop of them.
