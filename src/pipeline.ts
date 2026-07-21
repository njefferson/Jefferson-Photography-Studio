// CPU version of the GPU edit pipeline, kept numerically identical to the
// fragment shader in gl.ts so exports match the on-screen preview exactly.
// Order: white balance -> channel swap -> hue -> saturation -> contrast -> gamma.

import type { HealSpot } from "./heal";
import type { WarpField } from "./warp";
import { sampleLut3d } from "./lut3d";
export type { HealSpot };

export interface EditParams {
  wb: [number, number, number];
  exposure: number;
  swapRB: boolean;
  hue: number; // degrees
  sat: number;
  contrast: number;
  /** 0..1 bilateral strength, applied to LINEAR data BEFORE everything else
   *  (see raw/denoise.ts) — not part of compileEdit's per-pixel math. */
  denoise: number;
  /** Per-channel tone tint applied after saturation (e.g. sepia over mono).
   *  [1,1,1] = none. */
  tint: [number, number, number];
  /** 0..1 HIE halation strength. Spatial (uses the per-image glow map); the
   *  per-pixel amount is passed into the compiled edit as `glow`. */
  glow: number;
  /** Per-colour band adjustments: [hueShiftDeg, satScale, lumScale].
   *  The two bands split the whole hue circle: sky takes one half, foliage
   *  the complement — every colour on screen answers to exactly one box, no
   *  dead zone. The bands FOLLOW THE SUBJECT through a channel swap: with
   *  swap off, sky = the cool half (centred 210°); with swap on, the swap has
   *  reflected every hue (h -> 240 - h), so the sky band re-centres on 30° to
   *  keep pointing at the same real-world subject. Labels stay honest.
   *  Neutral = [0, 1, 1]. */
  sky: [number, number, number];
  foliage: [number, number, number];
  /** Tone curve control-point outputs at inputs [0,.25,.5,.75,1]:
   *  blacks, shadows, midtones, whites, highlights. Identity = TONE_DEFAULT.
   *  Applied per channel in display (gamma) space, after everything else. */
  tone: [number, number, number, number, number];
  /** Per-channel R/G/B curves — the same five-point model as `tone`, applied
   *  INDEPENDENTLY per channel in display space right AFTER the master tone
   *  curve (master shapes the light, these steer the colour per tonal band)
   *  and before the HSL mixer, so the mixer classifies the steered hue. Pure
   *  per-pixel colour math -> rides saved looks and bakes into .cube/.dcp
   *  like the mixer. Identity = TONE_DEFAULT each. */
  toneR: [number, number, number, number, number];
  toneG: [number, number, number, number, number];
  toneB: [number, number, number, number, number];
  /** Global luminance: one overall lift/drop that rides ON TOP of the tone
   *  curve. Applied per channel in display (gamma) space as the very last
   *  step: out = pow(out, 1/lum). >1 brightens the body, <1 darkens; the 0/1
   *  endpoints stay pinned so it lifts shadows/midtones without clipping.
   *  Neutral = 1. Same math in the shader (u_lum). */
  lum: number;
  /** Local masks (radial / linear gradient), each carrying a few local
   *  adjustments applied weighted by the mask, in linear space before global
   *  contrast/gamma. Spatial (they read the pixel's image-uv), so — like
   *  denoise and glow — they are NOT baked into the .cube LUT. Max MAX_MASKS. */
  masks: MaskLayer[];
  /** IR lens corrections — a radial LUMINANCE gain in linear space, just after
   *  white balance (a flat-field correction). Spatial (needs image-uv), so
   *  skipped in the .cube LUT like masks/denoise/glow.
   *  - hotspot 0..0.8: darkens the centre to cancel the IR hot-spot.
   *  - hotspotSize 0.15..1: radial extent of the hot-spot region.
   *  - vignette -1..1: + brightens corners (correct falloff), - darkens them. */
  hotspot: number;
  hotspotSize: number;
  vignette: number;
  /** 8-channel HSL colour mixer: flat [hueShiftDeg, satScale, lumScale] × 8
   *  bands at HSL_CENTERS (red, orange, yellow, green, aqua, blue, purple,
   *  magenta). Weights interpolate smoothly between ADJACENT band centres, so
   *  every hue answers to at most two chips. Runs in DISPLAY space on the
   *  near-final colour (after gamma + tone curve, before global lum) so the
   *  hue it classifies is exactly the hue on screen. Does NOT follow the swap
   *  (unlike Sky/Foliage). Pure per-pixel colour math -> IS baked into the
   *  .cube LUT. Neutral = hslDefault(). */
  hsl: number[];
  /** Black & white: channel-weighted mono conversion, made for the
   *  near-monochrome 720nm "white forest" frames. `bwOn` switches it; `bwMix`
   *  is the per-channel weight [r,g,b] (each 0..2) choosing how much each
   *  channel becomes brightness — the weighted sum is NORMALISED, so only the
   *  ratio matters, not the total. Runs in DISPLAY space on the near-final
   *  colour (after the HSL mixer, before global lum): the mixer's per-band
   *  luminance keeps shaping the mono per colour (the classic B&W-mix
   *  workflow), and Luminance/tone still act on the result. Pure per-pixel
   *  colour math -> IS baked into the .cube LUT; .dcp cannot carry it (dcp.ts
   *  doesn't run compileEdit). Neutral = off; [1,1,1] = the "Even" mix. */
  bwOn: boolean;
  bwMix: [number, number, number];
  /** Custom false color — the full 3×3 channel mixer, row-major
   *  [rr,rg,rb, gr,gg,gb, br,bg,bb]: each output channel is a weighted sum of
   *  the three inputs. The R⇄B swap is the one-tap special case
   *  ([0,0,1, 0,1,0, 1,0,0]); this is arbitrary aerochrome-style and invented
   *  palettes. Linear space, right AFTER the swap and BEFORE the hue rotation
   *  (so swap + mix + hue compose). Pure per-pixel colour math -> bakes into
   *  the .cube LUT, and (best-effort, via creativeLinear) the .dcp hue-sat
   *  map. Identity = MIX3_DEFAULT. */
  mix3?: number[];
  /** Color grade: split-tone wheels [hueS, amtS, hueM, amtM, hueH, amtH,
   *  balance] — one hue (deg) + amount (0..1) per tonal band, balance -1..1
   *  shifting the shadow/highlight crossovers. Each band adds a PURE-CHROMA
   *  offset (the tint's Rec.709 luma is subtracted out), weighted by
   *  smoothstep bands over the display luminance — so toning never fights
   *  the tone curve, and it tones B&W frames too (it runs AFTER bwOn; that
   *  is the whole "toned mono" story). Per-pixel display-space colour ->
   *  baked into .cube; .dcp cannot carry it (dcp.ts doesn't run
   *  compileEdit). Neutral = all amounts 0 (GRADE_DEFAULT). */
  grade?: number[];
  /** Film grain 0..1 (amount) + size 1..3 (grain scale, resolution-
   *  proportional: cell size = grainSize * outputHeight / 1200 px).
   *  Deterministic value noise (hash2d/grainNoise below) added to the FINAL
   *  display value, luma-weighted (strongest in midtones). SPATIAL and
   *  output-anchored: applied by the shader (crop-local coords) and by
   *  export.ts after compileEdit — never inside compileEdit, so it is
   *  structurally excluded from the .cube/.dcp LUTs. */
  grainAmt?: number;
  grainSize?: number;
  /** Creative vignette: amount -1..1 (negative darkens the corners) and
   *  midpoint 0..1 (how far from centre the falloff starts). A radial
   *  smoothstep over CROP-LOCAL coords — it frames the image you kept,
   *  unlike the source-anchored lens `vignette` correction above. Same
   *  spatial exclusions as grain (creativeVignette below). */
  vigAmt?: number;
  vigMid?: number;
  /** Clarity -1..1: local contrast as a RATIO against the per-image blurred-
   *  luma map (LocalMap) — pow(L/Lblur, clarity*0.5), clamped. Ratio-based, so
   *  it is exposure- and WB-invariant. Applied on LINEAR source data before
   *  exposure/WB. Spatial (needs the map + uv) -> skipped in the .cube LUT. */
  clarity: number;
  /** Dehaze -1..1: subtracts the local veil (blurred dark-channel map) with a
   *  white-airlight renormalisation — + removes haze, - adds it. Same spatial
   *  caveats as clarity. */
  dehaze: number;
  /** Sharpen 0..1: capture sharpening — a HIGH-frequency luminance high-pass
   *  folded back as a hue-preserving gain, on LINEAR data after denoise. A
   *  neighbourhood op (needs pixel taps), so it lives in the pre-pass, NOT in
   *  compileEdit's per-pixel math (raw/detail.ts + the shader's u_sharpen
   *  block) — and is therefore skipped in the .cube/.dcp LUT, like denoise. */
  sharpen: number;
  /** Texture -1..1: MID-frequency local contrast (a band-pass between the two
   *  detail blurs) — + brings out surface structure, - smooths it. Same
   *  hue-preserving, spatial, pre-pass caveats as `sharpen`. */
  texture: number;
  /** Dust & spot heals: feathered clones that REWRITE THE SOURCE before any
   *  other processing (see heal.ts). Not per-pixel colour math, so — like
   *  masks — they never enter compileEdit or the .cube/.dcp LUT: the preview
   *  bakes them into the GPU texture, the export applies the identical patch
   *  math to the source samples. Composition-specific: reset on a new open,
   *  never carried by saved looks or batch. */
  spots: HealSpot[];
  /** Stickers (Creative): playful cutouts (UFOs, aliens…) composited INTO the
   *  linear source before the pipeline — exactly like heal spots — so each
   *  sticker inherits the channel swap / WB / looks / grade / grain and lands
   *  in the IR palette. Spatial + composition-specific: baked into the preview
   *  texture and the export sampler, never in saved looks / batch / .cube /
   *  .dcp. See sticker.ts. Reset on a new open like spots/crop. */
  stickers?: Sticker[];
  /** Crop rect in the STRAIGHTENED display frame [0,1] (x,y = top-left, w,h =
   *  size) — a VIEW onto the source, not a re-bake. Default = the whole frame.
   *  Composition-specific like spots: reset on a new open, never carried by
   *  saved looks or batch. See `straighten` for the frame it's relative to. */
  crop: CropRect;
  /** Straighten angle in degrees, a small rotation about the frame centre
   *  applied BEFORE crop (crop lives in the resulting straightened frame —
   *  see autoInscribedCrop). Same composition-specific exclusions as crop. */
  straighten: number;
  /** Warp (Creative): a UV displacement field remapping the source before the
   *  pipeline — in the shader (fetchLin) and the export sampler (warp.ts).
   *  RUNTIME-ONLY like the brush bitmaps: `rgba` is the sampled form, shared by
   *  reference across snapshots (copy-on-write per stroke, `rev` compared).
   *  Spatial + composition-specific: never in looks / batch / .cube / .dcp;
   *  reset on a new open. */
  warp?: WarpField | null;
  /** Imported .cube 3D LUT — the LAST colour stage, applied to the final
   *  display colour (after tone/HSL/lum), mirroring the shader's u_lutTex.
   *  RUNTIME-ONLY like masks' bitmaps: `data` is stride-3 RGB, red fastest,
   *  unit domain, values clamped [0,1], IMMUTABLE once imported (snapshots
   *  share it by reference; the wrapper object is what gets cloned). Stripped
   *  at every serialization boundary (editToJson; slots store only a
   *  {lutId, lutStrength} ref); rides params -> exportImage -> compileEdit
   *  with no signature changes, and therefore BAKES into the exported .cube
   *  (lut.ts drives this same closure) — deliberate. dcp.ts does not use
   *  compileEdit, so .dcp can NOT carry it (Help says so). */
  lut?: { id: string; name: string; size: number; data: Float32Array; strength: number } | null;
}

