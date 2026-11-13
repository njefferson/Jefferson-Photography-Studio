# Judgement of the cue edge step: NIR_3742, NIR_3705, NIR_3710 and NIR_1873

Each of the 24 pictures was opened once, from the index by its path, after the plan and the section "How the bar was read" and before anything else. Every mark is read from the opened pictures and from nothing else. Figures printed in titles were not used.

## How the bar was read

- Region clause: met where no connected region wrongly taken, and none wrongly left, is larger than one hundredth of the frame. Sizes are estimates by eye against the white square, written as about so many hundredths.
- Edge clause: met where at each of A, B and C the line at a half lies within 4 pixels of the thing's own edge, read in the crops against the white L. Where a line lies where the thing has no edge, the distance given is to the nearest edge of the thing. Distances are by eye and rough.
- Many small stray pieces are each sized on their own, and it is said where a mask has many.
- Words: better, worse, same, broken as the task states them. Way one is the cue stage fitted on every sure pixel; way two is the cue stage fitted on sure pixels near the edge.
- A clause marked Uncertain is counted apart at the foot.

## NIR_3742 Sky

- Recipe: region met (line follows the tree tops; no wrong region over one hundredth seen). Edge Uncertain: A about 6, B about 3, C about 3 pixels.
- MobileSAM as it is: region Uncertain (a strip of sky left between its line and the tree tops across the left half, about 1 to 2 hundredths). Edge not met: A about 40, B about 40, C about 15 to 20 pixels, the line floating in open sky.
- Way one: region met (line follows the tree tops; no wrong region over one hundredth). Edge not met: A about 4, B about 10 to 30 (a smooth dip over a gap between crowns), C about 20 (a smooth dip in the sky between trees).
- Way two: region met. Edge Uncertain: A about 5, B about 4, C about 6 pixels.
- Way one against MobileSAM as it is: better, the line is brought from far in the sky down to the tree tops and the sky strip is gone.
- Way one against the recipe: same, the recipe is tighter at B and C and way one at A, and both follow the tree tops in the whole picture.
- Way two against MobileSAM as it is: better, the line is at the tree tops at all three places where MobileSAM's floats 15 to 40 above.
- Way two against the recipe: same, distances near equal and both follow the tree tops.
- Uncertain: the strip of MobileSAM at about 1 to 2 hundredths is near the limit; the edge distances of the recipe and way two lie near 4 to 6 pixels.

## NIR_3742 Water

