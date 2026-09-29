# 071 · The first launch after an update froze with nothing said, and every update fetches the whole app again

## Context

**The report, 2026-09-26.** The first launch of the installed app on a Windows
PC (Edge 154, a GTX 1650 through Direct3D) after v2.63.7 was promoted showed
the start screen and did nothing for about a minute. Nothing on screen said
anything was happening; then it came through. The diagnostic taken afterwards:
nothing open, no quick look that session, and `Offline worker: active · a worker
is waiting, but it is this same version (2.63.7) · the worker serving this page
is v2.55 · caches: ips-examples-v1, ips-2.55, ips-2.63.7`. The PC had last run
the app at v2.55, so this launch went from 2.55 to 2.63.7 in one step.

**What an update does today, read from the source and from production's own
`sw.js` the same day.**

- **Every release precaches the whole app into a new, empty cache.** The cache
  is named for the release, so each one requests all 218 entries, 28 MB, and
  stores them again; how much of that crosses the network depends on what the
  browser's own cache still holds. Nothing is copied from the cache before it.
- **Ninety percent of it is the sticker library**: 162 pictures, 25 MB, which
  the app already fetches one at a time when a sticker is used. The precache is
  the only reason all 162 are fetched. It has been this way since stickers
  arrived in July.
- **All 218 requests go out at once** (`Promise.all` in `public/sw.js`), with
  no limit and no priority.
- **Nothing says a download is running.** The strip in `src/swupdate.ts` acts
  only once a new version has finished installing, and never looks at one that
  is still installing; the diagnostic reads "active" throughout.
- **Settings' own "update" route reloads after a fixed 20 seconds** whether or
  not the download has finished.

**What froze the page is NOT established, and there are two candidates.**

- **The download.** The obvious reading, and probably wrong for this launch:
  Chromium starts a page-triggered update only after the page's network has gone
  quiet, plus one second, so the page's own files arrive first; and Cloudflare's
  ETags are content hashes that do not change across deploys, so the unchanged
  stickers were probably answered "not modified" out of Edge's own cache.
- **The editor compiling its picture code.** `src/main.ts` builds the renderer
  while the module loads, and `src/gl.ts` checks the compile and link status at
  once, so the page waits for the graphics driver. The fragment program is about
  1,050 lines with nested sampling loops; this PC compiles through Direct3D,
  which unrolls them; it grew by about 175 lines between 2.55 and 2.63.7; and
  Chromium caches compiled programs by their source, so the first launch after a
  release that changes it compiles from scratch. That matches a painted start
  screen with every button dead, then "came through". Not measured.

**And two live defects in the same path, found while it was read, each with a
known remedy.**

- **The host answers a missing file with the start page and a 200.** Checked
  against production: with no `404.html`, Cloudflare Pages serves the site's
  index for any path it does not have. An install that asks for a file a newer
  deploy has already removed stores the start page under that file's name, and
  the release is broken, online and offline, until the next one takes over.
- **The strip asks whether a waiting version is different, not newer.** Pages
  load network-first, so the page is often newer than the waiting worker; the
  strip can then offer an older version, and taking it runs that worker's
  cleanup, which deletes the newer version's half-filled cache.

## Looked up

Researched 2026-09-26. developer.chrome.com, webkit.org, jakearchibald.com,
developers.cloudflare.com and chromium.googlesource.com are refused by this
environment's network; Workbox, Chromium and Cloudflare were read from their
GitHub copies instead, and WebKit's storage policy only as search snippets.

- **Workbox precaching** (`workbox-precaching` v7, `PrecacheStrategy.ts`,
  `PrecacheController.ts`): one cache for every release, each entry keyed by URL
  and revision; install looks in that cache first, so an unchanged entry costs a
  lookup and no request; activate deletes what the new list no longer names.
  Entries are downloaded one at a time, because firing them all at once caused
  `net::ERR_INSUFFICIENT_RESOURCES` in Chrome and competed with the page
  (workbox issue 2528, PR 2562).
- **offline-plugin** (`sw-template.js`, `docs/options.md`): keeps a per-release
  cache name and copies unchanged files forward from the previous one,
  downloading only what changed. The shape that keeps this repo's per-release
  name.
