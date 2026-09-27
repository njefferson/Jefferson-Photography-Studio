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
  /** THE READER'S VERDICT on this photo: kept, not kept, or not decided yet
   *  (absent). The same two words the quick look uses, because they are the same
   *  decision made in a different place — a session is where the deciding
   *  actually happens, and until now it was the one tool that could not record
   *  one. Absent on every row written before this existed, which reads as
   *  undecided, which is what those photos are. */
  mark?: "pick" | "reject";
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

/** THE ERROR A FAILED WRITE ACTUALLY CARRIES (decision 075's review).
 *
 *  Takes `ev`, the error event as it reaches the transaction, `t`, the
 *  transaction, and `fallback`, the words to use when neither says anything.
 *  Returns the failed REQUEST's own error first. A request's error event
 *  bubbles to the transaction BEFORE the transaction's own `error` is set — the
 *  specification sets that only when the abort that follows is processed — so
 *  reading `t.error` in `onerror` gives null. WebKit refuses a write for room at
 *  the request itself ("Failed to PutOrAdd in database because not enough space
 *  for domain"), so on an iPad every such refusal arrived as a bare "write
 *  failed" that nothing could recognise as the device being full.
 *
 *  EXCEPT an AbortError. When a transaction is aborted for a reason of its own
 *  while requests are still queued, the abort sets `t.error` to that reason
 *  FIRST and then fails each queued request with a bare AbortError — so there
 *  the transaction's error is the one that says what happened.
 *
 *  What callers rely on: a QuotaExceededError comes back AS a
 *  QuotaExceededError, whichever engine reported it and whichever way. */
function writeError(ev: Event | null, t: IDBTransaction, fallback: string): unknown {
  const fromRequest = (ev?.target as IDBRequest | null)?.error ?? null;
  if (fromRequest && fromRequest.name !== "AbortError") return fromRequest;
  return t.error ?? fromRequest ?? new Error(fallback);
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
      t.onerror = (ev) => rej(writeError(ev, t, "write failed"));
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
      t.onerror = (ev) => rej(writeError(ev, t, "write failed"));
      t.onabort = () => rej(t.error ?? new Error("write aborted"));
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

// THE PRESS IS SYNCHRONOUS AND THE WRITE IS NOT, AND A RELOAD CAN LAND BETWEEN
// THEM. `setMark` opens a database, reads a row and puts it back under strict
// durability — tens of milliseconds at best — while a verdict is one keypress.
// Measured: press X and reload at once and the mark is gone, every time, and it
// is always the LAST one pressed; the ones before it had time to land.
//
// That is not a contrived race on the device this is built for. iPadOS discards
// background tabs and reloads them by itself, so "the page reloaded a moment
// after I pressed X" is what a long culling session looks like, not an edge
// case — and the whole point of a verdict is that it is a decision rather than
// a highlight.
//
// So the intent is recorded SYNCHRONOUSLY, in localStorage, before the durable
// write is even started: by the time the press returns, the mark exists
// somewhere no reload can beat. The durable row is still the real home — this
// only has to survive the gap. `listPhotos` applies anything left over and
// re-issues the write, so a mark that died in the gap comes back on resume and
// then lands properly.
//
// Failure is silent BY DESIGN, twice over: a private window throws on
// localStorage, and losing the mirror only puts the behaviour back to what it
// was. A reader must not be told about a safety net they never asked for.
const PENDING_KEY = "ips-pending-marks";

type PendingMarks = Record<string, PhotoMeta["mark"] | null>;

function readPending(): PendingMarks {
  try {
    const raw = localStorage.getItem(PENDING_KEY);
    const p = raw ? JSON.parse(raw) : {};
    return p && typeof p === "object" ? (p as PendingMarks) : {};
  } catch {
    return {};
  }
}

function writePending(p: PendingMarks): void {
  try {
    if (Object.keys(p).length) localStorage.setItem(PENDING_KEY, JSON.stringify(p));
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    /* private window, or full: the durable write is still the real one */
  }
}

/** Remember an intent the durable write has not caught up with. `null` is a
 *  CLEARED verdict, which is a different thing from "no pending entry" — U on a
 *  photo followed by a reload has to clear the stored mark, not leave it. */
function notePending(id: string, mark: PhotoMeta["mark"]): void {
  const p = readPending();
  p[id] = mark ?? null;
  writePending(p);
}

/** Drop an entry once its row is really on the disk — but only if it is still
 *  the same answer. A second press while the first was in flight leaves a newer
 *  intent here, and clearing it on the older write's completion would throw the
 *  reader's last press away. */
function clearPending(id: string, mark: PhotoMeta["mark"]): void {
  const p = readPending();
  if (!(id in p)) return;
  if (p[id] !== (mark ?? null)) return;
  delete p[id];
  writePending(p);
}

/** Every stored photo's metadata (incl. thumbnail + edit), strip order first.
 *
 *  Anything still pending is applied over what came back and written again, so
 *  a resume shows the verdict the reader actually pressed. Done here rather
 *  than in a separate call somebody has to remember: this is the one function
 *  every path that rebuilds a session already goes through. */
export async function listPhotos(): Promise<PhotoMeta[]> {
  const db = await open();
  let metas: PhotoMeta[];
  try {
    metas = await req<PhotoMeta[]>(db.transaction(META).objectStore(META).getAll());
  } finally {
    db.close();
  }
  const pending = readPending();
  const ids = Object.keys(pending);
  if (ids.length) {
    for (const m of metas) {
      if (!(m.id in pending)) continue;
      const want = pending[m.id];
      if (want) m.mark = want;
      else delete m.mark;
    }
    // Not awaited: a resume must not wait on a repair, and a failure here just
    // leaves the entry pending for next time.
    for (const id of ids) {
      if (!metas.some((m) => m.id === id)) { clearPending(id, pending[id] ?? undefined); continue; }
      void setMark(id, pending[id] ?? undefined).catch(() => {});
    }
  }
  return metas.sort((a, b) => a.order - b.order);
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
      t.onerror = (ev) => rej(writeError(ev, t, "write failed"));
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

/** Record (or clear) one photo's verdict. Same shape as setThumb: read the meta
 *  row, put it back whole, one strict-durability transaction, nothing else
 *  touched. A verdict has to survive a reload or it is not a decision, it is a
 *  highlight. */
export async function setMark(id: string, mark: PhotoMeta["mark"]): Promise<void> {
  // FIRST, AND SYNCHRONOUSLY — see PENDING_KEY above. Everything below can be
  // beaten by a reload; this line cannot.
  notePending(id, mark);
  const db = await open();
  try {
    let found = false;
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite", { durability: "strict" } as IDBTransactionOptions);
      t.oncomplete = () => res();
      t.onabort = () => rej(t.error ?? new Error("write aborted"));
      t.onerror = (ev) => rej(writeError(ev, t, "write failed"));
      const store = t.objectStore(META);
      const rq = store.get(id);
      rq.onsuccess = () => {
        const meta = rq.result as PhotoMeta | undefined;
        if (!meta) return; // no row (yet) — nothing to mark
        found = true;
        // Written as an ABSENT field rather than undefined-valued, so a cleared
        // verdict and one that was never made are the same row.
        const next = { ...meta };
        if (mark) next.mark = mark;
        else delete next.mark;
        store.put(next);
      };
    });
    // ONLY WHEN IT LANDED ON A ROW (decision 075's review). A photo whose own
    // write was refused for room has no row until it is written again, and a
    // press in between used to clear the safety copy here although nothing had
    // been stored — so the verdict survived neither the retry nor a reload.
    if (found) clearPending(id, mark); // the row is really on the disk now
  } finally {
    db.close();
  }
}

