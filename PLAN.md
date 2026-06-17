# IRstudio — Build Plan

_Last updated: 2026-06-17. This is the authoritative plan. See `NOTES.md` for
the original brief._

## One-line goal

A tool for editing infrared (color-IR / Aerochrome-style) photographs using
Rob Shea's method — unbounded white balance, red↔blue channel swap, per-color
hue/sat shifts — running offline on an iPad, exporting finished images **and**
reusable LUTs/DCP profiles for Lightroom.

## Confirmed decisions

| Area | Decision |
|------|----------|
| First input format | **DNG-first** (Nikon Z50, red + 720nm filters). ~20.7MP, 16-bit. |
| Looks | **Build our own equivalents** of swap/WB/hue. Do **not** redistribute Rob Shea's profiles/LUTs (his IP). |
| Image output | **JPEG q92 Display P3** (default) + **16-bit TIFF** (archival). No DNG image export. |
| Profile output | **Export `.dcp` (Lightroom) and `.cube` (Photoshop)** generated from the user's in-app edit. |
| Platform | **Offline-first PWA** for the A16 iPad (model A3355). Native App Store build later. |
| Service/cloud | **None.** All processing on-device. |

## Why a custom app beats Lightroom for this (validated on a real file)

Lightroom/Camera Raw floor the white-balance temperature at **2000K**, which is
nowhere near cool enough for raw IR. Decoding the user's actual `DSC_0788.dng`
with LibRaw, neutralizing the foliage required channel gains of roughly
**R 0.42 / G 7.8 / B 2.1** — far outside what Lightroom can express. Our own
pipeline applies arbitrary gains directly to the raw data, so the single hardest
part of the Lightroom workflow becomes a native feature. Confirmed, not theory.

## Edit pipeline (per-pixel, GPU)

```
import DNG (zip-aware, magic-byte validated)
  -> LibRaw decode (WASM)            : raw RGB, 16-bit linear
  -> WHITE BALANCE (unbounded)       : tap point OR drag selector -> per-channel gains
  -> CHANNEL SWAP                    : 3x3 matrix; presets for Rob Shea variations
  -> PER-COLOR HUE / SATURATION      : dial the look (cyan skies, red/gold foliage)
  -> TONE                            : contrast / curve
  -> OUTPUT                          : JPEG / 16-bit TIFF, native or reduced res
```

Interactivity rule: edit a **downscaled proxy** live on the GPU; apply final
params to **full resolution only on export**. Z50 files are small, so this is
comfortable on the A16 iPad.

## Stack (default — speak up to change)

- **Vite + TypeScript**, no heavy UI framework (keep it lean for iPad/offline).
- **LibRaw compiled to WebAssembly** for DNG decode (validated locally with
  rawpy/LibRaw 0.27 against the real file).
- **WebGL2 fragment shaders** for WB / swap / hue / tone (all per-pixel).
- **JSZip / DecompressionStream** for zip-aware import.
- **PWA** (service worker + manifest) for offline + "Add to Home Screen".

## Import hardening (the iOS transcoding problem)

- Picker accepts `.dng`/`.zip` to steer users to **Files**, not Photo Library
  (which silently transcodes RAW → JPEG).
- Accept `.zip` and auto-extract the DNG.
- Validate magic bytes; warn if a file arrives as a flattened JPEG.
- Native build later uses Apple's proper RAW picker, removing the issue.

## Phases

1. **Foundation** — project scaffold, PWA shell, file import (zip + validation),
   LibRaw-WASM decode, render a DNG to screen.
2. **White balance** — tap-to-set + drag selector, unbounded gains, live proxy.
3. **Swap + hue/sat + tone** — channel-swap presets, per-color HSL, curve.
4. **Export images** — JPEG (P3) + 16-bit TIFF, resolution choice, save to Files.
5. **Export profiles** — `.cube` LUT, then `.dcp` profile (the Lightroom prize).
6. **Polish + offline** — service worker caching, presets, A16 iPad testing.
7. **(Later) Native App Store build** — proper RAW picker, Photos library write.

## Pitfalls being designed around

- RAW-in-browser memory (mitigated: Z50 files are small; proxy for preview).
- iOS Photo Library transcoding (mitigated above).
- 8-bit banding in IR skies (mitigated: P3 + q92, 16-bit TIFF option).
- WB is partly per-shot — profiles give a starting point, not a one-click final.
- Shooting side: lens hot-spots, IR focus shift; 590nm = more color than 720nm.

## Open inputs (nice-to-have, not blocking)

- One **sky-containing** red-filter frame (zipped) to tune swap/hue presets to
  the real Aerochrome look.
