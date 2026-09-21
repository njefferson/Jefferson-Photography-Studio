// KEEPING ONE PHOTOGRAPH, ON PURPOSE, UNDER A NAME (decision 039).
//
// The reader's question is not "can I resume where I was" — a SESSION already
// answers that — but "can I put this one down and pick it up next week". Those
// want different answers, and the difference is what this file is. A session
// is a working state with a Done that frees its storage; a kept photograph is
// a place to leave something.
//
// SO IT IS ITS OWN DATABASE, deliberately. `session.ts` clears `ips-session`
// when a session ends, and reusing that database — even in a store of its own —
// would leave the reader's kept work one press away from a control that means
// something else entirely. The boundary is enforced by the storage rather than
// by remembering. That is decision 039's rejected "make it a session of one",
// made structurally impossible.
//
// THE DURABILITY SHAPE IS `session.ts`'s, WHICH IS `batchstore.ts`'s, and it is
// not a detail to simplify away. Large IndexedDB values get externalised to a
// lazily-flushed sidecar that `durability: "strict"` does NOT cover, so a crash
// seconds after a "committed" write can lose them. The only reliable shape is
// SMALL rows: source bytes split into chunks of 30 KB or less that stay inline
// in the transaction log and are genuinely on disk at commit, one strict
// transaction per photograph. The thumbnail (a ~15 KB JPEG) and the edit JSON
// (a couple of KB) are small enough to ride inline in the meta row.
//
// THE NAMED-LIST SHAPE IS `luts.ts`'s, by way of `maskstore.ts`: a record/meta
// split so a list can be drawn without reading every payload, a declared count
// cap, and put/get/list/delete. Three files share it now rather than three
// files inventing it.
import type { ImageKind } from "./import";

/** One kept photograph: what the reader called it, what the file was, a tile
 *  for the list, and the whole edit as JSON. The source bytes are NOT here —
 *  they live in chunks under the same id, for the reason in the header. */
export interface KeptRecord {
  id: string;
  /** What the reader called it. The file's own name is kept separately, below,
   *  because a name chosen for this photograph and a name the camera wrote are
   *  different facts and a list that conflates them cannot show either. */
  name: string;
  /** The picked file's own name, shown under the reader's name so a kept
   *  photograph can still be matched to what is on the card. */
  srcName: string;
  kind: ImageKind;
  /** Source byte length. Summed across rows for the honest total held — which
   *  costs no chunk reads, because this IS what the chunks weigh. */
  size: number;
  /** Small JPEG for the list tile (whole image, one small inline value). */
  thumb: ArrayBuffer;
  /** The photograph's whole edit, as `editToJson` writes it. */
  edit: string;
  addedAt: number;
}

/** A kept photograph without its edit — what a list needs and no more. */
export type KeptMeta = Omit<KeptRecord, "edit">;

/** HOW MANY PHOTOGRAPHS MAY BE KEPT AT ONCE.
 *
 *  Ten rather than the twenty-five masks and LUTs get, because a kept row holds
 *  an original RAW file and those two hold kilobytes. Ten 40 MB frames is about
 *  400 MB — a ceiling a reader can hold in their head, which is the point of
 *  having one. The list shows the count and the bytes and offers to forget. */
export const KEPT_COUNT_CAP = 10;

const DB = "ips-kept";
const META = "kept";
const CHUNKS = "bytes";
const CHUNK = 30 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "id" });
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: ["photo", "idx"] });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

function req<T>(rq: IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    rq.onsuccess = () => res(rq.result as T);
    rq.onerror = () => rej(rq.error);
  });
}

/** KEEP ONE PHOTOGRAPH, ATOMICALLY.
 *
 *  Takes `rec`, the complete record, and `bytes`, the original file's own
 *  bytes. Returns nothing; rejects if the write does not commit, so a caller
 *  that resolves knows the photograph is really on the disk.
 *
 *  The meta row and every chunk go in ONE strict-durability transaction, so a
 *  crash can never leave a listed photograph whose bytes are missing — the
 *  failure mode that would make the list lie.
 *
 *  What the caller relies on: after this resolves, `listKept` includes it and
 *  `getKeptBytes` returns exactly the bytes passed here. The caller checks
 *  `KEPT_COUNT_CAP` first; this does not, because refusing here would mean
 *  discovering the ceiling after the reader has already named the thing. */
