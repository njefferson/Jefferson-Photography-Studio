// CAN A WORKER DRAW? Asked from inside one, because that is the only place the
// answer is true or false rather than a specification.
//
// The export runs the edit on the CPU today, duplicating shaders the preview
// already has. Moving it to the graphics chip is only worth scoping if the
// drawing can happen OFF the main thread — a full-resolution render on the main
// thread would freeze the editor for its duration, which is the thing the
// worker export was built to stop doing. Safari has had WebGL2 inside a worker
// since 17 on iPad; this reports what the reader's own device does.
interface WorkerScope {
  addEventListener(t: "message", fn: (e: MessageEvent) => void): void;
  postMessage(m: unknown): void;
}
const ctx = self as unknown as WorkerScope;

ctx.addEventListener("message", () => {
  const out: { ok: boolean; maxTexture: number; float: boolean; note: string } = {
    ok: false, maxTexture: 0, float: false, note: "",
  };
  try {
    if (typeof OffscreenCanvas === "undefined") {
      out.note = "this browser has no OffscreenCanvas in a worker";
    } else {
      const gl = new OffscreenCanvas(64, 64).getContext("webgl2") as WebGL2RenderingContext | null;
      if (!gl) {
        out.note = "OffscreenCanvas exists but would not give a WebGL2 context in a worker";
      } else {
        out.ok = true;
        out.maxTexture = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
        out.float = !!gl.getExtension("EXT_color_buffer_float");
        out.note = "drawing off the main thread is available";
      }
    }
  } catch (e) {
    out.note = `refused: ${String((e as Error)?.message ?? e)}`;
  }
  ctx.postMessage(out);
});
