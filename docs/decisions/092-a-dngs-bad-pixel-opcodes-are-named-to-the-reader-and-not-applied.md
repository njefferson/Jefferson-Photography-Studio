# 092 · A DNG's bad-pixel opcodes are named to the reader and not applied

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the third tier of the stages marked missing, by
reach, and the first of two records about defective photosites: this one is the
file's own list, and the next (093) is a filter that guesses.

**What the specification says.** Defective pixels can be handled two ways: mapped
out before the file is stored, or carried as a bad-pixel opcode in the first
opcode list (page 13). That list is applied "to the raw image as read directly from
the file", before the second list's mapping to linear values and the third list's
demosaic (pages 14, 56, 57 and 89). FixBadPixelsConstant (opcode 4) marks bad
photosites by a constant value and FixBadPixelsList (opcode 5) lists points and
rectangles, both for Bayer data (pages 95 and 96). The coordinates and the Bayer
phase are defined on those pages, and the build reads them again.

**What the references do.** dcraw and LibRaw remove zeroes when told zero is bad,
and fix bad pixels only when given a map (dcraw's `-P` with a file). RawTherapee
reads a bad-pixel list kept in a file named after the camera's make and model
(search summary, the page was not fetched). In every reference the default is off
unless a map or a list is present, and a DNG that carries the opcode is a file
that carries its list.

**What the app does today.** `src/raw/dngOpcodes.ts` applies the gain map, the
polynomial map, the radial vignette fix and the table map. The two bad-pixel
opcodes are named to the reader at open, in the notice `skippedOpsNotice` writes in
`src/decode.ts`, and are not applied. There is no map reader. A DNG that carries a
list therefore renders the defects the file says to repair.

**Why it applies in infrared.** The mosaic is the same sensor in infrared, and
IR-SCIENCE.md has no statement against repairing it.

**What is not known.** Whether any of the reader's own DNGs carries either opcode.
The notice already names skipped opcodes at open, but nobody has counted. A
utility README by Eric Chan, 16 February 2012
(https://people.csail.mit.edu/ericchan/tmp/FixBadPixels.pdf, read as pdf pages),
describes writing the opcode into a DNG for a sensor whose defects can make a bad
partial column and says the opcode needs a reader that supports DNG 1.3 or later.
It is a utility README and not part of the specification.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it. The specification and the README were read as pdf pages, which is
the reading itself.

- **The DNG specification, version 1.6.0.0, December 2021**, at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf, pages 13, 14, 56,
  57, 89, 95 and 96. Adobe's own copy of 1.7.1.0 answered HTTP 403.
- **dcraw** (https://raw.githubusercontent.com/ncruces/dcraw/master/dcraw.c, a
  GitHub mirror; the original host answered HTTP 503) and **LibRaw**
  (`src/postprocessing/dcraw_process.cpp` on the LibRaw repository), both in the
  order `remove_zeroes`, then `bad_pixels`, then the dark frame, and in LibRaw's
  case then the black subtraction (summary).
- **Eric Chan's FixBadPixels README**, address above, pages 1 to 5.
- **RawTherapee's bad-pixel list**: search summary only.

## Weighed against

- **093, an automatic hot and dead pixel filter** (this block). The same
  photosites; the file's list is certain and goes first.
- **061, red and blue do not line up** (archived). The alignment reads red and blue
  by a bilinear read of their own lattices, which would spread a flagged photosite
  into its neighbours, so the repair goes before it.
- **099, a DNG's per-row and per-column corrections and its trim** (this block).
  The same opcode reader and the same open-time notice.
- **021, the lens flat on the linear raw** (archived). The flat is laid after the
  decode, so a repair at the start of the DNG path is ahead of it too.

## Options

1. **Count first, then apply both opcodes at the start of the DNG path, before the
   channel alignment and the lens flat.** Chosen.
   - The first act reads the opcode lists of the reader's own DNGs and counts how
     many carry opcode 4 or 5. If none does, the record is closed as not owed and
     the bullet leaves the queue.
   - If some do, each flagged photosite is repaired by the rule on pages 95 and
     96, read when it is built, in the place the first list puts it. The
     diagnostic prints how many photosites were repaired, as the Channel alignment
     line does, and the notice drops these two names.
   - No control. The file's own list is the instruction, no reader wants a flagged
     photosite back, and the original file is never changed.
2. **A bad-pixel file named for the camera**, as RawTherapee reads. Not first: it
   needs a list that exists, and none is in hand for the cameras the app records;
   finding one is 093's ground.

## Rejected

- **Leaving the notice.** The notice says what was left out and gives nothing to
  do about it, for a correction the file itself asks for.
- **A switch.** Nothing a reader would choose between: the alternative is a
  stuck photosite in the picture.
- **Folding it into the automatic filter (093).** That one infers; this one reads
  a list. They differ in certainty, in default and in what a reader is told.
- **Applying them with the lens flat or later.** A bilinear read after the alignment
  has already moved a flagged value into its neighbours.

## Rank

Third in the block, behind the profile tables (091) and ahead of the automatic
filter (093). It is the one correction in this block that the file itself tells a
reader to make, and it is small if the opcodes are present. Its reach is only files
that carry them, and that count is unknown, so it sits behind the two stages that
change every photograph of their kind. It is ahead of 093 because it needs no
guess.

## Depends

- touches 093 — the same photosites; the file's list is certain and goes first.
- touches 061 — the alignment reads by bilinear read and would spread a flagged photosite, so the repair goes before it.
- touches 099 — the same opcode reader and the same open-time notice.
- touches 021 — the lens flat is laid after the decode, and the repair goes ahead of it.
