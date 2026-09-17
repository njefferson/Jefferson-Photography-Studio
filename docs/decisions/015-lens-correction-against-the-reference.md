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
last word" is the one source still unreachable, recorded as unread in §9f; it is
the only one likely to carry a measurement of how the spot scales with scene
brightness, which is what the per-image strength turns on.

## Weighed against

**013, "Aerochrome is the right colour and comes out splotchy"**, owns the
chroma-noise half of what the same look does to a frame, with its own sources
already read. This item must not re-open it. They touch the same photographs from
opposite ends: 013 is about what the grade does to noise, this is about what it
does to a correction. 013's work changes what this stage gets measured against,
which is the argument for ranking this behind it.

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

## Options

**Restore the normalisation anchor, and interpolate the bins. Chosen.** Divide
each matched curve by its own area-weighted mean before applying it — Kolari's
formula complete rather than a new idea — and blend linearly between bins instead
of indexing `floor(r * n)`. Both are the reference behaviour; neither invents
anything. The shipped profile arrays are not touched, because normalisation
happens at apply time, so `hotspotProfiles.ts` keeps exactly what was measured
and a future re-measurement is unaffected.

It is bounded: `src/pipeline.ts:1049-1061` and `1151-1155`, the matching
`src/gl.ts` arithmetic under the standing change-both rule, and a
`PREVIEW_PIPELINE` bump because the render moves. It has a bit-identity test
(any frame whose curve is already area-neutral must render byte for byte as it
does now) and a made-to-fail test (force the mean to 1 and the wash-out returns).

**Show it as pictures before it becomes a default.** Four renderings of one
frame differing only in this stage — as shipped, normalised, normalised and
interpolated, and off — full frame plus 1:1 crops of the canopy and of open sky.
A look choice is shown, never described, and no photograph changes without the
owner's approval.

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

**Fourth.** Below 012, which takes the photograph away from the reader. Below
013, whose chroma work changes what this stage gets measured against and which is
feedback on a look that shipped this week. Below 014, a device-reported defect
with a cheaper first step. Above everything under it, because those are unscoped
design directions and this is a defect with a known remedy: a published formula
implemented with one term missing, on a stage that is on by default for every raw
file the table matches.

**What comes next is now one thing, not three.** With the correction no longer
applied at open, clip control and the pipeline position stop being urgent — they
are properties of a stage that is off unless asked for. What remains is telling
the reader the hot spot is THERE: measure the frame's own white balance at the
centre against the edge, which is Rob Shea's own test and reads roughly 1000K
apart on a visible hot spot, and say so in words beside the slider that fixes
it. That is the version that matches both the field and this app's promise, and
it needs its own record and its own pictures.
