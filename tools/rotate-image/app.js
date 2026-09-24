const state = {
  image: null,
  sourceFile: null,
  resultUrl: null,
  rotation: 0,
  flipH: false,
  flipV: false,
};

const $ = (selector) => document.querySelector(selector);

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const rotateCanvas = $('#rotateCanvas');
const canvasWrap = $('#canvasWrap');
const frameReadout = $('#frameReadout');
const transformSummary = $('#transformSummary');
const flipHButton = $('#flipH');
const flipVButton = $('#flipV');
const formatSelect = $('#formatSelect');
const processButton = $('#processButton');
const resultCard = $('#resultCard');
const resultImage = $('#resultImage');
const resultMeta = $('#resultMeta');
const downloadButton = $('#downloadButton');
const editingModule = $('#editingModule');
const toast = $('#toast');

// A full-resolution canvas costs width × height × 4 bytes twice over (source and target), so a
// very large photo can exhaust a phone's tab before anything is drawn. Refuse early and say so,
// rather than letting the browser kill the page with no explanation.
const MAX_PIXELS = 50 * 1000 * 1000;
const MAX_BYTES = 40 * 1024 * 1024;

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

// Quarter turns swap the two sides; the half turn and the flips do not.
function outputSize(width, height, rotation) {
  return rotation % 180 === 0 ? { width, height } : { width: height, height: width };
}

// The single transform that maps the source image onto that output box, as a canvas matrix.
// Order is the whole point: the image is rotated about its own centre FIRST, then mirrored on
// the SCREEN's axes, then moved to the centre of the output. Doing it the other way round (a
// ctx.rotate followed by ctx.scale) mirrors along the image's turned axes instead, so after a
// 90 degree rotation "flip horizontal" visibly flips the preview vertically.
// Returning one matrix rather than a sequence of ctx calls keeps that order in a single place
// that a test can check.
function matrixFor(width, height, rotation, flipH, flipV) {
  const radians = (rotation * Math.PI) / 180;
  // Exact at quarter turns: Math.cos(Math.PI / 2) is 6.1e-17, not 0, which smears a lossless
  // rotation across neighbouring pixels.
  const cos = [1, 0, -1, 0][(rotation / 90) % 4] ?? Math.cos(radians);
  const sin = [0, 1, 0, -1][(rotation / 90) % 4] ?? Math.sin(radians);
  const sx = flipH ? -1 : 1;
  const sy = flipV ? -1 : 1;
  const out = outputSize(width, height, rotation);
  return {
    a: sx * cos, b: sy * sin, c: -sx * sin, d: sy * cos,
    e: out.width / 2, f: out.height / 2,
    draw: [-width / 2, -height / 2, width, height],
    out,
  };
}

// Where a point of the source image ends up in the output, under that matrix. The renderer does
// not call this — the canvas does the same arithmetic — but it is what makes the orientation
// checkable without a browser.
function mapPoint(width, height, rotation, flipH, flipV, x, y) {
  const m = matrixFor(width, height, rotation, flipH, flipV);
  const px = x - width / 2;
  const py = y - height / 2;
  return {
    x: Math.round(m.a * px + m.c * py + m.e),
    y: Math.round(m.b * px + m.d * py + m.f),
  };
}

// What the controls add up to, in the order a person would describe it.
function describeTransform(rotation, flipH, flipV) {
  const parts = [];
  if (rotation) parts.push(`Rotated ${rotation}°`);
  if (flipH) parts.push('flipped horizontally');
  if (flipV) parts.push('flipped vertically');
  if (!parts.length) return 'Original orientation';
  return parts.join(', ').replace(/^./, (c) => c.toUpperCase());
}

function outputType(file, chosen) {
  if (chosen) return chosen;
  // GIF cannot be written by canvas, and an animated one would lose its frames anyway.
  return file.type === 'image/gif' ? 'image/png' : (file.type || 'image/png');
}

