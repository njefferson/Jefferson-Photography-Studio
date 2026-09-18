// Image decoding. Three real paths, no big WASM dependency:
//   - JPEG/PNG: native bitmap decode.
//   - Lossy linear DNG (8-bit, baseline-JPEG tile, Photometric 34892): decode
//     natively; gamma-2.2 -> linear happens in the shader.
//   - Mosaiced DNG (14-bit, lossless-JPEG, Photometric 32803 = CFA): pure-JS
//     LJ92 decode + demosaic -> linear float. (Verified bit-exact vs LibRaw.)
// Anything else (e.g. Nikon NEF compression) falls back to the embedded preview
// until its decoder lands.

import type { ImportedFile } from "./import";
import { Tiff, type Ifd } from "./raw/tiff";
import { decodeMosaicedDng } from "./raw/dngRaw";
import { decodeNef } from "./raw/nef";
import { camToSrgbLinear, nikonColorMatrix } from "./color";
import type { BrushMask } from "./pipeline";

/** The photograph's sky selection, built once from the undegraded decode —
 *  gray-world balance only, no exposure, correction or look — so it never
 *  moves as the photograph is graded (skyfine.ts). `mask` is the 384 px
 *  bitmap `buildSkyMask` grows (null when no clear sky was found), `fine` its
 *  refinement to the picture's edges. Every sky-aware operation reads this one
 *  selection: the look's smoothing and depth, the tile, the batch export. */
export interface SkySelection {
  mask: BrushMask | null;
  fine: BrushMask | null;
}

export interface DecodedImage {
  width: number;
  height: number;
  /** The sky selection, once it has been built — by the decode worker on the
   *  lane that decoded this photograph (a moment after the picture itself,
   *  so the picture never waits on it), or on this thread when no worker is
   *  running. Absent until then; `skySelReady` says when. */
  skySel?: SkySelection;
  /** Resolves with the selection when the worker posts it, or null if the
   *  lane died first — the caller then builds it on this thread. Absent when
   *  the decode was not asked for a selection. */
  skySelReady?: Promise<SkySelection | null>;
  /** 8-bit gamma-encoded RGBA (JPEG/preview/lossy-linear path). */
  pixels?: Uint8ClampedArray;
  /** Linear float RGBA (mosaiced-raw path). Present instead of `pixels`. */
  linear?: Float32Array;
  /** Camera-native -> linear sRGB 3x3 (row-major), applied after white balance.
   *  Present only for camera-native raw (NEF, mosaiced DNG); absent when the
   *  source is already display/profiled (JPEG, preview, lossy-linear DNG). */
  camMatrix?: number[];
  /** True when these are true (un-white-balanced) sensor values. */
  isRaw: boolean;
  /** Display rotation in 90-degree CW steps, from the file's Orientation tag. */
  rotate?: number;
  /** Honesty note for the user when the open succeeded but NOT as raw — e.g.
   *  a Canon CR2 opened via its embedded JPEG preview. The UI must surface
   *  this (hint/alert), or the user believes they're editing raw data. */
  previewNotice?: string;
}

/** Linear RGB at an image pixel, from whichever buffer the decoder produced.
 *
 *  IT LIVES HERE RATHER THAN IN main.ts because everything that reads a decoded
 *  photograph needs it — the thumbnails, the frame measurements, the sky mask —
 *  and because a function inside the page module cannot be timed by the test
 *  page or moved into a worker. A copy of it in either place would be a second
 *  implementation of the one thing that must not have two. */
/** Clamp `v` into [lo, hi]. */
const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Normalise a gain triple to unit luma.
 * @param g  three channel gains.
 * @returns the gains scaled so their Rec.709 luma is 1, each clamped to
 *   0.02..16 — the range every white-balance slider in the app accepts, so a
 *   result here can always be written straight into `params.wb`.
 */
export function lumNormalize(g: number[]): [number, number, number] {
  const l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2] || 1;
  return [clampNum(g[0] / l, 0.02, 16), clampNum(g[1] / l, 0.02, 16), clampNum(g[2] / l, 0.02, 16)];
}

/**
 * Gray-world white balance over a subsampled grid, in linear space.
 * @param img  the decoded photograph (raw or already-profiled).
 * @returns luma-normalised gains that make the frame's channel means equal —
 *   the balance the sky selection, the auto-baseline and a look's own balance
 *   all start from, so it is the one balance the selection is allowed to be
 *   built at (a selection built at the live edit would drift with the grade).
 */
