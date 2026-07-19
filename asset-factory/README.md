# Asset factory

A manifest-driven pipeline that generates, quality-checks, deduplicates,
catalogs and (on request) promotes transparent-PNG compositing assets for the
Stickers feature. **Tool code only — it never ships in the app** and never runs
in the browser (the product stays free / offline / no-account).

## The one idea

**The durable library is metadata, not pixels.** `manifests/` + `templates/` +
`database/` are committed; the actual images (`assets/`, `generated/`, …) are
gitignored and fully regenerable from that metadata. Change a template and the
whole library can be regenerated — no prompt is ever hand-written.

```
manifest (axes) → expander → prompt builder → provider → PNG
   → verify transparency → QC → reject failures → dedupe → catalog → assets/<category>/
```

## Layout

- `manifests/<category>.json` — axis specs (subjects × poses × views × distances
  × variants). One per factory category (14). The expander turns each into
  concrete entries with deterministic ids and seeds.
- `templates/*.json` — `global.json` holds the shared constraint + negative
  suite; each category template composes `{slot}` and `{global.block}`
  references. Editing one is what regenerates a slice.
- `database/catalog/<id>.json` — one record per asset (the owner's metadata
  shape + pipeline state + QC + hashes). `database/curation.json` — owner-taste
  overrides (approve/reject/favorite/names), kept separate so a full
  regeneration never destroys curation.
- `assets|generated|rejected|duplicates|logs/` — gitignored working dirs.
- `src/` — `expander`, `prompt`, `qc`, `dedupe`, `pipeline`, `promote`,
  `catalog`, `providers/{mock,ideogram,matting}`.

## Providers

`mock` (default) synthesizes deterministic feathered blobs locally — zero cost,
no key — and **plants failure modes** (opaque bg, two subjects, cropped, low-res,
near-duplicate) so QC and dedupe are exercised end-to-end without an API key.

`ideogram` calls Ideogram v3's native transparent-background endpoint. It needs
`IDEOGRAM_API_KEY`. In this project that key lives as a **GitHub repo secret**,
so the real runs happen from the `asset-factory` GitHub Action (Actions tab →
Run workflow — works from the iPad), not from a laptop. The Action uploads the
images + catalog as a downloadable artifact to review; it commits nothing.

Adding a provider is one file in `src/providers/` + a registry line. A provider
without native alpha would route through `providers/matting.mjs` (a named,
not-yet-implemented slot).

## CLI

```
node cli.mjs plan      [--category X] [--provider P] [--stale]
node cli.mjs generate  [--category X] [--limit N] [--provider mock|ideogram]
                       [--concurrency N] [--dry-run] [--yes] [--max N] [--retry-rejected]
node cli.mjs regen     --stale [--category X] [--limit N] [--yes]
node cli.mjs qc        [--category X] --rerun
node cli.mjs dedupe    [--category X] [--hamming N]
node cli.mjs curate    (--approve|--reject|--favorite|--unfavorite) --ids a,b,c
node cli.mjs promote   [--category X] [--favorites-only] [--ids a,b] [--max-edge 1280] [--out DIR] [--dry-run]
node cli.mjs stats     [--category X]
```

Real (paid) providers refuse without `--yes`, cap at 200 images/run (raise with
`--max`), and print a cost estimate first. Mock is always the default so nothing
spends by accident. Set `AF_DATA_DIR=/some/dir` to run against a scratch area
(tests and CI do this; the committed `database/` is untouched).

## Promote → app

`promote` selects approved (and curated) assets, optimizes them (long edge
≤1280, alpha preserved), copies them to `public/stickers/<app-category>/` using
each manifest's `app_category` mapping, and prints a ready-to-paste
`STICKER_META` snippet for `src/main.ts` (optional — the app humanizes unknown
filenames and drops them in the "New" bucket). The app's build-time manifest and
dynamic picker take over from there with no app code change.

**Shipping promoted PNGs is a product change** → it goes through the normal
staging gate. Before a large promoted set lands, `vite.config.ts`'s precache
plugin must stop precaching individual sticker PNGs (they'd blow up the
all-or-nothing service-worker install); the SW's existing cache-first branch
then caches each on first use. That's a separate, bounded product commit.

## Tests

`npm test` (`node --test`). Fail-first: `PLANT=nofail npm test` disables the
mock's planted failures — the QC and dedupe tests then FAIL, proving they
actually observe the planted images. Coverage: expander determinism, prompt
assembly + hash stability, each planted QC reason, dedupe collision/threshold,
and a full mock generate→QC→dedupe→catalog run with resume and staleness.

## Notes on cost

Ideogram list price is roughly $0.08/image at QUALITY (treat as an estimate —
confirm on the first real run). The full ~245-entry library is therefore ~$20;
a loaded budget of a few dollars is a **pilot** (`--limit` a dozen or two).
Lower `rendering_speed` in a template's `settings` (TURBO/BALANCED) trades edge
quality for cost.
