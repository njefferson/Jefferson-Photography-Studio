# Correction route, step 2: judgement one, 12 frame-subjects

All 24 pictures (12 whole, 12 magnified) were opened from the index, once each, before anything else was read. Only the after masks are judged. Sizes are estimates by eye against the white square of one hundredth of the frame.

## NIR_3742 Sky

MobileSAM after: the mask fills the open sky and follows the treeline. Nothing larger than a hundredth is wrong. Places A and B follow tree tops; place C lies on a squiggle in open sky at the left with no edge there.
Way two after: the mask fills the open sky and follows the treeline, the pale blur at the right edge is left out. All three places follow tree tops.

MARK NIR_3742 | Sky | mobilesam after | region | met
PLACE NIR_3742 | Sky | mobilesam after | A | in
PLACE NIR_3742 | Sky | mobilesam after | B | in
PLACE NIR_3742 | Sky | mobilesam after | C | out
MARK NIR_3742 | Sky | mobilesam after | edge | not met
WORD NIR_3742 | Sky | mobilesam after | same
MARK NIR_3742 | Sky | way two after | region | met
PLACE NIR_3742 | Sky | way two after | A | in
PLACE NIR_3742 | Sky | way two after | B | in
PLACE NIR_3742 | Sky | way two after | C | in
MARK NIR_3742 | Sky | way two after | edge | met
WORD NIR_3742 | Sky | way two after | same

## NIR_3742 Water

MobileSAM after: the lake is taken with the dock cut out. Small specks lie in the trees and a few at the island's base near the added samples, each well under a hundredth. Place A lies on the shore ground with no water edge, B and C wander in open water.
Way two after: the lake is taken with the dock and boats cut out; a few small specks on the island. A and B follow the waterline and a boat post; C wanders in open water.

MARK NIR_3742 | Water | mobilesam after | region | met
PLACE NIR_3742 | Water | mobilesam after | A | out
PLACE NIR_3742 | Water | mobilesam after | B | out
PLACE NIR_3742 | Water | mobilesam after | C | out
MARK NIR_3742 | Water | mobilesam after | edge | not met
WORD NIR_3742 | Water | mobilesam after | same
MARK NIR_3742 | Water | way two after | region | met
PLACE NIR_3742 | Water | way two after | A | in
PLACE NIR_3742 | Water | way two after | B | in
PLACE NIR_3742 | Water | way two after | C | out
MARK NIR_3742 | Water | way two after | edge | not met
WORD NIR_3742 | Water | way two after | same

## NIR_3742 Built things

MobileSAM after: the dock and boats are taken. The bright tree on the island is still partly taken, a patch of about half a hundredth, smaller than before (about a hundredth and a half). The three places lie inside boat bodies and fragmented pieces, with no edge of the thing under the line in places.
Way two after: no mask; the panel says the fit gave no recipe.

MARK NIR_3742 | Built things | mobilesam after | region | met
PLACE NIR_3742 | Built things | mobilesam after | A | out
PLACE NIR_3742 | Built things | mobilesam after | B | out
PLACE NIR_3742 | Built things | mobilesam after | C | out
MARK NIR_3742 | Built things | mobilesam after | edge | not met
WORD NIR_3742 | Built things | mobilesam after | better
REGION 1 | NIR_3742 | Built things | mobilesam after | shrank
MARK NIR_3742 | Built things | way two after | region | no mask
PLACE NIR_3742 | Built things | way two after | A | no mask
PLACE NIR_3742 | Built things | way two after | B | no mask
PLACE NIR_3742 | Built things | way two after | C | no mask
MARK NIR_3742 | Built things | way two after | edge | no mask
WORD NIR_3742 | Built things | way two after | no mask
REGION 1 | NIR_3742 | Built things | way two after | no mask

## NIR_3742 Foliage

MobileSAM after: the forest is taken and the island tree, left with a gap before, is now filled. The pale blur at the right edge is mostly left out. Places: A on the hilltop line, B inside foliage with no edge, C along a bush top.
Way two after: the forest is taken, with a bulge at the right edge that takes part of the pale blur (under one hundredth) and small bits on the boats. A follows a tree edge; B is a bright bar on dark trunks, not foliage; C lies on a boat canopy.

