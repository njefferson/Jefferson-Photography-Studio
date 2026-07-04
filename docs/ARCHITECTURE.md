# Infrared Photography Studio — Architecture & Hard-Won Knowledge

This document exists so that ANY future maintainer — a person or an AI model —
can continue this project without rediscovering what was learned the hard way.
Read this before touching the pipeline.

## What this app is

An offline-first PWA (Vite + TypeScript, no framework) that edits infrared
photos from an IR-converted Nikon Z50: true raw decode in pure JS, unbounded
white balance, red↔blue channel swap, camera-matrix color, one-tap looks,
denoise, halation glow, per-color grading, full-res export, and Lightroom
profile generation. Deployed to Cloudflare Pages by GitHub Actions on every
push (`.github/workflows/deploy.yml`; needs CLOUDFLARE_API_TOKEN /
CLOUDFLARE_ACCOUNT_ID repo secrets). Live at
https://infrared-photography-studio.pages.dev

## The one sentence that explains everything

Lightroom floors white balance at 2000K, but raw IR needs channel gains far
beyond that (measured ~R0.42/G7.8/B2.1 on real files) — so this app decodes
raw itself and applies arbitrary gains, which is the entire reason it exists.

## Pipeline order (do not reorder casually)

```
decode -> LINEAR camera-native RGB
  -> DENOISE          (bilateral, BEFORE any gains amplify noise)
  -> EXPOSURE, WB     (linear multipliers; WB luminance-normalized)
  -> CAMERA MATRIX    (cam->sRGB, row-normalized; SEPARATES IR hues — without
                       it all IR chroma sits on one magenta axis and swap/sat
                       cannot produce false color. Biggest single discovery.)
  -> CHANNEL SWAP     (r<->b)
  -> GLOBAL HUE (YIQ) (global rotation CANNOT move sky and foliage apart)
  -> SATURATION       (boost fades below ~0.2 luma to avoid chroma noise)
  -> PER-COLOR BANDS  (complementary halves of the hue circle: sky = cool,
                       centred 210° plateau 55 edge 105; foliage = 1 - sky.
                       Full coverage, no dead zone. Targets DISPLAYED color,
                       so a channel swap makes subjects trade bands — the UI
                       says so. hue/sat/lum each)
  -> TINT             (sepia over mono)
  -> GLOW             (adds blurred-highlight map in linear; HIE halation)
  -> CONTRAST         ((c-0.5)*k+0.5)
  -> GAMMA 2.2
```

Implemented twice, kept numerically identical ON PURPOSE:
- GPU: fragment shader in `src/gl.ts` (live preview)
- CPU: `compileEdit()` in `src/pipeline.ts` (export, LUT baking)
If you change one, change the other. `EditParams` is defined ONCE in
pipeline.ts (gl.ts re-exports).

## Decoders (`src/raw/`) — all pure JS, no WASM, all verified vs LibRaw

| Format | File | Notes |
|---|---|---|
| Nikon NEF (Compression 34713) | `nef.ts` | dcraw's algorithm: fixed Huffman trees, linearization curve in MakerNote tag 0x96, 2-back predictor. Verified BIT-EXACT. Z50 levels: black 1008, white 15520 (14-bit). Does NOT support Z8/Z9 High-Efficiency NEF. |
| Mosaiced DNG, lossless JPEG (Comp 7) | `lj92.ts` + `dngRaw.ts` | LJ92: DNG packs Bayer columns as interleaved JPEG components (tile CFA col = x*Nf + c). Verified BIT-EXACT over 20.8M px. |
| Mosaiced DNG, uncompressed (Comp 1) | `dngRaw.ts` | Used by the bundled example files. |
| Lossy linear DNG (Comp 34892) | `decode.ts` | Baseline-JPEG tile decoded natively; gamma-2.2-encoded (verified 0.015 err vs linear). NO camera matrix on this path — those files already carry baked color. |
| JPEG/PNG | `decode.ts` | Native decode; browser applies EXIF orientation itself. |

X-Trans (Fuji) is NOT supported anywhere. Preview = half-res 2x2-binned
demosaic (`demosaic.ts`); export = full-res bilinear per pixel.

## Verification methodology (the project's backbone)

Nothing ships on "looks right". Every decoder was verified against
rawpy/LibRaw ground truth (bit-exact or exact means) via node scripts:
esbuild-bundle the real TS module, run it on the real files, compare. The
user's actual photos are the test corpus. Keep doing this: when you touch a
decoder, re-verify against LibRaw before pushing.

## Color science constants

- Nikon Z50 ColorMatrix1 (XYZ->cam, D65): in `src/color.ts`. DNGs carry their
  own matrix (tag 50721, SRATIONAL — the shared TIFF reader in `raw/tiff.ts`
  handles types 3/4/5/10/11).
- camToSrgbLinear = XYZ2sRGB * inverse(CM1), then ROW-NORMALIZED so neutrals
  survive (keeps tap-WB meaningful).
- Auto WB: gray-world, luminance-normalized (never darkens).
- Auto exposure: 97th-percentile of post-matrix luma -> 0.85, clamp to slider.
- Auto denoise: median relative neighbor luma diff in darkest 40% ->
  strength = clamp(0.2 + (med-0.013)*25, 0, 0.8).

## Looks (`LOOKS` in main.ts) — tuned on the owner's real files

