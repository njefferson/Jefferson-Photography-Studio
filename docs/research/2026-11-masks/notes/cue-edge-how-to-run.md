# How to run the cue stage on MobileSAM's masks again (12 November 2026)

S is the session's scratch folder, the one the three scripts name at their head. Each script carries the scratch path of the session that wrote it, as the kept scripts of earlier steps carry theirs; point it at the new scratch folder before running it. Every script prints a MADE TO FAIL block and plant lines first, and a run whose plant lines differ from the block is not trusted. The scripts still carry their working names at their head (step3-stage, step3-compose, step3-index); the kept names are cue-edge-stage.mjs, cue-edge-compose.mjs and cue-edge-index.mjs.

## What must stand first
- Everything that notes/points-decode-how-to-run.md leaves standing: the dependencies of the app (`npm ci`), the eight photographs fetched through `node tools/owner-images.mjs --fetch` and through nothing else, each frame rendered once as the editor opens it in S/research/whole/frames as `<frame>-open.png` with its `<frame>-open.json`, the bundle of the decode and the recipe at S/scratch/step452-bundle.mjs, the recipe's 22 masks from the decode in S/research/decode/masks, the samples and the helpers `png.mjs`, `draw.mjs` and `edt.mjs` in S/research/whole, and the runner S/scratch/step452-runner.mjs with its job file.
- The 88 model masks of that run in S/masks2, 2,800 by 1,864, one byte a pixel, named like `mobilesam-colour-NIR_3742-water.png`. The stage and the pictures read the 22 of them made by MobileSAM on the colour picture. No model is run again.
- The stage decodes each photograph itself, once, and does not read the colour and grey pictures of the earlier run.

## The settings, fixed before any mask was made
- The coarse map: MobileSAM's mask on the colour picture, as a value from 0 to 1.
- The sure pixels: where the map is 0.9 or more or 0.1 or less, each drawn in by 48 pixels, so a band of 48 pixels each side of the map's edge is decided again.
- The cues: the ten cues of the recipe, counted on the decode as the harness of step 452 counts them (`placeDecode`, then the cue and structure values, on the page's thinned grid). Nothing is counted on a drawn picture.
- The fit: `sampleMaskFit` of `src/samplemask.ts` with the sure pixels as its two names and the cue named height left out. Each band pixel takes the fit's weight and each sure pixel keeps the map's value.
- Two ways of the fit, both made: way one, the fit reads every sure pixel of the frame (written as `cue-all`); way two, the fit reads only the sure pixels within 144 pixels of the map's edge, three band widths (written as `cue-near`).
- The last step: the plain guided filter of radius 8 and regularisation 0.001 over the whole, guided by the decode's lightness (the light of `placeDecode`, over 255).

## The order
1. `cue-edge-stage.mjs <frame>`, for each of the eight frames, as children of the runner, at most three side by side. It decodes the frame once, and for each subject of the first sample set writes the two masks to S/masks3 as `cue-all-<frame>-<subject slug>.png` and `cue-near-<frame>-<subject slug>.png`, 2,800 by 1,864, one byte a pixel, with S/masks3/index-<frame>.json holding each subject's sure counts, the counted pixels that took part in the fit on each side, the time, and the reason where the fit gave no recipe (then no mask is written). Plant lines, each printed by every run before any mask:
   - `plant step: 0.00 1.00`
   - `plant weights one: largest difference 0.0000`
   - `PLANT: expected (known wrong) the cut at a half at column 110; read column 100; reported as failing (as it must)`
   - `plant stage way one: known column 200; map misplaced to 220; column read 200; ... within 3`
   - `plant stage way two: known column 200; map misplaced to 220; column read 200; ... within 3`
   A plant that reads wrong stops the run with a line beginning STOPPED, and no mask is made. 44 masks result for the 22 frame-subjects.
2. `cue-edge-compose.mjs <frame>`, for each of the eight frames. It reads the recipe's mask, MobileSAM's mask on the colour picture as it is, and the two stage masks, and writes for each frame-subject a whole picture and an edges picture to S/pictures3 as `whole-<frame>-<subject slug>.png` and `edges-<frame>-<subject slug>.png`, with S/pictures3/index-<frame>.json. The whole picture has five panels (the frame with its samples, then the four masks), each mask with its outline at a half and the white square of one hundredth of the frame. The edges picture has, for each of the four masks, three places along its own edge (one sixth, one half and five sixths of its edge pixels in raster order), each a pair of 240 by 240 crops at the frame's own size with a white mark four pixels wide. Plant lines: `layout whole 1576 by 790, edges 1576 by 1232`, `innerEdge counts 8; places 2,1 3,2 2,3`, `square side 42, area over the panel 0.0101; on 2800 by 1864 the side is 228.5`, `no edge: all 255 true, all 0 true; the block mask false`, and `wrap gives 3 lines, the longest 79`. Open at least three pictures to see every panel and crop drawn, titled and marked.
3. `cue-edge-index.mjs`, with no argument. It joins the per-frame parts into S/pictures3/index.txt and index.json and S/masks3/index.txt and index.json, counts the frame-subjects (22) and the files that do not stand (0). Plant line: `5 frame-subjects in the planted parts, 1 missing`.

## The times seen in the container
The decode and the count of a frame took 2.9 to 3.7 seconds; the sure pixels and the distance to the edge of a subject 0.65 to 0.8 seconds; each mask 0.78 to 1.07 seconds; a whole frame 8.5 to 13.5 seconds.

## What none of it shows
- The masks are arithmetic in node on the decode and say nothing of the device's speed, memory or pictures.
- The backdrop under each mask is the processor's mirror of the photograph as it opens, not the decode itself; a pixel may differ from the device's and a place does not.
- Three places along an edge are a sample of it, and the places follow each mask's own edge, so a word against another mask compares different places.
- A band of 48 pixels cannot mend a wrong region, and three subjects have a small sure region, so the stage can only move their edges inside 48 pixels of the map's line.
