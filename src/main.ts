import "./style.css";
import { importFile, type ImportedFile } from "./import";
import { decode, type DecodedImage } from "./decode";
import { Renderer, type EditParams } from "./gl";
import { exportImage, download, type ExportFormat } from "./export";
import { TONE_DEFAULT, TONE_X, toneEvaluator } from "./pipeline";
import { generateCube } from "./lut";
import { generateDcp } from "./dcp";
import { buildGlowMap } from "./glow";

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
  glow: 0,
  sky: [0, 1, 1],
  foliage: [0, 1, 1],
  tone: [...TONE_DEFAULT],
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
  glow: $("glow") as HTMLInputElement,
  skyHue: $("skyHue") as HTMLInputElement,
  skySat: $("skySat") as HTMLInputElement,
  skyLum: $("skyLum") as HTMLInputElement,
  folHue: $("folHue") as HTMLInputElement,
  folSat: $("folSat") as HTMLInputElement,
  folLum: $("folLum") as HTMLInputElement,
  tones: [0, 1, 2, 3, 4].map((i) => $(`tone${i}`) as HTMLInputElement),
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
  lookHie: $("lookHie") as HTMLButtonElement,
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
  params.glow = Number(ui.glow.value);
  params.denoise = Number(ui.dn.value);
  params.sky = [Number(ui.skyHue.value), Number(ui.skySat.value), Number(ui.skyLum.value)];
  params.foliage = [Number(ui.folHue.value), Number(ui.folSat.value), Number(ui.folLum.value)];
  for (let i = 0; i < 5; i++) {
    params.tone[i] = TONE_DEFAULT[i] + Number(ui.tones[i].value) / 100;
  }
  clampToneOrder();
  updateToneWidget();
  draw();
}

/** Keep the five tone points in ascending order with a small gap. */
function clampToneOrder() {
  for (let i = 0; i < 5; i++) {
    const lo = i === 0 ? 0 : params.tone[i - 1] + 0.01;
    params.tone[i] = clamp(params.tone[i], Math.max(lo, TONE_DEFAULT[i] - 0.25), Math.min(1, TONE_DEFAULT[i] + 0.25));
  }
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
  ui.glow.value = String(params.glow);
  ui.skyHue.value = String(params.sky[0]);
  ui.skySat.value = String(params.sky[1]);
  ui.skyLum.value = String(params.sky[2]);
  ui.folHue.value = String(params.foliage[0]);
  ui.folSat.value = String(params.foliage[1]);
  ui.folLum.value = String(params.foliage[2]);
  for (let i = 0; i < 5; i++) {
    ui.tones[i].value = String((params.tone[i] - TONE_DEFAULT[i]) * 100);
  }
  updateToneWidget();
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
  /** Repeat presses flip the R<->B swap (colour looks only). */
  toggleSwap?: boolean;
  hue: number;
  /** Multiplies the current white balance — Aero Red over-cools so post-swap
   *  foliage lands crimson; Goldie also lifts green so it lands gold. */
  wbBias?: [number, number, number];
  tint?: [number, number, number];
  glow?: number;
  raw: { sat: number; contrast: number };
  jpeg: { sat: number; contrast: number };
}
const LOOKS: Record<string, Look> = {
  // Gentle contrast by default: it never crushes shadow detail (road shade,
  // dark foliage). Scenes with big empty dark skies take Contrast up well.
  aero: { swapRB: true, toggleSwap: true, hue: 0, raw: { sat: 3.0, contrast: 1.15 }, jpeg: { sat: 1.35, contrast: 1.12 } },
  red: { swapRB: true, toggleSwap: true, hue: 0, wbBias: [0.78, 1.02, 1.35], raw: { sat: 1.8, contrast: 1.4 }, jpeg: { sat: 1.3, contrast: 1.2 } },
  goldie: { swapRB: true, toggleSwap: true, hue: 0, wbBias: [0.78, 1.22, 1.4], raw: { sat: 1.7, contrast: 1.35 }, jpeg: { sat: 1.2, contrast: 1.2 } },
  natural: { swapRB: false, toggleSwap: true, hue: 0, raw: { sat: 1.2, contrast: 1.15 }, jpeg: { sat: 1.1, contrast: 1.15 } },
  mono: { swapRB: false, hue: 0, raw: { sat: 0, contrast: 1.5 }, jpeg: { sat: 0, contrast: 1.5 } },
  sepia: { swapRB: false, hue: 0, tint: [1.12, 1.0, 0.78], raw: { sat: 0, contrast: 1.35 }, jpeg: { sat: 0, contrast: 1.35 } },
  hie: { swapRB: false, hue: 0, glow: 0.6, raw: { sat: 0, contrast: 1.45 }, jpeg: { sat: 0, contrast: 1.45 } },
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
  params.glow = look.glow ?? 0;
  params.sky = [0, 1, 1];
  params.foliage = [0, 1, 1];
  params.tone = [...TONE_DEFAULT];
  syncToUI();
  draw();
}

