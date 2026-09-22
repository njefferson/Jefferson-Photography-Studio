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

**THIS RECORD CHANGED ITS CHOSEN OPTION, and that is written down rather than
done quietly.** It was drafted around a migration — a "Save as a file" control
on every row, a line saying the list was going, nothing deleted by the app —
and every part of that rested on one premise: the store shipped to production,
`src/keepstore.ts` is on `main`, so a reader might hold kept photographs that
exist nowhere else and the contents of one device could not settle it.

Settled 2026-09-22: **nobody has kept photographs in the app.** There is no work
to migrate. The migration therefore protects nothing while costing a new
control, new reader-facing copy and the accessibility pass that copy owes — and
option 3 below, outright removal, which this record had rejected, becomes the
chosen one. Its rejection reason was that a patch note is read after the work is
already gone. There is no work to be gone.

**It also changes what clears the walk**, which had been the argument for doing
the instrument half first. There is nothing to seed and no surface to measure:
the audit goes green because the surface ceases to exist, and
`tools/surfaces.mjs` — which holds its dialog list to the BUILD in both
directions — is what makes that removal honest rather than merely quiet.

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

**AND IT NO LONGER DECIDES ANYTHING HERE, which is why it stays rather than
being cut.** The rule above is satisfied vacuously once the store is known to
be empty: no reader's state is lost across the change, because there is none.
The research is kept because it was load-bearing right up until the premise
moved, and a line of reasoning that is deleted the moment it stops applying is
one the next session re-derives from scratch. What it still settles is the
shape of any FUTURE removal in this app where data does exist.

## Built already

- **The complete call-site list, read off the source rather than remembered.**
  `src/main.ts` reaches the store through one import and these:
  `openKeptId`, the four element handles, `keptThumbUrls`, `openKeptPhoto`,
  `refreshKept`, the two listeners, and the `void refreshKept()` inside
  `updateSessionResume`. `ir.html` carries `#keptOpen` and the `#keptDlg`
  block. `src/style.css` carries the `.kept-row` rules. `src/diagnostic.ts`
  names the database in one row of its store table. Nothing else in the tree
  imported the store module.
- **`showLoneWithEdit`'s `keptId` parameter falls out with it.** The keep-file
  route is its only remaining caller and already passes null, and `openKeptId`
  is write-only once nothing reads a kept row — so the parameter, the module
  variable and the contract sentence explaining what the null MEANS all go
  together rather than leaving a stale explanation behind.
- **`requestPersistence` is exported from `src/session.ts` as well**, which is
  the copy `src/lensrig.ts` imports. Deleting the store deletes a duplicate of
  one idea rather than a capability.
- **Four gates already refuse a missed reference**, so this does not need a new
  one. `typecheck` catches an import of a file that is gone;
  `tools/surfaces.mjs` holds the dialog list to the BUILD in both directions, so
  markup removed without its declaration — or the reverse — fails;
  `architecture-check` regenerates the module map from each file's own opening
  comment, so a deleted module cannot linger in it; `contract-check` reads the
  declared backlog both ways, and `.contract-allow` carried no entries for the
  store to unwind.
- **`tools/keep-walk.mjs` already proves the route that replaces it** — a real
  press, a real download, the photograph found inside byte for byte, and the
  file picked back with its painted mask selecting the same pixels. The store is
  not being removed and left with nothing in its place.
- **The kept list's own walk had eleven checks and all of them were about the
  list**, so it is deleted rather than rewritten, and `tools/walk-all.mjs`
  enumerates the directory so it drops out on its own. `keepAPhoto` in `tools/a11y-walk.mjs`
  (line 181) and its one call site go the same way.

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

1. **Remove the store outright in this release, and say so in the patch note.**
   Chosen, once the store was known to be empty. The store module and every
   reference to it go: the start-screen button, the dialog, the row markup and
   styles, the diagnostic's row for the database, the walk that only ever walked
   it. One unguarded `indexedDB.deleteDatabase("ips-kept")` at boot takes the
   empty database off every device that has one, because after this nothing in
   the tree knows the name and the diagnostic will stop reporting it — cheap
   now, impossible later.
