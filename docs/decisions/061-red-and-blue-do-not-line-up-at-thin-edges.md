# 061 · Red and blue do not line up at thin edges, and Aerochrome paints the difference

## Context

Reported from the device, 2026-09-24, with a full-resolution Aerochrome export
of steel pylons and wires against the sky. Opened at 1:1:

- the wires are red along their whole length;
- soft, round red discs, 20 to 40px across, sit along the wires and around
  the joints;
- one face of each pylon member is red and the other pale;
- thin red lines run along the top and left edges of the frame;
- sky seen through the nearest pylon's lattice is grey.

The export is full resolution, so none of this is an artefact of resampling
the preview.

**Measured on practice raws the same day, with every crop opened.**

- **The colour outside the metal is the channels not lining up, not the
  metal's reflectance.** One uniform black post is blue on its left edge and
  red on its right, and a material cannot be two colours depending on the
  side.
  - Rendered four ways on the practice frame NIR_3430, with the look held
    fixed, the post edge had:
    - 469 red and 667 vivid-blue pixels over 400 rows as shipped;
    - 323 and 337 with red and blue re-sampled to share one position;
    - 149 and 0 with that plus the lens's lateral offset cancelled;
    - 633 and 771 with the offset doubled.
  - The control, the plain rebuilt DNG, rendered byte-identical to the NEF.
- **Two offsets add.** The editing copy's 2x2 binning puts blue about half a
  preview pixel up and to the left of red, the same everywhere in the frame.
  So the comment in `src/raw/demosaic.ts` calling binning artifact-free is
  false for lines thinner than a quad. The lens adds lateral chromatic
  aberration growing toward the corners, about +0.6 full-resolution pixels
  for blue against green at the corner. Its sign reverses between the
  frames' focal lengths.
- **Why only Aerochrome shows it.** The camera records one colour axis:
  green and blue correlate at 0.996 (the device report). So an edge's colour
  error lands on the same axis that separates foliage from sky. On NIR_3430,
  blue-over-green is 0.536 in the sky and 0.632 in the trees. Across the
  post's edge, blue-minus-green is +0.23 of the sky level in the preview and
  +0.15 in the export. That puts an edge pixel as far from the sky as foliage
  is.
  - The Aerochrome mixer turns a blue error red at about 2.1x. The plain swap
    passes it at 1.0x, and its render shows only faint blue and orange edges.
  - Foliage 0 removes the red edge and leaves the cyan one. So does the mixer
    at identity. Sky stages off, detail off and denoise off do not;
    denoise off is worse.
- **The round discs are Sky colour smoothing.** With that set to 0 alone,
  they are gone; with Sky saturation alone at 0, they stay, fainter. The sky
  map averages each texel from four point samples (`src/skymap.ts`). One on
  a red wire tints the whole texel, and upsampling spreads it into a disc.
  That is 013's shipped stage. The disc remedy belongs to 013, not here.
- **The border lines are a demosaic defect, on all four edges.** The
  export's bilinear demosaic (`src/raw/demosaic.ts`) picks a neighbour's
  colour by the coordinate before clamping but reads the photosite after
  clamping, so at the border it reads the wrong colour. The export's edge
  rows measure (196,64,58) against (54,70,88) twenty rows in. A full-resolution
  JPEG of the practice frame NIR_0063 has it on every edge, not only the two
  in the report: the top row at (173,159,114) and the right column at
  (46,97,15), against (99,175,185) and (30,85,100) twenty pixels in. Reading
  the neighbour by reflection rather than clamping keeps its colour; built and
  exported, every edge then matches the interior and no pixel more than 16px
  from an edge changes.

**Measured on the reported frame's own raw, 2026-09-24, and it moves the
answer for that frame.** The frame is NIR_3461 (77 mm, f/5). Every render
below went through the app, and every one was opened.

- **The lens adds almost nothing on this frame.** Median red and blue radial
  offsets on the raw planes are within 0.07 px even in the corners. The
  misregistration is the binning offset alone: red and blue sit about 0.48
  preview px apart, the same everywhere.
