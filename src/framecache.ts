// What the lens rig has already measured, so an interrupted run is not thrown
// away.
//
// WHY. Measuring ninety frames is minutes of decoding, and every one of them
// was held in memory until the run finished. An iPad sleeping in the middle of
// it — or a reload, or a tab the system reclaimed — discarded the lot, and the
// only way back was to start again from the first frame.
//
// A measured frame is three arrays of eighty numbers: about 2 KB. That matters
// for HOW it is stored, not just where. See batchstore.ts for the gotcha this
// inherits: any LARGE IndexedDB value goes into a lazily flushed sidecar file
// and can be lost after a "committed" write, while small rows stay inline in
// the transaction log and are genuinely on disk at commit. These rows are small
// by nature, so they are stored one per frame and nothing is chunked.
//
// The key is the file's name and byte length, which is what identifies a picked
// file across runs without reading it — the same identity a resumed batch uses.

export interface CachedFrame {
  key: string;
  /** A FrameProfile, minus anything that is not JSON. */
  profile: unknown;
  /** When it was measured, so a stale cache can be swept. */
  at: number;
}

const DB = "ips-lensframes";
const STORE = "frames";
const KEEP_MS = 14 * 24 * 60 * 60 * 1000; // a fortnight: long enough to finish a shoot

export function frameKey(name: string, size: number): string {
  return `${name} ${size}`;
}

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "key" });
    };
    rq.onsuccess = () => res(rq.result);
    rq.onerror = () => rej(rq.error);
  });
}

/** Everything measured recently, as a map. Read once at the start of a run
 *  rather than per frame: one transaction beats ninety. */
export async function loadMeasured(): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, "readonly");
      const rq = tx.objectStore(STORE).getAll();
      rq.onsuccess = () => {
        const now = Date.now();
        for (const row of (rq.result ?? []) as CachedFrame[]) {
          if (row?.key && row.profile && now - (row.at ?? 0) < KEEP_MS) out.set(row.key, row.profile);
        }
        res();
      };
      rq.onerror = () => res(); // an unreadable cache is an empty one, never a failure
      tx.onabort = () => res();
    });
    db.close();
  } catch {
    // No IndexedDB (a private window, a browser refusing): measure everything,
    // which is exactly what happened before this existed.
  }
  return out;
}

/** Keep one measured frame. Awaited by the caller so the row is on disk before
 *  the next decode starts — the whole point is surviving the moment after. */
export async function putMeasured(key: string, profile: unknown): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ key, profile, at: Date.now() } satisfies CachedFrame);
      tx.oncomplete = () => res();
      tx.onerror = () => res(); // out of room: the run still works, it just cannot resume
      tx.onabort = () => res();
    });
    db.close();
  } catch {
    // Storing is a convenience; failing to store must never stop the measuring.
  }
}

export async function clearMeasured(): Promise<void> {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).clear();
      tx.oncomplete = () => res();
      tx.onerror = () => res();
      tx.onabort = () => res();
    });
    db.close();
  } catch {
    /* nothing to clear */
  }
}
