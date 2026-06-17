// Image decoding.
//
// Phase 1 gets pixels on screen so the edit pipeline is real and testable:
//   - JPEG/PNG decode natively via createImageBitmap.
//   - DNG/TIFF: extract the largest embedded JPEG preview (parsing the TIFF
//     IFDs) and decode that.
//
// Phase 1 follow-up (see PLAN.md): swap `decodeDng` to a LibRaw-WASM full RAW
// decode so white balance operates on true linear sensor data with no 2000K
// floor. The DecodedImage contract below stays identical, so nothing else
// changes when that lands.

import type { ImportedFile } from "./import";

export interface DecodedImage {
  width: number;
  height: number;
  /** 8-bit RGBA, row-major. */
  pixels: Uint8ClampedArray;
  /** False while we are showing an embedded preview rather than raw sensor data. */
  isRaw: boolean;
}

export async function decode(file: ImportedFile): Promise<DecodedImage> {
  if (file.kind === "jpeg" || file.kind === "png") {
    return { ...(await decodeBitmap(file.bytes)), isRaw: false };
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

async function decodeBitmap(bytes: Uint8Array): Promise<Omit<DecodedImage, "isRaw">> {
  const blob = toBlob(bytes);
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bmp, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, bmp.width, bmp.height);
  bmp.close();
  return { width, height, pixels: data };
}

async function decodeDng(bytes: Uint8Array): Promise<DecodedImage> {
  const jpeg = extractLargestEmbeddedJpeg(bytes);
  if (!jpeg) {
    throw new Error(
      "No embedded preview found. Full RAW decode (LibRaw-WASM) is the next integration step.",
    );
  }
  return { ...(await decodeBitmap(jpeg)), isRaw: false };
}

// --- minimal TIFF/DNG IFD walk to find embedded JPEG previews ---

interface JpegCandidate {
  offset: number;
  length: number;
  area: number;
}

function extractLargestEmbeddedJpeg(bytes: Uint8Array): Uint8Array | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const le = bytes[0] === 0x49;
  if (!le && bytes[0] !== 0x4d) return undefined;
  const u16 = (o: number) => view.getUint16(o, le);
  const u32 = (o: number) => view.getUint32(o, le);

  const candidates: JpegCandidate[] = [];
  const seen = new Set<number>();

  const walk = (ifdOffset: number) => {
    if (ifdOffset <= 0 || ifdOffset >= bytes.length || seen.has(ifdOffset)) return;
    seen.add(ifdOffset);
    const n = u16(ifdOffset);
    const tags: Record<number, number> = {};
    const subIfds: number[] = [];
    for (let i = 0; i < n; i++) {
      const e = ifdOffset + 2 + i * 12;
      const tag = u16(e);
      const type = u16(e + 2);
      const count = u32(e + 4);
      const valOff = e + 8;
      const val = type === 3 ? u16(valOff) : u32(valOff); // SHORT vs LONG
      tags[tag] = val;
      if (tag === 330) {
        // SubIFDs: array of offsets (or inline if one).
        if (count === 1) subIfds.push(val);
        else for (let k = 0; k < count; k++) subIfds.push(u32(val + k * 4));
      }
    }
    // Compression 7 = JPEG; single-strip preview.
    const width = tags[256] ?? 0;
    const height = tags[257] ?? 0;
    if (tags[259] === 7 && tags[273] && tags[279]) {
      candidates.push({ offset: tags[273], length: tags[279], area: width * height });
    }
    // Old-style thumbnail.
    if (tags[513] && tags[514]) {
      candidates.push({ offset: tags[513], length: tags[514], area: width * height });
    }
    for (const s of subIfds) walk(s);
    const next = u32(ifdOffset + 2 + n * 12);
    walk(next);
  };

  walk(u32(4));

  candidates.sort((a, b) => b.area - a.area || b.length - a.length);
  for (const c of candidates) {
    const slice = bytes.subarray(c.offset, c.offset + c.length);
    if (slice[0] === 0xff && slice[1] === 0xd8) return slice; // valid JPEG SOI
  }
  return undefined;
}
