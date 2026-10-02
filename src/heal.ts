// Dust & spot healing: a per-photo list of feathered clone spots that REWRITES
import { fromHalf } from "./half";
// THE SOURCE — each spot copies a clean patch from a nearby offset over the
// defect, blended by a radial feather.
//
// A HEAL IS A CLONE PLUS THE LAPLACE CORRECTION (2026-10-02), and only a spot
// set to Clone is the plain copy. The correction is the defining step of the
// reference heal — Perez, Gangnet and Blake, "Poisson Image Editing" (SIGGRAPH
// 2003, section 2, eq. 5): seamless cloning is the copy plus an additive
// correction that is a MEMBRANE interpolant of the source/destination mismatch
// on the boundary, Delta f = 0 inside with f = (destination - source) on the
// edge. darktable's heal.c (after GIMP's Healing Tool) solves exactly that with
// a red/black Gauss-Seidel over-relaxation, and so does `laplaceFill` here.
// What it buys is the thing no source search can: the copied patch meets its
// surround with ZERO offset at the rim, whatever its brightness was — NOTES
// recorded a 0.001 raw mismatch becoming 0.095 on the canvas after the swap
// and the look, with the search already optimal. Clone stays as its own mode
// (HealSpot.mode) for texture that must be copied exactly as it is.
//
// GPU/CPU strategy (deliberately NOT a shader uniform loop): denoise and
// sharpen sample the source texture with 25/49 neighbourhood taps, so an
// in-shader heal is either invisible to them (taps read the unhealed texel) or
// costs taps × spots per pixel. Instead the heal is BAKED: the preview patches
// the GPU texture (texSubImage2D of the rects below, recomputed from the
// pristine decode on every spot change), and the export applies the identical
// math to the same source bytes. Both sides run THIS code on the SAME data, so
// GPU==CPU parity is by construction — every downstream consumer (denoise
// taps, clarity, histogram, colour picks) sees healed pixels automatically.
//
// Spots always read the ORIGINAL (pre-heal) source: within a rebaked rect each
// pixel starts from the pristine value and the spots mix over it in list
// order — deterministic, order-stable, and idempotent under partial rebakes.
// What a heal's rim MEETS is the composite so far (healLayers), so a heal
// beside an earlier one matches that one's healed pixels, not the dust under
// them.
//
// Geometry lives in image-uv so a spot anchors to the photo across the preview
// proxy and the full-res export; the radius is a fraction of the image WIDTH
// (spots are round in pixels, and width is the shared scale of both axes).

export interface HealSpot {
  /** Destination centre, image-uv. */
  x: number;
  y: number;
  /** Destination radius as a fraction of the image width. */
  r: number;
  /** Offset to the clean source patch, image-uv (source centre = x+dx, y+dy). */
  dx: number;
  dy: number;
  /** "heal" (the default, and what an absent mode means): the copy plus the
   *  Laplace correction, so the patch takes on its surround's level and colour.
   *  "clone": the copy alone, exactly as the source has it. */
  mode?: "heal" | "clone";
}

/** The mode a spot is in.
 *  @param s the spot.
 *  @returns "clone" when it says so, otherwise "heal" — absent is heal, so every
 *  spot placed before Clone existed keeps meaning what the button said. The
 *  bake (healLayers) and the Corrections panel both read it through here. */
export function spotMode(s: HealSpot): "heal" | "clone" {
  return s.mode === "clone" ? "clone" : "heal";
}

/** Feather start: weight is 1 inside HEAL_CORE·r, easing to 0 at r. */
export const HEAL_CORE = 0.45;

/** Spot radius bounds, as fractions of image width (UI slider + auto-detect). */
export const SPOT_R_MIN = 0.002;
export const SPOT_R_MAX = 0.035;
export const SPOT_R_DEFAULT = 0.008;

export interface Rect {
  x0: number;
  y0: number;
  w: number;
  h: number;
}

function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-4)));
  return t * t * (3 - 2 * t);
}

/** Integer pixel bbox of a spot's destination disc at a given resolution. */
export function spotRect(s: HealSpot, W: number, H: number): Rect {
  const rPx = Math.max(1, s.r * W);
  const cx = s.x * W - 0.5;
  const cy = s.y * H - 0.5;
  const x0 = Math.max(0, Math.floor(cx - rPx - 1));
  const y0 = Math.max(0, Math.floor(cy - rPx - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + rPx + 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + rPx + 1));
  return { x0, y0, w: Math.max(0, x1 - x0 + 1), h: Math.max(0, y1 - y0 + 1) };
}

/** What one pixel of the spot being SOLVED holds while its heal is worked out,
 *  on top of the patches: the composite under it, the source, the correction
 *  (three float32 each), the feather weight (float32), the domain flag and its
 *  place in the red/black sweep lists (one byte, one int32), and the coarser
 *  grids the solve starts from (a third more of the correction and the flag).
 *  Freed before the next spot. healLayers allocates exactly these. */
const HEAL_SOLVE_BYTES_PX = 12 + 12 + 12 + 4 + 1 + 4 + 7;

/** WHAT THE HEALED PATCHES WEIGH, in bytes, at a given resolution.
 *
 *  Takes `spots`, the edit's heal list, and `W`/`H`, the SOURCE dimensions the
 *  patches are baked at. Returns the bytes a bake holds at its peak — every
 *  patch (`spotRect`'s area at the 12 bytes a pixel `HealPatch.data` costs as
 *  three floats of linear RGB), plus the working set of the largest spot while
 *  its Laplace correction is solved (HEAL_SOLVE_BYTES_PX a pixel, one spot at a
 *  time).
 *
 *  What the caller relies on, and the whole reason it exists: the export's
 *  memory model bills this PER WORKER, because every worker bakes every patch
 *  independently from its own copy of the source. Three default spots on a
 *  5600-wide frame is about 0.3 MB and invisible; forty at the largest radius
 *  the app allows is about 75 MB each, which is 300 MB across four workers and
 *  over the whole budget on its own. It lives here rather than in the export so
 *  that it reads `spotRect` — the same geometry the bake uses — instead of a
 *  second copy of that arithmetic that could drift from it. */
export function healPatchBytes(spots: readonly HealSpot[] | undefined, W: number, H: number): number {
  let bytes = 0, solve = 0;
  for (const s of spots ?? []) {
    const r = spotRect(s, W, H);
    bytes += r.w * r.h * 12;
    solve = Math.max(solve, r.w * r.h * HEAL_SOLVE_BYTES_PX); // a clone holds less; one rule
  }
  return bytes + solve;
}

/** Per-spot constants at a resolution, precomputed once per bake/scan. */
interface SpotPx {
  cx: number;
  cy: number;
  rPx: number;
  offX: number; // whole-pixel source offset (no resampling)
  offY: number;
  heal: boolean; // the Laplace correction applies (mode heal)
}