export async function putKept(rec: KeptRecord, bytes: Uint8Array): Promise<void> {
  // The moment the app commits the reader's own photograph is the honest moment
  // to ask for the storage to be kept. Not awaited, exactly as session.ts does.
  void requestPersistence();
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction([META, CHUNKS], "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("keeping the photograph was aborted"));
      t.onerror = () => rej(t.error ?? new Error("keeping the photograph failed"));
      t.objectStore(META).put(rec);
      const cs = t.objectStore(CHUNKS);
      for (let i = 0, idx = 0; i < bytes.length; i += CHUNK, idx++) {
        // slice() copies just this range, so the stored value is one small
        // buffer — a subarray view would clone the whole photograph per chunk.
        cs.put({ photo: rec.id, idx, bytes: bytes.slice(i, Math.min(i + CHUNK, bytes.length)).buffer });
      }
    });
  } finally {
    db.close();
  }
}

let persistence: Promise<boolean> | null = null;

/** ASK THE BROWSER TO KEEP THIS STORAGE.
 *
 *  Takes nothing. Returns whether persistent storage is granted, and never
 *  throws — a browser that does not offer the API is a false rather than an
 *  error, because nothing here should fail for want of a promise about eviction.
 *
 *  Asked once and memoised, the same shape `session.ts` uses.
 *
 *  What the caller relies on: it is safe to call from anywhere and on every
 *  keep, because the browser is only actually asked the first time. */
export function requestPersistence(): Promise<boolean> {
  if (persistence) return persistence;
  persistence = (async () => {
    try {
      if (!navigator.storage?.persist) return false;
      if (await navigator.storage.persisted?.()) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  })();
  return persistence;
}

/** REPLACE A KEPT PHOTOGRAPH'S EDIT, leaving its bytes alone.
 *
 *  Takes `id` and `edit`, the JSON. Returns nothing; rejects when nothing is
 *  kept under that id rather than writing a row with no bytes behind it.
 *
 *  This is what a second Keep on an already-kept photograph does — the reader
 *  carried on editing and wants the newer state. Rewriting the bytes would cost
 *  a whole file's write for a couple of kilobytes of change.
 *
 *  What the caller relies on: the chunks are untouched, so `getKeptBytes` still
 *  returns the original file. */
export async function setKeptEdit(id: string, edit: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("saving the edit was aborted"));
      t.onerror = () => rej(t.error ?? new Error("saving the edit failed"));
      const store = t.objectStore(META);
      const get = store.get(id);
      get.onsuccess = () => {
        const row = get.result as KeptRecord | undefined;
        if (!row) { t.abort(); return; }
        store.put({ ...row, edit });
      };
    });
  } finally {
    db.close();
  }
}

/** RENAME A KEPT PHOTOGRAPH.
 *
 *  Takes `id` and `name`. Returns nothing; rejects when nothing is kept under
 *  that id, for the same reason `setKeptEdit` does.
 *
 *  What the caller relies on: nothing else on the row moves, so a rename costs
 *  no bytes and cannot disturb the edit. */
export async function renameKept(id: string, name: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("renaming was aborted"));
      t.onerror = () => rej(t.error ?? new Error("renaming failed"));
      const store = t.objectStore(META);
      const get = store.get(id);
      get.onsuccess = () => {
        const row = get.result as KeptRecord | undefined;
        if (!row) { t.abort(); return; }
        store.put({ ...row, name });
      };
    });
  } finally {
    db.close();
  }
}

/** ONE KEPT PHOTOGRAPH'S RECORD, without its bytes.
 *
 *  Takes `id`. Returns the record, or null when nothing is kept under it — null
 *  rather than a throw, because a row deleted on another tab is an ordinary
 *  outcome and the caller says so to the reader.
 *
 *  What the caller relies on: `edit` is the JSON `editToJson` wrote, so it is
 *  applied through the same path a resumed session's stored edit takes. */
