// Minimal ZIP reader — no dependencies. Enough to pull real entries (e.g. a
// .dng) out of a zip created by iOS/macOS "Compress". Uses the browser's
// DecompressionStream for deflated entries; supports stored entries.
//
// We support zips because uploading a zip is the reliable way to get a RAW file
// through iOS without it being transcoded to JPEG. See PLAN.md "Import hardening".
//
// TWO WAYS IN, and the difference is memory. `readZip` takes an ArrayBuffer and
// decompresses EVERY entry at once, which is right for the editor: it wants one
// photo out of a zip that is already in memory. The lens rig wants forty raw
// frames out of a zip that may be a gigabyte, and it only needs one at a time —
// so `readZipIndex`/`readZipEntry` work off a Blob and read only the byte
// ranges they need, never holding more than a single entry. Both share one
// central-directory parser; the rule against two implementations of one format
// is why `readZip` is written on top of them rather than beside them.

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export interface ZipIndexEntry {
  name: string;
  /** 0 = stored, 8 = deflate. */
  method: number;
  /** Compressed size in bytes — what has to be read to get this entry out. */
  compSize: number;
  localHeaderOffset: number;
}

/** How many bytes at the end of a zip can hold the end-of-central-directory
 *  record: its own 22 plus a comment field of up to 65535. */
const EOCD_MAX = 22 + 0xffff;

function parseEocd(view: DataView, base: number): { count: number; cdOffset: number; cdSize: number } {
  // Scan backwards — a comment may follow the record, so its position is not
  // fixed and the signature is the only anchor.
  for (let i = view.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      return {
        count: view.getUint16(i + 10, true),
        cdSize: view.getUint32(i + 12, true),
        cdOffset: view.getUint32(i + 16, true) - base,
      };
    }
  }
  throw new Error("Not a valid zip (no end-of-central-directory).");
}

/** Read a central directory that has already been sliced out, at `p` bytes in.
 *  `p` is relative to `view`; entry offsets stay absolute, as the zip records
 *  them. */