/** Materialise one photo's source bytes (its chunks, in order). Only ever one
 *  photo's bytes are in RAM at a time — the caller decodes then drops them. */
export async function getBytes(id: string, onRows?: (n: number) => void): Promise<Uint8Array> {
  const db = await open();
  try {
    const rows = await req<{ idx: number; bytes: ArrayBuffer }[]>(
      db.transaction(CHUNKS).objectStore(CHUNKS).getAll(IDBKeyRange.bound([id, 0], [id, Infinity])),
    );
    // HOW MANY ROWS THIS READ CROSSED, handed to the caller rather than left in
    // a module variable: two reads run at once whenever the editor opens a photo
    // while the thumbnail pass is working, and a shared global would report
    // whichever finished last. Reporting only — nothing here reads it back.
    onRows?.(rows.length);
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
      t.onerror = (ev) => rej(writeError(ev, t, "delete failed"));
      t.onabort = () => rej(t.error ?? new Error("delete aborted")); // a commit that failed: see forgetSession
      t.objectStore(META).delete(id);
      t.objectStore(CHUNKS).delete(IDBKeyRange.bound([id, 0], [id, Infinity]));
    });
  } finally {
    db.close();
  }
}

/** THE DATABASE COULD NOT BE REACHED AT ALL (decision 075's review) — not a
 *  clear that failed, but no connection to clear with: WebKit's "Connection to
 *  Indexed Database server lost" after the page sat in the background, or a
 *  backing store that will not open. Nothing stored can be reached, so nothing
 *  can be mixed into; `cause` is the browser's own error. */
