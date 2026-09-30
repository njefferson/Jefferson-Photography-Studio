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
- **Routes around FXC, 2026-09-30** (three researchers and a skeptic, web only).
  The skeptic checked 157 cited quotes against their sources: 148 confirmed, 9
  partly, none unsupported (its own summary counts 150 and 11 partly). Those
  verdicts cover the quotes, not the conclusions drawn from them; the
  conclusions marked as inference below were not among the things confirmed.
  - Refused during the research, every host the researchers recorded, 82:
    anglebug.com, api.github.com (the session's GitHub access, not the proxy),
    archive.org, blog.chromium.org, bugs.chromium.org, bugzilla.mozilla.org,
    caniuse.com, chromestatus.com, chromium-review.googlesource.com,
    chromium.googlesource.com, codeberg.org, community.khronos.org,
    dawn.googlesource.com, dev.epicgames.com, devblogs.microsoft.com,
    developer.chrome.com, developer.chrome.google.cn, developer.nvidia.com,
    doc.babylonjs.com, docs.flutter.dev, docs.gimp.org, docs.rs,
    docs.unity3d.com, dolphin-emu.org, firefox-source-docs.mozilla.org,
    forum.affinity.serif.com (the site itself answered 403),
    forum.babylonjs.com, gamedev.net, gamingonlinux.com, gegl.org, github.blog, github.com (over
    curl only; read through WebFetch), gitlab.freedesktop.org,
    gitlab.gnome.org, godotengine.org, gpuopen.com, gpuweb.github.io,
    graphite.rs, groups.google.com, hacks.mozilla.org, halide-lang.org,
    helpx.adobe.com, hg.mozilla.org, html.spec.whatwg.org,
    issues.angleproject.org, issues.chromium.org, issuetracker.google.com,
    jo.dreggn.org, learn.microsoft.com (read through its GitHub source
    instead), linuxiac.com, lists.w3.org, mozillagfx.wordpress.com, op-co.de,
    people.csail.mit.edu, product-details.mozilla.org, r.jina.ai,
    registry.khronos.org, searchfox.org, simonwillison.net,
    source.chromium.org, sourcegraph.com, stackoverflow.com,
    therealmjp.github.io, threejs.org, toji.dev, web.archive.org,
    web3dsurvey.com, webgl2fundamentals.org, webglreport.com, webkit.org,
    whattrainisitnow.com, winaero.com, www.bing.com, www.dpreview.com (the
    site itself answered 403), www.firefox.com, www.gamedev.net,
    www.gdcvault.com, www.khronos.org, www.linkedin.com, www.phoronix.com,
    www.photopea.com and www.yosoygames.com.ar.
  - ANGLE's StructuredBuffer translation, read in upstream's source and in
    Firefox main's copy (pinned 5 August 2026, identical): std140, exactly one
    member, a one-dimensional array of at least 50, used only through an
    index, whose element is a scalar, a vector, a 4-row matrix or a struct of
    those with no array or struct inside. The translated blocks share a budget
    of 60 registers, and a block that is not an instanced array counts one
    (read in Firefox's copy of the source, `kMaxAllowToUseRegisterCount`). That it is on in Firefox on Windows 10 and later
    is the researcher's inference. A block that fails goes to a cbuffer, and
    when the ES 3.00 translation pass runs ANGLE logs its own warning that the
    block "will be slow to compile". That warning is a `WARN()` call to ANGLE's
    own log; no route from it to the WebGL program log was seen in the code
    read, which is not the same as there being none.
  - ANGLE marks a loop `[loop]` only when a gradient operation is in its call
    graph; every other loop reaches FXC bare. Microsoft's HLSL documentation
    says the compiler "simulates loops by default to evaluate whether it can
    unroll them"; that it describes FXC is the researcher's inference.
  - Why a `texelFetch` form can fail on FXC. The documented errors the
    researcher listed are:
    - X3511, a loop it cannot unroll;
    - X3531, a loop marked `[loop]` that has to be unrolled;
    - X3512, a sampler-array index that must be a literal, and X3550, the
      warning form of it, which forces the loop to unroll. ANGLE's
      `texelFetch` helper indexes with a runtime `samplerIndex`, and that this
      triggers them is the researcher's inference;
    - X3504, an array index out of bounds;
    - X3569 and X3570, warnings that force a loop to unroll, for its length or
      for a gradient;
    - X4014, gradient operations inside loops with divergent flow control;
    - X4505, the temp register limit, 4096 across temps and indexable temps.

    X3550, X3569 and X3570 are warnings; the rest are errors.

    Which one the PC hit is not known: the driver's reason did not reach the
    copied results. On X3531, X4014 or X3504 ANGLE retries without its loop
    macros; it then retries without validation, then without optimisation. It
    appends FXC's message and a note naming each failed configuration to its
    info log. That this is what WebGL's `getProgramInfoLog` returns is the
    researcher's inference.
  - How editors apply masks, as far as their code or documentation could be
    read. Every one found works one module or node at a time, and none loops
    over all masks inside one shader; for GEGL and RawTherapee that rests on
    thin sources, below.
    - darktable: each module carries its own per-pixel mask and mixes its
      input and output with it. On OpenCL the mask is a single-channel float
      image made in a pass of its own and read by a later pass; drawn masks are
      rasterised on the CPU.
    - vkdt: one compute shader per node, a mask node feeding a blend node.
    - GEGL, GIMP's engine, passes a mask as an extra input buffer (from one
      operation's description), and RawTherapee handles its adjustment spots
      one after another (from an issue author's statement in a feature
      request, not its code or documentation).
    - Core Image goes the other way: it joins a chain of filters into one
      operation so that it never writes intermediate buffers.
    - darktable records the memory cost of a full image as about 300 MB at
      4 × 32-bit float per pixel for 20 MP, needs at least an input and an
      output buffer per module, and says tiling, used when memory runs short,
      is up to 10 times slower. Affinity says its graphics memory use grows
      with bit depth and with large amounts of compositing work.
    - Lightroom's and Photopea's internals were not readable.
  - `EXT_color_buffer_float` makes R16F, RG16F, RGBA16F, R32F, RG32F, RGBA32F
    and R11F_G11F_B10F renderable; RGB16F stays not renderable. MDN's data
    lists it in Safari from 15. WebGL2 guarantees at least four draw buffers.
    MDN also says "Float16-blending is always supported", and that systems
    which render only to float16 offer `EXT_color_buffer_half_float`. Against float32 on the iPad, none checked
    on one:
    - MDN warns that rendering to float textures cannot be assumed, and that
      most mobile systems do not support rendering to RGBA32F;
    - MDN's data lists `EXT_float_blend` on iOS Safari as added in 15 and
      removed in 16;
    - WebKit offers `EXT_color_buffer_float` only when ANGLE reports it.
  - MDN's compatibility data lists `KHR_parallel_shader_compile` as
    unsupported in Firefox, and Firefox's own source reads `LINK_STATUS`
    straight after linking. ANGLE's Direct3D 11 compile and link are marked
    thread-safe and go to a thread pool when a page enables the extension,
    and Chrome raises its compile threads when it does. ANGLE compiles a pixel
    shader at draw time for a new target layout. Chrome's Windows GPU watchdog
    is 30 s. A 2023 test (mvaligursky/webgl-parallel_shader_compile on
    GitHub) found no browser kept an animation smooth while large shaders
    compiled in the background; in Chrome on Windows 10, 10 shaders "seem to
    get processed nicely" and 50 left gaps of a second or more, and in Firefox
    all the time went to the link-status read. It gives no time per shader. A
    second project (neotolis-engine issue 575) found that Chrome links on
    worker threads: the GPU
    process's link call took 0.2 ms or less, and the page's ten link-status
    reads waited 780 to 845 ms in all (3 to 310 ms each), because a read
    blocks until the link finishes.
  - Drawing with a general program while the specialised one builds is what
    Dolphin's and Godot 4.4's ubershaders do. Godot says its WebGL 2 renderer
    lacks "the functionality to effectively implement ubershaders", and that
    there a material must be preloaded by drawing it for a frame.
  - WebGPU: Dawn uses DXC on Windows by default from Chrome 122's source, and
    forces FXC below shader model 6.0. Dawn builds its own DXC only for Windows
    builds that are not 32-bit x86; that 32-bit Chrome therefore uses FXC is the
    researcher's inference. Firefox's wgpu uses DX12 with DXC, shipped as
    `dxcompiler.dll`, since 141, and the preference is on in 157's release
    branch; iPadOS 26 has WebGPU on by default.
    - For: OneJS issue 130, one large shader built around an interpreter loop
      of up to 256 instructions, 7.55 s to its first draw through ANGLE and FXC
      against 3.6 ms through WebGPU (Chrome 153, RTX 3080). And visloc-rs pull
      request 203 (merged 23 September 2026): a wgpu project whose DX12 startup
      took about 10 minutes when it fell back to FXC and seconds once DXC
      loaded. The same pull request carries unrelated speed-ups, so its test
      times are not DXC's alone.
    - `createRenderPipelineAsync`: the WebGPU specification prefers it because
      it "prevents blocking the queue timeline work on pipeline compilation".
      Firefox sends it to its WebGPU child actor and resolves a promise when
      the result comes back; that the compile then runs in the GPU process is
      the researcher's inference.
    - Against: wgpu issue 7443 (opened 28 March 2025, still open), about 2 s of
      DXC in Firefox on an array-heavy shader. A profile there "suggests a large
      amount of time spent in alias analysis", and performance in Chrome "is
      reported to be much better". And wgpu pull request 10314 (opened 12
      September 2026, still open), opened over Firefox's cold starts being
      slower than Chrome's: the HLSL that Firefox's translator writes to zero a
      compute shader's workgroup array took DXC 1,855 ms, and 23 ms with the
      patch. DXC issue 8958 (opened 24 September 2026), measured on an M4 Mac
      under macOS with DXC 1.9 and no browser: zeroing a large array by cast
      took 1.4 s at -O3, against 8 ms written as an explicit loop.
    - By default DXC refuses an `[unroll]` loop whose trip count it cannot work
      out at compile time or which is above a threshold, where FXC compiles
      it; setting the language version to 2016 turns that into a warning
      (Microsoft's porting guide).
    - A canvas holds one context type (MDN), so WebGPU and WebGL need separate
      canvases.

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
- touches 042 — the per-mask stages grew the editor's picture code, and the PC's readings put nearly all of its 42-second build in the mask loops.
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
     - **A second control reading** (a work PC, Chrome 152 drawing through
       SwiftShader, v2.64.4 on staging, taken 2026-09-29 19:11 UTC): 42, 26,
       31 and 34 ms for the same four. It says the same as the first control
       and nothing about FXC.
     - **The same PC again, 2026-09-30** (Firefox 156, ANGLE over Direct3D 11
       on the GTX 980, v2.64.4 on staging, taken 00:30 UTC): as shipped,
       42,420 ms; with every loop's count hidden, 42,639 ms; with the mask
       loops taken out, 715 ms; with both, 660 ms. The mask loops are 41.7 of
       the 42.4 seconds, as they were 44.6 of 45.4 the day before. Option 8
       stood, and its test-page variants were the next measurement; they
       were measured on v2.64.18 (below, and under option 8), and neither
       form does it.
     - **Found 2026-09-30: the test page's "first picture" was never drawn.**
       This qualifies every "plus its first picture" figure above and the
       iPad's 557 ms.
       - Every sampler in a program starts on texture unit 0. The editor's
         program has 2D-array and 3D samplers beside its 2D ones, and WebGL2
         refuses a draw when samplers of different types share a unit
         (INVALID_OPERATION).
       - WebGL2 requires a conforming browser to refuse that draw. So on every
         device, each first draw the test page timed raised that error and drew
         nothing, and its time is the time of a refused draw. Headless, putting
         the 3D sampler back on unit 0 brings the error back on all six rows.
       - Measured headless on SwiftShader with each sampler on its own unit and
         a texture of its own type: the first picture really draws, and costs
         0.4 to 2.0 seconds where the refused one cost 1.5 to 5.2 ms. The build
         itself stays at about 20 ms.
       - The build times above stand, and so does what they name. The PC's own
         report of 2026-09-30 splits its totals: as shipped, 42,418 ms built
         and 2.0 ms for the refused draw; with the mask loops taken out, 712 ms
         built and 3.0 ms. So on the PC the build is the 42 seconds, and the
         mask loops are that build.
       - The PC's first real draw is measured in the next reading, v2.64.18:
         868 ms as shipped. The iPad's is not yet measured; the next reading
         of the test page there carries it.
     - **The same PC, v2.64.18 on staging, 2026-09-30** (Firefox 157, ANGLE
       over Direct3D 11 on the GTX 980, taken 03:31 UTC), each built once
       from nothing, then its first picture really drawn:
       - as shipped, 42,933 + 868 ms;
       - with every loop's count hidden, 43,171 + 465 ms;
       - with the mask loops taken out, 667 + 308 ms;
       - with both, 707 + 94 ms;
       - with the mask settings in uniform blocks, 29,235 + 245 ms;
       - with the mask settings in a texture, "did not build".

       So a first launch after a release that changes the picture code pays
       about 43.8 s on that PC, of
       which the first real draw is 0.87 s. The same report says the update
       from 2.64.4 kept 205 files, downloaded 12 and took 2.9 s. Nothing was
       waiting when the page loaded, so the takeover half of that pass is not
       answered.
     - The options that follow are 8 to 12. Option 8 was measured short on
       2026-09-30 (under 8), and 9 to 12 were added from outside research the
       same day; none is chosen.
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
     downloads. One of the three is in, from the second control reading's
     machine: a stored copy with no update started at 0.74 s, with a longest
     pause of 0 ms. On the GTX 980 PC in Firefox, the same kind of launch has
     now been read twice: 0.17 s with a 3 ms pause, and on 2026-09-30 0.18 s
     with 0 ms. That machine still owes a first visit and a launch while an
     update downloads.
   - **Found in the same report, 2026-09-30: the report cannot say why an
     update did not take over.** A 2.64.4 worker was waiting while v2.63.42
     served the page, and the worker line called it "nothing to take", which
     is wrong when an older worker serves. The worker refuses a takeover
     silently on three grounds (another build under the same version, a gap in
     its cache, another window open), and the report knows the two workers'
     versions and nothing of what the waiting one decided, so it cannot tell
     the three apart, or tell a refusal from a takeover still running. The
     cache-gap refusal has no check in the offline walk, and that walk has
     never run in Firefox.
     - **Fixed 2026-09-30, for staging.** The worker now answers the window
       that asked. It says it took over, or it names why it did not: the two
       builds, the missing files and the first of them, or how many windows
       are open.
     - The report prints that answer, or "asked to take over, no answer yet".
       After a takeover, when nothing is left waiting, it says the worker
       serving the page took over when the page asked. It names the waiting
       worker beside the one serving the page, so it no longer says "nothing
       to take" when an older one serves. The test page rebuilds its report
       when the answer lands. Built once at load, it had read "no answer yet"
       on five loads out of five.
     - The offline walk checks the cache-gap refusal (25). It also checks that
       the takeover (26) and the three refusals (25, 27, 28) reach the
       editor's report in words, and that the test page's report comes to say
       25's words (29).
     - Each of those checks goes red under a planted defect: 25 and 29 under
       `nogap`, 29 alone under `noreheard`, 27 under `alone`, 28 under
       `adoptany`, and all five under `noadopt`. Check 26 has no plant of its
       own.
     - When a worker takes over is unchanged. The walk has still never run in
       Firefox.
2. Build the redesign now.
3. Words only: say a download is running, change nothing about it.
4. Take the stickers out of the precache and change nothing else.
5. One cache for every release, keyed by revision, as Workbox does.
6. Compile the picture code without blocking (parallel compile, polled), with a
   sentence on screen while it compiles.
7. Leave it.
8. **Written 2026-09-29, open and not built, measured short on the PC
   2026-09-30: the mask parameters leave the indexed uniform arrays.** The measurement under 1 names the mask loops.
   The field names the shape FXC is slow on, loop-variable indexing into
   uniform arrays (issue 3682), and ANGLE's own route out of it (Looked up).
   - **Two ways to hand FXC the same numbers.** One uniform block whose only
     member is an array of structs, one struct per mask, padded to 50 entries
     so ANGLE turns it into a StructuredBuffer. Or a data texture, one row per
     mask, read with `texelFetch`. Either way the shader reads the same values
     and the picture must not change: screen and export stay identical
     (`tools/agreement-walk.mjs`), and every mask walk passes.
   - **Measured before the editor changes, as 1 did.** Both routes are on the
     test page as of 2026-09-30, timed beside the four there already, so one
     PC run answers both.
     - A fifth row moves the thirteen mask arrays into uniform blocks: one
       block of per-mask structs packed into vec4 and ivec4, padded to 50, and
       `u_maskHsl` and `u_maskGrade` in blocks of their own.
     - A sixth row moves them into a data texture read with `texelFetch`.
     - Each rewrite counts what it changed and prints "not run" when the count
       differs from what the source holds.

     The editor's own program changes only after one of them comes near the
     row with the mask loops taken out, timed in the same run. The earlier
     715 and 789 ms included a refused draw, and the new rows draw for real,
     so only a same-run comparison is like with like.
   - **Its own plan.** It is a change across thirteen arrays, their upload in
     `src/gl.ts` and the CPU path that has to match it.
   - **Measured 2026-09-30, and neither form does it.** On the PC the blocks
     built in 29,235 ms against 42,933 as shipped, about a third saved and
     nowhere near the 667 ms of the loops taken out. The texture did not build
     on the PC, though it built and drew headless. The driver's reason was on
     the screen and not in "Copy the results", which carried only each row's
     value; the copy fix, on staging as v2.64.20, carries it next time.
   - **Why the blocks saved only a third is not known.** Two explanations are
     open, and nothing here tells them apart:
     - The fast translation did not engage on the PC. The session's own
       reading of the test page's blocks is that they fit ANGLE's rules (one
       std140 member, an array of 50 or more, structs of vectors only; the
       budget of 60 registers counts one per block that is not an instanced
       array). But the copy of ANGLE read was
       upstream's and Firefox main's (pinned 5 August 2026), not the Firefox 157
       release the PC ran. (The research also read the gecko-dev mirror's
       older copy, an ANGLE commit of November 2022, whose struct check
       differs; for structs of vec4 and ivec4 only, as here, the researcher
       reads both as giving the same answer.) That the
       feature is on in Firefox on Windows 10 and later is the researcher's
       inference.
     - It did engage, and what is left is FXC's handling of the loops
       themselves and of the local `gW[8]` they still index. That is the
       researcher's inference, not measured.

9. **The mask weights leave the main program (a route around FXC, asked
   2026-09-30).** Each mask's weight is drawn into an image in a pass of its
   own, and the main program reads the weights from that image instead of
   looping over masks, so FXC never sees a loop over masks.
   - **The nearest precedent found is half of it.** In darktable's OpenCL path
     and in vkdt, each mask is an image made in a pass of its own and read by a
     later pass, which is this option's first half (Looked up). But there each
     module carries its own mask, one mask per adjustment, while here one mask
     gates many stages. Core Image goes the other way, joining a chain of
     filters into one operation so as never to write intermediate buffers. No
     open-source WebGL editor with masks was found.
   - **For it:** every editor whose internals could be read works one module
     or node at a time, and none loops over all masks inside one shader, as
     this app's program does (Looked up).
   - The program without the mask loops built in 667 ms on the PC. It reads no
     weights, so what this option's program would cost is not measured. The
     texture row that did not build on the PC still loops over masks while
     reading their settings from an image; this option's main program would
     have no loop over masks. Whether that failure bears on it is not known
     until the driver's reason is read.
   - **What it has to reproduce:** the masks gate stages across the whole
     picture code (noise, detail, dehaze, clarity, the lens correction, shadow
     saturation, the Sky and Foliage bands, the local stage, the mixer and the
     grade), and colour masks key on the colour partway through it. So a colour
     mask's weight needs the picture as it stands at that point.
   - **Costs.** From the code: the editor draws one pass to the canvas today
     and has no float render target. From the sources:
     - float targets need `EXT_color_buffer_float`, which MDN's data lists in
       Safari from 15;
     - against that, on the iPad, the app's first device, and none checked on
       one: MDN warns rendering to float32 cannot be assumed and most mobile
       systems do not support it; MDN's data lists `EXT_float_blend` on iOS
       Safari as added in 15 and removed in 16, which matters only for blending
       into float32 targets, not shown to be needed here; and WebKit offers
       `EXT_color_buffer_float` only when ANGLE reports it;
     - for it, from the same MDN page: "Float16-blending is always
       supported", and systems that render only to float16 offer
       `EXT_color_buffer_half_float`. What precision the weights need was not
       researched;
     - memory: darktable's figures (Looked up) are about 300 MB per 20 MP
       image at 4 × 32-bit float, at least an input and an output buffer per
       module, and tiling up to 10 times slower when memory runs short. What
       this option's weight images would take here is not measured;
     - ANGLE compiles a new pixel shader at draw time when a program draws into
       a target of a different layout (read in its source). That this costs
       another FXC build of that program is the researcher's inference; here
       the main program would have no loop over masks, so what such a rebuild
       would cost it is not measured.
10. **WebGPU (a different compiler path, asked 2026-09-30).**
   - Chrome's Dawn uses DXC on Windows by default from Chrome 122's source
     (121's source had it off; that 121 already ran it by a field trial is the
     researcher's inference). Dawn still forces FXC when the adapter is below
     shader model 6.0, and builds its own DXC only for Windows builds that are
     not 32-bit x86; that 32-bit Chrome therefore uses FXC is the researcher's
     inference.
   - Firefox's wgpu uses DX12 with DXC since Firefox 141, and the preference
     is on in the 157 release branch; it stays off where Firefox has no GPU
     process or blocklists the device.
   - Safari has WebGPU on by default from iPadOS 26.
   - Nothing found measures a shader of this app's shape, loops to a count
     set at run time over uniform arrays, on DXC. None of the measurements
     below is of that shape, and that is this option's central unknown.
   - Two measurements for, neither on the PC or in Firefox:
     - one large shader built around an interpreter loop of up to 256
       instructions, every opcode's body inlined, took 7.55 s to its first draw
       through WebGL and FXC and 3.6 ms through WebGPU, in Chrome 153 on an RTX
       3080 (OneJS issue 130). Its shape is not this app's: 10 loops over
       masks in the source, about 28 once the helpers are inlined;
     - a wgpu project's DX12 startup took about 10 minutes when wgpu fell back
       to FXC, and seconds once DXC loaded (visloc-rs pull request 203, merged
       23 September 2026).
   - For, in the API: `createRenderPipelineAsync`, which the WebGPU
     specification prefers because it does not block the queue on pipeline
     compilation, and which Firefox resolves through its WebGPU child actor.
   - Against, the first two with Firefox slower than Chrome:
     - wgpu issue 7443 (opened 28 March 2025, still open): about 2 s of DXC in
       Firefox on an array-heavy shader, where a profile "suggests" much of it
       is alias analysis, and Chrome "is reported to be much better";
     - wgpu pull request 10314 (opened 12 September 2026, still open), about
       Firefox's cold starts being slower than Chrome's: the HLSL Firefox's
       translator writes to zero a compute shader's workgroup array took DXC
       1,855 ms, and 23 ms with the patch;
     - DXC issue 8958 (opened 24 September 2026), on an M4 Mac under macOS
       with DXC 1.9 and no browser: zeroing a large array by cast took 1.4 s
       at -O3, against 8 ms written as an explicit loop.
   - Against, possibly, in porting: by default DXC refuses an `[unroll]` loop
     whose trip count it cannot work out at compile time, where FXC compiles
     it. The app's code has no `[unroll]`, and nothing found says a WGSL port
     would emit one, so its relevance is not shown.
   - The cost: a port of the whole picture code to WGSL, whose size is not
     estimated here and which no source bears on; and WebGL kept for devices
     without WebGPU, on a
     separate canvas, since a canvas holds one context type (MDN). The
     research covered only Windows Chrome and Firefox and Safari 26.
11. **Open with the program without mask loops, build the full one behind
   it.**
   - **What the first picture would be:** the photograph with no mask's
     effect, since that program leaves out every mask-gated stage, until the
     full program is ready and the picture is drawn again.
   - In Chrome, ANGLE's source sends Direct3D 11 compiles and links to a thread
     pool once a page enables `KHR_parallel_shader_compile`. That the small
     program would keep drawing while the big one links is the researcher's
     inference; no ANGLE document states it.
   - In Firefox, which lacks that extension and reads the link result straight
     after linking in its own source, the researcher infers the page would wait
     for the full build anyway. The 2023 test below fits that: in Firefox on
     Windows 10 it found "all time is taken by" the link-status step. It timed
     batches of 10 and 50 large shaders and gives no time per shader, so how
     they compare with this app's one 43-second build is not known.
   - For, from the same kind of sources:
     - that 2023 test found that in Chrome on Windows 10, 10 shaders "seem to
       get processed nicely, almost as if extension worked perfectly (some DTs
       are slightly longer)";
     - a second project found Chrome links on worker threads, its GPU-process
       link call taking 0.2 ms or less; the page's ten link-status reads still
       waited 780 to 845 ms in all, because a read blocks until the link is
       done. Its reading is that the page blocks only because it asks for the
       status at once;
     - drawing with a general program while the specialised one builds is what
       Dolphin's and Godot 4.4's ubershaders do, the closest precedents found.
   - Against:
     - the same 2023 test found no browser kept a simple animation smooth while
       shaders compiled in the background, with gaps of a second or more in
       Chrome on Windows 10 at 50 shaders;
     - Godot says its WebGL 2 renderer lacks "the functionality to effectively
       implement ubershaders", and preloads there by drawing each material for
       a frame.
   - Chrome's Windows GPU watchdog is 30 s. The researcher's concern is a
     compile on the GPU main thread rather than a worker; whether it would fire
     here was not checked.
12. **The CPU path draws the first picture while the GPU builds.** `compileEdit`
   implements every stage. Two rates are measured: tiles take about 21 ms at
   260 px, and the full export took 46.8 s on one thread for a 20.9-megapixel
   raw (NOTES, 2.40). Scaled by pixel count alone, which is arithmetic and not a
   measurement, they put a 2800 by 1864 preview at roughly 2 to 12 seconds on
   one thread. Its time at preview size on the PC is not measured. No source found describes an editor
   using a CPU picture as a stand-in while its GPU code compiles. The nearest
   partial precedent: by default, a preference, darktable renders its small
   preview on the CPU while the GPU renders the main view, and it uses a
   cut-down pipe while some modules are in use; neither is described as a
   stand-in. The ubershaders under 11 draw
   with a general GPU program, not the CPU.

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
- **Running the picture code in software (asked 2026-09-30).** It builds fast
  headless because the container has no GPU and draws through SwiftShader. A
  page cannot ask for that: among the WebGL context attributes MDN lists,
  `failIfMajorPerformanceCaveat` only refuses a context "if the system
  performance is low or if no hardware GPU is available", and `powerPreference`
  is a hint about which GPU to prefer; none requests software. The reasoning
  that software would then pay at every draw, where the 43 s build is paid once
  per release that changes the picture code, is not measured here.
- **9 to 12 are not rejected and not chosen (2026-09-30).** They go to the
  owner as a decision.

## Rank

**Directly below 069.** Argued by what would be redone, not by severity. On
2026-09-30 option 8's two forms were measured short, and options 9 to 12 were
added from outside research; which route is built is the owner's, and the rank
does not move until then.

- **It invalidates nothing above it.** The sky work touches none of the update
  path, the precache or the start-up.
- **The one item above it has nothing to build yet.** The sky record has no
  option left and is being researched. The sky records ranked below this one
  (the rotation fix, the reader-visible sky selection, the round spots) share no
  ground with the update path either, so this record declares no relation to
  them; it goes above them because it can be built now and they are ranked
  behind the sky record's answer. Option 9, if chosen, would change how the
  mask-gated stages get their weights, the Sky and Foliage bands among them;
  that edge is declared when a route is chosen, not before.
- **Above 068.** 068's learned finder would download 23.5 MB of models on
  demand, and today anything fetched on demand outside the practice photos lands
  in the release's cache and is deleted at the next activate. 068 declares that
  it needs this.
- **What waiting costs.** Every release, and every staging push for a device
  pass, re-stores the whole app on every installed device, silently.
