// Full-resolution export. Re-decodes raw at native resolution (the live view
// uses a half-res proxy), applies the exact edit pipeline on the CPU, and saves
// a JPEG or 16-bit TIFF to the device.

import { lensGains, lensCurveForSource, turnOfOrientation } from "./lensflat";
import { compileEdit, toLinear8, cropToDisplayUvInto, CROP_DEFAULT, applyCreativeVignette, applyGrain, grainCellPx, aimedSampler, maskGroupsForRender, AIM_NOISE, AIM_TEXTURE, type BrushMask, type EditParams, type LensCurve, lensGeom, lensLerp, lensRadius } from "./pipeline";
import { makeDemosaicSampler, demosaicPixelLinearInto, type RawCfa } from "./raw/demosaic";
import { findDngRaw } from "./raw/dngRaw";
import { readNefCfa } from "./raw/nef";
import { Tiff } from "./raw/tiff";
import { camToSrgbLinear, nikonColorMatrix } from "./color";
import { cameraModel, readDngSource } from "./decode";
import { makeRowDenoiser, type LinearSampler } from "./raw/denoise";
import { canRunParallel, exportBands } from "./exportparallel";
import { makeRowDetail } from "./raw/detail";
import { healPatches8, healPatchesFromSampler, wrapWithPatches, healPatchBytes } from "./heal";
import { stickerPatches, makeStickerOverlaySampler, type StickerAsset } from "./sticker";
import { warpSampler, warpIsEmpty, sampleWarp } from "./warp";
import { buildGlowMap, sampleGlow, GLOW_GAIN } from "./glow";
import { buildSkyMap } from "./skymap";
import { buildLocalMap } from "./localmap";
import { SRGB_ICC, DISPLAY_P3_ICC, srgbDisplayToP3Display, embedIccInJpeg } from "./icc";
import { readExifSubset, buildExifApp1, embedExifInJpeg, ifd0ExtraEntries, exifIfdEntries, externSize, type ExifSubset, type TiffEntry } from "./exif";
import { embedLookInJpeg } from "./lookmark";
import type { ImportedFile } from "./import";
import type { DecodedImage } from "./decode";


export type ExportFormat = "jpeg" | "tiff";

export interface ExportOptions {
  format: ExportFormat;
  scale: number; // 1 = native
  quality: number; // JPEG quality 0..1
  rotate?: number; // display rotation, 90-degree CW steps (0..3)
  /** Source-space mirror bits (1 = x, 2 = y), matching the preview's u_flip. */
  flip?: number;
  /** Bake the Studio corner mark into the output (set ONLY for the app's own
   *  bundled practice photos — a user's photos are never marked). */
  watermark?: boolean;
  /** The look.ts wire-format JSON to embed as the JPEG's traveling recipe
   *  (lookmark.ts APP11 segment). Absent/empty = no recipe; TIFF never
   *  carries one. Built by the caller so export stays payload-agnostic. */
  lookRecipe?: string;
  /** Rasterised sticker assets (keyed by asset id) — needed to bake
   *  params.stickers into the export source. Omitted = no stickers baked. */
  stickerAssets?: Record<string, StickerAsset>;
  /** ONE SLICE OF THE OUTPUT, and the whole of how the parallel export works.
   *
   *  An export is 96% one pass over the pixels (measured: 45.2s of 47.0 on a
   *  20.9-megapixel raw), and that pass is embarrassingly parallel over output
   *  rows. A worker is handed the same file, the same edit and a row range, and
   *  runs exactly this function over it — the same code, so there is no second
   *  implementation to drift.
   *
   *  A SLICE OF THE OUTER LOOP, whichever way it runs: output rows normally,
   *  and output COLUMNS when the photograph is turned a quarter-turn (the loop
   *  follows columns there to keep the denoiser's row cache warm). Either way a
   *  band is a rectangle of the finished picture and comes back in its own
   *  coordinates — `BandResult` says which axis it was cut along, and the main
   *  thread puts it where it belongs. Portrait photographs are half of what
   *  anybody shoots, so "rows only" would have left half the exports on one
   *  core; the first version did exactly that and the first measurement
   *  caught it. */
  band?: { from: number; to: number };
  /** Hand back the band's own pixels instead of encoding a file. Set only by
   *  the worker; the main thread stitches the bands and encodes once. */
  raw?: boolean;
}

/** What a worker sends back: its band's pixels, in the band's own coordinates —
 *  a `width` x `height` rectangle of the finished picture, whose top-left
 *  corner in the whole is (0, band.from) for a row band and (band.from, 0) for
 *  a column one. */
/** HOW MANY THREADS THE EXPORT RUNNING RIGHT NOW IS USING, or 0 while that is
 *  not yet decided.
 *
 *  It exists because the export's progress strip PREDICTED this and was wrong
 *  twice, in both directions. Its first version guessed the output size from
 *  the half-size preview and printed "on one thread" over an export the app's
 *  own report said had run on three; its second carried a copy of the rule that
 *  refuses TIFF, which stopped being true on 2026-09-20 — so the strip said one
 *  thread while the export ran on eight, and it was reported from the
 *  device with the report beside it saying otherwise.
 *
 *  A predictor that has been wrong in both directions should not be repaired,
 *  it should be replaced by the fact. Zero means "not known yet", so a caller
 *  can say NOTHING rather than claim something; it is set the moment the pool
 *  size is decided, which is before all but the first few progress callbacks.
 *
 *  What the result has to satisfy: it is the number `ExportProfile.threads`
 *  will carry for this same export, so the strip and the §7f report can never
 *  disagree about one run. */
let liveThreads = 0;

/** WHY THE POOL DID NOT RUN, for the export happening right now.
 *
 *  Null when it ran, when it was never eligible, or before an export has got
 *  that far. A string only when the pool was asked for and failed, and the
 *  string is the failure's own message rather than a category, because the one
 *  that mattered was a `DataCloneError` naming the thing that could not be
 *  copied, and a tidier word for it would have thrown that away.
 *
 *  It exists because the fallback was a `console.warn`. A tablet has no
 *  console, so an export that asked for eight threads, failed to start any, and
 *  ran on one looked exactly like an export that was never going to be split —
 *  and it did that for every JPEG the app has ever written. */
let liveFallback: string | null = null;

/** HOW MANY THREADS THE EXPORT RUNNING RIGHT NOW IS USING.
 *
 *  Takes nothing. Returns the pool size the current export settled on, or 0
 *  when no export has got that far — including before the first one of the
 *  session, and during the moments between the press and the pool being sized.
 *
 *  What the result has to satisfy: it is the same number `ExportProfile.threads`
 *  records for this run, so the progress strip and the §7f report cannot
 *  disagree. Its consumer is `threadNote` in main.ts, which says nothing at all
 *  on a 0 rather than guessing. */
export function exportThreadsNow(): number {
  return liveThreads;
}

/** WHY THE EXPORT RUNNING RIGHT NOW IS ON ONE THREAD, when it tried not to be.
 *
 *  Takes nothing. Returns the failure's message, or null when the pool ran,
 *  when it was never eligible, or when no export has reached that point.
 *
 *  What the result has to satisfy: it is the same string `ExportProfile.fallback`
 *  records for this run, so the progress strip and the §7f report cannot
 *  disagree about one export — the defect that made `liveThreads` a fact rather
 *  than a prediction in the first place. Its consumers are `threadNote` in
 *  main.ts and the diagnostic's last-export line. */
export function exportFallbackReason(): string | null {
  return liveFallback;
}

export interface BandResult {
  band: { from: number; to: number };
  /** Which way the band was cut — the axis the export's outer loop ran along. */
  axis: "rows" | "columns";
  // BACKED BY A REAL ArrayBuffer, said explicitly. A worker TRANSFERS these
  // rather than copying them, and a transferred buffer is always an ArrayBuffer
  // — never the shared kind, which cannot be transferred at all. Left
  // unparameterised, they widen to ArrayBufferLike and the main thread cannot
  // hand the result to `ImageData` without a cast, which is a cast standing in
  // for a fact the wire already guarantees.
  /** JPEG path: RGBA bytes, Display P3, `height` rows of `width`. */
  data?: Uint8ClampedArray<ArrayBuffer>;
  /** TIFF path: 16-bit RGB, same rectangle. */
  rgb?: Uint16Array<ArrayBuffer>;
  width: number;
  height: number;
}

// --- Corner watermark for the bundled practice photos ------------------------
// (asked for 2026-07-15). The teaching JPEGs carry a baked bottom-right mark;
// the RAW practice files can't (a mark inside raw sensor data would falsify
// it), so their EXPORTS carry it instead: scrim + domain + NJ line mark, the
// same family style, drawn after the pipeline and before encoding.

const WM_TEXT = "jefferson-photo-studio.pages.dev";
let wmMarkPromise: Promise<ImageBitmap | null> | null = null;
function loadWmMark(): Promise<ImageBitmap | null> {
  wmMarkPromise ??= fetch("./icons/nj-watermark-line-512.png")
    .then((r) => (r.ok ? r.blob() : Promise.reject(new Error("mark missing"))))
    .then((b) => createImageBitmap(b))
    .catch(() => {
      wmMarkPromise = null; // don't memoize a failure — retry on the next export
      return null; // this export ships a text-only mark rather than failing
    });
  return wmMarkPromise;
}

/** The watermark as its own transparent layer (canvas + bottom-right
 *  placement), sized relative to the image like the baked teaching JPEGs. */
