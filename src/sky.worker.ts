// The sky selection, built off the main thread on a lane of its own. The
// decode worker takes the 1024 px copy (skyfine.ts prepareSkySource) before
// it hands the picture back; this worker turns that copy into the selection —
// the bitmap and its refinement to the picture's edges — and hands it to the
// holder of the picture. It is NOT the decode lane on purpose: built there,
// the selection held the lane for half a second after every opened
// photograph, and a verdict pressed as the page went away lost the decode it
// was waiting on behind it (verdict-durability-walk check 4, red on the branch
// and green on production, 2026-09-18). Decode lanes decode; this one selects.
//
// AND THE SKY MAP OF THE OPEN PHOTOGRAPH, on a second instance of this same
// script (skyClient.ts spawns it). The map is rebuilt for every edit that moves
// what it reads, which is most edits under a look with sky smoothing or depth,
// and it samples the photograph through the denoiser and the detail stage: on
// the page that was a few hundred milliseconds of every slider drag on a fast
// device and seconds under load. This lane holds ONE copy of the open
// photograph's pixels (sent once, in pieces, by `holdScene`) and answers a map
// request with the 128-texel map alone — or, for the first map of a photograph,
// with a 32-texel map first (about a sixteenth of the work) and the 128-texel one
// after it, so the page can show the sky while the full map is still being made.
// It runs `buildOpenSkyMap`, the one
// definition (skymap.ts), over those pixels, so the map is the page's own; the
// only difference is where the arithmetic runs. A selection ask has no `kind`
// and a map or scene message has one, so the two instances cannot be confused
// even if a message reached the wrong one.

import { buildSkySelectionFrom, type SkySource } from "./skyfine";
import { buildOpenSkyMap, type MapScene } from "./skymap";
import { applyLensFlat, type LensApplied } from "./lensflat";
import type { BrushMask, EditParams, LensCurve, LocalMap, SkyMap } from "./pipeline";
import type { WarpField } from "./warp";

interface SelectJob {
  kind?: undefined;
  id: number;
  src: SkySource;
}

/** The start of a scene: what is true of the pixels that follow in `SceneChunk`s. */
export interface SceneStart {
  kind: "scene";
  scene: number;
  width: number;
  height: number;
  camMatrix?: number[];
  /** Which buffer the pixels fill: the raw's Float32 `linear` or the 8-bit `pixels`. */
  format: "linear" | "pixels";
  /** The buffer's length in bytes. */
  bytes: number;
  /** The lens flat the page's copy carried when this one was taken. */
  lensApplied: LensApplied | null;
}
/** A piece of the scene's pixels, copied by the page and moved here. */
export interface SceneChunk { kind: "chunk"; scene: number; at: number; data: ArrayBuffer }
/** Let go of the held scene (the photograph was left, or the session ended). */
export interface SceneDrop { kind: "drop" }
/** Build the sky map for one edit of the held scene. */
export interface MapJob {
  kind: "map";
  /** The ask's number; the answer carries it back as `ask` (not `id`, which the
   *  selection answers use). */
  ask: number;
  scene: number;
  params: EditParams;
  local: LocalMap | null;
  /** The lens flat the page's copy carries NOW; this copy is brought to it first. */
  applied: LensApplied | null;
  /** `lensForEdit(img)`: the curve the grade takes (null for a raw). */
  lens: LensCurve | null;
  sky: BrushMask;
  warp: WarpField | null;
  pitch: number;
  /** When set, the width in texels of a COARSE map to build and post first
   *  (skymap.ts SKY_MAP_COARSE_W), before the full one; absent, only the full map is
   *  built. The page asks for it for the first map of a photograph, which is the one
   *  the reader is waiting for. */
  coarse?: number;
}
/** What the lane posts for a map ask. `stage` says which map `map` is: the coarse one
 *  comes first and the ask stays open, the full one (`stage` absent or "full") ends
 *  it. `ms` is the lane's own clock for building that map, not the queue before it
 *  or the trip back. `failed` ends the ask and tells the page to build the map. */
export interface MapAnswer { ask: number; map?: SkyMap | null; stage?: "coarse" | "full"; ms?: number; failed?: string }
type Job = SelectJob | SceneStart | SceneChunk | SceneDrop | MapJob;

