// WebGL2 edit pipeline. Every operation is per-pixel, so it lives in one
// fragment shader and runs in real time on the iPad GPU.
//
// Order matches PLAN.md: white balance -> channel swap -> hue/sat -> tone.

// Single source of truth for edit parameters lives in pipeline.ts so the GPU
// preview and CPU export can never drift apart.
import { toneEvaluator, toneIsIdentity, maskGroupsForRender, hslIsNeutral, MAX_MASKS, MAX_BITMAP_MASKS, CROP_DEFAULT, cropToDisplayUv, displayUvToCrop, GRADE_DEFAULT, gradeIsNeutral, gradeTintVec, grainCellPx, MIX3_DEFAULT, mix3IsIdentity, LENS_GAIN_LO, LENS_GAIN_HI, SAT_GUARD_LO, SAT_GUARD_HI, SKY_SAT_GATE_LO, SKY_SAT_GATE_HI, lensAreaMean, type EditParams, type LocalMap, type SkyMap, type BrushMask, type CropRect } from "./pipeline";
import { toHalfBuffer } from "./half";
export type { EditParams };

// A faithful 256-entry identity ramp for the tone LUT. A 2-texel [0,255] ramp
// is NOT an identity under LINEAR+CLAMP filtering: its texel centres land at
// u=0.25/0.75, so sampling clamps everything below 25% to black and above 75%
// to white. 256 texels sample the diagonal to within half an LSB.
const IDENTITY_LUT = (() => {
  const a = new Uint8Array(256);
  for (let i = 0; i < 256; i++) a[i] = i;
  return a;
})();

/** Fresh RGBA identity ramps (r=g=b=i) for the per-channel curve texture. */
function identityRgbaRamp(): Uint8Array {
  const a = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    a[i * 4] = i;
    a[i * 4 + 1] = i;
    a[i * 4 + 2] = i;
    a[i * 4 + 3] = 255;
  }
  return a;
}

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
out vec2 v_cropUv; // fraction of the OUTPUT (cropped) frame — for grain/vignette
uniform int u_rot; // display rotation in 90-degree CW steps (0..3)
uniform int u_flip; // SOURCE-space mirror: bit 1 = source-x, bit 2 = source-y
uniform vec4 u_crop;       // (x,y,w,h) crop rect in the STRAIGHTENED frame [0,1]
uniform float u_straighten; // radians, applied about the frame centre
uniform float u_dispAspect; // display-rotated frame width/height (pre-crop)
void main() {
  vec2 uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  if (u_rot == 1) uv = vec2(uv.y, 1.0 - uv.x);
  else if (u_rot == 2) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
  else if (u_rot == 3) uv = vec2(1.0 - uv.y, uv.x);
  v_cropUv = uv; // the output-frame fraction, same value export.ts derives as (x+0.5)/w
  // Crop + straighten: uv here is a fraction of the OUTPUT (already the crop
  // rect's own size — see Renderer.applySize). Map it into the straightened
  // frame, then undo the straighten rotation (aspect-corrected, so it reads
  // as a true angle) to find where to sample in the un-straightened,
  // display-rotated source. Kept identical to pipeline.ts's cropToDisplayUv.
  vec2 local = u_crop.xy + uv * u_crop.zw;
  if (u_straighten != 0.0) {
    vec2 d = vec2((local.x - 0.5) * u_dispAspect, local.y - 0.5);
    float cosA = cos(-u_straighten), sinA = sin(-u_straighten);
    vec2 r = vec2(d.x * cosA - d.y * sinA, d.x * sinA + d.y * cosA);
    local = vec2(r.x / u_dispAspect + 0.5, r.y + 0.5);
  }
  // Flip is the INNERMOST op — a source-space mirror, identically composed in
  // export.ts's toSrc and the CPU inverse mappings below. Masks/heals live in
  // source-uv, so through the inverse mapping their rings follow the mirrored
  // pixels, exactly like rotation.
  if ((u_flip & 1) != 0) local.x = 1.0 - local.x;
  if ((u_flip & 2) != 0) local.y = 1.0 - local.y;
  v_uv = local;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
// SAMPLER ARRAYS HAVE NO DEFAULT PRECISION, and a plain sampler2D does — which
// is why this line is needed and nothing warned about its absence (026). GLSL
// ES 3.00 gives float, int and sampler2D a default precision in the fragment
// stage; sampler2DArray is not on that list, so declaring one without a
// qualifier is "'sampler2DArray' : No precision specified" and the WHOLE
// shader fails to compile. The app then reports itself unsupported and opens
// no photograph at all — which is what the bitmap atlases did the moment they
// became arrays, and what the new mask-slots walk caught on the run that was
// meant only to prove the walk could fail. tsc is green either way: a shader
// is a string to it.
precision highp sampler2DArray;
// Bounds for the measured lens gain — see pipeline.ts LENS_GAIN_LO/HI.
// toFixed, NOT the bare number: GLSL will not convert an int literal to a float,
// so an interpolated 2 gives "cannot convert from const int to const highp
// float" and the whole shader fails to compile. The app then reports itself
// unsupported and every browser harness fails on a click being intercepted,
// which looks like a UI change and is a missing decimal point. tsc is green
// either way — a shader is a string to it.
const float LENS_GAIN_LO = ${LENS_GAIN_LO.toFixed(6)};
const float LENS_GAIN_HI = ${LENS_GAIN_HI.toFixed(6)};
const float SAT_GUARD_LO = ${SAT_GUARD_LO.toFixed(6)};
const float SAT_GUARD_HI = ${SAT_GUARD_HI.toFixed(6)};
const float SKY_SAT_GATE_LO = ${SKY_SAT_GATE_LO.toFixed(6)};
const float SKY_SAT_GATE_HI = ${SKY_SAT_GATE_HI.toFixed(6)};
in vec2 v_uv;
in vec2 v_cropUv;
out vec4 frag;
uniform sampler2D u_tex;
uniform vec3 u_wb;
uniform bool u_swap;
uniform float u_hue;   // radians
uniform float u_sat;
uniform float u_con;
uniform float u_exposure;
uniform bool u_linear; // true when the texture already holds linear values
uniform mat3 u_cam;    // camera-native -> linear sRGB
uniform bool u_useCam; // apply u_cam (camera-native raw only)
uniform vec3 u_tint;     // tone tint after saturation ([1,1,1] = none)
uniform bool u_mix3On;   // custom 3×3 channel mixer active
uniform mat3 u_mix3;     // false-colour mixer (column-major upload; after swap, before hue)
uniform vec3 u_sky;      // sky band [hueShiftDeg, satScale, lumScale]
uniform vec3 u_fol;      // foliage band [hueShiftDeg, satScale, lumScale]
uniform sampler2D u_glowTex; // per-image blurred highlight map (see glow.ts)
uniform float u_glow;        // 0..1 HIE halation strength
uniform sampler2D u_toneTex; // 256x1 tone-curve LUT (identity when neutral)
uniform sampler2D u_toneRgbTex; // 256x1 RGBA: per-channel R/G/B curve LUTs
uniform bool u_toneRgbOn;       // any per-channel curve non-identity
uniform float u_lum;         // global luminance: out = pow(out, 1/u_lum) (1 = neutral)
// Local masks (up to MAX_MASKS = 8) — kept identical to pipeline.ts.
uniform int u_maskCount;
uniform int u_maskType[8];   // 0 = radial, 1 = linear, 2 = brush, 3 = colour, 4 = sky
uniform vec4 u_maskGeoA[8];  // radial (cx,cy,rx,ry) | linear (cx,cy,lx,ly)
uniform vec2 u_maskGeoB[8];  // (feather, invert)
uniform vec4 u_maskAdj[8];   // (brightness, contrast, saturation, warmth)
uniform float u_maskHue[8];  // degrees
uniform int u_maskSlot[8];   // brush/sky: which packed channel (0..3); -1 otherwise
uniform sampler2DArray u_maskTex; // brush/sky masks, four per RGBA layer (MAX_BITMAP_MASKS max)
uniform sampler2DArray u_maskFineTex; // sky masks (type 4) refined to the picture's edges, same slots
uniform bool u_maskFineOn;      // false when no sky mask has a refinement to read
uniform int u_maskOp[8];     // 0 head (starts a group) · 1 subtract · 2 intersect (026)
uniform int u_maskAims[8];   // bitmask of stages this mask gates: 1 dehaze, 2 clarity (030)
                             // LITERAL 8, like every array above it: MAX_MASKS is a
                             // TypeScript constant and means nothing inside GLSL —
                             // written as MAX_MASKS first, and the shader silently
                             // failed to compile, so the app opened no files at all.
uniform int u_readMode;      // 1 = output the mask-stage DISPLAY colour and stop
                             //     (lets the colour mask read its own key colour)
uniform float u_hotspot;     // IR hot-spot correction (darken centre) 0..0.8
uniform float u_hotspotSize; // hot-spot radial extent
uniform float u_hotspotColor; // -0.5..0.5 the hot-spot's COLOUR (+red / -blue at centre)
// The reader's MEASURED lens colour curve: an Nx1 RG float texture, R = the red
// gain and G = the blue gain, one texel per radial bin. texelFetch rather
// than texture() on purpose — no filtering, so the bin the shader reads is
// exactly the bin the CPU mirror indexes, and GPU/CPU parity is by construction
// rather than by tolerance.
uniform sampler2D u_lensTex;
uniform int u_lensN;      // 0 when no measured profile matched this photograph
uniform float u_lensFix;  // measured colour strength; 0 is off
uniform float u_lensBump;  // shipped brightness strength; 0 is off
uniform float u_vignette;    // -1..1 (+ brighten corners, - darken)
uniform float u_aspect;      // image width/height — keeps the lens fix circular in pixels
uniform float u_recover;     // 0..1 pull sensor-clipped pixels to post-WB neutral
uniform float u_clarity;     // -1..1 local contrast vs the blurred-luma map
uniform float u_dehaze;      // -1..1 veil subtraction vs the dark-channel map
uniform sampler2D u_localTex; // RG8: sqrt-encoded blurred luma (R) + dark channel (G)
uniform float u_localScale;   // linear decode scale for u_localTex
uniform bool u_hslOn;        // 8-channel HSL mixer active
uniform vec3 u_hsl[8];       // per band: (hueShiftDeg, satScale, lumScale)
uniform bool u_bwOn;         // black & white: channel-weighted mono
uniform vec3 u_bwMix;        // B&W channel weights (normalised in-shader)
uniform sampler2D u_skyFineTex; // R8 per-image sky bitmap refined to the picture's edges (skyfine.ts)
uniform float u_skyDepth;       // 0..1 — see EditParams.skyDepth; 0 without a map or a refined bitmap
uniform float u_skySat;         // 0..2 — see EditParams.skySat; 0 without a refined bitmap
uniform sampler2D u_skyTex;  // RGB8 per-edit sky chroma map (skymap.ts):
                             //   R,G = opponent chroma encoded ±0.5 -> 0..255,
                             //   B = the sky bitmap's weight
uniform float u_skySmooth;   // 0..1 amount — see EditParams.skySmooth
uniform float u_shadowSat;   // 0..1 shadow desaturation — see
                             //   EditParams.shadowSat: MULTIPLIED, never
                             //   tinted, so a grey shadow cannot gain a colour
uniform bool u_gradeOn;      // any wheel amount non-zero
uniform vec3 u_gradeTintS;   // pure-chroma tint vectors, precomputed on the
uniform vec3 u_gradeTintM;   //   CPU by pipeline.ts gradeTintVec so both
uniform vec3 u_gradeTintH;   //   sides add IDENTICAL numbers
uniform vec3 u_gradeAmt;     // (amtShadows, amtMids, amtHighlights) 0..1
uniform float u_gradeBal;    // -1..1 shifts the shadow/highlight crossovers
uniform float u_grainAmt;    // 0..1 film grain (0 = stage off)
uniform float u_grainCell;   // grain cell size in OUTPUT pixels (grainCellPx)
uniform float u_vigAmt;      // creative vignette -1..1 (0 = stage off)
uniform float u_vigMid;      // vignette midpoint 0..1
uniform float u_outAspect;   // output (cropped) frame aspect, for the vignette
uniform vec2 u_outPx;        // output frame size in pixels, for grain coords
uniform float u_denoise; // 0..1 bilateral strength (see raw/denoise.ts)
uniform float u_chroma;  // 0..1 how far COLOUR is mixed to the plain 5x5 blur (raw/denoise.ts)
uniform float u_despeckle; // 0..1 decision-based median on the centre pixel (raw/denoise.ts)
uniform float u_sharpen; // 0..1 capture sharpening (high-freq) — see raw/detail.ts
uniform float u_texture; // -1..1 mid-freq local contrast — see raw/detail.ts
uniform vec2 u_texel;    // 1/textureSize
uniform float u_split;   // compare divider: denoise applies where uv.x >= split
uniform int u_spotVis;   // 1 = "Visualize spots": amplified high-pass luma view
uniform int u_maskViz;   // >=0 = show that mask's coverage as a preview overlay
uniform int u_maskMatte; // 1 = show it as a MATTE instead of a tint (preview only)
uniform sampler2D u_warpTex; // RG displacement field (unit 7, LINEAR); 0.5 = no move
uniform bool u_warpOn;       // any warp painted
uniform sampler2D u_overlayTex; // on-top sticker overlay (unit 8): gamma sRGB + coverage alpha
uniform bool u_overlayOn;       // any on-top sticker placed
uniform sampler2D u_overlayScreenTex; // SCREEN-blend overlay (unit 9): glowing lights
uniform bool u_overlayScreenOn;        // any screen-blend (glow) sticker placed
uniform float u_warpScale;   // decode scale = WARP_MAX (warp.ts)
uniform highp sampler3D u_lutTex; // imported .cube LUT lattice (unit 5, NEAREST — manual trilinear below)
uniform int u_lutSize;            // grid N per axis (>=2; only read when strength > 0)
uniform float u_lutStrength;      // 0..1; 0.0 = stage entirely off

const vec3 LUMA_W = vec3(0.2126, 0.7152, 0.0722);

// Trilinear sample of the imported LUT — the VERBATIM twin of
// src/lut3d.ts sampleLut3d (parity harness pins them at <=2 LSB). Manual
// interpolation on integer texelFetch coords: WebGL2 won't linearly filter
// 32F textures, and texelFetch sidesteps texel-centre ambiguity entirely.
vec3 sampleLut3d(vec3 c) {
  float n1 = float(u_lutSize - 1);
  vec3 t = clamp(c, 0.0, 1.0) * n1;
  ivec3 i0 = min(ivec3(floor(t)), ivec3(u_lutSize - 2));
  vec3 f = t - vec3(i0);
  vec3 c000 = texelFetch(u_lutTex, i0,                0).rgb;
  vec3 c100 = texelFetch(u_lutTex, i0 + ivec3(1,0,0), 0).rgb;
  vec3 c010 = texelFetch(u_lutTex, i0 + ivec3(0,1,0), 0).rgb;
  vec3 c110 = texelFetch(u_lutTex, i0 + ivec3(1,1,0), 0).rgb;
  vec3 c001 = texelFetch(u_lutTex, i0 + ivec3(0,0,1), 0).rgb;
  vec3 c101 = texelFetch(u_lutTex, i0 + ivec3(1,0,1), 0).rgb;
  vec3 c011 = texelFetch(u_lutTex, i0 + ivec3(0,1,1), 0).rgb;
  vec3 c111 = texelFetch(u_lutTex, i0 + ivec3(1,1,1), 0).rgb;
  vec3 c00 = mix(c000, c100, f.x), c10 = mix(c010, c110, f.x);
  vec3 c01 = mix(c001, c101, f.x), c11 = mix(c011, c111, f.x);
  return mix(mix(c00, c10, f.y), mix(c01, c11, f.y), f.z);
}

vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toGamma(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
// Warp: read the displacement field (RG encoded, 0.5 = none) and remap the
// source coordinate — every fetchLin (centre AND neighbourhood taps) warps
// together, so denoise/detail follow the moved image. Mirrored in warp.ts.
vec2 warpUv(vec2 uv){
  if (!u_warpOn) return uv;
  // Decode centred on byte 128 (= exactly zero), scale 127 — matches warp.ts.
  vec2 d = (texture(u_warpTex, uv).xy * 255.0 - 128.0) / 127.0;
  return uv + d * u_warpScale;
}
vec3 fetchLin(vec2 uv){ vec3 s = texture(u_tex, warpUv(uv)).rgb; return u_linear ? s : toLinear(s); }

// MEDIAN OF NINE, the same nineteen-pair network as raw/denoise.ts. There is no
// sorting in GLSL and there does not need to be: a fixed network is branchless,
// costs the same on every pixel, and is the arrangement the CPU side uses, so
// the two cannot drift by one being cleverer than the other.
float median9(float a0, float a1, float a2, float a3, float a4, float a5, float a6, float a7, float a8) {
  float t;
  t = min(a1, a2); a2 = max(a1, a2); a1 = t;
  t = min(a4, a5); a5 = max(a4, a5); a4 = t;
  t = min(a7, a8); a8 = max(a7, a8); a7 = t;
  t = min(a0, a1); a1 = max(a0, a1); a0 = t;
  t = min(a3, a4); a4 = max(a3, a4); a3 = t;
  t = min(a6, a7); a7 = max(a6, a7); a6 = t;
  t = min(a1, a2); a2 = max(a1, a2); a1 = t;
  t = min(a4, a5); a5 = max(a4, a5); a4 = t;
  t = min(a7, a8); a8 = max(a7, a8); a7 = t;
  t = min(a0, a3); a3 = max(a0, a3); a0 = t;
  t = min(a5, a8); a8 = max(a5, a8); a5 = t;
  t = min(a4, a7); a7 = max(a4, a7); a4 = t;
  t = min(a3, a6); a6 = max(a3, a6); a3 = t;
  t = min(a1, a4); a4 = max(a1, a4); a1 = t;
  t = min(a2, a5); a5 = max(a2, a5); a2 = t;
  t = min(a4, a7); a7 = max(a4, a7); a4 = t;
  t = min(a4, a2); a2 = max(a4, a2); a4 = t;
  t = min(a6, a4); a4 = max(a6, a4); a6 = t;
  t = min(a4, a2); a2 = max(a4, a2); a4 = t;
  return a4;
}

vec3 rgb2hsv(vec3 c){
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0*d + e)), d/(q.x + e), q.x);
}
vec3 hsv2rgb(vec3 c){
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz)*6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
float bandWeight(float hue, float center, float plateau, float edge){
  float d = abs(hue - center);
  d = min(d, 360.0 - d);
  return 1.0 - smoothstep(plateau, edge, d);
}
// pipeline.ts bandGain, line for line: a boost is guarded by the pixel's own
// saturation (SAT_GUARD_LO..HI), a reduction is not.
float bandGain(float k, float w, float s){
  float g = 1.0 + (k - 1.0) * w;
  return g > 1.0 ? 1.0 + (g - 1.0) * smoothstep(SAT_GUARD_LO, SAT_GUARD_HI, s) : g;
}
// Grain hash + value noise — the VERBATIM twin of pipeline.ts hash2d /
// grainNoise (uint multiply wraps exactly like Math.imul; >> matches >>>).
float hash2d(int x, int y){
  uint h = (uint(x) * 0x27d4eb2du) ^ (uint(y) * 0x165667b1u);
  h = (h ^ (h >> 15u)) * 0x85ebca6bu;
  h = (h ^ (h >> 13u)) * 0xc2b2ae35u;
  h ^= h >> 16u;
  return float(h) / 4294967296.0;
}
float grainNoise(vec2 p, float cell){
  vec2 gd = p / cell;
  vec2 i = floor(gd);
  vec2 f = gd - i;
  vec2 s = f * f * (3.0 - 2.0 * f);
  int x0 = int(i.x), y0 = int(i.y);
  float n00 = hash2d(x0, y0),     n10 = hash2d(x0 + 1, y0);
  float n01 = hash2d(x0, y0 + 1), n11 = hash2d(x0 + 1, y0 + 1);
  return mix(mix(n00, n10, s.x), mix(n01, n11, s.x), s.y) * 2.0 - 1.0;
}
float radialGain(vec2 uv){
  // Circular in PIXELS (hot-spots are optically round): scale x by the image
  // aspect, normalise so r = 1 at the frame corner. Matches pipeline.ts.
  vec2 d = vec2((uv.x - 0.5) * u_aspect, uv.y - 0.5);
  float r = 2.0 * length(d) / sqrt(u_aspect * u_aspect + 1.0);
  float gVig = 1.0 + u_vignette * 0.85 * smoothstep(0.07, 1.0, r);
  float gHot = 1.0 - u_hotspot * (1.0 - smoothstep(0.0, max(1e-3, u_hotspotSize), r));
  return max(0.0, gVig * gHot);
}
/** The hot-spot's radial weight alone: 1 at the centre, 0 past u_hotspotSize.
 *  Shared with radialGain above so both describe the same circle, and mirrored
 *  by hotspotWeight() in pipeline.ts. */
