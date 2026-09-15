# Media Health Monitoring — Specification

What to watch for each processing pipeline, and — honestly — what's
automatable today versus what needs infrastructure that doesn't exist yet
(`docs/known-issues.md` #7: no analytics, no error monitoring, no production
logs). Marked per item:
- **[automated]** — a script exists now (see below), runs with the other
  checks, no fixtures/services required.
- **[fixture-able]** — could be automated with sample media files + a tool
  like `ffprobe`, neither of which is set up here; a real, scoped task, not
  invented blindly.
- **[needs telemetry]** — requires production analytics/error-reporting that
  doesn't exist; Autopilot cannot observe this until that's built
  (`docs/scheduling.md`, `.claude/agents/analytics.md`).

Note throughout: MediaPilot has **no crop or resize feature for either tool**
today (`docs/media-processing.md`, "what's NOT implemented"). Checks below
that assume those features are marked accordingly — they're forward-looking
specs, not descriptions of a bug in something that exists.

## Image (`tools/remove-watermark-image/app.js`, `cv.inpaint` path)

| Check | Status | Notes |
|---|---|---|
| Crop correctness | N/A | no crop feature exists |
| Aspect ratio preserved | **[automated]** | `validate-media-contracts.mjs` — output canvas dimensions are always sourced from input dimensions (`processImage()`), so aspect ratio cannot drift; regression-guarded |
| Resize correctness | N/A | no resize feature exists |
| Output dimensions == input dimensions | **[automated]** | same script — this is the current, intentional contract (no resize) |
| Image quality (visual) | [fixture-able] | needs sample images + a perceptual-diff tool (e.g. SSIM) — propose as a scoped task if/when sample fixtures are added, don't fabricate a quality metric without one |
| Compression | **[automated]** | output is always lossless PNG (`toDataURL('image/png')`) — script asserts the code path never switches to a lossy encode silently |
| Format conversion (any input → PNG) | **[automated]** | same script — asserts `processImage()`'s export call is always `image/png` |
| Processing time | [needs telemetry] | client-side timing exists nowhere yet; Analytics agent's spec covers instrumenting it |
| Failed jobs | [needs telemetry] | `catch` block exists (`showError`) but nothing records failure *rate* today |

## Video (`app.js`, ffmpeg.wasm path)

| Check | Status | Notes |
|---|---|---|
| Crop correctness | N/A | no crop feature; watermark-box geometry is a different concept, already covered by `test-filter-graph.mjs` |
| Aspect ratio preserved | **[automated]** | `validate-media-contracts.mjs` — the encode args never include a frame-level `scale`/`setdar`/`setsar` on the output stream, so source aspect ratio passes through unchanged |
| Resize correctness | N/A | no resize feature exists |
| Resolution preserved | **[automated]** | same reasoning as aspect ratio — no output-resolution-changing filter in the graph |
| FPS | [fixture-able] | `-fps_mode passthrough` is set (source FPS preserved by design — visible in `app.js`), but verifying actual output FPS needs `ffprobe` on a real encoded file |
| Audio synchronization | [fixture-able] | audio is stream-copied (`-c:a aac`, `-map 0:a?`), not re-timed — drift would only come from a real encode; needs a sample file + `ffprobe`/duration comparison to verify, not assertable from source alone |
| Output corruption / integrity | [fixture-able] | needs an actual encoded sample to probe; source-level check can only confirm the command *should* produce valid MP4, not that it did |
| Compression | **[automated]** | encode args are pinned (`libx264`, `-crf 23`, `-preset veryfast`) — script guards against a silent change to these without an explicit decision |
| Processing time | [needs telemetry] | no client-side timing instrumentation exists yet |
| Memory usage | [needs telemetry] | browser-side only, no reporting mechanism exists |
| Failed jobs | [needs telemetry] | errors surface via `showToast`/`finishWithError` in the live UI, but nothing aggregates a failure rate |
| Timeout | [needs telemetry] — **and a known gap** | `docs/known-issues.md` #3: there is no timeout at all today, so there's nothing to "monitor" yet; the fix (adding one) is a backlog item, not a monitoring task |

## What `validate-media-contracts.mjs` actually checks

Following the existing repo pattern (`test-filter-graph.mjs`,
`test-image-regions.mjs`, `test-script-wiring.mjs`): extract the relevant
source text and assert structural invariants. This is **not** pixel-level
quality testing — it's a regression guard that a silent, unreviewed change
to output format/dimensions/compression settings gets caught immediately,
which is the realistic, honest version of "automated validation" available
without media fixtures or an `ffprobe` dependency.

## Next real step if you want the [fixture-able] row filled in

Add a small `fixtures/` directory with 1–2 tiny sample files (a few-KB test
image and a 1–2 second test video) and a dependency on `ffprobe` (via
`@ffmpeg/ffmpeg` itself, already used at runtime, or a Node ffprobe wrapper)
to actually decode and measure output. That's real, scoped follow-up work —
flagged in `.claude/tasks/backlog.md`, not built speculatively here.
