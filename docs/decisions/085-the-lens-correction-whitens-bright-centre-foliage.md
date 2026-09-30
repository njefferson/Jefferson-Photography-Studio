# 085 · The lens correction whitens bright centre foliage

## Context

Record 015's next half. 015 restored the correction's anchor (2026-09-17),
reversed turning it off at open (2026-09-26), and fixed the report's lens line
(2026-09-29). What it left open is written in its own words: at strength 1, on
the reported frame NIR_1376.NEF, a large share of the sunlit leaves in the
centre go white and pale pink where strength 0 keeps them red. On NIR_3716.NEF
the bushes in the middle go from deep red to pale salmon in the same step,
while the red comes off the grey ground as it should. On NIR_3700.NEF strength 1
takes the red speckle out of the sky and turns the pampas plumes largely white
(015, What stays open, and Looked at).

015 named three candidates, each its own record: a per-image strength, clip
control, or telling the reader a hot spot is there. On 2026-09-29 the choice was
moved from a reading of the pictures to outside research, and this record makes
it from that research, with the pictures beside it.

**Where the correction acts.** `src/lensflat.ts` applies one radial gain per
colour to the linear working copy at decode, before anything is measured or
graded (decision 021). Its header says nothing there clips, so a corrected
value can rise above white. The per-channel clip comes later, at the tone stage,
where `toGamma` in `src/pipeline.ts` clamps each channel for display.

## Looked up

One researcher and one skeptic, web only, 2026-09-29. The skeptic re-checked
each claim against its source.

- **RawTherapee's flat field has clip control, and the source says what it
  does.** In `rtengine/rawflatfield.cc` (read, confirmed by the skeptic): the
  flat is normalised per colour channel to its value at the image centre; each
  raw value is multiplied by reference over flat; manual clip control scales
  the reference by one shared factor, `max((100 − clipControl)/100, 0.01)`; and
  automatic clip control lowers that factor until the largest corrected value
  reaches the channel's white level. No clamp is applied to the output. One
  shared factor lowers the whole correction, so
  channel ratios are kept. If the raw already holds a clipped pixel, the
  automatic mode gives no protection (partly confirmed: the Bayer path's early
  exit makes it depend on scan order).
- **RawPedia says what it prevents** (snippet only; the page answered with a
  challenge): a flat field can push nearly overexposed areas into overexposure,
  and clip control stops that.
- **darktable issue 12128** (read, confirmed): a per-channel gain map raises
  bright but unclipped pixels above the raw white point, highlight
  reconstruction then clips them, and the colour comes out wrong. It was seen
  on clouds.
- **Kolari** (read, confirmed): corrected image = image × (average flat ÷ flat);
  keep a library per lens, filter and aperture; the hot spot is not always
  centred. Its strength follows aperture, focal length, focus distance and the
  light in the scene.
- **Correcting by hand, per image** (read, confirmed): Photo Art From Science
  lowers exposure in a radial filter until the hot spot matches its
  surroundings, and notes this works best when the hot spot has not reached
  clipping in any channel.
- **Editors' amount sliders** for lens shading (Lightroom's Vignetting amount,
  Capture One's Uniform Light, DxO's intensity): search-level only; all three
  vendors' pages refused.
- **Telling the reader a hot spot is there.** Rob Shea's hot-spot videos give
  a test (IR-SCIENCE §9h, transcribed): a white-balance pick at the frame's edge
  against one at its centre, which on a visible hot spot measures roughly 1000K
  apart, read on two frames (3700K against 4700K on one). That is one
  practitioner's reading of two frames, not a published threshold. Kolari's
  lens list gives no numerical threshold for a hot spot (IR-SCIENCE §9r). No
  published centre-against-edge white-balance test with a threshold was found.
- **Not found.** No source says why a hot-spot correction whitens sunlit
  foliage in particular. The mechanism above (a per-channel gain carrying bright
  values past white, then a per-channel clip) is the sources' general finding
  applied to this app, and is this record's to measure.

