// Palette family picker, shared across all three pages. Sits on an axis
// INDEPENDENT of the Dawn/Dark toggle in theme.ts: every family defines both a
// day and a night variant, so the two choices never interact. Persisted under
// "studio-palette" and read back BEFORE first paint by the inline script in
// each page's <head> (so there's no flash); this module only handles the
// interactive picker.
//
// The values themselves live in public/palette.css — generated from the hub's
// palettes/families.json and gated by palette-check.mjs. Nothing here knows a
// single colour, which is the point: adding a family is a data change there
// plus one row in FAMILIES below.
const KEY = "studio-palette";

/** Instrument is the default and is represented by the ABSENCE of the
 *  attribute, so the CSS default cascade is the thing that ships if this
 *  module never runs (private mode, JS error, old cached bundle). */
export type Family = "instrument" | "paper" | "mono" | "soft";

export const FAMILIES: { id: Family; name: string; note: string }[] = [
  { id: "instrument", name: "Instrument", note: "Neutral grey at night — the truest surround for judging colour." },
  { id: "paper", name: "Paper", note: "Warm paper by day, cool at night. The most character." },
  { id: "mono", name: "Mono", note: "Neutral in both modes. Nothing but greys." },
  { id: "soft", name: "Soft", note: "Gentler contrast and less glare for long sessions." },
];

const VALID = new Set<string>(FAMILIES.map((f) => f.id));

export function currentPalette(): Family {
  try {
    const v = localStorage.getItem(KEY);
    // Validate rather than trust: a junk value must never reach setAttribute.
    return v && VALID.has(v) ? (v as Family) : "instrument";
  } catch {
    return "instrument";
  }
}

function apply(fam: Family) {
  const root = document.documentElement;
  if (fam === "instrument") root.removeAttribute("data-palette");
  else root.setAttribute("data-palette", fam);
  try {
    if (fam === "instrument") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, fam);
  } catch {
    /* private mode — the in-page choice still works for this session */
  }
  // The status-bar colour is part of the palette, so it moves with it. Same
  // stamp the pre-paint script does, repeated here because the palette can
  // change long after first paint.
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  const bg = getComputedStyle(root).getPropertyValue("--bg").trim();
  if (meta && bg) meta.content = bg;
  // Keep every wired picker in sync (a page can have more than one).
  document.querySelectorAll<HTMLElement>(".pal-opt").forEach((el) => {
    el.setAttribute("aria-checked", String(el.dataset.pal === fam));
  });
}

/** Build a radio-group palette picker inside `host`. Each option is a real
 *  button carrying its NAME as text — a swatch alone would make colour the
 *  sole carrier of meaning, which is exactly what the doctrine forbids, and
 *  it would be unreadable to the people this whole palette exercise is for. */
export function wirePalettePicker(host: HTMLElement | null): void {
  if (!host || host.dataset.wired === "1") return;
  host.dataset.wired = "1";
  host.setAttribute("role", "radiogroup");
  host.setAttribute("aria-label", "Colour palette");

  const active = currentPalette();
  for (const f of FAMILIES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "pal-opt";
    btn.dataset.pal = f.id;
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", String(f.id === active));

    const name = document.createElement("span");
    name.className = "pal-name";
    name.textContent = f.name;
    const note = document.createElement("small");
    note.className = "pal-note";
    note.textContent = f.note;
    btn.append(name, note);

    btn.addEventListener("click", () => apply(f.id));
    host.appendChild(btn);
  }
}
