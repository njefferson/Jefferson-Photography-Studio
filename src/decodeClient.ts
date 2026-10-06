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
import { skyTurn } from "./sky";
import { applyLensPlan, type LensPlan } from "./lensflat";
import { requestSkySelection } from "./skyClient";
import { decode as decodeHere, type DecodedImage, type SkySelection } from "./decode";
import type { TileInputs, TileTimings } from "./tile";
import type { ImportedFile } from "./import";

/** A strip tile a decode lane drew: its JPEG bytes and where its time went. */
export interface TileDrawn {
  /** The tile, encoded (`TILE_QUALITY`). */
  bytes: ArrayBuffer;
  /** The lane's own clock for this tile (tile.ts `TileTimings`), or null when
   *  the lane sent none. */
  ms: TileTimings | null;
}

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
  /** The lens flat to lay on the linear copy at decode, before the sky
   *  selection and every automatic are measured (decision 021). The worker
   *   applies it; the main-thread fallback applies the same. Absent = none. */
  lens?: LensPlan | null;
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
  /** Set on a strip-tile job: settle it with the JPEG bytes and their timings,
   *  or null when the tile must be drawn by the page instead (see
   *  `tileOffThread`). */
  tileDone?: (drawn: TileDrawn | null) => void;
};
interface Lane {
  worker: Worker;
  pending: Map<number, Pending>;
}

const lanes: Lane[] = [];
let started = false;
let allDead = false; // every lane failed — stay on the main thread
let nextJob = 1;
/** False once a lane has reported that this browser will not encode a JPEG in a
 *  worker, after which `tileOffThread` answers null at once and the page draws
 *  every tile (the path the app had before tiles moved). Safari 16.4 and later
 *  encode JPEG through OffscreenCanvas.convertToBlob in a worker (caniuse
 *  "mdn-api_offscreencanvas_converttoblob", read 2026-10-05); this is the
 *  answer for anything older or stricter. */
let workerEncodes = true;
/** Jobs waiting for a free lane, oldest first. */
const queue: {
  file: ImportedFile;
  resolve: (v: DecodedImage) => void;
  reject: (e: Error) => void;
  onTiming?: (t: DecodeTiming) => void;
  queuedAt: number;
  depth: number; sky?: boolean; lens?: LensPlan | null;
  /** A strip tile: the inputs, and how to settle it (see `Pending.tileDone`). */
  tile?: TileInputs; tileDone?: (drawn: TileDrawn | null) => void }[] = [];

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
  worker.onmessage = (e: MessageEvent<{ id: number; ok?: boolean; img?: DecodedImage; message?: string; skySrc?: SkySource | null; tile?: ArrayBuffer | null; ms?: TileTimings }>) => {
    const p = lane.pending.get(e.data.id);
    if (!p) return;
    lane.pending.delete(e.data.id);
    if (p.tileDone) {
      // A strip tile: bytes, or null for a tile the lane could not finish
      // (a damaged file, a browser that will not encode a JPEG off the page)
      // — the page then draws it itself and any damage reaches the reader
      // through the path that always reported it.
      // A lane that decoded fine but would not encode (`ok` with no bytes) will
      // not encode the next one either: remember it, so a set of ninety does not
      // decode every photograph twice, once here and once on the page.
      if (e.data.ok && !e.data.tile) workerEncodes = false;
      // The timings come with the bytes. A lane that sent bytes and no timings
      // would be a lane from another build; its tile is still a good tile, so it
      // is kept, with null where the numbers would be — never zeros, which would
      // be read as measurements.
      p.tileDone(e.data.ok && e.data.tile ? { bytes: e.data.tile, ms: e.data.ms ?? null } : null);
      pump();
      return;
    }
    // Reported win or lose: a decode that failed still spent the time, and a
    // report that only covers the successful ones flatters the app.
    p.onTiming?.({ queued: p.startedAt - p.queuedAt, run: performance.now() - p.startedAt, depth: p.depth, offThread: true });
    if (e.data.ok && e.data.img) {
      const img = e.data.img;
      // The copy the selection is built from came back beside the picture;
      // the sky worker builds it while the picture is already on screen.
      if (e.data.skySrc) img.skySelReady = askFirstSelection(img, e.data.skySrc);
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
      resolve: job.resolve, reject: job.reject, onTiming: job.onTiming, sky: job.sky, tileDone: job.tileDone,
      queuedAt: job.queuedAt, startedAt: performance.now(), depth: job.depth,
    });
    try {
      // Bytes are COPIED, not transferred: the caller still needs them to write
      // the photo into storage.
      lane.worker.postMessage({ id, file: job.file, sky: !!job.sky, lens: job.lens ?? null, tile: job.tile ?? null });
    } catch {
      lane.pending.delete(id);
      const i = lanes.indexOf(lane);
      if (i >= 0) lanes.splice(i, 1);
      if (!lanes.length) allDead = true;
      // Could not even post — this decode falls back, and the lane is gone. A
      // tile has no decode to fall back to here: it goes back to the page.
      if (job.tileDone) job.tileDone(null);
      else decodeOnThisThread(job.file, job.onTiming, job.queuedAt, job.depth, job.sky, job.lens).then(job.resolve, job.reject);
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
  if (allDead || !lanes.length) return decodeOnThisThread(file, opts?.onTiming, queuedAt, 0, opts?.sky, opts?.lens);
  return new Promise<DecodedImage>((resolve, reject) => {
    const job = { file, resolve, reject, onTiming: opts?.onTiming, queuedAt, depth: queue.length, sky: opts?.sky, lens: opts?.lens ?? null };
    if (opts?.front) queue.unshift(job);
    else queue.push(job);
    pump();
  });
}

