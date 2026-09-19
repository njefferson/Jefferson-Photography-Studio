# 003 · Big image: the photo fills the app, menus float over it

## Context

The open photo becomes the BACKGROUND everywhere in the app rather than being
boxed inside a stage: the picture fills the screen, overflowing behind as needed,
and every control — top bar, editor drawer and tabs, histogram, lesson chips,
crop aids, banners — floats over it. One coherent feel across the whole app.
Owner direction 2026-07-16, given as the owner ended a session, and explicitly
marked STILL AN IDEA.

## Looked up

**Not yet, and this is the item where it will matter most.** Every open question
on it is a solved problem in mobile photo editors — how floating chrome stays
legible over an arbitrary photograph (scrim, blur, or an opaque panel), how a
drawer coexists with a full-bleed image in portrait, whether the image pans
freely under the chrome. Doctrine §11e applies directly: these are answered in
public design guidance and in shipped apps, and deriving them from taste here
would be exactly the failure that rule names. The reading happens before the
first layout is written, not after a round of it looks wrong.

## Weighed against

**004 is the pilot for this item** and has already shipped its first instance, so
the two are not independent: 004's measured results are the evidence base here,
and its unanswered question — whether the crop pill floats over the photo and
passes taps through where empty — is one of this item's questions asked about one
control. Doing 003 as a general pass before 004's questions are answered would
generalise from an unfinished instance.

Touches nothing in the pipeline or export; it is presentation and layout only,
which is what makes it separable from everything else on the roadmap.

## Options

**Let 004 answer the design questions on one control, then generalise.** Chosen,
and it is the owner's own stated sequencing in the bullet: build the crop
overflow as the pilot, learn the answers, then move outward.

A single app-wide layout pass. Rejected as the starting move — it decides five
taste questions at once, in code, before any of them has been tested on a real
photograph on a real tablet.

## Rejected

**Guessing the design answers.** The bullet names them explicitly as the owner's
taste calls and says not to guess. Recorded here because the questions are
concrete enough that a session will be tempted to answer them while implementing
something adjacent: scrim versus opaque, drawer behaviour in portrait,
fit-to-screen versus free pan, what the start screen does, and whether floating
menus eat taps meant for the photo.

## Rank

**Third.** Behind 002 because it is a direction rather than a release, and ahead
of the capability items because its pilot has already shipped and its unanswered
questions are blocking 004 from closing.

**ASKED 2026-09-19 FROM A PC, and it belongs to this item rather than beside
it:** whether the floating menus are REPOSITIONABLE over the photograph —
dragged to wherever they cover the least of it — and, if they are, where a
dragged position is remembered: per device, per session, or per photograph.
Two things already point at it. The Straighten card's height is what the
picture steps back by, which is why it was reported the same day as taking
too much of the image (NOTES.md, "Eight reports from a PC"), and a card that
floats and can be moved has no reserve to take at all. And the crop pill's own
unanswered question above — whether it floats over the photo and passes taps
through where empty — is the same question asked about one control.
