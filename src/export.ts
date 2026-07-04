// Full-resolution export. Re-decodes raw at native resolution (the live view
// uses a half-res proxy), applies the exact edit pipeline on the CPU, and saves
// a JPEG or 16-bit TIFF to the device.

import { compileEdit, toLinear8, type EditParams } from "./pipeline";
import { demosaicPixelLinear, type RawCfa } from "./raw/demosaic";
import { readMosaicedCfa } from "./raw/dngRaw";
import { readNefCfa } from "./raw/nef";
import { Tiff } from "./raw/tiff";
import { camToSrgbLinear, NIKON_Z50_COLOR_MATRIX } from "./color";
import { makeRowDenoiser } from "./raw/denoise";
import { buildGlowMap, sampleGlow, GLOW_GAIN } from "./glow";
import type { ImportedFile } from "./import";
import type { DecodedImage } from "./decode";

export type ExportFormat = "jpeg" | "tiff";

export interface ExportOptions {
  format: ExportFormat;
  scale: number; // 1 = native
  quality: number; // JPEG quality 0..1
  rotate?: number; // display rotation, 90-degree CW steps (0..3)
}

type Source =
  | { cfa: RawCfa; cam: number[] }
  | { pixels: Uint8ClampedArray; width: number; height: number };

export interface ExportResult {
  blob: Blob;
  name: string;
}

