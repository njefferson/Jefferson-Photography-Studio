// THE BUILD STAMP, WRITTEN AT BOOT (Doctrine §7b) — the version visible on
// every page, so a reader reporting a problem can say which build they are on
// without being asked to go looking for it.
import "./verstamp.css";

declare const __APP_VERSION__: string;

/** WRITE THE BUILD STAMP, AT BOOT (Doctrine §7b).
 *
 *  The rule is that the running version is on screen in the app's normal
 *  working view — not behind a tap, not only in a panel — because the reader
 *  reports from a device with a screenshot they did not compose, and without a
 *  version on it a session cannot tell a live defect from one already fixed,
 *  from a stale cached shell, and will guess.
 *
 *  AT BOOT is the other half of it, and the half that has been got wrong before
 *  in this family: a sibling set its stamp inside the About handler, so it was
 *  blank until somebody opened About — useless in exactly the unplanned
 *  screenshot the rule exists for.
 *
 *  One function rather than two copies: the editor had this inline and Macro
 *  Studio had nothing, which is how Macro Studio shipped without a stamp for
 *  its whole life. Importing this is now the whole of the job, and the look
 *  comes with it.
 *
 *  Takes nothing and returns nothing. The tag's visible text becomes
 *  `v<version>`. A tag that carries `data-ver-about` (Macro Studio's) is also
 *  given an accessible name that OPENS WITH that visible text and then says what
 *  the button does, `v<version> — <about>`: a fixed name written in the markup
 *  cannot hold a version the build stamps in, and a name that leaves the visible
 *  text out is a label a voice-control reader cannot say. What it must satisfy:
 *  the accessible name contains the visible text. */
export function writeVersionStamp(): void {
  const el = document.getElementById("verTag");
  if (!el) return;
  const text = `v${__APP_VERSION__}`;
  el.textContent = text;
  const about = el.getAttribute("data-ver-about");
  if (about) el.setAttribute("aria-label", `${text} — ${about}`);
}