export async function makeWatermarkLayer(
  w: number,
  h: number,
): Promise<{ canvas: HTMLCanvasElement; x: number; y: number } | null> {
  const mark = await loadWmMark();
  const fs = Math.max(10, Math.round(Math.min(w, h) * 0.022));
  const pad = Math.round(fs * 0.9);
  const markSize = mark ? Math.round(fs * 2.4) : 0; // the baked teaching JPEGs' ring:text ratio
  const font = `600 ${fs}px -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`;
  const canvas = document.createElement("canvas");
  let ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.font = font;
  const textW = Math.ceil(ctx.measureText(WM_TEXT).width);
  const boxW = Math.min(w, pad + fs + textW + (markSize ? Math.round(fs * 0.55) + markSize : 0) + pad);
  const boxH = Math.min(h, pad + Math.max(markSize, Math.round(fs * 1.25)) + pad);
  canvas.width = boxW;
  canvas.height = boxH;
  ctx = canvas.getContext("2d")!; // resizing reset the state
  // Corner scrim so the white text reads on any sky: transparent at the top,
  // gently dark along the bottom edge (fading in from the left).
  const gy = ctx.createLinearGradient(0, 0, 0, boxH);
  gy.addColorStop(0, "rgba(0,0,0,0)");
  gy.addColorStop(1, "rgba(0,0,0,0.42)");
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, boxW, boxH);
  ctx.font = font;
  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.textBaseline = "middle";
  const midY = boxH - pad - Math.max(markSize, Math.round(fs * 1.25)) / 2;
  const textX = boxW - pad - (markSize ? markSize + Math.round(fs * 0.55) : 0) - textW;
  ctx.fillText(WM_TEXT, textX, midY);
  if (mark && markSize) {
    ctx.globalAlpha = 0.92;
    ctx.drawImage(mark, boxW - pad - markSize, midY - markSize / 2, markSize, markSize);
    ctx.globalAlpha = 1;
  }
  return { canvas, x: w - boxW, y: h - boxH };
}

export type Source =
  | { cfa: RawCfa; cam: number[] }
  | { pixels: Uint8ClampedArray; width: number; height: number };

export interface ExportResult {
  blob: Blob;
  name: string;
}

/** Yield to the event loop so the progress UI can paint mid-export. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** WHERE AN EXPORT'S SECONDS WENT, kept from the last one.
 *
 *  Export speed was reported as a priority with no measurement behind it
 *  anywhere, and the one number that existed came from a bug — a straightened
 *  export doing 119 times the work. So the export times its own stages and the
 *  diagnostic can say what it found: a reader reporting "this takes forever"
 *  sends a report with the split in it rather than a stopwatch and a guess.
 *
 *  Measured on a 20.9-megapixel raw with the app's own default edit: 47.0s in
 *  total, of which the per-pixel pass is 45.2 and everything else — re-reading
 *  the file, the JPEG encoder, the colour profile and the metadata — is 1.8.
 *  Turning denoise off takes the whole export to 18.7s, so 28 of those seconds
 *  are the twenty-five bilateral taps per pixel, each with an exp() in it. */
export interface ExportProfile {
  megapixels: number;
  total: number;
  source: number;
  pixels: number;
  watermark: number;
  encode: number;
  tag: number;
  yields: number;
  yieldMs: number;
  /** How many threads ran the per-pixel pass: 1 for the single-threaded path,
   *  N when the export was split across cores. In the report because a reader
   *  saying "this is slow on mine" is otherwise indistinguishable from a device
   *  that quietly fell back to one thread. */
  threads: number;
  /** WHY it is 1, when the pool was eligible and did not run. Absent when the
   *  pool ran, and absent when it was never eligible — a photograph small
   *  enough not to be worth splitting is not a failure and must not read like
   *  one. Present only when the export ASKED for several threads and got none,
   *  which is the case that was invisible for the whole life of the feature. */
  fallback?: string;
}
/** The fields `__mark` may add a duration to — every NUMERIC member of
 *  `ExportProfile`, derived from the interface rather than listed beside it.
 *
 *  It is derived because the alternative is a second list: `fallback` was added
 *  to the profile as a string and `__t[k] += ...` immediately stopped compiling,
 *  which is the type system catching the exact class of defect this repository
 *  keeps paying for — one rule written down twice, one copy updated. A new
 *  timing field joins this automatically; a new non-timing one cannot be marked
 *  by accident. */
type ProfileMs = { [K in keyof ExportProfile]-?: ExportProfile[K] extends number ? K : never }[keyof ExportProfile];

let lastProfile: ExportProfile | null = null;
export function lastExportProfile(): ExportProfile | null {
  return lastProfile;
}

/** LET A DRAWING SURFACE GO, the way the browser actually needs it let go.
 *
 *  Takes `canvas`, a surface nothing will draw on again. Returns nothing.
 *
 *  Dropping the last reference is NOT enough: Safari keeps a canvas alive after
 *  that, and counts it against a total across the page, past which
 *  `getContext("2d")` returns null and new surfaces draw transparent. Resizing
 *  to 1x1 and clearing is what makes it give the memory back.
 *
 *  What the caller relies on: after this, the surface costs about nothing, so a
 *  session that exports photograph after photograph does not walk into that
 *  total. It is safe on a surface that was already refused a context — the one
 *  path that most needs to release and has the least to release. */
function releaseCanvas(canvas: HTMLCanvasElement): void {
  try {
    canvas.width = 1;
    canvas.height = 1;
    canvas.getContext("2d")?.clearRect(0, 0, 1, 1);
  } catch { /* a surface already gone is a surface already released */ }
}

/** THE PHOTOGRAPH, FLATTENED FOR THE WIRE — never the live editor object.
 *
 *  Takes `current`, the `DecodedImage` the editor is holding. Returns a plain
 *  object carrying only its data fields, which `postMessage` can structured-
 *  clone. The invariant the callers depend on: everything `getSource` reads for
 *  a source it cannot re-read from the file — `pixels`, `width`, `height`, and
 *  a lossy DNG's `lossyCodes` — survives, and nothing that cannot be cloned
 *  does.
 *
 *  WHY THIS EXISTS, AND WHY IT NAMES ITS FIELDS ONE BY ONE. The two posts below
 *  used to hand the live `DecodedImage` straight to `postMessage`. That object
 *  can carry `skySelReady` — a PROMISE, set by a decode asked for a sky
 *  selection and deleted nowhere — and a Promise cannot be structured-cloned:
 *  the post throws `DataCloneError`, `Promise.all` rejects, and the `catch`
 *  around the pool logs a line to a console nobody on a tablet can see and
 *  quietly exports on one thread.
 *
 *  MEASURED, rather than reasoned about, because the first account of this was
 *  wrong in a way that would have gone into a release note. Driving the app in
 *  a browser and reading what actually reaches `postMessage`:
 *
 *    - DEVELOPING A SET fires it. `runBatch` hands `exportImage` the decoded
 *      image itself, and the payload arrives as `width, height, pixels, isRaw,
 *      skySelReady` with `structuredClone` throwing `DataCloneError` on it.
 *      Every photograph in every set went to one thread.
 *    - EXPORTING THE OPEN PHOTOGRAPH did NOT. The same test on a 7.7-megapixel
 *      JPEG posted `width, height, pixels, isRaw` and cloned cleanly, so the
 *      single-photograph path was never affected and must not be described as
 *      though it was.
 *
 *  The first draft of this comment said every JPEG export had been
 *  single-threaded for the life of the field. The plant that was supposed to
 *  demonstrate it exported on three threads instead, which is what sent
 *  somebody to look at the wire rather than at the source.
 *
 *  Structured clone is a WHOLE-OBJECT operation, so a deny-list of "the fields
 *  we know are troublesome" is a gate that fails the day somebody adds the next
 *  one. Naming what travels is the only shape that cannot rot: a new field on
 *  `DecodedImage` does not reach the wire until somebody writes it here.
 *
 *  `skySel` is left behind deliberately rather than merely as a Promise's
 *  neighbour — the selection already travels as `sky` and `skyFine`, so copying
 *  it again would cost every worker a second copy of the same mask. */
function forTheWire(current: DecodedImage): DecodedImage {
  // NOT `linear`, the half-size working copy: no worker reads it — `getSource`
  // builds a lossy DNG's full-resolution source from `lossyCodes`, and an 8-bit
  // source has no linear copy — and on a lossy DNG it is four bytes per sensor
  // pixel posted to every worker on top of the codes, which the pool's budget
  // (exportparallel.ts perWorkerMb) never billed.
  return {
    width: current.width,
    height: current.height,
    isRaw: current.isRaw,
    pixels: current.pixels,
    lossyCodes: current.lossyCodes,
    camMatrix: current.camMatrix,
    rotate: current.rotate,
    lensApplied: current.lensApplied,
    previewNotice: current.previewNotice,
  };
}