- **Lining the channels up does not clear the red.** Rendered as shipped,
  co-sited, and co-sited with the lens offset cancelled, in the editing view
  and in the full export: the wires stay red in all three, and co-siting
  widens the red core from one pixel to two.
- **The red is the wire's own colour, amplified.** Across one wire the centre
  pixel renders (255,0,0). In the raw, that pixel differs from the sky beside
  it by 5 to 13 percent, red over green lower and blue over green higher, the
  same way on both centre pixels. A misregistration pushes the two sides of a
  line in opposite directions; only the left-edge pixel does that here.
- **It is the foliage band that paints it.** With Foliage saturation at 0 and
  nothing else changed, the centre pixel renders (136,135,138), strongly red
  pixels above the horizon go from 16,430 to 0, and the round discs go too,
  because they are Sky colour smoothing spreading red wire. The cost is the
  one already rejected below: the grass loses its red.
- **What surrounds the wire decides it.** On NIR_3463 (62 mm) one wire renders
  grey against blue sky and red where it crosses white cloud. That frame does
  carry a lens term, blue about 0.27 px outward in the corners, which is the
  per-photograph case the options below were written for.

So on the reported frame the red on the metal is the foliage band selecting by
colour, and the remedy for what was reported is the foliage band limited to a
place: 042's stage for the look's own bands, the same fix 042 already names
for cladding that reddens with the grass. The channel geometry below is still
real on NIR_3430's posts and NIR_3463's corners, and its steps stand, but it
does not fix the reported frame.

## Looked up

- **Where a raw pipeline corrects channel geometry.** darktable's order
  (`src/common/iop_order.c`, v5) is: white balance 309, raw chromatic
  aberration 312, demosaic 315, lens and guided correction 321-322, input
  profile 346, channel mixer 347, defringe 361. Every correction of channel
  geometry runs BEFORE the colour transforms.
  - `dcraw -C` rescales red and blue about the centre after white balance and
    before demosaic.
  - RawTherapee estimates red and blue shifts per tile against interpolated
    green, on the raw, and fits a polynomial (`CA_correct_RT.cc`).
  - darktable's guided correction models both kinds of CA: channels
    misaligned, and one channel blurrier than another (`cacorrectrgb.c`).
- **In infrared specifically.** Kolari: with infrared these issues "can be
  more pronounced, since most lenses aren't designed for the infrared
  spectrum", and "a lot of fringing can happen around foliage, especially
  when the channel mixer is involved" (kolarivision.com, fetched).
- **Demosaic.** darktable's manual recommends AMaZE or RCD for fine detail and
  edges; bilinear gives false colour along edges (search extracts; the SPIE
  paper is blocked).
- **Not found:** a galvanised-steel reflectance spectrum from 700 to 1000nm,
  and an infrared per-channel sensor MTF. Both hosts are blocked by this
  session's network.

Sources: github.com/darktable-org/darktable (`iop_order.c`, `cacorrectrgb.c`,
fetched); docs.darktable.org, the demosaic and defringe modules (fetched);
dcraw.c (fetched); RawTherapee `CA_correct_RT.cc` (fetched);
kolarivision.com, Photoshop CA and IRChrome articles (fetched). Blocked hosts
are listed in the plan and were asked for on 2026-09-24.

## Weighed against

- **021, lens correction on the linear raw before anything else.** Same
  placement, and 021's Rejected reason carries straight over: a fix inside the
  grade leaves "the swap, the mixer and the saturation" to amplify its
  residual. This record extends 021's stage from brightness and colour
  falloff to channel geometry.
- **013, Aerochrome comes out splotchy.** 013 owns the discs, and its own
  source names the remedy for isolated outliers: a median rather than a
  weighted mean. 013's open work measures edge colour, which this record
  changes, so this ranks above 013.
- **009, the editor's working copy at native resolution.** The binning offset
  is a property of the half-size copy. At native resolution it goes away, but
  the lens term does not.
- **034, the red cast in the shadows.** The red on a pylon's own shaded faces
  sits on the metal's pixels and barely moves with co-siting. That is 034's
  ground (shade lit by light bounced off vegetation), not this record's.
