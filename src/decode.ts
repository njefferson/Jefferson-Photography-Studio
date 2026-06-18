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
import { camToSrgbLinear, NIKON_Z50_COLOR_MATRIX } from "./color";

export interface DecodedImage {
  width: number;
  height: number;
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
    const img = decodeNef(file.bytes);
    return {
      width: img.width,
      height: img.height,
      linear: img.linear,
      camMatrix: camToSrgbLinear(NIKON_Z50_COLOR_MATRIX),
      isRaw: true,
    };
  }
  if (file.kind === "dng" || file.kind === "tiff") {
    return decodeDng(file.bytes);
  }
  throw new Error(`Unsupported file type: ${file.kind}`);
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

function make2d(w: number, h: number) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  return { canvas, ctx };
}

async function decodeDng(bytes: Uint8Array): Promise<DecodedImage> {
  const ifds = new Tiff(bytes).allIfds();

  // Lossy linear DNG (8-bit) -> native baseline-JPEG decode.
  const linearRaw = ifds.find(
    (d) => d.num(254)[0] === 0 && d.num(262)[0] === PHOTO_LINEAR_RAW && isJpegComp(d.num(259)[0]),
  );
  if (linearRaw) {
    return { ...(await decodeTiledJpeg(bytes, linearRaw)), isRaw: true };
  }

  // Mosaiced DNG (14-bit, lossless JPEG) -> pure-JS LJ92 + demosaic.
  const cfaRaw = ifds.find(
    (d) => d.num(254)[0] === 0 && d.num(262)[0] === PHOTO_CFA && d.num(259)[0] === COMP_JPEG,
  );
  if (cfaRaw) {
    const img = decodeMosaicedDng(bytes, cfaRaw);
    const cm = readColorMatrix1(ifds) ?? NIKON_Z50_COLOR_MATRIX;
    return {
      width: img.width,
      height: img.height,
      linear: img.linear,
      camMatrix: camToSrgbLinear(cm),
      isRaw: true,
    };
  }

  // Fallback: embedded preview.
  const preview = pickLargestPreview(bytes, ifds);
  if (preview) return { ...(await decodeBitmap(preview)), isRaw: false };
  throw new Error("No decodable image found in this DNG.");
}

/** ColorMatrix1 (tag 50721, 9 SRATIONAL) from any IFD that carries it. */
function readColorMatrix1(ifds: Ifd[]): number[] | undefined {
  for (const d of ifds) {
    const cm = d.num(50721);
    if (cm.length === 9) return cm;
  }
  return undefined;
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

function pickLargestPreview(bytes: Uint8Array, ifds: Ifd[]): Uint8Array | undefined {
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
