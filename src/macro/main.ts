import "./macro.css";
import { stackFocus, type StackFrame } from "./stack";
import { setupInstalledShare, setupInstallFromApp } from "../share";
import { wireThemeToggle } from "../theme";
import { wireForceUpdate } from "../swupdate";

// Macro focus-stacking mode. Loads a focus-shift JPEG set, blends it into one
// all-in-focus frame, and lets you compare and save. The heavy engine lives in
// stack.ts; this file is UI + orchestration only.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const filesInput = $("files") as HTMLInputElement;
const dropZone = $("dropZone");
const intake = $("intake");
const intakeHint = $("intakeHint");
const work = $("work");
const filmstrip = $("filmstrip");
const resultCanvas = $("result") as HTMLCanvasElement;
const viewHint = $("viewHint");
const statusPill = $("statusPill");
const stackBtn = $("stackBtn") as HTMLButtonElement;
const compareBtn = $("compareBtn") as HTMLButtonElement;
const saveBtn = $("saveBtn") as HTMLButtonElement;
const resetBtn = $("resetBtn") as HTMLButtonElement;
const progress = $("progress");
const progressBar = $("progressBar");
const progressText = $("progressText");
const status = $("status");

// Preview / working resolution. Small enough to be memory-safe on the iPad for
// double-digit 20 MP stacks (the engine streams, but the accumulators and the
// on-screen canvas scale with this). Full-resolution tiled export is the next
// increment.
const PREVIEW_LONG_EDGE = 2048;

type Frame = StackFrame & { url: string };
let frames: Frame[] = [];
let result: ImageData | null = null;
let compareImg: ImageData | null = null; // a single frame, for hold-to-compare

// Filmstrip interaction: tap a frame to open it in the viewer (inspect focus);
// tap the SAME frame again to turn it ON/OFF (exclude it from the stack). Tapping
// a different frame just opens that one. Everything else works as before, on the
// frames that are still ON.
const thumbEls: HTMLButtonElement[] = [];
let shownFrameIdx: number | null = null;   // which raw frame is in the viewer (null = the stacked result)
let shownFrameImg: ImageData | null = null; // its decoded pixels (so hold-to-compare can restore it)
const excluded = new Set<number>();

function activeFrames(): Frame[] {
  return frames.filter((_, i) => !excluded.has(i));
}
function refreshThumbStates() {
  thumbEls.forEach((el, i) => {
    el.classList.toggle("selected", i === shownFrameIdx);
    el.classList.toggle("excluded", excluded.has(i));
    // Real buttons announce their on/off state (frame included in the stack).
    el.setAttribute("aria-pressed", String(!excluded.has(i)));
  });
}
async function showFrame(i: number) {
  shownFrameIdx = i;
  refreshThumbStates();
  viewHint.hidden = true;
  // Status set synchronously so a quick follow-up toggle can't be overwritten
  // by this decode finishing late.
  const off = excluded.has(i);
  status.textContent = `Frame ${i + 1} of ${frames.length}${off ? " — OFF" : ""}. Tap it again to turn ${off ? "on" : "off"}.`;
  const img = await decodePreview(frames[i].blob);
  if (shownFrameIdx !== i) return; // superseded by another tap mid-decode
  shownFrameImg = img;
  drawImageData(img);
}
async function onThumbTap(i: number) {
  if (shownFrameIdx === i) {
    // Second tap on the frame already open → toggle it in/out of the stack.
    if (excluded.has(i)) excluded.delete(i); else excluded.add(i);
    refreshThumbStates();
    const on = activeFrames().length;
    const off = excluded.has(i);
    status.textContent = `Frame ${i + 1} turned ${off ? "off" : "on"} · ${on} frame${on === 1 ? "" : "s"} in the stack` +
      (result ? " — tap Stack to update." : ".");
  } else {
    await showFrame(i);
  }
}

function reset() {
  for (const f of frames) URL.revokeObjectURL(f.url);
  frames = [];
  result = null;
  compareImg = null;
  thumbEls.length = 0;
  excluded.clear();
  shownFrameIdx = null;
  shownFrameImg = null;
  filmstrip.replaceChildren();
  work.hidden = true;
  intake.hidden = false;
  compareBtn.hidden = true;
  saveBtn.hidden = true;
  resetBtn.hidden = true; // "New set" lives in the top bar, only during work
  statusPill.hidden = true;
  fullBlob = null;
  status.textContent = "";
  filesInput.value = "";
}

