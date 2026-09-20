# 037 · Full screen shows the mask

## Context

Reported from the device, 2026-09-20: using full-screen view while the Masks
tab is open shows the mask on the full-screen view, with the dotted outline,
which it should not do.

**One condition, and it is located.** `renderMaskOverlay` in `src/main.ts`
decides whether the overlay is live from `overlayOn`: a photograph is open, the
panel is not hidden, the welcome screen is gone, the active tab is `masks`,
`showMaskOutline` is on and a mask is selected. **Full view is not in that
list.** Entering it sets `app.dataset.full = "1"` and calls `draw()`, but
`renderer.maskViz` is still pointing at the selected mask and `maskOverlay` is
still unhidden, so both the coverage tint and the dotted handle outline go with
the photograph into full screen.

**The same function already has the pattern the fix needs.** `maskAdjusting`
makes the tint step aside while a slider is being dragged, on exactly the
reasoning that applies here: the reader is looking at the PHOTOGRAPH and the
overlay is in the way.

Full view exists to look at the picture. An overlay that follows it there
defeats the only thing the mode is for.

## Looked up

**Nothing external applies.** This is one app's own mode interacting with one
app's own overlay, and no outside source knows either. The convention it is
measured against is this app's own: a mode announces itself and offers an
obvious exit, and full view's whole announcement is that everything else has
gone away.

## Weighed against

**012, "A photograph that fills the screen with no way back out"**, is the same
mode and is open for a different failure — the ways INTO full view outnumber
the ways the reader can tell they are in it. This is about what full view
shows rather than how it is left, and the two are separable: neither fix moves
the other's code.

**026, "Masks combine by set operators in a group"**, and anything else that
changes what the overlay draws will inherit whichever answer this gives, which
is the argument for fixing the condition rather than special-casing the
outline.

## Depends

- touches 012 — the same mode. 012 is about getting out of full view and this
  is about what it shows; fixing either does not fix the other, and both read
  the same `app.dataset.full`.
- touches 026 — 026's groups are drawn by the overlay this stands down, so
  whatever it shipped inherits this answer rather than needing its own.

## Options

**Full view stands the overlay down, both halves, through the one condition
that already decides it.** Chosen. `overlayOn` gains the full-view test, so the
coverage tint, the matte and the dotted handle outline all go together and
nothing downstream needs to know about the mode.

And it comes back on leaving, because the state is derived rather than stored:
`renderMaskOverlay` is already called from the enter and leave paths by way of
`draw()`, and the mask selection is untouched throughout — so a reader who
goes to full view to check a frame and comes back finds the editor as they
left it.

## Rejected

**Hiding only the dotted outline.** The tint is the louder of the two and is
the one that changes the photograph's colour. Half the fix would read as the
whole thing having been attempted.

**Turning `showMaskOutline` off on entering full view and back on leaving.** It
writes to the reader's own toggle to achieve a display effect, so a reader who
had deliberately turned the overlay off before entering would find it on when
they came back. Derived state, never stored state.

**Leaving the Masks tab automatically when full view opens.** It changes what
the reader was doing in order to change what they can see, and it would lose
the selected mask.

## Rank

**Near the top of the defects.** It is one condition in a function that already
carries the pattern, it is met by anyone who checks a mask at full size, and
nothing above it depends on it — so it is ranked here for being cheap and
finished rather than for being urgent.
