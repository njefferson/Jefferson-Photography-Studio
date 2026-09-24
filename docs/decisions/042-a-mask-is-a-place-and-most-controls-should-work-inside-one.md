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
  heading, never in the bar, which has no room. The drawer's portrait behaviour
  is 003's, and it must be decided before stage 2 builds into the drawer.
- **The Aerochrome red-edge research, still running.** It must be settled
  before anyone claims per-mask Foliage fixes red wires. A 1024-texel
  selection cannot follow a 1-3px wire.

## Depends

- needs 030 — shipped; the aims are the wiring this extends.
- touches 032 — colour masks cannot drive early stages until 032 re-keys them.
- touches 052 — stage 5 turns the look's sky values into a sky mask's own values, together with 052.
- touches 048 — the union join lands in stage 1.
- touches 050 — box and lasso shapes are the hard edges a gradient cannot draw.
- touches 060 — the editing indicator stays out of the top bar; candidate B adds controls over the photograph where mask handles are drawn.
- touches 003 — the drawer's behaviour must be decided before stage 2 builds into it.
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
- **Stage 2: the switch.**
  - Tabs follow the targeted mask.
  - "Editing: Sky 1 · Back to whole photo" sits in the drawer's sticky
    heading, is announced, and has a way back at least 44px tall.
  - Every stage after the mask stage goes per mask: contrast, the curves,
    HSL, B&W, shadow colour, grade, luminance and LUT strength.
  - The five mask sliders and six aim toggles go in the same release.
  - Old saved values keep rendering, and a visible Convert, which can be
    undone, is offered.
  - A control that is not per mask yet shows disabled, with its reason.
- **Stage 3: the stages before the mask stage, and the foliage band.** These
  are exposure, white balance as relative gains, saturation, hue, tint and
  glow, for masks that are not colour masks. This is the conventional fix for
  the cladding: a colour band limited to a place.
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