- **015, the centre washes out.** Also a lens-correction record, but a
  brightness one, and deliberately separate.
- **052, the look's sky stages.** Sky seen through the lattice is a selection
  problem (028 and 052). This record does not reach it.

## Depends

- touches 021 — same decode-stage placement, extended from falloff to channel geometry.
- touches 013 — 013 owns the discs, and 013's open work measures edge colour this changes.
- touches 009 — the binning half of the offset belongs to the half-size working copy.
- distinct-from 034 — the red on the metal's own shaded faces is 034's shadow cast, not a misalignment.
- distinct-from 015 — a brightness correction, not a geometric one.
- touches 052 — sky through the lattice is a selection the look reads; this record does not reach it.
- touches 028 — the grey sky inside the lattice is 028's sky-through-an-occluder.
- touches 042 — on the reported frame the red is the foliage band, and 042's stage for the look's own bands is its remedy.

## Built already

What exists that this item will use, so a second one is not written:

- **The border clamp is fixed.** `src/raw/demosaic.ts` reads a neighbour at the frame edge by
  reflection and not by clamping, which is this record's first step, already in the code.
- **The home of the binning offset.** `src/raw/demosaic.ts` also builds the half-size editing
  copy by collapsing each 2x2 Bayer quad, which is where red and blue come to sit about half a
  preview pixel apart; co-siting them is done there.
- **Where per-photograph channel geometry belongs.** `src/lensflat.ts` lays the lens flat on the
  linear raw at decode, before the matrix, the swap and the mixer, which is the placement this
  record extends from falloff to channel geometry (decision 021).
- **The instruments.** `tools/look-sheet.mjs` renders variants of one frame through the real
  pipeline for the 1:1 edge crops, `tools/owner-images.mjs` lists and fetches the owner's frames
  (the reported frame and the ones beside it are in `tools/owner-images.json`), and
  `tools/agreement-walk.mjs` holds the screen to the export, which is where a thin edge differs
  between the two.

## Looked at

