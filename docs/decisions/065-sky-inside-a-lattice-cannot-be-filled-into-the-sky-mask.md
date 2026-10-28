# 065 · Sky inside a lattice cannot be filled into the Sky mask

## Context

Found on the target device, 2026-09-25, on v2.63 on staging, with NIR_3461 open
in Aerochrome: the sky seen through a pylon's lattice sits outside the Sky mask,
and the idea put forward is a fill, a stroke inside the struts that takes the
sky there into the mask.

**The Sky mask leaves the whole near pylon out, not only its steel.** Its matte
on NIR_3461 is one dark wedge the shape of the tower's outline: the sky between
the struts is in no part of it. The grow reaches sky only along sky-coloured
paths, and the struts cut every path in, so the tower's inside is left out by
the rule that keeps everything else right.

**What v2.63 already offers is the union** (048): a Colour mask tapped on open
sky and added to the Sky mask with "Add to it". Rendered on NIR_3461 and looked
at (below), one Colour mask on blue sky takes the blue inside the lattice and
leaves the band of cloud inside it out; a second on cloud takes most of the
rest, leaving specks through the middle of the tower and taking the pale lit
edges of the steel along with the sky.

**What a fill would reach, today.** Anything added to the Sky mask moves that
mask's own values, which in the held build are Exposure, Warmth, Hue shift,
Saturation, Contrast, the Foliage and Sky bands, the colour mixer and the grade
wheels. It does not move Aerochrome's own sky stages, which read the look's
selection and not the reader's; that is 052.

## Looked up

- **Capture One's Magic Brush** is this idea, shipped: a line or a doodle on
  the area, and it fills the similar pixels around it, judged on colour and
  luminance together, with a Tolerance for how wide a range it takes. It adds
  to the layer's mask with each stroke. A switch, Sample Entire Photo, chooses
  between the connected area only and every matching area in the photo, and
  Refine Edge follows the edges afterwards. Source: Capture One support,
  *Magic Brush* (support.captureone.com/hc/en-us/articles/4403193308049-Magic-Brush),
  read 2026-09-25.
- **Lightroom fills the gaps an automatic sky leaves** with a Color Range
  mask, sampled from a dragged box, added to the sky mask. It has no fill that
  starts from a stroke. Source: Fstoppers, *Sky masking in Lightroom: fix halos
  and gaps* (fstoppers.com/lightroom/sky-masking-lightroom-fix-halos-and-gaps-721200),
  read 2026-09-25.
- **Photoshop's Magic Wand** carries the same choice as a Contiguous checkbox,
  already recorded in 028's Looked up.

So the field has both shapes: Lightroom's is the union v2.63 carries, and
Capture One's is a fill that starts where the reader puts a finger and stops
where the colour does.

## Weighed against

- **028, "Sky seen through a canopy takes no sky adjustment"**: the same
  defect, sky the grow cannot walk to, answered automatically by its chosen
  "Reach past branches" switch, which admits disconnected sky-coloured regions
  below a size cap. The lattice's inside is the case its cap decides: it is not
  a scatter of specks, and whether the cap takes it has not been measured. The
  band of cloud inside the tower is not the sky's learned colour, so the switch
  cannot take that part at any cap.
- **048, "Colour cannot finish a selection an occluder has split"**: its union
  is the route today, and its Rejected section bounds this record twice.
  *Letting the sky's colour growth take disconnected regions* stays rejected:
  the fill never changes the automatic grow, it starts only from a stroke the
  reader makes, and it is contiguous from that stroke. *Hand-brushing it in*
  stays rejected too, and the fill is not it: the stroke is a seed, and the
  colour decides where the fill stops, so a gap a few pixels wide between two
  struts is taken without a steadier hand than it takes to draw a line through
  it.
- **031, "A generated selection can be corrected by hand"**: the Sky mask's
  Add by hand and Take out by hand are its strokes, stored with the mask and
  replayed over whatever the detection returns, so a change to Reach keeps
  them. A fill stroke is a third kind of the same thing.
- **023, "The Sky mask reads the sky's colour as well as its place"**: the fill
  is the same connectivity grow `growSkyByColour` runs, seeded by the stroke
  instead of by the detection.
- **032, "A mask keys the photograph, not the grade"**: a fill judges colour
  and brightness on the same picture a Colour mask keys on, so whatever 032
  decides that picture is, the fill follows.
- **052, "The look's sky adjustments read a selection the reader cannot see"**:
  under a look, a fill reaches the mask's own values and not the look's sky
  stages until the look reads the reader's selection.
- **050, "The mask system is short of standard convention"**, and **049,
  "Show the border and let it be moved"**: a stroke-seeded fill is a standard
  mask tool the convention survey did not list; what a fill took is judged at
  the border 049 shows.

## Depends

- touches 028 — the same defect answered automatically; each changes what the other has left to do on a given frame.
- touches 048 — its union is the route today, and its Rejected section bounds this one on connectivity and on hand-brushing.
- touches 031 — a fill is a third kind of hand-correction stroke, stored and replayed the same way.
- touches 023 — the fill is the Sky mask's own connectivity grow, seeded by the stroke.
- touches 032 — the fill keys on the same picture a Colour mask keys on.
- touches 052 — under a look, what a fill adds reaches the look's sky stages only once the look reads the reader's selection.
- touches 050 — a stroke-seeded fill is a convention the survey did not list.
- touches 049 — what a fill took is judged at the border 049 shows.

