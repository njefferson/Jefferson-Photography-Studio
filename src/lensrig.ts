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
import { readZipIndex, readZipEntry, readZipEntryPrefix, imageEntries } from "./zip";
import { saveFromPayload, listProfiles, removeProfile, coverage, exportAll, importText, type SaveChange } from "./lensstore";
import { requestPersistence } from "./session";
import { keepAwake, granted as wakeGranted, supported as wakeSupported } from "./wakelock";
import { loadMeasured, putMeasured, frameKey } from "./framecache";

declare const __APP_VERSION__: string;

/** Wire the rig inside `root`, which must contain the ids below. Everything is
 *  scoped to `root` rather than to the document so the same markup can sit in a
 *  dialog, a page, or anywhere else. */
export function wireLensRig(root: ParentNode): void {
  const $ = <T extends HTMLElement>(id: string) => root.querySelector<T>("#" + id)!;
  const profResults = $("lensResults");
  const profCoverage = $("lensCoverage");
  const profDetail = $("lensDetail");
  const profRunning = $("lensRunning");
  const profText = $<HTMLTextAreaElement>("lensText");
  // THE COPY BUTTON SITS WITH THE NUMBERS. It used to live in the actions row
  // at the top, while the text it copies appeared at the bottom under a long
  // list of per-frame findings — so on a phone the reader scrolled past
  // everything, found a text box, and tried to select 2 KB of JSON by hand
  // (owner report, 2026-09-10). The pair travels together now.
  const profOut = $("lensOut");
  const profCopy = $<HTMLButtonElement>("lensCopy2");
  const profSave = $<HTMLButtonElement>("lensSave2");
  const profStop = $<HTMLButtonElement>("lensStop");
  // What is kept is shown whenever the sheet opens, not only after a run — the
  // reader who wants to know what they have has not necessarily just measured
  // anything, and the one who wants to delete something certainly has not.
  const backupBtn = $<HTMLButtonElement>("lensBackup");
  const backupCopyBtn = $<HTMLButtonElement>("lensBackupCopy");
  const restoreInput = $<HTMLInputElement>("lensRestore");
  const restoreNote = $("lensRestoreNote");
  backupBtn.onclick = () => {
    const url = URL.createObjectURL(new Blob([exportAll()], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `lens-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  };
  backupCopyBtn.onclick = () => copy(exportAll(), backupCopyBtn, "Copy them all");
  restoreInput.onchange = async () => {
    const f = restoreInput.files?.[0];
    if (!f) return;
    restoreNote.hidden = false;
    restoreNote.textContent = "Reading…";
    try {
      const r = importText(await f.text());
      restoreNote.textContent = r.saved
        ? `Restored ${r.saved} profile${r.saved === 1 ? "" : "s"}. ${changeSummary(r.changes)}`.trim()
        : `Nothing restored. ${r.skipped.join("; ") || "That file had no lens profiles in it."}`;
      if (r.saved && !r.ok) restoreNote.textContent = "Read the file, but this browser refused to store it (a private window, or no room left).";
    } catch (err) {
      restoreNote.textContent = `That file could not be read (${(err as Error).message}).`;
    }
    restoreInput.value = ""; // so the same file can be picked again
    renderKept();
  };

  const dlg = document.getElementById("lensDlg");
  if (dlg) {
    new MutationObserver(() => { if ((dlg as HTMLDialogElement).open) renderKept(); })
      .observe(dlg, { attributes: true, attributeFilter: ["open"] });
    if ((dlg as HTMLDialogElement).open) renderKept();
  }

  /** Clipboard, with a hand-copy fallback — it is refused often enough on iOS
   *  that a dead button is the likely outcome otherwise. */
  const copy = async (text: string, btn: HTMLButtonElement, label: string) => {
    const old = btn.textContent;
    try {
      await navigator.clipboard.writeText(text);
      btn.textContent = "Copied";
    } catch {
      profOut.hidden = false;
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

  /** WHAT THIS DEVICE IS HOLDING, at any time and not only after a run.
   *
   *  Three things were missing and they are one surface. There was no way to see
   *  what had been kept, no way to remove any of it, and no way to see which
   *  focal lengths and apertures were still unshot — which is the only question
   *  a second trip out with the camera can answer. A measurement you cannot
   *  inspect or undo is not something a reader can be asked to trust. */
  /** What a save or a restore did, in the reader's terms. Shared, because a
   *  restore that replaces a four-frame measurement with a one-frame one is the
   *  same event as a re-measurement doing it, and deserves the same sentence. */
  function changeSummary(changes: SaveChange[]): string {
    const added = changes.filter((c) => c.what === "added").length;
    const replaced = changes.filter((c) => c.what === "replaced");
    const thinner = replaced.filter((c) => (c.wasFrames ?? 0) > c.frames);
    const parts = [added ? `${added} new` : "", replaced.length ? `${replaced.length} replaced` : ""].filter(Boolean).join(", ");
    return (parts ? `(${parts}) ` : "") + (thinner.length
      ? `${thinner.length} replaced a measurement made from MORE frames of sky: ${thinner.map((c) => `${c.key} had ${c.wasFrames}, now ${c.frames}`).join("; ")}.`
      : "");
  }

  /** WHERE THIS LIVES, said plainly and with the browser's own answer rather
   *  than a generic caution. A measurement is a trip out with the camera, a set
   *  of sky frames and a run of this rig; the reader is entitled to know it sits
   *  in storage the app does not own, and to be handed the way to keep a copy in
   *  the same breath. A warning with no remedy is bad news delivered on time. */
  async function renderStorageNote() {
    const note = $("lensStorageNote");
    if (!listProfiles().length) { note.textContent = ""; return; }
    let persisted: boolean | null = null;
    try {
      persisted = (await navigator.storage?.persisted?.()) ?? null;
    } catch {
      persisted = null; // a browser that will not answer is not a browser that promised
    }
    const where = "These live in this browser's storage for this app, not in a file and not in an account.";
    note.textContent = persisted === true
      ? `${where} This browser has agreed to keep it, which is the best any browser offers — it is still lost if you clear website data, remove the app from your home screen, or switch to another device. Save a backup.`
      : persisted === false
        ? `${where} This browser has NOT agreed to keep it: it can be cleared when the device is short of room, or after a stretch of not opening the app, and nothing will ask first. Save a backup.`
        : `${where} This browser will not say whether it intends to keep it, so treat it as something that can go. Save a backup.`;
  }

  function renderKept() {
    const kept = $("lensKept");
    const list = $("lensKeptList");
    const stored = listProfiles();
    kept.hidden = false;
    list.replaceChildren();
    void renderStorageNote();
    if (!stored.length) {
      profNote("Nothing measured yet. What you measure here stays on this device and is used automatically when you open a photograph from that lens.", list);
      return;
    }
    for (const c of coverage(stored)) {
      profRow(c.model, `${c.profiles} profile${c.profiles === 1 ? "" : "s"}`,
        c.atFl.map((e) => `${e.fl}mm at ${e.aps.join(", ")} (${e.frames} frame${e.frames === 1 ? "" : "s"})`).join("; ") + ".", list);
      profRow(`${c.short} — still missing`, c.gaps.length ? `${c.gaps.length} gap${c.gaps.length === 1 ? "" : "s"}` : "nothing obvious",
        c.gaps.length ? c.gaps.join("; ") + "." : "Every focal length you have shot has more than one aperture, and the zoom range is covered.", list);
      const row = document.createElement("div");
      row.className = "dbg-actions";
      for (const p of stored.filter((x) => x.key.startsWith(c.short + "@")).sort((a, z) => a.fl - z.fl || a.ap - z.ap)) {
        const b2 = document.createElement("button");
        b2.type = "button";
        b2.className = "dbg-btn";
        b2.textContent = `Remove ${p.fl}mm ${Number.isFinite(p.ap) ? `f/${p.ap}` : "(no aperture)"}`;
        // Two presses, because it cannot be undone and the frames it was made
        // from may be long gone. No dialog: a confirm box on an iPad is another
        // sheet over a sheet.
        let armed = false;
        b2.onclick = () => {
          if (!armed) { armed = true; b2.textContent = "Remove for good?"; b2.classList.add("primary"); setTimeout(() => { if (armed) { armed = false; b2.classList.remove("primary"); b2.textContent = `Remove ${p.fl}mm ${Number.isFinite(p.ap) ? `f/${p.ap}` : "(no aperture)"}`; } }, 4000); return; }
          removeProfile(p.key);
          renderKept();
        };
        row.appendChild(b2);
      }
      list.appendChild(row);
    }
  }

  /** Where the next row goes. The per-frame list is one row per photograph and
   *  can be ninety of them, so the summary that is worth reading and the detail
   *  that is worth having are not the same surface. */
  let sink: HTMLElement = profResults;

  function profNote(text: string, to: HTMLElement = sink): HTMLElement {
    const p = document.createElement("p");
    p.className = "dbg-progress";
    p.textContent = text;
    to.appendChild(p);
    return p;
  }

  function profRow(name: string, value: string, meaning: string, to: HTMLElement = sink) {
    const d = document.createElement("div");
    d.className = "dbg-row";
    d.innerHTML = `<div class="dbg-k"></div><div class="dbg-v"></div><p class="dbg-m"></p>`;
    (d.querySelector(".dbg-k") as HTMLElement).textContent = name;
    (d.querySelector(".dbg-v") as HTMLElement).textContent = value;
    (d.querySelector(".dbg-m") as HTMLElement).textContent = meaning;
    to.appendChild(d);
  }

  const pct = (x: number) => (x * 100).toFixed(1) + "%";

  /** One frame to measure: a picked file, or an entry inside a picked zip.
   *  `bytes()` is deferred so a zip of forty raw frames is never all in memory at
   *  once — the whole reason `readZipIndex` exists. */
  interface Candidate {
    name: string;
    /** Byte length, so a frame can be recognised across runs without reading
     *  it. Name alone is not identity — two shoots produce DSC_0001.NEF. */
    size: number;
    /** The whole frame — only ever called for one that is going to be measured. */
    bytes: () => Promise<Uint8Array>;
    /** Just the head of it, enough for EXIF, without inflating 25 MB. */
    head: () => Promise<Uint8Array>;
  }

  /** Enough of a file to carry IFD0 and the Exif IFD, and no more. A raw frame
   *  is 25 MB and its lens is written near the front; inflating the whole thing
   *  to find out which lens it came from is most of the cost of a big set and
   *  none of the answer.
   *
   *  WHY THIS PASS EXISTS AT ALL, measured: a zip of twelve 10 MB raws took
   *  over FIFTEEN MINUTES and then rejected every one of them, because they
   *  carry no readable EXIF — the old code decoded each frame in full before
   *  asking what lens it was. Asking first turns that into under five seconds.
   *  1 MB rather than 256 KB because the saving is already ~96% and a file that
   *  writes its Exif IFD a little further in should not be turned away. */
  const HEAD_BYTES = 1024 * 1024;

  /** How many frames per lens and focal length are actually worth measuring.
   *  The page asks for four or five; six leaves a margin for one that turns out
   *  to be cloudy. Beyond that each extra frame costs a full raw decode and
   *  moves the average by less than the sky's own gradient. A 1.69 GB set is
   *  about seventy frames — measuring all of them is tens of minutes of work to
   *  refine a number that stopped moving after the sixth. */
  const PER_GROUP = 6;

  /** Flatten what was picked. A zip counts as everything inside it: on an iPad a
   *  set of raw frames travels as one, because that is the only way iOS hands
   *  over a NEF without transcoding it to JPEG. (The editor deliberately takes
   *  only the FIRST image out of a zip — it is opening one photo. This is
   *  measuring a lens, so it wants all of them.) */
  async function expand(files: File[], say: (t: string) => void): Promise<Candidate[]> {
    const out: Candidate[] = [];
    for (const f of files) {
      if (!/\.zip$/i.test(f.name)) {
        out.push({
        name: f.name,
        size: f.size,
        bytes: async () => new Uint8Array(await f.arrayBuffer()),
        head: async () => new Uint8Array(await f.slice(0, HEAD_BYTES).arrayBuffer()),
      });
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
        for (const e of inside) out.push({
        name: e.name.split("/").pop() ?? e.name,
        size: e.compSize,
        bytes: () => readZipEntry(f, e),
        head: () => readZipEntryPrefix(f, e, HEAD_BYTES),
      });
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
    // THE SCREEN, FIRST. An iPad on its own auto-lock timer sleeps in the middle
    // of ninety frames and the work stops where it stood. Taken before anything
    // slow starts, and released in a finally so a thrown decode cannot leave it
    // held for the rest of the session.
    const release = keepAwake();
    try {
      // WHAT THE READER NEEDS TO KNOW BEFORE A LONG RUN, not after it failed.
      // The wake lock is a request; when it is refused or absent the only remedy
      // is on the device, and saying so is the difference between a reader who
      // finishes and one who comes back to a blank panel.
      const screen = $("lensScreenNote");
      screen.hidden = false;
      screen.textContent = !wakeSupported()
        ? "This browser cannot keep the screen awake. If the iPad locks partway through, set Settings › Display & Brightness › Auto-Lock to Never before a long run — what has already been measured is kept as it goes either way, so picking the same set again carries on from there rather than starting over."
        : "Keeping the screen awake while this runs. Anything already measured is kept as it goes, so if the iPad does lock, picking the same set again carries on from where it stopped rather than starting over.";
      profResults.replaceChildren();
      profCoverage.replaceChildren();
      profDetail.hidden = false;
      (profDetail as HTMLDetailsElement).open = false;
      profRunning.hidden = false;
      profRunning.textContent = "Reading what you picked…";
      sink = profResults;
      profOut.hidden = true;
      stopRequested = false;
      profStop.hidden = false;
      profStop.textContent = "Stop";
      profStop.onclick = () => { stopRequested = true; profStop.textContent = "Stopping…"; };
      // granted() only means anything once the request has been made, which is
      // why it is read here rather than beside the sentence above.
      if (wakeSupported() && wakeGranted() === false) {
        $("lensScreenNote").textContent = "This browser REFUSED to keep the screen awake — it can, on a low battery. Set Settings › Display & Brightness › Auto-Lock to Never for a long run. Anything already measured is kept as it goes, so picking the same set again carries on from where it stopped.";
      }

      const status = profRunning; // outside the fold: a progress line nobody can see is not progress
      const files = await expand(picked, (t) => profNote(t));
      if (!files.length) { status.textContent = "Nothing to measure."; profStop.hidden = true; return; }

      // --- PASS ONE: which lens is each frame, read from its head only ---------
      // 256 KB out of a 25 MB raw, so a big zip is sorted in seconds rather than
      // decoded for minutes to learn what it already says in its EXIF.
      const seen: { f: Candidate; key: string; model: string; short: string; fl: number; ap: number }[] = [];
      /** Every lens the picked set CONTAINS, whether or not it produces a profile. */
      const sawLens = new Map<string, { model: string; frames: number; fls: Set<number>; aps: Set<string> }>();
      let camera = "";
      let unreadable = 0;
      for (let i = 0; i < files.length; i++) {
        if (stopRequested) break;
        status.textContent = `Reading what is in the set — ${i + 1} of ${files.length}…`;
        if (i % 4 === 0) await new Promise((r) => setTimeout(r, 0)); // let it paint
        try {
          const ex = readExifSubset(await files[i].head());
          const model = ex?.lens?.trim() || "";
          const fl = ex?.focalLength && ex.focalLength[1] ? ex.focalLength[0] / ex.focalLength[1] : NaN;
          const ap = ex?.fNumber && ex.fNumber[1] ? ex.fNumber[0] / ex.fNumber[1] : NaN;
          if (!camera && (ex?.make || ex?.model)) camera = [ex.make, ex.model].filter(Boolean).join(" ");
          if (!model || !Number.isFinite(fl)) { unreadable++; continue; }
          const short = shortLens(model);
          // A HOT-SPOT CHANGES WITH APERTURE, so the aperture is part of what is
          // being measured. Real data made this obvious: a set came back with 19
          // frames averaged into one 50mm profile spanning f/4.5 to f/22, which
          // is a survey of seven different behaviours reported as one number.
          const apKey = Number.isFinite(ap) ? `f${ap.toFixed(1)}` : "f?";
          seen.push({ f: files[i], key: `${short}@${Math.round(fl)}@${apKey}`, model, short, fl: Math.round(fl), ap });
          // Every lens the SET contains, whether or not it ends up producing a
          // profile. Reporting only what came out is how a lens can be shot,
          // picked, refused frame by frame and never mentioned again.
          const sl = (sawLens.get(short) ?? sawLens.set(short, { model, frames: 0, fls: new Set<number>(), aps: new Set<string>() }).get(short)!);
          sl.frames++; sl.fls.add(Math.round(fl)); sl.aps.add(apKey);
        } catch { unreadable++; }
      }

      // --- CHOOSE: a handful per lens and focal length, spread across the set ---
      const byKey = new Map<string, typeof seen>();
      // short lens -> reason -> how many frames it happened to
      const dropped = new Map<string, Map<string, number>>();
      const drop = (short: string, why: string) => {
        const m = dropped.get(short) ?? dropped.set(short, new Map()).get(short)!;
        m.set(why, (m.get(why) ?? 0) + 1);
      };
      for (const c of seen) (byKey.get(c.key) ?? byKey.set(c.key, []).get(c.key)!).push(c);
      const chosen: typeof seen = [];
      let skipped = 0;
      for (const [, list] of byKey) {
        if (list.length <= PER_GROUP) { chosen.push(...list); continue; }
        // Evenly spaced rather than the first six: a set shot in one sweep has
        // its clouds and its sun angle bunched together in time.
        const step = list.length / PER_GROUP;
        for (let i = 0; i < PER_GROUP; i++) chosen.push(list[Math.floor(i * step)]);
        skipped += list.length - PER_GROUP;
        for (let n = 0; n < list.length - PER_GROUP; n++) drop(list[0].short, `not needed — ${PER_GROUP} at that focal length and aperture is enough`);
      }
      const summary = [
        `${seen.length} photograph${seen.length === 1 ? "" : "s"} with a lens and focal length in them`,
        byKey.size ? `${byKey.size} lens/focal-length group${byKey.size === 1 ? "" : "s"}` : "",
        unreadable ? `${unreadable} with no lens recorded in them` : "",
      ].filter(Boolean).join(" · ");
      profNote(summary);
      if (skipped) profNote(`Measuring ${chosen.length} of them — up to ${PER_GROUP} per lens and focal length, spread across the set. The other ${skipped} would each cost a full decode and would not move the answer; shoot fewer next time, or none of this is wasted, it is just not needed.`);
      if (!chosen.length) {
        status.textContent = `Nothing in that set carries a lens and a focal length in its EXIF, so there is nothing to file a profile under. Read from the first ${HEAD_BYTES / 1024} KB of each file. Camera JPEGs and NEFs normally carry it; a file that has been through an editor or a converter often does not.`;
        profStop.hidden = true;
        return;
      }

      // --- PASS TWO: decode and measure only those ----------------------------
      const groups = new Map<string, { frames: FrameProfile[]; model: string; short: string; fl: number; aps: number[]; kinds: Set<string> }>();
      let unusable = 0;
      // WHAT A PREVIOUS RUN ALREADY MEASURED. Read once, not per frame. A frame
      // that is in here costs nothing this time: the decode is the expensive
      // part and its answer has not changed.
      const cached = await loadMeasured();
      let reused = 0;
      const t0 = Date.now();
      const mmss = (ms: number) => {
        const s2 = Math.max(0, Math.round(ms / 1000));
        return s2 < 90 ? `${s2}s` : `${Math.round(s2 / 60)} min`;
      };
      for (let i = 0; i < chosen.length; i++) {
        if (stopRequested) { profNote(`Stopped after ${i} of ${chosen.length}. What was measured up to here is below.`); break; }
        const c = chosen[i];
        const done = i;
        const eta = done >= 2 ? ` · about ${mmss(((Date.now() - t0) / done) * (chosen.length - done))} left` : "";
        status.textContent = `Measuring ${c.f.name} — ${i + 1} of ${chosen.length}${eta}` +
          (reused ? ` · ${reused} already done from an earlier run` : "");
        await new Promise((r) => setTimeout(r, 0)); // paint before a long decode
        try {
          const ck = frameKey(c.f.name, c.f.size);
          let prof = cached.get(ck) as FrameProfile | undefined;
          if (prof) {
            reused++;
          } else {
            const bytes = await c.f.bytes();
            const img = await decodeOffThread({ name: c.f.name, kind: sniff(bytes), bytes, looksTranscoded: false });
            prof = profileFrame(img);
            // AWAITED, deliberately. The row has to be on disk before the next
            // decode starts, because the moment being survived is the one right
            // after this frame — a sleep, a reload, a tab the system took back.
            await putMeasured(ck, prof);
          }
          const where = `${c.model} at ${c.fl}mm`;
          if (!prof.usable) { unusable++; drop(c.short, prof.why); profRow(c.f.name, "not used", `${prof.why}. ${where}.`); continue; }
          let g = groups.get(c.key);
          if (!g) { g = { frames: [], model: c.model, short: c.short, fl: c.fl, aps: [], kinds: new Set() }; groups.set(c.key, g); }
          g.frames.push(prof);
          if (Number.isFinite(c.ap)) g.aps.push(c.ap);
          g.kinds.add(prof.linear ? "raw" : "rendered");
          const cr = prof.kr[0], cb = prof.kb[0];
          profRow(c.f.name, c.key,
            `The centre's colour is off by ${pct(Math.abs(cr - 1))} in red and ${pct(Math.abs(cb - 1))} in blue against the same frame's edges. ` +
            `Centre to corner it keeps ${pct(prof.falloffAtCorner)} of its brightness, of which somewhere between ${pct(prof.bumpRange[0])} and ${pct(prof.bumpRange[1])} is hot-spot rather than the lens's own falloff. ` +
            `${prof.linear ? "Measured from the raw sensor data" : "Measured from the rendered image"}, mean level ${pct(prof.meanLevel)}, ${pct(prof.clipFrac)} clipped, ${pct(prof.structure)} variation around a circle.`);
        } catch (err) {
          unusable++;
          drop(c.short, "it could not be opened");
          profRow(c.f.name, "not used", `It could not be opened (${(err as Error).message}).`);
        }
      }
      status.textContent = `Measured ${chosen.length - unusable} frame${chosen.length - unusable === 1 ? "" : "s"} in ${mmss(Date.now() - t0)}.`;

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
      // --- WHAT YOU HAVE, AND WHAT YOU STILL DO NOT ------------------------
      // The rig used to print what came OUT and nothing about what went in. A set
      // of 94 frames came back as 21, with no way to see which lens the other 73
      // belonged to or why they went — and no way at all to see which focal
      // lengths and apertures were still unmeasured, which is the only question a
      // second trip out with the camera can answer.
      sink = profCoverage;
      profNote("What you have measured, and what is still missing");
      for (const [short, sl] of sawLens) {
        const mine = Object.entries(profiles).filter(([k]) => k.startsWith(short + "@"));
        if (!mine.length) {
          const why = [...(dropped.get(short) ?? new Map())]
            .sort((a, b) => b[1] - a[1])
            .map(([w, n]) => `${n} × ${w.replace(/\.$/, "")}`)
            .join("; ");
          profRow(short, "nothing measured",
            `${sl.frames} frame${sl.frames === 1 ? "" : "s"} of this lens were in the set and none produced a profile. ${why ? why + "." : "No reason was recorded."} ` +
            `Nothing from this lens is in the numbers below.`);
          continue;
        }
        // What came out, focal length by focal length.
        const byFl = new Map<number, { aps: string[]; frames: number }>();
        for (const [k, v] of mine) {
          const m = /@(\d+(?:\.\d+)?)@f([\d.?]+)$/.exec(k);
          if (!m) continue;
          const fl = Number(m[1]);
          const e = byFl.get(fl) ?? byFl.set(fl, { aps: [], frames: 0 }).get(fl)!;
          e.aps.push(m[2] === "?" ? "aperture not recorded" : `f/${Number(m[2])}`);
          e.frames += v.frames;
        }
        const fls = [...byFl.keys()].sort((a, b) => a - b);
        for (const fl of fls) {
          const e = byFl.get(fl)!;
          const thin = e.frames < 3 * e.aps.length;
          profRow(`${short} at ${fl}mm`, `${e.aps.length} aperture${e.aps.length === 1 ? "" : "s"}`,
            `${e.aps.sort((x, y) => (parseFloat(x.slice(2)) || 1e9) - (parseFloat(y.slice(2)) || 1e9)).join(", ")} — ${e.frames} frame${e.frames === 1 ? "" : "s"} in all.` +
            (e.aps.length === 1 ? " Only one aperture here, and a hot-spot changes a long way with aperture: this focal length is described at that aperture and nowhere else." : "") +
            (thin ? " Thin — four or five frames per aperture average out the sky's own gradient." : ""));
        }
        // The gaps, stated as the next trip out rather than as a complaint.
        const gaps: string[] = [];
        const zoom = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*mm/i.exec(sl.model);
        if (zoom) {
          const lo = Number(zoom[1]), hi = Number(zoom[2]);
          const cLo = fls[0], cHi = fls[fls.length - 1];
          if (cHi < hi * 0.9) gaps.push(`nothing above ${cHi}mm on a lens that reaches ${hi}mm`);
          if (cLo > lo * 1.1) gaps.push(`nothing below ${cLo}mm on a lens that starts at ${lo}mm`);
          // A hole in the middle wide enough that blending across it is a guess.
          for (let i = 0; i < fls.length - 1; i++) {
            if (fls[i + 1] / fls[i] > 2.2) gaps.push(`a gap between ${fls[i]}mm and ${fls[i + 1]}mm`);
          }
        }
        const sweeps = fls.filter((fl) => byFl.get(fl)!.aps.length >= 3);
        if (!sweeps.length) {
          gaps.push("no focal length shot at three or more apertures, so the hot-spot's change with aperture is not measured anywhere");
        } else if (fls.length > sweeps.length) {
          const single = fls.filter((fl) => byFl.get(fl)!.aps.length === 1);
          const shared = single.filter((fl) => byFl.get(fl)!.aps.some((a) => byFl.get(sweeps[0])!.aps.includes(a)));
          if (single.length && !shared.length) {
            gaps.push(`${single.map((f2) => f2 + "mm").join(" and ")} share no aperture with the sweep at ${sweeps[0]}mm, so focal length and aperture cannot be told apart there — one frame at an aperture already in the sweep would tie them together`);
          }
        }
        // Two different things, and running them together would be dishonest: a
        // frame that COULD NOT be used is a problem, and a frame that was not
        // needed is the rig deciding it had enough.
        const all = [...(dropped.get(short) ?? new Map())];
        const lost = all.filter(([w]) => !w.startsWith("not needed"));
        const spare = all.filter(([w]) => w.startsWith("not needed")).reduce((n, [, c]) => n + c, 0);
        const lostN = lost.reduce((n, [, c]) => n + c, 0);
        profRow(`${short} — still missing`, gaps.length ? `${gaps.length} gap${gaps.length === 1 ? "" : "s"}` : "nothing obvious",
          (gaps.length ? gaps.join("; ") + "." : "Every focal length you shot has more than one aperture, and the zoom range is covered.") +
          (lostN ? ` ${lostN} frame${lostN === 1 ? "" : "s"} of this lens could not be used: ${lost.sort((a, b) => b[1] - a[1]).map(([w, n]) => `${n} × ${w}`).join("; ")}.` : "") +
          (spare ? ` ${spare} more were not needed — ${PER_GROUP} at one focal length and aperture is enough, so the rest were left undecoded rather than costing you the wait.` : ""));
      }

      sink = profCoverage;
      const text = JSON.stringify(payload);
      profText.value = text;
      profOut.hidden = false;
      // The instructions were read before the frames were picked; leaving them
      // open pushes the one button that matters off the first screenful.
      const intro = document.getElementById("lensIntro") as HTMLDetailsElement | null;
      if (intro) intro.open = false;
      const used = Object.values(profiles).reduce((n, x) => n + x.frames, 0);
      profRunning.textContent =
        `Measured ${used} frame${used === 1 ? "" : "s"} out of the ${files.length} you picked, into ` +
        `${Object.keys(profiles).length} profile${Object.keys(profiles).length === 1 ? "" : "s"}` +
        // Say when a run cost less because an earlier one had already done the
        // work. Without this the resume is invisible: it happens, and the reader
        // has no way to tell it from having measured everything again.
        (reused ? `, ${reused} of them measured in an earlier run and kept` : "") +
        ". Nothing left this device.";
      profNote(`${(text.length / 1024).toFixed(1)} KB of numbers. Copy it into a message, or save it and send the file — either way the photographs stay here.`);
      // The screen advice is for DURING a run. Once there is an answer it is
      // spent, and leaving it up pushes the one button that matters down the
      // panel — measured at 364px into a 607px sheet, against 288px without it.
      // It comes back at the start of the next run, which is when it can be
      // acted on.
      $("lensScreenNote").hidden = true;
      // The outcome is at the top now, and the reader is at the bottom of a long
      // list of rows. Take them to the thing they came for.
      profOut.scrollIntoView({ block: "start", behavior: "smooth" });
      // KEEPING IT IS THE POINT. Without this the rig is a form that prints
      // numbers for somebody else to paste into the app's source.
      const useBtn = root.querySelector<HTMLButtonElement>("#lensUse")!;
      const useNote = root.querySelector<HTMLElement>("#lensUseNote")!;
      useBtn.onclick = () => {
        const r = saveFromPayload(payload);
        useNote.hidden = false;
        // RE-MEASURING REPLACES, and saying so matters when a reader re-ingests a
        // folder they have already measured. A replace is what they want — the
        // new frames are the newer truth — but a silent one can put a one-frame
        // measurement over a four-frame one and nothing would ever say so.
        const summary = changeSummary(r.changes);
        useNote.textContent = r.saved && r.ok
          ? `Kept ${r.saved} profile${r.saved === 1 ? "" : "s"} on this device. ${summary}`.trim() +
            (summary.includes("MORE frames")
              ? " More frames of sky average out its own gradient, so if the earlier one was the better shoot you would want it back — it is gone from this device either way."
              : " Open a photograph from this lens and look under Corrections — Your measured lens, and save a backup below.")
          : "This browser refused to store it (a private window, or no room left). The numbers above still copy and save.";
        // A measurement is a real investment of the reader's time, which is the
        // moment worth spending the one persistence request on. The browser may
        // refuse; renderStorageNote reads what it actually decided rather than
        // what was asked.
        void requestPersistence();
        useBtn.textContent = r.saved && r.ok ? "Kept" : "Could not keep it";
        renderKept(); // what is on the device has just changed
        setTimeout(() => { useBtn.textContent = "Use these on my photos"; }, 2600);
      };
      profCopy.onclick = () => copy(text, profCopy, "Copy the numbers");
      profSave.onclick = () => {
        const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
        const a = document.createElement("a");
        a.href = url;
        a.download = `lens-profile-${payload.measured}.json`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      };
    } finally {
      // However it ends — finished, stopped, or a decode that threw — the
      // screen goes back to the reader's own auto-lock. A lock left held is a
      // battery complaint nobody would ever trace back to here.
      release();
    }
  });
}
