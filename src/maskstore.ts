// On-device store for SAVED MASKS (IndexedDB "ips-masks"), and for the KEPT SKY
// MAP of each photograph, in a database of its own ("ips-skymaps"). Modeled on
// luts.ts, which is modeled on batchstore.ts — one row per mask, no chunking,
// because a saved mask is a convenience rather than irreplaceable work: losing one
// costs the reader the gesture of making it again, not a finished photograph.
//
// WHAT IS STORED AS A SAVED MASK IS A RECIPE, NEVER A BITMAP, and that is the whole design
// rather than a space saving (decision 040). A painted bitmap is bound to one
// photograph's geometry and one frame's subject, so it is right on the frame it
// came from and wrong on every other; the field says the same thing and its own
// advice for a series is to apply the previous photo's settings instead. A Sky
// mask is therefore stored as its NUMBERS and re-detected on the new
// photograph, with 031's `fix` strokes replayed over whatever that detection
// returns — which is precisely why 031 kept corrections as strokes rather than
// painting them in.
//
// THE KEPT SKY MAP IS NOT A SAVED MASK AND DOES NOT LIVE IN THAT DATABASE. It is the
// 128-texel chroma map the look's sky stages blend toward (skymap.ts), built for
// ONE photograph under ONE edit and ONE sky selection, and kept so that coming back
// to that photograph does not wait for the sky map lane to build it again. It is
// bound to the photograph on purpose, which is the opposite of a saved mask, so it
// sits in a database of its own ("ips-skymaps"), never travels, is never listed in
// the Masks panel, and is read back only when every input it was built from is
// identical to the last character (`getKeptSkyMap`). A miss costs exactly what a
// build cost before there was a store. A small index in localStorage (the hint,
// `keptSkyMapHint`) tells the page at once whether to read the store at all, so a
// photograph that was not kept asks the sky map lane without waiting on it.
//
// IN A DATABASE OF ITS OWN BECAUSE A TAB STILL RUNNING AN OLDER BUILD OPENS "ips-masks"
// AT VERSION 1. Raising that database's version for a second store made the older
// tab's open fail with a version error until it was reloaded, so its saved-mask list
// and its saving both went (exercised 2026-10-13: the list said a mask that was there
// was "no longer on this device", and a keep said the device refused to store it).
// A new database costs one more open and nothing else, and leaves "ips-masks" at
// version 1 for every build.
import type { MaskLayer, SkyMap } from "./pipeline";

/** A mask's own numbers with every bitmap removed — what actually travels.
 *
 *  `brush`, `fine`, `eff` and `effFine` are the bitmaps, all of them derived
 *  from the photograph in front of the reader. `fix` stays: it is a list of
 *  strokes, which is geometry rather than pixels, and it is the half that makes
 *  a corrected Sky selection worth keeping. `name` is dropped here because the
 *  record carries the name at the top level — two names for one thing is how
 *  they come to disagree. */
export type MaskShape = Omit<MaskLayer, "brush" | "fine" | "eff" | "effFine" | "name">;

export interface MaskRecord {
  id: string;
  /** What the reader called it, which is the name the mask carried when saved. */
  name: string;
  /** Kept at the top level as well as inside `shape` so a list can be built
   *  without reading every row's numbers — the same reason LutMeta exists. */
  type: MaskLayer["type"];
  shape: MaskShape;
  addedAt: number;
}

export interface MaskMeta {
  id: string;
  name: string;
  type: MaskLayer["type"];
  /** How many hand corrections ride with it, for an honest list line: a Sky
   *  mask with strokes is a different proposition from a bare one. */
  fixes: number;
  addedAt: number;
}

/** Honest ceiling — the list shows the count and offers delete. */
export const MASK_COUNT_CAP = 25;

