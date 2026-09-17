# 005 · More composition overlays

## Context

Beyond the rule-of-thirds grid, offer selectable composition guides while
cropping: golden-ratio grid, golden spiral, the diagonal method, a finer grid, a
centre cross. Thirds stays the default. Owner ask 2026-07-16, marked optional.

The build notes are already written into the bullet and are unusually complete:
the guides are one element `#cropGuides` inside `#cropBox`, drawn as hairline CSS
`repeating-linear-gradient`s and toggled per focus by `.focus-crop` /
`.focus-straighten` on `#cropOverlay` (`setGeoMode` in `main.ts`, positioned by
`positionCropOverlay`, styles in `style.css`). The work is a picker that sets a
class or data attribute, one background layer per style, the last choice
remembered in `localStorage` like the panel tab.

## Looked up

**Owed, and cheap.** The golden spiral in particular has an exact construction and
a conventional placement, and the diagonal method has a specific definition — both
are documented and neither should be drawn from memory. The bullet already notes
the spiral needs inline SVG rather than a gradient, which is the one technical
consequence of getting the geometry right.

## Weighed against

Touches `#cropOverlay`, which **004** is also changing. Doing this first means
drawing guides into a container whose sizing model 004 will replace; doing it
after means one implementation. Nothing in the pipeline or export is involved —
overlay only, exactly like the thirds grid.

## Options

**After 004.** One implementation against the final container.

Before 004, as a self-contained addition. Cheaper to start and pays for the crop
overlay work twice.

## Rejected

**Making a new default.** Thirds stays the default; this is additive and optional,
and the owner said so. A guide that changes what every existing user sees while
cropping is a different and unrequested change.

## Rank

**Fifth.** Explicitly optional, small, and gated behind 004 by the shared
container — so it is correctly below the items that unblock it, and above the
research-blocked ones below.
