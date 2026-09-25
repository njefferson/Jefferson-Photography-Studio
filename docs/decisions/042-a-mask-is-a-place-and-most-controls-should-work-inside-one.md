# 042 · A mask is a place, and the ordinary controls act inside it

## Context

Filed 2026-09-21 from the device as two asks in one sentence. Masks should come
out of the tab strip into a place of their own, and inside a mask a reader
should not be limited to what the mask menu offers.

The first half shipped in 2.61 (see Built already). The second half was settled
on 2026-09-24 as a ruling, and it asks for more than the record first read into
it. Three requirements:

- **Selection quality is part of the job.** A mask's edge follows the subject;
  a coarse selection is a defect, not a limit to design around.
- **The ordinary controls act inside a selected mask, with no mask-only
  submenu.** Every control that can act on a place does; each that cannot says
  why.
- **The design follows established editors** rather than being derived here.

It arrived with three measured reasons from the device, on the same day:

- A gradient cannot draw the hard edge of a lawn.
- Foliage amount exists only in the Aerochrome finishing panel and applies to
  the whole frame. The foliage band selects a colour, not a place (`main.ts`,
  "the infrared-bright red after the swap"), so bright cladding on a building
  turns red along with the grass.
- Sky seen through a pylon's lattice takes no sky adjustment. That is 028's
  ground, and through the look's own sky map it is 052's.

**What the app does today, measured.**

- A `MaskLayer` carries five adjustments: brightness, contrast, saturation, hue
  and warmth. They fold in at one point in `compileEdit`, mirrored in
  `src/gl.ts`.
- Six whole-photo tools can be aimed at a mask with "here only" toggles. An aim
  is a weight on the whole-photo amount, not a value of its own.
- Everything else is whole-frame, and the look's own stages (the foliage and
  sky bands, the sky stages) run where no aim reaches.

**Stage 0's instrument, answered on the target device, 2026-09-24.** The edit
shader uses 148 of 1024 fragment uniform rows and 14 of 16 texture units. At
about 19 rows a mask there is room for about 46 masks' own values, so per-mask
values live in uniforms; a parameter texture would take one of only two free
units and is not needed. Frame time with eight masks is still owed, and lands
with stage 1.

**Stage 3's foliage band, measured on the reported frames' own raw files the
same day.** Three reports from the device land on it: a gradient cannot draw
the grass's edge, the wires and pylons against cloud turn red, and the cladding
on a building turns red with the grass. The band selects a colour, not a place:

- NIR_3461, Aerochrome as shipped against the same with Foliage saturation at
  0: strongly red pixels above the horizon go from 16,430 to 0.
- NIR_3467: on the building, 13,561 to 0; on the ground, 87,991 to 0. The
  grass needs the band and the building does not, which is the whole case for
  limiting it to a place.

**It moved up on 2026-09-24, late, into stage 2 (see Rank).** The band runs
before the mask stage (`src/gl.ts`, the band ahead of the mask loop), so it
needs a place mask's weight evaluated early. That weight is already computed
there: `aimWeightOf` folds a place mask's group before the band, which stage 1
built. What it genuinely needs beyond that is stage 2's switch, because a mask's
own Foliage value has to be set somewhere. Its scope is place masks: gradient,
radial, brush and the sky bitmap. A colour mask keys on the colour after the
band, so limiting the band by one would be circular.

**What can be done before the switch ships, measured the same night on
NIR_3461.** A gradient covering everything above the grass, with a colour mask
picked on a saturated red joined to it by Only where both, and the group's
saturation at 0, works at the mask stage, which runs after the band. In the
full export, strongly red pixels above the horizon went from 233,425 to 43,733
and the grass was untouched (1,975,208 to 1,965,729). The wires go dark, the far
pylon loses its red, and the red trees on the horizon go dark with them, which
is that route's cost. Two things were found on the way:

- **It did not work in the export at first, and that was a defect.** The
  export's pipeline computed the colour key only when a group's first mask was
  a colour mask, so a colour mask joined to any other mask keyed on black in
  every export, quick-look preview and strip tile while the screen keyed it
  correctly. Fixed in the held candidate (8b6f758), with
  `tools/join-fold-check.mjs` holding the joined case; it was seen failing on
  the old line first.
