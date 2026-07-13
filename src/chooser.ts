// Two-door landing page. Deliberately tiny: it must NOT pull in the IR editor
// or the macro engine (route-based code-splitting — each mode's heavy bundle
// loads only when its door is opened). All it does is register the shared
// service worker so the whole studio works offline.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

// Installed-app Share (src/share.ts): only appears when the launcher is running
// as a standalone app, where Safari's own Share / address bar are gone.
import { setupInstalledShare } from "./share";
setupInstalledShare("shareBtn");

// Home-Screen icon picker (src/iconpicker.ts): choose which icon the installed
// Studio launcher wears, swapped before Add-to-Home-Screen. Requires JS, so the
// section stays hidden until it's built.
import { setupIconPicker } from "./iconpicker";
const picker = document.getElementById("iconPicker");
if (picker) {
  setupIconPicker(picker);
  picker.hidden = false;
}
