# 075 · Keeping photos after ending a large session waits on the old session's delete, with nothing on screen

## Context

**Reported 2026-09-26 from a PC, Firefox 156, staging v2.63.21.**
- The reader ended a session of 222 NEFs, opened a Quick look of 22 others and
  pressed Keep. Nothing happened.
- The report afterwards read "Adding photos: none in progress", "Last keep:
  none this session" and "Last failure: none this session".
- Clearing the site's data made the next Keep take 2.1 s.

**Reproduced in headless Chromium on the staged build, with the delete slowed.**
- Keep closes the Quick look at once. The busy card rose 2 to 3 ms after the
  slowed delete finished, and nothing was on screen until then.
- A report taken during the wait printed the device's lines exactly.
- A second press waited behind the same delete, then both ran. The session held
  every photo twice.

**The cause is one line.** `addToSession` awaits `Session.sweepSettled()`, the
background delete of the ended session: one transaction per photo, with no
timeout, no progress and no words. The comment above it says the wait sits
"where a wait is already expected and shown". It is not shown. Production has
the same wait.

**Not established.** Why the delete runs for minutes on that PC. A container
model of Firefox's storage puts 222 deletes at about 5 s.

## Looked up

- **Firefox runs one write at a time per database.** Firefox's IndexedDB
  (`dom/indexedDB/ActorsParent.cpp`, mozilla-firefox main) allows one write
  transaction per database at a time and queues the rest.
- **Deleted pages are kept, not zeroed.** It runs `secure_delete` OFF and
  `auto_vacuum` INCREMENTAL, so deleted chunks stay in the file as free pages
  until an idle reclaim.
- **So the storage figure cannot track the delete.** Firefox's figure does not
  fall when rows are deleted.
- **The reclaim's cost grows faster than the space it frees.** It measured 34 s
  at 895 MB and 457 s at 2.7 GB in a container model.
- **The room check exists.** `StorageManager.estimate()` gives usage and quota,
  which is what the wait needs in order to know whether the new set fits.

## Weighed against

- **NOTES and `src/session.ts` `forgetSession`.** Ending a session awaits only
  the index, because one transaction over the whole set made the reader wait at
  about 110 MB/s. This record keeps that split.
- **`resetSessionState`'s comment in `src/main.ts`.** It names the collision the
  wait exists for: writing a new set on top of old bytes can run the device out
  of room.

## Depends

- touches 076 — both are waits in the same open path that the reader cannot
  see. 076's is the storage permission; this one is the delete.

## Options

1. **Wait only when the new set will not fit, say so, and refuse a second open.**
   Chosen.
   - The busy card rises before any wait.
   - The wait happens only when `estimate()` says the incoming files do not fit
     beside the old bytes, and then the card says "Freeing the space the last
     session used…" with a count, N of M.
   - A second open or keep while one is in flight is refused with a toast.
   - The report gains a "Freeing storage" line.

   **As built, 2026-09-27, with what the review rounds added.**
   - **The room check reads an allowance, not free space.** `estimate()`'s
     quota is worked out from the size of the disk, so the check asks for twice
     the set and names that figure in the report. A browser that does not answer
     within 2 s is treated as no room, and the keep waits as before.
   - **A disk that fills anyway is met by a retry.** A photo refused for room
     while the old delete runs waits for it, with the card saying so, and is
     written again from its file. Its row is rebuilt from the photo as it is
     then, so a verdict or an edit made in between is kept. Chromium refuses at
     the transaction and WebKit at the request; both reach the same test.
   - **A file that is slow to arrive is offered, never given up on.** After a
     time limit the card says "Still reading NAME…" with a "Skip this file"
     button, and the read carries on. Time counts only while the page is
     visible, so a photo iOS merely suspended is not offered for skipping.
   - **The card carries a way into the report**, because it is modal and covers
     every other way in while it waits.
   - **After the first photo is on screen, the offer moves to the strip.** A
     later file that is slow to arrive gets a Skip button beside Done, never a
     card over the photograph being edited.
   - **A session the device cannot clear is left alone and said.** A new set
     is not written into it, Done keeps it open, and a single photo or a
     practice photo still opens with the old session left there to resume. A
     database that cannot be opened at all has nothing to clear, so every path
     goes on as before. A Keep from the Quick look that stops brings the Quick
     look back with its picks.
   - **Found while building it, and fixed with it: a saved photo dropped with
     photos.** It replaced an open session without asking, and that session's
     stored photos and edits were deleted, on production as well. A saved photo
     now opens only on its own.
2. Never wait.
3. Show words during the wait, and change nothing else.
4. Delete the old session in one transaction.
5. Leave it.

## Rejected

- **2, never wait.** The wait exists for a real collision: a device short of room
  would fail the new set's writes. Option 1 keeps the wait exactly where that is
  true.
- **3, words only.** On the device the quota was 121 GB with 6 GB used, so the
  wait bought nothing. Explaining an unnecessary wait still costs the reader the
  wait.
- **4, one transaction.** The split was made because one transaction over a
  gigabyte stalled the reader, and Firefox queues writes per database anyway.
- **5, leave it.** A reader who ends a large session cannot start another for
  minutes, is told nothing, and a second press doubles the set.
- **Ruled out while building option 1 (2026-09-27).**
  - **A read time limit that gives up.** The first remedy for a read that
    never finishes, which would hold the one-open guard until a reload. A file
    still downloading from a cloud drive delivers nothing until the whole file
    is local, so the timing cannot tell a slow read from a dead one, and the
    limit lost photos that were on their way. It became an offer to skip.
  - **Letting a look through a refused open.** A look dropped while a set was
    opening was applied rather than refused. It needed its own path through the
    open, and three defects came from that path in one review. A look is now
    refused like anything else while an open runs.

## Rank

**Second, after 015 (2026-09-27).** It blocks the device pass of any build once
a large session has been ended in Firefox, and 015's pass needs sessions to
open. It changes nothing that any item above it measures, and nothing below it
measures anything it changes, so it declares no edge to them.
