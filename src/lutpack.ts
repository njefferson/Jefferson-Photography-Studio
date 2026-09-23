// LUT PACKS ARRIVE AS ZIPS — reading the .cube files out of one, without
// inflating anything the caller is going to refuse.
//
// WHY THIS EXISTS. LUTs are published as packs, not as single files: the one
// this was built against holds eighteen .cube files in two folders beside a
// licence and a readme. Importing them one at a time is eighteen trips through
// the Files browser. And on an iPad the zip is the route that always works —
// iOS filters the picker by type identifier, `.cube` is registered to nothing,
// and `.zip` is registered to something (src/keepfile.ts:27 has the measurement
// that established this, on a keep file rather than a LUT).
//
// IT DOES NOT PARSE. `cubeimport.ts` owns the .cube format and keeps owning it;
// this module finds the files and hands their text over, so there is one parser
// and one set of reject sentences rather than two that drift.
//
// NOTHING IS INFLATED TO BE MEASURED. The uncompressed size is read from the
// zip's central directory, so an entry over the caller's ceiling is refused
// before the memory is spent — a deflate stream can expand by about a thousand
// to one, so inflating first and checking afterwards is checking too late.
//
// THE DIRECTORY ITSELF IS READ WHOLE, which the line above does not say. A zip
// declaring an enormous central directory costs that much before any entry is
// looked at. It is bounded by the archive's own size, and the packs this exists
// for carry twenty entries, so it is recorded rather than defended against.
import { readZipIndex, readZipEntryPrefix, type ZipIndexEntry } from "./zip";

/** A .cube file found inside a pack, with what it costs to take it out. */
export interface PackedCube {
  /** The entry as the zip names it, folders and all. */
  entry: ZipIndexEntry;
  /** The file's own name with its folder and extension stripped — what the
   *  reader will see if the LUT carries no TITLE of its own. */
  name: string;
}

/** IS THIS ZIP ENTRY A .cube A READER MEANT TO SEND?
 *
 *  Takes `path`, an entry name from a zip's central directory, folders
 *  included. Returns true only for a real .cube. What the caller relies on: the
 *  two kinds of debris a Mac's own Compress command adds are excluded, because
 *  a reader told to zip their LUTs will most often do it on a Mac and every one
 *  of those files would otherwise be reported as a LUT that failed to parse.
 *  `__MACOSX/` holds resource forks and `._name` is the fork itself; both end
 *  in `.cube` and neither is one.
 *
 *  THE NAME TEST IS THE ONE THAT WORKS; the folder test is defence in depth.
 *  Measured by planting: breaking only the `__MACOSX/` test changed nothing,
 *  because every file macOS writes into that folder is also named `._`. The
 *  folder test stays for an archive shaped some other way, but a reader of this
 *  function should know which half is load-bearing. */
export function isPackedCube(path: string): boolean {
  if (path.startsWith("__MACOSX/") || path.includes("/__MACOSX/")) return false;
  const base = path.slice(path.lastIndexOf("/") + 1);
  if (base.startsWith("._")) return false;
  return /\.cube$/i.test(base);
}

/** THE NAME TO SHOW FOR A PACKED LUT THAT DOES NOT NAME ITSELF.
 *
 *  Takes `path`, the zip entry name. Returns its basename without the `.cube`,
 *  trimmed to the same 60 characters a single import allows. What the caller
 *  relies on: the folder is gone — a pack sorts its LUTs into directories, and
 *  "Infrared Color Swap/IR Hue 180" is a path rather than a name. Falls back to
 *  a non-empty string so a stored LUT is never nameless. */
export function packedCubeName(path: string): string {
  const base = path.slice(path.lastIndexOf("/") + 1);
  return base.replace(/\.cube$/i, "").slice(0, 60) || "Imported LUT";
}

/** EVERY .cube INSIDE A ZIP, WITHOUT DECOMPRESSING ANY OF THEM.
 *
 *  Takes `file`, the picked archive. Returns one `PackedCube` per .cube entry,
 *  in the order the central directory lists them, which is the order the pack's
 *  author chose. Rejects only if the file is not a readable zip at all.
 *
 *  What the caller relies on: this is cheap on an archive far larger than
 *  memory — it reads the tail and the central directory and nothing else — and
 *  each entry's `size` is available for a ceiling check before `readPackedCube`
 *  is called. An empty result means the zip held no LUTs, which is a sentence
 *  for the reader rather than an error. */
