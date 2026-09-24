# 041 · The panel's scroll cues are drawn over its controls, and moving them again picks a different control

## Context

Reported from the device 2026-09-20 as a weird scroll artefact on the Export
panel while setting up a TIFF, with two screen photographs.

It is not a rendering artefact and it is not the pinned heading, which was the
first guess and was measured false — the heading holds one height across the
threshold (62px at 1180px wide, 58px narrow) and the panel's scroll height does
not move, so nothing jumps.

`.scroll-cue` floats over the scroller at `height: 0`, on purpose, so it takes
no space in the flow. The up one was placed four pixels under the pinned
heading, which on the Export tab is exactly where the Format menu begins.
Twelve pixels of scroll drew a 44x27 pill across the top-right corner of the
control the reader had opened the tab to use.

**Its own comment said the right-hand corner is "the one place nothing is
written."** That is true of this panel's buttons, which are full width with
centred labels. It is false of a `select`, which draws its chevron in exactly
that corner, and false of a slider, whose track runs the whole width.

Swept across all twelve tabs at 1180px and 420px, both pills were drawn over
menus and slider tracks on most of them — 44x21 over the auto button on Basic,
44x27 over the lift slider on IR, 44x5 and 44x16 over the look buttons on IR,
the Format menu on Export. **The pill had been moved twice before**, each time
to a corner where nothing was written for the controls somebody happened to
look at.

## Looked up

Nothing external, and the reason is specific rather than dismissive. The
question is not what a scroll affordance should look like — the convention is
settled and this panel already has two of them — but whether a floating overlay
can be placed inside THIS scroller without covering a control. That is a
property of this app's own layout and nothing outside it knows the answer.

What would send it outside is the replacement, if one is ever wanted: an edge
fade rather than a pill is the standard alternative, and it is rejected below
on a contrast argument this repo can settle itself.

## Built already

- `tools/scroll-cue-walk.mjs`, written for this item: sweeps every tab at two
  widths and fails when any floating overlay's drawn box intersects a control's
  box. It reads the tab list from the page, so a tab added later is swept with
  nothing to remember.
- `#panelUp` / `#panelDown` and their CSS are gone; `updateScrollCues` in
  `src/main.ts` is what is left of them.
- **`.welcome-cue` is a different element and is untouched** — the first-visit
  card's own cue, added 2026-07-15, sits over a card with nothing under
  it and covers nothing.
- The `^ Sections` button (`.section-back`) already carried the up cue's whole
  meaning, under the identical condition, one line away in the same function.

## Weighed against

Overlaps nothing on the schedule. Its neighbour in kind is the 2026-09-15
NOTES entry "One defect no gate here can see", which fixed these same two
pills' SHAPE and wrote down why no gate could see them — that entry's
diagnosis is what made this finding possible, and its scope was too narrow by
exactly one word: it said the accessibility gates cannot see a decoration, and
the truth is that no instrument here can.

Previous work on this path, by `NOTES.md` heading: "One defect no gate here can
see, and one taste call that was not a defect" (the pill shape), and the
comment history in `src/style.css` recording the two earlier moves.

## Depends

- distinct-from 040 — 040 is the mask panel saying what it can do, which is
  about a capability that exists and cannot be found. This is about an element
  that could always be seen and should not have been there. They look related
  because both are "the panel is not telling the truth" and they are not: one
  adds words, this removes a drawing.

## Options

**Remove both panel cues.** Chosen, and shipped 2026-09-20.

What is above the fold is now said by `^ Sections`, a labelled 44px control
that appeared under the identical condition and takes the reader there. What is
below is said by the content being cut off at the scroller's edge, which is
what a scroller looks like everywhere else.

The measurement is what decides it rather than taste: an element that covers a
menu's chevron on most tabs at both widths is not a cue, it is an occlusion,
and it is invisible to every check this repo runs.

## Rejected

**Move the pill again.** This is the route that gets reinvented and it has been
taken twice already. An overlay's position is a property of the CONTAINER and
what sits under it is a property of whatever tab the reader opened, so any
placement is correct only for the controls someone checked. There is no
position inside this panel that is clear of content: the scroller is full-width
controls from the heading to the last row.

**Reserve a lane.** A strip down the right of `.panel-body` that no control may
enter, with the cue in it. This one genuinely works and is what a restore would
have to do — it is written here so the cost is known rather than rediscovered:
roughly 30px off every control's width on every tab, which on the iPad
sidebar's ~350px is about nine per cent, spent permanently for an affordance
that is shown only while scrolling.

**An edge fade instead of a pill.** The usual replacement, and rejected on this
repo's own accessibility mandate: a gradient over a control reduces the
contrast of that control's text, and text is held to 4.5:1 in both themes. A
cue that dims what it sits on trades a covered chevron for an unreadable label.

**Keep them and narrow the walk's threshold** so a few pixels of overlap pass.
A threshold invites the next round to tune it rather than fix anything, and the
number it would have to admit — 44x27 over a menu — is not a few pixels.

**Remove only the up one.** It is the one that was reported, and it is the pure
redundancy case. But the down cue is the same element with the same property
and the sweep found it over the IR tab's look buttons at both widths, so half
the fix leaves the same defect with a smaller footprint.

## Rank

**Archived, not ranked** — the work shipped in 2.54. What remains is one
question for the owner, recorded here because it is the kind that gets answered
once and then re-asked: restore with the reserved lane above, at about 30px of
every control's width, or leave them out.

## Outcome

**Removed 2026-09-20, in the commit "Fixed: the arrows that floated over the
panel's controls are gone".**

The markup, the CSS and the handler went together, and so did two things that
were only there to serve them: the `--section-head-h` custom property and the
`ResizeObserver` that measured the heading into it. Nothing read that value
afterwards, and a ResizeObserver writing a style nothing reads is not free —
it runs on every layout of the heading, and the next session to find it has to
work out who depends on it before touching anything.

`tools/scroll-cue-walk.mjs` was made to fail first, and the first attempt at
that plant did nothing: it restyled elements the fix had deleted, so it printed
green. The plant rebuilds the pills with the geometry the stylesheet gave them,
and then four checks go red.

**What turned out wrong:** the first diagnosis in the plan for this work blamed
the pinned heading dropping its sub-line at the same threshold
(`.section-head.chose .section-sub`). Measured, that changes no height and no
scroll position — the sub-line still gives way to the `^ Sections` button, and
that behaviour is deliberate and untouched. Two things change at scrollTop 12
and only one of them was covering a control.
