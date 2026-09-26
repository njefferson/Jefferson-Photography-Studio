# 052 · The look's sky adjustments read a selection the reader cannot see

## Context

Aerochrome's sky adjustment cannot be reproduced with a mask on sky the look
does not reach.

**Read off the source rather than from the symptom: there are TWO sky
selections on one photograph and the reader can steer only one of them.**

The look's selection is the module-level `skyBitmap` and `skyFine` in
`src/main.ts`. It is built at open — `buildSkySelectionFrom(prepareSkySource(img))`,
or from `img.skySel` on a photograph already decoded — and assigned in five
places, once in `syncSkyMap` and four times on the open path, none of which any
control steers. It carries no Reach, no Feather, no by-colour toggle and no hand
corrections. It is what `skySmooth`,
`skyDepth` and `skySat` act through, which are the Aerochrome sky sliders.

The reader's selection is a type-4 Sky mask in `params.masks`. It has all of
those controls: `regenerateSkyMask` shapes the seed with `m.reach` and
`m.feather`, 023's by-colour grow reaches the sky between branches, and 031's
`fix` strokes are replayed over whatever the detection returns. It drives its
own five adjustments and any whole-photo tool aimed at it, never the look's sky
stages.

`regenerateSkyMask` writes `m.brush` and `m.fine` on the mask layer. It never
touches `skyBitmap` or `skyFine`. So every control the reader has over a sky
selection is attached to the selection the sky sliders do not read.

**And the gap cannot be closed by picking a better slider value, which is the
first thing anyone would try.** `skySat` multiplies chroma about luma, gated on
each pixel's own saturation between `SKY_SAT_GATE_LO` and `SKY_SAT_GATE_HI`, so
a cloud or a haze gets none. `skyDepth` darkens toward the film's own value,
gated on the sky map's keying byte, so a grey and an overcast sky are left
byte-identical. A mask's `saturation` is a plain saturation adjustment folded in
linear space at the mask stage, before the global gamma and contrast, before
the tone curves, the HSL mixer and the grade. They are different operations, on
different populations, at different points in the pipeline. This is a
capability gap, not a tuning problem.

**018's title is "One sky selection, built at open, for every sky-aware tool",
and this is the half of it that did not ship.** What 018 unified was the
REFINEMENT: a Sky mask's `fine` is now built by the same `refineSkyMask` the
look's stages use, so one photograph no longer carries a soft hand-made sky and
a crisp look depth. The SELECTION was not unified. Its own Option 1 ends by
naming per-population strengths reading `skySel` as later items, so a follow-on
was anticipated, and this is that follow-on.

**2026-09-25: the halo under a sky depth, measured, and what could not fix it.**
With Aerochrome's Sky depth on, a light band stands beside every building and
pylon leg. The depth multiplies brightness by the look's selection, and a probe
of that selection read it at 0.29 at 10 px from the tall building's edge on
NIR_3466, 0.56 at 70 and 0.95 at 190, with the export's brightness against the
shipped look 0.91 at 10 px and 0.65 in open sky. The sky map's keying byte read
1.0 throughout, so the selection alone is the cause. Inside NIR_3461's near
pylon the selection is 0: the sky seen through the lattice is not selected. On
NIR_3466 the tall building's pale face is selected as sky, with a hole in it.

Tried in a scratch copy, each rendered or mapped and opened, none kept:

- **The Sky mask's own colour grow** (`growSkyByColour`), unlimited or snapped
  after: it reaches the edges and takes in whole clouds on NIR_1651 and the
  blurred background of NIR_0627.
- **The grow limited to the old selection's feather:** the halo goes (0.649
  against 0.648 in open sky at the pylon leg on NIR_3461), but binary
  membership puts hard edges through the wispy clouds of NIR_1651 and NIR_1827.
- **A per-pixel whiteness weight subtracting cloud:** it finds the cirrus on
  NIR_3466 and NIR_3461, misses NIR_1651's cloud, reads the bright haze round
  NIR_1827's sun as white, and is grainy near the horizon.
- **The weighted guided filter** the literature names (Liba et al. 2020, a
  large window, near-zero confidence along the uncertain edge): the sky beside
  the building still rises from 0.61 to 0.98 over 300 px, and at the pylon it
  is worse than the shipped filter. It assumes the coarse mask is right away
  from its edge, and here it is wrong over whole regions: the lattice and the
  building face. No refinement can fix wrong labels.

So the halo is this selection being wrong, not its edge being soft. The field
starts from a learned segmentation (Lightroom's Select Sky; the paper's
pipeline), and on-device sky segmentation is being researched before anything
further is built (IR-SCIENCE 4b-ix has the refinement literature).

**2026-09-26: a learned selection was built, and taken out.** Two models
(BiSeNetV2 for sky against building and tree, u2netp for the steel and wires
inside it) were fused and refined into the look's selection, and exported
through the app beside today's build on six frames. Compared whole frame
against whole frame, as the look's automatic selection it was better only on
NIR_0627, which has no sky. On the photographs with sky it was worse, and on
NIR_1827 the two renders nearly match:

