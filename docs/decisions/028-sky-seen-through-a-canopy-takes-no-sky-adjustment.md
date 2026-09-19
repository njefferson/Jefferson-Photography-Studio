# 028 · Sky seen through a canopy takes no sky adjustment

## Context

023 grows the Sky selection outward from the heuristic's seed through pixels
that match the sky's colour AND are JOINED to it. Connectivity is not
incidental — it is the whole discriminator. Colour alone readmits half of
NIR_1651, and the measurement that justified the design is that the sky the
seed misses lies AGAINST the seed while the colour-close pixels that must stay
out are speckle scattered through foliage.

**The same property forbids one thing entirely: sky seen through a canopy.**
A patch of sky between leaves is joined to the open sky by no sky-coloured
path — the path runs through branches — so a connectivity-constrained selection
cannot enter it at any tolerance, by construction rather than by tuning.

Measured 2026-09-19 by `tools/mask-truth-walk.mjs`, which now sorts every keyed
sky pixel into reachable and disconnected before it bounds anything:

- **NIR_0063** (oaks against sky): 6.9% of keyed sky — 12,488 px — is
  disconnected, at 0.3% mean coverage.
- **NIR_1651** (a conifer against sky and cloud): 1.4%, 5,441 px, 2.2%.
- **NIR_1644** (a dense conifer forest): 0.4%, 2,057 px, 2.6%.

That split is what took the acceptance walk from three failures to one. Before
it, NIR_0063 read 52% edge coverage at every tolerance from 2.5 to 5 and could
not be moved, because the denominator mixed sky the grow could have had with
sky it can never have. Over reachable sky the same build reads 98%.

**So this is not 023's defect and never was.** It is a second mechanism, and it
needs its own decision because the obvious way to get it — drop the
connectivity constraint — is the route 023 rejected on measurement.

## Looked up

The field's answer for this exact subject is a switch, and it is old. Adobe's
Magic Wand carries a **Contiguous** checkbox: leave it on to select only
adjacent areas of a similar colour, turn it off to select non-adjacent ones,
and the standard advice for sky showing between the leaves and branches of a
tree is specifically to turn it off — the Quick Selection tool is called out as
the wrong instrument for the same case, because it will not pick up all the
little areas of sky between the branches.

Two things follow that were not obvious from inside this app.

**The trade is known and nobody solved it; they exposed it.** Non-contiguous
means any pixel anywhere within the tolerance, which is exactly what readmits
distant objects that share the sky's colour. Photoshop does not try to
distinguish the sky behind the leaves from the pond reflecting it — it hands
the operator a checkbox and lets the frame decide. That is a design answer, not
an evasion, and it is the one this app has not got.

**The bound on the damage is the tolerance, not the geometry.** Nothing in the
Magic Wand restricts a non-contiguous selection by distance or by region size;
tolerance alone carries it, with Select and Mask afterwards for the edges.

Sources: Adobe Photoshop Help, *Select an object with the Magic Wand tool*
(helpx.adobe.com/photoshop/using/tool-techniques/magic-wand-tool.html); Tim
Grey, *Quick Selection versus Magic Wand*, 2021-05-05
(asktimgrey.com/2021/05/05/quick-selection-versus-magic-wand/).

## Weighed against

**023, "The Sky mask reads the sky's colour as well as its place"** — the
mechanism this sits on. Its Rejected option 4 is the live boundary: colour
only, with no place gate, took the apron, the cars and every reflection along
with the sky. Anything here that amounts to dropping connectivity outright is
that option under another name.

**The pinhole fill already in `growSkyByColour`** is the narrow case of this
same idea, and it is the precedent worth copying rather than inventing past. It
floods unselected pixels inward from the frame's border and fills anything the
border cannot reach, below `PINHOLE_MAX_PX` (24). It is safe precisely because
it can only ever add interior and can never move the outer contour. What is
left here is the same shape at a size the cap refuses — sky through a canopy is
enclosed by foliage, not by selection, so the border reaches it and the fill
declines it.

**026, masks combining by set operators**, shipped the general intersect and
subtract. A reader who wants a hand-picked colour intersected with a place can
now build it themselves. This item is about the automatic Sky mask, which is
what a reader gets without doing that.

## Depends

- touches 023 — same selection and same function. A change to the grow's
  tolerance or brake moves which pixels are left disconnected, so the number
  this item is sized by is only true for a given build of that one.
