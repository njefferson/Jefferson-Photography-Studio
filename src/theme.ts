// Dawn / dark theme, shared across all three pages. The chosen theme is
// persisted in localStorage under "studio-theme" and read back BEFORE first
// paint by a tiny inline script in each page's <head> (so there's no flash);
// this module only handles the interactive toggle switches.
const KEY = "studio-theme";

export function currentTheme(): "dark" | "dawn" {
  try {
    return localStorage.getItem(KEY) === "dawn" ? "dawn" : "dark";
  } catch {
    return "dark";
  }
}

function apply(theme: "dark" | "dawn") {
  if (theme === "dawn") document.documentElement.setAttribute("data-theme", "dawn");
  else document.documentElement.removeAttribute("data-theme");
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    /* private mode — the in-page toggle still works for this session */
  }
  // Keep every wired switch in sync (a page can have more than one).
  document.querySelectorAll<HTMLElement>(".theme-toggle").forEach((el) => {
    el.setAttribute("aria-checked", String(theme === "dawn"));
  });
}

/** Turn a button into a "Dawn theme" switch. Reflects the current theme and
 *  flips it on click. Safe to call for a button that may be null. */
export function wireThemeToggle(btn: HTMLElement | null): void {
  if (!btn) return;
  btn.classList.add("theme-toggle");
  if (!btn.querySelector(".tt-track")) {
    const track = document.createElement("span");
    track.className = "tt-track";
    const knob = document.createElement("span");
    knob.className = "tt-knob";
    track.appendChild(knob);
    const label = document.createElement("span");
    label.className = "tt-label";
    label.textContent = "Dawn theme";
    btn.append(track, label);
  }
  btn.setAttribute("role", "switch");
  // A switch takes aria-checked — aria-pressed is not valid on role=switch
  // (axe finding, a11y release 2026-07-17).
  btn.setAttribute("aria-checked", String(currentTheme() === "dawn"));
  btn.addEventListener("click", () => {
    apply(currentTheme() === "dawn" ? "dark" : "dawn");
  });
}
