# How to run the fine read again (12 November 2026, late evening)

S is the session's scratch folder, the one the two scripts name at their head. Each script carries the scratch path of the session that wrote it, as the kept scripts of earlier steps carry theirs; point it at the new scratch folder before running it. Every script prints a MADE TO FAIL block and plant lines first, and a run whose plant lines differ from the block is not trusted. The scripts still carry their working names at their head (step4-fine, step4-index); the kept names are fine-read-pictures.mjs and fine-read-index.mjs.

## What must stand first
- Everything that notes/cue-edge-how-to-run.md leaves standing: the dependencies of the app (`npm ci`), the eight photographs fetched through `node tools/owner-images.mjs --fetch` and through nothing else, each frame rendered once as the editor opens it in S/research/whole/frames as `<frame>-open.png`, the recipe's 22 masks from the decode in S/research/decode/masks, the 22 masks of MobileSAM on the colour picture in S/masks2, the 44 masks of the cue stage in S/masks3, the helpers `png.mjs`, `draw.mjs` and `edt.mjs` in S/research/whole, and the runner S/scratch/step452-runner.mjs with its job file.
- The evening's pictures and index: the 44 pictures in S/pictures3 and S/pictures3/index.json with its index-<frame>.json parts, which hold the centre of each mask's three places A, B and C. The fine read moves no place; it reads them from that index.
- No mask is made, no model is run and nothing is decoded again.

## The instrument, as the plan fixed it before any picture was made
- The places are the evening's, three for each mask, centred on the edge pixel the evening's index gives.
- Each place is a row of three crops of 240 by 240: the evening's crop at the frame's own size with the magnified area outlined; the middle 80 by 80 frame pixels magnified three times, bare; the same magnified crop with the mask's line at a half drawn thin and solid in yellow, and the band's two borders four frame pixels either side of the line drawn dashed in blue. The band is the set of pixels whose distance to the line is four or less, by the exact distance transform in S/research/whole/edt.mjs. The four-pixel mark is drawn at the magnified scale, 12 display pixels.
- The four masks of one frame-subject are on one picture, no larger than 1,600 pixels on its longer side. The Read tool shrinks a picture over 2,000 pixels, which would undo the magnification. Two columns hold two masks each, the recipe and MobileSAM as it is on the left, way one and way two on the right, three place rows down each.
- The edge clause is read as: the thing's own edge lies inside the band wherever the line runs in the magnified crop; where it leaves the band the judge says where and how far outside; Uncertain is kept for a place where what the thing is cannot be told.

## The order
1. `fine-read-pictures.mjs <frame>`, for each of the eight frames, as children of the runner, at most three side by side. It reads the frame's part of the evening's index and writes one picture for each frame-subject to S/pictures4 as `fine-<frame>-<subject slug>.png`, and S/pictures4/index-<frame>.json. Plant lines, printed by every run before any picture:
   - `plant 1: planted 200 by 150 mask, edge column 100, ... the borders lie 12 and 12 display pixels from the line (known figures 12 and 12)`
   - `plant 2: planted place centre 100,75, window top left 60,35; known value 100,75,139; read in the bare crop at display 121,121: 100,75,139; at 120,120 and 122,122 of the magnified window: 100,75,139 and 100,75,139`
   - `plant 3 (layout before any picture): single picture 1484 by 1599, longer side 1599 (limit 1600)`
   - and, for each picture written, a line `plant 3: <file> is 1484 by 1599, longer side 1599 <= 1600: true`.

   A plant that reads wrong stops the run with a line beginning STOPPED, and no picture is made. 22 pictures result, each 1484 by 1599, none split in two.
2. `fine-read-index.mjs`, with no argument. It joins the per-frame parts into S/pictures4/index.txt, giving for each frame-subject the evening's whole picture, the new magnified picture, and each mask's three places with their centres. Plant line: `plant: built-in entry gives 7 lines and 12 places`. Real line: `real: 22 frame-subjects, 88 mask lines, 264 places, 0 files missing`.

Open at least three of the pictures to see every crop drawn, titled and marked, one of them a line of trees.

## Notes on the run
- The first run stopped in each frame after the plants read right, because the head text needed 7 lines (66 pixels) and the head had been set to 58. The head height was raised to 66, which leaves the picture one pixel under the limit; only that height changed.
- The dashed band borders are drawn as a stroke 3 display pixels wide centred on the 12-pixel position, and the line is 1 display pixel. The border's centre, not its edge, lies 12 display pixels from the line.
- The runner masks any run of 7 or more hex characters in its saved logs, so the saved logs show paths with the word masked in place of the session folders.

## What none of it shows
- The masks are the processor's arithmetic and the backdrop is the processor's mirror of the photograph as it opens; a pixel may differ from the device's and a place does not.
- Three places along an edge are a sample of it, and a mask within the band at them can be off elsewhere.
- The edge clause is still read by eye; at three times the eye reads a distance of 4 against 8 pixels better than at the frame's own size, but a line one or two pixels from the band's border can be read either way.
