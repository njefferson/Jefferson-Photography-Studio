// Fill by hand on the Sky mask: a stroke through the gaps the colour grow cannot walk to, grown from every point it crosses into the connected pixels of similar colour and brightness (decision 065).
//
// WHY IT IS A THIRD KIND OF HAND CORRECTION AND NOT A MASK OF ITS OWN. The grow in
// skyfine.ts reaches sky only along sky-coloured paths, so the sky between a
// pylon's struts is cut off by the steel and the mask leaves the whole tower out.
// Add by hand cannot fix that without a steadier hand than the gap allows; this
// takes the stroke as a SEED, and the colour decides where the fill stops. It is
// stored among the mask's own hand corrections (FixStroke with a tolerance) and
// replayed over whatever the detection returns, so Reach, Feather and the colour
// switch keep it, and one stroke is one undo step.
//
// WHAT IT READS is the guide the grow reads (skyfine.ts, SkyGuide): red share, blue
// share and gamma luma of the gray-world-balanced linear frame, at the refined
// mask's scale. Nothing here reads the edit, so a fill cannot drift as the
// photograph is graded, for the reason the grow cannot.
//
// WHAT IT IS NOT. It is connected only: every pixel it takes is reached from a
// seed through pixels that each match that seed, never from anywhere else in the
// frame (the Colour mask joined with "Add to it" is the route for every matching
// area). It never changes the automatic grow and it starts only from a stroke the
// reader makes. It carries no luma-gradient brake, because the reader seeds every
// gap and a gap a few pixels wide is made entirely of edge pixels, which a brake
// would refuse; the Tolerance is the reader's bound instead.

import type { BrushMask, FixStroke } from "./pipeline";
import { SKY_GROW_SPREAD_MIN, SKY_GROW_SPREAD_MAX, SKY_GROW_TOL, type SkyGuide } from "./skyfine";

/** Tightest fill tolerance, as a chroma radius in guide units: the grow's own
 *  tightest edge (its smallest spread times its tolerance), so the control's
 *  range starts where the app already draws its narrowest colour boundary. Not
 *  tuned on any frame. */
export const FILL_TOL_MIN = SKY_GROW_SPREAD_MIN * SKY_GROW_TOL;
/** Widest fill tolerance, the grow's own widest edge for the same reason. */
export const FILL_TOL_MAX = SKY_GROW_SPREAD_MAX * SKY_GROW_TOL;
/** How many times the chroma radius the luma radius is. The guide's luma runs
 *  0 to 1 across the frame while its colour shares move by hundredths between
 *  things the eye calls alike, so one radius cannot serve both. A fixed ratio,
 *  recorded here and not on each stroke, so it is part of what a fill IS: changing
 *  it changes every stored fill, the way changing the guide would. Not tuned on
 *  any frame; the renders and the device decide whether it is right. */
export const FILL_LUMA_PER_CHROMA = 4;
/** Where the Tolerance slider starts, as a position from 0 to 1. */
export const FILL_POSITION_DEFAULT = 0.5;

/** A rectangle of guide pixels, inclusive at both ends. */
export interface SkyFillRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** One fill under way or finished: the guide it reads, the tolerance it was
 *  started with, the pixels it has taken (1 = taken) and the walk it has made.
 *  Built by `startSkyFill`, grown by `extendSkyFill`; nothing else writes it. */
export interface SkyFill {
  readonly guide: SkyGuide;
  /** The chroma radius, in guide units, stored on the stroke as `tol`. */
  readonly tol: number;
  readonly w: number;
  readonly h: number;
  /** One byte per guide pixel, 1 where the fill has taken the pixel. */
  readonly region: Uint8Array;
  /** Bounding box of every pixel taken; x1 < x0 while none is. */
  x0: number; y0: number; x1: number; y1: number;
  /** Bounding box of the pixels taken since `takeFillDirty` last ran. */
  dx0: number; dy0: number; dx1: number; dy1: number;
  hasLast: boolean;
  lastX: number;
  lastY: number;
  lastSeed: number;
}

/**
 * The stored tolerance a slider position stands for.
 * @param position  the Tolerance slider, 0 (strict) to 1 (loose); anything else
 *   is read as the default position.
 * @returns a chroma radius in guide units between FILL_TOL_MIN and FILL_TOL_MAX,
 *   rising exponentially with the position because the range is several-fold.
 * What the result must satisfy: it is what a stroke stores as `tol`, and the
 * stored number is what is replayed, so changing this mapping later cannot
 * disturb a stroke already made, the same arrangement the Hand size slider has.
 */
