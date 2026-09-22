# 030 · A mask can only act in one place, and there is only one version of an edit

## Context

Asked 2026-09-20, and stated as a principle rather than a feature: a mask can be
taken at any point in the workflow, and without layers or named backups there is
no way to act on the raw underneath when all you have in front of you is the
image and its pixels.

**Half of that is already true here and should be said plainly, because it
changes what is actually missing.** This app is non-destructive by construction:
`EditParams` is a parameter set, every render starts from `img.linear`, and
`prepareSkySource` builds the sky selection from that linear decode before any
look and before any channel swap. The raw is always underneath and is never
overwritten. There is no accumulating buffer of manipulated pixels.

**What is missing is that nothing inside the pipeline is addressable.**

- **The order is fixed and invisible.** A reader cannot see where a stage sits,
  cannot move one, and cannot run one twice. Denoise happens where denoise
  happens.
- **A mask acts at exactly one stage.** `MaskLayer` weights fold in at the mask
  stage in `compileEdit` and in the shader. There is no way to aim a selection
  at an earlier stage — to denoise only the sky, say, which this repo's own scope
  gate records as OWED against six separate knobs, every one of them marked
  whole-frame because there is nowhere to aim it.
- **There is one state.** Undo is a linear history. There is no way to keep two
  versions of an edit side by side, name them, or return to one.

**And it has already cost this investigation directly.** The acceptance
instrument measures the sky mask on the RENDERED canvas after the E-IR look has
been applied — a look which swaps red and blue. The mask is built from the raw;
the instrument reads the manipulated display. That is the principle above,
violated by the tooling rather than by the app, and it went unnoticed for the
life of the walk.

## Looked up

The field has both halves, separately, and the split is instructive.

**RawTherapee** keeps a History stack and, beside it, a **Snapshots** panel —
named states you can return to within a session. Its editing is non-destructive
in the same way this app's is: the raw is untouched and a sidecar records the
changes. **But it is also the cautionary case**: it offers no visibility into or
control over the order its processes are applied in, and it is not possible to
apply any given process more than once. That is precisely the limitation
described above, shipped by a mature editor.

**darktable** takes the other road. Its pixelpipe is an explicit sequence of
modules that can be added and removed in any order, with an unlimited number of
masks that can be combined and blended per module. A selection there is not tied
to one stage; it is an input any module can take.

So "masks at any stage" is darktable's model and "named states" is
RawTherapee's, and neither is exotic.

Sources: RawPedia Getting Started (rawpedia.rawtherapee.com/Getting_Started);
LWN, Raw photo editing with RawTherapee (lwn.net/Articles/883599/); darktable
and RawTherapee comparisons (imagic.ink/blog/darktable-vs-rawtherapee-
open-source-raw-shootout, shotkit.com/rawtherapee-vs-darktable/).

## Built already

Everything below EXISTS and is on production or on the work branch. Whatever
this record's remaining work turns out to be, it extends this rather than
starting again.

- **The mechanism itself: `MaskLayer.aims`, a bitmask.** `src/pipeline.ts`
  exports the bits — `AIM_DEHAZE` 1, `AIM_CLARITY` 2, `AIM_SHADOW` 4,
  `AIM_LENS` 8, `AIM_NOISE` 16, `AIM_TEXTURE` 32 — and `aimWeight` resolves one
  at a point. `src/gl.ts` has the matching `aimWeightOf`. The two walk the same
  flattened active groups in the same order, and that sameness is the whole
  contract between them. **Absent or zero means whole-frame**, so every edit
  already saved renders identically; a new bit does not change that.
- **Two shapes of aim, and the expensive one is done.** A per-pixel gain is
  aimed by SCALING it, which is one line per path. A spatial pre-pass has to be
  run twice and blended, which is `aimedSampler` in `src/pipeline.ts` on the
  processor against `mix(preNoise, c, aimWeightOf(16))` and
  `c *= mix(1.0, gain, aimWeightOf(32))` in the shader — equal because
  `mix(c, c*g, w) == c * mix(1, g, w)`. A third spatial stage is one call, not
  a new design.
- **The two traps are closed at the one place that decides.**
  `maskGroupsForRender` drops a group whose head adjusts nothing, and a mask
  added PURELY to aim is exactly that; the shader uploads the same filtered
  list, so reading `p.masks` on the processor alone would put the two paths on
  different sets. `maskIsActive` counts aiming as doing something. Both paths
  read one answer.
- **The toggles are ONE list.** `AIMS` in `src/main.ts` pairs each button with
  its bit, so a new stage is a line there plus a button in `ir.html` rather than
  three edits that can disagree.
- **Three gates already hold it, and none of them needs writing again.**
  `tools/aim-walk.mjs` holds every aim to four statements — chief among them
  that aiming nothing changes nothing, measured at 0.000% of the frame moved,
  which is what protects every saved edit. `tools/agreement-walk.mjs` holds the
  processor and the shader to the same photograph; as of 2026-09-22 it compares
  whole hue histograms rather than a bin winner, and its aimed arm passes at 9.2
  degrees against a bar of 15. `tools/scope-check.mjs` is the ledger of which
  knobs should be aimable, and its OWED list is EMPTY.