// THE MEASURED GAIN, BOUNDED, and the same arithmetic as pipeline.ts lensGain.
// The two limits are injected from that one constant rather than typed here, so
// the shader and the CPU mirror cannot be given two different bounds. The old
// form guarded the divisor instead of the gain, which admits a factor of a
// thousand and then snaps back to 1 — see pipeline.ts lensGain for what that
// cost and why a bin of zero reached 100x at strength 0.99.
//
// NOTE FOR ANYONE EDITING THE COMMENTS IN THIS FILE: the shader is a JavaScript
// template literal, so a backtick in a comment ends it and the rest of the
// shader is parsed as TypeScript. This paragraph replaces one that quoted the
// old expression in backticks and did exactly that.
float lensGain(float k, float s) {
  float v = 1.0 + (k - 1.0) * s;
  if (!(v > 1e-6)) return LENS_GAIN_HI;
  return clamp(1.0 / v, LENS_GAIN_LO, LENS_GAIN_HI);
}

float hotspotWeight(vec2 uv){
  vec2 d = vec2((uv.x - 0.5) * u_aspect, uv.y - 0.5);
  float r = 2.0 * length(d) / sqrt(u_aspect * u_aspect + 1.0);
  return 1.0 - smoothstep(0.0, max(1e-3, u_hotspotSize), r);
}
float maskWeight(int i, vec2 uv){
  vec4 gA = u_maskGeoA[i];
  float w;
  if (u_maskType[i] == 0) {
    float dx = (uv.x - gA.x) / max(1e-4, gA.z);
    float dy = (uv.y - gA.y) / max(1e-4, gA.w);
    float r = sqrt(dx*dx + dy*dy);
    w = 1.0 - smoothstep(1.0 - u_maskGeoB[i].x, 1.0, r);
  } else {
    vec2 g = vec2(gA.z - gA.x, gA.w - gA.y);
    float len2 = max(1e-4, dot(g, g));
    float t = dot(uv - gA.xy, g) / len2;
    w = 1.0 - clamp(t, 0.0, 1.0);
  }
  if (u_maskGeoB[i].y > 0.5) w = 1.0 - w;
  return w;
}
// The colour a pre-mask LINEAR pixel DISPLAYS, with masks and the steering
// tools (tone/mixer/lum) off: contrast -> gamma. The colour-mask key space.
// Pure ALU on purpose — routing it through the tone LUT texture broke GPU==CPU
// (8-bit filtered lookup vs exact float math; field lesson 2026-07-05).
vec3 keyDisplay(vec3 c){
  return toGamma(clamp((c - 0.5) * u_con + 0.5, 0.0, 1.0));
}
// Colour mask (type 3): weight from the pixel's DISPLAY-space hue/saturation
// distance to the tapped target, chroma-key style. c is the running LINEAR
// colour at the mask stage (before any mask); keyDisplay() lifts it to what
// it shows on screen. The distance is NORMALISED by the target's own
// saturation, so Range means "how far from THIS colour, relative to how
// colourful it is" — hue discrimination stays constant whether the image's
// chroma is vivid or IR-flat (absolute distance could not discriminate on
// low-sat IR frames; field bug 2026-07-05). satTarget < 0 = unpicked -> inert.
// u_maskGeoA[i] = (hueTargetDeg, satTarget, colorRange, -). Matches pipeline.ts.
float colorMaskWeight(int i, vec3 c){
  vec4 gA = u_maskGeoA[i]; // (hueTargetDeg, satTarget, colorRange, -)
  if (gA.y < 0.0) return 0.0; // unpicked mask is inert (invert included)
  vec3 d = keyDisplay(c);
  // HSV chroma-plane vector s*(cosH,sinH) straight from RGB (opponent
  // projection / V) — continuous, so it matches pipeline.ts to float epsilon.
  float V = max(max(d.r, d.g), d.b);
  vec2 pv = V > 1e-6 ? vec2((d.r - 0.5 * (d.g + d.b)) / V, 0.8660254 * (d.g - d.b) / V) : vec2(0.0);
  float tRad = radians(gA.x);
  vec2 tv = vec2(gA.y * cos(tRad), gA.y * sin(tRad));
  float nd = length(pv - tv) / max(0.08, gA.y);
  float edge = max(1e-4, gA.z);
  float plateau = edge * (1.0 - u_maskGeoB[i].x);
  float w = 1.0 - smoothstep(plateau, edge, nd);
  if (u_maskGeoB[i].y > 0.5) w = 1.0 - w;
  return w;
}

// ONE MASK'S OWN WEIGHT, so a group's head and its components read the same
// function (026). Before this the head's weight was computed inline in the
// mask loop and nothing else could ask for a mask's weight — which is fine
// with one mask per adjustment and impossible once several combine.
// Identical in intent to maskWeight/colorMaskWeight's callers in pipeline.ts;
// the agreement walk holds the two implementations together.
float maskWeightOf(int i, vec3 cKey){
  if (u_maskType[i] == 2 || u_maskType[i] == 4) {
    int s = u_maskSlot[i];
    if (s < 0) return 0.0;              // beyond the slot cap
    // SLOT -> LAYER + CHANNEL. The atlas is a 2D ARRAY: four masks per RGBA
    // layer, so slot 5 is layer 1, channel 1. Identical arithmetic in the main
    // loop below and in the JS packers; all three must move together.
    vec3 st = vec3(v_uv, float(s >> 2));
    float w = (u_maskType[i] == 4 && u_maskFineOn)
      ? texture(u_maskFineTex, st)[s & 3]
      : texture(u_maskTex, st)[s & 3];
    if (u_maskGeoB[i].y > 0.5) w = 1.0 - w;  // invert
    return w;
  }
  if (u_maskType[i] == 3) return colorMaskWeight(i, cKey);
  return maskWeight(i, v_uv);
}

// HOW MUCH OF AN AIMED STAGE APPLIES HERE (decision 030). The mirror of
// aimWeight() in pipeline.ts, walking the same flattened list in the same
// order. 1.0 when nothing aims, so an unaimed frame renders exactly as it did
// before this existed. Colour masks are skipped: their key is the pixel as it
// DISPLAYS at the mask stage and does not exist this early.
float aimWeightOf(int bit){
  float w = 0.0;
  bool any = false;
  for (int i = 0; i < u_maskCount; i++) {
    if ((u_maskAims[i] & bit) == 0) continue;
    if (u_maskType[i] == 3) continue;
    any = true;
    w = max(w, maskWeightOf(i, vec3(0.0)));
    if (w >= 1.0) break;
  }
  return any ? w : 1.0;
}

