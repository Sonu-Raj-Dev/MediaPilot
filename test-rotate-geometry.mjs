// Self-check for the rotate/flip geometry. The functions are pure but live in a classic browser
// script, so they are sliced out of the source.
// Run: node test-rotate-geometry.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/rotate-image/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const { outputSize, matrixFor, mapPoint, describeTransform, outputType, extensionFor } = new Function(
  `${extract('outputSize')}
   ${extract('matrixFor')}
   ${extract('mapPoint')}
   ${extract('describeTransform')}
   ${extract('outputType')}
   ${extract('extensionFor')}
   return { outputSize, matrixFor, mapPoint, describeTransform, outputType, extensionFor };`
)();

// A quarter turn swaps the sides; a half turn does not. This is the whole reason the export
// canvas cannot just reuse the source dimensions.
assert.deepEqual(outputSize(1920, 1080, 0), { width: 1920, height: 1080 });
assert.deepEqual(outputSize(1920, 1080, 90), { width: 1080, height: 1920 });
assert.deepEqual(outputSize(1920, 1080, 180), { width: 1920, height: 1080 });
assert.deepEqual(outputSize(1920, 1080, 270), { width: 1080, height: 1920 });

// A portrait phone photo turned upright must come out landscape, not stay portrait.
assert.deepEqual(outputSize(3024, 4032, 90), { width: 4032, height: 3024 });

// Quarter turns must use exact 0/±1, not Math.cos(Math.PI/2) = 6.1e-17. A near-zero term puts
// the image on a fractional offset and the "lossless" 90 degree rotation resamples every pixel.
for (const rotation of [0, 90, 180, 270]) {
  const m = matrixFor(100, 100, rotation, false, false);
  for (const term of ['a', 'b', 'c', 'd']) {
    assert.ok(
      Number.isInteger(m[term]),
      `matrix term ${term} at ${rotation}deg is ${m[term]}, expected exactly -1, 0 or 1`,
    );
  }
}

// Where the source's top-left corner lands. This is the check that pins the ORDER of rotation
// and mirroring: the flips act on the screen's axes, after the turn. Get it backwards and
// "flip horizontal" mirrors the picture vertically once the user has rotated 90 degrees.
const W = 200;
const H = 100;
const TL = (rotation, flipH, flipV) => mapPoint(W, H, rotation, flipH, flipV, 0, 0);

// No transform: the corner stays put.
assert.deepEqual(TL(0, false, false), { x: 0, y: 0 });
// Mirror left-right: it crosses to the right edge, same row.
assert.deepEqual(TL(0, true, false), { x: W, y: 0 });
// Mirror top-bottom: same column, bottom row.
assert.deepEqual(TL(0, false, true), { x: 0, y: H });
// Half turn: opposite corner.
assert.deepEqual(TL(180, false, false), { x: W, y: H });

// Quarter turn clockwise, into a 100x200 box: the top-left goes to the top-RIGHT.
assert.deepEqual(TL(90, false, false), { x: H, y: 0 });
// ...and counter-clockwise it goes to the bottom-left.
assert.deepEqual(TL(270, false, false), { x: 0, y: W });

// The ordering case. After 90deg CW the corner sits top-right; a HORIZONTAL flip must move it
// across to the top-LEFT (x changes, y does not). If the mirror were applied in the image's own
// rotated axes it would move down instead, to { x: H, y: W }.
assert.deepEqual(TL(90, true, false), { x: 0, y: 0 });
assert.notDeepEqual(TL(90, true, false), { x: H, y: W });
// And a VERTICAL flip after the same turn moves it down the right edge, not across.
assert.deepEqual(TL(90, false, true), { x: H, y: W });

// Both flips together are a half turn of the already-rotated result.
assert.deepEqual(TL(90, true, true), { x: 0, y: W });

// Every corner of the source must land on a distinct corner of the output — no transform may
// fold two corners onto one another.
for (const rotation of [0, 90, 180, 270]) {
  for (const flipH of [false, true]) {
    for (const flipV of [false, true]) {
      const corners = [[0, 0], [W, 0], [0, H], [W, H]]
        .map(([x, y]) => mapPoint(W, H, rotation, flipH, flipV, x, y))
        .map((p) => `${p.x},${p.y}`);
      assert.equal(
        new Set(corners).size,
        4,
        `corners collapse at ${rotation}deg flipH=${flipH} flipV=${flipV}: ${corners.join(' ')}`,
      );
    }
  }
}

// The readout a user checks before downloading.
assert.equal(describeTransform(0, false, false), 'Original orientation');
assert.equal(describeTransform(90, false, false), 'Rotated 90°');
assert.equal(describeTransform(0, true, false), 'Flipped horizontally');
assert.equal(describeTransform(180, true, true), 'Rotated 180°, flipped horizontally, flipped vertically');

// Format is carried over from the source unless the user picks one. Getting this wrong is how a
// 1 MB JPEG turns into a 9 MB PNG.
assert.equal(outputType({ type: 'image/jpeg' }, ''), 'image/jpeg');
assert.equal(outputType({ type: 'image/png' }, ''), 'image/png');
assert.equal(outputType({ type: 'image/webp' }, ''), 'image/webp');
assert.equal(outputType({ type: 'image/jpeg' }, 'image/png'), 'image/png');
// GIF cannot be written by canvas, so it falls back rather than failing silently.
assert.equal(outputType({ type: 'image/gif' }, ''), 'image/png');
assert.equal(outputType({ type: '' }, ''), 'image/png');

assert.equal(extensionFor('image/jpeg'), 'jpg');
assert.equal(extensionFor('image/png'), 'png');
assert.equal(extensionFor('image/webp'), 'webp');

console.log('rotate geometry checks passed');
