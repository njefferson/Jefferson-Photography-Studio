# 086 · On Firefox the practice photographs stay empty while the editor builds

## Context

**The report, the evening of 2026-09-30, Pacific.** On the PC (Firefox 157, a
GTX 980 through Direct3D), on staging v2.64.35, the editor's start card showed
every practice photograph's tile as an empty box carrying only its name. The pictures
came as soon as the editor was ready, which on that PC is about 44 seconds. In
that browser the build holds the page at every load, a return from the test
page included (071, Context, corrected 2026-09-30), so by the same code path
the tiles stay empty at every load.

**What the code does, read 2026-09-30.**
- Each tile is a plain `<img loading="lazy">`, made by `makeTile` in
  `src/main.ts` while the module first runs. Its picture is a small JPEG under
  `examples/`, which the offline worker keeps in `ips-examples-v1` after the
  first fetch, and which a release does not delete. Nothing in the tile's path
  waits for the editor.
- The renderer is made earlier in the same module. When the launch expects a
  slow build, as it does on that PC, `beforeBuild` in `src/main.ts` asks for
  two animation frames so the start screen paints first; the build then starts
  (`Renderer.build` in `src/gl.ts`), and one more frame passes before its
  link-status read.
- Firefox offers no `KHR_parallel_shader_compile`, the only way the editor as
  built has to build off the page, so the link-status read in
  `Renderer.build` holds the page's main thread for the whole build. The PC's
  reading of 2026-09-26 recorded the longest pause at 44.10 s.
- So the tiles exist about three frames before the hold. Nothing in the code
  holds them back; the page itself is held.

**No check covers it.** No walk asserts that the practice tiles show
pictures. `tools/build-wait-walk.mjs` models this browser's held build; it
checks that the preparing words are painted before the hold and that the
report admits the wait, and nothing about the tiles.

## Looked up

One research pass, web only, with every claim checked against its source by a
second reader (2026-09-30).

- **Refused by this container's network** (the proxy answered the connection
  with 403): html.spec.whatwg.org, developer.chrome.com, www.chromium.org,
  chromium.googlesource.com, bugzilla.mozilla.org,
  firefox-source-docs.mozilla.org, hacks.mozilla.org, mozillagfx.wordpress.com,
  gfx.mozilla.org, searchfox.org, w3c.github.io, wicg.github.io,
  registry.khronos.org, webkit.org and docs.google.com. The HTML Standard and
  the Khronos extension were read from their sources on GitHub, and the
  Intersection Observer specification at www.w3.org/TR, instead.
- **Refused by this session's repository gate**, not the network: github.com
  and api.github.com answered that access to the repository is not enabled
  for this session. raw.githubusercontent.com answered.
- **No answer recorded:** web-platform-dx.github.io, fossies.org and
  toji.github.io returned no HTTP status, and the error was not captured.

- **A held main thread draws nothing new.** In the HTML Standard a task runs
  to completion before the event loop chooses another, and "update the
  rendering" is itself a task, queued on the rendering task source. An
  `<img>`'s image data reaches presentation through tasks on the networking
  task source of the page's own event loop. That no new frame and no newly
  arrived picture can be presented while one task holds the loop is the
  researcher's conclusion from those steps.
- **Firefox.** Gecko decodes on a pool of threads, but a decoder's progress is
  dispatched to the main thread (`DecodePool.h`, `IDecodingTask`). Under
  WebRender, a frame WebRender has not yet drawn is repainted by a main-thread
  paint that rebuilds the display list (`WebRenderUserData`,
  `nsImageFrame::InvalidateSelf`). A display list already sent can be
  composited while the content thread is held; new image content cannot. That
  last step is inference from Gecko's rendering overview.
- **Chromium, for contrast.** Images decode in raster tasks on worker threads,
  but content reaches the compositor only through a commit the main thread
  makes (Chromium's `how_cc_works.md`). That only content already committed
  can then be finished without the main thread is the researcher's inference.
- **`loading="lazy"` delays the fetch itself.** The standard stops a lazy
  image's loading before the fetch and hands the element to the document's
  lazy-load IntersectionObserver. The fetch resumes from that observer's
  callback, which runs as a task after the intersection step of a rendering
  update. Firefox's lazy-load margin is 600 on each side (its preference
  file). web.dev advises loading images in the first view eagerly, because
  lazy ones wait for layout. So in the three frames before the hold, the chain
  from layout through the observer's task, the fetch and its tasks to a
  painted picture has little or no time; that is the researcher's inference
  from the steps, made for two frames.
- **The offline worker does not help on its own.** It answers on a thread of
  its own (MDN), but the page takes up the answer through fetch tasks queued on
  the page's event loop (Fetch Standard), so the hold blocks it the same way.
