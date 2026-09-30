// The text report (Doctrine §7f). Its job is to carry what the browser's own
// identification HIDES — above all that iPadOS Safari reports itself as
// macOS, so `maxTouchPoints` is the only thing separating an iPad from a Mac,
// and every "is this an iPad?" question downstream depends on it.
//
// It is TEXT, and it is asked for instead of a screenshot: a screenshot cannot
// be searched, cannot be diffed against last week's, and leaves out everything
// that is not currently on screen.
//
// NOTHING THE READER WROTE GOES IN IT. No file names, no photo metadata, no
// location, no edit values — only facts about the device and the build. A
// session appears as a COUNT and nothing else. That is asserted, not assumed:
// the session walk opens a named practice file and greps the built report for
// its name. Anything added here has to survive the same test.

import { startupLine } from "./startup";
import { adoptAnswer, type AdoptAnswer } from "./swupdate";
import { device } from "./platform";

export interface DiagLine { k: string; v: string }

const yes = (b: boolean) => (b ? "yes" : "no");

/** What the app believes it is running on, and what the browser CLAIMED — both,
 *  because the whole reason this line exists is that the two disagree on an
 *  iPad, and a report that prints only the conclusion cannot be checked.
 *
 *  The conclusion is src/platform.ts's, not a second opinion worked out here.
 *  A diagnostic that reasons independently of the app is diagnosing a different
 *  app: this line used to say "iPad or iPhone" from its own rules while the
 *  export path decided the same question by different ones. */
function deviceLine(platform: string, touch: number): string {
  const d = device();
  const claimed = `says "${platform || "nothing"}"${touch > 0 ? `, ${touch} touch points` : ", no touch screen"}`;
  return `${d.noun} — ${claimed}`;
}

/** `persistent` is the line that decides whether an open session is safe, and
 *  on its own it is half an answer: WebKit clears script-writable storage after
 *  seven days of Safari use without interaction with the site, and a
 *  home-screen install is exempt where a browser tab is not. So the line says
 *  what a "no" MEANS and names the way out, rather than leaving a bare word
 *  for whoever reads the report to interpret. `standalone` is passed in
 *  because the caller has already worked it out for the Installed line. */
async function storageLine(standalone: boolean): Promise<string> {
  try {
    const est = await navigator.storage?.estimate?.();
    if (!est) return "not reported by this browser";
    const mb = (n?: number) => (n === undefined ? "?" : `${(n / 1024 / 1024).toFixed(0)} MB`);
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    const used = `${mb(est.usage)} used of ${mb(est.quota)}`;
    if (persisted) return `${used} · persistent: yes — an open session will not be evicted`;
    // NEVER "the app asked and was declined" — that is a claim about a call
    // this function did not make and cannot see. On the test page nothing has
    // opened a photo, so nothing has asked at all, and the report said it had.
    // State the browser's answer; name the consequence and the way out.
    const why = standalone
      ? "this browser has not granted it, though installed apps are usually exempt from eviction anyway"
      : "this browser has not granted it — a session left unopened for about a week may be cleared. Installing it to the home screen is exempt from that.";
    return `${used} · persistent: no — ${why}`;
  } catch {
    return "unavailable";
  }
}

function glLine(): string {
  try {
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2");
    if (!gl) return "WebGL2 NOT available — the editor cannot run";
    const dbg = gl.getExtension("WEBGL_debug_renderer_info");
    const r = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : "renderer not disclosed";
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const float = yes(!!gl.getExtension("EXT_color_buffer_float"));
    return `${r} · max texture ${maxTex}px · float buffers ${float}`;
  } catch {
    return "unavailable";
  }
}

/** Ask a worker which version it is. Same mechanism the update strip uses, and
 *  here for the same reason: a WAITING worker is not necessarily a newer app. */
function workerVersion(w: ServiceWorker): Promise<string | null> {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v: string | null) => { if (!settled) { settled = true; resolve(v); } };
    try {
      const ch = new MessageChannel();
      ch.port1.onmessage = (e) => done(String(e.data ?? "") || null);
      w.postMessage({ type: "VERSION" }, [ch.port2]);
    } catch { done(null); }
    setTimeout(() => done(null), 1200);
  });
}