MARK NIR_3742 | Foliage | mobilesam after | region | met
PLACE NIR_3742 | Foliage | mobilesam after | A | in
PLACE NIR_3742 | Foliage | mobilesam after | B | out
PLACE NIR_3742 | Foliage | mobilesam after | C | in
MARK NIR_3742 | Foliage | mobilesam after | edge | not met
WORD NIR_3742 | Foliage | mobilesam after | better
MARK NIR_3742 | Foliage | way two after | region | met
PLACE NIR_3742 | Foliage | way two after | A | in
PLACE NIR_3742 | Foliage | way two after | B | out
PLACE NIR_3742 | Foliage | way two after | C | out
MARK NIR_3742 | Foliage | way two after | edge | not met
WORD NIR_3742 | Foliage | way two after | same

## NIR_3461 Sky

MobileSAM after: the open sky is taken. The sky inside and left of the big left pylon is still mostly left out (about two hundredths), with a small triangle and a top strip gained. The faint middle pylons carry wide blobs, left-out sky of about one hundredth each. A and B follow pylon edges; C lies on the horizon haze with no edge.
Way two after: the open sky is taken and the left pylon's lattice now holds several tinted holes and a large triangle; much lattice sky is still left out (about two hundredths). A, B and C follow pylon and cable edges.

MARK NIR_3461 | Sky | mobilesam after | region | not met
PLACE NIR_3461 | Sky | mobilesam after | A | in
PLACE NIR_3461 | Sky | mobilesam after | B | in
PLACE NIR_3461 | Sky | mobilesam after | C | out
MARK NIR_3461 | Sky | mobilesam after | edge | not met
WORD NIR_3461 | Sky | mobilesam after | better
REGION 2 | NIR_3461 | Sky | mobilesam after | shrank
MARK NIR_3461 | Sky | way two after | region | not met
PLACE NIR_3461 | Sky | way two after | A | in
PLACE NIR_3461 | Sky | way two after | B | in
PLACE NIR_3461 | Sky | way two after | C | in
MARK NIR_3461 | Sky | way two after | edge | met
WORD NIR_3461 | Sky | way two after | better
REGION 2 | NIR_3461 | Sky | way two after | shrank

## NIR_3461 Foliage

MobileSAM after: the grass is taken up to the horizon, notched at the pylon bases. Nothing larger than a hundredth is wrong. A follows the horizon; B and C lie in open field.
Way two after: the grass is taken with ragged flecks at the horizon and pylon bases. A follows the horizon; B is among tufts at a pylon base and what is under the line cannot be told; C wraps thin pylon legs.

MARK NIR_3461 | Foliage | mobilesam after | region | met
PLACE NIR_3461 | Foliage | mobilesam after | A | in
PLACE NIR_3461 | Foliage | mobilesam after | B | out
PLACE NIR_3461 | Foliage | mobilesam after | C | out
MARK NIR_3461 | Foliage | mobilesam after | edge | not met
WORD NIR_3461 | Foliage | mobilesam after | same
MARK NIR_3461 | Foliage | way two after | region | met
PLACE NIR_3461 | Foliage | way two after | A | in
PLACE NIR_3461 | Foliage | way two after | B | uncertain
PLACE NIR_3461 | Foliage | way two after | C | out
MARK NIR_3461 | Foliage | way two after | edge | not met
WORD NIR_3461 | Foliage | way two after | same

## NIR_3461 Built things

MobileSAM after: the left pylon is now only partly taken, a patch about two hundredths in the upper left half with the sky between members still taken, while its right half and base are left out (about two hundredths). The distant pylons are taken as before. No flap of cloud by the right pylon is seen, only specks of about a fifth of a hundredth. Place A wanders inside the lattice; B and C follow a pylon leg.
Way two after: the left pylon is largely left out now (about three hundredths), with its crossarm and cable region taken in fragments. A mass of cloud around the top of the right pylon is taken, about two hundredths. A, B and C all lie inside lattice or open sky, not on members.

MARK NIR_3461 | Built things | mobilesam after | region | not met
PLACE NIR_3461 | Built things | mobilesam after | A | out
PLACE NIR_3461 | Built things | mobilesam after | B | in
PLACE NIR_3461 | Built things | mobilesam after | C | in
MARK NIR_3461 | Built things | mobilesam after | edge | not met
WORD NIR_3461 | Built things | mobilesam after | same
REGION 2 | NIR_3461 | Built things | mobilesam after | shrank
REGION 3 | NIR_3461 | Built things | mobilesam after | gone
MARK NIR_3461 | Built things | way two after | region | not met
PLACE NIR_3461 | Built things | way two after | A | out
PLACE NIR_3461 | Built things | way two after | B | out
PLACE NIR_3461 | Built things | way two after | C | out
MARK NIR_3461 | Built things | way two after | edge | not met
WORD NIR_3461 | Built things | way two after | worse
REGION 2 | NIR_3461 | Built things | way two after | shrank
REGION 3 | NIR_3461 | Built things | way two after | grew

