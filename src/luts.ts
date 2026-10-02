// On-device store for imported .cube LUTs (IndexedDB "ips-luts"). Modeled on
// batchstore.ts's hardened open/req shape, but SINGLE-ROW per LUT on purpose:
// batchstore chunks its values because interrupted-batch frames are
// irreplaceable finished work and large IDB values ride a lazily-flushed
// sidecar that strict durability doesn't cover. A LUT row is different — it is
// a convenience CACHE of a re-importable file. If a crash ever loses one, the
// cost is a single re-import; chunking here would be complexity without a
// failure it prevents. (~0.9 MB per 33³ LUT: lattice + the original bytes.)
//
// THE LATTICE IS DERIVED, THE FILE IS THE RECORD. A row stamps which reading
// of the file made its `data` (`lattice`); getLut re-reads the original bytes
// when the stamp is older than this build's, so a change to how a .cube is
// read reaches the LUTs a reader imported before it. (2026-10-01: the reader
// stopped clamping table values and started honouring LUT_3D_INPUT_RANGE.)

import { parseCube } from "./cubeimport";

/** Which reading of a .cube file `LutRecord.data` came from. 1 (or absent):
 *  values clamped at parse, LUT_3D_INPUT_RANGE ignored, trilinear domain
 *  resample. 2: values kept, input range read, tetrahedral resample. */
export const LUT_LATTICE = 2;

export interface LutRecord {
  id: string;
  /** Display name (TITLE or filename stem), cleaned at the call site. */
  name: string;
  /** Grid size N per axis. */
  size: number;
  /** N³ RGB triples, red fastest, unit domain, values as the file gives them
   *  — see cubeimport.ts. */
  data: Float32Array;
  /** Which reading of `cube` made `data` (LUT_LATTICE); absent on rows written
   *  before 2026-10-01. putLut stamps it. */
  lattice?: number;
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

/**
 * Store one imported LUT.
 * @param rec  the record; its `data` must be this build's parseCube reading of
 *   its `cube` bytes, because the row is stamped as such.
 * @returns a promise that settles when the write commits (rejects if it
 *   aborts). Holds: the stored row carries `lattice: LUT_LATTICE`, which is
 *   what getLut trusts to skip re-reading the file.
 */
export async function putLut(rec: LutRecord): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(STORE, "readwrite");
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("write aborted"));
      t.onerror = () => rej(t.error ?? new Error("write failed"));
      t.objectStore(STORE).put({ ...rec, lattice: LUT_LATTICE });
    });
  } finally {
    db.close();
  }
}

/**
 * Read one imported LUT.
 * @param id  the row's id.
 * @returns the record, or null when there is none. Holds: its `data` is this
 *   build's reading of its original file — a row stamped with an older
 *   `lattice` is re-read from `cube` and written back (best effort; if the
 *   file no longer reads, the stored lattice is returned as it was). Consumers
 *   apply `data` straight to the edit (main.ts), so a stale lattice here is a
 *   wrong colour on screen and in every export.
 */
export async function getLut(id: string): Promise<LutRecord | null> {
  const db = await open();
  let rec: LutRecord | null;
  try {
    rec = (await req<LutRecord | undefined>(db.transaction(STORE).objectStore(STORE).get(id))) ?? null;
  } finally {
    db.close();
  }
  if (!rec || rec.lattice === LUT_LATTICE || !rec.cube) return rec;
  try {
    const parsed = parseCube(new TextDecoder().decode(rec.cube));
    const fresh: LutRecord = { ...rec, size: parsed.size, data: parsed.data, lattice: LUT_LATTICE };
    await putLut(fresh).catch(() => undefined);
    return fresh;
  } catch {
    return rec;
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
