// Share / copy-link for the INSTALLED (standalone) app.
//
// "Add to Home Screen" turns the site into a standalone app with NO Safari
// chrome — no address bar, no Share button, no Back. So once installed there is
// no built-in way to send someone the link, or even to see it. This puts that
// back: a Share control, revealed ONLY when running standalone (in the browser
// Safari already provides Share/URL/Back, so we stay out of the way there),
// that opens the native share sheet and falls back to copying the link.

export function isStandaloneApp(): boolean {
  return (
    (typeof window.matchMedia === "function" &&
      window.matchMedia("(display-mode: standalone)").matches) ||
    // iOS Safari's own flag — older iOS doesn't report the display-mode query.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;

/** A small, self-styled confirmation (used for the copy-link fallback), so it
 *  looks the same on every surface regardless of that page's stylesheet. */
function toast(msg: string, ms = 2200): void {
  if (!toastEl) {
    toastEl = document.createElement("div");
    toastEl.setAttribute("role", "status");
    Object.assign(toastEl.style, {
      position: "fixed",
      left: "50%",
      bottom: "calc(env(safe-area-inset-bottom, 0px) + 1.25rem)",
      transform: "translateX(-50%)",
      maxWidth: "90vw",
      padding: "0.6rem 0.95rem",
      borderRadius: "12px",
      background: "rgba(20,20,24,0.96)",
      color: "#f2f2f4",
      font: '500 0.9rem/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif',
      boxShadow: "0 8px 30px rgba(0,0,0,0.5)",
      border: "1px solid rgba(255,255,255,0.12)",
      zIndex: "99999",
      textAlign: "center",
      opacity: "0",
      transition: "opacity 0.18s ease",
      pointerEvents: "none",
      wordBreak: "break-all",
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(toastEl);
  }
  toastEl.textContent = msg;
  toastEl.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    if (toastEl) toastEl.style.opacity = "0";
  }, ms);
}

/** Open the native share sheet for this app's link; fall back to copying it,
 *  then to simply showing it. The share sheet's own "Copy" is how you grab the
 *  URL when there's no address bar. */
export async function shareApp(): Promise<void> {
  const url = location.href;
  const title = document.title || "Photography Studio";
  const nav = navigator as Navigator & { share?: (d: ShareData) => Promise<void> };

  if (typeof nav.share === "function") {
    try {
      await nav.share({ title, url });
      return;
    } catch (err) {
      // A user-cancelled sheet is not an error — just stop.
      if ((err as DOMException)?.name === "AbortError") return;
      // Anything else (share unsupported for this data, etc.): fall through.
    }
  }

  try {
    await navigator.clipboard.writeText(url);
    toast("Link copied");
    return;
  } catch {
    toast(url, 6000); // last resort: show it so it can be read or typed
  }
}

/** Reveal the given button and wire it to shareApp(), but only when the page is
 *  running as an installed standalone app. A no-op in the browser and if the
 *  button isn't on the page. */
export function setupInstalledShare(btnId: string): void {
  const btn = document.getElementById(btnId);
  if (!btn || !isStandaloneApp()) return;
  btn.hidden = false;
  btn.addEventListener("click", () => {
    void shareApp();
  });
}
