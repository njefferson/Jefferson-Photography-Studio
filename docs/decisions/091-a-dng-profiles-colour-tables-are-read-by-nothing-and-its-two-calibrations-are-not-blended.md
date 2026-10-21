# 091 · A DNG profile's colour tables are read by nothing, and its two calibrations are not blended

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the second of the stages marked missing, by
reach. This record takes two stages together because they are two halves of one
chapter of the specification: what a DNG's profile does to colour after the
camera's matrix, and how two calibrations are combined.

**What the specification says.** After the conversion to the D50 white (chapter 6,
pages 85 to 88) comes the profile's hue, saturation and value map, if any: the
colour goes to linear ProPhoto RGB and then to HSV, a trilinear lookup in the
table gives a hue shift in degrees, a saturation scale and a value scale, and
two tables are interpolated like the two calibrations are. A profile may also
carry a look table in the same format, "applied later in the processing pipe,
after any exposure compensation and/or fill light stages, but before any tone
curve stage" (page 55), and a default tone curve "as a starting point for
adjustment", linear gamma and a cubic spline (page 49). With two or three
calibrations the converter interpolates "linear interpolation using inverse
correlated color temperature" of the user's white balance, required from DNG
1.2.0.0 (page 85).

**What the app does today.** `dngCameraToSrgb` in `src/color.ts` follows chapter 6
for the matrices: ForwardMatrix or ColorMatrix with AnalogBalance and
CameraCalibration, one calibration chosen, the daylight one (`dngCalibration`).
No part of rendering reads the profile's hue and saturation map, its look table
or its tone curve; `src/dcp.ts` only writes some of them into an exported profile.
IR-SCIENCE.md section 4, route 2, already records the gap: the profile's hue and
saturation tables are still not applied.

**Why it applies in infrared.** That same passage describes the profile-based
route and the two infrared profiles read so far, which sit in some of the reader's
Lightroom DNGs. They carry the same ForwardMatrix and differ only in ColorMatrix,
which the specification uses only to turn a white-balance xy into a camera
neutral, so they are white-balance calibrations and not two colour renderings, and
with the white balance found from the data they render alike. A profile-based
route puts the author's colour decisions in exactly the tables the app skips.

**What is not known.** Whether those two profiles, or any profile on the reader's
files, carry a hue and saturation map, a look table or a tone curve at all. No
file was opened in this run. If none does, this stage changes nothing for the
reader, and the count that settles it comes before any code.

**The calibration blend.** The specification's interpolation parameter is the
correlated colour temperature of the selected white balance. Here the white point
is found from the data (IR-SCIENCE.md section 3), which is not a daylight colour
temperature, and the two infrared profiles read carry the same ForwardMatrix, so
interpolating between them returns the same matrix. The blend is not applicable to
those two profiles and is unmeasured for any other DNG.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it, so a list or a number from one is as that tool returned it. The
specification was read as pdf pages, which is the reading itself.

- **The DNG specification, version 1.6.0.0, December 2021**, at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf, read as pdf pages:
  chapter 6, pages 85 to 88 (the conversion, the calibrations and their
  interpolation, ValueDivisions of 1 recommended for the map); page 55
  (ProfileLookTableData); and page 49 (ProfileToneCurve). Adobe's own copy of
  version 1.7.1.0 answered HTTP 403, so the 1.7 additions are unread.
- **darktable and dcraw and LibRaw** have no profile table stage; the sources read
  (the module order, `dcraw.c`, `dcraw_process.cpp`) show none.
- **RawTherapee** reads DCP files with these tables: a search summary only, not
  fetched, so it is not a source here.
- **Adobe Camera Raw and Lightroom**: no help page was read (HTTP 403); nothing
  read shows what their default does with an embedded profile's tables.
- **IR-SCIENCE.md** section 4 route 2 and section 3 (the white point comes from
  the data).

## Weighed against

- **084, HSL adjustments and channel swaps for making infrared looks** (open,
  NOTES.md roadmap). Both change colour by hue band after the conversion to the
  working colour; the profile's map would run first and the look's bands after.
- **The at-open ruling** (CLAUDE.md, "What opens applies"): an automatic that
  changes the picture is visible, undoable, and leaves the bare decode one press
  away. The profile's tables are the profile author's taste, not physics, so they
  carry a switch.
- NOTES.md headings on DNG colour: the matrix route landed on 2026-10-02 and is
  recorded in IR-SCIENCE.md section 4; no roadmap item was open for the tables.

## Options

1. **Count first, then apply the hue and saturation map and the look table where a
   profile carries them.** Chosen.
   - A read-only line in the diagnostic first: which of the three tables a file's
     profile carries and their dimensions. No pixel changes and no render is
     needed, so the reach of this stage becomes a count over the reader's own DNGs.
   - If a profile carries any, apply the map in the DNG colour path after the
     conversion to D50 and before the look's own mixer (page 88), and the look
     table after exposure and before the tone stage (page 55), interpolating
     between two tables like the calibrations where a file has two.
   - A visible switch, shown only for a file whose profile carries tables, with the
     original file never changed and the bare decode one press away. It is an
     `EditParams` field: five places, and the sixth, `stampOf`, if a look writes it;
     it does not ride a saved look, being per-shot corrective like white balance.
   - Pictures before the default is chosen: the reader's own DNG with and without
     the tables, opened whole and at 1:1, sent as pictures, because the choice is
     about how a photograph looks. A `## Looked at` section is owed first.
   - The calibration blend is not built, and is reopened only if a DNG appears whose
     calibrations carry different ForwardMatrix.
2. **Read a separate DCP file the reader supplies.** A second source for the same
   tables, for a profile held without a DNG. A later record if there is one; it
   would also need a file picker, with the problems that implies on a tablet.

## Rejected

- **ProfileToneCurve as the tone stage.** The app's tone is display-referred, with
  contrast about 18 percent grey, a gamma and a tone curve, and the profile's curve
  is "a starting point for adjustment" (page 49). Stacking it on the app's own
  curve bends the tone twice, and the specification puts the look table before any
  tone stage. A curve authored for visible scenes is not known to suit infrared;
  nothing read says.
- **Interpolating two calibrations by the white balance's colour temperature.** The
  parameter does not exist here and the two profiles read return the same matrix.
- **Applying the tables with no switch.** They are the profile author's look and
  a reader should be able to see the photograph without it.
- **Treating the tables as already covered by the matrix route.** The matrix route
  is the first half of chapter 6; IR-SCIENCE.md says in terms that the tables are
  still not applied.

## Rank

Second of the block, behind the lens distortion record (090) and ahead of the
bad-pixel opcodes (092). Where a profile carries tables it changes colour and tone
for the whole photograph, which is more than the stages below it change, and the
two infrared profiles on record are of the kind that may carry them. Its reach is
limited to DNGs, and the count that sizes it costs nothing, so it can fall to "not
owed" the day it is taken up. It is ahead of 084 because the profile's map runs
before a look's bands, so the look panel would be tuned against colour this record
may change.

## Depends

- touches 084 — both change colour by hue band after the conversion; the profile's map runs first and the look's bands after.
