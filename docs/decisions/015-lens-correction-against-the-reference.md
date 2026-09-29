# 015 · The lens correction against the reference, starting with the term it dropped

## Context

Reported from the iPad, 2026-09-17, on the lone-oak frame under Aerochrome at
100%: a halo at the centre of the picture, with the subject washed out. The
report named the cause — the lens correction — and it was right.

What the app does, read rather than recalled. `initHotspot` sets `hsFix` to 1
from a shipped profile matched on the photograph's own EXIF, so a measured
radial colour curve is applied at full strength to every raw file that matches
the table. `compileEdit` assembles it at `src/pipeline.ts:1049-1061` and applies
it at `1151-1155`, before the camera matrix, the R-B swap, the hue rotation, the
look's saturation of 3.0 and its mixer carrying -1.44.

That was the code on 2026-09-17. Since 2026-09-18 (record 021) a raw's
correction runs at decode, in `src/lensflat.ts`, before anything is measured; the
in-grade stage (`src/pipeline.ts`, `compileEdit`, line 2158 on 2026-09-29) serves
only 8-bit sources, and the shader in `src/gl.ts` the 8-bit screen.

Rendered on and off from the app itself, that correction removes **37%** of the
foliage's red-against-blue inside the middle of the frame and **18%** further
out. Separating the two halves in node: the brightness bump contributes almost
nothing (inner 0.5595 against 0.5639 uncorrected), and the colour curve
contributes all of it (0.3571). The oak sits in the middle of the frame, so the
subject is what gets washed out.

The intended outcome: the correction does what the published one does, and the
photograph keeps its colour.

## Looked up

**This item exists because the research was skipped twice.** Two diagnoses were
reasoned out from measurements of the app's own output, and both were wrong —
one in the opposite direction from the other. The reading that settled it is
written into `IR-SCIENCE.md` §9 in full, with every claim attributed. The parts
that decide this record:

**The artefact is added light.** Kolari: light "bounces back from the sensor
into the lens, and gets reflected back towards the sensor where it gets focused
by the aperture into a hotspot", and its strength tracks the scene's own light —
"the less light there was in the scene, the less pronounced the hotspot got".
LifePixel adds the barrel and element coatings, and notes the spot is "sometimes
in the shape of aperture leaves".

**Two reference implementations correct a flat field, and each picks a
normalisation anchor and says which.** Kolari normalises to the flat's average:
`corrected = image x (average flat frame / flat frame)`. RawTherapee normalises
to the flat's centre — per RawPedia, the factor "is proportional to how much
darker the corresponding area in the flat-field image is relative to the measured
exposure of the center of the flat-field image", lifting the periphery and
leaving the centre alone.

**This app has neither anchor.** It divides by the curve and by no reference
level. Measured across the shipped table, that moves the whole frame's
red-against-blue by **+1.49%** on the blend matched to this photograph, **+3.79%**
on the worst profile, and past 2% on **14 of 72**. Gray-world white balance is
measured before this stage runs, so nothing downstream restores it.

**RawPedia also states the placement**: "Flat-field correction is performed only
on linear raw data in the beginning of the imaging pipeline". The DNG spec
(GainMap, OpcodeList2), Lightroom (lens profiles in raw conversion) and
darktable's scene-referred rationale agree on the shape — the correction
finishes before the grade.

**And the references name failure modes this app has no answer to**: clipping of
near-overexposed areas, which RawTherapee ships a Clip Control slider for; scene
dependence, which Kolari handles with a per-image curve on the flat layer; and
the flat being deliberately smoothed before use, against this app's 80 hard bins.

**AND THE SOURCE THIS REPOSITORY WAS BUILT AROUND SAYS THE APPROACH DOES NOT
WORK.** Rob Shea's method is video-only; both hot-spot videos were transcribed
and read in full (IR-SCIENCE.md 9h). On a lens with a mild hot spot: "You're not
going to be able to maybe create a single hotspot corrector. You've noticed that
each one of these is a little bit different because it depends on the lighting
conditions." That describes one stored correction per lens and aperture, which
is what this app ships. The same video corrects 4 of 85 edited frames on that lens;
this app corrects every raw file the table matches. The detection test given is a
white-balance pick at the edge against one at the centre, and a visible hot spot
measures roughly 1000K between them. The corrections made are temperature first,
exposure second and tiny (-0.2 to +0.2 EV), never complete, and for a severe spot
the method abandons geometry entirely for a chroma-key on the artefact's own colour.
None of that changes the dropped term below, which is a defect in its own right;
all of it bears on the per-image strength ranked underneath it.

