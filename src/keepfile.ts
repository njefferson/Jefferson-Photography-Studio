// THE KEEP FILE: a photograph the reader owns, as one file they hold.
//
// Decision 043. A kept photograph today is rows in an IndexedDB database the
// app created — storage the reader does not own, cannot move to another device,
// cannot back up, and which iOS may reclaim without telling the app. This is
// the other half: the same photograph written out as a file, saved through the
// share sheet, picked again later with its edit still on it.
//
// THE SHAPE IS CAPTURE ONE'S EIP, FOR EIP'S REASON. An Enhanced Image Package
// is a plain zip holding the original raw beside its settings, made for moving
// an image and its adjustments between machines. It never writes the original,
// because it carries a copy of it. So does this.
//
// STORED, NEVER DEFLATED, AND THAT IS LOAD-BEARING. Raw bytes do not compress —
// a NEF is already entropy-coded — so deflating buys nothing and costs the one
// property worth having: with method 0 the original sits in the archive as a
// contiguous, byte-identical run, so anything that opens a zip can take the
// photograph back out. A keep file is not a format the reader needs this app to
// escape from.
//
// THE FILE THE READER PICKED IS NEVER WRITTEN. Not its pixels, not its header,
// not its metadata — which is what the field's leading tool does to a DNG, and
// is therefore the thing most likely to arrive later as the conventional
// approach. 043 refuses it in advance. Everything here produces NEW bytes.
import { writeZip, readZip, crc32, type ZipWriteEntry } from "./zip";

/** The extension a keep file carries.
 *
 *  IT ENDS IN `.zip` AND THAT IS NOT COSMETIC. The first version was
 *  `.ipskeep`, and on an iPad the Files picker GREYED THE SAVED FILE OUT —
 *  27.9 MB, named correctly, unselectable. iOS filters that picker by UTI, and
 *  an extension registered to nothing matches no allowed type. Nothing in this
 *  app ever ran: the failure was upstream of every line of routing.
 *
 *  A keep file IS a zip, so the trailing `.zip` is honest as well as
 *  selectable — it maps to a real UTI, it is already in `OPENABLE_EXT` and in
 *  every picker's accept list, and `src/zip.ts`'s own header records that
 *  getting a file through iOS as a zip is the route this app already proved on
 *  that device. `ipskeep` stays in the middle so a reader can still tell a kept
 *  photograph from an archive of raws at a glance.
 *
 *  ROUTING DOES NOT DEPEND ON IT. See `sniffKeep`. */
export const KEEP_EXT = ".ipskeep.zip";

/** Layout version. Bumped only when an older reader would MISREAD a newer file;
 *  a reader refuses what it does not recognise rather than guessing. */
export const KEEP_FORMAT = 1;

/** Where each part lives inside the archive. One declaration, so the writer and
 *  the reader cannot drift — the defect class this repository has the most
 *  lessons about. */
export const KEEP_PATHS = {
  manifest: "keep.json",
  edit: "edit.json",
  /** The original's own bytes, under its own name, in a directory of its own so
   *  a reader unzipping by hand sees immediately which file is their photograph. */
  originalDir: "original/",
} as const;

/** What `keep.json` carries: enough to open the package, and enough to refuse it
 *  honestly when it cannot be opened. */
export interface KeepManifest {
  /** `KEEP_FORMAT` at the time of writing. */
  format: number;
  /** The app version that wrote it, for a report when something is wrong. */
  app: string;
  /** The original's filename, as picked. Also its path under `originalDir`. */
  original: string;
  /** The original's length in bytes, checked on read against what came out. */
  size: number;
  /** CRC-32 of the original's bytes, checked on read. The zip's own CRC covers
   *  the same bytes; this one survives the file being repacked by a tool that
   *  recomputes them, which is what makes it worth storing twice. */
  crc: number;
  /** The reader's name for this photograph, from 039's store. */
  name: string;
  /** ISO 8601, when the package was written. */
  kept: string;
}

/** True when a picked file's name says it is a keep file.
 *
 *  @param name  the picked file's name, any case.
 *  @returns whether the picker should route it here rather than to the decoder.
 *  Callers: the picker's routing in `main.ts`, which peels these off before the
 *  decode path the way it already peels off `.ipslook`. */
export function isKeepName(name: string): boolean {
  return name.toLowerCase().endsWith(KEEP_EXT);
}

/** Is this the head of a keep file? The question the ROUTING asks.
 *
 *  @param head  the first bytes of a picked file; 64 is always enough.
 *  @returns whether the archive's FIRST entry is this format's manifest.
 *
 *  A NAME IS NOT EVIDENCE, and two separate things proved it. iOS would not let
 *  a `.ipskeep` be picked at all, so the name had to change; and a reader may
 *  rename a file they own, which is the whole point of them owning it. What
 *  cannot be renamed is what the bytes say.
 *
 *  This is why `writeKeepFile` puts the manifest FIRST and says so: a zip's
 *  first local header sits at offset 0, so the question is answered by a few
 *  dozen bytes rather than by seeking to the central directory at the end of a
 *  file that carries a whole photograph. `sniffLook` in src/look.ts is the same
 *  shape for the same reason.
 *
 *  What it has to hold, and what `openPicked` depends on: it must say NO to an
 *  ordinary zip of raws, which the import path handles and which would
 *  otherwise be opened as a broken keep file. */
