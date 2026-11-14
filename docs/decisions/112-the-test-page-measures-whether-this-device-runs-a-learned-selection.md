# 112 · The test page measures whether this device runs a learned selection

## Context

**The goal.** A press on the test page says whether this device can run a learned selection, and how fast: whether the browser loads the runtime and runs an encoder and a decoder at all, how long each takes, and what the browser offers, so that whether any learned route exists on the device is known from the device and not guessed.

What this record settles. A measure of the device, and nothing else: one press on the test page that says whether the browser the person is holding loads and runs a learned model's image encoder and decoder, how long each takes and what the browser reports of memory. It draws no mask and offers no selection. Record 111 holds any method off the page until a method meets the bar, and this press is a measure of the device that record holds apart from any method.

Why it is the next thing. Record 111 found no mask method meeting the bar, and nothing in the research folder measures the tablet: every speed figure read is from a server, a desktop or a phone chip, and the sources disagree on whether the tablet's browser offers WebGPU. Whether a learned route exists on the device is settled on the device.

What the press loads, runs and prints. It loads ONNX Runtime Web 1.31.1, its WebAssembly build only (`ort-wasm-simd-threaded.wasm`, 14,848,852 bytes, with its `.mjs` loader), served from this app's own site under `/ort/`. It loads MobileSAM's image encoder, 28,157,093 bytes, which is over the host's limit of 26,214,400 bytes for one file, so it is served as two parts of 14,080,000 and 14,077,093 bytes from `/models/mobilesam/` and joined in the page, the join checked against the manifest's length and sha256; and MobileSAM's one-mask decoder, 16,501,323 bytes, from the same folder. A module worker (`src/learned.worker.ts`) runs one thread, off the page's thread. The encoder runs three times on a planted picture, the test page's practice photograph as the page already draws it, resized to 1,024 pixels on the long side, each run followed by one decoder run with one point at the picture's centre. The rows printed, in the Speed list's own shape: whether the runtime loaded and how long it took; each file's size and fetch time; the encoder's three times and their median; the decoder's three times and their median; memory where the browser reports it, else "not reported"; what the browser offers (cores, cross-origin isolation and so threads, SharedArrayBuffer, WebAssembly SIMD, whether `navigator.gpu` exists and whether an adapter answers); and, through the existing "Copy the results" button, the device facts the diagnostic report already carries. The decoder session is created first and carries the runtime's start-up, and its row says so. A note beside the button says that the first press fetches about 60 MB from this site and keeps it on the device.

