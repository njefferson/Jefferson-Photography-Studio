// AN EXPORT DRAWN RATHER THAN COMPUTED — the measurement, not yet the product.
//
// The editor already runs the whole edit as shaders for the live view, and the
// export implements every one of them again in TypeScript. Both files say so and
// ask whoever changes one to keep the other in step by hand. Drawing the export
// through the shaders that already exist would end that, and the device numbers
// say it would also be far faster: a whole 20.9-megapixel frame drawn and read
// back measured 54 ms on a desktop and 76 and 61 on two iPads, against 19.7
// seconds for the threaded processor export.
//
// WHAT THAT NUMBER DOES NOT INCLUDE, and this file exists to be honest about:
// the shaders need the whole demosaiced frame as a texture. Today's export
// demosaics one pixel at a time inside its sampler chain and never holds the
// result. Measured on the same raw: 0.77 s to read the sensor data and 2.4 s to
// demosaic the whole frame into 334 MB of float. So a drawn export projects to
// about four seconds, not a tenth of one — still four to five times faster than
// the threaded export, and the demosaic is itself parallel.
//
// NOTHING HERE IS WIRED INTO THE EXPORT BUTTON. It is reached only from the test
// page, so the difference between a drawn frame and a computed one can be
// measured on real devices BEFORE a reader's photograph is ever saved through
// it. A pixel pipeline earns its way in with numbers.
import { Renderer } from "./gl";
import { getSource, proxyFactorFor } from "./export";
import { demosaicPixelLinearInto } from "./raw/demosaic";
import { srgbDisplayToP3Display } from "./icc";
import type { ImportedFile } from "./import";
import type { DecodedImage } from "./decode";
import type { EditParams, LensCurve } from "./pipeline";

export interface DrawnFrame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  /** Where the seconds went, so the projection above can be checked rather than
   *  believed. */
  ms: { source: number; upload: number; draw: number; read: number; p3: number };
}

// WHAT THE FIRST COMPARISON FOUND, and it is not a precision problem.
//
// Measured on a 2-megapixel crop of a practice raw with denoise 0.47 and sharpen
// 0.4: average difference 1.26 of 255 and NO colour shift at all (R -0.22,
// G -0.21, B -0.01) — but 30% of the interior differs by more than 2, worst 84,
// and where they differ the local contrast averages 24.1 against 11.4 over the
// whole frame. The disagreement sits on the EDGES.
//
// That is the neighbourhood operators, not the arithmetic. The denoise and detail
// taps are defined in PROXY texels — the live view runs them on a half-resolution
// copy, and the computed export reproduces that footprint deliberately by
// spacing its taps `step` native pixels apart (see the comments in
// raw/denoise.ts and raw/detail.ts). Handing this renderer a FULL-RESOLUTION
// image makes its taps one native pixel apart instead, so it denoises and
// sharpens a footprint half as wide. Same colours, different fine detail —
// exactly what the numbers say.
//
// So the next piece of this is a tap scale the renderer does not have yet: the
// shader multiplies its tap offsets by `u_texel`, and a drawn export needs them
// multiplied by the proxy factor as well, so the picture saved matches the
// picture previewed. Until that exists, the comparison above is the honest
// state: the colour is right and the detail is not.

/** What the drawn path can do TODAY. Narrow on purpose: this is a measurement
 *  instrument, and every one of these is a stage the shaders do have but whose
 *  setup the live view performs in main.ts rather than here. They come one at a
 *  time, each with its own comparison. */
export function canDrawFrame(params: EditParams): boolean {
  if ((params.spots?.length ?? 0) > 0) return false;
  if ((params.stickers?.length ?? 0) > 0) return false;
  if ((params.masks?.length ?? 0) > 0) return false;
  if (params.warp) return false;
  if (params.glow > 0) return false;         // needs the glow map built and uploaded
  if (params.clarity !== 0 || params.dehaze !== 0) return false; // needs the local map
  if (params.lut) return false;
  return true;
}