// Look buttons are stateful: first press applies the look and highlights the
// button; pressing the SAME look again flips its R<->B channel swap, with the
// state shown under the name.
let activeLook: string | null = null;
const lookButtons: Record<string, HTMLButtonElement> = {
  aero: ui.lookAero,
  red: ui.lookRed,
  goldie: ui.lookGoldie,
  natural: ui.lookNatural,
  mono: ui.lookMono,
  sepia: ui.lookSepia,
  hie: ui.lookHie,
};

function updateLookUI() {
  for (const [key, btn] of Object.entries(lookButtons)) {
    const active = activeLook === key;
    btn.classList.toggle("active", active);
    const sub = btn.querySelector(".look-sub") as HTMLElement | null;
    if (!sub) continue;
    const look = LOOKS[key];
    if (look.toggleSwap) {
      // Mini two-segment toggle: shows BOTH states so it reads as pressable;
      // the active look fills its current segment.
      const normOn = active && !params.swapRB ? " on" : "";
      const swapOn = active && params.swapRB ? " on" : "";
      sub.innerHTML = `<span class="seg${normOn}">norm</span><span class="seg${swapOn}">R⇄B</span>`;
    } else if (key === "hie") {
      sub.textContent = "glow";
    } else {
      sub.textContent = "";
    }
  }
}

function pressLook(key: string) {
  if (activeLook === key && LOOKS[key].toggleSwap) {
    params.swapRB = !params.swapRB;
    syncToUI();
    draw();
  } else {
    activeLook = key;
    applyLook(key);
  }
  updateLookUI();
}

for (const key of Object.keys(lookButtons)) {
  lookButtons[key].addEventListener("click", () => pressLook(key));
}

let raf = 0;
let lastToneKey = "";
function draw() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const key = params.tone.join(",");
    if (key !== lastToneKey) {
      lastToneKey = key;
      renderer.setToneCurve(params.tone);
    }
    renderer.render(params);
  });
}

// --- Tone-curve widget: five draggable dots (blacks/shadows/mids/whites/
// highlights) mirrored by the sliders below it. ---
const toneSvg = $("toneSvg") as unknown as SVGSVGElement;
const toneDots: SVGCircleElement[] = [];
let tonePath: SVGPathElement;
{
  const NS = "http://www.w3.org/2000/svg";
  // subtle grid
  for (const f of [0.25, 0.5, 0.75]) {
    for (const vert of [true, false]) {
      const l = document.createElementNS(NS, "line");
      l.setAttribute("x1", vert ? String(f * 100) : "0");
      l.setAttribute("y1", vert ? "0" : String(f * 100));
      l.setAttribute("x2", vert ? String(f * 100) : "100");
      l.setAttribute("y2", vert ? "100" : String(f * 100));
      l.setAttribute("class", "tone-grid");
      toneSvg.appendChild(l);
    }
  }
  const diag = document.createElementNS(NS, "line");
  diag.setAttribute("x1", "0");
  diag.setAttribute("y1", "100");
  diag.setAttribute("x2", "100");
  diag.setAttribute("y2", "0");
  diag.setAttribute("class", "tone-diag");
  toneSvg.appendChild(diag);
  tonePath = document.createElementNS(NS, "path");
  tonePath.setAttribute("class", "tone-path");
  toneSvg.appendChild(tonePath);
  for (let i = 0; i < 5; i++) {
    const c = document.createElementNS(NS, "circle");
    c.setAttribute("cx", String(TONE_X[i] * 100));
    c.setAttribute("r", "4.5");
    c.setAttribute("class", "tone-dot");
    toneSvg.appendChild(c);
    toneDots.push(c);
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const r = toneSvg.getBoundingClientRect();
        params.tone[i] = 1 - (ev.clientY - r.top) / Math.max(1, r.height);
        clampToneOrder();
        syncToUI();
        draw();
      };
      const up = () => {
        c.removeEventListener("pointermove", move);
        c.removeEventListener("pointerup", up);
      };
      c.addEventListener("pointermove", move);
      c.addEventListener("pointerup", up);
    });
  }
}

