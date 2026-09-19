# 026 · Masks combine: a group of components joined by add, subtract and intersect

## Context

Asked on 2026-09-19, in three parts across the morning: the masks need to
combine; it should be possible to **subtract other colours from the Sky mask**;
and a mask should be invertible. Lightroom is the familiar reference and the
request was explicitly for the **standard convention**, not for something
invented here.

One of the three already exists. `MaskLayer.invert` is on every mask type and
has been since the masks shipped — the Masks tab exposes it, and the sky
heuristic's own status line points at it ("Invert for everything but the sky").
So the ask is really two: combining, and the specific case of subtracting a
colour selection from a place selection.

What the app has today is a **flat array**. `params.masks` is a list, each
entry a `MaskLayer` carrying BOTH a selection (a radius, a gradient, a painted
bitmap, a colour key, or the sky) AND its own adjustment — `brightness`,
`contrast`, `saturation`, `hue`, `warmth`. Every entry is evaluated
independently and its adjustment applied weighted by its own coverage. There is
no way to say "this selection, minus that one".

## Looked up

**Lightroom Classic puts mask COMPONENTS in a mask GROUP, and each component
joins by an operator.** Below a mask's name are **Add** and **Subtract**, each
of which opens the full list of selection types, so a component can be a brush,
a linear or radial gradient, a colour range, a luminance range, or a detected
subject or sky. **Intersect** is the third operator: it is reached from the
mask's `…` menu as "Intersect Mask With", or by holding Alt/Option, which
turns the Add and Subtract buttons into Intersect. Adobe's own implementation
of Intersect is a subtract that is then inverted. Every component of an
operation stays in one group, and **the adjustment belongs to the group**, not
to any component.

**darktable exposes the set operators directly**: drawn shapes can be grouped
and combined with **union, intersection, difference and exclusion**. For
combining a drawn mask with a parametric one it offers **exclusive** mode,
which multiplies the component masks together so a pixel is 1.0 only where
every component is 1.0 (a logical AND), and **inclusive** mode, which inverts
each component, multiplies, and inverts the result so a pixel is 1.0 where any
component is (a logical OR) — each with an inverted variant.

**So the convention is one model, described twice.** A mask is a group; a group
is a list of selections combined by boolean set operations; the adjustment is a
property of the group. Lightroom names the operators for photographers (Add /
Subtract / Intersect) and darktable for engineers (union / intersection /
difference / exclusion); the algebra is identical, and in both the soft-edged
case is multiplication and inverted-multiplication rather than hard set logic,
because masks are continuous 0..1 and not binary.

**The owner's example is the convention's own headline case.** Subtracting a
colour from a detected sky is, in Lightroom, a Sky component with a Color Range
component subtracted from it, inside one group, with one adjustment.

## Built already

What exists that this item uses, so a second one does not get written
(LESSONS 330). Every path here is checked to exist on every commit.

- **The NOT operator is done.** `MaskLayer.invert` is on every mask type in
  `src/pipeline.ts`, applied as the last step of the per-mask weight
  (`return m.invert ? 1 - w : w`) and mirrored in the shader. The convention
  puts invert at both the component and the group level; the component half
  needs nothing built.
- **Five selection producers, already written and already agreeing across CPU
  and GPU.** Radial and linear geometry and the colour key live in
  `src/pipeline.ts` (`colorMaskWeight` and the geometry branches); painted
  bitmaps and the detected sky share `sampleBrush`; `src/sky.ts` produces the
  sky seed. A group model needs no new selection TYPES — it needs a way to
  compose the ones there are.
- **Edge refinement is general and is not sky-specific.** `src/skyfine.ts`
  (`buildSkyGuide`, `refineSkyMask`) is a guided filter over an arbitrary
  bitmap plus a guide; 018 gave it a second caller in an afternoon. Any
  component of a group can be refined by it, and `MaskLayer.fine` is the field
  it lands in.
- **The GPU slot scheme extends to a second atlas without shader surgery.**
  `src/gl.ts` packs bitmap masks one per RGBA channel keyed by `u_maskSlot`,
  and 018 added `updateBrushFineTexture` on the same scheme. A third atlas
  would follow the same pattern — but note the ceiling below.
