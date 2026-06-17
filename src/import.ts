// Hardened image import. Handles the iOS pitfall where files chosen from the
// Photo Library arrive transcoded to JPEG, and supports zips (the reliable way
// to move a RAW file through iOS untouched).

import { readZip, pickImageEntry } from "./zip";

export type ImageKind = "dng" | "tiff" | "jpeg" | "png" | "unknown";

export interface ImportedFile {
  name: string;
  kind: ImageKind;
  bytes: Uint8Array;
  /** True when a RAW/DNG was expected by extension but the bytes are a JPEG. */
  looksTranscoded: boolean;
}

/** Identify a file by its magic bytes, not its extension. */
export function sniff(bytes: Uint8Array): ImageKind {
  if (bytes.length < 12) return "unknown";
  // TIFF / DNG share the TIFF container: "II*\0" or "MM\0*".
  const le = bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00;
  const be = bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a;
  if (le || be) return "dng"; // DNG is TIFF-based; treat TIFF/DNG together, refine in decoder
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "jpeg";
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "png";
  return "unknown";
}

export async function importFile(file: File): Promise<ImportedFile> {
  const buf = await file.arrayBuffer();
  const lower = file.name.toLowerCase();

  // Zip: extract the first real image entry.
  if (lower.endsWith(".zip") || isZip(buf)) {
    const entry = pickImageEntry(await readZip(buf));
    if (!entry) throw new Error("Zip contained no recognizable image file.");
    const kind = sniff(entry.bytes);
    return {
      name: entry.name.split("/").pop() ?? entry.name,
      kind,
      bytes: entry.bytes,
      looksTranscoded: false,
    };
  }

  const bytes = new Uint8Array(buf);
  const kind = sniff(bytes);
  // Expected RAW by name but got a JPEG => iOS transcoded it.
  const expectedRaw = /\.(dng|nef|raw|arw|cr2|cr3|raf)$/i.test(lower);
  const looksTranscoded = expectedRaw && kind === "jpeg";

  return { name: file.name, kind, bytes, looksTranscoded };
}

function isZip(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05);
}
