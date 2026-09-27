# 076 · Batch export and adding photos wait for the browser's storage permission

## Context

**Two paths wait on the answer.**
- `runBatch` in `src/main.ts` awaits `requestPersistentStorage()` before it
  processes anything.
- `addToSession` awaits it after the photos are added, before its closing notes.

**What the reader sees.** Firefox answers `navigator.storage.persist()` with a
permission prompt, and the promise waits for the answer. Reported from the
device on 2026-09-26: Firefox asked to keep data in persistent storage after the
session loaded. A batch in a browser that has not been asked yet sits at
"Processing 0 / N" until the prompt is answered.

## Looked up

- web.dev, Persistent storage (web.dev/articles/persistent-storage): Firefox
  asks the user in a prompt; Chromium decides by heuristics and does not prompt.
- Mozilla bug 1286717, which exposed persist() and persisted(): the promise
  resolves with the user's answer.
- `src/session.ts` `requestPersistence` already reports rather than promises;
  the diagnostic reads `navigator.storage.persisted()` directly.

## Weighed against

- **075.** It removes the other wait in the same path that is not shown.
- **NOTES, "an open session will not be evicted".** The request exists to
  protect a session's bytes, and it still does if it is not awaited.

## Depends

- touches 075 — the same open path. That record removes the delete wait; this
  one removes the permission wait.

## Options

1. **Ask, never wait.** Every call site calls `requestPersistentStorage()`
   without `await`. Chosen.
2. Ask earlier, at the first open.
3. Leave it.

## Rejected

- **2, ask earlier.** It moves the prompt to a moment the reader has not chosen
  anything to protect, and it still waits if anything awaits it.
- **3, leave it.** A batch that appears stuck on its first frame, in a browser
  the app supports.

## Rank

**Third, after 075 (2026-09-27).** Same path, smaller cost, and it invalidates
nothing above it. It ships first, as its own commit, because it is two lines.
