# 049 · Show the border and let it be moved

## Context

Proposed 2026-09-22, from the device, after the sky selection stopped at a
jet's wing. The detection itself is not the complaint: the default is good.
What is missing is an OVERRIDE. Somebody looking at the photograph knows where
the horizon is; the detector infers it, and there is currently no way for the
first fact to reach the second.

**Two things about the code make this cheaper and stronger than it looks.**

**The border already exists as data and already leaves the module.**
`SkyHorizon.b` is an `Int32Array` of one border depth per display column —
`b[a]` is where sky ends in column `a`, and `b[a] === 0` means that column holds
no sky — and `buildSkyMask` already returns the whole `SkyHorizon` beside the
bitmap, carried out for the walks and the probe. Nothing needs computing.
Showing it is drawing an existing array, and adjusting it is editing one integer
per column.

**And the border is ALREADY absolute, which is what makes an override worth
having.** `src/sky.ts` states it: every pixel above the horizon is selected
regardless, because the horizon is what decided it is sky and a colour fitted to
it has no standing to overrule it. The model's job starts BELOW the border,
carrying the selection down to the treeline and in through the branches. So a
corrected border is not a hint the algorithm can talk itself out of — it is
honoured, and the colour stage then does the pixel work underneath it. That is
the right division of labour: the semantic fact from the person who can see the
scene, the pixel-accurate boundary from the machine.

**AND IT IS NOT JUDGED BY WHETHER IT SOLVES THE REPORTED FRAME ALONE.** A
per-column border expresses one transition — sky above, not-sky below — and a
wing is sky, then wing, then sky. Moved down to the true horizon it therefore
takes the wing in along with the sky it was moved for.

That is not a defect in this control and not a reason to give it a special
case. **The wing comes off with a Colour mask joined as Subtract from it, which
ships today.** Move the border to where the horizon actually is; subtract the
wing by its colour; the sky above and below it is selected and the wing is not.
Two controls, each doing one thing it can be held to.

**So the reported frame is answered by this plus what already exists, and does
not need 048.** That does not retire 048 — a union still serves every case a
subtract cannot, and both stay wanted for the reason already written down about
the intersection.

**The principle, because it decided this record's shape:** a capability is
judged on whether it does what it says and does it correctly, not on whether it
delivers a desired outcome by itself. Outcomes come from stacks. A control that
grows a special case for each outcome somebody wants ends up doing several
things approximately instead of one thing exactly, and every special case is a
behaviour a reader has to learn and a gate has to assert.

## Looked up

**This is interactive segmentation, and the field settled its shape decades
ago: the person supplies sparse CONSTRAINTS, the algorithm supplies the
pixel-accurate boundary.** Scribble-based methods — graph cut, random walk,
Lazy Snapping — take pixels tagged as foreground or background and treat them
as must-link and cannot-link constraints on an optimisation that then finds the
boundary itself. The user is never asked to trace the edge; they are asked for
the thing only they know, and the solver does the work that a hand is bad at.

Lazy Snapping's stated contribution is the half that matters here: **instant
visual feedback, with the contour snapping to the true object boundary** even
where the edge is ambiguous or low contrast. Seeing the boundary while
correcting it is not a nicety, it is the mechanism — a constraint given blind is
a guess.

What is proposed here is the 1-D case of exactly that. The border is a single
depth per column rather than a 2-D contour, so the constraint a reader gives is
a drag along a visible line, and the sky model still resolves every pixel below
it. Nothing about the interaction is tracing an edge.

**No raw editor surveyed exposes this.** Lightroom's Select Sky and Capture
One's equivalents offer add and subtract components over the finished mask;
none of them shows the boundary the detector decided on, or lets it be moved.
That is an argument for the idea rather than against it — the underlying border
is usually an implementation detail those tools never compute explicitly,
whereas this app computes it as a first-class stage and throws the handle away.

Sources: *Interactive Image Segmentation Using Constrained Dominant Sets*
(arxiv.org/pdf/1608.00641), which surveys the scribble-as-constraint family
including graph cut, random walk and lazy snapping; *User-friendly Interactive
Image Segmentation through Unified Combinatorial User Inputs*
(jianfei-cai.github.io/TIP10-CRW-Yang.pdf).

## Weighed against

**048 — colour cannot finish a selection an occluder has split.** The nearest
item and the one this could be mistaken for. 048 completes a finished mask from
ANOTHER mask, which serves every mask type and every case where a second
selection is the right source. This corrects the BORDER the sky mask is derived
from, before the colour stage runs, and serves the sky mask only. **Neither
replaces the other and both are wanted** — the same rule that keeps the
intersection when the union lands. On the reported frame they are two routes to
one result; on a macro with no sky in it, only this one applies; on a colour
selection that needs completing from a brush, only 048 does.

