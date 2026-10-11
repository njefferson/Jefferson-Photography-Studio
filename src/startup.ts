// WHAT THE FIRST SECONDS OF THIS LAUNCH COST, AND WHERE THE PAGE HELD AFTER THAT (decision 071). A
// launch after a release froze on a PC for about a minute with the start screen
// painted and nothing answering, and the two candidates — the offline copy
// downloading, and the editor building its picture code from scratch — leave
// the same picture on screen. This records, on the device, the moments that
// tell them apart: when the page arrived, when the code arrived, how long the
// graphics took to build, when the controls were wired, the longest time the
// page could not draw, and when an update started and finished installing. The
// report's "Start-up" line prints them; nothing leaves the device.
//
// AND THE WHOLE SESSION, NOT ONLY THE FIRST MINUTE. The frame watch below stops
// after sixty seconds, so a hold during a look pressed ten minutes in was in no
// report. A timer that fires every 100 ms now runs for as long as the page is
// open and keeps every time it fired more than 250 ms late, with the stage the
// app was in at that moment (`busyWith`, set by the paths that hold the page).
// The report's "Holds" and "Hold watch" lines print the three longest, how many
// there were and what the watch itself costs.
//
// AND THE MASKS' PICTURE CODE, BUILT BEHIND THE PICTURE (decision 071, option
// 11). The editor opens on a program with the mask loops taken out and builds the
// full one afterwards. `onWatchTick` lets this timer carry the one question that
// build asks, whether it has finished, once per look and never as a wait; the
// Start-up line prints when the masks' build started and ended and where it ran.
//
// AND WHETHER A HOLD WAS THE PAGE HIDDEN OR THE PAGE BLOCKED. Every change of the
// page's visibility is kept with its time (`visLog`: the browser's event with the
// time it carries, and a check at each look for a change the event has not
// delivered yet), and a hold prints how much of it the page was hidden, or that it
// was not hidden at any time in it. Only a look made while the page is still
// hidden is left out; one made the instant the page returns is a hold, because
// that is the look that tells a tab held in the background from a page that could
// not run. The Holds line counts how many holds spanned a hidden stretch, and the
// Hold watch line prints the newest entries of the record. The hidden amount is
// read when the report is taken, not when the look is made, so an event that
// arrives after the look can still correct the time of the change.
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
// EVERY CHANGE OF THE PAGE'S VISIBILITY IS KEPT WITH ITS TIME (the record of
// what the page was doing between two looks), and the longest pause and every
// hold say how much of themselves fell in a hidden stretch.

/** One entry of the visibility record: from `at` (the page's clock, ms) the page
 *  was shown or hidden. The first entry is the state at load. `byLook` is true
 *  when the change was first seen by the hold watch's look and not by the
 *  browser's event, so its time is the look's and no earlier. */
interface VisEntry { at: number; shown: boolean; byLook: boolean }
const visLog: VisEntry[] = [{
  at: T0,
  shown: !(typeof document !== "undefined" && document.visibilityState === "hidden"),
  byLook: false,
}];
const VIS_LOG_CAP = 2000;

/** Whether the document says it is hidden right now. Takes nothing; returns true
 *  only when the browser reports `hidden` (false where there is no document). */
const hiddenNow = () => typeof document !== "undefined" && document.visibilityState === "hidden";

/** RECORDS THE PAGE'S VISIBILITY IF IT HAS CHANGED SINCE THE LAST ENTRY.
 *  Takes `now`, the page's clock at this moment, and `stamp`, the time the
 *  browser gave the change when it came as an event (undefined at a look).
 *  Returns nothing; appends an entry only when the state differs from the last
 *  one, so calling it twice for one change records one. Two ways in, because
 *  each fails alone: the event can arrive after the hold watch's look when the
 *  page was held across the change, and a browser that held the page may not
 *  deliver it at all. When the look saw a change first and the event comes
 *  after with an earlier time that fits between the entries, the entry takes the
 *  event's time, which is the moment of the change and not of the look. */
