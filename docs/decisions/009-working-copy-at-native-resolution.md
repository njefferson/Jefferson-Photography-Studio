# 009 · The editor's WORKING COPY at native resolution

## Context

The internal copy the live view is drawn from is half resolution today and is not
a control the reader can see. **Never call this "full size" to the owner**: the
export panel already owns that phrase — its scale control reads "Full (native)"
with a Quality slider at 92 beside it, and a crop already changes the output's
dimensions. Nothing in that panel changes.

**Ships in 3.0, the optimized release** (owner declaration, 2026-09-13), together
with 011.

Measured on all three devices 2026-09-13 and **the premise for the proxy is
gone**: a full-resolution half-float source draws a screen-sized frame no worse
than today's quarter-size proxy on every device measured. On the iPads the three
sources are within run-to-run noise and the ordering is not stable — a second run
on the 4-core iPad reversed it, 28 against 35 one run and 33 against 27 the next,
which is why the drawing probe now takes three passes and prints the spread. The
desktop is consistent: 12–13 against 13, float32 19. Memory is the solid number:
**170 MB for a 21-megapixel frame against 340**, and what the halving costs the
picture reads **0.018 of 255** on every device.

## Looked up

Half-float texture precision and its cost against float32 is a documented
property of the platform, not something to establish by taste — and the 0.018
figure is the measurement that confirms the documented expectation on these
actual frames. The measuring was necessary because the DEVICE behaviour (noise,
unstable ordering) is not in any specification.

## Weighed against

**Subsumes most of 011** and the bullet says to do it first. Retires the
proxy-texel footprint, the tap scale, `proxyFactorFor`, and the class of defect
where a tile or an export disagrees with the photograph — which is the same class
as **001** and **007**, reached from the other end.

## Options

**Ship it with the tap scale pinned to the old proxy factor.** Chosen, and it is
what makes this safe: denoise and sharpen tap in TEXELS, so full resolution would
silently halve their footprint and change what every tuned slider means. Pinning
reproduces today's footprint exactly, and the acceptance test is that a photograph
renders pixel for pixel as it did.

Let the operators work at native scale. A better end state and a different
change: it alters the meaning of shipped, owner-tuned sliders.

## Rejected

**Calling it "full size" anywhere the owner reads.** The export panel owns that
phrase and this is not that; conflating them would make a sentence about the
internal working copy read as a change to the output.

**Shipping native resolution and native tap scale together.** It would land a
performance change and a silent re-meaning of the denoise and sharpen sliders in
one release, with no way to tell which caused a difference in the picture.

## Rank

**Ninth**, grouped with 011 into the owner-declared 3.0. Its own position inside
that release is FIRST, because it subsumes most of 011.
