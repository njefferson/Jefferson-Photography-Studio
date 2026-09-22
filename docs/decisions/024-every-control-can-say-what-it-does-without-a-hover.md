# 024 · Every control can say what it does, and a finger can reach the saying

## Context

Asked 2026-09-19 from the PC, in the same sitting as the report that the IR
lens card's top slider was called "Hot-spot" and did not say what it did:
there should eventually be something clickable or hoverable, where it makes
sense in the app, that says what each tool does.

What the app has today. Labels carry the act where they can — that rename is
one of them. Under most controls sits a permanent `<small class="note">`:
measured 2026-09-19, **103 notes against 76 labelled sliders**, so the panel
already explains far more than it hides. Longer-form explanations live in the
ⓘ panel and in Help, which is where the app puts anything too long to sit
beside a control. What is missing is a RULE: which controls get a sentence,
where it goes, and how a reader asks for one when the sentence is not on
screen. Today that is decided per control, by whoever wrote it.

Intended outcome: one way of reaching a control's explanation that works
with a finger, that does not push the controls apart when it is not wanted,
and a list of which controls still have nothing to say for themselves.

## Looked up

**The field separates two things, and the difference is exactly this app's
problem.** A TOOLTIP is hover-or-focus, describes its trigger through
`aria-describedby`, carries `role="tooltip"`, and must dismiss on Escape. A
TOGGLETIP is a BUTTON the reader presses, which reveals its text into a live
region so it is announced — and it is the only one of the two a finger can
reach (Inclusive Components, "Tooltips & Toggletips"; UXPin's tooltip
practice; Elastic's EUI tooltip documentation). Native `title` tooltips are
unstyled, unreachable on touch, and inconsistent across screen readers.

**This repository already measured that half on its own device.**
`tools/control-check.mjs` carries the TOOLTIP RULE: a `title` is a hover,
there is no hover on a tablet, so anything a title says and the visible label
does not is a sentence this app's reader will never see. It was written after
a "Share" button whose title explained what its one wrong word did not, and
it measured 43 of 268 controls carrying a title at the time.

**Progressive disclosure is the named pattern** for supplementary context
that would clutter the interface if always visible — which is the argument
for a toggletip, and equally the argument for leaving a short note visible
when it is short.

## Built already

Measured 2026-09-21, and the count matters: **almost all of this exists, and
what is missing is a rule rather than a mechanism.**

- **`tools/control-check.mjs` is the inventory and the gate**, and it already
  carries the half of the rule that is decided: a `title` is a hover, there is
  no hover on a tablet, so anything a title says that the visible label does
  not is a sentence this reader will never see. It prints every control with
  its label and the titles it found, and answers for **67 controls** today.
  Whatever this item settles about WHERE an explanation lives, that gate is
  where it is held — and its reverse direction (a control with nothing to say
  for itself anywhere) is the piece it does not have.
- **The permanent note beside a control is the app's existing answer**, and it
  is the majority answer: **112 `class="note"` elements against 71 labelled
  sliders** in `ir.html`. This item must not replace them. Progressive
  disclosure is for what would clutter; a short sentence that fits is better
  visible, and most of them are.
- **The live region a toggletip needs already exists on every surface.**
  `ir.html` declares at least a dozen — `#hint`, `#fileKind`, `#lookState`,
  `#liftState`, `#sessionMeta`, `#cropLevelNote`, `#exportStripText` and
  others — all `role="status" aria-live="polite"`. A toggletip reveals into a
  live region so it is announced rather than merely drawn; the pattern is
  already here and does not have to be invented.
- **`.inline-btn` is the in-sentence button pattern**, used by the Help
  install block and, since 2026-09-21, by the start screen's route to
  orientation. A toggletip trigger is that shape.
- **`#infoDlg` and `#helpDlg` are where the long form lives**, with
  `#helpQuickStart` and `#helpInstall` now addressable and opened by one
  function from two places. Anything too long for beside a control goes there
  and is LINKED, not copied.
- **`tools/a11y-walk.mjs` sweeps every control on every surface in both themes
  and both shapes**, so a new trigger is measured for hit area, name and
  contrast the moment it exists — and its section 6 already asserts the
  "moved, never copied" rule for orientation, which is the same rule one
  explanation surface below.

What genuinely does not exist: a decision about WHICH controls owe a sentence,
one trigger shape used everywhere rather than per-control judgement, and the
gate's reverse direction — the list of controls that say nothing for themselves
in any of the three places.

## Weighed against

- **003, the photo fills the app and the menus float over it** — a panel that
  floats over the photograph has less room for permanent notes, so whichever
  way that goes changes how much of this has to be on demand. This item
  should not invent a second explanation surface before 003 decides where
  the first one lives.
- **The ⓘ panel and Help** — they already hold the long explanations, and the
  hot-spot passage in Help is an example. This item is about the sentence
  that belongs BESIDE a control, not the essay about the feature.
- **`tools/control-check.mjs`** — it prints every control and its label and
  refuses a `title` that carries what the label lacks. It is the gate this
  item extends: a rule about where explanations live is a rule that gate can
  hold, both ways.
- **The rename shipped the same day** — the first answer to "this control
  does not say what it does" is a better label. This item is for what is left
  after the label is as good as it can be.

## Depends

- touches 003 — a panel floating over the photograph has less room for
  permanent notes, so which way 003 goes changes how much of this has to be on
  demand. This item must not invent a SECOND explanation surface before 003
  decides where the first one lives.

## Options

1. **A toggletip per control that needs one, with the note as its content,
   and one live region for the app.** Chosen shape. A small button beside the
   label ("what this does"), 44 px, pressed to reveal; the text is the same
   sentence a note would carry, so nothing is written twice; one
   `role="status"` region announces it, the way the level note and the file
   kind already do. A control whose note is short enough to live on screen
   keeps it visible — the toggletip is for the ones where the sentence would
   push the panel apart. `control-check` gains the other direction: a control
   with neither a note nor a toggletip is named in the inventory.
2. A `title` on every control. Rejected below.
3. Move every note into Help. Rejected below.
4. Do nothing and keep writing notes per control by hand.

## Rejected

- **2, a `title`** — the app's own gate forbids it for exactly this use, and
  the measurement behind that gate is on this owner's device.
- **3, everything into Help** — a control's own sentence read three screens
  away is not that control's sentence; Help is where the feature's essay
  belongs, and it already has one.
- **4, per-control by hand** — it is what produced a card whose top slider
  named the defect and whose note explained it two lines above, and it cannot
  answer "which controls have nothing to say for themselves" at all.

## Rank

Below 019, 018 and 023, which are measured defects with numbers attached, and
below 003, which decides how much room a panel has for permanent text and so
changes this item's shape. Above the unscoped design items.

## Outcome

**Shipped in 2.58 and deployed**, commit `4ffb0e1`. The chosen option survived
whole: a toggletip rather than a tooltip, because there is no hover on a tablet
and a `title` is a sentence this app's reader would never see. Eight controls
carry it — the Tone tab's six points and the two lens Strength sliders — chosen
because they are the ones that say nothing for themselves anywhere else.

`src/toggletip.ts` wires every `button[data-tip]`, sets `aria-controls` and
`aria-expanded`, and announces through one `#tipLive` region. Two details worth
keeping: the trigger's accessible name is built from the control's own label, so
renaming a slider renames every mention of it and nothing is written twice; and
the state is carried in the WORDS — "What this does" becomes "Hide this" — so it
never depends on noticing a marker's rotation.

**The load-bearing half is why most controls did NOT get one.** The 112
permanent notes beside other controls are the app's majority answer and they did
not move. A short sentence that fits on screen is better visible than hidden
behind a press; this is only for the controls where the sentence would push the
panel apart.

It touches no pixels — no pipeline, no shader, no decode.

### What turned out wrong

**The gate this work extends runs nowhere.** `tools/control-check.mjs` gained
189 lines here, including the count reporting the other direction — how many
labelled controls still say nothing for themselves in any of the three places.
Nothing invokes it: it is in no workflow, it is not in `.branch-guard`'s `also=`
list, and `walk-all.mjs` globs `*-walk.mjs`, which its name does not match. It
needs a browser, so it cannot join the commit chain; the remedy is a rename so
the sweep picks it up.

Meanwhile four source comments and this record describe it as a gate that
refuses things. A gate asserted in comments and invoked by nothing is the shape
this family has the most lessons about, and it was introduced by the commit that
extended it.

**And the bookkeeping did not land with the code.** This item stayed `- [ ]` at
rank 6 through its own release, so the ⓘ dialog and the public notes page
offered it to readers as still to come while they were running it. It was found
by an audit that compared every open roadmap item against `main`, not by any
gate — nothing in the chain asks whether an open item's work has landed.
