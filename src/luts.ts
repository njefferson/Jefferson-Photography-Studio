// On-device store for imported .cube LUTs (IndexedDB "ips-luts"). Modeled on
// batchstore.ts's hardened open/req shape, but SINGLE-ROW per LUT on purpose:
// batchstore chunks its values because interrupted-batch frames are
// irreplaceable finished work and large IDB values ride a lazily-flushed
// sidecar that strict durability doesn't cover. A LUT row is different — it is
// a convenience CACHE of a re-importable file. If a crash ever loses one, the
// cost is a single re-import; chunking here would be complexity without a
// failure it prevents. (~0.9 MB per 33³ LUT: lattice + the original bytes.)

export interface LutRecord {
  id: string;
  /** Display name (TITLE or filename stem), cleaned at the call site. */
  name: string;
  /** Grid size N per axis. */
  size: number;
  /** N³ RGB triples, red fastest, unit domain, clamped — see cubeimport.ts. */
  data: Float32Array;
  /** The ORIGINAL file bytes, so "share this LUT" re-sends the exact file. */
  cube: Uint8Array;
  addedAt: number;
}

export interface LutMeta {
  id: string;
  name: string;
  size: number;
  /** Stored footprint (lattice + original file), for the honest size readout. */
  bytes: number;
  addedAt: number;
}

/** Honest ceiling — the list UI shows count + sizes and offers delete. */
export const LUT_COUNT_CAP = 25;

const DB = "ips-luts";
const STORE = "luts";

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
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

export async function putLut(rec: LutRecord): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, "readwrite");
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("write aborted"));
      t.onerror = () => rej(t.error ?? new Error("write failed"));
      t.objectStore(STORE).put(rec);
    });
  } finally {
    db.close();
  }
}

export async function getLut(id: string): Promise<LutRecord | null> {
  const db = await open();
  try {
    return (await req<LutRecord | undefined>(db.transaction(STORE).objectStore(STORE).get(id))) ?? null;
  } finally {
    db.close();
  }
}

/** Meta only (no lattices/bytes in RAM), newest first. */
export async function listLuts(): Promise<LutMeta[]> {
  const db = await open();
  try {
    const all = await req<LutRecord[]>(db.transaction(STORE).objectStore(STORE).getAll());
    return all
      .map((r) => ({ id: r.id, name: r.name, size: r.size, bytes: (r.data?.byteLength ?? 0) + (r.cube?.byteLength ?? 0), addedAt: r.addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
  } finally {
    db.close();
  }
}

export async function deleteLut(id: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, "readwrite");
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("delete aborted"));
      t.onerror = () => rej(t.error ?? new Error("delete failed"));
      t.objectStore(STORE).delete(id);
    });
  } finally {
    db.close();
  }
}
