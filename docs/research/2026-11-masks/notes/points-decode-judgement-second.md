# Judgement, second set: NIR_3742, NIR_3705, NIR_3710 and NIR_1873 (12 frame-subjects)

Each frame-subject's whole picture and edges picture were opened once, from the index, before anything else of any step was read. Every mark is read from the opened pictures alone. Figures in titles were not used. The bar was read as the section "How the bar was read" states it: a region wrong by more than one hundredth (the white square) fails the region clause; the line at each of A, B, C within 4 pixels (the white L) of the thing's own edge meets the edge clause.

How marks are written here. Sizes are estimates by eye, in hundredths against the white square. Where a distance or size could not be settled by eye the line says Uncertain, and that clause is counted in neither the met count nor the not-met reading but in a separate Uncertain count at the foot. A line lying within 4 pixels of the frame's own border (a thin rim of the mask at the frame edge) is read against the border as the thing's edge, and is flagged Uncertain.

## NIR_3742 Sky

- Recipe: region met (the sky strip is taken whole; the pale blur at the right edge is not in it). Edge: A about 3, B about 3, C Uncertain (line along a thin ridge of bare trunks, about 3 to 8). Edge clause Uncertain.
- MobileSAM colour: region met (smoothed line leaves small gaps between crowns, each under 0.5). Edge not met: A about 15, B about 25, C about 10 to 20.
- MobileSAM grey: region met (gaps under 0.5). Edge not met: A about 20, B about 20, C about 20.
- SlimSAM colour: region not met (the whole forest and the beach are taken as sky, about 35 hundredths or more, and the water edge line shows at the shore). Edge not met: A at the frame rim (Uncertain, about 3) beside a crown whose line is about 5, B about 5 to 10, C lies in forest with no sky edge, over 100.
- SlimSAM grey: region met. Edge: A is a rim line at the frame top in open sky (Uncertain, within 3 of the border), B about 5, C about 5. Edge clause Uncertain.
- MobileSAM colour against the recipe: worse, its smooth line is 10 to 25 off where the recipe hugs the crowns.
- MobileSAM grey against the recipe: worse, same reason.
- SlimSAM colour against the recipe: worse, the forest is taken.
- SlimSAM grey against the recipe: same, its edges are about as near as the recipe's, with a rim line at the top that pulls the other way.
- Uncertain: SlimSAM grey, the rim line at A and the near-equal edges; the recipe's edge at C.

## NIR_3742 Water

- Recipe: region met (a blob at the right edge in the blur about 0.4; the docks are left out; no wrong region over one hundredth seen). Edge not met: A Uncertain (about 10), B about 20 (line crosses the boat canopy), C about 30 (line in water above the float).
- MobileSAM colour: region met (a thin rim along the left and bottom, under 0.3). Edge not met: A about 25 (line wobbles on the beach), B Uncertain (about 8), C about 15.
- MobileSAM grey: region met. Edge not met: A about 3, B lines in open water, nearest edge over 100, C about 15.
- SlimSAM colour: region not met (the whole forest is taken, about 35). Edge not met: A in forest, B on the beach, C in the docks, all far from the water's edge.
- SlimSAM grey: region not met (forest taken, about 35). Edge not met, same places.
- MobileSAM colour against the recipe: same, the shore is nearer and the recipe's blob and boat cut are gone, but a rim and wobbles pull the other way.
- MobileSAM grey against the recipe: same, nearer shore at A and loops in open water at B pull both ways.
- SlimSAM colour against the recipe: worse, the forest is taken.
- SlimSAM grey against the recipe: worse, same reason.
- Uncertain: both MobileSAM words, they pull both ways; the recipe's edge at A.

## NIR_3742 Built things

- Recipe: region not met (the beach strip and a band of water are taken, each many hundredths; forest patches at the top left about 2). Edge not met: A in tree crowns, no edge of a built thing, over 50; B in water at the base of the beach, over 50; C through the boat canopy, over 15.
- MobileSAM colour: region met (the dock and boats are taken; a patch of the pale island tree about 0.5, Uncertain). Edge not met: A about 15 (line passes through the canopy), B about 5, C about 10.
- MobileSAM grey: region met (the tree patch about 0.5, Uncertain). Edge not met: A about 15, B about 5, C about 8.
- SlimSAM colour: region not met (the forest is taken, about 35). Edge not met: A in forest, B on the beach, C scattered.
- SlimSAM grey: region not met (same). Edge not met.
- MobileSAM colour against the recipe: better, the dock is taken and the beach, water band and forest patches are not.
- MobileSAM grey against the recipe: better, same reason.
- SlimSAM colour against the recipe: worse, about 35 hundredths of forest against about 15 of band.
- SlimSAM grey against the recipe: worse, same reason.
- Uncertain: the tree patch in both MobileSAM masks, about 0.5; the size of the recipe's bands against SlimSAM's forest is a judgement of weight, both far over one hundredth.

