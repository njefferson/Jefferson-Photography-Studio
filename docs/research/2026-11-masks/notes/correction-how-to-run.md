# How to run the correction route again (12 November 2026, night)

S is the session's scratch folder, the one the scripts name at their head. Each script carries the scratch path of the session that wrote it, as the kept scripts of earlier steps carry theirs; point it at the new scratch folder before running it. Every script prints a MADE TO FAIL block and plant lines first, and a run whose plant lines differ from the block is not trusted. The scripts still carry their working names at their head (step5-samples and the rest); the kept names are correction-<name>.mjs, with the working prefix step5- replaced by correction-.

## What must stand first
- Everything that notes/fine-read-how-to-run.md and notes/cue-edge-how-to-run.md leave standing: the dependencies of the app, the eight photographs fetched through `node tools/owner-images.mjs --fetch` and through nothing else, each frame rendered once as the editor opens it in S/research/whole/frames as `<frame>-open.png` with its `<frame>-open.json`, the helpers `png.mjs`, `draw.mjs` and `edt.mjs` in S/research/whole, and the runner S/scratch/step452-runner.mjs with its job file.
- The colour pictures from the decode in S/inputs2, MobileSAM's models and the runtime for node, as the points-decode steps left them.
- The first sample set of each frame in S/research/whole/samples.json (notes/samples.json here), which is never changed.
- The masks and pictures of the evening before (S/masks2, S/masks3 and S/pictures3) stand untouched, since the script that composes the pictures reads the cue stage's masks of that evening as the before masks.

## How samples-added.json is made
- `correction-samples.mjs`, with no argument, copies samples.json and appends to the first sample set of NIR_3742, NIR_3461, NIR_1873 and NIR_3710 the nine samples that notes/samples-session-placed.json holds, each carrying placedBy. It writes S/research/whole/samples-added.json.
- The plant is the check that the added file holds the original samples unchanged, compared sample by sample, plus only the added ones. The plant lines read: one added gives unchanged true and added 1; one original moved gives unchanged false; one original removed gives unchanged false. The check of the real file must read original samples unchanged true, with the originals NIR_3742 22, NIR_3461 12, NIR_1873 9 and NIR_3710 14 and the added 2, 3, 2 and 2. A plant that reads wrong stops the run and nothing is written.
- It also draws S/pictures5/samples-<frame>.png for the four frames, the original samples as circles and the added ones as squares with a plus, and a zoom of each added sample. Open each added sample's zoom before any mask is made, to see it lie on the thing it is meant for. `correction-crop.mjs <frame> <x0> <y0> <w> <h> <step> <name> [mask file]` is the look aid for choosing a place: it crops a window with a grid in frame coordinates and writes S/pictures5/crop-<name>.png. Its plants are a crop pixel off every grid line that must hold frame pixel 202,102, a crop pixel on a grid column that must hold the grid colour 0,255,255, and the crop pixel 30,20 that must hold frame pixel 130,70.

## The order
1. `correction-samples.mjs` as above, with `correction-crop.mjs` as often as a place needs looking at.
2. `correction-models.mjs mobile <frame>`, for each of the four frames. It reads samples-added.json, runs MobileSAM on the colour picture only, one joint prompt for each name including a new name such as Ground, and writes S/masks5/mobilesam-colour-<frame>-<subject slug>.png and S/masks5/index-<frame>.json. Plant lines: height 682, byte 128, bilinear 0 30; mismatches 1 and 0; and the contract check holding with 0 mismatches.
3. `correction-stage.mjs <frame>`, for each of the four frames. It reads samples-added.json and S/masks5/mobilesam-colour-*, and writes way one (cue-all) and way two (cue-near) to S/masks5. Plant lines: step 0.00 1.00; weights one, largest difference 0.0000; the plant that is known wrong and must be reported failing, the cut at a half at column 110 read at column 100; the stage way one and the stage way two each reading column 200 within 3. The stage gives no mask for a subject whose fit has fewer than 50 counted pixels on a side, and says so; those subjects are listed in the run's output.
4. `correction-shares.mjs`, with no argument. It prints the share at a half of every mask of S/masks5 beside the share of the same mask before. Plant line: share 0.2500 and 1.0000.
5. `correction-compose.mjs <frame>`, for each of the four frames. It writes the whole picture of each frame-subject (the frame with its samples, the added ones marked, MobileSAM before and after, way two before and after, each mask panel with the square of one hundredth) to S/pictures5, with the three places of each after mask. A subject with no way two mask has a panel that says so. Ground is left out of the subjects drawn. Plants: layout whole 1576 by 790; inner edge counts; square side 42 and area over the panel 0.0101; no-edge masks; the wrapping of a long line.
6. `correction-fine.mjs <frame>`, for each of the four frames. It reads S/pictures5/index-<frame>.json and draws the two after masks in two columns, three place rows down each, one picture of 1,484 by 834 pixels for each frame-subject, as `fine-<frame>-<subject slug>.png`. Plants as in notes/fine-read-how-to-run.md, with the single picture 1484 by 834 and the longer side under the limit of 1,600.
7. `correction-index.mjs`, with no argument. It joins the per-frame parts into S/pictures5/index.txt. Plant line: frame-subjects 12, added samples 9, regions 5.

Open at least three of the pictures, one of them a lattice, to see every panel drawn and titled.

## How many run at once
At most two model runs go side by side. The stage, the pictures and the index may run beside them.

## What none of it shows
- The masks are the processor's arithmetic and the backdrop is the processor's mirror of the photograph as it opens; a pixel may differ from the device's and a place does not.
- Three places along an edge are a sample of it, and a mask within the band at them can be off elsewhere.
- The samples are prompts placed by a session and never a truth. Where each lies was chosen by a rule fixed before any mask was made, and no sample was moved after a mask was seen.
