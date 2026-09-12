// ONE BAND OF AN EXPORT, ON ANOTHER CORE.
//
// An export is 96% a single pass over the pixels — measured at 45.2 seconds of
// 47.0 on a 20.9-megapixel raw — and that pass is embarrassingly parallel over
// the output. This worker is handed the same file, the same edit and a slice of
// the picture, and calls THE SAME `exportImage` the main thread would: there is
// no second implementation of the pipeline here to drift from the first one.
//
// WHY THE WHOLE FILE RATHER THAN A SLICE OF THE SOURCE. Slicing would save
// memory, and it would also mean every neighbourhood tap near a band's edge
// needed a halo of source rows, computed through crop, straighten, rotation and
// flip — four chances to be subtly wrong in a way that shows up as a seam. The
// file is copied instead and each worker decodes its own: about a second, in
// parallel with the others, against the seconds the band itself takes.
import { exportImage, type ExportOptions, type BandResult } from "./export";
import type { ImportedFile } from "./import";
import type { DecodedImage } from "./decode";
import type { EditParams, LensCurve } from "./pipeline";

export interface BandRequest {
  id: number;
  file: ImportedFile;
  /** Only the fields `getSource` needs for a non-raw source; a raw file is
   *  re-read from `file.bytes`. */
  current: DecodedImage;
  params: EditParams;
  opts: ExportOptions;
  lens: LensCurve | null;
}

interface WorkerScope {
  addEventListener(t: "message", fn: (e: MessageEvent) => void): void;
  postMessage(m: unknown, transfer?: Transferable[]): void;
}
// The project compiles against the DOM lib, which does not declare a worker's
// own global scope — so the two calls this file makes are declared here rather
// than pulling a second lib into the whole build for one file.
const ctx = self as unknown as WorkerScope;
ctx.addEventListener("message", (e: MessageEvent) => {
  const req = e.data as BandRequest;
  void (async () => {
    try {
      const res: BandResult = await exportImage(
        req.file,
        req.current,
        req.params,
        { ...req.opts, raw: true },
        // Progress is per band; the main thread adds them up. Reported sparsely
        // — a message per row would cost more than it tells anybody.
        (f) => { if (f === 1 || Math.round(f * 20) !== Math.round((f - 0.05) * 20)) ctx.postMessage({ id: req.id, progress: f }); },
        req.lens,
      );
      const buf = res.data?.buffer;
      ctx.postMessage({ id: req.id, done: res }, buf ? [buf as ArrayBuffer] : []);
    } catch (err) {
      ctx.postMessage({ id: req.id, error: String((err as Error)?.message ?? err) });
    }
  })();
});
