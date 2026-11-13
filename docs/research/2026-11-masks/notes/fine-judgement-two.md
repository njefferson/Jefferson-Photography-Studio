# Fine-read judgement two: 22 frame-subjects, four masks each

Each of the 22 whole pictures and 22 magnified pictures was opened once, from the last frame-subject of the index to the first, before anything else was read. Regions are read from the whole pictures against the white square (one hundredth of the frame); places are read from the banded crops (line yellow and solid, band borders blue and dashed, 12 display pixels, four frame pixels, either side). Titled figures were not used. Distances are estimates by eye.

## NIR_1827 Sky

Recipe: sky taken, trees left; no region over a hundredth wrong. A, B and C each follow the tree edge inside the band.
MARK NIR_1827 | Sky | recipe | region | met
PLACE NIR_1827 | Sky | recipe | A | in
PLACE NIR_1827 | Sky | recipe | B | in
PLACE NIR_1827 | Sky | recipe | C | in
MARK NIR_1827 | Sky | recipe | edge | met

MobileSAM: sky and trees split well. At A the line makes an arc in white open sky about 8 to 10 frame pixels outside a faint tree crown; at B the U between two trees follows both edges; at C the line runs in open sky about 12 frame pixels left of the tree.
MARK NIR_1827 | Sky | mobilesam | region | met
PLACE NIR_1827 | Sky | mobilesam | A | out
PLACE NIR_1827 | Sky | mobilesam | B | in
PLACE NIR_1827 | Sky | mobilesam | C | out
MARK NIR_1827 | Sky | mobilesam | edge | not met

Way one: regions right; the line follows the tree edge at A, around the trunk top at B and in the V at C.
MARK NIR_1827 | Sky | way one | region | met
PLACE NIR_1827 | Sky | way one | A | in
PLACE NIR_1827 | Sky | way one | B | in
PLACE NIR_1827 | Sky | way one | C | in
MARK NIR_1827 | Sky | way one | edge | met

Way two: regions right (two tiny dashes in sky, far under a hundredth); all three places follow the tree edge.
MARK NIR_1827 | Sky | way two | region | met
PLACE NIR_1827 | Sky | way two | A | in
PLACE NIR_1827 | Sky | way two | B | in
PLACE NIR_1827 | Sky | way two | C | in
MARK NIR_1827 | Sky | way two | edge | met

## NIR_1827 Foliage

Recipe: the tree band taken cleanly; faint pink in the upper-right cloud is under a half. All three places on the tree edge.
MARK NIR_1827 | Foliage | recipe | region | met
PLACE NIR_1827 | Foliage | recipe | A | in
PLACE NIR_1827 | Foliage | recipe | B | in
PLACE NIR_1827 | Foliage | recipe | C | in
MARK NIR_1827 | Foliage | recipe | edge | met

MobileSAM: trees taken; the left sliver is ragged but small. A and B on the tree edge; C lies on the frame's bottom edge in dark foliage where the thing has no edge.
MARK NIR_1827 | Foliage | mobilesam | region | met
PLACE NIR_1827 | Foliage | mobilesam | A | in
PLACE NIR_1827 | Foliage | mobilesam | B | in
PLACE NIR_1827 | Foliage | mobilesam | C | out
MARK NIR_1827 | Foliage | mobilesam | edge | not met

Way one: trees taken. A follows the twig edge; B has a loop inside the dark tree interior with no edge; C follows the tree edge.
MARK NIR_1827 | Foliage | way one | region | met
PLACE NIR_1827 | Foliage | way one | A | in
PLACE NIR_1827 | Foliage | way one | B | out
PLACE NIR_1827 | Foliage | way one | C | in
MARK NIR_1827 | Foliage | way one | edge | not met

Way two: trees taken; the three places follow the tree edge, including the branch gap.
MARK NIR_1827 | Foliage | way two | region | met
PLACE NIR_1827 | Foliage | way two | A | in
PLACE NIR_1827 | Foliage | way two | B | in
PLACE NIR_1827 | Foliage | way two | C | in
MARK NIR_1827 | Foliage | way two | edge | met

## NIR_3742 Sky

Recipe: sky above the forest taken, the pale blur not taken; A, B and C on the tree tops and the hill line.
MARK NIR_3742 | Sky | recipe | region | met
PLACE NIR_3742 | Sky | recipe | A | in
PLACE NIR_3742 | Sky | recipe | B | in
PLACE NIR_3742 | Sky | recipe | C | in
MARK NIR_3742 | Sky | recipe | edge | met

MobileSAM: regions right. A and C on the edge. At B the line runs in sky above the tree tips, about 8 frame pixels off, and cuts the left tip.
MARK NIR_3742 | Sky | mobilesam | region | met
PLACE NIR_3742 | Sky | mobilesam | A | in
PLACE NIR_3742 | Sky | mobilesam | B | out
PLACE NIR_3742 | Sky | mobilesam | C | in
MARK NIR_3742 | Sky | mobilesam | edge | not met

Way one: regions right; all three places on the tree tops.
MARK NIR_3742 | Sky | way one | region | met
PLACE NIR_3742 | Sky | way one | A | in
PLACE NIR_3742 | Sky | way one | B | in
PLACE NIR_3742 | Sky | way one | C | in
MARK NIR_3742 | Sky | way one | edge | met

