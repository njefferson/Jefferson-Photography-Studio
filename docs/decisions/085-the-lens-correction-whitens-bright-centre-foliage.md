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
- **Where a hand-chosen lens profile is kept** (2026-09-30, one search in two
  queries, for the follow-through below; what the search summaries say, the
  pages not opened). They say Lightroom keeps lens profile corrections in each
  photo's own develop settings, and Reset returns a photo to the defaults
  (mastering-lightroom.com, "The Lens Corrections Panel Explained";
  lightroomqueen.com, "Lens correction in develop module"), and that darktable's
  lens correction module lets the lens be chosen by hand, with the module's
  settings per image, in its history; a full history copy leaves this module out,
  and it is copied only on its own (darktable 4.6 user manual, "lens
  correction"; darktable issue 11265). So a pick belongs to the photograph's
  edit, Reset takes it back, and a full history copy does not carry it to
  another photograph.

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
  reader's own measurement. That was production until 2026-09-30. On
  production from 2026-09-30 in v2.64.31 (3bb7e37), every photograph opens at
  1 with a matched profile and at 0 without one, nothing is carried to the
  next, and a double tap on the slider goes back to 1 with a matched or
  hand-picked lens and to 0 without one (Options).
- **The report's line.** `lensCentreLine` prints the applied centre gains.
- **The instruments.** `tools/lens-order-walk.mjs`, `tools/lens-diagnostic-check.mjs`
  and `tools/preview-version-check.mjs`, which hashes `src/lensflat.ts`.

## Options

**Chosen 2026-09-30: 5, leave the correction as it is, with the strength a
photograph opens at made the profile's full correction.** The six raws of the
third check were looked at whole, four to a sheet: strength 0, as the photograph
opened (1), 1 again after the slider had moved, and 1.5. At 1 the hot
spot's colour comes off the middle; above 1 the middle of every frame washes
out. So the correction is right at 1, and the slider keeps its range of 0 to
1.5. What was wrong was the slider's memory. A strength once set for a lens
became the strength every later photograph with that lens opened at, and a
double tap went back to that remembered value rather than to 1, so a high
setting washed out the middle of every later photograph and a double tap kept
returning to it. On production from 2026-09-30 in v2.64.31 (3bb7e37), nothing
remembered decides a photograph's opening strength: a photograph opens at 1 with a matched profile and at 0 with none, what was
stored is removed at start-up, a strength set on one photograph stays with
that photograph's own edit, and a double tap on the slider goes back to 1 with
a matched or hand-picked lens and to 0 without one. The objection that
rejected 5 before, that the whitening is on the reported frame at the strength
every matched frame opens at, is answered by the looking: at 1 that paleness
is the hot spot's colour coming off, and it is where the correction belongs. It
went to staging in v2.64.26 (d9e5110) and to production on the go the same day,
2026-09-30, in v2.64.31 (3bb7e37). The iPad pass on the slider was not run
before the go, and this record stays open for it.

**Re-opened 2026-09-29, before the choice above: none was chosen then.** Option 1's first check ran the same
day ("First check, 2026-09-29", below). The foliage that whitens does not pass
white; its colour is flattened from white balance onward, by the correction's
own colour half. So clip control does not answer this defect, and option 6
names what the check found. The second check (2026-09-30, below) answers
option 6's question for colour: the cut is the lens's own cast coming off. It
made 5, leave it, look like the likely answer. The third check (2026-09-30,
below) withdraws that: the second check measured colour only, and in the
rendered picture the correction also changes brightness across the whole
frame. Option 7 names what it found. None was chosen then.

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
7. **What the correction does to brightness in the rendered picture,
   measured (2026-09-30).** Under Aerochrome, raising the strength brightens
   the middle and darkens the outer band on all six raws measured, while the
   linear copy moves by 0 to 5%. On the four tree frames, at strength 1, 43 to
   56% of the darkest third within radius 0.2 is more than 5% darker than at 0.
   On NIR_1703 a cloud at the middle turns from neutral toward blue from 1,
   plainly at 1.25 and 1.5
   ("Third check", below). A remedy is its own record once the cause is known;
   this option is the finding, as 6 is.

## Rejected

- **2, a per-image strength.** Practitioners do correct by hand, per image, and
  the app already has the slider (remembered from photo to photo until
  2026-09-30; on production from that day in v2.64.31 (3bb7e37) it opens at 1
  on every matched photograph instead). But it asks
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

Re-opened with the Options (2026-09-29): 2 to 5 were rejected against clip
control, 5 because the whitening is on the reported frame at the strength
every matched frame opens at. With none chosen, 5 was live again under option
6: if the cut is the lens's own cast coming off, the correction is right in
colour. The second check (2026-09-30) found that, and 5 looked like the likely
answer. The third check (2026-09-30) withdrew that: the second check's basis
was colour alone, and the correction also changes brightness in the rendered
picture, which it did not measure. Whether that change is wanted is a look
choice. 5's objection still describes the pictures: the leaves at strength 1
are paler than at 0. What changed is what that paleness is: less of the hot
spot's red on them. The check measured the neutral things beside the leaves,
not the leaves, and the gaps it left at 1 may be hot spot still there. Chosen
2026-09-30 (Options): 5, with the opening strength made 1.

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

## Third check, 2026-09-30: brightness across the whole frame

**Why it was run.** The first check read colour in a 1:1 crop of the centre. The
second read colour on nine regions, in six pairs of centre against edge. Neither
measured brightness, and neither looked above strength 1, while the slider runs
to 1.5. A centre that gets dimmer beyond some point was then reported on the
whole picture. This check measures brightness on whole frames across the
slider's whole range.

**What was run.**
- Six of the shared raws, all under the Aerochrome chip:
  - the record's three, NIR_1376.NEF, NIR_3716.NEF and NIR_3700.NEF;
  - three more with sky or foliage across the frame: NIR_1651.NEF, NIR_1661.NEF
    and NIR_1703.NEF. NIR_1651 and NIR_1661 are upright frames.
- The capture build was a copy of today's build with one added read-back
  function. Each raw was opened in it once and captured as it opened, at
  strength 1. The slider was then moved to 0, 0.25, 0.5, 0.75, 1, 1.25 and 1.5,
  as a reader moves it, and the slider's and the applied strength's values were
  read back and matched at each step.
- What was measured is the picture the app's renderer draws, read back
  offscreen at 2800 by 1864 in the photograph's stored orientation, and the
  linear working copy. The canvas on screen was hashed at each step but not
  measured, and the read-back was not compared with it.
- On NIR_1376.NEF alone, the shipped build and the capture build were driven
  through the Aerochrome chip, then 1, 0 and back to 1, and hashed alike at
  every step. The other five were not compared with the shipped build.
- Brightness is Rec. 709 luminance of the rendered picture, decoded from sRGB to
  linear light. The linear copy's figure is the mean of its three channels.
- Each pixel is compared with the same pixel at strength 0, so the scene's own
  content cancels. Distance runs from 0 at the centre to 1 at the corner.
- The ring figures are means of those per-pixel ratios. They leave out pixels
  whose luminance at strength 0 is under 0.01 or over 0.95, or whose luminance
  at the step is under 0.005 or over 0.99. That drops 0 to 7% of the middle on
  every frame, and 0 to 4% of the outer rings on four of them, but up to 23% of
  an outer ring on NIR_1661 and up to 44% on NIR_1703, whose corners are dark;
  their outer-band figures rest on what is left.
- Pixels are also split into thirds by their brightness at strength 0, across
  the whole frame, because a ring's figure mixes the parts that rise with the
  parts that fall. The middle is radius under 0.1 for the ring figures and
  under 0.2 for the thirds.
- The thirds, the sky boxes and the cloud box are read from half-size copies of
  the rendered picture (1400 by 932, 8-bit, each pixel the mean of four). The
  thirds leave out pixels at or under 0.003, or at or over 0.97 at strength 0
  and 0.99 at the step.
- What each instrument was made to fail on:
  - the ring figures in the capture (the middle, the outer band, the linear
    copy): strength 0 against itself reads 1.000 in every ring. No plant was
    run through them;
  - the sky-and-other rings, on NIR_1376: a planted brightening of the centre
    by 1.2 reads 1.200, a darkening by 0.8 reads 0.800, and a plant of nothing
    is refused;
  - the thirds, on NIR_1651: a planted darkening of the darkest third inside
    radius 0.2 reads 0.800 with the brightest third unmoved, and a plant of
    nothing is refused;
  - the boxes, on the NIR_1703 cloud: a planted darkening by 0.8 reads 0.800,
    and a plant of nothing is refused;
  - the picture sheets: a short capture is refused (not kept).
  The outputs of the rest are kept beside the captures.

**What the pictures show.** On the oak, the towers, NIR_1651 and NIR_1703 the
corners visibly darken as the strength rises; on the pampas and NIR_1661 that
shows in the maps and the figures. In the middle, lit foliage and pale ground go
brighter and paler. On NIR_1703.NEF, conifers under cloud, a pale blue patch
opens in the cloud at the middle at 1.25 and 1.5.

The maps of each pixel's change against strength 0 show one more thing, on the
oak and the two pine frames NIR_1651.NEF and NIR_1661.NEF: the trunk and the
shadowed branches in the middle get darker, while the lit leaves around them get
brighter. On NIR_1703 grey patches of the middle's cloud get darker at 1.5. By
eye on the whole frames, the dark parts of the middle look about the same at
every strength on the oak, NIR_1651 and NIR_1661. So on those three the dimming
shows in the maps and the figures, not plainly in the pictures at the size they
were opened.

**Figures.** Most are given at strength 1, where every matched frame opens, and
at 1.5.
- **The middle** (radius under 0.1), all counted pixels: brighter on all six,
  by 6 to 57% at 1 and 9 to 88% at 1.5. Taken instead as the ratio of the
  ring's mean luminance, it is 6 to 54% at 1 and 9 to 76% at 1.5; the top of
  the range depends on the method.
- **The outer band** (radius 0.7 to 1): darker on all six, by 8 to 15% at 1 and
  10 to 22% at 1.5 (as a ratio of means, 7 to 11% and 10 to 16%). That is
  mostly its sky: on NIR_1661 and NIR_1703 the pixels at the edge that are not
  sky hold within 3% or brighten (0.976 to 1.062 in the outermost
  rings).
- **The darkest third inside radius 0.2, on the four tree frames** (the oak,
  NIR_1651, NIR_1661, NIR_1703).
  - The share of it more than 5% darker than at 0:
    - at 0.5, 34%, 8%, 59% and 10%;
    - at 1, 54%, 43%, 55% and 56%;
    - at 1.5, 46%, 34%, 44% and 67%.
  - Of the strengths read by tone (0.5, 1, 1.25, 1.5), the share is largest at
    1 on the oak and NIR_1651, at 0.5 on NIR_1661, and still growing at 1.5 on
    NIR_1703.
  - Its median, as a ratio to 0: 0.928, 0.990, 0.909 and 0.946 at 1, and
    0.989, 1.107, 1.023 and 0.924 at 1.5. So as a whole it is darker at 1 on
    three of the four and unchanged on NIR_1651, and at 1.5 darker only on
    NIR_1703.
  - The brightest third inside the same radius rises by 5 to 35% at 1.
- **The same darkest third on the towers and the pampas**: brighter, a median
  of 1.593 and 1.151 at 1, with 1% of it more than 5% darker.
- **Sky at one height**, on two frames, the second check's regions: a box at
  the middle of the width against the two edges at the same height. On the oak
  the centre sky is 1.03 times the edges' mean at 0, 1.13 at 1 and 1.19 at 1.5;
  those boxes sit near the top of the frame, so its centre box is at about
  radius 0.39, not the middle. On the pampas, at about radius 0.13, it is 0.62
  at 0, 0.74 at 1 and 0.82 at 1.5. On both, the centre never falls below where
  it stood against the edges at 0.
- **The cloud at the middle of NIR_1703** (a box above the tree line, x 0.40
  to 0.55 and y 0.36 to 0.50 of the frame, with the 4% of it that is a red tree
  tip left out). Its luminance rises by 5% at 1 and 8% at 1.5. Its colour moves
  from neutral to blue: chroma, the mean over its pixels of the largest channel
  minus the smallest, of 255, is 4 at 0, 18 at 1, 32 at 1.25 and 48 at 1.5. Its
  mean sRGB is 216, 213, 215 at 0 and 194, 226, 242 at 1.5.
- **The linear working copy**, before exposure and the look, which is the
  profile's own effect as applied. At 1, its middle is 0.981, 0.986 and 0.964
  of its value at 0 on the oak, NIR_1651 and NIR_1661, and 1.004, 0.999 and
  1.004 on the towers, the pampas and NIR_1703. At 1.5 the lowest is 0.948, on
  NIR_1661. Its outer band moves by under 1% on all six at either strength.

So at strength 1 the linear copy's middle changes by 0 to 4% and the rendered
middle by 6 to 57%; at 1.5, by 0 to 5% and by 9 to 89%. Exposure was not read at
each step, so which stage after decode makes the difference is not measured. The
first check found that at the centre the correction cuts blue against red, and
that Aerochrome's green output carries minus 1.44 times the matrix's blue. A blue
cut would raise brightness where it lands, which fits the brightening; it was not
measured here. Also not measured: why the darkest third falls on the four tree
frames and rises on the other two. The linear middle does not explain it: it
falls on three of the four tree frames and not on NIR_1703.

**What it supports.**
- The middle does get dimmer, in part, on the four tree frames. At strength 1,
  43 to 56% of the middle's darkest third is more than 5% darker than at 0, and
  as a whole that third is darker on three of them. On NIR_1703 the share keeps
  growing to 67% at 1.5; on the other three it is largest at or below 1.
- Meanwhile the middle's bright parts brighten, and the outer band darkens on
  all six, mostly through its sky.
- In sky at one height, on the two frames measured, the centre never falls
  below where it stood against the edges at 0: on the pampas it closes on them
  from below, and on the oak, near the top of the frame, it rises above them,
  1.19 times at 1.5.
- On NIR_1703 the correction also turns the middle's cloud from neutral to
  blue, a little at 1 and plainly at 1.25 and 1.5. The second check found that
  neutral things at the centre stop short of the edge at strength 1; it did not
  look above 1, and it had no cloud. Whether this cloud is neutral in the scene,
  and so whether this is the correction taking more than the lens put there, is
  not known. 069's defect is also a cloud going cyan, which this record's
  Depends attributes to the white point.
- None of the earlier checks could see the brightness change. The first read
  colour in a crop, the second colour on neutral regions.
- The second check's finding stands for colour: the centre's cut is the lens's
  own cast coming off. Its recommendation to leave the correction as it opens
  rested on colour alone, and it is withdrawn. Whether the change in brightness
  is wanted is a look choice, not decided here.

**Caveats.**
- One look, Aerochrome. A look that maps colour to brightness differently may
  not show this.
- Six raws, one camera. Which lens, focal length and aperture each was taken
  at, and so which profile applied, was not read here.
- "More than 5% darker" is a threshold chosen for this check, not a figure for
  what an eye can see.
- The pictures were measured as the renderer draws them offscreen, not as the
  canvas shows them.
- For the oak, the towers and the pampas, the four-panel sheet and a change map
  were opened before any figure was read; their eight-state sheets were opened
  afterwards.
- The app does not come back to its opening picture. As opened at 1, and at 1
  after the slider has moved, the capture build's pictures hash differently on
  all six raws, and on NIR_1376 the shipped build does the same. The ring
  figures for the two agree to within 0.00001. Where the difference comes from
  is not established.
- The sky on NIR_1651, NIR_1661 and NIR_1703 carries stepped banding at strength
  0 as well. It was not examined.
- Whether this is what was seen on the device is not known. Which look and
  which photograph showed it was not recorded.
- The cloud box was placed by eye on the whole frame at 1.5, where the blue
  patch shows; it is one box on one frame.

**Not tested.** Any remedy; any other look; anything on a device.

## Found while building, and fixed after

Five defects in the slider were found while the chosen option was built. They
shipped to production in v2.64.31 as found and not fixed, and were fixed on
2026-09-30: on production from 2026-09-30 in v2.64.35 (2fdf8be), on the go
given before any device pass. None of them changes an option above. Each fix has a check in
`tools/lens-order-walk.mjs`, and each of those checks failed on production's
build (3bb7e37) before the fix. Each fix was then planted out of the fixed
build, and exactly its own checks failed.

- **A lens picked by hand was not part of the edit (e).** The pick set the card's
  state (`hotspotState`) and nothing in `EditParams`. Undo left the lens picked at
  0, and a return to the photograph asked for the lens again. The pick is now
  `EditParams.lensPick`, the lens and the focal length, and `applySnapshot`
  derives the card from it (`hotspotFromPick`). So Undo, Redo, Reset, a return
  and a resumed session all say what the edit says. It is per-shot and rides no
  saved look, as the editors in Looked up keep it.
- **After a pick, Reset and the double tap disagreed (e2).** Reset went to 0 with
  the lens still picked, and a double tap then went to 1. This follows from the
  first fix: Reset now takes the pick back, and both give 0.
- **The tile did not follow the lens (f).** A tile was redrawn only when its
  grade stamp moved, and the stamp carried no lens. A tile drawn from an edit
  also took its curve from the file's EXIF, which on a picked photograph names
  nothing. The tile stamp now carries the strength, bypass and pick (`stampFor`,
  not `stampOf`, which also answers whether a look was changed by hand). The
  lens controls ask for the open photograph's tile to be checked
  (`restripOpen`), and a tile takes the picked lens's curve (`lensCurveFor`). The colour-file grid, drawn from the open
  photograph's own edit, now takes the open photograph's curve
  (`currentLensCurve`), a picked lens included. A batch needs no change: it is
  built from each file's fresh opening (`batchParamsFor`), never from an edit,
  so it never carries a pick. Measured on a 32 by 32 reading of the tile, the
  pick at 1 and at 0 differ by 1.01 levels; with the curve planted out, by 0.00.
- **Aerochrome's finishing copy moved nothing while the reader's own profile was
  in use (g).** It was wired to the shipped card's Strength, which that profile
  supersedes. It now asks at each move which card owns the correction
  (`mirrorPrimary`).
- **After a return, a double tap on other sliders went to the last fresh open's
  value (h).** The defaults were captured only at a fresh open. Each
  photograph's are now kept with its live edit and restored on a return.
  Measured on Exposure: opened at 615, the other frame at 687, and a double tap
  after the return went to 687 before and to 615 after.

A review of the change, three reviewers with a skeptic on each finding, confirmed
three more defects in the code it touches. All three were fixed before the commit:
- **Undo, Redo and Reset never asked the strip to look again**, so a tile kept
  the correction those had just taken off. Now they ask for the open
  photograph's tile to be checked, and the walk holds it:
  Undo of a Strength move redraws the tile, and with the call planted out it
  does not. That check was added after the review, so it was not run on
  production's build; it was made to fail by planting its fix out.
- **A tile was stamped after it was drawn and saved**, so a lens move made in
  that window left a picture of the old strength marked as current, and nothing
  would ever redraw it. The stamp is now taken with the edit the tile is drawn
  from. No walk check holds this one: the window is a render's length, and no
  check here times a move into it.
- **"Forget this profile" left Aerochrome's copy of the slider on the forgotten
  profile's value.** The copy is now read again whenever the reader's own
  profile changes. No walk check holds this one either.

One finding was judged not a defect: each lens move restarts the redraw pass,
which repeats work, but every tile still ends up drawn from the right edit.

**What it costs.** The preview version moves from 66 to 67, because the new
field is in `src/pipeline.ts`, which the preview gate hashes whole. So every
quick-look preview stored on a device is rendered again once, the first time it
is needed after the update. A move of the lens strength now also marks the
open photograph's tile for a redraw, which waits for the reader to stop, as
every tile redraw does. Undo, Redo and Reset now ask for the same check after
any change, not only a lens one. By the code, that redraws the open
photograph's tile when the edit they land on differs, in the grade or the lens,
from the one the tile was drawn under, which a move of a grade slider such as
Hue or Contrast never asks for. No check measured this. These calls check the
tile of the photograph that was open when they were made, and no other. The first version used the strip-wide check, and a scope watcher
reading the code found the cost: a tile for a photograph not yet opened is
stamped with the live grade, so after any grade slider move a lens move would
have redrawn every unopened tile.

**Not established.** Whether balance, exposure and highlight recovery have the
same tile gap. A tile drawn from an edit takes them from that edit
(`makeThumb`; denoise is not among them, every tile is drawn at 0), and the
stamp that decides a redraw does not carry them, so by the code a move of one of
them alone does not mark the tile stale. No check here measured it, and nothing
here fixes it.

**Found and not fixed, older than this change.** Adding or forgetting the
reader's own profile changes the curve a tile takes (`lensCurveFor` reads the
stored profiles), and nothing asks the strip to look again when it happens.

