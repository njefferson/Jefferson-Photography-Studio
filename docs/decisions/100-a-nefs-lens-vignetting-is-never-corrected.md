# 100 · A NEF's lens vignetting is never corrected

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the NEF half of the lens-profile vignetting
stage. The comparison marks it missing but does not rank it among the six tiers,
so this record gives its own reason for its place, below.

**What the references do.** darktable's lens module corrects vignetting along with
distortion and chromatic aberration from the Lensfun library, and the version 4.0
manual's order marks it off by default. RawTherapee's default raw profile has a
LensProfile section with LcMode lfauto and UseVignette true, so it corrects
vignetting for every raw file through Lensfun. The DNG specification carries the
correction in the FixVignetteRadial opcode (opcode 3, page 94): a gain of one plus
radial terms in even powers of the radius from the second to the tenth, about an
optical centre. Adobe's default is per camera and lens and was not read for the
Nikon Z 50 (Adobe's help pages answered HTTP 403). dcraw and LibRaw have none.

**What the app does today.** For a DNG, `FixVignetteRadial` and the gain map are
applied (`src/raw/dngOpcodes.ts`). For a NEF there is no vendor vignette correction
and no table. The per-lens flat that `src/lensflat.ts` lays on the linear raw at
decode is a hot-spot correction measured from the reader's own flats, and
IR-SCIENCE.md says in terms that a hot spot is not a vignette: a vignette darkens
the corners, a hot spot brightens the middle, and the one must not be reasoned about
as the other.

**What is genuinely open.** The stored flat is a ratio against a reference ring, so
it may already lift the corners as a side effect on a lens that has a profile.
IR-SCIENCE.md 9d measures the shipped table's normalisation; whether the table's
corner values carry natural fall-off was not read in this run. And for a lens with no
profile, nothing is corrected at all. Nobody has measured the corner fall-off on the
reader's own NEFs with the flat on and off.

**Whether to correct it is also a taste question.** A darkened corner is part of how
many photographs look, which is why darktable leaves its correction off and
RawTherapee turns it on: the sources split.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it. The specification was read as pdf pages.

- **darktable**, the version 4.0 order page
  (https://docs.darktable.org/usermanual/4.0/en/special-topics/module-order/,
  summary) and the lens correction page
  (https://docs.darktable.org/usermanual/stable/en/module-reference/processing-modules/lens-correction/,
  summary).
- **RawTherapee**, the default raw profile
  (https://github.com/RawTherapee/RawTherapee/blob/dev/rtdata/profiles/Auto-Matched%20Curve%20-%20ISO%20Low.pp3,
  summary).
- **The DNG specification, version 1.6.0.0**, page 94 (FixVignetteRadial), at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf, read as pdf pages.
- **Adobe**: community threads only (community.adobe.com, summary); they do not name
  Nikon.
- **IR-SCIENCE.md** line about the hot spot being no vignette (section 1), 9c and 9d
  (the flat's placement and its normalisation), and the passage that notes the DNG
  radial opcode and Lensfun both carry an optical centre.
- Whether a Nikon NEF carries vignette data of its own was not read in this run.

## Weighed against

- **090, lens distortion** (this block). The same question of where a NEF's lens
  data would come from; the database option is shared.
- **021, the lens flat on the linear raw** (archived, NOTES.md "The lens flat is laid
  on the linear raw at decode, 2026-09-18 (decision 021, 2.52)"). The stage whose
  corner behaviour the first measurement reads.
- **085, the lens correction whitens bright centre foliage** (open, NOTES.md
  roadmap). The strength of that flat; not this stage.

## Options

1. **Measure the corner fall-off first, with the flat on and off, on the reader's own
   NEFs.** Chosen.
   - Take a flat sky or wall in the reader's own NEFs, on a lens with a matched
     profile and on one without, and read the luminance from the centre to the corner
     on the linear data with the lens correction at 0 and at its default. If the flat
     already removes the fall-off, or the fall-off is slight, close the record as not
     owed.
   - If a fall-off is left on lenses with no profile, decide the source of the
     correction: a model measured from the reader's own flats, which the existing rig
     already knows how to make, or a database shared with record 090. Build it with a
     visible strength control that starts off, on pictures, because whether a darkened
     corner is a flaw is a matter of how the photograph looks. A `## Looked at`
     section is owed before any Outcome.
2. **A lens database for every raw file.** Shared with record 090's second option and
   decided there.
3. **Reuse the hot-spot flat as the vignette correction.** Only if the first
   measurement shows it already does the job.

## Rejected

- **Treating the hot-spot flat as a vignette correction now.** IR-SCIENCE.md says it
  is not one; the first measurement is what could show otherwise.
- **On by default for every NEF.** darktable leaves it off, RawTherapee turns it on,
  and the question is partly taste.
- **Constants for the Z 50 invented here.** No data for the reader's lenses was read.

## Rank

Last of the block, eleventh. The comparison marks it missing and ranks it nowhere, so
the reason is this one's own. The DNG half is already applied. The NEF half may be
partly covered by the flat the app already lays, and nothing measured says how much.
A corner that darkens is not a defect in the way a hot spot is, and the two sources
that decide the default disagree. And any build past the measurement waits on the
question record 090 holds, where a NEF's lens data would come from. So the measurement
is the only part ready, and it ranks last because nothing yet says it will find
anything.

## Depends

- touches 090 — the same question of where a NEF's lens data would come from; the database option is shared.
- touches 021 — the flat that record placed is the stage whose corner behaviour the first measurement reads.
- distinct-from 085 — that record is the strength of the hot-spot flat, which is no part of this stage.
