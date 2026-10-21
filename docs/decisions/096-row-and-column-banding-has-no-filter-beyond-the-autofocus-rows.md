# 096 · Row and column banding has no filter beyond the autofocus rows

## Context

From the stage-by-stage comparison of the stages raw processors run against this
app, made in October 2026 with no photograph opened and no render made
(IR-SCIENCE.md, section 9w). It is the fifth tier of the stages marked missing, by
reach. This record takes the general line-noise filter; the autofocus-row half is
already built.

**What the references do.** RawTherapee has a line-noise filter adjuster from 0 to
1000 starting at 0, a direction choice (horizontal, vertical, both, autofocus lines)
and a separate autofocus-lines checkbox that is not checked in the panel's
constructor (`rtgui/tools/bayerpreprocess.cc`). No other reference read has one.

**What the app does today.** `equalisePdafRows` in `src/raw/nef.ts` equalises the
autofocus rows on the Z 50 and the Z fc, on by default, because those two bodies
need it. There is no general line-noise filter: a row or column offset that is not
an autofocus row is left in.

**Why there is a reason to look in infrared, and no reason to build.**
IR-SCIENCE.md 4c-xi records that the sky's blue is 1.4 percent of the sensor's
range, and 4c-xxi that the look multiplies what is left in the sky by thirteen.
A fixed pattern shows most where the signal is smallest and the gain largest, and
that is the starved channel under a mixer. That is a reason to measure and nothing
more: no banding has been measured in the reader's frames, and IR-SCIENCE.md has
no statement about it.

**What is not known.** Whether the reader's own raws carry any row or column offset
above their noise.

## Looked up

Every web page below was read through the fetch tool's summary, a small model's
account of it.

- **RawTherapee**, https://github.com/RawTherapee/RawTherapee/blob/dev/rtgui/tools/bayerpreprocess.cc
  (summary). Its program-wide default is in `rtengine/procparams.cc`, which is
  unread (the page is cut at 1000 of 5496 lines); its default raw profile
  (https://github.com/RawTherapee/RawTherapee/blob/dev/rtdata/profiles/Auto-Matched%20Curve%20-%20ISO%20Low.pp3,
  summary) sets no line-noise key.
- **dcraw, LibRaw, darktable**: no line-noise filter in the sources read
  (`dcraw.c`, `dcraw_process.cpp`, the version 4.0 module order page).
- **IR-SCIENCE.md** 4c-xi, 4c-xxi (headings and the figures above) and 4c-xxv (the
  denoiser's range in noise units, the unit a banding statistic would use).
- **The app's own source**, `src/raw/nef.ts`, `equalisePdafRows`, as the
  comparison's app-side reading records it: on for the Z 50 and Z fc.

## Weighed against

- **095, the two greens, and 098, noise reduction on the mosaic** (this block). The
  same place in the order, before the demosaic.
- **097, a dark frame** (this block). The other way to remove the fixed part of a
  pattern.
- **072, a photograph shot well under opens grainier** (open, NOTES.md roadmap).
  Banding is most visible in a frame pushed hard, which is that record's ground.

## Options

1. **Measure first, then decide.** Chosen.
   - On the reader's own raws, take each row's and each column's mean over a flat
     region of the starved channel, subtract a smooth fit across rows or columns,
     and express what is left in the noise units the denoiser already uses
     (IR-SCIENCE.md 4c-xxv). Then open the amplified picture at 1:1. If nothing rises
     above the noise and nothing shows, close the record as not owed.
   - If banding shows, build a per-photograph row and column offset estimated from
     the data on the mosaic, per colour plane, before the demosaic, with a visible
     strength control that starts off (as in RawTherapee) or on if the pictures say
     so. A `## Looked at` section is owed before any Outcome.
2. **Extend the autofocus-row equalisation to all rows.** That correction exists
   because a known layout on two named bodies needs it. For all rows it would be a
   guess at a pattern nobody has seen.
3. **RawTherapee's adjuster with its range.** A constant strength and a control
   before any measured need.

## Rejected

- **On by default now.** The one reference that has the filter starts it at 0.
- **Extending the autofocus-row stage.** Above.
- **Building it from the thirteenfold figure alone.** That figure says where the
  gain is, not that a pattern is there.

## Rank

Seventh in the block, second of the fifth tier, which is ordered as the comparison
lists it. Behind the green match (095) because that measurement is a ratio per frame
and this one needs a region and a fit; ahead of the dark frame (097), which needs a
file the reader would have to shoot, and the mosaic noise stage (098).

## Depends

- touches 095 — the same stage before the demosaic; the order of the two is decided when either is built.
- touches 097 — a dark frame is the other route to the fixed part of a pattern.
- touches 072 — banding shows most in a frame pushed hard, which is that item's ground.