// TWO SHAPES, ONE IMPLEMENTATION. A worker asks for `raw: true` and gets its
// band's pixels; everybody else gets a finished file. Overloads rather than a
// union return, so no caller has to prove which one it got.
export function exportImage(
  file: ImportedFile, current: DecodedImage, params: EditParams,
  opts: ExportOptions & { raw: true }, onProgress?: (fraction: number) => void, lens?: LensCurve | null, sky?: BrushMask | null, skyFine?: BrushMask | null,
): Promise<BandResult>;
export function exportImage(
  file: ImportedFile, current: DecodedImage, params: EditParams,
  opts: ExportOptions, onProgress?: (fraction: number) => void, lens?: LensCurve | null, sky?: BrushMask | null, skyFine?: BrushMask | null,
): Promise<ExportResult>;
export async function exportImage(
  file: ImportedFile,
  current: DecodedImage,
  params: EditParams,
  opts: ExportOptions,
  onProgress?: (fraction: number) => void,
  /** The reader's measured lens curve, if one matched this photograph.
   *
   *  IT HAS TO COME IN, because an export does not go through the renderer: it
   *  re-decodes at native resolution and runs `compileEdit` itself. The curve
   *  belongs to the photograph and the strength rides in `params.lensFix`, so
   *  this is the same split the pipeline uses everywhere else. */
  lens?: LensCurve | null,
  /** The photograph's sky bitmap for `params.skySmooth`, built once at open
   *  from the gray-world render (main.ts, beside the local map) and handed in
   *  for the same reason the lens curve is: it belongs to the photograph, an
   *  export does not go through the renderer, and rebuilding it here would be a
   *  second implementation of a selection the preview already made. Null when
   *  no sky was found, which turns the stage off at every amount. */
  sky?: BrushMask | null,
  /** Its refinement to the photograph's edges (skyfine.ts), for
   *  `params.skyDepth`; the depth is off without it. */
  skyFine?: BrushMask | null,
): Promise<ExportResult | BandResult> {
  const __t: ExportProfile = { megapixels: 0, total: 0, source: 0, pixels: 0, watermark: 0, encode: 0, tag: 0, yields: 0, yieldMs: 0, threads: 1 };
  // A NEW EXPORT OWNS ITS OWN ANSWER. Left over from the previous one, a
  // reason would attach itself to a run that succeeded.
  if (!opts.raw) liveFallback = null;
  // A BAND IS PART OF SOMEBODY ELSE'S EXPORT and must not touch the live count.
  if (!opts.raw) liveThreads = 0;
  const __mark = (k: ProfileMs, from: number) => { __t[k] += performance.now() - from; };
  const __start = performance.now();
  let __a = __start;
  const src = getSource(file, current);
  __mark("source", __a);
  const srcW = "cfa" in src ? src.cfa.width : src.width;
  const srcH = "cfa" in src ? src.cfa.height : src.height;
  const rot = ((opts.rotate ?? 0) % 4 + 4) % 4;
  const flip = (opts.flip ?? 0) & 3;
  const dispW = rot & 1 ? srcH : srcW;
  const dispH = rot & 1 ? srcW : srcH;
  // Crop shrinks the OUTPUT frame itself (a view, not a re-bake) — matching
  // Renderer.applySize, so the export's pixel dimensions are exactly what the
  // preview canvas shows, and the watermark (drawn after, at w×h) anchors to
  // the CROPPED frame for free.
  const crop = params.crop ?? CROP_DEFAULT;
  const straighten = params.straighten ?? 0;
  const dispAspect = dispH ? dispW / dispH : 1;
  const outW = Math.max(1, Math.round(dispW * crop.w));
  const outH = Math.max(1, Math.round(dispH * crop.h));
  const w = Math.max(1, Math.round(outW * opts.scale));
  const h = Math.max(1, Math.round(outH * opts.scale));
  // Output pixel -> source pixel: crop/straighten (see pipeline.ts's
  // cropToDisplayUvInto, mirrored exactly), then the display rotation — same
  // mapping as the preview's vertex shader.
  // ONE PAIR, REUSED. This is called once per output pixel (and ss*ss times per
  // pixel on a scaled export), so a fresh two-element array here is twenty
  // million of them for one photograph — and `cropToDisplayUv` allocated a
  // second. The arithmetic is unchanged; only where the numbers are put.
  const srcXY = new Float64Array(2);
  // AND WHERE BETWEEN PIXELS IT FELL, for straighten: the same position in
  // pixel units with pixel CENTRES on the integers (u * W - 0.5), which is
  // where a LINEAR texture lookup puts its four taps.
  const srcFrac = new Float64Array(2);
  const uv = new Float64Array(2);
  const toSrcF = (tx: number, ty: number): Float64Array => {
    cropToDisplayUvInto(tx, ty, crop, straighten, dispAspect, uv);
    const u = uv[0], v = uv[1];
    let iu = u, iv = v;
    if (rot === 1) { iu = v; iv = 1 - u; }
    else if (rot === 2) { iu = 1 - u; iv = 1 - v; }
    else if (rot === 3) { iu = 1 - v; iv = u; }
    // The source-space mirror — the INNERMOST op, matching the vertex shader.
    if (flip & 1) iu = 1 - iu;
    if (flip & 2) iv = 1 - iv;
    srcXY[0] = Math.min(srcW - 1, Math.max(0, Math.floor(iu * srcW)));
    srcXY[1] = Math.min(srcH - 1, Math.max(0, Math.floor(iv * srcH)));
    srcFrac[0] = iu * srcW - 0.5;
    srcFrac[1] = iv * srcH - 0.5;
    return srcXY;
  };
  const toSrc = (x: number, y: number): Float64Array => toSrcF((x + 0.5) / w, (y + 0.5) / h);

  // The matrix is applied inside the edit (after white balance), matching the
  // shader exactly so the export matches the preview.
  const baseName = file.name.replace(/\.[^.]+$/, "");

  // Camera-native linear RGB at a source pixel; denoise wraps the sampler so it
  // acts on linear data BEFORE white balance and exposure — where all three
  // channels share one noise curve, which its range is measured in (see the
  // header of raw/denoise.ts; "before the gains amplify the noise" was the old
  // reason, corrected 2026-10-01).
  // Once per SOURCE pixel, through the row caches — so the same arithmetic
  // writing into one array rather than making twenty million of them.
  const rawOut: [number, number, number] = [0, 0, 0];
  // RCD, ONE TILE AT A TIME (raw/demosaic.ts). The sampler computes a 64-pixel
  // tile the first time any pixel in it is asked for and keeps it, so this walk
  // pays for each tile about once; its cache is billed per thread in
  // exportparallel.ts. It replaced a bilinear average of same-coloured
  // neighbours, which zippered and fringed every edge.
  const demosaic = "cfa" in src ? makeDemosaicSampler(src.cfa) : null;
  // THE LENS FLAT ON THE RAW, FIRST (decision 021): the same gain tables the
  // decode laid on the working copy, at the strength the params carry now,
  // applied per source pixel before the heal, the warp, the denoise and the
  // detail pass — so the export's order is the preview's. An 8-bit source has
  // no linear copy and keeps the correction inside the grade (lens passed on).
  const flat = "cfa" in src ? lensGains(lens ?? null, params.lensBypass ? 0 : (params.lensFix ?? 0)) : null;
  const flatGeom = flat ? lensGeom(srcW / Math.max(1, srcH), flat.c) : null;
  const rawSample: LinearSampler =
    "cfa" in src
      ? flat
        ? (x: number, y: number) => {
            demosaic!(x, y, rawOut);
            // Between bins, on the flat's radius, about the profile's centre —
            // the decode-time flat's own three reads (lensflat.ts).
            const rr = lensRadius((x + 0.5) / srcW, (y + 0.5) / srcH, flatGeom!);
            rawOut[0] *= lensLerp(flat.gr, rr, flat.n); rawOut[1] *= lensLerp(flat.gg, rr, flat.n); rawOut[2] *= lensLerp(flat.gb, rr, flat.n);
            return rawOut;
          }
        : (x: number, y: number) => { demosaic!(x, y, rawOut); return rawOut; }
      : (x: number, y: number) => {
          const i = (y * src.width + x) * 4;
          rawOut[0] = toLinear8(src.pixels[i]);
          rawOut[1] = toLinear8(src.pixels[i + 1]);
          rawOut[2] = toLinear8(src.pixels[i + 2]);
          return rawOut;
        };
  // THE CURVE THE GRADE CARRIES: none for a raw (the sampler above already laid
  // the flat — every DNG raw image is a `cfa` source now, lossy LinearRaw
  // included), and the brightness half alone for a camera-rendered picture,
  // turned upright with it when the browser turned a JPEG by its Orientation
  // (lensCurveForSource, LN1).
  const gradeLens = "cfa" in src
    ? null
    : lensCurveForSource(lens ?? null, {
        isRaw: current.isRaw,
        turn: file.kind === "jpeg" ? turnOfOrientation(readExifSubset(file.bytes)?.orientation) : 0,
      });

  // THE COARSE MAPS READ A POINT ESTIMATE, NOT THE RCD TILES. Their grids take
  // one pixel every 20 to 30 and blur over 3% of the frame, and a grid that
  // dense touches every 64-pixel tile: through the tile cache each map would
  // cost a whole-frame RCD, in every worker. So they read the bilinear point
  // value, through the same lens flat, which is what they read before RCD
  // existed. (The sky map below reads the pre-passed sampler on purpose and so
  // does pay for the tiles it touches; skymap.ts says why it must.)
  const pointOut: [number, number, number] = [0, 0, 0];
  const mapSample: LinearSampler =
    "cfa" in src
      ? (x: number, y: number) => {
          demosaicPixelLinearInto(src.cfa, x, y, pointOut);
          if (flat) {
            const rr = lensRadius((x + 0.5) / srcW, (y + 0.5) / srcH, flatGeom!);
            pointOut[0] *= lensLerp(flat.gr, rr, flat.n); pointOut[1] *= lensLerp(flat.gg, rr, flat.n); pointOut[2] *= lensLerp(flat.gb, rr, flat.n);
          }
          return pointOut;
        }
      : rawSample;
  // Aspect = SOURCE dims (the uv we pass below are source-space), so the lens
  // fix stays circular in pixels regardless of display rotation. The clarity/
  // dehaze maps are rebuilt from the full-res source (cheap: coarse grid).
  // NOTE the maps (and glow below) read the UNHEALED source: the preview's
  // maps are built from the pristine decode too, and a dust mote is invisible
  // to a coarse blurred map — healing must not force a map rebuild per spot.
  // THEY ARE ALSO STICKER-FREE, deliberately, for the same reason pointed the
  // other way: an in-look sticker is moved, scaled and re-occluded live, and
  // rebuilding both maps (and re-uploading them on the preview) on every drag
  // of one is a cost the preview cannot pay per frame. So a sticker's clarity
  // and dehaze are measured against the background it covers. They are read
  // at the WARPED position, though (mapAt below): warp moves pixels a long way,
  // and the map has to follow the pixel.
  const localMap =
    (params.clarity ?? 0) !== 0 || (params.dehaze ?? 0) !== 0
      ? buildLocalMap(mapSample, srcW, srcH)
      : undefined;
  // The measured lens curve is a PIPELINE stage now, so the export gets it the
  // same way it gets everything else. It used to wrap the raw sampler here,
  // which worked and meant the export had its own copy of a correction the
  // preview applied somewhere else entirely — two implementations of one idea.
  const out = new Float32Array(3);
  // Creative vignette + film grain — the FINAL image ops, applied to each
  // display-space pixel AFTER edit() and BEFORE the P3/16-bit write, on
  // OUTPUT-frame coords ((x+0.5)/w — the same fraction the shader's
  // v_cropUv carries). Spatial: never inside compileEdit, so they cannot
  // bake into .cube. Vignette first, grain on top, matching the shader.
  const vigAmt = params.vigAmt ?? 0;
  const vigMid = params.vigMid ?? 0.5;
  const grainAmt = params.grainAmt ?? 0;
  const grainCell = grainCellPx(params.grainSize ?? 1.5, h);
  const outAspect = w / h;
  const finishPixel = (x: number, y: number) => {
    if (vigAmt !== 0) applyCreativeVignette(out, (x + 0.5) / w, (y + 0.5) / h, outAspect, vigAmt, vigMid);
    if (grainAmt > 0) applyGrain(out, x + 0.5, y + 0.5, grainCell, grainAmt);
  };
  // Dust & spot heals rewrite the source BEFORE everything (mirroring the
  // preview, which bakes them into the GPU texture): the 8-bit path reads the
  // exact quantized bytes the preview bakes, the raw path the same f32 mix.
  const spots = params.spots ?? [];
  const healed = spots.length
    ? wrapWithPatches(
        rawSample,
        "cfa" in src
          ? healPatchesFromSampler(rawSample, srcW, srcH, spots)
          : healPatches8(src.pixels, srcW, srcH, spots, toLinear8),
        srcH,
      )
    : rawSample;
  // Stickers split into two kinds. IN-LOOK stickers wrap OUTSIDE heal — they
  // composite over the healed source and then run THROUGH the pipeline (they take
  // on the IR palette). ON-TOP stickers (the default) are composited AFTER the
  // whole pipeline via an overlay sampler, so they keep their own colours
  // (2026-07-21). Both samplers are LINEAR; never touched when no stickers exist.
  const allStickers = (params.stickers ?? []).filter((s) => opts.stickerAssets?.[s.asset]);
  const inLookStickers = allStickers.filter((s) => s.onTop === false);
  const onTopStickers = allStickers.filter((s) => s.onTop !== false);
  // Occlusion reads DISPLAY luminance — same exposure×WB (+ camera matrix for
  // RAW) the compileEdit start applies, so it matches the preview.
  const stkEx = params.exposure;
  const stkOcc = {
    wb: [params.wb[0] * stkEx, params.wb[1] * stkEx, params.wb[2] * stkEx] as [number, number, number],
    cam: "cfa" in src ? src.cam : null,
  };
  const composed = inLookStickers.length && opts.stickerAssets
    ? wrapWithPatches(healed, stickerPatches(healed, srcW, srcH, inLookStickers, opts.stickerAssets, stkOcc, rot * 90), srcH)
    : healed;
  // On-top splits by blend, mirroring the preview's two overlay textures: glows
  // SCREEN (add light), everything else OVER. Both sample (sx,sy) -> [r,g,b,a]
  // gamma sRGB and blend into the FINISHED display pixel (after edit(), before
  // grain). Peek-behind reads the pristine source, same as the preview.
  const normalOnTop = onTopStickers.filter((s) => !s.screen);
  const screenOnTop = onTopStickers.filter((s) => s.screen);
  const occBase = (sx: number, sy: number, into: Float32Array) => { const b = rawSample(sx, sy); into[0] = b[0]; into[1] = b[1]; into[2] = b[2]; };
  const overOverlay = normalOnTop.length && opts.stickerAssets
    ? makeStickerOverlaySampler(srcW, srcH, normalOnTop, opts.stickerAssets, stkOcc, rot * 90, occBase) : null;
  const screenOverlay = screenOnTop.length && opts.stickerAssets
    ? makeStickerOverlaySampler(srcW, srcH, screenOnTop, opts.stickerAssets, stkOcc, rot * 90, occBase) : null;
  const ovTmp = new Float32Array(4);
  /** Blend both on-top overlays into the finished display pixel `out` (over, then
   *  screen), identical to the shader's two overlay passes. */
  const applyOnTop = (sx: number, sy: number) => {
    if (overOverlay) {
      overOverlay(sx, sy, ovTmp);
      const a = ovTmp[3];
      if (a > 0) { out[0] = out[0] * (1 - a) + ovTmp[0] * a; out[1] = out[1] * (1 - a) + ovTmp[1] * a; out[2] = out[2] * (1 - a) + ovTmp[2] * a; }
    }
    if (screenOverlay) {
      screenOverlay(sx, sy, ovTmp);
      const a = ovTmp[3];
      if (a > 0) { out[0] = 1 - (1 - out[0]) * (1 - ovTmp[0] * a); out[1] = 1 - (1 - out[1]) * (1 - ovTmp[1] * a); out[2] = 1 - (1 - out[2]) * (1 - ovTmp[2] * a); }
    }
  };
  // Warp remaps the source at the VERY TOP (before denoise), mirroring the
  // shader's fetchLin warp — both bilinear-sample the same encoded field.
  const warped = params.warp && !warpIsEmpty(params.warp)
    ? warpSampler(composed, params.warp, srcW, srcH)
    : composed;
  // The live preview runs denoise/detail on a DOWNSCALED proxy (RAW: a half-res
  // bin; big 8-bit: toPreview's <=2800px copy) and the GPU taps in proxy texels,
  // so at native resolution the denoise and TEXTURE kernels tap `proxyFactor`
  // native pixels apart to reproduce the footprint the user previewed and tuned.
  // The factor is a property of the source, so single and batch exports agree.
  // Kept in sync with main.ts MAX_PREVIEW (8-bit proxy) and demosaic.ts binning
  // (RAW = half-res).
  // CAPTURE SHARPENING IS THE EXCEPTION (2026-10-02): it restores the lens,
  // filter and demosaic blur, which is measured in SENSOR pixels, so here it
  // runs at native resolution with one-pixel taps (pitch 1) and the preview
  // approximates it — see raw/detail.ts. Spaced `proxyFactor` apart it had no
  // response at the sensor's Nyquist and never touched the finest detail.
  const proxyFactor = proxyFactorFor(src, srcW, srcH);
  // Denoise first, then sharpen/texture — the same order the shader runs them,
  // and detail's high-pass is measured from the DENOISED picture (the shader's
  // luminance pre-pass, u_detailTex). Both are no-ops when their slider is 0, so
  // a plain edit keeps the 1x-decode fast path.
  // AIMED, WHERE A MASK SAYS SO (decision 030). The flattened active groups are
  // the same list and order the shader indexes, taken here rather than reaching
  // into compileEdit's, because these pre-passes are composed before it runs.
  const aimGroups = maskGroupsForRender(params.masks);
  const denoised = makeRowDenoiser(warped, srcW, srcH, params.denoise, proxyFactor, params.chroma ?? 0, params.despeckle ?? 0);
  // Back toward `warped` — the pixel as it ARRIVED, before the despeckle median
  // as well as the bilateral, because both are inside AIM_NOISE and the shader
  // mixes toward the same pre-despeckle value. See AIM_NOISE.
  const noiseAimed = aimedSampler(warped, denoised, aimGroups, AIM_NOISE, srcW, srcH);
  const detailed = makeRowDetail(noiseAimed, srcW, srcH, params.sharpen ?? 0, params.texture ?? 0, proxyFactor, 1);
  // Back toward the sampler detail was GIVEN, not toward `warped`: detail's
  // base is the denoise result, so holding it back must restore that and not
  // undo the denoise with it.
  const sampleLinear = aimedSampler(noiseAimed, detailed, aimGroups, AIM_TEXTURE, srcW, srcH);
  // THE SKY MAP, from THE SAME PRE-PASSED SAMPLER the pixels come through — not
  // the raw source. Built from the raw source it targeted a sky 16% more
  // saturated than the rendered one (skymap.ts has the numbers), because the
  // bilateral lowers a noisy sky's chroma and a raw render does not know that.
  // Built here rather than handed in, so a worker band and the main thread each
  // derive it from the same sampler and the same params. Skipped when the
  // amount is off or no sky was found, which is what makes it cost nothing on
  // the frames that do not need it.
  const skyMap = ((params.skySmooth ?? 0) > 0 || ((params.skyDepth ?? 0) > 0 && skyFine)) && sky
    ? buildSkyMap(sampleLinear, srcW, srcH, params, "cfa" in src ? src.cam : undefined, srcW / srcH, localMap, gradeLens, sky, flat, params.warp)
    : null;
  // A raw's pixels already carry the flat (above), so the grade gets no curve
  // for it; an 8-bit source still takes it here. The flat itself goes in as
  // `srcFlat`, so highlight recovery reads each pixel's clip as the sensor
  // recorded it — the same division the preview's shader makes.
  const edit = compileEdit(params, "cfa" in src ? src.cam : undefined, srcW / srcH, localMap, gradeLens, skyMap, skyFine ?? null, flat);
  // Scaled exports (50% / 25%) BOX-FILTER instead of decimating: each output
  // pixel averages an ss×ss grid of source taps placed in OUTPUT space and
  // mapped through toSrcF — so the filter stays correct under crop, rotation,
  // straighten and flip alike (a source-space rect would shear under a
  // straighten angle). Averaging happens on LINEAR light, which is the
  // physically correct anti-aliasing; the edit then runs once per OUTPUT
  // pixel on the averaged sample. Full-size exports keep the 1-tap fast path.
  const ss = opts.scale < 1 ? Math.max(2, Math.min(4, Math.round(1 / opts.scale))) : 1;
  const boxN = ss * ss;
  const boxOut: [number, number, number] = [0, 0, 0];
  // STRAIGHTEN RESAMPLES BILINEARLY, as the preview does (gl.ts bindPipeline
  // turns the source texture LINEAR whenever straighten is on). A rotated
  // output grid never lands on source pixel centres, and until 2026-10-02 this
  // took the nearest one (the Math.floor in toSrcF) — a nearest-neighbour
  // rotation, jagged on every straight edge, in both the preview and the file.
  // darktable's rotation (clipping/ashift) interpolates the same way. Without
  // straighten the grid IS the source's, and the one-tap path stays exact.
  const lerpOut: [number, number, number] = [0, 0, 0];
  const tap = (p: Float64Array): ArrayLike<number> =>
    straighten !== 0 ? bilinearTap(sampleLinear, srcFrac[0], srcFrac[1], srcW, srcH, lerpOut) : sampleLinear(p[0], p[1]);
  const sampleBox = (x: number, y: number): ArrayLike<number> => {
    if (ss === 1) {
      const p = toSrc(x, y);
      return tap(p);
    }
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < ss; j++) {
      for (let i = 0; i < ss; i++) {
        const p = toSrcF((x + (i + 0.5) / ss) / w, (y + (j + 0.5) / ss) / h);
        const s = tap(p);
        r += s[0]; g += s[1]; b += s[2];
      }
    }
    boxOut[0] = r / boxN; boxOut[1] = g / boxN; boxOut[2] = b / boxN;
    return boxOut;
  };

  // HIE glow map at full resolution (cheap: built on a coarse grid).
  const gmap = params.glow > 0 ? buildGlowMap(mapSample, srcW, srcH) : null;
  // WHERE A PIXEL CAME FROM under the warp, as image-uv: the glow and the
  // clarity/dehaze maps are built from the UNWARPED source, so they are read at
  // the displaced position — the shader's warpUv(v_uv) — or a pushed highlight
  // leaves its glow behind and warped content takes another place's local mean
  // and haze (2026-10-02). Written into `mapUv`, once per output pixel.
  const warpF = params.warp && !warpIsEmpty(params.warp) ? params.warp : null;
  const mapUv = new Float32Array(2);
  const warpD = new Float32Array(2);
  const mapAt = (sx: number, sy: number) => {
    const u = (sx + 0.5) / srcW, v = (sy + 0.5) / srcH;
    if (warpF) { sampleWarp(warpF, u, v, warpD); mapUv[0] = u + warpD[0]; mapUv[1] = v + warpD[1]; }
    else { mapUv[0] = u; mapUv[1] = v; }
  };
  const glowAt = () =>
    gmap ? params.glow * GLOW_GAIN * sampleGlow(gmap, mapUv[0], mapUv[1]) : 0;

  // When rotated 90/270, the outer loop follows output COLUMNS so that source
  // rows stay constant per pass (keeps the denoiser's row cache effective).
  const outerN = rot & 1 ? w : h;
  const innerN = rot & 1 ? h : w;

  // THE BAND IS A RECTANGLE OF THE PICTURE, cut along whichever axis the loops
  // below run: rows normally, columns under a quarter-turn. Without a band
  // these are the whole frame and every index below is the plain one.
  //
  // HOISTED ABOVE THE FORMAT BRANCH 2026-09-20, because it belongs to both.
  // It used to live inside the JPEG branch with a comment saying TIFF is "the
  // print-master path, rarely used and enormous either way" — and that
  // sentence was the whole reason a TIFF export ran on one core while eight
  // workers sat idle. One rectangle, defined once, so the two formats cannot
  // disagree about what a band is.
  const from = opts.band ? opts.band.from : 0;
  const to = opts.band ? Math.min(opts.band.to, outerN) : outerN;
  const bandX0 = rot & 1 ? from : 0;
  const bandY0 = rot & 1 ? 0 : from;
  const bandW = rot & 1 ? to - from : w;
  const bandH = rot & 1 ? h : to - from;

  if (opts.format === "jpeg") {
    // JPEG saves as DISPLAY P3: every final display colour is re-expressed in
    // P3 (srgbDisplayToP3Display) and the matching P3 profile is embedded
    // below — the pair MUST land together or colors shift. Same appearance as
    // the preview by construction (sRGB is a subset of P3); the wide-gamut
    // container is what Apple devices shoot and share natively.
    // ONE BAND'S WORTH when a band was asked for — its own rows, in its own
    // coordinates, so a worker holds a slice of the picture rather than a whole
    // copy of it. The rectangle is worked out above the branch; both formats
    // use the same one.
    // NOT ALLOCATED UNTIL IT IS KNOWN WHO FILLS IT. The pool returns the
    // finished picture as its own buffer, so allocating one here first meant
    // holding two full-size copies for the length of the stitch and throwing
    // the untouched one away — about 126 MB of it on a 21-megapixel frame,
    // spent at the exact moment the export is nearest whatever ceiling this
    // device has. The single-threaded loop still needs one, so it is made
    // below, once the pool has had its chance.
    let data: Uint8ClampedArray<ArrayBuffer> | null = null;
    const p3 = new Float32Array(3);
    __a = performance.now();
    // SEVERAL CORES, WHEN THIS EXPORT CAN USE THEM. The bands run the same code
    // this loop runs — the workers call straight back into this function — so
    // there is no second pipeline to drift. A worker that fails for any reason
    // falls through to the loop below rather than failing the export: the
    // reader asked for a photograph, not for a particular number of threads.
    // WHAT A THREAD WOULD COST, handed to the decision: the file is copied per
    // worker, the sensor data is decoded per worker, and each holds its band.
    // WHAT THE PATCHES WEIGH, per worker — every worker bakes every one of them
    // from its own copy of the source, so this is what the budget has to know
    // now that a healed frame is allowed through the pool at all.
    const job = { fileBytes: file.bytes.length, srcPixels: srcW * srcH, outPixels: w * h, healBytes: healPatchBytes(params.spots, srcW, srcH) };
    let ranParallel = false;
    if (canRunParallel(params, opts, job)) {
      try {
        const split = await exportBands(
          file,
          // A MOSAICED RAW IS RE-READ FROM THE FILE by every worker, so the
          // preview decode is dead weight on the wire — tens of megabytes
          // copied per worker for pixels `getSource` will not look at. Sent
          // whole only when the decode IS the source (JPEG, HEIC, a preview,
          // and a lossy-linear DNG, whose tiles only the browser can decode, so
          // its codes travel), which is `sourceIsMosaiced`'s test.
          sourceIsMosaiced(file) ? { width: current.width, height: current.height, isRaw: current.isRaw } : forTheWire(current),
          params, opts, lens ?? null, sky ?? null, skyFine ?? null, w, h, job, onProgress);
        // The JPEG path asked for 8-bit bands, so 8-bit bands are what came
        // back; the check is here rather than assumed because `exportBands`
        // now returns one of two shapes and a missing buffer must fall through
        // to the single-threaded loop rather than export a black photograph.
        if (!split.data) throw new Error("the workers returned no pixels");
        data = split.data;
        __t.threads = split.threads;
        ranParallel = true;
      } catch (err) {
        __t.fallback = String((err as Error)?.message ?? err);
        console.warn("parallel export failed, falling back to one thread:", err);
      }
    }
    // DECIDED, either way — whether the pool ran or the export fell through to
    // the loop below, the number is now known and the strip can stop guessing.
    if (!opts.raw) { liveThreads = __t.threads; liveFallback = __t.fallback ?? null; }
    // ADOPTED ABOVE, OR MADE HERE — never both.
    data ??= new Uint8ClampedArray(bandW * bandH * 4);
    for (let oIdx = ranParallel ? to : from; oIdx < to; oIdx++) {
      if (oIdx % 16 === 0) {
        onProgress?.((oIdx - from) / Math.max(1, to - from));
        const __tk = performance.now();
        await tick();
        __t.yields++;
        __t.yieldMs += performance.now() - __tk;
      }
      for (let iIdx = 0; iIdx < innerN; iIdx++) {
        const x = rot & 1 ? oIdx : iIdx;
        const y = rot & 1 ? iIdx : oIdx;
        const p = toSrc(x, y);
        const sx = p[0], sy = p[1];
        const s = sampleBox(x, y); // box-filtered when scaled (see above)
        mapAt(sx, sy);
        edit(s[0], s[1], s[2], out, glowAt(), (sx + 0.5) / srcW, (sy + 0.5) / srcH, mapUv[0], mapUv[1]);
        applyOnTop(sx, sy); // on-top stickers over the finished look, before grain (matches the shader)
        finishPixel(x, y); // creative vignette + grain, still in sRGB display space
        srgbDisplayToP3Display(out[0], out[1], out[2], p3);
        const o = ((y - bandY0) * bandW + (x - bandX0)) * 4;
        data[o] = p3[0] * 255;
        data[o + 1] = p3[1] * 255;
        data[o + 2] = p3[2] * 255;
        data[o + 3] = 255;
      }
    }
    onProgress?.(1);
    __mark("pixels", __a);
    __a = performance.now();
    // A WORKER STOPS HERE. The watermark, the canvas, the encoder and the
    // metadata all belong to the whole picture, and the whole picture is the
    // main thread's to assemble.
    if (opts.raw) return { band: { from, to }, axis: rot & 1 ? "columns" : "rows", data, width: bandW, height: bandH };
    if (opts.watermark) {
      // Blend the practice-photo corner mark into the P3 pixels directly
      // (its layer colours converted to P3 too) — drawing the sRGB-intent
      // layer onto already-P3 bytes with drawImage would mislabel the mark.
      const wm = await makeWatermarkLayer(w, h);
      if (wm) {
        const lw = wm.canvas.width, lh = wm.canvas.height;
        const ld = wm.canvas.getContext("2d")!.getImageData(0, 0, lw, lh).data;
        const wp = new Float32Array(3);
        for (let y = 0; y < lh; y++) {
          for (let x = 0; x < lw; x++) {
            const li = (y * lw + x) * 4;
            const a = ld[li + 3] / 255;
            if (a === 0) continue;
            srgbDisplayToP3Display(ld[li] / 255, ld[li + 1] / 255, ld[li + 2] / 255, wp);
            const o = ((wm.y + y) * w + (wm.x + x)) * 4;
            data[o] = data[o] * (1 - a) + wp[0] * 255 * a;
            data[o + 1] = data[o + 1] * (1 - a) + wp[1] * 255 * a;
            data[o + 2] = data[o + 2] * (1 - a) + wp[2] * 255 * a;
          }
        }
        // The mark's own surface counts against the same page-wide total the
        // export's does, and it is finished with the moment its pixels are read.
        releaseCanvas(wm.canvas);
      }
    }
    __mark("watermark", __a);
    __a = performance.now();
    // THE DRAWING SURFACE, AND THE TWO WAYS A BROWSER REFUSES ONE WITHOUT
    // SAYING SO.
    //
    // Safari caps a surface by AREA, and the cap is VERSION-DEPENDENT: the 2022
    // reproductions put it at 16,777,216 pixels (4096 x 4096), current WebKit
    // allows 8192 x 8192 = 67,108,864 on iOS and 16384 x 16384 elsewhere
    // (CanvasBase.cpp maxCanvasArea). Older versions also capped the TOTAL
    // across every surface the page held (384 MB on Safari 15), past which
    // `getContext("2d")` returned null and surfaces drew transparent, and kept
    // a surface alive after the last reference to it was gone; current WebKit's
    // canvas code has no total check. Nothing here budgets against either
    // figure: this asks for the surface, checks what came back, and releases
    // it with the documented 1x1 clear, whichever Safari it is running on.
    //
    // BOTH FAILURES LOOK LIKE SUCCESS. The old code asserted the context
    // non-null with a `!`, so a refusal became a TypeError with no bearing on
    // what went wrong, and a transparent draw became a blank photograph
    // reported as a finished export. What the reader gets now is a sentence
    // naming the limit and the size that hit it.
    //
    // The ceilings themselves are measured on the device rather than assumed —
    // `theCanvasTheExportUses` on the test page asks both questions and prints
    // what this device actually gives.
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cctx = canvas.getContext("2d");
    if (!cctx) {
      releaseCanvas(canvas);
      throw new Error(
        `This browser would not give the export a drawing surface ${w} by ${h} (${((w * h) / 1e6).toFixed(1)} megapixels). ` +
        `Export at a smaller size, or close other photographs first.`);
    }
    let blob: Blob | null;
    try {
      cctx.putImageData(new ImageData(data, w, h), 0, 0);
      blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", opts.quality));
    } finally {
      // RELEASED WHETHER OR NOT THE ENCODE WORKED. A failed export that leaves
      // its surface behind makes the next one likelier to fail as well, which
      // is how one refusal becomes a session of them.
      releaseCanvas(canvas);
    }
    if (!blob) throw new Error("JPEG encoding failed.");
    __mark("encode", __a);
    __a = performance.now();
    // canvas.toBlob passes our pixel values through unconverted (putImageData
    // values are canvas-space), but it may tag them: Chromium 141 writes an
    // sRGB profile. embedIccInJpeg replaces any such profile with the Display
    // P3 one so viewers read them as written. Then the honest EXIF subset
    // (capture date, camera, lens, exposure — freshly built, never GPS or
    // orientation), then the traveling recipe, when asked for.
    let tagged = embedIccInJpeg(new Uint8Array(await blob.arrayBuffer()), DISPLAY_P3_ICC);
    const exif = readExifSubset(file.bytes);
    if (exif) tagged = embedExifInJpeg(tagged, buildExifApp1(exif)); // lands BEFORE the ICC (convention)
    if (opts.lookRecipe) tagged = embedLookInJpeg(tagged, opts.lookRecipe);
    __mark("tag", __a);
    __t.megapixels = (w * h) / 1e6;
    __t.total = performance.now() - __start;
    lastProfile = __t;
    return { blob: new Blob([tagged.buffer as ArrayBuffer], { type: "image/jpeg" }), name: `${baseName}.jpg` };
  } else {
    // ONE BAND'S WORTH, exactly as the JPEG path does it — three channels of
    // sixteen bits rather than four of eight, which is the only difference
    // between the two loops and is six bytes a pixel against four. That
    // difference is billed in `perWorkerMb`, because the thread budget decides
    // how many workers may start and a band it thinks weighs two thirds of its
    // real size is a killed tab on a tablet.
    // NOT ALLOCATED UNTIL IT IS KNOWN WHO FILLS IT. The pool returns the
    // finished picture as its own buffer, so allocating one here first meant
    // holding two full-size copies for the length of the stitch and throwing
    // the untouched one away — about 126 MB of it on a 21-megapixel frame,
    // spent at the exact moment the export is nearest whatever ceiling this
    // device has. The single-threaded loop still needs one, so it is made
    // below, once the pool has had its chance.
    let rgb: Uint16Array<ArrayBuffer> | null = null;
    __a = performance.now();
    // SEVERAL CORES, when this export can use them — the same call the JPEG
    // path makes, with the same fall-through on any failure: the reader asked
    // for a photograph, not for a particular number of threads.
    const jobT = { fileBytes: file.bytes.length, srcPixels: srcW * srcH, outPixels: w * h, healBytes: healPatchBytes(params.spots, srcW, srcH) };   // see the JPEG branch
    let ranParallelT = false;
    if (canRunParallel(params, opts, jobT)) {
      try {
        const split = await exportBands(
          file,
          sourceIsMosaiced(file) ? { width: current.width, height: current.height, isRaw: current.isRaw } : forTheWire(current),
          params, opts, lens ?? null, sky ?? null, skyFine ?? null, w, h, jobT, onProgress);
        if (!split.rgb) throw new Error("the workers returned no 16-bit pixels");
        rgb = split.rgb;   // ADOPTED, not copied into a buffer made in advance
        __t.threads = split.threads;
        ranParallelT = true;
      } catch (err) {
        __t.fallback = String((err as Error)?.message ?? err);
        console.warn("parallel TIFF export failed, falling back to one thread:", err);
      }
    }
    if (!opts.raw) { liveThreads = __t.threads; liveFallback = __t.fallback ?? null; } // see the JPEG branch above
    rgb ??= new Uint16Array(bandW * bandH * 3);   // adopted above, or made here
    for (let oIdx = ranParallelT ? to : from; oIdx < to; oIdx++) {
      if (oIdx % 16 === 0) {
        onProgress?.((oIdx - from) / Math.max(1, to - from));
        await tick();
      }
      for (let iIdx = 0; iIdx < innerN; iIdx++) {
        const x = rot & 1 ? oIdx : iIdx;
        const y = rot & 1 ? iIdx : oIdx;
        const p = toSrc(x, y);
        const sx = p[0], sy = p[1];
        const s = sampleBox(x, y); // box-filtered when scaled (see above)
        mapAt(sx, sy);
        edit(s[0], s[1], s[2], out, glowAt(), (sx + 0.5) / srcW, (sy + 0.5) / srcH, mapUv[0], mapUv[1]);
        applyOnTop(sx, sy); // on-top stickers over the finished look, before grain (matches the shader)
        finishPixel(x, y); // creative vignette + grain, same as the JPEG path
        const o = ((y - bandY0) * bandW + (x - bandX0)) * 3;
        // CLAMPED BEFORE THE 16-BIT WRITE. A Uint16Array wraps: 1.01 stores as
        // 0.01 and −0.02 as 0.98. The JPEG path never had this because
        // Uint8ClampedArray clamps for it, and the preview's framebuffer
        // clamps for the screen — so a stage that let a channel drift a
        // hundredth past the range corrupted TIFF exports alone, invisibly
        // everywhere else (measured 2026-09-18: yellow-green sky and cyan
        // branches, 13,809 pixels of one export a full chroma range off). Every
        // stage now clamps its own output too; this is the floor under them.
        rgb[o] = Math.min(1, Math.max(0, out[0])) * 65535 + 0.5; // round — truncation biased the 16-bit output low
        rgb[o + 1] = Math.min(1, Math.max(0, out[1])) * 65535 + 0.5;
        rgb[o + 2] = Math.min(1, Math.max(0, out[2])) * 65535 + 0.5;
      }
    }
    onProgress?.(1);
    __mark("pixels", __a);
    __a = performance.now();
    // A WORKER STOPS HERE, the same place the JPEG path stops: the watermark,
    // the file header and the metadata all belong to the whole picture, and the
    // whole picture is the main thread's to assemble.
    if (opts.raw) return { band: { from, to }, axis: rot & 1 ? "columns" : "rows", rgb, width: bandW, height: bandH };
    if (opts.watermark) {
      // Same layer as the JPEG path, alpha-blended into the 16-bit buffer in
      // display space (the canvas layer and these pixels share the same gamma).
      const wm = await makeWatermarkLayer(w, h);
      if (wm) {
        const lw = wm.canvas.width, lh = wm.canvas.height;
        const ld = wm.canvas.getContext("2d")!.getImageData(0, 0, lw, lh).data;
        for (let y = 0; y < lh; y++) {
          for (let x = 0; x < lw; x++) {
            const li = (y * lw + x) * 4;
            const a = ld[li + 3] / 255;
            if (a === 0) continue;
            const o = ((wm.y + y) * w + (wm.x + x)) * 3;
            rgb[o] = rgb[o] * (1 - a) + ld[li] * 257 * a + 0.5;
            rgb[o + 1] = rgb[o + 1] * (1 - a) + ld[li + 1] * 257 * a + 0.5;
            rgb[o + 2] = rgb[o + 2] * (1 - a) + ld[li + 2] * 257 * a + 0.5;
          }
        }
        releaseCanvas(wm.canvas);   // see the JPEG path above
      }
    }
    // THE WATERMARK IS THE WATERMARK, and it was billed to `encode` here while
    // `encode` itself measured nothing — the two stages were one mark apart and
    // the wrong one was named. The JPEG branch a hundred lines above marks the
    // same loop as `watermark`, which is how a report that showed a TIFF
    // spending a second on "encode" was describing the watermark instead.
    __mark("watermark", __a);
    __a = performance.now();
    // AND THE FILE IS WRITTEN BEFORE THE CLOCK STOPS. `writeTiff16` used to sit
    // inside the `return`, which is evaluated AFTER `__t.total`, so the one
    // stage this branch is named for was outside the total and reported 0.0s —
    // on a 31 MB file. The stages are documented as adding up to the total, and
    // they could not.
    const tiff = writeTiff16(rgb, w, h, SRGB_ICC, readExifSubset(file.bytes) ?? undefined);
    __mark("encode", __a);
    // THE REPORT COULD NOT SEE A TIFF EXPORT AT ALL, and that is why a device
    // report showing "17.6 MP in 27.5s on 8 threads" sat next to a complaint
    // that TIFF runs on one thread and read as a contradiction: the line was a
    // JPEG's, because the TIFF path had never once written a profile. Three
    // lines the JPEG branch has had all along, missing here — so "Last export"
    // said "none this session" after a TIFF however long it had taken.
    __t.megapixels = (w * h) / 1e6;
    __t.total = performance.now() - __start;
    lastProfile = __t;
    return { blob: new Blob([tiff], { type: "image/tiff" }), name: `${baseName}.tif` };
  }
}

