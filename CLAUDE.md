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
- State plainly what was VERIFIED (headless, request inspection) versus what
  NEEDS THE OWNER'S HANDS on the real iPad (share sheet, pinch feel, install
  flows, Safari-only storage behavior — all measurements so far are Chromium).

## The owner
- iPad-first, often driving. One step at a time; no desktop-required steps
  unless every alternative is exhausted. No drafts or pseudo-code — iterate
  privately, deliver finished work.
- NEVER use the pop-up question tool (AskUserQuestion) — on his iPad the
  answers don't come back (the tool fails or the response is lost), so it just
  stalls the work (owner rule, 2026-07-19). Ask any question as plain text in
  chat and let him reply normally. This includes plan-mode clarifications —
  ask in chat, don't open a picker.
- Session repo access is fixed at session creation (source picker); it cannot
  be added from the iPad mid-session.
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
