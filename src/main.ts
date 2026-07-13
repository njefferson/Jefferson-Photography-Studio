import "./style.css";
import { importFile, type ImportedFile, type ImageKind } from "./import";
import { decode, type DecodedImage } from "./decode";
import { Renderer, type EditParams } from "./gl";
import { exportImage, download, type ExportFormat } from "./export";
import { writeZip, crc32 } from "./zip";
import { putFrame, eachFrame, frameMetas, frameCount, clearFrames } from "./batchstore";
import * as Session from "./session";
import { TONE_DEFAULT, TONE_X, toneEvaluator, neutralMask, hslDefault, HSL_CENTERS, MAX_MASKS, chromaVec, hsv2rgb, type MaskLayer } from "./pipeline";
import { generateCube } from "./lut";
import { generateDcp } from "./dcp";
import { buildGlowMap } from "./glow";
import { buildLocalMap } from "./localmap";
import { buildSkyMask } from "./sky";
import { drawHistogram } from "./histogram";
import * as Hotspot from "./hotspot";
import { setupInstalledShare } from "./share";

// Injected at build time from git history (see vite.config.ts).
declare const __CHANGELOG__: { hash: string; date: string; subject: string; version: string }[];
declare const __ROADMAP__: { done: boolean; title: string }[];
declare const __APP_VERSION__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const canvas = $("view") as HTMLCanvasElement;
const hint = $("hint") as HTMLParagraphElement;
const panel = $("panel") as HTMLElement;
const fileInput = $("file") as HTMLInputElement;

// No WebGL2 -> a clear explanation with options instead of a blank page. The
// throw halts this module; the static overlay needs no scripting to stay up.
const renderer = (() => {
  try {
    return new Renderer(canvas);
  } catch (err) {
    document.getElementById("unsupported")!.hidden = false;
    throw err;
  }
})();
let current: DecodedImage | null = null;
let currentFile: ImportedFile | null = null;

// --- Hot-spot profile correction: a SEPARATE, earlier pass from the manual
// `hotspot`/`hotspotSize` slider above (params.hotspot). Auto-selected from
// EXIF (or a manual lens+FL pick) and applied once to the decoded pixel
// buffer, before white balance / channel swap / grading ever see it. Not
// part of EditParams / the undo stack — it's a per-photo source correction,
// not a creative edit; re-derived fresh each time a photo opens. ---
let hotspotPristine: Uint8ClampedArray | null = null; // decoded pixels before correction
let hotspotState: { profileKey: string | null; source: "exif" | "manual" | null; strength: number; bypass: boolean } | null = null;

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
  lum: 1,
  masks: [],
  hotspot: 0,
  hotspotSize: 0.5,
  vignette: 0,
  clarity: 0,
  dehaze: 0,
  hsl: hslDefault(),
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
  lum: $("lum") as HTMLInputElement,
  hotspot: $("hotspot") as HTMLInputElement,
  hotspotSize: $("hotspotSize") as HTMLInputElement,
  vignette: $("vignette") as HTMLInputElement,
  clarity: $("clarity") as HTMLInputElement,
  dehaze: $("dehaze") as HTMLInputElement,
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

const hsUi = {
  status: $("hsStatus") as HTMLElement,
  strength: $("hsStrength") as HTMLInputElement,
  bypassBtn: $("hsBypassBtn") as HTMLButtonElement,
  prompt: $("hsPrompt") as HTMLDivElement,
  lens: $("hsLens") as HTMLSelectElement,
  fl: $("hsFL") as HTMLSelectElement,
  applyManualBtn: $("hsApplyManual") as HTMLButtonElement,
};

for (const short of Hotspot.lensNames()) {
  const o = document.createElement("option");
  o.value = short;
  o.textContent = short + "mm";
  hsUi.lens.append(o);
}
function populateFLOptions() {
  hsUi.fl.replaceChildren();
  for (const fl of Hotspot.flAnchors(hsUi.lens.value)) {
    const o = document.createElement("option");
    o.value = String(fl);
    o.textContent = fl + "mm";
    hsUi.fl.append(o);
  }
}
populateFLOptions();
hsUi.lens.addEventListener("change", populateFLOptions);

function baseName(): string {
  return (currentFile?.name ?? "IPS-look").replace(/\.[^.]+$/, "");
}

function arrayBufferOf(u8: Uint8Array): ArrayBufferLike {
  return u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength
    ? u8.buffer
    : u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength);
}

/** Recompute `current.pixels` from the pristine decode + the active profile,
 *  and push the result to the GPU texture. No-op when the source has no
 *  gamma pixel buffer (RAW path — hot-spot profiles aren't supported there
 *  yet; see hsStatus text). */
function applyHotspotCorrection() {
  if (!current?.pixels || !hotspotPristine || !hotspotState) return;
  current.pixels.set(hotspotPristine);
  if (!hotspotState.bypass && hotspotState.profileKey) {
    Hotspot.apply({ width: current.width, height: current.height, data: current.pixels }, hotspotState.profileKey, hotspotState.strength);
  }
  renderer.setImage(toPreview(current));
  updateHotspotUI();
}

function updateHotspotUI() {
  if (!current) { hsUi.status.textContent = "No photo loaded."; hsUi.prompt.hidden = true; return; }
  if (!current.pixels) {
    hsUi.status.textContent = "Not available for RAW yet — profiles are calibrated from JPEG.";
    hsUi.prompt.hidden = true;
    hsUi.strength.disabled = true;
    hsUi.bypassBtn.disabled = true;
    return;
  }
  hsUi.strength.disabled = false;
  hsUi.bypassBtn.disabled = false;
  hsUi.strength.value = String(hotspotState?.strength ?? 1);
  const bypass = hotspotState?.bypass ?? false;
  hsUi.bypassBtn.setAttribute("aria-pressed", String(bypass));
  hsUi.prompt.hidden = !!hotspotState?.profileKey;
  if (!hotspotState?.profileKey) {
    hsUi.status.textContent = "Couldn't identify the lens — pick it below.";
  } else {
    const src = hotspotState.source === "exif" ? "from EXIF" : "manual";
    hsUi.status.textContent = `${hotspotState.profileKey} · ${src}${bypass ? " · bypassed" : ""}`;
  }
}

hsUi.strength.addEventListener("input", () => {
  if (!hotspotState) return;
  hotspotState.strength = Number(hsUi.strength.value);
  applyHotspotCorrection();
});
hsUi.bypassBtn.addEventListener("click", () => {
  if (!hotspotState) return;
  hotspotState.bypass = !hotspotState.bypass;
  applyHotspotCorrection();
});
hsUi.applyManualBtn.addEventListener("click", () => {
  if (!hotspotState) return;
  const fl = Number(hsUi.fl.value);
  if (!fl) return;
  hotspotState.profileKey = Hotspot.keyFor(hsUi.lens.value, fl);
  hotspotState.source = "manual";
  applyHotspotCorrection();
});

/** Called once per newly-opened photo, right after decode. Auto-selects the
 *  hot-spot profile from EXIF; if the lens can't be identified, surfaces the
 *  manual picker instead of silently skipping correction (never guess). */
function initHotspot(img: DecodedImage, imported: ImportedFile) {
  if (!img.pixels) {
    hotspotPristine = null;
    hotspotState = null;
    updateHotspotUI();
    return;
  }
  hotspotPristine = img.pixels.slice();
  const info = Hotspot.fromExif(arrayBufferOf(imported.bytes));
  if (Hotspot.needsPrompt(info)) {
    hotspotState = { profileKey: null, source: null, strength: 1, bypass: false };
  } else {
    hotspotState = { profileKey: info!.profileKey, source: "exif", strength: 1, bypass: false };
  }
  applyHotspotCorrection();
}

// --- Live histogram: a floating RGB + luminance readout that re-tallies the
// GPU output every time the edit changes. Toggled from the header; the
// preference sticks across sessions. ---
const histWrap = $("histWrap") as HTMLDivElement;
const histCanvas = $("histogram") as HTMLCanvasElement;
const histBtn = $("histBtn") as HTMLButtonElement;
let histEnabled = localStorage.getItem("ips-hist") !== "0";

function updateHistVisibility() {
  histBtn.setAttribute("aria-pressed", String(histEnabled));
  histWrap.hidden = !current || !histEnabled;
}

/** Recompute + repaint the histogram for a param set (skipped when hidden). */
function refreshHistogram(p: EditParams) {
  if (!current || !histEnabled) return;
  const h = renderer.histogram(p);
  if (h) drawHistogram(histCanvas, h);
}

histBtn.addEventListener("click", () => {
  histEnabled = !histEnabled;
  localStorage.setItem("ips-hist", histEnabled ? "1" : "0");
  updateHistVisibility();
  if (histEnabled) refreshHistogram(params);
});
updateHistVisibility(); // reflect the stored preference on the toggle at startup

// WB gains and exposure span 0.02–16x / 0.1–16x; on a linear track every
// realistic value (0.3–3) crowds into the bottom tenth, which reads as the
// sliders "falling to the floor" even when the balance is correct. The track
// therefore stores a 0..1000 position mapped exponentially, putting 1.0 near
// mid-track with fine control around it.
const WB_LO = 0.02, WB_HI = 16, EX_LO = 0.1, EX_HI = 16;
// Global luminance spans 0.5–2x on the same kind of log track; 1.0 (neutral)
// lands dead centre so brighten/darken are symmetric around it.
const LUM_LO = 0.5, LUM_HI = 2;
function toPos(v: number, lo: number, hi: number): number {
  return Math.round((1000 * Math.log(clamp(v, lo, hi) / lo)) / Math.log(hi / lo));
}
function fromPos(p: number, lo: number, hi: number): number {
  return lo * Math.pow(hi / lo, clamp(p, 0, 1000) / 1000);
}

function syncFromUI() {
  params.wb = [
    fromPos(Number(ui.wbR.value), WB_LO, WB_HI),
    fromPos(Number(ui.wbG.value), WB_LO, WB_HI),
    fromPos(Number(ui.wbB.value), WB_LO, WB_HI),
  ];
  params.exposure = fromPos(Number(ui.expo.value), EX_LO, EX_HI);
  params.hue = Number(ui.hue.value);
  params.sat = Number(ui.sat.value);
  params.contrast = Number(ui.con.value);
  params.glow = Number(ui.glow.value);
  params.lum = fromPos(Number(ui.lum.value), LUM_LO, LUM_HI);
  params.hotspot = Number(ui.hotspot.value);
  params.hotspotSize = Number(ui.hotspotSize.value);
  params.vignette = Number(ui.vignette.value);
  params.clarity = Number(ui.clarity.value);
  params.dehaze = Number(ui.dehaze.value);
  params.denoise = Number(ui.dn.value);
  params.sky = [Number(ui.skyHue.value), Number(ui.skySat.value), Number(ui.skyLum.value)];
  params.foliage = [Number(ui.folHue.value), Number(ui.folSat.value), Number(ui.folLum.value)];
  for (let i = 0; i < 5; i++) {
    params.tone[i] = TONE_DEFAULT[i] + Number(ui.tones[i].value) / 100;
  }
  clampToneOrder();
  updateToneWidget();
  updateBandLabels();
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
  ui.wbR.value = String(toPos(params.wb[0], WB_LO, WB_HI));
  ui.wbG.value = String(toPos(params.wb[1], WB_LO, WB_HI));
  ui.wbB.value = String(toPos(params.wb[2], WB_LO, WB_HI));
  ui.expo.value = String(toPos(params.exposure, EX_LO, EX_HI));
  ui.dn.value = String(params.denoise);
  ui.swapBtn.setAttribute("aria-pressed", String(params.swapRB));
  ui.hue.value = String(params.hue);
  ui.sat.value = String(params.sat);
  ui.con.value = String(params.contrast);
  ui.glow.value = String(params.glow);
  ui.lum.value = String(toPos(params.lum, LUM_LO, LUM_HI));
  ui.hotspot.value = String(params.hotspot);
  ui.hotspotSize.value = String(params.hotspotSize);
  ui.vignette.value = String(params.vignette);
  ui.clarity.value = String(params.clarity);
  ui.dehaze.value = String(params.dehaze);
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
  updateBandLabels();
  updateHslUI();
}

// The per-color bands follow the subject through a channel swap (the swap
// reflects every hue), so the colors each box grabs flip with the swap state —
// the sub-labels keep the user oriented.
function updateBandLabels() {
  const skySub = document.getElementById("skyBandSub");
  const folSub = document.getElementById("folBandSub");
  if (!skySub || !folSub) return;
  skySub.textContent = params.swapRB ? "(reds & golds — swapped)" : "(teals & blues)";
  folSub.textContent = params.swapRB ? "(teals & blues — swapped)" : "(reds & golds)";
}