async function loadFiles(list: FileList | File[]) {
  const picked = [...list].filter((f) => /image\/(jpeg|png)/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name));
  if (picked.length < 2) {
    // #status lives in the (hidden) work section — the explanation must land
    // where the user is looking: the intake panel (review find, 2026-07-15).
    intakeHint.textContent = picked.length === 0
      ? "Those files aren't JPEG/PNG frames — pick the JPEGs from a focus-shift burst."
      : "That's only one frame — stacking needs at least two from the same focus-shift set.";
    return;
  }
  // Capture order == focus order for an in-camera burst: sort by filename.
  picked.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  reset();
  frames = picked.map((f) => ({ blob: f, name: f.name, url: URL.createObjectURL(f) }));
  intake.hidden = true;
  work.hidden = false;
  resetBtn.hidden = false; // reveal "New set" in the top bar while working
  statusPill.hidden = true;
  viewHint.hidden = false;
  viewHint.textContent = "Tap Stack to combine the set. Tap a frame to inspect it; tap it again to turn it off.";
  await buildFilmstrip();
  status.textContent = `${frames.length} frames loaded.`;
}

async function buildFilmstrip() {
  filmstrip.replaceChildren();
  thumbEls.length = 0;
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(frames[i].blob, { resizeHeight: 104, resizeQuality: "low" });
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    const div = document.createElement("button");
    div.type = "button";
    div.className = "thumb";
    div.title = `Frame ${i + 1} — tap to view, tap again to turn off`;
    div.setAttribute("aria-label", `Frame ${i + 1}`);
    const img = document.createElement("img");
    img.src = c.toDataURL("image/jpeg", 0.7);
    const num = document.createElement("span");
    num.textContent = String(i + 1);
    div.append(img, num);
    div.addEventListener("click", () => onThumbTap(i));
    thumbEls.push(div);
    filmstrip.append(div);
  }
  refreshThumbStates();
}

function drawImageData(img: ImageData) {
  resultCanvas.width = img.width;
  resultCanvas.height = img.height;
  resultCanvas.getContext("2d")!.putImageData(img, 0, 0);
}

async function runStack() {
  const active = activeFrames();
  if (active.length < 2) {
    status.textContent = "Keep at least two frames on to stack.";
    return;
  }
  stackBtn.disabled = true;
  resetBtn.disabled = true;
  progress.hidden = false;
  viewHint.hidden = true;
  shownFrameIdx = null; shownFrameImg = null; refreshThumbStates();
  const t0 = performance.now();
  try {
    const res = await stackFocus(active, {
      longEdge: PREVIEW_LONG_EDGE,
      align: true,
      onProgress: (done, total, phase) => {
        const pct = Math.round((done / total) * 100);
        progressBar.style.setProperty("--p", pct + "%");
        progressText.textContent = `${phase} ${done}/${total}`;
      },
    });
    result = res.image;
    drawImageData(result);
    const moved = res.shifts.filter((s) => s.dx || s.dy).length;
    const secs = ((performance.now() - t0) / 1000).toFixed(1);
    status.textContent = `${active.length} of ${frames.length} frames · done in ${secs}s` + (moved ? ` · aligned ${moved}` : "");
    // Result-viewer HUD: a status pill (top-left) + a compare hint (bottom).
    statusPill.hidden = false;
    statusPill.textContent = `✓ Stacked · ${active.length} frames`;
    viewHint.hidden = false;
    viewHint.textContent = "Press & hold to compare with a single frame";
    compareBtn.hidden = false;
    saveBtn.hidden = false;
    markSaveNeedsRender(); // a new stack invalidates any prior full-res render
    // Decode one frame for hold-to-compare (the first ON frame = front-focus).
    compareImg = await decodePreview(active[0].blob);
  } catch (err) {
    status.textContent = "Could not stack this set: " + (err as Error).message;
  } finally {
    progress.hidden = true;
    stackBtn.disabled = false;
    resetBtn.disabled = false;
  }
}

async function decodePreview(blob: Blob): Promise<ImageData> {
  const probe = await createImageBitmap(blob);
  const scale = Math.min(1, PREVIEW_LONG_EDGE / Math.max(probe.width, probe.height));
  const w = Math.round(probe.width * scale), h = Math.round(probe.height * scale);
  probe.close();
  const bmp = await createImageBitmap(blob, { resizeWidth: w, resizeHeight: h, resizeQuality: "high" });
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0);
  bmp.close();
  return c.getContext("2d")!.getImageData(0, 0, w, h);
}

// Hold the button (or the image) to see a single frame vs. the stacked result.
function showCompare(on: boolean) {
  if (!result) return;
  // On release, restore whatever was on screen — an inspected frame or the result.
  drawImageData(on && compareImg ? compareImg : (shownFrameImg ?? result));
}
for (const ev of ["pointerdown"] as const) {
  compareBtn.addEventListener(ev, (e) => { e.preventDefault(); showCompare(true); });
  resultCanvas.addEventListener(ev, () => { if (result) showCompare(true); });
}
for (const ev of ["pointerup", "pointercancel", "pointerleave"] as const) {
  compareBtn.addEventListener(ev, () => showCompare(false));
  resultCanvas.addEventListener(ev, () => showCompare(false));
}