- **Found, not fixed: the round discs differ between the screen and the
  export.** With the workaround on, the Sky colour smoothing discs stay pink on
  screen and are faint in the export. As shipped, the two agree on the whole
  (1.088% and 1.075% of the area above the horizon strongly red), so the
  difference sits in how the sky map sees the masks. The discs are 013's.
  One cause was found and fixed on the held build (52cfc7d): the screen's sky
  map was keyed on the edit without its masks, so it kept the map from before
  a mask changed. Whether that is the whole of the discs' difference has not
  been measured again.

**Stage 2 built and held, 2026-09-25 (096efa2, with the sweeps in 69b58b1).**
The chip row, the Editing line with Back to whole photo, and Exposure, Warmth,
Hue shift, Saturation, Contrast and the Foliage band acting on the picked mask;
everything else inert with its reason. A mask's Foliage is M1's offset on the
whole-photo value, summed where masks overlap and clamped, read before the band
through the group weight; a mask that is or joins a colour mask refuses it
(`groupCanAim`).

**Lens correction bears on it, measured the same night.** The matched shipped
profile (50-250) opens at 0 in a fresh session and is remembered per lens and
aperture after that. At 1, in Aerochrome:

- NIR_3463: the pink-red at the centre of the cloud goes; strongly red above
  the horizon on screen, 125,122 to 112,923. That colour shift is the hot spot
  reaching the band, which the lens profile corrects before the swap.
- NIR_3461: the wires, the far pylon's lattice and the discs are as red at 1 as
  at 0 (39,711 to 37,252). The lens profile is not the wire fix.
- NIR_3467: in the export, strongly red above the line goes from 1,706,226 to
  239,550, most of it the cladding.

So the switch was rendered with the profile at 1, as a reader has it. In the
full export, strongly red above the line went from 114,416 to 0 on NIR_3461
and from 239,550 to 0 on NIR_3467, with a gradient over everything above the
grass at a Foliage saturation offset of -2; screen and export agree (0 and 0).
Its cost, looked at: the red trees on NIR_3461's horizon and a small tree on
NIR_3467 go grey; the gradient's feather reaches the grass, which goes from
54.5% to 52.1% of the area below the line strongly red on NIR_3461 and from
55.3% to 53.6% on NIR_3467; a pylon leg standing in the grass stays red, where
the route is a colour mask joined to a brush. With the lens on and no masks the
screen counted more strongly red than the export (3.480% against 1.434% on
NIR_3467); drawn at the preview's size the export counts the same, and per
radial ring the two differ by at most 1.5 levels in 255 with the lens on or
off, so it is a threshold count on a surface the lens moves close to it, not
a lens-path disagreement.

## Looked up

**The editor whose shape matches the ruling is Capture One, not Lightroom
Classic.**

- Lightroom Classic's local panel is a separate set of sliders, and its global
  panels do not follow the selected mask (Adobe community expert, 2023-12-21,
  fetched).
- In Capture One, selecting a layer makes every tool that can act on a layer
  follow it, with a mark in the tool's header (captureone.com, search extracts
  only; the hosts were refused by this session's network).
- That is the second requirement's shape: the ordinary controls follow the
  selected mask, with no separate mask menu.

**No surveyed editor lets every control work on a mask.**

- Lightroom's local set (Adobe community expert, 2023-12-20, fetched):
  - Light: exposure, contrast, highlights, shadows, whites, blacks, and the
    curve, which it has had since April 2023.
  - Color: temp, tint, hue, saturation, and point colour.
  - Effects: texture, clarity, dehaze, and grain on the web version.
  - Detail: sharpness, noise, moiré, defringe.
  - HSL and calibration stay global.
  - Per-mask Feather and Edge shipped in August 2026.
