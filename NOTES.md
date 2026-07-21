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
- [x] Display-P3 JPEG output (shipped as 1.4 — see the roadmap archive)
- [x] Per-color HSL (the per-color bands + the 8-channel mixer, shipped 2026-07-05)
- [x] B&W mode for 720nm (shipped as 1.2 — see the roadmap archive)
- [ ] Nice-to-have: RGBA16F preview texture (halve GPU memory); box-filtered
      downscale on scaled exports; LJ92 restart-marker path untested on real file

## Versioning (agreed 2026-07-04, promoted to 1.0 same day; taxonomy agreed 2026-07-18)

- THE TAXONOMY (owner rule, 2026-07-18): **identity → capability → increment**.
  - **Identity (major, X.0)** — the product changes as a thing: a different
    approach and mindset, a new edition. The owner declares these; he has
    declared the CREATIVE RELEASE the first one → it ships as **2.0**.
  - **Capability (middle number)** — a release that ADDS something: a new
    tool, format, mode. EVERY capability release that ships to main bumps it
    (owner decision, 2026-07-18): the core sweep goes 1.2, 1.3, … Bump the
    VERSION file IN the release's own final commit — the commit that changes
    VERSION displays as exactly the new base (versionFor, vite.config.ts),
    so the release commit reads "1.2" in the changelog.
  - **Increment (third digit, automatic)** — bug fixes and quality-of-life
    ticks between capability releases, from the commit counter. Features are
    NOT increments; if a shipment adds capability, bump VERSION with it.
  - Shipped history is NOT renumbered (the crop-chips release shipped under
    1.1.x before this rule and stays there).
- Pre-1.0 history is retroactively **v0.N** (N = update sequence number,
  derived from git commit count at build time — no manual list needed).
- The **VERSION file** declares the base ("1.0"); updates after it are
  automatic point releases: 1.0.1, 1.0.2, … Git tags are NOT used — this
  environment's git remote refuses tag pushes.
- The ⓘ dialog shows the running version and a version per changelog entry.
- CI must check out full history (`fetch-depth: 0` in deploy.yml) or the
  commit counts — and therefore the version numbers — come out wrong.
- The service-worker CACHE name is NOT a version and is never hand-edited
  (owner rule, 2026-07-18 — "tired of calling everything a version"): the
  build stamps it as `ips-<app version>` (vite.config.ts precache plugin
  replaces the placeholder in public/sw.js). Every deploy is a commit, so
  the version — and with it the cache — refreshes automatically; the old
  hand-numbered ips-v1…ips-v80 chore and its per-release bookkeeping are
  retired. Don't mention cache stamps in release notes or to the owner.

## Accessibility standing rule (owner mandate, 2026-07-17)

Accessibility is a TOP PRIORITY. Color-blind-inconsiderate design is a fail
state. Every new UI is designed against the checklist in CLAUDE.md from the
start; the a11y-walk harness (session scratchpad; axe-core + custom checks,
both themes, fail-first) runs before any UI release. Full audits (structural
+ color/CVD + repo, three agents, 2026-07-17) produced these durable
outcomes; the red baseline predating the fixes is archived in the session
scratchpad (a11y-baseline-red.json — 32/36 failing, incl. axe cross-checks).

