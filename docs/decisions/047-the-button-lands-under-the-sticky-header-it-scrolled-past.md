# 047 · The heading you were sent to is the one thing the jump hides

## Context

Reported from the device, 2026-09-22, with a screenshot: pressing **What this
is, and how to install it** opens Help part-way down a numbered list, its first
line cut off mid-sentence, with no heading anywhere on screen to say where the
reader has landed.

Reproduced headlessly at 2.58.1 and MEASURED, on both routes to that
destination — `#welcomeWhat` on the start screen and `#jumpWhat` in the ⓘ.
They behave identically, because they are one function.

- The scroll container `#helpDlg .help-body` starts at y=145.
- `openWhatThisIs` calls `scrollIntoView({block: "start"})` on
  `#helpQuickStart`, which lands its top at y=145. That is correct behaviour:
  the target's top edge IS at the container's top edge.
- `.help-find` — the search box — is `position: sticky; top: 0` with an opaque
  `background: var(--surface)`, and it occupies **y=159 to y=247**.
- The `<summary>Quick start</summary>` occupies **y=146 to y=190**. It is
  therefore entirely behind the search box, along with the first ~57px of the
  list beneath it.

The first text a reader can actually see is item 1 of the Quick start list,
`"Open image(s) (or pick a practice photo)…"`, and on a taller viewport the cut
falls further down, which is why the reported screenshot opens at item 2.

**The focus half was already right and that is what hid this.** The handler
focuses the summary as well as scrolling to it, and its own comment says why:
scrolling alone moves the picture and leaves the keyboard and the screen reader
behind. So a screen reader lands correctly, the tab order is correct, and the
focus ring is even drawn — poking out from behind the search box, which is the
stray rounded outline visible in the report. Every instrument except the eye
says this works.

**It is a class, not a button.** `scroll-padding-top` and `scroll-margin-top`
are declared NOWHERE inside either dialog. `#infoDlg`'s `#infoCueUp` is sticky
at `top: -18px` over a 30px box, and both `#jumpRoadmap` and `#jumpSettings`
land their headings at y=145 to 162 under a cue occupying y=141 to 171.
Rendered and opened: "Settings" arrives greyed and half-faded under the
gradient rather than hidden, so it is the same defect at a tenth of the
severity.

**AND ITS OVERHANG IS NOT THE NUMBER THE CSS LOOKS LIKE.** Pinned, the cue sits
18px above the scrollport over a 30px box and hangs over by 12px. At scrollTop 0
it has not pinned yet: it is still in flow, where `margin-top: -18px` against
the container's own 14px padding puts its bottom **26px** below the scrollport
edge. 12px was derived from the first case, shipped into a build, measured 14px
short, and corrected. The derivation was the defect a second time.

## Looked up

**This is what `scroll-padding-top` exists for, and it is the container's
property rather than the target's.** CSS Scroll Snap Module Level 1 defines
`scroll-padding` as an inset on the scrollport's *optimal viewing region* —
explicitly, per the spec's own wording, for the case where a sticky toolbar
obscures part of the scrollport and content scrolled into view must not land
underneath it. `scroll-margin-*` is the mirror property, set on the target, for
the case where one element wants unusual treatment.

Both are honoured by `Element.scrollIntoView()`, not only by scroll snapping —
which is the part that is easy to miss, because the property's name and its
specification both sit under "Scroll Snap".

So the reference answer is: **put the inset on the scroller, once, not on every
target.** A new section then inherits it by existing, and this repo's entire
gate history is about the things that need remembering.

## Weighed against

`NOTES.md` "## Accessibility standing rule" holds the NEVER-CHURN list, and the
scrolled-AND-focused pattern in `openWhatThisIs` is on it. Nothing here touches
it: focus behaviour is correct and stays exactly as it is. What changes is only
where the scroll stops.

Previous work by `NOTES.md` heading: "## The ⓘ answers what this is (7e)",
which built the route, and the Help dialog's own "A MENU, NOT A SCROLL" comment
at `ir.html:1487`, which is what introduced the sticky filter box that this
lands under. The filter and the jump were built at different times and neither
knew about the other.

## Depends

- touches 046 — 046 is the sweep that presses every control and reports what it
  reached. It cannot see this: a control that opens the right dialog and
  scrolls to the right element passes every reachability test while showing the
  reader the wrong thing. A coverage fix there does not find this, and this
  does not shrink 046's 71.
