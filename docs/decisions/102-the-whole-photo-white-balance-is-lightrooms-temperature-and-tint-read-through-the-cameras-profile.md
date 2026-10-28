# 102 · The whole-photo white balance is Lightroom's Temperature and Tint, read through the camera's profile

## Context

Record 101 built the Basic tab's Temperature and Tint on 24 October as two readings of the three
gains, counted in steps of the gain sliders' own track, and said in four places that they were the
app's own scale and never Kelvin. A plan of 25 October replaced that pair with a Kelvin pair read
through the camera's STOCK matrix, with the locus computed below the SDK's table and the slider
ends read from this camera's raws; its patch was cut and never applied, and its readings are kept
in IR-SCIENCE.md section 3. Neither pair is what Lightroom shows. Lightroom's Temperature for a
raw file is on a Kelvin scale, 2000 to 50000 in Adobe's own schema, with a Tint of minus 150 to
150, and it reaches an infrared white inside that scale because the raw is read through a camera
PROFILE: the one selected in Lightroom's profile browser, which for these photographs is Rob
Shea's Infrared Temp -100 or Infrared Temp -50. A reader who comes from Lightroom looks for the
same two numbers, on the same scale, under the same profile.

The question this record answers is what the two sliders should be so that they are that pair
without the app choosing a range, a sign or a default of its own. The answer it chooses is
Lightroom's Temperature and Tint, converted the way Adobe's SDK converts them, through a camera
profile that is the file's own, or one the reader has loaded for the camera, or else the camera's
stock matrix.

What the research of 27 October measured (IR-SCIENCE.md section 3 has every figure and how each
source was read). The two Z 50 profile files differ only in their two colour matrices; the
forward matrices, the hue and saturation tables, the look table and the tone curve are the same.
Read through them by the SDK's method, the data-found balances of 32 Nikon Z 50 raws from the
shared test folders land at 7414 K to 13211 K (median 10056 K) with a tint of 27.7 to 35.3 under
-100, and at 2948 K to 3526 K (median 3232 K) with a tint of minus 57.0 to minus 35.3 under -50:
inside Lightroom's 2000 K to 50000 K scale and inside its tint range both times, where the same
balances through the stock matrix with no profile read 1651 K to 1733 K. The shared test
folders hold no DNG at all, so there is no file whose Lightroom Temperature and Tint are known
beside its embedded profile, and the conversion cannot be compared with Lightroom's own figures
from them.

## Looked up

Everything below is also listed, with how each was read, in IR-SCIENCE.md section 3.

- **Rob Shea's pages**, each fetched whole by a script through the environment's proxy and read
  whole with the Read tool: White Balancing Color Infrared Photography; Do I need custom profiles
  for infrared photography; Which infrared profile should I use? (the address the first page's own
  Related list gives); and the Infrared Profile Pack page. They say what a profile is, which
  editors need one, that the profile shifts the temperature scale so the number is no longer a
  Kelvin value, why two are supplied, which to start with, and when to switch. Word for word, as
  product text: "Start with -100 for a more significant temperature shift."; "For images shot
  with a 550 or 590 nanometer filter, use Infrared Temp -100 as these filters need the most
  temperature shift. For images shot with a 720 nanometer filter, I use Infrared Temp -50. These
  images still require a temperature shift, but just not as much. If I use a 665 nanometer filter,
  which falls in the middle of the other filters, I can use either one."; "If the temperature
  value is too close to 2,000 or too close to 50,000, then you might not have a good white
  balance. Switch to the other profile and try again."; and, on the pack page, "If the color
  temperature is exactly 2,000 or 50,000, switch to the other profile and repeat these steps."
  and "Different combinations of cameras and infrared high-pass filters may react differently to
  temperature shifts. This is why two profiles are included." The pack is offered at
  robsheaphotography.com/infrared-profile-pack/, free, by a newsletter sign-up, for 496 camera
  models with the Nikon Z 50 among them. What the pages do not say: how close is "too close";
  anything about carrying a profile from one photograph to the next; anything about a NEF;
  any terms for the profiles.
- **The two Z 50 profile files**, provided in this session and read tag by tag with the app's own
  TIFF reader: calibration illuminants 17 and 21, identical forward matrices, different colour
  matrices, an embed policy of 0, and a copyright tag that is the author's name alone.
- **The DNG SDK 1.4**, a third party's copy on the raw GitHub host: `dng_color_spec.cpp`,
  `dng_camera_profile.cpp`, `dng_temperature.cpp`, `dng_xy_coord.cpp` and `.h`,
  `dng_tag_codes.h` and `dng_tag_values.h`, each downloaded whole and read whole. The weight
  between the two calibrations is the white's own temperature, linear in mired; a neutral becomes
  an xy by up to 30 passes from D50; an xy becomes a neutral through the blended matrix; a
  temperature and tint become an xy through the 31-row table as printed. A port of those
  functions, made to fail first, is the instrument for the figures.
