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

## KNOW THE APP. NEVER GO AND "SEE" HOW IT DOES SOMETHING (owner, 2026-09-16)
**This app is not a foreign object to send explorers into. You wrote it.** A
session that greps to rediscover its own pipeline order, does not know which
files exist, and then reasons from the two functions it just read is not
maintaining an app — it is meeting one, every time, with no memory.

**The brief is PRINTED at session start**, by `.claude/hooks/session-start.sh`:
the hub's family brief (branch, doctrine drift, the lessons index) and then
[`tools/session-brief.mjs`](tools/session-brief.mjs), which carries this app's
own facts — the pipeline order, the FOUR paths that each rebuild the at-open
ruling, the five places an `EditParams` field must be added, the commit gates
and the walks. **Every line of it is generated from the app**, because a brief
that can go stale is the same failure one level up.

**The module map is `docs/ARCHITECTURE.md` and it is GENERATED** from the
comment each source file opens with, held to it by
[`tools/architecture-check.mjs`](tools/architecture-check.mjs) on every commit.
**Read it instead of grepping.** A new module cannot be added without appearing
there, a deleted one cannot linger, and a file that does not say what it is
fails the commit. That document was a day old and still named a look that had
been renamed — which is why it is no longer written by hand.

**What this costs when it is skipped**, measured the day the rule arrived: a
session changed `batchParamsFor`'s channel swap on a diagnosis assembled from
two functions, wrote a confident comment on it, built it, and the measurement
came back byte-identical. It was backed out. A guess with good prose on it is
still a guess, and the 150° it claimed to explain is still unexplained.

## HOW AN IDEA BECOMES WORK (owner instruction, 2026-09-17)
An idea from discussion does not go straight onto the roadmap. It goes:
**research it, write the record, then add the bullet, then rank it.**

**The record is `docs/decisions/NNN-slug.md`** and it carries six sections —
Context; **Looked up** (what was researched outside this repo and what it said,
or why nothing outside bears on it); **Weighed against** (what already on the
schedule this overlaps, and what was done before on it, by `NOTES.md` heading);
**Options**, chosen first; **Rejected**, each with why it was rejected; and
**Rank**, where it sits and why relative to its neighbours. An archived item
gains **Outcome**: the commit, and what turned out wrong.

**The shape is MADR's** (adr.github.io/madr), not one invented here, and its
centre is the rejected options. That source's own reason: most decisions are
interesting because there were two or three viable options, and recording only
the winner discards the analysis.

**The roadmap in `NOTES.md` is the index and the rank** — file order IS priority,
which was already the convention. Each open bullet carries
`<!-- decision: NNN -->` on its FIRST line, where the parser can see it and the
reader cannot; the ⓘ dialog renders only the bold span, and the built bundle was
checked to contain zero keys.

**[`tools/decisions-check.mjs`](tools/decisions-check.mjs) refuses the commit**
when an open item has no record, a record is claimed by nobody, a record is
about a DIFFERENT item than the one claiming it, or a section has no body. The
schedule then prints at session start, in rank order, so a new idea can be
compared against it at the moment it arrives.

**Why it exists, measured 2026-09-16.** A fitted eight-band array was added to a
look system already known to be a scatter of fitted constants, and nothing at
decision time said so. The same evening, one defect was diagnosed three times —
gray-world, the channel swap, the depth lift — each abandoned in a chat sentence,
none recorded, so a fourth attempt would have started from zero for the fourth
time. That defect is now record 001 with its rejected diagnoses written down.

**And the gate caught its own author.** The backfill assigned keys in roadmap
order and wrote the records in a different order, filing two of eleven under each
other's keys. Every existence check was green. The title check exists because of
it: a gate that only counts says a filing cabinet is full.

