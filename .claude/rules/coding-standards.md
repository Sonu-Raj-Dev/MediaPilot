# Coding Standards — MediaPilot

Match what's already here. Do not introduce a framework, bundler, TypeScript,
or a new dependency to solve something a few lines of vanilla JS or a native
platform feature already covers — that's the existing style of this codebase
(see `docs/architecture.md`), not a new constraint being imposed on it.

## JS

- Vanilla ES modules / classic scripts, no framework, no build-time transform.
  Each page's `app.js` is loaded directly by `<script src="...">` — keep it
  that way unless a human approves adding a bundler.
- Follow the existing pattern of extracting pure functions to the top of a
  file (`clampInt`, `toPixelBoxes`, `buildFilterGraph`, `selectionToBox`, …) so
  they stay testable by the existing "slice function text out of the source
  and `new Function()` it" pattern in `test-filter-graph.mjs` /
  `test-image-regions.mjs`. Don't fight this pattern by wrapping new logic in
  closures that can't be extracted the same way.
- `$`/`$$` helpers, `state` object, `showToast`, `t()`/`translatePage()` — 
  reuse these, don't reinvent per-file equivalents.
- New user-facing strings need an i18n key with at minimum an EN value in
  `ENGLISH_TRANSLATIONS`. Don't hardcode English text into the DOM directly if
  a `data-i18n` attribute can carry it — but don't block a fix on translating
  into all 15 locales either; English fallback is the existing, accepted
  behavior (see `docs/known-issues.md` #4).
- Comment only the non-obvious "why" (see the existing `ponytail:` comments
  and filter-graph comments in `app.js` for the house style) — not the what.

## Python (`server.py`, legacy/unused)

Treat as reference-only unless a human explicitly approves reviving it (HIGH
risk per `safety.md`). Don't "clean up" or refactor code nothing calls; if it
needs to change, that's a deletion decision, which needs the same evidence
and approval as any other deletion.

## File placement

- Shared logic used by the home page and the video tool page goes in the
  root `app.js` (that's what both currently load) — not in
  `tools/remove-watermark-video/app.js`, which is dead (see
  `docs/known-issues.md` #2). Confirm which `app.js` a page's `<script>` tag
  actually loads before editing.
- Image-tool-only logic goes in `tools/remove-watermark-image/app.js`.
- New tools follow the existing `tools/<tool-slug>/{index.html,app.js}`
  layout and get added to `scripts/build-static.mjs`'s copy step
  automatically (it copies the whole `tools/` directory) and to the home page
  tool index in `index.html`.

## CSS

Single `styles.css`, no preprocessor. Match existing custom-property usage
(`var(--accent)`, etc.) and class naming (`kebab-case`, BEM-ish compound
classes like `.mode-option.active`).

## Dependencies

Adding an npm package or a new CDN script requires the same justification as
any other non-trivial change: what does it replace, and why can't stdlib /
Canvas / an already-loaded library (ffmpeg.wasm, OpenCV.js) do it. Runtime
CDN loads (like `@ffmpeg/ffmpeg` today) must be version-pinned, as the
existing `FFMPEG_DIST`/`FFMPEG_CORE` constants already are.
