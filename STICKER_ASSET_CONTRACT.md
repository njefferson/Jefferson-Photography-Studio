# Sticker asset contract (app ⇄ asset-factory)

The app-side half of the handoff in `asset-factory/CATEGORIES.md`. This is the
stable contract the factory targets when it promotes overlay PNGs into the app.
The app reads whatever is present at build time — drop files in the right folder
and they appear, categorized and precached, on the next deploy with no app code.

## Where files go

Promote PNGs to `public/stickers/<category>/<name>.png`. Recognized categories,
grouped by the picker's three kinds:

| kind | category folders |
|---|---|
| 👣 Creatures & craft | `cryptids`, `ufo`, `aliens`, `spirits`, `beasts` |
| 🔍 Evidence | `tracks`, `gear`, `lights` |
| 🏕️ Scene & nature | `wildlife`, `foreground`, `sky`, `atmosphere`, `props` |

A file in any **unrecognized** folder still shows — it falls back to the app's
`other` → "❓ New" bucket. No breakage; it just isn't grouped until a category is
added in `src/main.ts` (`STICKER_GROUPS` / `STICKER_CATEGORIES`).

## Rules

- **Filename = label**, kebab-case: `skunk-ape.png` → "Skunk Ape". The app
  humanizes it; no pre-formatting needed.
- **Honesty notes** — these keys already auto-label in the app; match them and
  the note appears as text on the chip:
  - `cryptids/wendigo` → "· folklore"
  - `aliens/reptilian`, `aliens/insectoid`, `aliens/nordic` → "· fiction"
  Any *other* fiction/folklore item needs a one-line `STICKER_META` entry
  app-side — the factory's `promote` prints ready-to-paste entries; hand those
  over and they get dropped in. Scene & nature is all real things → no notes.
- **Do not write `manifest.json`.** The Vite build regenerates
  `dist/stickers/manifest.json` from `public/stickers/**/*.png` (recursive) and
  precaches it. The factory only lands files.
- **Do not touch the legacy flat 8** — `bigfoot`, `bigfoot-walk`, `bigfoot-peek`,
  `bigfoot-howl`, `saucer`, `beam`, `saturn`, `alien` live at the stickers root
  and are keyed flat. A `cryptids/bigfoot.png` would be a NEW key, not a
  replacement (and would break old saved sessions' references).

## Asset specs

Transparent PNG, roughly square, a few hundred px per side, soft/feathered edges.
That's what makes the app's auto-match (Blend to match), occlusion (peek-behind),
per-sticker adjust, paint-to-hide, and corner-perspective read well — the sticker
inherits the full IR pipeline (channel swap, WB, grade, grain) after compositing.

## Promotion

Promotion into `public/stickers/` stays a deliberate step behind the staging
gate (per `.github/workflows/asset-factory.yml`). Files landed there show up
categorized + precached on the next deploy — zero further app code.
