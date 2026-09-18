# 020 · Done leaves the last photograph drawn behind the start screen

## Context

Reported from the tablet on 2026-09-18, on staging 2.50.10: ending a session
with Done clears the session, the start screen comes up — and the last
photograph edited stays drawn behind it, dimmed by the menu, with no way to
return to it and no way to remove it short of opening a new image or session.
What the code does (`endSession`, `src/main.ts`): it resets the session state
and frees the storage, sets the open photograph to none, hides the panel,
shows the welcome and the hint, hides the histogram and the return controls —
and never clears the stage. The renderer keeps the last frame it drew, so the
picture is an orphan: the app no longer knows it is there, and the reader can
see it. The Home button, by contrast, PARKS a session on purpose and offers
"Back to your session"; Done is the destructive one, and its toast says the
photos were cleared from this device while one of them is still on screen.

## Looked up

Nothing outside this repository bears on it: it is a state defect in this
app's own teardown, not a question about infrared, the file formats or the
platform. The relevant reference is the app's own design record for Home
versus Done (NOTES, "Home button — a non-destructive way back"): Home keeps
the photograph and says so; Done ends it and must leave nothing behind.

## Weighed against

- **012, a photograph that fills the screen with no way back out** — the same
  family, a state the reader cannot leave, but 012 has not been reproduced
  and this one has a known cause in one function.
- **The session strip and the lone photo** (NOTES, "Photo sessions"): a single
  opened photograph is a session of one with the id "lone"; Done on it goes
  through the same teardown and shows the same orphan.
- **The verdict flow** ("A verdict lets the app put the photo down"): Pick and
  Reject move on to the next photograph and never leave the stage empty, so
  the empty-stage case is reached only through Done, which is why it was not
  seen by the walks that press verdicts.

## Options

1. **Done clears the stage as it frees the storage** — the renderer is cleared
   and the view hidden in the same teardown that nulls the photograph, so the
   start screen stands on an empty stage, exactly as it does on first visit.
   One change in `endSession`, and the journey walk gains a check that presses
   Done and asserts the stage is empty (the canvas hash of a cleared stage,
   made to fail first against the current build).
2. Done keeps the last photograph open as a lone photo with the return
   control, so the reader can go back to it.
3. Leave the teardown as it is and add a control that clears the stage.

## Rejected

- **2** — it changes what Done means. Done's promise, in its own confirmation
  and its own toast, is that the session's edits are cleared from this
  device; keeping one open contradicts the sentence the reader just read.
  Keeping a photograph is what Home is for.
- **3** — a control whose only job is to undo a state the app created is the
  defect with a button on it.

## Rank

Second, directly under 019: a certain fix with a known cause in one function,
on a state the reader cannot leave, which is the family 012 belongs to and
this one reproduces on every session ended.