## Rank

First, where 015 stood, now that 078 is archived. Re-opened for research
(2026-09-29), it stays first: 069 and 013 each touch it. The correction's cut
changes the centre colours 013's foliage is tuned against, and pushes pale
bright values past white where 069's clouds are, so either one tuned first
would be tuned again. It goes above both. The second check (2026-09-30) leaves
it first: until 5 is settled, 069 and 013 do not know which centre they are
tuned against. The third check (2026-09-30) keeps it first: in the rendered
picture the correction changes brightness across the whole frame, and 069's
clouds and 013's foliage are both judged in it. Chosen 2026-09-30 and on
production the same day in v2.64.31 (3bb7e37), it stays first until the iPad
pass on the slider: 069 and 013 are tuned against the centre it settles.

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
- NIR_1376.NEF, 2026-09-30, the third check's eight whole frames side by side
  (as opened, then 0, 0.25, 0.5, 0.75, 1, 1.25 and 1.5 after the slider), the
  four-panel sheet (0, as opened, 1, 1.5) and the change map at 1. At 0 a warm
  grey halo sits in the sky around the crown; by 0.5 it is fainter, and at 1 to
  1.5 the sky is an even blue while the upper corners go a deeper navy. The
  crown pales a little from 0 to 1.5. In the map the trunk and main branches
  are darker than at 0, the leaves around them brighter, and the outer frame
  darker.