2. Offer each kept photograph as a file, one press per row, and remove the
   store only once every list is empty.
3. Migrate automatically: write every kept row out to a file at start-up.
4. Leave the list exactly as it is, read-and-open-only, indefinitely.

## Rejected

- **2 — a "Save as a file" control on every row.** THIS WAS THIS RECORD'S
  CHOSEN OPTION and it is rejected now on one fact: there is nothing in the
  store to save. It would add a control, a line of reader-facing copy saying
  the list is going, and the accessibility pass that copy owes, to migrate
  nothing. Its reasoning was right while the premise held, and the premise is
  what moved — not the argument.
- **3 — migrate automatically at start-up.** Rejected before and still, for a
  reason the empty store does not touch: a file only exists once it has been
  through the share sheet, and a share sheet needs a press. An automatic pass
  would either open a sheet per photograph unbidden, which is the modal storm
  Doctrine §14 rules out, or write into the storage this is escaping.
- **4 — leave it read-and-open-only.** It reads like caution and is not. The
  list keeps the promise "your work is here" while nothing can add to it and
  nothing is in it, and it keeps the accessibility walk red, so every UI release
  after this is blocked or the gate gets routed around. A feature nobody can
  reach is worse than a missing one.
- **AND, ON THE INSTRUMENTS: rewriting the walks to seed the store directly.**
  That was the plan while a surface was going to survive. With the store gone
  there is nothing to seed and no surface to measure, so the kept list's walk
  is deleted rather than rewritten and `keepAPhoto` goes out of
  `tools/a11y-walk.mjs`. What keeps that honest rather than quiet is
  `tools/surfaces.mjs`, which holds the dialog list to the BUILD in both
  directions: a surface cannot be dropped from the sweep without also being
  dropped from the app.

## Rank

**First, above 030.**

It was ranked directly below 043, because the file it would have written rows
out AS is 043's and migrating a reader's only copy into an unconfirmed container
is the one ordering that could lose work. 043 shipped in 2.59 on 2026-09-22,
confirmed on the device — a photograph saved with painted masks comes back with
them. That condition is discharged twice over now: there is also nothing to
migrate.

It goes above everything else open for one reason that is not about its own
importance: **the accessibility walk is red until it is settled**, and that walk
stands before any UI release. 030, 042, 034 and the mask work below them are all
UI. Leaving this where its subject would rank means either shipping them
unmeasured or routing around the gate, and both are failures this repository has
a lesson for.

## Outcome

**SHIPPED 2026-09-22**, as the chosen option rather than the drafted one: the
store removed outright, with no migration control and nothing for the reader to
do. What made that legitimate is written in Context — the premise the migration
draft rested on was that a reader might hold photographs existing nowhere else,
and that premise turned out to be false.

Removed with it: the store module, the start-screen button, the dialog and its
styles, the diagnostic's row for the database, and the walk that only ever
walked that dialog. `showLoneWithEdit` lost the parameter naming a store row,
along with the module variable behind it and the sentence in its contract
explaining what that null meant. The empty database is deleted on the next boot
after the update, and the other five stores were confirmed untouched by planting
an `ips-kept` database on the origin and watching only that one go.

**The ranking reason discharged as stated.** The accessibility walk went from
131 checks with two failures to 129 with none, and by the surface ceasing to
exist rather than by being seeded — a name diff showed the only two sweeps that
disappeared were the removed dialog's own, at each width. Every UI item below
this is unblocked.

**What turned out wrong, and it was found by the keep file rather than by this
work.** `fix.pts` is a `Float32Array`, and `JSON.stringify` writes one as
`{"0":…,"1":…}` with no `.length`, so the revive skipped every stroke: hand
corrections to a kept sky selection had been silently lost on every reopen. It
is fixed — plain arrays out, `reviveFixStrokes` in — but nothing in this
record's analysis would ever have reached it, because this record is about the
store and that defect is in the file that replaced it.
