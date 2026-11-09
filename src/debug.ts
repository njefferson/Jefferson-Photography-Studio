// The test page behind the version number. Every question this app has had to
// answer with "that needs measuring on the device" is measured HERE, on the
// device, because a desktop harness cannot stand in for an iPad: a software
// rasteriser makes graphics timings meaningless, and a laptop's disk says
// nothing about iPad storage.
//
// Read-only with respect to the reader's work: it opens nothing, changes no
// setting, and the storage test writes to a throwaway database of its own that
// it deletes afterwards. Nothing leaves the device.
//
// THE BUILD ROWS SAY WHY THEY DID NOT BUILD (decision 071). Each row of the
// picture code's build carries a Build line into the copied block: whether the
// vertex and fragment shaders compiled and the program linked, the compiler's own
// log, the GL error, and whether the row's graphics context was lost. And the
// report's hold watch (startup.ts) has a row here giving what a look of it costs.
//
// EACH ROW OF THE BUILD MEASUREMENT GIVES ITS GRAPHICS CONTEXT BACK, AND THE THREE
// THAT NEVER BUILT RUN FIRST (decision 071). On the PC, in Firefox, the last three
// rows (the mask settings in a texture and the mask loops counted to 2 and to 8)
// did not build: the browser would not make a sixth graphics context for the page,
// and each earlier row had kept its own. `releaseContext` now asks each row's
// context to be lost through the browser's lose-context extension and empties and
// drops its canvas once the row has its number (or has said why it has none), so
// the next row asks for a fresh one; and the three rows with no PC number run
// before the others, so that if the browser still counts a released context until
// it collects it, the rows that go without are the ones that already have a number.
//
// THE "MASK LOOPS TAKEN OUT" VARIANT IS THE EDITOR'S OWN PROGRAM (decision 071,
// option 11): it is made by `dropMaskLoops` from gl.ts, the function that makes
// the program the editor now opens on, so this page measures what the editor runs.

import "./style.css";
import { buildDiagnostic } from "./diagnostic";
import { measureHoldWatch, holdWatchLine } from "./startup";
// The test page gets the update strip too — it had never had one, so the page a
// reader is most likely to be sitting on during a release was the one that
// never told them a release had happened.
import { onAdoptAnswer, wireUpdateStrip } from "./swupdate";
import { decode } from "./decode";
import { decodeOffThread, decodeLanes } from "./decodeClient";
import { sniff, importFile, type ImportedFile } from "./import";
import { srgbDisplayToP3Display } from "./icc";
import { snapExposure, snapGain, freshBaseline, EXPOSURE_LO, EXPOSURE_HI } from "./tile";
import { workerCount } from "./exportparallel";
import { linearAt, sampleForWb, unitMinGains, exposureHoldingNeutral, WB_GAIN_LO, WB_GAIN_HI, type DecodedImage } from "./decode";
import { readExifSubset } from "./exif";
import { photoCamera as cameraOf, choicesFor, loadedFor, profileRule } from "./camprofile";
import { readBalance, readShown, exactBalance, screenForWhite, TEMPERATURE_MIRED_FAR, TEMPERATURE_MIRED_NEAR } from "./balancestore";
import { makeRowDenoiser } from "./raw/denoise";
import { compileEdit, SAT_GUARD_LO, TONE_DEFAULT, GRADE_DEFAULT, MIX3_DEFAULT, hslDefault, CROP_DEFAULT, neutralMask, MAX_MASKS, sampleBrush, type BrushMask, type EditParams, type MaskLayer } from "./pipeline";
import { prepareSkySource, buildSkySelectionFrom } from "./skyfine";
import { takePanelSample, keyPanelCentres, type PanelKeyed, type PanelSample } from "./panelkey";
import { exportImage } from "./export";
import { drawFrame, canDrawFrame, buildLinearSource, openDrawing, type Drawing, type DrawnFrame, type DrawProbe } from "./gpuexport";
import { Renderer, VERT, FRAG, MASK_LOOP, dropMaskLoops } from "./gl";
import { PLACE_NAMES, PLACE_TARGETS, placesPicture, placeLabels, type PlaceTarget } from "./placesdata";
import { PLACE_CUES, placeCueValues, placeReport } from "./placecues";

declare const __APP_VERSION__: string;

const $ = (id: string) => document.getElementById(id)!;
const results = $("dResults");
const out: string[] = [];
// Where `row` and `note` write while the picture checks run: their own list and
// their own copy block, so the speed rows above are neither moved nor cleared.
let rowsInto: HTMLElement = results;
let outInto: string[] = out;

/** A value that says its row produced no number: did not build, did not draw,
 *  not run, failed, refused, not available, WebGL2 unavailable. */
const NOT_MEASURED = /^(did not (build|draw)|not run|does not fit|failed|refused|not available|WebGL2 unavailable)\b/;

/** `samples` is the raw run-to-run spread, and it goes into the COPIED text as
 *  well as the panel. It did not, at first: the spread was added to make a
 *  median trustworthy, printed only in the panel's prose, and "Copy the results"
 *  builds its block from name and value alone — so the pasted report, which is
 *  how these numbers actually travel, carried the median with nothing to judge
 *  it by. A measurement's uncertainty has to survive the copy or it is not part
 *  of the measurement.
 *  AND A ROW WHOSE VALUE IS ONE OF THE NOT_MEASURED WORDS CARRIES ITS REASON
 *  into the copy, on one line under it, because that reason can hold the
 *  driver's or the browser's own words: a PC reading of 2026-09-30 said "did
 *  not build" and nothing else. (The next reading carried the reason line, and
 *  it held no driver's words either. The driver may have given none, the
 *  context may have died, or a fragment log holding only whitespace may have
 *  hidden the program log, which `timedBuild` read only when the fragment log
 *  was empty; reading every log, labelled, with the GL error and a build in a
 *  fresh context, tells these apart.) A measured
 *  row's copied line is exactly what it was, unless it carries `build`.
 *  AND A ROW OF THE PICTURE CODE'S BUILD CARRIES ITS BUILD LINE in the copy,
 *  measured or not (`buildLine`): whether each shader compiled and the program
 *  linked, the compiler's log, the GL error and whether the graphics context was
 *  lost. A row that built said nothing of this in the copy, so a row that did
 *  not could only be told from it by the value, and the PC's three silent rows
 *  were silent in exactly this. */
function row(name: string, value: string, meaning: string, samples?: string, build?: string) {
  const d = document.createElement("div");
  d.className = "dbg-row";
  d.innerHTML = `<div class="dbg-k"></div><div class="dbg-v"></div><p class="dbg-m"></p>`;
  (d.querySelector(".dbg-k") as HTMLElement).textContent = name;
  (d.querySelector(".dbg-v") as HTMLElement).textContent = value;
  (d.querySelector(".dbg-m") as HTMLElement).textContent = (samples ? `${meaning} Runs: ${samples}.` : meaning) + (build ? ` ${build}` : "");
  rowsInto.appendChild(d);
  // Folded here, where the copy is built, so every source of a reason is one
  // line with no control characters, the editor's own build error included.
  const fold = (s: string) => s.replace(/[\u0000-\u001f\s]+/g, " ").trim();
  outInto.push(`${name}: ${value}` + (samples ? `   [${samples}]` : "")
    + (NOT_MEASURED.test(value) ? `\n    ${fold(meaning)}` : "")
    + (build ? `\n    ${fold(build)}` : ""));
}
function note(text: string) {
  const p = document.createElement("p");
  p.className = "dbg-progress";
  p.textContent = text;
  rowsInto.appendChild(p);
  return p;
}

const ms = (n: number) => `${n < 10 ? n.toFixed(1) : n.toFixed(0)} ms`;
const tick = () => new Promise((r) => setTimeout(r, 0));

// --- the diagnostic text -----------------------------------------------------
const textArea = $("dText") as HTMLTextAreaElement;
/** The report is REBUILT before every speed run, not once at page load.
 *  Pressing "Run again" used to leave the report stamped with the moment the
 *  page opened while the numbers under it were minutes newer — and "Copy the
 *  results" concatenates the two, so a pasted block carried a timestamp and a
 *  storage figure that did not belong to its own measurements. Three reports
 *  pasted back to back showed it: two of them identical, down to the "Taken"
 *  line, with different speed numbers underneath. */
// THIS REPORT AND THE EDITOR'S ARE NOT THE SAME REPORT, and that cost a round
// trip: a line was added to the editor's, "look at the ⓘ report" was said
// without naming which page, and the test page's was sent back instead —
// correctly, since this is where every report all evening had come from. The
// lines that describe the photograph currently open cannot exist here, because
// nothing is open here. So this one says where they are rather than leaving two
// reports that look alike to be told apart by whoever notices something
// missing.
wireUpdateStrip();

// Only the latest build writes: the one at load can finish after the one the
// takeover answer starts, and would put "no answer yet" back. And a report
// arriving while the text is focused, which is where a refused clipboard
// leaves it selected for a hand copy, waits until the focus leaves.
let reportSeq = 0;
let reportLater: string | null = null;
textArea.addEventListener("blur", () => { if (reportLater !== null) { textArea.value = reportLater; reportLater = null; } });
const refreshReport = () => {
  const n = ++reportSeq;
  return buildDiagnostic(__APP_VERSION__, [
    { k: "Not in this report", v: "the photograph you have open — open the app itself and use its ⓘ for that" },
  ]).then((t) => {
    if (n !== reportSeq) return;
    if (document.activeElement === textArea) reportLater = t;
    else { textArea.value = t; reportLater = null; }
  });
};
void refreshReport();
// The worker answers a takeover request only after checking its whole offline
// copy, which is later than the report above is built, so the worker line is
// built again when the answer lands. Only before any speed row exists: once a
// run has shown its numbers, the report above them is the one taken with them,
// and "Copy the results" must not pair it with a later one.
let running = 0;
onAdoptAnswer(() => { if (!out.length && !running) void refreshReport(); });

async function copy(text: string, btn: HTMLButtonElement, label: string, fallback: HTMLTextAreaElement = textArea) {
  const old = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied";
  } catch {
    // Clipboard refused (it often is, without a gesture it trusts). Select the
    // text instead so it can be copied by hand — never a dead button. The
    // fallback has to be the textarea holding THIS text: with the diagnostic's
    // one hard-wired here, pressing the lens profiler's copy button selected
    // the report instead, and a hand-copy then carried the wrong block.
    fallback.hidden = false;
    fallback.focus();
    fallback.select();
    btn.textContent = "Selected — press Copy";
  }
  setTimeout(() => { btn.textContent = old ?? label; }, 2200);
}
($("dCopy") as HTMLButtonElement).addEventListener("click", (e) => copy(textArea.value, e.currentTarget as HTMLButtonElement, "Copy the report"));

// --- speed -------------------------------------------------------------------
/** A full-frame GPU render, and then a small synchronous readback of it. The
 *  readback is what the histogram does on every redraw; on a desktop software
 *  renderer it measures the software, which is why it has to be run here. */
/** How much the edit shader can still hold, on THIS device. Decision 042 gives
 *  masks their own values for the ordinary controls, and the cheapest way to
 *  carry them is as shader uniforms; how many masks that allows depends on a
 *  limit no container measures, because the container's graphics are not the
 *  reader's. About 19 rows a mask (75 floats) is the working estimate from the
 *  record; the row says how many masks that leaves room for, and when the
 *  answer is "not eight", the parameter texture is the route instead. */
async function shaderRoom(): Promise<void> {
  const canvas = document.createElement("canvas");
  let r: Renderer | undefined;
  try {
    r = new Renderer(canvas);
    await r.ready; // the program is still building when the constructor returns (071)
    const b = r.shaderBudget();
    const PER_MASK = 19;
    const room = Math.floor((b.maxVectors - b.vectors) / PER_MASK);
    row("Edit shader: uniforms", `${b.vectors} of ${b.maxVectors} rows`, `${b.uniforms} uniforms in the linked program. Room for about ${room} masks' own values at ${PER_MASK} rows each${room >= 8 ? " — eight fit" : " — eight do NOT fit, so per-mask values need a parameter texture"}.`);
    row("Edit shader: textures", `${b.samplers} of ${b.maxUnits} units`, `${b.maxUnits - b.samplers} texture unit(s) free for the fragment shader (${b.maxCombined} combined). A parameter texture for per-mask values needs one.`);
  } catch (e) {
    row("Edit shader", "not run", `The editor's graphics could not start here (${(e as Error).message.replace(/\.$/, "")}).`);
  } finally {
    // The CONTEXT, not just the canvas — see Renderer.dispose.
    r?.dispose();
  }
}

/** EIGHT MASKS FOR THE FRAME-TIME ROW (decision 042, stage 0). Takes nothing;
 *  returns eight active masks — three radial, two gradient, three colour — with
 *  one radial subtracted from the first and one colour mask added to another, so
 *  the shader's group fold runs. What the row relies on: every mask is ACTIVE
 *  (a non-neutral adjustment), because `maskGroupsForRender` drops a neutral
 *  one and an inactive mask costs the frame nothing; and there are exactly
 *  eight entries, the cap `maskGroupsForRender` keeps whole. */
function eightMasks(): MaskLayer[] {
  const radial = (over: Partial<MaskLayer>): MaskLayer => ({ ...neutralMask(0), ...over });
  const gradient = (over: Partial<MaskLayer>): MaskLayer => ({ ...neutralMask(1), ...over });
  const colour = (over: Partial<MaskLayer>): MaskLayer => ({ ...neutralMask(3), hueTarget: 210, satTarget: 0.35, valTarget: 0.6, ...over });
  return [
    radial({ brightness: 1.1 }),
    radial({ op: 1, cx: 0.6, cy: 0.4, rx: 0.15, ry: 0.15 }),
    gradient({ contrast: 1.1 }),
    colour({ saturation: 1.2 }),
    colour({ op: 3, hueTarget: 30 }),
    radial({ warmth: 0.2, cx: 0.3, cy: 0.7 }),
    gradient({ hue: 10, ly: 0.9, cy: 0.6 }),
    colour({ brightness: 0.95, hueTarget: 100 }),
  ];
}

