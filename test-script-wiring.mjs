// Guards which scripts each page actually loads. tools/remove-watermark-video/app.js looks like
// "the video tool's script" by path but is orphaned — the video page loads the root app.js
// instead (see docs/known-issues.md #2). This pins that wiring so a future change can't silently
// repoint a page at the wrong (or a newly-dead) script without a test failing.
// Run: node test-script-wiring.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const TOOL_PAGES = [
  'crop-image',
  'resize-image',
  'compress-image',
  'convert-image',
  'rotate-image',
  'remove-watermark-image',
  'remove-watermark-video',
];

// The shared chrome (navbar, theme toggle, language dialog) every tool page mounts.
const SHELL = '/tool-shell.js';

function scriptSrcs(htmlPath) {
  const html = fs.readFileSync(new URL(htmlPath, import.meta.url), 'utf8');
  return [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g)].map((m) => m[1]);
}

// Scripts a page loads for its own behaviour, ignoring the shared shell.
const toolScripts = (path) => scriptSrcs(path).filter((src) => src !== SHELL);

// The home page has its own module and must NOT pull in /app.js: that script resolves the
// watermark tool's elements at top level and binds listeners to them, so on a page without that
// markup it throws and takes the rest of the page's scripts down with it.
const homeScripts = scriptSrcs('./index.html');
assert.deepEqual(homeScripts, ['/home.js'], 'home page loads only its own module');
assert.ok(!homeScripts.includes('/app.js'), 'home page must never load the tool script');

// Every tool page mounts the shared chrome, and it must not be loaded twice.
for (const page of TOOL_PAGES) {
  const srcs = scriptSrcs(`./tools/${page}/index.html`);
  assert.equal(
    srcs.filter((src) => src === SHELL).length,
    1,
    `${page} must load ${SHELL} exactly once`,
  );
}

assert.deepEqual(
  toolScripts('./tools/remove-watermark-video/index.html'),
  ['/app.js'],
  'video tool page must load the root app.js, not its own (orphaned) app.js',
);

assert.deepEqual(
  toolScripts('./tools/remove-watermark-image/index.html'),
  ['/vendor/opencv.js', '/tools/remove-watermark-image/app.js'],
  'image tool page must load opencv.js then its own app.js',
);

// The canvas-only tools each load exactly their own script and nothing else.
for (const page of ['crop-image', 'resize-image', 'compress-image', 'convert-image', 'rotate-image']) {
  const srcs = toolScripts(`./tools/${page}/index.html`);
  assert.equal(srcs.length, 1, `${page} should load one script of its own, got ${srcs.join(', ')}`);
  assert.ok(
    srcs[0].endsWith(`${page}/app.js`),
    `${page} must load its own app.js, got ${srcs[0]}`,
  );
  assert.ok(!srcs.includes('/app.js'), `${page} must not load the watermark tool's script`);
}

console.log('script wiring checks passed');
