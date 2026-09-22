# 048 · Colour cannot finish a selection an occluder has split

## Context

Reported from the device, 2026-09-22. The sky selection stops at a jet's wing:
the sky visible *under* the wing is not selected, and there is no way to bring
it in. Two things were asked for and neither exists.

**A mask cannot add to the mask above it.** Driven in the running app with real
presses at 2.58.1, the join control on the second mask and later offers exactly
three things: **On its own**, **Subtract from it**, **Only where both**. A
second mask can shrink the one above it or intersect with it. Nothing grows it.

**There is no control for where the sky's border falls.** `Reach` scales the
grow tolerances and cannot move the border — already recorded as a limitation —
and no other control touches it.

**The requirement, and it is the part that decides this record: colour is
expected to finish what the automatic selection could not.** Painting the
missing region in by hand, stroke by stroke, is not an acceptable remedy. It is
the app declining to do its job and handing the job back.

**WHY THE WING SPECIFICALLY, measured in the source rather than guessed.**
`src/skyhorizon.ts` computes **one border depth per display column**. In every
column the wing crosses, that border lands at the wing's top edge, and
everything below it in those columns is outside the seed by construction. That
is also why no single slider could fix it: the quantity is per-column, only
some columns are wrong, and one number cannot say which.

Stage two cannot recover it either. **Follow the sky's colour** grows the
selection out of what was found into pixels that match the sky's colour **and
join it** — the fill is 4-connected and refuses to cross a hard edge. A wing is
a hard edge with sky on the far side, so the region never joins, and no amount
of colour agreement reaches it. The one mechanism that re-adds detached sky,
the hole-fill, takes enclosed pixels that sit **no deeper than the sky already
reaches**; sky below a wing is deeper, so it is excluded by the same rule that
correctly excludes a bright object on the horizon.

So the two halves of the report are one defect: the selection is split by an
occluder, and nothing in the app can union the far side back on.

## Looked up

**The field's answer is a mask made of components, each added or subtracted,
and a colour selection that is deliberately NOT contiguous.**

**Lightroom** builds a mask as a list of components. Having run *Select Sky*,
the mask panel offers **Add** and **Subtract**, and *Add → Color Range* is the
documented way to bring in what the automatic selection missed. Adobe's own
help and working guides note the property that matters here: a Color Range
component added to a mask applies **across the entire image, not only the area
already selected** — non-contiguity is the feature, not a side effect, and it
is exactly what reaches a region an occluder has cut off.

**darktable** states the algebra directly. Drawn and parametric masks combine
under a *combine masks* setting: **exclusive** multiplies the component masks,
so a pixel is in the result only if it is in all of them (AND); **inclusive**
inverts, multiplies and inverts again, which the manual describes as an **OR**
operation — any pixel in either component is in the result.

**And this repository already cites that algebra while implementing half of
it.** Record 040's archive entry says add, subtract and intersect shipped in
2.53, naming darktable's exclusive/inclusive algebra. What shipped is subtract
and **exclusive** (Only where both). **Inclusive — the OR, the union — is the
half that is missing**, and it is the half this report needs.

Sources: Adobe, *Apply Masking for local adjustments*
(helpx.adobe.com/lightroom-cc/using/masking.html); darktable user manual,
*combining drawn & parametric masks*
(docs.darktable.org/usermanual/4.6/en/darkroom/masking-and-blending/masks/drawn-and-parametric/).

## Weighed against

**030 — a mask can only act in one place.** That record is about WHERE a
selection is allowed to act, once it exists. This is about the selection not
existing over the whole area it should. Same panel, different half.

**042 — a mask is a place, and most controls should work inside one.** Ranked
just below 030 and in flight. A union join is a new value in the same `op`
field 042's work already reads, so landing this after 042 is cheaper than
landing it before.

**028 — sky seen through a canopy takes no sky adjustment.** The nearest
neighbour, and worth stating why it is not the same item: 028 is about
selection through *many small gaps*, which the existing hole-fill is designed
for and partly achieves. This is about one *large* region behind one occluder,
which the hole-fill's depth rule excludes on purpose.

Previous work by `NOTES.md` heading: "## The sky selection, two stages" and
"## Masks combine (040)".

## Depends

- needs 042 — 042 rewrites what a mask's `op` reaches; adding a fourth value to
  that field before it settles means doing the same work twice.
- touches 030 — both change what a mask's area means to the stages downstream
  of it, and a union has to be folded before those stages read the weight.
- touches 028 — the same sky selection and the same hole-fill rule. A change to
  what counts as recoverable sky moves what 028 is left to do.
- distinct-from 023 — 023 is the sky mask reading COLOUR as well as place, and
  it is shipped. This is not a colour-model failure: the colour agrees over the
  whole region and the connectivity rule refuses it anyway.

## Options

**Give the join control its fourth value — inclusive, the union — so a Colour
mask can complete the Sky mask.** Chosen.