/** THE WHOLE FRAME AS THE SHADERS WANT IT — full resolution, linear, one pass.
 *
 *  Separated out because it answers a bigger question than the export. The live
 *  view runs on a downscaled proxy for one reason: a full-resolution render was
 *  too costly when that choice was made. If a device can hold this and draw from
 *  it at interactive speed, the proxy stops being necessary — and with it goes
 *  the whole footprint problem the tap scale exists to paper over, because the
 *  preview and the export would then be the same pixels at the same scale. */
export function buildLinearSource(file: ImportedFile, current: DecodedImage): {
  image: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; camMatrix?: number[] };
  ms: number;
  bytes: number;
} {
  const t0 = performance.now();
  const src = getSource(file, current);
  let image: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; camMatrix?: number[] };
  if ("cfa" in src) {
    const { width, height } = src.cfa;
    const linear = new Float32Array(width * height * 4);
    const px = new Float32Array(3);
    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i += 4) {
        demosaicPixelLinearInto(src.cfa, x, y, px);
        linear[i] = px[0]; linear[i + 1] = px[1]; linear[i + 2] = px[2]; linear[i + 3] = 1;
      }
    }
    image = { width, height, linear, camMatrix: src.cam };
  } else {
    image = { width: src.width, height: src.height, pixels: src.pixels };
  }
  const bytes = image.linear ? image.linear.byteLength : (image.pixels?.byteLength ?? 0);
  return { image, ms: performance.now() - t0, bytes };
}

/** Draw one frame of an export through the app's own renderer and hand back its
 *  pixels, top row first, in the same RGBA layout the computed path produces. */
export function drawFrame(
  file: ImportedFile,
  current: DecodedImage,
  params: EditParams,
  lens: LensCurve | null,
  rotate = 0,
  flip = 0,
): DrawnFrame {
  // ONE PASS, EVERY PIXEL. The computed export does this per output pixel inside
  // its sampler chain, which is more work in total — but it never holds a whole
  // frame, and this does: four bytes a channel, 334 MB on a 21-megapixel raw.
  // That is the trade this file exists to measure.
  const built = buildLinearSource(file, current);
  const image = built.image;
  const source = built.ms;
  const src = getSource(file, current);

  // A CANVAS OF ITS OWN, never in the document: `setImage` sizes it to the
  // image (times the crop), which is why a drawn export needs no tiling on any
  // device measured — all three report a 16384-pixel limit.
  const canvas = document.createElement("canvas");
  const r = new Renderer(canvas);
  try {
    let t = performance.now();
    r.setImage(image);
    // THE FOOTPRINT THE READER PREVIEWED, not the one a full-resolution texture
    // would give. Read from the same function the computed export uses, so the
    // two cannot disagree about it.
    r.setTapScale(proxyFactorFor(src, image.width, image.height));
    r.setLensCurve(lens?.kr ?? null, lens?.kb ?? null, lens?.bump ?? null);
    r.setToneCurve(params.tone, params.toneR, params.toneG, params.toneB);
    r.setRotation(rotate);
    r.setFlip(flip);
    const upload = performance.now() - t;
    t = performance.now();
    r.render(params);
    const draw = performance.now() - t;
    t = performance.now();
    const data = r.readFrame();
    const read = performance.now() - t;
    // DISPLAY P3, LIKE THE COMPUTED EXPORT. A JPEG this app saves is P3 and
    // carries the matching profile; the renderer draws sRGB to its canvas.
    // Without this the two paths differ by the gamut conversion and the
    // comparison would be measuring that rather than the pipeline.
    t = performance.now();
    const p3 = new Float32Array(3);
    for (let i = 0; i < data.length; i += 4) {
      srgbDisplayToP3Display(data[i] / 255, data[i + 1] / 255, data[i + 2] / 255, p3);
      data[i] = p3[0] * 255; data[i + 1] = p3[1] * 255; data[i + 2] = p3[2] * 255;
    }
    const p3ms = performance.now() - t;
    return { data, width: canvas.width, height: canvas.height, ms: { source, upload, draw, read, p3: p3ms } };
  } finally {
    // A WebGL context is not garbage: browsers cap how many a page may hold, so
    // one that is not released costs the next one.
    canvas.width = 1;
    canvas.height = 1;
  }
}
