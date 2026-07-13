# Infrared Photography Studio (IPS) — Project Notes

> Captured from Noah's description and refined as the project progressed.
> Date captured: 2026-06-17

## What this is

An app for editing **infrared (IR) photographs** using the **color-IR
channel-swap method**. The core involves **color swaps and hue shifts**,
particularly pushing **white balance below the range a typical white-balance
control normally allows** — the move that ordinary editors (Lightroom) can't do
because they floor temperature at ~2000K.

## Goals

- **Eventual target:** publish to the **Apple App Store**.
- **Acceptable starting point:** a **web app** that runs on the **iPad in
  desktop mode**.

## Inputs / files

- Works with **JPG and RAW**.
- **Primary interest is RAW editing.**
- RAW arrives as **Nikon NEF** (native) and **DNG** (lossy-linear and mosaiced).
- Files are stored in **Lightroom**, but can be exported to **Photos** or
  **Files**.

## Desired workflow / UI

1. **Open a file** and **see the image**.
2. **Set white balance** by either:
   - **Tapping** a point on the image, or
   - **Dragging a selector** to find the best white balance (preferred).
3. Press **buttons that correspond to the channel swaps / hue shifts**.
4. **Save the edited image back to the device**, at **native resolution or
   lower by user's choice**.

## Open requests from Noah

- **Help avoid common pitfalls.**
- Do **not** want pseudo code or drafts — wants it run through **review passes
  until it is as good as it can be**.

## Confirmed

- Camera: **Nikon Z50, IR-converted**. Filters tested: **red, 530nm, 720nm,
  none**. Red gives the most color; 720nm is near-monochrome ("white forest").
- Input formats validated on the real files:
  - **Lossy linear DNG** (8-bit, baseline-JPEG tile) — decodes natively.
  - **Mosaiced DNG** (14-bit, lossless-JPEG, Bayer) — pure-JS LJ92 decoder
    **verified bit-exact** vs LibRaw.
  - **Nikon NEF** (14-bit, Compression 34713 = Nikon compressed) — needs its
    own decoder (Nikon Huffman + linearization curve + predictor).
- Output: **JPEG q92 Display P3** + **16-bit TIFF**; also **export `.dcp`/`.cube`
  for Lightroom/Photoshop** generated from the in-app edit (the user's own look,
  no third-party IP).
- Platform: **offline-first PWA**, iPad A3355 (A16); native App Store build later.
- Confirmed the sub-2000K white-balance crux on a real file (needed gains
  R 0.42 / G 7.8 / B 2.1 — impossible in Lightroom, trivial in our pipeline).
- Noted IR **lens vignette/hot-spot** in some frames (shooting-side issue).

See **`PLAN.md`** for the full build plan.

## Status

- [x] Confirm scope and stack
- [x] Identify pitfalls (esp. RAW + sub-range white balance in a web app)
- [x] Validate DNG decode + WB + swap on real files
- [x] Phase 1: scaffold + hardened import + WebGL edit pipeline
- [x] True raw decode: native lossy-linear-DNG path (unbounded WB)
- [x] Verify pure-JS lossless-JPEG (LJ92) decoder bit-exact vs LibRaw
- [x] Port LJ92 decoder to TypeScript + demosaic (mosaiced DNG) — bit-exact
- [x] Nikon NEF decoder (Compression 34713) — bit-exact, ~0.8s full frame in JS
- [x] Export: JPEG + 16-bit TIFF, native-res bilinear demosaic, resolution choice
- [x] `.cube` LUT export (creative look) — verified vs pipeline (mean err 0.0012)
- [x] `.dcp` profile export — structure validated; **needs a Lightroom colour test**
- [x] Deployed: Cloudflare Pages via GitHub Actions (auto on push)
- [x] URL rebranded off "infrared" (branch work, 2026-07-12, awaiting deploy):
      the Pages project is now **jefferson-photo-studio** (jefferson-photo-studio.pages.dev,
      staging.jefferson-photo-studio.pages.dev) so the shared address matches the
      "Photography Studio" umbrella instead of branding the macro tool "infrared".
      The OLD project (infrared-photography-studio) is kept alive on production
      pushes serving only a 301 -> the new home (see `redirect/`: a Cloudflare
      `_redirects` splat plus an HTML fallback that unregisters the old service
      worker + clears caches, then forwards, preserving the path). Old
      Home-Screen installs / bookmarks break and must be re-added — accepted by
      Noah. DEPLOYED 2026-07-13 (production flipped with the Studio-icon
      release; redirect published on the main push) and the old-URL redirect
      CONFIRMED WORKING by Noah on device the same day.