- **Two walks already hold this ground.** `tools/agreement-walk.mjs` is what
  proves a change to mask evaluation keeps CPU and GPU identical — 018's
  second sampling path passed it — and `tools/mask-truth-walk.mjs` reads a
  mask from the reader's side rather than from the code's.
- **The measurement of a mask's edge is a scratch harness and is NOT in the
  repo.** IR-SCIENCE 4b-v cites a scratch maskprobe (no backticks: it is not a
  path in this repo) for the "25 px ramp comes back 4 px wide" control; it
  lives in a session scratchpad and dies with the session. A second instrument
  was written for 018 because of that. If this item needs to look at an edge,
  promote one into `tools/` first rather than writing a third.

**The constraint, stated here because it is the thing that will bite.**
`MAX_BITMAP_MASKS` in `src/pipeline.ts` is 4, one per atlas channel. Today that
caps how many bitmap MASKS a photograph can carry; under a group model it caps
how many bitmap COMPONENTS a single adjustment can combine, which is a much
lower ceiling in practice. Raising it is part of this item, not a footnote.

## Weighed against

- **018 (just shipped)** — made the reader's Sky mask read the same refined
  selection the look uses. That is about where one selection's edge SITS; this
  is about how several selections COMBINE. 018's `MaskLayer.fine` is a property
  of a component and survives this change unaltered.
- **023, the Sky mask reads the sky's colour as well as its place** — would be
  partly subsumed: "sky by place, intersected with sky by colour" is expressible
  in this model, which is an argument for doing this first and 023 as a preset
  on top rather than as separate machinery.
- **006, mask by subject / background** — another selection TYPE, orthogonal;
  it becomes another component kind once groups exist.
- **The 4-bitmap ceiling.** `MAX_BITMAP_MASKS` is 4, one per RGBA channel of a
  packed atlas, and 018 added a second atlas on the same scheme. A group model
  multiplies the number of component bitmaps a single adjustment can need, so
  the ceiling becomes the binding constraint rather than an incidental one.
  This record must not pretend otherwise.

## Options

1. **The convention, in full: a group holds components, each with an operator
   (add / subtract / intersect), and the adjustment moves to the group.**
   `params.masks` becomes a list of groups; `MaskLayer` splits into a
   selection part (geometry, bitmap, colour key, reach/feather, `fine`) and the
   adjustment, which the group owns. Evaluation composes the components
   multiplicatively — `w = w_add * (1 - w_sub)` for subtract and `w_a * w_b`
   for intersect, which is darktable's exclusive/inclusive algebra and matches
   Lightroom's behaviour on soft edges. Invert stays available at BOTH levels,
   per component and per group, because the convention has both.
2. **Operators between adjacent entries of the existing flat array** — each
   mask gains an operator saying how it joins the one above, no group object,
   adjustments stay per-entry.
3. **A single "subtract colour" field on the Sky mask** — the owner's literal
   example and nothing more.

## Rejected

- **2**: it looks cheap and is a trap. With the adjustment still on every
  entry, there is no answer to the question the model must answer — when three
  entries combine into one selection, WHOSE brightness applies? Either the
  first entry's silently wins (a rule nobody can see) or all three apply in
  sequence (which is not a combination at all, it is what the app already
  does). The convention puts the adjustment on the group precisely because
  this question has no good answer otherwise.
- **3**: solves the example and nothing else, and it would have to be
  re-solved for the next pair — subtract a brush from a colour range, intersect
  a gradient with a sky. It also puts a colour key inside the sky mask's UI,
  which is the "two skies in one app" shape 018 just removed.

## Rank

**Above 023 and below 024.** Above 023 because "sky by place intersected with
sky by colour" is 023's fix expressed in this model, so building 023 first
would build machinery this record then replaces. Below 024 (every control can
say what it does) because a model with operators in it is exactly the surface
that needs controls which explain themselves, and shipping the operators first
would add three unexplained words to a tab that already has unexplained ones.
