// Crash-safe store for a photo SESSION — the set you opened and are moving
// between, each photo keeping its own edit.
//
// Why this exists: iPad Safari cannot re-open a File the user picked once the
// page reloads (no persistent file handles — proven with batch "Continue").
// So the only way a session can survive a reload, a tab crash, or the OS
// discarding the tab is to copy each photo's SOURCE bytes into our own storage
// the moment it's opened. Alongside the bytes we keep a tiny strip thumbnail
// and the photo's edit (as JSON), so the session comes back whole.
//
// Durability shape is inherited wholesale from batchstore.ts (see its header):
// large IDB values get externalised to a lazily-flushed sidecar that
// durability:"strict" does NOT cover, so a crash seconds after a "committed"
// write can lose them. The only reliable shape is SMALL rows — source bytes are
// split into <=30 KB chunks that stay inline in the transaction log and are
// genuinely on disk at commit, one strict transaction per photo. The thumbnail
// (a ~15 KB JPEG) and the edit JSON (a couple of KB) are small enough to ride
// inline in the meta row.

import type { ImageKind } from "./import";

export interface PhotoMeta {
  id: string;
  name: string;
  kind: ImageKind;
  /** Source byte length (for the honest size readout, before any decode). */
  size: number;
  /** Strip order — getAll() returns by key, so callers sort on this. */
  order: number;
  addedAt: number;
  /** Small JPEG thumbnail for the strip (whole image, one small inline value). */
  thumb: ArrayBuffer;
  /** The photo's edit as a JSON snapshot, or null until it's been visited.
   *  Spatial mask bitmaps are dropped before storing (see main.ts) — they're
   *  composition-specific and reset on a fresh decode, like they always have. */
  edit: string | null;
}

const DB = "ips-session";
const META = "meta";
const CHUNKS = "chunks";
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

/** Store one photo atomically (meta row + all its source chunks in a single
 *  strict-durability transaction): after this resolves the photo is really on
 *  disk, so the session survives a crash the instant a photo is added. */
export async function addPhoto(meta: PhotoMeta, bytes: Uint8Array): Promise<void> {
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
        // slice() copies just this range so the stored value is one small
        // buffer (a subarray view would clone the whole photo per chunk).
        cs.add({ photo: meta.id, idx, bytes: bytes.slice(i, Math.min(i + CHUNK, bytes.length)).buffer });
      }
    });
  } finally {
    db.close();
  }
}

/** Persist just one photo's edit (a small, durable row rewrite). Called when
 *  moving off a photo so its edit is safe even if the tab dies mid-session. */
export async function setEdit(id: string, edit: string | null): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.onerror = () => rej(t.error);
      t.onabort = () => rej(t.error);
      const store = t.objectStore(META);
      const g = store.get(id);
      g.onsuccess = () => {
        const m = g.result as PhotoMeta | undefined;
        if (!m) { res(); return; } // photo removed under us — nothing to update
        m.edit = edit;
        store.put(m);
      };
      t.oncomplete = () => res();
    });
  } finally {
    db.close();
  }
}

/** Every stored photo's metadata (incl. thumbnail + edit), strip order first. */
export async function listPhotos(): Promise<PhotoMeta[]> {
  const db = await open();
  try {
    const metas = await req<PhotoMeta[]>(db.transaction(META).objectStore(META).getAll());
    return metas.sort((a, b) => a.order - b.order);
  } finally {
    db.close();
  }
}

export async function photoCount(): Promise<number> {
  const db = await open();
  try {
    return await req<number>(db.transaction(META).objectStore(META).count());
  } finally {
    db.close();
  }
}

/** Materialise one photo's source bytes (its chunks, in order). Only ever one
 *  photo's bytes are in RAM at a time — the caller decodes then drops them. */
export async function getBytes(id: string): Promise<Uint8Array> {
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

/** Drop one photo (meta + all its chunks) from the session. */
export async function removePhoto(id: string): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction([META, CHUNKS], "readwrite");
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.objectStore(META).delete(id);
      t.objectStore(CHUNKS).delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
    });
  } finally {
    db.close();
  }
}

/** End the session and free all its storage. */
export async function clearSession(): Promise<void> {
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