function updateToneWidget() {
  const fn = toneEvaluator(params.tone);
  let d = "";
  for (let s = 0; s <= 64; s++) {
    const x = s / 64;
    d += `${s === 0 ? "M" : "L"}${(x * 100).toFixed(1)},${((1 - fn(x)) * 100).toFixed(1)}`;
  }
  tonePath.setAttribute("d", d);
  for (let i = 0; i < 5; i++) {
    toneDots[i].setAttribute("cy", String((1 - params.tone[i]) * 100));
  }
}

$("toneReset").addEventListener("click", () => {
  params.tone = [...TONE_DEFAULT];
  syncToUI();
  draw();
});

// Collapsible panel sections: tap a title to fold/unfold. Everything starts
// minimized so the panel reads as a tidy table of contents.
document.querySelectorAll<HTMLFieldSetElement>("#panel fieldset").forEach((fs) => {
  const legend = fs.querySelector("legend");
  if (!legend) return;
  legend.classList.add("collapsible");
  fs.classList.add("collapsed");
  legend.addEventListener("click", () => {
    fs.classList.toggle("collapsed");
    updateScrollCues();
  });
});

for (const el of [ui.wbR, ui.wbG, ui.wbB, ui.expo, ui.dn, ui.hue, ui.sat, ui.con, ui.glow,
  ui.skyHue, ui.skySat, ui.skyLum, ui.folHue, ui.folSat, ui.folLum, ...ui.tones]) {
  el.addEventListener("input", syncFromUI);
}

ui.swapBtn.addEventListener("click", () => {
  params.swapRB = !params.swapRB;
  syncToUI();
  updateLookUI();
  draw();
});

// Reset the per-color bands to neutral (Auto deliberately doesn't touch them).
$("pcReset").addEventListener("click", () => {
  params.sky = [0, 1, 1];
  params.foliage = [0, 1, 1];
  syncToUI();
  draw();
});

// Help dialog (usage guide; the ⓘ dialog stays what's-new + support).
const helpDlg = $("helpDlg") as HTMLDialogElement;
$("helpBtn").addEventListener("click", () => helpDlg.showModal());
$("helpClose").addEventListener("click", () => helpDlg.close());
helpDlg.addEventListener("click", (e) => {
  if (e.target === helpDlg) helpDlg.close();
});

// Press-and-hold comparison with the as-imported original (auto WB/exposure/
// denoise, no creative edits). Works from the header button or by holding the
// photo itself.
let origParams: EditParams | null = null;
let holdTimer = 0;

function showOriginal(on: boolean) {
  if (!current || !origParams) return;
  renderer.render(on ? origParams : params);
}

const origBtn = $("origBtn") as HTMLButtonElement;
for (const ev of ["pointerdown"] as const) {
  origBtn.addEventListener(ev, (e) => {
    e.preventDefault();
    origBtn.setPointerCapture((e as PointerEvent).pointerId);
    showOriginal(true);
  });
}
for (const ev of ["pointerup", "pointercancel", "pointerleave"] as const) {
  origBtn.addEventListener(ev, () => showOriginal(false));
}

// Panel scroll cues: arrows appear when there is more panel above/below.
const cueUp = $("panelUp") as HTMLDivElement;
const cueDown = $("panelDown") as HTMLDivElement;
function updateScrollCues() {
  if (panel.hidden) {
    cueUp.hidden = true;
    cueDown.hidden = true;
    return;
  }
  const max = panel.scrollHeight - panel.clientHeight;
  cueUp.hidden = panel.scrollTop < 12;
  cueDown.hidden = max <= 0 || panel.scrollTop > max - 12;
}
panel.addEventListener("scroll", updateScrollCues, { passive: true });
window.addEventListener("resize", updateScrollCues);

