# 085 · The lens correction whitens bright centre foliage: hold what it corrects under white, as clip control does

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

## Weighed against

- **015** (archived with this record): the correction, its anchor, and its
  reversal to on at open.
- **069** and **013**, which each declare `needs 015`: both were being tuned
  against what the lens correction does at the centre. A change to the brightest
  centre values moves the cloud and the foliage they measure (Depends).
- **The per-channel tone curve**: CLAUDE.md records that a curve applied
  independently per channel desaturates highlights toward white. That is where
  a value past white loses its colour here.

## Depends

- touches 015 — 015's correction is what this guards; 015 is archived with this
  record as its next half.
- touches 021 — 021 put the correction on the linear copy at decode, before the
  grade, which is where a value carried past white is made and where a guard
  would act.
- touches 069 — clouds are among the brightest values at the centre, so holding
  the correction under white moves what reaches 069's sky stages. The defects
  differ: 069's cyan cloud is the white point's cast, and this is the lens gain
  carrying bright values past white.
- touches 013 — bright foliage is 013's population, and this changes its
  brightest part.

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

1. **Clip control: hold the corrected values under white with one shared
   factor, computed from the photograph.** Chosen.
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
     the pattern a clip makes, so clip control would leave it; whether it is the
     lens's red cast coming off foliage that was never that red, or the
     correction taking too much, is measured in the same first check.
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
  per-channel loss of colour this record is about. Clip control uses one shared
  factor for exactly that reason.
- **5, leave it.** The whitening is on the reported frame at the strength every
  matched frame opens at.

## Rank

First, where 015 stood, now that 078 is archived. 069 and 013 each touch it:
069's cloud and 013's foliage are among the brightest values at the centre, and
this changes them, so either one tuned first would be tuned again. It goes
above both.

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