export function grayWorldWB(img: DecodedImage): [number, number, number] {
  const { width, height } = img;
  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [pr, pg, pb] = linearAt(img, x, y);
      r += pr;
      g += pg;
      b += pb;
      n++;
    }
  }
  r = Math.max(1e-4, r / n);
  g = Math.max(1e-4, g / n);
  b = Math.max(1e-4, b / n);
  const mean = (r + g + b) / 3;
  return lumNormalize([mean / r, mean / g, mean / b]);
}

export function linearAt(img: DecodedImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  if (img.linear) {
    return [
      Math.max(1e-4, img.linear[i]),
      Math.max(1e-4, img.linear[i + 1]),
      Math.max(1e-4, img.linear[i + 2]),
    ];
  }
  const p = img.pixels!;
  const toLin = (v: number) => Math.max(1e-4, Math.pow(v / 255, 2.2));
  return [toLin(p[i]), toLin(p[i + 1]), toLin(p[i + 2])];
}

/** TIFF/EXIF Orientation (tag 274) -> display rotation in 90-degree CW steps. */
function orientationToRotate(ifds: Ifd[]): number {
  const o = ifds[0]?.num(274)[0];
  if (o === 6) return 1;
  if (o === 3) return 2;
  if (o === 8) return 3;
  return 0;
}

const PHOTO_LINEAR_RAW = 34892;
const PHOTO_CFA = 32803;
const COMP_JPEG = 7;
const COMP_LOSSY_DNG = 34892;

export async function decode(file: ImportedFile): Promise<DecodedImage> {
  if (file.kind === "jpeg" || file.kind === "png") {
    return { ...(await decodeBitmap(file.bytes)), isRaw: false };
  }
  if (file.kind === "nef") {
    try {
      const img = decodeNef(file.bytes);
      const ifds = new Tiff(file.bytes).allIfds();
      return {
        width: img.width,
        height: img.height,
        linear: img.linear,
        camMatrix: camToSrgbLinear(nikonColorMatrix(cameraModel(ifds))),
        isRaw: true,
        rotate: orientationToRotate(ifds),
      };
    } catch {
      // Only claim High-Efficiency when the file's own Compression tag says
      // so — a damaged classic NEF blamed on HE sends the user chasing the
      // wrong fix.
      throw new Error(
        nefLooksHighEfficiency(file.bytes)
          ? "This NEF couldn't be decoded — it's a Nikon “High Efficiency” NEF (Z8/Z9, Z50 II HE/HE*), which isn't supported. " +
              "Convert it to DNG with the free Adobe DNG Converter and it will open here."
          : "This NEF couldn't be decoded — the file may be damaged or use a Nikon variant this app doesn't know yet. " +
              "Converting it to DNG with the free Adobe DNG Converter usually works.",
      );
    }
  }
  if (file.kind === "dng" || file.kind === "tiff") {
    return decodeDng(file.bytes, file);
  }
  // Unknown type: give the browser's own decoder one chance (Safari opens
  // HEIC this way), then fail with directions instead of a dead end.
  try {
    return { ...(await decodeBitmap(file.bytes)), isRaw: false };
  } catch {
    throw new Error(
      isHeic(file.bytes)
        ? "This is a HEIC photo, which this browser can't decode. Open this app in Safari to use it, or export the photo as JPEG from Photos first."
        : file.rawBrand
          ? `This is a ${file.rawBrand} raw file, which this app can't decode. ` +
            "Convert it to DNG with the free Adobe DNG Converter and it will open here."
          : "This file type isn't supported. Use JPEG, PNG, DNG or Nikon NEF — any other camera's RAW converts with the free Adobe DNG Converter.",
    );
  }
}

/** True when a NEF's raw IFD carries a Compression tag OTHER than the classic
 *  values this app decodes (34713 = Nikon compressed, 1 = uncompressed) — the
 *  signature of the newer High-Efficiency (TicoRAW) files. Any parse trouble
 *  returns false: never claim HE without the tag saying so. */
