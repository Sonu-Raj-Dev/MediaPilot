# MediaPilot — Architecture

## Summary

MediaPilot is a **static, client-side web app**. There is no application server in
production: the deployed site is a folder of HTML/CSS/JS served by Cloudflare
Workers as static assets. All media processing (video re-encoding, image inpainting)
runs in the visitor's browser using WebAssembly and Canvas — uploaded files never
leave the device.

A legacy Python backend (`server.py`) exists in the repo but is **not wired to
anything** in the current frontend. See [known-issues.md](known-issues.md).

## Component map

```
MediaPilot/
├── index.html + app.js + styles.css   Home page + Video tool page (shared app.js)
├── tools/
│   ├── remove-watermark-video/        Video tool's OWN html/js — html unused-path,
│   │   ├── index.html                 its <script> tag loads /app.js (root), not
│   │   └── app.js                     this file. This app.js is dead code (§ known-issues).
│   └── remove-watermark-image/
│       ├── index.html                 Image tool page
│       └── app.js                     Image tool logic — ships OpenCV.js
│                                       `cv.inpaint` (TELEA/NS); also contains ~250
│                                       lines of a DIFFERENT, unused custom
│                                       exemplar-inpaint implementation (§ known-issues)
├── vendor/opencv.js                   13 MB OpenCV.js build; loaded unconditionally
│                                       by the image tool's HTML AND is the algorithm
│                                       actually used (cv.inpaint) — large, but not dead
├── scripts/build-static.mjs           Build: assembles dist/ from source + vendor
├── dist/                              Build output; what Cloudflare actually serves
├── wrangler.jsonc                     Cloudflare Workers static-assets config
├── server.py + vendor/imageio_ffmpeg  Legacy Python/OpenCV backend — orphaned
├── test-filter-graph.mjs              Unit checks for the ffmpeg filter-graph builder
└── test-image-regions.mjs             Unit checks for image region/mask math
```

## Frontend

Plain HTML/CSS/vanilla JS — no framework, no bundler, no TypeScript, no npm build
step beyond copying files (`scripts/build-static.mjs`). Each page is a real,
separate HTML document (not a client-router SPA):

- `/` — home page listing tools, and (in the same DOM, toggled via `#toolView`)
  the video tool UI. `index.html` + `app.js` serve both.
- `/tools/remove-watermark-video` — its own `index.html`, but loads the **root**
  `/app.js`, so it shares all video logic and state code with the home page.
- `/tools/remove-watermark-image` — its own `index.html` and its own `app.js`,
  independent of the video code path. Also loads `vendor/opencv.js`.

State is a single in-memory `state` object per page (no store/framework). i18n is
a hand-written dictionary (`ENGLISH_TRANSLATIONS` + per-locale overrides spread
onto it) duplicated across `app.js` and `tools/remove-watermark-image/app.js`;
`localStorage['mediapilot-language']` persists the chosen locale. 15 locales are
defined; several are partial and fall back to English per-key (see
`t()`/`translatePage()`).

## "Backend"

There is none in production. The two `/api/...` fetch calls in
`tools/remove-watermark-video/app.js` (`/api/upload`, `/api/process`,
`/api/status/:id`) target `server.py`'s routes, but that file is not deployed and
that `app.js` is not loaded by any page — this is dead code from before the
ffmpeg.wasm migration.

`server.py` (`http.server`-based, threaded, in-memory job dict, `cv2` +
vendored `imageio_ffmpeg`) is kept in the repo only as a historical/local
reference implementation. See [media-processing.md](media-processing.md) and
[known-issues.md](known-issues.md).

## Build & deploy

`npm run build` runs `scripts/build-static.mjs`, which:
1. wipes `dist/`
2. copies `index.html`, `app.js`, `styles.css` into `dist/`
3. copies `@techstark/opencv-js`'s bundled `opencv.js` to both `vendor/opencv.js`
   (source tree, referenced by `tools/remove-watermark-image/index.html`) and
   `dist/vendor/opencv.js`
4. recursively copies `tools/` into `dist/tools/`

`npx wrangler deploy` then publishes `dist/` as a Cloudflare Workers static-asset
site (`wrangler.jsonc`, SPA fallback via `not_found_handling`). See
[deployment.md](deployment.md).

## Dependencies

- `@techstark/opencv-js` (npm, build-time only — copied into the static bundle,
  not imported by any build tooling)
- `@ffmpeg/ffmpeg` + `@ffmpeg/core` — loaded at **runtime** from jsDelivr CDN
  (`FFMPEG_DIST`/`FFMPEG_CORE` constants in `app.js`), not an npm dependency
- No server framework, no database, no ORM, no test framework, no CI config
  (`.github/` does not exist)

## Working-tree state at time of audit

`git status` on `main` showed substantial **uncommitted** changes (README,
`app.js`, both tools, `styles.css`, `build-static.mjs`, `package.json`, plus
untracked `vendor/opencv.js` and the two test files) — an in-progress migration
of the image tool and build pipeline. This audit describes the working tree as
found; nothing in Phase 1 was reverted or altered.
