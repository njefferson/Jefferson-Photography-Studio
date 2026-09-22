# 040 · The mask panel does not say what it can do

## Context

Four things reported together from the device, 2026-09-20, all about the mask
panel as a surface rather than about what a mask computes.

**The first is not a missing feature and that is the finding.** The report asks
for masks to "include add, subtract, etc, like commercial offerings". Add,
subtract and intersect SHIPPED in 2.53 (decision 026, `936e9bd`) — with one
correction made 2026-09-22 and recorded rather than quietly edited: **"add"
there means adding a mask, not a UNION with the mask above, which does not
exist.** `groupWeight` folds op 1 as subtract and ops 0 and 2 through the same
multiply, so what shipped is subtract and intersect. Record 048 carries the
missing half and the report that found it. The rest of this paragraph stands:
`MaskLayer.op` says how a mask joins the one above it, `maskGroups` reads the
flat list into groups and `groupWeight` folds them with darktable's
exclusive/inclusive algebra. The capability is there and was not found. That is
a defect in the panel, and it is a worse one than a missing feature, because
nothing about the app reports it: every gate is green, the walk that proves the
folding is correct passes, and the reader concludes the app cannot do it.

**The second: the hand correction is one brush and you cannot see it.** `Add by
hand` and `Take out by hand` shipped a stroke radius with no way to change it
and no ring under the pointer, so the size is discovered by making a mark and
the mark is the only feedback. On a small correction — sky between branches,
the rim round a roofline — a brush that will not go small is the same as no
brush.

**The third: there is no place to keep a mask.** A selection that took work is
thrown away with the photograph.

**The fourth: nothing says you are finished with one.** A mask stays selected,
its panel stays open, and moving on means guessing that tapping elsewhere is
allowed rather than being told.

## Looked up

**Masks are a NAMED LIST in the field's tools, and the name is the affordance
that answers the fourth point.** Lightroom's masking panel lists every mask,
names it by type and number, and renames it from the three-dot menu or by
double-clicking (helpx.adobe.com/lightroom-cc/using/masking.html; jkost.com on
the Lightroom Classic masking tools). Selection is explicit and so is leaving
one, because the list is always there.

**Saving splits by WHAT KIND of mask it is, and that split is the design.** In
Lightroom a mask travels inside a preset; a generated one — Select Sky, Select
Subject, Background — is **recomputed on the new photograph**, and a range mask
is computed from the new photo's own tones or colours. A BRUSH mask does not
travel well and the sources say so plainly: brush strokes are specific to the
subject in the frame, and for a series in the same position the recommended
move is to apply the previous photo's settings instead (scottdavenportphoto.com;
lightroomqueen.com forum on masks as presets). Capture One only gained saved AI
masks recently.

**That split is already this app's architecture**, which is the useful part: a
Sky mask is generated from the photograph, and 031's hand corrections are kept
as the STROKES they were rather than as painted pixels, precisely so they can
be replayed over a regenerated selection. A saved mask here is therefore a
recipe plus a stroke list, not a bitmap — the same thing a `.ipslook` already
is for the grade.

**On the brush ring**, nothing external is needed: a brush whose size is shown
before it is used is not a convention, it is the definition of a brush cursor.

## Weighed against

**026** shipped the operators this report asks for, which makes it the evidence
for the first point rather than an overlap. **006, "Mask by subject /
background"**, is the other half of the report ("I also want to add masks for
subject") and is a different piece of work — a new selection method, not a
panel affordance — and stays where it is.

**031, "A generated selection can be corrected by hand"**, is where the brush
came from, and `NOTES.md` already carries the gap as a known one: "What is NOT
verified is how a correction drags on the tablet", and no ring under the
finger. This record is where that stops being a footnote.

**024, "Every control can say what it does, and a finger can reach the
saying"**, is the general form of the first and fourth points. If 024 lands
first, part of this is already done; if this lands first, 024 has one fewer
surface to cover. Neither blocks the other.

## Depends

- touches 026 — 026 shipped the operators this report asks for. Nothing here
  changes how they fold; what it changes is whether the panel shows that they
  are there, which is why this is a panel item and not a second 026.
- touches 031 — the brush this adds a size and a ring to is 031's, and the
  saved mask this describes is 031's stroke list plus a recipe.
- touches 024 — 024 is the general promise that a control says what it does;
  the first and fourth points here are that promise on one panel.
- distinct-from 006 — 006 adds a new WAY to select (subject, background). This
  changes nothing about what a mask computes. They were asked for in one
  sentence and they are not one piece of work.

## Options

**Treat the panel as the deliverable: a named list, a brush you can see and
size, and a way to be finished.** Chosen, and the four are one piece of work
because they are one surface and would otherwise be four visits to it.

The list names each mask by what it is and lets the reader rename it, which is
both the fourth point's answer — being finished is deselecting in a list that
is always visible — and the first point's, because a group's members and the
operator joining them are legible once each has a name and a place.

The brush gets a size control and a ring that follows the pointer before it
touches, which is the whole of the second point.

And a saved mask is a RECIPE, not a bitmap: the selection's kind and its
numbers, plus 031's stroke list. On a Sky mask that means it is recomputed on
the new photograph, which is what the field does and what makes it useful on a
frame that is not the one it was built on.

## Built already