- **`decode()`** waits until the image is completely available, decodes it, and
  resolves in a queued task; it does not start a lazy image's fetch. It
  promises that the decoded data stays available through the next rendering
  update, so that it can be paired with `requestAnimationFrame`. It promises
  no paint (the standard; MDN).
  - No source found says that awaiting `decode()` and then two animation
    frames puts the picture on screen before a following long task. That is
    inference from the event loop's steps, and it has to be measured.
- **Yielding.** `setTimeout` inside `requestAnimationFrame` defers work until
  after the next frame (web.dev). The standard lets a browser skip a rendering
  update between tasks, so a bare `setTimeout` does not promise one. None of
  these splits a single call into the driver.
- **Off the main thread.** WebGL2 on an `OffscreenCanvas` in a worker is in
  Firefox from 105 (MDN's data), and a busy main thread does not affect a
  worker's rendering (web.dev). The canvas must be handed over before any
  context is made on it (MDN). That the 44-second wait would then hold the
  worker rather than the page is inference, not measured.
  `KHR_parallel_shader_compile` is not in Firefox (MDN's data; Firefox's own
  list of WebGL extensions).

## Weighed against

- **071, the build itself.** The hold is 071's 44-second build. A route chosen
  there that shortens it or takes it off the page shrinks or removes this
  defect. That route is the owner's choice and is not made. This record is the
  part a reader sees on the start card, which can be put right without
  choosing it.
- **060, the start card as a noticeboard.** The same card, and among its
  checks whether the first practice photograph shows whole on the iPad: the
  layout, not whether the picture arrives.
- **033, the wait before the first thumbnail on the Quick look sheet.**
  Another set of small pictures that sat empty, made from the reader's own
  files after they are picked; not the practice tiles.
- **NOTES, "The first reading, 2026-09-26, a PC in Firefox 156":** the 44.10 s
  pause, and that this Firefox pays the build at every start.

## Depends

- touches 071 — the hold is 071's build; a route there that shortens it or moves it off the page shrinks or removes this, and a change here to when the build starts moves the start time on 071's Start-up line, not the build's length.
- distinct-from 060 — both are about the start card's practice photographs; 060 is whether the first one shows whole, this is whether their pictures arrive.
- distinct-from 033 — both are small pictures that sit empty while something else runs; 033's are the Quick look sheet's, made from the reader's own files.

## Options

1. **Chosen: the tiles in view arrive and paint before the build is let go,
   and only where the build will hold the page.**
   - The tiles in the first view load eagerly; the rest stay lazy.
   - `beforeBuild` already learns whether the browser can build off the page,
     and, when the launch expects a slow build, already waits two frames so
     the preparing words paint. Where it
     cannot, it also waits for those tiles' `decode()` and then two animation
     frames before it lets the build start.
   - A wait with a ceiling, so a picture that never comes cannot hold the
     editor. The ceiling is stated and argued in the plan that builds it, not
     tuned here.
   - Where the browser builds off the page, nothing changes.
   - **Its check, which the next plan carries.** In `build-wait-walk.mjs`'s
     model of a browser that holds the page, the visible tiles' pictures must
     be painted on the card before the hold starts: their images complete and
     a screenshot taken during the hold showing them. It must fail on today's
     build first. Then one load on the PC in Firefox, since no source promises
     the paint (Looked up).
   - **What it costs.** On that browser the build starts later by the time to
     read and decode a few small JPEGs, which the device already holds.
2. Wait for 071's route.
3. Build the editor in a worker, on an `OffscreenCanvas`.
4. Say on each empty tile that its picture comes when the editor is ready.

## Rejected

- **2, wait for 071.** Its route is the owner's and is not chosen, and the
  card is empty at every load on the PC meanwhile. Option 1 does no harm once
  a route there removes the hold.
- **3, the editor in a worker.** It would take the hold off the page for
  everything, not only the tiles, but it moves the whole renderer and is a
  route for 071's build, not a fix for the tiles. It belongs with 071's
  options, and its central claim, that the wait would then hold only the
  worker, is not measured.
- **4, words on the tile.** It tells the reader about a wait option 1 aims to
  avoid for the pictures the device already holds.

## Rank

**Directly below 071, which it touches.** Argued by dependency: nothing ranked
above it would be redone once it is fixed, and it changes nothing they build
on: waiting for the tiles moves when the build starts, and 071's readings of
the build's length are timed from the build's own start. It sits beside 071 because both are the start-up path on the same device,
and a route chosen there may remove this defect altogether. It can still be
built first: nothing 071 chooses later would undo it.
