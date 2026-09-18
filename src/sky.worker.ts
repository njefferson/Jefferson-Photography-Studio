// The sky selection, built off the main thread on a lane of its own. The
// decode worker takes the 1024 px copy (skyfine.ts prepareSkySource) before
// it hands the picture back; this worker turns that copy into the selection —
// the bitmap and its refinement to the picture's edges — and hands it to the
// holder of the picture. It is NOT the decode lane on purpose: built there,
// the selection held the lane for half a second after every opened
// photograph, and a verdict pressed as the page went away lost the decode it
// was waiting on behind it (verdict-durability-walk check 4, red on the branch
// and green on production, 2026-09-18). Decode lanes decode; this one selects.

import { buildSkySelectionFrom, type SkySource } from "./skyfine";

interface Job {
  id: number;
  src: SkySource;
}

self.onmessage = (e: MessageEvent<Job>) => {
  const { id, src } = e.data;
  try {
    const sel = buildSkySelectionFrom(src);
    const transfer: Transferable[] = [];
    if (sel.mask) transfer.push(sel.mask.data.buffer);
    if (sel.fine) transfer.push(sel.fine.data.buffer);
    (self as unknown as Worker).postMessage({ id, sel }, transfer);
  } catch {
    // Answer anyway: a holder waiting on this builds the selection itself.
    (self as unknown as Worker).postMessage({ id, sel: null });
  }
};