// Auto: brightness-preserving white balance + auto-exposure.
ui.autoBtn.addEventListener("click", () => {
  if (!current) return;
  autoAdjust(current);
  syncToUI();
  draw();
  flushRecord();
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
  params.lum = 1;
  params.hsl = hslDefault();
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
  flushRecord();
}

for (const key of Object.keys(lookButtons)) {
  lookButtons[key].addEventListener("click", () => pressLook(key));
}

// --- Edit history: snapshots power Go back (undo), Reset (whole edit) and the
// saved-look slots. A snapshot is the full editor state — the EditParams plus
// the look highlight (activeLook) and the WB bias a look baked in (lookBias),
// so undo/load restore exactly what was on screen, look button and all.
// (Rotation and zoom are view state, not part of the edit, so they stay put.)
type Snapshot = { params: EditParams; activeLook: string | null; lookBias: [number, number, number] };

function cloneParams(p: EditParams): EditParams {
  return {
    wb: [...p.wb] as [number, number, number],
    exposure: p.exposure,
    swapRB: p.swapRB,
    hue: p.hue,
    sat: p.sat,
    contrast: p.contrast,
    denoise: p.denoise,
    tint: [...p.tint] as [number, number, number],
    glow: p.glow,
    sky: [...p.sky] as [number, number, number],
    foliage: [...p.foliage] as [number, number, number],
    tone: [...p.tone] as [number, number, number, number, number],
    lum: p.lum,
    // Brush bitmaps are SHARED between snapshots, not copied (copy-on-write):
    // a stroke clones the live buffer before mutating (startPaint/Clear), so a
    // history entry's pixels can never change under it. Without this, every
    // snapshot duplicated up to 4 x ~100KB bitmaps — tens of MB of undo history
    // in a heavy brush session on the iPad.
    masks: (p.masks ?? []).map((m) => ({ ...m })),
    hotspot: p.hotspot,
    hotspotSize: p.hotspotSize,
    vignette: p.vignette,
    clarity: p.clarity,
    dehaze: p.dehaze,
    hsl: [...(p.hsl ?? hslDefault())],
  };
}

// Snapshot signature for undo equality — cheap: skips the brush pixel buffers
// (a stroke bumps the mask's `rev`, which IS compared) so we never serialise
// hundreds of KB of bitmap on every frame.
function snapSig(s: Snapshot): string {
  return JSON.stringify(s, (k, v) => (k === "data" && v instanceof Uint8Array ? undefined : v));
}

function snapshot(): Snapshot {
  return { params: cloneParams(params), activeLook, lookBias: [...lookBias] as [number, number, number] };
}

/** Restore a snapshot into the live editor (in place — `params` keeps identity)
 *  and repaint. Missing/old fields fall back to neutral so a stale saved slot
 *  can't corrupt the edit. */
function applySnapshot(s: Snapshot) {
  const c = cloneParams({ ...params, ...s.params, lum: s.params.lum ?? 1 });
  params.wb = c.wb;
  params.exposure = c.exposure;
  params.swapRB = c.swapRB;
  params.hue = c.hue;
  params.sat = c.sat;
  params.contrast = c.contrast;
  params.denoise = c.denoise;
  params.tint = c.tint;
  params.glow = c.glow;
  params.sky = c.sky;
  params.foliage = c.foliage;
  params.tone = c.tone;
  params.lum = c.lum;
  params.masks = c.masks;
  params.hotspot = c.hotspot;
  params.hotspotSize = c.hotspotSize;
  params.vignette = c.vignette;
  params.clarity = c.clarity ?? 0;
  params.dehaze = c.dehaze ?? 0;
  params.hsl = c.hsl?.length === 24 ? c.hsl : hslDefault();
  activeLook = s.activeLook ?? null;
  lookBias = (s.lookBias ? [...s.lookBias] : [1, 1, 1]) as [number, number, number];
  if (selectedMask >= params.masks.length) selectedMask = params.masks.length - 1;
  syncToUI();
  updateLookUI();
  updateMaskUI();
  renderMaskOverlay();
  draw();
}

const undoStack: Snapshot[] = [];
let settled: Snapshot | null = null; // last recorded state (advances on settle)
let baseline: Snapshot | null = null; // fresh-open automatic baseline (Reset target)
let recordTimer = 0;
const HISTORY_MAX = 100;

const undoBtn = $("undoBtn") as HTMLButtonElement;
const resetBtn = $("resetBtn") as HTMLButtonElement;

function updateEditButtons() {
  undoBtn.disabled = undoStack.length === 0;
  resetBtn.disabled = !baseline || !current;
}

/** Record the previous settled state onto the undo stack when the edit has
 *  actually changed. Continuous slider drags coalesce (one entry per gesture)
 *  via the debounce; discrete actions call this straight away to be atomic. */
function flushRecord() {
  clearTimeout(recordTimer);
  recordTimer = 0;
  if (!settled) return;
  const now = snapshot();
  if (snapSig(now) !== snapSig(settled)) {
    undoStack.push(settled);
    if (undoStack.length > HISTORY_MAX) undoStack.shift();
    settled = now;
    updateEditButtons();
  }
}

function recordSoon() {
  if (!settled || painting) return; // a paint stroke commits once, on pointerup
  clearTimeout(recordTimer);
  recordTimer = window.setTimeout(flushRecord, 350);
}

function undo() {
  flushRecord(); // fold any in-flight edit into history first
  const prev = undoStack.pop();
  if (!prev) return;
  applySnapshot(prev);
  settled = snapshot(); // now == prev; don't let the repaint re-record it
  clearTimeout(recordTimer);
  recordTimer = 0;
  updateEditButtons();
}

function resetEdit() {
  if (!baseline || !current) return;
  flushRecord(); // settle current edits so Reset itself is undoable
  applySnapshot(baseline);
}

undoBtn.addEventListener("click", undo);
resetBtn.addEventListener("click", resetEdit);

// --- Saved-look slots: five localStorage-backed memory slots that persist
// across sessions. A slot stores a full snapshot; loading applies it as one
// undoable step. Slots are global (not per photo) so a look can be reused. ---
const SLOTS = 5;
const slotKey = (i: number) => `ips-look-slot-${i}`;
const slotList = $("slotList") as HTMLDivElement;
const slotEls: { name: HTMLSpanElement; save: HTMLButtonElement; load: HTMLButtonElement }[] = [];

// A saved look is the CREATIVE grade only — no per-shot white balance, exposure
// or denoise — so it drops onto any photo on top of that photo's own balance
// (matching how the built-in Looks behave). Undo/Reset snapshots stay full.
type SavedLook = {
  swapRB: boolean;
  hue: number;
  sat: number;
  contrast: number;
  tint: [number, number, number];
  glow: number;
  sky: [number, number, number];
  foliage: [number, number, number];
  tone: [number, number, number, number, number];
  lum: number;
  clarity: number;
  dehaze: number;
  hsl: number[];
};

function currentLook(): SavedLook {
  return {
    swapRB: params.swapRB,
    hue: params.hue,
    sat: params.sat,
    contrast: params.contrast,
    tint: [...params.tint] as [number, number, number],
    glow: params.glow,
    sky: [...params.sky] as [number, number, number],
    foliage: [...params.foliage] as [number, number, number],
    tone: [...params.tone] as [number, number, number, number, number],
    lum: params.lum,
    clarity: params.clarity,
    dehaze: params.dehaze,
    hsl: [...params.hsl],
  };
}

const tuple3 = (a: unknown, d: [number, number, number]): [number, number, number] =>
  Array.isArray(a) && a.length === 3 ? [+a[0], +a[1], +a[2]] : d;
const numOr = (v: unknown, d: number): number => (typeof v === "number" && isFinite(v) ? v : d);

/** Parse a saved slot, tolerating older full-snapshot slots ({params:{…}}) and
 *  coercing every field so a stale or partial slot can't corrupt the edit. */
function readSlot(i: number): SavedLook | null {
  const raw = localStorage.getItem(slotKey(i));
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const s = o?.params ?? o; // accept {params:{…}} (old full snapshot) or flat
    if (s && Array.isArray(s.tone) && typeof s.sat === "number") {
      return {
        swapRB: !!s.swapRB,
        hue: numOr(s.hue, 0),
        sat: numOr(s.sat, 1),
        contrast: numOr(s.contrast, 1),
        tint: tuple3(s.tint, [1, 1, 1]),
        glow: numOr(s.glow, 0),
        sky: tuple3(s.sky, [0, 1, 1]),
        foliage: tuple3(s.foliage, [0, 1, 1]),
        tone: s.tone.length === 5
          ? [+s.tone[0], +s.tone[1], +s.tone[2], +s.tone[3], +s.tone[4]]
          : [...TONE_DEFAULT],
        lum: numOr(s.lum, 1),
        clarity: numOr(s.clarity, 0),
        dehaze: numOr(s.dehaze, 0),
        hsl: Array.isArray(s.hsl) && s.hsl.length === 24 ? s.hsl.map((x: unknown, i: number) => numOr(x, i % 3 === 0 ? 0 : 1)) : hslDefault(),
      };
    }
  } catch {
    /* corrupt slot — treat as empty */
  }
  return null;
}

function saveSlot(i: number) {
  if (!current) return;
  localStorage.setItem(slotKey(i), JSON.stringify(currentLook()));
  updateSlotUI();
}

function loadSlot(i: number) {
  const look = readSlot(i);
  if (!look || !current) return;
  flushRecord(); // settle current edits
  // Apply the creative grade; keep this photo's white balance, exposure, denoise.
  params.swapRB = look.swapRB;
  params.hue = look.hue;
  params.sat = look.sat;
  params.contrast = look.contrast;
  params.tint = look.tint;
  params.glow = look.glow;
  params.sky = look.sky;
  params.foliage = look.foliage;
  params.tone = look.tone;
  params.lum = look.lum;
  params.clarity = look.clarity;
  params.dehaze = look.dehaze;
  params.hsl = [...look.hsl];
  activeLook = null; // a loaded custom grade isn't one specific built-in look
  clampToneOrder();
  syncToUI();
  updateLookUI();
  draw();
  flushRecord(); // record the load as one atomic undo step
}

function updateSlotUI() {
  for (let i = 0; i < SLOTS; i++) {
    const filled = !!readSlot(i);
    slotEls[i].name.textContent = filled ? `Slot ${i + 1} ✓` : `Slot ${i + 1}`;
    slotEls[i].save.disabled = !current;
    slotEls[i].load.disabled = !filled || !current;
  }
}

for (let i = 0; i < SLOTS; i++) {
  const row = document.createElement("div");
  row.className = "slot";
  const name = document.createElement("span");
  name.className = "slot-name";
  const save = document.createElement("button");
  save.type = "button";
  save.className = "slot-save";
  save.textContent = "Save";
  const load = document.createElement("button");
  load.type = "button";
  load.className = "slot-load";
  load.textContent = "Load";
  save.addEventListener("click", () => saveSlot(i));
  load.addEventListener("click", () => loadSlot(i));
  row.append(name, save, load);
  slotList.append(row);
  slotEls.push({ name, save, load });
}
updateSlotUI(); // reflect any slots saved in a previous session

let raf = 0;
let lastToneKey = "";
function draw() {
  recordSoon();
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const key = params.tone.join(",");
    if (key !== lastToneKey) {
      lastToneKey = key;
      renderer.setToneCurve(params.tone);
    }
    renderer.render(params);
    refreshHistogram(params);
    positionMaskOverlay();
  });
}

// --- Tone-curve widget: five draggable dots (blacks/shadows/mids/whites/
// highlights) mirrored by the sliders below it. ---
const toneSvg = $("toneSvg") as unknown as SVGSVGElement;
// The svg viewBox is padded so the corner dots draw whole (iOS Safari clips
// to the viewBox regardless of CSS overflow). Keep in sync with index.html.
const TONE_VB_MIN = -8;
const TONE_VB_SPAN = 116;
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
    c.setAttribute("r", "5.5");
    c.setAttribute("class", "tone-dot");
    toneSvg.appendChild(c);
    toneDots.push(c);
    c.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const move = (ev: PointerEvent) => {
        const r = toneSvg.getBoundingClientRect();
        // Pointer -> padded viewBox units -> 0..100 plot -> 0..1 value.
        const vb = TONE_VB_MIN + TONE_VB_SPAN * ((ev.clientY - r.top) / Math.max(1, r.height));
        params.tone[i] = 1 - vb / 100;
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
  flushRecord();
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

for (const el of [ui.wbR, ui.wbG, ui.wbB, ui.expo, ui.dn, ui.hue, ui.sat, ui.con, ui.glow, ui.lum,
  ui.hotspot, ui.hotspotSize, ui.vignette, ui.clarity, ui.dehaze,
  ui.skyHue, ui.skySat, ui.skyLum, ui.folHue, ui.folSat, ui.folLum, ...ui.tones]) {
  el.addEventListener("input", syncFromUI);
}

ui.swapBtn.addEventListener("click", () => {
  params.swapRB = !params.swapRB;
  syncToUI();
  updateLookUI();
  draw();
  flushRecord();
});

// Reset the per-color bands to neutral (Auto deliberately doesn't touch them).
$("pcReset").addEventListener("click", () => {
  params.sky = [0, 1, 1];
  params.foliage = [0, 1, 1];
  syncToUI();
  draw();
  flushRecord();
});

// --- 8-channel HSL colour mixer: eight colour chips, three sliders for the
// selected chip. Chips with a non-neutral band get an accent ring. ---
const HSL_NAMES = ["Red", "Orange", "Yellow", "Green", "Aqua", "Blue", "Purple", "Magenta"];
const hslChipsEl = $("hslChips") as HTMLDivElement;
const hslUI = {
  hue: $("hslHue") as HTMLInputElement,
  sat: $("hslSat") as HTMLInputElement,
  lum: $("hslLum") as HTMLInputElement,
};
let hslSel = 0;
const hslChips: HTMLButtonElement[] = [];
for (let i = 0; i < 8; i++) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "hsl-chip";
  b.style.background = `hsl(${HSL_CENTERS[i]}deg 75% 55%)`;
  b.title = HSL_NAMES[i];
  b.setAttribute("aria-label", `${HSL_NAMES[i]} band`);
  b.addEventListener("click", () => {
    hslSel = i;
    updateHslUI();
  });
  hslChipsEl.append(b);
  hslChips.push(b);
}

function updateHslUI() {
  hslChips.forEach((b, i) => {
    b.classList.toggle("active", i === hslSel);
    const tweaked = params.hsl[i * 3] !== 0 || params.hsl[i * 3 + 1] !== 1 || params.hsl[i * 3 + 2] !== 1;
    b.classList.toggle("tweaked", tweaked && i !== hslSel);
  });
  hslUI.hue.value = String(params.hsl[hslSel * 3]);
  hslUI.sat.value = String(params.hsl[hslSel * 3 + 1]);
  hslUI.lum.value = String(params.hsl[hslSel * 3 + 2]);
}