/** Yield to the event loop so the progress UI can paint mid-export. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportImage(
  file: ImportedFile,
  current: DecodedImage,
  params: EditParams,
  opts: ExportOptions,
  onProgress?: (fraction: number) => void,
): Promise<ExportResult> {
  const src = getSource(file, current);
  const srcW = "cfa" in src ? src.cfa.width : src.width;
  const srcH = "cfa" in src ? src.cfa.height : src.height;
  const rot = ((opts.rotate ?? 0) % 4 + 4) % 4;
  const outW = rot & 1 ? srcH : srcW;
  const outH = rot & 1 ? srcW : srcH;
  const w = Math.max(1, Math.round(outW * opts.scale));
  const h = Math.max(1, Math.round(outH * opts.scale));
  // Output pixel -> source pixel, applying the display rotation (same mapping
  // as the preview shader).
  const toSrc = (x: number, y: number): [number, number] => {
    const u = (x + 0.5) / w;
    const v = (y + 0.5) / h;
    let iu = u, iv = v;
    if (rot === 1) { iu = v; iv = 1 - u; }
    else if (rot === 2) { iu = 1 - u; iv = 1 - v; }
    else if (rot === 3) { iu = 1 - v; iv = u; }
    return [
      Math.min(srcW - 1, Math.floor(iu * srcW)),
      Math.min(srcH - 1, Math.floor(iv * srcH)),
    ];
  };

  // The matrix is applied inside the edit (after white balance), matching the
  // shader exactly so the export matches the preview.
  const edit = compileEdit(params, "cfa" in src ? src.cam : undefined);
  const out = new Float32Array(3);
  const baseName = file.name.replace(/\.[^.]+$/, "");

  // Camera-native linear RGB at a source pixel; denoise wraps the sampler so it
  // acts on linear data BEFORE white balance/exposure amplify the noise.
  const rawSample =
    "cfa" in src
      ? (x: number, y: number) => demosaicPixelLinear(src.cfa, x, y)
      : (x: number, y: number) => {
          const i = (y * src.width + x) * 4;
          return [toLinear8(src.pixels[i]), toLinear8(src.pixels[i + 1]), toLinear8(src.pixels[i + 2])] as [number, number, number];
        };
  const sampleLinear = makeRowDenoiser(rawSample, srcW, srcH, params.denoise);
  // HIE glow map at full resolution (cheap: built on a coarse grid).
  const gmap = params.glow > 0 ? buildGlowMap(rawSample, srcW, srcH) : null;
  const glowAt = (sx: number, sy: number) =>
    gmap ? params.glow * GLOW_GAIN * sampleGlow(gmap, (sx + 0.5) / srcW, (sy + 0.5) / srcH) : 0;

  // When rotated 90/270, the outer loop follows output COLUMNS so that source
  // rows stay constant per pass (keeps the denoiser's row cache effective).
  const outerN = rot & 1 ? w : h;
  const innerN = rot & 1 ? h : w;

  if (opts.format === "jpeg") {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let oIdx = 0; oIdx < outerN; oIdx++) {
      if (oIdx % 16 === 0) {
        onProgress?.(oIdx / outerN);
        await tick();
      }
      for (let iIdx = 0; iIdx < innerN; iIdx++) {
        const x = rot & 1 ? oIdx : iIdx;
        const y = rot & 1 ? iIdx : oIdx;
        const [sx, sy] = toSrc(x, y);
        const [r, g, b] = sampleLinear(sx, sy);
        edit(r, g, b, out, glowAt(sx, sy));
        const o = (y * w + x) * 4;
        data[o] = out[0] * 255;
        data[o + 1] = out[1] * 255;
        data[o + 2] = out[2] * 255;
        data[o + 3] = 255;
      }
    }
    onProgress?.(1);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")!.putImageData(new ImageData(data, w, h), 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", opts.quality));
    if (!blob) throw new Error("JPEG encoding failed.");
    return { blob, name: `${baseName}.jpg` };
  } else {
    const rgb = new Uint16Array(w * h * 3);
    for (let oIdx = 0; oIdx < outerN; oIdx++) {
      if (oIdx % 16 === 0) {
        onProgress?.(oIdx / outerN);
        await tick();
      }
      for (let iIdx = 0; iIdx < innerN; iIdx++) {
        const x = rot & 1 ? oIdx : iIdx;
        const y = rot & 1 ? iIdx : oIdx;
        const [sx, sy] = toSrc(x, y);
        const [r, g, b] = sampleLinear(sx, sy);
        edit(r, g, b, out, glowAt(sx, sy));
        const o = (y * w + x) * 3;
        rgb[o] = out[0] * 65535;
        rgb[o + 1] = out[1] * 65535;
        rgb[o + 2] = out[2] * 65535;
      }
    }
    onProgress?.(1);
    return { blob: new Blob([writeTiff16(rgb, w, h)], { type: "image/tiff" }), name: `${baseName}.tif` };
  }
}

function getSource(file: ImportedFile, current: DecodedImage): Source {
  if (file.kind === "nef") {
    return { cfa: readNefCfa(file.bytes), cam: camToSrgbLinear(NIKON_Z50_COLOR_MATRIX) };
  }
  if (file.kind === "dng") {
    const ifds = new Tiff(file.bytes).allIfds();
    const raw = ifds.find((d) => d.num(254)[0] === 0 && d.num(262)[0] === 32803 && (d.num(259)[0] === 7 || d.num(259)[0] === 1));
    if (raw) {
      const cm = ifds.map((d) => d.num(50721)).find((v) => v.length === 9) ?? NIKON_Z50_COLOR_MATRIX;
      return { cfa: readMosaicedCfa(file.bytes, raw), cam: camToSrgbLinear(cm) };
    }
  }
  // Non-mosaiced (JPEG/PNG/lossy-linear DNG/preview): the decode is already
  // full-resolution 8-bit.
  if (!current.pixels) throw new Error("No full-resolution source available to export.");
  return { pixels: current.pixels, width: current.width, height: current.height };
}

/** Minimal baseline TIFF: RGB, 16-bit/channel, uncompressed, single strip. */
export function writeTiff16(rgb: Uint16Array, w: number, h: number): ArrayBuffer {
  const entries = 11;
  const ifdOffset = 8;
  const ifdSize = 2 + entries * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize; // 3 shorts
  const sampleFmtOffset = bitsOffset + 6; // 3 shorts
  const dataOffset = sampleFmtOffset + 6;
  const dataBytes = w * h * 3 * 2;
  const buf = new ArrayBuffer(dataOffset + dataBytes);
  const dv = new DataView(buf);
  // Header (little-endian).
  dv.setUint16(0, 0x4949, true);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOffset, true);
  dv.setUint16(ifdOffset, entries, true);

  let p = ifdOffset + 2;
  const tag = (id: number, type: number, count: number, value: number) => {
    dv.setUint16(p, id, true);
    dv.setUint16(p + 2, type, true);
    dv.setUint32(p + 4, count, true);
    dv.setUint32(p + 8, value, true);
    p += 12;
  };
  const SHORT = 3, LONG = 4;
  tag(256, LONG, 1, w); // ImageWidth
  tag(257, LONG, 1, h); // ImageLength
  tag(258, SHORT, 3, bitsOffset); // BitsPerSample -> [16,16,16]
  tag(259, SHORT, 1, 1); // Compression: none
  tag(262, SHORT, 1, 2); // Photometric: RGB
  tag(273, LONG, 1, dataOffset); // StripOffsets
  tag(277, SHORT, 1, 3); // SamplesPerPixel
  tag(278, LONG, 1, h); // RowsPerStrip
  tag(279, LONG, 1, dataBytes); // StripByteCounts
  tag(284, SHORT, 1, 1); // PlanarConfig: chunky
  tag(339, SHORT, 3, sampleFmtOffset); // SampleFormat -> [1,1,1] unsigned
  dv.setUint32(p, 0, true); // next IFD = 0

  for (let i = 0; i < 3; i++) {
    dv.setUint16(bitsOffset + i * 2, 16, true);
    dv.setUint16(sampleFmtOffset + i * 2, 1, true);
  }
  // Pixel data, little-endian 16-bit.
  const o = new Uint16Array(buf, dataOffset, w * h * 3);
  o.set(rgb);
  return buf;
}

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