/**
 * The bilinear blend of a sampler at a fractional pixel position — the same
 * four taps and weights a LINEAR, CLAMP_TO_EDGE texture lookup takes.
 * @param sample  the source, read at integer pixels; the array it returns may
 *   be REUSED by its next call (LinearSampler's contract), so each corner is
 *   read out before the next is asked for.
 * @param fx      x in pixel units with pixel centres on the integers
 *   (u * width - 0.5).
 * @param fy      y, likewise.
 * @param w       the source's width; corners are clamped into [0, w - 1].
 * @param h       the source's height; corners are clamped into [0, h - 1].
 * @param out     where the result is written.
 * @returns `out`, holding the blend of the four pixels around (fx, fy).
 * What the result must satisfy: at an integer (fx, fy) it is exactly that
 *   pixel, and anywhere it equals the shader's `textureLod` of a LINEAR source
 *   texture at the same uv to within the GPU's filter precision — the export's
 *   straighten is the preview's (exportImage's `tap`).
 */
export function bilinearTap(sample: LinearSampler, fx: number, fy: number, w: number, h: number, out: [number, number, number]): [number, number, number] {
  const x0f = Math.floor(fx), y0f = Math.floor(fy);
  const tx = fx - x0f, ty = fy - y0f;
  const cx = (v: number) => (v < 0 ? 0 : v > w - 1 ? w - 1 : v);
  const cy = (v: number) => (v < 0 ? 0 : v > h - 1 ? h - 1 : v);
  const x0 = cx(x0f), x1 = cx(x0f + 1), y0 = cy(y0f), y1 = cy(y0f + 1);
  const w00 = (1 - tx) * (1 - ty), w10 = tx * (1 - ty), w01 = (1 - tx) * ty, w11 = tx * ty;
  let s = sample(x0, y0);
  let r = s[0] * w00, g = s[1] * w00, b = s[2] * w00;
  s = sample(x1, y0);
  r += s[0] * w10; g += s[1] * w10; b += s[2] * w10;
  s = sample(x0, y1);
  r += s[0] * w01; g += s[1] * w01; b += s[2] * w01;
  s = sample(x1, y1);
  r += s[0] * w11; g += s[1] * w11; b += s[2] * w11;
  out[0] = r; out[1] = g; out[2] = b;
  return out;
}

