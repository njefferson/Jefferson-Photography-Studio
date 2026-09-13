// The test page behind the version number. Every question this app has had to
// answer with "that needs measuring on the device" is measured HERE, on the
// device, because a desktop harness cannot stand in for an iPad: a software
// rasteriser makes graphics timings meaningless, and a laptop's disk says
// nothing about iPad storage.
//
// Read-only with respect to the reader's work: it opens nothing, changes no
// setting, and the storage test writes to a throwaway database of its own that
// it deletes afterwards. Nothing leaves the device.

import "./style.css";
import { buildDiagnostic } from "./diagnostic";
import { decode } from "./decode";
import { decodeOffThread, decodeLanes } from "./decodeClient";
import { sniff } from "./import";
import { workerCount } from "./exportparallel";
import { linearAt } from "./decode";
import { compileEdit, TONE_DEFAULT, GRADE_DEFAULT, MIX3_DEFAULT, hslDefault, CROP_DEFAULT, type EditParams } from "./pipeline";
import { exportImage } from "./export";

declare const __APP_VERSION__: string;

const $ = (id: string) => document.getElementById(id)!;
const results = $("dResults");
const out: string[] = [];

/** `samples` is the raw run-to-run spread, and it goes into the COPIED text as
 *  well as the panel. It did not, at first: the spread was added to make a
 *  median trustworthy, printed only in the panel's prose, and "Copy the results"
 *  builds its block from name and value alone — so the pasted report, which is
 *  how these numbers actually travel, carried the median with nothing to judge
 *  it by. A measurement's uncertainty has to survive the copy or it is not part
 *  of the measurement. */
function row(name: string, value: string, meaning: string, samples?: string) {
  const d = document.createElement("div");
  d.className = "dbg-row";
  d.innerHTML = `<div class="dbg-k"></div><div class="dbg-v"></div><p class="dbg-m"></p>`;
  (d.querySelector(".dbg-k") as HTMLElement).textContent = name;
  (d.querySelector(".dbg-v") as HTMLElement).textContent = value;
  (d.querySelector(".dbg-m") as HTMLElement).textContent = samples ? `${meaning} Runs: ${samples}.` : meaning;
  results.appendChild(d);
  out.push(`${name}: ${value}` + (samples ? `   [${samples}]` : ""));
}
function note(text: string) {
  const p = document.createElement("p");
  p.className = "dbg-progress";
  p.textContent = text;
  results.appendChild(p);
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
const refreshReport = () => buildDiagnostic(__APP_VERSION__).then((t) => { textArea.value = t; });
void refreshReport();

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
  const job = { fileBytes: 26.1e6, srcPixels: 5600 * 3728, outPixels: 5600 * 3728 };
  const n = workerCount(job);
  const big = workerCount({ fileBytes: 55e6, srcPixels: 8256 * 5504, outPixels: 8256 * 5504 });
  row("Cores this browser admits to", cores ? String(cores) : "not reported",
    cores ? "The export keeps one for the interface and splits the rest of the work." : "Without a number the export assumes two.");
  row("Threads a 21-megapixel export would use", n === 1 ? "one — it would not split" : String(n),
    n === 1
      ? "Either this browser has no background threads, or the memory each would need does not fit the budget. The export runs as it always did."
      : `Each one holds its own copy of the file and its own decode of it. A 45-megapixel raw would get ${big === 1 ? "none — it would not split" : big}.`);
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
      lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false,
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
      lum: 1, masks: [], hotspot: 0, hotspotSize: 0.5, hotspotColor: 0, lensFix: 1, lensBypass: false,
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
    const out = await exportImage({ name: "practice.dng", kind: sniff(bytes), bytes, looksTranscoded: false }, img, params, { format: "jpeg", scale: 1, quality: 0.92 });
    const buf = new Uint8Array(await out.blob.arrayBuffer());
    let f = 0x811c9dc5;
    for (let i = 0; i < buf.length; i++) { f ^= buf[i]; f = Math.imul(f, 0x01000193); }
    p.remove();
    row("A practice photograph, exported", `${hex(f)} · ${(buf.length / 1024).toFixed(0)} KB · ${((performance.now() - t0) / 1000).toFixed(1)}s`,
      "The app's own bundled practice file, exported at about a megapixel with a fixed edit — the same input on every device, so the fingerprint is comparable. Two devices printing the same one export identically today; two that differ do not, and never did.");
  } catch (e) {
    p.remove();
    row("A practice photograph, exported", "not run", `It could not be exported here (${(e as Error).message}).`);
  }
}

($("dRun") as HTMLButtonElement).addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Running…";
  results.replaceChildren();
  out.length = 0;
  // One moment for the whole block: the report is re-taken with the numbers,
  // and it is what "Copy the results" puts above them.
  await refreshReport();
  await graphics();
  threads();
  await exportOnTheGpu();
  await decoding();
  await buildingATile();
  await sameEverywhere();
  await storage();
  btn.textContent = "Run again";
  btn.disabled = false;
  const copyBtn = $("dCopyAll") as HTMLButtonElement;
  copyBtn.hidden = false;
  copyBtn.onclick = () => copy(textArea.value + "\nSpeed\n" + out.join("\n") + "\n", copyBtn, "Copy the results");
});
