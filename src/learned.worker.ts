// THE TABLET'S MEASURE, RUN IN A WORKER: can this device load and run a learned image encoder, how fast, and what does it offer to do it with.
//
// It runs ONNX Runtime Web (the WebAssembly-only build, `onnxruntime-web/wasm`) on one thread, off the page's
// thread, over MobileSAM's image encoder and its one-mask decoder, both fetched from this app's own site
// (`/ort/` for the runtime's WebAssembly file, `/models/mobilesam/` for the models, the encoder in two parts
// joined here). It draws no mask and offers no selection: it times the encoder three times and the decoder once
// after each, and reports what it found, stage by stage, to the test page, which turns it into rows.
//
// THIS READS THE PAGE'S DRAWN PRACTICE PICTURE ON PURPOSE. The rule that a mask and every selection read the
// photograph's own decode (record 032) is about what a selection is cut from. This measures the device, makes no
// mask and no selection, and any picture of the right size gives the same times, so the picture the test page
// already draws is the planted input.
//
// Every stage is caught on its own: a stage that fails posts its error as its own result and the stages after it
// are reported as not run, so a refusal is an answer about the device and never a silent stop.

import * as ort from "onnxruntime-web/wasm";

/** One stage of the measure. `state` is "ok", "failed" or "not run"; `ms` is how long the stage took (0 when it
 *  did not run); `detail` is the stage's own words: what it found, or the error's message, or why it did not run. */
export interface Stage { state: "ok" | "failed" | "not run"; ms: number; detail: string }

/** One stage that runs several times: the same states as `Stage`, the time of each run in milliseconds in order. */
export interface Runs { state: "ok" | "failed" | "not run"; times: number[]; detail: string }

/** One file fetched from this site: its name, the bytes that came back and the time the fetch took. */
export interface FileFetch { name: string; bytes: number; ms: number }

/** What this browser offers, read inside the worker: cores, whether the page is cross-origin isolated, whether
 *  SharedArrayBuffer and WebAssembly SIMD are there, and what WebGPU answered (`gpu` is "not offered" when the
 *  browser has no `navigator.gpu`, "no adapter" when it has and none answered, else the adapter's words). */
export interface Offers { cores: number; isolated: boolean; sharedMemory: boolean; simd: boolean; gpu: string }

/** The whole report one press gives. What it must satisfy: every field is filled, a stage that did not run says
 *  so in its `state`, and `memory` is words ("not reported" where the browser gives no figure), never empty. */
export interface LearnedReport {
  offers: Offers;
  wasmFile: Stage & { bytes: number };
  files: FileFetch[];
  filesProblem: string;
  join: Stage & { bytes: number };
  decoderSession: Stage;
  encoderSession: Stage;
  encoder: Runs;
  decoder: Runs;
  outputs: string;
  memory: string;
}

/** The message the page sends: the planted picture, RGBA, its long side already 1,024 pixels. */
interface Planted { width: number; height: number; data: Uint8ClampedArray }

interface WorkerScope {
  addEventListener(t: "message", fn: (e: MessageEvent) => void): void;
  postMessage(m: unknown): void;
}
const scope = self as unknown as WorkerScope;

const RUNS = 3;
const GPU_WAIT_MS = 5000;

/** Hex of a SHA-256 over `bytes`. Takes the bytes; returns the lower-case hex string. */
async function sha256(bytes: Uint8Array): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** The first of `keys` that `o` holds as a number or a string, else undefined. Takes a loose object and the key
 *  names the manifest may use; returns that value. The manifest's exact key names were not known when this was
 *  written, so the reader accepts the likely ones and the stage names the key it could not find. */
function pick(o: unknown, keys: string[]): string | number | undefined {
  if (!o || typeof o !== "object") return undefined;
  for (const k of keys) {
    const v = (o as Record<string, unknown>)[k];
    if (typeof v === "string" || typeof v === "number") return v;
  }
  return undefined;
}

/** What the browser offers. Takes nothing; returns the `Offers`, with WebGPU asked under a time limit so it
 *  cannot hold the press. What it must satisfy: it never throws and never waits longer than GPU_WAIT_MS. */