- [x] Camera color matrix (fixes flat IR color); exposure + Auto; punchy preset
- [x] Review pass: preview proxy for >2800px 8-bit sources (iOS WebGL buffer
      limit), single EditParams definition, NEF white level 15520, exposure
      clamp matches slider
- [ ] Validate/calibrate .dcp colour in Lightroom (needs ACR; user to test)
- [ ] Display-P3 JPEG output (currently sRGB); per-color HSL; B&W mode for 720nm
- [ ] Nice-to-have: RGBA16F preview texture (halve GPU memory); box-filtered
      downscale on scaled exports; LJ92 restart-marker path untested on real file

## Versioning (agreed 2026-07-04, promoted to 1.0 same day)

- Pre-1.0 history is retroactively **v0.N** (N = update sequence number,
  derived from git commit count at build time — no manual list needed).
- The **VERSION file** declares the base ("1.0"); updates after it are
  automatic point releases: 1.0.1, 1.0.2, … Bump VERSION to declare the next
  milestone (1.1, 2.0). Git tags are NOT used — this environment's git remote
  refuses tag pushes.
- The ⓘ dialog shows the running version and a version per changelog entry.
- CI must check out full history (`fetch-depth: 0` in deploy.yml) or the
  commit counts — and therefore the version numbers — come out wrong.

## Next capability release (owner's roadmap, 2026-07-04; queue refreshed 2026-07-13)

> SOURCE OF TRUTH for the in-app Roadmap (behind the ⓘ button). `vite.config.ts`
> parses the `- [ ]` / `- [x]` checkbox bullets below at build time and injects
> them as `__ROADMAP__`; the dialog renders each item's TITLE — the text up to
> the first " — " (space em-dash space). Keep every roadmap item a single
> top-level checkbox bullet with a short bold title so the parser stays
> reliable. Editing this list updates the app on the next deploy. Both the
> roadmap and the patch notes (last commits) refresh automatically on push.

- [ ] **Pick your Home-Screen icon** — offer a small set of icon styles and let
  the user choose which one their installed app wears. Likely mechanism: a
  picker on the launcher/install flow that swaps the `apple-touch-icon` link
  (and manifest icons) before Add to Home Screen — iOS reads the link at add
  time. PROVE the swap trick on a real iPad EARLY (a probe page with two
  choices) before building the full picker; if iOS caches the first icon, the
  fallback is per-style install pages. Owner ask, 2026-07-13.
- [ ] **Proper pre-filled install names** — Add to Home Screen pre-fills its
  name field from `apple-mobile-web-app-title` (falling back to `<title>`,
  which for the IR editor is the too-long "Infrared Photography Studio").
  Set short, right names per page — Studio / Infrared / Macro — so the sheet
  offers the label you'd actually keep. Check the Android side (manifest
  short_name already covers it). Owner ask, 2026-07-13.
- [ ] **See what you're opening** — thumbnails big enough to actually see when
  choosing a photo. Honest scope: the system Files sheet's tiny previews are
  iOS UI we cannot touch; what we CAN do is let a pick of several files land in
  an in-app chooser first — big tappable previews, tap one to open it (and the
  rest stay a session filmstrip to switch between). Decide placement (Open
  image accepts multiple? separate "Browse…"?) with the owner before building.
  Owner ask, 2026-07-13.
- [x] **Install as one app, two, or three** — explain and guide the three
  install shapes: the whole Studio (launcher manifest), Infrared alone, or
  Macro alone (each already has its own manifest/start_url). SHIPPED 2026-07-13:
  a three-card "Install it your way" section on the launcher (index.html — one
  app / two apps / all three, each saying what it gives you), plus a rewritten
  "Install as an app — one, two, or three" block in the IR Help and a brand-new
  install section in the Macro Help (macro.html had none). All iPad-first
  (Share → Add to Home Screen), with how-to-switch-later spelled out (add/remove
  any, ‹ Studio always goes back). Verified the launcher + both Help dialogs
  render the new copy in headless Chromium, no page errors.
