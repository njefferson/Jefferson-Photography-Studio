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
     cache can answer, three runs with the median and spread, then one warm
     run, and whether parallel compile is available. One launch after the next
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
   - **Two questions only the owner can settle, asked 2026-09-26:** whether a
     waiting version that is the same as the page on screen takes over without a
     press, and whether a new reader gets the stickers one at a time with a
     "keep all" button and small previews, or all at once in the background.
2. Build the redesign now.
3. Words only: say a download is running, change nothing about it.
4. Take the stickers out of the precache and change nothing else.
5. One cache for every release, keyed by revision, as Workbox does.
6. Compile the picture code without blocking (parallel compile, polled), with a
   sentence on screen while it compiles.
7. Leave it.

## Rejected

- **2, the redesign now.** The minute's cause is not established, and the
  measurement is one release away; a redesign judged against the wrong cause
  ships its own risks (the six holes listed under 1) for a symptom it may not
  touch.
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
  becomes usable on every device.
- **7, leave it.** Two live defects can break an install or delete a newer one,
  and the reader is told nothing either way.

## Rank

**Second, directly below 069.** Argued by what would be redone, not by severity.

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
