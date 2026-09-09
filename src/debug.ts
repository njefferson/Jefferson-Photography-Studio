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
import { decodeOffThread } from "./decodeClient";
import { sniff } from "./import";

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

async function copy(text: string, btn: HTMLButtonElement, label: string) {
  const old = btn.textContent;
  try {
    await navigator.clipboard.writeText(text);
    btn.textContent = "Copied";
  } catch {
    // Clipboard refused (it often is, without a gesture it trusts). Select the
    // text instead so it can be copied by hand — never a dead button.
    textArea.focus();
    textArea.select();
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
    for (let i = 0; i < REPS; i++) {
      const a = performance.now();
      img = await decode({ ...file, bytes: bytes.slice() });
      const b = performance.now();
      await decodeOffThread({ ...file, bytes: bytes.slice() });
      here.push(b - a);
      there.push(performance.now() - b);
    }
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
    const same = Math.abs(ms - mr) <= Math.max(ms, mr) * 0.25;
    const verdict = same
      ? `This browser takes the same time whether the app asks for the write to be CONFIRMED on the disk or not (${Math.round(ms)} ms against ${Math.round(mr)} ms), which means it is not treating the two differently. So this is how fast it accepts the data, not how fast the data is safely on the device — and the app asks for confirmed writes precisely so a set survives a crash. Fast here is good news for the wait and says nothing about the crash.`
      : `Asking for the write to be CONFIRMED on the disk costs ${Math.round(ms)} ms against ${Math.round(mr)} ms without — so this browser really is waiting for the device, and the number above is the honest one.`;
    row("Saving one photo", `${Math.round(ms)} ms for 6 MB`,
      `This is what opening a set pays: the app commits each photo on its own and waits for the device. At this rate a 25 MB raw file takes about ${(ms * 25 / 6 / 1000).toFixed(1)} s and forty of them roughly ${((ms * 25 / 6 / 1000) * 40 / 60).toFixed(1)} minutes — less in practice, since the next photo is read and decoded while one write is in flight. ${verdict} That works out at ${mbps.toFixed(0)} MB per second.`,
      `confirmed ${strict.map((x) => Math.round(x) + " ms").join(", ")} · unconfirmed ${relaxed.map((x) => Math.round(x) + " ms").join(", ")}`);
  } catch (e) {
    p.remove();
    row("Saving one photo", "not run", `Storage refused the test (${(e as Error).message}).`);
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
  await decoding();
  await storage();
  btn.textContent = "Run again";
  btn.disabled = false;
  const copyBtn = $("dCopyAll") as HTMLButtonElement;
  copyBtn.hidden = false;
  copyBtn.onclick = () => copy(textArea.value + "\nSpeed\n" + out.join("\n") + "\n", copyBtn, "Copy the results");
});
