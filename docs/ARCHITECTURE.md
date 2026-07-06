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
  -> CLARITY/DEHAZE   (before exposure/WB, on linear source data, vs per-image
                       LOW-RES MAPS (localmap.ts, RG8: blurred luma + blurred
                       dark-channel, sqrt-encoded, shared scale). Clarity =
                       pow(L/Lblur, k) — ratio-based, so exposure/WB-invariant.
                       Dehaze is HUE-PRESERVING: veil-subtracts LUMINANCE only
                       ((L-dV)/(1-dV)), then scales all channels by L1/L0.
                       NEVER subtract per-channel here — camera-native channels
                       are wildly imbalanced pre-WB, so an equal cut shifts hue
                       hard once the WB gains amplify it (field bug 2026-07-05).
                       Spatial -> NOT in the .cube LUT. CPU bilinears the SAME
                       encoded bytes the GPU filters, then decodes — parity.)
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
  -> LOCAL MASKS      (radial/linear/brush/colour/sky, up to 4; each applies
                       local brightness/contrast/saturation/hue/warmth weighted
                       by the mask, in LINEAR space here. Radial/linear/brush
                       geometry is image-uv so masks stick to the subject through
                       zoom/pan/rotation; a COLOUR mask (type 3) has no geometry —
                       its weight is a chroma-key on the pixel's own DISPLAY-space
                       hue/saturation; a SKY mask (type 4) also has no geometry —
                       its weight is a BITMAP the sky heuristic generates once in
                       JS and stores in `brush`, sampled through the exact same
                       path as a painted brush mask (see the sky-mask note below).
                       Spatial (reads the pixel's uv and/or colour) -> like
                       denoise/glow, NOT baked into the .cube LUT. compileEdit
                       takes (u,v); the shader uses v_uv.)
  -> CONTRAST         ((c-0.5)*k+0.5)
  -> GAMMA 2.2
  -> TONE CURVE       (five fixed-x control points blacks/shadows/midtones/
                       whites/highlights, monotone-cubic Fritsch–Carlson,
                       per channel in DISPLAY/gamma space (HSL mixer + global
                       Luminance run after it).
                       `EditParams.tone`, identity = TONE_DEFAULT. This is the
                       Lightroom-style tone control; a global Luminance slider
                       rides on top of it, not a separate set of range sliders.)
  -> HSL MIXER        (moved AFTER gamma+tone 2026-07-05: it ran mid-pipeline
                       in linear space and chips felt "unbound to live colors"
                       — contrast/gamma/tone shifted hues between there and
                       the screen. Now it classifies the NEAR-FINAL display
                       colour, so the chip you pick owns the colour you see.
                       8 bands at HSL_CENTERS, hue/sat/lum each; weights
                       smoothstep between ADJACENT centres (≤2 chips per hue).
                       Saturation is a POWER curve s^(1/slider) — a multiplier
                       is invisible on low-sat IR skies. Does NOT follow the
                       swap. Colour-only -> IS baked into the .cube LUT.
                       "Pick color from photo" (one-shot, eats the tap so it
                       never sets WB) reads the drawing buffer via
                       readDisplayedPixel and selects the majority-weight
                       chip. "Drag on photo to adjust" (main.ts TAT tool) is
                       the same pick made continuous: a SUSTAINED canvas mode
                       (toggle) that grabs the chip under the finger, then maps
                       a vertical drag -> that chip's lumScale and horizontal ->
                       its hueShift, straight into params.hsl. Pure UI over the
                       existing mixer — NO shader/CPU change, so the "change
                       both or neither" rule does not apply. CRUCIAL: it picks
                       the chip from the colour BEFORE the mixer (Renderer.
                       readUvPixel renders the pixel with hsl neutralised into
                       the shared offscreen FBO), NOT the displayed colour — the
                       mixer SHIFTS the underlying hue, so the shifted display
                       colour points at a different, wrong chip, whereas the
                       pre-mixer colour is invariant, so touching the same spot
                       twice grabs the SAME chip and keeps building on its
                       current values (field bug 2026-07-05: re-touch drifted to
                       a fresh neutral chip). readUvPixel and histogram() share
                       renderOffscreen()/restoreDefaultFbo(); readUvPixel flips
                       y (image-uv v=0 is top, GL is bottom-origin). While armed
                       it owns the canvas ahead of tap-WB / pan / pinch / hold
                       (brush paint still takes priority above it); a standing
                       accent banner (#tatBanner, tap to exit) makes the mode
                       obvious; startTat sets tapSuppressed so the trailing click
                       never sets WB; one drag = one undo step (flushRecord on
                       pointerup, deduped). Runs after TONE, before LUMINANCE.)
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

## Graceful failure (no dead ends — added 2026-07-05)

Every hard break explains itself and offers options; never a blank page or a
raw exception string:
- No WebGL2 -> `#unsupported` overlay (static HTML/CSS; main.ts shows it and
  re-throws, halting the module). Covers old browsers and locked-down webviews;
  tells in-app-browser users to use "Open in browser".
- ZIP import without DecompressionStream (Safari <16.4 / Firefox <113) ->
  guard in import.ts with the direct-import alternative.
- Unknown file types get ONE native-decode attempt (decodeBitmap) before
  failing — which makes HEIC WORK in Safari; elsewhere HEIC is detected by
  ftyp brand and the message says use Safari or export JPEG.
- NEF decode failure -> assume Z8/Z9 High-Efficiency, point at DNG Converter.
- Example fetch failure -> actionable alert (offline explanation); note the SW
  serves cached examples when offline, and Playwright route-abort tests need
  `serviceWorkers: 'block'` or the SW satisfies the request anyway.

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
- ⓘ dialog = **patch notes + roadmap hub**. It AUTO-OPENS once when the app
  version changed since the last visit (`localStorage` `ips-whatsnew` stores
  the last-seen version; written immediately on load so reloads never
  re-trigger; first-ever visit records silently — the welcome screen owns
  that moment). Both are injected at build time by
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
    PARITY LESSON (2026-07-06, from the sky-mask harness): `sampleBrush` must
    replicate the GPU's texture sampling EXACTLY — WebGL LINEAR samples at texel
    coordinate `u*size - 0.5` (texel centres) with CLAMP_TO_EDGE, NOT `u*(size-1)`.
    The two agree only at u=0.5, so at a soft mask edge under a strong local
    adjustment the half-texel gap pushed a cluster of edge pixels to 16–32 LSB.
    CLAMP_TO_EDGE also collapses BOTH bilinear taps to the border texel off the
    edge — clamp each neighbour from the unclamped floor (clamping x0 then using
    x0+1 wrongly reaches a second texel at the frame border, a 20-LSB error on
    the top row). Brush masks mostly hid this (soft strokes); the sky's gaussian-
    feathered edge exposed it. The fix is shared, so it tightened brush parity too.
  - **Colour masks** (type 3): a chroma-key with NO geometry — the weight comes
    from each pixel's own colour, not its position. `colorMaskWeight` projects
    the pixel and the tapped target onto the HSV **chroma plane** (hue angle ×
    saturation radius), takes the Euclidean distance, and — CRUCIAL, field bug
    2026-07-05 — divides it by the TARGET's own saturation: `colorRange` means
    "how far from THIS colour, relative to how colourful it is". IR frames live
    at key-saturations ~0.1–0.3, where every hue sits within an absolute 0.25 of
    every other — the first cut used absolute distance and the mask selected
    nearly everything, so the sliders read as broken on the iPad. Normalising by
    `max(0.08, satTarget)` makes hue discrimination independent of the image's
    overall chroma level. Weight is 1 at the target, smoothstep to 0 past
    `colorRange` (`feather` widens the soft edge); near-grey pixels still sit
    near the origin whatever their noisy hue. `satTarget < 0` = no colour picked
    yet → the mask is INERT (0 everywhere, invert included) instead of keying on
    a meaningless default.
    The KEY SPACE is `keyDisplay` = contrast → gamma of the pre-mask linear
    colour, captured ONCE before the mask loop (`cKey`): (1) it is the exact
    colour a tap samples — the shader's `u_readMode==1` emits it and
    `Renderer.readColorKeyPixel` reads it — so the colour you touch selects
    itself; (2) fixed pre-mask, so stacking order can't shift the selection and
    upstream rounding can't cascade into the steep key; (3) tone/mixer/lum are
    EXCLUDED both for TAT-style stability (steering tools you tweak after
    masking must not move the mask) and because the tone curve is a filtered
    8-bit LUT texture on the GPU — routing the key through it broke GPU==CPU to
    15 LSB (quantisation amplified by the selection edge, and real Apple-GPU
    filtering wouldn't deterministically match a CPU emulation anyway). The key
    stays pure ALU. SECOND parity lesson: do NOT build the chroma vector from
    `rgb2hsv` — the GPU and CPU formulations drift ~1° at the hexagon vertices
    (≈3 LSB at the edge); both sides use `chromaVec`, the branch-free opponent
    projection `(R-½(G+B), √3⁄2·(G-B)) / V` — the SAME point (|v|=HSV S,
    angle=HSV H) but continuous, so GPU==CPU to float epsilon.
    TARGETING is a SUSTAINED pick mode (the TAT lesson, relearned 2026-07-05 on
    the iPad): the first cut was one-shot — it disarmed after the tap, so
    tapping a second colour fell through to tap-to-WB and re-balanced the whole
    photo ("selecting a different color undoes the work"). Now, while armed
    (auto-armed on +Colour), EVERY tap re-picks; a standing banner
    (`#colorBanner`, tap to exit) owns the moment, and it sits at the BOTTOM of
    the stage — IR skies are at the top, and a top banner ate exactly those
    re-pick taps (found by the headless UI flow, which clicks the sky). The tap
    stores the target via the same `chromaVec` (hueTarget = atan2 angle,
    satTarget = radius) plus `valTarget` (HSV V, swatch cosmetics ONLY) so the
    panel swatch shows the actual tapped colour. Arming disarms stale-safe via
    updateMaskUI when the mask vanishes (undo/delete/new photo). Geometry
    uniforms are reused: `u_maskGeoA` = `(hueTarget, satTarget, colorRange, -)`
    for type 3, `u_maskGeoB` stays `(feather, invert)`; no overlay handles
    (like brush). Verified in headless chromium: GPU==CPU ≤2 LSB across
    solo/inverted/stacked/full-stack configs (the 2-LSB pixels are near-grey
    points from the pre-existing mixer/tone/lum display ops), a controlled
    hue×sat selectivity render, and a real UI flow — pick foliage on the canopy
    example → sky probes provably untouched, re-pick the sky while armed keeps
    the slider work and never fires tap-WB, undo fully unwinds.
  - **Sky masks** (type 4): CLASSICAL sky detection, no ML (subject/background
    segmentation genuinely needs on-device WebGPU ML and stays on the frontier
    backlog — noted honestly, not attempted). The weight is a BITMAP the
    heuristic (`sky.ts`) generates ONCE per image and stores in the same `brush`
    field as a painted mask, so it rides the entire brush machinery for free —
    packed brush texture on the GPU, `sampleBrush` on the CPU, copy-on-write +
    `rev` undo equality, snapSig dropping `data`. Consequences: NO sky-specific
    shader/CPU weight math (the shader change is one branch, `type==2 || type==4`),
    GPU==CPU is automatic (both read the same baked bytes), and the bitmap MUST
    be generated at the brush working size (BRUSH_MAX_EDGE=384) so it packs with
    brush masks (all bitmap masks share one size). Connectivity — "sky touches
    the top", flood down to the horizon, re-add sky through branches — CANNOT be
    a per-pixel weight function, which is exactly why it lives in JS at
    generation time, not in the twin pipeline.
    THE HEURISTIC (scoped by measuring the real frames FIRST, 2026-07-06):
    brightness is NOT a usable prior — in linear IR the sunlit foliage is the
    brightest thing and lodge's sky is the DARKEST region in frame, so any
    "sky is bright" rule fails. The signals that actually hold on canopy/lodge/
    hillside: (1) SMOOTHNESS — sky luma-gradient ~0.004–0.03 vs 0.1–0.4 for
    foliage (the strongest signal); (2) COLOUR COHERENCE — whatever the sky's
    colour, it is one tight cluster, so the model is LEARNED from the seeds, never
    assumed. Steps: work in an image-oriented grid at 384px on gray-world-WB ×
    camera-matrix linear (AUTO WB, deliberately independent of the live edit so
    the selection can't drift as you grade — the colour-mask lesson applied
    preemptively); seed on the smooth pixels of the display-top band (only the
    seed edge depends on rotation — adjacency and gradient are orientation-free,
    so no resampling); learn the sky luma+chroma model ROBUSTLY (median + MAD,
    reject outliers, refit — hillside's top edge mixes sky with dark twigs and the
    dominant cluster must win); flood-fill down while a pixel stays near the model,
    is continuous with its neighbour (lets slow vertical gradients pass) and does
    not cross a hard edge (non-level horizons handled for free — no line fitting);
    hole-fill enclosed pixels that match the model but sit no deeper than the sky
    already reaches (sky through branches / around a horizon object — a bright
    object like the lodge horse is a different cluster behind a hard edge, so it
    is correctly EXCLUDED); gaussian-feather the bitmap. `Reach` (`m.reach`)
    scales the grow tolerances, `Feather` (`m.feather`) the edge blur — BOTH
    regenerate the bitmap (cheap at 384px; a feather change only rebuilds when it
    actually moved, since the shared slider handler also fires for brightness/
    sat/etc.). A ROTATION regenerates every sky mask (the display-top edge moved).
    Seeds below a threshold → `found=false`, an all-zero (inert) bitmap and an
    honest "No clear sky found" status pointing at Brush/Colour — never a fake
    selection. No geometry overlay (like brush/colour). LIMITS (stated, not hidden):
    hard-edged clouds are a second cluster the fill may stop at (Reach/brush are
    the fallback — UNVERIFIED against real clouds, none in the examples); sky not
    touching the top won't seed (by design); 384px softens fine twigs (same as
    brush). Verified in headless chromium: GPU==CPU ≤1 LSB on canopy/lodge/
    hillside across solo/inverted/(sky+radial)/(sky+colour+radial+brush)/strong-
    adjust; rendered before→after proof (foliage untouched, treeline hugged,
    holes filled); and a real add→grade→invert→undo UI flow (foliage Δ0, sky
    strongly graded, invert flips the effect to the ground, undo restores exactly).
- WB gain + exposure sliders are LOG-scale: the `<input>` stores a 0..1000
  position; `toPos`/`fromPos` in main.ts map it exponentially over
  0.02–16x (WB) / 0.1–16x (exposure) so 1.0 sits near mid-track. On a linear
  track every realistic gain crowded into the bottom tenth and read as
  "auto WB collapsed to the floor" even when correct.
- Headless verification: the real shader can be exercised in the sandbox with
  `/opt/pw-browsers/chromium --headless --dump-dom` + an esbuild-bundled page
  that instantiates `Renderer` and readPixels — see the band-slider bug hunt.

## Macro focus-stacking mode (second discipline)

A parallel tool in the same codebase, shipped JPEG-first 2026-07-06.

**App shape — the two-door split.** `index.html` is a tiny standalone chooser
(its own ~0.2 KB bundle, imports neither editor). `ir.html` is the unchanged
IR editor; `macro.html` is the stacker. Vite builds all three as separate
entries (`build.rollupOptions.input`), so each route pulls ONLY its own bundle
— the IR editor (~100 KB) never loads for macro users and the macro engine
(~7 KB) never loads for IR users (route-based code-splitting). Cloudflare Pages
serves `ir.html` at `/ir` and `macro.html` at `/macro` (clean URLs); links use
the `.html` form so `vite preview` and offline both work. Per-route manifests
(`manifest`/`ir`/`macro`.webmanifest) each set their own `start_url` so "Add to
Home Screen" from a mode installs INTO that mode. The service worker is shared
and unchanged (network-first navigations already cover the new pages). Each
mode has a back-to-Studio link (`‹`) — modes announce themselves and offer an
obvious exit.

**The engine (`src/macro/stack.ts`).** Combines a focus-shift burst into one
all-in-focus frame. Classical DSP, no ML.
- MEMORY is the binding constraint: a 20 MP × 11-frame stack is ~900 MB fully
  decoded → tab crash. So it STREAMS — decode ONE frame at a time at the
  working resolution (`createImageBitmap` with `resizeWidth/Height` = native
  decode+scale, never the full 20 MP), fold it into the running result, release
  it. Peak memory is a couple of full-frame buffers, independent of frame count.
- BLEND — Laplacian pyramid (`pyramid.ts`): each frame is split into frequency
  bands; at every band + pixel the coefficient from the frame with the most
  LOCAL CONTRAST (blurred luma-band energy) wins; the merged pyramid collapses
  to the result. Per-band selection dissolves seams — the bands blend across the
  focus/bokeh boundary at their own scale. The base (lowest band) is AVERAGED
  (it carries near-identical overall tone; selecting it mottles). It streams:
  `PyramidBlender.add()` folds one frame's pyramid and discards it, so peak RAM
  is the merged pyramid + one frame's, independent of frame count. Two earlier
  tries are recorded in the code: a soft weighted MEAN veiled the subject (pulls
  in the 10 defocused frames, read softer than a single frame), and a hard
  per-pixel argmax was sharp but left grain in low-contrast transitions
  (measured 2026-07-06). The pyramid fixed both.
- ALIGN: coarse integer translation per frame vs frame 0 (SSD search on a
  downsampled luma). Noah's set was tripod-steady (drift ≈0), so translation
  sufficed; rotation + breathing-scale are deferred until a set needs them.
- Verified in headless chromium on the real 11-frame set: result is sharper than
  frame 0 across the subject box (no transition grain), bokeh untouched, save
  enabled; plus a full UI flow (chooser doors, IR intact, load→stack→result).

**Full-res export (`stackFocusFullRes`).** The preview stacks at 2048 px; Save
renders the SAME pyramid blend at full resolution (20 MP), TILED so peak memory
stays bounded. Tiles carry a `halo` (256 px ≥ the base band's spatial support),
so adjacent tile CORES butt together seam-free with no feather pass (verified:
tile-boundary contrast ratios 1.1–1.4, below any seam threshold). Processed
ROW-BAND / frame-outer: each frame's full-width strip is decoded ONCE per tile
row and fanned to that row's column tiles, so a full-res frame is decoded rows×
(not tiles×) times while only one row of tile pyramids is resident. Alignment
shifts are estimated once on a 480 px luma and scaled to full-res px. Cost is
real — ~1–1.5 min for an 11-frame 20 MP stack in headless SOFTWARE decode
(faster on the iPad's hardware decoder); it runs in a **Web Worker**
(`export.worker.ts`, its own code-split chunk loaded only on export) so the main
thread and the progress bar stay responsive through the render. The finished
pixel buffer is TRANSFERRED (zero-copy) back. Worker failure falls back to an
honest error message (module workers need Safari 15+, fine on the target iPad).
The iOS share landmine
applies: navigator.share needs a FRESH tap, so Save is TWO-PHASE — first tap
renders ("Export full-res" → progress → "Full resolution ready"), the button
flips to "Save image", and the next fresh tap hands the finished JPEG to the
share sheet.

**Next refinements (not yet built):** scale/rotation align for handheld sets,
and moving the full-res render to a Web Worker so the UI never janks.

**RAW input is DEFERRED — the Z50 II shoots High-Efficiency NEF.** The macro
files are `NIKON Z50_2` (EXIF), NIKKOR Z DX 50-250 mm pseudo-macro, ~14.5 MB /
20.6 MP — that size is HE/HE★ NEF (a TicoRAW-class codec), NOT the traditional
Huffman NEF `raw/nef.ts` decodes (which is Z50-only and already rejects
Z8/Z9 High-Efficiency). Confirmed HE by the owner. A HE-NEF decoder is a
separate large effort; JPEG-first sidesteps it entirely. If RAW macro is wanted
later, that decoder (or shooting Lossless NEF) is the prerequisite.

## Working agreements with the owner

- Verify against real files before shipping; show rendered proof.
- Be explicit about what is verified vs what needs their on-device testing.
- Commit messages are user-facing (the ⓘ dialog shows the last 5, linked).
- The owner's taste: max saturation, gentle contrast, shadows alive.