- Adobe's sidecar format gives each mask its own LocalExposure2012,
  LocalContrast2012, LocalSaturation, LocalTemperature, LocalTint,
  LocalSharpness, LocalLuminanceNoise and LocalToningHue, plus a
  CorrectionAmount for the whole mask (exiftool, `XMP.pm` lines 548-576,
  fetched).
- darktable is built on "every module takes a mask", yet 27 of its 97 modules
  cannot take one. This was counted from each module's `flags()` at commit
  e7be98dd.
- So in every editor, "all controls" means all tone, colour and detail
  controls. The input side (decode, lens, demosaic) and geometry stay global.
- darktable does mask its channel mixer. Lightroom and Capture One keep the
  colour space global.

**How a masked control gets its value: two models.**

- In Lightroom and Capture One, the mask's value is an offset on top of the
  whole-photo value, starting at no change. Local Temp "is about making the
  image relatively warmer / cooler than it would otherwise have been"
  (community expert, fetched). Overlapping masks add.
- In darktable, the tool's own amount is gated by that tool's mask. A second
  instance gives a different local value.
- This app's aims are the second model's shape without the second instance.

**Edges.**

- Lightroom's Edge and darktable's feathering guide both refine a coarse
  selection against the photograph's own edges. The sky mask already does this
  with a guided filter (`src/skyfine.ts`).
- A colour or tone range is conventionally limited to a place by intersecting
  it with one (PetaPixel's 2021 hands-on with Lightroom masking; darktable's
  exclusive drawn-and-parametric mode).

Sources: docs.darktable.org, masking and blending (fetched);
community.adobe.com, Lightroom masking threads of 2023-12-20 and 2023-12-21, and
the tone-curve and Feather-and-Edge announcements (fetched);
raw.githubusercontent.com/exiftool/exiftool, `lib/Image/ExifTool/XMP.pm`
(fetched); petapixel.com, "Hands-on with Lightroom's powerful new masking
system", 2021 (fetched); helpx.adobe.com and captureone.com (search extracts
only; both hosts refused).

## Built already

These EXIST, and this record is the next layer over them, not a second version.

- **The mask place, shipped in 2.61:**
  - c0c9c9b, "New: masks have a place of their own";
  - 88f30c6, "Fixed: a mask's controls say what they do without a hover";
  - be49e94, "Changed: Whole-photo tools, here only is open when you open a
    mask".
  The list, add, feather, join, reach, colour, brush, hand fixes, invert, the
  overlay and the matte all live there.
- **030's aims, shipped:**
  - `MaskLayer.aims` holds the bits for dehaze, clarity, shadow colour, lens,
    noise and texture;
  - `aimWeight` and `aimWeightOf` resolve them;
  - `aimedSampler` runs the spatial stages twice and blends.
  Absent means whole-frame, so every saved edit renders identically, and
  `tools/aim-walk.mjs` holds that at 0.000% of the frame moved.
- **Gates that already cover the mechanism:** `aim-walk`, `agreement-walk`,
  `scope-check` (which cannot yet see `MaskLayer`), `mask-panel-walk`,
  `mask-slots-walk`, `mask-truth-walk` and `export-bytes-walk`.
- **stash@{0} (4291348), unshipped.** "042 Effects pair — per-mask
  dehaze/clarity amounts". Inside the mask its value replaces the whole-photo
  value, and where masks overlap the heaviest one wins. That is an answer to
  decision M1 below, made before the question was asked, so it is re-decided
  rather than applied.

## Weighed against

- **030, "A mask can only act in one place"**, shipped the aims.
  - Its Rejected 3 is a REORDERABLE pipeline, darktable's model. It stays
    rejected.
  - What this record reopens is narrower: a mask acting at the stages of a
    pipeline whose order stays fixed.
