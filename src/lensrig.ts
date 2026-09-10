// Measuring a lens, as a destination in the app.
//
// WHERE IT LIVES, AND WHY IT MOVED. This shipped on the test page — reasonable
// enough, since it is a measurement rather than an edit. It was wrong. A lens
// is not a photograph: calibrating one has nothing to do with whatever is
// open, and the only routes to it were the version number (whose one link says
// "Test this device", naming no lens) and a link on the Corrections tab, which
// does not exist until a photo is open. So reaching your lens settings meant
// opening a photo you did not want to edit and then leaving the app for the
// diagnostics page. Reported 2026-09-10, and the report was right.
//
// It is a dialog in the editor now, reachable with nothing open at all, and
// this module is the ONE implementation — the test page links here rather than
// carrying a second copy, because two copies of one feature is how a fix
// reaches only one of them.

import { decodeOffThread } from "./decodeClient";
import { sniff } from "./import";
import { readExifSubset } from "./exif";
import { profileFrame, averageProfiles, round5, NBINS, type FrameProfile } from "./lensprofile";
import { readZipIndex, readZipEntry, imageEntries } from "./zip";

declare const __APP_VERSION__: string;

/** Wire the rig inside `root`, which must contain the ids below. Everything is
 *  scoped to `root` rather than to the document so the same markup can sit in a
 *  dialog, a page, or anywhere else. */
export function wireLensRig(root: ParentNode): void {
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const profResults = $("lensResults");
  const profText = $<HTMLTextAreaElement>("lensText");
  const profCopy = $<HTMLButtonElement>("lensCopy");
  const profSave = $<HTMLButtonElement>("lensSave");
  const profStop = $<HTMLButtonElement>("lensStop");

  /** Clipboard, with a hand-copy fallback — it is refused often enough on iOS
   *  that a dead button is the likely outcome otherwise. */
  const copy = async (text: string, btn: HTMLButtonElement, label: string) => {
    const old = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      profText.hidden = false;
      profText.focus();
      profText.select();
      btn.textContent = "Selected — press Copy";
    }
    setTimeout(() => { btn.textContent = old ?? label; }, 2200);
  };

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

  $<HTMLInputElement>("lensFiles").addEventListener("change", async (e) => {
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
    profCopy.onclick = () => copy(text, profCopy, "Copy the numbers");
    profSave.onclick = () => {
      const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `lens-profile-${payload.measured}.json`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    };
  });
}
