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

- [ ] **RAW practice photos for every lesson** — owner ask 2026-07-14, given
  with the dust-release GO: the next release brings the RAW (binned-DNG)
  versions of the library frames, and each practice photo opens on ITS OWN
  lesson. The plumbing already exists from the dust release: the scratchpad
  `bin-dng.ts` pipeline (NEF → 2×2 same-colour-binned half-res uncompressed
  DNG, ~10 MB, under the 25 MB Pages limit), `GalleryTile.lesson` (home
  lesson per tile), and the ONE-TILE-PER-SCENE rule (binned DNG REPLACES the
  scene's JPEG tile — never side by side; owner called out the duplicate).
  WAITING ON: the owner uploading the NEFs (session repo access can't add
  files; he uploads to the chat, one or a zip at a time — full-res originals
  never enter the repo, only the binned DNGs do).
  DESIGN DECIDED (owner pick, 2026-07-14): TAG TILES FREELY — each tile
  names the lesson it opens on (`GalleryTile.lesson`), several photos may
  share a lesson, everything untagged defaults to Lesson 1. No "sets"
  machinery (the owner's own "gets complicated" caution), no one-frame-per-
  lesson constraint. Lessons stay SKILLS that work on any frame — the
  mapping only decides where a tap lands you. Sessions propose a sensible
  mapping for his approval as frames arrive.
  FIRST WAVE SHIPPED to staging 2026-07-14 (cache ips-v40 → ips-v41): the
  owner uploaded five zips (NIR_1638/1687/1701/1708/1822 NEFs, all Z50);
  all five binned to 10.4 MB DNGs in public/examples/. GALLERY is now 22
  tiles = 9 RAW + 13 JPEG, with a `galNef` helper and the six binned-DNG
  tiles in LESSON ORDER so the grid reads as a curriculum — every lesson
  now has its own RAW home frame: ① Lakeside beach (1638) ② White forest
  (1701 — REPLACED its JPEG tile + red camera-look thumb; the RAW opens
  neutral, so the old thumb would have lied) ③ Lone pine (1822, portrait)
  ④ Wooded shore (1708, portrait) ⑤ Picnic still life (1687) ⑥ Lakeside &
  sensor dust (1675, unchanged). New thumbs are app-faithful auto-balanced
  renders (exact grayWorldWB/autoExposure mirrors over the app's own decode,
  400px via the headless-Chromium JPEG step — the NIR_1675-thumb style).
  VERIFIED headless: bin pipeline 14/14 (fail-first; writer byte-identical
  to the shipped reference over header+tags+matrix) and a 15/15 built-app
  walk (22 tiles, all thumbs decode, each of the six RAW tiles opens the
  editor ON its lesson chip and renders, no page errors); tsc + vite clean.
  NEEDS THE OWNER'S HANDS on the iPad: decode speed/feel of the new DNGs,
  the thumb look, the lesson-order grid reading, and his verdict on each
  frame↔lesson pairing (session proposal, easily re-tagged). STILL WITHOUT
  RAW TWINS: NIR_1665/1706/1716/1721/1808/1825/1827/1864/1866 + the four
  D5300 magenta frames (different camera — matrix/levels must come from
  those NEFs when they arrive).
  PIPELINE REBUILT this session (previous scratchpad was reclaimed):
  scratchpad `bin-dng.ts` + `test-bin-dng.ts`, rebuilt from this entry's
  spec + a byte-level dump of the shipped `public/examples/NIR_1675.dng`.
  Proven 14/14 (fail-first): exact 2×2 same-colour binning, round-trip
  through the app's OWN decoder (Tiff + readMosaicedCfa), and the writer's
  header + 17-tag table + colour matrix BYTE-IDENTICAL to the shipped
  reference (first 290 bytes; same total size for the same frame). Drive
  note: the owner's Google Drive is connected but direct HTTP download is
  proxy-blocked and the MCP tool returns base64 (unusable at 25 MB/frame) —
  chat zip uploads remain the delivery path. The Drive "Hotspot test shots"
  folder (NIR_1597–1619 + Archive.zip) is a DIFFERENT project, not the
  gallery RAWs.
- [x] **Dust & spot removal** — heal sensor dust and hot pixels, the classic IR
  pain (dust shows worst in smooth skies). Owner ask 2026-07-14; graduates the
  "Heal / clone" backlog item into the queue. Classical — no ML, no server.
  SHIPPED to staging 2026-07-14 (cache ips-v34 → ips-v35).
  WHAT SHIPPED: a "Dust & spots" cluster in the Basic tab. Arm **Heal spots —
  tap the photo** (a sustained mode: standing bottom banner tap-to-exit, like
  colour-pick — bottom because dust lives in skies and a top banner would eat
  those taps; pan/pinch stay LIVE so you can zoom right into a mote, unlike
  TAT which owns the canvas). Tap a mote → heal.ts auto-picks the best clean
  SOURCE patch from a ring search (16 angles × 3 distances; scored by
  surround-annulus SAD — the spot itself holds the defect so it can't vote —
  plus a smoothness penalty so an edge never gets cloned onto sky), then a
  feathered clone (weight 1 inside 0.45·r, smoothstep to 0 at r). Dashed ring
  markers ride the photo while armed (SVG #healOverlay, imageUvToClient like
  the mask overlay); tapping a ring REMOVES that fix (direct manipulation);
  one tap = one undo step; a Spot-size slider (r stored as a fraction of image
  width, 0.002..0.035); "Clear all heals" is one undo step. **Visualize
  spots** = a shader-only high-contrast luminance high-pass view (u_spotVis;
  reads the healed texture so a fixed spot visibly disappears; preview-only,
  no CPU mirror needed). **Find spots automatically** = detectSpots in heal.ts
  (box-blur high-pass, MAD noise floor, 4-connected blobs, dust-sized +
  compact); two field-found honesty filters matter: (1) the smooth-region test
  must be a DENSE ring of RAW luma just outside the mote — dust floats in
  clean sky so its ring is flat, while a twig tip's branch must CROSS the ring
  and foliage is busy all round (a sparse ring on the BLURRED plane happily
  "healed" twig tips — blur averages thin branches away, and a mote depresses
  its own blur); (2) DARK blobs only unless hot-pixel tiny (rBlob ≤ 2.5px) —
  the small bright things in a sky are cloud wisps, i.e. real content. The
  whole auto pass is one undo step, arms heal mode so every find is a
  reviewable ring, and says so honestly when it finds nothing. Spots live in
  EditParams.spots ({x,y,r,dx,dy} in image-uv), reset on a new open like
  masks, are NOT in saved looks/built-in looks/batch (currentLook/readSlot/
  batchParamsFor never carry them), DO persist in the session's durable edit
  JSON (tiny, unlike mask bitmaps) and ride liveEdits across session switches,
  and are skipped in the .cube/.dcp LUT by construction (never in compileEdit).
  ARCHITECTURE — ONE DELIBERATE DEVIATION from this entry's original sketch
  ("a spots uniform array in gl.ts"): a shader uniform loop is WRONG here
  because denoise (25 taps) and sharpen/texture (49 taps) sample the source
  texture — an in-shader heal is either invisible to their taps or costs
  taps×spots per pixel. Instead heals REWRITE THE SOURCE: main.ts bakes them
  into the GPU texture (heal.ts bakeRgba8/bakeRgbaF32 → Renderer.patchImage
  texSubImage2D, recomputed from the PRISTINE decode buffer on every spot
  change — previewSrc holds the exact buffer the texture was uploaded from,
  never mutated; syncSpotsToTexture runs in draw()'s rAF so undo/reset/
  session-switch/hotspot-reupload all self-heal), and export.ts applies the
  IDENTICAL patch math (healPatches8 reads back the same quantized bytes the
  preview baked; healPatchesFromSampler mirrors the f32 mix for RAW) wrapped
  under denoise/detail via wrapWithPatches. Zero per-frame GPU cost, unlimited
  spots, and every consumer (denoise taps, histogram, colour picks, thumbs)
  sees healed pixels automatically. Overlap semantics: spots always read the
  ORIGINAL source in list order — deterministic and idempotent under partial
  rebakes. The glow/clarity maps stay built from the UNHEALED source on BOTH
  sides (a mote is invisible to a coarse blurred map; healing must not force
  map rebuilds). Hold-Original note: heals are texture-baked, so — exactly
  like the EXIF hot-spot profile correction — they do NOT revert during
  press-and-hold compare; that's the established precedent for source fixes.
  VERIFIED headless (Chromium; scratchpad harness, fail-first proven by
  planting a wrong expectation which failed exactly as planted): GPU==CPU
  parity on an 8-bit source through the REAL exportImage path with a
  full-on edit (denoise+sharpen+texture+clarity+dehaze+glow+mask+mixer+lens):
  healed-vs-baseline outlier counts IDENTICAL (heal adds ZERO drift; the ~316
  >2-LSB pixels are the pre-existing map-builder asymmetry, present with heal
  off) and strict in-rect parity clean under the established near-black
  characterisation; RAW (canopy.dng, half-res mirror of the export chain,
  shared maps): max 1.84 LSB whole-frame, 0 over 2. Heal effectiveness:
  planted motes ~110–160 luma deep reduce to ≤3 residual. Auto-detect: 8/8
  planted motes recalled on smooth regions of a real teaching frame (~100ms at
  1600px); on the clean teaching set: dense-forest frame 0 detections,
  sky-heavy frames 0–4 small dark specks (cloud wisps no longer flagged —
  verified by eyeballing crop contact-sheets). Full UI walk on the built app
  (23/23): dormant on start screen, arm→banner, tap→ring+count, tap-ring→
  removed, undo, Visualize on/off restores exact render, auto-detect honest
  no-find message, banner exit, TAT↔heal mutual exclusivity, Home hides rings
  / Back restores them (spot intact), no page errors. tsc + vite build clean.
  NEEDS THE OWNER'S HANDS on the iPad: the heal FEEL (feather 0.45, search
  distances, default spot size 0.008), how aggressive auto-detect should be on
  HIS frames (real Z50 dust — all tuning so far is synthetic motes + the
  teaching JPEGs), Visualize contrast gain (×5), detectSpots RAM on a full
  2800px preview (~70 MB transient), and tap-accuracy of small spots on
  finger vs pointer. LATER (unchanged): content-aware gradient-domain blend
  for spots straddling an edge; manual clone-stamp (pick your own source).
  OWNER'S FIRST ON-DEVICE PASS (2026-07-14, staging — "works quite clever" +
  four tweaks, all shipped same day, cache ips-v35 → ips-v36):
  (1) NO SIZE FEEDBACK — you couldn't see the size before tapping, or adjust a
  fix after. Now the NEWEST heal stays ACTIVE (accent ring) and the Spot size
  slider resizes IT live — re-picking its clone source for the new radius,
  re-baking on the next frame, the whole drag one undo step via recordSoon —
  so the flow is tap-then-dial. With no active spot the slider shows a
  transient dashed preview ring at the centre of the view (zoom-aware), sized
  like the next tap. Auto-detect leaves no active spot on purpose (finds are
  reviewed by ring, not resized en masse); Clear/undo/remove clear or remap
  the active index.
  (2) RINGS DETACHED ON PINCH/ZOOM (fixes stayed put — they're baked into the
  texture — but the circles floated): applyZoom() repositioned the MASK
  overlay only. LESSON, now a comment in applyZoom: pinch/pan is a pure CSS
  transform with NO repaint — EVERY on-photo overlay must be retraced there,
  not just in draw(). positionHealOverlay() added beside positionMaskOverlay().
  (3) AUTO-DETECT picked wrong things and IGNORED HIS OBVIOUS SPOT. The
  obvious spot was a LARGE FAINT smudge — real dust at small apertures —
  invisible to the single-scale pass. detectSpots is now THREE-SCALE
  (fine / mid / coarse; mid+coarse dark-only), with three measured lessons:
  (a) the pass blur must sit ~2× ABOVE its target size or it tracks the
  smudge and erases it from its own high-pass (at blurR≈maxR the 20-24px test
  smudges never crossed threshold); (b) the noise floor for the wide-blur
  passes must come from a LOW quantile of |hp| (noiseQ 0.25-0.35) — the
  median reads foliage texture and inflated the threshold ~15× on a wooded
  frame; (c) a CROWD RULE for the wrong-things half: >15 similar-strength
  finds means the scan is reading the frame's own noise floor (the D5300
  magenta sky mottle produced exactly 40), so keep only outliers ≥1.8× the
  crowd's median strength. Verified: planted-smudge recall 2/3 (the third
  sits right against foliage and merges with it — a manual tap covers that),
  fine motes still 8/8, gallery sweep 0-4 finds per frame (hilltown 40 → 2).
  Owner is uploading THE REAL DUSTY PHOTO from his pass — tune the detector
  against it when it lands (his missed smudge becomes the regression case).
  All verified headless again: full parity suite (heal still adds ZERO drift)
  + UI suite grown to 32/32 (size-preview ring appears and fades, slider
  resizes the active ring 20.5→33.8, pinch-zoom scales the ring exactly with
  the photo 33.8→101.4 at 3×, tapSuppressed still eats the post-pinch tap).
  Harness gotcha for the file: synthetic PointerEvents have no active pointer,
  so setPointerCapture throws NotFoundError — stub capture in the test page
  before dispatching a simulated pinch.
  DETECTOR REBUILT ON THE OWNER'S REAL NEF (2026-07-14, same day — he uploaded
  NIR_1675.NEF, the frame from his screenshots; cache ips-v36 → ips-v37). His
  smudge measured rBlob 50-80 preview px at ~5% depth in open sky — and the
  session's synthetic tuning had been wrong on every axis. detectSpots is now:
  a 3-level PYRAMID (full/2×/4× planes; a huge faint smudge becomes a small
  strong blob, noise averages down), the fine full-res pass for sharp motes
  (σ-scaled threshold, tiny-bright hot pixels allowed) and dark-only smudge
  passes at 2×/4× with FIXED floors (0.03/0.028 — just under half the real
  smudge's depth, above the ~2% JPEG sky mottle). MEASURED LESSONS, each
  bought with a failure:
  (1) BOTTOM-HAT background (morphological closing, window maxR+2, separable
  van-Herk max/min) for the dark passes — a mean blur both TRACKS a big
  smudge out of its own high-pass (blur must sit ≳2× above the blob or the
  blob vanishes) and, near a bright treeline, paints a whole narrow sky band
  over-threshold (one giant connected region that swallowed every seed).
  Closing erases any dark blob smaller than its window yet follows brightness
  boundaries. The fine pass keeps the mean blur (its σ threshold is
  calibrated to it).
  (2) The OWNER'S UNIFORM-AREA RULE ("look for areas of uniform color before
  beginning smudge detection") is load-bearing twice: a BUSY MAP (gradient-
  magnitude outliers over the frame's calm-quartile grain, ABSOLUTE bar — the
  sqrt-encoded luma is variance-stabilized, and a relative bar made dark sky
  read 10× busier than bright ice) is downsampled per level into busy DENSITY,
  and the smudge passes seed AND grow only through calm blocks (busy country
  is a wall — stops structure bleed); post-merge, every find from every level
  must pass a CALM RING of density windows at full resolution (ring at
  1.3·rPx + winR + 4 — the margin matters, a sharp mote's own busy edge
  grazing a window cost it its own ring; window small, winR=5 — wide windows
  push the ring out of narrow sky bands). Gradient density, NOT mean
  deviation: two 2px twigs barely move a 67px window's mean (measured 0.013,
  "uniform") but every twig pixel is a gradient outlier; and NOT |L-blur|:
  a strong mote depresses its own blur and paints a busy HALO on clean sky.
  (3) Blob stats from the HALF-PEAK CORE, not the grown skirt (wide-blur
  skirts sprawl past any size cap); eccentricity from core moments rejects
  twig fragments/bark striations (lines, even with calm rings).
  (4) DUST DOESN'T SWARM: >3 neighbours within W/20 = shimmering surface
  (lake sparkle pushed ~30 blobs whose sheer count made the crowd rule
  execute the real smudge). Swarm-prune runs on the RAW merged set BEFORE
  other prunes (pruning first thins a swarm below its own bound). Crowd rule
  (>15 similar-strength finds → keep only ≥1.8× the median) stays as backstop.
  (5) A blob that FILLS its surround has no measurable background — physics,
  not tunable: an r≥20px smudge in the teaching JPEGs' ~60px sky strips is
  undetectable by any estimator, so the synthetic smudge-recall bar was
  retired in favour of THE REAL REGRESSION TEST: the parity harness fetches
  NIR_1675.NEF from the session scratchpad (skips honestly when absent — the
  full-res original never enters the repo; re-ask the owner if needed) and
  asserts the smudge is found at preview (2466,800) with r≥25 and ≤6 total
  detections. Current result: found at (2465,800) r=41, 3 detections, ~0.9s.
  VERIFIED: full parity suite green (heal still adds ZERO drift; fine-mote
  recall 5/6 — the biggest planted mote is a known marginal; the overlap pair
  is informational, twins busy each other's rings and a manual tap covers
  them), UI suite 32/32, gallery sweep 0-10/frame with every surviving find a
  faint dark round patch in smooth sky (the same class as the plausible real
  dust the NEF surfaced — these teaching JPEGs came from the same sensor).
  NEEDS THE OWNER'S HANDS: re-run Find spots on NIR_1675 on the iPad (expect
  the big smudge ringed first + a couple of faint companions), and his verdict
  on aggressiveness across his library.
  INTO THE LEARNING LIBRARY (owner ask 2026-07-14, same day; cache ips-v37 →
  ips-v38): NIR_1675 is now teaching frame #15 — tile "Lakeside & sensor
  dust" (after Lake & contrails; GALLERY is 18 tiles = 3 RAW + 15 JPEG) — and
  **Lesson 6 · Dust & spots** was added (tab "basic": Visualize → Find spots →
  rings → manual heal + resize → heals ride into export, never into looks/
  batch). The chip rail is fully data-driven from LESSONS, so chip ⑥ appeared
  with zero UI changes; Lesson 5's heal step now just points at Lesson 6.
  The teaching JPEG was rendered from the owner's NEF with the app's OWN
  export pipeline (generator in the session scratchpad: decode → gray-world
  WB + auto-exposure exactly as autoAdjust computes them → no creative grade →
  exportImage at scale 0.5 baked upright via the file's rotation → 1600px q80
  + the corner scrim/domain/NJ-line-mark watermark family style + 400px
  thumb). Full-res original stays out of the repo as always. VERIFIED: the
  detector finds the real smudge as the TOP find on the teaching JPEG at
  (457,191) upright (+6 faint real companions — this sensor needs a clean,
  which is exactly why it teaches well); an 11-check lesson-flow suite passes
  on the built app (tile + thumb render, 6 chips + Exit, chip ⑥ opens the
  card on Basic, Visualize flips the render, Find spots rings land ON the
  known smudge, honest status, no page errors); the main UI suite still
  passes with the shifted tile order.
  OWNER'S UPCOMING PLAN (2026-07-14): he will add RAW VERSIONS of all library
  frames. HARD CONSTRAINT to plan around: **Cloudflare Pages refuses files
  over 25 MB** — NIR_1675.NEF is 28.8 MB, so raw NEFs cannot deploy as-is.
  OWNER CHOSE BINNING ("You bin it", 2026-07-14) — PIPELINE BUILT AND FIRST
  FILE SHIPPED (cache ips-v38 → ips-v39): scratchpad `bin-dng.ts` reads the
  NEF with the app's own decoder (readNefCfa), bins the Bayer mosaic 2×2
  SAME-COLOUR (output phase (x&1,y&1) averages the four same-phase pixels of
  the matching 4×4 block — CFA phase preserved, optical dust untouched, noise
  halved), and writes a minimal little-endian uncompressed DNG (Compression 1
  — the dngRaw.ts path our bundled examples already use; single strip, 16-bit;
  tags 254/256/257/258/259/262/274(orientation from the NEF)/277/278/33421/
  33422(pattern)/50706/50714(black 1008)/50717(white 15520)/50721(Z50 colour
  matrix as SRATIONAL×10000)). NIR_1675.dng: 2800×1864, 10.4 MB. It's now the
  4th RAW tile "Lakeside & sensor dust · RAW" (rotation rides in the DNG's own
  tag 274 so the tile needs no rotate field). DE-DUPED same day (owner: "You
  duplicated it") — the JPEG twin tile was REMOVED, so the dust frame is ONE
  tile, the RAW (GALLERY = 18 tiles = 4 RAW + 14 JPEG; the 1600px teaching
  JPEG was deleted, its thumbs/NIR_1675.jpg stays as the RAW tile's thumb).
  Lesson-wise the owner also found it opening Lesson 1 — GalleryTile grew an
  optional `lesson` field and openGalleryPhoto opens the tile's HOME lesson
  (default 0); the dust tile carries lesson: 5, so tapping it lands straight
  on Dust & spots with chip ⑥ active. WHEN THE REST OF HIS RAW VERSIONS
  ARRIVE: replace each scene's JPEG tile with its binned-DNG tile (one tile
  per scene — the owner explicitly rejected side-by-side duplicates). VERIFIED: decodes through the normal app
  path (1400×932 preview), no CFA-phase artifacts, the real smudge is the TOP
  find at exactly (1232,400) = the NEF coords ÷2 — binning RAISED its
  signal-to-noise — and the in-app round trip (open tile → Find spots → rings
  + review) passes headless. Use the same script for the rest of his RAW
  uploads. Also remember: Z50 II High-Efficiency NEFs don't decode at all —
  his Z50 classics are fine.
  AUTO-SWEEP REVIEW MODE (owner feedback 2026-07-14: the rings read as
  "places someone still has to touch", and "the tap-to-heal menu shouldn't
  open unless someone is doing a manual tap to heal"; cache bump shared with
  the binning ship): "Find spots automatically" no longer arms heal mode.
  The fixes are already applied when the sweep ends, and the UI now SAYS so:
  SOLID accent rings (class heal-done — receipts, not the dashed to-do style)
  plus a "✓ N spots healed" banner — tap a ring to put that one fix back
  (one undo step each, never tap-WB mid-review), tap the banner to keep them
  all (rings retire; heals stay). Review is a state (healReview +
  setHealReview), mutually exclusive with the picture tools, cleared by fresh
  opens/Clear-all/arming heal manually, and dismisses itself when the last
  ring is put back. The heal-mode banner now appears ONLY when the owner arms
  Heal spots himself. Lesson 6 step 2 and the Help line reworded to match.
  VERIFIED headless: lesson suite grown to 21/21 (sweep → solid rings +
  review banner, heal button stays un-pressed and its banner closed, ring-tap
  drops exactly one fix, banner-tap retires rings but keeps the heals, the
  known smudge still ringed, RAW-tile round trip) + main UI suite still green
  (its sweep found 10 faint spots on a practice frame and the review path
  handled them).
- [x] **Learn on real photos — lessons ride on the picture** — owner ask
  2026-07-14 (his framing: instead of dedicated tutorial photos, "lessons that
  can be collapsed to 1, 2, 3 on top of the photo and when you touch them shows
  lessons 1, 2, 3"). SHIPPED to staging 2026-07-14.
  BACKSTORY: the owner had uploaded example IR frames that got stranded — 5 were
  committed to branch `example-ir-photos` (PR #10), 15 more were only PR-body
  attachments this session's egress policy (github.com/user-attachments → 403)
  could not fetch. He re-uploaded the keepers directly. Teaching set started at
  13, grew to 15, then trimmed to **14 low-res frames** in
  `public/examples/gallery/` (1600 px long edge, q80; full-res originals never
  enter the repo): 10 red-filter Z50 (forests, skies, a lakeside with contrails,
  close-up foliage + two later foliage-texture adds NIR_1864/1866; 2 portrait) +
  4 full-spectrum Nikon D5300 (lens-mounted IR filter, unknown wavelength) with a
  magenta look and the only non-forest subject (urban hilltown; a night water
  tower was in this set but was removed as the weakest teacher — owner call
  2026-07-14).
  Each carries a small bottom-right watermark (NJ mark + jefferson-photo-studio
  .pages.dev over a scrim, corner-only, croppable) so shared frames point back
  to the tool. PR #10 was CLOSED so its full-res originals never publish.
  IMPLEMENTATION: a "learn mode" where a rail of numbered lesson chips ①–⑤ rides
  on the photo (src/main.ts LESSONS/GALLERY; ir.html #lessonChips; .chip/.gallery
  -list in style.css). A lesson is a SKILL not a scene, so it works on any frame
  and reuses the existing #lesson card + panel-expand mechanism: 1 White balance,
  2 Swap & Looks, 3 Sky & clouds, 4 Color tools, 5 Detail & finish. Tapping a
  chip opens its card (positioned below the rail, robust to wrapping) and unfolds
  exactly that lesson's panels; tapping the active chip or "Got it" collapses it,
  chips stay. FOLLOW-UP (owner 2026-07-14): the 3 original DNG lesson cards were
  REMOVED and FOLDED INTO the grid as three RAW tiles (Golden canopy · RAW / Motor
  lodge · RAW / Hillside & sky · RAW, using their existing .png previews) so the
  grid is the single teaching surface AND the true-RAW / sub-2000K crux (which an
  8-bit JPEG can't show) is still taught. So GALLERY is 17 tiles = 3 RAW + 14
  JPEG; openGalleryPhoto handles both (tile carries kind/file/thumb/rotate; RAW
  tiles apply their fixed display rotation after the edit is established). The old
  EXAMPLES map + loadExample + openImported + the .ex cards were deleted (dead).
  "✕ Exit lessons" drops the rail to edit freely; Home hides the rail but keeps
  learnMode so Back restores it. Gotcha fixed: the global `button { width: 100% }`
  made the chips stack full-width — `.chip` needs `width:auto; flex:0 0 auto`.
  WATERMARK (owner ask 2026-07-14): each low-res JPEG carries a small bottom-right
  NJ mark + jefferson-photo-studio.pages.dev over a scrim, BAKED INTO the pixels
  (so it survives into an exported/shared photo — an overlay wouldn't, and export-
  stamping would be real work). It recolors with edits; owner OK'd that as the
  cheap, correct trade (white text stays legible through swap/sat/hue). RAW tiles
  are unwatermarked (can't bake into raw). Magenta-woodland was shot a quarter
  turn off — corrected upright in the file (owner said teaching Rotate on a broken
  frame was obtuse). Cache bumped ips-v26 → ips-v30 (frames added, then water tower cut).
  VERIFIED headless (Chromium, negative-control proven — chips hidden on the
  start screen, shown only after opening a practice photo; a wrong chip-count
  expectation made the suite FAIL first): 13 gallery tiles; opening one raises
  the editor + a 6-chip rail (5 lessons + Exit), auto-opens Lesson 1 with fsWb
  expanded / fsMasks collapsed; chip 3 switches to Sky & clouds (fsMasks expands,
  fsWb collapses, chip 3 marked active); chips sit compact and the card drops
  below the rail; Home hides the rail, Back restores it; Exit keeps the photo but
  drops the rail; no page errors. tsc + vite build clean; learn-mode screenshotted.
  NEEDS THE OWNER'S HANDS on the iPad: the chip rail's feel over the photo
  (landscape vs portrait wrap), tapping a lesson mid-edit, and whether the
  watermark size/placement reads right. Optional gap noted: no true 720nm
  near-monochrome frame, so the B&W IR / HIE B&W looks still teach on a colour
  subject — add one if a white-forest frame turns up.

- [x] **Pick your Home-Screen icon** — offer a small set of icon styles and let
  the user choose which one their installed app wears. Likely mechanism: a
  picker on the launcher/install flow that swaps the `apple-touch-icon` link
  (and manifest icons) before Add to Home Screen — iOS reads the link at add
  time. PROVE the swap trick on a real iPad EARLY (a probe page with two
  choices) before building the full picker; if iOS caches the first icon, the
  fallback is per-style install pages. Owner ask, 2026-07-13.
  PROBE SHIPPED 2026-07-13 (stays unchecked — the full picker isn't built yet;
  this is the "prove it first" step): a temporary `icon-probe.html` route (linked
  discreetly from the launcher footer) with two deliberately opposite test icons
  — A (dark, colourful aperture) and B (light, graphite), each corner-tagged A/B
  and rasterized to 180px PNG via the headless-Chromium pipeline
  (public/probe-icon-{a,b}.svg → probe-icon-{a,b}-180.png). It runs BOTH
  candidate mechanisms so one on-device pass is decisive: (1) the live swap —
  picking a card replaces the `<link rel="apple-touch-icon">` node and the
  `apple-mobile-web-app-title` before Add-to-Home-Screen (link replaced whole,
  not just href-mutated, since some WebKit builds only notice a fresh node);
  (2) the fallback — two static one-icon-each pages `icon-a.html`/`icon-b.html`
  at their own URLs. Decision tree is on the page: A-app dark + B-app light ⇒
  swap works, build the in-flow picker; both same ⇒ iOS cached per page, ship
  per-style pages (the fallback the static links prove). Cache bumped
  ips-v15 → ips-v16. VERIFIED headless: swap mutates the live link/title/label/
  active-state and reverts, both preview PNGs decode at 180px, static pages carry
  distinct icons, no page errors. NEEDS THE OWNER'S HANDS — the actual iOS
  Add-to-Home-Screen behaviour is the whole point and can only be read on the
  real iPad: staging `/icon-probe` (or the launcher-footer link), add Icon A then
  Icon B, compare the two Home-Screen icons, then also add the two static pages
  and compare. Report which of the two outcomes happened; then we build the real
  picker and DELETE these four probe files (icon-probe/icon-a/icon-b .html + the
  probe PNGs/SVGs, their three vite inputs, and the footer link).
  ON-DEVICE RESULT 2026-07-13 — owner tested on the real iPad: "All worked
  perfectly." So the LIVE SWAP mechanism is CONFIRMED on iOS: rewriting
  `apple-touch-icon` (whole-node replace) before Add-to-Home-Screen DOES change
  the installed icon — no per-style-page fallback needed. NEXT: build the real
  picker (offer a small set of styles on the launcher/install flow; on pick,
  swap the `apple-touch-icon` link + manifest icons, mirror the whole-node
  replace the probe proved), then remove the four probe files + footer link +
  their vite inputs. Keep the probe live until the picker ships.
  PICKER SHIPPED 2026-07-13: a "Pick your Home-Screen icon" section on the
  launcher (index.html) offers three real Studio styles — SAME aperture
  silhouette, different finish so they read as one family: **Spectrum** (the
  full-colour default, studio-icon.svg), **Graphite** (light brushed-metal iris
  on silver), **Noir** (the same iris in dark machined metal on the near-black
  tile). Graphite/Noir are new SVGs + 180/512 PNGs rasterized via the
  headless-Chromium pipeline (studio-icon-{graphite,noir}{,-180,-512}). On pick
  (src/iconpicker.ts, wired from chooser.ts), it does the whole-node replace the
  probe proved — a fresh `<link rel="apple-touch-icon">` (and the SVG tab icon) —
  plus, for Android, swaps `<link rel="manifest">` to a generated blob manifest
  carrying the chosen icons at ABSOLUTE URLs (the default keeps the real static
  manifest.webmanifest; only non-default gets a blob). The choice is remembered
  in localStorage ("studio-icon-style") and re-applied on load, so the card shows
  the current pick and re-adding keeps the same icon. Scope is the LAUNCHER icon
  only — Infrared/Macro keep their own. The four probe files (icon-probe/icon-a/
  icon-b .html + probe-icon-{a,b}.svg/-180.png), their three vite inputs, and the
  footer test link are DELETED. Cache bumped ips-v17 → ips-v18. VERIFIED headless
  (20/20, negative-control proven): three cards, Spectrum active by default, pick
  swaps apple-touch-icon + SVG icon + blob manifest (icons absolute, 512
  maskable), choice persists across reload, switching back to Spectrum restores
  the static manifest, all icon assets resolve 200, no page errors; picker
  rendering screenshotted. NEEDS THE OWNER'S HANDS: the real iOS Add-to-Home-
  Screen with each style on the iPad (the live-swap was already confirmed by the
  probe — this just confirms the three finished icons look right installed).
  CHANGE-IT-LATER PASS 2026-07-13 (owner clarification: the picker read as
  install-time only; he wants to switch icons AFTER installing): on the web an
  installed tile's icon is BAKED at Add-to-Home-Screen — iOS never re-reads it,
  no JS/manifest change can repaint it, so "change it later" honestly means
  remove-the-tile-and-re-add. The picker now says exactly that, per surface
  (reusing share.ts isStandaloneApp): in the INSTALLED launcher (which has no
  Safari Share button) the live line explains hold → Remove → open in Safari →
  Add again, and that the saved pick will be waiting; in the browser it notes
  the remove-first step (the old copy said "pick a new one and add it again",
  which skips removing and strands the stale tile). Lead copy aligned. Cache
  bumped ips-v18 → ips-v19. TRUE in-place switching is native-only — logged in
  Future/bigger bets (alternate app icons; needs no server or secrets).
  NJ REBRAND 2026-07-14 (owner): the LAUNCHER now wears the new "NJ" aperture
  brand mark (six steel leaves, spectral ring), replacing the old
  Spectrum/Graphite/Noir aperture set. Final PNGs live in public/icons/
  (icon-{192,512,1024}{,-light}.png + apple-touch-icon{,-light}.png, dark tile
  #0c0d11 / light tile #f2eee6; plus nj-watermark-512 + nj-watermark-line-512,
  transparent, reserved for photo watermarks — NOT app icons). The picker
  (iconpicker.ts) now offers the two NJ FINISHES as the install options —
  **NJ Light** (default) then **NJ Dark** — same mark, different tile; the old
  studio-icon{,-graphite,-noir} files stay on disk but are no longer referenced.
  manifests use plain purpose "any" (the mark fills ~80% and its ring rides near
  the edge, so no maskable crop). SCOPE: LAUNCHER ONLY — Infrared (icon.svg/
  ir-icon-*) and Macro (macro-icon*) are deliberately UNCHANGED (owner corrected
  an over-broad first pass). No sw.js cache bump this release (owner asked for the
  smallest diff; new icons are at fresh paths so nothing stale is served on iOS
  AHS — the manifest is only cache-first for already-visited Android). Verified
  headless 31/31 (Light default, order Light→Dark, Dark→blob-manifest swap,
  switch-back restores the static manifest, IR/Macro assert NOT-NJ). Merged to
  main after the owner's on-device pass. an installed (standalone) PWA has
  NO Safari chrome — no address bar, no Share, no Back — so there was no way to
  send someone the link or even see it (owner ask, 2026-07-13). SHIPPED same day:
  a Share control that appears ONLY when running standalone (in the browser
  Safari already offers this, so we stay out of the way there) on all three
  installable surfaces — the IR top bar (next to Tutorials), the Macro top bar
  (next to ⓘ), and the launcher header (a "Share this app" pill). Tapping it
  opens the native share sheet for the current URL (its "Copy" is how you grab
  the link with no address bar); falls back to copying the link with a toast,
  then to showing it. Shared helper `src/share.ts` (isStandaloneApp via
  display-mode:standalone + navigator.standalone; setupInstalledShare reveals +
  wires the button) imported by all three entries; became a ~2 KB shared chunk,
  the launcher's chooser bundle stays tiny. Cache bumped ips-v16 → ips-v17.
  VERIFIED headless: button revealed only when standalone, hidden in-browser,
  native share carries this page's URL on IR/Macro/launcher, copy-link fallback +
  toast work, no page errors. NEEDS THE OWNER'S HANDS: the real iOS share sheet
  (glyph feel, that Copy/AirDrop appear) on the installed iPad app.
- [x] **Proper pre-filled install names** — Add to Home Screen pre-fills its
  name field from `apple-mobile-web-app-title` (falling back to `<title>`,
  which for the IR editor was the too-long "Infrared Photography Studio").
  SHIPPED 2026-07-13: each page now sets `apple-mobile-web-app-title` to the
  label you'd actually keep — Studio (index.html), Infrared (ir.html), Macro
  (macro.html) — so the Add-to-Home-Screen sheet pre-fills the short name
  instead of the long `<title>`. Android side aligned to match: the IR
  manifest `short_name` was "IR" (not the owner's stated "Infrared"), now
  "Infrared"; Studio/Macro already correct. Cache bumped ips-v14 → ips-v15 so
  installed apps pick up the new manifest (fetched cache-first). VERIFIED in
  the built `dist/` (all three meta titles + all three short_names + the cache
  bump). NEEDS OWNER'S HANDS: the real pre-fill only shows in the iPad Safari
  Add-to-Home-Screen sheet — confirm each page offers Studio / Infrared /
  Macro on device. Owner ask, 2026-07-13.
- [x] **See what you're opening** — photo SESSIONS (owner design, 2026-07-13):
  "Open image" takes one or several; the picked set becomes the current
  session — big tappable previews in-app, choose and switch from there, each
  photo keeping its own edit while you move around. Explicitly NOT a
  library/database ("I'm not interested in building databases") — impermanent
  by design, but "can't get lost 'too' soon". The structural consequence:
  iPad Safari cannot re-open a picked File after a reload (proven with batch
  Continue), so surviving a close/crash REQUIRES copying each photo's bytes
  into the app's own storage at open — the batchstore chunked crash-safe IDB
  pattern (bytes + per-photo edit params + a small strip thumbnail; RAM holds
  only the active photo's decode). Lifetime: relaunch offers "Resume session —
  N photos" (batch-recovery style); a new pick with a session present asks
  first (batch-leftovers confirm pattern); an explicit Done ends the session
  and frees the space. Quota guard + storage.persist() apply as-is; show an
  honest size readout (RAW ≈25 MB/frame — a 20-photo session ≈ 500 MB).
  Undo stacks stay in-memory per photo (edits themselves persist). Later
  synergy: "Process many" can draw from the session set.
  SHIPPED 2026-07-13 (staging). New crash-safe store `src/session.ts` (DB
  "ips-session", the same ≤30 KB-chunk + strict-durability shape batchstore.ts
  proved: source bytes chunked, one strict txn per photo; the tiny JPEG
  thumbnail + edit JSON ride inline in the meta row). In main.ts: openImported
  was split into `showDecoded` (decode-independent view/upload) +
  `establishFreshEdit` (auto baseline) so the single-open, example and
  session-switch paths share one core. A pick of ≥2 files becomes a session: a
  bottom-of-stage STRIP of big tappable thumbnails (src/style.css
  `#sessionStrip`), active one ringed in accent, size readout ("N photos ·
  ~M MB · viewing k") + a Done pill. Switching decodes the target on demand
  from storage (only ONE decode in RAM); the outgoing photo's edit is captured
  to an in-memory `liveEdits` map (FULL state incl. masks + undo, for live
  switching) and a durable masks-stripped JSON (`Session.setEdit`, for
  reload). Relaunch shows "Resume session — N photos" on the start screen
  (next to Recover); Done clears storage; a new pick over a live session asks
  add-vs-replace; storage always mirrors the live session (fresh starts clear
  leftovers, so no orphans reappear on resume). `storage.persist()` requested
  after an add; quota during an add stops gracefully with a note.
  SCOPING (v1, honest): a LONE open (one file) stays snappy + ephemeral exactly
  as before — the strip/persistence/resume engage only from TWO photos up,
  where switching and crash-survival matter; a length-1 leftover in storage is
  treated as an orphan and cleared at launch (single edits were never persisted
  before, and "Resume — 1 photo" reads oddly). Masks are kept in the in-memory
  liveEdit so they survive live switching, but — like a fresh open always has —
  they're dropped from the durable copy and reset after a reload; everything
  else (WB/exposure/denoise/grade/looks/hot-spot/clarity/dehaze/mixer) persists.
  Strip thumbnails are a neutral auto-WB'd ungraded render (identify the frame,
  not preview the grade), built on the main thread as each photo is added — a
  big RAW session hitches briefly while adding (a Web-Worker thumbnailer is the
  obvious follow-up). Loading a Tutorial ends the current session. Cache bumped
  ips-v19 → ips-v20.
  VERIFIED headless (20/20, the edit-restore assertion proven to FAIL first —
  it caught a real capture-ordering bug where seeding a photo's edit read the
  stale active id and clobbered the outgoing photo's edit): 2-photo pick raises
  the strip with two image thumbs + one active; a per-photo exposure edit is
  isolated (B keeps its own auto value) and restored on switch-back; adding a
  3rd grows the strip; RELOAD offers "Resume session — 3 photos", strip hidden
  until resumed, resume rebuilds the strip AND restores the durably-stored
  edit; Done frees storage (a later reload offers no resume); a single open
  shows no strip and leaves nothing to resume; no page errors. Strip layout
  screenshotted. NEEDS THE OWNER'S HANDS on the real iPad (all measurements are
  Chromium): a real multi-file pick from Files/Photos; the actual Safari IDB
  crash-durability of a mid-session close/relaunch → Resume (the whole point,
  and Safari's sidecar behaviour is unmeasured here); the size/feel of a big
  RAW session (add-time hitch, storage headroom); and the switch latency on a
  real 25 MB NEF decode.
  OWNER'S FIRST ON-DEVICE PASS (2026-07-13, staging — sessions themselves
  worked; three fixes shipped same day, cache ips-v20 → ips-v21):
  (1) The launcher showed "Share this app" in the PLAIN BROWSER (it must appear
  only when installed/standalone). Root cause is a CSS classic worth remembering:
  index.html's inline stylesheet had no `[hidden]{display:none !important}`
  guard, so `.share-app{display:inline-flex}` (an author rule) overrode the UA's
  [hidden] rule and the pill rendered despite the attribute. ir.html/style.css
  and macro.css already carry the guard — EVERY page stylesheet must.
  (2) The session strip COVERED the bottom of the photo, and pinch can't go
  below fit-to-frame to peek behind — so the strip now takes real layout room:
  updateSessionStrip() measures its height into `--session-h` + `.has-session`
  on #stage, and CSS shrinks the photo's fit box to the space ABOVE the strip
  (the colour-pick banner lifts above it too). The strip never covers the
  picture; pinch behaviour left as-is (min = fit).
  (3) NAMING: "Open image" now takes several, which collided head-on with
  "Process many" (batch). Renames (owner suggested the first): top bar
  "Open image(s)" (edit — one photo or a session) and "Batch export" (output —
  develop a set unattended → one .zip); welcome buttons + hints and the Help
  reworded to draw exactly that editing-vs-output line ("Batch export — develop
  a whole set at once" now opens by contrasting the two; the sessions themselves
  are documented under "The basics" step 1). The .zip filename stays
  IR-batch-N.zip.
  OWNER'S SECOND ON-DEVICE FINDING (2026-07-13 — navigation): after Resume (and,
  really, any open) there was NO non-destructive way back to the start screen.
  The editor's own start screen (#welcome, where Open/Resume/Quick look/Tutorials
  live) was only reachable via the "Tutorials" button — unguessable — and the
  only control ON the photo was the session's Done, which ENDS it. The old flows
  assumed the next action would always carry you where you needed to go. Fix
  (cache ips-v23 → ips-v24): a proper HOME affordance. A "⌂ Home" button in the
  IR top bar (a house SVG + label) and a prominent "‹ Back to your session
  (N photos)" / "‹ Back to your photo" pill at the top of the start screen (the
  tiny corner ✕ stayed too) — both wired to shared goHome()/returnToEditor().
  Home is NON-DESTRUCTIVE: it parks the live photo/session (captureActiveEdit
  first) and returns to the start screen with everything intact in memory AND
  storage, so Back — or a reload's Resume — drops you right back; Done stays the
  separate, destructive "end it and free the storage." goHome() also hides the
  session strip (it sits above the #welcome card) and returnToEditor() restores
  it; the header's Tutorials button now routes through goHome() too, so its
  re-opened chooser no longer lets the strip poke over the card. (The brand's
  "‹ Studio" link is unchanged — that still leaves the IR editor for the umbrella
  chooser; Home is the way back to the IR editor's OWN start screen.) VERIFIED
  headless (18/18, one assertion proven to FAIL first): the owner's exact path
  (Resume → Home → Back) works; Home leaves the session in storage (count stays
  2) while Done frees it (count 0); Home survives a reload as Resume; the ✕ and
  Back appear only when there's something live to return to; no page errors.
  NEEDS THE OWNER'S HANDS on the iPad: that Home reads as "start screen" (vs the
  ‹ Studio umbrella link) and the Back pill is obvious enough.
  FOLLOW-UP (2026-07-13, owner ask, cache ips-v24 → ips-v25): with Home now
  opening the start screen, the top-bar "Tutorials" button was redundant, so it
  was REMOVED from the IR top bar and moved INTO Help — a prominent "▶ Tutorials
  — learn by doing…" button at the top of the Help dialog that closes Help and
  routes through goHome() to the start screen where the lesson cards live (the
  cards themselves stay on the start screen — single source). The in-lesson
  "next lesson" hint (lesson-next) no longer points at the gone Tutorials button;
  it points at Home / Help. VERIFIED headless (10/10): no Tutorials button in the
  bar, no load-time error from the removed wiring, Help → Tutorials opens the
  start screen with the 3 lesson cards, and a lesson launches from there; the
  Home nav suite still 18/18. Promoted to main with the sessions + Quick look +
  Home release.
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
- [x] **Quick look** — see what's in a folder without loading a session or
  round-tripping a .zip (owner ask 2026-07-13, GO given same day; this is the
  pure form of his origin story: "white balance an entire folder so I could
  see what files I was actually dealing with"). Design agreed: pick files →
  decode a small AUTO-BALANCED preview of each straight from the picked Files
  → a full-screen tappable grid with filenames. NOTHING is copied to storage
  (unlike sessions) — previews live in RAM only, so it's instant to open and
  instant to Done, and honestly ephemeral: iPad Safari can't re-read picked
  Files after a reload, so a quick look lasts only until the tab closes —
  which fits "what am I dealing with?" exactly. From the grid, "keep these"
  promotes the CHECKED picks into a real session (the File objects are still
  alive in-page, so promotion just runs the normal addToSession copy). Build
  notes: reuse the session thumbnailer (makeThumb) at a bigger edge (~512px
  for a grid tile; maybe tap → full-screen single preview from the same File),
  decode sequentially with a progress readout and a yield per file (same
  pattern as addToSession), previews-only RAM bound; entry point on the start
  screen next to Open image(s) ("Quick look a folder…") and possibly inside
  the batch chooser as a cross-link. No storage, no cache implications beyond
  the usual sw.js bump. Consider the Web-Worker thumbnailer here first (the
  session add-time hitch note below) since quick look decodes many frames
  back-to-back.
  SHIPPED 2026-07-13 (staging). A full-screen grid overlay (#quickLook in
  ir.html; new .ql-* styles in style.css) opened from a "Quick look a folder…"
  label on the start screen (next to Open image(s)) AND a cross-link inside the
  Batch-process chooser ("Quick look instead →", by the Auto-balance option —
  the .zip sibling of a quick look). All logic in main.ts's Quick-look section:
  the shared makeThumb() gained a MAX-edge param (strip keeps 260; the grid
  uses 512), and openQuickLook() decodes each picked File in turn — importFile →
  decode → makeThumb, only the small JPEG kept, the decode + source bytes drop
  out of scope, so RAM stays bounded to N thumbnails — with a live "Decoding
  k / N…" readout and a yield per file (the addToSession pattern). NOTHING is
  written to storage (the whole distinction from sessions): previews are RAM-only
  object URLs, revoked on close, and a generation counter (quickGen) aborts an
  in-flight decode loop if you close or re-pick mid-run. A file that won't decode
  gets a dashed placeholder tile (⚠︎) instead of vanishing — transcoded JPEGs are
  NOT rejected here (that warning is for editing true RAW; a preview is still
  useful). Every decoded tile starts selected; tap to toggle, a Select all/none
  header toggle, and "Keep N in a session →" promotes the checked picks by
  handing their still-alive File objects to the normal openPicked() (one file →
  lone open, two+ → a real session) — no new copy path. VERIFIED headless (20/20,
  the tile-count assertion proven to FAIL first at expect-5): a mixed pick (3
  PNGs + 1 broken) → overlay raises with 4 tiles (3 previews + 1 placeholder),
  "3 photos", all three selected, Keep enabled reading "Keep 3"; deselect drops
  the live count + flips the toggle to "Select all"; Select all re-selects;
  Keep hides the overlay and raises the session strip with 3 photos + 3 thumbs;
  no page errors. Separately smoke-tested a real RAW canopy.dng through the grid
  (decodes to one preview, "1 photo"). Grid screenshotted. NEEDS THE OWNER'S
  HANDS on the real iPad (all Chromium so far): a real Files/Photos multi-pick,
  the feel of decoding a big folder back-to-back (the main-thread thumbnailer
  hitches on large RAW — the Web-Worker thumbnailer stays the obvious follow-up),
  and that "Keep in a session" flows straight into editing. Cache bumped
  ips-v22 → ips-v23.
- [x] **Batch process asks what goes on every photo** — owner feedback
  2026-07-13 (his origin story: he wanted to white-balance an entire folder
  just to SEE what files he was dealing with): batch used to silently take the
  on-screen edit — meaningless when nothing is open — and the "Batch export"
  name still read like a sibling of "Open image(s)". Now named **Batch
  process** (owner's word), and tapping it opens a CHOOSER dialog before the
  file picker: **Your current edit** (offered only when a photo is open;
  otherwise an honest "no photo is open" note), **A saved look** (the filled
  My-looks slots; none → a tip teaching open-a-photo → dial-it-in → save in My
  looks), **A built-in look** (all seven, resolved PER IMAGE exactly like
  pressing the look button — raw gets the full-strength recipe, JPEG the
  gentler one, and the look's WB bias rides on each photo's own auto WB, which
  the old current-edit-only batch never did for built-ins), or **Auto-balance
  only** — no creative grade at all, each photo just properly balanced: the
  quick-look-a-folder mode. The choice is stashed and the picker opens in the
  same tap gesture (iOS requires it). A footer states Format/Resolution come
  from Export and shows the current values. Both entry points (top bar +
  start screen) became buttons feeding one dialog; the hidden multi-file input
  stays. Cache ips-v21 → ips-v22. VERIFIED headless (37/37 total): no-photo
  state hides "current edit" and shows both honest notes, 7 built-ins listed,
  Cancel/outside-tap close, an Auto-balance-only batch develops 2 photos into
  a ready .zip, and after opening a photo + saving Slot 1 both "your current
  edit" and the saved slot appear. Dialog screenshotted in both states.
  QUICK-LOOK note for later: an in-app no-copy preview grid (decode small
  previews straight from the picked Files, no session storage cost) would
  serve "see what's in a folder" without the .zip round-trip — sessions
  already show auto-balanced thumbs but copy bytes to storage first; batch
  Auto-balance-only + a smaller Export resolution is the zip-based answer
  today. Owner to say if the grid is wanted.
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
  contrast) shipped folded into the Detail-sharpening item below (2026-07-14) —
  it needs pixel-neighbourhood taps, not a low-res map.
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
- [x] **Detail sharpening + Texture** (shipped 2026-07-14) — two new sliders in
  the Basic tab's "Detail" cluster (next to Denoise): **Sharpen** 0..1
  (high-frequency edge crisp-up) and **Texture** -1..1 (mid-frequency surface
  structure; pull left to smooth). Both are HUE-PRESERVING — a luminance-only
  gain from two Gaussian blurs of the neighbourhood luma (7×7, σ 1.0 / 2.0):
  sharpen = Lc−blurS (finer than σ1), texture = blurS−blurT (the band between,
  so it doesn't fight sharpen or Clarity's low band). Runs on LINEAR data right
  after denoise, mirroring the bilateral pattern: the GPU does it inline in the
  shader (u_sharpen/u_texture), the CPU export in a new `raw/detail.ts`
  (makeRowDetail, row-cached like makeRowDenoiser). Spatial (neighbourhood taps),
  so — like denoise/glow/masks — it is SKIPPED in the .cube/.dcp LUT and lives in
  the pre-pass, NOT compileEdit. Sharpen/Texture DO ride in saved looks + batch
  (unlike denoise: they're user intent, not auto-measured per photo). Shadow
  floor EPS=0.05 in the relative high-pass both tightens GPU==CPU parity and
  keeps sharpening from amplifying deep-shadow noise. Constants (KS=2.2, KT=2.4,
  R/σ/EPS/clamp) are shared between detail.ts and the shader — keep in sync.
  VERIFIED headless (Chromium): GPU==CPU parity — the detail-OFF pipeline
  baseline is ≤2 LSB and EVERY pixel differing by >2 LSB with detail on is a
  NEAR-BLACK channel (display-gamma amplification the pipeline already has;
  e.g. green 0 vs 4 under R=B=255), i.e. ZERO drift outside that regime; mean
  0.12 LSB; a negative control (GPU detail-on vs CPU detail-off) reads ~109 LSB,
  proving the harness detects the effect (it was made to FAIL first at a ≤2
  absolute bar before the near-black characterisation). Live UI walked from the
  start screen: opening a practice photo raises the Basic panel with Sharpen
  (0..1) + Texture (-1..1); moving each changes the render, and returning both to
  0 restores the exact original pixels (idempotent); no page errors; build clean
  (tsc + vite). Screenshotted at max — assertive but no crunchy haloing, sky
  stays smooth. NEEDS THE OWNER'S HANDS on the iPad: the slider FEEL and where
  the tasteful ceiling sits on real frames (KS/KT are eyeballed, not owner-tuned
  yet — the denoise curve took two feedback rounds, expect the same), the GPU
  cost of the 7×7 taps on a big proxy, and whether Texture's mid-band radius is
  the structure he wants. Cache bumped ips-v33 → ips-v34.
- **Heal / clone** for sensor dust & hot pixels — clone-stamp first,
  content-aware later. PROMOTED 2026-07-14 to the "Next capability release"
  queue as **Dust & spot removal** (owner ask) — see that entry for the plan.
- **Copy settings + batch apply/export** across a folder — builds on the
  snapshot system shipped 2026-07-04; no ML.
- **Channel mixer (full 3×3)** — custom false colour beyond the R↔B swap;
  IR-native, per-pixel.
- **UFOs in the trees — playful sticker compositing** (owner ask 2026-07-14,
  given right after the dust-release promotion; he'll open a NEW CHAT for it —
  next session, read this entry first). The idea: paste fun cutouts (UFOs,
  aliens, "other such fun things fitting for the weird colors") into a photo,
  including PEEKING FROM BEHIND things — which is the real requirement: an
  occlusion mask per sticker so scene elements (trees, branches) render in
  front of it, "behind or interacting with something".
  ARCHITECTURE SKETCH (deliberately rhyming with heal): a per-photo list of
  sticker placements (asset id + centre/scale/rotation in image-uv + an
  optional occlusion mask). Composite in LINEAR SOURCE SPACE before the
  pipeline — bake into the preview texture exactly like heal spots
  (patchImage rects from the pristine decode; syncSpotsToTexture pattern) with
  the identical math mirrored in the CPU export — so the sticker inherits the
  channel swap / sub-2000K WB / looks and lands IN the IR palette naturally
  (that's the owner's "fitting for the weird colors"; a display-space literal-
  colour mode could be a later toggle). Spatial + composition-specific: stays
  with the photo, never in saved looks / batch / .cube/.dcp — the whole
  spatial-op rulebook applies as-is. OCCLUSION: sticker alpha × (1 − mask
  weight), reusing the existing mask machinery — paint it with the brush-
  bitmap pattern, or auto-seed it from a colour/sky mask (e.g. pick the
  foliage colour and the branches occlude the saucer for free); the
  subject/background ML mask (backlog) would slot in here too when it exists.
  Direct manipulation placement (drag/pinch/rotate the sticker; sustained
  mode + banner + one gesture = one undo). ASSETS: draw a small in-house set
  (SVG → PNG with alpha, the icon-pipeline way — no third-party IP, consistent
  with the .dcp stance) + allow importing any PNG-with-alpha as a sticker.
  SCOPE CAUTION: this is "layers lite" — keep it stickers (no general layer
  stack), or it eats the app.
- **Playful warp tools — Swirl / Liquefy / Pinch** (owner ask 2026-07-14:
  "crazy tools like swirl or liquefy"). Finger-driven local GEOMETRY warps —
  a real departure from the colour pipeline, but classical and on-device:
  the natural architecture is a per-photo UV DISPLACEMENT FIELD at a working
  resolution (brush-bitmap pattern — strokes push/twist/pull vectors into the
  field), applied as a source-space remap at the very top of the shader
  (fetchLin(uv + field(uv))) with the same remap mirrored in the CPU export
  sampler. Spatial by definition → skipped in .cube/.dcp like masks/heal;
  composition-specific → stays with the photo, reset on open, never in looks
  or batch; one stroke = one undo (mask-brush pattern). Direct manipulation
  fits the house taste; needs a sustained mode + banner like heal/TAT. Watch
  GPU==CPU parity at the remap's bilinear taps (the brush-mask half-texel
  lesson applies doubly to a field that MOVES samples).

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

Native App Store build (the eventual target; carries over when it happens):
- **True in-place icon switching** — the web picker can only re-bake a tile at
  Add-to-Home-Screen; a native app switches its installed icon live via iOS
  alternate app icons (`setAlternateIconName`). Owner ask 2026-07-13 ("select
  an icon later"). NOTE for the owner's API/secrets worry (raised same day):
  this app needs NO API keys, servers, or data secrets even as a native build —
  everything stays on-device; the only credential involved is the Apple
  developer signing certificate to build and submit.

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
