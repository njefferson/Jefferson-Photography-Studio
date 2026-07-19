// Full-resolution export. Re-decodes raw at native resolution (the live view
// uses a half-res proxy), applies the exact edit pipeline on the CPU, and saves
// a JPEG or 16-bit TIFF to the device.

import { compileEdit, toLinear8, cropToDisplayUv, CROP_DEFAULT, applyCreativeVignette, applyGrain, grainCellPx, type EditParams } from "./pipeline";
import { demosaicPixelLinear, type RawCfa } from "./raw/demosaic";
import { readMosaicedCfa } from "./raw/dngRaw";
import { readNefCfa } from "./raw/nef";
import { Tiff } from "./raw/tiff";
import { camToSrgbLinear, NIKON_Z50_COLOR_MATRIX } from "./color";
import { makeRowDenoiser } from "./raw/denoise";
import { makeRowDetail } from "./raw/detail";
import { healPatches8, healPatchesFromSampler, wrapWithPatches } from "./heal";
import { stickerPatches, type StickerAsset } from "./sticker";
import { buildGlowMap, sampleGlow, GLOW_GAIN } from "./glow";
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
}

// --- Corner watermark for the bundled practice photos ------------------------
// (owner ask 2026-07-15). The teaching JPEGs carry a baked bottom-right mark;
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

type Source =
  | { cfa: RawCfa; cam: number[] }
  | { pixels: Uint8ClampedArray; width: number; height: number };

export interface ExportResult {
  blob: Blob;
  name: string;
}

