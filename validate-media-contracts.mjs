// Regression guard for media-output contracts documented in
// docs/media-health-monitoring.md. This is NOT pixel-level quality testing (that needs real
// media fixtures + ffprobe, which this repo doesn't have — see that doc's "fixture-able" rows).
// It asserts the *source* still makes the promises the docs describe, so a silent, unreviewed
// change to output format/dimensions/compression fails a test instead of just docs going stale.
// Run: node validate-media-contracts.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// --- Image tool: tools/remove-watermark-image/app.js -----------------------------------
const imageSrc = read('./tools/remove-watermark-image/app.js');

// Output canvas is always sized from the *original* (input) dimensions — there is no resize
// feature, so output dimensions must always equal input dimensions and aspect ratio can't drift.
assert.match(
  imageSrc,
  /outputCanvas\.width\s*=\s*originalWidth;/,
  'image output width must be sourced from the original image width (no resize exists)'
);
assert.match(
  imageSrc,
  /outputCanvas\.height\s*=\s*originalHeight;/,
  'image output height must be sourced from the original image height (no resize exists)'
);

// Output is always lossless PNG regardless of input format.
assert.match(
  imageSrc,
  /toDataURL\(\s*['"]image\/png['"]/,
  'image output must stay PNG (lossless) — a silent switch to a lossy format needs a deliberate doc + test update'
);

// --- Video tool: app.js (the LIVE path — see docs/known-issues.md #2 for why not the
// tools/remove-watermark-video/app.js file of the same name) -----------------------------
const videoSrc = read('./app.js');

// Anchored on '-filter_complex', which only appears in cleanVideo()'s encode call — app.js also
// has an earlier, unrelated runEngine() call (the AVI/MKV/WMV metadata probe) that a plain
// "await runEngine(engine, [" search would match first.
const filterComplexAt = videoSrc.indexOf("'-filter_complex'");
assert.notEqual(filterComplexAt, -1, 'the ffmpeg encode call in app.js has moved or been renamed — update this check');
const runEngineCallStart = videoSrc.lastIndexOf('await runEngine(engine, [', filterComplexAt);
assert.notEqual(runEngineCallStart, -1, 'could not find the start of the encode call — update this check');
const runEngineCallEnd = videoSrc.indexOf(']);', filterComplexAt);
const encodeArgs = videoSrc.slice(runEngineCallStart, runEngineCallEnd);

// Compression settings are pinned. A change here is a real, deliberate product decision
// (quality/size tradeoff) — this test forces it to be visible in a diff, not silent.
for (const literal of ["'libx264'", "'-crf', '23'", "'-preset', 'veryfast'", "'yuv420p'", "'aac'"]) {
  assert.ok(encodeArgs.includes(literal), `expected pinned encode setting ${literal} in the ffmpeg exec call`);
}

// Output container is always MP4 regardless of input container (MP4/MOV/WebM/AVI/MKV/WMV in).
assert.ok(encodeArgs.includes("'cleaned.mp4'"), 'video output must always be named/muxed as .mp4');

// No whole-frame resize/scale flag on the top-level exec call — only buildFilterGraph's
// per-box crop+scale (used for the pixelate effect inside a marked box) may reference "scale",
// and that lives in the `graph` variable, not as a literal arg here. A literal '-s' or '-vf'
// flag on this call would resize/reformat the whole frame outside that documented per-box path.
assert.ok(!/(^|[,\s])'-s'/.test(encodeArgs), 'no top-level -s (resize) flag expected — resolution must pass through unchanged');
assert.ok(!/(^|[,\s])'-vf'/.test(encodeArgs), 'no separate -vf flag expected — frame-affecting filters must go through filter_complex/buildFilterGraph only');

console.log('media output contract checks passed');