function toPx(spots: readonly HealSpot[], W: number, H: number): SpotPx[] {
  return spots.map((s) => ({
    cx: s.x * W - 0.5,
    cy: s.y * H - 0.5,
    rPx: Math.max(1, s.r * W),
    offX: Math.round(s.dx * W),
    offY: Math.round(s.dy * H),
    heal: spotMode(s) === "heal",
  }));
}

/** Feather weight 0..1 of one spot at pixel (px,py). */
function weightAt(s: SpotPx, px: number, py: number): number {
  const d = Math.hypot(px - s.cx, py - s.cy) / s.rPx;
  return 1 - smooth01(HEAL_CORE, 1, d);
}

const clampI = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v);

/** Reads one PRISTINE source pixel into `out` (three channels). */
type PxReader = (x: number, y: number, out: Float64Array) => void;

/** One spot's result: the composite AFTER this spot (and every one before it),
 *  three float32 numbers a pixel over the spot's rect. FLOAT32 ON PURPOSE: it is
 *  what a patch holds anyway (HealPatch.data), so the layers ARE the export's
 *  patches and a bake never holds the composite twice. */
interface HealLayer extends Rect {
  data: Float32Array;
}

/** darktable's convergence floor for the solve, in the buffer's own units: a
 *  tenth of an 8-bit step (heal.c's `epsilon = 0.1/255` in its 0..1 units). */
const EPS_BYTES = 0.1;
/** The same for linear float sources — sixteen times finer, because a raw's
 *  linear values are taken BEFORE exposure, which multiplies them by up to 16. */
const EPS_LINEAR = 0.1 / 255 / 16;
/** darktable's retouch module caps the heal at 2000 iterations; so does this. */
const MAX_ITER = 2000;
/** Below this many unknowns the solve starts from the ring's mean; above it,
 *  from the same problem solved on a grid half the size (laplaceFill). */
const COARSE_MIN = 256;

/**
 * THE MEMBRANE: solve Delta D = 0 over the pixels of `dom`, with D held at its
 * given values everywhere else, by red/black Gauss-Seidel with over-relaxation
 * — darktable's heal.c, its empirical relaxation factor and its stopping rule.
 *
 * @param D   rw x rh x 3 values; on entry the boundary values are set; on
 *            return the domain holds the solution (its entry values are
 *            overwritten by the starting guess).
 * @param dom 1 where D is unknown.
 * @param rw  the rect's width.
 * @param rh  the rect's height.
 * @param eps the stopping tolerance in the buffer's units.
 * @returns the number of sweeps taken at this resolution.
 *
 * THE STARTING GUESS IS THE SAME PROBLEM ON A COARSER GRID, which heal.c's own
 * notes name as what it is missing ("It could benefit from a multi-grid
 * evaluation of an initial solution before the main iteration loop") and which
 * Perez, Gangnet and Blake list beside SOR. A cell of the half-size grid is
 * unknown when all four of its pixels are, and otherwise holds the mean of its
 * known ones; that grid is solved the same way (recursively), and its answer,
 * interpolated, is where the full-size sweeps begin. The sweeps then run to
 * darktable's stopping rule exactly as they would from any other start, so the
 * answer is the same membrane — what changes is that the smooth part of it no
 * longer has to diffuse in from the rim one pixel a sweep, which is what made a
 * spot of the largest size take seconds at native resolution.
 *
 * A neighbour outside the rect does not exist (a spot at the frame's edge):
 * the update divides by the neighbours there are, as heal.c does at a stamp's
 * edge.
 */
function laplaceFill(D: Float32Array, dom: Uint8Array, rw: number, rh: number, eps: number): number {
  let nRed = 0, nBlack = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) if (dom[y * rw + x]) { if ((x + y) & 1) nRed++; else nBlack++; }
  const n = nRed + nBlack;
  if (!n) return 0;
  const red = new Int32Array(nRed), black = new Int32Array(nBlack);
  nRed = 0; nBlack = 0;
  for (let y = 0; y < rh; y++) for (let x = 0; x < rw; x++) {
    const i = y * rw + x;
    if (dom[i]) { if ((x + y) & 1) red[nRed++] = i; else black[nBlack++] = i; }
  }
  if (n > COARSE_MIN && rw >= 8 && rh >= 8) {
    // THE HALF-SIZE PROBLEM: unknown where all four children are unknown,
    // otherwise the mean of the known children.
    const cw = (rw + 1) >> 1, ch = (rh + 1) >> 1;
    const Dc = new Float32Array(cw * ch * 3), domc = new Uint8Array(cw * ch);
    for (let Y = 0; Y < ch; Y++) for (let X = 0; X < cw; X++) {
      let k = 0, s0 = 0, s1 = 0, s2 = 0;
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const x = 2 * X + i, y = 2 * Y + j;
        if (x >= rw || y >= rh) continue;
        const p = y * rw + x;
        if (dom[p]) continue;
        s0 += D[p * 3]; s1 += D[p * 3 + 1]; s2 += D[p * 3 + 2]; k++;
      }
      const c = Y * cw + X;
      if (k) { Dc[c * 3] = s0 / k; Dc[c * 3 + 1] = s1 / k; Dc[c * 3 + 2] = s2 / k; } else domc[c] = 1;
    }
    laplaceFill(Dc, domc, cw, ch, eps);
    // Bilinear from the coarse grid, cell centres at 2X + 0.5.
    for (let y = 0; y < rh; y++) {
      const fy = Math.min(ch - 1, Math.max(0, (y - 0.5) / 2));
      const y0 = Math.floor(fy), y1 = Math.min(ch - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < rw; x++) {
        const p = y * rw + x;
        if (!dom[p]) continue;
        const fx = Math.min(cw - 1, Math.max(0, (x - 0.5) / 2));
        const x0 = Math.floor(fx), x1 = Math.min(cw - 1, x0 + 1), tx = fx - x0;
        const a = (y0 * cw + x0) * 3, b = (y0 * cw + x1) * 3, c = (y1 * cw + x0) * 3, d = (y1 * cw + x1) * 3;
        for (let k = 0; k < 3; k++) {
          D[p * 3 + k] = (Dc[a + k] * (1 - tx) + Dc[b + k] * tx) * (1 - ty) + (Dc[c + k] * (1 - tx) + Dc[d + k] * tx) * ty;
        }
      }
    }
  } else {
    // Small enough to start from the mean of everything known.
    let m0 = 0, m1 = 0, m2 = 0, mc = 0;
    for (let p = 0; p < rw * rh; p++) if (!dom[p]) { m0 += D[p * 3]; m1 += D[p * 3 + 1]; m2 += D[p * 3 + 2]; mc++; }
    if (mc) { m0 /= mc; m1 /= mc; m2 /= mc; }
    for (let p = 0; p < rw * rh; p++) if (dom[p]) { D[p * 3] = m0; D[p * 3 + 1] = m1; D[p * 3 + 2] = m2; }
  }
  // heal.c: w = (2 - 1/(0.1575 sqrt(n) + 0.8)) / 4, applied to (a*D - sum).
  const w = (2 - 1 / (0.1575 * Math.sqrt(n) + 0.8)) * 0.25;
  const errExit = eps * eps * w * w;
  const sweep = (list: Int32Array): number => {
    let err = 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = i % rw, y = (i - x) / rw;
      let a = 0, s0 = 0, s1 = 0, s2 = 0;
      if (x > 0) { const j = (i - 1) * 3; s0 += D[j]; s1 += D[j + 1]; s2 += D[j + 2]; a++; }
      if (x < rw - 1) { const j = (i + 1) * 3; s0 += D[j]; s1 += D[j + 1]; s2 += D[j + 2]; a++; }
      if (y > 0) { const j = (i - rw) * 3; s0 += D[j]; s1 += D[j + 1]; s2 += D[j + 2]; a++; }
      if (y < rh - 1) { const j = (i + rw) * 3; s0 += D[j]; s1 += D[j + 1]; s2 += D[j + 2]; a++; }
      const o = i * 3;
      const d0 = w * (a * D[o] - s0), d1 = w * (a * D[o + 1] - s1), d2 = w * (a * D[o + 2] - s2);
      D[o] -= d0; D[o + 1] -= d1; D[o + 2] -= d2;
      err += d0 * d0 + d1 * d1 + d2 * d2;
    }
    return err;
  };
  let it = 0;
  while (it < MAX_ITER) {
    const err = sweep(black) + sweep(red);
    it++;
    if (err < errExit) break;
  }
  return it;
}

