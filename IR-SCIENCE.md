# IR-SCIENCE.md — what this app is actually processing

**Read this before changing anything that touches pixels, white balance, looks,
or decode.** It exists because sessions keep designing this app as if it were an
ordinary photo editor, discovering the infrared facts the hard way, shipping a
regression, and then rediscovering the same facts a week later. Every number
below was measured in this repository, on real files, and the measurement is
named so it can be repeated or overturned.

The rule this file serves: **design from infrared physics first, and reach for
general photography only where it fills a gap and still applies.** Those places
exist and are marked. Most of the traps are cases where ordinary photographic
intuition is not merely unhelpful but exactly inverted.

---

## 1. The capture, and why it constrains everything downstream

The body is a **dedicated internal infrared conversion**. The IR-pass cutoff is
fixed inside the camera. There is **no external lens filter**, and no per-shoot
filter question — asking one is a sign a session has drifted into visible-light
assumptions.

What reaches the sensor is near-infrared. Silicon sees to roughly 1100nm, and
past the cutoff the red, green and blue dyes of the Bayer filter all become
increasingly transparent — so all three channels carry IR, at different and
lens-dependent transmissions. **The three channels are not red, green and blue
in any meaningful sense.** They are three overlapping samples of one IR band,
and how far apart they can be pulled is the fixed property of the conversion
that decides whether colour work is possible at all.

Two capture facts that constrain post:

- **Custom white balance is set in camera, on sunlit foliage.** Not a grey card,
  not the sky. Section 3 is about what that does and does not record.
- **IR foliage blows to white far earlier than a visible-light histogram
  suggests, and blown IR foliage is unrecoverable** — there is no detail
  underneath, only a clipped channel. This is the one place where ordinary
  exposure discipline applies with *more* force than usual, not less.

Focus shifts: IR focuses behind the visible plane. A dedicated conversion is
calibrated for its own cutoff, so this rarely reaches the app, but it is why a
frame can be sharp in the viewfinder and soft in the file.

**Hotspots** — a bright, roughly circular centred flare from internal reflection
off the lens's rear baffling — are invisible in the viewfinder and on the
histogram, worsen as the lens stops down, and are a property of the lens rather
than the scene. The app's lens-correction machinery exists for this. It is not a
vignette and must not be reasoned about as one: a vignette darkens the corners,
a hotspot brightens the middle, and the colour-cast half of a hotspot has its own
control (`hotspotColor`).

---

## 2. Why the tonal separation is the point, and colour is the decoration

Chlorophyll reflects near-infrared almost totally and blows to white. The sky
scatters almost none and goes near-black. **That separation is a luminance
fact**, and it does not exist in visible light. It is the reason to shoot IR.

Everything the app does with colour sits on top of that. The processing
reference is explicit that **monochrome is chosen too rarely** — an IR file that
resists colour grading has not failed, it is a tonal file. This app currently
treats monochrome as two looks (`B&W IR`, `HIE B&W`) rather than as a
destination with its own workflow, which is a known gap rather than a decision.

**Where general photography still applies:** tone curves, local contrast,
sharpening, denoise and the geometry tools are all band-agnostic. A histogram is
a histogram. Crop, straighten and lens geometry carry over untouched. The gap
this file exists to close is specifically **colour, white balance, and what the
file's own metadata means.**

---

## 3. THE CAMERA CANNOT STORE AN INFRARED WHITE POINT

This is the single most expensive fact here and the one most likely to be
rediscovered by accident.

**The tag exists.** Nikon MakerNote `0x000C` (`WB_RBLevels`), unencrypted,
ordered `[R, B, G, G]` — not RGB, which is its own trap. DNG's equivalent is
`AsShotNeutral` (`0xC628` / 50728), which stores a *neutral colour* whose
reciprocals are the gains. Reading either is easy and the NEF MakerNote walker
in `src/raw/nef.ts` already navigates to the right IFD for the black level and
the linearization curve.

**The tag is not usable.** The gains an IR white point requires fall outside the
range a custom preset can hold, so the camera clamps and records what it could
reach. Measured, on this repository's own files:

- `NIR_1376.NEF` carries WhiteBalance `PRESET4` and `0x000C
  [1.8574, 1.4668, 1, 1]` — R 1.86, B 1.47, G 1, which reads like an ordinary
  *daylight* balance.
- Developed at that balance the frame renders **rgb(158, 0, 241)** — green at
  **zero**, a magenta wall, two hues over 5%.
- Gray-world on the same frame renders **rgb(175, 178, 178)**, neutral, **five**
  hues.

**The tell that it is a ceiling and not a measurement:** a NEF on `PRESET4` and
five camera JPEGs on `PRESET6` record that identical number to four decimals.
Two different custom preset slots landing on one value is a clamp.

**So an infrared raw converter has to find the white point BELOW what the camera
allows, from the data.** That is what gray-world does here and what this app's
"no 2000K floor" claim has always meant — ordinary raw converters refuse to go
below roughly 2000K because no visible-light illuminant is down there, and an IR
white point is.

**Consequence, and it inverts the obvious design:** "open as shot" is meaningful
for a camera-rendered JPEG, which was developed through the clamped preset and
should be left alone. It is **not** meaningful for a raw file, where the stored
white balance is an artefact of the camera's range rather than a record of
intent. A session read the standing "opens as shot" rule as an instruction to
develop raws at `0x000C`, shipped it, and took it back out the same day.

`src/raw/nef.ts` carries a comment at the MakerNote walker saying the tag is
deliberately not read, so the next session finds the reason at the place it
would write the code.

---

## 4. The three routes, and which one the app implements

**Route 1 — channel swap.** The fast, recognisable false colour. Four steps, and
the app's fidelity to them is the whole of its colour behaviour:

1. Open the raw with a usable white balance (see section 3 — derived, not
   the camera's).
2. Swap red and blue. IR-bright foliage moves red to blue; sky moves blue to
   gold.
3. **Correct the resulting cast. The swap overshoots.**
4. Contrast last. Applied before the swap it crushes the tonal separation that
   is the reason the frame exists.

The app does 1, 2 and 4. **Step 3 is where every colour complaint in this
repository has come from.** `LOOKS.red` and `LOOKS.goldie` carry a `wbBias`,
which is step 3; `LOOKS.aero` carries none, and the code comment beside it
already names the result — the bare swap, flat purple.

Fails when residual channel differentiation is insufficient, or when foliage was
clipped in capture: clipped IR foliage has no data underneath and the swap turns
it to flat cyan.

**KNOWN GAP: this app's `aero` does not reach the film's depth, and more
saturation cannot get it there.** Kodak EIR renders healthy foliage a deep
magenta red. Measured on a reported frame, `LOOKS.aero` lands it at
`rgb(173, 104, 106)` — hue 358.5, which is already pure red, at HSV saturation
0.40 and **value 0.68**.

The per-colour bands clamp saturation in HSV:

    s = Math.min(1, s * (1 + (sky[1] - 1) * wS) * (1 + (fol[1] - 1) * wF));

so once `s` reaches 1 the control is spent and further travel does nothing, which
is what a maxed slider that changed nothing feels like. `LOOKS.aero` has already
multiplied saturation before the band sees it (3.0 on raw), so the band can
arrive with almost no headroom.

**Past that point the limiter is VALUE, not saturation.** Fully saturating that
same pixel gives `rgb(173, 0, 0)` — a real red, but capped at V 0.68 by the
brightness the foliage arrived with, and the film's crimson sits below it.
Saturation and lightness are not independent here, and reasoning about the colour
AS IT IS rather than about where saturating takes it gets this backwards.

So closing the gap is not a slider that needs more range. It is a question about
where the red's value should come from — the look's own numbers, the tone curve,
or step 3 of the route above, the cast correction the swap needs anyway. All
three are look design, which is the owner's, and none is proposed here.

**Route 2 — profile-based (the Rob Shea method).** Build the colour transform
from a profile made against the IR raw's own custom white balance rather than
fighting a visible-light pipeline channel by channel. Wider and more stable
grading latitude at the cost of setup. The app does not implement this. Some of
the owner's Lightroom-iOS DNGs embed such a profile.

**Route 3 — monochrome.** See section 2. Under-served here.

---

## 4b. WHAT THE FILM ACTUALLY DID, AND WHY A TWO-CHANNEL SWAP IS NOT IT

**Researched 2026-09-16, after four rounds of trying to reach Aerochrome by
adjusting saturation inside the app. The answer was never in the app.** Recorded
here so no session reaches for a slider again before reading this.

**AEROCHROME'S THREE LAYERS ARE SENSITIVE TO GREEN, RED AND INFRARED — not to
blue, green and red.** One layer is dye-sensitised to the near-infrared band, one
to visible red, and the top one to visible green. **All three are also sensitive
to blue**, which is why the film REQUIRES a yellow filter on the lens (Kodak
Wratten 12) to absorb blue entirely. Blue light is not mapped anywhere. It is
thrown away before it reaches the film.

So the film's mapping, in terms of what lands in each printed colour, is a
THREE-WAY ROTATION with blue discarded:

    red output   <- infrared
    green output <- visible red
    blue output  <- visible green

**The app's `R⇄B` swap is a two-channel exchange and leaves green where it is:**

    red output   <- blue        green output <- green        blue output <- red

Those are different operations, and the difference is the whole green/blue leg.
It is the structural reason an Aerochrome-labelled render here lands teal-skied
and pale rather than deep-blue-skied and crimson — the film puts VISIBLE GREEN
into the blue output, and a plain swap puts visible red there.

**The digital recipe every source gives is two swaps, which compose to exactly
that rotation.** Red↔Blue to get red foliage, then Blue↔Green to take the sky
from cyan to blue. Composed: `R_out = B_in`, `G_out = R_in`, `B_out = G_in` —
row-major `[0,0,1, 1,0,0, 0,1,0]`.

**THE APP ALREADY SHIPS THAT MATRIX AND `LOOKS.aero` DOES NOT USE IT.**
`MIX3_PRESETS` in `src/main.ts` carries the full 3x3 mixer on the Colour tab
with five presets, and its own comment calls the swap "the one-tap special case":

    { label: "R⇄B swap",   m: [0, 0, 1, 0, 1, 0, 1, 0, 0] }
    { label: "Aerochrome", m: [0, 1, 0, 0, 0, 1, 1, 0, 0] }
    { label: "Rotate",     m: [0, 0, 1, 1, 0, 0, 0, 1, 0] }

**`Rotate` is the matrix the documented digital recipe produces. The preset
LABELLED `Aerochrome` is the other rotation.** Whether the label is on the wrong
one of the two is OPEN and must be settled by rendering both, not by argument —
which rotation is right depends on which input channel carries the infrared after
the camera's custom white balance, and that is a property of this conversion, not
a thing to derive on paper.

**The conversion class matters and sets what is possible.** 590nm passes a lot of
visible light and is the false-colour choice; 665nm is the flexible middle;
720nm blocks nearly all visible light and is the monochrome look, where false
colour is possible but limited. A body that shows RED in the viewfinder is in the
590/665 class — it passes visible red alongside infrared, which is what floods
the red channel. Sources report that after a standard swap on a 590nm camera
foliage commonly lands orange or copper rather than ruby, and the named fix is an
HSL hue shift of the yellows and oranges toward red.

**A physical filter is the other route entirely.** Kolari's IR Chrome is fused
glass that passes the balance of visible and infrared the film's layers wanted,
so the Aerochrome palette arrives straight out of the camera with NO channel
swap and no heavy editing. That is a capture-side answer; this app is
post-capture and cannot reach it, which is worth knowing before promising a
rendering that a filter buys optically.

**Corroborated: the 2000K floor is real and documented.** Lightroom and ACR will
not set a colour temperature below 2000K, which is too high for infrared, and the
standard workaround in the field is a custom camera profile built with Adobe's
DNG Profile Editor. Section 3's claim that an infrared white point must be found
BELOW what ordinary tools allow is the same finding arrived at from the other
direction.

**CONFIRMED TWICE, INDEPENDENTLY.** A second source states the same mapping in
the same terms — infrared to red, visible red to green, visible green to blue —
and names the alternative techniques around it. Two sources arriving at an
identical three-way rotation is what moves this from "read somewhere" to a fact
worth building on.

**MEASURED ON A REAL RAW, 2026-09-16** (`NIR_1376.NEF`, rendered through the app,
foliage and sky populations split per section 6):

- the Aerochrome BUTTON as it ships (R/B swap only) — foliage sat 0.51 value
  0.69, sky sat 0.49 value 0.50
- the mixer preset LABELLED `Aerochrome` — foliage sat 0.23 value 0.82, sky sat
  0.31 value 0.69
- the mixer preset labelled `Rotate` — foliage sat 0.26 value 0.80, sky sat 0.34
  value 0.71
- `Rotate` with the look's own swap turned back OFF, so the rotation is not
  stacked on a swap — foliage sat 0.32 value 0.69, **sky sat 0.75** value 0.51

The last row is the one to notice: taking the swap off before the rotation more
than doubles the sky's saturation against every other candidate. The rotation
applied ON TOP of a swap is two mappings composed, which is not what either
recipe describes.

**WHAT IS NAMED IN THE FIELD, AND WHAT THIS APP HAS.** The owner asked directly,
and the audit is worth keeping:

- **Aerochrome / EIR** — the film and its mapping. The app has a button by that
  name that performs a two-channel swap, which is NOT that mapping.
- **Trichrome** — a real named technique: three exposures through IR, red and
  green filters combined into one frame. Needs three captures, so it is a
  capture-and-combine feature rather than a look. Not in the app.
- **Lomochrome Purple** — a film that replaces the green layer's dyes with
  purple/magenta, giving a superficially Aerochrome-like but distinct signature.
  A nameable target. Not in the app.
- **IR Chrome / Candy Chrome** — Kolari's optical filters. Capture-side, so the
  app cannot reach them, but their RENDERING is a nameable target.
- **HIE** — Kodak High Speed Infrared, the black-and-white film with the
  characteristic halation. The app has `HIE B&W`.
- **`Red`, `Goldie`, `Natural IR`** — this app's own names, not field terms.
  Worth knowing when reading a tutorial that uses none of them.

**The bare swap has no film name.** It is called a channel swap, or false colour,
and the pink-foliage/cyan-sky result is simply what a 590/665-class conversion
gives after one swap with the third leg missing. Naming it after a film it does
not reproduce is the confusion this section exists to end.

**PROVENANCE, AND WHAT IS NOT YET VERIFIED.** The layer structure, the yellow
filter, the two-swap recipe, the wavelength classes and the 2000K limit are from
retrieved search summaries of Kolari Vision, LifePixel, Lenscraft, Cuchara,
Adobe's own community threads and the analog-film guides — **not from the primary
pages**, which this environment's network policy blocked at fetch time. The
mapping itself has since been rendered and measured on a real raw (below); the
wavelength classes and the 2000K limit have not.

### 4b-i. THE APP SHIPS BOTH MAPPINGS NOW, UNDER HONEST NAMES

> **SUPERSEDED IN PART, later the same day — see 4b-ii.** What `eir` carries is
> no longer the bare rotation described below, and its swap is no longer off.
> The rotation itself, the names, and the mixer-chip correction all still stand,
> and the rotation is still on the `Aerochrome` chip. Kept rather than rewritten
> because the measurements below are what a later choice was made against.

Added 2026-09-16, the same day the research landed. **Nothing that already
rendered one way renders another** — the change is two names and one new look.

- **`aero`, printed `Pink IR`.** The R⇄B swap with saturation, and on camera
  JPEGs the eight-band `hsl` correction. Untouched: same key, same numbers, same
  per-kind split, same button id `lookAero`. Only the label moved, because it was
  the only name the app had for this rendering and it was a claim the rendering
  could not meet.
- **`eir`, printed `Aerochrome`.** Kodak's own designation for the film
  (Ektachrome Infrared). `swapRB: false`, `mix3: [0,0,1, 1,0,0, 0,1,0]` — the
  rotation above, expressed in the 3×3 channel mixer, which is the only knob in
  this pipeline that can state a mapping. `raw` takes sat 3.0 / contrast 1.15,
  the same strengths as `Pink IR`.
- **`MIX3_PRESETS` chips 2 and 4 exchanged LABELS.** The chip called *Aerochrome*
  carried `[0,1,0, 0,0,1, 1,0,0]`, which cycles the other way and is not any
  film; the one called *Rotate* carried the film's mapping. Matrices and array
  order are untouched — the chips have no ids and are pressed by index.

**NO SWAP UNDER THE ROTATION, AND THAT IS THE WHOLE DIFFERENCE.** The mixer runs
immediately after the swap, so leaving `swapRB` on composes the two into a G⇄B
exchange. Measured as the fourth sheet candidate and the worst of the four.

**MEASURED ON A REAL NEF** (`tools/look-sheet.mjs`, split populations per
section 6, never a whole-frame mean):

- `Pink IR` — foliage saturation 0.51 at value 0.69, sky 0.49 at value 0.50.
- `Aerochrome` — foliage 0.33 at value 0.69, sky 0.50 at value 0.51.

The number that does not appear in that list is the one that matters, and it is
visible rather than measured: **under the rotation the fenceposts, the wire, the
pole and the tree trunk stay brown, and under the swap they go pink with the
canopy.** That is the film's own pass/fail test — foliage to magenta, sky to
cyan, *and soil, bark, asphalt and buildings unchanged*. A look that pinks the
dirt is a global tint, whatever it does to the leaves. Nothing in this repository
measures that population yet; it was read off the two renderings side by side.

**A NOTE ON A NUMBER THAT MOVED.** An earlier sheet reached this rendering by
hand — press `Aerochrome`, switch the swap off, then pick the mixer preset — and
measured sky saturation 0.75. The shipped look measures 0.50 on the same frame.
Neither is wrong: `applyLook` solves Restore depth against the look it is
applying, and the by-hand route solved it against the swap-on state and then
turned the swap off underneath the solve. The shipped number is the honest one.

**ON CAMERA JPEGS IT IS NOT SOLVED, AND THAT IS SAID OUT LOUD.** All five real
camera JPEGs on hand are one-band files (section 5), so the balance is skipped by
design and the rotation renders a flat green wall — exactly as `Pink IR` renders
a flat purple one on the same files, and for the same reason. Two things follow.
First, `lookState`'s test for "is a colour look on the frame" read `.swapRB`
alone, which was true of every colour look until this one; it now asks whether
the look carries a MAPPING (swap **or** mixer), so the sentence explaining the
one-band condition reaches the new look instead of leaving a green frame with no
explanation. Second, *Balance it anyway* does reach it — measured on all five,
the mean goes from roughly 40/220/0 to a neutral 105/110/100 and the hues spread.
**What is still missing is the JPEG-side cast correction**, the `hsl` step 3 that
`Pink IR` carries and this look deliberately does not: that eight-band array was
solved against the *swap's* output and carrying it to a different mapping would
be a guess wearing a measurement's clothes. Solving it needs a **two-band camera
JPEG**, which this repository does not have.

### 4b-ii. AND WHAT THE BUTTON ACTUALLY SHIPS, CHOSEN BY LOOKING

Same day, after 4c-vi. The bare rotation of 4b-i is the film's mapping and is
still on the `Aerochrome` mixer chip; it is not what the look button does.

**`LOOKS.eir` carries the swap AND a solved nine-number mixer on top of it:**

- `swapRB: true` — the reverse of 4b-i, and not a reversal of its argument. 4b-i
  is about the BARE ROTATION, which composes with a swap into a G⇄B exchange.
  This matrix was solved against anchors measured POST-WHITE-BALANCE AND
  POST-SWAP, so the swap is the first half of the mapping it completes. Turn the
  swap off under these nine numbers and they act on an input they were never
  solved for.
- `mix3: [0.99, -0.06, 0.07, -1.44, 1.37, 1.02, -0.47, 0.81, 0.65]` — solved
  against anchors from SIX frames, hold-one-out worst error 1.9° (4c-v).
- `denoise: 0.8` — a floor over the photograph's own measurement, for the reason
  4c-vi gives: the colour and the grain come out of the same residual and rise
  together, so the mapping that doubles the colour doubles the speckle with it.

**SNAPPED TO THE MIXER'S 0.01 STEP.** The solve gave 0.991, -0.064, 0.072,
-1.438, 1.373, 1.023, -0.473, 0.811, 0.653, and the sheets were rendered by
DRIVING THE SLIDERS, which snap on assignment. The snapped numbers are the ones
that made the approved picture; the full-precision ones would be a rendering
nobody has seen.

**AND THE BUTTON IS NOT PIXEL-FOR-PIXEL THE SHEET.** With Restore depth off the
two are byte-identical — canvas hash `808ed2ea` on `NIR_0063.dng`. With it on
they differ, because `applyLook` re-solves the lift against the look now on the
frame and writing numbers into mixer sliders is not pressing a look, so the
sheets carry a lift solved for Pink IR and the button carries one solved for this
matrix. Both renderings were sent rather than described.
`tools/aerochrome-walk.mjs` asserts the identity one way and the difference the
other: a build where the lift-on renders MATCHED would be one where the re-solve
had stopped happening.

### 4b-iii. THE FILM, MEASURED — AND THE LOOK MOVED ONTO ITS ANGLES

Source: *Making the most of Kodak aerochrome*, AlternativePhotography.com,
2012-02-29, by the author writing as "lazybuddha", originally from the
Lomography series. Two photographs survived into the PDF; the caption
immediately above the second reads **"Red filter with Kodak Aerochrome"**, so
that one's filter is known and the first one's is not stated.

**MEASURED ON THOSE PHOTOGRAPHS** — split populations per section 6, circular
mean and circular spread, never a whole-frame mean:

- **Lighter filter** — foliage **6.2°**, spread 20.5°; sky **204.0°**, spread
  19.8°; **separation 197.8°**. Foliage sat 0.60 at value 0.77, sky sat 0.66 at
  value 0.32. Only **13.8%** of the frame carries no colour.
- **Red filter** — foliage **9.0°**, spread 22.7°; sky **217.1°**, spread 13.2°;
  **separation 208.1°**. Foliage sat 0.78, sky sat 0.92. **3.6%** colourless.

**AEROCHROME FOLIAGE IS SCARLET, NOT MAGENTA**, and that is the correction this
section exists for. The look as shipped in 2.47 rendered foliage at **325°** and
sky at **167°** — about 40° out in BOTH populations, and on the wrong side of
red. Pink IR, at 353° and 180°, was closer to the film than the look named after
it. That had been reported from a photograph long before it was measured, and it
was correct.

**THE FILTER IS AN AXIS AND THE ARTICLE STATES IT.** Darker filter, darker reds
and sky and more contrast; lighter filter, pinker reds and greener sky. The
mechanism is exposure — the author's own guide for bright sun is f/22 at 1/125
for yellow, f/16 for orange, f/11 for red, two stops across the axis. Different
plants reflect infrared to different degrees and therefore render as different
shades of red, and a lighter filter shows more of those differences: a red filter
"will block the lighter pinks". This paragraph previously carried a caveat that
it came from a search index rather than the page; the PDF confirms it and the
caveat is gone.

**A GLOBAL HUE SHIFT IS RULED OUT BY MEASUREMENT.** At +38° the foliage lands on
target and the two populations MERGE — 94–98% of the coloured frame into one 30°
bin. The separation IS the film. The app's own `hue` control is not a uniform
rotation either: measured at +20, foliage moved +31° while sky moved −7°.

**WHAT SHIPS INSTEAD: eight band hue shifts on `LOOKS.eir.raw.hsl`.** `hslAt` is
the only knob in this pipeline that moves two populations differently. Solved
against the film's angles on six frames, with the film's own spread as a ceiling
rather than something to minimise — the 20° width is the point of a lighter
filter, not an error. Hold-one-out worst error 8°, all of it the sky of one frame
whose sky sits 6° off the others.

**VERIFIED BY SUBSTITUTING BACK, not by re-running the solver's arithmetic.**
Rendered through the real pipeline and measured the same way as the film: foliage
2.9–5.6° against 6.2, sky 202.2–205.1° against 204.0, separation 197–201° against
197.8. The render and the solve agree to within 1.7°, which is the whole reason
for doing it that way.

**AND THE ZEROS IN THAT ARRAY ARE LOAD-BEARING.** A first solve put bands 240 and
280 on the ±100 clamp: these six frames carry almost nothing there, so the solver
was free to put anything in them and did — and a photograph that DOES carry blue
or purple would have been swung 100°. A weak penalty on shift size brought them
home to 0 and 1. **An unconstrained parameter is noise with a slider attached.**

**WHAT IS STILL NOT THE FILM, and it is no longer hue.** Foliage saturation and
value already match (0.57 at 0.80 against the film's 0.60 at 0.77). The gap is
how much of the frame carries NO colour: **13.8% on the film against 28–45% on
these frames**. The film's reeds and lawn hold red where ours go to near-white.
That is highlight behaviour — bright IR-reflective ground blowing out rather than
holding its hue — and it is an exposure and roll-off question, not a colour one.

### 4b-iv. THE SKY'S DEPTH AGAINST THE FILM — SATURATION IS A BAND, VALUE IS NOT

**The gap, restated from §9m and record 017.** The hue bands sit on the film to
within 1.7°, and the sky's saturation and value do not: the film's sky (the
lighter-filter photograph above) reads **0.66 at value 0.32**, the red-filter
one 0.92; the app's Aerochrome, Restore depth on, read 0.17–0.83 at value
0.55–0.89 on seven frames. Solved 2026-09-18 the way the angles were — through
the real app, Restore depth ON (the default, re-solved on the Look press),
measured with the film instrument (hue-split populations, circular mean,
saturation and value of the sky population, colourless share), substituting
back rather than trusting arithmetic. Frames: NIR_3406, NIR_1376 (real NEFs),
NIR_0627, NIR_0063, NIR_1644, NIR_1651 (practice), and the corpus's NIR_2082.
Every harness prints the lift's state on every row.

**THE LEVER IS THE LOOK'S AQUA AND BLUE BANDS, and their two halves behave
differently.** `hslAt` applies a band's saturation as a POWER (s^(1/ds), by
design — it moves the s≈0.05 skies a multiplier cannot) and its luminance as a
plain multiplier on HSV value. So one saturation setting collapses the frames'
spread while a luminance setting scales every frame by the same factor.

**Saturation, power 2 on both bands (`35,2,1` / `0,2,1`) — as shipped → solved:**
3406 0.38 → 0.56, 1376 0.76 → 0.81, 0627 0.17 → 0.39, 0063 0.38 → 0.57, 1644
0.83 → 0.87, 1651 0.57 → 0.70, 2082 0.21 → 0.37. Three of seven inside the film's
window (0.60–0.94); the four pale skies move about halfway to it and stop —
the power curve is bounded at 1 and the lift's colour half solves against
these bands, so the arithmetic prediction (√0.38 = 0.62 on 3406) overshoots the
render by 0.06. Hold-one-out worst error 0.29 (2082), 0.27 with it held out
(0627): the two haziest skies. Foliage saturation and value unchanged to two
decimals on every frame; hue angles unchanged (a saturation scale cannot move
one). Colourless share 19.1 → 16.8% on 3406, 20.1 → 9.8% on 2082 — the haze
gaining colour, which is what the film's 13.8% says it should.

**What that costs, measured three ways, and none of them is the mottle.**
- On the EXPORTED file (`liftexport-cand.mjs`, 9l-iii's instrument, Restore
  depth on, the shipped look exported in the same run and reading its anchor
  exactly — 21.9 → 4.0, Pink IR 16.8): NIR_3406 stage off → on **17.4 → 3.3**
  against the shipped 21.9 → 4.0, mean chroma 63.6 → 80.5; NIR_1376 5.7 → 2.3
  against 8.2 → 2.5. The residual FALLS: a power curve's slope is below 1
  wherever the sky's saturation already sits (0.5/√s at s = 0.4 is 0.79), so
  it compresses chroma differences as it raises the mean. 0.20× Pink IR on the
  defect frame after the stage, from 0.24×.
- The pale speckle where the eye sees it (`speckle.mjs`: sky pixels more than
  0.06 luma above a 21 px mean, with a flat field and a single lifted pixel as
  its controls): 3406 5.1% of the sky at mean excess 0.229 as shipped, 5.6% at
  0.205 solved; 1376 8.2% → 4.4% at 0.114; 1651 2.7% → 2.8%. Unchanged. The
  patch of pale dots above NIR_3406's roof is in the shipped render too; it
  reads more strongly against a deeper blue, and the instrument says it is the
  same dots at the same excess.
- Neutrals (pixels colourless as shipped): mean luma −1.0% on 3406, −4 to −5%
  on 1376/1644/1651, where 6–11% of them darken by more than a tenth and gain
  chroma 19–24 — an HSV saturation boost on a blue-hued pixel lowers R and G
  and therefore luma. On those three frames the "neutrals" are 2–5% of the
  frame and are the hazy horizon; on 3406, where they are 19% and include the
  concrete, the concrete moves 1%.

**SHIPPED, 2026-09-18, on the owner's pick from the sheets:** `LOOKS.eir.raw.hsl`
bands 4 and 5 read `35,2,1` and `0,2,1`. `aerochrome-walk` now drives every
band's three sliders through the reader's own chips (check 7 held byte for
byte again once the build carried the bands — it had failed first, against
the 2.50.7 build, as it should) and gained check 10d: the sky's mean HSV
saturation on NIR_0063 after the Look press, 0.393 shipped → 0.570 solved,
floor 0.53. An increment, not a capability: two numbers in a look.

**Value, by the band's luminance — REJECTED BY MEASUREMENT, and the reason is
not the sky.** Luminance 0.7 lands the sky at 0.41–0.65, 0.5 at 0.31–0.50
(1376 hits 0.31, 1644/1651 0.37, 3406 0.42, 0063 0.50). And at 0.5 it darkens
by more than a tenth **41% of NIR_1376, 55% of NIR_3406, 42% of NIR_1651**.
Decomposed by each darkened pixel's chroma AS SHIPPED (grey < 12/255, faint
tint < 36, pale tint < 80, colour above): on 1376 that 41% is grey 3.8%, faint
7.6%, **pale 10.8%**, colour 18.8%; on 3406, grey 2.1%, faint 10.8%, **pale
23.2%**, colour 19.3%. The colour is the sky, which is the intent. The grey and
most of the faint tint would be spared by weighting the band's luminance by
saturation, which is what darktable's colour equalizer does (a saturation
threshold and steepness set how much a low-saturation pixel may be changed;
docs.darktable.org, "color equalizer") and what Lightroom's HSL does in
effect. **The pale tint is neither.** It is NIR_1376's IR-bright field and
NIR_3406's concrete apron and horizon haze — pale blue-white ground that
shares the sky's hue band at a chroma no gate separates from a pale sky. A
hue band cannot tell a pale-blue field from a pale-blue sky; nothing shaped
like a band can. The pictures show it as a grey-blue cast over the whole
ground of 1376 at 0.7, deepening at 0.5.

