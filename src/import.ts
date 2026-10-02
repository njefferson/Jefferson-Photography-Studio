// Hardened image import. Handles the iOS pitfall where files chosen from the
// Photo Library arrive transcoded to JPEG, and supports zips (the reliable way
// to move a RAW file through iOS untouched).

import { readZip, pickImageEntry } from "./zip";
import { sniffLook } from "./look";

// "look" is a shared-look file (.ipslook.json, or .ipslook from before decision
// 063), not an image — the editor intercepts it before any decode. Look-inside-zip is unsupported on purpose
// (pickImageEntry only surfaces images).
export type ImageKind = "dng" | "nef" | "tiff" | "jpeg" | "png" | "look" | "unknown";

export interface ImportedFile {
  name: string;
  kind: ImageKind;
  bytes: Uint8Array;
  /** True when a RAW/DNG was expected by extension but the bytes are a JPEG. */
  looksTranscoded: boolean;
  /** "Canon CR2", "Sony ARW", … when the file is a third-party camera RAW the
   *  app can't truly decode. The decoder uses it to be honest about opening
   *  only the embedded preview (see decode.ts) instead of silently passing
   *  the preview off as the raw. */
  rawBrand?: string;
  /** Location-data guard (set by main.ts guardLocation, from src/gps.ts):
   *  the file's ORIGINAL bytes carried GPS location. `locationCleaned` means
   *  the strip-on-open setting wiped the app's working copy — the user's
   *  original file on disk still carries it (the 🛰 tip says so). */
  hadLocation?: boolean;
  locationCleaned?: boolean;
}

// Third-party camera RAWs the app recognizes but cannot decode as raw sensor
// data. Extension is the honest, cheap signal (these arrive named by the
// camera); CR2 also gets a magic check since it shares the TIFF container.
const RAW_BRANDS: Record<string, string> = {
  cr2: "Canon CR2",
  cr3: "Canon CR3",
  arw: "Sony ARW",
  nrw: "Nikon NRW",
  orf: "Olympus ORF",
  rw2: "Panasonic RW2",
  pef: "Pentax PEF",
  srw: "Samsung SRW",
  raf: "Fujifilm RAF",
};

/** Identify a third-party RAW by extension (plus the CR2 magic, which shares
 *  the TIFF container: "CR",2 at offset 8). Returns e.g. "Canon CR2". */
export function rawBrand(name: string, bytes: Uint8Array): string | undefined {
  if (bytes.length > 10 && bytes[8] === 0x43 && bytes[9] === 0x52 && bytes[10] === 0x02) return RAW_BRANDS.cr2;
  const ext = name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return ext ? RAW_BRANDS[ext] : undefined;
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
  if (sniffLook(bytes)) return "look";
  return "unknown";
}

/** HOW LONG ONE FILE'S READ MAY RUN before the reader is OFFERED a way out
 *  (decision 075): a minute, plus a second for every megabyte of it.
 *
 *  An offer, never a verdict. A read that neither finishes nor fails is a real
 *  thing on the reader's own devices — a cloud placeholder not yet downloaded,
 *  a drive that has gone away (reported from a PC, 2026-09-18) — and an open
 *  holds the one-open guard until its last read settles. But a read that is
 *  merely SLOW is not a dead one: a fully hydrating placeholder delivers no
 *  bytes at all until the whole file is local, so nothing in the timing tells
 *  the two apart, and giving up on a slow one loses a photograph that was on
 *  its way. So when this much time has passed the reader is offered a way to
 *  skip it — on the busy card, or, once a set has a photo on screen, as the
 *  Skip beside Done (main.ts `repaintSkip`); the read goes on until it
 *  finishes or the reader chooses. The clock is main.ts `readOrSkip`'s.
 *
 *  Takes `bytes`, the file's size. Returns milliseconds. What callers rely on:
 *  it grows with the size and never falls below 60 000. */
export function readLimitMs(bytes: number): number {
  return 60_000 + Math.ceil(Math.max(0, bytes) / 1e6) * 1000;
}