async function graphics(): Promise<void> {
  const p = note("Graphics…");
  const cv = document.createElement("canvas");
  cv.width = 2000; cv.height = 1400;
  const gl = cv.getContext("webgl2");
  if (!gl) { p.remove(); row("Graphics", "WebGL2 unavailable", "The editor cannot run on this device."); return; }
  const vs = `#version 300 es
    void main(){ vec2 p[3] = vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.)); gl_Position = vec4(p[gl_VertexID],0.,1.); }`;
  // Deliberately arithmetic-heavy, so it stands in for the real edit pipeline
  // rather than for an empty screen clear.
  const fs = `#version 300 es
    precision highp float; out vec4 o;
    void main(){ vec3 c = vec3(0.); for (int i=0;i<64;i++){ float f=float(i);
      c += vec3(sin(gl_FragCoord.x*0.01+f), cos(gl_FragCoord.y*0.01+f), sin((gl_FragCoord.x+gl_FragCoord.y)*0.005+f)); }
      o = vec4(abs(c)/64.,1.); }`;
  const mk = (t: number, src: string) => { const s = gl.createShader(t)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
  gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = new Uint8Array(220 * 146 * 4);
  // warm up: first draw pays for whatever the driver deferred
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  await tick();
  let draw = 0, read = 0;
  const N = 8;
  for (let i = 0; i < N; i++) {
    const a = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.flush();
    const b = performance.now();
    gl.readPixels(0, 0, 220, 146, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    const c = performance.now();
    draw += b - a; read += c - b;
    await tick();
  }
  p.remove();
  row("Frame render (queued)", ms(draw / N), "Time to hand a full-size frame to the graphics chip. Small is expected — the work has not happened yet at this point.");
  row("Reading a frame back", ms(read / N),
    read / N > 60
      ? "SLOW. This is the pause the histogram causes on every redraw, because reading forces the graphics chip to finish everything first. On this device it is worth avoiding."
      : "Fine. Reading pixels back forces the graphics chip to catch up, and on this device that costs little — the histogram is not what makes the editor feel slow.");
}

/** WHAT BUILDING THE EDITOR'S PICTURE CODE COSTS ON THIS DEVICE (decision 071).
 *  The first launch after a release sat for about a minute on a PC with the
 *  start screen painted and nothing answering, and one candidate is this: the
 *  editor builds its whole fragment program while it starts, and the page
 *  waits for the driver. A browser keeps built programs keyed by their source,
 *  so a release that changes the program pays it again once. This builds the
 *  editor's own VERT and FRAG — not a stand-in — made unique each time so no
 *  stored copy can answer, three times, and then the first of them once more,
 *  unchanged, to show what a warm launch pays. Each is drawn once into a
 *  16-pixel frame so the driver has to finish it; nothing is kept. */
/** A 16-pixel WebGL2 frame with a full-screen triangle bound, for timing builds
 *  of the editor's picture code. Takes nothing; gives back the context and the
 *  buffer to delete afterwards, or null where WebGL2 is unavailable. What it
 *  returns is what `timedBuild` expects to be handed. */
function buildFrame(): { gl: WebGL2RenderingContext; tri: WebGLBuffer } | null {
  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 16;
  const gl = cv.getContext("webgl2");
  if (!gl) return null;
  const tri = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  return { gl, tri };
}

/** GIVES A GRAPHICS CONTEXT BACK TO THE BROWSER, for the build rows (decision 071).
 *  Takes `gl`, a context made by `buildFrame`. Returns nothing. Asks the context
 *  to be lost through the browser's lose-context extension (when it is not lost
 *  already), then empties its canvas (width and height 0, which frees the drawing
 *  buffer) and takes the canvas out of any parent, so nothing the page holds
 *  keeps the context reachable. Each step is tried alone, so a context that has
 *  already gone, or an extension a browser withholds, stops none of the others.
 *  What the caller relies on: after this the page holds no reference to the
 *  context through the canvas, and the context is lost by its own account. What
 *  it cannot promise: when the browser stops counting it. Firefox may count a lost
 *  context until it collects it, which a page cannot ask for, and that is why the
 *  rows that never built run first. The caller must read anything it wants from
 *  the context (`isContextLost`, the status of a program) before calling this. */
function releaseContext(gl: WebGL2RenderingContext): void {
  const canvas = gl.canvas as HTMLCanvasElement;
  try { if (!gl.isContextLost()) gl.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* already gone */ }
  try { canvas.width = 0; canvas.height = 0; } catch { /* nothing to empty */ }
  try { canvas.remove(); } catch { /* never attached to a page */ }
}

/** The editor's fragment program made unique by `tag`. Takes a fragment source
 *  and a number; gives back the source with a branch no pixel takes carrying
 *  that number, so no stored copy of an earlier build can answer.
 *  Not a comment: a shader translator may drop comments before the driver's
 *  own cache is consulted (inferred, not measured on a device), and then every
 *  "cold" build would be answered from the copy the editor already made. A
 *  unique constant in a branch no pixel takes survives translation and changes
 *  nothing that is drawn; in the container it read 19-25 ms cold against 3 ms
 *  warm, so it does defeat the cache there. */
function uniqueFrag(src: string, tag: number): string {
  return src.replace("void main() {",
    `void main() {\n  if (gl_FragCoord.x < -${tag}.0) { frag = vec4(${tag}.0 / 1e9); return; }`);
}

/** EVERY SAMPLER ON A UNIT OF ITS OWN, WITH A TEXTURE OF ITS OWN TYPE, so the
 *  first picture is really drawn. Takes the context and a linked program that
 *  is in use; binds a 1 x 1 zero texture per active 2D, 2D-array or 3D sampler, on
 *  units counted up from 0, and gives back the undo that deletes them.
 *  Why: every sampler starts on unit 0, and WebGL2 refuses a draw
 *  (INVALID_OPERATION, 1282) when samplers of different types share a unit. The
 *  editor's program has 2D-array and 3D samplers beside its 2D ones, so until
 *  2026-09-30 every first picture this page timed raised that error and drew
 *  nothing (measured headless). What the draw has to satisfy: `timedBuild`
 *  reads `getError` after it and reports anything but 0, so a sampler type this
 *  does not know stays on unit 0 and shows as an error rather than as a time.
 *  `bindZeroMaskTexture` rebinds the unit one of these got, for one variant. */
function bindSamplers(gl: WebGL2RenderingContext, prog: WebGLProgram): () => void {
  const texs: WebGLTexture[] = [];
  const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS) as number;
  let unit = 0;
  for (let i = 0; i < n; i++) {
    const u = gl.getActiveUniform(prog, i);
    const target = !u ? 0 : u.type === gl.SAMPLER_2D ? gl.TEXTURE_2D
      : u.type === gl.SAMPLER_2D_ARRAY ? gl.TEXTURE_2D_ARRAY : u.type === gl.SAMPLER_3D ? gl.TEXTURE_3D : 0;
    if (!u || !target) continue;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(target, tex);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    if (target === gl.TEXTURE_2D) gl.texImage2D(target, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    else gl.texImage3D(target, 0, gl.RGBA8, 1, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.uniform1i(gl.getUniformLocation(prog, u.name), unit);
    texs.push(tex);
    unit++;
  }
  gl.activeTexture(gl.TEXTURE0);
  return () => { texs.forEach((t) => gl.deleteTexture(t)); };
}

/** ONE BUILD OF A PROGRAM, TIMED THE WAY A LAUNCH PAYS IT (decision 071). Takes a
 *  context from `buildFrame`, a vertex and a fragment source, and optionally
 *  `prep`, which binds what a rewritten variant needs before its first draw
 *  and returns its own undo; builds them, then draws once so the driver has to
 *  finish. Gives back the build and the first picture in milliseconds, and
 *  `err`, the GL error that draw raised (0 for none), so a "first picture" that
 *  never drew cannot pass for one, and `status`, whether each shader compiled
 *  and the program linked and what the logs said (`BuildStatus`); throws a
 *  `BuildError` if the program did not build, with
 *  every one of the driver's logs that says anything, labelled, the time the
 *  failed build took and the GL error read after it, and the same `status`.
 *  `buildingThePictureCode` and `whatMakesTheBuildSlow` both read these two
 *  numbers against each other's, so they must stay one measurement.
 *  Everything queued before a run is finished first, so no run is billed for
 *  the one before it — the first version of this row was, and read 20 ms for
 *  its first build and 350 for the next two.
 *  BUILT, THEN DRAWN, timed apart: some drivers finish the picture code only
 *  when it first draws, so the build alone can look cheap while the first
 *  picture pays for it. */
function timedBuild(gl: WebGL2RenderingContext, vert: string, frag: string,
  prep?: (gl: WebGL2RenderingContext, prog: WebGLProgram) => () => void): { link: number; draw: number; err: number; status: BuildStatus } {
  const px = new Uint8Array(4);
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  drain();
  const t0 = performance.now();
  const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
  const vs = mk(gl.VERTEX_SHADER, vert);
  const fs = mk(gl.FRAGMENT_SHADER, frag);
  const prog = gl.createProgram()!;
  gl.attachShader(prog, vs); gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  // Reading the status is what makes the page wait, exactly as the editor's
  // own start does.
  const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
  const t1 = performance.now();
  // WHAT THE DRIVER SAID ABOUT EACH STEP, read AFTER the timed stretch so the
  // reads cost the measurement nothing: whether each shader compiled, whether the
  // program linked, and every log that says anything. A context that was lost
  // answers all of these with nothing, so each flag is null (unknown) rather than
  // false there, and the row says the status could not be read instead of saying
  // the program did not compile.
  const known = !gl.isContextLost();
  const flag = (v: unknown): boolean | null => (known ? !!v : null);
  const fold = (s: string | null) => (s ?? "").replace(/[\u0000-\u001f\s]+/g, " ").trim().slice(0, 300);
  const logs = ([["program", gl.getProgramInfoLog(prog)], ["fragment", gl.getShaderInfoLog(fs)], ["vertex", gl.getShaderInfoLog(vs)]] as [string, string | null][])
    .map(([what, log]) => [what, fold(log)])
    .filter(([, log]) => log)
    .map(([what, log]) => `${what}: ${log}`);
  const status: BuildStatus = {
    vertex: flag(gl.getShaderParameter(vs, gl.COMPILE_STATUS)),
    fragment: flag(gl.getShaderParameter(fs, gl.COMPILE_STATUS)),
    linked: flag(ok),
    logs: logs.join(" · "),
    glErr: 0,
  };
  if (!ok) {
    // THE DRIVER'S OWN WORDS, EVERY LOG, LABELLED, as the editor's own build
    // reads them (gl.ts). This read `shader log || program log` until
    // 2026-09-30, so a fragment log holding only a newline would count as
    // present and hide the program log, where, by decision 071's reading of
    // ANGLE's source (an inference, not documented or measured), a refusal
    // made at link would be. Three rows on the PC read "did not build" with no
    // words from the driver; whether this, a context that had died, or a driver
    // that gave no words explains them is not known. One line each, with no control characters: drivers
    // end a log with a newline and a NUL, and the copied results put this under
    // its row as one line. (Read above, with the status of each step.)
    // AND THE TIME AND THE GL ERROR, so a refusal can be told from a context
    // that had already died: a lost context answers every log with nothing and
    // the first `getError` after the loss with CONTEXT_LOST_WEBGL (37442).
    const glErr = gl.getError();
    status.glErr = glErr;
    gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
    throw new BuildError(`the editor's picture code did not build on this device after ${ms(t1 - t0)} (${logs.join(" · ") || "the driver gave no reason"}; ${glErr ? `GL error ${glErr}` : "no GL error"})`, status);
  }
  gl.useProgram(prog);
  const loc = gl.getAttribLocation(prog, "a_pos");
  if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
  const undoSamplers = bindSamplers(gl, prog);
  const undo = prep ? prep(gl, prog) : null;
  gl.getError(); // clear anything left over, so `err` is this draw's alone
  // The draw is timed from here, so the textures and buffers bound above are
  // not billed to the first picture; getError has already waited for them.
  const td = performance.now();
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  const err = gl.getError();
  drain();
  const t2 = performance.now();
  undo?.();
  undoSamplers();
  gl.useProgram(null);
  gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
  return { link: t1 - t0, draw: t2 - td, err, status };
}

/** WHAT THE DRIVER SAID ABOUT ONE BUILD, step by step (decision 071). `vertex`
 *  and `fragment` are whether that shader compiled and `linked` whether the
 *  program linked; each is null when the graphics context was lost, which
 *  answers nothing, so a lost context never reads as a program that failed.
 *  `logs` is every log that says anything, labelled and folded to one line (empty
 *  when the driver said nothing), and `glErr` the GL error read after a failed
 *  link (0 for none, and always 0 on a build that linked). */
interface BuildStatus { vertex: boolean | null; fragment: boolean | null; linked: boolean | null; logs: string; glErr: number }

/** The error `timedBuild` throws when the program did not build: the same words
 *  as before, and the status of each step beside them, for the row's build line. */
class BuildError extends Error {
  status: BuildStatus;
  constructor(message: string, status: BuildStatus) {
    super(message);
    this.status = status;
  }
}

/** THE BUILD LINE OF A ROW, for the copied block and the panel (decision 071).
 *  Takes the build's `status` (null when none was read), `context`, the state of
 *  the row's graphics context in words, and `how`: "picture" with the GL error its
 *  first picture raised (`pictureErr`), or "failed" for a build that did not link
 *  (`reasonAbove` true when the row's reason already carries the driver's words,
 *  so they are not printed twice). Returns one sentence beginning "Build:" saying
 *  whether the vertex shader compiled, the fragment shader compiled and the
 *  program linked, what the compiler's log said, the GL error, and whether the
 *  context was lost. What the caller relies on: it is a statement of what was
 *  read and never an explanation, and a step whose status could not be read
 *  (a lost context) says so instead of saying it failed. */
function buildLine(status: BuildStatus | null, context: string, how: "picture" | "failed", pictureErr = 0, reasonAbove = false): string {
  if (!status) return `Build: no status was read for this row; graphics context: ${context}.`;
  const step = (what: string, v: boolean | null, good: string, bad: string) =>
    `${what} ${v === null ? "status could not be read (the context was lost)" : v ? good : bad}`;
  const log = how === "failed" && reasonAbove
    ? (status.logs ? "compiler log: in the reason above" : "compiler log: none given by the driver")
    : `compiler log: ${status.logs || (how === "failed" ? "none given by the driver" : "empty")}`;
  const glError = how === "failed"
    ? (status.glErr ? `GL error ${status.glErr} after the failed link` : "no GL error after the failed link")
    : (pictureErr ? `first picture raised GL error ${pictureErr}` : "first picture drawn with no GL error");
  return `Build: ${step("vertex shader", status.vertex, "compiled", "did not compile")} · ${step("fragment shader", status.fragment, "compiled", "did not compile")} · ${step("program", status.linked, "linked", "did not link")} · ${log} · ${glError} · graphics context: ${context}.`;
}

async function buildingThePictureCode(): Promise<void> {
  const p = note("Building the editor's picture code…");
  const frame = buildFrame();
  if (!frame) { p.remove(); row("Building the picture code", "WebGL2 unavailable", "The editor cannot run on this device."); return; }
  const { gl, tri } = frame;
  const parallel = !!gl.getExtension("KHR_parallel_shader_compile");
  const build = (tag: number) => timedBuild(gl, VERT, uniqueFrag(FRAG, tag));
  try {
    const stamp = 1000 + Math.floor(Math.random() * 8e8);
    const cold: { link: number; draw: number; err: number; status: BuildStatus }[] = [];
    for (let i = 0; i < 3; i++) { cold.push(build(stamp + i)); await tick(); }
    const warm = build(stamp);
    p.remove();
    const tot = (r: { link: number; draw: number }) => r.link + r.draw;
    // THE BUILD LINE (decision 071): whether it compiled and linked, what the log
    // said, and whether this page's one context was lost, for the first build and
    // for the warm one, which are the two this row reports.
    const ctx = gl.isContextLost() ? "LOST (the context says so)" : "not lost";
    // THE FIRST RUN IS THE HEADLINE, NOT THE MEDIAN. It is the only one of the
    // three made the way a launch makes it, as the first program in a fresh
    // context; the two after it ran with the driver already started and can be
    // far cheaper. Measured on an iPad, 2026-09-26: 557 ms, then 22 and 22, and
    // the median it used to lead with (23 ms) hid the number this row exists for.
    const first = cold[0];
    // A FIRST PICTURE THAT RAISED AN ERROR WAS NOT DRAWN, so a row whose draw
    // failed prints no time: its number would be a build plus a refused draw.
    const refused = [...cold, warm].find((r) => r.err);
    if (refused) {
      row("Building the picture code (first time)", `did not draw (GL error ${refused.err})`,
        "The picture code built, but its first picture raised an error, so no time here would be what a launch pays.",
        `${cold.map((r) => `${ms(r.link)} to build${r.err ? `, GL error ${r.err}` : ""}`).join("; ")}`,
        buildLine(refused.status, ctx, "picture", refused.err));
      return;
    }
    const runs = cold.map((r) => `${ms(r.link)} + ${ms(r.draw)}`).join(", ");
    row("Building the picture code (first time)", ms(tot(first)),
      tot(first) > 5000
        ? `SLOW. The editor takes this long to get ready the first time after a release that changes its graphics.${parallel ? " The start screen says it is preparing, and should stay usable meanwhile — the report's Start-up line says whether it did." : " This device offers no way to build it without holding the page, so the start screen says it is preparing and then waits."}`
        : "The editor takes this long to get ready the first time after a release that changes its graphics. On this device it is not what would hold up a launch.",
      `${runs} (built + first picture). The first is what a launch after a release pays; the later ones ran in the same page after the graphics had started, and can be much cheaper.`,
      buildLine(first.status, ctx, "picture", first.err));
    row("Building it again (a normal launch)", ms(tot(warm)),
      `What an ordinary launch pays once the device has kept the built program: ${ms(warm.link)} to build and ${ms(warm.draw)} for the first picture.${parallel ? " This device offers to build it without holding the page, and the editor now asks it to." : " This device offers no way to build it without holding the page, so on a first start after an update the editor says it is preparing before it waits."}`,
      undefined, buildLine(warm.status, ctx, "picture", warm.err));
  } catch (err) {
    p.remove();
    row("Building the picture code", "failed", (err as Error).message, undefined,
      buildLine(err instanceof BuildError ? err.status : null, gl.isContextLost() ? "LOST (the context says so)" : "not lost", "failed", 0, true));
  } finally {
    // The rows are written above, so the context's state has been read; this one
    // is given back so the build measurement after it starts from a fresh one.
    gl.deleteBuffer(tri);
    releaseContext(gl);
  }
}

/** A loop whose count the compiler can read off its header, `for (int dy = -3;
 *  dy <= 3;`. Direct3D's compiler (FXC) unrolls every such loop ANGLE does not
 *  mark, and ANGLE marks only loops that take a gradient (decision 071, Looked
 *  up). The count of these, and of `MASK_LOOP`, is printed with each variant. */
const COUNTED_LOOP = /for \(int (\w+) = (-?\d+); \1 (<=?) (-?\d+);/g;
/** The editor's fragment program with every counted loop given a count the
 *  compiler cannot see: `<= 3` becomes `<= 3 + u_dbgZero`, an unset uniform,
 *  so 0. Takes a fragment source; gives back the rewritten source and how many
 *  loops it changed. The loops do the same work; only unrolling is taken away.
 *  A count of zero means the program has changed shape and the variant must not
 *  be timed, because it would be the program as shipped under another name. */
function hideLoopCounts(src: string): { src: string; loops: number } {
  let loops = 0;
  const s = src.replace(COUNTED_LOOP, (_m, v: string, a: string, op: string, b: string) => {
    loops++;
    return `for (int ${v} = ${a}; ${v} ${op} ${b} + u_dbgZero;`;
  });
  return { src: s.replace("void main() {", "uniform int u_dbgZero;\nvoid main() {"), loops };
}

// The variant "with the mask loops taken out" is `dropMaskLoops` from gl.ts, the
// very function that makes the program the editor opens on (decision 071, option
// 11), so this page measures what the editor runs.

/** The editor's fragment program with every mask loop run to a count the
 *  compiler can see, `k`, in place of `u_maskCount`: the per-mask-count build
 *  (decision 071), where a photograph's program would be built for the number
 *  of masks it has.
 *  @param src  a fragment source, the editor's FRAG.
 *  @param k  the count, 2 or `MAX_MASKS`; at `MAX_MASKS` every index stays
 *    inside the arrays (8 per-mask slots, `u_maskHsl[64]` at i*8+7,
 *    `u_maskGrade[24]` at i*3+2, the local `gW[8]`).
 *  @returns the rewritten source, how many loops it changed, and `clean`: true
 *    only when the one `u_maskCount` left is its declaration. Consumer: the
 *    build-slow rows, which print "not run" unless `loops > 0` and `clean`, so
 *    a mask loop written some other way can never be timed under this name. */
function fixMaskLoops(src: string, k: number): { src: string; loops: number; clean: boolean } {
  let loops = 0;
  const s = src.replace(MASK_LOOP, (_m, v: string) => { loops++; return `; ${v} < ${k};`; });
  return { src: s, loops, clean: (s.match(/\bu_maskCount\b/g) ?? []).length === 1 };
}

/** THE FIFTEEN PER-MASK UNIFORM ARRAYS the mask loops index (decision 071,
 *  option 8), and where each lands in the two rewrites below: `field` is the
 *  vec4 slot per mask, `sw` the components read, `int` whether the value is an
 *  int. `u_maskHsl` (8 per mask) and `u_maskGrade` (3 per mask) are indexed by
 *  a computed index and are handled on their own. */
const MASK_FIELDS: [string, number, string, boolean][] = [
  ["u_maskType", 0, "x", true], ["u_maskSlot", 0, "y", true], ["u_maskOp", 0, "z", true], ["u_maskAims", 0, "w", true],
  ["u_maskGeoA", 1, "", false], ["u_maskGeoB", 2, "", false], ["u_maskAdj", 3, "", false],
  ["u_maskFol", 4, "xyz", false], ["u_maskSkyBand", 5, "xyz", false], ["u_maskHue", 6, "x", false], ["u_maskGradeBal", 6, "y", false],
  ["u_maskLumLut", 6, "zw", false], ["u_maskShadow", 4, "w", false],
];
const MASK_ARRAY_NAMES = [...MASK_FIELDS.map((f) => f[0]), "u_maskHsl", "u_maskGrade"];
/** How many entries each of those arrays declares in `src/gl.ts`: 8 per mask,
 *  8 mixer bands a mask for `u_maskHsl`, 3 grade rows a mask for `u_maskGrade`.
 *  The rewrites' blocks and texture are laid out for exactly these. */
const MASK_ARRAY_SIZE: Record<string, number> = { ...Object.fromEntries(MASK_FIELDS.map((f) => [f[0], 8])), u_maskHsl: 64, u_maskGrade: 24 };

/** Rewrite every per-mask uniform array of a fragment source through `to`.
 *  Takes the source, the declarations to put in their place (inserted after
 *  `uniform int u_maskCount;`), and `to(name, index)` giving the new read for
 *  one index site. Gives back the source, with its comments removed, and
 *  whether the rewrite is whole: the per-mask arrays declared are exactly the
 *  fifteen at the sizes in `MASK_ARRAY_SIZE`, all fifteen declarations are
 *  removed, every array is read at least once, and no read or declaration of a
 *  per-mask array is left. What the caller relies on: `ok` false means the
 *  program has changed shape and the variant must print "not run", never a
 *  time for a program that is not what it claims to be. */
function rewriteMaskArrays(src: string, decls: string, to: (name: string, index: string) => string): { src: string; ok: boolean; sites: number } {
  // Comments go first: a use named in a comment is not a read, and was counted
  // as one (54 where the program reads 53). GLSL has no string literals, so
  // every `//` and `/*` starts a comment.
  let s = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, ""), removed = 0, sites = 0, everyRead = true;
  // THE SET OF PER-MASK ARRAYS HAS TO BE THE ONE THIS WAS WRITTEN FOR. A new
  // array, or one resized, would be left out of the rewrite and still pass.
  const declared = [...s.matchAll(/^uniform (?:\w+ )?\w+ (u_mask\w+)\[(\d+)\];/gm)].map((m) => `${m[1]}[${m[2]}]`).sort();
  const expected = MASK_ARRAY_NAMES.map((n) => `${n}[${MASK_ARRAY_SIZE[n]}]`).sort();
  const sameSet = declared.join() === expected.join();
  for (const name of MASK_ARRAY_NAMES) {
    const decl = new RegExp(`^uniform (?:int|float|vec2|vec3|vec4) ${name}\\[\\d+\\];.*$`, "m");
    if (decl.test(s)) { s = s.replace(decl, ""); removed++; }
    let n = 0;
    s = s.replace(new RegExp(`\\b${name}\\[([^\\]]+)\\]`, "g"), (_m, idx: string) => { n++; return to(name, idx.trim()); });
    if (!n) everyRead = false;
    sites += n;
  }
  const anchor = "uniform int u_maskCount;";
  const anchored = s.split(anchor).length === 2;
  if (anchored) s = s.replace(anchor, `${anchor}\n${decls}`);
  const left = new RegExp(`\\b(?:${MASK_ARRAY_NAMES.join("|")})\\[`).test(s) || /^uniform (?:\w+ )?\w+ u_mask\w*\[\d+\];/m.test(s);
  return { src: s, ok: sameSet && removed === MASK_ARRAY_NAMES.length && everyRead && anchored && !left, sites };
}

/** OPTION 8, FIRST FORM: the mask parameters in uniform blocks. One block whose
 *  only member is an array of 50 structs of vec4 and ivec4 (so std140 needs no
 *  padding, and ANGLE can hand FXC a StructuredBuffer), and the colour-mixer and
 *  grade offsets in blocks of their own, since a struct in such a block may not
 *  hold an array. Takes a fragment source; gives back `rewriteMaskArrays`'
 *  answer. */
function masksToBlocks(src: string): { src: string; ok: boolean; sites: number } {
  const decls = [
    "struct DbgMask { ivec4 f0; vec4 f1; vec4 f2; vec4 f3; vec4 f4; vec4 f5; vec4 f6; };",
    "struct DbgV { vec4 v; };",
    "layout(std140) uniform DbgMasks { DbgMask m[50]; } dbgM;",
    "layout(std140) uniform DbgHsl { DbgV e[64]; } dbgH;",
    "layout(std140) uniform DbgGrade { DbgV e[50]; } dbgG;",
  ].join("\n");
  return rewriteMaskArrays(src, decls, (name, i) => {
    if (name === "u_maskHsl") return `dbgH.e[${i}].v.xyz`;
    if (name === "u_maskGrade") return `dbgG.e[${i}].v.xyz`;
    const [, field, sw] = MASK_FIELDS.find((f) => f[0] === name)!;
    return `dbgM.m[${i}].f${field}${sw ? `.${sw}` : ""}`;
  });
}

/** OPTION 8, SECOND FORM: the same parameters in one float texture read with
 *  texelFetch, as the measured lens curve was until it began filtering between
 *  bins (`u_lensTex`, 2026-10-02): 18 texels
 *  per mask (7 fields, 8 mixer bands, 3 grade rows), one row per mask. Takes a
 *  fragment source; gives back `rewriteMaskArrays`' answer, with `ok` false
 *  when the source no longer declares the sampler this reads through.
 *
 *  THROUGH A SAMPLER THE PROGRAM ALREADY HAS, NOT A NEW ONE (2026-10-02). The
 *  editor's program uses sixteen samplers, which is every texture unit WebGL 2
 *  guarantees a fragment shader, so a seventeenth made this copy unbuildable on
 *  any device at that minimum, and the row read as the device failing. The
 *  reads go through `MASK_TEX_SAMPLER` instead, whose own reads are by integer
 *  address too, and `bindZeroMaskTexture` puts the zero mask texture on its
 *  unit for the one draw. What the compiler sees is the same: fifteen arrays
 *  of reads turned into texelFetch on a 2D float texture. */
const MASK_TEX_SAMPLER = "u_flatTex";
function masksToTexture(src: string): { src: string; ok: boolean; sites: number } {
  const at = (x: string, y: string) => `texelFetch(${MASK_TEX_SAMPLER}, ivec2(${x}, ${y}), 0)`;
  const has = new RegExp(`^uniform (?:highp )?sampler2D ${MASK_TEX_SAMPLER};`, "m").test(src);
  const r = rewriteMaskArrays(src, "", (name, i) => {
    if (name === "u_maskHsl") return `${at(`7 + (${i}) % 8`, `(${i}) / 8`)}.xyz`;
    if (name === "u_maskGrade") return `${at(`15 + (${i}) % 3`, `(${i}) / 3`)}.xyz`;
    const [, field, sw, isInt] = MASK_FIELDS.find((f) => f[0] === name)!;
    const read = `${at(String(field), `(${i})`)}${sw ? `.${sw}` : ""}`;
    return isInt ? `int(${read})` : read;
  });
  return { ...r, ok: r.ok && has };
}

/** HOW MANY TEXTURE UNITS A FRAGMENT SOURCE NEEDS: the samplers it declares
 *  and reads, comments removed. Takes the source; gives back the count. A
 *  sampler declared and never read is left out, as a linker drops it. What the
 *  caller relies on: a program whose count exceeds MAX_TEXTURE_IMAGE_UNITS is
 *  refused by the link on every device with that limit, so such a row is
 *  reported as a copy that does not fit rather than as a device that failed.
 *  Sampler arrays count their length; the editor declares none. */
function samplerUnits(src: string): number {
  const s = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  let n = 0;
  for (const m of s.matchAll(/^uniform (?:(?:lowp|mediump|highp) )?\w*sampler\w+ (\w+)(?:\[(\d+)\])?;/gm)) {
    const uses = s.match(new RegExp(`\\b${m[1]}\\b`, "g"))?.length ?? 0;
    if (uses > 1) n += m[2] ? Number(m[2]) : 1;
  }
  return n;
}

/** Bind a zero-filled buffer to every uniform block the variant's program kept,
 *  before its first draw: a block with no buffer bound makes the draw fail.
 *  Takes the context and program; returns the undo. */
function bindZeroBlocks(gl: WebGL2RenderingContext, prog: WebGLProgram): () => void {
  const bufs: WebGLBuffer[] = [];
  ["DbgMasks", "DbgHsl", "DbgGrade"].forEach((name, k) => {
    const idx = gl.getUniformBlockIndex(prog, name);
    if (idx === gl.INVALID_INDEX) return;
    gl.uniformBlockBinding(prog, idx, k);
    const size = gl.getActiveUniformBlockParameter(prog, idx, gl.UNIFORM_BLOCK_DATA_SIZE) as number;
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.UNIFORM_BUFFER, buf);
    gl.bufferData(gl.UNIFORM_BUFFER, size, gl.STATIC_DRAW);
    gl.bindBufferBase(gl.UNIFORM_BUFFER, k, buf);
    bufs.push(buf);
  });
  return () => { bufs.forEach((b) => gl.deleteBuffer(b)); gl.bindBuffer(gl.UNIFORM_BUFFER, null); };
}

/** Bind a zero 18 x 8 float texture for the texture variant, on the unit
 *  `bindSamplers` gave `MASK_TEX_SAMPLER`, in place of the 1 x 1 texture put
 *  there — the variant reads its mask settings through that sampler (see
 *  `masksToTexture`). Takes the context and program; returns the undo. */
function bindZeroMaskTexture(gl: WebGL2RenderingContext, prog: WebGLProgram): () => void {
  const loc = gl.getUniformLocation(prog, MASK_TEX_SAMPLER);
  if (!loc) return () => {};
  const unit = gl.getUniform(prog, loc) as number;
  const tex = gl.createTexture()!;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 18, 8, 0, gl.RGBA, gl.FLOAT, new Float32Array(18 * 8 * 4));
  gl.activeTexture(gl.TEXTURE0);
  return () => { gl.deleteTexture(tex); };
}

/** ONE MORE BUILD OF A ROW THAT FAILED, IN A CONTEXT OF ITS OWN (decision 071).
 *  Takes the fragment source a row failed with, a number to make it unique, and
 *  the row's `prep`; builds and draws it once in a fresh 16-pixel context, then
 *  gives that context up. Gives back one sentence for the row's reason.
 *  Why: on the PC the last three rows failed in a row with no reason given,
 *  2026-09-30, which fits a context that had died as well as three refusals.
 *  Each row is first built in a context of its own (`rowContext`); one that
 *  fails there is built once more in another, where nothing came before it. A
 *  program that builds there was not refused by the driver; one that fails
 *  again, in a context that was not lost, points at the program (a device or
 *  graphics process that had itself failed could fail a fresh context too). A
 *  fresh context that is lost before or during the build says so rather than
 *  reading as the program failing. What the sentence has to satisfy: it is read in the copied
 *  results under a row whose value says it did not build, or did not build or
 *  draw because the context was lost, so it must say what the fresh context
 *  did, and its time is never compared with the other rows'. */
function freshBuild(src: string, tag: number, prep?: (gl: WebGL2RenderingContext, prog: WebGLProgram) => () => void): string {
  const f = buildFrame();
  if (!f) return "A fresh context could not be made, so it was not built again.";
  if (f.gl.isContextLost()) {
    f.gl.deleteBuffer(f.tri);
    releaseContext(f.gl);
    return "A fresh context was lost before anything was built in it, so it was not built again.";
  }
  try {
    const r = timedBuild(f.gl, VERT, uniqueFrag(src, tag), prep);
    if (f.gl.isContextLost()) return `Built again in a fresh context in ${ms(r.link)}, and that context was lost before its first picture.`;
    if (r.err) return `Built again in a fresh context in ${ms(r.link)}; its first picture raised GL error ${r.err}.`;
    return `Built again in a fresh context: ${ms(r.link)} + ${ms(r.draw)} (built + first picture). So this device builds this program; what failed was the context it was first built in.`;
  } catch (err) {
    if (f.gl.isContextLost()) return `Built again in a fresh context, and that context was lost during the build: ${(err as Error).message}.`;
    return `Built again in a fresh context, and it did not build there: ${(err as Error).message}.`;
  } finally {
    f.gl.deleteBuffer(f.tri);
    releaseContext(f.gl);
  }
}

/** A GRAPHICS CONTEXT FOR ONE ROW OF `whatMakesTheBuildSlow`, AND FOR NOTHING
 *  ELSE (decision 071). Takes nothing; makes a fresh 16-pixel context with
 *  `buildFrame`, listens for its loss, and builds and draws a tiny program in
 *  it first, so the row's own build is not billed for starting the graphics.
 *  Gives back the context, `lost()`, true once the browser has reported this
 *  context lost or the context says it is, `state()`, the same fact in words
 *  for the row's build line (lost and reported, lost with no event heard, or
 *  not lost), and `done()`, which stops listening and gives the context back
 *  through `releaseContext` (lost by the lose-context extension, its canvas
 *  emptied and dropped); or, where no usable context could be had, one
 *  sentence for the row's reason.
 *  What it has to satisfy: no two rows share a context, so a row that loses
 *  its own cannot stop the rows after it from being measured; and every
 *  context it makes is given up, by `done()` or before it returns a sentence,
 *  because a page holds only so many at once and the oldest is taken from it
 *  past that. Until 2026-10-02 the eight rows shared one context, and on the
 *  PC's run of v2.64.56 three of them never ran: the first row that failed
 *  lost that context, and every row after it read "not run". */
function rowContext(): { gl: WebGL2RenderingContext; lost: () => boolean; state: () => string; done: () => void } | string {
  const f = buildFrame();
  if (!f) return "A fresh graphics context could not be made for this row, so it was not built.";
  const { gl, tri } = f;
  const canvas = gl.canvas as HTMLCanvasElement;
  // The event is fired from a queued task, so it cannot arrive during a
  // synchronous build; the caller reads `lost()` in the tick after each build.
  let heard = false;
  const onLost = () => { heard = true; };
  canvas.addEventListener("webglcontextlost", onLost);
  const lost = () => heard || gl.isContextLost();
  // THE CONTEXT'S STATE IN WORDS, for the row's build line: lost and the browser
  // said so (the event), lost by the context's own account with no event heard,
  // or not lost. The three are different findings.
  const state = () => heard ? "LOST (the browser reported it)" : gl.isContextLost() ? "LOST (the context says so; the browser sent no event)" : "not lost";
  const done = () => {
    canvas.removeEventListener("webglcontextlost", onLost);
    try { gl.deleteBuffer(tri); } catch { /* already gone */ }
    releaseContext(gl);
  };
  if (lost()) {
    done();
    return "The fresh graphics context made for this row was lost before anything was built in it, so it was not built.";
  }
  try {
    timedBuild(gl,
      "#version 300 es\nin vec2 a_pos;\nvoid main() { gl_Position = vec4(a_pos, 0.0, 1.0); }",
      "#version 300 es\nprecision mediump float;\nout vec4 frag;\nvoid main() { frag = vec4(1.0); }");
  } catch (err) {
    const why = lost() ? "was lost while a tiny program was built in it to start the graphics" : `could not build the tiny program that starts the graphics (${(err as Error).message})`;
    done();
    return `The fresh graphics context made for this row ${why}, so the row was not built.`;
  }
  return { gl, lost, state, done };
}

/** The name of the build row that is the editor's program unchanged, which every
 *  other row is compared against. */
const AS_SHIPPED = "As shipped";

/** WHICH PART OF THE PICTURE CODE THE 44 SECONDS IS (decision 071). The PC in
 *  Firefox took 44,527 ms to build it on v2.63.34, and changing how its loops
 *  sample did nothing, because ANGLE already did that itself. The sources name
 *  two causes: FXC unrolling every loop it can count, and FXC's slowness with
 *  loops that index uniform arrays. This builds the editor's own program eight
 *  ways, once each, EACH IN A CONTEXT OF ITS OWN (`rowContext`) after a tiny
 *  program has started the graphics there: the mask settings in a texture and
 *  the mask loops counted to 2 and to 8 (the three that never built on the PC,
 *  so they run first), then as shipped, then with the counts hidden, with the
 *  mask loops dropped, both, and the mask settings in uniform blocks (each of
 *  option 8's forms bound by its `prep` before the first draw; counted to 2 and
 *  to 8 is a count the compiler can see). Each is built and drawn once here and
 *  never used by the editor, and each row's context is given back to the browser
 *  (`releaseContext`) once its row is written, before the next row asks for
 *  one. A row whose rewrite does not fit the source prints "not run", and one
 *  whose draw fails prints no time; the rest are compared, and the one that
 *  saves the most names the cause. A row that does not build, or whose context
 *  is lost, says so, and is built once more in another fresh context
 *  (`freshBuild`), so a refusal can be told from a context that died: the PC's
 *  last three rows failed in a row with no reason given, 2026-09-30, and on the
 *  PC's run of staging 2.65.13 they did not build because the browser would not
 *  make a sixth context. A row's failure, or the loss of its context, reaches no
 *  other row. What the copied block relies on: every row has a Build line, and
 *  the line naming what saved the most reads over the rows that built. */
async function whatMakesTheBuildSlow(): Promise<void> {
  const p = note("Building the editor's picture code eight ways, each in a graphics context of its own that is given back after its row… this takes about eight builds, which on a Windows PC can be five minutes or more; the first three rows are the ones that did not build here before, and a row that does not build is built once more on its own.");
  // A first context, only to learn whether WebGL2 is here and how many
  // texture units this device gives a picture program; given up at once.
  const probe = buildFrame();
  if (!probe) { p.remove(); row("What makes the build slow", "WebGL2 unavailable", "The editor cannot run on this device."); return; }
  // THE TEXTURE UNITS THIS DEVICE GIVES A FRAGMENT SHADER. WebGL 2 promises
  // 16 and the editor uses all 16, so a copy that needs one more cannot build
  // on a device at the minimum — every such device refuses it at the link,
  // which says nothing about this one. Such a row is not built.
  const maxUnits = probe.gl.getParameter(probe.gl.MAX_TEXTURE_IMAGE_UNITS) as number;
  probe.gl.deleteBuffer(probe.tri);
  releaseContext(probe.gl);
  const tot = (r: { link: number; draw: number }) => r.link + r.draw;
  try {
    const hidden = hideLoopCounts(FRAG);
    const dropped = dropMaskLoops(FRAG);
    const both = dropMaskLoops(hidden.src);
    const blocks = masksToBlocks(FRAG);
    const texed = masksToTexture(FRAG);
    const two = fixMaskLoops(FRAG, 2);
    const most = fixMaskLoops(FRAG, MAX_MASKS);
    // THE ORDER THE ROWS RUN IN: the three that never built on the PC first (the
    // mask settings in a texture, then the mask loops counted to 2 and to the
    // most), then the as-shipped row, then the rest. On the PC, in Firefox, the
    // browser would not make a sixth graphics context and these three came last;
    // they are the routes that might make the masked build fast and have no
    // number from that machine, so they go before anything that already has one.
    const variants: { name: string; src: string; changed: string; ok: boolean; prep?: (gl: WebGL2RenderingContext, prog: WebGLProgram) => () => void }[] = [
      // OPTION 8 (decision 071): the mask loops kept, their parameters moved out
      // of the indexed uniform arrays FXC is slow on. Measured here before the
      // editor's own program changes.
      { name: "…with the mask settings in a texture", src: texed.src,
        changed: `${texed.sites} reads of the fifteen mask arrays moved into one texture, read through ${MASK_TEX_SAMPLER}`, ok: texed.ok, prep: bindZeroMaskTexture },
      // THE PER-MASK-COUNT BUILD (decision 071): the mask loops kept, run to a
      // count the compiler can see. A count of 8 may unroll into a long build.
      // Each row has a context of its own, given back after it, so a loss here
      // does not silence the rows after it; a device whose graphics give up
      // altogether can still refuse every context after, and those rows then say
      // so. TWO, NOT ONE: at 1 the inner `j = i + 1` loops vanish as well, which is
      // part of what "taken out" measures, so the two could not be told apart.
      { name: "…with the mask loops counted to 2", src: two.src,
        changed: `${two.loops} mask loops given a count it can see, 2`, ok: two.loops > 0 && two.clean },
      { name: `…with the mask loops counted to ${MAX_MASKS}`, src: most.src,
        changed: `${most.loops} mask loops given a count it can see, ${MAX_MASKS}, the most a photograph holds`, ok: most.loops > 0 && most.clean },
      { name: AS_SHIPPED, src: FRAG, changed: "nothing changed", ok: true },
      { name: "…with every loop's count hidden from the compiler", src: hidden.src,
        changed: `${hidden.loops} loops given a count it cannot see`, ok: hidden.loops > 0 },
      { name: "…with the mask loops taken out", src: dropped.src,
        changed: `${dropped.loops} mask loops run zero times`, ok: dropped.loops > 0 },
      { name: "…with both", src: both.src,
        changed: `${hidden.loops} counts hidden and ${both.loops} mask loops taken out`, ok: hidden.loops > 0 && both.loops > 0 },
      { name: "…with the mask settings in uniform blocks", src: blocks.src,
        changed: `${blocks.sites} reads of the fifteen mask arrays moved into three blocks`, ok: blocks.ok, prep: bindZeroBlocks },
    ];
    const stamp = 1000 + Math.floor(Math.random() * 8e8);
    const timed: { name: string; t: number }[] = [];
    for (let i = 0; i < variants.length; i++) {
      const v = variants[i];
      if (!v.ok) {
        row(v.name, "not run",
          "The picture code has changed shape since this test was written, so this rewrite no longer finds what it changes. Timing it would time a program that is not what this row says.",
          undefined, "Build: not attempted, so nothing was compiled or linked for this row; no graphics context was made for it.");
        continue;
      }
      const units = samplerUnits(v.src);
      if (units > maxUnits) {
        row(v.name, "does not fit",
          `This copy of the picture code reads ${units} textures and this device gives a picture program ${maxUnits}, so it was not built: any device with that limit refuses it, which says nothing about this one. The test needs rewriting to fit, not the device; the editor's own program reads ${samplerUnits(FRAG)}.`,
          undefined, "Build: not attempted, so nothing was compiled or linked for this row; no graphics context was made for it.");
        continue;
      }
      // THIS ROW'S OWN CONTEXT, made for it and given up after it, so nothing
      // that happens to it reaches the next row.
      const c = rowContext();
      if (typeof c === "string") {
        row(v.name, "not run", c, undefined, "Build: not attempted, so nothing was compiled or linked for this row; the graphics context it needed could not be made or started, as the reason above says.");
        await tick();
        continue;
      }
      // A ROW THAT DID NOT BUILD, OR WHOSE CONTEXT WAS LOST, IS BUILT ONCE MORE
      // ON ITS OWN, with a tag no earlier build used, so no stored copy answers
      // it either. A row whose draw raised a GL error is not.
      //
      // THE ROW'S OWN CONTEXT IS GIVEN BACK BEFORE THAT SECOND BUILD, so the fresh
      // one is not the second of two the page holds at once; its state is read
      // first (`state`, below), since a context this page has just released would
      // otherwise read as lost.
      const again = () => {
        c.done();
        return freshBuild(v.src, stamp + 100 + i, v.prep);
      };
      try {
        const r = timedBuild(c.gl, VERT, uniqueFrag(v.src, stamp + i), v.prep);
        // A loss the browser reports arrives from a queued task.
        await tick();
        const state = c.state();
        // A FIRST PICTURE THAT RAISED AN ERROR DID NOT DRAW: its time is the
        // build alone, and the row says so rather than passing it for a picture.
        // A CONTEXT LOST IN THIS ROW may be the device giving up on the program
        // rather than the program failing, the case the last rows are placed
        // for, and the build in a fresh context says which. Asked of the
        // context itself, not only when the draw raised an error: a loss after
        // the error was read, or one the clearing read absorbed, would
        // otherwise be timed as a picture.
        if (c.lost()) {
          row(v.name, "did not draw (context lost)",
            `Built once, from nothing, in a context of its own: ${v.changed}. That context was lost before the first picture; the rows after it each have their own. ${again()}`,
            `${ms(r.link)} to build; no picture drawn`,
            buildLine(r.status, state, "picture", r.err));
        } else if (r.err) {
          row(v.name, `did not draw (GL error ${r.err})`,
            `Built once, from nothing, in a context of its own: ${v.changed}. The first picture raised GL error ${r.err}, so it was not drawn and this is not compared.`,
            `${ms(r.link)} to build; no picture drawn`,
            buildLine(r.status, state, "picture", r.err));
        } else {
          timed.push({ name: v.name, t: tot(r) });
          row(v.name, ms(tot(r)), `Built once, from nothing, in a context of its own: ${v.changed}.`, `${ms(r.link)} + ${ms(r.draw)} (built + first picture)`,
            buildLine(r.status, state, "picture", r.err));
        }
      } catch (err) {
        await tick();
        const state = c.state();
        // THE STATUS OF EVERY STEP, from the error itself: a build that threw
        // for any other reason has none, and the line says no status was read.
        const status = err instanceof BuildError ? err.status : null;
        if (c.lost()) {
          row(v.name, "did not build (context lost)",
            `This row's own graphics context was lost while it was being built, with ${v.changed}: ${(err as Error).message}. The rows after it each have their own. ${again()}`,
            undefined, buildLine(status, state, "failed", 0, true));
        } else {
          row(v.name, "did not build", `${(err as Error).message}, with ${v.changed}. ${again()}`,
            undefined, buildLine(status, state, "failed", 0, true));
        }
      } finally {
        // The number (or the reason there is none) is written; the context goes
        // back to the browser, and its canvas with it, before the next row asks.
        c.done();
      }
      await tick();
    }
    p.remove();
    const shipped = timed.find((t) => t.name === AS_SHIPPED);
    const rest = timed.filter((t) => t !== shipped);
    if (shipped && rest.length) {
      const best = rest.reduce((a, b) => (b.t < a.t ? b : a));
      row("What saved the most", `${best.name.replace(/^…with /, "")}: ${ms(shipped.t - best.t)} of ${ms(shipped.t)}`,
        "The variant that builds fastest names what the compiler spends its time on. The editor's own program is unchanged; this only timed copies of it.");
    }
  } catch (err) {
    p.remove();
    row("What makes the build slow", "failed", (err as Error).message);
  }
}

/** Decoding a real raw file, on the main thread and in the worker. */
/** THREE OF EACH, MEDIAN REPORTED, AND THE SPREAD PRINTED. A single shot read
 *  50, 60 and 191 ms across three runs of the same build on one device — a 3.8x
 *  spread, which makes a lone number worse than useless because it invites a
 *  conclusion the measurement cannot support. Decode is the noisy one here:
 *  readback and storage barely moved across the same three runs. */
async function decoding(): Promise<void> {
  const p = note("Decoding a practice photo…");
  const REPS = 3;
  const mid = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2; };
  try {
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = { name: "test.dng", kind: sniff(bytes), bytes, looksTranscoded: false };
    const here: number[] = [], there: number[] = [];
    let img = await decode({ ...file, bytes: bytes.slice() }); // warm-up, not timed
    let offThread: Awaited<ReturnType<typeof decodeOffThread>> | null = null;
    for (let i = 0; i < REPS; i++) {
      const a = performance.now();
      img = await decode({ ...file, bytes: bytes.slice() });
      const b = performance.now();
      offThread = await decodeOffThread({ ...file, bytes: bytes.slice() });
      here.push(b - a);
      there.push(performance.now() - b);
    }
    // THE SAME PICTURE, ASSERTED ON THE DEVICE. The background decoder runs the
    // same code, and "runs the same code" is exactly the kind of claim that is
    // true until somebody changes one of them. Now several decodes run at once,
    // so it is also the claim that concurrency changed nothing.
    // THE BYTES, NOT THE VALUES, and the difference is the whole check. The
    // first version hashed `a[i] & 255` over the decoded array — which for a
    // Float32Array of linear values in [0,1] coerces almost every element to 0
    // before masking, so it hashed a few million zeros and agreed with itself
    // no matter what. A planted one-pixel change (+0.001) passed it. Hashing
    // the underlying bytes catches any bit that moves.
    const fnv = (a: ArrayBufferView | undefined): string => {
      if (!a) return "none";
      const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      let h = 0x811c9dc5;
      for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16);
    };
    const mine = fnv(img.linear ?? img.pixels), theirs = fnv(offThread?.linear ?? offThread?.pixels);
    const lanes = decodeLanes();
    row("Decoders running at once", lanes ? String(lanes) : "none — decoding happens on the main thread here",
      lanes > 1
        ? "Opening a set decodes this many photographs at a time instead of one after another. Each one holds its file and its decode while it works, which is why it is not simply the number of cores."
        : lanes === 1
          ? "This device decodes one photograph at a time in the background — it has too few cores to spare more."
          : "Background threads are unavailable, so the decode happens on the main thread and the editor cannot answer while it runs.");
    row("The background decode matches", mine === theirs ? `yes (${mine})` : `NO — ${mine} against ${theirs}`,
      mine === theirs
        ? "The same photograph comes back whether it is decoded here or on another thread, checked pixel by pixel on this device."
        : "THEY DIFFER, which should be impossible — the same decoder runs in both places. Worth reporting.");
    p.remove();
    const mh = mid(here), mt = mid(there);
    const spread = (xs: number[]) => xs.map((x) => Math.round(x) + " ms").join(", ");
    row("Decoding a raw photo", ms(mh), `A ${(img.width * img.height / 1e6).toFixed(1)} megapixel practice file, decoded on the main thread — the work that used to freeze the editor while a set loaded.`, spread(here));
    row("…in the background", ms(mt), mt > mh * 1.6
      ? "Slower than doing it directly, which can happen when the copy across costs more than it saves. The point is that the editor stays responsive, not that it finishes sooner."
      : mh > mt * 1.6
        ? "FASTER than doing it directly here, which means the main thread was busy with something else while this ran — the background copy is not what made the difference."
        : "About the same as doing it directly, and it leaves the editor free while it runs.", spread(there));
  } catch (e) {
    p.remove();
    row("Decoding a raw photo", "not run", `The practice photo could not be loaded (${(e as Error).message}).`);
  }
}

/** Writing to on-device storage, which is most of what opening a set costs.
 *  Its own database, deleted afterwards — the real session is never touched.
 *
 *  MEASURED THE WAY THE APP ACTUALLY WRITES, which the first version did not.
 *  session.ts commits ONE strict-durability transaction PER PHOTO, chunked at
 *  30KB. The first version wrote 8 MB in a SINGLE strict transaction and
 *  reported throughput — which amortises one commit over the whole 8 MB and so
 *  measures bandwidth, not the thing set-open pays. It read 54 MB per second on
 *  a Linux CI container and 157 on an iPad, and both numbers predicted a
 *  forty-photo set in well under a minute when the instrumented reality was
 *  ~300-450 ms of commit wait PER PHOTO.
 *
 *  AND THE SECOND VERSION HAD THE SAME DISEASE ONE LEVEL DOWN. Per-photo strict
 *  commits read 252 ms on the container and 18 ms on the iPad — a per-commit
 *  figure BEATING that device's own amortised one, which cannot happen if the
 *  commit is really waiting on the disk. So the flag is not taken on trust:
 *  every run now writes the same photo BOTH ways, strict and relaxed, and
 *  prints both. If an engine returns the same time for both, it is not
 *  distinguishing them, and the number is a write-cache figure rather than a
 *  durability one — which is the fact worth carrying, since the whole reason
 *  session.ts asks for strict is that a set must survive a crash. */
async function storage(): Promise<void> {
  const p = note("Storage…");
  const DB = "ips-speedtest";
  const CHUNK = 30 * 1024, PHOTO = 6 * 1024 * 1024, RUNS = 3;
  const mid = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2; };
  try {
    const db = await new Promise<IDBDatabase>((res, rej) => {
      const rq = indexedDB.open(DB, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("c", { keyPath: ["p", "i"] });
      rq.onsuccess = () => res(rq.result); rq.onerror = () => rej(rq.error);
    });
    const blob = new Uint8Array(CHUNK);
    // EMPTY THE STORE BEFORE EVERY TIMED COMMIT, and do not time the emptying.
    // Without this each run writes into a bigger database and the times climb
    // monotonically — measured at 88, 273, 423, 611 ms across four runs, which
    // is the store growing, not the device. It also poisoned the comparison
    // below: interleaved, the second mode always ran on a larger store than the
    // first, and "unconfirmed" duly came out SLOWER than "confirmed", which
    // cannot happen if the flag means anything.
    const clear = () => new Promise<void>((res, rej) => {
      const t = db.transaction("c", "readwrite");
      t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      t.objectStore("c").clear();
    });
    const commit = (mode: "strict" | "relaxed") =>
      new Promise<number>((res, rej) => {
        const t0 = performance.now();
        const t = db.transaction("c", "readwrite", { durability: mode } as IDBTransactionOptions);
        t.oncomplete = () => res(performance.now() - t0); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
        const st = t.objectStore("c");
        for (let i = 0, n = 0; i < PHOTO; i += CHUNK, n++) st.add({ p: 0, i: n, b: blob.slice().buffer });
      });
    const strict: number[] = [], relaxed: number[] = [];
    // Order alternates run to run, so a device that gets warmer or busier part
    // way through cannot land that drift on one mode and be read as the flag.
    for (let run = 0; run < RUNS; run++) {
      const order: ("strict" | "relaxed")[] = run % 2 ? ["relaxed", "strict"] : ["strict", "relaxed"];
      for (const mode of order) {
        await clear();
        const dt = await commit(mode);
        (mode === "strict" ? strict : relaxed).push(dt);
      }
    }
    db.close();
    await new Promise<void>((res) => { const r = indexedDB.deleteDatabase(DB); r.onsuccess = () => res(); r.onerror = () => res(); r.onblocked = () => res(); });
    p.remove();
    // Medians, not means: the first commit on a fresh database carries setup
    // the later ones do not, and one outlier should not set the estimate.
    const ms = mid(strict), mr = mid(relaxed);
    const mbps = (PHOTO / 1024 / 1024) / (ms / 1000);
    // "Same" needs a threshold, and 25% is well outside the run-to-run spread
    // seen on both engines while being far under the gap a real disk sync makes.
    // TWO WAYS FOR THE FLAG TO MEAN NOTHING, and the first version only knew
    // one. "Within 25%" catches an engine that returns the same time for both.
    // The other is the confirmed write coming back FASTER than the unconfirmed
    // one, which is not a small durability cost — it is not a durability
    // measurement at all, since waiting for a disk cannot be quicker than not
    // waiting. The first real report from a device read 77 ms confirmed against
    // 111 ms unconfirmed, and the line under it said the browser "really is
    // waiting for the device". It is noise, and it has to read as noise.
    const same = ms <= mr || Math.abs(ms - mr) <= Math.max(ms, mr) * 0.25;
    const verdict = same
      ? `This browser does not take longer when the app asks for the write to be CONFIRMED on the disk (${Math.round(ms)} ms against ${Math.round(mr)} ms without), which means it is not treating the two differently. So this is how fast it accepts the data, not how fast the data is safely on the device — and the app asks for confirmed writes precisely so a set survives a crash. Fast here is good news for the wait and says nothing about the crash.`
      : `Asking for the write to be CONFIRMED on the disk costs ${Math.round(ms)} ms against ${Math.round(mr)} ms without — so this browser really is waiting for the device, and the number above is the honest one.`;
    row("Saving one photo", `${Math.round(ms)} ms for 6 MB`,
      `This is what opening a set pays: the app commits each photo on its own and waits for the device. At this rate a 25 MB raw file takes about ${(ms * 25 / 6 / 1000).toFixed(1)} s and forty of them roughly ${((ms * 25 / 6 / 1000) * 40 / 60).toFixed(1)} minutes — less in practice, since the next photo is read and decoded while one write is in flight. ${verdict} That works out at ${mbps.toFixed(0)} MB per second.`,
      `confirmed ${strict.map((x) => Math.round(x) + " ms").join(", ")} · unconfirmed ${relaxed.map((x) => Math.round(x) + " ms").join(", ")}`);
  } catch (e) {
    p.remove();
    row("Saving one photo", "not run", `Storage refused the test (${(e as Error).message}).`);
  }
}

/** READING ONE PHOTO BACK OUT OF A BIG SESSION.
 *
 *  A session stores every photograph as 30 KB rows keyed [photo, index], and
 *  opening one reads its rows back with a single key-range query. A 170-photo
 *  set therefore asks for about 850 rows out of roughly 145,000. Whether that
 *  costs the same as asking for 850 rows out of 850 is a question about the
 *  ENGINE'S INDEX, and nothing in the app could answer it: the report can say
 *  how long a read took on the device, but not whether the number would have
 *  been smaller in an emptier store.
 *
 *  SO THE ROWS HERE ARE TINY — 64 bytes, not 30 KB. Writing a real 4 GB session
 *  is not something to do to somebody's device, and it would measure the wrong
 *  thing anyway: moving the bytes is already known to cost what it costs, and
 *  the open question is what it costs to FIND them. Tiny rows leave the index
 *  behaviour and nothing else.
 *
 *  Its own button, because building the store takes a while and the ordinary
 *  run should stay quick. Everything it makes is deleted before it returns. */