**Second research, 2026-09-30**, on option 6's question: whether a hot spot
carries colour, how a flat field treats that colour, and how the field checks
it. One researcher and one skeptic, web only. The skeptic opened 37 claims'
sources: 22 confirmed, 6 partly, none contradicted, 9 unreachable. On
2026-09-30 eleven hosts were opened to the session: the six the proxy had
refused, then api.crossref.org, api.openalex.org, api.semanticscholar.org,
ui.adsabs.harvard.edu and hagenlab.org (which did not connect). A second
reading covered five of the unread claims. Hagen's abstract was read through
Crossref and OpenAlex, not on the publisher's page, and claim 26 on
markshelley.co.uk alone, one of the two pages first cited. With those, the tally is 24 confirmed, 8
partly, 1 not supported at the page it was credited to, and 4 unreachable.

- **A hot spot carries colour, not only brightness** (David Kennard, read,
  confirmed). Kennard's blog posts 1134, 1126, 976 and 978 report:
  - with a Lee 101 filter, a magenta centre and yellow edges;
  - under a hue shift that makes foliage red and sky blue, the sky near the
    centre turns reddish while the edges stay blue;
  - on a full-spectrum body behind a yellow filter, a much stronger hot spot in
    the pure-infrared blue channel than in red plus infrared or green plus
    infrared, corrected on its own with a curve;
  - CornerFix, profiled from a white card, taking the slightly red sky out.

  None gives a number. irrecams.de says the same without a measurement (read
  2026-09-30, confirmed): "Often the blue channel of the image is more affected
  by this, which is why a hotspot appears as a color blob", and in a monochrome
  image it is "only very faint or not at all". A claim credited to
  leeramsden.com, that a hot spot looks worse once processed in colour and takes
  on the foliage colour inside the sky, is on none of that site's five infrared
  posts (not supported). Kennard's 1126, above, says the part about colour: under
  a red-foliage rendering the centre sky turns reddish. Nothing read says it
  looks worse.
- **Per-channel division is the field's standard, and removing a colour cast is
  what it is for.** RawTherapee, Siril and PixInsight do it, and so do the DNG
  SDK's GainMap, darktable, Lightroom's Flat-Field Correction and CornerFix (read
  in source or documentation, confirmed). Adobe's page says shading can carry a
  colour cast and offers an option that removes only the cast. What the tools
  normalise to differs:
  - to the centre, so the centre keeps its colour: RawTherapee, Siril, CornerFix;
  - to the mean: PixInsight, the textbook formula, Kolari's recipe.

  No source says how that choice meets a later gray-world balance.
- **The field checks a correction on neutral things and by eye** (read,
  confirmed):
  - colour samplers on clouds (Kennard);
  - a white-balance pick on clouds or pavement (Rob Shea);
  - the correction toggled on and off (Kennard);
  - PixInsight's check for under-correction and for over-correction, which it
    calls negative vignetting;
  - a published test with coloured light at the centre and in a corner (Bowman
    and others, arXiv 1911.13295).
- **What goes wrong, as documented.**
  - A flat whose light differs from the scene's. Read on 2026-09-30:
    - Hagen, "Flatfield correction errors due to spectral mismatching" (Optical
      Engineering 53(12), 2014; the abstract, read through Crossref and
      OpenAlex, confirmed). Users have been told to make the flat's light "as
      close as possible to that of the measurement object". The paper builds a
      radiometric model, and "Simulations covering a variety of measurement
      scenarios indicate that spectral mismatching can create quantitative
      errors of up to a factor of 5 in situations that are regularly
      encountered by researchers performing quantitative work". The abstract
      is four sentences about quantitative measurement and names no
      wavelengths; the paper itself was not read.
    - The astro-imaging page at markshelley.co.uk (partly): "flat frames of one colour (e.g.
      blue or white) do not properly correct light frames of another colour
      (e.g. orange/brown light pollution)". The cause it gives is non-linearity
      and pixel crosstalk, and the remedy is "flats with the same colour and
      intensity as the background of the light frames". It is one author's
      finding on two cameras, in visible light.
    - A Qualcomm patent (US20150042844A1, partly): colour shading "depends on
      the spectra of the scene illuminant as well as the surface reflectances
      of the objects being imaged and, therefore, cannot be fixed robustly
      using pre-calibration techniques". Its cause is a phone module's
      infrared-blocking filter, not a hot spot, and its own method still
      starts from one calibrated table.
  - A wrong black level (pixls.us, read).
  - Crosstalk: per-channel gains leave the edges less saturated, and a 3×3
    matrix per position is needed (arXiv 1911.13295, read).
  - A diffuser that is not neutral in infrared (Kennard, read).