**THE FIELD'S LEVER FOR THE SKY'S VALUE IS A SKY MASK, NOT A BAND.** Life Pixel
and Kolari reach for the HSL panel's aqua and blue luminance, which is the
lever measured above and fails the same way there; the Aerochrome-in-Lightroom
guides that darken the sky do it through Select Sky (Cuchara Valley Landscapes,
"Re-creating the Aerochrome film look in Lightroom", 2019; the same technique
in Imagen's guide). This app already builds a sky selection — `buildSkyMask`,
the bitmap the smoothing stage (§9l) blends inside, with a chroma gate that
keeps branches and clouds out of it. A depth carried by that selection and
that gate reaches the sky's value without the band's reach into the ground.
Its prototype and what it measured are the next paragraph.

**THE MASK DEPTH, PROTOTYPED TWICE THE SAME DAY (not shipped; the patches are
in the session scratchpad, the numbers are here).** A multiplier on the pixel
after the smoothing blend, `1 − depth · mask · gate`, depth 0.5, in both
pipelines, rendered on the same seven frames through the same harness.

- *Prototype 1 — the mask and the stage's chroma gate only.* Reaches the film
  where the mask is right: 3406 sky value 0.76 → 0.40, 1376 0.55 → 0.38, 1644
  0.65 → 0.42, 0063 0.89 → 0.51; concrete, field and foliage untouched on those
  frames (neutrals 0.4% darkened on 1376, 0.3% on 0063). And darkens the wrong
  thing where the mask is wrong: NIR_0627 has no sky, `buildSkyMask` gives it
  58% anyway, and its blurred red background went from value 0.42 to 0.28 with
  28% of its neutrals darkened — the map's target there IS the background's
  own chroma, so the stage's gate passes everything.
- *Prototype 2 — the same, weighted by the pixel's own hue (175–245°, fading
  over 25°) and chroma (12–36/255).* Fixes the false positive outright: 0627
  0.1% of the frame moved, foliage 0.42 → 0.42; every frame's grey neutrals
  0.0% darkened; foliage value unchanged to two decimals on all seven. Sky
  value 3406 0.43, 1376 0.39, 1644 0.42, 0063 0.51, 2082 0.59, 1651 0.62.
  Combined with the band saturation: 3406 0.56 at 0.41, 1376 0.81 at 0.40, 1644
  0.87 at 0.43 — the film's 0.66 at 0.32 within a tenth on both axes for the
  first time. Speckle instrument unchanged (3406 5.1% at 0.205). On the
  EXPORT (same instrument as above, Pink IR's 16.8 anchor held in the same
  run): NIR_3406 stage off → on 17.4 → 1.6, NIR_1376 5.7 → 1.2 — but the
  mean chroma halves with it (80.5 → 40.0, 69.1 → 34.3), because a multiplier
  on the pixel scales chroma with luma. The residual's share of the sky's
  chroma is what it was; the number is smaller because the sky is darker.

**AND THE PICTURES SAY IT CANNOT SHIP ON TODAY'S MASK.** Three costs, all
visible on the sheets, none of them in the film instrument's numbers:
- **A rim at every sky boundary.** The mask is a 384 px bitmap feathered at
  0.5, upsampled seven times to the working copy; the depth rides its ramp,
  and the horizon haze just above NIR_3406's roofline sits below the chroma
  gates, so a pale band stays where the sky above it went dark. NIR_1376 shows
  it as a lighter halo around the oak's crown, NIR_2082 along every roof and
  wire. A luma multiplier cannot hide a soft mask the way a chroma blend can.
- **Speckle on a hazy sky.** NIR_2082's overcast sky reads saturation 0.21;
  its pixels' hue and chroma are noise around that, so a depth keyed on either
  darkens half of them and leaves the rest — a snowstorm of pale dots over
  grey. The band luminance at 0.5 does the same there, for the same reason.
  The film would not darken an overcast sky at all (white light records
  through every layer); the proxy for "blue sky" here is chroma, and a pale
  sky's chroma is not a signal at pixel scale.
- **A seam under a cloud.** NIR_1651: the cloud is spared by the gates and the
  clear sky beneath it is not, and the boundary between them is the gate's
  width, not the cloud's edge.

**So the value half is a SELECTION problem before it is a colour one.** What
it needs, in order: the sky bitmap refined to the working copy's edges (a
guided or edge-aware upsample of `buildSkyMask`'s output against the frame's
own luma, so the ramp follows the roofline rather than a 384 px feather); the
depth keyed on the map's LOCAL sky chroma — the 128-texel target the stage
already carries — rather than the pixel's, so a hazy sky is left pale as a
whole and a deep one darkened as a whole, with no per-pixel lottery; and a
window on that local chroma that leaves an overcast sky alone, which is the
film's physics rather than a taste. Recorded in decision 017 as the route,
ranked behind the saturation half and beside 006 (mask by subject), whose
selection this is.

### 4b-v. THE SKY'S VALUE, THROUGH A SELECTION ACCURATE TO THE PICTURE'S EDGES

**What 4b-iv left:** the film's sky is dark as well as blue (0.32 against
0.55–0.89 here); a band cannot darken it without the pale ground; a depth
through the 128-texel sky weight leaves a rim along every roofline, a
snowstorm on an overcast sky and a seam under a cloud. Three things were
named as what it needs, and this note is the three built, on 2026-09-18.

**1. The selection refined to the picture's edges — `src/skyfine.ts`.**
`buildSkyMask`'s 384 px feathered bitmap is taken up to 1024 px on the long
edge and snapped to the photograph's own edges with a GUIDED FILTER (He, Sun
and Tang, *Guided Image Filtering*, ECCV 2010 / TPAMI 2013 — the field's tool
for joint upsampling and mask feathering, and the one Adobe-class mask
refinement rests on): in every window the output is a linear function of the
guide, so it inherits the guide's edges and keeps the mask's values away from
them, in O(N) through summed-area tables. **The guide is two channels of the
gray-world-balanced frame, gamma luma and blue share**, not luma alone: in an
infrared frame IR-bright foliage and a bright sky sit close in luma and far
apart in colour, which is the same fact the bitmap's own cluster rests on.
Radius 6, eps 0.005 (guide units squared); the luma channel is normalised to
the frame's 99.5th percentile so a dark frame's edges weigh what a bright
one's do. Built once per photograph beside the bitmap, cached per decoded
image (a WeakMap, so a set of forty tiles never grows one twice), uploaded as
one R8 texture and sampled by the brush sampler on the CPU — the same texel-
centre bilinear the shader does.

**2. The depth keyed on the sky's LOCAL colour, not the pixel's — the map's
fourth byte (`src/skymap.ts`).** Every 128-texel map texel now carries, beside
its mean chroma and the bitmap's weight, a KEYING byte from the texel's mean
rendered colour: `smooth01(0.32, 0.42)` on its HSV chroma, times the sky's hue
band (175–245° fading over 25°). The window's numbers are the seven frames'
own, measured with the aqua and blue saturation the look ships: an overcast
sky (NIR_2082) reads 0.27, a frame with no sky whose bitmap fires anyway
(NIR_0627) 0.31, the clear skies 0.43–0.57. The film does not darken an
overcast sky — white light records through every layer — so the window is
physics before it is taste; and it lives per TEXEL so a hazy sky's pixels stay
pale together instead of half of them. Keyed per pixel, NIR_2082 snowed.

**3. The stage.** After the smoothing blend, one multiplier on the pixel:
`1 − skyDepth · fine(u, v) · key(u, v)`, in `compileEdit` and the shader
alike. `skyDepth` is a look field like `skySmooth` (Aerochrome carries 0.5),
an `EditParams` field wired through the five places, a **Sky depth** slider
beside Sky colour smoothing, `selection` in `.scope-allow`, and it rides a
saved look. The tile path now builds the sky map from its own sampler at the
tile's size and passes the coarse bitmap as the fine one (at 260 px it is the
finer of the two), so a tile under Aerochrome agrees with the photograph; the
batch export refines per frame, because a batch is developed at full size
where the coarse bitmap's rim would be widest. `PREVIEW_PIPELINE` 30.

**Measured on the same seven frames, Restore depth on, through the app**
(`skysolve-measure.mjs` with a Sky depth override; the reference is the
shipped 2.50.10 look at depth 0 on this build):

- **Sky value at depth 0.5** (film 0.32): NIR_3406 0.76 → 0.42, NIR_1376 0.56
  → 0.40, NIR_0063 0.88 → 0.50, NIR_1644 0.65 → 0.42. Saturation unchanged on
  every frame (the depth is a multiplier on the pixel; HSV saturation does
  not move), so the saturation half's three-of-seven stands.
- **Left alone, as designed:** NIR_2082's overcast (key 0: its sky's mean
  chroma 0.27 sits under the window) and NIR_0627, the no-sky frame whose
  bitmap fires on a blurred red background (hue band 0) — 0.0% of either
  frame darkened. NIR_1651 barely moves (0.65 → 0.65) for a different reason:
  `buildSkyMask` finds 9.7% of that frame, the cloud-topped strip at the top
  edge, and not the blue sky beside the tree. That is the bitmap's limit on
  a frame whose top edge is cloud, and it is recorded here rather than worked
  around.
- **Nothing else moves.** Greys darkened by more than a tenth: 0.0% on five
  frames, 0.4% on 1376, 2.1% on 1644; foliage saturation and value unchanged
  to two decimals on all seven; the pale IR-bright field of 1376 and the
  concrete apron of 3406 — the band's casualties in 4b-iv — untouched, which
  is the whole difference between a selection and a band.
- **The rim, by the instrument built for it** (`rim.mjs`: luma 4 px above the
  sky's lower boundary against 40 px above, the boundary found on the
  reference render, controls a flat field and a planted 6 px band): 3406
  +0.043 mean (+0.079 at the 90th percentile) added over the photograph's own
  +0.022; 1376 +0.032 (+0.047). That residual is the refined edge's own width
  — a guide pixel is 2.7 working pixels, so the edge steps over about ten —
  and reads as a soft edge at the roofline on the sheet, not a band.
- **Speckle unchanged** (3406 5.56% → 4.78% of the sky at excess 0.205 →
  0.192; 2082 identical), and the hot spot's pale centre on 3406 stays where
  it was: the lens's added light is not the depth's to remove, and the
  reader's lens correction is still the tool for it.
- **Cost:** on this machine, for a 21-megapixel frame, the bitmap 160 ms,
  the guide 210 ms, the refinement 200 ms at 1024×682 — paid once per
  photograph, on the first edit that carries a depth, never at open.

**WHAT TURNED OUT WRONG ON THE WAY, in the order it was found.** Three
builds, each caught by a picture or an instrument rather than by the film
instrument, which was green on all three.
1. *The key per texel.* The first build keyed the depth on each 128-texel's
   own mean chroma against a 0.32–0.42 window, and a clear sky's own chroma
   gradient became the depth map: NIR_3406's hot-spot centre stayed pale
   inside a ring of dark texel blocks, NIR_2082's overcast grew dark blocks
   wherever one texel crossed the window, NIR_1376 mottled. The film
   instrument read 3406 at 0.53 and said nothing else. A sky's chroma varies
   across a frame by more than any window is wide; the key is per photograph
   now, and only a GREY texel (a cloud, chroma under 0.06–0.14) is spared on
   its own.