export async function getKept(id: string): Promise<KeptRecord | null> {
  const db = await open();
  try {
    return (await req<KeptRecord | undefined>(db.transaction(META).objectStore(META).get(id))) ?? null;
  } finally {
    db.close();
  }
}

/** MATERIALISE ONE KEPT PHOTOGRAPH'S SOURCE BYTES.
 *
 *  Takes `id`. Returns the original file's bytes, reassembled from its chunks
 *  in order — an empty array when nothing is kept under that id, which the
 *  caller must treat as a failure to open rather than as an empty photograph.
 *
 *  What the caller relies on: this is byte-for-byte what `putKept` was given,
 *  so it decodes exactly as the picked file did. Only one photograph's bytes
 *  are in RAM at a time; the caller decodes and drops them. */
export async function getKeptBytes(id: string): Promise<Uint8Array> {
  const db = await open();
  try {
    const rows = await req<{ idx: number; bytes: ArrayBuffer }[]>(
      db.transaction(CHUNKS).objectStore(CHUNKS).getAll(IDBKeyRange.bound([id, 0], [id, Infinity])),
    );
    rows.sort((a, b) => a.idx - b.idx);
    let total = 0;
    for (const r of rows) total += r.bytes.byteLength;
    const out = new Uint8Array(total);
    let off = 0;
    for (const r of rows) { out.set(new Uint8Array(r.bytes), off); off += r.bytes.byteLength; }
    return out;
  } finally {
    db.close();
  }
}

/** EVERY KEPT PHOTOGRAPH, newest first, without its edit.
 *
 *  Takes nothing. Returns one `KeptMeta` per kept photograph, sorted newest
 *  first.
 *
 *  What the caller relies on: this is what the list is drawn from, so it holds
 *  no edit JSON in RAM — the same reason `listLuts` returns meta rather than
 *  lattices. The thumbnails DO come back, because the list shows them. */
export async function listKept(): Promise<KeptMeta[]> {
  const db = await open();
  try {
    const all = await req<KeptRecord[]>(db.transaction(META).objectStore(META).getAll());
    return all
      .map(({ edit: _e, ...meta }) => meta)
      .sort((a, b) => b.addedAt - a.addedAt);
  } finally {
    db.close();
  }
}

/** WHAT KEEPING PHOTOGRAPHS IS COSTING THE DEVICE, in bytes.
 *
 *  Takes nothing. Returns the summed source size of every kept photograph.
 *
 *  Summed from the meta rows rather than measured from the chunks, which is the
 *  same number for no reads: `size` IS what was chunked. Decision 039 makes
 *  saying this part of the feature rather than a nicety — a store the reader
 *  cannot see the cost of is the leak its own rejected option describes.
 *
 *  What the caller relies on: it is bytes, not a formatted string, so the one
 *  place that formats sizes stays the one place. */
export async function keptBytesHeld(): Promise<number> {
  const db = await open();
  try {
    const all = await req<KeptRecord[]>(db.transaction(META).objectStore(META).getAll());
    let n = 0;
    for (const r of all) n += r.size || 0;
    return n;
  } finally {
    db.close();
  }
}

/** FORGET A KEPT PHOTOGRAPH — its record and all of its bytes.
 *
 *  Takes `id`. Returns nothing, and succeeds whether or not a row was there:
 *  forgetting something already gone is the reader's intent either way.
 *
 *  THE META ROW GOES FIRST, in the same transaction, so an interrupted delete
 *  can only ever leave bytes nothing can reach — never a listed photograph
 *  whose bytes are gone. That order is `forgetSession`'s and the reason is the
 *  same: an interruption costs space until the next launch, never correctness.
 *
 *  What the caller relies on: after this resolves, `listKept` omits it and
 *  `keptBytesHeld` no longer counts it. */
export async function deleteKept(id: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction([META, CHUNKS], "readwrite");
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("forgetting was aborted"));
      t.onerror = () => rej(t.error ?? new Error("forgetting failed"));
      t.objectStore(META).delete(id);
      t.objectStore(CHUNKS).delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
    });
  } finally {
    db.close();
  }
}
