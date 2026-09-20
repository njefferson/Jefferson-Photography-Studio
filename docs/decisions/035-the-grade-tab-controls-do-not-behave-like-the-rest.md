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

**AND THIS RECORD GOT THAT THIRD ONE WRONG, SHIPPED IT WRONG, AND WAS TOLD SO.**
The first answer was to RENAME the control to "Amount" so that the name rose as
the slider moved right — while the colour in the photograph still fell. The
instruction had been that moving right must not reduce. A label is not the
convention; the convention is about what happens on the screen, and a rename
satisfies a sentence about names while leaving the reported defect exactly
where it was.

The mistake underneath it is worth more than the defect: **inverting the
CONTROL and inverting the STORED NUMBER were treated as one option.** They are
not. The stored `shadowSat` means "how much colour was removed" and rides
SavedLook, so flipping THAT really would change the meaning of every look
already saved, shared or baked into an exported JPEG — a real objection, to the
wrong thing. It was allowed to veto the control's direction as well, and the
rename was what was left. The inversion belongs in `syncFromUI` and `syncToUI`
and nowhere else, where it costs nothing and breaks nothing.

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

And the Shadow colour slider is TURNED ROUND: the control is the colour the
shadows KEEP, zero at the left and one at the right, converted to and from
`params.shadowSat` in the two sync functions. The stored field keeps its
meaning, so no saved look moves. The heading above it changes from "Colour out
of the shadows" to "Colour IN the shadows" for the same reason the control
turns — the whole section has to name the quantity that rises to the right, or
the reader is asked to hold two directions in mind at once.

A photograph therefore opens with this slider at its RIGHT end. That is not a
wart: a control that can only take something away, on an app where right
increases, has to rest at the end that takes nothing.

## Rejected

**Inverting `shadowSat`'s STORED value so right means more.** It would flip the
meaning of a number that rides `SavedLook`, so every look already saved, every
`.ipslook` file already shared and every look inside an exported JPEG's APP11
segment would come back meaning the opposite. A stored value is a contract with
files that already exist. **Still rejected — and it is not the same thing as
turning the control round**, which is what was actually asked for and is now
what ships. Keeping these two apart is the whole lesson of this record.

**Renaming the control instead of turning it.** Tried, shipped, and sent back.
The convention is about the photograph, not the label: a name that rises while
the picture falls is the defect with a better caption on it. Written down
because it is a cheap-looking answer that passes a check written against a
label — the walk for this originally read the word "Amount" and went green on
the unfixed control.

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

## Outcome

**ALL THREE SHIPPED 2026-09-20, and the third took two attempts.**

The colour wheels hold the hue over the innermost 15% of their travel, where the
angle is noise, so pulling the puck in to take the effect off no longer
overwrites the colour on the way and there is a direction to come back out
along. The six sliders beside them have ids, which puts them in the double-tap
capture and lookup with no other change.

**THE SHADOW SLIDER WAS FIRST RENAMED RATHER THAN REVERSED, AND THAT WAS SENT
BACK.** The report was that it runs backwards — right should increase, as it
does on every other slider in the app. What was built instead relabelled the
control "Amount" so that its NAME rose as the puck moved right while the colour
in the photograph still fell. The left/right convention is about the
photograph, not about the label, and a label cannot satisfy it.

What shipped is the control reversed. Dragging right puts colour back into the
shadows; the section above reads "Colour in the shadows" so the heading and the
direction agree. The inversion lives in `syncFromUI` and `syncToUI` only, so the
number stored in a look is untouched — every look already saved, shared as a
link or baked into an exported JPEG renders exactly as it did, and only which
end of the track it sits at has changed. A photograph opens with it all the way
right, which is the end where it does nothing, because a control that can only
take something away has to rest at the increasing end.

**The walk had to be rewritten too.** Its first version read the control's
LABEL, which is exactly what the sent-back fix changed — so it went green on the
unfixed control. It reads the rendered frame now: the saturation of the dark
pixels, 0.070 at the left against 0.220 at the right.
