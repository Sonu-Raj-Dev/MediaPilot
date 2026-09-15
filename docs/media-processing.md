# MediaPilot — Media Processing

Both tools run entirely client-side. Nothing is uploaded to a server.

## Video: watermark/logo removal (`app.js`, served at `/` and `/tools/remove-watermark-video`)

**Engine:** `@ffmpeg/ffmpeg` 0.12.15 + `@ffmpeg/core` 0.12.10, loaded at runtime
from jsDelivr (not npm-bundled), single-threaded WASM build (avoids needing
COOP/COEP response headers, at the cost of speed — "expect roughly real-time
or worse" per the README).

**Pipeline** (`cleanVideo()` in `app.js`):
1. `readVideoMetadata()` decodes the first frame with a native `<video>` element
   for a preview + dimensions; falls back to `readVideoMetadataWithEngine()`
   (an ffmpeg `-frames:v 1` probe) for containers the browser can't decode
   (AVI, MKV, WMV).
2. User draws one or more normalized (0–1) rectangles over the preview frame,
   or uses a lower-corner / top-corner preset.
3. `toPixelBoxes()` converts normalized regions to clamped pixel rectangles
   strictly inside the frame (ffmpeg's `delogo` filter cannot read outside it).
4. `buildFilterGraph()` builds an ffmpeg `-filter_complex` graph per mode:
   - **Reconstruct** → chained `delogo=x:y:w:h` per box (interpolates from
     surrounding pixels).
   - **Soften** → `split` → per-box `crop` + `boxblur` → `overlay` back.
   - **Pixelate** → `split` → per-box `crop` + downscale/upscale
     (`flags=neighbor`) → `overlay` back.
5. Encode: `libx264 -preset veryfast -crf 23 -pix_fmt yuv420p`, audio copied
   through when present (`-c:a aac`, `-map 0:a?`), `-movflags +faststart`.
   Output is always MP4/H.264+AAC regardless of input container.
6. Result blob is handed back to the UI as a downloadable file and preview.

**Known limits:** single-threaded WASM (no multi-core), no explicit processing
timeout or cancel button, no explicit file-size/duration ceiling beyond the
800 MB upload guard in the (currently unused) `tools/remove-watermark-video/app.js`
— the live path enforces no size limit itself. See [known-issues.md](known-issues.md).

## Image: watermark removal (`tools/remove-watermark-image/app.js`)

**Engine actually used:** OpenCV.js (`vendor/opencv.js`, lazy-loaded via
`loadOpenCV()` on first process), specifically `cv.inpaint()` with a choice of
**TELEA** or **Navier–Stokes** algorithm (radio buttons in the tool UI).

**Pipeline** (`processImage()`):
1. Draw the source image to an offscreen canvas at full resolution.
2. Selection rectangle → pixel box (`selectionToOriginalBox`, `clampMaskBox`).
3. Build a binary mask (`cv.Mat` filled via `cv.rectangle`), then `cv.dilate`
   it with an elliptical kernel sized off the box (3–17 px) so the fill
   reaches slightly past the marked edges.
4. `cv.inpaint(src, mask, dst, radius, TELEA|NS)`, radius derived from box size.
5. Output drawn back to canvas, exported as `image/png` (lossless — always PNG
   regardless of input format, so a JPEG in produces a larger PNG out).

**Unused code in the same file:** a second, hand-written exemplar-based
inpainting implementation (`inpaintRegion`, `patchIsSource`,
`fillWithBorderAverage`, `blurRegion`, and the `PATCH_RADIUS` /
`SOURCE_MARGIN` / `COMPARE_STEP` / `CANDIDATE_STRIDE` / `BLEND_STRENGTH` /
`VERTICAL_BIAS` constants — roughly 250 lines) matching the Criminisi-style
patch-fill the README describes. It is fully defined, unit-tested
(`test-image-regions.mjs`), but **never called** — `processImage()` uses
OpenCV instead. There is also no blur/pixelate mode in the current image-tool
UI, even though `blurRegion` exists and is tested. This is the single most
important finding of this audit; see [known-issues.md](known-issues.md).

## Legacy backend (`server.py`, not in the live path)

A Python `http.server` implementation with an in-memory job dict, `cv2`
(OpenCV) for frame/mask processing, and vendored `imageio_ffmpeg` for
encoding. Exposed `/api/upload`, `/api/process`, `/api/status/:id` — the same
endpoints `tools/remove-watermark-video/app.js` (dead file) still calls. Not
started by any deploy path, not imported by anything live. Useful only as
reference for the original server-side algorithm if the client-side approach
is ever revisited (e.g., to support multi-threaded/faster encoding via a real
backend).

## What's NOT implemented today

The audit found no code for: cropping, resizing, general compression tuning
(beyond the fixed CRF/PNG choices above), a "quality enhancement" step, or a
generalized upload/download job pipeline. Only "remove watermark/logo" exists,
for video and image respectively. Any of these would be new feature work for
the Developer agent, not a bug fix.