- **Adobe's XMP Camera Raw namespace**, the documentation page's source file in Adobe's
  repository on the raw GitHub host, read whole: crs:Temperature "Range 2000 to 50000",
  crs:Tint "Range -150 to 150", integers, ranges only.
- **Adobe's Lightroom Classic help page** on image tone and color, read at its Temp and Tint
  entries: Temp is on the Kelvin scale for a raw file; Tint left adds green and right adds
  magenta.
- **Not read:** Adobe's own copy of the SDK files; the header `dng_camera_profile.h`; the printed
  Wyszecki and Stiles table; the pack's readme and any terms in it (behind a newsletter sign-up,
  not fetched); the author's page on installing profiles; how Lightroom's shipped code differs
  from the 2012 sample, if it does; what Lightroom displays for a Z 50 NEF under either profile.

## Built already

Do not write a second one of any of these.

- **The balance found from the data is `grayWorldWB` in `src/decode.ts`**, and the three gains
  are the one stored state: `EditParams.wb`, the three gain sliders on a 1300-step track, `snapGain`,
  the hold and the kept balances in `src/balancestore.ts`, the report's balance rows. This record
  adds no change to any of them.
- **The Temperature and Tint of 24 October** are `readBalance` and `moveBalance` in
  `src/balancestore.ts` and `updateBalanceUI` and `balanceInput` in `src/main.ts`; this record
  changes what the two numbers mean and not where they sit.
- **A DNG's embedded profile is read** by `dngCalibration` and `dngCameraToSrgb` in `src/color.ts`
  (one calibration set, ranked daylight first, rendered through its forward matrix when it has
  one) and reported by `readCameraMatrixTagged` in `src/decode.ts`. The profile's name, the
  as-shot neutral and white, the XMP block, the two sets blended by temperature, the hue and
  saturation tables, the look table and the tone curve are not read or not applied.
- **A profile file is readable as it stands** by `src/raw/tiff.ts` (it tests only the first header
  byte, so the profile magic text passes), and a zip of files is listable and readable without
  inflating what is refused by `src/zip.ts` through `src/lutpack.ts`, which is the shape a pack of
  profiles arrives in.
- **A profile is written** by `src/dcp.ts` (tag numbers for the matrices, the name, the tables).

## Weighed against

- **Record 101**, the control it changes. Its option 3 stands, the named balance that applies to
  a set; its option 2's pair is what is replaced. The hold, the kept list and Reset are untouched,
  and a held balance stores gains, so it renders exactly as before and reads out through whichever
  profile the reader has on.
- **Record 069, options 10 and 13.** Option 10 found that moving the white point at open under
  today's look breaks the look, so the opening balance is not moved here; it stays the one found
  from the data. Option 13's guard is the reader's own range and is not touched.
- **Records 085, 066 and 029**, whose colour readings are all taken at the balance the app opens
  with. Nothing here changes that balance.
- **Done before on this ground:** IR-SCIENCE.md section 3's 24 October block, which chose the
  channel-defined pair, and the 25 October build, which chose a Kelvin pair through the stock
  matrix; both are marked superseded there with their numbers kept. Record 101's Rejected keeps
  the opening at the data-found balance and rules out reading the camera's recorded one.

## Options

1. **Lightroom's Temperature and Tint, read through the camera's profile (Route 2 of
   IR-SCIENCE.md section 4). Chosen.** The scale is Lightroom's as its own schema gives it:
   Temperature 2000 to 50000, Tint minus 150 to 150, a positive Tint toward magenta and a higher
   Temperature warmer, the thumb resting at an end for a white outside it while the typed box
   reads the figure. The conversion is the SDK's: the gains' reciprocals are the camera neutral;
   the neutral becomes an xy through the colour matrix blended between the profile's two
   calibration temperatures; the xy becomes a temperature and tint through the SDK's table as
   printed; and back from a temperature and tint to gains. The profile is found in this order, for
   every camera and not only this one. First, the profile the file embeds, where it carries one.
   Second, a profile the reader has loaded for that camera, through a door of the colour-table
   import's shape that takes a profile file or a zip of them, reads the camera each names from its
   own tags and keeps it on the device under that camera's name; a profile whose camera is not the
   file's is not offered for it. Third, with none, the camera's own stock matrix, which is what
   Lightroom uses without a custom profile: the sliders work on the same scale, an infrared white
   may sit past the slider's end with the typed box reading its figure, and nothing breaks. A
   profile switch beside the sliders lists what is available for the file's camera; the choice is
   saved with the photograph's edit as a new field, excluded from a saved look like the balance
   itself and not in the tile stamp since it moves no pixel. Which profile a photograph opens
   under: the pages give a starting point (-100) and a switch (the other profile when the
   temperature sits too close to an end) but no rule the app can apply without knowing the
   filter, and nothing about carrying a choice from one photograph to the next, so a photograph
   opens under what the reader last used for that camera, as the held balance already carries
   from one photograph to the next, and a line under the sliders names the profile or matrix in
   use and says a profile for the camera can be loaded. The three gains stay beneath as the exact
   state; Temperature and Tint are a view of them through the profile, so the only new field is
   the profile choice. The picture is rendered exactly as before: the profile decides the two
   numbers, not the colour route, and its hue and saturation tables are not applied. Whether the
   app also carries the two Z 50 files inside itself is a question of terms the tag and the pages
   do not settle, and goes to the owner; the door needs no such permission.

