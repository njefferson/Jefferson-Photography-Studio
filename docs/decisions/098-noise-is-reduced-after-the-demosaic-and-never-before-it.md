# 098 · Noise is reduced after the demosaic and never before it

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the fifth tier of the stages marked missing, by
reach. This record takes noise reduction on the mosaic, and the three DNG tags that
belong to noise.

**What the references do.** darktable has a raw denoise module at position 7 of its
order, before the demosaic at 8, and the version 4.0 manual's key marks it off by
default; its profiled denoise at 9 comes after the demosaic and is also off. LibRaw
runs a noise reduction before the interpolation when `fbdd_noiserd` is above 0, and
dcraw has `-n`, a wavelet denoise with a user threshold; the defaults and the call
sites of both were not in the parts read. RawTherapee's default raw profile sets no
noise key. The DNG specification has three tags: BaselineNoise (page 35, with
NoiseProfile recommended instead), NoiseProfile (page 57, a two-parameter model,
the square root of S times x plus O, for each plane) and NoiseReductionApplied (page
47), the last being where a converter records noise reduction it has already done.

**What the app does today.** Noise is reduced after the demosaic.
`src/raw/denoise.ts` runs a 13 by 13 bilateral on the demosaiced linear copy before
the white balance, with its range in noise units on an equal-weight guide and its
colour half on a wider grid; the strength is measured from each photograph at open
(`estimateDenoise` in `src/main.ts`) and lands on a visible slider. No stage touches
the mosaic and none of the three DNG tags is read.

**What IR-SCIENCE.md says, in two directions.** Section 4c-x measured the sky's
mottle as dense, two to four pixels across and correlated at the scale of the
colour mosaic, and said the next look belongs upstream, at the demosaic of a channel
the conversion has left almost nothing to record. Section 4c-xxii then found that
the pale speckle was luminance and fixed it downstream, by widening the luminance
window from 5 by 5 to 13 by 13, at 3.7 times the cost of that stage on the export
path. So the defect a mosaic stage was thought to be needed for was reached from
the other side, and what is left is cost and the frames shot well under, which record
072 holds.

**What is not known.** Whether any structure at the demosaic's scale survives the
shipped denoiser on the reader's frames under the looks that amplify most.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it, so a list or a number from one is as that tool returned it. The
specification was read as pdf pages.

- **darktable**, the version 4.0 module order page
  (https://docs.darktable.org/usermanual/4.0/en/special-topics/module-order/,
  summary): raw denoise and profiled denoise are in the order and are not among the
  eight modules marked on by default; the version 5 list in
  https://raw.githubusercontent.com/darktable-org/darktable/master/src/common/iop_order.c
  (summary) gives positions 7 and 9.
- **LibRaw**, `src/postprocessing/dcraw_process.cpp` (summary): fbdd noise
  reduction before the interpolation when `fbdd_noiserd` is above 0.
- **dcraw**, https://raw.githubusercontent.com/ncruces/dcraw/master/dcraw.c (a
  GitHub mirror): `-n` sets the wavelet threshold (summary).
- **The DNG specification, version 1.6.0.0**, pages 35, 47 and 57, at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf, read as pdf pages.
- **RawTherapee**'s default raw profile
  (https://github.com/RawTherapee/RawTherapee/blob/dev/rtdata/profiles/Auto-Matched%20Curve%20-%20ISO%20Low.pp3,
  summary): no noise key in its RAW section.
- **IR-SCIENCE.md** 4c-ix, 4c-x and 4c-xxii (the measurements named above) and
  4c-xxv (the denoiser's range in noise units, as record 072 describes it).

## Weighed against

- **072, a photograph shot well under opens grainier** (open, NOTES.md roadmap). The
  strength the denoiser opens at, and whether a frame shot under should open as clean
  as a normal one. A pass before the demosaic would change the numbers that record's
  calibration is made on.
- **013, Aerochrome is the right colour and comes out splotchy** (open). The colour
  half of what the noise stages leave in a sky.
- **093, 095 and 096** (this block). The other stages that sit on the mosaic before
  the demosaic.
- **NOTES.md "Aerochrome is the matrix now, and a look may raise denoise,
  2026-09-16"** and the later shipped widening of the luminance filter, recorded in
  IR-SCIENCE.md 4c-xxii.

## Options

1. **Look first, and build a pass on the mosaic only if the shipped denoiser leaves
   something it cannot reach.** Chosen.
   - Open the reader's own frames at 1:1 at the opening settings, under the looks
     that amplify most, and look for structure at the demosaic's scale that the 13 by
     13 filter leaves. If there is none, close the record as not owed.
   - If there is, prototype a pass on the mosaic per colour plane before the channel
     alignment and the demosaic, with its strength taken from the photograph's own
     noise in the units the denoiser already uses, and compare it by pictures with
     the post-demosaic filter, including the cost of the two together. A `## Looked
     at` section is owed. The result is a visible strength control, starting where the
     pictures say.
2. **Read the DNG noise tags where a file carries them.** NoiseProfile as the
   denoiser's noise model in place of its own measurement, and NoiseReductionApplied
   to tell the app a converter has already reduced noise so that it does not reduce
   twice. This is narrower and independent: a NEF carries no such tags so far as
   anything read shows, and the camera the app records is a NEF camera. The count
   comes first, over the reader's own DNGs.

## Rejected

- **A mosaic denoise by default now.** darktable leaves its raw denoise off, no
  defect left to fix is shown, and the one earlier widening of this app's denoiser
  cost 3.7 times that stage on the export path.
- **Replacing the post-demosaic denoiser.** It was fitted in noise units on six of
  the reader's raws (4c-xxv) and fixed the defect it was built for.
- **dcraw's wavelet threshold.** A constant the user sets; this app takes its scale
  from the photograph.

## Rank

Ninth in the block and last of the fifth tier, ordered as the comparison lists the
tier. It is behind the dark frame (097) by that listing and behind every stage above
it by evidence: the defect that first suggested a mosaic stage (4c-x) was fixed
downstream (4c-xxii), so nothing measured says anything is left for it. It is ahead
of the opcodes that only some files carry (099) because it can matter for every
photograph if it matters at all.

## Depends

- touches 072 — a pass on the mosaic would change the numbers that record's calibration is made on.
- touches 013 — the colour half of what the noise stages leave in a sky.
- touches 093 — the other stage on the mosaic before the demosaic; the order of the two is decided when either is built.
- touches 095 — likewise.
- touches 096 — likewise.
