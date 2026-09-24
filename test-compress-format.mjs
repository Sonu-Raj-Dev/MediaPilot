// Self-check for the image compressor's format routing and savings maths. Pure functions
// sliced out of the classic browser script.
// Run: node test-compress-format.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/compress-image/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const { autoType, targetType, qualityApplies, savingsPercentOf, extensionFor, qualityDescription } =
  new Function(
    `${extract('autoType')}\n${extract('targetType')}\n${extract('qualityApplies')}
     ${extract('savingsPercentOf')}\n${extract('extensionFor')}\n${extract('qualityDescription')}
     return { autoType, targetType, qualityApplies, savingsPercentOf, extensionFor, qualityDescription };`
  )();

// Auto leaves already-lossy formats alone.
assert.equal(autoType('image/jpeg'), 'image/jpeg');
assert.equal(autoType('image/webp'), 'image/webp');

// PNG and GIF must not stay as they are: canvas ignores quality for PNG, so "compressing" one
// returns the same bytes or more. WebP is the only target that is both lossy and keeps alpha.
assert.equal(autoType('image/png'), 'image/webp', 'PNG must be rerouted or compression does nothing');
assert.equal(autoType('image/gif'), 'image/webp');
assert.equal(autoType(''), 'image/webp');
assert.notEqual(autoType('image/png'), 'image/jpeg', 'auto must never silently drop transparency');

// An explicit choice always wins over auto.
assert.equal(targetType('image/png', 'image/jpeg'), 'image/jpeg');
assert.equal(targetType('image/jpeg', ''), 'image/jpeg');

// The quality slider is meaningless for PNG and must be reported as such.
assert.equal(qualityApplies('image/png'), false);
assert.equal(qualityApplies('image/jpeg'), true);
assert.equal(qualityApplies('image/webp'), true);

// Savings, including the case that matters: a file that got BIGGER must read as negative.
assert.equal(savingsPercentOf(1000, 250), 75);
assert.equal(savingsPercentOf(1000, 1000), 0);
assert.equal(savingsPercentOf(1000, 1500), -50, 'growth must not be reported as a saving');
assert.equal(savingsPercentOf(0, 100), 0, 'no division by zero on an empty source');

assert.equal(extensionFor('image/webp'), 'webp');
assert.equal(extensionFor('image/jpeg'), 'jpg');
assert.equal(extensionFor('image/png'), 'png');

// The hint must change across the range, or the slider tells the user nothing.
const hints = [100, 80, 50, 10].map(qualityDescription);
assert.equal(new Set(hints).size, 4, `each band needs its own hint, got ${JSON.stringify(hints)}`);

console.log('compress format: all checks passed');
