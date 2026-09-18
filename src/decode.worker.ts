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
// AND THE COPY THE SKY SELECTION IS BUILT FROM, when the decode was asked for
// one: a 1024 px copy taken BEFORE the buffer is transferred, handed back
// beside the picture for the sky worker (sky.worker.ts) to turn into the
// selection. Not built here: a decode lane that spent half a second on a
// selection after every opened photograph held up the decode a verdict
// pressed as the page went away was waiting on. Decode lanes decode.

import { decode } from "./decode";
import { prepareSkySource } from "./skyfine";
import type { ImportedFile } from "./import";

interface Job {
  id: number;
  file: ImportedFile;
  /** Hand back the copy the sky selection is built from (DecodeOptions.sky). */
  sky?: boolean;
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, file, sky } = e.data;
  try {
    const img = await decode(file);
    const skySrc = sky ? prepareSkySource(img) : null;
    const transfer: Transferable[] = [];
    if (img.pixels) transfer.push(img.pixels.buffer);
    if (img.linear) transfer.push(img.linear.buffer);
    if (skySrc) transfer.push(skySrc.rgb.buffer);
    (self as unknown as Worker).postMessage({ id, ok: true, img, skySrc }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, message: (err as Error).message });
  }
};
