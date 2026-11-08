# The app's colour levers, read from the code

Read by step 326 on the app at 2.73 on staging. Every statement names the file and line it was read at. Nothing here is a choice or a recommendation. Where a range or a place was not read in this step the line says so.

## The order the per-pixel colour math runs in

Read in `compileEdit` (src/pipeline.ts, starts at line 2807; its contract is the comment block above it at lines 2795 to 2806). Its closure takes a linear source pixel and writes the display sRGB pixel into a Float32Array of three.

- The balance gains and the exposure are folded together (pipeline.ts 2850 to 2851: `wr = p.wb[0] * ex`, and the same for green and blue).
- Highlight recovery runs after the balance and before the camera matrix (the `recover` comment, pipeline.ts 57 to 75).
- The lens and hot-spot gains run next (pipeline.ts 3097 to 3123 is the hot-spot colour and the measured lens curve, both before the matrix).
- The camera matrix `cam`, row by row, camera-native to linear sRGB (pipeline.ts 3124 to 3132).
- The red and blue swap (pipeline.ts 3133 to 3137).
- The 3 by 3 mixer `mix3` (pipeline.ts 3138 to 3145).
- The hue turn about the Rec.709 luminance axis (pipeline.ts 3146 to 3150, `hueRotate` at 2299).
- The screen-side gains `wbScreen`, product one, read only while the swap is on (pipeline.ts 3151 to 3153; `screenGainsOf` at 482).
- Saturation about Rec.709 luma, with a boost above one faded out in deep shadow by a smoothstep over luma 0.02 to 0.20 (pipeline.ts 3154 to 3164).
- The Sky and Foliage hue bands (pipeline.ts 3165 to 3196): the weight is `bandWeight(h, skyBandCentre(swap, p.mix3), 55, 105)`, the foliage weight is one minus it, hue is shifted, saturation scaled through `bandGain` (2230), value scaled.
- The tone tint, then halation glow, then the masks (pipeline.ts 3197 to 3259).
- Contrast and the shoulder, then the gamma (`toGamma`) (pipeline.ts 3260 to 3264).
- The master tone curve through `rgbTone`, then the red, green and blue curves (pipeline.ts 3269 to 3274).
- An HSV block at pipeline.ts 3302 and a black and white block at 3337 to 3340, then the shadow colour block (3365 to 3369), the colour grade (3383 to 3405), the sky blocks (3427 to 3472), the overall luminance multiply (3478) and the imported 3D table (3509 to 3513). The exact line of the eight-band mixer was not separated from the 3302 block in this step: the field's own comment says it runs in display space after the per-channel curves and before the global luminance (pipeline.ts 184 to 191).

The shader's order is stated at src/gl.ts line 4 as "white balance -> channel swap -> hue/sat -> tone"; pipeline.ts line 16 to 17 of gl.ts's header says the per-pixel math is one source of truth in pipeline.ts. The shader file was read for its header only, not stage by stage.

## Each lever: field, range, default, whether the test page drives it today

The test page's Separation check builds its edit with `pictureParams` (src/debug.ts 2572 to 2583), which sets every field below to its neutral, and `sepEdit` (3229) sets `wb`, `exposure` and `swapRB: true` over it. The sweep (`sweepEdit`, 3623) also sets `wbScreen` and `mix3`.