async function readingFromABigStore(): Promise<void> {
  const BIG = "ips-speedtest-bigread", SMALL = "ips-speedtest-oneread";
  const PHOTOS = 170, PER = 850, BATCH = 5000, RUNS = 3;
  const ROW = new Uint8Array(64);
  const mid = (xs: number[]) => { const v = [...xs].sort((a, b) => a - b); return (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2; };
  const p = note("Reading from a big session… building the store first.");
  const made: string[] = [];
  const openDb = (name: string) =>
    new Promise<IDBDatabase>((res, rej) => {
      const rq = indexedDB.open(name, 1);
      rq.onupgradeneeded = () => rq.result.createObjectStore("c", { keyPath: ["p", "i"] });
      rq.onsuccess = () => { made.push(name); res(rq.result); };
      rq.onerror = () => rej(rq.error);
    });
  const fill = (db: IDBDatabase, photos: number, onProgress?: (done: number, total: number) => void) =>
    new Promise<void>(async (res, rej) => {
      const total = photos * PER;
      let written = 0;
      try {
        while (written < total) {
          const upto = Math.min(total, written + BATCH);
          await new Promise<void>((ok, no) => {
            const t = db.transaction("c", "readwrite");
            t.oncomplete = () => ok(); t.onerror = () => no(t.error); t.onabort = () => no(t.error);
            const st = t.objectStore("c");
            for (let n = written; n < upto; n++) st.add({ p: Math.floor(n / PER), i: n % PER, b: ROW.slice().buffer });
          });
          written = upto;
          onProgress?.(written, total);
        }
        res();
      } catch (e) { rej(e as Error); }
    });
  const readOne = (db: IDBDatabase, photo: number) =>
    new Promise<number>((res, rej) => {
      const t0 = performance.now();
      const rq = db.transaction("c").objectStore("c").getAll(IDBKeyRange.bound([photo, 0], [photo, Infinity]));
      rq.onsuccess = () => {
        // ASSERT WHAT CAME BACK. A range that matched nothing returns instantly
        // and would read as the fastest result in the table.
        if ((rq.result as unknown[]).length !== PER) { rej(new Error(`read ${(rq.result as unknown[]).length} rows, expected ${PER}`)); return; }
        res(performance.now() - t0);
      };
      rq.onerror = () => rej(rq.error);
    });
  const wipe = async () => {
    for (const name of made) {
      await new Promise<void>((res) => { const rq = indexedDB.deleteDatabase(name); rq.onsuccess = () => res(); rq.onerror = () => res(); rq.onblocked = () => res(); });
    }
  };
  // Held out here so the finally can CLOSE them before deleting: an open
  // connection blocks deleteDatabase, which then fires onblocked and leaves the
  // database sitting on the reader's device until the tab is closed. Measured —
  // the failure path left both of them behind.
  let bigDb: IDBDatabase | null = null;
  let smallDb: IDBDatabase | null = null;
  try {
    const big = await openDb(BIG);
    bigDb = big;
    await fill(big, PHOTOS, (done, total) => { p.textContent = `Reading from a big session… ${Math.round((done / total) * 100)}% built.`; });
    const small = await openDb(SMALL);
    smallDb = small;
    await fill(small, 1);
    p.textContent = "Reading from a big session… measuring.";
    const bigMs: number[] = [], smallMs: number[] = [];
    // Alternated, so a device that gets busier part way through does not hand
    // the whole of that to one side.
    for (let r = 0; r < RUNS; r++) {
      if (r % 2 === 0) { bigMs.push(await readOne(big, Math.floor(PHOTOS / 2))); smallMs.push(await readOne(small, 0)); }
      else { smallMs.push(await readOne(small, 0)); bigMs.push(await readOne(big, Math.floor(PHOTOS / 2))); }
      await tick();
    }
    const mb = mid(bigMs), msm = mid(smallMs);
    p.remove();
    const ratio = msm > 0 ? mb / msm : 1;
    const verdict = ratio >= 1.5
      ? `Finding them among ${(PHOTOS * PER).toLocaleString()} rows costs ${ratio.toFixed(1)}× what finding them in an empty store costs, so on this device a long session really does make every photo slower to open, before a single byte is decoded.`
      : `Finding them among ${(PHOTOS * PER).toLocaleString()} rows costs about the same as finding them in an empty store (${ratio.toFixed(2)}×), so on this device the size of the session is NOT what makes opening a photo slow. Look elsewhere.`;
    row("Finding one photo's pieces", `${mb.toFixed(1)} ms in a big session, ${msm.toFixed(1)} ms in an empty one`,
      `A session keeps each photograph as ~850 separate pieces and asks for them back in one query. ${verdict} The pieces here are 64 bytes rather than the real 30 KB on purpose: this is the cost of FINDING them, not of moving them.`,
      `big ${bigMs.map((x) => x.toFixed(1) + " ms").join(", ")} · empty ${smallMs.map((x) => x.toFixed(1) + " ms").join(", ")}`);
  } catch (e) {
    p.remove();
    row("Finding one photo's pieces", "not run", `Storage refused the test (${(e as Error).message}).`);
  } finally {
    try { bigDb?.close(); } catch { /* already gone */ }
    try { smallDb?.close(); } catch { /* already gone */ }
    await wipe(); // never leave a test database on somebody's device
  }
}

/** COULD THE EXPORT RUN ON THE GRAPHICS CHIP INSTEAD? Asked here because it
 *  cannot be asked anywhere else.
 *
 *  The editor's live view already runs the whole edit as shaders — noise
 *  reduction, sharpen, texture, clarity, dehaze, halation, grain, vignette, the
 *  hot-spot and lens corrections, the LUT and the perspective warp. The export
 *  re-implements every one of them on the processor, and both files carry
 *  comments asking whoever edits one to keep the numbers in step with the other
 *  by hand. Drawing the export instead would be faster and would end that
 *  duplication — but only if this device can hold a whole photograph in one
 *  texture, draw to it off the main thread, and read it back without the
 *  readback costing more than the drawing saved.
 *
 *  A desktop container answers none of that: it has a software rasteriser, so
 *  every number it gives is a measurement of software pretending to be a
 *  graphics chip. */
async function exportOnTheGpu(): Promise<void> {
  const p = note("Asking what this device's graphics chip could do with an export…");
  // A real frame from the camera this app is built around.
  const FW = 5600, FH = 3728;
  const cv = document.createElement("canvas");
  cv.width = 64; cv.height = 64;
  const gl = cv.getContext("webgl2");
  if (!gl) { p.remove(); row("An export on the graphics chip", "WebGL2 unavailable", "Not possible on this device."); return; }
  const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
  const floatOk = !!gl.getExtension("EXT_color_buffer_float");
  row("Largest texture", `${maxTex} px`, maxTex >= FW
    ? `A whole ${FW}x${FH} frame fits in one texture here, so an export could be drawn in a single pass.`
    : `A ${FW}x${FH} frame does NOT fit — an export would have to be drawn in ${Math.ceil(FW / maxTex) * Math.ceil(FH / maxTex)} pieces and joined, which is ordinary but is work.`);
  row("16-bit and float drawing", floatOk ? "available" : "not available", floatOk
    ? "The print-master (TIFF) path could be drawn as well as the JPEG one, and intermediate steps keep their precision."
    : "Drawing could still produce a JPEG, but a 16-bit print master would have to stay on the processor.");

  // THE MEASUREMENT THAT DECIDES IT: draw a frame-sized target with arithmetic
  // in every pixel, then read every pixel back, which is what an export must do
  // and what a live preview never does.
  const W = Math.min(FW, maxTex), H = Math.min(FH, maxTex);
  try {
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, W, H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    const fb = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error("a frame-sized drawing target was refused");
    gl.viewport(0, 0, W, H);
    const vs = `#version 300 es
      void main(){ vec2 q[3] = vec2[3](vec2(-1.,-1.),vec2(3.,-1.),vec2(-1.,3.)); gl_Position = vec4(q[gl_VertexID],0.,1.); }`;
    // Twenty-five weighted taps with an exponential in each is what the noise
    // reduction does per pixel, and it is 60% of an export. Standing in for it
    // rather than for an empty draw is the whole point.
    const fs = `#version 300 es
      precision highp float; out vec4 o;
      void main(){ vec3 c = vec3(0.); float w = 0.;
        for (int i=-2;i<=2;i++) for (int j=-2;j<=2;j++) {
          float d = float(i*i + j*j);
          float k = exp(-d * 0.35);
          c += k * vec3(fract(sin((gl_FragCoord.x+float(i))*12.9898 + (gl_FragCoord.y+float(j))*78.233) * 43758.5453));
          w += k; }
        o = vec4(c / w, 1.); }`;
    const mk = (t: number, src: string) => { const sh = gl.createShader(t)!; gl.shaderSource(sh, src); gl.compileShader(sh); return sh; };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, mk(gl.VERTEX_SHADER, vs));
    gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error("the test shader would not link");
    gl.useProgram(prog);
    gl.drawArrays(gl.TRIANGLES, 0, 3); // warm-up, not timed
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    await tick();

    const t0 = performance.now();
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.finish();
    const t1 = performance.now();
    // Read back in bands, the way an export would, so a device that cannot
    // allocate one 84 MB buffer still answers.
    const BANDS = 4;
    const bandH = Math.ceil(H / BANDS);
    const buf = new Uint8Array(W * bandH * 4);
    for (let b = 0; b < BANDS; b++) {
      const y = b * bandH, h = Math.min(bandH, H - y);
      if (h > 0) gl.readPixels(0, y, W, h, gl.RGBA, gl.UNSIGNED_BYTE, buf);
    }
    const t2 = performance.now();
    gl.deleteProgram(prog);
    gl.deleteFramebuffer(fb);
    gl.deleteTexture(tex);
    p.remove();
    const draw = t1 - t0, read = t2 - t1;
    row("Drawing a whole photograph", ms(draw),
      `${(W * H / 1e6).toFixed(1)} megapixels with twenty-five weighted taps in every pixel — the shape of the work the noise reduction does, which is about 60% of an export.`);
    row("Reading it back", ms(read),
      `An export has to bring every pixel back to be written into a file; the live view never does. Drawing and reading together: ${ms(draw + read)}.`);
    row("What that would mean", `about ${((draw + read) / 1000).toFixed(1)} s`,
      `Against the ${(W * H / 1e6).toFixed(1)}-megapixel export this app measures on its own processor path. If this number is seconds rather than tens of seconds, moving the export onto the graphics chip is worth building — and it would also end the two hand-kept copies of the edit. If it is not, the processor path stays and this answered it.`);
  } catch (err) {
    p.remove();
    row("An export on the graphics chip", "refused", `This device would not do it: ${String((err as Error)?.message ?? err)}. That is an answer, not a failure — it means the export stays on the processor here.`);
  }

  // AND OFF THE MAIN THREAD? A full-resolution draw on the main thread freezes
  // the editor for its duration, which is what the threaded export was built to
  // stop doing.
  const wp = note("Asking whether a background thread can draw…");
  try {
    const w = new Worker(new URL("./glprobe.worker.ts", import.meta.url), { type: "module" });
    const res = await new Promise<{ ok: boolean; maxTexture: number; float: boolean; note: string }>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("no answer in ten seconds")), 10000);
      w.onmessage = (e) => { clearTimeout(timer); resolve(e.data); };
      w.onerror = () => { clearTimeout(timer); reject(new Error("the background thread would not start")); };
      w.postMessage({});
    }).finally(() => w.terminate());
    wp.remove();
    row("Drawing in the background", res.ok ? "available" : "not available",
      res.ok
        ? `${res.note} — largest texture there ${res.maxTexture} px${res.float ? ", float drawing too" : ""}. An export could be drawn without the editor freezing.`
        : `${res.note}. A drawn export would have to happen on the main thread here, which would freeze the editor while it ran.`);
  } catch (err) {
    wp.remove();
    row("Drawing in the background", "not available", `${String((err as Error)?.message ?? err)}. A drawn export would freeze the editor on this device.`);
  }
}

/** HOW MANY THREADS THIS DEVICE GIVES THE EXPORT, and what it decided. The
 *  export splits a photograph across cores and then removes threads until the
 *  memory they would need fits a budget — a tablet kills the tab rather than
 *  swapping. Which of those two decided the answer is invisible from outside,
 *  and it is the first thing to know when an export is slower here than the
 *  numbers say. */
function threads(): void {
  const cores = navigator.hardwareConcurrency || 0;
  // The file the numbers in the release notes were measured on.
  // `healBytes: 0` is a property of the FILE being modelled, not a default: both
  // of these stand for a photograph with nothing healed on it, which is what the
  // numbers in the release notes were measured on. A frame with spots costs its
  // patches on top, per thread, and would come out with fewer.
  // `source: "mosaic"` likewise: both are NEFs, whose workers each hold one
  // 16-bit photosite a pixel (exportparallel.ts sourceBytesPerPixel).
  const job = { fileBytes: 26.1e6, srcPixels: 5600 * 3728, outPixels: 5600 * 3728, healBytes: 0, source: "mosaic" as const };
  const n = workerCount(job);
  const big = workerCount({ fileBytes: 55e6, srcPixels: 8256 * 5504, outPixels: 8256 * 5504, healBytes: 0, source: "mosaic" });
  row("Cores this browser admits to", cores ? String(cores) : "not reported",
    cores ? "The export keeps one for the interface and splits the rest of the work." : "Without a number the export assumes two.");
  row("Threads a 21-megapixel export would use", n === 1 ? "one — it would not split" : String(n),
    n === 1
      ? "Either this browser has no background threads, or the memory each would need does not fit the budget. The export runs as it always did."
      : `Each one holds its own copy of the file and its own decode of it. A 45-megapixel raw would get ${big === 1 ? "none — it would not split" : big}.`);
}

/** WHAT THE REPORT'S HOLD WATCH COSTS, MEASURED ON THIS DEVICE (decision 071).
 *  The "Holds" line of the report is kept by a timer that looks every 100 ms for
 *  as long as a page is open (startup.ts). It costs nothing between its looks,
 *  and a look is two clock reads, a comparison and a timer set, but a figure for
 *  that is the device's to give, not a container's: this times the real look many
 *  times over, three runs, and prints the median with every run.
 *  Takes nothing; adds one row. The page is held for the length of the three runs
 *  (tens of milliseconds), which the watch itself records under its own name. */
function theHoldWatch(): void {
  const per = measureHoldWatch();
  const mid = [...per].sort((a, b) => a - b)[(per.length - 1) >> 1];
  const msEachSecond = (mid * 10) / 1000;
  row("The hold watch's own cost", `${mid.toFixed(2)} µs a look`,
    `The report's Holds line is kept by a timer that looks every 100 ms. At ten looks a second that is ${msEachSecond.toFixed(3)} ms of every second (${(msEachSecond / 10).toFixed(4)} percent of the page's time), spent between the page's own work and never during it. This page's own count of its looks so far: ${holdWatchLine()}.`,
    per.map((x) => `${x.toFixed(2)} µs`).join(", "));
}

/** WHAT ONE TILE IN THE STRIP COSTS, on this device.
 *
 *  The strip and the quick look grid render every tile by walking its pixels on
 *  the main thread, so forty photographs are forty of these, one after another,
 *  with nothing else able to happen in between. How much that actually costs is
 *  the question, and a test container cannot answer it: profiling a set open
 *  there put most of the time in the graphics driver rather than in this
 *  arithmetic, because a container draws through software pretending to be a
 *  graphics chip.
 *
 *  This times THE SAME arithmetic the tile does — the app's own compiled edit,
 *  over the app's own linear read, into the same canvas and the same JPEG — at
 *  the size the strip actually asks for. It does not include working out the
 *  automatic depth lift, which happens once per tile as well, so the real figure
 *  is a little higher than this one. */
async function buildingATile(): Promise<void> {
  const p = note("Building a tile the way the strip does…");
  try {
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const img = await decodeOffThread({ name: "test.dng", kind: sniff(bytes), bytes, looksTranscoded: false });
    const MAX = 260;
    const s = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s));
    const params: EditParams = {
      wb: [1, 1, 1], exposure: 1, recover: 0, swapRB: true, hue: 0, sat: 1, contrast: 1, denoise: 0,
      tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1],
      tone: [...TONE_DEFAULT], toneR: [...TONE_DEFAULT], toneG: [...TONE_DEFAULT], toneB: [...TONE_DEFAULT],
      lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false, forceBalance: false,
      hsFix: 1, hsBypass: false, vignette: 0, clarity: 0, dehaze: 0, sharpen: 0, texture: 0,
      hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], grade: [...GRADE_DEFAULT], grainAmt: 0, grainSize: 1.5,
      vigAmt: 0, vigMid: 0.5, mix3: [...MIX3_DEFAULT], spots: [], crop: { ...CROP_DEFAULT }, straighten: 0,
    };
    const REPS = 3;
    const mid = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2; };
    const runs: number[] = [];
    for (let r = 0; r < REPS; r++) {
      const t0 = performance.now();
      const edit = compileEdit(params, img.camMatrix, img.width / img.height, undefined, null);
      const px = new Float32Array(3);
      const out = new Uint8ClampedArray(w * h * 4);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const sx = Math.min(img.width - 1, Math.floor(x / s));
          const sy = Math.min(img.height - 1, Math.floor(y / s));
          const [rr, gg, bb] = linearAt(img, sx, sy);
          edit(rr, gg, bb, px, 0, undefined, undefined);
          const i = (y * w + x) * 4;
          out[i] = 255 * Math.min(1, Math.max(0, px[0]));
          out[i + 1] = 255 * Math.min(1, Math.max(0, px[1]));
          out[i + 2] = 255 * Math.min(1, Math.max(0, px[2]));
          out[i + 3] = 255;
        }
      }
      const cv = document.createElement("canvas");
      cv.width = w; cv.height = h;
      cv.getContext("2d")!.putImageData(new ImageData(out, w, h), 0, 0);
      await new Promise<void>((done) => cv.toBlob(() => done(), "image/jpeg", 0.72));
      runs.push(performance.now() - t0);
      await tick();
    }
    p.remove();
    const m = mid(runs);
    row("Building one tile", ms(m),
      `A ${w}x${h} tile from a ${(img.width * img.height / 1e6).toFixed(1)}-megapixel photograph, with the app's own edit over every pixel of it — the work the strip does for each photo, on the main thread, with nothing else able to happen while it runs. Forty of them is about ${((m * 40) / 1000).toFixed(1)} s of that. The real tile also works out the automatic depth lift, so this is the floor rather than the figure.`,
      runs.map((x) => Math.round(x) + " ms").join(", "));
  } catch (e) {
    p.remove();
    row("Building one tile", "not run", `The practice photo could not be used (${(e as Error).message}).`);
  }
}

/** WHAT THE COLOUR-NOISE SLIDER COSTS, ON THIS DEVICE.
 *
 *  Asked because the stage was widened without being timed, and "forty-nine
 *  extra taps per pixel" is an arithmetic fact rather than an answer: what it
 *  costs depends on the cache behaviour of a real chip, and the container this
 *  was written in cannot stand in for a tablet.
 *
 *  It times the DENOISE STAGE ITSELF rather than a whole render, because that is
 *  the only part the widening touched — the same `makeRowDenoiser` an export
 *  wraps around its source, pulled over a fixed block of pixels at the same
 *  luminance strength, once with the colour half off and once with it at full.
 *  The ratio between the two is the thing to read; the absolute numbers scale
 *  with whatever else the device is doing.
 *
 *  Returns nothing and adds two rows. Consumed by the reader deciding whether to
 *  leave the slider above zero on a big export. */
async function whatColourNoiseCosts(): Promise<void> {
  const p = note("Timing the colour-noise stage…");
  try {
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const img = await decodeOffThread({ name: "test.dng", kind: sniff(bytes), bytes, looksTranscoded: false });
    // A block, not the whole frame: the point is cost per pixel and a 21-megapixel
    // pass on a tablet is not something a test page should ask for.
    const W = Math.min(640, img.width), H = Math.min(480, img.height);
    const px = W * H;
    const REPS = 3;
    const mid = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2; };
    const time = (chroma: number): number[] => {
      const runs: number[] = [];
      for (let r = 0; r < REPS; r++) {
        // A FRESH SAMPLER EACH RUN, because the row cache inside it is the thing
        // being measured as much as the arithmetic is.
        const d = makeRowDenoiser((x, y) => linearAt(img, x, y), img.width, img.height, 0.8, 1, chroma, 0);
        const t0 = performance.now();
        let sink = 0;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) sink += d(x, y)[0];
        runs.push(performance.now() - t0);
        if (sink === -1) throw new Error("unreachable"); // keep the loop from being optimised away
      }
      return runs;
    };
    const off = time(0);
    const on = time(1);
    const mo = mid(off), mn = mid(on);
    const per = (m: number) => `${(m / px * 1e6).toFixed(0)} ms per megapixel`;
    row("Denoise with colour noise OFF", ms(mo), `${per(mo)}, over a ${W}x${H} block of a ${(img.width * img.height / 1e6).toFixed(1)}-megapixel photograph. This is the 13x13 brightness filter alone, which is what every raw already pays.`,
      off.map((x) => Math.round(x) + " ms").join(", "));
    row("…and with it at full", ms(mn), `${per(mn)} — ${(mn / Math.max(mo, 0.001)).toFixed(1)}x the line above. The colour half samples a 7x7 grid spaced two apart to reach a mottle three to five pixels across, which is forty-nine taps on top of the twenty-five. A full-frame export of this photograph would be about ${((mn - mo) / px * img.width * img.height / 1000).toFixed(1)} s of extra work.`,
      on.map((x) => Math.round(x) + " ms").join(", "));
    p.remove();
  } catch (e) {
    p.remove();
    row("What colour noise costs", "not run", `The practice photo could not be used (${(e as Error).message}).`);
  }
}

/** DOES THIS DEVICE COMPUTE THE SAME EXPORT AS THAT ONE?
 *
 *  Asked because a claim was made without it. "The exported file is identical on
 *  every device" was stated as a property of today's app and never tested — and
 *  the standard explicitly allows `Math.exp`, `Math.pow` and the rest to be
 *  implementation-approximated, while the noise reduction calls exp 522 million
 *  times in one export. Two engines that round one of those differently produce
 *  different files, and nothing in the app would ever notice.
 *
 *  Two fingerprints. The first is the ENGINE's arithmetic, which costs
 *  milliseconds and is the root of it. The second is a real export of a bundled
 *  practice photograph through the app's own pipeline — the whole claim, end to
 *  end. Same photograph everywhere, so the numbers are comparable between
 *  devices: run this on two and compare. Nothing of the reader's is used or
 *  reported. */
async function sameEverywhere(): Promise<void> {
  const hex = (h: number) => (h >>> 0).toString(16).padStart(8, "0");
  // The transcendentals the pipeline actually leans on, over a fixed sweep.
  let h = 0x811c9dc5;
  const mix = (v: number) => {
    const b = new Uint8Array(new Float64Array([v]).buffer);
    for (let i = 0; i < 8; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193); }
  };
  for (let i = 0; i < 2000; i++) {
    const x = i / 97.3;
    mix(Math.exp(-x));        // the bilateral's range term
    mix(Math.pow(x % 1 || 0.5, 2.2)); // the gamma the 8-bit path uses
    mix(Math.log(1 + x));
    mix(Math.sin(x) * Math.cos(x / 3));
  }
  row("This device's arithmetic", hex(h),
    "A fingerprint of the maths the edit leans on — exponentials, gamma, logs — over a fixed sweep. Two devices that print the same number compute an export the same way. Two that do not cannot produce identical files, however carefully the app is written.");

  const p = note("Exporting a practice photograph to fingerprint it…");
  try {
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const img = await decodeOffThread({ name: "test.dng", kind: sniff(bytes), bytes: bytes.slice(), looksTranscoded: false });
    const params: EditParams = {
      wb: [1.6, 1, 0.7], exposure: 1.2, recover: 0, swapRB: true, hue: 0, sat: 1.1, contrast: 1.05, denoise: 0.47,
      tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1],
      tone: [...TONE_DEFAULT], toneR: [...TONE_DEFAULT], toneG: [...TONE_DEFAULT], toneB: [...TONE_DEFAULT],
      lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false, forceBalance: false,
      hsFix: 1, hsBypass: false, vignette: 0, clarity: 0, dehaze: 0, sharpen: 0.4, texture: 0,
      hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], grade: [...GRADE_DEFAULT], grainAmt: 0, grainSize: 1.5,
      vigAmt: 0, vigMid: 0.5, mix3: [...MIX3_DEFAULT], spots: [], crop: { ...CROP_DEFAULT }, straighten: 0,
    };
    // A CROP AT NATIVE SCALE, not a scaled-down whole frame. Asking for a
    // fraction of the size looks like the cheap way to do this and is not: a
    // scaled export box-filters, sampling round(1/scale) squared source pixels
    // for every output pixel, so asking for half a megapixel instead of one
    // MADE IT SLOWER — 15.5 seconds against 10.7, measured. Cropping asks for
    // fewer pixels and does the same work per pixel, which is what was wanted.
    const frac = Math.min(1, Math.sqrt(5e5 / (img.width * img.height)));
    params.crop = { x: (1 - frac) / 2, y: (1 - frac) / 2, w: frac, h: frac };
    const t0 = performance.now();
    const pfile = { name: "practice.dng", kind: sniff(bytes), bytes, looksTranscoded: false };
    const out = await exportImage(pfile, img, params, { format: "jpeg", scale: 1, quality: 0.92 });
    const buf = new Uint8Array(await out.blob.arrayBuffer());
    let f = 0x811c9dc5;
    for (let i = 0; i < buf.length; i++) { f ^= buf[i]; f = Math.imul(f, 0x01000193); }
    p.remove();
    // THE PIXELS AND THE DRAWN VERSION ARE FINGERPRINTED BY THE COMPARISON BELOW,
    // which already computes both frames from the same edit and the same crop.
    // Taking them here as well meant three full exports of the same photograph
    // on every run — eighteen seconds in a container, and a tablet pays that on
    // a page somebody is waiting in front of. One export here, the other two
    // reused.
    row("A practice photograph, exported", `${hex(f)} · ${(buf.length / 1024).toFixed(0)} KB · ${((performance.now() - t0) / 1000).toFixed(1)}s`,
      "The finished file. Measured across two engines it came back 44% different in SIZE at the same quality — their JPEG encoders are not the same encoder. So a file that is byte-identical everywhere was never something this app offered, whatever the pixels do.");
  } catch (e) {
    p.remove();
    row("A practice photograph, exported", "not run", `It could not be exported here (${(e as Error).message}).`);
  }
}

/** THE DRAWN EXPORT AGAINST THE COMPUTED ONE, on this device.
 *
 *  The whole case for drawing an export rests on the picture being the same
 *  picture. It cannot be the SAME BYTES — a graphics chip computes in float
 *  where the processor uses doubles — so the question is how far apart they are,
 *  and that is a number rather than an argument. Compared before either is
 *  encoded, so JPEG is not in the way.
 *
 *  Nothing of the reader's is used: the app's own bundled practice photograph,
 *  a fixed edit, a crop to keep it quick. */
async function drawnVersusComputed(): Promise<void> {
  const p = note("Drawing an export, and computing the same one, to compare…");
  try {
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = { name: "practice.dng", kind: sniff(bytes), bytes, looksTranscoded: false };
    const img = await decodeOffThread({ ...file, bytes: bytes.slice() });
    const params: EditParams = {
      wb: [1.6, 1, 0.7], exposure: 1.2, recover: 0, swapRB: true, hue: 0, sat: 1.1, contrast: 1.05, denoise: 0.47,
      tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1],
      tone: [...TONE_DEFAULT], toneR: [...TONE_DEFAULT], toneG: [...TONE_DEFAULT], toneB: [...TONE_DEFAULT],
      lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false, forceBalance: false,
      hsFix: 1, hsBypass: false, vignette: 0, clarity: 0, dehaze: 0, sharpen: 0.4, texture: 0,
      hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], grade: [...GRADE_DEFAULT], grainAmt: 0, grainSize: 1.5,
      vigAmt: 0, vigMid: 0.5, mix3: [...MIX3_DEFAULT], spots: [], crop: { ...CROP_DEFAULT }, straighten: 0,
    };
    const frac = Math.min(1, Math.sqrt(5e5 / (img.width * img.height)));
    params.crop = { x: (1 - frac) / 2, y: (1 - frac) / 2, w: frac, h: frac };
    if (!canDrawFrame(params)) throw new Error("this edit is outside what the drawn path covers yet");

    // TWICE, because the two answers mean different things. With the noise
    // reduction and sharpening ON, any difference is dominated by those two
    // neighbourhood operators — the only stages where the shader's texel grid
    // and the processor's pixel grid can disagree about WHERE to sample. With
    // both OFF, every other stage in the pipeline is being compared on its own:
    // white balance, the camera matrix, highlight recovery, the hot-spot and
    // lens corrections, tone, saturation, contrast, the channel mix. If that
    // second number is small, the port's remaining work is confined to two
    // functions rather than spread through the pipeline.
    const flat: EditParams = { ...params, denoise: 0, sharpen: 0, texture: 0 };
    const runs: { label: string; drawn: DrawnFrame; computed: { data?: Uint8ClampedArray; width: number; height?: number }; computedMs: number }[] = [];
    const pairs: [string, EditParams][] = [["with the noise reduction and sharpening on", params], ["with both of those off", flat]];
    for (const [label, pr] of pairs) {
      const drawn = await drawFrame(file, img, pr, null);
      await tick();
      const t0 = performance.now();
      const computed = await exportImage(file, img, pr, { format: "jpeg", scale: 1, quality: 0.92, raw: true });
      runs.push({ label, drawn, computed, computedMs: performance.now() - t0 });
      await tick();
    }
    p.remove();
    // THE TWO FINGERPRINTS, FROM THE PAIR ALREADY IN HAND. Three devices — two
    // engines, three platforms, an NVIDIA card and an Apple GPU — computed the
    // SAME pixels for this export (7afc9c2a on every one) while their own
    // arithmetic fingerprints differ. That is a real property: the photograph
    // this app makes does not depend on the machine, even though the FILE does,
    // because the browsers' JPEG encoders are not the same encoder.
    //
    // A drawn export puts that property in question, since each graphics chip
    // rounds its own way. So the drawn frame is fingerprinted too: matching
    // across devices means nothing is given up by moving to it, and differing
    // means this line is exactly what would be traded for the speed.
    const fp = (a: ArrayBufferView | undefined): string => {
      if (!a) return "none";
      const b8 = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
      let h = 0x811c9dc5;
      for (let i = 0; i < b8.length; i++) { h ^= b8[i]; h = Math.imul(h, 0x01000193); }
      return (h >>> 0).toString(16).padStart(8, "0");
    };
    const first = runs[0];
    row("A practice photograph, its pixels", first.computed.data ? `${fp(first.computed.data)} · ${(first.computed.data.length / 4 / 1e6).toFixed(2)} MP` : "not produced",
      "The export above, stopped before the browser encodes it. THIS is the honest test of whether two devices compute the same photograph — the file line is the browser's own JPEG encoder, and two devices can agree here while writing files of different sizes.");
    row("…and the same photograph drawn", `${fp(first.drawn.data)} · ${(first.drawn.data.length / 4 / 1e6).toFixed(2)} MP`,
      "The identical export drawn through the shaders instead. Compare this line BETWEEN devices: matching means a drawn export is as device-independent as the computed one and nothing is lost by moving to it; differing means the picture would depend on the graphics chip, which is what today's export does not do.");
    // AND THE SAME FRAME WITHOUT THE TWO NEIGHBOURHOOD OPERATORS, which is the
    // line that says WHERE any device-dependence lives.
    //
    // Two renderers with nothing in common — a software rasteriser and an NVIDIA
    // card through Direct3D — reported the operators-off comparison IDENTICALLY,
    // to the digit: average 0.21, worst 74, 450 pixels over 8 and 134 over 24 of
    // the same 1,999,882. Difference statistics that match that exactly are not
    // two renderers each rounding their own way; they are one systematic
    // difference between the shader and the processor code, reproduced exactly
    // on both. If this fingerprint also matches across graphics chips, then
    // everything that makes a drawn export device-dependent lives in the noise
    // reduction and the sharpening — and that is a fixable place rather than a
    // property of graphics hardware. If it differs, the plain pipeline varies
    // too and that hope is dead. Either way it costs nothing: the frame is
    // already in hand.
    const flatRun = runs[1];
    if (flatRun) row("…and drawn with those two turned off", `${fp(flatRun.drawn.data)}`,
      "The same photograph drawn again with the noise reduction and sharpening off, so only the colour half of the pipeline is in it. Compare BETWEEN devices like the line above: if this one matches everywhere while the line above does not, then a drawn export's dependence on the graphics chip lives entirely in those two operators, which is a small enough place to go and fix.");
    for (const r of runs) compareOne(r.label, r.drawn, r.computed, r.computedMs);
    return;

    void 0;
  } catch (e) {
    p.remove();
    row("A drawn export against a computed one", "not run", `${(e as Error).message}.`);
  }
}

function compareOne(label: string, drawn: DrawnFrame, computed: { data?: Uint8ClampedArray; width: number; height?: number }, computedMs: number): void {
  {
    const a = drawn.data, b = computed.data;
    if (!b || a.length !== b.length) {
      row(`Drawn against computed, ${label}`, "not comparable",
        `The two came out different sizes (${drawn.width}x${drawn.height} against ${computed.width}x${computed.height ?? "?"}), so there is nothing to compare yet.`);
      return;
    }
    // WHERE the differences are, not just how big. An average of one and a worst
    // of eighty are two different stories: noise spreads evenly, a sampling
    // offset sits on the EDGES, and bad edge handling sits on the BORDER. The
    // instrument has to be able to tell them apart or the next hour goes into
    // the wrong fix.
    const W = drawn.width, H = drawn.height;
    const lum = (arr: Uint8ClampedArray, i: number) => 0.2126 * arr[i] + 0.7152 * arr[i + 1] + 0.0722 * arr[i + 2];
    let worst = 0, sum = 0, n = 0, over2 = 0, sr = 0, sg = 0, sb = 0;
    // AND HOW MANY OF THEM ARE BIG ENOUGH TO SEE. "Average 0.6, worst 100" is
    // two facts that point opposite ways, and neither answers the only question
    // a reader has: would I notice? A single stray pixel at 100 is invisible in
    // a photograph; a fringe of 4,000 pixels at 24 along every hard edge is a
    // different product. Below about 8 of 255 nothing is visible in continuous
    // tone, and a quality-92 JPEG quantises most of it away besides; by 24 it is
    // visible on a flat area. So count both bands rather than reporting the
    // extreme and leaving the reader to guess how lonely it is.
    let over8 = 0, over24 = 0;
    let edgeOver = 0, edgePx = 0, gradAll = 0, gradBad = 0, badN = 0;
    const BORDER = 4;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        let px = 0;
        for (let k = 0; k < 3; k++) {
          const ad = Math.abs(a[i + k] - b[i + k]);
          if (ad > worst) worst = ad;
          if (ad > px) px = ad;
          sum += ad; n++;
        }
        sr += a[i] - b[i]; sg += a[i + 1] - b[i + 1]; sb += a[i + 2] - b[i + 2];
        const onBorder = x < BORDER || y < BORDER || x >= W - BORDER || y >= H - BORDER;
        if (onBorder) { edgePx++; if (px > 2) edgeOver++; }
        else if (px > 2) over2++;
        if (px > 8) over8++;
        if (px > 24) over24++;
        // Local contrast in the COMPUTED frame, which is the reference.
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          const g = Math.abs(lum(b, i + 4) - lum(b, i - 4)) + Math.abs(lum(b, i + W * 4) - lum(b, i - W * 4));
          gradAll += g;
          if (px > 2) { gradBad += g; badN++; }
        }
      }
    }
    const px = a.length / 4;
    const meanGrad = gradAll / Math.max(1, px), badGrad = gradBad / Math.max(1, badN);
    const d = drawn.ms;
    // THE BANDS GO IN THE VALUE, NOT THE EXPLANATION. "Copy the results" copies
    // each row's NAME AND VALUE and nothing else — so a number that lives only
    // in the paragraph beside it never leaves the device. These counts were
    // added specifically to be reported from real devices, and the first report
    // that came back did not contain them. Anything MEASURED belongs in the
    // value; the paragraph is for what it means.
    row(`Drawn against computed, ${label}`,
      `average ${(sum / n).toFixed(2)} of 255, worst ${worst} · ${over8} over 8, ${over24} over 24 of ${px} · edges ${(badGrad / Math.max(1e-6, meanGrad)).toFixed(1)}x`,
      `The same photograph, ${(px / 1e6).toFixed(2)} megapixels, compared before either is encoded. ` +
      `${((over2 / px) * 100).toFixed(1)}% of the interior differs by more than 2, against ${((edgeOver / Math.max(1, edgePx)) * 100).toFixed(1)}% of the four-pixel border. ` +
      `Where they differ, the local contrast averages ${badGrad.toFixed(1)} against ${meanGrad.toFixed(1)} over the whole frame — ${badGrad > meanGrad * 2 ? "so the disagreement sits on the EDGES, which is what a half-texel sampling offset looks like" : "so it is spread across the picture rather than sitting on edges"}. ` +
      `Colour shift: R ${(sr / px).toFixed(2)}, G ${(sg / px).toFixed(2)}, B ${(sb / px).toFixed(2)}. ` +
      `How much of it could be SEEN: ${over8} pixels differ by more than 8 of 255 (${((over8 / px) * 100).toFixed(3)}%) and ${over24} by more than 24 (${((over24 / px) * 100).toFixed(3)}%) — ` +
      `${over24 === 0 ? "so nothing in this frame reaches a level anyone could point at" : over24 < px / 10000 ? "a scattering, not a fringe" : "enough to look for along the edges"}. ` +
      `A drawn export can never be byte-identical — a graphics chip works in float where the processor works in doubles — so what matters is whether this is small enough to be invisible.`);
    row("…and what that pair took",
      `drawn ${ms(d.source + d.upload + d.draw + d.read + d.p3)} · computed ${ms(computedMs)}`,
      `The drawn one: ${ms(d.source)} reading and demosaicing the sensor data, ${ms(d.upload)} handing it to the graphics chip, ${ms(d.draw)} drawing, ${ms(d.read)} reading it back, ${ms(d.p3)} converting to the wide-gamut space the file is saved in. The demosaic is the part that does not go away, and it is the part that could be split across cores next.`);
  }
}