2. *The guide.* Luma alone read the bright sky round 1376's crown as the
   crown's side and left a halo; colour shares alone (red, blue) read the pale
   haze above 3406's roofline as roof and left a pale band (rim +0.130). Both
   at once — the per-window fit takes whichever separates there — and the
   crown is crisp and the haze is sky.
3. *The input.* Fed the FEATHERED bitmap, the guided filter kept the feather
   wherever its window did not reach an edge, and learned the sky's gradient
   as "less sky": the refined mask sloped to 0.85 over the 200 px above the
   roofline (`maskprobe.mjs`, which writes the coarse and refined masks as
   pictures). Read as a hard selection cut at half, the filter grows its own
   edge from the guide — a 25 px ramp across a hard edge comes back 4 px
   wide, the probe's control — and the mask is solid to the roofline.

## 4c. THE CRUX IS NIR CONTAMINATION, AND A ROTATION ALONE CANNOT FIX IT

**Researched 2026-09-16, after shipping the rotation bare and reporting that it
looked worse than the swap.** It did look worse. It was also a quarter of the
recipe, and the missing three quarters are written down by the people who do
this for a living. Section 4b establishes WHAT the film's mapping was; this
section is why reproducing that mapping on a converted camera is not enough.

**THE FILM'S THREE LAYERS WERE SEPARATE. A CONVERTED SENSOR'S ARE NOT.**
Aerochrome registered red, green and NIR as three independent records. A
converted digital sensor registers **red + NIR, green + NIR and blue + NIR** —
the infrared flood is present in every channel, because no mass-market filter
transmits red, green and NIR while excluding the rest of the visible band. So a
channel rotation permutes three CONTAMINATED channels. It cannot separate what
the film separated optically, and no value of it ever will.

**MEASURED ON A REAL NEF, AND THIS IS EXACTLY THAT EFFECT.** Warm population
(the vegetation), same frame, same white balance sliders in both cases:

- under the R/B swap: rgb **177, 102, 105** — saturation 0.424
- under the bare rotation: rgb **177, 131, 128** — saturation 0.277

The red is IDENTICAL. What the rotation does is lift green and blue UNDERNEATH
the reds, because `green <- red` pours the IR-flooded channel into green and
vegetation is exactly where infrared is highest. **The reds are not lost, they
are diluted from below.** A session measured this and concluded the mapping was
wrong; the mapping is right and the contamination is the thing to remove.

**THE FULL RECIPE IS FOUR STEPS.**

1. **A usable white balance** — custom WB on foliage in full sun at capture, or
   gray-world in post. Section 3 is why the camera's own is not one.
2. **The two swaps** — red/blue, then blue/green. In channel-mixer terms, first
   `Red = 0,0,100` with `Blue = 100,0,0`; then `Blue = 0,100,0` with
   `Green = 0,0,100`. They compose to row-major `[0,0,1, 1,0,0, 0,1,0]`, which is
   section 4b's rotation reached from the other direction — two independent
   sources give the same matrix.
3. **Subtract the NIR contamination**, with NEGATIVE mixer coefficients. This is
   the step nobody's tutorial spells out and the one Hidden Realms names as the
   crux. Its own proposal — "-100 percent for blue" on each output — is
   explicitly untested by its author, and taken literally it zeroes the red
   output, which under this mapping IS the blue input. So it is a DIRECTION to
   sweep, not a number to copy.
4. **An HSL pass after the swaps** — reds and oranges carry the foliage
   saturation, aqua and blue pull the sky back to a deep cyan or navy. Every
   practitioner source ends here, and `LOOKS.aero` already does exactly this
   shape on its JPEG side.

**AND THE NUMBER THAT SAYS WHEN IT HAS BECOME A TINT IS THE SKY'S VALUE.**
Measured across a green-row sweep on one frame: the sky sat at value 0.50-0.52
through every candidate that still read as a look, and jumped to **0.76** on the
two that had turned the whole frame magenta - sky included. Foliage saturation
rose monotonically across all of them and said nothing about which was which.
Report the sky's value beside every candidate; it is the discriminator section
4b asked for and could not name.

**Sources.** The layer structure and the yellow filter are section 4b's. This
section's claims come from: Hidden Realms, "The crux of emulating Kodak color
infrared" (the contamination argument and the negative-coefficient proposal,
which that page marks untested); Kolari Vision's 550nm processing tutorial (the
two swaps with their exact mixer values, and the hue/saturation pass on blues
and cyans afterwards); Rob Shea Photography's colour-infrared Photoshop actions
(three named variants — a plain R/B swap, an R/B swap with green taken from red,
and an R/B swap with green SPLIT 50/50 between red and blue); and an Aerochrome
Lightroom-preset guide for the finishing rule that reds and oranges carry foliage
saturation while aqua and blue set the sky. **Rob Shea's "G Split" is worth
testing on its own** - replacing green with the mean of red and blue collapses
the frame toward the red-blue axis, which is the magenta/cyan axis Aerochrome
lives on, and it is expressible in this app's mixer as `[0,0,1, 0.5,0,0.5, 1,0,0]`.

### 4c-i. SOLVING IT, AND WHAT THE SOLVE PROVED IMPOSSIBLE

Added 2026-09-16, after every earlier candidate came from moving a control and
reading the result. **A 3x3 colour matrix is determined by three anchors** — say
what foliage, sky and a neutral material must become, and the matrix that does it
is a linear solve. So: measure the anchors at the point the mixer runs, state the
targets, solve.

**The anchors, measured on NIR_1376.NEF** in the state where nothing after the
mixer is doing anything (Restore depth off, saturation and contrast at 1), read
off the canvas and linearised:

- foliage `(0.3272, 0.2401, 0.2407)` — 9.9% of the frame
- sky `(0.2126, 0.2677, 0.2621)` — 21.3%
- neutral `(0.3414, 0.3477, 0.3470)` — 56.4%

**THE SOLVE'S FIRST RESULT IS AN IMPOSSIBILITY, AND IT IS THE USEFUL ONE.** Those
three vectors are nearly coplanar: `det = 1.42e-4` against row norms near 0.5, a
normalised determinant of `1.17e-3`. Green and blue agree to within 0.6% in ALL
THREE populations. That is section 4c's NIR contamination as a number — both
channels are dominated by the same infrared flood, so they carry nearly the same
information. **The exact three-anchor matrix needs coefficients up to 22.65
against a mixer that clamps at 2.** No adjustment of the mixer can put all three
populations where Aerochrome puts them, on this camera's data. That sentence is
not reachable by sweeping.

**So the mixer carries two anchors and a hue band carries the third.** All three
pairings solved, minimum-norm:

- **foliage + neutral** — max coefficient **1.39, in range**, sky falls at hue
  156 / sat 0.36 by consequence. THIS IS THE ONE.
- foliage + sky — 1.44, in range, but neutral lands at hue 262 / sat 0.23:
  purple rock and bark, which is the reference's own failing case (section 4b).
- sky + neutral — 2.35, out of range.

**The numbers, fitted to ONE FRAME.** Matrix, row-major, applied over the R/B
swap: `[0.998, -0.005, 0.007, -1.382, 1.196, 1.163, -0.405, 0.706, 0.691]`,
then a **+36 degree hue shift on the Green and Aqua bands** to carry the sky to
cyan 200. Only one real raw is on disk; the 44 practice DNGs are hand-written
minimal files (section 7) and are the wrong instrument for a colour question. A
matrix fitted to one photograph is fitted to that photograph, and this one has
not been checked against a second.

**PREDICTED AND MEASURED, WHICH IS WHAT MAKES IT A SOLVE.** Predicted foliage
335, sky 156 before the band shift, neutral unchanged. Measured 332, 158, and
neutral saturation 0.05 from 0.06. Three degrees.

**TWO THINGS THE FIRST SOLVE GOT WRONG, BOTH CAUGHT BY MEASURING.**

- **The band shift was solved at the wrong saturation.** At saturation 1 the sky
  needs +44 degrees; at the look's own 3.0 it lands further round and needs
  **+36**. Solve a correction where it will actually be applied.
- **A norm penalty was expected to cut the chroma grain, and does the opposite.**
  The argument was that smaller coefficients amplify less noise. Measured at the
  look's real strength, sky chroma spread over level: **0.24 at lambda 1e-5,
  0.38 at 1e-3.** The absolute spread barely moved (26.6 to 31.3) while the
  wanted chroma fell a quarter, so the penalty makes the grain RELATIVELY worse.
  Max-coefficient is not a proxy for grain. The unpenalised solve is the better
  one, and the visible speckle in a dark sky is the price of the operation
  itself — if it needs fixing it needs denoise or chroma smoothing, not a
  smaller matrix.

### 4c-ii. THE ROUTE THAT USES NO MATRIX, AND WHAT IT PROVED ABOUT THIS CAMERA

Read first-hand 2026-09-16 from LifePixel's "How to Emulate the look of
Aerochrome Film" (Dan Wampler). An earlier version of this section was written
from a search summary and was wrong in two places; both are corrected below.

**The author's stated target:** foliage bright red and magenta, sky a strong
blue saturation.

**The recipe, complete. It rotates nothing and uses no colour matrix.**

1. Start from a **Super Color** conversion. Levels, contrast, tone, and swap the
   red and blue channels.
2. Hue/Saturation, **Cyan** band: hue to the RIGHT. A Super Color frame has both
   blue and cyan in the sky after a swap and the look wants only blue.
3. Hue/Saturation, **Red** band: hue to the LEFT, so the reds become pronounced.
4. Hue/Saturation, **Yellow** band: hue to the LEFT, turning the yellows red.
5. **Selective Color on Red: adjust the BLACK within the red tones.**

**THE PAGE CARRIES NO NUMBERS.** Every step is "move the slider", and the author
says outright that it will not work with every image and that each one needs
different adjustments. So any value here is derived, never quoted. The two
corrections to the second-hand version: step 4 was missing entirely, and step 5
is LUMINANCE — adding black to the reds — not saturation, which is what a
summary-derived note here previously claimed.

**Rendered faithfully on NIR_1376.NEF**, values derived from where this frame's
populations sit (sky near 175, foliage near 357) and from the instruction itself
for the yellow shift (the full distance to red, which is also the slider limit):
cyan +45, red -22, yellow -60, and red luminance 0.85 for step 5.

**AND IT CANNOT REACH ITS OWN TARGET HERE. FOLIAGE SATURATION IS 0.51 BEFORE THE
RECIPE AND 0.51 AFTER.** Every step is a hue ROTATION; not one of them adds
saturation. Step 5 moves value 0.70 to 0.66 and nothing else. "Bright red and
magenta" is not something a hue shift can manufacture — the colour has to be in
the file already.

### 4c-iii. WHAT THE FILES SAY ABOUT THE CONVERSION, AND WHAT THEY CANNOT SAY

Section 1 records that how far the channels can be pulled apart is a fixed
property of the conversion and never records WHICH. The anchors in 4c-i narrow
it. **They do not settle it, and an earlier version of this section said they
did — it read "a DEEP cutoff", which is more than the measurement supports.**

The anchors say TWO separate things and they pull in different directions:

- **Red separates strongly from green and blue** — foliage R 0.3272 against G/B
  near 0.240. That separation is the entire reason these files carry usable
  false colour at all, and a genuinely deep conversion would not have it.
- **Green and blue do not separate from each other** — 0.2401/0.2407,
  0.2677/0.2621, 0.3477/0.3470. Agreement to within 0.6% in all three
  populations. That collapse is what makes the Aerochrome matrix
  ill-conditioned (4c-i) and it is why no 3x3 can place all three anchors.