hslUI.hue.addEventListener("input", () => { params.hsl[hslSel * 3] = Number(hslUI.hue.value); updateHslUI(); draw(); });
hslUI.sat.addEventListener("input", () => { params.hsl[hslSel * 3 + 1] = Number(hslUI.sat.value); updateHslUI(); draw(); });
hslUI.lum.addEventListener("input", () => { params.hsl[hslSel * 3 + 2] = Number(hslUI.lum.value); updateHslUI(); draw(); });
$("hslReset").addEventListener("click", () => {
  params.hsl = hslDefault();
  updateHslUI();
  draw();
  flushRecord();
});

// Pick-from-photo: arm, tap the image, and the chip owning that pixel's
// ON-SCREEN hue selects itself (the mixer runs in display space, so the
// displayed hue IS the hue the mixer classifies).
const hslPickBtn = $("hslPick") as HTMLButtonElement;
let hslPickArmed = false;

function setHslPick(on: boolean) {
  hslPickArmed = on;
  hslPickBtn.setAttribute("aria-pressed", String(on));
  if (on) { setTat(false); setColorPick(false); } // picture tools are mutually exclusive
}
hslPickBtn.addEventListener("click", () => setHslPick(!hslPickArmed));

/** Chip index owning a display hue — the band with the majority weight
 *  (same segment blend as hslAt in pipeline.ts). */
function chipForHue(h: number): number {
  h = ((h % 360) + 360) % 360;
  let i = 7;
  for (let k = 0; k < 7; k++) {
    if (h >= HSL_CENTERS[k] && h < HSL_CENTERS[k + 1]) { i = k; break; }
  }
  const c0 = HSL_CENTERS[i];
  const c1 = i === 7 ? 360 : HSL_CENTERS[i + 1];
  const t = (h - c0) / (c1 - c0);
  return t * t * (3 - 2 * t) < 0.5 ? i : (i + 1) % 8;
}

/** Handle an armed pick tap. Returns true when it consumed the tap. */
function handleHslPick(clientX: number, clientY: number): boolean {
  if (!hslPickArmed) return false;
  setHslPick(false); // one-shot
  const px = renderer.readDisplayedPixel(clientX, clientY);
  if (!px) return true;
  const [r, g, b] = px;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (d >= 4) { // ignore near-grey taps (no meaningful hue)
    let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
    hslSel = chipForHue(h);
    updateHslUI();
  }
  return true;
}
updateHslUI();

// --- Local masks: radial / linear gradient with a few local adjustments,
// placed by dragging handles on the photo. Geometry is in image-uv so masks
// stay glued to the subject through zoom/pan/rotation. ---
const SVGNS = "http://www.w3.org/2000/svg";
const maskOverlay = $("maskOverlay") as unknown as SVGSVGElement;
const maskList = $("maskList") as HTMLDivElement;
const maskEditor = $("maskEditor") as HTMLDivElement;
const addRadialBtn = $("addRadial") as HTMLButtonElement;
const addLinearBtn = $("addLinear") as HTMLButtonElement;
const addBrushBtn = $("addBrush") as HTMLButtonElement;
const addColorBtn = $("addColor") as HTMLButtonElement;
const addSkyBtn = $("addSky") as HTMLButtonElement;
const mUI = {
  brightness: $("mBrightness") as HTMLInputElement,
  contrast: $("mContrast") as HTMLInputElement,
  sat: $("mSat") as HTMLInputElement,
  hue: $("mHue") as HTMLInputElement,
  warmth: $("mWarmth") as HTMLInputElement,
  feather: $("mFeather") as HTMLInputElement,
  featherRow: $("mFeatherRow") as HTMLElement,
  invert: $("mInvert") as HTMLButtonElement,
  brushControls: $("brushControls") as HTMLElement,
  paint: $("mPaint") as HTMLButtonElement,
  erase: $("mErase") as HTMLButtonElement,
  brushSize: $("mBrushSize") as HTMLInputElement,
  clearBrush: $("mClearBrush") as HTMLButtonElement,
  colorControls: $("colorControls") as HTMLElement,
  colorPick: $("mColorPick") as HTMLButtonElement,
  colorRange: $("mColorRange") as HTMLInputElement,
  colorSwatch: $("mColorSwatch") as HTMLElement,
  colorSwatchText: $("mColorSwatchText") as HTMLElement,
  skyControls: $("skyControls") as HTMLElement,
  skyReach: $("mSkyReach") as HTMLInputElement,
  skyStatus: $("mSkyStatus") as HTMLElement,
};
const BRUSH_MAX_EDGE = 384; // working resolution of the painted mask bitmap
let selectedMask = -1;
let overlayHandles: { el: SVGCircleElement; role: string }[] = [];
let overlayShape: SVGPolygonElement | SVGLineElement | null = null;

function currentMask(): MaskLayer | null {
  return selectedMask >= 0 && selectedMask < params.masks.length ? params.masks[selectedMask] : null;
}

function addMask(type: 0 | 1 | 2 | 3 | 4) {
  if (!current || params.masks.length >= MAX_MASKS) return;
  const m = neutralMask(type);
  // A gentle default so a fresh mask does something. Colour and sky masks lean
  // on saturation (the owner's taste — make the matched area pop).
  if (type === 3 || type === 4) m.saturation = type === 4 ? 1.3 : 1.4;
  else m.brightness = type === 1 ? 1.15 : 1.25;
  if (type === 2) {
    const s = Math.min(1, BRUSH_MAX_EDGE / Math.max(current.width, current.height));
    const bw = Math.max(1, Math.round(current.width * s));
    const bh = Math.max(1, Math.round(current.height * s));
    m.brush = { w: bw, h: bh, data: new Uint8Array(bw * bh) };
    mUI.paint.setAttribute("aria-pressed", "true"); // start ready to paint
    mUI.erase.setAttribute("aria-pressed", "false");
  }
  if (type === 4) regenerateSkyMask(m); // detect the sky now (fills m.brush)
  params.masks.push(m);
  selectedMask = params.masks.length - 1;
  updateMaskUI();
  renderMaskOverlay();
  if (type === 3) setColorPick(true); // arm the tap-to-pick target immediately
  draw();
  flushRecord();
}

// Sky mask (type 4): run the classical heuristic on the current image and bake
// the result into the mask's bitmap (the brush path samples it — no shader
// change). WB is the AUTO gray-world balance (not the live edit) so the
// selection never drifts as the photo is graded. Copy-on-write: always assign a
// FRESH buffer (undo snapshots share the old one) and bump `rev`.
function regenerateSkyMask(m: MaskLayer) {
  if (!current) return;
  const res = buildSkyMask(
    (x, y) => linearAt(current!, x, y),
    current.width,
    current.height,
    renderer.rotation,
    current.camMatrix ?? null,
    grayWorldWB(current),
    BRUSH_MAX_EDGE,
    m.reach ?? 1,
    m.feather,
  );
  m.brush = res.mask; // fresh buffer from buildSkyMask — safe for copy-on-write
  m.rev = (m.rev ?? 0) + 1;
}

/** Sky-mask status line, read straight from the generated bitmap so it is
 *  accurate per mask: coverage of texels the mask actually selects. Near-zero
 *  coverage means the heuristic found no sky — keep the label honest and point
 *  at the manual alternatives instead of pretending. */
function updateSkyStatus() {
  const m = currentMask();
  if (!m || m.type !== 4 || !m.brush) return;
  const d = m.brush.data;
  let on = 0;
  for (let i = 0; i < d.length; i++) if (d[i] > 127) on++;
  const frac = d.length ? on / d.length : 0;
  mUI.skyStatus.textContent = frac < 0.005
    ? "No clear sky found — try a Brush or Colour mask, or raise Reach."
    : `Sky detected — ${Math.round(frac * 100)}% of the frame. Invert for everything but the sky.`;
}

function deleteMask(i: number) {
  params.masks.splice(i, 1);
  if (selectedMask >= params.masks.length) selectedMask = params.masks.length - 1;
  updateMaskUI();
  renderMaskOverlay();
  draw();
  flushRecord();
}

function selectMask(i: number) {
  selectedMask = i;
  setColorPick(false); // arming is per-mask; disarm when the selection changes
  updateMaskUI();
  renderMaskOverlay();
}

function updateMaskUI() {
  maskList.replaceChildren(
    ...params.masks.map((m, i) => {
      const row = document.createElement("div");
      row.className = "mask-row";
      const pick = document.createElement("button");
      pick.type = "button";
      pick.className = "mask-pick" + (i === selectedMask ? " active" : "");
      const label = m.type === 0 ? "Radial" : m.type === 1 ? "Gradient" : m.type === 2 ? "Brush" : m.type === 3 ? "Colour" : "Sky";
      pick.textContent = `${label} ${i + 1}`;
      pick.addEventListener("click", () => selectMask(i));
      const del = document.createElement("button");
      del.type = "button";
      del.className = "mask-del";
      del.textContent = "×";
      del.setAttribute("aria-label", "Delete mask");
      del.addEventListener("click", () => deleteMask(i));
      row.append(pick, del);
      return row;
    }),
  );
  const m = currentMask();
  maskEditor.hidden = !m;
  const full = !current || params.masks.length >= MAX_MASKS;
  addRadialBtn.disabled = full;
  addLinearBtn.disabled = full;
  addBrushBtn.disabled = full;
  addColorBtn.disabled = full;
  addSkyBtn.disabled = full;
  if (m) {
    mUI.brightness.value = String(m.brightness);
    mUI.contrast.value = String(m.contrast);
    mUI.sat.value = String(m.saturation);
    mUI.hue.value = String(m.hue);
    mUI.warmth.value = String(m.warmth);
    mUI.feather.value = String(m.feather);
    // Feather is the soft edge for radial, colour AND sky masks (transition width).
    mUI.featherRow.hidden = m.type !== 0 && m.type !== 3 && m.type !== 4;
    mUI.brushControls.hidden = m.type !== 2;
    mUI.colorControls.hidden = m.type !== 3;
    mUI.skyControls.hidden = m.type !== 4;
    if (m.type === 3) {
      mUI.colorRange.value = String(m.colorRange);
      updateColorSwatch(m);
    }
    if (m.type === 4) {
      mUI.skyReach.value = String(m.reach);
      updateSkyStatus();
    }
    mUI.invert.setAttribute("aria-pressed", String(m.invert));
  }
  // If the armed pick's mask vanished under it (undo, delete, photo switch),
  // disarm so the banner never lies about what a tap will do.
  if (colorPickArmed && (!m || m.type !== 3)) setColorPick(false);
}

/** Reflect the tapped target colour on the swatch + label. The swatch shows
 *  the ACTUAL tapped colour (hue/sat drive the key; valTarget is kept for
 *  exactly this), so "did it grab what I touched" is answerable at a glance. */