/** CAN THIS DEVICE HAVE A DRAWING SURFACE THE SIZE OF THE WHOLE PHOTOGRAPH?
 *
 *  This is the question that decides whether the live view can run at native
 *  resolution, and it had been answered by accident with the wrong measurement.
 *  The GPU probe above draws a 5600x3728 frame and reads it back in tens of
 *  milliseconds on every device tried — but it draws into a FRAMEBUFFER OBJECT
 *  with a texture attachment, and a render target that size being accepted says
 *  nothing about a CANVAS that size being accepted. They are different limits.
 *
 *  And the canvas one can fail QUIETLY: the WebGL spec answers an
 *  unsatisfiable size with a smaller drawing buffer and reports its true size
 *  in drawingBufferWidth/Height, with no error thrown. The editor can ask for
 *  the whole frame and compare (Renderer.bufferShort), falling back to its
 *  2800 px proxy only on a mismatch, but that full-size path is switched off
 *  (main.ts OPEN_8BIT_AT_FULL_SIZE), so an 8-bit source over 2800 px is shown
 *  from a 2800 px proxy whatever the browser would allow; before 2026-10-02 it
 *  was proxied on an assumed 16.7 MP cap. This probe asks for one, reads
 *  back what was actually allocated, and then DRAWS A KNOWN COLOUR AND READS
 *  IT — because a buffer that reports the size you asked for and paints black
 *  under memory pressure is the failure the size comparison cannot see. */
async function aCanvasTheSizeOfTheFrame(): Promise<void> {
  const FW = 5600, FH = 3728;
  // THE FIRST VERSION OF THIS ASKED ON AN EMPTY PAGE, AND THAT ANSWER COST A
  // REAL SESSION.
  //
  // It requested a full-frame canvas with nothing else allocated, got it on all
  // three devices, and that was written down as "your devices can do this". In
  // the editor the same request happens while the session already holds a couple
  // of hundred megabytes of photographs, the current one's texture, the previous
  // one's buffers and every other context the app keeps. The canvas allocation
  // failed there, silently, and the photograph went blank. The probe was not
  // wrong; what it was taken to mean was.
  //
  // So it asks the question the app actually faces: how much can already be held
  // before a full-frame drawing surface stops being available? A ladder, stopping
  // at the first refusal, releasing as it goes. The number that comes back is an
  // approximation — real memory is fragmented differently from one big ladder of
  // buffers — and it is enormously closer to the truth than a yes taken on an
  // empty page.
  const cv = document.createElement("canvas");
  cv.width = 1;
  cv.height = 1;
  const probe = cv.getContext("webgl2", { preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false });
  if (!probe) { row("A drawing surface the size of the frame", "WebGL2 unavailable", "This device has no WebGL2 at all, so nothing below applies."); return; }
  const lose = () => { try { probe.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* already gone */ } };

  const tryFullFrame = (): boolean => {
    try {
      cv.width = FW;
      cv.height = FH;
      if (probe.drawingBufferWidth !== FW || probe.drawingBufferHeight !== FH) return false;
      probe.viewport(0, 0, FW, FH);
      probe.clearColor(0.25, 0.5, 0.75, 1);
      probe.clear(probe.COLOR_BUFFER_BIT);
      probe.finish();
      const px = new Uint8Array(4);
      probe.readPixels(FW - 1, FH - 1, 1, 1, probe.RGBA, probe.UNSIGNED_BYTE, px);
      return Math.abs(px[0] - 64) <= 2 && Math.abs(px[1] - 128) <= 2 && Math.abs(px[2] - 191) <= 2;
    } catch { return false; }
  };

  // TOUCHED, not merely allocated: a buffer nobody writes to may cost nothing at
  // all until it is used, which would make the ladder measure a promise rather
  // than memory.
  const held: Uint8Array[] = [];
  // AND NO STEP IS ALLOWED TO BE ABSURD. Trying to prove the ceiling branch
  // fires, a step of 100,000 MB was planted — and the browser did not throw. It
  // sat there, for over ten minutes, neither succeeding nor failing. A request
  // far beyond what a machine has does not reliably fail fast; it can hang, and
  // a hang inside a diagnostic is worse than the question going unanswered. The
  // real steps are 100-200 MB and were never at risk, but the cap says so rather
  // than leaving it to whoever edits the array next.
  const MAX_STEP_MB = 512;
  const holdAnother = (mb: number): boolean => {
    if (mb > MAX_STEP_MB) return false;
    try {
      const b = new Uint8Array(mb * 1e6);
      for (let i = 0; i < b.length; i += 4096) b[i] = 1;
      held.push(b);
      return true;
    } catch { return false; }
  };

  // AND THE RUNG THAT ACTUALLY MATTERS: hold what the EDITOR holds.
  //
  // The ladder below stacks ArrayBuffers, which is system and JavaScript-heap
  // memory. What the editor had allocated when a real session broke was a 167 MB
  // RGBA16F texture and an 84 MB drawing buffer — GPU-side, and untouched by any
  // number of ArrayBuffers. The 8-core iPad duly reported "still available with
  // 1000 MB held" while being the device that had just failed. A probe that
  // loads the wrong side of the machine answers a real question that is not the
  // question asked.
  const textures: WebGLTexture[] = [];
  const holdAFrame = (): boolean => {
    try {
      const t = probe.createTexture();
      if (!t) return false;
      probe.bindTexture(probe.TEXTURE_2D, t);
      // The size the editor really holds: a whole frame, half-float, four
      // channels — about 167 MB for a 20.9-megapixel raw.
      probe.texImage2D(probe.TEXTURE_2D, 0, probe.RGBA16F, FW, FH, 0, probe.RGBA, probe.HALF_FLOAT, null);
      if (probe.getError() !== probe.NO_ERROR) { probe.deleteTexture(t); return false; }
      textures.push(t);
      return true;
    } catch { return false; }
  };

  let ceiling = -1, lastOk = 0;
  try {
    // 0 MB first — the old question, kept, because a device that refuses even
    // that needs to know before anything else is discussed.
    if (!tryFullFrame()) {
      row("A drawing surface the size of the frame", "refused even with nothing held",
        `Asked for a ${FW}x${FH} canvas — a whole frame from the camera this app is built around — on an otherwise empty page, and did not get it. A full-resolution editing view is not possible on this device by this route at all.`);
      return;
    }
    // Then the same request with more and more already held, which is the state
    // the editor is actually in.
    const STEPS = [100, 100, 100, 100, 100, 100, 200, 200];
    for (const mb of STEPS) {
      if (!holdAnother(mb)) { ceiling = lastOk; break; }
      lastOk += mb;
      cv.width = 1; cv.height = 1;           // release the previous surface first
      if (!tryFullFrame()) { ceiling = lastOk; break; }
    }
    // Then the same question with whole FRAMES held, which is the editor's own
    // shape of memory rather than a convenient one.
    let frames = 0;
    for (let i = 0; i < 6; i++) {
      if (!holdAFrame()) break;
      frames++;
      cv.width = 1; cv.height = 1;
      if (!tryFullFrame()) { frames = -frames; break; }   // negative: this one broke it
    }
    await tick();
    const framesMb = Math.round((FW * FH * 8) / 1e6);
    const frameNote = frames === 0
      ? ` A full-resolution frame could not be held at all on this device, which is the clearest possible answer: the full-resolution view is not available here.`
      : frames < 0
        ? ` Holding ${-frames} full-resolution frame${-frames === 1 ? "" : "s"} (${(-frames) * framesMb} MB of texture) took the surface away. The editor holds ONE while a photograph is open, so this is the number that decides whether the full-resolution view can come back.`
        : ` Still there with ${frames} full-resolution frames held — ${frames * framesMb} MB of texture, the editor's own shape of memory rather than a convenient one. That is the reassuring answer, and it is the one this line exists to give.`;
    const verdict = (ceiling < 0
      ? `still available with ${lastOk} MB held`
      : `lost it at ${ceiling} MB held`)
      + (frames <= 0 ? ` · ${frames === 0 ? "no frame would fit" : `${-frames} frame${-frames === 1 ? "" : "s"} broke it`}` : ` · ${frames} frames OK`);
    row("A drawing surface the size of the frame", verdict,
      `Asked for a ${FW}x${FH} canvas — a whole frame from your camera — repeatedly, with more and more memory already held each time, because that is the state the editor is in when it asks. ` +
      (ceiling < 0
        ? `It was still available with ${lastOk} MB held, which is more than a session of photographs plus a full-resolution copy needs. This device has room.`
        : `It stopped being available once about ${ceiling} MB was held. A session of eight photographs is roughly 200 MB before the editor holds anything of its own, and a full-resolution copy of one frame is another 170 MB — so this is the number that decides whether the full-resolution view can be switched back on here.`) +
      frameNote +
      ` The figure is an approximation: real memory is fragmented differently from a ladder of big buffers. It is still far closer to what the app faces than asking on an empty page, which is what the first version of this did — and that answer is why the full-resolution view is currently switched off.`);
  } finally {
    held.length = 0;
    for (const t of textures) { try { probe.deleteTexture(t); } catch { /* context may be gone */ } }
    textures.length = 0;
    lose();
    cv.width = 1;
    cv.height = 1;
  }
}

/** THE DRAWING SURFACE THE EXPORT ITSELF USES — A DIFFERENT LIMIT AGAIN.
 *
 *  The probe above asks about a WebGL2 drawing buffer, and its own header makes
 *  the point that a framebuffer being accepted says nothing about a canvas being
 *  accepted. The same split runs one level further down: a 2D context is not a
 *  WebGL2 one either, and the export uses the 2D one. `exportImage` builds a
 *  canvas at the full frame size, takes `getContext("2d")`, puts the finished
 *  pixels into it and calls `toBlob`. So the limit that decides whether an
 *  export comes out is this one, and nothing has ever measured it.
 *
 *  TWO SEPARATE CAPS, both documented with reproductions, neither respected by
 *  the export path today.
 *
 *  The first is AREA, and it is VERSION-DEPENDENT. Safari refuses a canvas
 *  above a fixed number of pixels regardless of how much memory is free. The
 *  published reproductions (2022) put it at 16,777,216 — 4096x4096, and the
 *  refusal does not depend on the shape: 4097x4096 over, 5120x3072 under — and
 *  a frame out of the camera this app is built around, 5568x3712 or 20,668,416
 *  pixels, is above that. Current WebKit (CanvasBase.cpp maxCanvasArea) allows
 *  8192 x 8192 = 67,108,864 on iOS and 16384 x 16384 elsewhere, which that
 *  frame is well under. Which one a reader's iPad has depends on its Safari, so
 *  the ladder below tries both sides of BOTH figures rather than trusting
 *  either.
 *
 *  The second is TOTAL canvas memory across every canvas the page is holding.
 *  The 2022 reproductions found one (384 MB on Safari 15), past which
 *  `getContext("2d")` returned null and canvases drew transparent, and found
 *  that Safari kept canvases alive after the last reference was gone; current
 *  WebKit's canvas code has no such total check. Older devices may still have
 *  it, so the second half of this probe measures it rather than assuming
 *  either answer. The documented remedy is to resize to 1x1 and clear before
 *  dropping one, which the export path now does (releaseCanvas).
 *
 *  AND THE FAILURE MODE IS THE REASON THIS IS WORTH A PROBE RATHER THAN A NOTE:
 *  it is not a crash. It is a photograph that comes out blank, from an export
 *  that reported success. So the test is never "did the context exist" but DRAW
 *  A KNOWN COLOUR AND READ IT BACK — the same standard the probe above settled
 *  on, for the same reason.
 *
 *  Bounded on purpose. The hoarding ladder stops at roughly the export's own
 *  600 MB budget rather than climbing until something dies, because this runs on
 *  the reader's device and a diagnostic that kills the tab has answered nothing.
 *  The area answer is recorded before the hoarding ladder starts, so the cheap
 *  half survives if the expensive half goes badly. */
async function theCanvasTheExportUses(): Promise<void> {
  // A canvas of a given size, filled with a known colour and read back at the
  // FAR corner — the near one can read correctly on a surface that was clamped,
  // because the clamp keeps the origin. Returns null when the context was
  // refused outright, false when it drew the wrong thing, true when it is real.
  const drawsAt = (w: number, h: number): { ok: boolean; ctx: boolean; cv: HTMLCanvasElement } => {
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const c = cv.getContext("2d");
    if (!c) return { ok: false, ctx: false, cv };
    try {
      c.fillStyle = "rgb(64, 128, 191)";
      c.fillRect(0, 0, w, h);
      const px = c.getImageData(w - 1, h - 1, 1, 1).data;
      return { ok: Math.abs(px[0] - 64) <= 2 && Math.abs(px[1] - 128) <= 2 && Math.abs(px[2] - 191) <= 2, ctx: true, cv };
    } catch {
      // getImageData throws rather than returning wrong pixels in some builds;
      // either way the surface is not usable for an export.
      return { ok: false, ctx: true, cv };
    }
  };
  const release = (cv: HTMLCanvasElement) => {
    // THE DOCUMENTED RELEASE, not merely dropping the reference: Safari holds a
    // canvas after nothing points at it, and a 1x1 clear is what makes it give
    // the memory back. This probe would otherwise poison its own later rungs.
    try { cv.width = 1; cv.height = 1; cv.getContext("2d")?.clearRect(0, 0, 1, 1); } catch { /* already gone */ }
  };

  // --- part one: how big a single 2D surface can be -------------------------
  // Ordered by area, and chosen so both sides of BOTH caps are tested rather
  // than inferred: 4096x4096 is the old published cap exactly and 4097x4096 one
  // row over it; 8192x8192 is current iOS WebKit's cap exactly and 8193x8192
  // one row over. The two frame sizes are what this app actually asks for. The
  // last two rungs are 268 MB surfaces each, released before the next, and come
  // last so the cheap answers are already recorded if they go badly.
  const SIZES: Array<[number, number, string]> = [
    [4096, 4096, "the old published cap exactly"],
    [4097, 4096, "one pixel row over the old cap"],
    [5120, 3072, "under the old cap, but wider than 4096"],
    [5568, 3712, "a frame from the camera this app is built around"],
    [5600, 3728, "the frame size the rest of this page uses"],
    [8192, 4096, "twice the old cap"],
    [8192, 8192, "current iOS WebKit's cap exactly"],
    [8193, 8192, "one pixel row over the current cap"],
  ];
  let biggest = 0, biggestLabel = "", firstRefusal = "", frameOk: boolean | null = null;
  for (const [w, h, what] of SIZES) {
    const r = drawsAt(w, h);
    release(r.cv);
    if (w === 5568 && h === 3712) frameOk = r.ok;
    if (r.ok) {
      if (w * h > biggest) { biggest = w * h; biggestLabel = `${w}x${h}`; }
    } else if (!firstRefusal) {
      firstRefusal = `${w}x${h} (${what})${r.ctx ? " drew nothing" : " was refused a drawing context"}`;
    }
    await tick();
  }
  row("The biggest surface the export can draw on",
    biggest ? `${biggestLabel} — ${(biggest / 1e6).toFixed(1)} megapixels` : "none of the sizes tried",
    (biggest
      ? `The largest of the sizes tried that actually held a colour when it was read back. `
      : `None of the sizes tried came back with the colour that was drawn into them, which would mean exports cannot work on this device at all by this route. `) +
    (frameOk === true
      ? `A whole frame from your camera — 5568x3712 — works, so a full-size export is not hitting this limit here.`
      : frameOk === false
        ? `A whole frame from your camera — 5568x3712 — did NOT work. That is the size the app exports at, so a full-size export on this device is producing a blank picture rather than failing loudly. This is the number that matters.`
        : `The frame size was not reached.`) +
    (firstRefusal ? ` First refusal: ${firstRefusal}.` : ` Nothing tried was refused.`));

  // --- part two: how many at once, and whether releasing them helps ---------
  // 5568x3712 at four bytes a pixel is about 83 MB a surface, so seven of them
  // is roughly the 600 MB the export already budgets for itself. Stopping there
  // is deliberate: past it this stops being a measurement and starts being an
  // attempt to kill the reader's tab.
  const FW = 5568, FH = 3712;
  const eachMb = Math.round((FW * FH * 4) / 1e6);
  const MOST = 7;
  const held: HTMLCanvasElement[] = [];
  let heldOk = 0;
  try {
    for (let i = 0; i < MOST; i++) {
      const r = drawsAt(FW, FH);
      held.push(r.cv);
      if (!r.ok) break;
      heldOk++;
      await tick();
    }
    const hitIt = heldOk < MOST;
    // AND THE HALF THAT MAKES IT ACTIONABLE: if holding them broke it, does the
    // documented release actually give it back? A yes here says the export's
    // missing cleanup is a real defect with a real remedy rather than a theory.
    let recovered: boolean | null = null;
    if (hitIt) {
      for (const cv of held) release(cv);
      held.length = 0;
      await tick();
      const again = drawsAt(FW, FH);
      recovered = again.ok;
      release(again.cv);
    }
    row("Surfaces this size it will hold at once",
      hitIt ? `${heldOk} — about ${heldOk * eachMb} MB` : `at least ${heldOk} — about ${heldOk * eachMb} MB`,
      `Each one is a whole frame at four bytes a pixel, roughly ${eachMb} MB, and they were kept rather than released — which is what the app does today, because it never releases the surface an export draws on. ` +
      (hitIt
        ? `The next one came back empty. ` +
          (recovered === true
            ? `Releasing the earlier ones gave it straight back, so exporting several photographs in one sitting can quietly start producing blank pictures on this device, and the fix is for the app to let each surface go when it is done with it.`
            : recovered === false
              ? `Releasing the earlier ones did NOT give it back, which is worse: once this device is in that state, only reloading the page appears to clear it.`
              : `Whether releasing them gives it back was not established.`)
        : `It never refused within the ${Math.round(MOST * eachMb / 100) * 100} MB this test is willing to ask for, which is about what the export budgets for itself. That is the reassuring answer — it does not prove there is no ceiling, only that this device's is further out than the app's own spending.`));
  } finally {
    for (const cv of held) release(cv);
    held.length = 0;
  }
}

/** COULD THE LIVE VIEW RUN AT FULL RESOLUTION ON THIS DEVICE?
 *
 *  The editor works on a downscaled copy of the photograph for one reason: a
 *  full-resolution render was too costly when that decision was made. Whether it
 *  still is has never been measured on these devices — and the answer decides
 *  more than speed. The proxy is why the noise-reduction and sharpening
 *  footprints are defined in proxy texels, why the export has to reproduce that
 *  footprint by hand, and why a saved file can differ from what was on screen.
 *  Full resolution would make the preview and the export the same pixels.
 *
 *  THE COST IS NOT THE DRAWING. A full-resolution preview still draws only as
 *  many pixels as the screen has; what grows is the TEXTURE it samples from, and
 *  the memory that holds it. So this measures the three things that decide it:
 *  whether the upload succeeds at all, what it costs, and whether drawing from a
 *  full-size texture at screen size stays interactive against drawing from a
 *  half-size one. */
async function fullResolutionPreview(): Promise<void> {
  const p = note("Asking whether the live view could run at full resolution here…");
  const mid = (xs: number[]) => { const a = [...xs].sort((x, y) => x - y); return (a[(a.length - 1) >> 1] + a[a.length >> 1]) / 2; };
  try {
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    const file = { name: "practice.dng", kind: sniff(bytes), bytes, looksTranscoded: false };
    const img = await decodeOffThread({ ...file, bytes: bytes.slice() });
    const built = buildLinearSource(file, img);
    const mp = (built.image.width * built.image.height) / 1e6;
    row("Building a full-resolution frame", `${ms(built.ms)} · ${(built.bytes / 1e6).toFixed(0)} MB for ${mp.toFixed(1)} MP`,
      `Reading the sensor data and demosaicing every pixel, once, into the buffer a texture wants. It scales with the photograph: ${(built.bytes / 1e6 / mp).toFixed(0)} MB a megapixel, so a 21-megapixel raw would want about ${Math.round((built.bytes / 1e6 / mp) * 21)} MB held while it is open.`);
    const half16 = buildLinearSource(file, img, true);
    row("…and the same frame at half the memory", `${ms(half16.ms)} · ${(half16.bytes / 1e6).toFixed(0)} MB`,
      `The same picture in half-float, which is what every HDR image pipeline uses for linear data and what the graphics chip samples identically. A 21-megapixel raw would want about ${Math.round((half16.bytes / 1e6 / mp) * 21)} MB instead. Whether it costs any visible precision is the comparison below.`);

    // Half the size, for the comparison — the proxy the app uses today.
    const half = { width: built.image.width >> 1, height: built.image.height >> 1, camMatrix: built.image.camMatrix, linear: undefined };
    const halfLinear = new Float32Array((half.width * half.height) * 4);
    if (built.image.linear) {
      for (let y = 0; y < half.height; y++) {
        for (let x = 0; x < half.width; x++) {
          const s2 = ((y * 2) * built.image.width + x * 2) * 4, d = (y * half.width + x) * 4;
          halfLinear[d] = built.image.linear[s2]; halfLinear[d + 1] = built.image.linear[s2 + 1];
          halfLinear[d + 2] = built.image.linear[s2 + 2]; halfLinear[d + 3] = 1;
        }
      }
    }

    const params: EditParams = {
      wb: [1.6, 1, 0.7], exposure: 1.2, recover: 0, swapRB: true, hue: 0, sat: 1.1, contrast: 1.05, denoise: 0.47,
      tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1],
      tone: [...TONE_DEFAULT], toneR: [...TONE_DEFAULT], toneG: [...TONE_DEFAULT], toneB: [...TONE_DEFAULT],
      lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false, forceBalance: false,
      hsFix: 1, hsBypass: false, vignette: 0, clarity: 0, dehaze: 0, sharpen: 0.4, texture: 0,
      hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], grade: [...GRADE_DEFAULT], grainAmt: 0, grainSize: 1.5,
      vigAmt: 0, vigMid: 0.5, mix3: [...MIX3_DEFAULT], spots: [], crop: { ...CROP_DEFAULT }, straighten: 0,
    };
    // Screen-sized output, which is what a preview actually draws, with the crop
    // doing the sizing since that is how the renderer sets its canvas.
    const SCREEN = 1400;
    type Src = { width: number; height: number; pixels?: Uint8ClampedArray; linear?: Float32Array; camMatrix?: number[] };
    const sources: [string, Src][] = [
      ["full resolution", built.image],
      ["full resolution at half the memory", half16.image],
      ["the half-size proxy it uses today", { width: half.width, height: half.height, camMatrix: half.camMatrix, linear: halfLinear }],
    ];
    const drawnBy = new Map<string, Uint8ClampedArray>();
    for (const [label, image] of sources) {
      const frac = Math.min(1, SCREEN / Math.max(image.width, image.height));
      const pr = { ...params, crop: { x: (1 - frac) / 2, y: (1 - frac) / 2, w: frac, h: frac } };
      const canvas = document.createElement("canvas");
      let r;
      try {
        r = new Renderer(canvas);
        await r.ready; // built before anything is timed: this row measures drawing, not building
        const t0 = performance.now();
        r.setImage(image);
        const upload = performance.now() - t0;
        r.setToneCurve(pr.tone, pr.toneR, pr.toneG, pr.toneB);
        r.render(pr); // warm-up, not timed
        r.readFrame();
        await tick();
        // THREE PASSES, MEDIAN REPORTED, SPREAD PRINTED — the rule the decode and
        // storage probes already follow, and this one did not. A single pass of
        // five frames put the three sources in an order that REVERSED on the
        // next run of the same iPad (half-float 28 ms then 33, the proxy 35 then
        // 27), and a conclusion was drawn from the first before the second
        // existed. One number here invites exactly that.
        const N = 5, PASSES = 3;
        const passes: number[] = [];
        let last: Uint8ClampedArray | null = null;
        for (let pass = 0; pass < PASSES; pass++) {
          const t1 = performance.now();
          for (let i = 0; i < N; i++) { r.render(pr); last = r.readFrame(); }
          passes.push((performance.now() - t1) / N);
          await tick();
        }
        const per = mid(passes);
        if (last) drawnBy.set(label, last);
        row(`Drawing from ${label}`, `upload ${ms(upload)} · ${ms(per)} a frame`,
          `A ${canvas.width}x${canvas.height} draw — about what a screen asks for — sampled from a ${(image.width * image.height / 1e6).toFixed(1)}-megapixel texture. Under 16 ms a frame is smooth at sixty; under 33 is smooth at thirty. The upload happens once when a photograph opens. Compare the spread against the gap between these rows before concluding one source is faster than another.`,
          passes.map((x) => Math.round(x) + " ms").join(", "));
        // EIGHT MASKS ON THE SAME FRAME (decision 042, stage 0). The shader-room
        // rows say how much per-mask state fits; this says what the masks
        // already cost a frame on THIS device, timed exactly as the row above so
        // the difference between the two is the masks and nothing else.
        if (label === "full resolution") {
          const eight = { ...pr, masks: eightMasks() };
          r.render(eight); r.readFrame(); await tick(); // warm-up, not timed
          const withMasks: number[] = [];
          for (let pass = 0; pass < PASSES; pass++) {
            const t1 = performance.now();
            for (let i = 0; i < N; i++) { r.render(eight); r.readFrame(); }
            withMasks.push((performance.now() - t1) / N);
            await tick();
          }
          const perMasks = mid(withMasks);
          row("…the same draw with eight masks", `${ms(perMasks)} a frame · ${perMasks >= per ? "+" : "−"}${ms(Math.abs(perMasks - per))}`,
            `Eight masks of the kinds this page can make without a photograph's own selection: radial, gradient and colour, two of them joined to another. Brush and sky masks are left out because they need a painted or detected selection. Masks are planned to carry their own settings for the ordinary controls, and this is what a frame costs before they do. Under 33 ms a frame is still smooth at thirty; compare the gap with the spread before reading anything into it.`,
            withMasks.map((x) => Math.round(x) + " ms").join(", "));
        }
      } catch (err) {
        row(`Drawing from ${label}`, "refused", `This device would not do it: ${String((err as Error)?.message ?? err)}.`);
      } finally {
        // The CONTEXT, not just the canvas — see Renderer.dispose. Three of
        // these leaked on every run before this line existed, each holding a
        // full-resolution texture.
        r?.dispose();
        canvas.width = 1; canvas.height = 1;
      }
      await tick();
    }
    // DOES HALF THE MEMORY COST ANY OF THE PICTURE? The two frames above were
    // drawn from the same photograph through the same shaders, differing only in
    // how precisely the source was stored.
    const a = drawnBy.get("full resolution"), bHalf = drawnBy.get("full resolution at half the memory");
    if (a && bHalf && a.length === bHalf.length) {
      let worst = 0, sum = 0, n = 0;
      for (let i = 0; i < a.length; i += 4) {
        for (let k = 0; k < 3; k++) { const d = Math.abs(a[i + k] - bHalf[i + k]); if (d > worst) worst = d; sum += d; n++; }
      }
      row("What half the memory costs the picture", `average ${(sum / n).toFixed(3)} of 255, worst ${worst}`,
        worst <= 1
          ? "Nothing a person could see: the two frames are the same picture to within one step of 255, so the memory is free to give up."
          : "Worth looking at before choosing it — the two frames differ by more than one step of 255 somewhere.");
    }
    p.remove();
  } catch (e) {
    p.remove();
    row("Could the live view run at full resolution", "not run", `${(e as Error).message}.`);
  }
}

// --- the picture checks (record 106, first stage) ----------------------------
// THREE CHECKS THAT ASK WHETHER THE PICTURE IS RIGHT, ON THIS DEVICE'S OWN CHIP.
// Each is a relative statement made inside one run: two draws of the same photograph
// by the same chip are compared with each other, so a chip that rounds differently
// from another changes both sides alike and no stored picture is needed. Every check
// carries its PLANTED PAIR first, a pair known to differ whose known figure is
// printed and must be read back, so a check that cannot fail is seen not failing.
// A planted colour is drawn and read back before any check, and must read exactly:
// a browser that adds noise to what a page reads back would otherwise turn into
// false verdicts. NO BAND IS WRITTEN HERE. Each verdict is the measured numbers beside
// what the check expects of them, and a band is set only from a report a device has
// printed (decision 106, Rejected). The section opens nothing of the reader's,
// changes no setting and writes nothing that outlives the run.
//
// ONE DECODE AND ONE BUILD PER PRESS, WHERE EACH DRAW USED TO MAKE ITS OWN. `drawFrame` builds
// the pixel source and a new picture code (a `Renderer`) on every call, which is right for an
// export and was about two dozen of each here. The press now opens ONE drawing surface (`openDrawing`,
// in `gpuexport.ts` beside `drawFrame`, which opens, draws once and closes through the same code),
// gives it the photograph once and draws every frame of every run through it, and the report prints
// how many times the photograph was decoded and the picture code built, so "once each" is read
// from the page's own counts and not assumed. Every stage is timed with the page's own clock and
// the time is printed beside it, and one line says where the press has got to.
//
// EVERY SECOND OF A PRESS LIES IN A NAMED ROW. The press keeps one mark on the page's clock, and
// every stretch is the time from that mark to the next, put under a name and the mark moved on, so
// the rows add up to the whole press by construction and the one line that adds them says how far
// it is from the whole and calls the difference "in no row". The stretch the press spends waiting
// for the screen to draw is one row of its own with a count. While the page is hidden a browser
// stops animation frames and throttles timers to seconds (MDN, Page Visibility), so the press then
// makes no such wait and goes straight on, and the report says how many it skipped.

/** What one press did, and how long each stage took. `decodes` and `builds` count the practice
 *  photograph's decode and the picture code's build at the places they happen; `uses` counts how
 *  many times each named picture was turned into the chip's source; `stages` holds every time
 *  made under a stage's name, in the order the press made them; `mark` is the moment on the page's
 *  clock up to which the press's time is already under a name; `waits` and `waitMs` count and sum
 *  the waits for the screen to draw, `hidden` counts the ones skipped with the page hidden, and
 *  `books` sums the stretches outside the runs that are only the press writing its rows and words. */
interface PressTally {
  decodes: number;
  builds: number;
  uses: Record<string, number>;
  stages: Map<string, number[]>;
  mark: number;
  waits: number;
  waitMs: number;
  hidden: number;
  books: number;
}

/** Puts one time under a stage's name. Takes the tally, the name and the milliseconds. Returns
 *  nothing. What it must satisfy: the stage's list ends with this figure, so the stages read
 *  back in the order they were made. */
function timeStage(tally: PressTally, name: string, ms: number): void {
  const l = tally.stages.get(name);
  if (l) l.push(ms); else tally.stages.set(name, [ms]);
}

/** Takes the time since the press's mark. Takes the tally. Returns the milliseconds from the mark to
 *  now and moves the mark to now. What it must satisfy: every millisecond of a press is returned by
 *  exactly one call, so whatever the callers put under names adds up to the press. */
function lapMs(tally: PressTally): number {
  const now = performance.now();
  const d = now - tally.mark;
  tally.mark = now;
  return d;
}

/** Puts the time since the mark under a stage's name. Takes the tally and the name. Returns nothing. */
function lap(tally: PressTally, name: string): void {
  timeStage(tally, name, lapMs(tally));
}

/** Puts the time since the mark under "the press writing its rows and words". Takes the tally.
 *  Returns nothing. Called before a timed stage begins, so what came before it (a row written, a
 *  progress line set, an edit made) is in a row and not in the stage. */
function books(tally: PressTally): void {
  tally.books += lapMs(tally);
}

/** The name of the last stretch of the press: its time rows written and its drawing surface given back. */
const TAIL_STAGE = "writing the time rows and giving the drawing surface back";
/** The name of the planted colour's first draw, which is also the picture code's first draw. */
const FIRST_DRAW = "the picture code's first draw";

/** Gives the screen a moment to draw the progress line. Takes the tally. Returns a promise that
 *  resolves after a zero-delay timer, with the stretch put under the waiting row and counted; while
 *  the document reads hidden it makes no wait, counts the skip, and resolves at once. What it must
 *  satisfy: a hidden page never waits on a timer a browser throttles to seconds, and every wait
 *  made is in `waitMs`. */
async function pause(tally: PressTally): Promise<void> {
  if (document.visibilityState === "hidden") { tally.hidden++; return; }
  const before = lapMs(tally);
  tally.books += before;
  await tick();
  tally.waits++;
  tally.waitMs += lapMs(tally);
}

/** Starts a press's tally. Takes the moment the press began on the page's clock. Returns an empty
 *  tally whose mark is that moment. */
function newTally(start: number): PressTally {
  return { decodes: 0, builds: 0, uses: {}, stages: new Map(), mark: start, waits: 0, waitMs: 0, hidden: 0, books: 0 };
}

/** Every millisecond the press has put under a name. Takes the tally. Returns the sum of every
 *  stage, the waits and the books. */
function pressTotal(tally: PressTally): number {
  let s = tally.waitMs + tally.books;
  for (const l of tally.stages.values()) for (const v of l) s += v;
  return s;
}

/** The progress line of the picture checks, present in `debug.html` from parse in a polite live
 *  region with a label in words, and the moment the press began on the page's own clock. */
const picProgress = $("dPicProgress");
let pressStart = 0;

/** Says where the press has got to. Takes the words for what it is doing, and whether they are
 *  the last (then the words carry the whole time themselves). Returns nothing; the progress line
 *  then reads those words and, unless last, the whole seconds since the press began. What it
 *  must satisfy: it is the one element present from parse, so a screen reader is told of each
 *  change; it is called at each change of check, run and stage and not on a timer, so it does not
 *  speak every second. */
function progress(text: string, last = false): void {
  picProgress.textContent = last ? text : `${text} (${Math.round((performance.now() - pressStart) / 1000)} s so far)`;
}

/** A time for a reader. Takes milliseconds. Returns them in milliseconds under ten seconds and
 *  in seconds above, with one decimal. */
const dur = (n: number): string => (n < 10000 ? ms(n) : `${(n / 1000).toFixed(1)} s`);

/** Gives the press's drawing surface a picture and puts the two times under names. Takes the surface,
 *  the tally, the file, its decode and a name for the picture. Returns nothing; the tally counts one
 *  more use of the name, and the stretch since the mark goes under "the <name>'s pixel build" (the
 *  time the surface says the build took) and "the <name>'s upload to the chip" (the rest). What it
 *  must satisfy: the surface is given no lens curve, no rotation and no flip, which is what the press
 *  draws, so a frame drawn after it is the frame `drawFrame` gives for the same photograph and edit. */
function useOn(drawing: Drawing, tally: PressTally, file: ImportedFile, current: DecodedImage, label: string): void {
  tally.uses[label] = (tally.uses[label] ?? 0) + 1;
  const u = drawing.use(file, current, null, 0, 0);
  const whole = lapMs(tally);
  timeStage(tally, `the ${label}'s pixel build`, u.source);
  timeStage(tally, `the ${label}'s upload to the chip`, Math.max(0, whole - u.source));
}

/** Gives the Separation check's drawing surface the photograph at the editor's working size when it has one. Takes the surface, the tally,
 *  the file, its decode and a name for the picture. Returns true when the surface now holds the decode's own working copy (the half-size
 *  demosaic with red and blue already moved onto green), uploaded by `useLinear` as it stands, one drawn pixel for each of its pixels and
 *  nothing demosaiced again; false when the photograph has no linear camera copy (a camera-rendered file, or a raw shown by its embedded
 *  preview), in which case it is given as `useOn` gives it. What it must satisfy: the source is `{ width, height, linear, camMatrix }` of the
 *  decode and is not copied or changed; the surface gets no lens curve, no rotation and no flip, which is what the press draws; the tally
 *  counts one more use of the name and puts the stretch since the mark under "the <name>'s upload to the chip". Consumer: the Separation
 *  check's first press, and through it the sweep. */
