# Jefferson Photography Studio

Free, on-device photo tools that run entirely in the browser — no upload, no
account, no install required, and everything keeps working offline.

**Live:** <https://jefferson-photo-studio.pages.dev>
(staging: <https://staging.jefferson-photo-studio.pages.dev>)

## The tools

- **`/`** — the Studio launcher: a two-door chooser, installable as its own
  Home-Screen app (with a pickable icon).
- **`/ir` — Infrared Editor.** The reason this project exists: color-IR
  channel-swap editing with white balance far below the range ordinary
  editors allow (sub-2000K — the move Lightroom floors out on). Decodes
  Nikon NEF and DNG raw files in pure JS/TypeScript (bit-exact vs LibRaw),
  edits on the GPU (WebGL2), exports JPEG / 16-bit TIFF plus `.cube` LUTs
  and `.dcp` camera profiles. Ships with a RAW practice library and built-in
  lessons.
- **`/macro` — Macro Studio.** Merges an in-camera focus-shift burst into one
  frame that's sharp front to back, keeping the background soft.

## Values

Free · on-device · offline-first · no account · no upload · no tracking
([privacy](https://jefferson-photo-studio.pages.dev/privacy)).

**Accessibility is a top priority.** Color is never the only carrier of
meaning, contrast is measured against WCAG in both themes, progress
announces to screen readers, and page zoom is never locked. See the
standing rule in `CLAUDE.md` — it's a design-time requirement, not an
afterthought.

## Tech

No framework. Vite + TypeScript, WebGL2 pipeline, pure-JS raw decoders
(lossless-JPEG/LJ92, Nikon compressed NEF), an offline-first service worker
with a build-time precache manifest, and route-split bundles (the IR editor
never loads the macro engine, and vice-versa). Deployed to Cloudflare Pages
by `.github/workflows/deploy.yml` — `main` is production, `staging` is the
preview site.

```sh
npm ci        # install (vite + typescript only)
npm run dev   # local dev server
npm run build # type-check + production build into dist/
```

## How this repo is driven

Development happens in Claude sessions on an iPad. `CLAUDE.md` holds the
standing rules (release gate, verification requirements, accessibility
mandate); `NOTES.md` is the source of truth — the roadmap queue, settled
decisions, and measured gotchas. Commit subjects are the user-facing patch
notes (rendered in the app's ⓘ dialog and on
[/notes](https://jefferson-photo-studio.pages.dev/notes)); versioning is
the `VERSION` file plus automatic point releases from commit counts.

## License

All rights reserved — see `LICENSE`. The app is free to use at the
published URL; the source code and the example photographs (all
© Noah Jefferson) are not licensed for reuse.