/** Exported so the drawn-export path reads its source through THE SAME
 *  function — the one place that decides what a file's pixels actually are. */
/** HOW MANY NATIVE PIXELS ONE PREVIEW TEXEL SPANS — the one place that answers
 *  it, because three paths need the same answer: the computed export spaces its
 *  neighbourhood taps this far apart, a drawn export scales the shader's taps by
 *  it, and a batch export has to agree with a single one. Kept in sync with
 *  main.ts MAX_PREVIEW (8-bit proxy) and demosaic.ts binning (RAW = half-res).
 *  An 8-bit source is now shown at full size wherever the browser gives the
 *  drawing buffer (main.ts toPreview), with its taps scaled by this same
 *  factor, so the footprint a reader tuned is unchanged by that. */
export function proxyFactorFor(src: Source, srcW: number, srcH: number): number {
  const PREVIEW_MAX = 2800;
  return "cfa" in src ? 2 : Math.max(1, Math.max(srcW, srcH) / PREVIEW_MAX);
}

/** WILL THIS EXPORT RE-READ THE FILE rather than use the decode on screen?
 *
 *  The same test `getSource` makes, without doing any of the reading: a NEF
 *  always, a DNG when its raw image is one `readDngRaw` reads straight from the
 *  bytes (a mosaic, or LinearRaw uncompressed or lossless). A LOSSY LinearRaw
 *  DNG answers false: it is still a raw source, but its tiles need the
 *  browser's decoder, so its codes ride on the decoded frame and the frame
 *  must be kept. It matters to the caller because a re-read export needs
 *  nothing from the decoded frame but its size, so holding that frame for the
 *  length of an export keeps ~84 MB of half-resolution float alive for no
 *  reason — and the app's memory envelope is the one that already forced the
 *  full-resolution working copy off.
 *  @param file  the photograph being exported.
 *  @returns true when getSource will read the file itself; false when it needs
 *    the decoded frame (main.ts keeps the frame, exportBands posts it). */
