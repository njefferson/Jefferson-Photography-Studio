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

**Route 2 — profile-based (the Rob Shea method).** Build the colour transform
from a profile made against the IR raw's own custom white balance rather than
fighting a visible-light pipeline channel by channel. Wider and more stable
grading latitude at the cost of setup. The app does not implement this. Some of
the owner's Lightroom-iOS DNGs embed such a profile.

**Route 3 — monochrome.** See section 2. Under-served here.

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
