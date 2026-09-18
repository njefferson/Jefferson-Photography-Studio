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

**EVIDENCE FROM THE DEVICE, 2026-09-17.** A screen photograph taken right after
keeping a quick look's pictures into a session shows the strip reading
**"viewing 1 · adding 6 of 48"** with five tiles drawn and the rest still empty
placeholders carrying only their file names. So the second half of this report is
confirmed as a real observation rather than an impression: after the keep, the
session is working through all forty-eight again.

**SECOND DEVICE REPORT, 2026-09-18, a Windows PC on staging 2.51.2**, with a
screenshot taken while the kept set was loading: two tiles developed, three
showing the camera's preview, every later tile a file name — the grid's
just-rendered pictures not carried forward, again.

**A CANDIDATE MECHANISM, read in `src/main.ts` the same day and UNMEASURED.**
`keepQuickLook` carries every kept item in `ready` with `thumb: it.stripThumb`,
present only for the items the grid rendered to strip size. `addToSession`
marks a carried tile `real` and stamps it with `stampFor(slot)`, which for a
photo with no edit of its own is `gradeStamp()` — and that stamp includes
`autoLift` and `liftAmount`. The first photo opens mid-import and its look
application re-solves the lift, so `liftAmount` can move under every tile
already stamped; `restripForGrade` defers while `adding` is set and then marks
every tile whose stamp differs as `waiting`, and `realThumbnails` renders them
again. If that holds, the count below will show carried tiles re-rendered in
proportion to the lift moving, not to the grid having stopped early. A
hypothesis for the count to confirm or kill, not a finding.

What it does NOT say is how many of those forty-eight arrived with a picture
already built and were re-rendered anyway, against how many arrived with nothing
because the quick look had not reached them. Those are the two numbers this item
turns on and a photograph cannot carry either. It also shows the cost plainly:
forty-eight frames is minutes of work with no way to stop it.

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

**Eighth in the file order** (after 021, 019, 018, 023, 012, 013 and 016; this section read "Third" until 2026-09-18, when the order above it had grown). The reasoning stands: It costs memory and time on the device and it is a repeat in a place
already fixed once, which makes it likelier than most items to be a real defect
rather than a design direction. Below the full-view item, which takes the
photograph away, and below the splotchy Aerochrome, which is about a look that
shipped this week — but above everything below it on this list, because all of
those are unscoped design work and this is a defect with a two-number first step.
