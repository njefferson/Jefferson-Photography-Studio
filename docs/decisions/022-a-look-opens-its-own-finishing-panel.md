# 022 · A look opens its own finishing panel: the adjustments that complete it, in one place, in the method's order

## Context

Raised on 2026-09-18, after a day of operating the app on three frames: the
controls that finish Aerochrome are scattered — the lens colour correction on
Corrections, the Sky band, Sky smoothing, Sky depth and Sky saturation and the
Foliage band on Colour, Restore depth on IR, the Sky mask on Masks — and the
research names a finishing sequence that a one-press look cannot carry,
because the finishing is per scene (the published guides say so in the same
words: the preset is a start and the sliders move with the scene, the light
and the subject). So the proposal: when a look is applied, its own panel
opens with the specific adjustments needed to finish it, in the order the
method says, each with the one line of why. A look stays a profile on the
built app; the panel is where the reader finishes it.

## Looked up

The shape has direct precedent. Alien Skin Exposure: choose a preset, then
its Parameters tab opens that preset's own adjustment panel (film response,
colour, filter, grain, vignette). Lightroom: every profile carries an Amount
slider at the top of the panel, the finishing control the profile itself
declares. Fujifilm's film-simulation recipes are a named set of finishing
values per film. DxO FilmPack inside PhotoLab gives a film rendering its own
panel. And the method for this film, from Rob Shea's course outline
(IR-SCIENCE 4b-vi): white balance, the colour-swap profile, the tone curve,
then vibrance, saturation and the colour hot spot together, then colour
grading, then masks — a sequence AFTER the profile, which is what a
finishing panel would put in one place. Sources: rangefinderonline.com
(software roundup, Exposure's Parameters tab), imagen-ai.com (Lightroom
profile Amount), fujixweekly.com (recipes), the course outline as recorded.

## Weighed against

- **019 and 017** — the sky's saturation and depth and the foliage's amount
  are the controls such a panel would carry for Aerochrome; 019's amounts are
  the look's starting values and the panel is where they are finished per
  scene. This is the shape the sky work lands in.
- **021** — the lens correction belongs before everything; the panel's first
  step is that correction's strength, and it must act where 021 puts it.
- **018** — the Sky mask step needs the refined selection or the reader's
  mask draws its own soft edge (measured 2026-09-18 on three frames).
- **003, menus float over the photo** — where a per-look panel sits in the
  Creative release; until then it is a section like the others.
- **The on-photo lessons** already open the right tab for a step; the
  guiding machinery exists, the one-place panel does not.
- **The five places** an edit field lives in, and one control per field: a
  panel that hosts the look's controls hosts SECOND inputs bound to the same
  fields, kept in step by the same sync that already writes every slider.
- **The a11y walk's surfaces list** — a new surface joins it in the commit
  that creates it, or it ships unmeasured.
- **Batch** — a look in a batch has no panel, so the look's declared values
  must stand on their own; the panel finishes, it does not complete.
- **Conformance is not reachable** — a control that appears only after one
  button is a control nobody finds; the panel duplicates, it never moves.

## Options

1. **A per-look finishing panel, declared by the look.** Each built-in look
   declares its finishing steps (`finish` on the look: control ids in the
   method's order, one line of why each, from the research). Applying the
   look opens the panel — dismissible, and reopened from the look's own
   button — hosting a second input for each declared control bound to the
   same field, so the tabs keep theirs. Aerochrome's: lens colour correction
   strength; the sky's saturation and depth through the selection (and its
   warmth if that field is built); the foliage's amount; Restore depth; add a
   Sky mask for anything beyond. Pink IR and the others declare theirs or
   none.
2. A guided checklist that opens the right tab and focuses each control in
   turn, no second inputs.
3. Move the look-specific controls out of the tabs into the panel for good.

## Rejected

- **2** — it is the on-photo lessons again; the ask is the adjustments in one
  place, not directions to them.
- **3** — the sky and foliage controls serve every look, and a control that
  exists only behind one button is unreachable for everyone else.

## Rank

Second, directly under 019 and above 020: it is the shape 019's amounts get
finished in per scene, and it decides where the sky route lands before that
route is built.
