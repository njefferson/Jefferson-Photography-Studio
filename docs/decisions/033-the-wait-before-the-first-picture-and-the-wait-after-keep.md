# 033 · The wait before the first picture, and the wait after Keep

## Context

Reported from the device, 2026-09-20, as two delays on the Quick look path —
the path a reader meets before any other, since it is how a folder gets into
the app at all:

1. After picking files, a long wait before ANY thumbnail appears on the
   pick/reject sheet.
2. After pressing Keep, a long wait before the screen changes from the sheet to
   the editor with the strip along the bottom.

**What the app does, read rather than recalled.**

`openQuickLook` empties the grid, opens the dialog on `Decoding 0 / N…`, and
then works the picked files **strictly one at a time**: preview-store lookup,
`importFile`, `decodeWithLens`, `makeThumb` at 512, `makeThumb` at 260,
`putPreview`. `addQuickTile` is called at the BOTTOM of that loop body, so
nothing at all is on screen until the first file has been read, demosaiced,
denoised, lens-corrected and rendered twice. Meanwhile `decodeClient` holds
three or four lanes and all but one are idle for the whole run.

`keepQuickLook` closes the grid and calls `openPicked`, which reaches
`addToSession`. Before a byte of the new set is read that path awaits
`resetSessionState(true)` and then `Session.sweepSettled()` — the previous
session's chunk sweep, one IndexedDB transaction per photo across its whole
byte store, so its cost scales with the set being REPLACED rather than the one
being opened. Only then is the first file read, and then decoded again at full
resolution, although the grid decoded that same file minutes earlier and let
the decode fall out of scope; the handoff map carries the 260 px JPEG and
nothing else. The editor appears at `showDecoded` + `activateCurrent`.

**Two candidates ruled out by reading, recorded so they are not re-guessed.**
`sky: true` is not in the critical path — `decodeClient` resolves the decode
and leaves `img.skySelReady` to land afterwards, deliberately. And
`isLookFile` refuses anything over 64 KB before reading a byte, so a set of
raws costs nothing there.

The intended outcome: a picture on the sheet in the time it takes to read one
file's header, and a Keep that does not re-do work the grid has already done.

## Looked up

**The whole question is a solved one and the answer is an industry split.**
Photo Mechanic's reputation rests on exactly this: pointed at a folder it reads
the embedded JPEG the camera baked into each raw at capture and shows it, and
is reported at two to three times Lightroom Classic's speed for manual culling
because of it — Lightroom being a catalogue that renders its own previews
first, five to twelve minutes per thousand raws before culling can begin
(imagen-ai.com/valuable-tips/photo-mechanic-vs-lightroom-culling/;
findme.photo/blog/photo-mechanic-vs-lightroom-culling-speed-test-2026).
Lightroom Classic answered it with an import option of its own, **Embedded &
Sidecar**, which shows the camera's preview until something needs more
(havecamerawilltravel.com/lightroom/lightroom-classic-new-embedded-previews/).

**The caveat, and it is the one this app has to handle rather than inherit.**
An embedded preview is the CAMERA's rendering, not the application's; Lightroom
bypasses it entirely the moment the Develop module opens and re-renders from the
raw (lightroomsolutions.com/embedded-sidecar-workflow-in-lightroom-classic/).
On an ordinary camera that difference is a profile away. On an IR-converted
body it is a different colour world — this repository's own comment above
`realThumbnails` already says so, and IR-SCIENCE.md section 3 says why: the
camera cannot store an infrared white point, so its own JPEG is rendered at a
clamp artefact.

**Which is survivable, because culling is not a colour judgement.** A pick or a
reject is composition, focus, and whether the moment is there; the app's own
render arrives seconds later and the decision can be changed. What is NOT
survivable is a preview that is silently passed off as this app's rendering,
which is the same defect the strip's provisional badge was built to prevent.

**One camera-dependent fact worth having:** current Nikon bodies embed a
FULL-SIZE preview, where several other makes embed only a small one. The
owner's is a Nikon, and `embeddedPreview` already takes the largest available
through `pickLargestPreview`, so the grid tile has a real picture to show
rather than a postage stamp.

## Weighed against

**014, "A quick look you cannot stop, and a session that renders it all
again"**, owns the ground after the Keep and is held open on a measurement:
its chosen option is to COUNT the decodes on both sides of the keep before
changing anything. The instrument this item builds is that count, which is why
014 now declares `needs 033` rather than this record claiming to replace it.
What 014 keeps is its other half — a way to stop a quick look and get the
memory back — which nothing here touches.

**008, "Opening a set on several cores"**, is held open for a device number and
nothing else, and its `needs 014` line already says why: work avoided beats
work parallelised. This item does both — it removes a decode from the critical
path AND fills the idle lanes — so its measurement moves 008's numbers.

