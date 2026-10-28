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
let toastWatch: MutationObserver | null = null;

/** WHERE WORDS CAN BE SEEN RIGHT NOW. Takes nothing. Returns the open dialog
 *  holding the focus, else the first open dialog, else the page's body.
 *
 *  A modal <dialog> paints in the top layer, ABOVE any fixed element — a toast
 *  confirming a copy made from inside Help was invisible (review find,
 *  2026-07-15). So the words are mounted inside the open dialog when there is one.
 *
 *  AND THE ONE ON TOP when two are open, which is the one holding the focus: a
 *  modal makes everything under it inert, so focus can only be in the top one.
 *  The first open dialog in DOCUMENT order is not that — a Keep refused while
 *  the busy card was up put its toast inside the busy card, under the Quick
 *  look the reader was pressing it in (decision 075).
 *
 *  What the caller relies on: the element returned is the one a reader looking
 *  at the screen now sees on top, so a toast mounted there is not covered. */
function toastHost(): HTMLElement {
  const focused = document.activeElement?.closest<HTMLElement>("dialog[open]");
  return focused ?? document.querySelector<HTMLElement>("dialog[open]") ?? document.body;
}

/** KEEP THE TOAST WHERE IT SHOWS WHILE IT IS UP. Takes nothing; returns nothing.
 *  Moves the toast's one element to where `toastHost` says words can be seen now,
 *  and does nothing when it is there already or no toast has been made.
 *
 *  Why it runs after the toast was mounted and not only when it is: a dialog that
 *  OPENS after the words went up is modal and covers a toast left in the body,
 *  and a dialog that CLOSES takes a toast mounted inside it away with it. Keeping
 *  the words where a reader can see them is done by watching dialogs open and
 *  close, since nothing that raises or takes down a card tells the toast.
 *  What the caller relies on: after it returns the toast is not inside a closed
 *  dialog and not under an open one. */
function placeToast(): void {
  if (!toastEl) return;
  const host = toastHost();
  if (toastEl.parentElement !== host) host.appendChild(toastEl);
}

/** Start watching dialogs open and close, once. Takes nothing; returns nothing.
 *  A dialog's `open` attribute is what a modal opening and closing changes, so
 *  that attribute, anywhere in the page, is the one thing watched, and the work
 *  done on each change is `placeToast`, which moves one element and changes no
 *  attribute, so it cannot call itself. A browser without MutationObserver keeps
 *  the placing at the moment the words are shown, as before. */
function watchDialogs(): void {
  if (toastWatch || typeof MutationObserver !== "function") return;
  toastWatch = new MutationObserver(placeToast);
  toastWatch.observe(document.documentElement, { subtree: true, attributes: true, attributeFilter: ["open"] });
}

/** A small, self-styled confirmation (used for the copy-link fallback and the
 *  look-sharing flows), so it looks the same on every surface regardless of
 *  that page's stylesheet.
 *
 *  Takes `msg`, the words, and `ms`, how long they stay. Returns nothing; it
 *  mounts one reused element and fades it out after `ms`. What callers rely
 *  on: the words land somewhere the reader can SEE, which with a modal open
 *  means inside the modal on top (`toastHost`), and they STAY where a reader can
 *  see them while they are up, even when a card opens over them a moment after
 *  they were said (`placeToast`). */
export function toast(msg: string, ms = 2200): void {
  const host = toastHost();
  if (toastEl && toastEl.parentElement !== host) { toastEl.remove(); toastEl = null; }
  watchDialogs();
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
      // NOT break-all: that breaks ordinary prose at any character, so a
      // sentence could wrap after the first letter of a word (caught on the
      // device). `anywhere` only breaks a word that cannot fit a line on its
      // own — which is what this was for: an unspaced look code or URL.
      overflowWrap: "anywhere",
    } as Partial<CSSStyleDeclaration>);
    host.appendChild(toastEl);
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
 *  running as an installed standalone app.
 *
 *  Takes `btnId`, the id of the share button on this page.
 *  Returns nothing. A no-op in the browser and if the button isn't on the page,
 *  so the button MUST ship `hidden` — every caller relies on this function being
 *  the only thing that reveals it, and a button revealed in a browser tab
 *  promises a share sheet that is not there.
 *
 *  AND THE ROW AROUND IT, when the button carries an explanation rather than
 *  standing alone in a bar. A `.set-row` in the Infrared app's info dialog is a
 *  button plus a `<small>` saying what it does; unhiding only the button would
 *  leave the sentence showing in a browser tab beside no control. Opt-in via
 *  `data-share-row` on the enclosing element, so a bare bar button (the Studio
 *  launcher's) is unaffected. */
export function setupInstalledShare(btnId: string): void {
  const btn = document.getElementById(btnId);
  if (!btn || !isStandaloneApp()) return;
  btn.hidden = false;
  const row = btn.closest<HTMLElement>("[data-share-row]");
  if (row) row.hidden = false;
  btn.addEventListener("click", () => {
    void shareApp();
  });
}

/** Reveal an "install from inside the installed app" block and wire its
 *  copy-link buttons — only when running standalone, where Add to Home Screen
 *  is out of reach (no Safari Share button). The block's `button[data-copy]`
 *  elements copy the absolute URL of the page named in data-copy, so it can be
 *  pasted into real Safari, where Add to Home Screen lives. A no-op in the
 *  browser and if the block isn't on the page. */
export function setupInstallFromApp(blockId: string): void {
  const box = document.getElementById(blockId);
  if (!box || !isStandaloneApp()) return;
  box.hidden = false;
  box.querySelectorAll<HTMLButtonElement>("button[data-copy]").forEach((b) => {
    b.addEventListener("click", async () => {
      const url = new URL(b.dataset.copy || ".", location.href).href;
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied — paste it in Safari, then Share → Add to Home Screen");
      } catch {
        toast(url, 6000); // last resort: show it so it can be read or typed
      }
    });
  });
}