function nefLooksHighEfficiency(bytes: Uint8Array): boolean {
  try {
    const ifds = new Tiff(bytes).allIfds();
    const cfa = ifds.find((d) => d.num(262)[0] === PHOTO_CFA);
    const comp = cfa?.num(259)[0];
    return comp !== undefined && comp !== 34713 && comp !== 1;
  } catch {
    return false;
  }
}

/** HEIC/HEIF container sniff: ISO-BMFF 'ftyp' with a HEIF brand. */
function isHeic(bytes: Uint8Array): boolean {
  if (bytes.length < 12) return false;
  const tag = String.fromCharCode(bytes[4], bytes[5], bytes[6], bytes[7]);
  if (tag !== "ftyp") return false;
  const brand = String.fromCharCode(bytes[8], bytes[9], bytes[10], bytes[11]);
  return ["heic", "heix", "hevc", "heif", "mif1", "msf1"].includes(brand);
}

function toBlob(bytes: Uint8Array): Blob {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return new Blob([copy]);
}

async function decodeBitmap(bytes: Uint8Array): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  const bmp = await createImageBitmap(toBlob(bytes));
  const { canvas, ctx } = make2d(bmp.width, bmp.height);
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { width, height, pixels: data };
}

/** The one place this module touches a canvas — and therefore the one thing
 *  that stopped it running in a worker. A worker has no `document`, but it does
 *  have OffscreenCanvas, and both give the same 2D context and the same
 *  getImageData bytes. Environment-sniffed rather than split into two modules,
 *  so the worker and the main thread run the SAME decoder and the equivalence
 *  is by construction, not by review. */
