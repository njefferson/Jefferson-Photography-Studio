// Crash-safe store for finished batch frames.
//
// iOS Safari cannot silently write files to Photos/Files (every save needs a
// share-sheet tap), so "save as you go" means persisting each finished frame
// into IndexedDB the moment it completes; finished work then survives a tab
// crash or reload. The frames are cleared once their zip is actually saved;
// leftovers found at launch mean an interrupted batch, offered for recovery.
//
// MEASURED GOTCHA (2026-07-12, headless Chromium, on-disk profile): any LARGE
// IDB value — Blob or ArrayBuffer alike — is externalized into a lazily
// flushed sidecar file, so a browser death seconds after a "committed" write
// loses the row (recovery discards it; we saw the whole DB come back empty).
// durability:"strict" does not cover the sidecar. The only reliable shape is
// SMALL rows: each frame is split into <=30 KB chunks, which stay inline in
// the transaction log and are genuinely on disk at commit. One transaction
// per frame (meta row + all its chunks) keeps recovery all-or-nothing.

export interface FrameMeta {
  name: string;
  crc: number; // CRC32 of the whole frame's bytes, precomputed for the zip writer
  size: number;
  /** Input identity (name + byte size), so re-picking a set after a crash can
   *  skip the inputs whose output is already stored. Absent on old rows. */
  srcName?: string;
  srcSize?: number;
}

const DB = "ips-batch";
const META = "meta";
const CHUNKS = "chunks";
const CHUNK = 30 * 1024;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 2);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      // v1 stored whole frames as single rows — exactly the sidecar trap
      // above, so any leftovers there were unrecoverable anyway.
      if (db.objectStoreNames.contains("frames")) db.deleteObjectStore("frames");
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: "name" });
      if (!db.objectStoreNames.contains(CHUNKS)) db.createObjectStore(CHUNKS, { keyPath: ["frame", "idx"] });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

/** Store one finished frame atomically (meta + chunks in one strict-durability
 *  transaction): after this resolves, the frame is really on disk. */
export async function putFrame(meta: FrameMeta, bytes: Uint8Array): Promise<void> {
  const { name } = meta;
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction([META, CHUNKS], "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("write aborted"));
      t.onerror = () => rej(t.error ?? new Error("write failed"));
      t.objectStore(META).add(meta);
      const cs = t.objectStore(CHUNKS);
      for (let i = 0, idx = 0; i < bytes.length; i += CHUNK, idx++) {
        // slice() copies just this range, so the stored value is exactly one
        // small buffer (a subarray view would clone the whole frame).
        cs.add({ frame: name, idx, bytes: bytes.slice(i, Math.min(i + CHUNK, bytes.length)).buffer });
      }
    });
  } finally {
    db.close();
  }
}

function req<T>(rq: IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    rq.onsuccess = () => res(rq.result as T);
    rq.onerror = () => rej(rq.error);
  });
}

export async function frameMetas(): Promise<FrameMeta[]> {
  const db = await open();
  try {
    return await req<FrameMeta[]>(db.transaction(META).objectStore(META).getAll());
  } finally {
    db.close();
  }
}

export async function frameCount(): Promise<number> {
  const db = await open();
  try {
    return await req<number>(db.transaction(META).objectStore(META).count());
  } finally {
    db.close();
  }
}

export async function clearFrames(): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction([META, CHUNKS], "readwrite");
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.objectStore(META).clear();
      t.objectStore(CHUNKS).clear();
    });
  } finally {
    db.close();
  }
}

/** Visit every stored frame, materializing ONE frame's chunks at a time so a
 *  big batch never has all its bytes in RAM at once. */
export async function eachFrame(fn: (f: FrameMeta & { parts: ArrayBuffer[] }) => void): Promise<void> {
  const db = await open();
  try {
    const metas = await req<FrameMeta[]>(db.transaction(META).objectStore(META).getAll());
    for (const m of metas) {
      const rows = await req<{ bytes: ArrayBuffer }[]>(
        db.transaction(CHUNKS).objectStore(CHUNKS).getAll(IDBKeyRange.bound([m.name, 0], [m.name, Infinity])),
      );
      fn({ ...m, parts: rows.map((r) => r.bytes) });
    }
  } finally {
    db.close();
  }
}
