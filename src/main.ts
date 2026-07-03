import "./style.css";
import { importFile, type ImportedFile } from "./import";
import { decode, type DecodedImage } from "./decode";
import { Renderer, type EditParams } from "./gl";
import { exportImage, download, type ExportFormat } from "./export";
import { generateCube } from "./lut";
import { generateDcp } from "./dcp";

// Injected at build time from git history (see vite.config.ts).
declare const __CHANGELOG__: { hash: string; date: string; subject: string }[];

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $("view") as HTMLCanvasElement;
const hint = $("hint") as HTMLParagraphElement;
const panel = $("panel") as HTMLElement;
const fileInput = $("file") as HTMLInputElement;

const renderer = new Renderer(canvas);
let current: DecodedImage | null = null;
let currentFile: ImportedFile | null = null;

const params: EditParams = {
  wb: [1, 1, 1],
  exposure: 1,
  swapRB: true,
  hue: 0,
  sat: 1,
  contrast: 1,
  denoise: 0,
  tint: [1, 1, 1],
};

const ui = {
  wbR: $("wbR") as HTMLInputElement,
  wbG: $("wbG") as HTMLInputElement,
  wbB: $("wbB") as HTMLInputElement,
  expo: $("expo") as HTMLInputElement,
  dn: $("dn") as HTMLInputElement,
  autoBtn: $("autoBtn") as HTMLButtonElement,
  swapBtn: $("swapBtn") as HTMLButtonElement,
  hue: $("hue") as HTMLInputElement,
  sat: $("sat") as HTMLInputElement,
  con: $("con") as HTMLInputElement,
  exFormat: $("exFormat") as HTMLSelectElement,
  exScale: $("exScale") as HTMLSelectElement,
  exQuality: $("exQuality") as HTMLInputElement,
  exBtn: $("exBtn") as HTMLButtonElement,
  profWB: $("profWB") as HTMLInputElement,
  cubeBtn: $("cubeBtn") as HTMLButtonElement,
  dcpBtn: $("dcpBtn") as HTMLButtonElement,
  lookAero: $("lookAero") as HTMLButtonElement,
  lookRed: $("lookRed") as HTMLButtonElement,
  lookGoldie: $("lookGoldie") as HTMLButtonElement,
  lookNatural: $("lookNatural") as HTMLButtonElement,
  lookMono: $("lookMono") as HTMLButtonElement,
  lookSepia: $("lookSepia") as HTMLButtonElement,
};

function baseName(): string {
  return (currentFile?.name ?? "IPS-look").replace(/\.[^.]+$/, "");
}

function syncFromUI() {
  params.wb = [Number(ui.wbR.value), Number(ui.wbG.value), Number(ui.wbB.value)];
  params.exposure = Number(ui.expo.value);
  params.hue = Number(ui.hue.value);
  params.sat = Number(ui.sat.value);
  params.contrast = Number(ui.con.value);
  params.denoise = Number(ui.dn.value);
  updateSplitHandle();
  draw();
}

function syncToUI() {
  ui.wbR.value = String(params.wb[0]);
  ui.wbG.value = String(params.wb[1]);
  ui.wbB.value = String(params.wb[2]);
  ui.expo.value = String(params.exposure);
  ui.dn.value = String(params.denoise);
  ui.swapBtn.setAttribute("aria-pressed", String(params.swapRB));
  ui.hue.value = String(params.hue);
  ui.sat.value = String(params.sat);
  ui.con.value = String(params.contrast);
}

// Auto: brightness-preserving white balance + auto-exposure.
ui.autoBtn.addEventListener("click", () => {
  if (!current) return;
  autoAdjust(current);
  syncToUI();
  draw();
});

