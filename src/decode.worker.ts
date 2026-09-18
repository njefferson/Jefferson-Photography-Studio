// Decoding, off the main thread. A 20-megapixel NEF is tens of millions of
// pure-JS operations (Huffman, linearization curve, predictor, demosaic); on
// the main thread that freezes the editor, which is exactly what made a set of
// forty unusable while it loaded — the first photo was open and editable in
// name only.
//
// It runs the SAME src/decode.ts the main thread does, not a copy. The single
// thing that stood in the way was one `document.createElement("canvas")`, now
// environment-sniffed to OffscreenCanvas (see make2d), so there is no second
// decoder to keep in step and no way for the two paths to drift. Equivalence is
// asserted rather than assumed: tools-side, every practice DNG is decoded both
// ways and the buffers compared byte for byte.
//
// Bytes come in COPIED, not transferred — the caller still needs the source
// bytes to write into storage — and the decoded buffers go back transferred,
// which is the big one (a 20MP frame is ~250 MB of Float32 and must not be
// cloned).
//
// AND THE SKY SELECTION, when the decode was asked for one: a 1024 px copy is
// taken BEFORE the buffer is transferred, the picture is posted, and the
// selection (the bitmap and its refinement to the picture's edges,
// skyfine.ts) follows in a second message — so the photograph is on the
// screen as soon as it is decoded and its selection is ready a moment later,
// off the main thread, before the reader touches anything.

import { decode } from "./decode";
import { prepareSkySource, buildSkySelectionFrom } from "./skyfine";
import type { ImportedFile } from "./import";

interface Job {
  id: number;
  file: ImportedFile;
  /** Build the sky selection after the picture (DecodeOptions.sky). */
  sky?: boolean;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, file, sky } = e.data;
  try {
    const img = await decode(file);
    const src = sky ? prepareSkySource(img) : null;
    const transfer: Transferable[] = [];
    if (img.pixels) transfer.push(img.pixels.buffer);
    if (img.linear) transfer.push(img.linear.buffer);
    (self as unknown as Worker).postMessage({ id, ok: true, img }, transfer);
    if (src) {
      const sel = buildSkySelectionFrom(src);
      const t: Transferable[] = [];
      if (sel.mask) t.push(sel.mask.data.buffer);
      if (sel.fine) t.push(sel.fine.data.buffer);
      (self as unknown as Worker).postMessage({ id, sky: sel }, t);
    }
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, message: (err as Error).message });
  }
};
