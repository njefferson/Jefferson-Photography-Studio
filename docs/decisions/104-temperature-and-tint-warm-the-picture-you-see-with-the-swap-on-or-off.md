# 104 · Temperature and Tint warm the picture you see, with the swap on or off

## Context

Records 102 and 103 settled what the Temperature and Tint numbers read: the three gains read through a
camera profile or the stock matrix, with the locus extended below the SDK's table. Neither changes what
the red and blue swap does to the picture. The swap is on for every raw at open and in most saved edits,
and in the render it comes after the gains and the camera matrix (`src/gl.ts`, the matrix at line 1223
and `if (u_swap) c = c.bgr;` at line 1226; the order is written in the header of `src/pipeline.ts`: white
balance, channel swap, hue, saturation, contrast, gamma). So the sensor's red gain lands on the screen's
blue. A drag toward warmer raises the number and raises the red gain against the blue, and the picture
shown gets bluer. Step 239 measured it on the keep file's photograph; this record's Measured section
repeats it on five raws, and the same pictures with the swap off warm.

The behaviour to give is this. A Temperature move toward warmer warms the picture on screen, and toward
cooler cools it, with the swap on or off; the number and the picture move the same way; nothing moves
the balance the opposite way as seen. With the swap off every reading and every move stays as it is. The
balance a raw opens at, every look, and every stored edit render as before. Typed numbers land on the
number, down to the lowest white the camera's gains can express (record 103's reach), and a drag lands
where the finger is.

## Looked up

Each source was fetched whole by a script through the environment's proxy and read with the Read tool;
the lines cited are lines of the saved copies. IR-SCIENCE.md section 3 has the same list with the figures.

- **The author's page on Lightroom swap profiles** (robsheaphotography.com, the page on Lightroom
  infrared colour swap profiles). Lines 1069 to 1086: in Lightroom the swap profile is chosen first, and
  then the white balance picker is clicked on a neutral subject; if no balance inside 2000 to 50000
  can be set, the other temperature shift is chosen; once a balance is set the profile browser shows
  each swap with an accurate preview. Lines 1130 to 1141: with these profiles the colours are reversed
  in four tools, Tone Curve Channels, HSL, Calibration and the Temp slider of the graduated, radial and
  brush filters, and the Color Grading tools are unaffected. The page names no global Temperature slider
  in either list.
- **The author's page on setting a white balance manually and by the histogram.** Lines 384 to 408, with
  the swap off: dragging Temperature to the low end puts blue high and red low in the histogram, and to
  the right end the reds in the highlights and the blues in the shadows. Lines 426 to 462, after a swap
  profile is chosen: the same exercise on the swapped picture, and the low side puts the reds toward the
  highlights and the blues toward the shadows, the right side the opposite. So the one source read that
  shows Lightroom's global Temperature under a swap profile shows it reversed, as this app's is today.
  The author sets the balance by eye for a balance between sky and foliage, not by the slider's
  direction (lines 486 to 504).
- **The author's page on white balance with curves.** Lines 366 to 378: the curves layer goes under the
  channel mixer layer that swaps, so the balance is set before the swap while the swapped picture is
  watched. Lines 462 to 468: the Camera Raw filter is then opened on the finished layer for highlights
  and shadows, with the colour temperature left alone. The page does not say what Camera Raw's
  Temperature does to a swapped rendered file.
- **The author's page on accurate white balance** (lines 449 to 457): the profile first, then the picker
  on a neutral; the figures are no longer Kelvin.
- **Adobe's Camera Raw namespace document** (`adobe/xmp-docs`, `XMPNamespaces/crs.md`, 52 lines, read
  whole): Temperature, range 2000 to 50000; Tint, range minus 150 to 150 (lines 44 and 45). It has no
  entry for IncrementalTemperature or IncrementalTint, and says nothing about a rendered file. ExifTool's
  `XMP2.pl` was fetched for the two names and does not carry them either. Adobe's help pages, which
  state a rendered file's Temperature and Tint, were not asked: the reply guard holds that host
  declined.
