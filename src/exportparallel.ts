// AN EXPORT, SPLIT ACROSS CORES.
//
// Measured before any of this existed, on a 20.9-megapixel raw at full size and
// quality 92 with the app's own default edit: 47.0 seconds, of which 45.2 is
// the single pass over the pixels. The JPEG encoder is half a second, reading
// the file is one, the metadata is nothing. There is no win anywhere but that
// pass — and two attempts at making it leaner (removing sixty million per-pixel
// allocations; caching a value the denoiser recomputes twenty-five times per
// pixel) bought 0% and 2%. The pass is 25 bilateral taps per pixel with an
// exp() in each, and 522 million exp() calls is 15 seconds all by itself.
//
// So: run it on several cores. Each worker takes a slice of the output — rows,
// or columns when the photograph is turned a quarter-turn and the loop follows
// columns to keep the denoiser's row cache warm — runs the same `exportImage`,
// and hands back its own pixels; this file stitches them and the main thread
// encodes once.
//
// COLUMNS ARE NOT AN AFTERTHOUGHT HERE. The first version of this took rows
// only and let quarter-turned exports stay single-threaded, which sounded like
// a corner until the first measurement: the test frame is a portrait one, the
// split never engaged, and the export came in at the same 46.8 seconds with the
// diagnostic reporting one thread. Half of all photographs are portrait.
//
// WHAT FALLS BACK, and why each one:
//   - TIFF, which is the print-master path and enormous either way;
//   - stickers, heal spots and warp, whose assets are bitmaps the worker cannot
//     be handed cheaply;
//   - a small export, where starting four workers costs more than it saves;
//   - and any browser without module workers.
// In every one of those the caller runs the export exactly as it always did.
import type { ImportedFile } from "./import";
import type { DecodedImage } from "./decode";
import type { EditParams, LensCurve } from "./pipeline";
import type { ExportOptions, BandResult } from "./export";

/** Enough pixels that starting workers is worth it. Below this the whole export
 *  is a second or two and the startup would show. */
const MIN_PIXELS = 2e6;

/** WHAT ONE MORE THREAD COSTS IN MEMORY, in megabytes, and it is not small: a
 *  worker holds its own copy of the file, its own decode of the sensor data,
 *  and its own band of the output.
 *
 *  Measured rather than guessed — peak browser memory across every process,
 *  sampled once a second through a real export of a 26 MB, 20.9-megapixel raw:
 *  1.88 GB on one thread, 2.19 GB on three. That is 104 MB per extra thread,
 *  against the 96 MB this predicts for the same export. The model is the only
 *  part that travels: the same file at 45 megapixels would cost 220 MB a
 *  thread, and three of those is a killed tab on a tablet rather than a slow
 *  export. */
function perWorkerMb(fileBytes: number, srcPixels: number, outPixels: number, n: number): number {
  return (fileBytes + srcPixels * 2 + (outPixels * 4) / n) / 1e6 + 10;
}

/** The memory an export may spend on threads that are not the main one. A
 *  tablet browser kills the tab rather than swapping, and a killed tab loses
 *  the whole session — so when the budget cannot buy a second thread, the
 *  export runs on one and takes its time. */
const BUDGET_MB = 600;

export interface ParallelJob {
  fileBytes: number;
  srcPixels: number;
  outPixels: number;
}

export function canRunParallel(params: EditParams, opts: ExportOptions, job: ParallelJob): boolean {
  if (typeof Worker === "undefined") return false;
  if (opts.format !== "jpeg") return false;
  if (opts.band || opts.raw) return false; // already a band
  if (job.outPixels < MIN_PIXELS) return false;
  if ((params.spots?.length ?? 0) > 0) return false;
  if ((params.stickers?.length ?? 0) > 0) return false;
  if (params.warp) return false;
  return workerCount(job) >= 2;
}

/** How many to start: two fewer than the machine claims, cap 4 — the main
 *  thread still has to stay answerable, and past four the memory costs more
 *  than the arithmetic saves on a tablet — then as many of those as the memory
 *  budget above will actually pay for. Returns 1 when it will not pay for two,
 *  which is `canRunParallel` saying no. */
export function workerCount(job: ParallelJob): number {
  const cores = typeof navigator !== "undefined" ? (navigator.hardwareConcurrency || 2) : 2;
  const byCores = Math.max(2, Math.min(4, cores - 1));
  for (let n = byCores; n >= 2; n--) {
    if (n * perWorkerMb(job.fileBytes, job.srcPixels, job.outPixels, n) <= BUDGET_MB) return n;
  }
  return 1;
}

interface Pending {
  resolve: (r: BandResult) => void;
  reject: (e: Error) => void;
  progress: (f: number) => void;
}

/** PUT THE BANDS BACK TOGETHER — and refuse anything that does not add up.
 *
 *  Separate from the worker plumbing on purpose: this is the half that can be
 *  wrong in a way nobody sees (a seam, a strip of black, a band written at the
 *  wrong offset), and a browser is a poor place to prove arithmetic. It is
 *  driven directly, against a whole-frame export of the same photograph at
 *  every rotation, by the band harness.
 *
 *  Every check here throws rather than patching over the problem: the caller
 *  falls back to the single-threaded loop, which is slower and right. Black
 *  fills an untouched band and black is a plausible-looking photograph. */