export function fillToleranceAt(position: number): number {
  const t = Math.min(1, Math.max(0, Number.isFinite(position) ? position : FILL_POSITION_DEFAULT));
  return FILL_TOL_MIN * Math.pow(FILL_TOL_MAX / FILL_TOL_MIN, t);
}

// Scratch shared by every flood: which flood last looked at each pixel, and the
// queue. One flood's id never repeats, so the arrays are never cleared, only
// replaced when the guide's size changes. The app is single-threaded here.
let seenId = new Int32Array(0);
let floodQueue = new Int32Array(0);
let floodCounter = 0;

/**
 * Begin a fill on a guide.
 * @param guide  from buildSkyGuide, for the photograph being corrected.
 * @param tol  the stored chroma radius, from `fillToleranceAt`.
 * @returns an empty fill that has taken no pixel.
 * What the result must satisfy: it reads only `guide`, so a fill replayed from
 * the same points and tolerance on the same guide takes the same pixels.
 */
export function startSkyFill(guide: SkyGuide, tol: number): SkyFill {
  return {
    guide, tol, w: guide.w, h: guide.h, region: new Uint8Array(guide.w * guide.h),
    x0: guide.w, y0: guide.h, x1: -1, y1: -1,
    dx0: guide.w, dy0: guide.h, dx1: -1, dy1: -1,
    hasLast: false, lastX: 0, lastY: 0, lastSeed: -1,
  };
}

/** Note that a pixel was taken: grow both bounding boxes to hold it. */
function mark(f: SkyFill, x: number, y: number): void {
  if (x < f.x0) f.x0 = x;
  if (y < f.y0) f.y0 = y;
  if (x > f.x1) f.x1 = x;
  if (y > f.y1) f.y1 = y;
  if (x < f.dx0) f.dx0 = x;
  if (y < f.dy0) f.dy0 = y;
  if (x > f.dx1) f.dx1 = x;
  if (y > f.dy1) f.dy1 = y;
}

/** The middle value of the first `n` entries of a small scratch array, which it
 *  reorders. Takes the array and the count (at most 9); returns the median. */
function middleOf(a: Float32Array, n: number): number {
  for (let i = 1; i < n; i++) {
    const v = a[i];
    let j = i - 1;
    while (j >= 0 && a[j] > v) { a[j + 1] = a[j]; j--; }
    a[j + 1] = v;
  }
  return a[n >> 1];
}
const windowR = new Float32Array(9), windowB = new Float32Array(9), windowL = new Float32Array(9);

/** Grow one seed into the connected pixels that match it. Takes the fill and
 *  the seed's pixel index; changes `region` and the boxes and returns nothing.
 *
 *  The seed's reference is the MEDIAN of each channel over its own 3 by 3
 *  neighbourhood, so one grainy pixel does not decide what the stroke meant, and
 *  a gap two or three pixels wide still reads as the sky in it rather than as a
 *  blend with the strut beside it (a mean would take the blend, and a blend
 *  matches neither). The seed pixel itself is always taken, because the stroke
 *  said "here". A pixel matches when its colour share distance from the
 *  reference is within the chroma radius AND its luma is within the luma radius.
 *  A pixel an earlier seed already took is left alone and not walked through.
 *  What it relies on: each pixel is looked at once per flood. */