function seeVisibility(now: number, stamp?: number): void {
  const last = visLog[visLog.length - 1];
  const shown = !hiddenNow();
  const at = Math.max(last.at, stamp ?? now);
  if (shown === last.shown) {
    const before = visLog.length > 1 ? visLog[visLog.length - 2].at : -Infinity;
    if (stamp !== undefined && last.byLook && stamp >= before && stamp < last.at) { last.at = stamp; last.byLook = false; }
    return;
  }
  visLog.push({ at, shown, byLook: stamp === undefined });
  // Dropped in pairs so the entries still alternate; a page that changed
  // visibility a thousand times has long stopped asking about its first minute.
  if (visLog.length > VIS_LOG_CAP) visLog.splice(0, 500);
}
if (typeof document !== "undefined") {
  document.addEventListener("visibilitychange", (e) => {
    const t = performance.now();
    const s = e.timeStamp;
    seeVisibility(t, s > 0 && s <= t ? s : t);
  });
}

/** HOW MUCH OF A STRETCH THE PAGE WAS HIDDEN. Takes `from` and `to` on the page's
 *  clock. Returns the milliseconds inside them that the visibility record says the
 *  page was hidden (an unfinished hidden stretch runs to `to`), 0 when it was
 *  visible throughout. What the caller relies on: never more than `to - from`,
 *  and the same stretch asked twice gives the same answer unless an event has
 *  corrected an entry between. */
function hiddenWithin(from: number, to: number): number {
  let total = 0;
  for (let i = 0; i < visLog.length; i++) {
    if (visLog[i].shown) continue;
    const lo = Math.max(visLog[i].at, from);
    const hi = Math.min(i + 1 < visLog.length ? visLog[i + 1].at : Infinity, to);
    if (hi > lo) total += hi - lo;
  }
  return total;
}
const FRAME_WATCH_MS = 60000;
// EVERY PAUSE WORTH NAMING, with where it began, so the graphics build can be
// judged by what the page DID while it ran rather than by what the browser
// offered to do (decision 071): offering to build without holding the page is
// not the same as not holding it, and only the frames can tell them apart.
const GAP_KEPT_MS = 50;
const gaps: [number, number][] = [];
const graphicsBuilding = () =>
  (marks.has("graphics-start") && !marks.has("graphics-built") && !marks.has("graphics-failed")) ||
  (marks.has("masks-start") && !marks.has("masks-built") && !marks.has("masks-failed"));
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
 *  the start screen said it was preparing — "masks-start", "masks-built",
 *  "masks-failed" and "masks-onpage" — the build of the program that draws the
 *  masks, which follows the picture's — and "controls-wired"); stores the time since
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
  // ANY pause that overlaps the build, including one that began just before
  // it: the old test counted only a pause starting inside the build or
  // spanning all of it, and missed the page already held when the build began,
  // which is how the build-wait walk failed about one run in two.
  for (const [a, b] of gaps) if (a < to && b > from) worst = Math.max(worst, b - a);
  // An unfinished pause: the page has not drawn since before the build ended.
  if (lastFrame < to && to - lastFrame > worst && lastFrame >= from) worst = to - lastFrame;
  const tail = hiddenWithin(from, to) > 0 ? ", and the page was hidden for part of it" : "";
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
  // THE MASKS' PROGRAM, WHICH FOLLOWS THE PICTURE'S (decision 071, option 11).
  // Said only on a page that built graphics. Where it ran is stated, and whether
  // the page stayed free is read off the frames only for a build made off the
  // page, which starts within the frame watch's first minute; one made on the
  // page at the first mask can come long after the watch stopped, and the
  // "Holds" line names it as a stage instead.
  if (gs != null) {
    const ms = marks.get("masks-start"), mb = marks.get("masks-built"), mf = marks.get("masks-failed");
    const where = marks.has("masks-onpage") ? "built on the page at the first mask" : "built off the page";
    const free = (a: number, b: number) => marks.has("masks-onpage") ? "" : `; ${heldDuring(a, b)}`;
    parts.push(ms != null && mb != null ? `masks built ${at(ms)}–${at(mb)} (${took(mb - ms)}; ${where}${free(ms, mb)})`
      : ms != null && mf != null ? `masks failed ${at(mf)}, ${took(mf - ms)} after starting (${where})`
      : ms != null ? `masks still building since ${at(ms)} (${where})`
      : "masks not built yet (they are built after the picture where the browser allows, and at the first mask where it does not)");
  }
  parts.push(marks.has("controls-wired") ? `controls wired ${at(marks.get("controls-wired"))}` : "controls not marked on this page");
  const gapEnd = longestAt + longestGap;
  const wasHidden = hiddenWithin(longestAt, gapEnd) > 0;
  parts.push(`longest pause ${took(longestGap)} at ${at(longestAt)}${wasHidden ? " (the page was hidden for part of it)" : ""}`);
  parts.push(updateFound != null
    ? `update found ${at(updateFound)}, ${installEnded != null ? `${installState} ${at(installEnded)}` : "still installing"}`
    : "no update this launch");
  const c = (navigator as Navigator & { connection?: { downlink?: number; rtt?: number } }).connection;
  parts.push(c && c.downlink != null ? `connection ${c.downlink} Mb/s, ${c.rtt ?? "?"} ms` : "connection not reported");
  return parts.join(" · ");
}