/**
 * Every spot's composite, in list order, from a pristine reader.
 *
 * @param read the pristine source.
 * @param W    the source's width.
 * @param H    the source's height.
 * @param spots the edit's spots.
 * @param eps  the solve's tolerance (EPS_BYTES or EPS_LINEAR).
 * @param hi   the top of the buffer's range: 255 for gamma bytes, Infinity for
 *             linear light, which has no ceiling here.
 * @returns one layer per spot: its rect, holding the composite after it.
 *
 * SOURCES ALWAYS READ THE PRISTINE PICTURE, as they always have; what a spot
 * lands ON is the composite so far, so a heal whose rim crosses an earlier
 * spot meets that spot's healed pixels rather than the dust under them —
 * darktable applies its shapes the same way, one after another. Within each
 * layer: before + (source + D - before) * weight, D the Laplace correction for
 * a heal and zero for a clone; at weight 1 that is exactly the healed patch,
 * and the feather blends it as darktable blends its heal by the mask.
 *
 * EVERY COMPOSITE IS HELD TO 0..hi. A clone is a convex mix of two values the
 * buffer already holds and cannot leave its range; a heal adds the correction,
 * and a source pixel already near either end goes past it — a speck of 250 on
 * a source 50 darker than the surround wants 300. Unheld, the preview's
 * Uint8Array WRAPPED it (300 stored as 44, a black speck where the heal meant
 * white) while the export lifted 300 to linear 1.45, and a linear source went
 * below zero, a value no sensor records (measured in review, 2026-10-02).
 *
 * What it holds: the layers (12 bytes a pixel, which healPatchBytes bills as
 * the patches, because they are), and one spot's working set at a time
 * (HEAL_SOLVE_BYTES_PX).
 */
function healLayers(read: PxReader, W: number, H: number, spots: readonly HealSpot[], eps: number, hi: number): HealLayer[] {
  const sp = toPx(spots, W, H);
  const layers: HealLayer[] = [];
  const t = new Float64Array(3);
  for (let k = 0; k < spots.length; k++) {
    const s = sp[k];
    const rect = spotRect(spots[k], W, H);
    const rw = rect.w, rh = rect.h, n = rw * rh;
    const before = new Float32Array(n * 3);
    const src = new Float32Array(n * 3);
    const wgt = new Float32Array(n);
    for (let y = 0; y < rh; y++) {
      const py = rect.y0 + y;
      for (let x = 0; x < rw; x++) {
        const px = rect.x0 + x;
        const i = y * rw + x;
        // The composite so far: the latest earlier layer holding this pixel.
        let got = false;
        for (let j = k - 1; j >= 0 && !got; j--) {
          const L = layers[j];
          if (px >= L.x0 && px < L.x0 + L.w && py >= L.y0 && py < L.y0 + L.h) {
            const o = ((py - L.y0) * L.w + (px - L.x0)) * 3;
            before[i * 3] = L.data[o]; before[i * 3 + 1] = L.data[o + 1]; before[i * 3 + 2] = L.data[o + 2];
            got = true;
          }
        }
        if (!got) { read(px, py, t); before[i * 3] = t[0]; before[i * 3 + 1] = t[1]; before[i * 3 + 2] = t[2]; }
        read(clampI(px + s.offX, W - 1), clampI(py + s.offY, H - 1), t);
        src[i * 3] = t[0]; src[i * 3 + 1] = t[1]; src[i * 3 + 2] = t[2];
        wgt[i] = weightAt(s, px, py);
      }
    }
    const data = new Float32Array(n * 3);
    let D: Float32Array | null = null;
    if (s.heal) {
      // Boundary: destination minus source wherever the spot does not reach.
      D = new Float32Array(n * 3);
      const dom = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        if (wgt[i] > 0) { dom[i] = 1; continue; }
        const o = i * 3;
        D[o] = before[o] - src[o]; D[o + 1] = before[o + 1] - src[o + 1]; D[o + 2] = before[o + 2] - src[o + 2];
      }
      laplaceFill(D, dom, rw, rh, eps);
    }
    for (let i = 0; i < n; i++) {
      const w = wgt[i];
      for (let c = 0; c < 3; c++) {
        const o = i * 3 + c;
        const b = before[o];
        if (w > 0) {
          const v = b + (src[o] + (D ? D[o] : 0) - b) * w;
          data[o] = v < 0 ? 0 : v > hi ? hi : v;
        } else data[o] = b;
      }
    }
    layers.push({ ...rect, data });
  }
  return layers;
}

/** The final composite at one pixel: the latest layer holding it, else the
 *  pristine reader. Writes `out`; returns nothing. */
function finalAt(layers: readonly HealLayer[], read: PxReader, px: number, py: number, out: Float64Array): void {
  for (let j = layers.length - 1; j >= 0; j--) {
    const L = layers[j];
    if (px >= L.x0 && px < L.x0 + L.w && py >= L.y0 && py < L.y0 + L.h) {
      const o = ((py - L.y0) * L.w + (px - L.x0)) * 3;
      out[0] = L.data[o]; out[1] = L.data[o + 1]; out[2] = L.data[o + 2];
      return;
    }
  }
  read(px, py, out);
}

