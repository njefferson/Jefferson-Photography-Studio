# Nikon Z50 — In-Camera IR Field Guide

How to get the closest possible *in-camera* result for color-IR work, and what
still has to happen in Infrared Photography Studio (IPS).

> Reality check: the camera can do the hard part — the deep **white balance** —
> via PRE (Preset Manual) WB. It **cannot** do the red↔blue **channel swap**, so
> the final Aerochrome look (blue sky / red foliage) still happens in the app.
> Treat in-camera settings as "make the preview representative + get a usable
> JPEG," and always shoot RAW for the real edit.

## 1. One-time setup

- **Image quality:** RAW (NEF) — or RAW + JPEG if you want a cooled preview JPEG too.
- **Color space:** doesn't matter for NEF; sRGB is fine for JPEG.
- **Focus:** use **live-view / EVF autofocus**. Mirrorless focuses *through* the
  filter on the actual IR image, so the Z50 nails IR focus where a DSLR would
  miss — a real advantage. (On a DSLR you'd need an IR focus-shift correction.)
- **Shooting mode:** A (aperture priority) or M. IR filters cut a lot of light,
  so expect slower shutter speeds — use a tripod for 720nm especially.
- **Stop down a little** (e.g. f/5.6–f/8). Wide open can worsen the IR
  **hot-spot** (bright central blob) some lenses show; if you see it, stop down
  or try a different lens.

## 2. Preset Manual white balance (the key step)

This is what beats Lightroom's 2000K floor — it measures real multipliers off
foliage instead of picking a Kelvin number.

1. Photo Shooting Menu → **White balance** → **Preset manual (PRE)**
   (or reach it from the **`i`** menu).
2. Pick a slot — use **d-1 for the red filter**, **d-2 for 720nm**, so you can
   switch quickly later.
3. Highlight **PRE** and **press-and-hold OK** until the **PRE indicator blinks**.
4. Fill the frame with **sunlit green foliage** (grass/leaves in the same light
   you'll shoot), then **press the shutter** to measure.
5. Look for **"Gd"** (good). If it fails, get closer to the foliage / more light
   and retry.

Re-measure when the light changes a lot (full sun ↔ overcast). The measured WB
makes foliage go neutral and sky go cyan/teal — the correct "before-swap" base.

## 3. Picture Control (preview punch only)

Photo Shooting Menu → **Set Picture Control**:

- **Color filters (red / 590 / none):** choose **Vivid**, then
  **Saturation +2 to +3**, **Contrast +1 to +2**, Sharpening +1.
- **720nm:** choose **Monochrome** — it's near-colorless anyway, and the
  "white forest" B&W look is its strength.

Note: the Picture Control **Hue** adjustment is only a small global shift (±3),
**not** a channel swap. You can load a custom `.NP3` Picture Control from a card,
but no Picture Control can swap channels — so don't chase the full false-color
look in-camera.

## 4. Filter cheat-sheet

| Filter | In-camera look after PRE WB | Best use |
|--------|------------------------------|----------|
| **Red / 590nm** | Neutral foliage, cyan sky; lots of color to swap | Aerochrome (finish in app) |
| **720nm** | Near-monochrome | B&W "white forest" (Monochrome PC) |
| **530nm** | Moderate color | False color, gentler |
| **None (full-spectrum)** | Similar to red, more haze | Experiment |

## 5. Workflow

1. In the field: **PRE WB on foliage** + Vivid/Monochrome Picture Control →
   representative preview, RAW captured.
2. In **IPS**: open the NEF → **Auto** (WB + exposure) → **Aerochrome look** →
   tap foliage to refine WB → tune Exposure/Hue → export JPEG/TIFF.

The camera gets you a good preview and the deep WB; the app does the swap,
camera-matrix color separation, and the final 14-bit edit.