function useAtWorkingSize(drawing: Drawing, tally: PressTally, file: ImportedFile, current: DecodedImage, label: string): boolean {
  if (!current.isRaw || !current.linear || !current.camMatrix) { useOn(drawing, tally, file, current, label); return false; }
  tally.uses[label] = (tally.uses[label] ?? 0) + 1;
  drawing.useLinear({ width: current.width, height: current.height, linear: current.linear, camMatrix: current.camMatrix }, 0, 0);
  timeStage(tally, `the ${label}'s upload to the chip`, lapMs(tally));
  return true;
}

/** The names a software renderer goes by in the unmasked renderer string. */
const SOFTWARE_RENDERER = /swiftshader|llvmpipe|softpipe|\bwarp\b|basic render|software/i;

/** The planted colour, red then green then blue, in 255ths. */
const PLANT_COLOUR: [number, number, number] = [200, 100, 50];

const MEDIAN_OF = (v: number[]): number => [...v].sort((x, y) => x - y)[Math.floor(v.length / 2)];

/** Which chip is drawing. Takes nothing. Returns the unmasked renderer string of a throwaway
 *  WebGL2 canvas, or a short phrase saying why there is none. The context is given back. */
function chipName(): string {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return "WebGL2 unavailable";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const s = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "renderer not disclosed";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
    c.width = 1; c.height = 1;
    return s;
  } catch { return "renderer not read"; }
}

interface FrameDiff { worst: number; over8: number; over24: number; moved: number; px: number }

/** How far two frames of one size are apart. Takes two RGBA byte frames. Returns the largest
 *  per-channel difference, the count of pixels with a channel more than 8 of 255 apart, the count
 *  more than 24 apart, and the count that differ at all, with the pixel count. Throws when the
 *  two are not the same size. What it must satisfy: two equal frames read zero in all four, and
 *  the planted pair below reads its known figures, which `pictureChecks` requires before any check. */
function diffFrames(a: Uint8ClampedArray, b: Uint8ClampedArray): FrameDiff {
  if (a.length !== b.length) throw new Error(`the two frames came out different sizes (${a.length / 4} and ${b.length / 4} pixels)`);
  const px = a.length / 4;
  let worst = 0, over8 = 0, over24 = 0, moved = 0;
  for (let i = 0; i < a.length; i += 4) {
    let m = 0;
    for (let k = 0; k < 3; k++) { const d = Math.abs(a[i + k] - b[i + k]); if (d > m) m = d; }
    if (m > worst) worst = m;
    if (m > 0) moved++;
    if (m > 8) over8++;
    if (m > 24) over24++;
  }
  return { worst, over8, over24, moved, px };
}

/** The near-neutral patch of a frame, the walk's own choice. Takes an RGBA byte frame. Returns the
 *  pixel indexes of its least-spread three percent among the pixels neither dark nor bright (at
 *  least fifty), which the caller keeps so a second frame is read at the same pixels. */
function pickPatch(d: Uint8ClampedArray): number[] {
  const n = d.length / 4;
  const hist = new Array(256).fill(0);
  const spread = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const r = d[4 * i], g = d[4 * i + 1], b = d[4 * i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
    if (d[4 * i + 3] === 0 || l < 40 || l > 215) { spread[i] = -1; continue; }
    spread[i] = mx - mn; hist[mx - mn]++;
  }
  let eligible = 0;
  for (let s = 0; s < 256; s++) eligible += hist[s];
  const want = Math.max(50, Math.floor(eligible * 0.03));
  let cut = 0, acc = 0;
  for (; cut < 256; cut++) { acc += hist[cut]; if (acc >= want) break; }
  const idx: number[] = [];
  for (let i = 0; i < n; i++) if (spread[i] >= 0 && spread[i] <= cut) idx.push(i);
  return idx;
}

/** The red over the blue of a patch. Takes an RGBA byte frame and the indexes of its patch.
 *  Returns the sum of the patch's red over the sum of its blue, or 0 for an empty patch. It is
 *  the statistic the Temperature walk reads: a warmer picture raises it. */
function patchRedOverBlue(d: Uint8ClampedArray, idx: number[]): number {
  let sr = 0, sb = 0;
  for (const i of idx) { sr += d[4 * i]; sb += d[4 * i + 2]; }
  return sb > 0 ? sr / sb : 0;
}

/** A complete edit with every control at its neutral value, then `over` on top. Takes the fields
 *  to change. Returns a fresh edit sharing no array with any other, so one draw's edit can never
 *  be altered by another's. Consumers: the three picture checks and the planted colour. */
function pictureParams(over: Partial<EditParams>): EditParams {
  const p: EditParams = {
    wb: [1, 1, 1], exposure: 1, recover: 0, swapRB: false, hue: 0, sat: 1, contrast: 1, denoise: 0,
    tint: [1, 1, 1], glow: 0, sky: [0, 1, 1], foliage: [0, 1, 1],
    tone: [...TONE_DEFAULT], toneR: [...TONE_DEFAULT], toneG: [...TONE_DEFAULT], toneB: [...TONE_DEFAULT],
    lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false, forceBalance: false,
    hsFix: 1, hsBypass: false, vignette: 0, clarity: 0, dehaze: 0, sharpen: 0, texture: 0,
    hsl: hslDefault(), bwOn: false, bwMix: [1, 1, 1], grade: [...GRADE_DEFAULT], grainAmt: 0, grainSize: 1.5,
    vigAmt: 0, vigMid: 0.5, mix3: [...MIX3_DEFAULT], spots: [], crop: { ...CROP_DEFAULT }, straighten: 0,
  };
  return { ...p, ...JSON.parse(JSON.stringify(over)) };
}

/** Draws a colour the page chose and reads it back, through the press's one drawing surface, which
 *  does what `drawFrame` does (the same picture code, the same conversion to the wide-gamut space).
 *  Takes that surface and the press's tally, which gains the stages' times: the colour's source made
 *  and sent, the picture code's first draw (a draw of the same colour, made and thrown away so the
 *  chip's one-time warm-up is in a row of its own), and the colour drawn, read back and compared.
 *  Returns whether every pixel read back exactly the colour the picture code is expected to give,
 *  with the figures and a sentence for the row. What it must satisfy: `exact` is true only when no
 *  pixel and no channel is off by even one, which is what lets the checks after it trust a read; the
 *  planted colour's own row is the second draw's alone; a throw is the caller's "could not draw". The
 *  surface is left holding the planted picture, so the caller gives it the photograph with `useOn`
 *  before it draws that. */
async function plantedColour(drawing: Drawing, tally: PressTally): Promise<{ exact: boolean; value: string; meaning: string }> {
  const W = 32, H = 32;
  const pixels = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { pixels[4 * i] = PLANT_COLOUR[0]; pixels[4 * i + 1] = PLANT_COLOUR[1]; pixels[4 * i + 2] = PLANT_COLOUR[2]; pixels[4 * i + 3] = 255; }
  const img = { width: W, height: H, pixels, isRaw: false } as DecodedImage;
  const file: ImportedFile = { name: "planted.png", kind: "png", bytes: new Uint8Array(0), looksTranscoded: false };
  books(tally);
  useOn(drawing, tally, file, img, "planted colour");
  const edit = pictureParams({});
  books(tally);
  drawing.draw(edit);
  lap(tally, FIRST_DRAW);
  const frame = drawing.draw(edit);
  const p3 = new Float32Array(3);
  srgbDisplayToP3Display(PLANT_COLOUR[0] / 255, PLANT_COLOUR[1] / 255, PLANT_COLOUR[2] / 255, p3);
  const want = new Uint8ClampedArray(3);
  for (let k = 0; k < 3; k++) want[k] = p3[k] * 255;
  let off = 0, worst = 0;
  const px = frame.data.length / 4;
  for (let i = 0; i < px; i++) {
    let bad = false;
    for (let k = 0; k < 3; k++) { const d = Math.abs(frame.data[4 * i + k] - want[k]); if (d > worst) worst = d; if (d > 0) bad = true; }
    if (bad) off++;
  }
  const exact = off === 0;
  lap(tally, "the planted colour, drawn and read back");
  return {
    exact,
    value: `${exact ? "read exactly" : "did not read exactly"} · drew ${PLANT_COLOUR.join(", ")} and read ${frame.data[0]}, ${frame.data[1]}, ${frame.data[2]} for the expected ${want[0]}, ${want[1]}, ${want[2]} · ${off} of ${px} pixels off, worst ${worst} of 255`,
    meaning: exact
      ? "A colour the page chose was drawn through the picture code and read back, and every pixel came back as it should. So a read made here is not being changed on its way out, and the checks below can be trusted."
      : "A colour the page chose came back changed. Either this browser alters what a page reads back from a drawing, or the chip does not hold a plain colour; no check below is run, because its figures would not be the picture's.",
  };
}

/** The three checks' own instruments, tried on pictures made here with known answers. Takes
 *  nothing. Returns whether the frame comparator read the known figures of a made pair and the
 *  patch reader read a known rise and a known fall, with the sentence for the row. What it must
 *  satisfy: false when either instrument reads any known figure wrongly, which stops every check. */
function plantedPairs(): { ok: boolean; value: string; meaning: string } {
  const n = 1000;
  const a = new Uint8ClampedArray(n * 4), b = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { a[4 * i] = 100; a[4 * i + 1] = 100; a[4 * i + 2] = 100; a[4 * i + 3] = 255; b[4 * i] = 100; b[4 * i + 1] = 100; b[4 * i + 2] = 100; b[4 * i + 3] = 255; }
  for (let i = 0; i < 100; i++) b[4 * i] = 140;
  const d = diffFrames(a, b);
  const same = diffFrames(a, a);
  const cmpOk = d.worst === 40 && d.over8 === 100 && d.over24 === 100 && d.moved === 100 && same.moved === 0 && same.worst === 0;
  const one = new Uint8ClampedArray(n * 4), two = new Uint8ClampedArray(n * 4);
  for (let i = 0; i < n; i++) { one[4 * i] = 200; one[4 * i + 1] = 150; one[4 * i + 2] = 100; one[4 * i + 3] = 255; two[4 * i] = 255; two[4 * i + 1] = 150; two[4 * i + 2] = 100; two[4 * i + 3] = 255; }
  const idx = pickPatch(one);
  const lo = patchRedOverBlue(one, idx), hi = patchRedOverBlue(two, idx), back = patchRedOverBlue(one, idx);
  const patchOk = idx.length === n && Math.abs(lo - 2) < 1e-9 && Math.abs(hi - 2.55) < 1e-9 && hi > lo && !(back > hi);
  const ok = cmpOk && patchOk;
  return {
    ok,
    value: `${ok ? "read as known" : "did not read as known"} · frames: worst ${d.worst}, ${d.over8} over 8, ${d.over24} over 24, ${d.moved} moved (known 40, 100, 100, 100); patch: red over blue ${lo.toFixed(2)} then ${hi.toFixed(2)} (known 2.00 then 2.55), a rise`,
    meaning: "The comparator and the patch reader, tried first on pictures made here whose answers are known: a frame with a hundred pixels forty apart, an equal frame read as no difference, and a patch whose red was raised read as a rise and its return as no rise. A check that cannot fail would pass anything; this is the page seeing each instrument fail before it is trusted.",
  };
}

// --- THE DOOR (record 108): A PHOTOGRAPH THE READER PICKS ----------------------------------------------------------------
// One file input in the Picture checks section. A picked file is read into memory here, built into an `ImportedFile`
// and given to the same path the practice file's fetch feeds, so the three checks and the Separation check run on it in
// place of the practice file. Nothing of the file leaves the page and nothing is written back.

/** The photograph the reader picked, or null. Set by the file input below; read by both presses. */
let pickedFile: ImportedFile | null = null;

/** The photograph a press runs on: the file, its decode, the word the press's rows call it and its name. */
interface Subject { file: ImportedFile; img: DecodedImage; label: "practice photograph" | "picked photograph"; name: string }

/** Says in words what a file's EXIF holds. Takes the file's bytes. Returns the camera, the lens and the other
 *  figures as one sentence, or says no camera was read where the file carries none. What it must satisfy: only
 *  fields of the honest EXIF subset (`readExifSubset`) appear, so no location and no maker note is named. */
function exifWords(bytes: Uint8Array): string {
  let s = null;
  try { s = readExifSubset(bytes); } catch { s = null; }
  if (!s || (!s.make && !s.model && !s.lens)) return "no camera was read: the file carries no camera data this page can read";
  const cam = [s.make, s.model].filter(Boolean).join(" ") || "no camera name";
  const parts = [`camera ${cam}`, `lens ${s.lens ?? "not recorded"}`];
  if (s.focalLength) parts.push(`${(s.focalLength[0] / s.focalLength[1]).toFixed(0)} mm`);
  if (s.fNumber) parts.push(`f/${(s.fNumber[0] / s.fNumber[1]).toFixed(1)}`);
  if (s.exposureTime) parts.push(`${s.exposureTime[0]}/${s.exposureTime[1]} s`);
  if (s.iso) parts.push(`ISO ${s.iso}`);
  return parts.join(", ");
}

/** Says in words which route opened a photograph. Takes the file and its decode. Returns one sentence naming the route (the raw's sensor
 *  data, a raw's embedded preview, or a camera-rendered file as the camera made it), the decoder's own name for the format, the camera and
 *  the lens. What it must satisfy: it reads `img.isRaw` and `img.previewNotice` as the decoder set them, so the route it names is the one
 *  the editor's open takes for the same file, and it names no figure the file does not carry. */
function routeWords(file: ImportedFile, img: DecodedImage): string {
  const decoder = file.kind === "nef" ? "the Nikon NEF decoder"
    : file.kind === "dng" || file.kind === "tiff" ? "the DNG and TIFF decoder"
    : "the browser's own image decoder";
  const route = img.isRaw ? "the raw's sensor data, developed as the editor opens it, with its camera matrix"
    : img.previewNotice ? `a raw's embedded JPEG preview and not its sensor data (${img.previewNotice})`
    : file.kind === "jpeg" || file.kind === "png" ? "a camera-rendered file, as the camera made it"
    : "an 8-bit picture read out of the file, not its sensor data";
  return `${route} · format ${file.kind}${file.rawBrand ? ` (${file.rawBrand})` : ""}, read by ${decoder} · ${exifWords(file.bytes)}`;
}

/** Reads the photograph a press runs on. Takes the press's tally. Returns the subject: the picked file decoded
 *  when one was picked and it decodes, else the practice photograph fetched and decoded. A picked file the page
 *  cannot decode gets a row in the not-measured words saying why and the practice photograph is used. Writes the
 *  row that names the file, its kind, its pixel size, its camera and its lens. What it must satisfy: the decode
 *  is made once per call and counted in `tally.decodes`; the file's bytes are never sent anywhere. */
async function loadSubject(tally: PressTally): Promise<Subject> {
  let file: ImportedFile | null = null;
  let img: DecodedImage | null = null;
  let label: Subject["label"] = "practice photograph";
  if (pickedFile) {
    try {
      progress(`Decoding ${pickedFile.name}, once for the whole press`);
      books(tally);
      tally.decodes++;
      img = await decodeOffThread({ ...pickedFile, bytes: pickedFile.bytes.slice() });
      file = pickedFile;
      label = "picked photograph";
      lap(tally, `the ${label}'s file read and decode`);
    } catch (e) {
      img = null;
      tally.decodes--;
      row("The picked photograph", "failed", `The page could not decode ${pickedFile.name} (${(e as Error).message}), so the practice photograph is used instead. A raw from the Nikon Z 50, a DNG, a TIFF, a JPEG or a PNG decodes here; a format this app does not open does not.`);
      books(tally);
    }
  }
  if (!file || !img) {
    progress("Reading the practice photograph's file");
    books(tally);
    const res = await fetch("./examples/NIR_0063.dng");
    if (!res.ok) throw new Error("practice photo not available offline");
    const bytes = new Uint8Array(await res.arrayBuffer());
    lap(tally, `reading the ${label}'s file`);
    file = { name: "practice.dng", kind: sniff(bytes), bytes, looksTranscoded: false };
    progress("Decoding the practice photograph, once for the whole press");
    books(tally);
    tally.decodes++;
    img = await decodeOffThread({ ...file, bytes: bytes.slice() });
    lap(tally, `the ${label}'s decode`);
  }
  row("The photograph these checks run on", `${file.name} · ${file.kind} · ${img.width} by ${img.height} pixels`,
    `${label === "picked photograph" ? "The photograph you picked." : "The bundled practice photograph, which carries no camera data."} Its EXIF: ${exifWords(file.bytes)}. The file is read on this page only.`);
  row("How the photograph was opened", routeWords(file, img),
    "The route the decode took, read from the decoder's own answer: a raw is developed from its sensor data and then opens at a balance found from the data; a raw whose sensor data the decoder did not take is shown by its embedded preview, an 8-bit picture that opens at no balance; a camera-rendered file stays as the camera made it. The camera and lens are what the file's EXIF holds, read once the way the editor reads it. This page draws with no lens curve, so the lens is named and not applied to the pictures below.");
  return { file, img, label, name: file.name };
}

($("dPicFile") as HTMLInputElement).addEventListener("change", async (e) => {
  const input = e.currentTarget as HTMLInputElement;
  const note = $("dPicFileNote");
  const f = input.files?.[0];
  pickedFile = null;
  if (!f) { note.textContent = "No photograph picked, so the practice photograph is used."; return; }
  try {
    // THE EDITOR'S OWN DOOR (`importFile`): a NEF and a DNG carry the same magic number, so `sniff` alone calls a NEF a "dng" and the
    // decoder then opens the raw's embedded preview, as an 8-bit picture at no balance. `importFile` tells them apart by name (`refineKind`),
    // names a third-party raw's brand and unpacks a zip, which is how the editor opens every file.
    pickedFile = await importFile(f);
    const bytes = pickedFile.bytes;
    note.textContent = `Picked ${f.name}: ${(bytes.length / (1024 * 1024)).toFixed(1)} MB, read as ${pickedFile.kind}. Both buttons below now run on it. It goes nowhere: nothing is uploaded or saved. The copied result carries its file name, its camera and its lens.`;
  } catch (err) {
    note.textContent = `The page could not read ${f.name} (${(err as Error).message}), so the practice photograph is used. Pick it again, or pick another.`;
  }
});

/** The three picture checks, three times over. Takes nothing; writes its rows into the picture
 *  checks' own list and says where it has got to in the progress line. Returns a promise of
 *  whether all three checks ran (false when the planted colour or a planted pair did not read as
 *  known, or a step threw), after the rows are written. What it must satisfy: nothing of the
 *  reader's is opened, no check runs unless the planted colour read exactly and the planted pairs
 *  read as known, every verdict is printed beside the numbers it rests on, the practice photograph
 *  is decoded once and the picture code built once however many frames are drawn, the counts of
 *  both are printed, and the drawing surface is given back whatever happens. It takes the press's
 *  tally, begun by the caller at the press of the button, and puts every stretch under a name in it. */
async function pictureChecks(tally: PressTally): Promise<boolean> {
  const chip = chipName();
  const soft = SOFTWARE_RENDERER.test(chip);
  lap(tally, "reading the chip's name");
  row("The graphics chip drawing these checks", chip,
    soft ? "THIS IS A SOFTWARE RENDERER, not a graphics chip: it is neither the chip nor the browser a reader uses, so the figures below describe this renderer and say nothing of the picture on a device."
         : "The renderer string the browser gives for this page's drawing. The figures below are of this chip.");
  let drawing: Drawing | null = null;
  try {
    progress("Building the picture code, once for the whole press");
    books(tally);
    tally.builds++;
    const dr = await openDrawing();
    drawing = dr;
    lap(tally, "the picture code's build");
    await pause(tally);
    progress("Drawing a planted colour");
    const plant = await plantedColour(dr, tally);
    row("A planted colour, drawn and read back", plant.value, plant.meaning);
    if (!plant.exact) { row("The three picture checks", "not run", "The planted colour did not read back exactly, so a picture read on this page cannot be trusted."); return false; }
    progress("Trying the checks' own planted pairs");
    books(tally);
    const pairs = plantedPairs();
    lap(tally, "the checks' own planted pairs, tried");
    row("The checks' own pairs, planted first", pairs.value, pairs.meaning);
    if (!pairs.ok) { row("The three picture checks", "not run", "An instrument did not read its planted pair as known, so nothing it says is trustworthy."); return false; }

    const subject = await loadSubject(tally);
    const { file, img } = subject;
    const S = subject.label;
    progress(`Building the ${S}'s pixels and sending them to the chip, once`);
    await pause(tally);
    books(tally);
    useOn(dr, tally, file, img, S);
    await pause(tally);
    const frac = Math.min(1, Math.sqrt(2e5 / (img.width * img.height)));
    // THE OPENING BASELINE, on the slider grid: the exposure and the gains are written the way the
    // sliders will read them back, as a look writes them (`snapExposure`, `snapGain`).
    const baseline = pictureParams({
      wb: [1.6, 1, 0.7].map(snapGain) as [number, number, number], exposure: snapExposure(1.2), swapRB: true,
      sat: 1.1, contrast: 1.05, denoise: 0.47, sharpen: 0.4,
      crop: { x: (1 - frac) / 2, y: (1 - frac) / 2, w: frac, h: frac },
    });
    if (!canDrawFrame(baseline)) throw new Error("this edit is outside what the drawn path covers yet");
    const LOOK = { hue: 4, sat: 1.25, contrast: 1.08, texture: 0.25 };
    const WARM = 1.1;

    type Run = { roundTrip: FrameDiff; own: FrameDiff; planted: FrameDiff; on: [number, number]; off: [number, number]; px: number };
    const runs: Run[] = [];
    let patchProblem = "";
    // The time each part of the press took, one figure per run: the draws and the readings of the
    // shared baseline and planted move, and of each check, summed over the run's frames.
    // THE EIGHTH PART is everything in a run that is neither a draw nor a reading: making each frame's
    // edit, setting the progress words and keeping the books. Each part takes the stretch since the press's
    // mark, so the eight and the waits add up to the run.
    const PARTS = ["shared draws", "shared reading", "check 1 draws", "check 1 reading", "check 2 draws", "check 2 reading", "check 3 draws", "check 3 reading", "making each frame's edit and keeping the books"];
    const EDITS = PARTS[8];
    books(tally);
    for (let r = 1; r <= 3; r++) {
      const acc: Record<string, number> = {};
      let frameNo = 0;
      const draw = async (part: string, what: string, pr: EditParams): Promise<Uint8ClampedArray> => {
        frameNo++;
        progress(`Run ${r} of 3, frame ${frameNo} of 8: ${what}`);
        acc[EDITS] = (acc[EDITS] ?? 0) + lapMs(tally);
        await pause(tally);
        const f = dr.draw(pr);
        acc[part] = (acc[part] ?? 0) + lapMs(tally);
        await pause(tally);
        return f.data;
      };
      const read = <V,>(part: string, f: () => V): V => { const v = f(); acc[part] = (acc[part] ?? 0) + lapMs(tally); return v; };
      const B = await draw("shared draws", "the baseline", baseline);
      // THE PLANTED MOVE: the same photograph with its exposure raised a quarter, a pair known to differ.
      const M = await draw("shared draws", "the planted move, the exposure raised a quarter", { ...baseline, exposure: baseline.exposure * 1.25 });
      // 1. THE LOOK ROUND TRIP: one look's numbers applied from the opening baseline, drawn, applied again from the same baseline, drawn again.
      const A1 = await draw("check 1 draws", "check 1 of 3, a look applied, first time", { ...pictureParams(baseline), ...LOOK });
      const A2 = await draw("check 1 draws", "check 1 of 3, the same look applied, second time", { ...pictureParams(baseline), ...LOOK });
      // 2. A PRESS AT A SLIDER'S OWN VALUE: the exposure and the gains read back through the slider's grid, which moves nothing already on it.
      const B2 = await draw("check 2 draws", "check 2 of 3, a press at a slider's own value", { ...pictureParams(baseline), exposure: snapExposure(baseline.exposure), wb: baseline.wb.map(snapGain) as [number, number, number] });
      // 3. THE DIRECTION OF TEMPERATURE: a warmer white, set where the control sets it, with the swap on (the screen-side gains) and off (the camera gains).
      const onWarm = await draw("check 3 draws", "check 3 of 3, a warmer white with the swap on", { ...pictureParams(baseline), wbScreen: [WARM, 1, 1 / WARM] });
      const offBase = await draw("check 3 draws", "check 3 of 3, the swap off, before the warmer white", { ...pictureParams(baseline), swapRB: false });
      const offWarm = await draw("check 3 draws", "check 3 of 3, a warmer white with the swap off", { ...pictureParams(baseline), swapRB: false, wb: [baseline.wb[0] * WARM, baseline.wb[1], baseline.wb[2] / WARM] });
      progress(`Run ${r} of 3: reading the eight frames`);
      await pause(tally);
      const idxOn = read("check 3 reading", () => pickPatch(B)), idxOff = read("check 3 reading", () => pickPatch(offBase));
      if (idxOn.length < 50 || idxOff.length < 50) { patchProblem = `the picture has no near-neutral patch to read (${Math.min(idxOn.length, idxOff.length)} pixels)`; }
      runs.push({
        roundTrip: read("check 1 reading", () => diffFrames(A1, A2)), own: read("check 2 reading", () => diffFrames(B, B2)), planted: read("shared reading", () => diffFrames(B, M)),
        on: read("check 3 reading", () => [patchRedOverBlue(B, idxOn), patchRedOverBlue(onWarm, idxOn)] as [number, number]),
        off: read("check 3 reading", () => [patchRedOverBlue(offBase, idxOff), patchRedOverBlue(offWarm, idxOff)] as [number, number]),
        px: B.length / 4,
      });
      acc[EDITS] = (acc[EDITS] ?? 0) + lapMs(tally);
      for (const part of PARTS) timeStage(tally, part, acc[part] ?? 0);
    }
    progress("Writing the results");
    await pause(tally);
    const px = runs[0].px;
    const figs = (d: FrameDiff) => `worst ${d.worst}, ${d.over8} over 8, ${d.over24} over 24, ${d.moved} moved`;
    const plantedLine = (d: FrameDiff) => `${d.moved} pixels moved, worst ${d.worst}`;
    const frameCheck = (name: string, pick: (r: Run) => FrameDiff, expects: string, plantedWhat: string) => {
      const ds = runs.map(pick);
      // The planted move (exposure raised a quarter) reads worst 24 here, so it is trusted when it moves pixels past 8, not past 24.
      const trusted = runs.every((r) => r.planted.over8 > 0 && r.planted.moved > 0);
      const zero = ds.every((d) => d.worst === 0 && d.over8 === 0 && d.over24 === 0 && d.moved === 0);
      const verdict = !trusted ? "not trusted, the planted pair did not read as differing" : zero ? "as expected" : "NOT as expected";
      row(name,
        `${verdict} · largest difference ${MEDIAN_OF(ds.map((d) => d.worst))} of 255, ${MEDIAN_OF(ds.map((d) => d.over8))} over 8, ${MEDIAN_OF(ds.map((d) => d.over24))} over 24, ${MEDIAN_OF(ds.map((d) => d.moved))} of ${px} pixels moved (median of 3)`,
        `Expects: ${expects} No band is set; a figure above zero is printed, not forgiven. Planted pair first: ${plantedWhat} read ${runs.map((r) => plantedLine(r.planted)).join("; ")}, so the check sees a difference when there is one.`,
        runs.map((r, i) => `run ${i + 1}: ${figs(pick(r))}`).join(" · "));
    };
    frameCheck("Picture check: a look applied twice draws the same photograph", (r) => r.roundTrip,
      "zero in all four figures, since both draws are of the same numbers applied from the same baseline, by one chip, in one run.",
      "the baseline against itself with the exposure raised a quarter,");
    frameCheck("Picture check: a press at a slider's own value moves nothing", (r) => r.own,
      "zero pixels moved, since the exposure and the gains read back through the slider's grid are the values they already held.",
      "the same pair of draws,");
    const rise = (a: [number, number]) => a[1] > a[0];
    const pct = (a: [number, number]) => ((a[1] / a[0] - 1) * 100).toFixed(2);
    const risen = !patchProblem && runs.every((r) => rise(r.on) && rise(r.off));
    const mid = (f: (r: Run) => number) => MEDIAN_OF(runs.map(f));
    row("Picture check: a warmer white raises the patch's red over blue",
      patchProblem ? `not run · ${patchProblem}`
        : `${risen ? "as expected" : "NOT as expected"} · swap on: red over blue ${mid((r) => r.on[0]).toFixed(4)} to ${mid((r) => r.on[1]).toFixed(4)} (${mid((r) => (r.on[1] / r.on[0] - 1) * 100).toFixed(2)} percent); swap off: ${mid((r) => r.off[0]).toFixed(4)} to ${mid((r) => r.off[1]).toFixed(4)} (${mid((r) => (r.off[1] / r.off[0] - 1) * 100).toFixed(2)} percent) (median of 3)`,
      "Expects: the red over the blue of a near-neutral patch rises when the white is moved warmer, with the red and blue swap on and with it off, which is the statistic the Temperature walk reads. Only the direction is asked, never a size. The white is moved by a tenth in red and the inverse in blue, set on the screen-side gains with the swap on and on the camera gains with it off, which is where the control sets it. Planted pair first: a patch whose red was raised read 2.00 then 2.55, a rise (known), in the line above.",
      runs.map((r, i) => `run ${i + 1}: on ${r.on[0].toFixed(4)} to ${r.on[1].toFixed(4)} (${pct(r.on)} percent), off ${r.off[0].toFixed(4)} to ${r.off[1].toFixed(4)} (${pct(r.off)} percent)`).join(" · "));

    // HOW LONG EACH STAGE TOOK, beside the figures, and how many times the photograph was decoded and
    // the picture code built, which the press is asked to do once each.
    books(tally);
    const st = (k: string): number[] => tally.stages.get(k) ?? [];
    const printed = new Set<string>();
    const once = (name: string, keys: string[], meaning: string) => {
      keys.forEach((k) => printed.add(k));
      const l = keys.map((k) => st(k)[0]);
      row(`Time: ${name}`, l.every((v) => v !== undefined) ? `${dur(l.reduce((s, v) => s + v, 0))} (once)` : "not measured", meaning);
    };
    if (S === "picked photograph") {
      once("the picked photograph's decode", [`the ${S}'s file read and decode`], "The decode of the photograph you picked off the page's own thread, done once for the whole press and handed to every draw. The file was already in memory from the file input, so it has no read of its own.");
    } else {
      once("reading the practice photograph's file", ["reading the practice photograph's file"], "The practice photograph's file read into memory, before its decode.");
      once("the practice photograph's decode", ["the practice photograph's decode"], "The decode of the practice photograph off the page's own thread, done once for the whole press and handed to every draw.");
    }
    once("the picture code's build", ["the picture code's build"], "The picture code built on this chip, once for the whole press; every frame of every run is drawn through it.");
    once("the planted colour's source made and sent", ["the planted colour's pixel build", "the planted colour's upload to the chip"], "The planted colour's own small source made and uploaded to the chip, before its draws.");
    once("the picture code's first draw", [FIRST_DRAW], "One draw of the planted colour, made and thrown away before the one that is read, so whatever the chip pays the first time it draws is in this row and not in the planted colour's.");
    once("the planted colour, drawn and read back", ["the planted colour, drawn and read back"], "The planted colour's second draw, its read-back and conversion and the comparison of every pixel with what the picture code should give, before any check.");
    once("the checks' own planted pairs, tried", ["the checks' own planted pairs, tried"], "The comparator and the patch reader tried on pictures made here whose answers are known.");
    once("the photograph's pixels built", [`the ${S}'s pixel build`], "The photograph's pixels made from its decode, once, which every draw of the press then reads.");
    once("the photograph sent to the chip", [`the ${S}'s upload to the chip`], "The photograph's pixels uploaded to the chip, once, with the lens curve, rotation and flip set.");
    once("reading the chip's name", ["reading the chip's name"], "The throwaway canvas that names the graphics chip, before the first row.");
    once("taking the device report again", ["taking the device report again"], "The report of the device and the browser taken again at the press of the button, before the checks begin.");
    const wholeOf = (names: string[]): number[] => [0, 1, 2].map((i) => names.reduce((s, n) => s + (st(n)[i] ?? 0), 0));
    const timed = (name: string, drawKey: string, readKey: string, meaning: string) => {
      const draws = st(drawKey), reads = st(readKey), whole = wholeOf([drawKey, readKey]);
      printed.add(drawKey); printed.add(readKey);
      row(`Time: ${name}`,
        `whole ${dur(MEDIAN_OF(whole))}, first run ${dur(whole[0])}, of which renders and read-backs ${dur(MEDIAN_OF(draws))} and reading the figures ${dur(MEDIAN_OF(reads))} (median of 3)`,
        meaning, whole.map((w, i) => `run ${i + 1}: ${dur(w)}`).join(", "));
    };
    timed("the baseline and the planted move", "shared draws", "shared reading", "The two frames every check leans on: the baseline and the planted move, with their comparison.");
    timed("check 1, a look applied twice", "check 1 draws", "check 1 reading", "The two renders and read-backs of the check and the comparison of the two.");
    timed("check 2, a press at a slider's own value", "check 2 draws", "check 2 reading", "The one render and read-back of the check and its comparison with the baseline.");
    timed("check 3, a warmer white", "check 3 draws", "check 3 reading", "The three renders and read-backs of the check and its two patch readings.");
    {
      printed.add(EDITS);
      const whole = st(EDITS);
      row("Time: making each frame's edit and keeping the books",
        `whole ${dur(MEDIAN_OF(whole))}, first run ${dur(whole[0] ?? 0)} (median of 3)`,
        "Everything in a run that is neither a draw nor a reading: the edit made for each of the eight frames, the progress words set and the run's figures put away.",
        whole.map((w, i) => `run ${i + 1}: ${dur(w)}`).join(", "));
    }
    row("Time: waiting for the screen to draw",
      `${dur(tally.waitMs)} in all, over ${tally.waits} ${tally.waits === 1 ? "wait" : "waits"}`,
      "The zero-delay waits the press makes so the progress line can draw, between its stages and its frames, all in this one row.");
    row("Time: writing rows and words outside the runs", `${dur(tally.books)} (in all)`,
      "The press writing its own rows and progress words between stages, outside the three runs: the stretches that are only bookkeeping.");
    row("Done in this press: waits skipped with the page hidden",
      `${tally.hidden} ${tally.hidden === 1 ? "wait" : "waits"} skipped with the page hidden`,
      "While the page is hidden a browser stops animation frames and throttles timers to seconds, so the press makes no wait then and goes straight on. Zero here means the page was in front for the whole press.");
    for (const k of tally.stages.keys()) {
      if (printed.has(k) || k === TAIL_STAGE) continue;
      row(`Time: ${k}`, `${dur(st(k).reduce((s, v) => s + v, 0))} (in all)`, "A stretch of the press that has no row of its own above.");
    }
    const photographUses = tally.uses[S] ?? 0;
    const onceEach = tally.decodes === 1 && tally.builds === 1 && photographUses === 1;
    row("Done in this press: the photograph decoded, the picture code built",
      `${onceEach ? "once each, as asked" : "NOT once each"} · the ${S} decoded ${tally.decodes} ${tally.decodes === 1 ? "time" : "times"}, the picture code built ${tally.builds} ${tally.builds === 1 ? "time" : "times"}, the photograph's pixels built ${photographUses} ${photographUses === 1 ? "time" : "times"}`,
      "Counted where each happens in this section, over every frame of the three runs, so once each is read here and not assumed. The planted colour's own small source is not the photograph and is not counted with it.");
    return true;
  } catch (e) {
    row("The three picture checks", "not run", `${(e as Error).message}.`);
    return false;
  } finally {
    drawing?.close();
    lap(tally, TAIL_STAGE);
  }
}

// --- THE SEPARATION CHECK (records 084 and 106) -----------------------------------------------------------------------------
// The premise it measures: after the red and blue swap, the populations of a scene (sky, foliage, built things, water) fall
// into hue ranges of their own, and each range can be turned alone with no mask. The page draws the picked photograph with
// the swap on and no look at three white points, finds the hue ranges the DRAWN pixels fall into by a stated rule, paints a
// map of them, turns each range in place, and prints every range's figures. It sets nothing: the three white points, the
// floor, the rule and the turns' targets are the ones named below and each is printed. It runs once; nothing here is timed
// against a band. The pixels it reads are the drawn display pixels (what the reader sees), thinned to about a million.