- touches 013 — the look's Aerochrome population reads the sky selection, so
  admitting canopy sky changes what it lands on. Measured small enough not to
  invalidate tuning: see Rank.
- touches 016 — the same, for the foliage population, and with the sharper
  risk, since the pixels this would admit are interleaved with foliage.
- distinct-from 006 — mask by subject is a different seed and a different
  question. This is the sky the existing seed already knows about and cannot
  walk to.
- distinct-from 026 — masks combining by set operators is the MANUAL route and
  it shipped; a reader can intersect a hand-picked colour with a place
  themselves. This is the automatic Sky mask, which is what a reader gets
  without building one.

## Options

1. **A "Reach past branches" switch on the Sky mask, off by default, that
   admits disconnected regions matching the sky's colour below a size cap.**
   The field's shape — Photoshop's Contiguous checkbox — with the app's own
   pinhole fill generalised: after the grow settles, take every connected
   component of sky-coloured pixels the flood did not reach, and admit it if it
   is smaller than a cap. Off by default keeps the apron out of every frame
   that does not need it; a cap keeps a whole distant hillside out of the ones
   that do. The reader gets a control that announces what it does and offers an
   obvious exit, which is what the field settled on.
2. The same, always on, with the cap alone doing the work.
3. Admit a disconnected component if it lies within N px of selected sky —
   proximity instead of a size cap.
4. Leave it. The Sky mask is a connectivity-constrained selection and says so;
   a reader who wants the canopy sky paints it or uses the Colour mask.

## Rejected

- **2 — always on.** The cap cannot tell a canopy gap from a distant patch of
  the same colour; it only knows how big each is. On NIR_0063 the disconnected
  set is 12,488 px in scattered specks, and a cap generous enough to take them
  is generous enough to take a car roof. 023's option 4 was rejected for taking
  the apron, the cars and every reflection, and an always-on version of this
  buys that back in the frames where the cap happens to fit. The switch is what
  makes the cap safe.
- **3 — proximity instead of size.** Sky through a canopy is by definition
  close to selected sky, and so is a wet road under a treeline. Distance does
  not separate the two populations here, and it has the worse failure: it
  admits the NEAREST wrong thing rather than the smallest, and the nearest
  wrong thing is the object the sky is behind.
- **4 — leave it.** It is defensible and it is what ships today. It is rejected
  because the defect is visible rather than theoretical: on an oak canopy 6.9%
  of the sky in frame takes no sky adjustment while the rest does, so the
  canopy reads as a different photograph from the sky around it the moment any
  sky control is moved.

## Looked at

Three frames, all rendered through the acceptance walk and opened — the split's
own missed maps, where magenta is sky nothing joins to the selection, red is
sky the mask could have reached and did not, yellow is coverage on what the
key calls not-sky.

- **NIR_0063** — the frame this item exists for. The magenta is unambiguous:
  sky scattered through the gaps in the big oak's canopy at upper-left, with
  the canopy running to the frame's top edge so no path joins it to the open
  blue at right. There is essentially no red on this frame; the grow takes
  everything it can walk to.
- **NIR_1651** — the magenta is small and correct, specks of sky between the
  conifer's needles. Opening it also corrected the spill reading: the 55%
  figure is a large bright CLOUD across the top of the frame, which the mask
  selects and the walk's key rejects, not canopy taken as sky.
- **NIR_1644** — 0.4% magenta, specks inside the crowns, and a yellow band
  hugging the treeline that is the pale hazy sky above the trees rather than
  the trees. The lowest disconnected share of the three, and the frame that
  shows why the cap in option 1 can be small.

## Rank

**After 016, and the measurement is the argument rather than a preference.**

023 outranks 013 and 016 because everything those tune reads the sky selection,
and 023 moved that selection enormously — on NIR_1651 from 9.8% of the frame to
56.5%. Tuning a look against a selection about to change that much wastes the
tuning. That is the dependency test, and this item has to face it too.

It comes out the other way. The disconnected share is 0.4%, 1.4% and 6.9% of
keyed sky on the three frames, at a mean coverage near zero — so admitting all
of it changes selection membership by a few per cent at most, in scattered
specks. A look's saturation or depth value is not invalidated by that; where it
lands changes, what it should be does not. So 013 and 016 can be tuned first
and will not have to be redone.

The `touches 016` edge is the one to watch rather than the `touches 013` one.
The pixels this would admit are interleaved with foliage, which is the exact
population 016 is about, so whichever of the two lands second inherits a
slightly different frame. That is a re-measurement, not a re-decision.