// One-tap looks. Tuned on real Z50-IR files; raw (camera-native) sources take
// the full-strength recipe, JPEGs a gentler one — camera JPEGs already carry
// colour rendering, so the raw-strength saturation goes garish on them.
// Looks never touch WB/exposure (those are per-shot; use Auto / tap foliage).
interface Look {
  swapRB: boolean;
  hue: number;
  /** Multiplies the current white balance — Aero Red over-cools so post-swap
   *  foliage lands crimson; Goldie also lifts green so it lands gold. */
  wbBias?: [number, number, number];
  tint?: [number, number, number];
  raw: { sat: number; contrast: number };
  jpeg: { sat: number; contrast: number };
}
const LOOKS: Record<string, Look> = {
  aero: { swapRB: true, hue: 0, raw: { sat: 2.5, contrast: 1.6 }, jpeg: { sat: 1.3, contrast: 1.2 } },
  red: { swapRB: true, hue: 0, wbBias: [0.78, 1.02, 1.35], raw: { sat: 1.8, contrast: 1.4 }, jpeg: { sat: 1.3, contrast: 1.2 } },
  goldie: { swapRB: true, hue: 0, wbBias: [0.78, 1.22, 1.4], raw: { sat: 1.7, contrast: 1.35 }, jpeg: { sat: 1.2, contrast: 1.2 } },
  natural: { swapRB: false, hue: 0, raw: { sat: 1.2, contrast: 1.15 }, jpeg: { sat: 1.1, contrast: 1.15 } },
  mono: { swapRB: false, hue: 0, raw: { sat: 0, contrast: 1.5 }, jpeg: { sat: 0, contrast: 1.5 } },
  sepia: { swapRB: false, hue: 0, tint: [1.12, 1.0, 0.78], raw: { sat: 0, contrast: 1.35 }, jpeg: { sat: 0, contrast: 1.35 } },
};

// The bias currently baked into params.wb, so switching looks replaces the
// previous look's bias instead of compounding it.
let lookBias: [number, number, number] = [1, 1, 1];

function applyLook(name: keyof typeof LOOKS) {
  const look = LOOKS[name];
  const strength = current?.camMatrix ? look.raw : look.jpeg;
  const bias = look.wbBias ?? [1, 1, 1];
  params.wb = [
    clamp((params.wb[0] / lookBias[0]) * bias[0], 0.02, 16),
    clamp((params.wb[1] / lookBias[1]) * bias[1], 0.02, 16),
    clamp((params.wb[2] / lookBias[2]) * bias[2], 0.02, 16),
  ];
  lookBias = bias;
  params.swapRB = look.swapRB;
  params.hue = look.hue;
  params.sat = strength.sat;
  params.contrast = strength.contrast;
  params.tint = look.tint ?? [1, 1, 1];
  syncToUI();
  draw();
}

ui.lookAero.addEventListener("click", () => applyLook("aero"));
ui.lookRed.addEventListener("click", () => applyLook("red"));
ui.lookGoldie.addEventListener("click", () => applyLook("goldie"));
ui.lookNatural.addEventListener("click", () => applyLook("natural"));
ui.lookMono.addEventListener("click", () => applyLook("mono"));
ui.lookSepia.addEventListener("click", () => applyLook("sepia"));

let raf = 0;
function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderer.render(params, params.denoise > 0 ? splitFrac : 0);
  });
}

for (const el of [ui.wbR, ui.wbG, ui.wbB, ui.expo, ui.dn, ui.hue, ui.sat, ui.con]) {
  el.addEventListener("input", syncFromUI);
}

ui.swapBtn.addEventListener("click", () => {
  params.swapRB = !params.swapRB;
  syncToUI();
  draw();
});

// Photomator-style compare divider for denoise: left of the handle shows the
// image without denoise, right with. Visible only while denoise > 0.
let splitFrac = 0.5;
const splitHandle = $("splitHandle") as HTMLDivElement;
const stage = $("stage") as HTMLDivElement;

function updateSplitHandle() {
  const show = params.denoise > 0 && !!current;
  splitHandle.hidden = !show;
  if (!show) return;
  const c = canvas.getBoundingClientRect();
  const s = stage.getBoundingClientRect();
  splitHandle.style.left = `${c.left - s.left + splitFrac * c.width}px`;
  splitHandle.style.top = `${c.top - s.top}px`;
  splitHandle.style.height = `${c.height}px`;
}

splitHandle.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  splitHandle.setPointerCapture(e.pointerId);
  const move = (ev: PointerEvent) => {
    const c = canvas.getBoundingClientRect();
    splitFrac = Math.min(1, Math.max(0, (ev.clientX - c.left) / c.width));
    updateSplitHandle();
    draw();
  };
  const up = () => {
    splitHandle.removeEventListener("pointermove", move);
    splitHandle.removeEventListener("pointerup", up);
  };
  splitHandle.addEventListener("pointermove", move);
  splitHandle.addEventListener("pointerup", up);
});

window.addEventListener("resize", updateSplitHandle);