- **Large optional files** (web.dev offline cookbook; web.dev "precaching";
  Workbox dos and don'ts; sw-precache README): precache what the app cannot
  start without, and cache the rest when it is first used.
- **Telling the reader** (web.dev `learn/pwa/update`, the service-worker
  lifecycle article; MDN `Clients.matchAll`): `updatefound` fires when
  installing starts; there is no built-in progress, so the worker counts its own
  downloads and posts them to every window, controlled or not. Background Fetch
  shows progress but is not in Safari, which rules it out on the iPad.
- **When Chromium starts an update** (Chromium source,
  `service_worker_register_job.cc`, `idleness_detector.cc`,
  `service_worker_version.cc`): a same-URL `register()` does not start one; a
  navigation's update waits for network quiet, then `kUpdateDelay`, one second.
- **Cache storage in Chromium** (`cache_storage_scheduler.cc`): a write into a
  cache is exclusive, and a lookup across every cache waits on all of them.
- **The host** (Cloudflare Pages `serving-pages`): with no `404.html` the site
  is served as a single-page app and every unknown path answers with the index.
- **How ANGLE builds the picture code on Direct3D 11** (ANGLE source on GitHub,
  read 2026-09-28: `hlsl/OutputHLSL.cpp`, `d3d11/Renderer11.cpp`,
  `ShaderD3D.cpp`). ANGLE translates the GLSL to HLSL and hands it to Microsoft's
  compiler, FXC, at optimisation level 2. A loop gets `[loop]`, "do not unroll",
  only when something it calls takes a gradient (`hasGradientInCallGraph`);
  every other loop reaches FXC with no attribute, and FXC unrolls a loop whose
  count it can see. Sampling inside a loop whose flow can diverge is already
  written out at level 0 by ANGLE itself (`mInsideDiscontinuousLoop`, the
  `Lod0` functions). issues.angleproject.org and bugs.chromium.org are refused
  by this environment's network.
- **What is known to make FXC slow** (ANGLE mailing list, "Solving slow
  compilation of long loops with texture sampling" and "Long shader compile
  times with D3D11 backend"; Mozilla bugs 658826, 725467, 1247135; ANGLE issue
  3682, "Slow fxc compile performance with dynamic uniform indexing", read by
  title only): FXC tries to unroll every loop it can, which on long loops is
  most of the time, and indexing a uniform array with a loop variable is slow
  to compile. The proposed ANGLE patch marks every loop `[fastopt] [loop]`; it
  is not in ANGLE's source today. OneJS issue 130 (2026) measured 7.6 s for one
  large interpreter shader on Chrome and moved it off the page with
  `KHR_parallel_shader_compile`, the same answer as this record's compile half.
- **ANGLE's own route out of it** (ANGLE design note "Uniform Block to
  StructuredBuffer Translation", `src/libANGLE/renderer/d3d/d3d11/` in the ANGLE
  source; read in full 2026-09-29 from GitHub's mirror,
  raw.githubusercontent.com/google/angle/main/..., because this environment's
  network refuses chromium.googlesource.com):
  - Its background: "We run into a compile performance issue with fxc and
    dynamic constant buffer indexing."
  - Its rule: ANGLE translates a uniform block into a StructuredBuffer when the
    block has only one array member, of size 50 or more, and every access to it
    is through the indexing operator. The element may be a scalar, a vector,
    some matrices, or a struct of those with no array or struct inside it.
  - Its limits: the array is never used whole (no comparison, assignment or
    function argument), and only layouts that need no std140 padding, or can be
    emulated, are supported. It gives no measured numbers.
  - So the field has two known ways to give FXC the mask parameters without
    loop-variable indexing into plain uniform arrays: one uniform block of that
    shape, or a data texture read with `texelFetch`.

## Built already

- `servableCopy` and `alsoAt` in `public/sw.js`: every stored page stays
  unredirected and is kept under the URL the deploy serves it at.
- The `EXAMPLES` cache, the one cache that survives a release.
- The `VERSION` message, read by the strip in `src/swupdate.ts` and by the
  diagnostic's `swLine` in `src/diagnostic.ts`.
- The test page, `debug.html` with `src/debug.ts`, whose measurements each print
  their runs through `row()`.
- `tools/offline-shell-walk.mjs`, which brings a server that redirects the way
  Pages does and plants defects by rewriting the served `public/sw.js`.

## Weighed against

- **NOTES "2026-09-13 — the update strip announced a worker swap as a new
  version, and registration failures are invisible".** The strip stays silent
  about the version already on screen; comparing as numbers keeps that and adds
  "never older".