- **The cost this record used to cite, re-weighed.**
  - The cost it named was a rewrite of `compileEdit`, `gl.ts`, `stampOf`, the
    preview cache and the export all at once. It is real in kind and wrong in
    shape.
  - With the order fixed, a per-mask value is a per-pixel parameter, and the
    stage still runs once.
  - `stampOf` and the preview cache are untouched if the values live in
    `MaskLayer`: thumbnails render with no masks, and the stamp holds no mask
    field.
  - The export costs only for the spatial stages (denoise, and the CPU paths
    for sharpen and texture).
  - The IR-SCIENCE 9l-ii corruption it cited was an unclamped 16-bit write,
    fixed at every stage since, and not a stage move. Its lesson carries over
    as a method: every stage that gains per-mask values is measured on an
    exported TIFF.
  - The costs it never counted set the order instead. The first is the iPad's
    GPU budget: the shader uses 76 non-sampler uniforms today and texture units
    0-13, and the device's limits are not measured. The second is that
    `main.ts` has a single `params` target, with about 604 references and a
    dozen writers that bypass `syncFromUI`.
- **032, a mask keys the photograph and not the grade.** Colour masks cannot
  drive a stage that runs before the mask stage, because their key does not
  exist yet at that point. Until 032 lands, those controls step aside for a
  colour mask with a sentence saying why.
- **052, the look's sky stages read a selection you cannot see.** Under this
  model the look's sky values become a sky mask's own values. That is stage 5,
  done together with 052.
- **048 and 050** wait on the same wiring: a union join, and box and lasso
  shapes.
- **060, the top bar.** The "editing this mask" indicator goes in the drawer's
  heading, never in the bar, which has no room.
- **003, the drawer.** This record used to say the drawer's portrait behaviour
  had to be decided before stage 2 builds into the drawer. The premise was
  per-mask sliders growing inside the mask place. The ruling (the ordinary tabs
  follow the mask) and M3 (a chip row on the tab strip) removed it: the chips
  travel with the tabs wherever the drawer goes. What remains is a cost, one
  more row in portrait until 060's bar lands.
- **The Aerochrome red-edge research, settled (061).** On the reported frame
  the red on the wire is the Foliage band painting the wire's own slight colour,
  not the channels misaligned. A place limit does not have to follow a 1-3px
  wire: the wire sits inside a coarse place above the horizon, which the
  workaround above shows.

## Looked at

- The reported frame NIR_3461: the editing view in Aerochrome as shipped and with Foliage saturation at 0, the wires, the far pylon and the near pylon.
- The frame NIR_3467: the editing view in Aerochrome as shipped and with Foliage saturation at 0, the building and the ground.
- NIR_3461 again, 2026-09-24, night: the full export in Aerochrome as shipped against the same with the workaround masks, full frame and at full size on the wires against cloud, the far pylon, and the horizon trees and grass; and the editing view against the export on the far pylon, where the discs differ.
- NIR_3463, 2026-09-25: the editing view in Aerochrome with the lens profile at 0 and at 1, full frame, the cloud's centre.
- NIR_3461, 2026-09-25: the far pylon with the lens profile at 0 and at 1; then the full export with the profile at 1 against the same through the switch, full frame and on the wires, the far pylon, the horizon trees, and a pylon leg in the grass.
- NIR_3467, 2026-09-25: the export's cladding with the lens profile at 0 and at 1, and the editing view against the export with it at 1; then the full export with the profile at 1 against the same through the switch, full frame and on the building, the small tree and the grass.

## Depends

- needs 030 — shipped; the aims are the wiring this extends.
- touches 032 — colour masks cannot drive early stages until 032 re-keys them.
- touches 052 — stage 5 turns the look's sky values into a sky mask's own values, together with 052.
- touches 048 — the union join lands in stage 1.
- touches 050 — box and lasso shapes are the hard edges a gradient cannot draw.
- touches 060 — the editing indicator stays out of the top bar; candidate B adds controls over the photograph where mask handles are drawn.
- touches 003 — the chips ride the tab strip, so the drawer's portrait behaviour no longer gates stage 2; it costs one more row in portrait until 060's bar lands.
- touches 040 — the mask panel's list and naming survive; its five sliders and six aim toggles move out.
- touches 024 — every control that cannot act on a mask says why, in words.
- touches 028 — sky seen through a lattice or a canopy is a selection that has to be completed.

## Options