- The practice frame NIR_3430: the post and lamp-head crops, as shipped, co-sited, co-sited with the lens cancel, and with the offset doubled.
- The practice frame NIR_0063: full-resolution JPEG exports with Aerochrome, before and after the border fix, full frame and all four corners at 8x.
- The reported frame NIR_3461: the editing view and the full export, as shipped, co-sited, and co-sited with the lens offset cancelled; wires, the near and far pylons, the mid pylons and the top edge; and the editing view with Foliage saturation at 0.
- The frame NIR_3463: the editing view as shipped and co-sited, at the tree's edge and the near pylon.
- NIR_3430.NEF: the editing view before and after the built change, the post's 400 rows at four times with the mask of what the count counts beside each panel, the post's wider box and the lamp head at five times, each cut at the window of greatest difference. The blue line down the post's left edge and the red line down its right, continuous before, are a few isolated marked pixels after; a faint blue line and a faint red line are still seen under the count's threshold and the edge reads a little softer. The lamp head's blue rim along the arm and its red ticks are mostly gone, and the sky reads a little darker.
- NIR_3461.NEF: the editing view before and after at the wire against cloud, the wire against sky, the far pylon and the near pylon. The wires against cloud are red in both and read the same, a little softer after, the foliage band's colour and not a fringe. The right-hand wire against sky was a beaded line of vivid-blue pixels and is a continuous pale-blue line after. The far pylon's lattice, covered in blue beads and red dots before, reads as continuous pale-blue strokes after, with the dark red dashes on its thin braces left. The near pylon's vivid-blue edges along the diagonal and the uprights are gone and a thin red line down the right of some uprights is left.
- NIR_3461.NEF: the editing view before and after at open sky, the top-left border and the bottom-right grass. Open sky is the same but for one of the three blue pixels on the small pylon's top; the red edge down the pylon column at the top-left is gone and its blue strokes are continuous; the grass is redder after with the same texture, which is the foliage amount having moved and not the correction.
- NIR_3463.NEF: the editing view before and after at the tree's edge, the near pylon and a wire. The tree crown is smoother and redder after with a thinner pale-blue rim; the red outlines on both sides of the pylon's diagonal members are thinner, while the vivid-blue stripe on one member's lit face stays; the wire is red in both with a smoother edge.
- NIR_1703.NEF: the editing view before and after at the tall tree and the left pines, at five times. The blue rim on the bright-sky side of the tall tree's leaf edges is mostly gone; the thin dark red branch lines read lighter and the needle texture of the pines reads smoother after, which is the cost named in the Outcome.
- NIR_3430.NEF: the half-scale export before and after at the post's rows, the post's wider box and the lamp head. The thin blue line on the post's left and the thin red on its right are the same in both and far fainter than the editing view's were before; the lamp head's sky reads a little darker after.
- NIR_3461.NEF: the half-scale export before and after at the wire against cloud, the wire against sky, the far pylon and the near pylon. The two read the same to the eye.
- NIR_3461.NEF: the half-scale export before and after at open sky, the top-left border and the grass. The two read the same to the eye, the grass a little redder after.
- NIR_3430.NEF: the whole editing view before over after at 640 wide (the jet, the red trees and building, the light post). Nothing is broken and no new artefact is seen at this size; after reads about three percent darker, the sky deeper toward the corners.
- NIR_3461.NEF: the whole editing view before over after at 640 wide (the pylon frame). The same picture, the grass redder; nothing broken and no new artefact at this size.
- NIR_3463.NEF: the whole editing view before over after at 640 wide (the near pylon and the tree at the left edge). The same picture, the grass redder; nothing broken and no new artefact at this size.
- NIR_1703.NEF: the whole editing view before over after at 640 wide (the conifers against cloud). The same picture; nothing broken and no new artefact at this size.
- NIR_3430.NEF: the whole half-scale export before over after at 640 wide. Nothing is broken; after reads darker, as the editing view does.
- NIR_3461.NEF: the whole half-scale export before over after at 640 wide. The same picture to the eye.
- NIR_3430.NEF: one sheet of the whole editing view with Aerochrome pressed at 300 wide, every panel the same crop and scale, in two rows. Row one is the build before the change, the co-sited read alone, the build as built, and as built minus before on the luminance at sixteen times around grey; row two is the before build with the three tone sliders the build as built writes, the build as built with the three the before build wrote, and each of those two minus before at sixteen times. All five pictures are the same jet, blue sky, red trees and building and grey gravel, nothing broken and no new artefact. The difference of as built against before reads a uniformly slightly darker grey over smooth sky and building, with light and dark outlines along edges; with the before build's tone sliders on the build as built the smooth areas read mid grey and only the edge outlines are left; the before build with the as-built sliders reads uniformly darker. That is the darkening seen as the tone pull and nothing else.
- NIR_3430.NEF: the post's 400 rows at three times with the mask of what the count counts beside it, and the lamp head at four times, from the editing view of the build as built with the before build's tone sliders. The post shows a few isolated marked pixels down its right edge and one at the bottom of the left, a faint blue line down the left edge and a faint red one down the right under the count's threshold, as the editing view of the build as built shows with its shipped sliders; the lamp head shows the blue rim along the top of the arm, a red dot at the small fixture and a smooth sky, and no new artefact is seen.
- NIR_3430.NEF: the whole half-scale export of the build as built with the before build's tone sliders at 2000 wide (the jet, the red trees and building, the light post at the left), and the post's 400 rows at three times with the mask beside it. Nothing is broken; the post carries the short cyan and yellow runs down its two edges that the before export carried, no more.

## Options

**Fix the channel geometry where raw pipelines fix it: on the linear raw at
decode, before the matrix, the swap and the mixer.** Chosen. Three steps, in
this order:

- **First, the export's border clamp.** It is a known defect with a known fix,
  and it ships on its own.
- **Then, per-photograph lateral CA correction on the raw together with
  co-siting red and blue in the binned working copy.** The offsets are measured
  from each frame, as RawTherapee does, not a constant, because the sign
  reverses between lenses. The two must ship together: co-siting alone
  turned the right-hand post blue, because it removed the term that had been
  cancelling the lens's.
