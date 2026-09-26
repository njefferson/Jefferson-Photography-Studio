// THE STANDING "A NEW VERSION IS WAITING" STRIP, for all three PWAs (Doctrine
// §7h). One service worker at root scope serves the whole site, so this same
// flow works from any page. An app that caches itself cannot notice it has gone
// stale, so the new worker WAITS rather than taking over under the open page,
// and the reader is told in words they can see.
import "./swstrip.css";
// Shared "Update to the latest version" wiring for all three PWAs — the Studio
// chooser, Infrared, and Macro. One service worker at root scope serves the
// whole site, so this same flow works from any page (asked for 2026-07-20:
// the button on the chooser and Macro too, not just IR's Settings).
//
// It reloads ONLY once the new worker has actually taken control. Reloading on
// a blind timer (the old bug) dropped you back onto the old cached code, because
// over a phone connection the new app shell hasn't finished downloading yet.
// controllerchange is the signal that fresh code is live. Measured on cellular,
// 2026-07-20.
//
// THAT SENTENCE USED TO SAY the worker self-activates once its precache
// completes. It did — sw.js called skipWaiting() during install — and that was
// the defect: the new worker took over UNDER the open page, which is still
// running the previous release's HTML and modules, and activate then deletes
// the old cache, so that page is served new files from then on. A mixed app,
// invisible by construction. The worker WAITS now, and only a message from the
// page releases it, which is what both routes below send.
declare const __APP_VERSION__: string;
// This build's id, stamped into sw.js too (vite.config.ts buildId). Sent with
// ADOPT so a waiting worker can tell whether it IS the build on screen.
declare const __BUILD_ID__: string;

// The answer setUpdateCost installs, asked by both routes at the moment of a
// press. Declared here, above the contract, because the contract belongs to
// the function below it.
let updateCost: (() => string | null) | null = null;

/** WHAT TAKING THE UPDATE WOULD COST RIGHT NOW, or null when it costs nothing.
 *
 *  Applying an update reloads the page, and a reload is not free for every
 *  screen. A quick look in particular CANNOT survive one: the browser will not
 *  re-open a file the reader picked, so the folder has to be picked again, and
 *  the thumbnails it had built are in memory only.
 *
 *  Reported from a real session — the update was taken mid-quick-look and every
 *  thumbnail was discarded and rebuilt. The strip had no way to know it was
 *  interrupting anything, because nothing told it.
 *
 *  A FUNCTION RATHER THAN A FLAG, deliberately. A flag has to be cleared on
 *  every path out of the state it describes, and the one path somebody forgets
 *  leaves the app permanently claiming there is work to lose. Asked at the
 *  moment of the press, the answer cannot go stale.
 *
 *  Takes `fn`, a function answering in words what a reload would lose right
 *  now — a clause that completes "Updating restarts the app, and …" with its
 *  own full stop — or null when nothing would be lost; passing null removes
 *  it. Returns nothing. What the callers rely on: it is ASKED at the moment of
 *  a press by both routes in this file, never stored as an answer, so what it
 *  says cannot outlive the state it describes. */
export function setUpdateCost(fn: (() => string | null) | null): void {
  updateCost = fn;
}

/** THE SETTINGS ROUTE: "Update to the latest version", on all three apps.
 *  Takes `button`, the control, and `note`, the line beside it that says what
 *  is happening. Returns nothing; wires one click listener. On a press it asks
 *  the same cost question as the strip (two presses when there is something to
 *  lose), asks the host for the newest worker, and sends SKIP_WAITING once that
 *  worker has installed; the page reloads when the new worker takes control.
 *  What the caller relies on: the button is never a dead end — nothing newer
 *  says so with the version on screen, and a handover that never comes still
 *  reloads, 20 s after the press. That timer starts at the PRESS, not when the
 *  download finishes, so on a thin line it can reload into the old version
 *  mid-download; decision 071 records that, and this route is otherwise left
 *  as it was. */