// Rotate 90° clockwise per tap. Applies to the preview and the export.
$("rotateBtn").addEventListener("click", () => {
  if (!current) return;
  renderer.setRotation(renderer.rotation + 1);
  resetZoom();
  draw();
});

// --- Pinch to zoom, drag to pan (when zoomed). A quick tap still sets white
// balance; any real movement suppresses the tap. ---
let zoom = 1;
let panX = 0;
let panY = 0;
let tapSuppressed = false;
const activePointers = new Map<number, { x: number; y: number }>();
let pinch: { dist: number; zoom: number; midX: number; midY: number; panX: number; panY: number } | null = null;
let panDrag: { x: number; y: number; panX: number; panY: number } | null = null;

function applyZoom() {
  if (zoom <= 1.001) {
    zoom = 1;
    panX = 0;
    panY = 0;
    canvas.style.transform = "";
    return;
  }
  // Keep the image from being flung entirely off-screen.
  const maxX = (canvas.clientWidth * (zoom - 1)) / 2 + 60;
  const maxY = (canvas.clientHeight * (zoom - 1)) / 2 + 60;
  panX = clamp(panX, -maxX, maxX);
  panY = clamp(panY, -maxY, maxY);
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
}

function resetZoom() {
  zoom = 1;
  applyZoom();
}

canvas.style.transformOrigin = "center center";

canvas.addEventListener("pointerdown", (e) => {
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  canvas.setPointerCapture(e.pointerId);
  // Long-press (held still) shows the original for comparison.
  clearTimeout(holdTimer);
  if (activePointers.size === 1) {
    holdTimer = window.setTimeout(() => {
      tapSuppressed = true;
      showOriginal(true);
    }, 400);
  }
  if (activePointers.size === 2) {
    clearTimeout(holdTimer);
    showOriginal(false);
    const [a, b] = [...activePointers.values()];
    const stageRect = canvas.parentElement!.getBoundingClientRect();
    pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      zoom,
      midX: (a.x + b.x) / 2 - (stageRect.left + stageRect.width / 2),
      midY: (a.y + b.y) / 2 - (stageRect.top + stageRect.height / 2),
      panX,
      panY,
    };
    panDrag = null;
    tapSuppressed = true;
  } else if (zoom > 1) {
    panDrag = { x: e.clientX, y: e.clientY, panX, panY };
  }
});

canvas.addEventListener("pointermove", (e) => {
  const p = activePointers.get(e.pointerId);
  if (!p) return;
  if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 8) {
    tapSuppressed = true;
    clearTimeout(holdTimer);
  }
  p.x = e.clientX;
  p.y = e.clientY;
  if (pinch && activePointers.size === 2) {
    const [a, b] = [...activePointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const next = clamp((pinch.zoom * dist) / Math.max(1, pinch.dist), 1, 8);
    // Keep the image point under the pinch midpoint anchored.
    const k = next / pinch.zoom;
    panX = pinch.midX - (pinch.midX - pinch.panX) * k;
    panY = pinch.midY - (pinch.midY - pinch.panY) * k;
    zoom = next;
    applyZoom();
  } else if (panDrag) {
    panX = panDrag.panX + (e.clientX - panDrag.x);
    panY = panDrag.panY + (e.clientY - panDrag.y);
    applyZoom();
  }
});

