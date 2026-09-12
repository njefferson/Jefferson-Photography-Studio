// THE SAME FOLDER, OPENED AGAIN, DECODED EVERY FILE AGAIN.
//
// A quick look renders every picked file through the real pipeline. That is the
// whole point of it — the tiles are what the photographs will look like — and it
// is also why opening a folder you have already looked at cost exactly as much
// as the first time. Reported from a real session: the same folder, repeatedly,
// watching it load.
//
// So the rendered previews are kept. Keyed on the FILE — its name, its byte
// length and its modified time — because that is what identifies a picked file
// before anything reads it, and it is the same identity a resumed session
// already uses (see session.ts, PhotoMeta.srcName/srcSize). No handle, no path:
// the browser gives us neither.
//
// WHAT MAKES A CACHED PICTURE WRONG, and every one of these is in the key:
//
//   - the FILE changed (a different name, length or modified time — a new file);
//   - the app's rendering changed (PREVIEW_PIPELINE below, held to the code by
//     tools/preview-version-check.mjs, which is in .branch-guard's `also=` list
//     so a commit that changes how a preview is made and does not move the
//     number is refused rather than noticed later);
//   - the READER'S LENS PROFILES changed. A preview is rendered THROUGH the
//     correction, so re-measuring a lens makes every cached picture a portrait
//     of the old correction. That is not hypothetical: a re-measurement this
//     month took a device from 11 profiles carrying colour to 71.
//
// A miss costs exactly what the old behaviour cost, so the worst case is what
// every case used to be.
import { profilesStamp } from "./lensstore";

/** MOVE THIS whenever the pictures a quick look produces would come out
 *  different — a decode change, a pipeline change, a change to the shipped lens
 *  profiles, a different preview size. The gate named above will refuse the
 *  commit if you forget; it exists because a cache keyed on a number nobody
 *  remembers to bump is a cache that serves the wrong picture for ever. */
export const PREVIEW_PIPELINE = 2;

const DB = "ips-previews";
const STORE = "previews";
/** Above this, the least recently used go. A 512px preview and its 260px twin
 *  come to roughly 60 KB together, so this is about 30 MB of pictures — a few
 *  big folders, kept, and nothing unbounded. */
const MAX_ROWS = 500;

export interface PreviewPair {
  /** The grid tile, at the quick look's own size. */
  grid: ArrayBuffer;
  /** The strip-sized twin, rendered off the same decode — what "Keep in a
   *  session" hands across, so a keep after a cache hit needs no decode either. */
  strip: ArrayBuffer;
}

interface Row extends PreviewPair {
  key: string;
  used: number;
  bytes: number;
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

function req<T>(rq: IDBRequest): Promise<T> {
  return new Promise((res, rej) => {
    rq.onsuccess = () => res(rq.result as T);
    rq.onerror = () => rej(rq.error);
  });
}

/** The identity of one picked file's preview under the current everything. */
export function previewKey(f: File, edge: number, lens = profilesStamp()): string {
  return [PREVIEW_PIPELINE, edge, lens, f.size, f.lastModified, f.name].join("|");
}

/** The stored pair, or null — a miss is ordinary and never an error: private
 *  browsing, a cleared store, a first visit and a changed file all land here. */
export async function getPreview(f: File, edge: number, lens?: string): Promise<PreviewPair | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await open();
    const key = previewKey(f, edge, lens);
    const row = await req<Row | undefined>(db.transaction(STORE).objectStore(STORE).get(key));
    if (!row || !row.grid) return null;
    // Touch it, so a folder you keep coming back to outlives one you looked at
    // once. Not awaited: a read must not wait on a write.
    void touch(db, key).catch(() => {});
    return { grid: row.grid, strip: row.strip };
  } catch {
    return null;
  } finally {
    // The touch above needs the connection, so it closes itself.
    if (db) setTimeout(() => db!.close(), 0);
  }
}

function touch(db: IDBDatabase, key: string): Promise<void> {
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, "readwrite");
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    const st = t.objectStore(STORE);
    const rq = st.get(key);
    rq.onsuccess = () => {
      const row = rq.result as Row | undefined;
      if (row) { row.used = Date.now(); st.put(row); }
    };
  });
}

/** Keep one file's pair. Failure is silent BY DESIGN: a preview that could not
 *  be stored costs a decode next time and nothing else, and a reader whose
 *  storage is full must not be told about a cache they never asked for. */
export async function putPreview(f: File, edge: number, pair: PreviewPair, lens?: string): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await open();
    const row: Row = {
      key: previewKey(f, edge, lens),
      grid: pair.grid,
      strip: pair.strip,
      used: Date.now(),
      bytes: pair.grid.byteLength + pair.strip.byteLength,
    };
    await new Promise<void>((res, rej) => {
      const t = db!.transaction(STORE, "readwrite");
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.objectStore(STORE).put(row);
    });
  } catch {
    /* full, refused, or private — the next open just renders again */
  } finally {
    if (db) db.close();
  }
}

/** Drop the oldest rows once there are too many. Called after a run rather than
 *  after every file, so a folder of three hundred is one pass, not three
 *  hundred cursor walks. */
export async function prunePreviews(): Promise<number> {
  let db: IDBDatabase | null = null;
  try {
    db = await open();
    const n = await req<number>(db.transaction(STORE).objectStore(STORE).count());
    if (n <= MAX_ROWS) return 0;
    const rows = await req<Row[]>(db.transaction(STORE).objectStore(STORE).getAll());
    rows.sort((a, b) => (a.used ?? 0) - (b.used ?? 0));
    const drop = rows.slice(0, n - MAX_ROWS);
    await new Promise<void>((res) => {
      const t = db!.transaction(STORE, "readwrite");
      t.oncomplete = () => res();
      t.onerror = () => res();
      for (const r of drop) t.objectStore(STORE).delete(r.key);
    });
    return drop.length;
  } catch {
    return 0;
  } finally {
    if (db) db.close();
  }
}

/** Everything, gone — the reader's own "build these again". */
export async function clearPreviews(): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await open();
    await new Promise<void>((res, rej) => {
      const t = db!.transaction(STORE, "readwrite");
      t.oncomplete = () => res();
      t.onerror = () => rej(t.error);
      t.objectStore(STORE).clear();
    });
  } catch {
    /* nothing to clear */
  } finally {
    if (db) db.close();
  }
}

/** For the diagnostic: how many pictures are kept, and how much they come to. */
export async function previewStats(): Promise<{ rows: number; bytes: number }> {
  let db: IDBDatabase | null = null;
  try {
    db = await open();
    const rows = await req<Row[]>(db.transaction(STORE).objectStore(STORE).getAll());
    return { rows: rows.length, bytes: rows.reduce((s, r) => s + (r.bytes ?? 0), 0) };
  } catch {
    return { rows: 0, bytes: 0 };
  } finally {
    if (db) db.close();
  }
}
