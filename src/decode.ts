// Image decoding.
//
// The win: the user's DNGs are *lossy linear* DNGs whose main raw image is
// stored as a baseline-JPEG tile (Compression 34892, PhotometricInterpretation
// 34892 = LinearRaw), gamma-2.2 encoded, BEFORE white balance. The browser can
// decode that JPEG natively, so we get true un-white-balanced sensor data with
// no LibRaw-WASM blob. The edit pipeline's `^2.2` linearization recovers the
// linear values (verified: 0.015 mean error vs LibRaw's linear output).
//
// Fallbacks:
//   - JPEG/PNG: native bitmap decode.
//   - DNG with no native-decodable raw (mosaiced CFA, or lossless 16-bit):
//     show the embedded preview and flag isRaw=false. Full RAW for those needs
//     LibRaw-WASM (future), but the user's lossy DNG export hits the fast path.

import type { ImportedFile } from "./import";

export interface DecodedImage {
  width: number;
  height: number;
  /** 8-bit RGBA, row-major. For raw, this is gamma-2.2-encoded linear sensor RGB. */
  pixels: Uint8ClampedArray;
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

// --- DNG ---

async function decodeDng(bytes: Uint8Array): Promise<DecodedImage> {
  const tiff = new Tiff(bytes);
  const ifds = tiff.allIfds();

  // Prefer the main raw image if it's natively decodable (lossy linear DNG).
  const raw = ifds.find(
    (d) =>
      d.num(254)[0] === 0 &&
      d.num(262)[0] === PHOTO_LINEAR_RAW &&
      isJpegComp(d.num(259)[0]),
  );
  if (raw) {
    return { ...(await decodeTiledJpeg(bytes, raw)), isRaw: true };
  }

  // Mosaiced or lossless raw we can't decode natively yet -> preview.
  const mosaiced = ifds.some((d) => d.num(262)[0] === PHOTO_CFA);
  const preview = pickLargestPreview(bytes, ifds);
  if (preview) {
    if (mosaiced) {
      console.info("Mosaiced raw — showing preview; full RAW needs LibRaw-WASM (future).");
    }
    return { ...(await decodeBitmap(preview)), isRaw: false };
  }
  throw new Error("No decodable image found in this DNG.");
}

function isJpegComp(c: number | undefined) {
  return c === COMP_JPEG || c === COMP_LOSSY_DNG;
}

/** Decode a tiled or single-strip JPEG-compressed image and composite it. */
async function decodeTiledJpeg(bytes: Uint8Array, ifd: Ifd): Promise<Omit<DecodedImage, "isRaw">> {
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
    // Strips, top to bottom.
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

// --- minimal TIFF reader ---

class Ifd {
  constructor(private tiff: Tiff, private entries: Map<number, [number, number, number]>) {}
  /** Returns the numeric value(s) for a tag, resolving out-of-line arrays. */
  num(tag: number): number[] {
    const e = this.entries.get(tag);
    if (!e) return [];
    return this.tiff.readNumbers(e[0], e[1], e[2]);
  }
  subIfdOffsets(): number[] {
    return this.num(330);
  }
}

class Tiff {
  private view: DataView;
  private le: boolean;
  constructor(private bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    this.le = bytes[0] === 0x49;
  }
  private u16(o: number) {
    return this.view.getUint16(o, this.le);
  }
  private u32(o: number) {
    return this.view.getUint32(o, this.le);
  }
  readNumbers(type: number, count: number, valueOffset: number): number[] {
    const size = type === 3 ? 2 : type === 4 || type === 11 ? 4 : type === 5 ? 8 : 1;
    const base = size * count <= 4 ? valueOffset : this.u32(valueOffset);
    const out: number[] = [];
    for (let i = 0; i < count; i++) {
      const p = base + i * size;
      if (type === 3) out.push(this.u16(p));
      else if (type === 4) out.push(this.u32(p));
      else if (type === 5) out.push(this.u32(p) / Math.max(1, this.u32(p + 4)));
      else out.push(this.view.getUint8(p));
    }
    return out;
  }
  private parseIfd(off: number): Ifd {
    const n = this.u16(off);
    const entries = new Map<number, [number, number, number]>();
    for (let i = 0; i < n; i++) {
      const e = off + 2 + i * 12;
      entries.set(this.u16(e), [this.u16(e + 2), this.u32(e + 4), e + 8]);
    }
    return new Ifd(this, entries);
  }
  /** All IFDs reachable from IFD0, including SubIFDs and the IFD chain. */
  allIfds(): Ifd[] {
    const out: Ifd[] = [];
    const seen = new Set<number>();
    const walk = (off: number) => {
      if (off <= 0 || off >= this.bytes.length || seen.has(off)) return;
      seen.add(off);
      const ifd = this.parseIfd(off);
      out.push(ifd);
      for (const s of ifd.subIfdOffsets()) walk(s);
      const n = this.u16(off);
      walk(this.u32(off + 2 + n * 12));
    };
    walk(this.u32(4));
    return out;
  }
}