**Capture One's shape, in this app's own inventory: select a mask and the
ordinary tabs act inside it; the mask place keeps only what shapes the
selection; built in stages, each shippable and checkable on its own.** Chosen.

- **Stage 0: the records, an instrument and pictures.** No product change.
  - The instrument is a test-page button that reads the device's fragment
    uniform and texture-unit limits and times a frame with eight masks.
  - The pictures show the indicator, the panel in both modes, and the
    Aerochrome finish panel with a mask targeted.
- **Stage 1: one group-weight function for everything that reads a mask.**
  - This fixes a defect: a tool aimed at a mask ignores how the mask was
    joined, so a subtracted area still gets the tool (`pipeline.ts`
    `aimWeight`, `gl.ts` `aimWeightOf`). The fix is rendered before it is
    built.
  - It also adds a per-mask parameter store and 048's union.
- **Stage 2: the switch, with Foliage as its first new per-mask value.**
  - **The chips (M3).** A row above the tab strip: Whole photo first, then one
    chip per group head, named as in the mask list. One tap targets; the
    targeted chip is pressed (`aria-pressed`); every chip is at least 44px. The
    row shows only while the photograph has a mask.
  - **The heading.** "Editing: Sky 1 · Back to whole photo" sits in the
    drawer's sticky heading, is announced in a live region when the target
    changes, and its way back is a button at least 44px tall.
  - **What follows a targeted mask in this release**, each starting at no
    change (M1):
    - the mask's five existing values, moved out of the mask place into the
      tab controls with the same meaning: Exposure on Basic (the mask's
      brightness, shown in stops), and Hue shift, Saturation and Contrast on
      Colour; Warmth takes the place of the three gains on Basic, because a
      mask gets a relative warm or cool, never an absolute white point;
    - **the Foliage band on Colour (Hue, Saturation, Luminance)**, new: the
      mask's own offsets, stored as an optional `MaskLayer` field, absent
      meaning no change. The Aerochrome Finish panel's Foliage row follows on
      its own, because it mirrors the Colour tab's slider by id.
  - **How a Foliage offset combines.** At a pixel the band's value is the
    whole-photo value plus each group's offset times that group's joined place
    weight, summed where masks overlap (the Lightroom convention), then held
    to the slider's own range. The weight is the same fold `aimWeightOf`
    computes before the band. A group that is or holds a colour mask adds
    nothing to the band, and its Foliage row shows disabled with the reason in
    words (`groupCanAim`).
  - **Every other control** shows disabled with its reason while a mask is
    targeted, naming the stage that brings it.
  - **The mask place** keeps what shapes the selection. Its five sliders
    leave in this release, because their controls now live in the tabs. The
    six aim toggles stay until each tool they point becomes per mask, so
    nothing a reader can do today stops working between releases.
  - **Saved edits.** The five values keep their fields and their math, and a
    Foliage offset is absent in every existing edit, so nothing converts and
    everything renders as before. The Convert is owed only when an aim gives
    way to a per-mask value.
  - **Where it is held true.** The shader and `compileEdit` both, and every
    export and preview path through `compileEdit`; per-mask Foliage costs 8
    uniform rows of the 876 free.
- **Stage 2b: the other stages after the mask stage, per mask:** contrast
  beyond the mask's own, the curves, HSL, B&W, shadow colour, grade, luminance
  and LUT strength. The curves need texture units, and 2 of 16 are free on the
  iPad, so they are measured first.
- **Stage 3: the rest of the stages before the mask stage:** exposure beyond
  the mask's own brightness, white balance as relative gains, saturation, hue,
  tint and glow, for masks that are not colour masks.
- **Stage 4: the spatial stages on the CPU, one commit each:** clarity and
  dehaze, then sharpen and texture, then noise.
