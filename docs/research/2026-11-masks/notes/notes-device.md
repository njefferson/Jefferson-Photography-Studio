# What runs in a browser on a device for a learned selection: readings for record 006

Fetched on 11 November 2026 (California) by step 424's own fetcher, scratch/step424-fetch.mjs, to disk under research/whole/pages-device. Sizes are written with commas so each figure can be checked against the listing named beside it. A limit of 25 MiB for one file is 26,214,400 bytes. Where a figure comes from the science file's section of 25 September and was not read again on a page this send, it says so.

## Entries, one for each page asked

State words: read whole (every line read with the Read tool), read in part (what was not read is named), refused, not found, needs script.

- onnxruntime.ai, "Web | onnxruntime", /docs/tutorials/web/ , Microsoft's runtime documentation, no date on the page. Read whole.
- onnxruntime.ai, "The 'env' Flags and Session Options", /docs/tutorials/web/env-flags-and-session-options.html . Read whole.
- onnxruntime.ai, "Working with Large Models", /docs/tutorials/web/large-models.html . Read whole.
- onnxruntime.ai, "Deploying ONNX Runtime Web", /docs/tutorials/web/deploy.html . Read whole.
- onnxruntime.ai, "Using WebGPU", /docs/tutorials/web/ep-webgpu.html . Read whole.
- onnxruntime.ai, "Performance Diagnosis", /docs/tutorials/web/performance-diagnosis.html . Read whole.
- onnxruntime.ai, "Build a web app with ONNX Runtime", /docs/tutorials/web/build-web-app.html . Read whole.
- onnxruntime.ai, "Web | onnxruntime" (get started), /docs/get-started/with-javascript/web.html . Read whole.
- github.com/microsoft/onnxruntime/releases . Refused: the reply was the session's own access notice, first line "GitHub access to this repository is not enabled for this session." Not read. Two further github.com pages of the same repository (js/README.md and js/web/README.md) were asked the same way and refused; the same two files were then read whole at raw.githubusercontent.com.
- www.npmjs.com/package/onnxruntime-web . Refused: a challenge page titled "Just a moment..." that asks for script and cookies. Not read; the registry at registry.npmjs.org answered in its place.
- raw.githubusercontent.com/microsoft/onnxruntime/main/LICENSE , MIT licence, copyright Microsoft Corporation. Read whole.
- raw.githubusercontent.com/microsoft/onnxruntime/main/js/web/README.md . Read whole.
- raw.githubusercontent.com/microsoft/onnxruntime/main/js/README.md . Read whole (about 460 lines).
- raw.githubusercontent.com/microsoft/onnxruntime/main/js/web/package.json . Read whole. It names version 1.33.0 on the main branch, a different number from the registry's latest.
- raw.githubusercontent.com/microsoft/onnxruntime-inference-examples/main/js/segment-anything-webgpu/README.md . Not found (404).
- registry.npmjs.org/onnxruntime-web/latest , npm registry data, no date on the reply. Read whole.
- registry.npmjs.org/@huggingface/transformers/latest . Read whole.
- registry.npmjs.org/@tensorflow/tfjs/latest . Read whole.
- data.jsdelivr.com package listing, cdn.jsdelivr.net (three files), unpkg.com listing: refused with the network's own tunnel failure, response 403. Not read.
- developer.apple.com, "Safari 26.0 Release Notes". Reached, and the body is a notice that the page needs script; the release notes were not read.
- webkit.org/blog/16993, "News from WWDC25: WebKit in Safari 26 beta", 9 June 2025, by the WebKit team. Read whole.
- webkit.org/blog/ , the blog's front list. Read whole. It lists Safari 27.0, 27.1 and 27.2 feature posts and a 27.3 beta, so the line for the tablet's browser being version 26 is the editor's test page and not this list.
- caniuse.com/webgpu, /wasm-simd, /sharedarraybuffer: refused (403). The same three data files were read at raw.githubusercontent.com/Fyrd/caniuse/main/features-json/ , the publisher's repository: webgpu.json read whole; wasm-simd.json lines 1 to 439 and 440 to the end read; sharedarraybuffer.json read whole.
- raw.githubusercontent.com facebookresearch/segment-anything README.md read whole; LICENSE read whole, Apache License 2.0.
- raw.githubusercontent.com facebookresearch/sam2 README.md read whole; LICENSE: head matched by Grep and the file's line numbers for its terms, appendix and notice lines are identical to the file read whole above (lines 69, 192, 194); the middle was not read line by line.
- raw.githubusercontent.com ChaoningZhang/MobileSAM README.md read whole; LICENSE checked the same way as the one above (not read line by line).
- raw.githubusercontent.com yformer/EfficientSAM README.md read whole; LICENSE checked the same way.
- raw.githubusercontent.com mit-han-lab/efficientvit README.md read whole; LICENSE checked the same way, its notice line reads "Copyright [2023] [Han Cai]".
- raw.githubusercontent.com CoinCheung/BiSeNet README.md read whole; LICENSE read whole, MIT, copyright 2018 CoinCheung.
- raw.githubusercontent.com xiongzhu666/Sky-Segmentation-and-Post-processing README.md read whole; LICENSE read whole, MIT, copyright 2021 xiongzhu666.
- raw.githubusercontent.com PaddlePaddle/PaddleSeg release/2.9 LICENSE: Apache 2.0, checked the same way as the others (not read line by line).
- huggingface.co/Xenova/slimsam-77-uniform , model page. Read whole.
- huggingface.co/api/models/Xenova/slimsam-77-uniform/tree/main and tree/main/onnx , file listings with sizes. Read whole.
- huggingface.co/mit-han-lab/efficientvit-sam , model page, and its raw README. Read whole.
- huggingface.co/api/models/mit-han-lab/efficientvit-sam/tree/main and tree/main/onnx . Read whole.
- huggingface.co/onnx-community/sam2-hiera-tiny-ONNX , model page: "No model card". Read whole. Its raw README: not found.
- huggingface.co/api/models/onnx-community/sam2-hiera-tiny-ONNX/tree/main and tree/main/onnx . Read whole.
- huggingface.co/api/models/Acly/MobileSAM , /tree/main , and the raw README. Read whole.
- huggingface.co/api/models/ChaoningZhang/MobileSAM/tree/main : 401, "Invalid username or password." Not read.
- huggingface.co/nvidia/segformer-b0-finetuned-ade-512-512 , model page. Read whole.