- Recipe: region Uncertain (the pale blur at the right edge is outlined as a taken region of about 0.7 hundredths, and the beach edge and a line across the water behind the dock hold small pieces). Edge not met: A about 5, B about 10 (line wanders through the boat's canopy), C about 20 (line lies in the water below the dock float).
- MobileSAM as it is: region met (water taken, docks and boats left out; small stray outlines in the trees at the top, each well under one hundredth, many). Edge not met: A about 30 (loops on the gravel above the shore), B about 15, C about 20.
- Way one: region met (a few small pieces near the shore under one hundredth). Edge not met: A about 100 (a loop lies in the gravel far above the shore), B about 25 (loops in the canopy), C about 35 (line wanders down into the water).
- Way two: region met. Edge not met: A about 8, B about 25, C about 18.
- Way one against MobileSAM as it is: same, the shore at A is worse and the stray outlines in the trees are gone, which pull both ways.
- Way one against the recipe: worse, the blur is gone but the distances at A and C are far larger.
- Way two against MobileSAM as it is: same, A is nearer (8 against 30) and B is farther (25 against 15).
- Way two against the recipe: same, A, B and C are of the same order and both lines miss.
- Uncertain: the blur piece of the recipe at about 0.7 hundredths is near the limit; way two and MobileSAM lie on both sides at A and B so those two words pull both ways.

## NIR_3742 Built things

- Recipe: region not met (wide bands of beach and shore tinted taken, about 8 hundredths or more, and treetop clusters). Edge not met: A far in foliage (more than 100), B on the beach (more than 100), C about 20.
- MobileSAM as it is: region Uncertain (docks and boats taken; a patch on the tall tree at about 0.7 hundredths). Edge Uncertain: A about 8, B about 4, C about 5 pixels.
- Way one: region not met (the tall conifer by the shore taken in part, about 3 hundredths, and treetop clusters). Edge not met: A in foliage with no built thing near (more than 100), B about 4, C about 5 to 10.
- Way two: region not met (same conifer taken, about 3 hundredths). Edge not met: A in foliage (more than 100), B about 5, C about 8.
- Way one against MobileSAM as it is: worse, a conifer of about 3 hundredths is taken and A lies in foliage; nothing is gained on the docks.
- Way one against the recipe: better, the recipe's bands of about 8 hundredths are gone and the edges at B and C are near the docks.
- Way two against MobileSAM as it is: worse, the same reason.
- Way two against the recipe: better, the same reason.
- Uncertain: the tree patch of MobileSAM at about 0.7 hundredths is near the limit, and its edge distances lie at 4 to 8.

## NIR_3742 Foliage

- Recipe: region Uncertain (two loops of water taken, each about 1 hundredth, plus small dock pieces; the blur is correctly left out). Edge not met: A about 5, B about 10, C in the water around a boat, far from any foliage edge (more than 100).
- MobileSAM as it is: region not met (the lower half of the tall conifer on the shore left out, about 2.5 hundredths). Edge not met: A about 35 (a line in open sky), B about 6, C about 30.
- Way one: region met (the conifer base is taken; small water loops about 0.5 hundredths each). Edge not met: A about 5, B about 30 (in the dark forest floor), C about 10.
- Way two: region Uncertain (water loops of about 1.7 and 0.7 hundredths near the docks). Edge not met: A about 4, B about 25, C more than 100 (the line wraps a boat).
- Way one against MobileSAM as it is: better, the conifer base is back and A is on the tree tops.
- Way one against the recipe: better, the water loops are smaller and C is near foliage.
- Way two against MobileSAM as it is: better, A is on the tree tops and the conifer is back, though its water loops are larger.
- Way two against the recipe: same, the water loops are of like size and C is far in both.
- Uncertain: the water loops of the recipe and way two lie near one hundredth; A of way two lies near 4 pixels.

## NIR_3705 Sky

- Recipe: region met. Edge not met: A about 8, B about 20 to 30 (line above the foliage), C about 6.
- MobileSAM as it is: region met. Edge not met: A about 20, B about 30, C about 15.
- Way one: region met. Edge not met: A about 15 to 30, B about 30, C about 50 (line in open sky beside branches).
- Way two: region met. Edge not met: A about 10 to 15, B about 20, C about 10.
- Way one against MobileSAM as it is: same, distances of like size, tighter at A and looser at C.
- Way one against the recipe: worse, the recipe is 8, 25 and 6 where way one is 20, 30 and 50.
- Way two against MobileSAM as it is: better, nearer at all three places.
- Way two against the recipe: same, nearer at C and A of the recipe, farther at neither by much; the two pull both ways.
- Uncertain: the recipe's A is near 8 pixels; the words for way two pull gently both ways.

## NIR_3705 Foliage

- Recipe: region Uncertain (the lower part of the right tower about 1.5 and the dark crown of the left tower about 1 hundredth taken as foliage, with small pieces at the foot). Edge not met: A in the left tower's crown, about 30 or more from foliage; B about 5; C about 4.
- MobileSAM as it is: region met (a tooth by the left tower under one hundredth). Edge not met: A about 10, B about 20, C at the frame's bottom border, within 4.
- Way one: region met. Edge not met: A about 40 or more (line on tower branches), B about 15, C about 30.
- Way two: region met. Edge Uncertain: A about 5, B about 6, C about 8 pixels.
- Way one against MobileSAM as it is: worse, A and C lie farther in the tower branches and nothing pulls the other way as much.
- Way one against the recipe: better, the wrongly taken tower parts are gone.
- Way two against MobileSAM as it is: better, A and B are nearer the bush tops.
- Way two against the recipe: better, the tower parts are gone and A is on the bush top.
- Uncertain: the recipe's tower pieces are near one hundredth; way two's distances lie at 5 to 8 pixels near the limit.

## NIR_3705 Built things

- Recipe: region Uncertain (bands in the sky about 0.9 hundredths and many pieces in the bushes each about 0.5 to 1, many pieces). Edge not met: A about 15, B about 7, C about 40 in the bushes.
- MobileSAM as it is: region met. Edge not met: A about 20 to 30, B about 15, C about 20.
- Way one: region met. Edge not met: A about 15 to 20, B about 8, C about 20.
- Way two: region met. Edge not met: A about 5, B about 15, C about 15.
- Way one against MobileSAM as it is: same, nearer at A and B, no change at C.
- Way one against the recipe: better, the strays are gone and C is nearer.
- Way two against MobileSAM as it is: same, nearer at A and equal at B and C.
- Way two against the recipe: better, the strays are gone and C is nearer.
- Uncertain: the recipe's stray pieces lie near one hundredth each; the words for way one and way two against MobileSAM pull both ways.

## NIR_3710 Sky

- Recipe: region met (an oval pocket of sky left out of about 0.45 hundredths). Edge not met: A about 80 (the oval lies in open sky), B about 5, C about 6.
- MobileSAM as it is: region met. Edge not met: A about 25, B about 30, C about 30.
- Way one: region met. Edge not met: A about 6, B about 20, C about 20.
- Way two: region met. Edge not met: A about 8, B about 20, C about 6.
- Way one against MobileSAM as it is: better, nearer at all three places.
- Way one against the recipe: same, the recipe is far at A and tight at B and C; the two pull both ways.
- Way two against MobileSAM as it is: better, nearer at all three places.
- Way two against the recipe: same, for the same reason.
- Uncertain: the words for way one and way two against the recipe pull both ways; way two's A and C lie at 6 to 8 pixels.

## NIR_3710 Foliage

- Recipe: region not met (the rocky bank with the fence, about 20 hundredths, taken in part as foliage in many pieces). Edge not met: A about 15, B about 20, C about 25.
- MobileSAM as it is: region met (towers left out, bank left out). Edge not met: A about 10, B about 25, C about 5.
- Way one: region not met (rock patches on the bank taken, about 2 to 3 hundredths each, many pieces). Edge not met: A about 15, B in the rocks, more than 100 from foliage.
- Way two: region not met (rock patches taken, about 2 hundredths each, many pieces). Edge not met: A about 8, B about 15, C in the rocks and fence, far from foliage.
- Way one against MobileSAM as it is: worse, the rock patches are taken and B lies in the rocks.
- Way one against the recipe: better, the pieces are fewer and smaller than the recipe's bank.
- Way two against MobileSAM as it is: worse, the same reason.
- Way two against the recipe: better, the same reason.
- Uncertain: where the rock patches begin, their sizes lie between about 1.5 and 3 hundredths and the distances at A lie near 8 to 15.

## NIR_3710 Built things

- Recipe: region not met (a band across the bushes and the bank, about 11 hundredths, and many pieces in the bushes). Edge not met: A in the bushes, far from a tower edge (more than 50), B in the bushes (more than 50), C in the fence and bushes (more than 50).
- MobileSAM as it is: region met. Edge not met: A about 15, B about 25, C about 20.
- Way one: region met (a spot on the pale tree at the right, about 0.1 hundredths). Edge not met: A about 6, B about 8, C about 10 to 15.
- Way two: region met. Edge not met: A about 4, B about 10, C about 12.
- Way one against MobileSAM as it is: better, nearer at all three places.
- Way one against the recipe: better, the recipe's bands are gone.
- Way two against MobileSAM as it is: better, nearer at all three places.
- Way two against the recipe: better, the same reason.
- Uncertain: way one's A and B and way two's A lie at 4 to 8 pixels; the marks hold but the distances are near the limit.

## NIR_1873 Foliage

- Recipe: region not met (the dark tree trunk strip at the left taken, about 8 hundredths, and the foreground pine left out in part, about 3 hundredths). Edge not met: A about 20, B about 40, C about 20.
- MobileSAM as it is: region not met (the foreground pine over the water at the lower right left out, about 14 hundredths). Edge not met: A about 5, B about 25, C about 5 to 10.
- Way one: region not met (the foreground pine left out, about 8 hundredths). Edge not met: A about 15, B about 30, C about 15.
- Way two: region not met (the foreground pine left out, about 8 hundredths). Edge not met: A about 15, B about 25, C about 20.
- Way one against MobileSAM as it is: same, less is left out but the edges are farther at A and C; the two pull both ways.
- Way one against the recipe: better, the trunk strip is out and less of the pine is left.
- Way two against MobileSAM as it is: same, for the same reason.
- Way two against the recipe: better, for the same reason.
- Uncertain: whether the dark trunks are foliage; they were read as not foliage. The words against MobileSAM pull both ways.

## NIR_1873 Water

- Recipe: region not met (the dark tree trunk strip at the left tinted taken, about 3 hundredths, and pine needles at the lower right taken, about 8 hundredths). Edge not met: A about 40, B about 15, C about 20.
- MobileSAM as it is: region Uncertain (the water behind the pine at the lower right left out, about 2 to 4 hundredths; it is not clear how much of that is water). Edge not met: A about 10, B about 10, C within 4 (at the frame's bottom border and tight round a stump).
- Way one: region Uncertain (the same area, about 3 hundredths). Edge not met: A about 20, B about 30, C about 15.
- Way two: region Uncertain (the same area, about 3 hundredths). Edge not met: A about 25, B about 30, C about 4.
- Way one against MobileSAM as it is: worse, the shore and trunk edges are farther and the region is no nearer.
- Way one against the recipe: better, the trunk strip and the pine are no longer taken.
- Way two against MobileSAM as it is: worse, A and B are farther.
- Way two against the recipe: better, the trunk strip and the pine are no longer taken.
- Uncertain: how much of the lower right is water behind the needles; the region marks of the three model masks rest on it.

## Counts

Counted this way and no other: a clause counts as met only where its mark is plain; a clause marked Uncertain is counted apart, in neither met nor not met. Over 12 frame-subjects.

- Recipe: region clause met on 3, Uncertain on 4; edge clause met on 0, Uncertain on 1; both met plainly on 0.
- MobileSAM as it is: region clause met on 7, Uncertain on 3; edge clause met on 0, Uncertain on 1; both met plainly on 0.
- Way one: region clause met on 9, Uncertain on 1; edge clause met on 0, Uncertain on 0; both met plainly on 0.
- Way two: region clause met on 7, Uncertain on 2; edge clause met on 0, Uncertain on 2; both met plainly on 0.

Words, over 12 frame-subjects:

- Way one against MobileSAM as it is: better 4, same 4, worse 4, broken 0.
- Way one against the recipe: better 8, same 2, worse 2, broken 0.
- Way two against MobileSAM as it is: better 6, same 3, worse 3, broken 0.
- Way two against the recipe: better 7, same 5, worse 0, broken 0.

## What this judgement cannot show

- Distances are read by eye from crops at three places along each mask's own edge. The places differ for each mask, so the same frame-subject is not compared at the same places between masks, and an edge that fails elsewhere is not seen.
- The region sizes are eyed against the white square on panels about 5.5 frame pixels to a panel pixel; a size near one hundredth cannot be settled by the panels, which is why several marks are Uncertain.
- Where the thing is not plain (dark trunks on NIR_1873, a hillside on NIR_3742, towers on NIR_3705 and NIR_3710, water under needles) the reading used is stated and another reading would move marks.
- The pictures are the processor's mirror of the photograph as it opens; the device's pixels may differ and no place does.
- Whether the stage would help a person editing is not shown; only how near the lines lie to the things' edges at three places and how large the wrong regions are.
