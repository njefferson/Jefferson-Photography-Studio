# 050 · The mask system is short of standard convention

## Context

Asked for 2026-09-22, after the sky-selection report: a drawn box or circle that
ISOLATES part of the photograph, which a subsequent mask is then constrained by
— stated as the thing that would make colour masks better — together with the
observation that a good deal of standard mask convention may be missing here.

So this record is a survey rather than one feature, and it is written that way
on purpose: naming one gap at a time is how a system ends up with six of them.

**WHAT THIS APP HAS**, read off the panel and the shader rather than remembered.
Five mask types — radial (0), linear gradient (1), brush (2), colour (3), sky
(4). Per mask: invert, feather, and for the type that needs it a brush size with
paint/erase/clear, a colour pick with a swatch and one range, a sky reach with a
colour toggle and hand correction. Five adjustments per mask — brightness,
contrast, saturation, hue, warmth — plus four whole-photo tools that can be
aimed at a mask (clarity, dehaze, lens, shadow). Masks display as an outline or
a matte. They join as **On its own**, **Subtract from it**, **Only where both**.

**WHAT IS ACTUALLY MISSING, and what only LOOKS missing.** The distinction
matters: a gap that is already reachable by composing two controls is not a gap,
and building a control for it duplicates what ships.

**Reachable today, and therefore not a gap:** constraining a colour selection to
one part of the frame. A Radial mask with a Colour mask joined **Only where
both** is that, and it works. What is wrong with it is not the capability.

**Genuinely absent:**

1. **A rectangle.** The only drawn shapes are an ellipse and a linear gradient.
   A box is the shape asked for, it is in every comparable tool, and nothing in
   this app approximates it — an ellipse inscribed in the area you want leaves
   the corners out, and one that covers the corners takes in what is beside
   them. Put right on 10 November 2026: of the four programs whose own pages
   were read first-hand, RawTherapee offers a rectangle, as the area of a spot,
   and Adobe, Capture One and darktable name none as a mask, Adobe naming a
   rectangle only to point its object selection at an object. So the clause
   that a box is in every comparable tool is not borne out; the Photoshop pages
   this record also cites were not read.
2. **A luminance-range selection.** Absent entirely. Lightroom carries Luminance
   Range beside Color Range; darktable's parametric masks work on lightness,
   chroma and hue channels independently. This app's only parametric selection
   is one hue/saturation/value target with a single `colorRange` — a colour
   picker, not a set of channel ranges — so "the bright parts of this" cannot be
   selected at all.
3. **A proximity limit on a colour selection.** The colour mask matches its
   target across the whole frame with no spatial locality whatsoever. This is
   the exact problem Photoshop added *Localized Color Clusters* for in CS4:
   with it off, a colour match is sought throughout the image, and with it on,
   the selection is limited to pixels near the ones sampled.
4. **The union join.** Already record 048, listed here so the survey is whole.
5. **Several shapes inside ONE mask.** The convention is a mask that holds a
   list of shapes and one adjustment. Here every shape is its own mask and the
   relationship is expressed by `op` on the one below. Close to equivalent, and
   worth measuring against a real edit before deciding it is a gap.
6. **Duplicating a mask, and naming one.** The panel has delete and a count; a
   mask cannot be copied to make a second, similar one, and cannot be given a
   name that says what it is for.

**AND THE DISCOVERABILITY DEFECT SITS UNDER ALL OF IT.** The join control that
makes the reachable thing reachable appears only on the SECOND mask and later —
record 040 measured that, and it is why a capability that shipped in 2.53 was
asked for again from the device.

## Looked up

**Photoshop.** *Color Range* selects by sampled colour with a Fuzziness range.
**Localized Color Clusters**, added in CS4, limits the search to pixels near the
sampled ones, for the case where several objects in a frame share a colour and
only one is wanted. That is the spatial constraint being asked for, expressed as
proximity rather than as a drawn shape.

**darktable.** Drawn and parametric masks combine into one mask for a module,
governed by each component's polarity and a *combine masks* setting: exclusive
multiplies the components, so a pixel survives only if every component holds it;
inclusive inverts, multiplies and inverts again, which is an OR. **A drawn shape
restricting where a parametric mask acts is the documented standard workflow**,
not an advanced trick — and it is exactly the shape of what was asked for.

