// Self-check for the image watermark removal pixel maths. The functions are pure, but the
// tool script is a classic browser script, so they are sliced out of the source.
// Run: node test-image-regions.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./tools/remove-watermark-image/app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const constants = source.match(/^const (?:PATCH_RADIUS|SOURCE_MARGIN|COMPARE_STEP|CANDIDATE_STRIDE|BLEND_STRENGTH|VERTICAL_BIAS) = [\d.]+;$/gm);
assert.equal(constants?.length, 6, 'inpaint constants are missing');

const { selectionToBox, selectionToOriginalBox, inpaintRegion, blurRegion } = new Function(
  `${constants.join('\n')}
   ${extract('patchIsSource')}\n${extract('fillWithBorderAverage')}
   ${extract('selectionToBox')}\n${extract('selectionToOriginalBox')}\n${extract('inpaintRegion')}\n${extract('blurRegion')}
   return { selectionToBox, selectionToOriginalBox, inpaintRegion, blurRegion };`
)();

const W = 40;
const H = 40;

// A grey field with a white "watermark" block in the middle.
function makeImage() {
  const pixels = new Uint8ClampedArray(W * H * 4).fill(128);
  for (let i = 3; i < pixels.length; i += 4) pixels[i] = 255;
  for (let y = 15; y < 25; y += 1) {
    for (let x = 15; x < 25; x += 1) {
      const i = (y * W + x) * 4;
      pixels[i] = 255; pixels[i + 1] = 255; pixels[i + 2] = 255;
    }
  }
  return pixels;
}

const at = (pixels, x, y) => [0, 1, 2].map((c) => pixels[(y * W + x) * 4 + c]);

// Selections are clamped to whole pixels inside the image, including ones drawn past the edge.
assert.deepEqual(selectionToBox({ x: 0.25, y: 0.5, w: 0.25, h: 0.25 }, 40, 40), { sx: 10, sy: 20, sw: 10, sh: 10 });
assert.deepEqual(selectionToOriginalBox({ x: 200 / 960, y: 150 / 540, w: 100 / 960, h: 50 / 540 }, 1920, 1080), {
  sx: 400,
  sy: 300,
  sw: 200,
  sh: 100,
});
const edge = selectionToBox({ x: 0.9, y: 0.9, w: 0.5, h: 0.5 }, 40, 40);
assert.ok(edge.sx + edge.sw <= 40 && edge.sy + edge.sh <= 40, 'box stays inside the image');

// Inpaint must replace the white block with the surrounding grey, not merely recolour it.
// The old greyscale pass left 255 here, which is the bug this guards against.
const inpainted = makeImage();
assert.deepEqual(at(inpainted, 20, 20), [255, 255, 255], 'watermark is white before');
inpaintRegion(inpainted, W, H, { sx: 15, sy: 15, sw: 10, sh: 10 });
assert.deepEqual(at(inpainted, 20, 20), [128, 128, 128], 'watermark centre matches the background');
assert.deepEqual(at(inpainted, 15, 15), [128, 128, 128], 'watermark corner matches the background');
assert.deepEqual(at(inpainted, 5, 5), [128, 128, 128], 'pixels outside the box are untouched');
assert.equal(inpainted[(20 * W + 20) * 4 + 3], 255, 'alpha is preserved');

// A selection flush against the image edge must still produce valid pixels.
const flush = makeImage();
inpaintRegion(flush, W, H, { sx: 0, sy: 0, sw: 5, sh: 5 });
for (const value of at(flush, 0, 0)) {
  assert.ok(Number.isFinite(value) && value >= 0 && value <= 255, 'edge pixel stays a valid colour');
}

// A selection covering the whole image leaves nothing to copy from; it must not hang or throw.
const everything = makeImage();
inpaintRegion(everything, W, H, { sx: 0, sy: 0, sw: W, sh: H });
for (const value of at(everything, 20, 20)) assert.ok(Number.isFinite(value), 'full-image selection survives');

// The regression this replaced: border interpolation smeared a textured background into
// streaks. On vertical stripes the filled area must keep varying horizontally rather than
// collapsing into constant bands carried down each column.
const striped = new Uint8ClampedArray(W * H * 4);
for (let y = 0; y < H; y += 1) {
  for (let x = 0; x < W; x += 1) {
    const i = (y * W + x) * 4;
    const shade = x % 4 < 2 ? 40 : 210;
    striped[i] = shade; striped[i + 1] = shade; striped[i + 2] = shade; striped[i + 3] = 255;
  }
}
for (let y = 16; y < 24; y += 1) {
  for (let x = 16; x < 24; x += 1) {
    const i = (y * W + x) * 4;
    striped[i] = 255; striped[i + 1] = 255; striped[i + 2] = 255;
  }
}
inpaintRegion(striped, W, H, { sx: 16, sy: 16, sw: 8, sh: 8 });
const row = [];
for (let x = 16; x < 24; x += 1) row.push(striped[(20 * W + x) * 4]);
assert.ok(new Set(row).size > 1, `filled row keeps stripe contrast, got ${row.join(',')}`);
assert.ok(Math.max(...row) - Math.min(...row) > 80, `stripes survive rather than averaging out: ${row.join(',')}`);

// Blur must change the marked area while leaving the rest of the image alone. The app picks a
// radius of half the shorter side so the centre of a solid mark still reaches outside the box;
// a radius too small to escape the mark would leave the centre at 255.
const blurred = makeImage();
const outside = at(blurred, 5, 5);
blurRegion(blurred, W, H, { sx: 15, sy: 15, sw: 10, sh: 10 }, 5);
assert.ok(at(blurred, 20, 20)[0] < 255, 'blurred centre pulls in the surrounding background');
assert.deepEqual(at(blurred, 5, 5), outside, 'pixels outside the box are untouched');

console.log('image region checks passed');