- **Then, only if what remains is blur rather than shift,** guided correction
  of the blurrier channel. On the post, 149 red pixels remained after the
  first two.

Rendered on the reported frame's own NEF, full frame and 1:1 crops of a wire, a far
pylon, the near pylon, open sky and the frame border, in preview and export,
before any code beyond the border fix. A frame with trees against the sky is
the cost control for leaf edges.

## Rejected

- **A defringe or saturation guard inside the grade**: 021's reason, since the swap, the mixer and the saturation amplify whatever residual a grade-side fix leaves; and a hue-keyed defringe cannot tell a fringe from foliage on a one-axis camera.
- **A foliage-band guard against edge pixels**: 013's rejected gate, which removes the cost by removing the operation, and it would take the red off every leaf edge against the sky.
- **Co-siting red and blue on its own**: measured to turn the other side of a post blue, because the binning offset had been partly cancelling the lens's.
- **A constant radial red/blue scale (dcraw -C with fixed numbers)**: the lens term's sign reverses between focal lengths, so any constant is wrong for half the frames.
- **Treating it as the metal's infrared reflectance**: one post is blue on one edge and red on the other; reflectance cannot do that, and it cannot colour cloud pixels beside a wire.
- **Lowering Foliage as the fix**: 013's own words, fixing a noise problem by removing the thing that was chosen answers a different question; it greys all foliage.

## Rank

**First, from 2026-10-17.** Aerochrome's global saturation of 2.4 and foliage band of 1.3 landed that
day on the owner's yes, with the vivid blue outlines and red rims on thin dark edges against bright
sky named as still wrong and this record next (record 019, second outcome). Two reasons, and the
second is this repository's own test for a reported defect, which is dependency and not who
reported it. First, it is the owner's direction. Second, the records it sat below no longer have to
come first: 052, 013 and 069 are sky-stage records and Aerochrome carries no sky stage since record
087's Outcome, so nothing built for them has to be redone once the edge is fixed; and the film model
(066) is unbuilt, and its colour re-attachment would be tuned against whatever edge this record
leaves. The outlines also grew since this record was filed, because the global saturation scales
them with the sky's colour: the share of vivid blue pixels in a pylon lattice's box is 1.60 percent
under the landed look against 0.001 in the build with the sky stages out (record 019's second
outcome). The border clamp, this record's first step, is already built; the work left is the
per-photograph channel correction on the raw with co-siting, then the guided correction only if
what remains is blur.

**History: re-ranked 2026-09-25: fifth, below 066 and above 067.** The Aerochrome work
leads the queue. This goes below 052, 013 and 065, which change the sky it is
seen against, and below 066, because the film model's colour re-attachment
respects thin edges and nothing in it is tuned against them, while this work
is the largest piece and touches thin edges only. It stays independent of 042
and 060. The border fix is small and can ship with any product candidate.

## Outcome, 2026-10-20: the per-photograph correction and the co-sited working copy are built on staging, and what is left is a small blue shift

**What was built, and where.** One change on the staging branch, in the decode and not in the grade: no `EditParams` field, no slider, and no look rides it.

