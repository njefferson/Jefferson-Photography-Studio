# A classifier fitted to the samples on a learned model's features (step 437, 11 November 2026)

Two sends. The first (13:37 to 14:00 California time) fetched the model, installed the runtime, made the features and ejected on the rule for a patch unlike every sample; the second (its runs stamped 14:12 to 14:14) fitted under the rule the plan settled, scored the planted masks and composed and opened the pictures. Every path below is under the session scratchpad.

## The model and its files

- The model: DINOv2 in its small form, from the ONNX copy Xenova/dinov2-small on Hugging Face, found through that site's own model search for dinov2-small (asked at huggingface.co/api/models with search=dinov2-small, and again with filter=onnx; it was first in the ONNX list). Its card, README.md (1,177 bytes, read whole), says it is facebook/dinov2-small with ONNX weights for Transformers.js. Its config: Dinov2Model, hidden size 384, 12 layers, 6 heads, patch size 14, image size 518, no registers. Its preprocessor: shortest edge 256, centre crop 224, rescale 1/255, mean 0.485, 0.456, 0.406, spread 0.229, 0.224, 0.225.
- The ONNX folder's files and their sizes in bytes, from the copy's own file listing: model.onnx 88,459,888; model_fp16.onnx 44,427,534; model_quantized.onnx 24,451,943; model_uint8.onnx 22,393,453; model_q4.onnx 15,034,473; model_bnb4.onnx 13,707,825; model_q4f16.onnx 12,917,198. The host's limit for one file is 26,214,400 bytes (25 mebibytes, R/notes-device.md): all but model.onnx and model_fp16.onnx fit under it. The smallest, model_q4f16.onnx, was fetched (12,917,198 bytes on disk, as listed) and is the only one run here.
- The licence: the ONNX copy's card names none. Its base model's card (huggingface.co/facebook/dinov2-small, raw README.md, 3,033 bytes, read whole) gives license apache-2.0 in its front matter, and the code repository's LICENSE (raw.githubusercontent.com/facebookresearch/dinov2/main/LICENSE, 11,359 bytes, read whole) is the Apache License, Version 2.0. Under its section 4 a free app may ship the file, giving a copy of the licence and keeping the notices.
- The runtime: onnxruntime-node 1.31.1, installed with npm's switch that runs no install script into the scratchpad's ort437; the binary for a plain processor on linux x64 ships inside the package. The web package was not needed and was not installed.
- The file loads in 0.2 s here; its input is pixel_values (float32, batch, channels, height, width) and its output last_hidden_state with a fixed shape of 257 by 384. It does not run at 1,400 by 938: its position embeddings were exported at 224 by 224 and the add of 257 to 6,701 tokens fails. So every picture ran as 96 lapping tiles of 224 by 224 (stride 112, the last tile flush with the edge, 12 across and 8 down) at half the frame's size, 1,400 by 938, and the 16 by 16 patch tokens of each tile were joined into one grid of 67 rows by 100 columns, each patch the mean of the tiles holding it weighted by a pyramid window. One cell of the grid is 28 pixels of the frame across and 27.8 down. Each patch sees only its own tile's context.

## The method as run

- A sample is a circle. A patch whose cell centre falls inside circles of one name is that name's sample patch; a patch inside circles of two names would be of neither (none was, on any picture). Features are made unit length.
- Likeness of a patch to a name: the mean cosine likeness to the name's 3 nearest sample patches.
- NEAR fit: each patch goes to the name it is most like. LINEAR fit: for each name a logistic classifier of that name against the rest, on the features standardised by the fitting picture's own mean and spread, the two sides weighted equally, ridge 0.01, 300 steps of Adam at 0.05; each patch goes to the name it scores highest.
- No subject: a name's reach is measured circle by circle, each of its sample patches against its sample patches lying in no circle that patch lies in; its threshold is the fifth part in a hundred from the bottom of those reaches; a patch takes no subject, under either fit, when its likeness to the name it is given is under that name's threshold. A name with one circle would take the lowest threshold among the picture's names with two or more; on these pictures every name had two or more circles (NIR_3461's Built things: three circles of one sample patch each), so none borrowed.
- The 3 nearest, the classifier's ridge, steps and rate are this step's own settings; the rule for no subject is the plan's, resting on no page read.
- A subject's coarse weight is 1 on its patches and 0 elsewhere, brought to the picture's size, 2,800 by 1,864, by bilinear interpolation between cell centres. No edge stage is run here; that is step 440's.
- Carried: the first photograph's fit (its sample patches, thresholds, standardisation and classifiers) applied to the second photograph's own features on the same input, nothing else carried.

## What travels when a fit is carried

