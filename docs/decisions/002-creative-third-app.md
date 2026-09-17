# 002 · Creative — a third app for regular photos

## Context

A new entry point beside the IR studio and the macro tool, aimed at ordinary
visible-light photos: its own route and installable PWA, added to the `/`
chooser, reusing the creative stack already built here — stickers, grade,
channel mixer, warp — and growing into a full image editor over time. Owner
direction, 2026-07-19. Declared an IDENTITY change, so it ships as **2.0** under
the versioning rule rather than as a capability bump.

## Looked up

**Nothing yet, and the item is not ready for it.** Three questions are open with
the owner and named in the bullet: whether it shares the IR pipeline or starts
from a trimmed visible-light one; whether the first cut is "stickers and grade on
any JPEG/HEIC" or the full editor; and the name, route, icon and install story.
Research follows scoping here rather than preceding it — what to read depends
entirely on answer (1), since a trimmed visible-light pipeline is a different
literature from the IR one.

## Weighed against

This is the largest item on the roadmap and it consumes the creative stack that
several smaller items also touch. It shares surface with **004 (full-bleed crop)**
and **003 (big image)**: both are presentation directions that a second app would
either inherit or diverge from, and building Creative before those are settled
means building a layout twice.

Prior work it depends on rather than repeats: the sticker library, grade, channel
mixer and warp are all shipped and recorded across `NOTES.md`; the macro app
(`src/macro/`) is the existing proof that a second entry point with its own
manifest, cache and chooser tile works in this repo.

## Options

**Wait for the owner's three answers, then scope.** Chosen by default — the
bullet itself says "NOT yet scoped" and lists the questions. Nothing can be built
against three unknowns without one of them being guessed, and (1) in particular
decides the whole shape.

Start with the narrowest useful cut — stickers and grade on a JPEG, no raw path,
no IR controls — and let it grow. Defensible, and the likely answer to (2), but
it presumes (1) resolves toward a trimmed pipeline.

## Rejected

**Extending the IR editor to accept visible-light photos instead of building a
third app.** It is the cheaper path and it is the wrong one: the IR editor's
whole premise is unbounded white balance and channel swapping for an
IR-converted sensor, and `CLAUDE.md` states that every processing judgment here
starts from IR physics. A mode flag on that app would make every rule in that
file conditional. Recorded because it is the obvious shortcut and will be
proposed again.

## Rank

**Second overall, first among the design directions**, and its position is the
owner's call rather than a session's — it is a declared identity release, so it
is not competing for the same slot as the capability items below it. Sits behind
001 only because 001 is a live defect measured in hours, not a build measured in
weeks.