- **Not found.** Nothing on what a hot-spot correction does to foliage colour,
  and no source for an internally converted camera with no external filter.
- **Not read:** four claims, on blog.kasson.com, lenscraft.co.uk and
  rawpedia.rawtherapee.com, which answered with their own challenge pages.
  www.spiedigitallibrary.org and www.cloudynights.com did the same; Hagen's
  abstract was read through Crossref instead, and claim 26 was read on Shelley's
  page alone.

## Weighed against

- **015** (archived with this record): the correction, its anchor, and its
  reversal to on at open.
- **069** and **013**, which each declare `needs 015`: both were being tuned
  against what the lens correction does at the centre. A change to the brightest
  centre values moves the cloud and the foliage they measure (Depends).
- **The per-channel tone curve**: CLAUDE.md records that a curve applied
  independently per channel desaturates highlights toward white. That is where
  a value past white loses its colour here; the first check found the whitening
  foliage does not reach it (First check, below).

## Depends

- touches 015 — 015's correction is what this guards; 015 is archived with this
  record as its next half.
- touches 021 — 021 put the correction on the linear copy at decode, before the
  grade, which is where its colour cut is made and where any remedy would act.
- touches 069 — the correction's cut changes the centre colours 069's sky
  stages receive, and at strength 1 it carries more already-pale bright values
  past white in green and blue, which is what a cloud is made of (First check).
  The defects differ: 069's cyan cloud is the white point's cast, and this is
  the correction flattening the centre foliage.
- touches 013 — centre foliage is 013's population, and the correction's cut
  changes its colour there.

## Built already

- **The correction.** `applyLensFlat`, `lensGainsFor` and `lensAreaMean`
  (`src/lensflat.ts`, `src/pipeline.ts`), with the strength slider
  (`#hsStrength`) remembered per lens at every aperture for a shipped
  profile, and per stored profile (lens, focal length and aperture) for a
  reader's own measurement.
- **The report's line.** `lensCentreLine` prints the applied centre gains.
- **The instruments.** `tools/lens-order-walk.mjs`, `tools/lens-diagnostic-check.mjs`
  and `tools/preview-version-check.mjs`, which hashes `src/lensflat.ts`.

## Options

**Re-opened 2026-09-29: none is chosen.** Option 1's first check ran the same
day ("First check, 2026-09-29", below). The foliage that whitens does not pass
white; its colour is flattened from white balance onward, by the correction's
own colour half. So clip control does not answer this defect, and option 6
names what the check found. The second check (2026-09-30, below) answers
option 6's question: the cut is the lens's own cast coming off. That makes 5,
leave it, the likely answer. It is not chosen here, because what the centre
foliage should look like is a look choice, shown and not described.

1. **Clip control: hold the corrected values under white with one shared
   factor, computed from the photograph.** Chosen 2026-09-29, and not
   confirmed by its own first check the same day.
   - As RawTherapee's automatic mode does: find the largest value the
     correction would produce in each channel, and if it passes white, scale the
     whole correction down by the one factor that brings it to white. One shared
     factor keeps the channels' ratios, so it lowers the correction without
     tinting it.
   - Automatic, per photograph, with nothing for the reader to set; the strength
     slider stays as it is.
   - **First check, before any code:** measure on NIR_1376.NEF, NIR_3716.NEF and
     NIR_3700.NEF whether the centre foliage that whitens at strength 1 passes
     white in any channel at the tone stage, where strength 0 does not. If it
     does not pass white, the mechanism is not this one and the record goes back
     to its options.
   - **What it would not change.** On NIR_3716.NEF the bushes lose red all
     over at strength 1, not only at their brightest (Looked at). That is not
     the pattern a clip makes, so clip control would leave it. The first check
     found the same flattening on every whitening pixel, and left open whether it
     is the lens's own cast coming off or more than the lens put there (option 6).
   - **Known limit, from the source:** where the raw already holds a clipped
     pixel, the automatic mode gives no protection.
   - **Open for the build: which white.** RawTherapee applies its factor to the
     raw, against the raw's white level. Here the correction acts at decode,
     where nothing clips, and the clip that loses colour is at the tone stage,
     after at-open auto exposure (measured after the correction), white balance
     and the look. A factor applied at decode lowers every pixel, and auto
     exposure may lift it back. So which white the factor is computed against,
     the raw's or the value arriving at the tone stage, is the first thing the
     build settles once the first check says the mechanism is this one.