**Measured on the tablet (13 November 2026).** The press was made on an iPad, Safari 27.2, running as an installed app, on the staging site at 2.80, commit c952bb0bbddbb2099b1a48686787f3265cd2d5a1, at 20:16 California time (the report's own stamp, 2026-11-14T04:16:54Z). The figures are as the device printed them. The device has 4 cores, reports no memory hint, and has an Apple GPU with a maximum texture of 16,384 pixels and float buffers. It offered: not cross-origin isolated, shared memory no, WebAssembly SIMD yes; WebGPU offered, and an adapter answered (an Apple adapter). Fetches from the staging site over the device's connection: the runtime's WebAssembly file, 14.2 MB, in 1,896 ms; manifest.json in 92 ms; encoder part 00, 13.4 MB, in 1,329 ms; encoder part 01, 13.4 MB, in 1,297 ms; the decoder, 15.7 MB, in 1,672 ms. Joining the encoder's parts took 46 ms, with size and digest matching. Loading the runtime and the decoder session took 528 ms; loading the encoder session took 138 ms. The encoder, on the 1,024 by 682 practice picture, ran three times in 2,387, 2,400 and 2,445 ms, median 2,400 ms. The decoder ran three times in 129, 119 and 123 ms, median 123 ms. The outputs were embeddings of 1x256x64x64 and a mask of 1x1x682x1024. Memory was not reported. The page's own verdict row read: yes, the encoder ran in 2,400 ms and the decoder in 123 ms. For comparison, the container's press (headless Chromium on a server's processor) gave the encoder a median of 4,731 ms and the decoder 230 ms.

What it shows, and no more. The tablet's browser loads the runtime and runs MobileSAM's encoder and decoder on one WebAssembly thread. One encode of a 1,024-pixel picture takes about 2.4 s and one decode about 0.12 s, so an encode once per photograph with a decode per click is within reach on this device, as the one editor read (darktable) does it. The files, about 60 MB, took about 6.3 s to fetch the first time and are kept by the device. Two things the figures leave open. WebGPU is offered with an adapter, and running the model on it is unmeasured: its runtime binary is 29.5 MB, over the host's limit, and a binary joined from parts is unread. Threads are absent because the app sends no cross-origin isolation headers, and four cores are there. Memory is not reported by this browser, so that part of the question is unanswered by the page and would need another instrument. The figures choose no method and no next step.

Nothing in the app contacts any site but its own. The service worker's install list carries none of these files: the shell list excludes `ort/` and `models/`, the files are fetched on the press and kept by the existing run-time route, and the build resolves the runtime's import under the package's own condition `onnxruntime-web-use-extern-wasm`, so that Vite emits no second copy of the binary into the asset folder and so into the install list. The licence and notice texts of the runtime (MIT) and of MobileSAM (Apache 2.0, with the ONNX copy's card stating MIT) sit beside the files.

## Looked up

By reference to the research folder, `docs/research/2026-11-masks/`: `notes/notes-device.md` (what a device can run, with sources and speeds), `notes/build-ground.md` (what putting a model on the test page meets in the app: the build, the service worker, the host limits, the layout) and `notes/build-brief.md` (the build brief). The runtime's own pages and file listing were read for this piece by the step that added the files, and the registry's file list of onnxruntime-web 1.31.1 was read as the step was scoped; the package's export map was read by the step that built the worker, which found the condition named above.

What they gave. The runtime's WebAssembly build fits the host's limit and its WebGPU build, 29.5 MB, does not. The encoder is over the limit by 1,942,693 bytes and ships in two parts joined in the page. WebAssembly threads need the page to be cross-origin isolated, which the app's headers do not ask for, so the runtime runs on one thread here. The runtime's own tables give Safari on iOS WebAssembly yes and WebGPU no; WebKit's post of 9 June 2025 and the caniuse data give WebGPU yes from Safari 26. The sources disagree, and only a press on the device settles it. Safari reports no memory figure to a page, so those rows will read "not reported" on the tablet.

Not read, so nothing here rests on them: whether the runtime loads a WebGPU binary from parts joined in the page; how long the encoder takes on any tablet.

## Weighed against

- **Record 111.** It holds any method off the test page until its masks meet the bar over whole photographs. This press draws no mask and offers no selection, so it is inside that hold. That also answers the queue key that asked which stands, the handoff's second item or 111's hold: 111's hold stands, and this press is not the second item.
- **Record 006, the mask by subject.** It has waited on a reading of what a browser on a device can run, and its Looked up says that whether an iPad runs any of the models, and how fast, is still unmeasured and is the test page's to take. This press is that measure.
- **The handoff's first item.** The tablet's measure: whether the tablet's browser loads and runs an encoder, how fast and in how much memory. This record is that item, scoped by the reads named in Looked up.
- **Done before on this ground.** The Speed presses on the test page, whose row shape and guard against a press that never ends this one follows; the test page's own draw of its practice photograph, used for the planted picture so that no second photograph is fetched.

## Options

1. **The press as built. Chosen.** WebAssembly, one thread, MobileSAM's two files from the app's own site, the encoder in two parts joined in the page, a worker off the page's thread, three runs and a median, no mask drawn. What it costs: about 60 MB of binary files in the repository's history, which a revert does not remove; about 60 MB downloaded on the reader's first press; the one-thread time, which is the slow case. The measure is taken: on the tablet the encoder's median was 2,400 ms and the decoder's 123 ms on one thread (see Measured on the tablet in the Context).
2. **Fetch the model from the model's host on the press.** Not chosen; see Rejected.
3. **Run WebGPU in this piece.** Not chosen; see Rejected.
4. **Send cross-origin isolation headers so the runtime uses threads.** Not chosen; see Rejected.
5. **SlimSAM as the model.** Not chosen; see Rejected.
6. **Measure in the container.** Not chosen; see Rejected.

## Rejected

- **Fetching the model from Hugging Face on the press.** The app would contact a third party, which its posture of free, on-device and offline-first with no account does not allow; the files are served from the app's own site instead.
- **Running WebGPU in this piece.** The runtime's WebGPU binary is 29.5 MB, over the host's limit for one file, and whether the runtime loads a binary from parts joined in the page is unread. The press reports whether `navigator.gpu` exists and whether an adapter answers, and does not run on it. If the WebAssembly figures are too slow, running it is the next piece.
- **Cross-origin isolation headers for threads.** They touch every page and the practice-file fetches, and the press does not need them to answer whether an encoder runs; the one-thread time is the honest lower bound.
- **SlimSAM as the model.** Both its files fit the host's limit, but MobileSAM is the entry nearest the bar in record 111 and its encoder, over the limit, exercises the two-part route, which is the unread part.
- **Measuring in the container.** The container draws through a software renderer on a server's processor, which says nothing of the tablet. The container's run proves only that the press works from end to end; the figures that matter are the tablet's.

## Rank

Directly under 111, by the dependency test: what the items ranked above it would have to redo, and what the items below it wait on. Nothing above it waits on it, and it changes no drawn pixel and no control of the editor. Record 006, and anything built later on a learned selection, waits on what it measures, so it sits above them; and record 111 holds every method off the page, which a measure of the device is not. The rank is the dependency's, not the request's.

## Looked at

No photograph is named by this record and no rendering was judged: the press prints figures and draws nothing, so there was no picture to open.

## Depends

- touches 006 — the reading 006 waited on, whether a browser on a device runs a model and how fast, is what this press measures; the figures it gives change what 006 is worth.
- touches 111 — 111 holds every method off the test page until it meets the bar; this press is a measure of the device that the hold leaves alone, and the figures it prints bear on which routes 111's next piece can use.
- distinct-from 110 — the mask made from samples is a method; this press measures a device, draws no mask and uses none of 110's counts.