function updateColorSwatch(m: MaskLayer) {
  const picked = m.satTarget >= 0;
  if (picked) {
    const [r, g, b] = hsv2rgb(m.hueTarget, Math.min(1, m.satTarget), m.valTarget ?? 0.75);
    mUI.colorSwatch.style.background = `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  } else {
    mUI.colorSwatch.style.background = "#3a3a42";
  }
  mUI.colorSwatchText.textContent = picked
    ? `Hue ${Math.round(m.hueTarget)}° · Sat ${m.satTarget.toFixed(2)}`
    : "Tap the photo to pick a colour";
}

function syncMaskFromUI() {
  const m = currentMask();
  if (!m) return;
  const newFeather = Number(mUI.feather.value);
  // A sky mask bakes its feather into the bitmap, so a feather change means a
  // regenerate — but ONLY when it actually moved (this handler also fires for
  // brightness/sat/etc., which don't touch the bitmap).
  const skyNeedsRebuild = m.type === 4 && m.feather !== newFeather;
  m.brightness = Number(mUI.brightness.value);
  m.contrast = Number(mUI.contrast.value);
  m.saturation = Number(mUI.sat.value);
  m.hue = Number(mUI.hue.value);
  m.warmth = Number(mUI.warmth.value);
  m.feather = newFeather;
  m.colorRange = Number(mUI.colorRange.value);
  if (skyNeedsRebuild) { regenerateSkyMask(m); updateSkyStatus(); }
  draw();
  positionMaskOverlay(); // feather changes the outline
}

for (const el of [mUI.brightness, mUI.contrast, mUI.sat, mUI.hue, mUI.warmth, mUI.feather, mUI.colorRange]) {
  el.addEventListener("input", syncMaskFromUI);
}
// Sky "Reach" scales the detection tolerances — regenerate the bitmap on drag
// (cheap at the brush working resolution; one gesture coalesces to one undo
// step via draw()'s debounce, like every other mask slider).
mUI.skyReach.addEventListener("input", () => {
  const m = currentMask();
  if (!m || m.type !== 4) return;
  m.reach = Number(mUI.skyReach.value);
  regenerateSkyMask(m);
  updateSkyStatus();
  draw();
});
mUI.invert.addEventListener("click", () => {
  const m = currentMask();
  if (!m) return;
  m.invert = !m.invert;
  mUI.invert.setAttribute("aria-pressed", String(m.invert));
  draw();
  flushRecord();
});
$("mDelete").addEventListener("click", () => { if (selectedMask >= 0) deleteMask(selectedMask); });
addRadialBtn.addEventListener("click", () => addMask(0));
addLinearBtn.addEventListener("click", () => addMask(1));
addColorBtn.addEventListener("click", () => addMask(3));
addSkyBtn.addEventListener("click", () => addMask(4));

// Colour-mask target pick: arm, then tap the photo and the mask keys on that
// colour. SUSTAINED (the TAT lesson): while armed, EVERY tap re-picks and a
// standing banner owns the moment — the mode never silently hands the canvas
// back to tap-WB. (The first cut was one-shot: it disarmed after the tap, so
// tapping a second colour set WHITE BALANCE and visually nuked the grade —
// field bug 2026-07-05.) Exit via the button, the banner, or selecting
// another mask. Reads the key-space colour via readColorKeyPixel — exactly
// what the shader/CPU key compares against, so the colour you touch selects
// itself.
const colorBanner = $("colorBanner") as HTMLButtonElement;
let colorPickArmed = false;
function setColorPick(on: boolean) {
  const m = currentMask();
  colorPickArmed = on && !!m && m.type === 3;
  mUI.colorPick.setAttribute("aria-pressed", String(colorPickArmed));
  colorBanner.hidden = !colorPickArmed;
  if (colorPickArmed) { setHslPick(false); setTat(false); } // picture tools are exclusive
}
mUI.colorPick.addEventListener("click", () => setColorPick(!colorPickArmed));
colorBanner.addEventListener("click", () => setColorPick(false)); // tap the banner to exit

/** Handle an armed colour-mask target tap. Returns true when it consumed it. */
function handleColorMaskPick(clientX: number, clientY: number): boolean {
  if (!colorPickArmed) return false;
  const m = currentMask();
  if (!m || m.type !== 3) { setColorPick(false); return true; } // stale arm (undo etc.)
  const [uu, vv] = renderer.clientToImageUv(clientX, clientY);
  const px = renderer.readColorKeyPixel(params, uu, vv);
  if (px) {
    // Store the target from the SAME chroma-plane projection the key uses, so a
    // pixel of the tapped colour lands exactly on the target (hueTarget = angle,
    // satTarget = radius = HSV saturation). chromaVec takes any RGB scale.
    const [cx, cy] = chromaVec(px[0], px[1], px[2]);
    let h = (Math.atan2(cy, cx) * 180) / Math.PI;
    if (h < 0) h += 360;
    m.hueTarget = h;
    m.satTarget = Math.hypot(cx, cy);
    m.valTarget = Math.max(px[0], px[1], px[2]) / 255; // swatch cosmetics only
    updateColorSwatch(m);
    draw();
    flushRecord(); // each re-pick is one undo step (deduped when unchanged)
  }
  return true; // stays armed — tap again to re-pick, banner/button to exit
}

function mkHandle(role: string): SVGCircleElement {
  const c = document.createElementNS(SVGNS, "circle");
  c.setAttribute("r", "9");
  c.setAttribute("class", "mask-handle");
  attachHandleDrag(c, role);
  overlayHandles.push({ el: c, role });
  return c;
}

// (Re)build the overlay element set for the selected mask. Cheap, but only call
// when the SET of elements changes (select/add/delete/type) — NOT during a drag,
// which would destroy the element holding the pointer capture.
function renderMaskOverlay() {
  const m = currentMask();
  // Brush, colour and sky masks have no geometry handles — the paint / the
  // colour key / the detected region itself is the feedback. Only radial (0)
  // and linear (1) masks draw a handle overlay.
  const showable = !!current && !panel.hidden && welcome.hidden && !!m && (m.type === 0 || m.type === 1);
  maskOverlay.toggleAttribute("hidden", !showable);
  overlayHandles = [];
  overlayShape = null;
  if (!showable || !m) {
    maskOverlay.replaceChildren();
    return;
  }
  const kids: SVGElement[] = [];
  if (m.type === 0) {
    overlayShape = document.createElementNS(SVGNS, "polygon");
    overlayShape.setAttribute("class", "mask-shape");
    kids.push(overlayShape, mkHandle("center"), mkHandle("rx"), mkHandle("ry"));
  } else {
    overlayShape = document.createElementNS(SVGNS, "line");
    overlayShape.setAttribute("class", "mask-line");
    kids.push(overlayShape, mkHandle("start"), mkHandle("end"));
  }
  maskOverlay.replaceChildren(...kids);
  positionMaskOverlay();
}

// Reposition existing overlay elements from the current geometry + live rect.
// Safe to call every frame and mid-drag (no element churn).
function positionMaskOverlay() {
  const m = currentMask();
  if (!m || maskOverlay.hasAttribute("hidden")) return;
  const rect = maskOverlay.getBoundingClientRect();
  const loc = (u: number, v: number): [number, number] => {
    const [x, y] = renderer.imageUvToClient(u, v);
    return [x - rect.left, y - rect.top];
  };
  if (m.type === 0 && overlayShape) {
    const pts: string[] = [];
    for (let a = 0; a <= 48; a++) {
      const t = (a / 48) * Math.PI * 2;
      const [x, y] = loc(m.cx + m.rx * Math.cos(t), m.cy + m.ry * Math.sin(t));
      pts.push(`${x.toFixed(1)},${y.toFixed(1)}`);
    }
    (overlayShape as SVGPolygonElement).setAttribute("points", pts.join(" "));
  } else if (overlayShape) {
    const [x0, y0] = loc(m.cx, m.cy);
    const [x1, y1] = loc(m.lx, m.ly);
    overlayShape.setAttribute("x1", String(x0));
    overlayShape.setAttribute("y1", String(y0));
    overlayShape.setAttribute("x2", String(x1));
    overlayShape.setAttribute("y2", String(y1));
  }
  for (const h of overlayHandles) {
    let u = m.cx, v = m.cy;
    if (h.role === "rx") { u = m.cx + m.rx; v = m.cy; }
    else if (h.role === "ry") { u = m.cx; v = m.cy + m.ry; }
    else if (h.role === "end") { u = m.lx; v = m.ly; }
    const [x, y] = loc(u, v);
    h.el.setAttribute("cx", String(x));
    h.el.setAttribute("cy", String(y));
  }
}

function attachHandleDrag(el: SVGCircleElement, role: string) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const m = currentMask();
      if (!m) return;
      const [uu, vv] = renderer.clientToImageUv(ev.clientX, ev.clientY);
      const u = clamp(uu, 0, 1), v = clamp(vv, 0, 1);
      if (role === "center" || role === "start") { m.cx = u; m.cy = v; }
      else if (role === "rx") m.rx = clamp(Math.abs(u - m.cx), 0.02, 1.5);
      else if (role === "ry") m.ry = clamp(Math.abs(v - m.cy), 0.02, 1.5);
      else if (role === "end") { m.lx = u; m.ly = v; }
      positionMaskOverlay();
      draw();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      flushRecord();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
}

// --- Brush painting: with Paint on, drag on the photo to paint into the
// selected brush mask (or Erase). Interpolates between moves for smooth
// strokes; one stroke = one undo step. ---
let painting = false;
let lastPaintUv: [number, number] | null = null;

function brushPaintOn(): boolean {
  const m = currentMask();
  return !!m && m.type === 2 && mUI.paint.getAttribute("aria-pressed") === "true";
}
function brushRadiusPx(): number {
  const m = currentMask();
  if (!m || !m.brush) return 8;
  return Math.max(1, Number(mUI.brushSize.value) * Math.max(m.brush.w, m.brush.h));
}
function stampBrush(u: number, v: number) {
  const m = currentMask();
  if (!m || !m.brush) return;
  const b = m.brush;
  const erase = mUI.erase.getAttribute("aria-pressed") === "true";
  const r = brushRadiusPx();
  const cx = clamp(u, 0, 1) * (b.w - 1);
  const cy = clamp(v, 0, 1) * (b.h - 1);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(b.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(b.h - 1, Math.ceil(cy + r));
  const hard = 0.55; // solid inner fraction, soft to the edge
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1) continue;
      let fall = 1;
      if (d > hard) { const t = (d - hard) / (1 - hard); fall = 1 - t * t * (3 - 2 * t); }
      const idx = y * b.w + x;
      const amt = fall * 255;
      b.data[idx] = erase ? Math.max(0, b.data[idx] - amt) : Math.min(255, Math.max(b.data[idx], amt));
    }
  }
  m.rev = (m.rev ?? 0) + 1;
}
function paintStroke(u: number, v: number) {
  const m = currentMask();
  if (!m || !m.brush) return;
  if (lastPaintUv) {
    const [lu, lv] = lastPaintUv;
    const distPx = Math.hypot((u - lu) * (m.brush.w - 1), (v - lv) * (m.brush.h - 1));
    const step = Math.max(1, brushRadiusPx() * 0.3);
    const n = Math.max(1, Math.ceil(distPx / step));
    for (let k = 1; k <= n; k++) stampBrush(lu + (u - lu) * (k / n), lv + (v - lv) * (k / n));
  } else {
    stampBrush(u, v);
  }
  lastPaintUv = [u, v];
  draw();
}
function startPaint(e: PointerEvent) {
  painting = true;
  tapSuppressed = true; // don't also fire a tap-to-WB after the stroke
  canvas.setPointerCapture(e.pointerId);
  lastPaintUv = null;
  // Copy-on-write: undo snapshots share this brush's buffer, so give the live
  // mask a fresh copy before the stroke mutates it — history stays intact.
  const m = currentMask();
  if (m?.brush) m.brush = { w: m.brush.w, h: m.brush.h, data: new Uint8Array(m.brush.data) };
  const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
  paintStroke(u, v);
}
function endPaint() {
  if (!painting) return;
  painting = false;
  lastPaintUv = null;
  flushRecord();
}

const toggleAttr = (el: HTMLElement) => el.setAttribute("aria-pressed", String(el.getAttribute("aria-pressed") !== "true"));
mUI.paint.addEventListener("click", () => toggleAttr(mUI.paint));
mUI.erase.addEventListener("click", () => toggleAttr(mUI.erase));
mUI.clearBrush.addEventListener("click", () => {
  const m = currentMask();
  if (!m || !m.brush) return;
  // Fresh buffer, not fill(0) — snapshots may share the old one (copy-on-write).
  m.brush = { w: m.brush.w, h: m.brush.h, data: new Uint8Array(m.brush.w * m.brush.h) };
  m.rev = (m.rev ?? 0) + 1;
  draw();
  flushRecord();
});
addBrushBtn.addEventListener("click", () => addMask(2));

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
  const p = on ? origParams : params;
  renderer.render(p);
  refreshHistogram(p);
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
window.addEventListener("resize", positionMaskOverlay);

// Rotate 90° clockwise per tap. Applies to the preview and the export.
$("rotateBtn").addEventListener("click", () => {
  if (!current) return;
  renderer.setRotation(renderer.rotation + 1);
  resetZoom();
  // A sky mask keys off the display-top edge, so a rotation re-detects it to
  // stay glued to the sky in the new orientation.
  let rebuilt = false;
  for (const m of params.masks) if (m.type === 4) { regenerateSkyMask(m); rebuilt = true; }
  if (rebuilt) updateSkyStatus();
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
    positionMaskOverlay();
    return;
  }
  // Keep the image from being flung entirely off-screen.
  const maxX = (canvas.clientWidth * (zoom - 1)) / 2 + 60;
  const maxY = (canvas.clientHeight * (zoom - 1)) / 2 + 60;
  panX = clamp(panX, -maxX, maxX);
  panY = clamp(panY, -maxY, maxY);
  canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  positionMaskOverlay();
}

function resetZoom() {
  zoom = 1;
  applyZoom();
}

canvas.style.transformOrigin = "center center";

// --- Drag on photo to adjust (Lightroom-style targeted adjustment): arm the
// tool, then drag on the image. The colour under your finger picks its mixer
// chip (the same eight bands the chips drive); dragging UP/DOWN scales that
// colour's LUMINANCE, LEFT/RIGHT shifts its HUE. It steers params.hsl straight
// from the picture — no new pipeline math, just the mixer from the photo. While
// armed it takes over the canvas (no tap-WB / pan / pinch / hold), so it stays
// a deliberate mode you toggle off, and one drag commits one undo step. ---
const hslDragBtn = $("hslDrag") as HTMLButtonElement;
const tatHud = $("tatHud") as HTMLDivElement;
const tatSwatch = $("tatSwatch") as HTMLSpanElement;
const tatText = $("tatText") as HTMLSpanElement;
const tatBanner = $("tatBanner") as HTMLButtonElement;
const TAT_HUE_SPAN = 100; // degrees of hue shift across one full canvas-width drag
const TAT_LUM_SPAN = 1.6; // luminance-scale change across one full canvas-height drag
let tatArmed = false;
let tatDrag: { id: number; chip: number; x: number; y: number; hue0: number; lum0: number; w: number; h: number } | null = null;

function setTat(on: boolean) {
  tatArmed = on;
  hslDragBtn.setAttribute("aria-pressed", String(on));
  // A standing banner (not the transient drag readout) makes it obvious the
  // canvas is in adjust mode and how to hand it back to tap-WB / pan / pinch.
  tatBanner.hidden = !on;
  if (on) { setHslPick(false); setColorPick(false); } // mutually exclusive with the other picture tools
  if (!on) hideTatHud();
}
hslDragBtn.addEventListener("click", () => setTat(!tatArmed));
tatBanner.addEventListener("click", () => setTat(false)); // tap the banner to exit

function showTatHud() {
  if (!tatDrag) return;
  const c = tatDrag.chip;
  tatSwatch.style.background = `hsl(${HSL_CENTERS[c]}deg 75% 55%)`;
  const hue = params.hsl[c * 3];
  const lum = params.hsl[c * 3 + 2];
  tatText.textContent = `${HSL_NAMES[c]} · Hue ${hue > 0 ? "+" : ""}${hue}° · Lum ${lum.toFixed(2)}`;
  tatHud.hidden = false;
}
function hideTatHud() {
  tatHud.hidden = true;
}

function startTat(e: PointerEvent) {
  // Pick the owning chip from the colour BEFORE the mixer (render this pixel
  // with the mixer neutral). That colour doesn't move as you push a chip, so
  // touching the same spot again grabs the SAME chip and keeps building on its
  // current values — and it's the chip that actually controls that area (the
  // mixer shifts the underlying hue, so the shifted display colour would point
  // at a different, wrong chip). Near-grey has no hue -> keep the current chip.
  const [uu, vv] = renderer.clientToImageUv(e.clientX, e.clientY);
  const px = renderer.readUvPixel({ ...params, hsl: hslDefault() }, uu, vv);
  let chip = hslSel;
  if (px) {
    const [r, g, b] = px;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (d >= 4) {
      let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
      chip = chipForHue(h);
    }
  }
  hslSel = chip;
  updateHslUI();
  const rect = canvas.getBoundingClientRect();
  tatDrag = {
    id: e.pointerId,
    chip,
    x: e.clientX,
    y: e.clientY,
    hue0: params.hsl[chip * 3],
    lum0: params.hsl[chip * 3 + 2],
    w: Math.max(1, rect.width),
    h: Math.max(1, rect.height),
  };
  tapSuppressed = true; // never also fire tap-to-WB after the drag
  canvas.setPointerCapture(e.pointerId);
  showTatHud();
}

function moveTat(e: PointerEvent) {
  if (!tatDrag || e.pointerId !== tatDrag.id) return;
  const dx = e.clientX - tatDrag.x;
  const dy = e.clientY - tatDrag.y; // screen-down is positive
  // Match the mixer sliders' own resolution: hue integer, luminance to 0.01.
  const hue = clamp(Math.round(tatDrag.hue0 + (dx / tatDrag.w) * TAT_HUE_SPAN), -60, 60);
  const lum = clamp(Math.round((tatDrag.lum0 - (dy / tatDrag.h) * TAT_LUM_SPAN) * 100) / 100, 0.3, 1.7);
  params.hsl[tatDrag.chip * 3] = hue;
  params.hsl[tatDrag.chip * 3 + 2] = lum;
  updateHslUI();
  showTatHud();
  draw();
}

function endTat() {
  if (!tatDrag) return;
  tatDrag = null;
  hideTatHud();
  flushRecord(); // one drag = one undo step
}

canvas.addEventListener("pointerdown", (e) => {
  if (brushPaintOn()) { e.preventDefault(); startPaint(e); return; }
  if (tatArmed) { if (!tatDrag) { e.preventDefault(); startTat(e); } return; }
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
  if (painting) {
    const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
    paintStroke(u, v);
    return;
  }
  if (tatDrag) { moveTat(e); return; }
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
  if (painting) { endPaint(); return; }
  if (tatDrag) { if (e.pointerId === tatDrag.id) endTat(); return; }
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
const welcomeBack = $("welcomeBack") as HTMLButtonElement;
const lesson = $("lesson") as HTMLDivElement;
const lessonShow = $("lessonShow") as HTMLButtonElement;

// Navigation escape hatch. The old flows assumed the next action would always
// carry you where you needed to go — but after Resume (or any open) the only
// way off the photo was the session's Done, which ENDS it. Home returns to the
// start screen WITHOUT ending anything: the photo/session stays live in memory
// (and in storage), so the return button — or a reload's Resume — drops you
// right back. This is also what the header's Tutorials button does (the start
// screen is where the examples live), so both share goHome().
function goHome() {
  captureActiveEdit(); // park any in-flight edit before leaving the photo
  welcome.hidden = false;
  hint.hidden = !!current; // the tagline is for a cold start, not a return
  histWrap.hidden = true; // keep the histogram from floating over the card
  // The session strip sits above the welcome card (z-index) — hide it while the
  // start screen is up; returnToEditor()/an open flow bring it back.
  sessionStrip.hidden = true;
  stageEl.classList.remove("has-session");
  updateWelcomeReturn();
  updateSessionResume();
  renderMaskOverlay(); // hide the mask overlay while the card is up
}

/** Show/label the return controls (corner ✕ + the prominent Back button) only
 *  when there's a live photo or session to go back to. */
function updateWelcomeReturn() {
  const real = sessionPhotos.filter((p) => p.id !== "lone").length;
  welcomeClose.hidden = !current;
  welcomeBack.hidden = !current;
  welcomeBack.textContent = real >= 2 ? `‹ Back to your session (${real} photos)` : "‹ Back to your photo";
}

/** Leave the start screen and return to the live photo/session, restoring the
 *  session strip and stage sizing. */
function returnToEditor() {
  welcome.hidden = true;
  updateHistVisibility();
  updateSessionStrip(); // repaint + reshow the strip for a live session
  renderMaskOverlay();
}

$("homeBtn").addEventListener("click", goHome);
$("examplesBtn").addEventListener("click", goHome);
welcomeClose.addEventListener("click", returnToEditor);
welcomeBack.addEventListener("click", returnToEditor);

/** Show an already-decoded image: upload it, build its reference maps and set
 *  the view. Does NOT touch the edit — callers follow with either a fresh
 *  baseline (establishFreshEdit) or a restored one (restoreLiveEdit). Shared by
 *  the single-open path, the example loader and session photo-switching. */
function showDecoded(img: DecodedImage, imported: ImportedFile) {
  current = img;
  currentFile = imported;
  // Corrects img.pixels in place (if a profile applies) before anything below
  // reads them — the GPU texture upload, and the glow/local reference maps.
  // (initHotspot uploads its own texture when it corrects; this call is the
  // only one for RAW / unavailable-profile photos, and a harmless repeat
  // upload otherwise.)
  initHotspot(img, imported);
  renderer.setImage(toPreview(img));
  renderer.setRotation(img.rotate ?? 0);
  resetZoom();
  renderer.setGlowMap(buildGlowMap((x, y) => linearAt(img, x, y), img.width, img.height));
  renderer.setLocalMap(buildLocalMap((x, y) => linearAt(img, x, y), img.width, img.height));
  panel.hidden = false;
  welcome.hidden = true;
  lesson.hidden = true;
  lessonShow.hidden = true;
  updateHistVisibility();
}

/** Reset the live edit to this photo's fresh automatic baseline (white balance,
 *  exposure, denoise), clear masks and undo history, and record the baseline as
 *  the Reset target. Assumes `current` is the freshly-decoded image. */
function establishFreshEdit() {
  const img = current!;
  // EVERY open starts from a fresh automatic baseline (white balance,
  // exposure, denoise) — raw or JPEG alike.
  autoAdjust(img);
  syncToUI();
  // Snapshot the as-imported baseline for press-and-hold comparison.
  origParams = {
    wb: [...params.wb] as [number, number, number],
    exposure: params.exposure,
    denoise: params.denoise,
    swapRB: false,
    hue: 0,
    sat: 1,
    contrast: 1,
    tint: [1, 1, 1],
    glow: 0,
    sky: [0, 1, 1],
    foliage: [0, 1, 1],
    tone: [...TONE_DEFAULT],
    lum: 1,
    masks: [],
    hotspot: 0,
    hotspotSize: 0.5,
    vignette: 0,
    clarity: 0,
    dehaze: 0,
    hsl: hslDefault(),
  };
  activeLook = null;
  updateLookUI();
  // Tidy the panel for the new photo: everything folded, scrolled to the top.
  document.querySelectorAll<HTMLFieldSetElement>("#panel fieldset").forEach((fs) => fs.classList.add("collapsed"));
  panel.scrollTop = 0;
  // Masks are composition-specific — never carry them to a new photo.
  params.masks = [];
  selectedMask = -1;
  setColorPick(false);
  updateMaskUI();
  renderMaskOverlay();
  syncFromUI();
  // Fresh photo: snapshot the automatic baseline (the Reset target) and start
  // a clean undo history. Do this AFTER syncFromUI so the baseline is exactly
  // what the user first sees.
  baseline = snapshot();
  settled = snapshot();
  undoStack.length = 0;
  clearTimeout(recordTimer);
  recordTimer = 0;
  updateEditButtons();
  updateSlotUI();
  requestAnimationFrame(updateScrollCues);
}

/** Decode and show one image with a fresh baseline. Ephemeral — used by the
 *  example lessons, which are not part of a saved session. */
async function openImported(imported: ImportedFile) {
  const img = await decode(imported);
  showDecoded(img, imported);
  establishFreshEdit();
}

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files ?? []);
  fileInput.value = ""; // allow re-picking the same file(s) later
  if (!files.length) return;
  try {
    await openPicked(files);
  } catch (err) {
    welcome.hidden = false;
    hint.hidden = false;
    hint.textContent = "Could not open this file: " + (err as Error).message;
    updateWelcomeReturn();
  }
});

// --- Photo sessions -------------------------------------------------------
// "Open image" takes one or several. Pick SEVERAL and the set becomes the
// current session: a strip of big tappable previews you switch between, each
// photo keeping its own edit while you move around. It is NOT a library — it's
// impermanent by design, but it can't get lost too soon: each photo's SOURCE
// bytes are copied into our own storage the moment it's opened (iPad Safari
// can't re-open a picked File after a reload), so a close or crash offers the
// whole session back on relaunch. An explicit Done ends it and frees the space.
//
// A LONE open (one file) stays snappy and ephemeral, exactly as before — the
// session machinery (strip, persistence, resume) engages only from two photos
// up, where switching and crash-survival actually matter.

interface SessionPhoto {
  id: string;
  name: string;
  kind: ImageKind;
  size: number; // source bytes
  edit: string | null; // stored edit JSON (from resume); once visited, liveEdits wins
  thumbUrl: string; // object URL for the strip preview
}

/** The live, in-memory edit for one photo — kept so switching back within a
 *  session restores its FULL state (masks included) and undo history. Lost on
 *  reload; the durable copy (Session.setEdit, masks stripped) survives. */
interface LiveEdit {
  snapshot: Snapshot;
  baseline: Snapshot;
  settled: Snapshot;
  undo: Snapshot[];
  orig: EditParams | null;
}

let sessionPhotos: SessionPhoto[] = [];
let activePhotoId: string | null = null;
let nextOrder = 0;
const liveEdits = new Map<string, LiveEdit>();

const stageEl = $("stage") as HTMLDivElement;
const sessionStrip = $("sessionStrip") as HTMLDivElement;
const sessionThumbs = $("sessionThumbs") as HTMLDivElement;
const sessionMeta = $("sessionMeta") as HTMLSpanElement;
const sessionDone = $("sessionDone") as HTMLButtonElement;

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

/** Session-mode edits (WB / exposure / grade …) persist per photo; masks are
 *  spatial/composition-specific, so — like a fresh open — they're dropped from
 *  the durable copy and reset on reload. */
function editToJson(): string {
  const s = snapshot();
  return JSON.stringify({ params: { ...s.params, masks: [] }, activeLook: s.activeLook, lookBias: s.lookBias });
}

/** Capture the active photo's live edit into memory and persist a durable copy
 *  (fire-and-forget — the row is small and strict-durable). */
function captureActiveEdit() {
  if (!activePhotoId) return;
  flushRecord(); // settle any in-flight slider drag first
  const id = activePhotoId;
  liveEdits.set(id, {
    snapshot: snapshot(),
    baseline: baseline ?? snapshot(),
    settled: settled ?? snapshot(),
    undo: [...undoStack],
    orig: origParams,
  });
  const json = editToJson();
  const view = sessionPhotos.find((p) => p.id === id);
  if (view) view.edit = json;
  Session.setEdit(id, json).catch(() => {});
}

/** Restore a photo's full in-memory edit state onto the live editor. */
function restoreLiveEdit(st: LiveEdit) {
  undoStack.length = 0;
  undoStack.push(...st.undo);
  baseline = st.baseline;
  settled = st.settled;
  origParams = st.orig;
  clearTimeout(recordTimer);
  recordTimer = 0;
  applySnapshot(st.snapshot); // repaints + syncs UI
  updateEditButtons();
  updateSlotUI();
  requestAnimationFrame(updateScrollCues);
}

/** Make `current` (already decoded + shown) the active photo, restoring its
 *  live edit if we have one, else establishing a fresh baseline and layering
 *  any durably-stored edit (from a resumed session) on top. */
function activateCurrent(id: string) {
  const st = liveEdits.get(id);
  // Set the active id BEFORE any capture below, so seeding this photo's entry
  // targets THIS photo — not the one we just switched away from.
  activePhotoId = id;
  if (st) {
    restoreLiveEdit(st);
  } else {
    establishFreshEdit();
    const view = sessionPhotos.find((p) => p.id === id);
    if (view?.edit) {
      try {
        applySnapshot(JSON.parse(view.edit) as Snapshot);
      } catch {
        /* corrupt stored edit — keep the fresh baseline */
      }
    }
    captureActiveEdit(); // seed liveEdits for this photo (also persists, no-op change)
  }
  updateSessionStrip();
}

/** Switch the editor to another session photo (decoded on demand from storage,
 *  so only ever one photo's pixels are in RAM). */
async function switchToPhoto(id: string) {
  if (id === activePhotoId && current) return;
  const view = sessionPhotos.find((p) => p.id === id);
  if (!view) return;
  captureActiveEdit();
  showBusy("Loading…");
  try {
    const bytes = await Session.getBytes(id);
    const imported: ImportedFile = { name: view.name, kind: view.kind, bytes, looksTranscoded: false };
    const img = await decode(imported);
    showDecoded(img, imported);
    activateCurrent(id);
  } catch (err) {
    alert("Couldn't open that photo: " + (err as Error).message);
  } finally {
    hideBusy();
  }
}

/** Build a small gamma-encoded JPEG thumbnail for the strip — auto white
 *  balanced (so RAW infrared isn't a magenta smear) but ungraded, so it just
 *  says "which photo is this". Cheap: nearest-sampled at thumb resolution. */
async function makeThumb(img: DecodedImage, MAX = 260): Promise<ArrayBuffer> {
  const s = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * s));
  const h = Math.max(1, Math.round(img.height * s));
  const wb = grayWorldWB(img);
  const e = autoExposure(img, wb);
  const cm = img.camMatrix;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y / s));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x / s));
      let [r, g, b] = linearAt(img, sx, sy);
      r *= wb[0] * e; g *= wb[1] * e; b *= wb[2] * e;
      if (cm) {
        const cr = cm[0] * r + cm[1] * g + cm[2] * b;
        const cg = cm[3] * r + cm[4] * g + cm[5] * b;
        const cb = cm[6] * r + cm[7] * g + cm[8] * b;
        r = cr; g = cg; b = cb;
      }
      const enc = (v: number) => Math.round(255 * Math.pow(clamp(v, 0, 1), 1 / 2.2));
      const i = (y * w + x) * 4;
      out[i] = enc(r); out[i + 1] = enc(g); out[i + 2] = enc(b); out[i + 3] = 255;
    }
  }
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.getContext("2d")!.putImageData(new ImageData(out, w, h), 0, 0);
  const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), "image/jpeg", 0.72));
  return blob.arrayBuffer();
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** Open a freshly-picked set. One file → ephemeral single open (unchanged).
 *  Two or more → a persisted session with the switch strip. */
async function openPicked(files: File[]) {
  let append = false;
  if (sessionPhotos.length >= 2) {
    append = confirm(
      `You have a session of ${sessionPhotos.length} photos open.\n\n` +
        `OK — add ${files.length === 1 ? "this photo" : `these ${files.length} photos`} to it.\n` +
        `Cancel — start a NEW session (the current one is closed and its storage freed).`,
    );
  }

  // Single file, not adding to a session → the fast, ephemeral path of old.
  if (files.length === 1 && !append) {
    await resetSessionState(true); // drop a lone photo or un-resumed leftovers
    hint.textContent = "Loading…";
    hint.hidden = false;
    const imported = await importFile(files[0]);
    if (imported.looksTranscoded) {
      hint.textContent =
        "That file arrived as a flattened JPEG (iOS transcoded it). For true RAW, " +
        "import from Files — or zip the DNG first — rather than the Photo Library.";
      return;
    }
    // Track it as a (strip-less) lone photo so a follow-up multi-pick can ask
    // sensibly; it isn't persisted (nothing to resume from a single edit).
    const img = await decode(imported);
    showDecoded(img, imported);
    const id = "lone";
    sessionPhotos = [{ id, name: imported.name, kind: imported.kind, size: imported.bytes.length, edit: null, thumbUrl: "" }];
    nextOrder = 0;
    liveEdits.clear();
    activateCurrent(id);
    updateSessionStrip();
    return;
  }

  await addToSession(files, append);
}

/** Wipe in-memory session state (revoking thumbnails) and, unless appending,
 *  the stored session too — so storage always mirrors the live session and no
 *  orphaned photos linger to reappear on the next resume. */
async function resetSessionState(clearStorage: boolean) {
  for (const p of sessionPhotos) if (p.thumbUrl) URL.revokeObjectURL(p.thumbUrl);
  sessionPhotos = [];
  activePhotoId = null;
  nextOrder = 0;
  liveEdits.clear();
  if (clearStorage) await Session.clearSession().catch(() => {});
}

/** Persist and append a set of files to the current session, showing the first
 *  new photo as soon as it's ready. Decoding is sequential with yields so the
 *  UI stays usable; only one decode is in RAM at a time. */
async function addToSession(files: File[], append: boolean) {
  if (!append) await resetSessionState(true); // fresh session — clear leftovers
  const skipped: string[] = [];
  let firstNewId: string | null = null;
  let quotaHit = false;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    sessionMeta.textContent = `Adding ${i + 1} / ${files.length}…`;
    sessionStrip.hidden = false;
    let imported: ImportedFile;
    try {
      imported = await importFile(f);
    } catch (err) {
      skipped.push(`${f.name} (${(err as Error).message})`);
      continue;
    }
    if (imported.looksTranscoded) { skipped.push(`${f.name} (arrived as flattened JPEG)`); continue; }
    let img: DecodedImage;
    try {
      img = await decode(imported);
    } catch (err) {
      skipped.push(`${f.name} (${(err as Error).message})`);
      continue;
    }
    let thumb: ArrayBuffer;
    try { thumb = await makeThumb(img); } catch { thumb = new ArrayBuffer(0); }
    const id = crypto.randomUUID();
    try {
      await Session.addPhoto(
        { id, name: imported.name, kind: imported.kind, size: imported.bytes.length, order: nextOrder++, addedAt: Date.now(), thumb, edit: null },
        imported.bytes,
      );
    } catch (err) {
      nextOrder--;
      if (isQuotaError(err)) { quotaHit = true; break; }
      skipped.push(`${f.name} (${(err as Error).message})`);
      continue;
    }
    sessionPhotos.push({
      id, name: imported.name, kind: imported.kind, size: imported.bytes.length, edit: null,
      thumbUrl: thumb.byteLength ? URL.createObjectURL(new Blob([thumb], { type: "image/jpeg" })) : "",
    });
    // Show the first newly-added photo straight away (its decode is in hand).
    if (!firstNewId) {
      firstNewId = id;
      if (!activePhotoId || activePhotoId === "lone") {
        showDecoded(img, imported);
        activateCurrent(id);
      }
    }
    updateSessionStrip();
    await tick(); // yield so edits on the shown photo stay responsive
  }
  updateSessionStrip();
  await requestPersistentStorage(); // ask the OS to keep the session's bytes

  const notes: string[] = [];
  if (quotaHit) notes.push("Storage filled up — some photos couldn't be added. Free space, or tap Done to end the session.");
  if (skipped.length) notes.push(`${skipped.length} couldn't be opened:\n` + skipped.join("\n"));
  if (notes.length) alert(notes.join("\n\n"));
  if (!sessionPhotos.length) {
    welcome.hidden = false;
    hint.hidden = false;
    hint.textContent = "Nothing could be opened.";
    updateWelcomeReturn();
  }
}

/** Repaint the session strip (thumbnails, active highlight, size readout).
 *  The strip takes real layout room: it publishes its measured height on the
 *  stage (--session-h + .has-session), and the CSS shrinks the photo's fit box
 *  to the space ABOVE it — the strip must never cover the picture. */
function updateSessionStrip() {
  const real = sessionPhotos.filter((p) => p.id !== "lone");
  // The strip is for switching — only meaningful from two photos up.
  if (real.length < 2) {
    sessionStrip.hidden = true;
    sessionThumbs.replaceChildren();
    stageEl.classList.remove("has-session");
    return;
  }
  sessionStrip.hidden = false;
  const total = real.reduce((s, p) => s + p.size, 0);
  const idx = real.findIndex((p) => p.id === activePhotoId);
  sessionMeta.textContent =
    `${real.length} photos · ~${fmtSize(total)}` + (idx >= 0 ? ` · viewing ${idx + 1}` : "");
  sessionThumbs.replaceChildren(
    ...real.map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "session-thumb" + (p.id === activePhotoId ? " active" : "");
      b.title = p.name;
      if (p.thumbUrl) {
        const im = document.createElement("img");
        im.src = p.thumbUrl;
        im.alt = p.name;
        b.append(im);
      } else {
        b.append(Object.assign(document.createElement("span"), { className: "session-thumb-name", textContent: p.name }));
      }
      b.addEventListener("click", () => { if (p.id !== activePhotoId) switchToPhoto(p.id); });
      return b;
    }),
  );
  stageEl.classList.add("has-session");
  stageEl.style.setProperty("--session-h", `${sessionStrip.offsetHeight}px`);
}