- `wb`, three gains. Range 0.02 (`WB_GAIN_LO`) to about 118.9 (`WB_GAIN_HI` = 0.02 times 800 to the power 1.3), src/decode.ts 104 to 106. Sliders `wbR`, `wbG`, `wbB`, 0 to 1300 steps, default 585 (ir.html 805 to 807). Default at open: `grayWorldWB` through `freshBaseline` (src/tile.ts 214 to 235), raw only; a camera-rendered file opens at one, one, one. Driven by the page: yes.
- `exposure`. Range 0.05 to 64 (`EXPOSURE_LO`, `EXPOSURE_HI`, src/tile.ts 76 to 77). Slider `expo`, 0 to 1000, default 419 (ir.html 748). Default at open: `autoExposure` (tile.ts 223). Driven: yes.
- `swapRB`, boolean. Default at open: true for a raw, false otherwise (tile.ts 233). Driven: yes, both ways in the sweep.
- `wbScreen`, three gains, product one, read only while `swapRB` is on (pipeline.ts 16 to 25, 466 to 489). Default one, one, one. Not a slider range: any finite positive triple of product one (balancestore.ts 145 to 146). Driven: yes, in the sweep's screen-side route.
- `hue`, degrees, -180 to 180, default 0 (ir.html 1163; field comment pipeline.ts 26 to 28). Driven: no.
- `sat`, 0 to 3, default 1 (ir.html 1164). Driven: no.
- `contrast`, 0.5 to 2, default 1 (ir.html 1165; slider id `con`). Driven: no.
- `tint`, three multipliers, default one, one, one (pipeline.ts 77 to 79). No slider was found in ir.html by the search made in this step. Driven: no.
- `sky` and `foliage`, each hue, saturation and luminance. Hue -60 to 60, saturation 0 to 2, luminance 0.5 to 1.5, default 0, 1, 1 (ir.html 1174 to 1176 and 1181 to 1183). Which pixels each takes is `bandWeight` and `skyBandCentre` (pipeline.ts 2251 to 2256). Driven: no.
- `hsl`, the eight-band mixer: twenty-four numbers, hue shift, saturation scale, luminance scale for each band at `HSL_CENTERS` = 0, 30, 60, 120, 180, 240, 280, 320 degrees (pipeline.ts 1943). Neutral is `hslDefault()` (1945). The slider range per band was not read in this step; `HSL_MIN` and `HSL_MAX` at pipeline.ts 1356 to 1357 are -60, 0, 0.3 and 60, 2, 1.7, and their place in the file is next to the masks' group offsets (`groupHslOffset`, 1377). Driven: no.
- `tone`, `toneR`, `toneG`, `toneB`: five control points each at inputs 0, 0.25, 0.5, 0.75, 1 (`TONE_X`, pipeline.ts 1773). Identity is `TONE_DEFAULT`. The master sliders `tone0` to `tone4` run -25 to 25 in steps of 0.5 (ir.html 1233 to 1245). Driven: no.
- `lum`, overall luminance. `LUM_MIN` 0.5 and `LUM_MAX` 2 at pipeline.ts 1386 to 1387; slider `lum` 0 to 1000, default 500 (ir.html 1219). Neutral one (pipeline.ts 109 to 114). Driven: no.
- `mix3`, nine numbers row by row, red output, green output, blue output. Sliders -2 to 2 (the record 084 text, "nine sliders from -2 to 2"). Identity `MIX3_DEFAULT` (pipeline.ts 457). Driven: yes, through the five presets in the sweep.
- `grade`, seven numbers: hue and amount for shadows, midtones and highlights, then balance -1 to 1 (pipeline.ts 214 to 222; slider `gradeBal` ir.html 957). Neutral all amounts 0 (`GRADE_DEFAULT`, pipeline.ts 454). The hue and amount slider ranges were not read in this step. Driven: no.
- `shadowSat`, 0 to 1 (ir.html 953, slider default 1; field comment pipeline.ts 224 to 249 calls neutral 0, which the record of the two does not reconcile in what was read; it is stated here as read and not settled). Driven: no.
- `skySat` 0 to 2 as a selection, slider `skySatSel` (ir.html 859, default 0); `skyDepth` 0 to 1 (ir.html 857); `skySmooth` 0 to 1 (pipeline.ts 250 to 260). All three act through the sky selection (pipeline.ts 261 to 277). Driven: no.
- `bwOn`, `bwMix` three weights 0 to 2 (pipeline.ts 193 to 202). Driven: no.
- `recover`, 0 to 1 (pipeline.ts 57 to 76); set at open to 0.7 or the calibrated value by `autoRecover` when the frame clips (tile.ts 224). Driven: the page's `pictureParams` sets 0.
- Lens and hot-spot levers `hotspot`, `hotspotSize`, `hotspotColor`, `vignette`, `lensFix`, and `lensBypass` move brightness and a colour cast of the lens (pipeline.ts 121 to 145). Not driven by the page, which draws with no lens curve (debug.ts 2740).
- Not colour levers, left out on purpose: `denoise`, `chroma`, `despeckle`, `sharpen`, `texture`, `clarity`, `dehaze`, `glow`, grain, creative vignette, crop, straighten, spots, stickers, warp and masks. The fields `chroma`, `denoise` and the others in this paragraph run on linear data before `compileEdit` or are spatial (pipeline.ts 31 to 56, 280 to 320).

## The balance scale and its reach