- `src/raw/chromatic.ts` (new) measures each photograph once at decode. A window per tile of 128 photosites (about 330 tiles read whatever the frame's size) fits red's and blue's shift against a green made at every site by Gauss-Newton, and a robust fit over the frame of a constant term and a radial polynomial gives the field. A shift under 0.08 photosite is left alone and one over 1.5 is not believed. Red and blue are moved by a bilinear read of each colour's own lattice, in place on the linear raw, before the lens flat, the camera matrix, the swap and the mixer.
- It runs in the decode worker and on the page's fallback path, from `src/raw/nef.ts` and `src/decode.ts`, and the result is stored with the photograph. `src/export.ts` applies the stored numbers to the frame it re-reads and carries them to the export workers, so an export never measures again.
- In `src/raw/demosaic.ts` the binned working copy reads red and blue at the quad's centre from their own lattice (weights 9, 3, 3 and 1 sixteenths), so the three channels sit where the averaged green does. The two halves ship together, as the Rejected section's bullet on co-siting alone requires. The file's opening comment, which said the binning is not free of artefacts without saying what had been done, now says it.
- `PREVIEW_PIPELINE` in `src/previewcache.ts` went from 97 to 98 and `tools/.preview-pipeline` was recorded, because the change moves the decode files that tool hashes. The copied report gains a "Channel alignment" line: the corners per channel, whether it was applied or left alone and why, the tiles read and the time.

**The counts.** One rule for every count, on the 8-bit picture the editing canvas draws with Aerochrome pressed and nothing else touched: a pixel is red when its red is at least 128 and leads green and blue by 64, and vivid blue when its blue is at least 128 and leads red and green by 64. Red and vivid blue, before then after:

- NIR_3430.NEF: the post's 400 rows 239 and 462, then 16 and 5; the post's wider box 130 and 200, then 6 and 1; the lamp head 21 and 130, then 12 and 22. The 469 and 667 earlier in this record are the same count made in September with the look as it was then; 239 and 462 is the look as the tree drew it on 20 October.
- NIR_3461.NEF: wire against cloud 501 and 0, then 527 and 0; wire against sky 16 and 28, then 25 and 3; far pylon 198 and 189, then 38 and 14; near pylon 632 and 428, then 282 and 5; open sky 3 and 3, then 0 and 1; top-left border 7 and 53, then 0 and 18. The bottom-right box is red grass (17253 red and no blue, then 19244 and none) and is not a fringe place.
- NIR_3463.NEF: tree edge 867 and 151, then 1195 and 132; near pylon 606 and 606, then 285 and 315; wire 207 and 2, then 236 and 0.
- NIR_1703.NEF: tall tree 2513 and 832, then 2791 and 247; left pines 6012 and 18, then 6025 and 7.
- The look reads its own foliage amount from each decode, and the control read back moved with the change on two frames: 1.32 to 1.34 on NIR_3461.NEF and 1.44 to 1.51 on NIR_3463.NEF (NIR_3430.NEF and NIR_1703.NEF stayed at 1.3). The amount differs by frame, so red counts at foliage edges, grass and wires are read against the same frame only, and on these two they carry that move.
- The plants on the new post picture still read in the direction found before: null 16 and 5, co-sited 0 and 0, doubled 18 and 13, and the control that moves both planes the same way 0 and 13. Under Aerochrome the displayed red plane carries the sensor's blue and the displayed blue plane the sensor's red, because the swap runs before the mixer, so any count or plant on the displayed picture names which sensor channel a displayed plane carries; the correction acts on the sensor's planes.

**The half-scale export, and what the preview carried that the export did not.** Before the change the export already carried far less fringe than the preview at the same places: the far pylon of NIR_3461.NEF 2 and 0 against 198 and 189, its near pylon 268 and 0 against 632 and 428, and the post of NIR_3430.NEF 88 and 60 against 239 and 462. So most of what the editing view showed was the binned copy and not the lens. After the change the export is unchanged to within the foliage amount's move (the post of NIR_3430.NEF 84 and 63, its wider box 57 and 32, its lamp head 5 and 11; NIR_3461.NEF wire against cloud 576, wire against sky 20, far pylon 2, near pylon 270, open sky 0, top-left border 0 and 9, none with vivid blue but that border), and the editing view now agrees with it. The share of pixels that differ by more than 12 levels between the screen's picture reduced to the export's size and the export fell from 9.50 to 2.50 percent on NIR_3461.NEF and from 18.04 to 10.36 percent on NIR_3430.NEF.

**NIR_3461.NEF is the co-siting alone.** The estimator reads its red and blue corner offsets at +0.01 and -0.01 photosite, under the dead zone, so the fit is about zero and nothing is moved on this frame: the change is the half of the pair that removes the binned copy's own offset. On the sheets the vivid blue along the pylon lattices and the pixel-wide blue beads along the right-hand wire are gone, replaced by continuous pale-blue strokes, and the red on the wires against cloud and on the thin braces is the foliage band's and stays.

**The cost on leaf edges, NIR_1703.NEF, the cost control.** The tall tree's vivid blue falls from 832 to 247 and the left pines' from 18 to 7, and the sheets show the blue rim on the bright-sky side of the leaf edges mostly gone. The cost is softness. The root-mean-square gradient of the displayed red plane after, as a fraction of before, is 0.80 at the tall tree and 0.89 at the left pines (displayed blue 0.90 and 0.91, green 0.95 and 0.92), and the sheets show the dark branch lines lighter and the needle texture of the pines smoother. It is the price of reading red and blue from four photosites each in the working copy; the export's demosaic reads each photosite's own colour and is not softened by it (the same ratio on the exports reads 0.99 to 1.02 at every place of both frames). The same ratio at the thin-edge places runs from 0.53 to 0.99, lowest for displayed red (0.53 at the far pylon of NIR_3461.NEF), so part of that fall is the fringe's own gradient leaving.

**What remains on the post, shift or blur.** Read on the sensor's own colour planes, row by row over the post's 400 rows of NIR_3430.NEF, with red's and blue's edge columns taken against green's on the same row, in photosites of the full mosaic, as medians. Blue minus green is -0.43 and -0.46 at the left and right edge before the alignment and -0.15 and -0.22 after; red minus green is +0.16 and +0.17 before and +0.10 and +0.11 after. A shift gives the same sign at both edges and blur gives opposite signs; these are the same sign. The steadier 25 to 75 percent width of blue's edge is 2.39 and 1.93 before and 2.60 and 2.25 after, against green's 2.51 and 2.11 (narrower than green's by 5 and 9 percent before, wider by 4 and 7 percent after), and red's equals green's within 2 percent. The 10 to 90 percent width of blue is noise-limited, its quartiles running from 5 to 24 photosites, and is not used. What remains on the post therefore reads as a small shift of blue, 0.15 to 0.22 photosite, and not as blur, so the third step of the chosen option, guided correction of the blurrier channel, is not owed on this evidence. The lever that is left is a finer field or a second pass for blue. The same reading on the displayed picture was not used: under the mixer each displayed plane is a mixture of sensor planes, and the bright fringe lines make a displayed plane non-monotone across an edge.

