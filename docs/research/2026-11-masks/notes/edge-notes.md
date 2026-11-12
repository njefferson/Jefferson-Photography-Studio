# The edge stage measured alone (step 436, 11 November 2026)

**Plainly: no stage meets the bar from a right coarse map on most of the planted tests.** Of sixteen right coarse maps, plain at radius 16 (the stage the rule fixes) meets the bar on 1, weighted at radius 48 on 6, cues at radius 8 on 2, and the coarse map as it is, with no stage, on 6. From the misplaced maps, plain r16 meets it on none, weighted r48 on none, cues r8 on 2, the coarse map as it is on none. No stage lowers the median widest band below the coarse map's own, from either kind of map.

## What was measured, and how

- The script: research/whole/refine.mjs, with its helpers in refine-lib.mjs: `node refine.mjs <coarse.png> <picture.png> <out.png> <plain|weighted|cues> <radius> <regularisation> <cell>`. Its plant read 0.00 and 1.00 either side of a kept step, 0.0000 between the weighted filter with every weight one and the plain filter, and reported as failing a planted wrong expectation (it moved a ramp misplaced by 10 px to the guide's edge, column 100).
- The tests: for each of the 7 planted pictures and each of their 16 regions, a coarse map made from the truth itself (cells of 28 px holding the region's share, brought back by bilinear interpolation between cell centres: a coarse map that is right) and the same with the truth moved 14 px across and down first (misplaced by half a cell). Every stage and setting on all 32, guided by the picture as it opens, each result scored by score.mjs against the truth over the whole picture: 320 masks, every score file carrying the scorer's plant reading 0.8750 and 6. Every line is in scores.md.
- The bar (the plan's): overlap over union 0.9 or more and widest band 4 px or less.
- The rule (the step's): the stage and setting with the lowest median widest band from the right maps, a tie to the higher mean overlap. It fixed plain at radius 16, regularisation 0.001 (chosen.txt).

## Each stage, what it needs, and what it did

### Plain: the guided filter
- Needs: the picture's grey (Rec. 709) and the coarse map at full size; eight box means over the frame. No module of the app. Here, about ten frame-sized arrays of 64-bit numbers. 0.70 s for the filter on one real frame, 0.93 s through the command with reading and writing.
- Settings tried: radius 32 (step 427's), 16 and 64, regularisation 0.001.
- From the right maps: r16 median widest band 10 px, worst 12, mean overlap 0.9991, meeting the bar 1 of 16; r32 15.5, 21, 0.9980, 1; r64 27, 53, 0.9948, 1.
- From the misplaced maps: r16 22, 32, 0.9816, 0; r32 24.5, 31, 0.9878, 0; r64 36.5, 61, 0.9895, 1.
- Seen in the crops: from a right map it sits on the boundary with specks and a fringe of a few px; from a misplaced map it keeps the misplacement and makes it ragged (5 to 20 px). On a guide made from the truth (no texture) it brought the right map of plant-curved Sky to 3 px and kept the misplaced one at 29 px.

### Weighted: the guided filter fitted on the sure pixels
- Needs: as plain, and the sure regions: the coarse map at 0.9 or more, or 0.1 or less, drawn in by one cell of the map's own grid (two distance transforms); twelve box means. 1.40 s on one real frame, the sure regions included.
- Settings tried: radius 48, 64 and 96, regularisation 0.001.
- From the right maps: r48 23, 26, 0.9960, 6 of 16; r64 28, 39, 0.9947, 1; r96 36, 47, 0.9911, 1.
- From the misplaced maps: r48 28, 41, 0.9785, 0; r64 34, 50, 0.9818, 0; r96 46, 67, 0.9859, 1.
- Seen in the crops: on straight and gently curved lines within 2 to 4 px from a right map; every corner rounded with a radius of about 40 px; a misplaced line kept about where the map put it. On a guide made from the truth it reached the edge only once its radius spanned the band: plant-curved Sky right map 20 px at r48, 17 at r64, 1 at r96; misplaced 40, 36 and 20. The band (0.1 to 0.9 plus a cell drawn in on each side) is about 90 to 100 px on these maps, and windows that hold one side's sure pixels alone carry that side's value into it.

### Cues: the band decided again by the app's cue recipe
- Needs: the app's own modules for the 2.79 recipe (the cues of src/placecues.ts and src/placestructure.ts on the test page's thinned grid, k = 3, 579,393 counted pixels on a 2,800 by 1,864 picture; the fit and weights of src/samplemask.ts), run here from the bundle scratch/step428-bundle.mjs; the sure regions as for weighted, as the fit's two names; a plain guided filter of a small radius over the whole after. 1.11 and 1.25 s on one real frame, the cues included.
- Settings tried: the small filter's radius 2, 4 and 8, regularisation 0.001.
- From the right maps: r8 28, 50, 0.9904, 2 of 16; r4 29, 50, 0.9892, 0; r2 29, 52, 0.9887, 0.
- From the misplaced maps: r8 28, 65, 0.9909, 2; r4 29, 67, 0.9898, 0; r2 29, 67, 0.9893, 0.
- Seen in the crops: the only stage that moved a misplaced line back to the boundary (plant-straight, where it met the bar from both maps at 3 px; plant-curved, plant-shore and plant-island Sky within a few px), and the only one whose result hardly depends on where the map put its half (on plant-straight Sky, 1,173 pixels differ in value between its masks from the right and the misplaced map and none at a half). It also leaves out or takes whole patches where a region's own texture varies: pale parts of the sky beside the building on plant-stepped and plant-three (20 to 40 px), 4 to 8 px of water under the shore, a bulge of foliage about 20 px beside the building on plant-built-foliage, and water up to about 25 px deep on plant-island. On a picture coloured by the truth it gave 0 px from both maps, so its placing of the grid, labels and weights is right.

## The two real tree lines

The Sky maps of NIR_3705 and NIR_3710 that step 427 kept from the scene-class model on the open input, brought to full size and nothing else (maps-classes/masks/bisenetv2-open-<frame>-sky-model.png), each stage at its best setting, the model's cell taken as 29 px. No truth: the widths are read by eye against a 4 px bar in real/NIR_3705-sky-crops.png and real/NIR_3710-sky-crops.png.

- **The model's sky confidence reaches 0.9 on almost none of the sky**: 9,151 sure sky pixels of 5,219,200 on NIR_3705 and 59,056 on NIR_3710. So the two stages that read sure regions had almost no sky to fit from.
- Plain r16 keeps the model's line, 20 to 70 px off crowns and shrub tops in places, the pale plumes taken as sky, and adds a fringe; it follows a tower's dark head within about 5 to 10 px where the coarse line was 20 to 60 px off.
- Weighted r48 draws boxes with straight sides, the shape of its windows, and leaves out blocks of sky 100 to 260 px across at every crop of both frames.
- Cues r8 follows shrub tops, crowns and pale plumes within about 5 to 10 px at most places on NIR_3710 and on the left of NIR_3705, leaving the plumes out and the sky in; on NIR_3705 it leaves out most of the sky in two of four crops (the tower's head and branches), taking it only in blobs.

## Why the planted bands come out as they do

The planted regions' grey hardly differs: the separation of two regions that meet (the gap between their means over the root mean square of their spreads) is 0.13 to 1.35 on every boundary but plant-three's Built things against Water (4.40), so the seam is not an edge of the guide the two filters follow. That one boundary is the only one where the plain and the weighted filters met the bar at every setting from the right map, at 0 px; the cue stage left about 5 px of water out there (widest band 8 px at r8). The cue stage reads colour and texture as well, which is why it alone moves a misplaced line, and decides each band pixel on its own, which is why it leaves patches.

## What none of it shows

- A tablet's speed and memory. Every time above is the container's processor, measured once; the device's own figure is the test page's to take.
- Soft edges, wires, lattices and gaps between leaves: the planted pictures have none (inputs.md), and the two real tree lines have no truth, so what is said of them is read by eye from four crops each.
- Other coarse maps: the planted maps are made from the truth with cells of 28 px; a model's map has its own confidence (the scene-class model's sky stays under 0.9), and the sure regions' thresholds of 0.9 and 0.1 and the one cell drawn in are the plan's, not tuned here.
- Other settings: three per stage. The weighted filter reached the edge on a clean guide at radius 96, which on the textured planted pictures read a median of 36 px from the right maps.
- The natural-hue input as the guide: not run, because it keeps the brightness the grey guide is made from; the region means and spreads of the two inputs' grey agree to within 0.001.
- Whether any of this is the right look for a photograph: nothing here judges a picture's look, only what a mask takes and leaves.
