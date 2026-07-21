// Home-Screen icon picker for the installed Studio launcher.
//
// iOS reads <link rel="apple-touch-icon"> at Add-to-Home-Screen time, and (as
// proven on a real iPad with the icon-probe, 2026-07-13) it honours a link
// REPLACED before you add — so we let the user choose which icon their installed
// launcher wears, then swap the link (and the manifest icons, for Android)
// before they install. The choice is remembered so re-adding keeps the same
// icon, and so the picker shows the current selection on return.
//
// Scope: this swaps the LAUNCHER icon only (index.html). Infrared and Macro are
// their own installed apps with their own icons; this doesn't touch them.

import { isStandaloneApp } from "./share";

export type IconStyle = {
  key: string;
  name: string;
  blurb: string;
  tile: string; // page-relative apple-touch-icon + card preview (180px)
  png192: string; // rel="icon" tab icon + manifest
  png512: string; // manifest
};

// The curated set: the "NJ" aperture brand mark in its two finishes — same
// mark, one on the near-black tile and one on the warm light tile — so they
// read as one family on the Home Screen.
export const ICON_STYLES: IconStyle[] = [
  {
    key: "nj-light",
    name: "NJ Light",
    blurb: "The NJ aperture mark on a warm light tile — the default.",
    tile: "./icons/apple-touch-icon-light.png",
    png192: "./icons/icon-192-light.png",
    png512: "./icons/icon-512-light.png",
  },
  {
    key: "nj-dark",
    name: "NJ Dark",
    blurb: "The same NJ mark on a near-black tile.",
    tile: "./icons/apple-touch-icon.png",
    png192: "./icons/icon-192.png",
    png512: "./icons/icon-512.png",
  },
];

const DEFAULT_KEY = "nj-light";
const STORE_KEY = "studio-icon-style";
const STATIC_MANIFEST = "./manifest.webmanifest";

function styleFor(key: string | null): IconStyle {
  return ICON_STYLES.find((s) => s.key === key) || ICON_STYLES[0];
}

function readStored(): string {
  try {
    return localStorage.getItem(STORE_KEY) || DEFAULT_KEY;
  } catch {
    return DEFAULT_KEY;
  }
}

function writeStored(key: string): void {
  try {
    localStorage.setItem(STORE_KEY, key);
  } catch {
    /* private mode / storage off — the live swap still works this session */
  }
}

/** Absolute URL for a page-relative asset, so it resolves correctly even from a
 *  blob: manifest (whose own base URL is meaningless). */
function abs(rel: string): string {
  return new URL(rel, document.baseURI).href;
}

/** Replace a <link rel="..."> node WHOLESALE with a fresh one — some WebKit
 *  builds only notice a new node, not a mutated href. Returns the fresh node. */
function replaceLink(rel: string, attrs: Record<string, string>): void {
  const head = document.head;
  const old = head.querySelector(`link[rel="${rel}"]`);
  const fresh = document.createElement("link");
  fresh.rel = rel;
  for (const [k, v] of Object.entries(attrs)) fresh.setAttribute(k, v);
  if (old) old.replaceWith(fresh);
  else head.appendChild(fresh);
}

// Track the generated blob manifest so we can revoke the previous one on swap.
let manifestBlobUrl: string | null = null;

/** For Android/Chrome, which reads the manifest (iOS ignores it for the icon):
 *  point <link rel="manifest"> at a generated manifest carrying the chosen
 *  icons. The default style keeps the real static file; other styles get a
 *  blob manifest with absolute icon URLs. */
