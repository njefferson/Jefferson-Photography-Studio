# 012 · A photograph that fills the screen with no way back out

## Context

Reported from the iPad, 2026-09-17: a photograph in the full view appeared zoomed
in, and neither zooming out nor scrolling would bring the rest of it back. The
report is careful — "I believe one was zoomed in" — so the state itself is not yet
established, and that uncertainty is part of what this record has to carry.

Two distinct failures are described and they are not the same defect. One is that
the picture did not fit both dimensions of the screen. The other is that there was
no way out of it, and that one is the serious half: a reader who cannot get back
to the whole photograph has lost the photograph, and the app offers no clue that
it has happened.

What the app does today, read rather than assumed. `#view` is absolutely
positioned inside the stage with `inset: 12px`, `margin: auto` and
`max-width`/`max-height` — contain behaviour, and its own comment says it was
written so landscape and rotated portrait both fit. `applySize` in `src/gl.ts`
sets the canvas's INTRINSIC size to the image (times the crop), so fit is decided
entirely in CSS. Zoom is a CSS transform on the canvas: `zoom` is clamped to
`[1, 8]` in `zoomAt`, so 1 is fit and there is no zooming out past it; `panX/panY`
are clamped to the zoomed overflow plus 60px. There is a `#zoomFit` button.

So on the code as written the reported state should be unreachable, which means
something measured is wrong — and the intended outcome is to find which, not to
adjust the CSS until the screenshot looks right.

## Looked up

Nothing external yet, and saying so is not a dismissal. Fit-to-viewport and
pinch-zoom are solved problems, but the question here is not how to implement
them — the app implements them and the implementation reads correctly. The
question is which of several app states produced a picture that would not come
back, and no article answers that.

**The trigger for outside reading is defined in advance**, so it is not missed
later: if the cause turns out to be Safari's visual viewport — a pinch on the PAGE
rather than the canvas, the keyboard or the URL bar changing the visual viewport,
or `touch-action: none` interacting with iOS gesture handling — then how iOS
Safari reports visual versus layout viewport is documented behaviour and must be
read, not derived. That is the one candidate on this list that is about the
platform rather than about this app.

**EVIDENCE FROM THE DEVICE, 2026-09-17, and it narrows this sharply.** A screen
photograph taken right after keeping a quick look's pictures into a session shows
the photograph occupying a shallow horizontal band at the top of the screen with
its top and bottom CUT OFF rather than scaled down, the session strip below it,
and the zoom control reading **100% with a Fit button beside it**.

Two branches die on that reading. Leftover view zoom is out — 100% is fit, and
the zoom transform is not what is cropping it. Page zoom is unlikely for the same
reason, though only the report can rule it out. What is left is the canvas being
drawn larger than the box it is meant to fit inside, and the timing points at
which box: the strip had just appeared and was still filling, which is exactly
when `--session-h` is being written and `#view`'s `max-height` is measured against
it. **That is what the new `Canvas` line in the report says in words** — "DRAWN
LARGER THAN THE STAGE, so part of it is off the edge" — so the next occurrence is
one paste away from being settled.

It is still not settled, and the temptation to fix it from here is the thing this
record exists to resist: a screen photograph cannot distinguish a stale
`--session-h`, a strip whose height is read before it has laid out, and a stage
whose own box is wrong. The report can.

## Weighed against

Overlaps **003, "Big image: the photo fills the app, menus float over it"**, and
**004, full-bleed crop** — both are about how much of the screen the photograph
occupies, and a change to the stage's insets or to what the strip reserves lands
in the same rules this item is about. Anything done here should be done knowing
003 may move those rules wholesale.

Previous work on the same surface, by `NOTES.md` heading: "## A quarter-turn that
stays turned" (rotation and `applySize`), and the cropping inset rules in
`src/style.css`, which were written after a handle could not be grabbed in the
physical screen corner on iOS — the same class of report, from the same device,
and it was real.

## Options

**Reproduce it first, with an instrument, and only then fix the thing the
instrument names.** Chosen. The candidates are all cheap to discriminate and all
invisible from a screenshot: view zoom left over from a previous photograph and
not reset on the next open; `--session-h` reporting a strip height that leaves the
canvas measured against a box larger than what is visible; the crop making the
canvas's intrinsic aspect differ from what the CSS is fitting; or the page's own
visual viewport being zoomed rather than the canvas. §7j says a session that needs
such a number builds the measurement into the app rather than asking the owner to
describe a screen, and the diagnostic already exists — what it does not yet report
is the view's own state.

**Make the escape unconditional, regardless of cause.** Also chosen, and it does
not wait for the diagnosis, because it is the half that matters: whatever put the
reader in that state, there has to be a way out that cannot itself be in the
wrong state. Fit is already a button; what is missing is that it be reachable and
obvious at the moment it is needed rather than only in the zoom control.

## Rejected

**Adjust the CSS until it looks right.** The rules already say contain and the
comment already names the case they were written for. Changing them without
knowing which state produced the report would be tuning against one screenshot,
and 003 may replace them entirely.

**Ask for another screenshot.** Three states look identical in a picture of a
screen — the canvas zoomed, the page zoomed, the canvas sized against the wrong
box — and none of them can be told apart by looking. The diagnostic report is the
right instrument and the app already has one; it just does not carry the view's
state yet.

**Assume it is the leftover-zoom case because it is the easiest to fix.** It is
the leading candidate and it is still a guess. This repository has a standing
record of exactly that move costing a day.

## Rank

**First.** A reader who cannot get back to the whole photograph cannot use the
app for the thing the app is for, and unlike everything else on this list it was
hit on the real device rather than found in a test. It also has the cheapest
first step — an instrument, not a refactor. Placed above the splotchy Aerochrome
item because that one degrades a rendering while this one removes access to it,
and above the quick-look item because that one is bounded by memory rather than
by being stuck.