2. A per-image strength: the reader sets the correction's strength per photo.
3. Tell the reader a hot spot is there.
4. Clamp each corrected channel at white on its own.
5. Leave it: the strength slider already lowers the correction.
6. **The correction's colour half, measured (2026-09-29).** At the centre the
   correction cuts blue against red by about 5 to 6.5% (blue over red 0.936 to
   0.947). After white balance blue is the highest channel and red the lowest
   on 95 to 100% of the whitening pixels, so cutting blue against red moves
   them toward white, and because they are only 10 to 13% saturated there, the
   move is large. Before white balance the same cut RAISES their saturation
   slightly (by 3 to 4%): white balance is only the first place where white is
   defined. Aerochrome's mixer, whose green output carries minus 1.44 times the
   matrix's blue, supplies about half to three quarters of the rise in green.
   **Answered 2026-09-30: the lens's own cast** ("Second check", below). Neutral
   things at the centre move toward the same material at the frame's edge and
   stop short of it; none crosses. The field's standard correction removes a
   hot spot's colour (Looked up), and a red-foliage rendering shows the hot
   spot as red at the centre. So part of the centre foliage's red at strength 0
   is the lens's.

## Rejected

- **2, a per-image strength.** Practitioners do correct by hand, per image, and
  the app already has the slider, remembered from photo to photo. But it asks
  the reader to find, on every bright frame, the strength at which the leaves
  stop whitening. That is the cost the automatic mode exists to remove. And
  on NIR_1376.NEF strength 0.5 carries about half of each defect, and on
  NIR_3716.NEF part of each: some whitening, and some of the cast the
  correction exists to take out. On NIR_3700.NEF it already whitens the plumes nearly as much as 1 does
  (Looked at). A strength trades one defect for the other and fixes neither.
  It stays as the reader's control on top of 1.
- **3, telling the reader.** Telling does not stop the whitening, which is on
  the reported frame at the strength every matched frame opens at. A test
  exists, Shea's centre-against-edge white balance at roughly 1000K apart, but
  it is one practitioner's reading of two frames, and Kolari gives no
  threshold.
- **4, a per-channel clamp.** It clips each channel on its own, which is the
  per-channel loss of colour this record took to be its defect before its first
  check. Clip control uses one shared factor for exactly that reason.
- **5, leave it.** The whitening is on the reported frame at the strength every
  matched frame opens at.
- **Re-opened with the Options (2026-09-29).** 2 to 5 were rejected against
  clip control. With none chosen, 5 is live again under option 6: if the cut is
  the lens's own cast coming off, the correction is right and leaving it is the
  answer. The second check (2026-09-30) found exactly that, so 5 is the likely
  answer. Its objection above still describes the pictures: the leaves at
  strength 1 are paler than at 0. What changed is what that paleness is: less
  of the hot spot's red on them. The check measured the neutral things beside
  the leaves, not the leaves, and the gaps it left at 1 may be hot spot still
  there.

## First check, 2026-09-29: the whitening is not a clip

**What was run.** The app's own state was captured under the Aerochrome chip
at lens strength 0 and 1 on NIR_1376.NEF, NIR_3716.NEF and NIR_3700.NEF, from a
copy of today's build with one added function that renders offscreen and reads
the state back. All six captures' canvases hashed byte-identical to the shipped
build's, and the slider and the applied strength read back 0 and 1. A copy of
`compileEdit` with a read-only tap after every stage then ran over the 1:1
centre crop that was opened, one pixel in four (62,500 of 250,000), and the
value before the tone stage's per-channel clamp was taken as
`(n - 0.5) * contrast + 0.5` per channel, as the code computes it. The tapped
copy returned exactly what the shipped `compileEdit` returns; per pixel, 99.9 to
100% sit within 3 levels of the app's own GPU render.