/** End the session: free its storage and reset all session state, returning to
 *  the start screen. */
async function endSession() {
  await resetSessionState(true);
  updateSessionStrip(); // hides the strip and gives the stage back to the photo
  current = null;
  currentFile = null;
  panel.hidden = true;
  welcome.hidden = false;
  hint.hidden = false;
  hint.textContent = "Edit infrared photos — RAW (NEF / DNG) unlocks the full color magic.";
  histWrap.hidden = true;
  updateWelcomeReturn(); // current is null now → hide the ✕ / Back controls
  renderMaskOverlay();
  updateSessionResume();
}

sessionDone.addEventListener("click", async () => {
  const n = sessionPhotos.filter((p) => p.id !== "lone").length;
  if (!confirm(`End this session of ${n} photos?\n\nEach photo's edit is kept only while the session is open — ending it frees the storage.`)) return;
  await endSession();
});

// Resume a session left in storage by a previous visit (close, crash, or the
// OS discarding the tab). Offered on the start screen, next to Recover.
const resumeBtn = $("resumeSession") as HTMLButtonElement;

async function updateSessionResume() {
  try {
    const metas = await Session.listPhotos();
    if (metas.length >= 2 && !current) {
      resumeBtn.textContent = `Resume session — ${metas.length} photos`;
      resumeBtn.hidden = false;
    } else {
      resumeBtn.hidden = true;
      // A lone leftover from a crashed single edit isn't a session — clear it
      // so storage doesn't accumulate orphans.
      if (metas.length === 1 && !current) await Session.clearSession().catch(() => {});
    }
  } catch {
    resumeBtn.hidden = true;
  }
}

