// On-device store for SAVED MASKS (IndexedDB "ips-masks"). Modeled on luts.ts,
// which is modeled on batchstore.ts — one row per mask, no chunking, because a
// saved mask is a convenience rather than irreplaceable work: losing one costs
// the reader the gesture of making it again, not a finished photograph.
//
// WHAT IS STORED IS A RECIPE, NEVER A BITMAP, and that is the whole design
// rather than a space saving (decision 040). A painted bitmap is bound to one
// photograph's geometry and one frame's subject, so it is right on the frame it
// came from and wrong on every other; the field says the same thing and its own
// advice for a series is to apply the previous photo's settings instead. A Sky
// mask is therefore stored as its NUMBERS and re-detected on the new
// photograph, with 031's `fix` strokes replayed over whatever that detection
// returns — which is precisely why 031 kept corrections as strokes rather than
// painting them in.
import type { MaskLayer } from "./pipeline";

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
  return { ...rest, fix: m.fix ? m.fix.map((s) => ({ pts: new Float32Array(s.pts), r: s.r, add: s.add })) : undefined };
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
