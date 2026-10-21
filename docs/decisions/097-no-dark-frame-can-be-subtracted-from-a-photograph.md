# 097 · No dark frame can be subtracted from a photograph

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the fifth tier of the stages marked missing, by
reach. This is the one stage in the block that needs something the reader would
have to make: a frame shot with the lens capped, at the settings of the photograph.

**What the references do.** dcraw subtracts a dark frame when given a file (`-K`),
and LibRaw does when one is set, in both cases before the colours are scaled
(`dcraw.c`, `dcraw_process.cpp`). RawTherapee has a dark-frame panel with a file
chooser, a reset button and an auto-select checkbox, and nothing is set by default
(`rtgui/tools/darkframe.cc`); with no file chosen it reports none. A RawPedia
description, as a search tool summarised it and not fetched, says the hot photosite
positions in a dark frame are always corrected. darktable's order list names no such
stage.

**What the app does today.** Nothing. No part of the decode takes a second frame.

**Why the case is thin here.** IR-SCIENCE.md has no statement about it. The reader's
infrared work is daylight work, so the exposures are short, and whether a fixed
pattern or a set of hot photosites exists at those exposures has not been measured.
The stage needs a file the reader makes and a defect nobody has shown, which is the
reverse of the position of the stages above it in this block.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it.

- **dcraw**, https://raw.githubusercontent.com/ncruces/dcraw/master/dcraw.c (a
  GitHub mirror; the original host answered HTTP 503): the dark frame is subtracted
  only with `-K` and a file, before `scale_colors` (summary).
- **LibRaw**, `src/postprocessing/dcraw_process.cpp`: the dark frame is subtracted
  if set, before `adjust_bl` and the black subtraction (summary).
- **RawTherapee**, https://github.com/RawTherapee/RawTherapee/blob/dev/rtgui/tools/darkframe.cc
  (summary): the panel above. RawPedia's pages for it
  (rawpedia.rawtherapee.com, rawpedia.pixls.us) were not reachable in this run, so
  its text is a search summary only.
- **darktable**: the order lists read (the version 4.0 manual page and
  `iop_order.c`) carry no dark-frame stage.

## Weighed against

- **096, a general line-noise filter, and 093, an automatic hot and dead pixel
  filter** (this block). Both aim at a pattern a dark frame would also remove; if
  either is built, a dark frame is probably not owed.
- **063, a shared look file cannot be picked on an iPad** (open, NOTES.md roadmap).
  A second frame is a second file for the reader to pick on a tablet.

## Options

1. **Build nothing now; keep the item as a decision to close.** Chosen. The cheaper
   measurements in 093 and 096 come first. A dark frame is owed only if they find a
   fixed pattern that repeats from frame to frame and the reader would shoot the
   frames. If both come back empty, this record is closed as not owed.
   - If it is ever built: a reader-supplied file, subtracted from the mosaic after
     the black level and before the alignment, with a visible control and the
     original never changed, and the picking and matching rules decided then on a
     tablet.
2. **Build RawTherapee's panel now.** A file picker, a matching rule and a frame to
   shoot, for a defect nobody has shown.

## Rejected

- **Building it now.** Above.
- **Using the DNG's masked areas as a dark reference.** The specification offers
  them for measuring black (page 42) and calls support optional; a measurement of
  the black level is not a dark frame, and this record does not claim otherwise.
- **Inferring a dark frame from the photograph.** That is the automatic filters of
  093 and 096.

## Rank

Eighth in the block, third of the fifth tier, which is ordered as the comparison
lists it. It ranks behind the line-noise filter (096) because it depends on that
record's and 093's measurements and needs the reader to shoot a frame; it is ahead of
the mosaic noise stage (098) only by that listing order.

## Depends

- touches 096 — a dark frame is the other route to the fixed part of a pattern.
- touches 093 — and to a set of stuck photosites.
- touches 063 — a second frame is another file to pick on a tablet, with that record's picker problems.