## Options

1. **Fill by hand on the Sky mask, beside Add by hand and Take out by hand.**
   Chosen.
   - A stroke inside a gap grows from every point it crosses into the
     connected pixels of similar colour and brightness, and adds them to the
     mask; a stroke through several gaps fills each of them.
   - A Tolerance control beside it sets how wide a range the fill takes, as
     Capture One's does.
   - The stroke is stored with its tolerance among the mask's hand
     corrections and replayed over the detection like the other two, so Reach
     and Feather keep it; one stroke is one undo step.
   - Connected only. Capture One's Sample Entire Photo is the Colour mask added
     to the Sky mask, which v2.63 already carries, so it is not built twice.
   - The Sky mask first, because it is the only mask with hand corrections
     today; the other mask types take it when they take hand corrections.
2. A tap instead of a stroke (the Magic Wand's shape): one point, one fill.
3. A new mask type, Fill, joined to the Sky mask with "Add to it".
4. Leave it with the union, as v2.63 has it.
5. 028's switch as the whole answer.

## Rejected

- **2, a tap.** A fingertip on a gap a few pixels wide between two struts does not say which gap, and a lattice is dozens of them; a stroke through several seeds each, which is why Capture One takes a stroke.
- **3, a mask type of its own.** A fill belongs to the selection it completes, as Capture One's adds to the layer's own mask; a separate mask joined by union adds a row to the mask list for every correction and a second place to look for what the Sky mask covers.
- **4, the union alone.** Looked at on NIR_3461: two Colour masks leave specks through the middle of the tower and take the lit steel edges with the sky, because a colour pick takes every matching pixel in the frame and nothing tells it where the tower is. It stays the route for every matching area, which is what it is good at.
- **5, 028's switch alone.** It is automatic, it takes only the sky's learned colour below a cap, and the cloud inside the tower is neither; the reader has no way to say "here" when it declines.

## Rank

**Re-ranked 2026-09-26: seventh, below 069, 071, 070, 052, 013 and 068, above 066.** 071, the update path, shares no ground with this.
The Aerochrome work leads the queue. It sits below the white guard (069) and
the rotation fix (070) because both come before 052, and under a look what a
fill adds reaches the sky stages only through 052, where 069 decides what those
stages do to the pale pixels a fill takes in. It sits below 052 because until
the look reads the reader's Sky mask, a fill changes that mask and not the
look's sky. It sits below 068 because 068's comparison says whether a Sky mask
can be drawn by a second finder, and so whether this fill's strokes are
replayed onto one finder or two; today's finder stays the default, so the fill
keeps all of its work either way. It sits above 066 because a fill changes
which sky a reader's mask holds. It now sits above 048, whose union already
ships in the build on staging, so the route it refines exists without 048's
record closing first, and above 028, because the fill covers 028's case by hand
where the cap declines.

## Outcome

**The default Tolerance is 0.35, set 26 October 2026.** Fill by hand shipped to staging with its slider starting at 0.5, a number the build's own comment said was not tuned on any frame. The previous plan rendered NIR_3461's pylon, whose Sky matte leaves the tower's whole upper section and base out, with one stroke through the tower's upper gaps at three slider positions, and the default rests on those three pictures, each opened again here.

- **At 0.5** the stroke filled much of the sky between the girders and also spilled: yellow patches stand in the dark grass at the bottom left and bottom right corners and along the right edge. The matte went from 68.86 percent of the canvas to 77.73. A second stroke read 76.48, and two single taps in the gaps spilled the same way (75.44 and 77.89).
- **At 0.35** most of the upper tower's gaps are filled and the grass carries no yellow at all; the horizon reads clean. The first stroke read 70.55 percent and the second 72.37, the second also taking a round patch of sky in the tower's lower block.
- **At 0.2** nothing spills either, and only a small patch inside the upper tower is filled (69.41 and 70.53 percent).

So 0.35 is the position where the fill reaches the gaps it exists for without leaving the tower. It is one frame: that it suits a lattice on another frame is not measured, and neither is the luma-to-colour ratio that sits beside it. The slider still runs the whole range, so a reader who wants more or less moves it. Nothing else changed: a stroke stores the tolerance it was made with, so no saved edit reads the default, and the Tolerance note under the slider is as it was.

The other way to stop the spill is to ignore a seed unlike the stroke's majority, so that a stroke landing on a strut does not seed the strut. It is a separate piece of work, open, and is not what this default does.

## Looked at

- NIR_3461.NEF, 2026-10-26: the previous plan's renders of the Sky matte after one Fill by hand stroke through the tower's upper section, at the slider positions 0.5, 0.35 and 0.2, opened again here, whole frame. At 0.5 the tower's gaps are filled and yellow patches stand in the grass at the bottom corners and the right edge; at 0.35 the upper tower is mostly yellow between its girders, its lower block stays dark and the grass carries no yellow; at 0.2 only a small patch inside the upper tower is yellow, the rest of the tower stays dark and the grass carries none.
- NIR_3461, 2026-09-25, in Aerochrome with the lens profile at 1: the photo, the Sky mask's matte alone, the matte with a Colour mask on blue sky added, and with a second on cloud added; full frame and at full size on the near pylon at the left edge of the frame.
