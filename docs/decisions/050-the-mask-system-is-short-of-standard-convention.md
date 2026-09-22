# 050 · The mask system is short of standard convention

## Context

Asked for 2026-09-22, after the sky-selection report: a drawn box or circle that
ISOLATES part of the photograph, which a subsequent mask is then constrained by
— stated as the thing that would make colour masks better — together with the
observation that a good deal of standard mask convention may be missing here.

So this record is a survey rather than one feature, and it is written that way
on purpose: naming one gap at a time is how a system ends up with six of them.

**WHAT THIS APP HAS**, read off the panel and the shader rather than remembered.
Five mask types — radial (0), linear gradient (1), brush (2), colour (3), sky
(4). Per mask: invert, feather, and for the type that needs it a brush size with
paint/erase/clear, a colour pick with a swatch and one range, a sky reach with a
colour toggle and hand correction. Five adjustments per mask — brightness,
contrast, saturation, hue, warmth — plus four whole-photo tools that can be
aimed at a mask (clarity, dehaze, lens, shadow). Masks display as an outline or
a matte. They join as **On its own**, **Subtract from it**, **Only where both**.

**WHAT IS ACTUALLY MISSING, and what only LOOKS missing.** The distinction
matters: a gap that is already reachable by composing two controls is not a gap,
and building a control for it duplicates what ships.

**Reachable today, and therefore not a gap:** constraining a colour selection to
one part of the frame. A Radial mask with a Colour mask joined **Only where
both** is that, and it works. What is wrong with it is not the capability.

**Genuinely absent:**

1. **A rectangle.** The only drawn shapes are an ellipse and a linear gradient.
   A box is the shape asked for, it is in every comparable tool, and nothing in
   this app approximates it — an ellipse inscribed in the area you want leaves
   the corners out, and one that covers the corners takes in what is beside
   them.
2. **A luminance-range selection.** Absent entirely. Lightroom carries Luminance
   Range beside Color Range; darktable's parametric masks work on lightness,
   chroma and hue channels independently. This app's only parametric selection
   is one hue/saturation/value target with a single `colorRange` — a colour
   picker, not a set of channel ranges — so "the bright parts of this" cannot be
   selected at all.
3. **A proximity limit on a colour selection.** The colour mask matches its
   target across the whole frame with no spatial locality whatsoever. This is
   the exact problem Photoshop added *Localized Color Clusters* for in CS4:
   with it off, a colour match is sought throughout the image, and with it on,
   the selection is limited to pixels near the ones sampled.
4. **The union join.** Already record 048, listed here so the survey is whole.
5. **Several shapes inside ONE mask.** The convention is a mask that holds a
   list of shapes and one adjustment. Here every shape is its own mask and the
   relationship is expressed by `op` on the one below. Close to equivalent, and
   worth measuring against a real edit before deciding it is a gap.
6. **Duplicating a mask, and naming one.** The panel has delete and a count; a
   mask cannot be copied to make a second, similar one, and cannot be given a
   name that says what it is for.

**AND THE DISCOVERABILITY DEFECT SITS UNDER ALL OF IT.** The join control that
makes the reachable thing reachable appears only on the SECOND mask and later —
record 040 measured that, and it is why a capability that shipped in 2.53 was
asked for again from the device.

## Looked up

**Photoshop.** *Color Range* selects by sampled colour with a Fuzziness range.
**Localized Color Clusters**, added in CS4, limits the search to pixels near the
sampled ones, for the case where several objects in a frame share a colour and
only one is wanted. That is the spatial constraint being asked for, expressed as
proximity rather than as a drawn shape.

**darktable.** Drawn and parametric masks combine into one mask for a module,
governed by each component's polarity and a *combine masks* setting: exclusive
multiplies the components, so a pixel survives only if every component holds it;
inclusive inverts, multiplies and inverts again, which is an OR. **A drawn shape
restricting where a parametric mask acts is the documented standard workflow**,
not an advanced trick — and it is exactly the shape of what was asked for.

**Lightroom.** A mask is a list of components, each Added or Subtracted, with
Color Range, Luminance Range, Depth Range, Brush, Linear and Radial among them,
and Intersect available on the mask. Refining an automatic selection by adding a
range component to it is the documented route.

