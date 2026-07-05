# Infrared Photography Studio — Architecture & Hard-Won Knowledge

This document exists so that ANY future maintainer — a person or an AI model —
can continue this project without rediscovering what was learned the hard way.
Read this before touching the pipeline.

## What this app is

An offline-first PWA (Vite + TypeScript, no framework) that edits infrared
photos from an IR-converted Nikon Z50: true raw decode in pure JS, unbounded
white balance, red↔blue channel swap, camera-matrix color, one-tap looks,
denoise, halation glow, per-color grading, full-res export, and Lightroom
profile generation. Deployed to Cloudflare Pages by GitHub Actions
(`.github/workflows/deploy.yml`; needs CLOUDFLARE_API_TOKEN /
CLOUDFLARE_ACCOUNT_ID repo secrets). Branches (renamed/cleaned 2026-07-04):
push to `main` (the default) deploys PRODUCTION at
https://infrared-photography-studio.pages.dev; push to `staging` deploys the
preview at https://staging.infrared-photography-studio.pages.dev. Note the
lowercase branch names — GitHub Actions trigger matching is case-sensitive.

## The one sentence that explains everything

Lightroom floors white balance at 2000K, but raw IR needs channel gains far
beyond that (measured ~R0.42/G7.8/B2.1 on real files) — so this app decodes
raw itself and applies arbitrary gains, which is the entire reason it exists.

## Pipeline order (do not reorder casually)

