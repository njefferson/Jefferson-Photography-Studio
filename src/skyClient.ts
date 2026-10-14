// The main thread's door to the sky worker (sky.worker.ts): hand it the 1024
// px copy a decode came back with and get the selection as a promise. One
// worker for the app, spawned on first use; when it cannot be spawned or dies,
// the promise resolves null and the caller builds the selection on this
// thread — the same fallback the decode lanes have, so a device with no
// workers loses nothing but time.
//
// AND THE SKY MAP LANE, a second instance of the same worker script that holds
// the open photograph's pixels and builds the sky map of each edit from them
// (`requestSkyMap`, further down). Two instances rather than one so that a map
// build, which can take a few hundred milliseconds, never stands in front of a
// selection that a lift is waiting on.

import type { DecodedImage, SkySelection } from "./decode";
import { buildSkySelectionFrom, type SkySource } from "./skyfine";
import type { BrushMask, EditParams, LensCurve, LocalMap, SkyMap } from "./pipeline";
import type { WarpField } from "./warp";
import type { MapAnswer, MapJob, SceneChunk, SceneStart } from "./sky.worker";
import { SKY_MAP_COARSE_W } from "./skymap";

let worker: Worker | null | undefined;
let nextId = 1;
const waiting = new Map<number, (sel: SkySelection | null) => void>();

/** Spawn the worker on first use; null when the environment has none. */
function lane(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./sky.worker.ts", import.meta.url), { type: "module" });
  } catch {
    worker = null;
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; sel: SkySelection | null }>) => {
    const w = waiting.get(e.data.id);
    waiting.delete(e.data.id);
    w?.(e.data.sel);
  };
  const dead = () => {
    // Everything waiting gets null and builds on this thread; the worker is
    // not respawned, because a lane that died once is not worth a second wait.
    for (const w of waiting.values()) w(null);
    waiting.clear();
    try { worker?.terminate(); } catch { /* already gone */ }
    worker = null;
  };
  worker.onerror = dead;
  worker.onmessageerror = dead;
  return worker;
}

/**
 * Build the sky selection for a photograph, off the main thread when there is
 * a worker to do it on.
 * @param src  the copy prepareSkySource took — for THIS photograph, its buffer
 *             transferred to the worker (do not read it afterwards).
 * @returns the selection, or null when no worker could answer — the caller
 *   then builds it on this thread (main.ts skyMaskFor / syncSkyMap).
 * What the result must satisfy: it is byte for byte what buildSkySelectionFrom
 * returns on this thread for the same copy, because both run the same code;
 * the worker only moves the cost.
 */
export function requestSkySelection(src: SkySource): Promise<SkySelection | null> {
  const w = lane();
  if (!w) return Promise.resolve(buildSkySelectionFrom(src));
  return new Promise<SkySelection | null>((res) => {
    const id = nextId++;
    waiting.set(id, res);
    w.postMessage({ id, src }, src.clip ? [src.rgb.buffer, src.clip.buffer] : [src.rgb.buffer]);
  });
}

// --- The sky MAP lane ----------------------------------------------------------------------------------------

/** What a map ask comes back with: the map (null when the sky bitmap selects
 *  nothing, which is an answer) and `ms`, the lane's own clock for building it, or
 *  null when the lane could not build it and the page has to. */
export type SkyMapAnswer = { map: SkyMap | null; ms: number } | null;

let mapWorker: Worker | null | undefined;
let mapNext = 1;
const mapWaiting = new Map<number, (a: SkyMapAnswer) => void>();
/** Who wants the COARSE map of an ask, until the full one ends the ask. */
const mapCoarse = new Map<number, (map: SkyMap | null, ms: number) => void>();
/** The photograph whose pixels the lane holds, and the scene's number there. */
let sceneOwner: DecodedImage | null = null;
let sceneId = 0;
let sceneSeq = 0;
/** How many bytes of pixels go in one message. The page copies a piece, moves it
 *  and takes the next, so the most it ever holds beside the photograph is this. */
const SCENE_PIECE = 8 << 20;

/** Spawn the map lane on first use; null when the environment has none or it died. */
function mapLane(): Worker | null {
  if (mapWorker !== undefined) return mapWorker;
  try {
    mapWorker = new Worker(new URL("./sky.worker.ts", import.meta.url), { type: "module" });
  } catch {
    mapWorker = null;
    return null;
  }
  mapWorker.onmessage = (e: MessageEvent<MapAnswer>) => {
    const a = e.data;
    // The coarse map is the first of two answers to one ask: hand it over and keep
    // the ask open for the full map, which ends it. A failure ends it either way.
    if (a.stage === "coarse" && a.failed === undefined) {
      mapCoarse.get(a.ask)?.(a.map ?? null, a.ms ?? 0);
      return;
    }
    const w = mapWaiting.get(a.ask);
    mapWaiting.delete(a.ask);
    mapCoarse.delete(a.ask);
    w?.(a.failed !== undefined ? null : { map: a.map ?? null, ms: a.ms ?? 0 });
  };
  const dead = () => {
    // Everything waiting is told to build on the page, and the lane is not
    // respawned: one that died once is not worth a second wait.
    for (const w of mapWaiting.values()) w(null);
    mapWaiting.clear();
    mapCoarse.clear();
    try { mapWorker?.terminate(); } catch { /* already gone */ }
    mapWorker = null;
    sceneOwner = null;
  };
  mapWorker.onerror = dead;
  mapWorker.onmessageerror = dead;
  return mapWorker;
}