/** Read a picked file into the shape every open path works with.
 *
 *  Takes `file`, as the picker, a drop or the Quick look handed it, and
 *  optionally `read`, how to read its bytes — by default a plain read with no
 *  time limit, which is what the Quick look and a batch use: neither holds the
 *  one-open guard, and a batch has its own Stop. The paths that do hold the
 *  guard pass main.ts `readOrSkip`, which offers the reader a way out of a read
 *  that does not finish. Pulls the first image out of a zip, and works out the
 *  kind from the bytes rather than the name.
 *
 *  Returns the name, kind and bytes, with `looksTranscoded` set when a raw's
 *  name arrived holding a JPEG. What callers rely on: it rejects when `read`
 *  does, when a zip holds no image or cannot be unpacked, or when this browser
 *  cannot unzip at all. Any other bytes resolve — with kind "unknown" when
 *  their signature is not recognised — and it is the decode that refuses
 *  those. The caller decides how a rejection is listed: a first read, at an
 *  open or in the head start, as a photo that "couldn't be opened"; main.ts
 *  `writeAgainAfterFreeing`'s re-read of a parked photo, which had already
 *  opened, as "opened but couldn't be stored on this device". */
export async function importFile(file: File, read: (f: File) => Promise<ArrayBuffer> = (f) => f.arrayBuffer()): Promise<ImportedFile> {
  const buf = await read(file);
  const lower = file.name.toLowerCase();

  // Zip: extract the first real image entry.
  if (lower.endsWith(".zip") || isZip(buf)) {
    if (typeof DecompressionStream === "undefined") {
      throw new Error(
        "ZIP import needs a newer browser (Safari 16.4+, Chrome, Edge, or Firefox 113+). " +
          "Tip: import the RAW file directly from Files instead — that works here.",
      );
    }
    const entry = pickImageEntry(await readZip(buf));
    if (!entry) throw new Error("Zip contained no recognizable image file.");
    const name = entry.name.split("/").pop() ?? entry.name;
    return {
      name,
      kind: refineKind(sniff(entry.bytes), name),
      bytes: entry.bytes,
      looksTranscoded: false,
      rawBrand: rawBrand(name, entry.bytes),
    };
  }

  const bytes = new Uint8Array(buf);
  const kind = refineKind(sniff(bytes), file.name);
  // Expected RAW by name but got a JPEG => iOS transcoded it.
  const expectedRaw = /\.(dng|nef|raw|arw|cr2|cr3|raf)$/i.test(lower);
  const looksTranscoded = expectedRaw && kind === "jpeg";

  return { name: file.name, kind, bytes, looksTranscoded, rawBrand: kind === "jpeg" ? undefined : rawBrand(file.name, bytes) };
}

// NEF and DNG share the TIFF magic; the extension disambiguates.
/** A NEF and a DNG are the same magic number — only the NAME tells them apart,
 *  so every caller of `sniff` that has a filename must come through here.
 *  Exported because the lens rig did not, and read sixteen raws as previews. */
export function refineKind(kind: ImageKind, name: string): ImageKind {
  if (kind === "dng" && /\.nef$/i.test(name)) return "nef";
  return kind;
}

/** IS THIS A ZIP, BY ITS FIRST BYTES?
 *
 *  Takes `buf`, at least the head of a file. Returns true for the local-file
 *  and empty-archive signatures. What the caller relies on: the NAME is never
 *  consulted — a reader's archive may be called anything, and routing by
 *  content is the rule this app already follows for looks and keep files.
 *  Exported so the LUT importer asks the same question in the same way; two
 *  copies of one test is a check that can disagree with itself. */
export function isZip(buf: ArrayBuffer): boolean {
  const b = new Uint8Array(buf, 0, Math.min(4, buf.byteLength));
  return b[0] === 0x50 && b[1] === 0x4b && (b[2] === 0x03 || b[2] === 0x05);
}