// --- THE HOLD WATCH, FOR THE WHOLE SESSION (decision 071) ---------------------
// The frame watch above stops after a minute and says nothing about WHAT the
// app was doing. This one never stops, and names the stage. It is a timer, not a
// frame callback: a timer that fires late is the page unable to run anything, and
// it costs nothing between its looks, where a frame callback every sixteenth of a
// second for a whole session is a standing cost on a tablet.

/** How often the watch looks, how late a look must be to count as a hold (the
 *  same 250 ms `heldDuring` calls "waited"), and how many holds are kept. */
const HOLD_EVERY_MS = 100;
const HOLD_OVER_MS = 250;
const HOLDS_KEPT = 3;

/** One stretch of the app's work, from `busyWith`; `to` is null while it is in
 *  force. */
interface Stage { name: string; from: number; to: number | null }
let stages: Stage[] = [];
const STAGES_CAP = 400;

/** MARKS A STAGE OF THE APP'S WORK AS IN FORCE, for the hold watch.
 *  Takes `name`, a short phrase that reads after "while" in the report ("the sky
 *  map", "a look press"). Returns a function that ends the stage; calling it
 *  again does nothing, so a path can end its stage in a `finally` and again in a
 *  callback. Changes nothing on screen and reports nothing by itself.
 *  What the watch relies on: the stage is kept as an INTERVAL, from now until the
 *  returned function is called, and stays readable until the watch's next look.
 *  A hold that is synchronous work has ended before the timer can fire to say it
 *  happened, so a marker read only at the moment of the look would read idle for
 *  exactly the holds worth naming. A path that never ends its stage is named by
 *  every hold after it, which `holdWatchLine` shows by printing what is in force
 *  now. */
export function busyWith(name: string): () => void {
  const s: Stage = { name, from: performance.now(), to: null };
  stages.push(s);
  if (stages.length > STAGES_CAP) {
    // A page the watch cannot look at (hidden, or frozen) prunes nothing, so a
    // long run of small stages is bounded here: every stage still in force, and
    // the newest of the rest.
    stages = [...stages.filter((x) => x.to === null), ...stages.filter((x) => x.to !== null).slice(-STAGES_CAP / 2)];
  }
  return () => { if (s.to === null) s.to = performance.now(); };
}