- Temperature and Tint are read and made through a `ColourSpec` (src/kelvin.ts 319 to 329 builds it; `gainsToWhite` at 389 reads gains as a white; `whiteToGains` at 404 makes gains from a white).
- The scale runs `KELVIN_MIN` 537 K to `KELVIN_MAX` 50000 K, and tint `TINT_MIN` -150 to `TINT_MAX` 150 (kelvin.ts 12 to 17). In mired the page's grid ends are `TEMPERATURE_MIRED_FAR` = round(1e6 / 537) = 1862 and `TEMPERATURE_MIRED_NEAR` = round(1e6 / 50000) = 20 (balancestore.ts 35 to 36).
- `exactBalance(want, from, spec)` (balancestore.ts 106) returns the camera-side gains for a wanted white at the overall level of `from`, or null when a channel gets no light or a gain falls outside 0.02 to about 118.9. `screenForWhite(want, gains, spec)` (balancestore.ts 147) returns the screen-side gains instead, null only when no white can be made. `readBalance` (54) and `readShown` (137) read a Kelvin and a tint back.
- The spec the page uses is `profileRule(choicesFor(photoCamera(isRaw, bytes), loadedFor(keys)), ...)` (debug.ts 3430 to 3431); `photoCamera` is camprofile.ts 289, `choicesFor` 340, `profileRule` 365; a NEF names no embedded profile, so its spec is the stock matrix of its model (`stockFor`, camprofile.ts 275 to 282, `nikonColorMatrix`).

## The five mixer presets (src/main.ts 6846 to 6877, private to that module; copied in debug.ts 3591 to 3597)

Nine numbers each, row by row, red output first.

- Identity: 1, 0, 0, 0, 1, 0, 0, 0, 1.
- R and B swap: 0, 0, 1, 0, 1, 0, 1, 0, 0.
- Channel cycle: 0, 1, 0, 0, 0, 1, 1, 0, 0.
- Copper: 1.1, 0.3, 0, 0.2, 0.7, 0.1, 0, 0.2, 0.8.
- Film rotation: 0, 0, 1, 1, 0, 0, 0, 1, 0.

## The computed path's entry, and what a node bundle needs

- Entry: `compileEdit(p, cam, aspect, local, lens, skyMap, skyFine, srcFlat)` (pipeline.ts 2807 to 2837), called with only `p`, `cam` and `aspect` it skips the spatial stages; it returns `(r, g, b, out, glow?, u?, v?, mu?, mv?) => void` writing display sRGB in 0..1 into `out`.
- The drawn path applies the same math in the shader and then converts the 8-bit sRGB read-back to display P3 pixel by pixel with `srgbDisplayToP3Display` (src/icc.ts 193; applied at src/gpuexport.ts 348 to 353).
- Modules the bundle imports: src/pipeline.ts, src/decode.ts (decode of a NEF is `decodeNef`, no canvas; a JPEG or PNG needs `createImageBitmap`, which node does not have), src/tile.ts (`freshBaseline`), src/camprofile.ts and src/kelvin.ts and src/balancestore.ts (balance), src/skyfine.ts (sky selection), src/icc.ts. `loadedFor` in camprofile.ts reads `localStorage` (lines 148, 221), so the harness calls `choicesFor` with an empty loaded list and does not call `loadedFor`.
- The editor opens through `decodeOffThread`, which also applies the lens flat; this headless route calls `decode` directly and does not, so the harness's frame is the decode without the lens flat. That difference is stated in the summary.

## The sky selection's headless entry

- `prepareSkySource(img, turn = img.rotate ?? 0)` (src/skyfine.ts 311): a box-mean copy at `SKY_FINE_EDGE` = 1024 on the long edge (skyfine.ts 36, 313), carrying the raw's clipped flags.
- `buildSkySelectionFrom(src, refine = true)` (skyfine.ts 721): returns `{ mask, fine, turn }`, `mask` the coarse 384-edge bitmap (`BRUSH_MAX_EDGE`, pipeline.ts 641), `fine` the 1024-edge refinement, null when no clear sky is found. Both are `BrushMask` of `w`, `h` and a Uint8Array `data` (pipeline.ts 643 to 647). It builds at gray-world balance (skyfine.ts 714 to 718).

## The working size, and why

- `demosaicBinned` (src/raw/demosaic.ts 87) makes each 2 by 2 Bayer quad one linear RGB pixel, so the working copy is floor(width/2) by floor(height/2) (demosaic.ts 95 to 96); the quads are the editing proxy (demosaic.ts line 1 and 67). The practice measurement names the NEF as 2800 by 1864 in this plan's Design.

## The owner-images tool's commands (tools/owner-images.mjs)

- `node tools/owner-images.mjs --list [text]` lists name, size and folder from the index.
- `node tools/owner-images.mjs --fetch NAME...` downloads each name the index holds into the cache folder `JPS_OWNER_CACHE` or `~/.cache/jps-owner-images`, checks the size, prints the path, and prints a refusal for a name the index does not hold; it exits 1 if any failed.
- `node tools/owner-images.mjs --summary` prints the one-paragraph description.
- `resolve(name)` is the gate: it refuses a practice DNG and any name the index lacks (owner-images.mjs 88 to 101).