/** The scene held: the pixels as a `MapScene` plus how much of them has arrived. */
let held: { scene: number; img: MapScene & { lensApplied?: LensApplied }; filled: number; total: number } | null = null;

const post = (m: unknown, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

/** Bring the held pixels to the lens flat the page's copy carries, by ratio against
 *  what they carry now (lensflat.ts `applyLensFlat`, the same pass `bringLensTo`
 *  makes on the page). Takes the target the request names. Returns nothing; changes
 *  the held buffer in place. What it must satisfy: afterwards the held copy's
 *  `lensApplied` is the target, so the flat `buildOpenSkyMap` is told is the flat
 *  the pixels carry. */
function follow(img: NonNullable<typeof held>["img"], target: LensApplied | null): void {
  if (!img.linear || !target) return;
  const have = img.lensApplied ?? { stamp: "", strength: 0, gains: null };
  if (have.stamp === target.stamp && have.strength === target.strength) return;
  applyLensFlat(img.linear, img.width, img.height, target.gains, have.gains);
  img.lensApplied = target;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const m = e.data;
  if (m.kind === undefined) {
    const { id, src } = m;
    try {
      const sel = buildSkySelectionFrom(src);
      const transfer: Transferable[] = [];
      if (sel.mask) transfer.push(sel.mask.data.buffer);
      if (sel.fine) transfer.push(sel.fine.data.buffer);
      post({ id, sel }, transfer);
    } catch {
      // Answer anyway: a holder waiting on this builds the selection itself.
      post({ id, sel: null });
    }
    return;
  }
  if (m.kind === "scene") {
    const img: NonNullable<typeof held>["img"] = { width: m.width, height: m.height, camMatrix: m.camMatrix, lensApplied: m.lensApplied ?? undefined };
    if (m.format === "linear") img.linear = new Float32Array(m.bytes / 4);
    else img.pixels = new Uint8ClampedArray(m.bytes);
    held = { scene: m.scene, img, filled: 0, total: m.bytes };
    return;
  }
  if (m.kind === "chunk") {
    if (!held || held.scene !== m.scene) return;
    const buf = held.img.linear ?? held.img.pixels;
    if (!buf) return;
    new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength).set(new Uint8Array(m.data), m.at);
    held.filled += m.data.byteLength;
    return;
  }
  if (m.kind === "drop") { held = null; return; }
  // A map ask. An answer that carries `failed` tells the page to build the map
  // itself: the scene was not here, or had not all arrived, or the build threw.
  try {
    if (!held || held.scene !== m.scene || held.filled < held.total) { post({ ask: m.ask, failed: "scene not held" } satisfies MapAnswer); return; }
    follow(held.img, m.applied);
    const flat = held.img.linear ? held.img.lensApplied?.gains ?? null : null;
    // THE COARSE MAP FIRST WHEN THE PAGE ASKED FOR IT: posted as soon as it is built,
    // so the page can show the sky while the full map, sixteen times the taps, is
    // still being made. A bitmap that selects nothing gives no map at any width, so
    // the full build is skipped and the ask ends with that answer.
    if (m.coarse) {
      const c0 = performance.now();
      const rough: SkyMap | null = buildOpenSkyMap(held.img, m.params, m.local ?? undefined, m.lens, flat, m.sky, m.warp, m.pitch, m.coarse);
      post({ ask: m.ask, map: rough, stage: "coarse", ms: performance.now() - c0 } satisfies MapAnswer, rough ? [rough.rgba.buffer] : []);
      if (!rough) { post({ ask: m.ask, map: null, stage: "full", ms: 0 } satisfies MapAnswer); return; }
    }
    const f0 = performance.now();
    const map: SkyMap | null = buildOpenSkyMap(held.img, m.params, m.local ?? undefined, m.lens, flat, m.sky, m.warp, m.pitch);
    post({ ask: m.ask, map, stage: "full", ms: performance.now() - f0 } satisfies MapAnswer, map ? [map.rgba.buffer] : []);
  } catch (err) {
    post({ ask: m.ask, failed: String((err as Error)?.message ?? err) } satisfies MapAnswer);
  }
};
