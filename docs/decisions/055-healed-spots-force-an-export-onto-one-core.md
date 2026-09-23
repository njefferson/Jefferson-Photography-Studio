# 055 · Healed spots force an export onto one core, and the budget cannot be measured

## Context

Reported from the device 2026-09-23: an iPad exporting on one thread. The frame
had three healed dust spots on it, and `canRunParallel` refuses any export whose
`params.spots` is non-empty (`src/exportparallel.ts:133`). Three dust spots take
a 21-megapixel export from four threads to one.

**The exclusion targets exactly the photographs most likely to need it.** The
reported frame was shot at ƒ/9, past this body's infrared diffraction limit, and
stopping down is what makes sensor dust visible in the first place. Spot-healing
is the normal case in this app's subject, not an edge one.

**The stated reason does not survive reading.** The module header excludes
"stickers, heal spots and warp, whose assets are bitmaps the worker cannot be
handed cheaply". That is true of stickers — `exportBands` strips
`stickerAssets` before posting — and true of warp, a full-frame field. A
`HealSpot` is five numbers, it already travels inside `params`, and no bitmap is
handed to anybody. One sentence swept three unlike things into one rule.

**What has already shipped, and what is left.** The increment release before
this one fixed four defects found while investigating: the set export was
handing the decoding helpers something that could not be copied, so every
photograph in every set went to one core; the fallback that hid it wrote to a
console no tablet has; both output paths allocated a full-size copy and threw it
away; and the drawing surface an export needs was neither checked nor released.
None of those is this item. This is the spots exclusion itself, and the budget
that decides how many threads may start.

## Looked up