- NIR_3716.NEF, 2026-09-30, the same eight frames, the four-panel sheet and the
  change map at 1. At 0 the grass in the middle is a deep red; from 0.5 it
  goes paler, and at 1.5 it is a pale pink-white, visibly brighter than at 0.
  The bottom corners go darker. The red flare at the left and the pale streak
  in the sky are the same at every strength. The map shows a bright disc in
  the middle with the fence posts in it darker, and the outer frame darker;
  the disc's edge looks sharper in the map than the ring means show, and it was
  not examined.
- NIR_3700.NEF, 2026-09-30, the same eight frames, the four-panel sheet and the
  change map at 1.5. At 0 the sky between the two tower trees is a
  brownish-grey patch with a red spot; by 0.5 it is grey, and at 1 and 1.5 a
  slate blue like the sky around it. The plumes go whiter from 0.5 up. By eye
  the slate at 1.5 reads darker than the brown-grey patch at 0, while the
  second check's centre box there measures 0.0875 in luminance at 0 and
  0.1081 at 1.5. In the map the plumes in the middle are brighter,
  the dark tower tree on the left darker, and the outer frame darker, with
  faint rings in the sky.
- NIR_1651.NEF, 2026-09-30, an upright frame shown as stored, turned a
  quarter: the same eight frames, the four-panel sheet and the change map at
  1.5. From 0 to 1.5 the sky in the corners on the sky side goes from a lighter
  teal to a darker navy, and the cloud at the far edge from bright cyan-white
  to a greyer, duller tone. The foliage across the middle looks about the same
  by eye at every strength. In the map the lit foliage in the middle is much
  brighter, the dark branches inside it darker, and the foliage at the frame's
  edge darker.