fileInput.addEventListener("change", async () => {
  const f = fileInput.files?.[0];
  if (!f) return;
  try {
    hint.textContent = "Loading…";
    hint.hidden = false;
    const imported = await importFile(f);
    if (imported.looksTranscoded) {
      hint.textContent =
        "That file arrived as a flattened JPEG (iOS transcoded it). For true RAW, " +
        "import from Files — or zip the DNG first — rather than the Photo Library.";
      return;
    }
    const img = await decode(imported);
    current = img;
    currentFile = imported;
    renderer.setImage(toPreview(img));
    panel.hidden = false;
    hint.hidden = true;
    if (img.isRaw) {
      // Raw opens un-white-balanced (the IR magenta) and dark. Auto white
      // balance + exposure as a starting point; refine by tapping foliage.
      autoAdjust(img);
      syncToUI();
    }
    syncFromUI();
  } catch (err) {
    hint.hidden = false;
    hint.textContent = "Could not open this file: " + (err as Error).message;
  }
});

// Export & save to device.
ui.exFormat.addEventListener("change", () => {
  // Quality only applies to JPEG.
  document.getElementById("exQualityRow")!.style.display =
    ui.exFormat.value === "jpeg" ? "" : "none";
});

ui.exBtn.addEventListener("click", async () => {
  if (!current || !currentFile) return;
  const original = ui.exBtn.textContent;
  ui.exBtn.disabled = true;
  ui.exBtn.textContent = "Exporting…";
  // Let the label paint before the synchronous export loop runs.
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  try {
    await exportImage(currentFile, current, params, {
      format: ui.exFormat.value as ExportFormat,
      scale: Number(ui.exScale.value),
      quality: Number(ui.exQuality.value),
    });
  } catch (err) {
    alert("Export failed: " + (err as Error).message);
  } finally {
    ui.exBtn.disabled = false;
    ui.exBtn.textContent = original;
  }
});

// Profile / LUT export — encodes the current look for reuse elsewhere.
ui.cubeBtn.addEventListener("click", () => {
  const text = generateCube(params, { includeWB: ui.profWB.checked, title: baseName() });
  download(new Blob([text], { type: "text/plain" }), `${baseName()}.cube`);
});

ui.dcpBtn.addEventListener("click", () => {
  const buf = generateDcp(params, currentFile?.bytes, `${baseName()} (IPS)`);
  download(new Blob([new Uint8Array(buf)], { type: "application/octet-stream" }), `${baseName()}.dcp`);
});

// Tap-to-white-balance: neutralize the tapped point (foliage = the IR move).
canvas.addEventListener("click", (e) => {
  if (!current) return;
  const [pvx, pvy] = renderer.toImagePixel(e.offsetX, e.offsetY);
  // The renderer may show a downscaled proxy; map back to full-res coords.
  const px = Math.min(current.width - 1, Math.round((pvx * current.width) / Math.max(1, previewW)));
  const py = Math.min(current.height - 1, Math.round((pvy * current.height) / Math.max(1, previewH)));
  const [r, g, b] = linearAt(current, px, py);
  const mean = (r + g + b) / 3;
  // Brightness-preserving so tapping recolors without darkening.
  params.wb = lumNormalize([mean / r, mean / g, mean / b]);
  lookBias = [1, 1, 1]; // fresh neutral WB — no look bias baked in
  syncToUI();
  draw();
});

/** Scale WB gains so a neutral keeps its luminance (no overall darkening). */
function lumNormalize(g: number[]): [number, number, number] {
  const l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2] || 1;
  return [clamp(g[0] / l, 0.02, 16), clamp(g[1] / l, 0.02, 16), clamp(g[2] / l, 0.02, 16)];
}

/** White balance + exposure + noise-matched denoise in one shot. */
function autoAdjust(img: DecodedImage) {
  params.wb = grayWorldWB(img);
  params.exposure = autoExposure(img, params.wb);
  params.denoise = estimateDenoise(img);
  lookBias = [1, 1, 1]; // fresh neutral WB — no look bias baked in
}

/**
 * Auto denoise strength from measured shadow noise: median relative
 * neighbor-difference of luma over the darkest 40% of pixels (flat shadow
 * areas ≈ pure noise; the median ignores the minority of real edges).
 * Mapping calibrated on real Z50 NEFs; capped so detail always survives.
 */
function estimateDenoise(img: DecodedImage): number {
  const { width, height } = img;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 200));
  const lumaAt = (x: number, y: number) => {
    const [r, g, b] = linearAt(img, x, y);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const all: number[] = [];
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) all.push(lumaAt(x, y));
  }
  all.sort((a, b) => a - b);
  const thr = all[Math.floor(all.length * 0.4)];
  const diffs: number[] = [];
  for (let y = 0; y < height - 1; y += step) {
    for (let x = 0; x < width - 1; x += step) {
      const la = lumaAt(x, y);
      const lb = lumaAt(x + 1, y);
      const m = (la + lb) / 2;
      if (m > thr) continue;
      diffs.push(Math.abs(la - lb) / (m + 0.01));
    }
  }
  if (!diffs.length) return 0;
  diffs.sort((a, b) => a - b);
  const med = diffs[Math.floor(diffs.length / 2)];
  return clamp(0.2 + (med - 0.013) * 25, 0, 0.8);
}

