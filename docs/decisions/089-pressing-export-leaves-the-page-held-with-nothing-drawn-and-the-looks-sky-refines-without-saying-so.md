# 089 · Pressing Export leaves the page held with nothing drawn, and the look's sky refines without saying so

## Context

Two things on the same screen say nothing while the app works.

**The export press.** Pressing Export on the iPad held the page for 9.91 s and 9.95 s
(the Holds line of the two reports of 2026-10-14, each "while an export", the page not
hidden), and the strip that says an export has begun was not drawn until it was over.
Then the figure sat at 0% for as long again. The reports' Last export lines are 20.9 MP
in 79.5 s (reading 0.5 s, pixels 69.3 s on 3 threads, encode 0.3 s, metadata 0.0 s) and,
in the earlier report, 20.9 MP in 1392.1 s (reading 0.5 s, pixels 1381.8 s, encode 0.2 s).
The labelled stages add up to 70.1 s of the 79.5 and to 1382.5 s of the 1392.1, so 9.4 s and
9.6 s were in no stage; they are the same seconds as the holds.

**Where the seconds are, read from the code and from a trace of the page** (the build as
it stands in the tree before this record's change, NIR_3461 under Aerochrome at full size,
a JPEG, in the container: software graphics and four cores, so a ratio and not a device
time; every figure below is from that one run unless a section says otherwise):

- `runExport` wrote the strip and called `exportImage` in the same task. `exportImage`
  is `async` but does all of its setup before its first `await`: it reads the source, then
  builds the clarity map, the sky map (`buildSkyMap`), the compiled edit and the glow map,
  and only then reaches `canRunParallel` and `exportBands`. In a pooled export the main
  thread never runs the per-pixel loop; every band builds its own copy of all four in its
  worker. So the page built, for nothing, what it then asked three workers to build, and
  the strip it had set a line earlier could not be painted until that was done.
- The page was held 48.99 s from the press to the first painted frame, as one long task of
  48.99 s. The main-thread CPU profile of that stretch, mapped through the build's source
  maps: `runExport` 48.77 s inclusive, `exportImage` 48.76 s, `buildSkyMap` 46.35 s
  (95% of the hold), `getSource` 2.03 s, `exportBands` 0.34 s. Inside the sky map, the
  denoise and detail taps are the cost (`raw/denoise.ts` 25.06 s of self time in one
  function, 7.96 s and 6.39 s in two more, the demosaic tile 3.92 s).
- The three export workers were made 48.6 s after the press, which is when the page got
  to `exportBands`, and their first message of any kind came at 95.3 s and 96.5 s: each one
  repeats the same setup, and the worker posts progress only from inside its pixel loop,
  so the pool's figure read 0% for 47.9 s (the first non-zero figure at 96.9 s).

**The sky line.** Under a look with sky stages the sky colour reaches the picture after
it: the sky map lane builds a coarse map and then the full one (record 088; 5.2 s and 7.6 s
on the iPad, over 10.55 s on the PC), and until the full one lands the picture is not
final. Nothing on the screen says so. A mode announces itself.

## Looked up

