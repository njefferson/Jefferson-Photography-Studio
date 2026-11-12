# The maps of a model that labels the scene by class (step 427, 11 November 2026)

Every path is under /tmp/claude-0/-home-user/830639f0-e507-5bcf-9a55-4c285406c256/scratchpad/research/whole unless it starts with a slash. Every figure below was printed by a run of this step, whose output is kept under progress/step-427-*.txt in the scratchpad. Every sheet named was opened with the Read tool before this note was written.

## The model

- **BiSeNetV2 trained on ADE20K, by CoinCheung (github.com/CoinCheung/BiSeNet), the model IR-SCIENCE.md section 4b-x names.** 150 scene classes; the class names are those of the data set's own list, CSAILVision/sceneparsing objectInfo150.csv, the output index being the list's index less one.
- **Files.** model_final_v2_ade20k.pth, a release download of the publisher's repository (release 0.1.0), asked once at github.com and served after one redirect by release-assets.githubusercontent.com: 18,385,109 bytes, a PyTorch zip. The science file's 22.4 MB of 25 September is not this figure. The code read to run it: lib/models/bisenetv2.py, configs/bisenetv2_ade20k.py, tools/demo.py and lib/data/ade20k.py, at raw.githubusercontent.com.
- **Licence.** MIT, copyright 2018 CoinCheung, from the repository's LICENSE file (read whole on disk, research/whole/pages-device/scener-02.txt, fetched by step 424). The MIT terms allow a free app to ship it with the notice kept.
- **How it was run here.** Not through the publisher's runtime. The CPU build of PyTorch was asked at its publisher's index: the index answered and the wheel's host, download-r2.pytorch.org, was refused by the session's network (tunnel 403). The registry's Linux build carries several gigabytes of GPU libraries and was not asked. So scratch/step427_bisenet.py writes the publisher's forward pass again in NumPy, layer by layer from bisenetv2.py in eval mode, and reads the .pth with a restricted unpickler: 383 arrays, 327 on the eval path, 56 of the training heads unused. Its three arithmetic plants read as known. On the publisher's own daylight example (example.png, 1024 by 512) it labelled road 36.2, building 35.6, tree 9.9, car 6.4, grass 6.1 percent, and the opened map (maps-classes/check/example-classes.png) puts road on the road, building on the house, tree on the trees and car on the cars. It was not compared value by value with PyTorch.
- **Input.** Each picture brought to a short side of 512 (the config's evaluation short side), 768 by 512, by bilinear resize, normalised by the config's mean and spread. The model decides on a grid of 96 by 64, an eighth of its input: one cell is about 29 pixels of the 2,800 by 1,864 frame.
- **Time for a map here.** 0.4 to 1.3 seconds a map on the container's CPU, in NumPy. A mask from a kept map, with the guided filter at full size, 1.7 to 3.0 seconds. These are the container's numbers and say nothing of a tablet.
- **Other models of the kind.** None was run. BiSeNetV1 and BiSeNetM for ADE20K from the same publisher (MIT) were not asked: the NumPy rewrite covers V2 only. EfficientViT-Seg and PP-MobileSeg were not asked. SegFormer stays excluded by its licence (science file). Nothing is said here of what any of them would do.

## The rule each mask was made by

- The class map is kept once per picture and input (maps-classes/classmaps/<picture>-<input>-logits.npy, the 150 scores on the 96 by 64 grid).
- For a subject: a sample falls in the class most of its own pixels are in (argmax at the model's input size); the subject's classes are taken in order of how many of its sample pixels fall in each, a class being skipped when another name's sample falls in it, until they hold more than half of its sample pixels. Where every class its samples fall in is barred, nothing is chosen and the mask is zero.
- The mask is the model's own confidence summed over those classes (softmax of the scores brought to the input size by the head's own x8 bilinear step).
  - -model.png: that confidence, at the model's input size, brought to 2,800 by 1,864 by plain bilinear and nothing else.
  - -guided.png: the same put through a guided filter whose guide is the grey of the picture the map was made from, radius 32 pixels, regularisation 0.001. The radius and regularisation were set by this step; the step's text does not give them.
- Carried: the classes chosen on the first frame by its own samples, applied to the second frame's class map, same input, guided form only. Nothing else is carried.
- Files: maps-classes/masks (108 of real frames, 64 of planted pictures), maps-classes/carried (20), maps-classes/sheets (each drawn mask's sheet and crops), maps-classes/classes.json (the classes chosen).

## The classes each subject's samples chose

Frames, open input then natural input:
- NIR_3461: Sky nothing (sky and ceiling barred by the pylon samples) | sky, holding 1,326 of 6,573 sample pixels, not most. Foliage earth | floor. Built things wall, not most | wall.
- NIR_3466: Sky sky | sky. Foliage earth + road | fence + earth. Built things building | building.
- NIR_1827: Sky sky | nothing (sky barred by one Foliage sample that falls mostly in sky). Foliage tree | tree.
- NIR_1651: Sky water | sky. Foliage tree + earth, not most | tree.
- NIR_3742: Sky sky | sky. Foliage tree | tree. Water nothing | water, holding 1,212 of 6,592, not most. Built things airplane + car + boat + bench + wall + pier | car + earth.
- NIR_3705: Sky sky | sky. Foliage earth, holding 1,103 of 31,166, not most | nothing. Built things tower, not most | nothing (tree barred both ways).
- NIR_3710: Sky sky | sky. Foliage earth, not most | nothing. Built things palm + tower + person, not most | palm, not most.
- NIR_1873 (no sky): Foliage mountain | tree. Water nothing | water.

Planted pictures, open input then natural input:
- plant-straight: Sky sky | sky. Foliage earth | grass.
- plant-stepped: Sky ceiling | ceiling. Built things tank, not most | wall.
- plant-curved: Sky sky | sky. Foliage tree | tree.
- plant-three: Sky ceiling, Built things wall, Water floor, on both inputs.
- plant-shore: Foliage nothing | tree. Water floor + lamp, not most | water.
- plant-built-foliage: Built things nothing, Foliage nothing | Built things door, not most; Foliage tree.
- plant-island: Sky sky | sky. Foliage nothing | tree, not most. Water floor, not most | water.

The model calls the mirror-tiled planted regions and NIR_3461's natural input by indoor classes (wall, ceiling, floor). The rule takes whatever class the samples fall in, so a planted Sky labelled ceiling can still score well.

## The scores on the planted pictures

Overlap over union at a half and the widest band of wrong pixels along the truth's boundary, model size then guided, from score.mjs (its plant read 0.8750 and 6 on every run). Every line in full, with subject taken and else taken: maps-classes/scores-open.txt and scores-natural.txt.

Open input:
- plant-straight Sky 0.9904, 71 px; 0.9908, 62 px. Foliage 0.5683, 930; 0.5677, 930.
- plant-stepped Sky 0.7250, 676; 0.7210, 676. Built things 0.0000, 996; 0.0000, 996.
- plant-curved Sky 0.9966, 16; 0.9974, 12. Foliage 0.2000, 1,027; 0.1891, 1,027.
- plant-three Sky 0.9484, 127; 0.9435, 124. Built things 0.9288, 157; 0.9359, 150 (else taken 0.19). Water 0.5945, 338; 0.5853, 319.
- plant-shore Foliage 0.0000, 1,168 both. Water 0.0000, 966 both.
- plant-built-foliage Built things 0.0000, 1,396 both. Foliage 0.0000, 1,535 both.
- plant-island Sky 0.5888, 559; 0.5720, 559. Foliage 0.0000, 434 both. Water 0.0000, 688 both.

Natural input:
- plant-straight Sky 0.9601, 119; 0.9595, 118. Foliage 0.0382, 930; 0.0284, 930.
- plant-stepped Sky 0.7397, 275; 0.7355, 274. Built things 0.7625, 417; 0.7750, 415.
- plant-curved Sky 0.9959, 21; 0.9975, 24. Foliage 0.4458, 919; 0.4412, 920.
- plant-three Sky 0.9387, 149; 0.9362, 139. Built things 0.9347, 115; 0.9383, 114. Water 0.9359, 171; 0.9399, 144.
- plant-shore Foliage 0.5843, 1,168; 0.5792, 1,168. Water 0.7541, 535; 0.7525, 525.
- plant-built-foliage Built things 0.0172, 1,396; 0.0093, 1,396. Foliage 0.4178, 1,524; 0.4178, 1,522.
- plant-island Sky 0.4855, 559; 0.4762, 559. Foliage 0.0562, 434; 0.0490, 434. Water 0.6672, 494; 0.6690, 490.

None of the 64 has an overlap of 0.9 or more together with a widest band of 4 px or less. The nearest is plant-curved Sky, 0.9974 with a band of 12 px (open, guided). The guided filter moves an overlap by at most 0.0125 and a band by at most 19 px; it mainly removes wrong pixels apart from the boundary.

## The sheets, frame by frame

Places are in the frame's own pixels, x across and y down, as the picture is stored. A band is wrong pixels along an edge; a region is a wrong area away from it. Every sheet named below has its crops file beside it, opened too.

### NIR_1651 (stored turned: the tree lies along the frame from the left, clear sky above and below it, cloud on the right)
- Open, Foliage (tree + earth), both sizes: rounded blobs in the left two thirds of the crown; the crown's last third (x about 1500 to 2400) and holes of 200 to 400 px left out; no sky taken. Guided: the upper edge follows the needles from x 650 to 1350; the holes stay.
- Open, Sky (water), both sizes: the clear sky below the tree (y 1400 to 1860) with a hole at x 560 to 860, and the lower half of the cloud; the sky above the tree and the upper cloud left out. Guided: the lower crown edge followed within a few px.
- Natural, Foliage (tree): the upper two thirds of the crown, upper edge within 20 to 60 px (guided: a few px); the lower crown, a band 200 to 400 px deep, left out at both sizes.
- Natural, Sky (sky): the sky above the tree and the cloud's upper part; all the clear sky below the tree (x 100 to 1600, y 1500 to 1864) and the lower cloud left out at both sizes.

### NIR_1827 (sky over a line of conifers)
- Open, Foliage (tree): the tree line; a smooth outline through the tops leaves tips 100 to 300 px out on the left half and takes sky wedges 100 to 200 px wide between trees on the right half. Guided: the right half within 10 to 40 px of the crowns; the left half unchanged, tips and snags left out.
- Open, Sky (sky): the whole sky; the tops of the trees on the left half taken as sky; the deepest wedges on the right left out. Guided: the right half within 10 to 40 px; the left half's tips and snags still taken.
- Natural, Foliage (tree): as on the open input, tips 50 to 200 px out, sky wedges 100 to 250 px deep taken. Guided: the right half within 10 to 40 px; the left half unchanged.
- Natural, Sky: nothing chosen; both sheets bare.

### NIR_1873 (no sky: forest, a rocky bank, a pool, near pine boughs, a dark trunk at the left edge)
- Open, Foliage (mountain): a swath of far slope and the bare rock face and boulders above the pool (x 800 to 1650, y 800 to 1220) taken; most of the forest on the left and the near boughs left out; both sizes.
- Open, Water: nothing chosen; both sheets bare.
- Natural, Foliage (tree): the dark trunk at the left edge (x 0 to 230, y 150 to 1200) and the water under the boughs at the lower right (x 2110 to 2780, y 1240 to 1700) taken; blobs of the forest and boughs; most of the forest and the bright boughs left out; both sizes.
- Natural, Water (water): the open pool to its shore within 10 to 30 px (guided: a few px); the boughs hanging over the pool (x 1350 to 2000, y 1500 to 1900) taken as water; the water under the boughs at the right (x 1800 to 2800, y 1200 to 1924), about a tenth of the frame, left out.

### NIR_3461 (lattice pylons on a pale field under cloud)
- Open, Built things (wall): one blob over the middle pylon's base with sky and bushes in it, a strip of bushes and a ring under the near pylon; every pylon above its base and the near pylon left out; both sizes.
- Open, Foliage (earth): a patch in mid-field (x 1250 to 2080, y 1430 to 1720) and five blobs; most of the field left out; both sizes.
- Open, Sky: nothing chosen; both sheets bare.
- Natural, Built things (wall): the low sky along the horizon (x 140 to 2800, y 1170 to 1460) with lobes up over the distant pylons taken, 6.6 percent of the frame; every pylon above that and the near pylon left out; both sizes.
- Natural, Foliage (floor): the field in broad patches with holes 100 to 600 px across; a blob of sky at the top left corner taken; both sizes.
- Natural, Sky (sky): one blob of cloud at the top right (x 2290 to 2610, y 90 to 300) and a speck; the rest of the sky left out; both sizes.

### NIR_3466 (a tall pale building and sheds beyond a field, fence and road at the foot)
- Open, Built things (building): the main block and the low sheds; the pale tall part (x 1120 to 1300, y 810 to 1200) cut diagonally and mostly left out, the middle low building partly, the hut at the right and the vehicles left out. Model size: roofline within 10 to 30 px, corners rounded by about 60 px. Guided: roofline and right wall within a few px.
- Open, Foliage (earth + road): the whole road (x 0 to 2700, y 1720 to 1860, about a tenth of the frame) taken as foliage, and the far strip of the field; most of the grass left out; both sizes.
- Open, Sky (sky): the whole sky to the rooflines; a band of low sky at the right (x 2050 to 2330) 80 to 100 px deep left out (guided: about 60 px); roofline 10 to 30 px (guided: a few px).
- Natural, Built things (building): the main block and the sheds; the pale tall part left out; the middle building mostly and the hut left out; guided roofline within a few px.
- Natural, Foliage (fence + earth): two broad patches of the field with the fence; the middle of the field (x 1170 to 1700) and the verge by the road left out; no road taken; both sizes.
- Natural, Sky (sky): the whole sky and the pale tall part of the building (x 1120 to 1310, y 820 to 1220, about 1 percent of the frame) taken as sky; a bulge of sky over the main roof (x 1530 to 1750) and one over the sheds left out; guided: the tall part still taken, the bulge a smooth arch 60 to 100 px high.

### NIR_3705 (two cell towers dressed as conifers above pale shrubs, overcast sky)
- Open, Built things (tower): one blob of about 80 by 130 px on the right tower's panels; the rest of both towers left out; both sizes.
- Open, Foliage (earth): three blobs at the foot of the frame; the whole shrub mass left out; both sizes.
- Open, Sky (sky): the whole sky; model size: a band of shrub tips 50 to 150 px deep taken as sky along the shrub line, and the right tower's lower trunk and branches inside a lobe left out with sky in it. Guided: the shrub tips within 10 to 40 px along most of the line; the dressed heads followed; the gaps of sky inside the heads left out.
- Natural, Built things and Foliage: nothing chosen; all four sheets bare.
- Natural, Sky (sky): the sky; pale pine plumes beside the left tower (x 1050 to 1350, y 820 to 1100) taken as sky at both sizes; the sky within the right tower's head left out; guided: the shrub tips within 10 to 30 px elsewhere.

### NIR_3710 (the same towers from further off, shrubs, a gravel bank, a pale pine at the right)
- Open, Built things (palm + tower + person): one blob of about 130 by 100 px on the right tower's panels; both towers otherwise left out; both sizes.
- Open, Foliage (earth): bare gravel and shadowed ground at the foot (x 100 to 1370, y 1590 to 1924) and one small shrub patch; the shrub band and the pine left out; both sizes.
- Open, Sky (sky): the sky; a block of low sky beside the left tower (x 580 to 760, y 790 to 1110) left out; the sky between the right tower's branches left out; model size: the outline 20 to 80 px off the shrub tips; guided: within 10 to 30 px.
- Natural, Built things (palm): one speck at a half; both towers left out. Foliage: nothing chosen; bare.
- Natural, Sky (sky): the sky; the sky beside the left tower's head (x 810 to 880) and inside the right tower's outline left out; pale pine plumes (x 2450 to 2700 and x 1150 to 1450) taken as sky at model size; guided: tips within 10 to 30 px, the sky by the towers still left out.

### NIR_3742 (a pine forest over a pale beach, a lake, a marina, a patrol boat; a flare at the right edge)
- Open, Built things (six classes): blobs on the docks and boats; most of the docks' length, the far boats' canopies and the patrol boat's hull left out; nothing of another kind taken at a half; both sizes.
- Open, Foliage (tree): the whole forest; model size: tips 30 to 100 px out and sky wedges of that size taken; the far hill's sparse trees left out; half the flare region taken; a strip of the dark shaded shore at the right taken. Guided: the crowns within 10 to 40 px.
- Open, Sky (sky): the sky; model size: tips taken as sky by 30 to 100 px, wedges left out; the flare region (x 2720 to 2800, to y 500) taken. Guided: the crowns within 10 to 30 px; the flare still taken.
- Open, Water: nothing chosen; both sheets bare.
- Natural, Built things (car + earth): blobs of the beach, a blob of open water and blobs over the moored boats; the docks, posts, most boats and the patrol boat left out; gravel and water taken; both sizes.
- Natural, Foliage (tree): the whole forest; model size: a band of sky 20 to 80 px above the crowns and the dips between crowns taken; the flare region and the shaded shore at the right (x 2280 to 2800, y 1040 to 1190) taken. Guided: the crowns within 10 to 30 px; the flare and the shore still taken.
- Natural, Sky (sky): the sky; tips taken as sky by 20 to 80 px at model size; guided: within 10 to 30 px; the flare taken.
- Natural, Water (water): two patches at the foot below the docks, 2.3 percent of the frame; nearly all the open lake, a fifth of the frame or more, left out; both sizes.

## The carried cases (guided form)

- **NIR_3705 to NIR_3710, one scene.** Where the class names agree the carried mask is the second frame's own mask: open Sky (sky) 47.9 percent and natural Sky (sky) 49.1 percent, the same sky as NIR_3710's own Sky sheets, with the same faults (sky beside and inside the towers left out). Open Foliage (earth) is NIR_3710's own Foliage mask: bare ground taken, shrubs left out. Open Built things (tower) takes nothing at a half; on the second frame the class that held the panels at a half was not tower. Natural Built things and Foliage carry nothing.
- **NIR_3461 to NIR_3466, different scenes.** Open: Built things (wall) takes nothing at a half; Foliage (earth) takes two small patches of the far field, 0.7 percent; Sky carries nothing. Natural: Built things (wall) and Foliage (floor) take nothing at a half; Sky (sky) is NIR_3466's own natural Sky mask, the pale tall part of the building taken as sky.
- **NIR_3742 to NIR_1873, different scenes; the second has no sky.** Sky takes nothing on both inputs, which is right. Open: Built things takes nothing; Foliage (tree) takes the dark trunk at the left edge and blobs on the near pine's trunk, 3.2 percent; Water carries nothing. Natural: Built things takes nothing; Foliage (tree) is NIR_1873's own natural Foliage mask, the trunk and the water under the boughs taken; Water (water) is NIR_1873's own natural Water mask, the pool to its shore, the boughs over it taken, the water under the boughs left out.
- The carried mask is the class map's own answer on the second frame: it is as right or as wrong as that frame's own mask with the same classes, and where the first frame's samples chose no class, or a class the second frame does not use for the thing, it takes nothing.

## In all

- On no real frame does a mask meet the result as step 429 words it (the thing sampled taken to its edges, no region of another kind over a hundredth of the frame, no band wider than 4 px), and on no planted picture does a mask reach an overlap of 0.9 with a band of 4 px or less.
- The nearest are the Sky masks in the guided form on NIR_3705, NIR_3710, NIR_3466 and NIR_3742: the sky taken along most of the line, with bands of 10 to 40 px at shrub and tree tips, and on NIR_3710 and NIR_3466 a region of sky over a hundredth of the frame left out (beside the towers, over the roof), and on NIR_3742 the lens flare taken.
- Foliage, Built things and Water fail by whole regions on every frame where they were sampled: the model's classes cut through the subject (crowns split, fields in patches, the lake left out) or take another kind (the road, a trunk, bare gravel, the low sky).
- The guided filter brings an edge that the model already placed near the right place to within 10 to 40 px along foliage and a few px along a roofline or a shore; it does not move a boundary that lies inside a uniform region, and it does not take a region the model left out or leave a region the model took.
- The class rule empties a subject whenever another name's sample falls mostly in that subject's class: 7 of the 44 frame subject-input cases and 4 of the 32 planted ones chose nothing.

## What none of it shows

- How fast or how heavy the model runs on the tablet; every time here is the container's CPU in NumPy.
- That the NumPy rewrite equals the publisher's PyTorch run value by value; the daylight example's map is the only check.
- What BiSeNetV1, BiSeNetM or any other model of the kind would do; none was run.
- How the masks behave on wires, lattices or soft edges in a planted picture; the planted boundaries are drawn and the tiled texture repeats.
- Whether another class rule, another guide, radius or regularisation, or another input preparation would do better; one of each was run.
- Whether the samples placed by step 423 on the frames the person did not press are where the person would put them.
