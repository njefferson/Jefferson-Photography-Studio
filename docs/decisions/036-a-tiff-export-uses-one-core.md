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

**WHY THE CONDITION IS THERE — and this record said something false about it
first, so the correction is part of the record.** The first draft claimed the
band workers return eight bits a channel and that the parallel path has no
16-bit return. **It does.** `BandResult` in `src/export.ts` declares
`rgb?: Uint16Array` with the comment "TIFF path: 16-bit RGB, same rectangle".
The type was written for this.

What is actually true is worse and more interesting: **that field is declared
and never produced anywhere.** The band early-return sits in the 8-bit branch
and hands back `data`; the TIFF branch builds its `Uint16Array` and returns a
finished blob, so a band request down the TIFF path would return a whole file
rather than a band. The 16-bit half of the band protocol is a type with no code
behind it.

**AND A SECOND DEFECT, found by the walk rather than by reading: the report
cannot see a TIFF export at all.** `Last export` read "none this session"
immediately after a completed 31 MB TIFF, both times, because the three lines
that record a profile — megapixels, total, `lastProfile` — exist only in the
JPEG branch. The TIFF branch has never written one.

That is why the device report and the complaint looked like they contradicted
each other. The pasted line WAS a JPEG's, as this record already said, but for
a stronger reason than "that run happened to be a JPEG": after a TIFF export
there is no line to read, so the newest one always belongs to some earlier
JPEG. A reader pasting a report to ask about a slow TIFF hands over a
measurement of something else entirely, with nothing marking it as such.

It also made the first run of the verification walk unable to answer its own
question: the two files came back byte-identical, which proves the band
arithmetic and proves nothing about whether the pool engaged, because the
thread count read zero on both runs.

`exportparallel.ts`'s own header gives a third answer — it lists TIFF among the
fallbacks as "the print-master path and enormous either way", which is a memory
judgement rather than a capability one. That judgement is the part worth
keeping: a 16-bit RGB band is six bytes a pixel where RGBA is four, and
`perWorkerMb` models the band at four. So the memory ceiling that decides how
many workers may start is understating a TIFF band by half, and it has to be
told before this is switched on.

Three accounts of one condition — this record's, the module header's, and the
code's — and only the third was right. It is written down because the first was
written confidently, from the signature of a function that was never read.

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

**Produce the 16-bit band the type already promises, teach the memory model
what it costs, and let TIFF take the parallel path.** Chosen. The workers
already run the same pipeline code the single-threaded loop runs — they call
back into it, which is why there is no second pipeline to drift — so the change
is what the band hands back, what assembles it, and what the thread budget
believes a band weighs. Not how a pixel is computed.

The memory half is not optional and is not a refinement. `perWorkerMb` bills a
band at four bytes a pixel and a 16-bit RGB band is six, so switching TIFF on
without telling it would let the export start more workers than it has measured
room for — on a tablet that is a killed tab and a lost session, which is the
failure that file's whole budget exists to prevent.

The check afterwards is the one 9l-ii established: measure the exported FILE's
bytes, not the screen, and hold the parallel output identical to the
single-threaded output. That comparison is the whole safety of the change and
it is cheap, because both paths still exist.

## Rejected

**Letting TIFF export at eight bits so it can use the existing path.** It would
make the export fast by making it a worse file. Sixteen bits is the reason to
choose TIFF at all.

**Trusting `BandResult.rgb` because it is declared.** A field in an interface is
a promise about a shape, not evidence that anything fills it — and this one is
filled by nothing. Reading the type was what produced this record's first,
wrong mechanism; reading the return statements was what corrected it.

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