- **Clouds** on NIR_1651 and NIR_1644 were taken into the sky and turned
  blue-grey under the sky stages; today's selection leaves them out and white.
- **Steel** in NIR_3461's near pylon went dull, with round red glows. The
  selection is built at 1024 px and the steel is narrower than one of its
  pixels.
- **Sky was missed** above NIR_3466's roof and beside NIR_1651's upper tree.
- **NIR_1827**: along the treetops, where today's render has a thin pale rim
  against the sky, the learned one has a soft pink-red fringe, and parts of the
  broken cloud at the upper right come out bluer.

It never reached staging. The code is in commits a963548 and ed11d08, on no
published branch; kept locally only. Do not rebuild it as the look's automatic
selection. Three facts found on the way, not fixed:

- the hand-built detector is given rotation 0 on a photograph turned on its
  side, so it seeds its sky on the wrong edge (NIR_1651: 18% of the frame found
  against 52% with the rotation);
- the sky settings have no per-pixel guard against white: Sky colour
  smoothing tints a neutral pixel, Sky saturation then reads the tint, and Sky
  depth darkens whatever the selection holds;
- a photograph picked on its own or opened from the gallery is not given its
  sky pair by the sky worker at open: its coarse half comes from `skyMaskFor`
  at open and the refined pair from `syncSkyMap` on the first edit with Sky
  depth or Sky saturation, both on the main thread.

## Looked up

**The field's convention is one selection, visible and editable, with the
tool's own sliders acting on it — there is no second hidden one.** In Lightroom,
Masking → Select Sky runs the analysis and produces a mask; the reader refines
it with Add and Subtract, and only then uses the local editing sliders on it.
The automatic detection IS the thing the reader edits. The same shape covers its
other detected classes.

darktable reaches the same place from the other direction: a parametric mask
selects by pixel properties and drawn shapes select by place, and the two are
COMBINED, with a polarity toggle that inverts a component so it subtracts. Its
combine modes are explicit about what happens where masks overlap.

Neither exposes a detected selection that the module's own sliders read while
the reader edits a different one. That arrangement is not a convention anywhere;
it is what this app has by accident of the order the two features were built.

Sources: Adobe, "Apply Masking for local adjustments" (Lightroom);
darktable user manual, "combining drawn & parametric masks" and "masks".

## Built already

What exists that this item will use, so a second one does not get written
(LESSONS 330):

- **The detection and its refinement.** `buildSkyMask` in `src/sky.ts` (the
  coarse 384 px selection, with its horizon from `src/skyhorizon.ts`), and in
  `src/skyfine.ts` `refineSkyMask` (the guided filter the look uses today),
  `growSkyByColour` and `skyGrowKey` (the Sky mask's colour grow), and
  `buildSkySelectionFrom`, which builds the look's pair at open.
- **The look's use of it.** `src/skymap.ts` `buildSkyMap` (the 128-texel sky
  map, its depth key and grey guard) and the sky stages in `src/gl.ts` and
  `compileEdit`.
- **The reader's Sky mask**, a type-4 mask with Reach, Feather, by-colour and
  hand corrections: the editable thing this record's chosen option makes the
  look read.
- **Instruments.** `tools/mask-truth-walk.mjs` (coverage at the edge and in
  open sky from the reader's side), `tools/sky-probe.mjs` (why the grow
  stopped), `tools/sky-stage-walk.mjs` (the exported sky, measured whole) and
  `tools/aerochrome-walk.mjs`.
- **Not in the repository:** the selection lab used on 2026-09-25, which builds
  each candidate selection from one photograph and writes its map, lives in
  the session scratchpad. It is the first thing to move into `tools/` when a
  learned segmenter is tried.

## Weighed against

**018**, whose title this completes and whose Outcome explains why only the
refinement was unified: the record's own Option 1 was about what a type-4 mask
IS on the sampling side, and it named per-population strengths reading `skySel`
as separate later items.

**042**, which is this meeting from the other side: every control usable
inside a mask. If `skySat`, `skyDepth` and `skySmooth` became mask
adjustments, half of this is discharged. The other half is that the reader
should INHERIT the detection rather than build a selection from scratch on every
frame, which 042 does not cover.

**013**, the Aerochrome look's own population work, and the reason this is
ranked where it is rather than where a new item naturally lands.

**049 and 048**, which give the reader control over the sky selection's border
and let a split selection be completed. Both act on the mask's selection. They
are not invalidated by this; they become the controls the look finally reads,
which is the outcome this item exists to produce.

**028**, which is about a connectivity-constrained selection being unable to
enter sky between leaves. That is the selection being wrong; this is the wrong
selection being read.