**The pixels that whiten** (saturation 0.5 or more on screen at 0; 0.35 or
less and value 0.8 or more at 1). The figures below are from an independent
rerun at every pixel of the crop; the check's own one-in-four sample gave
288, 5,966 and 1,278 pixels and the same direction on the last two.

- NIR_1376.NEF: 1,186 pixels. Past white before the clamp: 0.8% at 0, 0.3% at
  1 (9 and 3 pixels; the one-in-four sample showed 0.3% at both). Green before
  the clamp 0.112 to 0.331; saturation after white balance 0.133 to 0.079.
- NIR_3716.NEF: 24,091 pixels. Past white: 1.9% at 0, 0.3% at 1. Green 0.217
  to 0.420; saturation after white balance 0.103 to 0.054.
- NIR_3700.NEF: 5,233 pixels. Past white: 5.4% at 0, 3.2% at 1. Green 0.167
  to 0.394; saturation after white balance 0.122 to 0.068.

So they pass white less often at 1, not more; on NIR_1376 that rests on single
figures. Red passes 1 on all but 4 of them; blue on 4 pixels of NIR_3700.NEF at
1; green never.

**Where the colour goes** (on the one-in-four sample). For these pixels the
first stage at which strength 1 is clearly less saturated than 0 is exposure
and white balance: lower on every pixel, by a median factor of 0.52 to 0.58,
and before every clamp that acts on them, since nothing upstream sits at the
floor or near white. The correction's own gain table applied to the strength-0
copy reproduces the whole drop, and its blue gain alone reproduces 95 to 137%
of it. The centre gains it applies:

- NIR_1376.NEF: red 0.996, green 0.980, blue 0.933.
- NIR_3716.NEF: red 1.020, green 1.000, blue 0.966.
- NIR_3700.NEF: red 1.013, green 0.996, blue 0.948.

**The other half of it.** Across the whole crop, strength 1 carries MORE green
and blue values past white before the clamp on all three raws (on the sample:
green 70 to 142, 24 to 137 and 1,169 to 2,642; blue 38 to 74, 46 to 304 and
1,385 to 2,452). At every pixel, 241, 47 and 2,366 pixels are newly past white
at 1, nearly all of them near neutral at 0. So clip control does not answer the
whitening foliage, but the correction does push already-pale bright values
past white, which is what clip control guards and what a cloud is made of (069).

**What was tried against it.** Three independent lenses each tried to refute
the verdict. None did.

- The check's figures reproduced exactly on its own sample, and the class
  figures were recomputed at every pixel from a pipeline built separately from
  the repository's source, each comparison made to fail once. The full-density
  shares moved (above) and kept their direction.
- Eleven other definitions of "whitens" were tested beside the check's own. On
  every definition that selects a change toward white, the share past white
  falls or stays. The three with no condition at strength 0 (value 0.9 or more
  at 1, the brightest 5% at 1, pale at 1) rise a little on NIR_1376 (value 0.9
  or more: 16.0 to 20.3% at every pixel), are flat on NIR_3700 and fall on
  NIR_3716; the pixels that make those rises are near neutral already at 0, and
  no rise met the bar fixed before the runs.
- Gray-world and auto exposure recomputed on the strength-0 copy, stepped as the
  slider steps them, land on the same positions or one step away and reproduce
  -0.3 to +0.4% of the drop; unstepped, -5.5 to +7.1%. The balance chosen at
  open does not explain it.

**Caveats that stand.** On a wider paling set (saturation falling by 0.15 or
more, value 0.7 or more at 1), part of strength 0's red comes from clamps at the
low end, which do not act at 1, and on NIR_3700.NEF the band stage's saturation
guard drops from 1.6 to about 1.0 and amplifies the fall; neither acts on the
strict set above. On NIR_3700.NEF the lens strength also moves the sky
selection: its sky maps differ between the two captures, and the sky stages
move 43% of the whitening pixels at 0 and 58% at 1. The check's own test of its
planted change could not fail; the independent lens's real plant confirmed the
exactness it reported.

**Not tested.** The clamps after the tone stage (the HSL mixer, sky
saturation); anything outside the centre crop, the Aerochrome look and these
three raws; any device; and any remedy.

**What it supports, and no more.** At the centre, strength 1 cuts blue against
red by about 5 to 6.5%, and on this weakly coloured foliage, which after white
balance leans blue, that cut is what turns red to pale. Nothing here shows that
the correction is wrong, or that any change would bring the red back.