/** CAN A MASK OF THIS TYPE BE SAVED AT ALL.
 *
 *  Takes `type`, a `MaskLayer.type`. Returns true for radial, gradient, colour
 *  and sky, false for brush (2).
 *
 *  A radial, a gradient and a colour mask are pure numbers and travel exactly.
 *  A sky mask is re-detected on the new photograph from its own numbers, which
 *  is the case that makes saving worth having. A BRUSH mask is nothing but the
 *  bitmap somebody painted, so there is no recipe to keep — saving one could
 *  only mean saving pixels, and pixels are wrong on the next frame.
 *
 *  What the caller relies on: this is the ONLY place that answers the question.
 *  The panel disables saving with it and `putMask` refuses with it, so a
 *  control and a store cannot come to disagree about which masks travel. */
export function canTravel(type: MaskLayer["type"]): boolean {
  return type !== 2;
}

const DB = "ips-masks";
const STORE = "masks";
/** The kept sky maps' database and its one object store. A database of its own, so
 *  that `DB` stays at version 1 (see the header). */
export const SKYMAP_DB = "ips-skymaps";
export const SKYMAP_STORE = "maps";

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

/** Open the kept sky maps' database, creating it at version 1 the first time.
 *  @returns the open database; rejects when the browser refuses (private windows).
 *  What it must satisfy: it touches no other database, so a tab running a build that
 *  knows only `DB` is never blocked by it, and a build that knows both opens each at
 *  its own version. */
function openMaps(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const rq = indexedDB.open(SKYMAP_DB, 1);
    rq.onupgradeneeded = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains(SKYMAP_STORE)) db.createObjectStore(SKYMAP_STORE, { keyPath: "id" }).createIndex("used", "used");
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

/** STRIP A MASK TO WHAT TRAVELS.
 *
 *  Takes `m`, a live `MaskLayer` off the open photograph. Returns its numbers
 *  with every bitmap and the name removed, ready to store.
 *
 *  What the result has to satisfy: it must contain no typed array derived from
 *  the current photograph's pixels. `tools/mask-panel-walk.mjs` asserts the
 *  consequence rather than the shape — a saved Sky mask applied to a DIFFERENT
 *  photograph must select that photograph's sky, which a smuggled bitmap
 *  cannot do. */
export function shapeOf(m: MaskLayer): MaskShape {
  const { brush: _b, fine: _f, eff: _e, effFine: _ef, name: _n, ...rest } = m;
  return { ...rest, fix: m.fix ? m.fix.map((s) => ({ pts: new Float32Array(s.pts), r: s.r, add: s.add, ...(s.tol !== undefined ? { tol: s.tol } : {}) })) : undefined };
}

/** SAVE A MASK, or refuse a type that cannot travel.
 *
 *  Takes `rec`, a complete `MaskRecord`. Returns nothing; throws when the
 *  record's type cannot travel, so a caller that skipped `canTravel` gets an
 *  error rather than a row that will be wrong on every other photograph.
 *
 *  What the caller relies on: after this resolves, `listMasks` includes it. */