/** WHAT THE ACTIVE RELEASE'S INSTALL DID (decision 071), for the "Offline
 *  worker" line: how many files it kept from this device, how many it
 *  downloaded, and whether the sticker library is all here. Record 071's claim
 *  that every release downloads the whole app is checked on the device by this
 *  clause, not assumed.
 *  Takes `version`, the active worker's release. Returns a clause beginning
 *  " · ", or "" when that install left no summary (a release from before this,
 *  or storage refused). Never creates a cache: caches.open would, so it asks
 *  caches.has first. What the caller relies on: it never throws. */
async function installLine(version: string): Promise<string> {
  try {
    const name = `ips-${version}`;
    if (!(await caches.has(name))) return "";
    const r = await (await caches.open(name)).match("./__install-summary");
    if (!r) return "";
    const s = (await r.json()) as { kept: number; fetched: number; unverified: number; stickersMissing: number; ms: number };
    return ` · its install kept ${s.kept} files already on this device and downloaded ${s.fetched}`
      + `${s.unverified ? ` (${s.unverified} not matching the build)` : ""}`
      + `, ${s.stickersMissing ? `${s.stickersMissing} stickers still to fetch` : "every sticker on the device"}`
      + `, in ${(s.ms / 1000).toFixed(1)} s`;
  } catch {
    return "";
  }
}

/** WHAT THE WAITING WORKER SAID WHEN ASKED TO TAKE OVER, in words (071,
 *  2026-09-30). Takes the page's record of its last ADOPT (`adoptAnswer()`).
 *  Returns a clause beginning " · ". What the caller relies on: it states only
 *  what the worker answered, or that no answer has come, never a guessed
 *  reason; the PC's report of 2026-09-30 could not tell a refusal from a
 *  takeover still running, and this is the clause that tells them apart. */
function adoptClause(asked: { answer: AdoptAnswer | null } | null): string {
  if (!asked) return " · this page has not asked it to take over";
  const a = asked.answer;
  if (!a) return " · asked to take over, no answer yet";
  if (a.taken) return " · it took over when this page asked";
  // A REFUSAL IS AN ANSWER TO ONE REQUEST, not a forecast: the worker still
  // takes over in the ordinary way once every window of the app is closed.
  if (a.why === "build") return ` · it declined when this page asked: it is build ${a.worker ?? "?"} and this page is build ${a.page ?? "?"}`;
  if (a.why === "cache") {
    return a.missing === "all"
      ? " · it declined when this page asked: its offline copy is gone"
      : ` · it declined when this page asked: its offline copy is missing ${a.missing} file${a.missing === 1 ? "" : "s"}${a.first ? ` (the first is ${a.first})` : ""}`;
  }
  if (a.why === "windows") {
    return a.windows === 1
      ? " · it declined when this page asked: the one window of the app it can see is not this page"
      : ` · it declined when this page asked: ${a.windows} windows of the app are open; this page asks again each time it comes back to the front, and it can take over once the others are closed`;
  }
  if (a.why === "error") return ` · asked to take over, and its check failed: ${a.error ?? "no reason given"}`;
  return " · it gave an answer this page does not know";
}

