# 044 · Pressing Home leaves the editor drawer on screen

## Context

Reported from an iPhone, 2026-09-21, with a screenshot and the diagnostic
report beside it: pressing Home after editing a photograph does not dismiss the
menu, and the start screen arrives looking wrong.

**Both halves are one cause, and the report's own numbers name it.** The
diagnostic says `window 402x812` and `inside a stage of 402x272`. `#welcome` is
`position: absolute` inside that stage at `max-height: 92%`, so the start card
can never be taller than the stage — and the stage was a third of the window
because the editor drawer still had the rest of it. The card therefore clipped
mid-sentence with `#welcomeCue` showing, which is what the screenshot shows
above twelve tab buttons and the Basic section.

Reproduced at the reported metrics before anything was changed: the drawer
keeps 365px at y=447, the stage falls from the cold start's 699px to 334px, and
the card gets 305px of room instead of 641px.

**The mechanism is one line, and it is a line that is right where it lives.**
`goHome` calls `disarmPictureTools()`, which ends in `setGeoMode(null)`, whose
last act is `else if (current) panel.hidden = false` — the line that un-tucks
the drawer when a geometry tool exits. Leaving a photograph ran it every time.

**And the rule it broke was already written down for the other half of the
chrome.** `body:has(#welcome:not([hidden])) :is(#homeBtn, #undoBtn, #redoBtn,
#resetBtn, #origBtn, #histBtn, .bar-sep) { display: none }` has hidden the top
bar's editing controls behind the start card for as long as the card has
existed. The drawer was never added to it. Counted while fixing this: **eight
places raise or lower the start screen, two of them set both elements and six
set only `welcome`.**

## Looked up

**Nothing outside this repository settles it, and saying why is the point.**
This is not a question about a medium, a process or a piece of equipment — the
cause is three lines of this app's own source and the reference behaviour is
the app's own cold start, which has always hidden the drawer because there is
nothing to edit. A search here would be theatre.

**One platform fact does bear on it, and it decided the shape.** A surface
behind an overlay must leave the tab order, not merely stop being visible.
Before this, every control in the drawer was still focusable behind the start
card. The `hidden` attribute removes an element from the tab order and from the
accessibility tree; a rule that only paints it out need not. That is one of the
two reasons the fix carries the attribute rather than a stylesheet rule.

## Built already

- **`setGeoMode` already tucks the drawer away for a geometry tool**, with
  `panel.hidden = true` / `else if (current) panel.hidden = false` and a comment
  saying why — "portrait especially, the drawer otherwise eats the lower half".
  The tuck is not new; only leaving a photograph was missing it.
- **`#app:has(#panel[hidden])` already collapses the grid** so the stage takes
  the window (`src/style.css`, twice — the base rule and the narrow one). It is
  keyed on the ATTRIBUTE, which is why the attribute is what has to move.
- **`masksTabInFront()` already reads `!panel.hidden`** and carries the contract
  that records what it cost to hide the drawer the other way.
- **The Done path (decision 020) and the open path already set both elements**,
  so the invariant existed in the code in two places and had no name.

## Weighed against

**020**, which owns what happens to a photograph left behind the start screen
and is one of the eight sites this now goes through.

**012**, full view, which hides the drawer with CSS and deliberately never with
the attribute — the distinction this record has to respect rather than repeat.

## Depends

- touches 020 — 020 decided what the start screen does with a live photograph
  behind it, and its path is one of the eight this rule now owns. A change to
  either moves the other.
- touches 012 — 012's full view hides the drawer with `display: none` and leaves
  `panel.hidden` false on purpose. This hides it with the attribute on purpose.
  Both are correct and they are not interchangeable, which is exactly why
  `masksTabInFront` exists; a later session reading one will find the other.

## Options

1. **One function owning both elements, called at all eight sites, hiding the
   drawer with the `hidden` attribute.** Chosen.
2. A stylesheet rule beside the one that already hides the top bar:
   `body:has(#welcome:not([hidden])) #panel { display: none }`.
3. `panel.hidden = true` in `goHome`, and nothing else.

## Rejected

- **2 — the stylesheet rule.** It leaves `panel.hidden` FALSE, so
  `#app:has(#panel[hidden])` never fires, the grid keeps the drawer's column and
  the stage does not get the window — the half of the defect that actually
  clipped the card would survive the fix. It also leaves `masksTabInFront()`
  answering yes while the reader is on the start screen. **The app has paid for
  this exact distinction once already**: full view hides the drawer with CSS,
  `skyFixOn` restated the rule as `!panel.hidden`, and an armed hand correction
  went on owning the canvas in the one mode whose whole purpose is showing the
  photograph — the tap that LEFT full view stamped a dab on the reader's
  selection instead.
- **3 — fix `goHome` alone.** Six other sites raise the start screen, three of
  them failure paths reached with a photograph still live behind the card, where
  the same defect would remain. One rule written in several places, some of them
  updated, is the defect class this repository has the most lessons about — and
  it is the class that produced this defect in the first place.

## Rank

**Not ranked: reported and fixed in the same session.** It is a defect with one
cause and one remedy, so it was never a decision — the record exists for the
mechanism and for the rejected route, which is the one a later session would
reach for.

## Looked at

**`NIR_1651.dng`**, the practice frame the walk opens, at 402x812. Both
screenshots were opened rather than read as numbers: before the fix, the start
card clipped at the "Quick look a folder" hint with the drawer's twelve tab
buttons, Explanations, and the Basic section stacked beneath it — the reported
screenshot reproduced exactly. After it, the card carries Back, Open, Quick
look, Develop a whole set, Measure your lens and the practice photographs, with
the ✕ visible in the corner where it had been clipped away, and the photograph
showing at the stage edges behind.

## Outcome

Fixed on the branch the day it was reported. `setStartScreen(up)` in
`src/main.ts` owns `welcome.hidden` and `panel.hidden` together and is called at
all eight sites; `welcome.hidden` is now assigned in exactly one place in the
file.

`tools/start-screen-walk.mjs` is the instrument. It opens `NIR_1651.dng` — the
practice frame already in the repository, so the walk needs nothing that is not
tracked — at the reported 402x812 rather than the 1100px every other walk in the
directory uses — on a wide window the
drawer is a side column, the stage keeps its height and this defect is
invisible. It was made to fail first and did, four ways.

**Two of those four were the instrument, and both are worth the next session's
attention.** It asserted the start card must not be a scroll box, and went red
on a COLD start: 1703px of content in 641px. That is not a defect — the card
carries the tagline, Open, the iCloud note, Quick look, Develop unattended,
Measure your lens and the practice photographs, which is more than a phone
screen holds, and `#welcomeCueUp` and `#welcomeCue` exist to say so. The real
statement is comparative, so the walk now holds the stage height after Home
against the cold start's: 334 of 812 before, 699 against 699 after. And it drove
Exposure to "0.35" — a slider whose range is 0..1000 in whole steps, so the
value clamped to 0, and the walk then reported the reader's edit as LOST on the
round trip. The app was right both times.
