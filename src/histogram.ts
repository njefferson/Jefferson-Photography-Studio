// Lightroom-style floating histogram. The GPU hands us four 256-bin tallies
// (red, green, blue, luminance); we paint them as overlapping mountains so the
// channels read individually and their overlap glows toward white — the same
// visual language Lightroom uses (R/G/B curves, white where all three stack).

export interface Histogram {
  r: Uint32Array;
  g: Uint32Array;
  b: Uint32Array;
  l: Uint32Array;
}

// One filled area per channel, drawn with additive ("lighter") compositing so
// R+G reads yellow, G+B cyan, R+B magenta and R+G+B white — no extra passes.
const CHANNEL_FILL = {
  r: "rgba(255, 60, 60, 0.75)",
  g: "rgba(60, 235, 90, 0.7)",
  b: "rgba(80, 120, 255, 0.8)",
} as const;

/** Repaint the overlay canvas from a fresh set of bins. Cheap: ~256 line ops. */
export function drawHistogram(canvas: HTMLCanvasElement, h: Histogram) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // Normalize against the tallest bin, but ignore the pure-black/white spikes at
  // the very ends: IR frames pin huge counts at 0 (dark sky) which would flatten
  // everything else. sqrt scaling lifts the low tails so faint detail is visible.
  let max = 1;
  for (let i = 3; i < 253; i++) {
    if (h.r[i] > max) max = h.r[i];
    if (h.g[i] > max) max = h.g[i];
    if (h.b[i] > max) max = h.b[i];
    if (h.l[i] > max) max = h.l[i];
  }
  const y = (v: number) => H - Math.min(1, Math.sqrt(v / max)) * (H - 1);
  const x = (i: number) => (i / 255) * W;

  // Luminance first, as a soft grey bed behind the colour channels ("white").
  fill(ctx, h.l, x, y, H, "rgba(210, 212, 222, 0.32)", "source-over");
  // Colour channels additively on top.
  fill(ctx, h.r, x, y, H, CHANNEL_FILL.r, "lighter");
  fill(ctx, h.g, x, y, H, CHANNEL_FILL.g, "lighter");
  fill(ctx, h.b, x, y, H, CHANNEL_FILL.b, "lighter");
  // A crisp luminance outline on top ties the shape together.
  stroke(ctx, h.l, x, y, "rgba(236, 238, 246, 0.55)");
}

function fill(
  ctx: CanvasRenderingContext2D,
  bins: Uint32Array,
  x: (i: number) => number,
  y: (v: number) => number,
  H: number,
  style: string,
  op: GlobalCompositeOperation,
) {
  ctx.globalCompositeOperation = op;
  ctx.fillStyle = style;
  ctx.beginPath();
  ctx.moveTo(0, H);
  for (let i = 0; i < 256; i++) ctx.lineTo(x(i), y(bins[i]));
  ctx.lineTo(x(255), H);
  ctx.closePath();
  ctx.fill();
  ctx.globalCompositeOperation = "source-over";
}

function stroke(
  ctx: CanvasRenderingContext2D,
  bins: Uint32Array,
  x: (i: number) => number,
  y: (v: number) => number,
  style: string,
) {
  ctx.strokeStyle = style;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < 256; i++) {
    const px = x(i);
    const py = y(bins[i]);
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.stroke();
}
