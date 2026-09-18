# 018 · One sky selection, built at open, for every sky-aware tool

## Context

The owner asked on 2026-09-18 whether the sky selection should be set before
any corrections and then be available to later operations. It is now, in
part: the decode worker builds the photograph's sky bitmap and its refinement
to the picture's edges (`src/skyfine.ts`) from the undegraded decode — gray-
world balance only, no exposure, correction or look — a moment after the
picture itself, and the look's two sky stages, the tile and the batch export
read that one selection (`DecodedImage.skySel`). Two consumers do not. The
reader's own **Sky mask** on the Masks tab rebuilds a coarse bitmap of its
own with the reader's reach and feather and never sees the refined edge, so a
hand-made sky mask keeps the old soft boundary while the look's depth has
the crisp one. And nothing per-population uses it, although the scope gate
lists the tools that want a population rather than a radius or a whole frame
as OWED: denoise, colour noise, texture, the hot-spot and lens corrections.

Intended outcome: every operation that means "the sky" reads the same
selection — the look's stages, the reader's mask, and any per-population
strength — so the sky is one thing in the app rather than three.

## Looked up

**Mask refinement is joint upsampling**, and the field's tool for it is the
guided filter (He, Sun and Tang, *Guided Image Filtering*, ECCV 2010 / TPAMI
2013): a coarse mask is snapped to a full-resolution image's edges by fitting
a linear function of the image in every window, O(N) through box sums. Joint
bilateral upsampling (Kopf et al., SIGGRAPH 2007) is the older alternative.
This app's `refineSkyMask` is the guided filter with a three-channel guide
(red share, blue share, gamma luma), measured in IR-SCIENCE.md §4b-v.

**The product form is one selection, many adjustments.** Lightroom's Select
Sky produces a mask that any adjustment can then use — exposure, texture,
noise — and the Aerochrome-in-Lightroom guides use exactly that for the sky's
depth (Cuchara Valley Landscapes, 2019). darktable's mask manager likewise
lets one drawn or parametric mask drive several modules. Nobody builds the
sky once per tool.

## Weighed against

- **013, Aerochrome splotchy chroma** — its open gravel half is a population
  problem: the mottle off the sky bitmap needs a selection that is not the
  sky, and the record says a fix that works is one that acts on a selection.
  Directly above this, and the machinery here is what it would use.
- **017 (archived)** — built the selection and the depth; this is the
  selection's second and third customers.
- **006, mask by subject / background** — the same refinement over a
  different seed; the seed (a subject) is what is missing, and it is the
  larger piece. This item stays narrower: the sky only.
- **The scope gate's OWED rows** — denoise, chroma, texture, hotspot,
  lensFix: each says the sky and the canopy want different treatment. A
  per-population strength is what this selection enables; each is its own
  measurement and stays its own item.

## Options

1. **The reader's Sky mask reads the same selection** — reach and feather
   adjust the seed bitmap as they do now, the refinement runs on the result,
   and a type-4 mask samples the refined texture on both the CPU and the
   shader (today it samples a 384 px brush bitmap packed with the others, so
   this is a change to what a type-4 mask IS, held by the agreement walk).
   Then, as their own measured items, per-population strengths for the OWED
   tools, each reading `skySel`.
2. Leave the reader's Sky mask coarse and refine only the look's stages.
3. Refine every brush mask the same way (a general edge-aware mask).

## Rejected

- **2**: two skies in one app — the reader's mask soft where the look's
  depth is crisp on the same photograph — is the inconsistency this record
  exists to remove.
- **3**: a brush stroke is the reader's own edge; snapping it to the
  picture's would move what they drew. The sky is a detected selection, and
  refining a detection is not refining a drawing.

## Rank

Directly under 013, because 013's gravel half is the next population
problem and needs the same machinery, and above 016 and the reported
defects that do not touch the pipeline's selections.