## Rejected

- **Step 200's build of 25 October: the stock camera matrix with a locus computed below the SDK's
  table and a range read from the raws.** It reads figures Lightroom never shows. Lightroom puts
  an infrared white inside its own scale through the profile, where the stock matrix puts every
  raw from this camera at 1651 K to 1733 K, the cool edge of the SDK's table; its slider ends
  were taken from the raws rather than from Lightroom's scale, which is a range chosen by data
  where the scale is Lightroom's to give. Its readings are kept as readings.
- **The Planck correction of the SDK's table row.** The 325 mired row prints u as 0.24702 where
  Planck's law and the other 29 rows give 0.24792. Lightroom's figures are the convention and the
  table as Adobe printed it is the nearest reading of the arithmetic behind them; the correction
  would differ from it by 2.7 units of tint at one temperature, with no source read saying
  Lightroom corrects it. The same reason rejects the locus computed below the table: with the
  profile, no white among the 32 raws comes near 1667 K.
- **The channel-defined pair of 24 October.** It counts steps of a track a reader coming from
  Lightroom has never been told the meaning of, and its second reason, that infrared whites lie
  under the stock profiles' floor, is a fact about the stock profile that a shifted profile
  removes.
- **A Kelvin readout beside the unchanged pair.** Two scales for one control: the thumb would
  move in one and the words say another.
- **darktable's or RawTherapee's definition of the tint.** darktable's moves the white by dividing
  its luminance and not across the locus, by its own comments, and RawTherapee's multipliers are
  in sRGB primaries with the camera matrix applied elsewhere; neither is the tint Adobe's editors
  print.
- **Carrying the two Z 50 profiles inside the app as its default.** The copyright tag is a name
  and no licence, the embed policy of 0 allows copying only while a profile is used to process
  DNG files in the SDK's own words and this app would read NEFs through it, and the pages state no
  terms. The door takes the file the reader holds, which needs no permission the reader lacks.
- **Moving the opening balance, or reading the camera's recorded one.** Record 101's Rejected and
  record 069's option 10: the recorded balance is the preset's daylight default, and moving the
  white point at open under today's look broke the look.
- **A range, a sign or a default chosen by the app.** None of the three is chosen: the range and
  the sign are the schema's and Adobe's help's, and the default is the data-found balance the
  app already opens at.

## Rank

First, ahead of everything open. The queue's test is whether work ranked below would have to be
redone once this is settled, and nothing below reads the Temperature or the Tint: both are
readings of gains that every item below already takes from the gain sliders and the opening
balance, and neither is changed. It is first because it is the work in hand and because the control
it changes is the one record 101's hold keeps balances for. The rank is not about severity: no
reader sees a defect from the earlier pair, only a scale they did not expect.

## Measured

On 27 October 2026, by a port of the SDK's functions made to fail first, on the 32 Z 50 raws'
data-found gains that the 25 October plan printed (no photograph was rendered or opened for it).

- Under Infrared Temp -100: 7414 K to 13211 K, median 10056 K, 76 to 135 mired; tint 27.7 to
  35.3, median 30.3; the first matrix's weight is 0 for every one; 3 passes.
- Under Infrared Temp -50: 2948 K to 3526 K, median 3232 K, 284 to 339 mired; tint minus 57.0 to
  minus 35.3, median minus 50.0; the first matrix's weight is 0.66 to 0.94; 6 or 7 passes.
- Temperature and tint back to gains: within 0.000 percent under -100 and 0.008 percent under -50.
- The SDK's own standard whites read: Standard light A 2854.9 K, tint minus 0.06; D50 5000.7 K,
  9.56; D55 5502.3 K, 9.99; D65 6503.7 K, 9.77; D75 7506.4 K, 9.75.
- The SDK's method for a Z 50 NEF at As Shot (the camera's recorded daylight pair) reads
  100000 K and a tint of 227.1 under -100 and 10653 K and 133.7 under -50. That is arithmetic,
  and Lightroom's own reading of such a file is the one figure this research could not take.

## Looked at

Nothing was rendered for this record and no photograph was opened for it; every figure above is a
reading of numbers, and none is evidence about how a photograph looks.

## Depends

- needs 101 — the control it changes, and the hold and kept balances whose gains it reads through a profile.
- touches 069 — option 10's white point at open and option 13's guard read the same white; this changes how that white is named on the sliders and not what it is.
