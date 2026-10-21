# 090 · Lens distortion is never corrected, and a DNG that says how is told it was left out

## Context

This comes from a stage-by-stage comparison of what dcraw, LibRaw, darktable,
RawTherapee and the DNG specification run on a raw file against what this app
runs, made in October 2026 from documents read in one run, with no photograph
opened and no render made (IR-SCIENCE.md, section 9w). It is the first of the
stages that comparison marks missing, ranked by how much a photograph would
change. The ranking is an ordering of reach from each stage's description and
the defaults below, not a measurement.

**What the app does today.** Nothing moves pixels to undo the lens's shape. A DNG
that carries one of the specification's distortion opcodes (WarpRectilinear,
WarpRectilinear2 or WarpFisheye) is told at open, by the notice that
`skippedOpsNotice` and `decodeNotice` in `src/decode.ts` write, that the
correction is not applied, and the picture is shown as the lens drew it. A NEF
has no way to carry such a term and nothing looks one up. Record 061 built one
half of what those opcodes' per-plane terms can do: red and blue are aligned to
green, measured from each photograph's own mosaic, always on. The half that
moves all three colours together, the lens's shape, is what this record is about.

**Why it applies in infrared.** IR-SCIENCE.md section 2 says crop, straighten and
lens geometry carry over untouched in infrared, so the stage is not one that
infrared sets aside.

**Where it would land.** The specification carries lens corrections in the third
opcode list, applied just after the raw is demosaiced, and says such processing
ideally runs on demosaiced data (pages 14, 56, 57 and 89). darktable's lens
module sits at position 13 in its order, after the demosaic at 8. So this is not
the place record 061 used: a resample across a Bayer lattice would mix the
colours, and the correction belongs after the demosaic. The app has a demosaiced
picture in two places only, the export's tiled demosaic and the editing copy's
collapse of each two-by-two quad, so the correction would have to land in both,
and the editing copy's size and the export's drawing are what records 009 and 011
may change.

**What is not known.** How much distortion the reader's lenses carry in a picture
the reader would see: nobody has measured it, and no render was made. Whether a
visible-light profile's colour terms hold at infrared wavelengths: nothing read
says. That second unknown is why the chosen option below takes only the term the
three colours share.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of the page, so a list or a number from one is as that tool returned it
and is marked summary. The specification was read as pdf pages, which is the
reading itself.

- **The DNG specification, version 1.6.0.0, December 2021, 109 pages**, at
  https://paulbourke.net/dataformats/dng/dng_spec_1_6_0_0.pdf, read as pdf pages
  (Adobe's own copy of version 1.7.1.0 at helpx.adobe.com answered HTTP 403, so
  the 1.7 additions are unread). WarpRectilinear (opcode 1) holds per-plane radial
  and tangential coefficients about an optical centre and "can be used to correct
  geometric distortion and lateral (transverse) chromatic aberration"; WarpFisheye
  (opcode 2) is the same for an unwrapped fisheye; WarpRectilinear2 (opcode 14,
  new in 1.6) has radial terms up to the fourteenth power, an optional division
  form and a valid radius range (pages 90 to 94 and 104 to 106). OpcodeList3 is
  applied just after the raw has been demosaiced. Flag bit 0 makes an opcode
  optional and bit 1 lets a preview skip it; a WarpRectilinear or WarpFisheye that
  immediately follows an optional WarpRectilinear2 is dropped (pages 14, 56, 57
  and 89).
- **darktable**, the version 4.0 manual's module order page,
  https://docs.darktable.org/usermanual/4.0/en/special-topics/module-order/
  (summary): the lens correction module runs after the demosaic, and the page's
  key marks exactly eight modules as on by default, none of them the lens
  correction. The module's own manual page,
  https://docs.darktable.org/usermanual/stable/en/module-reference/processing-modules/lens-correction/
  (summary), says it corrects lens distortion, transverse chromatic aberration and
  vignetting from the Lensfun library. Its source, `src/iop/lens.cc`, was read to
  its first 200000 characters (summary): all three corrections are set up and no
  auto-apply preset appears; the manual settles the default as off.
- **RawTherapee**, https://github.com/RawTherapee/RawTherapee/blob/dev/rtgui/options.h
  and `options.cc` name the bundled profile "Auto-Matched Curve - ISO Low" as the
  default for raw files; that profile,
  https://github.com/RawTherapee/RawTherapee/blob/dev/rtdata/profiles/Auto-Matched%20Curve%20-%20ISO%20Low.pp3
  (summary), has a LensProfile section with LcMode lfauto, UseDistortion true,
  UseVignette true and UseCA false. RawTherapee therefore corrects distortion and
  vignetting through Lensfun for every raw file by default, and leaves the lens
  profile's own chromatic correction off while its raw-tab correction is on.
- **Adobe Camera Raw and Lightroom**: not settled from Adobe's own help pages,
  which answered HTTP 403. Two threads on community.adobe.com (summary) say the
  lens profile and Remove Chromatic Aberration are applied at import for most
  mirrorless lenses and that an Adobe employee called it as designed; neither
  names Nikon.