async function swLine(version: string): Promise<string> {
  try {
    if (!("serviceWorker" in navigator)) return "not supported";
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "not registered";
    const state = reg.active ? "active" : reg.installing ? "installing" : reg.waiting ? "waiting" : "none";
    // WHAT A WAITING WORKER ACTUALLY MEANS, rather than that one exists.
    //
    // Navigations are network-first, so a reload hands the reader the newest
    // page at once while the worker CONTROLLING it is still the previous one.
    // In that state a worker is legitimately parked holding the version already
    // on screen — and this line used to call that "an update is WAITING", which
    // is true of the worker and misleading about the app. It is also why two
    // caches are present and correct: the active worker's and the waiting one's,
    // the latter filled at install so the update works offline the moment it is
    // taken. Nothing is leaking.
    const active = reg.active ? await workerVersion(reg.active) : null;
    let waitingNote = "";
    if (reg.waiting) {
      const v = await workerVersion(reg.waiting);
      // "NOTHING TO TAKE" WAS TRUE ONLY WHEN THE PAGE'S OWN VERSION ALSO SERVES
      // IT. With an older worker serving (v2.63.42 under a 2.64.4 page on the
      // PC, 2026-09-30), taking the waiting one changes which worker answers,
      // so the line says what the waiting worker said when it was asked.
      // No controller means no worker serves this page (a hard reload does
      // that), and the page only asks for a takeover when one does.
      const served = !!navigator.serviceWorker.controller;
      waitingNote = v === null
        ? " · a worker is waiting (version unknown — an older one without the handler)"
        : v === version
          ? (!served
            ? ` · a worker of this same version (${v}) is waiting; no worker serves this page (a hard reload does that), so it has not asked the waiting one to take over`
            : (active === version
              ? ` · a worker of this same version (${v}) is waiting, beside the one serving this page`
              : ` · a worker of this same version (${v}) is waiting to take over from v${active ?? "?"}`) + adoptClause(adoptAnswer()))
          : ` · an update is WAITING (v${v})`;
    }
    const activeNote = active && active !== version
      ? (navigator.serviceWorker.controller ? ` · the worker serving this page is v${active}` : ` · the active worker is v${active}, and it does not serve this page`)
      : "";
    // AND A TAKEOVER THIS PAGE ASKED FOR, once there is nothing left waiting
    // for the clause above to describe: the worker's own answer, said once.
    const asked = adoptAnswer();
    const takenNote = !reg.waiting && asked?.answer?.taken && navigator.serviceWorker.controller
      ? " · the worker serving this page took over when this page asked it to"
      : "";
    const installNote = active ? await installLine(active) : "";
    // THE CACHE LIST IS READ LAST, AND THAT ORDER IS THE POINT.
    //
    // It used to be read before the workers were questioned, and a report came
    // back naming a waiting v2.43.39 next to caches that held only v2.43.38 —
    // which looks exactly like a worker that reached "waiting" without its cache
    // and would have been a serious defect, since taking that update would leave
    // a broken offline copy. It was not: install populates the cache before a
    // worker can wait at all, and the install is all-or-nothing so a failure aborts
    // the install entirely. What actually happened is that a worker finished
    // installing in the gap between the snapshot and the question, so the list
    // was simply older than the answer beside it. A diagnostic that reports two
    // facts gathered at different moments as though they were one moment
    // invents contradictions for its reader to chase.
    const names = await caches.keys();
    return `${state}${waitingNote}${takenNote}${activeNote}${installNote} · caches: ${names.join(", ") || "none"}`;
  } catch {
    return "unavailable";
  }
}

/** Does this engine implement durable writes at all?
 *
 *  `session.ts` commits every photo with `durability: "strict"` and its comment
 *  says that after the commit resolves "the photo is really on disk". That
 *  claim depends entirely on the engine honouring the option, and an engine
 *  that does not recognise it ignores it SILENTLY — a dictionary member that is
 *  not implemented is simply dropped, with no error and no slower commit.
 *
 *  Timings cannot answer this. Strict and relaxed measured the same on a Linux
 *  container, which was read here as "the flag does nothing" and was wrong:
 *  that engine accepts the option and reports it back as applied, so equal
 *  times mean the sync is cheap there (or the container's filesystem is
 *  absorbing it), not that it is absent. The attribute IS the answer — it is a
 *  readonly property that exists only where the option is implemented — and it
 *  costs nothing to ask: no database is opened, nothing is written. */
function durableLine(): string {
  try {
    const implemented = "durability" in IDBTransaction.prototype;
    return implemented
      ? "supported — the app asks for each photo to be confirmed on disk before it counts it saved"
      : "NOT supported by this browser — the app asks for confirmed writes and this engine ignores the request, so a crash in the seconds after a photo is added could lose it";
  } catch {
    return "unavailable";
  }
}

/** What the APP itself is holding, which is the question `Storage` raises and
 *  cannot answer: an origin figure of several GB says nothing about whether it
 *  is this app's sessions, its batch-recovery frames, or its offline caches.
 *
 *  READ-ONLY BY CONSTRUCTION. It lists the databases that already exist and
 *  opens only those, WITHOUT a version — `indexedDB.open(name)` on an existing
 *  database never fires an upgrade, and the ones that do not exist are never
 *  touched. A diagnostic that creates a database in order to report on storage
 *  is changing the thing it is measuring, and this one already shipped a line
 *  claiming a call it had not made. */