/** The hue bins: 72 of five degrees. */
const SEP_BINS = 72;
const SEP_BIN_DEG = 5;
/** The hue the foliage's cluster is turned to, and the sky's, as the record states the film's two hues. */
const SEP_TARGET_FOLIAGE = 335;
const SEP_TARGET_SKY = 215;
/** The soft edge at each end of a turned cluster, in degrees, and the share of the pixels above the floor under which a run is no cluster. */
const SEP_SOFT_EDGE = 10;
const SEP_MIN_SHARE = 0.01;
/** The most pixels the analysis reads: a frame larger than this is thinned by taking every k-th pixel of every k-th row. */
const SEP_PIXELS_MAX = 1.2e6;
/** The colours of the class map, which differ in lightness as well as hue, with their names for the legend. */
const SEP_COLOURS: { name: string; rgb: [number, number, number] }[] = [
  { name: "orange", rgb: [230, 159, 0] }, { name: "sky blue", rgb: [86, 180, 233] }, { name: "green", rgb: [0, 158, 115] },
  { name: "yellow", rgb: [240, 228, 66] }, { name: "dark blue", rgb: [0, 114, 178] }, { name: "red-orange", rgb: [213, 94, 0] },
  { name: "pink", rgb: [204, 121, 167] }, { name: "white", rgb: [255, 255, 255] },
];

interface SepCluster { letter: string; colour: string; startDeg: number; spanDeg: number; count: number; share: number; medHue: number; medSat: number; medVal: number }
interface SepHues { w: number; h: number; hue: Float32Array; sat: Float32Array; val: Float32Array; hist: number[]; above: number }
interface SepAnalysis extends SepHues { clusters: SepCluster[]; binCluster: Int8Array; clusterOf: Int8Array }

/** Takes a frame's RGBA bytes and its size. Returns each pixel's HSV hue (degrees), saturation and value, the 72-bin hue count of
 *  the pixels whose saturation is at or above the floor `SAT_GUARD_LO`, and how many those are. What it must satisfy: a pixel
 *  below the floor is in no bin. */
function huePass(data: Uint8ClampedArray, w: number, h: number): SepHues {
  const n = w * h;
  const hue = new Float32Array(n), sat = new Float32Array(n), val = new Float32Array(n);
  const hist: number[] = new Array(SEP_BINS).fill(0);
  let above = 0;
  for (let i = 0; i < n; i++) {
    const r = data[4 * i], g = data[4 * i + 1], b = data[4 * i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hh = 0;
    if (d > 0) {
      hh = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
      hh *= 60;
      if (hh < 0) hh += 360;
    }
    const s = mx > 0 ? d / mx : 0;
    hue[i] = hh; sat[i] = s; val[i] = mx / 255;
    if (s >= SAT_GUARD_LO) { above++; hist[Math.min(SEP_BINS - 1, Math.floor(hh / SEP_BIN_DEG))]++; }
  }
  return { w, h, hue, sat, val, hist, above };
}

/** The clustering rule of the check. Takes the 72-bin hue count and the number of pixels above the floor. Returns the clusters as runs
 *  of bins, largest first, at most eight. The rule: a bin is a peak when it holds pixels and at least as many as both neighbours (the
 *  circle wraps); a bin is a valley when it is no peak and holds under one tenth of the smaller of the two nearest peaks, one found
 *  going each way round; a cluster is the run of bins between two valleys; a run holding under one percent of the pixels above the
 *  floor is not a cluster. What it must satisfy: runs share no bin. */
function findClusters(hist: number[], above: number): { start: number; len: number; count: number }[] {
  const n = SEP_BINS;
  const peak = hist.map((c, i) => c > 0 && c >= hist[(i + n - 1) % n] && c >= hist[(i + 1) % n]);
  if (!peak.some(Boolean)) return [];
  const nearest = (i: number, dir: number): number => {
    for (let d = 1; d <= n; d++) { const j = (((i + dir * d) % n) + n) % n; if (peak[j]) return hist[j]; }
    return 0;
  };
  const valley = hist.map((c, i) => !peak[i] && c < 0.1 * Math.min(nearest(i, -1), nearest(i, 1)));
  const first = valley.indexOf(true);
  const runs: { start: number; len: number; count: number }[] = [];
  if (first < 0) runs.push({ start: 0, len: n, count: above });
  else {
    let cur: { start: number; len: number; count: number } | null = null;
    for (let d = 1; d <= n; d++) {
      const i = (first + d) % n;
      if (valley[i]) { if (cur) { runs.push(cur); cur = null; } }
      else { if (!cur) cur = { start: i, len: 0, count: 0 }; cur.len++; cur.count += hist[i]; }
    }
    if (cur) runs.push(cur);
  }
  return runs.filter((r) => r.count >= SEP_MIN_SHARE * above).sort((a, b) => b.count - a.count).slice(0, SEP_COLOURS.length);
}

/** The place in a histogram where the running count first reaches half of `total`. Takes the histogram and the total. Returns the bin. */
function histMedian(hist: ArrayLike<number>, total: number): number {
  let acc = 0;
  for (let i = 0; i < hist.length; i++) { acc += hist[i]; if (acc * 2 >= total) return i; }
  return Math.max(0, hist.length - 1);
}

/** Takes the hue pass. Returns it with its clusters (each with its hue range, share, median hue, median saturation and median value) and
 *  the class of every pixel: minus one below the floor, minus two above it and in no cluster, otherwise the cluster's index. */
function clusterPass(p: SepHues): SepAnalysis {
  const runs = findClusters(p.hist, p.above);
  const binCluster = new Int8Array(SEP_BINS).fill(-1);
  runs.forEach((r, k) => { for (let j = 0; j < r.len; j++) binCluster[(r.start + j) % SEP_BINS] = k; });
  const n = p.w * p.h;
  const clusterOf = new Int8Array(n);
  const fine = runs.map(() => new Uint32Array(360)), sH = runs.map(() => new Uint32Array(100)), vH = runs.map(() => new Uint32Array(100));
  const count = runs.map(() => 0);
  for (let i = 0; i < n; i++) {
    if (p.sat[i] < SAT_GUARD_LO) { clusterOf[i] = -1; continue; }
    const k = binCluster[Math.min(SEP_BINS - 1, Math.floor(p.hue[i] / SEP_BIN_DEG))];
    if (k < 0) { clusterOf[i] = -2; continue; }
    clusterOf[i] = k;
    count[k]++;
    fine[k][Math.min(359, Math.floor((p.hue[i] - runs[k].start * SEP_BIN_DEG + 360) % 360))]++;
    sH[k][Math.min(99, Math.floor(p.sat[i] * 100))]++;
    vH[k][Math.min(99, Math.floor(p.val[i] * 100))]++;
  }
  const clusters: SepCluster[] = runs.map((r, k) => {
    const startDeg = r.start * SEP_BIN_DEG;
    return {
      letter: String.fromCharCode(65 + k), colour: SEP_COLOURS[k].name, startDeg, spanDeg: r.len * SEP_BIN_DEG, count: count[k],
      share: p.above ? count[k] / p.above : 0,
      medHue: (startDeg + histMedian(fine[k], count[k]) + 0.5) % 360,
      medSat: (histMedian(sH[k], count[k]) + 0.5) / 100, medVal: (histMedian(vH[k], count[k]) + 0.5) / 100,
    };
  });
  return { ...p, clusters, binCluster, clusterOf };
}

/** The cluster a point lies in. Takes the analysis and a point as fractions of the width and the height. Returns the index of the cluster
 *  most common among the clustered pixels of the five by five patch round it, or minus one when none of them is clustered. */
function clusterAt(a: SepAnalysis, fx: number, fy: number): number {
  const cx = Math.round(fx * (a.w - 1)), cy = Math.round(fy * (a.h - 1));
  const tally = new Map<number, number>();
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
    const x = Math.min(a.w - 1, Math.max(0, cx + dx)), y = Math.min(a.h - 1, Math.max(0, cy + dy));
    const k = a.clusterOf[y * a.w + x];
    if (k >= 0) tally.set(k, (tally.get(k) ?? 0) + 1);
  }
  let best = -1, bestN = 0;
  for (const [k, c] of tally) if (c > bestN) { best = k; bestN = c; }
  return best;
}

/** The class map. Takes the analysis. Returns RGBA bytes of its size: grey below the floor, a dotted pattern for pixels above it in no
 *  cluster, each cluster's colour otherwise, and for each cluster the middle of its pixels, where its letter is drawn. */
function classMap(a: SepAnalysis): { data: Uint8ClampedArray; labels: { letter: string; x: number; y: number }[] } {
  const out = new Uint8ClampedArray(a.w * a.h * 4);
  const sx = a.clusters.map(() => 0), sy = a.clusters.map(() => 0), sn = a.clusters.map(() => 0);
  for (let y = 0; y < a.h; y++) for (let x = 0; x < a.w; x++) {
    const i = y * a.w + x, o = 4 * i, k = a.clusterOf[i];
    let c: [number, number, number];
    if (k === -1) c = [128, 128, 128];
    else if (k === -2) c = (x + y) % 8 < 3 ? [40, 40, 40] : [215, 215, 215];
    else { c = SEP_COLOURS[k].rgb; sx[k] += x; sy[k] += y; sn[k]++; }
    out[o] = c[0]; out[o + 1] = c[1]; out[o + 2] = c[2]; out[o + 3] = 255;
  }
  return { data: out, labels: a.clusters.map((c, k) => ({ letter: c.letter, x: sn[k] ? sx[k] / sn[k] : 0, y: sn[k] ? sy[k] / sn[k] : 0 })) };
}

/** Writes a colour given as hue, saturation and value into RGBA bytes. Takes the bytes, the offset and the three. Returns nothing. */
function putHsv(out: Uint8ClampedArray, o: number, h: number, s: number, v: number): void {
  const c = v * s, hh = (((h % 360) + 360) % 360) / 60, x = c * (1 - Math.abs((hh % 2) - 1)), m = v - c;
  let r = 0, g = 0, b = 0;
  if (hh < 1) { r = c; g = x; } else if (hh < 2) { r = x; g = c; } else if (hh < 3) { g = c; b = x; }
  else if (hh < 4) { g = x; b = c; } else if (hh < 5) { r = x; b = c; } else { r = c; b = x; }
  out[o] = (r + m) * 255; out[o + 1] = (g + m) * 255; out[o + 2] = (b + m) * 255; out[o + 3] = 255;
}

/** Turns clusters in place. Takes the frame's bytes, its analysis and `shiftOf`, which gives the degrees a cluster turns by or null to
 *  hold it. Returns new bytes in which each turned cluster's pixels carry their hue plus the shift, scaled to nothing over the first and
 *  last ten degrees of the cluster (the soft edge, held to half the cluster's span when it is narrower), with saturation and value as
 *  they were; every other pixel, and every pixel below the floor, is copied unchanged. What it must satisfy: a cluster held gives back
 *  its pixels byte for byte. */
function turnClusters(src: Uint8ClampedArray, a: SepAnalysis, shiftOf: (k: number) => number | null): Uint8ClampedArray {
  const out = new Uint8ClampedArray(src);
  for (let i = 0; i < a.w * a.h; i++) {
    const k = a.clusterOf[i];
    if (k < 0) continue;
    const d = shiftOf(k);
    if (d === null) continue;
    const c = a.clusters[k];
    const rel = (a.hue[i] - c.startDeg + 360) % 360;
    const edge = Math.min(SEP_SOFT_EDGE, c.spanDeg / 2);
    const wgt = edge > 0 ? Math.min(1, Math.max(0, Math.min(rel, c.spanDeg - rel) / edge)) : 1;
    if (wgt > 0) putHsv(out, 4 * i, a.hue[i] + wgt * d, a.sat[i], a.val[i]);
  }
  return out;
}

/** The degrees from one hue to another by the short way round. Takes the two hues. Returns a number in minus 180 to 180. */
const shortWay = (from: number, to: number): number => ((((to - from) % 360) + 540) % 360) - 180;

/** Takes a drawn frame. Returns it thinned to at most `SEP_PIXELS_MAX` pixels by taking every k-th pixel of every k-th row, with k and the
 *  size it came from. */
function thin(f: { data: Uint8ClampedArray; width: number; height: number }): { data: Uint8ClampedArray; w: number; h: number; k: number; fromW: number; fromH: number } {
  const k = Math.max(1, Math.ceil(Math.sqrt((f.width * f.height) / SEP_PIXELS_MAX)));
  const w = Math.floor(f.width / k), h = Math.floor(f.height / k);
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (y * k * f.width + x * k) * 4, o = (y * w + x) * 4;
    data[o] = f.data[s]; data[o + 1] = f.data[s + 1]; data[o + 2] = f.data[s + 2]; data[o + 3] = 255;
  }
  return { data, w, h, k, fromW: f.width, fromH: f.height };
}

// --- THE SEPARATION MEASURE (records 084 and 106; IR-SCIENCE.md section 6) ----------------------------------------------------
// The thinned pixels of a photograph are labelled once, by the rule the gather of 8 November used: sky where the app's own sky
// selection reads at least the sky weight at the pixel's position; else neutral where the opening render's saturation is under the
// floor; else foliage where the vegetation axis, the balanced red less the green over the green, taken on the linear copy at the
// opening gains, is at most the foliage threshold; else other. Every setting's counts are then split by label, and the distance
// between the sky's and the foliage's hue histograms is the Hellinger distance, with each population's circular mean hue and
// resultant length, the angle between the two means, and the neutral population carried beside as the control. The four figures
// (the floor, the sky weight, the foliage threshold and the colourless share) are the measure's own and are printed with every result.

/** The share of the sky selection's weight at which a thinned pixel is sky, the foliage threshold of the vegetation axis, and the share of
 *  a population's own pixels at or above the floor under which it is colourless. The measure's own figures; no source gives them. */
const SEP_SKY_WEIGHT = 0.5;
const SEP_FOLIAGE_INDEX_MAX = -0.05;
const SEP_COLOURLESS_SHARE = 0.01;
/** The four labels, in the order their codes run. */
const SEP_LABELS = ["sky", "neutral", "foliage", "other"] as const;
/** The four figures of the measure in words, printed beside the settings. */
const SEP_FIGURES = `floor ${SAT_GUARD_LO} · sky weight ${SEP_SKY_WEIGHT} · vegetation index at most ${SEP_FOLIAGE_INDEX_MAX} · a population is colourless under ${SEP_COLOURLESS_SHARE * 100} percent of its pixels at or above the floor`;

/** What the label pass gave: the label code of every thinned pixel (0 sky, 1 neutral, 2 foliage, 3 other), the count of each, whether the sky
 *  selection found a sky and its note in words, and whether the vegetation axis could be read (a linear camera copy at the drawn size). */
interface SepLabels { lab: Uint8Array; counts: number[]; skyFound: boolean; skyNote: string; hasAxis: boolean }
/** One population's counts at one setting: its pixels, those at or above the floor and its 72-bin hue count over those. */
interface SepPop { n: number; above: number; hist: number[] }
/** One population's figures: its counts, its share of its own pixels at or above the floor (null for no pixels), and its circular mean hue in
 *  degrees and resultant length from zero to one (null where undefined). */
interface SepFigures { n: number; above: number; share: number | null; mean: number | null; length: number | null }
/** The measure at one setting: the four populations' figures, the whole frame's circular mean and length, the Hellinger distance between the
 *  sky and the foliage (null where undefined), the angle between their means from 0 to 180 (null where undefined) and, where the distance is
 *  undefined, the reason in words. */
interface SepMeasure { pops: SepFigures[]; wholeMean: number | null; wholeLength: number | null; distance: number | null; arc: number | null; why: string | null }

/** Builds the app's own sky selection headless from a decode. Takes the decoded photograph. Returns the refined bitmap, or the coarse one when
 *  there is no refinement, or null when no clear sky was found or the build threw, with a note in words. What it must satisfy: it is the
 *  selection the editor reads (`buildSkySelectionFrom` over `prepareSkySource` at the file's own turn), built at gray-world balance and
 *  nothing else; the page draws the photograph at turn zero, the sensor's own orientation, in which the selection's positions are given. */
function buildSepSky(img: DecodedImage): { mask: BrushMask | null; note: string } {
  try {
    const sel = buildSkySelectionFrom(prepareSkySource(img), true);
    const mask = sel.fine ?? sel.mask;
    return mask ? { mask, note: "the app's own sky selection found a sky" } : { mask: null, note: "no sky selection: the app's own selection found no clear sky" };
  } catch (e) {
    return { mask: null, note: `no sky selection: it could not be built (${(e as Error).message})` };
  }
}

/** Says the panel's keying in words, the same words the editor's Sky and Foliage headings use.
 *  @param k  the keying (`keyPanelCentres`' result).
 *  @returns each box as a degree "from this photograph" or "by name", and the arc between the two centres in degrees (the smaller way round, 0 to 180) where both are degrees, else a line saying why there is none.
 *  What the result must satisfy: it reads only `k`; it is one string with no vertical bar and no separator the sweep row's walk regexes read, so it sits in a sweep row's first segment (consumers: the first picture's keying row and each drawn sweep row). */
function panelKeyWords(k: PanelKeyed): string {
  const one = (name: string, deg: number | null): string => (deg === null ? `${name} by name` : `${name} ${deg.toFixed(1)} degrees, from this photograph`);
  let arc = "no arc, a box is keyed by name";
  if (k.sky !== null && k.foliage !== null) {
    const d = Math.abs(k.sky - k.foliage) % 360;
    arc = `arc ${(d > 180 ? 360 - d : d).toFixed(1)} degrees`;
  }
  return `${one("Sky", k.sky)}, ${one("Foliage", k.foliage)}, ${arc}`;
}

/** Labels the thinned pixels of the first picture. Takes that picture (thinned from the frame at the opening balance with the swap on), the
 *  sky bitmap or null, the decode, the opening gains and the sky note. Returns the labels by the rule above. What it must satisfy: the
 *  position of a pixel is ((column times the stride plus one half) over the drawn width, (row times the stride plus one half) over the drawn
 *  height), as the gather read it; a pixel is read on the linear copy only when the drawn frame is the copy's own size, else no pixel is
 *  foliage and `hasAxis` is false; the four counts add to the pixels. Consumers: `labelledStats` and the rows that print the shares. */
function labelPixels(first: ReturnType<typeof thin>, mask: BrushMask | null, img: DecodedImage, gains: [number, number, number], skyNote: string): SepLabels {
  const { w, h, k, fromW, fromH } = first;
  const n = w * h;
  const lab = new Uint8Array(n);
  const counts = [0, 0, 0, 0];
  const lin = img.isRaw && img.linear && img.width === fromW && img.height === fromH ? img.linear : null;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = 4 * i;
      const r = first.data[o], g = first.data[o + 1], b = first.data[o + 2];
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
      const s = mx > 0 ? (mx - mn) / mx : 0;
      let code = 3;
      if (mask && sampleBrush(mask, (x * k + 0.5) / fromW, (y * k + 0.5) / fromH) >= SEP_SKY_WEIGHT) code = 0;
      else if (s < SAT_GUARD_LO) code = 1;
      else if (lin) {
        const q = (y * k * fromW + x * k) * 4;
        const rr = lin[q] * gains[0], gg = lin[q + 1] * gains[1];
        const idx = gg > 1e-4 ? (rr - gg) / gg : 0;
        if (idx <= SEP_FOLIAGE_INDEX_MAX) code = 2;
      }
      lab[i] = code;
      counts[code]++;
    }
  }
  return { lab, counts, skyFound: !!mask, skyNote, hasAxis: !!lin };
}

/** Splits one hue pass by label. Takes the pass of a drawn, thinned frame and the labels. Returns the four populations' counts. What it must
 *  satisfy: the pass and the labels are of the same thinned size (else it throws, because a label would then sit on the wrong pixel); the
 *  four populations' pixels add to the pass's pixels and their hue counts add to the pass's own hue count, which is `huePass`'s. */
function labelledStats(hp: SepHues, labels: SepLabels): SepPop[] {
  if (hp.sat.length !== labels.lab.length) throw new Error("the labels and the counted frame are not the same size");
  const pops: SepPop[] = SEP_LABELS.map(() => ({ n: 0, above: 0, hist: new Array(SEP_BINS).fill(0) }));
  for (let i = 0; i < labels.lab.length; i++) {
    const p = pops[labels.lab[i]];
    p.n++;
    if (hp.sat[i] >= SAT_GUARD_LO) { p.above++; p.hist[Math.min(SEP_BINS - 1, Math.floor(hp.hue[i] / SEP_BIN_DEG))]++; }
  }
  return pops;
}

/** The circular mean hue and resultant length of a 72-bin hue count. Takes the count. Returns the argument of the sum of the bins' unit
 *  vectors, each at its bin's centre, in degrees from 0 up to 360, and the length of that sum over the count's total, from 0 to 1; both
 *  null for an empty count, and the mean null with a length of 0 where the vectors cancel. What it must satisfy: a count in one bin gives
 *  that bin's centre and a length of 1. */
function circularOf(hist: ArrayLike<number>): { mean: number | null; length: number | null } {
  let c = 0, s = 0, tot = 0;
  for (let i = 0; i < hist.length; i++) {
    const a = ((i + 0.5) * SEP_BIN_DEG * Math.PI) / 180;
    c += hist[i] * Math.cos(a); s += hist[i] * Math.sin(a); tot += hist[i];
  }
  if (!tot) return { mean: null, length: null };
  const length = Math.hypot(c, s) / tot;
  if (length < 1e-9) return { mean: null, length: 0 };
  let mean = (Math.atan2(s, c) * 180) / Math.PI;
  if (mean < 0) mean += 360;
  return { mean, length };
}

/** The Hellinger distance between two counts. Takes the two 72-bin hue counts. Returns the square root of one minus the sum over the bins of
 *  the square root of the product of the two normalised shares, from 0 for the same distribution to 1 for two sharing no bin, or null when
 *  either count is empty. What it must satisfy: bounded from 0 to 1, symmetric, and 0 for equal counts up to rounding. */
function hellinger(a: ArrayLike<number>, b: ArrayLike<number>): number | null {
  let ta = 0, tb = 0;
  for (let i = 0; i < a.length; i++) { ta += a[i]; tb += b[i]; }
  if (!ta || !tb) return null;
  let bc = 0;
  for (let i = 0; i < a.length; i++) bc += Math.sqrt((a[i] / ta) * (b[i] / tb));
  return Math.sqrt(Math.max(0, 1 - bc));
}

/** The measure at one setting. Takes the four populations' counts in the order sky, neutral, foliage, other. Returns the figures of each, the
 *  whole frame's circular mean, and the Hellinger distance between the sky and the foliage with the angle between their means. What it must
 *  satisfy: a population with fewer than one in a hundred of its own pixels at or above the floor is colourless, and one with no pixels has
 *  none to compare, so the distance and the angle are null there and `why` names the population, never a number in the distance's place. */
function sepMeasure(pops: SepPop[]): SepMeasure {
  const figs: SepFigures[] = pops.map((p) => {
    const c = circularOf(p.hist);
    return { n: p.n, above: p.above, share: p.n ? p.above / p.n : null, mean: c.mean, length: c.length };
  });
  const all = new Array(SEP_BINS).fill(0);
  for (const p of pops) for (let i = 0; i < SEP_BINS; i++) all[i] += p.hist[i];
  const wc = circularOf(all);
  const none: string[] = [], pale: string[] = [];
  for (const [code, name] of [[0, "sky"], [2, "foliage"]] as const) {
    const f = figs[code];
    if (!f.n) none.push(name);
    else if ((f.share ?? 0) < SEP_COLOURLESS_SHARE) pale.push(name);
  }
  const parts: string[] = [];
  if (none.length) parts.push(`no pixel is labelled ${none.join(" or ")}`);
  if (pale.length) parts.push(`colourless: ${pale.join(" and ")}`);
  if (parts.length) return { pops: figs, wholeMean: wc.mean, wholeLength: wc.length, distance: null, arc: null, why: parts.join("; ") };
  const distance = hellinger(pops[0].hist, pops[2].hist);
  const m0 = figs[0].mean, m2 = figs[2].mean;
  let arc: number | null = null;
  if (m0 !== null && m2 !== null) { const d = Math.abs(m0 - m2) % 360; arc = d > 180 ? 360 - d : d; }
  return { pops: figs, wholeMean: wc.mean, wholeLength: wc.length, distance, arc, why: distance === null ? "a hue count was empty" : null };
}

/** One population's figures in words. Takes its name, its figures and the word for its part ("" or "the control, "). Returns one phrase:
 *  its count, its share at or above the floor, its circular mean hue and its resultant length as a percent, or what is missing. */
function popWords(name: string, f: SepFigures, part: string): string {
  if (!f.n) return `${part}${name}: no pixels`;
  const head = `${part}${name}: ${f.n} pixels, ${((f.share ?? 0) * 100).toFixed(1)} percent of them at or above the floor (${f.above})`;
  return f.mean === null ? `${head}, no mean hue` : `${head}, circular mean hue ${f.mean.toFixed(1)} degrees, resultant length ${((f.length ?? 0) * 100).toFixed(1)} percent`;
}

/** The measure in words, for a row. Takes the measure. Returns the sky, the foliage and the other population, the neutral population as the
 *  control, the whole frame's mean, and the distance from sky to foliage to four places with the angle between the means, or the word
 *  undefined with the reason (the word colourless naming the population). */
function sepWords(m: SepMeasure): string {
  const dist = m.distance === null
    ? `sky to foliage distance undefined (${m.why})`
    : `sky to foliage Hellinger distance ${m.distance.toFixed(4)}, angle between the circular means ${m.arc === null ? "undefined" : `${m.arc.toFixed(1)} degrees`}`;
  const whole = `whole frame: ${m.wholeMean === null ? "no mean hue" : `circular mean hue ${m.wholeMean.toFixed(1)} degrees, resultant length ${((m.wholeLength ?? 0) * 100).toFixed(1)} percent`}`;
  return `${popWords("sky", m.pops[0], "")} · ${popWords("foliage", m.pops[2], "")} · ${popWords("other", m.pops[3], "")} · ${popWords("neutral", m.pops[1], "the control, ")} · ${whole} · ${dist}`;
}

/** Tries the measure on counts made here whose answers are known. Takes nothing. Returns whether every known figure was read (two equal
 *  counts a distance of 0, two sharing no bin a distance of 1, two sharing half their mass the square root of one half, a count in one bin
 *  its bin's centre and a length of 1, and a population under one in a hundred colourless with no number in the distance's place), with the
 *  sentence for the row. What it must satisfy: it runs `sepMeasure`, the function the rows use, and false stops the check, because a
 *  measure that does not read a known figure is not to be trusted on a photograph. */
function plantedMeasure(): { ok: boolean; value: string; meaning: string } {
  const pop = (n: number, bins: [number, number][]): SepPop => {
    const hist: number[] = new Array(SEP_BINS).fill(0);
    let above = 0;
    for (const [b, c] of bins) { hist[b] += c; above += c; }
    return { n, above, hist };
  };
  const empty = pop(0, []);
  const same = sepMeasure([pop(1000, [[10, 100], [11, 50]]), empty, pop(1000, [[10, 100], [11, 50]]), empty]);
  const apart = sepMeasure([pop(1000, [[10, 200]]), empty, pop(1000, [[40, 200]]), empty]);
  const half = sepMeasure([pop(1000, [[10, 100], [11, 100]]), empty, pop(1000, [[11, 100], [12, 100]]), empty]);
  const one = circularOf(pop(1000, [[10, 200]]).hist);
  const pale = sepMeasure([pop(1000, [[10, 200]]), empty, pop(1000, [[40, 5]]), empty]);
  const okSame = same.distance !== null && Math.abs(same.distance) < 1e-6;
  const okApart = apart.distance !== null && Math.abs(apart.distance - 1) < 1e-9;
  const okHalf = half.distance !== null && Math.abs(half.distance - Math.sqrt(0.5)) < 1e-9;
  const okOne = one.mean !== null && one.length !== null && Math.abs(one.mean - 52.5) < 1e-6 && Math.abs(one.length - 1) < 1e-9;
  const okPale = pale.distance === null && pale.arc === null && /colourless: foliage/.test(pale.why ?? "");
  const ok = okSame && okApart && okHalf && okOne && okPale;
  return {
    ok,
    value: `${ok ? "read as known" : "did not read as known"} · equal counts ${same.distance === null ? "undefined" : same.distance.toFixed(4)} (known 0.0000) · counts sharing no bin ${apart.distance === null ? "undefined" : apart.distance.toFixed(4)} (known 1.0000) · counts sharing half their mass ${half.distance === null ? "undefined" : half.distance.toFixed(4)} (known 0.7071) · one bin's mean ${one.mean === null ? "undefined" : one.mean.toFixed(1)} degrees, length ${one.length === null ? "undefined" : one.length.toFixed(2)} (known 52.5 and 1.00) · a population with 5 of 1000 pixels at or above the floor ${okPale ? "read colourless, with no distance" : "did not read colourless"}`,
    meaning: "The separation measure, tried first on hue counts made here whose answers are known, by the same function the rows use: two equal counts must be 0 apart, two sharing no bin 1 apart, two sharing half their mass the square root of one half, a count in one bin must have that bin's centre for its mean and a length of 1, and a population with fewer than one pixel in a hundred at or above the floor must be called colourless and given no distance. A measure that cannot fail would pass anything.",
  };
}

// --- WHAT THE DRAWING SURFACE GAVE BACK, AND A PLANTED COLOURED PICTURE THROUGH THE PHOTOGRAPH'S OWN PATH (record 106) -----------
// An iPad with 8 cores under Safari 26.6.3 read every pixel of a photograph as colourless in all 82 sweep rows while the planted
// colour (an 8-bit picture) read back exactly. The two differ in the source: the colour is uploaded as 8-bit bytes and the photograph
// as a linear float source. These rows print what the drawing surface and its context gave back for the photograph, and the planted
// coloured picture goes through the photograph's own path (a linear float source, the same upload call, the same draw, the same
// read-back, the same thinning and counting), so a device that reads the photograph as colourless says in numbers where the colour went.

/** A GL error code in words. Takes the code (0 for none, -1 when the context could not be reached). Returns its name and number. */
function glErrWords(e: number): string {
  if (e === 0) return "none";
  if (e === -1) return "the context could not be reached";
  const names: Record<number, string> = { 1280: "INVALID_ENUM", 1281: "INVALID_VALUE", 1282: "INVALID_OPERATION", 1285: "OUT_OF_MEMORY", 1286: "INVALID_FRAMEBUFFER_OPERATION", 37442: "CONTEXT_LOST_WEBGL" };
  return `${names[e] ?? "an unnamed code"} (${e})`;
}
const FB_STATUS_WORDS: Record<number, string> = { 36053: "complete", 36054: "incomplete attachment", 36055: "missing attachment", 36057: "incomplete dimensions", 36061: "unsupported" };
const GL_FORMAT_WORDS: Record<number, string> = { 6408: "RGBA", 6407: "RGB", 6403: "RED" };
const GL_TYPE_WORDS: Record<number, string> = { 5121: "UNSIGNED_BYTE", 5126: "FLOAT", 5131: "HALF_FLOAT", 5123: "UNSIGNED_SHORT" };
const yesNo = (b: boolean): string => (b ? "yes" : "no");

/** Writes four rows saying what the drawing surface's context gave back. Takes the words for when it was read ("after the
 *  photograph's first draw") and the surface's `DrawProbe`. Returns nothing. What it must satisfy: every row names a format, a type or
 *  an error, so a report that reads colourless says what the chip was given and what it gave back. */
function probeRows(when: string, d: DrawProbe): void {
  row(`Drawing surface, ${when}: the upload`,
    `${d.source} · texture internal format ${d.internal}, format ${d.format}, type ${d.type} · first error after the upload: ${glErrWords(d.errUpload)}`,
    "What the drawing surface sent the chip for its source. The format and type are the ones the renderer's setImage named in the upload call it made, recorded on the line before the call and read back from the renderer; they are not inferred from an extension.");
  row(`Drawing surface, ${when}: the draw and the read-back`,
    `drawn into the canvas's own framebuffer, ${d.drawingBuffer[0]} by ${d.drawingBuffer[1]}, status ${FB_STATUS_WORDS[d.fbStatus] ?? d.fbStatus} · the read-back asks for RGBA and UNSIGNED_BYTE and the context offers ${GL_FORMAT_WORDS[d.readFormat] ?? d.readFormat} and ${GL_TYPE_WORDS[d.readType] ?? d.readType} · first error after the draw: ${glErrWords(d.errDraw)} · after the read-back: ${glErrWords(d.errRead)} · the context is ${d.lost ? "LOST" : "alive"}`,
    "The framebuffer the frame is drawn into, the format and type of the read-back and the first error the context raised after each step.");
  row(`Drawing surface, ${when}: what the context supports`,
    `float colour buffer offered ${yesNo(d.colorBufferFloat)} · float texture linear filtering granted to the renderer ${yesNo(d.floatLinear)} · largest texture ${d.maxTexture} pixels`,
    "Whether the context offers the float colour buffer extension, whether the renderer was granted float texture linear filtering at its start, and the largest texture the chip accepts.");
  row(`Drawing surface, ${when}: the read-back's bytes before the display-P3 conversion`,
    d.rawGrid.length ? d.rawGrid.map((c) => `(${c[0]}, ${c[1]}) ${c[2]}, ${c[3]}, ${c[4]}`).join(" · ") : "no frame has been read back yet",
    "The red, green and blue bytes the read-back returned at a three by three grid of fixed fractional positions of the full frame, kept inside the drawing surface before its conversion to the wide-gamut space, each as (column, row) then the three bytes. Compare with the row below, which is read after the conversion.");
}

/** Writes two rows about a drawn frame's raw values. Takes the words for when, the frame as read back (top row first) and its thinned copy.
 *  Returns nothing. What it must satisfy: the means and tops are of the thinned copy's red, green and blue as the sweep counts them, and the
 *  grid is read from the full frame at the fractions 0.1, 0.5 and 0.9 across and down, so a frame that is all one value shows it in nine places. */
function channelRows(when: string, frame: { data: Uint8ClampedArray; width: number; height: number }, t: ReturnType<typeof thin>): void {
  const sum = [0, 0, 0], top = [0, 0, 0];
  const n = t.w * t.h;
  for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) { const v = t.data[4 * i + k]; sum[k] += v; if (v > top[k]) top[k] = v; }
  row(`Drawn frame, ${when}: each channel's mean and top`,
    `red mean ${(n ? sum[0] / n : 0).toFixed(2)}, top ${top[0]} · green mean ${(n ? sum[1] / n : 0).toFixed(2)}, top ${top[1]} · blue mean ${(n ? sum[2] / n : 0).toFixed(2)}, top ${top[2]} · of 255, over the ${n} thinned pixels`,
    "The mean and the largest value of each channel over the pixels the check counts. A frame that is one grey has the three means equal and the three tops equal.");
  const fr = [0.1, 0.5, 0.9];
  const cells: string[] = [];
  for (const fy of fr) for (const fx of fr) {
    const x = Math.floor(fx * (frame.width - 1)), y = Math.floor(fy * (frame.height - 1));
    const o = (y * frame.width + x) * 4;
    cells.push(`(${x}, ${y}) ${frame.data[o]}, ${frame.data[o + 1]}, ${frame.data[o + 2]}`);
  }
  row(`Drawn frame, ${when}: values at nine places after the conversion`, cells.join(" · "),
    "The red, green and blue bytes of the frame after the conversion to the wide-gamut space, at a three by three grid of fixed fractional positions of the full frame, each as (column, row) then the three bytes.");
}

/** Uploads a float texture on a context of the page's own and reads it back, so the browser's float upload is tested apart from the
 *  picture code. Takes the size to try. Returns one sentence per variant: a 4 by 4 texture and one of that size, each as RGBA32F and as
 *  RGBA16F from float data, saying whether the framebuffer was complete, the first error, and how many of five points came back as written.
 *  What it must satisfy: it makes its own throwaway context and gives it back, so the drawing surface's state is not touched. */
