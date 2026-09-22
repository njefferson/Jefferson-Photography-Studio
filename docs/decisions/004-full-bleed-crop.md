# 004 · Full-bleed crop — the photo flows behind the crop tools

## Context

With a geometry tool armed, the photo reaches the screen edges and the crop box,
grid, Straighten pill and Done float over it, instead of the photo being
letterboxed inside the contained `#view` rect. Owner design question 2026-07-16,
and the first concrete instance of 003.

**The pilot shipped 2026-09-10 and this stays open.** What landed: the canvas
reaches the top and both side edges (safe-area only), the 8px border-radius is
gone, `#stage` drops its 12px gutter. Measured — 100% of the width against
93%/90% before, side gaps 0 against 30/22, radius 0px against 8px, all four crop
handles still grabbable at 820x1180 and 430x900. The rounded rect was what cut
black wedges off a tilted photo's corners, so the alignment defect closed with it.

What deliberately did NOT land: the bottom still reserves the crop pill's
measured height, because the bottom handles have to stay grabbable.

## Looked up

**Not recorded at the time, and the gap is visible in what shipped.** Whether a
floating control should pass taps through where it is empty is a standard
hit-testing question with a standard answer (`pointer-events` on the container
versus its children), and the item is parked on it as though it were open
research. It is not; it is one CSS property and a decision about what the empty
area of the pill should do.

## Weighed against

The pilot for **003**, so its remaining question is 003's question narrowed to one
control. Also subsumes the crop-box clamp defect recorded in `NOTES.md`: with the
photo filling the screen, the box clamps to the photo rather than to a
letterboxed rect.

Non-trivial against the existing code: canvas sizing, the box-to-photo mapping
through `viewImageRect` and `positionCropOverlay`, pinch anchoring, and the
OS-edge insets under `.cropping` all assume the contained `#view`.

**THE ROTATION GESTURE IS NOT THIS ITEM'S TO INVENT ANY MORE.** `027` declares
that it SETS the idiom for turning something on this device, and it is ranked
far above this, so by the time this is built the gesture will exist and this
adopts it. The declaration used to run the other way — `027` was to reuse what
this settles — which was unsatisfiable at its rank and was corrected on
2026-09-22 rather than left to be discovered by whichever was built first
inventing a second way to turn something.

## Depends

- touches 027 — 027 sets the idiom for turning something on this device and is
  ranked far above this, so this ADOPTS that gesture rather than inventing a
  second way to turn something. Declared here as well as there because this
  record names 027 in its own prose, and a citation with no relation behind it
  is how the graph comes to be grown out of somebody's memory instead of out of
  what is written.

## Options

**Float the crop pill over the photo and let taps pass through where it is
empty**, reclaiming the reserved bottom band. This is the remaining work and it is
the owner's open question.

Keep the reserved bottom band. What ships today; safe, and leaves the pilot
incomplete against its own brief.

## Rejected

**Removing the reserved band without solving hit-testing first.** The bottom crop
handles are in that band. Taking the reservation away and letting the pill
overlap them would make the handles unreachable by finger — which is exactly the
failure Doctrine §4 records for Quietkeep's skip link, a control present in the
source and reachable by nobody.

## Rank

**Fourth.** It is the smallest remaining piece of the 003 direction and the one
with a measured baseline already in place, so it is the cheapest way to answer a
question that three other items are waiting on.
