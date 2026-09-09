// Day/night mode, shared across every page. Three states, not two:
//
//   system  — follow the device's own appearance setting, and keep following it
//             when it changes (iOS flips at sunset if it is set to)
//   dawn    — light, always
//   dark    — dark, always
//
// SYSTEM IS THE DEFAULT. It used to be dark, unconditionally: a reader who had
// never touched the switch got dark whatever the iPad was set to, and there was
// no way to ask for anything else — the control was a two-state switch labelled
// only "Dawn theme", so one of its two states had no name on it at all.
//
// The choice is persisted under "studio-theme" and read back BEFORE first paint
// by a tiny inline script in each page's <head> (so there is no flash of the
// wrong mode); that script has to resolve "system" the same way this module
// does, or the two disagree for one frame.
const KEY = "studio-theme";

export type ThemeChoice = "system" | "dawn" | "dark";
type Mode = "dawn" | "dark";

const OPTIONS: { id: ThemeChoice; name: string; note: string }[] = [
  { id: "system", name: "Match my device", note: "Follows the iPad's own Light/Dark setting, and changes with it." },
  { id: "dawn", name: "Dawn", note: "Light, always — whatever the device is set to." },
  { id: "dark", name: "Dark", note: "Dark, always — whatever the device is set to." },
];

const lightQuery = () =>
  typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: light)") : null;

/** What the reader asked for. Anything unrecognised — including nothing at all,
 *  which is every first visit — means "follow the device". */
export function currentChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY);
    return v === "dawn" || v === "dark" || v === "system" ? v : "system";
  } catch {
    return "system";
  }
}

/** The mode a choice actually renders as, right now. */
export function resolveMode(choice: ThemeChoice = currentChoice()): Mode {
  if (choice === "dawn" || choice === "dark") return choice;
  return lightQuery()?.matches ? "dawn" : "dark";
}

/** Kept for callers that only want to know which way the page is painted. */
export function currentTheme(): Mode {
  return resolveMode();
}

function paint(mode: Mode) {
  const root = document.documentElement;
  if (mode === "dawn") root.setAttribute("data-theme", "dawn");
  else root.removeAttribute("data-theme");
  // The status bar is part of the mode, so it moves with it — the same stamp
  // the pre-paint script does, repeated because the mode can change after load
  // (a picker press, or the device flipping under us).
  const meta = document.querySelector<HTMLMetaElement>('meta[name=theme-color]');
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (meta && bg) meta.setAttribute("content", bg);
}

function apply(choice: ThemeChoice) {
  paint(resolveMode(choice));
  try {
    localStorage.setItem(KEY, choice);
  } catch {
    /* private mode — the in-page picker still works for this session */
  }
  document.querySelectorAll<HTMLElement>(".theme-opt").forEach((el) => {
    el.setAttribute("aria-checked", String(el.dataset.theme === choice));
  });
}

// Follow the device while — and only while — the reader has asked us to.
{
  const q = lightQuery();
  const onChange = () => { if (currentChoice() === "system") paint(resolveMode("system")); };
  if (q?.addEventListener) q.addEventListener("change", onChange);
  else q?.addListener?.(onChange); // older WebKit
}

/** Build the mode picker inside `host`: a radio group of three real buttons,
 *  each carrying its NAME and what it means. The old control was a switch, and
 *  a switch can only ever say one of its two states out loud. */
export function wireThemePicker(host: HTMLElement | null): void {
  if (!host || host.dataset.wired === "1") return;
  host.dataset.wired = "1";
  host.setAttribute("role", "radiogroup");
  host.setAttribute("aria-label", "Day or night");
  const active = currentChoice();
  for (const o of OPTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pal-opt theme-opt";
    btn.dataset.theme = o.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(o.id === active));
    const txt = document.createElement("span");
    txt.className = "pal-txt";
    const name = document.createElement("span");
    name.className = "pal-name";
    name.textContent = o.name;
    const note = document.createElement("small");
    note.className = "pal-note";
    note.textContent = o.note;
    txt.append(name, note);
    btn.append(txt);
    btn.addEventListener("click", () => apply(o.id));
    host.appendChild(btn);
  }
}