/** One placed sticker. Geometry is in image-uv (like HealSpot), so it tracks
 *  the photo through crop/rotate/zoom. `occlude` lets scene elements peek in
 *  FRONT: at bake time, pixels whose source luminance is on the chosen side of
 *  `occludeLuma` are held back (occludeBright = bright scene pixels occlude,
 *  e.g. IR foliage; else dark ones, e.g. tree trunks). */
export interface Sticker {
  id: string;
  asset: string; // asset key -> public/stickers/<asset>.png
  x: number; // centre, image-uv
  y: number;
  scale: number; // width as a fraction of the image width
  rot: number; // degrees, clockwise
  occlude: number; // 0..1 occlusion strength (0 = always on top)
  occludeLuma: number; // 0..1 luminance threshold
  occludeBright: boolean; // true = bright pixels occlude; false = dark pixels
  // Per-sticker match adjustments, applied to the asset colour BEFORE it
  // composites into the source — so the sticker can be made to sit in the
  // scene. All 0 = the raw asset. Auto-set on add (auto-match), user-tunable.
  bright?: number; // -1..1 brightness
  contrast?: number; // -1..1 contrast about mid grey
  warmth?: number; // -1..1 R↑/B↓ (warm) vs R↓/B↑ (cool)
  sat?: number; // -1..1 saturation (−1 = grey, +1 = ~2×)
  /** Overall opacity 0..1 (1 = solid). Multiplies the sticker's coverage so it
   *  can be faded into the scene (owner, 2026-07-21). */
  opacity?: number;
  /** Luminance: a gamma-style lightness, out = c^(1/lum). >1 lifts, <1 darkens —
   *  gentler than the linear Brightness, won't blow out. 1 = neutral. */
  lum?: number;
  /** "Blend to match" — the auto-harmonise. `matchGain` is a per-channel SOURCE
   *  gain that moves the sticker's average colour onto the scene's: computed as
   *  sceneSourceMean / assetSourceMean, so after the identical IR pipeline (WB,
   *  camera matrix, R↔B swap) the sticker lands on the scene's actual on-screen
   *  colour — a blown-out craft tones right in. `matchAmt` (0..1) lerps the gain
   *  toward identity (0 = raw asset). Identity default [1,1,1]. Auto-set on add +
   *  on the button; the bright/contrast/warmth/sat sliders ride ON TOP. */
  matchGain?: [number, number, number];
  matchAmt?: number;
  /** "Match the photo's colours" done RIGHT: `matchScene` is the DISPLAYED scene's
   *  mean colour under the sticker (LINEAR), sampled from the finished photo — NOT
   *  the raw sensor pipeline. The sticker's own mean is shifted toward it (by
   *  `matchAmt`) in its own display-space layer, so it takes on the scene's
   *  infrared palette without being cooked. A sticker is a different kind of
   *  picture; this mimics the look instead of forcing it through the same filters
   *  (owner, 2026-07-21). */
  matchScene?: [number, number, number];
  /** Re-run the colour match automatically whenever the sticker is dropped in a
   *  new spot (default on; undefined = on). Off locks the current match so moving
   *  it won't recolour it (owner, 2026-07-21). */
  reMatch?: boolean;
  /** A cast SHADOW of another sticker: same asset, rendered as a flat near-black
   *  silhouette so it darkens the ground like a real shadow (black over the scene
   *  == Multiply). `shadowOpacity` is its strength. Skips the colour match. The
   *  squash/skew onto the ground is carried by `corners` (owner, 2026-07-21). */
  shadow?: boolean;
  shadowOpacity?: number;
  /** A glowing light — composites with SCREEN (adds light to the scene) instead
   *  of sitting on top, so a beam/aura/orb reads as real light. Set once at
   *  placement from the asset (owner, 2026-07-21). */
  screen?: boolean;
  /** Per-sticker erase/restore mask in ASSET-LOCAL space (paint to tuck the
   *  sticker behind foreground). 0 = hidden, 255 = shown; absent = fully
   *  shown. Runtime bitmap like the brush masks; `maskRev` bumps per stroke. */
  mask?: BrushMask | null;
  maskRev?: number;
  /** Perspective skew: 4 corner OFFSETS in local half-extent units, order
   *  TL, TR, BR, BL (asset uv 0,0 / 1,0 / 1,1 / 0,1). Absent/null = the plain
   *  scale+rot rect. Each [dx,dy] shifts that corner by dx·halfWidth, dy·
   *  halfHeight in the sticker's own (pre-rotation) frame, so the asset is
   *  projectively warped onto the scene's plane. */
  corners?: [number, number][] | null;
  /** ON TOP of the infrared look (the default). A sticker is a DIFFERENT kind of
   *  picture than the IR photo, so by default it is composited AFTER the whole
   *  pipeline — it keeps its own colours instead of being channel-swapped,
   *  white-balanced and saturated into neon (owner, 2026-07-21). Set false to
   *  bake it INTO the source before the pipeline so it takes on the IR palette
   *  (the old "creature in infrared" effect). Undefined = on top. */
  onTop?: boolean;
}

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const CROP_DEFAULT: CropRect = { x: 0, y: 0, w: 1, h: 1 };