/** ONE SOLVE PER CHANGE, NOT PER RECT. The preview re-bakes every rect a change
 *  touched (main.ts), each through the same spot list, and the layers are the
 *  same for all of them — so the caller may hand every bake of one pass the same
 *  cache. It belongs to that pass and no longer: the pristine buffer is
 *  rewritten in place when the lens correction moves (main.ts bringLensTo), so
 *  a cache kept across passes against the buffer would heal from old pixels. */
export interface HealCache {
  /** What the layers were solved for; private to heal.ts. */
  key?: string;
  layers?: unknown;
}
function cachedLayers(cache: HealCache | undefined, W: number, H: number, spots: readonly HealSpot[], read: PxReader, eps: number, hi: number): HealLayer[] {
  if (!cache) return healLayers(read, W, H, spots, eps, hi);
  const key = `${W}x${H}|${eps}|${hi}|${JSON.stringify(spots)}`;
  if (cache.key === key && cache.layers) return cache.layers as HealLayer[];
  const layers = healLayers(read, W, H, spots, eps, hi);
  cache.key = key;
  cache.layers = layers;
  return layers;
}

/**
 * Bake a rect of HEALED 8-bit RGBA from pristine gamma bytes. Returns a tightly
 * packed RGBA patch (for texSubImage2D and for the export's patch overlay).
 *
 * @param src   the pristine RGBA bytes.
 * @param W     their width.
 * @param H     their height.
 * @param spots the edit's spots, in order.
 * @param rect  the rect to bake.
 * @param cache optional, shared by every bake of one pass (see HealCache).
 * @returns rect.w x rect.h RGBA bytes, alpha copied from the source.
 *
 * What the result must satisfy: accumulated in float across overlapping spots
 * and quantised ONCE at the end — the export quantises the same layers the same
 * way (healPatches8), so both paths stay bit-identical. A Clone spot composites
 * as every spot did before heals carried the Laplace correction.
 */
export function bakeRgba8(
  src: Uint8ClampedArray,
  W: number,
  H: number,
  spots: readonly HealSpot[],
  rect: Rect,
  cache?: HealCache,
): Uint8Array {
  const read: PxReader = (x, y, o) => { const i = (y * W + x) * 4; o[0] = src[i]; o[1] = src[i + 1]; o[2] = src[i + 2]; };
  const layers = cachedLayers(cache, W, H, spots, read, EPS_BYTES, 255);
  const out = new Uint8Array(rect.w * rect.h * 4);
  const t = new Float64Array(3);
  for (let y = 0; y < rect.h; y++) {
    const py = rect.y0 + y;
    for (let x = 0; x < rect.w; x++) {
      const px = rect.x0 + x;
      finalAt(layers, read, px, py, t);
      const o = (y * rect.w + x) * 4;
      out[o] = Math.round(t[0]);
      out[o + 1] = Math.round(t[1]);
      out[o + 2] = Math.round(t[2]);
      out[o + 3] = src[(py * W + px) * 4 + 3];
    }
  }
  return out;
}

/**
 * Bake a rect of HEALED linear-float RGBA from a pristine linear buffer (the
 * RAW preview texture).
 *
 * @param src   the pristine linear RGBA, float32 or half-float bits.
 * @param W     its width.
 * @param H     its height.
 * @param spots the edit's spots, in order.
 * @param rect  the rect to bake.
 * @param cache optional, shared by every bake of one pass (see HealCache).
 * @returns rect.w x rect.h RGBA floats, alpha copied from the source.
 *
 * What the result must satisfy: f32-rounded exactly like the RGBA32F texture
 * upload, and the same arithmetic healPatchesFromSampler runs at full
 * resolution, so the export mirrors it within float epsilon at equal sizes.
 */
export function bakeRgbaF32(
  src: Float32Array | Uint16Array,
  W: number,
  H: number,
  spots: readonly HealSpot[],
  rect: Rect,
  cache?: HealCache,
): Float32Array {
  // THE PRISTINE BUFFER MAY BE HALF-FLOAT NOW — the editor's working copy holds
  // a whole photograph at native resolution, which is affordable in half
  // precision and not in float32. Only how a value is fetched changes.
  const at: (i: number) => number = src instanceof Uint16Array
    ? (i) => fromHalf((src as Uint16Array)[i])
    : (i) => (src as Float32Array)[i];
  const read: PxReader = (x, y, o) => { const i = (y * W + x) * 4; o[0] = at(i); o[1] = at(i + 1); o[2] = at(i + 2); };
  const layers = cachedLayers(cache, W, H, spots, read, EPS_LINEAR, Infinity);
  const out = new Float32Array(rect.w * rect.h * 4);
  const t = new Float64Array(3);
  for (let y = 0; y < rect.h; y++) {
    const py = rect.y0 + y;
    for (let x = 0; x < rect.w; x++) {
      const px = rect.x0 + x;
      finalAt(layers, read, px, py, t);
      const o = (y * rect.w + x) * 4;
      out[o] = Math.fround(t[0]);
      out[o + 1] = Math.fround(t[1]);
      out[o + 2] = Math.fround(t[2]);
      out[o + 3] = at((py * W + px) * 4 + 3);
    }
  }
  return out;
}

// --- Export-side overlay: healed patches over a linear sampler ---------------

export type Rgb = [number, number, number];
/** See LinearSampler in raw/denoise — the returned array may be reused by the
 *  next call, so every reader here takes the numbers out at once. */
export type Sampler = (x: number, y: number) => ArrayLike<number>;

export interface HealPatch extends Rect {
  /** Linear RGB, 3 floats per pixel, row-major within the rect. */
  data: Float32Array;
}

/**
 * Healed patches for a full-res 8-bit source: the SAME quantized bytes the
 * preview bakes (bakeRgba8), lifted to linear with the caller's transfer
 * function — so the CPU export reads exactly what the GPU texture holds.
 *
 * @param pixels   the pristine RGBA bytes.
 * @param W        their width.
 * @param H        their height.
 * @param spots    the edit's spots.
 * @param toLinear the transfer function the export decodes bytes with.
 * @returns one patch per spot, for wrapWithPatches: patch k holds the
 *          composite after spot k over its rect, so the LATEST patch holding a
 *          pixel holds that pixel's final composite — the value bakeRgba8
 *          quantises there.
 *
 * What it holds: the layers, converted to linear IN PLACE once every spot has
 * been solved, so a bake never keeps the composite twice (healPatchBytes).
 */
export function healPatches8(
  pixels: Uint8ClampedArray,
  W: number,
  H: number,
  spots: readonly HealSpot[],
  toLinear: (v: number) => number,
): HealPatch[] {
  const read: PxReader = (x, y, o) => { const i = (y * W + x) * 4; o[0] = pixels[i]; o[1] = pixels[i + 1]; o[2] = pixels[i + 2]; };
  const layers = healLayers(read, W, H, spots, EPS_BYTES, 255);
  for (const L of layers) {
    const d = L.data;
    for (let o = 0; o < d.length; o++) d[o] = toLinear(Math.round(d[o]));
  }
  return layers;
}

