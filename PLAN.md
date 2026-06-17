# Infrared Photography Studio (IPS) — Build Plan

_Last updated: 2026-06-17. This is the authoritative plan. See `NOTES.md` for
the original brief._

## One-line goal

A tool for editing infrared (color-IR / Aerochrome-style) photographs — unbounded
white balance, red↔blue channel swap, per-color hue/sat shifts — running offline
on an iPad, exporting finished images **and** reusable LUTs/DCP profiles for
Lightroom.

## Confirmed decisions

| Area | Decision |
|------|----------|
| Input formats | **DNG** primary: lossy-linear (8-bit) and mosaiced (14-bit, lossless-JPEG). **NEF → convert to DNG in Lightroom** (avoids a separate Nikon decoder). |
| Looks | **Build our own** swap/WB/hue looks and presets. No third-party profiles/LUTs. |
| Image output | **JPEG q92 Display P3** (default) + **16-bit TIFF** (archival). No DNG image export. |
| Profile output | **Export `.dcp` (Lightroom) and `.cube` (Photoshop)** generated from the user's in-app edit. |
| Platform | **Offline-first PWA** for the A16 iPad (model A3355). Native App Store build later. |
| Service/cloud | **None.** All processing on-device. |

## Why a custom app beats Lightroom for this (validated on real files)

Lightroom/Camera Raw floor white-balance temperature at **2000K**, nowhere near
cool enough for raw IR. On a real file, neutralizing foliage required channel
gains around **R 0.42 / G 7.8 / B 2.1** — far outside what Lightroom can express.
Our pipeline applies arbitrary gains directly to the raw data, so the single
hardest part of the Lightroom workflow becomes a native feature. Confirmed.

## Decode strategy (pure-JS, no big WASM blob)

| Source | How |
|--------|-----|
| Lossy linear DNG (8-bit) | Baseline-JPEG tile decoded natively (`createImageBitmap`); gamma-2.2 → linear in shader. **Done.** |
| Mosaiced DNG (14-bit) | Pure-JS **lossless-JPEG (LJ92)** decode + demosaic + black/white levels. Decoder **verified bit-exact** vs LibRaw. **Port in progress.** |
| JPEG / PNG | Native bitmap decode. **Done.** |
| Nikon NEF (Compression 34713) | Out of scope for now — **convert to DNG in Lightroom**. Optional future native decoder. |

## Edit pipeline (per-pixel, GPU)

```
import (zip-aware, magic-byte validated)
  -> decode to linear RGB            : native JPEG path, or LJ92 + demosaic
  -> WHITE BALANCE (unbounded)       : tap point OR drag selector -> per-channel gains
  -> CHANNEL SWAP                    : presets (red↔blue classic, etc.)
  -> PER-COLOR HUE / SATURATION      : dial the look (blue skies, red/gold foliage)
  -> TONE                            : contrast / curve; B&W/duotone mode for 720nm
  -> OUTPUT                          : JPEG / 16-bit TIFF, native or reduced res
```

Interactivity rule: edit a **downscaled proxy** live on the GPU; apply final
params to **full resolution only on export**.

## Stack

- **Vite + TypeScript**, no heavy UI framework (lean for iPad/offline).
- **WebGL2 fragment shaders** for WB / swap / hue / tone (all per-pixel).
- **Pure-JS decoders** (LJ92 + demosaic); `DecompressionStream` for zip import.
- **PWA** (service worker + manifest) for offline + "Add to Home Screen".

## Import hardening (the iOS transcoding problem)

- Picker accepts `.dng`/`.zip` to steer users to **Files**, not Photo Library
  (which silently transcodes RAW → JPEG).
- Accept `.zip` and auto-extract the DNG.
- Validate magic bytes; warn if a file arrives as a flattened JPEG.
- Native build later uses Apple's proper RAW picker, removing the issue.

## Phases

1. **Foundation** — scaffold, PWA shell, hardened import, WebGL pipeline. **Done.**
2. **True raw decode** — native lossy-linear DNG (done); pure-JS LJ92 + demosaic
   for mosaiced DNG (in progress).
3. **Looks** — channel-swap presets, per-color HSL, curve, B&W/duotone for 720nm.
4. **Export images** — JPEG (P3) + 16-bit TIFF, resolution choice, save to Files.
5. **Export profiles** — `.cube` LUT, then `.dcp` profile (the Lightroom prize).
6. **Polish + offline** — service worker caching, presets, A16 iPad testing.
7. **(Later) Native App Store build** — proper RAW picker, Photos library write.

## What we learned from the real files

- **Filter drives the look.** Red filter → most color (Aerochrome). 530nm →
  moderate. 720nm → near-monochrome "white forest". No filter → similar to red.
- Best color source = **red filter, exported as DNG**.
- IR **lens vignette/hot-spot** is visible in some frames (shooting-side).

## Pitfalls being designed around

- RAW-in-browser memory (mitigated: proxy for preview, full res only on export).
- iOS Photo Library transcoding (mitigated above).
- 8-bit banding in IR skies (mitigated: P3 + q92, 16-bit TIFF; 14-bit raw path).
- WB is partly per-shot — profiles give a starting point, not a one-click final.
- Shooting side: lens hot-spots, IR focus shift.
