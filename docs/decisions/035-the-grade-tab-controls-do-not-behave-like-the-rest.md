# 035 · The Grade tab's controls do not behave like the rest of the app

## Context

Three defects reported together from the device, 2026-09-20, all on the Grade
tab. They are filed as one record because they are one promise — that a control
in this app behaves the way the control beside it does — and because two of
them share a cause.

**One: the wheel destroys the hue you chose when you reduce the amount.** Read
out of `src/main.ts` rather than inferred. The wheel's drag handler writes BOTH
values from the pointer position on every move: `params.grade[band*2]` from
`atan2` of the offset from centre, `params.grade[band*2+1]` from the distance.
Drag the puck toward the middle to take the effect off and the angle goes with
it — at the exact centre `atan2(0, 0)` is 0, so the hue the reader picked is
overwritten with red. There is no remembered axis to come back out along, which
is exactly what the report said. **The Amount SLIDER does not have this**: it
writes only `[band*2+1]` and leaves the hue standing, so raising it again
restores what was there. Same band, two controls, two different behaviours.

**Two: double-tap to put a slider back cannot reach any of the six grade
sliders.** `captureSliderDefaults` walks `#panel input[type="range"]` and skips
anything without an `id`; `back()` then looks the element up by `el.id`. The
grade sliders are built at runtime by `mkSlider`, which sets `type`, `min`,
`max`, `step` and an `aria-label` — **and no id at all**. So they are never in
`sliderDefaults` and the lookup returns undefined on every one of them. It is
not a timing problem and not the touch path; they have no identity to be found
by. The tone curve's five points had the same shape of problem and were given
their own `toneDefaults` array; the grade sliders were never noticed.

**Three: Shadow colour runs the wrong way.** Dragging right REDUCES. Every
other slider in the app increases to the right, which is the whole of the
report: a reader should not have to learn one control's direction separately.

## Looked up

**Nothing external decides the first two** — they are this app's own
inconsistency with itself, and an outside source cannot say what this app's
other controls do.

**The third is a labelling question and the field answers it by naming the
QUANTITY the slider carries rather than the effect.** A control called
"Saturation" goes up to the right and a control called "Desaturate" would go
down; no editor ships a slider whose label is a noun and whose travel is
subtractive. The app's own heading above it is "Colour out of the shadows",
which is an effect, and the slider under it is labelled "Shadow colour", which
is a quantity — so the control is currently labelled one way and behaves the
other.

## Weighed against

`NOTES.md` "## Double-tap a slider to put it back, 2026-09-09" is the feature
the second defect defeats, and it has been shipped and believed complete since
then. "## A slider named after the defect, 2026-09-19" is the same class as the
third: a control whose name describes the problem rather than the act.

IR-SCIENCE.md section 9j is where `shadowSat` comes from and it explains why
the control removes rather than adds — it is multiplicative on purpose, because
an additive shadow tint drove 858,273 grey pixels to saturation 0.989 on a
frame whose shadows were a roof. **The direction is a labelling decision and
must not be made by inverting the maths**, which would put that failure back.

## Depends

- touches 034 — 034 is about the shadow cast this tab's controls take off by
  hand. This record is about how those controls behave; that one is about what
  they should be doing automatically. Deliberately separate: fixing a slider's
  direction is not a step toward measuring an illuminant.

## Options

**Fix all three, and make the third a relabelling rather than an inversion.**
Chosen.

The wheel keeps the last non-zero hue and writes the angle only when the
pointer is far enough from the centre for one to be meaningful — the same thing
the reader means by the puck coming back out along the axis it went in on.
Below that radius it writes the amount alone, which is what the Amount slider
already does.

The grade sliders get ids, which puts them in `sliderDefaults` with no other
change: the double-tap gesture then reaches them through the code that already
exists. The ids also give them somewhere to hang a test.

And the Shadow colour slider gets a label that matches its travel — the
quantity rising to the right — rather than having its stored value flipped.

## Rejected

**Inverting `shadowSat`'s stored value so right means more.** It would flip the
meaning of a number that rides `SavedLook`, so every look already saved, every
`.ipslook` file already shared and every look inside an exported JPEG's APP11
segment would come back meaning the opposite. A stored value is a contract with
files that already exist.

**Capturing the grade sliders' defaults by walking the DOM again after they are
built.** It fixes today's symptom by adding a second moment that has to be
remembered. Giving the controls ids fixes it in the mechanism that is already
there, and anything built later is covered the same way.

**Treating the wheel's hue loss as "the reader should use the slider".** The
wheel is the control the panel leads with and the one a finger reaches for.

**Doing only the two that are cheap.** The three arrived together and are one
complaint: the controls on this tab do not behave like the others.

## Rank

**Above the pixel work and below the mask items in flight.** All three are
defects rather than design, two are small, and none of them needs a
measurement to know what correct looks like. It sits below 034 in the file only
because 034 is what the reader is reaching for these controls to do.
