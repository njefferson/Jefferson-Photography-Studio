# 014 · A quick look you cannot stop, and a session that renders it all again

## Context

Reported from the iPad, 2026-09-17, as two things that turn out to be connected.
There is no way to stop a quick look once it starts building its grid, so there is
no way to say "done" and get the memory back; and after pressing "Keep in a
session" it looked as though every photograph was being rendered a second time.

What the app does, read rather than recalled. A quick look decodes every picked
file sequentially with a yield per file, keeping only the small preview JPEGs in
RAM, and it is honestly ephemeral — iPad Safari cannot re-read picked Files after
a reload, so it lasts until the tab closes. `keepQuickLook` carries the pictures
across in a `ready` map keyed by the `File` itself, with `thumb: it.stripThumb ??
undefined`, and `stripThumb` is the SAME picture at strip size rendered from the
same decode. That map exists precisely because keeping a set used to hand
`addToSession` bare files and decode every one of them again — recorded in the
code as the reader's own observation, and it was right then.

So the second half of this report is that the same thing is happening again, or
has never fully stopped happening, on a path that was fixed once for exactly this.
An entry is added for every kept photograph, including ones whose `stripThumb` was
never built — those carry `thumb: undefined`, and the session's background
thumbnail pass will decode them. How many that is on a real folder is not known.

The intended outcome: a quick look the reader can end, and a keep that does not
re-render what was just rendered.

## Looked up

Nothing external, and the reason is specific rather than dismissive: both halves
are about this app's own decode scheduling and its own handoff between two
screens, and no outside source knows either. What WOULD send this outside is the
memory half — if the finding is that releasing object URLs and decoded buffers
does not actually return memory under iOS Safari, then what that browser does with
detached canvases, object URLs and large ArrayBuffers is documented behaviour and
must be read rather than guessed at from a slowdown.

The §7f diagnostic and the §7j test page are the instruments this repo already
owes such a question, and the test page is the one that reports what something
COSTS on the device rather than what state it is in.

## Weighed against

Overlaps **008, "Opening a set on several cores"** — that item is about decode
being queued behind one worker, and this one is about decoding things that need
not be decoded at all. Work avoided beats work parallelised, so if this is real it
changes 008's numbers and should be measured first.

Previous work on this exact path, by `NOTES.md` heading: "## Provisional
thumbnails from the embedded camera preview" and "## Stop the strip redraw storm
during an import", plus the `stripThumb` handoff itself, which was added after a
set was watched rendering twice in a row. This is the third report in that
neighbourhood, which is itself the argument for measuring the handoff rather than
patching it again.

## Options

**Count the decodes, on both sides of the keep, before changing anything.**
Chosen. Two numbers settle the second half: how many of the kept photographs
arrive with a `stripThumb` and how many do not, and how many decodes the session's
background pass then performs. If the second number is not zero for photographs
that arrived with a picture, the handoff is not being honoured; if it equals the
number that arrived without one, the handoff works and the quick look simply had
not finished. Those are different defects with different fixes and they look
identical from the outside.

**Give the quick look a real end.** A stop for the grid build and a "done" that
drops the previews and the object URLs — the same shape as the Done that already
returns the editor to the start screen, so it is one idea in the app rather than
two. Whether it releases what the reader expects is a measurement on the device,
not a claim from here.

## Rejected

**Assume the handoff is broken and rewrite it.** It was written for this exact
complaint and its comment says so; a second rewrite without a count is how a fixed
thing gets fixed again and stays the same.

**Pre-render every strip thumbnail during the quick look so `stripThumb` is never
null.** It makes the keep cheap by making the quick look expensive, which is the
opposite of what a quick look is for — the report opens by saying it cannot be
stopped.

**Treat "it looked like it was loading all of them" as the measurement.** It is
the report and it is worth acting on; it is not a count, and the visible strip
redraws for reasons other than decoding.

## Rank

**Third.** It costs memory and time on the device and it is a repeat in a place
already fixed once, which makes it likelier than most items to be a real defect
rather than a design direction. Below the full-view item, which takes the
photograph away, and below the splotchy Aerochrome, which is about a look that
shipped this week — but above everything below it on this list, because all of
those are unscoped design work and this is a defect with a two-number first step.
