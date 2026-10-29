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
from them. That held until 28 October. Five Lightroom exports of one Z 50 photograph, the 3467
image, were then provided in the session, each a DNG that carries Lightroom's own Temperature and
Tint beside its embedded profile, and the conversion was compared with them. It reads each pair
back within 0.05 K and 0 of tint; it reads the camera's recorded neutral under Adobe Standard at
5101 K and a tint of 18 where the export's pair is 5100 and 18; and the exports carry the same
pair under three profiles, so Lightroom keeps the two numbers and moves the gains when the profile
changes, where this app keeps the gains and re-reads the two numbers. The same comparison found
the Temperature and Tint boxes landing up to 34 K from a typed number, because a typed number was
put on the gain sliders' grid; that is put right, and Measured below has the figures.

Record 103 (29 October 2026) answers what the two numbers should read when no profile is loaded and an infrared white sits past the cool end of this scale; read it before changing the stock reading.

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
- **Five Lightroom exports of the 3467 image, read on 28 October**, each a DNG with its JPEG,
  provided in the session: three edited at 5100 K and a tint of +18 under Adobe Standard (with
  Lightroom's Adobe Color look), Infrared Temp -50 and Infrared Temp -100, and two at 8600 K and
  +27 under -100, the second with Saturation +100. Each DNG was read tag by tag with the app's own
  tag reader and each JPEG's develop fields by a walk of its metadata segments; the JPEGs' pictures
  were set beside the app's renders of the DNGs (Looked at). No raw was opened and no network call
  was made for it. IR-SCIENCE.md section 3 has every figure and how each was read.
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
  where the scale is Lightroom's to give. Its readings are kept as readings. **Closed on 29 October
  2026 by record 103, with the reason:** record 103 measured the scale below the table (Planck's
  law over the app's own rows, a floor of 1500 K taken from a source) on 37 data-found whites, and
  with no profile loaded it gives a reading inside the scale, a drag each way and typed numbers
  that land on all 37, so the locus below the table no longer stands as a bar; it is that record's
  first option. The range read off the raws stays rejected.
- **The Planck correction of the SDK's table row.** The 325 mired row prints u as 0.24702 where
  Planck's law and the other 29 rows give 0.24792. Lightroom's figures are the convention and the
  table as Adobe printed it is the nearest reading of the arithmetic behind them; the correction
  would differ from it by 2.7 units of tint at one temperature, with no source read saying
  Lightroom corrects it. The same reason rejects the locus computed below the table: with the
  profile, no white among the 32 raws comes near 1667 K. **That second sentence is closed on 29
  October 2026 by record 103:** with no profile loaded all 37 whites measured read at or below
  1734 K and five are below 1667 K, and the locus computed below the table is what record 103
  chooses first. The Planck correction of the 325 row stays rejected.
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
  **Closed on 29 October 2026 by record 103, with the reason:** the question is answered without
  the files. The daylight matrix of each is the camera's stock matrix with its X and Z columns
  scaled by two constants, which the app can compute for itself from its own matrix and the data,
  and the first option of record 103 needs no shift at all; nothing of either file is carried.
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
  and on 27 October Lightroom's own reading of such a file was the one figure this research could
  not take. The 28 October block below compares the conversion with five exports; a Lightroom
  reading of a Z 50 raw at As Shot is still not taken, because every export reads Custom.

On 28 October 2026, on the five Lightroom exports of the 3467 image, by the app's own tag reader
and its conversion (`gainsToWhite` and `whiteToGains` in `src/kelvin.ts`), the instruments made to
fail first; figures from the two reports of the plans that read and rendered them.

- Every export keeps the mosaic (the raw image's photometric value is the colour-filter-array one,
  not linear raw), embeds its profile and the profile's hue and saturation tables, carries the
  camera's recorded pair as its As Shot neutral (gains 1.8574, 1.0000, 1.4668, the 5200 K default
  the camera writes for a preset slot holding no measured value) and reads WhiteBalance Custom.
  None reads As Shot. The matrices embedded under -50 and -100 are the two profile files'.
- Round trips, the export's pair through `whiteToGains` and back through `gainsToWhite`: 5100.0 K
  and 18.0 back for the three edits at 5100 and +18 (misses 0.0088 to 0.0089 K and 0.0000 of
  tint) and 8600.0 K and 27.0 for the two at 8600 and +27 (0.0430 K and 0.0000): within 0.05 K
  and 0.0000 of tint.
- The app's As Shot reading of the recorded pair under each export's profile: 5101.0 K and tint
  18.0 under Adobe Standard (the first matrix's weight 0.214, 5 passes), 10652.7 K and 133.7 under
  -50, 100000.0 K and 227.1 under -100 (the SDK's table limit). The exports carry 5100 and +18
  under all three. So Lightroom keeps the two numbers and moves the gains when the profile
  changes, and this app keeps the gains and re-reads the two numbers: the opposite choice. The
  normalised gains the export's pair means (smallest 1, from `whiteToGains`): 1.8571, 1.0000,
  1.4670 under Adobe Standard; 1.0000, 1.1727, 2.0132 under -50; 1.0000, 2.2751, 5.5377 under
  -100 at 5100 and +18; and 1.0000, 1.9424, 3.4239 under -100 at 8600 and +27.
- The data-found balance the page opens at reads 1666.7 K and tint -70.2 under Adobe Standard,
  3068.6 K and -46.7 under -50, and 8800.1 K and 27.7 under -100; the page's boxes read 1667 and
  -70, 3061 and -47, 8799 and 27. The chosen pair, 8600 and +27 under -100, differs from the
  data-found gains (1.0000, 1.9311, 3.3710) by 0.6 percent in green and 1.6 percent in blue.
- The grid, before this fix: a typed pair put on the gain track's 1300 steps read back 8, 15, 26,
  34 and 34 K from the number typed and 1, 1, 0, 1, 1 of tint (5100 typed read 5092, 5115 and
  5074; 8600 typed read 8634 twice), and a later press of any other slider kept the miss. After:
  0 K and 0 of tint on all five, the same after a press of the Exposure slider, the three gain
  sliders resting within 0.89 of a step of the exact gains, the opening balance unchanged. The five
  renders after the change, opened beside the five before it, read the same to the eye; the
  region means (open sky, lit foliage, a shadow) differ by at most one level in a channel, and the
  whole-picture mean difference is 0.13 to 0.27 levels.
- The app's renders against Lightroom's JPEGs at the same Temperature, Tint and profile: the same
  hue family in four of the five (the fifth carries Saturation +100); the app darker in the sky by
  3 to 75 levels in a channel and in the shadow by 10 to 80, and higher in contrast; the grass
  band a flat pink under Adobe Standard where Lightroom's keeps its blades. The balance does not
  explain the difference. Not separated: the profile's hue and saturation tables, its tone curve,
  its baseline exposure, Lightroom's default rendering and the app's automatic exposure. The Adobe
  Color look, a table the export carries in a structure of its own, is read by nothing in the app,
  and no code reads a DNG's own As Shot neutral.

## Looked at

The research of 27 October rendered nothing and opened no photograph; every figure under that date
in Measured is a reading of numbers, and none is evidence about how a photograph looks. On 28
October five sheets were opened, one per export, each Lightroom's JPEG export on the left beside
the app's render of its DNG export on the right, drawn before the typed-number fix, so the app's
side sits at the numbers the grid gave, with the swap off and no look.

- The 3467 image, edited at 5100 K and tint +18 under Adobe Standard with Lightroom's Adobe Color
  look; the app's side at 5092 K and 17. Both halves are red-pink all over. Lightroom's sky is a
  bright coral to orange-red with pale streaks and the app's a darker crimson-rose, near maroon in
  the top corners; the building is salmon-pink in both, a little pinker and flatter in the app; the
  grass band reads cream-pink with its blades in Lightroom's and as one flat saturated pink with
  almost no texture in the app's, the fence posts and wires the only detail left.
- The 3467 image, edited at 5100 K and tint +18 under Infrared Temp -50; the app's side at 5115 K
  and 17. The closest pair: a dusty rose to mauve in both, the same pale-pink building and the
  same pale-pink grass with its blades. Lightroom's sky is a lighter pink-mauve and the app's the
  same hue, darker and browner toward the top corners; the app's shadows are browner and darker.
- The 3467 image, edited at 5100 K and tint +18 under Infrared Temp -100; the app's side at 5074 K
  and 18. Blue-lavender in both. Lightroom's sky is a pale airy grey-blue and the app's a deep
  slate to navy at the top; the grass is near-white lavender with texture in both; the shaded wall
  is a mid lavender-blue in Lightroom's and a deeper blue-grey in the app's, with stronger contrast
  between the building's panels.
- The 3467 image, edited at 8600 K and tint +27 under Infrared Temp -100; the app's side at 8634 K
  and 26. Near neutral in both. Lightroom's sky is a light warm grey with a faint khaki tint and
  the app's a neutral grey, charcoal toward the top corners; the grass is white to very pale grey
  with texture in both, the app's greyer; the app's shadows and doorway are darker.
- The 3467 image, edited as the fourth with Saturation +100; the app's side at 8634 K and 26. In
  Lightroom's half the sky is a warm tan to gold, strongest at the left, with a cooler bluish-white
  building face and bluish-grey shadows; the app's half is the same near-neutral grey picture as
  the fourth sheet's, because the app sets no saturation.

## Depends

- needs 101 — the control it changes, and the hold and kept balances whose gains it reads through a profile.
- touches 069 — option 10's white point at open and option 13's guard read the same white; this changes how that white is named on the sliders and not what it is.
