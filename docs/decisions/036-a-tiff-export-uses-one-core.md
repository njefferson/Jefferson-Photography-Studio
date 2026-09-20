# 036 · A TIFF export uses one core

## Context

Reported from the device, 2026-09-20: a TIFF export "exports on one thread and
is taking forever". The report arrived beside a §7f diagnostic whose `Last
export` line read **17.6 MP in 27.5s — pixels 25.9s on 8 threads**, which looks
like a contradiction and is not: that line was a JPEG.

**The cause is one condition and it is explicit.** `canRunParallel` in
`src/exportparallel.ts` returns false on `opts.format !== "jpeg"`. Every TIFF
export therefore falls to the single-threaded loop in `src/export.ts`, on a
machine that had eight workers available and used them for the JPEG minutes
earlier. On the same 17.6 MP frame whose per-pixel pass took 25.9s across eight
threads, one thread is the same work undivided.

**Why the condition is there** rather than an oversight: the band workers
return a `Uint8ClampedArray` — eight bits a channel — and the TIFF branch calls
`writeTiff16`, which needs sixteen. The parallel path has no 16-bit return.
That is a real difference and not a flag that can be flipped.

A 16-bit TIFF is the export a reader reaches for when the file is going
somewhere else to be worked on further, which is exactly the case where waiting
minutes is least acceptable.

## Looked up

**Nothing external bears on this and the reason is specific rather than
dismissive.** The question is not how to split an image render across workers —
this repository already did that, measured it and shipped it for JPEG, and
Doctrine §11e says the in-house reference is the one to copy when there is one.
The question is what a worker hands back, which is a decision about this app's
own band protocol.

What WOULD send this outside is the transfer cost: whether a `Uint16Array`
per band moves across a worker boundary as cheaply as a `Uint8ClampedArray`
does, which is a documented property of structured clone and transferables
rather than something to discover by benchmarking.

## Weighed against

**008, "Opening a set on several cores"**, is the same idea at the other end of
the app and its pool is the one `exportparallel` was modelled on. The two do
not share code and should not be merged: 008 is about decode lanes for
thumbnails, this is about output bands for one frame.

`NOTES.md` "## The stage corrupted every TIFF export, and the first diagnosis
was wrong" (IR-SCIENCE.md section 9l-ii) is the last time this path was
touched, and it is a caution rather than an overlap: the TIFF branch has
already produced a wrong file once, and the thing that found it was measuring
the exported bytes rather than the screen.

## Depends

- touches 008 — the same shape of fix at the other end of the app, on a
  separate pool. Deliberately not merged; a change to either does not move the
  other's code, but whatever is learned about band transfer costs applies to
  both.

## Options

**Give the bands a 16-bit return and let TIFF take the parallel path.**
Chosen. The workers already run the same pipeline code the single-threaded loop
runs — they call back into it, which is why there is no second pipeline to
drift — so the change is what the band hands back and what assembles it, not
how a pixel is computed.

The check afterwards is the one 9l-ii established: measure the exported FILE's
bytes, not the screen, and hold the parallel output identical to the
single-threaded output. That comparison is the whole safety of the change and
it is cheap, because both paths still exist.

## Rejected

**Letting TIFF export at eight bits so it can use the existing path.** It would
make the export fast by making it a worse file. Sixteen bits is the reason to
choose TIFF at all.

**Rounding the 16-bit render down to 8 in the workers and back up on
assembly.** It produces a file that claims sixteen bits and carries eight,
which is worse than an honest 8-bit file and invisible in every viewer.

**Leaving it and telling the reader to export JPEG.** The formats are not
interchangeable and the reader picked TIFF for a reason.

**A progress estimate instead of a fix.** The export already reports its own
timing honestly; the complaint is the minutes, not the not-knowing.

## Rank

**Below the mask and control defects and above the look work.** It is a real
defect on a path the reader reaches at the END of an edit rather than the
start, so it is met less often than the sheet or the controls; and it is
bounded work with an in-house reference to copy, so it does not need to sit
behind a measurement the way the pixel items do.