/** THE STAGES IN FORCE AT ANY TIME BETWEEN `from` AND `to`, as one clause.
 *  Takes the two times on the page's clock. Returns the stages, longest overlap
 *  first and at most three, each with how much of the stretch it covered, or "no
 *  stage was marked". Several stages of one name (the strip's tiles run side by
 *  side) count once, for the time any of them was in force. The picture code's
 *  build is read from the start-up marks, because it has no marker of its own and
 *  it is the one stage already known to hold a page for tens of seconds.
 *  What the caller relies on: the lengths are inside `from` to `to`, never the
 *  stage's whole run. */
function stagesDuring(from: number, to: number): string {
  const by = new Map<string, [number, number][]>();
  const add = (name: string, a: number, b: number) => {
    const lo = Math.max(a, from), hi = Math.min(b, to);
    if (hi <= lo) return;
    const held = by.get(name);
    if (held) held.push([lo, hi]); else by.set(name, [[lo, hi]]);
  };
  for (const s of stages) add(s.name, s.from, s.to ?? to);
  const gs = marks.get("graphics-start");
  if (gs != null) add("the picture code's build", gs, marks.get("graphics-built") ?? marks.get("graphics-failed") ?? to);
  if (!by.size) return "no stage was marked";
  const spans = [...by].map(([name, iv]) => {
    iv.sort((x, y) => x[0] - y[0]);
    let len = 0, end = -Infinity;
    for (const [a, b] of iv) { const lo = Math.max(a, end); if (b > lo) len += b - lo; end = Math.max(end, b); }
    return { name, len };
  }).sort((x, y) => y.len - x.len);
  return spans.slice(0, 3).map((s) => `${s.name} (${took(s.len)} of it)`).join(", ") + (spans.length > 3 ? `, and ${spans.length - 3} more` : "");
}

/** A hold: when it was due to be answered, when it was answered, how late it was
 *  (`len`, so `at + len` is `came`), and the stages in force across it. How much
 *  of it the page was hidden is not stored: it is read from the visibility record
 *  when the report is taken, because an event can correct the record after the
 *  look that found the hold. */
interface Hold { at: number; came: number; len: number; during: string }
const longestHolds: Hold[] = [];
let holdCount = 0, holdTotal = 0, holdsSkipped = 0, watchChecks = 0, watchSelfMs = 0;
/** The span of every hold counted, due to answered, so the report can say how
 *  many spanned a hidden stretch. Capped; the report says when the cap was hit. */
const holdSpans: [number, number][] = [];
const HOLD_SPANS_CAP = 1000;

/** ONE LOOK OF THE WATCH, JUDGED. Takes the time of the previous look and the
 *  wall clock then, and this look's. Counts a hold when this look came more than
 *  250 ms after it was due, except when the device slept (the wall clock ran on
 *  five seconds or more past the page's own, which stops while a machine sleeps)
 *  or the page is STILL HIDDEN as the look runs: a hidden page has its timers
 *  slowed by the browser, and a look made under that slowing is not the app. Those
 *  are counted apart. A look that comes the instant the page returns is a hold
 *  and is kept, with how much of it the page was hidden read when the report is
 *  taken (`holdsLine`), because that is exactly the look that says a page was in
 *  the background and not blocked. Returns nothing. What it must satisfy: a look
 *  on time costs only the arithmetic, which is why the watch is cheap enough to
 *  leave running. */
function checkHold(prev: number, prevWall: number, now: number, wall: number): void {
  const late = now - prev - HOLD_EVERY_MS;
  if (late <= HOLD_OVER_MS) return;
  if (hiddenNow() || (wall - prevWall) - (now - prev) > 5000) { holdsSkipped++; return; }
  holdCount++;
  holdTotal += late;
  if (holdSpans.length < HOLD_SPANS_CAP) holdSpans.push([prev + HOLD_EVERY_MS, now]);
  // The stretch the stages are read over is the hold itself, from when the look was
  // due to when it came, so no stage is credited with more time than the hold has.
  longestHolds.push({ at: prev + HOLD_EVERY_MS, came: now, len: late, during: stagesDuring(prev + HOLD_EVERY_MS, now) });
  longestHolds.sort((a, b) => b.len - a.len);
  if (longestHolds.length > HOLDS_KEPT) longestHolds.length = HOLDS_KEPT;
}