- **NOTES "2026-09-13 — three caches is correct, and the desktop report is the
  update bug in the wild".** The same state as this report, a new page served by
  an old worker, recorded then as wording.
- **NOTES "2026-09-13 — the 'waiting worker with no cache' was the report's own
  race".** Its argument leaned on `addAll` being all-or-nothing, which `sw.js`
  no longer uses; the install is still all-or-nothing, the cache is not.
- **NOTES "The app would not open offline, and the harness could not have seen
  it, 2026-09-23".** Any change here keeps its two invariants: nothing stored
  redirected, every page under the URL the deploy serves.
- **NOTES "The update strip reaches all three apps, 2026-09-10" and "The black
  screen on a phone was the update strip, not the photograph, 2026-09-22".**
  Any new state of the strip goes through the same shared look and the same
  walks.

## Depends

- touches 060 — the strip may gain a downloading state, and 060 is about notices competing for the start screen.
- touches 002 — Creative reuses the sticker library, so where stickers are kept offline decides where Creative's are.
- touches 042 — the per-mask stages grew the editor's picture code, which is one of the two candidates for the minute.
- distinct-from 014 — also a PC that seemed stuck, but in the quick look; this report had nothing open and no quick look that session.

## Options

1. **Measure before choosing a fix, and fix the two live defects now.** Chosen.
   - **The measurement, in the app (§7j).** The diagnostic gains a "Start-up"
     line recorded at every launch: the page request's response start and end;
     the main bundle's timing and transfer size; module start; the editor's
     graphics before and after its picture code is built; "controls wired"; the
     longest main-thread gap, from a frame-gap monitor; update found, and the
     install's start and end; and the connection's downlink and round-trip time
     where the browser gives them. The test page gains "Compile the editor's
     shader": the real program, built cold with a unique comment appended so no
     cache can answer, three runs with the first as the headline and every
     run printed beside it, then one warm run, and whether parallel compile is available. One launch after the next
     release that changes the picture code, on the PC and on the iPad, says
     which of the page request, the code arriving, the compile or the download
     took the time.
   - **The host.** `public/404.html`, so a missing file answers 404 and an
     install can never store the start page under a program file's name.
   - **The strip.** Versions compared as numbers; a waiting worker at or below
     the page's version is never offered.
   - **Then the redesign, as its own plan**, once the measurement is back and
     the two questions below are answered: copy unchanged entries forward from
     the previous release, one download at a time, the stickers in a cache of
     their own that outlives releases, and the download said in words while it
     runs. The two adversarial checks and the critic already found what its
     first draft got wrong, and it starts from their list: a lookup that names
     only the active cache breaks opening a photo offline while an update
     waits; a changed sticker pruned on activate makes an export drop it
     silently; deleting a superseded cache during install races the old
     worker; a digest check that never matches would stop every update for
     good; a "Hide" that reuses the dismiss flag would silence the ready notice;
     `debug.html` is a fourth page with the strip.
   - **MEASURED, 2026-09-26: THE MINUTE WAS THE COMPILE.** On the PC (Edge
     154, GTX 1650 through Direct3D) the test page built the editor's picture
     code from scratch in 42,678, 42,284 and 41,558 ms, and 20 ms when the
     browser already held the built copy; on the iPad 557 ms, then 22. A browser
     keys that copy by the code's text, so every release that changes the
     picture code costs the PC about 42 seconds on its first launch, with the
     start screen painted and the page waiting. The same PC reads its
     connection at 1.45 Mb/s, where the 28 MB every release fetches takes about
     two and a half minutes, so the download is a second cost, not the freeze.
     That lifts the reason options 2 and 6 were rejected; both are the second
     step, under the plan approved the same day.
   - **The two questions were settled 2026-09-26, by the record rather than
     by asking.** Neither has two outcomes the record cannot rank.
     - **A waiting version that is the build on screen takes over with no
       press.** It changes nothing the reader can see: it is the offline copy
       catching up with the page. It is matched by the build (the commit,
       stamped into the page and the worker), not the version, because a
       staging force-push can repeat a version. It happens only when the app is
       open in one window, because a second window may be an older build. Hub
       Doctrine §7h.1 carries the exception, and `pwa-check`'s pass line
       names it.
     - **A new reader gets the stickers all at once, in the background, into
       a cache of their own.** No picker and no previews. The library fetches
       once per device and no release fetches it again, so a one-at-a-time
       picker would save a first install 25 MB, once, at the cost of a new
       surface.
   - **BUILT 2026-09-26, the download half.**
     - Every precache entry carries a revision: the first sixteen hex digits of
       the SHA-256 of the file as built. Every stored copy carries the revision
       it was checked against, plus the host's header rules, so a change to
       `_headers` downloads everything again.
     - Install copies each entry forward from any cache on the device holding
       those bytes, then downloads the rest one at a time, all or nothing.
       Stickers come last, best effort, cut off at 80% of the browser's time
       for an install. The cache is then read back by name and must be whole.
       That last check closes a hole the per-file design opened: closing the app
       mid-install could otherwise activate a partial cache.
     - The strip says "Downloading the update… N of M" while it runs, and says
       so if the download fails.
     - Activate keeps a newer release's cache and the sticker cache.
     - `tools/offline-shell-walk.mjs` asserts each of these against a real
       second worker (checks 5 to 24).
     - **What turned out wrong:** staging's first deploy stamped the build
       as modified. Vite writes a temporary copy of its config beside it while
       loading, and the stamp read git's status in that window. The takeover
       stayed safe, because page and worker of one build share the stamp, but
       two builds of one commit never matched. Fixed the same day by ignoring
       that file; check 4b recomputes the stamp from the tree.
   - **BUILT 2026-09-26, the compile half.**
     - The renderer asks for `KHR_parallel_shader_compile`, starts the link and
       returns. It polls `COMPLETION_STATUS_KHR` on animation frames, and a
       photograph waits on `editorReady()` while nothing else does.
     - "Preparing the editor…" goes up before a build the launch expects to be
       cold, painted first, and after a second on any other build. It is keyed
       on the picture code's text and the browser, which is what the browser
       keys its built copy on, not on the app's version. "The editor is ready"
       is said when it finishes.
     - A build that fails has its own panel and puts the driver's log in the
       report. The Start-up line says whether the page stayed free, read off
       its own frames.
     - `tools/build-wait-walk.mjs` fails 17 checks against the synchronous
       build.
     - **Not yet known:** whether Edge on the PC really builds off the page
       once asked. The Start-up line answers it from the first launch.
   - **BUILT 2026-09-28, the code itself (Rejected 6's other half), in
     v2.63.31, and it did nothing.** Every loop that samples the picture reads
     it at one level (`textureLod`); the picture is byte-identical on the
     frames compared, and `tools/agreement-walk.mjs` refuses a plain sample
     anywhere a loop reaches. **Measured on the PC 2026-09-28, Firefox 156 on
     v2.63.34: 44,527 ms** to build the picture code the first time (44,521,
     44,095 and 43,823 ms, each plus the first picture), and 44,233 ms again
     on a normal launch, against 42,000 to 47,000 ms before. **The premise was
     wrong** (Looked up): ANGLE already writes sampling in such loops at level
     0, and a loop with a gradient was the one loop ANGLE marked "do not
     unroll", so the change handed FXC nearly the same code with fewer loops
     marked. The same report confirms the download half on the PC: the update
     kept 214 files, downloaded 4, and took 1.0 s.
   - **What was left, two candidates, both named by the sources, and now one**
     (the measurement of 2026-09-29, directly below, names the mask loops). The shader's
     tap loops have counts FXC can see (a 13 by 13, three 7 by 7, a 3 by 3 and
     a run of eight) and are unrolled; and every mask loop runs to
     `u_maskCount`, a count FXC cannot see, and indexes thirteen uniform
     arrays and the local weights `gW` with its loop variable, the mixer's
     `u_maskHsl[i * 8 + bi]` with a computed index. Which one is the 44 seconds
     is measured on the PC before anything is changed.
   - **MEASURED 2026-09-29: IT IS THE MASK LOOPS.** The test page's "What
     makes the picture code slow to build", v2.63.42 on staging.
     - **On the PC** (Firefox 156, ANGLE over Direct3D 11 on a GTX 980, taken
       2026-09-29 01:03 UTC), each built once from nothing, plus its first
       picture:
       - as shipped, 45,361 ms;
       - with every loop's count hidden from the compiler, 45,329 ms;
       - with the mask loops taken out, 789 ms;
       - with both, 672 ms.

       The counted loops' unrolling costs nothing measurable. The mask loops
       are 44.6 of the 45.4 seconds.
     - **The control** (a second PC, Chrome 152 drawing through SwiftShader, a
       software renderer, taken 2026-09-28 20:53 UTC): 18, 19, 22 and 18 ms
       for the same four. The same program builds in milliseconds on a
       compiler that is not FXC. So the cost is how FXC handles the mask
       loops, not the size of the program.
     - The option that follows is 8. Nothing else in either report bears on
       this record.
   - **Still open:** the busy card has no seconds count and cannot be put
     aside during a long wait.
   - **Still open, asked 2026-09-29: is a stored copy slower to start than a
     first visit while an update downloads?** The two reports above cannot
     settle it. Neither is a first visit, and the one taken while an update
     was installing (the second PC: started 0.45 s, a 220 ms pause, 1.45 Mb/s)
     is also a different machine, browser and renderer from the one taken with
     none (0.17 s, 3 ms). What settles it is one machine and one browser, read
     three ways off the report's Start-up line: a first visit with nothing
     stored, a stored copy with no update, and a stored copy while an update
     downloads.
2. Build the redesign now.
3. Words only: say a download is running, change nothing about it.
4. Take the stickers out of the precache and change nothing else.
5. One cache for every release, keyed by revision, as Workbox does.
6. Compile the picture code without blocking (parallel compile, polled), with a
   sentence on screen while it compiles.
7. Leave it.
8. **NEXT, written 2026-09-29, open and not built: the mask parameters leave
   the indexed uniform arrays.** The measurement under 1 names the mask loops.
   The field names the shape FXC is slow on, loop-variable indexing into
   uniform arrays (issue 3682), and ANGLE's own route out of it (Looked up).
   - **Two ways to hand FXC the same numbers.** One uniform block whose only
     member is an array of structs, one struct per mask, padded to 50 entries
     so ANGLE turns it into a StructuredBuffer. Or a data texture, one row per
     mask, read with `texelFetch`. Either way the shader reads the same values
     and the picture must not change: screen and export stay identical
     (`tools/agreement-walk.mjs`), and every mask walk passes.
   - **Measured before the editor changes, as 1 did.** A fifth variant on the
     test page rewrites the mask arrays into the block and is timed beside the
     four there today, on the PC. If the block does not take the build near
     the 789 ms of the loops taken out, the texture is measured next. The
     editor's own program changes only after one of them does.
   - **Its own plan.** It is a change across thirteen arrays, their upload in
     `src/gl.ts` and the CPU path that has to match it.

## Rejected

- **2, the redesign now.** The minute's cause is not established, and the
  measurement is one release away; a redesign judged against the wrong cause
  ships its own risks (the six holes listed under 1) for a symptom it may not
  touch. LIFTED 2026-09-26: the measurement puts 2.5 minutes of download on the
  PC's connection behind every release, whatever froze the page.
- **3, words only.** If the minute was the compile, the strip lives in code
  that is waiting on it and cannot speak; and the cost is unchanged.
- **4, stickers only.** It removes 25 MB and leaves the silence, the 218
  simultaneous requests and the full re-store of everything else; it is part of
  the redesign, not an answer on its own.
- **5, one cache for every release.** §7h and `pwa-check` require the cache
  name to carry the release; copying forward into a per-release cache gets the
  same saving and keeps the rule.
- **6, compile without blocking, now.** The right remedy if the compile is the
  minute, and a guess until the measurement says so; it changes when the editor
  becomes usable on every device. LIFTED 2026-09-26: the measurement says so, 42
  seconds on the PC. Making the code itself compile faster on Direct3D is the
  other half, measured on the device before it ships.
- **7, leave it.** Two live defects can break an install or delete a newer one,
  and the reader is told nothing either way.

## Rank

**Directly below 069.** Argued by what would be redone, not by severity.

- **It invalidates nothing above it.** The sky work touches none of the update
  path, the precache or the start-up.
- **The one item above it has nothing to build yet.** The sky record has no
  option left and is being researched. The sky records ranked below this one
  (the rotation fix, the reader-visible sky selection, the round spots) share no
  ground with the update path either, so this record declares no relation to
  them; it goes above them because it can be built now and they are ranked
  behind the sky record's answer.
- **Above 068.** 068's learned finder would download 23.5 MB of models on
  demand, and today anything fetched on demand outside the practice photos lands
  in the release's cache and is deleted at the next activate. 068 declares that
  it needs this.
- **What waiting costs.** Every release, and every staging push for a device
  pass, re-stores the whole app on every installed device, silently.
