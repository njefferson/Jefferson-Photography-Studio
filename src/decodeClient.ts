// Main-thread side of the decode worker. Everything in the app decodes through
// here, so there is one place that decides worker-or-not and one place that
// falls back.
//
// The fallback is not decoration: this app is offline-first and installs to a
// home screen, so it has to keep working where a module worker cannot be
// constructed at all. Any failure to START the worker drops that decode — and
// every later one — onto the main thread, which is exactly the behaviour the
// app had before. A decode that fails INSIDE the worker is a different thing:
// that is the file being damaged, and its message must reach the reader
// unchanged ("file looks damaged or incomplete"), never be retried into a
// second identical failure.

import { decode as decodeHere, type DecodedImage } from "./decode";
import type { ImportedFile } from "./import";

type Pending = { resolve: (v: DecodedImage) => void; reject: (e: Error) => void };

let worker: Worker | null = null;
let workerDead = false; // construction or runtime failure — stay on the main thread
let nextJob = 1;
const pending = new Map<number, Pending>();

function failAll(message: string) {
  const err = new Error(message);
  for (const p of pending.values()) p.reject(err);
  pending.clear();
}

function getWorker(): Worker | null {
  if (workerDead) return null;
  if (worker) return worker;
  try {
    worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
  } catch {
    workerDead = true;
    return null;
  }
  worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; img?: DecodedImage; message?: string }>) => {
    const p = pending.get(e.data.id);
    if (!p) return;
    pending.delete(e.data.id);
    if (e.data.ok && e.data.img) p.resolve(e.data.img);
    else p.reject(new Error(e.data.message ?? "decode failed"));
  };
  // The worker itself died (not a file that would not decode). Everything
  // waiting on it is lost, so fail those honestly and put every later decode
  // back on the main thread rather than hanging forever on a dead port.
  worker.onerror = () => {
    workerDead = true;
    worker = null;
    failAll("The decoder stopped unexpectedly — trying again will use the slower path.");
  };
  worker.onmessageerror = () => {
    workerDead = true;
    worker = null;
    failAll("A decoded photo could not be handed back from the decoder.");
  };
  return worker;
}

/** Decode off the main thread where possible, on it where not. Same decoder
 *  either way (src/decode.ts) — see decode.worker.ts. */
export function decodeOffThread(file: ImportedFile): Promise<DecodedImage> {
  const w = getWorker();
  if (!w) return decodeHere(file);
  const id = nextJob++;
  return new Promise<DecodedImage>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      // Bytes are COPIED, not transferred: the caller still needs them to write
      // the photo into storage.
      w.postMessage({ id, file });
    } catch (err) {
      pending.delete(id);
      workerDead = true;
      worker = null;
      // Could not even post — fall back for this decode and all later ones.
      decodeHere(file).then(resolve, reject);
      void err;
    }
  });
}