Way two: regions right; all three on the tree edge.
MARK NIR_3742 | Sky | way two | region | met
PLACE NIR_3742 | Sky | way two | A | in
PLACE NIR_3742 | Sky | way two | B | in
PLACE NIR_3742 | Sky | way two | C | in
MARK NIR_3742 | Sky | way two | edge | met

## NIR_3742 Water

Recipe: water taken with the dock left out; at the right edge a patch of the pale blur is outlined, about one hundredth, so whether it is wrongly taken cannot be settled. A lies in water about 12 to 15 frame pixels below the shore line; B on the canopy top; C on the float reflection.
MARK NIR_3742 | Water | recipe | region | uncertain
PLACE NIR_3742 | Water | recipe | A | out
PLACE NIR_3742 | Water | recipe | B | in
PLACE NIR_3742 | Water | recipe | C | in
MARK NIR_3742 | Water | recipe | edge | not met

MobileSAM: water taken, dock left out; ragged bits at the shore, each small. A has loops wandering about 14 frame pixels off the shore line; B follows the canopy; C lies in open water with the dock about 20 pixels away.
MARK NIR_3742 | Water | mobilesam | region | met
PLACE NIR_3742 | Water | mobilesam | A | out
PLACE NIR_3742 | Water | mobilesam | B | in
PLACE NIR_3742 | Water | mobilesam | C | out
MARK NIR_3742 | Water | mobilesam | edge | not met

Way one: water taken, dock left out. A loop lies in the pale gravel about 8 to 10 pixels above the shore line; B follows the canopy; C is in open water.
MARK NIR_3742 | Water | way one | region | met
PLACE NIR_3742 | Water | way one | A | out
PLACE NIR_3742 | Water | way one | B | in
PLACE NIR_3742 | Water | way one | C | out
MARK NIR_3742 | Water | way one | edge | not met

Way two: water taken, dock left out. A runs 10 to 20 pixels from the shore line; B on the canopy; C near the float edge.
MARK NIR_3742 | Water | way two | region | met
PLACE NIR_3742 | Water | way two | A | out
PLACE NIR_3742 | Water | way two | B | in
PLACE NIR_3742 | Water | way two | C | in
MARK NIR_3742 | Water | way two | edge | not met

## NIR_3742 Built things

Recipe: bands of shore, water and forest tops taken, many hundredths wrong (the band across the shore alone is some ten times the square). A lies in tree tops, B around a bare tree and shrub, C loops inside a canopy.
MARK NIR_3742 | Built things | recipe | region | not met
PLACE NIR_3742 | Built things | recipe | A | out
PLACE NIR_3742 | Built things | recipe | B | out
PLACE NIR_3742 | Built things | recipe | C | out
MARK NIR_3742 | Built things | recipe | edge | not met

MobileSAM: dock and boats taken; a small piece at the island tree's base (under a hundredth). A on the canopy edge. At B and C the line runs along the deck's top edge while the dark dock side lies below it, about 5 to 20 frame pixels from the line.
MARK NIR_3742 | Built things | mobilesam | region | met
PLACE NIR_3742 | Built things | mobilesam | A | in
PLACE NIR_3742 | Built things | mobilesam | B | out
PLACE NIR_3742 | Built things | mobilesam | C | out
MARK NIR_3742 | Built things | mobilesam | edge | not met

Way one: dock taken but the island tree is also taken (about three to five hundredths) with tree tips. A lies in foliage; B and C run along the deck's top edge, the dark side below it left out.
MARK NIR_3742 | Built things | way one | region | not met
PLACE NIR_3742 | Built things | way one | A | out
PLACE NIR_3742 | Built things | way one | B | out
PLACE NIR_3742 | Built things | way one | C | out
MARK NIR_3742 | Built things | way one | edge | not met

Way two: the same island tree taken (about three to five hundredths). A in foliage, B and C along the deck top with the dark side left.
MARK NIR_3742 | Built things | way two | region | not met
PLACE NIR_3742 | Built things | way two | A | out
PLACE NIR_3742 | Built things | way two | B | out
PLACE NIR_3742 | Built things | way two | C | out
MARK NIR_3742 | Built things | way two | edge | not met

## NIR_3742 Foliage

Recipe: forest taken; two or three outlined patches over the dock, each about one hundredth, so whether they are over the line cannot be settled. A on the tree edge; B in dark forest where forest and meadow cannot be told in the crop; C around a boat canopy, not foliage.
MARK NIR_3742 | Foliage | recipe | region | uncertain
PLACE NIR_3742 | Foliage | recipe | A | in
PLACE NIR_3742 | Foliage | recipe | B | uncertain
PLACE NIR_3742 | Foliage | recipe | C | out
MARK NIR_3742 | Foliage | recipe | edge | not met

MobileSAM: the bright island tree is left out (about three hundredths wrongly left). A and B follow the bright foliage edge; C lies in a dark crop where forest and ground cannot be told.
MARK NIR_3742 | Foliage | mobilesam | region | not met
PLACE NIR_3742 | Foliage | mobilesam | A | in
PLACE NIR_3742 | Foliage | mobilesam | B | in
PLACE NIR_3742 | Foliage | mobilesam | C | uncertain
MARK NIR_3742 | Foliage | mobilesam | edge | uncertain