## Release flow (the owner's hard gate)
- `main` == production (jefferson-photo-studio.pages.dev, deployed on push).
- The `staging` branch deploys to staging.jefferson-photo-studio.pages.dev.
  Every product change goes: designated `claude/*` branch → push to `staging`
  → the owner's on-device pass → the owner's explicit go → PR + merge to `main`.
  Never merge a product change to main without that go. Docs-only changes
  (NOTES.md, this file) may merge without the gate.
- Push to `staging` UNPROMPTED whenever work reaches a point the owner needs
  to test AND no other branch is already waiting for a go to `main` — being
  asked for it is the signal this rule was broken (owner rule, 2026-07-13). Staging
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
**[`IR-SCIENCE.md`](IR-SCIENCE.md) IS THE RESEARCH FILE. READ IT BEFORE TOUCHING
PIXELS, WHITE BALANCE, LOOKS OR DECODE.** It carries the physics, what the file
formats actually contain, the three processing routes and which one this app
implements, how to measure an IR rendering without fooling yourself, and the
standing errors — each with the measurement that established it. It exists
because this exact paragraph was not enough: sessions kept rediscovering the
same infrared facts, shipping a regression, and rediscovering them again a week
later. Design from IR physics first and reach for general photography only where
it fills a gap and still applies; that file marks where those places are.

**The one most likely to be rediscovered by accident: the camera CANNOT store an
infrared white point.** Its recorded white balance is a clamp artefact, not a
measurement, and developing a raw at it renders a magenta wall with the green
channel at zero. The white point is found BELOW what the camera allows, from the
data. A session read "opens as shot" as an instruction to do the opposite,
shipped it, and took it back out the same day (IR-SCIENCE.md §3).

This app processes INFRARED and full-spectrum photography ONLY. Every
processing judgment starts from IR physics: red-channel flood, white balance
far beyond visible norms, daylight-only shooting, hotspots, false-color
pipelines. A frame that looks wrong by ordinary-photo intuition — "too dark",
"too red", an alien histogram — is IR-NORMAL until proven otherwise;
diagnose against IR references and the file's own metadata, never against
visible-light expectations. (A bright IR daytime frame was misdiagnosed as
"a twilight scene" from exactly this error; the real bug was a decode level.)

## GO AND LEARN THE DOMAIN — DO NOT CONVERGE INSIDE THE APP (owner, 2026-09-16)
**The failure this names: converging on a data set without ever checking whether
the right question is being asked.** Four rounds went into why Aerochrome would
not go deep red — measuring hue and saturation on rendered frames, tuning bands,
building a comparison sheet — and every one of them was a measurement INSIDE the
app. The answer was not in the app. It was that the film's three layers are
sensitive to green, red and infrared with blue thrown away by a yellow filter, so
the mapping is a three-way rotation and the app's two-channel swap cannot express
it (IR-SCIENCE.md §4b).

**One web search settled it, and the session had not run one.** That is the
signal the rule was broken: research reachable in a single search is research the
session does before offering a candidate, not after four rounds of tuning.

So: when a question is about a real-world medium, process or piece of equipment —
film, filters, conversions, optics, colour science — **go and read about it
first**, from sources, and write what is found into `IR-SCIENCE.md` with the
source named. A measurement of the app's own output cannot tell you what the app
should be doing. `WebSearch` works here; `WebFetch` is subject to the
environment's network policy, and a blocked host is a QUESTION to ask in the
moment, never a reason to fall back on what the model remembers.

## Known things first — mine the references before implementing (owner, 2026-07-25;
## restated 2026-09-16 as a CADENCE, not just a principle)
**STOP BEFORE EACH NEW THING AND GO LOOK.** Not when stuck, not after a round of
tuning fails — BEFORE. The check is one search and it is cheap; the alternative
is deriving by hand something a field settled decades ago and calling the
derivation progress.

Said three times in this repository now, which is what makes it a cadence rule
rather than a principle: "known things first" (2026-07-25), "go and learn the
domain" (2026-09-16), and this. **The session that hears it again writes it
down; it is not a decision to put to the owner.**

