// Minimal ZIP reader — no dependencies. Enough to pull the first real entry
// (e.g. a .dng) out of a zip created by iOS/macOS "Compress". Uses the
// browser's DecompressionStream for deflated entries; supports stored entries.
//
// We support zips because uploading a zip is the reliable way to get a RAW file
// through iOS without it being transcoded to JPEG. See PLAN.md "Import hardening".

interface CentralEntry {
  name: string;
  method: number; // 0 = stored, 8 = deflate
  compSize: number;
  localHeaderOffset: number;
}

const SIG_EOCD = 0x06054b50;
const SIG_CEN = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/** Returns every file entry in the zip, decompressed. */
export async function readZip(buf: ArrayBuffer): Promise<ZipEntry[]> {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);

  // Find End Of Central Directory by scanning backwards (comment may follow it).
  let eocd = -1;
  for (let i = buf.byteLength - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Not a valid zip (no end-of-central-directory).");

  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true); // central directory offset

  const entries: CentralEntry[] = [];
  for (let i = 0; i < count; i++) {
    if (view.getUint32(p, true) !== SIG_CEN) break;
    const method = view.getUint16(p + 10, true);
    const compSize = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const localHeaderOffset = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.push({ name, method, compSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }

  const out: ZipEntry[] = [];
  for (const e of entries) {
    if (e.name.endsWith("/")) continue; // directory
    const lh = e.localHeaderOffset;
    if (view.getUint32(lh, true) !== SIG_LOCAL) continue;
    const nameLen = view.getUint16(lh + 26, true);
    const extraLen = view.getUint16(lh + 28, true);
    const dataStart = lh + 30 + nameLen + extraLen;
    const comp = bytes.subarray(dataStart, dataStart + e.compSize);
    const data = e.method === 0 ? comp.slice() : await inflateRaw(comp);
    out.push({ name: e.name, bytes: data });
  }
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

/** Pick the most likely image entry from a zip (skips macOS resource forks). */
export function pickImageEntry(entries: ZipEntry[]): ZipEntry | undefined {
  const real = entries.filter(
    (e) => !e.name.includes("__MACOSX/") && !e.name.split("/").pop()!.startsWith("._"),
  );
  const exts = [".dng", ".nef", ".tif", ".tiff", ".jpg", ".jpeg", ".png"];
  for (const ext of exts) {
    const hit = real.find((e) => e.name.toLowerCase().endsWith(ext));
    if (hit) return hit;
  }
  return real[0];
}