async function resumeSession() {
  showBusy("Resuming session…");
  try {
    const metas = await Session.listPhotos();
    if (metas.length < 2) { hideBusy(); return; }
    sessionPhotos = metas.map((m) => ({
      id: m.id, name: m.name, kind: m.kind, size: m.size, edit: m.edit,
      thumbUrl: m.thumb.byteLength ? URL.createObjectURL(new Blob([m.thumb], { type: "image/jpeg" })) : "",
    }));
    nextOrder = Math.max(...metas.map((m) => m.order)) + 1;
    liveEdits.clear();
    activePhotoId = null;
    resumeBtn.hidden = true;
    // Open the first photo (its stored edit, if any, is applied on activate).
    const first = sessionPhotos[0];
    const bytes = await Session.getBytes(first.id);
    const imported: ImportedFile = { name: first.name, kind: first.kind, bytes, looksTranscoded: false };
    const img = await decode(imported);
    showDecoded(img, imported);
    activateCurrent(first.id);
  } catch (err) {
    alert("Couldn't resume the session: " + (err as Error).message);
  } finally {
    hideBusy();
  }
}

resumeBtn.addEventListener("click", resumeSession);
updateSessionResume();

// --- Quick look: preview a whole folder instantly, keep the ones you want ----
// The pure form of the owner's origin story — "white balance a whole folder
// just to SEE what I'm dealing with". Pick a set and get a full-screen grid of
// auto-balanced previews, decoded straight from the picked Files. NOTHING is
// copied to storage (unlike a session): the previews live in RAM only, so it's
// instant to open, instant to close, and honestly ephemeral — iPad Safari can't
// re-read picked Files after a reload, so a quick look lasts only until the tab
// closes, which fits "what am I dealing with?" exactly. Tap the keepers and
// "Keep in a session" promotes them into a real editable session (the File
// objects are still alive in-page, so promotion just runs the normal open
// path). Decoding is sequential with a yield per file; only the small preview
// JPEGs stay in RAM, never a full decode.

interface QuickItem {
  file: File;
  name: string;
  thumbUrl: string; // object URL for the grid tile ("" if it couldn't decode)
  ok: boolean;
  selected: boolean;
}

let quickItems: QuickItem[] = [];
let quickGen = 0; // bumped on open/close to abort an in-flight decode loop

const quickInput = $("quickFiles") as HTMLInputElement;
const quickLook = $("quickLook") as HTMLDivElement;
const qlGrid = $("qlGrid") as HTMLDivElement;
const qlCount = $("qlCount") as HTMLSpanElement;
const qlKeep = $("qlKeep") as HTMLButtonElement;
const qlSelectToggle = $("qlSelectToggle") as HTMLButtonElement;

const QUICK_EDGE = 512; // grid-tile preview edge (bigger than the strip's 260)

function quickSelectedCount(): number {
  return quickItems.reduce((n, it) => n + (it.selected ? 1 : 0), 0);
}

/** Refresh the header: count/progress, the Keep button's live count, and the
 *  select-all/none toggle. `progress` is shown while still decoding. */
function updateQuickHeader(progress?: string) {
  const ok = quickItems.filter((it) => it.ok).length;
  const sel = quickSelectedCount();
  qlCount.textContent = progress ?? `${ok} photo${ok === 1 ? "" : "s"}`;
  qlKeep.textContent = sel ? `Keep ${sel} in a session →` : "Keep in a session →";
  qlKeep.disabled = sel === 0;
  const anyUnsel = quickItems.some((it) => it.ok && !it.selected);
  qlSelectToggle.textContent = anyUnsel ? "Select all" : "Select none";
  qlSelectToggle.hidden = ok === 0;
}

/** Append one grid tile (a preview, or a placeholder for a file that wouldn't
 *  decode). Tapping a good tile toggles whether it's a keeper. */
function addQuickTile(it: QuickItem) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "ql-tile" + (it.selected ? " selected" : "");
  tile.title = it.name;
  if (it.ok && it.thumbUrl) {
    const im = document.createElement("img");
    im.src = it.thumbUrl;
    im.alt = it.name;
    tile.append(im);
    tile.append(Object.assign(document.createElement("span"), { className: "ql-check", textContent: "✓" }));
    tile.addEventListener("click", () => {
      it.selected = !it.selected;
      tile.classList.toggle("selected", it.selected);
      updateQuickHeader();
    });
  } else {
    tile.classList.add("ql-bad");
    tile.append(Object.assign(document.createElement("span"), { className: "ql-bad-mark", textContent: "⚠︎" }));
  }
  tile.append(Object.assign(document.createElement("span"), { className: "ql-name", textContent: it.name }));
  qlGrid.append(tile);
}

/** Open the grid and decode a preview of each picked file in turn. A transcoded
 *  JPEG still makes a fine preview, so — unlike a real open — we don't reject it
 *  here (that warning is for editing true RAW, which quick look isn't). */
async function openQuickLook(files: File[]) {
  const gen = ++quickGen;
  for (const it of quickItems) if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  quickItems = [];
  qlGrid.replaceChildren();
  quickLook.hidden = false;
  updateQuickHeader(`Decoding 0 / ${files.length}…`);

  let done = 0;
  for (const f of files) {
    if (gen !== quickGen) return; // closed or restarted under us
    let thumbUrl = "";
    let ok = false;
    try {
      const imported = await importFile(f);
      const img = await decode(imported);
      const thumb = await makeThumb(img, QUICK_EDGE);
      if (thumb.byteLength) {
        thumbUrl = URL.createObjectURL(new Blob([thumb], { type: "image/jpeg" }));
        ok = true;
      }
      // img + the imported bytes fall out of scope here; only the small JPEG
      // preview is retained, so RAM stays bounded to N thumbnails.
    } catch {
      /* couldn't open — shown as a placeholder tile so nothing goes missing */
    }
    if (gen !== quickGen) { if (thumbUrl) URL.revokeObjectURL(thumbUrl); return; }
    const it: QuickItem = { file: f, name: f.name, thumbUrl, ok, selected: ok };
    quickItems.push(it);
    addQuickTile(it);
    done++;
    updateQuickHeader(done < files.length ? `Decoding ${done} / ${files.length}…` : undefined);
    await tick(); // yield so the grid paints and taps stay responsive
  }
  updateQuickHeader();
}

