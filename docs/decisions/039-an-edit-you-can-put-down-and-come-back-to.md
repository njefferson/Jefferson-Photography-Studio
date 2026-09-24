# 039 · An edit you can put down and come back to

## Context

Reported from the device, 2026-09-20: there is no way to save the photo being
worked on and come back to edit it more later.

**It is true, and it is by design in one half of the app.** A set of two or
more photographs opens as a SESSION, which is persisted and resumable — the
strip, each photo's edit and the verdicts all survive a reload. A single
photograph opens down `openSingle`, whose own comment says it is "ephemeral,
not persisted (there is nothing to resume from a single edit)". So the app
already has the whole machinery and declines to use it for the case where a
reader is working on one picture, which is the case a reader is in most often.

**And the session half is not the answer either.** A session is a set the
reader opened, with a Done that ends it and frees its storage; it is a working
state rather than a place to keep things. The need is not to resume where
the session was left but to put one photograph down and pick it up next week,
and those want different answers.

## Looked up

**The field's answer is that the edit is a small recipe kept beside the
photograph, never a new copy of it.** Lightroom keeps develop settings in a
catalogue, optionally mirrored into an XMP sidecar; Capture One keeps them in a
session or catalogue; darktable keeps an XMP per file. In all three the
original file is never written, the edit is a few kilobytes of parameters, and
reopening re-renders from the original.

**This app already IS that shape.** A look is "the CREATIVE grade only —
small enough (~0.5 KB of JSON) to travel as a link fragment, a paste-able code,
or a tiny .ipslook file" (`src/look.ts`), and the session store already keeps a
per-photo edit. What is missing is not a format and not a store; it is a place
to put one photograph's whole edit under a name the reader chose.

**The part the sources cannot settle** is where the bytes live. Those tools sit
beside a filesystem they can write to. This app is a browser page that cannot
re-read a picked file after a reload on iPad Safari — which is the fact
`openQuickLook` is built around and the reason a quick look is honestly
ephemeral. So keeping the EDIT is easy and keeping the PHOTOGRAPH is the
decision.

## Weighed against

**009, "The editor's WORKING COPY at native resolution"**, and **014**, which
owns ending a session and getting the memory back, both touch how long the app
holds a photograph's bytes. This item is the other direction — holding them on
purpose, for longer — so whatever those two settle about the memory ceiling
bounds this.

`NOTES.md` "## The iPad slept and the work was thrown away" and "## The
measurements lived in storage the app does not own" are the two previous times
storage durability was the defect, and both are the argument for using the
session store rather than inventing a second one.

## Depends

- touches 014 — 014 is about giving storage BACK when a quick look ends; this
  is about holding it on purpose. They are two sides of one budget and a change
  to either moves what the other can promise.
- touches 009 — 009 decides how large a copy of a photograph the editor holds,
  which is the same budget this proposes to keep bytes in. A change to either
  moves what the other may promise.
- distinct-from 040 — 040 is the mask panel, and what it shipped that this
  copies is a PATTERN rather than a dependency: `src/maskstore.ts` took the
  named small-store shape from `src/luts.ts`, and this would take it from those
  two. Neither changes what the other computes, and a change to 040 moves
  nothing here.

## Options

**Keep one photograph as a saved edit the reader names, in the store the
session already uses.** Chosen.

The edit is what the app already stores per photo, so nothing new has to learn
it. The photograph's bytes go in beside it, because the alternative — keeping
only the recipe and asking the reader to find the file again — fails on the one
device this app is built for. And it is explicitly NOT a session: saving does
not open a strip, ending a session does not delete a saved edit, and Done does
not touch it.

What that costs is honest and has to be said in the app: a saved photograph is
the original's bytes on the device, and the reader can see how many there are
and remove them. The §7f report already carries "App is holding".

## Built already

Every piece of this exists and none of it is in the right shape yet. Writing
that here is 040's lesson applied one record on: the capability was there and
was not found, and building a second copy would be the same defect.

- **`src/session.ts` is the durability shape, whole.** Source bytes split into
  chunks of 30 KB or less so they stay inline in the transaction log and are
  genuinely on disk at commit — large IndexedDB values get externalised to a
  lazily-flushed sidecar that `durability: "strict"` does not cover, which is
  why the chunking exists and why it is not a detail to simplify away. A small
  JPEG thumbnail and the edit JSON ride inline in the meta row. `addPhoto`,
  `getBytes`, `setEdit`, `listPhotos` and `removePhoto` are the surface to
  mirror.
