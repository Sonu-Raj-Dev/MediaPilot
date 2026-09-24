// Self-check for the image converter's format and transparency rules. Pure functions sliced
// out of the classic browser script.
// Run: node test-convert-format.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/convert-image/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const { keepsTransparency, qualityApplies, needsFlatten, savingsPercentOf, extensionFor, labelFor } =
  new Function(
    `${extract('keepsTransparency')}\n${extract('qualityApplies')}\n${extract('needsFlatten')}
     ${extract('savingsPercentOf')}\n${extract('extensionFor')}\n${extract('labelFor')}
     return { keepsTransparency, qualityApplies, needsFlatten, savingsPercentOf, extensionFor, labelFor };`
  )();

// Only JPEG lacks an alpha channel.
assert.equal(keepsTransparency('image/png'), true);
assert.equal(keepsTransparency('image/webp'), true);
assert.equal(keepsTransparency('image/jpeg'), false);

// Quality is meaningless for PNG.
assert.equal(qualityApplies('image/png'), false);
assert.equal(qualityApplies('image/jpeg'), true);
assert.equal(qualityApplies('image/webp'), true);

// The flattening rule: a transparent source going to JPG is the ONLY case that needs a
// background colour. Everything else must not nag the user with a colour picker.
assert.equal(needsFlatten(true, 'image/jpeg'), true, 'transparent -> JPG must flatten');
assert.equal(needsFlatten(true, 'image/png'), false, 'PNG keeps alpha, no flattening');
assert.equal(needsFlatten(true, 'image/webp'), false, 'WebP keeps alpha, no flattening');
assert.equal(needsFlatten(false, 'image/jpeg'), false, 'an opaque source needs no background');
assert.equal(needsFlatten(false, 'image/png'), false);

// Savings, including a conversion that grows the file (PNG from a JPG usually does).
assert.equal(savingsPercentOf(1000, 400), 60);
assert.equal(savingsPercentOf(1000, 2500), -150, 'growth must read as negative, not a saving');
assert.equal(savingsPercentOf(0, 100), 0);

assert.equal(extensionFor('image/jpeg'), 'jpg');
assert.equal(extensionFor('image/png'), 'png');
assert.equal(extensionFor('image/webp'), 'webp');
assert.equal(extensionFor('image/gif'), 'png', 'an unwritable type falls back to png');

assert.equal(labelFor('image/jpeg'), 'JPG');
assert.equal(labelFor('image/webp'), 'WebP');
assert.equal(labelFor('image/gif'), 'GIF', 'the source label covers read-only formats too');
assert.equal(labelFor('application/pdf'), 'Image');

console.log('convert format: all checks passed');
