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
  Future/bigger bets (alternate app icons; needs no server or secrets). an installed (standalone) PWA has
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