/** Send the lane a copy of a photograph's pixels, once, in pieces.
 *  @param img  the open photograph; its `linear` or `pixels` is copied, never moved.
 *  @returns true when the lane holds (or is being sent) this photograph's pixels;
 *  false when there is no lane or the copy could not be posted. What it must
 *  satisfy: the copy is taken in one task, so a lens re-apply on the page
 *  (`ensureLensApplied`) cannot land between two pieces, and `img.lensApplied`
 *  is read in the same task, so the lane knows which flat its copy carries. The
 *  copy is held until another photograph is held or `releaseSkyMapScene`. */
export function holdSkyMapScene(img: DecodedImage): boolean {
  const w = mapLane();
  if (!w) return false;
  if (sceneOwner === img) return true;
  const buf = img.linear ?? img.pixels;
  if (!buf) return false;
  const id = ++sceneSeq;
  try {
    const start: SceneStart = {
      kind: "scene", scene: id, width: img.width, height: img.height, camMatrix: img.camMatrix,
      format: img.linear ? "linear" : "pixels", bytes: buf.byteLength, lensApplied: img.lensApplied ?? null,
    };
    w.postMessage(start);
    const bytes = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
    for (let at = 0; at < bytes.length; at += SCENE_PIECE) {
      const piece = bytes.slice(at, Math.min(bytes.length, at + SCENE_PIECE));
      const msg: SceneChunk = { kind: "chunk", scene: id, at, data: piece.buffer };
      w.postMessage(msg, [piece.buffer]);
    }
  } catch {
    sceneOwner = null;
    return false;
  }
  sceneOwner = img;
  sceneId = id;
  return true;
}

/** Let the lane drop the pixels it holds, unless they are `keep`'s.
 *  @param keep  a photograph whose copy should stay, or omitted.
 *  Returns nothing. What it must satisfy: afterwards the lane holds at most
 *  `keep`'s pixels, so a photograph that has been left costs no memory here. */
export function releaseSkyMapScene(keep?: DecodedImage): void {
  if (!sceneOwner || sceneOwner === keep) return;
  sceneOwner = null;
  try { mapWorker?.postMessage({ kind: "drop" }); } catch { /* the lane is gone */ }
}

/** What a sky map ask takes besides the photograph: the edit, the pieces the page
 *  builds the map from now, and the sampler's pitch (main.ts `decodePitch`). */
export interface SkyMapAsk {
  params: EditParams;
  local: LocalMap | undefined;
  lens: LensCurve | null | undefined;
  sky: BrushMask;
  warp: WarpField | null;
  pitch: number;
  /** Given, the lane builds a COARSE map first (skymap.ts SKY_MAP_COARSE_W) and this
   *  is called with it when it lands, before the promise of the full map settles;
   *  `ms` is the lane's own clock for it. Omitted, only the full map is built. */
  onCoarse?: (map: SkyMap | null, ms: number) => void;
}

/**
 * Ask the lane for the sky map of an edit of the open photograph, building
 * nothing on this thread.
 * @param img  the open photograph (`current`); its pixels are sent on the first ask.
 * @param a  the edit and what `syncSkyMap` builds the map from; with `onCoarse` the
 *   lane builds a map a quarter as wide first and `onCoarse` receives it.
 * @returns null at once when there is no lane (the caller builds the map itself),
 * else a promise of the answer: `{ map, ms }` when the lane built it, or null when it
 * could not (it died, or the build threw) and the caller builds it itself. What it
 * must satisfy: `map` is what `buildOpenSkyMap` returns for the same pixels, edit
 * and flat, because the lane runs that function and nothing else; the pixels it
 * reads are the page's own as of the first ask, brought to the flat the page's copy
 * carries at THIS ask. Stickers are left out of the copy of the edit sent: no stage
 * of the map reads them. The coarse map, when asked for, reaches `onCoarse` before
 * the promise settles and never after, and a failed ask never calls it.
 */
export function requestSkyMap(img: DecodedImage, a: SkyMapAsk): Promise<SkyMapAnswer> | null {
  if (!holdSkyMapScene(img)) return null;
  const w = mapLane();
  if (!w) return null;
  const ask = mapNext++;
  const { stickers: _stickers, ...params } = a.params;
  return new Promise<SkyMapAnswer>((res) => {
    mapWaiting.set(ask, res);
    if (a.onCoarse) mapCoarse.set(ask, a.onCoarse);
    const job: MapJob = {
      kind: "map", ask, scene: sceneId, params: params as EditParams, local: a.local ?? null,
      applied: img.lensApplied ?? null, lens: a.lens ?? null, sky: a.sky, warp: a.warp, pitch: a.pitch,
      coarse: a.onCoarse ? SKY_MAP_COARSE_W : undefined,
    };
    try { w.postMessage(job); } catch { mapWaiting.delete(ask); mapCoarse.delete(ask); res(null); }
  });
}
