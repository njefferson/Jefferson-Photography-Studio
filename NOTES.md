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

## Status

- [ ] Research Rob Shea's IR editing method
- [ ] Confirm scope and stack
- [ ] Identify pitfalls (esp. RAW + sub-range white balance in a web app)
- [ ] Build