Way one: forest and island tree taken; small blobs over the dock under or near a hundredth each, whose pink cannot be told, are left aside. A loops round a sky gap; B a sliver in dark forest (what the thing is cannot be told); C at the shore edge.
MARK NIR_3742 | Foliage | way one | region | met
PLACE NIR_3742 | Foliage | way one | A | in
PLACE NIR_3742 | Foliage | way one | B | uncertain
PLACE NIR_3742 | Foliage | way one | C | in
MARK NIR_3742 | Foliage | way one | edge | uncertain

Way two: forest taken; dock loops about one hundredth each, uncertain whether over the line. A on the tree peak; B dark and untellable; C around a boat canopy.
MARK NIR_3742 | Foliage | way two | region | uncertain
PLACE NIR_3742 | Foliage | way two | A | in
PLACE NIR_3742 | Foliage | way two | B | uncertain
PLACE NIR_3742 | Foliage | way two | C | out
MARK NIR_3742 | Foliage | way two | edge | not met

## NIR_3461 Sky

Recipe: sky taken; the pylon lattice bars left out and the sky between them taken, which is right; a small oval is under a hundredth. All three places on lattice bars or the tree line.
MARK NIR_3461 | Sky | recipe | region | met
PLACE NIR_3461 | Sky | recipe | A | in
PLACE NIR_3461 | Sky | recipe | B | in
PLACE NIR_3461 | Sky | recipe | C | in
MARK NIR_3461 | Sky | recipe | edge | met

MobileSAM: pylons left out as solid silhouettes, so sky between the lattice is left (several hundredths). A on the cross-arm edge; B about 8 frame pixels from the pylon leg; C on the leg edge.
MARK NIR_3461 | Sky | mobilesam | region | not met
PLACE NIR_3461 | Sky | mobilesam | A | in
PLACE NIR_3461 | Sky | mobilesam | B | out
PLACE NIR_3461 | Sky | mobilesam | C | in
MARK NIR_3461 | Sky | mobilesam | edge | not met

Way one: the left pylon lattice interior is left out (about five hundredths). A on the arm; B in open sky about the haze; C on the leg.
MARK NIR_3461 | Sky | way one | region | not met
PLACE NIR_3461 | Sky | way one | A | in
PLACE NIR_3461 | Sky | way one | B | out
PLACE NIR_3461 | Sky | way one | C | in
MARK NIR_3461 | Sky | way one | edge | not met

Way two: the left pylon interior again left out (about five hundredths). A, B (along a cable) and C on the structure.
MARK NIR_3461 | Sky | way two | region | not met
PLACE NIR_3461 | Sky | way two | A | in
PLACE NIR_3461 | Sky | way two | B | in
PLACE NIR_3461 | Sky | way two | C | in
MARK NIR_3461 | Sky | way two | edge | met

## NIR_3461 Foliage

Recipe: the field taken, with its pale halo at the horizon; the region reads right. A is a tiny line among the pylon bars hundreds of pixels from the field; B on the scrub top; C on the pylon leg at the field.
MARK NIR_3461 | Foliage | recipe | region | met
PLACE NIR_3461 | Foliage | recipe | A | out
PLACE NIR_3461 | Foliage | recipe | B | in
PLACE NIR_3461 | Foliage | recipe | C | in
MARK NIR_3461 | Foliage | recipe | edge | not met

MobileSAM: field taken with the pylon legs notched out. A and B on the scrub edge and a fence post; C lies at the frame's bottom edge in open grass.
MARK NIR_3461 | Foliage | mobilesam | region | met
PLACE NIR_3461 | Foliage | mobilesam | A | in
PLACE NIR_3461 | Foliage | mobilesam | B | in
PLACE NIR_3461 | Foliage | mobilesam | C | out
MARK NIR_3461 | Foliage | mobilesam | edge | not met

Way one: field taken. A on the scrub, B around a mound at the scrub edge; C a loop in grass by a pylon leg, with no edge.
MARK NIR_3461 | Foliage | way one | region | met
PLACE NIR_3461 | Foliage | way one | A | in
PLACE NIR_3461 | Foliage | way one | B | in
PLACE NIR_3461 | Foliage | way one | C | out
MARK NIR_3461 | Foliage | way one | edge | not met

Way two: field taken; A on scrub, B at a post base, C along a pylon brace.
MARK NIR_3461 | Foliage | way two | region | met
PLACE NIR_3461 | Foliage | way two | A | in
PLACE NIR_3461 | Foliage | way two | B | in
PLACE NIR_3461 | Foliage | way two | C | in
MARK NIR_3461 | Foliage | way two | edge | met

## NIR_3461 Built things

Recipe: the sky bands are taken (over thirty hundredths) and the pylons left. All three places lie in open sky or across a lattice, far from the thing's edge.
MARK NIR_3461 | Built things | recipe | region | not met
PLACE NIR_3461 | Built things | recipe | A | out
PLACE NIR_3461 | Built things | recipe | B | out
PLACE NIR_3461 | Built things | recipe | C | out
MARK NIR_3461 | Built things | recipe | edge | not met

MobileSAM: pylons taken as filled silhouettes, so sky inside the lattice is wrongly taken (several hundredths). A on the arm edge; B on the leg; C loops in sky between bars.
MARK NIR_3461 | Built things | mobilesam | region | not met
PLACE NIR_3461 | Built things | mobilesam | A | in
PLACE NIR_3461 | Built things | mobilesam | B | in
PLACE NIR_3461 | Built things | mobilesam | C | out
MARK NIR_3461 | Built things | mobilesam | edge | not met

