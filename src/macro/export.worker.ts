// Full-resolution stacking runs here, OFF the main thread, so the long tiled
// render never janks the UI (the preview stack stays on the main thread — it's
// quick). createImageBitmap + OffscreenCanvas both exist in workers, so the
// engine (stack.ts) runs unchanged. Progress is streamed back; the finished
// pixel buffer is TRANSFERRED (zero-copy) to the main thread.
import { stackFocusFullRes, type StackFrame, type FullResOptions } from "./stack";

type Req = { frames: StackFrame[]; opts: Omit<FullResOptions, "onProgress"> };

self.onmessage = async (e: MessageEvent<Req>) => {
  const { frames, opts } = e.data;
  try {
    const res = await stackFocusFullRes(frames, {
      ...opts,
      onProgress: (done, total, phase) => (self as unknown as Worker).postMessage({ type: "progress", done, total, phase }),
    });
    const buf = res.image.data.buffer;
    (self as unknown as Worker).postMessage({ type: "done", buffer: buf, width: res.width, height: res.height }, [buf]);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: "error", message: (err as Error).message });
  }
};