- [x] **A Studio icon** — the launcher/manifest used the old infrared icon.svg;
  now a distinct umbrella mark: a camera APERTURE with six iris blades carrying
  the saturated Studio colour wheel (public/studio-icon.svg, geometry computed
  so the blade edges are exact — circular barrel arc + straight hexagon-opening
  edge + a pinwheel spin so it reads as an iris, not a colour wheel). Family
  with the two children (dark rounded square, max-saturation palette, round
  motif) but neither the IR lens-ring nor the Macro flower. PNG touch icons
  180/512 regenerated via the headless-Chromium screenshot pipeline
  (studio-icon-180/512.png), wired into manifest.webmanifest (svg + 180 any +
  512 maskable) and index.html (apple-touch-icon + svg icon — the launcher had
  NO icon links before, so iOS installs were falling back to the IR art).
  Owner-previewed before staging. SHIPPED 2026-07-13. REWORKED same day after
  owner review ("is that really how the leaves work?" — no, it wasn't): real
  iris blades OVERLAP, so every visible seam is the straight-line CONTINUATION
  of one edge of the opening (the blade edge sweeps in from the barrel and
  becomes a hexagon side); v1's radial corner-to-rim seams read as a colour
  wheel, not an iris. Plus a hairline shadow along each seam to sell the
  blade-over-blade overlap. Icon PNGs keep their filenames, and non-hashed
  assets are cache-first in sw.js — so any icon art change NEEDS a CACHE bump
  or installed apps keep the old art forever.
- [x] **Storage-quota guard for batch** — QuotaExceededError from putFrame used
  to surface as a cryptic per-frame skip; now it's caught specifically
  (isQuotaError: DOMException name/code 22) and stops the batch the same gentle
  way as the memory guard — the frame in flight stays in batchRemaining to retry,
  the finished set is bundled, and the banner reads "Storage is full — N ready in
  a .zip. Save it to free space, then Continue." navigator.storage.persist() is
  requested at batch start (requestPersistentStorage, best-effort) so iOS is less
  likely to evict recovery data mid-run. SHIPPED 2026-07-13.
- [x] **Batch honesty nits** — applyBatchHotspot now returns applied/no-lens/raw;
  JPEG frames whose EXIF didn't name a known lens are counted and the finish
  summary shows "· N without lens hot-spot fix" (RAW is a separate known skip, not
  counted). IR Help gained a "What rides along, and what doesn't" note: masks and
  the IR lens-fix sliders (Hot-spot/size/Vignette) are frame-specific and do NOT
  carry into a batch — each photo gets its own EXIF hot-spot fix instead. Also
  corrected the stale Help that still said "Process many" lives in Export (it
  moved to the top bar + start screen). SHIPPED 2026-07-13.
- [ ] **On-device checks owed** — Safari IDB crash durability (all
  measurements were Chromium), share-sheet with a large .zip, jetsam under
  real memory pressure, and a portrait-orientation frame through batch.
  (The old-URL redirect from an installed old-domain PWA PASSED — owner
  confirmed on device, 2026-07-13.)
- [x] **Process many at once (batch)** — built and SHIPPED TO PRODUCTION
  2026-07-12 (owner-tested on staging, then promoted). "Process many" (top bar
  + start screen) takes a whole set; each frame is auto-balanced on its own (its own WB /
  exposure / denoise and its own EXIF-selected hot-spot correction, exactly
  like opening it), then the CURRENT on-screen look (currentLook() creative
  grade — no per-shot WB, no masks) layers on top of every frame. Reuses the
  existing full-res CPU export pipeline per file; results bundle into one .zip
  (new store-only writer in zip.ts, CRC32, no DEFLATE) handed to the share
  sheet in a single tap. Format/Resolution/Quality come from the Export panel.
  Entry points: a "Process many photos…" action on the welcome screen and a
  "Process many" button in the top bar next to Open image (both are labels for
  the same hidden multi-file input) — deliberately NOT buried in Export, which
  is the last accordion (owner feedback 2026-07-12). Graceful exit + resume
  (owner asks, same day): every finished frame is persisted to IndexedDB the
  moment it completes (src/batchstore.ts; iOS Safari cannot silently write real
  files, so IDB is the only honest "save as you go"). MEASURED (2026-07-12,
  on-disk Chromium profile): IDB values ≳64 KB (100 KB tested) — Blob and
  ArrayBuffer alike — are externalized to a lazily-flushed sidecar and never
  appear in the LevelDB log at commit, even with durability:"strict"; values
  ≤60 KB land in the on-disk log AT oncomplete. So frames are stored as ≤30 KB
  chunk rows, one strict-durability transaction per frame (meta row + chunks,
  all-or-nothing): a 1.4 MB frame measurably hit the log the moment its write
  resolved, survived a hard browser kill mid-next-frame, and was offered for
  recovery on relaunch. Reads materialize one frame at a time (frameMetas +
  per-frame chunk getAll); each frame becomes its own Blob part for the zip
  (writeZip takes {name,size,crc,data}), so RAM holds ~one frame end-to-end.
  DB is "ips-batch" v2 (meta + chunks; v1's whole-frame store is dropped on
  upgrade). Meta rows also carry the INPUT identity (srcName + srcSize), so
  re-picking a set after a crash resumes seamlessly: already-done inputs skip
  instantly ("N already done earlier") instead of reprocessing into -2
  duplicates. A screen Wake Lock is held while a batch runs (re-acquired on
  visibilitychange) so the iPad doesn't sleep mid-set; unsupported browsers
  just run without it. TESTING GOTCHA that burned an hour: Playwright's
  waitForFunction does NOT await a Promise-returning predicate — a Promise
  object is truthy, so such a poll "passes" instantly and you kill the browser
  before anything was ever written; poll on synchronous DOM state (the
  progress text) instead.
  "Stop & save what's done" (checked between frames — the frame in flight
  finishes first) → partial zip + a "Continue — N left" button that resumes the
  remaining input Files in-session (they stay alive only within the page
  session; after a reload the user must re-pick — no persistent file handles in
  Safari). Crash/close mid-batch → the start screen offers "Recover N finished
  images from an interrupted batch" on next launch. Stored frames are cleared
  only after their zip is actually saved (share/download), and starting a new
  batch with leftovers present asks (confirm) whether to include or recover
  them first. Memory guard kept as a backstop: 2 GB stored-output budget +
  (Chrome-only) 85% JS-heap check.
  Verified end-to-end in headless chromium: mixed PNG + DNG set → CRC-clean zip
  of real decodable JPEGs, per-file names with collision de-dup (…-2.jpg). RAW
  frames skip the hot-spot fix (JPEG-only profiles, same as single open).
  NEEDS THE OWNER'S HANDS: real multi-file pick + share-sheet save on iPad
  Safari, and memory behaviour on a large full-res set (outputs accumulate in
  RAM until the zip is built).
- [x] **Gentler denoise + usable slider** — the slider was far too aggressive
  (top sigma 0.63, near a box blur, 0.2 auto floor). Now QUADRATIC AND
  FLOORLESS: sigma = 0.10·strength², in BOTH the shader and the CPU path
  (raw/denoise.ts — kept bit-identical for GPU==CPU parity). Two owner
  feedback rounds (2026-07-12) shaped this; both failure modes matter:
  (1) a LINEAR slider crams the bilateral's narrow grain→smear sigma band
  into the first pixel of travel — the square spreads it; (2) an ADDITIVE
  FLOOR (first try was 0.03 + 0.12·s²) makes 0→first-step a hard jump to
  sigma 0.03, which on a flat IR sky is already heavy — "0 is none and the
  first step is more than enough". Never re-add a floor; the curve must pass
  through zero. Auto inverts the curve from measured noise; owner-tuned
  2026-07-12 ("default should barely just get rid of the banding only"):
  s = clamp(sqrt(0.75·med / 0.10), 0, 0.6) — targets the noise amplitude
  itself, all headroom above is left for taste. Owner confirmed the slider
  feel ("denoise works well now"); don't reshape without fresh feedback.
- [x] **Drag on photo to adjust** — Lightroom-style targeted adjustment (shipped
  2026-07-05): arm the tool, then drag on the photo — UP/DOWN scales that
  colour's luminance, LEFT/RIGHT shifts its hue. The colour under your finger
  picks its mixer chip from the colour BEFORE the mixer (renders the pixel with
  the mixer neutral), so it just steers the existing 8-chip mixer's params.hsl
  from the picture — NO new pipeline math (GPU/CPU mixer untouched). Picking the
  pre-mixer colour means touching the same spot twice grabs the SAME chip and
  keeps building on its current values (a display-space pick drifted to a fresh
  chip as your own hue-shift moved the colour). Sustained mode: while armed it
  owns the canvas from tap-WB / pan / pinch / hold, with a standing banner (tap
  to exit) making that obvious; one drag = one undo step; a floating readout
  names the colour and shows the live hue/luminance. The drag→param mapping,
  stable re-touch, chip pick and re-render are verified in headless chromium.
- [x] **Mask by color** — a mask type (3) that selects everything matching a
  tapped colour (shipped 2026-07-05; reworked same day after iPad testing found
  it non-selective on real IR frames and the one-shot pick falling through to
  tap-WB). Weight is a chroma-key: the pixel's hue/saturation distance to the
  target in the HSV chroma plane (branch-free opponent projection — hue AND
  saturation in one number), NORMALISED by the target's own saturation so
  "Range" discriminates hues even on chroma-flat IR frames. The key space is
  contrast+gamma of the pre-mask colour (pure ALU — the tone LUT texture broke
  GPU==CPU parity; tone/mixer/lum also excluded so later grading never moves
  the mask). Picking is a SUSTAINED mode with a standing bottom banner: while
  armed every tap re-picks (never tap-WB — the one-shot version nuked the grade
  by re-white-balancing on the second tap), tap the banner to exit; unpicked
  masks are inert; the swatch shows the true tapped colour. Same local
  adjustments as the other masks; spatial, so skipped in the .cube LUT.
  GPU==CPU verified ≤2 LSB in headless chromium, plus a controlled selectivity
  render and a real pick → adjust → re-pick → undo UI flow (sky provably
  untouched when foliage is picked).
- [x] **Mask by sky** — auto-select the sky with a classical heuristic, no ML
  (mask type 4, shipped 2026-07-06). Measured on the real frames first: in
  linear IR the sunlit FOLIAGE is the brightest thing and lodge's sky is the
  DARKEST region, so "sky is bright" is dropped entirely. The real signals are
  smoothness (sky gradient ~0.004–0.03 vs 0.1–0.4 for foliage) plus colour
  coherence, with a LEARNED (never assumed) sky colour/luma model. It seeds on
  the smooth pixels along the display-top edge, learns the model robustly
  (median + MAD), floods down while pixels stay near it (non-level horizons and
  vertical gradients pass for free — no line fitting), then re-adds enclosed
  holes (sky through branches). The connectivity work runs once in JS (sky.ts)
  and bakes a WEIGHT BITMAP, sampled through the existing brush-mask path — so
  there is NO sky-specific shader math and GPU==CPU is automatic. Reach loosens/
  tightens the grow, Feather softens the edge, Invert grades everything but the
  sky; no-sky frames say so and stay inert. Spatial, so skipped in the .cube LUT
  like the other masks. GPU==CPU verified ≤1 LSB (solo/inverted/stacked/strong-
  adjust) on canopy/lodge/hillside, plus rendered proof and a real add→grade→
  invert→undo UI flow (foliage provably untouched).
- [ ] **Mask by subject / background** — auto-select the subject or the
  background (owner request 2026-07-05). Honest scoping: true subject/background
  segmentation needs an on-device ML model (WebGPU — the "frontier" backlog
  item); there is no classical stand-in the way sky had one. Architect as a mask
  type so it slots into the same engine when ready.
- [x] **Local masking** — radial + linear gradient + **brush** masks (up to 4),
  each with local brightness/contrast/saturation/hue/warmth. Radial/linear are
  dragged with handles; the brush is painted on the photo (Paint/Erase, size,
  Clear; one stroke = one undo step). Same math in shader + compileEdit (verified
  GPU==CPU ≤2 LSB across radial/linear/brush/stacked/inverted); export applies
  them, the .cube LUT skips them (spatial, like denoise/glow). The core
  paid-editor capability, now free. (Later: full adjustment set per mask.)
- [x] **IR hot-spot & vignette correction** — a radial luminance gain in linear
  space after WB (`radialGain`): Hot-spot (+ size) darkens the centre to cancel
  the IR-converted lens's hot-spot; Vignette brightens (correct) or darkens
  (add) the corners. Circular IN PIXELS (aspect-corrected; hot-spots are
  optically round), r = 1 at the frame corner. IR-native — no general editor
  does the hot-spot. Spatial, so skipped in the .cube LUT like masks/denoise/
  glow. GPU==CPU ≤1 LSB; pixel-circularity verified on a non-square frame. In
  the "IR lens fixes" panel. (Colour-cast hot-spot correction could follow.)
- [x] **Global Luminance slider** — one overall lift/drop on top of the tone
  curve. The five-point tone curve (Blacks/Shadows/Midtones/Whites/Highlights)
  already covers those bands (owner decision 2026-07-04), so no separate
  Lightroom-style range sliders — Luminance is the only new tone control.
  Display-space pow (endpoints pinned, no clipping); in the Tone curve panel.
- [x] **Reset** — return the whole edit to the fresh-open automatic baseline.
  Header button; snapshots the baseline at open, restores it, itself undoable.
- [x] **Go back (undo)** — step backward through edit changes. Header button;
  slider drags coalesce into one step, discrete actions are atomic.
- [x] **Save / Load my look** — five memory slots (My looks panel) that persist
  across sessions in localStorage. A slot stores the CREATIVE grade only (swap,
  hue, sat, contrast, tint, glow, per-color, tone, luminance) — NOT the per-shot
  white balance / exposure / denoise (owner decision 2026-07-04) — so a look
  drops onto any photo on top of its own balance, like the built-in Looks.
- [x] **Live histogram** — floating, unobtrusive RGB + luminance readout near
  the image (Lightroom-style: red/green/blue with white where they overlap),
  updates as edits change. Toggle in the header; preference remembered.
- [x] **Roadmap + patch-notes hub** — the ⓘ dialog now shows the next-release
  roadmap and the latest updates, each with a "More" link to the full history
  and notes on GitHub.

## Future / bigger bets (backlog, 2026-07-05)

> Not parsed into the in-app roadmap (only "Next capability release" is) — this
> is the fuller backlog reachable via the ⓘ dialog's "More → full notes" link.
> Positioning (recalibrated 2026-07-05, per Noah): the pitch is NOT purely
> "beat the subscription" — Affinity Photo 2 went free (Canva, late 2025). The
> real moat is: **free, on-device, no account, no install (runs in the iPad
> browser), and IR-native** — the channel-swap / sub-2000K WB / hot-spot work
> that no general editor does at all (free or paid), plus things the IR/stacking
> specialists still charge for (Helicon/Zerene). Almost all classical DSP that
> fits the existing per-pixel GPU shader + CPU mirror — no ML, no server.

Classical, subscription-grade tools (fit the current architecture directly):
- [x] **Clarity / Dehaze** (shipped 2026-07-05; dehaze reworked same day after
  iPad testing found colour shifts — now hue-preserving: luminance-only veil
  subtraction, all channels scaled alike) — in Hue/Saturation/Tone.
  Per-image low-res maps (localmap.ts): clarity = exposure-invariant ratio vs
  blurred luma; dehaze = dark-channel veil subtraction. GPU==CPU ≤1 LSB; part
  of saved looks; rebuilt at full res on export. **Texture** (fine-radius local
  contrast) folds into the Detail-sharpening item below — it needs pixel-
  neighbourhood taps, not a low-res map.
- [x] **8-channel HSL colour mixer** (shipped 2026-07-05; reworked twice same
  day from iPad testing: (1) saturation became a power curve s^(1/slider) so
  low-sat IR pixels move visibly, hue ±60, lum 0.3–1.7; (2) moved to DISPLAY
  space — it classified linear mid-pipeline hue, which is not the hue on
  screen, so chips felt unbound — and gained "Pick color from photo": tap the
  image, the owning chip selects itself) — Color mixer panel:
  8 chips (R/O/Y/G/Aqua/B/Purple/Magenta), hue/sat/lum per chip, smooth
  adjacent-band blending. Targets displayed colour (doesn't follow the swap);
  bakes into .cube (non-spatial). GPU==CPU ≤1 LSB over the full hue wheel;
  band isolation verified (neutral bands exactly untouched). Looks reset the
  mixer; saved looks carry it. Per-channel R/G/B CURVES remain open below.
- **Per-channel R/G/B point curves** — extends the luminance tone curve to
  independent channels; same per-pixel model.
- **Crop / straighten / perspective (Upright)** — geometry via the vertex
  shader we already rotate in; crop is a display+export region.
- **Detail sharpening** (unsharp / deconvolution) — mirror the existing 5×5
  bilateral pattern (shader + CPU export).
- **Heal / clone** for sensor dust & hot pixels — clone-stamp first,
  content-aware later.
- **Copy settings + batch apply/export** across a folder — builds on the
  snapshot system shipped 2026-07-04; no ML.
- **Channel mixer (full 3×3)** — custom false colour beyond the R↔B swap;
  IR-native, per-pixel.

Known gap — FIXED 2026-07-05:
- [x] **sRGB ICC on export, both formats.** JPEG (`canvas.toBlob`) and the
  hand-written 16-bit TIFF (`writeTiff16`) were both emitted UNTAGGED. Now every
  export embeds a minimal valid sRGB profile (`src/icc.ts`: sRGB primaries,
  gamma-2.2 TRC = what the pipeline writes, D50 PCS) — JPEG APP2 `ICC_PROFILE`
  segment, TIFF tag 34675. Verified byte-exact (profile parses; colorants + TRC
  decode correctly; both round-trip). This is shared-core for the macro mode too.

Frontier (needs WebGPU + an ML model — a real departure from pure-JS/no-WASM):
- AI denoise, AI subject/sky masking, super-resolution. Cheaper classical
  stand-in first: Lanczos super-resolution, edge-aware upscale.

Second discipline:
- **Macro (focus-stacking) mode** — a parallel mode in the same codebase.
  SHIPPED (2026-07-06, JPEG-first): the two-door split (`/` chooser →
  `ir.html` + `macro.html`, per-route manifests, route-based code-splitting so
  the ~7 KB stacking engine never loads for IR users and the 100 KB IR editor
  never loads for macro users) and a working JPEG stacker — streaming, memory-
  safe (peak RAM independent of frame count) with coarse translation align.
  ENGINE = COLOUR GUIDED-FILTER DEPTH MAP: per pixel pick the sharpest frame
  (per-channel RGB focus measure), then refine the selection with a guided filter
  guided by the stacked COLOUR image so depth transitions snap to real petal
  edges — gather whole pixels. Can't halo (no band mixing) or veil (no
  averaging), and — unlike a plain mode-filter selection — no bright "cut-out"
  RIM on thin petals over the blown background (Noah caught the rim in IMG_5958;
  the mode-filter's box-blurred measure bled the selection past the edge). Colour
  guidance is essential: luma guidance softens the magenta petals. Fast guided
  filter (subsampled coeffs, full-res guidance) keeps it memory-safe at 20 MP.
  Earlier dead ends on file: soft mean (veil), Laplacian pyramid (halos, IMG_0934). Full-resolution
  export SHIPPED and simplified: same per-pixel method at native 20 MP, two
  memory-bounded streaming passes, NO tiling (so no seams), in a Web Worker
  (`export.worker.ts`, UI stays responsive), two-phase Save for the iOS fresh-tap
  share rule, ~30 s/stack in headless software decode (faster on device).
  Verified on Noah's real 11-frame Z50 II set: no halos (high-mag petal-edge
  crop), smooth bokeh, sharper than any single frame. Next refinements: breathing
  scale/rotation align (this set was tripod-steady, drift ≈0), and an optional
  confidence floor to push subject crispness further.
  DEFERRED — **RAW (NEF) input**: the Z50 II shoots **High-Efficiency NEF**
  (confirmed by Noah; ~14.5 MB / 20 MP), a TicoRAW-class codec `nef.ts` cannot
  decode; a HE-NEF decoder is a separate large effort. Macro mode is named
  **"Macro Studio"** (flower icon, `public/macro-icon.svg` + 180/512 PNGs for
  iOS home-screen). The IR-mode iOS PNG icon is DONE (2026-07-13:
  `ir-icon-180/512.png` rasterized from the unchanged icon.svg, wired into
  ir.webmanifest + ir.html — iOS ignores SVG manifest icons, so "install
  Infrared alone" used to land a page-screenshot icon). Still open: the
  umbrella/chooser name (placeholder "Photography Studio").