function floodFrom(f: SkyFill, p0: number): void {
  const { w, h, region, guide } = f;
  const n = w * h;
  if (seenId.length !== n) { seenId = new Int32Array(n); floodQueue = new Int32Array(n); }
  const id = ++floodCounter;
  const gr = guide.r, gb = guide.b, gl = guide.l;
  const sx = p0 % w, sy = (p0 / w) | 0;
  let c = 0;
  for (let y = Math.max(0, sy - 1); y <= Math.min(h - 1, sy + 1); y++) {
    for (let x = Math.max(0, sx - 1); x <= Math.min(w - 1, sx + 1); x++) {
      const q = y * w + x;
      windowR[c] = gr[q]; windowB[c] = gb[q]; windowL[c] = gl[q]; c++;
    }
  }
  const r0 = middleOf(windowR, c), b0 = middleOf(windowB, c), l0 = middleOf(windowL, c);
  const chroma2 = f.tol * f.tol;
  const luma = f.tol * FILL_LUMA_PER_CHROMA;
  const queue = floodQueue;
  let head = 0, tail = 0;
  seenId[p0] = id;
  region[p0] = 1;
  mark(f, sx, sy);
  queue[tail++] = p0;
  while (head < tail) {
    const p = queue[head++];
    const x = p % w, y = (p / w) | 0;
    for (let k = 0; k < 4; k++) {
      const nx = x + (k === 0 ? -1 : k === 1 ? 1 : 0);
      const ny = y + (k === 2 ? -1 : k === 3 ? 1 : 0);
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const q = ny * w + nx;
      if (seenId[q] === id) continue;
      seenId[q] = id;
      if (region[q]) continue;
      const dr = gr[q] - r0, db = gb[q] - b0;
      if (dr * dr + db * db > chroma2 || Math.abs(gl[q] - l0) > luma) continue;
      region[q] = 1;
      mark(f, nx, ny);
      queue[tail++] = q;
    }
  }
}

/** Seed one guide pixel unless it was the last seed or is already taken. */
function seedAt(f: SkyFill, px: number, py: number): void {
  const p = py * f.w + px;
  if (p === f.lastSeed) return;
  f.lastSeed = p;
  if (!f.region[p]) floodFrom(f, p);
}

/**
 * Add the next point of a stroke to a fill.
 * @param fill  the fill being grown.
 * @param u,v  the point, image-uv, 0..1. It is rounded to 32-bit float first,
 *   because a stored stroke keeps its points as a Float32Array and the live
 *   stroke must take exactly the pixels its replay will.
 * @returns nothing; the fill now holds the pixels grown from every guide pixel
 *   the stroke crossed on its way from the previous point to this one (the
 *   first point seeds itself).
 * What the result must satisfy: seeds are taken in order, one guide pixel apart
 * at most, and a seed already inside the fill starts nothing, so the live
 * stroke and `replaySkyFill` over the same points agree pixel for pixel.
 */
export function extendSkyFill(fill: SkyFill, u: number, v: number): void {
  const gx = Math.min(1, Math.max(0, Math.fround(u))) * fill.w;
  const gy = Math.min(1, Math.max(0, Math.fround(v))) * fill.h;
  if (!fill.hasLast) {
    seedAt(fill, Math.min(fill.w - 1, Math.floor(gx)), Math.min(fill.h - 1, Math.floor(gy)));
  } else {
    const dx = gx - fill.lastX, dy = gy - fill.lastY;
    const steps = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))));
    for (let i = 1; i <= steps; i++) {
      const x = fill.lastX + (dx * i) / steps, y = fill.lastY + (dy * i) / steps;
      seedAt(fill, Math.min(fill.w - 1, Math.floor(x)), Math.min(fill.h - 1, Math.floor(y)));
    }
  }
  fill.hasLast = true;
  fill.lastX = gx;
  fill.lastY = gy;
}

/**
 * Take the rectangle of pixels the fill has gained since the last call.
 * @param fill  the fill being grown.
 * @returns the rectangle, or null when nothing was gained; the next call starts
 *   from empty.
 * What the caller relies on: stamping this rectangle after each point is enough
 * to keep a live bitmap equal to the whole fill, so a stroke costs what it adds.
 */
export function takeFillDirty(fill: SkyFill): SkyFillRect | null {
  if (fill.dx1 < fill.dx0) return null;
  const r = { x0: fill.dx0, y0: fill.dy0, x1: fill.dx1, y1: fill.dy1 };
  fill.dx0 = fill.w; fill.dy0 = fill.h; fill.dx1 = -1; fill.dy1 = -1;
  return r;
}

/**
 * Add a fill's pixels to a mask bitmap, in place.
 * @param bm  the bitmap to change: a FRESH copy, never one a snapshot shares. It
 *   may be at the guide's size (the refined selection) or smaller (the coarse
 *   seed).
 * @param fill  the fill whose pixels are added.
 * @param rect  the part of the fill to add, in guide pixels; the whole fill's
 *   box when omitted.
 * @returns nothing; `bm.data` only ever rises, to 255 where the fill took a
 *   pixel at the guide's size and to the share of the block the fill took where
 *   the bitmap is smaller.
 * What the result must satisfy: a fill adds and never takes out, so replaying a
 * list of strokes in order lets a later Take out by hand cut into an earlier
 * fill and a later fill restore what a Take out removed.
 */