- **darktable.** `src/common/iop_order.c`, the current order for raw files (lines 306 to 428) and for
  camera-rendered files (lines 556 to 680): white balance (temperature) at 3.0, demosaic at 8.0, the
  input profile at 28.0, colour calibration (`channelmixerrgb`, the chromatic adaptation and a channel
  mixer in one module) at 28.5, the RGB channel mixer at 39.0, colour balance RGB at 41.5, and a colour
  correction module at 55.0 (line 652) whose comment calls it a global adjustment of white balance for
  shadows and highlights. The module docs (`white-balance.md`, lines 26 to 34 and 102 to 106; `color-calibration.md`,
  lines 31 and 41 to 59, 111 and 112, 139 to 149 and 155 to 159): the white balance module scales the raw
  channels and its Temperature acts upstream of every channel mixer; colour calibration adapts first and
  mixes second, so a second instance placed later adapts the already-mixed picture and the docs warn of a
  double correction; its temperature slider moved right assumes a bluer illuminant, "which will make the
  white-balanced image appear warmer/more red". Colour calibration was read to line 190 and searched for
  the rest.
- **RawTherapee.** `rtengine/improccoordinator.cc` line 775 applies the white balance multipliers as the
  image is read in (`getImage(currWB, ...)`); line 1931 runs `rgbProc`, where `rtengine/improcfun.cc`
  lines 2152 to 2155 and 2301 to 2309 apply the channel mixer; line 2483 starts the colour appearance
  block, whose scene white (`tempsc`, `greensc`, the `free` model, `improcfun.cc` lines 555 to 557 and 966
  to 987) is a temperature that acts after the mixer. So both programs keep their raw white balance
  upstream of every channel mixer, and both offer a temperature-shaped adaptation that sits downstream of
  one.
- **Not read:** Adobe's help pages; what Camera Raw's Temperature does to a swapped TIFF; the rest of
  `improcfun.cc` and `colortemp.cc` beyond the lines named; any page of the author's that states
  what the global Temperature slider does to a swapped picture in words.

## Built already

Do not write a second one of these.

- `readBalance`, `moveBalance`, `exactBalance` and the two thumb constants in `src/balancestore.ts`;
  `gainsToWhite`, `whiteToGains` in `src/kelvin.ts`; the profile switch and the line under the sliders in
  `src/main.ts` and `ir.html`; the swap button (`src/main.ts`, the handler at its `swapBtn` click) and the
  `swapRB` field in all of `cloneParams`, `applySnapshot`, `syncFromUI`, `syncToUI` and the tile's own edit.
- The red and blue exchange of the camera matrix's output exists in three renderers that agree with each
  other: the shader, the CPU grade `compileEdit`, and the tile. A new stage after the swap is added to the
  first two and carried by the third.

## Weighed against

- **Record 102**, the control it changes: the number stays a view of gains through the profile in force,
  nothing is stored as a Temperature or a Tint, and a profile switch moves no pixel. The first option
  below keeps all three by storing three more gains.
- **Record 103**, whose locus and floor this reads through: with no profile loaded the opening white sits
  inside the scale, and record 103's build lands in the same plan. The candidates here were measured over
  its extended locus, with a floor of 500 K so a typed 600 K lands.
- **Record 101**: a held or kept balance stores gains only, so neither option changes what a balance
  renders.
- **Record 069**: the opening balance stays the one found from the data, so the new stage is neutral at
  open.
- **The looks.** A look writes the gains (`wbBias`), the swap, a channel mixer and a hue turn. The new
  stage is neutral at open and sits after the mixer and the hue turn (the placement is measured below), so
  no look renders differently.
- **Q-JPS-151**, the warm end of the SDK's table: not this record's. A white near the warm end still
  cannot move much warmer.

## Options

