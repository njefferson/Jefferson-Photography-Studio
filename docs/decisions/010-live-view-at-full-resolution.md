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

## Depends

- superseded-by 009 — this record's own first line: superseded by 009 and
  grouped with it and 011 into 3.0. It is a detail note folded into that work,
  not independent work of its own.
- together 011 — grouped with 009 and 011 into one release by the same line.

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

**Archived 2026-10-17 with its Outcome.**

## Outcome, 2026-10-17: retired from the queue as the detail note it always said it was

**What was decided.** The roadmap carried this record as an open item of its own for as long as the
queue has existed, under a title that begins "(superseded detail)", with the record's first line
saying it is the earlier form of 009 and its Depends line saying `superseded-by 009`. Nothing in
it is independent work: the build, the tap scale and the retirement of the proxy-texel footprint
are 009's, and the export drawn rather than computed is 011's. The open bullet is archived so the
queue holds work and no history.

**What survives.** The record, unchanged above: the measurement that killed the premise for the
proxy (a screen-sized frame draws from a full-resolution texture at the cost it draws from the
proxy, 1418 ms against 1412 in a container, and the memory is 16 MB a megapixel as float32) and
the reason the case is the preview and the export becoming the same pixels and not speed. 009's
bullet and record carry the work forward and this record stays on file beside them. Nothing was
built, and nothing was lost by retiring the bullet.