**Lightroom.** A mask is a list of components, each Added or Subtracted, with
Color Range, Luminance Range, Depth Range, Brush, Linear and Radial among them,
and Intersect available on the mask. Refining an automatic selection by adding a
range component to it is the documented route.

**What the three agree on** is the part worth taking: a mask is a COMPOSITION of
components, the set operators between them are first-class, and a drawn shape
scoping a parametric one is ordinary rather than clever. This app has the
components and two of the three operators, and no rectangle to scope with.

Sources: Adobe, *Select a color range in Photoshop*
(helpx.adobe.com/photoshop/desktop/make-selections/freehand-selections/select-a-color-range-in-photoshop.html);
Photoshop Essentials, *The Color Range Command*
(photoshopessentials.com/basics/selections/color-range/); darktable user manual,
*combining drawn & parametric masks* and *parametric masks*
(docs.darktable.org/usermanual/4.6/en/darkroom/masking-and-blending/masks/);
Adobe, *Apply Masking for local adjustments*
(helpx.adobe.com/lightroom-cc/using/masking.html).

**Added 9 November 2026, after reading further pages whole.** Each was fetched to
disk and read to its end; what each says a selection is keyed on, and how
selections are joined, is below. Adobe's own help pages and Capture One's support
pages could not be read (the first answered Access Denied, the second a challenge
page), so the Lightroom lines rest on two second-hand accounts and are marked so.

- darktable parametric masks (docs.darktable.org/usermanual/4.6/en/darkroom/masking-and-blending/masks/parametric/):
  keyed on the pixel's value in each channel of the module's colour space, grey,
  red, green, blue, hue, saturation, lightness, chroma and the Lab components,
  each a trapezoid with two ramps and a polarity; joined by multiplying the
  channels' factors.
- darktable drawn masks (.../masks/drawn/): keyed on place, with circle, ellipse,
  path, brush and gradient; joined in the mask manager by union, intersection,
  difference and exclusion.
- darktable combining drawn and parametric masks (.../masks/drawn-and-parametric/):
  joined by multiplying the components, so any one excludes, or by invert,
  multiply and invert, so any one includes, each component with a polarity.
- darktable refining a mask (.../masks/refinement-controls/): keyed on detail, a
  details threshold available from raw data, and on the image's own edges, a
  feathering guide; refinements of one finished mask, not joins.
- darktable colour zones (.../module-reference/processing-modules/color-zones/):
  keyed on one chosen axis of hue, lightness or chroma.
- Fstoppers on Lightroom's masking, 24 June 2026 and 21 December 2021, and on
  luminosity masks, 14 August 2021 (second-hand accounts): keyed on selections
  the program makes (subject, sky, background, people, and for landscapes
  vegetation, buildings and architecture), on a colour range, on a luminance
  range, and on drawn gradients and brushes; a mask is a list of components that
  each add, subtract or intersect.
- Infrared pages, Fstoppers of 27 May 2024, Kolari Vision of 10 July 2018 and
  Kept Light of 13 April 2018: keyed on a colour range for sky and foliage, on
  gradients, and on the light in one colour channel; joined by multiplying a
  selection by itself to narrow it level after level. The Kept Light page
  describes no selective mask.
- Wikipedia on the normalized difference water and vegetation indices, NASA
  Earth Observatory on measuring vegetation, and the USGS page on the Landsat
  vegetation index: keyed on a normalised difference of two bands, green against
  near infrared for open water and near infrared against red for vegetation,
  with ranges given for satellite bands.

What this adds to the survey, from these pages and ranking nothing: selection by
a lightness range alone, by a chroma range alone, by a single colour channel, by
several channel ranges held at once, by a normalised difference of two channels,
by detail and by the image's own edges all exist in the field and in none of the
app's five mask types; and the joins the field offers beyond the app's three are
multiply so any component can exclude, a polarity on each component, exclusion
between two shapes, and invert of a whole selection. The union is the row the
survey already holds. A browser segmentation model was read as an address only;
its classes are people and body parts.

