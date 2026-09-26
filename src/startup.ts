// WHAT THE FIRST SECONDS OF THIS LAUNCH COST, AND WHERE (decision 071). A
// launch after a release froze on a PC for about a minute with the start screen
// painted and nothing answering, and the two candidates — the offline copy
// downloading, and the editor building its picture code from scratch — leave
// the same picture on screen. This records, on the device, the moments that
// tell them apart: when the page arrived, when the code arrived, how long the
// graphics took to build, when the controls were wired, the longest time the
// page could not draw, and when an update started and finished installing. The
// report's "Start-up" line prints them; nothing leaves the device.
//
// Evaluated as early as the entry module's imports allow, which is why it is a
// module of its own with no imports: the clock it keeps starts when it runs.

const T0 = performance.now();
const marks = new Map<string, number>();
marks.set("module", T0);

// THE LONGEST PAUSE, measured by frames, because the long-task API is
// Chromium's alone and the iPad is the device this has to work on. A frame
// callback that arrives late is time the page could not draw; the largest gap
// in the first minute is the number that says whether the page itself stalled.
let lastFrame = T0, longestGap = 0, longestAt = 0;
// A HIDDEN PAGE DRAWS NO FRAMES, so a covered window would read as a frozen one.
// Every hidden stretch is kept, and the longest pause says if it overlapped one.
const hidden: [number, number][] = [];
let hiddenSince: number | null = typeof document !== "undefined" && document.visibilityState === "hidden" ? T0 : null;
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", () => {
    const t = performance.now();
    if (document.visibilityState === "hidden") hiddenSince = t;
    else if (hiddenSince !== null) { hidden.push([hiddenSince, t]); hiddenSince = null; }
  });
}
const FRAME_WATCH_MS = 60000;
const onFrame = (t: number) => {
  const gap = t - lastFrame;
  if (gap > longestGap) { longestGap = gap; longestAt = lastFrame; }
  lastFrame = t;
  if (t - T0 < FRAME_WATCH_MS) requestAnimationFrame(onFrame);
};
if (typeof requestAnimationFrame === "function") requestAnimationFrame(onFrame);

// AN UPDATE STARTING AND ENDING, from the registration, so the report can say
// whether a download overlapped the start-up at all.
let updateFound: number | null = null, installEnded: number | null = null, installState = "";
if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
  const watchWorker = (w: ServiceWorker | null) => {
    if (!w) return;
    if (updateFound === null) updateFound = performance.now();
    const end = () => {
      if (w.state === "installed" || w.state === "redundant" || w.state === "activated") {
        if (installEnded === null) { installEnded = performance.now(); installState = w.state; }
      }
    };
    w.addEventListener("statechange", end);
    end();
  };
  void navigator.serviceWorker.getRegistration().then((reg) => {
    if (!reg) return;
    watchWorker(reg.installing);
    reg.addEventListener("updatefound", () => watchWorker(reg.installing));
  }).catch(() => {});
}

/** Records a named moment of this launch.
 *  Takes `name`, one of the moments the start-up line knows how to print
 *  ("graphics-start", "graphics-built", "controls-wired"); stores the time since
 *  the page began and returns nothing. The first call for a name wins, so a
 *  moment re-reached later in the session (a second renderer, say) cannot move
 *  it. Read by `startupLine`. */
export function markStartup(name: string): void {
  if (!marks.has(name)) marks.set(name, performance.now());
}

const at = (n: number | undefined | null) => (n == null ? "—" : `${(n / 1000).toFixed(2)} s`);
const took = (n: number) => (n < 1000 ? `${n.toFixed(0)} ms` : `${(n / 1000).toFixed(2)} s`);

/** The report's "Start-up" line: where this launch's time went.
 *  Takes nothing; reads the browser's own timing records for the page and its
 *  main bundle, the moments marked with `markStartup`, the frame monitor and
 *  the registration watch above. Returns one line, every figure measured from
 *  the moment the page was requested, and every figure the browser does not
 *  give printed as unavailable rather than left out, because an absent number
 *  and a zero read the same to somebody pasting it back. Consumed by
 *  `buildDiagnostic` in diagnostic.ts. */
export function startupLine(): string {
  const parts: string[] = [];
  const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
  parts.push(nav ? `page arrived ${at(nav.responseStart)}–${at(nav.responseEnd)}` : "page timing not reported");
  const main = (performance.getEntriesByType("resource") as PerformanceResourceTiming[])
    .filter((e) => /\/assets\/[a-z]+-[\w-]+\.js$/.test(e.name))
    .sort((a, b) => b.encodedBodySize - a.encodedBodySize)[0];
  if (main) {
    const via = main.transferSize === 0 ? "from a stored copy" : `${Math.round(main.transferSize / 1024)} KB over the network`;
    parts.push(`main code ${at(main.responseEnd)} (${via})`);
  } else parts.push("main code timing not reported");
  parts.push(`started ${at(marks.get("module"))}`);
  const gs = marks.get("graphics-start"), gb = marks.get("graphics-built");
  parts.push(gs != null && gb != null ? `graphics built ${at(gs)}–${at(gb)} (${took(gb - gs)})` : "no graphics on this page");
  parts.push(marks.has("controls-wired") ? `controls wired ${at(marks.get("controls-wired"))}` : "controls not marked on this page");
  const gapEnd = longestAt + longestGap;
  const wasHidden = hidden.some(([a, b]) => a < gapEnd && b > longestAt) || (hiddenSince !== null && hiddenSince < gapEnd);
  parts.push(`longest pause ${took(longestGap)} at ${at(longestAt)}${wasHidden ? " (the page was hidden for part of it)" : ""}`);
  parts.push(updateFound != null
    ? `update found ${at(updateFound)}, ${installEnded != null ? `${installState} ${at(installEnded)}` : "still installing"}`
    : "no update this launch");
  const c = (navigator as Navigator & { connection?: { downlink?: number; rtt?: number } }).connection;
  parts.push(c && c.downlink != null ? `connection ${c.downlink} Mb/s, ${c.rtt ?? "?"} ms` : "connection not reported");
  return parts.join(" · ");
}
