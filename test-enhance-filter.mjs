// Self-check for the enhancer's filter builder. tools/enhance-video/app.js is a classic browser
// script, so its pure parts are sliced out of the source rather than imported.
// Run: node test-enhance-filter.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/enhance-video/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function slice(startToken, endToken) {
  const start = source.indexOf(startToken);
  assert.notEqual(start, -1, `${startToken} is missing from the enhancer`);
  const end = source.indexOf(endToken, start);
  assert.notEqual(end, -1, `${startToken} has no end`);
  return source.slice(start, end + endToken.length);
}

const fn = (name) => slice(`function ${name}(`, '\n}\n');

const { PRESETS, outputSizes, buildEnhanceFilter, scaledSize, previewTime } = new Function(
  `${slice('const PRESETS = {', '\n};\n')}
   ${fn('outputSizes')}
   ${fn('buildEnhanceFilter')}
   ${fn('scaledSize')}
   ${fn('previewTime')}
   return { PRESETS, outputSizes, buildEnhanceFilter, scaledSize, previewTime };`
)();

// Upscale targets are larger than the short side only; nothing is ever downscaled.
assert.deepEqual(outputSizes(854, 480), [720, 1080]);
assert.deepEqual(outputSizes(1280, 720), [1080]);
assert.deepEqual(outputSizes(1920, 1080), []);
assert.deepEqual(outputSizes(3840, 2160), []);
assert.deepEqual(outputSizes(720, 1280), [1080], 'vertical 720p measures the short side');
assert.deepEqual(outputSizes(480, 854), [720, 1080]);

// Whichever stages a preset uses run deinterlace -> denoise -> scale -> sharpen -> colour.
const STAGES = [/yadif=/, /(hqdn3d|nlmeans|atadenoise)=/, /scale=/, /unsharp=/, /eq=/];
for (const name of Object.keys(PRESETS)) {
  const chain = buildEnhanceFilter(name, 640, 360, 720);
  const found = STAGES.map((stage) => chain.search(stage)).filter((at) => at >= 0);
  assert.deepEqual(found, [...found].sort((a, b) => a - b), `${name}: stages out of order: ${chain}`);
  assert.ok(chain.includes('scale=') && chain.endsWith(PRESETS[name].color), `${name}: ${chain}`);
  if (name === 'old') assert.equal(chain.search(STAGES[0]), 0, 'old: deinterlace runs first');
  else assert.equal(chain.search(STAGES[0]), -1, `${name}: only the old-video preset deinterlaces`);
  if (chain.includes('unsharp=')) assert.match(chain, /unsharp=\d+:\d+:[\d.]+:\d+:\d+:0(,|$)/, `${name}: chroma is never sharpened`);
}

// Sharpening noisy footage measured worse than leaving it untouched, so the presets meant for
// noisy footage must never sharpen, and the soft-footage preset must.
for (const name of ['auto', 'lowlight', 'old']) {
  assert.ok(!buildEnhanceFilter(name, 640, 360, 0).includes('unsharp='), `${name} must not sharpen`);
  assert.match(buildEnhanceFilter(name, 640, 360, 0), STAGES[1], `${name} must denoise`);
}
assert.ok(buildEnhanceFilter('soft', 640, 360, 0).includes('unsharp='), 'soft must sharpen');

// Scale is added only for a real upscale, with -2 on the long side to keep it even.
assert.ok(buildEnhanceFilter('auto', 640, 360, 720).includes('scale=-2:720:flags=lanczos'));
assert.ok(buildEnhanceFilter('auto', 360, 640, 720).includes('scale=720:-2:flags=lanczos'));
assert.ok(!buildEnhanceFilter('auto', 1920, 1080, 0).includes('scale='));
assert.ok(!buildEnhanceFilter('auto', 1920, 1080, 720).includes('scale='), 'no downscale');
assert.ok(!buildEnhanceFilter('auto', 1280, 720, 720).includes('scale='), 'no same-size scale');

// yuv420p needs even dimensions: odd sources are trimmed, even ones untouched.
assert.ok(buildEnhanceFilter('auto', 641, 361, 0).includes('crop=trunc(iw/2)*2:trunc(ih/2)*2'));
assert.ok(!buildEnhanceFilter('auto', 640, 360, 0).includes('crop='));
assert.ok(!buildEnhanceFilter('auto', 641, 361, 720).includes('crop='), 'the upscale already evens it');

assert.throws(() => buildEnhanceFilter('nope', 640, 360, 0), /Unknown preset/);

// Output sizes shown in the UI match what ffmpeg will produce.
assert.deepEqual(scaledSize(640, 360, 720), [1280, 720]);
assert.deepEqual(scaledSize(640, 360, 1080), [1920, 1080]);
assert.deepEqual(scaledSize(360, 640, 720), [720, 1280]);
assert.deepEqual(scaledSize(1920, 1080, 0), [1920, 1080]);
assert.deepEqual(scaledSize(641, 361, 0), [640, 360]);

// The preview frame avoids the often-black first frame when there is room to.
assert.equal(previewTime(10), 0.5);
assert.ok(Math.abs(previewTime(1.2) - 0.4) < 1e-9, 'short clips sample a third of the way in');
assert.equal(previewTime(0.9), 0);
assert.equal(previewTime(0), 0);
assert.equal(previewTime(Infinity), 0);

console.log('enhance filter checks passed');