export async function putMask(rec: MaskRecord): Promise<void> {
  if (!canTravel(rec.type)) throw new Error("a painted brush mask has no recipe to save");
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

/** ONE SAVED MASK BY ITS ID.
 *
 *  Takes `id`. Returns the record, or null when nothing is stored under it —
 *  null rather than a throw, because a mask deleted on another tab is an
 *  ordinary outcome and the caller says so to the reader.
 *
 *  What the caller relies on: the `shape` it returns is applied to whatever
 *  photograph is open, so it must never be assumed to match the frame it was
 *  saved from. */
export async function getMask(id: string): Promise<MaskRecord | null> {
  const db = await open();
  try {
    return (await req<MaskRecord | undefined>(db.transaction(STORE).objectStore(STORE).get(id))) ?? null;
  } finally {
    db.close();
  }
}

/** EVERY SAVED MASK, newest first, without its numbers.
 *
 *  Takes nothing. Returns one `MaskMeta` per stored mask, sorted newest first.
 *
 *  What the caller relies on: this is what the panel lists, so it holds no
 *  stroke arrays in RAM — the same reason `listLuts` returns meta rather than
 *  lattices. */
export async function listMasks(): Promise<MaskMeta[]> {
  const db = await open();
  try {
    const all = await req<MaskRecord[]>(db.transaction(STORE).objectStore(STORE).getAll());
    return all
      .map((r) => ({ id: r.id, name: r.name, type: r.type, fixes: r.shape?.fix?.length ?? 0, addedAt: r.addedAt }))
      .sort((a, b) => b.addedAt - a.addedAt);
  } finally {
    db.close();
  }
}

/** FORGET A SAVED MASK.
 *
 *  Takes `id`. Returns nothing, and succeeds whether or not a row was there —
 *  deleting something already gone is the reader's intent either way.
 *
 *  What the caller relies on: after this resolves, `listMasks` omits it. */
export async function deleteMask(id: string): Promise<void> {
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

// --- The kept sky maps ---------------------------------------------------------------------------------------

/** THE MOST KEPT MAPS HELD AT ONCE. A map is 128 texels by about 85 at four bytes,
 *  some 44 KB, so this is under 8 MB; past it the least recently kept go. */
export const KEPT_SKY_MAPS_MAX = 160;

/** The row format, compared on read so a row from a build that laid it out
 *  differently is a miss rather than a misread. */
const KEPT_ROW_V = 1;

/** WHERE THE PAGE LOOKS BEFORE IT ASKS THE STORE. An IndexedDB answer reaches the
 *  page as an event, and a page that is busy (the first draw of a look in software
 *  graphics held it 45 s) delivers it only when the busy stretch ends — so a store
 *  read in front of every first map put the lane's start behind the draw, and the
 *  lane, which used to be asked inside the draw's own first step, started late on
 *  every photograph that was NOT kept. The hint is a small index in localStorage,
 *  readable at once: `id` to a short digest of the dependency text it was kept
 *  under. The page asks the store only when the hint says it will have the map, and
 *  otherwise asks the lane at once, as it did before there was a store. The hint
 *  decides nothing about correctness: a row is used only when `getKeptSkyMap`
 *  finds its whole dependency text identical, whatever the hint said. */
const HINT_KEY = "ips-skymap-kept";

/** A SHORT DIGEST OF A TEXT, for the hint. Takes `text`; returns its length and two
 *  32-bit sums over its characters, base 36. The same text gives the same digest
 *  everywhere; a different text almost never does, and where it does the store's
 *  whole-text comparison still refuses it. */
function depsHint(text: string): string {
  let a = 0, b = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    a = (Math.imul(a, 31) + c) | 0;
    b = (Math.imul(b, 131) + c + (i & 255)) | 0;
  }
  return `${text.length}.${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
}

/** The hint index as stored, or empty; never throws (private windows refuse
 *  localStorage). */
function readHints(): Record<string, string> {
  try {
    const raw = localStorage.getItem(HINT_KEY);
    const o = raw ? JSON.parse(raw) : null;
    return o && typeof o === "object" ? (o as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** Write the hint index, newest last, keeping at most KEPT_SKY_MAPS_MAX entries;
 *  never throws. Takes the index; returns nothing. */
function writeHints(h: Record<string, string>): void {
  try {
    const ids = Object.keys(h);
    for (const id of ids.slice(0, Math.max(0, ids.length - KEPT_SKY_MAPS_MAX))) delete h[id];
    localStorage.setItem(HINT_KEY, JSON.stringify(h));
  } catch {
    /* the hint is a convenience; without it the lane is asked at once */
  }
}

/** WILL THE STORE HAVE THIS PHOTOGRAPH'S MAP FOR THESE INPUTS, as far as a glance
 *  can tell, without waiting for the store.
 *
 *  Takes `id`, the photograph's stamp, and `deps`, the text the map would be built
 *  from now. Returns true when the hint index says a map was kept under exactly
 *  this text, false otherwise, including when localStorage is unavailable. Reads
 *  localStorage only and answers at once.
 *
 *  What the caller relies on: false means "ask the lane now", so it is the safe
 *  answer and the only one given on any doubt; true means "read the store first",
 *  and the store's own comparison still has the last word, so a true that proves
 *  wrong costs one read and then the lane, never a wrong sky. */
export function keptSkyMapHint(id: string, deps: string): boolean {
  return readHints()[id] === depsHint(deps);
}

interface KeptRow {
  id: string;
  v: number;
  /** Everything the map was built from, as the caller wrote it, compared whole. */
  deps: string;
  width: number;
  height: number;
  rgba: Uint8Array;
  key: number;
  chroma: number;
  paleTexel: number;
  minTexel: number;
  /** When it was kept; the index the pruning walks. */
  used: number;
}

/** A SHORT DIGEST OF SOME BYTES, to tell two photographs or two bitmaps apart.
 *
 *  Takes `bytes`, anything indexable of 0..255 numbers, and `samples`, how many
 *  places to read at most (omitted 4096; pass Infinity to read every byte). Returns
 *  a text made of the length and two 32-bit sums, each in base 36. The places are
 *  evenly spaced and the last sixty-four bytes are always read, so a file cut short
 *  or extended differs from the original in length first.
 *
 *  What the result has to satisfy: the same bytes give the same text on every call
 *  and in every browser (integer arithmetic only), and a change to a byte it reads
 *  changes it. It is NOT a proof of identity — a byte it steps over can change
 *  unseen — which is why every caller pairs it with a name or a length, and why the
 *  kept map compares its dependencies whole rather than trusting a digest alone. */
export function digestBytes(bytes: ArrayLike<number>, samples = 4096): string {
  const n = bytes.length;
  const step = samples >= n ? 1 : Math.max(1, Math.floor(n / samples));
  let a = 0, b = 0;
  const take = (i: number) => {
    const v = bytes[i];
    a = (Math.imul(a, 31) + v + 1) | 0;
    b = (Math.imul(b, 131) + v + (i & 255)) | 0;
  };
  for (let i = 0; i < n; i += step) take(i);
  for (let i = Math.max(0, n - 64); i < n; i++) take(i);
  return `${n}.${(a >>> 0).toString(36)}.${(b >>> 0).toString(36)}`;
}

/** WHICH PHOTOGRAPH THIS IS, for the kept sky map's row.
 *
 *  Takes `name`, the file's name, and `bytes`, the file's own bytes as the app
 *  holds them. Returns the name and `digestBytes` of the bytes joined, so the same
 *  file opened again reads the same and a different file under the same name does
 *  not. The app has no file modified time to add (`ImportedFile` carries none).
 *
 *  What the result has to satisfy: it is the key of a ROW, so it is stable across
 *  sessions for one file, and nothing about the edit is in it — the edit goes in
 *  the row's `deps`, compared on read. */
export function photographStamp(name: string, bytes: Uint8Array): string {
  return `${name}|${digestBytes(bytes)}`;
}

/** KEEP A PHOTOGRAPH'S SKY MAP, replacing the one kept for it.
 *
 *  Takes `id`, the photograph's stamp (`photographStamp`); `deps`, the text of
 *  everything the map was built from, which `getKeptSkyMap` must be handed again
 *  letter for letter; and `map`, the FULL map (never the coarse one). Returns
 *  nothing and NEVER throws: a map that could not be stored costs one build next
 *  time and nothing else, and a reader whose storage is full is not told about a
 *  cache they never asked for.
 *
 *  What the caller relies on: after it resolves, `getKeptSkyMap(id, deps)` returns
 *  an equal map, until another is kept for the same photograph or the store is past
 *  KEPT_SKY_MAPS_MAX and this is the oldest. */
export async function keepSkyMap(id: string, deps: string, map: SkyMap): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openMaps();
    const row: KeptRow = {
      id, v: KEPT_ROW_V, deps, width: map.width, height: map.height, rgba: new Uint8Array(map.rgba),
      key: map.key, chroma: map.chroma, paleTexel: map.paleTexel, minTexel: map.minTexel,
      used: Date.now(),
    };
    const d = db;
    const gone: string[] = [];
    const stored = await new Promise<boolean>((res) => {
      const t = d.transaction(SKYMAP_STORE, "readwrite");
      t.oncomplete = () => res(true);
      t.onabort = () => res(false);
      t.onerror = () => res(false);
      const st = t.objectStore(SKYMAP_STORE);
      st.put(row);
      // Past the ceiling the oldest go, found through the `used` index by key alone so
      // no map is read to do it. This row is the newest and is never chosen.
      const counted = st.count();
      counted.onsuccess = () => {
        let over = counted.result - KEPT_SKY_MAPS_MAX;
        if (over <= 0) return;
        const walk = st.index("used").openKeyCursor();
        walk.onsuccess = () => {
          const c = walk.result;
          if (!c || over <= 0) return;
          if (c.primaryKey !== id) { st.delete(c.primaryKey); gone.push(String(c.primaryKey)); over--; }
          c.continue();
        };
      };
    });
    // The hint follows the store: this row is in it, and the ones that went are not.
    if (stored) {
      const h = readHints();
      for (const g of gone) delete h[g];
      delete h[id]; // re-added last, so it is the newest in the index's order
      h[id] = depsHint(deps);
      writeHints(h);
    }
  } catch {
    /* full, refused, or private — the next visit builds again */
  } finally {
    db?.close();
  }
}

/** THE KEPT SKY MAP OF A PHOTOGRAPH, ONLY IF IT WAS BUILT FROM EXACTLY THESE INPUTS.
 *
 *  Takes `id`, the photograph's stamp, and `deps`, the text of everything the map
 *  would be built from NOW. Returns the map kept for that photograph when its row
 *  is the current format, its stored `deps` is identical to this one and its bytes
 *  are the size they say, else null — and null for every failure too, because a
 *  miss is ordinary: a first visit, a cleared store, a private window, a changed
 *  edit.
 *
 *  What the caller relies on: a non-null result is the map `keepSkyMap` was given
 *  for these same `deps`, so using it in place of a build shows the same sky. A
 *  changed input must give a different `deps` — that is the caller's half, and the
 *  reason this compares the whole text and not a hash of it. */
export async function getKeptSkyMap(id: string, deps: string): Promise<SkyMap | null> {
  let db: IDBDatabase | null = null;
  try {
    db = await openMaps();
    const row = await req<KeptRow | undefined>(db.transaction(SKYMAP_STORE).objectStore(SKYMAP_STORE).get(id));
    if (!row || row.v !== KEPT_ROW_V || row.deps !== deps) return null;
    if (!(row.rgba instanceof Uint8Array) || row.rgba.length !== row.width * row.height * 4) return null;
    return {
      width: row.width, height: row.height, rgba: row.rgba,
      key: row.key, chroma: row.chroma, paleTexel: row.paleTexel, minTexel: row.minTexel,
    };
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

/** EVERY KEPT SKY MAP, GONE.
 *
 *  Takes nothing. Returns nothing and never throws. What it must satisfy: after it
 *  resolves no photograph has a kept map, so the next visit to each builds one;
 *  saved masks are not touched. The test pages use it to start from a store with
 *  nothing in it. */
export async function clearKeptSkyMaps(): Promise<void> {
  let db: IDBDatabase | null = null;
  try {
    db = await openMaps();
    const d = db;
    await new Promise<void>((res) => {
      const t = d.transaction(SKYMAP_STORE, "readwrite");
      t.oncomplete = () => res();
      t.onabort = () => res();
      t.onerror = () => res();
      t.objectStore(SKYMAP_STORE).clear();
    });
    try { localStorage.removeItem(HINT_KEY); } catch { /* no hint to remove */ }
  } catch {
    /* nothing to clear */
  } finally {
    db?.close();
  }
}