/**
 * Healed patches computed through a linear sampler (the RAW export path, where
 * the full-res image only exists as an on-demand demosaic). Mirrors
 * bakeRgbaF32: same layers, same arithmetic, f32 like the preview texture.
 *
 * @param sample the pristine linear sampler.
 * @param W      the source's width.
 * @param H      the source's height.
 * @param spots  the edit's spots.
 * @returns one patch per spot, for wrapWithPatches: the layers themselves —
 *          patch k holds the composite after spot k over its rect, so the
 *          LATEST patch holding a pixel holds that pixel's final composite,
 *          which is what bakeRgbaF32 writes there.
 */
export function healPatchesFromSampler(
  sample: Sampler,
  W: number,
  H: number,
  spots: readonly HealSpot[],
): HealPatch[] {
  const read: PxReader = (x, y, o) => { const q = sample(x, y); o[0] = q[0]; o[1] = q[1]; o[2] = q[2]; };
  return healLayers(read, W, H, spots, EPS_LINEAR, Infinity);
}

/**
 * Wrap a linear sampler so pixels inside a healed patch read the patch.
 * Row-bucketed so the common pixel (no spot anywhere near) pays one array read.
 */
export function wrapWithPatches(sample: Sampler, patches: HealPatch[], H: number): Sampler {
  if (!patches.length) return sample;
  const rows: HealPatch[][] = new Array(H);
  for (const p of patches) {
    for (let y = p.y0; y < p.y0 + p.h && y < H; y++) (rows[y] ??= []).push(p);
  }
  return (x, y) => {
    const cy = clampI(y, H - 1);
    const bucket = rows[cy];
    if (bucket) {
      // THE LATEST PATCH HOLDING THE PIXEL WINS, and it must: patch k holds the
      // composite after spot k, so only the last one over a pixel holds what
      // every spot made of it (healLayers).
      for (let i = bucket.length - 1; i >= 0; i--) {
        const p = bucket[i];
        const cx = x < p.x0 ? -1 : x >= p.x0 + p.w ? -1 : x;
        if (cx >= 0) {
          const o = ((cy - p.y0) * p.w + (cx - p.x0)) * 3;
          return [p.data[o], p.data[o + 1], p.data[o + 2]];
        }
      }
    }
    return sample(x, y);
  };
}

// --- Auto source pick: the "best clean patch a short search away" ------------

/** Luma accessor over either preview buffer shape (gamma bytes or linear). */
export function lumaAccessor(
  src: { pixels?: Uint8ClampedArray; linear?: Float32Array; linear16?: Uint16Array },
  W: number,
): (x: number, y: number) => number {
  if (src.linear16 && !src.linear) {
    const l16 = src.linear16;
    return (x, y) => {
      const i = (y * W + x) * 4;
      return 255 * Math.sqrt(Math.max(0, fromHalf(l16[i]) * 0.2126 + fromHalf(l16[i + 1]) * 0.7152 + fromHalf(l16[i + 2]) * 0.0722));
    };
  }
  if (src.pixels) {
    const p = src.pixels;
    return (x, y) => {
      const i = (y * W + x) * 4;
      return (p[i] * 54 + p[i + 1] * 183 + p[i + 2] * 19) >> 8;
    };
  }
  const l = src.linear!;
  // sqrt ≈ perceptual: linear IR data is wildly skewed, and a linear-domain SAD
  // would let a few bright pixels dominate the match.
  return (x, y) => {
    const i = (y * W + x) * 4;
    return 255 * Math.sqrt(Math.max(0, l[i] * 0.2126 + l[i + 1] * 0.7152 + l[i + 2] * 0.0722));
  };
}

/**
 * Pick the clone source for a spot at (cx,cy), radius rPx (all in pixels of the
 * given buffer): search a ring of candidate offsets and score each by how well
 * the candidate's SURROUND matches the destination's surround (the annulus just
 * outside the spot — the spot itself holds the defect, so it can't vote), plus
 * a smoothness penalty inside the candidate disc (don't clone an edge onto a
 * sky). Returns the offset in PIXELS, or null when nothing usable fits.
 */
export function findHealSource(
  luma: (x: number, y: number) => number,
  W: number,
  H: number,
  cx: number,
  cy: number,
  rPx: number,
): { offX: number; offY: number } | null {
  const step = Math.max(1, Math.round(rPx / 4));
  // Sample offsets: annulus ring (match surround) + inner disc (smoothness).
  const ring: [number, number][] = [];
  const disc: [number, number][] = [];
  const R = Math.ceil(rPx * 1.5);
  for (let dy = -R; dy <= R; dy += step) {
    for (let dx = -R; dx <= R; dx += step) {
      const d = Math.hypot(dx, dy) / rPx;
      if (d > 1.05 && d <= 1.5) ring.push([dx, dy]);
      else if (d <= 0.9) disc.push([dx, dy]);
    }
  }
  if (!ring.length || !disc.length) return null;
  const inBounds = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H;
  // Destination surround values (skip out-of-frame samples symmetrically).
  const destRing = ring.map(([dx, dy]) => (inBounds(cx + dx, cy + dy) ? luma(cx + dx, cy + dy) : NaN));

  let best: { offX: number; offY: number; score: number } | null = null;
  const ANGLES = 16;
  for (const mult of [2.4, 3.4, 4.6]) {
    const dist = rPx * mult;
    for (let a = 0; a < ANGLES; a++) {
      const ang = (a / ANGLES) * Math.PI * 2;
      const offX = Math.round(Math.cos(ang) * dist);
      const offY = Math.round(Math.sin(ang) * dist);
      const sx = cx + offX;
      const sy = cy + offY;
      // The whole candidate disc must be in frame (its ring may clip).
      if (!inBounds(sx - rPx, sy - rPx) || !inBounds(sx + rPx, sy + rPx)) continue;
      // Surround match: SAD over the annulus.
      let sad = 0;
      let n = 0;
      for (let i = 0; i < ring.length; i++) {
        const dv = destRing[i];
        if (Number.isNaN(dv)) continue;
        const [dx, dy] = ring[i];
        if (!inBounds(sx + dx, sy + dy)) continue;
        sad += Math.abs(luma(sx + dx, sy + dy) - dv);
        n++;
      }
      if (n < ring.length * 0.6) continue; // too clipped to judge
      // Candidate smoothness: mean abs deviation inside the disc.
      let mean = 0;
      for (const [dx, dy] of disc) mean += luma(sx + dx, sy + dy);
      mean /= disc.length;
      let dev = 0;
      for (const [dx, dy] of disc) dev += Math.abs(luma(sx + dx, sy + dy) - mean);
      dev /= disc.length;
      const score = sad / n + dev * 0.75;
      if (!best || score < best.score) best = { offX, offY, score };
    }
  }
  return best && { offX: best.offX, offY: best.offY };
}