Sources: kolarivision.com (the hotspot science page and the astrophotography
correction method), rawpedia.rawtherapee.com (Flat-Field), docs.darktable.org
(the pixelpipe and module order), lifepixel.com (the primer's hot-spot chapter),
robsheaphotography.com and its two hot-spot videos, transcribed with yt-dlp,
libraw.org and the DNG specification. Jim Kasson's "Infrared hotspotting: the
last word" (blog.kasson.com, 2020-11-17) is the one source still unread, and on
2026-09-29 the reason was established: with the host allowed for the session, the
site answers every request with a Cloudflare JavaScript challenge (a 403 carrying
`cf-mitigated: challenge`, through a proxy reporting no failure), and a headless
browser here does not trust the proxy's certificate, so the challenge cannot be
run. Refused by the site, not blocked by the network. It is the only source likely
to carry a measurement of how the spot scales with scene brightness, which is what
the per-image strength turns on.

## Built already

What exists that the remaining work on this record will use, so a second one
does not get written (LESSONS 330):

- **The gains, once.** `lensGainsFor` in `src/pipeline.ts` builds the per-bin
  gain tables every CPU applier uses; `lensAreaMean` beside it normalises the
  colour halves (shipped 2026-09-17, Options); `lensBin` picks a pixel's bin, a
  floor over 80 bins. `src/gl.ts` repeats the normalisation in `setLensCurve`.
- **The appliers.** The decode-time flat for raws (`src/lensflat.ts`), the raw
  export's sampler (`src/export.ts`), the in-grade stage for 8-bit sources
  (`compileEdit`), and the shader for an 8-bit screen (one `texelFetch`).
  `tools/agreement-walk.mjs` does NOT exercise the decode-time flat, which this
  entry used to claim: its raws are practice DNGs with no EXIF, so no curve
  matches, and its camera-JPEG pair sits in a folder that no longer exists
  (record 083). `tools/lens-order-walk.mjs` is the walk that holds it. Its
  three files sat in an earlier session's folder, so it could not run in a
  fresh container. On 2026-09-29 it was changed to take them by name through
  `tools/owner-images.mjs`, run to a pass on that day's build, and made to fail
  against a decode flat that ignored what it had already laid: Bypass stopped
  changing the picture, and 89% of pixels moved on the round trip.
- **The pass at decode.** The flat laid on the linear raw before the balance
  and the selection (021) is in `src/lensflat.ts`, `src/decode.worker.ts` and
  `src/decodeClient.ts`. It is planned by `lensPlanFor` in `src/main.ts`.
- **The strength at open.** `lensStrengthAtOpen` in `src/main.ts` is the one
  rule every path that renders a photograph as it opens takes its strength
  from. It is per lens, with 1 when nothing is remembered.
- **The curves and the matcher.**
  - `src/lensstore.ts`: `matchIn`, `bumpFrom`, `bumpProblem`, `colourProblem`.
  - `src/hotspot.ts`: `findShipped`, `hasColour`.
  - `src/hotspotProfiles.ts`: the table measured on 2026-09-12.
- **The checks.**
  - `tools/lens-order-walk.mjs`: the fresh open, memory across apertures, a
    remembered 0, the card's wording.
  - `tools/lens-store-check.mjs`: the curve rules held both ways.
  - `tools/preview-version-check.mjs`: it hashes `lensPlanFor` and
    `lensStrengthAtOpen`, and from 2026-09-29 `src/lensflat.ts`, which every raw
    preview is made of and which it had left out.
  - `tools/lens-diagnostic-check.mjs` (2026-09-29): the diagnostic report's
    centre gains are the gains `lensGains` lands. The report had worked them out
    from the stored bins, so from 2026-09-17 it described a correction without
    the anchor, which nothing applies.

## Weighed against

**013, "Aerochrome is the right colour and comes out splotchy"**, owns the
chroma-noise half of what the same look does to a frame, with its own sources
already read. This item must not re-open it. They touch the same photographs from
opposite ends: 013 is about what the grade does to noise, this is about what it
does to a correction. 013's work changes what this stage gets measured against,
which was the argument for ranking this behind it, reversed on 2026-09-26 (Rank).

Previous work on this exact stage, by `NOTES.md` heading: "## Measure every ring
of a flat again, centre to corner" produced the shipped table, and "## Guard the
profile arrays against non-finite and wrong-length data" hardened how it is read.
Neither asked whether the correction is applied the way the field applies it —
the measuring was careful and the applying was assumed.

`src/main.ts` already carries a comment describing this defect from an earlier
report: that in a bright field already near neutral the correction reads as a
disc while the ring average, dominated by sky and foliage, is still red. The
remedy chosen then was to remember the strength slider. That is a control, not a
correction, and this record is the second time the same thing has been reported.

## Depends

- touches 013 — both act on the centre's colour under the look. The edge
  turned round on 2026-09-26: 013 now declares that it needs this, because its
  population was measured with this correction off at open.

## Options

**Restore the normalisation anchor, and interpolate the bins. Chosen; the anchor
shipped on 2026-09-17 and the blend was measured and set aside (both below).** The
plan's wording of 2026-09-17 follows; what shipped is stated exactly below. Divide
each matched curve by its own area-weighted mean before applying it — Kolari's
formula complete rather than a new idea — and blend linearly between bins instead
of indexing `floor(r * n)`. Both are the reference behaviour; neither invents
anything. The shipped profile arrays are not touched, because normalisation
happens at apply time, so `hotspotProfiles.ts` keeps exactly what was measured
and a future re-measurement is unaffected.

**THE ANCHOR SHIPPED ON 2026-09-17, AND THE BLEND WAS MEASURED AND NOT SHIPPED**
(IR-SCIENCE §9g; NOTES, this item's bullet). Written into this record on
2026-09-29: until then its "What stays open" below still named the normalisation.
- **What the anchor is, exactly.** `lensAreaMean` multiplies each colour curve by
  the area mean, over the sensor's 3:2 shape, of the gain it applies at full
  strength, so at full strength the applied gain averages exactly 1 over the frame: the curve redistributes colour
  and no longer tints it. Kolari's formula scales by the flat's own mean instead;
  the two differ only in the second order for a curve a few percent from flat.
- **What it measured.** Two real builds, the lone-oak frame under Aerochrome: the
  foliage's red-against-blue with the correction on went from 77.4% to 82.6% of
  its value with the correction off, giving back 23.0% of what the stage was
  taking. A frame with no curve and a frame with an area-neutral curve were
  bit-identical. (An earlier 43%, read off half-size views, is superseded.)
- **The blend** changed nothing on that frame to four significant figures and
  was not shipped (Rejected).

As planned on 2026-09-17 it was bounded: `src/pipeline.ts:1049-1061` and
`1151-1155` (that day's lines), the matching
`src/gl.ts` arithmetic under the standing change-both rule, and a
`PREVIEW_PIPELINE` bump because the render moves. It has a bit-identity test
(any frame whose curve is already area-neutral must render byte for byte as it
does now) and a made-to-fail test (force the mean to 1 and the wash-out returns).

**Show it as pictures before it becomes a default.** Four renderings of one
frame differing only in this stage — as shipped, normalised, normalised and
interpolated, and off — full frame plus 1:1 crops of the canopy and of open sky.
A look choice is shown, never described, and no photograph changes without the
owner's approval. (For the anchor this sheet was not made: it shipped on the
two-build measurement in §9g. The rule stands for what remains.)

**AND STOP APPLYING IT AT OPEN. Chosen, 2026-09-17.** `lensFix` and `hsFix`
start at zero on every path that opens a photograph. The table, the matcher, the
card and the slider all stay; a strength the reader chose for that lens and
aperture is still remembered. The correction waits to be asked for.

This is the change the reading argues for rather than the one it merely permits,
and two independent lines reach it: the sources say a stored per-lens correction
cannot be right for every frame, and this app's own rule says an at-open
automatic must be visible and undoable, which this one never was.

`PREVIEW_PIPELINE` moves with it, because a cached quick-look tile was rendered
through the correction and is keyed on that number.

**REVERSED, 2026-09-26: IT OPENS ON AGAIN, AT FULL STRENGTH, REMEMBERED PER
LENS.**
- **The frames.** Twenty-two NEFs of one set (NIKKOR Z DX 50-250mm, f/5 to f/8,
  53 to 250 mm) were rendered through the app's own export under Aerochrome, at
  strength 0 and at strength 1.
- **The curves cover them.** Every frame matched a curve measured from the
  owner's flat frames on 2026-09-12.
- **Off, the centre drifts.** At 0, on most of the frames, the centre of the
  sky is near-grey or red-grey where the edges are blue: NIR_3703's is flat
  grey, and NIR_3700's is a red-grey blotch above centre. The centre of the
  foliage is redder than the rest of the frame: a red disc on NIR_3716.
- **On, centre and edge move toward each other.** At 1 the centre loses that
  cast and moves the most, up to 17 ΔE00, though under 4 on three frames. The
  edges move less, 2 to 8, and warm slightly: NIR_3716's edge grass is a little
  redder at 1. On one frame of the 22 the centre barely changes. Of the 22
  sheets, five were opened.
- **This record predicted it.** That is its own Rejected entry, turning the
  correction off by default, measured on a set of frames rather than argued
  from one.
- **Readers were covering it by hand.** The grey patch a reader had been hiding
  with a Sky mask's highlights pushed toward blue was this drift, uncorrected.
- **The memory is now per lens.** A strength chosen at f/5.3 never reached an
  f/5 frame, so 19 of the 22 opened uncorrected after one had been set. Every
  chosen value is stored, 0 included, because absence now means full.
- **The card says what the profile does.** It said "brightness and colour" on
  profiles with no brightness curve; it says "colour only" there now.
- **What stays open.** Not the normalisation: it had shipped nine days before
  this line first named it (above). Whether the wash-out the report named is still
  there on today's build was looked at on 2026-09-29, on the reported frame,
  NIR_1376.NEF, from full-size exports at strength 0 and 1. On this session's
  reading of those pictures it is; the pictures went to the owner, and the
  owner's answer is what decides. How much
  smaller than before the anchor was not looked at (no render of that build was
  opened; §9g's 23.0% is a number, not a picture). At 1:1 in the centre, strength 1 turns a large share of the sunlit
  leaves white and pale pink where 0 keeps them red (Looked at). Two cell-tower
  frames from the same day's exports show both sides of it. On NIR_3716.NEF the
  dirt track and hillside in the middle are red at 0 and neutral grey at 1, which
  is the artefact's red coming off things that have none; the bushes beside them
  go from deep red to pale salmon in the same step. On NIR_3700.NEF strength 1
  takes the red speckle out of the sky and turns the pampas plumes largely white.
  On the oak nothing neutral in the middle shows the cast: its sky gaps barely
  move. The owner's answer decides whether 015 is archived or its next half gets a
  record of its own, chosen from: a per-image strength, clip control, or telling the reader a hot spot is
  there by the centre-against-edge white-balance test (about 1000K apart on a
  visible one, §9h). Each is its own record.

## Rejected

**The centre anchor, as RawTherapee uses it.** It is a published normalisation
and it cannot be used here: it lifts the periphery and leaves the centre alone,
and the hot spot IS the centre, so anchoring there would raise the whole frame to
match the artefact. Recorded because the two anchors look interchangeable until
you ask which end of the curve is trustworthy.

**"The global cast is the mechanism."** Reasoned out before the research and
measured at only +1.49% on this frame — real, worth fixing, and far too small to
account for a 37% loss of foliage colour. It is a term that was dropped, not the
whole story.

**"The hot spot is a fixed additive veil, so subtract a constant."** Reasoned out
second, and it predicted the residual would be worst in dark sky and negligible
in bright foliage. The measurement showed the exact opposite. Kolari's own test
says why: the added light scales with the scene's illumination, so it is neither
a fixed quantity nor a fixed fraction of each pixel. Rebuilding the stage as a
subtraction is not ruled out, but it needs a calibration brightness that
`StoredProfile` does not record — checked, and there is no such field.

**Turning the correction off by default.** It flattens a real gradient: on this
frame's sky, the centre-to-edge colour range goes from 1.30 uncorrected to 0.83
corrected. Discarding that to save the foliage trades one defect for another, and
the references do not say the correction is wrong — they say it is normalised,
smoothed, clip-controlled and scaled per image, none of which this one is.
Chosen anyway on 2026-09-17 as a stopgap, and reversed on 2026-09-26 on this
paragraph's own grounds (Options).

**Blending the 80 bins** (linear interpolation between bin centres). The
reference behaviour, and measured on 2026-09-17: it changed nothing on the
lone-oak frame to four significant figures (§9g). It costs every applier a
change, the shader's included, where a 32-bit float texture is not linearly
filterable in WebGL 2 without an extension the iPad may lack, so it would be two
reads and a mix. What would reopen it: a frame where ring edges are seen at full
size.

**Doing the whole re-architecture in one go** — clip control, a per-image
strength, and moving the stage out of the creative chain. All three are supported
by the sources and all three change how every photograph renders. Each is its own
change with its own pictures; bundling them makes the result unattributable.

**Bolting a sky mask onto the current correction.** The subject-selective
behaviour the report wants falls out of correcting the artefact properly; adding
a mask to a correction with a dropped term papers over the term.

**Keeping it automatic and fixing it in place** — clip control against the raw
white level, a per-image strength, moving the stage before the grade. Three
changes, each of which changes every photograph, spent making a model better
that every source found says is the wrong model. Clip control and the ordering
are still worth having if the correction is ever applied broadly again; they are
not worth having to prop up an automatic nobody in the field runs.

## Rank

**First, by the dependency test (2026-09-26).** Every colour item above it was
measured with this correction off at open. 069's grey patch in the sky is this
lens drift, uncorrected, and 013's splotchy Aerochrome was tuned on frames that
opened without it. Turning it on moves what those items measure, so it goes
before them. What remains is decided from the reported frame on today's build,
shown in pictures first. Earlier it ranked fourth (2026-09-17), behind 013 on
the argument this reverses.

## Looked at

- NIR_3700, 2026-09-26: strength 0 against 1 under Aerochrome, the app's own export: whole frame, 2x centre and corner, and the difference. A red-grey blotch in the sky above centre at 0, an even blue-grey at 1; the seed heads pink-red at 0, white at 1; the corner barely moves.
- NIR_3703, 2026-09-26: the same sheet. The sky's centre at 2x is flat grey at 0 and blue at 1; the foliage corner is unchanged.
- NIR_3716, 2026-09-26: the same sheet. A red disc over the centre foliage at 0 that is gone at 1; the bottom-left grass is a little redder at 1 than at 0.
- NIR_1376.NEF, 2026-09-29: the reported frame, the lone oak, on today's build (the anchor shipped), opened in the app with its EXIF and lens match, under Aerochrome, exported at full size (5600 x 3728) at lens strength 0 and 1. Whole frame, side by side at 1000 px each: at 1 the canopy is paler, coral-pink against a deeper red at 0, and the brownish haze round the crown's top at 0 evens to blue-teal at 1. The centre at 1:1, 1000 x 1000 each: at 1 a large share of the sunlit leaves go white and pale pink, most of all in the upper canopy and the lit mass lower left, where 0 keeps them red; the red survives in shade and on the trunk; the grey-blue sky gaps barely move. The wash-out the report named is still there; no render of the build before the anchor was opened, so whether it is smaller is §9g's number, not a picture.
- NIR_3700.NEF, 2026-09-29: the same export on today's build (5600 x 3728), strength 0 and 1 under Aerochrome, whole frame at 1000 px a side and the centre at 1:1. Whole frame: the red-grey blotch in the sky above centre at 0 is an even blue-grey at 1, and the central bushes go paler and whiter. Centre at 1:1: at 0 the sky is grey with red speckle and the pampas plumes and bushes are red-pink; at 1 the sky is blue-grey and the plumes and bushes go largely white. The 2026-09-26 sheet saw the same.
- NIR_3716.NEF, 2026-09-29: the same export and views. Whole frame: the red disc over the centre of the field at 0 is gone at 1, the field is even, and the central bush cluster goes from deep red to pale pink; a red smudge at the left edge, mid-height, is there at both. Centre at 1:1: at 0 everything in the middle is red, the bushes, the grass, and the dirt track and hillside behind them; at 1 the track and hillside are neutral grey and the bushes pale salmon with white highlights.
