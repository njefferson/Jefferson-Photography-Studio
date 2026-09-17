# 006 · Mask by subject / background

## Context

Auto-select the subject, or the background, as a mask. Owner request 2026-07-05.
Honest scoping recorded at the time: true subject/background segmentation needs
an on-device ML model — WebGPU, which is its own frontier backlog item — and
there is no classical stand-in the way sky detection had one. The architectural
instruction is to shape it as a mask TYPE so it slots into the existing engine
when the model half becomes possible.

## Looked up

**Owed, and the item cannot move without it.** What runs on-device in a browser
for segmentation, at what size, through what runtime, and on an iPad in
particular, is a moving and well-documented field — and the app already has the
counter-example in `src/sky.ts`, which is classical, deliberate, and carries a
comment saying so. Nothing here should be derived: the question is what exists,
what it costs to ship, and whether an iPad can run it, and all three are
published facts.

## Weighed against

Blocked behind the same WebGPU question as the frontier item it names, so it is
not independently schedulable. `src/sky.ts` is the existing precedent for a mask
type built classically and is worth re-reading before any model is considered —
it exists because the sky HAD a classical signal.

The mask engine itself is shipped and takes new types; that is the part this item
is allowed to build now.

## Options

**Architect the mask type now, leave the selector unimplemented.** The bullet's
own instruction, and it is the part that can be done without the model.

Wait entirely. Zero cost, and leaves the engine to be changed later under
pressure when the model half arrives.

## Rejected

**A classical stand-in.** Recorded at scoping time on 2026-07-05: unlike sky,
subject and background have no classical signal to key on in this app's images —
and under infrared the usual cues are further degraded, since colour evidence is
void. Building an approximation would ship a control that works on some
photographs for reasons nobody can state.

## Rank

**Sixth.** Below the presentation items because it is blocked on an external
capability rather than on a decision, and above the 3.0 performance items only
because those are explicitly grouped into one declared release below.
