# 064 · A look cannot be taken off

## Context

Found by reading, 2026-09-24, while the colour-file browser (062) was being
researched. Every step below was read in `src/main.ts` rather than inferred.

**No control on the photograph takes a look off.** `pressLook` applies a look
on the first press. A second press of the same look flips its red and blue
swap on the four looks that carry `toggleSwap` (Pink IR, Red, Goldie, Natural
IR), and on the other four (Aerochrome, B&W IR, Sepia IR, HIE B&W) it applies
the same look again. There is no None among the look buttons.

**Reset does not take it off either, when the photograph opened wearing it.**
A photograph that opens fresh takes the session look (`activeLook =
sessionLook`, then `applyLook`), and the Reset target, `baseline`, is taken at
the end of that same function, after the look is on. So Reset returns to the
look. Undo walks back one press at a time and stops at the same place.

**And the look follows every photograph after it.** `pressLook` sets
`sessionLook` on every press, and nothing on the editor clears it; every
photograph opened afterwards wears it. The one place that does clear it is
Settings, Default look, None, which writes the standing preference for new
sets and says it takes effect on the next photograph opened, not on the one on
screen. So getting a photograph without a look means finding a setting
described as something else, and the photograph already open keeps the look.

## Looked up

**The convention is that None is an item among the looks, not a control
somewhere else.** From 062's research, gathered the same day, with its sources:
Apple Photos puts Original first in the filter strip; Lightroom mobile shows
the original while the before icon is held; in Capture One, clicking the active
style clears it. Sources: support.apple.com's iPad guide to editing photos,
helpx.adobe.com on Lightroom mobile adjustments, and support.captureone.com on
removing an applied style, all read as search summaries because the pages were
blocked or refused (062 lists the hosts).

**The second-press gesture is already taken here.** On the four swap looks it
flips the swap, shown under each button as a two-part norm / R⇄B toggle, so
the Capture One idiom cannot be used without taking that away.

## Weighed against

- **062, the colour-file browser**, puts None first among the colour files. The
  same idiom on the look buttons makes the two behave alike, and if 062's chosen
  layout merges the two rows the work is one piece.
- **058's rejected option 4**: pressing a look must not clear the colour file
  the reader layered on it. Taking a look off must not clear one either.
- **NOTES, the session look**: the look following you through a set is
  deliberate ("chosen here, and it follows you through the set"), so the remedy
  keeps that and gives it an exit rather than removing it.

## Depends

- touches 062 — None first is one idiom across looks and colour files, and a merged row makes them one piece of work.
- touches 058 — taking a look off must leave a colour file where it is, as pressing one does.

## Options

**A None button first among the looks.** Chosen.

- Pressing it takes the look off the photograph on screen as one undo step,
  back to the photograph's own balance and exposure with no creative grade,
  and sets the session look to none, so the next photographs open without one.
- It is pressed, with its state in words, when no look is on, the same as the
  other look buttons.
- Reset keeps its meaning, the photograph as it opened, and the None button is
  the route off a look the photograph opened wearing.
- A colour file on the photograph stays, as 058 requires.
- Settings, Default look is unchanged: it is the preference for new sets, and
  it stops being the only way out.

## Rejected

- **A second press on the active look turns it off**: taken on four looks by the swap toggle, which is shipped and labelled on each button; giving four looks one meaning for a second press and four another is worse than either.
- **Reset clears the session look**: Reset means the photograph as it opened, and making it also change what the next photograph opens with folds two questions into one button.
- **Point readers at Settings, Default look, None**: that control is described as a preference for new sets, it leaves the photograph on screen as it is, and a way out that has to be found under another name is the defect.
- **Stop the look following you through the set**: the carry-over is deliberate and saves a press per photograph; the defect is the missing exit, not the carry-over.

## Rank

**Directly after 062.** The dependency is real in one direction: 062's layout
choice decides whether this is its own small change or part of that one, and
placing it next means it is either absorbed into 062 or built straight after it
with the same idiom. Nothing above 062 reads the session look, so nothing above
has to be redone. It sits ahead of 012 because 012 is still a diagnosis while
this is a known remedy, and because a look you cannot take off changes every
photograph opened after it.
