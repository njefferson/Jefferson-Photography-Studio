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

**AND THE QUESTION CAME BACK ON 2026-09-22 AS "WHAT AMOUNT", which is this
record's rejected option wearing a number.** It came back because the first
three frames it was asked on agreed with each other. NIR_2927 and NIR_2922 —
a hard sun/shade boundary and a canopy-shade frame — are both clean wins: the
red leaves the shadow, the sunlit areas hold, and on that evidence alone an
amount looks like a free improvement. NIR_3430 was the first frame to disagree,
and it disagreed weakly enough to be read as an edge case: it is shadow-poor,
so the control desaturates a sunlit building and its foliage, which reads as
"the cost falls on flat frames" rather than as a defect in the key.

**Six more frames were rendered to price that cost, and they moved the
diagnosis instead.** The two intermediate cases are the ones that show why.
NIR_1679 has the artefact AND the subject in the same tonal band — the crimson
wash on the shaded ground goes by 0.50 with the sunlit trunk intact, and by
0.25 the trunk has dulled too. NIR_1835 is the case no measurement reaches:
its lake is a sheet of bright red, the reflection of the IR-bright forest, and
whether that is the photograph or a cast on water is a taste call that the
renders can present and cannot answer.

## Depends

- touches 032 — a correction keyed on the pixel as DISPLAYED has the defect 032
  names: it re-keys under every look. A shadow cast is a property of the light
  the photograph was taken in, so it is measurable on the linear frame, which
  is the input space 032 is about.
- touches 019 — 019 settled that a hue band is not a place. The 2026-09-22
  renders make that this record's problem too: excluding shaded foliage from
  the shadow population needs a selection, and `u_fol` is a band. A selection
  built for one would serve the other, and a band adopted here would repeat
  019's rejected route.

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

**NINE MORE, 2026-09-22**, each rendered through the app at four Shadow colour
amounts — 1.00, which is the look as it ships, then 0.75, 0.50 and 0.25 — and
each of the thirty-six opened. The question put to them was whether an amount
could be baked into Aerochrome.

They were chosen as shadow-rich against flat, on the expectation that the cost
would fall on the flat frames. **That expectation was wrong, and the renders
say so: the split is not shade against flat, it is what the dark pixels are
made of.**

- **NIR_1748.NEF** — a granite shore with paddleboarders and a shaded band
  across the top. The clean case. At 1.00 the grey granite carries red speckle
  and the shaded band a red wash; by 0.50 the rock reads grey; at 0.25 both are
  gone and nothing in the subject moved — the sunlit trunk, the boards and the
  foreground bush are unchanged at every amount.
- **NIR_2927.NEF** and **NIR_2922.NEF** — a hard sun/shade boundary and a
  canopy-shade frame. The same shape as 1748: the red leaves the shadow while
  the sunlit areas stay. 0.75 is near-indistinguishable from 1.00, and what is
  useful sits between 0.50 and 0.25.
- **NIR_1679.NEF** — a campsite under a fir, with a boulder and deep dappled
  shade. Helps, and then takes the subject. The murky crimson on the shaded
  ground and on the boulder's shaded face is gone by 0.50 with the sunlit trunk
  still a strong red column; at 0.25 the trunk itself dulls to a dark brown.
- **NIR_1642.NEF** — a dense conifer stand in even light. At 1.00 the shaded
  inner canopy is a deep crimson, and that crimson is the depth of the
  photograph. At 0.50 it is a dull grey-brown; at 0.25 the frame is grey with
  pink on the sunlit tips only. The look is gone.
- **NIR_1851.NEF** — standing under a tree looking out at sunlit forest. The
  overhanging near foliage is a brilliant saturated red at 1.00 and near
  black-brown at 0.25. It is in shade, so it is dark, so the control takes it.
- **NIR_1737.NEF** — a lakeshore treeline above a bright beach. The treeline's
  shaded interior loses its red the same way; the small bright markers on the
  beach keep theirs. The sky's dark end lightens as the amount rises, which is
  the luminance-only limitation showing on the population it is already
  recorded against.
- **NIR_1835.NEF** — a paddleboarder on a lake under a dark sky. The lake is a
  sheet of bright red at 1.00, the reflection of the IR-bright forest, and dark
  grey by 0.25. Whether that red is the photograph or a cast on water is the
  one thing in the set a measurement cannot settle.
- **NIR_3430.NEF** — shadow-poor: a sunlit building and foliage. The control
  desaturates both, which is what a frame with little shade has instead of
  shade.

**The dividing line, stated from the renders rather than from the numbers.**
Where the dark pixels are ground, rock, water or a deep interior, the control
removes an artefact and costs nothing. Where the dark pixels are FOLIAGE — a
shaded canopy, an overhanging near branch, the inside of a treeline — it
removes the look's whole subject, because on this corpus the shaded side of
vegetation is where Aerochrome's red lives. Four of the nine are that second
case, and three of those four had been picked as the flat ones.

**The numbers beside those renders would have given the opposite answer.** The
foliage-population saturation falls smoothly on all nine, 0.64 to 0.75 at 1.00
and 0.40 to 0.54 at 0.25, with no break anywhere between the frames it helps
and the frames it destroys — because a pixel that desaturates leaves the
population being averaged. The split is visible in one pass and invisible in
the statistic.

## Rejected

**The additive complement, automatically.** It is what the reader did by hand
and it is the obvious answer, which is exactly why it is written down here: 9j
measured it at 858,273 pixels of damage on the second frame it was shown. A
hand edit and an automatic are different things — a photographer applying it is
looking at that frame while they do.

**A look constant.** 9j's own closing lesson: a look constant is a claim about
every photograph, so it is measured on a frame that disagrees with the one that
motivated it. The building frame is the oak's argument again.

**AND IT HAS ITS FRAMES NOW, which it did not.** That rejection rested on 9j's
carport, whose identifier was never written down, so no later session could
re-open it and the rejection had to be taken on trust. NIR_1642, NIR_1737 and
NIR_1851 are the frames that disagree; they are named in "## Looked at" with
what each one showed at each amount. What they disagree about is not the
amount, and there is no amount that survives all nine — 0.25 is free on
NIR_1748 and has destroyed the look on NIR_1642 before it reaches 0.50.

**Widening `shadowSat` and calling it the fix.** It REMOVES colour; it does not
correct a cast. A red shadow becomes a grey shadow rather than a neutral one,
and the shadows go flat — against the standing taste of shadows alive.

**Keying on luminance alone.** It is `shadowSat`'s recorded limitation and it
would be inherited whole: on a frame with a deep sky the sky's dark end is
inside the band and pays. Whatever selects the shadow population has to know
more than how dark a pixel is.

**AND THE SKY IS THE SMALLER HALF OF THAT.** The limitation is written down
against the sky in `src/shadowcast.ts` because the sky is the population the
app can already exclude. The 2026-09-22 renders show the same key failing on a
population it cannot: shaded FOLIAGE. NIR_1851's darkest non-sky region is an
overhanging branch, NIR_1642's and NIR_1737's is the inside of a treeline, and
`k = 1 - amount * (1 - smoothstep(0.05, 0.6, L))` in `src/gl.ts` and its mirror
in `src/pipeline.ts` cannot tell any of them from a shaded rock. There is no
foliage selection to exclude them with either — `u_fol` is a hue BAND, and
record 019's rejection that a hue band is not a place applies here unchanged.

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
