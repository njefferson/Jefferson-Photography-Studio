# 027 · The radial mask turns

## Context

Asked on 2026-09-19 alongside the mask-combining request: *the circle mask, for
instance, needs to be rotated.* It is the only selection in the app whose
orientation cannot be set.

The radial mask (`type: 0` in `MaskLayer`) is an **axis-aligned ellipse**. Its
geometry is `cx`, `cy`, `rx`, `ry` in image-uv, and both weight functions —
`maskWeight` in `src/pipeline.ts` and `maskWeight` in the shader in
`src/gl.ts` — compute `dx = (u - cx) / rx`, `dy = (v - cy) / ry` and take the
radius. There is no angle anywhere in that path, so an ellipse can be made wide
or tall and never tilted. Every diagonal subject in a frame — a shaft of light,
a branch, a road, a face turned away from square — needs one.

The linear gradient does not have this problem and it is worth saying why: it
is defined by two POINTS, `(cx, cy)` to `(lx, ly)`, so its direction is already
free. Only the ellipse is locked, because it is the only shape described by
axis-parallel radii rather than by points.

## Looked up

**Lightroom Classic** rotates a radial gradient from the shape's own EDGE.
Hovering the cursor on the circumference BETWEEN the four drag handles changes
the cursor to a rotate cursor; click and drag there turns the ellipse.
Shift-dragging that rotation snaps to 15° increments, and shift-dragging one of
the four handles instead preserves the ellipse's aspect ratio while resizing.
The centre pin moves the whole shape.

**darktable** rotates its ellipse mask with **Ctrl+click and drag on a node**,
or with **Shift+Ctrl+scroll**. Its four nodes on the ellipse line adjust
eccentricity when dragged plainly.

**So the convention is: rotation lives on the shape itself, not in a panel, and
it is distinguished from resizing by WHERE you grab or by a MODIFIER.** Both
programs also offer a coarse snap or a discrete step, because a photographer
wants "level with that roofline" more often than a specific number of degrees.

**AND THE CONVENTION CANNOT BE COPIED HERE, WHICH IS THE POINT OF LOOKING IT
UP.** Both affordances are unavailable on this app's target device. Lightroom's
is a CURSOR CHANGE ON HOVER — a finger never hovers, and there is no cursor to
change. darktable's needs Ctrl, Shift and a scroll wheel. What survives the
translation is the MODEL — an angle that belongs to the shape, adjusted on the
shape, with a coarse snap — not the gesture, and a session that copies the
gesture ships a control nobody on a tablet can find.

## Built already

- **The linear gradient proves the geometry pipeline takes a direction.** Its
  two-point form already orients a mask in both the CPU and the shader path,
  and it needed no extra uniform to do it.
- **Straighten is the app's existing angle control**, and it has been through
  the tenth-degree-nudge work already. Whatever it settled about presenting an
  angle to a finger — the nudge buttons, the readout, the fine step — is the
  precedent here rather than something to re-decide.
- **`tools/agreement-walk.mjs`** is what holds the CPU and GPU weight functions
  identical, and a new term in `maskWeight` is exactly the change it exists for.
- **`mkHandle` and `positionMaskOverlay` in `src/main.ts`** already place and
  drag SVG handles over the photo in image-uv, with the mask overlay hidden and
  shown by the same preference the coverage tint uses.

## Weighed against

- **026 (masks combine)** — shipped first and independent. A group's components
  each keep their own selection, so a rotated ellipse is simply a better
  component. Nothing in the group model needs to know about the angle.
- **024 (every control can say what it does)** — a rotation gesture is precisely
  a control that must say what it does, and on a touch device it has no cursor
  to say it with. If this ships before 024, it ships with the burden of
  explaining itself on its own.
- **004 (full-bleed crop) and 025 (straighten)** — both are about angle and
  both already own an angle-setting idiom on this device. This should reuse
  what they settled, not invent a third way to turn something.
- **006 (mask by subject / background)** — unrelated; a different selection
  type, not a different orientation of this one.

## Depends

- needs 024 — this adds a gesture to a surface whose controls do not yet
  explain themselves, and a rotation grip that nothing names is the exact
  failure 024 exists to fix. Lightroom gets away with a bare handle because a
  cursor explains it; this app has no cursor.
- touches 004 — both are about angle, and 004 already owns an angle-setting
  idiom on this device. Reuse what it settles rather than inventing a third way
  to turn something.
- distinct-from 026 — masks combining shipped first and is independent; nothing
  in the group model needs to know about a component's angle.
- distinct-from 006 — a different selection TYPE, not a different orientation
  of this one.

## Options

1. **An `angle` on the mask, set by a HANDLE the finger can see, with a coarse
   snap.** `MaskLayer` gains `angle` (radians, 0 = today's behaviour); both
   weight functions rotate `(dx, dy)` by it before the ellipse test; the overlay
   gains a visible rotation grip, sized to the 44 px touch target the
   accessibility rule requires, and a snap to a coarse step so "level with that
   line" is reachable without precision dragging. The angle is applied in a
   space where the image's aspect ratio is accounted for, and there is a
   non-gesture route to it as well, because a gesture with no alternative is
   unreachable for anyone who cannot make it.
2. **Rotate by dragging the ellipse's outline between the handles** — Lightroom's
   model, transplanted.
3. **An angle slider in the mask editor panel and no direct manipulation.**

## Rejected

- **2**: it is the right model on a machine with a cursor and it has no
  affordance without one. The whole of Lightroom's discoverability here is the
  pointer changing shape as it crosses the circumference; remove that and what
  is left is an invisible hit region a few pixels wide, on a device whose
  minimum reliable target is 44 px, which also fights the pan gesture that
  already lives on the photo. **It is rejected as a GESTURE and adopted as a
  MODEL** — the angle belongs to the shape and is adjusted on the shape.
- **3**: honest and reachable, and it abandons direct manipulation, which is
  the app's stated taste and is how every other mask control already works —
  centre, radii and gradient endpoints are all dragged on the photograph. A
  panel-only angle would make orientation the one property of a mask you cannot
  touch. It stays as the SECOND route in option 1 rather than as the only one,
  which is also what the accessibility rule requires.

## Rank

**Below 023 and 024, above 025.** Below 024 because this adds a gesture to a
surface whose controls do not yet explain themselves, and a rotation grip that
nothing names is the exact failure 024 exists to fix — Lightroom gets away with
a bare handle because a cursor explains it, and this app has no cursor. Below
023 even though 026 turned 023's fix into a preset over the group model rather
than new machinery: 023 is a REPORTED DEFECT, a sky mask missing sky in frames
the owner was looking at, and a reported defect outranks a capability nobody
has asked for twice. Above 025 because a mask that cannot be aimed at a
diagonal subject is a selection the reader cannot make at all, while 025
refines a control that already works.

**The first draft of this section said "below 024, above 023" and the bullet
was filed above 023, so the record and the queue disagreed** — and in this
repository the roadmap's FILE ORDER is the rank, which makes that one file with
two answers. The ordering claim was also self-contradictory: 023 already sat
above 024, so nothing can be below one and above the other.

**Not urgent enough to precede the reported defects** (013, 016, 014, 015):
those are frames the owner is looking at that come out wrong, and this is a
shape that comes out square when it should come out tilted.