- **Why the strip was not drawn.** A change to the page's markup reaches the screen only
  when the task that made it has ended and the browser has had a frame; work in the same
  task delays the paint however early the markup was written. The standard remedy is to
  write the indicator first, let one frame be drawn (a callback in `requestAnimationFrame`,
  and a timeout scheduled inside it, which runs after that frame's paint), and only then
  start the heavy work, or move the work off the main thread (web.dev, "Optimize
  JavaScript execution"; the Web Performance Calendar's 2024 piece on breaking up long
  tasks and the "after the next paint" pattern in the web-vitals discussion thread; the
  javascript.info event-loop chapter's progress-indication example; read 2026-10-15).
  A tab that is not drawing never calls the frame callback, so the wait also carries a
  timeout and cannot hold an export for a frame that will not come.
- **Not looked up, and why.** How `buildSkyMap` itself is built is record 069 and 087's
  ground and is not changed here.

## Built and measured on the page, 2026-10-15

Served from the built tree and driven through the page on the reader's own raw, software
graphics in a container with four cores and three export workers, not a device. Three runs
of each build, every run a whole page load, an open, an Aerochrome press, the page standing
still with the full sky map in, and then a full-size JPEG export from the Export tab
(`harness/step76-press.mjs`, which records every animation frame, the strip's words, every
long task and the time each export worker is made and first speaks; its own made-to-fail
block plants a recording and must read back 10001, 14001, 4000 and 10000 ms).

- **Before this change** (the tree's build): the strip was painted 43.1, 41.9 and 40.9 s
  after the press (median 41.9 s), each time after one long task of the same length; it
  then read 0% for 40.3, 39.6 and 37.0 s (median 39.6 s); the first non-zero figure came
  at 83.4, 81.5 and 77.9 s (median 81.5 s). Last export: 20.9 MP in 226.9, 223.1 and
  205.7 s (median 223.1 s, range 21.2 s); reading 2.3, 2.0, 1.8 s; pixels 183.5, 180.7,
  164.5 s; encode 0.5 s in each; metadata 0.0, 0.2, 0.0 s; so 40.6, 39.7 and 38.9 s were in
  no stage, the same seconds as the hold.
- **After this change**: the strip was painted 6, 5 and 7 ms after the press, with
  "Preparing the export of NIR_3461.NEF… 0%"; it read 0% for 4.03, 4.65 and 4.25 s and the
  first non-zero figure came at 4.04, 4.65 and 4.26 s (median 4.26 s against 81.5 s), then
  moved in steps (2%, 3%, 5% …) as the three workers reported their setup. The page's
  longest gap between frames after the press was 2.26, 2.44 and 2.36 s (median 2.36 s
  against 41.9 s). The CPU profile of that stretch, mapped through the source maps:
  `runExport` 2.07 s inclusive, `exportImage` 2.07 s, `getSource` 1.92 s (the NEF read,
  `readNefCfa`), the pool's start 0.12 s; `buildSkyMap` does not appear. That 2 s is the
  page reading the whole file for the frame's size and for the path where it runs the loop
  itself; it is 0.5 s in the iPad reports' "reading" figure, and it now happens after the
  strip is drawn. Last export: 196.6, 170.6 and 183.2 s (median 183.2 s, range 26.0 s);
  reading 2.0, 2.2, 2.1 s; setup 0.0 s in each; pixels 193.9, 167.9, 180.3 s; encode 0.5,
  0.4, 0.5 s; metadata 0.2, 0.0, 0.2 s. The stages add up to the total to within 0.1 s in
  all three. The pixel stage is the same as before (median 180.3 s against 180.7 s): what
  the export saves is the hold, 39.9 s at the median.
- **The file.** The first run's JPEG against the first run of the build before the change:
  the entropy-coded scan is three million five hundred and twenty thousand eight
  hundred and eighty-one bytes in each and no byte differs, and the
  quantisation and Huffman tables are equal. The only segment that differs is the EXIF
  block, whose DateTime is the export's own time by design (`ifd0ExtraEntries`), so a
  whole-file hash differs between two exports of one build and cannot be the gate; the scan
  is. Two exports of the build before the sky commit show the same (a scan of three
  million five hundred and twenty-five thousand five hundred and twelve bytes, no byte
  different, only the EXIF block different).
- **Did the sky build make the export slower?** Not in the container. The build before the
  sky commit (a worktree of its parent, served on its own port) took 260.3, 250.7 and
  273.8 s (median 260.3 s, range 23.1 s), against 226.9, 223.1 and 205.7 s for the tree
  before this change: 37.2 s less at the median, in the pixel stage (median 209.8 s against
  180.7 s) and in the unlabelled setup (48.0, 41.3 and 51.3 s against 40.6, 39.7 and
  38.9 s). The hold at the press is in that build too (50.1, 43.7 and 53.9 s to the first
  painted strip), so it is not the sky commit's. That build's page also ran a second
  main-thread task of 43.1, 36.3 and 41.3 s right after the pool started, beside the three
  workers on four cores, which the tree's page did not; that is the one difference seen,
  and it is not shown to be the cause of the longer pixel stage.
- **Not the first device report's 1392.1 s.** No run here came near a 17-fold spread: the
  nine full-size exports above range from 170.6 to 273.8 s. What made that export slow on
  the device is not found; the report says the page was not hidden.
- **The line, seen** (`harness/step76-refine.mjs`; screenshots of the real page, opened):
  after Aerochrome was pressed on NIR_3461 the app wrote "Refining the sky for this look…"
  into the line at 67.76 s (the 700 ms timer was due long before; the first sample the
  page answered came at 68 s, and record 088 describes the container's long first draw,
  which I did not trace again here), and emptied it at
  119.23 s, 0.02 s after the full map's upload at 119.21 s; the coarse map's upload was at
  70.09 s. On NIR_1651 the words were written at 67.12 s and emptied at 116.07 s, 0.02 s
  after the full map's upload at 116.05 s. The words came back after going 0 times. The
  line sits under the file-kind chip at the stage's top right and takes no tap.
- **What the picture is while the line is up.** On NIR_3461 the picture drawn when the line
  first showed has thin red wires across the sky and a flatter sky; the picture after it
  went has dark thin wires and a steadier blue. That is the picture before the sky map's
  gate exists: the line says it is not final. Nothing shortens it here.
- **Not measured here.** The time on a device; the strip's figure on a tablet; whether 700
  ms is the right delay.

## Weighed against

- **088**, whose lane builds the map and whose coarse and full landings are the interval
  the sky line covers; this record adds a sentence to that interval and no work to it.
- **The export on several cores** (NOTES.md, 2026-09-12, "the export on several cores"):
  the pool's design is one `exportImage` run by every band so no second pipeline exists.
  That is kept; what changes is which thread builds the setup.
- **Export stops owning the screen** (NOTES.md, 2026-09-14): the strip floats over the
  photograph and its text is a status line; both are kept, and the byte-identical output
  gate it describes is the gate this change is held to.
- **Exports that wait for you** (NOTES.md, 2026-09-14): the strip's second sentence and
  its buttons are untouched.

## Depends

- touches 088 — the sky line covers the interval 088's coarse and full maps land in, and reads the same lane ask.
- distinct-from 071 — 071 is the first launch's hold at start-up; this is the export press's hold, a different task with a different cause.

## Options

1. **Say "preparing" in the frame after the press; build the setup only on a thread that
   will run the loop; count the workers' setup as its own stage; name the setup in the
   report; and say in words while the lane is building the sky map.** Chosen. It removes
   the hold where the code allows (a pooled export builds none of the four on the page),
   gives the strip a figure that moves from the start, and keeps what every thread
   computes the same: a band or the single-thread path runs the same setup, in the same
   order, from the same inputs, just before its loop.
   **The figures, and what each rests on:**
   - **700 ms before the sky line appears.** A choice. A map that lands in under 700 ms
     leaves nothing to announce, and a screen reader that hears a sentence for a fifth of a
     second hears noise; the lane's builds are seconds on the devices. It is the only
     number in the change that is not read off the code or a measurement.
   - **Twentieths for the setup's figure.** The same step the pixel pass reports in
     (`export.worker.ts`), so a message is sent at most twenty times per worker for it.
2. **Make the shared sky map builder resumable so the single-thread path can yield
   inside it.** Not built: see Rejected.
3. **Build the sky map once and hand it to the workers.** Not built: see Rejected.
4. **A figure that climbs on a timer from the press.** Not built: see Rejected.
5. **A spinner or pulse for the sky line.** Not built: see Rejected.
6. **Show the sky line the moment the lane is asked.** Not built: see Rejected.

## Rejected

- **2, a resumable sky map builder.** The builder is shared by the page, the lane and the
  export (`src/skymap.ts`), so changing its shape moves what record 069 and 087's renders
  were taken from, and the preview version with it. It would shorten only the paths that
  still run the loop on the main thread (a photograph with stickers or a warp, an output
  under two megapixels, a browser with no module workers, a failed pool): there the hold
  at the press stays, shorter than before only by the time the strip now gets to be drawn
  first. The strip says "Preparing" in that case and the report names the stage as setup.
- **3, one map for all workers.** The bands run side by side, so building the map once
  and posting it would not shorten the wall time (each worker builds in parallel), and
  it would add a message that carries a map and an ordering between the workers.
- **4, a timer-driven figure.** A figure that is not a measurement is a claim the page
  makes about itself, which the app does not do. The setup is reported from what the
  sky map has read (the source row of the tap being taken), and the pixel pass from rows
  done.
- **5, a spinner.** It carries no meaning without its sentence, and a mode announces
  itself in words; the sentence alone does the whole job, and with no motion there is
  nothing for reduced motion to switch off.
- **6, at once.** A build that lands in a few hundred milliseconds would flash the
  sentence for a fifth of a second and a screen reader would read it each time. The
  delay is paired with a count of asks in flight, read a task after an answer, so two asks
  in a row (a slider moved while the lane is busy) keep one line up instead of emptying
  it and writing it again.

## Rank

**Below 088, above 069, from 2026-10-15.** Nothing here needs another item; 088's lane is
what the sky line talks about, and 069's renders do not read either surface. It is the
reported-from-the-device defect with the plainest fix on the queue, and no item above it
would have to be redone once it is built.

## Outcome after the 112 change

The refining words now end when the ask is given up, not when the lane finishes a map that will be thrown away, so the page's words no longer stand for work nobody will use. The proof runs are the step-112 run outputs under progress/ in the session scratchpad.

## Looked at

- NIR_3461.NEF, 2026-10-15: the whole window at 1280 by 950 and a 1:1 crop of the stage's top right corner (380 by 130), once while the line was up and once after it had gone, and the crop of a second run in both states. Up: "Refining the sky for this look…" on one line in a dark glass chip under the "NEF · raw" chip, right aligned, legible, on the stage's background above the photograph; the picture at that moment has thin red wires across the sky and red edges on the pylons, and a flatter grey-blue sky. After: the chip is gone, the wires are dark and thin, and the sky is a steadier blue-grey.
- NIR_1651.NEF, 2026-10-15: the whole window and the crop, up and gone, of a portrait frame. Up: the same chip at the stage's top right, its left end over the right edge of the photograph (cloud) and still legible. After: the chip is gone. The two whole windows differ little to the eye; the histogram differs.