export function sourceIsMosaiced(file: ImportedFile): boolean {
  try {
    if (file.kind === "nef") return true;
    if (file.kind === "dng" || file.kind === "tiff") {
      const kind = findDngRaw(new Tiff(file.bytes).allIfds()).kind;
      return kind === "cfa" || kind === "linear";
    }
  } catch {
    /* unreadable metadata — treat it as the safe answer and keep the frame */
  }
  return false;
}

/**
 * The full-resolution source an export reads its pixels from.
 * @param file  the photograph.
 * @param current  its decoded frame; read only for a source the file cannot
 *   give back by itself (8-bit pixels, a lossy DNG's codes).
 * @returns `{ cfa, cam }` for every raw — NEF, and any DNG raw image `findDngRaw`
 *   can read, LinearRaw included — built by the same functions as the preview
 *   (`readNefCfa`; decode.ts `readDngSource`), so the export's size, levels,
 *   crop and colour are the preview's; otherwise the decoded 8-bit pixels.
 *   Throws when neither exists.
 */
export function getSource(file: ImportedFile, current: DecodedImage): Source {
  if (file.kind === "nef") {
    const ifds = new Tiff(file.bytes).allIfds();
    return { cfa: readNefCfa(file.bytes), cam: camToSrgbLinear(nikonColorMatrix(cameraModel(ifds))) };
  }
  if (file.kind === "dng" || file.kind === "tiff") {
    const ifds = new Tiff(file.bytes).allIfds();
    const found = findDngRaw(ifds);
    if (found.kind) return readDngSource(file.bytes, ifds, found, current.lossyCodes);
  }
  // Non-raw (JPEG/PNG/preview): the decode is already full-resolution 8-bit.
  if (!current.pixels) throw new Error("No full-resolution source available to export.");
  return { pixels: current.pixels, width: current.width, height: current.height };
}