Raw-vs-JPEG strengths differ deliberately (camera JPEGs already carry color
rendering; raw-strength saturation goes garish on them). `wbBias` looks
(Aero Red, Goldie) multiply the CURRENT WB and must not compound — `lookBias`
tracks and removes the previous bias. Aerochrome intentionally uses GENTLE
contrast (1.15): the owner prefers shadow detail preserved; scenes with big
empty dark skies can take Contrast up manually. We measured (dark-fraction,
band populations, dark-texture on 96px maps) and could NOT reliably separate
"crushable" from "detail" scenes automatically — do not re-add auto contrast
without better evidence.

## Spatial features

- Denoise (`raw/denoise.ts`): 5x5 brightness-adaptive bilateral on linear data,
  row-cached for exports. Same constants in shader.
- Glow (`glow.ts`): 192px-wide highlight map, p99-normalized, soft threshold,
  wide gaussian; uploaded as R8 texture (UNPACK_ALIGNMENT 1); CPU export
  samples it bilinearly. GLOW_GAIN=0.7 shared.
- Rotation: display-side (vertex-shader UV rotation + canvas dim swap), reads
  TIFF Orientation tag 274 (6->1, 3->2, 8->3 CW steps). Export replicates via
  toSrc(); when rotated 90/270 the export outer loop follows output COLUMNS so
  the denoiser row cache stays effective.
- Zoom: CSS transform (translate+scale) pinch/pan; taps suppressed after
  movement; tap mapping uses client coords + getBoundingClientRect so it works
  under transform and rotation.

## Profiles

- `.cube` (`lut.ts`): bakes the color pipeline (verified vs compileEdit to
  rounding). Spatial features (denoise/glow) CANNOT be in a LUT.
- `.dcp` (`dcp.ts`): TIFF-based, embeds ColorMatrix1 + ProfileHueSatMap.
  Structure validated with tifffile; COLOR NEVER VALIDATED IN LIGHTROOM (beta).
- Lightroom .xmp presets in `presets/` (Temperature floor 2000 + Calibration
  faux swap; a true swap is impossible in Lightroom without a profile).

## Example photos (`public/examples/`)

Half-res REAL raw DNGs generated from the owner's NEFs: Bayer planes binned
2x2, black-subtracted (BlackLevel 0, WhiteLevel 14512), uncompressed CFA,
Z50 matrix embedded, ~10.4MB each (Cloudflare Pages limit is 25MB/file).
canopy + lodge display with rotate=3 (set in EXAMPLES, files carry no
orientation tag). Regeneration scripts live in the session notes/history —
the recipe: readNefCfa -> bin planes -> writeDng(Comp 1) -> verify through
`decodeMosaicedDng` -> render thumbs at the CURRENT Aerochrome values.

## iOS/Safari landmines (each one bit us)

1. WebGL drawing buffers over ~16.7MP silently clamp -> black canvas. Preview
   proxies anything over 2800px (`toPreview` in main.ts).
2. `hidden` attribute loses to ID display rules -> global
   `[hidden]{display:none!important}` in style.css. Do not remove.
3. `max-height:100%` in an auto-sized grid track does not constrain portrait
   images -> the canvas is absolutely centered instead (#view CSS).
4. `navigator.share` requires a FRESH user tap -> export renders first, then
   shows a "Save image" button (share sheet -> Photos; the page never
   navigates).
5. Photo Library imports transcode RAW->JPEG silently -> magic-byte sniffing
   warns; zips accepted (`zip.ts`, DecompressionStream) as the reliable route.
6. Service worker: network-first for navigations, cache-first for hashed
   assets. Old "cache-first everything" strategy made deploys invisible.
7. TS strict: `Uint8Array<ArrayBufferLike>` isn't a BlobPart — copy into a
   fresh array before `new Blob/ImageData`.

## Camera knowledge (owner's Z50, IR-converted)

Filters: red = most color (Aerochrome material), 530nm moderate, 720nm
near-monochrome ("white forest"; ratio ~2.4:1.4:1). PRE white balance measured
off foliage gets partway in-camera but cannot fully cool a red-filter shot,
and NO Nikon body can channel-swap in camera. Field guide:
`docs/Z50-IR-field-guide.md`.

## Versioning

- Pre-1.0: every update is `v0.N`, N = commit count at that commit
  (`git rev-list --count`), computed at build time in `vite.config.ts`.
  No manual bookkeeping; the number is derived from history.
- `v1.0` and beyond: put an exact git tag on HEAD (`git tag v1.0`) — the
  build shows the tag instead. The owner declares that milestone.
- Shown in the ⓘ dialog ("You're on vX.Y") and per changelog entry.

## UI conventions

- WB gain + exposure sliders are LOG-scale: the `<input>` stores a 0..1000
  position; `toPos`/`fromPos` in main.ts map it exponentially over
  0.02–16x (WB) / 0.1–16x (exposure) so 1.0 sits near mid-track. On a linear
  track every realistic gain crowded into the bottom tenth and read as
  "auto WB collapsed to the floor" even when correct.
- Headless verification: the real shader can be exercised in the sandbox with
  `/opt/pw-browsers/chromium --headless --dump-dom` + an esbuild-bundled page
  that instantiates `Renderer` and readPixels — see the band-slider bug hunt.

## Working agreements with the owner

- Verify against real files before shipping; show rendered proof.
- Be explicit about what is verified vs what needs their on-device testing.
- Commit messages are user-facing (the ⓘ dialog shows the last 5, linked).
- The owner's taste: max saturation, gentle contrast, shadows alive.