export function stampSkyFill(bm: BrushMask, fill: SkyFill, rect?: SkyFillRect): void {
  const r = rect ?? (fill.x1 >= fill.x0 ? { x0: fill.x0, y0: fill.y0, x1: fill.x1, y1: fill.y1 } : null);
  if (!r) return;
  const { w, h, region } = fill;
  if (bm.w === w && bm.h === h) {
    for (let y = r.y0; y <= r.y1; y++) {
      for (let x = r.x0; x <= r.x1; x++) {
        const p = y * w + x;
        if (region[p]) bm.data[p] = 255;
      }
    }
    return;
  }
  const cx0 = Math.max(0, Math.floor((r.x0 * bm.w) / w) - 1), cx1 = Math.min(bm.w - 1, Math.floor((r.x1 * bm.w) / w) + 1);
  const cy0 = Math.max(0, Math.floor((r.y0 * bm.h) / h) - 1), cy1 = Math.min(bm.h - 1, Math.floor((r.y1 * bm.h) / h) + 1);
  for (let cy = cy0; cy <= cy1; cy++) {
    const gy0 = Math.min(h - 1, Math.floor((cy * h) / bm.h));
    const gy1 = Math.min(h, Math.max(gy0 + 1, Math.floor(((cy + 1) * h) / bm.h)));
    for (let cx = cx0; cx <= cx1; cx++) {
      const gx0 = Math.min(w - 1, Math.floor((cx * w) / bm.w));
      const gx1 = Math.min(w, Math.max(gx0 + 1, Math.floor(((cx + 1) * w) / bm.w)));
      let taken = 0;
      for (let y = gy0; y < gy1; y++) for (let x = gx0; x < gx1; x++) taken += region[y * w + x];
      if (!taken) continue;
      const v = Math.round((255 * taken) / ((gy1 - gy0) * (gx1 - gx0)));
      const i = cy * bm.w + cx;
      if (v > bm.data[i]) bm.data[i] = v;
    }
  }
}

// The fills most recently built, by the stroke they belong to. A Reach or
// Feather drag replays every stroke on every input event and a fill does not
// depend on either, so a finished fill is kept rather than grown again. Bounded,
// because each holds one byte per guide pixel.
const remembered = new Map<FixStroke, SkyFill>();
const REMEMBER_MAX = 16;

/**
 * Keep a finished fill against the stroke it was grown for.
 * @param stroke  the stored stroke the fill was made from.
 * @param fill  the fill grown from that stroke's points and tolerance.
 * @returns nothing; the least recently used fill is dropped past the bound.
 * What the caller relies on: `replaySkyFill` returns this fill for the stroke
 * while the guide and the tolerance are the same ones.
 */
export function rememberSkyFill(stroke: FixStroke, fill: SkyFill): void {
  remembered.delete(stroke);
  remembered.set(stroke, fill);
  while (remembered.size > REMEMBER_MAX) {
    const oldest = remembered.keys().next().value as FixStroke;
    remembered.delete(oldest);
  }
}

/**
 * The fill a stored stroke makes on a guide.
 * @param stroke  a stroke that carries a tolerance; its points are image-uv.
 * @param guide  from buildSkyGuide, for the photograph the mask is on now.
 * @returns the fill, grown again from the stroke's points unless one is kept for
 *   this stroke, this guide and this tolerance. Never modify it.
 * What the result must satisfy: it is the same pixels the live stroke showed,
 * and the same every time for the same stroke on the same photograph, which is
 * what lets a regenerated mask put the hand work back where it was.
 */
export function replaySkyFill(stroke: FixStroke, guide: SkyGuide): SkyFill {
  const tol = stroke.tol ?? fillToleranceAt(FILL_POSITION_DEFAULT);
  const hit = remembered.get(stroke);
  if (hit && hit.guide === guide && hit.tol === tol) {
    rememberSkyFill(stroke, hit);
    return hit;
  }
  const fill = startSkyFill(guide, tol);
  const pts = stroke.pts;
  for (let i = 0; i + 1 < pts.length; i += 2) extendSkyFill(fill, pts[i], pts[i + 1]);
  rememberSkyFill(stroke, fill);
  return fill;
}
