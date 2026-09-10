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

export function wireForceUpdate(button: HTMLButtonElement, note: HTMLElement): void {
  let forcing = false;
  button.addEventListener("click", async () => {
    if (forcing) return;
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

    go.addEventListener("click", () => {
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
