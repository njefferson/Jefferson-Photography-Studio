# Judgement of the cue edge step: NIR_3461, NIR_3466, NIR_1827 and NIR_1651

Both pictures of each of the ten frame-subjects were opened from the index, the whole picture and the edges picture. No report, note, earlier judgement or progress file was read. Every mark is read from the opened pictures alone. The figures printed in the titles were not used.

## How the bar was read

- One hundredth of the frame is the white square on each mask panel, about 44 panel pixels across. One 240 by 240 crop is about one hundredth of the frame, so a stray piece that fills a tenth of a crop is about a tenth of a hundredth.
- Region clause: met where no connected region wrongly taken, and none wrongly left, is larger than one hundredth. Sizes are by eye against the square.
- Edge clause: met where the line lies within 4 pixels of the thing's own edge at each of A, B and C, read against the white L. Where a line lies where the thing has no edge, the distance to the nearest edge of the thing is given. A line that runs along the frame's own border is given as 0.
- Distances are read by eye from crops at the frame's own size and are good to a few pixels. A distance of 5 to 8 is written as a distance and, where it decides the clause, as Uncertain.
- A tower of open lattice (the pylons in NIR_3461 and NIR_3466) is read this way: the sky seen through it is sky, and its members are thin structures. Where a mark depends on whether the silhouette or the members are the thing, it is written Uncertain.

## NIR_3461 Sky

- Recipe: region Uncertain (see below); edge not met, A about 3, B about 3, C about 8 (the line runs about 8 pixels above the tree and ridge line).
- MobileSAM as it is: region not met, wrongly left: a halo round each of three faint far pylons, each about 1.5 to 2 hundredths, and a halo round the right pylon of about 1.5; edge not met, A about 30, B about 25, C about 50 (the line stands in open sky off the pylon).
- Way one: region Uncertain (see below); edge not met, A about 15 to 30 (the line wraps the arm of the pylon at a distance), B about 100 (the line is a loop round a cloud band, in open sky), C about 12.
- Way two: region Uncertain (see below); edge not met, A about 20, B about 15 at the cables and about 100 at the cloud band loop, C about 10.
- Way one against MobileSAM as it is: better, the halos shrink from 25 to 50 pixels to 10 to 30 and the far pylons are cut nearer their own shape; the added stray cable pieces are each small.
- Way one against the recipe: worse, the recipe's line lies on the tower members at about 3 at A and B where way one's is 12 to 30 off, and way one leaves the whole left tower out.
- Way two against MobileSAM as it is: better, for the same reason as way one.
- Way two against the recipe: worse, for the same reason as way one.
- Uncertain: the region clause of the recipe, way one and way two rests on the left tower. Taken as members only, the recipe's wrong taking is a connected lattice of about 1 to 2 hundredths (near the limit); taken as a silhouette, way one and way two leave out about 5 hundredths of sky seen through it. Way two also has a ragged piece at the right edge of about 1 hundredth that cannot be told as taken or left.

## NIR_3461 Foliage

