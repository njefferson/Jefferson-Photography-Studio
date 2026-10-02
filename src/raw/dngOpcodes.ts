// DNG opcode lists (DNG 1.7.1.0, chapter 7): the corrections a DNG says must be
// applied at three points of decoding. OpcodeList1 acts on the stored values,
// OpcodeList2 on the linearised, black-subtracted, 0..1 values before demosaic,
// OpcodeList3 on the demosaiced image. This file reads them, applies the ones
// the app implements at their own stage, and names the required ones it does
// not, so the reader is told rather than handed a photograph with a correction
// silently missing (a GainMap lens-shading map, a FixVignetteRadial vignette).
//
// Implemented: GainMap (9) and MapPolynomial (8) at every stage,
// FixVignetteRadial (3) at every stage, MapTable (7) on stored values. Not
// implemented: the warps (1, 2, 14), the bad-pixel fixes (4, 5), TrimBounds (6)
// and the per-row/column deltas and scales (10-13). An unimplemented opcode
// whose flags mark it optional is skipped as the spec allows; any other is
// reported by name. The parameter layouts are the spec's, read the way
// darktable's dng_opcode.c reads them (big-endian whatever the file's order),
// and GainMap is interpolated as darktable's rawprepare does it: pixel index
// over image size, bilinear, edges replicated.

/** One opcode as stored: its ID, its flag bits (bit 0 = optional), and its
 *  parameter area as a big-endian view. */
export interface Opcode {
  id: number;
  flags: number;
  params: DataView;
}

/** The area an opcode applies to (Top/Left/Bottom/Right, planes, pitches). */
interface Area {
  top: number;
  left: number;
  bottom: number;
  right: number;
  plane: number;
  planes: number;
  rowPitch: number;
  colPitch: number;
}

/** A GainMap's grid, ready to sample. */
interface GainGrid {
  area: Area;
  pointsV: number;
  pointsH: number;
  spacingV: number;
  spacingH: number;
  originV: number;
  originH: number;
  mapPlanes: number;
  gains: Float32Array;
}

/** The operations that run AFTER demosaic, per output pixel. Plain data, so a
 *  RawCfa carrying it can be posted to an export worker. */
export interface PostStage {
  /** The stage-3 image's size: the ActiveArea, before DefaultCrop. */
  stageW: number;
  stageH: number;
  /** Where the delivered frame's (0,0) sits in the stage-3 image. */
  ox: number;
  oy: number;
  /** OpcodeList3 operations, in file order. */
  ops: PostOp[];
  /** A 3x3 row-major matrix applied last, to camera values (the reference-
   *  camera transform of a ForwardMatrix profile; see color.ts). */
  matrix?: number[];
}

export type PostOp =
  | { kind: "gain"; grid: GainGrid }
  | { kind: "vignette"; k: number[]; cx: number; cy: number; m: number }
  | { kind: "poly"; area: Area; coef: number[] };

const NAMES: Record<number, string> = {
  1: "a lens distortion correction (WarpRectilinear)",
  2: "a fisheye correction (WarpFisheye)",
  3: "a vignetting correction (FixVignetteRadial)",
  4: "a bad-pixel fix (FixBadPixelsConstant)",
  5: "a bad-pixel fix (FixBadPixelsList)",
  6: "a trim of the image edges (TrimBounds)",
  7: "a value mapping table (MapTable)",
  8: "a value mapping curve (MapPolynomial)",
  9: "a lens-shading map (GainMap)",
  10: "a per-row offset (DeltaPerRow)",
  11: "a per-column offset (DeltaPerColumn)",
  12: "a per-row scale (ScalePerRow)",
  13: "a per-column scale (ScalePerColumn)",
  14: "a lens distortion correction (WarpRectilinear2)",
};

/**
 * Split an opcode list into its opcodes.
 * @param bytes  the value of OpcodeList1, 2 or 3 (tags 51008, 51009, 51022),
 *   or undefined when the file has none.
 * @returns the opcodes in file order; an empty list for an absent tag. A list
 *   whose sizes run past its own end stops at the last whole opcode, as
 *   darktable's reader does. Consumers: `applyStoredOps`, `buildPost`.
 */