/**
 * A 16-bit RGB TIFF: 16 bits a channel, uncompressed, single strip, with an
 * embedded ICC profile (tag 34675) so the output is never untagged — plus the
 * honest EXIF subset (capture date, camera, lens, exposure) when the source
 * carried one. Freshly built tags, never a copied block: GPS and Orientation
 * structurally cannot ride along.
 *
 * NOT "baseline". This was called a minimal baseline TIFF until 2026-10-02,
 * and it is neither: TIFF 6.0's Baseline RGB image is BitsPerSample 8,8,8, so
 * sixteen bits a channel is an extension every serious reader supports; and
 * section 6 lists XResolution (282), YResolution (283) and ResolutionUnit
 * (296) as REQUIRED for an RGB image, which this never wrote. They are written
 * now, as 72 pixels per inch — the conventional value for a file with no print
 * size, which a reader can change without touching a pixel.
 *
 * @param rgb  the pixels, w*h*3 unsigned 16-bit samples, row-major RGB.
 * @param w    width in pixels.
 * @param h    height in pixels.
 * @param icc  the ICC profile describing those samples (default SRGB_ICC:
 *   sRGB primaries and the piecewise sRGB curve, which is the encode the
 *   pipeline's display output and so the TIFF's samples carry).
 * @param exif the subset read from the original, or undefined to write none.
 * @returns the whole file. What it must satisfy: IFD0's tags ascend by ID
 *   (TIFF requires it; the EXIF extras interleave with the image tags), every
 *   field TIFF 6.0 section 6 requires for an RGB image is present, and the
 *   pixel data starts at an even offset (the Uint16Array view needs it).
 */