/** Identity color grade: no tint in any band, balance centred. */
export const GRADE_DEFAULT: number[] = [0, 0, 0, 0, 0, 0, 0];

/** Identity 3×3 channel mixer (row-major): output = input. */
export const MIX3_DEFAULT: number[] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export function mix3IsIdentity(m: number[] | undefined): boolean {
  if (!m) return true;
  for (let i = 0; i < 9; i++) if (Math.abs((m[i] ?? MIX3_DEFAULT[i]) - MIX3_DEFAULT[i]) > 1e-6) return false;
  return true;
}

/** Master strength of a full-amount wheel — one number, shared verbatim by
 *  the shader (u_grade path) so parity is a constant, not a coincidence. */
export const GRADE_K = 0.35;

export function gradeIsNeutral(g: number[] | undefined): boolean {
  return !g || ((g[1] ?? 0) === 0 && (g[3] ?? 0) === 0 && (g[5] ?? 0) === 0);
}

export function cropIsIdentity(c: CropRect, straighten: number): boolean {
  return (
    straighten === 0 &&
    Math.abs(c.x) < 1e-6 &&
    Math.abs(c.y) < 1e-6 &&
    Math.abs(c.w - 1) < 1e-6 &&
    Math.abs(c.h - 1) < 1e-6
  );
}

/** Per-image low-res reference maps for clarity/dehaze: blurred luminance (R)
 *  and blurred dark-channel (G), sqrt-encoded to 8 bits with a shared linear
 *  `scale` (decode: (v/255)^2 * scale). The GPU samples the SAME bytes as an
 *  RG8 texture, so CPU/GPU stay within filtering error of each other. Built
 *  once per image by buildLocalMap (localmap.ts) — glow-map pattern. */
export interface LocalMap {
  width: number;
  height: number;
  /** RG interleaved, 2 bytes per texel: [lumaEnc, darkEnc]. */
  rg: Uint8Array;
  scale: number;
}

/** Bilinear sample of the ENCODED map bytes at image-uv, then decode — the
 *  same order the GPU uses (texture filtering happens on encoded values). */
export function sampleLocalMap(m: LocalMap, u: number, v: number): [number, number] {
  const x = Math.min(m.width - 1.001, Math.max(0, u * m.width - 0.5));
  const y = Math.min(m.height - 1.001, Math.max(0, v * m.height - 0.5));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const at = (xx: number, yy: number, c: number) => m.rg[(yy * m.width + xx) * 2 + c];
  const bil = (c: number) => {
    const a = at(x0, y0, c), b = at(x0 + 1, y0, c), d = at(x0, y0 + 1, c), e = at(x0 + 1, y0 + 1, c);
    return a + (b - a) * fx + (d - a) * fy + (a - b - d + e) * fx * fy;
  };
  const dec = (enc: number) => { const t = enc / 255; return t * t * m.scale; };
  return [dec(bil(0)), dec(bil(1))];
}

export const MAX_MASKS = 8;

/** Painted (brush) and sky masks pack into ONE RGBA texture on the GPU, so at
 *  most this many of them can coexist — one per channel. Geometry/colour masks
 *  have no such limit; the overall cap is MAX_MASKS. The UI enforces both. */
export const MAX_BITMAP_MASKS = 4;

/** A painted brush mask: a single-channel 0..255 weight bitmap at a small
 *  working resolution (bilinearly sampled). `rev` bumps on each stroke so undo
 *  equality can compare cheaply without serialising the pixels. */
export interface BrushMask {
  w: number;
  h: number;
  data: Uint8Array;
}

/** A local-adjustment mask. `type` 0 = radial, 1 = linear gradient, 2 = brush,
 *  3 = colour (chroma-key), 4 = sky (classical heuristic). Geometry is in
 *  image-uv [0..1] so it anchors to the photo through rotation/zoom; a colour
 *  mask has no geometry — its weight is each pixel's hue/saturation distance to
 *  a tapped colour. A SKY mask also has no live geometry: its weight is a
 *  bitmap GENERATED once by the sky heuristic (sky.ts) and stored in `brush`,
 *  so it is sampled through the exact same path as a painted brush mask — the
 *  connectivity/flood-fill work that a per-pixel weight function cannot express
 *  happens in JS at generation time, not in the shader. */
export interface MaskLayer {
  type: 0 | 1 | 2 | 3 | 4;
  cx: number; // radial: centre x; linear: start x
  cy: number; // radial: centre y; linear: start y
  rx: number; // radial: x radius (uv fraction)
  ry: number; // radial: y radius (uv fraction)
  feather: number; // radial/colour: 0..1 soft edge
  lx: number; // linear: end x
  ly: number; // linear: end y
  invert: boolean;
  brush?: BrushMask; // type 2 (painted) and type 4 (generated sky) both use this
  rev?: number; // bumps on each brush stroke / sky regeneration (undo equality)
  /** Sky mask (type 4) "Reach": scales the heuristic's growth tolerances when
   *  regenerating the bitmap (1 = calibrated default, >1 grows more eagerly).
   *  Unused by other mask types. */
  reach: number;
  // Colour mask (type 3): the tapped target and how wide a band it selects.
  // The key is the pixel's DISPLAY-space hue/saturation — the pre-mask colour
  // pushed through contrast+gamma+tone (see colorMaskWeight); satTarget is HSV
  // saturation (0..1), hueTarget in degrees. satTarget < 0 = no colour picked
  // yet -> the mask is inert (weight 0 everywhere, invert included).
  hueTarget: number; // degrees
  satTarget: number; // 0..1 (HSV); -1 = unpicked (mask inert)
  valTarget: number; // HSV value of the tapped colour — swatch cosmetics ONLY
  colorRange: number; // normalised chroma distance at which selection reaches 0
  // Local adjustments — neutral = brightness/contrast/saturation 1, hue/warmth 0.
  brightness: number;
  contrast: number;
  saturation: number;
  hue: number; // degrees
  warmth: number; // -1..1, + warmer
}

