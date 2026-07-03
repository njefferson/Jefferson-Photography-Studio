// WebGL2 edit pipeline. Every operation is per-pixel, so it lives in one
// fragment shader and runs in real time on the iPad GPU.
//
// Order matches PLAN.md: white balance -> channel swap -> hue/sat -> tone.

// Single source of truth for edit parameters lives in pipeline.ts so the GPU
// preview and CPU export can never drift apart.
import type { EditParams } from "./pipeline";
export type { EditParams };

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_pos.x * 0.5 + 0.5, 0.5 - a_pos.y * 0.5);
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

vec3 toLinear(vec3 c){ return pow(c, vec3(2.2)); }
vec3 toGamma(vec3 c){ return pow(max(c, 0.0), vec3(1.0/2.2)); }

void main() {
  vec3 c = texture(u_tex, v_uv).rgb;
  if (!u_linear) c = toLinear(c);

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

  // Saturation around luma.
  float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(luma), c, u_sat);

  // Contrast around mid grey.
  c = (c - 0.5) * u_con + 0.5;

  frag = vec4(toGamma(clamp(c, 0.0, 1.0)), 1.0);
}`;

export class Renderer {
  private gl: WebGL2RenderingContext;
  private prog: WebGLProgram;
  private tex: WebGLTexture;
  private loc: Record<string, WebGLUniformLocation | null> = {};
  private imgW = 0;
  private imgH = 0;
  private isLinear = false;
  private camMatrix: Float32Array | null = null;

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

    for (const u of ["u_tex", "u_wb", "u_swap", "u_hue", "u_sat", "u_con", "u_exposure", "u_linear", "u_cam", "u_useCam"]) {
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
  }

  setImage(img: { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; camMatrix?: number[] }) {
    const gl = this.gl;
    const { width, height } = img;
    this.imgW = width;
    this.imgH = height;
    this.isLinear = !!img.linear;
    // Upload column-major for GLSL (our matrix is row-major).
    this.camMatrix = img.camMatrix ? rowToColMajor(img.camMatrix) : null;
    this.canvas.width = width;
    this.canvas.height = height;
    gl.viewport(0, 0, width, height);
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

  render(p: EditParams) {
    const gl = this.gl;
    if (!this.imgW) return;
    gl.useProgram(this.prog);
    gl.uniform1i(this.loc.u_tex, 0);
    gl.uniform3f(this.loc.u_wb, p.wb[0], p.wb[1], p.wb[2]);
    gl.uniform1i(this.loc.u_swap, p.swapRB ? 1 : 0);
    gl.uniform1f(this.loc.u_hue, (p.hue * Math.PI) / 180);
    gl.uniform1f(this.loc.u_sat, p.sat);
    gl.uniform1f(this.loc.u_con, p.contrast);
    gl.uniform1f(this.loc.u_exposure, p.exposure);
    gl.uniform1i(this.loc.u_linear, this.isLinear ? 1 : 0);
    gl.uniform1i(this.loc.u_useCam, this.camMatrix ? 1 : 0);
    if (this.camMatrix) gl.uniformMatrix3fv(this.loc.u_cam, false, this.camMatrix);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Image coordinates (px) for a click at canvas-relative (x,y) in CSS pixels. */
  toImagePixel(cssX: number, cssY: number): [number, number] {
    const r = this.canvas.getBoundingClientRect();
    const x = Math.round((cssX / r.width) * this.imgW);
    const y = Math.round((cssY / r.height) * this.imgH);
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
