// Two-door landing page. Deliberately tiny: it must NOT pull in the IR editor
// or the macro engine (route-based code-splitting — each mode's heavy bundle
// loads only when its door is opened). All it does is register the shared
// service worker so the whole studio works offline.
import "./launcher.css";
import { wireThemeToggle } from "./theme";
import { wireForceUpdate } from "./swupdate";
wireThemeToggle(document.getElementById("themeToggle"));

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

{
  const btn = document.getElementById("forceUpdate") as HTMLButtonElement | null;
  const note = document.getElementById("forceUpdateNote");
  if (btn && note) wireForceUpdate(btn, note);
}

// Installed-app Share (src/share.ts): only appears when the launcher is running
// as a standalone app, where Safari's own Share / address bar are gone.
import { setupInstalledShare, setupInstallFromApp } from "./share";
setupInstalledShare("shareBtn");
setupInstallFromApp("installFromApp");

// First-visit welcome: what the studio is, the tool family, and how (and why,
// and that it's OPTIONAL) to install — auto-opens ONCE for new visitors, and
// the ⓘ button reopens the SAME card forever after, so dismissing it never
// loses the information. Any close path (Got it, tap outside, Esc) counts as
// seen. Private mode (no storage) reads as seen — better never-nagging than
// nagging on every load.
{
  const welcome = document.getElementById("welcomeDlg") as HTMLDialogElement | null;
  const infoBtn = document.getElementById("infoBtn");
  if (welcome && infoBtn && typeof welcome.showModal === "function") {
    const KEY = "studio-welcome-seen";
    let seen: string | null = "1";
    try { seen = localStorage.getItem(KEY); } catch { /* private mode -> seen */ }
    welcome.addEventListener("close", () => {
      try { localStorage.setItem(KEY, "1"); } catch { /* private mode */ }
    });
    welcome.addEventListener("click", (e) => {
      if (e.target === welcome) welcome.close(); // tap outside to dismiss
    });
    document.getElementById("welcomeClose")?.addEventListener("click", () => welcome.close());
    infoBtn.addEventListener("click", () => welcome.showModal());
    if (seen === null) welcome.showModal();
  }
}

// Home-Screen icon picker (src/iconpicker.ts): choose which icon the installed
// Studio launcher wears, swapped before Add-to-Home-Screen. Requires JS, so the
// section stays hidden until it's built.
import { setupIconPicker } from "./iconpicker";
const picker = document.getElementById("iconPicker");
if (picker) {
  setupIconPicker(picker);
  picker.hidden = false;
}