- Recipe: region met (a speck ring in the cloud of about 0.1 and the tower leg are the only wrong pieces); edge not met, A is a speck of foliage taken inside the pylon, where the thing has no edge, about 500 from the field's edge, B about 4, C about 4.
- MobileSAM as it is: region met (the gaps at the tower legs are about 0.4 each); edge not met, A about 3, B about 25 (a loop round the tower in the open field), C 0 (the line is the frame's bottom border).
- Way one: region met (small specks along the ridge, each about 0.1); edge not met, A about 12, B about 5 with loops in the ridge, C about 10 (a loop along the tower leg).
- Way two: region met; edge not met, A about 12, B about 6 with loops, C about 10.
- Way one against MobileSAM as it is: same, the line moves to the ridge top and loses the tower-leg loop, and gains ragged specks; the differences pull both ways.
- Way one against the recipe: same, the recipe's only fail is a speck at A and its other places are about 4, where way one is ragged at 5 to 12; the differences pull both ways.
- Way two against MobileSAM as it is: same, for the same reason.
- Way two against the recipe: same, for the same reason.
- Uncertain: B for the recipe, way one and way two is at 4 to 6. Whether the dark ridge band between the bright field and the sky is foliage is not told from the picture; the marks at A and B for MobileSAM as it is (line at the bright field's top, about 3) and the others (line at the ridge top) would move by the band's height, about 20 to 70.

## NIR_3461 Built things

- Recipe: region not met, wrongly taken: the dark cloud bands across the upper half of the frame, several pieces of 5 or more hundredths each, about 30 in all; edge not met, A about 1000 (in cloud), B about 800 (in cloud), C about 20 (the line runs along the horizon through the pylon).
- MobileSAM as it is: region not met, wrongly taken: a halo round each of the faint far pylons, about 1.5 each; edge not met, A about 25, B about 4, C about 20 (loops inside the left tower).
- Way one: region not met, wrongly taken: sky above and left of the left tower about 1.2 hundredths and a cloud tongue at the right about 1.2; wrongly left: the faint far pylons mostly, about 0.5 to 1 each, and the right pylon broken into pieces; edge not met, A about 50 (in open sky), B about 80 (a loop in sky), C about 60 (in the tree line, away from any pylon).
- Way two: region not met, wrongly taken: sky at the upper left of the left tower about 1.5 and a cloud tongue at the right about 1; wrongly left: the far pylons and holes in the right pylon; edge not met, A about 60, B about 80 (a loop in sky; about 30 to the nearest pylon top), C about 25.
- Way one against MobileSAM as it is: worse, MobileSAM hugs the right pylon at about 4 and has no sky blobs, where way one adds sky blobs, drops the far pylons and breaks the right pylon.
- Way one against the recipe: better, the recipe takes about 30 hundredths of cloud as built.
- Way two against MobileSAM as it is: worse, for the same reason as way one.
- Way two against the recipe: better, for the same reason as way one.
- Uncertain: the pieces of way two near one hundredth (the tongue at the right) are each near the limit; the clause is marked not met on the named piece of about 1.5.

## NIR_3466 Sky

- Recipe: region not met, wrongly left: a bright cloud patch above the building of about 4 hundredths and a cloud band beside the roof of about 1; edge not met, A about 250 (the line is a cloud outline in open sky), B about 30 to 50 above the roof at the left, C about 8.
- MobileSAM as it is: region met (the line is smooth and no wrong piece is over about 0.3); edge not met, A about 8 at the antenna masts, B about 30 to 40 above the roof, C about 40 above the horizon.
- Way one: region met; edge not met, A about 4 (Uncertain, see below), B about 20, C about 10 to 30.
- Way two: region met; edge not met, A about 4 (Uncertain, see below), B about 20, C about 10.
- Way one against MobileSAM as it is: better, the line comes down from 30 to 40 above the roof and the horizon to 5 to 30 with the region unchanged.
- Way one against the recipe: better, the recipe leaves out about 4 hundredths of cloud and stands 30 to 50 off at B.
- Way two against MobileSAM as it is: better, for the same reason as way one.
- Way two against the recipe: better, for the same reason as way one.
- Uncertain: A for way one and way two lies at about 4. The clause is not met anyway at B and C.

## NIR_3466 Built things

- Recipe: region not met, wrongly taken: the cloud above the building about 4.5 hundredths; the road strip at the bottom about 7 hundredths is also taken (see Uncertain); edge Uncertain, A about 2, B about 2 (on a fence post), C about 3 along the road and curb edge (see Uncertain).
- MobileSAM as it is: region Uncertain (see below); edge Uncertain, A about 3, B about 3, C about 5 to 6 along the gantry and shed tops.
- Way one: region Uncertain (see below); edge not met, A about 15 to 25 (the line wanders round the antenna panels), B about 4 round the tower frame with loops inside the wall of about 20, C about 40 to 60 (a line in the grass, where there is no edge).
- Way two: region Uncertain (see below); edge not met, A about 10 to 25, B about 4, C about 5 to 10.
- Way one against MobileSAM as it is: worse, MobileSAM's line lies at 3 to 6 where way one's is 15 to 60 off and the line is broken into pieces, with strays in the grass of about 0.3 each.
- Way one against the recipe: same, the recipe's edges are nearer (2 to 3) while its region is worse by about 4.5 hundredths of cloud taken; the differences pull both ways.
- Way two against MobileSAM as it is: worse, for the same reason as way one.
- Way two against the recipe: same, for the same reason as way one.
- Uncertain: whether the road counts as a built thing is not told from the picture; it is about 7 hundredths and decides the region clause for MobileSAM as it is, way one and way two (left out), and the edge at C for the recipe. The far-left low buildings left out by MobileSAM as it is are about 1 hundredth, at the limit. MobileSAM's C at 5 to 6 is near 4.

## NIR_3466 Foliage

- Recipe: region Uncertain (see below); edge not met, A about 10 to 20 (the line wanders up into the building base), B about 3 with small loops on the road, C about 130 (lines on the curb and road, where the field has no edge).
- MobileSAM as it is: region met (about a dozen thin gaps at fence posts, each far under 0.1); edge Uncertain, A about 3, B about 3, C about 4.
- Way one: region met (more thin gaps at posts, each small); edge Uncertain, A about 6 along the vehicle bases, B about 4, C about 4.
- Way two: region met (more thin gaps, small loops in the grass, each small); edge Uncertain, A about 5, B about 6 round the posts with a stray loop, C about 4.
- Way one against MobileSAM as it is: same, the lines are alike and the differences are a few pixels either way.
- Way one against the recipe: better, the recipe's edge is 10 to 130 off at A and C where way one's is 4 to 6.
- Way two against MobileSAM as it is: worse, more thin pieces, a few loops and bumps at the building base, and the line wider round the posts.
- Way two against the recipe: better, for the same reason as way one.
- Uncertain: every edge mark here lies at 3 to 6. Way two against MobileSAM as it is is a small difference. The recipe's region has pale loops on the road at the bottom of about 3 hundredths with the tint seen only faintly, which could not be told as taken or not.

## NIR_1827 Sky

- Recipe: region met (the line is at the tree line; no wrong piece over about 0.3); edge not met, A about 5 (Uncertain), B about 8, C about 15 (at a spindly dead tree).
- MobileSAM as it is: region met (the sky wedges left out between trees are each about 0.3 or under); edge not met, A about 25, B about 45, C about 45.
- Way one: region met; edge not met, A about 5, B about 6, C about 10.
- Way two: region met (one stray piece in the cloud under 0.1); edge not met, A about 6, B about 12, C about 15.
- Way one against MobileSAM as it is: better, the line comes in from 25 to 45 off to 5 to 10.
- Way one against the recipe: same, the distances are alike (5, 6, 10 against 5, 8, 15).
- Way two against MobileSAM as it is: better, from 25 to 45 off to 6 to 15.
- Way two against the recipe: same, the distances are alike.
- Uncertain: the distances of 5 and 6 at A and B for the recipe and way one lie near 4; the clause is not met on the plain larger ones at C.

## NIR_1827 Foliage

- Recipe: region met (faint cloud tint at the upper right is below a half); edge not met, A about 8 (a bulge of about 10 to 15 into the sky), B about 5, C about 10 to 15 at the dead tree.
- MobileSAM as it is: region met (small clusters at the lower left and right edges about 0.3 each, a ring in the sky under 0.1); edge not met, A about 15, B about 40, C about 100 (a vertical line inside the foliage, where the thing has no edge).
- Way one: region met (a ragged cluster at the left edge about 0.5); edge Uncertain, A about 6, B about 6, C about 6.
- Way two: region met; edge not met, A about 5, B about 8, C about 10.
- Way one against MobileSAM as it is: better, from 15 to 100 off to about 6.
- Way one against the recipe: same, the distances are alike.
- Way two against MobileSAM as it is: better, from 15 to 100 off to 5 to 10.
- Way two against the recipe: same, the distances are alike.
- Uncertain: way one's three distances of about 6 are above 4 but within the error of the eye, so its edge clause is not given a plain mark.

## NIR_1651 Foliage

- Recipe: region met (lobe and holes under 0.3); edge Uncertain, A about 3, B about 5, C about 4.
- MobileSAM as it is: region met (smooth line, the gaps between the branches taken or left are each under 0.5); edge not met, A about 25, B about 30, C about 60 (a loop through the sky gap).
- Way one: region met (small holes under 0.1); edge not met, A about 6, B about 25 (a loop of foliage in the sky gap), C about 8.
- Way two: region met; edge not met, A about 4, B about 25 (a loop of foliage in the sky gap), C about 10 to 15.
- Way one against MobileSAM as it is: better, the line comes in from 25 to 60 off to about 6 to 8, with the B loop the one place left far.
- Way one against the recipe: worse, the recipe's line is at 3 to 5 at all three places where way one has a loop at 25 at B and is farther at A and C.
- Way two against MobileSAM as it is: better, for the same reason as way one.
- Way two against the recipe: worse, the loop at B and the farther line at C.
- Uncertain: the recipe's edge lies at 3 to 5 at the three places, near 4; the clause is not given a plain mark.

## NIR_1651 Sky

- Recipe: region met (small rings in the foliage under 0.1); edge Uncertain, A about 3, B about 5, C about 4.
- MobileSAM as it is: region met (a small foliage corner at the lower left under 0.2); edge not met, A about 20, B about 30, C 0 (the frame's bottom border).
- Way one: region met; edge not met, A about 8, B about 25 (a bay in the gap between branches), C about 8 to 15.
- Way two: region met; edge Uncertain, A about 7, B about 5, C about 8.
- Way one against MobileSAM as it is: better, from 20 to 30 off to 8 at A and from 30 to 25 at B, with the region unchanged; the line at C is farther than the frame border, which is not an edge.
- Way one against the recipe: worse, the recipe stands at 3 to 5 and way one at 8 to 25.
- Way two against MobileSAM as it is: better, from 20 to 30 off to 5 to 8.
- Way two against the recipe: worse, the recipe stands at 3 to 5 and way two at 5 to 8, nothing seen the other way.
- Uncertain: way two against the recipe is a small difference of 2 to 4 pixels at each place; the word worse is written with that in view. Way two's edge distances of 5 to 8 are above 4 but within the error of the eye.

## Foot: counts

Counted so: a clause counts as met only where its mark is plain; a clause marked Uncertain is counted apart, in neither met nor not met. Over the 10 frame-subjects.

The recipe:
- Region clause met on 5, Uncertain on 2.
- Edge clause met on 0, Uncertain on 3.
- Both met plainly on 0: none.

MobileSAM as it is:
- Region clause met on 7, Uncertain on 1.
- Edge clause met on 0, Uncertain on 2.
- Both met plainly on 0: none.

Way one, the stage fitted on every sure pixel:
- Region clause met on 7, Uncertain on 2.
- Edge clause met on 0, Uncertain on 2.
- Both met plainly on 0: none.

Way two, the stage fitted on sure pixels near the edge:
- Region clause met on 7, Uncertain on 2.
- Edge clause met on 0, Uncertain on 2.
- Both met plainly on 0: none.

Words for each way, over the 10 frame-subjects:
- Way one against MobileSAM as it is: better on 6, same on 2, worse on 2, broken on 0.
- Way one against the recipe: better on 3, same on 4, worse on 3, broken on 0.
- Way two against MobileSAM as it is: better on 6, same on 1, worse on 3, broken on 0.
- Way two against the recipe: better on 3, same on 4, worse on 3, broken on 0.

The words, one line for each frame-subject, in the order way one against MobileSAM, way one against the recipe, way two against MobileSAM, way two against the recipe:
- NIR_3461 Sky: better, worse, better, worse.
- NIR_3461 Foliage: same, same, same, same.
- NIR_3461 Built things: worse, better, worse, better.
- NIR_3466 Sky: better, better, better, better.
- NIR_3466 Built things: worse, same, worse, same.
- NIR_3466 Foliage: same, better, worse, better.
- NIR_1827 Sky: better, same, better, same.
- NIR_1827 Foliage: better, same, better, same.
- NIR_1651 Foliage: better, worse, better, worse.
- NIR_1651 Sky: better, worse, better, worse.

## What this judgement cannot show

- A distance read by eye from a crop is good to a few pixels, so a line at 4 to 8 is not told from one at 4. That is why most of the closer lines are written Uncertain or not met on a larger place elsewhere, and why no mask is marked met on the edge clause. Three places along one edge say nothing of the places not looked at.
- The marks depend on what counts as the thing in three places: the open-lattice pylons, the dark ridge band beside the field in NIR_3461, and the road in NIR_3466. The pictures do not decide these, and the Uncertain lines name each.
- The pictures are the processor's mirror of the photograph as it opens, drawn in the container. They are not the device's own picture, and no mark here stands for how the mask looks on the device.
- Only 10 of the 22 frame-subjects were judged here, from four frames of the eight, and only the mask cut at a half. Thin pieces were sized as a whole where connected and each on its own where stray; where many small pieces lay in one mask (the cable dashes in NIR_3461 sky, the post slivers in NIR_3466 foliage), each was under a tenth of a hundredth and none was taken alone as a failure.
- The words compare two masks of one subject by the larger visible differences. Where a difference is a few pixels the word is written with the difference named.
