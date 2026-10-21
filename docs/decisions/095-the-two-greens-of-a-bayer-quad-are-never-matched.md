# 095 · The two greens of a Bayer quad are never matched

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the fifth tier of the stages marked missing, by
reach: stages that are off by default where the default was read and that need no
infrared-specific reason. This record takes green equilibration, and the DNG tag
that belongs to it.

**What the references do.** LibRaw has a green matching step, named in its code
"green equilibration", with a default of 0 (off), skipped at half size
(`dcraw_process.cpp`). RawTherapee's pre-processing panel has a green equilibration
adjuster from 0 to 100 starting at 0 (`rtgui/tools/bayerpreprocess.cc`). dcraw's
`main()` has none, and the darktable order lists read name no module for it;
whether darktable's demosaic module carries such an option was not read. The DNG
specification carries a hint
tag, BayerGreenSplit (page 36), which states how closely the greens of the blue
rows track the greens of the red rows, from 0 to about 5000; it is a hint to the
reader of the file and not a requirement.

**What the app does today.** Nothing matches the two greens. The demosaic is the
RCD method ported from darktable, and BayerGreenSplit is read nowhere for
rendering. IR-SCIENCE.md has no statement about it either way.

**What is not known.** Whether the two greens differ at all on the reader's own
raws. No ratio was measured in this run, and the cost of finding out is one number
per frame.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it, so a list or a number from one is as that tool returned it.

- **LibRaw**, `src/postprocessing/dcraw_process.cpp` on the LibRaw repository
  (summary): `green_matching` with default 0, called after the maximum is adjusted
  and before the scaling, skipped at half size. The LibRaw documentation page
  https://www.libraw.org/docs/API-datastruct.html (summary) lists the setting.
- **RawTherapee**, https://github.com/RawTherapee/RawTherapee/blob/dev/rtgui/tools/bayerpreprocess.cc
  (summary): the adjuster's range and starting value; its default for the whole
  program lives in `rtengine/procparams.cc`, which is unread (the page is cut at
  1000 of 5496 lines).
- **The DNG specification, version 1.6.0.0**, page 36 (BayerGreenSplit), at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf, read as pdf pages.
  Adobe's own 1.7.1.0 copy answered HTTP 403.
- **dcraw** (https://raw.githubusercontent.com/ncruces/dcraw/master/dcraw.c, a
  GitHub mirror): no green equilibration step in `main()` (summary).

## Weighed against

- **061, red and blue do not line up** (archived). The alignment fits red and blue
  against a green read at every site (IR-SCIENCE.md 9v), so two unequal greens would
  bias that fit; a match, if built, goes before it.
- **The general line-noise filter (record 096) and noise reduction on the mosaic
  (record 098)** (this block). The same place in the order, before the demosaic, and the same question of
  which comes first.
- **013, Aerochrome is the right colour and comes out splotchy** (open, NOTES.md
  roadmap). A pattern between the two greens would show as mottle in flat areas;
  whether any does is unmeasured.

## Options

1. **Measure first, then decide.** Chosen.
   - For each of the reader's own raws, take the median ratio between the green
     photosites on the red rows and the green photosites on the blue rows over the
     whole mosaic after the black subtraction, and over a flat region. A ratio
     within the frame's noise of 1 closes the record as not owed.
   - If a ratio departs from 1, render with the greens matched and not, and open
     flat regions at 1:1 for the pattern the demosaic would draw. If a pattern is
     seen, build one gain per photograph measured from the data, applied to the
     mosaic before the channel alignment and the demosaic, and reported per
     photograph in the diagnostic as the Channel alignment line is. Record 061 ruled
     that decode work measured from the file moves nothing a slider sets; this is a
     property of the sensor read from the file in the same way, and the ruling is
     made when it is built, on the pictures. A `## Looked at` section is owed.
2. **RawTherapee's adjuster.** A control before any measured need; its own starting
   value is 0.
3. **Use BayerGreenSplit where a DNG carries it.** The tag is a hint a converter
   may write, a NEF carries no such tag so far as anything read shows, and the data
   is the better source.

## Rejected

- **On by default now.** No reference read turns it on, and nothing measured says
  the reader's frames need it.
- **Reading BayerGreenSplit as the gain.** It is advice about how closely the
  greens track, not a correction factor, and the specification does not require a
  reader to use it (pages 35 to 38).

## Rank

Sixth in the block and first of the fifth tier, which is ordered as the comparison
lists it because nothing read separates the four. It has the cheapest measurement of
the four, a ratio per frame. It sits behind the defringe record (094), which has a
measured remainder to look at, and ahead of the line-noise filter (096), the dark
frame (097) and the mosaic noise stage (098).

## Depends

- touches 061 — the alignment reads a green at every site; a match goes before it.
- touches 013 — a pattern between the greens would show as mottle that open item measures.