// --- Auto-detect: dust blobs on a luminance high-pass, smooth regions only ---

export interface DetectedSpot {
  x: number; // pixel centre
  y: number;
  rPx: number;
  strength: number;
}

/**
 * Find dust-like blobs on a THREE-LEVEL PYRAMID: the full plane for small
 * sharp motes and hot pixels, and 2×/4× downsampled planes (dark-only) for
 * the big soft smudges real sensor dust makes at small apertures — the
 * owner's obvious spot measured rBlob ≈ 50-80 preview px at ~6% depth, far
 * beyond anything a full-res pass can hold in its high-pass. Downsampling
 * turns a huge faint smudge into a small strong blob (and averages noise
 * down), so each level runs the SAME cheap pass.
 *
 * Specificity comes from PER-BLOB tests, not global thresholds (a global
 * noise floor reads scene TEXTURE on a busy frame — it inflated the
 * threshold ~15× over the real smudge on the owner's lakeside NEF):
 *  - dust is ROUND: eccentricity from the blob's second moments rejects twig
 *    fragments and bark striations (which ring tests miss when the twig is
 *    isolated against sky);
 *  - dust STANDS OUT of a calm surround: the blob's peak must clear the
 *    ring's own roughness by a healthy factor (local SNR) — texture specks
 *    sit barely above their busy surround, a faint smudge towers over quiet
 *    sky;
 *  - the ring itself must be MOSTLY calm (majority rule, not every-sample —
 *    a big smudge's ring legitimately clips the odd ripple or branch).
 * Classical only: box-blur high-pass, flood-fill, moments.
 */
export function detectSpots(
  luma: (x: number, y: number) => number,
  W: number,
  H: number,
  opts: { maxSpots?: number; maxRadiusPx?: number } = {},
): DetectedSpot[] {
  const maxSpots = opts.maxSpots ?? 40;
  const fineR = opts.maxRadiusPx ?? Math.max(6, Math.round(W * 0.008));
  const L1 = new Float32Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) L1[y * W + x] = luma(x, y);
  const [L2, W2, H2] = downsample2(L1, W, H);
  const [L4, W4, H4] = downsample2(L2, W2, H2);
  // BUSY MAP (the owner's uniform-area rule, 2026-07-14, as load-bearing
  // structure): gradient-magnitude outliers over the frame's calm-area grain.
  // Gradients are purely local (no blur halo), light up twigs/bark/sparkle,
  // and stay blind to a soft smudge's shallow ramp. ABSOLUTE bar: the luma
  // planes are sqrt-encoded, so sensor noise is variance-stabilized — a
  // relative bar made dark sky read 10× busier than bright ice.
  const busy1 = new Float32Array(W * H);
  {
    const grad = new Float32Array(W * H);
    for (let y = 0; y < H - 1; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = y * W + x;
        grad[i] = Math.abs(L1[i + 1] - L1[i]) + Math.abs(L1[i + W] - L1[i]);
      }
    }
    const sample: number[] = [];
    for (let i = 0; i < grad.length; i += 97) sample.push(grad[i]);
    sample.sort((a, b) => a - b);
    const noiseRef = sample[Math.floor(sample.length * 0.25)] || 0.5;
    const busyPix = Math.max(2, 4 * noiseRef);
    for (let i = 0; i < grad.length; i++) busy1[i] = grad[i] > busyPix ? 1 : 0;
  }
  // Downsampling the busy map gives per-block busy DENSITY at each level.
  const [B2] = downsample2(busy1, W, H);
  const [B4] = downsample2(B2, W2, H2);
  // The high-pass blur must sit ~2× ABOVE the level's largest target blob or
  // it tracks the blob and erases it from its own high-pass (measured twice:
  // 20-24px smudges at blurR≈maxR never crossed threshold; the same failure
  // returned at the top of each pyramid level's size band).
  const base = { blurR: Math.max(6, fineR * 2), maxR: fineR };
  const out: DetectedSpot[] = [
    // Fine, full res: sharp motes + hot pixels. The only pass that accepts
    // (tiny) BRIGHT blobs, and the only one with a σ-scaled threshold.
    ...detectPass(L1, W, H, { ...base, floor: 0.035, sigmaK: 6, darkOnly: false, minN: 3, compact: 1.1, ecc: 2.6, snr: 1.5, busyFrac: 0.06 }).map(scaleSpot(1)),
    // Mid (2×) and coarse (4×): soft dark smudges. Fixed floors — the
    // per-blob tests carry the specificity. The floors sit just under HALF
    // the depth of the owner's real smudge (~4.5-5%): low enough for real
    // dust with margin, high enough that the ~2% compression mottle in
    // smooth JPEG skies (invisible to the eye) stays un-flagged.
    // The smudge passes seed AND grow only through calm blocks (growable):
    // on a busy frame the canopy's wide-blur halo is one giant connected
    // over-threshold region that bled across the sky and swallowed smudge
    // seeds into rejected mega-blobs. Busy country is a wall now. (The fine
    // pass stays ungated — a sharp mote's own edges are busy pixels, and its
    // σ-scaled threshold already keeps seeds rare on busy frames.)
    ...detectPass(L2, W2, H2, { ...base, floor: 0.03, sigmaK: 0, darkOnly: true, minN: 6, compact: 0.9, ecc: 2.2, snr: 1.5, busyFrac: 0.2, growable: B2 }).map(scaleSpot(2)),
    ...detectPass(L4, W4, H4, { ...base, floor: 0.028, sigmaK: 0, darkOnly: true, minN: 6, compact: 0.9, ecc: 2.2, snr: 1.5, busyFrac: 0.25, growable: B4 }).map(scaleSpot(4)),
  ];
  // Strengths are peak-over-floor ratios, so the sort is scale-comparable.
  // Drop near-duplicates (the same mote seen at two levels, or two blobs of
  // one big smudge), keeping the strongest.
  out.sort((a, b) => b.strength - a.strength);
  let kept: DetectedSpot[] = [];
  for (const s of out) {
    if (kept.some((k) => Math.hypot(k.x - s.x, k.y - s.y) < (k.rPx + s.rPx) * 0.9)) continue;
    kept.push(s);
  }
  // DUST DOESN'T SWARM: finds packed tightly together are a shimmering
  // surface (the owner's lake pushed ~30 sparkle blobs from one patch of
  // water — and their sheer count then made the crowd rule below execute the
  // real smudge). Drop any find with more than 3 neighbours nearby. This
  // runs on the RAW merged set — pruning by any other test first thins a
  // swarm below the neighbour bound and lets its survivors through.
  const clusterR = W * 0.05;
  kept = kept.filter((s) => kept.filter((k) => k !== s && Math.hypot(k.x - s.x, k.y - s.y) < clusterR).length <= 3);
  // The uniform-area rule, applied at FULL RESOLUTION to every find from
  // every level (downsampling averages thin branches into invisibility, so
  // the coarse passes seeded on a bramble junction the eye reads instantly).
  // The statistic is BUSY-PIXEL DENSITY: a pixel is busy when its high-pass
  // deviation clears a noise-scaled bar (the frame's own calm-sky grain sets
  // the bar — a dark RAW's sky is far noisier than a teaching JPEG's); a
  // region is uniform when almost none of its pixels are busy. Density
  // COUNTS sparse structure that averages hide: two 2px twigs barely move a
  // 67px window's mean deviation (measured 0.013 — "uniform") yet every twig
  // pixel is an outlier the density sees. A soft dust smudge's shallow
  // gradient never clears a noise bar, so it stays invisible to its own test.
  {
    // Small window on purpose: the ring below must clear the find itself by
    // winR + rPx, and a wide window pushed that ring out of narrow sky bands
    // (recall died on a thin strip of sky over forest — twice, at two window
    // sizes). A twig crossing an 11px window still lights ~18% of it — far
    // over the 3% calm bound; sky noise stays well under 1%.
    const winR = 5;
    const density = boxBlur(busy1, W, H, winR);
    const calm = (x: number, y: number) =>
      density[Math.min(H - 1, Math.max(0, Math.round(y))) * W + Math.min(W - 1, Math.max(0, Math.round(x)))] < 0.03;
    kept = kept.filter((s) => {
      // Ring-only, and far enough out that the density window can't see the
      // find itself — a sharp mote's own pixels are legitimately busy (they
      // ARE the defect) and a closer test made every planted mote fail its
      // own calmness. A twig fragment still fails: the twig CONTINUES into
      // the ring windows; dust just... stops.
      // 1.3× + margin: a sharp mote's busy EDGE annulus reaches past rPx,
      // and windows that graze it cost ~2.5% density — right at the bound
      // (the strongest planted mote kept losing itself by one ring point).
      const ringDist = s.rPx * 1.3 + winR + 4;
      let ok = 0;
      for (let a = 0; a < 8; a++) {
        const ang = (a / 8) * Math.PI * 2;
        if (calm(s.x + Math.cos(ang) * ringDist, s.y + Math.sin(ang) * ringDist)) ok++;
      }
      return ok >= 7;
    });
  }
  // A sensor carries a handful of motes; a CROWD of similar-strength "finds"
  // is the frame's own noise floor pretending to be dust (the magenta D5300
  // sky mottle produced 40 of them). When the scan comes back crowded, keep
  // only clear outliers standing well above that crowd.
  if (kept.length > 15) {
    const med = [...kept].sort((a, b) => a.strength - b.strength)[kept.length >> 1].strength;
    kept = kept.filter((k) => k.strength >= med * 1.8);
  }
  return kept.slice(0, maxSpots);
}

