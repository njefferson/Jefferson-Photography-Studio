// Decode a DNG's raw image into linear camera values. Two shapes: a 2x2 Bayer
// mosaic (PhotometricInterpretation 32803, CFA), and LinearRaw (34892: already
// demosaiced, camera-native, one or three samples a pixel). Stored as
// uncompressed samples at any BitsPerSample from 8 to 16 (Compression 1),
// lossless JPEG (7), or, for LinearRaw only, lossy baseline JPEG (34892, whose
// tiles the browser decodes in decode.ts and hands here as 8-bit codes). Strips
// or tiles, either byte order. This is what Lightroom's "Convert to DNG" and
// Adobe DNG Converter produce, and what phones and drones write.
//
// The DNG processing model runs in the spec's order (DNG 1.7.1.0 chapters 5 and
// 7): OpcodeList1 on the stored values; crop to the ActiveArea; the
// LinearizationTable; the black level of each pixel — the BlackLevel repeat
// pattern indexed from the ActiveArea's top-left, plus BlackLevelDeltaH and
// BlackLevelDeltaV — subtracted, and the result scaled by the white level minus
// the MAXIMUM black; OpcodeList2; the DefaultCrop; and OpcodeList3 after
// demosaic, carried as RawCfa.post. The CFA pattern is indexed from the
// ActiveArea's origin too, so an odd ActiveArea or crop no longer swaps colours.
// A mosaic whose repeat is not 2x2 (Fujifilm X-Trans is 6x6) is refused with a
// reason, never developed as RGGB.

import type { Ifd } from "./tiff";
import { Tiff } from "./tiff";
import { decodeLJ92, type Lj92Image } from "./lj92";
import { demosaicBinned, type LinearImage, type RawCfa } from "./demosaic";
import { applyPost, applyStoredOps, buildPost, parseOpcodeList } from "./dngOpcodes";

const T_NEW_SUBFILE = 254;
const T_IMAGE_WIDTH = 256;
const T_IMAGE_LENGTH = 257;
const T_BITS = 258;
const T_COMPRESSION = 259;
const T_PHOTOMETRIC = 262;
const T_STRIP_OFFSETS = 273;
const T_SAMPLES = 277;
const T_ROWS_PER_STRIP = 278;
const T_STRIP_BYTECOUNTS = 279;
const T_PLANAR = 284;
const T_TILE_WIDTH = 322;
const T_TILE_LENGTH = 323;
const T_TILE_OFFSETS = 324;
const T_TILE_BYTECOUNTS = 325;
const T_SAMPLE_FORMAT = 339;
const T_CFA_REPEAT_DIM = 33421;
const T_CFA_PATTERN = 33422;
const T_DNG_VERSION = 50706;
const T_CFA_PLANE_COLOR = 50710;
const T_CFA_LAYOUT = 50711;
const T_LINEARIZATION_TABLE = 50712;
const T_BLACK_REPEAT_DIM = 50713;
const T_BLACK_LEVEL = 50714;
const T_BLACK_DELTA_H = 50715;
const T_BLACK_DELTA_V = 50716;
const T_WHITE_LEVEL = 50717;
const T_DEFAULT_CROP_ORIGIN = 50719;
const T_DEFAULT_CROP_SIZE = 50720;
const T_ACTIVE_AREA = 50829;
const T_OPCODES_1 = 51008;
const T_OPCODES_2 = 51009;
const T_OPCODES_3 = 51022;

const PHOTO_CFA = 32803;
const PHOTO_LINEAR_RAW = 34892;
const COMP_NONE = 1;
const COMP_JPEG = 7;
const COMP_LOSSY = 34892;

const COMPRESSION_NAMES: Record<number, string> = {
  8: "Deflate (the floating-point kind Lightroom writes for HDR and panorama merges)",
  9: "VC-5 (GoPro)",
  52546: "JPEG XL",
};

/** How a DNG's main raw image can be read: "cfa" (a 2x2 mosaic) and "linear"
 *  (LinearRaw, uncompressed or lossless) here and synchronously; "lossy"
 *  (LinearRaw, lossy JPEG) through `rawFromLossyCodes` once the browser has
 *  decoded its tiles. */
