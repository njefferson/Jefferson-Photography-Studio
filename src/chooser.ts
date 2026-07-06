// Two-door landing page. Deliberately tiny: it must NOT pull in the IR editor
// or the macro engine (route-based code-splitting — each mode's heavy bundle
// loads only when its door is opened). All it does is register the shared
// service worker so the whole studio works offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}
