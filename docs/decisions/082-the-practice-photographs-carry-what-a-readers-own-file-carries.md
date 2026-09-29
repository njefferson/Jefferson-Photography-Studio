# 082 · The practice photographs carry what a reader's own file carries

## Context

Asked 2026-09-29: the practice images are revisited, in case they should carry
metadata such as previews.

The 44 practice raws in `public/examples/` are minimal hand-written DNGs:
seventeen tags, no SubIFDs, no EXIF, no MakerNote, no `AsShotNeutral`, and no
embedded preview (IR-SCIENCE.md §7). So a newcomer who opens one from the start
card meets a different app from the one their own camera file opens in:

- no camera and no lens, so no lens correction is offered or applied;
- no preview, so nothing shows until the full decode finishes, where a camera
  file shows its own picture at once;
- no camera white balance to start from.

That is also why every colour, lens and look question here is answered on the
owner's own files instead (hub LESSONS 369).

## Looked up

- **Adobe, Digital Negative (DNG) Specification 1.6.0.0** (2021; found
  2026-09-29). A DNG holds one main image and optionally previews. The
  highest-resolution IFD carries NewSubFileType 0; reduced previews carry
  NewSubFileType 1, and the specification recommends, without requiring, a
  low-resolution thumbnail in the first IFD, with the raw data in a SubIFD
  tree. Preview data may be baseline JPEG. Camera identity, lens and exposure
  are ordinary EXIF, carried in an EXIF IFD as in any TIFF-based file.
- So nothing here needs inventing: a DNG converter already writes this shape,
  and the question is only what these 44 files should carry and what it costs
  to change them.

## Weighed against

- **The files are a fixture as well as a feature.** Forty-four tools under
  `tools/` read `public/examples/`, and several pin numbers measured on these
  exact bytes; new bytes move every one of those numbers, and each has to be
  re-measured rather than re-pinned by hand.
- **The cache.** `EXAMPLES` in `public/sw.js` is the one cache still versioned
  by hand, and only for this: a practice file whose bytes change under the
  same name must bump it, or an installed app keeps the old file.
- **What the files are made from.** 27 of the practice frames have their
  originals among the owner's shared files (tools/owner-images.json), so a
  richer DNG can be made from a real camera file for those, and not for the
  other 17.
- Record 081: the lessons run on these files, and what they show changes
  with what the files carry.

## Depends

- touches 083 — both change what the walks read: this, the practice files
  forty-four tools use; that, the agreement walk's camera-JPEG pair.

## Options

1. **Remake the 27 practice frames that have originals as full DNGs from the
   owner's camera files, with EXIF and an embedded preview, and keep the other
   17 as decode fixtures only.** Chosen.
   - The start card offers only the remade 27, so a newcomer's first file
     behaves like their own.
   - The 17 stay in the repository for the walks that use them for decode and
     geometry, and stop being offered as practice.
   - Every tool whose numbers move is re-measured in the same piece of work,
     and `EXAMPLES` is bumped.
2. Add EXIF and a preview to all 44 as they are.
3. Leave them as they are.

## Rejected

- **2, all 44 as they are.** For the 17 with no original there is no true
  camera, lens or preview to add; anything written would be invented metadata,
  and the lens fix would then apply a correction measured on a different
  file.
- **3, as they are.** The practice path is the first thing a newcomer meets,
  and today it shows them an app without its lens correction or its preview.

## Rank

By its own dependencies: before the lessons (record 081), which run on these
files, and independent of the interface assessment. It moves many walks'
numbers at once, so it goes where nothing ranked just after it is tuning
against those numbers.