void main() {
  // Outside the source image, output transparent so the dark stage shows through
  // instead of the edge texel smearing (CLAMP_TO_EDGE). Only the crop/straighten
  // PREVIEW reaches here with v_uv beyond [0,1] (full frame + live tilt); normal
  // render and export inscribe the crop inside the image, so this never fires.
  if (v_uv.x < 0.0 || v_uv.x > 1.0 || v_uv.y < 0.0 || v_uv.y > 1.0) {
    frag = vec4(0.0);
    return;
  }
  // "Visualize spots": a high-contrast luminance high-pass of the SOURCE (the
  // healed texture — so a fixed spot visibly disappears), Lightroom's trick
  // for surfacing dust in flat skies. Preview-only; never exported, so it has
  // no CPU mirror. Same 7x7 sigma-2 blur as the texture band in detail.ts.
  if (u_spotVis == 1) {
    vec2 ctr = (floor(v_uv / u_texel) + 0.5) * u_texel;
    float sum = 0.0, wsum = 0.0, Lc = 0.0;
    for (int dy = -3; dy <= 3; dy++) {
      for (int dx = -3; dx <= 3; dx++) {
        float L = dot(fetchLin(ctr + vec2(float(dx), float(dy)) * u_texel), LUMA_W);
        if (dx == 0 && dy == 0) Lc = L;
        float w = exp(-float(dx * dx + dy * dy) / 8.0);
        sum += L * w; wsum += w;
      }
    }
    float blurT = sum / wsum;
    float d = (Lc - blurT) / (blurT + 0.015);
    frag = vec4(vec3(clamp(0.5 + d * 5.0, 0.0, 1.0)), 1.0);
    return;
  }

  vec3 c = fetchLin(v_uv);
  // Clip severity from the SOURCE sample (sensor pin lives in native space),
  // captured before denoise/clarity can blur it. Used by highlight recovery.
  float srcClip = 0.0;
  if (u_useCam && u_recover > 0.0) {
    vec3 k = smoothstep(vec3(0.985), vec3(0.995), c);
    srcClip = max(k.r, max(k.g, k.b));
  }

  // Denoise FIRST, on linear sensor data, before the big IR gains amplify the
  // noise. Same 5x5 brightness-adaptive bilateral as raw/denoise.ts.
  // DESPECKLE FIRST, AND THE ORDER IS THE POINT. lc below is the centre's
  // luma and every neighbour's weight is measured against it, so a centre that
  // is an impulse makes every neighbour look wrong and collapses the bilateral
  // onto the very pixel that should have gone. A bilateral preserves outliers by
  // construction — see raw/denoise.ts and IR-SCIENCE.md 4c-ix — which is why
  // neither smoother below can reach a pale dot in a deep sky and this can.
  //
  // A DECISION, NOT A FILTER, and PER CHANNEL. Identical rule and constant to
  // raw/denoise.ts: the centre must be the extreme of its own 3x3 AND sit
  // further from that window's median than k times the window's spread.
  vec3 ctr = c;
  if (u_despeckle > 0.0 && v_uv.x >= u_split) {
    float k = 0.45 * (1.0 - u_despeckle) + 0.02; // keep in sync with raw/denoise.ts
    vec3 n[9];
    int q = 0;
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        n[q] = fetchLin(v_uv + vec2(float(dx), float(dy)) * u_texel);
        q++;
      }
    }
    vec3 lo = n[0], hi = n[0];
    for (int j = 1; j < 9; j++) { lo = min(lo, n[j]); hi = max(hi, n[j]); }
    vec3 med = vec3(
      median9(n[0].r, n[1].r, n[2].r, n[3].r, n[4].r, n[5].r, n[6].r, n[7].r, n[8].r),
      median9(n[0].g, n[1].g, n[2].g, n[3].g, n[4].g, n[5].g, n[6].g, n[7].g, n[8].g),
      median9(n[0].b, n[1].b, n[2].b, n[3].b, n[4].b, n[5].b, n[6].b, n[7].b, n[8].b));
    bvec3 extreme = bvec3(c.r <= lo.r || c.r >= hi.r, c.g <= lo.g || c.g >= hi.g, c.b <= lo.b || c.b >= hi.b);
    bvec3 far = greaterThan(abs(c - med), k * (hi - lo));
    ctr = mix(c, med, vec3(extreme.x && far.x, extreme.y && far.y, extreme.z && far.z));
    c = ctr;
  }
  if ((u_denoise > 0.0 || u_chroma > 0.0) && v_uv.x >= u_split) {
    // A FLOOR RATHER THAN A BRANCH when the luminance half is off — same reason
    // as raw/denoise.ts: sigma 0 makes the centre tap 0 * Infinity.
    float sigma = u_denoise > 0.0 ? 0.1 * u_denoise * u_denoise : 1e-6; // keep in sync with raw/denoise.ts rangeSigma()
    float inv2s2 = 1.0 / (2.0 * sigma * sigma);
    float lc = dot(c, LUMA_W);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    vec3 gsum = vec3(0.0);
    float gw = 0.0;
    // THIRTEEN PIXELS ACROSS, DENSE — identical to raw/denoise.ts, and the
    // width is the fix rather than an optimisation. A 5x5 cannot flatten the
    // three-to-five-pixel luminance mottle in a deep infrared sky; the colour
    // half was widened to this span for that reason and the luminance half was
    // left behind (IR-SCIENCE.md 4c-xxii). Dense, not strided: a sparse lattice
    // samples a noise field periodically and that is itself a pattern.
    for (int dy = -6; dy <= 6; dy++) {
      for (int dx = -6; dx <= 6; dx++) {
        // The centre tap is the corrected pixel, for the same reason lc is.
        vec3 s = (dx == 0 && dy == 0) ? ctr : fetchLin(v_uv + vec2(float(dx), float(dy)) * u_texel);
        float rel = (dot(s, LUMA_W) - lc) / (lc + 0.02);
        float sp = exp(-float(dx*dx + dy*dy) / 18.0);
        float w = sp * exp(-rel * rel * inv2s2);
        sum += s * w;
        wsum += w;
        // The same taps weighted spatially only — the plain blur the colour
        // half is mixed toward. Identical math to raw/denoise.ts.
        // (the colour mean has its own wider grid below)
      }
    }
    vec3 m = sum / wsum;
    if (u_chroma > 0.0) {
      // THE COLOUR MEAN, ON ITS OWN WIDER GRID — identical to raw/denoise.ts.
      // 7x7 at stride two, spanning thirteen pixels, because the mottle it has
      // to reach is three to five across and the bilateral's five-pixel window
      // cannot flatten it. Stride THREE was tried first and left a fine regular
      // cross-hatch: sampling a noise field periodically is itself a pattern.
      // Forty-nine fetches, only when the colour half is on.
      for (int dy = -3; dy <= 3; dy++) {
        for (int dx = -3; dx <= 3; dx++) {
          vec3 s2 = fetchLin(v_uv + vec2(float(dx * 2), float(dy * 2)) * u_texel);
          float sp2 = exp(-float(dx*dx + dy*dy) / 8.0);
          gsum += s2 * sp2;
          gw += sp2;
        }
      }
      // Luminance from the edge-preserving mean, colour from the plain one.
      // Identical to raw/denoise.ts, and at u_chroma 0 the two halves recombine
      // into exactly m — which is why the branch above returns it untouched.
      vec3 b = gsum / gw;
      float lm = dot(m, LUMA_W);
      float lb = dot(b, LUMA_W);
      c = lm + (m - lm) + ((b - lb) - (m - lm)) * u_chroma;
    } else {
      c = m;
    }
  }

  // Detail: sharpen (high-freq) + texture (mid-freq) on LINEAR data, after
  // denoise and before WB — a hue-preserving luminance gain from two Gaussian
  // blurs of the neighbourhood luma. Same math + constants as raw/detail.ts
  // (R=3, sigma 1.0/2.0 -> 2*sigma^2 = 2.0/8.0; KS=2.2, KT=2.4, EPS=0.05).
  if (u_sharpen > 0.0 || u_texture != 0.0) {
    // Snap to the exact texel CENTRE so LINEAR filtering returns whole texels —
    // otherwise sub-texel drift in the interpolated v_uv, amplified by the
    // unsharp gain at hard edges, breaks GPU==CPU parity (the CPU indexes
    // integer pixels). Matches raw/detail.ts's exact-pixel neighbourhood.
    vec2 ctr = (floor(v_uv / u_texel) + 0.5) * u_texel;
    float sumS = 0.0, sumT = 0.0, wsumS = 0.0, wsumT = 0.0, Lc = 0.0;
    for (int dy = -3; dy <= 3; dy++) {
      for (int dx = -3; dx <= 3; dx++) {
        float L = dot(fetchLin(ctr + vec2(float(dx), float(dy)) * u_texel), LUMA_W);
        if (dx == 0 && dy == 0) Lc = L;
        float d2 = float(dx * dx + dy * dy);
        float wS = exp(-d2 / 2.0);
        float wT = exp(-d2 / 8.0);
        sumS += L * wS; wsumS += wS;
        sumT += L * wT; wsumT += wT;
      }
    }
    float blurS = sumS / wsumS;
    float blurT = sumT / wsumT;
    float hp = 2.2 * u_sharpen * (Lc - blurS) + 2.4 * u_texture * (blurS - blurT);
    float gain = clamp(1.0 + hp / (Lc + 0.05), 0.25, 3.0);
    c *= gain;
  }

  // Clarity / Dehaze on LINEAR source data (after denoise, before exposure/WB),
  // referencing the per-image maps. Identical math to compileEdit.
  if (u_clarity != 0.0 || u_dehaze != 0.0) {
    vec2 e = texture(u_localTex, v_uv).rg;
    float Lb = e.r * e.r * u_localScale;
    float Dv = e.g * e.g * u_localScale;
    // Aimed, if any mask asked (030). Both are the slider unchanged when
    // nothing aims at them.
    float dzA = u_dehaze * aimWeightOf(1);
    float clA = u_clarity * aimWeightOf(2);
    if (dzA != 0.0) {
      // Hue-preserving: veil-subtract the luminance, scale all channels alike.
      float L0 = dot(c, LUMA_W);
      if (L0 > 1e-6) {
        float L1 = max(0.0, L0 - dzA * Dv) / max(0.1, 1.0 - dzA * Dv);
        c *= L1 / L0;
      }
    }
    if (clA != 0.0) {
      float L = dot(c, LUMA_W);
      float ratio = clamp(L / max(Lb, 1e-5), 0.25, 4.0);
      c *= pow(ratio, clA * 0.5);
    }
  }

  // Exposure (linear) then white balance (the unbounded gains Lightroom can't reach).
  c *= u_exposure;
  c *= u_wb;

  // Highlight recovery: blown pixels move toward post-WB neutral at their own
  // luminance. Post-WB "neutral" is the one hue the row-normalized camera
  // matrix preserves exactly, so a recovered pixel cannot shift colour; the
  // pull is scale-invariant, so exposure folding is safe. Raw only, user
  // slider, default 0 (photos open untouched — owner rule 2026-07-25).
  if (srcClip > 0.0) {
    float F = u_recover * srcClip;
    float Yr = dot(c, LUMA_W);
    c = mix(c, vec3(Yr), F);
  }

  // IR lens correction: radial luminance gain (hot-spot / vignette) after WB.
  if (u_hotspot != 0.0 || u_vignette != 0.0) c *= radialGain(v_uv);
  // And the hot-spot's COLOUR, on the same circle — before the swap and the
  // matrix below, so it corrects the LENS rather than the false-colour result.
  if (u_hotspotColor != 0.0) {
    float t = hotspotWeight(v_uv);
    c.r *= 1.0 + u_hotspotColor * t;
    c.b *= 1.0 - u_hotspotColor * t;
  }
  // The MEASURED curve, on the same side of the matrix and the swap. Its own
  // branch: it does not depend on any manual slider being set.
  if (u_lensN > 0 && (u_lensFix != 0.0 || u_lensBump != 0.0)) {
    vec2 d = vec2((v_uv.x - 0.5) * u_aspect, v_uv.y - 0.5);
    float r = 2.0 * length(d) / sqrt(u_aspect * u_aspect + 1.0);
    int i = clamp(int(floor(r * float(u_lensN))), 0, u_lensN - 1);
    vec3 k = texelFetch(u_lensTex, ivec2(i, 0), 0).rgb;
    // The brightness half rides all three channels; the colour half is a ratio
    // against green, so green takes the bump and nothing else.
    float ic = lensGain(1.0 + k.b, u_lensBump);
    c.r *= lensGain(k.r, u_lensFix) * ic;
    c.g *= ic;
    c.b *= lensGain(k.g, u_lensFix) * ic;
  }

  // Camera colour matrix: separates infrared chroma into distinct hues so the
  // channel swap can produce real false colour instead of a single tint.
  if (u_useCam) c = u_cam * c;

  // Channel swap.
  if (u_swap) c = c.bgr;

  // Custom false-colour 3×3 mixer (after swap, before hue). u_mix3 is uploaded
  // column-major (bindPipeline transposes the row-major param) so this is the
  // same output = M * input as pipeline.ts. Identity when off.
  if (u_mix3On) c = u_mix3 * c;

  // Hue rotation in linear space via the standard YIQ-style matrix.
  float cosA = cos(u_hue), sinA = sin(u_hue);
  mat3 hueMat = mat3(
    0.299 + 0.701*cosA + 0.168*sinA, 0.587 - 0.587*cosA + 0.330*sinA, 0.114 - 0.114*cosA - 0.497*sinA,
    0.299 - 0.299*cosA - 0.328*sinA, 0.587 + 0.413*cosA + 0.035*sinA, 0.114 - 0.114*cosA + 0.292*sinA,
    0.299 - 0.300*cosA + 1.250*sinA, 0.587 - 0.588*cosA - 1.050*sinA, 0.114 + 0.886*cosA - 0.203*sinA
  );
  c = hueMat * c;

  // Saturation around luma. Boosts (sat > 1) fade out in deep shadows so the
  // look doesn't amplify chroma noise there; reductions apply everywhere.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  float satEff = u_sat <= 1.0 ? u_sat : 1.0 + (u_sat - 1.0) * smoothstep(0.02, 0.20, luma);
  c = mix(vec3(luma), c, satEff);

  // Per-colour bands (complementary halves), matching pipeline.ts. The swap
  // reflects hue (h -> 240 - h), so the sky band re-centres to stay glued to
  // the same real-world subject in both swap states.
  if (u_sky != vec3(0.0, 1.0, 1.0) || u_fol != vec3(0.0, 1.0, 1.0)) {
    vec3 hsv = rgb2hsv(max(c, 0.0));
    float h = hsv.x * 360.0;
    // pipeline.ts skyBandCentre: the swapped centre only while no mixer is on
    float wS = bandWeight(h, (u_swap && !u_mix3On) ? 30.0 : 210.0, 55.0, 105.0);
    float wF = 1.0 - wS;
    h += u_sky.x * wS + u_fol.x * wF;
    float s = min(1.0, hsv.y * bandGain(u_sky.y, wS, hsv.y) * bandGain(u_fol.y, wF, hsv.y));
    float v = hsv.z * (1.0 + (u_sky.z - 1.0) * wS) * (1.0 + (u_fol.z - 1.0) * wF);
    c = hsv2rgb(vec3(fract(h / 360.0), s, v));
  }

  // Tone tint (sepia etc.) after saturation so it survives mono looks.
  c *= u_tint;

  // Halation glow: scattered light adds in LINEAR, before contrast/gamma.
  // 0.7 = GLOW_GAIN in glow.ts — keep in sync.
  c += vec3(u_glow * 0.7 * texture(u_glowTex, v_uv).r);

  // Colour-mask key read: emit the key-space colour (keyDisplay of the
  // pre-mask colour) and stop, so a tap samples exactly what colorMaskWeight
  // keys against. (Must sit right before the mask loop.)
  if (u_readMode == 1) { frag = vec4(keyDisplay(c), 1.0); return; }

  // Colour masks all key on the mask-STAGE colour (this fixed cKey, before any
  // mask) — exactly what a tap samples — so the colour you touch selects itself
  // and stacking order can't shift the selection. Matches compileEdit.
  vec3 cKey = c;

  // Captured weight of the mask being visualised (u_maskViz), for the coverage
  // overlay at the end. 0 where that mask doesn't reach.
  float vizW = 0.0;

  // Local masks: each adjustment weighted by the mask, in linear space before
  // global contrast/gamma. Identical math to compileEdit in pipeline.ts.
  for (int i = 0; i < u_maskCount; i++) {
    // A COMPONENT WAS ALREADY FOLDED INTO ITS HEAD (026) — skip it here, or its
    // adjustment would be applied a second time on its own.
    if (u_maskOp[i] != 0) continue;
    float w;
    if (u_maskType[i] == 2 || u_maskType[i] == 4) {
      // Brush (painted) and sky (heuristic-generated) both read their weight
      // from the packed bitmap texture — the sky heuristic's connectivity work
      // is baked into the bitmap in JS, so there is no sky-specific shader math.
      int s = u_maskSlot[i];       // packed slot for this mask (0..7)
      if (s < 0) continue;         // beyond the slot cap: mask is inactive
      // A SKY MASK READS THE REFINED ATLAS (018) so the reader's own mask has
      // the same crisp boundary the look's sky stages already had. Two atlases
      // rather than one because they are different sizes and the packer skips
      // any bitmap whose dimensions differ from the first — see MaskLayer.fine.
      vec3 st = vec3(v_uv, float(s >> 2));   // layer = slot / 4, channel = slot % 4
      w = (u_maskType[i] == 4 && u_maskFineOn)
        ? texture(u_maskFineTex, st)[s & 3]
        : texture(u_maskTex, st)[s & 3];
      if (u_maskGeoB[i].y > 0.5) w = 1.0 - w; // invert
    } else if (u_maskType[i] == 3) {
      w = colorMaskWeight(i, cKey); // chroma-key on the fixed mask-stage colour
    } else {
      w = maskWeight(i, v_uv);
    }
    // FOLD THIS GROUP'S COMPONENTS IN. Subtract is w * (1 - wc), intersect is
    // w * wc — darktable's exclusive/inclusive algebra, which reduces to the
    // boolean set operation on hard masks and stays continuous on soft edges.
    // Identical to groupWeight() in pipeline.ts; the agreement walk is what
    // holds the two to each other.
    for (int j = i + 1; j < u_maskCount; j++) {
      if (u_maskOp[j] == 0) break;          // next head: this group is done
      if (w <= 0.0) break;
      float wc = maskWeightOf(j, cKey);
      w *= (u_maskOp[j] == 1) ? (1.0 - wc) : wc;
    }
    if (i == u_maskViz) vizW = w; // the true post-invert coverage of the shown mask
    if (w <= 0.0) continue;
    vec4 adj = u_maskAdj[i]; // brightness, contrast, saturation, warmth
    c.r *= 1.0 + 0.5 * adj.w * w;
    c.b *= 1.0 - 0.5 * adj.w * w;
    c *= 1.0 + (adj.x - 1.0) * w;
    float ml = dot(c, LUMA_W);
    c = mix(vec3(ml), c, 1.0 + (adj.z - 1.0) * w);
    float hue = u_maskHue[i];
    if (hue != 0.0) {
      float a = radians(hue) * w;
      float cs = cos(a), sn = sin(a);
      mat3 hm = mat3(
        0.299 + 0.701*cs + 0.168*sn, 0.587 - 0.587*cs + 0.330*sn, 0.114 - 0.114*cs - 0.497*sn,
        0.299 - 0.299*cs - 0.328*sn, 0.587 + 0.413*cs + 0.035*sn, 0.114 - 0.114*cs + 0.292*sn,
        0.299 - 0.300*cs + 1.250*sn, 0.587 - 0.588*cs - 1.050*sn, 0.114 + 0.886*cs - 0.203*sn
      );
      c = hm * c;
    }
    c = (c - 0.5) * (1.0 + (adj.y - 1.0) * w) + 0.5;
  }

  // Contrast around mid grey.
  c = (c - 0.5) * u_con + 0.5;

  vec3 g = toGamma(clamp(c, 0.0, 1.0));
  // Tone curve (blacks/shadows/mids/whites/highlights), display space.
  g = vec3(
    texture(u_toneTex, vec2(g.r, 0.5)).r,
    texture(u_toneTex, vec2(g.g, 0.5)).r,
    texture(u_toneTex, vec2(g.b, 0.5)).r
  );
  // Per-channel R/G/B curves ride ON TOP of the master curve, each steering
  // its own channel (display space, before the mixer). Matches pipeline.ts.
  if (u_toneRgbOn) {
    g = vec3(
      texture(u_toneRgbTex, vec2(g.r, 0.5)).r,
      texture(u_toneRgbTex, vec2(g.g, 0.5)).g,
      texture(u_toneRgbTex, vec2(g.b, 0.5)).b
    );
  }
  // 8-channel HSL mixer in DISPLAY space (after gamma + tone curve) so the
  // hue it classifies is exactly the hue on screen. Matches pipeline.ts.
  if (u_hslOn) {
    vec3 hsv = rgb2hsv(g);
    float h = hsv.x * 360.0;
    const float CTR[9] = float[9](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 280.0, 320.0, 360.0);
    int bi = 7;
    for (int k = 0; k < 7; k++) {
      if (h >= CTR[k] && h < CTR[k + 1]) { bi = k; break; }
    }
    int bj = bi == 7 ? 0 : bi + 1;
    float t = (h - CTR[bi]) / (CTR[bi + 1] - CTR[bi]);
    float w = t * t * (3.0 - 2.0 * t);
    vec3 adj = mix(u_hsl[bi], u_hsl[bj], w);
    // Power-curve saturation (see pipeline.ts): visible on low-sat IR pixels.
    float s2 = pow(clamp(hsv.y, 0.0, 1.0), 1.0 / max(0.05, adj.y));
    g = hsv2rgb(vec3(fract((h + adj.x) / 360.0), s2, min(1.0, hsv.z * adj.z)));
  }
  // Black & white: channel-weighted mono on the near-final DISPLAY colour
  // (after the mixer — its per-band luminance shapes the grey — and before
  // global lum). Weights are normalised, so only their ratio matters.
  // Identical math to compileEdit in pipeline.ts.
  if (u_bwOn) g = vec3(dot(g, u_bwMix) / max(1e-4, u_bwMix.r + u_bwMix.g + u_bwMix.b));
  // Shadow desaturation: the colour OUT of the dark end. Scales the distance
  // from luma (the same operator u_sat uses), so saturation zero stays zero at
  // every amount — which the additive grade below cannot promise. Same
  // smoothstep reach as that grade's shadow band, at a fixed balance.
  // Matches compileEdit; EditParams.shadowSat says why it is here.
  float shA = u_shadowSat * aimWeightOf(4);
  if (shA > 0.0) {
    float Ls = dot(g, LUMA_W);
    float ks = 1.0 - shA * (1.0 - smoothstep(0.05, 0.6, Ls));
    g = vec3(Ls) + (g - vec3(Ls)) * ks;
  }
  // Color grade: split-tone wheels — one pure-chroma tint per tonal band,
  // weighted by smoothstep bands over the display luminance; balance shifts
  // the shadow/highlight crossovers. AFTER B&W (so it tones mono too),
  // before global lum. 0.35 = pipeline.ts GRADE_K. Matches compileEdit.
  if (u_gradeOn) {
    float Lg = dot(g, LUMA_W);
    float wS = 1.0 - smoothstep(0.05, 0.6 + 0.2 * u_gradeBal, Lg);
    float wH = smoothstep(0.4 + 0.2 * u_gradeBal, 0.95, Lg);
    float wM = max(0.0, 1.0 - wS - wH);
    g = clamp(g + 0.35 * (wS * u_gradeAmt.x * u_gradeTintS
                        + wM * u_gradeAmt.y * u_gradeTintM
                        + wH * u_gradeAmt.z * u_gradeTintH), 0.0, 1.0);
  }
  // Sky colour smoothing: blend chroma toward the coarse map of the sky's own
  // rendered chroma, by the sky bitmap's weight, luma exactly preserved. After
  // the grade, before lum and the LUT. Decode mirrors pipeline.ts decSkyChroma
  // with SKY_CHROMA_RANGE 0.5. Matches compileEdit.
  // GATED on the pixel's own chroma distance from the target, 0.12..0.25 —
  // pipeline.ts SKY_GATE_LO/HI, same numbers, same Hermite (smoothstep IS
  // smooth01). A branch the soft mask leaks into sits half a range from the
  // sky and is left alone; a mottled sky pixel is hundredths away and is
  // smoothed. Without this the export of an oak against the sky went blue
  // along every branch (2026-09-18).
  if (u_skySmooth > 0.0 || u_skyDepth > 0.0 || u_skySat > 0.0) {
    vec4 sm = texture(u_skyTex, v_uv);
    if (u_skySmooth > 0.0 && sm.b > 0.0) {
      float Lk = dot(g, LUMA_W);
      vec2 tgt = (sm.rg * 2.0 - 1.0) * 0.5;
      vec2 cur = vec2(g.r - Lk, g.b - Lk);
      float ks = u_skySmooth * sm.b * (1.0 - smoothstep(0.12, 0.25, length(tgt - cur)));
      if (ks > 0.0) {
        vec2 nw = cur + (tgt - cur) * ks;
        // Clamped as compileEdit clamps: the framebuffer would clamp anyway,
        // but the LUT and lum stages below read these, and the CPU path's
        // 16-bit write does not clamp on its own.
        g.r = clamp(Lk + nw.x, 0.0, 1.0);
        g.b = clamp(Lk + nw.y, 0.0, 1.0);
        g.g = clamp((Lk - LUMA_W.r * g.r - LUMA_W.b * g.b) / LUMA_W.g, 0.0, 1.0);
      }
    }
    // SKY SATURATION — see compileEdit: more colour where the sky is, through
    // the refined bitmap, gated on the pixel's own saturation so a cloud or an
    // overcast sky stays grey. After the blend, before the depth.
    if (u_skySat > 0.0) {
      float fw = texture(u_skyFineTex, v_uv).r;
      if (fw > 0.0) {
        float gate = smoothstep(SKY_SAT_GATE_LO, SKY_SAT_GATE_HI, rgb2hsv(max(g, 0.0)).y);
        if (gate > 0.0) {
          float Ls = dot(g, LUMA_W);
          g = clamp(Ls + (g - Ls) * (1.0 + u_skySat * fw * gate), 0.0, 1.0);
        }
      }
    }
    // SKY DEPTH — see compileEdit: one multiplier through the REFINED bitmap
    // and the map's keying byte (a blue sky, not an overcast or a grey).
    if (u_skyDepth > 0.0 && sm.a > 0.0) {
      g *= (1.0 - u_skyDepth * sm.a * texture(u_skyFineTex, v_uv).r);
    }
  }
  // Global luminance rides on top of the tone curve (endpoints pinned).
  if (u_lum != 1.0) g = pow(clamp(g, 0.0, 1.0), vec3(1.0 / u_lum));

  // Imported .cube LUT — the LAST colour stage, on the final display colour,
  // so third-party LUTs stack on top of the whole IR grade. Identical math to
  // pipeline.ts's compileEdit tail (via lut3d.ts).
  if (u_lutStrength > 0.0) g = mix(g, sampleLut3d(clamp(g, 0.0, 1.0)), u_lutStrength);

  // ON-TOP stickers — laid over the FINISHED look (after every colour stage,
  // before grain), so they keep their OWN colours instead of being cooked by the
  // infrared pipeline. The overlay is a source-space RGBA8 texture (gamma sRGB +
  // straight coverage alpha) sampled at the same v_uv as the photo; export.ts
  // blends the identical value into its finished pixel (parity). Grain then
  // settles over the sticker, as before.
  if (u_overlayOn) {
    vec4 ov = texture(u_overlayTex, v_uv);
    g = mix(g, ov.rgb, ov.a);
  }
  // Glowing lights composite with SCREEN (they ADD light instead of sitting on
  // top), so a beam/aura/orb brightens the scene like real light. Same source-uv
  // sampling + display-space blend as the over layer, mirrored in export.ts.
  if (u_overlayScreenOn) {
    vec4 sv = texture(u_overlayScreenTex, v_uv);
    g = 1.0 - (1.0 - g) * (1.0 - sv.rgb * sv.a);
  }

  // Creative vignette + film grain — the FINAL image ops, keyed on
  // CROP-LOCAL coords (v_cropUv spans the visible, cropped frame; export.ts
  // hands the same (x+0.5)/w fractions to the pipeline.ts twins). Spatial:
  // deliberately NOT in compileEdit, so neither can bake into a .cube.
  // Vignette first, grain on top — grain rides over the darkened corners
  // like film. Matches applyCreativeVignette / applyGrain in pipeline.ts.
  if (u_vigAmt != 0.0) {
    vec2 vd = vec2((v_cropUv.x - 0.5) * u_outAspect, v_cropUv.y - 0.5);
    float vr = 2.0 * length(vd) / sqrt(u_outAspect * u_outAspect + 1.0);
    g = clamp(g * (1.0 + u_vigAmt * 0.85 * smoothstep(u_vigMid * 0.8, 1.0, vr)), 0.0, 1.0);
  }
  if (u_grainAmt > 0.0) {
    float Ln = dot(g, LUMA_W);
    float gw = 0.25 + 0.75 * (1.0 - abs(2.0 * Ln - 1.0));
    float gn = grainNoise(v_cropUv * u_outPx, u_grainCell) * u_grainAmt * 0.16 * gw;
    g = clamp(g + gn, 0.0, 1.0);
  }

  // Mask coverage overlay (preview only; u_maskViz = the selected mask, -1 off).
  // Shows exactly which pixels the mask affects, feather and all, for ANY mask
  // type (radial/linear also draw handles over this). The covered area keeps
  // its colour under a cool tint; everything else dims + desaturates — so the
  // region reads by SHAPE and BRIGHTNESS, not colour alone (accessibility
  // rule), and stays visible over any content, even same-hue. Never exported.
  if (u_maskViz >= 0) {
    float cov = clamp(vizW, 0.0, 1.0);
    if (u_maskMatte == 1) {
      // THE MATTE. The tint below keeps the photograph's own colour under a
      // cool wash, which is the right thing when you are placing a radial and
      // the wrong thing when you are judging a generated selection: the looks
      // that swap red and blue render IR-bright foliage CYAN, so the tint and
      // the population that over-selects are the same colour, and the defect
      // 029 measured could not be seen on the device at all. Here the
      // photograph drops to dim monochrome and the selection is the only
      // colour on screen, so coverage reads by BRIGHTNESS as well as by hue
      // and a half-covered pixel reads as half. Preview only — never exported.
      vec3 mono = vec3(dot(g, LUMA_W)) * 0.45;
      g = mix(mono, vec3(1.0, 0.92, 0.25), cov);
    } else {
      vec3 inside = mix(g, vec3(0.20, 0.85, 1.0), 0.32);
      vec3 outside = mix(vec3(dot(g, LUMA_W)), g, 0.5) * 0.5;
      g = mix(outside, inside, cov);
    }
  }
  frag = vec4(g, 1.0);
}`;

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private imgW = 0;
  private imgH = 0;
  private rotQ = 0; // display rotation, 90-degree CW steps
  private flipBits = 0; // source-space mirror: bit 1 = x, bit 2 = y (see VERT u_flip)
  private crop: CropRect = CROP_DEFAULT; // last-applied crop, drives canvas size + inverse mapping
  private straighten = 0; // last-applied straighten angle (degrees), for inverse mapping
  private isLinear = false;
  private isHalf = false;   // the texture is RGBA16F rather than RGBA32F
  private contextLost = false;
  /** Told when the browser takes the graphics away — see the constructor. */
  onContextLost?: () => void;
  onContextRestored?: () => void;

  /** True once the browser has taken the context away. Every draw after that is
   *  a no-op whatever this class does, so callers check it rather than painting
   *  nothing and reporting success. */
  get lost(): boolean {
    return this.contextLost || this.gl.isContextLost();
  }
  private camMatrix: Float32Array | null = null;
  private patchHalf = new Uint16Array(0); // reused scratch for half-float patches
  private glowTex: WebGLTexture;
  /** Upload a measured lens colour curve for the photograph now open, or clear
   *  it with null. Per-PHOTOGRAPH, never per-draw: the curve is chosen by the
   *  file's EXIF and does not change as the reader edits. */
  /** Upload the radial lens curve: red-against-green, blue-against-green and
   *  the shipped brightness bump, one texel per bin. One texture rather than
   *  two because both halves are read at the same bin on the same draw, and a
   *  second lookup would be a second chance for them to disagree about which
   *  ring a pixel is in. A half that is absent uploads as neutral, so the two
   *  are independently on or off without a second code path. */
  setLensCurve(kr: ArrayLike<number> | null, kb?: ArrayLike<number> | null, bump?: ArrayLike<number> | null): void {
    const gl = this.gl;
    const cN = kr && kb ? Math.min(kr.length, kb.length) : 0;
    const bN = bump ? bump.length : 0;
    // A BIN COUNT IS A RADIUS MAPPING, NOT A RESOLUTION — see pipeline.ts. The
    // shorter of the two used to win, which stretches the longer curve outward
    // rather than trimming it. When they disagree the colour half keeps its own
    // length and the brightness half stands down, matching the CPU mirror.
    const useB = bN > 1 && (cN <= 1 || cN === bN);
    const n = cN > 1 ? cN : useB ? bN : 0;
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this.lensTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (n < 2) {
      this.lensN = 0;
      this.lensHasColour = false;
      this.lensHasBump = false;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, 1, 1, 0, gl.RGB, gl.FLOAT, new Float32Array([1, 1, 0]));
      return;
    }
    // Normalised to its own area-weighted mean on the way into the texture, so
    // the curve redistributes colour without tinting the frame. compileEdit
    // does the same thing when it assembles its gains — lensAreaMean's contract
    // says these are the only two places allowed to, and they must agree.
    const areaR = cN > 1 ? lensAreaMean(kr) : 1;
    const areaB = cN > 1 ? lensAreaMean(kb) : 1;
    const data = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      data[i * 3] = cN > 1 ? kr![i] * areaR : 1;
      data[i * 3 + 1] = cN > 1 ? kb![i] * areaB : 1;
      data[i * 3 + 2] = useB ? bump![i] : 0;
    }
    this.lensN = n;
    this.lensHasColour = cN > 1;
    this.lensHasBump = useB;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB32F, n, 1, 0, gl.RGB, gl.FLOAT, data);
  }

  private toneTex: WebGLTexture;
  private lensTex: WebGLTexture;
  private lensN = 0;
  private lensHasColour = false;
  private lensHasBump = false;
  private toneRgbTex: WebGLTexture;
  private brushTex: WebGLTexture;
  private brushFineTex: WebGLTexture;
  /** The refined atlas's upload signature and whether it holds anything — the
   *  shader reads `u_maskFineOn` and falls back to the coarse atlas when off. */
  private brushFineSig = "";
  // ONE FLAG FOR EVERY SLOT, which is a latent hazard worth naming rather than
  // a defect anyone has met. The shader reads the refined atlas for ALL bitmap
  // masks when this is on, and it goes on if ANY sky mask has a refinement —
  // so two sky masks on one photograph, one of them on a frame whose guide
  // could not be built, would have the guideless one read a slot nobody wrote.
  // It needs two sky masks and a failed guide to show, which is why it has not;
  // the fix is a per-slot mask rather than a flag, and it belongs to whoever
  // next changes this atlas.
  private brushFineOn = false;
  private brushSig = ""; // re-upload the packed brush texture only when it changes
  private localTex: WebGLTexture;
  private skyTex: WebGLTexture;
  private skyOn = false;
  private skyFineTex: WebGLTexture;
  private fineOn = false;
  private warpTex!: WebGLTexture;
  private warpOn = false;
  private overlayTex!: WebGLTexture; // on-top sticker overlay (unit 8)
  private overlayOn = false;
  private overlayScreenTex!: WebGLTexture; // screen-blend (glow) overlay (unit 9)
  private overlayScreenOn = false;
  private localScale = 1;
  private lutTex: WebGLTexture;
  private lutSig = ""; // re-upload the 3D LUT only when its identity changes
  // Small offscreen target for the live histogram: the full edit re-rendered at
  // <=HIST_MAX px so a per-frame GPU->CPU readback stays cheap on the iPad.
  private histFbo: WebGLFramebuffer | null = null;
  private histTex: WebGLTexture | null = null;
  private histW = 0;
  private histH = 0;
  private histBuf: Uint8Array | null = null;

  private tapScale = 1;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is required and not available on this device.");
    this.gl = gl;
    // A LOST CONTEXT USED TO BE A BLANK EDITOR WITH NO EXPLANATION, AND IT
    // SURVIVED CLEARING THE SESSION.
    //
    // The browser takes the graphics context away when it runs short of memory,
    // when iOS backgrounds the tab for long enough, or when the driver resets.
    // Every draw after that silently does nothing — no error, no exception, no
    // warning — so the photograph disappears, and starting a fresh session does
    // not help, because a session does not make a new context. Only reloading
    // the page does. Somebody hitting this has no way to know that.
    //
    // preventDefault is what makes restoration POSSIBLE at all; without it the
    // browser never fires the restored event. Actually rebuilding every program,
    // texture and uniform is a bigger piece of work than this, so for now the
    // job is to stop it being silent and to say the one thing that fixes it.
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.contextLost = true;
      this.onContextLost?.();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      // Not treated as recovered: the programs and textures this class built are
      // all gone, and pretending otherwise would draw nothing while claiming to
      // work. The flag stays set until a reload builds a real one.
      this.onContextRestored?.();
    });
    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(this.prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    for (const u of ["u_tex", "u_wb", "u_swap", "u_hue", "u_sat", "u_con", "u_exposure", "u_linear", "u_cam", "u_useCam", "u_denoise", "u_chroma", "u_despeckle", "u_sharpen", "u_texture", "u_texel", "u_split", "u_tint", "u_glowTex", "u_glow", "u_sky", "u_fol", "u_mix3On", "u_mix3", "u_rot", "u_crop", "u_straighten", "u_dispAspect", "u_toneTex", "u_toneRgbTex", "u_toneRgbOn", "u_lum", "u_maskCount", "u_maskType", "u_maskGeoA", "u_maskGeoB", "u_maskAdj", "u_maskHue", "u_maskSlot", "u_maskOp", "u_maskAims", "u_maskTex", "u_maskFineTex", "u_maskFineOn", "u_readMode", "u_hotspot", "u_hotspotSize", "u_hotspotColor", "u_lensTex", "u_lensN", "u_lensFix", "u_lensBump", "u_vignette", "u_aspect", "u_recover", "u_clarity", "u_dehaze", "u_localTex", "u_localScale", "u_hslOn", "u_hsl", "u_bwOn", "u_bwMix", "u_skyTex", "u_skySmooth", "u_skyFineTex", "u_skyDepth", "u_skySat", "u_shadowSat", "u_gradeOn", "u_gradeTintS", "u_gradeTintM", "u_gradeTintH", "u_gradeAmt", "u_gradeBal", "u_grainAmt", "u_grainCell", "u_vigAmt", "u_vigMid", "u_outAspect", "u_outPx", "u_warpTex", "u_warpOn", "u_warpScale", "u_spotVis", "u_maskViz", "u_maskMatte", "u_lutTex", "u_lutSize", "u_lutStrength", "u_flip", "u_overlayTex", "u_overlayOn", "u_overlayScreenTex", "u_overlayScreenOn"]) {
      this.loc[u] = gl.getUniformLocation(this.prog, u);
    }
    // Float textures (for 14-bit linear raw) need this extension to be color-
    // renderable; sampling works regardless, and we filter NEAREST.
    gl.getExtension("EXT_color_buffer_float");

    this.tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    // Glow map texture (unit 1); starts as a single black texel so the shader
    // safely reads zero glow until a map is set.
    this.glowTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));

    // Tone-curve LUT (unit 2); a 256-entry identity ramp until a curve is set.
    // The measured lens curve (unit 10). RG32F so a 5% correction is not
    // quantised into 8-bit steps, and NEAREST because the shader fetches an
    // exact texel rather than sampling between them.
    this.lensTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.lensTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 1, 1, 0, gl.RG, gl.FLOAT, new Float32Array([1, 1]));

    this.toneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, IDENTITY_LUT);

    // Per-channel R/G/B curve LUTs (unit 6): one RGBA row, each channel its
    // own curve; identity ramps until set (the stage is branch-gated anyway).
    this.toneRgbTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.toneRgbTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, identityRgbaRamp());

    // Brush-mask atlas (unit 3): MAX_BITMAP_MASKS painted/sky masks packed four
    // per RGBA layer of a 2D ARRAY.
    //
    // AN ARRAY RATHER THAN MORE 2D TEXTURES, and the reason is texture units
    // (026). Raising the cap from 4 to 8 needs twice the packed channels, and
    // the obvious route — a second coarse atlas and a second fine one — costs
    // two more units. Units 0..13 are already bound here and the WebGL2
    // FRAGMENT floor is 16, so that route lands on the floor exactly, with
    // nothing left for the next texture anything wants. An array grows by
    // LAYERS instead, so slots 8..11 would cost no unit at all.
    // Starts as a single transparent texel on one layer (all masks empty).
    this.brushTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.brushTex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    // Refined sky-mask texture (unit 13): the same four slots as brushTex, but
    // holding each type-4 mask's `fine` bitmap at SKY_FINE_EDGE. A second atlas
    // rather than a bigger first one because updateBrushTexture sizes the atlas
    // from its first entry and SKIPS any bitmap of another size — one texture
    // for both would drop a 384 painted mask the moment a 1024 sky mask joined
    // it. Starts as a single transparent texel.
    this.brushFineTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.brushFineTex);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    // Clarity/dehaze reference maps (unit 4); a single zero texel until an
    // image's map is set (the shader branch is off while the sliders are 0).
    this.skyTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 0]));
    // The refined sky bitmap (unit 12), per image; a single zero texel until
    // one is set, and the depth uniform stays 0 while none is.
    this.skyFineTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.skyFineTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
    this.localTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.localTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([0, 0]));

    // Imported-.cube LUT lattice (unit 5): a 3D texture, NEAREST on purpose —
    // WebGL2 won't linearly filter 32F, and the shader interpolates manually
    // (sampleLut3d) so GPU==CPU share the exact arithmetic. Starts as a 2x2x2
    // zero block so the sampler is complete before any LUT is imported (the
    // stage is branch-gated on u_lutStrength anyway).
    this.lutTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, 2, 2, 2, 0, gl.RGBA, gl.FLOAT, new Float32Array(2 * 2 * 2 * 4));

    // Warp displacement field (unit 7): RGBA8, LINEAR + CLAMP_TO_EDGE — the CPU
    // export replicates this exact sampling (warp.ts sampleWarp). A single
    // 0.5-grey texel = no displacement until a field is uploaded.
    this.warpTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.warpTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 255]));

    // On-top sticker overlay (unit 8): RGBA8, LINEAR + CLAMP_TO_EDGE, matched to
    // the source size. gamma sRGB colour + straight coverage alpha; the CPU
    // export replicates the exact same values (makeStickerOverlaySampler).
    this.overlayTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));

    // Screen-blend overlay (unit 9) — same shape as the over overlay, for glows.
    this.overlayScreenTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.overlayScreenTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
  }

  /** (Re)allocate the on-top overlay to the source size, cleared to transparent.
   *  Call whenever the source (previewSrc) changes; keeps the overlay 1:1 with
   *  the photo so the shader can sample it at the same v_uv. */
  setOverlaySize(width: number, height: number) {
    const gl = this.gl;
    this.overlayOn = false;
    this.overlayScreenOn = false;
    for (const tex of [this.overlayTex, this.overlayScreenTex]) {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(width * height * 4));
    }
  }

  /** Whether any on-top / screen sticker is currently uploaded (the blend is on). */
  setOverlayOn(on: boolean) { this.overlayOn = on; }
  setOverlayScreenOn(on: boolean) { this.overlayScreenOn = on; }

  /** Patch an RGBA8 sub-rect of the over overlay (gamma sRGB + alpha). */
  patchOverlay(x: number, y: number, w: number, h: number, data: Uint8Array) {
    this.patchTex(this.overlayTex, x, y, w, h, data);
  }
  /** Patch an RGBA8 sub-rect of the screen (glow) overlay. */
  patchOverlayScreen(x: number, y: number, w: number, h: number, data: Uint8Array) {
    this.patchTex(this.overlayScreenTex, x, y, w, h, data);
  }
  private patchTex(tex: WebGLTexture, x: number, y: number, w: number, h: number, data: Uint8Array) {
    if (w <= 0 || h <= 0) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data);
  }

  /** Upload the warp displacement field (RGBA8 res×res), or clear with null. */
  setWarpField(field: { res: number; rgba: Uint8Array } | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.warpTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!field) {
      this.warpOn = false;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 255]));
      return;
    }
    this.warpOn = true;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, field.res, field.res, 0, gl.RGBA, gl.UNSIGNED_BYTE, field.rgba);
  }

  /** Upload the per-image clarity/dehaze maps (or clear with null). */
  /** Upload the per-edit sky chroma map, or clear it. LINEAR-filtered on the
   *  encoded bytes, then decoded in the shader — the same order sampleSkyMap
   *  uses, so the two agree to filtering error. A null map turns the stage off
   *  regardless of the amount, which is how a frame with no sky costs nothing. */
  setSkyMap(m: SkyMap | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.skyOn = !!m;
    if (!m) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 0, 0]));
      return;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, m.width, m.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(m.rgba));
  }

  /** Upload the per-image refined sky bitmap (skyfine.ts) for `skyDepth` and `skySat`, or
   *  clear it. LINEAR-filtered like the brush sampler compileEdit reads it
   *  with, so the two agree to filtering error. Null turns the depth off
   *  regardless of the amount, exactly as a null map does the smoothing. */
  setSkyFine(m: BrushMask | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.skyFineTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    this.fineOn = !!m;
    if (!m) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      return;
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, m.w, m.h, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(m.data));
  }

  setLocalMap(m: LocalMap | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.localTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!m) {
      this.localScale = 1;
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array([0, 0]));
      return;
    }
    this.localScale = m.scale;
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, m.width, m.height, 0, gl.RG, gl.UNSIGNED_BYTE, new Uint8Array(m.rg));
  }

  /** Pack the active bitmap masks — brush (type 2) and sky (type 4) — into the
   *  RGBA brush texture, re-uploading only when their content changes. `slotOf`
   *  maps each mask's loop index to its packed channel (0..3), or -1 for a
   *  non-bitmap mask (and for any bitmap mask beyond MAX_BITMAP_MASKS). This
   *  slot is decoupled from the global mask index, so a brush at index ≥4 still
   *  packs into a valid channel — the shader reads via u_maskSlot to match. */
  /** How many RGBA layers the bitmap atlases need for a slot map.
   *
   *  Takes the slot map (one entry per uploaded mask, -1 for "not a bitmap");
   *  returns at least 1.
   *
   *  What the result must satisfy: BOTH atlases are sized by this, from the
   *  SAME map, so every layer the shader can address exists in each. Sizing
   *  each from its own list instead lets the coarse atlas reach layer 1 while
   *  the fine one has only layer 0 — and a sky mask in slot 4..7 would then
   *  sample a layer that was never allocated. It is also why the count goes
   *  into both cache signatures: a mask arriving in a higher slot changes the
   *  coarse list, and without the count in the signature the fine atlas would
   *  keep its stale, too-short allocation. */
  private atlasLayers(slotOf: number[]): number {
    let top = -1;
    for (const s of slotOf) if (s > top) top = s;
    return top < 0 ? 1 : (top >> 2) + 1;
  }

  private updateBrushTexture(masks: EditParams["masks"], slotOf: number[]) {
    const gl = this.gl;
    // A CORRECTED SELECTION UPLOADS ITS COMPOSITE (031). `eff` is the
    // automatic bitmap with the reader's own strokes replayed over it, and it
    // is what compileEdit's `maskWeight` reads on the CPU — the two sides must
    // pick the same buffer by the same test or the agreement walk splits.
    const brushes = masks
      .map((m, i) => ({ m, i, slot: slotOf[i], bm: (m.eff ?? m.brush) }))
      .filter((x) => (x.m.type === 2 || x.m.type === 4) && x.bm && x.slot >= 0);
    const layers = this.atlasLayers(slotOf);
    const sig = `${layers}#` + brushes.map((x) => `${x.slot}:${x.bm!.w}x${x.bm!.h}:${x.m.rev ?? 0}`).join("|");
    if (sig === this.brushSig) return;
    this.brushSig = sig;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.brushTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!brushes.length) {
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return;
    }
    const bw = brushes[0].bm!.w, bh = brushes[0].bm!.h;
    // FOUR MASKS PER LAYER: slot >> 2 is the layer and slot & 3 the channel,
    // the same arithmetic the shader does. The count comes from atlasLayers so
    // this atlas and the refined one are always the same depth, and it is the
    // HIGHEST SLOT IN USE rather than MAX_BITMAP_MASKS / 4 — one mask must not
    // make the app upload an empty second layer of a full-size bitmap.
    const packed = new Uint8Array(bw * bh * 4 * layers);
    for (const { bm, slot } of brushes) {
      const b = bm!;
      if (b.w !== bw || b.h !== bh) continue; // all brush masks share one size
      const base = (slot >> 2) * bw * bh * 4 + (slot & 3);
      for (let p = 0; p < bw * bh; p++) packed[base + p * 4] = b.data[p];
    }
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, bw, bh, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);
  }

  /** Pack every SKY mask's refined bitmap into the second atlas, on the same
   *  slots updateBrushTexture uses, and say whether the shader may read it.
   *
   *  Takes the mask list and the same slot map; returns nothing, and sets
   *  `brushFineOn` — the shader falls back to the coarse atlas when it is
   *  false, so a photograph whose guide could not be built still renders the
   *  mask it always did rather than nothing at all.
   *
   *  What the result must satisfy: a slot written here holds the refinement of
   *  the SAME mask whose coarse bitmap occupies that slot in `brushTex`, and
   *  `brushFineOn` is true only when at least one such slot was written —
   *  compileEdit's CPU path picks `fine` over `brush` by the same test, and the
   *  agreement walk is what holds the two together. */
  private updateBrushFineTexture(masks: EditParams["masks"], slotOf: number[]) {
    const gl = this.gl;
    const fines = masks
      .map((m, i) => ({ m, i, slot: slotOf[i], bm: (m.effFine ?? m.fine) }))
      .filter((x) => x.m.type === 4 && x.bm && x.slot >= 0);
    const layers = this.atlasLayers(slotOf);
    const sig = `${layers}#` + fines.map((x) => `${x.slot}:${x.bm!.w}x${x.bm!.h}:${x.m.rev ?? 0}`).join("|");
    if (sig === this.brushFineSig) return;
    this.brushFineSig = sig;
    this.brushFineOn = fines.length > 0;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.brushFineTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!fines.length) {
      gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 0]));
      return;
    }
    const fw = fines[0].bm!.w, fh = fines[0].bm!.h;
    // THE SAME SLOT ARITHMETIC AND THE SAME DEPTH AS THE COARSE ATLAS, and it
    // has to be: the shader reads a slot's refinement from this atlas and its
    // coarse bitmap from that one by the identical layer/channel split, so a
    // slot landing elsewhere here would refine one mask with another's edge.
    const packed = new Uint8Array(fw * fh * 4 * layers);
    for (const { bm, slot } of fines) {
      const f = bm!;
      if (f.w !== fw || f.h !== fh) continue; // one size per atlas, as above
      const base = (slot >> 2) * fw * fh * 4 + (slot & 3);
      for (let p = 0; p < fw * fh; p++) packed[base + p * 4] = f.data[p];
    }
    gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA, fw, fh, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, packed);
  }

  /** Rebuild the tone LUTs from the five control points (cheap; on change
   *  only): the master curve, plus the per-channel R/G/B curves packed into
   *  one RGBA row. */
  setToneCurve(tone: readonly number[], toneR?: readonly number[], toneG?: readonly number[], toneB?: readonly number[]) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (toneIsIdentity(tone)) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, IDENTITY_LUT);
    } else {
      const fn = toneEvaluator(tone);
      const lut = new Uint8Array(256);
      for (let i = 0; i < 256; i++) lut[i] = Math.round(fn(i / 255) * 255);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.toneRgbTex);
    const rgba = identityRgbaRamp();
    for (const [ch, curve] of [[0, toneR], [1, toneG], [2, toneB]] as const) {
      if (!curve || toneIsIdentity(curve)) continue;
      const fn = toneEvaluator(curve);
      for (let i = 0; i < 256; i++) rgba[i * 4 + ch] = Math.round(fn(i / 255) * 255);
    }
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rgba);
  }

  /** Display rotation in 90-degree CW steps; swaps the canvas aspect. */
  setRotation(q: number) {
    this.rotQ = ((q % 4) + 4) % 4;
    if (this.imgW) this.applySize();
  }

  /** HOW WIDE A NEIGHBOURHOOD TAP IS, in texels of the image currently loaded.
   *
   *  One for the live view, which is the only thing that ever needed it: the
   *  preview runs on a downscaled proxy, so one texel there already spans
   *  several native pixels and the denoise and detail footprints come out the
   *  size the reader tuned.
   *
   *  A drawn EXPORT loads the full-resolution frame instead, where one texel is
   *  one native pixel — so without this its taps are a fraction of the width the
   *  reader previewed, and it denoises and sharpens finer structure than they
   *  chose. Measured on a 2-megapixel crop before this existed: no colour
   *  difference at all against the computed export (shift under 0.25 per
   *  channel) and 30% of pixels differing by more than 2, concentrated on the
   *  edges — a footprint error, not a precision one.
   *
   *  `u_texel` is used for nothing but those taps and their grid snapping, so
   *  scaling it reproduces a proxy's footprint exactly, snapping included.
   *  Default 1 leaves every existing caller untouched. */
  setTapScale(texels: number) {
    this.tapScale = Number.isFinite(texels) && texels >= 1 ? texels : 1;
  }

  /** GIVE THE GRAPHICS CONTEXT BACK.
   *
   *  A browser allows only a handful of live WebGL contexts — around sixteen in
   *  Chromium — and setting `canvas.width = 1` releases NONE of it: the context,
   *  its programs and every texture it holds stay alive until the canvas is
   *  collected, which is whenever the collector feels like it. The test page
   *  builds a Renderer per source to compare them, so three contexts, each
   *  holding a full-resolution texture, leaked on every press of Run. Past the
   *  cap the browser starts killing the OLDEST contexts, which is somebody
   *  else's renderer.
   *
   *  Anything that makes a throwaway Renderer calls this in a `finally`. The
   *  app's own long-lived one never needs it. */
  /**
   * Empty the stage: forget the picture and paint the canvas clear, so the
   * start screen stands on nothing — the state a fresh page is in. Every draw
   * after this is a no-op until setImage gives it a picture again.
   * @returns nothing.
   * What the result must satisfy: the canvas reads back all-zero afterwards
   * (the context keeps its drawing buffer, so a read-back is honest); endSession
   * relies on it and the journey walk asserts it after Done. Ending a session
   * used to leave the last photograph drawn behind the start screen, with no
   * way back to it and no way to remove it (decision 020).
   */
  clear() {
    const gl = this.gl;
    this.imgW = 0;
    this.imgH = 0;
    try {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
    } catch { /* a context already lost is already clear */ }
  }

  dispose() {
    const gl = this.gl;
    try {
      gl.bindTexture(gl.TEXTURE_2D, null);
      gl.useProgram(null);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    } catch { /* a context already gone is the state we wanted */ }
  }

  /** Source-space mirror bits (1 = x, 2 = y). A view transform like rotation:
   *  not part of the edit/undo; the export takes it via opts.flip. */
  setFlip(bits: number) {
    this.flipBits = bits & 3;
  }

  get flip() {
    return this.flipBits;
  }

  get rotation() {
    return this.rotQ;
  }

  private applySize() {
    const odd = (this.rotQ & 1) === 1;
    const baseW = odd ? this.imgH : this.imgW;
    const baseH = odd ? this.imgW : this.imgH;
    // Crop shrinks the canvas itself, not just what's sampled — so the output
    // aspect ratio matches the crop instead of stretching it to fill the old
    // (uncropped) frame. See cropToDisplayUv: uv here is already a fraction
    // of THIS size, and the vertex shader maps it through u_crop/u_straighten.
    this.canvas.width = Math.max(1, Math.round(baseW * this.crop.w));
    this.canvas.height = Math.max(1, Math.round(baseH * this.crop.h));
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** Upload the per-image blurred highlight map (or clear it with null). */
  setGlowMap(map: { width: number; height: number; data: Float32Array } | null) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (!map) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array([0]));
      return;
    }
    const u8 = new Uint8Array(map.data.length);
    for (let i = 0; i < u8.length; i++) u8[i] = Math.min(255, Math.max(0, Math.round(map.data[i] * 255)));
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, map.width, map.height, 0, gl.RED, gl.UNSIGNED_BYTE, u8);
  }

  setImage(img: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; linear16?: Uint16Array; camMatrix?: number[] }) {
    const gl = this.gl;
    const { width, height } = img;
    this.imgW = width;
    this.imgH = height;
    this.isLinear = !!(img.linear || img.linear16);
    this.isHalf = !!img.linear16 && !img.linear;
    // Upload column-major for GLSL (our matrix is row-major).
    this.camMatrix = img.camMatrix ? rowToColMajor(img.camMatrix) : null;
    this.applySize();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (img.linear || img.linear16) {
      // Float textures aren't reliably linear-filterable across devices; the
      // canvas is 1:1 with the texture, so NEAREST is correct anyway.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      if (img.linear16) {
        // HALF THE MEMORY, and the reason it matters is a device rather than a
        // preference: a full-resolution frame is 16 MB a megapixel as float32 —
        // about 340 MB for a 21-megapixel raw — and the iPad with the least room
        // reports no memory figure at all, so the app cannot ask. Half-float
        // holds ~11 bits of relative precision, which is what every HDR image
        // pipeline uses for linear data, and the shader samples it identically.
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, img.linear16);
      } else {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, img.linear!);
      }
    } else {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texImage2D(
        gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array(img.pixels!.buffer),
      );
    }
  }

  /** Bind the program, every edit uniform, and the three input textures. Shared
   *  by the on-screen render and the offscreen histogram pass so they can never
   *  disagree about what the pixels are. `applyCrop` is OFF for every offscreen
   *  "read" pass (histogram, tap-pick, colour-key) — those work in TRUE
   *  image-uv (see readUvPixel's doc comment), which crop/straighten would
   *  otherwise remap out from under callers like clientToImageUv. */
  private bindPipeline(p: EditParams, split: number, rot: number, readMode = 0, spotVis = 0, applyCrop = true, maskViz = -1, maskMatte = false) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform1i(this.loc.u_tex, 0);
    const crop = applyCrop ? p.crop ?? CROP_DEFAULT : CROP_DEFAULT;
    const straighten = applyCrop ? p.straighten ?? 0 : 0;
    gl.uniform4f(this.loc.u_crop, crop.x, crop.y, crop.w, crop.h);
    gl.uniform1f(this.loc.u_straighten, (straighten * Math.PI) / 180);
    const odd = (rot & 1) === 1;
    const dispAspect = this.imgH ? (odd ? this.imgH / this.imgW : this.imgW / this.imgH) : 1;
    gl.uniform1f(this.loc.u_dispAspect, dispAspect);
    gl.uniform1i(this.loc.u_readMode, readMode);
    gl.uniform1i(this.loc.u_spotVis, spotVis);
    gl.uniform1i(this.loc.u_maskViz, maskViz);
    gl.uniform1i(this.loc.u_maskMatte, maskMatte ? 1 : 0);
    gl.uniform1f(this.loc.u_denoise, p.denoise);
    gl.uniform1f(this.loc.u_chroma, p.chroma ?? 0);
    gl.uniform1f(this.loc.u_despeckle, p.despeckle ?? 0);
    gl.uniform1f(this.loc.u_sharpen, p.sharpen ?? 0);
    gl.uniform1f(this.loc.u_texture, p.texture ?? 0);
    gl.uniform3f(this.loc.u_tint, p.tint[0], p.tint[1], p.tint[2]);
    // Custom 3×3 channel mixer. The param is row-major [rr,rg,rb, gr,gg,gb,
    // br,bg,bb]; GLSL mat3 is column-major, so upload the transpose — then
    // `u_mix3 * c` computes the same M*input the CPU path does.
    const mix3On = !mix3IsIdentity(p.mix3);
    gl.uniform1i(this.loc.u_mix3On, mix3On ? 1 : 0);
    if (mix3On) {
      const m = p.mix3 ?? MIX3_DEFAULT;
      gl.uniformMatrix3fv(this.loc.u_mix3, false, new Float32Array([
        m[0], m[3], m[6],
        m[1], m[4], m[7],
        m[2], m[5], m[8],
      ]));
    }
    gl.uniform3f(this.loc.u_sky, p.sky[0], p.sky[1], p.sky[2]);
    gl.uniform3f(this.loc.u_fol, p.foliage[0], p.foliage[1], p.foliage[2]);
    gl.uniform2f(this.loc.u_texel, this.tapScale / this.imgW, this.tapScale / this.imgH);
    gl.uniform1f(this.loc.u_split, split);
    gl.uniform3f(this.loc.u_wb, p.wb[0], p.wb[1], p.wb[2]);
    gl.uniform1i(this.loc.u_swap, p.swapRB ? 1 : 0);
    gl.uniform1f(this.loc.u_hue, (p.hue * Math.PI) / 180);
    gl.uniform1f(this.loc.u_sat, p.sat);
    gl.uniform1f(this.loc.u_con, p.contrast);
    gl.uniform1f(this.loc.u_exposure, p.exposure);
    gl.uniform1i(this.loc.u_linear, this.isLinear ? 1 : 0);
    gl.uniform1i(this.loc.u_useCam, this.camMatrix ? 1 : 0);
    if (this.camMatrix) gl.uniformMatrix3fv(this.loc.u_cam, false, this.camMatrix);
    gl.uniform1f(this.loc.u_glow, p.glow);
    gl.uniform1i(this.loc.u_rot, rot);
    gl.uniform1i(this.loc.u_flip, applyCrop ? this.flipBits : 0);
    gl.uniform1f(this.loc.u_lum, p.lum || 1);
    gl.uniform1f(this.loc.u_hotspot, p.hotspot ?? 0);
    gl.uniform1f(this.loc.u_hotspotSize, p.hotspotSize ?? 0.5);
    gl.uniform1f(this.loc.u_hotspotColor, p.hotspotColor ?? 0);
    gl.uniform1f(this.loc.u_vignette, p.vignette ?? 0);
    gl.uniform1f(this.loc.u_aspect, this.imgH ? this.imgW / this.imgH : 1);
    gl.uniform1f(this.loc.u_recover, p.recover ?? 0);
    gl.uniform1f(this.loc.u_clarity, p.clarity ?? 0);
    gl.uniform1f(this.loc.u_dehaze, p.dehaze ?? 0);
    const mixerOn = !hslIsNeutral(p.hsl);
    gl.uniform1i(this.loc.u_hslOn, mixerOn ? 1 : 0);
    if (mixerOn) gl.uniform3fv(this.loc.u_hsl, new Float32Array(p.hsl));
    gl.uniform1i(this.loc.u_bwOn, p.bwOn ? 1 : 0);
    const bwMix = p.bwMix ?? [1, 1, 1];
    gl.uniform3f(this.loc.u_bwMix, bwMix[0], bwMix[1], bwMix[2]);
    // Color grade wheels: the tint vectors are precomputed HERE by the same
    // pipeline.ts gradeTintVec the CPU path uses, so both sides add
    // bit-identical numbers (parity by construction, not coincidence).
    // Clamped on BOTH sides to the same range compileEdit clamps to, because a
    // uniform is the one place a stray value reaches the GPU without passing
    // through the slider that bounds it.
    gl.uniform1f(this.loc.u_shadowSat, Math.min(1, Math.max(0, p.shadowSat ?? 0)));
    const grade = p.grade ?? GRADE_DEFAULT;
    const gradeOn = !gradeIsNeutral(p.grade);
    gl.uniform1i(this.loc.u_gradeOn, gradeOn ? 1 : 0);
    if (gradeOn) {
      const tS = gradeTintVec(grade[0] ?? 0);
      const tM = gradeTintVec(grade[2] ?? 0);
      const tH = gradeTintVec(grade[4] ?? 0);
      gl.uniform3f(this.loc.u_gradeTintS, tS[0], tS[1], tS[2]);
      gl.uniform3f(this.loc.u_gradeTintM, tM[0], tM[1], tM[2]);
      gl.uniform3f(this.loc.u_gradeTintH, tH[0], tH[1], tH[2]);
      gl.uniform3f(this.loc.u_gradeAmt, grade[1] ?? 0, grade[3] ?? 0, grade[5] ?? 0);
      gl.uniform1f(this.loc.u_gradeBal, grade[6] ?? 0);
    }
    // Grain + creative vignette key on the OUTPUT (cropped) frame. In the
    // preview that frame is this canvas: grain cells are sized against ITS
    // height (resolution-proportional), so the LOOK matches the export even
    // though the export's larger pixel grid draws its own grain instance.
    const outW = gl.canvas.width || 1;
    const outH = gl.canvas.height || 1;
    gl.uniform2f(this.loc.u_outPx, outW, outH);
    gl.uniform1f(this.loc.u_outAspect, outW / outH);
    gl.uniform1f(this.loc.u_grainAmt, p.grainAmt ?? 0);
    gl.uniform1f(this.loc.u_grainCell, grainCellPx(p.grainSize ?? 1.5, outH));
    gl.uniform1f(this.loc.u_vigAmt, p.vigAmt ?? 0);
    gl.uniform1f(this.loc.u_vigMid, p.vigMid ?? 0.5);
    gl.uniform1f(this.loc.u_skySmooth, this.skyOn ? Math.min(1, Math.max(0, p.skySmooth ?? 0)) : 0);
    gl.uniform1i(this.loc.u_skyTex, 11);
    gl.activeTexture(gl.TEXTURE11);
    gl.bindTexture(gl.TEXTURE_2D, this.skyTex);
    gl.uniform1f(this.loc.u_skyDepth, this.skyOn && this.fineOn ? Math.min(1, Math.max(0, p.skyDepth ?? 0)) : 0);
    gl.uniform1f(this.loc.u_skySat, this.fineOn ? Math.min(2, Math.max(0, p.skySat ?? 0)) : 0);
    gl.uniform1i(this.loc.u_skyFineTex, 12);
    gl.activeTexture(gl.TEXTURE12);
    gl.bindTexture(gl.TEXTURE_2D, this.skyFineTex);
    gl.uniform1f(this.loc.u_localScale, this.localScale);
    gl.uniform1i(this.loc.u_localTex, 4);
    gl.activeTexture(gl.TEXTURE4);
    gl.bindTexture(gl.TEXTURE_2D, this.localTex);
    // Warp field (unit 7). WARP_MAX = 0.28 (warp.ts) — kept as a literal here so
    // the shader decode matches; if warp.ts changes it, change this too.
    gl.uniform1i(this.loc.u_warpTex, 7);
    gl.uniform1i(this.loc.u_warpOn, this.warpOn ? 1 : 0);
    gl.uniform1f(this.loc.u_warpScale, 0.28);
    gl.activeTexture(gl.TEXTURE7);
    gl.bindTexture(gl.TEXTURE_2D, this.warpTex);
    // On-top sticker overlay (unit 8): blended over the finished look, off in the
    // read/spot/mask-viz diagnostic passes (readMode) so it never taints a probe.
    gl.uniform1i(this.loc.u_overlayTex, 8);
    gl.uniform1i(this.loc.u_overlayOn, this.overlayOn && readMode === 0 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE8);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayTex);
    gl.uniform1i(this.loc.u_overlayScreenTex, 9);
    gl.uniform1i(this.loc.u_overlayScreenOn, this.overlayScreenOn && readMode === 0 ? 1 : 0);
    gl.activeTexture(gl.TEXTURE9);
    gl.bindTexture(gl.TEXTURE_2D, this.overlayScreenTex);
    // Local masks (up to MAX_MASKS, the shader array size).
    // GROUPS, NOT MASKS (026). maskIsActive asks whether a mask's own
    // adjustment does anything — true of a head, false of EVERY component,
    // since the adjustment belongs to the group. Filtering by it first would
    // upload the heads and silently drop what they combine with. So the
    // grouping, the active test AND THE CAP all come from maskGroupsForRender,
    // which compileEdit calls too: this path capped flattened ENTRIES while
    // that one capped GROUPS, and two caps meaning different things is a
    // divergence waiting for somebody to raise one of them. Flattening here is
    // unconditional now — the cap has already been applied, whole groups
    // only — into the flat uniform arrays the shader indexes, components
    // following their head.
    const groups = maskGroupsForRender(p.masks);
    const masks: EditParams["masks"] = [];
    for (const g of groups) for (const m of g) masks.push(m);
    // Slot map: brush(2)/sky(4) masks claim packed channels 0..3 in appearance
    // order, decoupled from their global index so a bitmap mask beyond index 3
    // still packs correctly; everything else (and any beyond MAX_BITMAP_MASKS)
    // is -1. The UI enforces the same cap, so the -1 fallthrough never fires
    // there. A slot is split as layer = slot >> 2, channel = slot & 3.
    const slotOf: number[] = [];
    let bitmapCount = 0;
    for (const m of masks) {
      slotOf.push((m.type === 2 || m.type === 4) && bitmapCount < MAX_BITMAP_MASKS ? bitmapCount++ : -1);
    }
    this.updateBrushTexture(masks, slotOf);
    this.updateBrushFineTexture(masks, slotOf);
    // THE COVERAGE OVERLAY FOLLOWS THE GROUP, NOT THE COMPONENT (026).
    // maskViz arrives as an index into p.masks, and the shader captures
    // coverage at a group's HEAD — every component is skipped before that
    // line is reached. So selecting the component you just added would light
    // nothing and Show mask would go blank on the very mask being placed.
    // Map any member to its head's UPLOADED index: what the overlay then
    // shows is the combined selection, which is the question the operator was
    // pressed to answer. A group that was filtered out, or a head pushed past
    // MAX_MASKS, maps to -1 — the overlay is off rather than pointing at
    // whichever mask inherited that index.
    const vizMask = maskViz >= 0 ? (p.masks ?? [])[maskViz] : undefined;
    const vizGroup = vizMask ? groups.find((g) => g.includes(vizMask)) : undefined;
    gl.uniform1i(this.loc.u_maskViz, vizGroup ? masks.indexOf(vizGroup[0]) : -1);
    gl.uniform1i(this.loc.u_maskCount, masks.length);
    if (masks.length) {
      const types = new Int32Array(MAX_MASKS);
      const geoA = new Float32Array(MAX_MASKS * 4);
      const geoB = new Float32Array(MAX_MASKS * 2);
      const adj = new Float32Array(MAX_MASKS * 4);
      const hue = new Float32Array(MAX_MASKS);
      const slot = new Int32Array(MAX_MASKS).fill(-1);
      const op = new Int32Array(MAX_MASKS);   // 0 head · 1 subtract · 2 intersect (026)
      masks.forEach((m, i) => {
        types[i] = m.type;
        // The FIRST mask uploaded always starts a group, whatever it carries:
        // a component whose head was filtered out would otherwise be read as
        // subtracting from the group above it, which is a different picture.
        op[i] = i === 0 ? 0 : (m.op ?? 0);
        geoA.set(
          m.type === 0 ? [m.cx, m.cy, m.rx, m.ry]
          : m.type === 3 ? [m.hueTarget, m.satTarget, m.colorRange, 0]
          : [m.cx, m.cy, m.lx, m.ly],
          i * 4,
        );
        geoB.set([m.feather, m.invert ? 1 : 0], i * 2);
        adj.set([m.brightness, m.contrast, m.saturation, m.warmth], i * 4);
        hue[i] = m.hue;
        slot[i] = slotOf[i];
      });
      gl.uniform1iv(this.loc.u_maskType, types);
      gl.uniform4fv(this.loc.u_maskGeoA, geoA);
      gl.uniform2fv(this.loc.u_maskGeoB, geoB);
      gl.uniform4fv(this.loc.u_maskAdj, adj);
      gl.uniform1fv(this.loc.u_maskHue, hue);
      gl.uniform1iv(this.loc.u_maskSlot, slot);
      gl.uniform1iv(this.loc.u_maskOp, op);
      gl.uniform1iv(this.loc.u_maskAims, masks.map((m) => m.aims ?? 0));
    }
    gl.uniform1i(this.loc.u_glowTex, 1);
    gl.uniform1i(this.loc.u_toneTex, 2);
    gl.uniform1i(this.loc.u_maskTex, 3);
    gl.uniform1i(this.loc.u_maskFineTex, 13);
    gl.uniform1i(this.loc.u_maskFineOn, this.brushFineOn ? 1 : 0);
    const toneRgbOn =
      (p.toneR && !toneIsIdentity(p.toneR)) || (p.toneG && !toneIsIdentity(p.toneG)) || (p.toneB && !toneIsIdentity(p.toneB));
    gl.uniform1i(this.loc.u_toneRgbOn, toneRgbOn ? 1 : 0);
    gl.uniform1i(this.loc.u_toneRgbTex, 6);
    gl.activeTexture(gl.TEXTURE6);
    gl.bindTexture(gl.TEXTURE_2D, this.toneRgbTex);
    // The reader's measured lens curve (unit 10). The TEXTURE is per-photograph
    // and uploaded by setLensCurve; only the strength changes per draw, so
    // moving the Strength slider costs one uniform and no upload — which is the
    // whole reason this stage moved into the pipeline.
    gl.uniform1i(this.loc.u_lensTex, 10);
    gl.uniform1i(this.loc.u_lensN, this.lensN);
    gl.uniform1f(this.loc.u_lensFix, this.lensHasColour && !p.lensBypass ? (p.lensFix ?? 0) : 0);
    // Same strength as the colour half: one profile, one correction, one slider.
    gl.uniform1f(this.loc.u_lensBump, this.lensHasBump && !p.lensBypass ? (p.lensFix ?? 0) : 0);
    gl.activeTexture(gl.TEXTURE10);
    gl.bindTexture(gl.TEXTURE_2D, this.lensTex);
    // Imported .cube LUT (unit 5). The sig check IS the uploader: the lattice
    // re-uploads only when the LUT identity changes; strength-only changes are
    // just a uniform. Data is padded RGB -> RGBA32F (RGB32F is driver-fragile).
    {
      const lut = p.lut && p.lut.strength > 0 ? p.lut : null;
      gl.uniform1f(this.loc.u_lutStrength, lut ? lut.strength : 0);
      gl.uniform1i(this.loc.u_lutSize, lut ? lut.size : 2);
      gl.uniform1i(this.loc.u_lutTex, 5);
      const sig = lut ? lut.id : "";
      if (sig !== this.lutSig) {
        this.lutSig = sig;
        gl.activeTexture(gl.TEXTURE5);
        gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
        gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
        if (lut) {
          const N = lut.size;
          const rgba = new Float32Array(N * N * N * 4);
          for (let i = 0, j = 0; i < lut.data.length; i += 3, j += 4) {
            rgba[j] = lut.data[i];
            rgba[j + 1] = lut.data[i + 1];
            rgba[j + 2] = lut.data[i + 2];
            rgba[j + 3] = 1;
          }
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, N, N, N, 0, gl.RGBA, gl.FLOAT, rgba);
        } else {
          gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA32F, 2, 2, 2, 0, gl.RGBA, gl.FLOAT, new Float32Array(2 * 2 * 2 * 4));
        }
      }
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, this.lutTex);
    }
    gl.activeTexture(gl.TEXTURE13);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.brushFineTex);
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.brushTex);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /** "Visualize spots" mode for the ON-SCREEN render only (offscreen passes —
   *  histogram, colour picks — always see the real edit). */
  spotVis = false;

  /** Index of the mask whose coverage to overlay on the ON-SCREEN render, or -1
   *  for none (offscreen/export never see it — like spotVis). */
  maskViz = -1;
  /** Draw the shown mask as a MATTE rather than as a tint over the photograph.
   *  Preview only, like `maskViz` itself; nothing downstream of the canvas
   *  reads it and no export path binds it. */
  maskMatte = false;

  /** @param split 0..1 — denoise applies right of this fraction (0 = whole image). */
  render(p: EditParams, split = 0) {
    const gl = this.gl;
    if (!this.imgW) return;
    const crop = p.crop ?? CROP_DEFAULT;
    if (crop.x !== this.crop.x || crop.y !== this.crop.y || crop.w !== this.crop.w || crop.h !== this.crop.h) {
      this.crop = crop;
      this.applySize();
    }
    this.straighten = p.straighten ?? 0;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.bindPipeline(p, split, this.rotQ, 0, this.spotVis ? 1 : 0, true, this.maskViz, this.maskMatte);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** THE WHOLE FRAME, AS PIXELS. `histogram` reads a corner of it and
   *  `readUvPixel` reads a texel; an export needs all of it, top row first —
   *  GL's origin is the bottom-left and every consumer in this app counts rows
   *  from the top. The context is created with `preserveDrawingBuffer`, so this
   *  is valid after the frame has been composited as well as before. */
  readFrame(): Uint8ClampedArray {
    const gl = this.gl;
    const w = this.canvas.width, h = this.canvas.height;
    const raw = new Uint8Array(w * h * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    const out = new Uint8ClampedArray(w * h * 4);
    const stride = w * 4;
    for (let y = 0; y < h; y++) out.set(raw.subarray((h - 1 - y) * stride, (h - y) * stride), y * stride);
    return out;
  }

  /** Overwrite a rect of the source texture with healed pixels (heal.ts bakes
   *  them from the pristine decode — the texture is the only place healed
   *  preview pixels live). `data` layout must match the upload format:
   *  RGBA bytes for gamma sources, RGBA floats for linear raw. */
  patchImage(x: number, y: number, w: number, h: number, data: Uint8Array | Float32Array) {
    const gl = this.gl;
    if (!this.imgW || w <= 0 || h <= 0) return;
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (this.isLinear && this.isHalf) {
      // THE CALLER STILL HANDS US FLOAT32 and that is deliberate. Every bake in
      // the app — heals, in-look stickers, their occlusion — works in float and
      // is checked against the export's float arithmetic; making each of them
      // half-aware would be four places to get wrong instead of one. A heal
      // rectangle is a few hundred pixels, so converting it here costs nothing
      // measurable, and the pristine buffer it was read from is the half-float
      // one, so the round trip is not lossy twice.
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.HALF_FLOAT,
        toHalfBuffer(data as Float32Array, this.patchHalf.length >= (data as Float32Array).length ? this.patchHalf : (this.patchHalf = new Uint16Array((data as Float32Array).length))));
    } else if (this.isLinear) {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.FLOAT, data as Float32Array);
    } else {
      gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, w, h, gl.RGBA, gl.UNSIGNED_BYTE, data as Uint8Array);
    }
  }

  // Longest edge of the offscreen histogram render. Small enough that the
  // readback is a fraction of a millisecond; large enough (~48k samples) that
  // the distribution matches the full image.
  private static readonly HIST_MAX = 220;

  /**
   * Re-render the current edit into a tiny offscreen buffer and tally its
   * displayed (post-gamma, 8-bit) pixels into per-channel + luminance bins.
   * Rotation is ignored — it never changes the value distribution — so the pass
   * is orientation-agnostic. Returns null before any image is loaded.
   */
  histogram(p: EditParams): { r: Uint32Array; g: Uint32Array; b: Uint32Array; l: Uint32Array } | null {
    const gl = this.gl;
    if (!this.imgW) return null;
    const { w, h } = this.renderOffscreen(p);
    const buf = this.histBuf!;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    this.restoreDefaultFbo();

    const r = new Uint32Array(256);
    const g = new Uint32Array(256);
    const b = new Uint32Array(256);
    const l = new Uint32Array(256);
    for (let i = 0; i < buf.length; i += 4) {
      const R = buf[i], G = buf[i + 1], B = buf[i + 2];
      r[R]++;
      g[G]++;
      b[B]++;
      // Rec.709 luma with integer weights summing to 256 (max index = 255).
      l[(R * 54 + G * 183 + B * 19) >> 8]++;
    }
    return { r, g, b, l };
  }

  /** Ensure the offscreen FBO exists at the histogram scale, render `p` into it
   *  (rotation ignored — it never changes displayed colour values) and leave it
   *  bound. Shared by histogram() and readUvPixel(); the caller reads pixels
   *  then calls restoreDefaultFbo(). Returns the FBO size. */
  private renderOffscreen(p: EditParams, readMode = 0): { w: number; h: number } {
    const gl = this.gl;
    const scale = Math.min(1, Renderer.HIST_MAX / Math.max(this.imgW, this.imgH));
    const w = Math.max(1, Math.round(this.imgW * scale));
    const h = Math.max(1, Math.round(this.imgH * scale));
    if (!this.histFbo) {
      this.histFbo = gl.createFramebuffer();
      this.histTex = gl.createTexture();
    }
    if (w !== this.histW || h !== this.histH) {
      this.histW = w;
      this.histH = h;
      this.histBuf = new Uint8Array(w * h * 4);
      gl.bindTexture(gl.TEXTURE_2D, this.histTex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.histFbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.histTex, 0);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.histFbo);
    gl.viewport(0, 0, w, h);
    this.bindPipeline(p, 0, 0, readMode, 0, false); // uv here IS true image-uv — crop/straighten bypassed
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return { w, h };
  }

  /** Restore the default framebuffer + viewport after an offscreen pass, so the
   *  next on-screen render is unaffected. */
  private restoreDefaultFbo() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /** The DISPLAYED colour a pixel would take under `p` at image-uv (u,v), read
   *  from the offscreen render (rotation ignored — uv is image space). Lets a
   *  caller classify a pixel WITHOUT some effect by passing neutralised params:
   *  the drag-to-adjust tool reads it with the mixer neutral so the chip it
   *  grabs is the colour BEFORE the mixer — stable no matter how far that colour
   *  has already been pushed, and the chip that actually controls the area. */
  readUvPixel(p: EditParams, u: number, v: number): [number, number, number] | null {
    if (!this.imgW) return null;
    const gl = this.gl;
    const { w, h } = this.renderOffscreen(p);
    const x = Math.max(0, Math.min(w - 1, Math.round(u * w)));
    const y = Math.max(0, Math.min(h - 1, Math.round(v * h)));
    const buf = new Uint8Array(4);
    // GL reads bottom-origin; flip to match image-uv (v = 0 at the top).
    gl.readPixels(x, h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    this.restoreDefaultFbo();
    return [buf[0], buf[1], buf[2]];
  }

  /** The mask-stage DISPLAY colour at image-uv (u,v) — the colour BEFORE any
   *  local mask, gamma-encoded, exactly what colorMaskWeight keys against (via
   *  the shader's u_readMode). The colour mask's tap-to-pick reads this so the
   *  colour you touch is the colour that selects itself. */
  readColorKeyPixel(p: EditParams, u: number, v: number): [number, number, number] | null {
    if (!this.imgW) return null;
    const gl = this.gl;
    const { w, h } = this.renderOffscreen(p, 1);
    const x = Math.max(0, Math.min(w - 1, Math.round(u * w)));
    const y = Math.max(0, Math.min(h - 1, Math.round(v * h)));
    const buf = new Uint8Array(4);
    // GL reads bottom-origin; flip to match image-uv (v = 0 at the top).
    gl.readPixels(x, h - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    this.restoreDefaultFbo();
    return [buf[0], buf[1], buf[2]];
  }

  /** The DISPLAYED pixel colour under a pointer at CLIENT coords — read
   *  straight from the drawing buffer (preserveDrawingBuffer is on), so it is
   *  exactly what the user sees. Used by the mixer's pick-from-photo. */
  readDisplayedPixel(clientX: number, clientY: number): [number, number, number] | null {
    if (!this.imgW) return null;
    const r = this.canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(this.canvas.width - 1, Math.floor(((clientX - r.left) / Math.max(1, r.width)) * this.canvas.width)));
    const y = Math.max(0, Math.min(this.canvas.height - 1, Math.floor(((clientY - r.top) / Math.max(1, r.height)) * this.canvas.height)));
    const gl = this.gl;
    const buf = new Uint8Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.readPixels(x, this.canvas.height - 1 - y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    return [buf[0], buf[1], buf[2]];
  }

  /** Display-rotated frame width/height — the aspect straighten reads a true
   *  angle against (matches bindPipeline's u_dispAspect exactly). */
  private dispAspect(): number {
    if (!this.imgH) return 1;
    return this.rotQ & 1 ? this.imgH / this.imgW : this.imgW / this.imgH;
  }

  /** Image-uv [0..1] for a pointer at CLIENT coords (for placing masks). */
  clientToImageUv(clientX: number, clientY: number): [number, number] {
    const [px, py] = this.toImagePixel(clientX, clientY);
    return [px / Math.max(1, this.imgW), py / Math.max(1, this.imgH)];
  }

  /** CLIENT coords for a point given in image-uv [0..1] — the inverse of
   *  toImagePixel's rotation + crop/straighten mapping, using the live
   *  (transformed) rect so it tracks zoom/pan/rotation. Returns viewport
   *  pixels. Masks/heals live in true image-uv, so this is how their overlay
   *  rings/handles stay glued to the photo through an active crop. */
  imageUvToClient(u: number, v: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    // Undo the source-space mirror first (self-inverse), then the rotation.
    if (this.flipBits & 1) u = 1 - u;
    if (this.flipBits & 2) v = 1 - v;
    let du = u, dv = v;
    if (this.rotQ === 1) { du = 1 - v; dv = u; }
    else if (this.rotQ === 2) { du = 1 - u; dv = 1 - v; }
    else if (this.rotQ === 3) { du = v; dv = 1 - u; }
    const [tx, ty] = displayUvToCrop(du, dv, this.crop, this.straighten, this.dispAspect());
    return [r.left + tx * r.width, r.top + ty * r.height];
  }

  /** Image coordinates (px) for a pointer at CLIENT coords. Uses the live
   *  bounding rect, so CSS zoom/pan transforms, rotation and an active
   *  crop/straighten are all handled — the inverse of the vertex shader's
   *  mapping, so a tap always lands on the TRUE source pixel under it. */
  toImagePixel(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const tx = (clientX - r.left) / Math.max(1, r.width);
    const ty = (clientY - r.top) / Math.max(1, r.height);
    const [u, v] = cropToDisplayUv(tx, ty, this.crop, this.straighten, this.dispAspect());
    let iu = u;
    let iv = v;
    if (this.rotQ === 1) { iu = v; iv = 1 - u; }
    else if (this.rotQ === 2) { iu = 1 - u; iv = 1 - v; }
    else if (this.rotQ === 3) { iu = 1 - v; iv = u; }
    if (this.flipBits & 1) iu = 1 - iu;
    if (this.flipBits & 2) iv = 1 - iv;
    const x = Math.round(iu * this.imgW);
    const y = Math.round(iv * this.imgH);
    return [Math.max(0, Math.min(this.imgW - 1, x)), Math.max(0, Math.min(this.imgH - 1, y))];
  }
}

/** Row-major 3x3 -> column-major Float32Array for uniformMatrix3fv. */
function rowToColMajor(m: number[]): Float32Array {
  return new Float32Array([m[0], m[3], m[6], m[1], m[4], m[7], m[2], m[5], m[8]]);
}

function link(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const compile = (type: number, src: string) => {
    const s = gl.createShader(type)!;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      throw new Error("Shader compile error: " + gl.getShaderInfoLog(s));
    }
    return s;
  };
  const p = gl.createProgram()!;
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error("Program link error: " + gl.getProgramInfoLog(p));
  }
  return p;
}
