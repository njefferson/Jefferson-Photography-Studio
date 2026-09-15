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
    approach and mindset, a new edition. The owner declares these, and has
    declared the CREATIVE RELEASE the first one → it ships as **2.0**.
    - **3.0 IS DECLARED AND CLAIMED (owner, 2026-09-13): the OPTIMIZED
      RELEASE.** It ships when the export is fixed and the full-resolution
      question is decided — the two together, not either alone.
      **MEASURED LATER THE SAME NIGHT, the two turn out to be separable**: the
      full-resolution preview costs nothing and gives up nothing (the export
      stays computed, so the photograph is still identical on every device),
      while the drawn export is four to twenty times faster AND makes the saved
      file depend on the graphics chip that saved it — two devices drawing the
      same photograph fingerprint `fe3da8c6` and `38b69ce1` — and a third,
      `a466a4cb`, from the second iPad, two of those on the SAME engine, so it is
      per graphics chip rather than per browser. So 3.0 can ship with the first
      half built and the second half decided, and the decision is the owner's
      with both sides quantified.
      **AND THE HALVES HAVE TO BE NAMED CAREFULLY**: calling the first one "full
      size" in a report collided head-on with the export panel's own "Full
      (native)" scale and its Quality slider, and the owner rightly asked which
      of the two was being decided. It is neither — it is the editor's internal
      working copy — and the only thing actually being decided is the drawn
      export. That is an
      identity change rather than a capability one because it is the same
      product working a different way: the picture on screen and the picture
      saved become the same pixels, and the machine's own hardware does the
      work it was already sitting there able to do. **Nothing between now and
      then takes a 3.x number**, and the work that lands in it is the two
      roadmap items named "The editor's WORKING COPY at native resolution" and "The export
      drawn rather than computed" — measured on three devices on 2026-09-13
      and written up in the entries of that date.
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

## Getting back OUT — the hub chain (2026-07-30)
The apps point down cleanly (hub → Studio → tool) but the way back up had a
missing rung: ir.html/macro.html each carried "‹ Studio" in the bar, and then
index.html carried NOTHING to the hub. The only hub link in the whole app was
the FOURTH of five identical grey text links inside the IR ⓘ dialog, worded
"More free tools by Noah Jefferson" — which doesn't read as "the way back", and
which the owner could not find on device ("nearly buried — barely an actual
usable thing for a user"). Macro had no hub link at all.

The chain is now one visible control per level, no dialogs on the path:
tool "‹ Studio" (bar) → index "‹ Noah Jefferson" (bar) → hub. The launcher's ⓘ
lost its absolute corner positioning and became the right-hand item of a real
.lc-bar flex row, with the hub link as the left-hand item. Both tools also carry
a bordered .hub-row in their info dialog for direct access, wearing the hub's
own mark (public/icons/hub-nj.svg, copied from the hub repo's public/icon.svg —
re-copy it if the hub's mark changes).

Cross-origin hub links keep target="_blank" rel="noopener", matching the
existing convention: an installed PWA can't navigate off-scope in place, and a
back-link that strands the app is worse than no back-link.

MEASUREMENT GOTCHAS from that session's walk (all three produced confident
WRONG answers before they were caught — the instrument was the bug each time):
- Computed-style background walks return BLACK on these pages. body paints a
  `background:` shorthand holding only a gradient, so background-COLOR is
  transparent all the way up and a naive walk hits its fallback. It reported a
  LIGHT page at 1.11:1 — an absurd number, so the instrument was suspect first,
  per the standing rule. Read real pixels off a screenshot instead.
- Sample a rail on a STRAIGHT edge. Scanning across the end of a 999px-radius
  pill crosses pure curve, where every pixel is antialiased; it under-read by
  ~0.5 and accused a correctly-calibrated token of failing.
- The page gradient means the backdrop CHANGES with position — compare a rail
  against the pixel immediately adjacent to it, not a convenient patch elsewhere.
- :focus-visible does NOT match on a scripted .focus() in Chromium. The global
  ring in launcher.css was fine; the harness reported "outline 0px none" until
  it pressed a real Tab. Drive keyboard checks from the keyboard.
- Every fresh browser context is a first-time visitor, so #welcomeDlg auto-opens
  and covers the launcher — dismiss it before measuring anything underneath.

## Accessibility standing rule (owner mandate, 2026-07-17)

Accessibility is a TOP PRIORITY. Color-blind-inconsiderate design is a fail
state. Every new UI is designed against the checklist in CLAUDE.md from the
start; the a11y-walk harness (session scratchpad; axe-core + custom checks,
both themes, fail-first) runs before any UI release. Full audits (structural
+ color/CVD + repo, three agents, 2026-07-17) produced these durable
outcomes; the red baseline predating the fixes is archived in the session
scratchpad (a11y-baseline-red.json — 32/36 failing, incl. axe cross-checks).

SUB-11px TEXT FLOOR (2026-07-28, applied from Frame's A10 register): informational
text is >= 11px; only a glyph that labels nothing on its own (chevron, single-letter
pin, a "?" affordance beside its own full-size label) may go smaller, and it must be
recorded as exempt. Eleven rules were raised here, ALL of them informational, none
decorative: .sticker-tile-note, .lut-badge, .tat-banner-off (the mode EXIT
instruction — the smallest text on a phone), .session-thumb-name, .sub-title span
(9px uppercase mono at .1em tracking, the worst of them), .look-sub, .badge,
.filmstrip .thumb span, .shape .count, .icon-badge, and **.seg at 8px**.
.seg IS THE ONE THAT MATTERS: norm / R⇄B is the look-button's state-as-TEXT, which
the never-churn list above blesses precisely BECAUSE it is text and not hue. That
entry blesses the PATTERN, not the SIZE — it shipped at 8px, which undercut the very
fix it records. Raising it does not churn the pattern, it finishes it. VERIFIED
headless across index/ir/macro/notes/privacy: ZERO rendered text below 11px, no
horizontal overflow at a 16px OR a 20px browser default, 0 pageerrors, build clean.

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
NOR WAS "label styled as a button + hidden file input", which sat on this
list as verified while being unreachable by keyboard and 6px under the touch
floor — verified against axe, never against the tab key or a hit-area
measurement. Fixed 2026-09-10. The pattern that IS blessed now: the input
lives INSIDE its own label carrying `.file-input`, and an input driven by a
real <button> stays `hidden`. A list entry is only as good as what was
actually measured to put it there.
RANGE SLIDERS carry `touch-action: none` + a 22px thumb (style.css ~217) —
they OWN the finger gesture like every other drag control. Do NOT set
`pan-y` (it handed the drag to the panel scroller; a finger on the thumb
scrolled instead of moving it — owner-caught on the iPad 2026-07-19). The
panel still scrolls from label text + the gaps between rows.
A ROVING TABINDEX NEEDS AN INITIALISER, and it is not decoration: the pattern
is one tab stop for a whole grid with arrows moving within it, so every cell is
born tabIndex -1 and something has to promote one of them. The quick look
shipped the pattern without that call and the grid's own keys were unreachable
for it (2026-09-14, below). The precedent that was already right is setPanelTab,
called at init. Keep the focusQuickCursor call in openQuickLook's tile loop and
the one on the compare dialog's close; do not "fix" it by giving tiles a
positive tabIndex instead, which is the thing the roving pattern exists to
avoid.

AUDIT ITEMS CLOSED WITH THE PALETTE RELEASE (2026-07-30):
- LINKS ARE UNDERLINED AT REST. This was a real WCAG 1.4.1 failure, not a
  nicety: the accent is luminance-IDENTICAL to the body text it sits in
  (measured 1.01:1 against --txt-3 on Instrument night, 1.05 on day), so colour
  was the only link cue and an invisible one. Unfixable by colour — two tokens
  that each clear 4.6:1 on the same surfaces cannot also differ 3:1 from each
  other; all four council designers proved this independently. Prose links only:
  the bordered .hub-row and the .backlink chrome control are their own boundary,
  not text-in-a-paragraph, and stay unadorned (verified per-element).
- prefers-contrast: more now exists in the Studio (the hub already had one).
  Deliberately PALETTE-INDEPENDENT — it promotes --txt-3 to --txt-2 and --line to
  --line-2 rather than pinning colours that would only suit one family.
- ::selection was browser default, i.e. unverified in every palette; now
  --accent-soft under --txt.
VERSION -> 2.4 in this release's final commit (capability release: the palette
picker is a feature, not an increment).

PALETTE CONSOLIDATED TO ONE SOURCE + FOUR FAMILIES (2026-07-30). Colour tokens
now live ONLY in `public/palette.css`. src/style.css, src/launcher.css and
src/macro/macro.css declare none; privacy.html and the generated notes.html
declare none. That kills the five-places-must-change-together hazard this repo
has been bitten by repeatedly — and it was a PRECONDITION, not a tidy-up: four
families x two modes across five sites would have been 40 blocks that must never
drift.

WHY public/ AND NOT src/: notes.html is written straight to dist/ by the
notesPage vite plugin, so it cannot reference a content-hashed asset. A stable
path serves all five pages uniformly. Cache-busting therefore comes from the
service worker, whose cache name is stamped with the app version every deploy —
palette.css is in the precache manifest, so offline gets the new colours too.

TWO INDEPENDENT AXES: `data-theme="dawn"` (the day/night toggle, unchanged) and
`data-palette="paper|mono|soft"` (absent = Instrument, the default). Both are set
before first paint by the inline script in every page's <head>. That script now
also stamps `theme-color` from the resolved `--bg`, which closes the long-standing
gap where the iOS status bar kept one static colour and was wrong in the other
mode. The palette value is VALIDATED against a fixed set — a junk localStorage
entry must not be able to set an arbitrary attribute (verified by a negative
control in the harness).

CASCADE ORDER IN palette.css IS LOAD-BEARING: (1) `:root` Instrument night,
(2) `[data-palette="X"]` other families night — equal specificity to :root, so
these win by SOURCE ORDER, (3) `[data-theme="dawn"]` Instrument day, (4)
`[data-palette="X"][data-theme="dawn"]` — higher specificity, beats (3). Moving a
block between those groups silently changes which palette wins. The file says so
at the top.

VALUES ARE NOT OURS TO INVENT: they are generated from the hub's
`palettes/families.json` and governed by `PALETTES.md` + `palette-check.mjs`
(exits non-zero). Change them THERE, regenerate, re-run the gate. Instrument is
the recommended default — the only family whose worst text pairing is >=4.87
across all four palettes, with AAA primary text on every fill and an exact-neutral
night chrome (Oklch C 0.0000), which is what an IR editor's surround owes.

VERIFIED: palette-apply.mjs (scratchpad) 361/361 — every one of 4 palettes x 2
modes x 5 pages resolves every token, matches the source-of-truth hex, carries the
right color-scheme, stamps theme-color from its own --bg, and rejects a junk
palette value. Plus axe clean, nav walk 63/63, all rails >=3:1.

THE PICKER (src/palette.ts) is a radiogroup of real buttons in the ⓘ Settings
row on ir.html, the macro help dialog and the launcher's About card. Each option
carries its NAME as text and the selected one appends "— in use": a swatch alone
would make colour the sole carrier of meaning, which is exactly what this whole
exercise is about, and selection marked by hue+weight alone would repeat the
mistake one level up. Instrument = the ABSENCE of the attribute, so the CSS
default is what ships if the module never runs (private mode, JS error, stale
bundle). VERIFIED picker-walk.mjs 36/36 across all three pages: applies,
persists, survives reload, moves aria-checked, restamps theme-color, and
clears both attribute and key when Instrument is reselected.

EACH OPTION SHOWS A NIGHT|DAY MINIATURE (owner, 2026-07-30: a text-only list
"doesn't show shit" — correct, you cannot choose a look you cannot see). The
swatch is a small mock of the real UI: page colour as the field, a card on it
with its rail, a text bar and the accent dot. It shows the thing that actually
separates these palettes — how far a card stands off the page, and how warm or
neutral the chrome is.

FIRST ATTEMPT PREVIEWED ONLY THE CURRENT MODE and was nearly useless in day:
the families diverge most at NIGHT, so four warm light swatches looked
identical. Both halves are shown instead, which needed the preview tokens to
stop being mode-scoped — they are now `--pal-<family>-<night|day>-<role>`, all
48 in :root, generated from families.json.

The swatch is aria-hidden with the family NAME as the label. The doctrine rule
is "colour is never the SOLE carrier", which was misread here as "do not show
the colour at all" — the correct reading is name AND swatch.

FULL A11Y AUDIT 2026-07-30 (owner: "it's all placeholder while I get
accessibility right — everything is subject to audit"). axe-core 4.12 (wcag2a/
aa, wcag21, wcag22aa, best-practice) plus the checks axe cannot make, over
EVERY page in BOTH repos, both themes, resting AND with each dialog open —
because most of this app's controls only exist inside a dialog, and a
resting-state-only sweep reports a clean bill of health it has not earned.

FOUND AND FIXED:
- 27 touch targets under 44px, across the IR bar, both help/info dialogs, the
  welcome dialog, privacy and notes. Not scattered — they collapsed to ~8 CSS
  rules (.bar-btn, .info-btn, .more-row a, dialog buttons, .backlink/footer a).
- 5 rendered text runs under the 11px floor. Two were PANEL LABELS, not dialog
  text, which is why a dialog-scoped rule missed them on the first pass. Cause:
  <small> is 0.8em of its CONTAINER, so inside an already-reduced box it
  compounds under the floor. Fixed with `small { font-size: max(0.6875rem, 0.8em) }`
  — keeps relative sizing where it already clears, lifts only what fell under.
- 1 axe `region` violation: the launcher's <main> wrapped ONLY the two door
  tiles, so the install section, the icon picker AND the new top bar sat outside
  every landmark and were skipped by landmark navigation. <main> now covers the
  page's content; the bar is a <nav aria-label="Site">. (The bar half was
  introduced by the hub-link work earlier the same day — the audit caught it.)

EXEMPT AND NAMED (Doctrine §4, the 2026-07-29 inline ruling — the exception is
applied, never silently): 5 links inline in a sentence — "privacy" ×2, "Venmo"
×2, and two mailto addresses. Their height is constrained by the line box and
forcing 44px mid-paragraph would break the text flow.

AN OVERLAY IS THE WRONG TOOL FOR A DENSE BAR. First attempt at the 26px ⓘ
buttons kept the box small and expanded the target with a centred 44px ::after.
It does not work: at ±21px the ring lands on the NEIGHBOURING bar controls,
which win elementFromPoint — so the target never grew, and had it won the hit
test it would have stolen those buttons' taps. The box was grown for real (the
bar is 56px, so 44px fits). VISUAL NOTE: the ⓘ is now a 44px circle beside the
wordmark and reads heavier than before — accessible and correct, but an
open aesthetic question for the owner.

MEASURE THE EFFECTIVE HIT AREA, NOT THE BOX. The audit now probes
elementFromPoint at the four corners of a 44px box around each control's
centre, because a legitimate hit-expanding overlay would otherwise be reported
as a failure. That check is also what proved the overlay above did NOT work.

SURFACE SEPARATION 2026-07-30 (owner: "address the surface fills"). Fills now
carry elevation, not just the rail: dusk page→card 1.09 → 1.30:1, dawn 1.17 →
1.27:1, and the dusk ladder is a real ladder at 1.30/1.43/1.65.

  dusk  --bg #0b0c0f→#08080b  --bg-2 #0f1014→#0b0b0e  --surface #15171c→#23252a
        --surface-2 #1c1f26→#2a2c33  --surface-3 #252932→#32363e
        --txt-3 #9095a1→#9ba0aa  --line-2 alpha .45
  dawn  --bg #e7e0d3→#ded7cb  --bg-2 #efe9dd→#e5e0d4   (nothing else moved)

HOW IT WAS DERIVED, because the obvious approaches are all wrong:
- The knobs are COUPLED. Spreading surfaces pushes --surface-3 (the pressed
  state) away from the page, which is the same direction as the text, so
  text-on-pressed loses contrast. Every naive spread broke --txt-3 on
  --surface-3. Surfaces and text tokens must be solved together.
- Buying dusk separation by DARKENING THE PAGE does not work: --bg was already
  at the luminance floor, so 55% darker moved page→card 1.09 → 1.13. The +0.05
  term in the contrast formula dominates down there. Dusk separation can only
  come from lifting surfaces. (Dawn is the opposite — deepening its page is the
  whole fix and costs nothing else.)
- Lifting dusk surfaces ALSO lowers rail contrast (a white rail on a lighter
  surface), which is why --line-2 went to .45 in the same move.
- The ceiling is real. A search over (surface lift × page move × rail alpha ×
  text tokens), constrained to text ≥4.6 and rail ≥3.4 (thresholds plus the
  ~0.15 a 1px rail loses to antialiasing), maxes out at 1.30:1 dusk / 1.27:1
  dawn. Past that something correct breaks. Do not chase a bigger number.
- COST, stated plainly: dusk text hierarchy (--txt vs --txt-3) compressed 12%,
  2.63x → 2.31x, and the panels went from near-black to dark grey. #23252a is
  industry-normal for a photo editor (Lightroom sits near #262626), but it IS a
  visible identity change. Dawn cost nothing.

PRIVACY + NOTES PAGES NOW FOLLOW THE THEME (2026-07-30). Both carried their own
inline DARK-ONLY palettes and stayed dark while the app was in dawn. Each now
has a [data-theme="dawn"] block and the same pre-paint script as index/ir/macro,
so there is no flash of the wrong palette. Their tokens are COPIES of
src/style.css — a sixth and seventh place the palette lives; change them
together. VERIFIED (theme-pages.mjs): both paint measurably different pages per
theme (14.4:1 apart) and body text clears 4.5:1 in both.

STILL DARK-ONLY: the theme-color meta tag is a single static value per page
(#08080b), so the iOS status bar stays dark-tinted in dawn. Pre-existing across
every page; fixing it means having the pre-paint script rewrite the tag.

FULL PALETTE MATRIX 2026-07-30 (the standard set was no remaining contrast
failures anywhere, with backgrounds explicitly in scope rather than fixed). Every foreground token was solved against every
background it can land on, in all FOUR palettes — Studio dusk/dawn and the hub's
dark/light — rather than sampling what happened to be on screen. Result after
the two fixes below: every text and rail pairing meets its threshold, all four
palettes. THE BACKGROUNDS WERE NOT THE PROBLEM and were not touched — both
failures were foreground tokens. The hub's palette passed outright with nothing
changed (its worst pairings: dark --magenta on --surface-hi 4.68:1, light
--amber on --surface-hi 4.52:1 — thin, watch them if those values ever move).

OBSERVED, NOT FIXED: surface fills barely separate from the page in every
palette (1.03–1.34:1 dusk, 1.03–1.17:1 dawn, 1.03–1.23:1 hub). That is not a
WCAG failure — the rails now carry the boundary at ≥3:1 — but it does mean the
rail is load-bearing everywhere: a card is told from the page by its edge alone,
never by its fill. Anything that weakens a rail therefore removes the ONLY cue.
ALSO OBSERVED: privacy.html and the generated notes.html carry their own inline
DARK-ONLY palettes with no [data-theme="dawn"] block, so they stay dark when the
app is in dawn. Not a contrast failure; a theme-consistency gap. Owner's call.

RECALIBRATED 2026-07-30 — --line-2 raised, dawn .50 -> .58, dusk .35 -> .40.
The rails were under the 3:1 rule and had been recorded as meeting it. The first
diagnosis in this file was WRONG and is corrected here: it blamed the launcher's
light-theme GRADIENT for being lighter than the calibration surfaces. It isn't
the gradient. Solving contrast(rail-over-B, B) across every backdrop in the dawn
palette shows .50 failing on ALL of them, and the worst case is --surface-3
(#e2dac9), not the gradient:

  dawn ink rgb(40,32,20)   --bg 2.98  --bg-2 3.04  --surface 3.10
                           --surface-2 3.02  --surface-3 2.93  gradient-top 3.04
  at .58                   --bg 3.69  --bg-2 3.80  --surface 3.90
                           --surface-2 3.77  --surface-3 3.62  gradient-top 3.80
  dusk ink rgb(255,255,255) at .35: worst 3.11 (--surface-3); at .40: worst 3.61

Dusk was raised too, and that one is a JUDGMENT CALL, not a failure: .35 clears
3:1 arithmetically (3.11 worst) and the three dusk rails on screen measured
3.20-3.50. But a 1px border antialiases ~0.15 off the arithmetic, so a dusk rail
sitting on --surface-3 renders around 2.96 — under the line, in a spot none of
the sampled rails happened to occupy. .40 buys margin that survives the paint.
Revert to .35 if the lighter dark-theme hairline is preferred; dawn .58 is not
optional.

VERIFIED by measuring painted pixels (rail-audit.mjs, session scratchpad): all
6 detectable rails across index/ir/macro/notes/privacy in both themes clear 3:1
— dawn worst 3.28 (was 2.67), dusk worst 3.73 (was 3.20). Coverage caveat: the
sweep only reaches rails that are VISIBLE without opening a dialog or loading a
photo, hence 6. The arithmetic table above is the exhaustive part; the pixel
sweep confirms the paint matches it.

AUDIT-HARNESS GOTCHAS (each returned a confident wrong answer first):
- getComputedStyle serializes `.35` as `0.35`, so string-matching a border
  color against the authored token matched NOTHING and the audit reported a
  clean sweep of zero rails. Compare numerically.
- border-radius comes back AUTHORED ("999px", "50%"), not used. A corner guard
  built on it skipped every pill and circle — i.e. precisely the controls being
  investigated. Clamp to min(radius, w/2, h/2).
- One sample column through a DASHED rail lands in a gap and reports ~1.1:1.
  Scan across the edge and take the strongest reading; for a dash, the dash IS
  the rail.

CALIBRATED TOKENS (2026-07-17; change only with recomputed WCAG ratios):
--txt-3 #9ba0aa dark (raised with the surfaces 2026-07-30) / #625c4d dawn;
--txt-2 #a3a7b2 dark / #5f5849 dawn — dawn CORRECTED 2026-07-30 from #6a6353,
which was 4.29:1 on --surface-3 (its worst surface) and, worse, QUIETER than
--txt-3: the secondary token had less contrast than the tertiary one. #5f5849
is 5.07:1 worst and restores the ordering (secondary stronger than tertiary);
--line-2 rgba(255,255,255,.45) dark / rgba(40,32,20,.58) dawn (≥3:1 rails) —
raised 2026-07-30 from .35/.50 (did NOT meet the rule), dusk again to .45 when
the surfaces lifted; see RECALIBRATED and SURFACE SEPARATION;
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
> capabilities and the owner wants real users to see them, and the owner tests them
> in production, on main, rather than on staging. The interest is chiefly in
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
- [x] **Full-bleed alignment view — the tilted photo fills the screen** — owner-caught on device
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
  direction 2026-07-16, given as the owner ended the session and moved to a new one.
  STILL AN IDEA — the owner says so plainly, expect design questions. The vision: the
  open photo is the BACKGROUND everywhere in the app, not boxed inside a stage.
  The picture fills the screen (overflowing behind as needed) and EVERY control
  — the top bar, the editor drawer/tabs, histogram, lesson chips, crop aids,
  banners — FLOATS over it. One coherent feel across the WHOLE app, not just the
  crop tool. The "let the photo overflow" crop item below is the FIRST concrete
  instance of this pattern: build it as the pilot, learn the design answers on
  it, then generalise outward. OPEN DESIGN QUESTIONS to settle WITH THE OWNER as it
  takes shape (don't guess these — they're the owner's taste calls): do floating panels
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
  **PILOT SHIPPED 2026-09-10, and this stays open because the design questions
  are not answered.** What landed: with a geometry tool armed the canvas reaches
  the top and both side edges (safe-area only), the 8px border-radius is gone,
  and `#stage` drops its 12px gutter. Measured — fills 100% of the width against
  93%/90% before, side gaps 0 against 30/22, radius 0px against 8px, and all
  four crop handles still grabbable at 820x1180 and 430x900. The rounded rect
  was what cut black wedges off a tilted photo's corners, so the alignment item
  above is resolved by this.
  **What did NOT land, deliberately:** the bottom still reserves the crop pill's
  measured height, because the bottom handles have to stay grabbable. Whether
  the pill should instead float OVER the photo and pass taps through where it is
  empty is one of the owner's open questions, not a guess for a session to make.
  The remaining text below is the original entry.
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
- [ ] **Tiles for a photo you have not opened yet** — measured 2026-09-12 and
  written up under "the strip's tiles". A tile for a photo you HAVE opened
  matches the photograph to 0.004 on a centre-against-edge measure; one you have
  not is 0.052 off, on a flat with a 43% hot spot. The lens correction is not
  the cause — it is present at full strength on both sides. The automatic depth
  lift is worked out twice, once for the tile and once when the photo opens, and
  the two answers differ on a frame whose middle is near white. The fix is to
  render an unopened photo's tile through the same code the open path uses,
  which means lifting the opening baseline out of `establishFreshEdit` as a pure
  function — a refactor of a load-bearing function with undo semantics attached
  (see "Adding an EditParams field" in CLAUDE.md), not a small change.
  **A RE-MEASUREMENT ON 2026-09-13 REPORTED 0.2726 AND WAS WRONG — it measured
  the provisional preview, not the baseline.** The number is recorded here
  because it was published in a commit message before it was checked, and
  because the way it looked right is the point.
  A tile shows the camera's own embedded JPEG the instant a photo lands and
  replaces it when this app's render arrives — a shipped feature. Both satisfy
  "the image has loaded", so a reading taken too early catches the camera's
  picture and the reading after catches the app's, and the difference between
  those two is large, real, and about nothing. It was **0.2726 and 0.2730 on two
  different photographs**, which should have been the tell: a per-photo
  measurement divergence does not come out the same to three decimals on two
  frames. Waiting for every tile to lose its `.provisional` class first gives
  **0.0000 on both**.
  So on this control, with these frames, the tile for an unopened photo matches
  the tile after opening EXACTLY.
  **And the control itself is the wrong one for this item**, which the audit
  above already says in so many words: comparing a tile against a tile proves
  only that the two readings agree, and they can agree by both going through
  `makeThumb`. The 0.052 in the line above was measured against the PHOTOGRAPH
  ON SCREEN, and nothing here re-measures that. It stands, unverified by this
  session.
  **THE RIGHT CONTROL IS BUILT NOW, and it is the audit's own:** the tile for a
  photo that has NOT been opened, read first, against the PHOTOGRAPH that then
  appears when it is opened — captured as a screenshot of the canvas handed back
  to the page as an `<img>`, because a WebGL canvas cannot be read with
  `getImageData` without a preserved drawing buffer. Scratchpad
  `tilevsphoto.mjs`. Screenshot the CANVAS, never `#stage`: the stage includes
  the app's ground around the picture, and dark margins wreck a
  centre-against-edge ratio far harder than any hot spot (measured: 0.62 against
  1.98 for the same frame).
  **What it reports is a near-perfect colour match and a hot-spot difference:**
  mean RGB apart by **0.0048**, centre-against-edge apart by **0.31** (tile 2.287,
  photograph 1.977). And that second number is NOT yet a finding — the tile is
  260px and the photograph 904px, and a centre-against-edge ratio is
  scale-sensitive, so some of it is the comparison and not the app.
  **A CLAIM MADE HERE THAT THE APP ITSELF REFUTED.** This note said no shipped
  profile could match those frames, because they are from a NIKON Z50_2 and
  every shipped profile's header names a NIKON Z 50. That was read off a
  provenance COMMENT; `matchAny` keys on `p.model === ex.lens`, the LENS, and
  the body is not part of matching at all. Asked directly, the app says:
  *matched 50-250 from EXIF, brightness only, measured at 130mm against this
  frame's 145mm, colour withheld because it was measured on a different body
  and an infrared conversion decides what colour the sensor sees, which is not
  a property of the lens.* Exactly right, and better than the reasoning that
  doubted it. **Ask the app before concluding something about its matching.**
  So the fixture DOES exercise the brightness half, and forcing the tile's
  `lensFix` to 0 and then its `hsFix` to 0 still changed nothing across three
  builds — which is now an OPEN question rather than an explained one: the
  strength the thumbnail path applies that bump through is not either of those
  fields, and finding which it is, is where the next session starts.
  The 44 practice DNGs remain the wrong fixture for any of this: they carry no
  lens, focal length or aperture at all.
  **And the scale problem is real and unsolved**: a 260px tile and a 904px
  canvas cannot be compared on a centre-against-edge ratio without rendering
  both at one size first.
  The fixture point still holds for anyone re-measuring this properly: the 44
  practice DNGs carry no lens, focal length or aperture at all, so no profile
  can match them and neither path applies a correction — frames that exercise
  the lens half have to carry real metadata, and they cannot ship here, so the
  probe takes a directory (`FRAMEDIR`, scratchpad `tilebaseline.mjs`).
  **AND ONE HYPOTHESIS IS RULED OUT.** It looked as though nothing re-checked a
  tile's stamp when its photo gained an edit — `restripForGrade` is called only
  on a grade move — so a call was added where the edit is stored. Measured on
  builds with and without it: **tiles already redraw after their photos are
  opened either way**, and the added call only shifted which tile won a
  debounce race. It was removed rather than shipped. The divergence is the
  BASELINE being computed twice by different code, exactly as this item says,
  not a missing invalidation.
  Three instrument faults on the way, each of which reported a perfect fix:
  clicking `#sessionStrip`'s children (the header, not the tiles) so no photo
  ever switched; reading `#fileName`, which is not what names the open photo;
  and a MutationObserver watching `src` ATTRIBUTES when a redraw replaces the
  whole `<img>` node.
- [ ] **Opening a set on several cores** — measured 2026-09-13, and the first
  version of this item blamed the wrong thing (see "the tile audit was wrong").
  What is true: every photograph is decoded by ONE worker, one after another,
  and the lens rig sends ninety flats through the same door. What is NOT the
  problem: the tiles, measured at 21 ms each on the test page — forty of them is
  under a second. The set-open cost is storage commits (about 320 ms for a 25 MB
  raw on a desktop, serial by design so a crash cannot leave a half-resumable
  session) and decode, and decode is the actionable half: pure computation,
  queued behind a single worker, with the export's pool already written as the
  shape that fixes it. Measure the real split on a device first — the test page
  reports both halves now.
  **HALF DONE 2026-09-13, and this stays open for the measurement it asks for.**
  The pool itself was built earlier the same day — `decodeClient` runs three or
  four lanes — and **the pass that decodes every photograph in a set was still
  handing it one file and waiting**, so two of three lanes sat idle through the
  whole of a set open. The pool was built and its largest customer queued.
  `realThumbnails` now keeps up to the lane count in flight.
  **Sized by `decodeLaneTarget()`, not `decodeLanes()`.** The latter reports how
  many lanes are ALIVE, which is zero until something decodes — and this pass
  runs when nothing has decoded yet, so the first version sized itself at one
  and changed nothing. The diagnostic keeps the live count deliberately (a
  report must not spawn workers to describe the app); a caller about to spawn
  them wants the planned one.
  **The gain HERE is small and the number that matters is not this one.** Twelve
  practice raws, three runs each in a container on a software rasteriser: 11.8s
  median with one in flight against 11.0s with the pool, about 7%. This machine
  decodes a raw in 43 ms where an 8-core iPad takes 180, so the decode share —
  the part being parallelised — is at its smallest here. A device measurement is
  still owed and is the one to record.
  **Correctness is asserted by COUNTING DECODES, because the tiles cannot see
  the defect.** Without the in-flight guard two lanes take the same photo and
  both write the SAME correct tile: ten tiles, ten distinct pictures, a strip
  that looks perfect, and the device decoding everything three times. Patching
  `Worker.prototype.postMessage` counts what actually went to a decoder — 11 for
  ten photos with the guard (the opened photo is decoded to be shown and again
  for its tile, which is correct), **31 without it**. The walk also asserts one
  tile per photo and a clean teardown mid-pass.
  Two instrument faults on the way: a first version of the correctness walk
  passed against the planted defect because it only counted tiles, and ending a
  session asks with a native `confirm()`, which Playwright DISMISSES by default
  — so the teardown branch never ran while reporting a failure about the app.
- [ ] **The editor's WORKING COPY at native resolution** — never call this "full
  size" to the owner: the export panel already owns that phrase, its scale
  control reads "Full (native)" and a Quality slider sits at 92 beside it, and a
  crop already changes the output's dimensions. NOTHING in that panel changes.
  This is the internal copy the live view is drawn from, half resolution today
  and invisible as a control. **Ships in 3.0, the optimized release (owner
  declaration, 2026-09-13)** —
  MEASURED ON ALL THREE DEVICES 2026-09-13 and the premise for the proxy is gone:
  a full-resolution HALF-FLOAT source draws a screen-sized frame NO WORSE than
  today's quarter-size proxy on every device measured. On the iPads the three
  sources are within run-to-run noise and the ordering is not stable — a second
  run of the 4-core iPad reversed it (28 against 35 one run, 33 against 27 the
  next), which is why the drawing probe now takes three passes and prints the
  spread. The desktop is consistent (12-13 against 13, float32 19). Memory is the
  solid number: 170 MB for a 21-megapixel frame against 340, and what the halving
  costs the picture reads 0.018 of 255 on every device. The catch that decides HOW: denoise and sharpen tap in texels, so
  full resolution would silently halve their footprint and change what every
  tuned slider means — so it ships with the tap scale set to the old proxy factor,
  which reproduces today's footprint exactly, and the acceptance test is that a
  photograph renders pixel for pixel as it did. Whether those operators should
  work at native scale is a SEPARATE product question with a slider-meaning
  change attached. Original note follows.
- [ ] **(superseded detail) The live view at full resolution** —
  measured 2026-09-13 and the premise for the proxy may have expired. The editor
  works on a downscaled copy because a full-resolution render was too costly when
  that was decided; drawing a screen-sized frame from a full-resolution texture
  now measures the SAME as drawing it from the proxy (1418 ms against 1412 in a
  container — the absolutes are software, the equality is structural, because the
  work is per output pixel). What it costs is memory: 16 MB a megapixel as
  float32, about 340 MB for a 21-megapixel frame against roughly 84 for today's
  proxy, halved by a half-float texture. The prize is not speed: it is that the
  preview and the export become the same pixels at the same scale, which retires
  the proxy-texel footprint, the tap scale, `proxyFactorFor`, and the class of
  defect where a tile or an export disagrees with the photograph. The test page
  reports the memory per device, so the decision has numbers. Do this BEFORE the
  drawn export below — it subsumes most of it.
- [ ] **The export drawn rather than computed** — **ships in 3.0 with the item
  above, the two together (owner declaration, 2026-09-13)** — scoped 2026-09-13,
  waiting on numbers from the device. The live view already runs the entire edit as shaders
  in `gl.ts`; `export.ts` implements every one of them again in TypeScript, and
  both files carry comments asking whoever edits one to keep the constants in
  step by hand. Drawing the export through the shaders that already exist would
  be faster AND would end that duplication — one implementation of the edit
  instead of two, with the preview and the export provably the same thing. What
  it waits on is the test page's new probes on a real iPad: whether a whole frame
  fits in one texture, whether a background thread can draw, and above all what a
  frame-sized render costs to READ BACK, which is the part a preview never pays.
  The decision that comes with it is the owner's: a drawn export cannot be
  byte-identical to today's, because a graphics chip computes in float where the
  processor uses doubles. It would match the PREVIEW instead.

- [x] **Stop calling every device an iPad** — SHIPPED 2026-09-13. The app said
  "iPad" in copy any browser on any machine reads, because it was built on one
  and the language followed its author rather than its reader.
  **One module answers the device question now: `src/platform.ts`.** It existed
  in THREE places before — the install prompt's own `isIOS`, the export path's
  `downloadIsUseless`, and the diagnostic's `deviceLine` — each written
  separately, each slightly different, and no two of them wrong the same way
  (hub LESSONS §243 is this shape). All three ask the module; nothing else
  matches a browser string.
  The one fact it turns on: iPadOS Safari reports `MacIntel` and a Macintosh
  browser string on purpose, so only `maxTouchPoints` separates an iPad (5)
  from a Mac (0). Tested against fourteen real browser strings
  (scratchpad `plattest.mjs`) including that pair, which differ ONLY in that
  number; planting `iPadInDesktopMode = false` fails exactly one case.
  Three shapes of copy, decided per sentence:
  (1) just a noun -> `<span data-device-noun>device</span>`, filled in with the
  device's real name and shipping with the right word already in it, so a
  script that never runs still leaves a correct sentence;
  (2) only true on one platform -> `data-only-plat="ios"`, shipped HIDDEN and
  revealed on a match — the welcome screen's iCloud/Files paragraph was the
  first thing every reader on every machine saw, and it is an iOS story;
  (3) reference material a reader may want for a machine they are not holding
  (the install and uninstall lists, the Files-picker section) -> stays whole
  for everyone, with the reader's own row marked in WORDS ("you're on this")
  plus weight, never a fill, and the Help section carrying a scope line.
  The install rows also carry `data-browser` where it matters, because on a Mac
  running Chrome the Safari row is not the reader's row.
  Verified in a browser as four devices (scratchpad `devicewalk.mjs` for
  Infrared, `macrodev.mjs` for Macro): the noun, the hidden note, and exactly
  the right marked rows. Both plants — ignoring the browser constraint, and
  revealing the note always — fail it. **The first two plants PASSED and meant
  nothing: each left a variable unused, so `tsc --noEmit` failed the build and
  the walk ran against the old dist.** A plant that does not compile is not a
  negative control.
  Also platform-branched: the lens rig's auto-lock instruction, which named an
  iPad Settings path to everybody and now names the path for the machine in
  hand, or none at all where it does not know one.

- [x] **Install and UNINSTALL instructions for every platform, not just iPad** —
  SHIPPED 2026-09-13. The ⓘ explained adding to a home screen on iOS and
  nothing else, and said nothing at all about getting back out.
  Both halves are lists now, on all three surfaces — Infrared's Help, Macro's
  Help, and the launcher — covering iPhone/iPad, Android, Chrome or Edge on a
  computer, Safari on a Mac, and Firefox (which cannot install one, said
  plainly rather than left out).
  **Uninstall leads with why it is not obvious:** an installed web app is not a
  shortcut, so unpinning it from a taskbar or dock does not remove it — then
  the route per platform, and what removal does and does not touch. It is the
  half nobody writes and the half somebody needs when they are already annoyed.
  Every row carries `data-plat` (and `data-browser` where the row is
  browser-specific), so the device work above marks the reader's own row while
  leaving the list whole — a reader is often setting up a machine other than
  the one they are holding, and hiding the rest would answer the wrong
  question.

- [x] **A pass on the words themselves** — SHIPPED 2026-09-13.
  **MEASURED PER SCREEN, never as a total.** The instrument counts words that
  are actually painted, because the two ways of getting this wrong both
  overstate: summing twelve panel tabs reports 1,540 words for a screen showing
  about a hundred, and counting a CLOSED `<details>` adds copy nobody can see —
  Chromium still reports a painted box for its children, which inflated the IR
  tab by 59 words until the counter was fixed. Every number below is one screen
  as a reader meets it.
  **Start screen: 228 -> 149.** Five ways in, each with a full paragraph
  explaining it, and each of those paragraphs restating what the screen it
  opens already says at greater length. One line each now — enough to choose.
  Nothing was lost: the batch dialog's lead, the lens dialog's `<details>` and
  the quick-look grid's own help all carry the detail, where it applies.
  **Corrections tab: 371 -> 248.** Its 125-word hot-spot-colour note was the
  longest in the app, sitting beside the slider it describes, duplicating a
  group note ten lines above it AND the Help entry. One note for the three
  sliders now, keeping the only thing the long one knew that the short one did
  not: which way to push, and that it depends on the look.
  **Crop 189 -> 125, export 270 -> 250, IR 285 -> 257.** Every tab is now under
  260 with explanations ON, and the Explanations toggle still takes them all
  away for a reader who has learned the controls.
  **Help was NOT cut, on the owner's call** — it is reference somebody opens on
  purpose, and length is not its problem. What was wrong there was one section,
  "Looks & adjustments", holding 991 words on four unrelated subjects behind a
  single heading: 2.7x the next longest, with no way in but the top. Split into
  four sub-headings with every word kept, and the Help filter now opens the
  SUB-section holding the match rather than only its parent — without that, a
  search leaves the reader looking at four closed headings.
  Two platform-specific things moved rather than shrank: the welcome screen's
  iCloud paragraph is now shown only on iOS, and the Files-picker Help section
  says at the top that it is an iPhone and iPad matter.

- [x] **High-contrast modes — forced-colors and prefers-contrast** — SHIPPED
  2026-09-13. Of the five places this app shows "this one is selected", FOUR
  already changed text weight as well as fill and survived a forced-colors
  strip. The fifth was the **session strip** — which photograph you are editing
  was a background fill alone, so in high contrast it said nothing, and it is
  the worst of the five to lose. Selected states now also carry an outline in
  the system highlight colour. The scope was measured rather than assumed: the
  note that prompted it said every active state was affected, and one was.
  The first version of the test passed with the fix turned off, because it
  happened to check one of the four that were already fine.

- [x] **Manifest screenshots** — SHIPPED 2026-09-13, all three apps, both
  shapes, shot headlessly from the app itself so they cannot drift from what it
  looks like. **Not precached** — the browser's install dialog reads them and
  the app never does, so bundling them put half a megabyte into every install
  and every release's fresh cache, and `addAll` is all-or-nothing, which makes
  them half a megabyte of new ways for an install to fail on a thin connection.
  Same exclusion the social-share images already had.
  **`tools/manifest-shots-check.mjs` is the gate, and it reads the BYTES.**
  Every field in a screenshot entry is a claim — that the file is there, that it
  is the type and the SIZE it says — and a wrong one is refused in silence: the
  browser drops the entry and shows the plain prompt, which is indistinguishable
  from never having added screenshots. It parses the JPEG segment chain for the
  real dimensions, checks both directions, and refuses a manifest that offers
  only one form factor. Wired into `.branch-guard`'s `also=`.
  **Two of the six were caught showing the wrong thing before they shipped.**
  The launcher pair had the first-visit welcome dialog open over the tool cards
  — a modal is not the product — and the Macro pair started as an error message,
  because the shot script fed a RAW to a tool that takes JPEGs. The launcher
  walk now refuses to save a frame with `dialog[open]` in it, and the Macro one
  refuses a frame still on the start panel.

- [x] **Lens profiles that cannot vanish** — SHIPPED 2026-09-13. Two of the
  three parts were already built: the export the reader keeps, and a panel note
  that prints the BROWSER'S OWN answer about whether it intends to keep the
  storage rather than a generic caution.
  **What was missing was the only question the reader actually has:** have the
  measurements on this device ever left it. "Save a backup" printed on every
  visit says the same thing to somebody who backed up five minutes ago and to
  somebody who has measured eleven lenses and never taken a copy.
  **It records the STAMP, not a flag or a date** — `profilesStamp()` already
  hashes the stored text for the preview cache, so a stamp that still matches
  means the file the reader holds IS what is on the device, and the moment they
  measure anything new it stops matching by itself with nothing to remember to
  update. A boolean would read "backed up" for ever after one press; the state
  machine has four values and `stale` is the one that matters.
  Marked only when a copy actually left — a cancelled share sheet is not a
  backup and an empty export is not a backup of anything. Shown after a run
  keeps a profile, which is the moment there is something new to lose, and in
  the panel note, where `.needs-backup` is a left rule and weight rather than a
  colour so it survives grayscale and a forced-colors strip.
  Asserted twice: the four states driven through real storage (scratchpad
  `backupstate.mjs`, 7 checks) and the three on screen through the real panel
  (`backupwalk.mjs`). Both plants compile and both are caught — the
  boolean-flag design fails 2 of 7, and forgetting to re-render after a backup
  fails the walk.
  **And the third part: Help now carries an account of what survives what** —
  what is kept on this device, what clears it (website data, deleting an
  installed app, a browser needing the room, a private window), and what
  survives all of it. It names the iOS rule explicitly: Safari clears a site's
  storage after about a week unless it is installed to the home screen.
  **The fixture cost a round.** Profiles carry NBINS=80 radial bins and `read()`
  silently drops anything else, so a 24-bin fixture made all seven checks report
  an empty device — a green-looking "empty, empty, empty" that was the test
  data, not the code.
  **AND THE REPO'S OWN GATE REFUSED THE FIRST COMMIT, RIGHTLY.** The bookkeeping
  was written inside `lensstore.ts`, which `tools/preview-version-check.mjs`
  hashes because a quick-look preview is rendered THROUGH the reader's lens
  correction. Taking the bump it asked for would have thrown away every preview
  every reader has cached, to record a change that cannot alter a pixel. It
  lives in `src/lensbackup.ts` instead — the file it came out of says in its own
  header that it only keeps and matches, and whether a copy exists elsewhere is
  a different question asked by a different part of the screen. A gate that
  refuses is also a design review.

- [x] **The version menu runs the full width of the screen** — SHIPPED
  2026-09-13, reported the same day. `#verDlg` carried no width of its own, so
  it fell through to the shared `calc(100% - 36px)`: **1244px of 1280 on a
  desktop and 784 of 820 on a tablet**, against 640 for Help and the lens panel
  and 520 for every short dialog. Measured across all fifteen dialogs — the only
  other three at 100% are the library, Quick look and the compare view, which
  are full-screen deliberately. It joins the `#helpDlg, #lensDlg` rule at
  `min(640px, 92vw)` rather than getting a third expression; it carries a
  twelve-row report, so it takes the wider of the two sizes. Checked for
  overflow at 1280, 820 and 390 wide: nothing sticks out and the page never
  scrolls sideways.
  **AND THE SAME LOOK FOUND ITS NEIGHBOUR.** In that dialog's action row, "Test
  this device" is an `<a>` and "Measure your lens" is a `<button>`, both wearing
  `.ver-link` — and the base rule is `select, button { width: 100% }`, keyed on
  the TAG. So one came out 141px and the other 604px, side by side, looking like
  two different kinds of control. This stylesheet already states the principle
  forty lines further down, about a `<label>` silently opting OUT of the same
  tag-keyed width; this was the same fault in the other direction. The class
  sets `width: auto` and both are 141px and 143px now, at 44px tall.
  **`tools/class-width-walk.mjs` is the instrument, and it is in the REPO.**
  It renders all four pages, opens every dialog, and flags any class worn by two
  different TAGS in one container whose widths differ by more than 60px —
  because whether the tag rule or the class rule wins is a cascade question no
  grep can answer. It finds nothing across the app today, and removing
  `width: auto` from `.ver-link` makes it print a 463px spread, so its green
  means something. Not in `.branch-guard`'s `also=`: it drives a browser against
  a served build. Run it before a UI release, beside the a11y walk.
  It is tracked rather than left in the scratchpad because it took four attempts
  and the next session to meet this defect would otherwise build it again.
  **Two of those four attempts are worth keeping.** A plant applied with `sed`
  to the first `width: auto` in the file landed 1,977 lines away from the rule
  it was meant to disable, and the walk's green measured nothing; and anchoring
  on the rule's closing brace found the one INSIDE its own comment, because the
  comment quotes `select, button { width: 100% }`. Plant by a unique anchor, and
  print what was planted.

## The in-app Roadmap went to zero and five commits shipped it, 2026-09-14

**A SESSION APPENDING TO THIS FILE BROKE THE DIALOG THIS FILE FEEDS.** The ⓘ
Roadmap is parsed out of NOTES.md by `vite.config.ts`: find
`## Next capability release`, read the `- [ ]` bullets under it, **stop at the
next `## `**. An append anchored on the string `## Shipped (roadmap archive)`
and used a plain replace — and that heading is MENTIONED, in quotes, inside the
roadmap section's own blockquote, eight hundred lines above the real heading. So
three sections landed INSIDE the roadmap, the first of their `## ` headings
stopped the parser before the first bullet, and **the roadmap went from 18 items
to 0**.

It shipped in `dd643a1` and was still broken through `a8b5e05` — five commits,
to staging and then to production, where it is live as this is written. Nothing
went red anywhere, and nothing could: `checklist()` is wrapped in a try/catch
returning `[]`, so every way of getting this wrong produces a clean build, a
green deploy and a dialog with nothing in it. The build even told the truth on
every run and nobody was reading it, because there was no number to compare it
against.

**`tools/notes-check.mjs` runs on every commit now**, through `.branch-guard`'s
`also=`. It asserts the OUTPUT of the same parse rather than the shape of the
file — what the reader would actually see — and it checks each heading appears
exactly once AT THE START OF A LINE, because a bare `indexOf` on either of those
strings is precisely what went wrong. Run against the state that shipped it
reports two failures; against the commit before, none.

**Three things to take from it.**
A string that names a heading is not an anchor — the file that documents a
heading contains that heading's name, so the mention comes first and a plain
replace finds the documentation rather than the section.
A parser whose failure mode is an empty result cannot be monitored by watching
for errors; it has to be checked by asserting a count somebody knows the shape
of, which is hub §119's closing point arriving from the other direction.
And a section boundary is load-bearing markup when something parses the file —
appending to a document that is also an input is a code change wearing prose.

## Reading the doctrine found a whole app with no version on screen, 2026-09-14

**THIS REPO HAD NO `.doctrine-sync` AT ALL**, so nothing recorded which version
of the shared rules it had ever been held to, and every session got the same
"no marker" message carrying no information about what was unreconciled. The hub
says to run `doctrine-sync.mjs` FIRST in any sibling session; it had never been
run here. Reading DOCTRINE.md rather than the index of it found two things.

**§7b — Macro Studio shipped without a build stamp, for its whole life.** The
rule is non-negotiable per app, from the first deploy: the running version is on
screen in the normal working view, written at BOOT, because the reader reports
from a device with a screenshot they did not compose — and without a version on
it, a live defect, one already fixed, a stale cached shell and a build from three
releases ago are indistinguishable, and the session guesses. The editor has
carried one since its first deploy. The other app in the same repository had
none.

**AND THE FIRST FIX WAS ON SCREEN AND WAS NOT THE STAMP.** Adding the markup and
a boot write produced a stamp measuring the inherited body colour at the
inherited size with `user-select` never reaching it: `.ver-tag` lives in
`style.css`, and **Macro Studio does not load style.css**. The class did nothing.
Measured before and after — `rgb(234,234,234)` at default size against
`rgb(193,193,193)` at 11px, which is what `--txt-3` resolves to and what the
editor's stamp has always been.

So the look moved to `src/verstamp.css`, imported by `src/verstamp.ts`, which is
the one module that writes the stamp — the `swstrip.css` shape exactly, and for
the reason that file already gives: three stylesheets would otherwise carry three
copies and "which one is current" would have three answers. The editor's inline
stamp write became a call to the same function. Asserted on both apps in both
themes: on screen at rest, the colour IS the `--txt-3` token, `opacity: 1` (a
stamp dimmed with opacity is invisible to a contrast gate — §7b, and two sibling
apps shipped 2.54:1 while their gate read 4.79:1), 11px, and selectable so a
version can be pasted rather than transcribed.

**§4 — `textsize-paths` was empty in `gates.yml` for the life of that file**,
under a comment calling it a real gap rather than an opinion. A gap that is named
and not closed is a gap. Filled with every stylesheet this app ships and every
page it serves from source. It came back green on the first run — no fixed font
sizes, 100 relative declarations — and a planted `font-size: 13px` in
`swstrip.css` made it fail, so the green is a measurement rather than an absence.
It matters here beyond conformance: page zoom scales `px`, and on a tablet
raising the DEFAULT TEXT SIZE is the setting people actually reach for, which a
px-only stylesheet does nothing for.

**And the pin was four weeks behind the marker that did not exist.** `gates.yml`
called the hub at `82069a9` while the hub was at `bf9e3ab`, so every gate added
upstream in between was enforced nowhere. Both now read `bf9e3ab`, and
`tools/hub-pin-check.mjs` (copied from the sibling that carries it, where it is
deliberately a repo-local check rather than a hub gate) runs on every commit
through `.branch-guard`'s `also=`. Planted a pin behind the marker: refused.

**Still open from that read:** there is no `ACCESSIBILITY.md` (§12 — the
append-only register, for a repo with a UI), and `palette-path` stays empty
because it needs a palette JSON this repo does not have.

## The sweep is fifteen walks and one command now, 2026-09-14

**FOUR WALKS WERE IN THE REPOSITORY AND ROUGHLY EIGHTEEN WERE NOT**, including
`export-bytes` — the gate that proves an export is byte-identical — and
`a11y-verdicts`, which is the only thing holding hub §293. Each was rebuilt in a
session scratchpad before a release and held nowhere, so a session that did not
know one existed shipped without it, and a container going away took it with it.
Ten moved in: export-bytes, journey, rotation, release, verdicts, collect,
export-ui, export-report, switch-instrument and a11y-verdicts. Each carries a
header saying what it is the only instrument for. One-release probes stay in the
scratchpad, which is what a scratchpad is for.

**AND THE SWEEP ITSELF WAS A SESSION TYPING TEN COMMANDS FROM MEMORY**, which
means the sweep was whatever that session remembered — and a walk it forgot was
indistinguishable from a walk that passed. `tools/walk-all.mjs` runs every
`*-walk.mjs` on disk, so adding one to `tools/` adds it to the sweep with nothing
to remember. It refuses to start when nothing is serving `dist`, because fifteen
walks each failing to connect is six minutes of output that says nothing about
the build. Sequential on purpose: run at once, the other walks become the thing
`switch-instrument` is measuring.

**Measured on the run that added it: fifteen walks, 354 seconds, all green.**
The three slow ones are a11y (69s, seven pages in both themes), export-report
(69s) and tile-truth (71s); the rest are under half a minute each.

## The correction strength would not stay where it was put, 2026-09-14

**THE REPORT WAS RIGHT IN ITS FIRST SENTENCE AND THREE TURNS WENT ELSEWHERE.**
"Blue circles instead of fixed hotspots" named the hot-spot correction; it was
read as healed dust spots after a screenshot showed the Corrections panel open
on Dust & spots, and two failed fixes went into the heal path before the reader
said plainly that turning the hot-spot strength down fixes it. The lesson is not
subtle: the reporter had already named both the cause and the remedy.

**MEASURED ON THE READER'S OWN FRAME** (NIR_1376.NEF, Z 50, NIKKOR Z DX 50-250mm
at 57mm f/8 — the first real file with EXIF this work has had, since all 44
practice DNGs carry none). The correction at strength 1 changes the centre by
**-6 red, +5 green, +3 blue**, falling to nothing by two-thirds of the way out.
An eleven-point red-to-green swing at the centre, which on a flat bright field
reads as a cyan disc.

**AND A LOWER SHIPPED DEFAULT WOULD BE THE WRONG FIX.** Sweeping the strength on
that frame, the radial red-green spread from centre to edge falls monotonically
as strength RISES: 32.3 at 0, 29.1 at 0.25, 25.9 at 0.5, 22.8 at 0.75, 19.7 at 1,
13.7 at 1.5. By the measure the profile is calibrated against, more correction is
flatter. Both readings are true at once — the ring average is dominated by sky
and foliage, while the artefact lives in bright grass that is already near
neutral, where the same radial push has nothing to cancel and shows as colour.
Which of the two matters is a judgement about the reader's own photographs.

**SO THE FIX IS TO REMEMBER THEIR ANSWER, NOT TO GUESS A BETTER NUMBER.** Both
cards hard-coded full strength on every open — `params.lensFix = myLens ? 1 : 0`
and `params.hsFix = 1` — so the remedy the reader had already found was a slider
they had to move again on every photograph. Reported from a session of
**sixty-two**. The strength is now remembered per profile, keyed per lens AND
aperture (`shipped:50-250@8.0`), because a strength that suits one is not a claim
about another. Written on `change` and never on `input`, or a drag stores every
value it passed through. Full strength is stored as ABSENCE, so putting it back
leaves nothing behind and the map cannot only grow.

**Also confirmed dead, on the reader's file:** the lens correction's centre gains
came back red 1.022x, blue 0.943x, **blue over red 0.92x — close to neutral**, so
the arithmetic-from-the-honest-range theory that opened this investigation was
wrong. Nothing in the lens or hot-spot path changed in the 52-commit promote
either; `pipeline.ts`, `hotspot.ts`, `hotspotProfiles.ts` and `lensstore.ts` are
identical to what production was already running, and every lens commit predates
it.

**Instrument errors, four in one investigation, all caught by controls:** a
chroma distance that divided by a green channel sitting at zero and reported
95.7; a disc-versus-ring measurement that found its worst case in near-black
canopy where fractions swing on rounding; a `location.reload()` that only queues
a navigation; and a strength sweep that drove `stkMatchStrength` because it was
the first id matching /stren/i. Every one of them produced a confident number.

## Healed spots cloning the wrong colour — RETRACTED, it was the measurement, 2026-09-14

**THE REPORT WAS ABOUT HEALED DUST SPOTS, and the first two hours went to the
wrong defect.** "Hot-spots" was read as the IR LENS hot-spot and a whole lens
section was built for the §7f report before a screenshot showed the Corrections
panel open on Dust & spots and a soft cyan disc sitting in bright infrared
grass. The lens work is kept because a lens question will come and the report
could not answer one either — but it was not the question asked, and the term
means both things in this app.

**THE STRUCTURAL CAUSE IS REAL AND WAS FOUND BY READING.** `findHealSource`
scores every candidate patch on LUMA ALONE: a surround SAD over the annulus plus
a smoothness term inside the disc, both from `lumaAccessor`, with no colour term
anywhere. That is a visible-light assumption. The luma weights are
0.21/0.72/0.07, so green carries nearly three quarters of the number while red
and blue carry the false colour — in a channel-swapped infrared frame two
regions can match in brightness and be opposite in hue, and the search clones
one into the other and scores it well.

**"REPRODUCED" ON A PRACTICE FRAME — AND IT WAS NOT.** The first walk reported a
healed disc at rgb(122,14,11) against a surround of rgb(128,33,26) and a colour
distance of 0.150. It compared the disc against a ring **1.6-2.6 radii out, on
the canvas, after the full pipeline** — a neighbourhood far wider than the
**1.05-1.5** annulus `findHealSource` actually matches on. On a frame with
structure at that scale it was measuring content the search never claimed to
match, and calling the difference a defect.

**THE REAL MEASUREMENT SAYS THE SEARCH IS ALREADY OPTIMAL.** Asking the right
question — how does the patch the app picks compare with the best colour match
available in its own 48 offsets, and with the best in a set twelve times larger
— on the reader's own NIR_1376 and on two practice frames, at twelve taps:

- what the app picks: **0.000 to 0.007**
- the best available in the same 48 offsets: **0.000 to 0.001**
- the best available anywhere: **0.000 to 0.001**

There is no gap. A colour-aware score would choose what it already chooses, which
is exactly why adding one at weight 900 moved nothing — not because the weight
was wrong, but because there was nothing to promote. The luma-only scoring is a
real visible-light assumption and it is not costing anything measurable on these
frames.

**AND TWO ATTEMPTED FIXES BOTH FAILED, MEASURED.**

- **A chroma term in the score.** A `chromaAccessor` returning each channel as a
  fraction of the three, added to the annulus SAD at a weight of 900 — enough
  to dominate the luma term several times over. A/B over six chosen bright taps:
  worst **0.095 on both builds, at the same tap**; two taps marginally better,
  two marginally worse. Noise. Reverted.
- **A wider candidate search**, 6 distances x 24 angles against the shipped
  3 x 16. Worst went **0.150 to 0.164** and the chosen sources moved further
  away, which is further from similar. Reverted.

That hypothesis — that the candidate set had no good member to promote — was
tested directly and is also wrong. Good members exist and the app already picks
them. Both fixes failed because **there was no defect to fix**.

**WHAT SHIPPED INSTEAD: the report can now answer it from the reader's own
photograph.** Every healed spot is listed with how far its patch came from, in
radii, and the colour distance between the destination's annulus and the
source's annulus measured on the buffer the heal actually reads. Clean heals on
practice frames report 0.001.

**ONE NUMBER WORTH KEEPING: 0.001 in the raw buffer became 0.095 on the canvas.**
The source search compares the linear decode; the reader sees the frame after a
channel swap and a saturating look. A residual the search treats as an excellent
match is amplified into a visible cast. Any fix that only tightens the raw-buffer
match may still leave a visible disc, and any measurement taken only on the raw
buffer will say the heal is fine.

**THE WALK WAS REWRITTEN TO ASK THE QUESTION THE CODE ANSWERS.** It now measures
the GAP — the app's pick against the best available to it, and against the best
available at all — because a gap on the first leg means the scoring is wrong and
a gap on the second means the candidate set is too small, and no gap means the
search is doing as well as it can. Thresholds at 0.02, ten times the observed
noise. It passes, honestly, and it would catch the defect it was originally
written to imagine.

**The cost of the version that asked the wrong question: two speculative changes
to a pixel pipeline, both reverted, and a NOTES section that claimed a
reproduction.** A measurement has to ask the question the code is answering, or
it invents work — and it invents it with a number attached, which is what makes
it persuasive.

**Not reproduced: the cyan disc itself.** No practice frame at any tap tried
produces one. The frames are different scenes, and the report is from a
62-photograph session on a device. The walk stands as a regression guard on the
heal's colour behaviour, NOT as evidence about that report.

## Blue circles where a hot-spot was corrected, 2026-09-14

**REPORTED FROM PRODUCTION at 2.46.6, and the correction maths is byte-identical
to 2.43** — `git show fc839f2:src/pipeline.ts` and the promoted copy agree on
every line of the lens stage, and the only change to `lensstore.ts` in those 52
commits was extracting an FNV-1a hash that returns the same string. So this is
not from the promote; production simply jumped 52 commits and is showing work
that had been on staging for weeks.

**WHAT A BLUE CIRCLE IS, in this app's own numbers.** `lensGain(k, s)` is
`1 / (1 + (k - 1) * s)`, clamped to 0.5..2. An IR hot-spot is red-strong at the
centre, so a measurement has `kr > 1` and `kb < 1` there, and the correction
pulls red DOWN and pushes blue UP. The pipeline documents the honest range of a
measured bin as **0.772..1.460**, across all 160 profiles that exist. Run through
`lensGain` at the strengths the slider offers:

- strength 1.0, a strong but entirely valid measurement — red 0.685x, blue
  1.295x, **blue over red 1.89x**
- strength 1.5, the slider's maximum — red 0.592x, blue 1.520x, **2.57x**
- strength 0.5 — red 0.813x, blue 1.129x, 1.39x
- a bin outside the honest range — red 0.500x, blue 2.000x, 4.00x, both clamped

**So a blue disc is reachable from correct data at full strength.** It does not
require a corrupt profile, and the number tells the two apart: a clamped gain
means the measurement is out of range, an unclamped 1.9x means the correction is
doing exactly what it was asked to.

**THE APP COULD NOT SAY ANY OF THIS, which is the actual defect here.** The §7f
report had no lens section at all — not which profile matched, not from where,
not what it applies — so a lens report could only be answered by asking the
reader to describe a screen, which is the one thing §7f exists to stop. It now
carries two lines: which profile supplies the colour half and which the
brightness half (they can be two DIFFERENT profiles — the reader's measurement
supplies colour and a shipped profile the brightness), and the gains that
actually land at r = 0, read through the same `lensGain` the pipeline uses so it
reports what LANDS rather than what was stored, with strength, bypass and the
clamp included. The ratio is named rather than left bare, because a report that
makes the reader judge whether 1.9 is a lot has not reported.

**AND THE LENS PATH CANNOT BE EXERCISED WITH THE SHIPPED PRACTICE FILES.** All 44
practice DNGs return `null` from `readExifSubset`, so no profile can ever match
one: every local run of the correction is the no-profile path. That is why this
had to be reasoned from the arithmetic and then built into the app rather than
reproduced here, and it is a standing gap — the one stage of the pipeline with no
local fixture at all.

**Found on the way, and fixed:** `switch-instrument-walk.mjs` check 8 compared
five whole-millisecond parts against their rounded total with a 5% tolerance.
Five roundings can differ by 5 ms whatever the instrument does, and on a 67 ms
total that IS 7.5% — it failed at 4.5% and passed on re-run. Measured over four
runs the real spread is 1.8-2.1%, so the proportional part stays at 5% and an
absolute floor of 6 ms (five roundings plus one) covers the small-total case. A
planted 40 ms disagreement is still refused.

## A verdict pressed as the tab goes away, 2026-09-14

**FIXED.** `Session.setMark` opens a database, reads a row and puts it back under
strict durability — tens of milliseconds at best — while a verdict is one
keypress. The mark lost was always the LAST one pressed; the ones before it had
time to land.

**Not a contrived race on the device this is built for.** iPadOS discards
background tabs and reloads them by itself, so "the page came back a moment after
I pressed X" is what a long culling session looks like. The whole point of a
verdict is that it is a decision rather than a highlight.

The intent is now recorded SYNCHRONOUSLY, in `localStorage`, before the durable
write is started: by the time the press returns, the mark exists somewhere no
reload can beat. The durable row is still the real home — the mirror only has to
survive the gap. `listPhotos` applies anything left over and re-issues the write,
so a mark that died in the gap comes back on resume and then lands properly, and
it is done THERE rather than in a separate call because it is the one function
every path that rebuilds a session already goes through. `forgetSession` clears
the mirror, or a pending verdict outlives the session it belonged to.

Two details that are not decoration. A cleared verdict is stored as `null`, which
is a different thing from no entry — U followed by a discard has to clear the
stored mark, not leave it. And the entry is dropped on completion only if it is
still the same answer, because a second press while the first was in flight
leaves a NEWER intent there and clearing it would throw the reader's last press
away.

**THE FIRST VERSION OF THE WALK PASSED AGAINST THE DEFECT, and that is the part
worth keeping.** It issued the press and `location.reload()` from inside the page
in one task, which sounds tight and is not: reload only QUEUES a navigation, the
document keeps running, and the write commits before unload. With the
synchronous mirror REMOVED it reported four of four green — a negative control
coming back clean, which means the instrument was measuring nothing.
`tools/verdict-durability-walk.mjs` closes the page instead, destroying the
renderer with the write in flight, which is what a discarded tab actually does.
Against the unfixed write path checks 3 and 4 fail and 1 and 2 pass, and those
two passing are the controls: they prove the walk reached the state and that
earlier marks really do survive.

**And this was the intermittent check.** The scratchpad `verdicts.mjs` check 10
reloads right after its final press, failed now and then for weeks, and was
written off as flaky. It was not flaky. It was the product, and the
intermittency was how close the race ran.

## The accessibility sweep is in the repository, and its list refuses now, 2026-09-14

**IT WAS THE ONE THE RECORDS NAMED.** The sweep was rebuilt in the session
scratchpad before each release, its result written into these notes, and nothing
in the repository held it — so a session that did not know it existed shipped
without it, and a container going away took it with it. Both this file and the
live status page carried that as an open debt for weeks. It is
`tools/a11y-walk.mjs` now, beside the two walks that moved for the same reason.

**THIS PARAGRAPH SAID "THE LAST INSTRUMENT THAT WAS NOT", AND THAT WAS WRONG** —
written into the commit message too, where it cannot be corrected. Counted after
the fact: `journey`, `rotation`, `release`, `verdicts`, `collect`, `export-ui`,
`export-report`, `switch-instrument`, `export-bytes` and nine feature-specific
a11y probes are all still scratchpad-only, including `export-bytes`, which is
the gate holding the output byte-identical, and `a11y-verdicts`, which encodes
hub §293. **Four walks are in the repository and roughly eighteen are not.** The
a11y sweep was the one the RECORDS named as owed, which is a different claim and
the only one that was true.

**MOVING THE FILE WAS THE SMALL HALF.** The scratchpad version carried this, in
its own words, above a hardcoded list:

    A NEW SURFACE JOINS THIS LIST IN THE SAME COMMIT THAT CREATES IT, or it
    ships unmeasured — which is how .ql-btn stayed 34px for as long as it did.

True, and it refused nothing. Measured on the run that replaced it: **ir.html
declares fifteen dialogs and the sweep opened three**; the axe pass ran on
`ir.html` alone while **seven pages deploy**. The instruction had been read and
obeyed by whoever wrote it and by nobody since, which is the whole of this
family's escalation argument — `branch-guard` and `plan-guard` are the same
shape.

`tools/surfaces.mjs` is the one enumeration and it is an ASSERTION, checked
**both ways against the BUILD** rather than against the source tree, because
`notes.html` does not exist as a file — vite generates it at build time, so a
list built from the repository would be missing a page that ships. A page or
dialog that deploys undeclared fails; a declaration that no longer deploys fails
too, because a removed surface leaves its entry behind and the next reader
trusts it. Four plants, each made to fail before the list was trusted: a dropped
dialog, a page that no longer exists, a page removed from the list, a dialog
listed that is not in the markup. `class-width-walk.mjs` imports the same list —
it had four page names hardcoded while seven deploy, so three pages were never
walked and nothing said so.

**WHAT THE FIRST FULL RUN FOUND, and the comment that had already excused it.**
`style.css` carried, above a rule scoped to one dialog:

    ...every other dialog's buttons are a measured, shipped surface and are not
    being churned from this change.

They were not measured. With the whole list in hand the sweep found **six
buttons at 35px on two decision dialogs** — `#locDlg`'s four, which ask a reader
to choose what happens to the location written into their photograph, and
`#askDlg`'s two. On a tablet, by finger, against a 44px floor. The rule is
generic now (`dialog button { min-height: 44px }`), which `min-height` makes
safe: it only ever raises, so it reaches exactly the controls that were short
and leaves every one already clearing the floor alone. Negative control: put the
floor back to 34 and the sweep reports six failures across three dialogs and two
widths; restore it and all pass.

**Two of the first run's ten findings were the instrument, and both corrections
are the standard rather than a way past it.**

- **Inline in a sentence is exempt.** SC 2.5.8 excepts a target "in a sentence,
  or whose size is otherwise constrained by the line-height of non-target
  text" — enlarging a link in the middle of a paragraph breaks the paragraph.
  The sweep matched every `a[href]` including prose links. Tested structurally
  rather than by tag, because this app has a `<button>` styled as a link
  mid-sentence (`#bcQuick`) and it is the same case: laid out inline, and
  sharing its parent with real text. **Five elements are exempt across all seven
  pages and every one prints on every run** — an exemption nobody sees is the
  difference between "the sweep found nothing" and "the sweep looked at
  nothing", and only the printed list tells them apart.
- **A button labelled at open time is empty when opened cold**, and an empty
  button measures its padding. `#askDlg`'s two came back 41x19 that way and read
  as a finding. The walk seeds them with **"OK"**, which is the shortest label
  `askDialog` is actually called with, so the measurement is the tightest real
  case rather than a flattering one — and it says on every run which buttons it
  seeded. With the real label they measure 77x35, which is how the genuine
  height shortfall surfaced.

**Found, not fixed, and it may matter more than it looks.** The scratchpad
`verdicts.mjs` check 10 is intermittent, and this run showed the mechanism: the
mark lost is always the one set immediately before the reload (`-,-,Pick,-`
against `-,Reject,Pick,-` — the Pick, set earlier, survives). `Session.setMark`
is a durable write and the reload can beat it. It reproduces on the pre-change
build, so it is not from this work. **The reason to look at it: iPadOS discards
background tabs and reloads them**, so "pressed X and the page reloaded in the
same instant" is not a contrived sequence on the target device — it is what a
long culling session looks like. Fixing it is a design decision (block, or
write on `pagehide`), not a tail-end patch.

## The patch notes labelled three releases with a commit count, 2026-09-14

**FOUND BY VERIFYING A DEPLOY, not by looking for it.** Comparing the bundle the
runner built against the one built here, to prove the deployed code was the code
that had been walked, they differed — same length, sixteen bytes apart, all of
them inside the patch-notes version strings: `version:"0.540"` on the runner
against `version:"0.257"` here, for the same release.

**Neither was right.** `versionFor` in `vite.config.ts` read the VERSION base and
the commit that declared it ONCE, at HEAD, and passed both in for every entry.
For a commit older than the last bump, `git rev-list --count baseCommit..hash` is
0 — an ancestor has nothing after it — so `since > 0` was false, nothing threw,
and it fell through to the pre-VERSION `0.N` scheme, which is a count of
reachable commits. Three of the five releases the app shows read `v0.257`. It is
not a version, and it is not stable either: this container's clone is shallow at
259 commits and the runner's is full at 540, so the same release was labelled two
different ways by the same source.

They shipped as **2.45, 2.45.1, 2.45.2 and 2.45.3**, which is what the ⓘ panel
and `notes.html` say now. The fix resolves the base AS OF each commit —
`git show <hash>:VERSION` and `git log -1 --format=%H <hash> -- VERSION` — and
treats a count of zero as "this commit is the declaration" rather than as a
failure. HEAD keeps passing the working tree's VERSION in, because a release
commit's own build must read the bump it is making.

**The shape worth keeping.** A fallback reached by a FALSE CONDITION rather than
by an exception is silent by construction: the `catch` beside it says what the
fallback is for, and the path that actually reached it never went near the catch.
And a number derived from `rev-list --count` is a fact about a clone, not about a
release — it cannot be a version unless every clone that builds is full.

**AND THE BUILD IS REPRODUCIBLE NOW, WHICH IT WAS NOT.** Fetching the deployed
bundle and comparing it with a local build of the same commit now comes back
byte-for-byte identical — the same content hash in the filename, the same bytes
apart from the sourcemap name — from a 259-commit shallow clone against a
540-commit full one. Before the fix the two could not agree, because the version
strings baked into the patch notes counted whatever history the clone had. That
comparison is worth running on any release: a green deploy row says the job
exited zero, and this says the thing that shipped is the thing that was walked.

**One instrument error on the way, and it is the standing one.** The first
comparison came back differing at byte 48 and it was tempting to read that as a
build that was not reproducible after all. The deployed site had moved on by one
commit between the fetch and the build — the app's own version line said 2.46.3
while the local build was 5aa019e at 2.46.2 — so two different commits were being
compared, and the difference was the shared chunk's content hash in an import.
When a result looks absurd, suspect the instrument: here it was comparing against
whatever the edge happened to be serving rather than against a named commit.

## A tile is a claim, 2026-09-14

The strip and the quick look grid ARE the conveyor: the reader decides from the
tiles and never opens most of the set. So a tile is a claim — this is what
opening this photograph will show you — and the app already had the machinery to
keep it true: a `thumbGrade` stamped onto every tile, a `stampFor` that says what
the tile should be a picture of, and `restripForGrade` to mark the ones that have
stopped matching. Four things got past all of it. None of them is a function
doing something other than what it says; each is a function whose statement is
only true under a condition no single file states.

**A kept preview came back under the grade it was made under.** `previewKey` had
the file's identity, the build's pipeline, the preview size and the reader's lens
profiles in it, under a header in `src/previewcache.ts` listing "what makes a
cached picture wrong, and every one of these is in the key". The grade was not in
it, and a grid tile is rendered under the live look, swap, bias and lift —
`makeThumb` with no own edit clones exactly that state. Scan a folder under
Aerochrome, press B&W IR, scan the same folder: every tile came back Aerochrome,
and the app said so in its own words, "3 of 3 came back from this device — no
decoding needed". The fix is the grade in the key, fingerprinted through the one
FNV-1a in the new `src/stamp.ts` — which `profilesStamp` had written inline and
now calls, because the second copy is where two answers come from.
`PREVIEW_PIPELINE` moved 2 to 3: nothing in the old rows says what grade they are
pictures of, so they must not be reachable, not merely missed.

**And the strip-sized twin in the same row made it worse.** That twin is what
"Keep in a session" hands across, and the session then stamped it with the
CURRENT grade under a comment reading "the grid rendered this one under the live
grade" — true of a fresh render, false of a cache hit. A stale picture marked
true is worse than a stale picture: `restripForGrade` only ever redraws a tile
whose stamp has stopped matching, so that one could never be found again.

**Opening a photograph flattened its tile.** In `makeThumb` the object literal
set `tone`, `sky` and `foliage` to identity unconditionally, overriding the
spread of the photo's own params, and the re-solve below it was gated on `!own`.
So a photo that had never been opened got the lift solved for it, and a photo
that HAD been opened — carrying its own solved curve — had it thrown away with
nothing to put it back. Restore depth is on by default, so that was every opened
photo. The clearing was collateral from an earlier fix whose target was the other
branch (a tile inheriting ANOTHER frame's correction); for a photo's own edit the
values were never another frame's. Measured: 23.53 of 255 mean channel difference
between the same photograph's tile opened and not opened under one look, against
2.08 with the curve kept, which is the JPEG encoder and the 32px resample.

**Restore depth never redrew the strip.** Its strength slider called
`restripForGrade` ("the tiles are claims about this too"); the on/off toggle
beside it did not, so the strip went on showing the other state for the rest of
the session. And `stampFor` could not have expressed the right answer anyway: it
put the lift's session controls into EVERY tile's stamp, so a toggle would have
marked the whole strip stale including photos it cannot touch. The two cases are
rendered from different things and are now stamped differently — a tile with no
own edit is drawn through the session controls, so they belong in its stamp; a
tile with one is drawn from that photo's own stored curve, so the three fields
the lift writes belong in its stamp instead.

**Those three fields go in `stampFor` and never in `stampOf`, and this is the
trap.** `stampOf` is shared with the look-mark question, and `markLook` takes its
stamp AFTER `applyLook` has run the lift — so a lift curve inside `stampOf` would
make `looksUntouched` false on arrival at every other frame, silently stopping
`carryLook` from carrying the session look. That is the standing default look,
and it would have broken with nothing failing.

**The open photograph's own tile was the one a look could not reach.** `ownEdit`
answered with the `liveEdits` snapshot, which is SEEDED on arrival by
`activateCurrent` and rewritten only on the way out by `captureActiveEdit`.
Nothing refreshes it while the reader works — `flushRecord` moves the undo stack,
not this — so for the photo actually open it was the state they came in on. Its
stamp therefore never moved, `restripForGrade` never marked it stale, and the one
tile a reader checks a look against first was the one tile that never followed.
`ownEdit` now answers `snapshot()` for the active photo.

**Why they shipped together.** Fixing the toggle alone would have made the
flattening universal: before this, opening a photo did not change its stamp (a
first visit lands on the same creative state the tile already showed, which is
deliberate), so nothing redrew the tile and the defect stayed latent until
something else forced a render. The toggle is exactly that something else.

**`tools/tile-truth-walk.mjs`** is the instrument, committed rather than left in
the scratchpad for the reason `class-width-walk.mjs` gives in its own header.
Reading the source cannot answer any of these: telling a cache hit from a fresh
render, or a redrawn tile from an untouched one, takes rendering both and
measuring. It reads every tile three ways — the blob URL (was it redrawn at all),
a hash of the stored JPEG bytes, and a 32x32 RGB signature so two pictures can be
compared when the encoder is not byte-deterministic. **Eight of its checks went
red against the tree as it was and all are green after it**; five pass on BOTH
builds on purpose and are the controls, because a build that never caches or
never redraws would otherwise read as a clean sheet.

**Three things the first version of that walk got wrong, each of which looked
like a finding.** Waiting for the grid's CELL count let it read tiles that had no
picture yet, which came back as NaN differences and one accidental hash match.
Its check on opening a photo used a no-op restripe as the trigger and measured
0.00 against a build with the defect in it — a check that cannot fail is not a
check; it takes two sessions of the same files, one where the photo is opened
first and one where it never is. And it asserted that every tile follows a look,
which is not true and should not be: a photo graded and left is not what a look
pressed on a different frame is about, and the two that stayed put were right.

**Observed, not fixed.** The scratchpad `verdicts.mjs` check 10 ("both verdicts
come back after a reload") is intermittent — it failed once and passed once
against this build, and failed against the pre-change build too, so it is not
from this work. Check 15 does the same reload and does not flake. It reads the
marks as soon as `#busy` closes; naming the cause would be a guess, and the
measurement is that it reproduces on both builds.

## The colour gate this repo never ran, and the four things it found, 2026-09-14

`gates.yml` had passed no `palette-path` for the life of the file, under a
comment calling it a real gap. So `palette-check.mjs` — the hub gate that holds
a palette to the contrast floors in `PALETTES.md` — was skipped on every CI run,
and the contrast numbers in `ACCESSIBILITY.md` were held by nothing but the hand
that took them.

**The spec is generated, not written.** `tools/palette-spec.mjs` applies each of
the eight family x theme combinations to a real document and reads the tokens
RESOLVED, so an `rgba()` rail or a token defined through another token comes out
as the value a browser computes rather than as the text in the file. Writing the
JSON by hand would have made it a second copy of `public/palette.css`, and this
repo's history is mostly about second copies. It is committed because CI has no
browser — an artefact, like the branch guard's hook.

**All eight palettes clear every hard floor**, and seventeen notes remain: role
pairings the gate forecasts and this app does not paint.

### `_renders`, and why a short list is worse than no list

The gate measures the FULL cross product of text roles against every fill tinted
with the accent wash, which is what makes a palette portable. Against this app
that produced seventeen hard failures, and the wash would have to drop from 15%
alpha to **2.9%** to clear them — the deletion of a visible selected state, not a
fix.

`_renders` is the hub's own answer: a pairing the app was OBSERVED to paint stays
a hard failure, one it does not paint becomes a note. Its instruction is exact —
the list must be MEASURED, never typed.

It was measured, and it was short three separate ways, each of which turns a
defect into a forecast:

- it swept the state the app boots into, so nine wash-painting elements measured
  0x0 because the editor had no photo open;
- then requiring visibility was itself wrong — measured on all eight hidden
  elements, the ground each reverse-maps to while hidden is the SAME one it maps
  to forced visible, so `display` was never part of the answer;
- and the landing page's ground is a `radial-gradient(var(--bg-2), var(--bg))`,
  so a walk looking for an opaque `backgroundColor` reached `<html>` and dropped
  five more. The honest answer is BOTH stops.

Two pairings became seven. What found it was instrumenting the DROPS — the same
sweep re-run printing every discarded element with a reason — not reading the
results, which were correct as far as they went. The generator now aborts and
names the element on any text colour that maps to no token and any ground that
maps to no role or gradient stop, and prints the off-role accent-on-wash cases as
*skipped, not dropped*.

**Two checks hold the artefact to the app.** `tools/palette-spec-check.mjs` pins
it to the sha256 of `public/palette.css` and runs in `.branch-guard`'s `also=`
with no browser; it cannot see `_renders`, which is measured from the whole app,
so section 4 of `tools/a11y-walk.mjs` re-measures that list and fails in both
directions. The sweep is IMPORTED by the walk from the generator rather than
reimplemented — two implementations of one measurement is how a check comes to
agree with itself and nothing else. Both were planted red first.

### What it found

Four defects, all recorded as F-07 to F-10 in `ACCESSIBILITY.md` with their
numbers. In short:

- **The crop bar was half a glass HUD.** It floats over the photo and took its
  fill from `--accent-soft`, which follows the theme, while every chip inside it
  painted the theme-invariant `--glass-txt`. Night: 14.16:1, looked designed.
  Day: **1.56:1** — the ratio chips, Reset and the straighten nudges gone. It is
  `--glass-bg` now, like `#zoomCtl`, and measures 5.67:1 over the worst frame.
- **Control rails on glass at 1.44:1.** `rgba(255,255,255,0.35)` on the chips and
  `rgba(150,150,170,0.35)` on the zoom buttons, both under the 3:1 an edge has to
  clear. Both take `var(--glass-txt-2)` now — 3.85:1, and a calibrated token
  rather than a one-off alpha.
- **Accent labels on the accent wash.** A wash made FROM the accent moves the
  ground toward the accent, so the more visible the state the worse the text.
  Under 4.5 in six of twenty-four ground x palette pairs; the label is `--txt`
  now, which clears everywhere at worst 6.33.
- **`var(--txt-1)` in three places, defined nowhere.** CSS does not warn — the
  declaration is dropped and an inherited property inherits, so it rendered a
  plausible colour and every DOM-reading sweep agreed with it.
  `tools/token-check.mjs` refuses that commit now.

### The one to carry to the next UI change

Writing the button treatment as `#cropTools button` — one id, one element —
outranks `#cropDone` and `.ratio-chip[aria-pressed="true"]` on id specificity
alone, and silently deleted the accent fill from the two controls in that bar
whose entire job is to look filled. It built cleanly. The two `:not()`s in the
shipped rule are load-bearing, not tidiness.

And the first re-measurement after the glass fix came back at 1.56:1 unchanged,
which reads as "the fix did not work". It was the probe: its ancestor walk looked
for an opaque background and stepped straight PAST `#cropTools` once the fill
became `rgba` glass. A translucent ancestor is part of the answer. The instrument
had been correct until the code it measured changed shape underneath it.

## A tolerance chasing a defect in the instrument, twice, 2026-09-14

`switch-instrument-walk` check 8 asserted that showing's five named parts add up
to `showing`. **They could not.** `show` is measured as `t3 - t2` across the
whole of `showDecoded`, while the five phase clocks (`__a`…`__f`) cover only its
middle: the location guard, the canvas `aria-label` and the tool disarm run
before the first clock starts, and unhiding the panel, leaving learn mode and
rebuilding the zoom control run after the last one stops. That head and tail is
real work belonging to no phase.

It passed on an idle machine because both are fast, and went red whenever the
container was loaded — **which produced exactly the wrong repair each time.**
First the tolerance went to 5%. Then a 4.5% failure re-ran green, and an
absolute 6 ms floor was added under a comment reasoning about five
whole-millisecond ROUNDINGS. Rounding was never the mechanism, so the floor was
fitted to a story rather than derived from the variable that actually moved: the
very next full sweep failed on the same check, and a standalone re-run passed at
0 ms, 0 ms and 1 ms. That is what a tolerance covering the wrong variable always
does — it is wide enough on an idle box and it explains nothing.

**Fixed in the instrument, not the threshold.** `showDecoded` takes a timestamp
as its first statement and another as its last, and reports `rest` — the head
plus the tail — as a sixth phase, so the parts partition the whole by
construction. The tolerance is a flat 6 ms (six whole-millisecond roundings) and
is no longer a fraction of anything. Verified with four cores deliberately
loaded: 0 ms, 1 ms, 1 ms.

The §7f diagnostic shows `rest` beside the other five, so the accounting the
walk checks is the accounting a reader can see.

**And the sweep now prints the numbers.** `walk-all.mjs` printed only the lines
matching FAIL, and a walk prints its MEASUREMENT on the line *before* its
verdict — so a failure gave the name of the check and not one number from it,
and the only way to learn anything was to run the walk again, by which time the
load that produced the failure was gone. Three lines of context is the
difference between a report and a prompt to re-run.

## The strip kept saying a photo was still held after it was let go, 2026-09-14

**This section replaces a wrong diagnosis written earlier the same day, and the
wrong one is kept here because the mistake is the useful part.**

`release-walk` check 1b — *the tile of the photo you left says it reopens from
the saved copy* — passed standalone and went red in the sweep. The first reading
was "a check reading state written by a promise nothing waits for", and the fix
was to make the walk WAIT up to fifteen seconds for the title to change. It
passed. In the next full sweep it failed again, having burned the whole timeout
first — a fast failure turned into a slow one, same verdict.

**The title was not late. It was never going to arrive.** Leaving a decided
photo releases its working state in `saved.then(...)`, and the tile's title is
built from `liveEdits.has(p.id)` at render time — and nothing redrew the strip
after the release. On an idle machine some unrelated repaint usually comes
along within a frame or two, which is why it looked correct for the life of the
feature. Under load nothing came at all.

**Waiting cannot produce a repaint that nothing schedules.** That is the whole
lesson, and it generalises: a check that has to wait for a repaint is usually
telling you the repaint is missing.

Fixed in the app — `updateSessionStrip()` inside the `then`, at the moment the
answer changes — and the wait came back out of the walk.

**And the walk needed one more correction to be able to see it at all.** With
the wait removed it still passed against the unfixed app, because `heldCount`
opens and closes the version dialog first, and that round trip is a repaint plus
the better part of a second — long enough to correct a stale strip before the
check meant to catch it looks. The tile is read FIRST now, which is also what
the reader sees: the strip the moment they land on the next photo. Read in that
order the walk fails on the unfixed build and passes on the fixed one, on an
idle machine, with no load required.

## The crop bar had never been measured, 2026-09-14

Section 2 of the accessibility walk measures hit areas on every page and inside
every dialog. `#cropTools` is neither — it is a MODE, and it only exists once
you enter crop or straighten. So a whole panel of controls, on the surface this
app is most used by finger, had never been in the sweep.

Pointed at it for the first time: **Reset and Done were 28px tall**, and the
ratio chips measured **43px reachable** against a 44 floor.

**What made it invisible is that everything around them was correct.** The
chips buy their target with a `::before` extension; the straighten nudges
declare `min-height: 44px` outright. Nothing about the bar looked unconsidered,
so nobody read the two buttons that had only their padding.

The chips' 43 is worth its own sentence. The design is 32px plus a ±6
extension, which is exactly 44 — and the walk measures REACHABLE area by hit
testing outward from the element's edges, where the two probes either side do
not both reach the extension's outermost pixel. **An exact-44 design has no
margin and loses one to rounding.** Raising the extension would have overlapped
the neighbouring chip (the row-gap is 10, and the comment on `#cropRatios`
already says the ±6 barely clear each other), so the chip goes to 34 instead:
46 reachable, extensions untouched.

Reset and Done take `min-height: 44px` through
`#cropTools button:not(.ratio-chip)` — the bar steps the view back by its
MEASURED height in both width bands, so a taller pill cannot bury the handles.

**And the walk enters both geometry modes now**, which is the part that matters
more than either fix. Same shape as the palette sweep that only visited the
state the app boots into: a sweep reports on the states it visited, and nothing
says which ones those were.

One more dead declaration came out of reading that rule: `#cropDone` carried
`padding: 7px 18px`, and `#cropTools button` — one id, one element — outranks a
bare `#cropDone`, so it had never once applied. Removed rather than
re-specified; `6px 12px` is what the button has always been.

## Six infrared JPEGs, a look, and no explanation, 2026-09-14

**Reported as:** a six-photo set on staging, the NEF rendering correctly and
every JPEG flat purple with Aerochrome lit — *the problem is fixed with that
image now, but nothing else works.*

**It is not a rendering defect and it is not a regression.** A camera-rendered
infrared JPEG can arrive with all its colour in ONE band, and `applyLook`
already measures that (`coolContent < COOL_BAND_FLOOR`) and deliberately does
NOT gray-world balance such a file — balancing manufactures a second band, takes
the rendered median from 0.44 to 0.076 and crushes 13% of the frame to black.
That decision is calibrated, documented, and correct. **What the reader got was
the decision without the sentence that explains it.**

`#lookState` carries that sentence, and it was gated on `oneBandFlag &&
oneBandFor === current` — a flag written only inside `applyLook`. `applyLook`
runs on a FIRST visit to a photo and never again: returning to one goes
`activateCurrent` → `restoreLiveEdit` → `applySnapshot`, which restores every
parameter and does not re-press the look. So the flag still described whichever
photo last had a look applied, the identity check failed, and the line was
hidden on every return visit.

A flat purple frame with the look lit and nothing saying why reads as the app
having broken. **A picture that needs an explanation and does not carry one is
the same defect as a wrong picture** — it only costs the reader longer to find
out.

**Fixed by asking the photograph instead of remembering the answer.**
`fileIsOneBand(img)` measures `coolContent` from `origParams` — the as-imported
baseline, restored on every switch — so first visit and return ask the identical
question, cached against BOTH the image and that baseline object. The failure
being replaced was a cache with no key. The two dead globals went with it.

**Measured on three builds with `tools/oneband-walk.mjs`:** production 2.46.6
fails, the 2.46.16 that was on the device fails identically, the fix passes. So
this is not a regression from the colour work — it is what a return visit has
always done.

**The fixtures are made, not found, and the walk says so.** The practice raws
here carry no embedded preview and the reported frames were not reachable, so
each fixture is a JPEG of a practice raw's BARE DECODE — what Hold: Untouched
shows, which is the same red-flooded unbalanced state a camera writes for
infrared. Check 0 is a control asserting the fixture really is one-band: the
interesting check passes vacuously on a two-band file, and the first fixture
tried was exactly that and said so on the first run.

**STILL OPEN, and it is a decision rather than a defect.** The app's choice is
*skip the balance and explain*. The alternative is *balance anyway and show a
crushed frame*. The code's own comment is right that neither is Aerochrome and
that one of them is honest — but the honest one still hands back a purple
picture. A third option exists and is not built: offer the balance as a press
("Balance it anyway") beside the sentence, so the reader sees both and picks.

## The one-band decision goes back to the reader, 2026-09-14

**Asked: didn't they used to work?** They did something different, and the
answer is in the history rather than in anybody's memory. Before 2026-09-11
every camera-rendered file was gray-world balanced under a colour look, with no
exception. `1f29118` added one: a file whose cool band measures under
`COOL_BAND_FLOOR` is left unbalanced, keeping the camera's own colour.

**That was a taste call made by a session, on one photograph.** The commit's
evidence is crushed shadows falling from 13% to 3% on that frame, plus fifteen
two-band frames confirmed unchanged. One file decided a policy. At least six
real frames hit it, and the standing taste on record is maximum saturation,
gentle contrast, shadows alive — which is the side of that trade the policy gave
away.

**So it is a control now, not a policy.** `params.forceBalance` re-runs the
active look with the exception suppressed, so the balance and the exposure that
goes with it are re-derived for that photograph rather than patched on. It lands
on the white balance and exposure sliders like every automatic here, is one undo
step, and is per-shot corrective so it does not ride a SavedLook — the same call
white balance gets.

**Measured on the fixtures, and the numbers do not support the original policy
as a general rule.** On the frame the walk uses: unbalanced rgb(66,107,178),
balanced rgb(131,99,93) — a completely different picture — and **0.0% crushed
either way**. The 13% that justified the exception was one photograph's number,
not the shape of the problem. A rendering that costs nothing in shadows on this
frame was being withheld because it cost 13% on another.

**Five places or undo silently breaks, and the compiler found four more.**
`cloneParams`, `applySnapshot`, the three params literals, `makeThumb` — and
then `tsc` refused four EditParams literals in `debug.ts` that no checklist
mentions. Making the field REQUIRED rather than optional is what turned that
from a silent drop into four compile errors.

The Help line describing the balance-on-look behaviour said something that now
has an exception and a control, so it was corrected in the same commit.

## The file picker wedged the whole app, and nothing in it could tell, 2026-09-14

**Reported on production v2.46.6, installed to the home screen:** batch process
→ the Files window → Search → a letter typed → the scope selector appears → the
window closes by itself. **After that no file could be opened from any entry
point** until the app was force-quit.

**What the code was.** Ten `<input type="file">` elements, every one long-lived
and reused; five driven with `.click()`, five inside a `<label>` the reader taps.
**Not one `cancel` handler on any of them** — the only
`addEventListener("cancel", …)` in the app was on the busy dialog. So a picker
that closed with nothing was an event this app never received: it was not told,
learned nothing, and presented the same element next time.

On iOS in a standalone app, a document picker dismissed through that path can
leave WebKit believing one is still presented for the element it was opened
from, and every later click on that element is ignored in silence. The element
is dead for the life of the page.

**Never reuse an input.** The element is replaced with a fresh clone immediately
before the picker opens. The five clicked in code go through `openPicker(id)`;
the five inside a label are swapped by a CAPTURING `pointerdown` listener, which
lands before the label forwards its activation, with the clone staying inside
the same label so the forwarding still finds it. Turning those five into buttons
would have moved real controls for a reason the reader cannot see.

The handler lives in a registry against the ID rather than on the element,
because the element is now disposable — that is the whole point, and a `const`
holding one is the bug. Seven module-level `const`s pointing at inputs were
deleted; `tsc` found them.

**A way out that is not force-quit.** Two opens with neither `change` nor
`cancel` is the signature, and the app offers a reload — the same reset without
leaving the app. A reader should never have to invent force-quit.

**And a counter in the §7f report**, because this cannot be reproduced here:
pickers opened against pickers that came back. A second occurrence arrives as
evidence rather than as a description of a screen.

### What is verified and what is not

`tools/picker-walk.mjs` proves all eight in-app paths replace their element,
that a deliberately wedged one is not the element the next attempt uses, that a
picked file still reaches the app, and that the counter reaches the report. **Ten
of its checks fail on the build before this and none after.**

**It cannot prove the stuck picker clears on the device.** Every measurement in
this repository is Chromium and this is a WebKit presentation bug in standalone
mode. Recreating the element is the standard remedy; it is not verified until it
is verified there.

### Two instrument errors on the way, both caught by a control

**A dead module reads as eleven unrelated defects.** `const pickerHandlers` sat
with its helpers two thousand lines below the earliest `registerPicker` call at
3580. Functions hoist; `const` does not. The bundle threw at boot and every
check in the walk failed at once — including opening a photo, which has nothing
to do with pickers. The walk reports page errors as check 0 now, so one dead
module reads as one failure.

**`cloneNode` copies attributes, so a `data-` stamp rides onto the clone.** The
walk marked each input with `data-stamp` and then asked whether the stamp
survived — it always did, and the walk reported REUSED eight times about code
that was working. An expando property is not cloned. The failing check was
right that something was wrong and wrong about what: the instrument.

## Macro Studio — not right yet

The list the app shows behind its build stamp. §7d asks patch notes to carry
what is STILL BROKEN, not only what changed, and this app had no such surface at
all. Every line here is a limitation the app already states somewhere in its own
help — this makes it one list, in the place a reader looks when something seems
wrong, from one source.

Checkbox bullets, parsed at build time by `checklist()` in vite.config.ts, same
as the editor's roadmap. Tick one when it stops being true.

- [ ] **JPEG and PNG only** — a focus-shift burst shot as raw has to be exported
  to JPEG first. The stacker never sees the raw data.
- [ ] **Nothing is kept** — there is no session to come back to. Close the tab or
  press New set and the frames are gone; the saved image is the only thing that
  survives, so save before leaving.
- [ ] **The screen shows a preview, not the file** — the stack on screen is built
  at a reduced size so it lands in seconds. Export full-res renders it again at
  the frames' own size and takes about a minute.
- [ ] **No alignment control** — frames are aligned automatically or not at all.
  A burst that drifted too far cannot be nudged by hand.
- [ ] **No practice set of its own** — the editor ships 44 practice photographs
  to learn on; this app's Try a practice set fetches one small burst, and there
  is nothing to try a second technique against.

## Macro Studio gets the baseline it never had, 2026-09-15

**This repository has two apps and the standing baseline is per APP.** §7d asks
for patch notes including what is still broken; §7e for the accessibility
statement and the licence and a way to report a problem; §7f for a text
diagnostic. The editor has had all of them for releases. Macro Studio had a
version stamp — added yesterday, after shipping without one for its whole life —
and nothing behind it.

The hub's per-app list is explicit that it has been wrong in both directions and
that a session should **check the repo rather than the line**. Checked: every
one of those was missing here, measured by opening the app rather than by
reading a file.

**`src/verdlg.ts` + `src/verdlg.css`** — a shared "This build" panel, opened
from the stamp:

- **what changed**, from `__CHANGELOG__`, which vite already generates from the
  git log and the editor already renders. One source, two readers, rather than a
  second list that can disagree with the first.
- **what is not right yet**, from a `## Macro Studio — not right yet` section in
  this file, parsed by the same `checklist()` the roadmap uses. §7d asks for
  this and it is the half that gets dropped: a release note listing only
  improvements reads as a claim that everything else works.
- **the §7f report**, and a link to the test page.

The Help panel gained the accessibility statement, the licence, and a
"Something's wrong — the report to send" button.

**NOT adopted by the editor**, and the module says so in its own header. `ir.html`
carries its own `#verDlg` markup and wiring with a Lens button this has no notion
of; folding that in belongs in the next change that opens it, not in a release
fixing something else.

### Four defects, all found by gates, all introduced by this change

**The report named the wrong app.** `buildDiagnostic` hardcoded "Infrared
Photography Studio" — true while the editor was its only caller. Macro Studio's
first report opened by naming the other app. A report whose first line is wrong
about which app produced it is worse than no report: everything under it is then
read against the wrong one. The name is a parameter now, defaulted so the
editor's call site is unchanged.

**Two new links at 19px.** The accessibility and licence rows use `.more-row`,
styled in `style.css` — which Macro Studio does not load. **Third time in this
repository**: the build stamp and the update strip were the first two. The rule
MOVED to `verdlg.css` rather than being copied into `macro.css`, because two
stylesheets with one rule is how "which is current" acquires two answers.

**A dialog built in script was invisible to the surface gate.**
`tools/surfaces.mjs` checks declarations against the built MARKUP, and this
dialog is appended at boot, so declaring it read as an entry pointing at
nothing — the gate telling the truth about what it could see and returning the
wrong answer. It checks the built SCRIPTS for the id now when no markup has it,
which keeps both directions: a declaration must correspond to something that
deploys, and cannot be satisfied by nothing.

**And one line of the not-right-yet list was wrong when written.** It said
nothing measures this app on the device; `macro.html` has been in the a11y
walk's surface list all along. Corrected before it shipped, which is the only
reason it is a footnote rather than a finding — a list of known limitations is
read as authoritative, and an invented one is worse than a missing one.

## Shipped (roadmap archive)

- [x] **Four ways a tile lied about its photograph** — SHIPPED 2026-09-14 to
  staging, awaiting the on-device pass. Every one of them is a picture that was
  WRONG rather than code that was, which is why all four survived green gates: a
  quick look kept its rendered tiles on the device and handed them back under a
  DIFFERENT look; opening a photograph flattened its own tile; Restore depth
  changed every tile in the strip and redrew none of them; and a look pressed on
  the photograph you were looking at reached every tile except that one. Found
  by reading while shipping 2.46, all four fixed together because they compound
  — two of them stamped a stale picture as current, where nothing could ever
  find it again. See "## A tile is a claim" below.

- [x] **2.46 — acting on the photos you picked** — SHIPPED 2026-09-14 to staging,
  awaiting the on-device pass. Picking marked photos and nothing consumed the
  marks; the Export panel now says how many are picked and exports them all in one
  press, into the collection that already hands over as one file or one zip. Each
  one goes through the app's OWN open and the SAME export description the Export
  button uses — proven byte for byte, both for a photo edited by hand and for one
  picked in the quick look and never opened. Stoppable, one at a time, and it puts
  the reader back on the photo they were standing on. With it: a quarter-turn now
  survives leaving a photo and coming back, and straightening gained a tenth-of-a-
  degree button either side of the slider plus twice as many alignment lines.
- [x] **2.45 — exporting as you go, without stopping** — SHIPPED 2026-09-14 to
  staging, awaiting the on-device pass. Two parts. EXPORT STOPPED OWNING THE
  SCREEN: the same export, the same two presses, with the editor live while it
  runs — move to another photo, turn it, grade it, drag a slider, and the file
  being written is still the one the press was for, proven byte for byte against
  the old modal flow and against a plant that reads the live edit instead of the
  copy. Progress and the finished file live on a line over the photograph rather
  than inside the Export tab, because carrying on working means changing tabs. A
  failure explains itself, offers Try again and is remembered in the report. AND
  FINISHED EXPORTS COLLECT: every one is kept in its own store, survives a
  reload, and hands over in a single press — the file itself when there is one,
  a zip when there are more. Its own database, so saving a batch cannot sweep a
  morning's keepers. Still slow and said plainly: a healed, stickered or warped
  photo exports on one thread.
- [x] **2.44 — deciding in the session, and the app acting on it** — SHIPPED
  2026-09-14 to staging, awaiting the on-device pass. Three parts. A standing
  DEFAULT LOOK in Settings, so a reader who grades everything the same way stops
  pressing the same button once per folder; it seeds the session look and takes
  the path a pressed look already takes, so it lands on a visible control, costs
  no undo step and leaves Hold: Untouched showing the bare decode. PICK AND
  REJECT on the session photo — the quick look's two words and three keys, on
  the place the decision is actually made, durable in `PhotoMeta.mark`, painted
  by the strip reconcile rather than beside it, counted in the strip's own
  status line, reachable by finger through two 44px buttons that cost nothing in
  chrome (140px before, 140px after, at 430px and 900px). And a verdict now LETS
  THE APP PUT THE PHOTO DOWN: the working state of a decided photo is released
  once its saved copy is really on the disk, so walking a set deciding as you go
  holds two photos instead of all of them. Coming back rebuilds it from the
  saved copy — the picture, the look and every slider return, the undo history
  does not, and the tile says so before you press anything. A photo carrying
  brush masks, an imported LUT or a warp is kept instead, and the strip says
  which and why. Still open after this: the switch is still slow, and what to do
  about it waits on three reports from the device it is slow on.
- [x] **2.40 — the export on several cores, and a straightened export that no
  longer takes minutes** — SHIPPED 2026-09-13 (PR #99, rebase-merged on the
  owner's go). The per-pixel pass runs on up to four threads, each calling the
  same `exportImage` over a slice of the output: 46.8s to 19.7s on a
  20.9-megapixel raw, 36.9s to 15.6s on the camera JPEG of the same frame, and
  byte-for-byte identical output proven by the file's own sha256 from one thread
  and from three. A band is a rectangle cut along whichever axis the export's
  loop runs, because rows alone left every portrait frame single-threaded and the
  first measurement caught it. Memory measured at 1.88 GB on one thread against
  2.19 on three, so the thread count walks down until the estimate fits a 600 MB
  budget. Also in it: the sharpening pass fills rows where they are read (a
  straightened 1.9-megapixel crop from 207 seconds to 8.8) and stops holding a
  buffer the sampler is allowed to reuse, which had been putting a wrong pixel at
  the start of every row whenever denoise was at zero and sharpen or texture up.
  Both halves of that are §285 and §286 in the shared lessons.

- [x] **2.3 — D5300 & full-spectrum support** — SHIPPED 2026-07-25 (PR #68,
  rebase-merged; owner on-device pass on staging). Per-file NEF decode levels
  (white from the linearization curve, black from MakerNote 0x003D — D5300
  600 vs Z-series 1008), per-type auto open baseline (raw: WB/exposure/
  denoise/auto-recover; JPEG/HEIC: denoise only), the Recover-highlights
  slider (post-WB neutral pull, per-pixel, auto 0.7 on clipped raw),
  Hold: Untouched, exposure to +6 stops, pipeline-true thumbnails.
  Implementation facts a later session needs: the 2026-07-24/25 ledger above
  (three rejected highlight-repair attempts + audit), the five-places
  EditParams rule, the per-file-levels gotcha, and the two new standing rules
  in CLAUDE.md (INFRARED-first reasoning; known-things-first references).

> The completed "Next capability release" items, newest last, with their
> full SHIPPED/verification records — the project memory sessions must
> still read. Moved out of the queue section so the in-app roadmap parser
> (vite.config.ts, stops at the next `## `) no longer renders all of dev
> history to end users (share-readiness audit, 2026-07-17).

- [x] **Guide lines in Straighten & Crop** — owner ask 2026-07-15 (the owner's third
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
  are easy to miss. The owner wants them to carry the "active" blue background like
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
  mode — the owner wanted THREE separate tools, each activated on its own. The old
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
  allowed larger than / outside the photo (the owner's IMG_1007: the box's top + right run
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
  pointer), the straighten slider's range (±45°) and step (0.1°), and the owner's
  verdict on the "photo tilts, box doesn't" straighten preview versus a
  Lightroom-style tilting viewfinder box (documented above as the deliberate
  simpler choice for this release — a candidate for a follow-up if the owner wants
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
  the frame's bottom-left-most corner — until the owner SHRANK the Safari window.
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
  spacing (a hair of aliasing on extreme high-freq detail is possible — the owner's call
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
  files; the owner uploads to the chat, one or a zip at a time — full-res originals
  never enter the repo, only the binned DNGs do).
  DESIGN DECIDED (owner pick, 2026-07-14): TAG TILES FREELY — each tile
  names the lesson it opens on (`GalleryTile.lesson`), several photos may
  share a lesson, everything untagged defaults to Lesson 1. No "sets"
  machinery (the owner's own "gets complicated" caution), no one-frame-per-
  lesson constraint. Lessons stay SKILLS that work on any frame — the
  mapping only decides where a tap lands you. Sessions propose a sensible
  mapping for the owner's approval as frames arrive.
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
  the thumb look, the lesson-order grid reading, and the owner's verdict on each
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
  kept deliberately, one line to drop if the owner would rather). Verified: the
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
  re-send if the owner wants that scene. REGRESSION GOLD: the owner re-sent
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
  TUTORIAL SET vs LIBRARY (owner call 2026-07-14: cull to a tutorial set and
  keep the full set aside as an example library; the chosen set was 11
  lesson tiles plus variety extras, with an expander and group headers; cache
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
  its own, inside Help, or trimming the files from deploy entirely — THE OWNER'S
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
  2026-07-14, given WITH the main-release GO. Measured at iPad width
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
  HANDS: the corner mark's look at the owner's sizes/themes, and that the wrap
  measured at that width is gone on the real iPad.
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
  2026-07-15. Measured at iPad landscape: the welcome card ended AT
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
  Close placement), the cue's look over the owner's content, the peek on the
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
  THE OWNER'S frames (real Z50 dust — all tuning so far is synthetic motes + the
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
  (3) AUTO-DETECT picked wrong things and IGNORED THE OWNER'S OBVIOUS SPOT. The
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
  Owner is uploading THE REAL DUSTY PHOTO from that pass — tune the detector
  against it when it lands (the smudge the detector missed becomes the regression case).
  All verified headless again: full parity suite (heal still adds ZERO drift)
  + UI suite grown to 32/32 (size-preview ring appears and fades, slider
  resizes the active ring 20.5→33.8, pinch-zoom scales the ring exactly with
  the photo 33.8→101.4 at 3×, tapSuppressed still eats the post-pinch tap).
  Harness gotcha for the file: synthetic PointerEvents have no active pointer,
  so setPointerCapture throws NotFoundError — stub capture in the test page
  before dispatching a simulated pinch.
  DETECTOR REBUILT ON THE OWNER'S REAL NEF (2026-07-14, same day — the owner uploaded
  NIR_1675.NEF, the frame the reports were about; cache ips-v36 → ips-v37). Its
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
  the big smudge ringed first + a couple of faint companions), and the owner's verdict
  on aggressiveness across a real library.
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
  OWNER'S UPCOMING PLAN (2026-07-14): the owner will add RAW VERSIONS of all library
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
  on Dust & spots with chip ⑥ active. WHEN THE REST OF THE OWNER'S RAW VERSIONS
  ARRIVE: replace each scene's JPEG tile with its binned-DNG tile (one tile
  per scene — the owner explicitly rejected side-by-side duplicates). VERIFIED: decodes through the normal app
  path (1400×932 preview), no CFA-phase artifacts, the real smudge is the TOP
  find at exactly (1232,400) = the NEF coords ÷2 — binning RAISED its
  signal-to-noise — and the in-app round trip (open tile → Find spots → rings
  + review) passes headless. Use the same script for the rest of the owner's RAW
  uploads. Also remember: Z50 II High-Efficiency NEFs don't decode at all —
  the owner's Z50 classics are fine.
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
  Heal spots without help. Lesson 6 step 2 and the Help line reworded to match.
  VERIFIED headless: lesson suite grown to 21/21 (sweep → solid rings +
  review banner, heal button stays un-pressed and its banner closed, ring-tap
  drops exactly one fix, banner-tap retires rings but keeps the heals, the
  known smudge still ringed, RAW-tile round trip) + main UI suite still green
  (its sweep found 10 faint spots on a practice frame and the review path
  handled them).
- [x] **Learn on real photos — lessons ride on the picture** — owner ask
  2026-07-14 (the owner's framing: instead of dedicated tutorial photos, "lessons that
  can be collapsed to 1, 2, 3 on top of the photo and when you touch them shows
  lessons 1, 2, 3"). SHIPPED to staging 2026-07-14.
  BACKSTORY: the owner had uploaded example IR frames that got stranded — 5 were
  committed to branch `example-ir-photos` (PR #10), 15 more were only PR-body
  attachments this session's egress policy (github.com/user-attachments → 403)
  could not fetch. The owner re-uploaded the keepers directly. Teaching set started at
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
  install-time only; the owner wants to switch icons AFTER installing): on the web an
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
  library or database — that was ruled out explicitly — and impermanent by
  design, but not so impermanent that work is lost while it is still wanted. The structural consequence:
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
  headless (18/18, one assertion proven to FAIL first): the reported path
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
  pure form of the need the app was built for: white-balance a whole folder
  just to see what the files in it actually are). Design agreed: pick files →
  decode a small AUTO-BALANCED preview of each straight from the picked Files
  → a full-screen tappable grid with filenames. NOTHING is copied to storage
  (unlike sessions) — previews live in RAM only, so it's instant to open and
  instant to Done, and honestly ephemeral: iPad Safari can't re-read picked
  Files after a reload, so a quick look lasts only until the tab closes —
  which fits that need exactly — see what is there, then stop. From the grid, "keep these"
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
  ORDER FIX 2026-07-25 (owner: "they load on that tray out of order?"): the
  grid decoded in FileList order — the picker's tap order, which reads as
  random. openQuickLook now sorts by filename first (localeCompare
  numeric-aware), so tiles read in shutter order and same-shot NEF/DNG
  twins sit adjacent. VERIFIED headless (real #quickFiles input, scrambled
  3-DNG pick comes out sorted; fail-first: the unsorted build fails the
  same walk; no page errors).
- [x] **Batch process asks what goes on every photo** — owner feedback
  2026-07-13 (the need the app was built for: white-balance an entire folder
  just to SEE what files the owner was dealing with): batch used to silently take the
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
  the "IR lens fixes" panel. Colour-cast hot-spot correction FOLLOWED
  2026-09-10 as `hotspotColor` (−0.5..+0.5, same circle, red up / blue down in
  source space, before the matrix and the swap) — see "The hot-spot has a
  colour, and nothing could touch it".
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
  two lines on the iPad) grew the pill to ~140px, which floated OVER the
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
  releases. Two asks. (1) A chip that has been used must still look tappable —
  the ACTIVE chip has to read as a live control rather than a spent one, since
  it flips to its inverse on a second tap, and it was becoming camouflaged the
  moment it was applied. (2) Every aspect ratio has to be visible at once, with no
  scrolling left and right to find one.
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
  note's wording; whether B&W belongs in the IR tab where the owner expects it.
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
  ever) — fine headless, the owner's call on the real screen.
  OWNER FEEDBACK, staging round 3 (2026-07-18): the function itself was
  approved, and B&W gets ITS OWN PANEL TAB next to IR instead of living under
  the IR section. A ninth tab also completes the grid, which was wanted for its
  own sake: the .panel-tabs 3-column grid now fills exactly 3×3, with no orphan
  row. DONE: "bw" added to PANEL_TABS after "ir" (TAB_META "Black &
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
  iPhone, and whether "B&W" is the label the owner wants on the tab
  (alternatives easy: "Mono", or "Black & white" if it fits the cell).
  MERGED TO MAIN 2026-07-18 (owner go; PR #28, rebase) — production
  deploys as 1.2.

- [x] **Learning library tile in the grid** — owner verdict 2026-07-15 (given
  WITH the crop go to main): the dashed "Browse the full example library"
  pill was "completely missable, and most people would never know it was
  there — it's at the bottom and does not stand out." The owner's design: a TILE
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

- [x] **Location-data guard — the 🛰 tip** — owner ask 2026-07-18. The ask had
  been made earlier and never written down anywhere; captured and
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
  NEEDS THE OWNER'S HANDS (iPad): the 🛰 glyph renders as the owner pictured it;
  the chip's bottom-left home; the dialog + settings wording; the real
  share-sheet feel of "re-save over the original" on iOS (headless proxies
  it as a download); and a REAL SnapBridge-tagged NEF from the owner's camera —
  the harness GPS block is synthetic (structurally identical, but the owner's
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
  corner spot vs the notch/safe-area on the real devices, and whether the
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
  convert tagged P3 correctly, but the owner's pipeline is the real test).
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
  NEEDS THE OWNER'S HANDS: export one of THE OWNER'S real NEFs and check Photos
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
  full-width Grade row placement the owner hasn't blessed yet), grain character
  on the real panel at the owner's usual export sizes, the five toned-mono
  recipes against the owner's taste (they're my calibration), and strong tints
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
  straight to main (owner's 2026-07-19 gate exception; the owner is most excited
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
  scale/rotate feel on the iPad, the four art pieces against the owner's taste, the
  peek-behind at full strength (mottled — maybe cap it lower), and whether
  the owner wants pinch-to-scale/rotate on the sticker itself (currently sliders).
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
  (persist via IndexedDB later, if cutouts should survive a reload).
- [x] **Stickers v2 — paint to tuck behind + two-finger resize/spin** — the
  last of the sticker rework (2026-07-19). What was missing: no way to remove
  part of a sticker so it sits in the background, and no way to put it back.
  BLEND: a "Paint on the sticker" toggle turns canvas strokes from move→paint; "Rub away" drives the
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
  confirming the owner's AI-made PNGs (transparent, sized) land in the right folders.
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
  feels right, and whether the owner wants saturation folded into the auto-match too
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
  without the double force-close, which nobody outside this project would ever
  have worked out was needed. (b) The
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
- [x] **Sticker brush QoL: start off-edge + a brush-size ring (2026-07-21, owner:
  "brushing only works if you start within the transparent background… near the
  edge is hard" + "brush size slider has nothing to show that effect")** — two
  fixes, increments. (a) EDGE BRUSHING: `startStickerPaint` used to bail (return
  false → fall through to drag) unless the press landed inside the sticker's local
  [0,1] rect, so a stroke had to BEGIN on the sticker and trimming the very edge
  was fiddly. Now, while Paint mode is armed, a press anywhere BEGINS the stroke
  (pointer captured); a stamp that lands off the mask is a harmless no-op (stkStamp
  already clamps), and the interpolated stroke fills in once it crosses the edge —
  so you start just outside and brush inward. NOTE: in Paint mode a press no longer
  falls through to select a different sticker (the mode is per-selected-sticker;
  exit via the toggle). (b) BRUSH-SIZE RING: new `#stkBrush` div cursor (theme-
  invariant light ring + dark halo, floats over the photo, aria-hidden, z-index 6,
  absolute in #stage like the heal overlay) shows the brush's real footprint —
  live at the pointer while painting, and flashed at the sticker's centre for
  ~1.2s whenever the Brush size slider moves. Radius: `val·max(1,a.h/a.w)·s.scale`
  in image-uv → client via imageUvToClient. VERIFIED (sticker-brush-walk, 8 checks):
  the ring shows on slider move and SCALES with it (79→236 px) then fades; a stroke
  STARTING off the sticker trims it (maskRev 0→21); ring visible while painting,
  hidden after. a11y clean both themes; controls 14/14, follow 14/14, rotate-ghost
  7/7, sticker-fixes 39/39, parity 0 LSB. `__stickers()` snapshot gained maskRev/
  hasMask for the walk.
- [x] **Sticker placement QoL: smaller min, pan while armed, reachable delete +
  Delete key (2026-07-21, owner batch)** — four usability fixes, all increments
  (no VERSION bump). (a) MIN SIZE: Size floor dropped 0.05 → 0.015 (slider min +
  the resize-handle and two-finger-pinch clamps) so a distant/tiny creature is
  possible. (b) PAN WHILE ARMED: the Stickers tab used to dead-own the canvas
  ("no pan while armed") so you could only zoom-to-centre; now a one-finger/mouse
  drag on EMPTY canvas pans the zoomed photo (new `stickerPan` state in the armed
  pointer handlers; a drag that HITS a sticker still moves it; empty-drag only
  pans when zoom > 1). NOTE: an empty tap no longer re-grabs the selected sticker
  — you grab a sticker by its own body now (needed to free empty-drag for pan).
  (c) DELETE BUTTON moved from the BOTTOM of the menu to the TOP of the Selected-
  sticker controls (above Size). (d) DELETE KEY: Delete/Backspace removes the
  selected sticker (same `deleteSelectedSticker()` as the button), guarded off
  when focus is in an input/textarea/select/contentEditable. Bonus correctness:
  deleting a creature now also removes its still-LINKED shadow (no orphan puddle);
  a DETACHED shadow (linkTo cleared) survives on its own. VERIFIED (sticker-
  controls-walk, 14 checks): min 0.015 + a 0.02 sticker; delete button above Size;
  empty-drag pans (view transform moves) without moving the sticker; on-sticker
  drag still moves it; Delete + Backspace remove the selection; Delete ignored in
  a field; creature-delete takes its glued shadow but not a detached one. a11y
  clean both themes; follow 14/14, rotate-ghost 7/7, sticker-fixes 39/39, parity
  0 LSB. NEEDS THE OWNER'S HANDS: grabbing a very small sticker by body is a small
  target — the Size slider + handles still work, but a tap-to-select-nearest could
  be a follow-up if it feels fiddly.
- [x] **Cast shadows auto-follow their creature (2026-07-21, owner "a toggle
  that makes the sticker auto-update when dropped in a new location" applied to
  the shadow's placement pain)** — a cast shadow is now GLUED to the creature it
  came from and tracks its position / scale / spin on every settle, so you place
  the creature once and the contact puddle rides along — no more casting a shadow
  and then hand-lining-it-up, which made placement effectively impossible.
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
  offset (auto-follow means most placements never need it; if the owner wants a dedicated
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
- [x] **Stickers lay ON TOP of the look now, not under it (2026-07-21)** — THE
  big one, and the rule behind it: a sticker is a different kind of picture from
  the photograph, so it cannot sit under the same filters. A colourful cutout
  composited INTO the source (pre-pipeline) got channel-swapped + WB'd +
  saturated into neon (the
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
  in-look opt-in still gives the cryptid-in-infrared effect when the owner wants it.
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
  handles, which skew, confused the owner). positionStickerOverlay now has three modes
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
  neon, measured on the device. Blend-off helps but the look still processes it. The real
  cure is a per-sticker "lay it on top / keep its own look" mode that composites
  AFTER the pipeline (a new display-space stage in BOTH preview + export, with
  occlusion/mask/perspective in display space) — a real architectural fork; parked
  for owner direction before building (asked in chat, per the no-picker rule).
- [x] **New Infrared app icon + social tile (Bigfoot IR forest)** — owner ask
  2026-07-20, from a ChatGPT-made color-IR forest the owner liked (a Bigfoot subtly
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

## Desktop-mouse round + the flat-frame finding, 2026-09-08

Eight reports from a session driven with a MOUSE rather than a finger. Six were
real defects, one was a question, and one turned out to be a measurable property
of the open baseline rather than a bug. Everything below was measured in the
built app under headless Chromium with real pointer input; nothing here has had
the owner's hands on it on the iPad.

**THE CROP HANDLES WERE DEAD WHENEVER AN ASPECT RATIO WAS LOCKED.** With Free
selected everything worked, which is why this survived. With 1:1, 4:5 or 16:9
locked, a straight horizontal or straight vertical drag on a corner handle moved
the box NOT AT ALL — six of twelve measured drags produced a zero change — and
every diagonal drag followed the SMALLER component: 90px across and 30px down
resized by the 30. The rule was "the dominant drag axis wins", implemented by
comparing the box's own EXTENTS after the drag. That can never work: the axis
you did not move is by construction already exactly on the ratio, so it wins
every comparison and the solver re-derives the box you started from. It now
compares the POINTER's own components (dy scaled by the ratio, since dx is a
fraction of the frame's width and dy of its height). Re-measured: 0 of 12 dead,
the ratio held to four decimals in every case, and the diagonal drags now match
their dominant single-axis equivalents exactly. A touch drag wanders on both
axes, which is why this was invisible for the tool's whole life.

**NOTHING IN THE SESSION STRIP ANSWERED A MOUSE.** It is a native
`overflow-x` scroller: a finger flicks it and a trackpad swipes it, but Safari
does not turn a vertical wheel into horizontal scroll and no browser drag-scrolls
a container. Three routes added — wheel (either axis), press-and-pull with a 6px
threshold so a tap is still a tap, and Left/Right arrows, which move BETWEEN
photos rather than scrolling, since that is the thing actually wanted. The arrow
handler is scoped to the photo and the strip so the range sliders, text fields
and the panel's tab list keep their own arrows (asserted: a focused slider still
takes its arrow key). Two smaller things the same reports exposed: the strip is
rebuilt on every add and every switch, and the rebuild reset its scroll position,
so the far end of a long set was unreachable; and nothing ever scrolled the
ACTIVE thumbnail into view, so in a set of forty it was usually off the end.

**WHERE THE TIME ACTUALLY GOES WHEN A SET OPENS — IT IS NOT THE THUMBNAILS.**
Instrumented over six practice DNGs: decode 16%, thumbnail 12%, and the durable
copy into IndexedDB 72%. Of that copy, only ~30-130ms per photo is main-thread
work (structured-cloning the 30KB chunks); the remaining ~300-450ms is waiting on
the strict-durability commit, which is what lets a session survive a reload. So
the old serial loop spent most of its wall clock with the processor idle waiting
on the disk. One write is now allowed in flight while the NEXT photo is read and
decoded — exactly one, because two photos' source bytes in RAM is the ceiling and
a set of forty must never hold forty. A photo whose write has not landed is in
the strip but not switchable (dimmed, dotted edge, disabled) since there would be
nothing to decode from, and a failed write takes its tile back out. Measured over
four runs each on eight DNGs: first photo on screen 0.67-0.74s to 0.39-0.44s, the
whole set 5.16-5.84s to 4.47-5.00s. The chunking and the strict durability were
NOT touched — they are the reason a session survives a crash.

**AND NOTHING SAID IT WAS HAPPENING.** The strip carried an "Adding i / N" line,
but it was overwritten by the strip's own summary at the end of the same
iteration, and the strip was hidden entirely until two photos existed — so
opening a set showed an untouched welcome screen for the first two decodes and a
flickering strip after that. Now: the spinner names the file until there is a
photo to look at, then hands the screen back; the strip stays up for the whole
load with a determinate bar and a live count; Done is disabled while it runs.
Done itself used to spend the storage wipe looking like nothing had been pressed
— it now says what it is freeing and confirms afterwards. Ending a session throws
work away, and silence is the wrong confirmation for that.

**A FLAT FRAME IS THE OPEN BASELINE BEHAVING AS SPECIFIED, NOT A BUG.** Rendered
all 44 bundled practice frames at their open baseline with Aerochrome on. The
frames with an open sky land at a median luminance near 0.44, warm-half
saturation near 0.35 and cool-half near 0.50. The frames without land at
0.50-0.67 median luminance and 0.16-0.24 warm saturation — a full stop of lift
and half the colour. Both automatics are correct as written: auto exposure
anchors the 97th percentile at 0.85 (dcraw's auto-bright shape), so a histogram
with no dark region gets lifted whole; and gray-world balance makes the frame's
own average neutral, which in an infrared frame that is nine tenths foliage means
neutralising the foliage — the one material the false-colour looks need a cast
on. THERE IS NO WHITE BALANCE THAT BOTH NEUTRALISES THE DOMINANT MATERIAL AND
LEAVES IT COLOURED. So the colour has to come from the creative layer, and the
ruled open baseline (2026-07-25 rev. 2) was left alone.
What shipped instead is "Lift a flat frame" in the IR tab, pressed after a look.
It measures the frame through the same compileEdit the preview and the export
use, bisects a black-point pull until the median reaches the reference or the
shadows would be crushed to get there (the lower quartile may not fall below half
of where it started — "shadows alive" as a measurement, not a taste guess), then
solves the two band-saturation sliders to the warm and cool references with one
measured refinement, capped at the sliders' own ceiling. Measured: the flat
frames move to warm 0.30-0.43 and median 0.39-0.57; a frame that already measures
at the reference is a NO-OP and says so. Everything lands on the Tone points and
the Sky/Foliage sliders and one Go back undoes it, so it passes all three of
Doctrine §14's tests.
STILL OPEN, and an owner call: whether this belongs inside the looks (so
Aerochrome looks like Aerochrome on any frame without a second press), or in the
open baseline, or stays an explicit press. Also unresolved: on a frame whose
foliage renders near-white, scaling HSV saturation has little to scale — that
case improves but does not transform.

**THE QUALITY SLIDER SAID NOTHING.** A bare 0.5-1 rail with no readout, no
units and nothing about which end was better. It now reads 50-100 — the number
every other photo app calls JPEG quality — with a word for what the number costs
(what a JPEG gives up first is fine texture, which on an infrared frame is most
of the picture), and the export's Ready line carries the file's MEASURED size, so
the slider has something to be judged against. On a practice frame: 50 gives
292KB, 82 gives 557KB, 92 gives 919KB, 100 gives 5.3MB — which is the argument
for the note saying 100 is a print master.

**TWO TARGET-SIZE FINDINGS FROM THE SAME PASS.** The session strip's Done button
rendered 28px tall, and all six `.accent-outline` buttons (Basic Auto, IR Auto
white balance, Rotate 90, both flips, and the new Lift) rendered 38px. The
2026-07-29 sweep covered the IR bar, both help dialogs, the welcome card, privacy
and notes — the panel's own buttons and the strip were never in its scope, the
same way that pass's dialog-scoped text rule missed the panel LABELS. All seven
are 44px now. axe (wcag2a/aa, wcag21a/aa) is clean in both themes on the editor
with a session open.

**OBSERVED, NOT CHANGED:** `.lut-strength-row` is authored as a flex row with a
38px value column, but it is a `<label>` inside `#panel`, and `#panel label`
sets `display: block` — an id selector beats a class, so it has never actually
laid out as a row. The new quality row is scoped through `#panel` for exactly
this reason. Left alone rather than churned: it is a live surface and its current
appearance may be the accepted one.

**ANSWERED, NOT A DEFECT:** whether "Quick look a folder" differs from picking
several photos through "Open image(s)". It does, and the difference is storage.
Quick look decodes each picked file to a preview held in RAM only, writes nothing
to the device, and is gone when the tab closes — it exists to answer "what have I
got?"; the keepers you tap go into a real session through the normal open path.
Opening several photos COPIES each one's source bytes into on-device storage so
the set survives a reload, a crash or the OS discarding the tab, and each photo
keeps its own edit. That copy is the 72% above. Batch process is the third thing
and edits nothing: it develops a whole set unattended into one .zip.

## Double-tap a slider to put it back, 2026-09-09

Asked for by the convention it belongs to — Lightroom and Capture One both reset
a control on a double click — and it matters more here than in either, because
**most of these sliders do not default to zero.** White balance, exposure and
denoise open at values MEASURED from the photograph. "Back to default" for them
is the number this frame opened with, which is already what Reset means in this
app; the double-tap is Reset for one control instead of all of them.

**Captured from the DOM, not from a table.** The defaults are read off every
range input at the moment the Reset baseline is taken — `syncToUI` has just
written the opened values into every control, so the DOM already IS the answer.
A field-to-element map would have been a second copy of `syncToUI` to keep in
step, and every second copy this session went looking at had drifted.

**Two controls are preferences, not part of the photo:** export Quality and
Restore depth Strength open at whatever was last chosen, so "back where it
opened" would mean "no change". They go to the app's own default (92 and 100).

**THE TOUCH PATH IS NOT `dblclick`.** iOS can swallow the second tap into
double-tap zoom, so the same gesture is timed by hand off `touchend` at 350 ms,
and `touch-action: manipulation` on the control declines that gesture —
WITHOUT touching page zoom, which stays scalable, since locking it is a
standing fail state here.

**Asserted:** `wbR` opens at 507 and returns to 507, not 0; exposure 615;
denoise 0.46; recover 0. Quality set to 60 returns to 92. It is ONE undo step,
and undo gives back the value you had dragged to. On the touch path two quick
taps put it back and two slow ones do not.

**AND IT THREW ON LOAD FIRST.** The wiring was called with the other startup
calls near the top of the module, and it closes over `panel`, `flushRecord` and
the two maps — all declared further down. A `const` referenced before its
declaration is a temporal dead zone throw, so the whole app failed to start:
`Cannot access 'Qn' before initialization`. Caught by the walk timing out on the
welcome screen. Module-level wiring goes AFTER what it closes over, and the
minifier's renamed identifier is why that error message tells you nothing.

**AND THE HARNESS READ A POLLUTED BASELINE.** The touch check first reported
`opened 1000 → moved 1000`, which made a working gesture look broken — the
previous sub-test had left the slider dragged, and "opened" was read from it.
Reset the control before measuring what its opening value is.

**Discoverable, because a gesture nobody is told about is a gesture nobody
uses:** every slider carries a tooltip saying what a double-tap does to it, and
Help's Quick start says it in a sentence, including why the two preference
sliders behave differently.

## Every photo in a kept set was decoded twice, 2026-09-09

Reported as a question: why does the strip render every thumbnail again, after
the Quick look grid was just watched rendering them?

Because it did. `openQuickLook` decodes every picked file to build the grid.
`keepQuickLook` then took `quickItems.map(it => it.file)` — **the bare Files,
throwing every rendered picture away** — and handed them to `addToSession`,
whose background pass decoded all of them a second time to build the strip.

**MEASURED, same twelve files, counting decode-worker replies:**

- opening them directly: 13 decodes
- Quick look then Keep: 12 for the grid + **13 after Keep** = 25

**Halved: 12 + 1 = 13 after the fix**, the 1 being the photo actually opened for
display. Every tile still has a picture.

**HOW.** Quick look already has the decode in hand, so it renders the strip
size from it too — a quarter of the grid tile's pixels, a fraction of the decode
that produced it. `keepQuickLook` carries those across in a `Map` keyed by the
File itself, so re-ordering on the way in cannot mismatch a picture to a photo,
and `addToSession` marks such a tile `real` and stamps its grade, which is what
keeps `realThumbnails` from picking it up.

**Rendered at the STRIP's size rather than reusing the 512px grid bytes**, and
the reason is `session.ts`: a thumbnail rides INLINE in the photo's meta row,
and large IDB values are the one shape this app has measured as not crash-safe.
A 512px JPEG in every meta row would have traded a decode for the sidecar trap.

**AND ONE ORDERING BUG CAUGHT ON THE WAY.** The camera's embedded preview is
applied a few lines further down the same loop, unconditionally — so it
overwrote the finished picture with the camera's magenta stand-in and set the
tile back to `preview`, handing it straight back to the background pass. The
whole saving would have been silently undone. It now only fills a tile that has
no real picture yet.

**WHAT THIS DOES NOT SHOW HERE.** Wall time barely moved in the harness (21.0 s
to 22.8 s) because these practice DNGs decode quickly and the run waits a fixed
8 s for the background pass to settle. The saving is a decode per photo, and on
the 26 MB NEFs this was reported against the decode is the dominant cost —
so the time it saves is on the device, not on this machine.

## Restore depth gets a strength slider, 2026-09-09

The targets it solves against — median luminance 0.44, warm saturation 0.35,
cool 0.50 — were measured across the practice set and have been carried in this
file as "taste, not measurement" for the whole session. **How far to apply a
correction is a judgement about a photograph, and the answer to that is a
slider, not a constant in a source file.** 0 does nothing, 100 is the full
correction the frame was solved for, and the whole range is on one control.

**It scales the ANSWER, not the targets.** `scaleLift` mixes the solved values
back toward doing nothing — half strength is half the tone pull and half the
extra saturation, not a different correction solved against softer references.
That keeps the solve idempotent and keeps every intermediate value on the same
sliders the full one lands on. Applied at all three solve sites: the open, the
thumbnail, and the batch.

**MEASURED on a frame whose correction is all colour:** full 1.37/1.85 foliage
and sky, 50% 1.18/1.42 — the midpoints — 0% exactly 1/1, and back to 100%
identical to the first reading. The slider is disabled while the automatic is
off, and the strength survives a reload.

**AND IT SHIPPED, BRIEFLY, DEFAULTING TO ZERO.** The stored value was read as
`Number(localStorage.getItem(...))`, and `Number(null)` is **0** — which passes
every range check a sane person writes. So a fresh install would have had the
automatic switched on, showing on, and doing nothing: **the exact complaint this
control was added to answer, reintroduced by the control itself.** Caught by the
first run of its own test, whose "100%" baseline read `amt: "0"`. Ask whether
there IS a stored value before asking what it is.

## "Opening 360 photos" was describing something that was not happening

Two faults in one line, both reported from the device.

**It stopped saying which photo you are on.** The strip's meta line is replaced
wholesale while a set comes in, so `viewing N` — the one number the strip exists
to tell you — vanished for the entire load. On 360 files that is minutes of not
knowing where you are. It now reads `viewing 1 · adding 53 of 360 — NIR_2962.NEF`
and keeps the position through the whole load.

**And they were not "opening".** One photo is open; the rest are being read and
copied onto the device so the set survives a reload, which is where the wait
actually goes. "Opening 360 photos" named an action that was not occurring, on
the surface whose job is to say what is. It says "adding" now.

Asserted across a 44-file open: 42 distinct lines, every one carrying
`viewing N`, none saying "Opening", and the settled line still reading
`44 photos · ~438 MB · viewing 1`.

## The strip was showing a grade nobody was looking at any more, 2026-09-09

Spotted in a screenshot: the photo on screen strongly cyan, every thumbnail in
the strip beneath it grey-pink. The repo's own rule is that a tile matches what
tapping it opens into, and `makeThumb` carries a comment citing an
owner-caught case of exactly this.

**MEASURED, because a screenshot is not a measurement.** Four photos, Aerochrome
applied, each tile's mean colour compared against the photo it opens into — as a
CAST (each channel over the mean), so the tile being smaller and a JPEG does not
count as a colour difference:

- NIR_0063: photo 1.18/0.90/0.92 · tile 1.02/0.98/0.99 — 0.154 apart
- and every other tile within a hair of neutral, 1.02/0.98/0.99

**The tiles were not wearing the look at all.** `realThumbnails` selects photos
whose `thumbState !== "real"` — so once a set is in, every tile is "real" and the
pass returns immediately. The tiles were rendered under whatever grade was live
at OPEN, and changing the look afterwards never touched them. The earlier fix
for this (thumbnails wearing another photo's correction) was about which PHOTO's
values a tile used; this is about which MOMENT's.

**AND THE FIRST HARNESS COULD NOT HAVE SEEN IT.** The tile-versus-photo check
written earlier today correlates LUMINANCE on a 5x5 grid — it scored 0.999 while
the tiles were the wrong colour entirely, because a colour cast barely moves
luminance. **A test that passes on the defect it was written near is worse than
no test**, and this one passed at three nines.

**THE FIX IS A STAMP, not a re-run.** Each tile records the grade it was drawn
under — the part of the live state `makeThumb` actually consumes, since it
replaces balance, exposure and denoise with the photo's own. A look press marks
every tile whose stamp no longer matches and lets the existing background pass
redraw them: it already decodes from storage, is interruptible by its generation
guard, and leaves the old picture up until a new one lands, so nothing blanks.

**Debounced at 900 ms, and measured:** four look presses in a row over a 44-photo
set cost 45 decodes — **1.02 passes, not four** — and all 44 tiles kept a picture
throughout. After the fix NIR_0063 reads photo 81/62/64 against tile 81/65/65,
0.024 apart where it was 0.154.

**WHAT THIS COSTS ON A BIG SET, said plainly:** one look press on a 360-photo
session queues 360 background decodes. Nothing blocks and the pass abandons
itself if the session changes, but it is real work, and if that turns out to
matter the answer is to redraw the visible tiles first rather than to stop
stamping them.

## Asking for one photo and being told about another, 2026-09-09

Reported from a 360-file NEF open on the iPad: tapping a thumbnail put up a
spinner reading **"Opening 360 photos — reading 41 of 360: NIR_2950.NEF"**.

`switchToPhoto` raises its own `showBusy("Loading…")`. `addToSession` raises one
too, to cover the wait for the FIRST photo, and hides it the moment a photo is
on screen — but **the loop keeps running for the rest of the set, and its
progress line was guarded only by `if (busy.open)`.** So once the reader tapped a
tile and raised a spinner, the still-running loop wrote its own progress into
it. Asking for one thing and being told about another is worse than being told
nothing.

Fixed with ownership: the loop tracks whether the dialog is ITS dialog, drops
that claim in the same place it calls `hideBusy`, and never writes into one it
did not raise. Asserted by watching every spinner message across a whole 44-file
open while tapping a tile part-way through — the only message that appears after
the tap is "Loading…".

**AND "CAM" WAS NOT A WORD.** The provisional tile badge read `cam`, uppercased
by CSS. It means "the picture in this tile is the camera's own rendering, not
this app's, and it will be replaced" — a sentence nobody had been told,
abbreviated to three letters, on a badge with no explanation anywhere in the
app. It reads **"preview"** now, and the tile carries a tooltip saying the rest.

**AND THIS ONE COULD NOT BE RENDERED HERE, WHICH IS WORTH RECORDING RATHER THAN
GLOSSING.** The badge appears only while a tile is stored AND still showing the
camera preview. Across a 44-file open, polled every 100 ms — and again at 8x CPU
throttling to widen any narrow window — **the `provisional` class never applied
once**. These practice DNGs carry no embedded camera preview, so the state is
not reachable with them at all; the reported NEFs do carry one, which is why the
badge is in the screenshot and not in any local run.

So what is verified here is the BUILD, not the render: the old `textContent:"cam"`
is absent from the bundle, `session-thumb-tag",textContent:"preview"` is present,
and the tooltip string is there. The element, class and DOM path are unchanged.
**The rendered check needs a file with a camera preview in it, which this repo
does not have** — worth knowing before the next session assumes the practice set
covers every tile state.

## The full-screen dialogs never spent the safe-area inset, 2026-09-09

Reported from the installed iPad: the Quick look header drawn UNDER the iOS
status bar — the clock sitting on top of the title, and Select none / Keep /
Close tucked beneath the battery indicator.

`.bar`, the app's own top bar, has spent `env(safe-area-inset-top)` since it was
written. `.ql-head` never did — and both dialogs that use it are
`position: fixed; inset: 0; height: 100dvh`, so they cover the whole screen
INCLUDING the strip iOS draws its status bar into. **One header, two surfaces:
Quick look and the practice library were wrong from the same line.** The
bottom got the same treatment, since the home indicator sits over the last row
of tiles.

**AND THE BUTTONS IN THAT HEADER WERE 34px.** `.ql-btn` is authored as
`padding: 8px 14px` at 0.8125rem — about 34px tall, on the primary controls of a
full-screen surface. The hit-area sweep added earlier today did not catch it
because **it only ever opened the two dialogs on the main page.** A sweep is a
list of states somebody remembered, and the states nobody remembers are exactly
where this lives. Both full-screen dialogs are in the sweep now, opened directly
— their controls do not depend on content — and every interactive element clears
44 at 430px and 900px in all five states.

**VERIFIED AGAINST AN INJECTED INSET, because a headless browser has no status
bar and reports every inset as zero.** A test run without one passes on the
machine that cannot have the defect and proves nothing about the device that
does. With 44px injected the way a device supplies it: the header background
still starts at y=0 (it SHOULD fill behind the bar), the title lands at y=68 and
every button at y=56, all clear of the 0–44 strip and all 44px tall.

**Checked and not a defect:** `#unsupported` is the only other fixed full-screen
element, and it centres its card, so it never reaches the bar.

## The sidecar gap was already closed, and I reported it as open twice, 2026-09-09

Carried in two handovers as a standing crash-safety defect: that `batchstore.ts`
puts large IDB values in a lazily-flushed sidecar which `durability: "strict"`
does not cover. **It does not, and has not since its v2 upgrade.** `putFrame`
splits every frame into 30 KB chunks and writes the meta row and all its chunks
in ONE strict transaction, and the v2 `onupgradeneeded` deletes the old
whole-frame `frames` store outright, with a comment saying why. `session.ts` has
the identical shape and the same 30 KB constant.

**The header describing the sidecar trap is the RATIONALE for that design, not a
description of a live problem** — it opens "MEASURED GOTCHA (2026-07-12)" and
explains what the chunking exists to avoid. Read out of context it states a
defect in the present tense, and it was.

**The same error class as four others in this session**, and the cheapest of
them to have avoided: a comment read as current state. The others were a target
measured as a bounding box, durability measured as elapsed time, a look's state
inferred from a variable about to be cleared, and a bundle grepped for a string
another file carries. **Where the code can be asked directly, ask it.** Ten
lines of `putFrame` settled this; two handovers of prose did not.

## Half the practice set is portrait and every thumbnail lay on its side, 2026-09-09

Reported against the Quick look grid. `makeThumb` never read `img.rotate` — the
EXIF Orientation tag, which `decode.ts` has always resolved into 90-degree CW
steps and the main view has always honoured. So a frame shot in portrait opened
upright and its thumbnail lay sideways.

**It was not a corner case.** Reading tag 274 out of all forty-four practice
DNGs: 22 carry Orientation 1, three carry none, and **19 carry Orientation 8** —
270 degrees, portrait. Nearly half the set.

**AND IT WAS NEVER ONLY THE GRID.** `makeThumb` builds the Quick look tiles AND
the session strip tiles, so both were wrong from the same line. Measured before
the fix: a portrait frame's tile came out 512x341 in the grid and 260x173 in the
strip, while the photo itself opened 932x1400.

**HOW IT IS DONE.** Destination pixels are mapped back to source inside the
existing loop, so there is still one pass and no second buffer; only the output
dimensions swap on an odd quarter-turn. The aspect handed to `compileEdit` stays
the SOURCE aspect — the edit is computed in the photo's own space and only the
laying-out of the result turns.

**AND THE SHAPE TEST WAS NOT ALLOWED TO BE THE PROOF.** A tile coming out
portrait says nothing about WHICH way it turned: 90 and 270 and 180 all pass a
shape check on a portrait frame, and two of the three would be visibly wrong.
Two independent checks instead:

- The mapping applied to a known 4x3 pattern and compared against a naive
 rotate-CW-n-times implementation, for all four rotations. All four match.
- Each tile correlated against the photo it opens into, on a 5x5 luminance
 grid: **0.999, 1.000 and 1.000 upright**, against -0.732, 0.535 and -0.437 for
 the same tile turned 180. Landscape frames unaffected.

**THE HARNESS BUG THAT NEARLY PASSED IT FOR THE WRONG REASON.** The first
correlation run opened the portrait file alongside `NIR_0102` and read tile
index 0 — and `inShutterOrder` sorts numerically, so index 0 was `NIR_0102`, a
LANDSCAPE frame, correlated against itself for a perfect 0.999. The give-away
was in the log the whole time: it printed the photo as 1400x932 when a portrait
file was under test. **A test that reports a size it should not have is
reporting the wrong subject, not a surprising result.**

**WHAT WAS CHECKED AND IS NOT A DEFECT.** The provisional tiles shown while a
set loads come from the camera's own embedded JPEG, and browsers apply that
file's EXIF orientation to an `<img>` themselves; across four portrait files no
tile was landscape in either the provisional or the settled state.

## What batch was actually doing, 2026-09-09

Asked what batch processing does now, and the answer read off `batchParamsFor`
was that it does **less than every other path in the app**. Per frame it sets a
gray-world balance (times the chosen built-in look's WB bias), auto exposure,
measured denoise, the grade's creative values and the resolved LUT, and nothing
composition-specific — no masks, heals, stickers, crop or straighten, all
deliberate and all documented.

**What it did NOT set:**

- **Highlight recovery.** `recover` appears zero times in `batchParamsFor`. A
 single open sets `autoRecover`; so does the strip THUMBNAIL builder. Batch was
 the only path in the app that skipped it, so a frame with real clipping came
 out of a .zip unrecovered.
- **Restore depth.** No `solveLift` or `applyLift` anywhere in the batch path.
 It was never wired in when the lift became automatic at open, and nothing
 failed, because no test compares a batch frame against the editor.

**MEASURED, BEFORE ANY CHANGE — one frame, Aerochrome on both sides:**

- editor: median luminance 0.5289, warm saturation 0.3541
- batch: median 0.6335, warm saturation 0.1899

**A tenth brighter and 46% less colour.** Nobody comparing a .zip against the
screen would have called that the same develop, and the batch dialog's own lead
enumerated the automatics — "white balance, exposure, denoise, lens fix" — which
was accurate and therefore not a lie anyone could catch by reading.

**FIXED, and the copy now says so.** `batchParamsFor` sets `recover` like every
other path and solves the lift per frame from that frame's own measurement,
honouring the toggle: Restore depth off means off in a batch too. The colour
half runs where a LOOK was chosen — the auto-balance-only choice gets the tonal
half alone, matching a bare open.

**HOW IT WAS VERIFIED, which is the part worth copying.** A real batch run
driven through the UI, the .zip captured from the download, and the JPEG sliced
straight out of it — `writeZip` uses method 0, STORED, so no inflate is needed —
then decoded and measured with the same statistics as the editor's own canvas.
After the fix the same frame reads 0.5184 against 0.5289 and 0.3359 against
0.3541: about 1%, where the resolutions differ (the batch writes 2800x1864, the
editor renders 1400x932 on screen).

**AND THAT LAST 1% WAS THEN MEASURED RATHER THAN EXPLAINED AWAY.** Exporting the
SAME photo from the editor at full resolution, so both sides go through the same
encoder at the same size: median 0.3908 against 0.3875, warm saturation 0.4054
against 0.4103 — **0.003 and 0.005**. The develop is the same; the residual was
resolution and JPEG, exactly as claimed, and now that claim is a measurement.

**ASSERTED AS BEHAVIOUR, not just as numbers.** Three batch runs of one frame:
Aerochrome with the toggle on reads median 0.3875 / warm 0.4103; with the toggle
off, 0.4989 / 0.2338 — so the toggle governs a batch; auto-balance-only with the
toggle on reads 0.4441 / 0.0435 — the tonal half without the colour half, which
is what a bare open does.

**THE GENERAL SHAPE.** An automatic added to the open path is not added to the
app. There are four paths that develop a frame here — the open, the strip
thumbnail, the export and the batch — and a change to one is a divergence in the
other three until somebody checks. The thumbnails already cost a release for
exactly this (they wore another photo's correction); this is the same lesson in
the fourth path, found only because it was asked about.

## A look carries whole, or it does not carry, 2026-09-09

The previous entry left this as a design question for the owner, and it was not
one. Measured: switching photos kept the look's GRADE — saturation 3, the
channel swap — while `activeLook` was cleared, so the frame wore Aerochrome and
the app reported nothing selected. **That is not two behaviours to choose
between; it is the button and the pixels disagreeing, and one of them was
false.** Since the grade carrying is deliberate and documented and the identity
being cleared is not, the identity was the accident.

**AND RELABELLING THE BUTTON WOULD NOT HAVE BEEN THE FIX.** A look's WHITE
BALANCE bias is not carried: `lookBias` is reset at open and the new photo's
balance is measured fresh, so a carried "Red" would have been a name over a
grade missing the bias that defines it. The open now RE-APPLIES the look —
`applyLook(activeLook)` — which puts the bias on this photo's own balance, the
grade, and the colour half of the lift on at once. Measured on Red, which has a
bias: photo 1 balances 507/595/647 and takes Red to 470/598/692; photo 2 opens
at 513/595/640 with Red re-applied to ITS measurement, not photo 1's numbers
copied across.

`activeLook = null` also came out of the block it was sitting in, which resets
composition-specific state — masks, spots, crop. A look is creative state, and
the rest of the creative grade carries.

**WHAT IS ASSERTED NOW.** A bare frame stays bare: no look, no band boost — the
regression guard for the `swapRB` attempt recorded in the previous entry.
Switching photos with Aerochrome on keeps the button on Aerochrome, puts the
grade on the new photo, and brings the colour half of Restore depth with it.
Reset returns to the looked state the photo opened in, button included, because
`baseline` is captured after the re-apply.

**AND THE RESIDUAL IS CLOSED — IT WAS THE ROUNDING AGAIN, ONE LAYER UP.**
Turning Restore depth off and on returned foliage to 1.71 where the photo opened
at 1.65. Ruled out first: the image (same 1400x932), the neutralisation, and the
look criterion. Then the solve INPUTS were dumped at both moments and diffed,
which named it in one run:

- white balance `0.6162576380649035` against `0.6170426151579793`
- exposure `7.525785336670117` against `7.53571027928973`
- denoise `0.44014856293231525` against `0.44`

**The auto-measured baseline is full precision and every slider has a step.**
`syncToUI` writes 0.44014856293231525 into a control that snaps it to 0.44, and
the `syncFromUI` further down the open — which is there ON PURPOSE, so the Reset
baseline is exactly what the reader sees — writes the snapped number back over
the measurement. The lift solved before that ran; the toggle, pressed later,
solved after. Two solves, two different sets of inputs, and neither was wrong on
its own.

Fixed by rounding FIRST: `syncToUI(); syncFromUI();` immediately after the four
measurements, before anything solves against them. Every consumer downstream —
the lift, `origParams`, `baseline`, the toggle — now sees one set of numbers,
and the two solves are identical by construction rather than by coincidence. It
also means the value the reader is shown is the value being applied, which is
what the `syncFromUI` was reaching for in the first place.

**It is the same fault `removeLift` carries a note about, one layer up:** a
full-precision value written to a stepped control does not come back. That one
was found by a revert that never fired; this one by a round trip that landed 4%
away. **The general form: any value measured to full precision and displayed on
a stepped control has two versions, and every consumer has to be told which one
it is reading.**

Full-frame renders across five practice DNGs after the change: medians 0.378 to
0.592, no crushed blacks anywhere, blown highlights 0.01% to 1.34%, mean RGB
near-neutral on all five — the rounding moves nothing visible, which is the
point, since 0.44 is what the slider was claiming all along.

**AND A HARNESS FACT WORTH KEEPING, which cost a round to learn.** Switching to
a photo that has been visited before RESTORES ITS SNAPSHOT and runs no solve at
all; only a first visit takes the at-open path. A probe that clicks back and
forth between two photos and expects a solve each time gets silence, reads it as
"no trace fired", and starts looking for the wrong bug.

## Targets by hit area, and a durability claim I got backwards, 2026-09-09

**THE PANEL TABS WERE 28px, AND THE RULE THAT SAYS 44 WAS ALREADY THERE.**
`.ptab`'s base rule spends `15px` a side to reach 44 and says so in a comment
citing the accessibility standing rule. The NARROW-WIDTH override cut it to
`7px`. So the touch floor held at every width except the one where the app is
used with a finger — which is the only width it exists for. Twelve tabs at 44px
in the 3-wide grid is four rows and a 196px strip, which left **129px of panel
body on a tall phone and 14px on a short one**: one accessibility failure traded
for another, and it was measured before it was kept. Narrow widths now run FOUR
columns — three rows, 140px, tabs 100x44 at 430px and still 71x44 with no label
clipped at 320px. Against the 28px version it costs 16px of height, not 72.

**AND TWO OF THE THREE "FINDINGS" FROM THE FIRST SWEEP WERE THE INSTRUMENT.**
That sweep measured `getBoundingClientRect()`, which is the wrong quantity:

- **The zoom controls were never under the floor.** Their boxes are 40x40 and
 `#zoomCtl button::before { inset: -3px }` extends the hit area to **45x45** —
 the CSS even carries the comment `/* 44px hit */`. It stood in this file as a
 defect for a whole round on the strength of a box measurement.
- **The range sliders were flagged and are still not measurable this way.** A
 slider's box is its TRACK; the thing a finger has to hit is the THUMB, which
 has no box of its own to read. Flagged as unmeasured, not as passing.

The sweep now probes outward from each edge with `elementFromPoint` until the
point stops resolving to the control, so it measures what a finger actually
gets. **It also has to be scoped to an open dialog:** a modal's backdrop
intercepts `elementFromPoint`, so every control behind it measures as its bare
box and reads as a failure — which is the exact opposite of the truth, since
those controls are deliberately unreachable while a modal is up. With that
fixed, every interactive element clears 44 at 430px and 900px, with and without
each dialog open. One real find came out of the corrected sweep: the ⓘ's tip
link at **41x44**, three pixels short on the axis nobody checks, because a
target is a box and only the height had ever been thought about.

**AND THE DURABILITY CLAIM WAS BACKWARDS.** This file stated that neither engine
honours `durability: "strict"`, inferred from strict and relaxed measuring the
same, and that statement went out in a handover. **`IDBTransaction.durability` is a readonly
attribute that reports the value actually applied, and Chromium reports
`strict` for a strict request and `relaxed` for a relaxed one.** It accepts the
option. Equal timings are equally consistent with the sync being cheap there —
or with the container's filesystem absorbing it — and from inside a browser
those cannot be told apart. The iPad half of the claim was weaker still: it came
from "a per-commit figure beat that device's amortised one", comparing numbers
produced by two DIFFERENT versions of the test, one of which had the
growing-database bug. That comparison was not valid.

**WHAT ACTUALLY SETTLES IT, AND IT IS NOW IN THE REPORT.** An engine that does
not implement the option ignores it SILENTLY — an unimplemented dictionary
member is dropped, with no error and no slower commit — so the feature check is
the answer and the timing never was. `"durability" in IDBTransaction.prototype`
costs nothing: no database opened, nothing written. The report carries it as
**Durable writes**, and says what a "not supported" would MEAN rather than
printing a capability name: that the app asks for confirmed writes, this engine
ignores the request, and a crash in the seconds after a photo is added could
lose it. The device can now answer a question two rounds of timing could not.

**THE GENERAL SHAPE, for the fourth time in one session.** Three claims here
rested on measuring a proxy: a target measured as a box, durability measured as
elapsed time, and an engine's behaviour inferred by comparing two different
instruments' outputs. **Where an interface exposes the thing itself — a hit
test, a `durability` attribute — ask it, and stop timing.**

## Restore depth: two states that disagreed, and three causes, 2026-09-09

Reported from the device as "default-on but has no effect until off/on again".
Reproduced, and it was three separate faults stacked on one control. The walk
did not catch any of them because its assertion presses Aerochrome FIRST and
then reads the sliders — so it was satisfied by the LOOK path while the at-open
path was broken. **A test that reaches the right state by a different route
certifies the route it took, not the one that is failing.**

**1. THE RATCHET FIX WENT TO ONE OF THREE.** `solveLift` resets `tone` to the
default before measuring, with a paragraph explaining why: the creative grade
carries across opens, so measuring a frame that still wears the previous photo's
curve and then deciding "already dark enough" ratchets a whole set down.
**`sky` and `foliage` carry across in exactly the same way and were never
neutralised.** So the saturation tests measured a frame already wearing the
last photo's band boost — reading as satisfied when it was not, and where it did
fire, solving against a boosted measurement. Both bands now start from
`BAND_NEUTRAL` alongside tone, and `liftApplied` records neutral as what
turning it off restores, so the toggle is a round trip in all three.

**2. THE REVERT COMPARED FLOATS THROUGH A CONTROL THAT ROUNDS THEM.**
`removeLift` only puts a value back if it is still what the lift wrote — a good
rule, protecting anything the reader has since moved by hand. It tested string
equality. The lift writes full precision; the sliders have a 0.01 step, and a
value that has been through `syncToUI`/`syncFromUI` comes back rounded. So
`1.6537883727523084` became `1.65`, the test could never match, and **turning
the toggle off left the foliage boost on the frame every time** — the check
meant to protect a hand-made change was reading its own rounding as one. Now a
tolerance of half a slider step: far under any deliberate move, far over the
rounding.

**3. THE AT-OPEN LIFT READ A LOOK THAT THE SAME OPEN WAS ABOUT TO FORGET.**
`activeLook = null` is set further down the open than the lift that reads it. So
opening photo 2 solved WITH colour on the strength of photo 1's look, and every
later press of the toggle — by which time `activeLook` is null — solved the same
frame WITHOUT it. Measured: at open foliage 1.65 and sky 2.00; press off then
on and the colour half vanished. Two states that disagree is precisely what the
report describes. The at-open lift now passes `false`, which is what will be
true of this frame by the end of the same open, so it and the toggle and the
thumbnail solve all agree at every moment.

**AND THE FIX FOR 3 THAT WAS TRIED AND MEASURED WRONG.** The first attempt keyed
the colour half off `params.swapRB` — reasoning, from `solveLift`'s own comment,
that the channel swap is what puts a frame's materials into the sky and foliage
bands and that it persists where `activeLook` does not. **`swapRB` DEFAULTS ON
in this app.** So every bare frame "wore a look" and the band boost fired on all
of them: the sky and foliage sliders both went to their 2.0 ceiling on a first
open with nothing pressed. That is the exact failure `solveLift`'s comment
already records — 44 of 44 practice frames adapted at open — reintroduced by
reading the comment's rationale and missing the default four hundred lines
above. Caught by the bare-frame case, which existed only because the reported
bug forced writing one.

**WHAT IT MEASURES NOW.** Photo 2 opens with the tonal lift and neutral bands;
off reverts all three; on returns to exactly the opened values, foliage
included, differing by 0.00 where it differed by the whole colour half before.
Revisiting a photo twice gives identical values, so there is no ratchet.

**THE BEHAVIOUR CHANGE THIS MAKES, AND IT IS THE OWNER'S CALL.** Switching
photos with a look's grade still on the frame now gives the TONE half only until
the look is pressed again. Before, it gave the colour half at open and then
stripped it on the first toggle press. The new behaviour matches what the UI
already says — the look button reads as nothing selected after a switch — but
the real question underneath is whether `activeLook` should survive a photo
switch within a session at all. It is a design decision, not a defect, and it is
not being made from here.

## The installed app answered three questions at once, 2026-09-09

A report from the app INSTALLED on the home screen, on production, against the
same report from a browser tab an hour earlier. Three differences, all of them
worth having.

- **`persistent: yes — an open session will not be evicted`.** Safari declined
 it for the tab and granted it for the install. That is the documented
 behaviour and it means the request added this morning works end to end: the
 ask, the grant, and a line that says what the answer means. The tab's "no" was
 never a failure of the request.
- **The quota went from 1000 MB to 39322 MB.** The browser-tab ceiling of about
 a hundred raw photos, written into this file earlier today, is a fact about a
 TAB. Installed, it is roughly forty times that. **Any storage estimate has to
 name which of the two it came from or it is not a number about the app.**
- **4053 MB already in use, and nothing could say what of.** An origin-wide
 figure cannot distinguish this app's sessions from its batch-recovery frames
 from its offline caches, and that is the whole question a reader has when the
 number looks large.

**SO THE REPORT COUNTS WHAT THE APP ITSELF IS HOLDING NOW.** A new line: photos
kept in the session store, frames kept in the batch store, and the names of any
other databases on the origin. **Read-only by construction** — it lists the
databases that already exist and opens only those, without a version, so
`onupgradeneeded` cannot fire and a database that does not exist is never
touched. A diagnostic that creates a database in order to report on storage is
changing what it measures, and this one has already shipped one line that
claimed a call it never made. Asserted: on a fresh origin it reads "nothing
kept" and `indexedDB.databases()` is still empty AFTERWARDS; after a real
three-photo session it reads "3 photos" and names no file. It also surfaced a
third store nobody was thinking about — `ips-luts`.

**AND THE SPREAD WAS NOT SURVIVING THE COPY.** The three-sample decode added an
hour earlier printed its runs in the panel's prose, and `Copy the results`
builds its block from the name and value alone — so the pasted report, which is
how these numbers actually travel, carried a median with nothing to judge it
by. The installed run read decode 338 ms against 170 in the worker, and there
was no way to tell whether that was three slow samples or one outlier. Now the
runs go into the copied text as well: `Decoding a raw photo: 79 ms [79 ms, 213
ms, 69 ms]` from a container run, where the median is honest and the outlier is
right there beside it. **A measurement's uncertainty has to survive the copy or
it is not part of the measurement.**

**ONE MORE THING THAT RUN EXPOSED.** In the installed app the background decode
was TWICE AS FAST as the main thread (170 against 338), where the tab had them
within a tenth of each other. The panel used to have two verdicts — slower, or
about the same — and no wording for faster, so it would have said "about the
same" about a 2x gap. It now names the third case and says what it means: the
main thread was busy with something else, not that the copy across is free.

## Three runs of one build, and all three faults were in the instrument, 2026-09-09

Three device reports pasted back to back on the same staging build. Two of them
were byte-identical in the report block — including the `Taken` line and the
storage figure — with different speed numbers underneath. That pair is the
finding: **the report was built once at page load and never again**, while the
speed tests could be re-run indefinitely, and "Copy the results" concatenates
the two. So a pasted block carried a timestamp and a storage reading that did
not belong to its own measurements. The report is now re-taken at the start of
every run, so the whole block is one moment. Asserted: three `Taken` stamps,
all different, across load and two runs.

**AND IT WAS CLAIMING AN ASK IT NEVER MADE.** The Storage line read "the app
asked and this browser declined". On the TEST PAGE nothing has opened a photo,
so `requestPersistence()` — which fires from `addPhoto` — has never run there,
and the line was reporting a call that had not happened. It reads "this browser
has not granted it" now. The general fault: **a reporter must state what it can
observe, and `navigator.storage.persisted()` observes the browser's answer, not
whether anyone asked.** Two facts, one of them not in evidence.

**THE DECODE NUMBER WAS A SINGLE SHOT AND MOVED 3.8x.** Across those three runs
on one device: 50, 60, 191 ms. Readback held at 11-12 ms and storage at 9-17 in
the same three, so the noise is decode's alone — thermal, or another app on the
device. A lone number with that spread is worse than useless because it invites
a conclusion it cannot support. Now three timed decodes after an untimed
warm-up, median reported, **and every sample printed beside it** so a reader can
see the spread rather than take the median on trust. Container: 81 ms from
81/89/79.

**AND THE TEST WAS WRITING 48 MB TO THE DEVICE PER RUN.** Four runs of two
durability modes at 6 MB. The reported storage use went 60 MB to 109 across one
run and did not come back down, even though the throwaway database is deleted —
Safari's estimate is lagging rather than the data surviving, but a diagnostic
that inflates the number it also reports is its own problem. Down to three runs
of each, 36 MB, which still gives a median and a visible spread.

**WHAT THE THREE RUNS ACTUALLY SETTLED, AS DATA.** Readback 11, 12, 11 ms —
stable, small, and the histogram question is closed. Storage 17, 12, 9 ms per
6 MB and falling, which with the strict-equals-relaxed finding means the engine
is accepting rather than syncing. `persistent: no` in all three: Safari declined
for a browser tab, which is its documented behaviour and is why the line names
the home-screen install as the way out.

**THE SHAPE, AGAIN.** Every fault this round was in the measuring, not the
thing measured — a stale timestamp, an unobserved claim, a single sample, and a
side effect on the quantity being reported. That is four for four, and it is the
same lesson the deploy checks taught earlier today: **the instrument is the part
nobody tests.** What caught all four was one cheap habit — running it three
times and reading the results side by side.

## The session was never asking to be kept, and the search said it was, 2026-09-09

`persistent: no` on the device report, so the ask was added: `requestPersistence()`
in `session.ts`, memoised per page load, fired from `addPhoto` — the first moment
the app commits the reader's own data is the honest moment to ask for it to be
kept — and deliberately NOT awaited, so a refusal cannot delay a write.

**AND THE CLAIM THAT PROMPTED IT WAS HALF WRONG.** The previous entry said
nothing in `src/` had ever called `navigator.storage.persist()`. It had:
`main.ts` has asked before every batch run since the batch path was built. The
search that missed it looked for `storage.persist`, with a literal dot; the code
reads `storage?.persist?.()`. **A pattern that assumes the punctuation reports
the code absent from a tree it is in** — the same shape as the hub's §250, where
a search that never ran reported nothing found, and it landed in the owner's
report as a fact. The finding underneath survived: the BATCH path asked and the
SESSION path did not, for as long as sessions have existed, and the session path
is the one that copies every original to storage.

**SO THERE WERE TWO IMPLEMENTATIONS, WHICH IS THE ACTUAL DEFECT.** Two asks that
did not know about each other; a probe counting calls to `navigator.storage.persist`
saw two for a two-photo set. `main.ts`'s `requestPersistentStorage` now delegates
to the one in `session.ts`, so the batch and the session share a single memoised
ask.

**WHAT WAS MEASURED.** A spy on `navigator.storage.persist`: zero calls for
merely opening the page (asking on a page view is asking before there is
anything to keep), exactly one for a two-photo set. That test FAILED FIRST at
two calls, which is what found the duplicate — it was written to check the
memoisation and caught the second implementation instead.

**AND THE REPORT SAYS WHAT THE ANSWER MEANS.** A bare `persistent: no` is half
an answer: the seven-day rule applies to a browser tab and a home-screen install
is exempt, so the two facts have to be read together. The Storage line now reads
`persistent: no — the app asked and this browser declined; a session left
unopened for about a week may be cleared. Installing it to the home screen is
exempt from that.` Granted, it reads `persistent: yes — an open session will not
be evicted`. Both branches asserted against a stubbed `navigator.storage`, and
the wording changes when the app is already installed, since telling somebody to
install an app they are running is noise.

**NOT CLAIMED:** that this makes a session safe. No browser is obliged to grant
it, Safari decides silently on its own heuristics, and this repo already knew a
neighbouring thing — `batchstore.ts`'s header records that large IDB values go
to a lazily-flushed sidecar that `durability: "strict"` does not cover. The ask
is free and the report is honest about the outcome; that is the whole claim.

## The version number became a way in, 2026-09-09

The GL-stall entry below ends on "what would settle it is a measurement on the
device, and this repo has no way to take one." It has one now. Two surfaces,
both reached from the version number in the editor's own chrome, which until
this release was a dead label.

**THE REPORT (Doctrine §7f).** Pressing the version opens a dialog holding a
plain-text report and a Copy button. It carries what the browser's own
identification HIDES, which is the whole reason it is worth having: iPadOS
Safari in desktop mode reports its platform as `MacIntel`, so the report does
not print the platform and leave the reading to whoever gets it — it states the
conclusion. A `MacIntel` with touch points reads "iPad or iPhone — it says
MacIntel, but 5 touch points means it is not a Mac"; a `MacIntel` with none
reads "Mac". Verified against a spoofed navigator in all three shapes. Beyond
that: whether it is running installed or in a browser tab, screen and window
size with the device pixel ratio, memory hint, cores, the WebGL2 renderer with
max texture size and float-buffer support, the service worker's state including
whether an update is WAITING, storage used against quota and whether it is
persistent, theme and palette, reduced motion, language, and whether a photo is
open.

**NOTHING THE READER WROTE IS IN IT.** A session appears as a count — "a photo
is open in a session of 4" — never a filename, never metadata, never an edit
value. That is asserted rather than promised: the walk opens a named practice
file and greps the built report for its name. Copy falls back to selecting the
text when the clipboard is refused, rather than a button that looks like it
worked and did not.

**AND THERE ARE TWO WAYS IN, NOT TWO REPORTS.** The version number is where it
lives; nobody with a problem thinks to press a version number, and the ⓘ is
where they look. So the ⓘ's Settings section carries a row — "Something's wrong
— the report to send" — that closes the ⓘ and opens the same dialog. One
builder, one dialog, two entry points; a second copy of the report is how the
two drift. Doctrine §7e wants "how to report a problem" in the ⓘ and this is it.

**THE TEST PAGE.** The same dialog links to `/debug.html`, a page in the app
that MEASURES what the device can do rather than describing it. Five numbers,
each printed with a sentence saying what it means and what would be normal:
handing a frame to the graphics chip, reading a frame back, decoding a raw
photo on the main thread, the same decode in the background worker, and storage
write speed in MB per second. It is a page rather than a panel because it runs
work that takes seconds and wants room to print its reasoning.

**THE READBACK LINE EXISTS BECAUSE OF THE ENTRY BELOW.** "Reading a frame back"
is the exact operation the histogram forces on every redraw, and the one this
harness proved it cannot size honestly — 189 ms here under SwiftShader, where
the cost is software rasterisation being waited on rather than the readback
itself. On the iPad that number is either small or it is the stall, and now the
device can say which without anybody guessing from a CPU rasteriser.

**MEASURED HERE (headless Chromium, SwiftShader — a floor, not the device):**
frame render queued 0.0 ms, readback 189 ms, raw decode 56 ms on the main
thread against 69 ms in the worker.

**AND THEN ON THE REAL iPAD, WHICH IS WHY IT EXISTS.** Safari 26.6.1, Apple GPU,
8 cores, max texture 16384px (twice the harness's 8192 — a full-resolution frame
fits in one texture on the device and did not here), storage quota 1000 MB,
cache `ips-2.10` confirming the release stamp.

- **Reading a frame back: 11 ms.** The harness said 189 and could not size it.
 **The histogram's forced readback is not a stall on this device and no
 optimisation is warranted** — the entry below asked exactly this question and
 the device has now answered it. The 991 ms to 266 ms figure in the earlier
 set-open work was software-renderer time being waited on, as suspected.
- **Decode 70 ms on the main thread, 62 ms in the worker.** On the harness the
 worker cost about a fifth in overhead; on the device it is FASTER. The
 set-open rewrite's trade — give up a little decode speed to keep the main
 thread — turns out to cost nothing at all here.
- **Frame render queued 0.0 ms**, as expected: it only queues.

**AND THE STORAGE NUMBER WAS THE TEST LYING, IN THE INSTRUMENT BUILT TO STOP
THAT — THREE VERSIONS, TWO OF THEM WRONG.** Written out because the same fault
recurred one level down each time, and the second version's correction was
written into this file as a measurement before the third version found it was
mostly an artefact.

- **v1 — the wrong shape.** Wrote 8 MB in ONE strict-durability transaction and
 reported throughput: 54 MB per second on the container, 156.9 on the iPad.
 `session.ts` commits **one strict transaction PER PHOTO**, so a single large
 commit amortises away the exact cost set-open pays. The sentence printed under
 the number then used it to predict a forty-photo set in a fraction of a
 minute. **A number under a sentence the number cannot support is worse than no
 number.**
- **v2 — the right shape, contaminated.** Four separate 6 MB strict commits,
 median reported. It never emptied the store between runs, so every commit
 wrote into a bigger database: **88, 273, 423, 611 ms** across four runs, which
 is the store growing rather than the device. Worse, the two durability modes
 were INTERLEAVED, so the second mode always ran on a larger store than the
 first — and "unconfirmed" duly came out slower than "confirmed", which cannot
 happen if the flag means anything. The 252 ms / 24 MB-per-second figure this
 file carried as v2's validation was mostly that artefact, not amortisation.
- **v3 — what it does now.** Empties the store before every timed commit and
 does not time the emptying; alternates which mode goes first run to run; runs
 BOTH modes and prints both. Container: **strict 94, 120, 137, 152 ms · relaxed
 113, 120, 152, 146 ms** — medians 128 against 133, and flat rather than
 climbing.

**AND THE FINDING THAT CAME OUT OF ASKING TWICE: NEITHER ENGINE HONOURS THE
FLAG.** Chromium in this container returns the same time for `durability:
"strict"` and `"relaxed"` (128 against 133 ms), and the iPad's 18 ms for 6 MB —
a per-commit figure BEATING that same device's amortised one, which is
impossible if the commit waits on the disk — says the same thing. So the number
is **how fast the engine accepts the data, not how fast it is safely on the
device**, and the panel now says so in those words. That matters because the
whole reason `session.ts` asks for strict is that a set must survive a crash.

**THE RIG WAS MADE TO PROVE IT COULD SEE A DIFFERENCE BEFORE THAT WAS BELIEVED.**
An instrument returning "these two are the same" is indistinguishable from one
that cannot tell anything apart. Same code shape, one known difference — 6 MB
against 12 MB in one commit — read 154 ms against 386, a ratio of 2.51. It has
resolution, so the equality is a measurement.

**WHAT THIS LEAVES OPEN, DELIBERATELY UNSETTLED.** This file's set-open
breakdown two hundred lines above attributes ~300-450 ms per photo to waiting on
the strict-durability commit. If no engine is actually syncing, that attribution
needs re-examining — but it came from instrumenting the APP over real practice
DNGs, not from this test, and the two are not measuring the same thing. Recorded
as a tension to resolve with a measurement, not as a correction.

**THE ONE FINDING THE REPORT ITSELF SURFACED: `persistent: no`.** Opening a set
copies every original into storage so the set survives a reload, and that copy
sits in evictable storage; WebKit clears script-writable storage after seven days
of Safari use without interaction with the site, and a home-screen install is
exempt where a browser tab is not. Not fixed in this release — it is a product
change and this one is at the gate. See the next entry for what it turned out
to be, including the part of this paragraph that was wrong when it was written.

**VERIFIED.** Version control is a real `<button>` at 53x44 with
`aria-haspopup="dialog"` — it shipped as a 204px-wide `<span>` that the Home
button was intercepting clicks on, found by the walk and fixed by giving it
`display: inline-flex; width: auto`. axe clean with the dialog open, and clean
on the test page in both themes.

**AND THE SAME MISS AGAIN, CAUGHT THE SAME WAY.** axe does not measure target
size, so the dialog went out at axe-0 with Copy and Close both **34px** tall —
the app's generic dialog button, which is comfortable under a mouse and short
of the finger floor. Measured at 430px and 900px wide, on every control of both
new surfaces, which is the check that found it. Raised to 44px scoped to
`#verDlg` rather than globally: every other dialog's buttons are a measured,
shipped surface and are not being churned from here. This is the third time a
control has shipped under 44px with a clean a11y run — `.toggle.full-btn` at
34px and the version tag at 204x0-effective were the other two. **The target
sweep is now part of the a11y walk**: every interactive element on the page, at
430px and 900px, measured against the floor.

**AND THE FIRST RUN OF IT FOUND A STANDING DEBT — NOT FIXED, NOT IN THIS
RELEASE.** Nothing new is under the floor. What is, and has been:

- **Zoom in / out / fit: 40x40** at both widths. Four pixels short, three
  controls, and they sit over the photo where a thumb lands.
- **Every panel tab: 134x28** at 430px wide — Basic, Infrared, Black & white,
  Colour, Tone, Masks, Export, Corrections, Crop, Grade, Stickers, Warp. These
  are the app's primary navigation and they are 28px tall on a phone.
- **Every range slider reports 28px tall** — exposure, the three white-balance
  gains, recover, denoise, sharpen, texture. **Treat this one as unmeasured
  rather than as a failure:** the bounding box of an `<input type=range>` is its
  TRACK, and the thing a finger has to hit is the THUMB, which the sweep cannot
  see. SC 2.5.8 is about the thumb. Sizing that needs a different instrument.

The first two are real and are a capability item of their own — raising a
primary navigation strip from 28px to 44px changes the panel's layout at every
width and is not something to fold into a release about a diagnostic. Recorded
here so it stops being rediscovered. The full journey walk still passes end to end
with no page errors. `debug.html` reaches the service-worker precache list, so
the test page works offline like the rest of the app.


## The "800 ms GL stall" is the software renderer, 2026-09-09

Chased the last open item. **Nothing shipped, and the honest answer is that this
harness cannot measure it.** Recorded so it is not chased again from here.

**IT WAS NEVER A GL PROGRAM.** The original attribution came from a V8 sampling
profile showing `(program)` at 996 ms of self time, read as "GL program setup".
`(program)` is V8's bucket for time not attributable to a JS frame. It has
nothing to do with a shader program. Measured directly: link and compile take
**19 ms** at page load, the texture upload 79 ms, and the draws 0 ms each with
`gl.finish()` forcing completion.

**WHAT THE LONG TASK ACTUALLY IS.** Aggregating the samples INSIDE the 974 ms
task by call STACK rather than by flat self time: 69% is
`readPixels <- histogram`. Timed at the call site, one histogram pass on a
220x146 offscreen buffer reads back in **864 ms** on the first photo and 627 ms
on the second — absurd for 32k pixels, which is the signal to distrust the
reading. `renderOffscreen` reports 0 ms because it only QUEUES the draw;
`readPixels` is the synchronisation point where all queued GPU work is finally
waited on.

**AND THE READBACK IS NOT THE COST — IT IS THE MESSENGER.** Dragging the
saturation slider with the histogram ON: 12 readbacks, 6.6 s of readback, worst
frame 579 ms. With the histogram OFF: no readbacks at all, wall time 6745 ms
against 6948 ms, worst frame 591 ms. **Turning it off changed nothing.** The
~550 ms per frame is SwiftShader shading a full-resolution frame in software.
readPixels was waiting for work that happens either way.

**SO THE NUMBER DOES NOT TRANSFER.** Everything here is a CPU rasteriser. On
real GPU hardware that shading is a small fraction of it, and there may be no
perceptible stall at all. **This harness cannot answer whether the iPad has one**
and no optimisation should be shipped on the strength of it. What IS portable is
the code shape: a synchronous GPU readback happens on every draw while the
histogram is visible, and the histogram is ON by default. A sync readback is a
known hitch on tile-based mobile GPUs — but "known to be a hitch in general" is
not a measurement of this app on that device, and the two must not be conflated.

**THE EARLIER FIX STANDS, for a smaller reason than was claimed.** Skipping the
histogram while a set loads still removes N forced flushes at a moment nobody is
looking at the histogram, and the main-thread time did drop. But the headline
991 ms to 266 ms was software-renderer time being waited on, not a cost the iPad
necessarily pays.

**WHAT WOULD SETTLE IT** is a measurement on the device, and this repo has no
way to take one: it carries no diagnostic report at all (Doctrine §7f — the hub's
per-app list has this app owing every one of the baseline surfaces, and that gap
was noticed earlier in this session and not reported at the time). A perf line in
a diagnostic would answer this and several other questions that currently end in
"needs the owner's hands".

## Saturation clipping: measured, mis-sized, and NOT fixed, 2026-09-09

Owner asked for the clipping flagged earlier to be fixed. **It was measured
instead, and the finding is that the alarm was wrong by an order of magnitude
and the change built for it does not earn its place. Nothing shipped.** Recorded
so nobody re-opens it from the same bad signal.

**WHERE THE BAD SIGNAL CAME FROM.** The original observation was that HSV
saturation at the 90th percentile reached 1.000 on the strongest frames, read as
"a tenth of the pixels at full chroma, detail being destroyed". HSV S is
(max - min) / max, so **S = 1 means only that the smallest channel is zero** —
which is the ordinary state of any deep shadow. It was counting shadow as damage.

**WHAT THE NUMBERS ACTUALLY ARE.** With Aerochrome across the 44 practice
frames: 14.9% of pixels have a channel at zero, but only **8% of those are
bright**. Real out-of-gamut damage — a BRIGHT pixel with a channel clamped to
zero — averages **1.22% of the frame**, worst about 6%, and exceeds 1% on 13 of
44 frames. Not a tenth of the picture; roughly a hundredth.

**THE FIX THAT WAS BUILT AND THROWN AWAY.** A soft chroma limit at the
saturation stage: bound the scale by the largest one that keeps every channel at
or above zero, approached through a hyperbolic knee (division only, so the
shader and pipeline.ts stay inside the parity bar) with the top end left alone
since only 1.9% of pixels reach full white. It is correct and it does almost
nothing: bright-and-clipped went **1.27% to 1.22%**. Changing how every photo in
every look renders, for four hundredths of a percentage point, is the wrong
trade. Reverted; the tree is identical to what shipped.

**AND THE SOURCE IS NOT ONE STAGE.** Tracing the four worst frames: one goes
from 0% with no look to 6.07% with Aerochrome, so the look makes it; another is
already at 5.92% before any look at all; and Restore depth REDUCES it on two
frames while causing all 4% of it on a third. There is no single culprit to fix,
because this is the ordinary consequence of pushing saturated infrared colour
through a bounded output gamut.

**THE LESSON, and it is the third time this session.** A statistic that looks
alarming is not a finding until you know what it is counting. The sky mask's
"found on 43 of 44" meant something other than over-reporting; the thumbnail
overlay's frame-wide tint was a feather; and p90 saturation of 1.0 was shadow.
Each time the shape of the error was the same: a proxy measurement read as the
thing itself.

## Fixing the sky mask's gradient under-selection, 2026-09-09

Owner go on the finding above. **Two wrong diagnoses were made and measured out
of the way before the real one; both are recorded because the reasoning that
produced them looked sound.**

**WRONG ONE.** "The final selection pass re-tests every filled pixel against the
seed median with no adjacency allowance, so the fill reaches the lower sky and
the last step throws it away." Re-reading the loop: it opens `if (mask[p])
continue`. It SKIPS filled pixels — it is the hole fill for sky glimpsed through
branches, not a re-test. Nothing the fill finds is ever discarded.

**WRONG TWO.** Sky colour is far more stable than sky luminance, so the fill's
model-luminance bound was widened in proportion to how well a pixel's colour sat
on the learned cluster. It is a sound argument and it moved 17 of 44 frames — but
the frame with the actual problem went 14% to 15%. Luminance was not its limiter.

**THE MEASUREMENT THAT SETTLED IT** was instrumenting the fill to count its
frontier rejections by cause. On the two frames that behave, the fill stops at
EDGES (90% and 98% of rejections) — it is halting at the treeline, exactly right.
On the frame that under-selects, the split is model 38% / edge 33% / chroma 29%,
with nothing dominant: by the horizon that sky has genuinely left the seed
cluster on BOTH axes at once. No single bound was going to fix it, which is why
both earlier attempts were reasonable and both were wrong.

**THE FIX IS TO RE-FIT THE MODEL TO THE SKY ACTUALLY FOUND.** The model is
learned from a strip 6% deep at the top of the frame, and a big sky is not that
strip. So the fill now runs twice: once from the seed model, then the model is
re-estimated (same robust median + MAD, sampled at 20k points) from everything
the first pass selected, and the fill continues from that whole frontier. Two
passes, not a loop — one re-fit lets a gradient be described, an unbounded chain
would let the cluster walk into the foliage a small step at a time.

MEASURED over all 44 practice frames, and the numbers are not the point on their
own — the masks were rendered and looked at. The frame the report was about goes
14% to 25%, and its teal now reaches the treeline instead of stopping in open sky
halfway down. The largest gain is 25% to 45% on a cloud-filled sky, fully
selected with the trees correctly excluded. 36 frames gain, 8 are unchanged, and
four move DOWN by 1 to 3 points, which is the refit tightening a cluster the
first pass had let drift. **The frame with no sky still selects nothing and still
says so** — that was the regression to fear and it did not happen.

COST: the second pass roughly doubles generation. 91-235 ms on the press, median
165 ms, synchronous. Acceptable for a control that is pressed deliberately;
worth knowing if it is ever moved somewhere automatic.

## The sky mask, looked at properly, 2026-09-09

Followed up on the earlier observation that buildSkyMask reported found=true on
43 of 44 practice frames. The app's own mask path was driven over every frame
and several were rendered and looked at. **The hypothesis going in — that it
over-reports and tells the reader it found a sky when it has not — was WRONG,
and the measurements say so.**

**NO FALSE POSITIVES FOUND.** The one frame in the set with genuinely no sky
reports "No clear sky found" and selects nothing. A frame with only a sliver of
sky behind a treeline selects exactly that sliver and reports 5%, which is
right. Rendered mask overlays confirm the selected region is sky in every frame
looked at.

**WHAT IS REAL IS UNDER-SELECTION ON A DEEP GRADIENT SKY.** On the frame with
the largest open sky in the set, the default catches roughly the top half and
leaves a broad band of plainly visible sky unselected, reporting 14%. The cause
is a genuine inconsistency inside the algorithm: the flood-fill carries an
adjacent-luma test specifically so it CAN walk down a gradient, and then the
final selection pass re-tests every filled pixel against the seed median with no
adjacency allowance — so the fill reaches the lower sky and the last step throws
it away. Reach recovers it progressively and covers the whole sky at 2.0
(coverage 14 to 23% at the reported threshold). The control works; the DEFAULT
is conservative on this class of frame. Retuning a shipped detector is a taste
call and was not made here.

**`found` COULD NOT SAY NO.** It was a literal `true` at the end of the
function, decided a hundred lines earlier by the seed test alone — "at least a
tenth of the top band is smooth" — so a frame whose top edge held any smooth
patch reported a sky found however little the fill went on to select, including
nothing. Its own doc comment promised the opposite. Nothing read it, which is
why no reader was ever misled: regenerateSkyMask takes only `.mask`, and the
status line recomputes coverage off the bitmap. Now computed from actual
coverage against SKY_MIN_COVERAGE, which the status line imports so the flag and
the words cannot disagree. No user-visible change — re-measured across all 44,
identical results.

**AND AN INSTRUMENT ERROR WORTH KEEPING.** The mask overlay renders as
`mix(outside, inside, cov)` at the mask's CONTINUOUS weight, so a feathered edge
tints a wide area faintly. At Reach 2 that made the whole frame look tinted and
it was nearly written up as "the mask bleeds across the entire picture".
Measured instead: 42% of texels carry any weight at all against 23% above the
reported half-weight threshold. A feather doing what a feather does. **The
reported percentage does count only texels above half weight while roughly twice
that area is touched to some degree — defensible, and worth knowing when the
number reads lower than the effect looks.**

## Batch and Quick look had no lesson at all, 2026-09-10

**Every other lesson works inside a panel TAB, and these two are top-bar actions
with no tab of their own** — which is exactly how they fell out of a tutorial
that is otherwise complete. Structure decided coverage, and nothing noticed.

Lesson 11, "A whole folder at once", covers both, because a reader meets them
together: look through a folder, then develop it. Its tab is `export`, since
that is where the Format and Resolution a batch actually writes with live — and
opening the lesson takes you there, which is the point of the tab field.

Six steps: Quick look shows and keeps nothing; Keep in a session carries the
pictures through without developing them twice; Batch develops unattended to one
.zip and asks first what goes on every photo; each photo is still balanced on
its own with the look on top, so it suits a shoot in one style; the .zip uses
this tab's Format and Resolution; and nothing is lost if a run stops.

**Measured, not assumed:** 11 chips render, the last reads "A whole folder at
once", pressing it shows six steps naming both features and switches the panel
to Export.

**A finding NOT fixed, recorded with its number.** The lesson chips are 34px
boxes with a `::before` expander at `inset: -5px 0`, which should give 44. The
real hit area through the centre measures **41px**, three short of this app's own
floor, and the shortfall is upward only — the rail is 75px with overflow
visible, so it is not clipping; something above it takes those pixels. Widening
the inset to -6px changed nothing, so that edit was reverted rather than left in
as noise. Pre-existing on all eleven chips, and it needs the overlapping element
found rather than another guess at the expander.

## The manual had not kept up with the app, 2026-09-10

**Audited rather than eyeballed.** Every labelled control on the editing surface
(158 of them) against the text of the Help and info dialogs. Help was in better
shape than expected — 21k characters, sixteen sections, and nearly every feature
named — so the gaps were specific rather than general.

**Restore depth appeared in Help exactly once**, inside the double-tap-a-slider
bullet, and was never explained: not what it does, not that it is ON by default,
not why it has a Strength slider, and not that it re-solves on every look. It
was also missing from the Quick start sentence that lists what happens when a
photo opens, even though it IS one of those automatics. **Recover highlights**
was named only inside that same parenthetical, never as the slider it is. The
**Red/Green/Blue gain** sliders — the manual white balance, and the reason this
app exists at all, since infrared needs a balance outside the visible-light
range — were named nowhere.

**The panel copy was fine.** Each of those controls carries a good note beside
it, and Restore depth has a "Why a photo needs it" expander. The manual was what
had not kept up: a reader who goes to Help to LEARN the app rather than to
identify a control in front of them found nothing.

**The ten in-app lessons mentioned none of it either** — no Restore depth, no
Recover highlights, no double-tap-to-reset. Lesson 1 now covers the reset
convention and why tapping a blown highlight is refused; Lesson 2 covers Restore
depth beside the looks, since that is when it re-solves, and why the bare swap
goes flat and purple.

**Verified rendered, not just written:** Help opens, is 20.8k characters, names
all three, and does not scroll sideways at 900px.

**Worth keeping: the audit was cheap and the impression was wrong in both
directions.** The naive pass flagged 75 controls as undocumented, most of them
false — transient banners, and substring matching that missed a synonym. The
useful version listed Help's own sections and asked which FEATURES were named,
which found three real gaps in a document that looked complete.

## Real JPEGs found the half of that fix a synthetic could not, 2026-09-10

Five real camera-rendered infrared JPEGs arrived for testing, and the first run
against them failed on something the synthetic frame was structurally incapable
of showing.

**Giving the look a white balance was only half of it.** A camera-rendered file
opens at `exposure = 1` because it opens as the camera made it. Gray-world
balancing an infrared frame pulls the flooded red channel down hard — so
substituting a balance without re-deriving exposure just makes the picture dark.
Measured on NIR_2810-2812: mean 83/59/156 as opened, **35/35/32** after a look.
Nearly black and nearly grey.

`makeThumb` has always done both together, which is exactly why the tile looked
right while the photo did not — the same asymmetry as the white balance itself,
one line further down. `applyLook` now derives exposure alongside the balance it
substitutes.

**After:** Aerochrome 110/106/112, Goldie 132/105/32, Aero Red 132/81/34; and the
view-to-thumbnail chroma gap falls to 3.0, 7.6 and 3.6 from 13.1, 51.8 and 55.0.

**And the synthetic could not have caught it.** A single-hue test frame is made
neutral by gray-world BY CONSTRUCTION, so there is nothing left to darken. The
whole defect lives in the gap between a flat test colour and a photograph.

**One assertion of mine was measuring the wrong quantity, again.** It failed
Aerochrome for making the photo "less colourful than it opened" — chroma 25.5
against 97.2. But an unedited IR JPEG is a heavy UNIFORM purple cast: high
chroma, one hue, no separation at all. Counting 30-degree hue buckets holding a
real share of saturated pixels:

- as opened — chroma 97.2, **1 bucket**
- Aerochrome — chroma 25.5, **4 buckets**
- Goldie — chroma 100.7, 3 buckets
- Aero Red — chroma 99.1, 2 buckets

So the look with the LOWEST chroma produces the MOST colour separation, which is
precisely what the channel-swap copy says a look does. Chroma cannot tell a cast
from false colour; hue spread can.

## A look on a camera-rendered file had no white balance to work on, 2026-09-10

**Reported first as "the thumbnail fix only affects jpg, not nef", then — with a
screenshot — as "the jpg thumbnail looks good but the image itself didn't
match". The second reading is the right one, and it inverts the first.**

`establishFreshEdit` sets white balance BY FILE KIND: a raw gets
`grayWorldWB(src)`, a camera-rendered file gets `params.wb = [1, 1, 1]`. That
second branch is deliberate — JPEG/HEIC/PNG open as the camera made them. But
`makeThumb` has always gray-world balanced EVERY file. So for a camera-rendered
photo the two paths disagree by construction: the tile gets a real balance and
the open view gets none.

That is why the view went flat purple. Aerochrome carries no `wbBias`, so on a
JPEG the look resolved to exactly `[1,1,1]` — the channel swap applied to
channels nothing had pulled apart, which is the bare-swap appearance. A raw
showed nothing wrong because there both paths already agreed.

**The fix is in the OPEN path, not the thumbnail.** `applyLook` now takes
gray-world as the base for a camera-rendered file — but only when the balance
underneath is still the untouched open, so a balance the reader set by tapping
foliage or moving the gains is theirs and is kept.

**And the first version of that fix silently never ran.** The "is it untouched"
test compared the base against 1 with a 1e-6 tolerance. `establishFreshEdit`
deliberately round-trips its measurements through `syncToUI`/`syncFromUI`, so
`params.wb` holds what a STEPPED gain slider can represent rather than a clean
1 — and nothing ever matched. It is the same fault this file already carries two
notes about, one of them in the very function that causes it: a full-precision
value written to a stepped control does not come back. The tolerance is one
slider step now.

**Measured, gain sliders (585 = neutral):** at open 585/585/585. Before, after
Aerochrome still 585/585/585 and after Goldie 548/615/635 — bias only, no
balance. After, Aerochrome 337/604/693 and Goldie 300/634/743. View-to-thumbnail
chroma gap on a camera-rendered frame under Aerochrome: 173.6 before, 9.7 after.

**Two of my own measurements were worthless on the way and both flattered a
wrong theory.** Mean RGB was used to judge "is the view flat" — a mean CANCELS
opposing hues and reports a vivid false-colour frame as neutral, so chroma is
the only honest measure. And the synthetic test frame was a single hue, which
gray-world balances to exactly grey by construction, so an absolute "the view
must be colourful" bar was measuring the test image rather than the app.

## Thumbnails showed Aerochrome whichever look was picked, 2026-09-10

**Reported on device.** The cause is one line and the reason it looked
look-specific is the LOOKS table.

`applyLook` bakes a look's WB bias INTO `params.wb` (dividing the previous one
out, so switching looks replaces rather than compounds). `makeThumb` then
replaced `params.wb` wholesale with the photo's own `grayWorldWB(img)` — which
threw the bias away. Every look's tiles therefore shared one neutral white
balance.

**Why only some looks looked broken.** `aero`, `goldie` and `red` have
IDENTICAL `swapRB` and `hue`; they differ almost entirely by `wbBias` — goldie
`[0.78, 1.22, 1.4]`, red `[0.78, 1.02, 1.35]`, aero none at all. Strip the bias
and all three collapse into Aerochrome. `natural`, `mono`, `sepia` and `hie`
differ by swap, sat or tint, which survived, so those tiles did change and the
defect read as "goldie doesn't work" rather than "the WB bias is dropped".

**Fix:** multiply `lookBias` onto the thumbnail's gray-world WB, the same
multiply `batchParamsFor` already does for a built-in look.

**Measured, with a control:** across Aerochrome to Goldie the main view moves 38
and the thumbnails move 213. With the bias dropped, as shipped, the view still
moves 38 and the thumbnails move 5.

## The drop-to-open offer could not be escaped, 2026-09-10

**Caught on device**: dragging with a mouse from the strip raised the
drop-to-open offer with no way out. Three faults, each of which alone could
strand it, all in code added earlier the same day:

- the strip's tiles are BUTTONS, but each contains an `<img>`, which is natively
  draggable — so a mouse drag along the ribbon started a native image drag
  instead of scrolling
- an in-page drag was treated like a file arriving
- only `dragleave` and `drop` could take the offer down, and neither fires when a
  drag is simply abandoned — so the full-screen scrim stayed up

Also wrong: `dragleave` had no Files guard while `dragenter` did, so it
decremented the counter on drags that had never incremented it.

**Fixed:** `dragstart` marks an in-page drag and every drag handler ignores it;
`dragend` and window `blur` both clear; `dragleave` is guarded like the rest;
tiles carry `draggable = false` in JS as well as `-webkit-user-drag: none` in
CSS, because that property is not universal.

**The control was PRODUCTION**, which is the build that stranded it: tile image
`draggable=true`, and an abandoned file drag leaves the offer showing. Both
assertions pass on the fix.

**And one test failure that was not a defect.** The walk asserted a dropped file
opens, and it did not — because a session of three was open and the app
correctly ASKS whether to add to it or start a new one, and the test never
answered. The app was right; the test was driving half a flow.

## The geometry view is full-bleed — the pilot, not the whole idea, 2026-09-10

**Three roadmap items looked like one piece and are not.** "Full-bleed
alignment view" says in its own text that it is SUBSUMED by the crop item. "Big
image: the photo fills the app" says STILL AN IDEA, lists five open design
questions, and says plainly not to guess them because they are the owner's taste
calls — and instructs that the crop overflow view ships FIRST as the pilot that
proves the model. So the piece that was buildable is the geometry view, and the
whole-app generalisation was not, and reading the entries was what separated
them.

**What shipped.** With a geometry tool armed: `#view` reaches the top and both
side edges (safe-area insets only), `border-radius: 0`, and `#stage` drops its
12px gutter. The bottom keeps the crop pill's measured reserve.

**Measured at 820x1180 and 430x900, with a negative control on the old CSS:**

- fills 100% of the width, against 93% and 90% before
- side gaps 0, against 30px and 22px
- border-radius 0px, against 8px — that rounded rect is what cut the black
  wedges off a tilted photo's corners, which was the alignment item's whole
  complaint
- all four crop handles still grabbable, at both sizes, in both builds

**One assertion of mine was wrong and the measurement caught it.** The first
version demanded no top gap and failed at 303px. That gap is CENTRING: a 3:1
test ramp in a portrait stage cannot fill both axes under contain semantics, and
`margin: auto` centres it. The right question is not "is there a gap" but "is
the gap symmetric" — an inset frames, centring does not. It now asserts the
canvas fills one axis, that the side gaps match each other, and that top and
bottom differ (because only the bottom may reserve room for the pill).

**Left open on purpose, and recorded in the roadmap entry rather than here:**
whether the pill floats over the photo and passes taps through. That is one of
the owner's five questions, and answering it by guessing would have spent the
pilot's whole purpose.

## The update strip's buttons went monitor-wide on ONE of three apps, 2026-09-10

**Caught on device, hours after it shipped to production**: the update offer
appeared with two stacked, monitor-wide buttons. Measured at 1600px on all three
pages: Infrared 1568x44 each and stacked; Macro and the chooser 101x44 and 80x44
side by side. Only Infrared.

**Cause.** `style.css` carries `select, button { width: 100% }` — panel controls
are full-width there BY DESIGN, which is why `.bar-btn` spells out `width: auto`
right beside its comment about touch targets. The shared `swstrip.css` set
`flex: none`, which says nothing about width, so the base rule won unopposed.
Macro and the chooser have no such base, so they looked correct and hid it.

**The lesson underneath the fix, which is about the good decision, not a bad
one.** Putting the strip's look in ONE shared file was right — three stylesheets
would have carried three copies. But a shared component lands on three DIFFERENT
base layers, and it inherits whichever one it is dropped into. "Look shared,
placement local" quietly assumed the base was neutral. **A shared look has to
state what it needs rather than what the tidiest base would already have given
it**, and the app it breaks in is the one whose base is most opinionated — which
is also the app it was written in and tested in first.

**And the walk that verified this feature could not see it.** `sw-walk` drives a
real second worker and asserts waiting, telling, and the takeover — everything
about BEHAVIOUR, at one viewport, and never once measures the strip's geometry.
It passed on all three pages while one of them rendered like this.

## The Grade wheel, measured — one half of the report was wrong, 2026-09-10

**Reported:** a drag of roughly 30px near the wheel's centre registered 92%, and
painted the ENTIRE image rather than just the shadows. Two claims, and they
needed separating before anything was changed.

**The sensitivity is exactly the designed geometry, not a glitch.** `PUCK_MAX`
is 33px, and amount is `distance / PUCK_MAX`. A 30px drag is 30/33 = 91%. The
report's 92% is the control working precisely as written.

**The band containment claim is FALSE**, measured on a black-to-white ramp with
the shadows band at hue 0 and amount 92%, reading mean R-B per luminance third
off the displayed frame:

- shadows +70.0
- mids +11.2
- highlights 0.0

Six times stronger in the shadows than the mids and nothing at all in the
highlights. What the reader met was 92% of a correctly-confined shadows tint on
a false-colour frame that is mostly in the lower range — which reads as "the
whole image" and is not the same thing.

**Left alone, deliberately, and this is a taste call rather than a defect.** The
puck is drawn at `amt * PUCK_MAX`, so it sits UNDER THE FINGER. A curved
response — the obvious way to give fine control near the centre — would put the
puck somewhere the finger is not, which trades this app's direct manipulation
for precision. The other route is a bigger wheel, and that costs panel height on
three bands, on a tablet where panel space is the scarce thing. A precise
control already sits beside each wheel: the Amount slider, 0-100, which is also
the labelled path (the wheel is `aria-hidden` and pointer-only by design).

**A wrong selector in the measurement that did not matter, recorded because it
nearly did.** The test tried to neutralise the channel swap with
`getElementById("swapRB")`; the control is `swapBtn`, so that step did nothing.
The measurement still holds — the swap state was identical before and after, so
the DELTA is unaffected, and a greyscale ramp is greyscale either way (neutral
R-B read 0.0). A no-op setup step that silently does nothing is one frame
composition away from invalidating the run.

## The channel swap read as a look, 2026-09-10

The unprompted cold read pressed R&#8646;B on its own, expecting the dramatic
reversal, and got a flat uniform pale purple that lost separation the frame
already had. The copy had told it to expect otherwise: "The core false-color
move". It is the building block those moves are built ON, and on its own it only
separates colours that white balance has already pulled apart. The note now says
so, and names the two things to do first.

## The three cold-read findings, 2026-09-10

### The ⓘ panel opened at the changelog and hid the thing you go looking for

Its button's accessible name was "What's new", and Settings — which holds
"Something's wrong — the report to send" — sat below the whole changelog AND the
roadmap. A cold reader found it only because the same report had already been
found somewhere else. The code already knew: `locSettings` opens the panel and
then scrolls, under a comment saying the panel opens at "What's new".

Fixed: the button's label is now "About this app — what's new, settings, and
reporting a problem", and a row of 44px jump buttons sits under the heading.
Measured: label mentions settings, button 44px, the panel scrolls 0 to 1027 and
Settings lands in view.

### A look redrew the tiles nobody was looking at first

`realThumbnails()` took the first unrendered photo in ARRAY order. That is right
for an open — you are looking at photo 1 — and wrong for everything after it.
Pick a Look and every tile is invalidated at once, so a reader scrolled to photo
200 waits for 199 decodes of pictures off screen. The cold read measured 6-10
seconds on THREE photos, which is the shortest case there is.

`nextThumbTarget()` prefers a tile inside the strip's own box, then works
outwards from the photo being viewed. The same work happens; it happens where
somebody is looking. Measured on eight photos scrolled to the end: tiles
redrawn 3,4,5,6,7 then 0,1,2 — all five visible ones first. The control, with
the old ordering, gives 0,1,2,3,4,5,6,7 and two of the first five on screen.

### Visualize spots — the reader was right, and the reason was not the one anybody wrote down

The report was that the same smudge shows before and after healing. The shader's
own comment says the opposite: a high-pass of the HEALED texture, "so a fixed
spot visibly disappears". Measured rather than believed, on a flat synthetic
field with one 14px mote:

- default Spot size (~7px radius on a 900px frame), heal applied — contrast
  around the mote went 186 to **255**, worse than before
- Spot size raised to cover the mote — 186 to **78**, and the plain view flat
  at 11

So the shader is correct and the copy was not the whole story. **A patch smaller
than the dust leaves a residual ring, and a high-pass view amplifies exactly
that** — so a partial fix reads as no fix, or as a worse one. The view is
telling the truth and it reads as a failure.

And the copy sealed it: "The photo itself is untouched" was meant as *switching
this on does not edit your photo*, and reads as *this view cannot show your
heals*. It now says the view is live, that a healed spot disappears from it, and
that a remaining ring means the patch was smaller than the dust — with Spot size
named as the remedy.

**Three instrument errors, all mine, all caught by controls.**

- The first heal test used a mote bigger than the default patch, so it measured
  a partial heal and read it as the visualiser being broken. The app was right
  and the test image was wrong.
- The first ordering test recorded NOTHING — the strip is rebuilt wholesale on
  every repaint, so an attribute observer sees no mutations — and PASSED, because
  the assertion was guarded by `if (order.length && ...)`. An empty measurement
  skipped the check and reported success. That is LESSONS §250 in this repo.
- The tightened assertion then passed the NEGATIVE CONTROL: the threshold was
  `hit < Math.min(seen.length, 2)`, and the old ordering scored exactly 2. A
  threshold that a known-bad build clears is not a threshold. It requires all of
  the first-redrawn tiles to be on screen now.
- And once it was strict, the FIXED build failed on a batching artefact: polling
  every 150ms let two tiles change inside one interval, and within a batch the
  order recorded was array index order, not completion order. At 40ms it
  resolves. A measurement's own resolution can manufacture the pattern it is
  looking for.

## The update strip reaches all three apps, 2026-09-10

**One service worker at root scope serves the whole site**, so a new release is
waiting for the chooser and Macro exactly as it is for Infrared — but only
Infrared had the markup, which meant the other two detected nothing and said
nothing.

**Three stylesheets, and the strip was in one of them.** `main.ts` imports
`style.css`, `chooser.ts` imports `launcher.css`, `macro/main.ts` imports
`macro/macro.css`. Copying the strip's rules into the other two would have made
three copies of one idea, which is the failure the shared gates exist to avoid,
one level down. `src/swstrip.css` holds the LOOK and is imported by
`swupdate.ts` — the module that provides the feature brings its own styling, so
every app that already imported it got the strip's appearance with no third
decision to keep in sync.

**Placement is not shared, deliberately.** Infrared's shell is a CSS grid and
gives the strip a row of its own; Macro's `#app` is a flex column and the
chooser is plain flow, where a block in normal order is already correct. Only
`style.css` carries `grid-area: swstrip`. Look shared, position local.

`wireUpdateStrip()` does its own `getElementById` lookups now and returns
quietly when the markup is absent, so all three callers are one line and cannot
drift on which ids they use.

**Token availability was checked rather than assumed:** every colour the strip
uses lives in `public/palette.css`, which all three pages link, and `--ui` is
defined separately by each app's own stylesheet. Nothing resolves to nothing.

**All three walked against a REAL second worker**, one page at a time: release 2
waits, the strip appears with its words, both caches sit on the device (so the
open page is still served release 1), no takeover without being asked, and the
reader's press activates release 2 and clears the old cache.

**One thing the walk found that is worth knowing and is NOT a defect.** The
chooser opens a first-run welcome as a MODAL `<dialog>`, which owns the top
layer and makes the strip behind it inert. It does not matter in practice —
on a first visit the strip is hidden anyway, because there is nothing to
announce — but the test has to dismiss the welcome the way a reader would, or
it measures a modal rather than the strip.

## A new version now waits and says so, 2026-09-10

**Doctrine §7h, and it was the one gate failing in this repo.** `public/sw.js`
called `skipWaiting()` inside install, so a new worker took over under the OPEN
page — a page still running the previous release's HTML and modules — and
activate immediately deleted the old cache, leaving that page served new files
from then on. A mixed app, invisible by construction: nobody finds it by using
the app. A sibling served one that way for twenty-two releases.

**Why the standing indicator had to land in the SAME commit.** Removing
`skipWaiting()` alone makes things WORSE, not better: the update then waits and
nothing tells anyone, so a reader sits on the old release indefinitely. The only
existing surface was a Settings button — a PULL, which helps somebody who
already suspects there is a new version and knows which panel to open. A
newcomer never does.

`#swStrip` is the push half: its own grid ROW rather than something floating
over the photo, because a notice laid over the picture in a photo editor is a
notice that gets dismissed unread. Hidden it is `display:none`, so the row
measures 0 and the layout is untouched.

**THE GATE WAS GREEN ON "the reader is told, in words, that a new version is
ready" BEFORE ANY OF THIS EXISTED.** It matched the string "Checking for a new
version…" — text that appears only AFTER the reader presses the Settings button.
The gate reads source for words; it cannot tell an announcement from a
confirmation. Its one FAILING check was the honest one, and its passing ones
were about strings.

**Three instrument errors before the test could be trusted**, each caught only
by insisting on a control:

- **The strip was dead on arrival and the gate still said PASS.** `wireUpdateStrip`
  called `getRegistration()` at import time; the app registers its worker later,
  so that resolved to `undefined` and not one listener was ever attached. It uses
  `navigator.serviceWorker.ready` now, which resolves once a registration is
  ACTIVE and cannot be raced.
- **A `sed` rewrote the test's own assertions.** The replacement came from
  `grep -o 'ips-[0-9.]*'` inside a command substitution, and `[0-9.]*` matches
  empty, so a bare `ips-` won and the assertions became
  `caches.includes('ips-')` — never true for an exact array match, so they fired
  on a correct app. The cache name is read from release 1 at runtime now, never
  written into the test.
- **The takeover flag counted release 1's own arrival.** `controllerchange` fires
  when the FIRST worker claims the page, and the listener was attached before
  that, so every run reported a takeover. The flag resets once release 1 is
  established.

**And the negative control was itself wrong before it was right.** The first
version of this walk PASSED against a build with `skipWaiting()` restored —
it read the state immediately after the strip appeared, which is an in-between
moment that looks identical in both builds. It waits 6 seconds for any
unrequested takeover to actually happen now.

**Verified against a REAL second worker**, not a mock: serve release 1, let it
control the page, rewrite the served `sw.js` with a new CACHE name, call
`update()`. Fixed build — release 2 waits, the strip appears with its words,
BOTH caches are on the device (so the open page is still served release 1), no
takeover without being asked; pressing Update now activates release 2 and clears
the old cache. Control with `skipWaiting()` restored — fails on all three:
takeover unasked, no wait, old cache gone.

**Also removed: a verbatim quotation of the owner in shipped source**
(`src/main.ts`, the force-update comment). Role attributions like "owner rule,
2026-07-20" are the sanctioned form and are fine; quoting the words is banned
outright. All three gates miss it — `quote-check` only reads markdown
blockquotes, and `privacy-check` and `third-person-check` anchor on the name,
which a quotation need not carry. Found by grepping source comments for a quote
mark near an attribution; it was the only one.

**Still owed:** the strip is wired into `ir.html` only. `index.html` (the Studio
chooser) and Macro share the same root-scope worker and the same `swupdate.ts`,
and `wireUpdateStrip` is exported for them, but neither carries the markup yet.

## The hot-spot has a colour, and nothing could touch it, 2026-09-10

**Reported as** a soft red disc in the middle of a plain sky, with the
clarification that it showed up with Restore depth and Aerochrome ON. That
second half is the whole diagnosis: the disc is not in the decode, it is
AMPLIFIED into visibility by the grade.

**What it actually is.** An IR-converted lens passes a little more infrared
straight up the optical axis than it does to the corners. That has two halves —
the centre is BRIGHTER, and the centre is a slightly different COLOUR — and this
app only ever had the first. `hotspot` is a scalar radial gain; so is the
per-lens profile in `src/hotspot.ts`, whose `apply()` multiplies R, G and B by
the same `g`. Neither can move a colour, by construction. Then the R⇄B swap
every colour look is built on takes the small residual tint, puts it on the
opposite side of the wheel from the sky it sits in, and Restore depth's
saturation lift finishes the job. A tint of a few percent in the decode becomes
a disc you cannot look away from.

**What the field does — mined before implementing, per the standing rule.**
The radial models the raw formats carry are SCALAR. The DNG spec's
`FixVignetteRadial` opcode is one gain against radius; Adobe's LCP vignette
model is the same shape; dcraw/LibRaw carry nothing for this at all. There is
no per-channel radial correction anywhere in the reference formats, because in
visible-light photography the centre and the corners are the same colour and
only the brightness differs.

The reference remedy for colour non-uniformity is a different technique
entirely: FLAT-FIELD correction. RawTherapee's Flat-Field module and every
astrophotography flat divide the frame by a blurred photograph of a uniform
field, PER CHANNEL — which corrects the colour half for free, because it never
collapsed the three channels in the first place. That is the correct answer and
this app cannot use it: it needs the reader to shoot and supply a flat frame,
which is not a thing to ask of somebody on a tablet.

**The deviation, written down because the rule requires it.** The app's own
profiles were measured from 26 flat-field frames — actual flats — and then
collapsed to one scalar per radius bin. The per-channel information was
MEASURED AND DISCARDED. Re-measuring those frames per channel is the principled
fix and is now the top of what this owes; it is not what shipped today, for two
reasons. The profiles are JPEG-only and keyed to two lenses, so a RAW frame or
any other lens has no profile to carry a colour term. And an automatic needs a
per-frame measurement, which was tried and failed: the centre-vs-edge red-over-
blue ratio measured on single frames across the practice set spread 0.58 to
2.18, so there is nothing stable enough to drive a correction from one
photograph. A scalar remedy against a per-channel defect is the diagnosis, not
a slider's absence.

**What shipped: `hotspotColor`, −0.5..+0.5, default 0.** It runs over exactly
the circle `hotspotSize` already defines (`hotspotWeight` is now a shared export
in `pipeline.ts` and the same expression in the shader), multiplying red by
1 + c·t and blue by 1 − c·t. It sits after `radialGain` and BEFORE the matrix
and the swap, which is the same placement `hotspot.ts` documents for the
brightness half and for the same reason: correcting after the false-colour swap
distorts the colour rather than the luminance.

**And that placement is why the slider's copy names no direction.** A
source-space red correction shows on screen as blue whenever a look has swapped
the channels, so "right adds red" is wrong for exactly the case the control
exists for. The note says to nudge it and reverse if the disc gets stronger,
and says why. Naming a direction that is right half the time is worse than
naming none.

Measured on a reported frame: preview centre/edge red-over-blue 1.1931 at 0,
0.9185 at 0.4. Exported through the CPU mirror: 0.9307. GPU-CPU gap 0.0122,
inside the standing parity tolerance. Five places wired (`cloneParams`,
`applySnapshot`, `syncFromUI`, `syncToUI`, the listener array). It is kept OUT
of `SavedLook`, where `hotspot`, `hotspotSize` and `vignette` already are not:
it belongs to the lens and the frame, not to the grade, so it does not ride
looks, profiles or a batch.

**Still owed here:** per-channel profiles re-measured from the 26 flats, which
would make the colour half automatic for the two profiled lenses; hot-spot
profiles on the RAW path at all (they are JPEG-only because full NEFs could not
be moved into the measurement rig); and `keyFor`'s nearest-focal-length anchor
selection, which snaps rather than interpolating between anchors.

## A lens does not stop at the focal lengths you measured, 2026-09-10

Matching picked the NEAREST stored profile, so a lens measured at 50mm and
250mm handed a 130mm frame the 50mm curve unchanged — a measurement applied
where it does not belong, silently, on every frame between the two. Between
measurements the curves are BLENDED now, bin by bin.

**On a proportional axis, not a linear one.** 50mm to 55mm is a small move and
200mm to 205mm a smaller one; 24mm to 29mm is not. `logMix` puts the blend
where the optics are: the geometric mean of 50 and 200 is 100, and a 100mm
frame lands exactly halfway between the two curves (asserted to 0.001).

**IT NEVER EXTRAPOLATES.** Outside the measured range the nearest end is used
as it is. A lens curve continued past where anybody looked is a guess wearing a
measurement's clothes, and it would be applied to every frame without anything
saying so. Asserted at both ends, and the note still says which end it used and
how far away the frame is.

**APERTURE PICKS THE SET; FOCAL LENGTH INTERPOLATES INSIDE IT.** This is the
part the owner's own data settled. A hot-spot changes more with aperture than
with anything else — measured on a real lens, **0.19 at f/29 and 0.00 at
f/5.3**, nearly the same focal length — so blending across apertures averages
two different behaviours into one meaningless curve. Planted exactly that: with
sets at f/4.5 and f/22, a blend across them returned **3.100 for a wide-open
frame and 3.100 for a stopped-down one**, the same number for opposite
conditions. Profiles are grouped by aperture, the set nearest the frame's is
chosen, and the interpolation happens only inside it.

Measurements from before aperture was recorded form their own set rather than
being treated as any particular value, and still interpolate over focal length.

The panel says what it did: "blended between your 50mm and 200mm measurements
(50% / 50%)", or "measured at 50mm, this frame is 24mm" when it clamped.

Made to fail three times — nearest-pick instead of blending (5 failures),
extrapolation past the ends, and blending across apertures.

## The preview would have carried a correction the file did not, 2026-09-10

Caught by reading `export.ts` before answering a question about automatic lens
correction, not by any walk — and the walks are the point of the finding.

**A raw export does not use the decoded frame.** `getSource` re-reads the CFA
from the file at native resolution, deliberately, so a saved image is not
limited by the preview's binned decode. The measured colour correction is
applied to the decoded frame. So on the RAW path it was in the preview and NOT
in the exported file. **A screen showing something the saved image does not have
is worse than the correction being absent from both.**

The 8-bit path was fine by accident: there `getSource` returns the very buffer
the correction mutated.

Fixed by passing the matched profile into `exportImage` and applying it to the
raw sampler — in LINEAR, where the gains were measured, so it needs none of the
sRGB round trip the preview's 8-bit path does. **Batch matches each photo on its
OWN EXIF**, because a set can span lenses and one match for a whole run would
apply one lens's colour to another lens's frames.

**AND THE TEST NOW ASSERTS THE FILE.** Every walk in this feature measured the
screen; Doctrine §14 says that if a feature produces an output, the check has to
assert something about the OUTPUT, and none of them did. `exportcheck` exports
twice — correction on, correction bypassed — decodes both saved JPEGs and
compares: source red at the centre −4.5, source blue +4.4. It derives the
red/blue mapping from the original file the same way the preview test does,
because the exported image is display-space too.

Two instrument notes, both already written down and both re-learned anyway.
The first version waited for a `download` event that could never fire, because
export makes the blob and then WAITS on a Save press — that exact sentence was
already in NOTES from an earlier round. The second is the channel swap, for the
fourth time in this session.

## The rig measured a lens and nothing read it back, 2026-09-10

**Asked plainly: did the app ingest my numbers, or do you have to do something
with them — is that why they are on a debug screen?** Both halves were right.
The rig measured a lens, printed 2.6 KB of JSON, and NOTHING in the app read it.
The output was data for a developer to paste into `hotspotProfiles.ts`. That is
not a feature, it is a collection form — and it is why the thing still read as a
debug screen no matter which button was added to reach it. Moving the button
three times could never fix a missing return path.

**`src/lensstore.ts` closes the loop.** *Use these on my photos* keeps the
measurement in `localStorage`; opening a photograph looks its EXIF up against
what is kept and applies the match, in a *Your measured lens* card on the
Corrections tab with a Strength slider, a Bypass and *Forget this profile*.

**WHAT IT APPLIES, AND WHAT IT DELIBERATELY DOES NOT.** A measurement returns
three things and they are not equally trustworthy. `kr`/`kb` are ratios between
channels, so an achromatic falloff divides out of them whatever its shape —
well determined, and applied. `falloff` would flatten the corners, which is
what the Vignette slider is for — not applied, on the owner's call. `bump` comes
back as a RANGE because one flat frame cannot separate a hot-spot from the
lens's own vignette, and a range is not a correction — not applied. So a
measured profile contributes the COLOUR half and the shipped scalar profile
keeps the brightness half, which is honest about what each of them knows.

**It works on RAW, which the shipped profiles cannot** — they are calibrated
from JPEG and the panel says so. A profile the reader measured from their own
raw frames has no such limit.

**A DELTA, NOT A PRISTINE COPY.** The scalar correction keeps an untouched copy
of the frame and re-applies from it whenever Strength moves. That works because
it only ever runs on the 8-bit path; a raw frame is Float32 RGBA at full size —
330 MB for 20 megapixels — and a second one of those on a phone is a crash, not
a copy. A colour gain is invertible, so going from strength a to b is a multiply
by g(b)/g(a). Asserted: 1 → 0.4 → 0 returns every pixel to the decode within
8.9e-8, so the untouched decode stays one press away without being held in
memory (Doctrine §14).

**AND THE 8-BIT PATH HAD TO LINEARISE FIRST.** The gains are measured in linear
light; multiplying an sRGB-ENCODED value by one applies roughly its 1/2.4 power
instead. Planted and measured: a frame that should come back to kr = 1.000
overshot to **0.908** — past neutral, in the opposite direction, and it
disturbed the brightness it is supposed to leave alone. The shipped scalar
correction multiplies encoded values directly and is wrong the same way, smaller
because its gains are smaller.

**THE SWAP CAUGHT ME A THIRD TIME.** The end-to-end test read the canvas and
reported the correction moving the picture AWAY from neutral — centre red up,
centre blue down, the exact opposite of the measurement. The correction was
right; the display exchanges red and blue whenever the channel swap is on, which
is the same trap the Hot-spot colour slider's copy already warns readers about.
Settled by measuring rather than arguing: the file's own channel order came back
R>G>B and the screen's B>G>R, so the mapping is derived rather than assumed, and
in SOURCE terms the correction lowers centre red by 5.2 and raises centre blue
by 3.1. The test derives that mapping every run now instead of trusting either.

**Verified.** The round trip — measure a frame, keep the profile, apply it,
measure again — returns kr and kb to 1.000 on the linear path and 1.003/0.996 on
the 8-bit one, with `falloff` untouched to 0.01. Nearest-match picks the 50mm
profile for a 70mm frame and the 250mm one for 200mm, refuses a different lens
outright, and says how far it reached. Whole loop through the built app: measure
a zip, keep it, open a photograph from that lens, the card appears naming the
lens and what it was measured from, bypass changes the picture, and forgetting
removes it. Made to fail twice — the gamma bug and an inverted gain — and axe
clean in both themes, with the new card's controls matching the card beside it
rather than inventing a size.

**A PASTE-IN BOX WAS BUILT AND THEN REMOVED, and the removal is the lesson.**
The first measurements exist only as text in a message, from before anything
could keep them, so a "numbers you measured before" control went into the lens
panel to bring them in without re-shooting. It worked, and it was wrong: the
owner still has the photographs, so re-measuring costs one press — and the
control served exactly one situation, this conversation's, while sitting
permanently in a reader-facing panel. **Solving MY problem in THEIR UI.** Cut
the same session it was written.

What stayed is the part that was a real defect underneath it: `saveFromPayload`
silently dropped every profile whose key predated the aperture field, returning
"saved 0" with nothing said. Both key shapes parse now, and anything still
unreadable comes back NAMED rather than dropped — a button that appears to work
and keeps nothing is the worst of the failure modes available.

**Still owed:** the shipped scalar profiles remain JPEG-only, and `applyColour`
runs on the decoded buffer rather than in the pipeline. Putting the radial
curves in the shader (a `uniform float[80]` pair, mirrored in `compileEdit`)
would make the correction compose with everything else and cost nothing to
bypass, at the price of a GPU-vs-CPU parity round. That is the right end state
and it is not what shipped today.

## A poll with no bound ran for eleven hours, 2026-09-10

**Nothing in the session found this. It surfaced in the background-tasks list,
which is outside anything the session was watching.**

The task was one line:

    LOCAL=$(ls dist/assets/ir-*.js | head -1 | xargs basename)
    until curl -sSL "https://jefferson-photo-studio.pages.dev/ir.html" | grep -q "$LOCAL"; do sleep 10; done

It captured `ir-Cir89U2p.js` from a LOCAL build and waited for production to
serve that exact file. **It could never match, for two reasons that compound.**

The first is already written down in this file: the bundle's content hash
includes `__CHANGELOG__`, which is built from commit subjects, so a build made
BEFORE the commit can never produce the filename CI produces after it. That
lesson was recorded in this repo and the loop was written anyway.

The second makes it worse: `dist/` was rebuilt dozens of times in the hours
after, so the captured name was stale within minutes even on its own terms.

**Eleven hours and three minutes. A request to production every ten seconds is
roughly four thousand of them**, for a condition that was false at the moment it
was written.

**AND NOTHING SURFACED IT.** A background task that completes sends a
notification; one that never completes sends nothing, so it sat in a list
nobody reads. Every other wait written in the same session had a bound —
`n=$((n+1)); [ $n -gt 16 ] && break` — and reported when it gave up. This one
did not, and it is the one that ran for half a day.

**THE RULE: a poll gets a bound and a stated failure, always.** `until <cond>;
do sleep; done` is not a check, it is a hang wearing a check's clothes: when the
condition is wrong the loop cannot tell you, because saying so is the one thing
it never does. Bound it, and print what it was still waiting for when it stops.

This also sits under the standing rule that a session cannot see the balance and
should spend deliberately. A loop left running unattended is spending with
nobody watching, and the only reason it stopped is that somebody opened a panel
and asked what it was.

## The measurement cost more than the decode, 2026-09-10

Told the owner the remaining cost was the raw decode. It was not, and the
numbers were there to be taken:

- **decoding a 10 MB raw: 95 ms** (70 ms in the worker) — the app's own speed
  test has reported this all along.
- **measuring the decoded frame: 310 ms.** Three times the decode, on the step
  that is supposed to be the cheap part.

Two things were paying for that and neither bought anything.

**`Math.hypot` cost 145 ms of it.** It is the correct function and it guards
against an intermediate overflow that cannot happen with pixel coordinates.
Measured over every pixel of a binned 20 MP frame: **145 ms against 12 ms** for
`sqrt(dx*dx + dy*dy)`. Twelve times, for a safety margin on numbers that never
exceed a few thousand.

**The stride targeted four million sampled pixels**, which is 50,000 a bin for
80 bins. A quarter of that leaves thousands in the thinnest ring — bin 0 spans a
21-pixel radius on that frame and still keeps ~350 samples. The target is one
million now.

**310 ms -> 25 ms, twelve times faster, and not one of the 22 assertions moved**
— tolerances unchanged, because the synthetic frames are 1200x800 and take the
same stride either way. Per frame the whole job is now decode 95 ms plus measure
25 ms.

**And the placement was wrong, which was the other half of the report.** The
rig had been put on the start screen, the version panel and the Corrections
card — all of which read as somewhere you go looking for a diagnostic. It is a
product feature: **Measure lens** is a button in the top bar now, beside Batch
process and Quick look, present with a photo open and without one. Those two are
the app's other whole-set actions and it belongs with them.

## It decoded everything to find out it wanted none of it, 2026-09-10

**Reported from a phone: a 1.69 GB zip, no sign of progress, taking forever.**
Both halves were real and the second was the cause of the first.

**MEASURED BASELINE: a zip of twelve 10 MB raws ran for over FIFTEEN MINUTES
and never finished.** The reason is not that decoding is slow. Those practice
files carry no readable EXIF at all — `readExifSubset` returns null on the whole
file — so the rig decoded every one of them in full and then rejected every one
for having no lens recorded. Fifteen minutes to say "I cannot use these."

**Ask first.** The rig now runs two passes. The first reads only the head of
each frame — 1 MB out of 25 — and takes the lens and focal length out of its
EXIF, which is enough to sort the whole set and to turn away anything unusable
before a single frame is decoded. `readZipEntryPrefix` inflates only that far
and cancels; a truncated deflate stream errors by design there, and whatever
arrived is exactly what was asked for. Re-measured on a set shaped like the
reported one — 46 frames, 40 with EXIF and 6 without: **0.7 seconds**, and the
six unusable ones cost nothing.

**AND IT MEASURES A HANDFUL, NOT EVERYTHING.** Four or five frames per focal
length is what the instructions ask for; the rig now takes up to six per group,
spread evenly across the set rather than the first six, since a set shot in one
sweep has its clouds and its sun angle bunched together in time. A 1.69 GB set
is roughly seventy frames — measuring all of them is tens of minutes to refine a
number that stopped moving after the sixth. It says how many it skipped and why.

**Progress is one line that updates in place**, with a count and — after two
frames — an estimate of what is left, and it yields to the browser before each
decode so the line actually paints.

**APERTURE IS PART OF THE LENS'S BEHAVIOUR, and the first real data made that
undeniable.** A returned profile had **19 frames averaged into one 50mm number,
spanning f/4.5 to f/22** — seven different behaviours reported as one. The same
set showed the point directly: at 135mm f/29 the hot-spot measured 0.186–0.191,
and at 130mm f/5.3 it measured 0.000. Same lens, nearly the same focal length,
and the hot-spot is entirely an aperture effect between them. Groups key on
lens, focal length AND aperture now.

**And the Copy button was at the top while the numbers were at the bottom**,
under a long list of per-frame findings — so on a phone the reader scrolled
past everything, found a text box, and tried to select 2 KB of JSON by hand
(reported, and fair). Copy and Save sit with the text they act on now.

## A lens is not a photograph, 2026-09-10

**Reported, twice, and both times the answer given was worse than the last.**
The lens rig shipped on the TEST PAGE — defensible on its own terms: it is a
measurement, not an edit. Then the routes to it were:

- the version tag, whose panel carries exactly one link and it says **"Test this
  device…"** — naming no lens anywhere;
- a link on the **Corrections tab**, which does not exist until a photo is open.

So calibrating a lens meant opening a photograph you did not want to edit,
finding a tab, and following a link off to the diagnostics page. Measured on
production with nothing open: the version tag is on screen (67x44, reads
v2.20.4) and its panel does open, so a route existed — and no text on it says
"lens", which makes it a route nobody walks. **A path that exists and cannot be
found is not a path**, and reporting one as though it answered the question was
the second wrong answer, not a correction of the first.

**It is a dialog in the editor now** (`#lensDlg`, `src/lensrig.ts`), reachable
from the start screen, the version panel, and the Corrections card — the first
two with nothing open at all. Asserted with nothing open: the start-screen
button is there, opens it, and measures a zipped set of four to the same
numbers as before (kr 1.0904 against a planted 1.08).

**ONE implementation.** The test page kept the markup and 224 lines of wiring;
it now carries four sentences and a link to `ir.html?lens=1`. Two copies of one
feature is how a fix reaches only one of them — the same argument as `IMAGE_EXTS`
in zip.ts and `binary-files.mjs` in the hub.

**The way out was wired FIRST**, before `wireLensRig`, so a throw inside the rig
can never leave a dialog that cannot be closed. That is Doctrine §14's rule
verbatim and it costs two lines to obey.

**AND THE A11Y TEST FAILED ON ITS OWN MISTAKE AGAIN.** The new dialog's file
chooser reported no focus ring in either theme. The CSS was correct: Chromium
only sets `:focus-visible` when the interaction that led to the focus was a
KEYBOARD one, and the test clicked the opener with a mouse and then called
`.focus()`. Opened with Enter and tabbed to, the ring is 2px in both themes.
Third time this session an instrument has reported a defect that was entirely
its own — after the strip's scroll position mid-animation and the deploy check
answered by a stale edge. **When a result looks absurd, suspect the instrument**
is in this repo's own standing rules, and it keeps being the answer.

## Close was inside the thing that scrolls, 2026-09-10

**Reported from a phone:** Close on the ⓘ is all the way at the bottom, and it
does not close by tapping out — is the ⓘ too long?

**The length is not the defect.** Measured at 393x852: the ⓘ held 2333px of
content in a 699px box — **1636px of scrolling, 1.9 screens, before Close came
into view**, and from the top there was no way out on screen at all. Help was
worse and nobody had reported it: **9465px, eleven phone screens.** Both scrolled
as ONE BOX with the way out as the last element inside it. Batch was the same
shape with a shallower scroll.

**THE SISTER REPO HAS SETTLED THIS, AND IT COST THEM THREE ROUNDS.** Quietkeep's
`public/app.css` carries it under "THE ALWAYS-REACHABLE WAY OUT": the dialog is a
flex column that does NOT scroll, a bar at the top carries the title and the way
out, and only the body moves. They tried `position: sticky` first — correct, and
honoured by every engine they tested — and **lost the header on the reference
iPad twice**, so the dependency was removed rather than debugged. Then the same
defect came back when five sheets shipped as ordinary dialogs, and again on the
two longest dialogs that had never been sheets. Their conclusion is the one
worth copying: a stylesheet cannot fix it, because a selector cannot know about
a dialog nobody has written yet, so **the enforcement is a walk that fails on
any dialog with a way out and no scrolling body** — an absence that used to look
exactly like a presence.

Copied here. `#infoDlg`, `#helpDlg` and `#batchDlg` are flex columns with a
`.dlg-bar` carrying the heading and a 44x44 ✕; `.dlg-body` (and `.help-body`) is
the only thing that scrolls. `[open]` is load-bearing on the display rule — a
bare `#infoDlg { display: flex }` outranks the UA's
`dialog:not([open]) { display: none }`, so the dialog would close correctly and
stay on screen anyway. Asserted with `checkVisibility()` after the close rather
than trusting `close()`.

**AND THE OTHER HALF OF THE REPORT WAS `vh`.** Three dialogs sized themselves
with bare `vh` while the rest of the app uses `dvh` — `#infoDlg` and `#helpDlg`
at 82vh, `#batchDlg` at 86vh. On a phone browser `vh` is the viewport with the
URL bar HIDDEN, which is taller than what is on screen, so 82vh came to roughly
95% of the visible height: the dialog ran under the browser's own chrome and the
band of backdrop you tap to dismiss all but vanished. That is why it "doesn't
close by tapping out" — the handler was there and correct
(`e.target === dlg`) the whole time, with nowhere left to tap. All three are
`min(82vh, calc(100dvh - 2rem))` now. Quietkeep's app.css states the same rule
in the same words; this repo already used `dvh` for the editor panel and simply
never applied it to the dialogs.

**This half cannot be verified here and is the owner's to check.** Chromium
headless has no URL bar, so `vh` and `dvh` resolve identically and the band
measures 77px either way. The reasoning and the sister repo's device findings
are the evidence; the iPad is the test.

**THE GATE IS THE PROPERTY, NOT THE BUTTON.** The first version of the walk
looked for a button whose TEXT matched /close|done|cancel/ — and the moment the
✕ landed it reported the ⓘ still failing, because it was measuring `#infoClose`
at the bottom and could not see the new way out at the top. It now collects
every button whose text OR `aria-label` says so and asks whether AT LEAST ONE is
on screen and unobstructed, at the top of the scroll, half way down, and at the
end. Made to fail twice: dropping `[open]` (three dialogs stay visible after
close) and letting the bar scroll again (three dialogs lose their way out).

Measured after: ⓘ 1670px of scrolling, Help 9482px, Batch 141px — and all three
keep a way out at top, middle and end, in both themes, 44x44, axe clean.

**And the lens rig had one route in, behind a version number.** "Where do I find
the place to upload lens test shots?" — nowhere, which is the point: the frames
stay on the iPad. But the only way to Measure a lens was ⓘ → the version tag →
the test page, which is not a route anybody finds looking for their lens. The IR
lens fixes card on the Corrections tab now links straight to it, next to the
sliders it is the answer to.

## The phone spent a whole band on one button, 2026-09-10

**Reported as "the phone user experience is not good", with a screenshot.**
Measured on an iPhone 15 Pro viewport (393x852) with a portrait photo open,
which is the case in the screenshot and the worst one — a tall photo in a short
wide stage:

- top bar **163px, 19% of the screen, in THREE rows**
- stage 306px, 36% — but the photograph inside it **193x290, 17% of the screen**,
  with about 100px of empty grey down each side
- tab strip 148px, 17%
- so 37% of the screen was chrome and 17% was the photograph

**THE THREE-ROW BAR WAS NOT A DESIGN, IT WAS AN OVERFLOW.** Row one is the back
link, the app's identity and Home: 87 + 215 + 78 plus gaps = 400px against 373
available. Twenty-seven pixels over, so Home wrapped — and a wrapped row costs
50px whether it holds one 78px button or twelve. Thirteen per cent of the screen
above the photograph, spent on one button, because a row missed by 27px.

Fixed by dropping the WORD "Studio" from the back link below 760px. The chevron
and the 22px app mark are still the affordance, `aria-label` still reads "Back
to Studio", and the word returns on a tablet (measured: 87px link at 820px).
That saves 48px, and the bar is **two rows, 113px, at 375, 393 and 430** — the
narrowest phone included, which is where it was worst. The photograph goes from
17% to **23% of the screen**, a third larger, with nothing removed.

**And the link was 4px under the floor** once the word went: 40x44, because its
padding was `6px 8px 6px 0` and the right side is where it was missing. 44x44
now, measured by hit area in both themes at both widths. axe clean, no
horizontal scroll at 375px.

Made to fail first: putting the word back gives 8 failures, and removing the
min-width brings 40x44 straight back.

## What the remaining phone space is worth, measured, 2026-09-10

Both of these are RECORDED DECISIONS with reasons in style.css, not oversights,
so they are the owner's to change rather than a session's. Measured at 393x852
with a portrait photo so the trade is a number:

**As it stands** — photo 226x340, 23% of the screen; tab strip 148px, all 12
tabs visible, tab hit area 81x44; panel 383px of which 178px is body.

**Tab strip as one horizontally-scrolling row** — photo UNCHANGED at 23%, tab
strip 52px, 8 of 12 tabs visible, tab hit area 42x44; panel body 178 → **274px**.
The photograph does not grow at all, because `#panel` is capped at `45dvh` and
sits at that cap either way — shrinking the tabs feeds the panel's own body, not
the stage. Worth knowing before anyone builds it expecting a bigger picture.

**Panel cap 45dvh → 38dvh** — photo 266x399, **32% of the screen**, up 39%; tab
strip unchanged at 148px, all 12 visible; panel body 178 → 119px.

**Both together** — photo **32%**, tab strip 52px, 8 of 12 tabs visible, panel
body **215px**, which is more room for controls than there is today. The whole
cost is that four of the twelve tabs need a sideways scroll, and a tab's hit
area narrows from 81px to 42px while keeping its 44px height.

The style.css note beside the tab strip weighed four columns against three and
against cutting the padding (which took tabs to 28px and failed the touch
floor). It never weighed SCROLLING, which keeps the 44px height and is what the
bar and the session strip already do.

## Every file chooser now answers a keyboard, 2026-09-10

The finding is recorded below ("could be reached by finger and by nothing
else"). This is what it took to fix, and two things it turned up on the way.

**AN INPUT DRIVEN BY A REAL BUTTON MUST STAY `hidden`.** Making every file
input focusable would have ADDED defects: `#batchFiles`, `#lookFile` and
`#lutFile` are opened by real `<button>`s calling `.click()`, so the button is
already the accessible control and a focusable input beside it is an invisible
extra tab stop with no affordance. Only an input whose ONLY affordance is a
`<label>` needs to be on the tab order. Three stay hidden; five changed.

**EVERY LABEL NOW OWNS ITS OWN INPUT, because a `for=` has nowhere to put a
ring.** The header's Open and the start screen's Open both pointed `for="file"`
at ONE input, which lives inside the header's label — and both labels are on
screen at once (measured: header 131x44 at y=9, start screen 154x44 at y=187).
So focusing that input ringed the header button while the reader was looking at
the big one on the start screen. The start screen's Open and Quick look each
have their own input now, and the sticker import's moved inside its label;
`macro.html`'s did the same. One CSS rule covers all of them:
`label:has(> .file-input:focus-visible)`. `openFromInput`/`quickFromInput` take
the input as an argument so the two inputs share one handler rather than two
copies of it.

**THREE COPIES OF THE VISUALLY-HIDDEN RULE, and the one that was winning was
not the one being read.** `style.css` carried `.sr-only` TWICE — once with
`clip-path: inset(50%)` and again, 200 lines later, with the legacy
`clip: rect(0 0 0 0)` — plus `.file-input` as a third. The later one wins, so
the first was dead code that looked authoritative. One rule now, `.sr-only,
.file-input`, with `.file-input` differing only in staying on the tab order.

**AND THE CONTROL WAS SIX PIXELS UNDER THE TOUCH FLOOR THE WHOLE TIME.**
Measured by hit area, not by CSS box: the header's Open was **38px** and the
start screen's **43px**, against Doctrine §4's 44. `.bar-btn` was given
`min-height: 44px` with a comment explaining the bar is 56px so it fits without
growing — and `.open-btn`, in the same bar, never got it. The bar is unchanged
at 56px (and 113px at 400px wide) with the floor applied, and there is no
horizontal scroll at phone width. **It is the app's primary control, it was
short, and every gate was green** — because a hit-area floor is not something
axe checks and nobody had measured this one.

**Verified.** Tab walks on all three pages (ir.html start screen 12 stops, up
from 9, with `#file`, `#welcomeFile` and `#welcomeQuickFiles` among them;
macro 4; debug 6); the ring lands on the right label in both themes for all
three; hit areas 44x44 or better; axe clean in both themes; and each control
still does its job — the start screen's Open opens a photo, its Quick look
opens a folder, and the sticker import still imports (19 stickers after).
Made to fail three times first: putting one input back to `hidden` (tab and
ring both fail), deleting the focus rule (six ring failures), and removing the
44px floor (38 and 43 come straight back).

Not a VERSION bump. The controls were meant to work and did not for one input
method; that is a fix, and fixes are increments.

## A whole set at once, and a zip counts as everything in it, 2026-09-10

The lens rig took several files from the moment it existed, but not the way a
set of RAW frames actually travels on an iPad: **zipped**. Zipping is the only
route that hands iOS a NEF without it being transcoded to JPEG, so "a whole set"
and "a zip" are the same thing here. It now takes both, and mixes them freely —
a zip and a loose file in one pick came back as five frames.

**The zip is read one entry at a time, because a set of forty raw frames is a
gigabyte.** `readZip` decompresses EVERY entry into memory at once, which is
right for the editor — it wants one photo out of a zip already in memory — and
impossible here. `readZipIndex`/`readZipEntry` work off a **Blob** instead and
slice only the byte ranges they need: the tail for the end-of-central-directory
record, the central directory, then each entry's own bytes. Asserted rather than
claimed: listing a 264 KB zip read 64 KB of it, and pulling one frame out of
four read 67 KB.

`readZip` is now written ON TOP of those two rather than beside them. One
central-directory parser, one extension list (`IMAGE_EXTS`), one resource-fork
filter — the alternative is a zip that comes out as a JPEG in one place and a
DNG in another, which is the shape of §243.

**The editor still takes only the FIRST image out of a zip, on purpose** — it is
opening one photo, and its own source says so. The rig wants all of them. Both
now go through the same reader, so that difference is one line of intent rather
than two implementations.

**A long run can be stopped and keeps what it has.** Sixteen frames, stopped
part way: five kept, filed, averaged and emitted, with a line saying it stopped
after five of sixteen. Stop is 668x44 and disappears when the run ends.

**THE TEST THAT PASSED WITHOUT MEASURING ANYTHING.** A planted defect — ignore
the LOCAL header's extra-field length and take the central directory's — went
green, because every zip in the harness was made by Python's `zipfile`, which
writes no local extra field. Real zips do: macOS and iOS "Compress" both write
an extended-timestamp record, and the local and central copies are not even the
same length. A fifth zip was built carrying a 9-byte local extra field, and the
same plant then failed on every entry.

**And the plant's first re-run was misread as a pass.** A corrupt data offset
makes the deflate stream throw, and an uncaught throw came out as a stack trace
rather than a FAIL line — so a grep for `^FAIL` found nothing and the next
command's "ZIP OK" was read as the plant's result. The entry read is wrapped now,
so a corrupt entry reports as the assertion it is. **A test that crashes has not
passed, and a harness that cannot tell the difference is not a harness.**

Covered: deflated, stored, a trailing 4 KB comment (so the EOCD is not at the
end), local extra fields, entries inside a folder, `__MACOSX/` forks and `._`
siblings, a text file among the images, a zip with no images, and a file that is
not a zip. Every entry byte-identical to what went in, and a zipped set gives
numbers identical to the same frames loose to 1e-6.

**AND ONE MORE MEASUREMENT THAT WAS NOT ONE.** The poll that waits for a deploy
matched `dProfStop` on the fifth try — and the very next fetch, seconds later,
came back with the PREVIOUS build, 4721 bytes against 5447. Cloudflare's edge
updates unevenly, so during a rollout two requests a second apart can be
answered by different builds, and a single confirming fetch is a fact about
which edge answered rather than about what is deployed. Six independent fetches
now, all six required to agree. The `sw.js` cache stamp is the better anchor
where there is one, since it carries the version.

## Two shapes for "no hot spot", found by comparing the two paths, 2026-09-10

**The 50-250 was re-ingested on 2.32 and came back identical to the run on
2.23** — same nine profiles, same numbers, bin for bin. That is what it should
do and it is worth having said: the measuring path is deterministic across nine
releases of the app around it.

**The check that was worth making is a different one.** Two pieces of code turn
`bump_range` into a curve — the generator that writes `hotspotProfiles.ts`, and
`saveFromPayload` when a reader keeps their own measurement — and they answer the
same question. Compared over 2000 values: every number they both produce is
bit-identical. But for the two profiles that measured NO hot spot (`50@f4.5` and
`130@f5.3`, both with a range starting at zero) the store omitted the curve and
the generator emitted **eighty zeros**.

The correction is the same either way — 1.0000 at the centre on both sides, and
`lensFixLive` already reads a zero-filled curve as nothing. So nothing a reader
could see was wrong. It is still worth fixing, because one idea with two shapes
is the thing that goes wrong later, and every test written against the wrong one
inherits it. Three did: a claim that every shipped profile has an 80-bin bump,
one that stopping down means a bigger number than wide open rather than a number
where there had been none, and one reading `gains(far)[0]` on a profile that
now correctly has no gains at all. All three had encoded the zero-filled shape
as if it were the specification.

An absence is now an absence in both: a profile that found no hot spot carries
no bump, and says so.

**And this is the same class as the seven instrument faults**, one turn later
and from the other direction. Those were claims reading a proxy for the
behaviour; these were claims reading a REPRESENTATION of it. Both are the test
knowing more about the current implementation than about what the thing is
supposed to do. The generator's zero-fill was never a decision anyone made — it
fell out of `scale = 0` — and three tests then wrote it down as truth.

## Re-picking a folder doubled the session instead of resuming it, 2026-09-10

**An interrupted open already resumed — by a route nobody would take.** The
photos it managed are written to storage as the loop goes, so a relaunch offers
the whole partial session back under Resume. But the reader's natural move after
a sleep is to pick the same folder again, and that path recognised nothing:
every photo already in was imported, stored and tiled a SECOND time. Measured
before the fix: picking the same four files twice gave **eight tiles** and
doubled the stored rows. So the resume that existed was unreachable by the
obvious route, and the obvious route quietly doubled the set.

Identity is the picked file's own name and byte length — what the picker knows
before anything is read, and the identity a resumed batch has always used.
`srcName`/`srcSize` ride on the stored meta and come back on a resume, so
re-picking after a resume is recognised too. Rows written before this carry
neither, and fall back to the stored name and size.

A set with nothing new in it is refused whole and says so; a set that overlaps
adds only what is genuinely new and says how many it did not read again. An
unexplained shortfall would be worse than the doubling.

**FOUR INSTRUMENT FAULTS IN ONE SESSION, ALL THE SAME SHAPE.** The walk for this
failed five claims on a working feature, and every one was the test:

- tile names read from `textContent`, which is empty whenever a tile has a
  thumbnail — the name is in `title`;
- the toast looked for by a class it does not have, and queried after its own
  fade;
- then, once it WAS captured, accumulated across steps — so "a set with nothing
  new says so" passed on a message two steps older;
- and the resume button addressed as `resumeBtn`, which is not its id.

Add the GPS fixture with no GPS, the history probe comparing a constant object,
and the resume claim reading a word the feature never wrote, and the pattern is
one thing: **a claim that reads a PROXY for the behaviour, and passes or fails on
the proxy.** The proxy is always something easier to reach than the thing —
a class name, a text node, an accumulated log. The rule that catches all seven:
before trusting a claim, plant the defect it names and watch it fail. A claim
that cannot be made to fail is not evidence, and one that fails on working code
costs an hour of looking in the wrong place.

## The iPad slept and the work was thrown away, 2026-09-10

**Reported from the device: on long loads the iPad goes to sleep, stops all the
work, and discards everything done to that point.** Two failures, and fixing one
without the other would have left the reader still losing a run.

**THERE WAS A WAKE LOCK AND IT COVERED ONE JOB.** `acquireWakeLock` in main.ts
was taken for a BATCH only, and re-taken on visibilitychange only while
`batchRunning`. So opening a set — minutes of decoding, and the job a reader is
most likely to walk away from — had no protection at all, and neither did the
measuring rig. Two implementations of one idea, and the one that existed was
guarding the job least likely to be left alone.

`src/wakelock.ts` is the only one now, and it counts holders so overlapping jobs
cannot release each other's. Three things it gets right that a per-job copy kept
getting wrong: the browser RELEASES the lock whenever the document is hidden and
does not give it back, so it is re-taken on visibilitychange while anything
still wants it; it is a REQUEST that an old Safari, a low battery or a policy can
refuse, so `granted()` reports what actually happened; and every holder releases
in a `finally`, so a decode that throws cannot leave the screen held for the rest
of the session.

**And the reader is told before it matters rather than after it failed.** When
the API is absent or the request is refused, the only remedy is Settings ›
Display & Brightness › Auto-Lock, and saying so is the difference between a
reader who finishes and one who comes back to a blank panel.

**THE SECOND HALF: A RUN NOW KEEPS WHAT IT HAS MEASURED.** Every frame was held
in memory until the run finished, so a sleep, a reload or a tab the system
reclaimed cost the whole thing. `src/framecache.ts` writes each measured frame as
it completes, keyed by name and byte length — the same identity a resumed batch
uses to recognise a file without reading it. Picking the same set again skips
what is already measured and carries on. The write is AWAITED on purpose: the
moment being survived is the one right after this frame, so the row has to be on
disk before the next decode starts. Rows are ~2 KB and stored one per frame,
which is the shape batchstore.ts's gotcha demands — a large IndexedDB value goes
to a lazily flushed sidecar and can be lost after a "committed" write.

**AND THE TEST SAID IT WAS BROKEN WHEN IT WAS WORKING.** The resume claim read
the completion line for the word "reused", and the edit that was supposed to put
the count in that line had never landed — so a feature that was skipping every
cached frame reported as if it had measured them all again. Logging what the
cache actually read settled it in one run: `CACHE want … true` on every frame.
**A claim that reads a string the feature does not write is not testing the
feature, it is testing the string** — the third instrument fault of this kind on
this work, after the GPS fixture with no GPS and the history probe comparing a
constant.

**A UI measurement that moved because of it.** Adding the screen note pushed the
primary action from 288px to 364px into a 607px sheet, past the top half the
panel walk holds it to. The note is guidance for DURING a run and is spent once
there is an answer, so it is hidden at completion and comes back at the start of
the next run, which is when it can be acted on.

## The measurements lived in storage the app does not own, 2026-09-10

**Named from the device: a lens correction needs a warning that it is only kept
in the browser's agreed-upon memory.** It is `localStorage`, and the framing was
exactly right — it is not storage this app owns. iOS Safari drops site data
after a stretch of not visiting, "Clear website data" takes it, a device short
of room evicts, and `navigator.storage.persist()` asks the browser to keep it
and may be refused silently.

**A warning with no remedy is bad news delivered on time.** What was missing was
not a sentence, it was a way out and a way back: no export of what is kept (only
of the run that had just finished), and no import at all. So a reader who lost
it had lost the trip out with the camera, not just a file.

- **Save a backup of all of them / Copy them all** — everything kept, as one
  `ips-lens-backup` file, carrying each profile whole including the brightness
  curve. Asserted by round-tripping to `JSON.stringify` equality after clearing
  storage, not by the file merely existing.
- **Restore from a file** — takes a backup OR a rig payload, because the reader
  has two files that look like the same thing and refusing one of them for a
  header is a distinction only the code cares about. A file that is not JSON, or
  is JSON with no profiles in it, is refused in words with nothing lost.
- **The note reports what the browser actually decided**, read from
  `navigator.storage.persisted()`: agreed, not agreed, or would not say. A
  generic caution would have been the easy thing to write and would have told
  the reader nothing they could act on. It appears only once something is at
  stake — an empty device gets no warning.
- **`requestPersistence()` is asked for at the moment a measurement is kept**,
  which is when the reader has just spent real effort. It already existed for
  photo sessions. The note reads what was granted rather than what was asked.

**AND A SELF-INFLICTED ONE WORTH WRITING DOWN.** Reverting a planted defect with
`git checkout src/lensrig.ts` wiped every uncommitted change in that file — the
whole backup and restore wiring — because the plant was on a file that also held
work in progress. Scratchpad copies had been taken for every other file touched
that round and git was reached for on this one. **Revert a plant from the copy
you took, never from the index**: the index is the last commit, and the point of
the exercise is that the work is not committed yet.

## A measured profile carries its brightness now, and one profile corrects a frame, 2026-09-10

**The standing call was colour only**, because one flat frame reports the
hot-spot as a RANGE and a range is not a correction. What settled it the other
way is that the two errors are not equally recoverable: under-corrected, the
Hot-spot slider finishes the job by hand; over-corrected, no control puts the
centre back. So the LOW end of the range is applied, which is what the profiles
that ship with the app were already doing — and a reader's own measurement of
their own lens on their own body has the better claim to it, not a worse one
(owner call, 2026-09-10).

**A range is one number and a correction needs a curve.** `bump_range` is the
hot-spot's share of the CENTRE's brightness; the shape comes from `falloff`,
which carries hot-spot and vignette together, scaled so the centre lands on the
low end. No falloff, no bump — rather than a guess at the shape. A range of zero
stores nothing at all, so a lens with no hot-spot wide open applies no
brightness correction rather than a flat zero curve.

**ONE PROFILE, WHOLE — not the colour from one and the brightness from another.**
It was exactly that for a while, because a measured profile carried colour only
and the shipped table carried brightness, and the two composed by accident
rather than by design. The moment a reader's own measurement started carrying
both, taking half of each would have meant correcting a frame with two different
lenses' idea of where its centre is. The reader's supersedes the shipped one in
full.

**And one strength, and one card.** `params.lensFix` is what the pipeline reads;
the shipped card's `hsFix` is mirrored into it while that card is the live one.
The shipped card is HIDDEN while the reader's own profile is in use, because it
has nothing to contribute and its Strength moves nothing — two sliders over one
correction, one of them inert, is the shape that makes a reader stop believing
the panel.

**Found by that: forgetting a measurement left BOTH cards hidden.** The
correction fell back to the shipped profile correctly and nothing on screen said
so, until the photograph was opened again. `syncMyLens` tells the shipped card
when it stops being superseded.

**RE-MEASURING REPLACES, and now it says so.** Asked what happens when a flat
frame already accounted for is ingested again. Within one run, frames in the
same lens/focal-length/aperture group are averaged — up to six, spread across
the set — so nothing is double-counted. Across runs, a profile with the same key
is replaced outright, which is what a reader re-shooting a lens wants. The hole
was that the replace was silent: a one-frame measurement could go over a
four-frame one with nothing said. `saveFromPayload` returns what each profile
did, and the panel names any replacement made from FEWER frames than the one it
displaced.

**TWO TESTS ASSERTED A CHANNEL'S SIGN, AND BOTH WENT STALE THE SAME DAY.** "It
raises the centre's missing blue" was true while the correction was colour only.
With a brightness half on top, every channel falls and the colour shows as red
falling FURTHER than blue — the same statement about the centre's excess red,
and one that survives the correction learning to do something else. The
preview's claim and the export's claim were both written that way and both had
to be rewritten. A claim phrased as a direction is a claim about the current
feature set; one phrased as a comparison is a claim about the thing itself.

## Seven questions from the device, and what each one measured, 2026-09-10

**Is the location strip taking the lens with it?** No, and it is asserted now
rather than reasoned about. `stripLocation` zeroes the GPS entries in place and
returns a file of the SAME LENGTH; lens, focal length, aperture, camera and
capture time all survive, and the photograph matches the same profile before and
after — on a bare TIFF and on a JPEG, because the function has a separate branch
for each. The rig never goes through that path at all: it reads the picked
file's own bytes.

**And the first version of that test passed while proving nothing.** It built
its fixture with `buildExifApp1`, which cannot write GPS — so "the location is
gone" and "the lens survives" described a file that never had a location. The
negative control that cannot fail, for the third time on this work. The fixture
is a hand-written TIFF with a real GPS IFD beside a real Exif IFD, and
`findLocation` is asserted to see it BEFORE the strip runs.

**Does interpolation fail badly across a hole?** Measured by leave-one-out on
real anchors: hide the measured 36mm profile, blend 19mm and 50mm across the gap
it leaves, and compare against the measurement that was hidden. Worst bin off by
**1.48 points of gain — 3.8 of 255 on a mid-grey**. Using the nearest end alone
instead costs 9.15, so the blend is about six times better than a snap. Past the
last measurement it clamps rather than running the trend on. That number is why
the "gap too wide to blend across" bar in `coverage()` sits at a 2.2 ratio and
not tighter.

**Does the manual Hot-spot slider still do anything, now that the automatic one
shares its stage?** Yes: 113.4 to 41.5 at the centre. Size changes the circle,
zero returns exactly. Asked, so measured.

**THE RIGHT-EDGE SWIPE WAS OUR OWN HISTORY.** Every dialog open pushed an entry
and every close consumed it with `history.back()` — which leaves a FORWARD entry
behind, every time, and a swipe from the right edge of an iPad is forward
navigation. Safari offered to drag the sheet that had just been closed back into
view. Nothing reopened, because popstate found no dialog open, but the app
appeared to be pulling a dead page around.

One guard entry now, not one per dialog: pushed at startup, re-pushed after each
Back that closes something (which is also what truncates any forward entry the
browser is holding), and closing a sheet touches history not at all. Back still
closes the top sheet; a Back with nothing open is left alone.

**And the first probe for that passed against the plant.** It compared
`history.state` before and after asking to go forward — and every entry carries
the same state object, so the comparison was constant by construction. Counting
`popstate` events instead: planted, five claims fail; clean, none.

**Three things a reader could not do**, and they are one surface. See what the
app has measured; remove any of it; see which focal lengths and apertures are
still unshot. `coverage()` in `lensstore.ts` answers the last one for a list of
profiles, and BOTH callers use it — the rig for the run that just finished and
the *Your lenses* panel for what is kept — because working out twice what counts
as a gap is how the two come to disagree. Removing takes two presses on the same
button rather than a confirm dialog: a sheet over a sheet on an iPad is worse
than the thing it is guarding against.

**The button that makes a measurement mean anything was at the bottom of a wall
of numbers.** One row per photograph, ninety of them on a real set, and the
reader had to scroll past all of it. The outcome comes first now, the per-frame
list is folded, and the instructions fold themselves once there is an answer —
they were read before the frames were picked. Measured on a 430px screen: the
primary action moved from 593px into a 607px panel to 288px.

**A correction applied without being asked for is the one nobody can tell
happened.** Nothing said an automatic lens correction was on unless the reader
went looking under Corrections, and the only before/after was Hold: Untouched,
which drops white balance, exposure and denoise as well and so answers a
different question. *Hold: No lens fix* is present ONLY when a correction is
actually landing on the open frame, so its presence is the indicator; its title
says what is on and whether it came from the reader's own measurement or from
the app. Asserted to differ from Hold: Untouched, or it would be a second name
for that button.

## The rig reported what came out and nothing about what went in, 2026-09-10

**Asked plainly: there is no way to see which focal length and aperture gaps are
still open.** There was not. The rig printed the profiles it produced, a
per-frame list of refusals scrolled off the top, and one line reading "averaged
from 21 frames out of the 94 you picked" — a number with no account attached.
Seventy-three frames went somewhere and nothing said where, which lens they
belonged to, or whether anything was still unshot. That last part is the only
question a second trip out with the camera can answer, and it was the one thing
the panel could not say.

**AND IT HID A WHOLE LENS.** A second measurement came back byte-identical to
the first — the same nine keys, the same numbers, the same lens map — and three
things agreed on why: the frame counts in the first set sum to exactly the 21
the panel reported, the visible output text was the `kb` array of
`50-250@135@f29.0`, and the store said it held nine profiles. The second lens's
frames were in the set and produced nothing, and the rig's answer to that was
silence. **Reporting what came out is how a lens can be shot, picked, refused
frame by frame and never mentioned again.**

**What the report says now**, in three kinds of row per lens:

- **What was measured**, focal length by focal length, with the apertures at
  each and the frame count. A focal length with ONE aperture says so in
  words — a hot-spot moves a long way with aperture, so one aperture describes
  that focal length there and nowhere else. Fewer than three frames per aperture
  is called thin.
- **What is still missing**: nothing above the highest focal length shot on a
  lens that reaches further, nothing below the lowest, a hole in the middle wide
  enough that blending across it is a guess (a ratio over 2.2), no focal length
  shot at three or more apertures at all, and the confound — focal lengths that
  share no aperture with the sweep, so focal length and aperture cannot be told
  apart there. That last one names the fix: one frame at an aperture already in
  the sweep ties them together.
- **A lens that produced nothing at all**, named, with how many of its frames
  were in the set, the reasons with counts, and the sentence that matters:
  nothing from this lens is in the numbers below.

**Two counts that must not be run together.** A frame that COULD NOT be used is
a problem the reader may want to fix; a frame that was NOT NEEDED is the rig
deciding six at one focal length and aperture is enough and declining to spend a
full decode. Adding them would turn a working set into a fault report.

Planted the old behaviour back — report only the lenses that produced a
profile — and the two claims about the unmeasurable lens fail while the rest
stand, which is the defect stated exactly: the reason was in the report all
along, just not attached to anything the reader could act on.

**Small copy defects the dump caught**, both invisible until the report was read
as a reader rather than as a test: apertures came out in string order, so f/16
sorted before f/4.5, and a reason ending without a full stop ran into the next
sentence.

## The shipped profiles are measured data now, and one matcher serves both, 2026-09-10

**The 50-250 was re-measured on the device with the app's own rig** — nine
profiles, seven apertures at 50mm plus 130mm and 135mm, 2 to 4 frames each,
linear space. It replaces three numbers-only entries from the 2026-07 handoff.
The 16-50 is still the old data until it is re-shot; the table carries both and
says which is which, and the panel tells the reader.

**What the measurement itself says, before any code.** Checked on arrival rather
than trusted: bump rises at every one of the seven stops from f/4.5 to f/22
(0.000 to 0.108) and so does the centre's blue (1.096 to 1.276), with no
exception anywhere in the series — nothing enforces that, it fell out of the
optics. kr and kb sit at 1.000 ± 0.002 in the reference ring on every profile,
which is the rig's own invariant holding. Bin-to-bin roughness is under 0.0024
throughout, so these are signal.

The centre is relatively BLUER and less red than the edges — kb 1.30, kr 0.92 at
f/29. Read against ordinary-photo intuition that looks backwards for a hot spot.
It is not: an additive broadband IR flare on a red-flooded frame lifts the
weakest channel most in relative terms, and after the R/B swap every colour look
applies, that excess blue is the red disc in the middle of the sky the app's own
copy describes.

**ONE MATCHER, TWO SOURCES.** "Which of these profiles fits this frame" was two
implementations: aperture sets plus log-focal interpolation in `lensstore.ts`,
and a nearest-focal-length snap in `hotspot.ts`. Same question, and the second
one had never heard of aperture. `matchIn` is now the only answer and the
shipped table goes through it, so the profiles that come with the app get the
aperture matching the reader's own measurements have had for weeks. `hotspot.ts`
is a lookup: the picker's lists, and turning a manual pick into a synthetic EXIF
so the manual route cannot drift from the automatic one.

**AND THE NEW DATA IMMEDIATELY BROKE THE OLD MATCHER, WHICH IS THE POINT.**
Aperture was chosen first and focal length interpolated within the chosen set.
That is correct while every aperture set spans the focal range, and the shipped
table does not — seven apertures at 50mm, one at 130mm. A 50mm f/8 frame picked
the f/5.3 set because f/5.3 is nearest in log aperture, and that set's only
member was measured at 130mm: nearer in aperture, wrong lens position entirely.
Both axes are scored together now, the focal term being how far OUTSIDE a set's
measured range the frame falls (zero when bracketed, because interpolating
inside a range is not a reach). Both are log ratios, so they add without a fudge
factor. f/8 at 50mm now takes the f/13 set. Planted aperture-first back: the
claim returns the 130mm profile again, named in the failure.

**Which end of the range.** One flat frame reports the hot-spot's share as a
range because it cannot separate it from the lens's own vignette. The shipped
table takes the LOW end, and the reason is an asymmetry rather than a taste: the
Hot-spot slider only pulls the centre DOWN, so an under-correction is something
the reader can finish by hand and an over-correction is a dark hole no control
undoes. A reader's own measurement still contributes colour only, per the
standing call — that is a decision to revisit, not one to quietly change.

**The colour half had a strength of zero.** The shipped profile's colour was
matched, uploaded to the texture, and governed by `params.lensFix`, which is
only turned on when the READER has a measurement — so a card reading "brightness
and colour" applied no colour at all. The shipped card's Strength governs
everything the shipped profile contributes. Found by a walk, not by looking.

**And the note called it theirs.** `matchNote` was written for the reader's own
measurements and says "blended between your 19mm and 36mm measurements". One
note serves both cards now, so it takes the wording from `builtIn`. It also
returned a synthetic "blended 0% / 100%" for a frame sitting exactly on an
anchor — arithmetically identical, and it reads as though the app cannot tell
where the frame is.

**The claim that was wrong while the app was right.** A colour correction was
asserted to move two screen channels in OPPOSITE directions. These profiles
carry both halves: the brightness term moves all three the same way and the
colour term rides on top, so all three went down by −26.5, −8.3, −3.4. The
discriminator is the SPREAD across channels, not the signs — 23.1 for a profile
with colour against 0.3 for one without. Swap-agnostic, which matters on a
correction whose channel order has been got backwards four times.

**`hotspotProfiles.ts` is generated.** `genprofiles.mjs` in the scratchpad takes
rig payloads plus what is left of the handoff, validates bin counts and keys,
converts the old gamma numbers to linear once at generation time, and emits the
file. 240 numbers per profile is the one thing nobody reviews by eye, and the
second lens is now a re-run rather than a hand edit.

**Still open in the data.** Nothing above 135mm on a 50-250 — 38% of its log
zoom range — so a 200mm frame clamps. And above 50mm focal length and aperture
are confounded: the only two long-end frames are f/5.3 and f/29, which are also
the two extremes of the aperture range, so the hot-spot at 130mm cannot be
separated from the hot-spot at f/29. The 50mm sweep is the shape that works,
because aperture varies with focal length held still.

## The shipped lens profiles had never once run on a raw file, 2026-09-10

**Two lenses came measured with the app, and on the format the app is FOR, the
correction was dead code.** `applyHotspotCorrection` opened with
`if (!current?.pixels) return` — a raw frame has no 8-bit buffer — and the card
said so, in a status line only a reader who went looking would find: *Not
available for RAW yet — profiles are calibrated from JPEG.* The batch path had
the same gate and its own return value for it. So the app's one automatic lens
correction ran on camera JPEGs and skipped every NEF and DNG, which is what
this editor exists to open.

**And the parser was the other half of that.** The ported module carries its own
EXIF reader that checks for a JPEG SOI marker and returns null otherwise, so
even with the apply path fixed nothing would have matched: a raw file could
never get as far as being refused. `readExifSubset` in `exif.ts` has read TIFF
and JPEG all along. One reader now, and it is that one.

**NEAREST BECOMES BETWEEN.** The anchors are 19/36/50 and 50/130/250mm and a
photograph is almost never on one. `nearestFL` snapped a 30mm frame to 36mm and
applied a correction measured 6mm away at full strength. It is a blend between
the two nearest measurements now, in log focal length — the same mix the
reader's own measurements already used — and clamped at both ends, so outside
the measured range the nearest end applies as it is rather than being
extrapolated into. Measured on the deployed path with one identical grey frame
written out at three focal lengths: the correction at the centre is 0.861 at
19mm, 0.903 at 28mm and 0.931 at 36mm. Planted the snap back and 28mm returned
0.931 — the same answer as 36mm, to four figures, which is exactly what a snap
looks like when you can see it.

**THE NUMBERS HAD TO BE CONVERTED, AND THIS IS THE PART THAT COULD HAVE GONE
QUIETLY WRONG.** The shipped profiles were measured AND applied on gamma-encoded
8-bit pixels — the ported apply function states that as a requirement, and it
came from the same rig as the data. The pipeline works in linear light. The same
number applied there is a different correction: at the largest bump, 0.110 at
16-50@19, multiplying encoded values takes 22% of the light out and multiplying
linear ones takes 10%. Neither is wrong; they answer different questions, and
moving the stage without noticing would have halved the app's flagship
correction under a commit message about architecture.

So each bin is converted to the linear bump that costs the same light at the
point a flat is exposed for. Mid-grey is not an arbitrary choice: the rig
refuses a flat that is blown or dark, so that is where the measurement lives.
0.110 becomes 0.252. Held against the old result across 10–95% of the range the
worst deviation is **1.10 of 255**; the same numbers left unconverted drift by
**12.97**. Both are claims in `bumpconv.mjs`, the second one as the negative
control — a conversion test that cannot fail when the conversion is removed is
not testing the conversion.

An earlier NOTES entry inferred the opposite — that the shipped gains were
linear and were being applied in gamma, "wrong the same way, smaller". That was
written while fixing a different bug in a different module and never checked
against the ported code, which prescribes gamma space in its own doc comment.
The inference is corrected here.

**ONE TEXTURE, ONE BIN, TWO STRENGTHS.** The shipped brightness and the reader's
measured colour ride the same RGB32F curve — kr, kb, bump — read once per pixel
with `texelFetch`. Two lookups would be two chances to disagree about which ring
a pixel is in. Green takes the brightness only: the colour half is defined as a
ratio AGAINST green, so correcting green by it would be correcting twice.
`hsFix`/`hsBypass` join `lensFix`/`lensBypass` as params fields, so Undo, Redo
and Reset carry the shipped card too — it had the same defect the measured one
did, and for the same reason.

The old gamma-space `apply`, its JPEG-only parser and `nearestFL` are deleted
rather than left beside the replacement. A function that applies these numbers
in the wrong space is precisely what a later session finds and calls.

**What the practice set cannot test.** All 47 bundled examples have had their
EXIF stripped, so `readExifSubset` returns null for every one and no shipped
profile can match them. The RAW claim is made through the manual lens picker on
a real practice DNG instead, which is the same code path past the match. Worth
knowing before writing any test that expects a bundled file to carry a lens.

## The measured lens correction moved into the pipeline, 2026-09-10

**It was a rewrite of the decoded frame, and it worked.** The stored curve was
multiplied into the pixel buffer at open, and moving Strength undid the old
multiply and applied a new one. Exact, and it needed no second copy of a 330 MB
raw frame — but it put the one correction that has to compose with everything
else OUTSIDE the thing that composes. Three costs, all structural rather than
cosmetic:

- The export could not see it. `getSource` re-reads the CFA from the file's own
  bytes, so the saved file came from a decode the correction had never touched;
  the curve had to be handed to `exportImage` as a separate argument, which is
  the shape that lets a preview and a file drift apart.
- Every touch of the Strength slider walked every pixel.
- Nothing else in the pipeline could be reasoned about relative to it, because
  it had already happened by the time the pipeline started.

**It is a shader stage now, and a CPU mirror beside it.** `u_lensTex` is an
RG32F texture, one texel per radial bin, read with `texelFetch` so the bin the
GPU picks is the bin the CPU picks — `texture()` with any filtering would blend
two bins and the two paths would disagree by an amount that changes with the
image size. `lensBin()` and `lensGain()` in `pipeline.ts` are the CPU half, and
the stage lands in one place: after the manual hot-spot colour, before the
camera matrix and the R/B swap, because the curve was measured in the FILE's
channel order and applying it after the swap corrects the wrong channel. That
trap was hit four separate times over this work.

`tools`-free but real: the parity walk drives the app twice over the same flat,
once reading the screen and once reading a saved JPEG, and holds them to 1.5 of
255. Planted a shader that halves the red gain: the screen moved 2.59 away from
the file, at ch2 — blue on screen, which is red in the file, the swap showing up
exactly where it should. Clean, the two agree to 0.67.

**Strength and Bypass are `params` fields, not a second copy.** `myLens` used to
carry `strength` and `bypass` of its own, which history never saw: Undo stepped
the picture back and left the slider where it was, with nothing on screen to say
which of the two was right. They are `params.lensFix` and `params.lensBypass`
now, so Undo, Redo and Reset carry them like every other control. Bypass is a
separate boolean rather than a strength of 0 on purpose — a reader who drags
Strength to 0 and a reader who presses Bypass are in the same pipeline state and
must not be told the same thing, and inferring the label from the number
relabels the first as the second the moment history restores it.

Two plants, each biting only its own claims. Dropping `updateMyLensUI()` from
`syncToUI` failed the four card claims and left every picture claim green, which
is the defect stated exactly: the frame was always right. Inferring the label
from `lensFix === 0` failed the strength-0 claim alone.

**Adding `lensBypass` is the FIVE-PLACE rule again** — the defaults, cloneParams,
applySnapshot, syncFromUI, syncToUI — plus the two consumption sites that turn
the pair into one strength, `compileEdit` and the uniform binding in `gl.ts`.

## Measuring a lens where the lens is, 2026-09-10

**The question was how to get 25 MB raw flats off the iPad and into a session.**
The answer is that they never move. A profile is 240 numbers and a flat is a raw
file; the asymmetry is the whole design. The rig runs on the device, on the
decoded frame, and emits the numbers — `src/lensprofile.ts`, driven from a
**Measure a lens** section on the test page.

That also closes the gap the shipped profiles have carried since 2026-07: they
are JPEG-only *because* full NEFs could not be moved to where the original
measurement ran. Nothing has to be moved now, and the same rig serves any
converted lens rather than the two there are numbers for.

**WHAT IT MEASURES, and the one step that makes it work.** Every channel is
normalised by its OWN value in a reference ring (r 0.55–0.72 of the
half-diagonal) before anything else. That makes every number downstream
invariant to exposure and to white balance — which is what lets a raw frame
(un-white-balanced, red-flooded) and a camera JPEG (balanced, gamma-encoded) be
measured by the same code and averaged together. Asserted: the same synthetic
frame at a quarter of the exposure gives identical numbers to 0.001.

    falloff[i] = mean of the three normalised channels    the whole radial profile
    kr[i] = n_r/n_g,  kb[i] = n_b/n_g                     colour, 1 at the ring

**AND IT DOES NOT SEPARATE HOT-SPOT FROM VIGNETTE, BECAUSE ONE FLAT FRAME
CANNOT.** This is the finding, and it cost three wrong turns to reach.

Separating them means fitting a baseline to the outer radii and extrapolating
it inward, and the answer is set by the functional form assumed for the
falloff. Against frames carrying a known 12% hot-spot:

- A polynomial baseline (1, r², r⁴) reads it as 0.130 on a quadratic vignette
  and **0.184 on a cos⁴ one**.
- A cos⁴ baseline reads it as 0.120 on a cos⁴ vignette and **0.097 on a
  quadratic one**.

Each is near-exact on the falloff it matches and wrong by more than half the
bump on the other — and a real lens is cos⁴-ish with mechanical vignetting on
top, so neither is right. **So the rig emits the measured falloff and reports
the two estimates as a RANGE**, which is the honest width of what one frame can
say. Asserted both ways: the range brackets the truth on a quadratic vignette
(0.068–0.119) and on a cos⁴ one (0.120–0.197), and collapses to 0–0 on a frame
with no hot-spot at all.

**THREE WRONG TURNS, all the same shape: the instrument agreeing with itself.**

1. **A sweep chose the fit's inner radius, against synthetics built from the
   same polynomial the fit uses.** It said 0.60. On the real JPEG flats that
   setting read a 0.121 bump as **0.088, moving by 0.007 between four frames of
   the same sky** — biased and unstable, because extrapolating a quartic from
   [0.6, 1.0] back to zero amplifies any irregularity in the outer profile. The
   sweep had measured accuracy on ideal data and never once measured stability
   against the thing that actually varies.
2. **An iteration was written to remove the fit's bias, and it is a no-op.**
   Dividing the bump estimate out of L and refitting returns the same curve,
   because wherever the estimate is above zero, `L/(1+est)` is *identically* the
   fitted curve. It was written, run, and moved the answer by 0.0002 — and the
   comment above it confidently explained the bias it was fixing. The comment
   went in before the measurement did.
3. **The bias was diagnosed from an expected value that was itself wrong.** The
   first "9% shortfall" was arithmetic on bin 0, not a defect: bin 0 spans a
   range of radii, so a 0.12 bump reads 0.1196 by construction.

**Two other things the rig turned up.**

**An 8-bit rendered flat is a systematically worse measurement than a raw one,
and not because of noise.** Within one radial ring nearly every pixel rounds to
the same code, so the rounding never averages away. Measured from one frame
encoded both ways: blue off by 0.0051, red by 0.0016 — blue worst because it is
the darkest channel, where one code step is 2.4% of the value. Half a code in
the right places moves a colour ratio by 1%. So a raw frame **displaces** a
rendered one within a group rather than averaging with it, and the page says
why.

**A frame that is not a flat had to be refused, or the rig would confidently
profile a landscape.** The guard is the mean within-ring relative spread: a
radial profile assumes every pixel at the same distance from the centre saw the
same light, and a photograph breaks that completely. Measured: a practice frame
93%, a synthetic landscape 51%, a noisy sky with its own gradient 1.7%. The
limit is 15%. Blown and black frames are refused on clipping and mean level.

**Verified.** Twenty-two assertions in a scratch harness (falloff against the
model's own ratios at three radii, colour separation, exposure invariance, the
bracketing claim on both vignette shapes, the four refusals, the noise
tolerance, NaN handling in the average) — and made to fail first, twice:
collapsing the range to one model misses the cos⁴ truth, and normalising at the
centre instead of the ring throws every colour number. End-to-end through the
built page on four real JPEGs carrying real EXIF: filed under `16-50@19`, four
frames averaged, aperture and camera read, 2.6 KB of output, and a real
photograph refused. axe clean in both themes; the chooser is 171x44 with a
visible focus ring.

## The file chooser could be reached by finger and by nothing else, 2026-09-10

**Found while building the section above, and it is not fixed everywhere.**
The app's pattern for opening files is a `<label>` styled as a button wrapping
an `<input type="file" hidden>`. `hidden` takes a control off the tab order
entirely and a `<label>` is not focusable, so the pair can be reached by a
finger and by a pointer and **by nothing else**.

Measured by tabbing the built pages. The editor's welcome screen has nine focus
stops — home, ⓘ, the version tag, Untouched, Help, Batch, Quick look, Batch
process, the gallery — and **Open image(s) is not among them**. The test page
had four, and its new chooser was not among them either.

The new one is fixed: `.file-input` in style.css keeps the input invisible but
ON the tab order, with `label:has(> .file-input:focus-visible)` putting the ring
on the label that styles it. Re-measured: five stops, the chooser among them,
44px tall, ring visible in both themes.

**FIXED EVERYWHERE 2026-09-10, on the owner's go**, in its own pass — see the
section below.

## A fast second tap on a control zoomed the whole app, 2026-09-09

**Reported as** the screen zooming when trying to zoom in quickly — and first
read here as a PINCH problem, which it was not. The clarification was that it
happens when tapping the zoom "+" quickly. Two taps in quick succession on a
button is iOS Safari's double-tap-to-zoom, and it scaled the entire app: the
exact opposite of what the control the finger was on does.

**Not fixable at the viewport, and that route is banned anyway.**
`user-scalable=no` and `maximum-scale` were removed from this repo once already
and must not come back — a control that is awkward to press twice is not a
reason to stop anyone enlarging the page.

**The fix is `touch-action: manipulation` on controls**, which disables double-
tap zoom and the legacy 300ms click delay on those elements ONLY. Pinch still
zooms the page; the viewport meta is untouched. It applies to any control
somebody presses in a hurry, not just the zoom pair — undo, redo, the strip
tiles, Back to current.

**Why a BASE rule is safe here, and this was checked rather than assumed.**
Every control in this app that owns its own gesture declares
`touch-action: none` on an id or class selector — `#view`, `.grade-wheel`,
`.crop-handle`, `#toneSvg`, `input[type="range"]` — all of which outrank a bare
`button` selector, so none of them is weakened. Measured after the change:
`#view` none, `.crop-handle` none, `#toneSvg` none, panel sliders manipulation
(their own later override, which is what makes double-tap-to-reset work), and
all 28 visible buttons manipulation with none left on `auto`.

**Worth noticing about the report.** The first reading was a pinch handler
problem and would have led to gesture-event interception on the canvas — real
work, in the wrong place, fixing nothing. One sentence naming the control
turned it into a one-rule change. A symptom described by its EFFECT — the whole
screen zooms — and the same symptom described by its TRIGGER — it happens when
the plus control is tapped in quick succession — are different amounts of
information, and only the second one located it.

## The conventions a reader brings with them, 2026-09-09

**VERSION was not bumped for three capability releases before this one.**
2.12 was declared by the double-tap release; Quick look in the top bar, the
strip scroll fix with its new control, and the white-balance guard all shipped
after it as automatic increments (2.12.x). Versioning here is identity then
CAPABILITY then increment, and features are never increments — each of those
three should have moved the middle number. They are in production under 2.12.x
and are not being rewritten; this release declares 2.13. The rule is easy to
keep and easy to forget precisely because the increment digit moves ON ITS OWN
from the commit count, so the version always looks like it changed.


**The observation that prompted this** was that universal conventions felt
missing or half-implemented. Audited statically, that was right, and the split
is sharp: **everything the platform gives for free was already correct, and
almost nothing that needed hand-wiring had been wired.**

Correct before this change, and worth knowing so nobody "fixes" it: all 13
dialogs open with `showModal()`, so Escape closes, focus is trapped, focus
returns to the opener, and the background goes inert — none of it hand-rolled.
Pinch/pan zoom, wheel on the photo and the strip, `prefers-reduced-motion`,
44px targets, real buttons with labels, roving tabindex on the panel tabs,
Delete/Backspace on a selected sticker with the right text-field guards.

Missing, measured: no Cmd/Ctrl+Z at all (the arrow handler bailed on modifiers
and nothing else claimed them); no `drop`, `dragover` or `dataTransfer`
handler anywhere in the source; no `paste` handler; no history integration
beyond `hashchange` for look links.

**What landed.**

- **Undo/redo from the keyboard**, both redo spellings — Cmd+Shift+Z and
  Ctrl+Y, because a reader arrives with whichever their other editors taught
  them. The text-field guard is by INPUT TYPE, not by tag: bailing on every
  `<input>` would have killed Cmd+Z in the commonest case there is, which is
  nudging a slider and changing your mind. Verified with focus ON a slider.
- **Drag onto the window.** `dragenter`/`dragover` must `preventDefault()` or
  the browser NAVIGATES to the dropped file and replaces the app — which is
  what dropping a raw on this page did until now. `dragenter`/`dragleave` fire
  per element, so the hint is counted in and out rather than toggled, or it
  flickers over every child.
- **Paste**, same accept list, and silent when the clipboard holds text: a
  paste that says "not a photo" every time you copy a URL is worse than one
  that says nothing.
- **Back closes the sheet** instead of leaving the app, which on a home-screen
  install is a system gesture with no browser chrome to soften it.

**The one that needed care, and the trap in it.** The Back integration observes
every dialog's `open` attribute and pushes a history entry. `#busy` — the
loading spinner — is ALSO a `<dialog>` opened with `showModal()`, so the first
version pushed an entry on every photo open and called `history.back()` on
every hide. Back during a load would have closed the spinner without stopping
the work. A surface earns a history entry by being one the reader CHOSE to
open; the spinner is excluded by id. Asserted: opening a photo adds exactly 0
history entries.

The two flags in that block are the whole difficulty and neither is optional.
Closing a dialog has to consume the entry it pushed, and consuming it fires
`popstate`, which would otherwise close another dialog. Each flag marks the
next event as ours.

**Verified headlessly:** drop shows the hint and opens; Ctrl+Z undoes with focus
on a slider and Ctrl+Shift+Z redoes; Ctrl+Z inside a text field is NOT
intercepted (`defaultPrevented` false); paste opens; opening a photo adds no
history entries; Back closes Help and stays in the app; Escape still closes.

**On the honesty of these tests:** unlike the strip fix, these have no negative
control and do not need one — the code did not exist, so "before" is trivially
absent rather than subtly wrong. The strip fix DID need one and got one, because
there the behaviour existed and was wrong in a way a test could accidentally
agree with.

**Still not wired, recorded rather than done:** there is no keyboard route to
the canvas tools at all — tap-to-white-balance, heal, stickers and warp are
pointer-only. Arrow keys move through the strip and nothing else. That is a
larger piece than these four and was not attempted here.

## Tap-to-white-balance refuses a sample it cannot read, 2026-09-09

**Found by the unprompted half of the cold read** — the pass that is handed no
claims and simply uses the app. A first-time reader tapped a sunlit snow bank
expecting neutral, got the whole frame thrown into deep magenta, and read it as
the app being broken. Help says to tap foliage; nothing at the moment of the tap
did.

**Why it happened, and it is not a UI problem.** The tap does
`params.wb = lumNormalize([mean/r, mean/g, mean/b])` on one sampled pixel. A
CLIPPED channel has no ratio to divide by — the sensor stopped counting before
the real value — so that is a division by a number the photograph does not
contain. Infrared floods and clips red first, which is exactly why the result
was magenta. The dark end fails identically from the other side: near zero the
ratio is noise, and `lumNormalize`'s clamp turns a meaningless gain into an
extreme one rather than an obviously wrong one.

**The fix.** `sampleForWb` averages a 5x5 patch — one pixel of a raw frame is
not a measurement — and returns a verdict. More than a quarter of the patch
clipped, or a patch peak under 0.02 linear, and the tap is refused, the photo
untouched, with a sentence saying what is wrong and where to go instead. A
quarter rather than one pixel, because a lone hot pixel beside good ones is not
a blown highlight and refusing on it would make the tool feel broken the other
way.

**Verified against a file whose decode values are known exactly** rather than
against a photograph: a PNG, left half pure white (linear 1.0), right half
(185,120,95). Tapping the white half changes nothing and explains itself;
tapping the coloured half moves the gains 585/585/585 to 456/598/675, warm as
expected.

**Two instrument errors on the way, both the day's usual shape.** The first test
tapped the BRIGHTEST DISPLAYED pixel and expected a refusal — but the display
carries white balance, tone and the look, so a displayed 255 is not a clipped
decode value and `linearAt` reads the decode. The second used a neutral grey
patch as the control and recorded that a good tap "did not set white balance" —
a grey sample gives mean/r = mean/g = mean/b = 1, so the sliders CANNOT move.
The control could not have passed. Also: reading the toast after waiting for it
to fade returns the PREVIOUS message, because the element stays in the DOM.

## The hidden duplicate controls are not an accessibility defect, 2026-09-09

**Reported by the cold read** as hidden interactive duplicates mounted in the
DOM at all times — a Help dialog and a second copy of the practice picker — with
Undo, Aerochrome, Export & Save and Close each resolving to two or three
elements when queried by visible text.

**Measured, and it is real for automation and false for accessibility.** A probe
walking every button, link, input and `label[for]` and excluding anything
`display:none`, `visibility:hidden`, `[hidden]`, inside `aria-hidden`, inside a
CLOSED `<dialog>`, or inside a `<template>`:

- start screen — 406 controls in the document, 26 reaching the tree
- a photo open — 406 in the document, 37 reaching the tree
- duplicate accessible names among exposed controls, both states: 0
- exposed controls with zero width or height, both states: 0

A closed `<dialog>` is `display:none`, so its contents are out of the
accessibility tree entirely. **Nothing to fix, and the accessibility runs that
kept coming back green were right.** Recorded so it is not re-opened: an agent
querying by text sees the whole document, and a screen reader does not.

**The general point worth keeping.** A finding from a tool is a fact about the
tool's view until somebody checks whose view it was. This one was reported
upward as an accessibility defect before it was measured, which is the same
error as reading a proxy for the thing.

## "Opening" was still on screen in the other place, 2026-09-09

The ruling that photos are not really "opening" — only one is, the rest are
being copied onto the device — was applied to the line under the photos and not
to the modal that appears first, which kept saying `Opening 5 photos — reading 1
of 5`. The cold read found it on the same screen the fix had already been made
on. One ruling, two surfaces, and the fix reached one. Both now say "Adding".
The single-file path still says Opening, because there the photo is being opened.

## The strip stopped snatching the scroll, 2026-09-09

**The defect, exactly.** `updateSessionStrip()` saved `sessionThumbs.scrollLeft`
at the top and restored it four lines from the bottom — a fix with its own
comment explaining that without it the strip snapped back to the first photo.
Then the very next line called `revealActiveThumb()`, which scrolled to the
active photo and threw that restore away. The function runs on every add and
every thumbnail that lands, so on a long set the strip was dragged back to the
viewed photo several times a second while it loaded. One line preserving the
position, the next line discarding it.

**The fix.** `revealActiveThumb(force = false)` scrolls only when
`activePhotoId` differs from `lastRevealedId`, so it fires on a real switch and
never on a repaint. `force` is the reader asking.

**And the way back, because losing it was the other half.** `#stripHere`
("&#8629; Back to current") sits in the strip head, 44px, `hidden` unless the
viewed photo is outside `sessionThumbs`'s box. Kept honest by the strip's own
`scroll` event rather than a timer, because a smooth `scrollIntoView` settles
over several frames and a flick over many.

**Measured, 430x900, six real NEFs, with a NEGATIVE CONTROL.** Scroll to the far
end while the set is still coming in, then let every thumbnail land: the strip
holds at 100 of 100, the button is offered at 44px, pressing it returns to 0 and
the button hides itself. The same test against a build with the old
unconditional reveal fails on both counts — 100 back to 0, and no button. A test
that has not failed on the defect is not evidence.

**Instrument error, twice more, both the same shape as the day's others.**
`.session-thumbs` is `scroll-behavior: smooth`, so `scrollLeft` read straight
back after being set is the value BEFORE the animation. The first run recorded
the start position, saw the end position later, and reported the app moving the
strip on its own — the test measuring its own scroll. Then the settle loop
written to fix it compared two consecutive reads for equality and passed
immediately on two identical PRE-animation values. Both were reading a quantity
that had not finished changing.

**And a third, in the same session: a negative control that was never negative.**
`npm run build` is `tsc --noEmit && vite build`. The reverted source failed the
typecheck on an unused variable, so `vite build` never ran, and the "control"
copied out of `dist/` was the GOOD build. It would have passed and been read as
proof the test could not fail. A build step that short-circuits leaves the
previous artefact in place, and an artefact directory looks the same either way.

## Restore depth opens at the solved optimum, 2026-09-09

**What "optimal" means here, measured rather than chosen.** `solveLift` bisects
onto `FLAT_LUM_REF = 0.44` bounded by a shadow floor, and `scaleLift`
interpolates linearly from neutral to that answer. So 100% is not a maximum —
it is the calibrated target for the frame in front of you. Any lower setting is
a deliberate retreat from it.

**Why it was not opening there.** The strength persisted to
`localStorage["ips-liftamount"]`. Backing it off once for one photograph meant
every later photo, and every later visit, opened at that photograph's answer. A
value solved per-frame cannot be carried to the next frame and still be the
answer. The persistence is gone; it stays live for the session and starts each
visit at the solve. Verified: set to 40, reload, reads 100, nothing stored.

**Help was carrying the old justification.** The double-tap line said Quality
and Restore depth strength both "go back to their usual setting, since those are
yours rather than the photo's". Half of that is no longer true — the strength is
the photo's now — so it says so.

**A sample that could not exercise it.** Six real NEFs were measured at 0/70/100%
and every median was identical at all three. Not a defect: `needsTone` fires
only when a frame's median is ABOVE the reference, and five of the six sat at or
below it (0.107 to 0.459). The correction had nothing to do. Choosing a sample
without first checking it can trigger the thing under test produces a clean row
of numbers that mean nothing.

## Quick look reachable from the editor, 2026-09-09

**The report:** the Files picker is small and shows few files at a time when
opening photos. **The answer to the literal question is no** — that picker is
`UIDocumentPickerViewController`, presented by Safari. Its size is the system's
and no web API changes it. Saying only that would have been true and useless.

**What was actually wrong.** This app already has a full-screen file browser —
Quick look, a grid of developed previews with Keep in a session — and it was
reachable from the start screen ONLY. With photos open, the sole route to more
files was the system picker. Help said so in as many words: "(start screen)".

`quickFiles` was already sitting in the editor's top bar markup, hidden, with
nothing pointing at it. The whole fix was the button.

- `#barQuickBtn` is a real `<button>`, not a `<label for=>`. A label pointing at
  a hidden file input is not keyboard-focusable; `Open image(s)` has that gap
  already and there was no reason to add a second one. It calls
  `quickInput.click()` synchronously inside the tap handler, the same pattern
  `bcQuick` uses — iOS ignores a picker opened outside the gesture.
- Help gained a section on seeing more files while picking: the picker is
  Apple's and cannot be resized from a web page, its own four-square control
  toggles a compact list that shows several times as many names, and Quick look
  is the route where the browsing happens in a surface this app controls.
- The "(start screen)" line in Quick start now reads "(top bar, and on the start
  screen)", because a sentence naming where a control lives is stranded the
  moment the control moves.

**Measured, headless, 820x1180 and 390x844:** button 44px, centre hit-test lands
on itself, file chooser opens with multiple, and the Quick look dialog fills the
viewport exactly (820x1180 of 820x1180). At 390 the editor bar overflows —
914px of buttons in 370px — and Quick look and Open image(s) both sit off the
right edge at rest. That is the designed scroll: `.bar-actions-wrap` gets
`scroll-right` and the `›` fade renders at opacity 1. It pre-dates this change
(the bar overflowed at ~814px without the new button) and the target device is
820px wide, where the whole bar fits in 376px. Left as is, recorded here.

**Three instrument errors in one verification, all the same family.** The
portrait-thumbnail assertion failed twice before the app was ever in question:

- Measured `.ql-tile` preview CSS boxes and got 189x189 for every photo. The
  previews are `object-fit: contain` in a square tile, so the box is square by
  construction and cannot carry the photograph's shape.
- Then queried `canvas` and got nothing, because the tiles are `<img>`.
- `naturalWidth`/`naturalHeight` answered on the first ask: 512x341 landscape,
  341x512 for both orientation-8 frames. Rotation was correct the whole time.

Same shape as the target-as-bounding-box and durability-as-elapsed-time errors:
a proxy was measured and read as the thing itself. Where the interface exposes
the thing — a hit test, a `durability` attribute, an image's intrinsic size —
ask it.

**Test-set coverage gap:** of 23 real NEFs, 21 are orientation 1 and 2 are
orientation 8. Orientation 6 — the other portrait case, and the other branch of
`orientationToRotate` — is exercised by no real file on hand.

**Hub gates on this repo, measured 2026-09-09 and NOT changed here:** five are
red and every one pre-dates this work — `third-person-check` (117 sites in 12
files; no `.third-person-allow` exists here), `example-check` (2 in ir.html),
`privacy-check` (4 sites, three in this file), `pwa-check` (`skipWaiting()` during
install, Doctrine §7h.1) and `docs-check` (a table in a tracked `.md`). Counts
were taken with the change applied and again with it stashed: identical both
ways, so this commit adds none of them.

## Audit: what else was treated as an aside, 2026-09-09

Asked directly, after the theme default turned out to have been visible in this
session's own output and walked past. Going back over every measurement taken
here, three things had been noticed and not pursued. Two were real.

**A REGRESSION SHIPPED IN 2.9, FOUND BY THIS AUDIT AND NOT BY ANY TEST.**
`makeThumb` spreads `cloneParams(params)` and overrides fourteen fields; `tone`,
`sky` and `foliage` are not among them. That was correct while those were a
SHARED creative grade — the thumbnail was meant to carry the live look so it
matched what opening showed. The moment Restore depth began writing them PER
FRAME it stopped being correct: every tile in the strip was rendered with a
curve solved for whichever photo happened to be open, and tapping it re-solved
and showed something else. That is precisely the defect the thumbnails were
fixed for once before. Nothing caught it because every test opened one photo or
compared a tile against itself. Fixed by giving measureFrame and solveLift the
image they are measuring instead of reading `current`, so a thumbnail solves for
ITSELF. Verified by rendering the same file's tile in two sessions whose OTHER
photo differed: 0 of 4800 subpixels differ, and the comparison was shown able to
see a difference (3586 of 4800 between two different photos).

**A CONTRAST FAILURE THE SAME CHANGE CREATED.** `.session-thumb-name` uses
`--glass-txt-2`, which is theme-invariant for HUDs floating over a photo. On the
light theme's cream tile surface it measures **1.39:1**. It had been a rare
fallback for a thumbnail that would not render; making every tile begin life as
a name waiting for its picture turned it into the common case. Now `--txt-2`.
The lesson is narrow and repeatable: **when a rare state becomes the default
state, its styling has to be re-measured, because it was only ever checked in a
context nobody looked at.**

**AND ONE THAT WAS NOTHING.** Two frames printed identical statistics to three
decimal places across all five columns in the calibration sweep, which went by
unremarked. Checked: 44 distinct files, no duplicates — two frames from the same
burst, agreeing at that precision after a 260px downsample.

Three others were noticed and DECLARED at the time rather than buried, and stand
as known and unaddressed: saturation clipping at the top of the Aerochrome range
(a tenth of the pixels at full chroma on the strongest frames); the sky mask
reporting "found" on 43 of 44 practice frames including 5% coverage, which makes
it useless as a classifier and may mean the feature over-reports; and the ~800 ms
GL program stall at the first photo of a page. None has been investigated.

## The theme control had no system option — and never had, 2026-09-09

Reported from the device: the switch shows one name, and there is no "follow the
OS". Both true, and the second was the larger of the two.

**THE DEFAULT WAS DARK, UNCONDITIONALLY.** `currentTheme()` returned "dawn" only
when localStorage said so and "dark" otherwise, so a reader who had never touched
the switch got dark whatever the iPad was set to, and no setting could ask for
anything else — `prefers-color-scheme` was not consulted anywhere in the app.
There is corroboration earlier in this same session and it was walked past: an
axe run with Playwright's `colorScheme: light` rendered identical colours to the
dark run, and that was noted as "the app must not follow prefers-color-scheme"
and left. **A measurement that surprises you is a finding, not an aside.**

**AND A TWO-STATE SWITCH CAN ONLY NAME ONE STATE.** It was labelled "Dawn
theme", so the other half of the control — the one that was also the default —
had no name on it at all.

Now three options in a radio group: **Match my device** (the new default),
**Dawn**, **Dark**. The pattern is the palette picker's, sitting a few lines
below it in the same panel, rather than a new one: `role="radiogroup"` host,
`role="radio"` buttons, each carrying a name and what it means, `aria-checked`.
No swatch — there is no single colour that stands for "match my device".

**THE PRE-PAINT SCRIPT HAD TO LEARN THE SAME RULE.** Every page carries an
inline one-liner that sets `data-theme` before first paint so there is no flash;
it read localStorage only, so with a system default it would have painted dark
and then corrected itself one frame later on a light device. It resolves the
media query now, in all four pages, and the module resolves it identically —
verified by reading `data-theme` at `waitUntil: "commit"` and again after load.

**FOLLOWING IS LIVE, NOT JUST AT LOAD.** A `prefers-color-scheme` listener
repaints while — and only while — the choice is "match my device", so an iPad
switching at sunset carries the app with it. Verified by flipping the emulated
scheme with the page open: dark to dawn with no reload, and an explicit Dawn
choice stayed put when the device flipped under it.

**NOTE THE DEFAULT CHANGED FOR EXISTING READERS.** Anyone who never pressed the
old switch has no stored value, so they move from always-dark to following the
device. On a light-mode iPad that is a visible change on next open. It is the
platform convention and it is what the report asked for, but it is a change to
what people already had.

VERIFIED: first visit follows the device both ways; no flash; live follow;
explicit choices ignore the device and survive a reload; all three names present;
every option at least 44px; exactly one checked; axe clean on the launcher, the
infrared editor and macro, in both device modes. privacy.html carries the
pre-paint script only and follows correctly with no picker. 37 lines of dead
two-state switch CSS removed.

## The device pass on Restore depth, 2026-09-09

Feedback from the iPad. **Most of the behaviour reported was the PRODUCTION
build, not the design**: the old "Lift a flat frame" button, its old toast, no
application on a look press, and an on-switch that could not go back. All of
that was 2.6; staging already carried the toggle. Confirmed by fetching both
hosts and reading the served markup and bundle rather than assuming — production
served `class="accent-outline"` with the old label and no `ips-autolift` key,
staging served the toggle with `aria-pressed="true"`. **Worth remembering: when
on-device feedback describes behaviour that was already fixed, check WHICH BUILD
is in front of the reader before touching anything.** Three of five reports
needed no code at all.

What was genuinely still open, and is now fixed:

**THE NAME.** "Lift" describes the opposite of what it does — it darkens. Now
**Restore depth**, which is what it puts back: tonal depth, and colour
separation the automatic balance flattened.

**A TOAST BROKE PROSE AFTER A SINGLE LETTER.** `wordBreak: "break-all"` in
share.ts's toast, which breaks at ANY character; it was presumably there for an
unspaced look code or URL. `overflow-wrap: anywhere` does that job and leaves
ordinary sentences alone. This is the app's ONE toast, so every message in every
flow was affected, not just this one.

**THE EXPLANATION WAS A WALL.** Two lines now, with the rest behind a
`<details>` — "Why a photo needs it". The summary carries the 44px target
itself, and the open/closed state is in the words and the marker, not colour.

**THE TOGGLE STOPPED ANNOUNCING ITSELF.** A popup on every press is noise on a
control meant to be pressed back and forth, when the button shows its own state
and every value it writes is on a slider inches away. The one case that keeps a
message is the one with nothing to see: a frame it decided to leave alone looks
identical either way, and without a line saying so the button reads as broken.

**TWO TARGET FINDINGS, both from adding one control.** The off/on segment pair
copied from the LOOK buttons measured **1.01:1** on a pressed toggle's accent
fill in the light theme — the segments were designed for a surface background,
not an accent one. Dropped entirely: the R/B swap this is modelled on has no
segments, and its pressed state is an accent fill AND a heavier weight, so it
does not rest on colour alone. Removing them then exposed that
`.toggle.full-btn` renders **34px** — so the swap itself, plus B&W, Crop and
Straighten, have always been under the minimum. Fixed on the class, which fixes
all five rather than leaving two sizes of the same control side by side. That is
the third time this sweep that a target under 44px turned up in the panel; the
2026-07-29 audit covered the bar and the dialogs and never reached the panel's
own controls.

## Adapt flat frames became automatic, 2026-09-08

Owner direction, same day: photos should open the best they can, without a
control anyone has to remember. So the measured lift that shipped as a button
became an at-open automatic with a toggle beside it — default on, pressed means
this frame is adapted, shaped after the R/B swap.

**WHERE IT RUNS.** In establishFreshEdit, BEFORE origParams and the Reset
snapshot are taken, so Hold: Original and Reset both still mean "the photo as it
opened" and this is now part of how it opened. Again at the end of applyLook,
because a look replaces the whole creative state including everything the lift
wrote — which is what makes Aerochrome land like Aerochrome on a frame with no
sky, first press.

**THE COLOUR HALF ONLY RUNS WHERE A LOOK IS ON THE FRAME.** The sky and foliage
bands are hue-defined, and it is a look — the channel swap above all — that puts
a frame's materials into them; the references were measured on frames wearing
one. Solved against a bare opened frame instead, nothing clears them and the
boost fires on everything: measured, 44 of 44 practice frames "adapted" at open
with no look, which is not a correction, it is a new default rendering. The tonal
half has no such dependency and runs always. After the split: 38 of 44 adapted,
6 left alone, medians moved from 0.518 to 0.443 against a 0.44 target, and the
darkest frame in the set (0.366) was not touched.

**TWO BUGS THE CARRIED-OVER CREATIVE GRADE CAUSED, both worth remembering
because they only appear across a SEQUENCE of opens and neither shows up on one
photo.** The creative grade persists across opens by design, tone included, so
`params.tone` on a fresh open is whatever the last photo ended with. Measuring
that as the starting point and then deciding "already dark enough" left the
previous photo's curve sitting on this one, and a chain of opens ratcheted the
whole set down — medians reaching 0.167 against a 0.44 target. The solve now
always measures from the DEFAULT curve, which also makes it idempotent: the same
frame gives the same answer however many times it runs. The second was the
mirror of it — the toggle's revert restored the carried-over curve rather than
the neutral one, so turning it off put ANOTHER photo's tone on this one, and the
two states could not be compared at all. That one was caught only because an
on/off pair of renders looked wrong in a way the numbers had not shown. Solving
and reverting have to agree on what "without a lift" means.

**A NO-OP HAS TO CLEAR AN INHERITED LIFT, not just decline to add one.** A frame
that needs nothing still gets handed the neutral curve, or it wears the last
photo's correction.

**COST.** The solve is a fixed sampling grid, so it is resolution-independent —
the grid size IS the cost, whatever the megapixels. Dropped from 128 divisions
to 64 and the bisection from 8 steps to 6, since it now runs on every open
rather than on a press. Whole-open wall clock across the practice set: 215 ms
minimum, 218 ms median.

**VERIFIED:** the toggle is a true round trip (on/off/on returns the identical
tone and band values), off really neutralises rather than half-reverting, the
pressed state tracks, and the preference survives a reload. Two frames rendered
on and off, at open and with Aerochrome, and looked at: the flat frame gains
real shadow depth and visible magenta where it was near-white, and the brightest
frame in the set gains contrast and saturation without being crushed. axe clean
in both themes; the toggle is 48px.

**NOT VERIFIED, and it is the calibration:** the references (median 0.44, warm
0.35, cool 0.50) come from frames that looked right WITH a look on. Whether they
are the right targets for the owner's own files, on the device, is unmeasured
here — and they are the one part of this that is taste rather than measurement.

**KNOWN CONFLICT, unresolved:** a tone curve set by hand carries across opens as
part of the creative grade, and the automatic now also owns tone at open. The
solve ignores the carried curve, so a hand-set curve is replaced on the next
open when Adapt is on. Turning Adapt off leaves hand-set values alone (the
revert only touches values it still recognises as its own), but the interaction
deserves the owner's ruling.

## Opening a set: decode off the main thread, and the strip up front, 2026-09-08

Follow-on from the picker work. Everything below is measured in the built app
under headless Chromium; none of it has been on the iPad.

**FILES OPENED IN WHATEVER ORDER THE PICKER RETURNED THEM.** Quick look sorted
its picks numeric-aware from the day it was written, with a comment saying the
picker hands files over in tap order. The session path never sorted at all, so a
set opened for editing carried an arbitrary order — and because the strip's
`order` is assigned in add sequence and Resume sorts by it, the wrong order was
persisted and faithfully restored. One shared `inShutterOrder()` now, called by
both, so they cannot drift apart again. Verified: four files picked
1638/0063/0627/0152 come back 0063/0152/0627/1638, and the order survives a
reload and Resume.

**DECODE NOW RUNS IN A WORKER, AND IT IS THE SAME DECODER.** The only thing
standing in the way was a single `document.createElement("canvas")` in
decode.ts's make2d, now environment-sniffed to OffscreenCanvas — so there is one
decoder, not two, and no way for a copy to drift. Equivalence is asserted, not
argued: all 44 practice DNGs decoded BOTH ways with the buffers compared byte for
byte, 44/44 identical, and the comparison was shown able to see a planted
one-value difference. Measured over a six-file open, stalls above 100 ms on the
main thread fell from 8 to 2. The worker is slightly SLOWER in wall clock (5.5 s
against 4.3 s for 44 decodes) because the source bytes are copied in rather than
transferred — the caller still needs them for storage — and that is the trade:
the point is a main thread that stays free, not a faster decode. Any failure to
construct or run the worker drops every decode back onto the main thread, which
is exactly the old behaviour; a decode that fails INSIDE the worker is a damaged
file and its message reaches the reader unchanged.

**THE BIGGEST COST IN A SET OPEN WAS THE HISTOGRAM, NOT THE DECODES.** Profiled:
`readPixels` was 991 ms, a quarter of all main-thread time, and the single
longest task. refreshHistogram runs on every draw and each run is an offscreen
render plus a SYNCHRONOUS readback that stalls until the GPU pipeline flushes.
Its own comment says the readback is a fraction of a millisecond, and per call
that is true — the cost is the call count and the flush. It is skipped while a
set is loading and paid once at the end; the photo on screen is not changing
while the REST of the set loads, so there was nothing to redraw. readPixels fell
to 266 ms. NOTE FOR THE IPAD: a synchronous readback is typically far worse on
real tile-based GPU hardware than on the software renderer this was measured on,
so the win there is likely larger, not smaller.

**WHAT REMAINS, AND IS NOT ADDRESSED:** one ~800 ms main-thread task at the first
photo of a page, present before and after all of this, which the profiler
attributes to native `(program)` — GL program setup and the first texture upload.
It is once per page, not per photo, and unrelated to set size.

**THE STRIP NOW APPEARS BEFORE ANYTHING IS READ.** The picker has already given
the name and size of every file, so all N tiles are drawn immediately — named,
numbered, in order, not switchable until their bytes land. Measured on eight
files: every tile on screen in 0.05 s, against the old behaviour of one tile
appearing roughly every 600 ms. Only the photo being SHOWN is decoded in the
open path; the rest are stored as bytes, which needs no decode, and their real
thumbnails are rendered by a background pass that runs BESIDE the storage loop
rather than after it (running it after put the last picture at 7.5 s against
storage finishing at 4.8 s; beside, the first picture lands at 3.9 s). That pass
re-reads each photo's bytes out of storage one at a time, which is what keeps RAM
bounded to a single decoded frame — a decoded 20 MP frame is a couple of hundred
megabytes and two or three of them at once is not survivable on an iPad.
Storage itself is unchanged at ~4.8 s for eight files; it is the crash-safety
copy and nothing here makes it cheaper.

**THE PROVISIONAL PREVIEW IS BUILT AND CANNOT BE VERIFIED HERE.** Every NEF and
most DNGs carry the camera's own JPEG preview, and pickLargestPreview already
existed in decode.ts for third-party raws; it returns JPEG bytes, so the tile can
show one with no decode and no re-encode at all. It is marked in the tile as
"cam" — text, not colour — because a camera preview of an infrared frame is a
magenta smear and does NOT match what opening the photo shows, which is a defect
found and fixed once before. **NOT ONE of the 44 bundled practice DNGs carries a
preview** — 0 of 6 sampled have tag 513, and the code path is a no-op on every
file in this repo. It was therefore tested against a TIFF built for the purpose
carrying a 31-byte JPEG at a known offset: the extractor returns exactly those
bytes, returns null on a real practice DNG, and returns a different answer when
the file's preview offset is moved. That verifies the CODE. Whether a Z50 NEF's
preview appears in the strip on the device is unverified and needs the owner's
files. Two instrument errors were made proving this and are worth remembering:
an over-long length was clamped correctly (so the sabotage did nothing and
looked like blindness), and a null return IS a changed answer (the assertion
could not express it).

## The Files-picker stall is iOS, not the app, 2026-09-08

Reported from the iPad as sitting at the document picker with nothing saying why,
with the guess that the app was downloading the files first. It is not: nothing
in this app has run at that point. The only entry point is the `change` handler
on `#file`, and the picker is Apple's — no event reaches the page until it
closes, so there is nothing the app can draw over it and nothing it can measure
about the wait.

WHAT IS ACTUALLY HAPPENING. iOS evicts the local copy of an iCloud Drive file
when storage runs short and keeps a stub. The picker pulls the real bytes back
for EVERY selected file before it returns any of them, so a folder of forty
Z50 NEFs is a gigabyte or more fetched before this app is handed a thing. The
screenshot's files each carried a cloud badge and an "↑ Waiting…" line — and
those two are DIFFERENT states: the badge means not on the device, the up arrow
means queued to upload, so a local copy exists and the picker is merely slow to
release it mid-transfer. From a session there is no way to tell which one a given
frame is in, and the remedies differ, so the copy names both.

WHAT WAS RULED OUT, and why none of it is offerable. Showing progress during the
pick — the app is not running. Opening files as they arrive — the picker returns
the whole selection at once. Skipping the picker for a folder already seen —
iPad Safari has no persistent file handles, which is the same lesson that put
the session store in IndexedDB in the first place (see session.ts's header);
re-offering it would be offering a capability already recorded as impossible.
Sorting the picker by downloaded state — the picker is Apple's, and it does not
sort by that; the cloud badge is the only signal it gives.

SO WHAT SHIPPED IS THE EXPLANATION, plus the pointer to the mitigation the app
already has. Under Open image(s), one line saying the wait belongs to iOS and
what a cloud badge means. In Help, a "Why the Files picker hangs" section with
the two badge states, Download Now in Files, the Optimize iPad Storage switch
(named as a setting, not a menu path — Apple has moved it more than once), and
picking fewer at a time, since the picker fetches all of them before returning
one. And the part worth knowing: the wait is once per SET, not per edit — a
session copies each original into the app's own storage, so going back to those
photos is Resume session, which touches neither iCloud nor the picker, and Done
is what throws that copy away.

NOT VERIFIED ON DEVICE: everything above about the picker's behaviour is read
off the screenshot and the platform's documented eviction behaviour, not
measured here — a headless Chromium harness has no iOS document picker. What
WAS verified: the copy renders above the fold at 1100x850 and at 834x1112, the
Help section is present and rendered, axe is clean, and the note reuses
`.welcome-open-hint` rather than introducing a colour.

## Full-app review (ultracode), 2026-07-15 — findings ledger

> An 11-dimension multi-agent review over the whole repo; every problem below
> marked FIXED was re-verified in code by hand and is covered by the verify
> suite where a headless check exists. DEFERRED items are real but need their
> own release (or an owner decision) — do not re-discover them.

FIXED 2026-07-25, later session ("the pairs are not matching still" — the
owner's NEF + Lightroom-DNG twins of the same shot: the DSC_4940 pair + the
DSC_4776 NEF, all D5300 full-spectrum). THREE decode bugs made a NEF and its
DNG twin render as different photos:
(1) The DNG path IGNORED LinearizationTable (tag 50712). Lightroom's DNG of
a LOSSY-compressed NEF (what the D5300 shoots) stores the CFA in the
companded curve domain (stored 0..3084; the 3085-entry table maps to linear
0..16383); treating those values as linear rendered the twin ~5.4x dark
(p99.5 at 0.16), with its REAL 28% clipping reading as 0.000% — so Recover
never armed and WB/exposure were computed on companded data. Fix in
dngRaw.ts finish(): map the CFA through the table before black/white (the
DNG spec order). The Z 50 practice DNGs carry no table (lossless source),
which is why 44 frames never showed this. CORRECTS THE LEDGER BELOW:
DSC_1709's "residual NEF-vs-DNG ~3x scale difference (Adobe's conversion
headroom)" was THIS bug, not headroom.
(2) The DNG path took ColorMatrix1 (50721), which in a two-matrix Adobe DNG
is the ILLUMINANT-A (tungsten) calibration (50778=17); the daylight D65
matrix lives in ColorMatrix2 (50722, 50779=21). decode.ts readCameraMatrix()
now prefers the daylight calibration (D65 > D55 > D75 > D50 > daylight >
untagged > rest), matching dcraw/LibRaw reference behavior. The bundled
practice DNGs carry only 50721 — their pick is unchanged.
(3) The NEF path hardcoded the Z 50 matrix for EVERY body (the deferred
"per-model table" item). color.ts nikonColorMatrix(model) now keys off the
file's own Model tag (272, via the new Ifd.str()): D5300 → Adobe's D5300
ColorMatrix2, taken VERBATIM from the owner's own DNG twin of DSC_4940;
anything else → Z 50 exactly as before. export.ts getSource() shares the
same helpers, so preview and native export agree by construction.
VERIFIED (scratchpad harnesses; every check fail-first proven):
• Decode-level: the 4940 twins now agree — same camMatrix both sides,
  normalized channel means within 2.6% (the WhiteLevel residual: Adobe
  writes 15892, the NEF curve tops at 16383 — absorbed by auto exposure),
  gray-world gains equal to 3 decimals, clip 28.3% vs 29.4%.
• App-level (built app, real #file input, headless Chromium): both twins
  land on the IDENTICAL auto-open baseline (wbR 505, wbB 668, recover 0.7)
  and the full-frame canvas diff is mean 0.34/255. CONTROL: the pre-fix
  build through the same walk diverges (recover 0 vs 0.7, wbR 529 vs 505;
  diff mean 31.6/255). Zero page errors.
• Regression: all 44 practice DNGs decode BIT-IDENTICAL before vs after
  (MD5 over the linear buffer + camMatrix), and the practice-tile app walk
  is unchanged.
NEEDS THE OWNER'S HANDS / STILL OPEN: (a) on-device pass — D5300 NEFs now
render through Adobe's real D5300 matrix, so their open look CHANGES from
the old Z 50-matrix look (the LR-familiar rendering, more color
separation); (b) the DSC_4776 DNG twin never arrived (its zip was too big
for the chat upload; Drive delivery to a session is hard-capped at
10 MB/file) — its NEF decodes clean on the same path, but that pair itself
is unverified until the owner re-sends a smaller zip; (c) the ~3% white-level
residual (curve top vs Adobe's true saturation point) stays a candidate for
a per-model saturation table, absorbed by auto exposure today.
RESOLVED same night — the "1709 still mismatched / channels swapped" report
(owner's Quick-look screenshot on the fixed build; DSC_1709 pair re-sent):
NOT a decode bug. The owner's Lightroom-iOS DNGs embed a Rob Shea IR camera
profile, and it differs per photo: DSC_4940 (and, per the matching
screenshot tiles, 4776) carry ProfileName (50936) "Infrared Temp -100",
DSC_1709 carries "Infrared Temp -50" (both ProfileCopyright "Rob Shea").
LR bakes the ASSIGNED profile's ColorMatrix1/2 into each DNG (the two
files' ForwardMatrices are identical — only the CMs differ), so each DNG
legitimately renders per its own profile and the app is RIGHT to honor it.
The NEF-side hardcode (read from 4940's DNG) is therefore the "-100"
PROFILE matrix, not Adobe stock — color.ts now says so (deliberate
deviation from dcraw's stock D5300 matrix: stock matches NONE of the
owner's real files; -100 is the owner's standard). PROOF the profile is the whole
story: rendering the 1709 NEF through the -50 matrix from its own DNG twin
matches that DNG at mean 0.61/255 (max 4); through the default -100 matrix
the diff is 13.5/255 — exactly the reported difference. The linearization
fix holds on this pair too (NEF/DNG normalized means agree within ~2%).
If a pair with a non-"-100" profile should match exactly: re-export that
DNG with the -100 profile, or the owner names a different NEF default
(one-line change). Profile-aware NEF defaults beyond one per model are
impossible — the NEF simply doesn't say which profile the user assigned.

FIXED 2026-07-25 (the "dark daytime frame" — DSC_1709 NEF vs its DNG twin,
owner-supplied ground truth): the NEF path's black pedestal was the Z-series
1008 for every body, but the D5300's true pedestal is 600 — the NEF file SAYS
SO in MakerNote tag 0x003D (four u16, one per CFA site), and the Adobe DNG
twin carries BlackLevel 600. On normal exposures the 400-count error is a
~2.6% shadow shift; on a deeply underexposed frame (CFA mean 1035!) it
destroyed nearly the whole signal — a bright-daytime shot rendered as dark
neon garbage, which was earlier MISDIAGNOSED as a genuinely dark scene (the
+6-stop exposure-range widening that came from that misdiagnosis is kept —
generic headroom, harmless). FIX: readNefCfa now reads 0x003D and uses it as
the black fallback (DNG-tag 50714 still wins if present; then 0x003D; then
the bit-depth default). Verified: DSC_1709 NEF at the app's auto baseline now
renders the correct bright daytime scene; twin-vs-twin CFA alignment
confirmed at (0,0); the residual NEF-vs-DNG scale difference (~3x) is
Adobe's conversion headroom and is absorbed by auto exposure. [CORRECTED
same day, twin-matching entry above: that "~3x headroom" was the ignored
DNG LinearizationTable — real, and fixed.] DSC_4940 black
1008 → 600: full battery re-run clean (decode pure, invariants hold,
recover slider cleans from 0.5; auto 0.7 keeps margin). GOTCHA: never assume
one Nikon body's levels for another — the NEF carries black (0x003D) and
white (curve top); read the file.

FIXED same day (quick-look/session thumbnails didn't match what opening
shows, owner IMG_1255/1256): makeThumb rendered bare WB+matrix, but OPENING
also applies the persisted creative grade (swap/sat/tint carry across opens
by design) — with a look active, thumbs were a different color world (yellow/
blue vs teal/orange). makeThumb now renders through the REAL compileEdit with
the live creative params plus each photo's own auto baseline (WB, exposure,
auto-recover; spatial extras cleared — masks/glow/clarity/LUT/grain need maps
a thumb doesn't have). Thumbs now match their opens at generation time.
NEEDS OWNER'S EYES: thumbnail appearance on device (harness covers code path
+ build only).

OWNER RULING 2026-07-25 REV. 2 — AUTO BASELINE AT OPEN, PER FILE TYPE.
The blanket "nothing at open" below was a STABILIZATION MEASURE, adopted
because the build was not staying reliable enough to test at all, and never the
product. The product was settled by four answers in chat: the denoise is a
lighter touch than it was; there is no dark-scene special case, because no
infrared photograph is shot in the dark; the baseline should be what apps of
this class normally do; and it is automatic, with the untouched decode still
reachable behind a Hold control:
- RAW (isRaw: NEF, mosaiced DNG, lossy-linear DNG): gray-world WB + auto
  exposure (bright-end 0.85 — no dark-scene special case, per answer 2) +
  measured denoise (owner-tuned 2026-07-12: barely clears the grain) +
  Recover-highlights 0.7 iff sampled clip fraction > 0.05% (camMatrix
  sources only — recovery renders only there). 0.7 calibrated: lowest
  fully-clean value on DSC_4940 is 0.6, plus margin; industry-normal —
  LR/ACR/C1 apply (stronger) reconstruction unconditionally in default raw
  rendering (the answer to the owner's Q3).
- CAMERA-RENDERED (JPEG/HEIC/PNG/third-party previews): as the camera made
  them + measured denoise ONLY (lighter touch, answer 1).
- Reset returns to this baseline (answer 4). NEW "Hold: Untouched" button
  beside Hold: Original renders the bare decode (all params neutral) while
  held — the "original option" of answer 4. Hold: Original = the opened
  baseline, as before.
- Baseline values are VISIBLE on sliders, undoable, and never mutate pixels
  — the three tests any future at-open automatic must pass (CLAUDE.md).
autoAdjust (Basic Auto button) now also sets recover on clipped camMatrix
raw, so Auto reproduces the open baseline exactly.
VERIFIED (built app, headless Chromium, real mouse input): RAW opens
balanced (wb split, exposure set, denoise>0, recover 0 on a clean file);
clipped-raw path proven by D5300 clip fraction 28.76% >> 0.05% bar (walk
covers the below-bar side: hillside's 0.004% edge strip stays 0 — by
design); JPEG opens WB/exposure untouched + denoise measured + recover 0;
Hold: Untouched shows the bare decode and restores on release; Hold:
Original shows the baseline after edits; Reset returns to baseline; zero
page errors; tsc + vite build clean. Full-frame auto-open render of
DSC_4940 (wb 0.56/1.05/1.83, expo 0.67, recover 0.7): clean, no artifacts.
setPointerCapture in the hold wiring is now try/catch-guarded (synthetic
pointers have no id; capture is best-effort).

(SUPERSEDED by rev. 2 above — kept for the ledger:)
OWNER RULING 2026-07-25 — NOTHING HAPPENS TO A PHOTO AT OPEN. FINAL.
The ask was that nothing whatever happens to a photograph at open. A photo opens
exactly as decoded: WB [1,1,1], exposure 1, denoise 0, and NO automatic
highlight repair. Every automatic adjustment is now an EXPLICIT press: Auto
(Basic: WB + exposure + denoise), Auto WB (top of IR tab: WB only), tap-WB.
The entire highlight-recovery subsystem (src/raw/highlights.ts and its two
decode-stage call sites) was REMOVED under this ruling — after three
owner-caught artifact regressions (desat flattening, lawn squares, leaf
square) the automatic-repair approach is dead. The final audited version of
the code survives at commit bf5fe0a if repair ever returns AS AN EXPLICIT
USER CONTROL — never automatic, and read the audit ledger below first. The
white-level fix (reading each NEF's own saturation) STAYS: that is correct
decoding of file metadata, not modification of the photo. Consequence
accepted by the code (documented, not hidden): heavily clipped IR frames
(e.g. D5300 full-spectrum) show green fringes at blown edges again, because
that is what the sensor data contains; the user edits from the truth.
The entries below this line record the removed subsystem's history and its
audit — kept as the gotcha ledger, NOT as live documentation.

SHIPPED 2026-07-25, same session — "Recover highlights" slider (Basic tab,
id `recover`, EditParams.recover, DEFAULT 0): the RIGHT construction, after
the owner demanded it be figured out properly. Why every decode-stage repair
failed: before white balance, "what colour should a blown pixel be" has no
answer — every version had to GUESS hues (neighbour, global prior, fixed
ratio) and every guess painted artifacts. The answer exists only AFTER WB:
a blown highlight is NEUTRAL in the white-balanced image, by definition —
and camToSrgbLinear row-normalizes the camera matrix precisely so neutral is
preserved, so a post-WB-neutral reconstruction CANNOT shift colour through
the matrix. Mechanics (identical in gl.ts shader and pipeline.ts
compileEdit): clip severity from the SOURCE sample at the sensor pin
(smoothstep 0.985–0.995 native — data below the pin is mathematically
untouchable), applied after WB / before the camera matrix as
mix(c, vec3(luma(c)), recover*sev) — the pull is toward the pixel's OWN
post-WB luminance, so surviving channels keep driving texture (skies don't
flatten), and it is scale-invariant (exposure-folding safe) and re-aims
LIVE as the user rebalances. Per-pixel only — no neighbourhoods, no search:
structurally incapable of squares/seams. Raw sources only (u_useCam/cam).
Excluded from SavedLook (per-shot corrective, like WB). VERIFIED: fringe
metric 8492 at recover=0 (untouched, the ruling holds) → 0 at recover=1;
zero below-pin pixels altered (all 694 changed pixels in the building probe
individually confirmed >= 0.985 native); full-frame at 0.8 = clean textured
white sky, no artifacts; headless in the built app on hillside.dng: default
0, live GPU render responds, Undo → 0, Reset → 0 with render hash equal to
the original, zero page errors.
GOTCHA (bit us here): applySnapshot() restores EditParams FIELDS
INDIVIDUALLY — a new field must be added in FIVE places or undo/reset
silently drop it: cloneParams, applySnapshot, syncFromUI, syncToUI, and the
input-listener array. `recover` initially missed applySnapshot and
Undo/Reset ignored the slider.

FIXED 2026-07-24 (native NEF highlights on non-Z50 bodies — the "other
users can't use it" report; owner's D5300 full-spectrum frame DSC_4940):
- The native-NEF white level was HARDCODED to 15520, which is the Nikon Z 50's
  saturation point. NEFs carry no DNG level tags, so every OTHER camera got the
  Z 50's ceiling too. A D5300 saturates at 16383 — feeding it 15520 pushed the
  whole frame ~6% over and pinned ~14% of it (all the sky + IR-lit foliage) past
  white with NO headroom to recover. Noah never saw it because the owner feeds the app
  DNGs (Adobe DNG Converter writes real per-file black/white/ColorMatrix, and the
  DNG path already reads them); the hardcode only bites on native NEF opens.
- FIX: white is now read from the FILE'S OWN linearization curve
  (`curve[curveMax-1]` in readNikonParams — the largest value the decoder can
  emit, which IS the saturation point; dcraw/LibRaw take the maximum the same
  way). Camera-agnostic and exact for LOSSY NEFs (real curve in the file):
  D5300 → 16383, verified on DSC_4940.NEF (white 16383, over-range pixels
  3.36M → 0, max linear 1.0595 → 1.0000; tsc clean). AUDIT CORRECTION
  (2026-07-25, blocker): LOSSLESS NEFs (ver0 0x46 — Z 50/Z 6/Z 7/D850) carry
  NO linearization table, so the identity-curve top (16383) silently replaced
  the Z 50's calibrated 15520 and disabled recovery for them. Fixed: a
  hasCurve flag now gates the curve-derived white; no-curve files fall back to
  15520 at 14-bit (the pre-branch behavior), 12-bit no-curve → 4095 with black
  252 (pedestal scaled by bit depth). Also fixed same audit: the lossy-branch
  grid write at index (csize-1)*step could land exactly at `max`, silently
  dropping the LAST grid value so the curve tail ramped toward identity —
  write index now clamped so the top grid value anchors the tail (dcraw's 64K
  buffer equivalent). Verified with synthetic MakerNote blocks: 0x46 14-bit →
  15520, tail-OOB lossy grid → grid top (was ~16369), 12-bit → 4095, real
  D5300 unchanged 1008/16383. NO real Z 50 NEF exists in any session so far —
  the lossless path is synthetic-verified only; first real Z 50 native-NEF
  open still needs eyes.
- NOT touched (measured, low value here): the NEF path still applies the Z 50
  ColorMatrix1 to every body and defaults black to 1008. After the pipeline's
  row-normalization + tap-WB, swapping in a D5300 matrix was visually ~nil on IR
  frames (rendered both — near-identical), and I had only dcraw's D65-convention
  matrix, not a convention-matched Adobe ColorMatrix1, so guessing it in was
  higher risk than value. Black 1008 errs high (crushes a little shadow) which is
  safer than a milky lift; both are candidates for a real per-model table later.

FIXED 2026-07-24 (IR highlight fringe + blown-sky flattening — the "D5300
cleanliness report against the Z 50, DSC_4940 + the five
staging screenshots; TWO attempts, the first REJECTED — read both):
- SYMPTOM: lurid lime-green (and magenta) fringes on every high-contrast edge
  (bare branches against bright sky), plus a wide green band around thick
  branches. Present in BOTH the binned proxy and the native export, so it's in
  the channel data, not the demosaic.
- ROOT CAUSE (measured on edge scanlines, raw camera-native values): infrared
  floods RED, so red saturates (pins at the white level) long before green and
  blue. At a bright edge red is stuck at 1.0 while G/B still fall off; the
  camera matrix turns that lopsided ratio into bright green. The WIDE band is
  the same physics one step deeper: sky regions where R AND G are both truly
  clipped while B still carries real gradient (B 0.55–0.99) — two pinned
  channels + one falling channel = green through the matrix. Worse on the
  D5300 (hotter conversion, more IR in red) than the Z 50.
- ATTEMPT 1 — REJECTED BY THE OWNER, DO NOT REBUILD IT: per-pixel desaturation
  toward max(r,g,b) via smoothstep(0.9,1.0) in both renderers. It killed the
  fringe but OVERWROTE THE UNCLIPPED CHANNELS — the blue channel carrying the
  sky's real cloud gradient got averaged up into the clipped garbage, and every
  near-clip region (0.9–1.0 = genuine bright detail, not clip) collapsed to one
  flat tone. Owner's screenshots: whole skies as flat salmon/magenta slabs.
  What was wrong, in one line: every channel was being reduced to the least
  common denominator of the three. OWNER
  RULE (standing, non-negotiable): NEVER discard captured channel data to hide
  a broken channel — rebuild the broken channel from evidence instead, and
  never touch a value the sensor actually resolved.
- ATTEMPT 2 (global bright-hue prior for deep regions) — OWNER-REJECTED on
  device (IMG_1246): square blotches on the lawn. The prior was foliage-hued
  and wrong for grass, and where its aggressive rebuild met the local tier's
  honest "barely clipped, leave it," the disagreement drew the search radius
  itself — Chebyshev balls are squares — as visible blocks. GOTCHA for any
  future spatial repair: any hard accept/reject boundary in a rebuild WILL
  print its own geometry onto smooth image regions; every spatial influence
  must fade smoothly to zero.
- ATTEMPT 3 (local ring hue extended to deep 2-channel regions) — caught in
  harness full-frame render before shipping: painted the open sky near the
  canopy in canopy hue at 4x intensity (blazing orange, blocky). Root lesson:
  when R AND G are both pinned, NO neighbourhood testifies to the true hue —
  borrowed hue is a category error in both directions (canopy hue → orange;
  even true sky hue still renders green because a pinned G contradicts it).
  Also: render the FULL FRAME every verification round, not just crops — the
  orange sky sat exactly where no crop was looking.
- SHIPPED: src/raw/highlights.ts, recoverCfaHighlights(), run ONCE on the
  decoded CFA inside readNefCfa (nef.ts) and readMosaicedCfa (dngRaw.ts) — the
  two chokepoints every raw pixel flows through — so proxy, live shader and
  native export all see the same repaired data; gl.ts and pipeline.ts carry NO
  recovery code. Quad resolution, summed-area table for clean-quad lookup:
  (1) only sites >= 99% of white are ever written, and only ever RAISED (a
  clipped value is a floor — truth is at least white; raise-only also makes
  overlapping writes compose as max, so order can't matter);
  (2) R-only clipped near clean data: rebuild along the nearest DENSE clean
  ring's hue (>= ~1/8 ring occupancy — a lone clean quad is usually a stray
  object of another material and must not steer; owner-caught halo), fading
  smoothly to zero over RSOLID=10 → RMAX=20 quads;
  (3) R-only clipped anywhere: warm fallback R = 1.5 x the pixel's OWN green
  (WARM_RG), gated by low-blue severity smooth01(0.1,0.3,1-B) — with B near
  white the pixel already renders pale and is left alone;
  (4) R+G both clipped (blown sky, bright pockets): fixed WARM_RG targets,
  same severity gate, ZERO spatial evidence — so zero seams; the surviving B
  is untouched and keeps carrying the real cloud texture;
  (5) noise ramp smooth01(1.05,1.25) on target/measured everywhere — targets
  within noise of white do nothing (this is what keeps noisy near-clip grass
  from speckling); LIN_CAP=4; fully blown quads and non-(R,G) double-clips
  stay exactly as decoded.
- VERIFIED (real compileEdit path, DSC_4940, fail-first proven): green-fringe
  metric 8492 → 0 with recovery, 8492 with recovery stubbed; bit-level CFA
  diff across all 24,160,256 sites: 0 unclipped sites changed, 0 sites
  lowered, ~1.15M truly-clipped sites rebuilt (4.8%); deep-sky unclipped B
  (the gradient) bit-identical; full-frame render smooth (no seams, no
  orange, cloud structure restored). ~1.0-1.5s recovery on a 24MP NEF in node
  (~2.4s Safari est.) — PAID PER DECODE, not once: open, export (re-decodes),
  twice per batch file, once per quick-look NEF (audit correction 2026-07-25;
  the earlier "one-time per open" note was wrong). Practice-library churn,
  measured across ALL 44 DNGs (not just lodge.dng — the earlier "library
  BIT-IDENTICAL" claim was an overreach from one file): 38/44 bit-identical;
  6 files change only truly-clipped specular sites, at most 228 sites
  (hillside.dng, 0.004%), zero lowered, zero unclipped touched, invisible at
  normal exposure. NEEDS THE OWNER'S HANDS: live view + export on the real
  iPad from staging (all measurements are node/CPU-pipeline; the GPU path
  consumes the same repaired data so it should match, but that's inference,
  not measurement).
- AUDIT 2026-07-25 (owner demanded "find ALL of it"; 55-agent adversarial
  audit: 44-DNG sweep, synthetic property tests, correctness/integration/perf
  reviews, headless app walk, copy sweep; every finding independently
  refuted-or-confirmed). CONFIRMED + FIXED same day:
  (1) BLOCKER — the ring-density gate accepted tiny clean islands (a leaf on
  the blown lawn) and the RSOLID fade is identically 1 for r<=RSOLID, so an
  11x9-quad FULL-STRENGTH rectangle printed around the leaf on DSC_4940
  (max render delta 119/255). Fix: evidence strength is now smooth in ring
  occupancy (smooth01(need, 3*need, onRing)) AND in total clean mass within
  the search disc (smooth01(24, 96, discMass) — a stray island is ~11 quads,
  real structure is hundreds), mass gating ONLY the evidence branch (the
  evidence-free warm fallback must keep working in deep pockets). Verified:
  audit square zone max delta 119 → 2/255; lawn >40-delta pixels 6650 → 275,
  ALL remaining diffs confined to genuinely-clipped tiny objects rendering
  less lurid (no geometry); hillside speckle amplitude maxDeltaLin 1.62 → 0.5,
  strip renders identical.
  (2) BLOCKER — lossless-NEF white regression (see white-level entry above).
  (3) MAJORS — stale copy everywhere claiming auto-WB at open: Help Quick
  start + Reset bullet (ir.html), Lesson 1 step 2, Lesson 2 (now starts
  "balance first"), Lesson 7 "carries almost no color" (→ "once balanced"),
  docs/ARCHITECTURE.md baseline note. All rewritten to the as-shot truth.
  (4) Write-closure hoist in highlights.ts (~10% of recovery, output
  bit-identical — audit-measured). (5) VERSION 2.2 → 2.3 (capability release
  per the taxonomy). Commit messages rewritten to drop false absolutes
  ("any Nikon", "down to the last bit", "photo's own evidence" for the
  constant-ratio path).
  CONFIRMED, NOT CHANGED (owner calls, flagged in chat): batch still
  auto-balances each frame (its dialog says so — but "Your current edit"
  output now diverges from an as-shot screen by default); strip/quick-look
  thumbnails stay gray-world balanced while opening shows as-shot red;
  creative grade (sat/swap/tint/hue) persists into the NEXT opened photo and
  its Reset baseline (PRE-EXISTING mechanism, measured identical on
  origin/main — but it now contradicts an "opens untouched" reading; owner
  ruling needed); IR-tab Auto WB deliberately does not re-meter exposure
  (measured ~0.21 stops darker than Basic Auto on the test frame); lessons
  open practice tiles as-shot mid-curriculum (copy updated to teach
  balance-first; a teaching-mode auto-balance carve-out is an owner call).
  KNOWN LIMITS (measured, documented): recovery is a silent no-op when
  white=65535 (dngRaw default when WhiteLevel absent — every rebuild clamps
  into the ceiling); recovery is NOT idempotent if ever re-applied to already
  -recovered data (never happens today — every decode is from file bytes;
  do not cache-and-rerun RawCfa through it); odd-dimension last row/col sits
  outside the quad grid (untouched, matches demosaicBinned); D5300 12-bit and
  other-body curves/matrices still approximations (Z 50 ColorMatrix1 applied
  to all NEF bodies — measured ~nil on IR frames after row-norm + tap-WB).

OWNER RULE 2026-07-24 (same session as the highlight work): WHITE BALANCE
OPENS AS SHOT — no automatic gray-world WB at import, ever. The photographer
sees the true starting point and chooses. Auto exposure and auto denoise still
run at open (only WB is exempt). Auto WB is explicit: the Basic tab's Auto
(WB + exposure, unchanged) and the "Auto white balance" button at the TOP of
the IR tab (WB only — rebalances to the photo's own neutral and clears any
look wbBias via lookBias reset; touches nothing else). Its purpose is backing
OUT of a look's color cast without losing the rest of the look. Verified
headless in the built app (2026-07-24): practice RAW opens with WB sliders
neutral + exposure auto-set; IR Auto WB rebalances; one Undo returns to
neutral; button matches the audited accent-outline pattern (same rendered
height as the Basic Auto button).

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
  the structure the owner wants. Cache bumped ips-v33 → ips-v34.
- **Heal / clone** for sensor dust & hot pixels — clone-stamp first,
  content-aware later. PROMOTED 2026-07-14 to the "Next capability release"
  queue as **Dust & spot removal** (owner ask) — see that entry for the plan.
- **Copy settings + batch apply/export** across a folder — builds on the
  snapshot system shipped 2026-07-04; no ML.
- **Channel mixer (full 3×3)** — custom false colour beyond the R↔B swap;
  IR-native, per-pixel. PROMOTED 2026-07-18 to the "Next capability release"
  queue (Creative release, v2.0) — see that entry.
- **UFOs in the trees — playful sticker compositing** (owner ask 2026-07-14,
  given right after the dust-release promotion; the owner will open a NEW CHAT for it —
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
  RIM on thin petals over the blown background (the rim showed in IMG_5958;
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

## A flat frame with something in the corner, and what the gaps actually cost, 2026-09-10

Two rig payloads covering both lenses came in — 9 profiles and 18 profiles —
and two of the 18 were not describing a lens.

**The shape that says so.** A flat frame's brightness falls away from the
centre and keeps falling. `16-50@36@f22.0` turned back UP by 11.8% after bin
66, with a corner brighter than the reference ring (1.042) and colour jumping
0.150 between neighbouring rings; `50-250@50@f4.5` rebounded 32.1% after bin
75, corner 1.094, jump 0.186. Something was in the corner of those frames —
sun creeping in, a reflection, a hood, or a finger.

**The limits are measured, not chosen.** Across all 27 profiles from both
payloads, the 25 good ones rebound 0.0000-0.0077 with colour jumps at or under
0.021. The two bad ones rebound 0.1178 and 0.3212 with jumps at or over 0.150 —
a 15x gap with nothing in it. `REBOUND_LIMIT = 0.03` and `JUMP_LIMIT = 0.05`
sit in that gap. `lensprofile.ts` now refuses both at measure time and names
the four things to look for, rather than storing a curve that would brighten
the corners of every frame it touched.

**AND THE FIRST VERSION OF THAT CHECK PASSED EVERYTHING.** It was placed before
the loop that fills `falloff`, `kr` and `kb`, so it read 80 NaNs and had no
opinion about any of them. A shape check has to run after the shape exists. It
is asserted now by refusing both real bad profiles and accepting two real good
ones, and it was planted away once (5 failures) before being trusted.

**An empty-frame guard that could never fire, removed.** It was measured across
frame sizes: a 60x40 frame already fills 78 of 80 rings, and anything smaller
is caught by the reference-ring or structure check first. A guard nothing can
reach answers "have we handled this" for everyone who reads it afterwards.

**What the gaps cost, by leave-one-out on real frames.** Hide a measurement,
ask for exactly that frame, compare against what was hidden:

- Aperture: hiding f/13, f/14, f/16, f/18 and f/20 at 50mm and correcting with
  the surviving neighbour is off by 2.1 to 5.5 of 255 at worst. Not visible.
  The negative control is the whole range — the f/4.5 curve on an f/22 frame is
  off by 24.8 of 255, so the instrument can tell a bad substitution from a good
  one.
- Focal length: hiding 36mm and correcting a 36mm f/8 frame with the 50mm
  profile is off by 15.0 of 255. Visible.

**So intermediate focal lengths earn far more than more stops, and there is a
structural reason.** Focal length is blended, but only WITHIN one aperture
group — blending across apertures would average two different lens states. A
focal-length leave-one-out therefore needs three focal lengths measured at the
SAME aperture, and the deepest aperture group in the set has two. The
missing-data walk prints that depth per aperture rather than quietly testing
the clamp and calling it interpolation, which is what its first version did:
it compared the blend against the one profile the blend was made of, so the
claim read `w < w`.

**The shipped table is now 22 profiles across both lenses, every one
rig-measured.** The 2026-07 handoff pair is gone, so no shipped profile carries
neutral colour standing in for a measurement — that is asserted, both as "none
is all-ones" and in the walk, because three harnesses had claims written around
the placeholder's existence and all three went green describing a table that no
longer looked like that.

**Generating from two payloads needs a collision rule.** Three keys were
measured in both. More frames wins, and duplicates surviving the merge throw
rather than emitting a table with two rows for one key.

**The agreement claim's first version measured a proxy.** It matched shipped
rows to payload entries by frame count, and the key measured twice with two
frames each matched both, reporting "23 of 22" and a difference that was two
honest measurements being compared to each other. What it holds now is the
property worth holding: every shipped profile is EXACTLY some payload entry,
untransformed, and nothing is in the table that no payload contains.

**Reverting a plant from the index is not reverting a plant.** `git checkout`
on a file wiped uncommitted work in it. A plant is reverted from the scratchpad
copy taken before planting, never from the index.

## Two glass panels on one edge, and a share mark nobody could see, 2026-09-10

Both found in one phone screenshot, and both had been shipping for their whole
life on the surface they broke.

**The share control drew an empty box.** It was `&#x2BAD;` — BLACK CURVED
RIGHTWARDS AND UPWARDS ARROW, the codepoint that most resembles the platform's
own share mark. iOS has no font covering it, so it rendered as tofu: in the
Studio beside the word "Share", and in the Macro app as the button's ONLY
content, where the whole control was a box. It is an inline SVG now, sized in
ems so it rides the text beside it.

The gate is "the share control is DRAWN, not typed" rather than "this codepoint
is banned", because banning the one character already found catches nothing
next time. It also measures the button, which no sweep had ever done: it ships
`hidden` (it exists only inside the installed app), so every hit-area walk
skipped it. 76x44 with the mark at 13px.

**The histogram sat behind the zoom stack.** `#histWrap` was anchored to the
stage's top-right. `#zoomCtl` is bottom-right — but its bottom is pushed UP by
the session strip's height whenever a set is open, and on a phone-height stage
(393x356 measured) the two meet: **1424 square px of the histogram was behind
the zoom stack**, which is most of it. Moved to the stage's top-left, which is
free at every width — `#locTip` owns only the bottom-left.

**A 900px test window is why it shipped.** Every walk before this one ran at
900x950, where the stage is tall enough that the zoom stack never climbs into
the histogram. The claim is an INTERSECTION AREA of the two boxes at the phone
viewport the shot came from, not a look at a screenshot; planted away, it
reported the 1424.

**Not everything in that shot was the app.** A white pill with a downward
pointer was sitting over the R-B channel swap button. In Chromium at the same
viewport, `elementFromPoint` at the button's centre returns the button, and it
has no `::before` or `::after` — nothing in the app paints there.

**IT IS THE APP, AND THIS ENTRY SAID OTHERWISE FOR HALF A DAY.** It was recorded
as iOS Reachability, on the strength of a reading of the screenshot. Then the
same pill appeared in a screenshot from HEADLESS CHROMIUM ON LINUX, which has no
Reachability — and asking the page what was painted there returned
`<span>` at 1083,864, 44x10, containing `&#9660;`: `#panelDown`, the panel's own
"more below" scroll cue.

It is `position: sticky` with `height: 0` and `bottom: 10px`, so it floats over
the panel's content by design and lands on whatever control happens to be under
it — the R-B channel swap button on the phone, HIE B&W in the desktop shot —
covering the middle of that control's label. `pointer-events: none` means it
never blocks the tap, only the reading of it.

**The lesson is the entry itself.** `elementFromPoint` at the button's centre
returning the button was correct and was not enough: a sticky overlay with
`pointer-events: none` is not at the point it covers. "Nothing in the app paints
there" was a conclusion drawn from an instrument that cannot see that kind of
element, and it went into the record as fact. What made it a question rather
than a fix was luck — the cause was named by someone else, and it was wrong too.

**Moved to the right edge, on the owner's call.** Its APPEARANCE was already an
owner ruling (2026-07-20, neutral rather than --accent so it does not vanish
against a selected chip), so the placement was put to them rather than chosen.

The claim is not "the cue does not overlap a control" — it floats by design and
always will. It is that the cue does not meet the MIDDLE THIRD of a control it
vertically overlaps, because every control in this panel centres its label, so
the middle third is where the words are. At both phone and desktop width.
Planted back to centred, it reports `swapBtn "R ⇆ B channel swap"` covered at
393px — the exact control in the photograph — and nothing at 1280px, which is
why a desktop-only check would have called the old placement fine.

## A later measurement is not a better one, and two doors had two rules, 2026-09-10

A store export from the device answered a question three run-exports could not:
what did the app actually KEEP. 23 profiles, and three of them disagreed with
the sound measurement bin for bin.

**What was lost, measured.** `50-250@50@f22.0` was stored from four frames of
sky and came back holding two. `50-250@50@f16.0` had moved by 0.028. And
`50-250@50@f4.5` had moved by 0.318 — it was holding the frame with something
in its corner, not the clean one. All three are keys that two separate runs
happened to cover, and `saveFromPayload` did `list[at] = entry` unconditionally:
whichever run went in last won, regardless of which was better.

**It was not silent, and that did not help.** The running line already said
"50-250@50@f22.0 had 4, now 2" — a warning printed after the loss, among
eighteen other lines, at the moment the reader is being told the run worked. The
fix is to keep the better one, not to describe the worse one more loudly.

**The rule: more frames wins; EQUAL frames still replaces.** Frames are the one
thing comparable between two measurements of the same lens, focal length and
aperture — more of them average out the sky's own gradient. Equal replaces
because re-measuring to the same depth is a deliberate refresh, and refusing it
would leave no way to correct a measurement except deleting it first. A thinner
one is kept out, said in words, with Remove named as the way to force it.

**AND THE OTHER DOOR HAD ITS OWN COPY.** `importText` — Restore from a file —
did its own `list[at] = raw` with no rule at all, so the fix above would have
reached the rig and not the restore button. Both go through one `place()` now.
This is the same shape as the bump-curve pair (LESSONS: two paths turn one input
into one answer and must agree); the difference is that pair was caught by a
test written to compare them, and this one was caught by reading a real store.

**The shape check moved to the door rather than the rig.** It refused a bad
frame while measuring, and a payload can also be pasted in, restored from a
backup, or sent over by somebody else — none of which was measuring. It is
`shapeProblem()` in lensprofile.ts now, exported, called by `place()`. A stored
profile carries its bump curve rather than the falloff it came from, so a
restore sees the colour half only; that half caught both real bad profiles on
its own (steps of 0.150 and 0.186 against 0.021 for the worst sound one).

**A store that already lost measurements cannot be fixed by fixing the rule.**
The repair is a file: the three displaced profiles rebuilt from the run that
measured them, the one that was never a lens dropped, restored in one tap. It is
verified by restoring it over the real store and reading the curves back —
22 replaced, none refused, f/22 four frames again, f/4.5's corner red back from
0.76358 to 1.08111. The dropped one has to be removed by hand: a restore adds
and replaces, it does not delete, and deleting somebody's measurement because it
is absent from a file is not something a restore should ever do.

**The run-export and the store-export are different files and only one is a
backup.** "Save as a file" writes `lens-profile-<date>.json` — the run just
measured. "Save a backup of all of them" writes `lens-profiles-<date>.json` —
the whole store. Three run-exports arrived, two of them identical, and the
question "did a run get lost" could not be answered from them at all. Ask for
the store export.

## The gaps report had two copies and two different bugs, 2026-09-10

A screenshot of the panel said "135mm share no aperture with the sweep at 50mm"
— a plural verb on a list of one, which is the visible half. The invisible half
is that the sentence was WRONG: 130mm shares no aperture with that sweep either
(it has f/5.3 and f/29 against a sweep running f/4.5 to f/22), and was never
examined, because the check looked only at focal lengths measured at exactly ONE
aperture.

**Under-reporting a gap is worse than reporting no gaps.** The reader plans the
next trip out from that sentence. "135mm" says take one frame at 135mm; the
truth was that the whole 130/135 cluster is untied from the 50mm sweep and one
frame at either would tie it in.

**There were two copies, with two different bugs.** `coverage()` in lensstore.ts
serves the stored panel; the rig had its own in lensrig.ts for the run just
measured. The rig's version reported only when NO single-aperture focal length
shared with the sweep, and then named all of them — so one tied and one untied
produced SILENCE. Neither bug was visible from the other file. `gapsFor()` is
the one copy now, and the claim that holds it is not either behaviour but "one
file builds these sentences", scanned across src.

**The right definition is structural, not a count of apertures**: a focal length
is untied when it shares no aperture with ANY sweep. That reaches a focal length
with two apertures, which the old rule could not, and it stops the first sweep
being the only reference.

**And the test that found it used the real store.** `coverage.mjs` runs against a
synthetic fixture whose untied focal lengths happen to have one aperture each,
so it went green through both bugs and is still green. The store off the device
had the shape neither fixture had. A fixture built to exercise a rule tends to
be built out of the rule.

## A gate that refused good work, and the first real test of blending, 2026-09-11

A six-frame 130mm f/16 came in with a clean monotone falloff to a 0.597 corner
— and the shape check refused it. Its colour stepped 0.066 between its last two
bins, over a limit of 0.05.

**The frame was fine and the limit was wrong.** The outermost rings are slivers
of the frame's corners, and a real lens can fall away fast there. What a lens
cannot do is turn a corner. The first version of this measured the raw STEP
between neighbouring rings, calibrated on 27 profiles where the two bad ones
happened to be both steep and kinked.

**Measured again on 35, with three candidate measures rather than one:**

- raw step: sound 0.0063-0.0659, bad 0.1503-0.1865 — 2.3x, and 0.0659 is a
  sound profile that the 0.05 limit was already refusing.
- reversal (the curve moving against its own direction): OVERLAPS. One of the
  two bad profiles reverses by only 0.0035, less than a third of the sound ones
  do. The shape that reads as "obviously wrong" is not the discriminator.
- curvature: sound 0.0061-0.0277, bad 0.0954-0.1512 — **3.4x clear**.

`CURVE_LIMIT = 0.05` sits in that gap, 1.8x above the worst sound profile and
1.9x below the mildest bad one. Both directions were planted: at 99 a backup
carrying the bad f/4.5 is stored (corner red 0.76358 again); at 0.005 five sound
profiles are refused. A limit with only one plant is a limit tested on one side.

**AND THE TWO BAD PROFILES COULD NOT TEST IT.** With the curvature check
disabled entirely, both are still refused — by the falloff rebound, which fires
first. The colour half only decides on its own where there is no falloff to
read, which is the RESTORE path: a stored profile carries its bump curve, not
the falloff it came from. That is where its negative control lives.

**The shape check moved into the generator too.** The two bad profiles had been
taken out of a payload BY HAND into an `m2-clean.json`, which meant the table
was built from a file nobody else reads and the test that checked the table
against "the measurements" was checking it against the cleaned copy. Same
function, three callers now: measure, store, generate.

**THE FIRST REAL LEAVE-ONE-OUT ON FOCAL LENGTH.** Blending happens only WITHIN
one aperture group, so the test needs three focal lengths at the SAME aperture,
and for two days the deepest group had two — the missing-data walk printed that
depth instead of quietly testing the clamp and calling it interpolation. f/16
now runs 50, 130, 200 and 250mm. Hiding an interior one and blending across:

- 130mm hidden, blended from 50mm and 200mm: **4.7 of 255** on brightness, and
  18.2 points on colour, which is the larger error and worth saying.
- 200mm hidden, blended from 130mm and 250mm: **0.9 of 255**.
- And the control that makes the number mean something: snapping 130mm to the
  nearest measured end instead is 8.6 of 255. The blending is doing work.

**The shipped table is 30 profiles and the 50-250 spans its whole range**
(50, 130, 135, 200, 250mm). The 16-50 still has two focal lengths, both at 36mm
and above — 16mm and 24mm are hard to fill with clean sky on a DX body, where
24mm sees about 61 degrees and 16mm about 83, so the sky's own gradient and the
horizon are both in the frame. Recorded as a REASON the wide end is thin, not as
an oversight to be fixed by asking for the same frames again.

## A width rule keyed on the element, and the one control that cannot be one, 2026-09-11

"Restore from a file" came out 163px wide in a column of 293px controls. It is a
`<label>` wrapping a file input, because that is the only way to style a file
picker — and the rule that makes controls full width is
`select, button { width: 100% }`, keyed on the TAG.

**So the one control that cannot be a button is the one that silently opts out
of the button styling.** Not just this one: "Choose flat frames" is the same
shape and had the same defect, four rows higher, and nobody had noticed it
either. The width now belongs to `.dbg-btn` — the class that says "this reads as
a button here" — rather than to the element, along with the block display,
centring and line-height that a label does not get for free.

**The a11y sweep could not have caught it.** Every one of these was already
44px tall and cleared its hit area; the sweep asks whether a control can be hit,
not whether a row of controls is a row. Ragged widths are not an accessibility
failure and are not a functional one; they are only visible.

**The claim is per ROW, and the first version was not.** It compared every
`.dbg-btn` in the dialog against every other and reported two failures that were
two correctly different rows at different nesting depths — 319px at x=16.7 and
293px at x=29.7. A fault in the question rather than in the page. Grouped by
`.dbg-actions` container, it reads the same rows a reader sees.

## Five proxy reads in one harness, and the app was right all along, 2026-09-11

Nineteen wide-angle frames arrived to answer whether a circular sample of a
frame's middle could measure a lens the corners cannot. The answer came back,
and so did a lesson about instruments that is worth more than the answer.

**THE APP WAS NEVER WRONG. THE HARNESS WAS, FIVE TIMES.**

1. It polled for the shape of a SUCCESS — `#lensOut` unhiding, or a refusal word
   in the running line. A run that refuses every frame and says so in its own
   words matches neither, so it waited the full fifteen minutes and reported a
   timeout. Fixed by polling for the dialog going QUIET, which cannot miss an
   outcome it did not anticipate.
2. It then read `#lensOut` alone and concluded the reader is told nothing. That
   element is the tail of the panel.
3. Told to read the whole dialog, it used `innerText` — which excludes a
   collapsed `<details>`, and the per-frame reasons live inside one. Three
   separate reads missed them for that reason alone.
4. A claim that the app "says why" searched the whole dialog and passed on the
   word "corners" in the INTRODUCTORY HELP TEXT, which is on screen before a
   single frame is read. Anchored to the run's own output, it passes honestly.
5. A claim that the app does not offer to store a measurement it does not have
   searched `textContent`, which includes HIDDEN markup — reporting an offer
   that is not on screen. `offsetParent` is the question; presence in the DOM is
   not. That defect did not exist.

**What the app actually says**, once it can be read: `NIR_3317` at 25mm —
"this is a photograph of something, not a flat — brightness varies by 73% around
a circle, where empty sky varies by a few percent". `NIR_3327` at 16mm —
"11.2% of it is clipped — a blown flat has stopped recording the falloff". Both
correct, both precise, both actionable. An independent measure agreed: 50-61%
azimuthal variation at r=0.5 on the same frames.

**THE ONE REAL DEFECT, and it is the shape of all five faults above.** Those
reasons sit in a `<details>` that starts shut. That is right for a run where
everything worked and the log is thirty rows of confirmation. It is wrong the
moment a frame is turned away — and when NOTHING was measured the reasons are
the only content there is, so the reader saw "Measured 0 frames in 1s." above a
note reading "see the reasons above", pointing at a closed triangle. It opens
now whenever any frame was refused.

**And two faults in the MEASURE, found on real infrared sky:**

- **Ring spread counts noise as structure.** `sqrt(var)/mean` over a ring's
  pixels includes shot noise. Negligible on a bright low-ISO flat; these frames
  are ISO 640-1400 at a mean level of 0.08-0.25, where noise alone is several
  percent — and `lensprofile.ts`'s own structure check has exactly this form, so
  it inflates on any dark high-ISO flat and can refuse a good one. The fix is to
  split each ring into angular sectors, average WITHIN a sector (which kills
  noise) and take the spread of the sector MEANS (which keeps cloud and horizon).
  Measured both ways on the same frames: 0.0710 by pixels against 0.0594 by
  sectors at r=0.15, and on a clean synthetic control 0.0025 against 0.0000.
- **`kr = R/G` IS UNDEFINED IN INFRARED.** Green at the centre of these frames
  runs 0.000 to 0.051 of full scale, and is EXACTLY 0.000 on all nine 16mm
  frames, against red at 0.197-0.493. The guard is `green > 0`, so a green of
  0.004 passes it and returns a red-to-green ratio of 81; one frame reported
  74745. The existing 30 profiles are sound because those frames were brighter,
  but an app that processes only infrared cannot have its colour reference
  channel be the one that goes to zero.

**The wide-angle answer itself**: not from a centre sample, not from these
frames. Azimuthal contamination is 4-10% at r=0.15 and 39-55% at r=0.30 on the
16mm set, against a hot-spot signal of 5-25%. The cloud runs through the middle,
so there is no radius at which a circle is clean. The idea is sound; the frames
have to be.

## Two faults in the measure itself, found on real infrared sky, 2026-09-11

Both were in `lensprofile.ts`, both invisible on the frames the rig had been
fed until now, and both were measured on 25 real frames before either limit was
touched.

**STRUCTURE COUNTED NOISE AS STRUCTURE.** The check that tells a flat from a
photograph took the spread of a ring's PIXELS. That includes shot noise. On a
bright low-ISO flat it is nothing; on a dark high-ISO one it is most of the
reading — a clean synthetic frame read 0.0048 where the truth is zero, 95%
noise, and frames at ISO 640-1400 with a mean level of 0.08 carry 0.08-0.14 of
pure noise against a STRUCTURE_LIMIT of 0.15. A genuinely flat frame, shot dark,
was refusable for being grainy.

Each ring is split into 24 sectors now; the mean within a sector averages the
noise away and the spread BETWEEN sector means keeps everything that varies
around the circle. Measured both ways on all 25: clean frames read 0.0002-0.0118
by sectors against 0.0048-0.0136 by pixels, contaminated ones 0.4913-0.8715.

**And the property that makes it safe is an INEQUALITY, not two limits that
agree today.** A sector mean can never be noisier than the pixels it averages,
so the new reading is always at or below the old one — nothing accepted today
can become refused. That is the claim the walk holds, over every frame, rather
than "both numbers separate on this set". 12% to 95% of the reading was noise.

**GREEN IS THE DENOMINATOR, AND IN INFRARED IT GOES TO ZERO.** kr and kb are red
and blue AGAINST GREEN. The guard was `green > 0`. On nineteen real frames the
reference-ring green ran 0.003-0.038 in linear light and the ratios came back at
10 to 41; one frame reported 74745. In 8-bit terms a green of 0.003 is a code of
about 10, where one code step is a tenth of the value — 10% of quantisation
error per ring, against the 5-25% effect being measured.

`GREEN_FLOOR = 0.09` sits in the gap: clean frames measure 0.252-0.283, so it is
2.4x above the worst nonsense and 2.8x below the good. Below it the frame still
measures BRIGHTNESS, which is carried by red and is unaffected — only colour is
withheld, and the per-frame row says so.

**THE PLANT IS WHY THAT IS WORTH MORE THAN A CLAMPED NUMBER.** With the floor at
0, the green-empty control is not merely wrong, it is REFUSED — "the colour
turns a corner, it bends by 0.11" — because an empty denominator makes a kinked
curve out of nothing. A sound brightness measurement was being thrown away for
a colour fault the frame could not help.

**NEITHER LIMIT HAD A POSITIVE CONTROL UNTIL ONE WAS BUILT.** Every real frame
with no green is also refused for something else first — clipping, or structure
— so nothing in the set could show the green floor doing its job. A synthetic
flat with its green scaled to 0.06 is that control, and it had to be written as
PNG: a JPEG's chroma subsampling puts a 0.06 kink in kr at the corners and gets
the control refused by the curvature check, which is an artefact of the control
rather than a fault in the app.

## Export on a PC opened the Windows share sheet, 2026-09-11

`saveBlob` chose the share sheet whenever `navigator.canShare` said yes. The
share sheet is there because the INSTALLED iOS APP CANNOT DOWNLOAD — a bare
`a[download]` silently does nothing there. Chrome and Edge on Windows also
answer yes to `canShare`, so Export on a PC opened the Windows share sheet,
which is not a way to put a file on disk.

**A capability that EXISTS was standing in for a capability that is MISSING.**
The question is not "can this platform share" but "would a download do
nothing here", and those are the same only on iOS. The predicate is now the
second question, and it is the same one the diagnostic already answers:
iPadOS Safari reports itself as macOS, so `maxTouchPoints` is what tells an
iPad from a Mac.

Six platforms are simulated in one browser — Windows, a Mac, a Windows
TOUCHSCREEN laptop (fingers and a disk both), an iPad reporting itself as a
Mac, an iPhone, and an iPad with sharing unavailable, which must still fall
through to the download rather than to nothing. Planted back, three of them
share instead of saving.

**The Macro app carried its own copy of the same decision**, three lines of it,
with the same bug. It is `src/savefile.ts` now — its own module rather than a
corner of `export.ts`, because Macro was pulling in a JPEG encoder and an ICC
profile writer to put a blob on disk, which also split a 50 kB chunk out of the
Studio's main bundle as a side effect. The claim that holds it is "exactly one
module reaches for the share sheet", scanned across src.

**And that scan matched a COMMENT the first time.** `macro/main.ts` still
mentions `navigator.share` in a note about an iOS landmine while calling
nothing, so the scan reported two deciders where there is one. It strips
comments now: a scan that cannot tell prose from code will keep finding prose.

## The session-stepping drift that is not there, 2026-09-11

Reported: exposure may not be reset or auto-applied the way white balance is,
and Restore depth may be stacking as more photos are viewed. Tested by visiting
photo 1, walking the whole strip, and coming back — twice, so a drift needing
two laps is not missed, reading the SLIDERS and the rendered pixels rather than
any internal state.

**No drift.** Exposure, Restore depth, its strength, denoise and highlight
recovery are identical after two laps, and the picture moves 0.00 of 255.

That is a real answer but not a complete one: six practice DNGs are not
fifty-seven of the owner's NEFs, and the frames in the report are a high-contrast
scene whose shadows crush. What the test rules out is the mechanism — stepping
does not accumulate. Where to look next is in `main.ts` around line 766:
`balancing` is `untouched && !current.isRaw`, and `untouched` is false for any
raw photo, because a raw opens with a measured white balance rather than 1. So
when a LOOK changes the balance, the exposure derived for the OLD balance is
kept — which is the failure the comment four lines below it describes and fixes
for camera-rendered files only: "substituting a balance WITHOUT re-deriving
exposure just makes the picture dark", measured at mean 83/59/156 before and
35/35/32 after. Not yet reproduced on a raw frame; recorded so the next session
starts at the line rather than at the symptom.

## The lens profile has no filter dimension, 2026-09-11

Reported from the device: the hot-spot correction works, and does NOT work on
photographs taken through a wavelength filter. **Recorded, not fixed, at the
owner's instruction.**

**It is not a bug in the correction; it is a missing dimension in the key.** A
profile is stored under lens, focal length and aperture — `50-250@130@f16.0`.
Nothing in that key says which band the light was in. A hot spot is the lens's
internal reflection at a particular WAVELENGTH: a 590nm frame, a 720nm frame and
an 850nm frame through the same lens at the same focal length and aperture are
three different hot spots, and the app treats them as one measurement of one
thing. Whichever filter the flat frames were shot through is the one the stored
profile describes; every other filter gets that answer applied to a hot spot it
does not match.

**So the symptom is exactly what the shape of the store predicts**, which is why
it is worth writing down rather than investigating from scratch: the failure is
in the identity of a profile, not in the maths that applies it.

What it would take, when it is taken on:

- A filter goes in the key, the way aperture was added to it once before. EXIF
  does not carry it — no camera records the filter screwed onto the front — so
  it has to come from the reader, which is a different shape of question from
  everything else the rig asks, all of which it reads from the file.
- The matcher must then refuse to reach ACROSS filters the way it already
  refuses to blend across apertures, rather than silently substituting.
- And the coverage report gains a third axis, which is the point at which
  "what am I still missing" stops being a sentence and needs a different shape.

Until then the honest behaviour would be to say which filter a profile was
measured through and let the reader judge — the app cannot know, but it can
stop implying the question does not exist.

## A look on a camera JPEG comes out the wrong colour, and the obvious cause is not it, 2026-09-11

Reproduced on one photograph supplied both ways — `NIR_2082.NEF` and
`NIR_2082.JPG`, same scene, same moment, same lens, so the only difference is
which branch of the open path the file takes. That is what makes a difference
between them attributable to the branch rather than to the picture; the earlier
control was a wide-angle flat-frame attempt and could never have done it.

**The fault is colour, not brightness.** With Aerochrome the raw renders
correctly — pale sky, pink foliage. The JPEG renders a YELLOW SKY and purple
everything else, with the foreground crushed. Measured:

- raw: opens exposure 672, luma 132.7; with the look 123.7, 5.05% crushed.
- jpeg: opens exposure 419, luma 96.6, rgb 67/52/170; with the look 85.6,
  **12.95% crushed**, rgb 88/88/82.

38 of 255 apart, and two and a half times the crushed shadow.

**THE LEADING HYPOTHESIS WAS WRONG, AND THE EXPERIMENT SAYS SO.** The candidate
was `main.ts:766` — `balancing = untouched && !current.isRaw` — forcing a
gray-world balance onto a file the camera had already balanced, i.e. processing
it twice. Planted OFF (by inverting the branch, which keeps the type narrowing
that `false &&` destroys), the JPEG with the look comes out UNIFORMLY PURPLE:
worse, not better. The forced balance is what stops that, and it is doing its
job. It also re-derives exposure correctly, 419 to 580.

So what remains is the channel relationships themselves. `rgb 67/52/170` before
and `88/88/82` after is the same SHAPE as the failure `main.ts:750` records
(83/59/156 to 35/35/32): a mean pulled to neutral while the extremes split in
opposite directions. That fix stopped the result going black — 88 rather than
35 — and did not stop it going neutral-and-split, which is what puts a yellow
sky next to purple foliage once red and blue are swapped.

**Not fixed, and deliberately not patched from a hypothesis.** The app's own
help already says the shape of the answer — "a false-colour look needs colours
something has already pulled apart" — so the question worth asking next is
whether a camera-rendered IR JPEG retains enough channel separation to carry a
false-colour look at all, and if it does not, whether the honest behaviour is to
say so rather than to produce a yellow sky. The frame that shows it is kept.

**Instrument faults on the way, all the same shape as the rest of today's:**
selecting the right photo and then reading tile[0] (the tile numbers came back
byte for byte identical to the previous run, which is what gave it away);
measuring the wrong photo entirely because `openSorted` puts NIR_0063 first;
and planting a change that FAILED TO BUILD without checking the build output,
so the screenshot that never appeared was read as a missing file rather than as
a broken plant.

## The double-tap tip is underneath the thing that summons it, 2026-09-11

Reported from the desktop, recorded for later at the owner's instruction.

Double-tapping a slider returns it to where the photo opened, and a tip says so.
On a mouse the tip appears where the POINTER is — and the pointer is drawn on
top of it, so the tip is under the arrow that called it up. The reader is told
where to look by covering the place they are looking.

**And touch is probably worse, not better.** A fingertip covers a far larger
area than a cursor and, unlike a cursor, the app cannot know where it is once
the finger lifts. Anything anchored AT the point of contact is hidden by the
thing making contact. The general rule this is an instance of: a hint about a
control must not be drawn at the place the control is being operated — above
it, beside it, or in a fixed place, but never under the hand or the arrow.

Worth measuring rather than assuming when it is taken on: where the tip's box
actually lands relative to the pointer hotspot, at both a mouse and a touch
event, rather than reasoning about it from the code. This session has spent
enough on conclusions drawn from what an element looks like it should do.

## Restore depth: dead on a raw, and it is what yellows a JPEG, 2026-09-11

Asked directly whether Restore depth misbehaves on JPEGs. Measured on one
photograph supplied both ways, with Aerochrome on, toggling the control:

- **On the raw it does NOTHING.** The button flips `aria-pressed`, the strength
  slider reads 100, and the picture is identical to 0.0 of 255 in all three
  channels. Not "solved to zero and correctly applied nothing" — the strength
  says 100, so the app believes it has a full correction to make and makes none.
- **On the JPEG it moves the picture 29.6 of 255, and what it moves is BLUE.**
  Depth off: rgb 90.8 / 87.6 / 111.1. Depth on: 87.8 / 87.5 / 81.5. It pulls the
  blue channel down by thirty levels and leaves red and green alone.

**So Restore depth is what makes the sky yellow.** Yellow is red plus green with
the blue taken out, and that is exactly the operation measured. The wrong-colour
JPEG render and this control are the same finding, which is not what either
question looked like on its own.

Both halves toggle back exactly (0.00 of 255), so history is sound; it is the
forward operation that is wrong in two different ways on two file types.

**And the red-blue swap it looks like, it is not.** The raw render and the JPEG
render look like each other's swap by eye — pale cyan sky and pink foliage
against a yellow sky and purple foliage — and cyan swapped IS yellow. Measured
per channel: the raw's RED correlates 0.878 with the JPEG's red, and the raw's
BLUE correlates 0.893 with the JPEG's RED, while the JPEG's blue correlates
0.305 and 0.323 with anything. Both raw channels land in the JPEG's red. That is
red and blue COLLAPSING INTO ONE CHANNEL, not exchanging places.

**The first version of that claim averaged the two correlations** — 0.592
straight against 0.608 swapped — and reported a marginal swap, which is the
opposite of what the per-channel numbers say. Averaging the two halves of an
asymmetric result is a proxy like any other, and it nearly turned a collapse
into a swap in the record.

## Restore depth, looked at properly, 2026-09-11

Asked to fix it. Part of it is fixed and part of it was not what it looked like,
including in my own report an hour earlier.

**What the control actually writes**, read off the sliders it says it uses
rather than inferred from the picture:

- the owner's NEF: tone 0/0/0/0, skySat 1, folSat 1 — nothing, in every state.
- the same frame as a JPEG: skySat **2**, which is the slider's CEILING, with
  tone and foliage untouched.
- twelve practice raws: skySat 1.09 to 2.00, folSat 1.00 to 2.00.

**THE CEILING IS NOT THE DISCRIMINATOR, AND THE MEASUREMENT SAID SO BEFORE THE
RULE SHIPPED.** The proposed fix was "a solve that wants more than the control
can express is a division by something too small, so refuse it" — the same
shape as the green floor earlier today. Swept over fourteen frames, TWO PRACTICE
RAWS ALSO RAIL at 2.00. The rule would have broken good frames. It was measured
because the green floor was measured; the habit is the only reason it was caught.

**AND I TOLD THE OWNER RESTORE DEPTH MAKES THE SKY YELLOW. IT DOES NOT.** That
came from one measurement — blue falling 111 to 81.5 when the toggle goes on —
without looking at the toggle-OFF picture. With Restore depth off the JPEG is
still yellow-skied and purple, just less saturated. The control amplifies the
fault; the base look render on a JPEG already has it. A number that is
consistent with a story is not the story.

**What IS fixed: the control no longer claims a correction it did not make.**
On a frame that already measures where it should be, the solve returns a no-op,
`liftApplied` is nulled and nothing is applied — correct — while the button read
"on" and Strength read 100. Measured: 0.0 of 255 in all three channels between
on and off. A line beside the control now says so, and is shown exactly when the
toggle is inert.

The panel's small print has always said "a photo that already measures where it
should be is left alone" — inside a collapsed `<details>`. That is the SECOND
time today the honest explanation was in the markup and folded away, after the
lens rig's refusal reasons. A state belongs beside the control it describes.

**Still open: a look on a camera JPEG renders the wrong colour**, and the cause
is none of the three things it looked like. Not the forced gray-world balance
(planted off, result worse). Not Restore depth (off, still wrong). Not a
red-blue swap (measured per channel: both of the raw's channels land in the
JPEG's red, which is a collapse rather than an exchange). The frame is kept.

## A file with one colour band cannot carry a false-colour look, 2026-09-11

The JPEG fault, found. It is not the balance, not Restore depth, not a swap —
all three were tested and ruled out — and the answer only appeared once the
pipeline was instrumented to report its OWN numbers instead of having causes
inferred from its output, which had produced three wrong answers in a row.

**`coolSat` at open, measured through the app's own `measureFrame`:**

- fifteen frames that carry Aerochrome perfectly well: **0.0606 to 0.1729**
- the owner's camera JPEG of the same scene as one of them: **exactly 0.0000**

and its warm band reads **0.7587** against a maximum of 0.1461 across the other
fifteen. The whole picture is in one band. A false-colour look works by moving
the sky band one way and the foliage band the other, and there is no sky band.

**What the app was doing with that.** Pressing a look on a camera-rendered file
replaces its balance with gray-world, which on this frame returns a RED GAIN OF
0.17 — against 0.54 on the same photograph's raw — manufacturing a second band
by crushing red sixfold. The result is a yellow sky against purple everything,
with the rendered median falling from a 0.44 reference to **0.0763** and 12.95%
of the frame crushed to black.

**What it does now.** A frame whose cool band is below `COOL_BAND_FLOOR = 0.02`
— three times below the lowest frame that works, and everything above zero — is
not force-balanced, and a line beside the looks says the file has all its colour
in one band, that what it will get is the look's shape without its colours, and
that the raw from the same shot has both bands. Crushed shadows fall from 12.95%
to 3.02% and the sky-band boost stops railing at its ceiling.

**IT IS NOT AEROCHROME EITHER WAY, AND THE NOTE SAYS SO.** Skipping the balance
gives a coherent, evenly exposed, monochrome-blue picture. That is not a fix for
the colour; it is the honest outcome of a file that never had the colour, said
out loud instead of handed over as a result.

**The claim that matters is the regression, and its first version could not
fail.** Fifteen frames are rendered and compared against a baseline — and the
baseline has to come from the build BEFORE the change. The first run wrote it
from the changed build and compared it to itself. Taken properly: all fifteen
render identically, within 1 of 255 on every channel.

**Two plants in this session broke the build and were nearly read as results.**
`false && balancing && current` and `balancing && current && false` both fold
the narrowing away and fail typecheck; the first time, the missing screenshot
was read as a missing file rather than a broken plant, and the second time only
the unchanged NUMBERS gave it away. A plant that does not compile is not a
plant, and `npm run build`'s exit is part of reading its result. The working
form is a runtime flag placed AFTER the null check, which cannot be folded.

## Three review findings, and the second defect behind each, 2026-09-11

A read-only review of the previous day's work named three faults. Two of them
had a second one underneath, found only because the harness written to hold the
fix was driven the way a finger drives the app rather than the way the fix was
imagined.

**The drag readout sat on the histogram, and the first fix moved the collision
rather than ending it.** Both draw at the stage's top-left corner. The histogram
had been moved there a release earlier to get it out from behind the zoom stack,
and nothing checked what was already in the corner it moved into — the same
fault, one corner over. Dropping the readout below the histogram left it landing
on drag-to-adjust's OWN banner whenever the histogram is switched off: **4144
square pixels at phone width**, where that banner is 90% of the stage wide and
always up while the drag runs. It now clears the lower of both boxes, each read
for real. At phone width the banner is the lower; at desktop width the histogram
is; the harness asserts which one drives at each, because a run where one always
wins leaves the other branch untested while every overlap claim still passes.

**AND THE FIRST MEASUREMENT OF THAT OVERLAP WAS THE INSTRUMENT.** It was taken
by setting `tatHud.hidden = false` by hand, which skips the placement entirely —
and a hand-shown readout carries no text, so it is 44px wide instead of 234. The
reported 1232 square pixels was a HUD a fifth of its real size. Driven by a real
pointer drag the overlap is **4480 square pixels at phone width and 6848 at
desktop**, 100% of the readout at both.

**A frame with no green was voting on colour.** `kr` and `kb` are red and blue
divided by GREEN, and an infrared frame can have almost none; those frames are
kept for brightness, which red carries, and marked `colour: false` with a flat 1
so nothing divides by nothing. Averaged in with the rest, each one pulled the
whole colour curve toward neutral by its share of the set — five frames saying
red is 20% high at the centre plus one saying nothing average to **1.1667
instead of 1.2000**, in every one of the 80 bins, with nothing downstream saying
it had happened. Colour is averaged over the frames that measured some; the
averaged row now reports how many of the frames that made it did.

**The one-band line had no path back off the screen, and the swap alone is not
its gate.** Recomputing it from live state instead of setting it once inside
`applyLook` fixed the monochrome looks, which do not swap and have no colours to
lose. It did not fix Reset or Undo: a camera JPEG opens with the channel swap
ALREADY ON — the swap is the building block the colour looks are built from, not
a look itself — so `params.swapRB` was true with no look pressed at all, and a
sentence about what a false-colour LOOK gets out of this file sat under a photo
that had none on it. The gate is an active colour look AND the swap, because
pressing a colour look a second time flips the swap off and there is nothing to
say then either. Walked on one page through every exit in turn: no look, look,
Reset, look, Undo, look, all four non-swapping looks, look, the raw of the same
shot, and a look on the raw.

**A HARNESS CASE THAT PASSES FOR THE WRONG REASON IS NOT A PASS.** Opening the
raw of the same shot carries the look across, so the harness's single press of
Aerochrome on it was a SECOND press, which flips the swap off — and the claim
that the raw stays silent passed because of the swap rather than because the raw
has both bands. Stepping away to a non-swapping look and back makes the case
say what it claims to say.

**And the plant-that-does-not-compile happened for the third time in two
sessions.** The first plant of the one-band gate left `oneBandFor` unread,
failed `tsc`, produced no new bundle, and the harness ran against the GOOD build
and reported twelve green claims. The remedy is not care: it is reading
`dist/assets/ir-*.js`'s hash before and after the plant build and refusing to
believe a run where it did not change. A plant that does not reach the bundle is
not a plant, and an all-green plant run is the shape that failure takes.

## The rest of the review's findings, and what two of them could not settle, 2026-09-11

Findings 4 and 7 through 11 are fixed. Findings 5 and 6 are calibration debts
and stay debts — what follows is what they measure now, so the next attempt does
not start from nothing.

**The cool-band question was being asked about the look you are LEAVING.**
`measureFrame` picks the cool band's hue from `swapRB` — 30 degrees with the
swap on, 210 with it off, which are different bands — and `coolContent` ran
before `params.swapRB = look.swapRB` further down the same function. It agreed
with the calibration by coincidence: the file opens with the swap on and
Aerochrome turns it on, so the outgoing and incoming values matched. Coming from
a swap-on state to Natural IR they do not. The incoming look's swap is passed in
now.

**"There is nothing to put back" was a claim about the photo made from half a
measurement.** At open with no look the lift solves the tonal half alone, which
is a no-op on plenty of frames the full solve moves considerably — so the line
said the photo already measures where it should be about a photo a look would
immediately give it work to do on. True of the toggle at that instant and wrong
about the file, which is the half a reader takes away. The no-look wording now
says what it is: nothing to put back as this photo stands, and a colour look may
give it something to work on.

**`atan2` was running on every sampled pixel for rings nothing reads.** The
structure loop stops at `REF_LO`; the sector accumulation ran to the frame's
corner. Guarded on the same bound the reader uses, so widening one widens the
other.

**AND A COMMENT CLAIMED A GUARANTEE THE CODE DOES NOT GIVE.** "This reading is
always <= the old one: no frame accepted today becomes refused" — a sector mean
is never noisier than the pixels it averages, so the reading falls, but the
sector loop also DROPS rings the old code counted: a ring broken into fewer than
60% usable sectors is skipped, and if that empties the accumulator `structure`
falls back to 1 and the frame is refused. At real frame sizes it does not arise.
The direction of the change had been written down as an inequality.

### Finding 6: the floor is unconstrained, not calibrated

`COOL_BAND_FLOOR = 0.02` governs camera-rendered files only — the branch is
behind `!current.isRaw` — and was calibrated against fifteen raws that never
reach it. Twenty camera JPEGs were measured through the app's own
`coolContent`, by instrumenting a scratch build to publish the number rather
than reading the rule's own verdict back as its evidence:

- twenty camera JPEGs: **coolSat exactly 0.00000, every one**
- nine raws, for contrast: **0.0611 to 0.2067**

**And the exact zero is the guard, not a ratio.** `coolSat` is
`coolW > 0 ? coolS / coolW : 0`, and on these frames `coolW` is exactly 0 across
14406 samples — there are no pixels within 105 degrees of the band's centre at
all. So any floor anywhere in (0, 0.0611) classifies every frame in evidence
identically, and a test for `coolW === 0` would too. The number is doing no work
the evidence can see.

**What it still needs is a camera JPEG of a SCENE.** Nineteen of the twenty are
the wide-angle hotspot frames, which are photographs of empty sky — one hue by
construction, so their zero says nothing about a scene. The twentieth is the
known one-band file. There is still no camera JPEG in evidence that carries a
look, which is exactly what the finding said.

### Finding 5: the floor has still never seen a raw, and this could not show it one

`GREEN_FLOOR = 0.09` was calibrated on 25 JPEGs and all 30 stored profiles are
`source:"rendered"`. NIR_2082 exists as both a NEF and the camera's JPEG of the
same exposure, which looked like the comparison — and both came back
`linear false`, with `refR` identical to four decimals (0.5252) on both paths.
**That is not two decode paths.** The rig refuses both frames as photographs and
says "Measured 0 frames in 1s", which is a preview read rather than a NEF decode:
a frame refused on the cheap embedded preview never reaches the raw path at all.
So the raw path cannot be exercised through a frame the rig will not accept, and
settling this needs one NEF of empty sky.

**THREE READINGS OF ONE NUMBER, TWO OF THEM THE INSTRUMENT.** A probe on the
band weight first reported 1290 of 6144 samples in-band on a frame whose coolSat
was zero, which looked like crushed shadows being counted as in-band colour —
black has no hue and `rgb2hsv` returns 0 for it, which lands dead centre of a
band centred on 30. A second probe then reported a different number again. Both
were reading an accumulator AFTER later `measureFrame` calls had overwritten it;
`solveLift` makes several per look. Scoped to `coolContent`'s own call the weight
is 0.0000 and the hueless share is 0.0000 — the hypothesis was wrong, and the
only thing that distinguished it from the truth was which call the probe was
tied to. An accumulator on `globalThis` measures whoever ran last.

## Press-and-hold was fighting iOS text selection, 2026-09-11

Holding **Hold: No lens fix** on an iPad put a text caret in the word "lens",
painted selection handles around the label, and raised the Copy / Look Up /
Translate callout across the toolbar, covering **Open image(s)**. A button label
is selectable text, and press-and-hold is the ONLY gesture these three buttons
have — Hold: Original, Hold: Untouched, Hold: No lens fix — so the compare
gesture and the selection gesture were competing for the same press.

**THE CURE WAS ALREADY IN THE FILE, APPLIED TO THE INSTANCE INSTEAD OF THE
CLASS.** The same defect was caught on device on 2026-07-15 as a translucent
blue selection band painted over the photo while dragging the crop box, and the
three properties that fix it — `-webkit-user-select`, `user-select`,
`-webkit-touch-callout` — went onto `#cropOverlay`, `#cropBox`, `.crop-handle`
and the canvas. They never went onto a button. A fix written for the symptom
covers the one element that showed it; the question worth asking at the time was
which OTHER elements take a long press, and the answer was three buttons named
for it.

It is on `button` now. Nothing meant to be copied is a button: both copyable
blocks are textareas, and the version tag — which IS a button — keeps an
explicit `user-select: text` so the build number can still be lifted out when
something is wrong.

**WHAT IS VERIFIED AND WHAT IS NOT.** The computed properties are asserted in
Chromium on all three buttons, which is a fact about the CSS reaching the
element. Whether iOS then declines to raise the callout is an iOS behaviour and
needs the device.

**AND THE FIRST HARNESS CONTRADICTED ITSELF.** It claimed every button is
unselectable and, two lines down, that the version tag stays selectable — two
claims that cannot both hold. It failed on the version tag, which is the correct
behaviour, not the defect. A claim set that cannot all pass is not a stricter
test, it is a broken one.

## Every sky flat is being refused, and the rig is right, 2026-09-11

Nineteen wide-angle sky frames, measured through the app's own `radialMeans`
and `profileFrame`:

- structure **49% to 87%**, against a limit of 15%
- clipped **0.6% to 11.7%**, against a limit of 2%
- mean level 12% to 26%, which is fine — well clear of the 5% floor

So it is never darkness. It is scenery and blown highlights, and both readings
are correct: these frames are not flats.

**THE DE-GRADIENT THEORY WAS TESTED AND IT IS WRONG.** Structure is the spread
of a ring's sector means, and a smooth brightness ramp across the frame makes
one side of a ring read higher than the other — indistinguishable, to that
measure, from something being in the frame. Sky brightness really does vary with
angle from the sun and with elevation, so the wider the lens the more real
gradient it captures, and flat-fielding has removed exactly this for decades by
fitting a plane and dividing it out. It looked like the app's fault.

Fitted and divided out, per frame: structure fell from 63% to 50% on the best
frames, ROSE from 86% to 136% on the worst, and **zero of nineteen frames became
usable**. Two frames measure a brightness ramp of over 200% across the frame.
Whatever is in them is not a plane. A plausible mechanism, a real remedy from
the right field, and it does not apply here — which only the measurement could
say.

**WHAT ACTUALLY CAUSED IT, INCLUDING THE HALF THAT CAME FROM THIS SIDE.**
Overcast was recommended for the reshoot. That is backwards for infrared: cloud
is bright and textured in near-IR while clear sky is dark and smooth, so an
overcast sky is close to the worst subject for a flat-field test. The camera
reference already said "clear sky away from the sun, or a wall in open shade —
nothing with structure", and the recommendation contradicted it.

**AND THE APP ONLY EVER DOCUMENTED THE HARD WAY.** Its guidance read "clear blue
sky, filling the whole frame, no sun in shot, no clouds" and never mentioned the
wall. At a wide focal length the frame takes in so much sky that cloud, horizon
or a bright patch near the sun almost always creep in — which is what the
structure numbers are. A shaded wall has no gradient, no cloud and no sun in it,
and works indoors on the overcast day that makes sky impossible. The wall is the
first option now, "metered DOWN: nothing blown" replaces "well exposed but
nothing blown", and the overcast trap is named.

**A GATE THAT REFUSES EVERYTHING IS NOT SELF-EVIDENTLY WRONG.** Three sessions of
flats were shot and refused before anyone measured whether the refusals were
correct. They were, every time, and the reasons carried their own numbers the
whole way. The thing that was missing was never in the gate; it was in the
sentence telling a reader how to produce a frame the gate would accept.

## Every lens profile ever measured came from a JPEG preview, 2026-09-11

Sixteen raw flats were rejected by the rig. The frames were not the problem.

**`sniff()` reads bytes, and a NEF opens with the same TIFF magic number as a
DNG.** Only `refineKind(kind, name)` separates them, and it needs the FILENAME:
`if (kind === "dng" && /\.nef$/i.test(name)) return "nef"`. `importFile` calls
it. `lensrig.ts` called `sniff(bytes)` alone — so every NEF reached the decoder
labelled `dng`, the Nikon branch never ran, the DNG path failed on Nikon
compression, and the decode fell through to the EMBEDDED JPEG PREVIEW. One
missing function call, on the one path where the difference is the whole point.

**It was invisible because both halves of the app agreed with each other.** The
payload honestly recorded `source: "rendered"` — `prof.linear` really was false
— so nothing contradicted itself. All 30 shipped profiles say `rendered`,
including every one made from a raw file, while the panel above the button says
"RAW or JPEG, both work; the RAW is better". It never was. The editor surfaces
`previewNotice` when it falls back; the rig has never mentioned it.

**What gave it away was two numbers agreeing too well.** Sixteen frames existed
as both NEF and camera JPEG. Clipping read 58.11% for the JPEG and "58.1%" for
the raw; structure 46.0% and "46%"; 41.1% and "41%" — every pair, to the
rounding. Two decode paths cannot agree that closely. They were the same pixels.

**Reading them properly moves every measurement.** Structure 41% to 28%, 46% to
18%, 30% to 19%. And four frames refused for being 58-84% BLOWN are not clipped
at all in the raw: the preview is a finished JPEG carrying the camera's contrast,
and it saturates long before the sensor does. Four usable frames were turned away
for a fault that existed only in a thumbnail.

**AND IT SETTLES THE SCALE QUESTION THAT HAD NO ANSWER.** `GREEN_FLOOR`,
`DARK_LIMIT` and `CLIP_LIMIT` were every one calibrated on rendered frames, and
whether raw linear sits on the same scale had never been measurable — because
nothing had ever reached the raw path. Four frames now report their mean level
down both: 4.3 against 32.5, 4.1 against 30.7, 4.3 against 32.6, 4.8 against
38.2. **Raw linear is 0.126 to 0.134 of the rendered scale, about 7.6x lower.**
`DARK_LIMIT = 0.05` therefore means 0.0066 on the raw scale, and four of these
sixteen are now refused as "too dark to measure (mean 4.1-4.8%)" while sitting
at 31-38% of the scale that number was set on. Recorded, not fixed: it is a gate
that decides what is accepted, and four samples is a measurement to take rather
than a number to guess.

**A HYPOTHESIS THAT FAILED, RECORDED SO IT IS NOT RETRIED.** Before any of this,
the structure rejections looked like the gate counting the sky's own gradient as
scenery — sky brightness varies with angle from the sun, so a wide lens captures
real ramp, and flat-fielding has de-gradiented sky flats for decades. Fitted a
plane, divided it out, re-measured: structure fell from 63% to 50% on the best
frames and ROSE from 86% to 136% on the worst, and zero frames became usable.
The frames genuinely contained scenery. The idea was sound and the data refused
it.

**AND AN EMPTY RESULT IS NOT A PASS.** The regression run after the fix printed
two harness names with NOTHING under them. Both default to port 8131, which was
not running, and the `grep -E "^(ok|FAIL)"` that keeps the output short turned a
stack trace into silence — which reads exactly like a suite with nothing to say.
Same shape as a missing CI run being read as a green one (LESSONS §161): the
question is never "did anything fail", it is "did every claim actually run".

## Three floors and a cache: why every profile read "rendered", 2026-09-12

Four fixes that are really one story, and it ends with a measured magnitude for
"the correction is too strong".

**THE RIG ALREADY PREFERRED RAW FRAMES AND HAD NEVER ONCE BEEN GIVEN ONE.** It
sets rendered frames aside when raw ones are present, with a written reason. The
NEF decode fault meant no frame ever arrived as raw, so that branch never ran —
and then the green floor meant that once it did, the raw frames would measure no
colour at all. Two mechanisms in direct conflict, each correct on its own.

**Census of every profile that exists: 30 shipped and 130 measured, all of them
`source: "rendered"`.** Not one was measured from sensor data. That is the
finding, and it is a one-line script over the payload files.

**THE GREEN FLOOR BELONGED TO THE 8-BIT SCALE AND ITS OWN COMMENT SAYS SO.**
0.09 is not a level that means anything; it is where one code step falls to
about 2% of the value. That is a statement about the quantisation step, and the
step is a property of the scale. Measured on sixteen pairs of the same frame,
one NEF and one camera JPEG:

- raw reference green 0.0195 to 0.0753, step 3.45e-5, so one step is 0.05% to
  0.18% of the value;
- rendered reference green 0.0077 to 0.1090, step 5.2e-4 to 2.5e-3, so one step
  is 2.3% to 6.8% of it.

So the floor was refusing measurements forty times better than its own target
while admitting ones three times worse. Not one raw flat reaches 0.09; the
highest is 0.0753. `GREEN_FLOOR_RAW = 0.002` is where one 14-bit step is 1.7% of
the value — the same bargain, struck on the right scale.

**AND THE MAGNITUDE, WHICH IS THE ANSWER TO A QUESTION ASKED FROM A TABLET.**
Same sixteen frames, raw against rendered, as a departure from 1: colour reads
3.53x in red and 2.30x in blue, and the brightness curve 1.24x at the centre.
The camera matrix's green row is (-0.537, 2.703, -1.166), so a camera-space
residual comes out 2.7x larger after it — which is where the factor comes from.
Raw is also the more repeatable measurement, by 4.7x on red and 2.6x on blue
across the set, and 3.2x on brightness.

**THE BRIGHTNESS CURVE DISAGREES TOO,** which was checked as a hypothesis that
it would not. So the one-space rule covers the whole profile, and it moved out
of the rig and into `averageProfiles`, which is the function it governs. Splitting
by space in the rig ran BEFORE unusable frames were dropped: one unusable raw
frame displaced every good rendered frame in its group, and the group averaged
to eighty zeros over no frames. Filtering first and splitting second is the fix.

**A `source` OF "raw+rendered" WAS POSSIBLE AND MEANINGLESS.** It was a set of
every kind of frame the group had seen, joined with a plus, so it could say both
about a profile measured from one. It now comes from the average that did the
measuring.

**AND THE CACHE WOULD HAVE HANDED ALL OF IT BACK.** The rig keeps each measured
frame so a sleep does not throw a run away, keyed on filename and size, for a
fortnight — and nothing about which build measured it. A row is the OUTPUT of the
decoder and the profiler. Re-measuring the same files after either is fixed
returns the answers from before the fix, with the rig reporting them as "already
done from an earlier run", which reads as progress. Keyed on the app version now,
which moves on every release by construction rather than by somebody remembering;
rows from other builds are swept rather than left to expire. The cost is that a
release ends a run in progress, and the moment this cache exists to survive is a
sleep in the middle of measuring — minutes, not releases.

## The five sectors that could never be found, 2026-09-12

The per-radius estimator shipped with two regressions and they had one cause.

Each ring is estimated from the angular sectors that agree with each other, and
the test needs five survivors, because dropping a sector from fewer than five
leaves too few angles to re-fit the ramp. Two places in every frame have fewer
than five sectors for reasons of geometry rather than content: the innermost ring
is a disc a few pixels across, and the outermost rings are past the long edges as
well as the short ones, so what is left of them is four corner arcs. On those
rings the test could never be satisfied and every one returned no estimate.

**Which end broke depended on the frame size, which is why the check sweeps
sizes.** At 1600x1067 — what the rig's own downscale produces — ring 0 came back
empty, the reach scan stops at the first gap, and every good flat was refused as
measurable "out to 0%". At 3000x2000 the centre was fine and the last three bins
emptied, which is the corner, which is where a contaminated frame is told apart
from a lens. At 600x400 it was the last four.

Rings that sparse now take their plain pixel-weighted mean, which is what the
profile was before the estimator existed. They are recorded as never
sector-checked rather than as checked and clean, which keeps the rescued-ring
count honest.

**THE MASKS DO DISAGREE RING TO RING, AND IT IS BELOW WHAT THE OUTPUT CARRIES.**
Nothing makes ring 40 and ring 41 keep the same sectors, so in principle adjacent
radii describe different pieces of sky. Measured on the sixteen raw flats: radii
where sectors were dropped kink 2.41x more, ring to ring, than radii kept whole —
a real effect, on 7.3% of radii, up to 15 of 80 in one frame. The excess is
0.00089 in a curve whose own amplitude averages 0.0650, so 1.36% of the signal;
as a gain that is 0.089%, which moves a mid-tone by 0.051 of one 8-bit code step.
A coherence fix could not be verified in the output, so it was not made. One
percent of the amplitude was the first line drawn here and it was arbitrary; the
code step is not.

**AND THE RIG NOW SAYS HOW MUCH OF EACH FRAME WENT IN.** Reach and rescued-ring
count were both computed and reported nowhere, which is the fault the header of
`lensprofile.ts` opens by describing. Said only when there is something to say.

## A guard on the divisor is not a bound, 2026-09-12

The measured gain read `v > 1e-3 ? 1/v : 1`, which admits a factor of a thousand
and then snaps to 1 the moment the divisor crosses the threshold. A band of 0 — a
radius with no measurement, saved as a blank and read back as a number — asks for
100x at strength 0.99 and 1x at 1.00. So the correction grew without limit as the
slider moved and vanished at the end of its travel.

Bounded to half and double now, which is a measurement rather than a taste: every
band of every profile that exists sits between 0.772 and 1.460 for colour and
1.000 and 1.288 for brightness, and at the slider's maximum of 1.5 the largest
honest correction any of them asks for is 1.52x. Nothing real is clamped, checked
across 906 combinations of band and strength.

**A BIN COUNT IS A RADIUS MAPPING, NOT A RESOLUTION.** Two curves of different
length were truncated to the shorter, which reads as the safe choice and is not:
the band a pixel lands in is `floor(r * n)`, so running an 80-band curve at n=60
stretches it — the band describing 74% of the way out gets applied at the corner.

**AND THE TWO CURVES NEEDED DIFFERENT BOUNDS, WHICH COST TEN MINUTES TO LEARN.**
A colour curve is a ratio against green and sits around 1. A brightness curve is
a share of the centre and sits between 0 and about 1.5 — a 0 means no hot-spot at
that radius, which is the ordinary reading at the edges of every profile that
ships. One bound applied to both refused every profile carrying a brightness
curve on read, so nothing matched any photograph and the correction panel simply
did not appear: no error, no note, the correction silently absent. Caught by a
probe that opened a photograph and asked whether the card was showing.

## What four harnesses could not see, 2026-09-12

Every one of these produced a confident wrong answer this session.

**A SHADER IS A STRING TO THE TYPE CHECKER.** `npm run build` is green on a
fragment shader that will not compile, and what happens then is not an error
where the edit was: the renderer fails, the app declares the browser
unsupported, an overlay covers the page, and every browser harness fails on
"element intercepts pointer events". That reads like a UI change. It was an
interpolated `2` where GLSL needs `2.0` — it will not convert an int literal to
a float. `shadercheck.mjs` is the cheap first check now: does the shader compile
and does the app come up.

**AND A BACKTICK IN A SHADER COMMENT ENDS THE SHADER.** The fragment source is a
template literal, so quoting the old expression in backticks inside a comment
terminated it and the rest was parsed as TypeScript.

**A COMPARISON WITH NOTHING APPLIED AGREES PERFECTLY.** The GPU-versus-CPU check
opens a photograph, expects a profile to match, and compares the screen against
the exported file. With no profile matched both are uncorrected, they agree to
0.3 of 255, and the claim passes having compared nothing — which is exactly what
happened while the store was refusing every profile. "The profile matched" failed
and "GPU and CPU agree" passed, and the run read as one flaky assertion rather
than as a correction that had vanished. It stops on that now, and asserts the
curve is doing something to the picture.

**THE MAGNITUDE WAS THE UNMEASURED THING.** Nothing asked whether the amount was
right — only whether the stage ran, whether the two paths agreed, and whether the
rig accepted the right frames. A profile measured in the wrong colour space, three
times too strong, passed all of them. `lensbase.mjs` plants a profile with known
numbers, measures the render with the correction on and bypassed, and compares the
ratio to what `lensGain` predicts: 2.1% off, with a window sized to reject a
factor rather than a percent.

**AND IT READ THE WRONG CHANNEL FIRST.** The lens stage runs before the R/B swap,
deliberately, and the swap is on by default — so a correction to the stage's red
arrives in the screen's blue. The first version measured screen red against a
prediction about stage red, found it had not moved at all, and reported the
correction absent. It was 2% from perfect in the other channel. The harness reads
the swap toggle now.

**AND `innerText` RETURNS NOTHING FOR A COLLAPSED PANEL.** The rig's per-frame
rows are in detail panels, and two versions of a check read two empty strings and
concluded a sentence was missing. Read `textContent`, and ask for the structure
the rig actually builds rather than for the shortest element mentioning a
filename.

**THE COMMON SHAPE: A REGEX THAT MUST NOT MATCH PASSES ON AN EMPTY STRING.** Two
missing rows read as two of four claims passing. Every harness that reads strings
now stops when the strings are not there, and `preflight.mjs` refuses to let one
begin against a dead port, a 404 body, or a server left running on an older
build.

## The de-gradient was tried against the one population it cannot help, 2026-09-12

An earlier entry records fitting a plane to a flat frame, dividing it out and
finding it made nothing usable — "the idea was sound and the data refused it".

That conclusion was wrong and the levelling is in `main`. It was measured on
frames that genuinely contain cloud and lit foliage, where a plane correctly
does nothing: those stay at 43% to 117% however they are levelled. The frames it
is for are clear sky, whose own brightness ramp a wide lens spans more of — and
on those, structure falls from 5.7-46.7% to 1.6-12.5% while the contaminated
population does not move and synthetic controls stay clean. Sixteen raw flats
that were all refused are all accepted.

**The lesson is about the test set, not the method.** A negative result on a
population where the effect cannot appear is not a negative result. Recorded here
because the earlier entry said otherwise and would have stopped the next attempt.

## Two design choices measured rather than changed, 2026-09-12

Both were on a list of things to fix. Both turned out to be right, and the
measurement is recorded so the next session does not re-open them.

**A MEASUREMENT ON YOUR OWN BODY SUPERSEDES A SHIPPED ONE IN FULL, and the
numbers support it.** The concern was that the matcher computes a cost for each
candidate and the caller then discards it: a profile of your own measured at
250mm wins for a 50mm photograph over a shipped profile measured at 50mm. The
existing rule is written down with a reason, so it is a decision rather than a
defect — and the question is how much a profile actually moves with position.

Measured across the ninety profiles on disk, as mean absolute difference between
adjacent settings of one lens in one session:

- across focal length at one aperture, the colour curve moves 0.0067 in red and
  0.0123 in blue per step, worst pair 130mm to 135mm at 0.0547 in blue;
- across aperture at one focal length, 0.0024 and 0.0056 per step, worst pair
  f/6.3 to f/9 at 0.1039 in red;
- a profile's own colour amplitude is 0.0497 to 0.4596.

So a profile from the wrong focal length is off by about a hundredth, against an
amplitude of five hundredths to nearly a half. A shipped profile is measured on
a different conversion entirely, and — until this release — in the wrong colour
space, which is a 2.3x to 3.5x error. **Being your own measurement is worth more
than being at the right focal length, by more than an order of magnitude.** No
change.

**APERTURE AND FOCAL LENGTH ARE ALREADY INTERPOLATED LOGARITHMICALLY.** Both
costs in `matchIn` are `Math.abs(Math.log(a / b))` and the focal blend uses
`logMix`, so the concern that f-numbers were being treated as a linear scale was
out of date. What WAS wrong was a comment: the block above `hotspotState` said
the correction is applied once to the decoded pixel buffer before anything else
sees it, that it is not part of EditParams or the undo stack, and that the
matched profile is interpolated to the frame's aperture. All three were false,
and two of them were contradicted by comments a dozen lines below — the stage
comment and the `hsFix` doc comment. One file, three answers. Corrected.

**And what is NOT done, so it is not mistaken for done.** The eighty-frame
labelled corpus that holds the gate honest lives in the session scratchpad, not
in the repo, so it runs only when a session rebuilds it. Moving the harness in
is straightforward; moving the FRAMES in is not a session's call, because they
are photographs and this repository is public. The harness could read them from
a local folder the repo does not carry, which keeps the gate reproducible for
whoever has the frames and silent for whoever does not — worth deciding before
building either half.

## What four real batches of flats found, 2026-09-12

Four batches measured on a device, four saved payloads and one whole-device
backup. Every payload carried real colour; every raw profile in the backup read
a flat 1. That contradiction found four faults, and none of them was in the
measurement.

**THE STORE WAS NOT LOSING THE COLOUR — the ranking was refusing it.** Running
all four payloads through the real store and exporting them back kept the colour
on 68 of 68, so the payload-to-storage path is clean. What the device held was
the PREVIOUS generation: profiles measured after the raw decode was fixed but
before the colour floor knew about the raw scale, so `source: raw`, six frames in
places, and nothing at all about colour.

`place()` ranked a replacement by frame count alone, which ranks a profile that
measures no colour above one that does. Restoring the device's own backup and
offering all four runs to it: **15 freshly measured colour-carrying profiles were
turned away**, reported as "kept", correctly and uselessly. Colour now beats
frame count; within the same kind, more frames still wins. After the fix the same
sequence takes the device from 11 of 76 profiles carrying colour to 68 of 76 —
the other 8 are keys no batch re-shot, which is coverage, not a fault.

**THE TWO SAVES HAD THE SAME SHAPE AND DIFFERENT SCOPES, and the narrow one was
the one in reach.** "Save as a file" writes the run just finished; the backup of
everything on the device sat below the entire results list and was reported as
not findable after an import. Four batches therefore produced four single-run
files and no backup. Both are in the run's own action row now and each says which
it is.

**THE HEADLINE ACCOUNTED FOR 42 FRAMES OUT OF 94 AND SAID NOTHING ABOUT THE
OTHER 52.** Over half a set disappeared between two numbers in one sentence, and
"21 of them" could be profiles or frames. The reasons were all in the panel, per
lens, which is the wrong place for the first question anybody asks. It now names
what came out, then where every frame went — into the profiles, not needed, or
not usable — and says when the profiles are thin. The buckets are asserted to sum
to the number picked.

**AND FOUR PICKS STARTED FOUR RUNS OVER ONE PANEL.** The change listener was
plain and async. Four sets picked in succession ran at once, all writing to one
set of results and one Keep button; it produced four usable answers only because
somebody watched and pressed Keep as each arrived. Miss the moment and that run's
result was replaced with nothing said. Frames picked during a run now join it:
the pass finishes, and anything that arrived is measured as one set. That costs
almost nothing, because every frame already done comes back from the store — and
it is the better answer as well, since frames of the same lens, focal length and
aperture from two picks now average together instead of becoming two profiles of
one frame each.

**A NOTE THAT LIVES IN THE PROGRESS LINE DOES NOT EXIST.** The explanation for
the larger count on a second pass was written into `#lensRunning` and polled for
every 200ms across a full run — never once caught, because that line is rewritten
within milliseconds by the read loop. Its own element, checked at the end rather
than raced.

## A centring that had never once applied, 2026-09-12

`.dbg-btn` set `line-height: 44px` and then, nine lines later in the same rule,
`font: 500 0.9375rem var(--ui)`. The `font` shorthand resets every part it omits,
so the line height went back to `normal` and the 44px was dead from the day it
was written.

Real buttons hid it: a browser centres a button's own text itself. The two file
pickers in the lens panel are `<label>` elements — the only way a file input can
be styled at all — and get no such help, so their text sat 1px from the top of a
44px control with 24px beneath it. **Measured at 23px off centre on both, against
0.0 on the real buttons beside them in the same row.**

Flex centring now, and the line height folded into the shorthand so there is one
declaration of it rather than two with the loser first. All four controls measure
1.8px off centre, which is the font's own ascender against its descender.

**The rule's own comment, four lines above the dead declaration, is about a label
silently opting out of a tag-keyed width.** The same class then silently opted its
own centring out by shorthand. A comment explaining one instance of a trap is not
protection against the next one.

## The third-person gate had never run here, and was red by 119, 2026-09-12

The privacy rule has three halves and this repo was running one of them. The
`privacy-check` gate anchors on the owner's NAME and `quote-check` finds a
set-apart quotation; neither can see a comment recording that a report was
correct and whose it was. `third-person-check` is that half, and this repo
referenced the hub in no workflow at all — so it had never run.

Run against the working tree: **119 references across 13 files, 92 of them in
NOTES.md**, in a public repository. All of them predate this pass.

**The split, measured rather than estimated.** Ten were false positives of the
kind the allow-list exists for: Nikon's own name for its High Efficiency raw
compression, which this app has to name in order to say it cannot decode it, and
the He of He & Sun 2015, the guided-filter paper the clarity and dehaze maps are
built on. One more was a variable whose name was the possessive pronoun,
standing for the high ends of a range, and it was RENAMED rather than declared
— `loEnds`/`hiEnds` — because a declaration is a claim somebody has to maintain
and a rename costs nothing. The other 108 were real.

**NAMING THE ROLE IS THE FIX FOR THE PRONOUN AND NOT FOR THE ATTRIBUTION, which
is the part worth remembering.** Rewriting 85 lines of pronoun to the role
turned the third-person gate green and turned `privacy-check` RED: a possessive
naming the role and then a piece of EVIDENCE — a screenshot, an origin story —
is attribution, which is a different half of the same rule. The gate that had
been passing all day started failing on two lines created by satisfying its
neighbour. Every possessive that attributes
EVIDENCE — a screenshot, an origin story, a missed smudge, a pass, a library —
is now what it measured; the ones that record a step only a person can take
("on the owner's call", "needs the owner's hands", "the owner's ruling") stay,
which is the carve-out the gate itself encodes.

**AND FOURTEEN VERBATIM QUOTATIONS WERE INVISIBLE TO ALL THREE GATES.** They sit
inside ordinary prose rather than as set-apart blockquotes, so `quote-check`
cannot see them; they name nobody, so `privacy-check` cannot either; and they
contain no pronoun. Found by searching for quoted strings containing a
first-person pronoun. One of them republished swearing under the owner's name in
a public repository, which is the exact failure the rule was written for. All
fourteen are now what was wrong and what it measured.

**AND WRITING THIS ENTRY BROKE BOTH GATES AGAIN.** The paragraphs above named
the banned shapes by reproducing them, so prose whose whole job is to say a
pattern must not appear contained two instances of it. That is the same problem
a sibling app solved for its copy gate with a declared list rather than a
pattern; here the cheaper answer was to describe the shape instead of quoting
it, which is what the rule asks of every other line in this file.

**IT IS WIRED INTO CI NOW, WHICH IS THE POINT.** A scrub nothing holds is a
scrub that lasts until the next session. `.github/workflows/gates.yml` calls the
hub's shared `hub-gates.yml` at a pinned SHA rather than copying the job — the
wiring drifted across eight repos precisely because it was copied. Two other
gates were red when it was wired and were FIXED rather than switched off with an
input: two undeclared placeholders (`.example-allow` now declares both, and
both are invented rather than the nearest real look) and an `npm install` in the
asset-factory workflow, now `npm ci`, which is bound by the lockfile committed
beside it.

## Two saved files, one letter apart, 2026-09-12

`lens-profile-<date>.json` was one run and `lens-profiles-<date>.json` was every
profile on the device. Four run files and one backup came out of one afternoon
and had to be told apart by opening them.

A date alone is also not unique within a day, so a second save left the
operating system to disambiguate with its own `(1)`, `(2)` — numbers that say
nothing about order or content, and on iOS sometimes a silent replace.

They are `lens-one-run-<date>-<hhmm>.json` and
`lens-all-profiles-on-this-device-<date>-<hhmm>.json` now, built by one function
so the two names cannot drift apart again, and sorted by name a folder of them
reads in the order they were saved.

**And the run save was still a plain anchor download**, which does nothing
whatever on an iPhone or iPad — the share sheet is the only way a file reaches
the disk there. The backup button beside it had been fixed for exactly that
months earlier: the fix was applied to the instance and not to the class. Both
go through `saveBlob` now, and the run save says which scope it wrote.

## The shipped table, remeasured from raw, 2026-09-12

`src/hotspotProfiles.ts` went from 30 profiles to 72, and from every one
recording `source: "rendered"` to 67 of 72 recording `raw`. 71 of the 72 carry a
colour curve; before, all 30 did, but every one of them was measured after the
camera matrix and its tone curve, which reads 3.5x too strong in red and 2.3x in
blue against the same frames measured from the sensor.

Generated from five rig payloads, not hand-edited: four batches plus the
reingest that followed the queueing change, which is why 52 of the 72 rest on
two or more frames where the afternoon's batches were almost all singles.

**THE GENERATOR HAD THE DEFECT THAT HAD JUST BEEN FIXED IN THE APP.** Its
collision rule was frame count alone — the same rule `place()` stopped using
hours earlier, and for the same reason. Regenerating with it put FOUR colourless
rendered profiles into the shipped table ahead of raw ones carrying colour,
purely because they had been shot more times. `saysAnythingAboutColour` is
exported from `lensstore.ts` now and the generator imports it, with a check that
throws if the export disappears rather than silently falling back to frames.
Three collisions are decided by colour on the current data.

**One key is still flat: 50-250 at 250mm f/32**, whose only measurement is a
three-frame rendered one. Nothing re-shot it, and no store rule can conjure
colour into a measurement that did not find any. Four more keys on the device
were offered nothing by this round and keep their older readings: 130mm at f/13,
200mm at f/16, 250mm at f/9 and 250mm at f/32.

**And an assertion had to be narrowed twice, each time because the corpus grew.**
"Every stored profile carries colour" was true while every input did; adding the
reingest payload, which contains one honestly flat profile, made it false without
anything being wrong. It now reads: no profile loses a colour curve a payload
gave it, and a profile is flat only where every payload for it was flat. That is
a claim about the store. The first one was a claim about the corpus wearing a
correctness claim's clothes, which is the same shape as counting the whole device
when only part of it was re-measured.

## A colour curve does not travel to another camera, 2026-09-12

The shipped table was regenerated from raw and grew to 72 profiles of real,
conversion-specific colour. `matchIn` filtered on `p.model === model` — the LENS
— and never looked at the body, so all 72 would have applied in full to anyone
with the same lens on a different camera.

**That is wrong in infrared specifically.** `kr`/`kb` are two things multiplied
together: how the lens's transmission varies across the field, which is the
lens, and what the sensor does with the wavelengths reaching it, which is set by
the filter inside the CONVERTED BODY. A 720nm conversion has almost no blue to
measure; a full-spectrum one has a great deal. The brightness half is different
— a hot-spot is internal reflection inside the barrel, which is geometry, and it
does travel.

**The largest colour departure in the table is 27.8%.** That is what a
stranger's differently converted body would have had applied to it, and it would
have been worse than no correction at all.

It mattered little before today, which is why nothing caught it: the shipped
colour was measured from camera JPEGs and was wrong for everybody, including the
photographer who measured it. Making it right for one body is what made it wrong
for the others.

**Withheld only when BOTH cameras are known and they differ.** A frame with no
make or model — a stripped JPEG, an export of an export — cannot be told apart
from a match, and refusing colour there would break the ordinary case to guard
the rare one. The panel says which camera the colour came from and why only the
brightness applies.

**And it broke the magnitude harness, correctly.** That harness plants a profile
with `camera: "planted"` against a fixture with a real one, so the new rule
withheld its colour and the run reported the correction absent — a true result
about the wrong thing. It plants with no camera now, which is the case it wants;
the camera rule has its own harness with a real body on both sides.

## What a straighten angle costs at export, 2026-09-12

Exporting a straightened photograph took minutes longer than the same photograph
untouched. The cause is one line of caching policy.

`makeRowDenoiser` caches SOURCE ROWS and fills each one eagerly across the whole
image width, keeping a ring of about a dozen. That is exactly right for a scan
that walks the source top-to-bottom, which is what an export does with no
straighten — and catastrophic the moment the scan walks a slant, because the
source row then changes every few output pixels and each miss pays a full image
width of demosaic work for the three or four pixels actually wanted.

**Measured on a 6000x4000 source with denoise on, over the same 80,000 output
pixels: 306,000 source samples flat against 36,480,000 at four degrees. 119x the
work for the same picture** — 456 samples per output pixel against 3.8, which
extrapolates to eleven billion samples for a full frame against ninety million.

Rows are filled where they are read now, with a generation counter per ring slot
so forgetting a reused row is one integer write rather than a fill of the width.

**BIT-IDENTICAL, AND THE FIRST ATTEMPT TO PROVE IT USED THE WRONG INSTRUMENT.**
The claim is that the change alters when the sampler is called and never what it
returns. The first check compared the new code against a freshly written
reference bilateral, which disagreed by 2.7e-8 on two cases and 0.016 on a
third — and that says the reference disagreed, not that the change did: a
hand-written reference carries its own precision and its own clamping. Building
the OLD implementation and the NEW one side by side settled it: exact over
twelve combinations of strength and tap spacing, scanned top-to-bottom, along a
four-degree slant, and shuffled off every edge, with 6.9x fewer source samples
on the slanted case.

**STILL OPEN, and not to be reported as fixed:** `makeRowDetail` in
`src/raw/detail.ts` has the same eager-row shape at line 88 and has not been
touched. The denoise pass is the heavier of the two, but a straightened export
is still paying the detail pass's version of this whenever sharpen or texture is
off zero.

## 2026-09-12 — the strip's tiles: the flash, and the hot spot they wore

**THE WHOLE ROW FLASHED ON EVERY PHOTO CHANGE AND NOTHING IN IT CHANGED.**
`updateSessionStrip` rebuilt every tile with `replaceChildren` on every call,
and it is called on every switch, every add and every thumbnail that lands. A
fresh `<img>` carrying the same blob URL decodes again, so the price of moving
the `active` class was the whole strip re-decoding.

Measured with a MutationObserver over the strip, which is the only instrument
that can tell "rebuilt identically" from "not rebuilt" — a screenshot cannot:
**twelve tiles destroyed and twelve pictures re-decoded for two presses**, on a
set of six. Zero and zero after, with the active class and the "viewing 5" line
still correct. The harness is `stripflash.mjs` in the session scratchpad, and it
was watched failing on the build before the change.

Tiles are reconciled now: matched to photos by id, moved rather than recreated,
each part written only when it differs, and the click listener attached once to
an element that outlives every redraw — so it reads the photo id off the element
rather than closing over an object a later pass would replace.

**A TILE WAS A CLAIM ABOUT THE READER'S NEXT PRESS RATHER THAN ABOUT THE
PICTURE.** `params` is one object holding the OPEN photo's edit, and `makeThumb`
cloned it — so every tile was rendered under whatever grade happened to be live.
Pressing a look marked the whole strip stale and redrew all of it; moving to a
photo that carried its own grade left every other tile describing somewhere
else. A photo that has been opened, or that came back with a stored edit, has
its own answer, and the tile uses it now — balance, exposure and grade from that
photo's own edit. Only a photo never opened is rendered under the live look,
which is honest: `establishFreshEdit` re-applies the active look, so that IS
what opening it will do. One stamp covers both cases, so a first visit landing
on the same creative state does not invalidate the tile it already had.

**AND THE LENS CORRECTION WAS MISSING FROM EVERY STRIP TILE.** `lensCurveFor`
exists for exactly this and its own comment claims "every path that renders a
frame other than the one the reader has open"; the quick-look grid has always
passed it and the strip's background pass never did — `makeThumb(img)`, three
arguments short. So a tile wore the hot spot the photograph does not have, which
reads as the tile belonging to some other frame.

**THE FIRST TWO INSTRUMENTS FOR THAT BOTH PASSED ON A BUILD CARRYING THE
DEFECT**, and each failure is worth keeping:

- *The wrong fixtures.* The 44 practice DNGs shipped with the app carry no lens,
  focal length or aperture at all — checked by reading every one — so no profile
  can match them and neither path applies any correction. Two identical
  uncorrected pictures were compared and reported as agreement. The flats in the
  session scratchpad carry full metadata and match the strongest hot spots
  measured on this body, 43.3% and 30.2% of the centre's brightness.
- *The wrong control.* Comparing the strip tile against the quick-look tile
  proves only that the two thumbnail paths agree, and they can agree by both
  being uncorrected. The control has to be what the reader is comparing against:
  the photograph on screen. A WebGL view cannot be read with `getImageData`
  without a preserved drawing buffer, but a screenshot of the element
  composites it and can be measured by handing the PNG back to the page as an
  `<img>` — same ratio code as the tiles.
- *And the EXIF reader takes a Uint8Array, not an ArrayBuffer.* Handing it the
  buffer made every file read as carrying no metadata at all, including the very
  frames the shipped profiles were measured from. An absurd result looked like a
  finding for about ten minutes.

With that rig: the correction now reaches both tiles (a full 80-bin colour curve
and an 80-bin brightness curve at strength 1, read back from the thumbnail pass
itself), and **an opened photo's tile matches the photograph to 0.004** on a
centre-against-ring measure.

**STILL OPEN, and not to be reported as fixed: an UNOPENED photo's tile is
0.052 off the photograph** on the same measure (1.133 against 1.081, on a flat
with a 43.3% hot spot). The lens correction is not the cause — it is present and
at full strength on both sides. What remains is that the tile RE-DERIVES the
automatic baseline (the depth lift, and with it exposure and highlight recovery)
from the image, while opening the photo derives it through `establishFreshEdit`.
Two derivations of the same thing, and they do not agree to better than a few
percent on a frame whose centre is near clipping. The fix is to render an
unopened photo's tile through the same code the open path uses, which means
lifting the baseline out of `establishFreshEdit` as a pure function — a refactor
of a load-bearing function with undo semantics attached (the five-places rule
above), not a small change. An attempt to confirm the lift as the cause by
toggling it off failed on the instrument: `#irLift` sits in a collapsed panel and
cannot be clicked without opening its tab first.

## 2026-09-12 — ending a session stopped being the reader's wait

**THE PRESS AWAITED THE DELETE.** `clearSession` emptied the index and every
byte in ONE transaction and `endSession` awaited it behind the busy dialog.
Measured on eight photos and 84 MB: **863 ms, about 110 MB per second of
waiting** — which on a forty-photo session is a gigabyte through the same door,
on a browser whose deletes are slower than the one that was measured.

None of that work needs the reader present. What must finish before the start
screen returns is forgetting the **index**: the meta rows are what offer to
resume a session, and they are a few kilobytes. Once a meta row is gone its
chunks are unreachable — nothing lists them, nothing counts them, nothing can
open them — so they go afterwards, one photo per transaction, and anything an
interrupted ending leaves is swept at the next start with a key cursor that
steps once per photo rather than once per chunk (a 25 MB photo is more than
eight hundred 30 KB chunks).

**THE ORDER IS THE SAFETY.** Index first means an interruption can only ever
leave bytes nothing can reach. The other order would leave a session that
half-resumes, pointing at photos whose bytes are gone. An interruption costs
space until the next launch, never correctness.

**Measured, same rig, both builds** (`sessionfree.mjs` in the session
scratchpad, which reads the app's own database from the page — the only way to
tell "deferred" from "fast"):

- before: **863 ms**, and 0 byte rows left at the moment the screen returned;
- after: **250 ms**, with **2040 of 2720 byte rows still there** at that moment,
  every one of them gone 0.5s later.

That second number is the claim that does not depend on how fast this machine
is: a build that awaits the delete reports zero deferred rows however fast its
disk happens to be. The harness was watched failing on the build before the
change, on exactly those two claims and no others.

**The one place a wait is still taken** is `addToSession`, which awaits the
sweep before writing: ending a session and immediately opening another is the
only collision, and writing a new set on top of bytes still being deleted is
what would run a device out of room. That wait lands where a wait is already
expected and shown.

## 2026-09-12 — a look belongs to the session, a grade you made belongs to the photo

**BOTH HALVES WERE HALF TRUE, AND WHICH ONE YOU GOT DEPENDED ON HISTORY NOBODY
CAN SEE.** Choosing a look carried to a photo that had never been opened —
`establishFreshEdit` re-applies it — and never to one already visited, whose own
snapshot was restored instead. Reported as a look not carrying to the next
photo.

**Measured on the build before the change, over four photos:** a photo already
opened did not follow (the look buttons read "none" and the picture's red
against blue did not move, 1.014 both ways); a photo *never* opened did not
follow either, because by the time it opens `activeLook` is whatever the
PREVIOUS photo was restored to, which after any browsing at all is nothing. So
the carry that was supposed to work only worked while you moved strictly
forwards through photos you had never seen.

**Three pieces.**

- `sessionLook` is the look last chosen and is a fact about the SESSION.
  `activeLook` stays a fact about the OPEN PHOTO — restored from its snapshot,
  so the look buttons describe the photograph on screen rather than a press made
  three photos ago. Comparing a photo's look against itself can never say
  whether the session has moved on, which is why there had to be two names.
- A **LookMark** on each photo's edit: the look it was last given, and THE GRADE
  IT HAD THE MOMENT IT WAS GIVEN. Arriving with the session on a different look,
  the photo is asked one question — is your grade still exactly what that look
  left? Untouched, the new look applies. Changed, the reader meant it, and
  nothing overwrites it. It rides the live edit and the stored one, so it
  survives a resume; an edit stored before this existed has no mark and is left
  alone, which is the safe half of the question.
- **A FLAG WOULD HAVE BEEN WRONG.** "The reader graded this by hand", set from
  the controls, means every control that ever touches the grade has to remember
  to set it, and the one somebody forgets silently un-marks a photo. Comparing
  the grade against what the look left cannot be forgotten by a control added
  later.

**The mark's stamp excludes the lift's own controls** while the thumbnail
stamp includes them, and the difference is deliberate: a tile asks "is this
still a true picture of that photo", where the lift matters; the mark asks "has
the reader graded this photo by hand", where a change to one session-wide
strength slider must not read as every photo having been hand-graded at once.

Asserted by `lookcarry.mjs` (session scratchpad), which reads the look buttons
AND the picture — a look that is only highlighted is a label, and a grade that
changes with nothing highlighted is the other half of the same lie. Eight
claims; four of them fail on the build before the change.

## 2026-09-12 — the same folder does not decode twice

**A QUICK LOOK RENDERS EVERY PICKED FILE THROUGH THE REAL PIPELINE**, which is
the whole point of it and also why opening a folder already looked at cost
exactly what the first look cost. Reported from a real session: the same folder,
repeatedly, watched loading.

Rendered previews are kept now (`src/previewcache.ts`), keyed on the FILE — name,
byte length and modified time — because that is what identifies a picked file
before anything reads it, and it is the identity a resumed session already uses.
No handle and no path: the browser gives neither.

**WHAT MAKES A KEPT PICTURE WRONG, all of it in the key** — and that claim was
wrong here for two days. The GRADE was missing from the list and from the key,
and a grid tile is rendered under the live one; see "## A tile is a claim,
2026-09-14". A list that states its own completeness is a list nobody re-reads
against the code.

- the file changed — a different name, length or modified time is a different
  file;
- the app's rendering changed — `PREVIEW_PIPELINE`, declared in that file and
  held to the code by `tools/preview-version-check.mjs`;
- **the reader's own lens profiles changed.** A preview is rendered THROUGH the
  correction, so a picture made before a re-measurement is a portrait of the old
  correction — and re-measuring is not rare: one this month took a device from
  11 profiles carrying colour to 71. `LensStore.profilesStamp()` is an FNV hash
  of the stored text rather than a counter, because a counter has to be bumped
  by every writer and the writer that forgets serves stale pictures for ever.

**THE GATE IS THE PART WORTH COPYING.** A cache keyed on a number nobody
remembers to bump serves the wrong picture for ever, and a comment asking for
the bump cannot refuse anything. `tools/preview-version-check.mjs` hashes the
sources a preview is actually made of — decode, pipeline, the raw decoders, the
lens store, the shipped profiles, and two NAMED REGIONS of main.ts
(`makeThumb` and `lensCurveFor`) — against a recorded hash, and fails the commit
on any change until `PREVIEW_PIPELINE` moves and the record is rewritten with
`--record`, which itself refuses if the number did not move. It is in
`.branch-guard`'s `also=` list, so it runs on every commit.

Regions rather than the whole of main.ts on purpose: main.ts changes every day
for reasons that have nothing to do with a rendered picture, and a gate that
demands a version bump on every commit teaches everyone to bump without
thinking, which is the same as not having a gate.

**Measured** (`previewkeep.mjs`, session scratchpad — counting DECODES rather
than seconds, because a clock measures this machine and the decode count
measures the app): a folder nobody has looked at, 4 decodes; the same folder
again, **0 decodes** and back in 1.3s against 2.8s; "Build these again" really
re-renders all 4 and what it makes is kept in turn; and a change to the stored
lens profiles renders all 4 again.

**Two instrument errors on the way, both worth keeping.** The harness first
wrote to a lens-profile key of its own invention (`ips-lens-profiles`, where the
app uses `…-v1`) and reported the app failing to notice a change that had not
been made. And the rebuild count read three decodes of four, because the tiles
from the previous run were still on screen when the press landed, so "wait until
there are four pictures" was already true — it was reading a run that had barely
started. Waiting for the grid to EMPTY first is the signal a new run has begun.

## 2026-09-12 — Level the horizon, and the two measures that did not work

**ON A BUTTON, NEVER AT OPEN.** A frame tilted on purpose must not be
straightened behind the reader's back, so the angle lands on the Straighten
slider: visible, one undo away, and the untouched frame one press further. It
does not arm the Straighten TOOL either — arming a geometry tool takes the stage
over, and pressing a button in the panel is not asking for that.

**THE METHOD IS THE SETTLED ONE.** Two box blurs, Sobel, keep the strong edges,
and accumulate them into (angle, offset) cells — a Hough accumulator, fifty
years old. Infrared helps rather than hurts: the sky-to-foliage boundary is the
strongest edge in the frame. A radial hot spot cannot bias it, because a radial
brightening votes for every angle equally.

**WHAT IT TOOK TO GET A HONEST CONFIDENCE, and this is the part worth keeping.**
Three measures were tried against real frames and two were worthless:

- **Share of the frame's edge weight.** Eight real woodland frames scored
  0.0002 to 0.003 — whether or not anything in them was straight. Foliage
  contributes an enormous total and a horizon is one thin line across it.
- **Ratio to the average accumulator cell.** A smooth gradient with no edge in
  it at all came back the most confident frame of the set, at 140, because when
  almost nothing is accumulated the average cell is almost nothing.
- **How LONG the winning line is**, in frames. This one separates: a drawn
  horizon 1.2-1.6, the same under heavy noise 0.11, a real infrared hillside
  0.40, real woodland with no straight line 0.011-0.117, pure texture 0.024. The
  floor is a quarter of the frame's long edge.

Plus an absolute floor on edge strength, because every other threshold is
relative to the frame's own strongest edge — which is what makes this work
across infrared exposures that vary enormously, and which promotes the faint
contours of a smooth frame to "the strongest edges here".

**ORIENTATION ALONE CANNOT TELL A HORIZON FROM A HEDGE.** The first version
voted on angle only and would have shipped as a coin flip: a thousand leaf edges
near level vote exactly like one horizon. Collinearity is the whole difference,
which is what the offset axis of the accumulator is for.

**Accuracy, measured against frames whose answer is known:** exact to a
twentieth of a degree against a grating (the same angle at every pixel), within
0.1 degrees out to three degrees of tilt on a drawn horizon, and within 0.3 by
twelve. Finer angle cells made it WORSE — a real line is not straight to a tenth
of a degree, so its votes spread, the peak halved and one frame fell below the
floor. Sub-cell resolution comes from a parabolic fit on the peak instead, which
does not split it.

**The sign is asserted end to end rather than reasoned about.** Which way the
slider turns a frame is a fact about a geometry mirrored in the shader, the CPU
pipeline and the exporter. `levelwalk.mjs` tilts a real photograph by a known
amount and presses the button: an inverted sign would go twice as far the wrong
way. It comes back to the same angle, twice, to a tenth of a degree.

**And the harness labelled its own frames wrongly at first**, reporting a
hillside declined and a canopy levelled when it was the other way round — a set
is sorted into shutter order on the way in, so the picker's order is not the
strip's. The name now comes from the app.

## 2026-09-12 — picks, rejects, and comparing two frames

**ONE FLAG THAT STARTED TRUE ON EVERY PHOTO** is what a quick look had. "Keep
these" meant "keep everything I did not untick", and there was no way to say a
frame was bad as opposed to not yet considered — which is most of them, in a
folder you are going through.

Three states now: **pick**, **reject**, or nothing yet, which is what every
culling tool has had since slide sorters. Lightroom's flags and Photo Mechanic's
whole reason to exist are the precedent, and the two that earn their place here
are the ones that were asked for: a pick, and a reject that dims the tile and is
skipped by the arrow keys.

**What Keep takes is stated once, in `willKeep`, because it is SAID in three
places** — the button's own label, the header's count, and the keep itself. The
rule is the one a reader would guess: your picks if you made any, otherwise
everything you did not reject. A folder gone through without marking anything
behaves exactly as it did before there were marks, and one pick changes the
answer to "only what I chose".

**THE MARK IS IN WORDS ON THE TILE**, not in the tinting: a dimmed tile and a
tinted border are the same thing to a reader who cannot separate them, so a
picked tile says Pick and a rejected one says Reject, and a rejected one also
carries a dashed edge and a struck-through name. Three carriers, none of them
colour alone (the standing mandate).

**A cell, not a tile.** Reject is its own 44px control and a button cannot
contain a button, so the picture (which IS the pick) and the reject sit side by
side in a `.ql-cell` wrapper.

**One tab stop for the whole grid**, with arrows moving within it — the roving
tabindex every grid widget uses. A folder of three hundred photographs would
otherwise put six hundred tab stops between the grid and the Keep button. P
picks, X rejects, U unmarks, C compares; arrows skip rejects, which is what a
reject is FOR, and Home and End reach everything so nothing is ever stranded
behind its own mark.

**COMPARING IS ONE HELD AND ONE STEPPING**, not two arbitrary frames. That is
how a burst is actually culled: the question is never "these two photographs"
but "does this one beat the one I have". Arrows step the candidate, Hold this
one moves it across, and a mark made while comparing is in the grid when you
come back — asserted, because two surfaces over one model is exactly where a
mark goes missing.

It shows the grid's own preview pictures rather than full renders. A full-size
decode per step would take seconds each and make stepping through a burst
unusable; a preview is enough to choose a frame by and not enough to judge fine
focus, and the panel says so rather than letting it be assumed.

**Asserted by `cull.mjs`** (session scratchpad), which claims what the app WILL
DO rather than what the tiles look like: the counts in words, the Keep button's
own promise at each stage, an arrow press skipping a rejected frame, compare
opening on two different photographs, the candidate stepping, the hold moving
across, a reject made while comparing arriving in the grid, and finally **which
photographs actually reach the session**. The last claim was wrong on the first
run and the app was right: rejecting a picked frame while comparing REPLACES the
pick, so one pick survived rather than two.

**And the harness waited ten minutes for something that was never coming** — a
single kept photo opens alone, with no strip at all, so waiting for two tiles
waits forever, behind a `.catch()` that made the timeout silent.

**The compare dialog joined `a11y.mjs`'s surface list in the same commit that
created it** (hub LESSONS §28 — a new surface that does not is a surface that
ships unmeasured). Zero axe violations in both themes, every control 44px or
more at 430px and 900px wide.

## 2026-09-12 — where an export's seconds actually go, and two hypotheses that were wrong

**MEASURE FIRST WAS THE RIGHT ORDER**, and it is the only reason this entry is
not a story about a fix that did nothing. Export speed was named a priority with
no measurement behind it anywhere; the one number that existed came from a bug —
a straightened export doing 119 times the work.

**The split, on a 20.9-megapixel NEF at full size and quality 92, with the app's
own default edit (denoise 0.47):**

- total **46.97s**
- re-reading the raw file 1.11s (2%)
- **the per-pixel pass 45.20s (96%)**
- the JPEG encoder 0.53s (1%)
- colour profile and metadata 0.04s
- waiting on the 233 yields that keep the interface alive: 0.97s (2%)

So there is nothing to win in the encoder, the file reading, or the metadata:
**the pass over the pixels is the export.** Turning denoise off takes the whole
export to **18.71s**, which puts **28 seconds — 60% of the export — in the
twenty-five bilateral taps per pixel**, each with a `Math.exp` in it. A
microbenchmark of that exp alone over 522 million taps: **15.0s**.

**TWO HYPOTHESES, BOTH MEASURED, BOTH WRONG.**

- *Per-pixel allocations.* The coordinate mapping allocated two arrays per output
  pixel, the demosaic allocated an array and two closures per source pixel, and
  every sampler in the chain returned a fresh triple — sixty-odd million
  short-lived objects for one photograph. All removed (out-params and reused
  scratch arrays, contract documented on `LinearSampler`). **Measured gain:
  0%** — 47.22s against 46.97s. V8's escape analysis and generational collector
  were already handling them.
- *The recomputed tap luma.* Each of the 522 million taps recomputed
  `r·0.2126 + g·0.7152 + b·0.0722`, and each source pixel's luma was recomputed
  by all twenty-five pixels that see it. Cached beside the row (in a
  **Float64Array**, because `v` is float32 and rounding the luma a second time
  would change the exported pixels). A microbenchmark said 8.1s. **Measured
  gain: 1.03s, about 2%.**

Both changes are kept: they are exact, they remove real garbage, and the
out-param shape is what a worker-side loop wants. But the honest number is that
together they bought **2%**, on a desktop-class container. The iPad is
unmeasured.

**BIT-IDENTICAL, PROVEN BY THE FILE'S OWN HASH.** Every export above was
compared by sha256 of the finished JPEG: `cf329769f749fbe6b92049cfe0ab909b`
before the changes and after both of them. That is the strongest form of "this
changed when the work happens and never what comes out" available here.

**WHAT THAT LEAVES.** Single-threaded exact optimisation is finished: the
algorithm's own floor is the exp, and the remaining time is memory traffic over
the row ring. The answer is **parallelism** — the export is embarrassingly
parallel over output rows, and four cores would take 47s to about 13. That is
its own piece of work and is NOT started: it needs the source split into bands
with halos for the 5x5 and 7x7 taps, the coarse glow/local maps built once and
shared, and a fallback to today's path for stickers, warp, heal patches and
masks. The bit-identical proof is the same hash comparison used above.

**AND THE PROBE BECAME AN INSTRUMENT.** The stage timings are not a test hook:
`lastExportProfile()` feeds a line in the §7f diagnostic, so a reader saying
"this takes forever" sends a report with the split in it rather than a stopwatch
and a guess. Counts and seconds only — it names no file.

**The preview-pipeline gate fired on all of this, and it was right to.** It
hashes the sources a preview is made of, and this touched four of them. It also
had no way to express "the sources changed and the pictures provably did not",
which is exactly what happened — so it grew one: `--record --proven "<evidence>"`
writes the claim into `tools/.preview-pipeline`, where it lands in the diff for
whoever reviews it. Recording with neither a bump nor evidence is still refused.

## 2026-09-12 — the export on several cores: 47s to 20s, and byte for byte

The entry above ends by naming parallelism as the only thing left that moves the
number, and by predicting how it would have to work. Two of those predictions
were wrong and the third was optimistic. All three are worth keeping.

**WHAT IT DOES.** A band is a slice of the export's own outer loop: each worker
is handed the same file, the same edit and one band, and calls **the same
`exportImage`** the main thread calls. There is no second pipeline, which is the
whole reason the bytes can come out identical. The main thread stitches the bands
and encodes once.

**PREDICTION ONE, WRONG: "the source split into bands with halos for the 5x5 and
7x7 taps".** No halos, because the source is not split. Each worker gets a copy
of the whole file and decodes its own sensor data, so every neighbourhood tap is
in range by construction. Slicing the source would have needed a halo computed
back through crop, straighten, rotation and flip — four places to be subtly
wrong in a way that shows up as a line across the picture. The copy costs about a
second per worker, in parallel with the others, and the memory below.

**PREDICTION TWO, WRONG: "embarrassingly parallel over output rows".** Rows only
would have left HALF of all exports on one core, and the first measurement caught
it: the test frame is a portrait one, so the export's loop runs output COLUMNS
(it follows columns under a quarter-turn to keep the denoiser's row cache warm),
`canRunParallel` said no, and the export came back at 46.8s with the diagnostic
reporting one thread. A band is now a rectangle of the finished picture cut along
whichever axis the loop runs, and `BandResult` says which — so the stitch can put
a narrow strip back down every row of the output rather than assuming one
contiguous slice.

**PREDICTION THREE, OPTIMISTIC: "four cores would take 47s to about 13".**
Measured on the same 20.9-megapixel NEF at full size and quality 92 with the
app's own default edit: **46.8s to 19.7s**, on three threads — the container
reports four cores and the main thread keeps one. That is 2.37x, not 3.6x. The
camera-rendered path (the same frame's 20.7-megapixel JPEG) went **36.9s to
15.6s**.

**BIT-IDENTICAL, BY TWO INSTRUMENTS, BECAUSE ONE OF THEM ONLY EVER TESTS ONE
ROTATION.**

- *The finished file.* sha256 `cf329769f749fbe6b92049cfe0ab909b97ee25acbe5481e4`
  `167eae5098916be4` on the 20.9-megapixel NEF, from the single-threaded build
  and from the three-thread build, and equal to the baseline measured before any
  of this existed. The camera JPEG likewise: one hash, two thread counts.
- *`bandsplit.mjs`* (session scratchpad) drives `exportImage` directly in node,
  with no browser: a whole-frame export against four bands stitched by the
  product's own `stitchBands`, at all four rotations, across five edits — the
  edit a photo opens with, sharpen with clarity and texture, halation with a
  creative vignette and grain, straightened four degrees, and no denoise at all.
  Twenty comparisons, all equal. **And a planted defect the run reports as
  different** (one band asked for the wrong rows), because a comparison that
  cannot fail is not a comparison.

The second instrument exists because the seam is the only real risk here and the
browser cannot reach it: the full-size run exercises ONE rotation and ONE edit,
while the risk lives in the scan order of two row caches — the denoiser's and the
detail pass's. Whether a band's first rows come out the same as those rows in a
whole-frame pass is arithmetic, and a browser is a poor place to prove
arithmetic. That is also why the stitch is its own exported function rather than
a loop buried in the worker plumbing: it is the half that can be wrong in a way
nobody sees, and it is now driven directly.

**MEMORY, MEASURED RATHER THAN GUESSED — and it is the reason there is a
budget.** Peak resident memory across every browser process, sampled once a
second through a real export: **1.88 GB on one thread, 2.19 GB on three**. That
is 104 MB per extra thread, against the 96 MB predicted by the model now in
`perWorkerMb` (the file, two bytes per source pixel for the decode, four bytes
per output pixel for the band, plus overhead). The model is the part that
travels: the same shot at 45 megapixels would cost about 220 MB a thread, and
three of those is a killed tab rather than a slow export — a tablet browser kills
the tab instead of swapping, and a killed tab loses the session. So the thread
count walks down from four until `n x perWorkerMb(n)` fits in **600 MB**, and if
two will not fit the export runs on one thread and takes its time.

**WHAT FALLS BACK, AND THE FALLBACK IS THE OLD PATH UNCHANGED.** TIFF (the print
master, enormous either way); heal spots, stickers and warp, whose assets are
bitmaps a worker cannot be handed cheaply; anything under two megapixels, where
starting workers would show; and any browser without module workers. On top of
that, **a worker that fails for any reason falls through to the single-threaded
loop** — the reader asked for a photograph, not for a particular number of
threads. The single-threaded path was re-verified against the same hash after the
band refactor touched its write offset.

**THE DIAGNOSTIC SAYS WHICH HAPPENED**: "pixels 18.1s on 3 threads", or "on one
thread". Without it, a report saying an export is slow on one device is
indistinguishable from a device that quietly fell back — and every reason to fall
back above is invisible from outside.

**A SIDE EFFECT WORTH HAVING.** The single-threaded pass yields to the interface
233 times per export, which is what keeps the progress bar alive; the parallel
pass yields none, because the main thread is idle while the workers run. Progress
now moves when a band moves rather than between yields.

**WHAT WAS NOT ATTEMPTED, AND IT IS WHAT THE REFERENCES DO.** LibRaw, darktable
and RawTherapee split the output across threads exactly like this, but they
decode the sensor data ONCE and share the buffer. Sharing memory between workers
in a browser means SharedArrayBuffer, which means COOP and COEP headers across
the app and its service worker. The per-thread decode and the per-thread copy of
the file are the price of not doing that, and the memory budget above is what
keeps that price payable.

## 2026-09-12 — the sharpening pass: a comment that claimed the fix, and a centre colour that was the wrong pixel

**MEASURED FIRST, AGAIN, AND IT FOUND SOMETHING MUCH WORSE THAN A SHAPE.** The
job was to give `makeRowDetail` the row cache the denoiser already has. What the
measurement found was a live defect with a big number on it, and then a second
one underneath it.

**The fill, counted** — source samples taken against pixels the picture asked
for, over 700,000 output pixels of a 1000x700 source: **2.0 per pixel scanning
row by row, 4.4 through a 30% crop, 75.6 down a four-degree slant, 1001 down the
columns.** On the real export path, a 1.88-megapixel crop of a 20.9-megapixel
raw with sharpen 0.6 and texture 0.4: 4.8 seconds plain, **207 seconds
straightened by four degrees** — 110 seconds a megapixel against 2.6, for the
same picture. The horizon leveller shipped two releases ago, so that combination
is now ordinary rather than exotic.

**AND THE FILE SAID IT HAD ALREADY BEEN FIXED.** The doc comment on
`makeRowDetail` read "Luma rows are cached in a small ring, like the denoiser, so
scanning exports stay close to 1x decode cost", directly above a Map that filled
every pixel of a source row the first time any tap landed on it. The denoiser's
own comment describes this exact defect, with its own 119x measurement, as
something it fixed. A comment is not a ring — and a comment that names the fix is
worse than no comment, because it answers the question for everybody after.

**WHAT IT COSTS NOW** (same file, same edit): whole frame **34.6s** against 33.2
for the eager fill it replaces — 4% slower; the 30% crop 2.56s a megapixel
against 2.55; turned a quarter-turn **2.84 against 3.13**; and straightened
**4.71 against 110.35**, which is the 207-second export finishing in 8.8.

**THREE WRONG HYPOTHESES ABOUT HOW TO PAY FOR IT.** Filling one pixel at a time
fixed the slant and cost **18%** on the ordinary whole-frame export (33.2s to
39.3s). Filling aligned blocks of sixteen — on the theory that the cost was the
flag test — was **no better** (40.0s). The cost was never the test: it was
replacing forty-nine array loads per pixel with forty-nine function calls. One
call per tap ROW, filling the seven-pixel span those taps will read, plus a
single comparison once a row is whole, is what got it to 34.6. A fourth attempt
held the seven row objects while y stood still, to skip seven map lookups per
pixel; **the parity harness refused it** — round-robin eviction can recycle a row
that is still being held — and it was worth two seconds.

**THE SECOND DEFECT, AND THE HARNESS IS WHY IT WAS FOUND.** The first parity run
failed on all sixteen cases, including ones that could not possibly differ (a
scan order with identical sample counts, a texture-only setting). "When a result
looks absurd, suspect the instrument first" — and this time the instrument was
right and the product was wrong.

`LinearSampler`'s contract says in its own words that the returned array may be
reused by the next call. `makeRowDetail` took `const c = base(x, y)` and read
`c[0..2]` **after** forty-nine calls to `raw`. When denoise is off,
`makeRowDenoiser` returns its input sampler unchanged — so `base` and `raw` are
then the same function with the same scratch array, and the centre colour became
whatever the last tap had sampled. The harness passed one sampler as both,
because the product can, which is the only reason it showed up.

**What the fix changes, measured on a 1.3-megapixel crop of the real raw:** with
denoise off and sharpen 0.6 plus texture 0.4, **933 pixels of 1,304,800 (0.07%),
worst by 39 of 255**; with denoise off and straightened four degrees, **95,577
pixels (7.33%), worst by 50 of 255**; and with the denoise the app opens with,
**zero**. So it was never reachable on a photograph opened and exported as the
app hands it over — only with noise reduction pulled to nothing and sharpen or
texture up, where it put a wrong pixel at the start of every row and across most
of a straightened frame.

**ONE QUESTION AT A TIME, OR THE PARITY RUN ANSWERS NEITHER.** Proving the row
cache bit-identical needed the comparison to be against an OLD copy carrying the
centre-colour guard (`/tmp/detail-old-fixed.ts`), otherwise two changes were
being measured as one and the run just said "different". With that separation:
`detailparity.mjs` drives both implementations over four scan orders — row by
row, down the columns, a four-degree slant, and shuffled off every edge — at four
slider combinations including a step of 2, and every value is identical, with
69-98% fewer source samples. It also reports a planted defect (a texture of 0.41
against 0.40) as different, because a comparison that cannot fail is not a
comparison.

**STILL OPEN, AND NOT ATTEMPTED.** The denoiser asks a small function for each of
its twenty-five taps, which is the shape that measured 18% here. Whether the same
span hoist pays there is unmeasured. Its row cache is already lazy, so this is a
speed question and not a correctness one.

## 2026-09-13 — where the work still happens on one thread, and what the graphics chip could take

Written after the export learned to use several cores, because the question that
followed was the right one: is anything else in this app doing by hand what the
machine already has hardware for? Four places, measured.

**THE STRIP AND THE QUICK LOOK GRID RENDER ON THE MAIN THREAD, PIXEL BY PIXEL.**
`makeThumb` runs the compiled edit over every pixel of every tile in a plain
loop, on the main thread, one photograph after another. Measured opening eight
practice raws: **14.1 seconds to a complete strip — 1.8 a photograph — with the
main thread blocked for 5.2 of them across 22 long tasks, the worst 1,841ms.**
That is 37% of the open unable to answer a tap, and the worst single freeze is
nearly two seconds. A forty-photo set extrapolates to about seventy seconds with
half a minute of that frozen.

**DECODE IS ONE WORKER, AND IT IS SERIAL.** `decodeClient.ts` constructs exactly
one, deliberately and with a good fallback story, and every decode in the app
queues behind it: opening a set, the quick look, and the lens rig measuring
ninety flats one file at a time. It was a real win when it landed — the main
thread stopped freezing during a set open — and it left the *parallelism* on the
table. The export's worker pool is the shape this wants: N workers, each holding
its own copy, a job queue in front.

**THE LIVE VIEW IS ALREADY ON THE GRAPHICS CHIP, AND THE EXPORT RE-IMPLEMENTS IT
ON THE PROCESSOR.** This is the finding that matters most and it is not a
performance observation. `gl.ts` carries the whole edit as shaders — noise
reduction, sharpen, texture, clarity, dehaze, halation, grain, vignette, the
hot-spot and lens corrections, the tone curves, the LUT and the perspective warp.
`export.ts` implements every one of them again in TypeScript. Both files carry
comments instructing whoever edits one to keep the literals in step with the
other by hand ("mirror these literals in gl.ts"). Two copies of one edit, kept
identical by discipline, is a defect waiting on the next person who changes one
constant — and making the processor copy three times faster is a lap around it.

**AND A CONTAINER CANNOT SCOPE THAT**, which is why the answer is a page rather
than an estimate. A headless browser draws through a software rasteriser: its
graphics numbers measure the software. So the test page (`debug.html`) grew the
probes the decision actually needs, and the device answers them:

- the largest texture, and whether a whole 5600x3728 frame fits in one;
- whether float and 16-bit drawing are available, which decides whether the
  print-master TIFF path could be drawn or has to stay on the processor;
- **a frame-sized render with twenty-five weighted taps and an exponential in
  every pixel** — the shape of the work that is 60% of an export — drawn and then
  read back in bands, timed separately;
- whether a background thread can draw at all (`OffscreenCanvas` with WebGL2 in a
  worker), because a full-resolution draw on the main thread would freeze the
  editor for its duration, which is the thing the threaded export was built to
  stop doing;
- and how many threads THIS device's export would actually use, and whether it
  was the core count or the memory budget that decided.

**What the container says, recorded as the software-rasteriser figure it is:**
largest texture 8192 (a frame fits), float available, drawing in a worker
available, the frame drawn in 2.9ms and **read back in 2,344ms**. The draw is
meaningless — a software rasteriser defers everything to the read — but the shape
of the answer is the thing to carry: **on this path the readback dominates, and
the readback is the part a live preview never pays.** If a real device reads a
frame back in tens of milliseconds, a drawn export is seconds and worth building.
If it reads it back in seconds, the processor path stays and the duplication has
to be solved a different way.

**THE SCOPE, IF THE ANSWER COMES BACK FAVOURABLE.** Not a rewrite: the shaders
exist and the export already knows how to split work.

1. Render the export through `gl.ts`'s own program at full resolution, into a
   texture rather than the screen, in tiles if the frame is larger than the
   device's limit, reading back band by band. In a worker if the device draws in
   one, on the main thread with the existing yields if not.
2. Keep the processor path for what the shader does not do — heal patches and
   stickers are bitmaps composited separately, and the 16-bit TIFF master needs
   float readback — and fall back to it whole on any failure, exactly as the
   threaded export does.
3. **The proof cannot be the hash this time**, and that is the part to decide
   before starting: a graphics chip computes in float where the processor uses
   doubles, so a drawn export will not be byte-identical to today's. It would be
   identical to THE PREVIEW instead, which is arguably the more honest promise —
   what you saw is what you saved — but it is a product decision about what
   "correct" means, and it is not a session's to make. The measurable form is a
   difference image against the processor export with a stated tolerance, plus
   the same band harness for seams.

**WHAT WOULD BE TRUE AFTERWARDS** is worth stating because it is the real prize:
one implementation of the edit instead of two, with the preview and the export
provably the same thing rather than two files hand-kept in step.

## 2026-09-13 — the first real device report, and what it decided

The test page's new probes came back from a desktop editing machine — 12 cores,
32 GB, a GeForce GTX 1650 through ANGLE/D3D11, Chromium 153. Everything below is
from that report; the iPad is still unmeasured.

**THE GPU QUESTION IS SETTLED, AND IT IS NOT CLOSE.** A whole 20.9-megapixel
frame, with twenty-five weighted taps and an exponential in every pixel, drawn
and then read all the way back: **the draw rounds to 0.0 ms and the readback is
54 ms** — about a tenth of a second in total, against **19.7 seconds** for the
threaded processor export and 46.8 before it. Largest texture 16384, so a frame
fits whole with no tiling; float buffers available, so the 16-bit print master
could be drawn too; and a background thread can draw, so it need not freeze the
editor. The older histogram-shaped probe (a 2000x1400 readback) came back at 22
ms, consistent.

What the probe does NOT cover, and what an implementation still has to pay:
uploading the full-resolution source as a texture, and the real program rather
than a stand-in with the same arithmetic shape. Neither is likely to turn a
tenth of a second into twenty, but neither is measured, and the difference
between "decisive" and "measured" is worth keeping straight.

**THE THREAD CAP WAS COSTING THAT MACHINE HALF ITS CORES.** The report says it
plainly: *Threads a 21-megapixel export would use: 4*, on twelve cores with 32 GB.
The cap of four and the 600 MB budget were both chosen for a tablet, and they
were applied to every device because nothing asked the device what it had.

Both scale now, off `deviceMemory`: a machine claiming 16 GB or more gets up to
eight threads and a 1500 MB budget, 8 GB gets 1000 MB, and **anything that does
not report — which includes every Safari, so every iPad — keeps exactly the
numbers that were measured on one**. That is the right direction of failure: only
a device that says it has memory gets to spend it. On the reporting desktop a
21-megapixel export now takes eight threads rather than four, and a 45-megapixel
raw takes eight as well (179 MB a thread modelled, 1.43 GB in total). On an
unreporting four-core device the answer is 3, unchanged, and a file too large for
two threads still runs on one. `threadpolicy.mjs` asserts all six profiles.

**AND THE STORAGE VERDICT WAS ABOUT TO MISLEAD.** The same report read *77 ms
confirmed against 111 ms unconfirmed* — and the page's verdict line said the
browser "really is waiting for the device", because the two differed by more than
its 25% threshold. Waiting for a disk cannot be quicker than not waiting: a
confirmed write coming back FASTER is not a small durability cost, it is not a
durability measurement at all. The threshold now treats "confirmed is no slower"
as the same non-answer it treats "within 25%" as, and says so in those words.
It is the fourth time in that one function's life that a number which looked like
a measurement was an artefact of how it was taken.

## 2026-09-13 — the tile audit was wrong, and the profile said so

**CORRECTING YESTERDAY'S OWN ENTRY.** The audit above reports that opening eight
raws blocks the main thread for 5.2 seconds across 22 long tasks, worst 1,841ms,
and attributes it to the tiles being rendered pixel by pixel on the main thread.
The structural half is a fact about the code. **The cost half is wrong, and the
number that shows it is 21 milliseconds.**

A 260-pixel tile is 68,000 pixels. That is tens of milliseconds of arithmetic,
not two seconds, and the arithmetic on my own note should have been enough to
stop the claim before it was published. It was not, so a CPU profile through the
debugger protocol settled it: of 10.8 seconds opening six raws, **49% is idle and
24% is `(program)`** — time inside the browser rather than in any JavaScript
frame — with `readPixels` and `texImage2D` the largest named entries. In this
container those are a software rasteriser doing graphics work synchronously. The
long tasks are real; **what is in them is mostly the fake graphics chip.**

**MEASURED PROPERLY, ON THE APP'S OWN ARITHMETIC:** the test page now builds a
tile exactly the way the strip does — the app's compiled edit over the app's own
linear read, into the same canvas and the same JPEG, at the size the strip asks
for — and reports **21 ms**, three runs. Forty tiles is 0.84 seconds of main
thread, not 5.2.

**SO WHERE DOES A SET OPEN ACTUALLY GO?** From the same test page, on the desktop
that sent the first report: **77 ms to commit 6 MB** to storage, which is about
320 ms for a 25 MB raw, and a decode of 43 ms in the worker for a practice file.
On a forty-photo set of 25 MB raws that is roughly 13 seconds of storage commits
alone, serial by design — one confirmed transaction per photo, so a crash can
never leave a half-resumable session. **Storage is the larger half and decode is
the actionable one**: decode is pure computation queued behind a single worker,
and the export's pool is the shape that fixes it.

**WHAT THIS COSTS IN CREDIBILITY IS THE POINT.** The wrong number was published
in a release note, a status page and this file within an hour of being measured,
and the thing that would have caught it — multiplying 68,000 pixels by a
plausible per-pixel cost — takes ten seconds. A measurement that arrives with a
mechanism attached ("the tiles are on the main thread, so the tiles are the
freeze") is the easiest kind to believe and the hardest to check, because the
mechanism is true and it is the ATTRIBUTION that is invented.

**And the instrument it leaves behind is the fix.** `linearAt` moved out of
main.ts into decode.ts in the same commit — not for tidiness: a function inside
the page module cannot be timed by the test page or moved into a worker, and a
copy of it in either place would be a second implementation of the one thing that
must not have two.

## 2026-09-13 — three devices, and the decoder gets lanes

Reports came back from a desktop and both iPads. Everything here is from those
three, and two of the conclusions written yesterday do not survive them.

**THE GPU ANSWER HOLDS EVERYWHERE, INCLUDING THE DEVICE THIS APP IS FOR.** A
whole 20.9-megapixel frame with twenty-five weighted taps in every pixel, drawn
and read all the way back: **54 ms on the desktop, 76 on the 8-core iPad, 61 on
the 4-core one.** All three report a 16384-pixel texture limit, so a frame fits
whole with no tiling; all three have float buffers; all three can draw in a
background thread. Against 19.7 seconds for the threaded processor export, on a
device class where that export is slower still.

**"STORAGE IS THE LARGER HALF OF A SET OPEN" WAS A DESKTOP FACT.** The iPads
commit 6 MB in **15 ms and 29 ms**, against the desktop's 77 — so on the device
this app was built for, storage is nearly free and the decode is what a set open
waits on: a practice raw decodes in **180 ms and 92 ms in the background** on the
two iPads, against 43 on the desktop. The machine with the most idle cores was
paying the most per photograph, through a single decode worker.

**SO THE DECODER HAS LANES NOW.** `decodeClient.ts` keeps the same public call
and the same fallback story, and runs up to three decodes at once (four where the
device reports 16 GB or more): one job per lane, a queue in front, and a lane
that dies takes only its own jobs with it — the single-worker version failed
every pending decode in the app and moved everything to the main thread for the
rest of the session. **How many, and why not simply the core count:** a lane in
flight holds a file's bytes and the decode it produced, about 110 MB for a 25 MB
raw, so three is ~330 MB — inside the envelope the parallel export already
spends and was measured against. Safari reports no memory at all, so a device
that does not say gets the conservative number.

Measured in the container (4 cores, 3 lanes) on eight practice raws: **14.1s to
a full strip becomes 11.8s, and the first photograph on screen 1.1s becomes
0.5s.** The container's storage is its slow part, so the iPad gain should be
larger; the test page reports both halves per device now.

**AND THE PARITY CHECK FOR IT WAS VACUOUS UNTIL A PLANTED DEFECT SAID SO.** The
test page now decodes the same file on the main thread and in a lane and compares
them, which is the claim that concurrency changed nothing. The first version
hashed `a[i] & 255` over the decoded array — and for a Float32Array of linear
values in [0,1] that coerces almost every element to **zero** before masking, so
it hashed a few million zeros and agreed with itself no matter what. A planted
one-pixel change of +0.001 in the worker passed it. Hashing the underlying BYTES
catches it: the same plant now reports `NO — 78a9fa0b against 3651eff7`, and the
reverted build reports yes. *Make a new test fail once before trusting it*, and
this one needed it.

**Two device facts worth keeping.** The 8-core iPad gets **four** export threads,
not seven: Safari never reports `deviceMemory`, so the conservative cap applies
and the budget is not what binds. Raising it is a gamble against a tab kill that
would lose the reader's session, and the drawn export would make the question
moot — so it stays where it is, deliberately. And that same iPad reports a
**1000 MB storage quota** (the other reports 38 GB), which is one forty-photo set
of 25 MB raws: the quota path already stops the open and says so, but it is the
device to remember when anything here assumes room.

## 2026-09-13 — a question that should have been a measurement

**THE DECISION PUT TO THE OWNER WAS HALF A HEDGE.** It read: a drawn export
cannot be byte-identical to today's, so should it match the preview instead, or
should the export stay on the processor? The second half of that is a real
product question. The first half asserted a property of TODAY'S app — "the same
file on every device" — **that was never measured and is probably false.**

The standard allows `Math.exp`, `Math.pow` and the rest to be
implementation-approximated; engines differ. The denoiser calls `exp` 522 million
times in one 20.9-megapixel export. So a Chromium export and a Safari export of
the same photograph agreeing byte for byte would be luck, not design — and the
option "keep it identical" may be protecting something the app has never had.

**It cannot be settled here** (no WebKit in the container), so it went into the
app, which is what §7j is for. The test page now prints two fingerprints:

- **the engine's arithmetic**, over a fixed sweep of the exponentials, gammas and
  logs the pipeline leans on — milliseconds, and the root of the question;
- **a real export of the app's own bundled practice photograph**, at a fixed
  edit, through the real pipeline. Same input on every device, so the number is
  comparable. Two devices printing different fingerprints have never produced
  identical files.

**AND THE PITCH FOR THE PORT WAS ALSO HALF WRONG.** It said the two copies of the
edit — the shaders and the processor path — were kept in step "by discipline", in
a way that implies drift. Measured instead: a practice photograph rendered on
screen against the same photograph exported, compared as block means over the
middle half of the frame (the canvas letterboxes and the export does not), 12x12
grid, per channel: **average difference 3.38 of 255, worst block 17, systematic
shift under 1.3 in every channel.** The export is JPEG at 92 and the canvas is a
display-size render, so a couple of units is this method's floor. **The two
implementations have not visibly drifted.** The case for drawing the export is
speed and preventing FUTURE drift — not repairing present drift, which is not
there.

**TWO INSTRUMENT ERRORS IN THE SAME HOUR, BOTH WORTH KEEPING.** The fingerprint
export was first taken at a scale that produced about a megapixel, then halved
to half a megapixel to make the page quicker — **and it got slower, 10.7 seconds
to 15.5.** A scaled export box-filters: it samples `round(1/scale)` squared source
pixels for every output pixel, so asking for fewer pixels asked for more work per
pixel. It takes a CROP at native scale now. And that 15.5 was taken while an
accessibility sweep was running in the background on the same container, so it
was never a clean number either — a timing taken while something else runs is not
a timing.

## 2026-09-13 — the drawn export, spiked: the colour is right and the detail is not

Built behind the test page, wired to nothing a reader can press, because a pixel
pipeline earns its way in with numbers.

**THE STRUCTURAL FINDING IS GOOD NEWS AND IT SHRANK THE JOB.** `Renderer` already
sizes its canvas from the image it is given (`applySize`), times the crop — so
drawing an export needs NO new geometry, no tiling and no second shader: hand the
same renderer a full-resolution image instead of a preview-sized one and it draws
a full-resolution frame. All three measured devices report a 16384-pixel texture
limit, so a 5600x3728 frame fits whole.

**AND THE HEADLINE NUMBER I QUOTED WAS THE WRONG ONE.** "A frame drawn and read
back in 54 ms" is the per-pixel edit only. The shaders need the whole demosaiced
frame as a texture, and today's export demosaics one pixel at a time inside its
sampler chain and never holds the result. Measured on the same 20.9-megapixel
raw: **0.77 s to read the sensor data out of the file, 2.44 s to demosaic the
whole frame into 334 MB of float32** (2.80 s into 167 MB of uint16, for a
half-float texture). So a drawn export projects to **about four seconds**, not a
tenth of one — still four to five times faster than the 19.7-second threaded
export, and the demosaic is embarrassingly parallel, so the lanes built this
morning could take it further.

**THE COMPARISON, WHICH IS WHY THIS IS A SPIKE AND NOT A RELEASE.** Same
photograph, same edit, 2-megapixel crop, compared BEFORE either is encoded so
JPEG is not in the way:

- average difference **1.26 of 255**, worst **84**;
- colour shift **R -0.22, G -0.21, B -0.01** — there is no tone or colour
  disagreement at all;
- **30.2% of the interior differs by more than 2**, against 19.9% of the
  four-pixel border, and where they differ the local contrast averages **24.1
  against 11.4** over the whole frame.

So the disagreement sits on the EDGES, and that is a footprint difference rather
than a precision one. The denoise and detail taps are defined in PROXY texels:
the live view runs them on a half-resolution copy, and the computed export
reproduces that footprint on purpose by spacing its taps `step` native pixels
apart. Giving the renderer a full-resolution image makes its taps one native
pixel apart — half the width — so it denoises and sharpens a tighter
neighbourhood than the reader saw.

**THE NEXT PIECE IS THEREFORE A TAP SCALE THE RENDERER DOES NOT HAVE.** The
shader multiplies its tap offsets by `u_texel`; a drawn export needs them
multiplied by the proxy factor as well, so what is saved matches what was
previewed. That is a uniform and a setter, defaulting to 1 so the live path is
untouched — and the comparison above is the instrument that will say whether it
worked.

**What the instrument itself is worth recording for.** It reports WHERE the
differences are, not just how big, because "average 1.26, worst 84" is two
different stories and only one of them is a problem. Noise spreads evenly; a
footprint or offset error sits on the gradients; bad edge handling sits on the
border. Without that split the next hour goes into the wrong fix — and on the
first run the honest reading was not available until the instrument could tell
them apart.

## 2026-09-13 — the proxy's premise, tested: drawing from a full frame costs the same

The proxy exists because a full-resolution live render was too expensive when that
choice was made. Whether it still is had never been measured on these devices,
and the answer decides more than speed: the proxy is WHY the noise-reduction and
sharpening footprints are defined in proxy texels, why the export has to
reproduce that footprint by hand, and why a saved file can differ from what was
on screen at all.

**THE COST IS NOT THE DRAWING, AND THE MEASUREMENT IS STRUCTURAL RATHER THAN
HARDWARE-BOUND.** A preview draws as many pixels as the SCREEN has, whatever the
texture behind it. Measured by drawing a screen-sized frame from a full-resolution
texture and from the half-size proxy, back to back in the same run: **1418 ms a
frame against 1412** — the same, within noise. (Those absolutes are a software
rasteriser and mean nothing; the equality is the point, and it is structural: the
work is per output pixel.)

**WHAT IT DOES COST IS MEMORY AND ONE UPLOAD.** 16 MB a megapixel as float32, so
about **340 MB held for a 21-megapixel frame** while it is open — against roughly
84 MB for today's proxy — and 43 ms to hand it over rather than 17. Half-float
(RGBA16F) halves the memory and the renderer already asks for the extension it
needs. On the 8-core iPad, which reports a 1000 MB storage quota and no memory
figure at all, that is the number to be careful about; the other iPad and the
desktop have room.

**WHY IT MATTERS BEYOND SPEED.** A full-resolution preview makes the export a
READBACK rather than a second implementation: the same texture, the same shaders,
the same footprint, so what is saved is what was on screen by construction. It
would retire `proxyFactorFor`, the tap scale added an hour earlier, and the whole
class of defect where a tile or an export disagrees with the photograph. The
comparison already built says the rest of the pipeline is ready for that: with the
neighbourhood operators off, a drawn frame and a computed one differ by **0.21 of
255 on average** — white balance, the camera matrix, highlight recovery, the
hot-spot and lens corrections, tone, saturation, contrast and the channel mix all
agree. With those operators on it is 0.67 average and 11% of pixels over 2, all
of it on edges, which is the footprint question and nothing else.

**The probe is in the test page**, so the three devices can answer the memory
question with numbers rather than a guess. Nothing is wired into what a reader
presses.

## 2026-09-13 — half the memory for the same picture, and what two desktop runs said

**THE FULL-RESOLUTION QUESTION NOW HAS REAL NUMBERS**, from a 12-core desktop
with a GTX 1650, run twice — once from the installed app on production and once
from a browser tab on staging.

- Drawing a screen-sized frame **from a full-resolution texture: 17 ms and 20 ms**
  across the two runs. **From the half-size proxy it uses today: 12 ms both
  times.** Both figures include a full canvas readback the probe does and a real
  preview never would, so the true difference is smaller than the 5-8 ms gap.
- Uploading the full frame: **35 ms and 36 ms**, against 10-11 for the proxy.
- Holding it: **16 MB a megapixel**, so about 340 MB for a 21-megapixel raw.

**AND THE MEMORY HALVES WITHOUT COSTING THE PICTURE.** A half-float (RGBA16F)
source is **8 MB a megapixel — 170 MB for that raw** — and the frame drawn from
it differs from the float32 one by **0.018 of 255 on average, worst 4**. The
average is nothing; the worst is a handful of pixels and is the honest reason not
to call it free. `Renderer.setImage` takes `linear16` now and the shader samples
it identically; the conversion is written out because the browser has no
primitive for it and a DataView per pixel would be twenty million calls.

**THE DRAWN EXPORT IS NOT JUST FASTER, IT IS STEADIER.** On the same machine,
the same 2-megapixel pair: computed **4,115 ms** in one run and **10,370 ms** in
the other — 2.5x apart for identical work — while drawn was **830 ms and
852 ms**. Storage moved the same way (58 ms against 119 ms for 6 MB). Whatever
else the machine is doing lands on the processor path and not on the graphics
one, which is a product fact and not only a benchmark fact: a reader's export
time varies with their machine's mood today.

**Both runs fingerprinted identically** — the arithmetic sweep `b1af01c8` and a
real practice export `e5ac8a29` — so the export is deterministic across runs and
across installed-versus-tab on one engine. The container prints a DIFFERENT
arithmetic fingerprint (`b0bad6ce`) and the SAME export fingerprint, which
calibrates the instrument: **the arithmetic line is a canary, not a verdict.** It
is sensitive to a last-digit difference anywhere in a 2000-step sweep, and an
8-bit export quantises those away. The export fingerprint is what settles
byte-identity, and a Safari engine is still the test that matters.

**Threads and lanes, confirmed on the real machine**: a 21-megapixel export now
takes **8** threads there (it was 4 before the policy read `deviceMemory`), and
**4** decoders run at once. One tile: 16 ms and 23 ms — consistent with the 21 ms
that corrected the earlier claim.

## 2026-09-13 — half-float is not a compromise, it is the faster one

The desktop's third run, with the half-float source in it, and it changes the
conclusion rather than confirming it.

- **Full resolution, float32: 19 ms a frame, 34 ms to upload, 16 MB a megapixel.**
- **Full resolution, half-float: 12 ms a frame, 18 ms to upload, 8 MB a megapixel.**
- **The half-size proxy the app uses today: 13 ms a frame, 9.8 ms to upload.**

So a FULL-RESOLUTION half-float source draws a frame **as fast as today's
quarter-of-the-pixels proxy** — 12 ms against 13 — and faster than the
full-resolution float32 one. Halving the source halves the texture bandwidth as
well as the memory, and sampling is bandwidth-bound, so the smaller format wins
twice. The measurement includes a full canvas readback in every case that a real
preview never performs, and the spread between the three (19, 12, 13) shows that
readback is not what dominates them.

**What it costs the picture stays where it was: 0.018 of 255 on average, worst
4**, comparing the same frame drawn from each source through the same shaders.

**So the proxy has no remaining justification on that machine.** It exists
because a full-resolution render was too costly; a full-resolution half-float
source is the same speed as the proxy and 170 MB for a 21-megapixel raw. What
that buys is not frame time — it is that the preview and the export become the
same pixels at the same scale, which retires the proxy-texel footprint, the tap
scale, `proxyFactorFor`, and the class of defect where a tile or an export
disagrees with the photograph.

**Three runs, one export fingerprint.** `e5ac8a29` from the installed app twice
and a browser tab once, with the arithmetic sweep at `b1af01c8` each time. The
export is deterministic on that engine. A Safari engine is the only thing that
can still move it.

**What the iPads have to answer, and one of the answers is a crash.** The probe
builds both sources back to back, so it holds roughly 150 MB at once on a
5-megapixel practice file. On the iPad that reports no memory figure and a
1000 MB storage quota, a tab that reloads during that section IS the measurement
— it says the device will not hold what a full-resolution preview needs, and the
answer is the half-float path or nothing.

## 2026-09-13 — the byte-identity question, answered: the encoders were never the same

The 8-core iPad ran the fingerprints, and the answer is not subtle.

- **Desktop (Chromium/V8, Edge 153):** arithmetic `b1af01c8`, export
  `e5ac8a29` · **504 KB**.
- **iPad (Safari 26.6, JavaScriptCore, Apple GPU):** arithmetic `b7d5e311`,
  export `158328ac` · **728 KB**.

A 44% difference in FILE SIZE at the same quality setting is not arithmetic
rounding — it is `canvas.toBlob(…, "image/jpeg", 0.92)` meaning two different
encoders. **So "the same file on every device" was never a property this app
had, and could not be one**, whatever the pixel pipeline does. The decision
offered to the owner — keep today's byte-identity, or accept a drawn export that
matches the preview — had nothing on one side of it. That is now measured rather
than argued, which is what it should have been in the first place.

**AND THE FINGERPRINT COULD NOT TELL WHICH HALF DIFFERED**, because it hashes
the finished file. So the test page now prints a SECOND fingerprint: the same
export stopped before the browser encodes it. Two devices agreeing there compute
the same photograph even though their encoders will never write the same bytes —
and that is the property actually worth protecting. It costs a second export of
the practice crop (about seven seconds on an iPad), which is the honest price of
separating the two questions.

**The full-resolution question on that iPad**, for the record: full resolution
float32 **16 ms a frame**, half-float **18 ms**, today's proxy **15 ms** — all
three within three milliseconds, so full resolution costs essentially nothing
there either. Unlike the desktop, half-float is marginally SLOWER on the Apple
GPU than float32 (18 against 16, where the desktop read 12 against 19), so the
format is a memory choice on that device rather than a speed one: 42 MB against
84 for a 5-megapixel frame, 170 against 340 for a 21-megapixel one. What it costs
the picture came back **0.018 of 255, worst 4 — identical to the desktop's
number**, which is a useful cross-check that the conversion is deterministic.

Also from that run: storage **13 ms for 6 MB** (the desktop takes 58), decode 332
ms on the main thread against 182 in the background, three decoders at once, four
export threads, and a drawn export three times faster than the computed one
(1409 ms against 4239).

## 2026-09-13 — all three devices in: the proxy has no justification left, and the catch that keeps it honest

The second iPad (4 cores, Apple GPU) closed the set, and two things are now
settled rather than argued.

**THE EXPORT IS DETERMINISTIC WITHIN AN ENGINE AND DIFFERENT BETWEEN THEM.** Both
iPads printed the identical pair — arithmetic `b7d5e311`, export `158328ac` at
**728 KB** — on quite different hardware, and the desktop printed `b1af01c8` /
`e5ac8a29` at **504 KB**. Same photograph, same edit, same quality setting, 44%
apart in file size. That is two JPEG encoders, not two answers: the pipeline
agrees with itself across Apple hardware and the container differs.

**A FULL-RESOLUTION HALF-FLOAT SOURCE IS AT LEAST AS FAST AS TODAY'S PROXY
EVERYWHERE, AND FASTER ON TWO OF THREE.** Frame times, drawing screen-sized:

- **desktop** — half-float 12 ms, proxy 13, float32 19
- **8-core iPad** — float32 16, half-float 18, proxy 15 (all within three)
- **4-core iPad** — half-float **28**, proxy 35, float32 39

On the weakest device the full-resolution half-float source beats the
quarter-of-the-pixels proxy by 7 ms a frame. Sampling 32-bit float is the
expensive part on an Apple GPU, not the size — which is why the format matters
more than the resolution does. Memory: 8 MB a megapixel, **170 MB for a
21-megapixel frame**, against 16 MB and 340 for float32. What it costs the
picture read **0.018 of 255, worst 4 on all three devices** — the same number
everywhere, so the conversion is deterministic rather than device-dependent.

**AND THE CATCH, WHICH IS NOT A REASON TO STOP BUT IS A REASON NOT TO RUSH.**
Going full-resolution changes what the neighbourhood sliders MEAN unless it is
done deliberately. Denoise and sharpen tap a 5x5 and 7x7 grid in TEXELS; on a
half-resolution proxy that is ten and fourteen native pixels wide, and on a
full-resolution source it would be five and seven. Every photograph the reader
has tuned would render with a finer, weaker denoise and a tighter sharpen —
their settings would quietly mean something else.

So the move is: full-resolution half-float source **with the tap scale set to the
old proxy factor**, which reproduces today's footprint exactly (the shader's
`u_texel` is used for nothing but those taps and their grid snapping). The
appearance is preserved by construction, the preview and the export become the
same pixels at the same scale, and whether the neighbourhood operators SHOULD
work at native scale becomes a separate product question with a slider-meaning
change attached, decided later and on purpose.

**The acceptance test writes itself**: render a photograph before and after the
change and require the pixels to match. That is the same shape as every
bit-identical proof in this file, and it is what stops a performance change from
quietly restyling everybody's photographs.

## 2026-09-13 — every device computes the same photograph, and 3.0 is claimed

**THE PIXEL FINGERPRINT CAME BACK IDENTICAL ON EVERY DEVICE: `7afc9c2a`.** A
Linux container (Chromium), a Windows desktop (Edge 153, NVIDIA) and an iPad
(Safari 26.6, JavaScriptCore, Apple GPU) all compute the same 2-megapixel export,
byte for byte, before encoding. Their FILES differ — `e5ac8a29` at 504 KB against
`158328ac` at 728 KB — and that is `canvas.toBlob` meaning two different JPEG
encoders, nothing about the photograph.

**AND THEIR ARITHMETIC FINGERPRINTS DIFFER** (`b1af01c8` against `b7d5e311`), so
the engines really do disagree about some transcendental somewhere in a
two-thousand-step sweep — **and not one of those disagreements survives to any of
two million pixels.** That is worth knowing precisely: the pipeline is
deterministic across engines in a way the raw arithmetic is not.

**SO THE DECISION I PUT TO THE OWNER WAS WRONG IN BOTH DIRECTIONS, AND THE
MEASUREMENT SETTLED IT.** First it was framed as "today's export is byte-identical
on every device" — false, the files differ by 44%. Then, having measured that, it
was called a hedge with nothing on one side — also wrong. What exists is
**identical PIXELS across devices**, which is a real property and a good one, and
a drawn export would put it at risk because each graphics chip rounds its own
way. The honest statement of the choice is: today the photograph does not depend
on the machine and the export can differ from the preview; drawn, the export
matches the preview exactly on that machine and may differ slightly between
machines.

**WHICH IS ALSO MEASURABLE, SO IT IS BEING MEASURED.** The test page now
fingerprints the DRAWN frame beside the computed one. If two devices print the
same drawn fingerprint, a drawn export is as device-independent as today's and
the choice disappears; if they differ, that line is exactly what would be traded
for the speed. Nobody has to argue about it.

**THE INSTRUMENT GOT CHEAPER IN THE SAME PASS.** Taking those fingerprints
separately meant THREE full exports of the same photograph on every run — 18.3
seconds in the container, paid by a reader standing in front of a tablet. The
comparison probe already computes the computed frame and the drawn frame from the
same edit and the same crop, so the fingerprints are taken from the pair already
in hand: **5.5 seconds instead of 18.3**, same three numbers.

**AND 3.0 IS CLAIMED (owner, 2026-09-13): the OPTIMIZED RELEASE**, shipping when
the export is fixed and the full-resolution question is decided — the two
together. See "## Versioning" for what that means for numbering between now and
then: nothing takes a 3.x until both land.

## 2026-09-13 — a conclusion drawn from one run, reversed by the next

**"A full-resolution half-float source is faster than the proxy on two of three
devices" was drawn from single runs, and the second run of one device reverses
it.** On the 4-core iPad, first run: half-float 28 ms a frame, proxy 35, float32
39. Second run of the same device: **half-float 33, proxy 27, float32 24.** The
ordering flipped completely.

**So the honest statement is narrower.** On the iPads the three sources are
within run-to-run noise of each other — every figure across four iPad runs sits
between 15 and 39 ms, and which one "wins" is not stable. Only the desktop showed
a consistent ordering across two runs (half-float 12-13, proxy 13, float32 19).

**What still stands, because it was measured the same way every time:**

- **memory** — 8 MB a megapixel against 16, so 170 MB against 340 for a
  21-megapixel frame;
- **what half the memory costs the picture** — 0.018 of 255, worst 4, *identical
  on all four devices*, which is what a deterministic conversion looks like;
- **that full resolution is affordable at all** — no device measured it as
  dramatically worse than the proxy, on any run.

**And the deciding argument was never frame time.** It is that the preview and
the export become the same pixels at the same scale. Frame time only had to be
"not worse", and it is not worse.

**THE INSTRUMENT WAS THE REAL DEFECT, AND IT IS FIXED.** The decode and storage
probes take three runs, report the median and print the spread — because a lone
number on a real device invites a conclusion it cannot support, which is written
into this file twice already. The drawing measurement took ONE pass of five
frames and printed one number, and a conclusion was duly drawn from it before the
second run existed. It now takes three passes, reports the median, prints all
three, and its own prose says to compare the spread against the gap between the
rows before deciding one source is faster than another.

## 2026-09-13 — the drawn fingerprint, and what three passes showed immediately

**The desktop's drawn frame fingerprints `fe3da8c6`** (NVIDIA GTX 1650 through
ANGLE/D3D11), against `7afc9c2a` for the computed one — which is expected and not
the question. The question is whether a SECOND device drawing the same photograph
also prints `fe3da8c6`. The container prints `62b68d97` on a software rasteriser,
which says nothing: different renderer entirely. **An iPad's number is the one
that settles whether a drawn export is as machine-independent as today's
computed one.**

**AND THE THREE PASSES PAID FOR THEMSELVES ON THE FIRST RUN.** The spreads:
full resolution **[23, 12, 10]**, half-float **[12, 10, 9]**, the proxy
**[12, 10, 10]**. The first pass is the slowest on every source — a warm-up that
a single-pass measurement folds into the answer and a median discards. On medians
the desktop reads 12 ms, 10 and 10: **half-float and the proxy are equal, float32
is two milliseconds behind.** That is the same story the earlier single runs told,
now with the evidence printed beside it instead of one number to be trusted.

**One housekeeping observation from the same report**: the installed app listed
caches for both `ips-2.43.3` and `ips-2.43.6` with an update WAITING, while
running 2.43.6's bundle. That is §7h behaving exactly as designed — the page came
from the network, the new worker is installed and waiting rather than swapping
under it — but it means the next OFFLINE launch would serve the older cache until
the update is taken.

## 2026-09-13 — the drawn frames differ by machine, and 3.0 splits in two because of it

**`fe3da8c6` on the desktop, `38b69ce1` on the iPad.** The same photograph drawn
through the same shaders on two graphics chips is not the same photograph. Each
one rounds its own way, which is what a graphics chip does — and it is the first
measurement tonight that COSTS something rather than clearing something.

**What today has, and what drawing would trade away.** Every device computes
`7afc9c2a`: the photograph this app makes does not depend on the machine. A drawn
export gives that up. How far apart the two drawn frames are is not directly
measured — a fingerprint says different, not how different — but each differs
from the SAME computed reference by **0.63 average on the desktop and 0.66 on the
iPad, worst 100 and 56**, so the gap between the two drawn frames is bounded by
roughly the sum: under about one and a third of 255 on average, with isolated
pixels far larger. Every measurement of it puts the disagreement on edges.

**AND THIS IS WHY 3.0 IS TWO PIECES, NOT ONE.** They were being treated as a pair
because they arrived together. They are not a pair:

- **The full-resolution preview costs nothing and gives up nothing.** With the
  tap scale holding today's footprint, the preview and the COMPUTED export agree
  by construction — same pixels, same scale — and the export stays on the
  processor, so `7afc9c2a` stays true on every device. Price: 170 MB held for a
  21-megapixel frame, frame time no worse anywhere measured, 0.018 of 255 for the
  half-float source. **Nothing measured argues against it.**
- **The drawn export is the one with a price.** It is four to twenty times faster
  and far steadier (830 ms against 4,115 and 10,370 on the same machine), and it
  makes the saved file depend on the graphics chip that saved it.

So the full-resolution half can proceed on the evidence, and the drawn half is a
decision for the owner with both sides now quantified: **a photograph that is the
same everywhere and an export that takes seconds, or an export that takes one
second and is that machine's own.** That is a real choice about what the product
promises, and it was never a session's to make — the fault earlier was offering
it before it had numbers, not offering it at all.

## 2026-09-13 — three graphics chips, three different drawn photographs

The 8-core iPad drew the practice export to **`a466a4cb`**. The 4-core iPad drew
it to `38b69ce1`. The desktop drew it to `fe3da8c6`.

**Three devices, three answers — and two of them run the same engine.** Both
iPads are Safari 26.6 on JavaScriptCore with an Apple GPU, and they disagree with
each other. So the variation is not Chromium-against-Safari, which could have
been argued as two vendors; **it is per graphics chip**. A drawn export would
produce a file particular to the hardware that drew it, across essentially every
device model, while the computed one produces `7afc9c2a` on all four machines
measured.

That does not make the drawn export wrong — it makes its price precise. Four to
twenty times faster, far steadier, and the saved file belongs to the machine.

**AND THE SAME RUN GAVE THE CLEANEST FULL-RESOLUTION RESULT YET.** All three
sources drew a screen-sized frame in **16 ms**, with spreads of [17, 16, 16],
[17, 16, 16] and [16, 16, 17] — indistinguishable, and tight enough that the
three-pass discipline can say so rather than implying it. Across four devices and
every run now taken, full resolution has never measured meaningfully worse than
the quarter-size proxy on any of them. **Frame time is settled and it is not the
deciding factor; memory is (170 MB against 340 for a 21-megapixel frame), and the
reason to do it was always that the screen and the saved file become the same
pixels.**

## 2026-09-13 — a name that collided with a control, and what was actually being decided

The closing question put to the owner read "full size only, or both". **Both
words were wrong.** The export panel's scale control already reads **"Full
(native)"**, with a **Quality** slider at 92 beside it, and a crop already changes
the output's dimensions — so "full size" pointed at two existing controls and an
obvious third question, none of which were the subject. The owner asked, exactly
as they should have, which of the two they were deciding.

**What the phrase was standing in for**: the editor's INTERNAL WORKING COPY. A
raw is decoded at half resolution for the live view today, and the export
separately re-reads the file at native resolution and recomputes the whole edit
on the processor — two copies of the photograph, two copies of the edit. The
change makes the working copy native so there is one of each. It is invisible as
a control: no scale, no quality, no crop behaviour changes.

**And the question itself was malformed.** The working-copy change has no
measured cost on any of four devices, which by this repo's own rule makes it work
rather than a decision. Offering it as one of two options manufactured a choice
where there was one thing to do and one thing to decide. The single real question
is whether the export is DRAWN (about a second, and the file belongs to the
machine) or stays COMPUTED (four to twenty seconds, and the photograph is
identical on every machine).

**The rule this earns**: before naming a change in a report, check the words
against the app's own controls. A term that collides with a control does not read
as a new idea — it reads as one of the controls, and the reader has to spend a
question finding out it is neither.

## 2026-09-13 — "average 0.6, worst 100" answered neither question, so the instrument now counts what can be seen

**THE COMPARISON REPORTED AN AVERAGE AND AN EXTREME, AND THOSE POINT OPPOSITE
WAYS.** A drawn frame differs from the computed one by 0.63 of 255 on average on
the desktop and 0.66 on the iPad — nothing — with a worst pixel of 100 and 56.
Both numbers are true and neither answers the only question anyone actually has,
which is whether it would be noticed. A lone stray pixel at 100 is invisible in a
photograph; a fringe of four thousand pixels at 24 along every hard edge is a
different product. The instrument could not tell those apart, so a decision was
being carried on a statistic that could not support it.

**IT NOW COUNTS TWO BANDS.** How many pixels differ by more than **8** of 255 —
roughly where a difference stops being absorbed by continuous tone and by a
quality-92 JPEG's quantisation — and how many by more than **24**, which is
visible on a flat area. Both are printed with their percentage and a plain
reading of whether that is a scattering or a fringe. It costs nothing: the loop
that already computes the average, the worst, the border share and the local
contrast gains two comparisons.

**AND IN THE CONTAINER, ON A SOFTWARE RASTERISER, THE ANSWER IS A SCATTERING.**
Two megapixels, the practice raw, the same edit:

- with the noise reduction and sharpening on — 25,894 pixels over 8 (**1.3%**)
  and **492 over 24 (0.025%)**, one pixel in four thousand, the local contrast
  where they differ 29.9 against 11.4 over the frame, so all of it on edges;
- with both of those off — 450 over 8 (0.023%) and 134 over 24 (0.0067%).

That is a fourth renderer, not one of the owner's, and its own fingerprint
(`62b68d97`) is nothing like the three real ones. It is offered as the shape of
the answer, not the answer: the devices print their own numbers on the next run.

**THE PLANT.** The new counter was made to fail first: the threshold was set to
`px > -1` so every pixel qualifies, and the row duly read **100.000%** while the
8-band beside it still read 1.295% — so the counter is wired to the output and a
wrong threshold shows up as an absurd number rather than a plausible one. Then
reverted and re-run for the figures above. A counter that has only ever been seen
printing a small number has not been tested.

**WHAT IT MEANS FOR THE DRAWN EXPORT.** Neither frame is a reference. The
computed one is not ground truth — it is simply the one every engine agrees on,
because they all run the same arithmetic on the processor — and a graphics chip
rounding differently is not a chip rounding *worse*. So no machine would produce
an inferior photograph; they would produce photographs that differ from one
another by about five hundred pixels in two million at a level anyone could
point at, all of it on edges. The property being traded is reproducibility, not
quality — and it is already partly gone, because two browsers write the same
pixels to files 44% apart in size through their own JPEG encoders.

## 2026-09-13 — the native-resolution trap is real, and the way it was written down was wrong

**WHAT WAS WRITTEN AN HOUR AGO:** that `Renderer.setImage` sets `NEAREST` on
every float texture, so a native-resolution working copy would point-sample a
21-megapixel texture down into a view-sized canvas and alias. **The destination
is right and the mechanism was not, and the error was not reading
`applySize`.** The canvas is sized FROM the image — `canvas.width = baseW *
crop.w` — so the drawing buffer is 1:1 with the texture and always has been.
`NEAREST` is correct today for exactly the reason its own comment gives, and
nothing in the current code aliases. A claim about what a file does, written
without opening the function that decides it.

**AND THE CORRECTED VERSION IS A BIGGER FINDING, NOT A SMALLER ONE.** Because
the canvas follows the image, a native-resolution working copy does not quietly
minify — it asks for a **21-megapixel drawing buffer**, which is the precise
thing `MAX_PREVIEW` exists to prevent. Its comment says so: iOS Safari silently
clamps large WebGL drawing buffers, and the symptom is a black canvas rather
than an error. So the change is not "hand the renderer a bigger texture". It is:

- **decouple the drawing buffer from the texture** — canvas at view size, texture
  at native — which no part of the renderer does today and which `applySize`,
  `readUvPixel`, the histogram pass, the crop mapping and `readFrame` all assume
  the opposite of;
- **and only then** does the minification become the shader's job, and only then
  is `NEAREST` an aliasing bug that wants `LINEAR` plus a mip chain. The order
  matters: fix the filter first and nothing changes, because nothing is
  minifying yet.

**THE INSTRUMENT DOES NOT LICENSE THE CANVAS, AND THIS IS THE SHARPER HALF.**
The device numbers that started all of this — a whole 5600x3728 frame drawn and
read back in 54 ms on the desktop and 76 and 61 on the two iPads — were measured
by drawing into a **framebuffer object with a texture attachment**, not into a
canvas. A render target that size being accepted says nothing about a DRAWING
BUFFER that size being accepted; they are different limits with different
clamping behaviour, and the iOS one fails silently. So "both iPads handled a
21-megapixel frame" is true of the export path, which can and should draw into
an FBO, and is unproven for the live view. That is a measurement the test page
still owes: allocate a canvas at frame size, draw, read one pixel, and report
whether it came back black.

**The acceptance test stands as corrected.** The preview cannot be required to
match pixel for pixel — if it matched, nothing would have improved. What must
not move is the **computed export's fingerprint** (`7afc9c2a` on every device,
already taken by the test page) and the **footprint of the noise reduction and
sharpening**, held by `setTapScale(proxyFactorFor(...))` and measured by the
drawn-against-computed comparison rather than judged by eye.

## 2026-09-13 — the canvas-size question, built into the test page, and the plant that caught a lie

**THE MISSING MEASUREMENT NOW EXISTS.** `aCanvasTheSizeOfTheFrame` asks for a
5600x3728 canvas — a whole frame from the camera this app is built around —
clears it to a known colour and reads the FAR CORNER back. Three outcomes, and
they are genuinely different: the size asked for and the colour returned (the
simple version of a native-resolution view works here); a smaller surface than
asked for (the browser clamped and said nothing); or the right size and black
(clamped while reporting success, which is the one that costs a release).

**THE PLANT CAUGHT A FALSE STATEMENT, WHICH IS WHY IT IS WRITTEN THIS WAY
ROUND.** The first version created the canvas at frame size and THEN asked for
the WebGL2 context. Planted at 60000x40000, `getContext("webgl2")` returned
**null** — a third failure mode nobody had accounted for — and the probe duly
reported **"WebGL2 unavailable — not possible on this device"** about a device
whose WebGL2 is perfectly fine. A reader would have been sent to replace a
tablet over a canvas dimension. The fix is the order the app itself uses: get
the context on a 1x1 canvas, then GROW the canvas and read
`drawingBufferWidth/Height`. Re-planted at the same size, it now reports
**"clamped to 5760x5760"**, which is the truth.

**AND THE CONTAINER'S REAL ANSWER IS A NARROW YES.** Unplanted it reports
`yes — 5600x3728`: the frame fits. But the clamp measured one line above it is
**5760** — the frame clears it by 160 pixels. A camera 3% wider would be
refused on this renderer, so "it fits" here is not headroom, it is a near miss,
and there is no reason to expect an iPad's number to be the same one. That is
precisely why this is a device measurement rather than a decision taken here.

**A SECOND SLIP WORTH RECORDING, BECAUSE IT WAS SILENT.** The first plant was
applied by replacing the first occurrence of `const FW = 5600, FH = 3728;` —
and there are TWO functions in that file with that exact line. It planted the
OTHER one, the run came back clean, and a clean run from a plant reads as "the
probe is fine" rather than "the plant missed". It was caught only because the
reported size was 5600 when 60000 had been asked for. A plant has to be verified
BY LINE, not by string, in any file where a constant name is shared — and a
plant that produces a passing result is an instrument failure, never a pass.

## 2026-09-13 — the numbers the test page measured never left the device

**"COPY THE RESULTS" COPIES EACH ROW'S NAME AND VALUE AND NOTHING ELSE.** The
visible-difference bands were added specifically so real devices could report
them — and they were written into the row's EXPLANATION, which the copy button
does not include. The first desktop report came back without a single one of
them. The measurement ran, printed on the screen, and then stayed there.

**That is the same failure as a gate that greps for the wrong string**: the
instrument was correct, the thing it produced was correct, and the channel it
had to travel down dropped it silently. Nothing errored. The row looked complete
on the page, which is the one place the person reading the report is not.

**THE RULE, AND IT IS GENERAL:** anything MEASURED belongs in the row's VALUE.
The paragraph beside it is for what the number means, never for the number. A
swept pass over the file found one more of the same shape — the share of pixels
differing by more than 2 and the local-contrast comparison that decides whether
a disagreement sits on edges — so the value now carries `average`, `worst`, the
two band counts with the frame's pixel count, and the edge concentration as a
single ratio.

**Verified against the COPIED BLOCK rather than the page**, which is the whole
point: the harness now rebuilds what the copy button writes and asserts the
bands are in it. On this renderer it reads `average 0.67 of 255, worst 81 ·
25894 over 8, 492 over 24 of 1999882 · edges 2.6x`.

## 2026-09-13 — what the desktop said, and the one place the drawn export loses

**A FULL-FRAME DRAWING SURFACE IS FINE ON THE DESKTOP: `yes — 5600x3728`.** So
on that machine the cheap version of a native-resolution view works — no
decoupling of the drawing buffer from the texture, no mip chain. The iPads are
the ones that decide whether the expensive version has to be built at all, and
that is still outstanding.

**AND THE DRAWN EXPORT IS NOT UNIFORMLY FASTER, WHICH IS WORTH STATING
PLAINLY.** Same machine, same photograph, the two pairs the comparison runs:

- with the noise reduction and sharpening ON — drawn **898 ms**, computed
  **4,037 ms**;
- with both of them OFF — drawn **1,507 ms**, computed **1,216 ms**. The drawn
  one LOSES.

**The reason is structural and it is the argument for the working copy, not
against the drawn export.** A drawn export's cost is dominated by building and
uploading the source — 994 ms to read the sensor data and demosaic a 5.2-
megapixel frame on this machine — and that cost is the same whether the edit is
trivial or heavy. The computed export's cost scales with the edit, because the
edit IS the work. So drawn wins by 4.5x on a real edit and loses on an empty
one.

**Which is exactly the cost the working copy removes.** Once the editor holds
the frame at native resolution, the source is already built and already on the
graphics chip — the export stops paying 994 ms and becomes a draw and a
readback. The two halves of 3.0 were separated earlier on the grounds that they
are independent. They are independent in RISK and not in VALUE: the drawn export
is worth 4.5x on its own and considerably more behind the working copy.

**Memory, same run, for the record.** Full resolution 84 MB for 5.2 MP (16 MB a
megapixel, so ~340 MB for a 21-megapixel raw); half-float 42 MB. Half-float
takes slightly LONGER to build (1,077 ms against 994 — the conversion is real
work) and then uploads faster (23 ms against 35) and draws marginally faster
(10.0 ms a frame against 11). About even on time, half the memory, and it costs
the picture 0.018 of 255 with a worst of 4.

## 2026-09-13 — two renderers with nothing in common reported the same difference to the digit

**THE OPERATORS-OFF COMPARISON CAME BACK IDENTICAL ON A SOFTWARE RASTERISER AND
AN NVIDIA CARD.** Not close — identical in every field: `average 0.21 of 255,
worst 74 · 450 over 8, 134 over 24 of 1999882 · edges 1.9x`, from a container
running SwiftShader and from a GTX 1650 through ANGLE/Direct3D11.

**Difference statistics that match to the digit are not two chips each rounding
their own way.** They are ONE systematic difference between the shader and the
processor code, reproduced exactly by both renderers — a constant, a conversion,
an order of operations, something with a single cause. Meanwhile the same two
renderers disagree in the operators-ON case (492 over 24 against 559) and their
drawn fingerprints differ across every graphics chip measured.

**WHICH LOCATES THE PROBLEM, IF IT HOLDS.** Everything that makes a drawn export
depend on the machine would then live in the noise reduction and the sharpening
— twenty-five weighted taps and a neighbourhood each — and nothing in white
balance, the camera matrix, highlight recovery, the hot-spot and lens
corrections, tone, saturation, contrast, the channel mix or the wide-gamut
conversion. That is a small enough place to go and FIX, which would dissolve the
last objection to drawing the export at all.

**SO THE TEST PAGE NOW FINGERPRINTS THAT FRAME TOO**, and it costs nothing
because the frame is already in hand from the comparison. If the operators-off
fingerprint matches across devices while the operators-on one does not, the
finding is confirmed and the work is bounded. If it differs, the plain pipeline
varies too and this hope is dead — which is worth knowing just as much, and
cheaper than assuming either way.

**Do not read this as settled from two renderers.** One of them is a software
rasteriser, which is exactly the case where agreement proves least: it may agree
with the processor because it IS a processor. The real test is two different
graphics chips, which is what the devices will answer.

## 2026-09-13 — three graphics contexts leaked on every press of Run

**`fullResolutionPreview` BUILDS A `Renderer` PER SOURCE AND NEVER GAVE ONE
BACK.** Its `finally` set `canvas.width = 1`, which releases nothing: the
context, its programs and every texture it holds stay alive until the canvas is
collected. Three sources, three contexts, each holding a full-resolution texture
— 84 MB, 42 MB and the proxy — leaked on every run, and a browser allows only
about sixteen live contexts before it starts killing the OLDEST, which is
somebody else's renderer.

`Renderer.dispose()` now exists and does what the name says; the probe calls it
in the `finally`. The app's own long-lived renderer never needs it, which is why
the class never had one — a throwaway Renderer is a test-page invention and it
arrived without the matching teardown.

**This is being investigated as a possible cause of a separate regression** — a
second desktop report showed a tile taking 1,030 ms where the run nineteen
minutes earlier said 15 ms, three consistent passes each time. The tile loop is
pure processor work with no WebGL in it at all, so a leaked context cannot
explain it directly; what a leaked context and a 84 MB canvas CAN do is push the
page into memory pressure that a later run pays for. A repeat test is running.
**Not yet attributed — recorded here as an open question, not a diagnosis.**

## 2026-09-13 — all three devices allow a full-frame drawing surface, so the working copy is the cheap version

**`yes — 5600x3728` ON EVERY DEVICE.** The 12-core desktop with the GTX 1650,
the 4-core iPad and the 8-core iPad all allocated a canvas the size of a whole
frame from the camera, painted it and read the far corner back. So the
native-resolution working copy does NOT need the drawing buffer decoupled from
the texture, does not need a mip chain, and does not need the extra third of
memory that a mip chain costs. The expensive version does not have to be built.

**AND FULL RESOLUTION IS NEVER WORSE TO DRAW FROM.** On the 4-core iPad it is
FASTER than the proxy the app uses today — 32 ms a frame against 44, with
half-float at 36 and the spreads overlapping — and on the 8-core iPad all three
sources land on 16-17 ms. On the desktop they are 12, 10 and 13. Across three
devices and every run, no source is meaningfully behind any other; what differs
is memory, 84 MB against 42 for a 5.2-megapixel frame.

## 2026-09-13 — the fingerprint said "different" and I read it as "different picture"

**THE TWO IPADS PRINTED DIFFERENT DRAWN FINGERPRINTS — `38b69ce1` AND
`a466a4cb` — AND IDENTICAL DIFFERENCE STATISTICS.** Every field: average 0.66 of
255, worst 56, 25,662 pixels over 8, 388 over 24 of 1,999,882, edges 2.6x. Five
statistics over two million pixels agreeing exactly while a hash over every byte
disagrees means the two frames differ in a handful of pixels at most.

**So "three graphics chips, three different photographs" was true and
misleading, and it was my sentence.** A fingerprint is a BINARY: it answers
identical-or-not and says nothing about how far. Having built the magnitude
instrument specifically because an average and a worst pixel could not answer
"would I notice", I then let a hash answer exactly that question two paragraphs
later. The honest statement is that the drawn frames differ between graphics
chips of the same family by an amount too small to move any of five statistics.

**AND THE SYSTEMATIC PART TRACKS THE BROWSER, NOT THE CHIP.** With the two
neighbourhood operators off, the numbers cluster in two groups and the grouping
is not what would be expected:

- a software rasteriser and an NVIDIA card through ANGLE/Direct3D11 — nothing in
  common as hardware, same browser family — report `0.21 · worst 74 · 450 over 8
  · 134 over 24 · edges 1.9x`, identically;
- two different Apple GPUs in two different iPads report `0.19 · worst 47 · 152
  over 8 · 31 over 24 · edges 1.8x`, identically.

Same browser, agree to the digit across utterly different hardware. Different
browser, differ. So the systematic difference between a drawn frame and a
computed one is a property of how the BROWSER compiles and runs the shader, and
the per-chip residue on top of it is the handful of pixels above. That is the
opposite of "it depends on your graphics card", which is what this file said
twice today.

**The Safari numbers are also SMALLER** — 152 pixels over 8 against 450, 31 over
24 against 134 — so on the devices this app is actually used on, the drawn
colour pipeline agrees with the computed one more closely than on the desktop.

## 2026-09-13 — what the drawn export costs on the devices, not the desktop

Three devices, the same 2-megapixel photograph and the same edit:

- **4-core iPad** — drawn 625 ms, computed 2,689 ms;
- **8-core iPad** — drawn 1,084 ms, computed 4,278 ms;
- **desktop** — drawn 895 ms, computed 4,056 ms.

Roughly four times faster everywhere, and the iPads are where it matters, since
they are the machines with the fewest cores to throw at a computed export — the
4-core iPad uses three threads and the 8-core four, against the desktop's eight.
Building the full-resolution frame, which is most of a drawn export's cost
today, takes 466 ms on the 4-core iPad and 713 on the 8-core. **All of that
disappears once the working copy holds the frame**, because the source is then
already built and already on the graphics chip.

## 2026-09-13 — the half-precision conversion is one file now, rounds properly, and its test failed three times for three wrong reasons

**IT WAS WRITTEN INSIDE `gpuexport.ts` FOR ONE CALLER** — the probe asking
whether a full-resolution source could be held in half the memory. The devices
said yes, so the editor's working copy becomes half-float, and the moment that
happens the same arithmetic is needed by the heal patch, the sticker bake and
anything else touching the pristine buffer. Two copies of a float conversion is
the two-file-lists shape from the hub's lessons: one gets a fix and the other
does not. It is `src/half.ts`, and `gpuexport.ts` imports it.

**AND IT WAS TRUNCATING WHERE IT SHOULD ROUND.** Measured over 300,001 values
across the working range: truncation averages **0.055 of 255** and peaks at
0.249; round-to-nearest-ties-to-even averages **0.028** and peaks at **0.125**.
Exactly half the error, for one comparison and an increment. It also now clamps
a mantissa carry that would otherwise roll into exponent 31 and produce an
infinity — a value one step over the top of the range meaning a black or white
hole in the picture.

**THE TEST FAILED THREE TIMES AND WAS WRONG ALL THREE TIMES.** Every failure
accused working code:

1. **Hand-typed bit patterns.** `toHalf(0.0001)` was asserted to be `0x018c`,
   which is a subnormal encoding of 2.36e-5. The correct answer, `0x068d`, is
   what the code returned. A constant somebody writes out by hand is not a
   reference, it is a second implementation with no tests.
2. **Demanding exact agreement with the reference.** Two correct
   round-to-nearest implementations differ by ONE step at an exact midpoint —
   one breaks ties to even, the other away from zero. 23 of 300,001 disagreed,
   all by one step, none further.
3. **Measuring the error against the float64 literal** instead of the float32
   value the converter is actually handed. In float32 those 23 are EXACT ties,
   equidistant; in float64 they look like one side being nearer, so the test
   reported the code as the worse of the two. Verified by printing the low
   thirteen mantissa bits: `0x1000`, the tie value exactly.

**The reference is an independent implementation now** — sign, exponent and
mantissa from `Math.log2` and `Math.round`, sharing no line with the bit
twiddling it checks — rather than a list of constants. And the bar it holds is
the one that is actually true: never more than one step apart, and never the
worse of the two against the float32 value.

## 2026-09-13 — the working copy runs at native resolution, and its acceptance test is not finished

**WHAT LANDED.** For mosaiced raws, `toPreview` now builds the whole frame at
native resolution in half precision through `buildLinearSource`, and
`uploadPreview` sets `setTapScale(proxyFactorFor(...))` beside `setImage` so the
two can never be out of step. `Renderer` gained `isHalf` and `patchImage`
converts a float rect on the way in; `bakeRgbaF32` and `lumaAccessor` read a
half-float pristine buffer. Above 24 megapixels the old binned proxy is used
instead — memory, not the drawing surface, since all three devices allocate a
full-frame surface.

Measured in the container on a practice raw: the canvas goes from **1400x932 to
2800x1864**, the photograph is on screen (mean 110.6 of 255, not a black
canvas), and against the old proxy at the same displayed size the picture
differs by **0.748 of 255 on average, worst 24, one sample in 326,200 over 24**.

**THE NEGATIVE CONTROL FAILED THE FIRST TIME, AND SAYING SO IS THE POINT.**
Planting a wrong tap scale — the reader's noise-reduction and sharpening
footprint halved, which is the single defect this change most risks — moved the
picture by **0.229 of 255, worst 6, ZERO samples over 8**. The test could not
tell a correct tap scale from a missing one. A test that cannot fail on the
defect it exists for is not evidence, and the change would have been reported as
verified on it.

**FIRST CAUSE: the settings.** A photograph opens with the noise reduction
barely above the grain and sharpening at zero, so the footprint those two work
over barely touches the picture. With them at 0.47 and 0.4 the plant moves it to
**0.540 of 255, worst 24, 233 samples over 8** — teeth, but not many.

**SECOND CAUSE, AND THIS ONE IS THE INSTRUMENT: it samples at 700x466.** Both
canvases are 2800 wide, so every sample averages about sixteen source pixels —
and a halved denoise and sharpen footprint lives exactly in that fine detail.
The comparison is being taken at the scale least able to see the thing it is
looking for. The earlier drawn-against-computed measurement, which found 30% of
pixels over 2 from precisely this defect, compared at native resolution.

**SO THE VERIFICATION IS NOT DONE AND THIS IS NOT CLAIMED AS VERIFIED.** What it
needs: comparison at the canvas's own resolution rather than downsampled, and a
sweep of several practice frames rather than one photograph at one pair of
slider values — which is this repo's own standing rule for a pixel-pipeline
change and was being skipped. Whichever number a single frame produced would
have been a test set to solve toward.

## 2026-09-13 — the working copy costs two to three seconds every time you open a photograph, and that is not acceptable yet

**THE SWEEP DID NOT FINISH, AND CHASING WHY FOUND A REAL DEFECT.** Four practice
raws, opened as a set, thirteen minutes, not one frame captured. The container's
software rasteriser makes everything slow, so that alone proves nothing — but
the device numbers already on record say the same thing and they are not a
container artefact.

**BUILDING THE FULL-RESOLUTION FRAME IS NOT FREE AND IT IS PAID PER
PHOTOGRAPH.** From the test page, on a 5.2-megapixel practice raw: **466 ms on
the 4-core iPad, 713 ms on the 8-core, 994-1,100 ms on the desktop**. The camera
this app is built around makes 20.9 megapixels — four times that frame — so
opening or switching to one photograph would cost roughly **two seconds on the
4-core iPad and three on the 8-core**, on the MAIN THREAD, before anything
appears. Today that is a binned demosaic that is essentially instant.

**So the change as it stands trades a real, frequent cost for a benefit the
reader cannot see directly.** The benefit is worth having — the preview and the
export become the same pixels — but not at a two-second stall on every photo in
a forty-photo session. Nobody would take that trade if it were put to them, and
it was not put to them; it was introduced by a session optimising something
else.

**THE SHAPE OF THE FIX IS ALREADY IN THIS APP.** The session strip shows every
tile immediately and fills each one in afterwards; the same discipline applies
here. Show the binned proxy at once, exactly as today, then upgrade to the
native-resolution frame when it is ready — and build it OFF the main thread,
which the decode worker already demonstrates is possible for this exact data.
The reader sees the photograph at the speed they see it now and it quietly
sharpens, rather than waiting for a better one.

**Until that exists, the working copy on staging is a measurement, not a
release.** It is correct, it is honest about memory, and it stalls the editor.
Recorded here rather than discovered on a tablet.

## 2026-09-13 — the photograph arrives at the old speed and sharpens behind itself

**THE STALL IS GONE AND THE SHAPE IS THE SESSION STRIP'S.** `uploadPreview` puts
the binned proxy up exactly as it always has, then `upgradeToNativeResolution`
fills in the native-resolution half-float frame behind it and swaps.
`buildLinearSourceInBands` does the demosaic in 64-row bands with a macrotask
between each — a microtask would run straight back without letting the browser
paint, which is the same freeze wearing a different hat. Measured in the
container: **on screen in 0.55 s at 1400 wide, 2800 wide four seconds later**,
and the editor answers throughout.

**THE RACE IS THE DANGEROUS PART AND IT IS GUARDED.** A build that finishes
after the reader has moved on must not paint — `nativeGen` is bumped by every
upload and checked between bands and again before the swap. The swap also resets
every `baked*` flag, because the texture is new and a stale "already baked"
would leave a reader's heals and stickers silently missing from the sharper
picture.

**THE TEST FOR IT TOOK THREE TRIES AND EACH FAILURE WAS THE INSTRUMENT.**

1. **It only checked the end state.** Both photographs start a build; the
   abandoned one can finish FIRST, paint, and be overwritten a moment later — so
   the test passes while a reader sees the wrong photograph flash up. It now
   samples every 250 ms across the whole window.
2. **Then it failed on correct code.** Sampling began at the click, catching the
   normal moment between selecting a photograph and its proxy being uploaded —
   the old picture not yet replaced, which is not this defect. It arms only once
   the selected photograph is actually on screen; after that, the abandoned one
   reappearing is fair game.
3. **And the first plant did not compile.** TypeScript rejected it — `gen`
   unused — so the "negative control" ran against the CORRECT build, and a green
   result there would have been read as the test having teeth. A plant that does
   not build is not a plant. Re-planted referencing `gen` in a way that never
   stops anything, it **failed**, which is what a negative control is for.

**One honest note on what the failing frame showed.** With the guard removed the
offending frame read 87.16 against photo 0's 110.88 and photo 1's 115.39 — far
from both. So the test detects "not the selected photograph" rather than
specifically "the abandoned one", and what appeared was more likely a frame
caught mid-swap than photo 0 fully painted. It separates correct from planted,
which is its job; it is not a diagnosis of what a reader would have seen.

## 2026-09-13 — the rounding fix shows up on the device, and the locating fingerprint has its first value

**HALF PRECISION NOW COSTS 0.010 OF 255 INSTEAD OF 0.018.** The desktop's test
page reports `What half the memory costs the picture: average 0.010 of 255,
worst 4`, against 0.018 on every run before `half.ts` started rounding to
nearest instead of truncating. That is the synthetic measurement — 0.055 down to
0.028 over 300,001 values — arriving on a real device on a real photograph, at
the same ratio. A change measured in a test and then confirmed in the product
rather than assumed to have carried.

**AND THE TILE IS 16 MS AGAIN** — 17, 15, 16 across three passes, against the
1,030 ms that three consistent passes reported before the graphics contexts
stopped leaking. This is a fresh page load rather than a second run in the same
tab, so it is consistent with the fix rather than proof of it; the proof is the
before-and-after in the container, where a second run went from never finishing
in ten minutes to 107 seconds against the first run's 105.

**THE COLOUR-ONLY DRAWN FINGERPRINT: `643772fa` on the desktop** (NVIDIA GTX
1650 through ANGLE/Direct3D11). This is the line that locates where a drawn
export's dependence on the machine actually lives. Its value alone says nothing
— **an iPad's is what settles it**:

- if an iPad also prints `643772fa`, then the whole colour half of the pipeline
  is bit-identical across graphics chips AND across browser engines, and
  everything that makes a drawn export machine-specific is inside the noise
  reduction and the sharpening — a bounded place, with a real prospect of being
  fixed, after which a drawn export would be as device-independent as today's
  computed one;
- if it differs, the plain pipeline varies too and that prospect is dead, which
  is worth knowing before any work is spent on it.

The operators-on drawn fingerprint stays `fe3da8c6` on this machine, the
computed pixels stay `7afc9c2a`, and the saved file stays `e5ac8a29` at 504 KB —
all unchanged across every release tonight, which is the point of taking them.

## 2026-09-13 — the locating fingerprint came back and killed the hypothesis it was built to test

**THREE DEVICES, THREE VALUES, AND THE TWO IPADS DIFFER FROM EACH OTHER.**
With the noise reduction and sharpening OFF — colour pipeline only, no
neighbourhood operators anywhere in it — the drawn frame fingerprints
`643772fa` on the desktop, `85ea2da9` on the 8-core iPad and `9f4f8282` on the
4-core iPad. The last two are the same browser, the same engine and the same GPU
family.

**So the hope is dead, and it was stated in advance which result would kill
it.** The proposition was that everything tying a drawn export to the machine
lives inside those two operators, and that fixing them would make a drawn export
as reproducible as today's computed one. It does not and it would not. The
colour half — white balance, the camera matrix, highlight recovery, the hot-spot
and lens corrections, tone, saturation, contrast, the channel mix, the
wide-gamut conversion — is already per-chip at the bit level. **A drawn export
can never be byte-reproducible across machines, and no bounded piece of work
changes that.**

**WHAT THE EARLIER READING GOT WRONG, AND IT WAS A REAL ERROR.** Two renderers
reporting identical difference STATISTICS was read as one systematic difference
reproduced by both. The statistics are identical; the frames are not. Identical
aggregate numbers over two million pixels and a differing hash mean the frames
differ in a handful of pixels — which is what was concluded about the iPads'
operators-ON frames an hour earlier and should have been concluded here too. The
same mistake, in the same session, about the same pair of measurements: a
fingerprint answers identical-or-not, and aggregates answer how far, and neither
one answers the other's question.

**IT CHANGES NOTHING ABOUT WHETHER TO DRAW THE EXPORT.** The magnitudes are
unchanged and still invisible: on the iPads, **152 pixels over 8 of 255 and 31
over 24, out of 1,999,882**, with the noise reduction and sharpening off; 388
over 24 with them on. What it changes is that "drawn AND identical everywhere"
was never on the table, so it must not be offered, planned for, or implied. The
honest statement stays the one measured: a drawn export is that machine's own,
by an amount nobody can see.

**AND THE ROUNDING FIX IS CONFIRMED ON ALL THREE DEVICES.** `What half the
memory costs the picture` reads **0.010 of 255** on the desktop and both iPads,
against 0.018 on every run before `half.ts` began rounding to nearest. Same
value on three different graphics chips and two engines, which is what a
deterministic conversion should look like.

**Frame times, with the source the app actually ships (half precision):** 4-core
iPad 32 ms against the proxy's 37; 8-core iPad 17 against 16; desktop 10 against
11. Level everywhere, and the full-resolution frame is now built in bands behind
the photograph rather than before it.

## 2026-09-13 — the footprint sweep, at the right resolution, over four frames

**THE HALVED-FOOTPRINT PLANT, MEASURED AT THE CANVAS'S OWN RESOLUTION:**

- NIR_0063 — average **0.995** of 255, worst 59, **33,296** pixels over 8
  (0.64%), 669 over 24;
- NIR_0152 — average **1.925**, worst 124, **135,643** over 8 (2.60%), 1,319
  over 24;
- NIR_1675 — average **1.620**, worst 85, **137,777** over 8 (2.64%), 2,692 over
  24 (the portrait frame, 1864x2800);
- NIR_1873 — average **2.519**, worst 79, **257,632** over 8 (4.94%), 4,971 over
  24.

**AGAINST WHAT THE SAME PLANT MEASURED BEFORE: 0.229 of 255, worst 6, ZERO
pixels over 8.** The downsample to 700 pixels was hiding essentially the whole
effect — sixteen source pixels averaged into every sample, and a halved denoise
and sharpen footprint is precisely what lives inside that average.

**AND THE ONE FRAME IN THE FIXTURE WAS THE LEAST SENSITIVE OF THE FOUR.**
NIR_0063 shows 0.64% of pixels over 8; NIR_1873 shows 4.94% — nearly eight times
as much. Verifying on the single frame that happened to be there, even at the
right resolution, would have reported the smallest signal available as though it
were the measurement. That is the test-set rule from Doctrine §14 arriving as a
number rather than a principle.

**WHAT THIS PROVES AND WHAT IT DOES NOT.** It proves the tap scale is
load-bearing and that what ships is not the halved value — the sweep separates
correct from planted on every frame, by margins from 33,000 to 257,000 pixels.
It does NOT prove the shipped value is exactly right; a test that distinguishes
a value from one wrong value is not a test that the value is correct. The reason
to believe it is right is separate and should be stated as such: `proxyFactorFor`
is the same function the computed export already uses to reproduce the proxy's
footprint, and the test page's drawn-against-computed comparison — which runs
through the same tap scale — still reports 0.66 of 255 with the operators on,
unchanged from before the working copy existed.

## 2026-09-13 — what the full-resolution copy is actually worth, measured on a real frame

**AT THE SIZE A PHOTOGRAPH IS SHOWN, IT IS WORTH NOTHING, AND THE NUMBER SAYING
SO WAS ALREADY IN THIS FILE.** The before-and-after comparison read **0.748 of
255 average, one sample in 326,200 over 24** — and it was recorded as "the look
holds", which is true and is not the point. The half-size copy is 2,800 pixels
wide against a display using about 1,200: it already had 2.3 times more pixels
than the screen could use, so doubling that to 4.7 cannot show anybody anything.
The measurement was a verdict and it was read as reassurance. It took the owner
saying they could not tell two images apart for the file's own number to be
read correctly.

**ZOOMED TO 1:1 IT DOES SHOW, AND ONLY WHERE THERE IS DETAIL TO SHOW.** Twelve
regions of a real 20.9-megapixel frame (`NIR_2082.NEF`), each blown up to the
same size on screen, half-size against full:

- the most detailed region — **3.67 of 255 average, 8.6% of samples over 8**;
- the next three — 3.25, 2.63, 2.52, between 3.8% and 7.0% over 8;
- the flat top row, which is sky — 1.49 to 1.65, around 0.5% over 8;
- worst single sample anywhere: 41 of 255. A softness difference, not a
  different photograph.

**AND THE FIRST VERSION OF THAT MEASUREMENT SAMPLED ONE PATCH**, at 42%/42%,
chosen for no reason, and reported 2.07 as the answer. Whether extra pixels show
anything depends entirely on what is in the patch — sky shows nothing however
many pixels it has — so one patch is a test set and which one it is decides the
verdict. Twelve across the frame, reported as a spread, cannot be picked to
suit. (Doctrine §14, written six hours earlier, applied to the session that
wrote it.)

**SO THE UPGRADE WAITS 1.2 SECONDS NOW.** Flick through a session of forty and
not one of them rebuilds; settle on a photograph and it sharpens behind itself.
The cost — about four seconds of background work and 170 MB held — is paid where
it buys something and nowhere else, and nobody has to press anything.

**ALSO CORRECTED: the structural benefit that was quoted repeatedly is not real
yet.** "The preview and the export become the same pixels" was cited several
times tonight as the deciding argument. The export computes from the file
independently and never reads the preview copy, so that benefit arrives only if
the export becomes a readback of the preview — and the drawn export is per-chip,
settled tonight. Until that is built, the full-resolution working copy buys
zoomed-in detail and nothing else. It was a real argument about a future state
being used as though it were a present one.

## 2026-09-13 — adding the settle delay silently disarmed the test that guards the swap

**THE RACE TEST SWITCHED PHOTOGRAPHS 300 MS APART.** That was correct when the
rebuild started the moment a photograph opened. Adding the 1.2-second settle
delay meant photograph 0's build never STARTED before the switch — so the guard
against a finished build painting over the wrong picture was not exercised at
all, and the test went green for the wrong reason. Nothing failed. Nothing
warned. A passing test whose trigger condition had been removed underneath it.

Fixed by waiting 2.6 seconds — past the delay and into the work — before
switching. It passes again, and now for the reason it claims.

**BE PRECISE ABOUT WHAT THAT PASS RESTS ON.** The test does not directly assert
that the build was in flight at the moment of the switch; it infers it. The
chain: the reference captures at the top of the same run show both photographs
reaching native resolution when left alone, so the upgrade does start and
finish; 2.6 seconds exceeds the 1.2-second delay; therefore the build was
running when the switch happened. Sound, and inference rather than assertion —
recorded as such so the next session does not read it as stronger than it is.

**THIS IS THE FOURTH SHAPE OF THE SAME FAILURE IN ONE SESSION**, and the pattern
is worth more than any of the instances:

- a plant applied by string that landed in a DIFFERENT function with the same
  constant name, and the clean run read as "the probe is fine";
- a plant that did not COMPILE, so the negative control ran against the correct
  build and would have been read as the test having teeth;
- a comparison sampled at 700 pixels from a 2,800-wide canvas, which reported a
  planted defect as zero pixels over 8 because the defect lives in exactly the
  detail that downsampling averages away;
- and this one: a guard's trigger condition changed by an unrelated improvement,
  leaving its test passing while measuring nothing.

**Every one of them looked like a pass.** None of them failed, errored, or
warned. The only thing that caught any of them was going back and asking what
the green actually proved — which is the habit, not any particular check.

## 2026-09-13 — a lost graphics context was a blank editor that survived clearing the session

**THE SYMPTOM, FROM A REAL IPAD:** a photograph that would not decode while
switching, and then a NEW session showing nothing at all — an empty space where
the photograph goes, with a populated histogram and a populated strip beside it,
and the zoom control reading 100%. Clearing the session did not help.

**THE CAUSE: THERE WAS NO CONTEXT-LOSS HANDLING ANYWHERE IN THE APP.**
`grep webglcontextlost src/*.ts` returned nothing. When the browser takes the
WebGL context back — short of memory, a long spell backgrounded on iOS, a driver
reset — every draw afterwards silently does nothing. No error, no exception, no
warning. And a new session does not make a new context, so the blank survives
everything except a page reload, which nobody could be expected to work out from
an empty rectangle.

**That is a defect independent of what triggered it here.** The native-resolution
working copy made it likely by asking for 167 MB of texture and an 84 MB drawing
buffer on top of a session already holding 216 MB, but iOS backgrounding would
do the same to an app that had never had that feature.

**WHAT IS THERE NOW.** `Renderer` listens for `webglcontextlost`, calls
`preventDefault` (without it the browser never offers restoration at all),
records the loss and exposes `lost`. The app shows an overlay in the same shape
as the existing no-WebGL2 one: what happened, that reloading fixes it, what a
reload costs — the open session — and a button. It ASKS rather than reloading,
because the cost is the reader's work.

**FULL RECOVERY IS NOT CLAIMED AND IS NOT DONE.** Rebuilding every program,
texture and uniform on `webglcontextrestored` is a larger piece of work than
this, and a half-restored renderer that draws nothing while reporting success
would be worse than the blank it replaces. The flag stays set until a reload
builds a real one.

**AND THE TEST FOUND A REAL DEFECT IN THE FIX.** Driving the failure for real —
`WEBGL_lose_context` is the browser's own simulation of exactly this — the
overlay appeared, said the right things, and its button measured **34 pixels
tall against this repo's 44-pixel floor**. The one control on the one screen a
reader reaches when nothing else works, too small to hit by touch. It inherited
`.btn` and nothing checked it. 44 now, asserted by that test.

## 2026-09-13 — the drawing-surface probe now asks the question the app faces, and its ceiling branch is UNPROVEN

**IT ASKED ON AN EMPTY PAGE, AND THAT ANSWER COST A SESSION.** The probe
requested a 5600x3728 canvas with nothing else allocated, got it on all three
devices, and that was written down as "all three devices allow a full-frame
drawing surface — so the working copy is the cheap version everywhere". In the
editor the same request happens while the session holds a couple of hundred
megabytes of photographs, the current one's texture and the previous one's
buffers. It failed there, silently, and the photograph went blank. **The probe
was never wrong; what it was taken to mean was.**

**IT NOW CLIMBS A LADDER.** Ask for the full-frame canvas, hold another 100 MB,
ask again, and keep going to about a gigabyte — stopping at the first refusal and
reporting how much was held when the surface stopped being available. The buffers
are TOUCHED rather than merely allocated, because an untouched buffer may cost
nothing until it is used, which would make the ladder measure a promise. The row
says plainly that the figure is an approximation, since real memory is fragmented
differently from a ladder of big buffers.

**AND THE CEILING BRANCH HAS NOT BEEN SEEN TO FIRE.** Two attempts to force it
in the container failed for unrelated reasons, and the honest state is that the
"lost it at N MB" path is reasoned but unobserved:

- squeezing the JS heap to 256 MB made the whole test page crawl — it builds an
  84 MB frame on the way past — and twenty minutes produced nothing;
- squeezing only graphics memory did not produce a result either;
- and a planted step of 100,000 MB, meant to fail instantly, **did not throw at
  all — the browser sat on it for over ten minutes.** Which is its own finding,
  and is fixed: no single step may now exceed 512 MB, because a hang inside a
  diagnostic is worse than the question going unanswered.

**A third self-inflicted one, recorded because it has now happened twice
tonight:** `pkill -9 -f ladder.mjs` killed the shell running the command that
contained that string, before it did anything — the self-match the hub's own
lessons describe for `pgrep -f`. Kill by PID.

So this ships as strictly more information than the probe it replaces, with its
failure path untested here. **The devices are where it gets exercised** — the
8-core iPad reporting a 1000 MB quota is precisely where a ceiling should appear,
and if it never does on any device, that is a finding about the ladder rather
than about the devices.

## 2026-09-13 — the lost-graphics overlay, audited as a surface rather than as a button

It shipped having been checked for exactly ONE thing — the reload button's
height — and that check found a real defect (34px against this repo's 44px
floor), which is reason enough to think the rest was worth measuring too. This
repo's standing rule is that a new reader-facing surface gets the a11y walk
before it ships, and a new surface had just been added without one.

Both themes, axe over the overlay subtree, contrast computed from the rendered
colours rather than from the palette:

- **dark** — heading and body 9.45:1, button label 9.54:1, focus ring present,
  0 axe violations;
- **light** — heading and body 12.84:1, button label 9.19:1, focus ring present,
  0 axe violations.

All well clear of 4.5:1. Nothing to fix, which is the outcome that only counts
because the same harness had already found something on this surface an hour
earlier.

## 2026-09-13 — the ladder answered "no ceiling at 1 GB", which means it is measuring the wrong memory

**THE 8-CORE IPAD — the constrained one, the one that reports a 1000 MB quota
and no memory figure at all — came back `still available with 1000 MB held`.**
The ladder ran every step and the full-frame drawing surface was never refused.

**THAT DOES NOT VINDICATE THE FEATURE. IT CONVICTS THE INSTRUMENT, AGAIN.** The
ladder holds `Uint8Array`s: system and JavaScript-heap memory. The editor's
pressure at the moment things broke was a **167 MB RGBA16F TEXTURE plus an 84 MB
drawing buffer** — GPU-side allocations that a ladder of ArrayBuffers does not
touch at all. So the probe now answers "can this device allocate a big canvas
while the JS heap is loaded", which is a real question and is **not the question
the editor failed at**.

This is the SAME error as the version before it, one level in. The first probe
asked on an empty page and was read as though it had asked under load. This one
loads the wrong side of the machine and is about to be read as though it had
loaded the right one. Writing "measure it under load" was not enough; *which*
load was never specified, and the obvious-to-allocate thing is not the thing
that was scarce.

**WHAT THE FAILURE ACTUALLY LOOKED LIKE, re-read with this in hand.** A NEF that
would not decode while switching photographs is a heap allocation failing inside
the decoder. A blank canvas that survived clearing the session is a lost WebGL
context. Both are consistent with GPU-side exhaustion, or with the two kinds of
memory together, and neither is measured by what is currently shipping.

**SO THE LADDER NEEDS A SECOND RUNG: hold what the editor holds.** Full-
resolution half-float textures, one at a time, the size a real frame makes, with
the canvas re-tested after each. That is the number that decides whether the
full-resolution view returns — and until it exists, the feature stays off on the
strength of a real session breaking, not on the strength of any measurement
taken here.

**Also in the same report, worth having:** uploading a full-resolution frame
took **59 ms** where earlier runs on this device said 15-23, while the half-
memory upload stayed at 17. One run, so not a conclusion — but the half-float
path being three times cheaper to upload is consistent across every run tonight.

## 2026-09-13 — the update strip announced a worker swap as a new version, and registration failures are invisible

**WHY A VERSION APPEARS, GETS RELOADED, AND IS THEN OFFERED AS AN UPDATE.**
Navigations are network-first (`sw.js`: "always try for the freshest app shell"),
so a reload hands the reader the new page immediately and `__APP_VERSION__` shows
the new number. The browser SEPARATELY notices `sw.js` changed, installs a new
worker and parks it. The strip's condition was `if (reg.waiting &&
navigator.serviceWorker.controller) show()` — the EXISTENCE of a waiting worker,
with no version comparison anywhere — so it announced that parked worker as "a
new version is available", naming the version already on screen. What was
actually pending was the offline copy catching up, which needs no decision from
anybody. **Being offered an update to what you are already running is how a
reader learns to ignore the strip**, and §7h only works if the strip is believed.

Fixed: the worker answers a `VERSION` message, and the strip asks before it
speaks. Same version, silent; different, shows as before; no answer inside 1.5 s
falls through to showing, because informing wrongly is a smaller failure than
silence about a real update.

**AND THE TEST PAGE NEVER HAD A STRIP AT ALL.** `swupdate` was imported by
`chooser.ts` and `main.ts` only. The page somebody is most likely to be sitting
on while a release goes out was the one page that never mentioned one. Wired.

**THE BIGGER FIND, WHICH CAME OUT OF THE VERIFICATION FAILING.** A container run
reported `registration: false` while a populated `ips-2.43.35` cache sat right
beside it — and the reason nobody would ever know is one line, in two files:

`navigator.serviceWorker.register("./sw.js").catch(() => {});`

**An empty catch.** If registration fails — a bad MIME type, a scope refusal, a
transient network error on that one request, an exception during install — the
app is silently not offline-capable, the update strip can never appear because
there is nothing to wait on, and NOTHING anywhere says so. The ⓘ report's
"Offline worker" line reads from the registration, so it reports the symptom
without the cause, and there is no cause to read because it was thrown away.

**This is not yet explained and is not yet fixed.** The container behaviour may
be an artefact of the harness rather than the product — a fresh browser profile,
a plain static server, a `load` event that may already have fired before the
listener attached. What is certain regardless is that the failure would be
invisible on a real device too, and that is worth fixing whether or not it is
what happened here.

## 2026-09-13 — the memory hypothesis is not supported by any measurement, and the original failure is unexplained

**BOTH IPADS: `still available with 1000 MB held · 6 frames OK`.** Six
frame-sized half-float textures is **about a gigabyte of texture**, on top of a
gigabyte of ordinary memory, with a full-frame drawing surface still available
afterwards. Six is the loop's CAP, so the honest reading is "at least six" — the
ladder has never found a ceiling on any device, in either kind of memory.

**The editor needs ONE frame.** So nothing measured supports the explanation
that has been carried since the session broke: that a 167 MB texture and an
84 MB drawing surface exhausted the device. That was a plausible story told
immediately after a failure, and three rounds of instrument-building have failed
to produce a single number that backs it.

**WHAT IS ACTUALLY KNOWN about the failure, stripped of the story:** a NEF that
had opened would not decode when switched to, raising the app's own decode
error; and afterwards a fresh session drew nothing, which is a lost WebGL
context and is now handled. That is the whole evidence. Everything else — which
allocation failed, whether anything ran out at all — was inferred from the shape
of the change that had just landed, which is the least reliable kind of
inference and the easiest to mistake for diagnosis.

**SO THE NEXT STEP IS NOT ANOTHER PROBE.** Three of them have been built and
each measured something true and irrelevant. What is missing is the failure's
own words: the decode error is shown in an `alert()` and then gone, so the one
artefact that would identify it survives nowhere. The ⓘ report now keeps the
last open failure — what it was, which file, and whether the full-resolution
rebuild was running at the time — so the NEXT occurrence is diagnosable from the
device instead of reconstructed from a guess.

**The full-resolution view stays off regardless.** Not because memory was proven
to be the cause — it was not — but because a real session broke with it on and
nothing since has explained why.

## 2026-09-13 — three caches is correct, and the desktop report is the update bug in the wild

**`caches: ips-examples-v1, ips-2.43.27, ips-2.43.36` IS NOT A LEAK.** Activate
deletes every cache but its own and EXAMPLES, and it does. While an update
waits, two app caches are legitimately present: the ACTIVE worker's, and the
WAITING worker's — filled at install, before activation, deliberately, so that
taking the update works offline the moment it is taken. Written down because a
future session will see two version-stamped caches and try to fix it.

**AND THE SAME LINE IS THE REPORTED BUG, CAUGHT IN THE WILD.** The page says it
is **v2.43.36**. The worker actually controlling it is **2.43.27**. The update
waiting is **2.43.36** — the version already on screen. That is exactly the
sequence described: navigations are network-first, so a reload delivers the new
page immediately while the worker lags, and then the new worker parks and gets
announced as an update to what the reader is already running.

**SO THE DIAGNOSTIC LINE GOT THE SAME FIX AS THE STRIP, for the same reason.**
It reported the EXISTENCE of a waiting worker as "an update is WAITING". It now
asks the worker its version and says which case it is: a genuine update with its
version number, or *"a worker is waiting, but it is this same version — the
offline copy catching up, nothing to take"*. It also names the version of the
worker actually serving the page when that differs from the page's own, because
those two being different is the entire explanation and it was nowhere on the
report.

**The pattern worth keeping:** a state that is TRUE and a state that MATTERS are
different, and a diagnostic that reports the first as though it were the second
sends its reader after the wrong thing. It cost a round of questions here, from
the one person the report exists for.

## 2026-09-13 — the wordiness, measured before being cut

**8,963 WORDS OF READER-FACING TEXT IN `ir.html`.** Measured rather than
estimated, and the distribution is the whole story:

- **Help: 4,368 words** — seventeen sections in one continuous dialog with no
  way in. Half the app's text in one scroll.
- the editing panel: 2,510 across twelve tabs;
- the lens dialog 501, the welcome 266, the ⓘ 217.

**HELP WAS THE REAL PROBLEM AND THE FIX IS SHAPE, NOT LENGTH.** The words were
mostly earning their place — somebody hitting a hanging Files picker needs all
430 of those — but stacked with no navigation, every reader paid for every
section to reach the one they wanted. Each section now folds, Quick start is
open, and a filter narrows as you type: "picker" gives three sections, already
open, with a count announced. **491 words on arrival instead of 4,368**, and
nothing deleted.

**AND I OVERSTATED THE PANEL, WHICH IS WORTH RECORDING BECAUSE THE NUMBER WAS
TRUE.** "1,540 words of explanatory notes in the editing panel" is correct as a
total and misleading as a description: only one tab renders at a time, so what a
reader actually faces is about **four notes and a hundred words** beside
nineteen controls. A real total reported as though it were an on-screen quantity
is the same error as a limit measured in isolation reported as a limit under
load — the third time today.

The explanations toggle stays, because it is reversible, remembered, and on by
default for a first visit. But its honest measured gain is **one more control on
screen**, not the decluttering the total implied.

**What the panel notes are NOT is a problem of writing.** At roughly a hundred
words per tab, beside the controls they explain, they are a reasonable teaching
surface. The next place to look, if this continues, is the lens dialog and the
welcome — not more trimming of the panel.

## 2026-09-13 — the "waiting worker with no cache" was the report's own race

**THE CONTRADICTION, AND IT WAS FLAGGED AS POSSIBLY SERIOUS.** A desktop report
named a waiting **v2.43.39** beside caches holding only **v2.43.38**. If a worker
could reach "waiting" without its cache, taking that update would leave a broken
offline copy — a real defect, and worth chasing rather than shrugging at.

**IT CANNOT HAPPEN, AND THE CODE SAYS SO.** Install opens the cache and
`addAll`s the whole precache list — all-or-nothing, so a single failed fetch
aborts the install and the worker never reaches "installed" at all, with the old
one still serving. A waiting worker therefore always has its cache. The built
`sw.js` carries 213 precache entries, so the other candidate — an empty PRECACHE
letting install succeed while creating no cache — is out too.

**WHAT ACTUALLY HAPPENED IS THAT THE REPORT ASKED ITS QUESTIONS IN THE WRONG
ORDER.** `swLine` read `caches.keys()` FIRST and questioned the workers
afterwards. A worker that finished installing in that gap appears as waiting,
beside a cache list captured moments earlier that cannot know about it. The list
was older than the answer printed next to it.

**A diagnostic that gathers two facts at different moments and prints them as
one moment invents contradictions for its reader to chase** — and this one
invented a plausible, alarming, entirely fictional defect. The cache list is read
LAST now, after every worker has been questioned.

Third variant of one error today: a number true in isolation reported as a number
under load; a total across twelve tabs reported as an on-screen quantity; and now
two moments reported as one. Each time the individual facts were correct.

## 2026-09-13 — forced-colors: one state in five was genuinely invisible, and it was the session strip

**THE ROADMAP ITEM SAID "active/selected states are bg-fill-only and vanish".**
Measured under Chromium's forced-colors emulation, with the new block disabled,
across five state pairs:

- editor tabs — `[weight]`, already distinguishable;
- crop ratio chips — `[bg, weight]`, fine;
- mix chips — `[bg, weight]`, fine;
- top-bar toggles — `[bg, weight]`, fine;
- **session strip — `[NOTHING]`.**

So the premise was true of ONE of five. Four already carried `font-weight: 700`
alongside the fill, which survives forced colours; the audit generalised from a
pattern that mostly was not there. **And the one that was broken is the worst
one to lose** — the session strip is how a reader knows which photograph they
are editing, and in forced colours it told them nothing at all.

With the block in place the strip differs by `[outline, weight, border, color]`.

**THE FIRST VERSION OF THIS TEST HAD NO TEETH AND PASSED ANYWAY.** It checked a
single element — a tab — and passed with the fix disabled, because that tab was
one of the four that never needed fixing. One element is a test set (Doctrine
§14), and the useful output here was never "pass" but WHICH ONES, which only a
per-element sweep can say.

Worth keeping about the shape: the fix is right, the item's reasoning was not,
and both facts matter. Shipping it while believing "every state was broken"
would have left the next session with a false model of the stylesheet.

## The macro stacker, measured on a real burst for the first time, 2026-09-13

The owner supplied a focus-shift set — a shared folder of NEF+JPG pairs,
NOA_3538…3584, Nikon Z50_2. Thirteen consecutive JPEGs at **5568×3712** were run
through Macro Studio end to end, which had never been done with real frames:
every earlier check used synthetic or single images, and the manifest screenshot
of the app shows an empty start panel because nothing here could be fed to it.

**It works.** Preview stack (2048 long edge): **8.8–9.0s** for 13 frames. Full
resolution, tiled, in the export worker: **5568×3712 in 34s**, peak **102 MB**
JS heap. Both in headless Chromium on a software rasteriser, so a real device
with a GPU is the floor, not the ceiling. The result is sharp front to back
across the flower heads with the background dissolved smooth — no selection rim,
no per-frame bloom contour, which are the two things that go wrong first.

**AND THE FIRST VERDICT WAS THE INSTRUMENT, AGAIN.** A focus check over a 4×4
grid reported the stack softer than the best single frame in **15 of 16
regions** — against a stack that is visibly correct. Fourteen of those cells are
background, and the stacker averages the out-of-focus background to a stable
mean ON PURPOSE (`sumR/sumG/sumB` in `stack.ts`). Averaging removes grain; a
Laplacian focus measure counts grain as detail. The one cell containing the
subject read **1.44×** the best single frame, which is the only cell the claim
was ever about. A measure applied where the behaviour is deliberately the
opposite will report the design as a defect every time, at full confidence.

**Two walk faults worth not repeating.** The first walk loaded the frames and
polled for a result without ever pressing **Stack**, so both sides waited for
the other; the second waited on `#result.src` when `#result` is a `<canvas>`,
which has no `src` and never would have finished. A walk that can never
terminate looks exactly like a slow one.

**What it found in the product:** the on-screen stack is a 2048-long-edge
preview and the app said nothing about it. The reader sees a finished-looking
picture, pinches in, finds it soft, and the only honest thing on screen was the
Export button's own label. The status line now names both sizes.

**STILL THE OWNER'S CALL, not a session's:** whether any of these frames ship
as a bundled macro practice set (the IR side has 44 practice DNGs and the macro
side has none, which is why its manifest screenshot shows an empty panel), and
whether a stacked result may be used as that screenshot. Both publish the
owner's own photographs in a public repo under their name.


## The deciding keys could not be reached at all, 2026-09-14

P, X, U and C landed in the quick look on 2026-09-12 and were correct from the
first line: the handler reads the right keys, marks the right item and paints
the right cell. They were also unreachable. The listener is on `#qlGrid`, so it
hears a key only when the focus is INSIDE the grid — and `openQuickLook` calls
`showModal()` before a single tile exists, which leaves the browser to put the
focus on the first focusable thing in the dialog: `#qlClose`, a SIBLING of the
grid. Every tile is born `tabIndex -1`, and the one function that promotes one
of them, `focusQuickCursor`, had no caller at open. So the keys did nothing
until a tile was clicked — and clicking a tile is itself the pick. They could
only ever repeat a decision already made by hand.

`quickCursor` was never reset at open either, so a second folder in one sitting
began with the cursor pointing into the folder before it; past the end of a
shorter set the handler reads `undefined` and does nothing at all.

THREE MOVES, no new machinery. Reset the cursor beside `quickItems = []`. Put
the cursor and the focus on the first tile that has a picture in it — only the
first, because after that the reader owns where the focus is and a set still
filling in must never pull it back, and because a placeholder tile for a file
that would not decode is disabled and cannot hold focus. Return the focus to the
grid when the compare dialog closes. That last one matters on its own: a native
dialog restores the focus to whatever had it before `showModal`, which for the C
key is the tile it was pressed from (right), and for the "Compare two" BUTTON is
that button — outside the grid, where the keys do not reach. One listener on the
dialog's `close` covers every route including Escape, guarded by a flag so it
does not move the focus into a grid that is being torn down.

**A DIALOG'S `open` ATTRIBUTE IS GONE ONE TASK BEFORE ITS `close` EVENT FIRES.**
`close()` drops the attribute and restores the focus synchronously, then QUEUES
the event. The walk polled for the attribute and pressed a key immediately, so
it was reading the moment before any close handler had run — and reported a
correct build as broken, twice, deterministically, while an otherwise identical
probe passed. What separated them was a single `evaluate` round trip: the probe
happened to give the queued task time to run. The fix belongs in the harness —
yield one frame and one task after the attribute clears, which is the boundary
itself rather than a guess at a duration. No reader can press a key inside that
window.

`tools/quicklook-keys-walk.mjs` is COMMITTED rather than left in a scratchpad,
for the reason `class-width-walk.mjs` gives in its own header. It presses keys
with no prior click, which is the only way to tell the two states apart, and it
never calls `.focus()` itself — doing that would put the focus exactly where the
defect prevents it from going, and the walk would pass against the broken build.
Verified failing on the build before the fix (four of five checks; the fifth was
an end-state assertion that a broken build satisfies for the wrong reason, and
was rewritten as a transition so it cannot). Verified failing again, five of
five, on a plant that removes both focus calls. THE FIRST PLANT DID NOT COMPILE
— an unused-variable error — which is the trap that makes a negative control
pass against correct code; it was rewritten to build before it was trusted.

Also measured, both themes, in the scratchpad a11y walk: the roving tabindex has
exactly one stop after open, the focus is inside the grid, the grid's aria-label
still names the keys, the focus comes back after compare, and axe reports no
serious or critical violations in the quick look. The tab-stop check was forced
to fail once in-process before it was trusted.


## Nothing could say where the five seconds went, 2026-09-14

A 170-photo session on a twelve-core desktop takes five to seven seconds to move
between photos. The test page's own numbers from that device add up to about
1.3 s: a raw decodes in 69 ms, a tile builds in 22 ms, a full-resolution frame in
about a second, upload and draw in 20. Four to five seconds a switch were
unaccounted for, and nothing in the app could say whose they were.

WHAT WAS ALREADY BEING MEASURED AND COULD NOT BE SEEN. `showDecoded` has timed
its five phases — hot spot, upload, zoom, glow, local — since it was written, and
pushed them onto `window.__show`, which nothing in the app, the tools or the test
page has ever read. The numbers existed; they could not be got at from the device
that produced them. They now feed the report and the window global is gone.

THE PARTS HAVE TO BE DISJOINT OR THE SUM MEANS NOTHING. A `PerformanceObserver`
over the whole switch reports `showDecoded`'s own synchronous work as a long
task — so "held by other work" would count it a second time, and the parts would
no longer add up to the whole while every number in them looked plausible. It is
therefore counted ONLY where it overlaps an await window: storage, and the
decode. The report now says how much of the WAIT the main thread was busy with
something else, which is the question that matters (the background thumbnail
pass builds every picture with a per-pixel loop on this thread).

The other half of that: long tasks are reported from 50 ms up, so the number is a
floor. And where the browser has no long-task support at all the report says so
rather than printing 0 ms, which would be a different claim.

MEASURED THE INSTRUMENT BEFORE TRUSTING IT. On a six-photo practice set the parts
came to 526 ms against a whole of 527 (0.2% apart), `showDecoded`'s own five came
to 70 against 71 (1.4%), and the reported whole fitted inside the 541 ms the
harness measured from outside the call. Then a 400 ms AWAITED delay was planted
in `Session.getBytes`: the reading bucket moved and the decode and showing
buckets did not. An awaited delay rather than a busy loop on purpose — a busy
loop is itself a long task, and would have moved two buckets on a correct build.

TWO HARNESS FAULTS, both of which reported a correct build as broken. A tile is
DISABLED while its photo is still being written, and a disabled button's
`click()` does nothing at all, so the first run waited for a switch that had
never been asked for. And the report is COLUMN-ALIGNED, not `key: value`, so the
line matcher found nothing on a build that was printing the line perfectly. Both
were the instrument; neither was the app.

WHAT THE FIRST NUMBERS SAY, on a container, which is not the device that matters:
reading 340 stored pieces took 163–267 ms, the decode waited 0 ms and ran 114–254
ms on a worker, showing took 71–99 ms, and settling — `activateCurrent`, which is
`establishFreshEdit` plus the stored edit — took about 165 ms, which is the
single largest part on a small set. The strip reconcile was 2 ms on six photos
and is the one to re-read on a long one, because it runs on every thumbnail that
lands and forces two layouts each time.

**AND THE SESSION'S SIZE IS NOT WHERE THE TIME GOES, on this machine at least.**
A new test-page measurement builds a throwaway store of 144,500 rows — 170
photos' worth of 850 pieces each — and asks for one photo's pieces out of it
against the same query on an empty store: 9.2 ms against 6.8 ms. The rows are 64
bytes rather than the real 30 KB on purpose, which isolates the cost of FINDING
the pieces from the cost of moving them; writing a real 4 GB session is not a
thing to do to somebody's device and would have measured the other question.
Whatever makes a long session slow, it is not the key range. The probe has its
own button because building the store takes a minute, it asserts the row count
that came back (a range that matched nothing returns instantly and would read as
the fastest result in the table — proved by planting a short range), and it
deletes both databases before it returns.

THAT LAST PART WAS WRONG FIRST TIME AND IS WORTH KEEPING. `deleteDatabase` is
BLOCKED by an open connection: it fires `onblocked` and the database stays on the
device. The failure path left both test databases behind, because the connections
were only closed on the success path. They are closed in a `finally` now, before
the delete.

`public/conveyor-status.html` is the live status page for this run of work
(Doctrine §7i). It is in `public/`, so it deploys with the app and is precached
by the service worker, and it is checked at 400 px and 1280 px in both themes
with axe clean. Every stage's state is a WORD before it is a colour or a weight.


## A look you press once a set, remembered, 2026-09-14

Every photo opening ungraded is right for somebody meeting the app; it is not
right for somebody who puts the same grade on everything they shoot, and that
reader was pressing the same button once per set, forever. `ips-default-look` is
that press, kept.

IT IS NOT AN EDIT FIELD AND DOES NOT RIDE A SAVED LOOK, so the five-places rule
does not apply to it. It seeds `sessionLook` at boot, and from there it is the
exact path a pressed look already takes: `establishFreshEdit` reads `sessionLook`
into `activeLook`, applies it, and then clears the undo stack and takes the Reset
baseline — so the automatic lands on a VISIBLE control (the look button reads as
pressed, and `updateLookUI` runs), costs no undo step, survives Reset, and leaves
Hold: Untouched showing the bare decode. Those are the three tests Doctrine §14
sets, and a default look passes all three without any new machinery.

THE RE-SEED GOES IN `resetSessionState`, NOT IN `endSession`. Four paths tear a
session down — the Done button, opening a single file, opening a folder over an
existing session, and the gallery — and only one of them is Done. An earlier
draft of this put it in `endSession`, where a reader who pressed a look and then
opened a new folder without pressing Done would have kept the pressed look
instead of returning to their default. Check 8 of the walk is that exact seam,
and it goes through the app's own "Start a new session" dialog.

AND ONLY WHEN A DEFAULT IS SET. With no preference the re-seed does nothing, so
the behaviour the app has always had — press a look on one set and the next set
still wears it — is untouched. That is check 11, and it fails if the re-seed is
made unconditional.

A SAVED SLOT CANNOT BE A DEFAULT and the picker does not offer one:
`applySavedLook` sets `activeLook = null`, so there is nothing for `sessionLook`
to hold. The batch dialog now lists the default first and says which it is; it
has no selection state to preselect, so being first and named is the whole of
what it can honestly do.

THE WALK ASSERTS THE BUTTON AND THE PICTURE, per the rule this file already
carries. The canvas is created with `preserveDrawingBuffer`, so the frame can be
read straight back and averaged. **Check 10 passed against the pre-stage build
for the wrong reason** until it was pinned: it compared a default-look frame
against a no-default frame taken AFTER a look had been pressed by hand, and on a
build with no default at all those two still differ. Pinned to the as-opened
frame from check 1, it fails on the old build and passes on the new one. Six of
eleven checks fail before the change.

TWO HARNESS FAULTS, both about where controls live. The look buttons are inside
the IR tab, so they cannot be clicked until that tab is showing — though which
look is ACTIVE reads correctly either way, because the class is on the button
whether its panel is showing or not. And opening files over a session of two or
more asks first, in the app's own `<dialog>` rather than a browser confirm, so
nothing auto-answers it.

Measured in both themes at 430 px and 1280 px: one labelled radiogroup, eight
real radio buttons, every one clearing 44 px, the chosen one saying "your
default" in words as well as in colour, and axe clean in Settings.


## The decision the session could not record, 2026-09-14

The quick look can pick and reject; the session, which is where the deciding
actually happens, could not. A reader looking at each photo at fit size above the
strip and deciding there had nowhere to put the answer, and the quick look's own
picks were thrown away on the way in — pick four out of forty, press Keep, and
arrive at a session where nothing is picked.

`PhotoMeta.mark` is `"pick" | "reject"` or absent, written by `Session.setMark`,
which is `setThumb`'s shape: read the row, put it back whole, one
strict-durability transaction. Absent on every row written before this existed,
which reads as undecided, which is what those photos are. A verdict that does
not survive a reload is a highlight, not a decision.

**THE MARK IS AN INPUT TO THE STRIP RECONCILE, never painted beside it.**
`updateSessionStrip` rewrites every tile's whole class string and removes any tag
it did not put there, and it runs on every switch, every add and every thumbnail
that lands. Anything drawn onto a tile from outside survives until the next arrow
press and then vanishes. So the per-tile paint was lifted out into
`paintSessionTile`, the verdict joins the class string it builds, and the word
tag has its own class so the "preview" block cannot take it off — a tile can
honestly be wearing both at once. Marking repaints ONE tile by its id, through
that same function, so the fast path cannot produce DOM the reconcile would
undo. The counts ride in `#sessionMeta`, which is the `role=status` the reconcile
rewrites unconditionally; announcing them anywhere else would have lasted one
press.

THE QUICK LOOK'S VERDICT TRAVELS IN THE ROW THE PHOTO IS WRITTEN WITH, not
written over it afterwards. A `setMark` fired after `Session.addPhoto` looks for
a row the strict write has not committed yet, finds nothing, and silently does
nothing — `setThumb` has the same shape and the same silence. So the hand-over
map changed from `Map<File, ArrayBuffer>` to a small object carrying the picture
AND the verdict, in all four places it is typed, and an entry is now made for
every kept photo rather than only those whose strip picture had been built.

A MARK IS NOT AN EDIT. Not in `EditParams`, not in the undo stack, not in
`LiveEdit`, so the five-places rule does not apply and Undo leaves it alone. U is
its only way off, as in the grid. Pressing the same verdict again takes it off,
also as in the grid: one vocabulary for one decision, in both places it can be
made.

REACHABLE BY FINGER, not only by key. These apps are used on a tablet, and a
decision that can only be made by pressing P is one most readers cannot make at
all. Two real buttons in the session head, 44 px, labelled in words, pressed
state carried by border, weight AND a tick. **They cost nothing in chrome**: the
strip measured 140 px at 430 px wide and 140 px at 900 px, before and after, and
the head does not wrap at either. That is the measurement §7e asks for, and it is
the one that has gone the other way before.

The keys sit on the document under the arrow handler's exact guard set — no
modifier, no open dialog, not while the crop tools are armed, not from inside an
input, only from the photo or the strip, only with two real photos or more.

FOUR HARNESS FAULTS, every one of them the instrument. A programmatic click does
not move the focus, so after touching a slider the focus was still in that slider
and the app correctly refused the keys — the walk now blurs first, which is the
state a reader is in after tapping the photograph. The exposure slider is `expo`,
not `exposure`. The resume button is `resumeSession`, not `resumeBtn`. And check
13 read "every verdict button clears 44 px", which is TRUE of a build with no
verdict buttons at all — it counts them now. Twelve of fifteen checks fail
against the build before this change; the three that pass are the
no-regression ones.

Measured in both themes: real buttons labelled in words, the one you are on
reading as pressed, the verdict as a WORD on the tile, a rejected tile differing
by line style as well as dimming, the counts announced through a live region that
already existed, and axe clean over the strip.


## A decision the app can act on, 2026-09-14

"Finished with this one" is a fact the app can use: the working state of a photo
the reader will not edit again is memory held for nobody. Every photo visited in
a session kept its full live edit — snapshot, baseline, settled state, both undo
stacks — for the life of the session, and nothing ever evicted one.

WHAT IS RELEASED, AND WHEN. On leaving a photo that carries a verdict,
`switchToPhoto` drops its `liveEdits` entry — but only after the durable copy it
will be rebuilt from has really landed. `captureActiveEdit` returns its
`Session.setEdit` promise now instead of dropping it; every other caller still
ignores it, which is the old behaviour exactly.

IN `then`, NEVER `finally`. A refused write means the saved copy is not there and
the live one is all there is. Proved by planting a `setEdit` that throws: nothing
is released and the count says so.

**AND THE ATTACH POINT WAS WRONG FIRST TIME, in a way that is worth keeping.**
The handler was attached beside the capture, guarded by "only if we have actually
moved on" — and the durable write is a few kilobytes that settles long before the
photo being opened has been read and decoded, so the guard saw the photo we were
leaving still active and refused every release there was. Nothing was ever let
go of; the instrument from the morning said so immediately, which is the whole
reason it was built first. Attached after the switch lands, the guard means what
it says.

WHAT CANNOT BE RELEASED. `editToJson` drops brush masks, an imported LUT and a
warp before storing, so a photo carrying any of the three cannot be rebuilt from
its saved copy — its entry stays, and the strip says which and why rather than
leaving the reader to notice the count did not move. The look has to match too:
coming back runs `establishFreshEdit` first, which takes the Reset baseline under
the session's look AS IT IS THEN, so a photo whose grade came from somewhere else
would come back with a Reset target it never had. Keeping those is the honest
answer; a Reset that silently moves is not.

**A PHANTOM UNDO STEP, pre-existing, found by this work and fixed here.**
Restoring a stored edit runs `establishFreshEdit` (which settles on the bare
open) and then lays the stored edit over it — after which the capture flushes,
sees the two differ, and pushes an undo step whose target is a state the reader
has never seen. Every resumed session did this; it only became visible when a
decided photo started coming back the same way. The arrival state is now settled
explicitly, so there is no step to take back. `baseline` is deliberately NOT
moved: Reset still returns to how the photo opens.

MEASURED ON A SIX-PHOTO PRACTICE SET: walking all six and deciding on each leaves
two photos holding working state instead of six. An undecided photo is held
exactly as before. The number that matters is from a 170-photo session on the
device it is slow on, and the report carries it.

FOUR HARNESS FAULTS AGAIN, all of them the instrument. The expected count was
written as one when two is right — the photo you are standing on is held by
definition. The tooltip check read the tile of the photo the reader is ON, which
is held and must not claim otherwise. And P was pressed on a photo the walk had
already picked, which TOOK THE PICK OFF and left the check measuring an undecided
photo; it ensures the verdict now instead of toggling it. Five of nine checks
fail against the build before this change.


## Export stops owning the screen, 2026-09-14

Exporting a keeper put a modal dialog over the whole app for the length of the
run, which on a 5-megapixel frame is six seconds parallel and fifteen on one
thread. Export-as-you-go was the thing that made the reader stop exporting as
they went.

THE EXPORT ITSELF IS UNCHANGED — same `exportImage`, same options, same decision
about threads, and proven to be the same bytes. What changed is the container:
the busy dialog is gone from this path, replaced by a line that floats over the
photo. `#busy` stays for Batch, session end and resume.

IT WAS ALREADY TWO PRESSES on every platform. Rendering finished, the dialog
wrote "Ready — name · size" and waited for Save, because saving has to happen
inside a gesture or the share sheet will not open. The only thing the modal
added was that nothing else could be done in between. The patch note says that,
rather than claiming a second press as new.

EVERYTHING THE EXPORT READS IS READ AT THE PRESS: a copy of the parameters (one
object, mutated in place by every slider), the options, the rotation and flip,
the look recipe, the lens curve, and the file. For a mosaiced raw the decoded
frame is narrowed to its dimensions, exactly as the parallel export already
narrows it for its workers, so a NEF or DNG export does not keep ~84 MB of
half-resolution float alive beside the next photo's own.

**THE LINE CANNOT LIVE IN THE EXPORT TAB, and the first version did.** The whole
point is that the reader carries on working, and carrying on working means
changing panel tabs — which put the progress AND the finished file behind a tab
nobody had a reason to go back to. It was the walk that found it: the harness
switched to Basic to drag a slider and then could not reach Save. It is a HUD
over the photo now, on glass tokens like the mode banners beside it, and it is
asserted to still be there after a tab change.

**AND THE LABEL LIED ABOUT THREADS.** "On one thread" was printed by asking
`canRunParallel` with the half-size preview's pixel count, because the real
output size is the export's own arithmetic. The app's own report then said that
export ran on THREE. The claim is now made only from what is knowable at the
press — healed spots, stickers, a warp, or TIFF, which are the reasons a keeper
actually runs single-threaded — and it was checked against the profile.

THE OUTPUT GATE, and what it took to make it mean anything:

- Against the build before this change, through the old modal flow: the same
  file, byte for byte, sha256 `602e2db1…`.
- On the new build, while the reader switches photo, turns it 90°, presses a
  different look and drags the exposure slider mid-run — measured at 30% through
  a fifteen-second export: the same file again.
- **A PARALLEL EXPORT CANNOT PROVE THIS.** Each worker gets a structured COPY of
  the edit, so a mid-run mutation cannot reach it and a plant that relies on one
  shows nothing. Two plants ran green against correct code for exactly that
  reason before it was noticed. The gate now heals a spot first, which is what
  makes the parallel path refuse the job, and runs the plants on one thread.
- **And the interference has to touch something the export reads LATE.**
  Everything else is folded in before the per-pixel pass starts. `params.glow`
  is read per pixel through a closure, and its map is only built when glow is
  already on — so glow is turned on before the press and off during the run.
- With the copy replaced by the live object, on one thread, with that
  interference: a different file, `def15292…` against `2733a5f6…`. The copy is
  load-bearing and now proven to be.

A FAILED EXPORT explains itself on the line, offers Try again, leaves the Export
button usable, and is remembered in the report — no export path called
`recordFailure` before this; failures were an `alert` that is gone the moment it
is dismissed.

Still broken and said so in the patch note: a photo carrying healed spots,
stickers or a warp runs its per-pixel pass on the main thread with 16-row
yields, so the sliders stutter while it goes. Measured here: 15.1s for 5.2 MP,
4.9s of that paused over 117 yields.

NEEDS THE OWNER'S HANDS, not verifiable here: the Save tap on an iPad opening
the share sheet with no render between the tap and the sheet, and what the
memory looks like beside three or four decode lanes on that device.


## Exports that wait for you, 2026-09-14

Exporting as you go means a share-sheet tap per photo, which is what stops people
doing it. Finished exports are kept now and handed over in one press.

ITS OWN DATABASE, and that is the whole design. `batchstore` already had exactly
the right shape — small rows, one strict transaction per file, survives a crash —
so the database NAME is a parameter now and `frameStore(name)` binds a set of
functions to one. The module's own exports stay bound to the batch store, so
nothing that already called them changed at all. Sharing the store was the
alternative and it is a trap: saving a batch clears the frames it bundled, and
doing that to a morning's keepers because they happened to live in the same
place is a button whose output no longer matches its label.

NAMES ARE MADE UNIQUE AGAINST WHAT IS STORED, not against the session. The meta
store's key is the name and it is an `add`, which aborts the WHOLE transaction on
a duplicate — so exporting the same photo twice, or exporting today a photo
exported yesterday and not yet saved, would have thrown the finished bytes away.
`runBatch` already seeds its `taken` set from the store for this reason; this
does the same.

EVERY EXPORT, not only the picked ones. A verdict and having exported something
are separate facts, and collecting only picks would quietly lose the others.

**TWO BUTTONS FOR ONE FILE, found by the walk.** After a single export the line
offered "Save image" AND "Save the 1 export", which are the same file by two
names, above a count that described it twice. Save-all now appears only once
there is something waiting BESIDES the file on offer, and the count line with it.
Dismiss puts the line away and keeps the file — dismissing a status line is not a
decision to throw away something you made.

WHAT THE WALK ASSERTS: the file is in the store rather than merely claimed on a
line; two exports are kept whether picked or not; they are in `ips-exports` and
the batch store is empty; a reload still offers them, in their own words rather
than as "an interrupted batch"; two hand over as one zip whose header really is a
zip holding two entries; saving clears the collection; one hands over as the
image and never as a zip of one; the same photo exported twice is kept twice
under different names; and clearing the batch store leaves the exports alone.
Three of twelve fail against the build before this change, and the rest cannot
run at all there.

AND THE HARNESS WAS WRONG TWICE MORE. A reload leaves the START SCREEN — the
session is offered, not resumed — so there was no panel to press Export in; and
after the single-file rule changed, the check that clicked Save-all had to go
through Dismiss, which is the only state where a collection of one exists.


## Six defects the device found in an hour, 2026-09-14

v2.45 reached a real Windows session and came back with six faults in one sitting.
Every one of them had a walk that was green.

**THE PANEL COUNTED ONE FILE AS TWO.** `clearExportStrip` passed the sentence
"N exported, not yet saved" into `showExportStrip`, which appends its own copy of
that sentence whenever something is waiting — so the panel printed it twice and
a reader counted two files. The sentence has one home now and no caller may pass
it in. **A sentence written in two places will be printed twice.**

**DISMISS DID NOT DISMISS.** It hid the line and then immediately showed it again
whenever anything was collected, which is not something a button called Dismiss
can do. It hides, and keeps the files — dismissing a status line is not a decision
to throw away something you made. The way back moved to a row at the top of the
Export panel, which is the one surface that does not go away when a floating line
is dismissed: the line over the photograph is the push, the row is the pull.

**SAVING A FILE HANDED IT BACK A SECOND TIME.** After a successful save the
handler re-counted the store instead of taking the file out of it, so the panel
went on offering a file already on the disk and pressing Save wrote a second copy
beside the first. The code's own comment said removing one file "is not something
the store does" — which is a reason to give the store that, not a reason to leave
the file in. `removeFrame` deletes the meta row and the frame's chunk range in one
transaction, and the stored name travels on the pending export because a second
export of the same photo is stored under a different one.

**THE PRESSED VERDICT BUTTON READ AS THE ONE THAT WAS OFF.** It filled with the
accent at 12–15%, which composites to a mid-grey: measured, the pressed button was
rgb(30,34,42) against an unpressed rgb(65,65,65) in the dark theme — DARKER than
its neighbour — and rgb(68,70,73) against cream in the light one. It fills with
the accent now, in both.

**AND A PICKED TILE LOOKED LIKE THE PHOTO BEING VIEWED.** Both wore
`border-color: var(--accent)`, so a strip with several picks in it had several
tiles that read as active, and in grayscale they were the same tile — the failure
the standing rule exists to stop, shipped by the change that added the second
state. The verdict's carriers are its word and its filled badge; the border
belongs to "which one am I on", and that tile now also carries an offset ring,
which is a SHAPE no other state has.

**MOVING BETWEEN PHOTOS GOT SLOWER, and the standing look is why.** `carryLook`
ends with `restripForGrade()`, and `carryLook` returns early when no session look
is set — so before the default-look setting existed, a fresh import never
triggered it. With a default look, `sessionLook` is non-null from boot and it
fired on every photo of every import. `restripForGrade` marks every tile whose
grade stamp differs as `waiting` and restarts the whole thumbnail pass, and the
stamps taken during an import come from an editor that changes half way through
it — the first photo opens mid-import and moves the live grade under every tile
already in. So the whole strip was re-decoded while the reader was trying to move
through it. It now refuses to sweep while a set is still coming in.

**THE OTHER HALF OF THAT IS THE PRIORITY QUEUE, and this report is the evidence it
was waiting for.** It is slow specifically while the thumbnail pass runs, and the
quick look — which has the lanes to itself — is fine. `decodeOffThread` takes
`{front: true}` and unshifts; exactly three callers pass it, all of them a
photograph on its way to the screen: the switch, a resume's first open, and the
one photo shown while a set is being stored. A tile decode never does. This is the
priority queue `realThumbnails`' own comment calls the complete answer to its
one-lane-short workaround, which stays as the memory bound.

### Why the walks were green

They are worth writing down one at a time, because each is a different way to
measure nothing.

- The collection walk read the store count and the BUTTON LABEL, and never read
  the panel's own text. The doubled sentence was in the one place nothing looked.
- It never ran the sequence a reader runs: export, save, then look at what is
  still offered. It saved the collection or it saved one file, never one and then
  the other.
- **The colour check passed against the broken build twice, for two different
  reasons.** First it compared `getComputedStyle().backgroundColor`, which hands
  back the rgba AS DECLARED — a 15%-alpha accent looks like a bright colour there
  and nothing like what the reader sees. Composited over its ancestors it still
  passed, because the check asked whether the two buttons DIFFERED (167 apart in
  the light theme) rather than whether the pressed one was filled. A mid-grey
  differs from everything and reads as on nothing. The check now asserts the
  composited colour IS the accent, and fails on the old build in both themes.
- And resolving `--accent` with a digit regex turned `#9fc2f5` into `rgb(9,2,5)`.
  A token is a string until a browser parses it; set it on a probe and read it
  back.


## Acting on the picks, 2026-09-14

Picking shipped and nothing consumed it. A reader could mark a hundred photos and
then had no way to act on them: the export collection beside it holds exports
already run, one at a time, which is a different thing. The Export panel now says
how many are picked and exports them all in one press.

**THE FIRST IMPLEMENTATION WAS WRONG AND THE WALK CAUGHT IT.** It built each
photo's parameters through `batchParamsFor` — the function a batch uses, whose own
comment says it applies "the same automatics an open applies". It does not, quite:
a batch sets the channel swap from the look, while an open leaves the running
value, which defaults ON for a raw. Measured against the same photo opened and
exported by hand: **43 of 255 on the worst channel and 6 on the mean.** That is a
visibly different photograph, from two implementations of one idea.

**SO THERE IS ONE PATH NOW.** `openPhotoExportJob()` describes an export of the
photo that is open — file, frame, parameters, options, lens — and BOTH the Export
button and the picked export use it. The picked export OPENS each photo through
`switchToPhoto` (quietly, so a modal does not flash per photo) and then exports
what is open. It is not a parallel develop that has to be kept in step; it is the
reader pressing Export on each one, done for them. Byte-identical is then true by
construction, and the walk asserts it both ways: a photo edited and turned by hand,
and a photo picked in the quick look and never opened.

It is stoppable, keeps what is already stored when stopped, refuses to run while a
single export is going and vice versa, and puts the reader back on the photo they
were standing on — they pressed a button in a panel, they did not ask to be left
at the end of the run.

## A quarter-turn that stays turned, 2026-09-14

`showDecoded` sets the rotation from the file's own EXIF and the flip to zero on
every open, and neither was in the stored edit or in `LiveEdit`. So turning a
portrait frame, moving on and coming back put it back the way the camera wrote it
— and the picked export would have exported it that way too. Both now ride the
edit, restored after `showDecoded` has set the file's default. They are view state
and still ride no saved look and no batch, exactly like crop and straighten.
Asserted by the SHAPE of the frame on screen rather than by reading the renderer's
own variable, across a switch away and back, a Reset, and a reload.

## Straightening: what was actually coarse, 2026-09-14

The report was that it would not go finer than about a third of a degree. The
finder is not the reason: `findTilt` already fits a parabola to the Hough peak and
takes its vertex, and its own comment records 0.54° from the cell centre against
0.66° interpolated on a horizon drawn at 0.7°.

**THE SLIDER IS. Measured: 0.429° per pixel of drag, across 210 px.** Ninety
degrees of range on a HUD pill is a control for finding an angle, not for landing
on one, and a keyboard could always do tenths where a finger never could. There is
a −0.1° and a +0.1° button either side of it now, 44 px, hold to repeat after a
beat so a tap that lingers is still one tenth, and a whole hold is one undo step
like a drag of the slider.

The alignment grid went from sixths to twelfths while straightening, at a lower
alpha because twice the lines at the same weight is twice the ink over the
photograph. A horizon is levelled against the nearest line to it, so what helps is
having one close.

**AND THE GRID CHECK LIED TWICE before it worked.** It first read the declared
CSS looking for "12" — the browser had already resolved `calc(100% / 12)`, so it
found nothing and reported a grid that had changed as one that had not. Rewritten
to read the resolved period, it looked for pixels; the period comes back as
`8.33333%`. Counted from the percentage it reads twelve, both axes, both themes.