## NIR_1873 Foliage

MobileSAM after: the foreground pine at the lower right is now taken, a large gain; some sparse lower-left branches remain left out (about one hundredth). The taken blob also spans the water between branches, about one to two hundredths, and the dark trunk at the right edge is inside it. The shoreline rocks are mostly left out. A and B enclose holes inside dense foliage; C lies in the water gap beside the needles.
Way two after: the pine is now mostly taken, with ragged holes and water in its lower part, around one hundredth wrong, a size the square cannot settle. A wraps a dark trunk, B lies in open water, C wraps a dark clump in the water whose nature cannot be told.

MARK NIR_1873 | Foliage | mobilesam after | region | not met
PLACE NIR_1873 | Foliage | mobilesam after | A | out
PLACE NIR_1873 | Foliage | mobilesam after | B | out
PLACE NIR_1873 | Foliage | mobilesam after | C | out
MARK NIR_1873 | Foliage | mobilesam after | edge | not met
WORD NIR_1873 | Foliage | mobilesam after | better
REGION 4 | NIR_1873 | Foliage | mobilesam after | shrank
MARK NIR_1873 | Foliage | way two after | region | uncertain
PLACE NIR_1873 | Foliage | way two after | A | in
PLACE NIR_1873 | Foliage | way two after | B | out
PLACE NIR_1873 | Foliage | way two after | C | uncertain
MARK NIR_1873 | Foliage | way two after | edge | not met
WORD NIR_1873 | Foliage | way two after | better
REGION 4 | NIR_1873 | Foliage | way two after | shrank

## NIR_1873 Water

MobileSAM after: the pond is taken, now cut back under the pine. Nothing larger than a hundredth is wrong. A follows the shore, B a stump edge, C lies at the frame bottom in open water.
Way two after: the pond is taken with a ragged edge under the pine. A, B and C follow a rock, a stump and needles.

MARK NIR_1873 | Water | mobilesam after | region | met
PLACE NIR_1873 | Water | mobilesam after | A | in
PLACE NIR_1873 | Water | mobilesam after | B | in
PLACE NIR_1873 | Water | mobilesam after | C | out
MARK NIR_1873 | Water | mobilesam after | edge | not met
WORD NIR_1873 | Water | mobilesam after | same
MARK NIR_1873 | Water | way two after | region | met
PLACE NIR_1873 | Water | way two after | A | in
PLACE NIR_1873 | Water | way two after | B | in
PLACE NIR_1873 | Water | way two after | C | in
MARK NIR_1873 | Water | way two after | edge | met
WORD NIR_1873 | Water | way two after | same

## NIR_3710 Sky

MobileSAM after: the sky is taken, with the two dark trees and the bushes left out. All places follow those edges.
Way two after: the same, nothing wrong larger than a hundredth. All places follow those edges.

MARK NIR_3710 | Sky | mobilesam after | region | met
PLACE NIR_3710 | Sky | mobilesam after | A | in
PLACE NIR_3710 | Sky | mobilesam after | B | in
PLACE NIR_3710 | Sky | mobilesam after | C | in
MARK NIR_3710 | Sky | mobilesam after | edge | met
WORD NIR_3710 | Sky | mobilesam after | same
MARK NIR_3710 | Sky | way two after | region | met
PLACE NIR_3710 | Sky | way two after | A | in
PLACE NIR_3710 | Sky | way two after | B | in
PLACE NIR_3710 | Sky | way two after | C | in
MARK NIR_3710 | Sky | way two after | edge | met
WORD NIR_3710 | Sky | way two after | same

## NIR_3710 Foliage

MobileSAM after: the bushes are taken with a clean lower edge, and the dark trees left out. Faint specks now lie on the stony ground along the bottom, together under a hundredth; before, that ground was clean. A follows a bush edge at the sky; B lies on a straight cut at the bush base; C is a small loop on a dark patch in the stones.
Way two after: the bushes are taken, and the stony ground along the bottom is still taken in many pieces, about two hundredths, now with a solid blob at the lower left of about one hundredth. The dark trees' crowns are partly taken. A lies on a dark tree, B and C in the stones.