Way one: the left pylon is partly taken and a blob in cloud near the right pylon is wrongly taken (about one to two hundredths); much of the lattice is ragged. A in open sky about 40 pixels from the leg; B along a cable; C around trees at the horizon.
MARK NIR_3461 | Built things | way one | region | not met
PLACE NIR_3461 | Built things | way one | A | out
PLACE NIR_3461 | Built things | way one | B | in
PLACE NIR_3461 | Built things | way one | C | out
MARK NIR_3461 | Built things | way one | edge | not met

Way two: the same ragged pylons and cloud blob. A and C in open sky; B partly in open sky at the top of the crop.
MARK NIR_3461 | Built things | way two | region | not met
PLACE NIR_3461 | Built things | way two | A | out
PLACE NIR_3461 | Built things | way two | B | out
PLACE NIR_3461 | Built things | way two | C | out
MARK NIR_3461 | Built things | way two | edge | not met

## NIR_3466 Sky

Recipe: a cloud (about three to four hundredths) and a wedge by the building are left out of the sky. A loops in open sky round the cloud; B has a loop in sky as well; C runs along the horizon past a vehicle.
MARK NIR_3466 | Sky | recipe | region | not met
PLACE NIR_3466 | Sky | recipe | A | out
PLACE NIR_3466 | Sky | recipe | B | out
PLACE NIR_3466 | Sky | recipe | C | in
MARK NIR_3466 | Sky | recipe | edge | not met

MobileSAM: sky taken, buildings left; region right. A on the roof edge; B about 3 to 4 frame pixels outside the band over the low roof; C lies in open sky about 25 pixels above the roofs.
MARK NIR_3466 | Sky | mobilesam | region | met
PLACE NIR_3466 | Sky | mobilesam | A | in
PLACE NIR_3466 | Sky | mobilesam | B | out
PLACE NIR_3466 | Sky | mobilesam | C | out
MARK NIR_3466 | Sky | mobilesam | edge | not met

Way one: region right. A on the roof edge; B about 15 pixels left of the building corner in sky; C about 6 pixels off the small building.
MARK NIR_3466 | Sky | way one | region | met
PLACE NIR_3466 | Sky | way one | A | in
PLACE NIR_3466 | Sky | way one | B | out
PLACE NIR_3466 | Sky | way one | C | out
MARK NIR_3466 | Sky | way one | edge | not met

Way two: region right; all three along roof and corner edges, the corner and the shed roof at the band's limit.
MARK NIR_3466 | Sky | way two | region | met
PLACE NIR_3466 | Sky | way two | A | in
PLACE NIR_3466 | Sky | way two | B | in
PLACE NIR_3466 | Sky | way two | C | in
MARK NIR_3466 | Sky | way two | edge | met

## NIR_3466 Built things

Recipe: buildings, the road and the fence posts are taken (the road is read as a built thing); a cloud blob (about three to four hundredths) above the building is wrongly taken. A on the wall edge, B on a fence post, C along the road paint edge.
MARK NIR_3466 | Built things | recipe | region | not met
PLACE NIR_3466 | Built things | recipe | A | in
PLACE NIR_3466 | Built things | recipe | B | in
PLACE NIR_3466 | Built things | recipe | C | in
MARK NIR_3466 | Built things | recipe | edge | met

MobileSAM: the two buildings taken; the road (about six hundredths) and the fence are left, and it cannot be told from the picture whether they belong to built things, so the region is uncertain. A, B and C on roof, corner and wall base.
MARK NIR_3466 | Built things | mobilesam | region | uncertain
PLACE NIR_3466 | Built things | mobilesam | A | in
PLACE NIR_3466 | Built things | mobilesam | B | in
PLACE NIR_3466 | Built things | mobilesam | C | in
MARK NIR_3466 | Built things | mobilesam | edge | met

Way one: the same road and fence question, so the region is uncertain. A loops through antenna shadows on the wall, B through a wall and truss, C through grass and shadow.
MARK NIR_3466 | Built things | way one | region | uncertain
PLACE NIR_3466 | Built things | way one | A | out
PLACE NIR_3466 | Built things | way one | B | out
PLACE NIR_3466 | Built things | way one | C | out
MARK NIR_3466 | Built things | way one | edge | not met

Way two: as way one; loops in the wall at A and B, around vehicles at C.
MARK NIR_3466 | Built things | way two | region | uncertain
PLACE NIR_3466 | Built things | way two | A | out
PLACE NIR_3466 | Built things | way two | B | out
PLACE NIR_3466 | Built things | way two | C | out
MARK NIR_3466 | Built things | way two | edge | not met

## NIR_3466 Foliage

Recipe: the field taken, but the road strip at the frame's foot is also taken (about five hundredths). A lies on a building wall, B and C in the open road.
MARK NIR_3466 | Foliage | recipe | region | not met
PLACE NIR_3466 | Foliage | recipe | A | out
PLACE NIR_3466 | Foliage | recipe | B | out
PLACE NIR_3466 | Foliage | recipe | C | out
MARK NIR_3466 | Foliage | recipe | edge | not met

MobileSAM: the field taken, fence-post holes thin and small. A on the fence line, B round a post, C along the field and road edge.
MARK NIR_3466 | Foliage | mobilesam | region | met
PLACE NIR_3466 | Foliage | mobilesam | A | in
PLACE NIR_3466 | Foliage | mobilesam | B | in
PLACE NIR_3466 | Foliage | mobilesam | C | in
MARK NIR_3466 | Foliage | mobilesam | edge | met

