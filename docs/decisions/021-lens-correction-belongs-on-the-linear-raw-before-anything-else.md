# 021 · The lens correction belongs on the linear raw before anything else is measured or graded

## Context

Raised on 2026-09-18: the hot-spot correction is calculated on top of other
operations, where it ought to remove the hot spot from the original data
before any operation works on pixels that carry the error, because every
later stage magnifies what then has to be taken out. Not necessarily
automatic; in the correct place. What the app does today (`compileEdit`,
`src/pipeline.ts`): the measured curve is a per-pixel gain applied inside the
compiled edit, after the white balance and immediately before the camera
matrix, the channel swap, the hue rotation, the look's saturation and its
mixer — inside the grade. The automatics measured at open (gray-world white
balance, auto exposure, the denoise measurement) and the sky selection built
by the decode worker all read the UNCORRECTED decode, so a frame's balance is
found on data the correction then moves (IR-SCIENCE 9d: the shipped curves
are not area-neutral, +1.5% to +3.8% red-against-blue, and nothing downstream
puts the balance back).

## Looked up

IR-SCIENCE 9c already carries the placement from four references and it is
one sentence: RawPedia — "flat-field correction is performed only on linear
raw data in the beginning of the imaging pipeline and does not introduce
gamma-induced shifts", raw files only. The DNG specification carries lens
shading as a GainMap in OpcodeList2: linear raw, after black subtraction,
BEFORE demosaic. Lightroom applies lens profiles during raw conversion,
before creative edits. darktable's order is demosaic, denoise, lens
correction, with tones compressed only at the end of the pipe, because that
is what makes the algorithms predictable. The invariant all four share: the
correction finishes before the grade. The same section names what the
placement has to control — clipping near the white level (RawTherapee ships a
Clip Control for it), scene dependence of a stored strength (Kolari; Rob
Shea in 9h says a single stored corrector cannot be right because the spot
moves with the light), the flat's dependence on focal DISTANCE which the
match does not carry, and the smoothing of the flat before use (RawPedia's
default blur radius 32; this app indexes 80 hard bins without interpolation).

## Weighed against

- **015, the centre washes out — the lens correction against the reference**:
  the same stage, measured from the other side (what it removes from the
  foliage: 37% of red-against-blue in the middle of the frame under
  Aerochrome, 9d). Moving the stage does not settle 015's strength question;
  it settles where the strength acts.
- **018, one sky selection built at open**: the decode worker builds the
  selection from the undegraded decode a moment after the picture. If the
  correction moves to the decode, the selection and every automatic read
  corrected data — which is the point — and the order inside the worker is
  the thing to hold.
- **The at-open ruling** (CLAUDE.md, "What opens applies"): every automatic
  lands on a visible, undoable slider and the untouched decode stays one
  press away. A correction applied at decode keeps that only if the
  uncorrected copy is kept (or re-decodable) and the strength slider
  re-applies from it.
- **The four reconstructions of one photograph** (agreement walk): the open
  path, the tile, the batch and the export each rebuild the edit; the
  correction must move in all four or the walk goes red, which is what it is
  for.
- **The preview cache**: a preview is rendered from the decode; a change here
  changes every cached preview and takes the pipeline number with it.

## Options

1. **Apply the correction at decode, on the linear working copy, before the
   automatics and the selection are measured** — one radial pass on linear
   RGB in the decode worker (and on the full-resolution source in the
   export), keyed by the same lens match and the same remembered strength;
   the uncorrected copy is kept (the 16-bit working copy already exists) so
   the strength slider re-runs the pass from it rather than re-decoding; the
   per-pixel stage leaves `compileEdit` and the shader; gray-world balance,
   exposure, denoise and the sky selection are measured after it. Clipping
   is bounded against the raw white level the way RawTherapee's control is.
   Held by the agreement walk on all four paths and by the lens-store checks.
2. Keep the stage where it is and only move the MEASUREMENTS after it —
   balance, exposure and the selection read a corrected sample.
3. Leave it.

## Rejected

- **2** — the automatics would be right and the pixels still wrong: the swap,
  the mixer and the saturation would still amplify the residual of a
  correction applied inside the grade, which is the complaint.
- **3** — 9c's four references agree on the placement and this app is the
  odd one out.

## Rank

Third, under 020: a placement question the research has already answered,
larger than 020 (it touches the decode worker, the export, the shader and the
four reconstructions) and older than 012.
