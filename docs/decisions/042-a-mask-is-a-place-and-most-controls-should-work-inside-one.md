# 042 · A mask is a place, and most of the controls should work inside one

## Context

Asked 2026-09-21 from the device, and it is two asks in one sentence. Masks
should come OUT of the tab strip and be their own place, the way a commercial
editor gives masking the whole column. And inside a mask the reader should not
be limited to what the mask menu offers — every control should be usable there.

**What the app does today, measured rather than remembered.** A `MaskLayer`
carries FIVE adjustments: `brightness`, `contrast`, `saturation`, `hue` and
`warmth`. They fold in at one point in `compileEdit`, in linear space, before
the global gamma and contrast, before the master and per-channel tone curves,
before the 8-channel HSL mixer and before the grade — and `src/gl.ts` mirrors
that point numerically. `EditParams` carries roughly forty other knobs and
every one of them is whole-frame.

The mask panel is one of twelve tabs (`#ptab-masks`), and the five sliders are
what fits under a mask row at a tab's height. **So the menu is short because
the pipeline has one place to apply a selection, not because the menu was
written short.** Lengthening the menu is not available: there is nothing to put
in it.

That is decision 030 stated from the reader's side rather than the pipeline's,
which is the useful finding here — the ask is not new work discovered today, it
is the same missing capability arriving through the surface instead of through
the scope gate.

## Looked up

**The editor named in the request is the one that LIMITS the set, and that is
worth knowing before designing to it.** Lightroom's masking panel hosts a fixed
local-adjustment set in four groups — Tone (exposure, contrast, highlights,
shadows, whites, blacks), Color (temp, tint, hue, saturation and a point
colour), Effects (texture, clarity, dehaze, grain) and Detail (sharpness,
noise, moiré, defringe). **Vibrance, the tone curve, the HSL/colour mixer,
colour grading, lens corrections and camera calibration are global only** and
cannot be put inside a mask; Adobe's own idea board carries a long-running
request for local HSL, and DxO PhotoLab and Capture One are cited there as the
products that have it. Recent versions added a point curve per mask, so the set
grows — one group at a time, not all at once.

**darktable is the architecture that actually gives you everything, and it gets
there by inverting the relationship.** A mask there does not belong to a panel;
it belongs to a MODULE. Every processing module has its own blending stage
taking a drawn mask and/or a parametric mask, combined by each mask's polarity
and a combine mode and multiplied with a global opacity. There is no control
list to run out of, because there is no single mask panel — there is a mask on
each module.

**So "every control inside a mask" is darktable's architecture wearing
Lightroom's clothes**, and that sentence is the whole design finding. It cannot
be reached by lengthening a menu. It is reached by letting a selection gate a
stage, which is exactly what 030 describes and what this app cannot do today.

Sources: Adobe, Apply Masking for local adjustments
(helpx.adobe.com/lightroom-classic/help/masking.html) and Apply local
adjustments based on color, luminance and depth
(helpx.adobe.com/lightroom-classic/help/apply-local-adjustments.html); Greg
Benz, Masking 2.0 in Lightroom and ACR
(gregbenzphotography.com/photography-tips/masking-2-0-in-lightroom-and-acr/),
for the list of what masks cannot reach; Adobe Camera Raw idea board, HSL
adjustments for local adjustment tools; darktable user manual, masking and
blending — overview, parametric masks, and combining drawn and parametric masks
(docs.darktable.org/usermanual/development/en/darkroom/masking-and-blending/).

## Weighed against

**030, "A mask can only act in one place"**, is this record's other half and it
is already written, with the measurement: `tools/scope-check.mjs` lists
forty-four whole-frame knobs, six of them carrying an OWED reason that reduces
to one sentence — the sky and the canopy want opposite amounts and there is one
control. 030's chosen option is the smallest version of what is asked here:
let a mask declare which stages it gates, starting with denoise and texture.
This record does not repeat that work and does not replace it.

**040, "The mask panel does not say what it can do"**, built the panel this
would move: the named list, the rename, leaving a mask by pressing it, the
sentence that masks combine, and saved masks as recipes. All of it survives a
move — a list is a list wherever it lives — but the SHAPE of the panel is
settled there and re-opened here.

**024, "Every control can say what it does"**, is the standing promise that
gets more expensive the moment a mask hosts twenty controls instead of five.

## Depends

- needs 030 — until the pipeline can aim a selection at a named stage, there is
  nothing to put in a mask mode but the five adjustments that exist today, and
  a mode holding five sliders promises more than it has. 030 is what creates
  the controls this surface is for.
- touches 040 — 040 settled the mask panel's list, naming and saved masks
  inside the tab strip; this takes that panel out of the tab strip.
- touches 024 — the promise that every control says what it does, on a surface
  that would carry several times as many.

## Options

**Lightroom's split, in this app's own inventory: the mask becomes a place, and
what it hosts is whatever 030 has taught the pipeline to aim.** Chosen. The
mode and the first aimed controls land together, and the panel is built for a
list that grows — grouped, collapsible, the calibrated tokens — so each later
local control is an entry rather than a redesign. The inventory is the scope
gate's six OWED knobs first, because those are the ones already measured as
wanting two answers in one frame.

Chosen because it is the only order in which each step can be checked. A mode
holding the five adjustments that exist today is a worse panel than the tab is.
A pipeline that can aim with nowhere to say so is invisible. Neither half is
verifiable alone, and together they are.

2. Ship the mode now with the five, widen later.
3. darktable's model outright — every stage takes a mask.
4. Widen the five in place and leave the panel in the tab strip.

## Rejected

**2, the mode now.** A mode is a claim about capacity: moving five sliders out
of a tab and into a place of their own tells the reader that the place is where
the controls live, and then they find five. That is 040's own headline defect
turned inside out — there the app could do something and did not say so, here
it would say something it cannot do.

**3, every stage takes a mask.** The general answer, and a rewrite of
`compileEdit`, `src/gl.ts`, `stampOf`, the preview cache and the export at
once. 030 rejected it for the same reason and named the cost this repo has
already paid for moving a stage: the TIFF export corruption in IR-SCIENCE 9l-ii,
diagnosed wrong the first time.

**4, a longer menu in the same tab.** "Not limited to the controls in the mask
menu" is a statement about the menu, and leaving the menu where it is makes it
the one shape the ask rules out. The tab's height is also the reason the list
is five long.

**Copying Lightroom's control list verbatim.** It is a visible-light
inventory — no channel swap, no red-channel flood, no hotspot, no lens
correction that matters more here than there. The right list is this app's own
OWED entries, which were measured on these photographs. Taking Adobe's would
import controls that do not exist here and omit the ones that do.

**Treating this as a second 030.** The pipeline half is written, ranked and
unstarted. Filing it again under a new number would mean two records competing
to describe one change, which is what `## Depends` exists to prevent.

## Rank

**Directly below 030**, which is where the dependency puts it and no higher.

The test is whether anything ranked above would have to be redone. 013 and 016
are look tuning and are untouched by where the controls live, so they are not
moved. But 030 itself would be: the moment it lands, there are aimed controls
needing somewhere to sit, and the only place today is the five-slider tab.
Putting them there and moving them afterwards is exactly the redo the ranking
test is about — which is why this sits immediately after 030 rather than
further down the queue.