Previous work on this exact path, by `NOTES.md` heading: "## Provisional
thumbnails from the embedded camera preview" and "## Show every tile up front,
then fill each in", which are the two fixes the SESSION strip received and the
grid never did; "## Stop the strip redraw storm during an import"; "## It
decoded everything to find out it wanted none of it"; and "## Thumbnails that
stop arriving are a read that has not finished", which is the precedent for
putting the stage into the diagnostic so the next report names it.

## Depends

- touches 008 — 008 parallelises decodes; this removes decodes from the path
  being waited on and fills the same lanes. A change to either moves the
  other's numbers.
- touches 014 — shares the ground after the Keep. The load-bearing edge for
  this pair is the other one and it is declared on 014's side, where it
  belongs: 014 NEEDS this, because its own first step is a count this builds.
  Stated here because this record's prose cites 014 and a citation declares a
  relation.

## Options

**Instrument both transitions in the app, ship the three fixes that need no
number, and take the fourth from what the instrument says.** Chosen.

The instrument is the test page (Doctrine §7j) measuring both transitions on
practice files in that file's established shape — three runs, median, spread
printed — plus a standing per-stage record of the last quick look and the last
keep in the §7f diagnostic, so a report from the device names the stage instead
of the symptom.

The three fixes need no measurement because each is a remedy this app already
wrote for the session strip and never gave the grid: every tile on screen
before a byte is read; the camera's own preview as the tile's first picture,
marked provisional in TEXT exactly as the strip marks it; and the decode lanes
kept full instead of one file at a time, carrying across the in-flight guard
008 records as load-bearing.

The fourth is delay 2, where the candidates are the storage preamble, the
re-decode and the first paint, and they are seconds apart in cost. One part of
it is certain regardless because it is ordering rather than tuning: the first
photo's read and decode can start when Keep is pressed, beside the storage
preamble rather than behind it.

## Rejected

**Assume the re-decode is the seconds and carry the decode across.** It is the
most attractive of the three candidates and it is the one with a real cost: the
quick look lets each decode fall out of scope on purpose, with a comment saying
so, to keep RAM bounded to N small JPEGs. Holding one decode is defensible;
holding one because it FEELS like the answer is how a memory ceiling gets spent
on a stage that was never the wait.

**Assume the sweep is the seconds and move it off the critical path.** Its own
comment argues the opposite — it is the one delete still worth waiting for,
because ending a session and immediately opening another is the collision that
runs the device out of room. Moving it needs the number first.

**Pre-render every strip thumbnail during the quick look**, so the keep has
everything. Rejected in 014 and rejected again here for the same reason: it
makes the keep cheap by making the grid expensive, and the grid is the half
being complained about.

**Render the camera's preview and stop there.** It would make the sheet instant
and make every pick a decision about a rendering the app disagrees with. The
provisional state is the whole point: a first picture that is replaced, and
says while it is there that it is the camera's.

**Treat the report as the measurement.** It is the report, and it is worth
acting on; "a long delay" is not a stage. This repository has spent rounds on
exactly that substitution.

**A spinner with better wording.** The sheet already says `Decoding 0 / N…`.
The defect is that nothing is drawn, not that nothing is said.

## Rank

**Fourth**, below the three sky items and above 032.

The argument is dependency rather than its having been reported. It precedes
014 and 008 because both are held open on measurements it produces, and neither
can be right before it. It sits below 029, 023 and 031 because those are
finished work on staging waiting on a person rather than work competing for
session time — moving them down would not make them arrive sooner. It sits
above 032 and everything under it because those are design work on the editor
and this is a defect on the door every reader comes through first.

## Outcome

**BOTH WAITS FIXED 2026-09-20, and the plan's diagnosis was wrong about which
half was slow.** It said the decode was the bottleneck. Measured before
anything was changed, the first wait was 2.6s to a usable sheet, of which 1.7s
was RENDERING and not decoding — so the fix is that the sheet is drawn before
any file is read rather than that the reading is made faster.

Every tile now exists from the moment the folder is picked: named, numbered, in
order, pressable, each carrying the state it is in. **The first tile reaches
the screen in 5ms against 331ms**, and the whole run came down from 2.6s to
2.05s. The camera's own embedded preview fills a tile before this app's decode
reaches it, so a tile shows a picture rather than a placeholder for most of its
wait.

**The first attempt made the first PICTURE worse — 331ms to 514ms — by opening
every decode lane at once**, which put the first file behind the pool's own
scheduling. The first file now runs alone and the lanes open behind it: 233ms,
better than both.

The second wait, after Keep, was measured and is unchanged within noise. It was
not the same defect and it is not this record's; the counting half of 014 is
where it goes.

**Three walks broke when a heading was renamed**, because they polled
user-facing prose to know when the sheet was busy. `qlGrid.dataset.busy` is the
fact now, and a walk that reads words a person reads is brittle by
construction.
