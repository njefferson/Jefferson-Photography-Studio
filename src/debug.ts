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
// The test page gets the update strip too — it had never had one, so the page a
// reader is most likely to be sitting on during a release was the one that
// never told them a release had happened.
import { wireUpdateStrip } from "./swupdate";
import { decode } from "./decode";
import { decodeOffThread, decodeLanes } from "./decodeClient";
import { sniff } from "./import";
import { workerCount } from "./exportparallel";
import { linearAt } from "./decode";
import { makeRowDenoiser } from "./raw/denoise";
import { compileEdit, TONE_DEFAULT, GRADE_DEFAULT, MIX3_DEFAULT, hslDefault, CROP_DEFAULT, neutralMask, type EditParams, type MaskLayer } from "./pipeline";
import { exportImage } from "./export";
import { drawFrame, canDrawFrame, buildLinearSource } from "./gpuexport";
import { Renderer, VERT, FRAG } from "./gl";

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
// THIS REPORT AND THE EDITOR'S ARE NOT THE SAME REPORT, and that cost a round
// trip: a line was added to the editor's, "look at the ⓘ report" was said
// without naming which page, and the test page's was sent back instead —
// correctly, since this is where every report all evening had come from. The
// lines that describe the photograph currently open cannot exist here, because
// nothing is open here. So this one says where they are rather than leaving two
// reports that look alike to be told apart by whoever notices something
// missing.
wireUpdateStrip();

const refreshReport = () => buildDiagnostic(__APP_VERSION__, [
  { k: "Not in this report", v: "the photograph you have open — open the app itself and use its ⓘ for that" },
]).then((t) => { textArea.value = t; });
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
/** How much the edit shader can still hold, on THIS device. Decision 042 gives
 *  masks their own values for the ordinary controls, and the cheapest way to
 *  carry them is as shader uniforms; how many masks that allows depends on a
 *  limit no container measures, because the container's graphics are not the
 *  reader's. About 19 rows a mask (75 floats) is the working estimate from the
 *  record; the row says how many masks that leaves room for, and when the
 *  answer is "not eight", the parameter texture is the route instead. */