1. **Temperature and Tint act after the swap, on the picture as shown, through three screen-side gains;
   the camera-space balance stays before the swap. Chosen.** The three gains keep being the one stored
   camera-space white: found from the data, set by a tap, held or kept, exactly as record 102 has them.
   A new per-shot field of three numbers, the post-swap gains (red, green and blue of the screen, product
   one, default one, one, one), is applied after the swap, the channel mixer and the hue turn, and before
   saturation and the per-colour bands. With the swap off the controls act on the gains exactly as they
   do today and the field stays at its default. With the swap on the box reads the white of the gains
   multiplied by the post-swap gains (taken in screen order against the gains in camera order, normalised
   to the gains' level), through the profile in force; a drag asks `exactBalance` for the wanted white
   from that combined reading and stores the ratio of the answer to the gains as the post-swap gains, so a
   drag toward warmer applies to the screen's channels the same ratio the swap-off drag applies to the
   sensor's, and a typed number lands on the number with no gain-track grid between. At open the field is
   the default, so the box reads what record 103's reading gives and the picture is today's. A held or
   kept balance stores the gains only; the post-swap gains belong to the edit (undo, saved edits, keep
   files), are per-shot and corrective like the balance, are left out of a saved look and out of the
   tile stamp, and a stored edit with no such field reads as the default and renders as before. A profile
   switch re-reads the number from the same stored numbers and moves no pixel.
   Measured on five raws at their opening white: warmer raises the patch's red over blue and the number on
   5 of 5, cooler lowers it on 5 of 5, a typed 600 K lands on 5 of 5, the picture at open is today's
   byte for byte. What it costs: a move after the swap moves the picture a third to a half as far as the same
   move before it does (ten steps raise the patch by 1.2 to 1.3 percent, against 2.3 to 3.7 percent with
   the swap off), because the gains act ahead of the camera matrix and the new gains behind it; the
   number with the swap on is the white of a product of two things and is not what Lightroom shows for the
   same raw, which keeps its number and moves its gains; one field is added to `EditParams` in the five
   places, with one uniform and one line in the shader.
2. **A chromatic adaptation after the swap, the way darktable's colour calibration and RawTherapee's
   scene white do it. Kept.** The state is a named white, read as the box; the picture is the adaptation
   (a Bradford scaling in the screen's linear sRGB) from the white of the gains to the named white, put
   after the swap through the camera matrix's rows. Measured: warmer raises the patch on 5 of 5, cooler
   lowers it on 5 of 5, typed 600 K lands on 5 of 5 with no gain limit, and the response per ten steps
   (2.4 to 2.5 percent) sits inside the swap-off range of 2.3 to 3.7 percent; per hundred steps cooler it falls much harder than the
   first option (minus 27.7 percent against minus 10.3 on one frame). What it costs: the matrix depends
   on the white of the gains read through the profile in force, so either a profile switch moves the
   picture, which record 102 forbids, or the white the adaptation starts from is stored beside the one it
   goes to, which stores two Temperatures and Tints as such and gives up the one-state rule; and it adds a
   cone matrix and two colour-space matrices to the app.

## Rejected

- **Moving the balance the opposite way as seen**, first. Two forms were measured. Left as it is, the
  number rises and the picture gets bluer on 5 of 5 opening states (the patch's red over blue falls from
  1.00 to 0.91 to 0.92 in ten steps, and to 0.83 to 0.84 in a hundred). Reversing the thumb under the
  swap, so the number falls as the picture warms, makes the number and the picture disagree and was not
  built as a candidate. Both name a white that is not the one the picture shows.
- **Reading the white through the exchange of red and blue** (the gains with red and blue swapped, read
  through the same matrix), so the white the controls name is the white of the picture shown. Measured on
  the five opening whites: every one reads 100000 K, the table's warm clamp, with a tint of minus 126 to
  minus 147, the thumb is at its warm end, and a drag toward warmer moves nothing on 5 of 5; a drag toward
  cooler works. At the keep file's hand-set gains it reads 2076 K and behaves. Rejected for the opening
  state: every infrared raw would open at the warm clamp, past the one end this plan leaves alone
  (Q-JPS-151), and every number shown with the swap on, the opening ones too, would change meaning.
- **Releasing the swap while a Temperature or Tint control is held**, so the balance is set on the
  unswapped picture as the author's curves page does it. The picture a drag shows is then not the picture
  the reader gets on letting go.
- **Leaving the control as it is and relying on the tap and the gain sliders.** The author's own
  demonstration shows the same reversal for Lightroom's global Temperature under a swap profile, and the
  author sets the balance with the picker, which has no direction. This is the one finding that cuts
  against the behaviour to give: the source read does not show Lightroom or Camera Raw warming a swapped
  picture from the Temperature slider. The behaviour is the one stated for this app, not a claim about
  Lightroom's.
- **Putting the post-swap gains before the look's channel mixer.** Measured with a three-way rotation
  mixer (red from blue, green from red, blue from green) and the swap on, on two raws: a move of a
  hundred steps toward warmer before the mixer lowers the patch's red over blue (1.000 to 0.985 and
  1.000 to 0.984) and turns the picture mint green; after the mixer it raises it (1.000 to 1.142 on both)
  and warms it. The factor goes after the mixer and the hue turn.
- **Storing a Temperature and a Tint.** Record 102's rule: they are views of gains.

## Rank

Third, directly under record 103 and above 091. It needs 102, because it changes what the sliders in
102's control do, and it touches 103, because it reads through 103's locus and lands in the same files
and the same plan. The dependency test: work ranked below would have to be redone once this lands only if
it read the Temperature or the Tint or the stage after the swap. None does: the look records read the
gains and the opening balance, and the new stage is neutral at open and left out of a saved look. The
rank is the dependency's, not the defect's.

## Measured

On 29 October 2026, by scratch harnesses made to fail first, over the app's own decoder, conversion,
balance store and tile renderer bundled from the working copy; five raws (the keep file's photograph, frame
3837, and four raws of the shared folders, frames 3762, 3738, 3736 and 3735), each at its opening white and
at the keep file's hand-set gains, swap on and off. The patch is the 3 percent of the picture's pixels with
the least spread between channels, picked once from the opening picture (3017 to 3786 pixels). Every
figure is the patch's red over blue in display values from the app's own tile.

- Today, swap on, ten one-step moves toward warmer from the opening white: the patch falls on 5 of 5
  (from 1.00 to 0.91 to 0.92); a hundred steps, 0.83 to 0.84. With the swap off the same moves raise it
  on 5 of 5 (1.08 to 1.10 in ten steps through today's conversion, 1.02 to 1.04 through the extended
  locus, 1.19 to 1.21 in a hundred). With today's scale the first
  move jumps the number by 54 to 57 mired against ten wanted (the thumb waits at the cool end), and typing
  600 K shows 2000 K.
- First option, swap on, at the opening white: ten steps toward warmer raise the patch on 5 of 5 (to
  1.013 or 1.014), a hundred to 1.144 to 1.153 (swap off 1.186 to 1.212); ten steps cooler lower it on 5 of
  5 (to 0.987 to 0.990), a hundred to 0.890 to 0.899; the box rises with the move on 5 of 5; a typed 600 K,
  1500 K and 3000 K read back as typed within 0.1 K on 5 of 5.
- Second option, the same cases: ten steps to 1.025 or 1.026, a hundred to 1.245 to 1.261, ten cooler to
  0.974 to 0.978, a hundred to 0.710 to 0.731; typed numbers land on 5 of 5.
- Exchange read: every opening white reads 100000 K (tints minus 126.2, 129.7, 132.8, 139.4 and 146.8); a
  move toward warmer moves nothing on 5 of 5; ten steps cooler lower the patch to 0.77 to 0.85.
- Controls. The picture at open is byte for byte today's for every candidate on 5 of 5 raws, with the swap on
  and off. With the swap off each of the three candidates' own path equals the plain extended path, the ten-step
  gains and the ten-step and hundred-step pictures byte for byte, on 5 of 5 raws. Tint
  ten steps toward magenta lowers the picture's green over its red-blue mean under every candidate and
  swap state (0.988 to 0.947 on frame 3837, swap on and off alike), so the swap does not reverse Tint.
- At the keep file's hand-set gains (the white reads 45975 K, two mired from the warm end), swap on: today
  a move toward warmer moves nothing and a move toward cooler raises the patch (0.284 to 0.290 on frame
  3837); the first option reaches the end of the scale (50630 K) with the patch rising by 0.1 to 0.4
  percent, and cooler lowers it on 5 of 5. The end is the table's warm end, Q-JPS-151.
- Placement, frames 3837 and 3762, a hundred steps toward warmer, swap on: with no mixer the factor before
  and after the mixer agree (1.144 and 1.145); with the rotation mixer before 0.985 and 0.984, after 1.142
  on both, from 1.000.
- Instrument controls, all as known: a planted 4000 K white starts at 250 mired and ends at 240.9 and
  260.5 after ten steps each way; four planted pixels read red over blue 4.00; the post-swap construction
  reads red over blue 1.87 and the wrong order 0.53; the planted placement reads 1.00 before the mixer and
  1.87 after.

## Looked at

Every picture below is a render of the app's own tile at 480 pixels, no look, no denoise, no lens fix,
written under step243/renders in the session and opened with the Read tool before it was described.
The two photographs are the keep file's frame 3837 and the shared folder's frame 3762, both Nikon Z 50
raws.

- Frame 3837, swap on, the opening white: pale lavender-grey woodland, grey trunks, pale foliage in the
  foreground, a faint cool cast in the grass (f3837-on-start.png).
- Frame 3837, swap on, a hundred steps toward warmer, today (f3837-on-warm100-c0.png) and with the
  extended locus (f3837-on-warm100-c0x.png): the same violet-blue picture, grass violet, trunks blue-grey,
  bluer than the start. The picture goes cooler as the number rises.
- Frame 3837, swap on, a hundred steps toward warmer, the first option (f3837-on-warm100-cA.png): a rose
  and salmon wash over the foreground grass and a brown cast on the trunks, warmer than the start. The
  second option (f3837-on-warm100-cAcat.png): a stronger, more saturated pink over the whole picture. The
  exchange read (f3837-on-warm100-cB.png): identical to the start, the control being at its end.
- Frame 3837, swap on, ten steps toward warmer (f3837-on-warm10-c0.png, f3837-on-warm10-c0x.png,
  f3837-on-warm10-cA.png, f3837-on-warm10-cAcat.png, f3837-on-warm10-cB.png): all five within a few levels
  of the start to the eye; today's two a little more violet in the grass, the first option almost the
  start, the second a touch pinker, the exchange read the start.
- Frame 3837, swap off, the opening white and a hundred steps and ten steps toward warmer
  (f3837-off-start.png, f3837-off-warm100-c0x.png, f3837-off-warm10-c0x.png): a near-neutral white and grey
  picture that turns cream and peach at a hundred steps, ten steps indistinguishable by eye.
- Frame 3762, swap on, the opening white (f3762-on-start.png): a pale teal sky, pale pink-white conifers, a
  dark bird; a hundred steps toward warmer today (f3762-on-warm100-c0.png) and with the extended locus
  (f3762-on-warm100-c0x.png): a pale blue-lilac sky and lavender conifers, bluer; the first option
  (f3762-on-warm100-cA.png): a grey-pink sky and salmon conifers; the second option
  (f3762-on-warm100-cAcat.png): a dusty rose sky and salmon-pink conifers, heavier; the exchange read
  (f3762-on-warm100-cB.png): the start.
- Frame 3762, swap on, ten steps toward warmer (f3762-on-warm10-c0.png, f3762-on-warm10-c0x.png,
  f3762-on-warm10-cA.png, f3762-on-warm10-cAcat.png, f3762-on-warm10-cB.png): today's two a shade bluer in
  the sky, the first option a shade greyer and warmer, the second a shade pinker, the exchange read the
  start.
- Frame 3762, swap off, the opening white, a hundred steps and ten steps toward warmer
  (f3762-off-start.png, f3762-off-warm100-c0x.png, f3762-off-warm10-c0x.png): a khaki-cream sky with lilac
  conifers, a peach and salmon sky at a hundred steps, ten steps near the start.
- Frame 3837 under a three-way rotation mixer, a hundred steps toward warmer, the factor before the mixer
  and after it (f3837-mixer-start.png, f3837-mixer-factor-before.png, f3837-mixer-factor-after.png): a
  lavender-silver start; before the mixer the whole picture turns mint green, not warm; after it a warm
  rose and pink with brown trunks.
- Frame 3762 under the same mixer, three pictures (f3762-mixer-start.png, f3762-mixer-factor-before.png,
  f3762-mixer-factor-after.png): a lilac sky and mint-silver conifers at the start; before the mixer a grey
  sky and deeper mint conifers; after it a pink sky and cream conifers.

## Depends

- needs 102 — it changes what 102's Temperature and Tint do under the swap, and it reads through 102's
  conversion, balance store and profile switch.
- touches 103 — it reads through 103's extended locus and floor and lands in the same two controls, the
  same files and the same build.

## Files the chosen method changes

The first option changes `src/pipeline.ts` (the new field in `EditParams`, `cloneParams`, and `compileEdit`,
which applies it after the mixer and the hue turn), `src/gl.ts` (its uniform, its upload in the pipeline's
parameter binding, and one shader line after the hue turn), `src/main.ts` (the default edit, `applySnapshot`,
`syncFromUI`, `syncToUI`, `updateBalanceUI`, `balanceInput`, and the tile's own edit that `tileInputsFor`
hands over), `src/tile.ts` (the `TileOwn` type and the tile's edit in `renderTile`, so a tile of a photograph
with its own edit carries the new gains), `src/balancestore.ts` and `src/kelvin.ts` (record 103's reach and
the combined reading), `ir.html` and `src/style.css` (the line under the sliders). `src/gpuexport.ts` is read
and unchanged: it draws through the same pipeline with `r.render(params)` (line 324), so the uniform rides.
`src/exportparallel.ts` is read and unchanged: it posts the whole `params` to each worker (line 411), where
`compileEdit` reads the new field. A look does not write the field, so `stampOf` is not changed, and
`tools/stamp-check.mjs` has nothing to hold.