- **dcraw and LibRaw** have no lens correction (dcraw.c, `dcraw_process.cpp`).
- **IR-SCIENCE.md** section 2 (geometry carries over) and section 9v (the
  alignment record 061 built).

## Weighed against

- **061, red and blue do not line up at thin edges** (archived, NOTES.md
  "Shipped (roadmap archive)"). Built the lateral-colour half from the file's own
  mosaic. This record must not correct the same shift a second time.
- **021, the lens flat on the linear raw** (NOTES.md "The lens flat is laid on the
  linear raw at decode, 2026-09-18 (decision 021, 2.52)"). A brightness correction
  on the mosaic; this one moves pixels after the demosaic.
- **085, the lens correction whitens bright centre foliage** (open, NOTES.md
  roadmap). The strength of the hot-spot flat; no part of this stage.
- **009, the editor's working copy at native resolution, and 011, the export drawn
  rather than computed** (open, NOTES.md roadmap). Together they decide the two
  places this correction lands.
- **082, the practice photographs carry what a reader's own file carries** (open,
  NOTES.md roadmap). A test of a lens correction needs a frame that names its
  camera and lens.
- The crop and straighten tools already resample geometry. Whether their
  resample could carry a radial term, so that one resample serves both, was not
  read in this run.

## Options

1. **Apply a DNG's own distortion terms, the part shared by the three colours,
   after the demosaic, on the editing copy and on the export, and leave the
   colour part to record 061's measured alignment.** Chosen.
   - Take the green plane's coefficients for all three planes. Apply
     WarpRectilinear, WarpRectilinear2 and WarpFisheye as the specification
     defines them, honour the optional bit and the skip rule, and let an
     optional opcode the app cannot apply stay a notice.
   - On for a file that carries the terms, because the file's maker wrote the
     instruction; with a visible switch to turn it off, since it moves where
     things sit in the picture and a reader cropping or straightening should be
     able to see the uncorrected frame. The switch is an `EditParams` field: five
     places, and the sixth, `stampOf`, if a look writes it. It does not ride a
     saved look; it is per-shot corrective, excluded like white balance.
   - The diagnostic names which opcode applied. The notice for these three
     opcodes goes when they apply. The preview cache number moves, because the
     decode files it hashes change.
   - Before it is built, the opcode lists of the reader's own DNGs are read (the
     open-time notice already names them), and the default is decided on pictures:
     the reader's own frames that carry a term, rendered with and without, opened
     whole and at the edges, and sent as pictures, because the choice is about
     how a photograph looks. A `## Looked at` section is owed before any Outcome.
2. **A lens database for every raw file, NEFs included**, as darktable and
   RawTherapee do through Lensfun. A second step, after the first is seen on the
   reader's own frames: the app is offline-first, so a database would ship with
   it, and its size, its licence and its coverage of the reader's lenses were not
   read in this run.
3. **Distortion measured per lens from the reader's own frames**, as the hot-spot
   rig measures a flat. A third step; it needs a target and a rig the app does not
   have.

## Rejected

- **Applying the opcodes' per-plane terms as given.** That is a second
  lateral-colour correction on top of record 061's measured alignment, and the
  two would disagree and correct twice. Nothing read says a visible-light profile's
  colour terms hold in infrared; the alignment is measured from the file itself.
- **Doing it on the mosaic with the channel alignment.** A resample across a
  Bayer lattice mixes colours; the specification carries lens corrections after
  the demosaic and darktable runs its lens module after it.
- **Leaving the notice and doing nothing.** The file carries an instruction,
  RawTherapee applies this for every raw file by default, and the notice tells the
  reader the picture differs from what the file's maker intended with no way to
  act on it.
- **A database for every raw file as the first step.** darktable leaves the
  correction off and RawTherapee turns it on, so the sources split; no database
  was read; and the first option needs none.

## Rank

First of the block this comparison adds, after the export drawn rather than
computed (011) and ahead of the HSL panel (084). It carries the most reach of the
stages the comparison marks missing: it moves pixels, by the most at the corners,
and RawTherapee applies it by default to every raw file. It is behind 009 and 011
because those two reshape the editing copy and the export, the two places the
correction must land, and building it first would land it on a working copy and an
export that are about to change. It is ahead of 084 because that record is a panel
over existing controls and changes no stage. A measurement of how much distortion
the reader's lenses carry could move it either way, and none exists.

## Depends

- touches 009 — the correction lands on the editing copy, whose size that record would change.
- touches 011 — and on the export, which that record would draw through the shaders.
- touches 061 — the lateral colour half is that record's measured alignment; this one applies only the shared term.
- distinct-from 021 — that record moved a brightness correction on the mosaic; this one moves pixels after the demosaic.
- distinct-from 085 — that record is the strength of the hot-spot correction, which is no part of this stage.
- touches 082 — a test needs a frame that names its camera and lens, which that record makes of the practice set.