export function writeTiff16(rgb: Uint16Array, w: number, h: number, icc: Uint8Array = SRGB_ICC, exif?: ExifSubset): ArrayBuffer {
  // Resolution rides the same out-of-line path as the EXIF strings, so the
  // offsets and the entry count below cannot forget it.
  const res = (tag: number): TiffEntry => ({ tag, typ: 5, cnt: 1, data: [72, 0, 0, 0, 1, 0, 0, 0] }); // 72/1
  const ifd0Extra: TiffEntry[] = [
    res(282), // XResolution
    res(283), // YResolution
    { tag: 296, typ: 3, cnt: 1, inline: 2 }, // ResolutionUnit: inch
    ...(exif ? ifd0ExtraEntries(exif) : []),
  ].sort((a, b) => a.tag - b.tag);
  // ColorSpace sRGB when the profile is the sRGB one, as it always is today.
  const exifIfd: TiffEntry[] = exif ? exifIfdEntries(exif, icc === SRGB_ICC ? 1 : 0xffff) : [];
  const entries = 12 + ifd0Extra.length + (exifIfd.length ? 1 : 0);
  const ifdOffset = 8;
  const ifdSize = 2 + entries * 12 + 4;
  const bitsOffset = ifdOffset + ifdSize; // 3 shorts
  const sampleFmtOffset = bitsOffset + 6; // 3 shorts
  // IFD0 external strings, then the Exif IFD + its externals, then pixels
  // (dataOffset must stay EVEN for the Uint16Array view), then the ICC.
  const strOffset = sampleFmtOffset + 6;
  const strBytes = externSize(ifd0Extra);
  const exifIfdOffset = strOffset + strBytes;
  const exifIfdBytes = exifIfd.length ? 2 + exifIfd.length * 12 + 4 + externSize(exifIfd) : 0;
  const dataOffset = (exifIfdOffset + exifIfdBytes + 1) & ~1;
  const dataBytes = w * h * 3 * 2;
  const iccOffset = dataOffset + dataBytes; // ICC bytes appended after pixels
  const buf = new ArrayBuffer(iccOffset + icc.length);
  const dv = new DataView(buf);
  const u8 = new Uint8Array(buf);
  // Header (little-endian).
  dv.setUint16(0, 0x4949, true);
  dv.setUint16(2, 42, true);
  dv.setUint32(4, ifdOffset, true);
  dv.setUint16(ifdOffset, entries, true);

  let p = ifdOffset + 2;
  let ext = strOffset; // running out-of-line cursor (IFD0 strings, then Exif's)
  const entry = (e: TiffEntry) => {
    dv.setUint16(p, e.tag, true);
    dv.setUint16(p + 2, e.typ, true);
    dv.setUint32(p + 4, e.cnt, true);
    if (e.data && e.data.length > 4) {
      dv.setUint32(p + 8, ext, true);
      u8.set(e.data, ext);
      ext += e.data.length + (e.data.length % 2);
    } else if (e.data) {
      u8.set(e.data, p + 8); // remaining bytes stay zero
    } else if (e.typ === 3 && e.cnt === 1) {
      dv.setUint16(p + 8, e.inline ?? 0, true);
    } else {
      // LONG/UNDEFINED value, or an OFFSET (any type whose data is >4 bytes,
      // e.g. SHORT count 3) — always a full u32 field.
      dv.setUint32(p + 8, e.inline ?? 0, true);
    }
    p += 12;
  };
  const tag = (id: number, type: number, count: number, value: number) => entry({ tag: id, typ: type, cnt: count, inline: value });
  const SHORT = 3, LONG = 4, UNDEFINED = 7;
  // Tags MUST stay in ascending ID order — the EXIF extras interleave.
  const flush = (before: number) => {
    while (ifd0Extra.length && ifd0Extra[0].tag < before) entry(ifd0Extra.shift()!);
  };
  tag(256, LONG, 1, w); // ImageWidth
  tag(257, LONG, 1, h); // ImageLength
  tag(258, SHORT, 3, bitsOffset); // BitsPerSample -> [16,16,16]
  tag(259, SHORT, 1, 1); // Compression: none
  tag(262, SHORT, 1, 2); // Photometric: RGB
  flush(273); // Make (271) / Model (272)
  tag(273, LONG, 1, dataOffset); // StripOffsets
  tag(277, SHORT, 1, 3); // SamplesPerPixel
  tag(278, LONG, 1, h); // RowsPerStrip
  tag(279, LONG, 1, dataBytes); // StripByteCounts
  flush(284); // XResolution (282) / YResolution (283)
  tag(284, SHORT, 1, 1); // PlanarConfig: chunky
  flush(339); // ResolutionUnit (296) / Software (305) / DateTime (306)
  tag(339, SHORT, 3, sampleFmtOffset); // SampleFormat -> [1,1,1] unsigned
  if (exifIfd.length) tag(34665, LONG, 1, exifIfdOffset); // Exif IFD pointer
  tag(34675, UNDEFINED, icc.length, iccOffset); // ICC profile (InterColorProfile)
  dv.setUint32(p, 0, true); // next IFD = 0

  // The Exif IFD block (its externals follow it directly).
  if (exifIfd.length) {
    dv.setUint16(exifIfdOffset, exifIfd.length, true);
    let q = exifIfdOffset + 2;
    let ext2 = exifIfdOffset + 2 + exifIfd.length * 12 + 4;
    for (const e of exifIfd) {
      dv.setUint16(q, e.tag, true);
      dv.setUint16(q + 2, e.typ, true);
      dv.setUint32(q + 4, e.cnt, true);
      if (e.data && e.data.length > 4) {
        dv.setUint32(q + 8, ext2, true);
        u8.set(e.data, ext2);
        ext2 += e.data.length + (e.data.length % 2);
      } else if (e.data) {
        u8.set(e.data, q + 8);
      } else if (e.typ === 3) {
        dv.setUint16(q + 8, e.inline ?? 0, true);
      } else {
        dv.setUint32(q + 8, e.inline ?? 0, true);
      }
      q += 12;
    }
    dv.setUint32(q, 0, true);
  }

  for (let i = 0; i < 3; i++) {
    dv.setUint16(bitsOffset + i * 2, 16, true);
    dv.setUint16(sampleFmtOffset + i * 2, 1, true);
  }
  // Pixel data, little-endian 16-bit.
  const o = new Uint16Array(buf, dataOffset, w * h * 3);
  o.set(rgb);
  // ICC profile bytes.
  new Uint8Array(buf, iccOffset, icc.length).set(icc);
  return buf;
}

export { download, saveBlob } from "./savefile";