Strong red with green and blue collapsed together is a **mid-to-deep**
signature, the 665-720nm region — not 720nm-and-up, and plainly not 590nm: the
Super Color class LifePixel's tutorial assumes renders GOLDEN-YELLOW foliage
after a swap (Kolari's own description of it), and these frames render pink.

**AND A FILE-BASED INFERENCE CANNOT IDENTIFY A CUTOFF, ONLY BRACKET ONE.** What
actually settles it is the converter's own record of the filter they installed —
nothing in EXIF carries it, because the conversion is a physical filter swap the
camera knows nothing about — or a photographed spectrum: a tungsten lamp through
a slit onto a diffraction grating, with a CFL shot through the same rig to
calibrate the scale against its known emission lines. Kolari's per-cutoff
appearance descriptions are the comparator for the bracket; they are not an
identification.

**This is the fact under both routes, and it explains the choice between them.**

- The no-matrix route is clean — nothing subtracts one noisy channel from
  another, so a dark sky renders smooth — and its foliage stays salmon, because
  there is little colour in the file for a hue shift to move.
- The solved matrix reaches foliage saturation 0.67 and a cyan sky, and pays for
  it in chroma grain, because manufacturing that separation means subtracting two
  channels that are 99.4% the same.

**You can have the saturation or you can have the clean sky.** That is not a
tuning trade-off to be optimised away; it is the cutoff, and it is why every
route through the mixer grains and every route through hue alone stays pale.

**And the sources disagree about the sky regardless.** LifePixel says drive the
cyan out until it is blue; section 4b's reference says deep cyan. Different
pictures, both defensible, and choosing is not a measurement.

### 4c-iv. ONE NUMBER UNDER ALL OF IT: THE CHANNELS ARE NOT INDEPENDENT

Measured 2026-09-16 and reported by the app itself from this release on — the
"Conversion" line of the diagnostic, `conversionDiagnostic` in `src/main.ts`,
asserted by `tools/conversion-walk.mjs`.

**Correlation between the channels, on the decode, on NIR_1376.NEF:**

- green / blue **0.991**
- red / green **0.993**
- red / blue **0.975**

**All three channels carry essentially one signal.** Red is not more independent
than green and blue are from each other — red/green is the HIGHEST of the three.
That is the infrared flood: everything in the frame tracks it together.

**CORRELATION, BECAUSE MEANS MEASURE THE WRONG THING.** The first version of this
measurement compared channel MEANS and read this camera as "590nm class", which
cannot be right: a 590nm conversion renders golden-yellow foliage after a swap
and these files render pink. A mean-to-mean ratio is dominated by the per-channel
GAIN the conversion and the camera impose, and a gain is exactly what white
balance removes. The same file, the same two channels: **37.9% apart on the
decode, 0.6% apart after balancing** — a sixtyfold disagreement, because one of
those numbers is measuring the balance. Correlation is scale-free and does not
move when a channel is multiplied by anything.

**THIS CORRECTS 4c-i's EXPLANATION, NOT ITS RESULT.** That section said green and
blue "carry nearly the same information" and treated it as a property of those
two. It is a property of all three, and what makes the anchor matrix
near-singular is that every population is built from one underlying signal plus a
small residual. The impossibility stands; the reason is broader than stated.

**AND IT PUTS THREE SEPARATE FINDINGS UNDER ONE FACT.** The false colour these
files can carry lives in the one to two per cent that is NOT shared between
channels, amplified about threefold by a look's saturation. So:

- the mixer route **grains** — it amplifies residuals, and residuals are where
  the sensor noise lives (4c-i's speckle);
- the hue route **stays pale** — there is almost nothing to rotate (4c-ii);
- and **no 3x3 can place three targets** — the anchors are near-coplanar (4c-i).

Three mysteries, one measurement.

**IT DOES NOT NAME A CUTOFF AND THE APP DOES NOT EITHER.** An earlier draft
printed a nanometre class and was wrong the first time it ran. Nothing in a
photograph names a cutoff: the conversion is a physical filter swap the camera
never learns about, so EXIF cannot carry it. The converter's own record, or a
photographed spectrum — a tungsten lamp through a slit onto a diffraction
grating, calibrated against a CFL's known emission lines — identifies it. The
diagnostic reports what the file can DO, which is the part the app needs.

### 4c-v. SIX FRAMES, AND THE END OF "FITTED TO ONE PHOTOGRAPH"

Measured 2026-09-16 on six raws from different scenes, supplied by the owner
after every number in 4c-i through 4c-iv had been fitted to NIR_1376 alone.
`tools/anchor-sweep.mjs` is the instrument.

**READ THE DIRECTION, NOT THE LEVEL — THE FIRST LOOK AT THIS WAS WRONG.** The
raw anchors scatter violently across the set: foliage standard deviation is
60-70% of its mean, and the frames range from 0.805 to 0.184 on red, a factor of
four. That is EXPOSURE. A colour matrix acts on the DIRECTION of an anchor
vector, not its length, and normalised to chromaticity the same six frames agree:

- foliage, spread as a share of the mean: **3.9% / 5.7% / 2.1%**
- sky: **3.6% / 2.4% / 4.4%**
- neutral: **0.6% / 1.0% / 0.7%**

Bare ground is consistent to under one per cent across six different scenes.
**So a single matrix generalises on this camera; it does not need solving per
photograph** — which was the open question, and the answer decides the shape of
the feature, not just its numbers.

**THE SIX-FRAME MATRIX**, minimum-norm, foliage onto crimson 335 with bare
ground held where it is, applied over the R/B swap:

    [0.991, -0.064, 0.072,  -1.438, 1.373, 1.023,  -0.473, 0.811, 0.653]

Largest coefficient 1.44 against a mixer that clamps at 2. Foliage lands on 335
at saturation 0.65, neutral at 0.031, and the sky falls at 158 by consequence.
**The band shift is 32 degrees**, measured at the LOOK'S OWN STRENGTH on two
frames (33 and 31) rather than at saturation 1 — the error 4c-ii records.

**HOLD-ONE-OUT, WHICH IS WHAT MAKES IT A CLAIM ABOUT THE CAMERA RATHER THAN
ABOUT SIX FILES.** Fit on five frames, apply to the sixth the fit never saw:
foliage lands on hue 335 every time, **worst error 1.9 degrees**; the sky lands
between 157 and 159; neutral saturation stays between 0.016 and 0.073.

**AND THE ONE-FRAME MATRIX WAS NOT BADLY WRONG.** Largest single-coefficient
difference 0.177, and applied to the six-frame anchors it still puts foliage on
335, at saturation 0.61 against 0.65, with neutral at 0.042 against 0.031. Worth
recording because it says something about the method: anchors measured on ONE
frame of this camera already carried most of the answer, and the six-frame fit
tightened it rather than overturning it.

**ONE FRAME IS THE OUTLIER AND IT EXPLAINS ITSELF.** NIR_1379 holds 3.0% foliage
and 0.2% sky — there is almost nothing of either population in it. Its foliage
chromaticity is the only one off the cluster, its channel correlations are the
only ones outside 0.94-0.99 (0.849 and 0.784), and it is the frame that carries
the 1.9-degree hold-one-out error. A population that is a fiftieth of a per cent
of the frame is not a measurement. **`anchor-sweep` prints each population's
share for exactly this reason.**

### 4c-vi. THE GRAIN IS THE SIGNAL'S OWN, AND ONE REMEDY IS RULED OUT

Measured 2026-09-16 on two frames from the test set, under the six-frame matrix,
at the look's real strength, and RENDERED — every figure here sits on a picture
of the pixels it was taken from. Measured over LEVEL throughout, never absolute
spread, for the reason 4c-i records.

**SUBTRACTING NEAR-INFRARED BEFORE THE MATRIX CANNOT HELP, ALGEBRAICALLY.** A
linear subtraction composes with the matrix: "subtract a times blue, then apply
M" IS a different 3x3, and the minimum-norm solve already searched that entire
space. The earlier `-0.30` candidate (4c-ii) looked better than the bare rotation
because it changed the COLOUR; its grain was never measured and no claim about it
was made.

**FIRST, THE MEASUREMENT THAT PRODUCED THE REST OF THIS SECTION WAS WRONG, AND
THE PICTURES ARE WHAT CAUGHT IT.** The numbers below replace an earlier set; the
paragraphs they overturned are kept as 4c-vii because the way they failed is
worth more than the numbers were.

Two instruments failed in the same direction — both counted the photograph and
called it noise.

- **The region finder could not tell cyan sky from cyan foliage.** It scored
  blocks by hue, and under this matrix the foliage renders cyan too, so on
  NIR_1534 it chose a hillside with complete confidence and the sheet went out
  labelled "sky crop". Flatness is the right test twice over: a smooth block is
  what sky IS, and a smooth block is where speckle is visible rather than being
  mistaken for detail. Blocks are now scored by luminance spread over level,
  lowest wins, with a brightness floor so a black shadow cannot win by being
  empty.
- **A chroma spread over a block is mostly the subject.** A branch against sky
  moves chroma far more than any speckle does, which is how a canopy scores
  "grainier" than a smooth field while looking like a tree. Grain is HIGH
  FREQUENCY: measure each pixel's chroma against the mean of its 5x5
  neighbourhood and count only the residual.
- **But so is an edge, and that was the second failure.** A box mean at a hard
  boundary leaves a large residual, so the first high-pass version scored a
  planted magenta/cyan edge with no noise in it at all at **7.4%**. The MEDIAN of
  the residuals is what is reported now — edge pixels are a small minority while
  speckle is on every pixel, so the median sees the speckle and the edge cannot
  move it. Planted cases: flat reads 0.00, a noiseless hard edge reads 0.00, the
  noise sigma doubles and the reading doubles, and an edge with noise reads the
  same as the noise alone. The test failed on the edge case before it passed,
  which is the only reason the median is there.

Two figures per arm, both over exactly the pixels in the panel that carries them:
**colour** is mean chroma magnitude, and **speckle** is that median high-pass
chroma residual as a percentage of luminance level.

**RAISING DENOISE WORKS, AND THE EARLIER READING THAT IT DID NOTHING WAS THE
INSTRUMENT.** `src/raw/denoise.ts` runs on the decoded data before the edit
chain, so it cleans what reaches the mixer — the right place to attack, and it
does in fact attack it. On NIR_1480's flattest block (luma spread over level
0.089, so genuinely smooth):

- matrix at the opening denoise — colour **31.4**, speckle **6.04%**
- matrix at denoise 0.80 — colour **26.9**, speckle **3.61%**

**A 40% cut in speckle for 14% of the colour**, and it is visible in the sky of
the full frame rather than only in the number. Per unit of colour it moves
**0.192 to 0.134**. NIR_1534 moves the same way, 14.73% to 11.10%.

**THE SWAP IS LOWER IN BOTH, AND THE RATIO IS WHAT MATTERS.** At matched denoise
the bare swap carries less speckle AND less colour:

- NIR_1480 — swap **4.03%** speckle at colour **20.5**, against matrix **6.04%**
  at colour **31.4**
- NIR_1534 — swap **9.32%** at colour **33.6**, against matrix **14.73%** at
  colour **60.0**

Per unit of colour those are **0.197 against 0.192** on NIR_1480 and **0.277
against 0.246** on NIR_1534 — the matrix is level with the swap on one frame and
slightly BETTER on the other. Denoised to 0.80 the two land on the same figure to
three decimals on NIR_1480, **0.134 each**. **So the ratio is a property of the
data and not of the mapping**, which is what this section always claimed; the
earlier numbers simply could not support it. What the matrix does is raise
amplitude — roughly double the colour, and the absolute noise doubles with it,
and absolute noise is what the eye sees. **The colour and the grain come out of
the same 1-3% residual (4c-iv) and scale together.**

**AND NIR_1534 CANNOT SETTLE ANYTHING ABOUT GRAIN.** Its flattest block scores
0.277 luma spread over level against NIR_1480's 0.089 — there is no smooth region
in that frame, and the canopy the finder settles on is mostly real detail. Its
speckle figures are comparable ACROSS ARMS, because every arm is measured on the
same pixels, and are not comparable to another photograph's.

**SUBTRACTING NEAR-INFRARED BEFORE THE MATRIX STILL CANNOT HELP.** That argument
is algebraic and no measurement touches it; it is above and it stands.

**WHAT IS LEFT.** Every lever tried so far is a per-pixel one, and a per-pixel
operation cannot separate colour from its own noise when they arrive in the same
numbers. The one axis untried is SPATIAL: chroma smoothing after the mixer — blur
colour, keep luminance sharp, the reason JPEG subsamples chroma. Noise is
high-frequency and the wanted colour largely is not, which is the only difference
between them that remains. Nothing in this pipeline does it today.

### 4c-ix. THE PALE PEPPER IN A DEEP SKY IS IMPULSE NOISE, AND NEITHER SMOOTHER CAN TOUCH IT

Measured 2026-09-17 on a raw shot the day before, at **ISO 100**, plus the frame
this repository already carried. Both have it. The instrument found it on neither
until the metric and the magnification were both fixed, which is the first thing
this section records.

**THE TWO WAYS THE INSTRUMENT HID IT.** A fitted screenshot of the whole frame is
a downscale, and a downscale averages single-pixel dots out of existence — the
render looked clean at 724px and is dense with pepper at 1:1. And the metric was
the share of pixels carrying NO hue, which is an absolute; these dots are not
achromatic, they are pale and far less saturated than the sky around them. A
whole ablation was run and reported against a frame described as not having the
artefact, and it had it.

**THE READING THAT SEPARATES A PEPPERED SKY FROM A CLEAN ONE** is the tenth
percentile of chroma over the median, inside one sky block. A sky with an even
colour reads near 0.94. Both of these frames read 0.65 to 0.72 in every sky block
measured, and the ratio worsens as the sky deepens.

**NO STAGE OF THE LOOK CREATES IT.** Ablated one at a time, reading that ratio:
with no look at all the ratio is already 0.67, so it is in the decode. Restore
depth off leaves it at 0.65. Saturation 1 leaves it at 0.68. Contrast 1 leaves it
at 0.66. Only the mixer moves it, 0.65 to 0.74, which is its large coefficients
amplifying channel noise rather than making it. Saturation makes it VISIBLE, and
the two are different claims.

**ISO 100, so it is not gain noise.** It is shot noise on a starved channel: an
infrared conversion blocks visible light from the blue photosite, so in a deep sky
the quiet channel is recording almost nothing whatever the sensitivity is set to,
and the relative noise on it is largest exactly where the sky is deepest. That is
a property of the conversion, not of the exposure, and no shooting change reaches
it.

**AND NEITHER SMOOTHER IN THIS APP TOUCHES IT.** Denoise at 1.00 leaves the sky
unchanged. The chroma stage of 4c-viii at 1.00 leaves it unchanged — measured at
1:1 and looked at, both.

**The reason is documented rather than derived, and it names the remedy.** A
bilateral's range weight is what preserves edges, and a single pixel unlike its
neighbours is an edge as far as that weight is concerned: its weight collapses and
the pixel keeps itself. **A bilateral preserves outliers by construction**, which
is why salt-and-pepper noise is recorded in the literature as surviving bilateral
filtering. The standard remedy for impulse noise is a MEDIAN — a rank statistic
rather than a weighted mean, which is resistant to extreme values by the same
arithmetic that makes the mean vulnerable to them. The chroma stage inherits this
because it is mixed toward a mean of the same neighbourhood.

Sources: *Noise Reduction Using Enhanced Bilateral Filter*
(https://www.csie.ntu.edu.tw/~fuh/personal/NoiseReductionUsingEnhancedBilateralFilter.pdf);
*The Bilateral Median Filter*
(https://www.researchgate.net/publication/2869398_The_Bilateral_Median_Filter);
*Adaptive median filter salt and pepper noise suppression*
(https://www.nature.com/articles/s41598-024-66649-y).

### 4c-x. THE MEDIAN IS BUILT AND DOES NOT REACH IT EITHER — IT IS NOT IMPULSE NOISE

4c-ix named a median as the documented remedy for impulse noise and it was right
about the remedy and wrong about the diagnosis. The stage is built — a
decision-based median, per channel, on the centre pixel before the bilateral
reads it, in both renderers with the same nineteen-pair network — and at full
strength it leaves this sky visually unchanged.

**The control is live, which had to be established before the result meant
anything.** A sky block's bytes differ at every setting. The first threshold
mapping did NOT: it was `0.25/s²`, and since a pixel that IS the extreme of its
own window can be at most one window-spread from that window's median, every
position below strength 0.5 could never fire. That is a slider with a dead zone
reading as a stage that does nothing, and it was caught by hashing rather than by
looking. The mapping is linear from 0.47 to 0.02 now and the whole travel moves
the picture.

**So the artefact is not impulse noise, and the failure of the median is what
says so.** A median-of-9 replaces a pixel that stands alone against its
neighbours. At 1:1 this sky is not stray dots on a smooth field — it is a dense
mottle, roughly half the pixels, structured at **two to four pixels** rather than
one. A 3x3 window is filled by the texture, so its median is another sample of
the same distribution and replacing the centre with it changes nothing.

**Three filters have now been measured against it and none reaches it**: the
5x5 bilateral at full strength, the chroma mix at full strength, and the
decision-based median at full strength. They fail for three different reasons —
outlier preservation, luminance preservation, and window size — and the pattern
across those three failures is the finding: **the structure is correlated at the
scale of the sensor's colour mosaic, not at the scale of a pixel.**

That points upstream of every stage tested here, at the demosaic of a channel the
conversion has left almost nothing to record: blue is sampled at one photosite in
four, and interpolating a near-empty, noisy channel across that grid produces
correlated mottle at exactly two to four pixels. Nothing downstream of the
demosaic can undo a structure the demosaic invented. **That is where the next
look belongs, and it is not a filter.**

### 4c-xi. NOTHING IS ZEROED UPSTREAM — THE SKY'S BLUE IS 1.4% OF THE SENSOR'S RANGE

Measured 2026-09-17 on the reported frame, going up the pipeline rather than
down, on the hypothesis that pixels were being clamped away in the decode. They
are not, and the numbers say what is happening instead.

**THE BLACK CLAMP DESTROYS NOTHING.** `demosaicBinned` normalises every sample as
`max(0, (v - black) * scale)`, and that clamp is a real one — clipping negatives
after black subtraction biases noise to average positive rather than to zero, which
is a documented cause of shadow haze. Instrumented and counted on two frames:
**zero samples of 20.8 million are at or below black**, in any channel. Black is
1008, white 15520, and the lowest value anywhere in the file is 1009. Nothing in
the decode is zeroing anything.

**WHAT THE FILE ACTUALLY CARRIES IN A SKY.** Over the frame's top-left eighth,
above the black point: red 363..1011, green 174..525, blue **89..296**. Against a
full range of 14512 that is 4.5%, 2.4% and **1.4%**. The distinct-level counts
rule out quantisation as well — 196 distinct blue values in that patch, not a
handful.

So the sky's blue is one and a half per cent of what the sensor can hold, and the
rendering lifts it to roughly a third of display brightness. Everything rides that
gain.

**AND THE PREVIEW AND THE EXPORT DEMOSAIC DIFFERENTLY, WHICH IS NOT THE CAUSE
EITHER.** `demosaicBinned` turns one 2x2 quad into one pixel and averages only the
two greens — red and blue are single photosites with no averaging at all — while
`demosaicPixelLinearInto` averages two or four neighbouring samples wherever the
channel is not native. The export is therefore strictly better-conditioned on
blue, and exporting the frame and comparing the same sky at the same scene scale
shows **the same mottle**. The difference is real and it is not the mechanism.

**WHICH RETURNS THIS TO 4c-iii, WHOSE LAST PARAGRAPH ALREADY SAID IT.** The matrix
manufactures a cyan sky by differencing channels the app measures at 0.979 to
0.994 correlation on this frame. A difference of two nearly identical, small,
noisy numbers is mostly noise, and the ablation agrees: putting the mixer back to
Identity is the single biggest improvement of any stage, moving the sky's
evenness from 0.65 to 0.74 where saturation, contrast and the band stage move it
not at all. You can have the saturation or you can have the clean sky.

**THE ONE LEVER NOT YET TRIED IS SCALE, AND 4c-vi NAMED IT FIRST.** The chroma
stage built in 4c-viii works on the bilateral's own 5x5, and the mottle is
structured at two to four pixels — a window that small cannot flatten structure
that nearly fills it. Blurring colour at a genuinely larger radius while keeping
luminance sharp is what 4c-vi's closing paragraph asked for and what this
implementation did not deliver. That is the next variable, and it is a cost
question rather than a correctness one: a wide spatial pass per pixel is not free
on a tablet.

### 4c-xii. THE COLOUR BLUR WIDENED TO THE MOTTLE'S OWN SCALE, AND WHAT IT COSTS

4c-xi's closing line named scale as the one untried lever. Widened 2026-09-17 and
measured on the reported frame.

**THE FIRST WIDENING WAS WRONG IN A WAY ONLY THE PICTURE COULD SHOW.** A 5x5 grid
spaced THREE apart spans thirteen pixels for the same twenty-five taps a dense 5x5
costs, which is what makes a radius that large affordable. It removed the mottle
and left **a fine regular cross-hatch** in its place: sampling a noise field on a
sparse periodic lattice is itself a pattern. Every number the sheet reports
improved — the colourless share fell 18.7% to 15.6% — and the sheet could not see
the artefact at all.

**Seven by seven at stride two** spans the same thirteen pixels with one-pixel
gaps, at forty-nine taps. The cross-hatch is faint rather than absent; a dense
13x13 would remove it entirely at 169 taps per output pixel, which is not
affordable in a stage that runs once per pixel of a 21-megapixel export.

What it delivers on the reported sky: at 0.25 and 0.50 the pale pepper is
substantially gone and the sky reads as a soft gradient; at 1.00 it is smoother
again with a faint residual lattice visible at 1:1 and not at viewing size.
Colourless share 18.7% to 16.0% across the ladder — and, unlike the narrow
version, the numbers move at all, which is the first sign the stage is reaching
the structure rather than sitting inside it.

**Luminance is untouched throughout**, which is the whole design: the leaf
texture, the edges and the grain that carries detail are the bilateral's business
and this never sees them.

### 4c-xiii. A FIXED COLOUR-NOISE FLOOR BUYS ONE FRAME'S SKY WITH EVERY OTHER FRAME'S EDGES

Swept 2026-09-17 across every real frame available — two raws and two camera
JPEGs from the same outing — at 0, 0.15, 0.25, 0.4, 0.6 and 1. Two readings per
frame per step: a SKY block, and the frame's own highest-chroma-variance block,
both as the tenth percentile of chroma over the median. A floor has to clear the
mottle where there is mottle and leave everything else alone, so both halves are
measured rather than the first one only.

**Only one of the four frames needs it.** The reported raw goes 0.65, 0.68, 0.71,
0.73, 0.75, then back to 0.72 at full — a knee around 0.4 to 0.6 — with its sky's
median chroma pinned at 85 throughout, so the colour is not being drained. The
other raw sits at 0.91 with the stage off and never moves: that sky does not have
the defect. Both camera JPEGs are flat too, 0.82 unchanged across the sweep.

**And the busy block pays on every frame.** Its median chroma RISES with the
setting — 50 to 55 to 70 to 115 on the reported raw, 75 to 93 to 109 on a camera
JPEG — which is the wide blur averaging colour across high-contrast boundaries
and pushing edge pixels' saturation up. At 0.15 it does not move; at 0.25 it is
about a tenth; by 0.4 it is half again.

So a fixed look-level floor would improve one sky measurably and put edge bleeding
on three frames that gain nothing from it. **A constant is the wrong shape for
this**, and the sweep is what says so rather than taste.

**WHAT THE DATA POINTS AT INSTEAD.** The defect tracks how little the quiet
channel carries, which is a property of the photograph and which this app already
knows how to measure per frame — `estimateDenoise` does exactly that for
luminance and lands on a visible, undoable slider. A measured per-photograph
colour-noise value would give the reported frame its 0.4 and leave the other three
at nothing, which is what the numbers above ask for. That is a change to what
opens (Doctrine section 14: visible, undoable, and the bare decode one press
away) and therefore the owner's to call, not a session's.

### 4c-xiv. A PER-PHOTOGRAPH COLOUR-NOISE MEASUREMENT DOES NOT SEPARATE EITHER

4c-xiii ended by pointing at a measured per-frame value, on the grounds that
`estimateDenoise` already does exactly that for luminance. It was built and run
over FIFTEEN real frames — nine Z50 raws and six camera JPEGs — and it does not
work. Recorded here rather than left as a pointer, because the pointer reads as a
plan and the next session would build it again.

**Three statistics were tried, in the order they suggest themselves.**

A whole-frame median of the colour residual — each sample's chroma against the
mean chroma of eight neighbours six pixels out, normalised by luminance, which is
the footprint the stage itself smooths over. It reads BACKWARDS. The frame that
needs the correction is the LOWEST of the four calibration frames at 0.036, and
the three that need nothing read 0.053, 0.070 and 0.075.

Residual over signal, and the channel correlation the amplification actually
tracks. Neither separates: the two raws read 0.052 and 0.079 on the ratio, in the
wrong order, and their correlations are 0.979 and 0.976 — the same number.

**Per BLOCK rather than per frame**, on the reasoning that the defect is regional
and a whole-frame median cannot see a region. On the four calibration frames it
finally orders correctly: 0.321 for the frame that needs it against 0.240, 0.132
and 0.129. Then eleven more frames were added and it collapsed. NIR_1582 reads
**0.3192 against 0.3210** — six thousandths apart, and only one of the two is
known to need anything. Five frames sit between the calibration pair.

**The reason it cannot work, stated so it is not re-derived.** A frame that is
grainy EVERYWHERE and a frame with one bad region produce the same high
percentile. The frames that crowd the threshold have medians of 0.19 to 0.25
against the defective frame's 0.049 — they are uniformly noisy, not regionally
defective. A single number per photograph cannot express "clean except for one
part of it", and that is what this defect is.

A composite does separate — the squared percentile over the median puts the
defective frame at 2.09 and every other frame at 0.84 or below. It is not
recorded as a candidate because it was chosen after looking at the numbers and
there is exactly ONE frame in the set known to need the correction. Separating one
positive from fourteen negatives with a statistic picked afterwards is a fit, not
a measurement, and this repository already has a decision record about adding
fitted constants to a look made of fitted constants.

### 4c-xv. CORRELATED IS NOT NEUTRAL, AND THE GATE THAT LOOKED LIKE IT WORKED

4c-xi measured the sky's channels at 97.9-99.4% correlated. That was read, here,
as meaning the deep sky is nearly colourless in the raw — and from that came a
local gate for the colour stage: act where there is little colour to lose, stand
back where there is a lot, which would treat the sky and leave the edges that a
fixed floor bleeds. The whole-frame distribution appeared to confirm it, with a
gap from 0.230 to 0.523 in the defective frame and nothing below 0.44 in the two
raws that need nothing.

**It is wrong, and the arithmetic says why in one line.** Correlation is about
whether two channels TRACK each other across the frame, not whether they are
equal at a pixel. R = 40xB is perfectly correlated and violently non-neutral,
which is exactly what an infrared raw is: the red channel floods and every pixel
is red-dominant, the sky included.

**Measured, after the gate was built and swept.** Splitting the frame in thirds
and reading the quantity the stage keys on: the defective frame's sky band reads
0.588 at the fifth percentile and 0.691 at the median — the HIGHEST of the three
bands, not the lowest. The near-neutral tail that the whole-frame percentiles
showed is somewhere else in the picture entirely.

**AND THE SWEEP LOOKED LIKE A SUCCESS.** With the gate in, the busy block that
had climbed 50 to 115 under a fixed floor went 50, 50, 50, 48 — the edge bleeding
gone completely — and the other raw's went 113 to 110 instead of rising. Read on
its own that is the exact result the gate was built for. It is not. The sky it was
supposed to fix moved 0.65 to 0.67 where the fixed floor reached 0.75, and both
camera JPEGs returned byte-identical readings at every step of the sweep,
including full strength.

**The stage was not selecting. It was off.** Only about 5% of the defective frame
sits below the knee and NOTHING in either camera JPEG does, so the cost vanished
because the effect vanished with it. A gate that removes an artefact by removing
the operation reports as a fix in every number except the one it was for — which
is why the frame's own regions had to be measured separately before the sweep was
believed, and were not.

### 4c-xvi. THE NOISE IS PER CHANNEL, AND THIS PIPELINE IS WELL PLACED TO TREAT IT

Read 2026-09-17 after the host was unblocked: LibRaw's *Channel Noise and Raw
Converters* (www.libraw.org/articles/channel-noise-and-raw-converters.html),
which compares dcraw, Adobe Camera Raw and Raw Photo Processor on one
deliberately underexposed target at ISO 100.

**WHAT IT ESTABLISHES.** Channels carry different noise by construction — the
sensitivity difference between colour channels gives different per-channel detail
and therefore different noise, and the Bayer array's doubled green photosites cut
green's noise by about 1.4x, widening the gap further. The effect is worst in
shadows, where signal-to-noise is lowest. Its closing section names this
application almost exactly: feeding a contrasty channel into a CHANNEL MIXER on a
landscape with sky makes the sky noisy, and the quiet channel is the AUXILIARY
colour that creates a sky's fine gradations — so when the auxiliary channel is
noisy, the gradations go murky.

That is 4c-xi's measurement arriving from outside. `LOOKS.eir.mix3` IS a channel
mixer; the sky's gradation IS manufactured from the channel with almost nothing
in it. The roles are inverted for infrared — blue is the auxiliary here and red is
the flooded one — and the mechanism is identical.

**THE PART THAT WOULD HAVE BROKEN A PER-CHANNEL DESIGN, AND DOES NOT BREAK THIS
ONE.** The article measures AHD demosaicing MIXING noise between channels: green
comes out noisier because interpolation pulls in neighbouring channels, and red
comes out cleaner for the same reason. Adobe Camera Raw shows low-frequency noise
in green that the article says was carried in from red. A converter doing that has
no clean per-channel noise left to treat by the time anything can act.

**Checked here rather than assumed, and this pipeline does not do it.**
`demosaicBinned` collapses each 2x2 quad to one pixel and averages only the two
GREENS; red and blue are single photosites. `demosaicPixelLinearInto` averages
same-coloured neighbours in a 3x3. Neither mixes across channels. White balance is
three independent multiplies (`pipeline.ts`), not the combined balance-and-profile
matrix the article names as the other mixing path, and the camera matrix runs
AFTER the denoiser. So the channels arrive at `makeRowDenoiser` with their noise
still separated, which is the condition per-channel treatment needs.

Binning also means the preview's red and blue each come from ONE photosite, so
per-channel work on the binned image is close to what a reader comment on that
article calls the right answer — noise reduction before debayering — without the
restructuring.

**WHAT IT DOES NOT SAY.** It does not prescribe per-channel noise-reduction
STRENGTH. It is a comparison of converters, and its practical conclusion is that
the differences between converters are large enough to choose one over another.
Per-channel strength is this repository's inference from it, not the article's
recommendation, and it is recorded that way on purpose.

**MEASURED HERE THE SAME DAY, nine frames.** Blue is the noisiest channel on every
raw — 1.44x to 1.96x green — and gray-world lifts blue hardest on every one
(1.52 to 1.85) while pulling red down (0.54 to 0.78). Pushed through the real swap
and mixer, the original blue contributes 99.8%, 71.9% and 42.5% of the noise
variance in the three output rows.

**AND THE CAMERA JPEGS CANNOT BE MEASURED THIS WAY, WHICH IS ITSELF THE ANSWER FOR
THEM.** Two of three read a median neighbour-difference of exactly zero in green
and blue. That is a floor artefact — `linearAt` clamps at 1e-4, and a channel
crushed to zero returns a constant whose median difference is zero. Their gains
say why: red 0.050 against green 1.315, so red is roughly 26x green in mean and
the camera has already crushed the quiet channels to nothing in the shadows. The
camera JPEGs never showed this mottle because there is no channel noise left to
amplify — the channel is gone before the app sees the file.

### 4c-xvii. WITHDRAWN — THE "TWO WORSE FRAMES" WERE FOLIAGE READ BY A SKY METRIC

**This section claimed two frames nobody had opened were considerably more
mottled than the reported one, and it is wrong.** It is left here as a correction
rather than deleted, because the claim reached a commit message and was used to
argue that a per-channel prediction "separates".

What it said: NIR_1582 read sky evenness 0.20 and NIR_1480 0.23, against the
reported frame's 0.65 and a clean raw's 0.91; and that across the three
"affected" frames the predicted mixer-row noise ordered monotonically with
severity, four of five correct.

**What the instrument actually did.** `floor.mjs` reads a FIXED block at canvas
coordinates 100,100. In the reported frame that is sky. Rendered at 1:1 and
LOOKED AT on 2026-09-17, the same block in NIR_1582 is treetops — branches and
leaves, no sky in it at all. Foliage has high chroma variance by nature, so a low
tenth-percentile-over-median there is a fact about leaves. The frame's sky is a
small patch at the top right that the block never touches.

**So three things fall with it.** Those two frames are NOT established as worse
than the reported one — they are unmeasured. The monotonic ordering that appeared
to validate the prediction was an ordering over foliage readings. And the
separation claim reduces to what it was before: exactly one frame with ground
truth that shows the defect, one raw and three camera files that do not.

**The general fault, for the third time this week in this file.** An instrument
that assumes where something is in the frame is measuring composition, not the
photograph — the same shape as 4c-xiii's fixed floor and hub lesson 317's fitted
screenshot. A region metric has to FIND its region, per frame, and be shown the
region it found. This one was never shown.

### 4c-xviii. AIMING THE BILATERAL AT THE RIGHT CHANNEL DOES NOT MAKE IT REACH

Built and swept 2026-09-17 against the shipped build on four frames. The
diagnosis in 4c-xvi holds and the remedy does not follow from it.

**WHAT WAS BUILT.** `makeRowDenoiser`'s single strength became a per-channel
one, derived per photograph from each channel's own measured noise. The range
weight stays SHARED — one exp() per tap, as before — and each channel is instead
blended between its own centre value and that shared filtered mean, so the
targeting costs nothing. Mirrored in the shader. At [1,1,1] it is bit-identical,
and a camera JPEG was measured byte-for-byte unchanged.

**THE FIRST NORMALISATION WAS WRONG AND THE WAY IT WAS WRONG IS WORTH KEEPING.**
The bias was centred on a MEAN of 1. But the blend factors are `chS / max(chS)`,
which is invariant under scaling — so a normalisation cannot change the split at
all, only the kernel width `rangeSigma` derives from the largest of the three.
Centring on the mean put that width too low and the two quieter channels came out
smoothed LESS than the slider asked for: high-frequency energy in the render rose
in all three channels on two frames (red +49%, green +27%, blue +39% on the
reported frame) and the sky went 0.65 to 0.59. Normalising to a MINIMUM of 1,
so the slider's value is a floor no channel drops below, fixed that.

**AND THEN IT STILL DID NOT DELIVER.** With the floor in, against the shipped
build: the reported frame's sky 0.65 to 0.62, NIR_1582 0.20 to 0.21, NIR_1480
0.23 to 0.22, NIR_1376 0.91 unchanged. Blue IS being smoothed harder where it
should be — NIR_1582's high-frequency energy fell 8% in blue and 16% in red — and
the sky moved one hundredth.

**THE WALL IS THE FILTER, NOT THE AIM, AND IT WAS ALREADY MEASURED TWICE.** 4c-x
found the decision-based median could not reach this mottle; 4c-xi found the
narrow colour blur could not either, because the structure is three to five
pixels across and a five-pixel window cannot flatten something that nearly fills
it — and a bilateral's range term treats a lone unlike pixel as an edge and keeps
it, by construction. Per-channel strength changes which channel the filter is
pointed at. It does not change what the filter is able to reach.

**WHAT THIS LEAVES, AND IT IS A NARROW AND WELL-SUPPORTED NEXT STEP.** Exactly one
stage has ever been measured to reach this mottle: the WIDE colour blur, 7x7 at
stride two over a thirteen-pixel span (4c-xii). It is applied to the colour
VECTOR, which is why its cost is edge bleeding — it averages colour across
high-contrast boundaries everywhere. The measurement in 4c-xvi says the noise is
not in the colour vector, it is in one channel. Pointing the wide blur at the
channel that carries the noise, rather than at colour as a whole, is one variable
away from something already known to work, and the per-channel plumbing built
here is the input it takes.

**THE CODE WAS TAKEN BACK OUT, and the reason is worth the sentence.** It was
first left in place but unwired, so that nothing rendered differently while the
plumbing stayed available. TypeScript refused the build: a function nothing calls
is an error, and that is the right answer. Inert infrastructure kept for a
hypothetical is the thing this repository's architecture gate exists to refuse,
and the next candidate touches the CHROMA stage rather than the bilateral, so the
bilateral's per-channel strength would not even be the plumbing it needs. The
working tree is byte-identical to what shipped; the implementation is in the
history at the commit this section names, and this record is what it bought.

### 4c-xix. A CHROMA OPERATION CANNOT BE AIMED AT A CHANNEL — CHROMA IS THE DIFFERENCE

Built and swept 2026-09-17, three builds on three ports so no test-only control
reached a shipped page. The wide colour blur's per-channel weight vector, at
three settings: unaimed, aimed by each frame's measured per-channel noise, and
the diagnostic extreme that drives the quiet channels to nothing.

**THE PREMISE.** 4c-xvi measured the noise into one channel, and the wide blur's
only cost is edge bleeding because it mixes the whole colour VECTOR toward a
plain Gaussian. Blurring the starved channel's colour should cost nothing;
blurring the flooded one's is what bleeds. So aiming should buy the same sky at
a fraction of the edge cost.

**IT BUYS NOTHING AND COSTS SLIGHTLY MORE.** On the reported frame, at every
strength, the sky reading is IDENTICAL across all three aims — 0.71, 0.73, 0.75
at Colour noise 0.25, 0.4, 0.6 — while the busiest block's median chroma rises
with the aim: 70, 73, 75 at 0.4 and 89, 91, 94 at 0.6. Twelve consistent
measurements, and the 1:1 crops of the aimed and unaimed skies are
indistinguishable.

**AND THE REASON IS DEFINITIONAL, WHICH IS WHY IT SHOULD HAVE BEEN SEEN FIRST.**
Chroma IS the difference between the channels. Moving the channels by different
amounts does not aim a chroma operation at one of them — it MANUFACTURES chroma.
At an edge, where all three channels swing together, treating them unequally
splits them apart, and the metric reads that as exactly what it is: more colour
where there was less. The per-channel targeting that 4c-xvi's measurement calls
for cannot be expressed in a stage whose whole subject is the inter-channel
difference. Where it COULD be expressed is the luminance filter — and 4c-xviii
measured that and found the filter cannot reach the mottle at any aim.

**THE LUMA ARITHMETIC, KEPT BECAUSE IT WAS RIGHT EVEN THOUGH THE STAGE WAS NOT.**
A per-channel colour blend does not preserve luminance. `(m - lm)` and `(b - lb)`
each have a REC-weighted sum of zero, so the scalar blend that ships preserves it
exactly and for free; a per-channel blend does not, and the residual luma has to
be subtracted back. Tested directly on `makeRowDenoiser` rather than on a render:
with the restoration the luma change is 3.2e-18, without it 9.2e-6 — a factor of
three billion, and the version without it is 0.033% of the sky's luma.

**AND THE TEST THAT FOUND THAT WAS ITSELF WRONG FIRST**, which is the transferable
part. The first version rendered a sky block and compared its MEAN luma across
builds. It passed against the deliberately broken build, because the drift is
per-pixel and close to zero-mean, so averaging two hundred thousand pixels
cancels it. Made to fail once, it did not fail — and that is the only reason the
instrument was replaced with a per-pixel comparison. A second fault was in the
framing: the first per-pixel test measured RENDERED luma, which cannot answer
this at all, because the look's mixer deliberately turns colour into luminance
downstream. The invariant is about the stage's own output in linear pre-matrix
space, and it has to be tested there.

### 4c-xx. THE WIDE COLOUR BLUR DOES NOT CLEAN THE SKY — IT IMPROVES A NUMBER

Seen in the 1:1 crops on 2026-09-17, and it corrects what 4c-xii implied.

4c-xii recorded the wide blur as the one stage that REACHES this mottle, on the
strength of the sky reading moving 0.65 to 0.73 at Colour noise 0.4. Rendered at
1:1 on the reported frame, that sky is still heavily peppered with pale speckle.
The improvement is real and it is statistical; it is not a clean sky, and nobody
had looked at it at full magnification.

**So the standing claim that one stage reaches this defect is weaker than it
reads.** Every stage measured so far — the decision-based median (4c-x), the
narrow colour blur (4c-xi), per-channel strength on the bilateral (4c-xviii), and
aiming the wide blur (4c-xix) — leaves the mottle visible at 1:1. The wide blur
moves the metric furthest and still leaves it there.

**AND THE SECOND FRAME IN THE SHEET SETTLES NOTHING, BECAUSE ITS BLOCK IS NOT
SKY.** NIR_1582's readings come from a block that the 1:1 crop shows to be
treetops (4c-xvii). The wide blur's success on the ONE frame whose sky has been
seen has therefore not been shown to generalise to any other frame — not because
another frame contradicts it, but because no other frame's sky has been measured
at all.

### 4c-xxi. THE SKY TRACED FROM THE PHOTOSITE FORWARD — THE DENOISER ALREADY WINS, AND THE LOOK MULTIPLIES WHAT IS LEFT BY THIRTEEN

Run 2026-09-17 on the owner's instruction, which was a correction of METHOD: stop
working the tip of the branch until it is pulp and then moving one joint up. This
file had twelve subsections on this defect and every one of them attempted a
remedy at or near the END of the pipeline, while 4c-ix's own line — with no look
at all the ratio is already 0.67, *so it is in the decode* — sat unfollowed.

**HOW IT WAS DONE, because the method is the transferable part.** The whole
pipeline runs in node: `raw/nef.ts`, `raw/demosaic.ts`, `pipeline.ts` and
`sky.ts` are all free of browser APIs. `pipeline.ts` was COPIED to a scratchpad,
twenty taps inserted at the stage boundaries, and that copy bundled — the
repository was never modified. The tapped pipeline was then checked against the
UNMODIFIED one over 76800 pixels: **worst difference 0.00e+0, exact.** The sky
region came from the app's own `buildSkyMask` and was RENDERED AND LOOKED AT
before one statistic was taken, which is the step whose absence produced the
withdrawn claim in 4c-xvii.

**THE QUANTITY** is the high-frequency residual relative to the local mean, per
channel: each pixel minus the mean of its own neighbourhood, so the sky's real
gradient drops out, divided by that local mean, so a pure GAIN cannot move it. A
stage that only multiplies cannot change this number; a stage that DIFFERENCES
channels can. White balance is the built-in control — a pure per-channel gain —
and it moves the number not at all, which is what says the instrument works.

**THE TRACE.** Relative residual, mean of the three channels:

- raw photosites 0.0079, and this is the ONE number that is not what it looks
  like: it rises to 0.0300 at black subtraction, x3.8, because the 1008-count
  pedestal leaves the DENOMINATOR. Nothing is created there. 0.0300 is the
  sky's true signal-to-noise — red 2.4%, green 2.2%, **blue 4.3%**.
- the demosaic changes it not at all
- **the denoiser takes it to 0.0059 — it removes 80% of the mottle**
- dehaze, clarity, white balance, exposure, highlight recovery and both lens
  corrections: unchanged, to four decimal places, every one
- camera matrix **x1.82**, and the achromatic share falls 37% to 10% — the matrix
  turns common-mode noise into colour
- mix3 **x1.79**
- **saturation x3.31**, and it is the largest single step in the pipeline
- contrast and gamma x1.06; the HSL band mixer x1.14
- final 0.0778 — and red alone reads **0.1749**, which is the pale speckle

**So the look multiplies the surviving noise by 13.1.**

**ABLATED ON THE SAME METRIC**, because an ablation and a trace that use different
instruments cannot be compared — which is how the last one went wrong. Final
relative residual against the shipped look:

- saturation 3.0 to 1.0 — **0.16x**
- camera matrix off — 0.24x
- swapRB off — 0.28x
- mix3 to identity — 0.33x
- contrast 1.15 to 1.0 — 0.39x
- the HSL band shifts off — 0.87x

**AND THIS CORRECTS 4c-ix.** That section ablated saturation and reported it left
the ratio at 0.68 against 0.65 — no help — and concluded saturation only makes the
defect VISIBLE. On the metric that tracks the defect people actually see,
saturation is the single largest amplifier in the pipeline and removing it takes
84% of the mottle with it. 4c-ix's instrument was the tenth percentile of chroma
over the median, which is a chroma-evenness statistic and is not sensitive to a
channel's relative variation; that is a third instrument in this file measuring
something adjacent to the question.

**THE HSL MIXER DOES SOMETHING ELSE, AND THE PICTURES SHOW IT WHERE THE NUMBERS
NEARLY MISS IT.** It changes the mottle's CHARACTER rather than its size — the
patch goes from pink-and-green to orange-and-blue, and blue's relative residual
rises from 0.0026 to 0.0267, tenfold, for a x1.14 change in the mean. The look's
`raw.hsl` carries per-band hue shifts of 54, 35 and 43 degrees, and a hue shift
applied across an eight-band boundary turns noise in hue into large colour jumps.

**WHAT THIS CHANGES ABOUT WHERE TO WORK.** Eight remedies have been tried and all
eight tried to remove more noise BEFORE the amplification, at a point where the
denoiser has already taken out four fifths of it and what remains is 0.6% of the
signal. The amplification that follows is 13x. The structural observation the
trace makes, and which none of the eight could have found, is that **this app
denoises first and amplifies afterwards** — so the stage is cleaning a signal that
is then multiplied, and every further gain at that end is a gain on the small
number rather than the large one.

**What it does NOT establish**, stated so it is not read as a recommendation:
turning saturation down is not a fix, it is a different photograph, and the look
is the product. Whether denoising AFTER the amplification would help is untested
and has its own obvious cost — at that point the thing being smoothed is the
look's real colour as well as its noise.

### 4c-xxii. FIXED — THE PALE SPECKLE IS LUMINANCE, AND THE LUMINANCE FILTER WAS STILL 5x5

The defect reported from the device on 2026-09-17 and chased through eight failed
remedies. The trace in 4c-xxi printed the answer in a column nobody read: **the
final residual is 29.3% ACHROMATIC.** Pale is what achromatic looks like. A
colour stage cannot touch it by construction — it keeps luminance from the
bilateral and smooths only chroma — and the bilateral was still a 5x5 window.

**4c-xii had already made the argument, for the other half.** It widened the
COLOUR mean to a thirteen-pixel span because the mottle is three to five pixels
across and a five-pixel window cannot flatten something that nearly fills it.
That reasoning applies word for word to luminance, and the luminance half was
left at 5x5 for another eleven subsections.

**TWO GATES RAN BEFORE ANY CODE MOVED, and the first one killed the plan it was
written for.** The plan of the hour was that the colour stage smooths the wrong
DIRECTIONS — chroma defined in camera-native space with Rec.709 weights on
unbalanced data — and should smooth the basis the downstream chain amplifies.
Measured on the traced patch: of the visible colour noise after the mixer, the
share carried by the component the stage KEEPS is **11.9%**. Eighty-eight per
cent is in the chroma it already removes, so the basis was never the problem and
the substitution was not built. Then: the stage's own 7x7 stride-2 kernel removes
**82.8%** of what it is given. The colour path was working the whole time.

**WHAT SHIPPED.** `R` in `src/raw/denoise.ts` from 2 to 6 — a 13x13 window, sigma
3 — with the shader matched. The range weight became a 1024-entry table because
169 taps cannot each call `Math.exp`.

**DENSE, NOT STRIDED, and that was measured rather than assumed.** Tried first at
stride two, matching the colour half's grid: the frame's high-frequency energy
went UP, not down. A sparse lattice samples a noise field periodically and
periodic sampling of noise is a pattern — the same trap 4c-xii records from when
the colour half was first spaced three apart.

**THE RADIUS SWEEP**, sky patch, achromatic residual, Colour noise at zero:
radius 2 (25 taps) 0.0313, radius 3 (49) 0.0259, radius 4 (81) 0.0165, radius 5
(121) 0.0109, radius 6 (169) **0.0075**.

**THE RESULT, on the reported frame's verified sky region, Colour noise at ZERO:**

- pale/achromatic residual 0.0313 to **0.0075**, down 76%
- colour residual 0.0491 to **0.0136**, down 72%
- sky evenness 0.66 to **0.82**, where an even sky reads about 0.94 and a
  peppered one 0.65
- the sky's median chroma unchanged at 85, and its colourless share still 0% —
  nothing is drained
- the busiest block's own noise unchanged, 0.0873 to 0.0892, because the RANGE
  weight is what protects an edge and widening the SPATIAL support does not
  weaken it

**AND IT RETIRES THE COLOUR-NOISE TRADE.** With the luminance filter doing its
job, adding Colour noise 0.4 makes the sky WORSE — 0.0075 to 0.0106 — while still
costing the busy block 80% more colour. The slider is no longer the lever for
this defect and the edge bleeding 4c-xiii measured is no longer a price anyone
has to pay.

**WHAT IT COSTS, measured, and it is the real objection.** 649 ms per megapixel
to 2387 — **3.7x** on this one stage of the CPU export path. The shader does 169
texture fetches where it did 25. That is the price of the fix and it is stated
rather than buried; the device test page (section 7j) is what measures whether an
iPad finds it acceptable, and the radius is one constant if it does not.

### 4c-xxiii. SKY BESIDE FOLIAGE: NOT BLEEDING, AND THE STARVATION IS FRAME-DEPENDENT

Asked from the device after 4c-xxii shipped: is the widened filter reaching into
the foliage and turning the sky beside a tree grey? Two mechanisms produce that
appearance and they are opposites, so both were measured rather than chosen
between.

**BLEEDING — taps crossing the boundary, foliage pulled into sky pixels. It is
not happening.** That is a BIAS and would raise the sky's mean brightness near
the edge. Measured in distance bands from the foliage boundary, old filter
against new: 0.6329 to 0.6332, 0.6327 to 0.6332, 0.6301 to 0.6302, unchanged in
every band. The range weight is doing its job.

**AND THE FIRST CUT OF THAT MEASUREMENT WAS CONFOUNDED**, which is worth keeping.
Binning by distance from foliage also bins by sky DEPTH — on that frame the band
60px from any foliage is the dark top of the sky (luma 0.494) and the 1-3px band
is near the horizon (0.633). Deep sky is noisier whatever is beside it. The
comparison only means something inside one narrow brightness slice.

**STARVATION — the range term rejecting those taps, so a pixel among branches has
few usable samples and keeps its speckle.** Real in principle, and on the
reported frame it measures: speckle improves 4.1x in open sky but only 2.4x where
the window is mostly foliage, leaving sky-in-the-branches 2.0x noisier than open
sky where it had been 1.17x. Nothing got worse in absolute terms — 0.0077 to
0.0032 — but the CONTRAST with its surroundings nearly doubled, which is how a
defect becomes newly visible after everything around it is cleaned.

**IT DOES NOT GENERALISE, AND THAT IS THE FINDING.** On two other frames the
gradient is absent: NIR_1582 improves 1.92x among foliage against 2.02x in open
sky, and NIR_1480 improves 2.15x against 1.86x — the branch-adjacent sky doing
slightly BETTER. One frame in three. Not established as a cause of anything, and
recorded that way rather than as a mechanism, because generalising a gradient
from one frame is the mistake 4c-xvii already cost this file once.

**WHAT THE PIPELINE CAN AND CANNOT REACH.** On a default open, glow, clarity,
dehaze and vignette are all zero, and detail and sharpen are zero. The ONLY
spatial stage running is the denoiser, at thirteen pixels — six each side.
Nothing in the pipeline can produce a halo further out than that. An effect
following a tree's outline at tens of pixels is either in the photograph — bright
infrared foliage genuinely scatters into the sky beside it — or in the per-pixel
hue stages, and it is not the smoothing.

**AND A FITTED SCREENSHOT CANNOT SETTLE IT** (hub lesson 317). A fit-to-screen
view is a downscale: it averages away per-pixel structure and can suggest
structure that is not there. The sky beside the crown needs the raw or a 1:1 crop
before anything further is claimed about that photograph.

### 4c-vii. THE OVERTURNED NUMBERS, KEPT ON PURPOSE

4c-vi originally read that raising denoise did nothing to the ratio (NIR_1480
0.498 at the opening denoise against 0.504 at 0.80) and that the bare swap was
WORSE than the matrix on one frame (0.614 against 0.498). Both are wrong, and
both came from the same mistake: a chroma spread taken over a hue-selected block
is dominated by the photograph in it, so the readings moved with the subject and
barely with the noise.

**The conclusion drawn from them was nonetheless correct**, which is the part
worth keeping. "The matrix does not manufacture grain — it is amplitude at the
same ratio" survived the correction intact and is now supported by figures that
can actually carry it. A right answer resting on a broken measurement is not a
right answer yet, and nothing distinguishes the two from inside the session that
produced them.

**What distinguished them was rendering the pictures.** The claim was about how
photographs look and it was made out of a single number; the ratios had been
written up and the images declined on the grounds that 0.498 against 0.504 is not
something a picture shows. The first sheet rendered showed a denoise arm visibly
smoother than the arm the number called identical, and a crop labelled sky that
was plainly a hillside. **Neither error was reachable from the numbers**, and
both were obvious in the first second of looking.

### 4c-viii. THE FIELD ALREADY SPLIT THIS, AND THE LADDER SAYS THE SPLOTCH IS AMPLIFICATION

**Looked up before anything was touched, 2026-09-17**, after the splotch was
reported from the device on the shipped Aerochrome. 4c-vi's closing paragraph had
already reasoned its way to a spatial chroma operation; what it did not have was
that the field settled this decades ago and states it as a processing ORDER.

**Reduce colour noise first, and hard.** Colour blotches rarely carry real
information, so strong chrominance reduction costs almost nothing; luminance
speckle overlaps genuine texture in hair, fabric and foliage and deserves a much
lighter hand. RawTherapee exposes the refinement as a chrominance CURVE — the
reduction varies with the pixel's own chroma, strong where saturation is low and
weak where it is high. And a tone or contrast control applied per channel
produces mottling at higher values, which is the same artefact arriving by a
different road.

**What that says about this app, exactly.** There is ONE denoise. It is a 5x5
bilateral on linear sensor data whose range weighting is on relative LUMA
(`src/raw/denoise.ts`), and there is no chroma-specific stage anywhere in the
pipeline. Aerochrome then applies a mixer with coefficients as large as -1.44 and
a saturation of 3.0. So a 3x amplification lands on chroma noise that nothing
removed, on frames where the red channel is flooded and the quiet blue and green
channels are the ones carrying the noise.

**THE LADDER, RENDERED, and it separates two artefacts that were being called one
thing.** Five candidates on a real raw, every step a control on the device, 1:1 at
the frame's splotchiest 600x450 block (found by chroma variance, then held fixed
across the ladder):

At saturation 3.0 the sky is peppered with speckle and the foliage stipples into
hard red and white flecks. At 2.0 both soften; at 1.5 further; at 1.0 the sky is
clean and the foliage is smooth pink. **The shipped look with the existing denoise
at its maximum, 1.00, is indistinguishable from the shipped look** — the
luminance-guided bilateral does not touch either artefact, which is the fourth
arm's whole purpose and it answers 4c-vi's open question about whether the
existing lever could reach this. It cannot.

The colourless share over the whole frame moves 4.9% -> 8.8% -> 12.5% -> 19.2%
down the ladder, and the largest hue bin's share moves 56% -> 63%: pulling
saturation back does not change WHICH colours the look makes, it drains them.
That is the cost of the naive fix, stated so it is not mistaken for a free one.

**TWO ARTEFACTS, NOT ONE, AND ONLY THE FIRST IS CHROMA NOISE.** The sky speckle is
chroma noise amplified and is what a chroma stage is for. The foliage stipple is
saturation driving adjacent leaves to the gamut edge, so they snap to pure red or
pure white and the mid-tones between them are lost — a per-pixel clipping, which a
spatial chroma blur will soften but not undo. A fix aimed only at noise will
improve the sky and leave the leaves flecked.

**AND THE PER-KIND SPLIT MATTERS BEFORE ANY OF THIS APPLIES.** `LOOKS.eir` carries
`raw.sat` 3.0 and `jpeg.sat` 1.35, so a camera JPEG never sees the amplification at
all. The same ladder on a real camera JPEG moves its colourless share 2.4% ->
5.9% across the whole range and its largest bin not at all — a different frame
with a different problem. Any report of splotch has to say which file kind it came
from before it is diagnosed.

**THE STAGE IS BUILT AND MEASURED, 2026-09-17, one variable moved.** A `chroma`
strength, saturation untouched at 3.0. It reuses the bilateral's own 5x5
neighbourhood and accumulates a second, spatial-only mean alongside it: luminance
comes from the edge-preserving bilateral as before, colour is mixed toward the
plain blur. No extra taps and no extra exponential — four adds per tap — and at
0 the two halves recombine into exactly the old result, which is asserted by
construction rather than by a test.

What the ladder shows on a real raw, 1:1 at the same block: at 0.25 and 0.50 the
sky's coarse speckle is largely gone and the foliage keeps its texture, with the
colourless share of the frame steady near 5% right across the ladder — the colour
is NOT drained, which is what separates this from pulling saturation back (19% at
saturation 1.0).

**AND ITS FAILURE MODE IS VISIBLE AT THE TOP OF THE RANGE, which names the next
variable.** At 1.00 the leaf and sky boundaries grow a fine blue-and-red pepper:
the luminance is kept sharp while the colour is a plain blur, so a dark gap
between leaves keeps its dark brightness and takes the average colour of the red
leaves and blue sky around it. That is unguided chroma smoothing bleeding across
a high-contrast edge, and the remedy is the one deliberately left out of this
pass — a range term on the chroma half too, much looser than the luminance one,
so it stops crossing luma edges. It is not needed at 0.50 and it is obvious at
1.00.

Sources: RawPedia, Noise Reduction (https://rawpedia.rawtherapee.com/Noise_Reduction);
Adobe, Sharpening and noise reduction in Camera Raw
(https://helpx.adobe.com/camera-raw/desktop/using/sharpening-noise-reduction-camera-raw.html);
pixls.us, "what is the best way to boost the colors (saturation)"
(https://discuss.pixls.us/t/what-is-the-best-way-to-boost-the-colors-saturation/6935).


---

## 5. What a camera JPEG is, and why it is a different animal

A camera-rendered JPEG was developed **through** the clamped custom preset, then
tone-curved and written as 8-bit sRGB. So:

- It is already white balanced. Applying gray-world under a look is a **second**
  balance on top of a balance.
- Its channels are 8-bit *after* a tone curve, so pushing the weak channels up
  amplifies quantisation rather than recovering signal. This is where crushed
  shadows come from when a balance is forced onto one.
- It can arrive with effectively all its colour in one hue. Measured on the five
  reported frames: **95–100% of the coloured frame in a single 30° hue bin.**

Because raw and camera-rendered files arrive in these different states, **one
cast correction cannot serve both.** `Look.raw` and `Look.jpeg` already split
`sat` and `contrast`; `wbBias` rides the same split. Measured: a bias that moves
a JPEG from two hues to three takes a raw control from four hues at 43% down to
three at 77%.

The capture workflow's own instruction is **shoot raw, always** — the in-camera
JPEG throws away the colour relationships the whole workflow depends on. The app
still has to open them well, because they exist, but it should never be designed
*around* them.

---

## 6. How to measure an IR rendering without fooling yourself

**Hue spread is the metric.** Count the fraction of coloured pixels in the
largest 30° hue bin, and how many bins hold at least 5%. A false-colour look
exists to put foliage and sky in *different* hues, so hue count is what tells you
whether it worked.

**Brightness and per-pixel saturation mislead, and did, repeatedly.** Three
rounds of this thread measured median, mean and saturation, and each drew the
wrong conclusion, because "flat purple" is not a brightness fact. A single hue at
high saturation is a colour cast, not colour — a rendering can score *better* on
saturation precisely because it collapsed to one hue.

**Do not confuse channel clipping with lost detail.** One channel at the ceiling
is ordinary in a saturated false-colour render: a pure red is (255,0,0) and loses
nothing. Detail is lost when the *minimum* channel is also at the ceiling. A
first cut of this measurement reported 47–82% "blown"; measured properly,
pixels that had actually lost detail to white were **0.0% on every frame and
every rendering.**

**A WHOLE-FRAME MEAN IS NOT A MEASUREMENT OF EITHER POPULATION.** A false-colour
IR frame is bimodal by construction — that is the entire point of section 2 — so
foliage and sky sit on roughly opposite sides of the wheel in comparable numbers,
the mean lands near grey, and its hue is decided by whichever population happens
to be a few pixels larger. Measured on one frame rendered two ways: the mean hue
read **162 degrees against 35**, a 127-degree disagreement that reads as a serious
defect and is noise. Split on the two populations the physics already separates
and the same two renderings agree to **1.5 degrees on the foliage and 0.4 on the
sky**. Split first, then measure, and carry the population you are NOT asking
about as the control — if it moves too, the difference is not where you think it
is.

**Always carry a raw control.** Tuning on camera JPEGs alone produced a
correction that helped them and damaged raw files, and only the control showed
it.

**Sweep boundaries are not results.** A grid whose winners all sit on its edge
has not bracketed the optimum. This happened here at B = 1.40 and had to be
widened until the best value went interior.

**Full-frame renders, every round.** A crop hid an orange sky once. Decode
changes additionally sweep all 44 practice raws.

---

## 7. What the files in this repository actually are

- **The 44 practice raws in `public/examples/` are minimal hand-written DNGs** —
  17 tags, no SubIFDs, no Exif, no MakerNote, no `AsShotNeutral`. They are
  useful for decode and geometry and useless for any question about camera
  metadata. A metadata feature tested only against them is untested.
- **They carry no embedded preview**, which is why some fixtures elsewhere are
  bare decodes rather than camera renderings.
- **A real camera file is needed for metadata work** and is not in the repo.
- **Black lives in NEF MakerNote `0x003D`** (1008 on Z-series, 600 on the
  D5300 — assuming the Z value crushed a D5300 frame to near-black once), white
  in the linearization curve `0x0096`, and Adobe's levels in DNG 50714/50717.
- **The colour matrix is picked by illuminant**, preferring D65: IR shooting is
  daylight-only and picking the tungsten calibration bends every colour.
- **A lens profile's `source` says what its colour is worth, and `rendered` is
  worth much less than `raw`.** `kr`/`kb` are ratios between channels across the
  field. Measured on a camera-rendered frame the ratio carries the camera matrix
  and its tone curve as well as the lens — 3.5x the raw answer in red and 2.3x in
  blue on sixteen frames, because the camera's own green row multiplies a
  camera-space residual by 2.7. Measured on twenty-two real profiles against
  their raw-measured counterparts: centre blue up to **20.5%** apart, always the
  same direction, widening as the lens stops down; centre red 3.3%; centre
  brightness at most 4.3 points, because red carries brightness and the tone
  curve does not reach it. **This is not hypothetical**: a rig that identified a
  NEF by bytes alone decoded every one of them to its embedded JPEG preview, and
  a whole measuring run was stored as `rendered` while the panel said the raw was
  better. Provenance, not ownership, decides which colour applies.

---

## 8. The standing errors — each of these has actually happened

- **Diagnosing an IR frame against visible-light expectation.** A bright IR
  daytime frame was called "a twilight scene"; the real fault was a decode
  level. A frame that looks too dark, too red, or has an alien histogram is
  IR-normal until proven otherwise.
- **Inventing a remedy instead of checking the references.** "Protect the black
  point during the balance" was proposed here from ordinary editing intuition.
  It is in no IR reference and did not address the cause, which was the swap's
  missing cast correction.
- **Treating the camera's recorded white balance as intent.** Section 3.
- **Calibrating a policy on one photograph.** A one-band exception was made
  policy on a single frame's crushed-shadow number; six real frames then hit it.
  One specimen cannot tell a defect from a distribution.
- **Measuring the quantity that is easy rather than the one that is asked
  about.** Section 6.
- **Letting a session settle taste.** Which rendering ships, and what the looks
  are called, are the owner's. A measurement can narrow the options and must not
  choose between them.

## 9. THE HOT SPOT IS ADDED LIGHT, AND THIS APP CORRECTS IT AS A RATIO

**Read this before changing anything about the measured lens correction.** All of
it was looked up rather than derived, and two rounds of reasoning from the app's
own output produced two wrong answers before anybody went and read. The section
is written the way §4b was: what the sources say, then what this app does
differently, then the measurement.

### 9a. What the artefact physically is

It is **stray light added to the picture**, not a loss of transmission. Kolari's
account of the mechanism: light "bounces back from the sensor into the lens, and
gets reflected back towards the sensor where it gets focused by the aperture into
a hotspot". LifePixel's primer gives the other two causes — the matte coating
inside the lens barrel, designed to absorb stray light, reflecting it instead in
IR; and the coatings on the elements themselves behaving unlike they do in
visible light.

Four consequences, each of which the app's design touches:

- **Its strength tracks the scene's own light.** Kolari, from their own test:
  "The less light there was in the scene, the less pronounced the hotspot got."
  So it is neither a fixed quantity of light nor a fixed fraction of each pixel —
  it comes from the whole frame's illumination via a round trip.
- **It worsens as the lens is stopped down**, because the aperture is what
  focuses the returning light. The state of a lens is an aperture ceiling, not a
  pass or a fail.
- **It carries a colour shift as well as a brightness lift.** Rob Shea's
  description is "circles of over-exposure and color shift"; LifePixel's is
  "sometimes a color shift also occurs within the hotspot". Neither names a
  direction, and the direction measured on this camera's own flats is recorded in
  9d below as a measurement rather than as field knowledge.
- **It is not reliably circular and not reliably centred.** LifePixel: the spot
  is "sometimes in the shape of aperture leaves". Kolari: "the hotspot is not
  always perfectly centered, and if you take portrait images, you need to be
  careful to rotate the correction image the right way!!"

### 9b. The published correction, and the term this app dropped

Two reference implementations correct a flat field, and **each one picks a
normalisation anchor and says which**. That choice is the part this app never
made.

**Kolari normalises to the flat's AVERAGE** ("Coping with Infrared Hotspots
Using Astrophotography Techniques"):

    corrected = image x (average flat frame / flat frame)

A flat is shot at the same aperture and filtration as the subject, through a
diffuser, and a library is kept per lens / filter / aperture combination. It is
applied in Photoshop or Affinity through Divide and Multiply blend modes.

**RawTherapee normalises to the flat's CENTRE.** From RawPedia's Clip Control
section: the factor by which an area is corrected "is proportional to how much
darker the corresponding area in the flat-field image is relative to the measured
exposure of the center of the flat-field image". Note the direction — it lifts
the periphery and leaves the centre alone. **That anchor cannot be used for a hot
spot**: the hot spot IS the centre, so anchoring there would raise the whole
frame to match it. Kolari's average anchor is the one that fits this artefact,
and the reason is worth keeping because the two look interchangeable until you
ask which end of the curve is trustworthy.

**This app has neither.** It divides by the curve and by no reference level, so
the correction moves the frame's overall colour balance as well as redistributing
it — measured in 9d.

### 9c. Where a flat-field correction belongs, and what it is known to break

**RawPedia states the placement in one sentence:** "Flat-field correction is
performed only on linear raw data in the beginning of the imaging pipeline and
does not introduce gamma-induced shifts. Thus in RawTherapee flat-field
correction can be applied to raw files only."

Three other references agree on the shape. The DNG spec carries lens shading as a
GainMap in OpcodeList2 — linear raw, after black subtraction, before demosaic;
OpcodeList3 is the list applied after demosaic. Lightroom applies lens profiles
during raw conversion, before creative edits. darktable's default order is
demosaic, denoise (profiled), lens correction, and its scene-referred workflow
exists to "perform as many operations as possible in a linear RGB color space,
only compressing the tones ... at the end of the pixelpipe", because that makes
it "much easier to produce predictable processing algorithms with a minimum of
artifacts".

**The invariant all four share is that the correction finishes before the
grade.** This app's measured curve runs immediately before the camera matrix, the
R-B swap, a hue rotation, the look's saturation and its mixer — inside the grade,
not before it.

Failure modes the references name, rather than ones found here:

- **Clipping.** RawPedia: "Applying a flat-field image can cause nearly-
  overexposed areas in the image to become overexposed due to the correction."
  RawTherapee ships a Clip Control slider for it, computed against the raw white
  level. This app has no equivalent.
- **Scene dependence.** Kolari: "If there is more IR content in one image than
  the other, and if the hot spot is not entirely corrected," a curve adjustment
  is added to the flat frame layer. A single stored strength is not enough.
- **What the flat actually depends on.** RawPedia lists camera, lens, **focal
  distance**, aperture, and lens tilt/shift. This app matches focal *length* and
  aperture; focal distance is unmatched.
- **The flat is deliberately smoothed before use.** RawPedia's default Blur
  Radius is 32, "usually sufficient to get rid of localized variations of raw
  data due to noise"; radius 0 is reserved for dust removal and carries the
  flat's own noise into the picture.

One thing the reference **validates**: RawTherapee's auto-match key is camera
make, model, lens, focal length and aperture, resolved by nearest in time among
exact matches and otherwise by nearest in lens and aperture. That is the same
two-stage shape `matchIn` in `src/lensstore.ts` already implements.

### 9d. What this app does, measured on its own shipped table

- The colour curve is applied at **full strength automatically** from an EXIF
  match, on every raw file, with no per-image scale.
- It is indexed with `floor(r * n)` over **80 hard radial bins and no
  interpolation** — the opposite of the deliberate smoothing above.
- Its radius is measured from the **frame's geometric centre on uncropped uv**,
  against Kolari on centring and rotation and LifePixel on aperture-shaped spots.
- **It is not area-neutral.** Divided by its own area-weighted mean the residual
  cast would be zero; as shipped it moves the whole frame's red-against-blue by
  **+1.49%** on the blend matched to the lone-oak frame (50-250 at 57mm f/8,
  86% of the 50mm profile and 14% of the 130mm), by **+3.79%** on the worst
  shipped profile, and by more than 2% on **14 of the 72** profiles that carry
  colour. Gray-world white balance is measured before this stage runs, so nothing
  downstream puts it back.
- **On this camera's flats the centre measures relatively bluer and less red**
  against green — kr 0.9785 at the centre against 1.0251 at the corner, kb 1.0609
  against 0.9704. That is this table's measurement, not a field fact; no source
  found names a direction. It is consistent with scattered light being bluer than
  the direct image, which would be expected of a round trip off the sensor, but
  nothing here establishes that.
- Through the swap and the look, that correction removes **37%** of the foliage's
  red-against-blue inside the middle of the frame and **18%** further out, on the
  lone-oak frame under Aerochrome. Rendered on and off from the app itself.

### 9e. And the field's first answer is not a correction at all

Rob Shea: "Mild hot spots can be addressed easily in Lightroom or Photoshop.
Severe hot spots can be very challenging to fix. In the long run, you will be
better off shooting your infrared images with a lens that does not produce hot
spots." LifePixel: "the only solution is to simply use a different lens
altogether."

When it IS corrected in post, the published recipe is **local, feathered and
manual**, and consistent across sources: a radial filter centred on the spot with
the mask inverted and roughly 50% feather; Exposure down until the centre matches
its surroundings; **Clarity and Dehaze up** to clear the haze the spot creates;
**Saturation up** to match the rest of the frame. Reaching for Dehaze is the
field arriving empirically at veil removal, and this app already has a
hue-preserving luminance veil subtraction in its dehaze stage.

**Note the direction of that last slider.** The practitioner recipe RAISES
saturation inside the hot spot. This app's correction lowers it.

The workflow reference this file is the companion to reaches the same conclusion
from the capture side and states it more bluntly: the hot spot is unrecoverable
in post, it is not vignetting inverted, and no flat-field correction survives a
channel swap. Nobody found in this research ships an automatic, full-strength,
profile-driven hot-spot correction. This app does.

### 9g. WHAT SHIPPED, AND WHAT IT MEASURED

The normalising term went in on 2026-09-17, in both renderers, from one exported
helper (`lensAreaMean` in `src/pipeline.ts`) that states in its contract that
`compileEdit` and `gl.ts`'s `setLensCurve` are the only two callers allowed and
must agree. The curve is multiplied by its own area-weighted mean before it is
applied; the shipped profile arrays are untouched.

**The weights are the SENSOR's, not the frame's**, which is a decision rather
than a detail: a flat was shot full-frame, so its average is an average over
that shape, and normalising a cropped frame against its own crop would be
normalising against a flat nobody shot.

Measured as two real builds of the same source tree, the lone-oak frame under
Aerochrome at open, foliage red-against-blue, correction off as 100%: before
88.56 (77.4%), after 94.49 (82.6%). **The change gives back 23.0% of what the
stage was taking.** An earlier figure of 43% was read off half-size views with a
different pixel population and is superseded by this one.

Two things had to be bit-identical and were, to zero: a frame with no matched
curve, and a frame whose curve is already area-neutral. The frame with a real
curve differs by 3.05e-1 at worst, which is the change itself.

**What it does NOT fix.** The remaining 17.4% is the correction doing what the
flat measured, and that is the strength. Kolari's limitation applies and this
app still has no answer to it — a stored 1 cannot be right for every frame when
how much stray light a frame carries depends on how much light is in the scene.
Clip control against the raw white level, a per-image strength, and moving the
stage out of the creative chain are all still owed; they are ranked in
`docs/decisions/015-lens-correction-against-the-reference.md`.

**AND THE CORRECTION STOPPED BEING AUTOMATIC, 2026-09-17.** The second change,
and the one the reading actually argued for: `lensFix` and `hsFix` now start at
ZERO on every path that opens a photograph — the live params, `initHotspot`, the
reader's own profile, `cloneParams`, `applySnapshot` and the tile path in
`batchParamsFor`. The profile is still MATCHED from EXIF and named on the card;
the manual picker still appears when the lens cannot be identified; a strength
the reader has already chosen for that lens and aperture is still remembered and
restored. What is gone is applying it to every raw file at full strength with
nothing on screen moving.

Two independent reasons, and they arrive at the same place. The sources say a
stored per-lens correction cannot be right for every frame, because the artefact
scales with the light in the scene (9a, 9h). And this app's own rule says an
at-open automatic is visible and undoable — this one was neither, which is why
it took a third of a subject's colour before anybody could see it acting.

`PREVIEW_PIPELINE` moved to 23 with it: a quick-look preview is rendered through
the correction and is keyed on that number, so every cached tile from before
would otherwise have gone on showing the corrected picture for ever.

**And the bin interpolation was measured and NOT shipped.** Resampled twenty
ways it changed this frame's numbers by nothing at four significant figures,
because it only acts at ring boundaries and this frame shows no banding. Eighty
hard steps still have no support in any reference and it stays owed, but it
buys no picture today and it costs a texture-filtering change in the shader.

### 9f. What is still NOT read

Rob Shea and David Kennard are both read in full now — 9h below, and the
Kennard material throughout this section. **Jim Kasson's "Infrared hotspotting:
the last word" is still not.** `blog.kasson.com` answers 403 to this container,
and that source is the only one found likely to have MEASURED whether the hot spot
scales with scene brightness, with aperture and per channel, with numbers rather
than descriptions. Every statement here about scene dependence rests on Kolari's
qualitative test and Rob Shea's observation that the right correction moves with
the light; a measurement would settle it. `www.edwardnoble.com`, the third
hot-spot lens database, is also still refused.

### 9h. ROB SHEA'S METHOD, FROM THE VIDEOS — AND IT SAYS THE APP'S APPROACH DOES NOT WORK

Both hot-spot articles are three sentences of text around a YouTube embed, so
this is transcribed from the videos themselves: "How to Fix Infrared Lens Hot
Spots" (`sD5iJeHcLJE`, 2020) and "Fix Hot Spots, Fujifilm GF 35-70, Lightroom
Classic" (`QwuAlEDl3a0`, 2024). Both were read in full rather than sampled.

**THE SENTENCE THAT BEARS HARDEST ON THIS APP.** Of the 2024 video, on a lens
with a mild hot spot: *"You're not going to be able to maybe create a single
hotspot corrector. You've noticed that each one of these is a little bit
different because it depends on the lighting conditions."* That describes
exactly what this app does — one stored correction per lens and aperture,
applied automatically — and saying it cannot be done, because the right
correction moves with the light in the scene. That is the same limitation Kolari
states from the other direction (more IR in one image than another), and it is
the strongest published statement against a fixed stored strength.

**AND HOW OFTEN IT IS ACTUALLY NEEDED.** Over 700 frames on that hot-spot-prone
lens, 85 edited and shared, and **hot-spot correction applied to 4 of them**.
This app corrects every raw file the table matches, at full strength.

**THE HOT SPOT IS A WHITE-BALANCE SHIFT, AND THAT IS ALSO THE TEST.** *"A hot
spot can change your exposure but can actually also change the white balance of
the shot and affect colors and saturation."* The detection method given is to click the
white-balance picker on cloud at the frame's edge, then on cloud at the centre,
and read the two temperatures: 3700K against 4700K on one frame, 3650K against
"about a thousand kelvin off" on another. **Roughly 1000K between centre and
edge is what a visible hot spot measures.** That is a diagnostic this app could
run on its own and does not.

**IT IS CONCENTRIC RINGS, NOT ONE BLOB.** *"A number of concentric rings — maybe
even four different concentric rings here. You've got this bright sun spot in the
center, you've got a little spot around it, the corona if you will, and then
another ring out here and then a really big ring out here."* The video corrects them
with several radial masks worked **outside in**, because their effects stack.

**AND IT IS INVISIBLE WITHOUT A VISUALISER — WHICH IS WHY THIS ONLY SHOWS UNDER
AEROCHROME.** The 2024 video builds one deliberately: a full-frame linear-gradient mask with
saturation at 100 and dehaze at 100, switched on to find the hot spot and off to
judge the result. *"Remember, I'm looking at this with the saturation and the
dehaze cranked up to show me sort of the worst case scenario."* This app's
Aerochrome look, with its saturation of 3.0 and a mixer carrying -1.44, IS that
visualiser — applied permanently and by accident. The artefact and the
correction's error are both invisible in camera space and both magnified by the
look, which is why the report came from an Aerochrome frame and not from a
neutral one.

**THE CORRECTION IS TEMPERATURE FIRST AND IT IS SMALL.** *"The temperature tends
to be the most impacted"*; exposure is zeroed out for the outer rings and only
matters near the centre. In 2024: *"typically exposure... and then the other one
is going to be color, temp, and tint"*, with exposure adjustments *"typically
negative 0.2 to 0.2 or smaller"*. Saturation occasionally. The spot is never removed
completely: *"I'm rarely going to be able to eliminate them completely, but
that's okay."*

**FOR A SEVERE ONE THE METHOD ABANDONS GEOMETRY ALTOGETHER.** The advanced route is
Photoshop's Select > Color Range on **sampled colours** — pick the hot spot's own
colour at the centre, add with the plus picker, tune fuzziness and range — then
Color Balance, Exposure and Hue/Saturation adjustment layers through that mask,
pulling red out of the highlights toward cyan. A chroma-key on the artefact's
own colour, not a radius. **This app already has that machinery**: a colour mask
(type 3) whose weight is a chroma-key on the pixel's own display-space hue and
saturation.

**THE RANKING OF REMEDIES, in the order given.** Use a different lens. Convert to black
and white if the hot spot is a saturation hot spot rather than a brightness one.
Minor fixes in Lightroom with a radial filter. Major fixes in Photoshop with the
colour-range mask and adjustment layers. *"At the end of the day it's going to be
time consuming and difficult to make these edits, you're not going to want to do
this a lot."*

**APERTURE: IT TIGHTENS AS WELL AS STRENGTHENS.** From f/2.8 to f/22 the spot
*"becomes more intense and more visible and more focused in the center"* — so a
profile measured at one aperture has the wrong RADIUS at another, not merely the
wrong amplitude. And the diffraction article closes the loop on which apertures
matter: the Airy disk is `2.44 x wavelength x f-stop`, so at the same f-stop
850nm gives a disk twice the size 425nm does, and the sharpest apertures move
from f/5.6-f/8 in visible light to f/8 at 590nm, f/4-f/5.6 at 720nm and f/4 at
850nm. The conclusion drawn there on the GF 35-70: a faint hot spot at f/11, obvious at
f/32, *"since diffraction on my GFX50S starts at F8 and is heavy at F11, I'm not
likely to shoot this lens at F11 or higher anyway, where the hotspots are the
most noticeable."* **The apertures where the hot spot is worst are apertures
infrared should not be shot at.** This app's shipped table runs to f/29.

**Sources**: robsheaphotography.com, the two videos above plus "Diffraction in
Infrared Photography" and "Accurate White Balance in Color Infrared
Photography". Transcripts pulled with yt-dlp after the player API refused the
container's address; the site's article text carries none of the method.

### 9i. FOLIAGE TONALITY — WHAT THE DENOISER COSTS, AND WHICH LEVER IS REAL

Reported from the device: under Aerochrome the foliage is the right colour and
"a blob of it". No detail inside the canopy. Measured on the lone oak frame,
whose canopy is 1.57 million pixels — 30% of the frame — classified once on the
shipped render and held fixed across every case below. Fine texture is a canopy
pixel against the mean of four canopy neighbours four pixels away, in 0–255
luma, through the real pipeline with the real look.

**THE DENOISER TAKES 23% OF IT, AND THE WIDENING IS A THIRD OF THAT.**

- 40.15 with the luminance bilateral off entirely — the ceiling.
- 34.11 under the 5×5 filter this app shipped until 2026-09-16.
- 30.76 under the 13×13 that replaced it, which section 4c-xxii is about.

The commit that widened it said detail was not the price and that the busiest
part of the picture measured the same as before. That was a busy-block metric on
a different frame. On foliage it is false, and the report came back from the
device before the measurement did.

**THE CANOPY IS NOT CLIPPED AND THE LOOK IS NOT CRUSHING IT** — 1.1% of foliage
pixels sit at or above 250 in red, and the look *widens* the canopy's tonal
range rather than compressing it (10th-to-90th spread 125 with the look against
65 without). So the missing thing is texture and modelling, and neither exposure
nor the mixer is where it went.

**THE MEASUREMENT THAT KILLED THE OBVIOUS LEVER.** The white-foliage method in
the reference video takes the foliage hue's saturation down in the colour mixer
and then pushes that same hue's *luminance* up. This app has that control —
eight bands of hue, saturation and luminance, and Aerochrome leaves all eight
luminances at exactly 1. Lifting the canopy's own three bands (red, orange,
magenta) as a ladder:

- 1.06 → texture +5.9%, canopy mean luma +5.9%
- 1.10 → +9.6%, +9.6%
- 1.14 → +12.9%, +13.1%
- 1.18 → +15.6%, +16.2%
- 1.22 → +17.7%, +19.0%

**Texture per unit luma is flat at 0.254 across the whole ladder and falls above
1.10.** Every point of texture it appears to add is brightness. A brighter
population measures more local variation for free, which is why the ratio column
exists — and the video's own words for the control, *so it pops a little bit
more*, describe a brightness lever rather than a detail one. Reading it as a
detail fix was this repository's error, not the source's.

**THE TWO LEVERS THAT ARE REAL,** measured on both populations, because a
local-contrast change cannot be judged on the tree alone:

- **Denoise strength.** Floor 0.80 → 0.45: canopy texture 30.78 → 34.03, +11.6%
  per unit brightness, with the canopy's mean luma unmoved (121.1 → 120.0). The
  sky pays 4.3% — a verified sky block's pale luminance speckle rises 2.645 →
  2.758, against a residual the widening had already cut 76%.
- **Mid-frequency local contrast** (`texture`, `src/raw/detail.ts`): a band-pass
  between the two detail blurs folded back as a hue-preserving luminance gain,
  which is Lightroom's Texture slider. At 0.25 on top of the knee: 35.25, +16.0%
  per unit luma, canopy luma 119.5 — it does not brighten at all. The sky pays
  another 1.9%, 6.2% in total.

Together they recover 48% of the canopy's loss for 6.2% of the sky's gain. At
0.40 it is 56% for 7.3%; the slider reaches it and the reader can.

**THE RADIUS IS THE WRONG LEVER, MEASURED RATHER THAN ARGUED.** Sweeping the
bilateral to 11×11, 9×9 and 7×7 with sigma held at R/2 so only the extent moves:
the narrowest recovers 29% of the canopy's loss and hands back 28% of the sky's
gain. That is very nearly the widening's own trade run backwards. Strength and
local contrast both beat it because neither touches the kernel the sky fix
depends on.

**WHAT THIS DOES NOT FIX, AND IT IS VISIBLE IN EVERY CROP.** The trunk and the
main branches render the same crimson as the leaves. Real Aerochrome renders bark
dark and close to neutral, because bark reflects little infrared: all three film
layers get almost nothing there, so it falls toward dark grey rather than toward
a hue. This app's `raw.sat` of 3.0 multiplies whatever small chroma the dark
structure carries and drives it to the canopy's own colour. Section 9j is the
measurement of the field's fix for it, and why it is not in the look.

### 9j. THE SUBTRACTIVE SHADOW TINT WORKS ON THE TREE AND WRECKS THE NEXT FRAME

The reference video's subtractive-colour method is the field's answer to crimson
bark: the canopy's colour casts onto the structure, so find the cast's hue, add
180°, and put the complement into the **shadows only**. The structure goes
neutral and the canopy stands off it. This app has the control — `grade` carries
separate shadow, midtone and highlight tints, and Aerochrome leaves all three at
zero.

**Read out of `src/pipeline.ts` rather than assumed.** The shadow weight is
`wS = 1 − smooth01(0.05, 0.6 + 0.2·balance, L)`, and the tint is **additive in
display RGB**: `out += wS · amount · GRADE_K · tintVec(hue)` with `GRADE_K`
0.35, where `tintVec` is the hue's full-saturation RGB with its Rec.709 luma
subtracted out — so it shifts colour without moving luminance. Amount and
balance are two separate knobs.

**ON THE OAK IT DOES EXACTLY WHAT THE METHOD SAYS.** The canopy's output hue is
5.8°, so the complement is 186°. Two populations inside the canopy's own box,
classified once — 396,132 dark structure pixels and 304,637 bright leaf pixels —
and the tint separates them cleanly at balance 0:

- 0.18 → structure saturation −3.6%, leaves −0.5%
- 0.35 → −7.7%, −1.0%
- 0.55 → −14.0%, −1.5%
- 0.70 → −20.1%, −1.9%
- 0.80 → −24.8%, −2.2%

Eleven times more effect on the bark than on the leaves, and at 0.70 the crop
shows trunk and limbs reading as dark wood with the canopy visibly unchanged.
Pushing the balance to +0.6 buys almost nothing more on the structure (−20.1%
against −21%) and costs the leaves 8.4%, which is visible as a paler canopy — so
balance 0 is the setting, and the first value tried, 0.18, was simply far too
small to see.

**AND THEN THE SECOND FRAME.** The tint is weighted by **luma alone** and asks
nothing about hue, so it lands on every dark thing in a photograph. On the
carport frame, dark pixels that carry no colour as the frame ships — 858,273 of
them, deep shade under the roof and the aircraft itself — measure saturation
**0.005 at hue 359**, and with the tint at 0.70 they measure **0.989 at hue
201**. Ordinary grey shade driven to saturated teal. The mechanism is that the
tint is additive and those pixels are near black: adding roughly
(−0.72, +0.18, +0.28)·0.245 to a pixel at 0.02 clamps red to zero and leaves
green and blue positive, which is saturation 1 by definition.

**So it is not shipped, at any amount.** The method is sound and it is a
**per-photograph hand edit** — in the source's own workflow a photographer picks
the amount while looking at that frame. A look applies one constant to every
frame, including frames whose shadows are a roof rather than a tree. The control
stays exactly where it is, on the Grade tab's shadow wheel, reachable for the
frame that wants it.

**WHAT THE BARK ACTUALLY NEEDS** is a luminance-weighted **saturation
reduction** — multiplicative, so a near-black pixel stays near-black instead of
gaining a hue it did not have. `hslAt`'s bands carry saturation but are selected
by HUE, and the trunk shares the canopy's hue exactly, which is the whole problem.

**BUILT 2026-09-17 as `shadowSat` — the Shadow colour slider on the Grade tab,
off by default.** It scales the distance from luma (the same operator `sat` uses)
by `1 − amount · (1 − smooth01(0.05, 0.6, L))` — the shadow grade band's own
reach, so a reader who learns one control knows the other. Measured through the
shipped stage on two frames, mean HSV saturation per population:

- Oak: dark-coloured (bark) −10.3%, −20.6%, −33.3%, −49.9%, −66.4% at amounts
  0.25 to 1.00; bright-coloured (leaves) −2.5%, −4.7%, −7.0%, −9.5%, −11.6%.
- **Carport, the frame that killed the additive tint: its 836,808 dark NEUTRAL
  pixels read 0.0029 as it ships and 0.0025, 0.0021 … as the amount rises.** They
  get CLEANER. The additive tint took the same population to 0.989.

That asymmetry is the whole design and it is not a tuning result: scaling cannot
create saturation where there is none, so grey shade is safe at every amount by
construction rather than by calibration.

**ITS REAL LIMITATION, seen in the crops and not in those numbers.** The control
is selected by luminance ALONE, so on a frame with a deep sky it desaturates the
sky's dark end too — visible at 0.45 on the oak, where the blue goes slightly
grey. The oak's "dark-coloured" population includes that sky, so part of the
−20.6% is sky rather than bark. The sky is the one thing that does NOT share the
canopy's hue, so a second weight on distance from the sky band would separate
them; that is the next piece rather than this one.

**THE GENERAL LESSON, AND IT IS THE ONE THIS REPOSITORY KEEPS PAYING FOR.** The
oak crop at 0.70 looked like a finished fix. One more frame, chosen because its
shadows are not foliage, turned it into a defect affecting 858,000 pixels. A look
constant is a claim about every photograph, so it is measured on a frame that
disagrees with the one that motivated it — not on a second frame of the same
subject.

---

---

### 9k. WHY AEROCHROME IS NOISY AND PINK IR IS NOT — IT IS ONE ROW OF THE MIXER

Reported from the device 2026-09-17 with two screenshots of one frame: Pink IR's
sky smooth, Aerochrome's covered in coarse coloured blobs, building clipped to
flat red. The question was why one look can be clean and the other cannot.

**THE TWO SCREENSHOTS EXONERATE THE TWO OBVIOUS SUSPECTS BY THEMSELVES.** Read
out of `LOOKS` rather than assumed: Pink IR (`aero`) is `swapRB` with
`raw: { sat: 3.0, contrast: 1.15 }` and nothing else. Aerochrome (`eir`) is the
same 3.0 and the same 1.15, plus `mix3`, eight `hsl` band shifts, a denoise floor
and a texture amount. So saturation is not the difference. And denoise STRENGTH
is not either: Pink IR carries no floor at all, runs at the photograph's own
measured value — 0.377 on the frame below, against Aerochrome's 0.45 floor — and
it is the clean one.

**THE ARITHMETIC, WRITTEN BEFORE THE RUN.** `mix3` is row-major. On an infrared
frame the three channels are nearly equal (the colour is a 1–3% residual, 4c-xxi),
so a row's SIGNAL gain is about its sum while its NOISE gain is its norm:

- red `[0.99, −0.06, 0.07]` — signal 1.00, noise ×0.99 uncorrelated to ×1.12
  correlated. Harmless.
- **green `[−1.44, 1.37, 1.02]` — signal 0.95, noise ×2.23 to ×3.83.** A
  difference of two large opposite-signed numbers.
- blue `[−0.47, 0.81, 0.65]` — signal 0.99, noise ×1.14 to ×1.93.

**THE FIRST INSTRUMENT WAS BLIND AND ITS OWN GATE REFUSED IT.** A chroma residual
averaged over 652,339 sky pixels at a four-pixel lag read Pink IR 9.26 against
Aerochrome 10.48 — 1.13×, on a difference anybody can see. Two errors, neither
about colour: the blobs live in the darkest third of the sky and the other
two-thirds diluted them, and at 1:1 the blobs are 10–25 px across so a pixel and
its four-pixel neighbour sit inside the SAME blob. Rebuilt with a lag sweep, the
dark third reported separately and the 95th percentile beside the RMS, it reads
**2.03×** and the peak sits at a 12-pixel lag — which is the blob size, measured
rather than guessed. Hub LESSONS §320. **Four earlier rejections in 4c-x through
4c-xx were made on a statistic of the same construction, so none of them is
safe.**

**THE DECOMPOSITION, dark third of the sky, chroma residual p95 at the worst lag,
NIR_3406:**

- Pink IR — 9.8, the reference.
- Aerochrome as it ships — 20.0, **2.03×**. Excess over Pink IR: 10.2.
- **mixer at identity — 6.9, 0.70×.** Below Pink IR. The mixer accounts for the
  whole gap and then some.
- bands at default — 22.0, 2.24×. The band shifts are mildly HELPING; removing
  them makes it worse.
- **denoise floor back at 0.80 — 18.2, 1.86×.** Recovers 1.8 of the 10.2 excess,
  so lowering the floor cost **17.6% of this artefact** — measured on chroma,
  where it had been signed off on a luma residual at +4.3%. The same scale error
  one level down.
- **texture 0 — 20.0, 2.03×. Identical.** The texture amount contributes nothing
  here, which is the right answer for a hue-preserving luminance band-pass
  measured on a chroma-only statistic.
- mixer rows scaled to unit norm — 11.7, 1.19×. **Removes 81% of the excess while
  keeping each row's DIRECTION**, which is the direct confirmation of the
  prediction: the noise is the row norms.
- saturation 1.5 instead of 3.0 — 5.4, 0.55×. Below Pink IR.

**AND UNIT-NORM IS NOT A FREE FIX.** It keeps each row's direction and changes
their relative magnitudes, so the rendered mean chroma more than doubles (46.6 to
101.2 on the same sky). It is a different look, not a cleaner version of this one.

**THE STRUCTURAL ANSWER, and it is not a tuning problem.** Decompose a row into
its component along (1,1,1) and its component orthogonal to it: the achromatic
response is the sum, the COLOUR response is the orthogonal part, and the noise is
the quadrature of both. Aerochrome's green row has an orthogonal component of
norm 2.15 — and that component is simultaneously what separates the two
populations and what multiplies the residual. Saturation does the same thing to
both halves. So **within this pipeline the separation and the noise cannot be
decoupled downstream**: every knob that buys the film's angle buys the grain with
it, in the same proportion, which is why Pink IR gets to be clean and this look
does not.

The only place they come apart is UPSTREAM — make the residual cleaner before
anything amplifies it. That is record `013`, and 4c-xx's rejection of the colour
blur was made on the blind statistic, so it is re-opened rather than inherited.

**AND THE COLOUR BLUR IS NOT THE ANSWER — AT STRENGTH IT IS THE CAUSE.** The app
already has a chroma stage, and 4c-xx rejected it on the blind statistic, so it
was re-asked with the instrument that works. Same frame, same dark third, p95 at
the worst lag, on top of the shipped look:

- chroma 0.2 — 18.2, 1.85× (Aerochrome alone is 2.03×). A slight improvement.
- chroma 0.4 — 19.0, 2.00×. Back where it started.
- chroma 0.7 — 24.7, **2.63×**.
- chroma 1.0 — 32.6, **3.47×**.
- chroma 1.0 with despeckle 0.5 — 32.5, 3.47×. The despeckler adds nothing.
- despeckle 0.5 alone — 20.1, 2.05×. Nothing.

**A colour blur averages chroma over a neighbourhood, which does not remove
chroma error — it CONSOLIDATES it into patches the size of its own window.** That
is the mechanism behind 4c-xii and 4c-xx and nobody had a statistic that could
see it: the fine-grain chroma figure falls, which is the "number it improves",
while the 10–25 px patches the eye actually objects to get larger and stronger.
The two readings are not in conflict and never were. `Aerochrome` carries
`chroma: 0` today, so nothing is shipped wrong — but 013's standing note that the
plain global colour blur "measurably clears the sky it was built for" is
withdrawn, and the trade it describes is not a trade.

**WHAT IS LEFT, after five candidates and two of my own changes.** Nothing
downstream of the mixer fixes this: the blur makes it worse, the despeckler does
nothing, and the two knobs that do fix it — the mixer and saturation — are the
look's identity. The remaining live candidates are a mixer re-solve that trades
separation for noise (a look choice, and it must still pass the film-angle checks
10a–c), or an EDGE-AWARE chroma filter at the patch scale rather than a blur,
which is a different stage from the one this app has. The existing one is the
wrong tool, not the wrong strength.

### 9l. SHIPPED — DENOISE AFTER THE AMPLIFICATION, INSIDE THE SKY. 4c-xxi'S OPEN QUESTION, ANSWERED

4c-xxi ended: *whether denoising AFTER the amplification would help is untested
and has its own obvious cost — at that point the thing being smoothed is the
look's real colour as well as its noise.* Built and measured 2026-09-17. **It
helps, and the cost vanishes when the stage is confined to the sky**, which has
no real colour detail to lose. That confinement was the owner's instruction —
sample everything that is sky — and it is what turns the file's open question
into a control.

**THE STAGE** (`src/skymap.ts`, `EditParams.skySmooth`): the RENDERED sky's
opponent chroma is box-averaged into a 128-texel map, per edit, through
`compileEdit` with the stage itself zeroed; the pixel's chroma is then blended
toward that map by the sky bitmap's own weight, luma exactly preserved. The
bitmap is `buildSkyMask`'s, built once per photograph from the gray-world render
so the selection cannot drift as the photo is graded. The GPU samples the same
bytes as an RGB8 texture and the export samples them bilinearly — the local-map
pattern, so the two agree to filtering error. Dense, not strided: the 22 px
texel footprint IS the smoothing radius, and the lattice trap 4c-xii and 4c-xxii
record never enters it. Aerochrome carries it at 1; Pink IR, which has no
mixer, does not need it.

**MEASURED ACROSS TEN FRAMES, dark third of the sky, chroma residual p95 at the
artefact's 12 px scale, both controls in front of every row.** Three frames have
the defect — Aerochrome above Pink IR — and on all three the stage takes it
below Pink IR at the shipped radius: **15.9 → 4.7 (Pink 8.7)**, 4.4 → 1.7 (Pink
2.1), 8.7 → 3.4 (Pink 4.6), mean chroma held to 0% and luma changed by exactly
zero. On four frames Aerochrome's sky was ALREADY cleaner than Pink IR's (0.36×,
0.67×, 0.86×, 0.93×), so the defect is frame-dependent and the stage is
unneeded there — and harmless, since it only ever moves chroma toward its own
mean. On three practice frames the bitmap found a region with no chroma in
either look, which is a `buildSkyMask` finding rather than a sky, and is not
measured further here.

**THOSE ARE THE PROTOTYPE'S NUMBERS, AND THE SHIPPED STAGE READS LOWER.** The
ten-frame sweep smoothed the rendered planes with a dense 17 px box (R8) to
choose the radius; the shipped map is a 22 px texel box bilinearly upsampled,
a wider kernel. Measured on the same population of NIR_3406 through the export
path itself, the shipped stage reads **15.9 → 2.2** at the 12 px lag with the
mean held 36.9 → 37.0 — a quarter of Pink IR's bare sky, not half. The 2.50
patch note carries the prototype's 4.7, which understates what shipped. A
control anchored on the prototype's figure refused the shipped reading once
for exactly this reason; the anchor that holds on the shipped path is the mean,
not a residual measured with a different kernel.

**THE OBVIOUS ALTERNATIVE, MEASURED AND REJECTED FIRST.** A sky mask's own
`saturation` at 0.35 cuts the same residual 73% — and takes the sky's mean
chroma 36.9 → 10.9 with it. The blue and the noise are the same quantity;
scaling removes both. 4c-xi's headline already said the blue is 1.4% of the
sensor's range. The control that catches this — the mean must HOLD — is printed
beside every row above, and `addMask(4)` defaults that saturation to 1.3 — a
deliberate default, recorded in the code as taste. Measured on the same
population with every arm through the shipped path: the mask multiplies the
residual by about 1.7 whichever way the stage is set — stage off 15.9 → 27.3,
stage on 2.2 → 3.7, Pink IR (no stage) 8.7 → 12.4 — and lifts the mean chroma
50%. So Add Sky still costs in RATIO, but with the stage in, Aerochrome after
Add Sky (3.7) sits well under Pink IR's bare sky (8.7), and the default stands.
The "about a third" an earlier draft of this paragraph carried came from the
lag-4 whole-sky instrument hub §320 retired, which under-reads.

**AND THE SHIPPED PATH FAILED ITS OWN CONTROL ONCE, WHICH IS THE PART WORTH
KEEPING.** Rendered through the actual export path, the sky's mean chroma read
27.4 → 31.8, +16%: the map had been built from the RAW source while the pixels
it blends into come through the denoise and detail pre-pass, and the bilateral
lowers a noisy sky's chroma — so the map targeted a different sky. The
measurement harness had never shown this because it built its map from the
pre-passed render. Both paths now build the map from the same pre-passed
sampler the pixels use, and the control reads 27.4 → 27.4. Two errors in the
control itself along the way, both coordinate conventions: "outside the mask"
defined by the nearest texel where the stage blends by bilinear weight (704
fringe bytes), and the harness passing `x/W` where the export passes
`(x+0.5)/W` (2 bytes). With both matched: **0 bytes changed outside the sky
across 2,196,335 pixels.**

**WHAT IT DOES NOT DO.** It is a sky stage. The gravel mottle 013 also names,
and any coloured patchiness off the bitmap, are untouched by construction; and
a frame whose sky the heuristic does not find gets nothing. The lattice, the
scale and the mean are the three things every earlier remedy in 4c-x through
4c-xx got wrong at least once, and each is now a printed control rather than a
sentence.

**NOT THE SAME DEFECT AS 4c-xxii AND §319, and both live in the sky.** That one
was pale LUMINANCE speckle, three to five pixels, fixed by widening the
bilateral's spatial window. This one is coloured, 10–25 px, and sits in the dark
third. Two artefacts in one region; the luminance fix is not overturned by any of
the above.

---

## Sources

The capture-side workflow, the hotspot procedure and the three routes are
maintained outside this repository as the IR photography workflow reference;
this file is the **app-side** companion and should not fork it. Where the two
disagree about capture, the workflow reference wins. Where they disagree about
what this app does to a file, this file wins and the measurement is named.

Raw behaviour generally — levels, curves, matrices, highlight handling,
metadata — follows dcraw/LibRaw and the DNG spec, and deviating from reference
behaviour needs a written reason recorded in `NOTES.md`.

### 9l-ii. THE STAGE CORRUPTED EVERY TIFF EXPORT, AND THE FIRST DIAGNOSIS WAS WRONG

**Found 2026-09-18 by exporting, not by measuring.** The exported TIFF of the
practice oak frame (NIR_0063) with Aerochrome on carried saturated blue and
cyan along every branch and leaf gap and solid yellow-green speckle across the
bright sky; NIR_1376's sky went pink beside its crown. The preview of the same
state was clean, and so were 9l's three controls — 0 bytes outside the mask,
mean held, residual down 86% — every one of them measured in floating point on
the population being fixed. Read from the file: 13,809 pixels of one 700 px
export moved by more than half the chroma range between the stage on and off,
max 1.011, 99.9th percentile 0.931, where the mottle being smoothed is 0.06.

**The first diagnosis said the blend was acting on pixels the soft 384 px mask
leaked onto, and a gate on the pixel's chroma distance to the target was
written, verified in node and built. The walk read the identical 1.011 on the
gated build.** A blend bounded at 0.12 cannot move a pixel by 1.0, so it was
never the blend. Exported again at amount 0.01, the same pixels still moved,
and their colour said what it was: blue 0.98 to blue 0.03, red and green
untouched. The stage had nudged a bright pixel's blue a hundredth past 1.0
and `export.ts` stored `value × 65535` into a `Uint16Array` with no clamp, so
1.01 became 0.01; a branch whose solved green went a little negative wrapped
to 1.0 and turned cyan. The preview's framebuffer clamps; the JPEG path clamps
through `Uint8ClampedArray`; the node reproduction used the JPEG path. Every
clean result was clean for the one reason the TIFF was not.

**Fixed three ways, and all three stay.** The stage clamps its own output in
`compileEdit` and in the shader; the 16-bit write clamps as the floor under
every stage; and the chroma-distance gate (`SKY_GATE_LO` 0.12, `SKY_GATE_HI`
0.25) is kept, because a branch under a leaf gap IS half a range from the sky
and should not be pushed toward it even by 0.12 — it was right about that and
wrong about being the cause. The map's texels are now mask-weighted means with
non-finite samples dropped, for the same reason.

**The instrument that was missing is `tools/sky-stage-walk.mjs`**: the frame
exported twice through the real app, TIFF at 25%, and the per-pixel chroma
displacement between the two files bounded OVER THE WHOLE FRAME — max at the
gate, 99.9th percentile at the mottle's amplitude, and a floor so a stage that
does nothing also fails. It read 1.011 on the shipped build, 1.011 on the
gated build, and **0.126 / 0.084 on the clamped build** — the blend's own
ceiling at the gate (0.12 × the largest distance it still acts on) and the
mottle's amplitude, which is what a smoothing stage should read. The node
controls on NIR_3406 are unchanged by the clamp: 0 bytes outside the mask,
mean 27.4 → 27.4, residual 15.9 → 2.2. Hub LESSONS §322.

**What this means for 9l's figures:** they stand — they were measured in
floating point on the working copy, where nothing wraps. What they never
measured was the file.

### 9l-iii. THE STAGE MEASURED ON THE EXPORTED FILE WITH RESTORE DEPTH ON — THE RENDERING THE DEVICE SHOWS

**Run 2026-09-18 on the clamped build (2.50.6), through the app's own Export &
Save**: 16-bit TIFF at 50% (a 2×2 average of the native render, `export.ts`
ss = 2 — so not the binned working copy 9k/9l rendered, and the node figures
are reported beside it rather than gated on), five exports per frame —
Aerochrome with Restore depth ON at sky smoothing 1 and 0, Pink IR with the
lift on, and the lift-OFF pair. Measured on the exported pixels over
`buildSkyMask`'s population, dark third by the Pink IR export's luma, p95 at
the 12 px lag. Controls first: every export the decode's size (NIR_1651's
portrait export turned back by luma correlation 0.936 against −0.142 the other
way), the lift-off pair showing 9l's shape (18.0 → 3.3, mean 47.3 → 47.1), and
the mean held within 1% on all four frames with the lift on.

- NIR_3406 (the defect frame): Pink IR 16.8; Aerochrome lift ON 21.9 → 4.0,
  82% removed; lift OFF 18.0 → 3.3, 82%.
- NIR_0063: Pink 3.6; lift ON 4.9 → 2.6, 47%; lift OFF the same.
- NIR_1651: Pink 4.4; lift ON 10.7 → 4.8, 56%; lift OFF 13.9 → 6.0, 57%.
- NIR_1376 (no defect): Pink 17.8; lift ON 8.2 → 2.5, 69%.

**So 9m's prediction held both ways.** With Restore depth on, the stage-off
residual sits above the lift-off reading where the lift fires (21.9 against
18.0 on 3406; 10.7 against 13.9 on 1651 goes the other way, where the lift's
tone half lowered the sky's contrast), and the FRACTION the stage removes is
the same to within a point whichever way the lift is set. After the stage,
Aerochrome's sky on the exported file reads a quarter of Pink IR's on the
frame that was reported, and at or below Pink IR's on the other three. That is
the number the device gets, on the rendering the device shows.

**What the export path is not:** the working copy. Its stage-off residual on
3406 reads 18.0 against the node harness's 15.9 and its mean chroma 47.3
against 36.9, because a native render averaged 2×2 keeps more of the look's
chroma than a render of the 2×2-binned decode. The preview and the file differ
by that much in sky chroma before any stage runs; `agreement-walk` compares
param paths, not scales, and this is recorded as a finding, not a defect.

### 9m. RESTORE DEPTH UNDER AEROCHROME — WHAT THE APP'S OWN BUTTONS DO, AND A PREMISE WITHDRAWN

**Every sky figure in 9k and 9l was measured with Restore depth OFF.** The
harnesses built their Aerochrome from a parameter literal with `tone`, `sky` and
`foliage` at neutral, while the app re-solves the lift on every Look press
(`applyLook` → `applyLift`, `main.ts`) and it is on by default. Line 398 above
and `aerochrome-walk` checks 7/8 had already recorded that the button and the
approved sheets differ for exactly this reason. So 9k/9l describe a rendering
the device does not show by default; the fraction the stage removes is expected
to hold and has not been measured with the lift on (the export-path run for
that is owed and waits on the choice below).

**A premise stated and then withdrawn, 2026-09-18.** Reading `solveLift`: the
colour half boosts the foliage band up to `FLAT_WARM_REF = 0.35` and the sky
band up to `FLAT_COOL_REF = 0.50`, never down, and 4b records the shipped look
measuring sky saturation 0.50 — so it was inferred that Aerochrome's sky
saturation IS the lift's target. Rendered through the app's own controls on
four frames, that does not hold: under the shipped button the colour half fired
on ONE of the four (NIR_0063, Sky slider 1.10), and on NIR_3406 the lift changed
the measured sky saturation 0.28 → 0.39 with the Sky slider at exactly 1 — the
TONE half, through contrast. The harness's first control was anchored on that
inference and refused the run; the rows are read here as what they directly
are (slider readbacks and canvas hashes from the app), not as a measurement of
the residual.

**Four candidates, each expressed as controls the reader has** (the look-sheet
rule), rendered on NIR_3406, NIR_0063, NIR_1651 (the three frames with the sky
defect) and NIR_1376 (none):

- **A, shipped** — press Aerochrome; the lift re-solves against the look.
  Sky slider: 1.00 / 1.10 / 1.00 / 1.00. Foliage slider: 1.00 on all four.
- **B, the approved sheets' route** — press Pink IR (lift solves for Pink IR),
  then write the recipe into the mixer, bands, Texture, Sky smoothing and
  Denoise by hand; no re-solve. Sky slider: 1.00 / 1.85 / 1.11 / 1.41. Foliage:
  1.07 / 1.37 / 1.00 / 1.00. Mean canvas chroma on NIR_0063 131 against A's 70.
  Pink IR's own rendering sits below the references in the bands the lift
  measures, so the solve pushes the bands hard, and Aerochrome's matrix and
  band shifts then amplify that push. The sheets that were approved carried
  this.
- **C, tone half only** — press Aerochrome, then Sky and Foliage saturation
  back to 1. Identical to A by hash on NIR_3406, NIR_1651 and NIR_1376; differs
  from A on NIR_0063 only by the 1.10.
- **D, off** — press Aerochrome, then Restore depth off. Identical to A by hash
  on NIR_1376 (nothing to lift); identical to C on NIR_0063 (the tone half did
  nothing there; the whole lift was the 1.10 sky boost); differs from A on
  NIR_3406 and NIR_1651 by the tone half alone.

**So under the shipped button, Restore depth on these frames is mostly the tone
half**, and the colour half is close to inert — it fires where Aerochrome's
own rendering measures below the references, which the film-angle look rarely
does. The large colour difference is between A and B: the approved sheets were
a much more saturated rendering than the button ships, and nothing has chosen
between them. The pictures went to the owner with these readbacks under each;
the choice is a look choice and is not made here.

**HELD TO THE FILM, 2026-09-18 — and it settles between them.** The same
split-population instrument 4b-iii used on the film's two photographs, run on
the app's four renders (controls: A lands on the film's angles as walk 10a/b
say; A, C and D read identically where their hashes are identical):

- Hue: every candidate sits on the film's angles — foliage 0–5° against 6.2°,
  sky 202–207° against 204°. The lift moves saturation and value, never hue.
- Foliage saturation, film 0.60 (lighter filter) / 0.78 (red filter): A 0.63,
  0.79, 0.65, 0.55 on NIR_3406, 0063, 1651, 1376 — the lighter-filter target
  the look was solved to. B 0.64, 0.92, 0.78, 0.69 — the red-filter figure,
  and past both on 0063. D 0.70, 0.73, 0.62, 0.55.
- Sky saturation, film 0.66 / 0.92 at value 0.32: A 0.38, 0.37, 0.57, 0.76 at
  value 0.64–0.89; B 0.41, 0.64, 0.66, 0.77. No candidate reaches the film's
  sky and the miss is not the lift's: the film's sky is dark and saturated,
  ours bright and pale under every setting. That is the look's sky band and
  the roll-off question 4b-iii closes on — the next piece, not this one.
- The film's own pass/fail (soil, asphalt, buildings unchanged), measured as
  the chroma of the pixels colourless with the lift off: A 4.9, 1.0, 7.8, 8.2;
  B 5.3, 1.5, 10.2, 9.5 — B colours the neutrals more on every frame, by
  8–31%, small in absolute terms; A barely moves them from D.
- On the defect frame, D → A: foliage value 0.58 → 0.69 (film 0.77), foliage
  sat 0.70 → 0.63 (0.60), sky sat 0.27 → 0.38 (0.66) — each toward the film;
  colourless share 10.1% → 19.2% against 13.8% — away, the tone half pushing
  the pavement to white.

**So A, as it ships, with Restore depth on.** It is the lighter-filter film on
foliage and neutrals and its tone half moves the frames that need it toward
the film. C is the same rendering. B is the red-filter photograph's foliage
bought with coloured neutrals and an overshoot, and its extra sky saturation is
a smaller step toward a target none of the four reaches. The two open items
this leaves: the sky residual measured on the export path with the lift ON
(candidate A), and the sky's saturation and value against the film, which is
a look question with its own record to write.

**The canvas residual column of that run is NOT the export instrument** and is
not reported: on the 1400 px practice DNGs its teal population read 52 where
the export-path instrument of 9l reads 4.4 on the same frame — a different
population, not a scale. Residuals on the chosen candidate come from the
export path (9l's method), with the lift state printed in the control block.