- **`src/batchstore.ts` is where that shape came from.** `src/session.ts`'s own
  header says it inherited it wholesale. This would be the third inheritance,
  not a new idea.
- **`src/luts.ts` and `src/maskstore.ts` are the NAMED small-store shape** — a
  record/meta split so a list is drawn without reading the payload, a declared
  count cap, and put/get/list/delete. `src/maskstore.ts` copied `src/luts.ts` for
  decision 040; a third copy follows the same two.
- **The edit already serialises and restores.** `editToJson`, `applySnapshot`
  and `restoreLiveEdit` in `src/main.ts` round-trip a photograph's whole edit on
  every session photo switch, which is the same round trip this needs.
- **`resumeSession` in `src/main.ts` is the reopen path, already written**:
  stored bytes to `decodeWithLens` to `showDecoded` to `activateCurrent`, with
  the stored edit layered on at activate.
- **`src/diagnostic.ts` already reports what the app is holding** (Doctrine
  §7f), so the storage cost this item creates has an honest place to appear
  rather than needing a new one.
- **`tools/surfaces.mjs`** is the enumeration a new dialog must join in the same
  commit, and it is checked BOTH ways against the build, so it refuses rather
  than reminds.

What genuinely does not exist: a store that the Done button cannot reach, a
name the reader chooses for one photograph's edit, and anywhere on the start
screen to come back to it.

## Rejected

**Persisting every lone open automatically.** It turns the one-photo path into
a storage leak the reader never asked for and cannot see, and `openSingle` is
ephemeral for that reason rather than by oversight.

**Keeping only the edit and re-asking for the file.** It is what Lightroom does
and it does not survive this app's device: iPad Safari cannot re-read a picked
File after a reload, so "come back later" would mean "find it in Files again",
which is the failure rather than the feature.

**Making it a session of one.** A session has a Done that frees its storage and
a strip that implies a set. Reusing it would mean the reader's saved work is
one press away from being deleted by a control that means something else.

**Exporting a JPEG as the way to keep work.** An export is a finished
photograph, not an edit; reopening it starts from the graded pixels and every
slider is gone.

## Rank

**Above the additions and below the defects.** It is a real gap rather than a
repair, and it is the one on this list that changes what the app IS for a
reader with one picture — but it is bounded by whatever 014 and 009 settle
about how much the app may hold, so it sits below the things that are simply
wrong today.

## Outcome

**Shipped in 2.57 and deployed.** `9319fdc` is the feature — `src/keepstore.ts`,
its own `ips-kept` database, the Keep button beside every mask row on the Export
panel, the `keptDlg` list on the start screen, and `tools/kept-walk.mjs`.
`af622b0` added the count to the §7f report, `6ae8280` moved the walk to the
reader's own width, and `c64325b` made it executable. The Cloudflare deploy for
the release commit `0557a84` concluded success, so this is a release rather than
a push mistaken for one.

The chosen option survived unchanged: the edit is what the app already stored
per photo, the bytes went in beside it, and the store is a separate database so
that Done cannot reach it — the rejected "make it a session of one" made
structurally impossible rather than remembered.

**The check the feature turns on is that the EDIT comes back, not the
photograph.** "Did the photo reopen" would have passed with every slider at its
default, which is precisely the failure, so the walk puts an unmistakable
saturation and a Sky mask on before keeping and reads both back. The masks come
back REGENERATED from recipes rather than bitmaps, and the sky's own percentage
is what tells those apart: 54% when it was kept, 54% when it was picked up.
That figure is the one recorded when the walk was written — this session
verified the code, the commits and the deploy, and did not re-run the walk,
which needs a browser against a served `dist`.


### What turned out wrong

**Not the code. The record.** This item stayed `- [ ]` at rank 1 through the
release that shipped it, and that is not bookkeeping, because two deployed
surfaces read this list. `vite.config.ts` builds `__ROADMAP__` from it and
`notes.html` renders `.filter((i) => !i.done)`, so the ⓘ dialog and the public
notes page advertised this feature as still to come **to readers running the
build that contained it**. `tools/session-brief.mjs` printed "NEXT UP IS 039" to
every new session at the same time.

**It worked.** The session that archived this arrived, read the brief, and was
three reads from planning `src/keepstore.ts` a second time; what stopped it was
noticing `keptDlg` already in `tools/surfaces.mjs`.

**No gate could see it, and all nineteen were green.**
`tools/decisions-check.mjs` asks whether every open item HAS a record, whether
the record is about the item that claims it, and whether its sections have
bodies. Nothing anywhere asks whether an open item's work has LANDED — which is
a comparison between this list and `main`, and is the one question that would
have caught it.
