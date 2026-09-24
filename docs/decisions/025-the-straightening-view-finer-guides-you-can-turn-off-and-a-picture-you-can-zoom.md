# 025 · While you straighten: finer guides you can turn off, and a picture you can zoom and pan

## Context

Asked 2026-09-19 from the PC, two parts of the same surface.

**The guides.** The straighten overlay draws TWELFTHS — a grid at
`calc(100% / 12)` in both directions at 0.22 alpha, which replaced sixths
because a horizon is levelled against the nearest line to it and twice as
many lines halves the worst distance from any edge to something to judge it
against (`#cropOverlay.focus-straighten #cropGuides`). The ask is for
sub-lines below that, and a way to turn them on and off from the straighten
card — because twice the lines is twice the ink over the photograph, which is
the reason the alpha was dropped when the count doubled, and because at some
point the grid is what you are looking at instead of the picture.

**The picture.** While the tool is armed, one pointer MOVES THE CROP BOX
(`startCropDrag("move", …)`) and two pointers pinch-zoom, clamped to
box-fill × 2.5 in straighten. There is no wheel handler on the overlay. So on
a machine with a mouse there is no way to zoom or pan at all while
straightening, and on a tablet there is a pinch but no pan — the one-finger
drag is spent on the box. Levelling a horizon by a tenth of a degree is
exactly when a reader wants to be in close on one edge of it.

Intended outcome: a straightening view whose guides can be made finer and
turned off, and whose picture can be moved and magnified while the angle is
being set, on both a tablet and a machine with a mouse.

## Looked up

**Lightroom gives both, and its shapes are worth copying.** Holding the
SPACEBAR pans and zooms while cropping — a modifier that borrows the whole
surface for a moment and gives it straight back. Pressing **O** cycles the
overlay through six choices (Grid, Thirds, Diagonal, Triangle, Golden Ratio,
Golden Spiral), so the overlay is a CHOICE rather than a constant, and one of
those choices is a plain grid. And a finer Grid Overlay appears
automatically while the Angle tool is being dragged — the density arrives
when the angle is moving and leaves when it stops, which answers "twice the
ink" without a control at all. Sources: Adobe's Crop, Rotate and Geometry
help, and Julieanne Kost's crop-and-straighten notes.

**Neither of those two inputs exists on a tablet.** A spacebar and a letter
key are a desktop's modifiers; this app is used by touch, so whatever the
shapes become here, each needs a control a finger can reach — which is the
same constraint 024 is about, and the reason the requested toggle
belongs on the straighten card rather than on a key.

## Weighed against

- **003 and 004** (the photo fills the app, the crop flows behind the tools)
  — both change what the straightening surface IS, and 004 is the crop
  surface specifically. This item is the behaviour inside that surface and
  can be built before or after, but its layout answers should not contradict
  004's.
- **The straighten card's own height**, halved on wide screens 2026-09-19:
  the toggle is one more control on a card whose size is what the photograph
  steps back by, so it lands in the header row or nowhere.
- **The existing pinch** (box-fill × 2.5) — the zoom already exists by touch
  and is clamped; this item is the missing pan, the missing wheel, and what
  a one-finger drag should mean when the box is not what you want to move.
- **`tools/rotation-walk.mjs`** — it drives straighten and asserts the Reset
  fit, so it is where these behaviours get held.

## Depends

- touches 003 — 003 changes what the straightening surface is.
- touches 004 — 004 is that surface specifically. This item is the behaviour
  inside it and can be built before or after, but its layout answers must not
  contradict 004's.

## Options

1. **The grid gains a second, lighter set of sub-lines and a toggle on the
   straighten card; the picture gains a pan and a wheel zoom.** Chosen shape,
   with three questions left to settle by looking rather than by argument:
   whether the sub-lines are always on, on only while the angle is moving
   (Lightroom's answer, and it costs no control), or on the toggle; what a
   one-finger drag means once pan exists (the box, the picture, or the box
   only when it starts on a handle); and whether the toggle cycles density
   (none, twelfths, sub-lines) rather than being a two-state switch.
2. Sub-lines only, no toggle. Rejected: the reason the alpha dropped when the
   count doubled is that ink over the photograph is a cost, and doubling it
   again without an off switch spends that cost on every reader.
3. Zoom and pan only, no guide change.
4. A keyboard modifier, as Lightroom has. Rejected: this app is used by
   touch, and a control only a keyboard can reach is a control most of its
   sessions do not have.

## Rejected

- **2**, above.
- **4**, above. A keyboard shortcut MAY be added beside a touch control, but
  it cannot be the only way in.
- **3 alone** — it answers half the ask, and the two halves share a surface,
  a walk and a card; splitting them means two passes over the same code.

## Rank

Below 019, 018 and 023, and below 024 (which settles how a control explains
itself, and this item adds a control). Above the unscoped design items. It is
ahead of 003 and 004 in usefulness but behind them in logic, so it is built
whenever the straighten surface is next opened, whichever of the two that is.