export function parseOpcodeList(bytes: Uint8Array | undefined): Opcode[] {
  if (!bytes || bytes.length < 4) return [];
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint32(0, false);
  const out: Opcode[] = [];
  let p = 4;
  for (let i = 0; i < count && p + 16 <= bytes.length; i++) {
    const id = v.getUint32(p, false);
    const flags = v.getUint32(p + 8, false);
    const size = v.getUint32(p + 12, false);
    if (p + 16 + size > bytes.length) break;
    out.push({ id, flags, params: new DataView(bytes.buffer, bytes.byteOffset + p + 16, size) });
    p += 16 + size;
  }
  return out;
}

function readArea(d: DataView): Area {
  return {
    top: d.getUint32(0, false),
    left: d.getUint32(4, false),
    bottom: d.getUint32(8, false),
    right: d.getUint32(12, false),
    plane: d.getUint32(16, false),
    planes: d.getUint32(20, false),
    rowPitch: Math.max(1, d.getUint32(24, false)),
    colPitch: Math.max(1, d.getUint32(28, false)),
  };
}

function readGain(d: DataView): GainGrid {
  const area = readArea(d);
  // A grid of no points multiplies by nothing: one point of gain 1 is the same.
  const pointsV = Math.max(1, d.getUint32(32, false));
  const pointsH = Math.max(1, d.getUint32(36, false));
  const mapPlanes = Math.max(1, d.getUint32(72, false));
  const n = Math.min(pointsV * pointsH * mapPlanes, Math.max(0, Math.floor((d.byteLength - 76) / 4)));
  const gains = new Float32Array(Math.max(1, pointsV * pointsH * mapPlanes)).fill(1);
  for (let i = 0; i < n; i++) gains[i] = d.getFloat32(76 + i * 4, false);
  return {
    area, pointsV, pointsH, mapPlanes, gains,
    spacingV: d.getFloat64(40, false),
    spacingH: d.getFloat64(48, false),
    originV: d.getFloat64(56, false),
    originH: d.getFloat64(64, false),
  };
}

function readPoly(d: DataView): { area: Area; coef: number[] } {
  const area = readArea(d);
  const degree = Math.min(8, d.getUint32(32, false));
  const coef: number[] = [];
  for (let i = 0; i <= degree; i++) coef.push(d.getFloat64(36 + i * 8, false));
  return { area, coef };
}

/** FixVignetteRadial's centre and normaliser for an image W x H (spec: x0 = 0,
 *  x1 = W - 1, and m is the distance from the centre to the farthest pixel). */
function readVignette(d: DataView, W: number, H: number): { k: number[]; cx: number; cy: number; m: number } {
  const k = [0, 1, 2, 3, 4].map((i) => d.getFloat64(i * 8, false));
  const cx = d.getFloat64(40, false) * (W - 1);
  const cy = d.getFloat64(48, false) * (H - 1);
  const mx = Math.max(cx, W - 1 - cx);
  const my = Math.max(cy, H - 1 - cy);
  return { k, cx, cy, m: Math.hypot(mx, my) || 1 };
}

/** Gain at a pixel of an image W x H, bilinear between grid points with the
 *  edges replicated (darktable rawprepare: pixel / size - origin, over the
 *  spacing, clamped to the grid). */
function gainAt(g: GainGrid, row: number, col: number, W: number, H: number, mapPlane: number): number {
  const fy = g.pointsV > 1 && g.spacingV > 0 ? Math.min(g.pointsV - 1, Math.max(0, (row / H - g.originV) / g.spacingV)) : 0;
  const fx = g.pointsH > 1 && g.spacingH > 0 ? Math.min(g.pointsH - 1, Math.max(0, (col / W - g.originH) / g.spacingH)) : 0;
  const y0 = Math.floor(fy), x0 = Math.floor(fx);
  const y1 = Math.min(y0 + 1, g.pointsV - 1), x1 = Math.min(x0 + 1, g.pointsH - 1);
  const ty = fy - y0, tx = fx - x0;
  const P = g.mapPlanes, N = g.pointsH, G = g.gains;
  const top = G[(y0 * N + x0) * P + mapPlane] * (1 - tx) + G[(y0 * N + x1) * P + mapPlane] * tx;
  const bot = G[(y1 * N + x0) * P + mapPlane] * (1 - tx) + G[(y1 * N + x1) * P + mapPlane] * tx;
  return top * (1 - ty) + bot * ty;
}

