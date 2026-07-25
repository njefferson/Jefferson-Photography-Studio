# CLAUDE.md — Jefferson-Photography-Studio

> **Inherits the [Universal App Doctrine](https://github.com/njefferson/noahjefferson/blob/main/DOCTRINE.md)**
> (canonical copy: `DOCTRINE.md` in the noahjefferson hub). Single source of truth
> for the rules shared across all of Noah's apps — product values, taste,
> accessibility, honesty, verification, release discipline & taxonomy, licensing
> (PolyForm Noncommercial), privacy, and the permanent **AskUserQuestion ban** (§0).
> **Where anything below overlaps the Doctrine, the Doctrine wins.** The rest of
> this file is repo-specific.
>
> **Repo metadata is a manual step — call it out and confirm** (Doctrine §10):
> GitHub description / website / topics / social-preview cannot be set by the
> session token. List the exact values, ask Noah to confirm each is done, and
> never report the repo "set up" while any is unconfirmed.

---

# Standing rules for Claude sessions on this repo

Auto-loaded into every session. **Read `NOTES.md` before doing anything** — it
is the source of truth: the "Next capability release" queue (top items first),
settled design decisions, and measured gotchas that must not be re-learned.

## Release flow (the owner's hard gate)
- `main` == production (jefferson-photo-studio.pages.dev, deployed on push).
- The `staging` branch deploys to staging.jefferson-photo-studio.pages.dev.
  Every product change goes: designated `claude/*` branch → push to `staging`
  → the owner's on-device pass → his explicit go → PR + merge to `main`.
  Never merge a product change to main without that go. Docs-only changes
  (NOTES.md, this file) may merge without the gate.
- Push to `staging` UNPROMPTED whenever work reaches a point the owner needs
  to test AND no other branch is already waiting for his go to `main` — don't
  make him ask; that's what staging is for (owner rule, 2026-07-13). Staging
  may be force-pushed: its history is disposable, but check first that every
  staging-only commit is already contained in `main` (`git cherry`).
- Parallel sessions happen. Before pushing anywhere, fetch and check what
  `main` and `staging` actually contain — a roadmap item may have shipped
  from another session mid-work (it happened 2026-07-13: two sessions built
  the same icon probe; one had already merged the full picker).
- Merge PRs with **rebase** — main's history is linear, and the in-app patch
  notes are the last 5 commits; a merge commit would show up in them.
- A branch whose PR merged must be restarted from `origin/main` (same name).
- The `public/sw.js` CACHE name stamps itself at build time from the app
  version (vite.config.ts precache plugin) — every deploy is a commit, so
  every deploy refreshes the cache automatically. NEVER hand-number it, never
  bump it, and never present it as a "version" to the owner — it isn't one
  (owner rule, 2026-07-18; ips-v1…v80 were the hand-numbered past). The only
  cache still versioned by hand is `EXAMPLES` in sw.js, and only if a practice
  RAW's bytes ever change under the same name.
- Versioning is **identity → capability → increment** (owner rule,
  2026-07-18): the major moves only on an owner-declared identity change
  (the Creative release ships as 2.0); the middle number bumps with EVERY
  capability release — edit the `VERSION` file in that release's own final
  commit, so the release commit reads as the new base; the automatic
  commit-count digit is for increments only (fixes/QoL — features are never
  increments). No git tags — the remote refuses tag pushes. Full detail in
  NOTES.md "## Versioning".

## Commit messages are the product
Commit subjects/bodies are the in-app patch notes, read by end users from the
ⓘ dialog. Write them for the END USER — what changed for them, not how.

## Accessibility is a top priority (owner mandate, 2026-07-17)
Color-blind-inconsiderate design is a FAIL STATE. Color must never be the only
carrier of meaning — pair every color cue with text, a glyph, position, or a
line-style/weight difference (the heal rings and quick-look badges are the
model). Design-step checklist for ANY new or changed UI — applied at design
time, not as an after-the-fact audit:
- meaning survives grayscale; page zoom is never locked (no maximum-scale /
  user-scalable=no — removed once already, don't reintroduce it);
- text ≥ 4.5:1 and control rails/edges ≥ 3:1 in BOTH themes — use the
  calibrated tokens (--txt-3, --line-2, --glass-*), never one-off colors;
  HUDs floating over the photo use --glass-bg/--glass-txt (theme-invariant);
- progress/state changes announce (aria-live regions present from parse),
  modals are real <dialog>, tappables are real <button> with labels on
  icon-only ones, targets ≥ 44px, prefers-reduced-motion honored.
Run the a11y-walk harness (scratchpad; axe-core + custom checks, both themes)
before any UI release, alongside the other walks. NOTES.md "## Accessibility
standing rule" holds the full audit record and the NEVER-CHURN list of
patterns already verified correct — do not "fix" those, do not regress them.

## INFRARED first — never reason from visible-light defaults (owner, 2026-07-25)
This app processes INFRARED and full-spectrum photography ONLY. Every
processing judgment starts from IR physics: red-channel flood, white balance
far beyond visible norms, daylight-only shooting, hotspots, false-color
pipelines. A frame that looks wrong by ordinary-photo intuition — "too dark",
"too red", an alien histogram — is IR-NORMAL until proven otherwise;
diagnose against IR references and the file's own metadata, never against
visible-light expectations. (A bright IR daytime frame was misdiagnosed as
"a twilight scene" from exactly this error; the real bug was a decode level.)

## Known things first — mine the references before implementing (owner, 2026-07-25)
Raw processing is a solved field; the owner is not the discovery mechanism
for lessons it learned twenty years ago. Before implementing ANY raw
behavior (levels, curves, matrices, highlight handling, metadata), find what
dcraw/LibRaw and the DNG spec do and what the FILE ITSELF carries — black
lives in NEF MakerNote 0x003D, white in the linearization curve, Adobe's
levels in DNG tags 50714/50717. Deviating from reference behavior requires a
written reason in NOTES. Every lesson in this file was paid for on-device;
do not buy any of them twice.

## What opens applies (owner ruling, 2026-07-25 rev. 2 — supersedes "nothing")
The blanket "nothing at open" was a stabilization measure, not the product.
The product: open applies an automatic, VISIBLE, UNDOABLE baseline of edit
parameters, per file type — RAW (NEF/DNG): gray-world WB + auto exposure +
measured denoise (owner-tuned 2026-07-12: barely clears the grain, nothing
more) + Recover-highlights 0.7 iff the frame has real clipping (calibrated;
industry-normal per LR-class default rendering). CAMERA-RENDERED (JPEG/HEIC/
PNG/previews): as the camera made them, measured denoise ONLY (lighter touch,
owner call 2026-07-25). Reset returns to this baseline; Hold: Untouched shows
the bare decode. What stays banned FOREVER (Doctrine §14): silent PIXEL
mutation — every automatic lands on a visible slider, is undoable, and the
untouched decode stays one press away. Never add an at-open automatic that
fails any of those three tests.

## Adding an EditParams field — FIVE places or undo silently breaks
cloneParams, applySnapshot, syncFromUI, syncToUI, AND the input-listener
array in main.ts. applySnapshot restores fields INDIVIDUALLY — a field
missing there is silently dropped by Undo/Reset (bit us on `recover`,
2026-07-25). Also decide explicitly whether the field rides SavedLook
(creative grade) or is per-shot corrective (excluded, like WB).

## Verify before claiming fixed
- Headless Chromium harness: `npm install --no-save esbuild playwright-core`;
  the browser binary is the `/opt/pw-browsers/chromium` symlink.
- Scratch harnesses live OUTSIDE the repo, in the session scratchpad.
- Playwright `waitForFunction` does NOT await Promise predicates — a Promise
  object is truthy, so such a poll "passes" instantly. Poll synchronous DOM
  state (progress text, banner text) instead.
- Make a new test FAIL once before trusting it.
- When a result looks absurd, suspect the instrument first.
- Walk the primary user journey from the start screen before any handoff.
- FULL-FRAME renders on EVERY verification round of any pixel-pipeline change
  — crops hid the orange sky (2026-07-25). Decode changes additionally sweep
  ALL 44 practice DNGs (harness pattern in NOTES).
- Doctrine §14 (debugging discipline) applies with full force here: two
  strikes on the frame, the guessing test, the owner is never the test bench,
  claims name their test.
- State plainly what was VERIFIED (headless, request inspection) versus what
  NEEDS THE OWNER'S HANDS on the real iPad (share sheet, pinch feel, install
  flows, Safari-only storage behavior — all measurements so far are Chromium).

## Working preferences
- Mobile-first: one step at a time; avoid desktop-required steps unless every
  alternative is exhausted. No drafts or pseudo-code — iterate privately,
  deliver finished work.
- NEVER use the pop-up question tool (AskUserQuestion) — the answers don't come
  back reliably on the target device, so it stalls the work. Ask any question
  as plain text in chat. This includes plan-mode clarifications — ask in chat,
  don't open a picker.
- Session repo access is fixed at session creation (source picker); it cannot
  be added mid-session.
- Taste: maximum saturation, gentle contrast, shadows alive; direct
  manipulation; modes announce themselves and offer an obvious exit; one
  gesture = one undo step; labels stay honest; every failure explains itself
  and offers a way forward. Product values: free, on-device, offline-first,
  no account, no install required.

## Icon pipeline
PNG touch icons are generated from the SVG via a headless-Chromium screenshot
(the `macro-icon-180.png` pipeline; generator scripts live in the session
scratchpad). Regenerate PNGs whenever the SVG changes (the cache stamp
refreshes itself on the deploy commit).
