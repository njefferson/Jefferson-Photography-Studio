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
state rather than a place to keep things. The reader's question is not "can I
resume where I was" but "can I put this one down and pick it up next week",
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