export function wireForceUpdate(button: HTMLButtonElement, note: HTMLElement): void {
  let forcing = false, armed = false;
  button.addEventListener("click", async () => {
    if (forcing) return;
    // EVERY ROUTE THAT APPLIES AN UPDATE ASKS THE SAME QUESTION. The strip
    // below grew a cost check first, and this button — the older route, in
    // Settings — did not have one, which would have made the warning a
    // property of which control the reader happened to find.
    const cost = armed ? null : updateCost?.() ?? null;
    if (cost) {
      armed = true;
      note.textContent = `Updating restarts the app, and ${cost} Press again to go ahead.`;
      return;
    }
    forcing = true;
    button.disabled = true;
    note.textContent = "Checking for a new version…";

    let reloaded = false;
    const reloadOnce = () => {
      if (!reloaded) {
        reloaded = true;
        location.reload();
      }
    };

    try {
      if (!("serviceWorker" in navigator)) {
        reloadOnce();
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        reloadOnce();
        return;
      }

      navigator.serviceWorker.addEventListener("controllerchange", reloadOnce, { once: true });
      await reg.update(); // fetch the newest sw.js (served no-store, so never stale)

      // The worker that update() turned up — installing now, or already waiting.
      const incoming = reg.installing || reg.waiting;
      if (!incoming) {
        // Server has nothing newer than what's already running.
        note.textContent = `You're already on the latest version (v${__APP_VERSION__}).`;
        forcing = false;
        button.disabled = false;
        navigator.serviceWorker.removeEventListener("controllerchange", reloadOnce);
        return;
      }

      note.textContent = "Downloading the update… this can take a moment on cellular.";
      const nudge = (w: ServiceWorker) => w.postMessage({ type: "SKIP_WAITING" });
      if (incoming.state === "installed") nudge(incoming);
      else
        incoming.addEventListener("statechange", () => {
          if (incoming.state === "installed") nudge(incoming);
        });
      // Safety net: if the handover never fires (some iOS builds are stubborn),
      // reload anyway after a generous wait so the button is never a dead end.
      setTimeout(reloadOnce, 20000);
    } catch {
      reloadOnce(); // offline / no SW — a plain reload still refetches network-first
    }
  });
}


/** A MODAL DIALOG MAKES THE STRIP UNPRESSABLE — and the state most worth
 *  warning about IS a modal dialog.
 *
 *  The strip lives in the page's own flow. `showModal()` puts a dialog in the
 *  top layer and makes everything outside it inert, so while a quick look of a
 *  folder is on screen the strip is behind the backdrop and dead to the touch.
 *  Measured: a press on Update during a quick look never landed — the element
 *  was never "visible, enabled and stable", for thirty seconds.
 *
 *  That is the §4 shape exactly. The warning was built, it was correct, and it
 *  could not be reached from the one screen it was built for; its presence in
 *  the source answered "have we handled this" for everyone after.
 *
 *  So the strip FOLLOWS the top layer: into the topmost open modal, and back
 *  out when that closes. It is the SAME element moved, not a copy — every
 *  listener wired below still applies, where a second copy of the markup in
 *  each dialog would have drifted. The stack is kept in the order dialogs
 *  opened, because document order does not say which one is on top. */
function followModals(strip: HTMLElement): void {
  const home = strip.parentElement;
  if (!home) return;
  const next = strip.nextSibling; // put it back exactly where it came from
  const stack: HTMLDialogElement[] = [];
  const isModal = (d: HTMLDialogElement) => {
    try { return d.matches(":modal"); } catch { return d.open; } // :modal is newer than dialog itself
  };
  const place = () => {
    const top = stack.length ? stack[stack.length - 1] : null;
    if (top) {
      if (strip.parentElement !== top) { strip.classList.add("sw-hosted"); top.prepend(strip); }
    } else if (strip.parentElement !== home) {
      strip.classList.remove("sw-hosted");
      home.insertBefore(strip, next);
    }
  };
  const seen = (d: HTMLDialogElement) => {
    const i = stack.indexOf(d);
    if (d.open && isModal(d)) { if (i < 0) stack.push(d); }
    else if (i >= 0) stack.splice(i, 1);
    place();
  };
  for (const d of document.querySelectorAll("dialog")) seen(d as HTMLDialogElement);
  new MutationObserver((recs) => {
    for (const r of recs) if (r.target instanceof HTMLDialogElement) seen(r.target);
  }).observe(document.documentElement, { attributes: true, attributeFilter: ["open"], subtree: true });
}

/** WHERE ONE VERSION STANDS AGAINST ANOTHER (decision 071).
 *  Takes `a` and `b`, version strings such as "2.63.10". Returns 1 when `a` is
 *  numerically higher, segment by segment with a missing segment counting as
 *  0 — so "2.63.10" is above "2.63.9" and "2.55" below "2.63.7" — -1 when
 *  lower, 0 when equal, and null when either is not made of numbers, since
 *  "dev" against "2.63" has no order and the caller must decide what no answer
 *  means. public/sw.js carries the same rule for its activate step.
 *  WHY IT EXISTS: the strip asked only whether a waiting version was
 *  DIFFERENT. Pages load network-first, so the page is often newer than the
 *  waiting worker; the strip then offered the older one, and taking it ran that
 *  worker's cleanup, which deletes the newer version's half-filled download.
 *  Consumed by `wireUpdateStrip`: the ready notice shows on a 1 (or on a
 *  different version with no order, as before this existed — informing wrongly
 *  is the smaller failure than silence about a real update), and the
 *  downloading notice ONLY on a 1. */
