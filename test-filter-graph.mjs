// Self-check for the ffmpeg filter builder in app.js. The functions are pure, but app.js is a
// classic browser script, so they are sliced out of the source rather than imported.
// Run: node test-filter-graph.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('./app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing from app.js`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const { clampInt, toPixelBoxes, buildFilterGraph } = new Function(
  `${extract('clampInt')}\n${extract('toPixelBoxes')}\n${extract('buildFilterGraph')}
   return { clampInt, toPixelBoxes, buildFilterGraph };`
)();

const W = 1920;
const H = 1080;

// A box in the middle of the frame keeps its pixel geometry.
const [middle] = toPixelBoxes([{ x: 0.5, y: 0.5, w: 0.1, h: 0.1 }], 'blur', 6, W, H);
assert.deepEqual(middle, { x: 960, y: 540, w: 192, h: 108 });

// delogo cannot read from outside the frame, so edge boxes are pulled inside it.
for (const region of [
  { x: 0, y: 0, w: 0.3, h: 0.3 },
  { x: 0.8, y: 0.8, w: 0.4, h: 0.4 },
  { x: -0.2, y: 0.95, w: 1.5, h: 0.5 },
]) {
  const [box] = toPixelBoxes([region], 'inpaint', 32, W, H);
  assert.ok(box.x >= 1 && box.y >= 1, `box starts inside the frame: ${JSON.stringify(box)}`);
  assert.ok(box.x + box.w < W, `box ends inside the frame width: ${JSON.stringify(box)}`);
  assert.ok(box.y + box.h < H, `box ends inside the frame height: ${JSON.stringify(box)}`);
}

// Zero-area selections leave nothing to clean and must not reach ffmpeg.
assert.throws(() => toPixelBoxes([{ x: 0.5, y: 0.5, w: 0, h: 0 }], 'inpaint', 6, W, H));

// Inpaint chains one delogo per box onto a single stream.
const inpaint = buildFilterGraph(
  toPixelBoxes([{ x: 0.1, y: 0.1, w: 0.2, h: 0.2 }, { x: 0.6, y: 0.6, w: 0.2, h: 0.2 }], 'inpaint', 6, W, H),
  'inpaint',
  6
);
assert.equal(inpaint.match(/delogo=/g).length, 2);
assert.ok(inpaint.startsWith('[0:v]') && inpaint.endsWith('[v]'));

// Blur and pixelate split, crop and overlay, so every intermediate label must be consumed
// exactly once and the graph must end on [v].
for (const mode of ['blur', 'pixelate']) {
  for (const count of [1, 2, 3]) {
    const regions = Array.from({ length: count }, (_, i) => ({ x: 0.1 + i * 0.2, y: 0.2, w: 0.1, h: 0.1 }));
    const graph = buildFilterGraph(toPixelBoxes(regions, mode, 6, W, H), mode, 6);
    assert.ok(graph.includes(`split=${count + 1}`), `${mode}/${count}: split fans out to every box`);
    assert.ok(graph.endsWith('[v]'), `${mode}/${count}: graph ends on [v]`);
    assert.equal(graph.match(/overlay=/g).length, count, `${mode}/${count}: one overlay per box`);
    for (const label of graph.match(/\[(?:bg|c\d+|e\d+|s\d+)\]/g)) {
      assert.equal(
        graph.split(label).length - 1,
        2,
        `${mode}/${count}: ${label} is produced once and consumed once`
      );
    }
  }
}

console.log('filter graph checks passed');
