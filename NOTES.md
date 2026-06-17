# IRstudio — Project Notes

> Saved verbatim from Noah's description so it is never lost again.
> Date captured: 2026-06-17

## What this is

An app for editing **infrared (IR) photographs** using **Rob Shea's method**
for editing the colors. The core of that method involves **color swaps and
shifts**, particularly pushing **white balance below the range a typical
white-balance control normally allows**.

## Goals

- **Eventual target:** publish to the **Apple App Store**.
- **Acceptable starting point:** a **web app** that runs on the **iPad in
  desktop mode**.

## Inputs / files

- Works with **JPG and RAW**.
- **Primary interest is RAW editing.**
- Files are stored in **Lightroom**, but can be exported to **Photos** or
  **Files**.

## Desired workflow / UI

1. **Open a file** and **see the image**.
2. **Set white balance** by either:
   - **Tapping** a point on the image, or
   - **Dragging a selector** to find the best white balance (preferred).
3. Press **buttons that correspond to the swaps / shifts** Rob Shea performs.
4. **Save the edited image back to the device**, at **native resolution or
   lower by user's choice**.

## Open requests from Noah

- **Suggest any part of Rob Shea's system that is being forgotten.**
- **Research Rob Shea's methods before beginning** (he is a YouTuber).
- **Help avoid common pitfalls.**
- Do **not** want pseudo code or drafts — wants it run through **review passes
  until it is as good as it can be**.

## Confirmed (2026-06-17)

- Camera: **Nikon Z50, IR-converted**. Filters: **red** + **720nm**.
- Input: **DNG-first** (validated decoding the real `DSC_0788.dng` with LibRaw).
- Output: **JPEG q92 Display P3** + **16-bit TIFF**; also **export `.dcp`/`.cube`
  for Lightroom/Photoshop** generated from the in-app edit.
- Platform: **offline-first PWA**, iPad A3355 (A16); native App Store build later.
- Looks: **build our own equivalents**, do not redistribute Rob Shea's IP.
- Confirmed the 2000K white-balance crux on the real file (needed gains
  R 0.42 / G 7.8 / B 2.1 — impossible in Lightroom, trivial in our pipeline).

See **`PLAN.md`** for the full build plan.

## Status

- [x] Research Rob Shea's IR editing method
- [x] Confirm scope and stack
- [x] Identify pitfalls (esp. RAW + sub-range white balance in a web app)
- [x] Validate DNG decode + WB + swap on a real file
- [ ] Build (Phase 1: scaffold + import + decode + render)