**Added 9 November 2026, after reading further by the routes that answered.** Each
item says what a source says a selection is keyed on and how selections are
joined, and marks how it was read. Read whole from disk means the page's own text
was on disk and was read to its end. Told by the fetch tool means the web fetch
tool answered through a model of its own and gave a summary instead of the page,
so the item is that tool's account and not the page.

- Adobe's own account of its masking tools, the Camera Raw team's article of 28
  September 2021 (told by the fetch tool, a summary): keyed on a luminance range
  with a falloff control, on range masks generally, and on selections the program
  makes, the subject and the sky being the two it names; vector masks (brush,
  gradient, range) and bitmap-backed program-made masks work together; joined in
  mask groups that combine, subtract and invert. Intersect is not named in the
  return, a colour range is not named as such and a depth range is not named; the
  summary may leave out kinds the article names.
- darktable's colour equalizer, the documentation source (told by the fetch tool,
  a summary): keyed on the pixel's current hue, with separate hue, saturation and
  brightness curves over fixed equally spaced nodes, on linear RGB, and a guided
  filter that smooths the changes by the hue and overall saturation of
  neighbouring pixels; it is an adjustment and joins nothing.
- The segmenter's documentation of Google AI Edge (read whole from disk): keyed on
  predefined classes, giving a category mask or a confidence mask per class. Its
  models are for people and their features, background, hair, skin, face and
  clothes, with one general-purpose model whose classes the page lists only in part,
  background, person, cat, dog and potted plant. No class the page lists is sky,
  water, vegetation, a tree, a building or a boat. It states no size and runs in a
  browser. It is an address for a later plan and no method tried.
- An infrared processing article by Chris Wright (read whole from disk): keyed on
  nothing selective; it separates sky from foliage by a global white balance picked
  on a chosen area, mentions a mask once without saying how it is made, and
  describes no join.

What these add to the survey, from these pages and ranking nothing: Adobe's own
article adds that its masks of the two kinds, vector and program-made, are held in
one mask group and combined, subtracted and inverted together, which the earlier
second-hand accounts already described; the colour equalizer adds a selection-free
adjustment keyed on hue with a neighbour-aware filter; and the segmenter's page
adds that the browser models it documents label people and their features, not
the scene's sky, water, trees or buildings. None of this changes a row.

What stays unread, in words: Adobe's help pages and Capture One's support pages,
which each host refused to every route tried, and the archived copies of both, which
no route could ask; RawPedia's local adjustments page and Adobe's release notes,
whose hosts the session's network does not reach; and one infrared guide, which
answered a challenge page. The science file's passage of the same date names every
route and what it answered.

**Added 9 November 2026, after pages brought into the session by hand were read
first-hand.** Each item says what a selection is keyed on, how selections are joined
and how an area of the picture is sampled, and marks how the page was read: read
whole from a returned copy, or read in part with what the print left out.

- Adobe, Apply Masking for local adjustments, the Lightroom help page (read whole
  from a returned copy): keyed on a colour sampled from the picture, a brightness
  range and a distance range for photographs that carry depth information, on
  what an analysis takes to be the subject, the sky or the background, on up to eight
  landscape classes the person ticks (sky, mountains, architecture, vegetation,
  water, snow, natural ground and artificial ground) and on drawn shapes. Joined by
  parent and child masks that add and subtract, by intersect from a mask's menu, by
  inverting a selection or a whole mask and by an inverse copy. Sampled by a click or
  a dragged area, up to five samples for a colour, a small area recommended to narrow a
  brightness or distance range; the mask is shown as a red overlay; no confirm step,
  no fixed sample size and nothing for a touch screen.
- Adobe, the Camera Raw team's article of 28 September 2021 (read in part: the print
  leaves out a video and the text after it, cuts the text near inverting and cuts the
  in-app help at its end): a brightness range now with a falloff, a colour range in
  words and picture, a distance range only as a greyed label, and program-made subject
  and sky masks as bitmaps; joined in groups that add, subtract and invert any
  tool; intersect not named in the text read; a click anywhere samples brightness;
  every tool said to work on phones and tablets. This replaces the earlier fetch
  tool's account of the same article, which named a brightness range and no colour
  range.