function endPointer(e: PointerEvent) {
  activePointers.delete(e.pointerId);
  clearTimeout(holdTimer);
  showOriginal(false);
  if (activePointers.size < 2) pinch = null;
  if (activePointers.size === 0) panDrag = null;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

const welcome = $("welcome") as HTMLDivElement;
const welcomeClose = $("welcomeClose") as HTMLButtonElement;
const lesson = $("lesson") as HTMLDivElement;
const lessonShow = $("lessonShow") as HTMLButtonElement;

// "Examples" in the header re-opens the welcome/example chooser at any time;
// the ✕ (only shown once an image is loaded) returns to the photo.
$("examplesBtn").addEventListener("click", () => {
  welcomeClose.hidden = !current;
  hint.hidden = !!current;
  welcome.hidden = false;
});
welcomeClose.addEventListener("click", () => {
  welcome.hidden = true;
});

async function openImported(imported: ImportedFile) {
  const img = await decode(imported);
  current = img;
  currentFile = imported;
  renderer.setImage(toPreview(img));
  renderer.setRotation(img.rotate ?? 0);
  resetZoom();
  renderer.setGlowMap(buildGlowMap((x, y) => linearAt(img, x, y), img.width, img.height));
  panel.hidden = false;
  welcome.hidden = true;
  lesson.hidden = true;
  lessonShow.hidden = true;
  if (img.isRaw) {
    // Raw opens un-white-balanced (the IR magenta) and dark. Auto white
    // balance + exposure as a starting point; refine by tapping foliage.
    autoAdjust(img);
    syncToUI();
  }
  // Snapshot the as-imported baseline for press-and-hold comparison.
  origParams = {
    wb: img.isRaw ? ([...params.wb] as [number, number, number]) : [1, 1, 1],
    exposure: img.isRaw ? params.exposure : 1,
    denoise: img.isRaw ? params.denoise : 0,
    swapRB: false,
    hue: 0,
    sat: 1,
    contrast: 1,
    tint: [1, 1, 1],
    glow: 0,
    sky: [0, 1, 1],
    foliage: [0, 1, 1],
    tone: [...TONE_DEFAULT],
  };
  activeLook = null;
  updateLookUI();
  syncFromUI();
  requestAnimationFrame(updateScrollCues);
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
    await openImported(imported);
  } catch (err) {
    welcome.hidden = false;
    hint.hidden = false;
    hint.textContent = "Could not open this file: " + (err as Error).message;
  }
});

// --- Example photos: fetched on demand, opened through the normal raw path,
// each with a short lesson overlay showing what to try. ---
const EXAMPLES: Record<string, { file: string; title: string; steps: string[]; rotate?: number; expand?: string[] }> = {
  canopy: {
    file: "./examples/canopy.dng",
    rotate: 3,
    expand: ["fsLooks", "fsHueSat", "fsExport"],
    title: "Lesson 1 · Golden canopy — the Looks",
    steps: [
      "Tap Aerochrome, Aero Red and Goldie to compare — press one twice to flip its R⇄B swap.",
      "Tap different things in the photo — leaves, road, sky — each sets white balance from that point. Auto brings you back.",
      "Slide Saturation and Contrast to taste, then Export & Save.",
    ],
  },
  lodge: {
    file: "./examples/lodge.dng",
    rotate: 3,
    expand: ["fsWb", "fsDenoise", "fsLooks"],
    title: "Lesson 2 · Motor lodge — white balance & film looks",
    steps: [
      "Tap around the photo — trees, grass, even the sign — each tap sets white balance from that point and the colors shift. Auto brings you back.",
      "Denoise is set automatically from the photo — fine-tune it with the slider.",
      "Try B&W IR and HIE B&W for the classic film feel.",
    ],
  },
  hillside: {
    file: "./examples/hillside.dng",
    expand: ["fsLooks", "fsPerColor"],
    title: "Lesson 3 · Hillside & sky — per-color grading",
    steps: [
      "Tap Aerochrome first.",
      "In Per-color, slide the Sky hue toward +40 — the sky moves, the foliage doesn't.",
      "Now shift the Foliage hue and luminance independently.",
      "Reset per-color (the button in that section) returns both bands to neutral.",
    ],
  },
};