function extensionFor(type) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type] || 'png';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// One routine for both the preview and the export; only the scale differs. Sharing it is what
// guarantees the preview is honest about what gets downloaded.
function renderTo(canvas, scale) {
  const { width, height } = state.image;
  const out = outputSize(width, height, state.rotation);
  canvas.width = Math.max(1, Math.round(out.width * scale));
  canvas.height = Math.max(1, Math.round(out.height * scale));

  const ctx = canvas.getContext('2d');
  const m = matrixFor(width, height, state.rotation, state.flipH, state.flipV);
  ctx.imageSmoothingQuality = 'high';
  // The preview scale is a uniform factor applied after the matrix, so it multiplies through.
  ctx.setTransform(scale * m.a, scale * m.b, scale * m.c, scale * m.d, scale * m.e, scale * m.f);
  ctx.drawImage(state.image, m.draw[0], m.draw[1], m.draw[2], m.draw[3]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas;
}

function drawPreview() {
  if (!state.image) return;
  // Measure the stage the stylesheet sets, not one this function left behind, and with the
  // previous canvas out of flow — otherwise the stage reports the size it already had and a
  // turn from landscape to portrait can never grow into the space available.
  canvasWrap.style.minHeight = '';
  rotateCanvas.style.display = 'none';
  const rect = canvasWrap.getBoundingClientRect();
  rotateCanvas.style.display = '';

  const out = outputSize(state.image.width, state.image.height, state.rotation);
  const scale = Math.min((rect.width - 36) / out.width, (rect.height - 36) / out.height, 1);
  renderTo(rotateCanvas, scale);
  // Shrink the stage to what was drawn, so a wide image does not leave a screenful of grey
  // under it on a phone.
  canvasWrap.style.minHeight = `${Math.round(rotateCanvas.height + 36)}px`;

  frameReadout.textContent = `${state.image.width} × ${state.image.height} → ${out.width} × ${out.height}`;
  transformSummary.textContent = describeTransform(state.rotation, state.flipH, state.flipV);
  flipHButton.setAttribute('aria-pressed', String(state.flipH));
  flipVButton.setAttribute('aria-pressed', String(state.flipV));
  flipHButton.classList.toggle('subtle', !state.flipH);
  flipVButton.classList.toggle('subtle', !state.flipV);
}

function turn(degrees) {
  if (!state.image) return;
  state.rotation = (state.rotation + degrees + 360) % 360;
  resultCard.classList.add('is-hidden');
  drawPreview();
}

function loadImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.', true);
    return;
  }
  if (file.size > MAX_BYTES) {
    showToast(`That image is ${formatSize(file.size)}. Please choose one under ${formatSize(MAX_BYTES)}.`, true);
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = new Image();
    image.onload = () => {
      if (image.width * image.height > MAX_PIXELS) {
        showToast('That image has too many pixels for the browser to hold. Please resize it first.', true);
        return;
      }
      state.image = image;
      state.sourceFile = file;
      state.rotation = 0;
      state.flipH = false;
      state.flipV = false;

      // Reveal the module before measuring: a hidden container measures as zero.
      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      rotateCanvas.classList.remove('is-hidden');
      resultCard.classList.add('is-hidden');
      drawPreview();

      assetName.textContent = file.name;
      assetMeta.textContent = `${image.width} × ${image.height} · ${formatSize(file.size)}`;
      assetCard.classList.remove('is-hidden');
      dropzone.classList.add('is-hidden');
      processButton.disabled = false;
    };
    image.onerror = () => showToast('That image could not be read.', true);
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function exportImage() {
  if (!state.image) return;
  const type = outputType(state.sourceFile, formatSelect.value);
  const canvas = renderTo(document.createElement('canvas'), 1);
  const out = outputSize(state.image.width, state.image.height, state.rotation);

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('This image could not be written in that format.', true);
      return;
    }
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);
    resultImage.src = state.resultUrl;
    resultMeta.textContent = `${out.width} × ${out.height} · ${formatSize(blob.size)}`;
    downloadButton.href = state.resultUrl;
    downloadButton.download = `${state.sourceFile.name.replace(/\.[^.]+$/, '')}-rotated.${extensionFor(type)}`;
    resultCard.classList.remove('is-hidden');
    canvas.width = 0;
    canvas.height = 0;
    showToast('Done — your image is ready.');
  }, type, 0.92);
}

$('#rotateLeft').addEventListener('click', () => turn(-90));
$('#rotateRight').addEventListener('click', () => turn(90));
$('#rotate180').addEventListener('click', () => turn(180));

flipHButton.addEventListener('click', () => {
  if (!state.image) return;
  state.flipH = !state.flipH;
  resultCard.classList.add('is-hidden');
  drawPreview();
});
flipVButton.addEventListener('click', () => {
  if (!state.image) return;
  state.flipV = !state.flipV;
  resultCard.classList.add('is-hidden');
  drawPreview();
});
$('#resetTransform').addEventListener('click', () => {
  if (!state.image) return;
  state.rotation = 0;
  state.flipH = false;
  state.flipV = false;
  resultCard.classList.add('is-hidden');
  drawPreview();
});

imageInput.addEventListener('change', (event) => loadImage(event.target.files[0]));
replaceButton.addEventListener('click', () => imageInput.click());
processButton.addEventListener('click', exportImage);

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  loadImage(event.dataTransfer?.files?.[0]);
});

// The preview is sized from the stage, which changes when the phone turns. Width only: the
// stage's height follows the canvas, so watching it would loop.
let lastStageWidth = 0;
function refitPreview() {
  if (!state.image) return;
  const width = Math.round(canvasWrap.getBoundingClientRect().width);
  if (width === lastStageWidth) return;
  lastStageWidth = width;
  drawPreview();
}
const stageObserver = new ResizeObserver(refitPreview);
stageObserver.observe(canvasWrap);
window.addEventListener('resize', refitPreview);
window.addEventListener('orientationchange', refitPreview);