- Capture One, Combine Masks (read whole from a returned copy): add, subtract and
  intersect on a single layer, a combined group counting as one layer, gradients and
  the luma range staying live; the page does not say what its masks are keyed on,
  names no landscape class and no colour mask; nothing is sampled and nothing is said
  for touch.
- Capture One, Luma Range Overview (read whole from a returned copy): keyed on
  brightness, set by two range points and two falloff points on a graph, acting on
  top of a mask that already exists, live, and addable, intersectable or subtractable
  since release 16.7.0; no sample is taken from the picture.
- darktable, the colour equalizer (read whole from its source text): an adjustment
  keyed on each pixel's hue that joins nothing; a picker takes a point or an area and
  shows its hue on the curve; over the picture the pointer shows the colour under it
  and the wheel changes the matching band. This replaces the earlier fetch tool's
  account of the page.
- RawPedia, Local Adjustments, the manual of RawTherapee (read whole from disk,
  fetched from the publisher's own site on 10 November 2026; the page shows April
  1, 2026 under its heading and Last modified: October 25, 2026 at its foot): keyed
  on colour difference, the change in perceived colour between a pixel and a
  reference, the reference being the average hue, chroma and lightness inside the
  circle at a spot's centre, with a scope slider setting how far the difference may
  reach, and on masks a spot carries, keyed by curves on chroma, lightness and hue,
  on structure and on blur. A spot is an ellipse or a rectangle that cannot be
  rotated. Joined by order and not by add, subtract or intersect: each Normal spot
  acts on the work before it, an Excluding spot resets its area to the state before
  the earlier spots, and a Merge file blend sets a spot against the original or the
  previous spot. Sampled by the centre circle, which the mouse or sliders place and
  size; a small circle picks out one colour and a large one averages away stray
  data; lockable colour pickers read points, and a Preview paints the selection over
  the picture; no default size or bounds, no confirm step, and nothing for a touch
  screen, a keyboard or a magnified view. This page is read, and the paragraph
  below that lists RawPedia's page as unread was written the day before.

What the pages and the device's figures say of each row of the survey, from the joined
account in the science file, and how firmly:

- A rectangle. The pages read first-hand do not bear out that a box is in every
  comparable tool: Adobe names a rectangle only to point its object selection, and
  darktable and Capture One name none. Firm for the pages read. The figures bear on it
  only so far as a band across the frame is a range of height, which did not carry from
  one framing to the next. RawPedia, read whole on 10 November, offers a rectangle as
  one of a spot's two shapes, the other an ellipse, so one of the four programs does.
- A luminance-range selection. All three programs read first-hand carry one, two of
  them with a falloff in words. On the device's figures lightness tells water from
  the broadleaf trees, the snags, the shore and the sky, and does not tell the
  conifers from the built things. Firm for what the programs offer; one scene for the
  figures. RawPedia carries a mask keyed on lightness by a curve, and a recovery with a
  dark and a light threshold and a decay, so the fourth program keys on lightness too.
- A proximity limit on a colour selection. The Photoshop pages behind this row were
  not read by this work. Adobe's brush confines a colour match to where the stroke
  goes; the figures say colour, limited or not, tells the sky from the conifers and
  little else among the places measured, and that a shape joined with a texture range
  by Only where both carried from one photograph to another where the shape alone did
  not. Moderately firm: one scene, one device. RawPedia bounds its colour test by place:
  the reference is taken inside the circle at a spot's centre, the test acts inside the
  spot's shape, and the effect falls off from the centre, so the selection moves when the
  circle moves.
- The union join. All three programs read first-hand offer it. The figures do not
  measure it. RawPedia names no add, subtract or intersect; it joins by order, by an
  Excluding spot and by a Merge file blend, so it holds for three of the four.
- Several shapes inside ONE mask. All three programs read first-hand hold several
  components under one mask or layer with one adjustment. Neither the pages nor the
  figures settle whether the app's mask-by-mask join is equivalent; the row's own word
  that it needs measuring against a real edit stands. RawPedia holds one shape to a
  spot and one mask to a tool, and a second mask is had by duplicating the spot.