/** Close the grid, free every preview, and abort any decode still running. */
function closeQuickLook() {
  quickGen++;
  for (const it of quickItems) if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  quickItems = [];
  qlGrid.replaceChildren();
  quickLook.hidden = true;
}

/** Promote the selected previews into a real session (or a lone open, for one).
 *  The picked Files are still alive, so this is just the normal open path. */
async function keepQuickLook() {
  const files = quickItems.filter((it) => it.ok && it.selected).map((it) => it.file);
  if (!files.length) return;
  closeQuickLook();
  try {
    await openPicked(files);
  } catch (err) {
    welcome.hidden = false;
    hint.hidden = false;
    hint.textContent = "Could not open these files: " + (err as Error).message;
    updateWelcomeReturn();
  }
}

quickInput.addEventListener("change", async () => {
  const files = Array.from(quickInput.files ?? []);
  quickInput.value = ""; // allow re-picking the same set later
  if (!files.length) return;
  await openQuickLook(files);
});
qlKeep.addEventListener("click", keepQuickLook);
$("qlClose").addEventListener("click", closeQuickLook);
qlSelectToggle.addEventListener("click", () => {
  const target = quickItems.some((it) => it.ok && !it.selected); // any unselected → select all
  quickItems.forEach((it, i) => {
    if (!it.ok) return;
    it.selected = target;
    qlGrid.children[i]?.classList.toggle("selected", target);
  });
  updateQuickHeader();
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
    expand: ["fsLooks", "fsPerColor", "fsMixer"],
    title: "Lesson 3 · Hillside & sky — the color tools",
    steps: [
      "Tap Aerochrome first.",
      "The color tools go from broad to surgical. Broadest: the R⇄B channel swap flips the whole color world; Hue shift (in Hue/Saturation/Tone) rotates every color together — use it for big moves.",
      "In Per-color, drag the Sky hue slider — each box owns half the color wheel and follows the swap; the small text shows which colors it's holding.",
      "Most surgical: the Color mixer. Tap “Pick color from photo”, then tap the sky — the chip owning that exact color selects itself. Now drag its Hue and Saturation: only that color moves.",
      "A chip bends only its own neighborhood (so smooth skies can't tear into bands). Need a bigger throw? Make the move with Hue shift first, then finish with the chip.",
    ],
  },
};

async function loadExample(key: string) {
  const ex = EXAMPLES[key];
  if (!ex) return;
  // Tutorials are an ephemeral learning path — close any session first so its
  // strip doesn't linger over the lesson and storage stays in sync.
  await resetSessionState(true);
  updateSessionStrip();
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
  } catch {
    alert("Couldn't load the example — it downloads on first use, so check your connection and try again. (Once loaded, everything works offline.)");
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
  pendingSaveIsBatch = false;
  busyStop.hidden = true;
  busyContinue.hidden = true;
  busySave.hidden = false;
}

busyClose.addEventListener("click", hideBusy);

busySave.addEventListener("click", async () => {
  if (!pendingSave) return;
  const { blob, name } = pendingSave;
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  let saved = false;
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] } as ShareData);
      saved = true;
    } catch (err) {
      if ((err as Error).name === "AbortError") return; // user cancelled the sheet
      // Fall through to a plain download on any other failure.
    }
  }
  if (!saved) download(blob, name);
  if (pendingSaveIsBatch) {
    // The frames are safely in the saved zip — the crash-recovery copies can go.
    await clearFrames().catch(() => {});
    recoverBtn.hidden = true;
    pendingSaveIsBatch = false;
    if (batchRemaining.length) {
      // Stopped mid-set and saved the first part: stay open so Continue is a tap away.
      pendingSave = null;
      busySave.hidden = true;
      busyText.textContent = `Saved — ${batchRemaining.length} photo${batchRemaining.length === 1 ? "" : "s"} still to process.`;
      return;
    }
  }
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

// --- Batch / mass processing ------------------------------------------------
// Apply the current on-screen LOOK (creative grade only — see currentLook()) to
// a whole set of photos at once. Each frame is auto-balanced on its own (its
// own white balance / exposure / denoise, and its own EXIF-selected hot-spot
// correction), exactly like opening it, then the look layers on top. Results
// come back as a single .zip so the iPad share sheet only prompts once.

// What a batch lays on top of each photo's own automatic balance. Chosen in
// the batch-start dialog (owner feedback 2026-07-13: batch must ASK, and must
// recognize when there's no current edit to copy):
//   look    — a concrete creative grade (the current edit, or a My-looks slot)
//   builtin — one of the seven Looks; resolved PER IMAGE like the look button
//             (raw sources take the full-strength recipe, JPEGs the gentler
//             one, and the look's WB bias rides on the photo's own auto WB)
//   auto    — no creative grade at all: just balance every photo, the
//             quick-look-at-a-folder mode.
type BatchGrade =
  | { kind: "look"; look: SavedLook }
  | { kind: "builtin"; key: keyof typeof LOOKS }
  | { kind: "auto" };

/** A no-op creative grade — auto-balance only. */
function neutralLook(): SavedLook {
  return {
    swapRB: false, hue: 0, sat: 1, contrast: 1, tint: [1, 1, 1], glow: 0,
    sky: [0, 1, 1], foliage: [0, 1, 1], tone: [...TONE_DEFAULT] as [number, number, number, number, number],
    lum: 1, clarity: 0, dehaze: 0, hsl: hslDefault(),
  };
}

/** This photo's own automatic baseline (WB/exposure/denoise) plus the chosen
 *  creative grade. Mirrors autoAdjust() + loadSlot()/pressLook(), without
 *  touching the live on-screen edit. Masks never carry (composition-specific). */
function batchParamsFor(img: DecodedImage, grade: BatchGrade): EditParams {
  let wb = grayWorldWB(img);
  let look: SavedLook;
  if (grade.kind === "builtin") {
    // Resolve exactly like pressing the look button on this photo: strength
    // by source kind, WB bias multiplied onto the photo's own auto WB.
    const l = LOOKS[grade.key];
    const strength = img.camMatrix ? l.raw : l.jpeg;
    const bias = l.wbBias ?? [1, 1, 1];
    wb = [
      clamp(wb[0] * bias[0], 0.02, 16),
      clamp(wb[1] * bias[1], 0.02, 16),
      clamp(wb[2] * bias[2], 0.02, 16),
    ];
    look = { ...neutralLook(), swapRB: l.swapRB, hue: l.hue, sat: strength.sat, contrast: strength.contrast, tint: l.tint ?? [1, 1, 1], glow: l.glow ?? 0 };
  } else {
    look = grade.kind === "look" ? grade.look : neutralLook();
  }
  return {
    wb,
    exposure: autoExposure(img, wb),
    denoise: estimateDenoise(img),
    swapRB: look.swapRB,
    hue: look.hue,
    sat: look.sat,
    contrast: look.contrast,
    tint: [...look.tint] as [number, number, number],
    glow: look.glow,
    sky: [...look.sky] as [number, number, number],
    foliage: [...look.foliage] as [number, number, number],
    tone: [...look.tone] as [number, number, number, number, number],
    lum: look.lum,
    masks: [],
    hotspot: 0,
    hotspotSize: 0.5,
    vignette: 0,
    clarity: look.clarity,
    dehaze: look.dehaze,
    hsl: [...look.hsl],
  };
}

/** Bake the EXIF-selected hot-spot correction into a decoded frame's pixels,
 *  matching initHotspot(). If the lens can't be identified from EXIF we skip
 *  it for that frame — a bulk run can't stop to ask per photo.
 *  Returns which happened so the batch summary can be honest:
 *   - "applied": hot-spot correction was baked in;
 *   - "no-lens": a JPEG whose EXIF didn't name a lens we have a profile for;
 *   - "raw": RAW frame (profiles are JPEG-only for now — a known, separate skip). */
function applyBatchHotspot(img: DecodedImage, imported: ImportedFile): "applied" | "no-lens" | "raw" {
  if (!img.pixels) return "raw"; // RAW: profiles are JPEG-only for now
  const info = Hotspot.fromExif(arrayBufferOf(imported.bytes));
  if (!info || Hotspot.needsPrompt(info) || !info.profileKey) return "no-lens";
  Hotspot.apply({ width: img.width, height: img.height, data: img.pixels }, info.profileKey, 1);
  return "applied";
}

/** Ensure every entry in the zip has a unique name (…-2.jpg on collision). */
function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) { taken.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const stem = dot < 0 ? name : name.slice(0, dot);
  const ext = dot < 0 ? "" : name.slice(dot);
  let n = 2;
  while (taken.has(`${stem}-${n}${ext}`)) n++;
  const out = `${stem}-${n}${ext}`;
  taken.add(out);
  return out;
}

const batchInput = $("batchFiles") as HTMLInputElement;
const busyStop = $("busyStop") as HTMLButtonElement;
const busyContinue = $("busyContinue") as HTMLButtonElement;
const recoverBtn = $("recoverBatch") as HTMLButtonElement;

// Each finished frame goes straight into IndexedDB (disk-backed — see
// batchstore.ts) and is never held in RAM, so this backstop is about the
// final zip Blob and storage quota, not working memory.
const BATCH_BYTE_BUDGET = 2 * 1024 * 1024 * 1024;

/** Chrome exposes heap stats; Safari doesn't (the byte budget covers it). */
function heapNearFull(): boolean {
  const m = (performance as { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return !!m && m.usedJSHeapSize > 0.85 * m.jsHeapSizeLimit;
}

/** Ask for persistent storage before a batch so the OS is less likely to evict
 *  the crash-recovery data mid-run (iOS clears "best-effort" IDB under pressure).
 *  Best-effort itself — unsupported or denied just means the batch runs without
 *  the extra durability promise. */
async function requestPersistentStorage(): Promise<void> {
  try {
    await (navigator as { storage?: { persist?(): Promise<boolean> } }).storage?.persist?.();
  } catch {
    /* not supported / denied — the batch still runs */
  }
}

/** A write that failed because the device is out of storage quota (as opposed
 *  to a decode/export error for one bad file). IndexedDB reports this as a
 *  DOMException; match by name (code 22 is the legacy spelling). */
function isQuotaError(err: unknown): boolean {
  const name = (err as { name?: string } | null)?.name;
  return name === "QuotaExceededError" || (err instanceof DOMException && err.code === 22);
}

let batchStopRequested = false;
let batchRemaining: File[] = []; // input Files not yet processed after a stop
let batchSettings: { grade: BatchGrade; format: ExportFormat; scale: number; quality: number } | null = null;
let pendingSaveIsBatch = false;
let batchRunning = false;

// A long batch must not die to the screen locking (iPad suspends the tab).
// Held while processing, released after; iOS drops it when the app is
// backgrounded, so re-acquire on return while a batch is still running.
type WakeLockSentinel = { release(): Promise<void> };
let wakeLock: WakeLockSentinel | null = null;
async function acquireWakeLock() {
  try {
    const wl = (navigator as { wakeLock?: { request(type: "screen"): Promise<WakeLockSentinel> } }).wakeLock;
    wakeLock = (await wl?.request("screen")) ?? null;
  } catch {
    wakeLock = null; // not supported / denied — the batch still runs
  }
}
function releaseWakeLock() {
  wakeLock?.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && batchRunning) acquireWakeLock();
});

busyStop.addEventListener("click", () => {
  batchStopRequested = true;
  busyStop.disabled = true;
  busyStop.textContent = "Stopping — finishing this photo…";
});

/** Zip every stored frame and present the save UI. Rows are cursor-read one
 *  at a time and immediately wrapped in a per-frame Blob (engines spool big
 *  Blobs to disk), so RAM holds ~one frame however large the batch. */
async function bundleStored(header: string): Promise<boolean> {
  busyText.textContent = "Bundling…";
  const entries: { name: string; size: number; crc: number; data: Blob }[] = [];
  await eachFrame((f) => entries.push({ name: f.name, size: f.size, crc: f.crc, data: new Blob(f.parts) }));
  if (!entries.length) return false;
  const zipBlob = writeZip(entries, new Date());
  pendingSave = { blob: zipBlob, name: `IR-batch-${entries.length}.zip` };
  pendingSaveIsBatch = true;
  busyText.textContent = header;
  busySpinner.hidden = true;
  busySave.hidden = false;
  busyActions.hidden = false;
  busyContinue.hidden = batchRemaining.length === 0;
  busyContinue.textContent = `Continue — ${batchRemaining.length} left`;
  return true;
}