MARK NIR_3710 | Foliage | mobilesam after | region | met
PLACE NIR_3710 | Foliage | mobilesam after | A | in
PLACE NIR_3710 | Foliage | mobilesam after | B | in
PLACE NIR_3710 | Foliage | mobilesam after | C | out
MARK NIR_3710 | Foliage | mobilesam after | edge | not met
WORD NIR_3710 | Foliage | mobilesam after | worse
REGION 5 | NIR_3710 | Foliage | mobilesam after | grew
MARK NIR_3710 | Foliage | way two after | region | not met
PLACE NIR_3710 | Foliage | way two after | A | out
PLACE NIR_3710 | Foliage | way two after | B | out
PLACE NIR_3710 | Foliage | way two after | C | out
MARK NIR_3710 | Foliage | way two after | edge | not met
WORD NIR_3710 | Foliage | way two after | worse
REGION 5 | NIR_3710 | Foliage | way two after | stayed

## NIR_3710 Built things

MobileSAM after: the two dark trees are taken cleanly, with a speck at the upper right. All places follow tree edges.
Way two after: the two trees are taken, ragged at their lower parts, with three small blobs on the stony ground and bush top, together about a third of a hundredth. A follows a crown edge; B and C lie among bright leaves with no edge.

MARK NIR_3710 | Built things | mobilesam after | region | met
PLACE NIR_3710 | Built things | mobilesam after | A | in
PLACE NIR_3710 | Built things | mobilesam after | B | in
PLACE NIR_3710 | Built things | mobilesam after | C | in
MARK NIR_3710 | Built things | mobilesam after | edge | met
WORD NIR_3710 | Built things | mobilesam after | same
MARK NIR_3710 | Built things | way two after | region | met
PLACE NIR_3710 | Built things | way two after | A | in
PLACE NIR_3710 | Built things | way two after | B | out
PLACE NIR_3710 | Built things | way two after | C | out
MARK NIR_3710 | Built things | way two after | edge | not met
WORD NIR_3710 | Built things | way two after | worse

## Counts, from the lines above and no other way

### mobilesam after (12 masks)
- Region clause: 9 met, 3 not met, 0 uncertain.
- Places (36): 19 in, 17 out, 0 uncertain.
- Edge clause: 2 met, 10 not met, 0 uncertain.
- Both clauses met: NIR_3710 Sky; NIR_3710 Built things.
- Words: 4 better, 7 same, 1 worse, 0 broken.

### way two after (11 masks and 1 no mask)
- Region clause: 7 met, 3 not met, 1 uncertain, 1 no mask.
- Places (33 with a mask): 18 in, 13 out, 2 uncertain; 3 no mask.
- Edge clause: 4 met, 7 not met, 0 uncertain, 1 no mask.
- Both clauses met: NIR_3742 Sky; NIR_1873 Water; NIR_3710 Sky.
- Words: 2 better, 6 same, 3 worse, 0 broken, 1 no mask.

### Regions
REGION 1 | NIR_3742 | Built things | mobilesam after | shrank
REGION 1 | NIR_3742 | Built things | way two after | no mask
REGION 2 | NIR_3461 | Sky | mobilesam after | shrank
REGION 2 | NIR_3461 | Sky | way two after | shrank
REGION 2 | NIR_3461 | Built things | mobilesam after | shrank
REGION 2 | NIR_3461 | Built things | way two after | shrank
REGION 3 | NIR_3461 | Built things | mobilesam after | gone
REGION 3 | NIR_3461 | Built things | way two after | grew
REGION 4 | NIR_1873 | Foliage | mobilesam after | shrank
REGION 4 | NIR_1873 | Foliage | way two after | shrank
REGION 5 | NIR_3710 | Foliage | mobilesam after | grew
REGION 5 | NIR_3710 | Foliage | way two after | stayed

## What this judgement cannot show

- Sizes are by eye against the square; wrong regions of about one hundredth, such as the pine's remainder on NIR_1873 and the lattice sky on NIR_3461, sit at the line, so a region clause there could go either way.
- Region 3 was not seen in the MobileSAM before panel, so "gone" there means only that no flap is seen after.
- Thin structures (lattice members, cables) cannot be separated from the sky between them at these panel sizes, so the lattice sky on NIR_3461 is read as areas, not member by member.
- The edge is read at three places per mask only; a place that is in says nothing of the rest of the edge.
- The Ground mask on NIR_3710 is not shown and not judged, so whether the Ground samples took the stony ground is read only through the Foliage and Built things masks.
- No picture stands for the device's own drawing.
