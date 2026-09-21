# 034 · The red cast in the shadows comes off by hand, and should not have to

## Context

Reported from the device, 2026-09-20, with two renderings of one building frame
and the Grade panel that separates them: the Shadows wheel set to 209° at 47%.
As it opens, the building's shadowed wall and the area under its eaves carry a
strong red cast; with that shadow tint in, they read neutral and the foliage
keeps its colour. The ask is that the app do it rather than the reader.

It is not a small cast and it is not confined to one frame. Every infrared
frame with a lit face and a shaded face has it, because it is a property of the
light rather than of the grade.

## Looked up

**Two illuminants, and infrared makes them further apart than visible light
does.** In visible light a shadow is lit mainly by Rayleigh-scattered blue
skylight, which is why shadows go blue and why every raw converter has a tool
for it. In the near infrared Rayleigh scattering collapses with the fourth
power of wavelength, so the sky contributes almost NO infrared — which is the
same fact that makes an infrared sky dark, and it is why an infrared shadow
receives very little skylight (en.wikipedia.org/wiki/Infrared_photography:
dark skies from reduced Rayleigh and Mie scattering, and less infrared light in
the shadows and in reflections of those skies).

**What lights the shadow instead is the vegetation.** Foliage is the brightest
thing in an infrared frame — mesophyll scatters NIR hard — so it acts as a
large reflector and fills the shadows, which is why infrared shadows are
relatively BRIGHTER than their visible-light equivalents rather than darker
(davidkennardphotography.com, "why IR photography is the antithesis of normal
photography"). So the shaded wall is lit by bounce off the trees, and after the
channel swap that bounce is the red the reader is taking out by hand.

**Which is why one white balance cannot fix it.** A gray-world balance solves
for one illuminant. The sunlit face and the shaded face are lit by two, and
they are further apart in the infrared than they ever are in visible light.

## Weighed against

**IR-SCIENCE.md section 9j is this exact idea, already tried and already
refused, and it is the reason this record is not simply "do what the reader
did".** The subtractive-complement method — find the cast's hue, add 180°, put
it in the shadows only — is the reference video's own answer, and it was built
and measured here. On the oak frame it does what the method claims: eleven
times more effect on the bark than on the leaves, trunk and limbs reading as
dark wood with the canopy visibly unchanged at amount 0.70.

**And then a frame whose shadows are a roof rather than a tree.** The tint is
additive and weighted by luma alone, so it lands on every dark thing. On the
carport frame, 858,273 dark pixels that carry no colour at all measured
saturation 0.005 as the frame ships and **0.989 at hue 201** with the tint at
0.70. Ordinary grey shade driven to saturated teal. It is not shipped at any
amount, and that is a measurement rather than a caution.

What WAS shipped is `shadowSat` — the Shadow colour slider, multiplicative, so
it cannot create saturation where there is none: the same carport population
reads 0.0029 as it ships and gets CLEANER as the amount rises. Its stated
limitation is that it is keyed by luminance ALONE, so a deep sky's dark end
pays for a tree's bark; the scope gate carries the same sentence as an OWED
against `EditParams.shadowSat`.

Previous work by `NOTES.md` heading: "## Both amounts shipped: foliage 1.6, sky
1.8" and the Grade tab's own history.

## Depends

- touches 032 — a correction keyed on the pixel as DISPLAYED has the defect 032
  names: it re-keys under every look. A shadow cast is a property of the light
  the photograph was taken in, so it is measurable on the linear frame, which
  is the input space 032 is about.

## Options

**Measure the cast from THIS photograph's own shadows, and correct it in a way
that cannot invent colour.** Chosen, and both halves are load-bearing.

Per-photograph, because a look constant is a claim about every frame and 9j
measured what that costs. The app already decides the white balance, the
exposure and the denoise floor per photograph from the frame's own data; a
shadow illuminant is the same kind of quantity and is measured the same way —
find the shaded population, measure how far its mean sits from the sunlit
population's, and correct by that rather than by a number somebody typed.

And multiplicative, or otherwise bounded, because the failure mode is known and
numbered: an additive complement on a near-black neutral pixel clamps one
channel to zero and leaves the others positive, which is saturation 1 by
definition. `shadowSat` already demonstrates the asymmetry that makes grey
shade safe by construction rather than by calibration.

## Built already

- **`src/shadowcast.ts` is the measurement half, built 2026-09-21**, with
  `tools/shadow-cast-check.mjs` proving its arithmetic over synthetic
  populations: chromaticity rather than colour, a gain of unit luma so it
  cannot move brightness, the sky excluded, and exact unity on every frame it
  cannot measure. The app reports it in the §7f diagnostic as "Shadow light"
  and corrects nothing with it.
- **AND IT DOES NOT YET DO WHAT THIS RECORD NEEDS.** IR-SCIENCE 9j-ii has the
  run: NIR_3406, whose shadows are a roof, reads 17.6% where the design
  requires it to read nothing, against NIR_1376's 9.3%; NIR_3394 and NIR_3429
  sit at the held ceiling. Two
  definitions of the shaded population were tried; a third would be tuning the
  corpus. **Read 9j-ii before touching this again** — it names the two
  candidates that are not more tuning.
- **`grayWorldWB` in `src/decode.ts`** is the existing per-photograph
  illuminant measurement and the precedent for the whole shape.
- **The sky selection already exists for every photograph** — `skyMaskFor` in
  `src/main.ts`, built from the same copy the decode worker uses and already on
  the GPU — which is what lets the measurement exclude it, 9j's own named next
  piece.
- **`shadowSat` in `src/pipeline.ts` and its mirror in `src/gl.ts`** are the
  multiplicative shape and the demonstration that scaling cannot create
  saturation where there is none.
- **`tools/agreement-walk.mjs`** holds the CPU pipeline and the shader
  numerically identical, and is not optional for whatever correction lands.

What genuinely does not exist: a measurement that separates a shadow a tree
filled from one a roof made, and therefore any correction at all.

## Looked at

Rendered through the app at open and OPENED, 2026-09-21, which is how the first
three were identified at all — 9j measured on an "oak frame" and a "carport
frame" and wrote down neither identifier, so its refutation could not be
repeated by anybody.

- **NIR_1376.NEF** — one oak against a teal sky over a grass field, trunk and
  limbs dark against bright foliage. 9j's oak.
- **NIR_3406.NEF** — a long open-sided shelter with cars under it and deep
  shade beneath the roof, trees along the apron in front. 9j's carport, and a
  carport in the plain sense rather than a nickname. **The trees beside it are
  why "this frame must read no cast" may itself be the wrong test**, which is
  one of 9j-ii's two candidates and was visible only on the render.
- **NIR_3394.JPG** and **NIR_3429.JPG** — an office block with a lit face and a
  shaded one under its eaves, an F-15 on the pad in front. Camera JPEGs, so
  they take the other side of every per-kind split at open and render red
  overall where the two raws render teal.

None of the 44 practice DNGs can stand in for any of them: IR-SCIENCE section 7
says they are minimal hand-written files, useful for decode and geometry and
useless for a colour question. The real corpus is not in this repository.

## Rejected

**The additive complement, automatically.** It is what the reader did by hand
and it is the obvious answer, which is exactly why it is written down here: 9j
measured it at 858,273 pixels of damage on the second frame it was shown. A
hand edit and an automatic are different things — a photographer applying it is
looking at that frame while they do.

**A look constant.** 9j's own closing lesson: a look constant is a claim about
every photograph, so it is measured on a frame that disagrees with the one that
motivated it. The building frame is the oak's argument again.

**Widening `shadowSat` and calling it the fix.** It REMOVES colour; it does not
correct a cast. A red shadow becomes a grey shadow rather than a neutral one,
and the shadows go flat — against the standing taste of shadows alive.

**Keying on luminance alone.** It is `shadowSat`'s recorded limitation and it
would be inherited whole: on a frame with a deep sky the sky's dark end is
inside the band and pays. Whatever selects the shadow population has to know
more than how dark a pixel is.

**Taking the reader's 209° at 47% as the answer.** It is one frame's cast
measured by eye, and it is evidence that a correction is wanted, not a constant.

## Rank

**Beside the look work, above 013 and 016 and below the mask items already in
flight.** It is pixel work on the same ground those two occupy — 013's
Aerochrome and 016's foliage both act on populations this would move — so
changing the shadow illuminant underneath them afterwards would invalidate what
was tuned against the old one, which is the dependency test the ranking rule
states. It sits below the mask and control items above it because those are
defects on paths the reader meets first, and this is a correction that a
control already reaches by hand today.