`NOTES.md` "## Accessibility standing rule" bears on the surface half, since a
mask arriving on a photograph that had none is a state change the reader must be
told about in words.

## Depends

- touches 018 — 018 unified the refinement the two selections share; this
  unifies the selection itself, and a change to either moves the other.
- touches 042 — if the look's sky stages become mask adjustments, these two
  overlap; whichever is built first constrains the shape of the second.
- touches 013 — 013 tunes the Aerochrome sky against whatever population the
  look's stages read, and this changes which population that is.
- touches 049 — 049 makes the sky selection's border movable; this is what makes
  that control reach the look's sky stages.
- distinct-from 030 — 030 is the pipeline having exactly one place a mask may
  act, which a perfect selection does not fix. This is about WHICH selection a
  stage reads, and would still be true if a mask could act anywhere.
- distinct-from 028 — 028 is a detection that cannot reach sky between leaves,
  by construction. This is a detection the reader cannot correct at all because
  the stage that uses it reads a different one.

## Options

1. **The look's sky stages read a reader-visible Sky mask, seeded automatically
   at open.** Chosen, because it is the field's shape and closes the gap. The
   detection that runs at open becomes a type-4 mask the reader can see, with
   Reach, Feather, by-colour and hand corrections already attached to it because
   a type-4 mask already has them; `skySmooth`, `skyDepth` and `skySat` read
   that mask's `fine` rather than the module-level `skyFine`. Nothing the reader
   already knows how to do is lost, and nothing new has to be invented to steer
   it. **The surface question this opens and does not answer: what happens on a
   photograph where the reader wants no sky mask in their list, and whether a
   seeded mask that nobody asked for is a change the app must announce.**
2. Make `skySat`, `skyDepth` and `skySmooth` available as mask adjustments and
   leave the look's automatic selection as it is.
3. Give the look's own selection its own Reach, Feather and correction controls.
4. Leave it: build a Sky mask and approximate with the mask's saturation.

## Rejected

- **2 — the sliders without the detection.** It hands the reader the right
  controls and still makes them build the sky selection by hand on every
  photograph, while the look's own sky stays a second selection nobody can see.
  It is half of option 1 rather than an alternative to it, and it is the half
  042 already owns.
- **3 — a second set of sky controls.** Two skies in one app is the
  inconsistency 018 exists to remove, and this is that inconsistency restated
  with a fuller control panel on the wrong one. 018 rejected it once already.
- **4 — leave it.** Refuted from the source rather than by taste: the mask's
  saturation and the sky sliders are different operations on different
  populations at different points in the pipeline, so no value of one reproduces
  the other. This is the option that looks reasonable until the code is read,
  which is why it is written down.

## Rank

**Third, re-ranked 2026-09-26, below the white guard (069) and the rotation
fix (070).** It sits below both because each changes what this item is judged
on: 069 decides what the sky stages do to the cloud a Sky mask holds once the
look reads it, and 070 decides which edge of a turned photograph the detection
this item turns into a Sky mask finds its sky from.

Settled 2026-09-25: the Aerochrome work leads the queue, ahead of the
completeness work, because nothing ranked above it was needed by it. Within the
rest of that work this comes first because everything the look renders in the
sky is measured over this selection: the chroma noise 013 works on, the tuning
066 replaces, and the halo above. Built later, each of those would be measured
again.

It no longer waits on 042. The two meet at 042's stage 5, and 042's remaining
stages act on the reader's masks, not on the look's own sky stages, so nothing
in 042 moves what this item is measured against. 042's stage 5 builds on
whatever this item settles.

## Looked at

- NIR_3466, 2026-09-25: exports as shipped and tuned to the film from the shipped build and from each variant, 1:1 crops beside the tall building's right edge, the antennas and the low roofs; selection maps at full selection resolution.
- NIR_3461, 2026-09-25: the same, 1:1 crops of the near pylon's legs and lattice and the pylons along the horizon.
- NIR_1651, 2026-09-25: selection maps for every variant, and exports from two variants with 1:1 crops of the cloud above the tree and the tree's left edge.
- NIR_1827, 2026-09-25: selection maps for every variant, and exports with a 1:1 crop of the clouds and tree tops on the right.
- NIR_0627, 2026-09-25: selection maps and exports, with a 1:1 crop of the flower against its blurred background.
- NIR_1644, 2026-09-26: exports through the learned selection and today's, whole frame, side by side.
- NIR_1827, 2026-09-26: the whole-frame exports through today's selection and the learned one, side by side, a difference image of the two, and the treetops and the broken cloud at the upper right enlarged from both. They nearly match; today's has a thin pale rim along the treetops where the learned one has a soft pink-red fringe, and parts of the broken cloud at the upper right come out bluer in the learned one.
- The six frames, 2026-09-26: exports through the learned selection and today's, whole frame side by side, and 1:1 crops of NIR_3461's pylons, NIR_3466's roof and NIR_1651's cloud beside the tree.