```
decode -> LINEAR camera-native RGB
  -> DENOISE          (bilateral, BEFORE any gains amplify noise)
  -> EXPOSURE, WB     (linear multipliers; WB luminance-normalized)
  -> IR LENS FIX      (radial luminance gain: hot-spot darkens centre, vignette
                       brightens/darkens corners. `radialGain` is CIRCULAR IN
                       PIXELS — hot-spots are optically round — via an aspect
                       term (u_aspect / compileEdit's aspect arg); r = 1 at the
                       frame corner. Spatial (image-uv) -> NOT in the .cube LUT.)
  -> CAMERA MATRIX    (cam->sRGB, row-normalized; SEPARATES IR hues — without
                       it all IR chroma sits on one magenta axis and swap/sat
                       cannot produce false color. Biggest single discovery.)
  -> CHANNEL SWAP     (r<->b)
  -> GLOBAL HUE (YIQ) (global rotation CANNOT move sky and foliage apart)
  -> SATURATION       (boost fades below ~0.2 luma to avoid chroma noise)
  -> PER-COLOR BANDS  (complementary halves of the hue circle: sky centred
                       210° plateau 55 edge 105, foliage = 1 - sky. Full
                       coverage, no dead zone. The R<->B swap reflects hue
                       (h -> 240 - h), so with swap ON the sky band re-centres
                       to 30° — bands FOLLOW THE SUBJECT through a swap
                       (owner's decision, 2026-07-04: the boxes are labeled
                       Sky/Foliage and must keep meaning that). The band-box
                       sub-labels in the panel update live with the swap
                       state. hue/sat/lum each)
  -> TINT             (sepia over mono)
  -> GLOW             (adds blurred-highlight map in linear; HIE halation)
  -> LOCAL MASKS      (radial/linear, up to 4; each applies local brightness/
                       contrast/saturation/hue/warmth weighted by the mask, in
                       LINEAR space here. Geometry is image-uv so masks stick to
                       the subject through zoom/pan/rotation. Spatial (reads the
                       pixel's uv) -> like denoise/glow, NOT baked into the .cube
                       LUT. compileEdit takes (u,v); the shader uses v_uv.)
  -> CONTRAST         ((c-0.5)*k+0.5)
  -> GAMMA 2.2
  -> TONE CURVE       (five fixed-x control points blacks/shadows/midtones/
                       whites/highlights, monotone-cubic Fritsch–Carlson,
                       per channel in DISPLAY/gamma space — the very last step.
                       `EditParams.tone`, identity = TONE_DEFAULT. This is the
                       Lightroom-style tone control; a global Luminance slider
                       rides on top of it, not a separate set of range sliders.)
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
- Image exports embed an **sRGB ICC profile** (`src/icc.ts`, `SRGB_ICC`) so files
  are never untagged: JPEG gets an APP2 `ICC_PROFILE` segment (`embedIccInJpeg`,
  inserted after SOI/APP0), the 16-bit TIFF gets tag 34675 (`writeTiff16`). The
  profile is a minimal valid ICC v2 display profile — sRGB/Rec.709 primaries,
  gamma-2.2 TRC (what `toGamma` writes, not the sRGB piecewise curve), D50 PCS
  with the standard D65→D50-adapted colorants. If the pipeline's encode ever
  changes to true sRGB piecewise, swap the TRC to a `para` curve to match.

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

- Computed at build time in `vite.config.ts` from git history + the VERSION
  file; no manual bookkeeping.
- Pre-1.0 history: `v0.N`, N = commit count at that commit.
- The VERSION file declares a base (e.g. "1.0") at the commit that changes
  it; later commits are automatic point releases `1.0.M` (M = commits since
  the declaration). Bump VERSION for the next milestone.
- Git tags are NOT usable — the remote proxy refuses tag pushes (403).
- CI needs `fetch-depth: 0` (deploy.yml) or commit counts are truncated and
  every version comes out wrong.
- Shown in the ⓘ dialog ("You're on vX.Y") and per changelog entry.

## UI conventions

- Live histogram (`histogram.ts` + `Renderer.histogram()`): a floating,
  semi-transparent RGB+luminance readout over the top-right of the image
  (Lightroom style — red/green/blue mountains, white where they stack). It is
  computed by RE-RENDERING the current edit into a tiny offscreen framebuffer
  (`HIST_MAX`=220px longest edge) and reading those ~48k post-gamma pixels back
  into four 256-bin tallies — NOT by reading the full preview buffer (too slow
  on iPad). The offscreen pass shares `bindPipeline()` with the on-screen render
  so the two can never disagree; it restores the default framebuffer + viewport
  after readback (verified: on-screen frame is byte-identical after the pass).
  Rotation is ignored in the histogram pass (it can't change the value
  distribution). Drawn with additive (`lighter`) compositing so channel overlap
  glows toward white with no extra passes; normalization ignores the 0/255
  spikes (IR frames pin huge counts at pure black) and uses sqrt scaling so
  faint tails stay visible. Toggled from the header button; preference persists
  in `localStorage` (`ips-hist`). `pointer-events:none` so tap-to-WB still works
  through it. Refreshed from `draw()` and the hold-to-compare path.
- ⓘ dialog = **patch notes + roadmap hub**. Both are injected at build time by
  `vite.config.ts`, so both refresh automatically on every push:
  - *Patch notes* = last 5 commits (`__CHANGELOG__`), each linked to its commit
    with its real version number; a "More" link opens the full commit history
    on GitHub (earlier versions).
  - *Roadmap* = the `__ROADMAP__` list, parsed from the `## Next capability
    release` section of NOTES.md — that section is the SINGLE SOURCE OF TRUTH.
    Each `- [ ]`/`- [x]` bullet becomes one item; the shown title is the text
    before the first " — ". Pending items render above shipped ones; a "More"
    link opens NOTES.md on GitHub for the full picture. To change the in-app
    roadmap, edit that NOTES.md section — do not hard-code items in the app.
- Tone LUT (`u_toneTex`) is a **256-entry** ramp, and the neutral/identity path
  must be too. A 2-texel `[0,255]` ramp is NOT an identity under LINEAR+CLAMP:
  the texel centres sit at u=0.25/0.75, so it clamps everything below 25% to
  black and above 75% to white (a silent shadow-crush/highlight-blow on the
  default curve; the histogram re-renders the same pipeline so it agreed and
  never exposed it). Fixed 2026-07-04 — `IDENTITY_LUT` samples the diagonal to
  <½ LSB. Verified GPU==CPU on a full gradient (identity maxErr 0).
- Global **Luminance** (`u_lum`, `EditParams.lum`) is the last display-space op,
  after the tone LUT: `pow(g, 1/lum)`, endpoints pinned so it lifts the body
  without clipping. Same math in `compileEdit` (so `.cube` bakes it). Log-scale
  slider 0.5–2× (`LUM_LO/HI`), neutral 1.0 mid-track, in the Tone curve panel.
- Edit history (Undo / Reset / saved looks) is built on **snapshots** in
  `main.ts`. A `Snapshot` = the full editor state: the `EditParams` plus
  `activeLook` (which look button is lit) and `lookBias` (the WB bias a look
  baked in), so restoring one reproduces exactly what was on screen. Rotation
  and zoom are VIEW state, not part of a snapshot — Undo/Reset leave them.
  - `draw()` calls `recordSoon()` (350 ms debounce) so a continuous slider drag
    coalesces into ONE undo entry; discrete actions (look, swap, Auto, tap-WB,
    per-color/tone reset, slot load) call `flushRecord()` to be atomic. The
    debounce records the PREVIOUS settled state, so Undo lands on pre-edit.
  - `baseline` is snapshotted at the end of `openImported` (after the automatic
    WB/exposure/denoise) — that's the Reset target. Reset settles current edits
    first, so Reset is itself undoable.
  - **Save/Load looks**: five `localStorage` slots (`ips-look-slot-N`). A slot
    stores the CREATIVE grade only (`SavedLook` — swap/hue/sat/contrast/tint/
    glow/sky/foliage/tone/lum), NOT the per-shot white balance / exposure /
    denoise, so a look drops onto any photo on top of its own balance (like the
    built-in Looks). Loading keeps the current WB/exposure/denoise, clears
    `activeLook` (a loaded custom grade isn't one built-in look), and records
    one undoable step. `readSlot` coerces every field (and reads older full
    snapshots) so a stale slot can't corrupt the edit.
- Local masks: geometry is stored in **image-uv** so it survives rotation/zoom.
  The stage SVG overlay (`#maskOverlay`, `pointer-events:none` so tap-to-WB still
  works through it) draws the selected mask; handles map image-uv↔client via
  `Renderer.imageUvToClient` / `clientToImageUv` (inverse of `toImagePixel`, so
  rotation is handled). `renderMaskOverlay()` rebuilds elements only on
  select/add/delete (never mid-drag — that would destroy the captured handle);
  `positionMaskOverlay()` just repositions existing elements and is called every
  frame, on zoom/pan, resize and rotate. Masks are composition-specific: reset on
  every open, excluded from saved looks (portable), but part of undo/reset.
  - **Brush masks** (type 2): a painted single-channel bitmap at ≤384px working
    res (`BrushMask`), bilinearly sampled. GLSL can't dynamically index samplers,
    so up to 4 brush masks pack into ONE RGBA texture (`u_maskTex`, one channel
    per mask index; `texture(u_maskTex, v_uv)[i]`); the CPU mirror bilinearly
    samples `m.brush`. Re-uploaded only when a `rev` changes. Undo equality uses
    `snapSig()` (a JSON replacer that drops the `data` buffer, comparing `rev`)
    so the bitmap is never serialised; a stroke commits one undo step on
    pointer-up (`recordSoon` is suppressed while `painting`). Snapshots SHARE
    brush buffers (copy-on-write): `cloneParams` does not copy `data`;
    `startPaint` and Clear give the LIVE mask a fresh buffer before mutating,
    so history entries stay immutable and 100 snapshots don't hold 100 bitmap
    copies. Never mutate a brush's `data` in place anywhere else. Paint mode
    intercepts single-pointer canvas drags (guards atop the canvas pointer
    handlers) and sets `tapSuppressed` so it never also fires tap-to-WB.
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
