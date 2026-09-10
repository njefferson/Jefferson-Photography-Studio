import "./style.css";
import { importFile, type ImportedFile, type ImageKind } from "./import";
import { wireForceUpdate, wireUpdateStrip } from "./swupdate";
import { type DecodedImage, pickLargestPreview } from "./decode";
import { decodeOffThread } from "./decodeClient";
import { Renderer, type EditParams } from "./gl";
import { exportImage, saveBlob, type ExportFormat } from "./export";
import { findLocation, stripLocation } from "./gps";
import { writeZip, crc32 } from "./zip";
import { putFrame, eachFrame, frameMetas, frameCount, clearFrames } from "./batchstore";
import * as Session from "./session";
import { TONE_DEFAULT, TONE_X, toneEvaluator, toneIsIdentity, neutralMask, hslDefault, HSL_CENTERS, MAX_MASKS, MAX_BITMAP_MASKS, chromaVec, hsv2rgb, bandWeight, rgb2hsv, CROP_DEFAULT, cropIsIdentity, autoInscribedCrop, GRADE_DEFAULT, MIX3_DEFAULT, compileEdit, type MaskLayer, type CropRect } from "./pipeline";
import { bakeRgba8, bakeRgbaF32, spotRect, findHealSource, detectSpots, lumaAccessor, SPOT_R_MIN, SPOT_R_MAX, type HealSpot } from "./heal";
import { makeStickerAsset, stickerRect, stickerWorldCorners, stickerXform, compositeStickersIntoRect8, compositeStickersIntoRectF32, compositeStickersOverlay8, type StickerAsset } from "./sticker";
import { makeWarpField, encodeWarp, paintWarp, warpIsEmpty as warpFieldEmpty, type WarpField, type WarpTool } from "./warp";
import type { Sticker, BrushMask } from "./pipeline";
import { generateCube } from "./lut";
import { generateDcp } from "./dcp";
import { buildGlowMap } from "./glow";
import { buildLocalMap } from "./localmap";
import { buildSkyMask, SKY_MIN_COVERAGE } from "./sky";
import { buildDiagnostic } from "./diagnostic";
import { Tiff } from "./raw/tiff";
import { drawHistogram } from "./histogram";
import * as Hotspot from "./hotspot";
import { setupInstalledShare, setupInstallFromApp, toast } from "./share";
import {
  type SavedLook,
  type NamedLook,
  coerceLook,
  cleanName,
  encodeLookPayload,
  toBase64url,
  buildLookLink,
  parseLookText,
  parseLookPayload,
  sniffLook,
  lookFileName,
} from "./look";
import { parseCube, CUBE_FILE_MAX } from "./cubeimport";
import { putLut, getLut, listLuts, deleteLut, LUT_COUNT_CAP } from "./luts";
import { extractLookFromJpeg } from "./lookmark";
import { encodeQr, drawQr } from "./qr";
import { wireThemePicker } from "./theme";
import { wirePalettePicker } from "./palette";

// Injected at build time from git history (see vite.config.ts).
declare const __CHANGELOG__: { hash: string; date: string; subject: string; version: string }[];
declare const __ROADMAP__: { done: boolean; title: string }[];
declare const __APP_VERSION__: string;

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

// Discrete build stamp in the header — so a troubleshooting screenshot always
// says which build it came from (a stale PWA cache can otherwise hide which
// code is actually running on the device).
{
  const verTag = document.getElementById("verTag");
  if (verTag) verTag.textContent = `v${__APP_VERSION__}`;
  wireVersionMenu();
}

const canvas = $("view") as HTMLCanvasElement;
const hint = $("hint") as HTMLParagraphElement;
const panel = $("panel") as HTMLElement;
const panelBody = $("panelBody") as HTMLElement;
const cueUp = $("panelUp") as HTMLDivElement;
const cueDown = $("panelDown") as HTMLDivElement;
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
  recover: 0,
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
  toneR: [...TONE_DEFAULT],
  toneG: [...TONE_DEFAULT],
  toneB: [...TONE_DEFAULT],
  lum: 1,
  masks: [],
  hotspot: 0,
  hotspotSize: 0.5,
  vignette: 0,
  clarity: 0,
  dehaze: 0,
  sharpen: 0,
  texture: 0,
  hsl: hslDefault(),
  bwOn: false,
  bwMix: [1, 1, 1],
  grade: [...GRADE_DEFAULT],
  grainAmt: 0,
  grainSize: 1.5,
  vigAmt: 0,
  vigMid: 0.5,
  mix3: [...MIX3_DEFAULT],
  spots: [],
  crop: { ...CROP_DEFAULT },
  straighten: 0,
};

const ui = {
  wbR: $("wbR") as HTMLInputElement,
  wbG: $("wbG") as HTMLInputElement,
  wbB: $("wbB") as HTMLInputElement,
  expo: $("expo") as HTMLInputElement,
  dn: $("dn") as HTMLInputElement,
  recover: $("recover") as HTMLInputElement,
  autoBtn: $("autoBtn") as HTMLButtonElement,
  irAutoWb: $("irAutoWb") as HTMLButtonElement,
  irLift: $("irLift") as HTMLButtonElement,
  liftAmt: $("liftAmt") as HTMLInputElement,
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
  sharpen: $("sharpen") as HTMLInputElement,
  texture: $("texture") as HTMLInputElement,
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
  // uploadPreview (not a bare setImage): the fresh texture is pristine, so the
  // heal spots must be re-baked onto the newly corrected pixels.
  uploadPreview();
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
  let info: Hotspot.ExifInfo | null = null;
  try {
    info = Hotspot.fromExif(arrayBufferOf(imported.bytes));
  } catch {
    // Unreadable EXIF = unknown lens: fall through to the manual prompt.
  }
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

/** Recompute + repaint the histogram for a param set (skipped when hidden).
 *
 *  It runs on every draw, and each run is an offscreen render plus a
 *  SYNCHRONOUS gl.readPixels — which stalls the main thread until the GPU
 *  pipeline has flushed. That is fine for one photo being graded (the readback
 *  is 220px on its longest edge) and it is not fine while a set is coming in:
 *  profiled over a six-file open, readPixels was 991 ms, a quarter of all
 *  main-thread time and the single biggest cost in the whole open — larger than
 *  the decodes it now shares the machine with. So it is skipped for the
 *  duration and refreshed once at the end. The histogram describes the photo on
 *  screen; that photo is not changing while the REST of the set loads, so there
 *  is nothing to redraw. */
function refreshHistogram(p: EditParams) {
  if (!current || !histEnabled) return;
  if (adding) { histStale = true; return; }
  histStale = false;
  const h = renderer.histogram(p);
  if (h) drawHistogram(histCanvas, h);
}

/** A refresh was skipped while a set was loading; catch it up when that ends. */
let histStale = false;
function settleHistogram() {
  if (histStale) refreshHistogram(params);
}

histBtn.addEventListener("click", () => {
  histEnabled = !histEnabled;
  localStorage.setItem("ips-hist", histEnabled ? "1" : "0");
  updateHistVisibility();
  if (histEnabled) refreshHistogram(params);
});
// Tap the histogram itself to dismiss it — touch the thing to hide the thing.
// It only ever hides; the Histogram button stays the one control that shows it.
histCanvas.addEventListener("click", () => {
  histEnabled = false;
  localStorage.setItem("ips-hist", "0");
  updateHistVisibility();
});
updateHistVisibility(); // reflect the stored preference on the toggle at startup

// WB gains and exposure span 0.02–16x / 0.1–16x; on a linear track every
// realistic value (0.3–3) crowds into the bottom tenth, which reads as the
// sliders "falling to the floor" even when the balance is correct. The track
// therefore stores a 0..1000 position mapped exponentially, putting 1.0 near
// mid-track with fine control around it.
// Exposure slider spans 0.05..64x (about -4.3 to +6 stops): auto stops at
// 16x (below) but a dark frame must stay PUSHABLE past where auto gives up —
// the owner's twilight D5300 frame opened with auto railed at the old 16x
// ceiling and nowhere left to go (IMG_1253, 2026-07-25).
const WB_LO = 0.02, WB_HI = 16, EX_LO = 0.05, EX_HI = 64;
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
  params.sharpen = Number(ui.sharpen.value);
  params.texture = Number(ui.texture.value);
  params.denoise = Number(ui.dn.value);
  params.recover = Number(ui.recover.value);
  params.sky = [Number(ui.skyHue.value), Number(ui.skySat.value), Number(ui.skyLum.value)];
  params.foliage = [Number(ui.folHue.value), Number(ui.folSat.value), Number(ui.folLum.value)];
  {
    const t = activeTone();
    for (let i = 0; i < 5; i++) {
      t[i] = TONE_DEFAULT[i] + Number(ui.tones[i].value) / 100;
    }
  }
  clampToneOrder();
  updateToneWidget();
  updateToneChanUI(); // the "adjusted" badge tracks live slider drags
  updateBandLabels();
  draw();
}

/** Keep the five tone points in ascending order with a small gap — on the
 *  master curve AND each per-channel curve (loads may arrive unordered). */
function clampToneOrder() {
  for (const t of [params.tone, params.toneR, params.toneG, params.toneB]) {
    for (let i = 0; i < 5; i++) {
      const lo = i === 0 ? 0 : t[i - 1] + 0.01;
      t[i] = clamp(t[i], Math.max(lo, TONE_DEFAULT[i] - 0.25), Math.min(1, TONE_DEFAULT[i] + 0.25));
    }
  }
}

function syncToUI() {
  ui.wbR.value = String(toPos(params.wb[0], WB_LO, WB_HI));
  ui.wbG.value = String(toPos(params.wb[1], WB_LO, WB_HI));
  ui.wbB.value = String(toPos(params.wb[2], WB_LO, WB_HI));
  ui.expo.value = String(toPos(params.exposure, EX_LO, EX_HI));
  ui.dn.value = String(params.denoise);
  ui.recover.value = String(params.recover ?? 0);
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
  ui.sharpen.value = String(params.sharpen);
  ui.texture.value = String(params.texture);
  ui.skyHue.value = String(params.sky[0]);
  ui.skySat.value = String(params.sky[1]);
  ui.skyLum.value = String(params.sky[2]);
  ui.folHue.value = String(params.foliage[0]);
  ui.folSat.value = String(params.foliage[1]);
  ui.folLum.value = String(params.foliage[2]);
  {
    const t = activeTone();
    for (let i = 0; i < 5; i++) {
      ui.tones[i].value = String((t[i] - TONE_DEFAULT[i]) * 100);
    }
  }
  updateToneChanUI();
  updateToneWidget();
  updateBandLabels();
  updateHslUI();
  updateBwUI();
  updateGradeUI(); // hoisted; wheels/grain/vignette follow undo/redo/loads too
  updateMix3UI(); // hoisted; channel mixer follows undo/redo/loads too
  updateStickerUI(); // hoisted; sticker controls follow undo/redo/session restore
  syncLutUI(); // hoisted; reflects params.lut so undo/redo/reset/loads all update the LUT row
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

// IR-tab Auto WB: rebalance to this photo's own neutral, clearing any WB bias
// a look baked in — the quick way back OUT of a look choice. WB only: it never
// touches exposure, swap, saturation or the rest of the look.
ui.irAutoWb.addEventListener("click", () => {
  if (!current) return;
  params.wb = grayWorldWB(current);
  lookBias = [1, 1, 1];
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
  params.toneR = [...TONE_DEFAULT];
  params.toneG = [...TONE_DEFAULT];
  params.toneB = [...TONE_DEFAULT];
  params.lum = 1;
  params.hsl = hslDefault();
  params.bwOn = false;
  params.bwMix = [1, 1, 1];
  params.grade = [...GRADE_DEFAULT];
  params.grainAmt = 0;
  params.grainSize = 1.5;
  params.vigAmt = 0;
  params.vigMid = 0.5;
  params.mix3 = [...MIX3_DEFAULT];
  // A look replaces the whole creative state, including everything the lift
  // wrote — so re-solve against the look that is now on the frame. This is what
  // makes Aerochrome look like Aerochrome on a frame with no sky in it without
  // a second press.
  liftApplied = null;
  if (autoLift) applyLift(true); // a look IS on the frame now
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
  restripForGrade();
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
    toneR: [...(p.toneR ?? TONE_DEFAULT)] as [number, number, number, number, number],
    toneG: [...(p.toneG ?? TONE_DEFAULT)] as [number, number, number, number, number],
    toneB: [...(p.toneB ?? TONE_DEFAULT)] as [number, number, number, number, number],
    lum: p.lum,
    recover: p.recover ?? 0,
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
    sharpen: p.sharpen,
    texture: p.texture,
    hsl: [...(p.hsl ?? hslDefault())],
    bwOn: !!p.bwOn,
    bwMix: [...(p.bwMix ?? [1, 1, 1])] as [number, number, number],
    grade: [...(p.grade ?? GRADE_DEFAULT)],
    grainAmt: p.grainAmt ?? 0,
    grainSize: p.grainSize ?? 1.5,
    vigAmt: p.vigAmt ?? 0,
    vigMid: p.vigMid ?? 0.5,
    mix3: [...(p.mix3 ?? MIX3_DEFAULT)],
    spots: (p.spots ?? []).map((s) => ({ ...s })),
    // corners + match arrays are nested — deep-copy so an undo snapshot doesn't
    // share the live sticker's perspective/transfer (the mask rides by ref,
    // copy-on-write).
    stickers: (p.stickers ?? []).map((s) => ({
      ...s,
      corners: s.corners ? s.corners.map((c) => [c[0], c[1]] as [number, number]) : s.corners,
      matchGain: s.matchGain ? ([...s.matchGain] as [number, number, number]) : s.matchGain,
      matchScene: s.matchScene ? ([...s.matchScene] as [number, number, number]) : s.matchScene,
    })),
    // The warp field is SHARED by reference (copy-on-write per stroke, like the
    // brush bitmaps) — a snapshot's field is immutable once a new stroke clones.
    warp: p.warp ?? null,
    crop: { ...(p.crop ?? CROP_DEFAULT) },
    straighten: p.straighten ?? 0,
    // The LUT wrapper is cloned (a strength drag must not mutate history) but
    // its lattice `data` is SHARED by reference — immutable once imported,
    // same copy-on-write rationale as the brush bitmaps above.
    lut: p.lut ? { ...p.lut } : null,
  };
}

// Snapshot signature for undo equality — cheap: skips the brush pixel buffers
// (a stroke bumps the mask's `rev`, which IS compared) and the imported LUT's
// Float32Array lattice (its wrapper `id`/`strength` ARE compared, and the
// lattice is immutable per id) so we never serialise hundreds of KB per frame.
function snapSig(s: Snapshot): string {
  return JSON.stringify(s, (k, v) => (k === "data" && (v instanceof Uint8Array || v instanceof Float32Array) ? undefined : v));
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
  params.recover = c.recover ?? 0;
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
  params.toneR = c.toneR;
  params.toneG = c.toneG;
  params.toneB = c.toneB;
  params.lum = c.lum;
  params.masks = c.masks;
  params.hotspot = c.hotspot;
  params.hotspotSize = c.hotspotSize;
  params.vignette = c.vignette;
  params.clarity = c.clarity ?? 0;
  params.dehaze = c.dehaze ?? 0;
  params.sharpen = c.sharpen ?? 0;
  params.texture = c.texture ?? 0;
  params.hsl = c.hsl?.length === 24 ? c.hsl : hslDefault();
  params.bwOn = c.bwOn;
  params.bwMix = c.bwMix;
  params.grade = c.grade?.length === 7 ? c.grade : [...GRADE_DEFAULT];
  params.grainAmt = c.grainAmt ?? 0;
  params.grainSize = c.grainSize ?? 1.5;
  params.vigAmt = c.vigAmt ?? 0;
  params.vigMid = c.vigMid ?? 0.5;
  params.mix3 = c.mix3?.length === 9 ? c.mix3 : [...MIX3_DEFAULT];
  params.spots = c.spots ?? [];
  params.stickers = c.stickers ?? [];
  params.crop = c.crop ?? { ...CROP_DEFAULT };
  params.straighten = c.straighten ?? 0;
  // Read the LUT from the SNAPSHOT directly, never from the {...params} merge
  // above: a pre-LUT-era snapshot (or a session-resume JSON, which strips it)
  // has NO lut key, and that must mean "no LUT" — silently inheriting the live
  // photo's LUT would be wrong. The instanceof guard also keeps a revived JSON
  // snapshot (whose data can't be a real Float32Array) from half-activating.
  const sl = s.params.lut;
  params.lut = sl && sl.data instanceof Float32Array ? { ...sl } : null;
  // Warp from the SNAPSHOT directly (same reasoning as the LUT): a session JSON
  // strips it, and a revived JSON warp has no real Float32Array to sample.
  const sw = s.params.warp;
  params.warp = sw && sw.du instanceof Float32Array ? sw : null;
  activeLook = s.activeLook ?? null;
  lookBias = (s.lookBias ? [...s.lookBias] : [1, 1, 1]) as [number, number, number];
  if (selectedMask >= params.masks.length) selectedMask = params.masks.length - 1;
  syncToUI();
  updateLookUI();
  updateMaskUI();
  renderMaskOverlay();
  updateHealUI();
  if (cropArmed) {
    straightenSlider.value = String(params.straighten);
    straightenVal.textContent = `${params.straighten.toFixed(1)}°`;
  }
  draw();
}

const undoStack: Snapshot[] = [];
const redoStack: Snapshot[] = []; // undone states, waiting to be redone; any new edit clears it
let settled: Snapshot | null = null; // last recorded state (advances on settle)
let baseline: Snapshot | null = null; // fresh-open automatic baseline (Reset target)
let recordTimer = 0;
const HISTORY_MAX = 100;

const undoBtn = $("undoBtn") as HTMLButtonElement;
const redoBtn = $("redoBtn") as HTMLButtonElement;
const resetBtn = $("resetBtn") as HTMLButtonElement;

function updateEditButtons() {
  undoBtn.disabled = undoStack.length === 0;
  redoBtn.disabled = redoStack.length === 0;
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
    redoStack.length = 0; // a genuinely new edit abandons the redo future
    settled = now;
    updateEditButtons();
  }
}

function recordSoon() {
  if (!settled || painting || stkCornerLive || stkHandleLive) return; // a stroke/corner/handle-drag commits once, on pointerup
  clearTimeout(recordTimer);
  recordTimer = window.setTimeout(flushRecord, 350);
}

function undo() {
  flushRecord(); // fold any in-flight edit into history first
  const prev = undoStack.pop();
  if (!prev) return;
  redoStack.push(settled!); // remember the state we're stepping back from, so Redo can return to it
  applySnapshot(prev);
  if (healReview) setHealReview(true); // re-validate: spot count changed (or hit zero) under review
  settled = snapshot(); // now == prev; don't let the repaint re-record it
  clearTimeout(recordTimer);
  recordTimer = 0;
  updateEditButtons();
}

function redo() {
  const next = redoStack.pop(); // no flushRecord here — it would clear the redo future we're walking
  if (!next) return;
  undoStack.push(settled!); // the state we're leaving becomes an undo step again
  if (undoStack.length > HISTORY_MAX) undoStack.shift();
  applySnapshot(next);
  if (healReview) setHealReview(true);
  settled = snapshot(); // now == next; don't re-record the repaint
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
redoBtn.addEventListener("click", redo);
resetBtn.addEventListener("click", resetEdit);

// --- Saved-look slots: five localStorage-backed memory slots that persist
// across sessions. A slot stores a full snapshot; loading applies it as one
// undoable step. Slots are global (not per photo) so a look can be reused. ---
const SLOTS = 5;
const slotKey = (i: number) => `ips-look-slot-${i}`;
const slotList = $("slotList") as HTMLDivElement;
const slotEls: { name: HTMLSpanElement; save: HTMLButtonElement; load: HTMLButtonElement; more: HTMLButtonElement }[] = [];

// A saved look is the CREATIVE grade only — no per-shot white balance, exposure
// or denoise — so it drops onto any photo on top of that photo's own balance
// (matching how the built-in Looks behave). Sharpen/Texture DO ride along: they
// are user intent, not auto-measured per photo the way denoise is. Undo/Reset
// snapshots stay full. The SavedLook type and its hardened coercion live in
// look.ts, shared with the share/import paths (links, files, codes).

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
    toneR: [...params.toneR] as [number, number, number, number, number],
    toneG: [...params.toneG] as [number, number, number, number, number],
    toneB: [...params.toneB] as [number, number, number, number, number],
    lum: params.lum,
    clarity: params.clarity,
    dehaze: params.dehaze,
    sharpen: params.sharpen,
    texture: params.texture,
    hsl: [...params.hsl],
    bwOn: params.bwOn,
    bwMix: [...params.bwMix] as [number, number, number],
    grade: [...(params.grade ?? GRADE_DEFAULT)],
    grainAmt: params.grainAmt ?? 0,
    grainSize: params.grainSize ?? 1.5,
    vigAmt: params.vigAmt ?? 0,
    vigMid: params.vigMid ?? 0.5,
    mix3: [...(params.mix3 ?? MIX3_DEFAULT)],
  };
}

/** A slot's look may reference an imported LUT stored in IndexedDB (luts.ts).
 *  The ref lives OUTSIDE the SavedLook wire fields — shared links/files/codes
 *  never carry it (look.ts encodeLookPayload's fixed key list). */
type SlotLook = NamedLook & { lutId?: string; lutStrength?: number };

/** Parse a saved slot, tolerating older full-snapshot slots ({params:{…}}) and
 *  coercing every field (look.ts coerceLook) so a stale or partial slot can't
 *  corrupt the edit. Slots may carry an optional user-given name + LUT ref. */
function readSlot(i: number): SlotLook | null {
  const raw = localStorage.getItem(slotKey(i));
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    const s = o?.params ?? o; // accept {params:{…}} (old full snapshot) or flat
    const look = coerceLook(s);
    if (look) {
      const name = cleanName(o?.name ?? s?.name);
      const out: SlotLook = name ? { ...look, name } : look;
      const lutId = o?.lutId ?? s?.lutId;
      if (typeof lutId === "string" && /^[A-Za-z0-9-]{1,64}$/.test(lutId)) {
        out.lutId = lutId;
        const st = Number(o?.lutStrength ?? s?.lutStrength);
        out.lutStrength = isFinite(st) ? Math.min(1, Math.max(0, st)) : 1;
      }
      return out;
    }
  } catch {
    /* corrupt slot — treat as empty */
  }
  return null;
}

/** The display label for a slot: its user-given name, else "Slot N". */
const slotLabel = (i: number, look: NamedLook | null) => look?.name ?? `Slot ${i + 1}`;

function saveSlot(i: number) {
  if (!current) return;
  // Overwriting a slot's grade KEEPS its name — the name labels the slot until
  // the user renames it, not the particular grade that was in it. The current
  // edit's imported LUT rides along as a ref (id + strength; the lattice
  // stays in IndexedDB) — it IS part of the grade being saved.
  const name = readSlot(i)?.name;
  const rec: Record<string, unknown> = { ...currentLook() };
  if (name) rec.name = name;
  if (params.lut) {
    rec.lutId = params.lut.id;
    rec.lutStrength = params.lut.strength;
  }
  localStorage.setItem(slotKey(i), JSON.stringify(rec));
  updateSlotUI();
}

/** Write a look (e.g. one received via link/file/code) into a slot. */
function writeSlot(i: number, look: SavedLook, name?: string) {
  const clean = cleanName(name);
  localStorage.setItem(slotKey(i), JSON.stringify(clean ? { ...look, name: clean } : { ...look }));
  updateSlotUI();
}

/** Rename a slot in place (empty name clears it). No-op on an empty slot. */
function renameSlot(i: number, name: string) {
  const look = readSlot(i);
  if (!look) return;
  const { name: _old, ...bare } = look;
  writeSlot(i, bare, name);
}

/** Apply a creative grade to the open photo as ONE atomic undo step — shared
 *  by slot loads and looks received via link/file/code. Keeps this photo's
 *  white balance, exposure and denoise. `lut` is the resolved imported LUT
 *  when the look carries one — a look WITHOUT one clears any active LUT (a
 *  look is the whole creative grade). */
function applySavedLook(look: SavedLook, lut: EditParams["lut"] = null) {
  if (!current) return;
  flushRecord(); // settle current edits
  params.lut = lut;
  params.swapRB = look.swapRB;
  params.hue = look.hue;
  params.sat = look.sat;
  params.contrast = look.contrast;
  params.tint = [...look.tint];
  params.glow = look.glow;
  params.sky = [...look.sky];
  params.foliage = [...look.foliage];
  params.tone = [...look.tone];
  params.toneR = [...look.toneR];
  params.toneG = [...look.toneG];
  params.toneB = [...look.toneB];
  params.lum = look.lum;
  params.clarity = look.clarity;
  params.dehaze = look.dehaze;
  params.sharpen = look.sharpen;
  params.texture = look.texture;
  params.hsl = [...look.hsl];
  params.bwOn = look.bwOn;
  params.bwMix = [...look.bwMix] as [number, number, number];
  params.grade = [...look.grade];
  params.grainAmt = look.grainAmt;
  params.grainSize = look.grainSize;
  params.vigAmt = look.vigAmt;
  params.vigMid = look.vigMid;
  params.mix3 = [...look.mix3];
  activeLook = null; // a loaded custom grade isn't one specific built-in look
  clampToneOrder();
  syncToUI();
  updateLookUI();
  draw();
  flushRecord(); // record the load as one atomic undo step
}

async function loadSlot(i: number) {
  const look = readSlot(i);
  if (!look || !current) return;
  // Resolve the LUT ref BEFORE the atomic apply, so the load is still one
  // undo step. A deleted LUT degrades honestly: grade applies without it.
  let lut: EditParams["lut"] = null;
  if (look.lutId) {
    const rec = await getLut(look.lutId).catch(() => null);
    if (rec) lut = { id: rec.id, name: rec.name, size: rec.size, data: rec.data, strength: look.lutStrength ?? 1 };
    else toast("This look's LUT was deleted from this device — applied without it", 3200);
  }
  applySavedLook(look, lut);
  syncLutUI();
}

function updateSlotUI() {
  for (let i = 0; i < SLOTS; i++) {
    const look = readSlot(i);
    const filled = !!look;
    // A TEXT badge (never colour-only) marks a look that carries an imported LUT.
    slotEls[i].name.textContent = filled ? `${slotLabel(i, look)} ✓${look?.lutId ? " · LUT" : ""}` : `Slot ${i + 1}`;
    const withLut = look?.lutId ? ", with imported LUT" : "";
    slotEls[i].save.disabled = !current;
    slotEls[i].save.setAttribute("aria-label", `Save current edit to ${slotLabel(i, look)}`);
    slotEls[i].load.disabled = !filled || !current;
    slotEls[i].load.setAttribute("aria-label", `Load ${slotLabel(i, look)}${withLut}`);
    slotEls[i].more.disabled = !filled;
    slotEls[i].more.setAttribute("aria-label", `Name and share ${slotLabel(i, look)}${withLut}`);
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
  const more = document.createElement("button");
  more.type = "button";
  more.className = "slot-more";
  more.textContent = "⋯";
  save.addEventListener("click", () => saveSlot(i));
  load.addEventListener("click", () => void loadSlot(i));
  more.addEventListener("click", () => openLookDlg(i));
  row.append(name, save, load, more);
  slotList.append(row);
  slotEls.push({ name, save, load, more });
}
updateSlotUI(); // reflect any slots saved in a previous session

let raf = 0;
let lastToneKey = "";
function draw() {
  recordSoon();
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const key = [params.tone, params.toneR, params.toneG, params.toneB].map((t) => t.join(",")).join(";");
    if (key !== lastToneKey) {
      lastToneKey = key;
      renderer.setToneCurve(params.tone, params.toneR, params.toneG, params.toneB);
    }
    syncSpotsToTexture(); // heals live in the texture; keep it matching params
    syncWarpField(); // the warp field lives in a texture too
    // While a geometry tool is armed, render the WHOLE tilted photo (an outset
    // "fit" view so a rotated photo isn't clipped by the frame); the crop box
    // overlays it and the real crop only takes effect on exit. See setGeoMode.
    renderer.render(cropArmed ? { ...params, crop: fitViewCrop() } : params);
    refreshHistogram(params);
    positionMaskOverlay();
    positionHealOverlay();
    positionCropOverlay();
    if (stickerReady) positionStickerOverlay();
  });
}

// --- Per-channel curves: the chips retarget the SAME curve widget + sliders
// onto the master curve (All) or one color channel's own curve. State is
// ✓-text + aria-pressed (the mix-chip pattern); a channel whose curve is
// non-identity wears a "•" TEXT badge so it's findable at a glance. ---
const TONE_CHANNELS = [
  { label: "All", cls: "" },
  { label: "Red", cls: "tone-r" },
  { label: "Green", cls: "tone-g" },
  { label: "Blue", cls: "tone-b" },
] as const;
let toneChannel: 0 | 1 | 2 | 3 = 0;
function activeTone(): [number, number, number, number, number] {
  return toneChannel === 1 ? params.toneR : toneChannel === 2 ? params.toneG : toneChannel === 3 ? params.toneB : params.tone;
}
const toneChanBtns: HTMLButtonElement[] = [];
{
  const row = $("toneChans") as HTMLDivElement;
  TONE_CHANNELS.forEach((_def, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "mix-chip";
    b.addEventListener("click", () => {
      toneChannel = i as 0 | 1 | 2 | 3;
      syncToUI(); // sliders re-read the newly active curve; chips + widget refresh
    });
    row.append(b);
    toneChanBtns.push(b);
  });
}

function updateToneChanUI() {
  const curves = [params.tone, params.toneR, params.toneG, params.toneB];
  toneChanBtns.forEach((b, i) => {
    const on = i === toneChannel;
    const tweaked = !toneIsIdentity(curves[i]);
    b.textContent = (on ? "✓ " : "") + TONE_CHANNELS[i].label + (tweaked ? " •" : "");
    b.setAttribute("aria-pressed", String(on));
    b.setAttribute("aria-label", `${TONE_CHANNELS[i].label} curve${tweaked ? " — adjusted" : ""}`);
  });
  $("toneReset").textContent = toneChannel === 0 ? "Reset tone" : `Reset ${TONE_CHANNELS[toneChannel].label.toLowerCase()} curve`;
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
        activeTone()[i] = 1 - vb / 100;
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
  const t = activeTone();
  const fn = toneEvaluator(t);
  let d = "";
  for (let s = 0; s <= 64; s++) {
    const x = s / 64;
    d += `${s === 0 ? "M" : "L"}${(x * 100).toFixed(1)},${((1 - fn(x)) * 100).toFixed(1)}`;
  }
  tonePath.setAttribute("d", d);
  tonePath.setAttribute("class", "tone-path " + TONE_CHANNELS[toneChannel].cls);
  for (let i = 0; i < 5; i++) {
    toneDots[i].setAttribute("cy", String((1 - t[i]) * 100));
  }
}

$("toneReset").addEventListener("click", () => {
  const t = activeTone();
  for (let i = 0; i < 5; i++) t[i] = TONE_DEFAULT[i];
  syncToUI();
  draw();
  flushRecord();
});

// --- Sectioned tab panel: segmented tabs, one section of controls each.
// The active tab is remembered per session so reopening lands where you left.
const PANEL_TABS = ["basic", "ir", "bw", "color", "tone", "masks", "corrections", "export", "crop", "grade", "stickers", "warp"] as const;
type PanelTab = (typeof PANEL_TABS)[number];
const TAB_META: Record<PanelTab, { name: string; sub: string }> = {
  basic: { name: "Basic", sub: "White balance, exposure & detail" },
  ir: { name: "IR", sub: "Channel swap & looks" },
  bw: { name: "Black & white", sub: "Channel-mix mono, made for 720nm" },
  color: { name: "Color", sub: "Hue, per-color & the mixer" },
  tone: { name: "Tone", sub: "Curve, luminance & bands" },
  masks: { name: "Masks", sub: "Local, area-only adjustments" },
  corrections: { name: "Corrections", sub: "Dust, spots & IR lens fixes" },
  export: { name: "Export", sub: "Save, my looks & profiles" },
  grade: { name: "Grade", sub: "Color wheels, toned mono, grain & vignette" },
  stickers: { name: "Stickers", sub: "Drop UFOs into the trees" },
  warp: { name: "Warp", sub: "Push, swirl, pinch & bloat" },
  crop: { name: "Crop & rotate", sub: "Rotate, crop & straighten" },
};
const panelTabsEl = $("panelTabs") as HTMLElement;
const sectionTitleEl = $("sectionTitle") as HTMLElement;
const sectionSubEl = $("sectionSub") as HTMLElement;
const panelSections = Array.from(panelBody.querySelectorAll<HTMLElement>(".section"));
const panelTabBtns = Array.from(panelTabsEl.querySelectorAll<HTMLButtonElement>(".ptab"));

// The mask handle overlay belongs to the Masks tab only — track the active tab
// so switching away (or a lesson opening another tab) hides it. `overlayReady`
// gates the refresh until the overlay's DOM + deps exist (the init call below
// runs before they're declared).
let activePanelTab: PanelTab = "basic";
let overlayReady = false;
let stickerReady = false; // set true once the sticker block below has run
let warpReady = false; // set true once the warp block below has run

function setPanelTab(tab: PanelTab) {
  if (!PANEL_TABS.includes(tab)) return;
  activePanelTab = tab;
  panelSections.forEach((s) => (s.hidden = s.dataset.tab !== tab));
  panelTabBtns.forEach((b) => {
    const on = b.dataset.tab === tab;
    b.classList.toggle("active", on);
    b.setAttribute("aria-selected", String(on));
    b.tabIndex = on ? 0 : -1; // roving tabindex — one Tab stop, arrows move within
  });
  sectionTitleEl.textContent = TAB_META[tab].name;
  sectionSubEl.textContent = TAB_META[tab].sub;
  panelBody.scrollTop = 0;
  try {
    localStorage.setItem("ir-panel-tab", tab);
  } catch {
    /* private mode — tab just isn't remembered across reloads */
  }
  updateScrollCues();
  // re-entering the Masks tab restores the coverage tint (guarded: the overlay
  // system — and maskAdjusting itself — only exists once overlayReady is set).
  if (overlayReady) { maskAdjusting = false; renderMaskOverlay(); }
  // The Stickers tab arms sticker manipulation on the canvas (drag to move);
  // leaving it disarms. Guarded on stickerReady so the init-time setPanelTab
  // (before the sticker block runs) is a no-op.
  if (stickerReady) setStickerMode(activePanelTab === "stickers");
  // The Warp tab arms finger-painting the displacement field. Same guard.
  if (warpReady) setWarpMode(activePanelTab === "warp");
}
panelTabBtns.forEach((b) => b.addEventListener("click", () => setPanelTab(b.dataset.tab as PanelTab)));
// Keyboard tab traversal: Left/Right (wrapping) and Home/End move focus AND
// select — the tab grid wraps visually, so a 1-D order is what fingers expect.
panelTabsEl.addEventListener("keydown", (e) => {
  const i = panelTabBtns.findIndex((b) => b === document.activeElement);
  if (i < 0) return;
  let to = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") to = (i + 1) % panelTabBtns.length;
  else if (e.key === "ArrowLeft" || e.key === "ArrowUp") to = (i - 1 + panelTabBtns.length) % panelTabBtns.length;
  else if (e.key === "Home") to = 0;
  else if (e.key === "End") to = panelTabBtns.length - 1;
  if (to < 0) return;
  e.preventDefault();
  panelTabBtns[to].focus();
  setPanelTab(panelTabBtns[to].dataset.tab as PanelTab);
});
// Restore the last-used tab (default Basic).
{
  let saved: string | null = null;
  try {
    saved = localStorage.getItem("ir-panel-tab");
  } catch {
    /* ignore */
  }
  setPanelTab((saved && (PANEL_TABS as readonly string[]).includes(saved) ? saved : "basic") as PanelTab);
}

for (const el of [ui.wbR, ui.wbG, ui.wbB, ui.expo, ui.dn, ui.recover, ui.hue, ui.sat, ui.con, ui.glow, ui.lum,
  ui.hotspot, ui.hotspotSize, ui.vignette, ui.clarity, ui.dehaze, ui.sharpen, ui.texture,
  ui.skyHue, ui.skySat, ui.skyLum, ui.folHue, ui.folSat, ui.folLum, ...ui.tones]) {
  el.addEventListener("input", syncFromUI);
}

/** The version number is the way in to the two things you need when something
 *  is wrong: the report that says what this device IS, and a page that measures
 *  what it can DO. Both were missing entirely — the version was a dead label,
 *  and every performance question about the real device ended in a guess. */
function wireVersionMenu() {
  const dlg = document.getElementById("verDlg") as HTMLDialogElement | null;
  const tag = document.getElementById("verTag");
  if (!dlg || !tag) return;
  const text = document.getElementById("verDlgText") as HTMLTextAreaElement;
  const copyBtn = document.getElementById("verCopy") as HTMLButtonElement;
  (document.getElementById("verDlgVer") as HTMLElement).textContent = `Infrared Photography Studio v${__APP_VERSION__}`;
  document.getElementById("verClose")!.addEventListener("click", () => dlg.close());
  const open = async () => {
    text.value = "Gathering…";
    dlg.showModal();
    // Counts only. What is open is useful; WHICH photos is nobody's business
    // but the reader's, and a report that carries a filename is a report that
    // cannot safely be pasted anywhere.
    const real = sessionPhotos.filter((p) => p.id !== "lone").length;
    text.value = await buildDiagnostic(__APP_VERSION__, [
      { k: "Open now", v: current ? `a photo is open${real >= 2 ? ` in a session of ${real}` : ""}` : "nothing open" },
      { k: "Restore depth", v: autoLift ? `on at ${Math.round(liftAmount * 100)}% strength` : "off" },
    ]);
  };
  tag.addEventListener("click", open);
  // The version number is where this LIVES, and nobody with a problem thinks to
  // press a version number. The ⓘ is where they look, so it points here — one
  // dialog, two ways in, rather than a second copy of the report.
  document.getElementById("infoDiag")?.addEventListener("click", () => {
    (document.getElementById("infoDlg") as HTMLDialogElement | null)?.close();
    void open();
  });
  copyBtn.addEventListener("click", async () => {
    const was = copyBtn.textContent;
    try {
      await navigator.clipboard.writeText(text.value);
      copyBtn.textContent = "Copied";
    } catch {
      // Refused — select it so it can still be copied by hand. Never a button
      // that looks like it worked and did not.
      text.focus();
      text.select();
      copyBtn.textContent = "Selected — press Copy";
    }
    setTimeout(() => { copyBtn.textContent = was; }, 2200);
  });
}

// --- Restore depth ------------------------------------------------------
// The complaint this answers: an infrared frame with no open sky in it opens
// pale and grey however it is graded. Measured across the 44 bundled practice
// frames at their open baseline with Aerochrome on — the ones WITH sky land at
// a median luminance near 0.44, warm-half (foliage, ground, bark) saturation
// near 0.35 and cool-half near 0.50; the ones WITHOUT land at 0.50–0.67 median
// luminance and 0.16–0.24 warm saturation. That gap is what "drab" is, and it
// is a full stop of lift and half the colour.
//
// Neither automatic is wrong. Auto exposure anchors the 97th percentile at
// 0.85 (dcraw's auto-bright shape), so a histogram with no dark region gets
// lifted whole. Gray-world balance makes the frame's own average neutral —
// and in an infrared frame that is nine tenths foliage, the average IS the
// foliage, so the balance neutralises the one material the false-colour looks
// need a cast on. There is no white balance that both neutralises the dominant
// material and leaves it coloured, so the colour has to come from the creative
// layer. That is what this is: an explicit press, landing on the tone points
// and the two band sliders, one undo step, and a no-op on a frame that already
// measures where it should be.
const FLAT_LUM_REF = 0.44;
const FLAT_WARM_REF = 0.35;
const FLAT_COOL_REF = 0.5;
const FLAT_TONE_MAX = 0.22; // the tone points clamp at ±0.25 of their default
// "Shadows alive", as a measurement rather than a taste guess: the pull may not
// take the frame's lower quartile below half of where it started. Relative on
// purpose — an absolute floor stops dead on a frame that already contains real
// black (a shaded wood at midday: its 5th percentile is 0.000 before anything
// is done to it) and would refuse the pull its midtones plainly need.
// On by default, and remembered — the point of it is that a photo opens the
// best it can without anyone having to press anything. It is a STATE, not an
// action, so it reads and behaves like the R<->B swap: pressed means the frame
// is adapted, and pressing it again puts it back.
let autoLift = localStorage.getItem("ips-autolift") !== "0";
/** How far the correction goes, 0..1. 1 is the full correction the solve worked
 *  out for THIS frame — a bisection onto FLAT_LUM_REF bounded by a shadow
 *  floor, and scaleLift interpolates linearly from neutral to that answer. So 1
 *  is not a maximum, it is the calibrated target, and it is where every photo
 *  now opens.
 *
 *  IT USED TO PERSIST, and that is why it did not open there. Backing the
 *  strength off once wrote it to localStorage, so every later photo — and every
 *  later visit — opened at whatever that one photograph had needed. A value
 *  solved per-frame cannot be carried to the next frame and still be the
 *  answer. It stays live for the session and starts each visit at the solve.
 *
 *  (The reading it replaces is also why the default is written plainly here:
 *  `Number(null)` is 0 and 0 passes every range check, so a stored-value read
 *  that never asked whether there WAS one defaulted a fresh install to zero
 *  strength — the automatic switched on, visibly on, and doing nothing.) */
let liftAmount = 1;

/** Take a solved lift part of the way. Scaling the ANSWER rather than the
 *  targets keeps the solve idempotent and keeps every intermediate value on the
 *  same sliders — half strength is half the tone pull and half the extra
 *  saturation, not a different correction. */
function scaleLift<T extends { tone: number[]; foliage: number[]; sky: number[]; pull: number }>(r: T, amt: number): T {
  if (amt >= 1) return r;
  const mix = (from: number, to: number) => from + (to - from) * amt;
  return {
    ...r,
    tone: r.tone.map((v, i) => mix(TONE_DEFAULT[i], v)),
    foliage: [r.foliage[0], mix(1, r.foliage[1]), r.foliage[2]],
    sky: [r.sky[0], mix(1, r.sky[1]), r.sky[2]],
    pull: r.pull * amt,
  };
}
const FLAT_SHADOW_KEEP = 0.5;
const FLAT_SHADOW_FLOOR = 0.02;
// Divisions along the short edge of the sampling grid. It runs on every open
// now, not on a button press, so its cost is paid on every photo — and it is
// resolution-independent (a fixed grid, not a fraction of the pixels), so this
// number IS the cost. 64 was checked against 128 across the practice set before
// it was lowered: see the calibration note in NOTES.
const LIFT_GRID = 64;
const LIFT_BISECT = 6;
const FLAT_BAND_MAX = 2; // the sky/foliage saturation sliders' own ceiling
/** A band with nothing done to it: hue shift 0, saturation 1, lightness 1 —
 *  the same triple `pcReset` writes and the same one `makeThumb` starts from.
 *  Named because three places were spelling it out and a fourth needed it. */
const BAND_NEUTRAL: [number, number, number] = [0, 1, 1];

/** Median luminance and per-band saturation of the frame as the given params
 *  render it — sampled on a coarse grid through the SAME compileEdit the
 *  preview and the export use, so what is measured is what is shown. Bands are
 *  weighted by the pipeline's own bandWeight, never a second definition of
 *  "cool". */
function measureFrame(p: EditParams, img: DecodedImage, divisions = LIFT_GRID): { lumP50: number; lumP25: number; warmSat: number; coolSat: number } {
  const step = Math.max(1, Math.floor(Math.min(img.width, img.height) / divisions));
  const edit = compileEdit(p, img.camMatrix, img.width / Math.max(1, img.height));
  const px = new Float32Array(3);
  const lums: number[] = [];
  let warmW = 0, warmS = 0, coolW = 0, coolS = 0;
  for (let y = 0; y < img.height; y += step) {
    for (let x = 0; x < img.width; x += step) {
      const [r, g, b] = linearAt(img, x, y);
      edit(r, g, b, px, 0, undefined, undefined);
      const cr = clamp(px[0], 0, 1), cg = clamp(px[1], 0, 1), cb = clamp(px[2], 0, 1);
      lums.push(0.2126 * cr + 0.7152 * cg + 0.0722 * cb);
      const [h, sat] = rgb2hsv(cr, cg, cb);
      const wS = bandWeight(h, p.swapRB ? 30 : 210, 55, 105);
      coolW += wS; coolS += sat * wS;
      warmW += 1 - wS; warmS += sat * (1 - wS);
    }
  }
  lums.sort((a, b) => a - b);
  return {
    lumP50: lums[lums.length >> 1] ?? 0,
    lumP25: lums[Math.floor(lums.length * 0.25)] ?? 0,
    warmSat: warmW > 0 ? warmS / warmW : 0,
    coolSat: coolW > 0 ? coolS / coolW : 0,
  };
}

/** The tone curve for a black-point pull of `k`: the shadow point moves the
 *  full distance, the mid and three-quarter points progressively less, so the
 *  highlights stay where the exposure put them. k = 0 is the identity. */
function flatTone(k: number): [number, number, number, number, number] {
  return [0, TONE_DEFAULT[1] - k, TONE_DEFAULT[2] - k * 0.55, TONE_DEFAULT[3] - k * 0.2, 1];
}

/** Solve the lift for the CURRENT photo as it is currently rendered, and return
 *  the values to apply — or null when the frame already measures where a frame
 *  with open sky lands, which is the no-op case and must stay one. Pure: it
 *  changes nothing, so open, applyLook and the toggle can all use it. */
function solveLift(withColour: boolean, img: DecodedImage, params: EditParams): { tone: [number, number, number, number, number]; foliage: [number, number, number]; sky: [number, number, number]; pull: number } | null {
  // Measure the frame WITHOUT a lift on it. The creative grade — tone included
  // — carries across opens by design, so `params.tone` on a fresh open is
  // whatever the last photo ended with; measuring that and then deciding
  // "already dark enough" left the previous photo's curve sitting on this one,
  // and a chain of opens ratcheted the whole set down (measured: medians
  // reaching 0.167 against a 0.44 target). Solving from the default curve every
  // time makes it idempotent: the same frame gives the same answer however many
  // times this runs, and pressing the toggle twice is a round trip.
  const base = cloneParams(params);
  base.tone = [...TONE_DEFAULT] as typeof base.tone;
  // THE SAME ARGUMENT, FOR THE OTHER TWO. The paragraph above was written about
  // tone and the fix was applied to tone alone, while sky and foliage carry
  // across opens exactly as tone does — so the frame being MEASURED still wore
  // the previous photo's band boost. Two consequences, both reported: the
  // saturation tests could read as already satisfied and the lift did nothing
  // at open, and where it did fire it solved against a boosted measurement, so
  // pressing the toggle off and on (which restores the bands first) produced a
  // different answer from the one the photo opened with. A toggle whose two
  // states disagree is the bug; making all three start from neutral is what
  // makes the solve idempotent.
  base.sky = [...BAND_NEUTRAL] as typeof base.sky;
  base.foliage = [...BAND_NEUTRAL] as typeof base.foliage;
  const before = measureFrame(base, img);
  // Only ever pull DOWN and push UP: a frame already at or past the reference
  // is left exactly as it is rather than being dragged to the average.
  //
  // The COLOUR half runs only when a look is on the frame. The sky and foliage
  // bands are defined by hue, and it is a look — the channel swap above all —
  // that puts a frame's materials into those bands in the first place; the
  // references were measured on frames wearing one. Solved against a bare
  // opened frame instead, nothing clears them and the boost fires on
  // everything: measured, 44 of 44 practice frames "adapted" at open with no
  // look, which is not a correction, it is a new default. The tonal half has no
  // such dependency — a frame opens too bright or it does not.
  const needsTone = before.lumP50 > FLAT_LUM_REF + 0.01;
  const needsWarm = withColour && before.warmSat < FLAT_WARM_REF - 0.01;
  const needsCool = withColour && before.coolSat < FLAT_COOL_REF - 0.01;
  if (!needsTone && !needsWarm && !needsCool) {
    // Nothing to do for THIS frame — but the tone it inherited may be a lift
    // solved for a different one, so hand back the neutral curve rather than
    // leaving that in place.
    return { tone: [...TONE_DEFAULT] as [number, number, number, number, number], foliage: [...base.foliage] as [number, number, number], sky: [...base.sky] as [number, number, number], pull: 0 };
  }
  const trial = cloneParams(base);
  const shadowFloor = Math.max(FLAT_SHADOW_FLOOR, before.lumP25 * FLAT_SHADOW_KEEP);
  let k = 0;
  if (needsTone) {
    let lo = 0, hi = FLAT_TONE_MAX;
    for (let i = 0; i < LIFT_BISECT; i++) {
      const mid = (lo + hi) / 2;
      trial.tone = flatTone(mid);
      const m = measureFrame(trial, img);
      // Two stopping conditions: the median reaching the reference, and the
      // shadows not being crushed to get there — whichever binds first.
      if (m.lumP50 > FLAT_LUM_REF && m.lumP25 > shadowFloor) lo = mid;
      else hi = mid;
    }
    k = lo;
  }
  trial.tone = flatTone(k);
  const after = measureFrame(trial, img);
  const solve = (measured: number, ref: number) => (measured > 1e-4 ? clamp(ref / measured, 1, FLAT_BAND_MAX) : 1);
  if (withColour) {
    trial.foliage = [base.foliage[0], solve(after.warmSat, FLAT_WARM_REF), base.foliage[2]];
    trial.sky = [base.sky[0], solve(after.coolSat, FLAT_COOL_REF), base.sky[2]];
    const check = measureFrame(trial, img);
    trial.foliage[1] = clamp(trial.foliage[1] * solve(check.warmSat, FLAT_WARM_REF), 1, FLAT_BAND_MAX);
    trial.sky[1] = clamp(trial.sky[1] * solve(check.coolSat, FLAT_COOL_REF), 1, FLAT_BAND_MAX);
  }
  return {
    tone: trial.tone as [number, number, number, number, number],
    foliage: trial.foliage as [number, number, number],
    sky: trial.sky as [number, number, number],
    pull: k,
  };
}

/** What the lift last wrote, so turning it off can put back what it replaced —
 *  and so a value the reader has since changed BY HAND is left alone. */
let liftApplied: { tone: string; foliage: string; sky: string; prevTone: number[]; prevFoliage: number[]; prevSky: number[] } | null = null;

/** Run the lift on the current photo. Returns what it did, for the caller to
 *  report (or not — at open it is silent; the sliders show it). */
function applyLift(withColour: boolean): { pull: number; foliage: number; sky: number } | null {
  if (!current) return null;
  const solved = solveLift(withColour, current, params);
  if (!solved) { liftApplied = null; return null; }
  const r = scaleLift(solved, liftAmount);
  const noop = r.pull === 0 && r.foliage[1] === 1 && r.sky[1] === 1;
  liftApplied = {
    // What the frame is WITHOUT a lift, which is what turning it off should
    // give back — not whatever curve the previous photo happened to leave
    // behind. Solving and reverting have to agree on that, or the toggle is not
    // a round trip (it was not: turning it off put another photo's curve on
    // this one, and the two states could not be compared).
    // All three neutral, for the reason in solveLift: the lift now solves from
    // neutral bands, so turning it off has to give neutral bands back or the
    // toggle is not a round trip.
    prevTone: [...TONE_DEFAULT], prevFoliage: [...BAND_NEUTRAL], prevSky: [...BAND_NEUTRAL],
    tone: r.tone.join(","), foliage: r.foliage.join(","), sky: r.sky.join(","),
  };
  params.tone = r.tone;
  params.foliage = r.foliage;
  params.sky = r.sky;
  if (noop) { liftApplied = null; return null; }
  return { pull: r.pull, foliage: r.foliage[1], sky: r.sky[1] };
}

/** Undo the lift, but only where its own values are still in place — anything
 *  the reader has moved since is theirs and stays. */
/** "Untouched since the lift wrote it" — WITHIN A TOLERANCE, not by string
 *  equality. The lift writes full precision; the sliders it writes to have a
 *  0.01 step, and a value that has been through syncToUI/syncFromUI comes back
 *  rounded. So `1.6537883727523084` became `1.65` and the string test could
 *  never match: turning the toggle off left the foliage boost on the frame,
 *  every time, because the check meant to protect a hand-made change was
 *  reading a rounding as one. Half a slider step is well under any deliberate
 *  move and well over the rounding. */
function untouched(live: number[], written: string): boolean {
  const w = written.split(",").map(Number);
  return live.length === w.length && live.every((v, i) => Math.abs(v - w[i]) <= 0.005);
}

function removeLift(): void {
  const a = liftApplied;
  liftApplied = null;
  if (!a) return;
  if (untouched(params.tone, a.tone)) params.tone = [...a.prevTone] as typeof params.tone;
  if (untouched(params.foliage, a.foliage)) params.foliage = [...a.prevFoliage] as typeof params.foliage;
  if (untouched(params.sky, a.sky)) params.sky = [...a.prevSky] as typeof params.sky;
}

// The toggle. Pressed = this frame is adapted; press again and it is not — the
// same shape as the R<->B swap, and on by default so nothing has to be
// remembered to get a usable photo.
/** Re-solve the open photo at the current strength. Same shape as the toggle:
 *  put back what the lift wrote, then write the new answer, one undo step. */
function reapplyLift() {
  if (!current) return;
  removeLift();
  if (autoLift) applyLift(activeLook !== null);
  syncToUI();
  draw();
}

ui.liftAmt.addEventListener("input", () => {
  liftAmount = Math.min(1, Math.max(0, Number(ui.liftAmt.value) / 100));
  updateLiftUI();
  reapplyLift();
  restripForGrade(); // the tiles are claims about this too
});
ui.liftAmt.addEventListener("change", () => flushRecord()); // one undo step per drag

function updateLiftUI() {
  ui.liftAmt.value = String(Math.round(liftAmount * 100));
  // The strength of an automatic that is off is not a live control.
  ui.liftAmt.disabled = !autoLift;
  (ui.liftAmt.closest("label") as HTMLElement | null)?.classList.toggle("is-off", !autoLift);
  // Exactly the R<->B swap's shape: a .toggle carrying aria-pressed, whose
  // pressed state is an accent fill AND a heavier weight, so it does not rest
  // on colour alone. The off/on segment pair this had first came from the LOOK
  // buttons, where the row sits on a surface background — on a pressed toggle's
  // accent fill its muted grey measured 1.01:1 in the light theme.
  ui.irLift.setAttribute("aria-pressed", String(autoLift));
}

ui.irLift.addEventListener("click", () => {
  autoLift = !autoLift;
  localStorage.setItem("ips-autolift", autoLift ? "1" : "0");
  updateLiftUI();
  if (!current) return;
  if (autoLift) {
    const did = applyLift(activeLook !== null);
    // Silent when it does something: the button shows its own state and every
    // value it wrote is on a slider a few inches away, so a popup on each press
    // is noise on a control meant to be pressed back and forth. The ONE case
    // that needs words is the one with nothing to see — a frame it decided to
    // leave alone looks identical either way, and without a line saying so the
    // button reads as broken.
    if (!did) toast("This photo already has its depth — nothing to put back.", 3200);
  } else {
    removeLift();
  }
  syncToUI();
  draw();
  flushRecord(); // one press = one undo step
});
updateLiftUI();

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
  if (on) { setTat(false); setColorPick(false); setHeal(false); setHealReview(false); setGeoMode(null); } // picture tools are mutually exclusive
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
  // Under B&W the whole display is grey — classify by the colour the mixer
  // sees instead (the pre-B&W render), so pick keeps choosing the chip that
  // controls that area's grey level.
  let px: [number, number, number] | null;
  if (params.bwOn) {
    const [uu, vv] = renderer.clientToImageUv(clientX, clientY);
    px = renderer.readUvPixel({ ...params, bwOn: false }, uu, vv);
  } else {
    px = renderer.readDisplayedPixel(clientX, clientY);
  }
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

// --- Black & white: channel-weighted mono for the near-mono 720nm frames.
// A persistent mode (the toggle announces it, and is the obvious exit), five
// named mixes, and three weight sliders feeding the same per-pixel display-
// space stage as the mixer — so it rides looks, links and .cube exports.
// Moving a weight slider with the mode off turns it on: the drag must show
// its effect, and the pressed toggle + the photo going mono announce it. ---
const BW_MIXES: { label: string; mix: [number, number, number] }[] = [
  { label: "Even", mix: [1, 1, 1] },
  { label: "Luma", mix: [0.59, 2, 0.2] }, // Rec.709 ratio — matches the eye
  { label: "Red filter", mix: [2, 0.5, 0.15] },
  { label: "Green filter", mix: [0.5, 2, 0.25] },
  { label: "Blue filter", mix: [0.2, 0.4, 2] },
];
const bwBtn = $("bwBtn") as HTMLButtonElement;
const bwMixesEl = $("bwMixes") as HTMLDivElement;
const bwUI = {
  r: $("bwR") as HTMLInputElement,
  g: $("bwG") as HTMLInputElement,
  b: $("bwB") as HTMLInputElement,
};
const bwMixBtns: HTMLButtonElement[] = [];
for (const def of BW_MIXES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.addEventListener("click", () => {
    params.bwOn = true;
    params.bwMix = [...def.mix] as [number, number, number];
    updateBwUI();
    draw();
    flushRecord();
  });
  bwMixesEl.append(b);
  bwMixBtns.push(b);
}

function updateBwUI() {
  bwBtn.setAttribute("aria-pressed", String(params.bwOn));
  bwUI.r.value = String(params.bwMix[0]);
  bwUI.g.value = String(params.bwMix[1]);
  bwUI.b.value = String(params.bwMix[2]);
  // Selected mix = aria-pressed + the "✓ " TEXT prefix (ratio-chip pattern) —
  // never colour alone. No chip matches once the sliders leave a named mix.
  bwMixBtns.forEach((b, i) => {
    const def = BW_MIXES[i];
    const on = params.bwOn && def.mix.every((v, k) => Math.abs(v - params.bwMix[k]) < 0.005);
    b.textContent = (on ? "✓ " : "") + def.label;
    b.setAttribute("aria-pressed", String(on));
  });
}

function bwWeightInput() {
  params.bwOn = true; // adjusting a weight means "show me the mono"
  params.bwMix = [Number(bwUI.r.value), Number(bwUI.g.value), Number(bwUI.b.value)];
  updateBwUI();
  draw(); // undo coalesces per drag via recordSoon, like every slider
}
bwUI.r.addEventListener("input", bwWeightInput);
bwUI.g.addEventListener("input", bwWeightInput);
bwUI.b.addEventListener("input", bwWeightInput);
bwBtn.addEventListener("click", () => {
  params.bwOn = !params.bwOn; // weights are kept — the toggle only switches the mode
  updateBwUI();
  updateGradeUI(); // the toned-mono chips key on bwOn too
  draw();
  flushRecord();
});
$("bwReset").addEventListener("click", () => {
  params.bwOn = false;
  params.bwMix = [1, 1, 1];
  updateBwUI();
  updateGradeUI();
  draw();
  flushRecord();
});
updateBwUI();

// --- Grade tab (Creative): three tint wheels + toned mono + grain/vignette.
// Each wheel is a pointer convenience over the ACCESSIBLE pair of native
// sliders (Hue/Amount) — both write the same params.grade, both refresh
// through updateGradeUI (the tone-widget pattern). Wheel drag: direction =
// hue (0° at 12 o'clock, clockwise — matching the CSS conic ring), distance
// = amount.
const GRADE_BANDS = ["Shadows", "Midtones", "Highlights"] as const;
const gradeWheelsEl = $("gradeWheels") as HTMLDivElement;
const gradeBalEl = $("gradeBal") as HTMLInputElement;
const gradeBandUI: { hue: HTMLInputElement; amt: HTMLInputElement; puck: HTMLSpanElement; val: HTMLSpanElement; wheel: HTMLDivElement }[] = [];
const WHEEL_R = 44; // px — half the .grade-wheel box; puck travel radius below
const PUCK_MAX = 33; // keep the puck's centre inside the ring

for (let band = 0; band < 3; band++) {
  const row = document.createElement("div");
  row.className = "grade-band";
  const box = document.createElement("div");
  box.className = "grade-wheel-box";
  const name = document.createElement("span");
  name.className = "grade-band-name";
  name.textContent = GRADE_BANDS[band];
  const wheel = document.createElement("div");
  wheel.className = "grade-wheel";
  // Pointer-only redundant control (the sliders + readout are the a11y path),
  // exactly like the tone-curve drag dots.
  wheel.setAttribute("aria-hidden", "true");
  const puck = document.createElement("span");
  puck.className = "grade-puck";
  wheel.append(puck);
  const val = document.createElement("span");
  val.className = "grade-band-val";
  box.append(name, wheel, val);
  const sliders = document.createElement("div");
  sliders.className = "grade-band-sliders";
  const mkSlider = (label: string, min: number, max: number, step: number) => {
    const l = document.createElement("label");
    l.append(label + " ");
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = String(min);
    inp.max = String(max);
    inp.step = String(step);
    inp.setAttribute("aria-label", `${GRADE_BANDS[band]} ${label.toLowerCase()}`);
    l.append(inp);
    sliders.append(l);
    return inp;
  };
  const hue = mkSlider("Hue", 0, 360, 1);
  const amt = mkSlider("Amount", 0, 100, 1);
  row.append(box, sliders);
  gradeWheelsEl.append(row);
  gradeBandUI.push({ hue, amt, puck, val, wheel });

  const setFromSliders = () => {
    params.grade![band * 2] = Number(hue.value);
    params.grade![band * 2 + 1] = Number(amt.value) / 100;
    updateGradeUI();
    draw(); // undo coalesces per drag via recordSoon, like every slider
  };
  hue.addEventListener("input", setFromSliders);
  amt.addEventListener("input", setFromSliders);

  wheel.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    wheel.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const rect = wheel.getBoundingClientRect();
      const dx = ev.clientX - (rect.left + rect.width / 2);
      const dy = ev.clientY - (rect.top + rect.height / 2);
      // 0° at 12 o'clock, clockwise — the CSS conic ring's own convention.
      const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
      params.grade![band * 2] = Math.round(((deg % 360) + 360) % 360);
      params.grade![band * 2 + 1] = Math.min(1, Math.sqrt(dx * dx + dy * dy) / PUCK_MAX);
      updateGradeUI();
      draw();
    };
    move(e);
    const up = () => {
      wheel.removeEventListener("pointermove", move);
      wheel.removeEventListener("pointerup", up);
      wheel.removeEventListener("pointercancel", up);
      flushRecord(); // one drag = one undo step
    };
    wheel.addEventListener("pointermove", move);
    wheel.addEventListener("pointerup", up);
    wheel.addEventListener("pointercancel", up);
  });
}

// Toned mono presets: bwOn + a wheel recipe — the classic darkroom tones.
// Chip selection = "✓ " TEXT prefix + aria-pressed (never colour alone).
const TONED_MONO: { label: string; grade: number[] }[] = [
  { label: "Sepia", grade: [35, 0.2, 40, 0.16, 45, 0.3, 0] },
  { label: "Selenium", grade: [265, 0.14, 270, 0.08, 280, 0.1, 0] },
  { label: "Cyanotype", grade: [215, 0.3, 210, 0.2, 205, 0.16, 0] },
  { label: "Gold", grade: [45, 0.1, 48, 0.14, 50, 0.32, 0] },
  { label: "Split", grade: [220, 0.22, 0, 0, 45, 0.26, 0] },
];
const tonedMonoEl = $("tonedMono") as HTMLDivElement;
const tonedMonoBtns: HTMLButtonElement[] = [];
for (const def of TONED_MONO) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.addEventListener("click", () => {
    params.bwOn = true; // toned MONO — the preset owns the whole recipe
    params.grade = [...def.grade];
    updateBwUI();
    updateGradeUI();
    draw();
    flushRecord();
  });
  tonedMonoEl.append(b);
  tonedMonoBtns.push(b);
}

const grainAmtEl = $("grainAmt") as HTMLInputElement;
const grainSizeEl = $("grainSize") as HTMLInputElement;
const vigAmtEl = $("vigAmt") as HTMLInputElement;
const vigMidEl = $("vigMid") as HTMLInputElement;
for (const [el, key] of [
  [grainAmtEl, "grainAmt"],
  [grainSizeEl, "grainSize"],
  [vigAmtEl, "vigAmt"],
  [vigMidEl, "vigMid"],
] as const) {
  el.addEventListener("input", () => {
    params[key] = Number(el.value);
    draw();
  });
}

/** Reflect params.grade + grain/vignette into wheels, sliders, readouts and
 *  preset chips — called from syncToUI so undo/redo/loads refresh everything. */
function updateGradeUI() {
  const g = params.grade ?? (params.grade = [...GRADE_DEFAULT]);
  for (let band = 0; band < 3; band++) {
    const ui2 = gradeBandUI[band];
    const hue = g[band * 2] ?? 0;
    const amt = g[band * 2 + 1] ?? 0;
    ui2.hue.value = String(Math.round(hue));
    ui2.amt.value = String(Math.round(amt * 100));
    const rad = ((hue - 90) * Math.PI) / 180; // 0° = 12 o'clock, clockwise
    ui2.puck.style.left = `${WHEEL_R + Math.cos(rad) * amt * PUCK_MAX}px`;
    ui2.puck.style.top = `${WHEEL_R + Math.sin(rad) * amt * PUCK_MAX}px`;
    // Puck fill = the picked tint (redundant); the TEXT readout carries it.
    if (amt > 0) {
      const [r, gg, b] = hsv2rgb(hue, 1, 1);
      ui2.puck.style.background = `rgb(${Math.round(r * 255)} ${Math.round(gg * 255)} ${Math.round(b * 255)})`;
      ui2.val.textContent = `${Math.round(hue)}° · ${Math.round(amt * 100)}%`;
    } else {
      ui2.puck.style.background = "transparent";
      ui2.val.textContent = "off";
    }
  }
  gradeBalEl.value = String(g[6] ?? 0);
  grainAmtEl.value = String(params.grainAmt ?? 0);
  grainSizeEl.value = String(params.grainSize ?? 1.5);
  vigAmtEl.value = String(params.vigAmt ?? 0);
  vigMidEl.value = String(params.vigMid ?? 0.5);
  tonedMonoBtns.forEach((b, i) => {
    const def = TONED_MONO[i];
    const on = params.bwOn && def.grade.every((v, k) => Math.abs(v - (g[k] ?? 0)) < 0.005);
    b.textContent = (on ? "✓ " : "") + def.label;
    b.setAttribute("aria-pressed", String(on));
  });
}

gradeBalEl.addEventListener("input", () => {
  params.grade![6] = Number(gradeBalEl.value);
  draw();
});
$("gradeReset").addEventListener("click", () => {
  params.grade = [...GRADE_DEFAULT];
  params.grainAmt = 0;
  params.grainSize = 1.5;
  params.vigAmt = 0;
  params.vigMid = 0.5;
  updateGradeUI();
  draw();
  flushRecord();
});
updateGradeUI();

// --- Custom false color: the full 3×3 channel mixer. Each OUTPUT channel
// (R/G/B) is a weighted sum of the three inputs — nine sliders, laid out as
// three rows. Preset chips seed classic false-colour remixes; the sliders
// fine-tune. Same accessible-slider substrate as B&W weights. ---
const MIX3_PRESETS: { label: string; m: number[] }[] = [
  { label: "Identity", m: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  { label: "R⇄B swap", m: [0, 0, 1, 0, 1, 0, 1, 0, 0] },
  { label: "Aerochrome", m: [0, 1, 0, 0, 0, 1, 1, 0, 0] }, // red←green, green←blue, blue←red
  { label: "Copper", m: [1.1, 0.3, 0, 0.2, 0.7, 0.1, 0, 0.2, 0.8] },
  { label: "Rotate", m: [0, 0, 1, 1, 0, 0, 0, 1, 0] }, // the other way round
];
const MIX3_OUT = ["Red output", "Green output", "Blue output"];
const MIX3_IN = ["red", "green", "blue"];
const mix3GridEl = $("mix3Grid") as HTMLDivElement;
const mix3Sliders: HTMLInputElement[] = [];
for (let row = 0; row < 3; row++) {
  const group = document.createElement("div");
  group.className = "mix3-row";
  const head = document.createElement("div");
  head.className = "sub-title mix3-head";
  head.textContent = MIX3_OUT[row];
  group.append(head);
  for (let col = 0; col < 3; col++) {
    const idx = row * 3 + col;
    const l = document.createElement("label");
    l.append(`from ${MIX3_IN[col]} `);
    const inp = document.createElement("input");
    inp.type = "range";
    inp.min = "-2";
    inp.max = "2";
    inp.step = "0.01";
    inp.value = String(MIX3_DEFAULT[idx]);
    inp.setAttribute("aria-label", `${MIX3_OUT[row]} from ${MIX3_IN[col]}`);
    inp.addEventListener("input", () => {
      params.mix3![idx] = Number(inp.value);
      updateMix3UI();
      draw(); // coalesces per drag
    });
    l.append(inp);
    group.append(l);
    mix3Sliders.push(inp);
  }
  mix3GridEl.append(group);
}

const mix3PresetsEl = $("mix3Presets") as HTMLDivElement;
const mix3PresetBtns: HTMLButtonElement[] = [];
for (const def of MIX3_PRESETS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.addEventListener("click", () => {
    params.mix3 = [...def.m];
    updateMix3UI();
    draw();
    flushRecord();
  });
  mix3PresetsEl.append(b);
  mix3PresetBtns.push(b);
}

function updateMix3UI() {
  const m = params.mix3 ?? (params.mix3 = [...MIX3_DEFAULT]);
  mix3Sliders.forEach((s, i) => (s.value = String(m[i] ?? MIX3_DEFAULT[i])));
  // Selected preset = ✓ text + aria-pressed (never colour alone).
  mix3PresetBtns.forEach((b, i) => {
    const def = MIX3_PRESETS[i];
    const on = def.m.every((v, k) => Math.abs(v - (m[k] ?? MIX3_DEFAULT[k])) < 0.005);
    b.textContent = (on ? "✓ " : "") + def.label;
    b.setAttribute("aria-pressed", String(on));
  });
}

$("mix3Reset").addEventListener("click", () => {
  params.mix3 = [...MIX3_DEFAULT];
  updateMix3UI();
  draw();
  flushRecord();
});
updateMix3UI();

// --- Stickers (Creative): drop a UFO into the trees. Tap an asset to add it
// (placed at centre, selected), then DRAG it on the photo; sliders size, spin
// and hide it behind the scene. Stickers bake INTO the source (sticker.ts) so
// they inherit the whole IR pipeline and grain settles over them. Placement
// lives in params.stickers → undo/session for free; excluded from looks/batch. ---

// Sticker library — grouped, category-organized, and DYNAMIC (owner, 2026-07-19:
// "split into two kinds of overlays — Creatures & craft, and Evidence"; the
// evidence overlays read more believable because they tuck into a scene; a third
// "Scene & nature" group of everyday overlays added 2026-07-19 to receive the
// asset factory's full set). Assets live at public/stickers/<category>/<name>.png;
// a build-time manifest.json lists what's present, so the owner drops a PNG into a
// category folder and it appears (auto-precached) with no code change. The
// original 8 stay FLAT (no key change → no broken saved sessions); their category
// comes from STICKER_META.
const STICKER_GROUPS: { id: string; emoji: string; label: string }[] = [
  { id: "creatures", emoji: "👣", label: "Creatures & craft" },
  { id: "evidence", emoji: "🔍", label: "Evidence" },
  { id: "scene", emoji: "🏕️", label: "Scene & nature" },
  { id: "toolkit", emoji: "🎬", label: "Scene toolkit" }, // shadows + light textures (asset factory)
];
const STICKER_CATEGORIES: { id: string; group: string; emoji: string; label: string }[] = [
  // Creatures & craft — the "obvious" overlays.
  { id: "cryptids", group: "creatures", emoji: "👣", label: "Cryptids" },
  { id: "ufo", group: "creatures", emoji: "🛸", label: "UFOs & craft" },
  { id: "aliens", group: "creatures", emoji: "👽", label: "Aliens" },
  { id: "spirits", group: "creatures", emoji: "👻", label: "Spirits" },
  { id: "beasts", group: "creatures", emoji: "🦖", label: "Beasts" },
  { id: "illustrated", group: "creatures", emoji: "🖊️", label: "Illustrated cryptids" }, // hand-drawn set (asset factory)
  // Evidence — the believable, tuck-into-the-scene overlays.
  { id: "tracks", group: "evidence", emoji: "🐾", label: "Tracks & marks" },
  { id: "gear", group: "evidence", emoji: "🎒", label: "Left behind" },
  { id: "lights", group: "evidence", emoji: "✨", label: "Lights & signs" },
  // Scene & nature — everyday overlays for regular photos (the Creative direction).
  { id: "wildlife", group: "scene", emoji: "🦉", label: "Wildlife" },
  { id: "foreground", group: "scene", emoji: "🌿", label: "Foreground" },
  { id: "sky", group: "scene", emoji: "🎈", label: "Sky" },
  { id: "atmosphere", group: "scene", emoji: "🌫️", label: "Atmosphere & light" },
  { id: "props", group: "scene", emoji: "🧺", label: "Everyday" },
  // Scene toolkit — grounding shadows + broken-light textures (composite fine as
  // dark "over" = Multiply; a per-sticker Screen mode for glows is a later step).
  { id: "shadows", group: "toolkit", emoji: "🌑", label: "Shadows" },
  { id: "other", group: "evidence", emoji: "❓", label: "New" }, // catch-all for un-categorized drop-ins
];
// Pretty labels + honesty notes (folklore/fiction, shown as TEXT so meaning
// survives grayscale) + category for the FLAT legacy keys. Nested keys
// (e.g. "cryptids/yeti") take their category from the folder and a humanized
// label unless listed here. Seeded for the whole planned taxonomy so assets read
// polished the moment they land — a key with no file on disk simply never shows.
const STICKER_META: Record<string, { label: string; note?: string; cat?: string }> = {
  // Legacy flat assets (filenames unchanged).
  bigfoot: { label: "Bigfoot", cat: "cryptids" },
  "bigfoot-walk": { label: "Bigfoot walking", cat: "cryptids" },
  "bigfoot-peek": { label: "Bigfoot peeking", cat: "cryptids" },
  "bigfoot-howl": { label: "Bigfoot howling", cat: "cryptids" },
  saucer: { label: "Saucer", cat: "ufo" },
  beam: { label: "Abduction beam", cat: "ufo" },
  saturn: { label: "Saturn", cat: "ufo" },
  alien: { label: "Alien", cat: "aliens" },
  // — Creatures & craft —
  // Cryptids.
  "cryptids/yeti": { label: "Yeti" },
  "cryptids/skunk-ape": { label: "Skunk Ape" },
  "cryptids/dogman": { label: "Dogman" },
  "cryptids/mothman": { label: "Mothman" },
  "cryptids/jersey-devil": { label: "Jersey Devil" },
  "cryptids/chupacabra": { label: "Chupacabra" },
  "cryptids/goatman": { label: "Goatman" },
  "cryptids/wendigo": { label: "Wendigo", note: "folklore" },
  "cryptids/fresno-nightcrawler": { label: "Fresno Nightcrawler" },
  "cryptids/flatwoods-monster": { label: "Flatwoods Monster" },
  "cryptids/loveland-frog": { label: "Loveland Frog" },
  // UFOs & craft.
  "ufo/black-triangle": { label: "Black triangle" },
  "ufo/tic-tac": { label: "Tic Tac" },
  "ufo/metallic-orb": { label: "Metallic orb" },
  "ufo/black-sphere": { label: "Black sphere" },
  "ufo/cigar": { label: "Cigar craft" },
  "ufo/boomerang": { label: "Boomerang craft" },
  "ufo/flying-wing": { label: "Flying wing" },
  "ufo/disc-silhouette": { label: "Disc silhouette" },
  // Aliens (the fictional forms are labeled as such).
  "aliens/grey": { label: "Grey" },
  "aliens/tall-grey": { label: "Tall Grey" },
  "aliens/reptilian": { label: "Reptilian", note: "fiction" },
  "aliens/insectoid": { label: "Insectoid", note: "fiction" },
  "aliens/nordic": { label: "Nordic", note: "fiction" },
  "aliens/child-grey": { label: "Child-sized Grey" },
  "aliens/hand": { label: "Hand" },
  "aliens/eyes": { label: "Eyes" },
  "aliens/silhouette": { label: "Silhouette" },
  // Spirits (paranormal figures).
  "spirits/shadow-person": { label: "Shadow person" },
  "spirits/hooded-figure": { label: "Hooded figure" },
  "spirits/apparition": { label: "Apparition" },
  "spirits/skeletal": { label: "Skeletal apparition" },
  "spirits/ghostly-mist": { label: "Ghostly mist" },
  // Beasts (lost-world creatures).
  "beasts/pteranodon": { label: "Pteranodon" },
  "beasts/raptor": { label: "Raptor" },
  "beasts/giant-snake": { label: "Giant snake" },
  "beasts/giant-spider": { label: "Giant spider" },
  "beasts/tentacle": { label: "Squid tentacle" },
  "beasts/cave-humanoid": { label: "Cave humanoid" },
  // — Evidence —
  // Tracks & marks.
  "tracks/footprints": { label: "Oversized footprints" },
  "tracks/claw-tree": { label: "Claw-marked tree" },
  "tracks/snagged-hair": { label: "Snagged hair" },
  "tracks/feathers": { label: "Strange feathers" },
  "tracks/scat": { label: "Odd tracks" },
  // Left behind.
  "gear/backpack": { label: "Abandoned backpack" },
  "gear/tent": { label: "Weathered tent" },
  "gear/lantern": { label: "Antique lantern" },
  "gear/rusted-equipment": { label: "Rusted research gear" },
  "gear/standing-stones": { label: "Standing stones" },
  // Lights & signs.
  "lights/will-o-wisp": { label: "Will-o'-the-wisp" },
  "lights/glowing-orb": { label: "Glowing orb" },
  "lights/light-anomaly": { label: "Distant light anomaly" },
  "lights/floating-eyes": { label: "Floating eyes" },
  "lights/burned-patch": { label: "Scorched circle" },
};
// Dev/offline fallback when the build manifest can't be fetched (the built app
// always has it, precached). The original shipped set.
const LEGACY_STICKER_KEYS = ["bigfoot", "bigfoot-walk", "bigfoot-peek", "bigfoot-howl", "saucer", "alien", "saturn", "beam"];

const stickerAssets: Record<string, StickerAsset> = {};
const stickerAssetUrls: Record<string, string> = {}; // for the drag ghost <img>
let stickerManifest: string[] = []; // keys present on disk (from the build manifest)
let stickerLibraryPending = false;
const stickerAssetPending = new Map<string, Promise<void>>();

function stickerLabel(key: string): string {
  const m = STICKER_META[key];
  if (m) return m.label;
  const stem = key.split("/").pop() ?? key;
  return stem.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function stickerNote(key: string): string | undefined {
  return STICKER_META[key]?.note;
}
function stickerCatOf(key: string): string {
  if (key.startsWith("imp-")) return "other"; // runtime imports
  if (key.includes("/")) {
    const folder = key.slice(0, key.indexOf("/"));
    return STICKER_CATEGORIES.some((c) => c.id === folder) ? folder : "other";
  }
  return STICKER_META[key]?.cat ?? "other";
}
/** A glowing light asset — composites with SCREEN (adds light) instead of sitting
 *  on top. Everything in the Lights & signs category, plus any beam/glow/flare/
 *  aura/portal/wisp/orb/halo/ember named asset anywhere. */
function isScreenAsset(key: string): boolean {
  return stickerCatOf(key) === "lights" || /beam|glow|flare|aura|portal|wisp|will-o|halo|ember|eldritch|rune/i.test(key);
}

/** Rasterize ONE asset on demand (placement / session restore) — not the whole
 *  library, which can be 50+ PNGs. Cached + de-duped by key. */
function ensureStickerAsset(key: string): Promise<void> {
  if (stickerAssets[key]) return Promise.resolve();
  let p = stickerAssetPending.get(key);
  if (!p) {
    p = (async () => {
      try {
        // Decode via <img> + decode(), NOT createImageBitmap: iOS Safari's
        // createImageBitmap rotates the bitmap 90° where <img> (and the file, and
        // Chromium) do not — so baked stickers came out sideways on iPad while the
        // <img> drag-ghost stayed upright (owner-caught 2026-07-20). This matches
        // the ghost's decode path exactly.
        const url = `./stickers/${key}.png`;
        const img = new Image();
        img.decoding = "async";
        img.src = url;
        await img.decode();
        const c = document.createElement("canvas");
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        const g = c.getContext("2d")!;
        g.drawImage(img, 0, 0);
        const rgba = g.getImageData(0, 0, c.width, c.height).data;
        stickerAssets[key] = makeStickerAsset(key, c.width, c.height, rgba);
        stickerAssetUrls[key] = url;
      } catch {
        /* asset missing/offline — the sticker just won't bake until it loads */
      }
    })();
    stickerAssetPending.set(key, p);
  }
  return p;
}

/** Load the manifest (what's on disk), build the picker, and make sure any
 *  already-placed stickers have their assets so a restored session bakes.
 *  (Named loadStickerAssets for its callers; it no longer bulk-rasterizes.) */
async function loadStickerAssets() {
  if (!stickerLibraryPending) {
    stickerLibraryPending = true;
    try {
      const r = await fetch("./stickers/manifest.json");
      stickerManifest = r.ok ? await r.json() : LEGACY_STICKER_KEYS.slice();
    } catch {
      stickerManifest = LEGACY_STICKER_KEYS.slice();
    }
    renderStickerPicker();
  }
  const placed = new Set((params.stickers ?? []).map((s) => s.asset));
  await Promise.all([...placed].map((k) => ensureStickerAsset(k)));
  draw(); // assets arrived — re-bake any placed stickers
}

// While a sticker is being dragged/resized, it is held OUT of the CPU bake and
// a cheap <img> ghost tracks the gesture — so the heavy composite runs once on
// release instead of ~60×/second (owner: stickers lagged the app, 2026-07-19).
let liveSticker = -1; // index of the sticker held live (excluded from the bake), or -1
const stickerGhost = $("stickerGhost") as HTMLImageElement;

/** Position the ghost <img> over the live sticker's on-screen rect (centre +
 *  rotation + size, soaking up view zoom/rotation via imageUvToClient). */
function positionStickerGhost() {
  const list = params.stickers ?? [];
  const s = liveSticker >= 0 && liveSticker < list.length ? list[liveSticker] : null;
  const a = s && stickerAssets[s.asset];
  const url = s && stickerAssetUrls[s.asset];
  if (!s || !a || !url || !current) { stickerGhost.hidden = true; return; }
  const W = current.width, H = current.height;
  const hw = (s.scale * W) / 2;
  // Counter the photo's display rotation so the ghost previews upright too —
  // imageUvToClient re-applies that rotation, netting the sticker's own rot.
  const ang = ((s.rot - renderer.rotation * 90) * Math.PI) / 180;
  // Centre + the rotated +hw edge midpoint, both in client space.
  const [cx, cy] = renderer.imageUvToClient(s.x, s.y);
  const ex = s.x + (hw * Math.cos(ang)) / W;
  const ey = s.y + (hw * Math.sin(ang)) / H;
  const [ecx, ecy] = renderer.imageUvToClient(ex, ey);
  const halfW = Math.hypot(ecx - cx, ecy - cy);
  const angleDeg = (Math.atan2(ecy - cy, ecx - cx) * 180) / Math.PI;
  const wpx = Math.max(2, 2 * halfW);
  if (stickerGhost.getAttribute("src") !== url) stickerGhost.src = url;
  stickerGhost.style.width = `${wpx}px`;
  stickerGhost.style.height = `${wpx * (a.h / a.w)}px`;
  stickerGhost.style.left = `${cx}px`;
  stickerGhost.style.top = `${cy}px`;
  stickerGhost.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;
  stickerGhost.hidden = false;
}

/** Live preview during a transform gesture. A ghostable sticker rides the CSS
 *  ghost <img>; a SHADOW re-bakes live instead — its flatten is a corner
 *  homography the flat ghost can't reproduce, so ghosting it would show the
 *  un-flattened creature ("the whole image"). Re-baking shows the real flattened
 *  silhouette move / scale / spin (cheap: one small rect, like the Peek slider). */
function previewStickerTransform() {
  const s = selSticker();
  if (s && s.shadow) draw();
  else positionStickerGhost();
}

/** Enter live mode for the selected sticker: pull it from the bake (one bake to
 *  clear its old pixels) and show the ghost. Shadows are NOT ghosted — they stay
 *  baked and re-bake live (see previewStickerTransform). */
function beginStickerLive() {
  if (selectedSticker < 0) return;
  const s = (params.stickers ?? [])[selectedSticker];
  if (s && s.shadow) { liveSticker = -1; stickerGhost.hidden = true; return; } // shadow rides the bake, not the ghost
  if (liveSticker === selectedSticker) return;
  liveSticker = selectedSticker;
  positionStickerGhost();
  draw(); // re-bake WITHOUT the live sticker (clean background under the ghost)
}

/** Leave live mode: hide the ghost and bake the sticker in at its final state. */
function endStickerLive() {
  if (liveSticker < 0) return;
  liveSticker = -1;
  stickerGhost.hidden = true;
  draw();
}

let stickerArmed = false;
let selectedSticker = -1;
let stickerDrag: { id: number; ou: number; ov: number } | null = null;
// Pan the zoomed photo with a one-finger drag on EMPTY canvas while the Stickers
// tab is armed (a drag ON a sticker still moves it). Lets you reach a corner of a
// zoomed-in photo to place a sticker there, instead of being stuck at centre.
let stickerPan: { id: number; x: number; y: number; panX: number; panY: number } | null = null;
// Two-finger resize + spin on the selected sticker (the accessible sliders
// stay). Captures the sticker's scale/rot at gesture start plus the initial
// finger spread + angle, then tracks the ratio/delta live via the ghost.
const stickerPointers = new Map<number, { x: number; y: number }>();
let stkPinch: { dist: number; ang: number; scale: number; rot: number } | null = null;
let stkPerspArmed = false; // dragging the 4 corner handles to set perspective
let stkCornerLive = false; // a corner drag is in progress (suppresses undo churn)
let stkHandleLive = false; // a resize/rotate handle drag is in progress (suppresses undo churn)
const stickerOverlay = $("stickerOverlay") as unknown as SVGSVGElement;
const stkControls = $("stickerControls") as HTMLDivElement;
const stkScale = $("stkScale") as HTMLInputElement;
const stkRot = $("stkRot") as HTMLInputElement;
const stkOcclude = $("stkOcclude") as HTMLInputElement;
const stkBehindEl = $("stkBehind") as HTMLDivElement;
const stkClearBtn = $("stkClear") as HTMLButtonElement;
const stkTransp = $("stkTransp") as HTMLInputElement;
const stkLum = $("stkLum") as HTMLInputElement;
const stkBright = $("stkBright") as HTMLInputElement;
const stkContrast = $("stkContrast") as HTMLInputElement;
const stkWarmth = $("stkWarmth") as HTMLInputElement;
const stkSat = $("stkSat") as HTMLInputElement;
const stkBlendBtn = $("stkBlend") as HTMLButtonElement;
const stkBlendModeEl = $("stkBlendMode") as HTMLDivElement;
const stkBrushSize = $("stkBrushSize") as HTMLInputElement;
const stkBlendClearBtn = $("stkBlendClear") as HTMLButtonElement;

// The add-a-sticker picker: two kinds (#stickerGroups: Creatures & craft /
// Evidence) → a category chip row (#stickerCats) → the sticker grid
// (#stickerAdd), so the library scales cleanly past a flat row.
const stickerAddEl = $("stickerAdd") as HTMLDivElement;
const stickerCatsEl = $("stickerCats") as HTMLDivElement;
const stickerGroupsEl = $("stickerGroups") as HTMLDivElement;
let stickerGroup = ""; // selected kind (creatures / evidence)
let stickerCat = ""; // selected category id

/** Group the present manifest keys by resolved category. */
function stickerLibraryByCat(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const key of stickerManifest) {
    const cat = stickerCatOf(key);
    const arr = m.get(cat) ?? (m.set(cat, []), m.get(cat)!);
    arr.push(key);
  }
  return m;
}

/** An add-a-sticker tile: a little thumbnail of the art with its label beneath,
 *  so you can see what each one is before dropping it (owner ask, 2026-07-21).
 *  The PNG is loaded straight as an <img> (precached, no rasterization) — the
 *  full StickerAsset only builds lazily on placement. */
function stickerTile(key: string): HTMLButtonElement {
  const label = stickerLabel(key);
  const note = stickerNote(key);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip sticker-tile";
  b.setAttribute("aria-label", "Add " + label + (note ? ", " + note : ""));
  const img = document.createElement("img");
  img.className = "sticker-thumb";
  img.src = `./stickers/${key}.png`;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";
  const cap = document.createElement("span");
  cap.className = "sticker-tile-label";
  cap.textContent = label;
  b.append(img, cap);
  if (note) {
    const n = document.createElement("span");
    n.className = "sticker-tile-note";
    n.textContent = note;
    b.append(n);
  }
  b.addEventListener("click", () => { void addStickerFromKey(key); });
  return b;
}

function stickerChip(label: string, on: boolean, ariaLabel: string | null, onClick: () => void): HTMLButtonElement {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.textContent = (on ? "✓ " : "") + label;
  b.setAttribute("aria-pressed", String(on));
  if (ariaLabel) b.setAttribute("aria-label", (on ? "selected, " : "") + ariaLabel);
  b.addEventListener("click", onClick);
  return b;
}

/** (Re)build the kind chips → category chips → sticker chips from the manifest +
 *  metadata. Only non-empty kinds/categories show (dynamic). */
function renderStickerPicker() {
  const byCat = stickerLibraryByCat();
  const cats = STICKER_CATEGORIES.filter((c) => (byCat.get(c.id)?.length ?? 0) > 0);
  const groups = STICKER_GROUPS.filter((g) => cats.some((c) => c.group === g.id));
  if (!groups.some((g) => g.id === stickerGroup)) stickerGroup = groups[0]?.id ?? "";
  const groupCats = cats.filter((c) => c.group === stickerGroup);
  if (!groupCats.some((c) => c.id === stickerCat)) stickerCat = groupCats[0]?.id ?? "";

  stickerGroupsEl.replaceChildren(...groups.map((g) =>
    stickerChip(g.emoji + " " + g.label, g.id === stickerGroup, `${g.label} overlays`, () => {
      stickerGroup = g.id; stickerCat = ""; renderStickerPicker();
    })));
  stickerGroupsEl.hidden = groups.length <= 1;

  stickerCatsEl.replaceChildren(...groupCats.map((c) =>
    stickerChip(c.emoji + " " + c.label, c.id === stickerCat, c.label, () => {
      stickerCat = c.id; renderStickerPicker();
    })));
  stickerCatsEl.hidden = groupCats.length <= 1; // no chips needed for a single category

  stickerAddEl.replaceChildren(...(byCat.get(stickerCat) ?? []).map((key) => stickerTile(key)));
}

/** Place a sticker of `key` at the on-screen centre, auto-matched to the scene.
 *  Ensures the asset is rasterized first (lazy per-asset load). */
const SCENE_MATCH_AMT = 0.85; // default strength of the palette match
// Auto-shadow: a CONTACT PUDDLE at the feet. The silhouette flattens into a thin
// band starting at the creature's real feet (opaque bottom, not the transparent
// padding) and extending a little below — centred, NO skew, so it can't sprawl
// off to the side and reads as grounded on any pose or photo orientation. (A
// directional cast shadow via skew is a future light-direction knob.)
const SHADOW_BAND = 0.5;

/** Cast a shadow of a sticker from its OWN silhouette: a flat near-black copy that
 *  folds onto the ground FROM THE FEET (the opaque bottom, ignoring the sticker's
 *  transparent padding), squashed + skewed. Inserted BELOW the sticker. */
function castShadow(creature: Sticker) {
  if (creature.shadow) return; // no shadow of a shadow
  const a = stickerAssets[creature.asset];
  if (!a || !current) return;
  // Feet = bottom of the opaque content in local half-extent units (y: −1 top … +1
  // bottom). The top corners fold DOWN to feet+SPREAD (+ shear); the bottom corners
  // (empty padding) collapse UP to the feet, so the shadow starts at the real feet.
  // Pivot on the FEET: the shadow shares the creature's transform (so the black
  // silhouette's feet already sit exactly under the creature's feet), and the fold
  // hinges on the opaque bottom. The bottom padding collapses UP to the feet, the
  // body folds DOWN past them, skewed by the light direction — anchored at the feet.
  // Flatten the whole silhouette into a thin band [feet … feet+BAND] just below
  // the feet: top corners (v=0) map to the feet line, bottom corners (v=1) to
  // feet+BAND. No x-offset → centred under the feet, no sideways sprawl.
  const footHalf = 2 * a.foot.v - 1;
  const topY = footHalf + 1;              // base −1 → footHalf (the feet line)
  const botY = footHalf + SHADOW_BAND - 1; // base +1 → footHalf + BAND (just below)
  const shadow: Sticker = {
    id: crypto.randomUUID(),
    asset: creature.asset,
    x: creature.x,
    y: creature.y,
    scale: creature.scale,
    rot: creature.rot,
    occlude: 0, occludeLuma: 0.6, occludeBright: true,
    bright: 0, contrast: 0, warmth: 0, sat: 0,
    shadow: true, shadowOpacity: 0.45,
    reMatch: false, matchAmt: 0,
    linkTo: creature.id, // glued to the creature — follows it until you drag the shadow itself
    corners: [[0, topY], [0, topY], [0, botY], [0, botY]],
  };
  const list = (params.stickers ??= []);
  const idx = list.indexOf(creature);
  list.splice(idx < 0 ? list.length : idx, 0, shadow); // earlier in the list = drawn under
  selectedSticker = list.indexOf(creature); // keep the creature selected, not its shadow
  updateStickerUI();
  draw();
  flushRecord();
}

/** Glue linked shadows to their creatures: copy each still-linked shadow's
 *  position/scale/spin from the sticker it shadows, so moving/resizing/spinning
 *  the creature carries its shadow along. Runs once per frame BEFORE the bake's
 *  change-detection, so a followed shadow re-bakes at its new spot. A shadow the
 *  user has dragged has its `linkTo` cleared (detached) and is left alone; a
 *  shadow whose creature was deleted also just stays put. */
function syncLinkedShadows() {
  const list = params.stickers;
  if (!list || list.length < 2) return;
  const byId = new Map(list.map((s) => [s.id, s]));
  for (const sh of list) {
    if (!sh.shadow || !sh.linkTo) continue;
    const c = byId.get(sh.linkTo);
    if (!c || c === sh) continue;
    sh.x = c.x; sh.y = c.y; sh.scale = c.scale; sh.rot = c.rot;
  }
}

/** "Match the photo's colours" — the RIGHT way. Read the DISPLAYED scene colour
 *  under the sticker (offscreen GL read = iOS-safe, no canvas readback) and store
 *  it as the sticker's match target. The compositor then shifts the sticker's own
 *  mean toward it, in the sticker's own display layer, so it takes on the infrared
 *  palette WITHOUT being forced through the sensor pipeline (which just cooks it).
 *  Reads with the sticker overlay OFF so it samples the scene, not the sticker. */
function computeSceneMatch(s: Sticker) {
  const a = stickerAssets[s.asset];
  if (!a || !current) return;
  const ar = a.h / a.w;
  renderer.setOverlayOn(false); // sample the scene, not the sticker sitting on it
  let r = 0, g = 0, b = 0, n = 0;
  for (let gy = 0; gy < 3; gy++) {
    for (let gx = 0; gx < 3; gx++) {
      const u = s.x + (gx / 2 - 0.5) * s.scale;
      const v = s.y + (gy / 2 - 0.5) * s.scale * ar;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      const px = renderer.readUvPixel(params, u, v);
      if (px) { r += px[0]; g += px[1]; b += px[2]; n++; }
    }
  }
  renderer.setOverlayOn((params.stickers ?? []).some((k) => stickerAssets[k.asset]));
  if (!n) return;
  const toLin = (x: number) => Math.pow(x / 255, 2.2);
  s.matchScene = [toLin(r / n), toLin(g / n), toLin(b / n)];
  // Keep the strength the user already dialed (re-matching on a move shouldn't
  // yank it back to full); default it on a first match.
  s.matchAmt = s.matchAmt ?? SCENE_MATCH_AMT;
}

async function addStickerFromKey(key: string) {
  await ensureStickerAsset(key);
  if (!stickerAssets[key]) { toast("That sticker couldn't load — try again.", 2500); return; }
  const list = (params.stickers ??= []);
  // Place at the centre of what's on screen (zoom-aware), a friendly size.
  const c = canvas.getBoundingClientRect();
  const [u, v] = renderer.clientToImageUv(c.left + c.width / 2, c.top + c.height / 2);
  const sx = Math.min(0.85, Math.max(0.15, u || 0.5));
  const sy = Math.min(0.85, Math.max(0.15, v || 0.5));
  const sticker: Sticker = {
    id: crypto.randomUUID(),
    asset: key,
    x: sx,
    y: sy,
    scale: 0.3,
    rot: 0,
    occlude: 0,
    occludeLuma: 0.6,
    occludeBright: true,
    bright: 0, contrast: 0, warmth: 0, sat: 0,
  };
  if (isScreenAsset(key)) sticker.screen = true; // a glow: SCREEN blend, keep its own light (no scene match)
  else computeSceneMatch(sticker); // take on the scene's palette (its own layer, not the pipeline)
  list.push(sticker);
  selectedSticker = list.length - 1;
  updateStickerUI();
  draw();
  flushRecord();
}

// "Hide behind" direction chips (text-labelled, aria-pressed — never colour).
const STK_BEHIND = [
  { label: "Bright parts", bright: true },
  { label: "Dark parts", bright: false },
];
const stkBehindBtns: HTMLButtonElement[] = [];
for (const def of STK_BEHIND) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.addEventListener("click", () => {
    const s = selSticker();
    if (!s) return;
    s.occludeBright = def.bright;
    updateStickerUI();
    draw();
    flushRecord();
  });
  stkBehindEl.append(b);
  stkBehindBtns.push(b);
}

function selSticker(): Sticker | null {
  const list = params.stickers ?? [];
  return selectedSticker >= 0 && selectedSticker < list.length ? list[selectedSticker] : null;
}

/** Even-odd point-in-quad test (px,py in the same space as the corners). */
function pointInQuad(px: number, py: number, q: [number, number][]): boolean {
  let inside = false;
  for (let i = 0, j = 3; i < 4; j = i++) {
    const [xi, yi] = q[i], [xj, yj] = q[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Which sticker (topmost) covers image-uv (u,v), or -1. Pixel-space test so
 *  rotation + aspect (and, when set, the perspective quad) match how
 *  sticker.ts composites. */
function hitSticker(u: number, v: number): number {
  if (!current) return -1;
  const W = current.width, H = current.height;
  const dispRot = renderer.rotation * 90; // match the baked (display-oriented) sticker
  const list = params.stickers ?? [];
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i];
    const a = stickerAssets[s.asset];
    if (!a) continue;
    const quad = stickerWorldCorners(s, W, H, a, dispRot);
    if (quad) { if (pointInQuad(u * W, v * H, quad)) return i; continue; }
    const hw = (s.scale * W) / 2, hh = hw * (a.h / a.w);
    const dx = (u - s.x) * W, dy = (v - s.y) * H;
    const ang = (-(s.rot - dispRot) * Math.PI) / 180;
    const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
    const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
    if (Math.abs(lx) <= hw && Math.abs(ly) <= hh) return i;
  }
  return -1;
}

// Size/Spin are pure TRANSFORMS — the ghost shows them perfectly, so hold the
// sticker out of the bake during the drag and composite once on release.
const stkTransformInput = () => {
  const s = selSticker();
  if (!s) return;
  s.scale = Number(stkScale.value);
  s.rot = Number(stkRot.value);
  if (s.shadow) s.linkTo = undefined; // hand-sized/spun shadow detaches from its creature
  updateStickerUI();
  beginStickerLive();
  previewStickerTransform();
};
for (const el of [stkScale, stkRot]) {
  el.addEventListener("input", stkTransformInput);
  el.addEventListener("change", () => endStickerLive()); // release → bake the final state
}
// Peek-behind is a compositing effect the ghost can't show — bake it live (one
// rect, no move-doubling), coalesced like any slider.
stkOcclude.addEventListener("input", () => {
  const s = selSticker();
  if (!s) return;
  s.occlude = Number(stkOcclude.value);
  updateStickerUI();
  draw();
});

// Match adjustments (brightness/contrast/warmth/saturation) — recolour the
// asset; they bake live (one rect), coalesced like any slider.
const stkAdjustInput = () => {
  const s = selSticker();
  if (!s) return;
  s.opacity = 1 - Number(stkTransp.value); // slider is transparency (0 = solid)
  s.lum = Number(stkLum.value);
  s.bright = Number(stkBright.value);
  s.contrast = Number(stkContrast.value);
  s.warmth = Number(stkWarmth.value);
  s.sat = Number(stkSat.value);
  draw();
};
for (const el of [stkTransp, stkLum, stkBright, stkContrast, stkWarmth, stkSat]) el.addEventListener("input", stkAdjustInput);

// "Match the photo's colours" — the sticker takes on the scene's infrared palette
// in ITS OWN layer (a mean shift toward the scene colour under it), never by
// running it through the sensor pipeline. Button re-samples the scene where the
// sticker sits now; the strength slider dials it 0 (raw) → 1 (full).
const stkMatchStrength = $("stkMatchStrength") as HTMLInputElement;
stkMatchStrength.addEventListener("input", () => {
  const s = selSticker();
  if (!s) return;
  s.matchAmt = Number(stkMatchStrength.value);
  draw();
});
$("stkMatchPhoto").addEventListener("click", () => {
  const s = selSticker();
  if (!s) return;
  if ((s.matchAmt ?? 0) <= 0) s.matchAmt = SCENE_MATCH_AMT; // a manual match should DO something
  computeSceneMatch(s); // re-read the scene under the sticker's current spot
  updateStickerUI();
  draw();
  flushRecord();
});

// Auto re-match on move — re-sample the scene whenever a sticker is dropped in a
// new spot, so it stays matched as you move it (owner ask, 2026-07-21). Default
// on; the toggle locks the current match.
function reMatchOnDrop() {
  const s = selSticker();
  if (s && s.reMatch !== false && s.matchScene) computeSceneMatch(s);
}
const stkReMatch = $("stkReMatch") as HTMLButtonElement;
stkReMatch.addEventListener("click", () => {
  const s = selSticker();
  if (!s) return;
  s.reMatch = s.reMatch === false ? true : false; // toggle
  updateStickerUI();
});

const stkShadow = $("stkShadow") as HTMLButtonElement;
stkShadow.addEventListener("click", () => {
  const s = selSticker();
  if (s && !s.shadow) castShadow(s);
});

// Import your own picture as a sticker (session-only runtime asset). This is
// how a photorealistic cut-out you supply gets blended + matched like the
// built-ins. Resets on reload (not precached), which the note explains.
const stickerImport = $("stickerImport") as HTMLInputElement;
stickerImport.addEventListener("change", async () => {
  const f = stickerImport.files?.[0];
  stickerImport.value = "";
  if (!f || !current) return;
  try {
    // <img> + decode(), not createImageBitmap — iOS Safari rotates the latter 90°
    // (see ensureStickerAsset). Decode from the same object URL the ghost uses.
    const objUrl = URL.createObjectURL(f);
    const img = new Image();
    img.decoding = "async";
    img.src = objUrl;
    await img.decode();
    const c = document.createElement("canvas");
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const rgba = g.getImageData(0, 0, c.width, c.height).data;
    const key = "imp-" + crypto.randomUUID();
    stickerAssets[key] = makeStickerAsset(key, c.width, c.height, rgba);
    stickerAssetUrls[key] = objUrl;
    const cc = canvas.getBoundingClientRect();
    const [u, v] = renderer.clientToImageUv(cc.left + cc.width / 2, cc.top + cc.height / 2);
    const s: Sticker = {
      id: crypto.randomUUID(), asset: key,
      x: Math.min(0.85, Math.max(0.15, u || 0.5)), y: Math.min(0.85, Math.max(0.15, v || 0.5)),
      scale: 0.3, rot: 0, occlude: 0, occludeLuma: 0.6, occludeBright: true,
      bright: 0, contrast: 0, warmth: 0, sat: 0,
    };
    computeSceneMatch(s); // take on the scene's palette, in its own layer
    (params.stickers ??= []).push(s);

    selectedSticker = params.stickers.length - 1;
    updateStickerUI();
    draw();
    flushRecord();
  } catch {
    toast("That picture couldn't be read — try a PNG or JPEG.", 3000);
  }
});

function deleteSelectedSticker() {
  const list = params.stickers ?? [];
  if (selectedSticker < 0 || selectedSticker >= list.length) return;
  liveSticker = -1; stickerGhost.hidden = true; // drop any live ghost so it can't linger
  const removed = list[selectedSticker];
  // Deleting a creature orphans its shadow — drop that too so no black puddle lingers.
  const orphanShadowIdx = removed && !removed.shadow
    ? list.findIndex((s) => s.shadow && s.linkTo === removed.id)
    : -1;
  list.splice(selectedSticker, 1);
  if (orphanShadowIdx >= 0) {
    const adj = orphanShadowIdx > selectedSticker ? orphanShadowIdx - 1 : orphanShadowIdx;
    list.splice(adj, 1);
  }
  selectedSticker = list.length ? Math.min(selectedSticker, list.length - 1) : -1;
  updateStickerUI();
  draw();
  flushRecord();
}
$("stkDelete").addEventListener("click", deleteSelectedSticker);
// Keyboard Delete / Backspace removes the selected sticker — same as the button —
// but never while typing in a field or on a control that owns those keys.
document.addEventListener("keydown", (e) => {
  if (e.key !== "Delete" && e.key !== "Backspace") return;
  if (!stickerArmed || selectedSticker < 0) return;
  const el = document.activeElement as HTMLElement | null;
  const tag = el?.tagName;
  if (el?.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
  e.preventDefault();
  deleteSelectedSticker();
});
stkClearBtn.addEventListener("click", () => {
  if (!(params.stickers?.length)) return;
  liveSticker = -1; stickerGhost.hidden = true; // no held-out sticker to reinstate
  params.stickers = [];
  selectedSticker = -1;
  updateStickerUI();
  draw();
  flushRecord();
});

// --- Blend: paint on the selected sticker to rub parts away (so it tucks
// behind a branch/foreground) or bring them back. The stroke writes an
// asset-local erase/restore mask (sticker.ts multiplies alpha by it); one
// stroke = one undo step (copy-on-write, like the brush masks). ---
const STK_BLEND_EDGE = 384; // capped mask resolution, matches BRUSH_MAX_EDGE
let stkBlendArmed = false;
let stkBlendRestore = false; // false = hide (erase), true = bring back
let stkPainting = false;
let stkLastLocal: [number, number] | null = null;

const STK_BLEND_MODES = [
  { label: "Rub away", restore: false },
  { label: "Bring back", restore: true },
];
const stkBlendModeBtns: HTMLButtonElement[] = [];
for (const def of STK_BLEND_MODES) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.addEventListener("click", () => { stkBlendRestore = def.restore; updateStickerUI(); });
  stkBlendModeEl.append(b);
  stkBlendModeBtns.push(b);
}

function setStickerBlend(on: boolean) {
  stkBlendArmed = on && !!selSticker();
  stkBlendBtn.setAttribute("aria-pressed", String(stkBlendArmed));
  if (stkBlendArmed && stkPerspArmed) setStickerPersp(false); // both own single-finger taps
  updateStickerUI();
}
stkBlendBtn.addEventListener("click", () => setStickerBlend(!stkBlendArmed));

// Perspective: drag the 4 corners to skew the sticker onto the scene's plane.
const stkPerspBtn = $("stkPersp") as HTMLButtonElement;
const stkPerspResetBtn = $("stkPerspReset") as HTMLButtonElement;
function setStickerPersp(on: boolean) {
  stkPerspArmed = on && !!selSticker();
  if (stkPerspArmed && stkBlendArmed) setStickerBlend(false); // mutually exclusive single-finger tools
  updateStickerUI();
}
stkPerspBtn.addEventListener("click", () => setStickerPersp(!stkPerspArmed));
stkPerspResetBtn.addEventListener("click", () => {
  const s = selSticker();
  if (!s || !s.corners) return;
  s.corners = null; // back to the plain scale+rot rect
  draw();
  flushRecord();
});
stkBlendClearBtn.addEventListener("click", () => {
  const s = selSticker();
  if (!s || !s.mask) return;
  s.mask = null; // absent = fully shown
  s.maskRev = (s.maskRev ?? 0) + 1;
  draw();
  flushRecord();
});

/** Lazily give the sticker a full-shown mask sized to the asset's aspect. */
function ensureStickerMask(s: Sticker): BrushMask | null {
  if (s.mask) return s.mask;
  const a = stickerAssets[s.asset];
  if (!a) return null;
  const ar = a.h / a.w;
  let w = STK_BLEND_EDGE, h = STK_BLEND_EDGE;
  if (ar >= 1) w = Math.max(1, Math.round(STK_BLEND_EDGE / ar));
  else h = Math.max(1, Math.round(STK_BLEND_EDGE * ar));
  s.mask = { w, h, data: new Uint8Array(w * h).fill(255) };
  return s.mask;
}

/** Canvas image-uv (u,v) → the sticker's asset-local uv (0..1 across the art),
 *  inverting the same transform sticker.ts composites with (perspective too).
 *  Null off-asset. */
function stickerLocalUv(s: Sticker, u: number, v: number): [number, number] | null {
  const a = stickerAssets[s.asset];
  if (!a || !current) return null;
  const W = current.width, H = current.height;
  const dispRot = renderer.rotation * 90; // match the baked (display-oriented) sticker
  const minv = stickerXform(s, W, H, a, dispRot);
  if (minv) {
    const X = u * W, Y = v * H;
    const w = minv[6] * X + minv[7] * Y + minv[8];
    if (w === 0) return null;
    return [(minv[0] * X + minv[1] * Y + minv[2]) / w, (minv[3] * X + minv[4] * Y + minv[5]) / w];
  }
  const hw = (s.scale * W) / 2, hh = hw * (a.h / a.w);
  if (hw <= 0 || hh <= 0) return null;
  const dx = u * W - s.x * W, dy = v * H - s.y * H;
  const ang = (-(s.rot - dispRot) * Math.PI) / 180;
  const lx = dx * Math.cos(ang) - dy * Math.sin(ang);
  const ly = dx * Math.sin(ang) + dy * Math.cos(ang);
  return [lx / (2 * hw) + 0.5, ly / (2 * hh) + 0.5];
}

function stkBrushRadiusPx(b: BrushMask): number {
  return Math.max(1, Number(stkBrushSize.value) * Math.max(b.w, b.h));
}
function stkStamp(s: Sticker, tx: number, ty: number) {
  const b = s.mask;
  if (!b) return;
  const r = stkBrushRadiusPx(b);
  const cx = tx * (b.w - 1), cy = ty * (b.h - 1);
  const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(b.w - 1, Math.ceil(cx + r));
  const y0 = Math.max(0, Math.floor(cy - r)), y1 = Math.min(b.h - 1, Math.ceil(cy + r));
  const hard = 0.55;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy) / r;
      if (d > 1) continue;
      let fall = 1;
      if (d > hard) { const t = (d - hard) / (1 - hard); fall = 1 - t * t * (3 - 2 * t); }
      const idx = y * b.w + x;
      const amt = fall * 255;
      b.data[idx] = stkBlendRestore ? Math.min(255, Math.max(b.data[idx], amt)) : Math.max(0, b.data[idx] - amt);
    }
  }
  s.maskRev = (s.maskRev ?? 0) + 1;
}
function stkPaintStroke(s: Sticker, tx: number, ty: number) {
  if (stkLastLocal && s.mask) {
    const [lu, lv] = stkLastLocal;
    const b = s.mask;
    const distPx = Math.hypot((tx - lu) * (b.w - 1), (ty - lv) * (b.h - 1));
    const step = Math.max(1, stkBrushRadiusPx(b) * 0.3);
    const n = Math.max(1, Math.ceil(distPx / step));
    for (let k = 1; k <= n; k++) stkStamp(s, lu + (tx - lu) * (k / n), lv + (ty - lv) * (k / n));
  } else {
    stkStamp(s, tx, ty);
  }
  stkLastLocal = [tx, ty];
  draw();
}
/** Begin a blend stroke at a canvas point. Returns false if it didn't consume
 *  the pointer (e.g. off the sticker), so the caller can fall back to dragging. */
function startStickerPaint(e: PointerEvent): boolean {
  const s = selSticker();
  if (!s) return false;
  const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
  const loc = stickerLocalUv(s, u, v);
  if (!loc) return false; // no geometry (degenerate sticker)
  // Begin the stroke wherever you press — even STARTING OFF the sticker — so you
  // can brush inward across its edge to trim it. A stamp that lands outside the
  // mask is a harmless no-op; the interpolated stroke fills in once it crosses in.
  // Copy-on-write: undo snapshots share this mask buffer, so fork it first.
  if (s.mask) s.mask = { w: s.mask.w, h: s.mask.h, data: new Uint8Array(s.mask.data) };
  else if (!ensureStickerMask(s)) return false;
  stkPainting = true;
  stkLastLocal = null;
  canvas.setPointerCapture(e.pointerId);
  showStkBrush(e.clientX, e.clientY);
  stkPaintStroke(s, loc[0], loc[1]);
  return true;
}
function moveStickerPaint(e: PointerEvent) {
  const s = selSticker();
  if (!s) return;
  showStkBrush(e.clientX, e.clientY);
  const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
  const loc = stickerLocalUv(s, u, v);
  if (loc) stkPaintStroke(s, loc[0], loc[1]);
}
function endStickerPaint() {
  if (!stkPainting) return;
  stkPainting = false;
  stkLastLocal = null;
  hideStkBrush();
  flushRecord();
}

// --- Brush-size cursor: a ring showing the sticker brush's real footprint, so
// the Brush size slider (and each stroke) has something to show. Floats over the
// photo, so it's styled theme-invariant (light ring + dark halo, visible on any
// scene). Shown live while painting and briefly when the size slider moves. ---
const stkBrushCursor = $("stkBrush") as HTMLDivElement;
Object.assign(stkBrushCursor.style, {
  position: "absolute", borderRadius: "50%", boxSizing: "border-box",
  border: "2px solid rgba(255,255,255,.92)",
  boxShadow: "0 0 0 1.5px rgba(0,0,0,.6), inset 0 0 0 1.5px rgba(0,0,0,.4)",
  pointerEvents: "none", transform: "translate(-50%, -50%)", zIndex: "6",
});
let stkBrushHideTimer = 0;
/** Brush radius in client px for the selected sticker at the current slider value. */
function stkBrushClientRadius(s: Sticker): number | null {
  const a = stickerAssets[s.asset];
  if (!a || !current) return null;
  // Mask radius is val·max(mask.w, mask.h); as a fraction of the sticker's WIDTH
  // that's val·max(1, a.h/a.w). The sticker's width is s.scale of the image width.
  const rUv = Number(stkBrushSize.value) * Math.max(1, a.h / a.w) * s.scale;
  const [cx, cy] = renderer.imageUvToClient(s.x, s.y);
  const [ex, ey] = renderer.imageUvToClient(s.x + rUv, s.y);
  return Math.max(4, Math.hypot(ex - cx, ey - cy));
}
/** Show the brush ring. Pass a client point to place it (while painting); omit to
 *  centre it on the selected sticker (the size-slider preview). */
function showStkBrush(clientX?: number, clientY?: number) {
  const s = selSticker();
  const r = s && stkBrushClientRadius(s);
  if (!s || !r) { hideStkBrush(); return; }
  let px = clientX, py = clientY;
  if (px === undefined || py === undefined) { [px, py] = renderer.imageUvToClient(s.x, s.y); }
  const stage = stkBrushCursor.parentElement!.getBoundingClientRect();
  stkBrushCursor.style.width = stkBrushCursor.style.height = `${2 * r}px`;
  stkBrushCursor.style.left = `${px - stage.left}px`;
  stkBrushCursor.style.top = `${py - stage.top}px`;
  stkBrushCursor.hidden = false;
}
function hideStkBrush() { stkBrushCursor.hidden = true; }
// Moving the Brush size slider flashes the ring at the sticker's centre so its
// size is visible; it lingers ~1.2s (stays put while actively painting).
stkBrushSize.addEventListener("input", () => {
  showStkBrush();
  clearTimeout(stkBrushHideTimer);
  stkBrushHideTimer = window.setTimeout(() => { if (!stkPainting) hideStkBrush(); }, 1200);
});

/** Reflect the selected sticker into the controls; show/hide the panels. */
function updateStickerUI() {
  const list = params.stickers ?? [];
  if (selectedSticker >= list.length) selectedSticker = list.length - 1;
  // After an undo/session-restore that brings stickers back with nothing
  // selected, show the last one so its controls are reachable again.
  if (selectedSticker < 0 && list.length) selectedSticker = list.length - 1;
  const s = selSticker();
  stkControls.hidden = !s;
  stkClearBtn.hidden = list.length === 0;
  if (s) {
    stkScale.value = String(s.scale);
    stkRot.value = String(s.rot);
    stkOcclude.value = String(s.occlude);
    stkTransp.value = String(1 - (s.opacity ?? 1));
    stkLum.value = String(s.lum ?? 1);
    stkBright.value = String(s.bright ?? 0);
    stkContrast.value = String(s.contrast ?? 0);
    stkWarmth.value = String(s.warmth ?? 0);
    stkSat.value = String(s.sat ?? 0);
    stkBehindBtns.forEach((b, i) => {
      const on = s.occludeBright === STK_BEHIND[i].bright;
      b.textContent = (on ? "✓ " : "") + STK_BEHIND[i].label;
      b.setAttribute("aria-pressed", String(on));
    });
    stkBlendModeBtns.forEach((b, i) => {
      const on = stkBlendRestore === STK_BLEND_MODES[i].restore;
      b.textContent = (on ? "✓ " : "") + STK_BLEND_MODES[i].label;
      b.setAttribute("aria-pressed", String(on));
    });
    stkBlendBtn.textContent = stkBlendArmed ? "✓ Painting on the sticker" : "Paint on the sticker";
    stkPerspBtn.textContent = stkPerspArmed ? "✓ Dragging the corners" : "Skew the corners";
    stkMatchStrength.value = String(s.matchAmt ?? 0);
    const reOn = s.reMatch !== false;
    stkReMatch.textContent = reOn ? "✓ Re-matching as I move it" : "Re-match as I move it";
    stkReMatch.setAttribute("aria-pressed", String(reOn));
  } else {
    if (stkBlendArmed) stkBlendArmed = false; // nothing selected to paint on
    if (stkPerspArmed) stkPerspArmed = false;
  }
  stkBlendBtn.setAttribute("aria-pressed", String(stkBlendArmed));
  stkPerspBtn.setAttribute("aria-pressed", String(stkPerspArmed));
  positionStickerOverlay();
}

/** The selected sticker's 4 corners in OVERLAY-CLIENT space (order TL,TR,BR,BL),
 *  covering rotation + perspective — the selection box and the corner handles. */
function stickerOverlayCorners(s: Sticker, a: StickerAsset): [number, number][] {
  const W = current!.width, H = current!.height;
  const rect = stickerOverlay.getBoundingClientRect();
  const toClient = (px: number, py: number): [number, number] => {
    const [cx, cy] = renderer.imageUvToClient(px / W, py / H);
    return [cx - rect.left, cy - rect.top];
  };
  const dispRot = renderer.rotation * 90; // match the baked (display-oriented) sticker
  const quad = stickerWorldCorners(s, W, H, a, dispRot);
  if (quad) return quad.map(([px, py]) => toClient(px, py));
  const hw = (s.scale * W) / 2, hh = hw * (a.h / a.w);
  const ang = ((s.rot - dispRot) * Math.PI) / 180, cs = Math.cos(ang), sn = Math.sin(ang);
  return ([[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]] as [number, number][]).map(([lx, ly]) =>
    toClient(s.x * W + (lx * cs - ly * sn), s.y * H + (lx * sn + ly * cs)));
}

/** The rotate handle sits just past the top-edge midpoint, along the box's own
 *  "up" direction (so it follows rotation, view spin and perspective). Returns
 *  the top-edge midpoint (stem start) and the handle centre, in overlay-client
 *  space, from the 4 box corners (TL,TR,BR,BL). */
function stickerRotateHandle(pts: [number, number][]): { mid: [number, number]; knob: [number, number] } {
  const mid: [number, number] = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2];
  const ctr: [number, number] = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2];
  let ux = mid[0] - ctr[0], uy = mid[1] - ctr[1];
  const ul = Math.hypot(ux, uy) || 1;
  ux /= ul; uy /= ul;
  return { mid, knob: [mid[0] + ux * 30, mid[1] + uy * 30] };
}

/** Draw the selected sticker's box as the selection cue, plus draggable handles:
 *  when Perspective is armed, the 4 corner-skew handles; otherwise 4 resize
 *  corners + a rotate knob on a stem (so resize/rotate are right there on the
 *  photo, not only in the sliders — owner, 2026-07-21). Repositions IN PLACE
 *  when the handle set is unchanged, so a live drag keeps its pointer capture
 *  (a replaceChildren would destroy the handle mid-gesture). */
function positionStickerOverlay() {
  const s = selSticker();
  const show = stickerArmed && !!current && welcome.hidden && !!s && !!stickerAssets[s!.asset];
  stickerOverlay.toggleAttribute("hidden", !show);
  if (!show || !s) { stickerOverlay.replaceChildren(); stickerOverlay.removeAttribute("data-mode"); return; }
  const a = stickerAssets[s.asset];
  const pts = stickerOverlayCorners(s, a);
  // "persp" = skew corners; "xform" = resize corners + rotate knob; "box" = just
  // the selection outline (while painting on the sticker, so handles don't fight
  // the brush).
  const mode = stkPerspArmed ? "persp" : (stkBlendArmed ? "box" : "xform");
  const pointsStr = pts.map(([x, y]) => `${x},${y}`).join(" ");
  const rot = mode === "xform" ? stickerRotateHandle(pts) : null;
  const kids = stickerOverlay.childNodes;
  if (stickerOverlay.getAttribute("data-mode") === mode && (kids[0] as Element)?.tagName === "polygon") {
    (kids[0] as SVGPolygonElement).setAttribute("points", pointsStr);
    if (mode === "persp") {
      for (let k = 0; k < 4; k++) {
        const c = kids[1 + k] as SVGCircleElement;
        c.setAttribute("cx", String(pts[k][0])); c.setAttribute("cy", String(pts[k][1]));
      }
    } else if (mode === "xform" && rot) {
      for (let k = 0; k < 4; k++) {
        const c = kids[1 + k] as SVGCircleElement;
        c.setAttribute("cx", String(pts[k][0])); c.setAttribute("cy", String(pts[k][1]));
      }
      const stem = kids[5] as SVGLineElement;
      stem.setAttribute("x1", String(rot.mid[0])); stem.setAttribute("y1", String(rot.mid[1]));
      stem.setAttribute("x2", String(rot.knob[0])); stem.setAttribute("y2", String(rot.knob[1]));
      const knob = kids[6] as SVGCircleElement;
      knob.setAttribute("cx", String(rot.knob[0])); knob.setAttribute("cy", String(rot.knob[1]));
    }
    return;
  }
  const poly = document.createElementNS(SVGNS, "polygon");
  poly.setAttribute("points", pointsStr);
  poly.setAttribute("class", "sticker-box");
  const els: SVGElement[] = [poly];
  if (mode === "persp") {
    for (let k = 0; k < 4; k++) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("r", "11");
      c.setAttribute("cx", String(pts[k][0])); c.setAttribute("cy", String(pts[k][1]));
      c.setAttribute("class", "sticker-corner");
      attachStickerCornerDrag(c, k);
      els.push(c);
    }
  } else if (mode === "xform" && rot) {
    for (let k = 0; k < 4; k++) {
      const c = document.createElementNS(SVGNS, "circle");
      c.setAttribute("r", "11");
      c.setAttribute("cx", String(pts[k][0])); c.setAttribute("cy", String(pts[k][1]));
      c.setAttribute("class", "sticker-size");
      c.setAttribute("aria-label", "Resize the sticker");
      attachStickerSizeDrag(c);
      els.push(c);
    }
    const stem = document.createElementNS(SVGNS, "line");
    stem.setAttribute("x1", String(rot.mid[0])); stem.setAttribute("y1", String(rot.mid[1]));
    stem.setAttribute("x2", String(rot.knob[0])); stem.setAttribute("y2", String(rot.knob[1]));
    stem.setAttribute("class", "sticker-stem");
    els.push(stem);
    const knob = document.createElementNS(SVGNS, "circle");
    knob.setAttribute("r", "11");
    knob.setAttribute("cx", String(rot.knob[0])); knob.setAttribute("cy", String(rot.knob[1]));
    knob.setAttribute("class", "sticker-rotate");
    knob.setAttribute("aria-label", "Rotate the sticker");
    attachStickerRotateDrag(knob);
    els.push(knob);
  }
  stickerOverlay.setAttribute("data-mode", mode);
  stickerOverlay.replaceChildren(...els);
}

// Base local corners (order TL,TR,BR,BL) in half-extent units.
const STK_CORNER_BASE: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]];

/** Drag corner `k` to set its perspective offset. Client point → the sticker's
 *  local frame → the offset stored in s.corners[k]. Bakes live (one bbox, rAF-
 *  coalesced); one drag = one undo step (copy-on-write on the corners array). */
function attachStickerCornerDrag(el: SVGCircleElement, k: number) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation(); // a corner grab must not also start a body drag
    const s = selSticker();
    if (!s || !current) return;
    el.setPointerCapture(e.pointerId);
    // Copy-on-write: fork the corners so undo history stays intact.
    s.corners = (s.corners ?? [[0, 0], [0, 0], [0, 0], [0, 0]]).map((c) => [c[0], c[1]] as [number, number]);
    stkCornerLive = true;
    const a = stickerAssets[s.asset]!;
    const W = current.width, H = current.height;
    const move = (ev: PointerEvent) => {
      const cur = selSticker();
      if (!cur || !cur.corners) return;
      const [u, v] = renderer.clientToImageUv(ev.clientX, ev.clientY);
      const hw = (cur.scale * W) / 2, hh = hw * (a.h / a.w);
      const dxp = u * W - cur.x * W, dyp = v * H - cur.y * H;
      const ang = (cur.rot * Math.PI) / 180, cs = Math.cos(ang), sn = Math.sin(ang);
      const lx = cs * dxp + sn * dyp; // Rot(-rot) · (world - centre)
      const ly = -sn * dxp + cs * dyp;
      cur.corners[k] = [clamp(lx / hw - STK_CORNER_BASE[k][0], -1.5, 1.5), clamp(ly / hh - STK_CORNER_BASE[k][1], -1.5, 1.5)];
      draw();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      stkCornerLive = false;
      flushRecord();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  });
}

/** Drag a corner handle to RESIZE: the corner follows the finger, so scale =
 *  finger-distance-from-centre ÷ the base half-diagonal. Held live like the Size
 *  slider (ghost tracks it, one bake on release, one undo). */
function attachStickerSizeDrag(el: SVGCircleElement) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation(); // a handle grab must not also start a body drag / pinch
    const s = selSticker();
    if (!s || !current) return;
    const a = stickerAssets[s.asset];
    if (!a) return;
    el.setPointerCapture(e.pointerId);
    stkHandleLive = true;
    beginStickerLive();
    const W = current.width, H = current.height;
    const diag = (W / 2) * Math.hypot(1, a.h / a.w); // centre → corner at scale 1
    const move = (ev: PointerEvent) => {
      const cur = selSticker();
      if (!cur) return;
      const [u, v] = renderer.clientToImageUv(ev.clientX, ev.clientY);
      const d = Math.hypot(u * W - cur.x * W, v * H - cur.y * H);
      cur.scale = clamp(d / diag, 0.015, 1);
      if (cur.shadow) cur.linkTo = undefined; // hand-resized shadow detaches
      updateStickerUI(); // Size slider follows the finger
      previewStickerTransform();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      stkHandleLive = false;
      endStickerLive(); // bake the final size in
      flushRecord();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
}

/** Drag the rotate knob to SPIN: the sticker's top points at the finger. Solves
 *  s.rot from the finger's angle about the centre, countering the photo's display
 *  rotation so it reads upright on screen. Held live like the Spin slider. */
function attachStickerRotateDrag(el: SVGCircleElement) {
  el.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    e.stopPropagation();
    const s = selSticker();
    if (!s || !current) return;
    el.setPointerCapture(e.pointerId);
    stkHandleLive = true;
    beginStickerLive();
    const W = current.width, H = current.height;
    const dispRot = renderer.rotation * 90;
    const move = (ev: PointerEvent) => {
      const cur = selSticker();
      if (!cur) return;
      const [u, v] = renderer.clientToImageUv(ev.clientX, ev.clientY);
      const dx = u * W - cur.x * W, dy = v * H - cur.y * H;
      if (dx === 0 && dy === 0) return;
      let deg = (Math.atan2(dx, -dy) * 180) / Math.PI + dispRot; // top-edge points at the finger
      deg = ((((deg + 180) % 360) + 360) % 360) - 180; // wrap to −180..180
      cur.rot = Math.round(deg);
      if (cur.shadow) cur.linkTo = undefined; // hand-spun shadow detaches
      updateStickerUI(); // Spin slider follows
      previewStickerTransform();
    };
    const up = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      el.removeEventListener("pointercancel", up);
      stkHandleLive = false;
      endStickerLive();
      flushRecord();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
    el.addEventListener("pointercancel", up);
  });
}

/** Arm/disarm sticker manipulation on the canvas. Arming loads the assets and
 *  disarms the other exclusive picture tools (heal/crop/masks/picks). */
function setStickerMode(on: boolean) {
  stickerArmed = on && !!current;
  if (stickerArmed) {
    void loadStickerAssets();
    setHslPick(false); setColorPick(false); setTat(false); setHeal(false); setHealReview(false); setGeoMode(null);
    mUI.paint.setAttribute("aria-pressed", "false");
  } else {
    endStickerLive(); // leaving the tab mid-gesture must bake + drop the ghost
    if (stkPainting) endStickerPaint();
    stkBlendArmed = false;
    stkPerspArmed = false;
    stkCornerLive = false;
    stkHandleLive = false;
    stkPinch = null;
    stickerPointers.clear();
  }
  updateStickerUI();
}
stickerReady = true; // the sticker block is defined — setPanelTab may now arm it
if ((activePanelTab as PanelTab) === "stickers") setStickerMode(true); // restored straight into the tab

// --- Warp (Creative): push, swirl, pinch & bloat the picture with a finger.
// Strokes paint a UV displacement field (warp.ts) that the shader + export
// sampler both read; the field rides undo (copy-on-write per stroke) and the
// session, but is composition-specific — never in looks/batch/.cube. ---
let warpArmed = false;
let warpStroke: { id: number; lastU: number; lastV: number; started: boolean } | null = null;
const WARP_TOOLS: { label: string; tool: WarpTool }[] = [
  { label: "Push", tool: "push" },
  { label: "Swirl", tool: "swirl" },
  { label: "Pinch", tool: "pinch" },
  { label: "Bloat", tool: "bloat" },
];
let warpTool: WarpTool = "push";
const warpToolsEl = $("warpTools") as HTMLDivElement;
const warpToolBtns: HTMLButtonElement[] = [];
for (const def of WARP_TOOLS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "mix-chip";
  b.addEventListener("click", () => {
    warpTool = def.tool;
    updateWarpUI();
  });
  warpToolsEl.append(b);
  warpToolBtns.push(b);
}
const warpSizeEl = $("warpSize") as HTMLInputElement;
const warpStrengthEl = $("warpStrength") as HTMLInputElement;

function updateWarpUI() {
  warpToolBtns.forEach((b, i) => {
    const on = warpTool === WARP_TOOLS[i].tool;
    b.textContent = (on ? "✓ " : "") + WARP_TOOLS[i].label;
    b.setAttribute("aria-pressed", String(on));
  });
}

function setWarpMode(on: boolean) {
  warpArmed = on && !!current;
  if (warpArmed) {
    setHslPick(false); setColorPick(false); setTat(false); setHeal(false); setHealReview(false); setGeoMode(null); setStickerMode(false);
    mUI.paint.setAttribute("aria-pressed", "false");
  }
  updateWarpUI();
}

/** Begin a warp stroke: clone the field first (copy-on-write, so history keeps
 *  the pre-stroke version), then paint the first dab. */
function startWarpStroke(e: PointerEvent) {
  if (!current) return;
  const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
  // Copy-on-write: a fresh field object + buffers so the previous snapshot's
  // field stays frozen for undo.
  const prev = params.warp;
  const f: WarpField = prev
    ? { res: prev.res, du: Float32Array.from(prev.du), dv: Float32Array.from(prev.dv), rgba: Uint8Array.from(prev.rgba), rev: prev.rev }
    : makeWarpField();
  params.warp = f;
  canvas.setPointerCapture(e.pointerId);
  warpStroke = { id: e.pointerId, lastU: u, lastV: v, started: false };
  paintWarpAt(u, v, [0, 0]);
}

function paintWarpAt(u: number, v: number, move: [number, number]) {
  const f = params.warp;
  if (!f) return;
  const aspect = current ? current.width / current.height : 1;
  const changed = paintWarp(f, warpTool, u, v, Number(warpSizeEl.value), Number(warpStrengthEl.value), aspect, move);
  if (changed) {
    f.rev++; // bump so syncWarpField re-uploads
    encodeWarp(f);
    warpStroke && (warpStroke.started = true);
    draw();
  }
}

function moveWarpStroke(e: PointerEvent) {
  if (!warpStroke || e.pointerId !== warpStroke.id) return;
  const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
  paintWarpAt(u, v, [u - warpStroke.lastU, v - warpStroke.lastV]);
  warpStroke.lastU = u;
  warpStroke.lastV = v;
}

function endWarpStroke() {
  if (!warpStroke) return;
  const started = warpStroke.started;
  warpStroke = null;
  if (started) flushRecord(); // one stroke = one undo step
}

$("warpReset").addEventListener("click", () => {
  if (warpFieldEmpty(params.warp)) return;
  params.warp = null;
  draw();
  flushRecord();
});
updateWarpUI();
warpReady = true;
if ((activePanelTab as PanelTab) === "warp") setWarpMode(true);

// --- Location-data guard: the 🛰 tip shows when the LOADED FILE carries GPS
// location (src/gps.ts scans the actual bytes — EXIF GPS IFD and XMP). Tap it
// for two honest ways out: save the file without location (same name — the
// save sheet lets you put it back where you keep it) or save a clean copy;
// both re-check the result before claiming clean. Settings (ⓘ): hide the tip,
// or strip location from the app's working copy the moment a photo opens —
// the tip then still shows, saying plainly that the ORIGINAL file keeps its
// location until a clean version is saved (labels stay honest). ---
const locTipBtn = $("locTip") as HTMLButtonElement;
const locDlg = $("locDlg") as HTMLDialogElement;
const locDlgBody = $("locDlgBody") as HTMLParagraphElement;
const setLocTipBtn = $("setLocTip") as HTMLButtonElement;
const setLocStripBtn = $("setLocStrip") as HTMLButtonElement;
// Deferred: the ⓘ dialog's open function is created further down (it owns the
// scroll cues); it registers itself here so "Open Settings" can reach it.
let openInfoDialog: () => void = () => {};

const locTipPref = () => { try { return localStorage.getItem("ips-loc-tip") !== "0"; } catch { return true; } };
const locStripPref = () => { try { return localStorage.getItem("ips-loc-strip") === "1"; } catch { return false; } };

/** Run on every imported file before it's decoded/stored: record whether the
 *  original bytes carry location, and — with the strip-on-open setting — wipe
 *  the app's working copy (so session/batch storage never holds it either).
 *  A strip only counts when the re-check comes back clean. */
function guardLocation(imported: ImportedFile): ImportedFile {
  try {
    imported.hadLocation = findLocation(imported.bytes);
    imported.locationCleaned = false;
    if (imported.hadLocation && locStripPref()) {
      const clean = stripLocation(imported.bytes);
      if (clean && !findLocation(clean)) {
        imported.bytes = clean;
        imported.locationCleaned = true;
      }
    }
  } catch {
    imported.hadLocation = false; // a scan failure must never block an open
  }
  return imported;
}

function updateLocTip() {
  locTipBtn.hidden = !(current && currentFile?.hadLocation && locTipPref());
}

locTipBtn.addEventListener("click", () => {
  locDlgBody.textContent = currentFile?.locationCleaned
    ? "Location was removed from the app's working copy when this photo opened (your setting). The original file on your device still carries it — save a version without it below."
    : "This file stores where the photo was taken (GPS). Save a version without it — the same name to replace the file where you keep it, or a copy to keep both.";
  locDlg.showModal();
});
$("locDlgClose").addEventListener("click", () => locDlg.close());
locDlg.addEventListener("click", (e) => {
  if (e.target === locDlg) locDlg.close(); // tap outside to dismiss
});
// The ⓘ panel opens at "What's new". Settings is below the changelog AND the
// roadmap, and the row a reader wants when something is wrong is inside it, so
// the one thing you go looking for in a hurry is the furthest down the page.
for (const [btn, head] of [["jumpRoadmap", "rmHead"], ["jumpSettings", "settingsHead"]] as const) {
  const el = document.getElementById(btn);
  const target = document.getElementById(head);
  if (el && target) el.addEventListener("click", () => target.scrollIntoView({ block: "start", behavior: "smooth" }));
}

$("locSettings").addEventListener("click", () => {
  locDlg.close();
  openInfoDialog();
  // Land ON the Settings section — the ⓘ dialog opens at "What's new".
  requestAnimationFrame(() => $("settingsHead").scrollIntoView({ block: "start" }));
});

async function saveWithoutLocation(copy: boolean) {
  if (!currentFile) return;
  const clean = currentFile.locationCleaned ? currentFile.bytes : stripLocation(currentFile.bytes);
  if (!clean || findLocation(clean)) {
    // Never hand over a file we can't PROVE is clean.
    toast("Couldn't remove location from this file safely — nothing was saved.", 3600);
    return;
  }
  const m = currentFile.name.match(/^(.*?)(\.[^.]+)?$/)!;
  const name = copy ? `${m[1]} (no location)${m[2] ?? ""}` : currentFile.name;
  const type = currentFile.kind === "jpeg" ? "image/jpeg" : currentFile.kind === "png" ? "image/png" : "application/octet-stream";
  const r = await saveBlob(new Blob([arrayBufferOf(clean) as ArrayBuffer], { type }), name);
  if (r === "cancelled") return; // sheet closed on purpose — keep the dialog
  toast(copy ? "Copy saved without location." : "Saved without location.", 2600);
  locDlg.close();
}
$("locSave").addEventListener("click", () => void saveWithoutLocation(false));
$("locSaveCopy").addEventListener("click", () => void saveWithoutLocation(true));

// ---- Shared ask/notice dialog ---------------------------------------------
// One reusable modal for the app's questions and simple notices — a real
// <dialog>, so Escape, focus containment, and screen-reader announcement all
// come from the platform instead of window.confirm/alert.
const askDlg = $("askDlg") as HTMLDialogElement;
const askTitleEl = $("askTitle");
const askBodyEl = $("askBody");
const askOkBtn = $("askOk") as HTMLButtonElement;
const askCancelBtn = $("askCancel") as HTMLButtonElement;

/** Ask a two-way question. Resolves "ok" or "cancel" for the buttons, or
 *  "dismiss" when the dialog closes any other way (Escape) — callers treat
 *  dismiss as "change nothing", never as either answer. */
function askDialog(title: string, body: string, okLabel: string, cancelLabel: string): Promise<"ok" | "cancel" | "dismiss"> {
  askTitleEl.textContent = title;
  askBodyEl.textContent = body;
  askOkBtn.textContent = okLabel;
  askCancelBtn.textContent = cancelLabel;
  askCancelBtn.hidden = false;
  return new Promise((resolve) => {
    let answer: "ok" | "cancel" | "dismiss" = "dismiss";
    const onOk = () => { answer = "ok"; askDlg.close(); };
    const onCancel = () => { answer = "cancel"; askDlg.close(); };
    const onClose = () => {
      askOkBtn.removeEventListener("click", onOk);
      askCancelBtn.removeEventListener("click", onCancel);
      askDlg.removeEventListener("close", onClose);
      resolve(answer);
    };
    askOkBtn.addEventListener("click", onOk);
    askCancelBtn.addEventListener("click", onCancel);
    askDlg.addEventListener("close", onClose);
    askDlg.showModal();
  });
}

/** A one-button notice — alert(), but accessible, dismissable, and in-theme. */
function noticeDialog(title: string, body: string): Promise<void> {
  const done = askDialog(title, body, "OK", "");
  askCancelBtn.hidden = true; // askDialog just un-hid it — a notice has no second answer
  return done.then(() => { askCancelBtn.hidden = false; });
}

function syncLocSettings() {
  setLocTipBtn.setAttribute("aria-pressed", String(locTipPref()));
  setLocStripBtn.setAttribute("aria-pressed", String(locStripPref()));
}
setLocTipBtn.addEventListener("click", () => {
  try { localStorage.setItem("ips-loc-tip", locTipPref() ? "0" : "1"); } catch { /* private mode */ }
  syncLocSettings();
  updateLocTip();
});
setLocStripBtn.addEventListener("click", () => {
  try { localStorage.setItem("ips-loc-strip", locStripPref() ? "0" : "1"); } catch { /* private mode */ }
  syncLocSettings();
});
syncLocSettings();

// "Update to the latest version" — a PWA hard-refresh so a new deploy shows
// without force-closing the app. Before it existed, reaching a new release took
// TWO force-closes, which is a thing most readers will never do and a thing
// nobody should have to know (owner rule, 2026-07-20). Asks the SW to fetch the
// newest sw.js, tells any waiting worker to take over now (the SKIP_WAITING
// message the SW listens for), then reloads — navigations are network-first, so
// the reload pulls the fresh shell + its new hashed assets even if the SW check
// finds nothing.
wireForceUpdate($("forceUpdate") as HTMLButtonElement, $("forceUpdateNote") as HTMLElement);
// And the push half of §7h — the strip that says so without being asked.
wireUpdateStrip();

// --- Local masks: radial / linear gradient with a few local adjustments,
// placed by dragging handles on the photo. Geometry is in image-uv so masks
// stay glued to the subject through zoom/pan/rotation. ---
const SVGNS = "http://www.w3.org/2000/svg";
const maskOverlay = $("maskOverlay") as unknown as SVGSVGElement;
const maskList = $("maskList") as HTMLDivElement;
const maskCount = $("maskCount") as HTMLParagraphElement;
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
  outline: $("mOutline") as HTMLButtonElement,
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
// User toggle: show the radial/linear handle outline on the photo. Lets you
// judge the masked result cleanly while the sliders are open; a fresh geometry
// mask always turns it back on so its handles are there to place.
let showMaskOutline = true;
// Transient: while a mask slider is being dragged the heavy coverage TINT steps
// aside so you can see your adjustment on the real photo. The thin handle
// outline stays. This never touches showMaskOutline (the persistent preference)
// — it clears the moment you re-engage: pick a mask, drag a handle, add a mask,
// tap Show mask, or re-enter the Masks tab.
let maskAdjusting = false;
overlayReady = true; // the overlay's DOM + deps now exist (see setPanelTab)

/** Step the coverage tint aside for hands-on slider tuning (outline stays).
 *  Re-engagement (mask select / handle drag / add / Show mask / tab re-enter)
 *  clears the flag directly at each site, so there is no matching end-helper. */
function beginMaskAdjust() {
  if (maskAdjusting) return;
  maskAdjusting = true;
  renderMaskOverlay();
}

mUI.outline.addEventListener("click", () => {
  if (maskAdjusting) {
    // The tint had stepped aside for slider tuning; the button's job now is to
    // bring it back, not to flip the persistent preference.
    maskAdjusting = false;
    showMaskOutline = true;
  } else {
    showMaskOutline = !showMaskOutline;
  }
  mUI.outline.setAttribute("aria-pressed", String(showMaskOutline));
  renderMaskOverlay();
});

function currentMask(): MaskLayer | null {
  return selectedMask >= 0 && selectedMask < params.masks.length ? params.masks[selectedMask] : null;
}

/** Brush(2) and sky(4) masks share the 4-channel bitmap texture (see gl.ts) —
 *  count how many exist so the UI can cap them independently of the total. */
function bitmapMaskCount(): number {
  return params.masks.reduce((n, m) => n + (m.type === 2 || m.type === 4 ? 1 : 0), 0);
}

function addMask(type: 0 | 1 | 2 | 3 | 4) {
  if (!current || params.masks.length >= MAX_MASKS) return;
  // Brush/sky are limited further by the shared bitmap texture's 4 channels.
  if ((type === 2 || type === 4) && bitmapMaskCount() >= MAX_BITMAP_MASKS) return;
  maskAdjusting = false; // adding a mask re-engages the overlay
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
    disarmPictureTools(); // painting owns the canvas now
  }
  if (type === 4) regenerateSkyMask(m); // detect the sky now (fills m.brush)
  params.masks.push(m);
  selectedMask = params.masks.length - 1;
  if (type === 0 || type === 1) showMaskOutline = true; // a new geometry mask shows its handles
  setPanelTab("masks"); // reveal the just-created mask's editor in its own tab
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
  mUI.skyStatus.textContent = frac < SKY_MIN_COVERAGE
    ? "No clear sky found — try a Brush or Color mask, or raise Reach."
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
  maskAdjusting = false; // re-engaging with a mask brings the coverage tint back
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
      const label = m.type === 0 ? "Radial" : m.type === 1 ? "Gradient" : m.type === 2 ? "Brush" : m.type === 3 ? "Color" : "Sky";
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
  const total = params.masks.length;
  const full = !current || total >= MAX_MASKS;
  const bitmapFull = bitmapMaskCount() >= MAX_BITMAP_MASKS;
  addRadialBtn.disabled = full;
  addLinearBtn.disabled = full;
  addColorBtn.disabled = full;
  // Brush + Sky hit the bitmap cap first; a tooltip explains why when it does.
  addBrushBtn.disabled = full || bitmapFull;
  addSkyBtn.disabled = full || bitmapFull;
  const bitmapHint = bitmapFull && !full ? `Up to ${MAX_BITMAP_MASKS} brush or sky masks` : "";
  addBrushBtn.title = bitmapHint;
  addSkyBtn.title = bitmapHint;
  maskCount.textContent = current
    ? `${total} of ${MAX_MASKS} mask${total === 1 ? "" : "s"}${full ? " — limit reached" : ""}`
    : "";
  if (m) {
    mUI.brightness.value = String(m.brightness);
    mUI.contrast.value = String(m.contrast);
    mUI.sat.value = String(m.saturation);
    mUI.hue.value = String(m.hue);
    mUI.warmth.value = String(m.warmth);
    mUI.feather.value = String(m.feather);
    // Feather is the soft edge for radial, colour AND sky masks (transition width).
    mUI.featherRow.hidden = m.type !== 0 && m.type !== 3 && m.type !== 4;
    // The overlay toggle governs the coverage tint (all types) + the handle
    // outline (radial/linear), so it's available for every mask.
    mUI.outline.setAttribute("aria-pressed", String(showMaskOutline));
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
    : "Tap the photo to pick a color";
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
  el.addEventListener("input", () => { beginMaskAdjust(); syncMaskFromUI(); });
}
// Sky "Reach" scales the detection tolerances — regenerate the bitmap on drag
// (cheap at the brush working resolution; one gesture coalesces to one undo
// step via draw()'s debounce, like every other mask slider).
mUI.skyReach.addEventListener("input", () => {
  const m = currentMask();
  if (!m || m.type !== 4) return;
  beginMaskAdjust();
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
  if (colorPickArmed) { setHslPick(false); setTat(false); setHeal(false); setHealReview(false); setGeoMode(null); mUI.paint.setAttribute("aria-pressed", "false"); } // picture tools are exclusive
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
  // The mask overlay is live only while the Masks tab is open and the user
  // hasn't hidden it. The COVERAGE tint (drawn in the shader) works for every
  // mask type; the handle OUTLINE only exists for radial (0) / linear (1) —
  // brush/colour/sky have no geometry to grab.
  const overlayOn = !!current && !panel.hidden && welcome.hidden && activePanelTab === "masks" && showMaskOutline && !!m;
  // Coverage tint: re-render with the shader overlay when what's shown changes.
  // It also steps aside while a slider is being dragged (maskAdjusting) so the
  // adjustment shows on the real photo — the handle outline below is unaffected.
  const tintOn = overlayOn && !maskAdjusting;
  const vizIdx = tintOn ? selectedMask : -1;
  if (renderer.maskViz !== vizIdx) {
    renderer.maskViz = vizIdx;
    draw();
  }
  const showable = overlayOn && !!m && (m.type === 0 || m.type === 1);
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
    // Grabbing a handle re-engages: bring the coverage tint back so geometry
    // placement stays fully visible. Set maskViz directly — renderMaskOverlay()
    // would rebuild the SVG and destroy this very handle mid-drag.
    if (maskAdjusting) {
      maskAdjusting = false;
      if (renderer.maskViz !== selectedMask) { renderer.maskViz = selectedMask; draw(); }
    }
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
mUI.paint.addEventListener("click", () => {
  toggleAttr(mUI.paint);
  // Painting owns the canvas exactly like the sustained tools do — arming it
  // stands them down so a heal/TAT banner never lies over a painting tap.
  if (brushPaintOn()) disarmPictureTools();
});
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

// Dawn / dark theme switch, living in the ⓘ dialog (shared chrome).
wireThemePicker(document.getElementById("themePicker"));
wirePalettePicker(document.getElementById("palettePicker"));

// Help dialog (usage guide; the ⓘ dialog stays what's-new + support).
const helpDlg = $("helpDlg") as HTMLDialogElement;
$("helpBtn").addEventListener("click", () => helpDlg.showModal());
$("helpClose").addEventListener("click", () => helpDlg.close());
helpDlg.addEventListener("click", (e) => {
  if (e.target === helpDlg) helpDlg.close();
});
// Tutorials moved off the top bar into Help — this opens the start screen, where
// the example lessons live (goHome keeps any live photo/session parked behind).
$("helpTutorials").addEventListener("click", () => {
  helpDlg.close();
  goHome();
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

/** The true as-decoded state: every parameter neutral. Built from origParams
 *  so the non-tonal fields (masks empty, crop identity, ...) stay valid. */
function showUntouched(on: boolean) {
  if (!current || !origParams) return;
  const p = on
    ? { ...origParams, wb: [1, 1, 1] as [number, number, number], exposure: 1, denoise: 0, recover: 0 }
    : params;
  renderer.render(p);
  refreshHistogram(p);
}

function wireHold(btn: HTMLButtonElement, show: (on: boolean) => void) {
  btn.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    try {
      btn.setPointerCapture((e as PointerEvent).pointerId);
    } catch {
      /* capture is best-effort — the hold must still work without it */
    }
    show(true);
  });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"] as const) {
    btn.addEventListener(ev, () => show(false));
  }
}
const origBtn = $("origBtn") as HTMLButtonElement;
wireHold(origBtn, showOriginal);
wireHold($("untouchedBtn") as HTMLButtonElement, showUntouched);

// Panel scroll cues: arrows appear when there is more panel above/below.
function updateScrollCues() {
  if (panel.hidden) {
    cueUp.hidden = true;
    cueDown.hidden = true;
    return;
  }
  const max = panelBody.scrollHeight - panelBody.clientHeight;
  cueUp.hidden = panelBody.scrollTop < 12;
  cueDown.hidden = max <= 0 || panelBody.scrollTop > max - 12;
}
panelBody.addEventListener("scroll", updateScrollCues, { passive: true });
window.addEventListener("resize", updateScrollCues);
window.addEventListener("resize", positionMaskOverlay);
window.addEventListener("resize", positionCropOverlay);

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

/** Flip (mirror) the photo as DISPLAYED. The renderer's flip bits are
 *  source-space, so the button's meaning maps through the rotation: at
 *  90°/270° a left–right mirror on screen is a source-Y mirror. View state
 *  like rotation (not in the edit/undo; export takes it via opts.flip). */
function toggleFlip(displayVertical: boolean) {
  if (!current) return;
  const sourceBit = ((renderer.rotation & 1) ? !displayVertical : displayVertical) ? 2 : 1;
  renderer.setFlip(renderer.flip ^ sourceBit);
  resetZoom();
  if (displayVertical) {
    // The sky moved to the other display edge — re-detect, like rotate does.
    let rebuilt = false;
    for (const m of params.masks) if (m.type === 4) { regenerateSkyMask(m); rebuilt = true; }
    if (rebuilt) updateSkyStatus();
  }
  draw();
}
$("flipHBtn").addEventListener("click", () => toggleFlip(false));
$("flipVBtn").addEventListener("click", () => toggleFlip(true));

// --- Pinch to zoom, drag to pan (when zoomed). A quick tap still sets white
// balance; any real movement suppresses the tap. ---
let zoom = 1;
let panX = 0;
let panY = 0;
let zoomReady = false; // the zoom-control block is wired (guards applyZoom's early calls)
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
  } else {
    // Keep the image from being flung entirely off-screen.
    const maxX = (canvas.clientWidth * (zoom - 1)) / 2 + 60;
    const maxY = (canvas.clientHeight * (zoom - 1)) / 2 + 60;
    panX = clamp(panX, -maxX, maxX);
    panY = clamp(panY, -maxY, maxY);
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  }
  // EVERY on-photo overlay must retrace the transform — pinch/pan is a pure
  // CSS move with no repaint, so anything skipped here visibly detaches from
  // the picture (the heal rings did exactly that on the owner's iPad,
  // 2026-07-14, while the baked fixes themselves moved with the photo).
  positionMaskOverlay();
  positionHealOverlay();
  positionCropOverlay();
  if (zoomReady) updateZoomCtl(); // keep the %/buttons synced through pinch + pan too
}

function resetZoom() {
  zoom = 1;
  applyZoom();
}

// --- Zoom controls that need neither a mouse wheel nor pinch. The buttons and
// the cursor-anchored wheel both drive the SAME zoom/pan the pinch uses, so a
// desktop without a touchscreen (or a laptop with no scroll wheel) can still
// magnify to brush up close — and they work while a brush tool owns the canvas
// gestures (owner, 2026-07-21). ---
const zoomCtl = $("zoomCtl") as HTMLDivElement;
const zoomPctEl = $("zoomPct") as HTMLSpanElement;
const zoomInBtn = $("zoomIn") as HTMLButtonElement;
const zoomOutBtn = $("zoomOut") as HTMLButtonElement;
const zoomFitBtn = $("zoomFit") as HTMLButtonElement;

/** Zoom by `factor` about a client point (keeps the image point under it fixed —
 *  the same anchor math the pinch uses, expressed relative to the stage centre). */
function zoomAt(clientX: number, clientY: number, factor: number) {
  const next = clamp(zoom * factor, 1, 8);
  if (next === zoom) return;
  const k = next / zoom;
  const stageRect = canvas.parentElement!.getBoundingClientRect();
  const mx = clientX - (stageRect.left + stageRect.width / 2);
  const my = clientY - (stageRect.top + stageRect.height / 2);
  panX = mx - (mx - panX) * k;
  panY = my - (my - panY) * k;
  zoom = next;
  applyZoom();
}

/** Zoom about the stage centre (what the +/− buttons do). */
function zoomByCentre(factor: number) {
  const r = canvas.parentElement!.getBoundingClientRect();
  zoomAt(r.left + r.width / 2, r.top + r.height / 2, factor);
}

/** Show the zoom controls whenever a photo is open (and not mid-crop), and keep
 *  the % readout + the enabled/disabled states current. */
function updateZoomCtl() {
  const show = !!current && welcome.hidden && !cropArmed;
  zoomCtl.hidden = !show;
  zoomPctEl.textContent = `${Math.round(zoom * 100)}%`;
  zoomInBtn.disabled = zoom >= 8 - 1e-3;
  zoomOutBtn.disabled = zoom <= 1 + 1e-3;
  zoomFitBtn.disabled = zoom <= 1 + 1e-3;
}
zoomInBtn.addEventListener("click", () => { zoomByCentre(1.5); updateZoomCtl(); });
zoomOutBtn.addEventListener("click", () => { zoomByCentre(1 / 1.5); updateZoomCtl(); });
zoomFitBtn.addEventListener("click", () => { resetZoom(); updateZoomCtl(); });
// Cursor-anchored wheel zoom — the natural desktop gesture, and it works even
// while a picture tool owns pointer events (wheel isn't a pointer). Ctrl/⌘+wheel
// (trackpad pinch) lands here too. Passive:false so we can stop the page scroll.
canvas.addEventListener("wheel", (e) => {
  if (!current || !welcome.hidden || cropArmed) return;
  e.preventDefault();
  zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015));
  updateZoomCtl();
}, { passive: false });
zoomReady = true; // applyZoom may now refresh the control

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
  if (on) { setHslPick(false); setColorPick(false); setHeal(false); setHealReview(false); setGeoMode(null); mUI.paint.setAttribute("aria-pressed", "false"); } // mutually exclusive with the other picture tools
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
  // B&W is also neutralised: under it every displayed pixel is grey, but the
  // chips keep controlling each colour's GREY level — so the drag tool stays
  // the hands-on way to shape a 720nm mono, classifying by the colour the
  // mixer actually sees.
  const px = renderer.readUvPixel({ ...params, hsl: hslDefault(), bwOn: false }, uu, vv);
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

// --- Dust & spot healing: arm Heal, then tap a dust spot — it's patched from
// the best clean neighbourhood nearby (heal.ts picks the source). A sustained
// mode with a standing banner, like colour-pick; pan/pinch stay live so you
// can zoom right into the dust. Tap a healed spot to remove that fix; one tap
// = one undo step. Heals REWRITE THE SOURCE: they're baked into the GPU
// texture (recomputed from the pristine decode on every change), which is why
// there's no per-frame cost and denoise/sharpen see healed pixels too. ---
const healBtn = $("healBtn") as HTMLButtonElement;
const healBanner = $("healBanner") as HTMLButtonElement;
const healReviewBanner = $("healReviewBanner") as HTMLButtonElement;
const healReviewText = $("healReviewText") as HTMLSpanElement;
const healOverlay = $("healOverlay") as unknown as SVGSVGElement;
const healSize = $("healSize") as HTMLInputElement;
const healVisBtn = $("healVis") as HTMLButtonElement;
const healAutoBtn = $("healAuto") as HTMLButtonElement;
const healClearBtn = $("healClear") as HTMLButtonElement;
const healStatus = $("healStatus") as HTMLElement;

/** The exact buffer the GPU texture was uploaded from (current's own pixel/
 *  linear buffer, or the transient downscale for >MAX_PREVIEW 8-bit sources).
 *  Heal bakes read it — it stays PRISTINE; healed pixels live only in the
 *  texture — so keep the reference in sync with every setImage call. */
let previewSrc: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array } | null = null;
let bakedSpots: HealSpot[] = []; // what the texture currently has baked in
let bakedStickers: Sticker[] = []; // IN-LOOK stickers baked INTO the source texture
let bakedNormal: Sticker[] = []; // ON-TOP (over-blend) stickers in the overlay texture
let bakedScreen: Sticker[] = []; // SCREEN-blend (glow) stickers in the screen overlay
let bakedOccSig = ""; // wb×exposure signature the sticker occlusion was baked against

/** A sticker sits ON TOP of the look (keeps its own colours) unless explicitly
 *  set to blend into it. Undefined = on top (the default). */
const isOnTop = (s: Sticker) => s.onTop !== false;
let bakedWarpRev = -1; // the warp-field revision currently uploaded to the GPU
let healArmed = false;

/** Upload the warp field to the GPU when it changed (rev-compared, like the
 *  heal bake). Clears the texture when there's no warp. */
function syncWarpField() {
  const w = params.warp;
  const rev = w && !warpFieldEmpty(w) ? w.rev : -1;
  if (rev === bakedWarpRev) return;
  renderer.setWarpField(w && !warpFieldEmpty(w) ? { res: w.res, rgba: w.rgba } : null);
  bakedWarpRev = rev;
}
// The most recent heal stays ACTIVE (accented ring): the Spot size slider
// resizes it live — tap first, then dial the size until the fix looks right
// (owner ask 2026-07-14: no way to size before the tap, none to adjust after).
let activeSpotIdx = -1;
// While the slider moves with no active spot, a preview ring at the middle of
// the view shows how big the next tap will heal. Timestamp it fades at.
let healPreviewUntil = 0;
let healPreviewTimer = 0;

/** Upload the current photo's preview texture (fresh = pristine, no heals)
 *  and schedule a repaint, which re-bakes params.spots on the way. */
function uploadPreview() {
  if (!current) return;
  previewSrc = toPreview(current);
  renderer.setImage(previewSrc);
  renderer.setOverlaySize(previewSrc.width, previewSrc.height); // on-top overlays track the source size
  bakedSpots = [];
  bakedStickers = [];
  bakedNormal = [];
  bakedScreen = [];
  bakedWarpRev = -1;
  draw();
}

/** Re-bake the heal spots into the texture when they changed. Every affected
 *  rect (old spots restore, new spots apply) is recomputed from the pristine
 *  buffer with the FULL new list — deterministic, no diff bookkeeping. */
function syncSpotsToTexture() {
  if (!current || !previewSrc) return;
  syncLinkedShadows(); // glue shadows to their creatures BEFORE change-detection so a followed shadow re-bakes
  const cur = params.spots ?? [];
  // A sticker held live (mid drag/resize) is excluded — its ghost <img> shows
  // the gesture; the real composite bakes on release.
  const liveId = liveSticker >= 0 ? (params.stickers ?? [])[liveSticker] : null;
  const stk = (params.stickers ?? []).filter((s) => stickerAssets[s.asset] && s !== liveId); // only bakeable, non-live
  // Two kinds now: IN-LOOK stickers bake INTO the source (they take on the IR
  // palette); ON-TOP stickers (the default) go into a separate overlay texture
  // blended AFTER the pipeline, so they keep their own colours (owner, 2026-07-21).
  const inLook = stk.filter((s) => !isOnTop(s));
  const onTop = stk.filter(isOnTop);
  // On-top splits by blend: glows SCREEN (add light), everything else (incl. black
  // shadows) OVER. Two overlay textures, blended in their own mode in the shader.
  const normalStk = onTop.filter((s) => !s.screen);
  const screenStk = onTop.filter((s) => s.screen);
  const spotsSame = cur.length === bakedSpots.length && JSON.stringify(cur) === JSON.stringify(bakedSpots);
  // Occlusion reads display luminance (wb×exposure + cam), so a WB/exposure
  // change must re-bake even when the sticker list is unchanged.
  const occSig = `${params.wb[0]},${params.wb[1]},${params.wb[2]},${params.exposure}`;
  const occChanged = occSig !== bakedOccSig;
  // Compare stickers WITHOUT stringifying the mask bitmap (a Uint8Array would
  // serialize to a huge object every frame) — maskRev bumps on each stroke and
  // IS compared, so mask edits are still detected.
  const stkSig = (list: Sticker[]) => JSON.stringify(list, (k, v) => (k === "data" ? undefined : v));
  const inLookSame = !occChanged && inLook.length === bakedStickers.length && stkSig(inLook) === stkSig(bakedStickers);
  const normalSame = !occChanged && normalStk.length === bakedNormal.length && stkSig(normalStk) === stkSig(bakedNormal);
  const screenSame = !occChanged && screenStk.length === bakedScreen.length && stkSig(screenStk) === stkSig(bakedScreen);
  if (spotsSame && inLookSame && normalSame && screenSame) return;
  bakedOccSig = occSig;
  const W = previewSrc.width, H = previewSrc.height;
  // The photo's display rotation (EXIF orientation, 90° steps). Stickers place +
  // bake in the un-rotated sensor buffer, so they must be counter-rotated by it
  // to read upright on the DISPLAYED photo (portrait/orientation-8 fix).
  const dispRot = renderer.rotation * 90;
  // Occlusion reads the DISPLAY luminance — run the base through exposure×WB
  // (+ the camera matrix for RAW) so "bright/dark" matches what's on screen,
  // not the dim camera-native source. 8-bit sources are already ~display, so
  // no matrix; WB still applies (compileEdit applies it to them too).
  const ex = params.exposure;
  const occ = {
    wb: [params.wb[0] * ex, params.wb[1] * ex, params.wb[2] * ex] as [number, number, number],
    cam: previewSrc.linear ? current.camMatrix ?? null : null,
  };

  // (1) SOURCE bake — heals + IN-LOOK stickers. Every affected rect (old+new) is
  // recomputed from the PRISTINE source with the full current lists, so vacated
  // areas restore correctly. Heal first, then in-look stickers on top.
  if (!spotsSame || !inLookSame) {
    const rects: { x0: number; y0: number; w: number; h: number }[] = [];
    for (const s of [...bakedSpots, ...cur]) rects.push(spotRect(s, W, H));
    for (const s of [...bakedStickers, ...inLook]) {
      const a = stickerAssets[s.asset];
      if (a) rects.push(stickerRect(s, W, H, a, dispRot));
    }
    for (const rect of rects) {
      if (rect.w <= 0 || rect.h <= 0) continue;
      if (previewSrc.linear) {
        const data = bakeRgbaF32(previewSrc.linear, W, H, cur, rect);
        compositeStickersIntoRectF32(data, rect, W, H, inLook, stickerAssets, occ, dispRot);
        renderer.patchImage(rect.x0, rect.y0, rect.w, rect.h, data);
      } else {
        const data = bakeRgba8(previewSrc.pixels!, W, H, cur, rect);
        compositeStickersIntoRect8(data, rect, W, H, inLook, stickerAssets, occ, dispRot);
        renderer.patchImage(rect.x0, rect.y0, rect.w, rect.h, data);
      }
    }
    bakedSpots = cur.map((s) => ({ ...s }));
    bakedStickers = inLook.map((s) => ({ ...s, corners: s.corners ? s.corners.map((c) => [c[0], c[1]] as [number, number]) : s.corners }));
  }

  // (2) OVERLAY bake — ON-TOP stickers into the overlay texture (gamma sRGB +
  // coverage alpha). Same dirty-rect discipline: rebuild every affected rect
  // (old+new) from scratch, so a vacated rect writes back transparent. The scene
  // under a pixel (for peek-behind luma) is read straight from the pristine
  // source, matching the export sampler's occ base.
  if (!normalSame || !screenSame) {
    const occBaseAt = (sx: number, sy: number, into: Float32Array) => {
      const o = (sy * W + sx) * 4;
      if (previewSrc!.linear) { into[0] = previewSrc!.linear[o]; into[1] = previewSrc!.linear[o + 1]; into[2] = previewSrc!.linear[o + 2]; }
      else { const p = previewSrc!.pixels!; into[0] = Math.pow(p[o] / 255, 2.2); into[1] = Math.pow(p[o + 1] / 255, 2.2); into[2] = Math.pow(p[o + 2] / 255, 2.2); }
    };
    // Rebuild every affected rect (old+new) of a group into its overlay texture,
    // transparent where uncovered. Returns the new baked snapshot (corners deep-
    // copied, like the artifact fix).
    const bakeGroup = (group: Sticker[], baked: Sticker[], patch: (x: number, y: number, w: number, h: number, d: Uint8Array) => void): Sticker[] => {
      for (const s of [...baked, ...group]) {
        const a = stickerAssets[s.asset];
        if (!a) continue;
        const rect = stickerRect(s, W, H, a, dispRot);
        if (rect.w <= 0 || rect.h <= 0) continue;
        const buf = new Uint8Array(rect.w * rect.h * 4);
        compositeStickersOverlay8(buf, rect, W, H, group, stickerAssets, occ, dispRot, occBaseAt);
        patch(rect.x0, rect.y0, rect.w, rect.h, buf);
      }
      return group.map((s) => ({ ...s, corners: s.corners ? s.corners.map((c) => [c[0], c[1]] as [number, number]) : s.corners }));
    };
    if (!normalSame) {
      bakedNormal = bakeGroup(normalStk, bakedNormal, (x, y, w, h, d) => renderer.patchOverlay(x, y, w, h, d));
      renderer.setOverlayOn(normalStk.length > 0);
    }
    if (!screenSame) {
      bakedScreen = bakeGroup(screenStk, bakedScreen, (x, y, w, h, d) => renderer.patchOverlayScreen(x, y, w, h, d));
      renderer.setOverlayScreenOn(screenStk.length > 0);
    }
  }

  stickerBakeCount++; // instrumentation for the lag walk (counts real bakes)
  updateHealUI();
}
let stickerBakeCount = 0; // exposed on window in dev for the lag harness
(window as unknown as { __stickerBakes: () => number }).__stickerBakes = () => stickerBakeCount;
// Sticker-state snapshot for headless walks (transform + shadow linkage). Read-only.
(window as unknown as { __stickers: () => unknown }).__stickers = () =>
  (params.stickers ?? []).map((s) => ({ id: s.id, x: s.x, y: s.y, scale: s.scale, rot: s.rot, shadow: !!s.shadow, linkTo: s.linkTo ?? null, asset: s.asset, maskRev: s.maskRev ?? 0, hasMask: !!s.mask }));
// Select the i-th placed sticker (headless walks — exercises paths z-order hides from a tap).
(window as unknown as { __select: (i: number) => void }).__select = (i: number) => { selectedSticker = i; updateStickerUI(); };

function setHeal(on: boolean) {
  healArmed = on && !!current;
  healBtn.setAttribute("aria-pressed", String(healArmed));
  healBanner.hidden = !healArmed;
  if (healArmed) { setHslPick(false); setColorPick(false); setTat(false); setHealReview(false); setGeoMode(null); mUI.paint.setAttribute("aria-pressed", "false"); } // picture tools are exclusive
  positionHealOverlay();
}
healBtn.addEventListener("click", () => setHeal(!healArmed));
healBanner.addEventListener("click", () => setHeal(false)); // tap the banner to exit

// --- Crop & straighten: a VIEW onto the photo, not a re-bake — geometry
// only, so masks and healed spots stay anchored to the SOURCE pixels
// underneath (see pipeline.ts's cropToDisplayUv). A sustained mode like
// heal/TAT; while armed the render shows the FULL, un-cropped frame (with
// straighten still live, so a tilt visibly levels the horizon) and the box
// overlay marks the PENDING crop — exiting the mode is what actually crops
// the canvas. Straighten always re-inscribes the crop to the largest
// same-aspect rect that fits at that angle, so leveling a horizon never
// bares an empty corner; dragging the box further is clamped to stay inside
// that same safe bound. ---
const cropBtn = $("cropBtn") as HTMLButtonElement;
const cropDone = $("cropDone") as HTMLButtonElement;
const cropOverlay = $("cropOverlay") as HTMLDivElement;
const cropBox = $("cropBox") as HTMLDivElement;
const cropTools = $("cropTools") as HTMLDivElement;
const straightenSlider = $("straighten") as HTMLInputElement;
const straightenVal = $("straightenVal") as HTMLSpanElement;
const cropResetBtn = $("cropReset") as HTMLButtonElement;
const straightenBtn = $("straightenBtn") as HTMLButtonElement;
const geoLbl = $("geoLbl") as HTMLSpanElement;
const MIN_CROP = 0.1;
// Crop and Straighten are SEPARATE tools, each activated on its own (owner ask,
// repeatedly): Crop's box corners resize, Straighten's corners rotate (+ its
// slider). `geoMode` picks which; `cropArmed` stays the derived "a geometry tool
// owns the frame" flag the whole-frame render / canvas-lock / drawer-hide key off.
let geoMode: "crop" | "straighten" | null = null;
let cropArmed = false;

/** The display-rotated frame's width/height — matches Renderer's own
 *  u_dispAspect exactly (same source dims, same 90-degree swap). */
function dispAspectNow(): number {
  if (!current) return 1;
  return renderer.rotation & 1 ? current.height / current.width : current.width / current.height;
}

/** The largest same-aspect crop the current straighten angle allows without
 *  baring an empty corner, minus a hair of margin (autoInscribedCrop isn't
 *  pixel-exact against the shader's aspect-corrected rotation, so a maximal box
 *  can graze the transparent edge). Identity when straighten is 0. */
function cropSafeBound(): CropRect {
  const c = autoInscribedCrop(params.straighten, dispAspectNow());
  if (params.straighten === 0) return c;
  const pad = 0.975; // ~1.25% inset each side — clears the edge, negligible crop
  return { x: c.x + (c.w * (1 - pad)) / 2, y: c.y + (c.h * (1 - pad)) / 2, w: c.w * pad, h: c.h * pad };
}

// --- The armed preview window (fit-view). A single chokepoint: draw(),
// positionCropOverlay() and the crop drags all re-read fitViewCrop() live, so
// the box-first framing AND the pinch zoom both live here — nothing else does
// view math. `viewZoom` is preview-only (1 = the whole tilted photo; larger =
// zoomed in, box-fill and beyond); export reads params.crop and never sees it. ---
let viewZoom = 1;
const MIN_VIEW_SCALE = 0.08; // floor on the window side so a tiny crop keeps a usable backing store
// Held steady during a resize drag so the grabbed corner tracks the finger
// instead of the window sliding out from under it as the box centre shifts.
let viewFreezeCenter: { x: number; y: number } | null = null;

/** The fully-zoomed-OUT window side: the whole tilted photo with a hair of
 *  margin (crop [0,1] sits inside it, transparent corners). This is the
 *  pinch range's zoomed-OUT limit. */
function outViewScale(): number {
  const asp = dispAspectNow();
  const a = Math.abs(params.straighten) * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return 2 * Math.max(0.5 * (cos + sin / asp), 0.5 * (cos + asp * sin)) * 1.06;
}

/** The magnification at which the crop box just fills the frame — the default,
 *  box-first view (owner ask 2026-07-16). Always >= 1 (box-fill is never more
 *  zoomed-out than the whole tilt). The box's binding side (larger crop
 *  fraction) touches the frame edge; the other axis shows the dimmed
 *  continuation around it. */
function boxFillZoom(): number {
  const boxFill = Math.max(MIN_CROP, params.crop.w, params.crop.h);
  return Math.max(1, outViewScale() / boxFill);
}

/** While a geometry tool is armed the preview renders THIS square window (so the
 *  canvas keeps the base-frame aspect, object-fit:contain undistorted). Centred
 *  on the crop box so the box-first view frames it; `viewZoom` sizes it between
 *  the whole tilt (out) and box-fill/beyond (in). The renderer accepts a crop
 *  outside [0,1] — the margins render transparent. */
function fitViewCrop(): CropRect {
  const outScale = outViewScale();
  const scale = clamp(outScale / viewZoom, MIN_VIEW_SCALE, outScale);
  const c = viewFreezeCenter ?? { x: params.crop.x + params.crop.w / 2, y: params.crop.y + params.crop.h / 2 };
  return { x: c.x - scale / 2, y: c.y - scale / 2, w: scale, h: scale };
}

// output uv <-> source uv, the aspect-corrected straighten rotation (mirrors the
// gl.ts vertex shader). Center-relative; used to keep the crop box on the photo.
function outToSrc(ox: number, oy: number): [number, number] {
  const asp = dispAspectNow(), a = (params.straighten * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return [cos * ox + (sin / asp) * oy, -asp * sin * ox + cos * oy];
}
function srcToOut(sx: number, sy: number): [number, number] {
  const asp = dispAspectNow(), a = (params.straighten * Math.PI) / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  return [cos * sx - (sin / asp) * sy, asp * sin * sx + cos * sy];
}

/** Clamp a crop rect's POSITION (keeping its size) so it stays entirely on the
 *  tilted photo — the reposition/pan bound. There's slack along the non-binding
 *  axis of a rotated photo, which is exactly what lets you slide the crop. */
function clampCropOnPhoto(c: CropRect): CropRect {
  const asp = dispAspectNow(), a = Math.abs(params.straighten) * Math.PI / 180;
  const cos = Math.cos(a), sin = Math.sin(a);
  // source half-extents of this crop rect (rotated into source space)
  const bx = (c.w / 2) * cos + (c.h / 2) * (sin / asp);
  const by = (c.w / 2) * (asp * sin) + (c.h / 2) * cos;
  const m = 0.012; // keep a hair inside the photo (edge pixels read transparent)
  const [sxo, syo] = outToSrc(c.x + c.w / 2 - 0.5, c.y + c.h / 2 - 0.5);
  const sxc = clamp(sxo + 0.5, Math.min(bx + m, 0.5), Math.max(1 - bx - m, 0.5));
  const syc = clamp(syo + 0.5, Math.min(by + m, 0.5), Math.max(1 - by - m, 0.5));
  const [oxo, oyo] = srcToOut(sxc - 0.5, syc - 0.5);
  return { x: oxo + 0.5 - c.w / 2, y: oyo + 0.5 - c.h / 2, w: c.w, h: c.h };
}

/** Clamp a RESIZE so the whole box stays on the photo. The anchor corner
 *  (ax,ay) is fixed; the dragged corner wants to reach (mdx,mdy). `outToSrc` is
 *  linear, so every corner's source coords are affine in a single shrink scalar
 *  t and the on-photo region (source-UV [0,1]²) is convex — at t=0 all three
 *  non-anchor corners collapse onto the (on-photo) anchor, so a valid interval
 *  [0,t_max] always exists. We slide the dragged corner back along the drag line
 *  to the largest t that keeps ALL corners on the photo (works at any angle and
 *  after a prior crop/pan — the old centred axis-aligned bound did not).
 *  Margin 0 on purpose: the full-frame box's corners sit exactly on the photo
 *  edge (source 0/1), whose texels are opaque, so any positive margin would
 *  wrongly collapse it (the pan clamp's 0.012 belongs only to the centre test). */
function clampResizeOnPhoto(ax: number, ay: number, mdx: number, mdy: number): [number, number] {
  const ex = mdx - ax, ey = mdy - ay; // the dragged corner's travel over t: 0..1
  const [px, py] = outToSrc(ax - 0.5, ay - 0.5); // anchor in source space (t=0)
  let t = 1;
  // A corner at (ax + cxT·t, ay + cyT·t) has source coords p + q·t; bound t so
  // each source axis stays in [-0.5, 0.5] (centre-relative [0,1]).
  const bound = (cxT: number, cyT: number) => {
    const [qx, qy] = outToSrc(cxT, cyT);
    for (const [p, q] of [[px, qx], [py, qy]] as const) {
      if (q > 1e-12) t = Math.min(t, (0.5 - p) / q);
      else if (q < -1e-12) t = Math.min(t, (-0.5 - p) / q);
    }
  };
  bound(ex, 0);  // corner sharing the anchor's y (the moving x)
  bound(0, ey);  // corner sharing the anchor's x (the moving y)
  bound(ex, ey); // the dragged corner itself
  t = clamp(t, 0, 1);
  return [ax + t * ex, ay + t * ey];
}

// --- Crop aspect-ratio presets (core sweep, owner go 2026-07-18). The preset
// is a PIXEL ratio; params.crop stores fractions of the display frame, so a
// pixel ratio R maps to fractions via the frame's own aspect A:
// crop.w/crop.h = R/A ("Original" is exactly 1 in fraction space). Free (the
// default and old behaviour) leaves the resize unconstrained. The last choice
// persists like the panel tab. ---
const RATIOS: { key: string; label: string; r: number | null; invertible?: boolean }[] = [
  { key: "free", label: "Free", r: null },
  { key: "orig", label: "Original", r: 0, invertible: true },
  { key: "1:1", label: "1:1", r: 1 },
  { key: "4:5", label: "4:5", r: 4 / 5, invertible: true },
  { key: "3:2", label: "3:2", r: 3 / 2, invertible: true },
  { key: "16:9", label: "16:9", r: 16 / 9, invertible: true },
  { key: "custom", label: "Custom…", r: null },
];
let cropRatioKey = localStorage.getItem("ips-crop-ratio") ?? "free";
// Repeat-tapping the active chip flips it to its INVERSE (4:5 ⇄ 5:4) — the
// look buttons' repeat-press R⇄B pattern (owner ask 2026-07-18, on-device).
let cropRatioInv = localStorage.getItem("ips-crop-ratio-inv") === "1";
// The Custom chip's W:H pair, e.g. "7:5" (owner ask, same pass).
let cropRatioCustom = localStorage.getItem("ips-crop-ratio-custom") ?? "";
if (!RATIOS.some((x) => x.key === cropRatioKey)) cropRatioKey = "free";
if (cropRatioKey === "custom" && !parseCustomRatio(cropRatioCustom)) cropRatioKey = "free";

/** "7:5" → 1.4, validated + clamped to the supported [1/5, 5] band. */
function parseCustomRatio(pair: string): number | null {
  const m = /^([0-9]+(?:\.[0-9]+)?):([0-9]+(?:\.[0-9]+)?)$/.exec(pair);
  if (!m) return null;
  const w = Number(m[1]), h = Number(m[2]);
  if (!isFinite(w) || !isFinite(h) || w <= 0 || h <= 0) return null;
  const r = w / h;
  return r >= 0.2 && r <= 5 ? r : null;
}

/** The active preset's PIXEL ratio (before fraction conversion), or null. */
function cropRatioPixel(): number | null {
  if (cropRatioKey === "custom") return parseCustomRatio(cropRatioCustom);
  const preset = RATIOS.find((x) => x.key === cropRatioKey)!;
  if (preset.r === null) return null;
  const base = preset.r === 0 ? dispAspectNow() : preset.r;
  return cropRatioInv && preset.invertible ? 1 / base : base;
}

function cropRatioFrac(): number | null {
  const r = cropRatioPixel();
  return r === null ? null : r / dispAspectNow();
}

/** Largest preset-ratio box centred on the current crop, inside the
 *  straighten-safe bound, clamped onto the photo. */
function ratioInscribe(rf: number): CropRect {
  const b = cropSafeBound();
  const w = Math.min(b.w, b.h * rf);
  const h = w / rf;
  const cx = clamp(params.crop.x + params.crop.w / 2, b.x + w / 2, b.x + Math.max(w / 2, b.w - w / 2));
  const cy = clamp(params.crop.y + params.crop.h / 2, b.y + h / 2, b.y + Math.max(h / 2, b.h - h / 2));
  return clampCropOnPhoto({ x: cx - w / 2, y: cy - h / 2, w, h });
}

const cropRatiosEl = $("cropRatios") as HTMLDivElement;
const ratioBtns = new Map<string, HTMLButtonElement>();
for (const rdef of RATIOS) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "ratio-chip";
  b.setAttribute("aria-label", `Crop aspect ratio ${rdef.label}`);
  b.addEventListener("click", () => setCropRatio(rdef.key));
  cropRatiosEl.append(b);
  ratioBtns.set(rdef.key, b);
}

/** "4:5" → "5:4"; inverted "Original" names the orientation it becomes —
 *  Portrait/Landscape (to a photographer "flip" means MIRRORING, and the old
 *  "Original ⇅" would collide with the ⇅ tap-again hint). Square photo (or
 *  none open): the inverse is the original, keep the plain label. */
function invertedLabel(def: (typeof RATIOS)[number]): string {
  const m = /^([0-9.]+):([0-9.]+)$/.exec(def.label);
  if (m) return `${m[2]}:${m[1]}`;
  const inv = 1 / dispAspectNow();
  return inv < 1 ? "Portrait" : inv > 1 ? "Landscape" : def.label;
}

function updateRatioUI() {
  // Selected state is aria-pressed + a TEXT check — never colour alone. The
  // active chip also wears a tap-again hint badge (⇅ flips to the inverse,
  // ✎ edits the custom pair) so it keeps reading as a live control; Free and
  // 1:1 get none — a second tap on them genuinely does nothing.
  for (const [k, b] of ratioBtns) {
    const def = RATIOS.find((x) => x.key === k)!;
    const on = k === cropRatioKey;
    let label = def.label;
    if (k === "custom" && cropRatioCustom) label = on ? cropRatioCustom : `Custom (${cropRatioCustom})`;
    else if (on && cropRatioInv && def.invertible) label = invertedLabel(def);
    const hint = on ? (def.invertible ? "⇅" : k === "custom" ? "✎︎" : "") : "";
    if (hint) {
      const span = document.createElement("span");
      span.className = "chip-hint";
      span.textContent = hint;
      b.replaceChildren(document.createTextNode(`✓ ${label} `), span);
    } else {
      b.textContent = (on ? "✓ " : "") + label;
    }
    b.setAttribute("aria-pressed", String(on));
    // The aria-label must carry the tap-again action itself — it overrides the
    // button's content, so the hint glyph is invisible to a screen reader.
    b.setAttribute(
      "aria-label",
      k === "custom"
        ? `Custom crop aspect ratio${on ? " — tap again to edit the ratio" : " — opens the ratio entry"}`
        : `Crop aspect ratio ${label}${def.invertible ? (on ? ` — tap again for ${invertedForAria(def, label)}` : " — tap again for the inverse") : ""}`,
    );
  }
}

/** What a second tap on the active invertible chip yields, for the aria-label. */
function invertedForAria(def: (typeof RATIOS)[number], shownLabel: string): string {
  const flipped = invertedLabel(def);
  const target = cropRatioInv ? def.label : flipped;
  return target === shownLabel ? "the inverse" : target === "Original" ? "the original aspect" : target;
}
updateRatioUI();

function setCropRatio(key: string) {
  if (key === "custom") {
    openRatioDlg(); // Apply in the dialog commits; re-tap = edit the pair
    return;
  }
  const def = RATIOS.find((x) => x.key === key);
  if (key === cropRatioKey && def?.invertible) {
    // Repeat-tap on the active chip flips to its inverse (the look buttons'
    // repeat-press pattern).
    cropRatioInv = !cropRatioInv;
  } else {
    cropRatioKey = key;
    cropRatioInv = false;
  }
  commitRatioChoice();
}

/** Persist the current choice, refresh the chips, re-inscribe (one undo step). */
function commitRatioChoice() {
  localStorage.setItem("ips-crop-ratio", cropRatioKey);
  localStorage.setItem("ips-crop-ratio-inv", cropRatioInv ? "1" : "0");
  if (cropRatioCustom) localStorage.setItem("ips-crop-ratio-custom", cropRatioCustom);
  updateRatioUI();
  const rf = cropRatioFrac();
  if (rf && geoMode && current) {
    flushRecord();
    params.crop = ratioInscribe(rf);
    flushRecord(); // one tap = one undo step
  }
  // EVERY commit relabels the chips, which can rewrap the row and change the
  // pill's height (incl. null-rf paths — tapping Free, Reset crop) — so the
  // measured --croptools-h reserve must refresh, not just the overlay. The
  // synchronous offsetHeight read sees the new labels; no-op while unarmed.
  remeasureCropTools();
}

// Custom-ratio entry: a real dialog (helpDlg pattern), W : H + swap.
const ratioDlg = $("ratioDlg") as HTMLDialogElement;
const ratioW = $("ratioW") as HTMLInputElement;
const ratioH = $("ratioH") as HTMLInputElement;
const ratioErr = $("ratioErr") as HTMLParagraphElement;

function openRatioDlg() {
  const m = /^([0-9.]+):([0-9.]+)$/.exec(cropRatioCustom);
  ratioW.value = m ? m[1] : "";
  ratioH.value = m ? m[2] : "";
  ratioErr.hidden = true;
  ratioDlg.showModal();
}

$("ratioSwap").addEventListener("click", () => {
  const t = ratioW.value;
  ratioW.value = ratioH.value;
  ratioH.value = t;
});
$("ratioApply").addEventListener("click", () => {
  const pair = `${ratioW.value.trim()}:${ratioH.value.trim()}`;
  if (!parseCustomRatio(pair)) {
    ratioErr.hidden = false; // honest inline error, dialog stays
    return;
  }
  cropRatioCustom = pair;
  cropRatioKey = "custom";
  cropRatioInv = false;
  ratioDlg.close();
  commitRatioChoice();
});
$("ratioCancel").addEventListener("click", () => ratioDlg.close());
ratioDlg.addEventListener("click", (e) => {
  if (e.target === ratioDlg) ratioDlg.close();
});

function remeasureCropTools() {
  if (!cropArmed) return;
  stageEl.style.setProperty("--croptools-h", `${cropTools.offsetHeight}px`);
  positionCropOverlay();
  draw();
}

function setGeoMode(mode: "crop" | "straighten" | null) {
  geoMode = current ? mode : null;
  cropArmed = geoMode !== null;
  const isCrop = geoMode === "crop";
  cropBtn.setAttribute("aria-pressed", String(isCrop));
  straightenBtn.setAttribute("aria-pressed", String(geoMode === "straighten"));
  cropTools.hidden = !cropArmed;
  // The pill is shared: Crop shows its label + Reset + Done; Straighten adds the
  // slider (the .tool-crop class hides the slider row — see style.css).
  cropTools.classList.toggle("tool-crop", isCrop);
  // Per-focus aids, never both: Crop shows resize handles + a rule-of-thirds
  // grid; Straighten hides the handles + shows the alignment grid.
  cropOverlay.classList.toggle("focus-crop", isCrop);
  cropOverlay.classList.toggle("focus-straighten", geoMode === "straighten");
  geoLbl.textContent = isCrop ? "Crop" : "Straighten";
  cropResetBtn.textContent = isCrop ? "Reset crop" : "Reset";
  if (cropArmed) { setHslPick(false); setColorPick(false); setTat(false); setHeal(false); setHealReview(false); mUI.paint.setAttribute("aria-pressed", "false"); resetZoom(); } // picture tools are exclusive; geometry wants the whole frame in view
  // Pull the photo in from the stage edges while a geometry tool is live so the
  // corner handles never sit flush in the physical screen corners (the OS eats
  // touches there).
  stageEl.classList.toggle("cropping", cropArmed);
  // Tuck the editor drawer away while a geometry tool is live so the photo gets
  // the full stage (portrait especially — the drawer otherwise eats the lower
  // half). Reuses the #app:has(#panel[hidden]) collapse. Restore only with a
  // photo open, so the defensive setGeoMode(null) calls on the start screen
  // don't bare an empty drawer.
  if (cropArmed) panel.hidden = true;
  else if (current) panel.hidden = false;
  // The lesson-chip rail floats over the photo's top edge and EATS the top
  // handles' taps when the crop box rides high (found by the aspect-preset
  // harness: a 1:1 box's top-left handle sat under a chip and never moved).
  // Same cure as the drawer: tuck the rail away while a geometry tool is
  // live, restore it exactly as it was on exit.
  {
    const rail = $("lessonChips") as HTMLDivElement;
    if (cropArmed) {
      if (!rail.hidden) { rail.dataset.geoHid = "1"; rail.hidden = true; }
    } else if (rail.dataset.geoHid) {
      delete rail.dataset.geoHid;
      rail.hidden = false;
    }
  }
  straightenSlider.value = String(params.straighten);
  straightenVal.textContent = `${params.straighten.toFixed(1)}°`;
  // The remembered aspect preset applies as the tool arms — unless the box
  // already matches it (e.g. re-arming a committed preset crop).
  if (cropArmed) {
    const rf = cropRatioFrac();
    if (rf && Math.abs(params.crop.w / params.crop.h - rf) / rf > 0.01) {
      params.crop = ratioInscribe(rf);
    }
    // Refresh the chips for THIS photo — the inverted-Original label names the
    // orientation it flips to (Portrait/Landscape), which the startup render
    // couldn't know. The photo can't rotate while armed (drawer is hidden),
    // so arm-time is the one moment the labels can go stale.
    updateRatioUI();
  }
  // The view must step back by the pill's REAL height (a fixed reserve buried
  // the bottom handles under the grown pill on portrait photos — IMG_1050).
  // Measure after layout; re-measure while armed if the window resizes.
  if (cropArmed) {
    requestAnimationFrame(() => {
      if (!cropArmed) return;
      stageEl.style.setProperty("--croptools-h", `${cropTools.offsetHeight}px`);
      positionCropOverlay(); // the canvas rect moved — re-lay the box on it
      draw();
    });
    window.addEventListener("resize", remeasureCropTools);
  } else {
    window.removeEventListener("resize", remeasureCropTools);
    stageEl.style.removeProperty("--croptools-h");
  }
  // Open box-first: zoom the view so the current crop box fills the frame (the
  // whole tilt is a pinch-out away). Reset to the whole photo when disarming.
  viewFreezeCenter = null;
  viewZoom = cropArmed ? boxFillZoom() : 1;
  positionCropOverlay();
  updateZoomCtl(); // crop hides the zoom control; exiting brings it back
  draw();
}
// Tapping a tool arms it; tapping the active tool again exits. "Done" in the
// pill is the primary exit (commits the pending change as one undo step).
cropBtn.addEventListener("click", () => setGeoMode(geoMode === "crop" ? null : "crop"));
straightenBtn.addEventListener("click", () => setGeoMode(geoMode === "straighten" ? null : "straighten"));
cropDone.addEventListener("click", () => { setGeoMode(null); flushRecord(); });

/** The photo's DRAWN rect inside #view (client coords). The canvas element is
 *  sized to the stage-shaped inset region and the photo is letterboxed inside it
 *  by object-fit:contain — so the crop [0,1] must map onto THIS sub-rect, not the
 *  element box, or the box drifts over the black bars. Bitmap dims are the full
 *  frame while armed, so canvas.width/height is the photo aspect. */
function viewImageRect(): { left: number; top: number; width: number; height: number } {
  const c = canvas.getBoundingClientRect();
  const imgAsp = canvas.width / Math.max(1, canvas.height);
  const boxAsp = c.width / Math.max(1, c.height);
  let w = c.width, h = c.height;
  if (imgAsp > boxAsp) h = c.width / imgAsp;
  else w = c.height * imgAsp;
  return { left: c.left + (c.width - w) / 2, top: c.top + (c.height - h) / 2, width: w, height: h };
}

/** Position the box overlay from params.crop, mapped onto the drawn photo rect
 *  (see viewImageRect). Shown in BOTH tools: Crop drags its corners to resize,
 *  Straighten drags them to rotate — either way the box frames the pending crop. */
const handleEls = Array.from(cropBox.querySelectorAll<HTMLDivElement>(".crop-handle"));

function positionCropOverlay() {
  const show = !!geoMode && !!current && welcome.hidden;
  cropOverlay.toggleAttribute("hidden", !show);
  // Reset enablement tracks the active tool: identity ⟺ straighten 0 AND crop full.
  cropResetBtn.disabled = cropIsIdentity(params.crop, params.straighten);
  if (!show) return;
  const stageRect = cropOverlay.getBoundingClientRect();
  const r = viewImageRect();
  // The canvas shows the fit-view (output [vc.x, vc.x+vc.w]); map the crop's
  // output [0,1] coords into that so the upright box sits on the tilted photo.
  const vc = fitViewCrop();
  const fx = (params.crop.x - vc.x) / vc.w, fy = (params.crop.y - vc.y) / vc.h;
  const fw = params.crop.w / vc.w, fh = params.crop.h / vc.h;
  cropBox.style.left = `${r.left - stageRect.left + fx * r.width}px`;
  cropBox.style.top = `${r.top - stageRect.top + fy * r.height}px`;
  cropBox.style.width = `${Math.max(1, fw * r.width)}px`;
  cropBox.style.height = `${Math.max(1, fh * r.height)}px`;
}

type CropDragKind = "move" | "tl" | "tr" | "bl" | "br";
let cropDrag:
  | { kind: CropDragKind; id: number; x0: number; y0: number; crop0: CropRect; rectW: number; rectH: number; vcW: number; vcH: number }
  | null = null;

function startCropDrag(kind: CropDragKind, e: PointerEvent, target: HTMLElement) {
  if (!geoMode || !current) return;
  // Only the crop tool resizes; in straighten every drag repositions (pan).
  const k: CropDragKind = geoMode === "crop" ? kind : "move";
  e.preventDefault();
  e.stopPropagation(); // a handle's pointerdown must not also start the box's own pan
  try { target.setPointerCapture(e.pointerId); } catch { /* capture can throw for synthetic pointers — the drag still works */ }
  // Resizing recentres the box; freeze the view centre for the drag so the
  // grabbed corner stays under the finger instead of sliding away with it.
  viewFreezeCenter = k === "move" ? null : { x: params.crop.x + params.crop.w / 2, y: params.crop.y + params.crop.h / 2 };
  const r = viewImageRect();
  const vc = fitViewCrop();
  cropDrag = {
    kind: k, id: e.pointerId, x0: e.clientX, y0: e.clientY, crop0: { ...params.crop },
    rectW: Math.max(1, r.width), rectH: Math.max(1, r.height), vcW: vc.w, vcH: vc.h,
  };
}

function moveCropDrag(e: PointerEvent) {
  if (!cropDrag || e.pointerId !== cropDrag.id) return;
  // Screen delta → crop-space delta (the canvas is zoomed out by the fit-view).
  const dx = ((e.clientX - cropDrag.x0) / cropDrag.rectW) * cropDrag.vcW;
  const dy = ((e.clientY - cropDrag.y0) / cropDrag.rectH) * cropDrag.vcH;
  const c0 = cropDrag.crop0;
  if (cropDrag.kind === "move") {
    // Reposition (pan): the box stays centred in the view, so dragging slides
    // the PHOTO under it — grab the photo and it follows the finger (the crop
    // moves the opposite way in source space). Clamped to stay on the photo.
    params.crop = clampCropOnPhoto({ x: c0.x - dx, y: c0.y - dy, w: c0.w, h: c0.h });
    positionCropOverlay();
    draw();
    return;
  }
  // Resize (crop tool): the opposite corner is the fixed anchor; the grabbed
  // corner moves to (mdx,mdy). MIN_CROP keeps a minimum box, then
  // clampResizeOnPhoto shrinks the grabbed corner along the drag line so EVERY
  // corner stays on the photo — at any angle and after a prior crop/pan. (In the
  // rare case where the box can't reach MIN_CROP without leaving a heavily tilted
  // corner, staying on the photo wins over the minimum size.)
  const oppX = c0.x + c0.w, oppY = c0.y + c0.h;
  let ax: number, ay: number, mdx: number, mdy: number;
  if (cropDrag.kind === "tl") {
    ax = oppX; ay = oppY;
    mdx = Math.min(c0.x + dx, oppX - MIN_CROP); mdy = Math.min(c0.y + dy, oppY - MIN_CROP);
  } else if (cropDrag.kind === "tr") {
    ax = c0.x; ay = oppY;
    mdx = Math.max(oppX + dx, c0.x + MIN_CROP); mdy = Math.min(c0.y + dy, oppY - MIN_CROP);
  } else if (cropDrag.kind === "bl") {
    ax = oppX; ay = c0.y;
    mdx = Math.min(c0.x + dx, oppX - MIN_CROP); mdy = Math.max(oppY + dy, c0.y + MIN_CROP);
  } else { // br
    ax = c0.x; ay = c0.y;
    mdx = Math.max(oppX + dx, c0.x + MIN_CROP); mdy = Math.max(oppY + dy, c0.y + MIN_CROP);
  }
  const rf = cropRatioFrac();
  if (rf) {
    // Preset locked: the axis the POINTER moved wins, the other follows the
    // ratio. It is the DRAG that decides, never the box's extents — comparing
    // extents (what this did before) always re-derived the box the drag
    // started from, because the axis you did not move is by construction
    // already exactly on the ratio, so it won every comparison. Measured with
    // a real mouse at 1:1 / 4:5 / 16:9: a straight horizontal or vertical
    // handle drag moved NOTHING (6 of 12 dead), and every diagonal followed
    // the smaller component — 90px across and 30px down resized by the 30.
    // dx is a fraction of the frame's WIDTH and dy of its HEIGHT, so dy is
    // scaled by rf to compare like with like.
    // clampResizeOnPhoto below slides the corner back along the anchor line,
    // which has the ratio's slope — so the clamp preserves the ratio too.
    const w0 = Math.abs(mdx - ax), h0 = Math.abs(mdy - ay);
    let w = Math.abs(dx) >= Math.abs(dy) * rf ? w0 : h0 * rf;
    w = Math.max(w, MIN_CROP, MIN_CROP * rf);
    const h = w / rf;
    mdx = ax + (mdx >= ax ? 1 : -1) * w;
    mdy = ay + (mdy >= ay ? 1 : -1) * h;
  }
  const [mx, my] = clampResizeOnPhoto(ax, ay, mdx, mdy);
  params.crop = { x: Math.min(ax, mx), y: Math.min(ay, my), w: Math.abs(mx - ax), h: Math.abs(my - ay) };
  positionCropOverlay();
  draw();
}

function endCropDrag() {
  if (!cropDrag) return;
  const wasResize = cropDrag.kind !== "move";
  cropDrag = null;
  if (wasResize) { viewFreezeCenter = null; positionCropOverlay(); draw(); } // re-centre the view on the resized box
  flushRecord(); // one drag = one undo step
}

for (const handle of handleEls) {
  const corner = handle.dataset.corner as CropDragKind;
  handle.addEventListener("pointerdown", (e) => startCropDrag(corner, e, handle));
  handle.addEventListener("pointermove", moveCropDrag);
  handle.addEventListener("pointerup", endCropDrag);
  handle.addEventListener("pointercancel", endCropDrag);
}
// The overlay captures pointers over the photo (the box is display-only,
// pointer-events:none; handles capture resize). ONE finger repositions the crop;
// TWO fingers pinch-zoom the VIEW (owner ask 2026-07-16) — box-fill in, whole
// tilt out — by driving viewZoom + re-rendering (not a CSS magnify; the crop
// view re-renders the GL scene). Preview-only: params.crop / export untouched.
const cropPointers = new Map<number, { x: number; y: number }>();
let cropPinch: { dist: number; zoom: number } | null = null;

cropOverlay.addEventListener("pointerdown", (e) => {
  if (!geoMode || !current) return;
  cropPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (cropPointers.size === 2) {
    // Second finger down — hand off from panning to pinch-zoom. Drop the pan
    // silently (it never committed an undo step; the crop hasn't changed yet).
    cropDrag = null;
    viewFreezeCenter = null;
    const [a, b] = [...cropPointers.values()];
    cropPinch = { dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: viewZoom };
    try { cropOverlay.setPointerCapture(e.pointerId); } catch { /* synthetic pointers can throw */ }
  } else if (cropPointers.size === 1) {
    startCropDrag("move", e, cropOverlay);
  }
});
cropOverlay.addEventListener("pointermove", (e) => {
  const p = cropPointers.get(e.pointerId);
  if (p) { p.x = e.clientX; p.y = e.clientY; }
  if (cropPinch && cropPointers.size >= 2) {
    const [a, b] = [...cropPointers.values()];
    const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
    // Zoom out no further than the whole tilt; in to box-fill (Crop keeps its
    // handles on-screen), a little past it in Straighten for precise leveling.
    const maxZoom = boxFillZoom() * (geoMode === "straighten" ? 2.5 : 1);
    viewZoom = clamp((cropPinch.zoom * dist) / cropPinch.dist, 1, maxZoom);
    positionCropOverlay();
    draw();
    return;
  }
  moveCropDrag(e);
});
function endCropPointer(e: PointerEvent) {
  cropPointers.delete(e.pointerId);
  if (cropPointers.size < 2) cropPinch = null;
  if (cropPointers.size === 0) endCropDrag();
}
cropOverlay.addEventListener("pointerup", endCropPointer);
cropOverlay.addEventListener("pointercancel", endCropPointer);

straightenSlider.addEventListener("input", () => {
  if (geoMode !== "straighten") return;
  params.straighten = Math.round(Number(straightenSlider.value) * 10) / 10;
  straightenVal.textContent = `${params.straighten.toFixed(1)}°`;
  // Re-fit the crop to the new angle (safe inscribed bound, keeps it on the
  // photo) — preserving the preset ratio when one is locked.
  {
    const rf = cropRatioFrac();
    params.crop = rf ? ratioInscribe(rf) : cropSafeBound();
  }
  // ...and re-fit the VIEW to that new box, or the framing goes stale as the
  // angle grows: the crop shrinks toward a small square while viewZoom stays at
  // its open-time value, so the whole tilt spills past the frame as an
  // overflowing diamond. Re-fitting to box-fill keeps the kept crop filling the
  // frame at every angle (the rest of the tilt sits behind it; pinch-out still
  // reaches the whole photo). Matches setGeoMode's box-first open.
  viewFreezeCenter = null;
  viewZoom = boxFillZoom();
  positionCropOverlay();
  draw();
});
straightenSlider.addEventListener("change", flushRecord); // one drag of the slider = one undo step

cropResetBtn.addEventListener("click", () => {
  if (!cropArmed) return;
  if (geoMode === "crop") {
    // Reset the box to the largest valid frame at the current angle (identity
    // when not straightened) — leaves any straighten alone. The full frame is
    // free-form, so the ratio chip resets to Free to stay honest.
    setCropRatio("free");
    params.crop = cropSafeBound();
  } else {
    // Straighten reset: back to level, crop returns to full.
    params.straighten = 0;
    params.crop = { ...CROP_DEFAULT };
    straightenSlider.value = "0";
    straightenVal.textContent = "0.0°";
  }
  positionCropOverlay();
  draw();
  flushRecord();
});

// --- Auto-sweep REVIEW: after "Find spots automatically" the fixes are
// ALREADY APPLIED — the rings are receipts to confirm, not a to-do list (the
// owner read the first version as "places someone still has to touch",
// 2026-07-14). So the sweep never arms heal mode; it shows solid rings + a ✓
// banner: tap a ring to put that one back, tap the banner to keep them. ---
let healReview = false;

function setHealReview(on: boolean) {
  healReview = on && !!current && (params.spots?.length ?? 0) > 0;
  healReviewBanner.hidden = !healReview;
  // Review owns the canvas like the other picture tools — all of them are
  // mutually exclusive, not just heal (review-mode field gap, 2026-07-15).
  if (healReview) { setHeal(false); setHslPick(false); setColorPick(false); setTat(false); }
  if (healReview) healReviewText.textContent = `${params.spots.length} spot${params.spots.length === 1 ? "" : "s"} healed`;
  positionHealOverlay();
}

/** Stand down every sustained picture tool and its banner. Called on every
 *  fresh open and on Home — an armed mode must never ride silently into a new
 *  photo (Lesson 1 teaches tap-WB) or float over the start screen. */
function disarmPictureTools() {
  setHslPick(false);
  setColorPick(false);
  setTat(false);
  setHeal(false);
  setHealReview(false);
  setGeoMode(null);
  endStickerLive(); // bake in any held sticker + drop the ghost, so it can't float over the start screen
}
healReviewBanner.addEventListener("click", () => setHealReview(false)); // keep them all

/** A tap while reviewing an auto sweep: inside a ring = put that fix back;
 *  anywhere else does nothing (never tap-WB mid-review — the banner is the
 *  exit). Returns true when review consumed the tap. */
function handleHealReviewTap(clientX: number, clientY: number): boolean {
  if (!healReview) return false;
  if (!(params.spots?.length)) { setHealReview(false); return false; } // undo emptied the sweep — review is over
  if (!current || !previewSrc) { setHealReview(false); return true; }
  const [u, v] = renderer.clientToImageUv(clientX, clientY);
  const W = previewSrc.width, H = previewSrc.height;
  for (let i = params.spots.length - 1; i >= 0; i--) {
    const s = params.spots[i];
    if (Math.hypot((u - s.x) * W, (v - s.y) * H) <= s.r * W) {
      params.spots.splice(i, 1);
      if (activeSpotIdx === i) activeSpotIdx = -1;
      else if (activeSpotIdx > i) activeSpotIdx--;
      healReviewText.textContent = `${params.spots.length} spot${params.spots.length === 1 ? "" : "s"} healed`;
      draw();
      flushRecord(); // each put-back is one undo step
      if (!params.spots.length) setHealReview(false);
      positionHealOverlay();
      return true;
    }
  }
  return true;
}

function updateHealUI() {
  const n = params.spots?.length ?? 0;
  healClearBtn.hidden = n === 0;
  healStatus.textContent = n
    ? `${n} spot${n === 1 ? "" : "s"} healed — they stay with this photo (not with saved looks or batch).`
    : "";
}

/** Ring markers over the healed spots while Heal mode is armed. The most
 *  recent (ACTIVE) spot draws accented — the Spot size slider drives it. A
 *  transient centre ring previews the tap size while the slider moves. */
function positionHealOverlay() {
  if (activeSpotIdx >= (params.spots?.length ?? 0)) activeSpotIdx = -1; // undo can shrink the list
  const preview = healPreviewUntil > Date.now();
  const show = (healArmed || healReview) && !!current && welcome.hidden && ((params.spots?.length ?? 0) > 0 || preview);
  healOverlay.toggleAttribute("hidden", !show);
  if (!show) {
    healOverlay.replaceChildren();
    return;
  }
  const rect = healOverlay.getBoundingClientRect();
  const kids: SVGElement[] = [];
  // Client-space radius: the distance to a point one radius away in image-x
  // (imageUvToClient soaks up rotation and zoom).
  const ring = (u: number, v: number, r: number, cls: string) => {
    const [cx, cy] = renderer.imageUvToClient(u, v);
    const [ex, ey] = renderer.imageUvToClient(u + r, v);
    const c = document.createElementNS(SVGNS, "circle");
    c.setAttribute("cx", String(cx - rect.left));
    c.setAttribute("cy", String(cy - rect.top));
    c.setAttribute("r", String(Math.max(4, Math.hypot(ex - cx, ey - cy))));
    c.setAttribute("class", cls);
    kids.push(c);
  };
  params.spots.forEach((s, i) => ring(s.x, s.y, s.r, healReview ? "heal-spot heal-done" : i === activeSpotIdx ? "heal-spot heal-active" : "heal-spot"));
  if (preview && activeSpotIdx < 0) {
    // Preview at the middle of what's on screen (zoom-aware), sized like the
    // next tap. Only when no spot is active — the active ring IS the preview.
    const c = canvas.getBoundingClientRect();
    const [u, v] = renderer.clientToImageUv(c.left + c.width / 2, c.top + c.height / 2);
    ring(u, v, clamp(Number(healSize.value), SPOT_R_MIN, SPOT_R_MAX), "heal-spot heal-preview");
  }
  healOverlay.replaceChildren(...kids);
}

/** Handle an armed heal tap. Returns true when it consumed the tap. */
function handleHealTap(clientX: number, clientY: number): boolean {
  if (!healArmed) return false;
  if (!current || !previewSrc) { setHeal(false); return true; }
  const [u, v] = renderer.clientToImageUv(clientX, clientY);
  if (u < 0 || u > 1 || v < 0 || v > 1) return true;
  const W = previewSrc.width, H = previewSrc.height;
  // A tap inside an existing spot removes that fix (newest first, so stacked
  // taps unwind naturally); anywhere else heals a new spot.
  for (let i = params.spots.length - 1; i >= 0; i--) {
    const s = params.spots[i];
    if (Math.hypot((u - s.x) * W, (v - s.y) * H) <= s.r * W) {
      // The ring vanishing + the count line updating are the feedback.
      params.spots.splice(i, 1);
      if (activeSpotIdx === i) activeSpotIdx = -1;
      else if (activeSpotIdx > i) activeSpotIdx--;
      draw();
      flushRecord();
      positionHealOverlay();
      return true;
    }
  }
  const r = clamp(Number(healSize.value), SPOT_R_MIN, SPOT_R_MAX);
  const src = findHealSource(lumaAccessor(previewSrc, W), W, H, Math.round(u * W - 0.5), Math.round(v * H - 0.5), r * W);
  if (!src) {
    healStatus.textContent = "No clean patch found near that spot — try a smaller spot size or zoom in.";
    return true;
  }
  params.spots.push({ x: u, y: v, r, dx: src.offX / W, dy: src.offY / H });
  activeSpotIdx = params.spots.length - 1; // the slider now resizes this one
  draw(); // the rAF pass bakes it into the texture
  flushRecord(); // one tap = one undo step
  positionHealOverlay();
  return true;
}

// Spot size slider: with a spot active it RESIZES that heal live (the source
// patch is re-picked for the new radius, the texture re-bakes on the next
// frame; recordSoon coalesces the whole drag into one undo step). With none,
// it shows the centre preview ring so the size reads before the first tap.
healSize.addEventListener("input", () => {
  if (!healArmed || !current || !previewSrc) return;
  const r = clamp(Number(healSize.value), SPOT_R_MIN, SPOT_R_MAX);
  const s = activeSpotIdx >= 0 ? params.spots[activeSpotIdx] : null;
  if (s) {
    const W = previewSrc.width, H = previewSrc.height;
    const src = findHealSource(lumaAccessor(previewSrc, W), W, H, Math.round(s.x * W - 0.5), Math.round(s.y * H - 0.5), r * W);
    if (src) { s.dx = src.offX / W; s.dy = src.offY / H; }
    s.r = r;
    draw();
  } else {
    healPreviewUntil = Date.now() + 1200;
    clearTimeout(healPreviewTimer);
    healPreviewTimer = window.setTimeout(positionHealOverlay, 1250); // fade it back out
  }
  positionHealOverlay();
});

healVisBtn.addEventListener("click", () => {
  renderer.spotVis = !renderer.spotVis;
  healVisBtn.setAttribute("aria-pressed", String(renderer.spotVis));
  draw();
});

healClearBtn.addEventListener("click", () => {
  if (!params.spots.length) return;
  params.spots = [];
  activeSpotIdx = -1;
  setHealReview(false);
  updateHealUI();
  positionHealOverlay();
  draw();
  flushRecord(); // clearing is one undo step
});

healAutoBtn.addEventListener("click", () => {
  if (!current || !previewSrc) return;
  const W = previewSrc.width, H = previewSrc.height;
  showBusy("Scanning for dust…");
  // Let the busy note paint before the (synchronous, sub-second) scan.
  setTimeout(() => {
    try {
      const luma = lumaAccessor(previewSrc!, W);
      const found = detectSpots(luma, W, H);
      let added = 0;
      for (const f of found) {
        const r = clamp(f.rPx / W, SPOT_R_MIN, SPOT_R_MAX);
        const u = (f.x + 0.5) / W, vv = (f.y + 0.5) / H;
        // Skip anything already healed (a re-run must not double up).
        if (params.spots.some((s) => Math.hypot((s.x - u) * W, (s.y - vv) * H) < (s.r + r) * W * 0.8)) continue;
        const srcOff = findHealSource(luma, W, H, Math.round(f.x), Math.round(f.y), r * W);
        if (!srcOff) continue;
        params.spots.push({ x: u, y: vv, r, dx: srcOff.offX / W, dy: srcOff.offY / H });
        added++;
      }
      // When spots were added the count line (updateHealUI) reports them; a
      // message here would be overwritten by it on the next repaint anyway.
      if (!added) healStatus.textContent = "No obvious dust found. Try Visualize spots, then tap anything you see.";
      if (added) {
        activeSpotIdx = -1; // finds are reviewed by ring, not slider-resized en masse
        healReviewText.textContent = `${added} spot${added === 1 ? "" : "s"} healed`;
        setHealReview(true); // fixes are DONE — rings + ✓ banner confirm them
        draw();
        flushRecord(); // the whole pass is one undo step
        positionHealOverlay();
      }
    } finally {
      hideBusy();
    }
  }, 30);
});

canvas.addEventListener("pointerdown", (e) => {
  if (cropArmed) return; // Crop & straighten owns the canvas — no tap-WB / pan / pinch while armed
  if (brushPaintOn()) { e.preventDefault(); startPaint(e); return; }
  if (tatArmed) { if (!tatDrag) { e.preventDefault(); startTat(e); } return; }
  if (stickerArmed) {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    stickerPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    // A second finger starts resize + spin on the selected sticker (whatever
    // the first finger was doing — drag or paint — stands down).
    if (stickerPointers.size === 2 && selSticker()) {
      stickerDrag = null;
      stickerPan = null;
      if (stkPainting) endStickerPaint();
      const [a, b] = [...stickerPointers.values()];
      const s = selSticker()!;
      stkPinch = {
        dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
        ang: Math.atan2(b.y - a.y, b.x - a.x),
        scale: s.scale,
        rot: s.rot,
      };
      beginStickerLive();
      return;
    }
    // First finger: paint (blend mode, on the sticker) else select + drag.
    if (stkBlendArmed && startStickerPaint(e)) return;
    const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
    const hit = hitSticker(u, v);
    if (hit >= 0) {
      selectedSticker = hit; updateStickerUI();
      const s = selSticker();
      if (s && !stkBlendArmed) {
        stickerDrag = { id: e.pointerId, ou: s.x - u, ov: s.y - v };
        beginStickerLive(); // ghost + hold it out of the bake for the drag
      }
      return;
    }
    // Empty canvas: pan the zoomed photo (so you can place a sticker off-centre)
    // rather than dead-owning the canvas. Only meaningful once zoomed in.
    if (!stkBlendArmed && zoom > 1) { stickerPan = { id: e.pointerId, x: e.clientX, y: e.clientY, panX, panY }; }
    return;
  }
  if (warpArmed) { e.preventDefault(); startWarpStroke(e); return; } // the Warp tab owns the canvas
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
  if (stickerArmed) {
    const sp = stickerPointers.get(e.pointerId);
    if (sp) { sp.x = e.clientX; sp.y = e.clientY; }
    if (stickerPan && e.pointerId === stickerPan.id) {
      panX = stickerPan.panX + (e.clientX - stickerPan.x);
      panY = stickerPan.panY + (e.clientY - stickerPan.y);
      applyZoom();
      return;
    }
    if (stkPinch && stickerPointers.size >= 2) {
      const s = selSticker();
      if (s) {
        const [a, b] = [...stickerPointers.values()];
        const dist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
        const ang = Math.atan2(b.y - a.y, b.x - a.x);
        s.scale = Math.min(1, Math.max(0.015, (stkPinch.scale * dist) / stkPinch.dist));
        let deg = stkPinch.rot + ((ang - stkPinch.ang) * 180) / Math.PI;
        deg = ((((deg + 180) % 360) + 360) % 360) - 180; // wrap to −180..180
        s.rot = Math.round(deg);
        if (s.shadow) s.linkTo = undefined; // pinched shadow detaches from its creature
        updateStickerUI(); // Size/Spin sliders follow the fingers live
        previewStickerTransform();
      }
      return;
    }
    if (stkPainting) { moveStickerPaint(e); return; }
  }
  if (stickerDrag && e.pointerId === stickerDrag.id) {
    const s = selSticker();
    if (s) {
      const [u, v] = renderer.clientToImageUv(e.clientX, e.clientY);
      s.x = Math.min(1, Math.max(0, u + stickerDrag.ou));
      s.y = Math.min(1, Math.max(0, v + stickerDrag.ov));
      if (s.shadow) s.linkTo = undefined; // dragged shadow detaches — it stays where you put it
      positionStickerOverlay();
      previewStickerTransform(); // ghost for creatures; live re-bake for a shadow (no ghostable flatten)
    }
    return;
  }
  if (warpStroke) { moveWarpStroke(e); return; }
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
  if (stickerArmed && stickerPointers.has(e.pointerId)) {
    stickerPointers.delete(e.pointerId);
    if (stickerPan && e.pointerId === stickerPan.id) { stickerPan = null; return; }
    if (stkPinch) {
      if (stickerPointers.size < 2) { stkPinch = null; endStickerLive(); flushRecord(); }
      return;
    }
    if (stkPainting) { endStickerPaint(); return; }
    if (stickerDrag && e.pointerId === stickerDrag.id) { stickerDrag = null; reMatchOnDrop(); endStickerLive(); flushRecord(); }
    return;
  }
  if (stickerDrag && e.pointerId === stickerDrag.id) { stickerDrag = null; reMatchOnDrop(); endStickerLive(); flushRecord(); return; }
  if (warpStroke && e.pointerId === warpStroke.id) { endWarpStroke(); return; }
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
const lessonChips = $("lessonChips") as HTMLDivElement;
// Learn mode: the practice-gallery photos open with the numbered lesson chips
// riding on the picture. Off for a normal open/session (chips stay out of the
// way there). Toggled by setLearnMode (defined with the gallery wiring below).
let learnMode = false;

// Navigation escape hatch. The old flows assumed the next action would always
// carry you where you needed to go — but after Resume (or any open) the only
// way off the photo was the session's Done, which ENDS it. Home returns to the
// start screen WITHOUT ending anything: the photo/session stays live in memory
// (and in storage), so the return button — or a reload's Resume — drops you
// right back. The start screen is also where the tutorials live, so Help's
// "Tutorials" button routes here too (see the helpTutorials wiring).
let lessonCardParked = false; // lesson card open when Home was pressed
function goHome() {
  captureActiveEdit(); // park any in-flight edit before leaving the photo
  // Armed picture tools (and their banners) must not float over the start
  // screen or keep eating taps around the card (field gap, 2026-07-15).
  disarmPictureTools();
  welcome.hidden = false;
  hint.hidden = !!current; // the tagline is for a cold start, not a return
  histWrap.hidden = true; // keep the histogram from floating over the card
  // The session strip sits above the welcome card (z-index) — hide it while the
  // start screen is up; returnToEditor()/an open flow bring it back.
  sessionStrip.hidden = true;
  stageEl.classList.remove("has-session");
  // Hide the lesson rail while the start screen is up (learnMode stays set, so
  // returnToEditor brings the rail — and the active lesson — right back).
  lessonChips.hidden = true;
  // The lesson card floats over the welcome card if left up (owner screenshot
  // 2026-07-14) — park it and let returnToEditor restore it.
  lessonCardParked = !lesson.hidden;
  lesson.hidden = true;
  stageEl.classList.remove("learn");
  locTipBtn.hidden = true; // don't float over the start screen; returnToEditor restores
  updateWelcomeReturn();
  updateSessionResume();
  renderMaskOverlay(); // hide the mask overlay while the card is up
  positionHealOverlay(); // and the heal rings
  positionCropOverlay(); // and the crop box
  updateZoomCtl(); // and the zoom control (welcome is up now)
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
  if (learnMode) {
    stageEl.classList.add("learn");
    lessonChips.hidden = false;
    if (lessonCardParked) lesson.hidden = false;
  }
  lessonCardParked = false;
  updateLocTip();
  renderMaskOverlay();
  positionHealOverlay();
  positionCropOverlay();
  updateZoomCtl(); // the photo's back in view — restore the zoom control
}

$("homeBtn").addEventListener("click", goHome);

// Scroll indicators for the narrow-screen action row: a fade + chevron on
// whichever edge has more buttons (the wrap's ::before/::after). Kept honest
// on scroll, resize, AND mode flips (the start screen hides most buttons,
// which changes scrollWidth without any scroll/resize event).
{
  const wrap = document.querySelector(".bar-actions-wrap") as HTMLElement;
  const acts = document.querySelector(".bar-actions") as HTMLElement;
  const update = () => {
    wrap.classList.toggle("scroll-left", acts.scrollLeft > 2);
    wrap.classList.toggle("scroll-right", acts.scrollLeft + acts.clientWidth < acts.scrollWidth - 2);
  };
  acts.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(acts);
  new MutationObserver(update).observe(welcome, { attributes: true, attributeFilter: ["hidden"] });
  update();
}
welcomeClose.addEventListener("click", returnToEditor);
welcomeBack.addEventListener("click", returnToEditor);

/** Show an already-decoded image: upload it, build its reference maps and set
 *  the view. Does NOT touch the edit — callers follow with either a fresh
 *  baseline (establishFreshEdit) or a restored one (restoreLiveEdit). Shared by
 *  the single-open path, the example loader and session photo-switching. */
function showDecoded(img: DecodedImage, imported: ImportedFile) {
  current = img;
  currentFile = imported;
  // Location guard: paths that build ImportedFile by hand (session restore's
  // stored bytes) haven't been scanned yet — scan here so the 🛰 tip is honest
  // on every open path. (Stored bytes stripped on their first open scan clean.)
  if (imported.hadLocation === undefined) guardLocation(imported);
  updateLocTip();
  // The canvas is the page's central image — name it for assistive tech
  // (role=img is set in the markup; the label tracks the open photo).
  canvas.setAttribute("aria-label", `Photo: ${imported.name}`);
  // Every open path lands here — assume the user's own photo (no watermark);
  // openGalleryPhoto flips this right after for the bundled practice files.
  setBundledSource(false);
  // A fresh photo never inherits an armed picture tool or a stale heal
  // selection from the previous one (mode-leak field gap, 2026-07-15).
  disarmPictureTools();
  activeSpotIdx = -1;
  // Corrects img.pixels in place (if a profile applies) before anything below
  // reads them — the GPU texture upload, and the glow/local reference maps.
  // (initHotspot uploads its own texture when it corrects; this call is the
  // only one for RAW / unavailable-profile photos, and a harmless repeat
  // upload otherwise.)
  const __a = performance.now();
  initHotspot(img, imported);
  const __b = performance.now();
  uploadPreview();
  const __c = performance.now();
  renderer.setRotation(img.rotate ?? 0);
  renderer.setFlip(0); // flip is view state like rotation — a new photo opens unmirrored
  resetZoom();
  const __d = performance.now();
  renderer.setGlowMap(buildGlowMap((x, y) => linearAt(img, x, y), img.width, img.height));
  const __e = performance.now();
  renderer.setLocalMap(buildLocalMap((x, y) => linearAt(img, x, y), img.width, img.height));
  const __f = performance.now();
  ((window as unknown as Record<string, unknown>).__show ??= []) as number[];
  ((window as unknown as Record<string, unknown>).__show as unknown[]).push({ hotspot: __b - __a, upload: __c - __b, zoom: __d - __c, glow: __e - __d, local: __f - __e, px: img.width * img.height });
  panel.hidden = false;
  welcome.hidden = true;
  lesson.hidden = true;
  lessonShow.hidden = true;
  // Any plain open/session-switch leaves learn mode; the gallery path turns it
  // back on after establishing the photo (see openGalleryPhoto).
  setLearnMode(false);
  updateHistVisibility();
  updateZoomCtl(); // a photo is open (welcome now hidden) — show the zoom control
  // Honesty gate: a third-party raw (CR2/ARW/…) opens via its embedded JPEG
  // preview — the user must know they are NOT editing raw data. The editor is
  // up (welcome hidden), so an alert is the only surface that reaches them.
  if (img.previewNotice) noticeDialog("Preview only", img.previewNotice);
}

/** Reset the live edit to this photo's opening baseline, clear masks and undo
 *  history, and record the baseline as the Reset target. Assumes `current` is
 *  the freshly-decoded image.
 *
 *  The baseline is an automatic, VISIBLE, undoable set of edit parameters,
 *  applied PER FILE TYPE (owner ruling 2026-07-25, second revision — the
 *  earlier blanket "nothing at open" was a stabilization measure, not the
 *  product): RAW sensor data (NEF, mosaiced or linear DNG) gets the full
 *  balance — gray-world WB, auto exposure, measured denoise, and (camera-
 *  native raw only) highlight recovery when the frame actually has clipping,
 *  the same default rendering Lightroom-class raw apps ship. Camera-rendered
 *  photos (JPEG / HEIC / PNG / third-party-raw previews) are already
 *  balanced by the camera, so they open as rendered with only measured
 *  denoise — the LIGHTER TOUCH. Pixel data is never mutated; every value
 *  lands on a slider, and the true untouched state is one press away
 *  (Hold: Untouched) or reachable by zeroing the sliders. */
function establishFreshEdit() {
  const src = current!;
  if (src.isRaw) {
    params.wb = grayWorldWB(src);
    params.exposure = autoExposure(src, params.wb);
    params.recover = src.camMatrix ? autoRecover(src) : 0;
  } else {
    params.wb = [1, 1, 1];
    params.exposure = 1;
    params.recover = 0;
  }
  params.denoise = estimateDenoise(src);
  lookBias = [1, 1, 1];
  // NORMALISE THE MEASUREMENTS TO WHAT THE SLIDERS CAN HOLD, BEFORE ANYTHING
  // SOLVES AGAINST THEM. The four values above are measured at full precision;
  // every slider has a step, so `syncToUI` writes 0.44014856293231525 into a
  // control that snaps it to 0.44, and the `syncFromUI` further down — which is
  // there on purpose, so the Reset baseline is exactly what the reader sees —
  // writes the snapped number back over the measurement.
  //
  // That left the lift solving against the measurement and the Restore depth
  // TOGGLE, pressed later, solving against the rounding. Measured: white
  // balance 0.6162576380649035 against 0.6170426151579793, exposure 7.5257853
  // against 7.5357102, denoise 0.44014856293231525 against 0.44 — enough to
  // move a solved foliage boost from 1.65 to 1.71, so pressing the toggle off
  // and on did not return the photo to how it opened. Rounding first makes the
  // two solves identical by construction rather than by coincidence.
  //
  // It is the same fault `removeLift` carries a note about, one layer up: a
  // full-precision value written to a stepped control does not come back.
  syncToUI();
  syncFromUI();
  // Part of the opened baseline, so it runs BEFORE origParams and the Reset
  // snapshot below are taken: Hold: Original and Reset both mean "the photo as
  // it opened", and this is now part of how it opened. Visible on the Tone and
  // Sky/Foliage sliders, undoable, no pixels touched — the three tests any
  // at-open automatic has to pass.
  liftApplied = null;
  // A LOOK CARRIES, OR IT DOES NOT — and half of one is what this was.
  // The look's GRADE carried to the next photo (saturation, contrast, the
  // channel swap) while `activeLook` was cleared further down the same open, so
  // the frame wore Aerochrome and the app reported nothing selected. That is
  // not a preference between two behaviours; it is the button and the pixels
  // disagreeing, and one of them was wrong.
  //
  // Relabelling the button would not have been enough either: a look's WHITE
  // BALANCE bias is not carried — `lookBias` is reset just above, and this
  // photo's balance was measured fresh — so a carried "Red" would have been a
  // name over a grade missing the bias that defines it. Re-applying the look is
  // what makes every part of it true of this photo at once: the bias, the
  // grade, and the colour half of the lift, which applyLook re-solves itself.
  //
  // Which is also the honest version of the fix tried before it. That one keyed
  // the lift's colour half off `params.swapRB`, reasoning that the swap is what
  // puts materials into the sky and foliage bands. The swap DEFAULTS ON here,
  // so every bare frame "wore a look" and both bands went to their 2.0 ceiling
  // on a first open — solveLift's own comment records that failure, 44 of 44
  // practice frames. `activeLook` is non-null only where a look was pressed.
  if (activeLook && LOOKS[activeLook]) applyLook(activeLook as keyof typeof LOOKS);
  else if (autoLift) applyLift(false);
  syncToUI();
  // Snapshot the as-imported baseline for press-and-hold comparison.
  origParams = {
    wb: [...params.wb] as [number, number, number],
    exposure: params.exposure,
    denoise: params.denoise,
    recover: params.recover ?? 0,
    swapRB: false,
    hue: 0,
    sat: 1,
    contrast: 1,
    tint: [1, 1, 1],
    glow: 0,
    sky: [...params.sky] as [number, number, number],
    foliage: [...params.foliage] as [number, number, number],
    tone: [...params.tone] as typeof params.tone,
    toneR: [...TONE_DEFAULT],
    toneG: [...TONE_DEFAULT],
    toneB: [...TONE_DEFAULT],
    lum: 1,
    masks: [],
    hotspot: 0,
    hotspotSize: 0.5,
    vignette: 0,
    clarity: 0,
    dehaze: 0,
    sharpen: 0,
    texture: 0,
    hsl: hslDefault(),
    bwOn: false,
    bwMix: [1, 1, 1],
    grade: [...GRADE_DEFAULT],
    grainAmt: 0,
    grainSize: 1.5,
    vigAmt: 0,
    vigMid: 0.5,
    mix3: [...MIX3_DEFAULT],
    spots: [],
    stickers: [],
    crop: { ...CROP_DEFAULT },
    straighten: 0,
  };
  // `activeLook` is NOT cleared here. It sat in a block that resets
  // composition-specific state — masks, spots, crop — but a look is creative
  // state, and the rest of the creative grade carries across an open by design.
  // Clearing only its name is what let the button and the pixels disagree.
  updateLookUI();
  // Tidy the panel for the new photo: scroll the current section to the top.
  panelBody.scrollTop = 0;
  // Masks, heal spots and crop/straighten are composition-specific — never
  // carry them to a new photo. (Session switches restore each photo's own via
  // its saved snapshot.) The imported LUT is NOT reset here on purpose: it is
  // creative grade, exactly like sat/hue/tone, and persists across opens.
  params.masks = [];
  selectedMask = -1;
  setColorPick(false);
  params.spots = [];
  params.stickers = [];
  params.warp = null;
  activeSpotIdx = -1;
  setHeal(false);
  params.crop = { ...CROP_DEFAULT };
  params.straighten = 0;
  setGeoMode(null);
  setHealReview(false);
  renderer.spotVis = false;
  healVisBtn.setAttribute("aria-pressed", "false");
  updateHealUI();
  updateMaskUI();
  renderMaskOverlay();
  syncFromUI();
  // Fresh photo: snapshot the automatic baseline (the Reset target) and start
  // a clean undo history. Do this AFTER syncFromUI so the baseline is exactly
  // what the user first sees.
  baseline = snapshot();
  captureSliderDefaults();
  settled = snapshot();
  undoStack.length = 0;
  redoStack.length = 0;
  clearTimeout(recordTimer);
  recordTimer = 0;
  updateEditButtons();
  updateSlotUI();
  requestAnimationFrame(updateScrollCues);
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

// --- The conventions a reader brings with them ----------------------------
// Everything the platform gives for free was already right here: every dialog
// is opened with showModal(), so Escape closes it, focus is trapped and returns
// on close, and the background goes inert. What needed hand-wiring had not been
// wired, and a reader does not experience that as "an unimplemented feature" —
// they experience it as the app not working.

/** Text entry owns its own undo stack and its own clipboard; a range slider,
 *  a checkbox or a button does not. Bailing on every INPUT would have meant
 *  Cmd+Z failing in the commonest case there is: nudge a slider, change your
 *  mind. */
const TEXT_ENTRY = new Set(["text", "search", "url", "email", "tel", "password", "number"]);
function isTextEntry(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  if (t.isContentEditable) return true;
  if (t.tagName === "TEXTAREA") return true;
  if (t.tagName === "INPUT") return TEXT_ENTRY.has(((t as HTMLInputElement).type || "text").toLowerCase());
  return false;
}

// Undo/redo from the keyboard. Cmd+Z / Ctrl+Z, and both spellings of redo —
// Cmd+Shift+Z is the Mac and Ctrl+Y the Windows one, and a reader arrives with
// whichever their other editors taught them.
document.addEventListener("keydown", (e) => {
  if (!e.metaKey && !e.ctrlKey) return;
  const k = e.key.toLowerCase();
  const wantsUndo = k === "z" && !e.shiftKey;
  const wantsRedo = (k === "z" && e.shiftKey) || k === "y";
  if (!wantsUndo && !wantsRedo) return;
  if (isTextEntry(e.target)) return;
  if (document.querySelector("dialog[open]")) return; // an open sheet owns the keyboard
  if (!current) return;
  e.preventDefault();
  if (wantsUndo) { if (!undoBtn.disabled) undo(); }
  else if (!redoBtn.disabled) redo();
});

/** The picker's own accept list, applied to files that arrive by other routes.
 *  A drop and a paste have to be as fussy as the picker or they hand the decoder
 *  something it will fail on later, further from the thing the reader did. */
const OPENABLE_EXT = /\.(dng|nef|zip|ipslook)$/i;
function openableFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith("image/") || OPENABLE_EXT.test(f.name));
}

async function openFromOutside(files: File[]) {
  if (!files.length) return;
  try {
    await openPicked(files);
  } catch (err) {
    welcome.hidden = false;
    hint.hidden = false;
    hint.textContent = "Could not open this file: " + (err as Error).message;
    updateWelcomeReturn();
  }
}

// Drag a photo onto the window. dragenter/dragover MUST preventDefault or the
// browser navigates to the file instead, replacing the app — which is the
// behaviour anyone dropping a raw on this page got until now.
let dragDepth = 0; // dragenter/leave fire per element; count them or the hint flickers
let dragFromInside = false; // a drag that STARTED in this page is not a file arriving

/** THE OFFER MUST ALWAYS BE ESCAPABLE. The first version could not be dismissed:
 *  dragging a photo out of the strip with a mouse starts a NATIVE drag of the
 *  tile's own <img>, and there was no dragend listener, so nothing ever took
 *  the full-screen scrim back down. Three things were wrong and each alone
 *  could strand it — the strip's tiles were draggable at all, an in-page drag
 *  was treated like a file arriving, and only dragleave/drop could clear it.
 *  Every path out is wired now, including window blur, because a drag that
 *  leaves the window can end somewhere this page never hears about. */
function showDrop(on: boolean) { document.body.classList.toggle("dropping", on); }
function endDrop() { dragDepth = 0; dragFromInside = false; showDrop(false); }
const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes("Files");

document.addEventListener("dragstart", () => { dragFromInside = true; });
window.addEventListener("dragend", endDrop);
window.addEventListener("blur", endDrop);
window.addEventListener("dragenter", (e) => {
  if (dragFromInside || !carriesFiles(e)) return;
  e.preventDefault();
  if (++dragDepth === 1) showDrop(true);
});
window.addEventListener("dragover", (e) => {
  if (dragFromInside || !carriesFiles(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
// Guarded like the others: an unguarded dragleave decremented on drags that had
// never incremented, so the count and the scrim could disagree.
window.addEventListener("dragleave", (e) => {
  if (dragFromInside || !carriesFiles(e)) return;
  if (--dragDepth <= 0) endDrop();
});
window.addEventListener("drop", (e) => {
  const wasInside = dragFromInside;
  endDrop(); // whatever it was, the offer comes down
  if (wasInside || !carriesFiles(e)) return;
  e.preventDefault();
  const files = openableFiles(e.dataTransfer?.files);
  if (!files.length) { toast("That is not a photo this app can open.", 2600); return; }
  void openFromOutside(files);
});

// Paste a photo. Same rule as the drop, and silent when the clipboard holds
// text — a paste that says "not a photo" every time you copy a URL is worse
// than one that says nothing.
document.addEventListener("paste", (e) => {
  if (isTextEntry(e.target)) return;
  const files = openableFiles((e as ClipboardEvent).clipboardData?.files);
  if (!files.length) return;
  e.preventDefault();
  void openFromOutside(files);
});

// Back closes the sheet rather than leaving the app. On a home-screen install
// there is no browser chrome, so Back is a system gesture and losing the whole
// app to it is not a small thing.
//
// The two flags are the whole difficulty: closing a dialog has to consume the
// history entry it pushed, and consuming it fires popstate, which would then
// try to close another dialog. Each flag marks "this next event is mine".
let dlgDepth = 0;
let closingFromHistory = false;
let backIsOurs = false;
// The spinner is a <dialog> too, and showModal()s on every open — but nobody
// NAVIGATED to it, it is not something Back should dismiss (dismissing it would
// not stop the work), and pushing an entry every time a photo loads fills the
// history with churn. A surface earns a history entry by being one the reader
// chose to open.
const NO_HISTORY = new Set(["busy"]);
for (const d of Array.from(document.querySelectorAll("dialog")).filter((x) => !NO_HISTORY.has(x.id))) {
  new MutationObserver(() => {
    if ((d as HTMLDialogElement).open) {
      dlgDepth++;
      history.pushState({ ipsDialog: dlgDepth }, "");
    } else if (dlgDepth > 0 && !closingFromHistory) {
      dlgDepth--;
      backIsOurs = true;
      history.back();
    }
  }).observe(d, { attributes: true, attributeFilter: ["open"] });
}
window.addEventListener("popstate", () => {
  if (backIsOurs) { backIsOurs = false; return; } // our own consuming back()
  const open = Array.from(document.querySelectorAll("dialog[open]")) as HTMLDialogElement[];
  if (!open.length) return;
  if (dlgDepth > 0) dlgDepth--;
  closingFromHistory = true;
  open[open.length - 1].close(); // topmost is the one on screen
  closingFromHistory = false;
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
  /** Which picture the tile is showing. "waiting" — the file has not been read
   *  yet, so there is nothing but a name. "preview" — the camera's own embedded
   *  JPEG, which for an infrared frame is a magenta smear but answers "which
   *  photo is this" instantly and for free. "real" — rendered through this
   *  app's own pipeline, so it matches what tapping it opens into. */
  thumbState: "waiting" | "preview" | "real";
  /** WHICH GRADE the tile was rendered under. A thumbnail is a claim about what
   *  tapping it opens into, and the grade carries across the whole session — so
   *  changing the look after a set is open made every tile a stale claim, and
   *  `realThumbnails` would not touch them because it only ever looked for
   *  tiles that were not "real" YET. Measured: with Aerochrome on, the photo
   *  rendered a colour cast of 1.18/0.90/0.92 and every tile 1.02/0.98/0.99 —
   *  near-neutral, the look nowhere on them. */
  thumbGrade?: string;
}

/** The live, in-memory edit for one photo — kept so switching back within a
 *  session restores its FULL state (masks included) and undo history. Lost on
 *  reload; the durable copy (Session.setEdit, masks stripped) survives. */
interface LiveEdit {
  snapshot: Snapshot;
  baseline: Snapshot;
  settled: Snapshot;
  undo: Snapshot[];
  redo: Snapshot[];
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
const stripHere = $("stripHere") as HTMLButtonElement;
const sessionProgress = $("sessionProgress") as HTMLDivElement;
const sessionProgressBar = $("sessionProgressBar") as HTMLDivElement;

// While a set is being opened the strip must stay up and SAY SO. Before this,
// the meta line was written once per file and then overwritten by
// updateSessionStrip's summary at the end of the same iteration, and the strip
// itself was hidden again until two photos existed — so opening forty photos
// showed the untouched welcome screen for the first two decodes and a
// flickering strip after that. `adding` makes the progress the strip's subject
// for as long as it lasts.
let adding: { done: number; total: number; index: number; name: string } | null = null;
// Photos whose bytes are still being written to storage. They are in the strip
// and on screen already — measured, the strict-durability commit is ~70% of the
// time it takes to open a set, and it does not have to be waited on before the
// photo can be looked at. Until it lands the tile is not switchable: without
// the bytes on disk, switching to it has nothing to decode from.
const pendingStore = new Set<string>();

/** Export sizes span 300 KB to 60 MB, so unlike the session's fmtSize (whole
 *  megabytes, for a set's rough footprint) this keeps one decimal and drops to
 *  KB below a megabyte — a 640 KB export must not read as "1 MB". */
function fmtExportSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fmtSize(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / 1024 / 1024))} MB`;
}

/** Session-mode edits (WB / exposure / grade …) persist per photo; masks are
 *  spatial/composition-specific, so — like a fresh open — they're dropped from
 *  the durable copy and reset on reload. */
function editToJson(): string {
  const s = snapshot();
  // Masks (bitmaps) and the imported LUT (Float32Array lattice) are runtime
  // data — stripped here; a durable resume restores neither (Help says so).
  return JSON.stringify({ params: { ...s.params, masks: [], lut: null, warp: null }, activeLook: s.activeLook, lookBias: s.lookBias });
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
    redo: [...redoStack],
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
  redoStack.length = 0;
  redoStack.push(...(st.redo ?? []));
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
    const img = await decodeOffThread(imported);
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
  // Render the thumb through the REAL pipeline with the photo's own auto
  // baseline PLUS the live creative state (swap/looks/grade persist across
  // opens), so a thumbnail matches what tapping it will show — a bare
  // WB+matrix render diverged the moment a look was active (owner-caught,
  // IMG_1256: yellow/blue thumb vs the teal/orange it opened into).
  // Spatial/per-image extras (masks, glow, clarity, LUT, grain) are cleared —
  // they need maps or textures a thumb doesn't have.
  // THE LOOK'S WB BIAS HAS TO COME WITH IT. applyLook bakes the bias INTO
  // params.wb (dividing the previous one out), and this line replaced params.wb
  // wholesale with the photo's own gray-world balance — so the bias was dropped
  // and every look's tiles shared one neutral white balance.
  //
  // That is invisible for some looks and total for others. aero, goldie and red
  // have IDENTICAL swapRB and hue; they differ almost only by wbBias. Strip the
  // bias and all three render as Aerochrome, whichever one is selected, while
  // mono/sepia/natural still change because their difference is swap, sat or
  // tint. Same multiply batchParamsFor already does for a built-in look.
  const gw = grayWorldWB(img);
  const wb: [number, number, number] = [
    clamp(gw[0] * lookBias[0], 0.02, 16),
    clamp(gw[1] * lookBias[1], 0.02, 16),
    clamp(gw[2] * lookBias[2], 0.02, 16),
  ];
  const p: EditParams = {
    ...cloneParams(params),
    wb,
    exposure: autoExposure(img, wb),
    denoise: 0,
    recover: img.camMatrix ? autoRecover(img) : 0,
    masks: [],
    spots: [],
    glow: 0,
    clarity: 0,
    dehaze: 0,
    sharpen: 0,
    texture: 0,
    grainAmt: 0,
    vigAmt: 0,
    lut: null,
    crop: { ...CROP_DEFAULT },
    straighten: 0,
    // Solved for THIS photo, not inherited from whichever one happens to be
    // open. Tone, sky and foliage stopped being a shared creative choice the
    // moment Restore depth started writing them per frame — so cloning the live
    // params handed every tile another frame's correction, and tapping it
    // re-solved and showed something different. That is exactly the defect the
    // thumbnails were fixed for once before (a thumb must match its open).
    tone: [...TONE_DEFAULT],
    sky: [0, 1, 1],
    foliage: [0, 1, 1],
  };
  if (autoLift) {
    const solved = solveLift(activeLook !== null, img, p);
    const lift = solved && scaleLift(solved, liftAmount);
    if (lift) { p.tone = lift.tone as typeof p.tone; p.sky = lift.sky as typeof p.sky; p.foliage = lift.foliage as typeof p.foliage; }
  }
  // THE PHOTO'S DISPLAY ROTATION, which this never applied. `img.rotate` is the
  // EXIF Orientation tag as 90-degree CW steps, and the main view has always
  // honoured it — so a frame shot in portrait opened upright and its THUMBNAIL
  // lay on its side, in the strip and in the Quick look grid alike, both of
  // which are built from here. Nineteen of the forty-four practice files carry
  // Orientation 8, so it was not a corner case; measured before this, a
  // portrait frame's tile came out 512x341 while the photo itself opened
  // 932x1400.
  //
  // Applied by mapping DESTINATION pixels back to source, so there is still one
  // pass and no second buffer. The aspect handed to compileEdit stays the
  // SOURCE aspect: the edit is computed in the photo's own space, and only the
  // laying-out of the result turns.
  const rot = ((((img.rotate ?? 0) % 4) + 4) % 4) as 0 | 1 | 2 | 3;
  const turned = rot === 1 || rot === 3;
  const ow = turned ? h : w;
  const oh = turned ? w : h;
  const edit = compileEdit(p, img.camMatrix, w / h);
  const px = new Float32Array(3);
  const out = new Uint8ClampedArray(ow * oh * 4);
  for (let oy = 0; oy < oh; oy++) {
    for (let ox = 0; ox < ow; ox++) {
      // (x, y) in the un-turned thumbnail grid that lands at (ox, oy).
      const x = rot === 0 ? ox : rot === 1 ? oy : rot === 2 ? w - 1 - ox : w - 1 - oy;
      const y = rot === 0 ? oy : rot === 1 ? h - 1 - ox : rot === 2 ? h - 1 - oy : ox;
      const sx = Math.min(img.width - 1, Math.floor(x / s));
      const sy = Math.min(img.height - 1, Math.floor(y / s));
      const [r, g, b] = linearAt(img, sx, sy);
      edit(r, g, b, px, 0, undefined, undefined);
      const i = (oy * ow + ox) * 4;
      out[i] = Math.round(255 * clamp(px[0], 0, 1));
      out[i + 1] = Math.round(255 * clamp(px[1], 0, 1));
      out[i + 2] = Math.round(255 * clamp(px[2], 0, 1));
      out[i + 3] = 255;
    }
  }
  const cv = document.createElement("canvas");
  cv.width = ow; cv.height = oh;
  cv.getContext("2d")!.putImageData(new ImageData(out, ow, oh), 0, 0);
  const blob: Blob = await new Promise((res) => cv.toBlob((b) => res(b!), "image/jpeg", 0.72));
  return blob.arrayBuffer();
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** The camera's own embedded JPEG preview, lifted straight out of a raw file's
 *  TIFF directory — a header walk and a slice, no decode, no re-encode. Every
 *  NEF and DNG carries one, and it is already JPEG bytes, so it goes straight
 *  into an object URL.
 *
 *  It is NOT the strip's final answer. A camera preview of an infrared frame is
 *  a magenta smear and does not match what opening the photo shows, which is a
 *  defect that was found and fixed once already (thumbnails rendering a
 *  different colour world from their opens). So this is provisional and
 *  marked as such, and the real pipeline-rendered thumbnail replaces it. What
 *  it buys is the composition, instantly, which is what a strip is for. */
function embeddedPreview(bytes: Uint8Array, kind: ImageKind): Uint8Array | null {
  if (kind !== "dng" && kind !== "nef" && kind !== "tiff") return null;
  try {
    return pickLargestPreview(bytes, new Tiff(bytes).allIfds()) ?? null;
  } catch {
    return null; // a preview is a bonus; never let its absence fail an open
  }
}

/** A cheap head-sniff: is this picked file a shared look (.ipslook JSON)?
 *  Reads only the first bytes; anything big is not a look. */
async function isLookFile(f: File): Promise<boolean> {
  if (f.size === 0 || f.size > 64 * 1024) return false;
  const head = new Uint8Array(await f.slice(0, 32).arrayBuffer());
  return sniffLook(head);
}

/** Route the text of a shared look (from a file, link, or pasted code) into
 *  the receive dialog — or explain, honestly, why it couldn't be read. */
function receiveLookText(text: string, sourceHint: string) {
  const p = parseLookText(text);
  if (p) openLookReceive(p);
  else toast(`That ${sourceHint} couldn't be read — it may be damaged or cut short.`, 3200);
}

/** The picker hands files over in TAP ORDER, which is arbitrary — so every path
 *  that takes a picked set sorts here, numeric-aware, and none of them sorts on
 *  its own. Quick look had this from the start and the session path did not, so
 *  a set opened for editing carried whatever order iOS happened to return; and
 *  because the strip's `order` is assigned in add sequence and Resume sorts by
 *  it, the wrong order was persisted and faithfully restored. Same-shot pairs
 *  (DSC_1709.dng / DSC_1709 2.NEF) sit next to each other under this comparison.
 *  ONE function, so the two callers cannot drift apart again. */
function inShutterOrder(files: File[]): File[] {
  return [...files].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" }));
}

/** Open a freshly-picked set. One file → ephemeral single open (unchanged).
 *  Two or more → a persisted session with the switch strip.
 *  Shared-look files (.ipslook) are peeled off FIRST: a look is not a photo —
 *  it must never destroy, join, or be counted against a photo session. */
async function openPicked(files: File[], ready?: Map<File, ArrayBuffer>) {
  files = inShutterOrder(files);
  const parts = await Promise.all(files.map(async (f) => ({ f, isLook: await isLookFile(f).catch(() => false) })));
  const lookFiles = parts.filter((p) => p.isLook).map((p) => p.f);
  files = parts.filter((p) => !p.isLook).map((p) => p.f);
  if (lookFiles.length) {
    // One receive dialog at a time; extra look files are announced honestly.
    receiveLookText(await lookFiles[0].text(), "look file");
    if (lookFiles.length > 1) toast(`Opened 1 of ${lookFiles.length} look files — import the others one at a time.`, 3200);
    if (!files.length) return;
  }
  let append = false;
  if (sessionPhotos.length >= 2) {
    const ans = await askDialog(
      `A session of ${sessionPhotos.length} photos is open`,
      files.length === 1
        ? "Add this photo to the session, or start a new one? Starting new closes the current session and frees its storage."
        : `Add these ${files.length} photos to the session, or start a new one? Starting new closes the current session and frees its storage.`,
      "Add to this session",
      "Start a new session",
    );
    if (ans === "dismiss") return; // Escape — change nothing (an exit confirm() never offered)
    append = ans === "ok";
  }

  // Single file, not adding to a session → the fast, ephemeral path of old.
  if (files.length === 1 && !append) {
    await resetSessionState(true); // drop a lone photo or un-resumed leftovers
    hint.textContent = "Loading…";
    hint.hidden = false;
    // A 20-megapixel RAW takes seconds to decode; the welcome screen looked
    // untouched for all of them. The spinner names the file so it is obvious
    // WHICH photo is being read, not just that something is.
    showBusy(`Opening ${files[0].name}…`);
    try {
      return await openSingle(files[0]);
    } finally {
      hideBusy();
    }
  }

  await addToSession(files, append, ready);
}

/** The lone-photo open: ephemeral, not persisted (there is nothing to resume
 *  from a single edit). Split out of openPicked so the spinner around it has
 *  one exit rather than five. */
async function openSingle(file: File) {
  const imported = guardLocation(await importFile(file));
  if (imported.looksTranscoded) {
    hideBusy(); // the explanation must not land behind a spinner
    const msg =
      "That file arrived as a flattened JPEG (iOS transcoded it). For true RAW, " +
      "import from Files — or zip the DNG first — rather than the Photo Library.";
    hint.textContent = msg;
    // The hint lives on the start screen — invisible if the editor is up.
    // The explanation must reach the user either way (honest failures).
    if (welcome.hidden) alert(msg);
    return;
  }
  // Track it as a (strip-less) lone photo so a follow-up multi-pick can ask
  // sensibly; it isn't persisted (nothing to resume from a single edit).
  const img = await decodeOffThread(imported);
  showDecoded(img, imported);
  hideBusy(); // there is a photo on screen now — nothing left to wait for
  const id = "lone";
  sessionPhotos = [{ id, name: imported.name, kind: imported.kind, size: imported.bytes.length, edit: null, thumbUrl: "", thumbState: "real" }];
  nextOrder = 0;
  liveEdits.clear();
  activateCurrent(id);
  updateSessionStrip();
  // A JPEG exported by this app can carry its own look (the traveling
  // recipe, lookmark.ts) — offer it through the same receive dialog as
  // links/files/codes. The photo is already open, so Try lands on it.
  if (imported.kind === "jpeg") {
    const json = extractLookFromJpeg(imported.bytes);
    const p = json ? parseLookPayload(json) : null;
    if (p) openLookReceive({ look: p.look, name: p.name ?? `From ${imported.name}` });
  }
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
  pendingStore.clear();
  if (clearStorage) await Session.clearSession().catch(() => {});
}

/** Persist and append a set of files to the current session, showing the first
 *  new photo as soon as it's ready. Decoding is sequential with yields so the
 *  UI stays usable; only one decode is in RAM at a time. */
async function addToSession(files: File[], append: boolean, ready?: Map<File, ArrayBuffer>) {
  if (!append) await resetSessionState(true); // fresh session — clear leftovers
  const skipped: string[] = [];
  let firstNewId: string | null = null;
  let quotaHit = false;

  // --- Every tile, up front. The picker has already told us the name and size
  // of each file, so the whole set can be on screen before a single byte is
  // read: named, numbered, in order. The old loop appended one tile per photo
  // as its decode finished, so a set of forty accreted at roughly one tile a
  // second and you could not see what you had picked until it was done. These
  // are not switchable yet — there is nothing stored to switch to — and each
  // becomes so as its bytes land.
  const planned = files.map((f) => ({
    id: crypto.randomUUID(),
    name: f.name,
    kind: "unknown" as ImageKind, // the real kind comes from the bytes, not the name
    size: f.size,
    edit: null,
    thumbUrl: "",
    thumbState: "waiting" as SessionPhoto["thumbState"],
    thumbGrade: undefined as string | undefined,
  }));
  for (const p of planned) { sessionPhotos.push(p); pendingStore.add(p.id); }
  adding = { done: 0, total: files.length, index: 1, name: files[0]?.name ?? "" };
  updateSessionStrip();
  // OWNERSHIP, because this loop outlives its own dialog. It raises the spinner
  // to cover the wait for the FIRST photo and hides it the moment one is on
  // screen — but the loop keeps running for the rest of the set, and it used to
  // keep writing its progress into `busyText` whenever `busy.open` was true.
  // So tapping a thumbnail mid-load, which raises its own "Loading…", handed
  // the reader a spinner that then reported the SET open instead of the photo
  // they asked for: "Adding 360 photos — reading 41 of 360". Asking for one
  // thing and being told about another is worse than no message at all.
  let ownsBusy = true;
  showBusy(`Adding ${files.length} photo${files.length === 1 ? "" : "s"}…`);

  /** Drop a planned tile that never became a photo. */
  const dropPlanned = (id: string) => {
    pendingStore.delete(id);
    const at = sessionPhotos.findIndex((p) => p.id === id);
    if (at >= 0) {
      if (sessionPhotos[at].thumbUrl) URL.revokeObjectURL(sessionPhotos[at].thumbUrl);
      sessionPhotos.splice(at, 1);
    }
  };

  // Storage is now the whole cost of this loop. The strict-durability commit is
  // 310-560 ms a photo, of which only ~30-130 ms is main-thread work — the rest
  // is waiting on the disk. That used to be hidden behind each photo's decode;
  // with the decodes moved out, the loop went straight back to being serial on
  // IndexedDB and got SLOWER than the version it replaced (measured: 4.7 s to
  // 7.4 s for eight files). So several writes are allowed in flight at once.
  // IndexedDB serialises overlapping readwrite transactions on the same stores
  // itself, so this does not fight the database; what it removes is the
  // main-thread round trip between one commit finishing and the next starting.
  // The ceiling is what it costs in RAM: STORE_LANES photos' source bytes, and
  // nothing decoded, so three is ~75 MB of Z50 NEFs rather than a set of forty.
  const STORE_LANES = 3;
  const inFlight = new Map<string, { p: Promise<void>; name: string }>();
  /** Wait until fewer than `n` writes are outstanding, settling each as it lands. */
  async function drainTo(n: number): Promise<void> {
    while (inFlight.size > n) {
      const entries = [...inFlight.entries()];
      await Promise.race(entries.map(([id, w]) => w.p.then(
        () => { inFlight.delete(id); pendingStore.delete(id); },
        (err) => {
          inFlight.delete(id);
          dropPlanned(id);
          nextOrder--;
          if (isQuotaError(err)) quotaHit = true;
          else skipped.push(`${w.name} (${(err as Error).message})`);
        },
      )));
      updateSessionStrip();
    }
  }

  try {
    for (let i = 0; i < files.length; i++) {
      if (quotaHit) { for (const p of planned.slice(i)) dropPlanned(p.id); break; }
      const f = files[i];
      const slot = planned[i];
      adding = { done: i, total: files.length, index: i + 1, name: f.name };
      if (ownsBusy && busy.open) busyText.textContent = `Adding ${files.length} photos — reading ${i + 1} of ${files.length}: ${f.name}`;
      updateSessionStrip();
      let imported: ImportedFile;
      try {
        imported = guardLocation(await importFile(f));
      } catch (err) {
        skipped.push(`${f.name} (${(err as Error).message})`);
        dropPlanned(slot.id);
        continue;
      }
      if (imported.looksTranscoded) { skipped.push(`${f.name} (arrived as flattened JPEG)`); dropPlanned(slot.id); continue; }

      // ALREADY RENDERED, if this set came from Quick look: the grid decoded
      // every file to build itself and handed the strip-sized picture across,
      // so the tile is finished before the storage write even starts and
      // `realThumbnails` will not pick it up. This is the whole of the second
      // render the reader was watching.
      const done = ready?.get(f);
      if (done && done.byteLength) {
        if (slot.thumbUrl) URL.revokeObjectURL(slot.thumbUrl);
        slot.thumbUrl = URL.createObjectURL(new Blob([done], { type: "image/jpeg" }));
        slot.thumbState = "real";
        slot.thumbGrade = gradeStamp();
      }

      // The camera's own preview, free, from bytes already in hand — so the
      // tile has a picture in it long before anything is decoded.
      // ...but never OVER a finished one. The camera's preview is a stand-in
      // for a picture this app has not rendered yet; putting it on top of one
      // it already has would downgrade the tile and hand it back to the
      // background pass, which is the second render this change removes.
      const prev = slot.thumbState === "real" ? null : embeddedPreview(imported.bytes, imported.kind);
      if (prev) {
        slot.thumbUrl = URL.createObjectURL(new Blob([prev.slice()], { type: "image/jpeg" }));
        slot.thumbState = "preview";
      }
      slot.name = imported.name;
      slot.kind = imported.kind;
      slot.size = imported.bytes.length;

      // Only the photo actually being SHOWN is decoded here. The rest are
      // stored as bytes — storage needs no decode — and get their real
      // thumbnails from the background pass below. That is the difference
      // between one decode before you can work and forty.
      let firstImg: DecodedImage | null = null;
      if (!firstNewId && (!activePhotoId || activePhotoId === "lone")) {
        try {
          firstImg = await decodeOffThread(imported);
        } catch (err) {
          skipped.push(`${f.name} (${(err as Error).message})`);
          dropPlanned(slot.id);
          continue;
        }
      }

      await drainTo(STORE_LANES - 1); // make room in the write lanes
      if (quotaHit) { for (const p of planned.slice(i)) dropPlanned(p.id); break; }
      inFlight.set(slot.id, {
        name: f.name,
        p: Session.addPhoto(
          { id: slot.id, name: imported.name, kind: imported.kind, size: imported.bytes.length, order: nextOrder++, addedAt: Date.now(), thumb: new ArrayBuffer(0), edit: null },
          imported.bytes,
        ),
      });
      if (!firstNewId) {
        firstNewId = slot.id;
        if (firstImg) {
          showDecoded(firstImg, imported);
          activateCurrent(slot.id);
        }
        ownsBusy = false;
        hideBusy(); // there is a photo on screen — nothing left to wait for
        void realThumbnails(); // from here it runs beside the loop, not after it
      }
      adding = { done: i + 1, total: files.length, index: i + 1, name: f.name };
      updateSessionStrip();
      await tick(); // yield so edits on the shown photo stay responsive
    }
    await drainTo(0); // the last writes
  } finally {
    await drainTo(0); // a throw must not strand a write (or a tile) mid-flight
    adding = null;
    hideBusy();
    settleHistogram(); // the refreshes skipped during the load, paid once
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

// --- The real thumbnails, in the background ---------------------------------
// A tile's provisional picture is the camera's, which on an infrared frame is
// the wrong colour world; the real one is rendered through this app's own
// pipeline so it matches what tapping it opens into. That costs a decode each,
// which is why it happens HERE — after the set is open, editable and safely
// stored — rather than in the path you are waiting on. Bytes come back out of
// storage one at a time, so RAM stays bounded to a single photo, and the decode
// runs off the main thread (decodeClient) so the editor keeps its frame rate.
let thumbPass = 0;

/** WHICH thumbnail to develop next — the ones the reader can SEE, first.
 *
 *  This used to take the first unrendered photo in array order, which is right
 *  for an open (you are looking at photo 1) and wrong for everything after it.
 *  Pick a Look on a long set and every tile is invalidated at once; a reader
 *  scrolled to photo 200 then waits for 199 decodes of pictures that are not on
 *  screen before the ones under their eyes change. Measured cold: three photos
 *  took 6-10 seconds to follow a look, and that is the SHORTEST possible case.
 *
 *  Order costs nothing here. The same work happens; it just happens where
 *  somebody is looking. */
function nextThumbTarget(): (typeof sessionPhotos)[number] | undefined {
  const ready = sessionPhotos.filter((v) => v.id !== "lone" && v.thumbState !== "real" && !pendingStore.has(v.id));
  if (!ready.length) return undefined;
  const all = sessionPhotos.filter((p) => p.id !== "lone");
  const idx = new Map(all.map((p, i) => [p.id, i]));

  // A tile inside the strip's own box is one the reader is looking at.
  const box = sessionThumbs.getBoundingClientRect();
  const onScreen = ready.filter((v) => {
    const i = idx.get(v.id);
    if (i === undefined) return false;
    const el = sessionThumbs.children[i] as HTMLElement | undefined;
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.right > box.left && r.left < box.right;
  });
  if (onScreen.length) return onScreen[0];

  // Nothing visible waiting — work outwards from the photo being viewed, so
  // scrolling a little in either direction meets finished tiles.
  const here = (activePhotoId !== null ? idx.get(activePhotoId) : undefined) ?? 0;
  return ready.reduce((best, v) =>
    Math.abs((idx.get(v.id) ?? 0) - here) < Math.abs((idx.get(best.id) ?? 0) - here) ? v : best);
}

async function realThumbnails(): Promise<void> {
  const gen = ++thumbPass;
  // Runs ALONGSIDE the storage loop, not after it. The two want different
  // machines — storage is waiting on the disk, this is decoding in a worker —
  // so serialising them just made the pictures arrive later than they needed
  // to (measured: last picture at 7.5 s when this waited for the loop, against
  // storage itself finishing at 4.8 s). A photo whose bytes have not landed yet
  // is not skipped, it is come back to.
  for (let guard = 0; guard < 10000; guard++) {
    if (gen !== thumbPass) return; // session torn down or restarted under us
    const view = nextThumbTarget();
    if (!view) {
      // Nothing ready. If anything is still on its way in, wait for it;
      // otherwise every thumbnail that can be made has been.
      const waiting = sessionPhotos.some((v) => v.id !== "lone" && v.thumbState !== "real" && pendingStore.has(v.id));
      if (!waiting) return;
      await new Promise((r) => setTimeout(r, 120));
      continue;
    }
    try {
      const bytes = await Session.getBytes(view.id);
      const img = await decodeOffThread({ name: view.name, kind: view.kind, bytes, looksTranscoded: false });
      const thumb = await makeThumb(img);
      if (gen !== thumbPass) return;
      if (!sessionPhotos.some((p) => p.id === view.id)) continue; // dropped while we worked
      if (thumb.byteLength) {
        if (view.thumbUrl) URL.revokeObjectURL(view.thumbUrl);
        view.thumbUrl = URL.createObjectURL(new Blob([thumb], { type: "image/jpeg" }));
        await Session.setThumb(view.id, thumb).catch(() => {});
      }
      view.thumbState = "real";
      view.thumbGrade = gradeStamp(); // what this picture is a claim about
      updateSessionStrip();
    } catch {
      // A thumbnail is not worth failing an open over — the tile keeps the
      // camera preview, or its name, and the photo still opens. Mark it done
      // either way so a file that will never render cannot spin this loop.
      view.thumbState = "real";
      view.thumbGrade = gradeStamp();
    }
    await tick();
  }
}

/** The part of the live creative state a thumbnail renders with. `makeThumb`
 *  clones the live params and then replaces the per-shot ones (balance,
 *  exposure, denoise) with the photo's own, so only these can make one tile
 *  differ from another's stored picture. Stamped onto each tile so a tile
 *  rendered under a different grade can be found and redrawn. */
function gradeStamp(): string {
  return JSON.stringify([
    activeLook, params.swapRB, params.hue, params.sat, params.contrast, params.tint,
    params.glow, params.lum, params.toneR, params.toneG, params.toneB, params.hsl,
    params.bwOn, params.bwMix, params.grade, params.mix3, lookBias, autoLift, liftAmount,
  ]);
}

/** A look (or any grade move) changed: every tile is now showing a picture the
 *  photo would no longer open into. Mark them and let the background pass
 *  redraw them — it already decodes from storage, is interruptible by its own
 *  generation guard, and leaves the old picture on screen until a new one
 *  lands, so nothing blanks out. Debounced, because pressing through four looks
 *  in a row should redraw once, not four times. */
let regradeTimer = 0;
function restripForGrade(): void {
  clearTimeout(regradeTimer);
  regradeTimer = window.setTimeout(() => {
    if (sessionPhotos.length < 2) return; // a lone photo has no strip
    const stamp = gradeStamp();
    let stale = 0;
    for (const v of sessionPhotos) if (v.id !== "lone" && v.thumbGrade !== stamp) { v.thumbState = "waiting"; stale++; }
    if (stale) void realThumbnails();
  }, 900);
}

/** DOUBLE-TAP A SLIDER TO PUT IT BACK. The convention every photo editor
 *  shares — Lightroom and Capture One both reset a control on a double click —
 *  and the reason it matters here is that most of these sliders do NOT default
 *  to zero. White balance, exposure and denoise open at values MEASURED from
 *  the photograph, so "the default" for them is the number this frame opened
 *  with, which is also exactly what Reset means in this app.
 *
 *  Captured from the DOM rather than from a table of fields, at the moment the
 *  Reset baseline is taken: `syncToUI` has just written the opened values into
 *  every control, so the DOM already IS the answer. A field-to-element map
 *  would be a second copy of `syncToUI` to keep in step, and the four other
 *  places this session found a second copy of something had all drifted. */
const sliderDefaults = new Map<string, string>();

/** The two controls that are app PREFERENCES rather than part of the photo:
 *  they open at whatever was last chosen, so "back where it opened" would mean
 *  "no change". These go back to the app's own default instead. */
const PREF_SLIDER_DEFAULTS: Record<string, string> = { exQuality: "92", liftAmt: "100" };

function captureSliderDefaults(): void {
  for (const el of document.querySelectorAll<HTMLInputElement>('#panel input[type="range"]')) {
    if (!el.id || el.id in PREF_SLIDER_DEFAULTS) continue;
    sliderDefaults.set(el.id, el.value);
  }
}

/** Wire every slider in the panel once. Delegated, so controls built later are
 *  covered without anything having to remember to call this again. */
function wireSliderReset(): void {
  // Say so on the control itself. A gesture nobody is told about is a gesture
  // nobody uses, and this one has no visible affordance at all.
  for (const el of document.querySelectorAll<HTMLInputElement>('#panel input[type="range"]')) {
    if (!el.title) el.title = el.id in PREF_SLIDER_DEFAULTS
      ? "Double-tap to put this back to its usual setting"
      : "Double-tap to put this back to where the photo opened";
  }
  const back = (el: HTMLInputElement) => {
    const to = PREF_SLIDER_DEFAULTS[el.id] ?? sliderDefaults.get(el.id);
    if (to === undefined || el.disabled || el.value === to) return;
    el.value = to;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    el.dispatchEvent(new Event("change", { bubbles: true }));
    flushRecord(); // one gesture, one undo step
  };
  panel.addEventListener("dblclick", (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('input[type="range"]') as HTMLInputElement | null;
    if (el) { e.preventDefault(); back(el); }
  });
  // iOS does not fire dblclick reliably on a range input — the second tap can
  // be swallowed by the zoom gesture — so the same thing is timed by hand.
  // `touch-action: manipulation` on the control (see style.css) is what stops
  // that gesture eating it.
  let lastId = "", lastAt = 0;
  panel.addEventListener("touchend", (e) => {
    const el = (e.target as HTMLElement | null)?.closest?.('input[type="range"]') as HTMLInputElement | null;
    if (!el) return;
    const now = Date.now();
    if (el.id === lastId && now - lastAt < 350) { back(el); lastId = ""; lastAt = 0; }
    else { lastId = el.id; lastAt = now; }
  }, { passive: true });
}

// Wired HERE, not with the other startup calls near the top: this closes over
// `panel`, `flushRecord` and the two maps above, all declared further down the
// module than that block, and a `const` referenced before its declaration is a
// temporal dead zone throw at load — which is exactly what it did.
wireSliderReset();

/** Repaint the session strip (thumbnails, active highlight, size readout).
 *  The strip takes real layout room: it publishes its measured height on the
 *  stage (--session-h + .has-session), and the CSS shrinks the photo's fit box
 *  to the space ABOVE it — the strip must never cover the picture. */
function updateSessionStrip() {
  const keepScroll = sessionThumbs.scrollLeft;
  const real = sessionPhotos.filter((p) => p.id !== "lone");
  // The strip is for switching — only meaningful from two photos up. While a
  // set is still coming in it is also the progress report, so it stays.
  if (real.length < 2 && !adding) {
    sessionStrip.hidden = true;
    sessionThumbs.replaceChildren();
    sessionProgress.hidden = true;
    sessionDone.disabled = false;
    stageEl.classList.remove("has-session");
    return;
  }
  sessionStrip.hidden = false;
  const total = real.reduce((s, p) => s + p.size, 0);
  const idx = real.findIndex((p) => p.id === activePhotoId);
  sessionProgress.hidden = !adding;
  sessionDone.disabled = !!adding;
  if (adding) {
    sessionProgressBar.style.width = `${Math.round((adding.done / Math.max(1, adding.total)) * 100)}%`;
    // WHICH PHOTO YOU ARE ON survives the load. This line used to be replaced
    // wholesale while a set came in, so the one number the strip exists to tell
    // you — which of them you are looking at — vanished for the whole wait,
    // which on 360 files is minutes.
    //
    // And they are not "opening". One photo is open; the rest are being read
    // and copied onto the device so the set survives a reload, which is where
    // the wait actually goes. Saying "opening" of 360 photos described
    // something that was not happening.
    const viewing = idx >= 0 ? `viewing ${idx + 1} · ` : "";
    sessionMeta.textContent = `${viewing}adding ${adding.index} of ${adding.total} — ${adding.name}`;
  } else {
    sessionMeta.textContent =
      `${real.length} photos · ~${fmtSize(total)}` + (idx >= 0 ? ` · viewing ${idx + 1}` : "");
  }
  sessionThumbs.replaceChildren(
    ...real.map((p) => {
      const b = document.createElement("button");
      b.type = "button";
      const saving = pendingStore.has(p.id);
      b.className =
        "session-thumb" +
        (p.id === activePhotoId ? " active" : "") +
        (saving ? " saving" : "") +
        (p.thumbState === "preview" ? " provisional" : "");
      b.title = saving
        ? `${p.name} — still saving`
        : p.thumbState === "preview"
          ? `${p.name} — showing the camera's own preview until this app has rendered its own`
          : p.name;
      b.disabled = saving;
      if (p.thumbUrl) {
        const im = document.createElement("img");
        im.draggable = false; // a tile is a button, not draggable content (CSS user-drag is not universal)
        im.src = p.thumbUrl;
        im.alt = p.name;
        b.append(im);
      } else {
        b.append(Object.assign(document.createElement("span"), { className: "session-thumb-name", textContent: p.name }));
      }
      // A provisional tile says so in text, not by colour alone: the picture in
      // it is the camera's rendering, not this app's. It read "cam", which is
      // not a word — it was an abbreviation of a sentence nobody had been told,
      // sitting on a badge with no explanation anywhere. "Preview" is what it
      // means, and the tile's own tooltip says the rest.
      if (p.thumbState === "preview" && !saving) {
        b.append(Object.assign(document.createElement("span"), { className: "session-thumb-tag", textContent: "preview" }));
        b.title = `${p.name} — showing the camera's own preview until this app has developed it`;
      }
      b.addEventListener("click", () => {
        if (stripDragged) return; // that press was a scroll, not a choice
        if (p.id !== activePhotoId) switchToPhoto(p.id);
      });
      return b;
    }),
  );
  // The strip is rebuilt on every add and every switch; without this the scroll
  // position snapped back to the first photo each time, so a mouse user could
  // never reach the far end of a long set.
  sessionThumbs.scrollLeft = keepScroll;
  stageEl.classList.add("has-session");
  stageEl.style.setProperty("--session-h", `${sessionStrip.offsetHeight}px`);
  revealActiveThumb();
}

/** The photo the strip was last scrolled to. updateSessionStrip runs on every
 *  add and every thumbnail that lands, so revealing unconditionally there took
 *  the strip away from a reader mid-scroll — it restored scrollLeft one line
 *  earlier and then threw it away again. Reveal on a CHANGE of photo only. */
let lastRevealedId: string | null = null;

function activeThumbEl(): HTMLElement | undefined {
  const i = sessionPhotos.filter((p) => p.id !== "lone").findIndex((p) => p.id === activePhotoId);
  return i >= 0 ? (sessionThumbs.children[i] as HTMLElement | undefined) : undefined;
}

/** True when the photo being viewed is scrolled out of the strip's viewport. */
function activeThumbOffscreen(): boolean {
  const el = activeThumbEl();
  if (!el) return false;
  const strip = sessionThumbs.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  if (r.width === 0) return false;
  return r.right <= strip.left + 1 || r.left >= strip.right - 1;
}

/** The way back, offered only while it is needed. */
function syncStripHere(): void {
  stripHere.hidden = !activeThumbOffscreen();
}

/** Bring the active thumbnail into view — in a set of forty it is usually off
 *  the end of the strip, and nothing else would ever scroll it back. Automatic
 *  callers get it only when the photo actually changed; `force` is the reader
 *  asking for it. */
function revealActiveThumb(force = false) {
  if (force || activePhotoId !== lastRevealedId) {
    lastRevealedId = activePhotoId;
    activeThumbEl()?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: "smooth" });
  }
  syncStripHere();
}

// A smooth scrollIntoView settles over several frames and a finger flick over
// many, so the offer is kept honest by the scroll itself rather than by a timer.
sessionThumbs.addEventListener("scroll", syncStripHere, { passive: true });
stripHere.addEventListener("click", () => revealActiveThumb(true));

// --- Reaching the rest of the set with a mouse. The strip is a native
// horizontal scroller, which a finger flicks and a trackpad swipes — but a
// mouse has neither: Safari does not turn a vertical wheel into horizontal
// scroll, and no browser drag-scrolls a container. So all three routes are
// wired here: WHEEL (either axis, whichever the mouse has), DRAG (press and
// pull the strip, with a threshold so a tap is still a tap), and the ARROW
// KEYS, which move between photos rather than scrolling — the thing actually
// wanted. ---
let stripDragged = false;

sessionThumbs.addEventListener(
  "wheel",
  (e) => {
    if (sessionThumbs.scrollWidth <= sessionThumbs.clientWidth + 1) return; // nothing to scroll
    // A mouse sends deltaY; a trackpad's horizontal swipe sends deltaX. Take
    // whichever is bigger so both land, and only claim the event when the
    // strip can actually move that way (or the page stops scrolling for free).
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    const before = sessionThumbs.scrollLeft;
    sessionThumbs.scrollLeft = before + d;
    if (sessionThumbs.scrollLeft !== before) e.preventDefault();
  },
  { passive: false },
);

// Press-and-pull. The threshold is what keeps a tap a tap: under it the click
// still selects the photo, over it the click is swallowed (see the handler above).
let stripDrag: { id: number; x: number; left: number } | null = null;
sessionThumbs.addEventListener("pointerdown", (e) => {
  // Mouse only. A finger already gets native flick-scrolling with momentum on
  // iPad; taking those pointers over here would replace a good gesture with a
  // worse one, and preventDefault on an already-scrolling touch is a no-op.
  if (e.pointerType !== "mouse" || e.button !== 0) return;
  stripDragged = false;
  stripDrag = { id: e.pointerId, x: e.clientX, left: sessionThumbs.scrollLeft };
});
sessionThumbs.addEventListener("pointermove", (e) => {
  if (!stripDrag || e.pointerId !== stripDrag.id) return;
  const dx = e.clientX - stripDrag.x;
  if (!stripDragged && Math.abs(dx) < 6) return;
  if (!stripDragged) {
    stripDragged = true;
    // Capture only once it IS a drag, so a plain tap never has its click
    // retargeted away from the thumbnail.
    try { sessionThumbs.setPointerCapture(e.pointerId); } catch { /* synthetic pointers can throw */ }
    sessionThumbs.classList.add("dragging");
  }
  sessionThumbs.scrollLeft = stripDrag.left - dx;
  e.preventDefault();
});
function endStripDrag(e: PointerEvent) {
  if (!stripDrag || e.pointerId !== stripDrag.id) return;
  stripDrag = null;
  sessionThumbs.classList.remove("dragging");
  // Cleared after the click that follows this pointerup has been dispatched.
  if (stripDragged) setTimeout(() => { stripDragged = false; }, 0);
}
sessionThumbs.addEventListener("pointerup", endStripDrag);
sessionThumbs.addEventListener("pointercancel", endStripDrag);

/** Move `step` photos through the set (wrapping), the keyboard route to what
 *  tapping a thumbnail does. */
function stepPhoto(step: number) {
  const real = sessionPhotos.filter((p) => p.id !== "lone");
  if (real.length < 2) return;
  const i = real.findIndex((p) => p.id === activePhotoId);
  const to = real[((i < 0 ? 0 : i + step) % real.length + real.length) % real.length];
  if (to && to.id !== activePhotoId) switchToPhoto(to.id);
}

// Arrows step through the set — but ONLY from the photo itself or the strip.
// A range slider, a text field and the panel's own tab list all own their
// arrow keys, and a global handler would steal them.
document.addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (document.querySelector("dialog[open]")) return;
  if (cropArmed) return; // the geometry tools own the frame
  const t = e.target as HTMLElement | null;
  const tag = t?.tagName ?? "";
  if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || t?.isContentEditable) return;
  const fromPhoto = !t || t === document.body || t === canvas || t === stageEl || sessionStrip.contains(t);
  if (!fromPhoto) return;
  if (sessionPhotos.filter((p) => p.id !== "lone").length < 2) return;
  e.preventDefault();
  stepPhoto(e.key === "ArrowRight" ? 1 : -1);
});

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
  // Clearing forty RAWs out of IndexedDB is not instant, and Done used to
  // spend that time looking like nothing had been pressed. Say what is
  // happening, then say it finished — ending a session throws work away, and
  // silence is the wrong confirmation for that.
  showBusy(`Ending the session — freeing ${n} photo${n === 1 ? "" : "s"}…`);
  try {
    await endSession();
  } finally {
    hideBusy();
  }
  toast(`Session ended — ${n} photo${n === 1 ? "" : "s"} cleared from this device.`, 3000);
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
      // Only the background pass ever writes a stored thumbnail, so one that is
      // there is the real thing; one that is missing means the pass had not
      // reached that photo before the session was left, and re-running it below
      // finishes the job rather than leaving a permanently nameless tile.
      thumbState: (m.thumb.byteLength ? "real" : "waiting") as SessionPhoto["thumbState"],
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
    const img = await decodeOffThread(imported);
    showDecoded(img, imported);
    activateCurrent(first.id);
    void realThumbnails(); // finish any thumbnails the last visit never reached
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
  /** The SAME picture at strip size, rendered from the same decode. Quick look
   *  decodes every file to build the grid; keeping a set afterwards used to
   *  throw all of that away and hand `addToSession` bare files, which decoded
   *  every one of them a SECOND time to build the strip. Watching a set render
   *  twice in a row is the reader's own observation, and it was right. */
  stripThumb: ArrayBuffer | null;
  ok: boolean;
  selected: boolean;
}

let quickItems: QuickItem[] = [];
let quickGen = 0; // bumped on open/close to abort an in-flight decode loop

const quickInput = $("quickFiles") as HTMLInputElement;
const quickLook = $("quickLook") as HTMLDialogElement;
// Escape (native dialog cancel -> close) must free previews exactly like the
// Close button; closeQuickLook empties quickItems BEFORE calling close(), so
// this listener no-ops for programmatic closes (no recursion).
quickLook.addEventListener("close", () => {
  if (quickItems.length) closeQuickLook();
});
const qlGrid = $("qlGrid") as HTMLDivElement;
const qlCount = $("qlCount") as HTMLSpanElement;
const qlKeep = $("qlKeep") as HTMLButtonElement;
const qlSelectToggle = $("qlSelectToggle") as HTMLButtonElement;
const qlPos = $("qlPos") as HTMLDivElement;

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
 *  decode). Tapping a good tile toggles whether it's a keeper. `n` is the
 *  photo's 1-based position in the grid — shown on the tile so a big set
 *  stays countable ("what number am I on?"). */
function addQuickTile(it: QuickItem, n: number) {
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
  tile.append(Object.assign(document.createElement("span"), { className: "ql-name", textContent: `${n} · ${it.name}` }));
  qlGrid.append(tile);
}

// --- Scroll-position pill: with a big set the grid is a long scroll and the
// thin overlay scrollbar says nothing, so while the grid scrolls a glass pill
// floats up showing which photo numbers are on screen ("31–45 of 77") and
// fades once the scroll settles. Purely visual and transient (aria-hidden):
// the same numbers sit permanently on every tile and the header carries the
// total, so nothing is lost without it.
let qlPosRaf = 0;
let qlPosHide = 0;

function updateQuickPos() {
  const total = quickItems.length;
  if (!total || qlGrid.scrollHeight <= qlGrid.clientHeight + 1) return;
  const view = qlGrid.getBoundingClientRect();
  const tiles = qlGrid.children;
  let first = 0;
  let last = 0;
  for (let i = 0; i < tiles.length; i++) {
    if (tiles[i].getBoundingClientRect().bottom > view.top) { first = i; break; }
  }
  for (let i = first; i < tiles.length; i++) {
    if (tiles[i].getBoundingClientRect().top >= view.bottom) break;
    last = i;
  }
  qlPos.textContent = first === last ? `${first + 1} of ${total}` : `${first + 1}–${last + 1} of ${total}`;
  qlPos.classList.add("show");
  clearTimeout(qlPosHide);
  qlPosHide = window.setTimeout(() => qlPos.classList.remove("show"), 1200);
}

qlGrid.addEventListener(
  "scroll",
  () => {
    if (qlPosRaf) return;
    qlPosRaf = requestAnimationFrame(() => {
      qlPosRaf = 0;
      updateQuickPos();
    });
  },
  { passive: true },
);

/** Open the grid and decode a preview of each picked file in turn. A transcoded
 *  JPEG still makes a fine preview, so — unlike a real open — we don't reject it
 *  here (that warning is for editing true RAW, which quick look isn't). */
async function openQuickLook(files: File[]) {
  files = inShutterOrder(files); // see inShutterOrder — the picker's order is arbitrary
  const gen = ++quickGen;
  for (const it of quickItems) if (it.thumbUrl) URL.revokeObjectURL(it.thumbUrl);
  quickItems = [];
  qlGrid.replaceChildren();
  if (!quickLook.open) quickLook.showModal();
  updateQuickHeader(`Decoding 0 / ${files.length}…`);

  let done = 0;
  for (const f of files) {
    if (gen !== quickGen) return; // closed or restarted under us
    let thumbUrl = "";
    let ok = false;
    let stripThumb: ArrayBuffer | null = null;
    try {
      const imported = guardLocation(await importFile(f));
      const img = await decodeOffThread(imported);
      const thumb = await makeThumb(img, QUICK_EDGE);
      if (thumb.byteLength) {
        thumbUrl = URL.createObjectURL(new Blob([thumb], { type: "image/jpeg" }));
        ok = true;
        // A second render at strip size, off the SAME decode. The render is a
        // fraction of the decode that produced it (a quarter of the pixels of
        // the grid tile), and it saves that decode happening again later. Made
        // at the strip's own size rather than reusing the 512px grid bytes,
        // because the session stores a thumbnail INLINE in its meta row and
        // that row has to stay small — see session.ts on why large IDB values
        // are the one shape that is not crash-safe.
        stripThumb = await makeThumb(img).catch(() => null);
      }
      // img + the imported bytes fall out of scope here; only the small JPEG
      // preview is retained, so RAM stays bounded to N thumbnails.
    } catch {
      /* couldn't open — shown as a placeholder tile so nothing goes missing */
    }
    if (gen !== quickGen) { if (thumbUrl) URL.revokeObjectURL(thumbUrl); return; }
    const it: QuickItem = { file: f, name: f.name, thumbUrl, stripThumb, ok, selected: ok };
    quickItems.push(it);
    addQuickTile(it, quickItems.length);
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
  clearTimeout(qlPosHide);
  qlPos.classList.remove("show");
  if (quickLook.open) quickLook.close();
}

/** Promote the selected previews into a real session (or a lone open, for one).
 *  The picked Files are still alive, so this is just the normal open path. */
async function keepQuickLook() {
  const keeping = quickItems.filter((it) => it.ok && it.selected);
  const files = keeping.map((it) => it.file);
  if (!files.length) return;
  // Carry the pictures across, keyed by the File itself so re-ordering on the
  // way in cannot mismatch a thumbnail to a photo.
  const ready = new Map<File, ArrayBuffer>();
  for (const it of keeping) if (it.stripThumb) ready.set(it.file, it.stripThumb);
  closeQuickLook();
  try {
    await openPicked(files, ready);
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

// "Got it" — in learn mode the numbered chips are the persistent affordance, so
// it just collapses the card (chips stay); for the classic DNG lessons it drops
// to the floating "?" that brings the card back.
$("lessonClose").addEventListener("click", () => {
  lesson.hidden = true;
  if (learnMode) {
    activeLesson = -1;
    updateChipActive();
  } else {
    lessonShow.hidden = false;
  }
});
lessonShow.addEventListener("click", () => {
  lesson.hidden = false;
  lessonShow.hidden = true;
});

// --- Practice gallery + "lessons ride on the photo" ------------------------
// The uploaded low-res frames (public/examples/gallery/) open with a rail of
// numbered lesson chips. A lesson is a SKILL, not a scene — so it works on any
// photo, and you can practice the same one across different frames. ---

// A practice tile. JPEG tiles are the low-res gallery frames; the three RAW
// (.dng) tiles are the original examples — the only ones that show the true-RAW,
// sub-2000K white-balance magic (an 8-bit JPEG can't). `file`/`thumb`/`kind`
// default to the gallery layout; RAW tiles override them.
type GalleryTile = { key: string; label: string; kind: ImageKind; file: string; thumb: string; rotate?: number; lesson?: number };
const galJpeg = (key: string, label: string): GalleryTile => ({
  key,
  label,
  kind: "jpeg",
  file: `./examples/gallery/${key}.jpg`,
  thumb: `./examples/gallery/thumbs/${key}.jpg`,
});
const galRaw = (key: string, label: string, rotate?: number): GalleryTile => ({
  key,
  label,
  kind: "dng",
  file: `./examples/${key}.dng`,
  thumb: `./examples/${key}.jpg`,
  rotate,
});
// 2x2-binned half-res DNGs from the owner's NEFs (10 MB each, under the 25 MB
// Pages limit) — one tile per scene (a JPEG twin briefly existed; owner called
// the duplication out, 2026-07-14). Each opens on ITS home lesson; orientation
// rides in the file.
const galNef = (key: string, label: string, lesson?: number): GalleryTile => ({
  key: `${key}-raw`,
  label,
  kind: "dng",
  file: `./examples/${key}.dng`,
  thumb: `./examples/gallery/thumbs/${key}.jpg`,
  lesson,
});
const GALLERY: GalleryTile[] = [
  galRaw("canopy", "Golden canopy", 3),
  galRaw("lodge", "Motor lodge", 3),
  galRaw("hillside", "Hillside & sky"),
  // A RAW practice photo for every lesson, in lesson order (owner ask
  // 2026-07-14: each practice photo opens on its own lesson).
  galNef("NIR_1638", "Lakeside beach", 0),
  galNef("NIR_1701", "White forest", 1),
  galNef("NIR_1822", "Lone pine", 2),
  galNef("NIR_1708", "Wooded shore", 3),
  galNef("NIR_1687", "Picnic still life", 4),
  galNef("NIR_1675", "Lakeside & sensor dust", 5),
  // Second wave (2026-07-14): a second RAW frame for lessons 1-5.
  galNef("NIR_1830", "Chairs by the lake", 0),
  galNef("NIR_1873", "Through the boughs", 1),
  galNef("NIR_1824", "Pine & clouds", 2),
  galNef("NIR_1821", "Shoreline forest", 3),
  galNef("NIR_1877", "Glowing pine", 4),
  // Third wave (2026-07-14): Wispy sky's RAW replaces its JPEG tile; the
  // forest-wall frames are free practice (untagged -> open on Lesson 1).
  galNef("NIR_1827", "Wispy sky", 2),
  galNef("NIR_1811", "Lakeshore pines"),
  galNef("NIR_1812", "Forest wall"),
  galNef("NIR_1814", "Forest spire"),
  galNef("NIR_1817", "Bare snag"),
  // Fourth wave (2026-07-14): Swirling sky's RAW replaces its JPEG tile, and
  // Lake & contrails' tile is now the RAW of a neighbouring frame (NIR_1722,
  // same scene — the NIR_1721 JPEG was retired). The rest are free practice
  // (Frosted pine promoted to the B&W lesson with the 1.2 release).
  galNef("NIR_1716", "Swirling sky", 2),
  galNef("NIR_1722", "Lake & contrails", 2),
  galNef("NIR_1717", "Frosted pine", 6),
  galNef("NIR_1718", "Under swirling clouds"),
  galNef("NIR_1703", "Spire & streaks"),
  galNef("NIR_1720", "Sunlit shore"),
  galNef("NIR_1738", "Kayaks on the beach"),
  galNef("NIR_1713", "Rocky shore forest"),
  galNef("NIR_1710", "Cove forest"),
  // Fifth wave (2026-07-14): Framed by trees' tile is now the RAW of a
  // neighbouring frame (NIR_1667, same scene — the NIR_1665 JPEG was
  // retired). The rest are free practice (Frosted treetops promoted to the
  // B&W lesson with the 1.2 release).
  galNef("NIR_1667", "Framed by trees"),
  galNef("NIR_1644", "Frosted treetops", 6),
  galNef("NIR_1651", "Sunlit crown"),
  galNef("NIR_1661", "Sunlit pines"),
  galNef("NIR_1662", "Fir & pine"),
  galNef("NIR_1671", "Glowing pair"),
  galNef("NIR_1681", "Foliage & trunk"),
  galNef("NIR_1682", "Foliage towers"),
  galNef("NIR_1688", "Sapling on the rock"),
  galNef("NIR_1691", "Camp by the lake"),
  galNef("NIR_1705", "Forest sentinel"),
  // Sixth wave (2026-07-14): backyard scenes — Lightroom-converted DNG
  // sources this time (binned through the same pipeline via the app's own
  // LJ92 CFA decode). All free practice.
  galNef("NIR_0063", "Oaks over the fence"),
  galNef("NIR_0102", "Bird bath"),
  galNef("NIR_0152", "Backyard lounge"),
  galNef("NIR_0172", "The playhouse"),
  galNef("NIR_0627", "Lavender"),
  galJpeg("NIR_1706", "Forest & snag"),
  galJpeg("NIR_1808", "Foliage close-up"),
  galJpeg("NIR_1864", "Weeping branches"),
  galJpeg("NIR_1866", "Into the canopy"),
  galJpeg("NIR_1825", "Cloudscape"),
  galJpeg("magenta-woodland", "Woodland (D5300)"),
  galJpeg("magenta-fir", "Dark fir (D5300)"),
  galJpeg("magenta-hilltown", "Hillside town (D5300)"),
  galJpeg("magenta-dusk-trees", "Dusk conifers (D5300)"),
];

const LESSONS: { title: string; tab: PanelTab; steps: string[] }[] = [
  {
    title: "Lesson 1 · White balance — the IR crux",
    tab: "basic",
    steps: [
      "Tap different things in the photo — foliage, a cloud, the sky — each sets white balance from that point and the colors shift.",
      "Raw photos open auto-balanced; Auto (white balance + exposure) or Reset brings you back to that starting point at any time. Hold: Untouched shows the raw, unbalanced truth.",
      "For big moves, drag the Red / Green / Blue gain sliders. There's no 2000K floor here — that's the move ordinary editors can't make.",
    ],
  },
  {
    title: "Lesson 2 · Swap & Looks — the color world",
    tab: "ir",
    steps: [
      "The R⇄B channel swap flips the whole color world in one tap — the classic infrared move.",
      "Try the film Looks — Aerochrome, Aero Red, Goldie. Press a look twice to flip its built-in swap.",
      "B&W IR and HIE B&W give the classic black-and-white infrared feel — and the B&W tab goes further, with a full channel mix (that's Lesson 7).",
    ],
  },
  {
    title: "Lesson 3 · Sky & clouds",
    tab: "masks",
    steps: [
      "In Masks, add a Sky mask — it finds the sky for you. Reach grows or tightens the selection; Feather softens the edge.",
      "Now grade just the sky: brightness, contrast, saturation, warmth — the rest of the photo stays put.",
      "Cloudy frame looking hazy? Dehaze (in the Color tab) cuts the veil while keeping the colors honest.",
    ],
  },
  {
    title: "Lesson 4 · Color tools — broad to surgical",
    tab: "color",
    steps: [
      "Broadest: Hue shift (top of the Color tab) rotates every color together — use it for big moves.",
      "Per-color: drag the Sky hue slider — each box owns half the wheel and follows the swap.",
      "Most surgical: the Color mixer. Tap “Pick color from photo”, tap the sky, then move that chip's Hue and Saturation sliders — only that color moves.",
    ],
  },
  {
    title: "Lesson 5 · Detail & finish",
    tab: "tone",
    steps: [
      "Denoise (in the Basic tab) is set automatically from the photo's measured noise — just enough to clear the grain in flat areas — nudge the slider to taste (0 is none).",
      "Sensor dust in the sky? That's Lesson 6 — Dust & spots.",
      "Shape the light with the Tone curve (Blacks → Highlights) and the overall Luminance.",
      "When it's how you want it, go to Export and Export & Save — pick the resolution on the way out.",
    ],
  },
  {
    // Best practiced on "Lakeside & sensor dust" — a real frame that left the
    // camera with a dusty sensor (one obvious smudge in the sky + several
    // faint motes), but the skill works anywhere.
    title: "Lesson 6 · Dust & spots",
    tab: "corrections",
    steps: [
      "Tap Visualize spots (in Corrections) — a high-contrast view where sensor dust jumps out of flat skies. On the Lakeside & sensor dust photo the big smudge is real.",
      "Tap Find spots automatically — it heals what it finds and rings every fix for review. Tap a ring to put that one back, or the ✓ banner to keep them all.",
      "For a spot it missed: arm Heal spots, pinch in close, and tap the mote. The newest fix keeps a highlighted ring, and Spot size resizes it live until it disappears.",
      "Heals belong to this photo and ride into every export — they never sneak into saved looks or batch runs.",
    ],
  },
  {
    // Best practiced on the frosted "white forest" pair (Frosted pine,
    // Frosted treetops) — near-mono frames where the channel weights really
    // steer the tones, the way a 720nm filter shoots.
    title: "Lesson 7 · Black & white — the 720nm mono",
    tab: "bw",
    steps: [
      "Switch on Black & white (its own B&W tab). Frames like this carry almost no color — a channel mix gives a real mono conversion with control over the tones, not just zero saturation.",
      "Try the named mixes — Even, Luma, Red / Green / Blue filter — then drag the Red / Green / Blue weights yourself. Only their balance matters: watch the sky and the frosted trees trade brightness.",
      "Shape tones per color: in the Color tab, turn on Drag on photo to adjust, then pull down on the sky — just that color's grey darkens, like a classic B&W mix.",
      "Your mix rides saved looks and bakes into exported .cube LUTs, so the mono travels with the grade.",
    ],
  },
  {
    title: "Lesson 8 · Grade the mood",
    tab: "grade",
    steps: [
      "Open the Grade tab — three wheels tint the shadows, midtones and highlights each on their own. Drag a dot out from the centre: direction picks the colour, distance the strength.",
      "Pull Highlights toward gold and Shadows toward blue for the classic split tone — Balance decides which wheel owns more of the picture.",
      "On a B&W frame, tap a Toned mono preset — Sepia, Selenium, Cyanotype — the darkroom looks, ready to fine-tune.",
      "Finish the frame: a touch of Grain and a gentle leftward Vignette draw the eye in. Both ride your saved looks and batch — the wheels even bake into .cube exports.",
    ],
  },
  {
    title: "Lesson 9 · Stickers — UFOs in the trees",
    tab: "stickers",
    steps: [
      "Open the Stickers tab and tap a Saucer or Alien — it drops onto the photo. Drag it wherever you like.",
      "It sits on top of the photo in its own colours — a sticker is a different kind of picture, so it's never run through the infrared processing (that just cooks it). To help it belong, 'Match the photo's colours' shifts the sticker into the scene's infrared palette in its own layer; the strength slider dials how far.",
      "Slide Peek behind up and pick Bright parts — the glowing foliage shows through, so the saucer tucks in behind the branches. Add a little Grain (in Grade) and it settles over the whole scene.",
      "Resize and spin it right on the photo: drag a corner handle to resize, or the round knob above it to rotate (the Size and Spin sliders and two-finger pinch work too). Turn Blend into the photo off for stickers that look better in their own colours. Remove this sticker or Clear all start over — stickers stay with this photo, not carried by saved looks or batch.",
    ],
  },
  {
    title: "Lesson 10 · Warp — bend the picture",
    tab: "warp",
    steps: [
      "In the Warp tab, pick a tool and drag on the photo: Push smears pixels along your finger, Swirl twists them around, Pinch draws them in and Bloat pushes them out.",
      "Brush size sets how much of the picture each drag grabs; Strength how hard. Build an effect up with several passes, or go bold in one.",
      "Every drag is a single undo, so experiment freely. Reset warp returns the picture to normal.",
      "Warp bends the picture itself — like crop and healing it stays with this photo, and it isn't carried by saved looks, batch or the .cube / .dcp exports.",
    ],
  },
];

let activeLesson = -1;

/** Turn the on-photo lesson rail on or off. Keeps the flag so a Home round-trip
 *  can restore the rail (and the open lesson) via returnToEditor. */
function setLearnMode(on: boolean) {
  learnMode = on;
  stageEl.classList.toggle("learn", on);
  lessonChips.hidden = !on;
  if (on) {
    lessonShow.hidden = true; // the chips replace the floating "?"
  } else {
    lesson.hidden = true;
    lesson.style.top = ""; // restore the classic top for the DNG lessons
    activeLesson = -1;
    updateChipActive();
  }
}

function updateChipActive() {
  lessonChips.querySelectorAll<HTMLButtonElement>(".chip[data-lesson]").forEach((c) => {
    c.classList.toggle("active", Number(c.dataset.lesson) === activeLesson);
  });
}

/** Open (or, if already open, collapse) a lesson: fill the card, unfold exactly
 *  the panels that lesson teaches, and light its chip. */
function showLesson(i: number) {
  if (activeLesson === i && !lesson.hidden) {
    lesson.hidden = true;
    activeLesson = -1;
    updateChipActive();
    return;
  }
  const L = LESSONS[i];
  activeLesson = i;
  ($("lessonTitle") as HTMLElement).textContent = L.title;
  const ol = $("lessonSteps") as HTMLOListElement;
  ol.replaceChildren(
    ...L.steps.map((s) => {
      const li = document.createElement("li");
      li.textContent = s;
      return li;
    }),
  );
  // Open the panel tab this lesson works in (the steps name where the rest
  // lives when a lesson spans more than one section).
  setPanelTab(L.tab);
  updateScrollCues();
  lesson.hidden = false;
  lessonShow.hidden = true;
  // Drop the card just below the chip rail (robust to the rail wrapping to two
  // rows on a narrow screen).
  lesson.style.top = `${lessonChips.offsetTop + lessonChips.offsetHeight + 8}px`;
  updateChipActive();
}

// Build the chip rail once: a numbered chip per lesson + an Exit chip.
LESSONS.forEach((L, i) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.dataset.lesson = String(i);
  b.title = L.title;
  b.innerHTML = `<span class="chip-n">${i + 1}</span>${L.title.split("·")[1]?.split("—")[0]?.trim() ?? "Lesson"}`;
  b.addEventListener("click", () => showLesson(i));
  lessonChips.appendChild(b);
});
{
  const exit = document.createElement("button");
  exit.type = "button";
  exit.className = "chip chip-exit";
  exit.textContent = "✕ Exit lessons";
  exit.title = "Hide the lessons and edit this photo freely";
  exit.addEventListener("click", () => setLearnMode(false));
  lessonChips.appendChild(exit);
}

// The always-visible TUTORIAL SET (owner cut, 2026-07-14): the lesson-tagged
// pairs in lesson order, plus two variety picks showing the app isn't only
// for forests. Everything else lives in the full library below, collapsed.
// The frosted "white forest" pair joined with the B&W lesson (1.2 release).
const baseKey = (k: string) => k.replace(/-raw$/, "");
const CORE = new Set([
  "NIR_1638", "NIR_1701", "NIR_1822", "NIR_1708", "NIR_1687", "NIR_1675",
  "NIR_1830", "NIR_1873", "NIR_1824", "NIR_1821", "NIR_1877",
  "NIR_1717", "NIR_1644",
  "NIR_0172", "NIR_0627",
]);
// Build the practice-gallery grid (tutorial set) on the start screen.
const galleryList = $("galleryList") as HTMLDivElement;
const makeTile = (g: GalleryTile) => {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "gal";
  b.innerHTML = `<img src="${g.thumb}" alt="" loading="lazy" /><span>${g.label}</span>`;
  b.addEventListener("click", () => openGalleryPhoto(g.key));
  return b;
};
GALLERY.filter((g) => CORE.has(baseKey(g.key))).forEach((g) => galleryList.appendChild(makeTile(g)));

// --- The example library: the COMPLETE practice set in its own place --------
// (owner pick 2026-07-15: "needs its own location to go into"). A full-screen
// overlay, one tap below the tutorial grid; tutorial tiles are included so the
// library reads as one honest whole. Tapping any tile opens it exactly like a
// tutorial tile (its home lesson; untagged frames start on Lesson 1).
const LIBRARY_GROUPS: [string, string[]][] = [
  ["Skies & clouds", ["NIR_1822", "NIR_1824", "NIR_1827", "NIR_1716", "NIR_1722", "NIR_1717", "NIR_1718", "NIR_1703", "NIR_1825"]],
  ["Lakeside forest", ["NIR_1701", "NIR_1708", "NIR_1821", "NIR_1873", "NIR_1877", "NIR_1811", "NIR_1812", "NIR_1814", "NIR_1817", "NIR_1713", "NIR_1710", "NIR_1705", "NIR_1667", "NIR_1644", "NIR_1651", "NIR_1661", "NIR_1662", "NIR_1671", "NIR_1681", "NIR_1682", "NIR_1706", "NIR_1808", "NIR_1864", "NIR_1866"]],
  ["Campsite & shore", ["NIR_1638", "NIR_1687", "NIR_1830", "NIR_1675", "NIR_1720", "NIR_1738", "NIR_1688", "NIR_1691"]],
  ["Backyard", ["NIR_0063", "NIR_0102", "NIR_0152", "NIR_0172", "NIR_0627"]],
  ["The original RAW trio", ["canopy", "lodge", "hillside"]],
  ["Full-spectrum D5300", ["magenta-woodland", "magenta-fir", "magenta-hilltown", "magenta-dusk-trees"]],
];
const library = $("library") as HTMLDialogElement;
{
  const body = $("libBody") as HTMLDivElement;
  const used = new Set<string>();
  const sections: [string, GalleryTile[]][] = [];
  for (const [title, keys] of LIBRARY_GROUPS) {
    const tiles = keys
      .map((k) => GALLERY.find((t) => baseKey(t.key) === k))
      .filter((t): t is GalleryTile => !!t);
    tiles.forEach((t) => used.add(t.key));
    if (tiles.length) sections.push([title, tiles]);
  }
  // Nothing may silently vanish: a tile missing from every group lands in a
  // trailing "More" section (and the verify suite asserts it stays EMPTY).
  const rest = GALLERY.filter((t) => !used.has(t.key));
  if (rest.length) sections.push(["More", rest]);
  for (const [title, tiles] of sections) {
    const h = document.createElement("h3"); // h2 dialog title -> h3 groups (no heading jump)
    h.className = "lib-group";
    h.textContent = title;
    const grid = document.createElement("div");
    grid.className = "gallery-list";
    tiles.forEach((t) => grid.appendChild(makeTile(t)));
    body.append(h, grid);
  }
  ($("libCount") as HTMLSpanElement).textContent =
    `${GALLERY.length} photos · ${GALLERY.filter((t) => t.kind === "dng").length} RAW`;
  ($("libClose") as HTMLButtonElement).addEventListener("click", () => library.close());

  // THE WAY IN: a "Learning library" tile as the tutorial grid's LAST tile —
  // the owner's design (2026-07-15; the old dashed pill under the grid was
  // "completely missable"). It reads as several photos stacked behind one
  // another: three REAL thumbs of library-only frames (honest — they are in
  // there), fanned like prints, with the label + photo count where every
  // other tile shows its label. One way in — the pill is gone.
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "gal gal-library";
  tile.setAttribute("aria-haspopup", "dialog");
  tile.setAttribute("aria-label", `Learning library — browse all ${GALLERY.length} practice photos`);
  const stack = document.createElement("div");
  stack.className = "gal-stack";
  stack.setAttribute("aria-hidden", "true");
  // Library-only frames (none is a tutorial tile), visually distinct scenes.
  // DOM order is back->front: the classic white-forest frame fronts the stack
  // (it's what most of the library looks like); the magenta full-spectrum
  // frame peeks from the back as the variety hint.
  for (const k of ["magenta-hilltown", "NIR_1825", "NIR_1811"]) {
    const t = GALLERY.find((x) => baseKey(x.key) === k);
    if (!t) continue;
    const im = document.createElement("img");
    im.src = t.thumb;
    im.alt = "";
    im.loading = "lazy";
    stack.append(im);
  }
  const label = document.createElement("span");
  label.append("Learning library");
  const count = document.createElement("small");
  count.textContent = ` · ${GALLERY.length} photos`;
  label.append(count);
  tile.append(stack, label);
  tile.addEventListener("click", () => library.showModal());
  galleryList.appendChild(tile);
}

// The start screen SAYS it scrolls (the button-row lesson): a chevron cue at
// the card's bottom edge while there's more below the fold, gone at the end.
{
  const cue = $("welcomeCue") as HTMLDivElement;
  const cueUp = $("welcomeCueUp") as HTMLDivElement;
  cue.hidden = false; // from here on, visibility is the .on class (see style.css)
  cueUp.hidden = false;
  const update = () => {
    const more = welcome.scrollHeight - welcome.clientHeight - welcome.scrollTop > 24;
    cue.classList.toggle("on", more);
    cueUp.classList.toggle("on", welcome.scrollTop > 24); // more sits above
  };
  welcome.addEventListener("scroll", update, { passive: true });
  new ResizeObserver(update).observe(welcome);
  new ResizeObserver(update).observe(galleryList); // content growth doesn't resize the capped card
  // Lazy thumbnails change the card's height as they arrive.
  galleryList.querySelectorAll("img").forEach((im) => im.addEventListener("load", update));
  update();
}

// The app's OWN practice photos (tutorial + library) export with the Studio
// corner mark baked in — the user's photos NEVER do (owner ask 2026-07-15).
// The Export tab says so while a practice photo is open (labels stay honest).
let bundledSource = false;
function setBundledSource(v: boolean) {
  bundledSource = v;
  ($("exWmNote") as HTMLParagraphElement).hidden = !v;
}

let galleryGen = 0; // bumped per open — a double-tap aborts the older load (the quickGen pattern)
async function openGalleryPhoto(key: string) {
  const tile = GALLERY.find((t) => t.key === key);
  if (!tile) return;
  // A live multi-photo session is real work — ask before replacing it, the
  // same courtesy every other replace path extends (review find, 2026-07-15).
  if (sessionPhotos.length > 1 && !confirm(`Opening a practice photo ends your session (${sessionPhotos.length} photos, edits included). Continue?`)) return;
  const gen = ++galleryGen;
  if (library.open) library.close(); // a library pick heads straight into the editor
  showBusy("Loading photo…");
  // The RAW practice files are ~10 MB each and cached for offline use — ask the
  // OS not to evict them casually (best-effort, same as sessions and batch).
  void requestPersistentStorage();
  let bytes: Uint8Array;
  try {
    const res = await fetch(tile.file);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch {
    if (gen === galleryGen) {
      hideBusy();
      alert("Couldn't download that photo — it downloads on first use, so check your connection and try again. (Once loaded, everything works offline.)");
    }
    return;
  }
  if (gen !== galleryGen) return;
  try {
    const ext = tile.kind === "dng" ? "dng" : "jpg";
    const imported: ImportedFile = { name: `${key}.${ext}`, kind: tile.kind, bytes, looksTranscoded: false };
    const img = await decodeOffThread(imported);
    if (gen !== galleryGen) return;
    // Only NOW — with a decodable photo in hand — end the previous session.
    // Tearing it down before the download/decode succeeded meant a failed
    // open destroyed the user's session (review find, 2026-07-15).
    await resetSessionState(true);
    if (gen !== galleryGen) return;
    showDecoded(img, imported); // sets a fresh view; clears learn mode
    // RAW practice files export with the corner mark ADDED (raw can't carry
    // one); the teaching JPEGs already have it BAKED IN — adding another
    // would double it (measured: two domain lines in the corner).
    setBundledSource(tile.kind === "dng");
    // Track it as a lone photo, matching openPicked's single-open path, so a
    // later multi-pick can ask sensibly. activateCurrent runs establishFreshEdit.
    sessionPhotos = [{ id: "lone", name: imported.name, kind: imported.kind, size: imported.bytes.length, edit: null, thumbUrl: "", thumbState: "real" }];
    nextOrder = 0;
    liveEdits.clear();
    activateCurrent("lone");
    // Some RAW examples need a fixed display rotation (the decoder can't infer
    // it); apply it after the edit is established, then repaint.
    if (tile.rotate) {
      renderer.setRotation(tile.rotate);
      draw();
    }
    updateSessionStrip();
    // Now raise the lesson rail and open the tile's home lesson — Lesson 1
    // unless the tile names one (the dust frame opens on Dust & spots).
    // Last, so establishFreshEdit's fold-everything doesn't undo the expand.
    setLearnMode(true);
    showLesson(tile.lesson ?? 0);
  } catch {
    if (gen !== galleryGen) return;
    // The download succeeded, so this is not a connection problem — say so.
    alert("The photo downloaded but couldn't be opened on this device — that can happen when memory runs low. Close other tabs or apps and try again.");
  } finally {
    if (gen === galleryGen) hideBusy();
  }
}

// Export & save to device.
ui.exFormat.addEventListener("change", () => {
  // Quality only applies to JPEG.
  const show = ui.exFormat.value === "jpeg";
  document.getElementById("exQualityRow")!.style.display = show ? "" : "none";
  document.getElementById("exQualityNote")!.hidden = !show;
});

// The Quality slider reads 50-100 (the number every other photo app calls
// "JPEG quality"), not the encoder's 0.5-1 fraction, and says in words what the
// number means — a bare unlabelled 0.5-1 rail told you nothing about which end
// was better or what any position cost. exportImage still takes the fraction.
const exQualityVal = $("exQualityVal") as HTMLSpanElement;

/** The encoder fraction the slider currently stands for. */
function exportQuality(): number {
  return Number(ui.exQuality.value) / 100;
}

function updateQualityReadout() {
  const q = Number(ui.exQuality.value);
  // The word names what the number COSTS, not just how big it is: what a JPEG
  // gives up first is fine texture, which on an infrared frame is most of the
  // picture (foliage and grain).
  const word = q >= 98 ? "maximum" : q >= 88 ? "high" : q >= 78 ? "good" : q >= 65 ? "soft" : "softest";
  exQualityVal.textContent = `${q} · ${word}`;
}
ui.exQuality.addEventListener("input", updateQualityReadout);
updateQualityReadout();

// Export flow: progress overlay while rendering, then a "Save image" button.
// The save happens on its own tap so iOS lets us open the native share sheet
// ("Save Image" -> Photos) and the app never navigates away.
const busy = $("busy") as HTMLDialogElement;
// The card's own buttons are the only exits: an Escape mid-export would hide
// the overlay while the job keeps running (stuck state), so cancel is eaten.
busy.addEventListener("cancel", (e) => e.preventDefault());
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
  if (!busy.open) busy.showModal();
}

function hideBusy() {
  if (busy.open) busy.close();
  pendingSave = null;
  pendingSaveIsBatch = false;
  busyStop.hidden = true;
  busyContinue.hidden = true;
  busySave.hidden = false;
}

busyClose.addEventListener("click", hideBusy);

busySave.addEventListener("click", async () => {
  if (!pendingSave || busySave.disabled) return;
  // Re-entrancy guard: a double-tap while the share sheet opens used to run
  // this handler twice — falling into the download branch a second time and,
  // for a batch, clearing the crash-recovery frames early. Disabled across
  // the await; released in finally so a cancelled sheet can try again.
  busySave.disabled = true;
  try {
    await saveBusyPending();
  } finally {
    busySave.disabled = false;
  }
});

async function saveBusyPending() {
  if (!pendingSave) return;
  const { blob, name } = pendingSave;
  if ((await saveBlob(blob, name)) === "cancelled") return; // user closed the sheet — keep the dialog
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
}

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
        quality: exportQuality(),
        rotate: renderer.rotation,
        flip: renderer.flip,
        watermark: bundledSource, // practice photos carry the corner mark; the user's photos never do
        lookRecipe: recipeForExport(currentLook()),
        stickerAssets, // bake placed stickers into the export source
      },
      (f) => {
        busyText.textContent = `Exporting… ${Math.round(f * 100)}%`;
      },
    );
    pendingSave = result;
    // The measured size, so the Quality slider has something to be judged
    // against: change it, export, watch this number move. Measured, never
    // estimated — the file is already made by the time this is written.
    busyText.textContent = `Ready — ${result.name} · ${fmtExportSize(result.blob.size)}`;
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
  // A look grade may carry an imported LUT: lutData when it comes from the
  // live edit (already in RAM), or a lutId/lutStrength ref from a saved slot
  // (resolved from IndexedDB ONCE at batch start — see the change handler).
  | { kind: "look"; look: SavedLook; lutData?: EditParams["lut"]; lutId?: string; lutStrength?: number }
  | { kind: "builtin"; key: keyof typeof LOOKS }
  | { kind: "auto" };

/** A no-op creative grade — auto-balance only. */
function neutralLook(): SavedLook {
  return {
    swapRB: false, hue: 0, sat: 1, contrast: 1, tint: [1, 1, 1], glow: 0,
    sky: [0, 1, 1], foliage: [0, 1, 1], tone: [...TONE_DEFAULT] as [number, number, number, number, number],
    toneR: [...TONE_DEFAULT] as [number, number, number, number, number],
    toneG: [...TONE_DEFAULT] as [number, number, number, number, number],
    toneB: [...TONE_DEFAULT] as [number, number, number, number, number],
    lum: 1, clarity: 0, dehaze: 0, sharpen: 0, texture: 0, hsl: hslDefault(),
    bwOn: false, bwMix: [1, 1, 1],
    grade: [0, 0, 0, 0, 0, 0, 0], grainAmt: 0, grainSize: 1.5, vigAmt: 0, vigMid: 0.5,
    mix3: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
}

/** This photo's own automatic baseline (WB/exposure/denoise) plus the chosen
 *  creative grade. Mirrors autoAdjust() + loadSlot()/pressLook(), without
 *  touching the live on-screen edit. Masks never carry (composition-specific). */
function batchParamsFor(img: DecodedImage, grade: BatchGrade, lut: EditParams["lut"] = null): EditParams {
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
  const p: EditParams = {
    wb,
    exposure: autoExposure(img, wb),
    denoise: estimateDenoise(img),
    // THE SAME AUTOMATICS AN OPEN APPLIES. Highlight recovery was missing here
    // and nowhere else — a single open sets it, and so does the strip
    // thumbnail; batch was the only path that did not, so a frame with real
    // clipping came out of a batch unrecovered.
    recover: img.camMatrix ? autoRecover(img) : 0,
    swapRB: look.swapRB,
    hue: look.hue,
    sat: look.sat,
    contrast: look.contrast,
    tint: [...look.tint] as [number, number, number],
    glow: look.glow,
    sky: [...look.sky] as [number, number, number],
    foliage: [...look.foliage] as [number, number, number],
    tone: [...look.tone] as [number, number, number, number, number],
    toneR: [...look.toneR] as [number, number, number, number, number],
    toneG: [...look.toneG] as [number, number, number, number, number],
    toneB: [...look.toneB] as [number, number, number, number, number],
    lum: look.lum,
    masks: [],
    hotspot: 0,
    hotspotSize: 0.5,
    vignette: 0,
    clarity: look.clarity,
    dehaze: look.dehaze,
    sharpen: look.sharpen,
    texture: look.texture,
    hsl: [...look.hsl],
    bwOn: look.bwOn,
    bwMix: [...look.bwMix] as [number, number, number],
    grade: [...look.grade],
    grainAmt: look.grainAmt,
    grainSize: look.grainSize,
    vigAmt: look.vigAmt,
    vigMid: look.vigMid,
    mix3: [...look.mix3],
    spots: [], // composition-specific — a batch frame heals nothing
    stickers: [], // composition-specific — stickers are placed per photo, never batched
    crop: { ...CROP_DEFAULT }, // composition-specific — a batch frame crops nothing
    straighten: 0,
    lut, // resolved once at batch start; rides every frame like the grade
  };
  // AND RESTORE DEPTH, which a batch never solved at all. Measured before this
  // line existed, one frame with Aerochrome on both sides: the editor rendered
  // median luminance 0.529 and warm saturation 0.354, the batch 0.634 and
  // 0.190 — a batch frame came out a tenth brighter and with 46% less colour
  // than the same photo and the same look in the editor. Nobody comparing a
  // .zip against the screen would have called that the same develop.
  //
  // Solved per frame from that frame's own measurement, exactly as an open
  // does, and honouring the toggle: Restore depth off means off everywhere.
  // The colour half runs where a LOOK was chosen, which is what puts a frame's
  // materials into the sky and foliage bands — the auto-balance-only choice
  // gets the tonal half alone, matching a bare open.
  if (autoLift) {
    const solved = solveLift(grade.kind !== "auto", img, p);
    const lift = solved && scaleLift(solved, liftAmount);
    if (lift) { p.tone = lift.tone as typeof p.tone; p.sky = lift.sky as typeof p.sky; p.foliage = lift.foliage as typeof p.foliage; }
  }
  return p;
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
 *  the extra durability promise.
 *
 *  ONE IMPLEMENTATION, in session.ts. This used to be its own copy, which meant
 *  the ask happened once per batch AND once per session and neither knew about
 *  the other; a probe counting the calls saw two. It also meant the batch path
 *  had the ask and the SESSION path — the one that copies every original to
 *  storage so a set survives a reload — did not, for as long as sessions have
 *  existed. Worth knowing why that went unnoticed: a search for
 *  `storage.persist` cannot see `storage?.persist?.()`, so the code was
 *  reported absent from a tree it was in. */
async function requestPersistentStorage(): Promise<void> {
  await Session.requestPersistence();
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
let batchSettings: { grade: BatchGrade; format: ExportFormat; scale: number; quality: number; lut?: EditParams["lut"]; lutMissing?: boolean; recipe?: string } | null = null;
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
        const imported = guardLocation(await importFile(f));
        if (imported.looksTranscoded) { skipped.push(`${f.name} (arrived as flattened JPEG)`); continue; }
        const img = await decodeOffThread(imported);
        const noLens = applyBatchHotspot(img, imported) === "no-lens";
        const result = await exportImage(
          imported,
          img,
          batchParamsFor(img, grade, batchSettings?.lut ?? null),
          { format, scale, quality, rotate: img.rotate ?? 0, lookRecipe: batchSettings?.recipe },
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
      (alreadyDone ? ` · ${alreadyDone} already done earlier` : "") +
      (batchSettings?.lutMissing ? " · the saved LUT was deleted — grade applied without it" : "");
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
    // The label is user-supplied (slot names) — build it with textContent,
    // never markup. The LUT badge is text too.
    const strong = document.createElement("strong");
    strong.textContent = slotLabel(i, look) + (look.lutId ? " · LUT" : "");
    b.append(strong);
    b.addEventListener("click", () => pickGrade({ kind: "look", look, lutId: look.lutId, lutStrength: look.lutStrength }));
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
$("bcCurrent").addEventListener("click", () => pickGrade({ kind: "look", look: currentLook(), lutData: params.lut ?? undefined }));
$("bcAuto").addEventListener("click", () => pickGrade({ kind: "auto" }));
// Quick look from the editor's own top bar. The system file picker is the
// system's and cannot be made bigger; this app's own grid is full-screen, and
// before this it was reachable only from the start screen. Same tap-gesture
// rule as bcQuick below: click the input synchronously or iOS ignores it.
$("barQuickBtn").addEventListener("click", () => quickInput.click());

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
  const grade: BatchGrade = chosenGrade ?? (current ? { kind: "look", look: currentLook(), lutData: params.lut ?? undefined } : { kind: "auto" });
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
  // Resolve the grade's imported LUT ONCE, before any frame runs: from RAM
  // when it rides the live edit, from IndexedDB when it's a saved-slot ref.
  let lut: EditParams["lut"] = null;
  let lutMissing = false;
  if (grade.kind === "look") {
    if (grade.lutData) lut = grade.lutData;
    else if (grade.lutId) {
      const rec = await getLut(grade.lutId).catch(() => null);
      if (rec) lut = { id: rec.id, name: rec.name, size: rec.size, data: rec.data, strength: grade.lutStrength ?? 1 };
      else lutMissing = true; // stored LUT was deleted — the summary says so
    }
  }
  // The traveling recipe for every frame in the zip: only a CONCRETE look
  // grade is embeddable (builtin looks resolve per image; auto has no grade).
  const recipe = grade.kind === "look" ? recipeForExport(grade.look, (grade.look as NamedLook).name) : undefined;
  batchSettings = { grade, format: ui.exFormat.value as ExportFormat, scale: Number(ui.exScale.value), quality: exportQuality(), lut, lutMissing, recipe };
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

// Profile / LUT export — encodes the current look for reuse elsewhere. Saved
// via the share sheet where one exists: the installed iOS app ignores a bare
// a[download], so these buttons used to silently do nothing there.
ui.cubeBtn.addEventListener("click", () => {
  const text = generateCube(params, { includeWB: ui.profWB.checked, title: baseName() });
  void saveBlob(new Blob([text], { type: "text/plain" }), `${baseName()}.cube`);
});

ui.dcpBtn.addEventListener("click", () => {
  const buf = generateDcp(params, currentFile?.bytes, `${baseName()} (IPS)`);
  void saveBlob(new Blob([new Uint8Array(buf)], { type: "application/octet-stream" }), `${baseName()}.dcp`);
});

// --- Look sharing: name a saved look and send it as a link, a file, or a
// paste-able code — and receive looks from #look= links, .ipslook files, and
// pasted codes. The whole grade travels in the payload itself (look.ts); no
// server, no account. Received payloads are hostile until coerceLook clamps
// them, and names only ever render via textContent. ---

const lookDlg = $("lookDlg") as HTMLDialogElement;
const lookDlgTitle = $("lookDlgTitle") as HTMLHeadingElement;
const lookNameInput = $("lookName") as HTMLInputElement;
const lookNameHint = $("lookNameHint") as HTMLParagraphElement;
const lookCodeOut = $("lookCodeOut") as HTMLTextAreaElement;
let lookDlgSlot = -1;
let lookNameNudged = false;

function openLookDlg(i: number) {
  const look = readSlot(i);
  if (!look) return;
  lookDlgSlot = i;
  lookNameNudged = false;
  lookNameHint.hidden = true;
  lookCodeOut.hidden = true;
  lookCodeOut.value = "";
  ($("lookQrBox") as HTMLDivElement).hidden = true;
  lookDlgTitle.textContent = `Slot ${i + 1} — name & share`;
  lookNameInput.value = look.name ?? "";
  // Honest note when the look carries an imported LUT: the payload formats
  // deliberately exclude it — the LUT travels as its own .cube file.
  const lutNote = $("lookLutNote") as HTMLParagraphElement;
  const lutShare = $("lookLutShare") as HTMLButtonElement;
  lutNote.hidden = !look.lutId;
  lutShare.hidden = !look.lutId;
  if (look.lutId) {
    void getLut(look.lutId).then((rec) => {
      if (!rec && lookDlgSlot === i) {
        lutNote.textContent = "This look referenced an imported LUT that was deleted from this device — shares apply the grade without it.";
        lutShare.hidden = true;
      }
    }).catch(() => {});
  }
  lookDlg.showModal();
}

$("lookLutShare").addEventListener("click", async () => {
  const look = lookDlgSlot >= 0 ? readSlot(lookDlgSlot) : null;
  if (!look?.lutId) return;
  const rec = await getLut(look.lutId).catch(() => null);
  if (!rec) { toast("That LUT is no longer stored on this device", 2600); return; }
  void saveBlob(new Blob([new Uint8Array(rec.cube)], { type: "text/plain" }), `${rec.name.replace(/[/\\:*?"<>|]/g, "").trim() || "lut"}.cube`);
});

lookNameInput.addEventListener("change", () => {
  if (lookDlgSlot >= 0) renameSlot(lookDlgSlot, lookNameInput.value);
});

/** The traveling-recipe payload for an export — or undefined when the user
 *  switched it off (the Export panel checkbox; honest label, default on). */
function recipeForExport(look: SavedLook, name?: string): string | undefined {
  const box = $("exRecipe") as HTMLInputElement;
  return box.checked ? encodeLookPayload(look, name) : undefined;
}

/** The dialog's slot look with the name committed from the input first. */
function lookDlgLook(): NamedLook | null {
  if (lookDlgSlot < 0) return null;
  renameSlot(lookDlgSlot, lookNameInput.value);
  return readSlot(lookDlgSlot);
}

/** Nudge once toward naming before a share; a second press shares unnamed. */
function lookNameNudge(): boolean {
  if (lookNameInput.value.trim() || lookNameNudged) return false;
  lookNameNudged = true;
  lookNameHint.hidden = false;
  lookNameInput.focus();
  return true;
}

$("lookShareLink").addEventListener("click", async () => {
  const look = lookDlgLook();
  if (!look || lookNameNudge()) return;
  const url = buildLookLink(look, look.name);
  const title = look.name ? `“${look.name}” — a look for Photography Studio` : "A look for Photography Studio";
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };
  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, url });
      return;
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return; // user closed the sheet
      /* share unsupported for this data — fall through to copying */
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    toast("Look link copied");
  } catch {
    lookCodeOut.value = url; // last resort: show it so it can be copied by hand
    lookCodeOut.hidden = false;
  }
});

$("lookShareFile").addEventListener("click", () => {
  const look = lookDlgLook();
  if (!look || lookNameNudge()) return;
  const json = encodeLookPayload(look, look.name);
  void saveBlob(new Blob([json], { type: "application/json" }), lookFileName(look.name));
});

$("lookCopyCode").addEventListener("click", async () => {
  const look = lookDlgLook();
  if (!look || lookNameNudge()) return;
  const token = toBase64url(encodeLookPayload(look, look.name));
  try {
    await navigator.clipboard.writeText(token);
    toast("Look code copied — they paste it under My looks → Paste look code");
  } catch {
    lookCodeOut.value = token;
    lookCodeOut.hidden = false;
  }
});

// QR of the look link — for workshops and in-person sharing. Encoded by our
// own spec-implemented qr.ts (harness round-trips it through an independent
// decoder); any phone camera reads it, the link does the rest.
const lookQrBox = $("lookQrBox") as HTMLDivElement;
const lookQrCanvas = $("lookQrCanvas") as HTMLCanvasElement;

$("lookShowQr").addEventListener("click", () => {
  const look = lookDlgLook();
  if (!look || lookNameNudge()) return;
  try {
    drawQr(encodeQr(buildLookLink(look, look.name)), lookQrCanvas, 6, 4);
    lookQrBox.hidden = false;
  } catch (err) {
    toast((err as Error).message, 3200); // only reachable if a link outgrew QR capacity
  }
});

$("lookSaveQr").addEventListener("click", () => {
  const look = lookDlgSlot >= 0 ? readSlot(lookDlgSlot) : null;
  lookQrCanvas.toBlob((blob) => {
    if (blob) void saveBlob(blob, `${(look?.name ?? "look").replace(/[/\\:*?"<>|]/g, "").trim() || "look"}-qr.png`);
  }, "image/png");
});

$("lookDlgClose").addEventListener("click", () => lookDlg.close());
lookDlg.addEventListener("click", (e) => {
  if (e.target === lookDlg) lookDlg.close(); // tap outside to dismiss
});

// Paste a look code (or a whole link, or raw look JSON — parseLookText takes
// all three). A textarea, deliberately: clipboard.readText is permission-gated
// and unreliable on iOS, so the user pastes by hand.
const lookPasteDlg = $("lookPasteDlg") as HTMLDialogElement;
const lookPasteIn = $("lookPasteIn") as HTMLTextAreaElement;
const lookPasteErr = $("lookPasteErr") as HTMLParagraphElement;

$("lookPasteBtn").addEventListener("click", () => {
  lookPasteIn.value = "";
  lookPasteErr.hidden = true;
  lookPasteDlg.showModal();
});
$("lookPasteApply").addEventListener("click", () => {
  const p = parseLookText(lookPasteIn.value);
  if (!p) {
    lookPasteErr.hidden = false;
    return;
  }
  lookPasteDlg.close();
  openLookReceive(p);
});
$("lookPasteClose").addEventListener("click", () => lookPasteDlg.close());
lookPasteDlg.addEventListener("click", (e) => {
  if (e.target === lookPasteDlg) lookPasteDlg.close();
});

// Import a look file directly (no photo-picker detour).
const lookFileInput = $("lookFile") as HTMLInputElement;
$("lookImportBtn").addEventListener("click", () => lookFileInput.click());
lookFileInput.addEventListener("change", async () => {
  const f = lookFileInput.files?.[0];
  lookFileInput.value = ""; // let the same file be re-picked later
  if (f) receiveLookText(await f.text(), "look file");
});

// The receive dialog — every channel (link, file, code) lands here.
const lookRecvDlg = $("lookRecvDlg") as HTMLDialogElement;
const lookRecvTitle = $("lookRecvTitle") as HTMLHeadingElement;
const lookRecvTry = $("lookRecvTry") as HTMLButtonElement;
const lookRecvNoPhoto = $("lookRecvNoPhoto") as HTMLParagraphElement;
const lookRecvSlots = $("lookRecvSlots") as HTMLDivElement;
let receivedLook: { look: SavedLook; name?: string } | null = null;

function openLookReceive(p: { look: SavedLook; name?: string }) {
  receivedLook = p;
  if (lookRecvDlg.open) lookRecvDlg.close(); // a newer look wins
  lookRecvTitle.textContent = p.name ?? "Untitled look";
  lookRecvTry.disabled = !current;
  lookRecvNoPhoto.hidden = !!current;
  lookRecvSlots.hidden = true;
  lookRecvSlots.replaceChildren();
  hint.textContent = `Look received: ${p.name ?? "untitled"}`; // start-screen live region
  lookRecvDlg.showModal();
}

lookRecvTry.addEventListener("click", () => {
  if (!receivedLook || !current) return;
  applySavedLook(receivedLook.look);
  lookRecvDlg.close();
  toast("Look applied — Undo removes it");
});

$("lookRecvSave").addEventListener("click", () => {
  if (!receivedLook) return;
  // Five honest choices: an empty slot says so; a filled one names what it
  // would replace. Names are user-supplied — textContent only.
  lookRecvSlots.replaceChildren(
    ...Array.from({ length: SLOTS }, (_, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "look-recv-slot";
      const cur = readSlot(i);
      b.textContent = cur ? `Slot ${i + 1} ✓ — replaces “${slotLabel(i, cur)}”` : `Slot ${i + 1} — empty`;
      b.addEventListener("click", () => {
        writeSlot(i, receivedLook!.look, receivedLook!.name);
        lookRecvDlg.close();
        toast("Saved to My looks");
      });
      return b;
    }),
  );
  lookRecvSlots.hidden = false;
});

$("lookRecvClose").addEventListener("click", () => lookRecvDlg.close());
lookRecvDlg.addEventListener("click", (e) => {
  if (e.target === lookRecvDlg) lookRecvDlg.close();
});

// --- Imported .cube LUTs: import (Profiles & LUTs panel), an active-LUT row
// with a strength slider, and an on-device list with share/delete (storage
// honesty). The LUT applies as the LAST colour stage (gl.ts / pipeline.ts);
// import, apply and remove are each ONE atomic undo step. ---

const lutFileInput = $("lutFile") as HTMLInputElement;
const lutActive = $("lutActive") as HTMLDivElement;
const lutActiveName = $("lutActiveName") as HTMLSpanElement;
const lutStrength = $("lutStrength") as HTMLInputElement;
const lutStrengthVal = $("lutStrengthVal") as HTMLSpanElement;
const lutList = $("lutList") as HTMLDivElement;

/** Reflect params.lut into the panel — called from syncToUI so undo/redo,
 *  Reset, session switches and slot loads all update the row for free. */
function syncLutUI() {
  const lut = params.lut ?? null;
  lutActive.hidden = !lut;
  if (lut) {
    lutActiveName.textContent = `${lut.name} (${lut.size}³)`; // names come from files — textContent only
    lutStrength.value = String(lut.strength);
    lutStrengthVal.textContent = `${Math.round(lut.strength * 100)}%`;
  }
}

/** Apply a stored/parsed LUT to the edit as one atomic undo step. */
function applyLutToEdit(lut: NonNullable<EditParams["lut"]>) {
  flushRecord();
  params.lut = lut;
  syncLutUI();
  draw();
  flushRecord();
}

$("lutImportBtn").addEventListener("click", () => lutFileInput.click());
lutFileInput.addEventListener("change", async () => {
  const f = lutFileInput.files?.[0];
  lutFileInput.value = ""; // allow re-picking the same file
  if (!f) return;
  if (f.size > CUBE_FILE_MAX) {
    alert("That .cube file is too large — files up to 8 MB (grid size 65) are supported.");
    return;
  }
  let parsed;
  try {
    parsed = parseCube(await f.text());
  } catch (err) {
    alert((err as Error).message); // parser errors are already user-facing
    return;
  }
  const existing = await listLuts().catch(() => []);
  if (existing.length >= LUT_COUNT_CAP) {
    const mb = (existing.reduce((s, m) => s + m.bytes, 0) / (1024 * 1024)).toFixed(1);
    alert(`${LUT_COUNT_CAP} LUTs are stored on this device (${mb} MB) — delete one in Profiles & LUTs to add more.`);
    return;
  }
  const name = cleanName(parsed.name) ?? (f.name.replace(/\.cube$/i, "").slice(0, 60) || "Imported LUT");
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `lut-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  try {
    await putLut({ id, name, size: parsed.size, data: parsed.data, cube: new Uint8Array(await f.arrayBuffer()), addedAt: Date.now() });
  } catch {
    toast("Couldn't store the LUT on this device — it's applied to this edit only", 3200);
  }
  if (current) {
    applyLutToEdit({ id, name, size: parsed.size, data: parsed.data, strength: 1 });
    toast(`LUT applied — ${name} (${parsed.size}³)`);
  } else {
    // No photo open: stored for later; the list below is how it's applied.
    toast(`LUT saved — "${name}" (${parsed.size}³). Open a photo, then Apply it below.`, 3200);
  }
  void renderLutList();
});

lutStrength.addEventListener("input", () => {
  if (!params.lut) return;
  params.lut.strength = Number(lutStrength.value);
  lutStrengthVal.textContent = `${Math.round(params.lut.strength * 100)}%`;
  draw();
  recordSoon(); // history entries own their wrapper clones — safe to mutate live
});

$("lutRemoveBtn").addEventListener("click", () => {
  if (!params.lut) return;
  flushRecord();
  params.lut = null;
  syncLutUI();
  draw();
  flushRecord();
});

/** The on-device LUT list: name · N³ · size, with Apply / Share / Delete.
 *  This is the honest storage control — everything stored is visible,
 *  sized, and deletable. All names render via textContent. */
async function renderLutList() {
  const metas = await listLuts().catch(() => []);
  lutList.replaceChildren(
    ...metas.map((m) => {
      const row = document.createElement("div");
      row.className = "lut-row";
      const label = document.createElement("span");
      label.className = "lut-row-name";
      label.textContent = `${m.name} · ${m.size}³ · ${(m.bytes / (1024 * 1024)).toFixed(1)} MB`;
      const apply = document.createElement("button");
      apply.type = "button";
      apply.textContent = "Apply";
      apply.setAttribute("aria-label", `Apply LUT ${m.name}`);
      apply.addEventListener("click", async () => {
        if (!current) { toast("Open a photo first — then Apply puts this LUT on it", 2600); return; }
        const rec = await getLut(m.id).catch(() => null);
        if (!rec) { toast("That LUT is no longer stored — re-import its .cube file", 3200); void renderLutList(); return; }
        applyLutToEdit({ id: rec.id, name: rec.name, size: rec.size, data: rec.data, strength: 1 });
        toast(`LUT applied — ${rec.name}`);
      });
      const share = document.createElement("button");
      share.type = "button";
      share.textContent = "Share";
      share.setAttribute("aria-label", `Share LUT ${m.name} as a .cube file`);
      share.addEventListener("click", async () => {
        const rec = await getLut(m.id).catch(() => null);
        if (!rec) { toast("That LUT is no longer stored", 2600); void renderLutList(); return; }
        // The ORIGINAL bytes — round-trips exactly through our own importer.
        void saveBlob(new Blob([new Uint8Array(rec.cube)], { type: "text/plain" }), `${rec.name.replace(/[/\\:*?"<>|]/g, "").trim() || "lut"}.cube`);
      });
      const del = document.createElement("button");
      del.type = "button";
      del.textContent = "Delete";
      del.setAttribute("aria-label", `Delete LUT ${m.name} from this device`);
      del.addEventListener("click", async () => {
        if (!confirm(`Delete the LUT "${m.name}" from this device?\n\nAn edit or saved look using it keeps working right now, but loading that look later will apply the grade without it.`)) return;
        await deleteLut(m.id).catch(() => {});
        toast("LUT deleted");
        void renderLutList();
      });
      row.append(label, apply, share, del);
      return row;
    }),
  );
  lutList.hidden = metas.length === 0;
}
void renderLutList();

// A shared look arriving in the URL fragment (#look=TOKEN). The fragment
// never reaches the network or the service worker, so links work offline.
function consumeLookHash() {
  const m = /^#look=(.+)$/.exec(location.hash);
  if (!m) return;
  // Consume FIRST: a reload must never re-offer the look, even if parsing
  // fails part-way.
  history.replaceState(null, "", location.pathname + location.search);
  receiveLookText(m[1], "look link");
}
consumeLookHash();
window.addEventListener("hashchange", consumeLookHash);

// Tap-to-white-balance: neutralize the tapped point (foliage = the IR move).
// Skipped when the gesture was a pan/pinch rather than a tap.
canvas.addEventListener("click", (e) => {
  if (!current) return;
  if (tapSuppressed) {
    tapSuppressed = false;
    return;
  }
  // Armed picks eat the tap (they must NOT also set white balance).
  if (cropArmed) return; // Crop & straighten owns the canvas — drag its own box/handles instead
  if (stickerArmed) return; // the Stickers tab owns the canvas
  if (warpArmed) return; // the Warp tab owns the canvas
  if (handleHealReviewTap(e.clientX, e.clientY)) return;
  if (handleHealTap(e.clientX, e.clientY)) return;
  if (handleColorMaskPick(e.clientX, e.clientY)) return;
  if (handleHslPick(e.clientX, e.clientY)) return;
  const [pvx, pvy] = renderer.toImagePixel(e.clientX, e.clientY);
  // The renderer may show a downscaled proxy; map back to full-res coords.
  const px = Math.min(current.width - 1, Math.round((pvx * current.width) / Math.max(1, previewW)));
  const py = Math.min(current.height - 1, Math.round((pvy * current.height) / Math.max(1, previewH)));
  const sample = sampleForWb(current, px, py);
  if (sample.verdict !== "ok") {
    // A refusal has to say what is wrong and where to go instead, or it reads
    // as the tap not registering. Nothing is changed — the photo is left alone.
    toast(sample.verdict === "blown"
      ? "That spot is blown out, so its colour was never recorded — nothing to balance from. Try a midtone: foliage is the usual target in infrared."
      : "That spot is almost black, so there is not enough colour in it to balance from. Try somewhere brighter — foliage is the usual target.", 4200);
    return;
  }
  const [r, g, b] = sample.lin;
  const mean = (r + g + b) / 3;
  // Brightness-preserving so tapping recolors without darkening.
  params.wb = lumNormalize([mean / r, mean / g, mean / b]);
  lookBias = [1, 1, 1]; // fresh neutral WB — no look bias baked in
  syncToUI();
  draw();
  flushRecord();
});

// A tapped channel that is CLIPPED has no ratio to read: the sensor stopped
// counting before the real value, so mean/channel is a division by a number the
// photograph does not contain. In infrared the red channel floods and clips
// first, which is why tapping a sunlit highlight threw the whole frame into
// magenta — the app did exactly what it was told with a number that meant
// nothing. The dark end fails the same way from the other side: near zero, the
// ratio is noise, and lumNormalize's clamp turns it into an extreme gain rather
// than an obviously wrong one.
const WB_CLIP_LIN = 0.985; // linear; the decode maps the white point to 1
const WB_DARK_LIN = 0.02;
const WB_PATCH = 2; // 5x5 — one pixel of a raw frame is not a measurement

/** Average a small patch and say whether it can carry a white balance. */
function sampleForWb(img: DecodedImage, cx: number, cy: number):
  { verdict: "ok" | "blown" | "dark"; lin: [number, number, number] } {
  let r = 0, g = 0, b = 0, n = 0, clipped = 0;
  for (let dy = -WB_PATCH; dy <= WB_PATCH; dy++) {
    for (let dx = -WB_PATCH; dx <= WB_PATCH; dx++) {
      const x = clamp(cx + dx, 0, img.width - 1);
      const y = clamp(cy + dy, 0, img.height - 1);
      const [pr, pg, pb] = linearAt(img, x, y);
      if (pr >= WB_CLIP_LIN || pg >= WB_CLIP_LIN || pb >= WB_CLIP_LIN) clipped++;
      r += pr; g += pg; b += pb; n++;
    }
  }
  const lin: [number, number, number] = [r / n, g / n, b / n];
  // A quarter of the patch, not one pixel: a lone hot pixel beside good ones is
  // not a blown highlight, and refusing on it would make the tool feel broken
  // in the other direction.
  if (clipped / n > 0.25) return { verdict: "blown", lin };
  if (Math.max(lin[0], lin[1], lin[2]) < WB_DARK_LIN) return { verdict: "dark", lin };
  return { verdict: "ok", lin };
}

/** Scale WB gains so a neutral keeps its luminance (no overall darkening). */
function lumNormalize(g: number[]): [number, number, number] {
  const l = 0.2126 * g[0] + 0.7152 * g[1] + 0.0722 * g[2] || 1;
  return [clamp(g[0] / l, 0.02, 16), clamp(g[1] / l, 0.02, 16), clamp(g[2] / l, 0.02, 16)];
}

/** White balance + exposure + noise-matched denoise (+ highlight recovery on
 *  clipped camera-native raw) in one shot — the same baseline open applies. */
function autoAdjust(img: DecodedImage) {
  params.wb = grayWorldWB(img);
  params.exposure = autoExposure(img, params.wb);
  params.denoise = estimateDenoise(img);
  params.recover = img.camMatrix ? autoRecover(img) : 0;
  lookBias = [1, 1, 1]; // fresh neutral WB — no look bias baked in
}

/** Auto position for the Recover-highlights slider: 0.7 when the frame has
 *  real sensor clipping, 0 when it doesn't. 0.7 is calibrated on the D5300
 *  full-spectrum reference frame — the lowest clean value there is 0.6 (green
 *  edge artifacts fully gone), plus margin; Lightroom-class raw apps apply
 *  their (stronger) reconstruction unconditionally, so a measured 0.7 is the
 *  conservative version of industry-normal. Clipping test: >0.1% of sampled
 *  pixels with a channel at >=98.5% of white — the same pin the slider keys on. */
function autoRecover(img: DecodedImage): number {
  if (!img.linear) return 0;
  const { width, height, linear } = img;
  const step = Math.max(1, Math.floor(Math.min(width, height) / 256));
  let clipped = 0;
  let n = 0;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const o = (y * width + x) * 4;
      if (Math.max(linear[o], linear[o + 1], linear[o + 2]) >= 0.985) clipped++;
      n++;
    }
  }
  // 0.05% of the frame: catches any visually meaningful blown area (the
  // D5300 reference frame is ~13% clipped) while ignoring single specular
  // glints and border slivers (hillside.dng's 5-row edge strip stays 0).
  return n && clipped / n > 0.0005 ? 0.7 : 0;
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
  // Auto deliberately tops out at 16x — brightening a genuinely dark frame
  // beyond that is a taste call, so the slider keeps going (to EX_HI) but
  // auto doesn't. Both bounds sit inside the slider range, so the value
  // round-trips exactly.
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

// ⓘ What's new — the last 5 user-facing updates, injected at build time, each
// carrying its real version number (v0.N = Nth update ever; 1.0+ comes from
// the VERSION file — this remote refuses tag pushes). Subjects are plain text
// — the full history lives on the public ./notes.html page (the repo is
// private, so per-commit GitHub links would 404 for everyone).
{
  const dlg = $("infoDlg") as HTMLDialogElement;
  const list = $("changeList") as HTMLUListElement;
  ($("infoVer") as HTMLElement).textContent = `You're on v${__APP_VERSION__}`;
  // Commit subjects are plain text but may carry HTML entities (e.g. a stray
  // "&amp;" from a tooling round-trip); decode them so the note reads cleanly.
  // A <textarea>'s .value decodes entities without ever interpreting tags.
  const decodeEntities = (s: string): string => {
    const t = document.createElement("textarea");
    t.innerHTML = s;
    return t.value;
  };
  for (const c of __CHANGELOG__) {
    const li = document.createElement("li");
    const ver = document.createElement("strong");
    ver.textContent = `v${c.version} `;
    const subject = document.createElement("span");
    subject.textContent = decodeEntities(c.subject);
    const when = document.createElement("small");
    when.textContent = ` — ${c.date}`;
    li.append(ver, subject, when);
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

  // Sticky scroll cues: say "more above / below" while the dialog overflows.
  const infoCueUp = $("infoCueUp") as HTMLDivElement;
  const infoCueDown = $("infoCueDown") as HTMLDivElement;
  infoCueUp.hidden = false; // visibility is the .on class (see style.css), not [hidden]
  infoCueDown.hidden = false;
  const updateInfoCues = () => {
    const max = dlg.scrollHeight - dlg.clientHeight;
    infoCueUp.classList.toggle("on", dlg.scrollTop > 8);
    infoCueDown.classList.toggle("on", max > 8 && dlg.scrollTop < max - 8);
  };
  dlg.addEventListener("scroll", updateInfoCues, { passive: true });
  const openInfo = () => { dlg.showModal(); requestAnimationFrame(updateInfoCues); };
  openInfoDialog = openInfo; // registered for the 🛰 dialog's "Open Settings"

  $("infoBtn").addEventListener("click", openInfo);
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
    requestAnimationFrame(openInfo);
  }
}

// Support link in the ⓘ dialog. Stays hidden while its URL is empty.
const VENMO_URL = "https://venmo.com/u/noahjefferson";
{
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
setupInstallFromApp("irInstallFromApp");

// Offline support.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