function shaderRoom(): void {
  const canvas = document.createElement("canvas");
  let r: Renderer | undefined;
  try {
    r = new Renderer(canvas);
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
async function buildingThePictureCode(): Promise<void> {
  const p = note("Building the editor's picture code…");
  const cv = document.createElement("canvas");
  cv.width = 16; cv.height = 16;
  const gl = cv.getContext("webgl2");
  if (!gl) { p.remove(); row("Building the picture code", "WebGL2 unavailable", "The editor cannot run on this device."); return; }
  const parallel = !!gl.getExtension("KHR_parallel_shader_compile");
  const tri = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, tri);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const px = new Uint8Array(4);
  // Everything queued before a run is finished first, so no run is billed for
  // the one before it — the first version of this row was, and read 20 ms for
  // its first build and 350 for the next two.
  const drain = () => gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
  // Not a comment: a shader translator may drop comments before the driver's
  // own cache is consulted (inferred, not measured on a device), and then every
  // "cold" build would be answered from the copy the editor already made. A
  // unique constant in a branch no pixel takes survives translation and changes
  // nothing that is drawn; in the container it read 19-25 ms cold against 3 ms
  // warm, so it does defeat the cache there.
  // BUILT, THEN DRAWN, timed apart: some drivers finish the picture code only
  // when it first draws, so the build alone can look cheap while the first
  // picture pays for it.
  const build = (tag: number): { link: number; draw: number } => {
    drain();
    const t0 = performance.now();
    const mk = (type: number, src: string) => { const s = gl.createShader(type)!; gl.shaderSource(s, src); gl.compileShader(s); return s; };
    const vs = mk(gl.VERTEX_SHADER, VERT);
    const fs = mk(gl.FRAGMENT_SHADER, FRAG.replace("void main() {",
      `void main() {\n  if (gl_FragCoord.x < -${tag}.0) { frag = vec4(${tag}.0 / 1e9); return; }`));
    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs); gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    // Reading the status is what makes the page wait, exactly as the editor's
    // own start does.
    const ok = gl.getProgramParameter(prog, gl.LINK_STATUS);
    const t1 = performance.now();
    if (!ok) throw new Error("the editor's picture code did not build on this device");
    gl.useProgram(prog);
    const loc = gl.getAttribLocation(prog, "a_pos");
    if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0); }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drain();
    const t2 = performance.now();
    gl.useProgram(null);
    gl.deleteProgram(prog); gl.deleteShader(vs); gl.deleteShader(fs);
    return { link: t1 - t0, draw: t2 - t1 };
  };
  try {
    const stamp = 1000 + Math.floor(Math.random() * 8e8);
    const cold: { link: number; draw: number }[] = [];
    for (let i = 0; i < 3; i++) { cold.push(build(stamp + i)); await tick(); }
    const warm = build(stamp);
    p.remove();
    const tot = (r: { link: number; draw: number }) => r.link + r.draw;
    const med = [...cold].sort((a, b) => tot(a) - tot(b))[1];
    const runs = cold.map((r) => `${ms(r.link)} + ${ms(r.draw)}`).join(", ");
    row("Building the picture code (first time)", ms(tot(med)),
      tot(med) > 5000
        ? "SLOW. The editor waits this long for its graphics the first time after a release that changes them, with the start screen showing and nothing answering. On this device that is the likely cause of a frozen first launch."
        : "The editor waits this long for its graphics the first time after a release that changes them. On this device it is not what would freeze a launch.",
      `${runs} (built + first picture)`);
    row("Building it again (a normal launch)", ms(tot(warm)),
      `What an ordinary launch pays once the device has kept the built program: ${ms(warm.link)} to build and ${ms(warm.draw)} for the first picture.${parallel ? " This device can build it without making the page wait, which the editor does not use yet." : " This device offers no way to build it without making the page wait."}`);
  } catch (err) {
    p.remove();
    row("Building the picture code", "failed", (err as Error).message);
  } finally {
    gl.deleteBuffer(tri);
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
  const job = { fileBytes: 26.1e6, srcPixels: 5600 * 3728, outPixels: 5600 * 3728, healBytes: 0 };
  const n = workerCount(job);
  const big = workerCount({ fileBytes: 55e6, srcPixels: 8256 * 5504, outPixels: 8256 * 5504, healBytes: 0 });
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
    row("Denoise with colour noise OFF", ms(mo), `${per(mo)}, over a ${W}x${H} block of a ${(img.width * img.height / 1e6).toFixed(1)}-megapixel photograph. This is the 5x5 brightness filter alone, which is what every raw already pays.`,
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
    const runs: { label: string; drawn: ReturnType<typeof drawFrame>; computed: { data?: Uint8ClampedArray; width: number; height?: number }; computedMs: number }[] = [];
    const pairs: [string, EditParams][] = [["with the noise reduction and sharpening on", params], ["with both of those off", flat]];
    for (const [label, pr] of pairs) {
      const drawn = drawFrame(file, img, pr, null);
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

function compareOne(label: string, drawn: ReturnType<typeof drawFrame>, computed: { data?: Uint8ClampedArray; width: number; height?: number }, computedMs: number): void {
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
 *  And the canvas one fails SILENTLY: iOS Safari clamps a drawing buffer it
 *  will not give you, keeps rendering, and hands back a black picture with no
 *  error anywhere. That is exactly why the app downscales anything over 2800px
 *  for display today. So the honest test is to ask for one, read back what was
 *  actually allocated, and then DRAW A KNOWN COLOUR AND READ IT — because a
 *  clamp that reports the size you asked for and paints black is the failure
 *  mode that costs a release. */
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
  const probe = cv.getContext("webgl2", { preserveDrawingBuffer: true });
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
 *  The first is AREA. Safari refuses a canvas above a fixed number of pixels
 *  regardless of how much memory is free — 16,777,216 on the version this was
 *  written against, which is 4096x4096, and the refusal does not depend on the
 *  shape: 4097x4096 is over it and 5120x3072 is under. A frame out of the camera
 *  this app is built around is 5568x3712, which is 20,668,416 pixels, ABOVE that
 *  number. Exports do come out on the reporter's iPad, so the cap is evidently
 *  not biting there — but that is one device, the published figure is several
 *  years old, and the app has never asked.
 *
 *  The second is TOTAL canvas memory across every canvas the page is holding,
 *  and it is worse, because Safari keeps canvases alive after the last reference
 *  to them is gone. Past the total, `getContext("2d")` starts returning null and
 *  canvases draw transparent. The documented remedy is to resize to 1x1 and
 *  clear before dropping one, which is what the export path does not do.
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
  // Ordered by area, and chosen so the two sides of the published cap are both
  // tested rather than inferred: 4096x4096 is exactly it, 4097x4096 is one row
  // of pixels over, and the two frame sizes are what this app actually asks for.
  const SIZES: Array<[number, number, string]> = [
    [4096, 4096, "the published cap exactly"],
    [4097, 4096, "one pixel row over it"],
    [5120, 3072, "under the cap, but wider than 4096"],
    [5568, 3712, "a frame from the camera this app is built around"],
    [5600, 3728, "the frame size the rest of this page uses"],
    [8192, 4096, "twice the published cap"],
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

($("dBigRead") as HTMLButtonElement).addEventListener("click", async (e) => {
  const btn = e.currentTarget as HTMLButtonElement;
  btn.disabled = true;
  const was = btn.textContent;
  btn.textContent = "Running…";
  await readingFromABigStore();
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
  results.replaceChildren();
  out.length = 0;
  // One moment for the whole block: the report is re-taken with the numbers,
  // and it is what "Copy the results" puts above them.
  await refreshReport();
  shaderRoom();
  await graphics();
  await buildingThePictureCode();
  threads();
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
  btn.textContent = "Run again";
  btn.disabled = false;
  const copyBtn = $("dCopyAll") as HTMLButtonElement;
  copyBtn.hidden = false;
  copyBtn.onclick = () => copy(textArea.value + "\nSpeed\n" + out.join("\n") + "\n", copyBtn, "Copy the results");
});