export type DngRawKind = "cfa" | "linear" | "lossy";

/** What `findDngRaw` found. */
export interface DngRawFind {
  /** The main raw IFD (NewSubFileType 0, CFA or LinearRaw), when there is one. */
  ifd?: Ifd;
  /** Set when this app can read it. */
  kind?: DngRawKind;
  /** Set when it cannot: a sentence for the reader saying why. */
  why?: string;
  /** True when the reason is the image's colour layout, which no embedded
   *  preview can stand in for honestly — the caller refuses the file. */
  refuse?: boolean;
}

/** A decoded raw frame plus the names of the corrections the file required
 *  and this app did not apply (see dngOpcodes.ts). */
export type DngRaw = RawCfa & { skipped: string[] };

const isMain = (d: Ifd) => (d.num(T_NEW_SUBFILE)[0] ?? 0) === 0;

/**
 * Find a DNG's main raw image and say whether it can be read.
 * @param ifds  every IFD of the file (`Tiff.allIfds`).
 * @returns `{}` when the file holds no CFA or LinearRaw full-resolution image
 *   (the caller falls back to the embedded preview); otherwise the IFD with
 *   either a `kind` or a reader-facing `why`. Decode, the export's
 *   `getSource` and `sourceIsMosaiced` all decide through this one test, so the
 *   preview and the export can never disagree about what the file is.
 */