- **What is NOT built, and is deliberately not.** Colour masks cannot aim: their
  key is the pixel as it DISPLAYS at the mask stage, which does not exist at
  dehaze. That boundary belongs to 032 and the control stands down rather than
  offering nothing. And the chosen option here is Option 1 only — Option 2's
  named snapshots, the second half of this record's own title, has nothing built
  for it at all.

## Weighed against

**The scope gate is the measured argument that this is not cosmetic.**
`tools/scope-check.mjs` lists forty-four whole-frame knobs, and six carry an
OWED reason that reduces to the same sentence: the sky and the canopy want
opposite amounts and there is one control. Denoise, chroma, texture, clarity,
dehaze and the look's own denoise and texture. Every one of those is a mask
waiting for somewhere to be applied.

**026** shipped the algebra for combining masks — groups with add, subtract and
intersect. That is the selection side of the problem solved. This is the other
side: having somewhere to put the result.

**029 and 023** are about whether the sky selection is CORRECT. This is about
what the app can do with a correct one.

## Depends

- touches 026 — 026 built the combination model; this is where a combined mask
  would be allowed to act.
- distinct-from 029 — 029 is the selection being wrong about which pixels are
  sky. This is the pipeline having one place to use a selection. A perfect
  selection still cannot denoise only the sky today.
- distinct-from 012 — a photograph filling the screen is a viewing question.

## Options

1. **Let a mask aim at named stages, smallest useful version first.** Keep the
   pipeline order fixed, but allow a `MaskLayer` to declare which stages it
   gates, starting with the ones the scope gate already records as OWED —
   denoise and texture. One new field, a per-stage weight lookup, and the six
   OWED reasons start coming off the list one at a time with a measurement each.
   **CHOSEN, and built 2026-09-21 as `MaskLayer.aims`.** It started with the
   per-pixel stages rather than denoise and texture, which this record named
   first and which turn out to be the expensive ones: a spatial pre-pass has to
   be run twice and blended by the weight, where a per-pixel gain only has to
   be scaled. Dehaze, Clarity, the shadow tint and the IR lens hot-spot fix are
   aimed, which took six OWED reasons off the scope gate's list. What made it
   a decision rather than a claim is that Dehaze aimed at a Sky mask was
   rendered on NIR_1651 and opened — see Looked at, and see the edge it found.
2. Named snapshots of the whole `EditParams`, RawTherapee's model — cheap,
   because the state is already a plain parameter object that is cloned for
   undo. Solves comparison and return, solves nothing about aiming.
3. A reorderable pixelpipe, darktable's model. The largest version, and it
   changes every render path, the tile cache's stamp, the export and the shader.
4. Both 1 and 2, in that order.

## Rejected

- **3 alone.** A reorderable pipeline is the general answer and it is a rewrite
  of `compileEdit`, `src/gl.ts`, `stampOf` and the preview cache at once. This
  repo's own record of what goes wrong when a stage moves — the TIFF export
  corruption in IR-SCIENCE 9l-ii, diagnosed wrong the first time — is the
  argument for not starting there.
- **2 alone.** Named states would be genuinely useful and would not have
  prevented any defect found this week. The aiming is what the measurements keep
  pointing at.

## Looked at

Three states of one frame, rendered through the real app by
`tools/aim-walk.mjs --shots=` on 2026-09-21 and opened as photographs, with
Dehaze held at 0.80 and the Sky mask's own adjustment driven to neutral so the
mask is a PLACE and nothing else.

- **NIR_1651** — a conifer against a deep teal sky with a cloud bank across the
  top. Whole-frame Dehaze at 0.80 takes the sky down hard and gives the cloud
  real structure, and it costs the conifer its luminosity: the foliage goes
  from pale pink to a grey mauve and the shadows inside the crown crush toward
  black. Aimed at the Sky mask it is that same sky with the tree exactly as it
  opened. **The picture also shows what no figure did**: a rim of un-darkened
  sky hugs the crown's silhouette, and the small holes of sky between the
  needles keep their original teal while the open sky around them goes dark.
  That edge is 029's ground, and it is now what limits how far this can be
  pushed rather than the mechanism.

## Rank

**Below the two sky-selection items and above the look tuning, provisionally.**

The dependency test: 029 and 023 decide whether the selection is right, and this
decides what can be done with it. Neither blocks the other, so this does not
have to come first. But 013 and 016 are look-tuning items whose records both
reach for per-population control that does not exist — the scope gate's OWED
entries name denoise and texture specifically — so tuning them before this lands
means tuning a whole-frame knob as a proxy for a selective one, and re-doing it
after.

Provisional because the rank rests on how much of 013 and 016 actually needs
aiming, and that has not been measured. Whoever takes 013 first should say.