// Two-phase save (iOS landmine: navigator.share needs a FRESH tap, so the long
// full-res render can't sit between the tap and share()). First tap RENDERS the
// full-resolution stack; when it's ready the button flips to "Save image", and
// the next (fresh) tap hands the finished file to the share sheet / download.
let fullBlob: Blob | null = null;

function markSaveNeedsRender() {
  fullBlob = null;
  saveBtn.textContent = "Export full-res";
}

function renderFullRes(): Promise<void> {
  saveBtn.disabled = true;
  stackBtn.disabled = true;
  resetBtn.disabled = true;
  progress.hidden = false;
  const t0 = performance.now();
  // Run the tiled full-res stack in a worker so the main thread (and the
  // progress bar) stays responsive through the ~minute-long render.
  const worker = new Worker(new URL("./export.worker.ts", import.meta.url), { type: "module" });
  return new Promise<void>((resolve) => {
    const finish = () => {
      worker.terminate();
      progress.hidden = true;
      saveBtn.disabled = false;
      stackBtn.disabled = false;
      resetBtn.disabled = false;
      resolve();
    };
    worker.onmessage = async (e: MessageEvent) => {
      const m = e.data;
      if (m.type === "progress") {
        progressBar.style.setProperty("--p", Math.round((m.done / m.total) * 100) + "%");
        progressText.textContent = m.phase;
      } else if (m.type === "done") {
        const img = new ImageData(new Uint8ClampedArray(m.buffer), m.width, m.height);
        const c = document.createElement("canvas");
        c.width = m.width; c.height = m.height;
        c.getContext("2d")!.putImageData(img, 0, 0);
        fullBlob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.92));
        const secs = ((performance.now() - t0) / 1000).toFixed(0);
        status.textContent = `Full resolution ready — ${m.width}×${m.height} (${secs}s). Tap Save image.`;
        saveBtn.textContent = "Save image";
        finish();
      } else if (m.type === "error") {
        status.textContent = "Could not render full resolution: " + m.message;
        markSaveNeedsRender();
        finish();
      }
    };
    worker.onerror = (err) => {
      status.textContent = "Could not render full resolution: " + err.message;
      markSaveNeedsRender();
      finish();
    };
    worker.postMessage({ frames: activeFrames().map((f) => ({ blob: f.blob, name: f.name })), opts: { align: true } });
  });
}

async function doSave() {
  if (!fullBlob) return;
  const base = frames[0]?.name.replace(/\.[^.]+$/, "") || "stack";
  const file = new File([fullBlob], `${base}-stacked.jpg`, { type: "image/jpeg" });
  // iOS: share off a fresh tap opens the share sheet (Save to Photos).
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch { /* fall through to download */ }
  }
  const url = URL.createObjectURL(fullBlob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function onSaveTap() {
  if (fullBlob) doSave();       // fresh tap on a ready file → hand off to iOS
  else renderFullRes();          // first tap → render full resolution
}

// Wiring
filesInput.addEventListener("change", () => filesInput.files && loadFiles(filesInput.files));
stackBtn.addEventListener("click", runStack);
saveBtn.addEventListener("click", onSaveTap);
resetBtn.addEventListener("click", reset);

for (const ev of ["dragenter", "dragover"] as const) {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.add("drag"); });
}
for (const ev of ["dragleave", "drop"] as const) {
  dropZone.addEventListener(ev, (e) => { e.preventDefault(); dropZone.classList.remove("drag"); });
}
dropZone.addEventListener("drop", (e) => {
  const dt = (e as DragEvent).dataTransfer;
  if (dt?.files?.length) loadFiles(dt.files);
});

const helpDlg = $("helpDlg") as HTMLDialogElement;
$("helpBtn").addEventListener("click", () => helpDlg.showModal());
$("helpClose").addEventListener("click", () => helpDlg.close());
helpDlg.addEventListener("click", (e) => { if (e.target === helpDlg) helpDlg.close(); });

// Dawn / dark theme switch (shared chrome), living in the help dialog.
wireThemeToggle(document.getElementById("themeToggle"));

// Installed-app Share (src/share.ts): only when running standalone.
setupInstalledShare("shareBtn");
setupInstallFromApp("macroInstallFromApp");

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}

{
  const btn = document.getElementById("forceUpdate") as HTMLButtonElement | null;
  const note = document.getElementById("forceUpdateNote");
  if (btn && note) wireForceUpdate(btn, note);
}