**031 — a generated selection can be corrected by hand.** Shipped, and this is
deliberately NOT it. 031 corrects the MASK, pixel by pixel, after it is built —
the hand-correction buttons on the sky mask. This corrects the BORDER the mask
is generated FROM, before generation. Different object, different moment,
different amount of work asked of a hand. This repository has just paid for
answering a border problem with a mask-correction tool, so the distinction is
recorded rather than assumed.

**029 — the Sky mask claims things that are not sky.** Archived. Its remedy was
stage one, this border. An override is the admission that stage one will
sometimes be wrong and that being wrong is recoverable.

Previous work by `NOTES.md` heading: "## The sky selection, two stages".

## Depends

- touches 048 — both complete a sky selection the detector left short, by
  different routes and at different moments. Landing either one changes how much
  the other is reached for, and neither supersedes it.
- touches 028 — 028 is sky through a canopy, which the fill handles below the
  border. Moving the border changes where that fill starts, so what 028 is left
  to solve moves with it.
- distinct-from 031 — correcting the border that generates a mask is not
  correcting the mask. See "Weighed against"; conflating them is the mistake
  that produced this item.
- touches 029 — 029's remedy WAS this border: stage one exists because a colour
  model with no spatial authority claimed things that are not sky. An override
  is the admission that stage one is sometimes wrong, so what the border is
  allowed to claim, and who gets the last word on it, moves what 029 settled.
- distinct-from 025 — 025 also puts a draggable line over the photograph, for
  straightening. Different line, different stage, and a shared control would tie
  a composition tool to a selection stage.

## Options

**Draw the border over the photograph and let it be dragged, honoured
absolutely, with a colour veto inside any span the reader moved.** Chosen.

Three parts, and each is small because the data is already there.

**Draw it.** `SkyHorizon.b` is already returned from `buildSkyMask`. One
polyline over the display, one point per column, shown while the sky mask is
selected. A reader who can see where the detector put the border can already
tell whether it is right — which is most of the value, before anything is
dragged.

**Let it be dragged.** Editing `b[a]` for a span of columns, with the drag
resampled across the columns it covers. It is a curve, not a region: the effort
is proportional to how wrong the detector was, not to the area of the selection.

**Honour it.** A moved column is authoritative exactly as a detected one is
today — "selected regardless" is the rule, and the reader inherits it whole
rather than a weaker version of it. No conditional behaviour, no span that
behaves differently from the columns beside it, nothing for a reader to learn
about when their correction counts.

The override is stored as the reader's edit, not baked into the bitmap, so
Reach, Feather and the colour toggle keep working on top of it — the same
separation the hand correction already uses.

## Rejected

**A single horizon slider.** The first thing asked for, and it still cannot
work: the quantity is one depth per column, so one control moves every column
including all the ones that are already right. What makes the chosen option
different is that it is not one number — it is the existing array, shown and
edited where it is wrong.

**A colour veto inside spans the reader moved. THIS RECORD'S OWN FIRST DRAFT,
corrected within the hour.** It existed so that dragging the border past a wing
would not swallow the wing — that is, so this one control would solve the
reported frame by itself. It is wrong twice: it duplicates a capability that
already ships (subtract a Colour mask), and it makes the control's behaviour
conditional, so a moved column would obey a different rule from the detected
column beside it and a reader would have to know which. It is written down
because it is the route a session reinvents: a special case always looks like
thoroughness at the moment it is added.

**Making the border a hint the colour model can overrule everywhere.** It would
make an override unnecessary by making the border advisory, and it undoes the
2026-09-20 work deliberately: stage one exists precisely because a colour model
with no spatial authority took 76.4% of a macro with no sky in it.

**Asking for the boundary to be traced.** The 2-D version of this, and the thing
the field's own literature is written to avoid. A reader supplies the constraint;
the algorithm supplies the boundary.

**Doing it instead of 048.** They answer different questions and the same
argument that keeps the intersection when the union lands keeps both of these.

**Doing it before 042.** 042 rewrites how a mask's controls reach the stages
around it, and the border editor is a new control on a mask.

## Rank

**Immediately above 048, below everything 048 sits below.**

It is the more fundamental of the two: it corrects the cause — a border in the
wrong place — where 048 patches the result from a second selection. It is also
the cheaper of the two to be wrong about, because an unmoved border behaves
exactly as today.

It does not go higher. Nothing ranked above it has to be redone once it lands,
and the mask work in flight above it rewrites the surface this control would sit
on.