export function neutralMask(type: 0 | 1 | 2 | 3 | 4): MaskLayer {
  const base = { cx: 0.5, cy: 0.5, rx: 0.35, ry: 0.35, feather: 0.5, lx: 0.5, ly: 0.85, invert: false, hueTarget: 0, satTarget: -1, valTarget: 0.75, colorRange: 0.5, reach: 1, brightness: 1, contrast: 1, saturation: 1, hue: 0, warmth: 0 };
  if (type === 1) return { ...base, type, cx: 0.5, cy: 0.12, lx: 0.5, ly: 0.5 };
  if (type === 2) return { ...base, type, rev: 0 };
  if (type === 4) return { ...base, type, rev: 0 }; // sky: bitmap filled by the heuristic on add
  return { ...base, type };
}

export function maskIsActive(m: MaskLayer): boolean {
  return m.brightness !== 1 || m.contrast !== 1 || m.saturation !== 1 || m.hue !== 0 || m.warmth !== 0;
}

export function smooth01(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0 || 1e-4)));
  return t * t * (3 - 2 * t);
}

/** Bilinear sample of a bitmap mask (0..1) at image-uv — brush (type 2) and sky
 *  (type 4). Replicates the GPU's LINEAR texture sampling EXACTLY: WebGL samples
 *  at texel coordinate `u*size - 0.5` (texel centres) with CLAMP_TO_EDGE, not
 *  `u*(size-1)`. The two conventions agree only at u=0.5, so at a soft mask edge
 *  under a strong local adjustment the half-texel gap otherwise pushed a handful
 *  of edge pixels past the parity bar (found by the sky-mask harness, 2026-07-06
 *  — the sky's gaussian-feathered edge exposes what brush strokes mostly hid). */
function sampleBrush(b: BrushMask, u: number, v: number): number {
  const fx = Math.min(1, Math.max(0, u)) * b.w - 0.5;
  const fy = Math.min(1, Math.max(0, v)) * b.h - 0.5;
  const ix = Math.floor(fx), iy = Math.floor(fy);
  const tx = fx - ix, ty = fy - iy;
  // Clamp EACH neighbour independently from the unclamped floor — CLAMP_TO_EDGE
  // collapses both taps to the border texel when the coord runs off the edge
  // (clamping x0 then x1=x0+1 would wrongly reach a second texel at the border).
  const cx = (i: number) => Math.max(0, Math.min(b.w - 1, i));
  const cy = (i: number) => Math.max(0, Math.min(b.h - 1, i));
  const x0 = cx(ix), x1 = cx(ix + 1), y0 = cy(iy), y1 = cy(iy + 1);
  const s = (x: number, y: number) => b.data[y * b.w + x];
  const top = s(x0, y0) * (1 - tx) + s(x1, y0) * tx;
  const bot = s(x0, y1) * (1 - tx) + s(x1, y1) * tx;
  return (top * (1 - ty) + bot * ty) / 255;
}

/** Mask weight 0..1 at image-uv (u,v). Kept numerically identical to the shader. */
export function maskWeight(m: MaskLayer, u: number, v: number): number {
  let w: number;
  if (m.type === 0) {
    const dx = (u - m.cx) / Math.max(1e-4, m.rx);
    const dy = (v - m.cy) / Math.max(1e-4, m.ry);
    const r = Math.sqrt(dx * dx + dy * dy);
    w = 1 - smooth01(1 - m.feather, 1, r); // 1 in the core, 0 past the edge
  } else if (m.type === 1) {
    const gx = m.lx - m.cx, gy = m.ly - m.cy;
    const len2 = gx * gx + gy * gy || 1e-4;
    const t = ((u - m.cx) * gx + (v - m.cy) * gy) / len2;
    w = 1 - Math.min(1, Math.max(0, t)); // full at the start point, 0 at the end
  } else {
    // Brush (type 2) and sky (type 4): weight is the stored bitmap, bilinearly
    // sampled — identical to the shader's packed-texture read. (Colour masks,
    // type 3, never reach here; compileEdit routes them to colorMaskWeight.)
    w = m.brush ? sampleBrush(m.brush, u, v) : 0;
  }
  return m.invert ? 1 - w : w;
}

/** The HSV chroma-plane vector s·(cosH, sinH) of a DISPLAY-space colour, but
 *  derived DIRECTLY from RGB via the opponent projection instead of through
 *  rgb2hsv. This is algebraically the same point (|v| = HSV saturation, angle =
 *  HSV hue) yet it is CONTINUOUS — no hue-angle branch, no wrap discontinuity —
 *  so the GPU and CPU agree to float epsilon even at the hexagon vertices where
 *  the two rgb2hsv formulations otherwise drift ~1°. (a,b)/V = S·(cosH,sinH)
 *  because (a,b) has magnitude = chroma C and S = C/V. Identical in the shader. */
export function chromaVec(r: number, g: number, b: number): [number, number] {
  const V = Math.max(r, g, b);
  if (V <= 1e-6) return [0, 0];
  return [(r - 0.5 * (g + b)) / V, (0.8660254037844386 * (g - b)) / V];
}

/** Colour-mask (type 3) weight for a KEY-space pixel colour (gamma RGB, 0..1 —
 *  the pre-mask colour through contrast+gamma; see compileEdit). Chroma-key:
 *  project the pixel and the tapped target onto the HSV chroma plane (hue
 *  angle × saturation radius), measure Euclidean distance, then NORMALISE by
 *  the target's own saturation — so `colorRange` means "how far from THIS
 *  colour, relative to how colourful it is", and hue discrimination stays
 *  constant whether the image's chroma is vivid or IR-flat. (An absolute
 *  distance could not discriminate on low-sat IR frames — everything sat
 *  within the default Range of everything else; field bug 2026-07-05.) One
 *  number folds hue AND saturation; hue's influence still fades as pixels
 *  desaturate (near-grey pixels sit near the origin whatever their noisy
 *  hue). Weight is 1 at the target, smoothstep-falling to 0 past `colorRange`;
 *  `feather` widens the soft transition. An unpicked mask (satTarget < 0) is
 *  inert — 0 everywhere, invert included. Kept numerically identical to the
 *  shader's colorMaskWeight. */
export function colorMaskWeight(m: MaskLayer, r: number, g: number, b: number): number {
  if (m.satTarget < 0) return 0; // no colour picked yet
  const [px, py] = chromaVec(r, g, b);
  const tRad = (m.hueTarget * Math.PI) / 180;
  const tx = m.satTarget * Math.cos(tRad), ty = m.satTarget * Math.sin(tRad);
  const nd = Math.hypot(px - tx, py - ty) / Math.max(0.08, m.satTarget);
  const edge = Math.max(1e-4, m.colorRange);
  const plateau = edge * (1 - m.feather);
  const w = 1 - smooth01(plateau, edge, nd);
  return m.invert ? 1 - w : w;
}