/** 2× box downsample (mean of each 2×2). */
function downsample2(src: Float32Array, W: number, H: number): [Float32Array, number, number] {
  const w = W >> 1, h = H >> 1;
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * 2) * W + x * 2;
      out[y * w + x] = (src[i] + src[i + 1] + src[i + W] + src[i + W + 1]) * 0.25;
    }
  }
  return [out, w, h];
}

/** Map a pass's blob back to full-plane coordinates. */
function scaleSpot(k: number): (s: DetectedSpot) => DetectedSpot {
  return (s) => ({ x: s.x * k + (k - 1) / 2, y: s.y * k + (k - 1) / 2, rPx: s.rPx * k, strength: s.strength });
}

interface PassOpts {
  blurR: number;
  maxR: number;
  floor: number;
  /** 0 = fixed floor; otherwise floor rises to sigmaK × median |high-pass|. */
  sigmaK: number;
  darkOnly: boolean;
  minN: number;
  compact: number;
  /** Max blob eccentricity (major/minor axis ratio) — dust is round. */
  ecc: number;
  /** Blob peak must be ≥ snr × the ring's own roughness (its MAD). */
  snr: number;
  /** Max fraction of ring samples allowed to be busy (majority-calm rule). */
  busyFrac: number;
  /** Per-block busy density at this level; blocks ≥ 0.25 are walls the flood
   *  fill neither seeds in nor grows through. */
  growable?: Float32Array;
}

