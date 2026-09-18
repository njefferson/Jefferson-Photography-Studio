// Main-thread side of the decode workers. Everything in the app decodes through
// here, so there is one place that decides worker-or-not and one place that
// falls back.
//
// The fallback is not decoration: this app is offline-first and installs to a
// home screen, so it has to keep working where a module worker cannot be
// constructed at all. Any failure to START a worker drops that decode onto the
// main thread, which is exactly the behaviour the app had before. A decode that
// fails INSIDE a worker is a different thing: that is the file being damaged,
// and its message must reach the reader unchanged ("file looks damaged or
// incomplete"), never be retried into a second identical failure.
//
// SEVERAL LANES, NOT ONE, since 2026-09-13. Moving the decode off the main
// thread was the fix that stopped a set open freezing the editor, and it left
// the several-cores half undone: one worker meant forty photographs were
// decoded one after another, and the lens rig sent ninety flats through the
// same door.
//
// Measured on the devices this app is actually used on, by the test page: a
// practice raw decodes in 180 ms on an 8-core iPad and 92 ms on a 4-core one,
// against 43 on a desktop — so the device with the most cores idle is the one
// paying the most per photograph.
//
// HOW MANY LANES, and why it is not "as many as there are cores". Each lane in
// flight holds a file's bytes and the decode it produced: about 110 MB for a
// 25 MB raw (26 MB of file, ~84 MB of half-resolution linear float). Three of
// those is ~330 MB, which is inside the same envelope the parallel export
// spends and was measured against. Safari reports no memory at all, so a device
// that does not say gets the conservative number rather than the optimistic one.
import { prepareSkySource, type SkySource } from "./skyfine";
import { requestSkySelection } from "./skyClient";
import { decode as decodeHere, type DecodedImage } from "./decode";
import type { ImportedFile } from "./import";

/** WHERE A DECODE'S TIME ACTUALLY WENT. Waiting for a free lane and decoding
 *  are different problems with different fixes — a queue is the app's own doing,
 *  a slow decode is the device — and one number cannot tell them apart. The
 *  editor's own decode sat behind a background thumbnail pass for seconds at a
 *  time and the only thing anyone could say about it was "loading is slow". */
export interface DecodeTiming {
  /** ms between asking for the decode and a lane picking it up. */
  queued: number;
  /** ms spent actually decoding, in the lane or on the main thread. */
  run: number;
  /** How many decodes were already waiting when this one was asked for. */
  depth: number;
  /** False when no worker could be used and this ran on the main thread. */
  offThread: boolean;
}

export interface DecodeOptions {
  /** Called once when the decode settles, win or lose. Reporting only — it must
   *  never change what is decoded or when. */
  onTiming?: (t: DecodeTiming) => void;
  /** THE READER IS WAITING ON THIS ONE. Go to the head of the queue instead of
   *  the tail.
   *
   *  The pool is first-come-first-served and has no notion of which decode
   *  somebody is looking at. The background pass that builds a picture for every
   *  photo in a set is its largest customer, so tapping a photo could queue
   *  behind several of those — and `realThumbnails` works around it by leaving
   *  one lane free, which its own comment calls the cheap half of this.
   *
   *  Only the three places where a photograph is on its way to the screen pass
   *  it. A tile decode never does: a tile arriving a moment later is nothing,
   *  and a queue where everything is urgent is the queue we already had. */
  front?: boolean;
  /** Build the photograph's sky selection with the decode (DecodedImage.skySel):
   *  the decode hands back the copy it is built from, the sky worker builds it,
   *  and `skySelReady` resolves when it lands. Passed by the paths that open a
   *  photograph for editing and by the batch; a tile never asks. */
  sky?: boolean;
}

type Pending = {
  resolve: (v: DecodedImage) => void;
  reject: (e: Error) => void;
  onTiming?: (t: DecodeTiming) => void;
  queuedAt: number;
  startedAt: number;
  depth: number;
  sky?: boolean;
};
interface Lane {
  worker: Worker;
  pending: Map<number, Pending>;
}

const lanes: Lane[] = [];
let started = false;
let allDead = false; // every lane failed — stay on the main thread
let nextJob = 1;
/** Jobs waiting for a free lane, oldest first. */
const queue: {
  file: ImportedFile;
  resolve: (v: DecodedImage) => void;
  reject: (e: Error) => void;
  onTiming?: (t: DecodeTiming) => void;
  queuedAt: number;
  depth: number; sky?: boolean }[] = [];

function laneCount(): number {
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  const cores = nav?.hardwareConcurrency || 2;
  const mem = (nav as (Navigator & { deviceMemory?: number }) | undefined)?.deviceMemory;
  const cap = typeof mem === "number" && mem >= 16 ? 4 : 3;
  return Math.max(1, Math.min(cap, cores - 1));
}