Counted from the sample patches the fits printed, as 4-byte numbers:
- NEAR carries the sample patches' features and each name's threshold: 384 numbers a patch, so 1,536 bytes a patch. NIR_3705's fit: 699 sample patches, 1,073,664 bytes. NIR_3461's: 213, 327,168 bytes. NIR_3742's: 490, 752,640 bytes.
- LINEAR carries for each name 385 numbers (1,540 bytes) and the standardisation, 768 numbers (3,072 bytes), and under the no-subject rule it also needs the sample patches, since a patch is refused by its likeness to them; so it carries what NEAR carries and 7,692 bytes more for three names, 9,232 for four.
- Without the no-subject rule the linear fit alone would be the classifiers and the standardisation, under 10,000 bytes. That was not run.

## Times here (the container's, and nothing of a tablet)

- The features for one picture, through onnxruntime-node 1.31.1 on the processor with 4 threads: 96 tiles in 3.6 to 37.4 s, the bringing to size 0.3 to 0.6 s; the spread is the container's, other steps running beside this one.
- Both fits, their masks written, for one picture: 1.0 to 3.5 s; every picture on one input and the carried pairs: about 30 s.

## The planted scores (scores.md beside this note)

- Mean overlap over union at a half over the 16 planted masks, coarse, no edge stage: NEAR open 0.9052, natural 0.9129, bright 0.9081; LINEAR open 0.9060, natural 0.9135, bright 0.9091. The highest: LINEAR on natural.
- All 96 planted masks pass an overlap of a half; none meets the bar (0.9 and a widest band of 4 px). The median widest band is 126 to 143 px and the widest 682 px; these bands are regions given no subject reaching the boundary, on coarse masks.
- The lowest: plant-island Foliage, 0.57 to 0.63; plant-curved Foliage, 0.80 to 0.83; plant-island Water, 0.80 to 0.85; plant-three Sky, 0.86 to 0.87. In each the share of other regions taken is under 0.031: what is lost is subject left with no subject, not another kind taken.
- The scores of the two fits are the same on most planted masks.

## The share of patches given no subject

- On the planted pictures, every patch of which is a sampled kind, NEAR and LINEAR alike: plant-straight 4.3 to 6.4 percent, plant-stepped 2.2 to 2.3, plant-curved 11.8 to 13.8, plant-three 5.2 to 5.9, plant-shore 3.9 to 7.9, plant-built-foliage 1.9 to 2.5, plant-island 18.3 to 20.8. Two pass one tenth on every input: plant-curved and plant-island.
- On the frames: 1.5 percent (NIR_1651) to 18.4 percent (NIR_3710 open). In the carried cases: 26.2 to 26.6 percent (NIR_3461 to NIR_3466), 29.5 to 31.9 (NIR_3705 to NIR_3710), 75.1 to 80.6 (NIR_3742 to NIR_1873).
- The first send's reading of the rule had given 34.9 to 67.8 percent on the planted pictures.

## The pictures opened (the LINEAR fit, every input; masks coarse)

- NIR_3461, pylons over a meadow: Sky takes the sky to the horizon and leaves the pylons with a margin of about a cell, with one small island of sky left at the upper centre. Foliage takes the meadow from the horizon down, with a few cells at the horizon and the base of the left pylon left. Built things takes the bodies of the pylons in blocks of cells with holes, and the wires not at all. No subject: the left pylon's lattice and the other pylons' edges, cells along the horizon, a strip along the left border at the lower left.
- NIR_3466, a large industrial building, meadow and a road below: Sky takes most of the sky and leaves the low band of sky right of the building, strips along the right and upper left borders and cells among the clouds over the roof. Built things takes the building and the low buildings at the left to the frame's edge, about a cell beyond the roofline in places. Foliage takes the meadow and the road at the lower left. No subject: that low band of sky, the border strips, the clouds over the roof, the road at the lower right.
- NIR_1827, conifers under a streaked sky: Sky takes the upper sky and leaves the bright low cloud bank behind the treetops and a streak at the top centre. Foliage takes the forest to the crowns. No subject: the low cloud bank across the frame, the streak, specks along the left border; 10 to 13 percent.
- NIR_1651, a tree's crown with the sky at the right (the picture lies turned): Foliage takes the crown to its outline, taking a little sky between the outer twigs at the fringe; Sky takes the sky and the cloud to the crown's outline. No subject: specks along branches and at the fringe; 1.4 to 1.6 percent.
- NIR_3742, a lake with docks and boats, a forest shore and a strip of sky: Sky takes the strip to the treetops and leaves a few cells at the upper left. Water takes the lake around the docks with about a cell's margin. Built things takes the docks and boats as one band with about a cell of water around them. Foliage takes the forest to its base. No subject: the bright sandy shore between the forest and the water across the whole width, a bright object at the right edge, cells at the upper left of the sky and among the boats; 13.6 to 14.4 percent.
- NIR_3705, two towers among bright bushes under a grey sky: Sky takes the sky to the bush tops and around the towers with about a cell's margin, and leaves the right tower's spire. Foliage takes the bushes and leaves their upper crowns along the horizon from the left edge to the right tower. Built things takes the left tower's head and the right tower's body, not the left tower's trunk below its head. No subject: the band of bush crowns along the horizon, the right tower's spire, a strip at the lower left border; 9.2 to 9.7 percent.
- NIR_3710, the same towers from another place, with a band of ground below the bushes: Sky takes the sky and leaves a dark cloud patch at the top, left of centre. Foliage takes the bushes to about three quarters down the frame and some shrubs in the ground band. Built things takes the two towers' heads with about a cell's margin. No subject: the band of ground across the bottom quarter, the dark cloud patch, specks around the towers; 16.2 to 18.1 percent.
- NIR_1873, a forest slope down to a river pool, a dark trunk along the left edge: Foliage takes the slope and the near pine boughs at the right to the shore; Water takes the pool from the shore rocks to the bottom edge. No subject: the dark trunk along the left edge, the white rocks along the far shore, specks among the boughs; 8.2 to 9.0 percent.
- The three inputs give near the same masks on every frame; the natural input moves NIR_1827's Sky down by a few cells and NIR_3710's Foliage by a few points.