## Second check, 2026-09-30: the cut is the lens's own cast

**The question.** Option 6 asked whether the correction's centre cut is the
lens's own cast coming off or more than the lens put there. The field checks a
correction on neutral things (Looked up). So the test was this: take something
at the centre that should carry no colour of its own, and the same material at
the frame's edge. If the correction is right, the centre moves toward the edge.
If it takes too much, the centre moves past the edge.

**What was run.** The six captures from the first check were used, with no new
render. They are whole frames at 2800 by 1864, under the Aerochrome chip, at
strength 0 and 1. The regions were drawn on each capture's own render and
opened before any number was read (Looked at). Each region's mean was then read
after exposure and white balance, the stage where the first check found the
colour falls. The figure is the log of blue over red, and the centre's figure
minus the edge's.

- **NIR_3716.NEF.** The gravel road at the centre against the asphalt road at
  the right edge: 0.087 at strength 0, 0.008 at 1. The pale ground by the fence
  at the centre against the same asphalt: 0.126 at 0, 0.047 at 1.
- **NIR_3700.NEF.** The grey sky between the towers against sky at the same
  height at each edge: 0.112 and 0.108 at 0, 0.036 and 0.033 at 1.
- **NIR_1376.NEF.** The sky above the crown against sky at the same height at
  each edge: 0.095 and 0.092 at 0, 0.041 and 0.038 at 1. These regions sit
  near the top of the frame, so they are further from the centre than the
  other two frames' regions.

On every pair the centre moves toward the edge, by 57 to 91% of the gap, and
none crosses it. Green against red moves the same way on every pair, from
0.030 to 0.041 at 0 to 0.001 to 0.012 at 1. On screen, NIR_3716's gravel
goes from saturation 0.56 to 0.19, and the asphalt at the edge from 0.05 to
0.14. At 1 the two are nearer each other than at 0, and both carry a little
red.

**What it supports.** The correction takes off less than the whole gap between
centre and edge on neutral things, and never more. So the cut on the foliage
beside them is the lens's own cast coming off, as the correction intends. The
red the centre foliage keeps at strength 0 is partly that cast. This is what
Kennard describes: under a red-foliage rendering, a hot spot shows as red at
the centre.

**Why keeping the centre's colour is not open here.** This is arithmetic, not
a measurement. RawTherapee, Siril and CornerFix normalise the flat to its
centre, so the centre keeps its colour; this app normalises to the area mean
(`lensAreaMean`). The gain at a bin is `1 / (1 + (k − 1) × strength)`
(`lensGain`), held between `LENS_GAIN_LO` and `LENS_GAIN_HI`. At strength 1,
where every matched frame opens, and inside that clamp, two flats that differ
by one scale per channel give gains that also differ by one scale per channel.
Gray-world (`grayWorldWB`, `src/decode.ts`) then sets one scale per channel
from the means of the corrected copy, which absorbs that difference. The only
exceptions are the white-balance slider's steps and `lumNormalize`'s clamp. So
at strength 1, while white balance at open is gray-world, the choice of
normalisation cannot bring the centre's red back. At any other strength the
gain is not a plain scale of `k`, and this arithmetic does not hold exactly.

**Caveats.**
- NIR_3716's edge is asphalt and its centre regions are gravel and pale ground:
  similar materials, not the same one.
- The sky can have a gradient of its own across the frame.
- The gaps left at 1 (0.008 to 0.047) may be what is left of the hot spot, or
  real differences between the materials. This check cannot tell which.
- Three raws, one camera, one look.
- A flat measured under one light can miscorrect scenes under another
  (Looked up), and what light the shipped profile was measured under is not
  recorded, so this check cannot rule that out.
- Four claims stay unread; none of them is needed for this finding.

**Not tested.** Any remedy; any other look; anything on a device.

## Rank

First, where 015 stood, now that 078 is archived. Re-opened for research
(2026-09-29), it stays first: 069 and 013 each touch it. The correction's cut
changes the centre colours 013's foliage is tuned against, and pushes pale
bright values past white where 069's clouds are, so either one tuned first
would be tuned again. It goes above both. The second check (2026-09-30) leaves
it first: until 5 is settled, 069 and 013 do not know which centre they are
tuned against.

