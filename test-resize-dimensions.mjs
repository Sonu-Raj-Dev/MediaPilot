// Self-check for the image resizer's aspect maths. The function is pure but lives in a classic
// browser script, so it is sliced out of the source.
// Run: node test-resize-dimensions.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/resize-image/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const { matchAspect, outputType, extensionFor } = new Function(
  `${source.match(/^const clamp = .*$/m)[0]}
   ${source.match(/^const MAX_SIDE = \d+;$/m)[0]}
   ${extract('matchAspect')}\n${extract('outputType')}\n${extract('extensionFor')}
   return { matchAspect, outputType, extensionFor };`
)();

// Editing either side keeps the ratio, to the nearest whole pixel.
assert.deepEqual(matchAspect(1600, 900, { width: 800 }, 'width'), { width: 800, height: 450 });
assert.deepEqual(matchAspect(1600, 900, { height: 450 }, 'height'), { width: 800, height: 450 });
assert.deepEqual(matchAspect(1000, 1000, { width: 300 }, 'width'), { width: 300, height: 300 });

// Portrait sources must not be silently turned landscape.
const portrait = matchAspect(720, 1280, { width: 360 }, 'width');
assert.deepEqual(portrait, { width: 360, height: 640 });
assert.ok(portrait.height > portrait.width, 'a portrait image must stay portrait');

// A very small target still produces a usable image rather than a zero-sized one.
const tiny = matchAspect(4000, 10, { width: 1 }, 'width');
assert.equal(tiny.width, 1);
assert.ok(tiny.height >= 1, 'height must never round down to zero');

// Junk and out-of-range input is clamped, not passed through to the canvas.
assert.equal(matchAspect(800, 600, { width: 0 }, 'width').width, 1);
assert.equal(matchAspect(800, 600, { width: NaN }, 'width').width, 1);
assert.equal(matchAspect(800, 600, { width: 99999 }, 'width').width, 20000);

// GIF cannot be written by canvas, so it falls back to PNG rather than failing silently.
assert.equal(outputType({ type: 'image/gif' }, ''), 'image/png');
assert.equal(outputType({ type: 'image/jpeg' }, ''), 'image/jpeg');
assert.equal(outputType({ type: 'image/gif' }, 'image/webp'), 'image/webp', 'an explicit choice wins');
assert.equal(outputType({ type: '' }, ''), 'image/png');

assert.equal(extensionFor('image/jpeg'), 'jpg');
assert.equal(extensionFor('image/webp'), 'webp');
assert.equal(extensionFor('image/unknown'), 'png');

console.log('resize dimensions: all checks passed');
