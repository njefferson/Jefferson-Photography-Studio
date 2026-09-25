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

## Looked at

- The practice frame NIR_3430: the post and lamp-head crops, as shipped, co-sited, co-sited with the lens cancel, and with the offset doubled.
- The practice frame NIR_0063: full-resolution JPEG exports with Aerochrome, before and after the border fix, full frame and all four corners at 8x.
- The reported frame NIR_3461: the editing view and the full export, as shipped, co-sited, and co-sited with the lens offset cancelled; wires, the near and far pylons, the mid pylons and the top edge; and the editing view with Foliage saturation at 0.
- The frame NIR_3463: the editing view as shipped and co-sited, at the tree's edge and the near pylon.

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

**Re-ranked 2026-09-25: fifth, below 066 and above 067.** The Aerochrome work
leads the queue. This goes below 052, 013 and 065, which change the sky it is
seen against, and below 066, because the film model's colour re-attachment
respects thin edges and nothing in it is tuned against them, while this work
is the largest piece and touches thin edges only. It stays independent of 042
and 060. The border fix is small and can ship with any product candidate.