**There is no way for a page to read its own memory on Safari, and there is not
going to be.** WebKit formally opposed `navigator.deviceMemory`
(standards-positions #645), stating that the RAM a device has says nothing about
what a page may use. `performance.measureUserAgentSpecificMemory()` is
Chrome-only, needs COOP+COEP cross-origin isolation this deploy does not send,
and its own explainer says a result may take minutes. `navigator.storage.estimate()`
is bytes on disk. The only memory-pressure interface in WebKit that script can
see is in `Source/WebCore/testing/Internals.idl`, which ships in the test runner
and not in Safari.

**And a page gets no exception when it dies.** Jeff Johnson's measurement
(lapcatsoftware.com, January 2026, iOS 26.2) states it directly: `try`/`catch`
does not help, there is no JavaScript exception to catch. A couple of his runs
froze the iPad hard enough that it appeared to reboot. This is the fact that
decides the shape of everything below — a catchable allocation failure and a
process kill are different events, and only one of them can be handled.

**His headline figures are nominal, not bytes, and must not be budgeted
against.** The test pushes `size * 1024 * 1024` one-character strings into an
array, so "crashes at around 200 MB" on an 8th-generation iPad is about 210
million array slots. At the eight bytes a 64-bit slot costs at minimum that is
roughly 1.7 GB before the strings themselves, and array growth doubles
transiently. So the footprint at death is plausibly two to three gigabytes,
which agrees with the ~2 GB per-process figure in WebKit's own source rather
than contradicting it. The per-slot cost is arithmetic here, not a measurement.

**`navigator.hardwareConcurrency` on Safari is not a core count.** WebKit
returns `numberOfProcessorCores() < 8 ? 4 : 8`, and 4 under script-tracking
protection. So `cores - 1` is exactly 3 or 7 on every iPad, and the "4 GB hint,
6 cores" worked example in the comment above `approvedWorkers` describes a
Chrome device that cannot occur on the target.

**The graphics process is killed far below the page process.** Crash logs from
a 4 GB iPad show `com.apple.WebKit.GPU` killed at 316–522 MB, reason
"highwater" — several times smaller than the figure the page-process number
suggests, and the export draws.

**Two hard limits on the drawing surface, both documented with reproductions**
(pqina.nl): an area cap of 16,777,216 pixels, which a 5568x3712 frame is already
over, and a total across every surface the page holds — 384 MB on Safari 15 —
past which contexts come back null and surfaces draw transparent. Safari also
keeps a surface alive after the last reference to it is gone. The app's own test
page now measures both on the device, because the published figures are from
2022 and the app must not budget against somebody else's iPad.

**The swap file that was asked about is real technology and the wrong fit.**
OPFS with `createSyncAccessHandle` is synchronous, worker-only and POSIX-shaped,
on Safari since 16.4, and is what Photoshop-on-the-web's scratch disk is built
from. But a scratch disk backs a large working set read and written repeatedly;
this app's peak is a few large write-once allocations. Spilling the finished
picture in pieces is exact and bounds nothing, because the encoder is not
streaming — it needs the whole picture resident plus a drawing surface of the
same size, then several more full-size copies while the colour profile and the
metadata are written. Tiling the WORK would bound it and would change the
picture: `glow` normalises against a p99 order statistic taken over the whole
frame, so a tile computes a different threshold and every glowing pixel in it
differs.

**TIFF 6.0 says single-strip output is not recommended** and suggests roughly
8 KB strips so readers and writers can buffer; `writeTiff16` emits
`RowsPerStrip = h` and builds the file in one allocation.

## Weighed against

**036, "A TIFF export uses one core"**, is this item's direct predecessor and
shipped: it put TIFF through the same pool and set the standard this work has to
meet, which is a file identical byte for byte however many threads produced it —
0 of 31,315,842 bytes differed.

**008, "Opening a set on several cores"**, is the same question at the other end
of the loop, and whatever is established here about handing a photograph to
several helpers at once applies there.

**011, "The export drawn rather than computed"**, ships in 3.0 and replaces the
path all of this lives in. That is an argument for doing the cheap correct thing
here and not building a memory architecture inside code with a known end date.

## Depends

- touches 036 — the same pool, the same budget, and the same byte-identical
  standard; a change to either moves the other.
- touches 008 — the decode pool asks the same question about the same device.
- touches 011 — this work lives in the path that item replaces, which bounds how
  much is worth building here.
- distinct-from 054 — both are "the export", and that is the whole reason to say
  so: one is what the buttons on that panel are CALLED and the other is how many
  cores the work behind them uses. They share a surface and nothing else, so
  neither constrains the other and a session meeting them together should not
  treat them as one piece of work.

## Options

**Remove the spots condition, bill heal into the budget, and prove the output is
unchanged — then degrade on what is catchable and ratchet on what is not.**
Chosen. Four parts, and the first three land together because each of the others
is unsafe without them.

The exclusion goes for spots only; stickers and warp stay, because `exportBands`
sends `stickerAssets: undefined` and a helper would render a plausible-looking
photograph with the stickers missing.

Heal must be billed into `perWorkerMb`. Every helper bakes every patch
independently, so heal is per-helper memory the model does not have: three
default spots on a 5600-wide frame is about 0.3 MB each and invisible, but forty
spots at `SPOT_R_MAX` is about 75 MB each, which is 300 MB across four and blows
the 600 MB ceiling on its own.

The proof is a healed-spot arm on `tools/tiff-threads-walk.mjs`, for JPEG as
well as TIFF, at all four rotations, held to 036's byte-identical standard. It
has never been run with spots because the gate refuses them.

And `tools/export-bytes-walk.mjs` must stop using heal to force one thread.
Remove the exclusion and that plant goes vacuously green — still passing, no
longer testing anything.

Then the budget: subtract a main-thread term rather than inflating the total,
halve the pool and retry once on a catchable allocation failure, and record a
marker before the pool starts that is cleared on completion, so a marker found
at the next launch means the last export never came back. That is the only way
this platform lets a page learn a tab was killed, and it may only ever ratchet
down — the same device accepts different amounts on different days.

2. Remove the exclusion and change nothing else. Rejected below.
3. Slice the source per helper to cut the memory instead. Rejected below.
4. Build the OPFS scratch disk that was asked about. Rejected below.
5. Raise the thread cap, since the cap was written when a tablet meant four
   cores. Rejected below.

## Rejected

**2, remove the exclusion and change nothing else.** The budget would then be
wrong in the one direction that kills a tab: forty spots is 300 MB of patches
across four helpers that `perWorkerMb` does not know about. And
`tools/pool-budget-check.mjs` tests with an empty spot list under a comment
asserting that heal's refusal is not about memory — a comment that becomes false
the day this ships, with the check still green.

**3, slice the source per helper.** This is the one that looks like the obvious
memory fix and is a correctness trap, so it is written down rather than merely
not chosen. **Heal is a CLONE, not a local repair.** `bakeRgba8` reads the
source at an offset and `findHealSource` places the source disc 2.4, 3.4 or 4.6
radii away — and the reader can drag it anywhere in the frame. Every spot reads
a second rectangle somewhere else in the picture. Bands work today only because
each helper is handed the whole file and decodes the whole source; heal is
reproducible because the helper already has everything, not because heal is
local. Slice the source and the clamp bites against the slice, baking its edge
into the spot — visible only in the bands whose source lay outside.

**4, the OPFS scratch disk.** A paging layer for buffers that a one-line
adoption removes for free is a cathedral, and it would be built directly in the
path 011 replaces. The honest partial version — a bounded TIFF writer, per
TIFF 6.0's own strip guidance — is worth doing only if measurement after the
allocation fixes still says the 16-bit path peaks.

**5, raise the thread cap.** The cap cannot be raised on evidence that does not
exist: Safari's core count is a privacy constant rather than a measurement, so
the app cannot tell a four-core tablet from an eight-core one, and the figure
that actually kills the tab is invisible and moves between days. Raising it
trades a slower export for a lost one, on a device that gives no warning and no
exception.

**Deleting the unreachable budget branches.** The `deviceMemory >= 16` arms of
`budgetMb()` and `threadCap()` were unreachable in every browser until Chrome
147, so the desktop the comment describes was getting 1000 MB and 4 threads
rather than 1500 and 8. They became reachable this year, so they stay — noted as
untested rather than removed or trusted.

## Rank

**Below the near-term queue's defects, above the new-capability work.** Nothing
ranked above this needs it done first, and nothing above it would have to be
redone once it lands: the mask, selection and look items read pixels and
selections, not the export's thread budget. Being reported does not privilege
it, and the export defects found alongside it have already shipped separately
rather than being carried here.

**And nothing decides its order against its immediate neighbours, which is worth
saying rather than dressing up.** 054 is `distinct-from` this by declaration:
neither has to be done before the other, and neither would have to be redone
afterwards, so the order between them is free and either would be legal. The
capability items below carry no edge to this one either. The first draft of this
section argued the order from how much each one costs a reader — that is
severity, which this repository's ranking rule excludes on purpose, and it read
as a dependency argument while being nothing of the kind.
