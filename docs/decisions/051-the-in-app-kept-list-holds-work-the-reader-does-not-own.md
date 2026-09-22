# 051 · The in-app kept list holds work the reader does not own

## Context

039 shipped a list of photographs kept INSIDE the app — rows in an IndexedDB
database (`src/keepstore.ts`), reached from `#keptOpen`, restored by
`openKeptPhoto`. 043 then shipped the other half: the same photograph written
out as a FILE the reader holds, saved through the share sheet and picked again
later. Reported from the device, and correctly, that the two Keep buttons were
two controls for one idea; the file is the one that matters, and the in-app
writer was removed in 043.

**What is left is a store nothing can write to any more.** The list still opens
and still restores, so nothing already kept is stranded — but there is no route
INTO it, which makes it a museum of whatever a reader happened to keep before
the change. That is not a state to leave standing: it is a feature whose whole
promise, that you can come back to your work, now depends on the reader having
used it before a particular release.

**Two things make this urgent rather than tidy.**

The store is the storage the reader does not own. iOS can reclaim it without
telling the app, it cannot be moved to another device and it cannot be backed
up. `NOTES.md` "## The measurements lived in storage the app does not own" is
this failure once already, and 043's whole argument is that work must not live
only there.

And **two walks are permanently red because of it.** `tools/kept-walk.mjs`
pressed `#keepPhoto` to create a row, and `tools/a11y-walk.mjs` used the same
button to reach the kept list for its audit. Nothing in the app can create a
kept row any more, so neither can arm itself; both now fail loudly naming 043.
`CLAUDE.md` requires the accessibility walk before any UI release, so **the kept
list is unmeasured and the walk cannot pass until this is settled.**

**The store shipped to production**, not just staging: `src/keepstore.ts` is on
`main`. So this cannot be decided from one device's contents. A reader may hold
kept photographs that exist nowhere else.

## Looked up

**The field's convention is about schema, not about retirement, and saying so is
the finding.** Every source on removing or replacing IndexedDB storage — MDN's
`IndexedDB_API/Using_IndexedDB`, the W3C's Indexed Database API 3.0, Dexie's
"Migrating existing DB to Dexie" — is about `onupgradeneeded`: bump the version,
read which version the reader is coming from, and transform what is there.
Dexie's guidance and the community write-ups agree on one product rule inside
that machinery: **existing data is migrated automatically and idempotently, so a
deployed reader keeps their state across the upgrade.** None of them addresses
deleting a store whose contents are irreplaceable user work, because a schema
migration never destroys it — it moves it.

That is the whole transferable answer: *the data survives the change, without
being asked to.* A retirement that deletes rows is not a migration, it is a
data loss with a version number on it.

**What has no external answer** is where the data should go here, because the
destination is a file in a share sheet rather than another table — and a share
sheet needs a press. That part is decided from this repo's own rules: Doctrine
§14 bans silent mutation of a reader's work, and `CLAUDE.md`'s taste line says
every failure explains itself and offers a way forward.

Sources: MDN `IndexedDB_API/Using_IndexedDB`; W3C Indexed Database API 3.0;
Dexie.js "Migrating existing DB to Dexie".

## Built already

- **`src/keepstore.ts` is the whole store, and every door this needs is already
  exported.** `listKept` gives the list a row's meta, `getKept` its record with
  the edit, `getKeptBytes` the original's own bytes, `deleteKept` the forget.
  Writing a kept row out as a file needs no new read path: it is those three
  joined to a writer that already exists.
- **`keepEdit`, `writeKeepFile` and `keepCurrentAsFile` are that writer**
  (`src/main.ts`, `src/keepfile.ts`). They take an original's bytes, an edit and
  a name and hand back a Blob for the share sheet. A kept ROW carries exactly
  those three things, so the migration is one function calling another rather
  than a second implementation of the format — which is the trap this section
  exists to name, since a second writer would drift from the first.
- **`showLoneWithEdit` in `src/main.ts` is the one route back into a photograph
  from a stored edit**, already serving both the kept store and a picked keep
  file. Nothing about opening a kept row changes while the list still exists.
- **The list's surface is built and named**: `#keptOpen` in the app's chrome,
  `#keptDlg` with `#keptList`, `#keptHeld` and `#keptOwed` inside it, and
  `.kept-row` per row with its own Open, rename and forget controls. This adds a
  "Save as a file" control to a row that already has three; it does not build a
  screen.
- **`tools/keep-walk.mjs` already proves the destination end to end** — a real
  press, a real download, the photograph found inside byte for byte, and the
  file picked back with its painted mask selecting the same pixels. What a
  migration owes on top of that is only that a row's bytes and edit reach it.
