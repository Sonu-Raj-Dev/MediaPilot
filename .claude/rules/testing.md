# Testing Rules — MediaPilot

## Minimum bar for every change

```bash
node test-filter-graph.mjs && node test-image-regions.mjs
npm run build
```
Both must exit 0. `npm run build` succeeding is itself a meaningful check —
it fails loudly if a required source or vendor file is missing
(`scripts/build-static.mjs` throws explicitly).

## Before trusting a passing test

Per `docs/known-issues.md` #1, at least one existing test
(`test-image-regions.mjs`) verifies code that the shipped app does not call.
**A green test suite is not proof the feature works** until you've confirmed
the test actually exercises the live code path — trace from the UI event
handler (`processButton.addEventListener` / `processImage()` for the image
tool, `beginProcessing`/`cleanVideo()` for video) to the function under test.
If a new or existing test doesn't reach a function called from a real event
handler, say so instead of reporting coverage.

## What the QA agent builds out (see `.claude/agents/qa.md` for the full list)

New automated tests should follow the existing pattern — pure functions
extracted from the real `app.js` files and asserted with `node:assert/strict`,
zero new dependencies — and must target the **live** paths:

- Video: `toPixelBoxes`/`buildFilterGraph` (already covered) plus new checks
  as formats/resolutions/aspect ratios are added to the matrix in
  `qa.md`. True encode/decode/audio-sync verification needs an actual
  ffmpeg.wasm run; if that's added, run it under Node with `@ffmpeg/ffmpeg`
  directly rather than faking it, and keep it out of the fast unit-test path
  (separate script) since it downloads a ~31 MB core.
- Image: retarget or add coverage for `processImage()`'s real
  OpenCV.js `cv.inpaint` path — `@techstark/opencv-js` is already an npm
  dependency, so this is runnable under Node without a browser.

## Where new tests live

Flat files in the repo root (`test-<topic>.mjs`), matching the existing two.
If the count grows past ~5, propose (don't unilaterally add) a `tests/`
directory and a `package.json` `"test"` script that runs all of them — that's
a MEDIUM-risk structural change per `safety.md`, not a LOW one, since it
changes the documented "how to run checks" contract in the README.

## CI

None exists today (`docs/deployment.md`). Standing up one (e.g. GitHub
Actions running the two test scripts + build on every PR) is a good
MEDIUM-risk task for the backlog — propose it, don't silently add a workflow
file that starts gating merges without a human agreeing to that gate.
