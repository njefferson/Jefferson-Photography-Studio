# Sticker categories — the factory's proposal for the app side

This is the handoff for the app-side session. The factory now routes all ~245
planned assets into real folders with **nothing** left in ❓ New. To make every
folder appear in the picker, add the five **Scene & nature** categories below to
`src/main.ts`. Until they're added, promoted scene assets still show — they'd
just land in ❓ New (the app's existing catch-all), so there's no breakage if you
adopt this partially or not at all.

## What changes in `src/main.ts`

### 1. `STICKER_GROUPS` — add a third group

```ts
const STICKER_GROUPS: { id: string; emoji: string; label: string }[] = [
  { id: "creatures", emoji: "👣", label: "Creatures & craft" },
  { id: "evidence", emoji: "🔍", label: "Evidence" },
  { id: "scene", emoji: "🏕️", label: "Scene & nature" }, // NEW
];
```

### 2. `STICKER_CATEGORIES` — add five categories in the `scene` group

Keep the existing nine entries as-is; append:

```ts
  // Scene & nature — everyday overlays for regular photos (the Creative direction).
  { id: "wildlife",   group: "scene", emoji: "🦉", label: "Wildlife" },
  { id: "foreground", group: "scene", emoji: "🌿", label: "Foreground" },
  { id: "sky",        group: "scene", emoji: "🎈", label: "Sky" },
  { id: "atmosphere", group: "scene", emoji: "🌫️", label: "Atmosphere & light" },
  { id: "props",      group: "scene", emoji: "🧺", label: "Everyday" },
```

That's the whole app-side change. `stickerCatOf` already derives a nested key's
folder, `renderStickerPicker` already filters empty groups/categories and hides
a group chip when only one group has assets — so the new group simply appears
once its first asset is promoted, and nothing shifts before then. No other code
moves.

## What lands in each new folder (from the factory)

| folder | app label | fed by | examples |
|---|---|---|---|
| `wildlife` | Wildlife | wildlife | Crow, Owl, Hawk, Fox, Bear, Wolf, Rabbit, Butterfly, Dragonfly, Snake, Frog |
| `foreground` | Foreground | occluders | Fern, Pine/Oak branch, Tall grass, Rock, Spider web, Window frame, Log, Cattails |
| `sky` | Sky | normal (aloft) | Moon, Meteor, Lightning, Cloud wisp, Hot-air balloon, Airplane, Helicopter, Kite |
| `atmosphere` | Atmosphere & light | atmosphere + camera + campfire | Ground fog, Smoke, Embers, God rays, Lens flare, Light leak, Dust orb, Heat shimmer |
| `props` | Everyday | normal (objects) | Picnic basket, Tent, Camping chair, Lantern, Flowers, Rowboat, Kayak, Sailboat |

The existing groups are unchanged and still fed as before: **Creatures & craft**
(`cryptids` incl. Bigfoot + Wendigo, `ufo`, `aliens`, `spirits`, `beasts` incl.
giant animals + cosmic/containment entities) and **Evidence** (`tracks`, `gear`
incl. cosmic monuments, `lights` incl. cosmic glowing anomalies).

## Optional: honesty-note seeds

Labels come from the filename automatically (`skunk-ape.png` → "Skunk Ape"), and
`promote` prints ready-to-paste `STICKER_META` entries for polished labels +
notes when a batch ships. The scene folders are all real things, so they need no
`· folklore` / `· fiction` note. The only notes in play stay the ones already
seeded (cryptids/wendigo → folklore; aliens/reptilian|insectoid|nordic →
fiction), which the factory's filenames match.

## If you'd rather not add all five

Drop any folder you don't want from the two arrays. Its assets fall back to ❓
New automatically (no code change needed on the factory side) — e.g. keep only
`wildlife` + `sky` and let foreground/atmosphere/props sit in New until later.
Tell me which you keep and I'll retune the manifests so nothing lands in New.
