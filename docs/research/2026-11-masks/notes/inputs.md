# The inputs every later step of this plan uses (written by step 423, 11 November 2026)

Every path below is under /tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole unless it starts with a slash. Every picture named here was opened by step 423 before this note was written.

## The frames, each rendered once
- Eight photographs the app's list holds, fetched through tools/owner-images.mjs and its resolve(), all 2,800 by 1,864 (the editor's working copy, the half-size demosaic):
  - NIR_3461, NIR_3466, NIR_1827 and NIR_1651, four of the six frames of IR-SCIENCE.md section 4b-x (NIR_1644 and NIR_0627 are not in the list);
  - NIR_3742, NIR_3705 and NIR_3710, the three photographs pressed on the test page on 10 and 11 November that the list holds;
  - NIR_1873, a forest with a river pool and no sky, the frame with no sky (the seven above all hold sky).
- frames/<stem>-open.png: the frame as the editor opens it with no look, through the app's own modules on the CPU route: importFile, decode with no lens plan (the test page's read), freshBaseline's gray-world gains, auto exposure, highlight recovery (0 on all eight) and channel swap (on), the gains and exposure put on the sliders' grids (snapGain, snapExposure), the measured denoise (measuredStrength, on the slider's 0.01 step) laid by makeRowDenoiser, every pixel developed by compileEdit, written as 8-bit display sRGB. No look, no lift, no lens curve. Bundle and harness: scratch/step423-entry.ts, scratch/step423-2-build.mjs, scratch/step423-render.mjs.
- frames/<stem>-open.json: the figures of that render (gains, exposure, recovery, denoise, rotate, times).
- frames/<stem>-natural.png and .json: the natural-hue re-mapping of IR-SCIENCE.md section 4b-x, made from the -open picture by scratch/step423-hue.mjs. Method: Rec. 709 brightness Y on the display values, Cb = B - Y, Cr = R - Y; the frame's one colour axis is the major eigenvector of the Cb, Cr second moments about neutral, signed toward pink (the foliage side in the swap render); the pink side is given the chroma direction of pure green and the teal side that of pure blue, the chroma's length kept (no gain), Y kept, the across-axis chroma dropped.
- NIR_1651 decodes with rotate 3: its working copy, and so its picture here, lies turned (the sky at the right). Every place on it is a place in the picture as stored.

What the frames cannot show: the device draws through its own graphics chip into a wide-gamut space and the test page's sample picture is drawn with no denoise; these frames are the CPU mirror of the same edit, in sRGB, with the editor's measured denoise. A pixel may differ from the device's; a place does not.

What the natural-hue input cannot show: the 25 September trial's own gain on the chroma is not on record, so this input may be paler than that one. Dark reddish built things (the cell towers' panels on NIR_3705 and NIR_3710, the patrol boat on NIR_3742) lie on the pink side of the one axis and go green with the foliage.

## The samples
- samples.json, figures only. "frames" holds each frame's sets, "planted" each planted picture's; each set has "from", "placedBy" and "samples", each sample { name, x, y, r }: x and y as fractions of the picture's width and height from its top left, r as a fraction of its shorter side (the app's PlaceSample).
- NIR_3742 (22 samples), NIR_3705 (12) and NIR_3710 (14 of 11 November, then 8 of 10 November) were placed by the person on the test page and read from the reports by scratch/step423-samples.mjs, which prints figures and writes nothing.
- The other five frames and the seven planted pictures carry samples placed by step 423, marked so.
- samples-check/<name>-samples.png draws every sample over its picture (S sky, F foliage, B built things, W water, then the set's number).
- Samples are prompts and never a truth.

## The planted pictures and their truths
- planted/<name>-truth.png: grey, one byte a pixel, each pixel its region's number; planted/<name>-truth.json: the number to name, the window that filled each region, each region's share. All seven truths were written at 10:53 on 11 November, before any picture and before any method; no step changes them.
- planted/<name>-open.png and planted/<name>-natural.png: each region filled by mirror tiling from one window of one frame (-open from the frames as they open, -natural from their natural-hue pictures; same windows, same boundary), 2,800 by 1,864.
- The seven: plant-straight (Sky over Foliage, slanted straight), plant-stepped (Sky over Built things, stepped), plant-curved (Sky over Foliage, curved), plant-three (Sky, Built things stepped, Water below a straight line), plant-shore (Foliage over Water, curved), plant-built-foliage (Built things beside Foliage, slanted straight), plant-island (Sky, Foliage, Water: straight, then curved).
- What they cannot show: mirror tiling repeats texture as no photograph does, and a drawn boundary has no halo, no mixed pixels and nothing thin crossing it; they score regions and bands, not wires, lattices or soft edges.

## The mask file every later step writes
- One value from 0 to 1 for each pixel of the picture the mask was made on, as an 8-bit grey PNG at that picture's own size (2,800 by 1,864), the byte being round(255 times the value). writePNG(path, width, height, 1, bytes) in png.mjs writes it; readGrey reads it.
- A step names its mask files with the method, the input (open or natural), the picture and the subject, under its own folder.

## The two commands
- `node score.mjs <mask.png> <truth.png> <subject>` scores a mask of a planted picture: subject taken (mean weight over the subject), else taken (mean weight over everything else), overlap over union with the mask cut at a half (and its soft form), and the widest band of wrong pixels touching the truth's boundary, in pixels, with the counts of wrong pixels at the boundary and apart from it. The subject is a region's name from the truth's .json. It needs a truth, so it scores planted pictures only.
- `node sheet.mjs <frame.png> <mask.png> <out> <method> <input> <frame name> <subject>` writes <out>.png, the whole frame at its own size under a title band, the mask as a magenta tint by weight and its outline at a half in yellow, and <out>-crops.png, up to six 400 by 400 crops at full size where the outline is densest, each labelled with its place. It prints the share of the frame at a half and the crops' places. A sheet is to be opened; its figures are not a measure of a mask.
- Both carry their own MADE TO FAIL block and plant, and both were tried by scratch/step423-trial.mjs on a hand-built mask wrong by known amounts on plant-three, Water: band known 12, read 12; overlap over union known 0.9316, read 0.9316; subject taken 0.9913 and 0.9913; else taken 0.0181 and 0.0181; share of the frame at a half 23.2 and 23.2. The trial's mask, sheet and crops are under trial/.
- The harness guard takes a node run on a file under the scratchpad for a scratch harness, so a later step runs these two as children of its own runner.
- Helpers beside them, imported and never run alone: png.mjs (readPNG, readRGB, readGrey, writePNG), draw.mjs (letters, circles, rectangles), edt.mjs (the exact distance transform).

## Hosts
- No host refused in either send of step 423. The first send fetched seven photographs through tools/owner-images.mjs; NIR_1873 was already in that tool's cache, /root/.cache/jps-owner-images, when the second send asked for it, so no host was asked in the second send.