/** Exposure so the bright end of the image (post WB + camera matrix) ~= 0.85. */
function autoExposure(img: DecodedImage, wb: [number, number, number]): number {
  const cm = img.camMatrix;
  const { width, height } = img;
  const lums: number[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 160));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      let [r, g, b] = linearAt(img, x, y);
      r *= wb[0];
      g *= wb[1];
      b *= wb[2];
      if (cm) {
        const cr = cm[0] * r + cm[1] * g + cm[2] * b;
        const cg = cm[3] * r + cm[4] * g + cm[5] * b;
        const cb = cm[6] * r + cm[7] * g + cm[8] * b;
        r = cr; g = cg; b = cb;
      }
      lums.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }
  lums.sort((a, b) => a - b);
  const p = lums[Math.floor(lums.length * 0.97)] || 1e-4;
  // Clamp to the exposure slider's range so the value round-trips exactly.
  return clamp(0.85 / Math.max(p, 1e-4), 0.1, 16);
}

// iOS Safari silently clamps large WebGL drawing buffers (symptom: black
// canvas). The raw paths already produce a <=2800px half-res proxy, but the
// full-res 8-bit path (lossy DNG / big JPEG) can reach 20MP+ — downscale that
// for display only. `current` keeps full resolution for sampling and export.
const MAX_PREVIEW = 2800;
let previewW = 0;
let previewH = 0;

function toPreview(img: DecodedImage): { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; camMatrix?: number[] } {
  previewW = img.width;
  previewH = img.height;
  if (!img.pixels || Math.max(img.width, img.height) <= MAX_PREVIEW) return img;
  const s = MAX_PREVIEW / Math.max(img.width, img.height);
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const src = document.createElement("canvas");
  src.width = img.width;
  src.height = img.height;
  const copy = new Uint8ClampedArray(img.pixels.length);
  copy.set(img.pixels);
  src.getContext("2d")!.putImageData(new ImageData(copy, img.width, img.height), 0, 0);
  const dst = document.createElement("canvas");
  dst.width = w;
  dst.height = h;
  const ctx = dst.getContext("2d")!;
  ctx.drawImage(src, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  previewW = w;
  previewH = h;
  return { width: w, height: h, pixels: data, camMatrix: img.camMatrix };
}

/** Linear RGB at an image pixel, from whichever buffer the decoder produced. */
function linearAt(img: DecodedImage, x: number, y: number): [number, number, number] {
  const i = (y * img.width + x) * 4;
  if (img.linear) {
    return [
      Math.max(1e-4, img.linear[i]),
      Math.max(1e-4, img.linear[i + 1]),
      Math.max(1e-4, img.linear[i + 2]),
    ];
  }
  const p = img.pixels!;
  const toLin = (v: number) => Math.max(1e-4, Math.pow(v / 255, 2.2));
  return [toLin(p[i]), toLin(p[i + 1]), toLin(p[i + 2])];
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Gray-world white balance over a subsampled grid, in linear space.
function grayWorldWB(img: DecodedImage): [number, number, number] {
  const { width, height } = img;
  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const [pr, pg, pb] = linearAt(img, x, y);
      r += pr;
      g += pg;
      b += pb;
      n++;
    }
  }
  r = Math.max(1e-4, r / n);
  g = Math.max(1e-4, g / n);
  b = Math.max(1e-4, b / n);
  const mean = (r + g + b) / 3;
  return lumNormalize([mean / r, mean / g, mean / b]);
}

// ⓘ What's new — the last 5 commits, injected at build time, each linked to
// its commit on GitHub.
{
  const dlg = $("infoDlg") as HTMLDialogElement;
  const list = $("changeList") as HTMLOListElement;
  for (const c of __CHANGELOG__) {
    const li = document.createElement("li");
    const a = document.createElement("a");
    a.href = `https://github.com/njefferson/IRstudio/commit/${c.hash}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = c.subject;
    const when = document.createElement("small");
    when.textContent = ` — ${c.date}`;
    li.append(a, when);
    list.append(li);
  }
  $("infoBtn").addEventListener("click", () => dlg.showModal());
  $("infoClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close(); // tap outside to dismiss
  });
}

// Offline support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