/** Yield to the event loop so the progress UI can paint mid-export. */
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function exportImage(
  file: ImportedFile,
  current: DecodedImage,
  params: EditParams,
  opts: ExportOptions,
  onProgress?: (fraction: number) => void,
): Promise<ExportResult> {
  const src = getSource(file, current);
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
  // cropToDisplayUv, mirrored exactly), then the display rotation — same
  // mapping as the preview's vertex shader.
  const toSrcF = (tx: number, ty: number): [number, number] => {
    const [u, v] = cropToDisplayUv(tx, ty, crop, straighten, dispAspect);
    let iu = u, iv = v;
    if (rot === 1) { iu = v; iv = 1 - u; }
    else if (rot === 2) { iu = 1 - u; iv = 1 - v; }
    else if (rot === 3) { iu = 1 - v; iv = u; }
    // The source-space mirror — the INNERMOST op, matching the vertex shader.
    if (flip & 1) iu = 1 - iu;
    if (flip & 2) iv = 1 - iv;
    return [
      Math.min(srcW - 1, Math.max(0, Math.floor(iu * srcW))),
      Math.min(srcH - 1, Math.max(0, Math.floor(iv * srcH))),
    ];
  };
  const toSrc = (x: number, y: number): [number, number] => toSrcF((x + 0.5) / w, (y + 0.5) / h);

  // The matrix is applied inside the edit (after white balance), matching the
  // shader exactly so the export matches the preview.
  const baseName = file.name.replace(/\.[^.]+$/, "");

  // Camera-native linear RGB at a source pixel; denoise wraps the sampler so it
  // acts on linear data BEFORE white balance/exposure amplify the noise.
  const rawSample =
    "cfa" in src
      ? (x: number, y: number) => demosaicPixelLinear(src.cfa, x, y)
      : (x: number, y: number) => {
          const i = (y * src.width + x) * 4;
          return [toLinear8(src.pixels[i]), toLinear8(src.pixels[i + 1]), toLinear8(src.pixels[i + 2])] as [number, number, number];
        };
  // Aspect = SOURCE dims (the uv we pass below are source-space), so the lens
  // fix stays circular in pixels regardless of display rotation. The clarity/
  // dehaze maps are rebuilt from the full-res source (cheap: coarse grid).
  // NOTE the maps (and glow below) read the UNHEALED source: the preview's
  // maps are built from the pristine decode too, and a dust mote is invisible
  // to a coarse blurred map — healing must not force a map rebuild per spot.
  const localMap =
    (params.clarity ?? 0) !== 0 || (params.dehaze ?? 0) !== 0
      ? buildLocalMap(rawSample, srcW, srcH)
      : undefined;
  const edit = compileEdit(params, "cfa" in src ? src.cam : undefined, srcW / srcH, localMap);
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
  // Stickers wrap OUTSIDE heal — they composite over the healed source, exactly
  // as the preview bakes stickers on top of heals. Both samplers are LINEAR, so
  // one path serves RAW and 8-bit. Never touched when no stickers are placed.
  const stickers = (params.stickers ?? []).filter((s) => opts.stickerAssets?.[s.asset]);
  // Occlusion reads DISPLAY luminance — same exposure×WB (+ camera matrix for
  // RAW) the compileEdit start applies, so it matches the preview.
  const stkEx = params.exposure;
  const stkOcc = {
    wb: [params.wb[0] * stkEx, params.wb[1] * stkEx, params.wb[2] * stkEx] as [number, number, number],
    cam: "cfa" in src ? src.cam : null,
  };
  const composed = stickers.length && opts.stickerAssets
    ? wrapWithPatches(healed, stickerPatches(healed, srcW, srcH, stickers, opts.stickerAssets, stkOcc), srcH)
    : healed;
  // The live preview runs denoise/detail on a DOWNSCALED proxy (RAW: a half-res
  // bin; big 8-bit: toPreview's <=2800px copy) and the GPU taps in proxy texels,
  // so at native resolution the kernels must tap `proxyFactor` native pixels
  // apart to reproduce the footprint the user previewed and tuned — otherwise
  // export sharpens ~2x finer structure than the preview showed. The factor is a
  // property of the source, so single and batch exports agree. Kept in sync with
  // main.ts MAX_PREVIEW (8-bit proxy) and demosaic.ts binning (RAW = half-res).
  const PREVIEW_MAX = 2800;
  const proxyFactor = "cfa" in src ? 2 : Math.max(1, Math.max(srcW, srcH) / PREVIEW_MAX);
  // Denoise first, then sharpen/texture — the same order the shader runs them
  // (raw neighbourhood -> denoised centre -> detail gain). Both are no-ops when
  // their slider is 0, so a plain edit keeps the 1x-decode fast path.
  const denoised = makeRowDenoiser(composed, srcW, srcH, params.denoise, proxyFactor);
  const sampleLinear = makeRowDetail(composed, denoised, srcW, srcH, params.sharpen ?? 0, params.texture ?? 0, proxyFactor);
  // Scaled exports (50% / 25%) BOX-FILTER instead of decimating: each output
  // pixel averages an ss×ss grid of source taps placed in OUTPUT space and
  // mapped through toSrcF — so the filter stays correct under crop, rotation,
  // straighten and flip alike (a source-space rect would shear under a
  // straighten angle). Averaging happens on LINEAR light, which is the
  // physically correct anti-aliasing; the edit then runs once per OUTPUT
  // pixel on the averaged sample. Full-size exports keep the 1-tap fast path.
  const ss = opts.scale < 1 ? Math.max(2, Math.min(4, Math.round(1 / opts.scale))) : 1;
  const boxN = ss * ss;
  const sampleBox = (x: number, y: number): [number, number, number] => {
    if (ss === 1) {
      const [sx, sy] = toSrc(x, y);
      return sampleLinear(sx, sy);
    }
    let r = 0, g = 0, b = 0;
    for (let j = 0; j < ss; j++) {
      for (let i = 0; i < ss; i++) {
        const [sx, sy] = toSrcF((x + (i + 0.5) / ss) / w, (y + (j + 0.5) / ss) / h);
        const s = sampleLinear(sx, sy);
        r += s[0]; g += s[1]; b += s[2];
      }
    }
    return [r / boxN, g / boxN, b / boxN];
  };

  // HIE glow map at full resolution (cheap: built on a coarse grid).
  const gmap = params.glow > 0 ? buildGlowMap(rawSample, srcW, srcH) : null;
  const glowAt = (sx: number, sy: number) =>
    gmap ? params.glow * GLOW_GAIN * sampleGlow(gmap, (sx + 0.5) / srcW, (sy + 0.5) / srcH) : 0;

  // When rotated 90/270, the outer loop follows output COLUMNS so that source
  // rows stay constant per pass (keeps the denoiser's row cache effective).
  const outerN = rot & 1 ? w : h;
  const innerN = rot & 1 ? h : w;

  if (opts.format === "jpeg") {
    // JPEG saves as DISPLAY P3: every final display colour is re-expressed in
    // P3 (srgbDisplayToP3Display) and the matching P3 profile is embedded
    // below — the pair MUST land together or colors shift. Same appearance as
    // the preview by construction (sRGB is a subset of P3); the wide-gamut
    // container is what Apple devices shoot and share natively.
    const data = new Uint8ClampedArray(w * h * 4);
    const p3 = new Float32Array(3);
    for (let oIdx = 0; oIdx < outerN; oIdx++) {
      if (oIdx % 16 === 0) {
        onProgress?.(oIdx / outerN);
        await tick();
      }
      for (let iIdx = 0; iIdx < innerN; iIdx++) {
        const x = rot & 1 ? oIdx : iIdx;
        const y = rot & 1 ? iIdx : oIdx;
        const [sx, sy] = toSrc(x, y);
        const [r, g, b] = sampleBox(x, y); // box-filtered when scaled (see above)
        edit(r, g, b, out, glowAt(sx, sy), (sx + 0.5) / srcW, (sy + 0.5) / srcH);
        finishPixel(x, y); // creative vignette + grain, still in sRGB display space
        srgbDisplayToP3Display(out[0], out[1], out[2], p3);
        const o = (y * w + x) * 4;
        data[o] = p3[0] * 255;
        data[o + 1] = p3[1] * 255;
        data[o + 2] = p3[2] * 255;
        data[o + 3] = 255;
      }
    }
    onProgress?.(1);
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
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const cctx = canvas.getContext("2d")!;
    cctx.putImageData(new ImageData(data, w, h), 0, 0);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", opts.quality));
    if (!blob) throw new Error("JPEG encoding failed.");
    // canvas.toBlob passes our bytes through UNTAGGED (putImageData values are
    // canvas-space, never converted); embed the Display P3 profile so viewers
    // read them as written, the honest EXIF subset (capture date, camera,
    // lens, exposure — freshly built, never GPS or orientation), then the
    // traveling recipe, when asked for.
    let tagged = embedIccInJpeg(new Uint8Array(await blob.arrayBuffer()), DISPLAY_P3_ICC);
    const exif = readExifSubset(file.bytes);
    if (exif) tagged = embedExifInJpeg(tagged, buildExifApp1(exif)); // lands BEFORE the ICC (convention)
    if (opts.lookRecipe) tagged = embedLookInJpeg(tagged, opts.lookRecipe);
    return { blob: new Blob([tagged.buffer as ArrayBuffer], { type: "image/jpeg" }), name: `${baseName}.jpg` };
  } else {
    const rgb = new Uint16Array(w * h * 3);
    for (let oIdx = 0; oIdx < outerN; oIdx++) {
      if (oIdx % 16 === 0) {
        onProgress?.(oIdx / outerN);
        await tick();
      }
      for (let iIdx = 0; iIdx < innerN; iIdx++) {
        const x = rot & 1 ? oIdx : iIdx;
        const y = rot & 1 ? iIdx : oIdx;
        const [sx, sy] = toSrc(x, y);
        const [r, g, b] = sampleBox(x, y); // box-filtered when scaled (see above)
        edit(r, g, b, out, glowAt(sx, sy), (sx + 0.5) / srcW, (sy + 0.5) / srcH);
        finishPixel(x, y); // creative vignette + grain, same as the JPEG path
        const o = (y * w + x) * 3;
        rgb[o] = out[0] * 65535 + 0.5; // round — truncation biased the 16-bit output low
        rgb[o + 1] = out[1] * 65535 + 0.5;
        rgb[o + 2] = out[2] * 65535 + 0.5;
      }
    }
    onProgress?.(1);
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
      }
    }
    return { blob: new Blob([writeTiff16(rgb, w, h, SRGB_ICC, readExifSubset(file.bytes) ?? undefined)], { type: "image/tiff" }), name: `${baseName}.tif` };
  }
}

