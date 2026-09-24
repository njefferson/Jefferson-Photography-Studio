# 060 · The top bar wraps, and the start card has become a noticeboard

## Context

Reported from the device, 2026-09-24, with a screenshot of the editor on a
landscape iPad. The top bar has wrapped to two rows. The left cluster sits at
mid-height, a band of empty bar runs across the middle, and the controls on
the right have no evident order. The start card was reported the same morning
as having turned into a noticeboard: the paragraph about the Files picker
explains Open but sits under "What this is", three of the top bar's buttons
are repeated, and every destination that needs no photograph (Quick look,
Develop unattended, Measure a lens, Manage your LUTs) is its own button of
equal weight.

Measured in Chromium the same day at iPad and phone sizes, with a practice RAW
open. Safari's font widths are not verified, so the numbers are close rather
than exact.

- **The bar was designed as one 56px row** (`src/style.css`, "Top bar: 56px").
  Its 44px buttons are justified by that height ("The bar is 56px, so the
  honest box fits").
- **The right-hand group needs about 1020px.** Undo 72, Redo 71, Reset 60,
  Hold: Before 100, Histogram 90, Full view 78, Help 54, Develop unattended
  145, Quick look 138, Open 131, with 8px between them. It gets W − 458: 736 at
  1194 wide, 722 at 1180, 376 at 834 and 362 at 820.
- **In portrait at 834 the bar is four rows**, and the photograph gets 14% of
  the screen. Part of that is the 352px side panel, which is 003's question
  about the drawer in portrait. The rest is the bar.
- **On the phone** the actions scroll sideways in a 358px row, and the Open
  label wraps to two lines inside a button 58px tall.
- **Icons would not fix it.** Eleven 44px icons with their gaps are 564px,
  which is still more than 376. Shorter labels do not reach it either. The
  bar wraps because it carries three scopes of action at once: this photograph
  (Undo, Redo, Reset, Hold: Before, Histogram, Full view), the session or the
  library (Develop unattended, Quick look, Open), and the app (Help).
- **The start card at 1180x820, under iPad emulation, shows no practice
  photograph above its fold.** The short-screen rule in `src/style.css`
  exists "so the practice grid peeks above the fold instead of hiding entirely
  below it", and it no longer does.
- **Two smaller defects found on the way.** A pressed Histogram is drawn
  exactly like the primary Open, with the accent fill at weight 600 in both,
  so the bar shows two prominent buttons. And Full view shows on the start
  screen and does nothing there, because the bar's start-screen switch is a
  stylesheet rule that was never told about it.
- **The instrument is in the repo and fails today.** `tools/bar-fit-walk.mjs`
  holds the bar to one row at 1194x834 and 834x1194, holds the phone's actions
  to one row that does not scroll, and requires the first practice photograph
  to show whole on the iPad start card. Against the build of 2026-09-24 it
  fails all four: three rows at 1194x834, five at 834x1194 with the
  photograph at 14%, the phone's row scrolling sideways, and 0 of the first
  practice photograph's 150px on screen.

## Looked up

- **Apple's Human Interface Guidelines, toolbars** (developer.apple.com, read
  2026-09-24):
  - at most three groups: a leading edge for the way back and the title, a
    centre for common controls, and a trailing edge for what must stay
    visible;
  - "define which items move to the overflow menu as the toolbar becomes
    narrower".
  - The guidelines never say "do not wrap". That rule is inferred from the
    only narrow-width behaviour they describe, which is overflow. They also
    say to create a More menu "only if you really need it".
- **Apple's HIG, undo and redo:** buttons for them go in the toolbar with the
  standard symbols, alongside the system gestures, not in place of them.
