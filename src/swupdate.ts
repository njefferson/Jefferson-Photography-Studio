// Shared "Update to the latest version" wiring for all three PWAs — the Studio
// chooser, Infrared, and Macro. One service worker at root scope serves the
// whole site, so this same flow works from any page (owner ask, 2026-07-20:
// wants the button on the chooser and Macro too, not just IR's Settings).
//
// It reloads ONLY once the new worker has actually taken control. Reloading on
// a blind timer (the old bug) dropped you back onto the old cached code, because
// over a phone connection the new app shell hasn't finished downloading yet. The
// SW self-activates (skipWaiting) once its precache completes, which fires
// controllerchange — that's our signal that fresh code is live. Measured on
// cellular, 2026-07-20.
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