**Two blue corner residuals remain above a tenth of a photosite.** With the estimator run again over the corrected planes, NIR_1703.NEF reads 0.177 (against -0.35 estimated) and NIR_3430.NEF 0.119 (against +0.52). The red residuals are 0.032 to 0.069 and the blue of the other two frames 0.041 and 0.091. A bilinear read of a sparse lattice moves a sharp edge by less than asked, about half on NIR_1703.NEF and about three quarters on NIR_3430.NEF; at the post the blue moved from -0.45 to -0.19, about 60 percent of the way. A second pass or a cubic read would move it further and was not built, because a cubic read can overshoot at an edge and the Aerochrome mixer amplifies an overshoot.

**The cost every decode now pays.** In this container (node on a 5600 by 3728 frame, not a device) the estimate reads about 330 tiles in 0.5 to 0.9 s and the alignment takes up to 0.4 s on a frame that moves, and the quick-look strip's tile jobs pay it too because they decode in the lanes. The half-scale export's press to its Ready line took 96.6 s against 89.1 s on NIR_3461.NEF and 87.5 s against 88.8 s on NIR_3430.NEF. These are container pointers; the device's number is owed to the test page, and the copied report's "Channel alignment" line states the time per photograph on the device.

**What turned out wrong, and where it comes from: the depth lift pulls the tone curve twice as far.** NIR_3430.NEF renders darker after the change, in the editing view and in the export. On a grid of 7 by 5 cells the editing view's mean is lower by 1 to 6 levels in all three channels across most of the grid (displayed red 6.1 lower at the top left, 1 to 4 lower near the centre), the exceptions being four cells of the fourth row where red is up to 2 levels higher; the whole frame's displayed mean is 124.7, 107.8 and 112.8 before and 121.8, 105.3 and 110.2 after; the export's whole-frame mean is 125.6, 108.9 and 113.5 before and 121.8, 105.8 and 110.7 after. The skies and centres of the other three frames move by about 1.6 levels at most, and their grass, foliage and tree cells move with the foliage amount. Three causes were measured first and none is it: the alignment leaves the sensor planes' means where they were (0.012 percent at most); no binned pixel of any of the four frames is at the pin the clip test uses; and the app's own gray-world balance and auto exposure, run on the plain and on the co-sited binned copies without the camera matrix, differ by under 0.05 percent in the gains and 0.22 percent in the exposure.