Hosts that did not answer this send: github.com (the session's access notice), www.npmjs.com (challenge page), data.jsdelivr.com, cdn.jsdelivr.net, unpkg.com and caniuse.com (tunnel failure, 403). The release command was not run: no call was refused by the reply guard this send.

## Runtimes

### onnxruntime-web (Microsoft, MIT)
- Licence: the registry data and the repository's LICENSE both say MIT.
- Latest on the registry: 1.31.1, 511 files, unpacked size 150,622,959 bytes for the whole package. The package's export map names these builds: the default bundle, "all", "wasm", "webgl", "webgpu" and "jspi", each as a script file, and four WebAssembly binary names: ort-wasm-simd-threaded.wasm, .jsep.wasm, .jspi.wasm and .asyncify.wasm. The size of each binary was not read this send (the hosts that serve file listings were refused); the figures of 14.2, 28.3 and 26.8 MB in the science file are from 25 September and were not read again.
- The deploy page says the standard library ships three binaries: a plain one with SIMD and threads; a JSEP one that powers the WebGPU and WebNN providers; and a training one. The WebGPU or WebNN provider uses the JSEP binary; everything else uses the plain one.
- The js README's table of bundle script sizes (version of the table not stated): all 682 KB, default 434 KB, webgl 411 KB, webgpu 293 KB, wasm only 46 KB, with gzip sizes of 166, 102, 93.6, 80.1 and 14.8 KB.
- What it asks of the page: WebAssembly threads work only when the page is cross-origin isolated (both the env page and the performance page say so); otherwise one thread. numThreads defaults to half of hardwareConcurrency or 4, whichever is smaller. The caniuse data says SharedArrayBuffer in Safari, including iOS 15.2 onward, "requires cross-origin isolation" by Cross-Origin-Embedder-Policy and Cross-Origin-Opener-Policy headers. WebGPU needs a secure context (HTTPS). The binary and the script must come from the same build. The worker needs the same origin or a fetched object URL. Since 1.19 the binaries and workers load under a restricted content security policy if served.
- The proxy worker (env.wasm.proxy) moves compute off the main thread but does not work with the WebGPU provider, because a GPU buffer cannot be transferred; for WebGPU in a worker the page imports the library inside the worker. It also needs Blob workers, which a restrictive security policy may block.
- Limits stated: an ArrayBuffer is capped by the browser (about 2 GB in Chrome); a protobuf model file is capped at 2 GB, beyond which weights go in external data; a WebAssembly module addresses 4 GB. The pages advise caching the model with the Cache API or the origin private file system. External data files are passed by path and data in session options.
- Speed advice from the page: a quantized uint8 model on CPU; avoid float16 on CPU; small or "tiny" models for the web; graph capture and free-dimension overrides for WebGPU when shapes are static. No figure for any tablet is given.
- What it says of a tablet: the get-started page and the js/web README (main branch) both give a support table with Safari on iOS: WebAssembly yes, WebGL yes (maintenance mode), WebGPU no, WebNN no. That table conflicts with the next two sources.

### The browser's own statements on WebGPU and WebAssembly
- WebKit, 9 June 2025: "WebKit for Safari 26 beta adds support for WebGPU", shipping for macOS, iOS, iPadOS and visionOS; "Transformers.js, ONNX Runtime and others all work great in Safari 26 beta". It also says WebAssembly now starts in an in-place interpreter.
- caniuse data, read at the publisher's repository: WebGPU is "yes" for iOS Safari 26.0 through 27.2 and "partial" for macOS Safari 26.0 through 27.3 and Technology Preview, the note reading that partial means enabled by default only on macOS 26 Tahoe or later. WebAssembly SIMD is "yes" for iOS Safari from 16.4 to 27.2. SharedArrayBuffer is "yes" for iOS Safari from 15.2, with the isolation note above.
- The editor's test page reported the tablet's browser as version 26 (from the plan, not from a page asked here).
- So for a tablet on version 26: WebAssembly with SIMD is there; WebGPU is there on the sources dated 2025 and later and absent on the runtime's two tables; threads need isolation headers, which the app does not send (from the science file).

### @huggingface/transformers (Hugging Face, Apache-2.0)
- Latest on the registry: 4.3.2, 1,372 files, unpacked size 9,990,867 bytes. It depends on onnxruntime-web at a development build of 14 September 2026 (version 1.31.0-dev), and on onnxruntime-node, sharp and tokenizer packages. Its page for the Xenova SlimSAM model shows a mask-generation call with points, and says ONNX weights live in a folder named onnx.

### TensorFlow.js (@tensorflow/tfjs, Apache-2.0)
- Latest on the registry: 4.22.0, 77 files, unpacked size 147,474,474 bytes. The registry data does not show its release date in a form read here; the science file's remark that there has been no release since October 2024 was not read again.

## Models prompted by points (each takes a picture and points, gives masks)

### Segment Anything (Meta, first version)
- Licence: README says Apache 2.0 and the LICENSE file read whole is the Apache License 2.0.
- Three checkpoints (ViT-H, ViT-L, ViT-B) in PyTorch form at Meta's file host; sizes not stated on the page. The README says the mask decoder can be exported to ONNX to run in a browser, with a web demo in the repository, and that the image encoder is the heavy part.
- Speed on its own page: none for a tablet. MobileSAM's README gives 452 ms for the original image encoder on a single GPU.

### SAM 2 (Meta)
- Licence: README says the checkpoints, demo code and training code are Apache 2.0, and that two fonts in the demo code are under the SIL Open Font License.
- Checkpoint sizes in millions of parameters, not bytes: tiny 38.9, small 46, base plus 80.8, large 224.4. Speeds are on an A100 GPU (tiny 91.2 frames per second for SAM 2.1). Python and PyTorch with CUDA are what the README's install steps ask for. A browser build is not offered on this page.
- An ONNX copy, onnx-community/sam2-hiera-tiny-ONNX, has no model card and so states no licence on its own page. Its onnx folder holds the vision encoder as a small graph file plus a data file: 134,084,864 bytes at full precision, 67,005,504 in half precision, 52,573,088 in 8-bit, 43,758,848 in 4-bit, 42,085,568 in bnb4, 28,532,736 in q4f16. The prompt encoder and mask decoder data: 20,958,208 at full precision, 10,454,016 half, 8,662,016 in 8-bit, 7,130,112 in 4-bit, 6,870,016 in bnb4, 4,563,968 in q4f16. The small graph files beside them are between 213,114 and 441,167 bytes each. The ONNX Runtime large-models page says external data is passed by path and data.

### MobileSAM (Zhang et al.)
- Licence: the repository's LICENSE file is the Apache License 2.0 (checked as above); the ONNX copy at Acly/MobileSAM states MIT on its own card.
- The README: 9.66 million parameters for the whole pipeline (image encoder 5M, mask decoder 3.876M), 12 ms per image on a single GPU (8 ms encoder, 4 ms decoder); the demo on a Mac with an i5 CPU takes about 3 seconds. It states ONNX export support and lists a browser demo by a third party.
- ONNX files at Acly/MobileSAM: image encoder 28,157,093 bytes; mask decoder returning one mask 16,501,323; returning four 16,496,559. The card says the encoder was exported from the original weights and the decoders with the MobileSAM repository's export script.

### EfficientSAM (repository yformer/EfficientSAM)
- Licence file read: Apache 2.0 (checked as above). Checkpoints sit in the repository's weights folder (a small and a tiny one, one stored as a zip); their sizes were not read because github.com was refused. An ONNX version with separate encoder and decoder is named on a Hugging Face Space page, which was not asked.

### EfficientViT-SAM (MIT HAN Lab)
- Licence: model card says apache-2.0; LICENSE.txt in the model repository is 11,341 bytes, the same size as the GitHub repository's LICENSE file; its text was not compared line by line.
- ONNX files: decoders 16,470,362 to 16,470,422 bytes each; encoders l0 123,112,917; l1 174,629,177; l2 229,435,614; xl0 451,763,082; xl1 797,491,768. The PyTorch checkpoints are 139,410,184 to 814,022,923 bytes. Parameters 34.8M (l0) to 203.3M (xl1); latency on a Jetson Orin with TensorRT 8.2 ms (l0, 512 by 512).

### SlimSAM (Xenova/slimsam-77-uniform on Hugging Face, via transformers.js)
- Licence: apache-2.0 on its card. Its card names the base repository nielsr/slimsam-77-uniform and shows transformers.js code taking points. Downloads last month 91,235 on the page.
- ONNX files in its onnx folder: vision encoder 23,276,014 bytes at full precision, 12,170,657 in half precision, 8,882,165 quantized. Prompt encoder and mask decoder 16,557,892 full, 8,550,118 half, 4,903,810 quantized. The card gives no speed figure.

## Models that label the scene by class

### BiSeNet V1, V2 and M (CoinCheung, MIT)
- Licence: LICENSE file read whole, MIT, copyright 2018 CoinCheung.
- The README lists mIoU on ADE20K, single scale: V1 35.86, V2 33.42, M 39.55; on Cityscapes V2 74.52. Weights are PyTorch files at releases on github.com, which was refused this send, so no size was read here; the 22.4 MB for V2 on ADE20K is from the science file of 25 September. The README names deployment by TensorRT, ncnn, OpenVINO and Triton, and not a browser. Its speeds are on an NVIDIA L4 GPU.

### Sky model by xiongzhu666 (u2netp, MIT)
- Licence: LICENSE file read whole, MIT, copyright 2021 xiongzhu666.
- The README: a small sky model of 2 MB trained with u2netp for demonstration; a C++ demo through ncnn; the author says the higher-precision model is not public, the 167 MB ONNX file sits on a file host in China and was not asked; and states in its own words that in building scenes "some detail of building will be considered as sky by mistake". It also says u2net does not run in real time on a phone (about 300 ms on a Snapdragon 888).

### PaddleSeg and PP-MobileSeg
- LICENSE of PaddleSeg: Apache 2.0. No model page or file size was asked.

### SegFormer b0 on ADE20k (NVIDIA)
- The model page says "License: other" and links to a licence file that was not asked this send. Size on the page: 3.75M parameters. The science file records that NVIDIA's licence limits use to research or evaluation, not re-read here.

## What fits under a file of 25 MiB and what does not (no choice is made)

Under 26,214,400 bytes for one file, by the listings read this send:
- SlimSAM at full precision: both files (23,276,014 and 16,557,892); in half precision (12,170,657 and 8,550,118); quantized (8,882,165 and 4,903,810). Licence Apache 2.0 on its card.
- MobileSAM from Acly: both decoders (16.5 MB each). The encoder does not fit: 28,157,093 is 1,942,693 bytes over.
- EfficientViT-SAM: the decoders fit (16,470,362 and up); no encoder fits (smallest 123,112,917).
- SAM 2 tiny in ONNX: the mask-decoder data fits at every precision (largest 20,958,208); the vision encoder fits at none (smallest 28,532,736, q4f16, which is 2,318,336 over; full precision 134,084,864).
- Segment Anything and the larger SAM 2 and EfficientViT-SAM checkpoints: sizes not read or over.
- BiSeNet V2 for ADE20K: 22.4 MB by the science file, not read again; it fits.
- The xiongzhu666 sky model: about 2 MB by its own README; it fits.
- The runtime itself: the 14.2 MB plain build fits and the 28.3 and 26.8 MB WebGPU builds do not, by the science file of 25 September; the per-file sizes of the 1.31.1 binaries were not read this send because the hosts that list file sizes refused. A file over the limit could be served in parts only if a way is found; none is stated on a page read here.

Licences: Apache 2.0 and MIT both allow a free app to ship a copy of the work with its notice kept (the licence texts read give copy, modify, distribute rights; Apache 2.0 section 4 asks that the licence and notices travel with it). The SAM 2 tiny ONNX copy states no licence of its own. SegFormer's is "other".

## What none of it shows
- How fast or how heavy any of these runs on the owner's tablet. Every speed on these pages is from a GPU server, a Jetson, a Mac or a phone chip, or a single-GPU desktop.
- Whether the tablet's browser, at version 26, runs the WebGPU build of the runtime on a model of this size: sources dated June 2025 and later say yes; the runtime's own two tables say no. A test on the test page is the only thing that settles it.
- The size of each WebAssembly binary in the current runtime.
- Whether the quality of any of these models on near-infrared frames holds: no page here bears on it. The science file's trial of 25 September is the only reading.
