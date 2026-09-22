# 052 · The look's sky adjustments read a selection the reader cannot see

## Context

Reported 2026-09-22 from the device, against Aerochrome: the look's sky
adjustment cannot be reproduced with a mask on sky the look does not reach, and
the suggested shape was that the look should open its own sky mask to start
from, which the reader then adds to and subtracts from, without losing Reach,
Feather and the rest.

**Read off the source rather than from the symptom, and the report is exactly
right. There are TWO sky selections on one photograph and the reader can steer
only one of them.**

The look's selection is the module-level `skyBitmap` and `skyFine` in
`src/main.ts`. It is built at open — `buildSkySelectionFrom(prepareSkySource(img))`,
or from `img.skySel` on a photograph already decoded — and assigned in exactly
six places, none of which is reachable from any control. It carries no Reach, no
Feather, no by-colour toggle and no hand corrections. It is what `skySmooth`,
`skyDepth` and `skySat` act through, which are the Aerochrome sky sliders.

The reader's selection is a type-4 Sky mask in `params.masks`. It has all of
those controls: `regenerateSkyMask` shapes the seed with `m.reach` and
`m.feather`, 023's by-colour grow reaches the sky between branches, and 031's
`fix` strokes are replayed over whatever the detection returns. It drives
nothing but the mask's own five adjustments.

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
different populations, at different points in the pipeline. The report is a
capability gap, not a tuning problem.

**018's title is "One sky selection, built at open, for every sky-aware tool",
and this is the half of it that did not ship.** What 018 unified was the
REFINEMENT: a Sky mask's `fine` is now built by the same `refineSkyMask` the
look's stages use, so one photograph no longer carries a soft hand-made sky and
a crisp look depth. The SELECTION was not unified. Its own Option 1 ends by
naming per-population strengths reading `skySel` as later items, so a follow-on
was anticipated; this is that follow-on arriving as a report instead.

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

## Weighed against

**018**, whose title this completes and whose Outcome explains why only the
refinement was unified: the record's own Option 1 was about what a type-4 mask
IS on the sampling side, and it named per-population strengths reading `skySel`
as separate later items.

**042**, which is this meeting from the other side — the ask that every control
should be usable inside a mask. If `skySat`, `skyDepth` and `skySmooth` became
mask adjustments, half of this is discharged. The other half is that the reader
should INHERIT the detection rather than build a selection from scratch on every
frame, which 042 does not cover.

**013**, the Aerochrome look's own population work, and the reason this is
ranked where it is rather than where a new report naturally lands.

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
   at open.** Chosen, because it is the field's shape and the reported one. The
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

**Ninth, directly above 013.**

A reported defect ranks where it naturally goes, and nothing about being
reported moves it. What moves this one is the dependency test: 013 tunes the
Aerochrome sky against the population the look's sky stages read, and this item
changes which population that is. Tuned first, those values are tuned against
ground that is about to move — the same test that put 023 at the top of the
queue when the look's population work was found to read the sky selection.

It sits below 042 rather than above it because the two meet in the middle and
042 was asked for first, as a principle covering every control rather than this
one; whichever is built first should shape the other, and building this one
blind to 042 risks a sky-shaped special case in a system that is meant to
generalise.

It does not go above 051, 030 or 042, none of which it invalidates, and it does
not go above 034 or 032, which are about a different stage entirely.