function swapManifest(style: IconStyle): void {
  if (manifestBlobUrl) {
    URL.revokeObjectURL(manifestBlobUrl);
    manifestBlobUrl = null;
  }
  if (style.key === DEFAULT_KEY) {
    replaceLink("manifest", { href: STATIC_MANIFEST });
    return;
  }
  const manifest = {
    name: "Photography Studio",
    short_name: "Studio",
    description: "On-device photo tools — infrared editing and macro focus stacking.",
    start_url: abs("./"),
    scope: abs("./"),
    display: "standalone",
    orientation: "any",
    background_color: "#0b0b0d",
    theme_color: "#0b0b0d",
    icons: [
      { src: abs(style.png192), sizes: "192x192", type: "image/png", purpose: "any" },
      { src: abs(style.png512), sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
  const blob = new Blob([JSON.stringify(manifest)], { type: "application/manifest+json" });
  manifestBlobUrl = URL.createObjectURL(blob);
  replaceLink("manifest", { href: manifestBlobUrl });
}

/** Apply an icon style to the live document: the apple-touch-icon iOS installs,
 *  the SVG tab/desktop icon, and the manifest icons. */
export function applyIconStyle(key: string, persist = true): void {
  const style = styleFor(key);
  replaceLink("apple-touch-icon", { href: style.tile });
  replaceLink("icon", { type: "image/png", sizes: "192x192", href: style.png192 });
  swapManifest(style);
  if (persist) writeStored(style.key);
}

/** Build the picker cards inside `container` and wire selection. Reflects the
 *  stored choice on load and applies it, so the installed icon matches what the
 *  card shows even before the user touches anything. */
export function setupIconPicker(container: HTMLElement): void {
  const current = readStored();
  applyIconStyle(current, false); // reflect the saved choice on this load

  const cards: HTMLButtonElement[] = ICON_STYLES.map((style) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "icon-card";
    card.dataset.key = style.key;
    card.setAttribute("aria-pressed", String(style.key === current));
    card.innerHTML =
      `<img src="${style.tile}" alt="${style.name} icon" width="72" height="72" />` +
      `<span class="icon-name">${style.name}</span>` +
      `<span class="icon-blurb">${style.blurb}</span>` +
      `<span class="icon-badge"></span>`;
    return card;
  });

  const live = document.createElement("p");
  live.className = "icon-live";

  function refresh(activeKey: string): void {
    for (const card of cards) {
      const on = card.dataset.key === activeKey;
      card.classList.toggle("active", on);
      card.setAttribute("aria-pressed", String(on));
      const badge = card.querySelector(".icon-badge");
      if (badge) badge.textContent = on ? "Selected" : "Tap to choose";
    }
    const name = styleFor(activeKey).name;
    // iOS bakes a tile's icon at Add-to-Home-Screen and never repaints it, so
    // "change it later" honestly means remove-and-re-add. Say so, per surface:
    // the installed app has no Safari Share button, so its path starts with
    // removing the tile; the browser can just re-add.
    if (isStandaloneApp()) {
      live.innerHTML =
        `Your pick — <b>${name}</b> — is saved, but this installed app keeps the ` +
        `icon it was added with; iPad tiles can't be repainted in place. To switch: ` +
        `touch and hold the Studio icon on your Home Screen → <b>Remove</b>, then open ` +
        `the Studio in <b>Safari</b> and <b>Add&nbsp;to&nbsp;Home&nbsp;Screen</b> ` +
        `again — it will come back wearing ${name}.`;
    } else {
      live.innerHTML =
        `Your icon: <b>${name}</b>. Add this launcher to your Home Screen ` +
        `(Share → Add&nbsp;to&nbsp;Home&nbsp;Screen) to keep it. Changing an ` +
        `already-installed icon? Remove the old tile first, then add it again — ` +
        `an installed tile keeps its icon until it's re-added.`;
    }
  }

  for (const card of cards) {
    card.addEventListener("click", () => {
      const key = card.dataset.key || DEFAULT_KEY;
      applyIconStyle(key);
      refresh(key);
    });
  }

  const grid = document.createElement("div");
  grid.className = "icon-grid";
  cards.forEach((c) => grid.appendChild(c));
  container.appendChild(grid);
  container.appendChild(live);
  refresh(current);
}