function floatUploadProbe(w: number, h: number): string {
  let gl: WebGL2RenderingContext | null = null;
  const c = document.createElement("canvas");
  try {
    c.width = 1; c.height = 1;
    gl = c.getContext("webgl2");
    if (!gl) return "WebGL2 unavailable";
    const colour = !!gl.getExtension("EXT_color_buffer_float");
    const lim = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const out: string[] = [];
    const sizes: [number, number][] = [[4, 4], [Math.min(w, lim), Math.min(h, lim)]];
    for (const [tw, th] of sizes) {
      for (const [name, internal] of [["RGBA32F", gl.RGBA32F], ["RGBA16F", gl.RGBA16F]] as [string, number][]) {
        gl.getError();
        const data = new Float32Array(tw * th * 4);
        for (let y = 0; y < th; y++) for (let x = 0; x < tw; x++) { const o = (y * tw + x) * 4; data[o] = x / tw; data[o + 1] = y / th; data[o + 2] = 0.25; data[o + 3] = 1; }
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texImage2D(gl.TEXTURE_2D, 0, internal, tw, th, 0, gl.RGBA, gl.FLOAT, data);
        const eUp = gl.getError();
        const fb = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        let good = 0;
        const px = new Float32Array(4);
        if (st === gl.FRAMEBUFFER_COMPLETE) {
          for (const [fx, fy] of [[0.1, 0.1], [0.5, 0.5], [0.9, 0.9], [0.1, 0.9], [0.9, 0.1]]) {
            const x = Math.floor(fx * (tw - 1)), y = Math.floor(fy * (th - 1));
            gl.readPixels(x, y, 1, 1, gl.RGBA, gl.FLOAT, px);
            if (Math.abs(px[0] - x / tw) < 0.002 && Math.abs(px[1] - y / th) < 0.002 && Math.abs(px[2] - 0.25) < 0.002) good++;
          }
        }
        const eRead = gl.getError();
        out.push(`${name} from FLOAT data at ${tw} by ${th}: framebuffer ${FB_STATUS_WORDS[st] ?? st}, error after the upload ${glErrWords(eUp)}, after the read ${glErrWords(eRead)}, ${good} of 5 points read as written`);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.deleteFramebuffer(fb);
        gl.deleteTexture(tex);
      }
    }
    return `${colour ? "float colour buffer granted" : "float colour buffer not granted, so no read could be made"} · ${out.join(" · ")}`;
  } catch (e) {
    return `could not be run (${(e as Error).message})`;
  } finally {
    try { gl?.getExtension("WEBGL_lose_context")?.loseContext(); } catch { /* nothing to give back */ }
    c.width = 1; c.height = 1;
  }
}

/** The planted coloured picture's four quadrants, in the order top left, top right, bottom left, bottom right: three of known hue and one grey,
 *  each as a linear colour. */
const PLANT_QUADS: { name: string; lin: [number, number, number]; grey: boolean }[] = [
  { name: "top left (red source)", lin: [0.6, 0.05, 0.05], grey: false },
  { name: "top right (green source)", lin: [0.05, 0.6, 0.05], grey: false },
  { name: "bottom left (blue source)", lin: [0.05, 0.05, 0.6], grey: false },
  { name: "bottom right (grey source)", lin: [0.2, 0.2, 0.2], grey: true },
];

/** The hue of a colour in degrees. Takes red, green and blue on any one scale. Returns the HSV hue from 0 up to 360, 0 for a grey. */
function hueDeg(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b), d = mx - Math.min(r, g, b);
  if (d <= 0) return 0;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** The hue bin a planted linear colour should land in after the check's edit. Takes the colour. Returns the hue in degrees and the bin. What
 *  it must satisfy: the check's edit has the red and blue swap on, so red and blue are exchanged, then the sRGB curve, then the wide-gamut
 *  conversion the drawing surface applies to its read-back, the steps `plantedColour` verified on 8-bit bytes. */
function plantedExpect(lin: [number, number, number]): { hue: number; bin: number } {
  const enc = (c: number): number => (c <= 0.003131 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const p3 = new Float32Array(3);
  srgbDisplayToP3Display(enc(lin[2]), enc(lin[1]), enc(lin[0]), p3);
  const hue = hueDeg(p3[0], p3[1], p3[2]);
  return { hue, bin: Math.min(SEP_BINS - 1, Math.floor(hue / SEP_BIN_DEG)) };
}

/** Draws a planted coloured picture through the photograph's own path and reads it. Takes the press's one drawing surface and the tally.
 *  Returns whether each coloured quadrant's pixels fell in its expected hue bins (within three bins either side) and the grey quadrant's fell
 *  under the floor, with the figures and the sentence for the row. What it must satisfy: the source is a linear float source with a camera
 *  matrix, uploaded by `useLinear` (the call a raw's source takes), drawn by `draw` at the check's neutral edit, thinned by `thin` and counted
 *  by `huePass`; `known` is true only when at least nine in ten of each quadrant's interior pixels are in the expected place. The page flag
 *  `plantswap` in the address exchanges the green and blue quadrants' source colours and is read here and nowhere else, so the check can be
 *  seen reading as not known. The surface is left holding the planted picture. */
function plantedPicture(drawing: Drawing, tally: PressTally): { known: boolean; value: string; meaning: string } {
  const W = 64, H = 64;
  const flagged = new URLSearchParams(location.search).has("plantswap");
  const source = PLANT_QUADS.map((q, i) => (flagged && (i === 1 || i === 2) ? PLANT_QUADS[3 - i].lin : q.lin));
  const linear = new Float32Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const lin = source[(y < H / 2 ? 0 : 2) + (x < W / 2 ? 0 : 1)];
    const o = (y * W + x) * 4;
    linear[o] = lin[0]; linear[o + 1] = lin[1]; linear[o + 2] = lin[2]; linear[o + 3] = 1;
  }
  books(tally);
  drawing.useLinear({ width: W, height: H, linear, camMatrix: [1, 0, 0, 0, 1, 0, 0, 0, 1] }, 0, 0);
  const frame = drawing.draw(sepEdit([1, 1, 1], 1));
  const t = thin(frame);
  const hp = huePass(t.data, t.w, t.h);
  const parts: string[] = [];
  let known = true;
  PLANT_QUADS.forEach((q, i) => {
    const x0 = Math.floor((i % 2) * t.w / 2 + t.w / 8), x1 = Math.floor((i % 2) * t.w / 2 + (3 * t.w) / 8);
    const y0 = Math.floor((i >> 1) * t.h / 2 + t.h / 8), y1 = Math.floor((i >> 1) * t.h / 2 + (3 * t.h) / 8);
    let n = 0, hit = 0;
    const seen = new Array(SEP_BINS).fill(0);
    const want = q.grey ? null : plantedExpect(q.lin);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
      const p = y * t.w + x;
      n++;
      if (hp.sat[p] >= SAT_GUARD_LO) {
        const b = Math.min(SEP_BINS - 1, Math.floor(hp.hue[p] / SEP_BIN_DEG));
        seen[b]++;
        if (want) { const dist = Math.min((b - want.bin + SEP_BINS) % SEP_BINS, (want.bin - b + SEP_BINS) % SEP_BINS); if (dist <= 3) hit++; }
      } else if (!want) hit++;
    }
    let top = 0;
    for (let b = 1; b < SEP_BINS; b++) if (seen[b] > seen[top]) top = b;
    const ok = n > 0 && hit / n >= 0.9;
    if (!ok) known = false;
    parts.push(q.grey
      ? `${q.name}: expected under the floor, ${hit} of ${n} pixels under it`
      : `${q.name}: expected hue bin ${want!.bin} (${want!.hue.toFixed(0)} degrees), most pixels in bin ${top}, ${hit} of ${n} in the expected bins`);
  });
  lap(tally, "separation: the planted coloured picture, drawn and read back");
  return {
    known,
    value: `${known ? "read as known" : "did not read as known"} · ${parts.join(" · ")}${flagged ? " · the page flag plantswap is on: the green and blue quadrants' source colours were exchanged on purpose" : ""}`,
    meaning: "A picture made here whose colours are known, in the photograph's own shape (a linear float source with a camera matrix), uploaded by the call the photograph's source takes, drawn at the check's neutral edit, read back, thinned and counted by the code the check uses. Read as known means each coloured quadrant fell in its expected hue bins and the grey one under the floor: this device keeps colour through the photograph's path. Read as not known means this device loses the colour on that path whatever the photograph holds, and the rows beside it say where.",
  };
}

/** Puts a picture on the page with its words. Takes the parent, the words (the picture's name and what it shows), the RGBA bytes, the size
 *  and optionally letters to draw at points. Returns the canvas, which is a real image for a screen reader (role img with the words as its
 *  label) and carries the same words in a caption under it, so no picture stands without them. */
function sepFigure(parent: HTMLElement, words: string, data: Uint8ClampedArray, w: number, h: number, labels?: { letter: string; x: number; y: number }[]): HTMLCanvasElement {
  const fig = document.createElement("figure");
  fig.style.cssText = "margin:0;flex:1 1 15rem;min-width:0;max-width:30rem";
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  cv.setAttribute("role", "img");
  cv.setAttribute("aria-label", words);
  cv.style.cssText = "display:block;width:100%;height:auto;border:1px solid var(--line-2);border-radius:6px";
  const ctx = cv.getContext("2d")!;
  const id = ctx.createImageData(w, h);
  id.data.set(data);
  ctx.putImageData(id, 0, 0);
  if (labels) {
    ctx.font = `bold ${Math.max(14, Math.round(h / 16))}px sans-serif`;
    ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.lineWidth = 4; ctx.strokeStyle = "black"; ctx.fillStyle = "white";
    for (const l of labels) { ctx.strokeText(l.letter, l.x, l.y); ctx.fillText(l.letter, l.x, l.y); }
  }
  const cap = document.createElement("figcaption");
  cap.style.cssText = "font-size:0.8125rem;line-height:1.4;color:var(--txt-2);margin-top:4px";
  cap.textContent = words;
  fig.append(cv, cap);
  parent.appendChild(fig);
  return cv;
}

/** What the first press leaves for the second: the open drawing surface, the subject, the opening balance, and the first picture. */
interface SepState {
  drawing: Drawing; subject: Subject; wb0: [number, number, number]; exp0: number;
  t: ReturnType<typeof thin>; cv0: HTMLCanvasElement; spec: Parameters<typeof readBalance>[1] | null;
  /** The label of every thinned pixel, made once from the first picture and the sky selection. */
  labels: SepLabels;
  /** The picture on show: the opening balance's at first, then the balance of the last usable spot. */
  shown: ReturnType<typeof thin>;
  /** Which balance `shown` is drawn at, in words. */
  shownWhat: string;
  /** The words the picture's label and caption start from, before the spots' state is added. */
  baseWords: string;
  /** What each spot's last reading said. Null until the spot has been read. */
  spots: { n: SpotRead | null; f: SpotRead | null };
  /** The sky selection's bitmap the first press built (null when no clear sky was found), kept so the sweep's keying sample reads the same selection. */
  mask: BrushMask | null;
}
/** One spot's reading by the editor's tap rule: where it is, whether it is usable, the balance it sets and, when usable, the picture drawn at it. */
interface SpotRead { px: number; py: number; verdict: "ok" | "blown" | "dark"; wb: [number, number, number] | null; exposure: number; t: ReturnType<typeof thin> | null }
let sep: SepState | null = null;
const sepGo = $("dSepGo") as HTMLButtonElement;
const sepSweepBtn = $("dSepSweep") as HTMLButtonElement;

/** Gives the first press's drawing surface back and disables the second button and the sweep's. Takes nothing; returns nothing. */
function closeSep(): void {
  sep?.drawing.close();
  sep = null;
  sepGo.disabled = true;
  sepSweepBtn.disabled = true;
}
window.addEventListener("pagehide", closeSep);

/** The edit of a white point: the swap on, no look, every control at its neutral, the balance and exposure given. Takes the gains and the
 *  exposure. Returns the edit, and throws when the drawn path does not cover it. */
function sepEdit(wb: [number, number, number], exposure: number): EditParams {
  const p = pictureParams({ wb, exposure, swapRB: true });
  if (!canDrawFrame(p)) throw new Error("this edit is outside what the drawn path covers yet");
  return p;
}

const sepBox = (id: string): HTMLInputElement => $(id) as HTMLInputElement;
/** The two typed points. Returns each as fractions of the width and the height, or null when a box is empty or outside zero to one hundred. */
function sepPoints(): { n: [number, number]; f: [number, number] } | null {
  const v = ["dSepNX", "dSepNY", "dSepFX", "dSepFY"].map((id) => (sepBox(id).value.trim() === "" ? NaN : Number(sepBox(id).value)));
  if (v.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) return null;
  return { n: [v[0] / 100, v[1] / 100], f: [v[2] / 100, v[3] / 100] };
}

/** The image pixel a spot lies at. Takes the decoded photograph and the spot as fractions of its width and height. Returns the column and
 *  the row, the rounding the editor's tap and step 3 both use, so a spot read here is the spot step 3 reads. */
const spotPixel = (img: DecodedImage, f: [number, number]): [number, number] => [Math.round(f[0] * (img.width - 1)), Math.round(f[1] * (img.height - 1))];

/** The balance the editor's own tap sets from a spot (main.ts, the canvas tap), reused and not re-derived: the 5 by 5 patch read by
 *  `sampleForWb`, which refuses a blown-out or an almost black spot, the gains `unitMinGains` of the patch's own ratios, and the exposure
 *  that keeps the spot at the brightness it had (`exposureHoldingNeutral`), held between the slider's two ends. Takes the state and the
 *  pixel. Returns the verdict and, on "ok", the gains and exposure; on a refusal the gains are null. What it must satisfy: the same
 *  numbers the editor's tap gives for this photograph, so a spot means the same thing on this page and in the editor. */
function tapBalance(s: SepState, px: number, py: number): { verdict: SpotRead["verdict"]; wb: [number, number, number] | null; exposure: number } {
  const sample = sampleForWb(s.subject.img, px, py);
  if (sample.verdict !== "ok") return { verdict: sample.verdict, wb: null, exposure: 0 };
  const [r, g, b] = sample.lin;
  const mean = (r + g + b) / 3;
  const next = unitMinGains([mean / r, mean / g, mean / b]);
  const exposure = Math.min(EXPOSURE_HI, Math.max(EXPOSURE_LO, exposureHoldingNeutral(s.subject.img, sample.lin, s.wb0, s.exp0, next)));
  return { verdict: "ok", wb: next, exposure };
}

const SPOT_NAME = { n: "neutral spot", f: "foliage spot" } as const;
const SPOT_LETTER = { n: "N", f: "F" } as const;
/** A spot's state in words. Takes its last reading or null. Returns "usable", "blown out", "too dark" or "not read yet". */
const stateWords = (r: SpotRead | null): string => (!r ? "not read yet" : r.verdict === "ok" ? "usable" : r.verdict === "blown" ? "blown out" : "too dark");

/** Redraws the first picture: the photograph on show, with each typed spot marked by its letter in a square (N for the neutral spot, F for
 *  the foliage spot) and the spot's state in words beside it, and puts the same words in the picture's label and caption. A spot that is
 *  blown out or too dark has a dashed square. Takes nothing; returns nothing. What it must satisfy: the marks are a letter, a square and
 *  words, never colour alone, and a spot whose boxes moved since it was read is marked "not read yet" and never with a stale state. */
function sepMarks(): void {
  if (!sep) return;
  const s = sep;
  const cv = s.cv0, ctx = cv.getContext("2d")!;
  const id = ctx.createImageData(s.shown.w, s.shown.h);
  id.data.set(s.shown.data);
  ctx.putImageData(id, 0, 0);
  const scale = cv.clientWidth > 0 ? s.shown.w / cv.clientWidth : 1; // canvas pixels to a displayed pixel, so the marks read at a size on the screen
  const said: string[] = [];
  const mark = (kind: "n" | "f", fx: number, fy: number) => {
    const [px, py] = spotPixel(s.subject.img, [fx, fy]);
    const last = s.spots[kind];
    const read = last && last.px === px && last.py === py ? last : null;
    const letter = SPOT_LETTER[kind], state = stateWords(read), refused = !!read && read.verdict !== "ok";
    const r = 13 * scale;
    const x = Math.min(s.shown.w - r, Math.max(r, fx * (s.shown.w - 1))), y = Math.min(s.shown.h - r, Math.max(r, fy * (s.shown.h - 1)));
    for (const pass of [0, 1]) {
      ctx.lineWidth = (pass ? 2 : 5) * scale; ctx.strokeStyle = pass ? "white" : "black";
      ctx.setLineDash(refused ? [4 * scale, 3 * scale] : []);
      ctx.beginPath(); ctx.rect(x - r, y - r, 2 * r, 2 * r); ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "white"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `bold ${Math.round(17 * scale)}px sans-serif`;
    ctx.lineWidth = 3 * scale; ctx.strokeStyle = "black";
    ctx.strokeText(letter, x, y); ctx.fillText(letter, x, y);
    const text = `${SPOT_NAME[kind]}: ${state}`;
    ctx.font = `bold ${Math.round(13 * scale)}px sans-serif`;
    const onRight = x + r + 6 * scale + ctx.measureText(text).width <= s.shown.w;
    ctx.textAlign = onRight ? "left" : "right";
    const tx = onRight ? x + r + 6 * scale : x - r - 6 * scale;
    ctx.lineWidth = 4 * scale;
    ctx.strokeText(text, tx, y); ctx.fillText(text, tx, y);
    said.push(`${letter}, the ${SPOT_NAME[kind]}, ${state}`);
  };
  const ids = ["dSepNX", "dSepNY", "dSepFX", "dSepFY"];
  const v = ids.map((i) => (sepBox(i).value.trim() === "" ? NaN : Number(sepBox(i).value)));
  if (Number.isFinite(v[0]) && Number.isFinite(v[1])) mark("n", v[0] / 100, v[1] / 100);
  if (Number.isFinite(v[2]) && Number.isFinite(v[3])) mark("f", v[2] / 100, v[3] / 100);
  const label = `${s.baseWords} It is drawn at ${s.shownWhat}.${said.length ? ` Marked: ${said.join("; ")}.` : ""}`;
  cv.setAttribute("aria-label", label);
  const cap = cv.nextElementSibling;
  if (cap) cap.textContent = label;
}
for (const id of ["dSepNX", "dSepNY", "dSepFX", "dSepFY"]) sepBox(id).addEventListener("input", sepMarks);

/** Reads one spot at once, as a tap or a pair of typed numbers sets it. Takes which spot, "n" or "f", and reads its two boxes. Returns
 *  nothing; it says in the live region (the points line, present from parse) one sentence naming the spot and saying whether it is
 *  usable, blown out or too dark; where it is usable it redraws the picture at the balance the editor's tap sets from it, and where it is
 *  not the picture stays at the last usable balance and the sentence says so; either way the marks are redrawn. What it must satisfy: the
 *  reading is kept in `sep.spots` so step 3 reads the same spot the same way and reuses the picture drawn here rather than drawing it
 *  twice; one empty box says nothing, because the pair is not yet typed. */
function sepSpot(kind: "n" | "f"): void {
  const hint = $("dSepHint");
  const s = sep;
  if (!s) { hint.textContent = "Press step 1 first: the picture has to be drawn before a spot can be read."; return; }
  if (running) { hint.textContent = "A test is still running on this page. Set the spot again when it has finished."; return; }
  const raw = (kind === "n" ? ["dSepNX", "dSepNY"] : ["dSepFX", "dSepFY"]).map((i) => sepBox(i).value.trim());
  if (raw.some((x) => x === "")) return;
  const v = raw.map(Number);
  const name = SPOT_NAME[kind];
  if (v.some((x) => !Number.isFinite(x) || x < 0 || x > 100)) { hint.textContent = `The ${name}'s two numbers must each be from 0 to 100, so it was not read.`; return; }
  const [px, py] = spotPixel(s.subject.img, [v[0] / 100, v[1] / 100]);
  const where = `${v[0].toFixed(1)} percent across and ${v[1].toFixed(1)} percent down`;
  const bal = tapBalance(s, px, py);
  let t: ReturnType<typeof thin> | null = null;
  if (bal.verdict === "ok" && bal.wb) {
    try { t = thin(s.drawing.draw(sepEdit(bal.wb, bal.exposure))); } catch (err) {
      hint.textContent = `The ${name} at ${where} could not be drawn (${(err as Error).message}), so the picture stays at ${s.shownWhat}.`;
      return;
    }
  }
  s.spots[kind] = { px, py, verdict: bal.verdict, wb: bal.wb, exposure: bal.exposure, t };
  if (t && bal.wb) {
    s.shown = t;
    s.shownWhat = `the balance set from the ${name}`;
    const rd = s.spec ? readBalance(bal.wb, s.spec) : null;
    hint.textContent = `The ${name} at ${where} is usable: it sets gains ${bal.wb.map((g) => g.toFixed(4)).join(", ")} at exposure ${bal.exposure.toFixed(3)}${rd ? `, reading ${Math.round(rd.kelvin)} K and tint ${Math.round(rd.tint)}` : ""}, and the picture above is drawn at that balance.`;
  } else {
    hint.textContent = `The ${name} at ${where} is ${bal.verdict === "blown" ? "blown out, so its colour was never recorded" : "too dark to set a balance from"}, so it is not used and the picture stays at ${s.shownWhat}. Tap another spot.`;
  }
  sepMarks();
}
for (const id of ["dSepNX", "dSepNY"]) sepBox(id).addEventListener("change", () => sepSpot("n"));
for (const id of ["dSepFX", "dSepFY"]) sepBox(id).addEventListener("change", () => sepSpot("f"));

/** Writes the stage rows and the two sum rows of a press. Takes the press's tally and its whole time. Returns nothing. */
function sepTimeRows(tally: PressTally, whole: number): void {
  books(tally);
  for (const [k, l] of tally.stages) row(`Time: ${k}`, `${dur(l.reduce((s, v) => s + v, 0))} (${l.length === 1 ? "once" : `in all, ${l.length} times`})`, "A stage of this press, timed on this page's own clock.");
  row("Time: waiting for the screen to draw", `${dur(tally.waitMs)} in all, over ${tally.waits} ${tally.waits === 1 ? "wait" : "waits"}`, "The zero-delay waits the press makes so the progress line can draw.");
  row("Time: the whole press", dur(whole), "From the press of the button to the last row.");
  const sum = pressTotal(tally);
  row("Time: every row added together", `${dur(sum)} against the whole press ${dur(whole)}, ${dur(Math.max(0, whole - sum))} in no row`, "Every stretch of the press is under a name above, and this line adds them. The difference from the whole press is what lay in no row.");
}

// --- THE PLACES AND THE CUES (record 050; plan of 9 November 2026) ----------------------------------------------------------------
// The first press's counted pixels are labelled by place where the photograph is one of the three the places file holds, else by the
// check's own four labels; eight cues are counted for each; the cue module prints what each cue, alone and joined as the app joins
// masks, can and cannot tell apart, fits selections, reads the selections kept from other photographs and gives what each takes.
// Nothing here chooses: the figures are printed with their definitions and the pictures show what a selection takes.

/** The key of the browser's local storage under which each photograph's fitted selections are kept, as text, by the photograph's name. */
const PLACE_KEPT_KEY = "ips-debug-separation-selections";

/** Reads the kept selections. Takes nothing. Returns whether storage could be read and every photograph's kept selections by name. What it
 *  must satisfy: every access to storage is inside a try; where storage is refused or holds text that is not an object it gives an empty
 *  set, and `ok` says only whether storage answered. */
function keptRead(): { ok: boolean; all: Record<string, unknown> } {
  try {
    const raw = window.localStorage.getItem(PLACE_KEPT_KEY);
    const o: unknown = raw ? JSON.parse(raw) : {};
    return { ok: true, all: o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : {} };
  } catch {
    return { ok: false, all: {} };
  }
}

/** Keeps one photograph's selections. Takes the set read by `keptRead`, the photograph's name and its fitted selections. Returns whether the
 *  write was accepted. What it must satisfy: the write is inside a try, and the page works whether or not it is accepted. */
function keptWrite(all: Record<string, unknown>, name: string, fits: unknown): boolean {
  try {
    window.localStorage.setItem(PLACE_KEPT_KEY, JSON.stringify({ ...all, [name]: fits }));
    return true;
  } catch {
    return false;
  }
}

/** Draws what one selection takes. Takes the host, the heading and the words, the thinned picture, and one byte for each counted pixel that
 *  is 1 where the selection takes it. Returns how many pixels it takes. What it must satisfy: the picture is the thinned drawn picture in
 *  grey with the taken pixels at full strength and the rest at a third of it, and a one-pixel outline in the page's own text colour on every
 *  taken pixel that has an untaken neighbour, so what is taken reads without colour by strength and by outline; it sits under a heading in
 *  words and is an image with the same words as its name (`sepFigure`). */
function placePicture(host: HTMLElement, title: string, t: ReturnType<typeof thin>, taken: ArrayLike<number>): number {
  const { w, h } = t;
  const m = /rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/.exec(getComputedStyle(document.body).color);
  const ink = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const out = new Uint8ClampedArray(w * h * 4);
  let count = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x, o = 4 * i;
      const grey = Math.round(0.299 * t.data[o] + 0.587 * t.data[o + 1] + 0.114 * t.data[o + 2]);
      const on = taken[i] === 1;
      if (on) count++;
      const edge = on && ((x > 0 && taken[i - 1] !== 1) || (x < w - 1 && taken[i + 1] !== 1) || (y > 0 && taken[i - w] !== 1) || (y < h - 1 && taken[i + w] !== 1));
      const v = on ? grey : Math.round(grey / 3);
      out[o] = edge ? ink[0] : v; out[o + 1] = edge ? ink[1] : v; out[o + 2] = edge ? ink[2] : v; out[o + 3] = 255;
    }
  }
  const sec = document.createElement("section");
  sec.style.cssText = "margin:14px 0";
  const hd = document.createElement("h5");
  hd.style.cssText = "font-size:0.875rem;margin:0 0 6px";
  hd.textContent = title;
  sec.appendChild(hd);
  const box = document.createElement("div");
  box.style.cssText = "display:flex;flex-wrap:wrap;gap:10px";
  sec.appendChild(box);
  host.appendChild(sec);
  sepFigure(box, `${title}. The thinned drawn picture in grey, shown at ${w} by ${h} pixels. What the selection takes is at full strength with a one-pixel outline in the page's text colour, and the rest is dimmed to a third. It takes ${count} of the ${w * h} counted pixels.`, out, w, h);
  return count;
}

/** The places and the cues of the first press. Takes the press's tally, the subject, the drawn frame at the opening balance, its thinned
 *  picture, the check's own labels, the app's sky selection or null, and the opening gains. Returns nothing; writes rows into the report, the
 *  pictures into `#dPlacePics` (replacing the last press's), and this photograph's fitted selections into storage under its name. What it
 *  must satisfy: a fault inside it writes one row saying the places part did not run and lets the press go on, so the rows the check printed
 *  before it stand as they were; the counted pixels are the thinned picture's, the columns and rows being their places in the whole frame;
 *  storage is read and written inside a try. Consumer: the first press. */
async function placesPart(tally: PressTally, subject: Subject, frame: { data: Uint8ClampedArray; width: number; height: number }, t: ReturnType<typeof thin>, labels: SepLabels, mask: BrushMask | null, gains: [number, number, number]): Promise<void> {
  const host = $("dPlacePics");
  host.replaceChildren();
  try {
    const n = t.w * t.h;
    books(tally);
    progress("Labelling the counted pixels by place");
    await pause(tally);
    books(tally);
    const cols = new Int32Array(n), rows = new Int32Array(n);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) { cols[y * t.w + x] = x * t.k; rows[y * t.w + x] = y * t.k; }
    const picture = placesPicture(subject.name);
    let lab: Uint8Array, names: string[], targets: PlaceTarget[];
    if (picture) {
      lab = placeLabels(picture, cols, rows, t.fromW, t.fromH);
      names = [...PLACE_NAMES];
      targets = [...PLACE_TARGETS];
      row("The places the counted pixels are labelled by", `picture ${picture} of 3 · ${names.join(", ")} · ${targets.map((x) => x.title).join(" · ")}`,
        "This photograph is one of the three the places file holds, so each counted pixel is labelled by the polygons drawn on it, by place, and the targets are the places joined as the file's targets name them. The polygons were read off the three pictures on 8 November 2026 and are an agent's reading, not a measurement of the photograph.");
    } else {
      lab = labels.lab;
      names = [...SEP_LABELS];
      targets = [{ title: "Sky", places: [0] }, { title: "Foliage", places: [2] }];
      row("The places the counted pixels are labelled by", `none held for this photograph · the check's own four labels, ${names.join(", ")} · two targets, ${targets.map((x) => x.title).join(" and ")}`,
        "Places are held for three photographs only, the three marina raws NIR_3742.NEF, NIR_3736.NEF and NIR_3733.NEF. Any other photograph is labelled by the check's own four labels, sky by the app's sky selection, neutral by saturation, foliage by the vegetation axis and the rest other, and the cue module's targets are the sky and the foliage.");
    }
    lap(tally, "separation: the places, the labelling");

    progress("Counting the eight cues");
    await pause(tally);
    books(tally);
    const light = new Uint8Array(frame.width * frame.height);
    for (let p = 0, q = 0; p < light.length; p++, q += 4) {
      const r = frame.data[q], g = frame.data[q + 1], b = frame.data[q + 2];
      light[p] = r > g ? (r > b ? r : b) : (g > b ? g : b);
    }
    const img = subject.img;
    const lin = img.isRaw && img.linear && img.width === t.fromW && img.height === t.fromH ? img.linear : null;
    const linear = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      if (lin) {
        const q = (rows[i] * t.fromW + cols[i]) * 4;
        linear[3 * i] = lin[q] * gains[0]; linear[3 * i + 1] = lin[q + 1] * gains[1]; linear[3 * i + 2] = lin[q + 2] * gains[2];
      } else {
        linear[3 * i] = t.data[4 * i] / 255; linear[3 * i + 1] = t.data[4 * i + 1] / 255; linear[3 * i + 2] = t.data[4 * i + 2] / 255;
      }
    }
    const sky = new Uint8Array(n);
    if (mask) for (let i = 0; i < n; i++) sky[i] = sampleBrush(mask, (cols[i] + 0.5) / t.fromW, (rows[i] + 0.5) / t.fromH) >= SEP_SKY_WEIGHT ? 1 : 0;
    const cues = placeCueValues(t.data, linear, light, t.fromW, t.fromH, cols, rows);
    lap(tally, "separation: the eight cues");
    row("The eight cues counted", PLACE_CUES.join(" · "),
      `Each is one value for each counted pixel. Lightness is the largest of the drawn pixel's three channels over 255. Saturation is the largest less the smallest over the largest. Red against green, red against blue and green against blue are each the difference of two linear channels over their sum, taken ${lin ? "on the photograph's linear copy at the opening gains" : "on the drawn pixel's own channels over 255, because this photograph has no linear camera copy at the drawn size"}. Texture at 5 and at 15 is the standard deviation of the drawn lightness in a square window of that many pixels centred on the pixel's place in the whole frame, over 255. Height is the pixel's row over the last row.`);

    progress("Fitting and reading the selections");
    await pause(tally);
    books(tally);
    const store = keptRead();
    const kept = Object.entries(store.all).filter(([k]) => k !== subject.name).map(([, v]) => v);
    const rep = placeReport(cues, lab, names, targets, sky, subject.name, kept as Parameters<typeof placeReport>[6]);
    lap(tally, "separation: the places report");
    for (const text of rep.rows) {
      const at = text.indexOf(": ");
      row(at > 0 ? text.slice(0, at) : "The places", at > 0 ? text.slice(at + 2) : text,
        "Counted by the cue module on this photograph's counted pixels. A selection fitted here is printed as fitted here and is no result; a selection kept from another photograph is read on this one as it was fitted.");
    }
    const stored = keptWrite(store.all, subject.name, rep.fits);
    row("Selections kept on this device", store.ok && stored
      ? `${kept.length} kept from other photographs · this photograph's ${rep.masks.length} masks' selections are kept under its name`
      : "cannot be kept on this device",
    store.ok && stored
      ? "The fitted selections of each photograph are kept in this browser's local storage, as text, under the photograph's name, and the next photograph opened here is read through them."
      : "This browser refused local storage, so the selections fitted here are not kept and no other photograph's are read here. The rest of the page works.");
    lap(tally, "separation: keeping the selections");

    progress("Drawing what the selections take");
    await pause(tally);
    books(tally);
    const head = document.createElement("h4");
    head.style.cssText = "font-size:0.9375rem;margin:18px 0 6px";
    head.textContent = "What each selection takes";
    host.appendChild(head);
    for (const m of rep.masks) {
      const took = placePicture(host, m.title, t, m.taken);
      row(`Picture: ${m.title}`, `takes ${took} of ${n} counted pixels`, "The count of the pixels the selection takes, drawn under the report at full strength with an outline. It is the same selection the report's rows read.");
    }
    lap(tally, "separation: drawing the selections");
  } catch (err) {
    row("The places and the cues", "not run", `${(err as Error).message}. The rows above stand as the check printed them.`);
  }
}

/** Takes the two buttons' common wrapper: runs `body` as a press of the Separation check with the page's other tests held off, the rows
 *  written into the picture checks' own list and copy block, and the press counted in `running` until `body` ends. Returns nothing. */
async function sepPress(btn: HTMLButtonElement, clear: boolean, body: (tally: PressTally) => Promise<void>): Promise<void> {
  const list = $("dPicResults");
  if (running) { $("dSepHint").textContent = "Another test on this page is still running. Press this again when it has finished."; return; }
  const others = ["dRun", "dBigRead", "dSlowBuild", "dPictures", "dSepStart", "dSepGo", "dSepSweep"].map((id) => $(id) as HTMLButtonElement);
  const was = others.map((b) => b.disabled);
  others.forEach((b) => { b.disabled = true; });
  const label = btn.textContent;
  btn.textContent = "Running…";
  running++;
  if (clear) { list.replaceChildren(); picOut.length = 0; }
  rowsInto = list; outInto = picOut;
  pressStart = performance.now();
  const tally = newTally(pressStart);
  try {
    await body(tally);
  } catch (err) {
    row("The Separation check", "not run", `${(err as Error).message}.`);
    progress(`Stopped: ${(err as Error).message}.`, true);
  } finally {
    rowsInto = results; outInto = out;
    running--;
    btn.textContent = label;
    others.forEach((b, i) => { b.disabled = was[i]; });
    sepGo.disabled = !sep;
    sepSweepBtn.disabled = !sep;
  }
}

