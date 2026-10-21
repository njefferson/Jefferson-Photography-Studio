# 093 · No filter looks for hot and dead photosites on the mosaic

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the third tier of the stages marked missing, by
reach, with the bad-pixel opcodes of record 092. That record is the file's own
list; this one is a filter that finds stuck photosites by looking at their
neighbours.

**What the references do.** darktable has a hot pixels module at position 6 of its
order, before the demosaic, and the version 4.0 manual's key marks it off by
default. RawTherapee has a hot-pixel checkbox and a dead-pixel checkbox with a
threshold adjuster from 20 to 200 starting at 100 (its `preprocess.cc` panel),
neither checked in the panel's constructor, and its default raw profile sets no
such key. dcraw and LibRaw have no automatic filter. So every reference read
leaves it off by default.

**What the app does today.** Nothing on the mosaic. `src/heal.ts` offers a finder
for dust and hot pixels that the reader invokes on the finished picture (about
lines 805 to 835): it works after the demosaic has spread a stuck photosite over
its neighbours and after the mixer has multiplied it, on one photograph at a time.

**What IR-SCIENCE.md already says.** Sections 4c-ix and 4c-x measured the pale
pepper in a deep sky and found it is not impulse noise: a decision-based median
did not reach it, and the structure is a dense mottle two to four pixels across,
correlated at the scale of the colour mosaic. Section 4c-xxii then fixed the speckle
downstream by widening the luminance filter. Those measurements were made after the
demosaic. Nothing measured photosites on the mosaic, so whether any of the reader's
frames carry a few stuck photosites that the demosaic and the mixer then enlarge is
open.

**What is not known.** How many photosites in the reader's own raws are isolated
outliers on the mosaic, and whether any is visible in the finished picture.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it, so a list or a number from one is as that tool returned it.

- **darktable**, the version 4.0 module order page
  (https://docs.darktable.org/usermanual/4.0/en/special-topics/module-order/,
  summary): hot pixels sits before the demosaic and is not among the eight modules
  marked on by default; the source order list `src/common/iop_order.c`
  (https://raw.githubusercontent.com/darktable-org/darktable/master/src/common/iop_order.c,
  summary) puts it at position 6.
- **RawTherapee**, https://github.com/RawTherapee/RawTherapee/blob/dev/rtgui/tools/preprocess.cc
  (summary): the two checkboxes and the threshold; and its default raw profile
  (https://github.com/RawTherapee/RawTherapee/blob/dev/rtdata/profiles/Auto-Matched%20Curve%20-%20ISO%20Low.pp3,
  summary), whose RAW section holds one key, CA true, and no hot or dead pixel key.
  The checkbox defaults in `rtengine/procparams.cc` are unread: the page is cut at
  1000 of 5496 lines and the raw host that serves the rest was held.
- **dcraw and LibRaw**: no automatic hot-pixel filter in `dcraw.c` or
  `dcraw_process.cpp` (summary).
- **IR-SCIENCE.md** sections 4c-ix, 4c-x, 4c-xxii and 9p. Section 9p records how the
  field tells an isolated outlier from a region: darktable's hot-pixel module
  counts agreeing neighbours (manual read), as do ROAD and the Hampel identifier;
  RawTherapee's defringe takes its threshold as a multiple of the photograph's own
  mean residual.
- RawPedia's description of the filter (a pixel is replaced by a neighbourhood
  average) is a search summary only; the page was not fetched.

## Weighed against

- **092, a DNG's bad-pixel opcodes** (this block). The file's list is certain and
  goes first; this filter guesses.
- **013, Aerochrome is the right colour and comes out splotchy** (open, NOTES.md
  roadmap). The open item that owns what the noise stages leave in a sky; a filter
  that removed isolated photosites would change what 013 measures.
- **061, red and blue do not line up** (archived). The alignment reads by bilinear
  read and would spread a stuck photosite, so the filter goes before it.
- **Dust and spot removal** (archived, NOTES.md "Shipped (roadmap archive)", the
  entry that heals sensor dust and hot pixels). The tool the reader invokes by
  hand on the finished picture; this record asks for a stage before the demosaic
  and does not replace it.

## Options

1. **Count first, on the mosaic, and look.** Chosen.
   - For each of the reader's own raws, count the photosites that differ from their
     same-colour neighbours the way a stuck photosite does, by counting agreeing
     neighbours (darktable's rule, ROAD, the Hampel identifier) with a threshold
     taken from the photograph's own noise and not from a constant.
   - Render the frames at 1:1 with those photosites repaired and not repaired, open
     both, and send the pictures if the choice is about how a photograph looks. The
     filter is built only if a defect a reader would see is there. A `## Looked at`
     section is owed before any Outcome.
   - If it is built, it runs on the mosaic after the black subtraction and before the
     channel alignment and the demosaic, repairs from same-colour neighbours, and
     carries a visible strength control that starts off, as in every reference, or
     starts on if the pictures show it is wanted, so that it is visible and undoable
     as the at-open ruling requires.
2. **RawTherapee's pair of checkboxes with a fixed threshold of 100.** Not chosen: a
   constant fitted to someone else's sensor, where this app's other automatics take
   their scale from the photograph.
3. **The heal tool as it is.** It stays for dust. It is not the remedy for a defect
   that would be in every frame.

## Rejected

- **On by default now.** Every reference read leaves it off, and the one measurement
  in the record (4c-x) says the pepper it was suspected of was not impulse noise,
  though that was measured after the demosaic.
- **Building it from the pictures the heal tool finds.** That finder works on the
  finished picture, after the demosaic and the mixer have enlarged the defect.
- **A median over the mosaic.** 4c-x measured a median failing on a mottle that
  fills its window; on the mosaic a red or blue photosite's same-colour neighbours
  are twice as far apart.

## Rank

Fourth in the block, behind the file's own list (092) and ahead of defringe (094).
Off by default in every reference read, with no measurement in this repository
showing the reader's frames carry a stuck photosite, so it ranks on a count that
costs little, not on a known defect. It sits behind 092 because that one needs no
guess.

## Depends

- touches 092 — the same photosites; the file's list goes first.
- touches 013 — that open item owns what noise stages leave in a sky, which this filter would change.
- touches 061 — the alignment reads by bilinear read and would spread a stuck photosite, so the filter goes before it.
