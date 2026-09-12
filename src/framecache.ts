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
//
// AND THE VERSION OF THE APP THAT MEASURED IT, which the key did NOT carry and
// which turned this from a convenience into a way of serving a fixed bug back.
//
// A cached row is the OUTPUT of the decoder and the profiler. Change either and
// every row becomes an answer from the old code, and a row is reused for a
// fortnight. So after the decoder was fixed to read Nikon raws as raw rather
// than as their embedded previews, and after the per-radius estimator stopped
// emptying the corner, re-measuring the same files would have returned the same
// numbers from before both fixes — with the rig reporting them as "already done
// from an earlier run", which reads as progress. Nothing would have looked
// wrong; the profiles would just still have been the old ones.
//
// The version rather than a hand-kept measuring-code number, because a number
// somebody has to remember to bump is a number that gets forgotten exactly when
// it matters. This one moves on every release by construction. The cost is that
// a release ends any run in progress, and the moment this cache exists to
// survive is a sleep or a reload in the middle of measuring — minutes, not
// releases.
declare const __APP_VERSION__: string;

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
  return `${__APP_VERSION__} ${name} ${size}`;
}

/** The prefix every key from this build carries. */
const mine = () => `${__APP_VERSION__} `;

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
        const pre = mine();
        let others = 0;
        for (const row of (rq.result ?? []) as CachedFrame[]) {
          if (!row?.key || !row.profile) continue;
          // A ROW FROM ANOTHER BUILD IS NOT A ROW, IT IS AN OLD ANSWER.
          if (!row.key.startsWith(pre)) { others++; continue; }
          if (now - (row.at ?? 0) < KEEP_MS) out.set(row.key, row.profile);
        }
        // Sweep them rather than leave them to age out over a fortnight. This is
        // also what gives clearMeasured a caller: it was exported and never
        // called by anything, which is a check nobody had run.
        if (others) void clearMeasured();
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