function detectPass(L: Float32Array, W: number, H: number, o: PassOpts): DetectedSpot[] {
  const { blurR, maxR, minN } = o;
  // Background estimate. The dark smudge passes use a BOTTOM-HAT (morphological
  // closing): it erases any dark blob smaller than its window from the
  // background — no matter how faint — yet FOLLOWS brightness boundaries. A
  // mean blur does neither: it tracks big smudges out of their own high-pass,
  // and near a bright treeline it painted a whole narrow sky band
  // over-threshold, one giant connected region that swallowed every smudge
  // seed (the third such boundary failure in tuning; the closing ends them).
  // The fine pass keeps the mean blur: its σ-scaled threshold is calibrated
  // to it, and sharp motes are far above any halo.
  const blur = o.darkOnly ? morphClose(L, W, H, maxR + 2) : boxBlur(boxBlur(L, W, H, blurR), W, H, blurR);
  const hp = new Float32Array(W * H);
  for (let i = 0; i < L.length; i++) hp[i] = (L[i] - blur[i]) / (blur[i] + 4);
  let thresh = o.floor;
  if (o.sigmaK > 0) {
    const sampleAbs: number[] = [];
    for (let i = 0; i < hp.length; i += 97) sampleAbs.push(Math.abs(hp[i]));
    sampleAbs.sort((a, b) => a - b);
    thresh = Math.max(o.sigmaK * (sampleAbs[sampleAbs.length >> 1] || 1e-4), o.floor);
  }
  // Ring test, applied to a finished blob: a DENSE ring of RAW luma just
  // outside it. Returns the ring's roughness (MAD of relative deviations) for
  // the SNR test, or null when the ring is too busy/clipped to be dust.
  const ringStats = (cx: number, cy: number, rBlob: number): number | null => {
    const ringR = rBlob * 2 + 3;
    const steps = Math.max(20, Math.round(Math.PI * ringR)); // ~2px spacing
    const vals: number[] = [];
    for (let a = 0; a < steps; a++) {
      const x = Math.round(cx + ringR * Math.cos((a / steps) * Math.PI * 2));
      const y = Math.round(cy + ringR * Math.sin((a / steps) * Math.PI * 2));
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      vals.push(L[y * W + x]);
    }
    if (vals.length < steps * 0.7) return null; // too clipped to judge
    const sorted = [...vals].sort((a, b) => a - b);
    const med = sorted[sorted.length >> 1];
    const devs = vals.map((v) => Math.abs(v - med) / (med + 4));
    const mad = [...devs].sort((a, b) => a - b)[devs.length >> 1];
    // Majority-calm: dust floats in a quiet surround. The busy bound is
    // ABSOLUTE on purpose — scaling it with the ring's own roughness lets a
    // busy surround excuse itself (measured on the owner's NEF: forest holes
    // ring 81-92% busy at 3.5%, the real smudge 0%; an adaptive bound passed
    // the forest). A fraction, not "every": a big smudge may legitimately
    // clip the odd ripple or branch.
    const busyBound = 0.035;
    let busy = 0;
    for (const d of devs) if (d > busyBound) busy++;
    if (busy > devs.length * o.busyFrac) return null;
    return mad;
  };
  // Flood-fill connected over-threshold pixels into blobs (4-connected),
  // accumulating second moments for the roundness test.
  const seen = new Uint8Array(W * H);
  const out: DetectedSpot[] = [];
  const stack: number[] = [];
  const blobPx: number[] = [];
  for (let y = 2; y < H - 2; y++) {
    for (let x = 2; x < W - 2; x++) {
      const i = y * W + x;
      if (seen[i] || Math.abs(hp[i]) < thresh) continue;
      if (o.growable && o.growable[i] >= 0.25) continue;
      const sign = Math.sign(hp[i]);
      let n = 0, peak = 0;
      stack.length = 0;
      blobPx.length = 0;
      stack.push(i);
      seen[i] = 1;
      while (stack.length) {
        const j = stack.pop()!;
        const jx = j % W;
        n++;
        blobPx.push(j);
        const a = Math.abs(hp[j]);
        if (a > peak) peak = a;
        if (n > maxR * maxR * 10) break; // runaway region — cap the walk
        for (const k of [j - 1, j + 1, j - W, j + W]) {
          const kx = k % W;
          if (k < 0 || k >= hp.length || seen[k] || Math.abs(kx - jx) > 1) continue;
          if (Math.abs(hp[k]) >= thresh * 0.55 && Math.sign(hp[k]) === sign && (!o.growable || o.growable[k] < 0.25)) {
            seen[k] = 1;
            stack.push(k);
          }
        }
      }
      // Measure size/shape from the HALF-PEAK CORE, not the grown skirt: the
      // wide smudge blur leaves a sprawling faint skirt above the growth
      // bound, and skirt-measured blobs blew past the size cap (and the
      // runaway cap) while their actual cores fit the level comfortably.
      const coreBar = Math.max(thresh * 0.55, peak * 0.45);
      let nC = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      let minX = x, maxX = x, minY = y, maxY = y;
      for (const j of blobPx) {
        if (Math.abs(hp[j]) < coreBar) continue;
        const jx = j % W, jy = (j / W) | 0;
        nC++;
        sx += jx; sy += jy;
        sxx += jx * jx; syy += jy * jy; sxy += jx * jy;
        if (jx < minX) minX = jx; if (jx > maxX) maxX = jx;
        if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
      }
      const n2 = nC;
      const w = maxX - minX + 1, h = maxY - minY + 1;
      const rBlob = Math.max(w, h) / 2;
      // Keep: dust-sized, roughly compact — and DARK, unless hot-pixel tiny:
      // sensor dust shadows the sensor, while the small BRIGHT things in a
      // sky are cloud wisps (real content — the teaching cloudscapes were
      // full of them, field-found 2026-07-14).
      if (n2 < minN || rBlob > maxR || n2 < rBlob * rBlob * o.compact) continue;
      if (sign > 0 && (o.darkOnly || rBlob > 2.5)) continue;
      // ROUND: eigen-ratio of the blob's covariance. Twig fragments and bark
      // striations are lines (high ratio) even when their surround is calm.
      const mx = sx / n2, my = sy / n2;
      const cxx = sxx / n2 - mx * mx + 0.25, cyy = syy / n2 - my * my + 0.25, cxy = sxy / n2 - mx * my;
      const tr = cxx + cyy, det = cxx * cyy - cxy * cxy;
      const disc = Math.sqrt(Math.max(0, tr * tr / 4 - det));
      const lMaj = tr / 2 + disc, lMin = Math.max(tr / 2 - disc, 1e-3);
      if (Math.sqrt(lMaj / lMin) > o.ecc) continue;
      const mad = ringStats(mx, my, rBlob);
      if (mad === null) continue;
      // LOCAL SNR: the blob must tower over its surround's own roughness —
      // texture specks sit barely above theirs (bark/water field-found on the
      // owner's NEF); a faint smudge over quiet sky clears easily.
      if (peak < Math.max(o.snr * mad, o.floor)) continue;
      out.push({ x: mx, y: my, rPx: Math.max(2, rBlob * 1.7), strength: peak / o.floor });
    }
  }
  return out;
}

/** Separable sliding-window extremum (monotonic deque), window 2r+1. */
function slideExtremum(src: Float32Array, W: number, H: number, r: number, mx: boolean): Float32Array {
  const out = new Float32Array(W * H);
  const tmp = new Float32Array(W * H);
  const idx = new Int32Array(Math.max(W, H));
  const better = mx ? (a: number, b: number) => a >= b : (a: number, b: number) => a <= b;
  // Horizontal.
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let head = 0, tail = 0;
    for (let x = 0; x < W + r; x++) {
      if (x < W) {
        const v = src[row + x];
        while (tail > head && better(v, src[row + idx[tail - 1]])) tail--;
        idx[tail++] = x;
      }
      const o = x - r;
      if (o >= 0) {
        while (idx[head] < o - r) head++;
        tmp[row + o] = src[row + idx[head]];
      }
    }
  }
  // Vertical.
  for (let x = 0; x < W; x++) {
    let head = 0, tail = 0;
    for (let y = 0; y < H + r; y++) {
      if (y < H) {
        const v = tmp[y * W + x];
        while (tail > head && better(v, tmp[idx[tail - 1] * W + x])) tail--;
        idx[tail++] = y;
      }
      const o = y - r;
      if (o >= 0) {
        while (idx[head] < o - r) head++;
        out[o * W + x] = tmp[idx[head] * W + x];
      }
    }
  }
  return out;
}

/** Morphological closing (dilate, then erode) with a square window. */
function morphClose(src: Float32Array, W: number, H: number, r: number): Float32Array {
  return slideExtremum(slideExtremum(src, W, H, r, true), W, H, r, false);
}

function boxBlur(src: Float32Array, W: number, H: number, r: number): Float32Array {
  const tmp = new Float32Array(W * H);
  const out = new Float32Array(W * H);
  const inv = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) {
    const row = y * W;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clampI(x, W - 1)];
    for (let x = 0; x < W; x++) {
      tmp[row + x] = acc * inv;
      acc += src[row + clampI(x + r + 1, W - 1)] - src[row + clampI(x - r, W - 1)];
    }
  }
  for (let x = 0; x < W; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clampI(y, H - 1) * W + x];
    for (let y = 0; y < H; y++) {
      out[y * W + x] = acc * inv;
      acc += tmp[clampI(y + r + 1, H - 1) * W + x] - tmp[clampI(y - r, H - 1) * W + x];
    }
  }
  return out;
}
