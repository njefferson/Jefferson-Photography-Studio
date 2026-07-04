// WebGL2 edit pipeline. Every operation is per-pixel, so it lives in one
// fragment shader and runs in real time on the iPad GPU.
//
// Order matches PLAN.md: white balance -> channel swap -> hue/sat -> tone.

// Single source of truth for edit parameters lives in pipeline.ts so the GPU
// preview and CPU export can never drift apart.
import { toneEvaluator, toneIsIdentity, type EditParams } from "./pipeline";
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

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
uniform int u_rot; // display rotation in 90-degree CW steps (0..3)
void main() {
  vec2 uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
  if (u_rot == 1) uv = vec2(uv.y, 1.0 - uv.x);
  else if (u_rot == 2) uv = vec2(1.0 - uv.x, 1.0 - uv.y);
  else if (u_rot == 3) uv = vec2(1.0 - uv.y, uv.x);
  v_uv = uv;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
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
uniform vec3 u_sky;      // sky band [hueShiftDeg, satScale, lumScale]
uniform vec3 u_fol;      // foliage band [hueShiftDeg, satScale, lumScale]
uniform sampler2D u_glowTex; // per-image blurred highlight map (see glow.ts)
uniform float u_glow;        // 0..1 HIE halation strength
uniform sampler2D u_toneTex; // 256x1 tone-curve LUT (identity when neutral)
uniform float u_lum;         // global luminance: out = pow(out, 1/u_lum) (1 = neutral)
uniform float u_denoise; // 0..1 bilateral strength (see raw/denoise.ts)
uniform vec2 u_texel;    // 1/textureSize
uniform float u_split;   // compare divider: denoise applies where uv.x >= split

const vec3 LUMA_W = vec3(0.2126, 0.7152, 0.0722);

vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toGamma(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }
vec3 fetchLin(vec2 uv){ vec3 s = texture(u_tex, uv).rgb; return u_linear ? s : toLinear(s); }

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

void main() {
  vec3 c = fetchLin(v_uv);

  // Denoise FIRST, on linear sensor data, before the big IR gains amplify the
  // noise. Same 5x5 brightness-adaptive bilateral as raw/denoise.ts.
  if (u_denoise > 0.0 && v_uv.x >= u_split) {
    float sigma = 0.08 + 0.55 * u_denoise;
    float inv2s2 = 1.0 / (2.0 * sigma * sigma);
    float lc = dot(c, LUMA_W);
    vec3 sum = vec3(0.0);
    float wsum = 0.0;
    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec3 s = fetchLin(v_uv + vec2(float(dx), float(dy)) * u_texel);
        float rel = (dot(s, LUMA_W) - lc) / (lc + 0.02);
        float w = exp(-float(dx*dx + dy*dy) / 4.5) * exp(-rel * rel * inv2s2);
        sum += s * w;
        wsum += w;
      }
    }
    c = sum / wsum;
  }

  // Exposure (linear) then white balance (the unbounded gains Lightroom can't reach).
  c *= u_exposure;
  c *= u_wb;

  // Camera colour matrix: separates infrared chroma into distinct hues so the
  // channel swap can produce real false colour instead of a single tint.
  if (u_useCam) c = u_cam * c;

  // Channel swap.
  if (u_swap) c = c.bgr;

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
    float wS = bandWeight(h, u_swap ? 30.0 : 210.0, 55.0, 105.0);
    float wF = 1.0 - wS;
    h += u_sky.x * wS + u_fol.x * wF;
    float s = min(1.0, hsv.y * (1.0 + (u_sky.y - 1.0) * wS) * (1.0 + (u_fol.y - 1.0) * wF));
    float v = hsv.z * (1.0 + (u_sky.z - 1.0) * wS) * (1.0 + (u_fol.z - 1.0) * wF);
    c = hsv2rgb(vec3(fract(h / 360.0), s, v));
  }

  // Tone tint (sepia etc.) after saturation so it survives mono looks.
  c *= u_tint;

  // Halation glow: scattered light adds in LINEAR, before contrast/gamma.
  // 0.7 = GLOW_GAIN in glow.ts — keep in sync.
  c += vec3(u_glow * 0.7 * texture(u_glowTex, v_uv).r);

  // Contrast around mid grey.
  c = (c - 0.5) * u_con + 0.5;

  vec3 g = toGamma(clamp(c, 0.0, 1.0));
  // Tone curve (blacks/shadows/mids/whites/highlights), display space.
  g = vec3(
    texture(u_toneTex, vec2(g.r, 0.5)).r,
    texture(u_toneTex, vec2(g.g, 0.5)).r,
    texture(u_toneTex, vec2(g.b, 0.5)).r
  );
  // Global luminance rides on top of the tone curve (endpoints pinned).
  if (u_lum != 1.0) g = pow(clamp(g, 0.0, 1.0), vec3(1.0 / u_lum));
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
  private isLinear = false;
  private camMatrix: Float32Array | null = null;
  private glowTex: WebGLTexture;
  private toneTex: WebGLTexture;
  // Small offscreen target for the live histogram: the full edit re-rendered at
  // <=HIST_MAX px so a per-frame GPU->CPU readback stays cheap on the iPad.
  private histFbo: WebGLFramebuffer | null = null;
  private histTex: WebGLTexture | null = null;
  private histW = 0;
  private histH = 0;
  private histBuf: Uint8Array | null = null;

  constructor(private canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is required and not available on this device.");
    this.gl = gl;
    this.prog = link(gl, VERT, FRAG);
    gl.useProgram(this.prog);

    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(this.prog, "a_pos");
    gl.enableVertexAttribArray(a);
    gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    for (const u of ["u_tex", "u_wb", "u_swap", "u_hue", "u_sat", "u_con", "u_exposure", "u_linear", "u_cam", "u_useCam", "u_denoise", "u_texel", "u_split", "u_tint", "u_glowTex", "u_glow", "u_sky", "u_fol", "u_rot", "u_toneTex", "u_lum"]) {
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
    this.toneTex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, IDENTITY_LUT);
  }

  /** Rebuild the tone LUT from the five control points (cheap; on change only). */
  setToneCurve(tone: readonly number[]) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    if (toneIsIdentity(tone)) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, IDENTITY_LUT);
      return;
    }
    const fn = toneEvaluator(tone);
    const lut = new Uint8Array(256);
    for (let i = 0; i < 256; i++) lut[i] = Math.round(fn(i / 255) * 255);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, lut);
  }

  /** Display rotation in 90-degree CW steps; swaps the canvas aspect. */
  setRotation(q: number) {
    this.rotQ = ((q % 4) + 4) % 4;
    if (this.imgW) this.applySize();
  }

  get rotation() {
    return this.rotQ;
  }

  private applySize() {
    const odd = (this.rotQ & 1) === 1;
    this.canvas.width = odd ? this.imgH : this.imgW;
    this.canvas.height = odd ? this.imgW : this.imgH;
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

  setImage(img: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; camMatrix?: number[] }) {
    const gl = this.gl;
    const { width, height } = img;
    this.imgW = width;
    this.imgH = height;
    this.isLinear = !!img.linear;
    // Upload column-major for GLSL (our matrix is row-major).
    this.camMatrix = img.camMatrix ? rowToColMajor(img.camMatrix) : null;
    this.applySize();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (img.linear) {
      // Float textures aren't reliably linear-filterable across devices; the
      // canvas is 1:1 with the texture, so NEAREST is correct anyway.
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, img.linear);
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
   *  disagree about what the pixels are. */
  private bindPipeline(p: EditParams, split: number, rot: number) {
    const gl = this.gl;
    gl.useProgram(this.prog);
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform1f(this.loc.u_denoise, p.denoise);
    gl.uniform3f(this.loc.u_tint, p.tint[0], p.tint[1], p.tint[2]);
    gl.uniform3f(this.loc.u_sky, p.sky[0], p.sky[1], p.sky[2]);
    gl.uniform3f(this.loc.u_fol, p.foliage[0], p.foliage[1], p.foliage[2]);
    gl.uniform2f(this.loc.u_texel, 1 / this.imgW, 1 / this.imgH);
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
    gl.uniform1f(this.loc.u_lum, p.lum || 1);
    gl.uniform1i(this.loc.u_glowTex, 1);
    gl.uniform1i(this.loc.u_toneTex, 2);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.toneTex);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.glowTex);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
  }

  /** @param split 0..1 — denoise applies right of this fraction (0 = whole image). */
  render(p: EditParams, split = 0) {
    const gl = this.gl;
    if (!this.imgW) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.bindPipeline(p, split, this.rotQ);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
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
    this.bindPipeline(p, 0, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const buf = this.histBuf!;
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    // Restore the default framebuffer so the next on-screen render is unaffected.
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);

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

  /** Image coordinates (px) for a pointer at CLIENT coords. Uses the live
   *  bounding rect, so CSS zoom/pan transforms and rotation are handled. */
  toImagePixel(clientX: number, clientY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const u = (clientX - r.left) / Math.max(1, r.width);
    const v = (clientY - r.top) / Math.max(1, r.height);
    let iu = u;
    let iv = v;
    if (this.rotQ === 1) { iu = v; iv = 1 - u; }
    else if (this.rotQ === 2) { iu = 1 - u; iv = 1 - v; }
    else if (this.rotQ === 3) { iu = 1 - v; iv = u; }
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
