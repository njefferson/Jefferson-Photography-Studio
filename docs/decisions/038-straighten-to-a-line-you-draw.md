# 038 · Straighten to a line you draw

## Context

Asked from the device, 2026-09-20: straightening should let you draw a line on
the photograph by tapping or clicking two points, and the image straightens to
that.

Today the app's straighten is an angle — a slider with tenth-degree nudges and
a grid over the frame — so the reader sets a number and judges the result, then
sets another number. What they actually know is not an angle: it is that THIS
edge should be level, and the edge is in front of them.

## Looked up

**This is a solved control with a name in two of the field's tools, and the
interaction is a DRAG rather than two taps.** Lightroom calls it the Angle tool
and puts it in the Crop & Straighten panel behind a ruler icon: pick it up and
drag along part of the tilted horizon, and on release the photo rotates to make
that line level (adobe.com/learn/lightroom-classic — crop and straighten your
photos; photofocus.com on straightening horizons). Photoshop's is the **Ruler
tool** plus Straighten Layer, the same gesture with a different name.

**What the field does NOT do is restrict it to the horizon.** The line is any
edge the reader says should be level — a roofline, a doorframe, a wall — and
the tool infers the angle from the line's own slope, so a vertical edge is the
same gesture read the other way.

**Two taps versus a drag is the part that is NOT settled by the sources**,
because both of those tools were designed for a mouse. On a tablet held in one
hand a drag across a large frame is the awkward gesture and two taps is not, so
the tap form is an adaptation to this app's device rather than a departure from
the convention.

## Weighed against

**025, "While you straighten: finer guides you can turn off, and a picture you
can zoom and pan"**, is the same screen and is about seeing well enough to
judge the angle by eye. This is about not having to judge it by eye at all.
They pull in the same direction and neither needs the other: a drawn line is
more accurate on a frame you can zoom, and zooming is worth having whether or
not a line can be drawn.

`NOTES.md` "## Straighten: denser grid and tenth-degree nudges" is the last
work on this control and it is the evidence for this item rather than against
it — the answer then was to make the number easier to get right, which is the
right fix for a control whose input is a number and the wrong shape for what
the reader is actually doing.

## Depends

- touches 025 — the same screen and the same tool. A line drawn on a frame the
  reader has zoomed into is more accurate than one drawn on a fitted frame, so
  whichever lands second benefits from the first; neither blocks the other.

## Options

**Two taps, with the line drawn between them and the angle taken from its
slope.** Chosen, and the tap form rather than the drag because of the device
this app is used on.

The line is shown while it is being placed and the frame does not move until
the second point lands, so the gesture can be abandoned and nothing has
happened. The angle it produces goes into the SAME `straighten` value the
slider carries — so undo, reset, the saved edit and the export all inherit it
with nothing new to teach them, and the slider afterwards shows the number the
line produced and can still be nudged.

Near-vertical lines are read as verticals rather than being rotated ninety
degrees, which is what every implementation of this does and is the one case
where an honest reading of the slope gives an absurd answer.

## Built already

Nothing here needs a new model of what straightening is, and saying so is the
point: the angle this produces is the one the slider already carries.

- **`applyStraighten` in `src/main.ts` is the one door**, and it exists because
  the slider and the tenth-of-a-degree buttons were already two ways to the
  same operation. It clamps to ±45, rounds to a tenth, re-fits the crop and
  re-fits the view. A drawn line is a third way in and teaches undo, Reset, the
  saved edit, a kept photograph and the export nothing new.
- **`levelHorizon` in `src/main.ts` is the nearest existing behaviour**, and its
  own comment is the rule to follow rather than the code to copy: which
  direction is negative is a fact about this pipeline's geometry and is
  asserted end to end by levelling a frame and measuring what came out, never
  reasoned about.
- **The pointer plumbing is there.** `cropOverlay` already captures pointers
  over the photograph, one finger pans and two pinch the view, and the drag
  record keeps its own start point — so a tap is a release within a few pixels
  of its press and needs no new machinery.
- **`sayLevel` and the note it writes into** are already an `aria-live` region
  in the straighten pill, and its height is already measured into the
  photograph's reserve. The tool says what it wants and what it did through
  the surface that exists.
- **`tools/rotation-walk.mjs`** already drives straighten, the crop that comes
  in behind it and Reset — the walk to re-run rather than replace.

What genuinely does not exist: any way to say WHICH edge should be level.

## Rejected

**A drag along the edge, as Lightroom and Photoshop do it.** It is the source
convention and it is a mouse gesture. On a tablet, a drag that must start and
end precisely across a large frame competes with the pan gesture and needs a
steady hand; two taps do not. The drag can be added later as a second way in
without changing anything decided here.

**Restricting it to the horizon.** The sources do not, and an infrared frame's
most reliably straight edge is very often a building rather than a horizon —
the reported frames are full of them.

**Inferring the angle automatically from the picture.** A horizon detector is a
different piece of work, it is wrong on frames with no horizon, and it answers
a question the reader was not asking: they know which edge they mean.

**Making it a new stored parameter.** `straighten` already exists, is already
in the five places an `EditParams` field has to be, and is already exported.
A second angle would be two answers to one question.

## Rank

**With the other control work and below the defects.** It is an addition rather
than a repair, it is bounded, and nothing else on the schedule waits on it.