async function loadExample(key: string) {
  const ex = EXAMPLES[key];
  if (!ex) return;
  showBusy("Loading example…");
  try {
    const res = await fetch(ex.file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const bytes = new Uint8Array(await res.arrayBuffer());
    await openImported({ name: `${key}.dng`, kind: "dng", bytes, looksTranscoded: false });
    if (ex.rotate) {
      renderer.setRotation(ex.rotate);
      draw();
    }
    // Unfold exactly the sections this lesson teaches.
    if (ex.expand) {
      document.querySelectorAll<HTMLFieldSetElement>("#panel fieldset").forEach((fs) => {
        fs.classList.toggle("collapsed", !ex.expand!.includes(fs.id));
      });
      panel.scrollTop = 0;
      updateScrollCues();
    }
    // Show the lesson card for this example.
    ($("lessonTitle") as HTMLElement).textContent = ex.title;
    const ol = $("lessonSteps") as HTMLOListElement;
    ol.replaceChildren(...ex.steps.map((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      return li;
    }));
    lesson.hidden = false;
    lessonShow.hidden = true;
  } catch (err) {
    alert("Could not load the example: " + (err as Error).message);
  } finally {
    hideBusy();
  }
}

document.querySelectorAll<HTMLButtonElement>(".ex").forEach((b) => {
  b.addEventListener("click", () => loadExample(b.dataset.ex!));
});
// "Got it" minimizes the lesson to a floating "?" that brings it back.
$("lessonClose").addEventListener("click", () => {
  lesson.hidden = true;
  lessonShow.hidden = false;
});
lessonShow.addEventListener("click", () => {
  lesson.hidden = false;
  lessonShow.hidden = true;
});

// Export & save to device.
ui.exFormat.addEventListener("change", () => {
  // Quality only applies to JPEG.
  document.getElementById("exQualityRow")!.style.display =
    ui.exFormat.value === "jpeg" ? "" : "none";
});

// Export flow: progress overlay while rendering, then a "Save image" button.
// The save happens on its own tap so iOS lets us open the native share sheet
// ("Save Image" -> Photos) and the app never navigates away.
const busy = $("busy") as HTMLDivElement;
const busyText = $("busyText") as HTMLParagraphElement;
const busySpinner = $("busySpinner") as HTMLDivElement;
const busyActions = $("busyActions") as HTMLDivElement;
const busySave = $("busySave") as HTMLButtonElement;
const busyClose = $("busyClose") as HTMLButtonElement;
let pendingSave: { blob: Blob; name: string } | null = null;

function showBusy(text: string) {
  busyText.textContent = text;
  busySpinner.hidden = false;
  busyActions.hidden = true;
  busy.hidden = false;
}

function hideBusy() {
  busy.hidden = true;
  pendingSave = null;
}

busyClose.addEventListener("click", hideBusy);

busySave.addEventListener("click", async () => {
  if (!pendingSave) return;
  const { blob, name } = pendingSave;
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] } as ShareData);
      hideBusy();
      return;
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // user cancelled the sheet
      // Fall through to a plain download on any other failure.
    }
  }
  download(blob, name);
  hideBusy();
});

ui.exBtn.addEventListener("click", async () => {
  if (!current || !currentFile) return;
  ui.exBtn.disabled = true;
  showBusy("Exporting… 0%");
  try {
    const result = await exportImage(
      currentFile,
      current,
      params,
      {
        format: ui.exFormat.value as ExportFormat,
        scale: Number(ui.exScale.value),
        quality: Number(ui.exQuality.value),
        rotate: renderer.rotation,
      },
      (f) => {
        busyText.textContent = `Exporting… ${Math.round(f * 100)}%`;
      },
    );
    pendingSave = result;
    busyText.textContent = `Ready — ${result.name}`;
    busySpinner.hidden = true;
    busyActions.hidden = false;
  } catch (err) {
    hideBusy();
    alert("Export failed: " + (err as Error).message);
  } finally {
    ui.exBtn.disabled = false;
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
// Skipped when the gesture was a pan/pinch rather than a tap.
canvas.addEventListener("click", (e) => {
  if (!current) return;
  if (tapSuppressed) {
    tapSuppressed = false;
    return;
  }
  const [pvx, pvy] = renderer.toImagePixel(e.clientX, e.clientY);
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

// Support links in the ⓘ dialog. Each stays hidden while its URL is empty.
const COFFEE_URL = "https://paypal.me/WishUponGames";
const VENMO_URL = "https://venmo.com/u/noahjefferson";
{
  const coffee = $("coffee") as HTMLAnchorElement;
  if (COFFEE_URL) {
    coffee.href = COFFEE_URL;
    coffee.hidden = false;
  }
  const venmo = $("venmo") as HTMLAnchorElement;
  if (VENMO_URL) {
    venmo.href = VENMO_URL;
    venmo.hidden = false;
  }
}

// Offline support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