/** One look, in full: reads both clocks, notes a change of the page's visibility
 *  the browser's event has not delivered yet, judges the gap since the previous
 *  look and lets go of stages that ended before it. Takes the previous look's page
 *  time and wall time; returns this look's, as [page time, wall time], for the
 *  next. What it must satisfy: the visibility is read before the gap is judged, so
 *  a hold found by this look is read against a record that includes the change. */
function look(prev: number, prevWall: number): [number, number] {
  const c0 = performance.now(), wall = Date.now();
  seeVisibility(c0);
  checkHold(prev, prevWall, c0, wall);
  if (stages.length) stages = stages.filter((s) => s.to === null || s.to > c0);
  return [c0, wall];
}

/** Work the watch's timer carries, one call per look. Each entry returns true
 *  when it has nothing left to do, and is then dropped. */
const ticks: (() => boolean)[] = [];

/** ASKS THE HOLD WATCH'S TIMER TO CARRY ONE QUESTION, once per look.
 *  Takes `fn`, called on every look after the first it is registered for, with
 *  no arguments. It returns true when it is finished, and is not called again;
 *  false keeps it. Returns nothing. What it must satisfy: `fn` asks and does not
 *  wait, since it runs on the page's own thread between two looks, and a call
 *  that throws counts as finished. Consumed by main.ts for the masks' program:
 *  started once the picture's is built, then asked whether it has linked. It runs
 *  after the next look is scheduled and outside the cost the "Hold watch" line
 *  prints, so a call that does hold the page shows as a late look. */
export function onWatchTick(fn: () => boolean): void {
  ticks.push(fn);
}

/** One round of the registered questions. Takes nothing; returns nothing.
 *  Walks the list from the end so a finished entry can be dropped in place. */
function runTicks(): void {
  for (let i = ticks.length - 1; i >= 0; i--) {
    let done = false;
    try { done = ticks[i](); } catch { done = true; }
    if (done) ticks.splice(i, 1);
  }
}

let lastLook = T0, lastWall = Date.now();
const lookAgain = () => {
  const c0 = performance.now();
  [lastLook, lastWall] = look(lastLook, lastWall);
  // Scheduled before the cost is read, so scheduling is part of what it costs.
  setTimeout(lookAgain, HOLD_EVERY_MS);
  watchChecks++;
  watchSelfMs += performance.now() - c0;
  if (ticks.length) runTicks();
};
if (typeof setTimeout === "function") setTimeout(lookAgain, HOLD_EVERY_MS);

/** The report's "Holds" line: the longest stretches this session in which the
 *  page could not run a timer, and whether each was the page hidden or the page
 *  blocked.
 *  Takes nothing. Returns one line: how many holds there were over 250 ms, how
 *  many of them spanned a hidden stretch, and their total, then the longest
 *  three, each with its length, when it was due (seconds since the page was
 *  requested, as the Start-up line counts), the stages in force across it and how
 *  much of it the page was hidden (or that it was not hidden at any time in it);
 *  or that there were none. Late looks made while the page was still hidden, or
 *  after a sleep, are counted apart, so a covered window is not read as a frozen
 *  app; a look that came the instant the page returned is a hold and says how much
 *  of itself was the page hidden. What the caller relies on: the hidden amount is
 *  never more than the hold's own length, and the line names no file and nothing
 *  the reader wrote, only stage names this module's callers chose. */