Way one: field taken. A loops through vehicles and dark shapes with no field edge; B round a post; C on the road edge.
MARK NIR_3466 | Foliage | way one | region | met
PLACE NIR_3466 | Foliage | way one | A | out
PLACE NIR_3466 | Foliage | way one | B | in
PLACE NIR_3466 | Foliage | way one | C | in
MARK NIR_3466 | Foliage | way one | edge | not met

Way two: field taken; A, B and C on the fence line, post and road edge.
MARK NIR_3466 | Foliage | way two | region | met
PLACE NIR_3466 | Foliage | way two | A | in
PLACE NIR_3466 | Foliage | way two | B | in
PLACE NIR_3466 | Foliage | way two | C | in
MARK NIR_3466 | Foliage | way two | edge | met

## NIR_1651 Foliage

Recipe: the tree taken; a thin pink fringe at the cloud edge is far under a hundredth. All three places follow tufts.
MARK NIR_1651 | Foliage | recipe | region | met
PLACE NIR_1651 | Foliage | recipe | A | in
PLACE NIR_1651 | Foliage | recipe | B | in
PLACE NIR_1651 | Foliage | recipe | C | in
MARK NIR_1651 | Foliage | recipe | edge | met

MobileSAM: the tree taken; region right. A, B and C on the tuft edges, the wispy right edge within the band.
MARK NIR_1651 | Foliage | mobilesam | region | met
PLACE NIR_1651 | Foliage | mobilesam | A | in
PLACE NIR_1651 | Foliage | mobilesam | B | in
PLACE NIR_1651 | Foliage | mobilesam | C | in
MARK NIR_1651 | Foliage | mobilesam | edge | met

Way one: the tree taken; A on a tuft, B round a sky gap inside the foliage, C on a gap edge.
MARK NIR_1651 | Foliage | way one | region | met
PLACE NIR_1651 | Foliage | way one | A | in
PLACE NIR_1651 | Foliage | way one | B | in
PLACE NIR_1651 | Foliage | way one | C | in
MARK NIR_1651 | Foliage | way one | edge | met

Way two: the tree taken. At B the loop lies inside a sky gap, about 3 frame pixels short of its edge; A and C on tufts.
MARK NIR_1651 | Foliage | way two | region | met
PLACE NIR_1651 | Foliage | way two | A | in
PLACE NIR_1651 | Foliage | way two | B | out
PLACE NIR_1651 | Foliage | way two | C | in
MARK NIR_1651 | Foliage | way two | edge | not met

## NIR_1651 Sky

Recipe: the grey sky and the cloud taken, the tree left; faint purple inside the tree is under a half. Places on the tufts and the cloud edge.
MARK NIR_1651 | Sky | recipe | region | met
PLACE NIR_1651 | Sky | recipe | A | in
PLACE NIR_1651 | Sky | recipe | B | in
PLACE NIR_1651 | Sky | recipe | C | in
MARK NIR_1651 | Sky | recipe | edge | met

MobileSAM: sky and cloud taken, with a thin gap between cloud and lower sky that is far under a hundredth. A near the tuft tops; B runs down in open sky past the tuft tip about 20 pixels; C lies on the frame's bottom edge in open sky.
MARK NIR_1651 | Sky | mobilesam | region | met
PLACE NIR_1651 | Sky | mobilesam | A | in
PLACE NIR_1651 | Sky | mobilesam | B | out
PLACE NIR_1651 | Sky | mobilesam | C | out
MARK NIR_1651 | Sky | mobilesam | edge | not met

Way one: region right. A on the tufts; B curves in sky about 15 pixels from the foliage; C on the tuft edge.
MARK NIR_1651 | Sky | way one | region | met
PLACE NIR_1651 | Sky | way one | A | in
PLACE NIR_1651 | Sky | way one | B | out
PLACE NIR_1651 | Sky | way one | C | in
MARK NIR_1651 | Sky | way one | edge | not met

Way two: region right; all three on the tuft and wisp edges.
MARK NIR_1651 | Sky | way two | region | met
PLACE NIR_1651 | Sky | way two | A | in
PLACE NIR_1651 | Sky | way two | B | in
PLACE NIR_1651 | Sky | way two | C | in
MARK NIR_1651 | Sky | way two | edge | met

## NIR_3705 Sky

Recipe: sky taken, towers left; region right. At A the line runs in sky about 10 to 15 pixels from the panel top; at B it runs 3 to 6 pixels off the sprigs; C on the foliage top.
MARK NIR_3705 | Sky | recipe | region | met
PLACE NIR_3705 | Sky | recipe | A | out
PLACE NIR_3705 | Sky | recipe | B | out
PLACE NIR_3705 | Sky | recipe | C | in
MARK NIR_3705 | Sky | recipe | edge | not met

MobileSAM: region right. A near the tree top; at B the line passes in sky about 5 to 25 pixels from the twigs; C on the foliage edge.
MARK NIR_3705 | Sky | mobilesam | region | met
PLACE NIR_3705 | Sky | mobilesam | A | in
PLACE NIR_3705 | Sky | mobilesam | B | out
PLACE NIR_3705 | Sky | mobilesam | C | in
MARK NIR_3705 | Sky | mobilesam | edge | not met