function spawn(): Lane | null {
  let worker: Worker;
  try {
    worker = new Worker(new URL("./decode.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
  const lane: Lane = { worker, pending: new Map() };
  worker.onmessage = (e: MessageEvent<{ id: number; ok?: boolean; img?: DecodedImage; message?: string; skySrc?: SkySource | null }>) => {
    const p = lane.pending.get(e.data.id);
    if (!p) return;
    lane.pending.delete(e.data.id);
    // Reported win or lose: a decode that failed still spent the time, and a
    // report that only covers the successful ones flatters the app.
    p.onTiming?.({ queued: p.startedAt - p.queuedAt, run: performance.now() - p.startedAt, depth: p.depth, offThread: true });
    if (e.data.ok && e.data.img) {
      const img = e.data.img;
      // The copy the selection is built from came back beside the picture;
      // the sky worker builds it while the picture is already on screen.
      if (e.data.skySrc) img.skySelReady = requestSkySelection(e.data.skySrc).then((sel) => { if (sel) img.skySel = sel; return sel; });
      p.resolve(img);
    } else p.reject(new Error(e.data.message ?? "decode failed"));
    pump();
  };
  // THIS LANE died (not a file that would not decode). Everything waiting on it
  // is lost, so fail those honestly and drop the lane — the others keep going,
  // and only when the last one is gone does the app fall back to the main
  // thread. The single-worker version failed every pending decode in the app
  // and moved everything to the main thread for the rest of the session.
  const kill = (message: string) => {
    const dead = [...lane.pending.values()];
    lane.pending.clear();
    const i = lanes.indexOf(lane);
    if (i >= 0) lanes.splice(i, 1);
    try { lane.worker.terminate(); } catch { /* already gone */ }
    if (!lanes.length) allDead = true;
    for (const p of dead) p.reject(new Error(message));
    pump();
  };
  worker.onerror = () => kill("The decoder stopped unexpectedly — trying again will use the slower path.");
  worker.onmessageerror = () => kill("A decoded photo could not be handed back from the decoder.");
  return lane;
}

function ensureLanes(): void {
  if (started || allDead) return;
  started = true;
  const want = laneCount();
  for (let i = 0; i < want; i++) {
    const lane = spawn();
    if (lane) lanes.push(lane);
  }
  if (!lanes.length) allDead = true;
}

/** The lane with the least in flight — with one job per lane at a time this is
 *  simply the first idle one, and the queue below holds the rest. */
function freeLane(): Lane | undefined {
  return lanes.find((l) => l.pending.size === 0);
}

function pump(): void {
  while (queue.length) {
    const lane = freeLane();
    if (!lane) return;
    const job = queue.shift()!;
    const id = nextJob++;
    lane.pending.set(id, {
      resolve: job.resolve, reject: job.reject, onTiming: job.onTiming, sky: job.sky,
      queuedAt: job.queuedAt, startedAt: performance.now(), depth: job.depth,
    });
    try {
      // Bytes are COPIED, not transferred: the caller still needs them to write
      // the photo into storage.
      lane.worker.postMessage({ id, file: job.file, sky: !!job.sky });
    } catch {
      lane.pending.delete(id);
      const i = lanes.indexOf(lane);
      if (i >= 0) lanes.splice(i, 1);
      if (!lanes.length) allDead = true;
      // Could not even post — this decode falls back, and the lane is gone.
      decodeOnThisThread(job.file, job.onTiming, job.queuedAt, job.depth, job.sky).then(job.resolve, job.reject);
    }
  }
}

/** Decode off the main thread where possible, on it where not. Same decoder
 *  either way (src/decode.ts) — see decode.worker.ts.
 *
 *  ONE JOB PER LANE AT A TIME, deliberately: a lane holds its file and its
 *  decode for the duration, so handing a lane three jobs at once would triple
 *  what it holds without decoding anything sooner. Extra work waits in the
 *  queue, which is also what keeps a forty-photo set from having forty files in
 *  memory at once. */
export function decodeOffThread(file: ImportedFile, opts?: DecodeOptions): Promise<DecodedImage> {
  ensureLanes();
  const queuedAt = performance.now();
  if (allDead || !lanes.length) return decodeOnThisThread(file, opts?.onTiming, queuedAt, 0, opts?.sky);
  return new Promise<DecodedImage>((resolve, reject) => {
    const job = { file, resolve, reject, onTiming: opts?.onTiming, queuedAt, depth: queue.length, sky: opts?.sky };
    if (opts?.front) queue.unshift(job);
    else queue.push(job);
    pump();
  });
}

/** The main-thread fallback, timed the same way a lane is so the report does not
 *  go quiet on the devices that need it most. Nothing waited for a lane here, so
 *  the queued half is zero by definition rather than by omission. */
function decodeOnThisThread(
  file: ImportedFile, onTiming: ((t: DecodeTiming) => void) | undefined, queuedAt: number, depth: number, sky?: boolean,
): Promise<DecodedImage> {
  const startedAt = performance.now();
  const p = decodeHere(file).then((img) => { if (sky) img.skySelReady = requestSkySelection(prepareSkySource(img)).then((sel) => { if (sel) img.skySel = sel; return sel; }); return img; });
  if (onTiming) {
    const done = () => onTiming({ queued: startedAt - queuedAt, run: performance.now() - startedAt, depth, offThread: false });
    p.then(done, done);
  }
  return p;
}

/** How many decodes can be in flight at once — for the test page and the
 *  diagnostic, so a reader's report says whether this device got any lanes at
 *  all rather than leaving it to be inferred.
 *
 *  IT DOES NOT START THEM. A report must never change the thing it reports on:
 *  asking the diagnostic for this number would otherwise spawn three workers on
 *  a device that had not decoded anything yet, and then truthfully report that
 *  it had three. Zero here means "none running", which on a fresh page is the
 *  honest answer. */
export function decodeLanes(): number {
  return lanes.length;
}

/** HOW MANY THIS DEVICE WILL RUN, without starting any.
 *
 *  `decodeLanes` reports how many are ALIVE, which is zero until something
 *  decodes — and a caller sizing its own concurrency before the first decode
 *  read that zero and ran one at a time, which is the queue this pool exists to
 *  remove. The diagnostic deliberately reports the live count (it must not
 *  spawn workers to describe the app); a caller about to spawn them wants the
 *  planned one. */
export function decodeLaneTarget(): number {
  return lanes.length || laneCount();
}
