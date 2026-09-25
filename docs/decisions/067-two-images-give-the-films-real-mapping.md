# 067 · Two images give the film's real mapping

## Context

The film maps infrared to red, visible red to green and visible green to blue
(IR-SCIENCE 4b, 4b-viii). This camera's conversion blocks visible green before
it reaches the sensor, so one infrared frame carries one colour axis and the
film's green layer, which drives its blue output, is not in the file
(4b-ix). One image can approximate the film (066); it cannot reproduce it.

The only documented route to the real mapping for a camera like this one is a
second photograph: an ordinary colour frame of the same scene, from a phone or
an unconverted camera, aligned with the infrared frame, so the visible red and
green the film recorded come from a real record rather than a synthesis.

## Looked up

- **JW Wong** (flickr.com/photos/jw_wong, read): an infrared frame at 700 nm or
  above and a normal colour frame, from one full-spectrum camera with a filter
  change or from two cameras, aligned and mapped infrared to red, red to green,
  green to blue, visible blue unused. Described as a reproduction rather than a
  simulation. Channel subtraction in these methods has to be done in linear
  light; a linear mixer on gamma-encoded data "didn't work as well".
- **Kodak's own digital colour-infrared cameras** (DCS 420CIR and 460CIR,
  patent US6292212): a full-spectrum sensor behind a band-pass filter, with
  the infrared subtracted from the red and green channels before the same
  mapping.
- **Hidden Realms** (hiddenrealms.ch, read): the same with an 830 nm frame and a
  hot-mirror frame.
- **Joshua Bird** (joshuabird.com, read): trichrome on film, three filtered
  exposures combined, called the most authentic method; moving subjects give
  colour artefacts.
- **The remote-sensing colour-infrared composite** (IR-SCIENCE 4b-ix): the
  standard, from separately recorded bands.

## Weighed against

- **066, "Aerochrome is rendered from a model of the film"**: the one-image
  approximation. This record is the two-image reproduction; neither replaces
  the other, because most photographs will only ever have one frame.
- **043, the keep file**: a second photograph carried with the first would
  travel in the same container.
- **004, full-bleed crop**, and the geometry tools: the second frame has to be
  aligned, and any crop or straighten applies to both.

## Depends

- needs 066 — it renders through 066's film curves; that record synthesises the missing layers from one frame, this one records them with a second.
- touches 043 — a second photograph would be carried with the first in the keep file.
- touches 004 — the second frame is aligned and cropped with the first.

## Options

1. **A second, ordinary colour photograph of the same scene, imported beside
   the infrared frame.** Chosen, as a future option.
   - The app aligns the two frames.
   - It builds the film's three layer exposures from real records: infrared
     from this camera, and visible red and green from the colour frame.
   - It runs them through the same film curves 066 builds.
   - The seams it costs are named in the app: moving subjects, and a change of
     light between the two frames.
2. Three filtered exposures (trichrome).
3. Leave it to one image.

## Rejected

- **2, trichrome.** It needs filters for green and red on a camera that can
  take them. A 665–720 nm internal conversion cannot record visible green or
  most of the visible red, so two of the three exposures would have to come
  from another camera anyway, which is option 1 with an extra frame.
- **3, one image only.** It is what 066 does, and 066 cannot reach the film's
  real colour changes: red objects to yellow, yellow flowers to white, green
  water to blue. The sources name a second frame as the only way to get them
  with this conversion.

## Rank

**Sixth, the last of the Aerochrome work**, below 061, and deliberately a
future option. It needs 066's film curves to render through, and it is a new
capability, a second photograph per edit, where the items above it fix or
complete what already exists. Nothing above it waits on it.
