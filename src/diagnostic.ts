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

export interface DiagLine { k: string; v: string }

const yes = (b: boolean) => (b ? "yes" : "no");

/** iPadOS Safari reports "MacIntel". A Mac has no touch screen; an iPad reports
 *  five. Anything else is taken at its word. */
function deviceLine(platform: string, touch: number): string {
  if (/mac/i.test(platform)) {
    return touch > 0
      ? `iPad or iPhone — it says "${platform}", but ${touch} touch points means it is not a Mac`
      : `Mac — says "${platform}" with no touch screen`;
  }
  return `${platform}${touch > 0 ? ` · touch screen (${touch} points)` : ""}`;
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

async function swLine(): Promise<string> {
  try {
    if (!("serviceWorker" in navigator)) return "not supported";
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return "not registered";
    const state = reg.active ? "active" : reg.installing ? "installing" : reg.waiting ? "waiting" : "none";
    const names = await caches.keys();
    return `${state}${reg.waiting ? " · an update is WAITING" : ""} · caches: ${names.join(", ") || "none"}`;
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
export async function buildDiagnostic(version: string, extra: DiagLine[] = []): Promise<string> {
  const nav = navigator as Navigator & { standalone?: boolean; deviceMemory?: number };
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;
  const lines: DiagLine[] = [
    { k: "App", v: `Infrared Photography Studio v${version}` },
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
    { k: "Offline worker", v: await swLine() },
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