/** DRAW A STRIP TILE IN A DECODE LANE, and get back only its JPEG bytes
 *  (tile.ts `renderTile`, decode.worker.ts). The picture never crosses to the
 *  page: the lane decodes, lays the lens flat, builds the sky selection from its
 *  own copy, solves the lift, draws and encodes.
 *  @param file  the photograph's bytes (copied, as a decode's are).
 *  @param tile  everything the tile reads from the editor (`tileInputsFor`).
 *  @param lens  the lens flat to lay on the linear copy first (`lensPlanFor`).
 *  @returns the JPEG bytes with the lane's own timings for them (`TileDrawn`),
 *  or null when the page must draw the tile itself:
 *  no lane could be started, the lane died, the file would not decode in it, or
 *  this browser will not encode a JPEG in a worker. Null is never an error —
 *  it is the path the app had before the tile moved, and it reports a damaged
 *  file the way it always did. What the result must satisfy: when non-null its
 *  bytes are the tile the page would have drawn from the same inputs, and its
 *  timings are the lane's own clock for them (the report's "Last strip tile").
 *  Shares the decode lanes and their one-job-per-lane rule, so a set of ninety
 *  never holds more than a lane's worth of frames in memory. */
export function tileOffThread(file: ImportedFile, tile: TileInputs, lens: LensPlan | null): Promise<TileDrawn | null> {
  ensureLanes();
  if (allDead || !lanes.length || !workerEncodes) return Promise.resolve(null);
  return new Promise<TileDrawn | null>((done) => {
    queue.push({
      file, resolve: () => {}, reject: () => done(null), queuedAt: performance.now(), depth: queue.length,
      lens, tile, tileDone: done,
    });
    pump();
  });
}

/** WHAT A DECODED PHOTOGRAPH KEEPS OF ITS SKY SELECTION, so the page never has
 *  to build one for it (the open-and-strip plan, step 3).
 *
 *  The 1024 px copy the decode took does not depend on which edge is up: every
 *  cell is the box mean of its source block, and `turn` is only the edge the
 *  selection is SEEDED from (skyfine.ts `prepareSkySource`). So a photograph
 *  shown at another turn than the file's — a Rotate, a mirror, a stored edit's
 *  turn, a gallery example's — needs the same copy and a different `turn`, and
 *  the sky worker can build it, where the page used to take the full-size
 *  buffer through `prepareSkySource` again and build it itself. */
interface SkyHold {
  /** The copy, whole, kept on this side: the sky worker is sent a duplicate of
   *  it each time, because a transferred buffer is gone from the sender. */
  src: SkySource;
  /** The selections that have landed, by turn (sky.ts `skyTurn`). */
  byTurn: Map<number, SkySelection>;
  /** The asks in flight or answered, by turn, so two asks for one turn are one
   *  build. An ask the worker could not answer is taken off again. */
  asked: Map<number, Promise<SkySelection | null>>;
}
const skyHeld = new WeakMap<DecodedImage, SkyHold>();

