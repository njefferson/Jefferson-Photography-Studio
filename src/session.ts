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
  /** The PICKED file's own name and byte length, which is what identifies it
   *  before anything reads it — the identity a resumed batch already uses. Kept
   *  so re-picking a folder after an interrupted open recognises what is
   *  already in and does not read it a second time. Absent on rows written
   *  before this existed, which is why the fallback compares `name`/`size`. */
  srcName?: string;
  srcSize?: number;
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

/** Ask the browser to keep this session rather than treat it as cache it may
 *  evict. Asked ONCE per page load, memoised, and never awaited on a path the
 *  reader is waiting on — a refusal must not delay a write.
 *
 *  Why it matters here: WebKit clears script-writable storage after seven days
 *  of Safari use without interaction with the site, and everything this module
 *  writes is script-writable storage. A home-screen install is exempt where a
 *  browser tab is not, which is why the diagnostic prints BOTH `persistent` and
 *  whether the app is installed — the two together are the whole answer, and
 *  either alone is half of it.
 *
 *  It reports rather than promises. No browser is obliged to grant this, Safari
 *  decides silently on its own heuristics, and the honest place for the outcome
 *  is the diagnostic, which reads `navigator.storage.persisted()` directly
 *  rather than anything this function remembers. */
let persistence: Promise<boolean> | null = null;
export function requestPersistence(): Promise<boolean> {
  if (persistence) return persistence;
  persistence = (async () => {
    try {
      if (!navigator.storage?.persist) return false;
      // Already granted — asking again is a no-op, but skip the round trip.
      if (await navigator.storage.persisted?.()) return true;
      return await navigator.storage.persist();
    } catch {
      return false;
    }
  })();
  return persistence;
}

/** Store one photo atomically (meta row + all its source chunks in a single
 *  strict-durability transaction): after this resolves the photo is really on
 *  disk, so the session survives a crash the instant a photo is added. */
export async function addPhoto(meta: PhotoMeta, bytes: Uint8Array): Promise<void> {
  // The first moment the app actually commits the reader's own data is the
  // honest moment to ask for it to be kept. Deliberately NOT awaited.
  void requestPersistence();
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

/** Replace one photo's stored thumbnail. The strip shows the camera's own
 *  embedded preview the moment a photo's bytes are read — the real one, drawn
 *  through this app's pipeline, arrives later from the background pass and
 *  lands here so a resumed session comes back with the right picture. Small
 *  inline value, same as the meta row it rides in. */
export async function setThumb(id: string, thumb: ArrayBuffer): Promise<void> {
  const db = await open();
  try {
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("write aborted"));
      t.onerror = () => rej(t.error ?? new Error("write failed"));
      const store = t.objectStore(META);
      const rq = store.get(id);
      rq.onsuccess = () => {
        const meta = rq.result as PhotoMeta | undefined;
        if (meta) store.put({ ...meta, thumb });
      };
    });
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
/** ENDING A SESSION, WITHOUT THE READER WAITING FOR THE DELETE.
 *
 *  This used to empty both stores in ONE transaction and the press awaited it.
 *  Measured on eight photos and 84 MB: 0.8s, about 110 MB per second of
 *  waiting — which on a forty-photo session is a gigabyte through the same
 *  door, on a browser whose deletes are slower than the one that was measured.
 *
 *  None of that work needs the reader present. What must finish before the
 *  start screen comes back is forgetting the INDEX: the meta rows are what
 *  offer to resume a session, and they are a few kilobytes. Once a meta row is
 *  gone its chunks are unreachable — nothing lists them, nothing counts them,
 *  nothing can open them — so they are swept afterwards, and again at every
 *  start.
 *
 *  THE ORDER IS THE SAFETY. Meta first means an interrupted end can only ever
 *  leave bytes nothing can reach; the other order would leave a session that
 *  half-resumes, pointing at photos whose bytes are gone. So an interruption
 *  costs space until the next launch, never correctness.
 *
 *  Returns the ids it forgot, so the sweep can go straight to them instead of
 *  looking for orphans. */
export async function forgetSession(): Promise<string[]> {
  const db = await open();
  try {
    const ids = await req<string[]>(db.transaction(META).objectStore(META).getAllKeys() as IDBRequest);
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite");
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.objectStore(META).clear();
    });
    void dropBytes(ids); // not awaited: this is the whole point of the split
    return ids;
  } finally {
    db.close();
  }
}

/** The one sweep, and the promise anything that needs it finished can await.
 *  A second call while one is running joins it rather than starting a rival —
 *  two sweeps deleting the same ranges is wasted work at best and a pair of
 *  transactions fighting over one store at worst. */
let sweeping: Promise<void> | null = null;
export function sweepSettled(): Promise<void> {
  return sweeping ?? Promise.resolve();
}

/** Delete the chunks of photos that are no longer in the index.
 *
 *  ONE TRANSACTION PER PHOTO, deliberately. A single transaction spanning a
 *  gigabyte is exactly what was taken out of the reader's way; running the same
 *  shape in the background would only move the stall to wherever the next write
 *  queues behind it. */
function dropBytes(ids: string[]): Promise<void> {
  if (!ids.length) return sweepSettled();
  const run = (async () => {
    await sweepSettled(); // never two at once on the same store
    const db = await open();
    try {
      for (const id of ids) {
        await new Promise<void>((res) => {
          const t = db.transaction(CHUNKS, "readwrite");
          t.oncomplete = () => res();
          // A failed delete costs space, not correctness — the next sweep finds
          // it again. Never reject: one unlucky row must not strand the rest.
          t.onerror = () => res();
          t.onabort = () => res();
          t.objectStore(CHUNKS).delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
        });
      }
    } finally {
      db.close();
    }
  })();
  // Clear the slot only if it is still OURS: a sweep started after this one
  // owns it by then, and blanking it would let a third start alongside.
  const mine: Promise<void> = run.catch(() => {}).finally(() => { if (sweeping === mine) sweeping = null; });
  sweeping = mine;
  return mine;
}

/** Anything left behind by an ending that did not finish — called at start.
 *
 *  WALKS ONE PHOTO AT A TIME, not one chunk at a time. A 25 MB photo is more
 *  than eight hundred 30 KB chunks, so a forty-photo session holds tens of
 *  thousands of keys; after seeing [id, n] the next key worth looking at is the
 *  first one past [id, Infinity], which a key cursor can be told to jump to.
 *  That makes the usual case — nothing orphaned — one step per photo. */
export async function sweepOrphans(): Promise<number> {
  const db = await open();
  let orphans: string[] = [];
  try {
    const live = new Set(await req<string[]>(db.transaction(META).objectStore(META).getAllKeys() as IDBRequest));
    const seen: string[] = [];
    await new Promise<void>((res, rej) => {
      const rq = db.transaction(CHUNKS).objectStore(CHUNKS).openKeyCursor();
      rq.onerror = () => rej(rq.error);
      rq.onsuccess = () => {
        const c = rq.result;
        if (!c) { res(); return; }
        const k = c.key as [string, number];
        seen.push(k[0]);
        c.continue([k[0], Infinity]);
      };
    });
    orphans = seen.filter((id) => !live.has(id));
  } finally {
    db.close();
  }
  if (orphans.length) await dropBytes(orphans);
  return orphans.length;
}