export function holdsLine(): string {
  const watched = performance.now() - T0;
  const away = holdsSkipped ? `; ${holdsSkipped} late look${holdsSkipped === 1 ? "" : "s"} left out because the page was still hidden when the look came, or the device asleep` : "";
  if (!holdCount) return `none over ${HOLD_OVER_MS} ms in the ${at(watched)} watched${away}`;
  const spanned = holdSpans.filter(([a, b]) => hiddenWithin(a, b) > 0).length;
  const counted = holdSpans.length < holdCount ? ` among the first ${holdSpans.length}` : "";
  const top = longestHolds.map((h) => {
    const hid = Math.min(h.len, hiddenWithin(h.at, h.came));
    return `${took(h.len)} at ${at(h.at)}, while ${h.during}; ${hid > 0 ? `the page was hidden for ${took(hid)} of it` : "the page was not hidden at any time in it"}`;
  }).join(" · ");
  return `${holdCount} over ${HOLD_OVER_MS} ms (${spanned ? `${spanned} spanned` : "none spanned"} a hidden stretch${counted}), ${took(holdTotal)} in all, in the ${at(watched)} watched — the longest ${longestHolds.length === 1 ? "one" : longestHolds.length}: ${top}${away}`;
}

/** The report's "Hold watch" line: what the watch is, what it has cost, what is in
 *  force now and what the page's visibility has been. Takes nothing. Returns one
 *  line: the interval, the looks made and the time spent in them by the page's own
 *  clock (a coarse clock, so the test page's "The hold watch's own cost" row is the
 *  real figure), the stages in force at this moment with how long each has been,
 *  and the newest five entries of the visibility record, each the state the page
 *  was in from that time (the first is the state at load; one marked "seen at a
 *  look" was found by the watch before the browser's event, so its time is the
 *  look's). What the caller relies on: "stages in force now" reads "none" on an
 *  idle page, so a stage that was never ended is seen here before it is blamed for
 *  a hold, and the record always has at least the state at load. */
export function holdWatchLine(): string {
  const now = performance.now();
  const open = stages.filter((s) => s.to === null);
  const inForce = open.length ? open.map((s) => `${s.name} for ${took(now - s.from)}`).join(", ") : "none";
  const shown = visLog.slice(-5).map((e) => `${e.shown ? "visible" : "hidden"} from ${at(e.at)}${e.byLook ? " (seen at a look)" : ""}`).join(", ");
  const earlier = visLog.length > 5 ? ` (and ${visLog.length - 5} earlier)` : "";
  return `a look every ${HOLD_EVERY_MS} ms, ${watchChecks} made, ${watchSelfMs.toFixed(1)} ms spent in them by the page's own clock; stages in force now: ${inForce}; page visibility: ${shown}${earlier}`;
}

/** WHAT ONE LOOK OF THE WATCH COSTS, MEASURED ON THIS DEVICE (the test page's row).
 *  Takes `runs`, how many timed runs to make, and `looks`, how many looks in
 *  each. Returns the microseconds one look took in each run, in run order.
 *  Each look is the real one — both clocks, the judgement, the stage pruning —
 *  plus the cost of scheduling the next, a timer set and cleared; a look is on
 *  time by construction, so none is counted as a hold. What the caller relies on:
 *  it records no hold of its own looks (a look on time records nothing), and it
 *  holds the page for runs times looks times the cost, which the real watch can
 *  see as one hold; that hold is named "measuring the hold watch" so it is not
 *  taken for the app's. */
export function measureHoldWatch(runs = 3, looks = 10000): number[] {
  const noop = () => {};
  const per: number[] = [];
  const end = busyWith("measuring the hold watch");
  try {
    for (let r = 0; r < runs; r++) {
      let prev = performance.now(), prevWall = Date.now();
      const t0 = performance.now();
      for (let i = 0; i < looks; i++) {
        // Each look follows the last within microseconds, so it is early and never
        // late: it records nothing, and costs what an on-time look costs.
        [prev, prevWall] = look(prev, prevWall);
        clearTimeout(setTimeout(noop, 3.6e6));
      }
      per.push(((performance.now() - t0) / looks) * 1000);
    }
  } finally {
    end();
  }
  return per;
}