/** Ask the sky worker for a decode's first selection and keep what is needed to
 *  ask again at another turn.
 *  @param img  the decoded photograph; its `skySel` is set when the answer lands.
 *  @param src  the copy the decode took, at the file's own turn; its buffers go
 *    to the sky worker, so a duplicate is taken first and kept.
 *  @returns the selection, or null when the sky worker could not answer. What it
 *  must satisfy: the answer is `buildSkySelectionFrom(src)`, byte for byte, and
 *  it is also what `skySelectionAt(img, src.turn)` returns afterwards. */
function askFirstSelection(img: DecodedImage, src: SkySource): Promise<SkySelection | null> {
  const hold: SkyHold = { src: { ...src, rgb: src.rgb.slice(), clip: src.clip ? src.clip.slice() : undefined }, byTurn: new Map(), asked: new Map() };
  skyHeld.set(img, hold);
  const t = skyTurn(src.turn);
  const p = requestSkySelection(src).then((sel) => {
    if (sel) { img.skySel = sel; hold.byTurn.set(sel.turn, sel); } else hold.asked.delete(t);
    return sel;
  });
  hold.asked.set(t, p);
  return p;
}

/** The selection of a decoded photograph at a turn, when the sky worker has
 *  already answered for that turn.
 *  @param img  a photograph decoded with `sky: true`.
 *  @param turn  which edge is up, as sky.ts `skyTurn` gives it.
 *  @returns the selection built at that turn, or null when none has landed (or
 *  the decode was never asked for one). What it must satisfy: a non-null answer
 *  has `turn` equal to `skyTurn(turn)`, so the caller may show it as it is. */
export function skySelectionAt(img: DecodedImage, turn: number): SkySelection | null {
  return skyHeld.get(img)?.byTurn.get(skyTurn(turn)) ?? null;
}

/** Whether `requestSkySelectionAt` can answer for this photograph at all: it was
 *  decoded with `sky: true` and its copy is still held.
 *  @param img  a decoded photograph.
 *  @returns true when an ask can be made; false when the page has to build the
 *  selection itself, which is the only case it should. */
export function canAskSkyAt(img: DecodedImage): boolean {
  return skyHeld.has(img);
}

/** Ask the sky worker for a photograph's selection at a turn, building nothing
 *  on this thread: the held copy is duplicated, given the turn, and sent.
 *  @param img  a photograph decoded with `sky: true`.
 *  @param turn  which edge is up, as sky.ts `skyTurn` gives it.
 *  @returns the selection at that turn (the mask and its refinement), or null
 *  when the photograph has no held copy or the sky worker could not answer —
 *  the caller then builds the coarse bitmap itself, as it did before the sky
 *  worker took the other turns. What it must satisfy: a non-null answer has
 *  `turn` equal to `skyTurn(turn)`; the same turn asked twice is one build; and
 *  on a device with no sky worker `requestSkySelection` builds it here, which
 *  is the one place this thread still does. */
export function requestSkySelectionAt(img: DecodedImage, turn: number): Promise<SkySelection | null> {
  const hold = skyHeld.get(img);
  if (!hold) return Promise.resolve(null);
  const t = skyTurn(turn);
  const have = hold.byTurn.get(t);
  if (have) return Promise.resolve(have);
  const pending = hold.asked.get(t);
  if (pending) return pending;
  const src: SkySource = { ...hold.src, rgb: hold.src.rgb.slice(), clip: hold.src.clip ? hold.src.clip.slice() : undefined, turn: t };
  const p = requestSkySelection(src).then((sel) => {
    if (sel) hold.byTurn.set(sel.turn, sel); else hold.asked.delete(t);
    return sel;
  });
  hold.asked.set(t, p);
  return p;
}

/** The main-thread fallback, timed the same way a lane is so the report does not
 *  go quiet on the devices that need it most. Nothing waited for a lane here, so
 *  the queued half is zero by definition rather than by omission. */
function decodeOnThisThread(
  file: ImportedFile, onTiming: ((t: DecodeTiming) => void) | undefined, queuedAt: number, depth: number, sky?: boolean, lens?: LensPlan | null,
): Promise<DecodedImage> {
  const startedAt = performance.now();
  const p = decodeHere(file).then((img) => { applyLensPlan(img, lens ?? null); return img; }).then((img) => { if (sky) img.skySelReady = askFirstSelection(img, prepareSkySource(img, img.rotate ?? 0)); return img; });
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
