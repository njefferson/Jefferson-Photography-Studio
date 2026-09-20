# 032 · A mask keys the photograph, not the grade

## Context

**The Colour mask (type 3) keys on the colour the pixel DISPLAYS, so it moves
when the photograph is graded.** Read from `compileEdit` in `src/pipeline.ts`,
at the mask stage:

```
kr = toGamma((nr - 0.5) * con + 0.5);
```

— the pre-mask colour pushed through contrast and gamma, with the steering
tools off. That last part is deliberate and is why the mask does not chase the
tone curve or the mixer. But contrast and gamma are in it, and so is the
CHANNEL SWAP, which sits far upstream: a mask picked with the swap on keys a
different population when the swap is off.

**And it is the app's own recorded objection to itself.** Record 023 rejected
reusing the Colour mask for the sky on exactly this ground — it "keys on the
display colour at the mask stage and moves with the grade, which this record
forbids". The Sky mask was built on grade-invariant data for that reason. The
Colour mask never was.

**The general statement of the requirement, 2026-09-19:** a mask has to be
takeable at any point in the workflow, because if all that is in front of you
is the current image, then doing something to the image UNDERNEATH it is
impossible. A key computed from the graded pixel is the second case. A key
computed from the decode is the first.

## Looked up

**darktable offers BOTH and defaults to the input, and the manual says so in
one sentence**: "Two sliders can be shown for each associated data channel: one
that works on the *input data* that the module receives and one that works on
the *output data* that the module produces prior to blending." The output
sliders are hidden by default. The colour picker follows the same split — click
and drag sets the input handles, ctrl+click and drag the output ones
(docs.darktable.org, parametric masks).

**The rest of that page is the shape the control takes.** Each channel carries
four markers: two filled inner triangles where opacity reaches 1, two open
outer ones where it reaches 0, opacity ramping proportionally between them, the
markers free to touch but never to cross. Every channel's factor multiplies
every other's and then the module's own opacity. A polarity button swaps *range
select* for *range de-select*. A boost factor extends the range the sliders
reach, which exists because scene-referred data runs past 100%.

**Which channels is the part this app has to answer for itself, and its own
research answers it.** darktable picks per module group — Lab's `L a b C h`,
display RGB's `g R G B H S L`, scene-referred's `g R G B Jz Cz hz`. **Lab is
the wrong choice here and IR-SCIENCE.md §3 says why: the camera cannot store an
infrared white point**, its recorded balance being a clamp artefact, so `a` and
`b` would be defined against a white point the file does not have. Meanwhile
§4c-v measures that a population's chromaticity DIRECTION is a property of this
camera rather than of a photograph — spread 2.1–5.7% of the mean over six
scenes, holding out of sample to 1.9° — and that measurement was made in red
share and blue share. `buildSkyGuide` in `src/skyfine.ts` already returns
exactly those two plus gamma luma, under gray-world gains, with a contract
saying the guide "does not move as the photograph is graded".

**And §4b-vi says why more than one channel is needed**: the three populations
separate by DIFFERENT properties — foliage by what it is (it arrives coloured,
0.386–0.647 on the bare mapping), the sky by where it is, the colourless by
what they lack (under 0.06). One slider cannot express "reddish AND bright AND
up there"; a product of trapezoids can.

## Built already

- **`buildSkyGuide`** — red share, blue share, gamma luma, at 1024, built once
  per photograph under gray-world gains, already cached beside the selection.
  This is the grade-invariant key space and it exists.
- **`colorMaskWeight`** in `src/pipeline.ts` and its mirror in `src/gl.ts`
  (`float colorMaskWeight(int i, vec3 c)` with its dispatch and the tap's
  `u_readMode` read path), held identical by the agreement walk. Any change to
  the key space lands in all three or the preview and the export disagree.
- **`smooth01`**, already used by `maskWeight` and `colorMaskWeight`, is the
  ramp a four-handle trapezoid is two calls of.