export function sniffKeep(head: Uint8Array): boolean {
  // Local file header: "PK\x03\x04", then the name length at 26 and the name
  // itself at 30. Anything shorter than that is not a zip at all.
  if (head.length < 30) return false;
  if (head[0] !== 0x50 || head[1] !== 0x4b || head[2] !== 0x03 || head[3] !== 0x04) return false;
  const nameLen = head[26] | (head[27] << 8);
  if (nameLen !== KEEP_PATHS.manifest.length || head.length < 30 + nameLen) return false;
  for (let i = 0; i < nameLen; i++) {
    if (head[30 + i] !== KEEP_PATHS.manifest.charCodeAt(i)) return false;
  }
  return true;
}

/** How many bytes `sniffKeep` needs. Declared so a caller slicing a `File` does
 *  not have to guess, and cannot guess short. */
export const KEEP_SNIFF_BYTES = 64;

/** Assemble a keep file: the original's own bytes beside the edit that was made
 *  of it.
 *
 *  @param original   the picked file's bytes, written through UNCHANGED.
 *  @param originalName  its filename as picked, used inside the archive.
 *  @param editJson   039's edit round-trip, already a string.
 *  @param name       the reader's name for the photograph.
 *  @param appVersion the running app version, recorded for diagnosis.
 *  @param when       the timestamp to stamp, passed in so a caller can be
 *                    deterministic — this module never reads the clock.
 *  @returns a Blob of `application/zip`, ready for the share sheet.
 *
 *  WHAT IT HAS TO HOLD, and what `readKeepFile` below depends on: every entry
 *  is STORED, the original's bytes are byte-identical to what came in, and the
 *  manifest's `crc` and `size` describe those same bytes. `tools/keepfile-check.mjs`
 *  asserts the round trip against the repository's own zip reader. */
export function writeKeepFile(
  original: Uint8Array,
  originalName: string,
  editJson: string,
  name: string,
  appVersion: string,
  when: Date,
): Blob {
  const manifest: KeepManifest = {
    format: KEEP_FORMAT,
    app: appVersion,
    original: originalName,
    size: original.length,
    crc: crc32(original),
    name,
    kept: when.toISOString(),
  };
  const enc = new TextEncoder();
  const text = (s: string): Uint8Array => enc.encode(s);
  const entry = (path: string, bytes: Uint8Array): ZipWriteEntry =>
    ({ name: path, size: bytes.length, crc: crc32(bytes), data: bytes });

  // ORDER IS DELIBERATE: the manifest first, so a reader that only wants to
  // know what this is reads the head of the file rather than seeking to the
  // central directory at its end.
  return writeZip(
    [
      entry(KEEP_PATHS.manifest, text(JSON.stringify(manifest, null, 2))),
      entry(KEEP_PATHS.edit, text(editJson)),
      { name: KEEP_PATHS.originalDir + originalName, size: original.length, crc: manifest.crc, data: original },
    ],
    when,
  );
}

/** What a keep file yields when it opens. */
export interface KeepContents {
  manifest: KeepManifest;
  /** The original's bytes, verified against the manifest's size and CRC. */
  original: Uint8Array;
  /** 039's edit JSON, for the caller to apply. Not parsed here: this module
   *  owns the CONTAINER and knows nothing about what an edit means. */
  editJson: string;
}

/** Open a keep file picked by the reader.
 *
 *  @param buf  the picked file's bytes.
 *  @returns the manifest, the original's bytes and the edit JSON.
 *  @throws  when the archive is missing a part, when the format is newer than
 *           this reader understands, or when the original's bytes do not match
 *           the size and CRC the manifest recorded. It REFUSES rather than
 *           returning something partial — a photograph opened from bytes that
 *           failed their own checksum is a silently wrong picture, which is
 *           worse than an error a reader can act on.
 *
 *  Callers: the picker's routing in `main.ts`. What it has to hold: the bytes
 *  returned are byte-identical to what `writeKeepFile` was given. */
export async function readKeepFile(buf: ArrayBuffer): Promise<KeepContents> {
  const entries = await readZip(buf);
  const find = (path: string) => entries.find((e) => e.name === path);

  const manifestEntry = find(KEEP_PATHS.manifest);
  if (!manifestEntry) throw new Error(`not a keep file: no ${KEEP_PATHS.manifest}`);
  const manifest = JSON.parse(new TextDecoder().decode(manifestEntry.bytes)) as KeepManifest;
  if (!(manifest.format <= KEEP_FORMAT)) {
    throw new Error(`this keep file was written by a newer version (format ${manifest.format})`);
  }

  const editEntry = find(KEEP_PATHS.edit);
  if (!editEntry) throw new Error(`not a keep file: no ${KEEP_PATHS.edit}`);

  const originalEntry = find(KEEP_PATHS.originalDir + manifest.original);
  if (!originalEntry) throw new Error(`keep file is missing its photograph (${manifest.original})`);

  // THE CHECK IS THE POINT. A zip reader will hand back whatever is there; the
  // manifest is what says whether it is what was put in.
  if (originalEntry.bytes.length !== manifest.size) {
    throw new Error(`keep file damaged: photograph is ${originalEntry.bytes.length} bytes, expected ${manifest.size}`);
  }
  const crc = crc32(originalEntry.bytes);
  if (crc !== manifest.crc) {
    throw new Error("keep file damaged: the photograph inside does not match its checksum");
  }

  return { manifest, original: originalEntry.bytes, editJson: new TextDecoder().decode(editEntry.bytes) };
}