## NIR_3742 Foliage

- Recipe: region not met (two blobs in the water, about 1.3 and 0.9, Uncertain at the second; boat bits and the blur patch about 0.5). Edge not met: A about 3, B Uncertain, C in water, over 100.
- MobileSAM colour: region not met (the pale island pine is left out, about 4). Edge not met: A about 20 (a loose second line in the crown), B about 3, C line along the forest floor with no crown edge, Uncertain.
- MobileSAM grey: region not met (island pine left, about 4). Edge not met: A about 5, B about 10, C line in dark forest, no edge, over 20.
- SlimSAM colour: region met (the island pine is in; the right blur edge small). Edge not met: A about 10, B about 5, C in dark forest floor, over 20.
- SlimSAM grey: region met. Edge not met: A about 5, B vertical line in dark forest, no edge, over 20, C loops through a bush.
- MobileSAM colour against the recipe: same, the island is left (pulls worse) and the recipe's water blobs are gone (pulls better).
- MobileSAM grey against the recipe: same, same pulls.
- SlimSAM colour against the recipe: better, the island is in and the water blobs are gone.
- SlimSAM grey against the recipe: better, same reason.
- Uncertain: the two MobileSAM words; the size of the recipe's second water blob, near one hundredth; Slim's island pine edge is partly pale and read as in.

## NIR_3705 Sky

- Recipe: region met (the towers are left out; a bright patch in the right tower under 0.3). Edge not met: A about 5, B about 40 (line lies in open sky above the fluff), C about 3.
- MobileSAM colour: region met. Edge not met: A about 30 (loose around the tower), B about 40, C about 10.
- MobileSAM grey: region met. Edge not met: A about 30, B about 30, C about 10.
- SlimSAM colour: region met (a thin sliver near the right tower, Uncertain, about 0.5 to 1). Edge not met: A at the frame rim (Uncertain), B about 5, C blobs in open sky, over 50.
- SlimSAM grey: region met (same sliver, Uncertain). Edge not met: A rim (Uncertain), B about 15, C blobs in open sky, over 50.
- MobileSAM colour against the recipe: worse, its line is looser at all three places.
- MobileSAM grey against the recipe: worse, same reason.
- SlimSAM colour against the recipe: worse, blobs at C and the rim outweigh a nearer B.
- SlimSAM grey against the recipe: worse, same reason.
- Uncertain: the sliver at the right tower in both SlimSAM masks.

## NIR_3705 Foliage

- Recipe: region Uncertain (a dark patch left out at the lower left about 0.8; smaller holes about 0.4 each; the right tower faintly tinted below a half). Edge Uncertain: A a tangle of branches, line wanders, B about 3, C a loop round a dark patch, whether that is the foliage's edge is not settled.
- MobileSAM colour: region met (a gridded patch at the left about 0.5). Edge not met: A about 8, B Uncertain (about 10), C at the frame bottom (within 3 of the border, Uncertain).
- MobileSAM grey: region Uncertain (a gridded patch and bare bush at the left about 1.0). Edge not met: A about 15, B about 10, C at the border (Uncertain).
- SlimSAM colour: region not met (the left tower is taken, about 6; sky patches at the top left about 3). Edge not met: A loops in open sky, B in tower and bush, C in tower.
- SlimSAM grey: region not met (the left tower taken, about 6; sky patches under 1). Edge not met.
- MobileSAM colour against the recipe: same, no gap taller than the recipe's, edges looser at A and nearer at none.
- MobileSAM grey against the recipe: same, the gridded patch pulls worse and the missing holes pull better.
- SlimSAM colour against the recipe: worse, the tower and sky are taken.
- SlimSAM grey against the recipe: worse, the tower is taken.
- Uncertain: the recipe's region and edge; MobileSAM grey's patch; both MobileSAM words.

## NIR_3705 Built things

