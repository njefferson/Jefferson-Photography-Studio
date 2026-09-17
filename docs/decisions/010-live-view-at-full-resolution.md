# 010 · (superseded detail) The live view at full resolution

## Context

The earlier, more general form of **009**: the editor works on a downscaled copy
because a full-resolution render was too costly when that was decided. Measured
2026-09-13 — drawing a screen-sized frame from a full-resolution texture measures
the SAME as drawing it from the proxy (1418 ms against 1412 in a container; the
absolutes are software, the equality is structural, because the work is per
output pixel). The cost is memory: 16 MB a megapixel as float32, about 340 MB for
a 21-megapixel frame against roughly 84 for today's proxy, halved by a half-float
texture.

The prize is not speed. It is that the preview and the export become the same
pixels at the same scale.

**This entry is retained as the superseded detail.** 009 is the scoped version
with the device numbers and the tap-scale decision; this one holds the reasoning
that produced it.

## Looked up

Same as 009 — texture formats and their memory cost are documented platform
facts, and the container's absolute timings are explicitly not device timings.

## Weighed against

Superseded by **009** and grouped with it and **011** into 3.0. Retired by the
same work: the proxy-texel footprint, the tap scale, `proxyFactorFor`.

## Options

**Keep it as the superseded record rather than deleting it.** Chosen. The
measurement that killed the proxy premise lives here, and 009's scoping only
makes sense against it.

Delete and fold everything into 009. Loses the "the premise expired, here is the
number" reasoning, which is the part a future session would otherwise re-derive.

## Rejected

**Speed as the justification.** The measurement says drawing from a
full-resolution texture is the same cost as from the proxy, not faster. Anyone
arguing this item on performance grounds is arguing against its own numbers; the
case is the preview and the export becoming one thing.

## Rank

**Tenth.** Below 009 by construction — it is that item's history, not a separate
piece of work.
