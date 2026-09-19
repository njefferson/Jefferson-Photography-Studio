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

Fifth: the panel's last step is the reader's Sky mask, and that mask draws
its own soft edge until it reads the refined selection; behind 019 because
the look's amounts do not wait on it.

## Looked at

The reader's Sky-mask coverage overlay, opened as an image on both builds —
`origin/main` in a worktree and the branch carrying this change.

- **NIR_1644** — the coverage boundary is a soft curve across the treetops on
  BOTH builds. It does not follow individual branches on either, and it was
  looking at this rather than at a coverage figure that stopped this change
  being reported as working. A 12-pixel guided-filter window
  (`SKY_FINE_RADIUS` at `SKY_FINE_EDGE`) cannot resolve a conifer silhouette,
  so "snapped to the picture's own edges" overstates what a refinement can do
  on this subject.
- **NIR_0063** and **NIR_1651** — same shape of boundary, same conclusion.

## Outcome

Option 1 as written, on the branch: `regenerateSkyMask` still shapes the seed
with the reader's reach and feather, then refines it with the same
`refineSkyMask` the look's sky stages use, into a new `MaskLayer.fine`. The CPU
samples it in `compileEdit`'s mask branch; the GPU reads it from a SECOND
packed atlas on the same slot scheme. `PREVIEW_PIPELINE` moved to 44 because a
tile carrying a Sky mask now renders differently.

**Why a second atlas, which the record did not anticipate.** The obvious route
was a sharper bitmap in `m.brush`. `updateBrushTexture` sizes the packed
texture from its FIRST entry and silently `continue`s past any bitmap whose
dimensions differ — so a 1024-edge sky mask beside a 384-edge painted mask
would have dropped one of them from the render with nothing going red. The
refinements get an atlas of their own instead.

**IT REACHES THE RENDER, AND THE OBVIOUS METRIC CANNOT SEE IT.** mask-truth
edge coverage, before against after: NIR_0063 44% to 45%, NIR_1644 37% to 37%,
NIR_1651 89% to 89% — nothing beyond noise, and the two runs disagree on the
sky-edge pixel count itself (26479 against 26475), so a one-point move is
unreadable. That looked like a dead change.

It is not. Differencing the decoded overlays pixel by pixel: **4.4% to 6.6% of
pixels change, by a mean of 15 levels out of 255**, and on NIR_1644 **75% of
that change sits in the busiest 10% of rows** — the tree line. Detection
jitter cannot account for it: the sky-edge population moved by 0.015% between
runs while 4-7% of pixels changed appearance.

**So the lesson here is the metric, not the filter.** Edge COVERAGE is 023's
question (does the mask reach the sky its colour key can see). This record's
question is where the boundary SITS, and coverage is blind to a boundary that
moves without changing how much it encloses. A sharpness measurement — how
many texels the mask takes to fall from 1 to 0 across a real edge — is what
would have answered this in one run instead of three.

**Still owed before this can be archived**: that sharpness measurement, made to
fail on the pre-018 build; the agreement walk green on the committed build
(it added a second sampling path, which is exactly what that walk exists to
hold together); and the commit message's "snapped to the picture's own edges"
corrected to what the pictures support.

**VERIFIED 2026-09-19, and the number that took three instruments to get.**

- **Edge sharpness**, the rows a column takes to fall from 0.9 to 0.1 of
  coverage, before against after: NIR_1644 median **74 → 57** (p90 178 → 146),
  NIR_0063 median **30 → 17** (p90 166 → 137), NIR_1651 **59 → 59** unchanged.
  NIR_1651 is the hazy frame whose sky barely keys, and its identical reading
  is the accidental control: unchanged input, unchanged output.
- **Agreement walk green** on the committed build — "every path renders the
  same photograph the same way". That is the check this change most needed,
  because it added a SECOND sampling path (CPU reads `MaskLayer.fine`, GPU
  reads a second atlas), and the two provably agree.
- **Feather is not dead.** `refineSkyMask` thresholds its input at 0.5, and
  IR-SCIENCE 4b-v says it must, so the reader's Feather looked like it would be
  discarded. Measured: NIR_1644 median fall 68 rows at feather 0, 57 at
  feather 1. The control still moves the result.

**What went wrong on the way, and it is the reason LESSONS 330 exists.**
Edge COVERAGE was measured first and showed nothing (44→45%, 37→37%, 89→89%)
because coverage is 023's question and is blind to a boundary that moves
without enclosing more. Then the overlays were differenced, which showed the
change was real (4.4–6.6% of pixels, 75% of it along the tree line). Only then
was a sharpness instrument built — **and one already existed**: the scratch
`maskprobe.mjs` behind IR-SCIENCE 4b-v's "25 px ramp comes back 4 px wide"
control was written to measure precisely this edge. It was not in `tools/`, so
nothing pointed at it, and a second instrument got written.

**And the claim was corrected rather than left standing.** The first commit
said the outline is "snapped to the picture's own edges". On conifers it is
not — `SKY_FINE_RADIUS` is a fixed 12 px at 1024 and cannot resolve a needle.
That fixed radius is the next thing, and it is what Photoshop's Smart Radius
exists to solve.
