# Build brief: a learned selection on the test page (step 444, 11 November 2026)

Written from R/build-ground.md (step 439's survey, every statement there carrying its file and line), the reading notes R/notes-device.md and R/notes-features.md, and the map folders' notes. Paths are under /home/user/Jefferson-Photography-Studio unless a line says otherwise. Nothing here proposes a layout or designs a control; the build plan places them.

## No method is chosen

Record 111 (docs/decisions/111-a-mask-is-judged-over-the-whole-photograph.md, written by this step) chooses no method: every entry met the result on 0 of the 22 frame-subjects judged, the 2.79 recipe among them. So there is no chosen method whose build this brief can describe. What follows is what a test-page build of any of the learned kinds measured would write and meet, since the survey found the same ground whichever model is taken (a runtime, a model file, a worker and the service worker's list), with each kind's own files and sizes beside it. The 2.79 recipe is already built (src/samplemask.ts, src/debug.ts, debug.html) and needs no runtime or model file.

## The files such a build would write

Certain, whichever learned model:
- `package.json`, changed: the runtime added under a `dependencies` key, which the file does not have today (survey section 2: devDependencies only, typescript and vite).
- `package-lock.json`, changed in the same commit, regenerated, since CI and the deploy run `npm ci` (survey section 2, `deploy.yml` line 63).
- A worker, `src/<name>.worker.ts`, new: loaded as every worker in the app is, `new Worker(new URL("./<file>.ts", import.meta.url), { type: "module" })` (survey section 3, five sites); with the WebGPU provider the library is imported inside the worker, since the runtime's proxy worker does not work with WebGPU (R/notes-device.md).
- A client module beside the worker, `src/<name>Client.ts` or the same code in `src/debug.ts`, new or changed: the shape the app uses for its decode and sky workers (`src/decodeClient.ts`, `src/skyClient.ts`, survey section 3).
- `src/debug.ts`, changed: the page's script, which holds `PlaceHeld`, `showSampler`, `sampleCount`, `maskStages`, `maskShow` and `maskTry` (survey section 4).
- `debug.html`, changed: the page's markup, the box `dSampleBox` and the mask parts `dMaskPics`, `dMaskList` and `dMaskTry` (survey section 5).
- `docs/ARCHITECTURE.md`, changed: every edit to a `src` file moves its line count in the module map, and a new `src` file adds a row, so `node tools/architecture-check.mjs --write` and the file staged (survey section 1).
- The model file, new: under `public/`, where it enters the service worker's shell list by default (survey section 3: `vite.config.ts` lines 435 to 465 have no size and no type test), or fetched at run time from elsewhere, where `public/sw.js` lines 712 to 741 cache it cache-first in the release cache. Which of the two is the build plan's.
- The runtime's WebAssembly binary, new under `dist` as Vite emits it from the package or copied under `public/`: it enters the shell list the same way.
- The model's licence and notice, new, shipped beside the model: Apache 2.0's section 4 asks that a copy of the licence and the notices travel with a redistributed work (R/notes-device.md, R/notes-features.md).
- `NOTES.md` and the decision record of the build, changed: the roadmap and the record.

Conditional, each on a choice the build plan makes:
- `vite.config.ts`, changed, if the model or the binary is kept out of the shell list (the shell is built by dropping named paths at lines 436 to 455; a new exclusion is a new line there).
- `public/sw.js`, changed, if the model is to sit in a stable cache that outlives a release, as the practice DNGs and stickers do (survey section 3, lines 42 to 48, 65 to 68).
- `public/_headers`, changed, if WebAssembly threads are wanted: they need the page cross-origin isolated (R/notes-device.md), and the headers set today hold no Cross-Origin-Embedder-Policy or Cross-Origin-Opener-Policy (survey section 3, `public/_headers` lines 7 to 15). A type rule for `.wasm` or `.onnx` was not checked by the survey.
- `src/placesurface.ts` or `src/placesurface.css`, changed, only if the layout of the sample loop is moved.

## The runtime and the model files against the host's limit

The host's limit for one file is 25 MiB, 26,214,400 bytes (R/notes-device.md). The build does not check it; it acts at the upload by wrangler (survey section 3).

- The runtime, onnxruntime-web (MIT), 1.31.1 on the registry, 150,622,959 bytes unpacked for the whole package. Its script bundles by its own readme's table: all 682 KB, default 434 KB, webgl 411 KB, webgpu 293 KB, wasm only 46 KB. Its WebAssembly binaries: the plain build 14.2 MB, under the limit, and the WebGPU builds 28.3 and 26.8 MB, over it, by the science file's figures of 25 September, which were not read again on 11 November.
- MobileSAM (the clicked kind's entry): image encoder 28,157,093 bytes, over the limit by 1,942,693; one-mask decoder 16,501,323, under. Apache 2.0 by its repository's licence; its ONNX copy's card says MIT.
- SlimSAM: encoder 23,276,014 and decoder 16,557,892 at full precision, both under; 12,170,657 and 8,550,118 in half precision; 8,882,165 and 4,903,810 quantized. Apache 2.0 by its card.
- DINOv2-small (the fitted kind's model): the 4-bit file run, 12,917,198 bytes, under; at Xenova the 8-bit file 22,393,453 and the quantized 24,451,943, under; the full file 88,459,888 and half precision 44,427,534, over. Apache 2.0 for the base model; neither ONNX copy's card names a licence of its own. The file run takes only 224 by 224, so a picture runs as 96 lapping tiles (R/maps-features/notes.md). Beside the model, a carried fit is 327,168 to 1,073,664 bytes of sample patches, or under 10,000 bytes without the rule for a patch unlike every sample (not run).
- BiSeNetV2 for ADE20K (the scene-class kind's model): 18,385,109 bytes as a PyTorch file, MIT; no ONNX file was read, so what the runtime would load is not known.

## Each gate of the survey that such a build meets

Commit gates, from `.branch-guard` (survey section 1):
- `tools/plan-scope-check.mjs`: every changed file covered by a line of the approved plan; `.plan-scope` staged last.
- `tools/typecheck.mjs`: the new `src` modules compile under strict flags with `types: []`, so the runtime's types arrive only through its import, and a type import is written `import type`.
- `tools/preview-version-check.mjs`: untouched while the build stays on the test page and off `src/pipeline.ts`, `src/tile.ts`, `src/skyfine.ts` and the rest of its list.
- `tools/manifest-shots-check.mjs`: untouched; a new asset or worker is not named in a manifest.
- `tools/hub-surface-gates.mjs`: a placeholder or `data-example` on the page declared in `.example-allow`; no set-apart quotation undeclared; no table in tracked markdown.
- `tools/notes-check.mjs` and `tools/roadmap-copy-check.mjs`: the build's roadmap bullet parses and carries a Shown as line.
- `tools/token-check.mjs`: a new style uses defined tokens; a new `.js` under `public` is walked, a `.wasm` or `.onnx` is not.
- `tools/palette-spec-check.mjs`: only if `public/palette.css` changes.
- `tools/contract-check.mjs`: every exported function of the new modules carries its contract block.
- `tools/architecture-check.mjs`: the module map rewritten and staged; each new `src` file opens with a comment of at least 20 characters.
- `tools/decisions-check.mjs`: the build's record and its roadmap bullet.
- `tools/scope-check.mjs`: untouched while no `EditParams` field is added.
- `tools/stamp-check.mjs`: untouched; it reads `src/main.ts`.
- `tools/one-pool-check.mjs` and `tools/pool-budget-check.mjs`: a new worker that does not call `workerCount` is outside them; one that does trips one-pool.
- `tools/patch-note-check.mjs`: `debug.html`, `src/*.ts`, `package.json` and `package-lock.json` are reader-facing paths, so the commit's subject opens New, Fixed, Faster or Changed and shows in the in-app patch notes.
- `tools/openable-check.mjs`: untouched; the test page's own picker is not among its places.
- The lens, join, shadow, keep-file and mask-turn checks: untouched unless their exports change.

CI and the deploy (survey section 1):
- `.github/workflows/gates.yml`: the hub's shared gates with `pwa: true`, so the service worker's update behaviour is held by the hub's pwa check; `debug.html` and `src/style.css` are in the text-size list, so no fixed pixel font size.
- `.github/workflows/deploy.yml`: `npm ci`, then `npm run build`, then wrangler deploys `dist`; the host's limit for one file acts there.
- `tools/offline-shell-walk.mjs` (not a commit gate): it requires exactly one chunk named `debug-<hash>.js` in `dist/assets`, so a new chunk whose name starts `debug-` breaks its count.

## The page's layout as it stands (the survey's part 5, carried whole)

The order a press meets, from `debug.html` (line numbers there), then the parts the script adds. The page is one `main.dbg-wrap` (line 33).

1. The update strip, hidden until needed (28 to 32), above `main`. Words: "A new version of this app is ready." with "Update now" and "Not now".
2. The back link "Back to Infrared" (34); the heading "Test page" (35); the lead (36 to 41).
3. Section "Diagnostic report" (43 to 50): the note, the button "Copy the report" (`dCopy`), a read-only text box labelled "Diagnostic report" (`dText`, 16 rows).
4. Section "Speed" (52 to 65): the note; the buttons "Run the speed tests" (`dRun`), "Reading one photo out of a big session" (`dBigRead`), "What makes the picture code slow to build" (`dSlowBuild`), and the hidden "Copy the results" (`dCopyAll`); the live list `dResults`.
5. Section "Picture checks" (67 to 155), which holds everything for samples and masks. In order:
   - the note (69 to 77) and the label and file box "A photograph of yours to run the checks on, instead of the practice photograph (optional)" (`dPicFile`, 79 to 81), and its status note (82);
   - the buttons "Run the picture checks" (`dPictures`) and "Copy the picture checks" (`dPicCopy`) (83 to 86), a note on the copy (87);
   - the progress line `dPicProgress` (88) and the list `dPicResults` (89), the page's single list of result rows and copy block for these checks;
   - the sub-heading "Separation check" (91) and its long note (92 to 109);
   - the three buttons "Separation check, step 1: draw the photograph" (`dSepStart`), "step 3: make the three white points and the clusters" (`dSepGo`, disabled) and "sweep: count the photograph across white balances and channel remaps" (`dSepSweep`, disabled) (110 to 114);
   - the fieldset "Step 2: what a tap on the picture sets" with two radios (115 to 119) and four number boxes for the neutral and the foliage spot (120 to 125);
   - the hint line `dSepHint` (126);
   - `dSepPics` (127), which step 1 fills with the drawn photograph to tap (`src/debug.ts` lines 4747 to 4753) and step 3 with further pictures (line 4809), and `dPlacePics` (128), which `placesPart` fills with the selection pictures of the places (line 3909);
   - the box `dSampleBox` (129 to 154): the sub-heading "Name regions by samples" (130), its note (131 to 137), `dSampleSurface` (138), the button "Count the samples" (`dSampleCount`, disabled until a photograph is drawn, 139 to 141), the hint `dSampleHint` (142), `dSamplePics` (143), the sub-heading "Masks made from the samples" (144), its note (145 to 150), `dMaskPics` (151), `dMaskList` (152), `dMaskTry` (153).
6. Section "Measure a lens" (157 to 168): a note and the link "Measure your lens" to `ir.html?lens=1`.

What `dSampleSurface` holds once step 1 has run (`src/debug.ts` `showSampler` lines 4084 to 4115, `src/placesurface.ts` lines 156 to 279): a second copy of the thinned photograph (a figure at most 48rem wide, line 4096), and under it the surface's root, which holds in order a live status line, an overlay that is the area a tap lands on (positioned over the photograph by `layout`, lines 288 to 297), a magnified view (hidden until a marker stands), and a panel of six groups in this order (line 277): "Place and move the marker" (a button "Place a marker in the middle" and Left, Right, Up, Down; lines 200 to 209), "Size of the sample" (Smaller, a slider labelled "Sample size", Larger; 211 to 226), "Name of the sample" (a row of name buttons built from the four names, line 372 to 376; a text box "Another name" with "Use this name"; a line saying which name is chosen; 228 to 242), "Tap allowance" (a select of 8, 16 or 32 pixels; 244 to 258), "Keep or drop the marker" (Cancel and Confirm, with a line saying what Confirm needs; 260 to 269) and "Kept samples" (a list with a remove button for each sample and a count line; 271 to 275).

The repeated loop on the page is: choose a name, tap the photograph, confirm. Where each of the three controls sits, by that structure:
- the photograph (the overlay a tap lands on) is above the panel;
- the name buttons are the third group of the panel;
- Confirm is the fifth group of the panel.
Parts that lie between them, counted as groups or figures in the order above: between the photograph and the name buttons there are two groups ("Place and move the marker", "Size of the sample"); between the name buttons and Confirm there is one ("Tap allowance"); between the photograph and Confirm there are four groups (the two above, the name group and "Tap allowance"). Whether a person must scroll between them on a given device was not measured; the figure is at most 48rem wide (`src/debug.ts` line 4096) and the panel's height was not measured here.

Where the results of a count sit against the work that follows them:
- The rows the count writes, with the numbers, go to the list `dPicResults`: `sepPress` takes `const list = $("dPicResults")` at `src/debug.ts` line 4613 and sets `rowsInto = list` at line 4622. That list (`debug.html` line 89) is above the sub-heading "Separation check" (line 91), so every figure the count prints is above the photograph, the surface and the button that made it. The progress line `dPicProgress` (line 88) is also above them; `progress()` writes there (line 2469).
- The text under the button, `dSampleHint` (line 142), carries the one-line outcome (`src/debug.ts` lines 4207, 4517, 4529, 4586).
- The selection pictures ("What each selection takes", one per selection) are drawn into `dSamplePics` (`sampleCount`, lines 4129 to 4204), which sits directly under the count button and above the sub-heading "Masks made from the samples". So the pictures of the first half of the work lie between the second half and the surface.
- The mask pictures are drawn into `dMaskPics` (line 4379), the kept recipes and their "Try" buttons into `dMaskList` (4454), and a tried recipe's pictures and its "Keep" button into `dMaskTry` (4506). These three lie after `dSamplePics` in that order.

Parts a person passes to get from the photograph to the second half of the work (the sub-heading "Masks made from the samples", `debug.html` line 144): the surface's panel (six groups), the "Count the samples" button, its hint line, and `dSamplePics` with its heading and one picture for each selection, then the second half's own note (145 to 150). Counted that way, that is the panel's six groups, one button, one hint and the selection pictures, before the heading of the second half. The number of selection pictures is the number of fitted selections (`rep.masks`, `src/debug.ts` line 4200) and varies with the names placed.

Other facts about the layout that the survey read and that bear on a build: inline styles in the page set sizes in `rem` or `px` for borders and gaps; a font size set in `px` fails the CI text-size gate (section 1), and the page's own inline sizes read were `rem` (`debug.html` lines 91, 121 to 124; `src/debug.ts` lines 4197, 4437, 4534, 4553). Buttons on the page are 44px tall by `style="min-height:44px"` in several places (`debug.html` lines 81, 117, 118; `src/debug.ts` lines 4479, 4571). Live regions: `dResults`, `dPicResults`, `dPicProgress`, `dSepHint`, `dSampleHint` and `dPicFileNote` carry `role="status"` and `aria-live="polite"`.

## What this brief cannot show

- Which model a build would carry: none is chosen.
- How fast or in how much memory a tablet's browser runs any of these files, or whether it runs the WebGPU build at version 26; the sources disagree and only the test page settles it.
- Each current WebAssembly binary's size, not listed on 11 November.
- What the host does with a `.wasm` or `.onnx` file's content type; the survey did not check it.
- The bodies of the checks the survey read only by their headers (survey, opening paragraph).