function inArea(a: Area, row: number, col: number): boolean {
  return row >= a.top && row < a.bottom && col >= a.left && col < a.right
    && (row - a.top) % a.rowPitch === 0 && (col - a.left) % a.colPitch === 0;
}

function polyAt(c: number[], x: number): number {
  let y = 0;
  for (let i = c.length - 1; i >= 0; i--) y = y * x + c[i];
  return y;
}

/** True when an opcode the app does not implement may be skipped: its
 *  optional flag is set, or (spec chapter 7's skip rule) it is a WarpRectilinear
 *  or WarpFisheye straight after an optional WarpRectilinear2. */
function skippable(list: Opcode[], i: number): boolean {
  const op = list[i];
  if (op.flags & 1) return true;
  const prev = list[i - 1];
  return (op.id === 1 || op.id === 2) && !!prev && prev.id === 14 && (prev.flags & 1) === 1;
}

/**
 * Apply an OpcodeList1 or OpcodeList2 to an image held as unsigned integers.
 * @param list  the parsed opcodes, in file order.
 * @param data  the samples, interleaved `spp` per pixel, row-major — modified in
 *   place.
 * @param W  the image's width in pixels (the stage's own image: the stored
 *   raster for list 1, the ActiveArea for list 2).
 * @param H  its height.
 * @param spp  samples per pixel (1 for a CFA, 3 for LinearRaw).
 * @param range  the stored value that means 1.0 at this stage (65535 for list
 *   1; white minus the maximum black, or the common scale, for list 2). Every
 *   result is clipped to 0..range after each opcode, as chapter 7 requires.
 * @param stored  true for list 1, where MapTable applies to the integer values.
 * @returns the reader-facing names of the opcodes that were required and NOT
 *   applied (empty when every required one was). The caller must tell the
 *   reader about each (decode.ts `decodeNotice`).
 */
export function applyStoredOps(list: Opcode[], data: Uint16Array, W: number, H: number, spp: number, range: number, stored: boolean): string[] {
  const skipped: string[] = [];
  const inv = 1 / range;
  for (let i = 0; i < list.length; i++) {
    const op = list[i];
    if (op.id === 9) {
      const g = readGain(op.params);
      const a = g.area;
      for (let row = a.top; row < Math.min(a.bottom, H); row += a.rowPitch) {
        for (let col = a.left; col < Math.min(a.right, W); col += a.colPitch) {
          for (let p = a.plane; p < Math.min(a.plane + a.planes, spp); p++) {
            const gain = gainAt(g, row, col, W, H, Math.min(p - a.plane, g.mapPlanes - 1));
            const k = (row * W + col) * spp + p;
            data[k] = Math.min(range, Math.max(0, Math.round(data[k] * gain)));
          }
        }
      }
    } else if (op.id === 8) {
      const { area: a, coef } = readPoly(op.params);
      for (let row = a.top; row < Math.min(a.bottom, H); row += a.rowPitch) {
        for (let col = a.left; col < Math.min(a.right, W); col += a.colPitch) {
          for (let p = a.plane; p < Math.min(a.plane + a.planes, spp); p++) {
            const k = (row * W + col) * spp + p;
            const y = polyAt(coef, data[k] * inv);
            data[k] = Math.round(Math.min(1, Math.max(0, y)) * range);
          }
        }
      }
    } else if (op.id === 3) {
      const v = readVignette(op.params, W, H);
      for (let row = 0; row < H; row++) {
        for (let col = 0; col < W; col++) {
          const r2 = ((col - v.cx) ** 2 + (row - v.cy) ** 2) / (v.m * v.m);
          const gain = 1 + r2 * (v.k[0] + r2 * (v.k[1] + r2 * (v.k[2] + r2 * (v.k[3] + r2 * v.k[4]))));
          for (let p = 0; p < spp; p++) {
            const k = (row * W + col) * spp + p;
            data[k] = Math.min(range, Math.max(0, Math.round(data[k] * gain)));
          }
        }
      }
    } else if (op.id === 7 && stored) {
      const d = op.params;
      const a = readArea(d);
      const size = d.getUint32(32, false);
      if (!size) continue;
      const table = new Uint16Array(size);
      for (let t = 0; t < size && 36 + t * 2 + 2 <= d.byteLength; t++) table[t] = d.getUint16(36 + t * 2, false);
      for (let row = a.top; row < Math.min(a.bottom, H); row += a.rowPitch) {
        for (let col = a.left; col < Math.min(a.right, W); col += a.colPitch) {
          for (let p = a.plane; p < Math.min(a.plane + a.planes, spp); p++) {
            const k = (row * W + col) * spp + p;
            data[k] = table[Math.min(data[k], size - 1)];
          }
        }
      }
    } else if (!skippable(list, i)) {
      skipped.push(NAMES[op.id] ?? `an unknown correction (opcode ${op.id})`);
    }
  }
  return skipped;
}

