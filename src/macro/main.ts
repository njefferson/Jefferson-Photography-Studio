import "./macro.css";
import { stackFocus, type StackFrame } from "./stack";

// Macro focus-stacking mode. Loads a focus-shift JPEG set, blends it into one
// all-in-focus frame, and lets you compare and save. The heavy engine lives in
// stack.ts; this file is UI + orchestration only.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const filesInput = $("files") as HTMLInputElement;
const dropZone = $("dropZone");
const intake = $("intake");
const work = $("work");
const filmstrip = $("filmstrip");
const resultCanvas = $("result") as HTMLCanvasElement;
const viewHint = $("viewHint");
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

function reset() {
  for (const f of frames) URL.revokeObjectURL(f.url);
  frames = [];
  result = null;
  compareImg = null;
  filmstrip.replaceChildren();
  work.hidden = true;
  intake.hidden = false;
  compareBtn.hidden = true;
  saveBtn.hidden = true;
  status.textContent = "";
  filesInput.value = "";
}

async function loadFiles(list: FileList | File[]) {
  const picked = [...list].filter((f) => /image\/(jpeg|png)/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name));
  if (picked.length < 2) {
    status.textContent = "Pick at least two frames from a focus-shift set.";
    return;
  }
  // Capture order == focus order for an in-camera burst: sort by filename.
  picked.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  reset();
  frames = picked.map((f) => ({ blob: f, name: f.name, url: URL.createObjectURL(f) }));
  intake.hidden = true;
  work.hidden = false;
  viewHint.hidden = false;
  viewHint.textContent = "Tap Stack to combine the set.";
  await buildFilmstrip();
  status.textContent = `${frames.length} frames loaded.`;
}

async function buildFilmstrip() {
  filmstrip.replaceChildren();
  for (let i = 0; i < frames.length; i++) {
    const bmp = await createImageBitmap(frames[i].blob, { resizeHeight: 104, resizeQuality: "low" });
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    c.getContext("2d")!.drawImage(bmp, 0, 0);
    bmp.close();
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = c.toDataURL("image/jpeg", 0.7);
    const num = document.createElement("span");
    num.textContent = String(i + 1);
    div.append(img, num);
    filmstrip.append(div);
  }
}

function drawImageData(img: ImageData) {
  resultCanvas.width = img.width;
  resultCanvas.height = img.height;
  resultCanvas.getContext("2d")!.putImageData(img, 0, 0);
}

async function runStack() {
  if (!frames.length) return;
  stackBtn.disabled = true;
  resetBtn.disabled = true;
  progress.hidden = false;
  viewHint.hidden = true;
  const t0 = performance.now();
  try {
    const res = await stackFocus(frames, {
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
    status.textContent = `Stacked ${frames.length} frames in ${secs}s` + (moved ? ` · aligned ${moved} frame${moved > 1 ? "s" : ""}.` : " · no alignment needed.");
    compareBtn.hidden = false;
    saveBtn.hidden = false;
    // Decode one frame for hold-to-compare (the first = front-focus).
    compareImg = await decodePreview(frames[0].blob);
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
  drawImageData(on && compareImg ? compareImg : result);
}
for (const ev of ["pointerdown"] as const) {
  compareBtn.addEventListener(ev, (e) => { e.preventDefault(); showCompare(true); });
  resultCanvas.addEventListener(ev, () => { if (result) showCompare(true); });
}
for (const ev of ["pointerup", "pointercancel", "pointerleave"] as const) {
  compareBtn.addEventListener(ev, () => showCompare(false));
  resultCanvas.addEventListener(ev, () => showCompare(false));
}

async function save() {
  if (!result) return;
  const blob = await new Promise<Blob | null>((r) => resultCanvas.toBlob(r, "image/jpeg", 0.92));
  if (!blob) return;
  const base = frames[0]?.name.replace(/\.[^.]+$/, "") || "stack";
  const file = new File([blob], `${base}-stacked.jpg`, { type: "image/jpeg" });
  // iOS: navigator.share off a fresh tap opens the share sheet (Save to Photos).
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file] }); return; } catch { /* fall through to download */ }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = file.name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// Wiring
filesInput.addEventListener("change", () => filesInput.files && loadFiles(filesInput.files));
stackBtn.addEventListener("click", runStack);
saveBtn.addEventListener("click", save);
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

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
}