**What it just cost, twice in one day.** Four rounds of tuning went into why
Aerochrome would not go deep red, all of them measurements of the app's own
output; one article settled it. Then the NEXT thing — bright foliage washing out
to white — was about to be attacked by hand, and one search named it: a tone
curve applied INDEPENDENTLY PER CHANNEL desaturates highlights toward white,
which is the standard approach in most raw software and is exactly what
`src/pipeline.ts` does at the `out[0..2] = toGamma((n - 0.5) * con + 0.5)` lines.
Luminance-only contrast keeps the colour and clamps harshly instead; the
blend between the two is a parameter that colour pipelines already expose. None
of that needed deriving and all of it was one query away.

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
owner call 2026-07-25). Reset returns to this baseline; the Basic tab's
"Hold: the bare decode" shows the photograph with those four automatics off.
**THE PROMISE IS A SENTENCE, NOT A BUTTON (owner, 2026-09-16).** This ruling used
to name Hold: Untouched as the standing PROOF that nothing was mutated, and it
never was one: it renders the same decode either way with four sliders zeroed,
and those four are visible and undoable, so dragging them to zero shows the same
thing. The true claim is *your original file is never changed*, it is said in
words on the Basic tab, and the hold is a DIAGNOSTIC — for telling whether a
frame that opens looking wrong is the file or one of the automatics. What stays banned FOREVER (Doctrine §14): silent PIXEL
mutation — every automatic lands on a visible slider, is undoable, and the
untouched decode stays one press away. Never add an at-open automatic that
fails any of those three tests.

## Every function states its contract (owner rule, 2026-09-15)
**What it takes, what it does, what it gives back — and what the result has to
satisfy or who consumes it.** That last clause is the one that catches
regressions, and it is the one this repo was missing.

This repository already comments heavily and the comments are good, but they
carry WHY a thing exists and what the alternative cost. **History is not a
contract.** `bumpFrom` in `src/lensstore.ts` had a careful paragraph about what
it derives and why it refuses to guess, and never said that what it returns has
to pass `bumpProblem`. A later commit tightened `bumpProblem`; nothing connected
the two; profiles saved cleanly and were refused on every read afterwards,
wholesale, and a measured lens silently stopped working. Somebody who had been
told "the curve this returns must pass bumpProblem" would have seen it while
typing. Measured when the rule arrived: **10 of 246 exported functions stated a
contract.**

- `tools/contract-check.mjs` runs on every commit through `.branch-guard`. It
  checks the three mechanical parts: a `/** */` block above every exported
  function, every parameter named in it, and a statement of what comes back.
- **The fourth part is a CHECKLIST and cannot be parsed**: name the invariant the
  output must hold, or the caller that depends on it. No parser tells a real
  invariant from a sentence shaped like one. Write it anyway — it is the point.
- **The existing backlog is a declared list** (`.contract-allow`), checked both
  ways and printed on every run, so it can only shrink. A new exported function
  is not on it and therefore must carry its contract. Touching a file is the
  moment to take its functions off the list.

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

## A LOOK CHOICE IS SHOWN, NEVER DESCRIBED (owner rule, 2026-09-16)
When a decision is about how a photograph LOOKS — which rendering ships, how deep
a red goes, what a look's numbers should be — **render the candidates and send
the pictures.** A numbered list of options with a recommendation is the right
shape for a question about behaviour and the wrong shape for a question about
colour: the owner is being asked to judge an appearance, and prose about hue and
saturation is not an appearance.

`tools/look-sheet.mjs` renders variants of one frame through the real pipeline
and writes a PNG per candidate, so the comparison is the app's own output rather
than a description of it. Use it, or something that renders; never substitute
adjectives.

**This does not make the choice.** Naming what each candidate costs is part of
the report — which frames it helps, which it hurts, what it does to the sky while
it fixes the foliage. Picking between them is the owner's, and a measurement can
narrow the options without choosing (Doctrine, and IR-SCIENCE.md section 8's last
standing error).

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