export async function listPackedCubes(file: Blob): Promise<PackedCube[]> {
  const index = await readZipIndex(file);
  return index
    .filter((e) => isPackedCube(e.name))
    .map((entry) => ({ entry, name: packedCubeName(entry.name) }));
}

/** THROWN BY `readPackedCube` when an entry inflates past the ceiling it was
 *  handed, whether the central directory under- or over-stated it. Carries no
 *  data beyond the message; what the caller relies on is the TYPE, so a
 *  `catch` can route it to "too large" rather than the generic "could not be
 *  read" a parse failure produces — see the call site in main.ts. */
export class PackedCubeTooLarge extends Error {}

/** ONE PACKED .cube, AS THE BYTES THAT WERE IN THE ARCHIVE.
 *
 *  Takes `file`, the archive; `entry` from `listPackedCubes`; and `maxBytes`,
 *  the caller's ceiling. Returns the entry's inflated bytes, and throws
 *  `PackedCubeTooLarge` if what came out exceeds the ceiling.
 *
 *  BYTES, NOT TEXT, AND THAT IS AN INVARIANT RATHER THAN A PREFERENCE.
 *  `LutRecord.cube` in luts.ts says it holds "the ORIGINAL file bytes, so
 *  'share this LUT' re-sends the exact file", and the single-file import path
 *  honours that with the picked File's own buffer. An earlier version of this
 *  returned a string and the caller re-encoded it, which is not the same bytes:
 *  TextDecoder strips a leading byte-order mark and turns every invalid byte
 *  into U+FFFD, so a LUT that came out of a pack would have been re-shared as
 *  something the archive never contained, and its stored size would not have
 *  matched the file. The caller decodes a copy for the parser and stores what
 *  this returns.
 *
 *  What the caller relies on: it inflates exactly this entry and nothing else,
 *  so importing the first ten of a pack costs ten entries rather than the
 *  archive — AND that a lying central directory cannot spend more than the
 *  ceiling. `entry.size` is a claim; checking it before the call refuses the
 *  honest oversized entry for free, and this bounds the dishonest one.
 *
 *  ONE BEHAVIOUR IT INHERITS, STATED BECAUSE IT IS NOT OBVIOUS: a deflate
 *  stream that is CORRUPT rather than oversized does not throw here. The prefix
 *  reader treats a stream ending without a terminator as "whatever arrived is
 *  what was asked for", by design, so a damaged entry comes back SHORT. It then
 *  fails `parseCube` on its row count and is reported as unreadable, which is
 *  the right answer — but it is reached by a different road than a throw.
 *
 *  IT IS `readZipEntryPrefix`, NOT `readZipEntry`, AND THAT IS THE WHOLE POINT.
 *  The plain reader pipes the entire stream into one buffer, so an entry
 *  declaring a kilobyte and inflating to a gigabyte is fully allocated before
 *  any length can be compared — the check would be real and the spend would
 *  already have happened. The prefix reader stops at the limit and caps the
 *  compressed input it reads at all. One byte over the ceiling is asked for so
 *  that a file exactly at it still passes, and anything longer is refused.
 *
 *  The ceiling is a parameter rather than a constant here because it belongs to
 *  the caller, and a module enforcing someone else's limit is a second place to
 *  change it.
 *
 *  THE OVERSIZED THROW IS `PackedCubeTooLarge`, not a plain Error, so a caller
 *  that reports oversized and unreadable entries differently can still tell a
 *  lying archive from a damaged one — both reach this function's catch by the
 *  same route, and `instanceof Error` alone cannot distinguish them. */
export async function readPackedCube(file: Blob, entry: ZipIndexEntry, maxBytes: number): Promise<Uint8Array> {
  const bytes = await readZipEntryPrefix(file, entry, maxBytes + 1);
  if (bytes.length > maxBytes) throw new PackedCubeTooLarge(`${entry.name} is larger than it said it was`);
  return bytes;
}