/**
 * Turn an OpcodeList3 into the per-pixel work demosaic does after it has
 * computed a pixel.
 * @param list  the parsed OpcodeList3.
 * @param stageW  the demosaiced (stage-3) image's width: the ActiveArea.
 * @param stageH  its height.
 * @param ox  the delivered frame's left edge inside that image (DefaultCrop).
 * @param oy  its top edge.
 * @returns the stage (undefined when the list holds nothing to do) and the
 *   reader-facing names of required opcodes it could not express, which the
 *   caller must report. Consumer: `applyPost`, through RawCfa.post.
 */
export function buildPost(list: Opcode[], stageW: number, stageH: number, ox: number, oy: number): { post?: PostStage; skipped: string[] } {
  const ops: PostOp[] = [];
  const skipped: string[] = [];
  for (let i = 0; i < list.length; i++) {
    const op = list[i];
    if (op.id === 9) ops.push({ kind: "gain", grid: readGain(op.params) });
    else if (op.id === 3) ops.push({ kind: "vignette", ...readVignette(op.params, stageW, stageH) });
    else if (op.id === 8) ops.push({ kind: "poly", ...readPoly(op.params) });
    else if (!skippable(list, i)) skipped.push(NAMES[op.id] ?? `an unknown correction (opcode ${op.id})`);
  }
  return { post: ops.length ? { stageW, stageH, ox, oy, ops } : undefined, skipped };
}

/**
 * Run the after-demosaic stage on one pixel.
 * @param s  the stage, from RawCfa.post.
 * @param x  the pixel's column in the delivered frame — fractional for a binned
 *   preview pixel, which passes the centre of the 2x2 it stands for.
 * @param y  its row.
 * @param out  the pixel's three camera-native linear values (1.0 = white),
 *   modified in place.
 * @returns nothing. Every opcode result is clipped to 0..1 (chapter 7); the
 *   matrix, applied last, is not. The preview's binning and the export's
 *   per-pixel demosaic both call this, so the two agree by construction.
 */
export function applyPost(s: PostStage, x: number, y: number, out: { [i: number]: number }): void {
  const row = y + s.oy, col = x + s.ox;
  for (const op of s.ops) {
    if (op.kind === "vignette") {
      const r2 = ((col - op.cx) ** 2 + (row - op.cy) ** 2) / (op.m * op.m);
      const g = 1 + r2 * (op.k[0] + r2 * (op.k[1] + r2 * (op.k[2] + r2 * (op.k[3] + r2 * op.k[4]))));
      for (let c = 0; c < 3; c++) out[c] = Math.min(1, Math.max(0, out[c] * g));
    } else if (op.kind === "gain") {
      const g = op.grid, a = g.area;
      const ri = Math.round(row), ci = Math.round(col);
      if (!inArea(a, ri, ci)) continue;
      for (let p = a.plane; p < Math.min(a.plane + a.planes, 3); p++) {
        out[p] = Math.min(1, Math.max(0, out[p] * gainAt(g, row, col, s.stageW, s.stageH, Math.min(p - a.plane, g.mapPlanes - 1))));
      }
    } else {
      const a = op.area;
      if (!inArea(a, Math.round(row), Math.round(col))) continue;
      for (let p = a.plane; p < Math.min(a.plane + a.planes, 3); p++) out[p] = Math.min(1, Math.max(0, polyAt(op.coef, out[p])));
    }
  }
  const m = s.matrix;
  if (m) {
    const r = out[0], g = out[1], b = out[2];
    out[0] = m[0] * r + m[1] * g + m[2] * b;
    out[1] = m[3] * r + m[4] * g + m[5] * b;
    out[2] = m[6] * r + m[7] * g + m[8] * b;
  }
}
