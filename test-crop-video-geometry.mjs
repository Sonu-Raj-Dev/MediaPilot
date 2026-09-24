// Self-check for the video crop mode's geometry. The function is pure but lives in a classic
// browser script, so it is sliced out of the source.
// Run: node test-crop-video-geometry.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs
  .readFileSync(new URL('./app.js', import.meta.url), 'utf8')
  .replace(/\r\n/g, '\n');

function extract(name) {
  const start = source.indexOf(`function ${name}(`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = source.indexOf('\n}\n', start);
  assert.notEqual(end, -1, `${name} has no closing brace`);
  return source.slice(start, end + 2);
}

const { cropRectFor, buildFilterGraph, toPixelBoxes } = new Function(
  `${source.match(/^const CROP_MARGIN = \d+;$/m)[0]}
   ${source.match(/^const CROP_MIN_KEEP = [\d.]+;$/m)[0]}
   ${extract('clampInt')}
   ${extract('toPixelBoxes')}
   ${extract('cropRectFor')}
   ${extract('buildFilterGraph')}
   return { cropRectFor, buildFilterGraph, toPixelBoxes };`
)();

const W = 1920;
const H = 1080;

// Helper: does the rectangle actually exclude the box it was built for?
const excludes = (rect, b) =>
  b.x >= rect.x + rect.w || b.x + b.w <= rect.x || b.y >= rect.y + rect.h || b.y + b.h <= rect.y;

// --- the common case: a logo in a corner -----------------------------------------------------
// A bottom-right mark is nearest the right and bottom edges; either trim removes it, and the
// result must not contain it.
const bottomRight = { x: 1600, y: 940, w: 280, h: 110 };
const r1 = cropRectFor([bottomRight], W, H);
assert.ok(r1, 'a corner mark must be croppable');
assert.ok(excludes(r1, bottomRight), 'the crop still contains the mark');

// Same for the other three corners.
for (const b of [
  { x: 20, y: 20, w: 280, h: 110 },        // top-left
  { x: 1620, y: 20, w: 280, h: 110 },      // top-right
  { x: 20, y: 950, w: 280, h: 110 },       // bottom-left
]) {
  const r = cropRectFor([b], W, H);
  assert.ok(r, `corner mark at ${b.x},${b.y} must be croppable`);
  assert.ok(excludes(r, b), `crop still contains the mark at ${b.x},${b.y}`);
}

// --- aspect ratio must survive ---------------------------------------------------------------
// Scaling the crop back to the source size is a plain `scale=W:H`, so any drift in the ratio
// shows up as a stretched picture. This is the check that catches it.
for (const [w, h] of [[1920, 1080], [1080, 1920], [1280, 720], [640, 640]]) {
  const b = { x: Math.round(w * 0.8), y: Math.round(h * 0.86), w: Math.round(w * 0.18), h: Math.round(h * 0.1) };
  const r = cropRectFor([b], w, h);
  assert.ok(r, `${w}x${h} corner mark must be croppable`);
  const drift = Math.abs((r.w / r.h) - (w / h)) / (w / h);
  assert.ok(drift < 0.02, `${w}x${h}: aspect drifted by ${(drift * 100).toFixed(1)}%`);
}

// --- encoder constraints ---------------------------------------------------------------------
// H.264 with yuv420p subsamples chroma 2x2: odd sizes are rejected and odd offsets shift the
// chroma plane against the luma.
for (const b of [
  { x: 1601, y: 941, w: 277, h: 111 },
  { x: 3, y: 5, w: 301, h: 99 },
]) {
  const r = cropRectFor([b], W, H);
  for (const k of ['x', 'y', 'w', 'h']) {
    assert.equal(r[k] % 2, 0, `${k}=${r[k]} must be even for yuv420p`);
  }
}

// --- the crop must stay inside the frame -----------------------------------------------------
for (const b of [
  { x: 1700, y: 1000, w: 220, h: 80 },
  { x: 0, y: 0, w: 200, h: 200 },
]) {
  const r = cropRectFor([b], W, H);
  assert.ok(r.x >= 0 && r.y >= 0, 'crop origin must be inside the frame');
  assert.ok(r.x + r.w <= W, `crop runs past the right edge: ${r.x}+${r.w} > ${W}`);
  assert.ok(r.y + r.h <= H, `crop runs past the bottom edge: ${r.y}+${r.h} > ${H}`);
}

// --- refuse rather than gut the video --------------------------------------------------------
// A mark in the middle cannot be cropped away; removing it from any edge would eat most of the
// picture. The caller shows "try Reconstruct instead" rather than returning a ruined clip.
assert.equal(cropRectFor([{ x: 860, y: 470, w: 200, h: 140 }], W, H), null,
  'a centred mark must be refused, not cropped');
// A band across the whole middle is equally hopeless.
assert.equal(cropRectFor([{ x: 0, y: 450, w: 1920, h: 180 }], W, H), null,
  'a full-width centre band must be refused');

// --- several marks ---------------------------------------------------------------------------
// Two bottom corners: both are nearest the bottom, so one trim handles both.
const twoBottom = [{ x: 30, y: 960, w: 260, h: 100 }, { x: 1630, y: 960, w: 260, h: 100 }];
const r2 = cropRectFor(twoBottom, W, H);
assert.ok(r2, 'two bottom marks must be croppable');
for (const b of twoBottom) assert.ok(excludes(r2, b), 'crop still contains a bottom mark');

// Opposite corners force trims on two different edges, and both must still be excluded.
const opposite = [{ x: 20, y: 20, w: 200, h: 90 }, { x: 1700, y: 970, w: 200, h: 90 }];
const r3 = cropRectFor(opposite, W, H);
if (r3) for (const b of opposite) assert.ok(excludes(r3, b), 'crop still contains an opposite-corner mark');

// Marks on all four edges trim from all four sides, which is still a usable centre crop as
// long as enough of the frame survives. Every mark must be outside it.
const allEdges = [
  { x: 0, y: 480, w: 300, h: 120 },
  { x: 1620, y: 480, w: 300, h: 120 },
  { x: 810, y: 0, w: 300, h: 120 },
  { x: 810, y: 960, w: 300, h: 120 },
];
const r4 = cropRectFor(allEdges, W, H);
assert.ok(r4, 'four edge marks still leave a usable centre crop');
for (const b of allEdges) assert.ok(excludes(r4, b), 'centre crop still contains an edge mark');
assert.ok(r4.w >= W * 0.5 && r4.h >= H * 0.5, 'a returned crop must keep at least half the frame');

// Widen those marks until nothing worth keeping is left, and it must refuse instead.
assert.equal(cropRectFor([
  { x: 0, y: 480, w: 700, h: 120 },
  { x: 1220, y: 480, w: 700, h: 120 },
  { x: 810, y: 0, w: 300, h: 400 },
  { x: 810, y: 680, w: 300, h: 400 },
], W, H), null, 'marks that eat the frame must be refused');

// --- the ffmpeg command ----------------------------------------------------------------------
// The geometry is only half the job: it has to reach ffmpeg as a valid graph. crop takes
// w:h:x:y in that order — swapping the pair silently produces a differently framed video
// rather than an error — and the scale back must restore the SOURCE size, not the crop size.
const graph = buildFilterGraph([bottomRight], 'crop', 6, W, H);
const rect = cropRectFor([bottomRight], W, H);
assert.equal(graph, `[0:v]crop=${rect.w}:${rect.h}:${rect.x}:${rect.y},scale=${W}:${H}[v]`);
assert.ok(graph.includes(`scale=${W}:${H}`), 'must scale back to the source size');
assert.ok(graph.endsWith('[v]'), 'the graph must end on the [v] label the encoder consumes');

// A mark that cannot be cropped must fail loudly here, not emit a broken graph.
assert.throws(
  () => buildFilterGraph([{ x: 860, y: 470, w: 200, h: 140 }], 'crop', 6, W, H),
  /too far from the edges/,
  'a centred mark must throw a readable error',
);

// The other three modes must be untouched by the crop branch.
assert.ok(buildFilterGraph([bottomRight], 'inpaint', 6, W, H).includes('delogo='), 'inpaint still uses delogo');
assert.ok(buildFilterGraph([bottomRight], 'blur', 6, W, H).includes('boxblur='), 'blur still uses boxblur');
assert.ok(buildFilterGraph([bottomRight], 'pixelate', 6, W, H).includes('flags=neighbor'), 'pixelate still uses neighbor scaling');

// --- mixed marks: fill some, crop others ------------------------------------------------------
// The case this was built for: watermarks over flat background are filled, ones over detail are
// cropped away. delogo MUST come before crop, because its coordinates are in the original frame
// and a crop shifts every pixel.
// Go through toPixelBoxes, as the app does. Feeding raw boxes straight to buildFilterGraph
// skips the clamp and produces boxes ffmpeg rejects with "Logo area is outside of the frame".
const VW = 848;
const VH = 478;
const mixed = toPixelBoxes([
  { x: 16 / VW, y: 13 / VH, w: 99 / VW, h: 57 / VH, crop: false },    // top-left, flat -> fill
  { x: 675 / VW, y: 0, w: 173 / VW, h: 72 / VH, crop: false },        // top-right, flat -> fill
  { x: 19 / VW, y: 404 / VH, w: 151 / VW, h: 74 / VH, crop: true },   // bottom-left -> crop
  { x: 732 / VW, y: 404 / VH, w: 98 / VW, h: 56 / VH, crop: true },   // bottom-right -> crop
], 'inpaint', 6, VW, VH);

// delogo refuses a box that touches any frame edge, and fails the whole render when it does.
for (const b of mixed.filter((m) => !m.crop)) {
  assert.ok(b.x >= 1 && b.y >= 1, `delogo box must start inside the frame, got ${b.x},${b.y}`);
  assert.ok(b.x + b.w <= VW - 1, `delogo box runs to the right edge: ${b.x}+${b.w} vs ${VW}`);
  assert.ok(b.y + b.h <= VH - 1, `delogo box runs to the bottom edge: ${b.y}+${b.h} vs ${VH}`);
}

const g = buildFilterGraph(mixed, 'inpaint', 6, 848, 478);
assert.ok(g.indexOf('delogo=') < g.indexOf('crop='), 'delogo must run before crop');
assert.equal((g.match(/delogo=/g) || []).length, 2, 'only the two fill marks get delogo');
assert.ok(/crop=\d+:\d+:\d+:\d+,scale=848:478/.test(g), 'the cropped marks produce one crop+scale');
for (const b of mixed.filter((m) => m.crop)) assert.ok(!g.includes(`delogo=x=${b.x}:y=${b.y}:`), 'cropped marks must not also be filled');

// All marks filled = the old behaviour, unchanged.
const allFill = mixed.map((m) => ({ ...m, crop: false }));
assert.equal(buildFilterGraph(allFill, 'inpaint', 6, 848, 478),
  `[0:v]${allFill.map((b) => `delogo=x=${b.x}:y=${b.y}:w=${b.w}:h=${b.h}`).join(',')}[v]`,
  'with nothing cropped the command is exactly what it was before this feature');

// All marks cropped = a single crop, no delogo.
const allCrop = mixed.map((m) => ({ ...m, crop: true }));
const gc = buildFilterGraph(allCrop, 'inpaint', 6, 848, 478);
assert.ok(!gc.includes('delogo='), 'nothing to fill means no delogo');
assert.ok(gc.includes('crop='), 'everything cropped still crops');

// Setting every mark to crop must be exactly the Crop away mode, not a slightly different one.
// It was not: crop marks were still getting mask-expansion padding, so the crop came out 3% of
// the frame tighter than choosing Crop away with the same marks.
const asRegions = [
  { x: 16 / VW, y: 13 / VH, w: 99 / VW, h: 57 / VH },
  { x: 675 / VW, y: 0, w: 173 / VW, h: 72 / VH },
  { x: 19 / VW, y: 404 / VH, w: 151 / VW, h: 74 / VH },
  { x: 732 / VW, y: 404 / VH, w: 98 / VW, h: 56 / VH },
];
assert.equal(
  buildFilterGraph(toPixelBoxes(asRegions.map((r) => ({ ...r, crop: true })), 'inpaint', 6, VW, VH), 'inpaint', 6, VW, VH),
  buildFilterGraph(toPixelBoxes(asRegions, 'crop', 6, VW, VH), 'crop', 6, VW, VH),
  'every mark cropped must equal the Crop away mode',
);

// Marks set to crop that sit too centrally must say so rather than emit a broken graph.
assert.throws(
  () => buildFilterGraph([{ x: 380, y: 200, w: 90, h: 70, crop: true }], 'inpaint', 6, 848, 478),
  /too far from the edges/,
);

console.log('video crop geometry checks passed');