- **The five-places checklist for an `EditParams` field**, and the sixth,
  `stampOf`, with `tools/stamp-check.mjs` refusing a look field that is not in
  it.
- **`MaskLayer`** already carries a discriminated union over `type 0..4` and
  the `op` field from 026, so a new type and new optional fields migrate every
  saved edit by doing nothing.

## Weighed against

**023**, closed, which rejected the Colour mask for the sky precisely because
of this defect and worked around it rather than fixing it.

**029**, the generator, and **031**, correcting a generated selection by hand.
Both are about the SKY mask. This is about every other mask, and about the one
the reader reaches for when the automatic one is wrong in a way a stroke would
be tedious to fix — a whole population rather than a place.

**026**, set operators in a group — SHIPPED, and it is what makes a parametric
term useful: "the sky's place INTERSECT this colour range" is the recipe
Lightroom documents for halos round trees, and half of it exists.

**019**, colour by population, which is the look's own answer to the same
problem and is hard-coded per look rather than reachable by the reader.

## Depends

- touches 026 — a parametric term is a term in the group algebra 026 shipped,
  and the interesting recipes are intersections with it.
- touches 031 — both add ways to shape one mask, and a reader meeting a wrong
  selection will reach for whichever is nearer. They must not become two
  answers to one question.
- touches 023 — 023 recorded this defect as its reason for not reusing the
  Colour mask and worked around it; the objection is still standing and is
  what this record answers.
- touches 019 — the look's population work hard-codes selections a parametric
  mask would let the reader express, so what ships here changes what 019 has
  to carry in code.
- distinct-from 029 — 029 is about a selection the app generates without being
  asked. This is about a key the reader picks. They look alike because both end
  in a weight per pixel, and they are the opposite kind of work: one is
  automatic and must be right unattended, the other is manual and must be
  predictable.

## Options

1. **Re-key the existing Colour mask onto the grade-invariant guide**, with an
   explicit input/output choice per darktable, defaulting to input.
2. **A parametric mask type (`type 5`) with darktable's four-handle trapezoids
   over several channels, multiplied** — brightness, red share, blue share,
   colour strength, hue, and height in frame — keyed on the guide, leaving the
   existing Colour mask alone.
3. Re-key the Colour mask silently and offer no choice.
4. Leave it, and document that a Colour mask must be picked after grading.

## Rejected

- **3 — re-key silently.** Every Colour mask in every saved edit was picked
  against the display colour. Changing the space under them moves what they
  select on files the reader has already finished, which is the one thing a
  non-destructive editor may not do. Whatever ships has to leave existing masks
  keying what they keyed.
- **4 — document it.** The behaviour is not explainable in the app's own terms:
  "pick this after you finish grading, and if you change the contrast
  afterwards the mask moves" is a description of a defect.
- **1 versus 2 is the live question and 1 is not rejected outright.** 1 is much
  smaller and fixes the recorded objection directly. 2 is what the convention
  actually is, and its extra channels are what §4b-vi says are needed. The
  argument for 2 over 1: a single chroma key cannot express a population that
  separates on brightness and place as well as hue, and this app's own look
  system already hard-codes exactly such combinations per look because no mask
  could express them.

## Rank

**Below 029 and 031.** The Sky mask is what a reader meets first and it is the
one measured wrong on real photographs; this is a defect in a control that
works, in a way that shows only when a mask is picked and then the grade is
changed. It is above 013 and 016 — the looks' population work — because those
hard-code population selections that a parametric mask would let the reader
express, and tuning them first is tuning around the absence of this.

## Looked at

No photograph is named in this record and none was rendered for it. The defect
is read from the source — the key-space expression at the mask stage in
`compileEdit`, and the same three lines mirrored in the shader — and from
record 023's own statement of it. The measurement that would settle option 1
against option 2 is a render, and it has not been made.