export function findDngRaw(ifds: Ifd[]): DngRawFind {
  const ifd = ifds.find((d) => isMain(d) && d.num(T_PHOTOMETRIC)[0] === PHOTO_CFA)
    ?? ifds.find((d) => isMain(d) && d.num(T_PHOTOMETRIC)[0] === PHOTO_LINEAR_RAW);
  if (!ifd) return {};
  const photo = ifd.num(T_PHOTOMETRIC)[0];
  const comp = ifd.num(T_COMPRESSION)[0] ?? COMP_NONE;
  const spp = ifd.num(T_SAMPLES)[0] ?? 1;
  const bps = ifd.num(T_BITS)[0] ?? 8;
  if ((ifd.num(T_SAMPLE_FORMAT)[0] ?? 1) === 3) {
    return { ifd, why: "its raw image is stored as floating-point numbers (the kind Lightroom writes for HDR and panorama merges), which this app doesn't read" };
  }
  if (bps > 16) return { ifd, why: `its raw image uses ${bps} bits a sample, and this app reads up to 16` };
  if ((ifd.num(T_PLANAR)[0] ?? 1) !== 1) return { ifd, why: "its raw image stores each colour as a separate plane, which this app doesn't read" };
  if (photo === PHOTO_CFA) {
    const bayer = bayerPattern(ifd);
    if (typeof bayer === "string") return { ifd, why: bayer, refuse: true };
    if (spp !== 1) return { ifd, why: `its mosaic carries ${spp} samples a photosite, where one is the rule` };
    if (comp === COMP_NONE || comp === COMP_JPEG) return { ifd, kind: "cfa" };
  } else {
    if (spp !== 1 && spp !== 3) return { ifd, why: `its linear image has ${spp} colour channels, and this app reads one or three` };
    if (comp === COMP_NONE || comp === COMP_JPEG) return { ifd, kind: "linear" };
    if (comp === COMP_LOSSY) return { ifd, kind: "lossy" };
  }
  return { ifd, why: `its raw image is compressed with ${COMPRESSION_NAMES[comp] ?? `a method (${comp}) this app doesn't know`}, which this app doesn't read` };
}

/** The 2x2 colour indices of a CFA IFD's pattern (0=R 1=G 2=B), or a reader-
 *  facing reason it is not a 2x2 Bayer mosaic. CFARepeatPatternDim was never
 *  read until 2026-10-02, and a 36-entry X-Trans pattern fell back to RGGB. */
function bayerPattern(ifd: Ifd): number[] | string {
  const dim = ifd.num(T_CFA_REPEAT_DIM);
  const pat = ifd.num(T_CFA_PATTERN);
  // Neither tag: what this reader always assumed, RGGB (the spec requires
  // both on a CFA image, so only a malformed file lands here).
  if (!dim.length && !pat.length) return [0, 1, 1, 2];
  const rows = dim[0] ?? (pat.length === 4 ? 2 : 0);
  const cols = dim[1] ?? (pat.length === 4 ? 2 : 0);
  if (rows === 6 && cols === 6) {
    return "its sensor has a 6x6 colour pattern (Fujifilm's X-Trans), and this app can only develop the 2x2 Bayer pattern most cameras use — developing it as one would put the wrong colour on most of its pixels";
  }
  if (rows !== 2 || cols !== 2 || pat.length !== 4) {
    return `its sensor has a ${rows || "?"}x${cols || "?"} colour pattern, and this app can only develop the 2x2 Bayer pattern most cameras use`;
  }
  if ((ifd.num(T_CFA_LAYOUT)[0] ?? 1) !== 1) {
    return "its sensor's photosites are not laid out on a square grid, and this app can only develop one that is";
  }
  const planes = ifd.num(T_CFA_PLANE_COLOR);
  const mapped = pat.map((v) => (planes.length ? planes[v] : v));
  const n = (c: number) => mapped.filter((v) => v === c).length;
  if (n(0) !== 1 || n(1) !== 2 || n(2) !== 1) {
    return "its sensor's colour filters are not red, green and blue in a Bayer pattern, and that is the only kind this app can develop";
  }
  return mapped;
}

/** DNGVersion below 1.1.0.0, where a 16-bit lossless-JPEG difference stores
 *  its bits (lj92.ts `legacy16`). Absent means not legacy, as LibRaw takes it. */
function legacyLj92(ifds: Ifd[]): boolean {
  for (const d of ifds) {
    const v = d.num(T_DNG_VERSION);
    if (v.length >= 2) return v[0] < 1 || (v[0] === 1 && v[1] < 1);
  }
  return false;
}

/**
 * Read a DNG's raw image (CFA or LinearRaw, uncompressed or lossless JPEG) at
 * full resolution, linearised and black-subtracted.
 * @param bytes  the whole file.
 * @param raw  the raw IFD `findDngRaw` returned with kind "cfa" or "linear".
 * @param ifds  every IFD of the file (for DNGVersion), parsed if omitted.
 * @returns the frame cropped to its ActiveArea and DefaultCrop, with black 0
 *   and white the scale that maps to 1.0, plus the corrections it could not
 *   apply. Throws when the IFD has neither strips nor tiles, or its data ends
 *   early. Consumers: `decodeDngRaw` (the half-size preview) and export.ts
 *   `getSource` (the full-resolution export) — one reader, so they agree.
 */
export function readDngRaw(bytes: Uint8Array, raw: Ifd, ifds: Ifd[] = new Tiff(bytes).allIfds()): DngRaw {
  const width = raw.num(T_IMAGE_WIDTH)[0];
  const height = raw.num(T_IMAGE_LENGTH)[0];
  const spp = raw.num(T_SAMPLES)[0] ?? 1;
  const bps = raw.num(T_BITS)[0] ?? 8;
  const comp = raw.num(T_COMPRESSION)[0] ?? COMP_NONE;
  const stored = new Uint16Array(width * height * spp);
  const chunks = chunksOf(raw, width, height);
  if (comp === COMP_NONE) {
    const le = bytes[0] === 0x49;
    for (const ch of chunks) unpackChunk(bytes, le, bps, spp, ch, stored, width, height);
  } else {
    const legacy = legacyLj92(ifds);
    for (const ch of chunks) {
      placeLj92(decodeLJ92(bytes.subarray(ch.off, ch.off + ch.len), legacy), stored, width, height, spp, ch.x, ch.y, ch.w);
    }
  }
  return finishRaw(stored, width, height, spp, bps, raw, false);
}

/**
 * Build the raw frame of a lossy LinearRaw DNG from its decoded 8-bit codes.
 * @param codes  the tiles as the browser decoded them: RGBA, `width * height`
 *   pixels, the raw IFD's full stored size — untouched codes, not a display
 *   rendering.
 * @param raw  the LinearRaw IFD (`findDngRaw` kind "lossy").
 * @returns the frame as `readDngRaw` returns one: linearised through the
 *   file's LinearizationTable and levels and its OpcodeList2 MapPolynomial,
 *   or — when the file carries neither a table nor a polynomial — through the
 *   sRGB curve, LibRaw lossy_dng_load_raw's default (`gamma_curve(1/2.4,
 *   12.92, 1, 255)`). Until 2026-10-02 this path took a 2.2 power and no camera
 *   matrix, as if the file were already rendered; the spec calls LinearRaw
 *   camera-native. Consumers: decode.ts at open, export.ts `getSource`.
 */
export function rawFromLossyCodes(codes: Uint8ClampedArray | Uint8Array, raw: Ifd): DngRaw {
  const width = raw.num(T_IMAGE_WIDTH)[0];
  const height = raw.num(T_IMAGE_LENGTH)[0];
  const spp = raw.num(T_SAMPLES)[0] ?? 3;
  const stored = new Uint16Array(width * height * spp);
  for (let i = 0, n = width * height; i < n; i++) {
    for (let s = 0; s < spp; s++) stored[i * spp + s] = codes[i * 4 + s];
  }
  return finishRaw(stored, width, height, spp, 8, raw, true);
}

interface Chunk { off: number; len: number; x: number; y: number; w: number; h: number }

/** The strips or tiles of a raw IFD, each with where it lands. */
function chunksOf(raw: Ifd, width: number, height: number): Chunk[] {
  const tileOffsets = raw.num(T_TILE_OFFSETS);
  if (tileOffsets.length) {
    const tw = raw.num(T_TILE_WIDTH)[0];
    const th = raw.num(T_TILE_LENGTH)[0];
    const counts = raw.num(T_TILE_BYTECOUNTS);
    if (!tw || !th) throw new Error("This DNG's raw image has tiles of no size — the file looks damaged.");
    const across = Math.ceil(width / tw);
    return tileOffsets.map((off, i) => ({ off, len: counts[i] ?? 0, x: (i % across) * tw, y: Math.floor(i / across) * th, w: tw, h: th }));
  }
  const strips = raw.num(T_STRIP_OFFSETS);
  if (!strips.length) throw new Error("This DNG's raw image has neither strips nor tiles — the file looks damaged.");
  const counts = raw.num(T_STRIP_BYTECOUNTS);
  const rps = raw.num(T_ROWS_PER_STRIP)[0] || height;
  return strips.map((off, i) => ({ off, len: counts[i] ?? 0, x: 0, y: i * rps, w: width, h: Math.min(rps, height - i * rps) }));
}

/** Unpack one uncompressed strip or tile at its BitsPerSample: 16-bit words in
 *  the file's byte order, bytes, or — for any other depth — bits packed
 *  big-endian whatever the file's order (DNG 1.7.1.0, BitsPerSample), each row
 *  starting on a byte, as dcraw's packed_dng_load_raw reads them
 *  (`getbits(-1)` per row, then `getbits(tiff_bps)` per sample). Until
 *  2026-10-02 every uncompressed DNG was read as 16-bit words. */
function unpackChunk(bytes: Uint8Array, le: boolean, bps: number, spp: number, ch: Chunk, out: Uint16Array, W: number, H: number) {
  const rowSamples = ch.w * spp;
  const rowBytes = Math.ceil((rowSamples * bps) / 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const end = Math.min(bytes.length, ch.off + ch.len);
  for (let r = 0; r < ch.h; r++) {
    const gy = ch.y + r;
    if (gy >= H) break;
    const base = ch.off + r * rowBytes;
    if (base >= end) break;
    let acc = 0, nacc = 0, p = base;
    for (let s = 0; s < rowSamples; s++) {
      let v: number;
      if (bps === 16) {
        if (base + s * 2 + 2 > end) break;
        v = view.getUint16(base + s * 2, le);
      } else if (bps === 8) {
        if (base + s >= end) break;
        v = bytes[base + s];
      } else {
        while (nacc < bps) {
          acc = ((acc << 8) | (p < end ? bytes[p] : 0)) >>> 0;
          p++;
          nacc += 8;
        }
        v = (acc >>> (nacc - bps)) & ((1 << bps) - 1);
        nacc -= bps;
        acc &= (1 << nacc) - 1;
      }
      const gx = ch.x + Math.floor(s / spp);
      if (gx < W) out[(gy * W + gx) * spp + (s % spp)] = v;
    }
  }
}

/** Place one decoded lossless-JPEG strip or tile by walking its samples in
 *  raster order and wrapping at the tile's width — dcraw's and LibRaw's
 *  lossless_dng_load_raw (`if (++col >= tile_width || col >= raw_width) row +=
 *  1 + (col = 0)`). The DNG spec requires only that the sample COUNT match the
 *  tile: 11 of 70 lossless CFA DNGs measured on raw.pixls.us write one JPEG
 *  component and two CFA rows per JPEG row, and the old reader, which assumed
 *  interleaved components, left their bottom half black. */
function placeLj92(img: Lj92Image, out: Uint16Array, W: number, H: number, spp: number, x0: number, y0: number, tileW: number) {
  const data = img.data;
  const total = img.width * img.height * img.components;
  let row = 0, col = 0;
  for (let i = 0; i + spp <= total; i += spp) {
    const gy = y0 + row, gx = x0 + col;
    if (gy >= H) break;
    if (gx < W) for (let s = 0; s < spp; s++) out[(gy * W + gx) * spp + s] = data[i + s];
    if (++col >= tileW) { col = 0; row++; }
  }
}

/** sRGB decoding curve, the default LibRaw gives a lossy DNG with no curve. */
const srgbEotf = (x: number) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));

/** The spec's chapter-5 and chapter-7 pipeline, from stored values to a frame. */
function finishRaw(stored: Uint16Array, W: number, H: number, sppIn: number, bps: number, raw: Ifd, lossy: boolean): DngRaw {
  const skipped: string[] = [];
  const cfaImage = raw.num(T_PHOTOMETRIC)[0] === PHOTO_CFA;

  // OpcodeList1: on the stored values, the stored raster's own coordinates.
  skipped.push(...applyStoredOps(parseOpcodeList(raw.bytes(T_OPCODES_1)), stored, W, H, sppIn, 65535, true));

  // ActiveArea: [top, left, bottom, right]; everything after is relative to it.
  const aa = raw.num(T_ACTIVE_AREA);
  const top = clampInt(aa[0] ?? 0, 0, H), left = clampInt(aa[1] ?? 0, 0, W);
  const bottom = clampInt(aa[2] ?? H, top, H), right = clampInt(aa[3] ?? W, left, W);
  const AW = right - left, AH = bottom - top;
  if (AW < 2 || AH < 2) throw new Error("This DNG's active area is empty — the file looks damaged.");

  // Levels. BlackLevel is a rr x rc x spp pattern from the ActiveArea's corner.
  const table = raw.num(T_LINEARIZATION_TABLE);
  const lin = table.length > 1 ? Uint16Array.from(table, (v) => clampInt(v, 0, 65535)) : null;
  const rep = raw.num(T_BLACK_REPEAT_DIM);
  const rr = Math.max(1, rep[0] ?? 1), rc = Math.max(1, rep[1] ?? 1);
  const bl = raw.num(T_BLACK_LEVEL);
  const blackAt = (j: number, k: number, s: number) =>
    bl.length >= rr * rc * sppIn ? bl[(j * rc + k) * sppIn + s] : bl.length === sppIn ? bl[s] : (bl[0] ?? 0);
  const dh = raw.num(T_BLACK_DELTA_H);
  const dv = raw.num(T_BLACK_DELTA_V);
  const wl = raw.num(T_WHITE_LEVEL);
  const maxCode = bps >= 16 ? 65535 : (1 << bps) - 1;
  const whiteOf = (s: number) => wl[s] ?? wl[0] ?? (lin ? lin[Math.min(maxCode, lin.length - 1)] : maxCode);

  // The maximum black of each plane, as the DNG SDK takes it: each phase of the
  // pattern plus the largest delta landing on that phase.
  const maxPhase = (d: number[], n: number, period: number) => {
    const m = new Array(period).fill(d.length ? -Infinity : 0);
    for (let i = 0; i < n && i < d.length; i++) m[i % period] = Math.max(m[i % period], d[i]);
    return m.map((v) => (Number.isFinite(v) ? v : 0));
  };
  const mH = maxPhase(dh, AW, rc), mV = maxPhase(dv, AH, rr);
  const maxBlack: number[] = [];
  for (let s = 0; s < sppIn; s++) {
    let m = -Infinity;
    for (let j = 0; j < rr; j++) for (let k = 0; k < rc; k++) m = Math.max(m, blackAt(j, k, s) + mV[j] + mH[k]);
    maxBlack.push(m);
  }

  // A mosaic keeps its own units (1.0 = white - max black), so a file with one
  // black reads exactly as before. LinearRaw is put on one 16-bit scale, so its
  // planes, whose white and black may differ, share one RawCfa.white.
  const ranges = maxBlack.map((b, s) => Math.max(1, whiteOf(s) - b));
  const range = cfaImage ? ranges[0] : 65535;
  const spp = sppIn;
  // In place when there is nothing to crop: each value is read before it is
  // written at the same index, and a 24-megapixel frame is not held twice.
  const act = top || left || AW !== W || AH !== H ? new Uint16Array(AW * AH * spp) : stored;
  const uniform = rr === 1 && rc === 1 && !dh.length && !dv.length;
  const b0 = Array.from({ length: spp }, (_, s) => blackAt(0, 0, s));
  for (let y = 0; y < AH; y++) {
    const srcRow = ((y + top) * W + left) * spp;
    const dvy = dv[y] ?? 0;
    for (let x = 0; x < AW; x++) {
      const dhx = dh[x] ?? 0;
      for (let s = 0; s < spp; s++) {
        let v = stored[srcRow + x * spp + s];
        if (lin) v = lin[Math.min(v, lin.length - 1)];
        const b = uniform ? b0[s] : blackAt(y % rr, x % rc, s) + dvy + dhx;
        const o = cfaImage ? v - b : ((v - b) / ranges[s]) * 65535;
        act[(y * AW + x) * spp + s] = o <= 0 ? 0 : o >= 65535 ? 65535 : Math.round(o);
      }
    }
  }

  // OpcodeList2, on the ActiveArea image. A lossy file with no curve of its own
  // takes LibRaw's default sRGB curve first, in place of the polynomial it lacks.
  const list2 = parseOpcodeList(raw.bytes(T_OPCODES_2));
  if (lossy && !lin && !list2.some((op) => op.id === 8)) {
    const lut = new Uint16Array(65536);
    for (let i = 0; i < 65536; i++) lut[i] = Math.round(srgbEotf(Math.min(1, i / range)) * range);
    for (let i = 0; i < act.length; i++) act[i] = lut[act[i]];
  }
  skipped.push(...applyStoredOps(list2, act, AW, AH, spp, range, false));

  // DefaultCrop, relative to the ActiveArea; the CFA phase follows the origin.
  const co = raw.num(T_DEFAULT_CROP_ORIGIN), cs = raw.num(T_DEFAULT_CROP_SIZE);
  const ox = clampInt(co[0] ?? 0, 0, AW - 2), oy = clampInt(co[1] ?? 0, 0, AH - 2);
  const outW = clampInt(cs[0] ?? AW, 2, AW - ox), outH = clampInt(cs[1] ?? AH, 2, AH - oy);
  let frame = act;
  if (ox || oy || outW !== AW || outH !== AH) {
    frame = new Uint16Array(outW * outH * spp);
    for (let y = 0; y < outH; y++) frame.set(act.subarray(((y + oy) * AW + ox) * spp, ((y + oy) * AW + ox + outW) * spp), y * outW * spp);
  }

  let pattern = [0, 1, 1, 2];
  if (cfaImage) {
    const p = bayerPattern(raw) as number[];
    pattern = [0, 1, 2, 3].map((i) => p[(((i >> 1) + oy) & 1) * 2 + (((i & 1) + ox) & 1)]);
  }

  // OpcodeList3 runs after demosaic, in the ActiveArea's coordinates.
  const built = buildPost(parseOpcodeList(raw.bytes(T_OPCODES_3)), AW, AH, ox, oy);
  skipped.push(...built.skipped);

  // One-sample LinearRaw (a monochrome DNG) is widened to three equal planes.
  let cfa = frame;
  const samples = cfaImage ? undefined : 3;
  if (!cfaImage && spp === 1) {
    cfa = new Uint16Array(outW * outH * 3);
    for (let i = 0; i < outW * outH; i++) cfa[i * 3] = cfa[i * 3 + 1] = cfa[i * 3 + 2] = frame[i];
  }
  return { cfa, width: outW, height: outH, pattern, black: 0, white: range, samples, post: built.post, skipped };
}

function clampInt(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Math.round(v)));
}

/**
 * The half-size linear proxy the editor works on, from a full raw frame.
 * @param c  any frame a decoder returns — a mosaic, or a 3-sample LinearRaw
 *   frame.
 * @returns RGBA float, half the frame's width and height: a mosaic binned 2x2
 *   (`demosaicBinned`), a LinearRaw frame averaged 2x2, and in both cases the
 *   frame's after-demosaic stage applied at each output pixel's centre. Its
 *   size is what export.ts `proxyFactorFor` assumes for every raw source (2).
 */
export function binRaw(c: RawCfa): LinearImage {
  let img: LinearImage;
  if (c.samples === 3) {
    const ow = c.width >> 1, oh = c.height >> 1;
    const out = new Float32Array(ow * oh * 4);
    const s = 1 / Math.max(1, c.white - c.black) / 4;
    const W = c.width, d = c.cfa, b = c.black;
    for (let y = 0; y < oh; y++) {
      for (let x = 0; x < ow; x++) {
        const i0 = ((y * 2) * W + x * 2) * 3, i1 = i0 + 3, i2 = i0 + W * 3, i3 = i2 + 3;
        const o = (y * ow + x) * 4;
        for (let ch = 0; ch < 3; ch++) out[o + ch] = Math.max(0, (d[i0 + ch] + d[i1 + ch] + d[i2 + ch] + d[i3 + ch] - 4 * b) * s);
        out[o + 3] = 1;
      }
    }
    img = { width: ow, height: oh, linear: out };
  } else {
    img = demosaicBinned(c.cfa, c.width, c.height, c.pattern, c.black, c.white);
  }
  if (c.post) {
    const px = [0, 0, 0];
    const L = img.linear;
    for (let y = 0; y < img.height; y++) {
      for (let x = 0; x < img.width; x++) {
        const o = (y * img.width + x) * 4;
        px[0] = L[o]; px[1] = L[o + 1]; px[2] = L[o + 2];
        applyPost(c.post, x * 2 + 0.5, y * 2 + 0.5, px);
        L[o] = px[0]; L[o + 1] = px[1]; L[o + 2] = px[2];
      }
    }
  }
  return img;
}

/**
 * Demosaiced half-size linear proxy for live editing, read straight from a file.
 * @param bytes  the whole DNG.
 * @param raw  its raw IFD (kind "cfa" or "linear" from `findDngRaw`).
 * @param ifds  every IFD, parsed if omitted.
 * @returns `binRaw` of `readDngRaw`. Kept under this name because the tools
 *   that measure the practice DNGs import it.
 */
export function decodeMosaicedDng(bytes: Uint8Array, raw: Ifd, ifds?: Ifd[]): LinearImage {
  return binRaw(readDngRaw(bytes, raw, ifds));
}

/**
 * Attach a camera-space matrix to run after demosaic, after the frame's own
 * OpcodeList3 (color.ts `dngCameraToSrgb`'s `pre`).
 * @param c  a frame from `readDngRaw` or `rawFromLossyCodes`; modified.
 * @param pre  the row-major 3x3, or undefined to leave the frame as it is.
 * @returns the same frame, whose `post.matrix` is now `pre` — read by both
 *   `binRaw` and `demosaicPixelLinearInto`, so preview and export agree.
 */
export function withPreMatrix<T extends RawCfa>(c: T, pre?: number[]): T {
  if (!pre) return c;
  c.post = c.post ? { ...c.post, matrix: pre } : { stageW: c.width, stageH: c.height, ox: 0, oy: 0, ops: [], matrix: pre };
  return c;
}
