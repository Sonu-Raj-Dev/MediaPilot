# MediaPilot — Known Issues

Findings from Phase 1 static audit (2026-09-15), evidence-based only — nothing
below was changed as part of this audit. Severity is a starting point for the
Manager agent's risk classification (see [safety.md](../.claude/rules/safety.md)),
not a final verdict.

## High — correctness / trust

1. **The image-tool README and the shipped code disagree, and the test suite
   tests the wrong path.** `docs/media-processing.md` has the full trace.
   `tools/remove-watermark-image/app.js` defines a ~250-line custom
   exemplar/Criminisi inpainting algorithm (`inpaintRegion`, `blurRegion`,
   etc.) that is unit-tested by `test-image-regions.mjs` and passes — but
   `processImage()`, the function the UI actually calls, uses OpenCV.js
   `cv.inpaint` (TELEA/NS) instead. The custom code and its tests are dead
   weight that will keep passing CI forever regardless of whether the real
   `cv.inpaint` path breaks. **Zero test coverage exists for what ships.**
   README.md also states the image tool needs "no dependencies," which is
   false — it loads a 13 MB OpenCV.js bundle synchronously in `<head>`.
   → Manager should scope this as a real task: either wire the tested
   algorithm in (product decision: which quality profile do we want?) or
   delete the dead code/test and write a test against `cv.inpaint` instead,
   or an integration test around `processImage()`. Do not silently delete
   without a decision — the custom algorithm may represent unfinished,
   intentional work.

2. **`tools/remove-watermark-video/app.js` is dead code that talks to a
   backend that doesn't exist in production.** Its `<script>` tag is never
   referenced — `tools/remove-watermark-video/index.html` loads the *root*
   `/app.js` instead, which has its own, different (ffmpeg.wasm-based)
   implementation. The dead file calls `/api/upload`, `/api/process`,
   `/api/status/:id`, which only `server.py` (also unused) implements. A
   future edit to the wrong file (this one looks like "the video tool's app.js"
   by path) would have zero effect and waste debugging time.

## Medium — reliability / UX

3. **No processing timeout or cancel affordance for video.** `cleanVideo()`
   in `app.js` has no timeout, no `AbortController`, and no UI to cancel a
   run. A large file on a slow single-threaded WASM decode could hang the tab
   with only a spinner. The old `tools/remove-watermark-video/app.js` had an
   explicit 800 MB guard; the live path has no size/duration guard at all.

4. **i18n is incomplete and duplicated.** The same ~15-locale translation
   dictionary is hand-copied between `app.js` and
   `tools/remove-watermark-image/app.js` (and dead in the orphaned video
   `app.js`). Several locales (TR, ID, VI, TH, PL, RU, JA, KO, etc.) are
   missing keys present in EN/ES and silently fall back per-key
   (`t()`/`translatePage()`), which is safe but means the UI is a patchwork
   of English and translated strings in most non-EN/ES locales. No automated
   check that a locale's key set matches English's.

5. **`vendor/opencv.js` (13 MB) loads unconditionally and synchronously** via
   a blocking `<script>` tag in `tools/remove-watermark-image/index.html`, on
   every visit to that page, even before the user picks a file. It's also
   duplicated three times on disk (`node_modules/@techstark/opencv-js`,
   `vendor/opencv.js`, `dist/vendor/opencv.js`) — expected given the build
   script, but worth knowing before "reducing bundle size" tasks assume it's
   accidental duplication.

6. **No SEO fundamentals**: no `robots.txt`, no `sitemap.xml`, no canonical
   `<link>`, no Open Graph/Twitter meta, no structured data (`ld+json`), and
   `<title>` is the only thing that varies per tool page — meta `description`
   is identical ("MediaPilot online tools for video, images, and file
   conversion.") on every page including both tool pages.

7. **No analytics and no monetization integration of any kind** — confirmed
   by grep across the repo (no `gtag`, `dataLayer`, ad tags, or similar).
   Every Analytics/Revenue agent task in Phase 3 starts from zero
   instrumentation, not from "fix the numbers."

## Low — housekeeping

8. **Uncommitted work-in-progress on `main` at audit time** (now carried onto
   this branch): README, both `app.js` files, `styles.css`,
   `scripts/build-static.mjs`, `package.json` modified; `vendor/opencv.js`
   and both `test-*.mjs` files untracked. This looks like an in-progress
   migration of the image tool onto OpenCV.js plus its test script. Nothing
   in Phase 1 touched or committed this — flagging so the Developer agent
   doesn't assume `main` is clean.

9. **No CI pipeline** (no `.github/workflows`) and no `npm test` script —
   `node test-filter-graph.mjs && node test-image-regions.mjs` is documented
   only in the README's prose, not automated anywhere.

10. **Legacy Python backend and its vendored dependencies remain in the repo**
    (`server.py`, `vendor/imageio_ffmpeg/`, `__pycache__/`) with nothing
    referencing them. Not urgent, but it's ~500 lines + a vendored package
    that will confuse anyone reading the repo cold, and the README already
    flags it as historical.

## Not found (explicitly out of scope until built)

Cropping, resizing, generalized compression controls, a "quality enhancement"
step, and any queueing/job-pipeline infrastructure — none of this exists today
for either tool. Treat any Phase-3/5 task that assumes these exist as new
feature work, not a bug report.