Way one: region right; A on the tower top, B and C near the twigs, within the band.
MARK NIR_3705 | Sky | way one | region | met
PLACE NIR_3705 | Sky | way one | A | in
PLACE NIR_3705 | Sky | way one | B | in
PLACE NIR_3705 | Sky | way one | C | in
MARK NIR_3705 | Sky | way one | edge | met

Way two: region right; A at the tower top, B at the plume and sprigs, C on the foliage top.
MARK NIR_3705 | Sky | way two | region | met
PLACE NIR_3705 | Sky | way two | A | in
PLACE NIR_3705 | Sky | way two | B | in
PLACE NIR_3705 | Sky | way two | C | in
MARK NIR_3705 | Sky | way two | edge | met

## NIR_3705 Foliage

Recipe: foliage taken; the left tower's interior is also tinted and outlined (about one and a half hundredths wrongly taken). A runs through dark tower branches; B on the foliage top; C round a dark patch inside foliage.
MARK NIR_3705 | Foliage | recipe | region | not met
PLACE NIR_3705 | Foliage | recipe | A | out
PLACE NIR_3705 | Foliage | recipe | B | in
PLACE NIR_3705 | Foliage | recipe | C | out
MARK NIR_3705 | Foliage | recipe | edge | not met

MobileSAM: foliage taken; a small tab above the foliage is under a hundredth. A on the fluffy edge, B near the foliage top, C along the frame's bottom edge where foliage has no edge.
MARK NIR_3705 | Foliage | mobilesam | region | met
PLACE NIR_3705 | Foliage | mobilesam | A | in
PLACE NIR_3705 | Foliage | mobilesam | B | in
PLACE NIR_3705 | Foliage | mobilesam | C | out
MARK NIR_3705 | Foliage | mobilesam | edge | not met

Way one: region right. A loops round dark twigs in sky; B crosses a cross-shaped twig; C is a loop round specks in foliage.
MARK NIR_3705 | Foliage | way one | region | met
PLACE NIR_3705 | Foliage | way one | A | out
PLACE NIR_3705 | Foliage | way one | B | out
PLACE NIR_3705 | Foliage | way one | C | out
MARK NIR_3705 | Foliage | way one | edge | not met

Way two: region right; A along the foliage top, B round a notch of sprigs, C around a dark stalk inside the foliage.
MARK NIR_3705 | Foliage | way two | region | met
PLACE NIR_3705 | Foliage | way two | A | in
PLACE NIR_3705 | Foliage | way two | B | in
PLACE NIR_3705 | Foliage | way two | C | in
MARK NIR_3705 | Foliage | way two | edge | met

## NIR_3705 Built things

Recipe: the two towers taken; bottom foliage patches, each about one hundredth and joined along the frame foot, so whether the connected region passes the square cannot be settled. A, B and C all lie inside the tower or foliage mass with no edge.
MARK NIR_3705 | Built things | recipe | region | uncertain
PLACE NIR_3705 | Built things | recipe | A | out
PLACE NIR_3705 | Built things | recipe | B | out
PLACE NIR_3705 | Built things | recipe | C | out
MARK NIR_3705 | Built things | recipe | edge | not met

MobileSAM: both towers taken as solid shapes; region right. A on the tree edge, B on the basket edge, C along the dark trunk edge, near the band's limit.
MARK NIR_3705 | Built things | mobilesam | region | met
PLACE NIR_3705 | Built things | mobilesam | A | in
PLACE NIR_3705 | Built things | mobilesam | B | in
PLACE NIR_3705 | Built things | mobilesam | C | in
MARK NIR_3705 | Built things | mobilesam | edge | met

Way one: towers taken, ragged on the right one. A lies in sky between branches; B and C along bright and dark boundaries.
MARK NIR_3705 | Built things | way one | region | met
PLACE NIR_3705 | Built things | way one | A | out
PLACE NIR_3705 | Built things | way one | B | in
PLACE NIR_3705 | Built things | way one | C | in
MARK NIR_3705 | Built things | way one | edge | not met

Way two: towers taken. A on the trunk edge; B and C through trunk and twigs with no clear edge.
MARK NIR_3705 | Built things | way two | region | met
PLACE NIR_3705 | Built things | way two | A | in
PLACE NIR_3705 | Built things | way two | B | out
PLACE NIR_3705 | Built things | way two | C | out
MARK NIR_3705 | Built things | way two | edge | not met

## NIR_3710 Sky

Recipe: sky taken, trees left; a faint haze and a small oval between the trees stay under a hundredth. A lies in open cloud, far from any edge (the outlined oval above the trees, tens of pixels); B and C on the foliage edge.
MARK NIR_3710 | Sky | recipe | region | met
PLACE NIR_3710 | Sky | recipe | A | out
PLACE NIR_3710 | Sky | recipe | B | in
PLACE NIR_3710 | Sky | recipe | C | in
MARK NIR_3710 | Sky | recipe | edge | not met

MobileSAM: region right. A about 5 pixels above a dark tree top; B in the cleft in sky up to about 20 pixels from the pine; C near the sprigs.
MARK NIR_3710 | Sky | mobilesam | region | met
PLACE NIR_3710 | Sky | mobilesam | A | out
PLACE NIR_3710 | Sky | mobilesam | B | out
PLACE NIR_3710 | Sky | mobilesam | C | in
MARK NIR_3710 | Sky | mobilesam | edge | not met

