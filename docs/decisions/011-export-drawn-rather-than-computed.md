# 011 · The export drawn rather than computed

## Context

The live view already runs the entire edit as shaders in `gl.ts`. `export.ts`
implements every one of them again in TypeScript, and both files carry comments
asking whoever edits one to keep the constants in step BY HAND. Drawing the
export through the shaders that already exist would be faster and would end that
duplication — one implementation of the edit instead of two, with the preview and
the export provably the same thing.

**Ships in 3.0 with 009, the two together** (owner declaration, 2026-09-13).

## Looked up

What it waits on is measurement, not literature: the test page's probes on a real
iPad — whether a whole frame fits in one texture, whether a background thread can
draw, and above all **what a frame-sized render costs to READ BACK**, which is the
part a preview never pays. That last one is the number that decides it and it
cannot be taken in this container.

## Weighed against

**009 subsumes most of this** and the roadmap says to do 009 first. Both are in
3.0. Together they close the "two implementations of one edit" duplication that
`gl.ts` and `export.ts` both document in comments — and that duplication is the
same missing-abstraction story as **001** and **007**, at the pixel level rather
than the parameter level.

## Options

**Draw the export through the existing shaders.** One implementation, and the
preview and export become the same thing by construction rather than by
hand-maintained constants.

Keep both implementations and add a gate holding the constants in step. Cheaper,
and institutionalises the duplication.

## Rejected

**Requiring byte-identical output to today's export.** It cannot be: a graphics
chip computes in float where the processor uses doubles. A drawn export would
match the PREVIEW instead — and that is the owner's decision to make, stated in
the bullet, because it changes what "the same photograph" means between the two.

## Rank

**Eleventh and last**, which understates it — it is grouped into the declared 3.0
with 009 and ranks after it there. It sits at the bottom of the file because it
is blocked on a device read-back measurement that nothing in this container can
produce.