Four of this item's five parts already have code behind them, and the fifth has
a shape to copy. The point of writing that here is 040's own headline: the
capability was there and was not found. Building it again would be the same
defect one level up.

- **The set operators are shipped, whole** — `src/main.ts` renders the join row
  (`mJoinAdd` / minus / within) and the mask list writes the operator into each
  row's own name, so a component reads "minus Sky 2" rather than looking like a
  separate mask. Record 026 is in the archive. The gap is that the join row is
  hidden on the FIRST mask, which is correct — it has nothing above it to join —
  and means a reader with one mask never sees the feature exists. **That is a
  surfacing job, not a building one.**
- **The brush's ring and its size control are shipped**, 2026-09-20, from this
  record's own second point: hand size is a position mapped exponentially from
  0.4% of the frame to 40%, and `#fixBrush` shows the footprint from the moment
  a mode is armed and again while the slider moves. It copies `stkBrush`, the
  sticker brush's ring, deliberately rather than being a second design — copy
  that again for any further brush rather than drawing a third.
- **Corrections are already kept as strokes rather than painted in**
  (record 031: the `FixStroke` list rides the mask itself and is replayed in
  `src/pipeline.ts`), which is
  precisely what makes a saved mask a RECIPE rather than a bitmap. The saved
  form this item needs is that list plus the selection's own numbers; nothing
  new has to be invented to make a Sky mask travel to another photograph.
- **The selection itself is already a named, exported thing** — `src/sky.ts`
  exports `buildSkyMask`, and `src/skyhorizon.ts` and `src/skyfine.ts` are the
  two halves behind it. A named list does not need a new model of what a mask
  is.
- **The walks to extend rather than replace**: `tools/mask-slots-walk.mjs` for
  the list and the slots, `tools/mask-truth-walk.mjs` for what the overlay
  actually shows, `tools/fullview-mask-walk.mjs` for the tab-in-front rule that
  any new mask surface has to respect, and `tools/fix-brush-walk.mjs` for the
  ring. A new surface joins `tools/surfaces.mjs` in the same commit that creates
  it, or it ships unmeasured.

What genuinely does not exist: renaming a mask, persisting one beyond the
session, and any statement in the panel of what the panel can do.

## Rejected

**Building add/subtract again.** It is shipped. The first point is a request
for something that exists, and the record's job is to say so: what is needed is
for the panel to show it.

**Saving a mask as its bitmap.** It is the obvious reading of "save a mask" and
it is the one the field rejected: a bitmap is bound to one photograph's
geometry and one frame's subject, so it is right on the frame it came from and
wrong on every other. 031 already chose the stroke over the bitmap, for the
same reason one level down.

**A "done with this mask" button.** It is a control to leave a mode that should
not have felt like a mode. The list is what every tool uses and it removes the
question rather than answering it.

**Making the brush size a slider only.** It would be sized by a number for a
gesture that is judged by eye; the ring is the part that makes the number mean
something, and a size control without it is the defect restated.

**Folding 006's subject masks in.** Asked in the same sentence, genuinely
different work — a selection method rather than a panel.

## Rank

**With the mask work already in flight and above the additions.** The first
point in particular is a shipped capability the reader cannot reach, which
makes it worth more than most new work; and the brush is the half of 031 that
was named as unfinished on the day it shipped. It sits below the two located
one-condition defects only because those are smaller.

## Outcome

**All four points shipped, across three commits and two releases.**

- **"Fixed: the correction brush goes small, and shows you its size first"**
  (2026-09-20) — the second point. Hand size is a POSITION mapped
  exponentially from 0.4% of the frame to 40%, and `#fixBrush` shows the
  footprint from the moment a mode is armed and again while the slider moves.
  It copies `stkBrush`, the sticker brush's ring, rather than being a second
  design.
- **"New: name your masks, and the panel says that they combine"** — the first
  and fourth points, released as 2.55. The sentence about combining sits above
  the list, where it is read BEFORE a mask exists, which is the reader the
  first point is about; naming replaces the derived string rather than sitting
  beside it; and pressing the selected mask leaves it.
- **"New: keep a mask and put it on another photograph"** — the third point,
  released as 2.56. `src/maskstore.ts` stores a RECIPE: the mask's numbers with
  every bitmap stripped, plus 031's stroke list. A saved Sky mask is
  re-detected on the new photograph and the strokes replayed over what it
  finds. A brush mask is refused in words.

**What turned out wrong.**

**The record's own research named the failure and the work repeated it one
level up.** "A capability that cannot be found is worse than a missing one,
because nothing about the app reports it" — and the saved-mask list is
`hidden` until something has been saved, so the accessibility sweep walked
straight past the new controls the same way it had walked past the mask editor
for that editor's whole life. It was caught before shipping only because the
plan said the walk had to REACH the new controls. `tools/a11y-walk.mjs` now
makes and saves a mask before both its passes, in the commit that created the
surface. A `hidden` container is the shape to look for, not a one-off.

**And the check that matters could not be written as "did the mask come
back".** A stored bitmap comes back too, and would lay the previous
photograph's sky over this one. The assertion had to be that the SELECTION is
regenerated: frame A's sky is 54% of itself, the saved mask on frame B selects
18%, and a fresh detection on frame B also gives 18%. Made to fail first — with
a bitmap smuggled through `shapeOf` and the regeneration skipped, frame B
reported 54% and that one check went red while every other check in the walk
stayed green.