**What the three agree on** is the part worth taking: a mask is a COMPOSITION of
components, the set operators between them are first-class, and a drawn shape
scoping a parametric one is ordinary rather than clever. This app has the
components and two of the three operators, and no rectangle to scope with.

Sources: Adobe, *Select a color range in Photoshop*
(helpx.adobe.com/photoshop/desktop/make-selections/freehand-selections/select-a-color-range-in-photoshop.html);
Photoshop Essentials, *The Color Range Command*
(photoshopessentials.com/basics/selections/color-range/); darktable user manual,
*combining drawn & parametric masks* and *parametric masks*
(docs.darktable.org/usermanual/4.6/en/darkroom/masking-and-blending/masks/);
Adobe, *Apply Masking for local adjustments*
(helpx.adobe.com/lightroom-cc/using/masking.html).

## Weighed against

**048 — the union join.** One item in this survey, already recorded and ranked,
and left where it is rather than folded in here. A survey that swallows its
members stops being a survey and becomes a second plan for work already planned.

**049 — show the border and let it be moved.** Not a mask convention; it is a
correction to a generation stage. Separate on purpose.

**006 — mask by subject / background.** Already on the schedule since
2026-07-16, and it is the auto-selection line of the same convention. Not
re-opened here.

**040 — the mask panel does not say what it can do.** Its finding applies to
everything below: adding capability to a panel that does not report what it
already has buys less than it looks.

Previous work by `NOTES.md` heading: "## Masks combine (040)" and
"## The sky selection, two stages".

## Depends

- touches 048 — 048 is one row of this survey. Landing it removes a row; landing
  the rectangle does not change what 048 does.
- touches 040 — every item here adds to a panel 040 measured as not reporting
  what it holds, so the order between them changes what each is worth.
- touches 006 — the auto-selection line of the same convention; a shared
  components-and-operators shape serves both.
- needs 042 — 042 rewrites what a mask's controls reach. Adding mask types and
  operators before it settles means doing the wiring twice.
- distinct-from 049 — 049 corrects where a generated selection BEGINS; this is
  about combining selections once they exist. The two were conflated once
  already in this repository and the cost is recorded in 049.

## Options

**Take the survey as a survey: each row is its own piece of work, ranked on its
own, and nothing here becomes one control that does several of them.** Chosen.

This is the shape the record exists to defend. A rectangle is a shape type and
nothing else. A luminance range is a selection type and nothing else. A
proximity limit is one parameter on the colour mask. Each can be held to whether
it does what it says; none of them is judged on whether it delivers an outcome,
because outcomes come from stacking them — which is what the standard
convention actually is, and what the three tools surveyed above all implement.

**The first two rows to build, and why those:** the rectangle, because it is the
shape asked for and there is no way to approximate it; and the proximity limit
on the colour mask, because it is one parameter and it is what makes colour
selection usable on a frame where the same colour appears twice.

**What is deliberately NOT decided here:** the order of the remaining rows
against each other, and whether row 5 (several shapes in one mask) is a gap at
all. That one needs measuring against a real edit rather than against a manual.

## Rejected

**One "advanced mask" control that offers several of these.** The failure this
record's own Options section is written against, and the one hub LESSONS 353
names: a control justified by a scenario rather than by its own job ends up
doing several things approximately.

**Building the rectangle as a special case of the radial.** An ellipse with a
corner radius is a third thing that is neither, and its parameters would have to
mean different things depending on a mode. A rectangle is its own type.

**A control for "constrain this mask to that region".** It is already Radial
plus **Only where both**, and adding a second route to it would give the app two
ways to do one thing that can disagree. What that composition lacks is a
rectangle and discoverability, and those are the things to fix.

**Treating the discoverability defect as a documentation job.** 040 already
tried the sentence. The panel has one now and the capability was still not
found, which is evidence about where the control lives rather than about how it
is described.

**Doing the survey and then not ranking it.** A list of everything missing, with
nothing placed, is the shape that produces a second survey a month later.

## Rank

**Row by row rather than as a block, and the block itself sits below 042.**

Nothing here can be built before 042 settles the wiring it would all pass
through, which is the dependency test rather than a preference. Within the
survey, the rectangle and the colour-proximity limit rank with 048 — they are
the rows with a named user need behind them and the smallest surface each. The
luminance range, duplicate and naming rank below, as capability rather than
repair. Row 5 is not ranked until it is measured.