export class StorageUnreachable extends Error {
  constructor(readonly cause: unknown) {
    super(`this device's storage could not be reached (${(cause as Error)?.message ?? String(cause)})`);
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
 *  looking for orphans. Rejects with a `StorageUnreachable` when the database
 *  cannot be opened or read at all — there is then nothing this page can
 *  reach to clear, or to mix a new set into — and with the clear's own error
 *  when the index was reached but could not be cleared (a request failed or
 *  the commit aborted). It always settles, which is what `resetSessionState`
 *  — and every open waiting behind it — relies on, and the two rejections are
 *  what it tells apart. */
export async function forgetSession(): Promise<string[]> {
  let db: IDBDatabase;
  let ids: string[];
  try {
    db = await open();
  } catch (err) {
    throw new StorageUnreachable(err);
  }
  try {
    try {
      ids = await req<string[]>(db.transaction(META).objectStore(META).getAllKeys() as IDBRequest);
    } catch (err) {
      throw new StorageUnreachable(err);
    }
    await new Promise<void>((res, rej) => {
      const t = db.transaction(META, "readwrite");
      t.oncomplete = () => res();
      t.onerror = (ev) => rej(writeError(ev, t, "delete failed"));
      // A CLEAR THAT FAILS AT THE COMMIT fires `abort` and nothing else — no
      // request failed — and without this the promise never settled: a Keep or
      // Done on a full disk waited for ever with the one-open guard held.
      t.onabort = () => rej(t.error ?? new Error("delete aborted"));
      t.objectStore(META).clear();
    });
    void dropBytes(ids); // not awaited: this is the whole point of the split
    // And the synchronous mirror, or a pending verdict outlives the session it
    // belonged to and accumulates for ever in a key nobody reads.
    writePending({});
    return ids;
  } finally {
    db.close();
  }
}

let sweeping: Promise<void> | null = null;
/** The one sweep, and the promise anything that needs it finished can await.
 *  A second call while one is running joins it rather than starting a rival —
 *  two sweeps deleting the same ranges is wasted work at best and a pair of
 *  transactions fighting over one store at worst.
 *
 *  Takes nothing. Returns a promise that settles when every sweep started so
 *  far has finished — at once when none is running — and never rejects, so an
 *  `await` on it cannot throw into the path that waits. What that path relies
 *  on: once it settles, `sweepProgress()` reads null until the next sweep. */
export function sweepSettled(): Promise<void> {
  return sweeping ?? Promise.resolve();
}

/** HOW FAR THE SWEEP HAS GOT, for anything that has to wait on it (decision 075).
 *
 *  The delete ran for minutes on a reader's PC and nothing could say so: one
 *  transaction per photo, no progress, no words, and the report printed "none in
 *  progress" throughout. This is the count that lets a wait say how far along it
 *  is, and lets the report say it too. */
export interface SweepProgress {
  /** Photos whose delete has finished — or given up, which a later sweep finds
   *  again — since this run of sweeps began. */
  done: number;
  /** Photos this run of sweeps has been asked to free, joined sweeps included. */
  total: number;
  /** `performance.now()` when this run began. */
  since: number;
}
let progress: SweepProgress | null = null;

/** Read the sweep's progress while it runs.
 *
 *  Takes nothing and changes nothing. Returns a COPY of the running count — so
 *  a caller holding it cannot move the real one — or null when no sweep is
 *  running. Sweeps started while one is running are one run: their photos join
 *  `total`, and the count is cleared only when the last of them settles.
 *
 *  What it has to satisfy: `done <= total` at every read, and non-null exactly
 *  while `sweepSettled()` is still pending. `addToSession` in main.ts polls it
 *  to write "N of M" into the busy card while it waits, and the diagnostic's
 *  "Freeing storage" line reads it; both read null as "nothing to free". */
export function sweepProgress(): SweepProgress | null {
  return progress ? { ...progress } : null;
}

/** Delete the chunks of photos that are no longer in the index.
 *
 *  ONE TRANSACTION PER PHOTO, deliberately. A single transaction spanning a
 *  gigabyte is exactly what was taken out of the reader's way; running the same
 *  shape in the background would only move the stall to wherever the next write
 *  queues behind it. */
function dropBytes(ids: string[]): Promise<void> {
  if (!ids.length) return sweepSettled();
  // Counted from the moment it is ASKED FOR, not when it starts: a sweep queued
  // behind another is still space the reader is waiting to get back.
  progress ??= { done: 0, total: 0, since: performance.now() };
  progress.total += ids.length;
  const run = (async () => {
    let left = ids.length;
    try {
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
          left--;
          if (progress) progress.done++;
        }
      } finally {
        db.close();
      }
    } finally {
      // Photos this run never reached (the database would not open) are neither
      // freed nor still coming, so they leave the total rather than hold the
      // count short of it for ever. The next start's sweep finds them.
      if (left && progress) progress.total -= left;
    }
  })();
  // Clear the slot only if it is still OURS: a sweep started after this one
  // owns it by then, and blanking it would let a third start alongside. The
  // count goes with the slot, for the same reason: it belongs to the last one.
  const mine: Promise<void> = run.catch(() => {}).finally(() => { if (sweeping === mine) { sweeping = null; progress = null; } });
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