async function holdingsLine(): Promise<string> {
  const WANT: [name: string, store: string, unit: string][] = [
    ["ips-session", "meta", "photo"],
    // "meta" in both — batchstore's v1 "frames" store was deleted at its own
    // v2 upgrade, so naming it here would count a store that cannot exist.
    ["ips-batch", "meta", "saved frame"],
  ];
  try {
    const listed = await (indexedDB as { databases?(): Promise<{ name?: string }[]> }).databases?.();
    if (!listed) return "not reported by this browser";
    const present = new Set(listed.map((d) => d.name).filter(Boolean) as string[]);
    const counted = await Promise.all(
      WANT.filter(([n]) => present.has(n)).map(([n, store, unit]) =>
        new Promise<string>((res) => {
          const rq = indexedDB.open(n);
          rq.onerror = () => res(`${n}: could not be read`);
          rq.onsuccess = () => {
            const db = rq.result;
            try {
              if (!db.objectStoreNames.contains(store)) { db.close(); return res(""); }
              const c = db.transaction(store).objectStore(store).count();
              c.onsuccess = () => { const n2 = c.result; db.close(); res(n2 ? `${n2} ${unit}${n2 === 1 ? "" : "s"}` : ""); };
              c.onerror = () => { db.close(); res(""); };
            } catch { db.close(); res(""); }
          };
        })),
    );
    const held = counted.filter(Boolean);
    const others = [...present].filter((n) => !WANT.some(([w]) => w === n));
    const tail = others.length ? ` · other databases: ${others.join(", ")}` : "";
    return (held.length ? held.join(" · ") : "nothing kept") + tail;
  } catch {
    return "unavailable";
  }
}

/** Build the report. `extra` lets a page add its own lines (the editor adds
 *  what it has open, as counts). */
/** WHICH APP THIS REPORT IS ABOUT, and it has to be told.
 *
 *  This module was written for the editor and named it in the first line, which
 *  was true while the editor was the only caller. Macro Studio is the second,
 *  and its first report opened with "Infrared Photography Studio" — a report
 *  whose opening line is wrong about which app produced it is worse than no
 *  report, because everything under it is then read against the wrong app.
 *
 *  Defaulted to the editor so its own call site keeps working unchanged; the
 *  name is the caller's to state. */
export async function buildDiagnostic(
  version: string,
  extra: DiagLine[] = [],
  appName = "Infrared Photography Studio",
): Promise<string> {
  const nav = navigator as Navigator & { standalone?: boolean; deviceMemory?: number };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const lines: DiagLine[] = [
    { k: "App", v: `${appName} v${version}` },
    { k: "Taken", v: new Date().toISOString() },
    { k: "Address", v: location.origin + location.pathname },
    { k: "Installed", v: standalone ? "yes — running as an installed app" : "no — running in the browser" },
    // The line the whole report exists for. iPadOS Safari in desktop mode
    // identifies itself as a Mac, and the ONLY thing that separates the two is
    // the touch count — so the report states the conclusion rather than leaving
    // whoever reads it to remember the trick.
    { k: "Device", v: deviceLine(navigator.platform ?? "?", nav.maxTouchPoints ?? 0) },
    { k: "Touch points", v: String(nav.maxTouchPoints ?? 0) },
    { k: "Browser string", v: navigator.userAgent },
    { k: "Screen", v: `${screen.width}x${screen.height} at ${window.devicePixelRatio}x · window ${innerWidth}x${innerHeight}` },
    { k: "Memory hint", v: nav.deviceMemory ? `${nav.deviceMemory} GB` : "not reported" },
    { k: "Cores", v: String(navigator.hardwareConcurrency ?? "not reported") },
    { k: "Graphics", v: glLine() },
    { k: "Offline worker", v: await swLine(version) },
    // Where this launch's time went, so a frozen first launch after a release
    // can be told apart: the page, the code, the picture code, or a download
    // (decision 071).
    { k: "Start-up", v: startupLine() },
    { k: "Storage", v: await storageLine(standalone) },
    // The line that turns an origin-wide number into something actionable.
    { k: "App is holding", v: await holdingsLine() },
    { k: "Durable writes", v: durableLine() },
    { k: "Colours", v: `${document.documentElement.getAttribute("data-theme") ?? "dark"} · palette ${document.documentElement.getAttribute("data-palette") ?? "instrument"}` },
    { k: "Reduced motion", v: yes(window.matchMedia("(prefers-reduced-motion: reduce)").matches) },
    { k: "Language", v: navigator.language },
    ...extra,
  ];
  const w = Math.max(...lines.map((l) => l.k.length));
  return lines.map((l) => `${l.k.padEnd(w)}  ${l.v}`).join("\n") + "\n";
}
