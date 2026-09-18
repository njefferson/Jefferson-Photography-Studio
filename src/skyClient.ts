// The main thread's door to the sky worker (sky.worker.ts): hand it the 1024
// px copy a decode came back with and get the selection as a promise. One
// worker for the app, spawned on first use; when it cannot be spawned or dies,
// the promise resolves null and the caller builds the selection on this
// thread — the same fallback the decode lanes have, so a device with no
// workers loses nothing but time.

import type { SkySelection } from "./decode";
import { buildSkySelectionFrom, type SkySource } from "./skyfine";

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
    w.postMessage({ id, src }, [src.rgb.buffer]);
  });
}