export function compareVersions(a: string, b: string): -1 | 0 | 1 | null {
  const parse = (v: string) => (/^\d+(\.\d+)*$/.test(v) ? v.split(".").map(Number) : null);
  const x = parse(a), y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

// The strip's states, each written by `render` below and mirrored into the
// strip's data-state for the stylesheet and the walks.
type StripState = "downloading" | "ready" | "confirm" | "applying" | "failed";

/** §7h's other half: the reader is TOLD, without having to go looking.
 *  wireForceUpdate above is a PULL — it only helps somebody who already
 *  suspects there is a new version and knows which panel to open. A newcomer
 *  never does. This is the push: the worker waits, and the app says so.
 *
 *  Takes nothing; returns nothing. Wires the page's `#swStrip`, if it has one.
 *  What the caller relies on: it is silent about the version on screen or an
 *  older one; a download is announced only on positive evidence that it is
 *  newer, and a failed one says so; a worker that IS this build (the same
 *  `__BUILD_ID__`) is asked to take over with no press and no reload, and the
 *  worker alone decides whether it may (sw.js adoptIfAlone). */
export function wireUpdateStrip(): void {
  if (!("serviceWorker" in navigator)) return;
  const sw = navigator.serviceWorker;
  // Looked up here rather than passed in, so the callers are one line each and
  // cannot drift on which ids they use. A page without the markup simply does
  // not get a strip.
  const strip = document.getElementById("swStrip");
  const go = document.getElementById("swStripGo") as HTMLButtonElement | null;
  const later = document.getElementById("swStripLater") as HTMLButtonElement | null;
  const text = strip?.querySelector<HTMLElement>(".sw-strip-text") ?? null;
  if (!strip || !go || !later || !text) return;
  followModals(strip);

  // TWO NODES WHERE THE MARKUP HAS ONE (071): the sentence is announced; the
  // count is drawn for the eye and hidden from assistive tech, because the
  // strip is role=status — atomic — and a count moving one file at a time
  // would have the whole region read again for every file. Built here, not in
  // four copies of the markup (ir, index, macro, debug), which would drift.
  const READY = text.textContent?.trim() || "A new version of this app is ready.";
  const sentence = document.createElement("span");
  sentence.className = "sw-strip-sentence";
  const count = document.createElement("span");
  count.className = "sw-strip-count";
  count.setAttribute("aria-hidden", "true");
  text.replaceChildren(sentence, count);
  sentence.textContent = READY;

  let dismissed = false;     // Not now on a NEW VERSION: this page, this version
  let quietDownload = false; // Not now on a DOWNLOAD — its own flag, so it cannot silence the ready notice after it
  let state: StripState | null = null;
  let words = READY;

  const render = (next: StripState | null, say = words, n = "") => {
    state = next;
    strip.dataset.state = next ?? "";
    count.textContent = n;
    if (next === null || (next === "downloading" && quietDownload) || (next === "ready" && dismissed)) {
      strip.hidden = true;
      return;
    }
    words = say;
    go.textContent = next === "confirm" ? "Update anyway" : next === "applying" ? "Updating…" : "Update now";
    go.disabled = next === "applying";
    later.textContent = next === "failed" ? "OK" : "Not now";
    if (strip.hidden) {
      // SHOWN, THEN WORDED A FRAME LATER: a live region that appears already
      // holding its words is announced by some screen readers and not others.
      // The frame reads `words` when it runs, so a later render always wins.
      sentence.textContent = "";
      strip.hidden = false;
      requestAnimationFrame(() => { sentence.textContent = words; });
    } else sentence.textContent = words;
  };

  /** Ask worker `w` a question of `type` over its own channel; null when it
   *  does not answer within a moment (an older worker without the handler). */
  const ask = <T,>(w: ServiceWorker, type: string): Promise<T | null> =>
    new Promise((resolve) => {
      let settled = false;
      const done = (v: T | null) => { if (!settled) { settled = true; resolve(v); } };
      try {
        const ch = new MessageChannel();
        ch.port1.onmessage = (e) => done((e.data ?? null) as T | null);
        w.postMessage({ type }, [ch.port2]);
      } catch { done(null); }
      setTimeout(() => done(null), 1500);
    });

  // A DOWNLOAD, SAID ONLY WHEN IT IS NEWS. Pages load network-first, so the
  // version installing is usually the one already on screen, and that is not an
  // update; the notice appears only when the installing worker says it is newer.
  const downloading = (version: string, done: number, total: number) => {
    if (!sw.controller || total <= 0) return;                    // a first install is nobody's update
    if (compareVersions(version, __APP_VERSION__) !== 1) return; // the version on screen, or older, is not news
    if (state === "ready" || state === "confirm" || state === "applying") return;
    render("downloading", "Downloading the update…", `${Math.min(done, total)} of ${total}`);
  };
  sw.addEventListener("message", (e) => {
    const d = e.data;
    if (d && d.type === "install-progress") downloading(String(d.version ?? ""), Number(d.done) || 0, Number(d.total) || 0);
  });
  // A worker's messages queue until the page is listening, and addEventListener
  // alone does not open the queue before parsing ends. This page listens now.
  sw.startMessages?.();

  // THE SAME BUILD TAKES OVER WITH NOTHING PRESSED, AND NOTHING RELOADS (071).
  // A waiting worker that is this very build is the offline copy catching up;
  // taking it changes nothing on screen. The page only says which build it is —
  // the WORKER decides whether it is safe (sw.js adoptIfAlone), and refuses any
  // other build, any cache with a gap in it, and any second window. No
  // controllerchange listener is armed here, so nothing reloads.
  const adopt = (w: ServiceWorker) => {
    try { w.postMessage({ type: "ADOPT", build: __BUILD_ID__ }); } catch { /* gone; the next launch asks again */ }
  };

  const settle = async (w: ServiceWorker) => {
    adopt(w);
    const v = await ask<string>(w, "VERSION");
    const c = v === null ? null : compareVersions(String(v), __APP_VERSION__);
    if (state === "confirm" || state === "applying") return; // the reader is already taking one
    // No answer is an older worker without the handler: say so, the rule since 2026-09-13.
    if (v === null || c === 1 || (c === null && String(v) !== __APP_VERSION__)) render("ready", READY);
    else if (state === "downloading") render(null);
  };

  const follow = (reg: ServiceWorkerRegistration, w: ServiceWorker) => {
    void ask<{ version: string; done: number; total: number }>(w, "PROGRESS")
      .then((p) => { if (p) downloading(String(p.version), Number(p.done) || 0, Number(p.total) || 0); });
    w.addEventListener("statechange", () => {
      // "installed" WITH a controller means an update to something already
      // running. Without a controller it is the very first install, and
      // announcing a new version to somebody who just arrived is nonsense.
      if (w.state === "installed" && sw.controller) void settle(w);
      else if (w.state === "redundant" && state === "downloading") {
        // A newer install replacing this one is not a failure; give it a moment to appear.
        setTimeout(() => {
          if (state === "downloading" && !reg.installing) {
            render("failed", "The update could not finish downloading. It will try again the next time you open the app.");
          }
        }, 1000);
      }
    });
  };

  const watch = (reg: ServiceWorkerRegistration) => {
    // Already waiting when the page opened — the commonest case by far, because
    // the update downloaded during a previous visit.
    if (reg.waiting && sw.controller) void settle(reg.waiting);
    if (reg.installing) follow(reg, reg.installing);
    reg.addEventListener("updatefound", () => { if (reg.installing) follow(reg, reg.installing); });

    // Two presses when there is something to lose, one when there is not. The
    // cost is read at the press, and the text names the work rather than
    // warning in the abstract — "you will lose your quick look of 94 photos"
    // is a decision; "are you sure?" is a speed bump.
    let armed = false;
    go.addEventListener("click", () => {
      const cost = armed ? null : updateCost?.() ?? null;
      if (cost) {
        armed = true;
        render("confirm", `Updating restarts the app, and ${cost} Press Update again to go ahead, or Not now to keep working.`);
        return;
      }
      render("applying", words);
      let reloaded = false;
      const once = () => { if (!reloaded) { reloaded = true; location.reload(); } };
      sw.addEventListener("controllerchange", once, { once: true });
      (reg.waiting ?? reg.active)?.postMessage({ type: "SKIP_WAITING" });
      setTimeout(once, 20000); // never a dead end, same safety net as the button
    });
    later.addEventListener("click", () => {
      if (state === "downloading") quietDownload = true;
      else if (state !== "failed") dismissed = true;
      render(null);
    });

    // Coming back to the app is the moment worth re-checking: an install left
    // open on a home screen can sit for days without a navigation. And a
    // takeover refused because another window was open can go ahead once that
    // window has closed, so the waiting worker is asked again.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible") return;
      void reg.update().catch(() => {});
      if (reg.waiting && sw.controller) void settle(reg.waiting);
    });
  };

  // `ready` rather than `getRegistration()`. THIS WAS THE BUG in the first
  // version, and it made the whole strip dead on arrival while the gate still
  // reported green: this module runs at import time, the app registers its
  // worker later, so getRegistration() resolved to undefined and not one
  // listener was ever attached. `ready` resolves once a registration is ACTIVE,
  // which is the state this needs and the state that cannot be raced.
  void sw.ready.then(watch).catch(() => {});
}
