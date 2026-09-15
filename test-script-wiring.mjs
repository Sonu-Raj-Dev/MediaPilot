// Guards which app.js each page actually loads. tools/remove-watermark-video/app.js looks
// like "the video tool's script" by path but is orphaned — the video pages load the root
// app.js instead (see docs/known-issues.md #2). This pins that wiring so a future change
// can't silently repoint a page at the wrong (or a newly-dead) script without a test failing.
// Run: node test-script-wiring.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

function scriptSrcs(htmlPath) {
  const html = fs.readFileSync(new URL(htmlPath, import.meta.url), 'utf8');
  return [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
}

assert.deepEqual(
  scriptSrcs('./index.html'),
  ['/app.js'],
  'home page must load the root app.js'
);

assert.deepEqual(
  scriptSrcs('./tools/remove-watermark-video/index.html'),
  ['/app.js'],
  'video tool page must load the root app.js, not its own (orphaned) app.js'
);

assert.deepEqual(
  scriptSrcs('./tools/remove-watermark-image/index.html'),
  ['/vendor/opencv.js', '/tools/remove-watermark-image/app.js'],
  'image tool page must load opencv.js then its own app.js'
);

console.log('script wiring checks passed');
