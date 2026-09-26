# 072 · A photograph shot well under opens grainier than a normal one

## Context

**Found 2026-09-26**, answering whether a Kolari IR Chrome filter needs
different processing. The filtered frame NIR_3471 is the same scene as NIR_3472,
2.4 stops darker, because the camera's auto ISO made up less than half a stop of
what the filter cost. At open, automatic noise reduction gave the darker frame
0.41 and the brighter one 0.51, automatic exposure stopped at its 16x ceiling on
the darker one, and in the opening renders a flat patch of the darker frame's
sky carried 3.6 times the luma grain (0.0036 against 0.0010 standard deviation
of a high-pass).

**What it turned out to be, from the code** (`estimateDenoise` and
`autoExposure` in `src/main.ts`, the range term in `src/raw/denoise.ts` and its
mirror in `src/gl.ts`). The lower number is not a weaker filter. The estimator
reads noise relative to brightness with a floor of 0.01, and the denoiser weighs
its neighbours relative to brightness with a floor of 0.02; on a dark frame both
floors turn the reading into an absolute one in about the same proportion, so the
lower number smooths the darker frame relatively harder. What stays is that the
automatic setting removes a FIXED SHARE of the noise, a third to two thirds of it, whatever the
frame started with. A frame shot 2.4 stops under starts with about 2.3 times the
relative noise from photon statistics alone, and keeps that multiple after the
denoiser; the exposure push and the look carry it to the screen.

So this is not a formula error with one right answer. Whether a frame shot well
under should open as clean as a normal one, at the cost of texture in its
shadows, is a question about how the owner's calibration should extend, and the
exposure it was made at is not on record.

## Looked up

- **darktable, denoise (profiled)**: noise comes from a profile measured per
  camera and ISO, variance a·x + b in linear raw, and the strength is set for
  peak signal-to-noise; an exposure push is NOT modelled automatically. Its
  manual: the "adjust autoset parameters" slider is "useful when you have had to
  increase the exposure on an underexposed image… The 'effective ISO' used by the
  denoise algorithm is the actual ISO used, multiplied by the value of this
  slider." Source `src/iop/denoiseprofile.c` and the manual page, read.
- **RawTherapee, `rtengine/FTblockDN.cc`**: luminance strength multiplies a
  noise variance measured every time from wavelet coefficients (the median of
  |coefficient| / 0.6745, Donoho's estimator), so its slider is relative to the
  measured noise as this app's is. Read in source.
- **Adobe, "Denoise demystified"** (2023-04-18): noise reduction is left to the
  reader's setting. Read.
- Search summaries only, not verified: Foi et al., IEEE TIP 17(10) 2008, on
  Poissonian-Gaussian noise in raw data. Blocked by this environment:
  webpages.tuni.fi, imjohnstone.su.domains, www.mathworks.com,
  www.computer-darkroom.com.

The field's answer to an underexposed frame is the reader's slider.

## Built already

- `estimateDenoise` (`src/main.ts`): median of |la − lb| / (m + 0.01) over the
  darkest 40% of the half-size frame, before white balance and exposure; target
  sigma 0.75 × median; slider s = √(sigma / 0.1), capped at 0.6. Calibrated on
  2026-07-12 so the default "barely clears the banding", against the 5x5 filter
  of the time; the filter has been 13x13 since 2026-09-17 and the mapping was not
  re-checked.
- `rangeSigma` and the range term (`src/raw/denoise.ts`, `src/gl.ts`): relative
  luma with a 0.02 floor, sigma 0.1 × s².
- The Aerochrome look's denoise floor of 0.45, applied as the larger of the two.

## Weighed against

- **013, Aerochrome's splotchy sky**: the colour half of what the noise reduction
  leaves in a sky; this record is the luminance half on frames shot under.
- NOTES "Gentler denoise + usable slider" (2026-07-12), the calibration this
  would extend, and IR-SCIENCE 9i, the two levers on foliage texture that are
  real.

## Depends

- touches 013 — both are about what noise reduction leaves in a sky, and a change to either strength moves what the other has to clean.

## Options

1. **Leave the rule, and say what it does.** A frame shot well under opens with
   the grain its exposure gave it and the reader raises Noise reduction by hand,
   which is the field's answer too. Proposed.
2. **Set the strength from the grain the reader will see**: measure after the
   exposure the app applies and aim at a fixed amount left rather than a fixed
   share. It needs the exposure the owner's calibration was made at, which is not
   on record, so choosing it is the owner's call, made from renders of frames at
   several exposures, and it has to leave camera-rendered files alone.
3. **Move the denoiser's own floor** so a pushed frame is smoothed harder.

## Rejected

- **A reference exposure of 7x inside the estimator**, designed and checked on
  2026-09-26 before anything was built. The 7 is the median exposure of the
  practice files, which is a constant fitted to frames; the second test pair
  (NIR_3473 against NIR_3474) stays inverted underneath the 0.6 cap; on the
  pushed frame the kernel reaches 2.1 times its shadows' noise and averages away
  texture the brighter frame keeps; and on a camera-rendered file 8-bit
  quantisation alone moves the estimate toward the cap. Its checks were mostly
  unable to fail.
- **3, moving the denoiser's floor**: it changes every photograph's pixels to
  serve frames shot well under, and it was only ever measured at the strengths
  the rejected design picked.

## Rank

Near the end of the open items, after the export panel's wording (054). It
invalidates nothing above it, it affects only frames shot well under exposure,
and the one option that would change behaviour needs a calibration choice the
record cannot make.

## Looked at

- NIR_3471, 2026-09-26: the opening render beside NIR_3472's, a flat sky patch at 1:1; the finer banding in the darker frame's sky.
- NIR_3472, 2026-09-26: the same sheet.
- NIR_3473, 2026-09-26: neutral-balance renders beside NIR_3474, colour at 1x and 4x, whole frame.
- NIR_3474, 2026-09-26: the same sheets.
