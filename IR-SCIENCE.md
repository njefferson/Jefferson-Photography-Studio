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