- distinct-from 012 — 012 is also "a reader cannot get where they need to be",
  but that is a missing ROUTE (no way back out of full view) and this is a
  route that exists, runs, and arrives mis-aimed. Conflating them sends a
  session looking for a button that is already there.

## Options

**Put `scroll-padding-top` on both scroll containers, measured for the one that
varies and declared for the one that does not.** Chosen.

`#helpDlg .help-body` gets it MEASURED at dialog-open time from `.help-find`'s
own rect, because that box grows a line whenever `#helpFilterCount` wraps — a
typed constant there is a number that goes stale silently, and the failure it
causes is this exact defect coming back with nothing going red.

`.dlg-body` gets it DECLARED as **30px** — the cue's own `height`, one number
from one rule, comfortably above the 26px worst case measured above. Measuring
it at runtime is not available: the cue ships `hidden` and is revealed on
scroll, so a rect taken when the dialog opens is all zeros. What is available is
a single existing declaration to track, which is what stops the inset drifting
out of step with the cue — and the first attempt here proved the alternative by
composing three declarations into a number that was wrong.

Two mechanisms for one idea is the part worth defending. They are not two
answers to one question — one element's height is derived from content and the
other's from two constants in the same rule, and pretending otherwise means
either a stale number or a measurement of a hidden element.

## Rejected

**`scroll-margin-top` on each target.** Correct today and wrong the moment
somebody adds an eighteenth section, because it has to be remembered per
element. The scroller knows about its own sticky header; the sections do not.

**Scrolling to the element ABOVE the target instead.** The trick that looks
like it costs nothing. It aims at a sibling that has no reason to stay put, so
it breaks silently when the markup around it changes, and it says nothing in
the source about why that sibling was chosen.

**Making `.help-find` non-sticky.** It solves this and gives up the thing it
was built for: seventeen sections and 4,368 words with the filter always in
reach. The search box is not the defect.

**Setting an explicit `scrollTop` instead of `scrollIntoView`.** It re-derives
what the browser already computes, needs its own arithmetic for the sticky
inset, and drops the reduced-motion behaviour that `scrollIntoView` honours.

**Leaving the ⓘ cue alone because it is only a thin gradient.** That is the
shape of the failure this repository has the most lessons about: fix the site
that was reported, leave the class alive, and meet it again under a different
button. The remedy is one line and the two sites are the same sentence.

## Looked at

Not a photograph — a screen. Rendered through the built app at 2.58.1 on an
1194×834 viewport and OPENED, both routes and both dialogs.

- `#welcomeWhat` and `#jumpWhat` render byte-identically, and match the
  reported screenshot down to the focus ring visible above the search box with
  no heading beneath it.
- `#jumpSettings` renders "Settings" faded under the scroll cue at the top edge
  — legible, degraded, the same cause.

## Rank

**Above 046 and below the mask work already in flight.**

It is reader-facing, it is on the route a first-time reader takes to find out
what the app IS, and the fix is small and fully measured. It outranks 046
because 046 is an instrument gap that no reader can see, and this is a reader
looking at the wrong screen. It does not outrank the mask items above it:
nothing there has to be redone once this lands, so by the dependency test it
does not go to the top, and being reported today does not privilege it.

## Outcome

Shipped in the commit subject *Fixed: Help opened underneath its own search
box*. `clearStickyHeader` measures `.help-find` when Help opens and writes the
container's `scroll-padding-top`; `.dlg-body` carries a declared 30px.

Measured after, the same way it was measured before, on both routes.
`#welcomeWhat` and `#jumpWhat` land with the summary's top at y=306 against a
search box ending at y=305; the first visible text reads "Quick start" rather
than the middle of a numbered list; the summary keeps focus exactly as it did,
so nothing on the NEVER-CHURN list moved. `#jumpSettings` puts its heading at
y=175 against a cue ending at y=171, and renders black rather than half-faded.

**One of the two mechanisms was made to fail before it was trusted, and not on
purpose.** The `.dlg-body` value shipped into a build at 12px, measured 14px
short, and was corrected to 30px. That is the argument for the other container
being measured rather than typed, arriving as evidence rather than as an
opinion.

**What this does NOT fix, and it is the reported button's other half.** The
button is labelled *What this is, and how to install it*. The reader now lands
correctly on Quick start, which is the first half. `#helpInstall` sits **874px
past the bottom of the panel, 1.58 screens down**, and the word "install"
appears nowhere on the landing screen. The section is expanded and reachable;
it is not shown. Straightening the scroll does not make a button that names two
destinations deliver both, and which one it should land on is a question this
record cannot rank on its own.