export const TONE_X = [0, 0.25, 0.5, 0.75, 1] as const;
export const TONE_DEFAULT: [number, number, number, number, number] = [0, 0.25, 0.5, 0.75, 1];

export function toneIsIdentity(y: readonly number[]): boolean {
  return y.every((v, i) => Math.abs(v - TONE_DEFAULT[i]) < 1e-4);
}

/**
 * Monotone cubic (Fritsch–Carlson) through the five fixed-x control points —
 * smooth, and never overshoots between points. Same curve drives the GPU LUT,
 * the CPU export and the on-screen widget.
 */
export function toneEvaluator(y: readonly number[]): (v: number) => number {
  const x = TONE_X;
  const n = 5;
  const d: number[] = [];
  const m: number[] = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((y[i + 1] - y[i]) / (x[i + 1] - x[i]));
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (v: number) => {
    if (v <= 0) return y[0];
    if (v >= 1) return y[4];
    let i = 3;
    if (v < x[1]) i = 0;
    else if (v < x[2]) i = 1;
    else if (v < x[3]) i = 2;
    const h = x[i + 1] - x[i];
    const t = (v - x[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    const out =
      y[i] * (2 * t3 - 3 * t2 + 1) +
      m[i] * h * (t3 - 2 * t2 + t) +
      y[i + 1] * (-2 * t3 + 3 * t2) +
      m[i + 1] * h * (t3 - t2);
    return Math.min(1, Math.max(0, out));
  };
}

/** Radial IR-lens correction gain at image-uv (u,v). CIRCULAR IN PIXELS (a
 *  lens hot-spot is optically round), so the caller passes the image aspect
 *  (width/height); r is normalised to 1 at the frame corner. Kept numerically
 *  identical to the shader (u_aspect). 1 = no change. */
export function radialGain(hotspot: number, hotspotSize: number, vignette: number, u: number, v: number, aspect: number): number {
  const a = aspect > 0 ? aspect : 1;
  const dx = (u - 0.5) * a, dy = v - 0.5; // height units — circular in pixels
  const r = (2 * Math.sqrt(dx * dx + dy * dy)) / Math.sqrt(a * a + 1); // 1 = corner
  const gVig = 1 + vignette * 0.85 * smooth01(0.07, 1, r);
  const gHot = 1 - hotspot * (1 - smooth01(0, Math.max(1e-3, hotspotSize), r));
  return Math.max(0, gVig * gHot);
}

// --- Crop / straighten geometry (mirrored in the gl.ts vertex shader and
// export.ts's toSrc — all three must stay numerically identical). `aspect` is
// always the DISPLAY-ROTATED frame's width/height (the 90-degree u_rot already
// applied, crop/straighten not yet), so straighten reads as a true angle and
// crop stays proportionally honest regardless of the photo's own aspect. ---

/** Final (post crop+straighten) frame uv [0,1] -> STRAIGHTENED-frame uv
 *  [0,1] -> pre-straighten, display-rotated uv [0,1] (where to sample). Crop
 *  is applied first (it's defined IN the straightened frame), then the
 *  straighten rotation is undone about the frame centre to find the source. */
export function cropToDisplayUv(
  tx: number,
  ty: number,
  crop: CropRect,
  straightenDeg: number,
  aspect: number,
): [number, number] {
  const lx = crop.x + tx * crop.w;
  const ly = crop.y + ty * crop.h;
  if (!straightenDeg) return [lx, ly];
  const a = (-straightenDeg * Math.PI) / 180;
  const dx = (lx - 0.5) * aspect;
  const dy = ly - 0.5;
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const rx = dx * cosA - dy * sinA;
  const ry = dx * sinA + dy * cosA;
  return [rx / aspect + 0.5, ry + 0.5];
}

/** Inverse of cropToDisplayUv: pre-straighten display uv -> final crop-local
 *  uv [0,1]. Used to invert taps/mask placement back through an active
 *  crop+straighten to the true image coordinates masks/heals live in. */
export function displayUvToCrop(
  u: number,
  v: number,
  crop: CropRect,
  straightenDeg: number,
  aspect: number,
): [number, number] {
  let lx = u, ly = v;
  if (straightenDeg) {
    const a = (straightenDeg * Math.PI) / 180;
    const dx = (u - 0.5) * aspect;
    const dy = v - 0.5;
    const cosA = Math.cos(a), sinA = Math.sin(a);
    const rx = dx * cosA - dy * sinA;
    const ry = dx * sinA + dy * cosA;
    lx = rx / aspect + 0.5;
    ly = ry + 0.5;
  }
  return [(lx - crop.x) / Math.max(1e-6, crop.w), (ly - crop.y) / Math.max(1e-6, crop.h)];
}

/** The largest same-aspect-ratio rect, centred in the frame, whose corners
 *  stay inside [0,1]x[0,1] after a `straightenDeg` rotation — the crop
 *  straighten auto-inscribes to, so leveling a horizon never bares an empty
 *  corner. Closed form: for a frame of half-extents (aspect, 1) rotated by
 *  angle a, the largest same-ratio inscribed rect scales the frame by
 *  k = min(aspect/(aspect·cosA + sinA), 1/(cosA + aspect·sinA)). */
export function autoInscribedCrop(straightenDeg: number, aspect: number): CropRect {
  const a = Math.abs((straightenDeg * Math.PI) / 180);
  if (a < 1e-6) return { ...CROP_DEFAULT };
  const cosA = Math.cos(a), sinA = Math.sin(a);
  const k = Math.min(aspect / (aspect * cosA + sinA), 1 / (cosA + aspect * sinA));
  const half = (1 - k) / 2;
  return { x: half, y: half, w: k, h: k };
}

// --- 8-channel HSL colour mixer (mirrored in the shader) ---

/** Band centres in degrees: red, orange, yellow, green, aqua, blue, purple,
 *  magenta. Non-uniform on purpose (matches how editors cluster warm hues). */
export const HSL_CENTERS = [0, 30, 60, 120, 180, 240, 280, 320] as const;

export function hslDefault(): number[] {
  const a: number[] = [];
  for (let i = 0; i < 8; i++) a.push(0, 1, 1);
  return a;
}

export function hslIsNeutral(hsl: readonly number[] | undefined): boolean {
  if (!hsl || hsl.length !== 24) return true;
  for (let i = 0; i < 8; i++) {
    if (hsl[i * 3] !== 0 || hsl[i * 3 + 1] !== 1 || hsl[i * 3 + 2] !== 1) return false;
  }
  return true;
}

/** Blended [hueShift, satScale, lumScale] at hue h (degrees): smoothstep
 *  between the two adjacent band centres. Identical in the shader. */
export function hslAt(hsl: readonly number[], h: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  let i = 7; // last segment (320..360 wraps to red)
  for (let k = 0; k < 7; k++) {
    if (h >= HSL_CENTERS[k] && h < HSL_CENTERS[k + 1]) { i = k; break; }
  }
  const c0 = HSL_CENTERS[i];
  const c1 = i === 7 ? 360 : HSL_CENTERS[i + 1];
  const j = (i + 1) % 8;
  const t = (h - c0) / (c1 - c0);
  const w = t * t * (3 - 2 * t); // weight of the NEXT band
  return [
    hsl[i * 3] * (1 - w) + hsl[j * 3] * w,
    hsl[i * 3 + 1] * (1 - w) + hsl[j * 3 + 1] * w,
    hsl[i * 3 + 2] * (1 - w) + hsl[j * 3 + 2] * w,
  ];
}

// --- HSV helpers shared by the per-colour bands (mirrored in the shader) ---

function rgb2hsv(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 1e-9) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return [h, max < 1e-9 ? 0 : d / max, max];
}

export function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
  h = ((h % 360) + 360) % 360;
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [r + m, g + m, b + m];
}