Way one: region right; A on the pine edge, B on the pine fringe, C on the sprigs.
MARK NIR_3710 | Sky | way one | region | met
PLACE NIR_3710 | Sky | way one | A | in
PLACE NIR_3710 | Sky | way one | B | in
PLACE NIR_3710 | Sky | way one | C | in
MARK NIR_3710 | Sky | way one | edge | met

Way two: region right; A round a dark tree top, B among thin twigs, C on the foliage top.
MARK NIR_3710 | Sky | way two | region | met
PLACE NIR_3710 | Sky | way two | A | in
PLACE NIR_3710 | Sky | way two | B | in
PLACE NIR_3710 | Sky | way two | C | in
MARK NIR_3710 | Sky | way two | edge | met

## NIR_3710 Foliage

Recipe: the band is taken with the rocks and ground at its foot (several hundredths wrongly taken). A runs through dark twigs; B between bright foliage and dark grass; C loops inside bright foliage.
MARK NIR_3710 | Foliage | recipe | region | not met
PLACE NIR_3710 | Foliage | recipe | A | out
PLACE NIR_3710 | Foliage | recipe | B | in
PLACE NIR_3710 | Foliage | recipe | C | out
MARK NIR_3710 | Foliage | recipe | edge | not met

MobileSAM: band taken with a flat foot; a bush at the lower left (about one to two hundredths) may or may not be foliage, so uncertain. A on the foliage top; B loops in twigs; C across a dark band, not at its edge.
MARK NIR_3710 | Foliage | mobilesam | region | uncertain
PLACE NIR_3710 | Foliage | mobilesam | A | in
PLACE NIR_3710 | Foliage | mobilesam | B | out
PLACE NIR_3710 | Foliage | mobilesam | C | out
MARK NIR_3710 | Foliage | mobilesam | edge | not met

Way one: the band and the rocks at its foot (two to three hundredths) taken. A in twig clutter where what is foliage cannot be told; B and C loop round bright lumps with no edge.
MARK NIR_3710 | Foliage | way one | region | not met
PLACE NIR_3710 | Foliage | way one | A | uncertain
PLACE NIR_3710 | Foliage | way one | B | out
PLACE NIR_3710 | Foliage | way one | C | out
MARK NIR_3710 | Foliage | way one | edge | not met

Way two: the band taken; ground patches at the foot near one to two hundredths, uncertain. A on the foliage edge; B and C round dark masses where foliage and tree cannot be told.
MARK NIR_3710 | Foliage | way two | region | uncertain
PLACE NIR_3710 | Foliage | way two | A | in
PLACE NIR_3710 | Foliage | way two | B | uncertain
PLACE NIR_3710 | Foliage | way two | C | uncertain
MARK NIR_3710 | Foliage | way two | edge | uncertain

## NIR_3710 Built things

Recipe: the two dark trees taken, plus a band across the foot and bits through the middle (about eight hundredths wrongly taken). All three places in foliage or twigs.
MARK NIR_3710 | Built things | recipe | region | not met
PLACE NIR_3710 | Built things | recipe | A | out
PLACE NIR_3710 | Built things | recipe | B | out
PLACE NIR_3710 | Built things | recipe | C | out
MARK NIR_3710 | Built things | recipe | edge | not met

MobileSAM: the two dark structures taken; region right. A on the spire edge; B about 15 pixels from the shadowed branches; C along the tree edge.
MARK NIR_3710 | Built things | mobilesam | region | met
PLACE NIR_3710 | Built things | mobilesam | A | in
PLACE NIR_3710 | Built things | mobilesam | B | out
PLACE NIR_3710 | Built things | mobilesam | C | in
MARK NIR_3710 | Built things | mobilesam | edge | not met

Way one: structures taken. A on the spire edge; B loops in bright foliage with no edge; C round dark patches.
MARK NIR_3710 | Built things | way one | region | met
PLACE NIR_3710 | Built things | way one | A | in
PLACE NIR_3710 | Built things | way one | B | out
PLACE NIR_3710 | Built things | way one | C | in
MARK NIR_3710 | Built things | way one | edge | not met

Way two: structures taken. A on the spire edge; B in bright foliage; C round dark patches.
MARK NIR_3710 | Built things | way two | region | met
PLACE NIR_3710 | Built things | way two | A | in
PLACE NIR_3710 | Built things | way two | B | out
PLACE NIR_3710 | Built things | way two | C | in
MARK NIR_3710 | Built things | way two | edge | not met

## NIR_1873 Foliage

Recipe: foliage taken, but the dark left trunk (about six hundredths) is wrongly taken. A in blurred needles, B in featureless dark water (no edge), C on the pine edge over water.
MARK NIR_1873 | Foliage | recipe | region | not met
PLACE NIR_1873 | Foliage | recipe | A | out
PLACE NIR_1873 | Foliage | recipe | B | out
PLACE NIR_1873 | Foliage | recipe | C | in
MARK NIR_1873 | Foliage | recipe | edge | not met

MobileSAM: the lower-right pines are left out (about six hundredths wrongly left). A on the dark and bright boundary; B runs through bright foliage with no edge; C along the dark trunk edge.
MARK NIR_1873 | Foliage | mobilesam | region | not met
PLACE NIR_1873 | Foliage | mobilesam | A | in
PLACE NIR_1873 | Foliage | mobilesam | B | out
PLACE NIR_1873 | Foliage | mobilesam | C | in
MARK NIR_1873 | Foliage | mobilesam | edge | not met