export function stitchBands(
  results: BandResult[],
  outW: number,
  outH: number,
  axis: "rows" | "columns",
): Uint8ClampedArray<ArrayBuffer> {
  const data = new Uint8ClampedArray(new ArrayBuffer(outW * outH * 4));
  let covered = 0;
  for (const r of results) {
    if (!r.data) throw new Error("an export worker returned no pixels");
    if (r.axis !== axis) throw new Error("an export worker cut its band the other way");
    if (r.data.length !== r.width * r.height * 4) throw new Error("an export worker returned the wrong number of pixels");
    if (axis === "rows") {
      if (r.width !== outW || r.height !== r.band.to - r.band.from) throw new Error("an export worker returned a band of the wrong shape");
      data.set(r.data, r.band.from * outW * 4);
    } else {
      // A COLUMN BAND IS NOT ONE SLICE OF THE PICTURE — it is a narrow strip
      // down every row of it, so it goes back a row at a time.
      if (r.height !== outH || r.width !== r.band.to - r.band.from) throw new Error("an export worker returned a band of the wrong shape");
      const bw4 = r.width * 4;
      for (let y = 0; y < outH; y++) data.set(r.data.subarray(y * bw4, y * bw4 + bw4), (y * outW + r.band.from) * 4);
    }
    covered += r.band.to - r.band.from;
  }
  const outerN = axis === "columns" ? outW : outH;
  if (covered !== outerN) throw new Error(`the bands covered ${covered} of ${outerN} ${axis}`);
  return data;
}

/** Run one export across N workers and return the stitched RGBA bytes.
 *
 *  Rejects rather than falling back on its own: the caller owns the decision to
 *  run the single-threaded path, and a silent fallback would hide a worker that
 *  had started failing on every export. */
export async function exportBands(
  file: ImportedFile,
  current: DecodedImage,
  params: EditParams,
  opts: ExportOptions,
  lens: LensCurve | null,
  outW: number,
  outH: number,
  job: ParallelJob,
  onProgress?: (fraction: number) => void,
): Promise<{ data: Uint8ClampedArray<ArrayBuffer>; threads: number }> {
  // THE SAME AXIS THE EXPORT'S OWN LOOP RUNS ALONG — rows, or columns under a
  // quarter-turn. Derived from the same `rotate` the workers are handed, so the
  // two cannot disagree about what a band is.
  const axis: "rows" | "columns" = ((opts.rotate ?? 0) % 4 + 4) % 4 & 1 ? "columns" : "rows";
  const outerN = axis === "columns" ? outW : outH;
  const n = Math.max(1, Math.min(workerCount(job), outerN));
  const workers: Worker[] = [];
  const pending = new Map<number, Pending>();
  const shares = new Float64Array(n);
  const report = () => {
    if (!onProgress) return;
    let s = 0;
    for (let i = 0; i < n; i++) s += shares[i];
    onProgress(s / n);
  };
  try {
    const jobs: Promise<BandResult>[] = [];
    // Even bands. The last one takes the remainder, which is at most n-1 rows
    // more than the others — not worth balancing for.
    const per = Math.ceil(outerN / n);
    for (let i = 0; i < n; i++) {
      const from = i * per;
      const to = Math.min(outerN, from + per);
      if (from >= to) break;
      const w = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
      workers.push(w);
      jobs.push(new Promise<BandResult>((resolve, reject) => {
        pending.set(i, {
          resolve,
          reject,
          progress: (f) => { shares[i] = f; report(); },
        });
        w.addEventListener("message", (e: MessageEvent) => {
          const m = e.data as { id: number; progress?: number; done?: BandResult; error?: string };
          const p = pending.get(m.id);
          if (!p) return;
          if (m.error) { pending.delete(m.id); p.reject(new Error(m.error)); return; }
          if (typeof m.progress === "number") { p.progress(m.progress); return; }
          if (m.done) { pending.delete(m.id); p.progress(1); p.resolve(m.done); }
        });
        w.addEventListener("error", (ev) => {
          const p = pending.get(i);
          if (p) { pending.delete(i); p.reject(new Error(ev.message || "export worker failed")); }
        });
        // A COPY OF THE FILE PER WORKER, deliberately not transferred: the
        // structured clone this makes leaves the main thread's own bytes
        // intact, and it still needs them for the metadata it writes at the
        // end. (Nothing is sliced first — posting already copies, and slicing
        // would make a second copy on the main thread to hand to the first.)
        w.postMessage({
          id: i,
          file,
          current,
          params,
          opts: { ...opts, band: { from, to }, stickerAssets: undefined },
          lens,
        });
      }));
    }
    const results = await Promise.all(jobs);
    return { data: stitchBands(results, outW, outH, axis), threads: jobs.length };
  } finally {
    for (const w of workers) w.terminate();
  }
}