- **Stage 5: the sky stages as a sky mask's values, with 052.**
- **A quality lane in parallel:**
  - Follow edges (the sky's guided filter) on every mask type, and a feather
    for the gradient;
  - ranges intersected with places (050, 032);
  - full-resolution edges, only if the red-edge research blames selection
    resolution;
  - completing selections (049, 028, 052).

**Whole photo only, each with its reason shown in words while a mask is
targeted, and each with a convention to point to:**

- geometry and heal;
- the decode and the raw lens flat;
- the absolute white point, since a mask gets relative gains instead;
- the Auto and measurement buttons;
- the choice of look;
- the LUT file, though its strength can go per mask;
- despeckle.

**Open, and answered from pictures or in a word:**

- **M1, what a mask's value means.** The recommendation is an offset on the
  whole photo, starting at no change, as Lightroom and Capture One do it. The
  alternative is the value that applies inside the mask, as the stash does
  it.
- **M2, the swap and the 3x3 mixer.** The recommendation is whole photo only,
  as Lightroom and Capture One do it. Per mask would be darktable's way, and
  it has never been rendered on an infrared frame.
- **M3, where the mask list lives.** The recommendation is a row of chips above
  the tabs, one tap to switch. The alternative is the mask place, then an
  "Editing" banner over the tabs.

**M1, M2 and M3 answered 2026-09-24 by convention, not by the pictures:** a
mask's value is an offset on the whole-photo value, starting at no change (M1,
Lightroom and Capture One); the channel swap and the 3x3 mixer stay whole-photo
(M2, both); and the masks sit as a row of chips above the tabs, one tap to
switch (M3, the recommendation above: it is the most direct form of the Capture
One model this record chose, where picking a mask makes the ordinary tools
follow it; the research does not establish where Capture One places its own
list). Stage 2 builds on these three.

## Rejected

- **Lightroom Classic's separate local slider set**: a submenu under another name, which the 2026-09-24 ruling rules out; and two panels holding the same sliders is two answers to one question.
- **A reorderable pipeline**: 030's Rejected 3, and it stays rejected; the ruling asks for a mask at every stage, not for stages to move.
- **The "here only" toggles as the interface**: an aim is a weight on the whole-photo amount, so it cannot say "0.8 here while the rest keeps 0.2"; the aim bit stays only as a reader for saved edits.
- **Every control per mask, including geometry, the decode, the look choice, the LUT file, the absolute white point and the Auto buttons**: no surveyed editor does it, and each has a stated reason; darktable, built for masks, leaves 27 of 97 modules without one.
- **Applying stash@{0} as it stands**: it answers M1 (replace, heaviest wins) before the question has been put.
- **A mode holding only today's five adjustments**: a mode is a claim about capacity, and moving five sliders into a place of their own promises more than it has.
- **A longer menu in the same tab**: the ruling rules out a submenu, and a longer one in the same place is the same shape.
- **Copying Lightroom's control list verbatim**: a visible-light inventory with no channel swap, no red-channel flood and no hot-spot; the list is this app's own controls, and it is not cut down to the six the scope gate first flagged.
- **Every stage takes a mask, rewritten all at once**: this record's former Rejected 3, reopened 2026-09-24 in the narrow sense above; what stays rejected is doing it in one change rather than in stages.

## Rank

**First.** Stage 1 is first because 048 and 050 both wait on exactly this
wiring, and the join defect lives in it. Stage 2 is next because the stages
after the mask stage need neither 032 nor the CPU pre-pass, so the switch opens
onto real capacity. Stage 3 comes before stage 4 because the two share the
early weights, and stage 3 carries no pre-pass risk. Stage 5 waits for 052.
013 and 016 stay below both lanes, because both lanes change what they would be
tuned against.

**Re-sliced 2026-09-24, late: Foliage moved from stage 3 into stage 2.** The red
wires, pylons and cladding under Aerochrome were to be expedited if nothing they
need is ahead of them. What they need is stage 1's joined weights (built, held)
and the switch (the interface; both routes around it are rejected below). What
was ahead of them and not needed is stage 2's eight other stages and the rest of
stage 3: the record put the eight first because they need neither 032 nor the
CPU pre-pass, and the Foliage band on a place mask meets that same test, since
its early weights already exist. It sat in stage 3 only because of where the
band runs. So the switch ships with Foliage first, and the eight follow as stage
2b. Nothing else in the queue was ahead of it.