- **`keepAPhoto` in `tools/a11y-walk.mjs` (line 181) is the exact function to
  rewrite**, and `tools/kept-walk.mjs` reaches the list through `#keptOpen` at
  two places. Both need a row to exist; neither needs the removed button. The
  store's own `putKept(rec, bytes)` is what a walk should call through
  `page.evaluate`, so the seed goes in by the app's own door rather than by a
  hand-written IndexedDB transaction that could drift from the schema.

## Weighed against

**043**, which this completes. Its Outcome names retiring the store as its own
item and names the precondition: a way to write an already-kept photograph out
as a file first. `showLoneWithEdit` and `writeKeepFile` between them already
make that small — the store's route back into a photograph and the file writer
are both in place, and nothing new has to be designed to join them.

**039**, which built the store and whose promise — an edit you can put down and
come back to — is the thing being moved rather than withdrawn.

**014 and 009**, which own how much of a photograph the app holds and when it
gives the storage back. Emptying the kept store frees whatever it held, which
moves what those two can promise, the same way 043 did.

`NOTES.md` "## The measurements lived in storage the app does not own" is the
prior occurrence and the reason this is a bound rather than a preference.

## Depends

- needs 043 — the file this writes rows out AS is 043's, and it has to have been
  through a device pass first: a migration into a broken container is worse than
  no migration.
- together 039 — one piece of work filed as two. 039 built the store and this
  retires it; the promise 039 made is what has to survive.
- touches 014 — 014 owns giving storage back when a quick look ends. What the
  app must keep on the device changes once the kept rows are gone.
- distinct-from 011 — 011 is the EXPORT, a finished photograph drawn from the
  pipeline. Writing a kept row out is 043's keep FILE: the ingredients, not the
  result. They are the pair a later session collapses into "just export them".

## Options

1. **Offer each kept photograph as a file, one press per photograph, and remove
   the store only once the list is empty — with the removal of the code itself
   deferred to a later release.** Chosen. The list gains "Save as a file" on
   every row and a line saying plainly that the list is going and why. Nothing
   is deleted by the app; a row disappears when the reader has saved it and
   pressed Forget, which the list already offers. The walks are rewritten to
   seed the store directly through `keepstore.ts` rather than through a button
   that no longer exists, which restores the accessibility audit immediately and
   independently of any reader's progress.
2. Migrate automatically: write every kept row out to a file at start-up.
3. Delete the store outright in this release and say so in the patch note.
4. Leave the list exactly as it is, read-and-open-only, indefinitely.

## Rejected

- **2 — migrate automatically at start-up.** A file only exists once it has been
  through the share sheet, and a share sheet needs a press: there is no way to
  put a file somewhere the reader will find it without them choosing where. An
  automatic pass would either open a sheet per photograph unbidden — which is
  exactly the modal storm Doctrine §14's "modes announce themselves and offer an
  obvious exit" rules out — or write into storage the reader does not own, which
  is the problem this is fixing.
- **3 — delete outright with a patch note.** The store is on production. A patch
  note is read after the release, by whoever opens the ⓘ, and the work is gone
  by then. This repository's standing rule is that the reader's original is
  never touched; their saved edit is the same class of thing.
- **4 — leave it read-and-open-only.** It reads like caution and is not. The
  list keeps the promise "your work is here" while nothing can add to it and the
  browser may take it at any time, and it keeps the accessibility walk red, so
  every UI release after this is blocked or the gate gets routed around. A
  feature nobody can reach is worse than a missing one; a feature only some
  readers can reach, on a store that may vanish, is the same shape.
- **AND, ON THE INSTRUMENTS: rewriting the walks to press the file-save button
  instead.** `keep-walk.mjs` already covers that path end to end. What
  `a11y-walk.mjs` needs is the kept LIST as a surface, and the honest way to get
  a row is to put one in the store directly — a walk that reaches a surface by a
  route no reader takes is measuring its own arrangement.

## Rank

**First, above 030.**

It was ranked directly below 043, because the file it writes rows out AS is
043's and migrating a reader's only copy into an unconfirmed container is the
one ordering that could lose work. 043 shipped in 2.59 on 2026-09-22, confirmed
on the device — a photograph saved with painted masks comes back with them — so
that condition is discharged and this leads the queue.

It goes above everything else open for one reason that is not about its own
importance: **the accessibility walk is red until it is settled**, and that walk
stands before any UI release. 030, 042, 034 and the mask work below them are all
UI. Leaving this where its subject would rank means either shipping them
unmeasured or routing around the gate, and both are failures this repository has
a lesson for.