Way one: the lower-right pines are left (about four hundredths) and the left and right trunks are taken (one to two each). A loops in bark; B follows a log's shadow wedge, not foliage; C along the water line.
MARK NIR_1873 | Foliage | way one | region | not met
PLACE NIR_1873 | Foliage | way one | A | out
PLACE NIR_1873 | Foliage | way one | B | out
PLACE NIR_1873 | Foliage | way one | C | in
MARK NIR_1873 | Foliage | way one | edge | not met

Way two: the lower-right pines are left (about four hundredths). A on dark bark with no edge; B round dark shadow patches; C along a horizontal run through bright reflections.
MARK NIR_1873 | Foliage | way two | region | not met
PLACE NIR_1873 | Foliage | way two | A | out
PLACE NIR_1873 | Foliage | way two | B | out
PLACE NIR_1873 | Foliage | way two | C | out
MARK NIR_1873 | Foliage | way two | edge | not met

## NIR_1873 Water

Recipe: the pond taken, but pine clusters at the right (several hundredths) and patches of the upper pine are wrongly taken, and the left trunk strip. A and B run through pine needles; C follows the pine edge.
MARK NIR_1873 | Water | recipe | region | not met
PLACE NIR_1873 | Water | recipe | A | out
PLACE NIR_1873 | Water | recipe | B | out
PLACE NIR_1873 | Water | recipe | C | in
MARK NIR_1873 | Water | recipe | edge | not met

MobileSAM: the water left of the pine is taken, but the water under the lower-right pines is left (about four hundredths). A on the water line at the rocks; B along the pine edge; C lies in open water at the frame foot.
MARK NIR_1873 | Water | mobilesam | region | not met
PLACE NIR_1873 | Water | mobilesam | A | in
PLACE NIR_1873 | Water | mobilesam | B | in
PLACE NIR_1873 | Water | mobilesam | C | out
MARK NIR_1873 | Water | mobilesam | edge | not met

Way one: water under the right pines is left (about two hundredths or more). A round a rock and the shore; B has a line through plain water; C near a dark trunk edge, about 20 pixels off.
MARK NIR_1873 | Water | way one | region | not met
PLACE NIR_1873 | Water | way one | A | in
PLACE NIR_1873 | Water | way one | B | out
PLACE NIR_1873 | Water | way one | C | out
MARK NIR_1873 | Water | way one | edge | not met

Way two: the same water left under the pines (about two hundredths). A wanders in reflections; B loops in plain water; C round a log's edge.
MARK NIR_1873 | Water | way two | region | not met
PLACE NIR_1873 | Water | way two | A | out
PLACE NIR_1873 | Water | way two | B | out
PLACE NIR_1873 | Water | way two | C | in
MARK NIR_1873 | Water | way two | edge | not met

## Counts, from the MARK and PLACE lines above

Recipe
- Region clause: met 9, not met 10, uncertain 3.
- Places: in 34, out 31, uncertain 1.
- Edge clause: met 7, not met 15, uncertain 0.
- Both clauses met on 6: NIR_1827 Sky, NIR_1827 Foliage, NIR_3742 Sky, NIR_3461 Sky, NIR_1651 Foliage, NIR_1651 Sky.

MobileSAM
- Region clause: met 15, not met 5, uncertain 2.
- Places: in 41, out 24, uncertain 1.
- Edge clause: met 4, not met 17, uncertain 1.
- Both clauses met on 3: NIR_3466 Foliage, NIR_1651 Foliage, NIR_3705 Built things.

Way one
- Region clause: met 15, not met 6, uncertain 1.
- Places: in 36, out 28, uncertain 2.
- Edge clause: met 5, not met 16, uncertain 1.
- Both clauses met on 5: NIR_1827 Sky, NIR_3742 Sky, NIR_1651 Foliage, NIR_3705 Sky, NIR_3710 Sky.

Way two
- Region clause: met 14, not met 5, uncertain 3.
- Places: in 43, out 20, uncertain 3.
- Edge clause: met 11, not met 10, uncertain 1.
- Both clauses met on 10: NIR_1827 Sky, NIR_1827 Foliage, NIR_3742 Sky, NIR_3461 Foliage, NIR_3466 Sky, NIR_3466 Foliage, NIR_1651 Sky, NIR_3705 Sky, NIR_3705 Foliage, NIR_3710 Sky.

## What this judgement cannot show

- Distances are read by eye from crops at three times, where a pylon bar or a twig is a few display pixels wide; the call at the band's limit (inside or outside by one or two frame pixels) can go either way, and several in-band calls are near that limit.
- The whole pictures are shrunk when opened, so a region near one hundredth of the frame is called uncertain only where the square could not settle it; elsewhere sizes are estimates.
- Whether a road, a fence or the dark side of a dock belongs to built things, whether dark forest is foliage or ground, and whether a blurred foreground pine is foliage cannot be told from the pictures; those marks are uncertain or rest on the stated reading (the road and the dock side read as built things).
- Thin lattices, cables and stalks are read as part of the thing; a judge who counts them under the region clause would read a few marks differently.
- Only the mask at a half is read; nothing about tint below a half, and nothing of the device's own drawing.
- Nothing here is compared with the other judge or with the evening's marks.