async function readOffers(): Promise<Offers> {
  const nav = navigator as unknown as { gpu?: { requestAdapter(): Promise<null | { info?: { vendor?: string; architecture?: string; description?: string } }> } };
  let gpu = "not offered";
  if (nav.gpu) {
    try {
      const a = await Promise.race([
        nav.gpu.requestAdapter(),
        new Promise<"late">((r) => setTimeout(() => r("late"), GPU_WAIT_MS)),
      ]);
      if (a === "late") gpu = `offered, but no answer in ${GPU_WAIT_MS / 1000} seconds`;
      else if (!a) gpu = "offered, but no adapter answered";
      else {
        const i = a.info;
        const words = [i?.vendor, i?.architecture, i?.description].filter(Boolean).join(" ");
        gpu = `offered, an adapter answered${words ? ` (${words})` : ""}`;
      }
    } catch (e) {
      gpu = `offered, but asking failed: ${String((e as Error)?.message ?? e)}`;
    }
  }
  // The eight-byte header and a body holding one SIMD instruction: the standard feature probe (the one
  // wasm-feature-detect publishes). `WebAssembly.validate` says true only where SIMD is supported.
  const simdModule = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11]);
  let simd = false;
  try { simd = WebAssembly.validate(simdModule); } catch { simd = false; }
  return {
    cores: navigator.hardwareConcurrency || 0,
    isolated: !!(self as unknown as { crossOriginIsolated?: boolean }).crossOriginIsolated,
    sharedMemory: typeof SharedArrayBuffer !== "undefined",
    simd,
    gpu,
  };
}

/** Fetches one path from this site and times it. Takes the absolute path; returns the bytes and the file's
 *  record. Throws with the status when the answer is not a success. */
async function timedFetch(path: string): Promise<{ bytes: Uint8Array; file: FileFetch }> {
  const t0 = performance.now();
  const res = await fetch(path);
  if (!res.ok) throw new Error(`${path} answered ${res.status}`);
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { bytes, file: { name: path.split("/").pop() || path, bytes: bytes.length, ms: performance.now() - t0 } };
}

/** The memory the browser reports, as words. Takes nothing; returns the JS heap used and total where the
 *  browser gives `performance.memory` (Chromium), else "not reported". What it must satisfy: it says that the
 *  runtime's own WebAssembly memory is not in this figure, so a small number is not read as a small model. */
function memoryWords(): string {
  const m = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }).memory;
  if (!m) return "not reported";
  const mb = (n: number) => `${(n / 1048576).toFixed(0)} MB`;
  return `${mb(m.usedJSHeapSize)} of JavaScript heap used, ${mb(m.totalJSHeapSize)} held (the runtime's own WebAssembly memory is not in this figure)`;
}

const ranOk = (ms: number, detail: string): Stage => ({ state: "ok", ms, detail });
const notRun = (why: string): Stage => ({ state: "not run", ms: 0, detail: why });
const failed = (ms: number, e: unknown): Stage => ({ state: "failed", ms, detail: String((e as Error)?.message ?? e) });

/** The whole measure. Takes the planted picture; returns the report. What it must satisfy: the picture's
 *  long side is the one the model wants (the page resized it), the encoder is fed it as `input_image` in the
 *  0 to 255 range as height by width by 3, and each time in the report is `performance.now()` taken around
 *  exactly that call. The runtime is told to use one thread and no proxy worker, because this already runs in a
 *  worker and the site sends no cross-origin isolation headers. */