async function runBatch(files: File[]) {
  const { grade, format, scale, quality } = batchSettings!;
  const skipped: string[] = [];
  let alreadyDone = 0;
  let noHotspot = 0; // JPEG frames whose lens wasn't in EXIF → no hot-spot fix
  let stoppedEarly: "user" | "memory" | "quota" | null = null;
  batchStopRequested = false;
  batchRunning = true;
  busyStop.disabled = false;
  busyStop.textContent = "Stop & save what's done";
  showBusy(`Processing 0 / ${files.length}…`);
  busyStop.hidden = false;
  recoverBtn.hidden = true;
  await acquireWakeLock();
  await requestPersistentStorage();

  try {
    // Frames already stored (an earlier stopped part, or accepted leftovers)
    // keep their names and count toward the budget; the final zip includes
    // them. Their INPUT identities let a re-picked set resume seamlessly:
    // inputs whose output is already stored just fly by as "already done".
    const taken = new Set<string>();
    const doneInputs = new Set<string>();
    let totalBytes = 0;
    for (const m of await frameMetas()) {
      taken.add(m.name);
      totalBytes += m.size;
      if (m.srcName !== undefined) doneInputs.add(`${m.srcName} ${m.srcSize}`);
    }

    for (let i = 0; i < files.length; i++) {
      if (batchStopRequested) { stoppedEarly = "user"; batchRemaining = files.slice(i); break; }
      if (totalBytes > BATCH_BYTE_BUDGET || heapNearFull()) { stoppedEarly = "memory"; batchRemaining = files.slice(i); break; }
      const f = files[i];
      if (doneInputs.has(`${f.name} ${f.size}`)) { alreadyDone++; continue; }
      busyText.textContent = `Processing ${i + 1} / ${files.length} — ${f.name}`;
      try {
        const imported = await importFile(f);
        if (imported.looksTranscoded) { skipped.push(`${f.name} (arrived as flattened JPEG)`); continue; }
        const img = await decode(imported);
        const noLens = applyBatchHotspot(img, imported) === "no-lens";
        const result = await exportImage(
          imported,
          img,
          batchParamsFor(img, grade),
          { format, scale, quality, rotate: img.rotate ?? 0 },
          (fr) => { busyText.textContent = `Processing ${i + 1} / ${files.length} — ${f.name} · ${Math.round(fr * 100)}%`; },
        );
        // Persist immediately (crash-safe), keep nothing in RAM. Stored in
        // small chunks — see batchstore.ts for why never one big value.
        const bytes = new Uint8Array(await result.blob.arrayBuffer());
        try {
          await putFrame(
            { name: uniqueName(result.name, taken), crc: crc32(bytes), size: bytes.length, srcName: f.name, srcSize: f.size },
            bytes,
          );
        } catch (err) {
          // Out of device storage: stop like the memory guard rather than
          // spewing a cryptic per-frame skip. This frame isn't stored, so it
          // stays in the remaining set to retry after the user frees space.
          if (isQuotaError(err)) { stoppedEarly = "quota"; batchRemaining = files.slice(i); break; }
          throw err;
        }
        // Counted only once the frame is really stored, so the summary's
        // numbers describe exactly the set that's in the zip.
        if (noLens) noHotspot++;
        totalBytes += bytes.length;
        doneInputs.add(`${f.name} ${f.size}`);
      } catch (err) {
        skipped.push(`${f.name} (${(err as Error).message})`);
      }
    }

    busyStop.hidden = true;
    if (!stoppedEarly) batchRemaining = [];
    const count = await frameCount();
    if (!count) {
      hideBusy();
      alert(stoppedEarly ? "Stopped — nothing was finished yet." : "Nothing could be processed.\n\n" + skipped.join("\n"));
      return;
    }
    const n = `${count} image${count === 1 ? "" : "s"}`;
    const note =
      (skipped.length ? ` · ${skipped.length} skipped` : "") +
      (noHotspot ? ` · ${noHotspot} without lens hot-spot fix` : "") +
      (alreadyDone ? ` · ${alreadyDone} already done earlier` : "");
    await bundleStored(
      stoppedEarly === "user" ? `Stopped — ${n} ready in a .zip${note}`
      : stoppedEarly === "memory" ? `Stopped by the memory guard — ${n} ready in a .zip${note}. Save it, then Continue.`
      : stoppedEarly === "quota" ? `Storage is full — ${n} ready in a .zip${note}. Save it to free space, then Continue.`
      : `Ready — ${n} in a .zip${note}`,
    );
    if (skipped.length) console.warn("Batch skipped:\n" + skipped.join("\n"));
  } catch (err) {
    busyStop.hidden = true;
    hideBusy();
    alert("Batch failed: " + (err as Error).message);
  } finally {
    batchRunning = false;
    releaseWakeLock();
  }
}

// --- Batch-start chooser: tapping "Batch process" first asks what grade goes
// on every photo (owner feedback 2026-07-13 — batch used to silently take the
// on-screen edit, which is meaningless when nothing is open). Only after a
// choice does the file picker open; the choice rides into the change handler.
const batchDlg = $("batchDlg") as HTMLDialogElement;
const bcSlots = $("bcSlots") as HTMLDivElement;
const bcLooks = $("bcLooks") as HTMLDivElement;
let chosenGrade: BatchGrade | null = null;

const BUILTIN_NAMES: Record<string, string> = {
  aero: "Aerochrome", red: "Aero Red", goldie: "Goldie", natural: "Natural IR",
  mono: "B&W IR", sepia: "Sepia IR", hie: "HIE B&W",
};

/** Stash the choice, close the dialog, and open the file picker (still inside
 *  the tap's gesture, so iOS allows the picker to open). */
function pickGrade(grade: BatchGrade) {
  chosenGrade = grade;
  batchDlg.close();
  batchInput.click();
}

function openBatchDialog() {
  // Your current edit — only real when a photo is open; otherwise say why not.
  ($("bcCurrent") as HTMLButtonElement).hidden = !current;
  ($("bcNoCurrent") as HTMLElement).hidden = !!current;
  // Saved looks: one button per filled slot; none → how to make one.
  bcSlots.replaceChildren();
  let filled = 0;
  for (let i = 0; i < SLOTS; i++) {
    const look = readSlot(i);
    if (!look) continue;
    filled++;
    const b = document.createElement("button");
    b.type = "button";
    b.className = "batch-choice slim";
    b.innerHTML = `<strong>Slot ${i + 1}</strong>`;
    b.addEventListener("click", () => pickGrade({ kind: "look", look }));
    bcSlots.append(b);
  }
  ($("bcNoSlots") as HTMLElement).hidden = filled > 0;
  bcSlots.hidden = filled === 0;
  // Built-in looks.
  bcLooks.replaceChildren(
    ...Object.keys(LOOKS).map((key) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "batch-choice slim";
      b.innerHTML = `<strong>${BUILTIN_NAMES[key] ?? key}</strong>`;
      b.addEventListener("click", () => pickGrade({ kind: "builtin", key }));
      return b;
    }),
  );
  ($("bcFmt") as HTMLElement).textContent =
    ` (currently ${ui.exFormat.value === "jpeg" ? "JPEG" : "TIFF"} · ${Number(ui.exScale.value) === 1 ? "full resolution" : `${Math.round(Number(ui.exScale.value) * 100)}%`})`;
  batchDlg.showModal();
}

$("batchBtn").addEventListener("click", openBatchDialog);
$("welcomeBatchBtn").addEventListener("click", openBatchDialog);
$("bcCurrent").addEventListener("click", () => pickGrade({ kind: "look", look: currentLook() }));
$("bcAuto").addEventListener("click", () => pickGrade({ kind: "auto" }));
$("bcQuick").addEventListener("click", () => {
  // Not developing a .zip after all — just look. Stay in the tap gesture so
  // iOS opens the picker.
  batchDlg.close();
  quickInput.click();
});
$("batchCancel").addEventListener("click", () => batchDlg.close());
batchDlg.addEventListener("click", (e) => {
  if (e.target === batchDlg) batchDlg.close(); // tap outside to dismiss
});

batchInput.addEventListener("change", async () => {
  const files = Array.from(batchInput.files ?? []);
  batchInput.value = ""; // let the same set be re-picked later
  if (!files.length) return;
  // The grade chosen in the dialog; a bare change event (shouldn't happen)
  // falls back to the honest equivalents of the old behaviour.
  const grade: BatchGrade = chosenGrade ?? (current ? { kind: "look", look: currentLook() } : { kind: "auto" });
  chosenGrade = null;
  // Leftover frames from an interrupted batch would silently mix into this
  // zip — ask, honestly, instead of guessing.
  const leftovers = await frameCount().catch(() => 0);
  if (
    leftovers &&
    !confirm(
      `${leftovers} finished image${leftovers === 1 ? "" : "s"} from an interrupted batch ${leftovers === 1 ? "is" : "are"} still stored.\n\n` +
        `OK — include ${leftovers === 1 ? "it" : "them"} in this batch's .zip (photos already done are skipped, so re-picking the whole set just finishes it).\n` +
        `Cancel — go back and use "Recover" on the start screen first.`,
    )
  )
    return;
  batchSettings = { grade, format: ui.exFormat.value as ExportFormat, scale: Number(ui.exScale.value), quality: Number(ui.exQuality.value) };
  batchRemaining = [];
  runBatch(files);
});

busyContinue.addEventListener("click", () => {
  const files = batchRemaining;
  batchRemaining = [];
  busyContinue.hidden = true;
  runBatch(files);
});

// An interrupted batch (crash, closed tab) leaves its finished frames stored —
// offer them on the start screen instead of losing the work.
recoverBtn.addEventListener("click", async () => {
  batchRemaining = [];
  showBusy("Bundling…");
  if (await bundleStored("Recovered from the interrupted batch — ready to save.")) {
    recoverBtn.hidden = true;
  } else {
    hideBusy();
    recoverBtn.hidden = true;
  }
});

(async () => {
  try {
    const n = await frameCount();
    if (n) {
      recoverBtn.textContent = `Recover ${n} finished image${n === 1 ? "" : "s"} from an interrupted batch`;
      recoverBtn.hidden = false;
    }
  } catch {
    /* IndexedDB unavailable — batches still run, just without crash recovery */
  }
})();

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
  // Armed picks eat the tap (they must NOT also set white balance).
  if (handleColorMaskPick(e.clientX, e.clientY)) return;
  if (handleHslPick(e.clientX, e.clientY)) return;
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
  flushRecord();
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
  // Work in sigma, then invert the slider's curve (sigma = 0.10·s², see
  // rangeSigma). Owner-tuned (2026-07-12): the DEFAULT should barely just
  // clear the banding in flat areas and nothing more — so target the measured
  // noise amplitude itself (med ≈ 1.35× the relative noise sigma; 0.75·med
  // lands right on it), leaving all the headroom above for taste.
  const targetSigma = 0.75 * med;
  return clamp(Math.sqrt(targetSigma / 0.1), 0, 0.6);
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

// ⓘ What's new — the last 5 updates, injected at build time, each carrying
// its real version number (v0.N = Nth update ever; v1.0 arrives by git tag)
// and linked to its commit on GitHub.
{
  const dlg = $("infoDlg") as HTMLDialogElement;
  const list = $("changeList") as HTMLUListElement;
  ($("infoVer") as HTMLElement).textContent = `You're on v${__APP_VERSION__}`;
  for (const c of __CHANGELOG__) {
    const li = document.createElement("li");
    const ver = document.createElement("strong");
    ver.textContent = `v${c.version} `;
    const a = document.createElement("a");
    a.href = `https://github.com/njefferson/IRstudio/commit/${c.hash}`;
    a.target = "_blank";
    a.rel = "noopener";
    a.textContent = c.subject;
    const when = document.createElement("small");
    when.textContent = ` — ${c.date}`;
    li.append(ver, a, when);
    list.append(li);
  }

  // Roadmap — the next-release items, parsed at build time from the
  // "Next capability release" section of NOTES.md (source of truth). Pending
  // items sit above already-shipped ones so the "what's coming" reads first.
  const roadmap = $("roadmapList") as HTMLUListElement;
  const items = [...__ROADMAP__].sort((x, y) => Number(x.done) - Number(y.done));
  for (const it of items) {
    const li = document.createElement("li");
    if (it.done) li.className = "done";
    const mark = document.createElement("span");
    mark.className = "rm-mark";
    mark.textContent = it.done ? "✓" : "○";
    const text = document.createElement("span");
    text.textContent = it.title;
    li.append(mark, text);
    roadmap.append(li);
  }

  $("infoBtn").addEventListener("click", () => dlg.showModal());
  $("infoClose").addEventListener("click", () => dlg.close());
  dlg.addEventListener("click", (e) => {
    if (e.target === dlg) dlg.close(); // tap outside to dismiss
  });

  // Auto-open "What's new" ONCE when the app has updated since the last
  // visit. First-ever visit records the version silently (the welcome screen
  // owns that moment); marking the version immediately means a reload never
  // re-triggers it.
  const SEEN_KEY = "ips-whatsnew";
  const seen = localStorage.getItem(SEEN_KEY);
  localStorage.setItem(SEEN_KEY, __APP_VERSION__);
  if (seen !== null && seen !== __APP_VERSION__) {
    // Let the first frame paint so the dialog opens over a live app.
    requestAnimationFrame(() => dlg.showModal());
  }
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

// --- "Add to Home Screen" hint on the welcome screen. iOS has NO install
// API — users must do Share -> Add to Home Screen themselves, and most don't
// know it exists — so we teach the gesture. Hidden when already running as an
// installed app; dismissible (remembered); on Chromium/Android the real
// install prompt (beforeinstallprompt) upgrades the hint to an Install button.
{
  const a2hs = $("a2hs") as HTMLDivElement;
  const installBtn = $("a2hsInstall") as HTMLButtonElement;
  const A2HS_KEY = "ips-a2hs";
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  // iPadOS in desktop mode reports MacIntel + touch; catch it too.
  const isIOS =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  let installEvt: (Event & { prompt?: () => Promise<void> }) | null = null;

  const shouldShow = () => !standalone && localStorage.getItem(A2HS_KEY) !== "no" && (isIOS || !!installEvt);
  const refresh = () => { a2hs.hidden = !shouldShow(); };

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // keep Chrome's mini-bar quiet; we offer our own button
    installEvt = e as typeof installEvt;
    installBtn.hidden = false;
    ($("a2hsText") as HTMLElement).textContent = "Use it like an app — install for full screen & offline:";
    refresh();
  });
  installBtn.addEventListener("click", async () => {
    await installEvt?.prompt?.();
    a2hs.hidden = true;
  });
  $("a2hsClose").addEventListener("click", () => {
    localStorage.setItem(A2HS_KEY, "no");
    a2hs.hidden = true;
  });
  refresh();
}

// Installed-app Share (src/share.ts): only appears when running standalone,
// where Safari's own Share / address bar are gone.
setupInstalledShare("shareBtn");

// Offline support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
