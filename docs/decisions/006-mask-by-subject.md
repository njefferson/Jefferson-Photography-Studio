# 006 · Mask by subject / background

## Context

Auto-select the subject, or the background, as a mask. Owner request 2026-07-05.
Honest scoping recorded at the time: true subject/background segmentation needs
an on-device ML model — WebGPU, which is its own frontier backlog item — and
there is no classical stand-in the way sky detection had one. The architectural
instruction is to shape it as a mask TYPE so it slots into the existing engine
when the model half becomes possible.

## Looked up

**Read on 11 November 2026**, each page fetched once to disk by the
measurement's own fetcher and read there; the science file's passage of that
date names each page with how it was read. The question was what exists, what
it costs to ship, and whether an iPad can run it; the first two are answered
below from the publishers' own pages, and the third is not answered by any page.

- **The runtime.** ONNX Runtime Web (Microsoft, MIT), 1.31.1 on the registry. It
  runs a model in the page by WebAssembly, with threads only where the page is
  cross-origin isolated, which this app's headers do not ask for, or by WebGPU in
  a secure context; its proxy worker does not work with WebGPU, so a model on the
  GPU runs in a worker that imports the library itself. Its own two tables give
  Safari on iOS WebAssembly yes and WebGPU no; WebKit's post of 9 June 2025 says
  the Safari 26 beta adds WebGPU on iOS and iPadOS and that ONNX Runtime works
  there; the caniuse data gives WebGPU for iOS Safari 26.0 to 27.2 and
  WebAssembly SIMD from 16.4. No page gives a time or a memory figure for any
  model on a tablet. Transformers.js (Apache 2.0) runs on it.
- **What fits the host's limit of 25 MiB for one file** (26,214,400 bytes), by
  the publishers' own file listings. SlimSAM's encoder and decoder, 23,276,014
  and 16,557,892 bytes (Apache 2.0). MobileSAM's decoder, 16,501,323, and not its
  encoder, 28,157,093 (Apache 2.0; its ONNX copy's card says MIT). No encoder of
  SAM 2 tiny, the smallest 28,532,736, nor of EfficientViT-SAM, the smallest
  123,112,917. DINOv2's small form, a model trained without labels whose features
  a classifier is fitted on, at 4 bits, 12,917,198, and at 8 bits, 22,393,453
  (Apache 2.0 for the base model; its ONNX copies' cards name no licence of their
  own). BiSeNet's second version for ADE20K, a model that labels the scene by
  class, 18,385,109 bytes as a PyTorch file (MIT), with no ONNX file read.
  SegFormer's licence is given as other. The runtime's own WebAssembly binaries
  were not listed this time: the science file's figures of 25 September, 14.2 MB
  for the plain build and 28.3 and 26.8 MB for the WebGPU builds, were not read
  again.
- **What an editor does.** darktable 5.6, the one editor whose pages answered:
  one model-made selection, AI object, made by clicks through models such as SAM
  2.1 run by ONNX Runtime, the image encoded once and cached, the result kept as
  drawn paths; its manual says every model has cases where it does worse than the
  classical tools and to keep those as a fallback. Adobe's and Capture One's
  help pages did not answer.
- **What was measured with these files.** A model prompted by points, a
  classifier fitted on DINOv2's features and a model that labels the scene by
  class were run in the container from the files above, on eight photographs of
  the app's list and on seven planted pictures with known regions, each prompted
  or fitted from named samples. None met the result over whole photographs on
  any named subject, and neither did the classical recipe measured beside them.
  The science file's passage of 11 November 2026 carries it frame by frame.
  Whether an iPad runs any of them, and how fast, is still unmeasured and is the
  test page's to take.

## Weighed against

Blocked behind the same WebGPU question as the frontier item it names, so it is
not independently schedulable. `src/sky.ts` is the existing precedent for a mask
type built classically and is worth re-reading before any model is considered —
it exists because the sky HAD a classical signal.

The mask engine itself is shipped and takes new types; that is the part this item
is allowed to build now.

## Options

**Architect the mask type now, leave the selector unimplemented.** The bullet's
own instruction, and it is the part that can be done without the model.

Wait entirely. Zero cost, and leaves the engine to be changed later under
pressure when the model half arrives.

## Rejected

**A classical stand-in.** Recorded at scoping time on 2026-07-05: unlike sky,
subject and background have no classical signal to key on in this app's images —
and under infrared the usual cues are further degraded, since colour evidence is
void. Building an approximation would ship a control that works on some
photographs for reasons nobody can state.

## Rank

**Sixth.** Below the presentation items because it is blocked on an external
capability rather than on a decision, and above the 3.0 performance items only
because those are explicitly grouped into one declared release below.