- **Lightroom for iPad** (Adobe's workspace overview): Back, Info, Versions
  (which holds undo and redo), Tools, Share, Cloud, More. Reset sits "at the
  end of the adjustment menu" and on keyboard shortcuts, not beside Undo.
  Before/after is a press-and-hold.
- **Photoshop on iPad's header bar:** Home, file name, zoom, Undo, Redo, cloud
  status, Share, Send to, Help, settings.
- **Snapseed, Darkroom and Pixelmator Photo:** before/after is press-and-hold
  on the photograph. Darkroom puts copy, paste and reset in a "•••" menu.
  These came from search excerpts; their own pages were blocked by this
  session's network.
- **Where the convention does not carry over,** checked against the code:
  - Gesture undo cannot replace the buttons: a two-finger touch is already
    pinch zoom, Cmd-Z needs a keyboard, and nothing in the app handles the
    system's three-finger undo.
  - There is no editor Done to promote. The only Done ends the session and
    frees its storage (020).
  - A web page cannot open straight onto the Photos library, and iPad Safari
    cannot re-read a picked file after a reload (039), so the start card
    cannot simply become the library.
  - Hold: Before already works as press-and-hold, on the button and by
    holding the photograph for 400ms. The button stays as the signpost for a
    gesture nothing else advertises, which was the 2026-09-16 direction.

## Weighed against

- **003, the photograph fills the app and menus float over it.** It owns the
  drawer, and it names "what the start screen does" and "drawer behaviour in
  portrait" as taste questions not to guess. This record moves no control over
  the photograph except in candidate B, and there only into a group that
  already floats.
- **012, the full view.** Its Fit button is the escape, and candidate B puts
  two more buttons beside it.
- **053, the session strip on a phone.** Same screen, different element. It
  is kept separate so that neither is closed by the other.
- **024, the explanation surface.** It rejects adding a second explanation
  surface before 003 decides where the first one lives, which rules out a hint
  line per button on the card.
- **044, one rule in one place.** The bar's start-screen switch is a
  stylesheet rule, the shape 044 rejects. `setStartScreen` is where 044 says
  it belongs.
- **059, the LUT manager.** It added one of the start card's buttons, and its
  Rejected options (a note instead of a fix, un-gating the whole panel,
  duplicating the markup) still hold for wherever that door moves.
- **046, the control sweep.** Controls moved into a new menu must be reached
  by the sweep, not declared unreachable.
- NOTES.md, 2026-09-09: Quick look joined the bar because it was reachable
  only from the start screen. Taking it out of the bar's visible row has to
  keep it reachable from the editor.

## Depends

- touches 003 — the drawer and the start screen are its named taste questions; this record does not answer them.
- touches 012 — candidate B puts Histogram and Full view beside 012's Fit escape.
- touches 053 — same phone screen; the bar's row and the strip compete for its height.
- touches 024 — no hint line per card button before 024's surface is decided.
- touches 044 — the start-screen switch moves out of the stylesheet into `setStartScreen`.
- touches 059 — the LUT manager's door on the start card moves with the card.
- touches 046 — a new menu's controls must be swept, not excused.
- touches 020 — Done ends the session, so it is not an editor commit to promote.
- touches 039 — no silent resume on launch; Resume moves up instead.
- touches 042 — candidate B puts more controls over the photograph, where mask handles are drawn; any "editing this mask" indicator stays out of the bar, which has no room for it.

## Options

**Only what acts on this photograph stays in the bar's visible row. Undo,
Redo and Hold: Before stay there at every width, and Develop unattended,
Quick look and Open leave it. Which layout carries the rest is shown as
pictures and chosen from them, not decided here.** Chosen. Every candidate
below shares this, and it is the part the measurement settles. The bar's
start-screen switch moves into `setStartScreen`, and Full view joins the
controls that hide there. The `#file` input stays, because 48 calls in 39
walks drive it.

- **A, a photo bar and a More sheet.** The bar is Undo, Redo, Hold: Before and
  "⋯ More", about 339px. More is a new `<dialog>`, a bottom sheet on the
  phone, in three groups: this photo (Reset, Histogram with its state in
  words, Full view), photos (Open, Quick look, Develop unattended) and the app
  (Help). The start card mirrors those groups: Back or Resume first, then Open
  with the Files note beside it, one line of what this is, a two-by-two grid
  of the four no-photo tools with no hint lines, and the practice photos above
  the fold. At 1100px and wider, Histogram and Full view can come back into
  the bar.
- **B, nothing new.** Histogram and Full view join the Fit group that already
  floats over the photograph. Help is reached through ⓘ, which already links
  to it. The session actions live on the start card only. The bar is Undo,
  Redo, Reset and Hold: Before. The floating group grows by about 88px, which
  is 003's question about floating menus eating taps.
- **C, A's bar with a smaller More, and the start card becomes the library.**
  More holds only Reset, Histogram, Full view and Help. The card leads with
  Back or Resume, then a grid whose first tile is "+ Open" followed by the
  practice photos, then a row of the four tools, with what this is at the
  bottom. This answers 003's "what the start screen does" most strongly.

## Rejected

**1, icons in place of words.** Eleven 44px icons are 564px, more than the 376
the bar gets in portrait. It would also undo the 2026-09-16 change that made
each of these buttons say its job in words: an icon needs a hover to explain
itself, and a touch screen has no hover.

**2, squeezing the padding and gaps, or extending the phone's sideways
scroll.** The same move 012 rejects ("adjust the CSS until it looks right")
and 053 rejects ("a smaller permanent tax"). 1020px does not fit into 736,
and the practice grid's own short-screen rule is an earlier tweak of this
kind that has already stopped working.

**3, a button that expands or collapses the bar.** 020's rule: a control
whose only job is to undo a state the app created is the defect with a button
on it.

**4, one pass that redesigns the bar, the card and the drawer together.** 003
rejects a single app-wide layout pass because it decides several taste
questions at once, in code, before any of them has been seen on a real
tablet. The drawer stays 003's, one control at a time.

**5, a popover or `<details>` for the More menu.** `tools/surfaces.mjs` sweeps
only `<dialog>` elements, so any other kind of menu would ship with no
accessibility or hit-area check.

**6, restoring the last session silently on launch.** 039 rejects persisting
every lone open automatically. Resume moves to the top of the card instead.

**7, making Done the primary action.** Done ends the session and frees its
storage (020). Promoting it would dress a destructive action as the commit.

## Rank

Sixth, directly above 012. Candidate B changes the ground 012's escape stands
on, and the LUT picker's own door on the start card has to wait for where
this puts the card's tools, so both are better done after this is chosen.
Of the items above it, only 042 shares ground, and only through candidate B and the drawer, which stays 003's; 034, 032, 027 and 025 touch neither the bar nor the card. The
first product step, taking the three session buttons out of the bar and
moving the start-screen switch into `setStartScreen`, is small once a layout
is picked. The picking is the owner's, from rendered pictures.