## The carried cases opened (the LINEAR fit)

The three pictures, each opened by step 437 and listed in its report, progress/step-437-2-report.txt: research/whole/maps-features/pictures/carried-linear-NIR_3705-to-NIR_3710.png, carried-linear-NIR_3461-to-NIR_3466.png and carried-linear-NIR_3742-to-NIR_1873.png (each 1,976 pixels wide: for each input the carried mask beside the second photograph's own, a row for each subject both hold and a last row for no subject). The eight frames' pictures beside them are contact-linear-<frame>.png.

- NIR_3705 to NIR_3710 (one scene): Sky and Built things carried take what NIR_3710's own take (Sky 41.6 to 43.4 percent against 42.7 to 43.4; Built things 4.5 to 4.7 against 4.6 to 4.7). Foliage carried takes 22.1 to 22.8 percent against the own 33.9 to 36.2: it leaves the bushes' upper crowns along the horizon and the tall bright bush at the right, which go to no subject (29.1 to 31.4 percent against 16.2 to 18.1).
- NIR_3461 to NIR_3466 (different scenes): Sky carried takes the whole sky to the roofline, more than the own (57.0 to 57.2 percent against 50.2 to 50.6), taking the low band and the border strips the own leaves. Foliage carried takes the meadow down to above the road (16.5 to 16.7 against 24.8 to 25.1). Built things carried takes nothing (0.0 percent): the fit made from three sample patches on pylons keeps no patch of the building for Built things, and the building goes to no subject; whether its patches were given to Built things and refused by that name's threshold, or given to another name and refused, was not counted.
- NIR_3742 to NIR_1873 (different scenes, the second with no sky): Water carried takes scattered patches of the pool (2.3 to 5.2 percent against 17.3 to 17.8); Foliage carried takes the darker conifers at the upper left (16.9 to 19.5 against 73.3 to 74.0); 75.0 to 80.5 percent of the frame goes to no subject.

## Where the feature notes differ from the step's Facts (Differs, from the first send)

- Differs: the paper fits its linear layer on whole datasets (ADE20K's 20,210 training pictures), not on a few marks; no page read measures a fit from a few marks. The method here was unchanged: the two fits from the samples alone.
- Differs: the model card says a larger picture is taken at sides that are multiples of 14; the ONNX file fetched here was exported with its position embeddings fixed at 224 and does not take 1,400 by 938, so the picture ran as lapping tiles of 224, as the Facts provide for.
- Differs: no page read says anything of a patch unlike every mark, nor gives the fifth part in a hundred; the rule run is the plan's own.
- Differs: the paper brings its coarse logits up by plain upsampling and says that cannot easily give fine edges; that agrees with this step's smooth interpolation and with the edge stage being step 440's.

## What none of it shows

- How fast a tablet's browser makes the features, how much memory it needs, or whether the web runtime runs this file there: every time here is the container's.
- A full-size edge: these masks are coarse, on cells of 28 pixels; the edge stage is step 440's, and step 441 to 443's judgements are of the masks after it.
- How the full-precision file's features differ from the 4-bit file's; how far joining lapping tiles by a weighted mean, which smooths neighbouring patches, moves the fits; whether the no-subject strips along frame borders (NIR_3466's sky, NIR_3461's and NIR_3705's lower left) come from the tiling, from the frames' own darkening at the edges or from the model: none of these was measured.
- Anything of a fit carried between photographs beyond the three pairs.