function make2d(w: number, h: number): { canvas: { width: number; height: number }; ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D } {
  if (typeof document === "undefined") {
    const canvas = new OffscreenCanvas(w, h);
    return { canvas, ctx: canvas.getContext("2d", { willReadFrequently: true })! };
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return { canvas, ctx };
}

async function decodeDng(bytes: Uint8Array, file?: ImportedFile): Promise<DecodedImage> {
  const ifds = new Tiff(bytes).allIfds();

  // Lossy linear DNG (8-bit) -> native baseline-JPEG decode.
  const linearRaw = ifds.find(
    (d) => d.num(254)[0] === 0 && d.num(262)[0] === PHOTO_LINEAR_RAW && isJpegComp(d.num(259)[0]),
  );
  if (linearRaw) {
    return { ...(await decodeTiledJpeg(bytes, linearRaw)), isRaw: true, rotate: orientationToRotate(ifds) };
  }

  // Mosaiced DNG -> pure-JS decode + demosaic (Compression 7 = lossless JPEG,
  // Compression 1 = uncompressed, used by the bundled example files).
  const cfaRaw = ifds.find(
    (d) => d.num(254)[0] === 0 && d.num(262)[0] === PHOTO_CFA && (d.num(259)[0] === COMP_JPEG || d.num(259)[0] === 1),
  );
  if (cfaRaw) {
    const img = decodeMosaicedDng(bytes, cfaRaw);
    const cm = readCameraMatrix(ifds) ?? nikonColorMatrix(cameraModel(ifds));
    return {
      width: img.width,
      height: img.height,
      linear: img.linear,
      camMatrix: camToSrgbLinear(cm),
      isRaw: true,
      rotate: orientationToRotate(ifds),
    };
  }

  // Fallback: embedded preview. A third-party raw (CR2/ARW/… — TIFF-based, so
  // it sniffs as "dng") lands here: the open SUCCEEDS but the user must be
  // told it's the baked-in JPEG preview, not their raw data.
  const preview = pickLargestPreview(bytes, ifds);
  if (preview) {
    const decoded = await decodeBitmap(preview);
    const notice = file?.rawBrand
      ? `This is a ${file.rawBrand} raw file — the app opened its built-in JPEG preview, not the raw data. ` +
        "For true raw editing, convert it to DNG with the free Adobe DNG Converter."
      : undefined;
    return { ...decoded, isRaw: false, previewNotice: notice };
  }
  const isDngByName = /\.dng$/i.test(file?.name ?? "");
  throw new Error(
    file?.rawBrand
      ? `This is a ${file.rawBrand} raw file, which this app can't decode. ` +
        "Convert it to DNG with the free Adobe DNG Converter and it will open here."
      : isDngByName
        ? "No decodable image found in this DNG."
        : "No decodable image found in this TIFF file.",
  );
}

/** Camera Model string (tag 272) from any IFD that carries it. */
export function cameraModel(ifds: Ifd[]): string | undefined {
  for (const d of ifds) {
    const m = d.str(272);
    if (m) return m;
  }
  return undefined;
}

/** Camera ColorMatrix (XYZ -> camera), preferring the daylight calibration.
 *  Adobe DNGs carry two: ColorMatrix1 for CalibrationIlluminant1 (often
 *  Illuminant A / tungsten) and ColorMatrix2 for CalibrationIlluminant2
 *  (usually D65). IR shooting is daylight-only and dcraw/LibRaw likewise
 *  render from the D65 matrix — picking the tungsten one bends every color
 *  (the D5300 twins mismatched exactly this way, 2026-07-25). */
export function readCameraMatrix(ifds: Ifd[]): number[] | undefined {
  // EXIF LightSource ranking, best first: D65, D55, D75, D50, daylight/fine
  // weather, untagged, then anything else (tungsten et al).
  const rank = (ill: number | undefined) =>
    ill === 21 ? 0 : ill === 20 ? 1 : ill === 22 ? 2 : ill === 23 ? 3 : ill === 1 || ill === 9 ? 4 : ill === undefined ? 5 : 6;
  let best: number[] | undefined;
  let bestRank = Infinity;
  for (const d of ifds) {
    for (const [mTag, iTag] of [
      [50722, 50779],
      [50721, 50778],
    ] as const) {
      const cm = d.num(mTag);
      if (cm.length !== 9) continue;
      const r = rank(d.num(iTag)[0]);
      if (r < bestRank) {
        bestRank = r;
        best = cm;
      }
    }
  }
  return best;
}

function isJpegComp(c: number | undefined) {
  return c === COMP_JPEG || c === COMP_LOSSY_DNG;
}

/** Decode a tiled or single-strip baseline-JPEG image and composite it. */
async function decodeTiledJpeg(bytes: Uint8Array, ifd: Ifd): Promise<{ width: number; height: number; pixels: Uint8ClampedArray }> {
  const width = ifd.num(256)[0];
  const height = ifd.num(257)[0];
  const { ctx } = make2d(width, height);

  const tileOffsets = ifd.num(324);
  if (tileOffsets.length) {
    const tileW = ifd.num(322)[0];
    const tileH = ifd.num(323)[0];
    const counts = ifd.num(325);
    const across = Math.ceil(width / tileW);
    for (let i = 0; i < tileOffsets.length; i++) {
      const bmp = await createImageBitmap(toBlob(slice(bytes, tileOffsets[i], counts[i])));
      ctx.drawImage(bmp, (i % across) * tileW, Math.floor(i / across) * tileH);
      bmp.close();
    }
  } else {
    const stripOffsets = ifd.num(273);
    const stripCounts = ifd.num(279);
    const rowsPerStrip = ifd.num(278)[0] || height;
    for (let i = 0; i < stripOffsets.length; i++) {
      const bmp = await createImageBitmap(toBlob(slice(bytes, stripOffsets[i], stripCounts[i])));
      ctx.drawImage(bmp, 0, i * rowsPerStrip);
      bmp.close();
    }
  }
  const { data } = ctx.getImageData(0, 0, width, height);
  return { width, height, pixels: data };
}

function slice(bytes: Uint8Array, offset: number, length: number) {
  return bytes.subarray(offset, offset + length);
}

export function pickLargestPreview(bytes: Uint8Array, ifds: Ifd[]): Uint8Array | undefined {
  const cands: { off: number; len: number; area: number }[] = [];
  for (const d of ifds) {
    const w = d.num(256)[0] ?? 0;
    const h = d.num(257)[0] ?? 0;
    if (d.num(259)[0] === COMP_JPEG && d.num(273).length) {
      cands.push({ off: d.num(273)[0], len: d.num(279)[0], area: w * h });
    }
    if (d.num(513).length) {
      cands.push({ off: d.num(513)[0], len: d.num(514)[0], area: w * h });
    }
  }
  cands.sort((a, b) => b.area - a.area || b.len - a.len);
  for (const c of cands) {
    const s = slice(bytes, c.off, c.len);
    if (s[0] === 0xff && s[1] === 0xd8) return s;
  }
  return undefined;
}