- NIR_1661.NEF, 2026-09-30, an upright frame shown as stored, turned a
  quarter: the same eight frames, the four-panel sheet and the change map at
  1. At 0 the foliage in the middle carries a pink-red patch; at 1 and 1.5 it
  has gone white like the rest of the crown. The sky beside it is a lighter
  teal at 0 and a little more even above it. By eye the dark shadowed boughs
  low in the middle look about the same at every strength; in the map they are
  darker, and the lit foliage above and below them brighter.
- NIR_1703.NEF, 2026-09-30, the same eight frames, the four-panel sheet, the
  change map at 1.5, and a crop of the cloud at the middle (x 0.40 to 0.55, y
  0.36 to 0.50 of the frame) at 0, 1, 1.25 and 1.5 opened beside them; a red
  tree tip sits in the crop's lower left corner. The
  upper corners go a deeper blue as the strength rises. The cloud in the
  middle is an even white-grey at 0 and whiter at 1; at 1.25, and more at 1.5,
  a pale blue patch opens in it just above the trees. In the crop the patch at
  1.5 is lighter than at 0 and plainly blue; on the whole frame it read duller,
  which was the white turning blue. In the map the lit edges of the trees in
  the middle are brighter, grey patches of the cloud in the middle darker, and
  the upper corners darker.
- All six, 2026-09-30: as opened and at 1 after the slider look the same by
  eye. The skies of NIR_1651, NIR_1661 and NIR_1703 carry stepped banding at
  every strength, 0 included.