- Duplicating a mask, and naming one. Adobe names masks and makes an inverse copy,
  Capture One renames sub-masks and saves combined masks in a Style, and darktable
  reuses a shape across modules. The figures do not bear on it. RawPedia adds,
  deletes, duplicates, renames, shows and hides spots.

The separation measure's first figures from the device and the joined account of the
readings and the figures stand in the science file. What still stays unread, in words:
RawPedia's local adjustments page, whose file was found in a Drive folder and whose
read the Drive guard refused; Adobe's help pages for Lightroom Classic and Camera Raw,
its learn page on landscapes and its release notes; one infrared guide; and the
Photoshop pages this record cites.

## Weighed against

**048 — the union join.** One item in this survey, already recorded and ranked,
and left where it is rather than folded in here. A survey that swallows its
members stops being a survey and becomes a second plan for work already planned.

**049 — show the border and let it be moved.** Not a mask convention; it is a
correction to a generation stage. Separate on purpose.

**006 — mask by subject / background.** Already on the schedule since
2026-07-16, and it is the auto-selection line of the same convention. Not
re-opened here.

**040 — the mask panel does not say what it can do.** Its finding applies to
everything below: adding capability to a panel that does not report what it
already has buys less than it looks.

Previous work by `NOTES.md` heading: "## Masks combine (040)" and
"## The sky selection, two stages".

## Depends

- touches 048 — 048 is one row of this survey. Landing it removes a row; landing
  the rectangle does not change what 048 does.
- touches 040 — every item here adds to a panel 040 measured as not reporting
  what it holds, so the order between them changes what each is worth.
- touches 006 — the auto-selection line of the same convention; a shared
  components-and-operators shape serves both.
- needs 042 — 042 rewrites what a mask's controls reach. Adding mask types and
  operators before it settles means doing the wiring twice.
- distinct-from 049 — 049 corrects where a generated selection BEGINS; this is
  about combining selections once they exist. The two were conflated once
  already in this repository and the cost is recorded in 049.

## Options

**Take the survey as a survey: each row is its own piece of work, ranked on its
own, and nothing here becomes one control that does several of them.** Chosen.

This is the shape the record exists to defend. A rectangle is a shape type and
nothing else. A luminance range is a selection type and nothing else. A
proximity limit is one parameter on the colour mask. Each can be held to whether
it does what it says; none of them is judged on whether it delivers an outcome,
because outcomes come from stacking them — which is what the standard
convention actually is, and what the three tools surveyed above all implement.

**The first two rows to build, and why those:** the rectangle, because it is the
shape asked for and there is no way to approximate it; and the proximity limit
on the colour mask, because it is one parameter and it is what makes colour
selection usable on a frame where the same colour appears twice.

**What is deliberately NOT decided here:** the order of the remaining rows
against each other, and whether row 5 (several shapes in one mask) is a gap at
all. That one needs measuring against a real edit rather than against a manual.

## Rejected

**One "advanced mask" control that offers several of these.** The failure this
record's own Options section is written against, and the one hub LESSONS 353
names: a control justified by a scenario rather than by its own job ends up
doing several things approximately.

**Building the rectangle as a special case of the radial.** An ellipse with a
corner radius is a third thing that is neither, and its parameters would have to
mean different things depending on a mode. A rectangle is its own type.

**A control for "constrain this mask to that region".** It is already Radial
plus **Only where both**, and adding a second route to it would give the app two
ways to do one thing that can disagree. What that composition lacks is a
rectangle and discoverability, and those are the things to fix.

**Treating the discoverability defect as a documentation job.** 040 already
tried the sentence. The panel has one now and the capability was still not
found, which is evidence about where the control lives rather than about how it
is described.

**Doing the survey and then not ranking it.** A list of everything missing, with
nothing placed, is the shape that produces a second survey a month later.

## Rank

**Row by row rather than as a block, and the block itself sits below 042.**

Nothing here can be built before 042 settles the wiring it would all pass
through, which is the dependency test rather than a preference. Within the
survey, the rectangle and the colour-proximity limit rank with 048 — they are
the rows with a named user need behind them and the smallest surface each. The
luminance range, duplicate and naming rank below, as capability rather than
repair. Row 5 is not ranked until it is measured.
