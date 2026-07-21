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

---

# Asset design guide

How the app blends stickers, and what that means for the art the factory should
produce. Written after reviewing the first two examples (skunkape, yeti).

## How a sticker blends (design for this)

A placed sticker composites INTO the linear source **before** the IR pipeline,
then inherits the whole thing — the **R↔B channel swap, white balance, grade,
and grain** all run over it. So:

- **Generate natural, daylight-looking subjects with a full tonal range. Do NOT
  pre-style for infrared.** The app turns them IR automatically. A neutral or
  desaturated subject is ideal — the pipeline colourises it and it matches better.
- **No baked-in effects:** no vignette, border/frame, drop shadow, glow, or colour
  grade. The app adds grain and tone; a baked effect double-applies and fights it.
- **Auto "Blend to match"** samples the scene under the sticker and pulls its
  brightness/warmth/contrast toward it (with a user strength dial). Works best on
  an evenly-lit, neutral asset; a pre-tinted or blown-out asset resists the match.
- **Occlusion ("peek behind")** uses the alpha + scene luminance to let bright or
  dark parts of the photo show through — a clean matte is what makes tucking
  behind foliage read.

## What the user can do after dropping one (so variants aren't needed)

Move · pinch-resize · spin · **corner-perspective skew** (drag 4 corners onto a
plane) · **paint to hide & restore** (carve the sticker to tuck it behind real
objects, paint back) · per-sticker brightness/contrast/warmth/saturation · Match
strength · occlusion peek-behind. Because the user carves and skews, the factory
does NOT need pose/angle variants of the same subject.

## The matte is the #1 quality lever

The first two examples both had **coloured edge halos** — a lavender fringe on
skunkape (edge pixels ~[182,175,191]), a green fringe on yeti (~[132,172,129]),
and yeti was ~38% partial-alpha. In the app a coloured halo composites as a glow
ring — the single biggest "pasted-on" tell. Requirements:

- **Edge colour decontamination (defringe):** unmix the backdrop colour out of
  semi-transparent edge pixels so they carry the SUBJECT's colour, not the
  background's. No coloured halo.
- **Background at true alpha 0** — no scattered low-alpha speckle/dither in the
  "empty" area.
- Soft natural edges (fur wisps) are fine; the matte just must be clean, not a
  fuzzy coloured band.

## Framing & format

- Single subject, **centered, ~8–12% transparent margin on all sides** (the app
  scales by width, so consistent padding makes default sizes predictable — the
  examples ranged from 6% to 27% margins, which makes drop sizes inconsistent).
- Roughly square canvas; **1024² is great**. Transparent PNG.
- **Front or clean profile view only — skip 3/4 views.** The paint-erase and
  corner tools work in 2D: the user can carve a silhouette and skew perspective,
  but can't un-bake a 3/4 rotation, which fights the tools. Strong, readable
  silhouette.
- `kebab-case.png` filename = the in-app label; folder = category.

## Body parts (peeking overlays) — wanted

Isolated parts on transparent bg, for tucking around trees/rocks/edges (the user
erases the overlap): **hand/forearm gripping** (fingers curling as if around a
trunk — the key one), **arm + shoulder**, **half torso + shoulder**, **a leg /
foot**, **eyes / partial face**. Design each as if **emerging from one side**,
leaning toward centre, and provide **both left- and right-side variants** (there
is no in-app flip). Give them per creature where the fur/skin differs — e.g.
`cryptids/hand`, `cryptids/arm`, `cryptids/eyes` (hairy), plus the reserved
`aliens/hand`, `aliens/eyes` (grey). These read extremely well with occlusion +
paint-to-hide.
