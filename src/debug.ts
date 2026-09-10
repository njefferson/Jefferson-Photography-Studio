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
import { readExifSubset } from "./exif";
import { profileFrame, averageProfiles, round5, NBINS, type FrameProfile } from "./lensprofile";
import { readZipIndex, readZipEntry, imageEntries } from "./zip";

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

// --- measuring a lens --------------------------------------------------------
// The rig for src/lensprofile.ts. It lives on this page rather than in the
// editor because it is a measurement, not an edit: it opens nothing into the
// session, changes no setting, and the frames never leave the device — only
// the numbers do, and a profile is 240 of them against a flat's 25 MB. That
// asymmetry is the whole reason it is here: the profiles this app ships are
// JPEG-only because full raw flats could not be moved to where the original
// measurement ran. Nothing has to move now.

const profResults = $("dProfResults");
const profText = $("dProfText") as HTMLTextAreaElement;
const profCopy = $("dProfCopy") as HTMLButtonElement;
const profSave = $("dProfSave") as HTMLButtonElement;
const profStop = $("dProfStop") as HTMLButtonElement;

/** "NIKKOR Z DX 16-50mm f/3.5-6.3 VR" -> "16-50"; a prime -> its length. The
 *  shipped data keys on exactly this, and deriving it means a lens nobody has
 *  entered into a table still gets measured. */
function shortLens(model: string): string {
  const zoom = model.match(/(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i);
  if (zoom) return `${zoom[1]}-${zoom[2]}`;
  const prime = model.match(/(\d+(?:\.\d+)?)\s*mm/i);
  if (prime) return prime[1];
  return model.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24) || "lens";
}

function profNote(text: string): HTMLElement {
  const p = document.createElement("p");
  p.className = "dbg-progress";
  p.textContent = text;
  profResults.appendChild(p);
  return p;
}

function profRow(name: string, value: string, meaning: string) {
  const d = document.createElement("div");
  d.className = "dbg-row";
  d.innerHTML = `<div class="dbg-k"></div><div class="dbg-v"></div><p class="dbg-m"></p>`;
  (d.querySelector(".dbg-k") as HTMLElement).textContent = name;
  (d.querySelector(".dbg-v") as HTMLElement).textContent = value;
  (d.querySelector(".dbg-m") as HTMLElement).textContent = meaning;
  profResults.appendChild(d);
}

const pct = (x: number) => (x * 100).toFixed(1) + "%";

/** One frame to measure: a picked file, or an entry inside a picked zip.
 *  `bytes()` is deferred so a zip of forty raw frames is never all in memory at
 *  once — the whole reason `readZipIndex` exists. */
interface Candidate {
  name: string;
  bytes: () => Promise<Uint8Array>;
}

/** Flatten what was picked. A zip counts as everything inside it: on an iPad a
 *  set of raw frames travels as one, because that is the only way iOS hands
 *  over a NEF without transcoding it to JPEG. (The editor deliberately takes
 *  only the FIRST image out of a zip — it is opening one photo. This is
 *  measuring a lens, so it wants all of them.) */
async function expand(files: File[], say: (t: string) => void): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (const f of files) {
    if (!/\.zip$/i.test(f.name)) {
      out.push({ name: f.name, bytes: async () => new Uint8Array(await f.arrayBuffer()) });
      continue;
    }
    if (typeof DecompressionStream === "undefined") {
      say(`${f.name}: this browser cannot open zips (Safari 16.4+, Chrome, Edge, or Firefox 113+). Pick the photographs themselves instead.`);
      continue;
    }
    try {
      const inside = imageEntries(await readZipIndex(f));
      if (!inside.length) { say(`${f.name}: no photographs inside it.`); continue; }
      say(`${f.name}: ${inside.length} photograph${inside.length === 1 ? "" : "s"} inside.`);
      for (const e of inside) out.push({ name: e.name.split("/").pop() ?? e.name, bytes: () => readZipEntry(f, e) });
    } catch (err) {
      say(`${f.name}: could not be read as a zip (${(err as Error).message}).`);
    }
  }
  return out;
}