- Recipe: region not met (bands in open sky about 1.3 and under; bush patches at the bottom about 1.1 each; several). Edge not met: A in the tower foliage about 10, B about 5, C in a bush patch with no tower edge, over 50.
- MobileSAM colour: region met (both towers taken; thin tips at the top of the right tower left, under 0.3). Edge not met: A about 15, B about 5, C about 8.
- MobileSAM grey: region met. Edge not met: A about 15, B about 5, C about 8.
- SlimSAM colour: region not met (the bush between the towers is taken, about 25). Edge not met: B and C in the bush.
- SlimSAM grey: region met (small bush spots under 0.4). Edge not met: A about 8, B loops in the bush and the sky, no edge, C loops in the bush.
- MobileSAM colour against the recipe: better, the sky bands and bush patches are gone.
- MobileSAM grey against the recipe: better, same reason.
- SlimSAM colour against the recipe: worse, about 25 of bush against the recipe's several.
- SlimSAM grey against the recipe: better, the sky bands and bush patches are gone.
- Uncertain: MobileSAM edges at A and B are about 5 to 15, close to the line between met and not.

## NIR_3710 Sky

- Recipe: region met (a small oval hole in the sky above the left tower about 0.4). Edge not met: A in open sky, about 140 from the nearest edge, B about 4, C about 4.
- MobileSAM colour: region met. Edge not met: A about 20, B about 20, C about 25.
- MobileSAM grey: region met. Edge not met: A about 20, B about 15, C about 25.
- SlimSAM colour: region met (a dotted string at the right tower, thin). Edge not met: A at the frame rim (Uncertain), B about 15, C about 4 at the bush and beyond that a string of blobs in the sky, over 100.
- SlimSAM grey: region met. Edge not met: A rim (Uncertain), B about 15, C same as the colour one.
- MobileSAM colour against the recipe: same, the hole is gone but the hugging at B and C is lost.
- MobileSAM grey against the recipe: same, same pulls.
- SlimSAM colour against the recipe: same, the recipe's open-sky line at A and the blobs at C weigh about alike.
- SlimSAM grey against the recipe: same, same reason.
- Uncertain: all four model words pull both ways.

## NIR_3710 Foliage

- Recipe: region not met (dark patches left out in the lower band, the largest about 3, several about 0.7). Edge not met: A in a tangle of tower branches, over 10, B about 4, C about 4.
- MobileSAM colour: region met (a small tail at the top right under 0.3). Edge not met: A about 15, B in open sky near the left, lines in sky over 20, C about 3.
- MobileSAM grey: region Uncertain (gridded patches in the ground below the base, each about 0.7, several). Edge not met: A about 15, B and C blobs in the ground, no edge, over 20.
- SlimSAM colour: region not met (the whole sky is taken, about 40). Edge not met: A in sky, B and C in ground.
- SlimSAM grey: region not met (the whole sky is taken, about 40). Edge not met.
- MobileSAM colour against the recipe: better, no holes and the base line follows the base of the bush.
- MobileSAM grey against the recipe: same, holes gone but gridded patches come in.
- SlimSAM colour against the recipe: worse, the sky is taken.
- SlimSAM grey against the recipe: worse, same reason.
- Uncertain: MobileSAM grey's patches near 0.7 each.

## NIR_3710 Built things

