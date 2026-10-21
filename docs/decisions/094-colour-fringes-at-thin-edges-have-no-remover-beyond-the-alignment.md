# 094 · Colour fringes at thin edges have no remover beyond the alignment

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the fourth tier of the stages marked missing, by
reach.

**What the references do.** darktable has a defringe module, deprecated in the
version 4.0 manual's order and off by default. RawTherapee has a defringe tool in
its Detail tools (`rtgui/tools/defringe.cc`), and its default raw profile sets
nothing for it. dcraw and LibRaw have none. RawTherapee's method, read from its
source `PF_correct_RT.cc` and recorded in IR-SCIENCE.md 9p: the threshold is a
multiple of the photograph's own mean chroma residual, and the repair weights each
neighbour by one over its own residual plus that mean, so an outlier does not feed
its own replacement.

**What the app does today.** No defringe stage exists anywhere in the source.
What it has for coloured edges is record 061's channel alignment (IR-SCIENCE.md 9v):
red and blue are aligned to green on the mosaic, measured from each photograph, and
the working copy reads red and blue at each quad's centre. That record's Outcome
measured what was left on its test post as a small shift of blue, 0.15 to 0.22
photosite, with the same sign at both edges, so a shift and not blur, and named the
levers still unbuilt: a finer field, or a second pass for blue. It also recorded
that the working copy is softer after the change, and that a device pass is owed.

**What IR-SCIENCE.md says.** Section 4b-ix: several sources say channel swaps
fringe where foliage meets sky; the remedies named are optical, apertures around
f/5.6 to f/8, and the raw converter's chromatic aberration tools. The second is
what 061 built; the first is advice for the next frame.

**The boundary this record must keep.** Record 061's Rejected section rules out a
defringe or saturation guard inside the grade, for the reason that the swap, the
mixer and the saturation amplify whatever residual a grade-side fix leaves, and
rules out a hue-keyed defringe because on a camera that records one colour axis it
cannot tell a fringe from foliage. Both are live boundaries and not history.

**What is not known.** Whether any coloured fringe is left on the reader's own
frames after 061 on a device. That is the pass 061 still owes, and this record's
first act depends on its result.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it.

- **darktable**, the version 4.0 module order page
  (https://docs.darktable.org/usermanual/4.0/en/special-topics/module-order/,
  summary): defringe is listed as deprecated and is not among the eight modules
  marked on by default. The version 5 order list in
  https://raw.githubusercontent.com/darktable-org/darktable/master/src/common/iop_order.c
  (summary) puts defringe at position 31, after the input profile.
- **RawTherapee**, the tools listing
  https://github.com/RawTherapee/RawTherapee/tree/dev/rtgui/tools (summary), which
  names `defringe.cc` among the Detail tools; its default raw profile
  (https://github.com/RawTherapee/RawTherapee/blob/dev/rtdata/profiles/Auto-Matched%20Curve%20-%20ISO%20Low.pp3,
  summary) sets nothing for it.
- **dcraw and LibRaw**: none (`dcraw.c`, `dcraw_process.cpp`).
- **IR-SCIENCE.md** 4b-ix (the swap fringes at foliage against sky), 9p (the
  defringe method, read from source in an earlier session) and 9v (the alignment).
- Optical advice, f/5.6 to f/8, is as IR-SCIENCE.md 4b-ix records it from its
  sources; it was not re-read in this run.

## Weighed against

- **061, red and blue do not line up at thin edges** (archived). Owns the shift
  and the levers still unbuilt, and sets the placement boundary above.
- **066, Aerochrome is rendered from a model of the film** (open, NOTES.md
  roadmap). Its colour re-attachment would be tuned against whatever edge this
  record leaves, which is the reason 061's Rank gave for going first.
- **013, Aerochrome is the right colour and comes out splotchy** (open). The colour
  noise half; a defringe acts on edges and not on blotches.

## Options

1. **Decide on pictures after 061 is seen on the device, and build only what is
   left.** Chosen.
   - Open the reader's own frames at 1:1 at thin dark edges against bright sky under
     Aerochrome, as 061's pass asks. If a fringe is still seen, first try 061's own
     levers (a finer field, a second pass for blue), which stay in that record's
     ground.
   - If what remains is not a shift, a chroma outlier along an edge, build a
     defringe on the demosaiced linear planes before the camera matrix, the swap and
     the mixer. Key it on a sensor plane's difference from green and not on hue, take
     its threshold as a multiple of the photograph's own mean chroma residual and
     weight the repair by the neighbours' own residual, as RawTherapee does, and give
     it a visible strength control that starts off, as in every reference.
   - If nothing is seen, close the record without building it.
   - A `## Looked at` section is owed before any Outcome, and the pictures go to the
     reader because the choice is about how a photograph looks.
2. **A cubic read in the alignment itself, in place of a separate stage.** That is
   061's own unbuilt lever and stays in that record: a cubic read can overshoot at
   an edge and the Aerochrome mixer amplifies an overshoot, so it is judged there.

## Rejected

- **A defringe inside the grade, after the camera matrix.** Record 061 rejected it:
  the swap, the mixer and the saturation amplify whatever residual a grade-side fix
  leaves.
- **A hue-keyed defringe**, which is how darktable's deprecated module and
  RawTherapee's chroma-based tool work. On this camera one colour axis separates
  foliage from sky, and a hue-keyed rule takes foliage for fringe.
- **On by default.** Every reference read leaves it off.
- **The optical advice as the remedy.** Stopping down is guidance for the next
  frame, not a stage for the frame in hand.

## Rank

Fifth in the block, behind the automatic pixel filter (093) and ahead of the mosaic
stages of the next tier (095 to 098). Off by default in every reference read, and the
app already carries the lateral-colour correction the references run first, whose
remainder is small and not yet seen on a device. Its first act is a look at frames
that 061's own pass already asks for, so it costs nothing extra, and it ranks above
the mosaic stages because those have no measured sign that anything is left to fix.

## Depends

- touches 061 — the remainder after the alignment is that record's, and this record waits on its device pass.
- touches 066 — the film model's colour re-attachment would be tuned against whatever edge this leaves.
- touches 013 — that open item owns the colour blotch; this one acts on edges only.
