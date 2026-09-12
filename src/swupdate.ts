import "./swstrip.css";
// Shared "Update to the latest version" wiring for all three PWAs — the Studio
// chooser, Infrared, and Macro. One service worker at root scope serves the
// whole site, so this same flow works from any page (owner ask, 2026-07-20:
// wants the button on the chooser and Macro too, not just IR's Settings).
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
 *  moment of the press, the answer cannot go stale. */
let updateCost: (() => string | null) | null = null;
export function setUpdateCost(fn: (() => string | null) | null): void {
  updateCost = fn;
}

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

/** §7h's other half: the reader is TOLD, without having to go looking.
 *  wireForceUpdate above is a PULL — it only helps somebody who already
 *  suspects there is a new version and knows which panel to open. A newcomer
 *  never does. This is the push: the worker waits, and the app says so. */
export function wireUpdateStrip(): void {
  if (!("serviceWorker" in navigator)) return;
  // Looked up here rather than passed in, so the three callers are one line
  // each and cannot drift on which ids they use. A page without the markup
  // simply does not get a strip.
  const strip = document.getElementById("swStrip");
  const go = document.getElementById("swStripGo") as HTMLButtonElement | null;
  const later = document.getElementById("swStripLater") as HTMLButtonElement | null;
  if (!strip || !go || !later) return;
  followModals(strip);
  let dismissed = false;
  const show = () => { if (!dismissed) strip.hidden = false; };

  const watch = (reg: ServiceWorkerRegistration) => {
    // Already waiting when the page opened — the commonest case by far, because
    // the update downloaded during a previous visit.
    if (reg.waiting && navigator.serviceWorker.controller) show();
    reg.addEventListener("updatefound", () => {
      const w = reg.installing;
      if (!w) return;
      w.addEventListener("statechange", () => {
        // "installed" WITH a controller means an update to something already
        // running. Without a controller it is the very first install, and
        // announcing a new version to somebody who just arrived is nonsense.
        if (w.state === "installed" && navigator.serviceWorker.controller) show();
      });
    });

    // Two presses when there is something to lose, one when there is not. The
    // cost is read at the press, and the text names the work rather than
    // warning in the abstract — "you will lose your quick look of 94 photos"
    // is a decision; "are you sure?" is a speed bump.
    let armed = false;
    go.addEventListener("click", () => {
      const cost = armed ? null : updateCost?.() ?? null;
      if (cost) {
        armed = true;
        const text = strip.querySelector(".sw-strip-text");
        if (text) text.textContent = `Updating restarts the app, and ${cost} Press Update again to go ahead, or Not now to keep working.`;
        go.textContent = "Update anyway";
        return;
      }
      go.disabled = true;
      go.textContent = "Updating…";
      let reloaded = false;
      const once = () => { if (!reloaded) { reloaded = true; location.reload(); } };
      navigator.serviceWorker.addEventListener("controllerchange", once, { once: true });
      (reg.waiting ?? reg.active)?.postMessage({ type: "SKIP_WAITING" });
      setTimeout(once, 20000); // never a dead end, same safety net as the button
    });
    later.addEventListener("click", () => { dismissed = true; strip.hidden = true; });

    // Coming back to the app is the moment worth re-checking: an install left
    // open on a home screen can sit for days without a navigation.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") void reg.update().catch(() => {});
    });
  };

  // `ready` rather than `getRegistration()`. THIS WAS THE BUG in the first
  // version, and it made the whole strip dead on arrival while the gate still
  // reported green: this module runs at import time, the app registers its
  // worker later, so getRegistration() resolved to undefined and not one
  // listener was ever attached. `ready` resolves once a registration is ACTIVE,
  // which is the state this needs and the state that cannot be raced.
  void navigator.serviceWorker.ready.then(watch).catch(() => {});
}