## Looked at

Each export was made on 2026-09-29 through the app's own export, full size,
under the Aerochrome chip (`#lookEir`), and opened here as a 1:1 crop of the
centre and as the whole frame, side by side. Strength 0 and 1 came first; the
0.5 entries below add a third export of each frame between them.

The 0 and 1 exports (13:35 to 13:45 UTC) and the 0.5 exports (20:20 to 20:26
UTC) came from two builds. The first was built from the working tree before
either commit below existed (both were made at 14:06 UTC), so this is the
account from the commits rather than a reading of that build. 8881ea1 changed `src/lensflat.ts`
by adding the report's line (`lensCentreLine`) and widening one import, and
`src/main.ts` so the report calls it in place of its own arithmetic; 438ce77 changed only comments in `src/`. Neither
touches `applyLensFlat` or `lensGainsFor` (read in their diffs).

- NIR_1376.NEF, 2026-09-29, the oak: at 1 the brightest sunlit leaf clusters
  in the centre go white and pale pink where 0 keeps them red with small
  highlights; the darker red leaves and the trunk barely change, and the sky
  gaps lose a little red. The whitening sits on the brightest leaves only.
- NIR_3716.NEF, 2026-09-29, towers over dry grassland: at 0 everything in the
  centre carries a red cast, the dirt track and the grey ground included; at 1
  the ground goes neutral grey, and the bushes go from deep red to pale salmon
  all over, not only at their brightest.
- NIR_3700.NEF, 2026-09-29, the pampas: at 0 the grey sky carries red blotches
  and the plumes and the shrub are pink-red; at 1 the sky is a clean blue-grey,
  and the bright plumes and the shrub go largely white while the darker
  branches keep their red. The whitening sits on the bright subjects.
- NIR_1376.NEF, 2026-09-29, at 0, 0.5 and 1, the centre at 1:1 and the whole
  frame: at 0.5 the leaves whiten less than at 1 and more than at 0, on the
  same bright clusters. In the whole frame, the warm grey halo behind the crown
  at 0 is about half gone at 0.5 and gone at 1, where the sky is an even blue.
  No strength keeps the leaves red and takes the halo out: 0.5 carries half of
  each.
- NIR_3716.NEF, 2026-09-29, at 0, 0.5 and 1, the centre at 1:1 and the whole
  frame: at 0.5 the bushes keep more red than at 1, but their brightest tops
  have already gone pale, and the ground keeps part of the red cast. In the
  whole frame the grass in the middle is a deeper red than toward the edges at
  0, less so at 0.5, and nearly even at 1. A red flare patch at the left edge
  and a pale vertical streak in the sky are the same at all three strengths.
  No strength keeps the bushes deep red and takes the cast off the ground.
- NIR_3700.NEF, 2026-09-29, at 0, 0.5 and 1, the centre at 1:1 and the whole
  frame: at 0.5 most of the sky's red blotches are already gone, leaving a faint
  red haze beside the plumes, and the plumes and the shrub are already nearly as
  white as at 1. In the whole frame, the reddish-grey patch in the sky between
  the two towers at 0 is grey at 0.5 and slate at 1. Here 0.5 sits nearer 1
  than 0.
- NIR_3716.NEF, 2026-09-30, the second check's regions drawn on the whole
  frame at 0 and 1: the gravel box sits on the pale track just above the
  frame's middle, the pale-ground box on the grass by the middle fence, and
  the edge box on the grey asphalt road at the right. At 0 the gravel and the
  grass around both centre boxes carry the red cast; at 1 they are paler and
  nearer the asphalt, which looks grey at both.
- NIR_3700.NEF, 2026-09-30, the second check's regions on the whole frame at 0
  and 1: the centre box sits on the sky between the two towers. At 0 that sky
  is a brownish grey patch among blue; at 1 it is slate blue like the sky in
  the two edge boxes at the same height, a little lighter.
- NIR_1376.NEF, 2026-09-30, the second check's regions on the whole frame at 0
  and 1: three boxes on the sky near the top, one above the crown and one at
  each edge. At 0 the sky above the crown is a grey teal and the edges a deeper
  blue; at 1 the gradient is gentler and the crown's sky is bluer.