- Recipe: region not met (a band of bush across the lower third and many patches, each far over one hundredth). Edge not met: A in the tangle about 15, B in the bush, no tower edge, over 30, C round a small bush on the ground, over 30.
- MobileSAM colour: region met (a thin strip of the left tower's lobes left out, under 0.3). Edge not met: A about 8 (Uncertain), B about 10, C about 8.
- MobileSAM grey: region met. Edge not met: A about 8, B about 5 with loops inside the tower, C about 8 (Uncertain).
- SlimSAM colour: region met (small bush spots under 0.4). Edge not met: A about 6 (Uncertain), B loops in the bush, over 50, C loops in the bush, over 50.
- SlimSAM grey: region met. Edge not met: A about 8, B loops in the bush, C loops in the bush.
- MobileSAM colour against the recipe: better, the tower alone against the recipe's bush band.
- MobileSAM grey against the recipe: better, same reason.
- SlimSAM colour against the recipe: better, same reason.
- SlimSAM grey against the recipe: better, same reason.
- Uncertain: the model edges at A and C lie between about 5 and 10, near the 4 pixel limit.

## NIR_1873 Foliage

- Recipe: region not met (the dark foreground trunk strip at the left is taken, about 9; the bank of rocks is taken, about 6; the near pine boughs over the water are mostly left out, about 8). Edge not met: A in needles with no edge, B in water, over 100, C about 5 to 10 round a bough.
- MobileSAM colour: region not met (the near pine boughs over the water are left out, about 15, Uncertain whether the near blurred boughs are held as foliage here; they are pine needles and are counted as left). Edge not met: A about 8, B loops in a bough, C boxes round the right trunk, no foliage edge, over 20.
- MobileSAM grey: region not met (boughs left, about 15). Edge not met: A about 8, B along the rock slope, not a foliage edge, over 20, C boxes, over 20.
- SlimSAM colour: region not met (boughs left, about 15). Edge not met: A in the boughs, B about 10, C along a log, over 20.
- SlimSAM grey: region not met (boughs left, about 15). Edge not met: A in the boughs, B loops, C loops in a bush.
- MobileSAM colour against the recipe: better, no trunk or rocks taken (the left boughs pull the other way, about equally for every mask).
- MobileSAM grey against the recipe: better, same reason.
- SlimSAM colour against the recipe: better, same reason.
- SlimSAM grey against the recipe: better, same reason.
- Uncertain: the left boughs count against every mask alike and rest on whether the near, blurred boughs are foliage; all four words are read as better with that.

## NIR_1873 Water

- Recipe: region not met (the dark blurred trunk over the water at the lower left is taken, about 3; patches of forest in the upper right, each about 0.5). Edge not met: A loops in needles, no water edge, over 50, B about 5 along a branch but with a vertical line in water at the left, over 40, C about 5.
- MobileSAM colour: region Uncertain (the water between the boughs at the lower right is cut off by a straight line, about 3, and is it water or boughs is not settled; rocks in the water left as holes under 0.3). Edge Uncertain: A about 3, B about 5 to 10, C at the frame bottom (border, Uncertain).
- MobileSAM grey: region Uncertain (same cut, about 3; the trunk's dark strip is partly in, about 0.7). Edge Uncertain: A about 3, B about 8, C at the border.
- SlimSAM colour: region not met (a block of the forest above the water is taken, about 25). Edge not met: A and B in forest, C in boughs.
- SlimSAM grey: region not met (same block, about 25). Edge not met.
- MobileSAM colour against the recipe: better, no trunk or forest patches.
- MobileSAM grey against the recipe: better, same reason.
- SlimSAM colour against the recipe: worse, about 25 of forest against about 4.
- SlimSAM grey against the recipe: worse, same reason.
- Uncertain: the lower right water between the boughs, for both MobileSAM masks.

## Counts over the 12 frame-subjects

Each count is of plain marks; Uncertain clauses are listed separately.

- Recipe: region clause met on 4 (3742 sky, 3742 water, 3705 sky, 3710 sky), Uncertain on 1 (3705 foliage). Edge clause met on 0, Uncertain on 2 (3742 sky, 3705 foliage). Both met on 0.
- MobileSAM colour: region clause met on 9, Uncertain on 1 (1873 water). Edge clause met on 0, Uncertain on 1 (1873 water). Both met on 0.
- MobileSAM grey: region clause met on 7, Uncertain on 3 (3705 foliage, 3710 foliage, 1873 water). Edge clause met on 0, Uncertain on 1 (1873 water). Both met on 0.
- SlimSAM colour: region clause met on 4, Uncertain on 0. Edge clause met on 0, Uncertain on 0. Both met on 0.
- SlimSAM grey: region clause met on 6, Uncertain on 0. Edge clause met on 0, Uncertain on 1 (3742 sky). Both met on 0.

Model masks against the recipe, over the 12:

- MobileSAM colour: better 6, same 4, worse 2, broken 0.
- MobileSAM grey: better 5, same 5, worse 2, broken 0.
- SlimSAM colour: better 3, same 1, worse 8, broken 0.
- SlimSAM grey: better 4, same 2, worse 6, broken 0.

## What this judgement cannot show

- Sizes are read by eye against the white square and distances against the white L, in crops that show only three places on each mask's own edge. A fourth place could read otherwise, and a mask that meets the edge clause at its three places may fail elsewhere.
- The three places are fixed by raster order along each mask's own edge, so each mask is judged at different places; a word against the recipe compares different places and different regions.
- The backdrop is the photograph as it opens, from the processor's mirror, not the device's drawing, and not the decode itself; what counts as the thing's own edge was read from that picture.
- Whether a near, blurred pine bough, a dark out-of-focus trunk over water, or a bank of rocks is part of a named subject is a judgement from the picture; it moved several marks (3742 foliage, 1873 foliage, 1873 water).
- Thin structures and speckle were read as small; the many small spots of a mask are not added up, only each connected region is sized.
- Nothing here says how a mask would behave on the device, on other frames, or under a person's hand on the test page.