let stopRequested = false;

($("dProfFiles") as HTMLInputElement).addEventListener("change", async (e) => {
  const input = e.currentTarget as HTMLInputElement;
  const picked = [...(input.files ?? [])];
  input.value = ""; // so choosing the same set twice re-runs
  if (!picked.length) return;
  profResults.replaceChildren();
  profText.hidden = true;
  profCopy.hidden = true;
  profSave.hidden = true;
  stopRequested = false;
  profStop.hidden = false;
  profStop.textContent = "Stop";
  profStop.onclick = () => { stopRequested = true; profStop.textContent = "Stopping…"; };

  const opening = profNote("Looking at what you picked…");
  const files = await expand(picked, (t) => profNote(t));
  opening.remove();
  if (!files.length) { profNote("Nothing to measure."); profStop.hidden = true; return; }

  const groups = new Map<string, { frames: FrameProfile[]; model: string; short: string; fl: number; aps: number[]; kinds: Set<string> }>();
  let unusable = 0;
  let camera = "";

  for (let i = 0; i < files.length; i++) {
    if (stopRequested) { profNote(`Stopped after ${i} of ${files.length}. What was measured up to here is below.`); break; }
    const f = files[i];
    const p = profNote(`Measuring ${f.name} — ${i + 1} of ${files.length}…`);
    try {
      const bytes = await f.bytes();
      const kind = sniff(bytes);
      const ex = readExifSubset(bytes);
      const model = ex?.lens?.trim() || "";
      const fl = ex?.focalLength && ex.focalLength[1] ? ex.focalLength[0] / ex.focalLength[1] : NaN;
      const ap = ex?.fNumber && ex.fNumber[1] ? ex.fNumber[0] / ex.fNumber[1] : NaN;
      if (!camera && (ex?.make || ex?.model)) camera = [ex.make, ex.model].filter(Boolean).join(" ");
      // The frame is decoded off the main thread so a long set does not lock
      // the page, and dropped as soon as its 240 numbers are out of it.
      const img = await decodeOffThread({ name: f.name, kind, bytes, looksTranscoded: false });
      const prof = profileFrame(img);
      p.remove();
      const where = model ? `${model} at ${Number.isFinite(fl) ? fl.toFixed(0) + "mm" : "an unrecorded focal length"}` : "no lens recorded in the file";
      if (!prof.usable) {
        unusable++;
        profRow(f.name, "not used", `${prof.why}. ${where}.`);
        continue;
      }
      if (!model || !Number.isFinite(fl)) {
        unusable++;
        profRow(f.name, "not used", `The frame measured cleanly, but ${where} — a profile has to be filed under a lens and a focal length, or it cannot be matched to a photograph later.`);
        continue;
      }
      const short = shortLens(model);
      const key = `${short}@${Math.round(fl)}`;
      let g = groups.get(key);
      if (!g) { g = { frames: [], model, short, fl: Math.round(fl), aps: [], kinds: new Set() }; groups.set(key, g); }
      g.frames.push(prof);
      if (Number.isFinite(ap)) g.aps.push(ap);
      g.kinds.add(prof.linear ? "raw" : "rendered");
      const cr = prof.kr[0], cb = prof.kb[0];
      profRow(f.name, key,
        `The centre's colour is off by ${pct(Math.abs(cr - 1))} in red and ${pct(Math.abs(cb - 1))} in blue against the same frame's edges. ` +
        `Centre to corner it keeps ${pct(prof.falloffAtCorner)} of its brightness, of which somewhere between ${pct(prof.bumpRange[0])} and ${pct(prof.bumpRange[1])} is hot-spot rather than the lens's own falloff. ` +
        `${prof.linear ? "Measured from the raw sensor data" : "Measured from the rendered image"}, mean level ${pct(prof.meanLevel)}, ${pct(prof.clipFrac)} clipped, ${pct(prof.structure)} variation around a circle.`);
    } catch (err) {
      p.remove();
      unusable++;
      profRow(f.name, "not used", `It could not be opened (${(err as Error).message}).`);
    }
  }

  profStop.hidden = true;
  if (!groups.size) {
    profNote(unusable ? "Nothing measurable in that set — see the reasons above." : "Nothing to measure.");
    return;
  }

  const profiles: Record<string, { falloff: number[]; kr: number[]; kb: number[]; bump_range: number[]; frames: number; source: string; apertures: string }> = {};
  const lensMap: Record<string, string> = {};
  const anchors: Record<string, number[]> = {};
  for (const [key, g] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    // A RAW FLAT DISPLACES A RENDERED ONE rather than averaging with it. An
    // 8-bit rendered frame carries a systematic quantisation bias, not noise:
    // within one radial ring nearly every pixel rounds to the same code, so
    // the rounding never averages away, and it bites hardest in the darkest
    // channel — measured at 0.5% on blue against 0.16% on red, from the same
    // frame. Averaging the two together would spend a good measurement to
    // keep a worse one.
    const raws = g.frames.filter((f) => f.linear);
    const setAside = raws.length ? g.frames.length - raws.length : 0;
    const use = raws.length ? raws : g.frames;
    if (setAside) g.kinds.delete("rendered");
    const a = averageProfiles(use);
    profiles[key] = {
      falloff: round5(a.falloff), kr: round5(a.kr), kb: round5(a.kb),
      bump_range: round5(a.bumpRange),
      frames: a.n,
      source: [...g.kinds].sort().join("+"),
      apertures: g.aps.length ? [...new Set(g.aps.map((x) => "f/" + x.toFixed(1)))].sort().join(" ") : "unrecorded",
    };
    lensMap[g.model] = g.short;
    (anchors[g.short] ??= []).push(g.fl);
    const aside = setAside ? ` ${setAside} rendered frame${setAside === 1 ? "" : "s"} set aside, because raw ones are available here and are the better measurement.` : "";
    profRow(`${key} — averaged`, `${a.n} frame${a.n === 1 ? "" : "s"}`,
      (a.n < 3
        ? `Usable, but thin. Four or five frames at a focal length average out the sky's own gradient; ${a.n} leaves it in the numbers.`
        : `Colour off by ${pct(Math.abs(a.kr[0] - 1))} in red and ${pct(Math.abs(a.kb[0] - 1))} in blue at the centre, and the frame keeps ${pct(a.falloff[NBINS - 1])} of its brightness out at the corner. Shot at ${profiles[key].apertures}.`) + aside);
  }
  for (const k of Object.keys(anchors)) anchors[k] = [...new Set(anchors[k])].sort((x, y) => x - y);

  const payload = {
    format: "ips-lensprofile",
    version: 1,
    measured: new Date().toISOString().slice(0, 10),
    app: __APP_VERSION__,
    camera: camera || "not recorded",
    nbins: NBINS,
    radius_norm: "diagonal",
    space: "linear",
    note: "falloff = the whole measured radial profile, 1 in the reference ring (divide by it to flatten); kr/kb = red and blue relative to green, 1 in the reference ring (apply as r/=kr, b/=kb). bump_range is the low and high estimate of how much of the centre's brightness is hot-spot rather than the lens's own vignette — one flat frame cannot narrow it further, so it is reported rather than applied.",
    profiles,
    lens_map: lensMap,
    fl_anchors: anchors,
  };
  const text = JSON.stringify(payload);
  profText.value = text;
  profText.hidden = false;
  profCopy.hidden = false;
  profSave.hidden = false;
  const used = Object.values(profiles).reduce((n, x) => n + x.frames, 0);
  profNote(`${(text.length / 1024).toFixed(1)} KB of numbers, from ${used} of the ${files.length} frame${files.length === 1 ? "" : "s"} picked. Copy it into a message, or save it and send the file — either way the photographs stay here.`);
  profCopy.onclick = () => copy(text, profCopy, "Copy the numbers", profText);
  profSave.onclick = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lens-profile-${payload.measured}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
});
