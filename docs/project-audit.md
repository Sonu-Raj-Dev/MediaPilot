# MediaPilot — Project Audit (Phase 1)

Audited 2026-09-15, read-only — no application behavior was changed. Full
detail lives in the companion docs; this is the index and executive summary.

- [architecture.md](architecture.md) — component map, frontend, "backend" (none), build/deploy, dependencies
- [media-processing.md](media-processing.md) — the video and image pipelines, exactly what runs and what doesn't
- [deployment.md](deployment.md) — Cloudflare Workers static assets, build, no CI/CD
- [testing.md](testing.md) — the two existing test scripts, and why one of them tests the wrong code
- [known-issues.md](known-issues.md) — 10 findings, ranked by severity

## What MediaPilot is

A static, client-side site (Cloudflare Workers static assets, `dist/`) with two
tools: **remove a logo/watermark from a video** (ffmpeg.wasm, runs in-browser)
and **remove a watermark from an image** (OpenCV.js `cv.inpaint`, runs
in-browser). No production backend, no database, no accounts, no analytics, no
ads, no CI. A legacy Python/OpenCV backend (`server.py`) exists but is unused.

## Top findings

1. The image tool's test suite (`test-image-regions.mjs`) tests a ~250-line
   custom inpainting algorithm that the shipped code **does not call** — the
   real path (`cv.inpaint` via OpenCV.js) has zero test coverage. This is the
   single highest-value fix available: either wire in the tested algorithm or
   retarget the tests at what ships.
2. `tools/remove-watermark-video/app.js` is dead code (calls a backend API
   that isn't deployed); the live video logic is in the root `app.js`, loaded
   by the tool page instead. Anyone editing "the video tool" by folder
   structure will edit the wrong file.
3. No SEO fundamentals (robots.txt, sitemap, canonical, structured data,
   per-page meta descriptions) and no analytics/monetization instrumentation
   exist at all — the SEO/Analytics/Revenue agents in Phase 3 are starting
   from zero, not tuning an existing setup.
4. No CI, no `npm test` entry point, no processing timeout/cancel for the
   video pipeline, and i18n coverage is inconsistent across 15 locales.

See [known-issues.md](known-issues.md) for the full list with severities.

## Scope not implemented today

Cropping, resizing, generic compression controls, and any "quality
enhancement" step do not exist for either tool — only watermark/logo removal
does. Treat requests referencing these as new features, not bugs.

## What Phase 1 did NOT do

- Did not modify `app.js`, either tool, `server.py`, `styles.css`, or any
  build/deploy config.
- Did not commit, revert, or stash the pre-existing uncommitted work found on
  `main` (see known-issues.md #8) — it was carried onto the
  `agents/audit-and-agent-system` branch this audit and the Phase 2 agent
  scaffolding live on.
- Did not run `wrangler deploy` or otherwise touch production.
