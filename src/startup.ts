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
// EVERY PAUSE WORTH NAMING, with where it began, so the graphics build can be
// judged by what the page DID while it ran rather than by what the browser
// offered to do (decision 071): offering to build without holding the page is
// not the same as not holding it, and only the frames can tell them apart.
const GAP_KEPT_MS = 50;
const gaps: [number, number][] = [];
const graphicsBuilding = () => marks.has("graphics-start") && !marks.has("graphics-built") && !marks.has("graphics-failed");
const onFrame = (t: number) => {
  const gap = t - lastFrame;
  if (gap > longestGap) { longestGap = gap; longestAt = lastFrame; }
  if (gap >= GAP_KEPT_MS && gaps.length < 500) gaps.push([lastFrame, t]);
  lastFrame = t;
  // WATCHED PAST THE MINUTE WHILE THE GRAPHICS ARE STILL BUILDING: a build that
  // ran longer than the watch would otherwise be judged on frames that stopped
  // being counted.
  if (t - T0 < FRAME_WATCH_MS || graphicsBuilding()) requestAnimationFrame(onFrame);
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
 *  ("graphics-start", "graphics-built", "graphics-failed", "graphics-parallel"
 *  — the browser offered to build without holding the page — "graphics-words" —
 *  the start screen said it was preparing — and "controls-wired"); stores the time since
 *  the page began and returns nothing. The first call for a name wins, so a
 *  moment re-reached later in the session (a second renderer, say) cannot move
 *  it. Read by `startupLine`. */
export function markStartup(name: string): void {
  if (!marks.has(name)) marks.set(name, performance.now());
}

const at = (n: number | undefined | null) => (n == null ? "—" : `${(n / 1000).toFixed(2)} s`);
const took = (n: number) => (n < 1000 ? `${n.toFixed(0)} ms` : `${(n / 1000).toFixed(2)} s`);

/** WHETHER THE PAGE STAYED FREE WHILE THE GRAPHICS BUILT, from the frames.
 *  Takes the build's start `from` and its end `to` (the end is now while it is
 *  still building). Returns the clause the start-up line prints. A pause
 *  counts when it began inside the build — the build holding the page after
 *  a painted frame — or spans the whole of it — the build holding the page
 *  from the start; one that began before the build and ended inside it is the
 *  rest of the page's own start, not the build. Over 250 ms is a pause a
 *  reader feels, and is reported as the page waiting. */
function heldDuring(from: number, to: number): string {
  let worst = 0;
  for (const [a, b] of gaps) if ((a >= from && a < to) || (a < from && b > to)) worst = Math.max(worst, b - a);
  // An unfinished pause: the page has not drawn since before the build ended.
  if (lastFrame < to && to - lastFrame > worst && lastFrame >= from) worst = to - lastFrame;
  const wasHidden = hidden.some(([a, b]) => a < to && b > from) || (hiddenSince !== null && hiddenSince < to);
  const tail = wasHidden ? ", and the page was hidden for part of it" : "";
  return worst > 250 ? `the page waited — longest pause ${took(worst)}${tail}` : `the page stayed free — longest pause ${worst >= GAP_KEPT_MS ? took(worst) : `under ${GAP_KEPT_MS} ms`}${tail}`;
}

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
  // THE GRAPHICS BUILD, whichever way it went (decision 071). "No graphics on
  // this page" used to be printed for a report copied DURING the build too,
  // which is the one moment a report about a slow build is most likely taken.
  const gs = marks.get("graphics-start"), gb = marks.get("graphics-built"), gf = marks.get("graphics-failed");
  const offered = marks.has("graphics-parallel") ? "building off the page offered" : "no way to build off the page offered";
  const said = marks.has("graphics-words") ? `; said it was preparing at ${at(marks.get("graphics-words"))}` : "";
  parts.push(gs != null && gb != null ? `graphics built ${at(gs)}–${at(gb)} (${took(gb - gs)}; ${heldDuring(gs, gb)}; ${offered}${said})`
    : gs != null && gf != null ? `graphics failed ${at(gf)}, ${took(gf - gs)} after starting (${offered}${said})`
    : gs != null ? `graphics still building since ${at(gs)} (${heldDuring(gs, performance.now())} so far; ${offered}${said})`
    : "no graphics on this page");
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
