// Self-check for the image cropper's geometry. The functions are pure but live in a classic
// browser script, so they are sliced out of the source with the DOM globals they read stubbed.
// Run: node test-crop-geometry.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/crop-image/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const clampLine = source.match(/^const clamp = .*$/m);
assert.ok(clampLine, 'clamp helper is missing');

const CANVAS = { width: 400, height: 300 };
const state = { crop: { x: 0, y: 0, w: 100, h: 100, aspect: null } };

const { constrainCrop, handleAt, insideCrop, rectFrom } = new Function(
  'state',
  'cropCanvas',
  `${clampLine[0]}
   ${source.match(/^const HANDLE_HIT = \d+;$/m)[0]}
   ${extract('constrainCrop')}\n${extract('handleAt')}\n${extract('insideCrop')}\n${extract('rectFrom')}
   return { constrainCrop, handleAt, insideCrop, rectFrom };`
)(state, CANVAS);

const setCrop = (x, y, w, h, aspect = null) => Object.assign(state.crop, { x, y, w, h, aspect });

// A corner hit wins anywhere within the handle radius; the middle of a large box does not.
setCrop(100, 50, 200, 150);
assert.equal(handleAt(100, 50), 'tl');
assert.equal(handleAt(300, 50), 'tr');
assert.equal(handleAt(105, 55), 'tl', 'near-miss on a corner still grabs the handle');
assert.equal(handleAt(300, 200), 'br');
assert.equal(handleAt(200, 125), null, 'the middle of the box is not a handle');
assert.equal(insideCrop(200, 125), true);
assert.equal(insideCrop(99, 125), false);

// Dragging up-left from an anchor keeps the anchor as the far corner.
assert.deepEqual(rectFrom(300, 200, 100, 50), { x: 100, y: 50, w: 200, h: 150 });
assert.deepEqual(rectFrom(100, 50, 300, 200), { x: 100, y: 50, w: 200, h: 150 });

// With a locked ratio the height follows the width, whichever way the pointer moves.
state.crop.aspect = '16:9';
const wide = rectFrom(0, 0, 160, 5);
assert.equal(wide.w, 160);
assert.ok(Math.abs(wide.h - 90) < 1e-9, `expected 90, got ${wide.h}`);
const upward = rectFrom(200, 200, 40, 190);
assert.equal(upward.x, 40);
assert.ok(Math.abs(upward.y - (200 - 90)) < 1e-9, 'anchor stays the bottom edge when dragging up');

// Clamping a locked box shrinks both sides together, so it never goes off-ratio.
setCrop(300, 250, 320, 180, '16:9');
constrainCrop();
assert.ok(state.crop.x + state.crop.w <= CANVAS.width + 1e-9, 'stays inside the canvas width');
assert.ok(state.crop.y + state.crop.h <= CANVAS.height + 1e-9, 'stays inside the canvas height');
assert.ok(Math.abs(state.crop.w / state.crop.h - 16 / 9) < 1e-9, 'ratio survives clamping');

// A free box dragged past the edge keeps its size and slides back inside.
setCrop(380, 290, 300, 220);
constrainCrop();
assert.deepEqual(state.crop, { x: 100, y: 80, w: 300, h: 220, aspect: null });

// An oversized box is capped to the canvas, never larger.
setCrop(-50, -50, 900, 900);
constrainCrop();
assert.deepEqual(state.crop, { x: 0, y: 0, w: 400, h: 300, aspect: null });

console.log('crop geometry: all checks passed');