function getSource(file: ImportedFile, current: DecodedImage): Source {
  if (file.kind === "nef") {
    return { cfa: readNefCfa(file.bytes), cam: camToSrgbLinear(NIKON_Z50_COLOR_MATRIX) };
  }
  if (file.kind === "dng") {
    const ifds = new Tiff(file.bytes).allIfds();
    const raw = ifds.find((d) => d.num(254)[0] === 0 && d.num(262)[0] === 32803 && (d.num(259)[0] === 7 || d.num(259)[0] === 1));
    if (raw) {
      const cm = ifds.map((d) => d.num(50721)).find((v) => v.length === 9) ?? NIKON_Z50_COLOR_MATRIX;
      return { cfa: readMosaicedCfa(file.bytes, raw), cam: camToSrgbLinear(cm) };
    }
  }
  // Non-mosaiced (JPEG/PNG/lossy-linear DNG/preview): the decode is already
  // full-resolution 8-bit.
  if (!current.pixels) throw new Error("No full-resolution source available to export.");
  return { pixels: current.pixels, width: current.width, height: current.height };
}

/** Minimal baseline TIFF: RGB, 16-bit/channel, uncompressed, single strip, with
 *  an embedded ICC profile (tag 34675) so the output is never untagged — plus
 *  the honest EXIF subset (capture date, camera, lens, exposure) when the
 *  source carried one. Freshly built tags, never a copied block: GPS and
 *  Orientation structurally cannot ride along. */
export function writeTiff16(rgb: Uint16Array, w: number, h: number, icc: Uint8Array = SRGB_ICC, exif?: ExifSubset): ArrayBuffer {
  const ifd0Extra: TiffEntry[] = exif ? ifd0ExtraEntries(exif) : [];
  const exifIfd: TiffEntry[] = exif ? exifIfdEntries(exif) : [];
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
  tag(284, SHORT, 1, 1); // PlanarConfig: chunky
  flush(339); // Software (305) / DateTime (306)
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

export function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/** Save a file the way that actually works everywhere: the share sheet when
 *  the platform offers one (the installed iOS app has no other save path — a
 *  bare `a[download]` silently does nothing there), a plain download
 *  otherwise. "cancelled" = the user closed the sheet on purpose; callers
 *  should treat that as "keep waiting", not "saved". */
export async function saveBlob(blob: Blob, name: string): Promise<"shared" | "downloaded" | "cancelled"> {
  const file = new File([blob], name, { type: blob.type || "application/octet-stream" });
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] } as ShareData);
      return "shared";
    } catch (err) {
      if ((err as Error).name === "AbortError") return "cancelled"; // user closed the sheet
      // Fall through to a plain download on any other failure.
    }
  }
  download(blob, name);
  return "downloaded";
}