NEVER-CHURN — patterns audited as CORRECT; keep them, don't re-fix:
aria-pressed on every toggle; labelled role=tab tablist; native <dialog> +
showModal() for help/info/batch; toast role=status; dynamic controls are
real <button>s; gallery alt="" + span-label; native range sliders; 44px
crop handles; decorative SVGs aria-hidden; lang=en incl. generated pages;
look-button state as TEXT (norm/R⇄B) not hue; mask-row text labels; roadmap
✓/○ glyphs; heal rings differ by LINE STYLE not hue; --txt at 17:1/11.6:1;
no outline:none anywhere; toast avoids red/green coding. (The theme toggle
was NOT correct — role=switch needs aria-checked, not aria-pressed; fixed
in the a11y release. Don't re-bless the old pattern.)
RANGE SLIDERS carry `touch-action: none` + a 22px thumb (style.css ~217) —
they OWN the finger gesture like every other drag control. Do NOT set
`pan-y` (it handed the drag to the panel scroller; a finger on the thumb
scrolled instead of moving it — owner-caught on the iPad 2026-07-19). The
panel still scrolls from label text + the gaps between rows.

CALIBRATED TOKENS (2026-07-17; change only with recomputed WCAG ratios):
--txt-3 #9095a1 dark / #6d6656 dawn (≥4.5:1 on their worst surfaces);
--line-2 rgba(255,255,255,.35) dark / rgba(40,32,20,.50) dawn (≥3:1 rails);
--line .18/.28 (decorative hairlines — deliberately below 3:1, never the
sole affordance); dawn --accent #2a63c4 (≥4.5:1 as link text);
--glass-bg rgba(10,10,14,.65) + --glass-txt #f2f3f6 are THEME-INVARIANT:
HUDs float over the PHOTO, so dark glass + light text is correct in both
themes (≥4.5:1 even over a pure-white IR sky). Tokens are defined in FIVE
places that must change together: src/style.css, src/launcher.css,
src/macro/macro.css (each :root + [data-theme="dawn"]), plus the inline
palettes in vite.config.ts (notes.html template) and privacy.html.

Known-exempt: disabled controls at opacity .4 (WCAG contrast exemption) —
recorded so it isn't re-audited. Deferred a11y work lives in the roadmap
queue (forced-colors; manifest screenshots — accessible overlays SHIPPED
2026-07-19, see the archive). Cheap
future option if regressions ever slip: a 5-line build guard failing on
user-scalable=no.

> CREATIVE-RELEASE GATE EXCEPTION (owner call, 2026-07-19): the Creative
> features (grade, mixer, stickers, warp) ship STRAIGHT TO MAIN as a beta,
> WITHOUT the usual staging on-device-pass gate — they're brand-new
> capabilities and the owner wants real users to see them, and he tests them
> in production ("I will test on Main"). He's especially excited about
> stickers. This exception is Creative-only; the hard staging gate still
> holds for changes to existing behaviour. Each Creative item is still fully
> headless-verified (unit + walk, fail-first) before merge.

## Next capability release (owner's roadmap, 2026-07-04; resequenced 2026-07-18)

> SOURCE OF TRUTH for the in-app Roadmap (behind the ⓘ button). `vite.config.ts`
> parses the `- [ ]` / `- [x]` checkbox bullets below at build time and injects
> them as `__ROADMAP__`; the dialog renders each item's TITLE — the full
> leading **bold span** (an inner em-dash is safe), else text up to the first
> " — ". Keep every roadmap item a single top-level checkbox bullet with a
> short bold title so the parser stays reliable. Editing this list updates
> the app on the next deploy. Both the roadmap and the patch notes (last
> commits) refresh automatically on push.
> Shipped items move to the "## Shipped (roadmap archive)" section below
> (same format, full SHIPPED records) so the in-app roadmap shows only
> what's genuinely coming; notes.html renders the archive as "Recently
> shipped". Keep this section to OPEN items only.
> QUEUE RESEQUENCED 2026-07-18 (owner decision, roadmap session): the
> CORE-COMPLETENESS SWEEP ships first — each capability release bumps
> VERSION (1.2, 1.3, … per the taxonomy in "## Versioning") — then the
> CREATIVE RELEASE, which the owner has declared an IDENTITY change: it
> ships as **2.0**, not 1.2 (owner call, 2026-07-18 — "an entirely
> different approach and mindset"). The big-image / full-bleed direction
> continues as the parallel design track below.

- [ ] **Creative — a third app for regular photos** — owner direction 2026-07-19
  ("a separate page next to infrared and macro, called creative, for regular
  photos, installable separately… same things we're building here… I suppose I
  will want a whole image editor there eventually"). A NEW entry point beside the
  IR studio and the macro tool: its own route + installable PWA (own
  manifest.webmanifest / start_url / icons / SW cache, added to the `/` chooser),
  aimed at ordinary visible-light photos rather than IR RAW. It REUSES the
  creative stack built up here — stickers (the two-kind library, adjust, blend,
  perspective), grade, channel mixer, warp — and grows "down from creative" into
  a full image editor over time. Big build; NOT yet scoped. OPEN QUESTIONS FOR
  THE OWNER before starting (all asked in chat, no pop-ups): (1) does it share
  the IR pipeline/renderer or start from a trimmed visible-light pipeline (no
  channel-swap / IR-WB); (2) is the first cut "stickers + grade on any JPEG/HEIC"
  or the full editor; (3) name/route/icon and whether it installs from the same
  chooser. Ships on its own once scoped — unrelated to the sticker betas.
- [ ] **Full-bleed alignment view — the tilted photo fills the screen** — owner-caught on device
  2026-07-16 (with the crop go-to-main; screenshot IMG_6201, Straighten @ 23.6°).
  While a geometry tool is armed, rotating and pinch-zooming CLIPS the photo
  inside the `#view` box: the tilted/zoomed photo is letterboxed and cut by
  `#view`'s rounded-rect edges, so black wedges show at the rotated corners and
  the alignment grid floats over the black margins — the picture is "boxed"
  instead of filling the screen. Mechanism: the armed preview renders into the
  contained `#view` canvas (`object-fit:contain`), so a tilted + `viewZoom`
  photo doesn't fill the axis-aligned `#view`. Owner's call: this gets fixed when
  the image is simply made completely visible below everything — i.e. it's
  SUBSUMED by the "Crop view: let the photo overflow instead of boxing it" and
  "Big image: the photo fills the app" items below (the photo becomes the
  full-bleed background and the tilt/zoom view stops clipping). No fix in
  isolation; presentation-only, nothing touches the pipeline or export.
- [ ] **Big image: the photo fills the app, menus float over it** — owner
  direction 2026-07-16, given as he ended the session and moved to a new one.
  STILL AN IDEA — he says so plainly, expect design questions. The vision: the
  open photo is the BACKGROUND everywhere in the app, not boxed inside a stage.
  The picture fills the screen (overflowing behind as needed) and EVERY control
  — the top bar, the editor drawer/tabs, histogram, lesson chips, crop aids,
  banners — FLOATS over it. One coherent feel across the WHOLE app, not just the
  crop tool. The "let the photo overflow" crop item below is the FIRST concrete
  instance of this pattern: build it as the pilot, learn the design answers on
  it, then generalise outward. OPEN DESIGN QUESTIONS to settle WITH HIM as it
  takes shape (don't guess these — they're his taste calls): do floating panels
  sit opaque over the photo, or scrim/blur the photo behind them for legibility
  (white controls over a bright IR sky need contrast)? how do the adjustment
  drawer and a full-bleed photo coexist in portrait, where the drawer claims
  ~45dvh today? is the photo always fit-to-screen, or can it pan/zoom freely
  under the chrome? what happens to the start screen vs an open photo — does the
  gallery also float over something? do the floating menus eat taps meant for the
  photo, or pass through where empty? NON-GOAL: nothing here touches the pipeline
  or export — it's a presentation/layout direction. Scope as its own design pass
  (likely several); the crop overflow-view ships first and proves the model.
- [ ] **Full-bleed crop — the photo flows behind the crop tools** — owner design
  question 2026-07-16 (the FIRST instance of the "big image" direction above):
  why must the photo be bound inside a "view box" (the
  letterboxed `#view` rect) at all while cropping? Could it simply OVERFLOW — the
  photo fills/extends behind everything, with the crop box, grid, Straighten pill
  and Done just floating over it (no black frame around the picture while you
  align)? Worth a future UI pass. Today the armed preview renders into the
  contained `#view` canvas (object-fit:contain, so a tilted/zoomed photo is
  letterboxed and `positionCropOverlay` maps the box onto that drawn rect via
  `viewImageRect`). An overflow model lets the GL canvas bleed to the screen
  edges behind the floating controls — the photo becomes the background, the aids
  float. This likely SUBSUMES the clamp bug above (photo fills the screen, box
  clamps to the photo). Non-trivial: canvas sizing, the box↔photo mapping, pinch
  anchoring, and the OS-edge insets (`.cropping`) all assume the contained
  `#view`. Scope as its own UI release; decide it alongside the clamp fix.
- [ ] **More composition overlays** — owner ask 2026-07-16, optional, for anyone
  who wants them: beyond the rule-of-thirds grid, offer selectable composition
  guides while cropping — golden-ratio (phi) grid, golden spiral, the diagonal
  method, a finer grid, and a centre cross. Thirds stays the default. Build
  notes: the guides are one element `#cropGuides` inside `#cropBox`, drawn as
  hairline CSS repeating-linear-gradients and toggled per focus by
  `.focus-crop` / `.focus-straighten` on `#cropOverlay` (main.ts `setGeoMode`,
  positioned in `positionCropOverlay`; styles in style.css). Add a small
  overlay-style picker (a cycle button or segmented control) in the crop tool
  that sets a class/data-attr on `#cropGuides`; each style is its own hairline
  background layer (the golden spiral needs an inline SVG, not a gradient). Keep
  them subtle (match `--line`), per-focus, and remember the last choice in
  localStorage like the panel tab. Non-goal: nothing touches the pipeline or
  export — overlay-only, exactly like the thirds grid.
- [ ] **Mask by subject / background** — auto-select the subject or the
  background (owner request 2026-07-05). Honest scoping: true subject/background
  segmentation needs an on-device ML model (WebGPU — the "frontier" backlog
  item); there is no classical stand-in the way sky had one. Architect as a mask
  type so it slots into the same engine when ready.
- [ ] **High-contrast modes — forced-colors and prefers-contrast** — a11y
  audit 2026-07-17. Low-likelihood platform (Windows High Contrast; the
  owner is iPad-first) but cheap insurance: active/selected states are
  bg-fill-only and vanish when forced-colors strips backgrounds. Add an
  @media (forced-colors: active) block giving active states a visible
  border/underline, and a prefers-contrast: more bump for --line/--txt-3.
- [ ] **Manifest screenshots** — repo audit 2026-07-17: add real screenshots
  to manifest.webmanifest for richer install/share sheets. Generate via the
  headless-Chromium pipeline (same as icons) from a good open-photo state;
  needs curated assets, so deferred from the setup pass.

## Shipped (roadmap archive)

> The completed "Next capability release" items, newest last, with their
> full SHIPPED/verification records — the project memory sessions must
> still read. Moved out of the queue section so the in-app roadmap parser
> (vite.config.ts, stops at the next `## `) no longer renders all of dev
> history to end users (share-readiness audit, 2026-07-17).

- [x] **Guide lines in Straighten & Crop** — owner ask 2026-07-15 (his third
  crop pass): thin-line overlays to align against, one per geometry tool.
  (1) STRAIGHTEN — reference lines to align a horizon or vertical bars against
  while leveling: a set of screen-true horizontal + vertical lines that stay
  level to gravity as the photo tilts under them, so you drag the horizon onto a
  line. (2) CROP — a rule-of-thirds grid (two thin lines each way) inside the
  crop box for composition. ALL THIN LINES — subtle hairlines that guide without
  fighting the photo. Build notes: overlay-only, no pipeline/export change. The
  two tools are already distinguished by `geoMode` ("straighten" | "crop",
  main.ts), so each overlay shows only in its own mode. The thirds grid rides
  the crop box (`#cropBox`) and re-lays as it's dragged (hook into
  `positionCropOverlay`, main.ts); the straighten guide is a fixed
  stage-aligned grid over `#cropOverlay`/the stage while straighten mode is live.
  Keep them hairline weight + low opacity (match the app's `--line`), maybe
  fading in only while a drag is active so they don't clutter the still preview.
- [x] **Tap the histogram to hide it** — owner ask 2026-07-15 (given with the
  crop go-to-main): tapping the histogram HUD directly should collapse/hide it
  (it floats over the top-right of the photo); the Histogram button in the top
  bar still brings it back as normal. Direct manipulation — touch the thing to
  dismiss the thing. WATCH: the HUD is currently pointer-events:none (it never
  eats taps meant for the photo) — hiding-on-tap means giving just the HUD its
  own tap handler while keeping the canvas underneath usable, or a small close
  affordance on it; keep the Histogram button as the single source of truth for
  the shown/hidden state so the two never disagree.
  SHIPPED (editing-polish release, cache ips-v55 → ips-v56): only the histogram
  CANVAS takes the tap (owner refinement "tap histogram, not whole hud") — the
  `#histWrap` wrapper stays pointer-events:none so its padding never eats photo
  taps; `#histogram` alone gets pointer-events:auto + cursor + a title hint. Its
  click routes through the SAME `histEnabled`/`ips-hist`/`updateHistVisibility()`
  path the Histogram button uses (button stays the one control that re-shows it),
  and only ever hides. VERIFIED headless (Chromium): tap hides + persists
  ips-hist="0" + aria-pressed flips, button brings it back.
- [x] **Crop controls should stand out + a rotate cue** — owner ask 2026-07-15
  (on-device, with the crop go): the Straighten slider and Reset crop button
  are easy to miss. He wants them to carry the "active" blue background like
  the "tap here" pill does (open to a better suggestion). AND a circle-arrow
  (↻) paired with the crop icon — both on the top-bar Crop button and at the
  bottom near Straighten — so it visually reads that rotation/leveling is
  possible. Build notes: the crop toolbar (#cropTools) is currently a neutral
  dark glass pill; giving it (or Straighten + Reset) the accent fill is a CSS
  change; the ↻ glyph can ride in the Crop button label and as a slider-end
  affordance. Keep Reset crop's disabled state honest (it greys when the crop
  is already identity).
  SHIPPED (same release): SOFTER accent first (owner refinement "try the softer
  accent for the bottom pill, first") — `#cropTools` now wears a blue-tinted
  glass (`var(--accent-soft)`) + a solid `var(--accent)` border with light text,
  reading as active but secondary to the solid-accent exit banner stacked above
  it (solid fill is the fallback if it's too subtle on device). Reset crop keeps
  an honest greyed disabled state (new opacity:.45 rule + accent outline). The ↻
  glyph rides both the top-bar Crop button and the Straighten label. VERIFIED
  headless: computed bg == accent-soft, border == accent, ↻ present in both,
  Reset disabled at identity crop.
  OWNER'S ON-DEVICE PASS (2026-07-15, staging, iPhone portrait — three fixes,
  all shipped same round, cache ips-v56 → ips-v57):
  (1) ICON CONFUSING. Root cause: the Crop button's ↻ collided with the Rotate
  90° button RIGHT NEXT TO IT (which already leads with ↻), and ↻▣ read as two
  mashed glyphs. Owner's call — "put crop, straighten, and rotate in one of the
  sub menus, or a new one, instead of the main menu." DONE: a new **"Crop" panel
  tab** (7th, full-width below the six adjustment tabs via
  `.ptab[data-tab="crop"]{grid-column:1/-1}`); "crop" added to PANEL_TABS +
  TAB_META (setPanelTab is generic, sections/tabs are DOM-queried, so it wires
  up for free). #rotateBtn and #cropBtn MOVED into that tab's section — SAME ids,
  so their handlers are unchanged; only the DOM home moved. In-tab there's no
  adjacent ↻, so Rotate keeps a clear "↻ Rotate 90°" and Crop is now plain words
  ("Crop & straighten"). Top bar is decluttered (both buttons gone from it).
  (2) LOCKED OUT — "the bottom opens and covers so much." In portrait the editor
  drawer (#panel, 45dvh) stayed open under the crop toolbar, squeezing the photo.
  FIX: `setCropMode` now sets `panel.hidden = true` while armed (restored on
  exit only when a photo is open, so the start-screen setCropMode(false) calls
  never bare an empty drawer). Reuses the EXISTING `#app:has(#panel[hidden])`
  collapse — zero new layout CSS; the stage goes full-height in both layouts.
  Exits (the "Tap here when done" banner + the Crop tab button) are unchanged.
  (3) BOTTOM PILL. Owner: "accent is good but the bottom pill needs work." With
  the drawer gone there's room, so #cropTools became a COLUMN: a header row
  (Straighten label · degree readout · Reset crop) over a full-width slider —
  no more thumb/readout overlap. Soft-accent tint kept; ↻ dropped from the pill
  (redundant now that Rotate is a labelled button in the tab).
  VERIFIED headless 20/20 (Chromium, iPhone-portrait 390×844 viewport; fail-first
  proven — planted "labels have RAW" + "drawer stays visible" both failed as
  planted; a real test bug was caught too — a landscape photo is width-limited in
  portrait so the CANVAS height barely moves, the STAGE is what grows): Rotate +
  Crop are off the bar and inside #panel; Crop tab reveals the section (title
  "Crop"); Rotate 90° swaps the canvas aspect and back; arming crop hides #panel
  and the stage gains >100px, banner shows; pill is column + full-width slider +
  soft-accent + Reset greyed at identity; exiting restores the drawer; prior
  release (histogram tap-hide, undo/redo walk, no "RAW" labels) still green; no
  page errors. NEEDS THE OWNER'S HANDS: sub-menu discoverability (Crop is now a
  tab, Rotate is two taps away — flagged the tradeoff), the drawer-hide feel on
  the real iPhone, and the redesigned pill's look/room.
  SECOND ON-DEVICE PASS (2026-07-15, staging, iPhone — three fixes, cache
  ips-v57 → ips-v58):
  (1) STRAIGHTEN SMEARED. "Straighten doesn't work — it smears." At larger
  angles the full-frame straighten PREVIEW didn't fill the viewport and the
  empty corners smeared the edge texel (the source texture is CLAMP_TO_EDGE).
  FIX: one guard at the top of the gl.ts fragment main() — if the resolved
  sample uv is outside [0,1], output `vec4(0.0)` (transparent) and return, so
  the dark #stage shows through cleanly (the webgl2 context is alpha:true,
  blending off). NO-OP for normal render + export: there the crop is
  auto-inscribed inside the image so uv never leaves [0,1]. Only the straighten
  preview's empty corners change — smear → clean empty space.
  (2) NO "MORE ABOVE" ARROW. The welcome card had only a down cue; the What's-new
  (ⓘ) dialog had none. Added: a `.welcome-cue.up` mirroring the down cue (sticky
  to the card's top, ▲, `.on` when welcome.scrollTop > 24, wired into the
  existing card `update()`); and sticky `.dlg-cue up/down` inside #infoDlg driven
  by a new `updateInfoCues()` on the dialog's scroll + on open (sticky resolves
  against the dialog's own scrollport — no position:relative, which would break
  modal centering; #infoDlg gained max-height:82vh + overflow-y:auto to match
  #helpDlg).
  (3) CROP TAB NAME. Owner: "'Crop' doesn't indicate what's in it; separate
  rotate and crop." Tab renamed **"Crop & rotate"** (TAB_META.crop.name + the
  full-width tab label; the "crop" key + saved-tab localStorage unchanged);
  Rotate 90° and Crop & straighten stay two separate, direct controls.
  VERIFIED headless 15/15 (Chromium, short portrait 390×720; fail-first proven —
  planted "up cue stays hidden" + "corner still opaque/smeared" both failed as
  planted): the straighten corner reads alpha 0 at 40° (transparent, not smear)
  while the frame is opaque at 0° AND at the centre (straighten still transforms
  — captured a clean-corners screenshot); welcome + dialog up/down cues toggle on
  scroll; tab + section read "Crop & rotate" with Rotate/Crop separate; drawer
  still hides while cropping, pill still a column, Reset greyed at identity, exit
  restores the drawer; no page errors. NEEDS THE OWNER'S HANDS: the straighten
  preview LOOKS clean on the real iPhone (Chromium corner-alpha is the proxy),
  the up-arrows read right, and the "Crop & rotate" name.
  THIRD ON-DEVICE PASS (2026-07-15, staging, iPhone — THE persistent misread,
  cache ips-v58 → ips-v59): the owner never wanted a COMBINED crop+straighten
  mode — he wanted THREE separate tools, each activated on its own. The old
  single "Crop & straighten" button armed one mode showing the box AND the
  slider at once ("fighting two controls"). FIX: split into two independent
  modes via a new `geoMode: "crop" | "straighten" | null` (main.ts). `cropArmed`
  stays a DERIVED `geoMode !== null` so the whole-frame render, canvas lock,
  `.cropping` inset and drawer-hide are untouched; only the box (Crop only) and
  slider (Straighten only) gates switch on `geoMode`. The Crop & rotate tab now
  has THREE buttons — Rotate 90° (instant), Crop (box only), Straighten (slider
  only). setCropMode→setGeoMode; the shared exit banner + pill relabel per mode
  (the `.tool-crop` class hides the slider row so Crop's pill is just its Reset).
  FLOW: tap a tool → drawer tucks away, that tool's UI appears → tap the banner
  ("done") to apply and return to the tab (the tool BUTTONS live in the drawer,
  so the banner is the exit — switching tools is done→tap-the-other, each opens
  on its own). VERIFIED headless 17/17 (Chromium, portrait; fail-first proven —
  planted "crop shows the slider" + "up cue stays hidden" both failed): Crop
  shows the box and NOT the slider; Straighten shows the slider and NOT the box;
  aria-pressed is mutually exclusive; the banner relabels per mode; straighten
  still tilts with clean (transparent) corners; drawer hides while a tool is
  live and the banner exit restores it; screenshot confirms Straighten = slider
  only, no box, no smear. NEEDS THE OWNER'S HANDS: that Crop and Straighten now
  feel like two separate one-tap tools on the real iPhone.
  FOURTH ON-DEVICE PASS (2026-07-15, staging, iPhone — cache ips-v59 → ips-v60):
  (1) CROP BOX DRIFTED OVER BLACK. Root cause: #view is the stage-shaped inset
  box and the photo is letterboxed INSIDE it by object-fit:contain, but
  positionCropOverlay + moveCropDrag mapped crop [0,1] across the whole ELEMENT
  (incl. the black bars). FIX: new `viewImageRect()` returns the photo's drawn
  sub-rect (contain math); the box places + clamps against THAT. No-op when the
  element already matches the photo aspect (headless), confines to the photo when
  letterboxed. (2) EXIT LOST + (3) CONTROLS COVERED. The tiny 10px "Tap here when
  done" on the separate `#cropBanner` overlapped the taller Straighten pill. FIX:
  removed the banner; the pill now carries a prominent accent-filled **Done**
  button (single bottom element, no overlap, obvious exit). (4) CORNER-ROTATE.
  Owner: "make each corner a place to rotate from" — chose IN STRAIGHTEN. So
  Straighten now shows the box too, and dragging any corner ROTATES (angle about
  the photo centre → params.straighten; slider stays as fine control); Crop's
  corners still resize. `setPointerCapture` wrapped in try/catch (can throw on
  synthetic/stale pointers). VERIFIED headless 21/21 (Chromium; fail-first proven
  — planted up-cue + box-confinement-under-forced-letterbox + corner-rotate all
  failed as planted): a forced 320×300 letterbox confines the box to the 213px
  photo band (not the black); Done removes the banner + exits + restores the
  drawer; a corner drag rotates in Straighten and resizes in Crop; smear-free;
  screenshot shows Straighten = box + slider + Done, no overlap. NEEDS THE
  OWNER'S HANDS: the box now hugs the photo on the real iPhone, Done is findable,
  and corner-rotation levels in the intuitive DIRECTION (sign easy to flip).
  FIFTH ON-DEVICE PASS (2026-07-15, staging, iPhone — cache ips-v60 → ips-v61):
  (1) "Make Done brighter" — `#cropDone` now font-weight 700 + an accent glow
  (`box-shadow: 0 2px 14px -2px var(--accent)`) so it pops off the accent-soft
  pill. (2) "Remove the circles on the Straighten corners, put arrows that move
  with the photo" — Straighten's corner grips are now thin white CURVED rotation
  double-arrows (circular two-way arrows — owner follow-ups: "thinner, arrow head
  both ways" then "indicate ROTATION not stretching", so a straight ↔ was wrong;
  Crop keeps the resize dots): `setGeoMode` toggles `#cropOverlay.straightening`,
  `positionCropOverlay` sets `--tilt = params.straighten` deg, and
  `#cropOverlay.straightening .crop-handle::before` swaps the dot for the arrow
  and `transform: rotate(var(--tilt))` so the arrows lean with the photo as it
  levels (updates live via the rotate branch in moveCropDrag). 44px hit targets
  unchanged. VERIFIED headless 25/25 (Chromium; fail-first proven — planted
  "arrows present" flipped as planted): Done computes weight 700 + a box-shadow;
  Crop corners stay round dots (no straightening class, no svg); Straighten
  corners are svg arrows and `--tilt` reads 40deg after a 40° straighten;
  screenshot shows the tilted arrows + the brighter Done. NEEDS THE OWNER'S
  HANDS: Done reads bright enough, and the arrow glyph/tilt DIRECTION feel right
  on the real iPhone.
  SIXTH ON-DEVICE PASS (2026-07-15, staging, iPhone — cache ips-v63 → ips-v64):
  the Straighten crop BOX was juting past the tilted photo into the black. ROOT
  CAUSE (diagnosed with a headless probe): the box maps params.crop across the
  axis-aligned full-frame rect, but `autoInscribedCrop` rotates the crop in the
  photo's STRETCHED pixel space while the shader tilts the photo in true VISUAL
  space — so for a non-square photo the "inscribed" box doesn't match the tilted
  edges (at 20°, two opposite box corners sampled alpha 0 = void). Owner's call:
  CLEAN TILT VIEW, NO BOX. FIX: in Straighten, `#cropOverlay.straightening
  #cropBox` drops its border + scrim + pointer-events (CSS), and
  positionCropOverlay places the rotation-arrow handles at the corners of the
  straighten-SAFE inscribed rect (`cropSafeBound()`), inset 6% so they ride ON
  the photo (the photo's TRUE corners rotate off-frame, so the inscribed corners
  are the on-photo set). Crop mode is untouched (box + scrim + resize dots). Auto-
  crop on Done unchanged (its inscribe imperfection is negligible at real leveling
  angles and no longer shown as a box). VERIFIED headless 26/26 (Chromium; fail-
  first proven — planted "arrows in the void" at 20° flipped): no visible box/
  scrim in Straighten; each rotation arrow sits on OPAQUE photo pixels at 20° AND
  8° (the 20° case used to be alpha 0); corner-drag still rotates; Crop's box
  unchanged; screenshot at 8° shows a clean tilt with arrows on the photo. NEEDS
  THE OWNER'S HANDS: Straighten reads as a clean tilt-to-level on the real iPhone.
  SEVENTH PASS — SETTLED MODEL (2026-07-15, staging, cache ips-v64 → ips-v65).
  On device the "no box / arrows on corners" tilt view read as a sheared
  parallelogram (it was actually the rigid-rotated rectangle CLIPPED by the frame
  — object-fit:contain, not a real shear) and gave no way to see the crop. Owner
  settled it: ONE combined crop/straighten tool, aids per focus, repositionable —
  a standard editor crop. IMPLEMENTED (this is the final design; ignore the
  earlier separate/no-box attempts above):
  • WHOLE photo shown — draw() renders an OUTSET "fit" crop while armed
    (`fitViewCrop()`, symmetric zoom-out; the renderer accepts crop outside [0,1],
    margins go transparent), so a tilted photo is never clipped.
  • BOX BACK — `positionCropOverlay` maps `params.crop` through the fit-view onto
    the tilted photo; box border + scrim (dim outside) in BOTH focuses.
  • REPOSITION — drag anywhere on the photo pans the crop (`#cropOverlay` captures
    it; `clampCropOnPhoto` clamps the position in SOURCE space so it stays on the
    photo — there's slack along a rotated photo's non-binding axis, which is the
    "slide along the length" the owner wanted).
  • AIDS PER FOCUS (the Guide-lines roadmap item, shipped) — Straighten shows a
    finer ALIGNMENT grid + the slider (no handles, no arrows); Crop shows the
    RULE-OF-THIRDS grid + round resize handles. Toggled by `.focus-straighten`/
    `.focus-crop` on the overlay — never both.
  • Safety: `cropSafeBound()` insets the inscribe ~2.5% + `clampCropOnPhoto` a
    hair, so the box/handles never graze the transparent edge (autoInscribedCrop
    isn't pixel-exact vs the shader). Export unchanged (uses `params.crop`).
  VERIFIED headless 23/23 (Chromium; fail-first proven — planted "box in the void
  at 20°" flipped): box corners opaque (on the photo) at 20° in straighten AND in
  crop; no arrow art anywhere; Straighten hides handles + shows the alignment grid
  + slider; Crop shows round handles + thirds grid; a drag repositions the box and
  it stays on the photo; a corner resizes; the slider rotates; Done exits. Screens
  of both focuses captured. NEEDS THE OWNER'S HANDS: it now behaves like a normal
  editor crop/straighten on the real iPhone — level against the alignment lines,
  slide to reposition, switch to Crop for the thirds grid.
- [x] **Pinch-zoom the crop while aligning** — owner ask 2026-07-16 (with the
  crop go-to-main): during crop/straighten, two-finger pinch to zoom the view
  in/out so the box (the "square") is easier to see and align against. Build
  notes: the fit-view is a single chokepoint — `fitViewCrop()` (main.ts) is the
  only reader of the preview window, and all three consumers (the armed render in
  `draw()`, the box placement in `positionCropOverlay`, and the pan-delta scaling
  in `startCropDrag`) re-call it live. So a new preview-only `viewZoom` state
  applied INSIDE `fitViewCrop()` threads through render, overlay and pan with no
  other math change (`positionCropOverlay`/`moveCropDrag` already divide by the
  window's w/h). Reuse the existing two-pointer pinch recognizer that the normal
  photo view already uses (activePointers map + pinch state + midpoint-anchored
  clamp) for the GESTURE math, but drive `viewZoom` + `draw()` instead of that
  path's CSS transform (the crop view re-renders the GL scene, it doesn't magnify
  a letterboxed canvas). Preview-only: export reads `params.crop` and is provably
  untouched; reset `viewZoom` on arm/disarm.
- [x] **Box-fill default crop view** — owner ask 2026-07-16: instead of opening
  zoomed-out to the whole tilted photo, default the armed view so the crop box
  (the square) FILLS the frame with the photo visible but dimmed AROUND it (to
  show it continues), and pinch-out from there to see the whole tilt. Same
  mechanism as the pinch item: `fitViewCrop()` returns a smaller window AND
  recenters on the crop-box centre (not the hard 0.5) — the renderer accepts a
  crop outside [0,1] (margins render transparent) and the canvas stays
  undistorted as long as the window stays square (w===h). The current
  angle-driven `*1.06` outset becomes the fully-zoomed-OUT limit of the pinch
  range. Pairs naturally with the pinch item — build them together.
  SHIPPED — BOTH ITEMS TOGETHER (cache ips-v66 → ips-v67). `fitViewCrop()` is
  still the single chokepoint; everything routes through it:
  • BOX-FIRST DEFAULT — the window now centres on the crop-box centre and opens
    at `boxFillZoom()` (a preview-only `viewZoom`, set on arm), so the box's
    binding side just fills the frame with the dimmed continuation around it.
    Re-arming an already-cropped photo opens framed ON that crop (its main
    payoff); a fresh full-frame crop still opens on the whole photo (box-fill of
    a full box IS the full frame). The old `*1.06` whole-tilt outset became
    `outViewScale()` — the pinch range's zoomed-OUT limit.
  • PINCH — two fingers on `#cropOverlay` drive `viewZoom` + a GL re-render (not
    a CSS magnify — the crop view re-renders the scene). Zooms out no further
    than the whole tilt; in to box-fill in Crop (so the resize handles stay
    on-screen), a little past it in Straighten (no handles to lose — precise
    leveling). One finger still pans; the 2nd finger hands off pan → pinch and
    drops the pan with no undo step.
  • MODEL SHIFT (owner: eyes on this) — box-fill leaves no room for a movable
    box, so the tool became the standard "centred box, photo pans under it":
    a one-finger drag now moves the PHOTO (it follows your finger; the crop
    slides the opposite way in source space), where before the box moved inside
    a fixed photo view. Resize freezes the view centre for the drag so the
    grabbed corner tracks the finger, then recentres on release.
  • PREVIEW-ONLY — export reads `params.crop` and is provably untouched: headless
    read `params.crop` byte-identical through a whole pinch session and the
    committed export dims (819×548) unchanged before/after.
  VERIFIED headless 19/19 (Chromium, iPhone-ish 430×900; fail-first PROVEN —
  planted "box stays small like the old view", "window doesn't change under
  pinch", and "tilted corner is opaque" all flipped to FAIL): re-arm on a ~0.59
  crop fills the frame (fillFrac 1.0, box centred) vs the old small box; pinch-out
  grows the window 819→1484 and shrinks the box, and is reversible; committed
  export dims unchanged by a pinch; a one-finger drag shifts the rendered photo
  while the box stays centred; Straighten still tilts with clean transparent
  corners + the alignment grid + hidden handles, and pinches past box-fill.
  NEEDS THE OWNER'S HANDS on the real iPhone/iPad: the box-first default framing,
  the pinch range + limits (Crop vs Straighten), and ESPECIALLY the model shift —
  the photo-follows-finger pan under a now-centred box, and the resize feel. If
  the pan direction or the centred box reads wrong on device, both are a one-line
  flip / a small change here.
- [x] **Keep the crop box inside the photo** — owner-caught on device 2026-07-16
  (with the crop go-to-main), a REGRESSION from the box-first/pinch release: once
  the photo has been STRAIGHTENED or CROPPED, a resize handle (and maybe a pan)
  can drag the crop box PAST the image edge into the black void — the box is
  allowed larger than / outside the photo (his IMG_1007: the box's top + right run
  off the rounded photo edge into black; also visible after a straighten). Export
  reads `params.crop`, so a box dragged out there bakes black/transparent wedges
  into the saved image — fix before it bites.
  SHIPPED (cache ips-v67 → ips-v68). ROOT CAUSE confirmed: the RESIZE path
  clamped each moved corner to `cropSafeBound()` — a CENTRED, axis-aligned
  inscribed rect — and never re-checked the two shared-coordinate corners. Once
  the box is panned off-centre on a tilted photo (valid — the slide the owner
  wanted), a centred axis-aligned bound is the wrong constraint and a corner
  lands off-photo (and at straighten 0 that bound is identity [0,1]). PAN
  (`clampCropOnPhoto`) was already correct. FIX: a new `clampResizeOnPhoto`
  (main.ts) — because `outToSrc` is LINEAR, an output rect images to a
  parallelogram and the photo (source-UV [0,1]²) is convex, so all four corners
  on-photo ⟺ the whole box is. It slides the grabbed corner back along the drag
  line by a single closed-form scalar t (≈6 scalar evals, no loop) to the largest
  t keeping every corner on the photo, anchored at the fixed opposite corner.
  Margin 0 on purpose (the full-frame box's corners sit exactly on the photo edge,
  whose texels are opaque — any positive margin would collapse it). `moveCropDrag`
  resize branch rewritten to use it; `cropSafeBound` stays for the straighten
  slider re-fit + Reset (deliberate centred inscribe); pan/fitViewCrop/export
  untouched (export reads `params.crop`, correct-by-construction once it's always
  on-photo). The "rounded photo edge" the owner saw is a CSS border-radius on
  `#view` — preview-only, not in the buffer/export.
  VERIFIED headless 64/64 (Chromium, scratchpad harness driving the REAL app —
  synthetic pointer drags on the actual handles/overlay, sampling the WebGL
  drawing-buffer ALPHA under all four #cropBox corners; opaque ⇔ on-photo).
  FAIL-FIRST PROVEN: on the pre-fix build the harness catches the void (a corner
  reads alpha 0) in the shrink→pan-off-centre→grow-far-corner case at −20° and
  −35°; the shrink is the essential step the earlier attempt missed (a maximal
  inscribed box can't pan). Scenarios: resize each corner outward at
  {0,±8,±30,±45}°; resize after a prior crop; SHRINK+PAN+GROW a far corner at
  {±20,25,±35}°; pan to extremes at several angles — all four corners opaque on
  the fixed build, no page errors. NEEDS THE OWNER'S HANDS: confirm on the real
  iPhone/iPad that the box now stops at the photo edge on a resize/pan after a
  straighten or crop, and that the corner "slides back to fit" feel is natural.
  Still pairs with the overflow-view idea below (reframes "outside the image").
- [x] **Redo** — owner ask 2026-07-15: add a Redo button + function next to
  "Go back", and RENAME "Go back" to "Undo" (unless a reason surfaces not to).
  Build notes: the undo stack already exists (undoStack + settled/flushRecord);
  Redo needs a parallel redo stack that undo() pushes onto and any NEW edit
  clears (standard redo semantics — a fresh action after an undo abandons the
  redo future). The ⓘ patch-notes read the last commits, unaffected.
  SHIPPED (same release): a parallel `redoStack` — `undo()` pushes the state it
  leaves onto it, `flushRecord()` clears it the moment a genuinely new edit
  commits (undo/redo leave settled==current so their own flush no-ops and never
  spuriously clear it), `redo()` walks it back without flushing. Cleared on a
  fresh open; persists across in-session photo switches alongside undo (new
  `redo` field on `LiveEdit`, `st.redo ?? []` on restore). "Go back" renamed to
  "Undo"; new "↷ Redo" button beside it, disabled when empty. VERIFIED headless:
  A→B, undo→undo→redo→redo walks exactly, a new edit after an undo clears the
  redo future, buttons enable/disable correctly. (In-session-switch persistence
  mirrors the already-proven undo path by construction; not separately driven.)
- [x] **Drop "· RAW" from tile labels** — owner note 2026-07-15: every practice
  photo in the tutorial set is RAW now, so the "· RAW" suffix on the tile
  labels is redundant noise. Remove it from the gallery tile titles (main.ts
  GALLERY entries / galNef/galRaw label helpers). The RAW-vs-JPEG distinction
  the suffix once carried is gone (the set is all binned DNGs); labels stay
  honest by simply naming the scene.
  SHIPPED (same release): the trailing " · RAW" dropped from all 44 galRaw/galNef
  tile-label literals; scene names stand alone. The library-overlay count readout
  ("53 photos · 44 RAW") is KEPT — it's an aggregate over a mixed set (44 DNG + 9
  JPEG), a different context, and stays honest. VERIFIED headless: no tile label
  contains "RAW"; the libCount readout still does.
- [x] **Crop & straighten** — owner GO 2026-07-15 ("quick addition", one
  release not a saga). The last table-stakes editing tool before the App
  Store path. SHIPPED to `claude/crop-straighten-jx2a0t`, not yet pushed to
  staging (cache ips-v53 → ips-v54).
  GEOMETRY: `EditParams` gained `crop {x,y,w,h}` (fraction of the STRAIGHTENED
  display frame) and `straighten` (degrees). Three call sites share the exact
  same math (pipeline.ts's `cropToDisplayUv`/`displayUvToCrop`/
  `autoInscribedCrop`, mirrored by hand into the gl.ts VERTEX shader — crop
  and straighten are resolved there, BEFORE the fragment shader ever runs, so
  every spatial effect (masks, hot-spot/vignette, clarity/dehaze maps,
  denoise/sharpen neighbourhoods) sees the crop for free with zero extra
  code): the GPU preview, export.ts's `toSrc`, and the CPU inverse mapping in
  Renderer (`toImagePixel`/`imageUvToClient`, used by tap-WB, mask placement,
  heal taps). Masks/heals stay anchored to the SOURCE pixels as planned — a
  crop is a VIEW, not a re-bake — because the inverse mapping resolves a
  screen tap back through crop+straighten to the true image-uv before
  anything else ever sees it. The lens hot-spot fix stays circular (aspect
  from SOURCE dims, untouched) and the .cube/.dcp LUTs are unaffected
  (geometry is spatial by construction, never enters compileEdit's per-pixel
  colour math). Canvas resize IS the crop: `Renderer.applySize` sizes the
  canvas itself to `baseDims × crop.w/h`, so the export's pixel dimensions
  (and therefore the watermark's corner, drawn after at those exact w×h) are
  the cropped frame for free — no separate "anchor to cropped frame" code
  needed.
  STRAIGHTEN auto-inscribes: a closed-form largest-same-aspect-rect formula
  (`autoInscribedCrop`, k = min(aspect/(aspect·cosA+sinA), 1/(cosA+aspect·sinA)))
  recomputes the crop to the biggest rect that survives the rotation with no
  empty corner, every time the slider moves. Manual crop dragging afterward
  is CLAMPED to that same safe bound (not just [0,1]) — so no path through
  the UI can ever bare an empty corner.
  UI: a `Crop` button in the top bar (beside Rotate) arms a sustained mode
  like heal/TAT — it OWNS the canvas (no tap-WB/pan/pinch while armed; the
  box IS the framing tool). While armed the render shows the FULL frame with
  straighten still live (the photo visibly tilts as you drag the slider) and
  an axis-aligned box overlay (box-shadow-as-scrim, 4 corner handles + drag-
  the-box-to-move) marks the PENDING crop — deliberately simpler than a
  Lightroom-style rotating viewfinder: since the photo itself already renders
  straightened while editing, the box never needs its own CSS rotation, which
  sidesteps a whole class of touch-drag-under-rotation math for a "quick
  addition". Exiting the mode (tap the banner) is what actually commits the
  crop into the live canvas size. One drag = one undo step (`flushRecord` on
  pointerup, matching TAT/heal); Reset returns to the full, unstraightened
  frame; a fresh photo open clears crop/straighten like masks/spots; crop
  never rides in saved looks or a batch (excluded the same way spots are —
  `SavedLook`/`batchParamsFor` never reference it).
  FIELD-CAUGHT DURING VERIFICATION: the crop banner's first draft sat at the
  TOP (matching TAT) — but the lesson-chip rail also lives at the top on any
  practice photo, and the two overlapped, with the chips eating the banner's
  taps. Moved the crop banner to the BOTTOM, stacked above its own Straighten
  toolbar (same reasoning heal/colour-pick already used to duck the sky).
  VERIFIED headless (Chromium; scratchpad harness): arm → full frame shown at
  unchanged canvas size; drag the br handle → box shrinks; move Straighten to
  12° → box auto-inscribes SMALLER than the full frame (safe-bound formula
  engaging); exit → canvas ACTUALLY resizes to the committed crop; undo → one
  step back; Reset → exact full frame restored; no page errors throughout. A
  second run proved the EXPORT path end-to-end through the real UI (Export
  tab → native JPEG → Save): the exported JPEG's own dimensions (read from
  its SOF0 marker) are the SAME crop fraction as the committed preview canvas
  at native's ~2× resolution (2120×1354 native vs 1060×677 preview — both
  exactly 0.757×0.727 of their respective full-frame dims), proving the
  preview and export geometry agree even though export decodes at a
  different resolution than the live preview proxy.
  NEEDS THE OWNER'S HANDS on the iPad: the drag feel (corner handle size,
  whether dragging the box itself to move reads as expected on a finger vs a
  pointer), the straighten slider's range (±45°) and step (0.1°), and his
  verdict on the "photo tilts, box doesn't" straighten preview versus a
  Lightroom-style tilting viewfinder box (documented above as the deliberate
  simpler choice for this release — a candidate for a follow-up if he wants
  the box to visually tilt instead). NOT YET DONE: no aspect-ratio presets
  (free-form only); masks/heals were NOT re-verified live under an active
  crop in this pass (the geometry math is shared and should carry them
  correctly by construction, per the inverse-mapping argument above, but a
  real mask-under-crop headless check is still owed before calling this
  fully proven).
  OWNER'S FIRST ON-DEVICE PASS (2026-07-15, staging — "Crop works well" +
  two bugs, both fixed same day, cache ips-v54 → ips-v55):
  (1) A translucent BLUE BAND (iPad Safari's text-selection highlight)
  painted over the photo while dragging the box/handles — the crop overlay
  subtree never got user-select:none. Fixed: #cropOverlay/#cropBox/
  .crop-handle now all carry -webkit-user-select/user-select:none +
  -webkit-tap-highlight-color:transparent + -webkit-touch-callout:none (the
  same guard #view already had; the overlay's div children had been missed).
  (2) The BOTTOM-LEFT corner handle couldn't be grabbed when the box sat in
  the frame's bottom-left-most corner — until he SHRANK the Safari window.
  Root cause: a full-frame crop put the handle flush in the physical screen's
  bottom-left corner, exactly where iOS reserves the first touch for the
  home-indicator swipe (bottom edge) and back-swipe (left edge); resizing the
  window moved the page content off that edge, which is why it then worked.
  Fix, two parts: (a) while cropping, #stage gets a `.cropping` class that
  insets #view from the stage edges (30px sides, 96px bottom for the
  Straighten toolbar + OS zone; env(safe-area) not needed since the fixed
  inset already clears it) — the crop box tracks the canvas rect, so the whole
  box + handles move inward for free, and the photo just renders a touch
  smaller while framing; (b) the corner handles grew from a 26px element to a
  44px INVISIBLE hit target (Apple's minimum) with the visible 26px dot drawn
  via ::before, so a corner is easy to grab even near an edge. VERIFIED
  headless: the bl-handle center now sits 31px from the stage's left edge and
  182px from its bottom (was ~0/flush), the hit target measures 44×44, and
  dragging the BOTTOM-LEFT handle specifically moves the crop (left edge in,
  bottom up); the selection-highlight guard is asserted computed
  (user-select:none on box/handle/overlay); the original end-to-end geometry
  + export tests still pass unchanged; no page errors. STILL NEEDS THE
  OWNER'S HANDS: confirm both are gone on the real iPad, and the "photo
  shrinks a bit while cropping" tradeoff feels right.
- [x] **Preview-faithful exports + offline through updates** — NEXT VERSION
  (owner call 2026-07-15: after crop/straighten ships, this pair is the
  next VERSION — bump the VERSION file to 1.1 when it lands). The two big
  CONFIRMED review findings; full detail in the "Full-app review" ledger
  section below. (1) Denoise/sharpen/texture run at proxy resolution in
  preview but native at export (~2× kernel scale on every mosaiced RAW and
  >2800px 8-bit source) — scale the CPU kernels' tap spacing and the detail
  sigmas by the proxy factor at export, then RE-PROVE GPU==CPU parity (the
  existing harness compares equal-res mirrors and cannot see this — build a
  cross-resolution check) and tune with the owner's eyes on real frames.
  (2) Every release blacks out offline use until the next online visit —
  build-time precache manifest injected into sw.js (vite plugin emits the
  hashed asset list), install-time addAll into the NEW cache, activate only
  after it's populated; keep the examples cache untouched.
  SHIPPED — VERSION bumped 1.0 → 1.1 (cache ips-v68 → ips-v69). BOTH landed:
  (1) EXPORT FIDELITY. Root cause confirmed exactly as the review called it: the
  GPU preview kernels tap in PROXY texels (gl.ts `* u_texel`, u_texel = 1/proxy
  dim), so each tap step covers `proxyFactor` native pixels; the CPU export
  kernels tapped EVERY native pixel with the same sigmas, so exported detail was
  ~proxyFactor× finer than previewed. Insight that kept the fix tiny AND fast:
  because both the tap offsets AND the gaussian sigmas live in TAP-INDEX units,
  scaling only the SAMPLING POSITIONS by proxyFactor (same 7×7 / 5×5 tap count,
  same weight tables) reproduces the proxy-scale footprint at native res — no
  extra taps, so export speed is unchanged. `makeRowDetail`/`makeRowDenoiser`
  (raw/detail.ts, raw/denoise.ts) gained a `step` arg (default 1) that widens the
  precomputed integer tap offsets (`Math.round(d*step)`) and the row-cache ring
  to match; export.ts computes `proxyFactor` from the SOURCE (RAW = 2, the half-
  res demosaicBinned proxy; 8-bit = max(1, maxDim/2800), toPreview's proxy) so
  single AND batch agree with no threading. step===1 (a sub-2800 8-bit source,
  previewed at native) leaves the sampling byte-identical — no regression there.
  Clarity/dehaze/glow untouched (fixed-resolution maps, already proxy-invariant).
  (2) OFFLINE THROUGH UPDATES. New `precache-manifest` vite plugin (the repo's
  FIRST real Vite plugin) runs in `closeBundle` (after the publicDir copy), walks
  `dist/`, and injects the full app-shell file list (35 entries: the root "./"
  route, all three HTML entries, hashed JS/CSS, worker, fonts, all icons, all
  manifests) into `dist/sw.js`'s `PRECACHE` placeholder — EXCLUDING the 442 MB
  `examples/` tree, sourcemaps and sw.js itself. sw.js's install handler now
  `addAll`s that list into the NEW cache BEFORE `skipWaiting`, so activation's
  old-cache wipe no longer bares an empty shell; addAll's all-or-nothing means a
  flaky network aborts the install and the OLD worker keeps serving (never a
  half-empty shell). The version-stable EXAMPLES cache is never touched; the CACHE
  bump stays a manual `ips-vN` edit per CLAUDE.md.
  VERIFIED headless (Chromium; scratchpad harnesses, all fail-first proven):
  • CROSS-RESOLUTION PARITY (the check the old equal-res harness structurally
    couldn't do) drives the REAL kernels at two resolutions: detail/denoise run on
    the proxy at step 1 == the preview (equal-res GPU==CPU parity already proven).
    The fixed native export (step=proxyFactor), brought back to proxy size, lands
    55–111× closer to the preview than the pre-fix (step 1) export for sharpen/
    texture and 3.9× closer for denoise; the pre-fix column IS the fail-first
    control (ratio ~1 would fail the bar). step=1 proven indistinguishable from
    the old code (< 2.5e-4 of an 8-bit level — JIT float noise). 5/5.
  • OFFLINE-THROUGH-UPDATES drives the built app over http://localhost: a fresh
    install precaches the 35-entry shell; offline navigation to /ir.html and the
    root "/" load from cache; a simulated NEW release (v70) precaches its cache at
    install, activate wipes v69, and offline works IMMEDIATELY after — no blackout.
    Two fail-first controls: a "buggy" update (old install = skipWaiting only)
    leaves the new cache EMPTY and offline DOES black out, proving the harness
    detects the very regression the fix removes. 8/8.
  • PRIMARY-JOURNEY WALK on the built app: start screen → open a practice RAW
    (preview 1400×932 while export decodes the 2800×1864 native CFA — the
    proxyFactor-2 path) → apply denoise+sharpen+texture → native JPEG export
    completes ("Ready — NIR_1638-raw.jpg"), no page errors. 5/5. (Caught the
    CLAUDE.md waitForFunction-Promise trap mid-build — polls now read synchronous
    state via awaited page.evaluate.)
  NEEDS THE OWNER'S HANDS on the real iPad: (1) the exported detail LOOK vs the
  on-screen preview on real frames — the fix matches the proxy FOOTPRINT, but the
  exact sharpen/texture ceiling is still eyeballed (KS/KT), so expect a tuning
  round like denoise took; the tap-spacing model samples native pixels at proxy
  spacing (a hair of aliasing on extreme high-freq detail is possible — his call
  if it ever shows). (2) Install this release, go fully offline, and confirm the
  app still opens and edits after the update with NO online visit in between
  (all measurements so far are Chromium + a simulated update, not iOS Safari's
  own SW/storage behaviour).

- [x] **RAW practice photos for every lesson** — owner ask 2026-07-14, given
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
  SECOND WAVE same day (cache ips-v41 → ips-v42): five more zips
  (NIR_1821/1824/1830/1873/1877, all Z50) — GALLERY is 27 tiles = 14 RAW +
  13 JPEG; lessons 1-5 each gained a SECOND RAW frame, appended in lesson
  order: ① Chairs by the lake (1830 — the white chair fabric is a natural
  tap-WB target) ② Through the boughs (1873) ③ Pine & clouds (1824) ④
  Shoreline forest (1821) ⑤ Glowing pine (1877). FLAGGED to the owner:
  1824 is close kin to 1822 Lone pine (same spot, different frame — both
  kept deliberately, one line to drop if he'd rather). Verified: the
  built-app walk grew to 25/25 (27 tiles, all thumbs decode, each of the
  ELEVEN RAW tiles opens on its lesson chip and renders, no page errors).
  WAVES 3-5 same day (one push, cache ips-v42 → ips-v43): 21 more zips
  arrived (some duplicates — the chat re-sent a few; deduped by filename).
  GALLERY is now 48 tiles = 39 RAW + 9 JPEG. THREE MORE JPEG SCENES went
  RAW, two of them via NEIGHBOURING FRAMES of the same scene (the owner
  sent adjacent shutter numbers, not the exact frame — treat "same scene,
  same composition" as the replace test, not filename match): Wispy sky =
  NIR_1827 (exact), Swirling sky = NIR_1716 (exact), Lake & contrails =
  NIR_1722 (neighbour of 1721), Framed by trees = NIR_1667 (neighbour of
  1665). Sky frames 1716/1722/1827 tag lesson 2; the 16 other new tiles are
  free practice (untagged → Lesson 1): 1644/1651/1661/1662/1671/1681/1682/
  1688/1691/1703/1705/1710/1713/1717/1718/1720/1738 families — treetops,
  sunlit crowns/pines, foliage close-ups, campsite scenes, shore sweeps.
  CURATION (flagged to owner, DNGs kept in scratchpad ready to swap):
  NIR_1674 SKIPPED (same two-trunks beach scene as the 1638 tile);
  NIR_1652 SKIPPED (landscape variant of 1651's subject — kept the tighter
  portrait). NIR_1645's zip contained the camera JPG, NO NEF — owner owes a
  re-send if he wants that scene. REGRESSION GOLD: the owner re-sent
  NIR_1675.NEF and the rebuilt bin-dng.cjs output is BYTE-IDENTICAL to the
  committed public/examples/NIR_1675.dng — the rebuilt pipeline is the
  same pipeline. STILL WITHOUT RAW: NIR_1706/1808/1825/1864/1866 + the 4
  D5300 magenta frames.
  SIXTH WAVE (2026-07-14, after a container restart — waves 3-5 were
  already safe on the remote; only the newest uploads survived on disk and
  that's exactly what was still unprocessed; cache ips-v43 → ips-v44):
  five BACKYARD scenes at last breaking the lakeside monotony —
  NIR_0063/0102/0152/0172/0627 (oaks over a fence, bird bath, lounge
  chair, kids' playhouse, lavender close-up), all free practice. These
  zips held LIGHTROOM-CONVERTED DNGs (full-res 5600×3728 mosaiced
  lossless-JPEG), NOT NEFs — all Z50. bin-dng.ts grew `binDngToDng`
  (reads the CFA via the app's own readMosaicedCfa/LJ92 path, then the
  identical bin+write); full-res originals still never enter the repo.
  NIR_0627 was re-sent as "_2" — the re-send is the shipped version.
  GALLERY = 53 tiles = 44 RAW + 9 JPEG. Uploads dir gotcha: the chat's
  upload store did NOT survive the restart either — only re-sent zips
  exist on disk; if a wave is uncommitted when the container dies, ask
  the owner to re-upload it.
  TUTORIAL SET vs LIBRARY (owner call 2026-07-14, "cull down to a tutorial
  set and set aside the full set as an example library"; his picks: 11
  lesson tiles + variety extras, expander with group headers; cache
  ips-v44 → ips-v45): the start screen now shows a 13-tile TUTORIAL SET
  (the lesson-tagged pairs in lesson order + The playhouse + Lavender as
  variety picks — `CORE` set in main.ts) and a "Browse the full library ·
  53 photos" DASHED-PILL EXPANDER (#libraryToggle/#library in ir.html)
  that unfolds the COMPLETE set — tutorial tiles included, one honest
  whole — under six group headers (`LIBRARY_GROUPS`): Skies & clouds /
  Lakeside forest / Campsite & shore / Backyard / The original RAW trio /
  Full-spectrum D5300. Any tile missing from every group falls into a
  trailing "More" section rather than vanishing (the verify suite asserts
  "More" is EMPTY — a new tile must be added to a group or the suite
  fails). Presentation-only: no tile data moved, openGalleryPhoto
  unchanged, nothing deleted. Collapsed state is not remembered (fresh
  visits start calm). GOTCHA note honoured: .library-toggle sets
  width:auto against the global button width:100% rule (the chip-rail
  lesson). VERIFIED headless 48/48 (fail-first re-proven): 13 tutorial
  tiles, library hidden → opens → 53 tiles → collapses, honest count in
  the toggle label, 6 headers, empty "More", all thumbs decode, all 13
  tutorial tiles open on their lesson chips + render, one spot-check per
  library group opens/renders (incl. Golden canopy proving galRaw's 3rd
  arg is rotate, not lesson), no page errors.
  [SUPERSEDED 2026-07-15: the library came BACK as its own full-screen
  overlay — owner pick "needs its own location"; see the landing/library
  entry below. The paragraph that follows records the 2026-07-14 state.]
  LIBRARY UI REMOVED same day (owner on-device verdict, escalating from
  "they don't have to collapse" to "It doesn't HAVE to BE THERE" — read
  the second message before acting on the first; cache ips-v45 → ips-v46):
  the start screen is now ONLY the 13-tile tutorial set. The expander,
  #library, LIBRARY_GROUPS and the group-header CSS were deleted. The 40
  non-core GALLERY entries REMAIN in data and their DNGs REMAIN deployed
  (~420 MB of currently-unreachable files) — "set aside as an example
  library" pending a home the owner actually wants (options: a page of
  its own, inside Help, or trimming the files from deploy entirely — HIS
  call, don't rebuild unprompted). Verified 31/31 headless: 13 tiles, no
  library element anywhere, all 13 open on their lesson chips and render,
  no page errors.
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
- [x] **Studio icon in the top bar + the wrapped corner** — owner ask
  2026-07-14, given WITH the main-release GO (his screenshot: at iPad width
  the top-left "‹ Studio" link wraps onto two lines, and the brand area
  should carry the Studio/NJ mark). SHIPPED to staging 2026-07-15 (cache
  ips-v50 → ips-v51): the NJ mark (icons/icon-192.png at 22px, rounded,
  same asset the launcher header wears) now rides INSIDE the "‹ Studio"
  corner link on BOTH tool bars — IR and Macro — because that link IS the
  Studio affordance; the tools' own identities (tool-dot, their icons) are
  deliberately untouched (the NJ-rebrand over-broad-pass lesson). The
  corner can no longer wrap: .home-link/.brand (and macro's .bar .home)
  are white-space:nowrap + flex:none, so the squeeze is absorbed by the
  actions row (which already wraps/scrolls) instead of the corner text.
  ALSO SHIPPED, the queued review fixes from the library release:
  (1) /examples/*.dng now cache into a VERSION-STABLE service-worker
  cache "ips-examples-v1" that activation keeps across CACHE bumps —
  practice RAWs a user already downloaded are no longer wiped + refetched
  (~10 MB each) on every release. The binned DNGs are immutable content;
  if one is EVER replaced under the same filename, bump the EXAMPLES
  version in sw.js too or installed apps keep the old bytes.
  (2) REAL PRE-EXISTING SW BUG, found by the new harness and fixed: the
  cache-first asset branch called res.clone() inside
  caches.open(...).then(...) — by then respondWith can already be
  consuming the body, clone() throws, and the silent .catch ate the cache
  write. Measured on localhost: NOTHING from that branch was being cached
  at all (fast connections lose the race; slow ones win it, which is why
  it worked on device). LESSON for every SW: clone BEFORE handing the
  response to respondWith, and put under e.waitUntil.
  (3) openGalleryPhoto hardening: a quickGen-style generation guard
  (double-tapping two tiles: the newer tap wins, the older aborts at every
  await and never hides the newer one's busy overlay); the error message
  is honest about WHICH failure happened — download failed says
  check-your-connection, decode-after-a-good-download says the photo
  couldn't be opened (likely low memory) instead of blaming the
  connection; and requestPersistentStorage() is requested on the gallery
  path (best-effort, like sessions/batch).
  NOT IN THIS RELEASE: aria-expanded (no disclosure exists today — note
  stands for any future one) and the content owed (RAW twins for
  NIR_1706/1808/1825/1864/1866, the four D5300 magenta frames' NEFs,
  NIR_1645's NEF) — still waiting on owner uploads.
  VERIFIED headless 34/34 (fail-first proven: planted wrong tile-count,
  wrap-height and cache-survival expectations each failed exactly as
  planted): NJ mark loads in both bars; corner link single-line at 834px
  and in edit mode at 900px (one line measures 34px; a wrap reads ≈48);
  SW activation wipes an old ips-v50 but KEEPS ips-examples-v1 and its
  entries; a fetched DNG lands ONLY in the stable cache while a PNG lands
  in ips-v51; the FULL 53-TILE DECODE SWEEP runs every tile file through
  the app's own decoder (44 DNG + 9 JPEG, all w/h>0, RAW decodes as true
  raw, deployed DNGs == tile DNGs exactly — a new tile or file mismatch
  fails the suite); the 13 tutorial tiles open on their lesson chips and
  render; the double-tap race resolves to the newer tile with no page
  errors. Harness lives in the session scratchpad (server.mjs +
  sweep-entry.ts esbuild bundle + run-tests.mjs). NEEDS THE OWNER'S
  HANDS: the corner mark's look at his sizes/themes, and that the wrap
  from his screenshot is gone on the real iPad.
- [x] **Install the sub-apps from inside the installed Studio** — owner ask
  2026-07-15 ("There is no way to save to Home Screen from within the studio
  as a web app, for the two sub-apps"): the installed launcher is standalone —
  no Safari chrome, no Share — and Add to Home Screen lives ONLY in real
  Safari's share sheet, so Infrared/Macro opened from inside the installed
  Studio could never be installed on their own. SHIPPED to staging 2026-07-15
  (same release/cache as the corner mark, ips-v51): a standalone-only
  "You're in the installed app" block (share.ts setupInstallFromApp — reveal
  + copy-link wiring shared by all three surfaces, the setupInstalledShare
  pattern) on the launcher's install section (#installFromApp: pill links
  "Open Infrared/Macro in Safari ↗" as target=_blank anchors, + Copy-link
  buttons with a paste-into-Safari toast) and inside BOTH tools' Help
  install sections (#irInstallFromApp / #macroInstallFromApp: open-this-
  page-in-Safari + copy). Copy is honest about the iOS unknowable: a
  target=_blank link from a standalone iOS web app historically bounces to
  real Safari but on newer iOS may open the small in-app browser instead —
  the block says "tap its Safari (compass) button to hop over" and offers
  the copy-link path that always works. Hidden in the plain browser (Safari
  has Share there; the [hidden] guard lesson applies — all three pages'
  stylesheets already carry it). ON-DEVICE RESULT (owner 2026-07-15, same
  day): the "Open in Safari" links DO NOT LEAVE the installed app on iPad
  — target=_blank navigates within the web app; no Safari, no in-app-
  browser escape hatch appeared. MEASURED iOS FACT for the file: a
  standalone home-screen web app cannot hand a URL to Safari; the ONLY
  working path is the clipboard. FIXED same day (cache ips-v51 → v52 with
  the library release): the links were REMOVED on all three surfaces, the
  blocks are copy-link-first with the exact steps (Copy link → open
  Safari → paste in the address bar → Share → Add to Home Screen), hedge
  copy dropped. VERIFIED headless (in the 66/66 suite): blocks hidden in
  the browser, revealed under navigator.standalone, contain NO anchors
  (copy buttons only), and the clipboard carries the absolute sub-app URL.
- [x] **Landing scroll cue + a home for the example library** — owner ask
  2026-07-15 (his screenshot: at iPad landscape the welcome card ended AT
  the fold — "can sometimes look like there is nothing to scroll down
  to"). OWNER PICKS same day: landing "a, b, and c seem all good" (all
  three fold fixes); library "needs its own location to go into".
  SHIPPED to staging 2026-07-15 (cache ips-v51 → ips-v52):
  LIBRARY: a full-screen overlay of its own (#library in ir.html, the
  quickLook shell reused; role=dialog), opened from a dashed-pill
  "Browse the full example library · 53 photos →" under the tutorial
  grid. The COMPLETE set — tutorial tiles included, one honest whole —
  under the six scene groups recovered from the deleted expander
  (LIBRARY_GROUPS restored in main.ts: Skies & clouds / Lakeside forest /
  Campsite & shore / Backyard / The original RAW trio / Full-spectrum
  D5300); anything missing from every group falls into a trailing "More"
  section and the suite asserts it stays EMPTY. Tapping a tile closes the
  overlay and opens the photo exactly like a tutorial tile (home lesson;
  untagged → Lesson 1). Presentation only — the tiles are the same
  GALLERY data, openGalleryPhoto unchanged.
  LANDING: (a) first tile row PEEKS above the fold at iPad landscape
  (short-screen media query ≤880px tightens welcome chrome; measured at
  1024×768: grid heading AND first row above the card's fold); (b) a
  sticky fade + chevron cue at the card's bottom edge while more waits
  below (the button-row lesson; class-toggled — NOT [hidden], which the
  display:none!important guard would kill; ResizeObserver on the card AND
  the grid since content growth doesn't resize a capped card); (c) the
  three welcome hints tightened without dropping a claim.
  WATERMARK (owner: "Bake watermarks in at export for my own images
  provided with the app"): exports of the app's own practice photos now
  carry the corner mark — export.ts makeWatermarkLayer (scrim + domain +
  NJ ring from icons/nj-watermark-line-512.png, sized to the image,
  ring:text ratio 2.4 matching the baked teaching JPEGs), drawn on the
  JPEG canvas and alpha-blended into the 16-bit TIFF buffer in display
  space. ONLY for RAW (DNG) gallery tiles — MEASURED LESSON: the 9
  teaching JPEGs already carry the BAKED mark, and the first pass drew a
  SECOND one on top (two domain lines in the corner); openGalleryPhoto
  sets the flag as tile.kind === "dng". The user's own photos are NEVER
  marked (showDecoded clears the flag on every open; batch never sets
  it), the .cube/.dcp LUTs untouched by construction, and the Export tab
  says so while a practice photo is open (#exWmNote, labels stay honest).
  VERIFIED headless 66/66 (fail-first re-proven: planted flips for the
  cue, the standalone reveal, chip and cache expectations all failed as
  planted; the suite also caught the .gal-selector collision when the
  library doubled the tile count, and the busy-race on open-waits):
  library opens/closes/reopens with exactly six groups + 53 tiles and a
  spot-open renders (Golden canopy — the rotate-arg confusion spot); cue
  on at top, off at end, back at top; peek measured at 1024×768;
  watermark unit pair through the REAL exportImage (JPEG pixels differ
  ONLY in the corner box with white text present; TIFF same-size,
  II magic, diffs confined to tail rows) + E2E through the real UI (RAW
  practice export carries the mark, baked-JPEG tile does NOT get a
  second one, the user's own photo carries none, note visibility follows).
  NEEDS THE OWNER'S HANDS: the library's feel (group order, tile size,
  Close placement), the cue's look over his content, the peek on the
  REAL iPad (Safari chrome heights differ from headless), and the mark's
  size/placement taste on a real export.
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
  main after the owner's on-device pass.
- [x] **Share the app from inside the installed app** — an installed
  (standalone) PWA has
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
- (Internal QA, not a roadmap item — plain bullet so the ⓘ parser skips it.)
  On-device checks owed: Safari IDB crash durability (all
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

- [x] **Share-ready: honest copy, public notes page, share cards, privacy** —
  the pre-promotion due-diligence pass (owner ask 2026-07-17, "Fable is on"
  session; three-agent audit + this fix release, cache ips-v69 → ips-v70).
  SHIPPED, seven commits:
  (1) deploy.yml concurrency group (per-ref, newest wins; Pages deploys are
  atomic so cancel-in-progress is safe). (2) .cube/.dcp exports ride the share
  sheet via a new `saveBlob()` (export.ts) — the installed iOS app ignores a
  bare a[download], so those buttons were silent no-ops there; busySave uses
  the same helper (cancel = keep dialog). (3) parseExif hardened (hotspot.ts):
  try/catch → null so corrupt EXIF degrades to the manual lens prompt instead
  of failing the open, and a leading non-Exif APP1 (XMP) is skipped, not
  fatal. (4) Third-party RAW honesty: `rawBrand()` (import.ts; CR2 magic +
  extension map), `DecodedImage.previewNotice` surfaced via alert in
  showDecoded — a CR2/ARW now opens WITH "this is the embedded preview, not
  raw" + DNG-Converter pointer; plain-TIFF errors stop claiming DNG; NEF
  failures claim High-Efficiency ONLY when the CFA IFD Compression tag is
  neither 34713 nor 1 (`nefLooksHighEfficiency`). (5) Help caught up with the
  app: Dust/lens fixes say Corrections tab, crop bullet describes the real
  Crop & rotate tab (three separately-armed tools + guides + pinch-zoom), new
  Top bar section (Undo/Redo/Reset/Histogram + tap-to-hide), tap-to-WB
  softened (armed tools take the tap), American "Color" everywhere
  user-facing, "practice library" naming unified. Static #sectionSub matches
  TAB_META ("detail"). (6) PUBLIC NOTES PAGE: new `notesPage()` vite plugin
  emits dist/notes.html (filtered git history ~50 + Coming next + Recently
  shipped, launcher-dark inline CSS, no JS); `filteredLog()` drops
  Roadmap:/Notes:/Docs:/Internal:/Chore: subjects from BOTH the page and the
  ⓘ changelog; `checklist(headingRe)` generalizes the roadmap parser; the ⓘ
  "More" links → ./notes.html(#roadmap); per-commit GitHub links (private
  repo, 404 for everyone) became plain text. THIS section restructure (open
  queue vs this archive) is what bounds the in-app roadmap to 6 real items —
  keep queue = open only. Two open items retitled feature-shaped ("Full-bleed
  alignment view…", "Full-bleed crop…"). gallery/README.md moved out of the
  deploy (docs/gallery-examples.md). (7) SHARE CARDS + PRIVACY: og:/twitter:
  meta on all three pages (index+ir card = gallery NIR_1825.jpg 1600×1067,
  absolute prod URLs; macro = icon summary card) + meta descriptions; new
  privacy.html (4th rollup input, launcher-dark) stating the on-device/no
  upload/no analytics truth (verified: only fetches are same-origin), what's
  stored locally and how to clear it, contact + tips; linked from the chooser
  footer, ⓘ, and Macro help.
  VERIFIED headless 49/49 (Chromium; scratchpad harnesses, fail-first where
  new): copy/ⓘ/saveBlob walk 20/20 (dialog: 0 github links, 5 clean subjects,
  roadmap = 6, links → notes/privacy; Help assertions; share-stub .cube/.dcp
  incl. cancel ≠ download); offline-through-updates 8/8 re-proven at v70→v71
  with the 37-entry shell (notes+privacy precached); export walk 5/5; kernel
  parity 5/5; EXIF fixtures 3/3 (fail-first: pre-fix throws + misses
  XMP-wrapped EXIF); RAW fixtures 8/8 (fail-first: pre-fix silently previews,
  says DNG, always claims HE). NEEDS THE OWNER'S HANDS: share-sheet feel for
  .cube/.dcp on the real iPhone/iPad; live link-preview cards (iMessage +
  one social app; only render once merged to PROD — og:image URLs are
  absolute to the prod origin); the notes + privacy pages' look on device;
  and an explicit OK that privacy.html publishes noah.jefferson@gmail.com as
  the contact (easily swapped/removed if not).
- [x] **Share your look — links, files and codes** — owner GO 2026-07-18 ("do
  look sharing", with the full channel scope: core + .cube import + JPEG
  recipes + QR — releases 2-3 are queued above). SHIPPED same day (cache
  ips-v74 → ips-v75), release 1 of three.
  FORMAT (new `src/look.ts`, pure/DOM-free): payload
  `{"f":"ips-look","v":1,"name":…,"look":{…the 15 SavedLook fields…}}` with
  `f` as the literal FIRST key so every emitted file/code/link starts with
  the bytes `{"f":"ips-look"` — that prefix IS the import sniff magic
  (import.ts `sniff` gained kind "look"). Numbers rounded to 4 decimals; a
  full named link is ~550 chars. Encoding: UTF-8 → base64url (unicode-safe
  names). SECURITY: payloads are attacker-controllable (anyone can craft a
  link) — token capped at 12k chars and JSON at 8 KB BEFORE parsing, then
  EVERY field is coerced AND clamped to the UI's own slider ranges
  (`coerceLook`; a 1e308 sat lands at 3.0), names are control-stripped, ≤60
  chars, and only ever rendered via textContent.
  CHANNELS OUT (per-slot ⋯ button → the new name & share dialog): **link**
  (`https://jefferson-photo-studio.pages.dev/ir.html#look=TOKEN` — hard-coded
  PRODUCTION origin so a staging sender can't mint staging links, and the
  ir.html path because the SW cache is URL-exact; navigator.share with
  clipboard fallback), **file** (`.ipslook`, saveBlob → share sheet, the
  .cube precedent), **code** (the bare token, clipboard with an in-dialog
  readonly-textarea fallback). Slots gained optional NAMES (flat `name` key —
  old slots parse unchanged, old app versions ignore it; overwriting a
  slot's grade KEEPS its name; batch chooser + aria-labels show names via
  textContent).
  CHANNELS IN (all land in ONE receive dialog): a `#look=` link (parsed on
  load + hashchange; the hash is consumed with history.replaceState BEFORE
  parsing so a reload can never re-offer, and the fragment never reaches the
  network — links work OFFLINE); a `.ipslook` file (sniffed by magic bytes
  through ANY photo input — `openPicked` peels look files off FIRST so a look
  never destroys or joins a photo session — plus a dedicated "Import look
  file…" button); a pasted link/code/JSON (one parser, `parseLookText`;
  textarea on purpose — clipboard.readText is permission-gated on iOS).
  Receive dialog: Try on this photo (applies via the shared `applySavedLook`
  = ONE atomic undo step, exactly like slot Load; disabled with a visible
  explanation when no photo is open), Save to My looks (five honest choices —
  "empty" vs "replaces 'Name'"), Not now.
  VERIFIED headless 53/53 (Chromium, real built app; fail-first PROVEN — two
  planted bugs each caught by exactly the right checks: skipping
  replaceState flipped "hash consumed" + "reload does not re-offer";
  dropping the sat clamp flipped "sat=1e308 clamped to 3"): link round-trip
  applies ALL 15 fields exactly (verified through a real slot-save readback)
  and ONE undo restores every pre-Try value; file round-trip via the real
  #file input AND the dedicated importer; a mixed pick (2 photos + 1 look)
  peels the look and sessions exactly the 2 photos; paste accepts
  link/token/raw-JSON and rejects garbage with the inline error; names
  survive reload/re-save and show in the batch chooser; hostile payloads
  (50k token, junk/truncated base64, f-mismatch, markup-in-name → inert
  TEXT, 1e308/−1e308/string values → clamped/defaulted) all handled with no
  page errors; full-slot save shows five "replaces" labels and touches only
  the chosen slot; OFFLINE: with the SW installed, ir.html#look=… loads and
  offers the look with the network off; axe (color-contrast, button-name,
  aria-dialog-name, label) clean on all three dialogs in BOTH themes (one
  real find fixed: the primary buttons first used a one-off #fff on
  --accent — 2.58:1 in dark — corrected to the calibrated --accent-ink);
  regressions: classic slot Load and the .cube export button still work.
  NEEDS THE OWNER'S HANDS on the real iPhone/iPad: the share sheet feel for
  link/file/code, an AirDrop + Files round-trip of a .ipslook, tapping a
  look link out of Messages (and that it opens the PWA vs a new Safari tab —
  both work, but the feel differs), paste into the textarea, and the ⋯
  button's discoverability. KNOWN LIMIT (flagged, acceptable for R1): the
  "Import look file…" / "Paste look code…" buttons live in the Export panel,
  which needs a photo open — with NO photo open, a look still arrives via
  link or via Open image(s) picking the .ipslook.
- [x] **Import .cube LUTs as looks** — look-sharing release 2 (owner go
  2026-07-18 with the full channel scope; "Continue with the next release"
  same day). SHIPPED same day (cache ips-v75 → ips-v76): import any .cube 3D
  LUT — the free film/cinema LUT universe — and it applies as the LAST colour
  stage on the final display colour, stacking on top of the whole IR grade,
  with a 0–100% Strength slider.
  ARCHITECTURE (the decisions that must not be re-litigated):
  • ONE trilinear formula, three homes: `src/lut3d.ts` sampleLut3d (CPU) is
    mirrored VERBATIM as GLSL in gl.ts (manual 8-tap texelFetch trilinear on
    a NEAREST 3D texture, unit 5) — manual on purpose: WebGL2 won't linearly
    filter 32F textures, and integer texelFetch sidesteps texel-centre
    ambiguity entirely, so GPU and CPU run the same arithmetic on the same
    lattice. Data padded RGB→RGBA32F at upload (RGB32F is driver-fragile);
    re-upload gated on the LUT id in bindPipeline, so strength drags are a
    uniform change only, and the histogram/pick offscreen passes get the LUT
    free (shared bindPipeline).
  • CPU hook at the very END of compileEdit's closure (pipeline.ts) — one
    hook covers single export, batch, AND the .cube EXPORT BAKE: an exported
    .cube now includes the imported LUT composed onto the grade (generateCube
    drives the same closure; proven by the before/after lattice check). .dcp
    can't carry it (different model, dcp.ts skips compileEdit) — Help says so.
  • Parser `src/cubeimport.ts`: TITLE/LUT_3D_SIZE (2..65)/DOMAIN_MIN/MAX,
    comments/CRLF/vendor keys tolerated, strict float rows, N³ exactly, every
    reject a user-facing sentence; 1D LUTs rejected honestly; ≤8 MB. Values
    CLAMPED [0,1] at parse (the 16-bit TIFF path would WRAP on >1); non-unit
    DOMAINs resolved at parse time by resampling onto [0,1]³ (one formula
    everywhere, no domain uniforms; log/HDR domains can't be honoured by a
    display-referred pipeline anyway — clamped resample is the honest best
    effort).
  • Lifecycle: EditParams gained runtime-only `lut` ({id,name,size,data,
    strength}) riding like mask bitmaps. cloneParams clones the WRAPPER,
    shares the immutable lattice by reference; snapSig's replacer now skips
    Float32Array `data` too (else every undo check stringifies 274k floats —
    hazard caught at design time); applySnapshot reads s.params.lut DIRECTLY
    with an instanceof guard (the {...params,...s.params} spread would let a
    pre-LUT snapshot silently inherit the live LUT — second design-time
    hazard); editToJson strips it (durable resume drops the LUT, honestly —
    Help updated); fresh photo open PERSISTS it (creative grade, like
    sat/hue); import/apply/remove/slot-load are each ONE atomic undo step.
  • Storage: `src/luts.ts`, IDB `ips-luts`, SINGLE-ROW per LUT on purpose
    (LUTs are a cache of re-importable files — a lost row costs one
    re-import; batchstore's chunking exists for irreplaceable batch frames).
    Original file bytes stored alongside the lattice so Share re-sends the
    EXACT file (round-trips through our own importer). Cap 25 with an honest
    at-cap message; the panel list shows name · N³ · MB with Apply / Share /
    Delete — the storage-honesty control.
  • Slots/share/batch: a slot carries {lutId, lutStrength} OUTSIDE the
    SavedLook wire fields (links/files/codes still carry the grade only — the
    share dialog says so and offers "Share LUT .cube file" beside it); slot
    rows + batch chooser show a TEXT "LUT" badge; loadSlot resolves the ref
    from IDB before the atomic apply and degrades honestly when the LUT was
    deleted; batch resolves the ref ONCE at start and the summary notes a
    missing LUT.
  VERIFIED headless 62 checks green + 2 fail-first proofs: parser fixtures
  24/24 (asymmetric 2×2×2 axis-order proof, DOMAIN resample, identity 33³,
  CRLF/vendor-key file, 13 hostile inputs all honestly rejected; FAIL-FIRST:
  planted blue-fastest indexing flipped the asymmetric fixture); CPU parity
  3/3 (compileEdit tail == reference mix EXACTLY at strengths 1/0.5/0.15;
  FAIL-FIRST: planted strength-ignore flipped 0.5 and 0.15); browser 35/35
  (Chromium, real built app): GPU within 2 LSB of the reference math at
  strength 1.0 AND 0.5 over a non-trivial grade + channel-coupled 17³
  sinusoid LUT; identity LUT ≤1 LSB; strength 0 BITWISE == no-LUT; exported
  .cube before/after satisfies after(node)==LUT(before(node)) ≤2e-3; full UI
  walk (import → strength → remove restores bitwise → undo/redo → slot badge
  + lutId JSON → LUT re-binds from IDB on load, one undo reverses the whole
  load → share dialog note + shared bytes EQUAL the original file → batch
  chooser badge → device list sizes → delete → honestly degraded load);
  hostile .cube files through the real input alert honestly, bind nothing,
  store nothing; a 2-photo session resume after reload does NOT silently
  re-activate the LUT; axe clean on the new panel block in BOTH themes; R1
  look-sharing harness re-run 44/44 (no regression). NEEDS THE OWNER'S HANDS
  on the real iPad: importing a .cube from Files/iCloud, the strength slider
  feel, a real downloaded LUT's look on the true display, IDB persistence
  across real launches, and Batch-with-LUT output on a real set (the
  resolution path is headless-proven; a full batch zip diff was not run).
- [x] **Looks that travel inside the JPEG + QR share** — look-sharing release
  3 of 3 (owner go 2026-07-18: "Promote to Main and continue"). SHIPPED same
  day (cache ips-v76 → ips-v77). Every exported JPEG can now carry the look
  that made it, and any look can be shared as a QR code.
  TRAVELING RECIPE (`src/lookmark.ts`): the R1 wire-format payload rides as
  an `IPSLOOK\0` APP11 segment, spliced after the leading APPn run (icc.ts's
  APP2 technique; ~600 bytes). export.ts gained `opts.lookRecipe` — main.ts
  builds it via `recipeForExport(currentLook())` for single exports and once
  per batch (concrete look grades only; builtin looks resolve per image and
  auto has no grade — honest scope). Controlled by an HONEST Export checkbox
  ("JPEGs carry their look recipe (anyone opening one here gets offered your
  look)"), default ON. On JPEG open (single-open path), `extractLookFromJpeg`
  scans header segments (stops at SOS, body capped at LOOK_JSON_MAX so a
  hostile file can't make us decode megabytes) → the SAME receive dialog
  offers it, named from the payload or honestly "From <filename>" (single
  exports are unnamed). TIFF never carries a recipe. LUTs are NOT in the
  recipe (grade only — the panel note says so). Help carries the caveat:
  recompression (Photos edits, Messages optimization, social uploads) strips
  the recipe; links/files/codes/QR always survive.
  QR (`src/qr.ts`): a dependency-free byte-mode encoder written from the
  ISO/IEC 18004 spec (no third-party IP) — EC level M, versions 1–26 (~1.5 KB
  cap, far beyond any look link), GF(256) Reed–Solomon, BCH format/version
  info, mask 0. "Show QR code" in the ⋯ share dialog renders the look link on
  a WHITE card (deliberately theme-invariant — scanners want dark-on-light +
  quiet zone) with "Save QR image" via toBlob→saveBlob. Encode-only: the
  phone camera is the decoder.
  VERIFIED headless 34 checks green + 2 fail-first proofs (and R1 44/44 + R2
  33/33 re-run — no regressions): lookmark node fixtures 8/8 (round-trip,
  placement before SOS, unmarked/not-a-JPEG nulls, oversized-body cap,
  unicode; FAIL-FIRST: extract scanning APP10 instead of APP11 flipped both
  round-trips); QR round-trips 5/5 through an INDEPENDENT decoder (jsQR,
  dev-only) across v1→v25 payload sizes incl. unicode (FAIL-FIRST: dropping
  the format-info XOR mask flipped ALL five); browser 21/21 (real export →
  segment present → parses to the exact applied grade → re-import through the
  real picker opens the photo AND offers the look → Try applies exactly;
  checkbox off → no segment; markerless JPEGs offer nothing; on-page QR
  canvas decodes via jsQR to the exact link which round-trips to the exact
  look; Save QR downloads a real PNG; a 2-frame batch zip carries the named
  recipe in EVERY frame (store-method zip walked byte-level); axe clean on
  the dialog with the QR open in BOTH themes). NEEDS THE OWNER'S HANDS on the
  real iPhone/iPad: scanning the QR off a real screen with the camera app
  (headless proves the matrix, not optics/glare), an AirDrop/Files round-trip
  of a recipe-carrying JPEG, the recipe offer feel when opening shared
  photos, and the Export checkbox's discoverability.
- [x] **Aspect-ratio crop presets + Flip the photo** — the core sweep's first
  release (owner go 2026-07-18, "Promote to Main and continue"). SHIPPED same
  day (cache ips-v77 → ips-v78), two queue items in one release — both live
  in the Crop & rotate area.
  PRESETS: a chip row on the crop pill — Free (default, old behaviour),
  Original, 1:1, 4:5, 3:2, 16:9 — aria-pressed + a "✓ " TEXT prefix (never
  colour-only). The preset is a PIXEL ratio mapped into crop-fraction space
  via the display frame's aspect (crop.w/crop.h = R/A; Original ≡ 1). The
  resize path locks by reconstructing the dragged corner (dominant axis wins)
  BEFORE `clampResizeOnPhoto` — whose slide-along-the-anchor-line clamp then
  PRESERVES the ratio by construction, at any straighten angle. Preset taps
  re-inscribe about the current centre inside `cropSafeBound` (one undo step);
  the straighten slider's re-fit keeps the ratio; arming applies the
  remembered choice (localStorage `ips-crop-ratio`, panel-tab pattern);
  Reset crop honestly resets the chip to Free.
  FLIP: two labelled buttons beside Rotate 90° ("⇆ Flip horizontal",
  "⇅ Flip vertical"). Implementation is the INNERMOST source-space mirror
  (`u_flip` bits at the vertex shader's tail; identical composition in
  export.ts toSrc and BOTH CPU inverse mappings), so masks/heals follow the
  mirrored pixels through the inverse mapping exactly like rotation. The
  buttons mean what you SEE: at 90°/270° the handler swaps the source axis.
  View state like rotation (not in the edit/undo; export takes opts.flip;
  fresh opens reset it; a display-vertical flip re-detects sky masks like
  rotate does). The rotate ledger wrinkles (sky regen as an undoable step;
  gradient-mask default geometry) apply to flip identically — recorded there.
  FIELD-CAUGHT BY THE HARNESS (real product bug, fixed this release): the
  lesson-chip rail floats over the photo's top edge and ATE the top handles'
  taps whenever the crop box rode high (a 1:1 box's top-left handle sat under
  a chip and could not be dragged). Cure: setGeoMode tucks the rail away
  while a geometry tool is live and restores it on exit — the crop-banner
  lesson of 2026-07-15, now applied to the rail itself.
  VERIFIED headless 26/26 + 2 fail-first proofs (and the look-sharing R1
  suite re-run 44/44 — no regression): every preset locks the on-screen box
  and HOLDS through real corner drags (drags verified non-vacuous — the box
  must actually move); committed 1:1 canvas is square ±1px and 16:9 within
  2%; Free genuinely unlocks; the choice persists a reload and re-applies on
  arm; a 10° straighten re-fit keeps the ratio; Reset resets the chip. Flip:
  preview mirror verified on a sampled grid, DOUBLE flip restores BITWISE,
  and the export proof is LOSSLESS — both orientations exported as our own
  uncompressed 16-bit TIFF and compared pixel-exact mirrored (≥99.5% of
  samples, watermark rows excluded; the first JPEG-based check drowned in
  4:2:0 block asymmetry — instrument replaced, not the tolerance). Inverse
  mapping proven by tapping the SAME photo feature at mirrored screen
  positions → same tap-WB result. axe clean (chips + flips) in BOTH themes.
  FAIL-FIRST: planted ratio-constraint drop flipped the held-through-drag +
  square-commit checks; planted export-flip-ignore flipped the TIFF mirror
  check (0.15% exact). NEEDS THE OWNER'S HANDS: the chip row's feel on the
  real pill, whether locked-corner drags feel natural on touch, the flips'
  direction reading right, and the hidden lesson rail returning as expected.
  OWNER'S ON-DEVICE PASS (2026-07-18, staging iPad, screenshot IMG_1050):
  "loads into a fail state where it can't work" on a PORTRAIT photo —
  everything else "works great" — plus two asks: each ratio's INVERSE and a
  CUSTOM ratio. ROOT CAUSE: `#stage.cropping #view` reserved a FIXED 96px for
  the pill, sized for the pre-chips one-row pill; the chip row (wrapping to
  two lines on his iPad) grew the pill to ~140px, which floated OVER the
  photo's lower band — box bottom + grid buried, handles at the pill's edge.
  ALL FIXED same day (cache ips-v78 → ips-v79):
  • The view now steps back by the pill's REAL height — setGeoMode measures
    cropTools.offsetHeight into a --croptools-h CSS var on arm (rAF, re-lays
    the overlay) and on window resize while armed; both the bottom and
    max-height calcs consume it (has-session variant too). The chips became a
    single NON-wrapping side-scrolling row (bar-actions precedent) so the
    pill's height stays constant.
  • INVERSE ratios: repeat-tapping the ACTIVE chip flips it (4:5 ⇄ 5:4,
    3:2 ⇄ 2:3, 16:9 ⇄ 9:16, Original ⇄ its inverse; 1:1/Free exempt) — the
    look buttons' repeat-press pattern; the chip label shows the current
    form, aria says "tap again for the inverse", the flag persists
    (ips-crop-ratio-inv).
  • CUSTOM ratio: a "Custom…" chip opens a real dialog (W : H numeric
    inputs + a swap button); validated (positive, finite) and clamped to the
    [1:5 … 5:1] band with an honest inline error; the chip label becomes the
    pair ("✓ 7:5"); persists (ips-crop-ratio-custom) and re-applies on arm.
  VERIFIED headless 27/27 new + the prior crop suite re-run 26/26; FAIL-FIRST
  proven by restoring the original fixed geometry — the portrait gap check
  flips (pill overlaps the box by 22px in the harness viewport; worse on the
  iPad's wrapped pill). Portrait regression check: rotate to portrait, arm →
  all four handles reachable via elementFromPoint AND the pill's top sits
  strictly below the box. Inverse and custom flows walked end-to-end incl.
  reload persistence and hostile input; axe clean on the new dialog in both
  themes. NEEDS THE OWNER'S HANDS: the portrait arm now framing the whole
  box above the pill on the real iPad, the repeat-tap inverse discoverability,
  and the custom dialog's feel.
- [x] **Crop ratio chips — obvious tap affordance, no side-scroll** — owner
  feedback 2026-07-18, given WITH the promote of the aspect/flip + fix
  releases. Two asks, his words: (1) "Does the preset look slightly
  different so it's obvious it can be tapped and reset? I just don't want it
  to lose the functionality by becoming camouflaged as soon as it's used" —
  the ACTIVE chip must still read as a live control (it flips to its inverse
  on a second tap). (2) "I'd like that to be made neater, I don't want to
  have to scroll left and right to see all of the aspect ratios."
  SHIPPED (cache ips-v79 → ips-v80):
  • WRAP, NOT SCROLL — #cropRatios wraps into centered rows (gap 10px/6px;
    the wider row-gap keeps the two rows' −6px hit extensions from fighting;
    44px targets kept); the one-row side-scroll + its plumbing removed. Two
    tidy rows at phone width AND at the pill's 360px cap on iPad.
  • THE SAFETY BUG THAT MADE ONE-ROW "NECESSARY" IS FIXED — the ≤760px media
    override of `#stage.cropping #view` used a FIXED 88px bottom reserve that
    ignored the measured --croptools-h (and won by source order at phone
    widths), so ANY taller pill buried the bottom handles on phones — the
    IMG_1050 geometry, still live despite the var-based wide rule. Now
    var-based (`22px + var(--croptools-h, 66px)`), same numbers at the 66px
    default. AND commitRatioChoice re-measures --croptools-h on EVERY ratio
    commit (relabeling can rewrap the row — including the null-ratio paths:
    tapping Free, Reset crop), not just repositioning the overlay.
  • STILL-A-BUTTON TREATMENT — the active chip keeps the accent fill + "✓ "
    TEXT state and adds the Done button's accent glow plus a tap-again hint
    badge riding the chip: ⇅ on invertible ratios (flips to the inverse),
    ✎ on Custom (re-opens the editor); Free and 1:1 get none — a second tap
    on them genuinely does nothing, labels stay honest. The badge is dark
    glass (rgba(0,0,0,.18)) with the inherited accent-ink glyph — ≥4.5:1 in
    BOTH themes (a white badge FAILS dawn at ~4.2:1; don't "lighten" it).
  • INVERTED ORIGINAL RENAMED — "Original ⇅" → the orientation it becomes
    ("Portrait"/"Landscape", computed from the open photo; chips refresh as
    the tool arms, and the photo can't rotate while armed). To a photographer
    "flip" reads as MIRRORING, and the old ⇅ suffix collided with the new
    hint glyph. aria-labels spell the tap-again action ("tap again for 5:4" /
    "…for the original aspect" / "…to edit the ratio") — mandatory: the
    button's aria-label overrides content, so the glyph is invisible to
    VoiceOver.
  VERIFIED headless 35/35 at BOTH 390×844 and 1024×768 (Chromium, the real
  built app, PORTRAIT test photo — a landscape photo is width-limited in a
  portrait viewport, so the bottom reserve never binds and can't catch a
  reserve regression; found when the planted bug "passed"). FAIL-FIRST
  proven three ways: planted one-row-scroll, fixed-reserve, and stripped-
  hint each flipped their checks to FAIL (the fixed reserve collides exactly
  in Straighten focus — the tallest pill). Checks: no side-scroll + all 7
  chips inside at both widths; ≥2 rows; --croptools-h == pill height after
  arming AND after every relabel path (preset tap, inverse tap, Custom
  Apply, Reset crop); view + handles clear the pill; repeat-tap flips
  4:5 ⇄ 5:4 with the box aspect following; inverted Original reads the
  right orientation; aria-pressed exclusive; hint present/absent per chip;
  contrast computed ≥4.5:1 both themes; axe-core clean on the armed UI both
  themes; no page errors. NEEDS THE OWNER'S HANDS: the two wrapped rows
  read neat on the real iPhone/iPad; the glow + ⇅/✎ badge reads as "still
  tappable"; the glyphs render as text (not emoji) on iOS; mis-tap feel
  between the two chip rows.

- [x] **Black & white for 720nm** — THE FIRST CAPABILITY RELEASE under the
  identity→capability→increment taxonomy: ships as **1.2** (VERSION bumped
  1.1 → 1.2 in the release's own final commit, per "## Versioning"). Scope
  as recorded: channel-weighted mono for the near-monochrome 720nm "white
  forest" frames; basic B&W only — toned mono / duotone deliberately waits
  for the creative release (2.0).
  SHIPPED: a "Black & white — channel mix" block in the IR tab (tab sub now
  "Channel swap, looks & B&W"): an aria-pressed toggle, five named mixes as
  ✓-text chips (Even; Luma = Rec.709 ratio; Red/Green/Blue filter), three
  weight sliders 0..2 and Reset. Weights are NORMALISED — only the ratio
  matters (an all-zero mix reads black, never NaN). Moving a weight with the
  mode off turns it ON (the drag must show its effect; the pressed toggle +
  the photo going mono announce the mode, the toggle is the exit). Pipeline:
  new `bwOn`/`bwMix` on EditParams, applied per-pixel in DISPLAY space AFTER
  the HSL mixer, BEFORE global lum — identical math in compileEdit and the
  shader (u_bwOn/u_bwMix). Deliberate ordering: the mixer's per-band
  Luminance — and Drag on photo to adjust — shape each colour's grey like a
  classic B&W mix (readUvPixel calls neutralise bwOn so TAT/pick classify by
  the pre-B&W colour; pick under B&W routes through readUvPixel instead of
  the grey drawing buffer). Rides saved looks/slots/links/files/codes
  (SavedLook + coerceLook clamps mix to [0,2]; legacy payloads coerce to
  off — old apps just ignore the new keys), session resume, batch, and BAKES
  into .cube; .dcp can't carry it (Help + section note say so). Built-in
  looks reset it (a look is the whole creative grade); the B&W IR / Sepia
  looks keep their existing sat-0 route untouched. Help "Looks &
  adjustments" gained a paragraph.
  RIDE-ALONG A11Y FIX (caught by this release's a11y walk): on an ACTIVE
  look button the unselected norm/R⇄B segment used rgba(7,17,31,…) derived
  for the dark theme's light accent — 3.82:1 dark, 2.1:1 dawn. Both segments
  now use --accent-ink (≥4.5:1 both themes); selected vs not stays an
  INVERSION (filled pill vs outline), the NEVER-CHURN text-state mechanism
  untouched.
  VERIFIED headless (Chromium driving the REAL built app on a real practice
  DNG, + node unit checks on the bundled sources; scratchpad harnesses).
  FAIL-FIRST proven three ways: planted "frame stays colored with B&W on",
  "red-only == blue-only", and ".cube stays colored" all flipped to FAIL.
  22 walk checks: whole frame grey ≤2 LSB (was maxChroma 77 at the probe);
  red-only vs blue-only steer the grey (167 vs 90); chips set sliders + ✓/
  aria-pressed; Reset restores colour + mode off; weight drag auto-enables;
  undo/redo walk the state; slot save→reset→load round-trips; a colour look
  turns it off; the EXPORTED JPEG through the real busy-dialog Save flow is
  mono ≤3 LSB (CPU path); mixer Luminance darkens that colour's grey under
  B&W on the GPU; pick-from-photo under B&W picks the pre-B&W chip; axe
  clean on the IR section in BOTH themes; 44px targets/labels/aria-pressed;
  no page or console errors. 11 unit checks: compileEdit grey over 2000
  random inputs; ratio-only normalisation; ordering (mixer before, lum
  after); .cube lattice all-grey + mixes differ; look-link round-trip;
  legacy/hostile coercion. NEEDS THE OWNER'S HANDS (iPad/iPhone): how the
  five mixes look on real 720nm frames (filter weights are tuned by eye —
  trivial to retune); the chip row layout in the narrow drawer; the section
  note's wording; whether B&W belongs in the IR tab where he expects it.
  TUTORIAL FOLLOW-UP (same release, staging round 2): **Lesson 7 · Black &
  white — the 720nm mono** (tab "ir", four steps: the switch + why a channel
  mix beats zero saturation; named mixes then weights; per-colour grey via
  Drag-on-photo; rides looks + .cube). The frosted "white forest" pair —
  Frosted pine (NIR_1717) and Frosted treetops (NIR_1644), the closest
  frames in the set to a true 720nm near-mono — are its home tiles: tagged
  lesson 6 (opens on the B&W lesson) and PROMOTED into the tutorial-grid
  CORE set (now 15 tiles: seven lesson pairs in lesson order + the two
  variety picks). Library groups untouched (both frames stay in "Lakeside
  forest"; "More" stays empty). The rail/chips/home-lesson plumbing is
  fully generic — no lesson-count constants existed. RIDE-ALONG A11Y FIX
  (caught by this harness): #lessonTitle was an h3 while the only heading
  before it in DOM order is the sr-only h1 — a genuine h1→h3 skip (axe
  heading-order), latent since the lesson card shipped; now an h2, same
  size via CSS (the #library h4 jump remains queued in the accessible-
  overlays roadmap item). VERIFIED headless (lesson-walk harness,
  fail-first proven — planted "still 6 chips" flipped): 7 numbered chips +
  Exit; both tiles in the grid; opening Frosted pine (real fetch + CFA
  decode) lands on the Lesson 7 card with the IR tab active and the B&W
  block reachable; chip toggle collapses/reopens; the lesson is honest on
  its own frame (B&W → grey ≤2 LSB); library "More" absent; axe clean on
  the rail + card over the photo in both themes; no page errors; bw-walk
  22/22 re-run green after the change. NEEDS THE OWNER'S HANDS: the
  lesson's wording, the frame pair choice, the rail wrapping to two rows
  with an 8th chip on the iPhone — and at desktop widths the wrapped
  rail's Exit chip now rides OVER the histogram HUD (chips are z-above it
  and stay tappable/legible on the dark glass; histogram hides on tap as
  ever) — fine headless, his call on the real screen.
  OWNER FEEDBACK, staging round 3 (2026-07-18, "I love the function"):
  B&W gets ITS OWN PANEL TAB next to IR instead of living under the IR
  section — and he likes that a 9th tab completes the grid ("a final full
  menu": the .panel-tabs 3-column grid now fills exactly 3×3, no orphan
  row). DONE: "bw" added to PANEL_TABS after "ir" (TAB_META "Black &
  white / Channel-mix mono, made for 720nm"; the IR sub reverts to
  "Channel swap & looks"); the whole block moved into its own
  `.section[data-tab="bw"]` with "Named mixes" / "Channel weights"
  sub-titles (the old in-section header was redundant against the tab's
  own section header) — SAME control ids, so every handler and harness
  selector is unchanged; setPanelTab is generic (sections/tabs are
  DOM-queried), so the tab wired up for free, exactly like the crop-tab
  precedent. Lesson 7 now opens the B&W tab (step 1 reworded); Lesson 2
  cross-links "that's Lesson 7"; Help says "its own B&W tab". The saved-
  tab localStorage accepts "bw" with no migration (unknown values already
  fall back to Basic). VERIFIED headless: bw-walk 23/23 + lesson-walk
  15/15 re-run green against the tabbed build (both walks now also assert
  the full 3×3 = 9 tabs; axe covers the IR AND B&W sections, both
  themes). NEEDS THE OWNER'S HANDS: the 3×3 tab-grid density on the
  iPhone, and whether "B&W" is the label he wants on the tab
  (alternatives easy: "Mono", or "Black & white" if it fits the cell).
  MERGED TO MAIN 2026-07-18 (owner go; PR #28, rebase) — production
  deploys as 1.2.

- [x] **Learning library tile in the grid** — owner verdict 2026-07-15 (given
  WITH the crop go to main): the dashed "Browse the full example library"
  pill was "completely missable, and most people would never know it was
  there — it's at the bottom and does not stand out." His design: a TILE
  inside the tutorial grid that looks like SEVERAL PHOTOS STACKED behind one
  another, labeled "Learning library", opening the same full-screen library
  overlay; keep the photo count; remove the pill (one way in, not two).
  SHIPPED (1.2.x increment — a discoverability redesign of an existing
  entry, not new capability, so no VERSION bump): the grid's LAST tile, a
  `.gal gal-library` sibling (inherits tile sizing exactly), built in
  main.ts beside the library block. The stack is three REAL thumbs of
  LIBRARY-ONLY frames (honest — they are in there), fanned as photo prints
  (print-white borders + shadows — the stack reads in both themes and in
  grayscale): white-forest Lakeshore pines (NIR_1811) fronts it since
  that's what most of the library looks like, Cloudscape (NIR_1825) and
  the magenta full-spectrum Hillside town peek behind as the variety hint
  (first stack draft had the magenta on top — it dominated and
  misrepresented the set; reordered). Label + "· 53 photos" count sit in
  the standard tile span (count computed from GALLERY.length, never
  hand-numbered); imgs are alt="" decorative per the NEVER-CHURN gallery
  pattern; the button carries aria-label + aria-haspopup="dialog". The
  dashed pill (#libraryOpen + .library-link CSS) is REMOVED. The library
  overlay itself is untouched (its "accessible overlays" conversion to a
  real <dialog> stays queued).
  VERIFIED headless (library-walk harness, fail-first proven — planted
  "pill still there" flipped): pill absent; 16 grid tiles with the library
  tile LAST; label + count present; tile count == #libBody tile total ==
  header count (53); three thumbs loaded, all library-only, distinct fan
  transforms; tap opens the same overlay, six groups, no "More", Close
  closes; axe clean on the grid + tile both themes; no page errors;
  lesson-walk re-run green (its tile count now excludes .gal-library).
  NEEDS THE OWNER'S HANDS: whether the stacked-prints look reads as "a
  library lives here" at iPhone tile size, the three frames fronting it,
  and the count text size.
  MERGED TO MAIN 2026-07-18 (owner "Promote to main"; PR #29, rebase) —
  ships as a 1.2.x increment.

- [x] **Location-data guard — the 🛰 tip** — owner ask 2026-07-18, HIS WORDS:
  "Somewhere it got lost" — the ask had never been recorded; captured and
  built the same day as THE SECOND CAPABILITY RELEASE, ships as **1.3**
  (VERSION in the release's final commit). The ask, in full: an icon (a
  satellite or some other tip) shows when location data is saved with the
  loaded file; tapping it offers removing it and re-saving the file, or
  saving as a copy, the user choosing where; the tip can be turned off in
  settings AND that must be clear to the user; settings also offer
  strip-on-open, explained on the tip itself.
  SHIPPED:
  • DETECTION (src/gps.ts): scans the loaded file's OWN bytes — the EXIF
    GPS IFD in JPEG APP1 and in the TIFF family (DNG/NEF/TIFF share the
    container; SubIFDs + Exif IFD walked too), plus GPS values in JPEG XMP.
    HONEST BY DESIGN: a GPS-version-only stamp (no coordinates) does NOT
    count as location; unparseable/hostile structures degrade to "none
    found" and never block an open; all offsets are file-controlled and
    bounds-checked.
  • STRIP: in-place surgery on a copy — the GPSInfo entry becomes a padding
    tag and the GPS IFD + its external values are zeroed (same-size file,
    valid for every reader); XMP GPS values blank to same-length spaces
    (child tags intact). Every strip is RE-CHECKED before anything is
    claimed clean; a failed re-check refuses to save and says so.
  • THE TIP: a 🛰 "Location saved" glass chip (glyph + TEXT, 44px target)
    bottom-left over the photo, shown only when the loaded file carries
    location (and never over the start screen / crop tools). Tap → a real
    <dialog>: [Save without location] (same filename — the save sheet lets
    the user put it back where the original lives) and [Save a copy without
    location] (" (no location)" suffix); text states both open the save
    sheet SO THE USER CHOOSES WHERE, that the edit is untouched, that
    editor exports never include location, and — clearly — that the tip
    can be hidden and strip-on-open enabled in Settings, with an [Open
    Settings] button that lands ON the Settings section.
  • SETTINGS: the ⓘ dialog gained a real "Settings" section (theme toggle
    moved under it): "🛰 Location tip" (default on) and "Remove location
    when a photo opens" (default off), each with a one-line explanation.
    Keys ips-loc-tip / ips-loc-strip.
  • STRIP-ON-OPEN stays honest: it cleans the app's WORKING copy (so
    session/batch storage never holds location — guardLocation wraps every
    importFile), but the tip still shows and the dialog says plainly the
    ORIGINAL file keeps its location until a clean version is saved.
  • Help gained a Tips bullet; privacy.html gained a "Location data in
    your photos" section (the check and removal run locally).
  VERIFIED HEADLESS, fail-first proven (planted "stripped TIFF still
  reports location" and "tip stays hidden on a GPS photo" both flipped).
  17 node unit checks (gps.ts on synthetic fixtures): TIFF coords
  found/stripped/re-checked clean, same length, trailing bytes intact,
  rationals actually zeroed; version-only stamp ≠ location; JPEG EXIF
  end-to-end; XMP attribute + element forms (rdf tags survive); empty XMP
  values ≠ location; hostile offsets → no throw, strip refuses; real
  practice DNG scans clean (no false positive). 24 browser checks (real
  built app, real gallery JPEG with a genuine injected EXIF GPS block):
  tip shows (and not on clean files); dialog wording both states; save
  copy → downloaded bytes PROVABLY clean by node re-scan, same size,
  honest " (no location)" name; re-save keeps the original name; the
  cleaned file re-opens with no tip; settings toggles work, persist, and
  hide the tip immediately; strip-on-open cleans while the tip stays
  honest; Open Settings lands in the ⓘ dialog; axe clean on the dialog +
  settings in both themes; no page errors.
  NEEDS THE OWNER'S HANDS (iPad): the 🛰 glyph renders as he pictured it;
  the chip's bottom-left home; the dialog + settings wording; the real
  share-sheet feel of "re-save over the original" on iOS (headless proxies
  it as a download); and a REAL SnapBridge-tagged NEF from his camera —
  the harness GPS block is synthetic (structurally identical, but his
  genuine file is the true test).
  KNOWN LIMITS (recorded, deliberate): HEIC/PNG location isn't handled
  (PNG eXIf is vanishingly rare; iOS HEIC arrives transcoded) — the strip
  refuses rather than guesses on unknown containers; a session photo
  resumed after a reload re-scans its STORED bytes, so a pre-setting
  stored copy still reports honestly, but the "cleaned on open" nuance
  doesn't survive a reload (the tip then reads as normal found-location).
  MERGED TO MAIN 2026-07-18 (owner "Promote"; PR #31, rebase) —
  production deploys as 1.3.

- [x] **Landing-page welcome — the first-visit card + the ⓘ button** — owner
  ask 2026-07-18: the Studio landing page should pop up for NEW users
  explaining the purpose of the app and the tool family, how to install,
  the benefits, and that installing is OPTIONAL — and the same information
  must stay reachable behind an information icon after dismissal.
  SHIPPED (a 1.3.x increment — onboarding for existing surfaces, not new
  capability): a real <dialog id="welcomeDlg"> on index.html — purpose
  (free, entirely on-device, no account/tracking, offline), the family
  (Infrared Editor + Macro Studio, one line each), "Installing is
  optional" with the benefits (full-screen, own icon, opens offline,
  "nice to have, never required"), how to install (Safari Share →
  Add-to-Home-Screen / Install app menu) pointing at the page's existing
  full install section, and a closing line saying exactly where to find
  the card again. Auto-opens ONCE for new visitors
  (localStorage studio-welcome-seen, set on ANY close path — Got it, tap
  outside, Esc; private mode reads as seen so it never nags); a new round
  ⓘ button (44px, aria-label, aria-haspopup) top-right of the launcher
  reopens the SAME card forever after. chooser.ts stays tiny (a dozen
  lines, no new imports); styles in launcher.css on the launcher's own
  tokens, both themes.
  VERIFIED headless (welcome-walk harness, fail-first proven — planted
  "no pop-up for a new visitor" flipped): auto-open on a fresh context;
  content states purpose/family/install/optional/where-to-find-again
  (nbsp-normalised text match); Got it closes + persists; reload shows
  nothing; ⓘ reopens; tap-outside and Esc dismiss AND count as seen (a
  second fresh context proves Esc); doors stay live; axe clean on the
  open card in both themes; no page errors.
  NEEDS THE OWNER'S HANDS (iPad): the card's tone/wording, the ⓘ button's
  corner spot vs the notch/safe-area on his devices, and whether the
  auto-open feels welcoming rather than in-the-way on a first real visit.
  OWNER REWORK WITH THE PROMOTE (2026-07-18): "you're asking a user to
  read two paragraphs before figuring out how to install — they'll never
  make it." REBUILT INSTALL-FIRST: one lead line, then a boxed accent
  install card ("Put it on your Home Screen" + an OPTIONAL badge, two
  numbered steps: Share → Add to Home Screen, with the Android line and
  the it's-optional sentence as fine print inside the box), THEN the
  two-tool list, trimmed. RIDE-ALONG CONTRAST FIX (caught by the walk):
  the badge's --txt-2 fell under 4.5:1 on the accent-soft box in dawn →
  full --txt (the pill shape carries the badge look). Walk re-run 18/18
  incl. a new DOM-order check (install steps BEFORE the tool list) and a
  close-event race fix in the harness (the dialog "close" event that
  records seen fires a task after close()).
  MERGED TO MAIN 2026-07-18 (owner "Promote to main" with the rework
  note; ships as a 1.3.x increment).

- [x] **Display-P3 JPEG export** — THE THIRD CAPABILITY RELEASE, ships as
  **1.4** (VERSION in this release's final commit). The recorded trap —
  "P3 primaries in the embedded ICC AND the pixel encode actually emitting
  P3-encoded bytes — the pair must land together or colors shift" — is now
  ENFORCED BY HARNESS, and it caught a real colorimetry bug during the
  build (below).
  SHIPPED: JPEG exports are Display P3 — every final display colour is
  re-expressed through src/icc.ts srgbDisplayToP3Display (true-sRGB
  linearize → the standard sRGB→P3 linear matrix, both D65 → true-sRGB
  re-encode) and the file carries a REAL Display-P3 ICC v2 profile
  (D50-adapted P3 colorants + the true sRGB TRC as a 1024-point curv
  table — that IS Display P3's actual transfer curve). Same appearance as
  the preview BY CONSTRUCTION (sRGB ⊂ P3; identical curve both ways, so a
  colour-managed viewer reproduces the preview essentially bit-for-bit).
  The practice-photo corner mark is blended into the P3 pixels directly
  (its layer converted too — drawImage of an sRGB-intent layer onto P3
  bytes would mislabel the mark). 16-bit TIFF deliberately STAYS sRGB
  (the hand-off-to-other-editors format); .cube/.dcp untouched (they
  operate on the pipeline's display RGB, which is unchanged — only the
  file-level expression moved). Export-tab note + Help "Works with" say
  what saves as what. NO gamut expansion in this release: the pipeline
  still works and clamps in sRGB display space, so P3's extra range is
  container headroom — a real wide-gamut unlock would mean a P3 preview
  canvas (drawingBufferColorSpace) and moving the pipeline's display
  space, which changes what every display-space tool and exported
  .cube/.dcp means. That is a DESIGN DECISION with cross-device
  consequences, recorded as an open question, not smuggled in here.
  THE BUG THE HARNESS CAUGHT (recorded so it's never re-learned): the
  first build used the pipeline's internal gamma-2.2 fiction for the
  conversion + profile. Browsers treat canvas bytes as TRUE (piecewise)
  sRGB, so the roundtrip mismatched — deep shadows came back ~6 LSB dark
  and the parity walk failed at 35 (also exposing an instrument flaw:
  drawImage DOWNSCALING filters <img> and canvas sources differently —
  block means must be computed in JS from natural-size pixels on both
  sides). Corollary now on record: the long-shipped "IPS sRGB (Gamma
  2.2)" profile carries the same nuance — viewers render exported
  TIFF/old-JPEG deep shadows a few LSB darker than the app preview.
  Pre-existing, invisible in practice, candidate for a future increment
  (switching the sRGB profile's TRC would subtly change every existing
  export's rendering — owner's call, not urgent).
  VERIFIED: fail-first proven TWO ways (planted "sRGB red unchanged by
  the conversion" unit + the strip-the-ICC walk plant — the exact
  pair-mismatch failure — flipped at maxDiff 9.8 vs tolerance 5). 9 unit
  checks: neutrals identity; sRGB red → the CANONICAL P3 (0.9175,
  0.2002, 0.1388); bounded + monotone; profile colorants are the
  D50-adapted P3 values summing to D50 white; tabulated true-sRGB TRC
  midpoint 0.214; sRGB profile byte-identical for TIFF; APP2 embed
  round-trips. 6 walk checks against the real app + real RAW export
  through the busy-dialog flow: Display-P3 profile present, sRGB tag
  gone, PARITY preview==decoded export at maxDiff 3.3 (tolerance 5, q92
  JPEG), TIFF still sRGB-tagged, no page errors; bw-walk 22/22 re-run
  (mono exports stay exactly mono — neutrals are identity under P3).
  NEEDS THE OWNER'S HANDS (iPad — the true P3 screen): an exported JPEG
  next to the app preview in Apple Photos (they should be
  indistinguishable), and one social-upload round trip (recompressors
  convert tagged P3 correctly, but his pipeline is the real test).
  MERGED TO MAIN 2026-07-18 (owner "Promote"; PR #34, rebase) —
  production deploys as 1.4.

- [x] **Keep EXIF in exports** — THE FOURTH CAPABILITY RELEASE, ships as
  **1.5** (owner directive "get through these to creative"). Exported JPEG
  and 16-bit TIFF now carry the HONEST SUBSET of the original's EXIF:
  capture date/time (DateTimeOriginal, 0x0132 fallback), Make/Model, lens
  (LensModel), and the exposure triangle (ExposureTime/FNumber as RAW
  rationals so 1/320 s round-trips exactly, ISO, FocalLength) — plus
  Software = "Photography Studio" for provenance.
  ARCHITECTURE (the load-bearing choice): the EXIF block is FRESHLY BUILT
  from a whitelist (src/exif.ts: readExifSubset — bounds-checked like
  gps.ts, walks JPEG APP1 / TIFF IFD0+ExifIFD+SubIFDs — then
  buildExifApp1 / the shared TiffEntry lists), NEVER copied wholesale. So
  GPS structurally cannot ride (the builder has no field for it — the
  location guard stays airtight), Orientation is never carried (export
  pixels are already rotated; a copied flag would double-rotate), and no
  maker notes/thumbnails bloat. Sources with no EXIF (the binned practice
  DNGs) export with NONE — nothing fabricated. JPEG: APP1 inserted before
  the ICC APP2 (convention); TIFF: writeTiff16 interleaves Make/Model/
  Software/DateTime into IFD0 (ascending-tag flush) + an Exif IFD before
  the pixel strip (dataOffset kept even for the Uint16 view). Batch
  exports inherit (same exportImage). Help "Works with" says so.
  VERIFIED, fail-first proven two ways (planted "built EXIF carries the
  source's GPS" unit + planted "export carries no EXIF" walk both
  flipped). 10 unit checks: full-subset read; build→re-read round trip
  (our reader as structural validator); NO 0x8825/0x0112 in the built
  block; findLocation clean; Software present; sparse (date-only)
  round-trip; practice DNG → null; truncated/hostile → no throw. 11 walk
  checks (real app, real photo + injected EXIF/GPS/orientation APP1):
  location tip still fires on the fixture (both features coexist);
  exported JPEG AND TIFF re-read with the exact subset (1/500, ISO 200,
  the Z 50 strings); location NEVER in either export; no orientation tag;
  the exported TIFF RE-OPENS in the app's own decoder; EXIF-less source →
  EXIF-less export; no page errors. p3-walk re-run green (parity 3.3 —
  the new APP1 doesn't disturb the profile pair).
  NEEDS THE OWNER'S HANDS: export one of HIS real NEFs and check Photos
  shows the capture date (not the export date) and the camera/lens line;
  confirm a strip-on-open cleaned file still exports with its date.

- [x] **Quality downscale on scaled exports** — core sweep, shipped as a
  1.5.x INCREMENT with the EXIF release round. The 50%/25% exports used to
  keep every Nth source pixel (nearest-neighbour decimation — aliasing,
  moiré, jagged edges). Now they BOX-FILTER: each output pixel averages an
  ss×ss supersample grid (2×2 at 50%, 4×4 at 25%) placed in OUTPUT space
  and mapped through toSrcF, so the filter stays correct under crop,
  rotation, STRAIGHTEN and flip alike (a source-space rect would shear
  under a straighten angle — the trap). Averaging happens on LINEAR light
  (physically correct anti-aliasing); the edit runs once per output pixel
  on the averaged sample, so denoise/detail/glow/mask semantics are
  unchanged. Full-size exports keep the 1-tap fast path; scaled exports
  now cost roughly a full-res pass (the price of the quality). VERIFIED
  (downscale-walk, fail-first proven — planted "still patchy" flipped at
  spread=0): a 512px ONE-PIXEL CHECKERBOARD exported at 25% comes out
  perfectly uniform (25 probes, spread 0, mid-tone 173) where decimation
  gave pure black/white patches; p3-walk (parity 3.99), exif-walk and
  bw-walk (mono exact) all re-run green THROUGH the box filter.

- [x] **Close the export double-tap fall-through** — shipped as a 1.5.x
  INCREMENT same round (the queue item's rescoped remainder). busySave now
  carries a re-entrancy guard: disabled across the await (released in
  finally so a cancelled share sheet can try again); handler body moved to
  saveBusyPending(). VERIFIED in downscale-walk: two synchronous taps on
  Save produce exactly ONE download; no page errors.

- [x] **Per-channel R/G/B curves** — THE FIFTH CAPABILITY RELEASE, ships as
  **1.6**. The Tone tab gained a CHANNEL CHIP row (All / Red / Green /
  Blue — the ✓-text + aria-pressed mix-chip pattern, an adjusted channel
  wears a "•" TEXT badge) that RETARGETS the existing curve widget and
  five sliders onto the chosen curve — no second widget, no 15 new
  sliders; the widget's path also re-strokes in the channel's hue
  (redundant cue only, the chip text carries the meaning). Reset relabels
  per channel ("Reset red curve") and resets only the active curve.
  PIPELINE: toneR/G/B on EditParams — the same five-point monotone-cubic
  model, applied INDEPENDENTLY per channel in display space right AFTER
  the master tone curve (master shapes the light, channels steer the
  colour; the mixer then classifies the steered hue). GPU: one RGBA8
  256×1 texture (unit 6) holds all three curve LUTs; branch-gated
  u_toneRgbOn; setToneCurve extended (draw()'s tone key covers all four
  curves). clampToneOrder now orders all four (loads can arrive
  unordered). Rides looks/slots/links/codes (coerceLook clamps each
  curve; legacy payloads coerce to identity), session resume, batch, and
  BAKES into .cube (proven: grey lattice points come out steered). .dcp
  unchanged (its tone stays contrast-derived — recorded).
  VERIFIED, fail-first proven two ways (planted "red curve moves green"
  unit AND GPU-walk variants both flipped). 8 unit checks: red-only
  channel isolation to 1e-6; identity no-op; composes AFTER master
  (closed-form match); .cube grey point red-lifted; link round-trip;
  legacy identity; hostile clamp. 15 walk checks on the frosted
  near-neutral frame: chips (All default), GPU red lift dR=48 with
  dG,dB ≤ 1; widget class re-stroke; "•" badge live during slider drags
  (a missed updateToneChanUI in syncFromUI was caught by the walk and
  fixed); channel-named reset; All keeps the untouched master; undo/redo;
  slot round-trip; UI-exported .cube grey point steered; axe clean both
  themes; no page errors. bw/p3/lesson walks re-run green (bw-walk's
  chip-target check now measures only VISIBLE chips — the tone chips sit
  in a hidden tab during that walk).
  NEEDS THE OWNER'S HANDS: the channel-chip flow on the iPad (does
  retargeting the one widget feel right vs separate curves), the three
  stroke hues over both themes, and a real grade using Blue-highlights
  to un-cool a sky.
- [x] **Accessible overlays — Library, Quick look and Busy became real
  dialogs** — shipped 2026-07-19 as an increment (1.6.x), closing the last
  core-sweep queue item before Creative 2.0. The three `.hidden`-flip
  overlays are now native `<dialog>`+showModal() (free focus trap, Escape,
  focus restore, inert background): #library and #quickLook as full-screen
  dialogs (transparent ::backdrop, `[open]{display:flex}`), #busy as a
  centered card over a scrim. Quick look frees its previews on ANY close —
  a `close` listener runs closeQuickLook() when quickItems is non-empty
  (closeQuickLook empties it BEFORE calling close(), so programmatic closes
  can't recurse). #busy EATS cancel (preventDefault) — Escape mid-export
  would hide the overlay while the job runs; its buttons stay the only
  exits. NEW SHARED ASK/NOTICE DIALOG (#askDlg, main.ts askDialog/
  noticeDialog): askDialog(title, body, okLabel, cancelLabel) resolves
  "ok" | "cancel" | "dismiss" — dismiss (Escape) always means CHANGE
  NOTHING; noticeDialog is the one-button variant (hides askCancel,
  restores it after). Migrated: the append-to-session confirm() and the
  previewNotice alert(). Library h4 group headers → h3 (h2 dialog title,
  no heading jump). PANEL TABS finished: ir.html ptabs carry ids +
  aria-controls, sections are role=tabpanel + aria-labelledby; roving
  tabindex in setPanelTab (active 0, rest -1); Arrow keys wrap, Home/End
  jump, arrows move focus AND selection (the 1-D order matches the
  wrapping grid).
  VERIFIED (headless, overlay-walk.mjs, fail-first proven via PLANT=esc —
  asserts Escape kills the busy overlay; FAILS on the healthy build): 28
  checks — library modal open/heading/Escape; axe clean on the OPEN
  library, ask dialog (both themes); quick look decode, Escape frees
  previews (grid emptied), Keep → editor; ask dialog on a 3rd pick over a
  2-photo session with honest labels, Escape changes nothing, OK grows the
  strip to 3, Cancel starts fresh; roving tabindex, ArrowRight/Left/Home/
  End, tab↔tabpanel ARIA wiring; busy survives Escape mid-render AND on
  the save card, role=status announcement, Close works; a library pick
  closes the dialog into the editor; no page errors. Regression walks
  re-run green: downscale (busy double-tap guard), curves, bw, exif, p3,
  loc. The old a11y-walk allowlist lived in a prior session's scratchpad
  (gone with it) — overlay-walk.mjs is the successor and checks these
  dialogs directly.
  NEEDS THE OWNER'S HANDS: VoiceOver on the real iPad — the library and
  quick look as modals (background truly silenced), the ask dialog's
  three-way feel, and that Escape/scrim behavior matches muscle memory.
- [x] **Color grading — shadow / midtone / highlight wheels** — THE CREATIVE
  RELEASE OPENS: ships as **2.0** (the owner's declared identity change,
  2026-07-18; later Creative capabilities bump the middle — 2.1 mixer etc.).
  A new full-width **Grade** tab (the 10th; `.ptab[data-tab="grade"]` spans
  row 4 until the coming Creative tabs complete the 4×3 grid).
  WHEELS: `grade: number[7]` = [hueS, amtS, hueM, amtM, hueH, amtH,
  balance]. Three tint wheels (drag the puck: angle = hue matching the CSS
  conic ring — 0° at 12 o'clock, clockwise; distance = amount), each
  PAIRED with native Hue/Amount sliders as the accessible path (the
  tone-widget pattern: widget pointer-only + aria-hidden, sliders + a text
  readout "220° · 60%" carry the meaning). Pipeline: a pure-chroma offset
  per band — gradeTintVec(hue) = hsv2rgb(h,1,1) minus its Rec.709 luma, so
  toning NEVER moves luminance (unit-proven to 4e-3) — weighted by
  smoothstep bands over display luminance (partition of unity;
  balance ±1 shifts the shadow/highlight crossovers by ±0.2). Applied
  AFTER bwOn (tones mono — that's the whole toned-mono story), before
  global lum. GRADE_K = 0.35 (pipeline.ts) is hardcoded 0.35 in the
  shader with a pointer comment. PARITY BY CONSTRUCTION: bindPipeline
  computes the tint vectors with the same gradeTintVec the CPU uses and
  hands them to the shader as uniforms (u_gradeTintS/M/H + u_gradeAmt +
  u_gradeBal). Bakes into .cube automatically (no uv dependence); .dcp
  CANNOT carry it (dcp.ts doesn't run compileEdit — like B&W, recorded).
  TONED MONO: preset chips (Sepia/Selenium/Cyanotype/Gold/Split) = bwOn +
  a wheel recipe — NOT a second pipeline stage; a true two-ink duotone
  remains possible later if the owner asks. BW_MIXES chip pattern (✓ text
  + aria-pressed); the B&W toggle/reset also refresh these chips.
  FILM GRAIN: grainAmt 0..1 + grainSize 1..3. Deterministic value noise —
  hash2d (Math.imul u32 mix) + smoothstep-bilinear corner blend, VERBATIM
  uint twin in GLSL; cells resolution-proportional (grainCellPx = size ×
  outH/1200) so the LOOK survives any export scale; amplitude 0.16 ×
  luma hat (0.25 + 0.75·(1−|2L−1|)) — strongest in mids, blacks stay
  black; monochrome push, zero-mean (walk: 24×24 mean moves ≤ 0.8 LSB
  while per-pixel Δ hits 18). Preview draws grain on ITS canvas pixels,
  export on the output grid — same statistics/look, different instance
  (recorded; pixel-identical only when dims match).
  CREATIVE VIGNETTE: vigAmt −1..1 (negative darkens) + vigMid 0..1.
  Radial smoothstep over CROP-LOCAL uv — walk-PROVEN to follow a 1:1
  crop — unlike the source-anchored lens vignette. Both grain + vignette
  ride at the very END (after the imported LUT): shader uses a new
  v_cropUv varying (the vertex shader's pre-crop output fraction — the
  same (x+0.5)/w the export loop hands to the pipeline.ts twins
  applyGrain/applyCreativeVignette between edit() and the P3/16-bit
  write); batch inherits via the shared exportImage. NEVER in compileEdit
  → structurally excluded from .cube (unit: lattice string identical with
  them on/off; walk: two UI-exported .cubes byte-identical). Offscreen
  read passes (histogram) see full-frame uv — a known approximation.
  SERIALIZATION: look.ts 4-point (grade clamps per-index: hue 0..360,
  amt 0..1, bal −1..1; hostile 1e308 clamps; legacy payloads coerce to
  identity), slots, links/codes, session resume, batch, applyLook reset,
  origParams, establishFreshEdit. Lesson 8 "Grade the mood" (tab:
  "grade"); Help gained "Grade — wheels, toned mono, grain & vignette";
  export-tab note updated in-section.
  VERIFIED (fail-first BOTH harnesses): 24 unit checks (grade-unit,
  esbuild+node — partition of unity, balance direction, bit-identical
  identity, luminance invariance, band separation, sepia warms/cyanotype
  cools, round-trip/legacy/hostile, hash determinism + zero-mean +
  bounds, cell scaling, vignette shape ×5, .cube in/out) with PLANT=leak
  (shadow tints highlights — FAILS healthy) and PLANT=bake (spatial in
  the lattice — FAILS healthy); 28 walk checks (grade-walk, headless on
  a luminance-ramp fixture — full-width tab, band structure, shadow
  wheel dB=+37 on the dark side with the bright side Δ0, wheel DRAG
  lands hue 90/amt 91 in the sliders, undo/redo, slot round-trip, Sepia
  chip → mono+warm, grain on/off/exact-restore, vignette corner −20 with
  centre Δ≤2, vignette follows the 1:1 crop (dG=45 on the cropped
  corner), .cube exclusion + dark-lattice blue-lift, exported 320×320
  JPEG corner 21 vs centre 134 + grain variance 54, axe clean both
  themes, no page errors) with the walk-level PLANT=bake also flipped.
  Instrument lesson re-learned: the first unit run "failed" 4 checks
  because the harness's neutralParams() never spread its overrides —
  suspect the instrument first. Regression walks re-run green: curves,
  bw (its 9-tab pin updated to 10 — the intended change), downscale,
  overlay, p3, exif, loc. VERSION → 2.0 in this release's own commit.
  NEEDS THE OWNER'S HANDS: wheel-drag feel on the iPad (puck size, the
  full-width Grade row placement he hasn't blessed yet), grain character
  on the real panel at his usual export sizes, the five toned-mono
  recipes against his taste (they're my calibration), and strong tints
  through the Display-P3 JPEG path in Apple Photos.
- [x] **Custom false color — full 3×3 channel mixer** — CREATIVE, ships as
  **2.1** (the first middle-bump within Creative). A new "Custom false
  color — channel mixer" section at the bottom of the Grade tab: nine
  sliders in three OUTPUT rows (Red/Green/Blue output ← from red/green/
  blue, each −2..2) + preset chips (Identity, R⇄B swap, Aerochrome,
  Copper, Rotate) using the BW_MIXES ✓-text + aria-pressed pattern.
  PIPELINE: `mix3: number[9]` row-major [rr,rg,rb, gr,gg,gb, br,bg,bb],
  applied in LINEAR space right AFTER the swap and BEFORE the hue matrix
  (so swap + mix + hue compose) — the R⇄B swap is exactly the special
  case [0,0,1, 0,1,0, 1,0,0] (walk-proven ≤2 LSB against the swap
  button on the GPU). GPU: `u_mix3On` + `u_mix3` (mat3). GLSL mat3 is
  COLUMN-major, so bindPipeline uploads the TRANSPOSE of the row-major
  param — then `u_mix3 * c` equals the CPU's M·input (parity by
  construction; watch this on any future matrix uniform). BAKES INTO
  .cube (linear, no uv) AND .dcp (creativeLinear got the same after-swap
  matrix — best-effort in a hue-sat map; a mixer that shifts luminance
  per hue only approximates). MIX3_DEFAULT identity; mix3IsIdentity gate.
  Threaded like grade: look.ts 4-point (per-element clamp −2..2; legacy →
  identity; hostile 1e9 clamps), slots, links/codes, session, batch,
  applyLook reset, origParams, establishFreshEdit, neutralLook.
  VERIFIED, fail-first: 11 unit checks (mix3-unit — identity no-op,
  swap-special-case to 1e-6, arbitrary remix, negative-weight invert,
  .cube bake, .dcp differs, round-trip/legacy/hostile) with PLANT=leak;
  14 walk checks (mix3-walk — 9-slider/3-row structure, R⇄B preset ==
  swap button on the GPU, slider remix dR=50, GPU↔JPEG export parity
  ≤10 LSB, undo/redo, reset, slot round-trip, .cube identity-vs-mixer
  difference + channel-order rotation at pure-red, axe both themes) with
  PLANT=noswap. Instrument lessons: (1) a channel ROTATION leaves grey
  neutral (grey is permutation-invariant) — probe non-grey points; (2)
  the practice DNG opens with the default IR swap look, so absolute cube
  outputs are confounded — the walk compares an identity-mixer cube to
  the Aerochrome cube (everything else identical) to isolate the mixer.
  Regression: grade/curves/bw/p3 walks re-run green. VERSION → 2.1.
  NEEDS THE OWNER'S HANDS: the preset recipes (my calibration) and
  whether the mixer belongs in the Grade tab or wants its own home on
  the real iPad.
- [x] **Stickers — UFOs in the trees** — CREATIVE, shipped as a BETA
  straight to main (owner's 2026-07-19 gate exception; he's most excited
  about this one). VERSION unchanged (still 2.1 — this is an increment on
  the Creative line, not a new capability number; bump the middle when the
  owner blesses stickers out of beta or the next capability lands).
  A new **Stickers** tab (11th; row 4 = Grade + Stickers, Warp completes
  the 4×3). Tap an asset chip (Saucer/Alien/Saturn/Beam — in-house SVG art
  rasterised to public/stickers/*.png, precached) to drop it at screen
  centre; DRAG it on the photo; sliders Size/Spin/Peek-behind + a
  bright/dark chip. Remove one / Clear all.
  ARCHITECTURE (rhymes with heal EXACTLY — src/sticker.ts): a sticker is
  geometry in image-uv (id, asset, x, y, scale=frac of width, rot,
  occlude, occludeLuma, occludeBright) on `params.stickers`. It composites
  INTO the source before the pipeline — so it inherits the channel swap /
  sub-2000K WB / grade and lands in the IR palette (the owner's "fitting
  for the weird colors": the grey saucer's dome/eyes come out recolored),
  and grain settles over it for free (grain is post-pipeline). Preview:
  syncSpotsToTexture (renamed in spirit) bakes the union of heal+sticker
  dirty rects from the PRISTINE previewSrc — heal first, stickers on top —
  via compositeStickersIntoRect8/F32 + renderer.patchImage; bakedStickers
  mirrors bakedSpots. Export: wrapWithPatches(healed, stickerPatches(...))
  wraps OUTSIDE heal; both samplers are linear so one path serves RAW +
  8-bit; parity is by construction (walk: GPU preview == exported JPEG
  centre ≤12 LSB). Compositing is in LINEAR everywhere (8-bit lifts→
  composites→re-gammas) so preview==export per source.
  OCCLUSION ("peek behind" — the heart of the joke): sticker alpha ×
  (1 − occludeStrength·w), w from a smoothstep over the scene luminance.
  HARD-WON LESSON: the baked source for a RAW is CAMERA-NATIVE linear —
  dim until WB + the colour matrix lift it — so keying occlusion on the
  raw source luma had the ordering WRONG (white IR foliage isn't bright in
  camera-native). Fixed: sticker.ts computes DISPLAY luminance
  (exposure×WB, then the camera matrix for RAW) via an OcclusionCtx threaded
  from main.ts (params.wb×exposure + current.camMatrix) and export.ts
  (src.cam); a soft 1−exp(−3L) curve normalises across sources. Now the
  bright foliage punches through the saucer — it tucks behind the branches.
  Spatial + composition-specific: `stickers` rides cloneParams/applySnapshot
  (undo) and editToJson (session resume — asset keys are strings, no
  bitmaps to strip), but is EXCLUDED from looks, batch, .cube and .dcp
  (they never touch compileEdit; walk PROVES the .cube is byte-identical
  with a sticker present vs cleared). Reset on a new open like spots/crop.
  Direct manipulation: the Stickers tab arms canvas drag (setStickerMode,
  mutually exclusive with heal/crop/masks/picks); a pointerdown hit-tests
  top-down + drags the selected sticker (one drag = one undo); a dashed
  rotated bounding box (#stickerOverlay) is the selection cue.
  VERIFIED, fail-first (PLANT=bake asserts a sticker moves the .cube — must
  FAIL): 15 walk checks (structure, composite-on-add, grade reaches the
  sticker, drag, peek-behind footprint shift mean|Δ|=36, grain-over-sticker
  variance, GPU↔JPEG export parity, .cube exclusion, clear/undo, axe both
  themes, no errors) + a compositor unit check (occlusion binary: white
  sticker over bright scene vanishes). Instrument lessons: (1) a channel
  test over a uniform-white scene can't see a white sticker change —
  measure the coloured footprint; (2) undo didn't refresh the sticker UI
  until updateStickerUI joined syncToUI. Regression: grade/mix3/bw/p3/
  downscale/overlay walks re-run green (grade/bw tab-shape + count asserts
  updated: Grade is now a normal cell, 11 tabs).
  BETA / NEEDS THE OWNER'S HANDS: this is the FIRST sticker cut — drag/
  scale/rotate feel on the iPad, the four art pieces against his taste, the
  peek-behind at full strength (mottled — maybe cap it lower), and whether
  he wants pinch-to-scale/rotate on the sticker itself (currently sliders).
  DEFERRED (recorded, not built): PNG-with-alpha import as a custom
  sticker; auto-seed occlusion from the sky/foliage/colour masks (the
  richer mask-machinery route in the architecture sketch); the beam
  light-cone that BRIGHTENS what it covers (currently a normal-alpha
  translucent cone); the engraved-stipple mono art set. A true two-ink
  duotone and these all remain open if the owner asks.
- [x] **Warp tools — Swirl / Push / Pinch / Bloat** — CREATIVE, shipped as a
  BETA straight to main (owner's 2026-07-19 exception). THE LAST CREATIVE
  QUEUE ITEM — the Creative sweep (grade, mixer, stickers, warp) is complete.
  VERSION unchanged (2.1 beta increment; bump when the owner blesses the
  Creative betas out of beta). A new **Warp** tab COMPLETES the 4×3 tab grid
  (row 4 = Grade, Stickers, Warp — 12 tabs; the grade full-width rule is gone).
  ARCHITECTURE (src/warp.ts): a per-photo UV DISPLACEMENT FIELD (WARP_RES=160²,
  WARP_MAX=0.28 uv). Finger strokes paint du/dv (push = drag vector, swirl =
  tangential, pinch/bloat = radial, aspect-corrected so brushes stay round);
  a smoothstep brush falloff accumulates. Applied as a SOURCE-SPACE REMAP at
  the very top: shader fetchLin reads u_tex at warpUv(uv) (unit 7, RGBA8
  LINEAR); export.ts wraps the source sampler (warpSampler) BEFORE denoise —
  so denoise/detail/the whole pipeline follow the moved image on both sides.
  PARITY: both sides bilinear-sample the SAME encoded RGBA8 field and decode
  identically. HARD-WON: the encoding centres on byte 128 = EXACTLY zero
  (scale 127, not the ±1/255·0.5 offset) — the offset left a ~1.5px residual
  shift in every unpainted cell the moment any warp existed (unit-caught).
  Shader decode `(tex*255-128)/127*WARP_MAX` mirrors warp.ts; WARP_MAX is a
  literal 0.28 in bindPipeline (kept in sync by comment). The field rides
  undo (COPY-ON-WRITE per stroke: startWarpStroke clones du/dv/rgba, `rev`
  bumps — snapshots share the frozen buffer, like brush bitmaps) and the
  session (applySnapshot reads it from the snapshot; editToJson strips it —
  so it resets on reload, like masks). EXCLUDED from looks/batch/.cube/.dcp
  (compileEdit never sees it; walk proves the .cube is byte-identical warp vs
  reset). Reset on a new open. Direct manipulation: setWarpMode arms the
  canvas (mutually exclusive with heal/crop/masks/stickers/picks); a stroke
  paints du/dv → encode → syncWarpField uploads (rev-compared) → draw.
  VERIFIED, fail-first (unit PLANT=leak asserts an untouched cell displaces;
  walk PLANT=bake asserts warp moves the .cube — both FAIL healthy): 10 unit
  checks (neutral=0, push direction, encode round-trip, GL-bilinear midpoint,
  warpSampler remap, empty) + 9 walk checks (4 tools + sliders, a swirl bends
  the stripes mean|Δ|=101, export parity mean|Δ|=3.3 preview-vs-JPEG, .cube
  exclusion, reset restores, undo brings the swirl back, axe both themes, no
  errors). Regression: bw/grade/mix3/sticker/overlay/downscale walks green
  (bw tab count → 12). Lesson 10 + Help "Warp — bend the picture" added.
  BETA / NEEDS THE OWNER'S HANDS: warp feel on the iPad (brush size/strength,
  the 160² field resolution — bump if smooth warps look blocky), whether the
  four tools are the right set, and 8-bit field precision on gentle warps.
  DEFERRED: a live brush-ring cursor; higher-res or float field; per-photo
  session persistence of the field (currently resets on reload like masks).
- [x] **Sticker drag lag — ghost during the gesture, bake on release** —
  owner-caught on device 2026-07-19 ("stickers add a ton of lag once added").
  Cause: `syncSpotsToTexture` re-baked the CPU composite EVERY drag frame, and
  baked BOTH the old and new rects — ~4.7M px × (heal bake + composite) ≈
  200–300M ops/frame for one scale-0.55 sticker. Fix: a `liveSticker` index is
  held OUT of the bake during a drag/size/spin gesture; a cheap `<img>` ghost
  (`#stickerGhost`, raw asset positioned via imageUvToClient — centre + rotation
  + on-screen width) tracks the gesture, and the real composite bakes ONCE on
  release (drag `endPointer`; sliders' `change` event — Size/Spin ghost, while
  Peek-behind bakes live since a static ghost can't show occlusion). Also
  folded a wb×exposure occ-signature into the `stkSame` guard so a WB change
  re-bakes occlusion (was a latent staleness bug). Instrumented
  `window.__stickerBakes()` for the harness. VERIFIED (sticker-lag-walk): a
  24-move drag bakes ONCE mid-drag (the remove) + once on release (total ≤3,
  was ~24), ghost visible during / hidden after, the composite lands at the
  drop point; sticker-walk re-runs green (its programmatic scale set now fires
  `change` to commit, like a real slider release). NEEDS THE OWNER'S HANDS:
  the drag/resize feel on the iPad, and that the grey ghost→recolored snap on
  release reads fine (a recolored ghost is a later option).
- [x] **Stickers v2 — blend in, don't decorate (art + auto-match + adjust +
  import)** — owner-caught on device 2026-07-19: "those aren't stickers, they're
  bright white shapes… blend funny things into the picture that look like part
  of it." Four moves, all BETA straight to main (Creative exception):
  (1) ART — the in-house set redrawn with rich SVG shading (radial form
  gradients, feTurbulence surface/fur, feDisplacementMap furry outlines, soft
  edges) and the catalog grown 4→8: saucer, alien, Saturn, beam PLUS four
  Bigfoot poses (stand / walk / peek / howl) as dark furred silhouettes
  (public/stickers/*.png, auto-precached). (2) AUTO-MATCH ON ADD — a placed
  sticker samples the preview canvas under its footprint (sampleScenePatch,
  mean LINEAR RGB) and seeds bright (toward the scene's luma, clamped
  −0.85..0.4), warmth (from the scene R/B log ratio), and a gentle contrast
  −0.18 so it isn't crisper than the grainy photo (autoMatchSticker). (3)
  PER-STICKER ADJUST — Sticker gained bright / contrast / warmth / sat
  (identity 0); matchAsset applies them to the asset's LINEAR colour before the
  over-blend (brightness scale, contrast about mid-grey 0.18, warmth R↑/B↓,
  saturation toward luma). UI: a "Match to the photo" slider group + a
  "Match to photo" button that re-runs auto-match. (4) IMPORT YOUR OWN PNG —
  a file input → createImageBitmap → makeStickerAsset → a runtime asset keyed
  imp-<uuid> (URL.createObjectURL), added + auto-matched; SESSION-ONLY (bytes
  don't survive reload, like masks). makeStickerAsset now also computes an
  alpha-weighted mean linear RGB for the match math. Adjustments/mask ride the
  export for free (stickerPatches → compositePixel reads the fields).
  VERIFIED: sticker-adjust unit (8 checks — mean, brightness ±, warmth ±,
  saturation collapse, mask hide/show; PLANT=leak asserts bright 0 is a no-op →
  fails), sticker-walk (chip count 4→8) + sticker-lag-walk green, build clean,
  all 8 PNGs precache. NEEDS THE OWNER'S HANDS: the art taste on the real iPad
  (are these believable-in-scene?), auto-match STRENGTH (is the seed close
  enough, or too timid/aggressive?), and the imported-PNG session-only limit
  (persist via IndexedDB later if he wants his cutouts to stick).
- [x] **Stickers v2 — paint to tuck behind + two-finger resize/spin** — the
  last of the owner's sticker rework (2026-07-19): "paint to remove portions so
  it fits in the background… paint to restore portions." BLEND: a "Paint on the
  sticker" toggle turns canvas strokes from move→paint; "Rub away" drives the
  asset-local mask to 0 (the scene shows through — tuck it behind a branch),
  "Bring back" restores to 255, and "Show the whole sticker again" drops the
  mask. The stroke inverts the SAME transform sticker.ts composites with
  (stickerLocalUv → asset uv), stamps a soft brush into a per-sticker BrushMask
  (capped 384px, aspect-matched), copy-on-write per stroke = one undo step;
  compositePixel already multiplies alpha by the mask so it rides the preview
  AND the export for free. The bake stays cheap: draw() is rAF-coalesced, so a
  drag paints one small-rect bake per frame (maskRev is in the stkSig guard; the
  buffer is stripped from snapSig). PINCH: two fingers on the canvas (Stickers
  tab) resize + spin the selected sticker — captured scale/rot × the live finger
  spread/angle, shown on the ghost, Size/Spin sliders following live, baked once
  on release; one finger still drags, the sliders stay the accessible path.
  VERIFIED (sticker-blend-walk, 14 checks): rub-away reveals the background at
  the centre, bring-back restores it, clear heals the hole, the masked hole
  survives to the exported JPEG (≤14 LSB vs preview), two-finger spread grows
  the sticker + twist spins it, axe clean both themes, no errors; PLANT=noerase
  (skip the stroke) makes the reveal check FAIL. sticker-walk + sticker-lag-walk
  regressions green. NEEDS THE OWNER'S HANDS: the brush feel + size range on the
  iPad, whether rub-away/bring-back read clearly, and the pinch/spin feel
  (sensitivity, whether one-finger-drag vs two-finger never fight).
- [x] **Sticker library v3 — categorized + dynamic (Increment A)** — the owner
  is generating a large themed set with another AI ("of all drop in soon") and
  wants a MANAGED library, not one flat unmanaged row. Direction baked in
  (2026-07-19), BETA straight to main. STRUCTURE: assets live at
  `public/stickers/<category>/<name>.png` (cryptids/ ufo/ aliens/ paranormal/
  lostworld/ oddities/); the recursive dist-walk precache already covers nested
  folders. A build-time Vite step (in the precache plugin) writes
  `dist/stickers/manifest.json` = the keys of every sticker PNG present, and it's
  precached too — so the library is DYNAMIC: drop a PNG into a category folder,
  it appears next deploy with zero code. The original 8 stay FLAT (no key change
  → old saved sessions unbroken); their category comes from `STICKER_META`.
  META: pretty labels + HONESTY notes shown as TEXT ("folklore" for Wendigo,
  "fiction" for Reptilian/Insectoid/Nordic — survives grayscale), seeded for the
  whole planned taxonomy so drop-ins read polished (a key with no file never
  shows; an un-metadata'd file gets a humanized label + the "✨ New" bucket).
  LOADING: `loadStickerAssets` now fetches the manifest + builds the picker and
  rasterizes assets LAZILY per-placement (`ensureStickerAsset`) instead of bulk-
  loading all 50+. UI: a `#stickerCats` chip row (emoji + label, aria-pressed,
  ✓-text) filters the `#stickerAdd` grid; only non-empty categories show; add is
  now `addStickerFromKey` (awaits the asset, then auto-matches as before).
  VERIFIED (sticker-category-walk): category chips render for non-empty cats only,
  filtering shows just the selected category, a seeded `aliens/reptilian.png`
  reads "Reptilian · fiction" (text + aria-label), a seeded `paranormal/…`
  category appears dynamically, adding composites, axe both themes; PLANT=nofilter
  (assert a filtered-out chip still shows) FAILS. sticker-walk / lag / blend
  regressions updated (pick the UFO category before Saucer) + green; build clean,
  manifest present + precached. NEEDS THE OWNER'S HANDS: the picker's feel with a
  real 50+ set (filter-by-chip vs a scrollable sheet), the category split, and
  confirming his AI-made PNGs (transparent, sized) land in the right folders.
  DELIVERY ASSUMPTION: committed PNGs in category folders (permanent, precached,
  offline), with runtime "Import a picture" kept for one-offs.
- [x] **Sticker perspective — drag the corners to set the plane (Increment B)** —
  owner direction 2026-07-19: "some of these need to skew by moving a corner… set
  the perspective for the image they're putting it into" (esp. evidence — a
  footprint laid flat on the ground, a lantern tucked behind a log reads far more
  believable than a decal). BETA straight to main. MODEL: `Sticker.corners` = 4
  offsets (TL,TR,BR,BL) in local half-extent units, absent = the plain scale+rot
  rect; they PERTURB the base rect so move/scale/rot/pinch all still compose.
  MATH (sticker.ts): from the 4 world corners, build the unit-square→quad
  homography (Heckbert) and invert it (quad→square) ONCE per sticker per bake;
  compositePixel takes the precomputed inverse and does one mat-vec per pixel
  (`tx,ty = Hinv·[X,Y,1]` dehomogenized), the plain path untouched when there are
  no corners. stickerRect → the quad's bbox; hitSticker → point-in-quad;
  stickerLocalUv (blend paint) → the same inverse, so painting still lands on a
  skewed sticker. Rides the export for free (stickerPatches reuses compositePixel
  + stickerRect). UI: a "Skew the corners" toggle adds 4 draggable handles to the
  selection overlay (reusing the mask-handle drag idiom; the overlay repositions
  IN PLACE so a live drag keeps its capture), "Reset perspective" clears them.
  Corner drags bake live in the bbox, rAF-coalesced, with a stkCornerLive guard
  on recordSoon so one drag = one undo step; corners deep-copied in cloneParams.
  VERIFIED: sticker-persp unit (homography sends the 4 world corners to the asset
  uv corners at 2e-16, a top-in skew is a real trapezoid, bbox = quad extent,
  identity corners == the plain rect for fast/slow parity; PLANT=flat fails) +
  sticker-persp walk (corner handles appear, dragging warps the footprint, the
  box reshapes, export parity ≤14 LSB, .cube excluded, undo restores, axe both
  themes; PLANT=nodrag fails). All sticker regressions + build green. NEEDS THE
  OWNER'S HANDS: the corner-drag feel on the iPad (handle size, whether live-bake
  is smooth enough or wants a matrix3d ghost), and whether one-finger corner-drag
  vs body-drag ever fight (corner handles stop-propagation, so they shouldn't).
- [x] **Sticker library — two kinds: Creatures & craft / Evidence (Increment C)**
  — owner reframe 2026-07-19: "split the app into two kinds of overlays —
  Creatures & craft, and Evidence… the evidence overlays are more believable
  because you can tuck them into a corner or partly hide them behind real
  objects." So the picker gained a TOP tier: `STICKER_GROUPS` (👣 Creatures &
  craft, 🔍 Evidence) → category chips (now carrying a `group`) → the sticker
  grid. Categories re-sliced: Creatures = Cryptids, UFOs & craft, Aliens, Spirits
  (paranormal figures), Beasts (lost-world); Evidence = Tracks & marks
  (footprints/claw-tree/hair/feathers), Left behind (backpack/tent/lantern/rusted
  gear/standing stones), Lights & signs (will-o'-wisp/glowing orb/light anomaly/
  floating eyes/scorched circle). Folders renamed to match the new category ids
  (`spirits/ beasts/ tracks/ gear/ lights/`); the flat legacy 8 unchanged. Only
  non-empty kinds/categories show, and a kind/category row auto-hides when there's
  a single choice (so today, with only creature assets + one seeded evidence
  folder, Evidence shows its stickers directly). This SUPERSEDES the Increment A
  category list (Paranormal/Lost World/Oddities are gone as top-level cats).
  VERIFIED (sticker-category-walk, rewritten): two kinds render, the selected kind
  filters to its categories, category filtering within a kind holds, a seeded
  `aliens/reptilian` reads "Reptilian · fiction", a seeded `tracks/footprints`
  makes the Evidence kind appear dynamically, adding composites, axe both themes;
  PLANT=nofilter FAILS. sticker-walk / lag / blend / persp regressions green (they
  pick the UFOs category under the default Creatures kind); build clean. NEEDS THE
  OWNER'S HANDS: the exact category split (esp. where orbs/lights and the
  paranormal figures belong), and whether a 3-row picker (kind → category →
  stickers) is right on the iPad or wants a lighter shape once the set is full.
- [x] **Blend to match — a strength dial on the auto-harmonise (Increment D)** —
  owner ask 2026-07-19 ("a blend capability to make the sticker match the image
  as best it can"). A "Blend to match the photo" button + a **Match strength**
  slider under "Match to the photo": the sticker takes on the local scene's
  brightness, warmth and a softened contrast, and the strength dials 0 (raw
  asset) → 1 (full match). MODEL: `matchTarget` = the full-strength
  [bright, contrast, warmth] computed from the scene; `matchAmt` scales it into
  the applied scalars (`applyMatchAmt`); saturation stays purely manual. Auto-set
  on add + on the button (matchAmt default 0.85). IMPORTANT NEGATIVE RESULT — DON'T
  RE-TRY: I first built a per-channel statistical colour transfer (Reinhard
  mean+std, matchGain/matchBias). It BLEW THE STICKER OUT (a saucer went magenta,
  then near-black). Cause: stickers composite INTO the source BEFORE the camera
  matrix + WB + channel-swap, but the asset is authored in sRGB — so any
  per-channel source correction gets amplified by the WB gains and swapped by
  R↔B, landing nowhere near the target. Sampling the source scene instead of the
  display didn't help (RAW source is camera-native, a third space). The ONLY
  thing that harmonises predictably through this pipeline is the gentle, monotonic
  brightness/warmth/contrast scalars sampled from the DISPLAYED scene (the
  original auto-match the owner already liked) — so the affine was reverted and
  the deliverable is the STRENGTH CONTROL over that. On a bright IR-saturated
  asset the red channel clips at 255 and can't be pulled down; the match still
  improves green/blue (walk measures total channel distance, not max, for this
  reason). VERIFIED (sticker-match-walk): auto-match sets strength>0, full match
  pulls the composited colour toward the scene (Σ199→159) while raw doesn't,
  strength visibly changes it, the button recomputes for a new spot, axe both
  themes; PLANT=nomatch (strength 0==1) FAILS. adjust unit + all sticker
  regressions green. NEEDS THE OWNER'S HANDS: whether the default 0.85 strength
  feels right, and whether he wants saturation folded into the auto-match too
  (left manual for now — auto-sat was too unpredictable to trust).
- [x] **Blend to match REWORKED — actually works now, and on iOS (2026-07-20)** —
  owner on device: "the blend is not working in any sort of way" (a blown-white
  UFO craft, identical at Match strength 0 and max). TWO bugs: (1) auto-match
  sampled the scene by reading the WebGL canvas back through a 2D canvas — works
  in Chromium, SILENTLY FAILS on iOS Safari, so no match ever computed and the
  strength slider was inert (the "all my measurements are Chromium" gap, for
  real); (2) even when it ran, the gentle brightness/warmth heuristic (Increment
  D) barely dented a bright IR-clipped asset. FIX — match in SOURCE space with a
  per-channel gain `matchGain = sceneSourceMean / assetSourceMean` (from
  previewSrc, NO canvas readback): it lands the sticker's average source colour on
  the scene's, so after the identical pipeline (WB, camera matrix, R↔B swap) the
  sticker displays as the scene does — a blown craft's source is pulled DOWN
  before the pipeline can clip it, so it tones right in (practice saucer centre
  255,78,87 → 111,88,89 over a 144,125,128 forest; Σ199→109; visibly a muted craft
  vs a glowing red decal). matchAmt lerps the gain toward the raw asset (0=raw,
  0.85 default); the bright/contrast/warmth/sat sliders ride on top. This is the
  clean MEAN gain that Increment D's std+bias affine got wrong (that one went
  magenta). Rides export (matchAsset in compositePixel). VERIFIED
  (sticker-match-walk): full match pulls toward the scene (Σ199→109) while raw
  doesn't, strength changes it, the button recomputes, AND a spy proves the add
  triggers ZERO WebGL-canvas readbacks (the iOS-safe property; the old code did
  one per match). All sticker regressions green (sticker-walk's "grade reaches"
  now pushes all 3 bands since a matched sticker is dark, not a highlight).
  NEEDS THE OWNER'S HANDS: confirm on the real iPad that the match now bites, and
  the default 0.85 strength; a strongly-coloured asset keeps some of its own hue
  (the gain shifts the mean, not per-pixel saturation) — the Saturation slider is
  the manual lever there.
- [x] **Force-update button + picker legibility (2026-07-20 device fixes)** — (a)
  Settings gained "Update to the latest version": a `SKIP_WAITING` message the SW
  now listens for + `reg.update()` → skipWaiting → reload, so a new deploy shows
  without the double force-close (owner: "my kids will never get them"). (b) The
  sticker picker's three tiers were indistinguishable — kind chips are now larger
  above a divider, the selected category is a lighter outlined highlight, stickers
  stay plain; and the "more below" scroll arrow moved off --accent (it matched the
  selected chips and vanished). Both verified (force-update-walk stubs the SW +
  catches the reload; sticker-category-walk + a screenshot for the tiers).
- [x] **Sticker rotation on iOS — decode via <img>, not createImageBitmap
  (2026-07-20)** — sticker-factory chat diagnosed: placed stickers rendered 90°
  CCW on iOS Safari (correct in Chromium + the raw PNGs). Ruled out files (no
  EXIF, pixel-upright), the CPU composite math, and makeStickerAsset (row-major)
  — it's the DECODE. `ensureStickerAsset` + the "import your own" path rasterized
  via `createImageBitmap(blob)`, which iOS rotates where an `<img>` element does
  NOT (that's why the drag-ghost, a plain `<img>`, stayed upright while the baked
  pixels were sideways). FIX: decode both sites through `new Image()` +
  `img.decode()` → drawImage → getImageData (naturalWidth/Height), matching the
  ghost's path exactly. No createImageBitmap left in main.ts. VERIFIED: all
  sticker walks green (no Chromium regression); the iOS-upright proof is the
  owner's 30-second iPad check (a raw `<img src="./stickers/…">` renders upright).
  COORDINATION (important): the deployed factory stickers were PRE-ROTATED 90° CW
  to cancel this bug. With the fix landed, that pre-rotation now over-rotates —
  the factory must STRIP it and re-promote upright, or stickers double-rotate.
  So this fix + the factory's strip must go together; staging was left at its
  pre-fix reconcile (old decode + pre-rotation = upright there) until the factory
  re-promotes onto main-with-fix.
- [x] **Third sticker kind — Scene & nature (asset-factory handoff)** — owner go
  2026-07-19 after reading the factory's `asset-factory/CATEGORIES.md` (on branch
  `claude/jefferson-asset-pipeline-9y19wa`, which routes ~245 assets so NOTHING
  lands in ❓ New). App-side change per that handoff: a third `STICKER_GROUPS`
  entry `scene` (🏕️ Scene & nature) + five categories — 🦉 Wildlife (`wildlife`),
  🌿 Foreground (`foreground`), 🎈 Sky (`sky`), 🌫️ Atmosphere & light
  (`atmosphere`), 🧺 Everyday (`props`). These are the everyday overlays for the
  Creative direction, but they just add folders to the EXISTING IR sticker picker
  (the separate Creative app stays parked); the group only appears once a scene
  asset is promoted (renderStickerPicker hides empty groups). Purely additive:
  no META/notes needed (labels humanize from filenames; all real things). VERIFIED
  (sticker-category-walk, extended): a seeded `wildlife/owl` makes the Scene kind
  appear with Wildlife → "Owl"; three kinds now render and filter; PLANT=nofilter
  fails; all sticker regressions + build green. The factory promotes reviewed
  PNGs into public/stickers/<category>/ as its own deliberate step.
- [x] **Cast shadows auto-follow their creature (2026-07-21, owner "a toggle
  that makes the sticker auto-update when dropped in a new location" applied to
  the shadow's placement pain)** — a cast shadow is now GLUED to the creature it
  came from and tracks its position / scale / spin on every settle, so you place
  the creature once and the contact puddle rides along — no more casting a shadow
  and then hand-lining-it-up (the exact friction he hit: "impossible to place").
  MODEL: `Sticker.linkTo` = the creature's `id`; castShadow stamps it. `syncLinked
  Shadows()` runs at the TOP of syncSpotsToTexture (before the bake change-
  detection, so a followed shadow re-bakes at its new spot) and copies x/y/scale/
  rot from the creature to every still-linked shadow. It's derived state — one
  insertion covers EVERY transform path (body drag, two-finger pinch, Size/Spin
  sliders, corner + rotate handles). DETACH: touching the shadow ITSELF (drag /
  pinch / resize / spin) clears `linkTo`, so it stays where you put it — which
  doubles as the manual light-direction control the auto-shadow entry flagged as
  "next polish" (offset the shadow = place the light). A shadow whose creature is
  deleted simply stops following. One gesture = one undo step (sync happens inside
  the drop's draw(), before flushRecord). VERIFIED (shadow-follow-walk, 14 checks):
  cast links the shadow to the creature and sits it on its position; moving/
  spinning/resizing the creature carries the shadow (x/y/scale/rot all track);
  adjusting the shadow itself clears the link and it then ignores creature moves;
  existing sticker-fixes-walk still 39/39, overlay parity still 0 LSB, no console
  errors. No DOM/UI added (behaviour only), so the a11y surface is unchanged.
  Dev hooks `__stickers()` (read-only snapshot) + `__select(i)` added for the walk,
  alongside the existing `__stickerBakes`. NEEDS THE OWNER'S HANDS: whether the
  shadow strip below the creature is an easy enough tap-target to grab for a manual
  offset (auto-follow means most placements never need it; if he wants a dedicated
  nudge/direction control that's a clean follow-up).
  - FOLLOW-UP FIX (2026-07-21, owner: "rotating the shadow makes the whole image
    show again, not the rotating shadow"): the live ghost is a plain rotated
    `<img>` of the asset — it CANNOT reproduce a shadow's flatten (a corner
    homography), so ghosting a shadow during a transform showed the un-flattened
    full creature. GOTCHA to keep: shadows must never be ghosted. Fix: shadows are
    excluded from the ghost path — `beginStickerLive` leaves a shadow IN the bake
    (liveSticker stays −1) and `previewStickerTransform` re-bakes it live each
    frame (cheap, one small rect, like the Peek/occlusion slider) so you see the
    real flattened silhouette move/scale/spin. Creatures still ghost. VERIFIED
    (shadow-rotate-ghost-walk, 7 checks): rotating the shadow keeps the ghost
    hidden and the region stays dark (flattened, not the bright creature) while it
    re-bakes; creature rotation still ghosts; follow 14/14, sticker-fixes 39/39,
    parity 0 LSB, no console errors.
- [x] **Scene toolkit: auto-shadow + Screen-for-lights (2026-07-21, asset-factory
  handoff + owner "auto-shadow, then screen-for-lights")** — polish on the new
  toolkit assets. (a) REGISTERED the factory's new folders: `illustrated/` (10
  hand-drawn cryptids) under Creatures → Illustrated cryptids, and `shadows/`
  (grounding + dapple) under a new `toolkit` group (🎬 Scene toolkit) → Shadows.
  (b) AUTO-SHADOW: a "Cast a shadow" button spawns a companion sticker from the
  creature's OWN silhouette — same asset, `shadow:true` (compositor renders it flat
  near-black × `shadowOpacity` 0.45; black-over-scene == Multiply, so it darkens
  the ground), squashed+skewed onto the ground via `corners` (SHADOW_DOWN 1.25 /
  SHADOW_SKEW 0.7), dropped to the feet, inserted BELOW the creature. Move/delete
  like any sticker; no shadow-of-a-shadow. (c) SCREEN-FOR-LIGHTS: glows now
  composite with SCREEN (add light) instead of over. Architecture: a SECOND
  source-space overlay texture (gl.ts unit 9, `overlayScreenTex`) blended
  `g = 1-(1-g)(1-sv.rgb·sv.a)` after the over overlay; syncSpotsToTexture splits
  on-top into `normalStk` (over) and `screenStk` (screen) via `isScreenAsset`
  (Lights category or beam/glow/flare/aura/portal/wisp/orb/… name), each its own
  overlay + baked-tracking; export.ts mirrors with two samplers (over then screen)
  into the finished pixel. Glows skip the scene-match (keep their own light).
  Shadows via black-over need NO Multiply mode (black-over already == Multiply).
  VERIFIED (sticker-fixes-walk, 37 checks): the new groups/categories render;
  casting a shadow darkens the ground below a creature (max −30.8 luma); an
  aura-glowing Lights sticker BRIGHTENS the scene 159.7→192.2 (screen add) and
  isn't blown out; overlay preview-vs-export parity still 0 LSB; axe clean both
  themes; build clean. NEEDS THE OWNER'S HANDS: shadow direction/strength feel
  (currently a fixed light dir; a light-direction knob + the silhouette blur are
  the next polish), and which assets should count as "glows" for Screen.
- [x] **Sticker "match the photo" done RIGHT — its own adjustment, not the
  pipeline (2026-07-21, owner: "it has to have ITS OWN adjustments that mimic the
  photo underneath… it will NEVER work by treating it the same as the photo")** —
  the "push it through the infrared look" (in-look) path is fundamentally broken:
  the IR pipeline is calibrated for RAW SENSOR data, so an sRGB sticker forced
  through it blows to neon (owner's screenshot: a figure gone yellow/red/green).
  REMOVED the in-look toggle entirely. REPLACED with a DISPLAY-space palette match:
  `computeSceneMatch` reads the DISPLAYED scene colour under the sticker via
  `renderer.readUvPixel` (offscreen GL read, iOS-safe — the tap-WB path, NOT a
  canvas readback) with the overlay toggled OFF so it samples the scene not the
  sticker; stores the linear mean as `Sticker.matchScene`. The overlay compositor
  (`overlayPixel`) then shifts the sticker's own mean toward it by `matchAmt`
  (`tmp += amt·(matchScene − asset.mean)`), keeping the sticker's internal shading
  — so it takes on the scene's infrared palette IN ITS OWN LAYER, never cooked.
  Auto-runs on add/import; a "Match the photo's colours" button re-samples at the
  sticker's current spot; a Match-strength slider dials 0 (raw) → 1 (full).
  `matchScene` rides cloneParams/session (deep-copied). VERIFIED (sticker-fixes-
  walk, 28 checks): a dark sticker (31,24,24) auto-matches to 115,108,109 over a
  142,130,131 scene — distance to the scene's palette drops 323→70, and it is NOT
  neon; strength 0 restores the raw colour; the in-look toggle is gone, the match
  button+slider present; overlay preview-vs-export parity still 0 LSB WITH the
  match applied; axe clean both themes; build clean. This is the real answer to
  the owner's ask from the very start — a sticker mimics the photo instead of
  being run through the same filters.
- [x] **Killed the confusing "blend/match" pile (2026-07-21, owner: "it's not
  blending, it's just wrong")** — after on-top shipped, the owner turned on the
  "Blend into the infrared look" toggle (sounds like nice blending) and got a
  cooked sticker, then fought the "Match to the photo → Blending into the photo →
  Match strength" controls that darken a sticker into the scene under it. Root
  cause was NAMING + a leftover feature: on-top already keeps the sticker's own
  colours, so the whole source-space match machinery was obsolete AND misleadingly
  labelled. REMOVED entirely: `stkBlendToggle` ("Blend into the photo"),
  `stkAutoMatch` ("Blend to match"), `stkMatchStrength`, `autoMatchSticker`,
  `sampleSceneSrcMean`, `MATCH_AMT_DEFAULT`, and the auto-match-on-add/import
  (a fresh sticker is now purely its own colours — matchAmt 0). The `matchGain`/
  `matchAmt` model fields stay (dormant, ride cloneParams/session) so matchAsset's
  manual bright/contrast/warmth/sat still work. RENAMED the one remaining blend
  control honestly: the on-top/in-look toggle is now **"Push it through the
  infrared look"** (off by default), moved to the BOTTOM under a "Make it look
  infrared" heading with a note that it WILL change colour — no more implying it
  makes the sticker blend nicely. Intro + Help + Lesson 9 rewritten to drop the
  "matched to your photo automatically" language. VERIFIED (sticker-fixes-walk, 28
  checks): the three removed controls are absent, the single infrared toggle
  remains, on-top still keeps its own colour vs in-look recolours, all handle/
  artifact/zoom checks green, axe clean both themes, build clean. NOTE FOR NEXT
  SESSION: the earlier "Sticker usability sweep" entry's `stkBlendToggle` blend-on/
  off is SUPERSEDED by this removal — don't reintroduce it.
- [x] **Stickers lay ON TOP of the look now, not under it (2026-07-21, owner
  emphatic)** — THE big one. The owner: "a sticker is a different kind of picture,
  it can't lay under the same filters" — a colourful cutout composited INTO the
  source (pre-pipeline) got channel-swapped + WB'd + saturated into neon (his
  alien/figure screenshots). Fixed by compositing on-top stickers AFTER the whole
  pipeline, so they keep their OWN colours. ARCHITECTURE — a source-space "overlay"
  (`Sticker.onTop`, default true; undefined = on top): the sticker's gamma-sRGB
  colour + straight coverage alpha, built with the SAME geometry/perspective/mask/
  occlusion math as before (sticker.ts `overlayPixel` / `compositeStickersOverlay8`
  / `makeStickerOverlaySampler`), only WITHOUT the source-match gain (that was a
  survive-the-pipeline trick; on-top keeps its own colour). PREVIEW: a new RGBA8
  overlay TEXTURE (gl.ts unit 8, sized to previewSrc), sampled at the same v_uv as
  the photo and blended `g = mix(g, ov.rgb, ov.a)` AFTER the last colour stage
  (the LUT) and BEFORE grain — so the look never touches it and grain still
  settles over it. syncSpotsToTexture now splits `inLook` (baked into the source,
  as before) from `onTop` (built into the overlay via patchOverlay, its own dirty-
  rect + `bakedOnTop` tracking, deep-copied corners like the artifact fix). EXPORT:
  export.ts splits the same way — in-look wraps the source sampler (unchanged);
  on-top runs `makeStickerOverlaySampler` and blends into the finished display
  pixel after edit(), before finishPixel (grain/vignette), in BOTH the JPEG and
  16-bit loops. Peek-behind reads the pristine source under the pixel on both
  sides. Occlusion/paint-mask/perspective/the bright-contrast-warmth-sat sliders
  all still apply; the "Match to the photo" group (source-space gain) is disabled
  while on top (it's meaningless there) and re-enables under "Blend into the
  infrared look". UI: a `#stkInLook` toggle at the top of the sticker controls
  (default off = on top). Bonus: the drag-ghost (raw asset) now MATCHES the baked
  on-top result, so the old grey→recolour snap is gone. VERIFIED: sticker-fixes-walk
  (30 checks) — on-top centre stays its own dark colour (31,24,24) while flipping
  to in-look recolours it (64,49,61) and flipping back restores it exactly; on-top
  is the default; all handle/blend/artifact/zoom checks green, no console errors —
  PLUS an overlay-parity unit proving the preview texture bytes == the export
  sampler values at 0 LSB (max delta 0 over 2545 covered px). axe clean both
  themes. Help + Lesson 9 rewritten. NEEDS THE OWNER'S HANDS: confirm on the iPad
  that on-top stickers now read as their own picture (and export the same), and the
  in-look opt-in still gives the cryptid-in-infrared effect when he wants it.
- [x] **Sticker usability sweep + zoom-with-no-wheel (2026-07-21 device asks)** —
  owner on device, five things at once (branch
  `claude/sticker-blending-resize-rotate-tr3hrl`, BETA straight to main via
  staging). (1) **Blend on/off** — a `#stkBlendToggle` at the top of "Match to
  the photo": ON restores the full-strength match (computes matchGain via
  autoMatchSticker if the sticker never had one) → matchAmt = MATCH_AMT_DEFAULT;
  OFF sets matchAmt 0 so the raw asset colours show ("some work better without
  it"). updateStickerUI mirrors it as ✓-text + aria-pressed and disables the
  strength slider + "Blend to match" button when off. (2) **Resize/rotate right on
  the photo** — the owner "didn't see how" (only sliders/pinch + the persp corner
  handles, which skew, confused him). positionStickerOverlay now has three modes
  by data-mode: `persp` (4 skew handles, unchanged), `xform` (4 `.sticker-size`
  resize corners + a `.sticker-rotate` knob on a `.sticker-stem`, shown when a
  sticker is selected and neither perspective nor blend-paint is armed), and `box`
  (outline only, while blend-painting so handles don't fight the brush). Resize =
  finger-distance-from-centre ÷ base half-diagonal; rotate solves s.rot from the
  finger angle (atan2(dx,−dy)+dispRot). Both held live (ghost + one bake on
  release, `stkHandleLive` suppresses undo churn like `stkCornerLive`), sliders
  follow live. Handles stopPropagation so a grab never starts a body drag. (3)
  **Left-behind artifact** — `bakedStickers` was a SHALLOW copy, so its `corners`
  array ALIASED the live sticker; a perspective corner drag then mutated the
  "baked" geometry in place, defeating the stkSig change-detection (second corner
  move never re-baked) AND making the restore rect track live-not-baked geometry
  → stale pixels that survived even Clear all. Fix: deep-copy corners in the bake
  snapshot (mirrors cloneParams). Also drop the live ghost defensively on
  delete/clear and in disarmPictureTools (so it can't float over the start
  screen). (4) **Picker thumbnails** — the add grid was text-only chips; now each
  is a `.sticker-tile` with a `<img src=./stickers/KEY.png>` thumbnail (loaded
  straight, no rasterization — precached) + label beneath + the honesty note
  (folklore/fiction) at --txt-2. (5) **Zoom with no wheel and no pinch** — a
  desktop/laptop had NO way to magnify (pinch needs touch; there was never a wheel
  handler), so brushing up close was impossible. New `#zoomCtl` glass stack
  (bottom-right, --glass tokens, hidden while cropping, lifts above the session
  strip): + / − / Fit buttons zoom about the stage centre; a cursor-anchored
  canvas `wheel` handler (passive:false) is the desktop gesture. BOTH work while a
  picture tool owns the canvas gestures (they're buttons / a wheel event, not
  pointers) — that's the whole point. zoomAt/zoomByCentre reuse the pinch anchor
  math; updateZoomCtl syncs the %/enabled state and rides applyZoom + the open/
  home/return/crop transitions. VERIFIED (sticker-fixes-walk, 25 checks, headless
  Chromium on a practice JPEG): thumbnails render with imgs+labels; 4 resize + 1
  rotate handle present; rotate drag 0→90, resize 0.3→0.8; blend toggle off
  disables strength + zeroes matchAmt, on restores 0.85; **artifact ROOT CAUSE
  fail-first** — a second corner move must re-bake (bakes far→near): FAILS with the
  shallow copy (far=11 near=11), PASSES with the fix (far=16 near=22), and the
  cleared canvas matches the no-sticker baseline at diff=0; zoom + button 100→225%,
  Fit→100%, wheel zooms to 246% WHILE the brush is armed; no console errors. axe
  clean (0 serious/contrast) on #sec-stickers + #zoomCtl in BOTH themes. Help +
  Lesson 9 + the Gestures list updated. VERSION unchanged (Creative beta
  increment). NEEDS THE OWNER'S HANDS: the resize/rotate handle feel + size on the
  iPad, the zoom button placement, and whether Fit should also frame a crop.
  DEFERRED — **the "double blend" the owner flagged next**: stickers composite
  INTO the source (pre-pipeline), so the IR look (WB, camera matrix, R↔B swap,
  saturation, grade) re-cooks even a matched sticker — a colourful alien blows to
  neon (his screenshot). Blend-off helps but the look still processes it. The real
  cure is a per-sticker "lay it on top / keep its own look" mode that composites
  AFTER the pipeline (a new display-space stage in BOTH preview + export, with
  occlusion/mask/perspective in display space) — a real architectural fork; parked
  for owner direction before building (asked in chat, per the no-picker rule).
- [x] **New Infrared app icon + social tile (Bigfoot IR forest)** — owner ask
  2026-07-20, from a ChatGPT-made color-IR forest he liked (a Bigfoot subtly
  placed in the trees; source in session uploads). Three deliverables, all cut
  from that one square image via the headless-Chromium canvas pipeline
  (`gen-brand.mjs`, scratchpad): (1) **IR icon** — `public/icon.svg` now embeds
  a 384px JPEG of the photo, center-square, clipped to the same rx=96 squircle
  (favicon `<link rel=icon>` + manifest "any"); `ir-icon-180.png` (apple-touch)
  and `ir-icon-512.png` (maskable) are the full-square crop. Bigfoot sits
  center-right, inside the maskable safe zone. The old generated ring-glyph SVG
  is gone. (2) **Social tile** — `public/ir-social.jpg`, 1280×640 (GitHub's 2:1,
  under its 1 MB limit at 222 KB), photo cover-cropped + bottom scrim + title
  "Infrared Photography Studio" and the values tagline + the IR channel-swap
  glyph mark; wired as `og:image`/`twitter:image` in ir.html (was a bare sample
  photo). EXCLUDED from precache (vite.config.ts) — scrapers fetch it, the app
  never does. (3) Instagram announcement copy for the sticker/creature release —
  delivered in chat (not committed). VERIFIED headless: icon.svg decodes as an
  `<img>` and renders the squircle photo; build clean; dist serves all four
  assets; ir-social.jpg absent from sw.js precache, icons + icon.svg present;
  og:image points at the tile. NEEDS OWNER'S HANDS (iPad): how the icon looks
  installed on the iOS home screen (maskable crop / Safari re-add), and the
  GitHub **Settings → Social preview** upload is a manual UI step (Cloudflare
  picks the og:image up automatically). Not a capability — ships as an increment
  (no VERSION bump).

## Full-app review (ultracode), 2026-07-15 — findings ledger

> An 11-dimension multi-agent review over the whole repo; every problem below
> marked FIXED was re-verified in code by hand and is covered by the verify
> suite where a headless check exists. DEFERRED items are real but need their
> own release (or an owner decision) — do not re-discover them.

FIXED in the 2026-07-15 review release (cache ips-v52 → ips-v53):
- SW cached NON-OK responses — one bad fetch poisoned cache-first assets
  forever, and could poison the version-stable examples cache. Both branches
  now cache only res.ok.
- .dcp wrote plain-TIFF magic 42; the DCP spec magic is 0x4352 ("CR") —
  Lightroom/ACR reject 42 outright. Almost certainly why the pending
  "Lightroom colour test" never had a chance; re-ask the owner to test.
- NEF lossy-branch (0x44/0x20) linearization-curve interpolation read past
  the curve array (undefined→NaN→0): highlights decoded BLACK on
  lossy-compressed NEFs. Upper grid index now clamped. (The owner's classic
  Z50 files take the other branch — bit-exactness unaffected.)
- LJ92: restart markers (DRI) never reset prediction — any DRI DNG decoded
  to garbage. Now resets per T.81 (default at interval start, Ra across the
  interval's first line; still UNTESTED on a real DRI file — none seen yet).
- LJ92 + NEF truncated streams decoded to silent garbage; both now throw an
  honest "file looks damaged or incomplete" error.
- Mode machine: setHealReview didn't disarm TAT/colour-pick/HSL-pick; armed
  tools + banners survived Home (floating over the start screen) AND rode
  into freshly opened photos (Lesson 1 teaches tap-WB!); brush Paint sat
  outside the exclusion set entirely. New disarmPictureTools() runs on every
  open + Home; review arms exclusively; Paint⇄tools disarm each other.
- Undo during auto-sweep review left a ZOMBIE review (banner counting spots
  that no longer exist, every tap consumed); review now re-validates on undo
  and on empty-spot taps. activeSpotIdx also reset per photo (the Spot-size
  slider used to resize a spot on the NEXT photo).
- openGalleryPhoto destroyed the live session (memory AND storage) BEFORE
  the download/decode succeeded — a failed practice-photo open lost real
  work. Teardown now happens only after a decodable photo is in hand, and a
  live multi-photo session gets a confirm first (parity with openPicked).
- Transcoded-JPEG rejection wrote its explanation into the start screen's
  #hint even when the editor was up (invisible); now alerts in that case.
- TIFF16 stores truncated instead of rounding (≤1 LSB16 low bias) — fixed,
  watermark blend too. A failed watermark-mark fetch was memoized forever
  (every later export text-only) — now retried per export.
- Toast (copy-link etc.) rendered UNDER open <dialog>s — the top layer beats
  any z-index; the toast now mounts inside the open dialog. LESSON for all
  future overlays: modal dialogs paint above everything except the top layer.
- Look buttons' norm/R⇄B mini-toggle lost its active styling when markup
  moved .look-row → .looks-grid; selectors updated, dead .look-row CSS gone.
- deploy.yml: a manual workflow_dispatch from ANY branch deployed that
  branch to PRODUCTION, bypassing the staging gate — job now runs only for
  main/staging refs.
- Roadmap parser truncated a bold title at an inner em-dash ("Learn on real
  photos — lessons…" rendered as "Learn on real photos"); it now prefers the
  full **bold span**. "On-device checks owed" (internal QA) no longer renders
  in the user-facing roadmap (plain bullet).
- GitHub links in the ⓘ dialog pointed at the long-renamed njefferson/
  IRstudio (404 for everyone). Slug fixed — but NOTE: the repo is PRIVATE, so
  even correct links 404 for end users; owner call whether to expose the
  history some other way (see suggestions).
- Help honesty: masks list now includes Colour + Sky; profiles caveat now
  names clarity/dehaze/masks/heals; session-resume promise now admits masks
  reset on reload; NEF caveat covers the Z50 II's HE files; Macro Help said
  "JPEG sets only" while accepting PNG (now says both); Macro intake errors
  were written into the hidden work section (now land on the intake panel).
- Dead weight: nine unreferenced pre-NJ studio-icon* files (~190 KB) removed
  from the deploy; stale docs corrected (ARCHITECTURE.md domains + example
  section, PLAN.md demoted from "authoritative" to history, main.ts's stale
  "v1.0 arrives by git tag" comment).

CONFIRMED but DEFERRED (each needs its own release / owner input):
- [FIXED v1.1, cache ips-v69] BIGGEST: denoise/sharpen/texture ran at PROXY
  resolution in preview but NATIVE at export — every RAW export's detail
  character differed from what was previewed (~2× kernel scale; the old parity
  harness structurally couldn't see it — it compared equal-res mirrors). Fixed
  by scaling the CPU kernels' tap SPACING by the proxy factor at export (same
  tap count/weights — offsets and sigmas are both in tap-index units, so only
  the sample positions widen); a new cross-resolution harness proves the native
  export lands 55–111× closer to the preview. See the "Preview-faithful exports
  + offline through updates" roadmap entry for the full record.
- [FIXED v1.1, cache ips-v69] Every release blacked out OFFLINE use until the
  next online visit: activation wiped the old cache and nothing precached the
  new shell. Fixed with a build-time precache manifest (new `precache-manifest`
  vite plugin injects the hashed asset list into sw.js), install-time addAll
  into the new cache, activate-after-populate; examples cache untouched. Proven
  headless incl. a fail-first buggy-install control. See the roadmap entry.
- Multi-tab: two tabs of ir.html silently clobber each other's ips-session
  store (no guard). Also: lone opens still have zero crash safety.
- [FIRST HALF SHIPPED (copy-and-trust release, main.ts:4398) — found stale at
  the 2026-07-18 promotion; the DOUBLE-TAP clause is still real (busySave has
  no re-entrancy guard) and is re-queued as "Close the export double-tap
  fall-through"] .cube/.dcp saves
  use a bare a[download] — silently does nothing in the
  installed (standalone) iOS app; should ride the share-sheet path like
  image saves. Double-tapping Save while the share sheet opens can fall into
  the download branch and (for batch) clear crash-recovery frames early.
- Rotate regenerates the sky mask as an UNDOABLE step (undo can restore a
  90°-wrong sky bitmap); gradient-mask default geometry ignores rotation.
- stampBrush uses u*(w-1) pixel convention vs the sampler's texel-centre
  u*w-0.5 (≤half-texel paint offset at edges). Glow map: GPU samples 8-bit
  quantized, CPU export samples f32 (small parity drift by construction).
- parseExif throws on corrupt EXIF and fails the whole open (should degrade
  to no-profile); a leading non-Exif APP1 (XMP) aborts the EXIF scan.
- detectSpots transient RAM at 2800px measures ~2× the ~70 MB NOTES carries;
  tiny heal rings are hard to tap (hit radius < drawn ring minimum); the
  sweep's review counts pre-existing manual heals as sweep receipts;
  re-running Find spots reports "no dust" when it re-found healed spots.
- Uncompressed-DNG path assumes 16-bit samples (no BitsPerSample check);
  mirrored EXIF orientations (2/4/5/7) treated upright; TIFF-based
  third-party RAWs (CR2/ARW…) silently open as their embedded preview;
  plain TIFF errors claim "DNG"; every NEF failure claims High-Efficiency.
- Macro: full-res export stacks the CURRENT on/off frame set, not the set
  that produced the on-screen result; toBlob null → "ready" with nothing to
  save; Uint16 accumulators wrap at 258+ frames; per-frame OffscreenCanvas
  churn in the export worker.
- writeZip has no zip64 guard (safe only because the byte budget caps zips
  <4 GiB today); .dcp hardcodes UniqueCameraModel "NIKON Z 50" (invisible in
  LR for other cameras' raws — needs the source camera's name when known).
- Shallow clones make versionFor() confidently wrong (CI uses fetch-depth:0
  so production is fine; local/preview builds lie); no concurrency group in
  deploy.yml (rapid pushes can leave the older build live); sourcemaps ship
  the full TS source publicly while the repo is private (owner call).
- ips-examples-v1 can grow to ~440 MB with no cap and no user-facing way to
  free it — needs a "downloaded practice photos" line + clear control in the
  app (pairs with the storage honesty rules).

OPPORTUNITIES the owner may want next (all classical, on-device, buildable
by a session; roughly by value): Display-P3 JPEG export (recorded target, code
ships sRGB); keep EXIF (capture date/camera) in exports; box-filtered scaled
exports (50%/25% currently decimate nearest-neighbour); batch-from-session;
per-channel R/G/B curves (strengthens .cube/.dcp); B&W mode for 720nm;
Web-Worker thumbnailer (named twice in NOTES); privacy/support page (App
Store requires one; also markets the on-device story); a public home for
patch notes/roadmap history (the private repo 404s for users).
(2026-07-18: Display-P3, keep-EXIF, box-filtered exports, per-channel curves
and the 720nm B&W are now QUEUED in the "Next capability release" core sweep;
batch-from-session and the Web-Worker thumbnailer remain open here.)

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
  independent channels; same per-pixel model. PROMOTED 2026-07-18 to the
  "Next capability release" queue (core sweep) — see that entry.
- **Perspective (Upright)** — crop/straighten shipped 2026-07-15 (see the
  roadmap entry above); a full 4-corner perspective warp is a bigger,
  separate follow-up (needs a homography in the vertex shader, not just the
  rotate+crop affine this release used).
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
  IR-native, per-pixel. PROMOTED 2026-07-18 to the "Next capability release"
  queue (Creative release, v2.0) — see that entry.
- **UFOs in the trees — playful sticker compositing** (owner ask 2026-07-14,
  given right after the dust-release promotion; he'll open a NEW CHAT for it —
  next session, read this entry first). PROMOTED 2026-07-18 to the "Next
  capability release" queue (Creative release, v2.0); this entry keeps the
  architecture sketch. The idea: paste fun cutouts (UFOs,
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
  "crazy tools like swirl or liquefy"). PROMOTED 2026-07-18 to the "Next
  capability release" queue (Creative release, v2.0); this entry keeps the
  architecture sketch. Finger-driven local GEOMETRY warps —
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

Recorded 2026-07-18 (roadmap analysis session; NOT queued — the owner hasn't
greenlit these, they're here so they aren't lost):
- **Share your look as a file** — export/import an app-native look file so IR
  shooters can swap looks with no account and no server (.cube exports don't
  round-trip back into the editor). Fits free/on-device/no-account exactly —
  community without infrastructure. OWNER GO + SHIPPED 2026-07-18 as **Share
  your look — links, files and codes** (see the shipped record); release 2
  (**Import .cube LUTs as looks**) and release 3 (**Looks that travel inside
  the JPEG + QR share**) SHIPPED same day — the whole look-sharing saga is
  complete; see the three shipped records.
- **Durable edits across reloads** — sessions admit masks reset on reload and
  lone opens have zero crash safety (findings ledger); persisting the full
  edit recipe is the "come back tomorrow" gap between an editor and a daily
  tool.
- **Clipping warnings** — highlight/shadow blinkies riding the existing
  histogram machinery, paired with a non-color cue per the a11y rule.
- **Practice-photo storage control** — see the findings ledger (~440 MB
  examples cache, no user-facing free control); candidate for a future sweep.

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