($("dSepStart") as HTMLButtonElement).addEventListener("click", (e) => {
  void sepPress(e.currentTarget as HTMLButtonElement, true, async (tally) => {
    closeSep();
    $("dSepPics").replaceChildren();
    $("dPlacePics").replaceChildren();
    await refreshReport();
    lap(tally, "taking the device report again");
    const chip = chipName();
    lap(tally, "reading the chip's name");
    row("The graphics chip drawing the Separation check", chip, SOFTWARE_RENDERER.test(chip)
      ? "THIS IS A SOFTWARE RENDERER, not a graphics chip: the figures describe this renderer and say nothing of the picture on a device."
      : "The renderer string the browser gives for this page's drawing. The figures are of this chip.");
    let drawing: Drawing | null = null;
    try {
      progress("Building the picture code, once");
      books(tally);
      tally.builds++;
      drawing = await openDrawing();
      lap(tally, "the picture code's build");
      await pause(tally);
      const plant = await plantedColour(drawing, tally);
      row("A planted colour, drawn and read back", plant.value, plant.meaning);
      if (!plant.exact) { row("The Separation check", "not run", "The planted colour did not read back exactly, so a picture read on this page cannot be trusted."); progress("Stopped: the planted colour did not read back exactly.", true); return; }
      books(tally);
      const pairs = plantedPairs();
      lap(tally, "the checks' own planted pairs, tried");
      row("The checks' own pairs, planted first", pairs.value, pairs.meaning);
      if (!pairs.ok) { row("The Separation check", "not run", "An instrument did not read its planted pair as known, so nothing it says is trustworthy."); progress("Stopped: a planted pair did not read as known.", true); return; }
      books(tally);
      const measurePlant = plantedMeasure();
      lap(tally, "the separation measure's planted counts, tried");
      row("The separation measure, planted first", measurePlant.value, measurePlant.meaning);
      if (!measurePlant.ok) { row("The Separation check", "not run", "The separation measure did not read its planted counts as known, so nothing it says is trustworthy."); progress("Stopped: the separation measure did not read its planted counts as known.", true); return; }
      progress("Drawing a planted coloured picture through the photograph's path");
      await pause(tally);
      const picture = plantedPicture(drawing, tally);
      row("A planted coloured picture, through the photograph's path", picture.value, picture.meaning);
      books(tally);
      const subject = await loadSubject(tally);
      progress(`Sending the ${subject.label} to the chip`);
      await pause(tally);
      books(tally);
      const atWorkingSize = useAtWorkingSize(drawing, tally, subject.file, subject.img, subject.label);
      const base = freshBaseline(subject.img);
      const cam = cameraOf(subject.img.isRaw, subject.file.bytes);
      const spec = profileRule(choicesFor(cam, loadedFor(cam.keys)), undefined, undefined, undefined).choice?.spec ?? null;
      progress("Building the app's own sky selection, once");
      await pause(tally);
      books(tally);
      const skyBuilt = buildSepSky(subject.img);
      lap(tally, "separation: the sky selection's build");
      // The keying's sample is the photograph's own linear pixels and the bitmap, taken once; never the drawn frame, which has been through the swap and the mixer.
      const keySample = takePanelSample(subject.img, skyBuilt.mask, 0);
      lap(tally, "separation: the keying's sample");
      progress("Drawing the photograph with the swap on at the balance the app opens at");
      await pause(tally);
      books(tally);
      const frame = drawing.draw(sepEdit(base.wb, base.exposure));
      lap(tally, "separation: the first draw and read-back, at the opening balance");
      const t = thin(frame);
      lap(tally, "separation: the first picture thinned");
      const labels = labelPixels(t, skyBuilt.mask, subject.img, base.wb, skyBuilt.note);
      lap(tally, "separation: the label pass");
      const hp0 = huePass(t.data, t.w, t.h);
      const measure0 = sepMeasure(labelledStats(hp0, labels));
      lap(tally, "separation: the first picture's labelled counts and the measure");
      row("The photograph's drawn size", `${frame.width} by ${frame.height} pixels · ${atWorkingSize ? "the editor's own working copy, one drawn pixel for each of its pixels, handed to the drawing surface as a prepared linear source and not demosaiced again" : "the photograph's own pixels as the picture code builds them; it has no linear camera copy"}`,
        atWorkingSize
          ? "The decode's working copy (the half-size demosaic the editor edits, with the red and blue moved onto green before it was binned) is uploaded as it stands, so the frame is drawn at that size and not at twice it, which is a quarter of the pixels. The three picture checks draw at the photograph's full size as before."
          : "A camera-rendered file, or a raw shown by its embedded preview, has no linear camera copy, so the picture code builds its source as it does for the three picture checks.");
      row("The photograph's pixels, labelled", `sky ${labels.counts[0]} · neutral ${labels.counts[1]} · foliage ${labels.counts[2]} · other ${labels.counts[3]} of ${t.w * t.h} thinned pixels (${labels.counts.map((c, i) => `${SEP_LABELS[i]} ${((c / Math.max(1, t.w * t.h)) * 100).toFixed(1)} percent`).join(", ")}) · ${labels.skyNote}${labels.hasAxis ? "" : " · no vegetation axis: this photograph has no linear camera copy at the drawn size, so no pixel is called foliage"} · ${SEP_FIGURES}`,
        "Each thinned pixel is labelled once. Sky where the app's own sky selection (the refined bitmap, or the coarse one when there is none) reads at least the sky weight at its position. Otherwise neutral where its saturation at the opening render, the swap on at the balance the app opens at, is under the floor. Otherwise foliage where the vegetation axis, the white-balanced red less the green over the green, taken on the linear copy at the opening gains, is at most the threshold. Otherwise other. These are the rule of the gather of 8 November; the four figures are the measure's own and no source gives them.");
      row("The first picture: the four labels and the separation measure", sepWords(measure0),
        "The same split as each sweep row's, at the opening balance with the swap on: each population's count, its share at or above the floor, its circular mean hue and resultant length, the Hellinger distance between the sky's and the foliage's hue counts and the angle between their means, with the neutral population as the control. A population with fewer than one pixel in a hundred at or above the floor is colourless and the distance is then undefined.");
      const keyed0 = keyPanelCentres(keySample, sepEdit(base.wb, base.exposure), subject.img.camMatrix, subject.img.width / subject.img.height, null);
      lap(tally, "separation: the panel's keying");
      row("The first picture: the panel's keying", `${panelKeyWords(keyed0)} · ${keySample.n} sampled pixels of the photograph's own linear pixels`,
        "The two centres the editor's Sky and Foliage boxes are keyed on for this photograph, at the opening balance with the swap on and no box moved: the circular mean hue, read at the band stage in linear light, of the sampled pixels the app's sky selection covers (Sky) and of those it leaves out (Foliage), each at or above the saturation floor, by the same two functions the editor uses. A box says by name where no sky was found or where fewer than one pixel in a hundred of its population is at or above the floor. The sample is taken from the photograph's own pixels and never from the drawn frame, which has already been through the swap and the mixer.");
      probeRows("after the photograph's first draw", drawing.probe());
      channelRows("after the photograph's first draw", frame, t);
      lap(tally, "separation: the drawing surface's report and the frame's raw values");
      row("A float texture upload and read-back on a context of its own", floatUploadProbe(frame.width, frame.height),
        "The browser's own float upload tested apart from the picture code: a texture of float data is uploaded as RGBA32F and as RGBA16F, first at 4 by 4 and then at the size of the drawn frame, attached to a framebuffer and read back at five places, and each place is compared with what was written. It runs on a throwaway context given back at once.");
      lap(tally, "separation: the float upload test");
      const host = $("dSepPics");
      const box = document.createElement("div");
      box.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin:0 0 10px";
      host.appendChild(box);
      const baseWords = `The photograph drawn with red and blue swapped and no look. Tap it to set the point chosen above, or type the two points in the boxes, and it is redrawn at once at the balance that spot sets, with the spot marked by its letter in a square, N for the neutral spot and F for the foliage spot, and its state in words. It is shown at ${t.w} by ${t.h} pixels, every ${t.k === 1 ? "pixel" : `${t.k}th pixel`} of the ${t.fromW} by ${t.fromH} drawn frame.`;
      const cv0 = sepFigure(box, `${baseWords} It is drawn at the balance the editor opens at.`, t.data, t.w, t.h);
      cv0.style.cursor = "crosshair";
      cv0.addEventListener("click", (ev) => {
        const r = cv0.getBoundingClientRect();
        const fx = Math.min(100, Math.max(0, ((ev.clientX - r.left) / r.width) * 100)), fy = Math.min(100, Math.max(0, ((ev.clientY - r.top) / r.height) * 100));
        const neutral = ($("dSepTapNeutral") as HTMLInputElement).checked;
        sepBox(neutral ? "dSepNX" : "dSepFX").value = fx.toFixed(1);
        sepBox(neutral ? "dSepNY" : "dSepFY").value = fy.toFixed(1);
        sepSpot(neutral ? "n" : "f");
      });
      sep = { drawing, subject, wb0: base.wb, exp0: base.exposure, t, cv0, spec, labels, shown: t, shownWhat: "the balance the editor opens at", baseWords, spots: { n: null, f: null }, mask: skyBuilt.mask };
      drawing = null;
      const rd = spec ? readBalance(base.wb, spec) : null;
      row("The opening balance, the first white point", `gains ${base.wb.map((g) => g.toFixed(4)).join(", ")} · exposure ${base.exposure.toFixed(4)} · ${rd ? `reads as ${Math.round(rd.kelvin)} K, tint ${Math.round(rd.tint)}` : "no temperature read: the file has no matrix to read it through"}`,
        `What the editor opens this photograph at, by the app's one copy of the at-open ruling (freshBaseline): for a raw opened from its sensor data, the balance found from the data (gray-world) and the automatic exposure. The drawn picture has the red and blue swap on and no look, every control at its neutral${subject.img.isRaw ? "" : "; this file opened as an 8-bit picture (a camera-rendered file, or a raw shown by its embedded preview, as the row above says), so it opens with no balance and exposure 1, and the swap is switched on here all the same for the check"}.`);
      await placesPart(tally, subject, frame, t, labels, skyBuilt.mask, base.wb);
      progress("The photograph is drawn. Now tap a neutral spot and a sunlit leaf, or type their points, then press step 3.", true);
      $("dSepHint").textContent = "The picture is drawn above. Choose what a tap sets, then tap the picture or type the two numbers of a spot: the picture is redrawn at that spot's balance and this line says whether the spot is usable. Set both spots, then press step 3.";
      sepMarks();
      sepGo.disabled = false;
      sepSweepBtn.disabled = false;
    } finally {
      if (drawing) drawing.close();
      lap(tally, TAIL_STAGE);
      sepTimeRows(tally, performance.now() - pressStart);
    }
  });
});

sepGo.addEventListener("click", (e) => {
  const s = sep;
  if (!s) { $("dSepHint").textContent = "Press step 1 first: the picture has to be drawn before the two spots can be set."; return; }
  const pts = sepPoints();
  if (!pts) { $("dSepHint").textContent = "All four boxes need a number from 0 to 100. Tap the picture for each spot or type them, then press step 3 again."; return; }
  void sepPress(e.currentTarget as HTMLButtonElement, false, async (tally) => {
    try {
      const img = s.subject.img;
      type Point = { name: string; wb: [number, number, number]; exposure: number; why: string; drawn: ReturnType<typeof thin> | null };
      const points: Point[] = [{ name: "the balance the app opens at", wb: s.wb0, exposure: s.exp0, why: "freshBaseline's opening gains", drawn: null }];
      for (const [name, f, what, kind] of [["a balance set from your neutral spot", pts.n, "neutral spot", "n"], ["a balance set from your foliage spot", pts.f, "foliage spot", "f"]] as const) {
        const [cx, cy] = spotPixel(img, f);
        // A spot already read at this pixel (a tap or typed pair) is read again by nobody: its balance and its drawn picture are reused.
        const last = s.spots[kind];
        const read = last && last.px === cx && last.py === cy ? last : { px: cx, py: cy, ...tapBalance(s, cx, cy), t: null };
        if (read.verdict !== "ok" || !read.wb) {
          row(`White point: ${name}`, "not run", `The ${what} at pixel ${cx}, ${cy} is ${read.verdict === "blown" ? "blown out, so its colour was never recorded" : "almost black, so there is not enough colour in it"}; the editor refuses the same tap. Choose another spot and press step 3 again.`);
          continue;
        }
        points.push({ name, wb: read.wb, exposure: read.exposure, why: `the ${what} at pixel ${cx}, ${cy}, set the way the editor's tap sets a balance`, drawn: read.t });
      }
      row("The Separation check's own settings", `floor ${SAT_GUARD_LO} · ${SEP_BINS} bins of ${SEP_BIN_DEG} degrees · targets ${SEP_TARGET_FOLIAGE} and ${SEP_TARGET_SKY} · soft edge ${SEP_SOFT_EDGE} · minimum ${SEP_MIN_SHARE * 100} percent`,
        "The floor is the band stage's own saturation floor (SAT_GUARD_LO), applied here to the saturation of the drawn pixel, which is what the reader sees. A cluster is a run of hue bins between two valleys (a valley is a bin under one tenth of the smaller of its two nearest peaks); a run under one percent of the pixels above the floor is no cluster. The foliage cluster is the one holding the foliage spot; the sky cluster is the largest other. Turn A moves the foliage cluster's middle hue to 335 degrees and the sky cluster's to 215, each as one rotation with a ten-degree soft edge. Turn B moves every other cluster by plus 60 degrees and holds those two. Pixels below the floor are held in both. Nothing here is a setting of the editor. The check runs once.");
      row("The two spots", `neutral ${(pts.n[0] * 100).toFixed(1)} across, ${(pts.n[1] * 100).toFixed(1)} down · foliage ${(pts.f[0] * 100).toFixed(1)} across, ${(pts.f[1] * 100).toFixed(1)} down (percent of width and height)`,
        `As tapped or typed. The patch read at each is the one the editor's tap reads. The analysis reads every ${s.t.k === 1 ? "pixel" : `${s.t.k}th pixel`} of the drawn frame.`);
      const host = $("dSepPics");
      for (let k = 0; k < points.length; k++) {
        const P = points[k];
        const N = k + 1;
        progress(`White point ${N}: drawing`);
        await pause(tally);
        books(tally);
        let t: ReturnType<typeof thin>;
        if (P.wb === s.wb0) t = s.t;
        else if (P.drawn) t = P.drawn;
        else {
          const frame = s.drawing.draw(sepEdit(P.wb, P.exposure));
          lap(tally, `separation: white point ${N}, the draw and read-back`);
          t = thin(frame);
          lap(tally, `separation: white point ${N}, the picture thinned`);
        }
        progress(`White point ${N}: the hue pass`);
        await pause(tally);
        books(tally);
        const hp = huePass(t.data, t.w, t.h);
        lap(tally, `separation: white point ${N}, the hue pass`);
        const an = clusterPass(hp);
        lap(tally, `separation: white point ${N}, the clustering`);
        const map = classMap(an);
        lap(tally, `separation: white point ${N}, painting the class map`);
        const fIdx = clusterAt(an, pts.f[0], pts.f[1]), nIdx = clusterAt(an, pts.n[0], pts.n[1]);
        const sIdx = an.clusters.findIndex((_, i) => i !== fIdx);
        const shiftA = (c: number): number | null => c === fIdx ? shortWay(an.clusters[c].medHue, SEP_TARGET_FOLIAGE) : c === sIdx ? shortWay(an.clusters[c].medHue, SEP_TARGET_SKY) : null;
        const shiftB = (c: number): number | null => c === fIdx || c === sIdx ? null : 60;
        const turnA = turnClusters(t.data, an, shiftA);
        const turnB = turnClusters(t.data, an, shiftB);
        lap(tally, `separation: white point ${N}, the two turns`);
        progress(`White point ${N}: showing the pictures`);
        const rd = s.spec ? readBalance(P.wb, s.spec) : null;
        const sec = document.createElement("section");
        sec.style.cssText = "margin:18px 0";
        const hd = document.createElement("h4");
        hd.style.cssText = "font-size:0.9375rem;margin:0 0 6px";
        hd.textContent = `White point ${N} of 3: ${P.name}`;
        sec.appendChild(hd);
        host.appendChild(sec);
        const r1 = document.createElement("div");
        r1.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin:0 0 8px";
        sec.appendChild(r1);
        sepFigure(r1, `White point ${N}, ${P.name}: the photograph drawn with red and blue swapped and no look.`, t.data, t.w, t.h);
        sepFigure(r1, `White point ${N}, class map: each hue cluster has its own colour and its letter; grey is below the floor; the dotted pattern is above the floor and in no cluster.`, map.data, t.w, t.h, map.labels);
        const ul = document.createElement("ul");
        ul.style.cssText = "margin:0 0 8px;padding-left:1.2rem;font-size:0.8125rem;line-height:1.5;color:var(--txt-2)";
        const li = (text: string) => { const e2 = document.createElement("li"); e2.textContent = text; ul.appendChild(e2); };
        for (const c of an.clusters) li(`${c.letter}, ${c.colour}: hue ${Math.round(c.startDeg) > Math.round((c.startDeg + c.spanDeg) % 360) ? `${Math.round(c.startDeg)} to 360 and 0 to ${Math.round((c.startDeg + c.spanDeg) % 360)}, an arc through 0` : `${Math.round(c.startDeg)} to ${Math.round((c.startDeg + c.spanDeg) % 360)}`} degrees, ${(c.share * 100).toFixed(1)} percent of the pixels above the floor${an.clusters.indexOf(c) === fIdx ? ", holds the foliage spot" : ""}${an.clusters.indexOf(c) === nIdx ? ", holds the neutral spot" : ""}.`);
        li("Grey: below the floor. Dotted pattern: above the floor and in no cluster.");
        sec.appendChild(ul);
        const r2 = document.createElement("div");
        r2.style.cssText = "display:flex;flex-wrap:wrap;gap:10px;margin:0 0 8px";
        sec.appendChild(r2);
        sepFigure(r2, `White point ${N}, turn A: the foliage cluster turned so its middle lands on ${SEP_TARGET_FOLIAGE} degrees and the sky cluster on ${SEP_TARGET_SKY}, every other pixel held.`, turnA, t.w, t.h);
        sepFigure(r2, `White point ${N}, turn B: every cluster but the foliage and sky ones turned by plus 60 degrees, those two and everything below the floor held.`, turnB, t.w, t.h);
        row(`White point ${N}: ${P.name}`, `gains ${P.wb.map((g) => g.toFixed(4)).join(", ")} · exposure ${P.exposure.toFixed(4)} · ${rd ? `reads as ${Math.round(rd.kelvin)} K, tint ${Math.round(rd.tint)}` : "no temperature read"}`, `From ${P.why}. Drawn once, with the swap on and no look.`);
        row(`White point ${N}: the floor`, `${SAT_GUARD_LO} · ${((1 - (hp.above / (t.w * t.h))) * 100).toFixed(1)} percent of pixels below it`, "Saturation of the drawn pixel below which a pixel is in no cluster.");
        // ONE CLUSTER OVER THE WHOLE WHEEL cannot be told from a rule that missed the valleys without the counts, so the counts follow and the words say it.
        const wide = an.clusters.find((c) => c.spanDeg >= 340);
        row(`White point ${N}: the clusters`, `${an.clusters.length} ${an.clusters.length === 1 ? "cluster" : "clusters"} · neutral spot in ${nIdx >= 0 ? an.clusters[nIdx].letter : "no cluster"} · foliage spot in ${fIdx >= 0 ? an.clusters[fIdx].letter : "no cluster"} · sky cluster ${sIdx >= 0 ? an.clusters[sIdx].letter : "none"}${wide ? ` · ONE CLUSTER SPANS THE WHOLE WHEEL: cluster ${wide.letter} covers ${Math.round(wide.spanDeg)} of 360 degrees and holds ${(wide.share * 100).toFixed(1)} percent, so no valley separates the hues at this white point` : ""}`,
          "Found by the rule in the settings row. A spot in no cluster means its patch fell below the floor or between clusters. A cluster covering nearly the whole wheel means the rule found no valley between the hues of the pixels above the floor; the counts row beside it holds the shape the rule was given.");
        row(`White point ${N}: the hue counts`, an.hist.join(" "),
          `The ${an.above} pixels above the floor counted in each of the ${SEP_BINS} hue bins of ${SEP_BIN_DEG} degrees, in order from the bin of 0 to ${SEP_BIN_DEG} degrees, as whole numbers; the sum is ${an.hist.reduce((x, y) => x + y, 0)}. These are the counts the clustering rule reads, so a valley, or the lack of one, can be seen in them.`);
        for (const c of an.clusters) {
          row(`White point ${N}, cluster ${c.letter} (${c.colour})`, `hue ${Math.round(c.startDeg) > Math.round((c.startDeg + c.spanDeg) % 360) ? `${Math.round(c.startDeg)} to 360 and 0 to ${Math.round((c.startDeg + c.spanDeg) % 360)}, an arc through 0` : `${Math.round(c.startDeg)} to ${Math.round((c.startDeg + c.spanDeg) % 360)}`} degrees, middle ${Math.round(c.medHue)} · ${(c.share * 100).toFixed(1)} percent · median saturation ${c.medSat.toFixed(2)}, median value ${c.medVal.toFixed(2)}`, "Range, share of the pixels above the floor, and the medians of the pixels in it.");
        }
        row(`White point ${N}: the turns`, `A: foliage ${fIdx >= 0 ? `${Math.round(an.clusters[fIdx].medHue)} to ${SEP_TARGET_FOLIAGE}` : "no cluster, not turned"}, sky ${sIdx >= 0 ? `${Math.round(an.clusters[sIdx].medHue)} to ${SEP_TARGET_SKY}` : "no cluster, not turned"} · B: ${an.clusters.filter((_, i) => i !== fIdx && i !== sIdx).map((c) => c.letter).join(", ") || "no other cluster"} by plus 60`,
          "The middle hue of the cluster, and where turn A takes it; the clusters turn B moves.");
        await pause(tally);
      }
      sepTimeRowsFor(tally);
      progress("Done. The three white points are drawn and turned; copy the picture checks to send the numbers.", true);
      $("dSepHint").textContent = "Done. The pictures are above and the numbers are in the picture checks' list, ready to copy.";
    } finally {
      closeSep();
    }
  });
});

/** The second press's time rows, written after its stages. Takes its tally. Returns nothing. */
function sepTimeRowsFor(tally: PressTally): void {
  lap(tally, TAIL_STAGE);
  sepTimeRows(tally, performance.now() - pressStart);
}

// --- THE SWEEP (records 106 and 084) ---------------------------------------------------------------------------------------
// The Separation check's instrument for the device: the picked photograph drawn at a grid of balances over the camera's reach and
// under the channel remaps the editor has, each setting counted in the check's own bins. It sets no band, no balance and no look; the
// rule, the floor, the bins, the targets, the soft edge and the minimum above are the ones the check uses and are not read or changed here.

/** The five mixer presets of the editor (src/main.ts, `MIX3_PRESETS`, which is private to that module and so copied here), in its order, each
 *  a 3 by 3 matrix of nine numbers, row by row. What it must satisfy: the same nine numbers as main.ts for the same label. */
const SWEEP_PRESETS: { label: string; m: number[] }[] = [
  { label: "Identity", m: [1, 0, 0, 0, 1, 0, 0, 0, 1] },
  { label: "R⇄B swap", m: [0, 0, 1, 0, 1, 0, 1, 0, 0] },
  { label: "Channel cycle", m: [0, 1, 0, 0, 0, 1, 1, 0, 0] },
  { label: "Copper", m: [1.1, 0.3, 0, 0.2, 0.7, 0.1, 0, 0.2, 0.8] },
  { label: "Film rotation", m: [0, 0, 1, 1, 0, 0, 0, 1, 0] },
];
/** The grid: five Temperatures from the scale's far end to its near end, in mired, and five Tints from the scale's lowest to its highest. */
const SWEEP_STEPS = 5;
const SWEEP_TINTS = [-150, -75, 0, 75, 150];

/** One setting of the sweep: how it is drawn, and what to call it. `skip` is set when the setting cannot be drawn, with the reason in words. */
interface SweepSetting {
  route: string; what: string; wb: [number, number, number]; screen: [number, number, number] | null; swap: boolean; mix3: number[] | null;
  exposure: number; mixer: string; reading: { kelvin: number; tint: number } | null; reuse: ReturnType<typeof thin> | null; skip: string | null;
  /** True when `skip` is set because the balance's gains leave the gain sliders' track or no gains can give it, so the summary counts it apart from a setting that failed to draw. */
  notExpressible?: boolean;
}

/** Takes one drawn, thinned frame. Returns the 72 hue counts of the pixels at or above the floor, a ten-band saturation count of every pixel
 *  (band 0 holds 0 to 10 percent), how many pixels are above the floor and the share under it. What it must satisfy: the hue counts and the
 *  number above the floor are `huePass`'s own, so the sweep counts exactly as the check does. It also gives back that pass (`hp`), whole,
 *  so the labelled split reads the same hue and saturation of every pixel and the frame is not passed twice. */
function sweepCounts(t: ReturnType<typeof thin>): { hue: number[]; sat: number[]; above: number; under: number; hp: SepHues } {
  const hp = huePass(t.data, t.w, t.h);
  const sat: number[] = new Array(10).fill(0);
  for (let i = 0; i < hp.sat.length; i++) sat[Math.min(9, Math.floor(hp.sat[i] * 10))]++;
  const n = t.w * t.h;
  return { hue: hp.hist, sat, above: hp.above, under: n ? 1 - hp.above / n : 0, hp };
}

/** Takes a sweep setting. Returns the edit that draws it: the swap as the setting says, the mixer if it has one, the screen-side gains if it
 *  has them, no look and every other control at its neutral. Throws when the drawn path does not cover it. */
function sweepEdit(st: SweepSetting): EditParams {
  const over: Partial<EditParams> = { wb: st.wb, exposure: st.exposure, swapRB: st.swap };
  if (st.screen) over.wbScreen = st.screen;
  if (st.mix3) over.mix3 = st.mix3;
  const p = pictureParams(over);
  if (!canDrawFrame(p)) throw new Error("this edit is outside what the drawn path covers yet");
  return p;
}

/** Takes the open state of the Separation check. Returns the settings in the order the sweep draws them: the opening balance with the swap on
 *  (the first picture, reused) and off; the grid by three routes, which are the camera-side gains with the swap on and off and the screen-side
 *  gains with the swap on; then the five mixer presets at the opening balance with the swap on (the identity preset reuses the first picture).
 *  A balance whose gains leave the track, or that no gains can give, is a setting with `skip` set. */
function sweepSettings(s: SepState): SweepSetting[] {
  const list: SweepSetting[] = [];
  const open = s.spec ? readBalance(s.wb0, s.spec) : null;
  const base = (over: Partial<SweepSetting>): SweepSetting => ({ route: "", what: "", wb: s.wb0, screen: null, swap: true, mix3: null, exposure: s.exp0, mixer: "none", reading: open, reuse: null, skip: null, ...over });
  list.push(base({ route: "camera-side gains, swap on", what: "the opening balance", reuse: s.t }));
  list.push(base({ route: "camera-side gains, swap off", what: "the opening balance", swap: false }));
  if (!s.spec) {
    list.push(base({ route: "grid", what: "every Temperature and Tint", skip: "the file has no matrix to read a temperature through, so no balance on the grid can be made" }));
  } else {
    for (let i = 0; i < SWEEP_STEPS; i++) {
      const mired = Math.round(TEMPERATURE_MIRED_FAR + ((TEMPERATURE_MIRED_NEAR - TEMPERATURE_MIRED_FAR) * i) / (SWEEP_STEPS - 1));
      for (const tint of SWEEP_TINTS) {
        const want = { mired, tint };
        const at = `${mired} mired, tint ${tint}`;
        const cam = exactBalance(want, s.wb0, s.spec);
        const scr = screenForWhite(want, s.wb0, s.spec);
        const kelvin = 1e6 / mired;
        const outside = cam ? cam.some((g) => !(g >= WB_GAIN_LO && g <= WB_GAIN_HI)) : false;
        const camWhy = !cam
          ? `Temperature ${Math.round(kelvin)} K (${mired} mired), tint ${tint}: this balance is not expressible, because no camera-side gains can give it`
          : outside ? `Temperature ${Math.round(kelvin)} K (${mired} mired), tint ${tint}, gains ${cam.map((g) => g.toFixed(4)).join(", ")}: this balance is not expressible, because its gains leave the gain sliders' track of ${WB_GAIN_LO} to ${WB_GAIN_HI.toFixed(4)}`
          : null;
        for (const swap of [true, false]) {
          list.push(base({ route: `camera-side gains, swap ${swap ? "on" : "off"}`, what: at, wb: cam ?? s.wb0, swap, reading: { kelvin, tint }, skip: camWhy, notExpressible: camWhy !== null }));
        }
        list.push(base({ route: "screen-side gains, swap on", what: at, screen: scr, reading: { kelvin, tint }, skip: scr ? null : `Temperature ${Math.round(kelvin)} K (${mired} mired), tint ${tint}: this balance is not expressible, because no screen-side gains can give it`, notExpressible: !scr }));
      }
    }
  }
  SWEEP_PRESETS.forEach((p, i) => list.push(base({ route: `mixer preset ${p.label}, swap on`, what: "the opening balance", mix3: i === 0 ? null : p.m, mixer: p.label, reuse: i === 0 ? s.t : null })));
  return list;
}

sepSweepBtn.addEventListener("click", (e) => {
  const s = sep;
  if (!s) { $("dSepHint").textContent = "Press step 1 first: the picture has to be drawn before the sweep can run."; return; }
  void sepPress(e.currentTarget as HTMLButtonElement, false, async (tally) => {
    const list = sweepSettings(s);
    const t0 = performance.now();
    let ran = 0, reused = 0, skipped = 0, notExpr = 0;
    let diagnosed = false;
    // One sample for the whole press, taken from the photograph's own linear pixels and the bitmap the first press built.
    const sweepSample: PanelSample = takePanelSample(s.subject.img, s.mask, 0);
    lap(tally, "sweep: the keying's sample");
    row("The sweep's own settings", `${list.length} settings · grid ${SWEEP_STEPS} Temperatures by ${SWEEP_TINTS.length} Tints over ${TEMPERATURE_MIRED_FAR} to ${TEMPERATURE_MIRED_NEAR} mired and tints ${SWEEP_TINTS.join(", ")} · ${SEP_FIGURES} · ${SEP_BINS} bins of ${SEP_BIN_DEG} degrees`,
      "Three routes at each grid point: the camera-side gains the check writes, with the swap on and off, and the screen-side gains the editor writes for Temperature and Tint while the swap is on, over the opening balance. Then the opening balance under each of the editor's five mixer presets. The sweep sets no look, no band and no control; the rule, the floor and the bins are the Separation check's own. A balance that cannot be made is a row that says so and is not drawn. Each counted setting is also split by the labels of the first picture (sky by the app's own sky selection, neutral by saturation at the opening render, foliage by the vegetation axis on the linear copy at the opening gains, the rest other), and the figures in this row are the measure's own.");
    for (let k = 0; k < list.length; k++) {
      const st = list[k];
      const N = k + 1;
      const name = `Sweep ${N} of ${list.length}: ${st.route}, ${st.what}`;
      if (st.skip) { row(name, `not run · ${st.skip}`, `Not drawn. Route: ${st.route}. ${st.skip}.`); if (st.notExpressible) notExpr++; else skipped++; continue; }
      progress(`Sweep ${N} of ${list.length}: ${st.route}, ${st.what}`);
      await pause(tally);
      books(tally);
      let t = st.reuse;
      if (t) reused++;
      else {
        try {
          const frame = s.drawing.draw(sweepEdit(st));
          lap(tally, "sweep: a draw and read-back");
          t = thin(frame);
          lap(tally, "sweep: the picture thinned");
          if (!diagnosed) {
            diagnosed = true;
            probeRows("after the sweep's first draw", s.drawing.probe());
            channelRows("after the sweep's first draw", frame, t);
            lap(tally, "sweep: the drawing surface's report and the frame's raw values");
          }
        } catch (err) {
          row(name, "not run", `The setting could not be drawn (${(err as Error).message}).`);
          skipped++;
          continue;
        }
      }
      const c = sweepCounts(t);
      lap(tally, "sweep: the hue and saturation counts");
      // THE SPLIT: the same counted pixels, by label, then the measure. A frame that is not the labels' size cannot be split, and says so.
      let split: string;
      try { split = sepWords(sepMeasure(labelledStats(c.hp, s.labels))); } catch (err) { split = `not split by label (${(err as Error).message})`; }
      lap(tally, "sweep: the labelled counts and the measure");
      let keyWords: string;
      try { keyWords = panelKeyWords(keyPanelCentres(sweepSample, sweepEdit(st), s.subject.img.camMatrix, s.subject.img.width / s.subject.img.height, null)); } catch (err) { keyWords = `not keyed (${(err as Error).message})`; }
      lap(tally, "sweep: the panel's keying");
      const rd =st.screen && s.spec ? readShown(st.wb, st.screen, s.spec) : st.reading;
      const px = t.w * t.h;
      row(name,
        `${rd ? `${Math.round(rd.kelvin)} K, tint ${Math.round(rd.tint)}` : "no temperature read"} · gains ${st.wb.map((g) => g.toFixed(4)).join(", ")} · screen-side gains ${st.screen ? st.screen.map((g) => g.toFixed(4)).join(", ") : "none"} · exposure ${st.exposure.toFixed(4)} · swap ${st.swap ? "on" : "off"} · mixer ${st.mixer} · panel keying, ${keyWords} · ${c.above} of ${px} pixels at or above the floor, ${(c.under * 100).toFixed(1)} percent under it · separation, ${split} · saturation bands of every pixel, 0 to 10 percent first: ${c.sat.join(" ")} · hue counts: ${c.hue.join(" ")}`,
        `${st.reuse ? "The first picture, counted again, not drawn again. " : ""}The ${SEP_BINS} hue counts are the pixels at or above the floor in bins of ${SEP_BIN_DEG} degrees from 0; the ten saturation counts are every pixel; the share under the floor is the pixels below ${SAT_GUARD_LO} saturation. Counts only, of the drawn pixels, thinned to every ${t.k === 1 ? "pixel" : `${t.k}th pixel`}. The separation figures split the same counted pixels into sky, neutral, foliage and other as the first picture labelled them, give each population's circular mean hue and resultant length, and for the sky and the foliage the Hellinger distance between their hue counts (0 for the same counts, 1 for counts sharing no bin) and the angle between their means; the neutral population is the control.`);
      ran++;
    }
    row("The sweep", `${ran} of ${list.length} settings counted (${reused} from the first picture, ${notExpr} not expressible, ${skipped} not run for another reason) in ${dur(performance.now() - t0)}`, "How many settings the sweep counted and how long the whole sweep took, from the first setting to the last row.");
    sepTimeRowsFor(tally);
    progress(`Sweep done. ${ran} of ${list.length} settings counted, ${notExpr} not expressible, ${skipped} not run for another reason; the rows are in the picture checks' list, ready to copy.`, true);
    $("dSepHint").textContent = "The sweep is done. Its rows are in the picture checks' list, ready to copy. You can press it again, or press step 3.";
  });
});

const picOut: string[] = [];
($("dPictures") as HTMLButtonElement).addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  const list = $("dPicResults");
  if (running) { list.replaceChildren(); const m = document.createElement("p"); m.className = "dbg-progress"; m.textContent = "Another test on this page is still running. Press this again when it has finished."; list.appendChild(m); return; }
  const others = ["dRun", "dBigRead", "dSlowBuild"].map((id) => $(id) as HTMLButtonElement);
  btn.disabled = true;
  others.forEach((b) => { b.disabled = true; });
  const was = btn.textContent;
  btn.textContent = "Running…";
  running++;
  list.replaceChildren();
  picOut.length = 0;
  rowsInto = list; outInto = picOut;
  pressStart = performance.now();
  const tally = newTally(pressStart);
  progress("Starting the picture checks");
  try {
    await refreshReport();
    lap(tally, "taking the device report again");
    const finished = await pictureChecks(tally);
    const whole = performance.now() - pressStart;
    row("Time: the whole press", dur(whole), "From the press of the button to the last row, the report's own build, the drawing and the reading together.");
    const sum = pressTotal(tally);
    const tail = tally.stages.get(TAIL_STAGE)?.[0] ?? 0;
    row("Time: every row added together",
      `${dur(sum)} against the whole press ${dur(whole)}, ${dur(Math.max(0, whole - sum))} in no row; the last stretch, writing the time rows and giving the drawing surface back, ${dur(tail)}, is in this sum and in no row above it`,
      "Every stretch of the press from the button to this line is in one named row above, and this line adds them: the rows' times, the waiting and bookkeeping rows and the last stretch. The difference from the whole press is what lay in no row.");
    progress(finished ? `Done. All three checks ran and the whole press took ${dur(whole)}.` : `Stopped before the checks finished, as the rows say. The press took ${dur(whole)}.`, true);
  } catch (err) {
    row("The picture checks", "not run", `${(err as Error).message}.`);
    progress(`Stopped: ${(err as Error).message}.`, true);
  } finally {
    rowsInto = results; outInto = out;
    running--;
    btn.textContent = was;
    btn.disabled = false;
    others.forEach((b) => { b.disabled = false; });
  }
});
const picCopy = $("dPicCopy") as HTMLButtonElement;
picCopy.addEventListener("click", () => copy(textArea.value + "\nPicture checks\n" + (picOut.length ? picOut.join("\n") : "not run yet: the picture checks have not been run on this page since it opened") + "\n", picCopy, "Copy the picture checks"));

($("dBigRead") as HTMLButtonElement).addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = "Running…";
  running++;
  try { await readingFromABigStore(); } finally { running--; }
  btn.textContent = was;
  btn.disabled = false;
  const copyBtn = $("dCopyAll") as HTMLButtonElement;
  copyBtn.hidden = false;
  copyBtn.onclick = () => copy(textArea.value + "\nSpeed\n" + out.join("\n") + "\n", copyBtn, "Copy the results");
});

($("dSlowBuild") as HTMLButtonElement).addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = "Running…";
  running++;
  try { await whatMakesTheBuildSlow(); } finally { running--; }
  btn.textContent = was;
  btn.disabled = false;
  const copyBtn = $("dCopyAll") as HTMLButtonElement;
  copyBtn.hidden = false;
  copyBtn.onclick = () => copy(textArea.value + "\nSpeed\n" + out.join("\n") + "\n", copyBtn, "Copy the results");
});

($("dRun") as HTMLButtonElement).addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Running…";
  running++;
  results.replaceChildren();
  out.length = 0;
  // One moment for the whole block: the report is re-taken with the numbers,
  // and it is what "Copy the results" puts above them.
  await refreshReport();
  await shaderRoom();
  await graphics();
  await buildingThePictureCode();
  threads();
  theHoldWatch();
  await exportOnTheGpu();
  await decoding();
  await buildingATile();
  await whatColourNoiseCosts();
  await sameEverywhere();
  await drawnVersusComputed();
  await aCanvasTheSizeOfTheFrame();
  await theCanvasTheExportUses();
  await fullResolutionPreview();
  await storage();
  running--;
  btn.textContent = "Run again";
  btn.disabled = false;
  const copyBtn = $("dCopyAll") as HTMLButtonElement;
  copyBtn.hidden = false;
  copyBtn.onclick = () => copy(textArea.value + "\nSpeed\n" + out.join("\n") + "\n", copyBtn, "Copy the results");
});
