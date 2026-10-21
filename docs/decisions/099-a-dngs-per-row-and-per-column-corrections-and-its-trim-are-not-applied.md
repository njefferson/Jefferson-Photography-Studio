# 099 · A DNG's per-row and per-column corrections and its trim are not applied

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the sixth and last ranked tier of the stages
marked missing, by reach: stages that apply only to files that carry them.

**What the specification says.** Five opcodes are not applied: DeltaPerRow,
DeltaPerColumn, ScalePerRow and ScalePerColumn (opcodes 10 to 13, pages 100 to 103)
and TrimBounds (opcode 6, page 97). Which of the three opcode lists a file puts
them in decides where in the processing they run: the first list as the raw is read
from the file, the second just after the raw has been mapped to linear values, the
third just after the demosaic (pages 14, 56, 57 and 89). Each opcode carries a flag
that makes it optional, and the values are clipped to the logical range after each.

**What the references do.** Nothing equivalent in dcraw, LibRaw, darktable or
RawTherapee as far as was read.

**What the app does today.** `src/raw/dngOpcodes.ts` applies the gain map, the
polynomial map, the radial vignette fix and the table map; these five are named to
the reader at open, in the notice `skippedOpsNotice` writes in `src/decode.ts`, and
are not applied. A DNG that carries them is rendered without them.

**What is not known.** Whether any of the reader's own DNGs carries one of the five.
The notice would have named it at open, but nobody has counted. TrimBounds is the odd
one: by its name and page 97 it changes which rectangle the picture is, which the
crop, the straighten tool and the preview cache's keys all depend on, so it is read
twice before it is applied. None of the hint tags the comparison lists (IR-SCIENCE.md
9w) belongs to this stage.

## Looked up

The specification was read as pdf pages, which is the reading itself.

- **The DNG specification, version 1.6.0.0**, December 2021, at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf: pages 14, 56, 57 and
  89 (the three lists and their position), 97 (TrimBounds) and 100 to 103 (the four
  per-row and per-column opcodes). Adobe's own copy of 1.7.1.0 answered HTTP 403, so
  the 1.7 additions are unread.
- **dcraw, LibRaw, darktable and RawTherapee**: no corresponding stage in
  `dcraw.c`, `dcraw_process.cpp`, the darktable order lists or the RawTherapee
  default profile (summaries through the fetch tool).

## Weighed against

- **A DNG's bad-pixel opcodes (record 092)** (this block). The same opcode reader, the same
  notice and the same lists; if that record lands, these five go in beside the two
  it applies.
- **090, lens distortion** (this block). The third list is where its opcodes live as
  well.
- **009, the editor's working copy at native resolution** (open, NOTES.md roadmap).
  TrimBounds would change the size the working copy is built to.

## Options

1. **Count first, then apply the five where the file's lists put them.** Chosen.
   - Read the opcode lists of the reader's own DNGs and count the files that carry
     any of the five. If none does, close the record as not owed.
   - If some do, apply them in the order each list gives, with the optional flag
     honoured, clipping after each, and the notice dropping the names of those that
     apply. The per-row and per-column four are a vector for each plane and are cheap.
     TrimBounds comes last and alone, because it changes the rectangle.
   - No control: these are the file's own instructions and the original file is never
     changed. The diagnostic names which opcodes applied.
2. **Apply all five at once without counting.** For files nobody has shown to exist.
3. **Say nothing about them.** The notice is the honest account of what was left out.

## Rejected

- **Applying all five without counting.** Option 2 above: the work is not owed if no
  file carries them.
- **Dropping the notice for them.** A file that carries them would no longer tell the
  reader the picture is not as the file's maker described.

## Rank

Tenth in the block, the lowest ranked tier. It applies only to files that carry the
opcodes, no reference read has an equivalent to compare against, and the count that
sizes it is unmade. It is behind the mosaic noise stage
(098), which can matter to every photograph if it matters at all.

## Depends

- touches 090 — the third list is where that record's opcodes live as well.
- touches 009 — TrimBounds would change the size the working copy is built to.