async function measure(pic: Planted, post: (text: string) => void): Promise<LearnedReport> {
  const rep: LearnedReport = {
    offers: { cores: 0, isolated: false, sharedMemory: false, simd: false, gpu: "not read" },
    wasmFile: { ...notRun("not reached"), bytes: 0 },
    files: [], filesProblem: "",
    join: { ...notRun("not reached"), bytes: 0 },
    decoderSession: notRun("not reached"), encoderSession: notRun("not reached"),
    encoder: { state: "not run", times: [], detail: "not reached" },
    decoder: { state: "not run", times: [], detail: "not reached" },
    outputs: "", memory: "not reported",
  };
  post("Asking what this browser offers");
  rep.offers = await readOffers();

  // THE RUNTIME'S OWN FILE, fetched here first so its network time stands apart from the time the runtime takes
  // to instantiate it (the runtime fetches it again by itself and finds it kept).
  post("Fetching the runtime's WebAssembly file");
  try {
    const t0 = performance.now();
    const res = await fetch("/ort/ort-wasm-simd-threaded.wasm");
    if (!res.ok) throw new Error(`/ort/ort-wasm-simd-threaded.wasm answered ${res.status}`);
    const n = (await res.arrayBuffer()).byteLength;
    rep.wasmFile = { ...ranOk(performance.now() - t0, "fetched"), bytes: n };
  } catch (e) {
    rep.wasmFile = { ...failed(0, e), bytes: 0 };
  }

  // THE MODEL FILES: the manifest, the encoder's parts in order, the decoder. Joined and checked against the manifest.
  let encBytes: Uint8Array | null = null;
  let decBytes: Uint8Array | null = null;
  let manifest: unknown = null;
  try {
    post("Fetching the model list");
    const m = await timedFetch("/models/mobilesam/manifest.json");
    rep.files.push(m.file);
    manifest = JSON.parse(new TextDecoder().decode(m.bytes));
    const enc = (manifest as Record<string, unknown>).encoder;
    const dec = (manifest as Record<string, unknown>).decoder;
    const parts = (enc && typeof enc === "object" ? (enc as Record<string, unknown>).parts : undefined);
    if (!Array.isArray(parts) || !parts.length) throw new Error("the manifest names no encoder parts (looked for encoder.parts)");
    const decName = pick(dec, ["file", "name"]);
    if (typeof decName !== "string") throw new Error("the manifest names no decoder file (looked for decoder.file or decoder.name)");

    const got: Uint8Array[] = [];
    for (let i = 0; i < parts.length; i++) {
      const pn = pick(parts[i], ["file", "name"]);
      if (typeof pn !== "string") throw new Error(`encoder part ${i} has no file name in the manifest`);
      post(`Fetching the encoder, part ${i + 1} of ${parts.length}`);
      const f = await timedFetch(`/models/mobilesam/${pn}`);
      rep.files.push(f.file);
      got.push(f.bytes);
    }
    post("Fetching the decoder");
    const d = await timedFetch(`/models/mobilesam/${decName}`);
    rep.files.push(d.file);
    decBytes = d.bytes;

    // The join: the parts in the manifest's order into one buffer, its length and its digest against the manifest's.
    post("Joining the encoder's parts");
    const t0 = performance.now();
    const total = got.reduce((s, p) => s + p.length, 0);
    const whole = new Uint8Array(total);
    let at = 0;
    for (const p of got) { whole.set(p, at); at += p.length; }
    const wantSize = Number(pick(enc, ["size", "bytes"]));
    const wantHash = pick(enc, ["sha256"]);
    const gotHash = await sha256(whole);
    const decWant = pick(dec, ["sha256"]);
    const decHash = await sha256(decBytes);
    const sizeOk = Number.isFinite(wantSize) ? wantSize === total : null;
    const hashOk = typeof wantHash === "string" ? wantHash === gotHash : null;
    const decOk = typeof decWant === "string" ? decWant === decHash : null;
    const word = (v: boolean | null) => (v === null ? "not in the manifest" : v ? "matches" : "DOES NOT MATCH");
    const detail = `${total.toLocaleString("en-US")} bytes joined from ${parts.length} parts; size ${word(sizeOk)}, digest ${word(hashOk)}; the decoder's digest ${word(decOk)}`;
    const ms = performance.now() - t0;
    if (sizeOk === false || hashOk === false || decOk === false) {
      rep.join = { state: "failed", ms, detail, bytes: total };
      throw new Error("a file did not match the manifest, so the models were not loaded");
    }
    rep.join = { state: "ok", ms, detail, bytes: total };
    encBytes = whole;
  } catch (e) {
    rep.filesProblem = String((e as Error)?.message ?? e);
  }

  if (!encBytes || !decBytes) {
    const why = `the files did not come together: ${rep.filesProblem || "no reason given"}`;
    rep.decoderSession = notRun(why); rep.encoderSession = notRun(why);
    rep.encoder = { state: "not run", times: [], detail: why };
    rep.decoder = { state: "not run", times: [], detail: why };
    rep.memory = memoryWords();
    return rep;
  }

  // THE RUNTIME LOADS WITH THE FIRST SESSION: there is no call that loads it alone, so the first session (the
  // smaller decoder) carries the runtime's instantiation as well as its own parse; the encoder's follows and
  // carries only its own.
  ort.env.wasm.wasmPaths = "/ort/";
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  const opts = { executionProviders: ["wasm"] };
  let decSession: ort.InferenceSession | null = null;
  let encSession: ort.InferenceSession | null = null;
  post("Loading the runtime and the decoder");
  {
    const t0 = performance.now();
    try {
      decSession = await ort.InferenceSession.create(decBytes, opts);
      rep.decoderSession = ranOk(performance.now() - t0, `inputs ${decSession.inputNames.join(", ")}`);
    } catch (e) {
      rep.decoderSession = failed(performance.now() - t0, e);
    }
  }
  if (decSession) {
    post("Loading the encoder");
    const t0 = performance.now();
    try {
      encSession = await ort.InferenceSession.create(encBytes, opts);
      rep.encoderSession = ranOk(performance.now() - t0, `inputs ${encSession.inputNames.join(", ")}`);
    } catch (e) {
      rep.encoderSession = failed(performance.now() - t0, e);
    }
  } else {
    rep.encoderSession = notRun("the runtime or the decoder did not load first");
  }

  if (!encSession || !decSession) {
    const why = !decSession ? "the runtime or the decoder did not load" : "the encoder did not load";
    rep.encoder = { state: "not run", times: [], detail: why };
    rep.decoder = { state: "not run", times: [], detail: why };
    rep.memory = memoryWords();
    return rep;
  }

  // THE RUNS. The encoder takes the picture as height by width by 3 in 0 to 255 under the name `input_image`
  // (it normalises and pads inside); the decoder takes the embeddings, one point at the picture's centre with
  // label 1 and the padding point of label -1 that it asks for when no box is given, an empty mask input with
  // its flag at 0, and the picture's size as height, width. Names and shapes as research/2026-11-masks/scripts/
  // points-decode-models.mjs feeds them (lines 116 and 134 to 141).
  const { width: W, height: H, data } = pic;
  const rgb = new Float32Array(W * H * 3);
  for (let i = 0, j = 0; i < W * H; i++, j += 3) { rgb[j] = data[4 * i]; rgb[j + 1] = data[4 * i + 1]; rgb[j + 2] = data[4 * i + 2]; }
  const input = new ort.Tensor("float32", rgb, [H, W, 3]);
  const pts = new Float32Array([W / 2, H / 2, 0, 0]);
  const labs = new Float32Array([1, -1]);
  const encTimes: number[] = [];
  const decTimes: number[] = [];
  let encErr = "";
  let decErr = "";
  for (let r = 1; r <= RUNS && !encErr; r++) {
    post(`Running the encoder, ${r} of ${RUNS}`);
    let emb: ort.Tensor | null = null;
    const t0 = performance.now();
    try {
      const out = await encSession.run({ input_image: input });
      encTimes.push(performance.now() - t0);
      emb = out.image_embeddings;
      if (!emb) throw new Error("the encoder gave no image_embeddings");
    } catch (e) {
      encErr = String((e as Error)?.message ?? e);
      break;
    }
    if (decErr) continue;
    post(`Running the decoder, ${r} of ${RUNS}`);
    const t1 = performance.now();
    try {
      const out = await decSession.run({
        image_embeddings: emb,
        point_coords: new ort.Tensor("float32", pts, [1, 2, 2]),
        point_labels: new ort.Tensor("float32", labs, [1, 2]),
        mask_input: new ort.Tensor("float32", new Float32Array(65536), [1, 1, 256, 256]),
        has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
        orig_im_size: new ort.Tensor("float32", new Float32Array([H, W]), [2]),
      });
      decTimes.push(performance.now() - t1);
      if (!rep.outputs) rep.outputs = `embeddings ${emb.dims.join("x")}, mask ${out.masks?.dims.join("x") ?? "none"}`;
    } catch (e) {
      decErr = String((e as Error)?.message ?? e);
    }
  }
  rep.encoder = encErr
    ? { state: "failed", times: encTimes, detail: encErr }
    : { state: "ok", times: encTimes, detail: `${W} by ${H} pixel picture` };
  rep.decoder = encErr
    ? { state: "not run", times: [], detail: "the encoder failed first" }
    : decErr
      ? { state: "failed", times: decTimes, detail: decErr }
      : { state: "ok", times: decTimes, detail: "one point at the picture's centre" };
  rep.memory = memoryWords();
  return rep;
}

scope.addEventListener("message", (e: MessageEvent) => {
  const post = (text: string) => scope.postMessage({ kind: "stage", text });
  measure(e.data as Planted, post).then(
    (report) => scope.postMessage({ kind: "done", report }),
    (err) => scope.postMessage({ kind: "error", message: String((err as Error)?.message ?? err) }),
  );
});
