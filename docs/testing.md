# MediaPilot — Testing

## What exists today

Two plain Node scripts, no test framework/runner, no `npm test` script, no CI
(no `.github/` directory):

- **`test-filter-graph.mjs`** — extracts `clampInt`, `toPixelBoxes`,
  `buildFilterGraph` out of `app.js` source text via `new Function(...)` and
  asserts on the ffmpeg filter-graph strings they build (box clamping, delogo
  chaining, split/crop/overlay label balance for blur/pixelate). This exercises
  **real, live** video-tool logic.
- **`test-image-regions.mjs`** — extracts `selectionToBox`,
  `selectionToOriginalBox`, `inpaintRegion`, `blurRegion` from
  `tools/remove-watermark-image/app.js` the same way, and asserts on pixel
  output. **This tests the unused custom exemplar-inpaint path, not the
  `cv.inpaint` code `processImage()` actually calls in production.** The suite
  passes; it proves nothing about what ships. See
  [known-issues.md](known-issues.md).

Run both:
```bash
node test-filter-graph.mjs && node test-image-regions.mjs
```
Both currently pass (verified during this audit).

## Coverage gaps (by design of "what exists today," not opinion)

- No test touches the actual live image-processing path (`cv.inpaint`, mask
  dilation, OpenCV loading).
- No test exercises `cleanVideo()` end-to-end (ffmpeg.wasm can run in Node,
  but nothing does today) — filter-graph string generation is covered, actual
  encoding/audio-sync/output-integrity is not.
- No frontend/DOM tests (upload flow, drag-and-drop, zone editing, language
  switch, error toasts).
- No tests for `server.py` (also arguably moot, since it's unused).
- No format-matrix coverage (PNG/JPEG/WebP in; MP4/MOV/WebM/AVI/MKV/WMV in) —
  the QA agent's job list in Phase 3 targets exactly this gap.
- No performance/timeout/large-file tests.

## How to add tests going forward

- Keep following the existing pattern (pure functions extracted and asserted
  with `node:assert/strict`) for new pure logic — it's zero-dependency and
  matches the "no build step" philosophy of the repo. Don't introduce a test
  framework for logic this simple.
- For the image tool, either add a `processImage()`-level integration test
  (feasible: `cv.inpaint` is available via the same `@techstark/opencv-js`
  package Node-side) or delete/relocate the dead custom algorithm so the
  existing test stops giving false confidence — this is a Manager/QA decision,
  not a unilateral deletion (see [safety.md](../.claude/rules/safety.md)).
- Any new script should be added to a `package.json` `test` script so `npm test`
  becomes the single entry point Manager/QA agents can invoke uniformly.