It is the field's answer twice over, it is the half of the algebra this repo
already claims to have shipped, and it is the reader's own words: use colour to
finish what the automatic selection could not. A Colour mask already selects by
colour across the whole frame with no connectivity requirement, which is
precisely the property that reaches the far side of a wing.

The mechanism slots into what exists rather than extending it: `op` already
carries 0, 1 and 2 through `EditParams`, the shader and the CPU pipeline, and
the join note already states the rule a union would follow — joined to the mask
above, the component shapes that mask's area and the adjustment above is the
one that applies. A fourth radio, one more fold case, no new concept for a
reader to learn.

**THE UNION IS ADDITIVE AND MUST NOT COST THE INTERSECTION. Both are wanted,
both ship, and neither replaces the other.** This is the failure to guard
against rather than a preference, because the code makes it easy: `groupWeight`
folds with `w *= op === 1 ? 1 - c : c`, so **intersect is the DEFAULT branch** —
op 0 and op 2 take the same multiply and only subtract is special-cased. A
session adding union to that expression is one edit away from making union the
default and quietly losing "Only where both", and every existing edit that
relies on an intersection would change meaning with nothing going red.

So union is a THIRD fold case, written as darktable's inclusive operator —
invert, multiply, invert, which is `w + c - w*c` — landing beside the existing
multiply rather than in place of it. "Only where both" keeps its radio, its
label, its `op` value of 2 and its arithmetic untouched. Whatever gate lands
with this asserts all three folds on the same components, so a later
simplification cannot drop one.

**What it does NOT do, stated so the next session does not discover it as a
surprise:** it does not make the automatic sky selection better. The wing still
splits it. The reader still has to make a Colour mask and join it. That is one
control and a colour pick rather than a hand-drawn region, which is the
difference the report is about — but it is not the selection getting it right
by itself.

## Rejected

**Letting the sky's colour growth take disconnected regions that match the
learned model.** The obvious fix, and the one the report's wording points at
most directly, which is why it is written down rather than merely not chosen.
`src/sky.ts`'s own header records three measured defects from exactly this
shape, from the era when a colour model ran without a spatial stage in front of
it: a macro with no sky in it took 76.4% of the frame, a frame whose top strip
was cloud learned cloud and refused clear sky lower down, and a playhouse wall
was taken because nothing in a colour test knows where the ground is. Stage one
exists to stop that. Dropping the connectivity requirement inside stage two
re-opens it, and the frame that proves the damage is not the frame that
motivated the change.

**A horizon slider.** Asked for directly, and a SLIDER still cannot work: the
border is one depth per display column, so a single control moves every column
including all the ones that are already right.

**CORRECTED 2026-09-22, same day, and the correction is recorded rather than
edited away.** This rejection continued "a per-column editor is a drawing tool
by another name, which is the thing being refused", and that sentence was
wrong. It generalised from the right conclusion about a slider to a claim about
every possible control, and in doing so it refused the good idea along with the
bad one. Showing the border and letting it be dragged is not drawing: the
reader supplies a constraint along a line that is already computed and already
returned, and the colour stage still resolves every pixel below it — which is
what the interactive-segmentation literature has done since Lazy Snapping. It
is record 049, ranked immediately above this one, and it is the more
fundamental of the two because it corrects the border rather than patching the
result. A rejected option is a live boundary; one written too wide fences off
work that should have happened.

**Widening `Reach`.** It scales the grow tolerances outward from the border and
cannot move the border. On this frame it would loosen the colour test
everywhere while still never crossing the wing.

**One combine setting for the whole group, replacing the per-component join.**
darktable has exactly that — a *combine masks* combobox — and it is the shape
that loses the intersection, because a single setting cannot say that component
two subtracts while component three unions. The per-component `op` this app
already has is the more expressive convention and it is the one Lightroom uses;
a union is a value in it, not a reason to replace it.

**Making union the default join and demoting intersect.** Union is the common
case and that is exactly the argument that would retire a control people use.
Both operations were asked for, both stay, and "On its own" remains the default
because a new mask carrying its own adjustment is what a reader expects.

**Hand-brushing it in.** Already in the app, already the answer that was given,
and rejected on the report: a selection tool that cannot finish a region of one
flat colour is not improved by asking for a steadier hand. It stays as a
correction of last resort, not as the route.

**Making the hole-fill accept regions deeper than the sky reaches.** It is one
constant away and it is the rule that correctly excludes a bright object sitting
on the horizon. Loosening it trades a defect nobody reported for the one that
was.

## Rank

**Below 042, above 028.**

It `needs` 042 by the dependency test: 042 is already in flight and rewrites the
field this would extend, so landing this first means doing it twice. It sits
above 028 because 028 is a refinement of a selection that mostly works, while
this is a selection with no route to completion at all — and because a union
join is the general remedy, which may leave 028 smaller than it looks.

Being reported today does not privilege it, and nothing ranked above it has to
be redone once it lands.
