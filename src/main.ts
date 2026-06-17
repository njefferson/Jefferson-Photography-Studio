import "./style.css";
import { importFile } from "./import";
import { decode, type DecodedImage } from "./decode";
import { Renderer, type EditParams } from "./gl";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $("view") as HTMLCanvasElement;
const hint = $("hint") as HTMLParagraphElement;
const panel = $("panel") as HTMLElement;
const fileInput = $("file") as HTMLInputElement;

const renderer = new Renderer(canvas);
let current: DecodedImage | null = null;

const params: EditParams = {
  wb: [1, 1, 1],
  swapRB: true,
  hue: 0,
  sat: 1,
  contrast: 1,
};

const ui = {
  wbR: $("wbR") as HTMLInputElement,
  wbG: $("wbG") as HTMLInputElement,
  wbB: $("wbB") as HTMLInputElement,
  swap: $("swap") as HTMLSelectElement,
  hue: $("hue") as HTMLInputElement,
  sat: $("sat") as HTMLInputElement,
  con: $("con") as HTMLInputElement,
};

function syncFromUI() {
  params.wb = [Number(ui.wbR.value), Number(ui.wbG.value), Number(ui.wbB.value)];
  params.swapRB = ui.swap.value === "rb";
  params.hue = Number(ui.hue.value);
  params.sat = Number(ui.sat.value);
  params.contrast = Number(ui.con.value);
  draw();
}

function syncToUI() {
  ui.wbR.value = String(params.wb[0]);
  ui.wbG.value = String(params.wb[1]);
  ui.wbB.value = String(params.wb[2]);
}

let raf = 0;
function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    renderer.render(params);
  });
}

for (const el of [ui.wbR, ui.wbG, ui.wbB, ui.swap, ui.hue, ui.sat, ui.con]) {
  el.addEventListener("input", syncFromUI);
}

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
    renderer.setImage(img.width, img.height, img.pixels);
    panel.hidden = false;
    hint.hidden = true;
    if (img.isRaw) {
      // Raw opens un-white-balanced (the IR magenta). Auto-neutralize as a
      // starting point; the user refines by tapping foliage.
      params.wb = grayWorldWB(img);
      syncToUI();
    }
    syncFromUI();
  } catch (err) {
    hint.hidden = false;
    hint.textContent = "Could not open this file: " + (err as Error).message;
  }
});

// Tap-to-white-balance: neutralize the tapped point (foliage = the IR move).
canvas.addEventListener("click", (e) => {
  if (!current) return;
  const [px, py] = renderer.toImagePixel(e.offsetX, e.offsetY);
  const i = (py * current.width + px) * 4;
  const toLin = (v: number) => Math.pow(v / 255, 2.2);
  const r = Math.max(1e-4, toLin(current.pixels[i]));
  const g = Math.max(1e-4, toLin(current.pixels[i + 1]));
  const b = Math.max(1e-4, toLin(current.pixels[i + 2]));
  const mean = (r + g + b) / 3;
  params.wb = [
    clamp(mean / r, 0.05, 8),
    clamp(mean / g, 0.05, 8),
    clamp(mean / b, 0.05, 8),
  ];
  syncToUI();
  draw();
});

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// Gray-world white balance over a subsampled grid, in linear space.
function grayWorldWB(img: DecodedImage): [number, number, number] {
  const { width, height, pixels } = img;
  const toLin = (v: number) => Math.pow(v / 255, 2.2);
  let r = 0, g = 0, b = 0, n = 0;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const i = (y * width + x) * 4;
      r += toLin(pixels[i]);
      g += toLin(pixels[i + 1]);
      b += toLin(pixels[i + 2]);
      n++;
    }
  }
  r = Math.max(1e-4, r / n);
  g = Math.max(1e-4, g / n);
  b = Math.max(1e-4, b / n);
  const mean = (r + g + b) / 3;
  return [clamp(mean / r, 0.05, 8), clamp(mean / g, 0.05, 8), clamp(mean / b, 0.05, 8)];
}

// Offline support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
