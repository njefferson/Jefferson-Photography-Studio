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
//
// AND A STRIP TILE, WHOLE (tile.ts). A `tile` job decodes the file, lays the
// lens flat, builds the sky selection from THIS copy when the look carries a
// sky stage, solves the lift, draws the tile through compileEdit and encodes it
// as a JPEG — and posts back only the bytes and the milliseconds each part took
// (tile.ts `TileTimings`, which the report prints). The decoded picture never
// leaves the lane, so a tile costs the page nothing but the message: it used to cross
// the thread boundary as ~84 MB of float and be drawn there, two at a time,
// while no control could answer. Memory: the lane holds what a decode job
// already held (the file and its decode) and a 1024 px selection copy, never a
// second full frame.

import { decode } from "./decode";
import { prepareSkySource, buildSkySelectionFrom } from "./skyfine";
import { skyTurn } from "./sky";
import { applyLensPlan, type LensPlan } from "./lensflat";
import { renderTile, TILE_QUALITY, type TileInputs, type TilePixels, type TileTimings, type SkyFor } from "./tile";
import type { BrushMask } from "./pipeline";
import type { ImportedFile } from "./import";

interface Job {
  id: number;
  file: ImportedFile;
  /** Hand back the copy the sky selection is built from (DecodeOptions.sky). */
  sky?: boolean;
  /** The lens flat to lay on the linear copy first (decision 021). */
  lens?: LensPlan | null;
  /** Draw a strip tile instead of handing the decode back: the inputs
   *  `tileInputsFor` took on the page. Absent for an ordinary decode. */
  tile?: TileInputs | null;
}

/** Encode a drawn tile as a JPEG without the page.
 *  @param px  the tile's pixels (`renderTile`).
 *  @returns the JPEG bytes at `TILE_QUALITY`, or null when this browser cannot
 *  encode one in a worker — no OffscreenCanvas, no 2D context, or an encoder
 *  that hands back another type (the spec requires only PNG) — in which case
 *  the page draws the tile itself (Safari 16.4 and later encode JPEG here;
 *  caniuse "mdn-api_offscreencanvas_converttoblob", read 2026-10-05). What the
 *  result must satisfy: it is what the page's `canvas.toBlob` would give for the
 *  same pixels, which the scratch comparison holds on the practice set. */
async function encodeTile(px: TilePixels): Promise<ArrayBuffer | null> {
  if (typeof OffscreenCanvas === "undefined") return null;
  const cv = new OffscreenCanvas(px.width, px.height);
  const g = cv.getContext("2d");
  if (!g) return null;
  g.putImageData(new ImageData(px.rgba, px.width, px.height), 0, 0);
  const blob = await cv.convertToBlob({ type: "image/jpeg", quality: TILE_QUALITY });
  if (blob.type !== "image/jpeg") return null;
  return blob.arrayBuffer();
}

self.onmessage = async (e: MessageEvent<Job>) => {
  const { id, file, sky, lens, tile } = e.data;
  // THE JOB'S OWN CLOCK, for a tile's timings: from the message being taken up to
  // the bytes being ready. It does not include the time the job waited for this
  // lane, which the page's side of the queue holds.
  const jobStart = performance.now();
  try {
    const img = await decode(file);
    // THE FLAT FIRST, THEN THE SELECTION'S COPY: the selection and every
    // automatic the main thread measures read corrected pixels (decision 021).
    applyLensPlan(img, lens ?? null);
    const decodeMs = performance.now() - jobStart;
    if (tile) {
      // The coarse bitmap at a turn, built the way the page's `skyMaskFor`
      // builds it (same copy, same code, so the same bytes) and kept for the
      // job: the lift and the tile's own sky ask for the same turn.
      const held = new Map<number, BrushMask | null>();
      const skyFor: SkyFor = (im, turn) => {
        const t = skyTurn(turn);
        if (!held.has(t)) held.set(t, buildSkySelectionFrom(prepareSkySource(im, t), false).mask);
        return held.get(t) ?? null;
      };
      const px = renderTile(img, tile, skyFor);
      const encodeFrom = performance.now();
      const bytes = await encodeTile(px);
      const done = performance.now();
      // The timings go back WITH the bytes, so the page's report says where this
      // tile's seconds went on the device that drew it; a tile the lane could not
      // encode carries them too, for the same reason the null does.
      const ms: TileTimings = { decode: decodeMs, selection: px.ms.selection, lift: px.ms.lift, pixels: px.ms.pixels, encode: done - encodeFrom, total: done - jobStart };
      (self as unknown as Worker).postMessage({ id, ok: true, tile: bytes, ms }, bytes ? [bytes] : []);
      return;
    }
    // AT THE FILE'S OWN TURN (decision 070): the turn a photograph opens at. A
    // picture then shown at another one rebuilds its sky on the main thread.
    const skySrc = sky ? prepareSkySource(img, img.rotate ?? 0) : null;
    const transfer: Transferable[] = [];
    if (img.pixels) transfer.push(img.pixels.buffer);
    if (img.linear) transfer.push(img.linear.buffer);
    if (img.lossyCodes) transfer.push(img.lossyCodes.buffer);
    if (skySrc) transfer.push(skySrc.rgb.buffer);
    if (skySrc?.clip) transfer.push(skySrc.clip.buffer);
    (self as unknown as Worker).postMessage({ id, ok: true, img, skySrc }, transfer);
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, ok: false, message: (err as Error).message });
  }
};