Traced on 20 October by reading every range input, toggle and select of the page at open and after Aerochrome on NIR_3430.NEF, in three arms of the one build served from the same folder, the arms made by rewriting the script text the browser is sent and never by an edit in the tree: as built; with the two tests that decide whether a colour is moved onto green rewritten, which leaves the co-sited read alone; and with that and the co-sited read's weights rewritten to the colour's own photosite, which draws the build before the change. The third arm's canvas signature after the press equals the one recorded for the before build and the first arm's equals the one recorded after, and the third arm's counts at the held places are exactly the baseline's (the post's 400 rows 239 and 462), so the arms are what they are named. At open the exposure, the three gains, Recover highlights and every other control are identical in the three arms except the Denoise strength the open measures: 0.40 before, 0.33 co-sited only, 0.32 as built (red and blue now leave the decode with less noise, seen by a second instrument), and the opened picture is not darker (whole-frame means within 0.4 of each other). After Aerochrome the Denoise reads 0.45 in all three, the look's floor, and the only controls that differ are the Restore depth lift's tone points: Shadows -2.5 before, -5 co-sited only and -5 as built; Midtones -1.5, -2.5 and -3; Whites -0.5, -1 and -1. The lift reads the median luminance of the frame as the look renders it on a grid of 64 divisions of the binned copy (`measureFrame` in `src/tile.ts`, undenoised pixels) and pulls the tone curve down until that median reaches its fixed reference of 0.44. The median before any pull is 0.4560 before, 0.4722 co-sited only and 0.4736 as built, and the pull it settles on is 0.0241, 0.0481 and 0.0516, reconstructed from the measurements the page made (the shadow floor never binds); the median lands on 0.4403, 0.4418 and 0.4411. Of the rise of 0.0176 in the median 0.0162 is the co-sited read and 0.0014 the lens alignment.

**The attribution, tested both ways.** The three tone sliders were set through the page's own events once the look had settled. The build as built with the before build's three values (-2.5, -1.5, -0.5) gives whole-frame means of 125.6, 108.4 and 113.0 on the canvas, which is 0.9, 0.5 and 0.1 brighter than before and not darker, and 125.55, 108.92 and 113.50 on the half-scale export, the before export's means; the before build with the as-built values (-5, -3, -1) gives 120.9, 104.8 and 110.1, which is 3.8, 3.1 and 2.7 darker than before. The whole darkening, 2.9, 2.5 and 2.6 levels of 255 on the canvas (about 2.3 percent), is therefore the lift's pull and nothing else. The fall in the fringe counts does not owe anything to it: with the before build's values on the build as built the post's 400 rows count 29 red and 3 vivid blue (baseline 239 and 462, as built 16 and 5), the post's wider box 17 and 0 (130 and 200; 6 and 1), the lamp head 14 and 22 (21 and 130; 12 and 22), and on the half-scale export the same three places count 88 and 60, 61 and 31, 7 and 11, which are the before export's counts exactly.

**So the cause is not a fault of the change, and nothing was changed.** The correction lowers the noise of red and blue in the decode, the lift measures the look's median on those undenoised binned pixels, reads it 0.0176 higher, and puts the tone curve down twice as far to bring the median back to the reference it was calibrated on with the noisier pixels. The frame lands on the same median; the rest of its distribution comes out about 2.3 percent darker. Why the rendered median rises when the noise falls is the account that fits these numbers and was not tested separately. The lift's reference could be measured again on the corrected decode, which is a change to a look and not to the decode, and is not made here.

**What is owed.** A device pass on the iPad at 1:1 on the pylon frames and a tree frame, at the wires and the post edges, and a look at whether the jet frame opens too dark with Aerochrome pressed, which is now the lift's answer and measured at about 2.3 percent.
