# 077 · The open photo's edits are lost on a reload or a closed tab

## Context

**Found 2026-09-26 and listed as found and not fixed on the status page.**
Edits to the photo that is open in a session were lost if the page reloaded,
the tab was closed, or iPadOS discarded the tab in the background, before the
reader moved to another photo. The durable copy of an edit,
`captureActiveEdit()` in `src/main.ts`, was written only on a switch, on Home
and when a LUT was applied. An edit in progress lived in memory and nowhere
else, so on a tablet that discards background tabs, a long edit of one
photograph was one app switch away from gone.

## Looked up

- **Chrome for Developers, *Page Lifecycle API*.** The page becoming hidden is
  the last event a page can reliably observe; save application state there.
- **MDN, *Document: visibilitychange event*.** It fires with `hidden` when the
  reader switches tabs, closes the tab, minimises the browser or switches app
  on mobile, and `pagehide`, `beforeunload` and `unload` are not reliably
  fired on mobile, notably for a tab closed from the app switcher.
- **What neither can do.** A tab killed outright fires nothing, so the work has
  to be saved as it happens as well.

## Weighed against

- **The verdict race, NOTES "## A verdict pressed as the tab goes away,
  2026-09-14".** A verdict gets a synchronous safety copy before its database
  write; an edit is larger and changes on every slider move, so it is saved on
  a settle rather than on every input.
- **075**, which rebuilds a photo's row from the slot's current edit when a
  refused write is retried; this writes the same slot's edit, so the two agree.

## Depends

- touches 075 — both write a photo's edit into its row; 075's retry reads the
  slot this keeps current.

## Options

1. **Save the open photo's edit when the page is hidden, and a second after each
   edit settles.** Chosen, built 2026-09-28.
   - `visibilitychange` to hidden, with `pagehide` as a second chance, settles
     any gesture in flight and writes the edit at once.
   - Every settled edit, Undo, Redo and Reset schedules the same write a second
     later, so a burst writes once and a killed tab keeps what had settled.
   - It writes the row a switch writes (`editToJson` into `Session.setEdit`), so
     a resume reads it with no change; the in-memory history is untouched.
   - The photo opened on its own is not written: it is ephemeral by design.
2. Write on every input.
3. Save on page hide only.
4. Leave it.

## Rejected

- **2, every input.** A slider drag fires tens of inputs a second, each a
  database write under strict durability; the settle already exists and one
  write per gesture is enough.
- **3, page hide only.** A tab killed outright fires no event, so what the
  reader did since the last switch would still be lost there.
- **4, leave it.** It loses the reader's work on the device the app is built for.

## Rank

**Directly after 071, above 052 (2026-09-28).** Everything from 052 down that
touches the look's sky waits on 069's research, and this destroys the reader's
work; it invalidates nothing above it and nothing below it measures it.