function parseCentral(view: DataView, bytes: Uint8Array, p: number, count: number): ZipIndexEntry[] {
  const entries: ZipIndexEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (p + 46 > view.byteLength || view.getUint32(p, true) !== SIG_CEN) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    if (!name.endsWith("/")) entries.push({ name, method, compSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** List a zip's entries WITHOUT decompressing any of them, reading only the
 *  tail and the central directory. Cheap enough to run on a file far too large
 *  to hold in memory. */
export async function readZipIndex(file: Blob): Promise<ZipIndexEntry[]> {
  const tailLen = Math.min(EOCD_MAX, file.size);
  const tailStart = file.size - tailLen;
  const tail = new Uint8Array(await file.slice(tailStart).arrayBuffer());
  const { count, cdOffset, cdSize } = parseEocd(new DataView(tail.buffer, tail.byteOffset, tail.byteLength), tailStart);
  // The directory is usually inside the tail already; slice it only if not.
  if (cdOffset >= 0 && cdOffset + cdSize <= tail.byteLength) {
    return parseCentral(new DataView(tail.buffer, tail.byteOffset, tail.byteLength), tail, cdOffset, count);
  }
  const abs = cdOffset + tailStart;
  const cd = new Uint8Array(await file.slice(abs, abs + cdSize).arrayBuffer());
  return parseCentral(new DataView(cd.buffer, cd.byteOffset, cd.byteLength), cd, 0, count);
}

/** Pull ONE entry out, reading only its own bytes. */
export async function readZipEntry(file: Blob, e: ZipIndexEntry): Promise<Uint8Array> {
  // The local header repeats the name and carries its own extra field, whose
  // length need not match the central directory's — so the data offset can
  // only be worked out from the local header itself.
  const head = new Uint8Array(await file.slice(e.localHeaderOffset, e.localHeaderOffset + 30).arrayBuffer());
  const hv = new DataView(head.buffer, head.byteOffset, head.byteLength);
  if (head.byteLength < 30 || hv.getUint32(0, true) !== SIG_LOCAL) throw new Error(`Zip entry "${e.name}" has no local header.`);
  const dataStart = e.localHeaderOffset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
  const comp = new Uint8Array(await file.slice(dataStart, dataStart + e.compSize).arrayBuffer());
  return e.method === 0 ? comp : inflateRaw(comp);
}

/** ONE list, in preference order — richest format first, since `pickImageEntry`
 *  reads it as a priority. Two copies of this list is how a zip comes out as a
 *  JPEG in one place and a DNG in another. */
const IMAGE_EXTS = [".dng", ".nef", ".tif", ".tiff", ".heic", ".heif", ".jpg", ".jpeg", ".png"];

/** macOS "Compress" puts a resource fork beside every file; neither is an image
 *  and both would otherwise be measured. */
const isReal = (name: string) => !name.includes("__MACOSX/") && !(name.split("/").pop() ?? name).startsWith("._");
const isImage = (name: string) => IMAGE_EXTS.some((x) => (name.split("/").pop() ?? name).toLowerCase().endsWith(x));

/** Every image entry, in the zip's own order, skipping macOS resource forks. */
export function imageEntries<T extends { name: string }>(entries: T[]): T[] {
  return entries.filter((e) => isReal(e.name) && isImage(e.name));
}

/** Returns every file entry in the zip, decompressed. */
export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const blob = new Blob([buf]);
  const index = await readZipIndex(blob);
  const out: ZipEntry[] = [];
  for (const e of index) out.push({ name: e.name, bytes: await readZipEntry(blob, e) });
  return out;
}

async function inflateRaw(comp: Uint8Array): Promise<Uint8Array> {
  const copy = new Uint8Array(comp.byteLength);
  copy.set(comp);
  const ds = new DecompressionStream("deflate-raw");
  const stream = new Blob([copy]).stream().pipeThrough(ds);
  const ab = await new Response(stream).arrayBuffer();
  return new Uint8Array(ab);
}

// --- ZIP writer (store method, no compression) --------------------------
// JPEGs/TIFFs are already compressed, so we bundle them uncompressed — that
// keeps the writer tiny (no DEFLATE) and the CPU cost near zero, which matters
// when batch-processing dozens of full-res frames on an iPad. Enough for the
// batch export to hand back one .zip through the share sheet.

let CRC_TABLE: Uint32Array | null = null;
export function crc32(bytes: Uint8Array): number {
  if (!CRC_TABLE) {
    CRC_TABLE = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** DOS date/time from a JS Date (local time), for the zip headers. */
function dosDateTime(d: Date): { time: number; date: number } {
  const time = ((d.getHours() & 31) << 11) | ((d.getMinutes() & 63) << 5) | ((d.getSeconds() >> 1) & 31);
  const date = (((d.getFullYear() - 1980) & 127) << 9) | (((d.getMonth() + 1) & 15) << 5) | (d.getDate() & 31);
  return { time, date };
}

/** An entry for writeZip. `data` may be a Blob — browsers keep large Blob
 *  parts disk-backed, so a zip of Blobs never materializes fully in RAM;
 *  that's why crc/size are passed in rather than computed here. */
export interface ZipWriteEntry {
  name: string;
  size: number;
  crc: number;
  data: Blob | Uint8Array;
}

/** Build a .zip from a set of entries (stored, uncompressed). Names are
 *  written as UTF-8 with the language-encoding flag set. */
export function writeZip(files: ZipWriteEntry[], modified: Date): Blob {
  const { time, date } = dosDateTime(modified);
  const enc = new TextEncoder();
  const locals: BlobPart[] = [];
  const centrals: BlobPart[] = [];
  let offset = 0;
  let cdSize = 0;

  for (const f of files) {
    const nameBytes = enc.encode(f.name);
    const { crc, size } = f;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, SIG_LOCAL, true);
    lv.setUint16(4, 20, true); // version needed
    lv.setUint16(6, 0x0800, true); // flags: UTF-8 names
    lv.setUint16(8, 0, true); // method: store
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true); // compressed
    lv.setUint32(22, size, true); // uncompressed
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true); // extra len
    local.set(nameBytes, 30);
    locals.push(local, f.data as unknown as BlobPart);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, SIG_CEN, true);
    cv.setUint16(4, 20, true); // version made by
    cv.setUint16(6, 20, true); // version needed
    cv.setUint16(8, 0x0800, true); // flags: UTF-8
    cv.setUint16(10, 0, true); // method: store
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true); // local header offset
    central.set(nameBytes, 46);
    centrals.push(central);
    cdSize += central.length;

    offset += local.length + size;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, SIG_EOCD, true);
  ev.setUint16(8, files.length, true); // entries this disk
  ev.setUint16(10, files.length, true); // total entries
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true); // central dir offset

  return new Blob([...locals, ...centrals, eocd], { type: "application/zip" });
}

/** Pick the most likely image entry from a zip (skips macOS resource forks). */
export function pickImageEntry(entries: ZipEntry[]): ZipEntry | undefined {
  const real = entries.filter((e) => isReal(e.name));
  for (const ext of IMAGE_EXTS) {
    const hit = real.find((e) => e.name.toLowerCase().endsWith(ext));
    if (hit) return hit;
  }
  return real[0];
}