/** Band weight: 1 inside the plateau, smoothstep falloff to 0. */
function bandWeight(hue: number, center: number, plateau: number, edge: number): number {
  let d = Math.abs(hue - center);
  if (d > 180) d = 360 - d;
  if (d <= plateau) return 1;
  if (d >= edge) return 0;
  const t = (d - plateau) / (edge - plateau);
  return 1 - t * t * (3 - 2 * t);
}

const REC709 = [0.2126, 0.7152, 0.0722];

/** A wheel hue -> its pure-chroma tint vector: the full-saturation RGB of the
 *  hue with its Rec.709 luma subtracted out, so adding it never moves the
 *  pixel's luminance. Computed ONCE per frame on the CPU and handed to the
 *  shader as uniforms (bindPipeline) — both sides add identical numbers. */
export function gradeTintVec(hue: number): [number, number, number] {
  const [r, g, b] = hsv2rgb(hue, 1, 1);
  const l = r * REC709[0] + g * REC709[1] + b * REC709[2];
  return [r - l, g - l, b - l];
}

/** Deterministic u32 hash of a grid cell -> [0,1). Math.imul + unsigned
 *  shifts here; the shader mirrors it with uint arithmetic (wrap-around
 *  multiply and >> are identical in both). */
export function hash2d(x: number, y: number): number {
  let h = Math.imul(x, 0x27d4eb2d) ^ Math.imul(y, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Value noise in [-1,1): smoothstep-blended bilinear over hashed cell
 *  corners. `px,py` are OUTPUT pixel coords, `cellPx` the grain cell size in
 *  those pixels. Same statistics at any resolution; bit-identical to the
 *  shader when the pixel grids match. */
export function grainNoise(px: number, py: number, cellPx: number): number {
  const gx = px / cellPx, gy = py / cellPx;
  const x0 = Math.floor(gx), y0 = Math.floor(gy);
  const fx = gx - x0, fy = gy - y0;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const n00 = hash2d(x0, y0), n10 = hash2d(x0 + 1, y0);
  const n01 = hash2d(x0, y0 + 1), n11 = hash2d(x0 + 1, y0 + 1);
  const nx0 = n00 + (n10 - n00) * sx;
  const nx1 = n01 + (n11 - n01) * sx;
  return (nx0 + (nx1 - nx0) * sy) * 2 - 1;
}

/** Film grain cell size in output pixels: resolution-proportional so the
 *  LOOK survives any export scale (1200 = the reference frame height). */
export function grainCellPx(grainSize: number, outH: number): number {
  return Math.max(1, (grainSize * outH) / 1200);
}

/** Add monochrome grain to a display-space pixel IN PLACE. Luma-weighted:
 *  strongest in the midtones, fading toward both ends so blacks stay black
 *  and skies stay clean. Mirrors the shader's grain block. */
export function applyGrain(out: Float32Array, px: number, py: number, cellPx: number, amt: number): void {
  const L = out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722;
  const w = 0.25 + 0.75 * (1 - Math.abs(2 * L - 1));
  const n = grainNoise(px, py, cellPx) * amt * 0.16 * w;
  out[0] = Math.min(1, Math.max(0, out[0] + n));
  out[1] = Math.min(1, Math.max(0, out[1] + n));
  out[2] = Math.min(1, Math.max(0, out[2] + n));
}

/** Creative vignette gain at a CROP-LOCAL uv (0..1 across the visible,
 *  cropped frame — NOT the source frame the lens correction uses). Radius is
 *  normalised so 1 = the frame corner; `mid` sets where the falloff starts,
 *  `amt` < 0 darkens the edges, > 0 lifts them. Mirrors the shader. */
export function creativeVignette(u: number, v: number, aspect: number, amt: number, mid: number): number {
  const dx = (u - 0.5) * aspect;
  const dy = v - 0.5;
  const r = (2 * Math.sqrt(dx * dx + dy * dy)) / Math.sqrt(aspect * aspect + 1);
  return 1 + amt * 0.85 * smooth01(mid * 0.8, 1, r);
}

/** Apply the vignette gain to a display-space pixel IN PLACE. */
export function applyCreativeVignette(out: Float32Array, u: number, v: number, aspect: number, amt: number, mid: number): void {
  const g = creativeVignette(u, v, aspect, amt, mid);
  out[0] = Math.min(1, Math.max(0, out[0] * g));
  out[1] = Math.min(1, Math.max(0, out[1] * g));
  out[2] = Math.min(1, Math.max(0, out[2] * g));
}

// (The per-pixel edit lives in compileEdit below; the GPU shader in gl.ts is
// kept numerically identical to it.)

/**
 * Precompute the edit for export: trig and the hue matrix are computed once,
 * not per pixel. Returns a function writing gamma RGB (0..1) into `out`.
 */
export function compileEdit(
  p: EditParams,
  cam?: number[],
  /** Image width/height — needed by the lens fixes so the hot-spot stays
   *  circular in pixels. Callers without uv (LUT bake) can omit it. */
  aspect = 1,
  /** Per-image clarity/dehaze reference maps; omit (LUT bake) to skip both. */
  local?: LocalMap,
): (r: number, g: number, b: number, out: Float32Array, glow?: number, u?: number, v?: number) => void {
  const a = (p.hue * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const c00 = 0.299 + 0.701 * cos + 0.168 * sin;
  const c01 = 0.587 - 0.587 * cos + 0.33 * sin;
  const c02 = 0.114 - 0.114 * cos - 0.497 * sin;
  const c10 = 0.299 - 0.299 * cos - 0.328 * sin;
  const c11 = 0.587 + 0.413 * cos + 0.035 * sin;
  const c12 = 0.114 - 0.114 * cos + 0.292 * sin;
  const c20 = 0.299 - 0.3 * cos + 1.25 * sin;
  const c21 = 0.587 - 0.588 * cos - 1.05 * sin;
  const c22 = 0.114 + 0.886 * cos - 0.203 * sin;
  // Fold exposure into the WB gains (both linear; order commutes).
  const ex = p.exposure;
  const wr = p.wb[0] * ex, wg = p.wb[1] * ex, wb = p.wb[2] * ex;
  const swap = p.swapRB;
  const sat = p.sat;
  const con = p.contrast;
  const [tr, tg, tb] = p.tint;
  const toneFn = toneIsIdentity(p.tone) ? null : toneEvaluator(p.tone);
  const toneRFn = !p.toneR || toneIsIdentity(p.toneR) ? null : toneEvaluator(p.toneR);
  const toneGFn = !p.toneG || toneIsIdentity(p.toneG) ? null : toneEvaluator(p.toneG);
  const toneBFn = !p.toneB || toneIsIdentity(p.toneB) ? null : toneEvaluator(p.toneB);
  // Global luminance rides on top of the tone curve: pow in display space,
  // endpoints pinned. exponent = 1/lum (lum>1 brightens). 1 = neutral.
  const lumExp = p.lum && p.lum !== 1 ? 1 / p.lum : 0;
  const sky = p.sky;
  const fol = p.foliage;
  const bandsActive =
    sky[0] !== 0 || sky[1] !== 1 || sky[2] !== 1 || fol[0] !== 0 || fol[1] !== 1 || fol[2] !== 1;
  const masks = (p.masks ?? []).filter(maskIsActive).slice(0, MAX_MASKS);
  const hasColorMask = masks.some((m) => m.type === 3);
  const lensOn = (p.hotspot ?? 0) !== 0 || (p.vignette ?? 0) !== 0;
  const cl = p.clarity ?? 0;
  const dz = p.dehaze ?? 0;
  const localOn = local && (cl !== 0 || dz !== 0);
  const mixerOn = !hslIsNeutral(p.hsl);
  const bwOn = !!p.bwOn;
  const bwMix = p.bwMix ?? [1, 1, 1];
  // Normalised weights: only the ratio matters. An all-zero mix divides by the
  // epsilon and lands at black — honest feedback, never NaN.
  const bwDen = Math.max(1e-4, bwMix[0] + bwMix[1] + bwMix[2]);
  const mix3 = p.mix3 ?? MIX3_DEFAULT;
  const mix3On = !mix3IsIdentity(p.mix3);
  const m0 = mix3[0], m1 = mix3[1], m2 = mix3[2];
  const m3 = mix3[3], m4 = mix3[4], m5 = mix3[5];
  const m6 = mix3[6], m7 = mix3[7], m8 = mix3[8];
  const grade = p.grade ?? GRADE_DEFAULT;
  const gAmtS = grade[1] ?? 0, gAmtM = grade[3] ?? 0, gAmtH = grade[5] ?? 0;
  const gradeOn = gAmtS !== 0 || gAmtM !== 0 || gAmtH !== 0;
  const gBal = grade[6] ?? 0;
  const gTintS = gradeTintVec(grade[0] ?? 0);
  const gTintM = gradeTintVec(grade[2] ?? 0);
  const gTintH = gradeTintVec(grade[4] ?? 0);
  const lut = p.lut && p.lut.strength > 0 ? p.lut : null;
  const lutTmp = lut ? new Float32Array(3) : null;

  return (r, g, b, out, glow = 0, u, v) => {
    // Clarity/dehaze act on LINEAR source data before exposure/WB, using the
    // per-image maps — matching the shader (which runs them after denoise).
    if (localOn && u !== undefined && v !== undefined) {
      const [Lb, Dv] = sampleLocalMap(local, u, v);
      if (dz !== 0) {
        // HUE-PRESERVING haze removal: veil-subtract the LUMINANCE only, then
        // scale all channels by the same factor. (Per-channel subtraction in
        // camera-native space shifted colours badly — the native channels are
        // wildly imbalanced pre-WB, so an equal cut is a huge relative cut to
        // the weak channel, then the WB gains blow the error up. Field-found
        // on the iPad, 2026-07-05.)
        const L0 = r * REC709[0] + g * REC709[1] + b * REC709[2];
        if (L0 > 1e-6) {
          const L1 = Math.max(0, L0 - dz * Dv) / Math.max(0.1, 1 - dz * Dv);
          const k = L1 / L0;
          r *= k; g *= k; b *= k;
        }
      }
      if (cl !== 0) {
        const L = r * REC709[0] + g * REC709[1] + b * REC709[2];
        const ratio = Math.min(4, Math.max(0.25, L / Math.max(Lb, 1e-5)));
        const gain = Math.pow(ratio, cl * 0.5);
        r *= gain; g *= gain; b *= gain;
      }
    }
    r *= wr;
    g *= wg;
    b *= wb;
    // IR lens correction: radial luminance gain after WB (spatial -> skipped in
    // the LUT bake where u/v are absent), matching the shader.
    if (lensOn && u !== undefined && v !== undefined) {
      const gain = radialGain(p.hotspot, p.hotspotSize, p.vignette, u, v, aspect);
      r *= gain; g *= gain; b *= gain;
    }
    // Camera-native -> linear sRGB (after WB, before swap), matching the shader.
    if (cam) {
      const cr = cam[0] * r + cam[1] * g + cam[2] * b;
      const cg = cam[3] * r + cam[4] * g + cam[5] * b;
      const cb = cam[6] * r + cam[7] * g + cam[8] * b;
      r = cr;
      g = cg;
      b = cb;
    }
    if (swap) {
      const t = r;
      r = b;
      b = t;
    }
    // Custom false-colour 3×3 mixer (after swap, before hue) — matches the
    // shader's u_mix3. Each output channel is a weighted sum of the inputs.
    if (mix3On) {
      const xr = m0 * r + m1 * g + m2 * b;
      const xg = m3 * r + m4 * g + m5 * b;
      const xb = m6 * r + m7 * g + m8 * b;
      r = xr; g = xg; b = xb;
    }
    let nr = c00 * r + c10 * g + c20 * b;
    let ng = c01 * r + c11 * g + c21 * b;
    let nb = c02 * r + c12 * g + c22 * b;
    const luma = nr * REC709[0] + ng * REC709[1] + nb * REC709[2];
    // Match the shader: saturation boosts fade out in deep shadows
    // (smoothstep(0.02, 0.20, luma)) so they don't amplify chroma noise.
    let satEff = sat;
    if (sat > 1) {
      const t = Math.min(1, Math.max(0, (luma - 0.02) / 0.18));
      satEff = 1 + (sat - 1) * t * t * (3 - 2 * t);
    }
    nr = luma + (nr - luma) * satEff;
    ng = luma + (ng - luma) * satEff;
    nb = luma + (nb - luma) * satEff;
    // Per-colour bands (complementary cool/warm halves), matching the shader:
    // hue shift, sat scale and lum scale weighted by hue distance to the band.
    if (bandsActive) {
      const cr = Math.max(0, nr);
      const cg = Math.max(0, ng);
      const cb = Math.max(0, nb);
      let [h, s, v] = rgb2hsv(cr, cg, cb);
      // R<->B swap reflects hue (h -> 240 - h); re-centre so the sky band
      // stays glued to the same subject in both swap states.
      const wS = bandWeight(h, swap ? 30 : 210, 55, 105);
      const wF = 1 - wS;
      h += sky[0] * wS + fol[0] * wF;
      s = Math.min(1, s * (1 + (sky[1] - 1) * wS) * (1 + (fol[1] - 1) * wF));
      v = v * (1 + (sky[2] - 1) * wS) * (1 + (fol[2] - 1) * wF);
      [nr, ng, nb] = hsv2rgb(h, s, v);
    }
    // Tone tint (sepia etc.) after saturation so it survives mono looks.
    nr *= tr;
    ng *= tg;
    nb *= tb;
    // Halation glow: scattered light adds in LINEAR, before contrast/gamma.
    nr += glow;
    ng += glow;
    nb += glow;
    // Local masks: each adjustment weighted by the mask, in linear space before
    // global contrast/gamma. Spatial (needs image-uv), so skipped when u/v are
    // absent (e.g. the .cube LUT bake) — matching denoise/glow.
    if (masks.length && u !== undefined && v !== undefined) {
      // Colour masks key on the pre-mask colour pushed through contrast +
      // gamma — the colour this pixel DISPLAYS with masks and the steering
      // tools (tone/mixer/lum) off. Steering tools are excluded for TAT-style
      // stability (the key must not drift as you grade after masking) — and
      // tone specifically CANNOT join the key: on the GPU it is a filtered
      // 8-bit LUT texture whose quantisation the steep selection edge
      // amplifies past the ≤2 LSB parity bar (field lesson 2026-07-05). This
      // is exactly what a tap samples via Renderer.readColorKeyPixel (shader
      // u_readMode), so the colour you touch selects itself; fixed pre-mask,
      // so stacking order can't shift the selection.
      let kr = 0, kg = 0, kb = 0;
      if (hasColorMask) {
        kr = toGamma((nr - 0.5) * con + 0.5);
        kg = toGamma((ng - 0.5) * con + 0.5);
        kb = toGamma((nb - 0.5) * con + 0.5);
      }
      for (const m of masks) {
        let w: number;
        if (m.type === 3) {
          w = colorMaskWeight(m, kr, kg, kb);
        } else {
          w = maskWeight(m, u, v);
        }
        if (w <= 0) continue;
        // warmth (linear temp shift)
        nr *= 1 + 0.5 * m.warmth * w;
        nb *= 1 - 0.5 * m.warmth * w;
        // brightness (linear multiply)
        const bf = 1 + (m.brightness - 1) * w;
        nr *= bf; ng *= bf; nb *= bf;
        // saturation (luma-based, matches the global sat model)
        const L = nr * REC709[0] + ng * REC709[1] + nb * REC709[2];
        const sf = 1 + (m.saturation - 1) * w;
        nr = L + (nr - L) * sf; ng = L + (ng - L) * sf; nb = L + (nb - L) * sf;
        // hue rotate by hue*w degrees (same matrix as the global hue)
        if (m.hue !== 0) {
          const a = (m.hue * Math.PI) / 180 * w;
          const cs = Math.cos(a), sn = Math.sin(a);
          const k00 = 0.299 + 0.701 * cs + 0.168 * sn, k01 = 0.587 - 0.587 * cs + 0.33 * sn, k02 = 0.114 - 0.114 * cs - 0.497 * sn;
          const k10 = 0.299 - 0.299 * cs - 0.328 * sn, k11 = 0.587 + 0.413 * cs + 0.035 * sn, k12 = 0.114 - 0.114 * cs + 0.292 * sn;
          const k20 = 0.299 - 0.3 * cs + 1.25 * sn, k21 = 0.587 - 0.588 * cs - 1.05 * sn, k22 = 0.114 + 0.886 * cs - 0.203 * sn;
          const rr = k00 * nr + k10 * ng + k20 * nb;
          const gg = k01 * nr + k11 * ng + k21 * nb;
          const bb = k02 * nr + k12 * ng + k22 * nb;
          nr = rr; ng = gg; nb = bb;
        }
        // contrast (linear, around mid grey)
        const cf = 1 + (m.contrast - 1) * w;
        nr = (nr - 0.5) * cf + 0.5; ng = (ng - 0.5) * cf + 0.5; nb = (nb - 0.5) * cf + 0.5;
      }
    }
    out[0] = toGamma((nr - 0.5) * con + 0.5);
    out[1] = toGamma((ng - 0.5) * con + 0.5);
    out[2] = toGamma((nb - 0.5) * con + 0.5);
    if (toneFn) {
      out[0] = toneFn(out[0]);
      out[1] = toneFn(out[1]);
      out[2] = toneFn(out[2]);
    }
    // Per-channel curves ride ON TOP of the master tone curve, each steering
    // its own channel — display space, before the mixer. Same in the shader.
    if (toneRFn) out[0] = toneRFn(out[0]);
    if (toneGFn) out[1] = toneGFn(out[1]);
    if (toneBFn) out[2] = toneBFn(out[2]);
    // 8-channel HSL mixer in DISPLAY space, on the near-final colour (after
    // gamma + tone curve) — so the hue it classifies is EXACTLY the hue on
    // screen, and the chip you pick owns the colour you see. (It originally
    // ran mid-pipeline in linear space; contrast/gamma/tone shifted hues
    // between there and the display, so chips felt unbound from the live
    // image — field feedback 2026-07-05.)
    if (mixerOn) {
      let [h, s, v] = rgb2hsv(out[0], out[1], out[2]);
      const [dh, ds, dl] = hslAt(p.hsl, h);
      h += dh;
      // POWER-curve saturation, not a multiplier: s^(1/ds) moves low-sat
      // pixels visibly (IR skies live near s≈0.05, where a multiplier does
      // nothing) yet stays gentle near s=1. Identity at ds=1, bounded ≤1.
      s = Math.pow(Math.min(1, Math.max(0, s)), 1 / Math.max(0.05, ds));
      v = Math.min(1, v * dl);
      [out[0], out[1], out[2]] = hsv2rgb(h, s, v);
    }
    // Black & white: channel-weighted mono on the near-final DISPLAY colour
    // (after the mixer, so its per-band luminance shapes the grey; before
    // global lum, which then brightens/darkens the mono). Same in the shader.
    if (bwOn) {
      const L = (out[0] * bwMix[0] + out[1] * bwMix[1] + out[2] * bwMix[2]) / bwDen;
      out[0] = L;
      out[1] = L;
      out[2] = L;
    }
    // Color grade: split-tone wheels. One pure-chroma tint per tonal band,
    // weighted by smoothstep bands over the display luminance; balance
    // shifts the shadow/highlight crossovers. Runs AFTER bwOn so it tones
    // mono frames too (the "toned mono" story). Same in the shader.
    if (gradeOn) {
      const L = out[0] * 0.2126 + out[1] * 0.7152 + out[2] * 0.0722;
      const wS = 1 - smooth01(0.05, 0.6 + 0.2 * gBal, L);
      const wH = smooth01(0.4 + 0.2 * gBal, 0.95, L);
      const wM = Math.max(0, 1 - wS - wH);
      const cS = wS * gAmtS * GRADE_K, cM = wM * gAmtM * GRADE_K, cH = wH * gAmtH * GRADE_K;
      out[0] = Math.min(1, Math.max(0, out[0] + cS * gTintS[0] + cM * gTintM[0] + cH * gTintH[0]));
      out[1] = Math.min(1, Math.max(0, out[1] + cS * gTintS[1] + cM * gTintM[1] + cH * gTintH[1]));
      out[2] = Math.min(1, Math.max(0, out[2] + cS * gTintS[2] + cM * gTintM[2] + cH * gTintH[2]));
    }
    // Global luminance — the very last step of the app's own grade, matching
    // the shader's u_lum.
    if (lumExp) {
      out[0] = Math.pow(out[0], lumExp);
      out[1] = Math.pow(out[1], lumExp);
      out[2] = Math.pow(out[2], lumExp);
    }
    // Imported .cube LUT — the LAST colour stage, on the final display
    // colour (mirrors the shader's u_lutTex block; math in lut3d.ts).
    if (lut && lutTmp) {
      sampleLut3d(lut.data, lut.size, out[0], out[1], out[2], lutTmp);
      const s = lut.strength;
      out[0] += (lutTmp[0] - out[0]) * s;
      out[1] += (lutTmp[1] - out[1]) * s;
      out[2] += (lutTmp[2] - out[2]) * s;
    }
  };
}

function toGamma(v: number): number {
  return Math.pow(Math.min(1, Math.max(0, v)), 1 / 2.2);
}

/** Linearize an 8-bit gamma-encoded value (matches the shader's toLinear). */
export function toLinear8(v: number): number {
  return Math.pow(v / 255, 2.2);
}
