const state = {
  image: null,
  canvas: null,
  ctx: null,
  crop: { x: 0, y: 0, w: 100, h: 100, aspect: null },
  dragging: false,
  dragMode: null,
  anchor: { x: 0, y: 0 },
  processing: false,
  sourceFile: null,
  resultUrl: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const assetThumbLetter = $('#assetThumbLetter');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const cropCanvas = $('#cropCanvas');
const canvasWrap = $('#canvasWrap');
const previewStatus = $('#previewStatus');
const frameReadout = $('#frameReadout');
const cropDimensions = $('#cropDimensions');
const processButton = $('#processButton');
const processingCard = $('#processingCard');
const progressBar = $('#progressBar');
const progressValue = $('#progressValue');
const resultCard = $('#resultCard');
const resultImage = $('#resultImage');
const resultMeta = $('#resultMeta');
const downloadButton = $('#downloadButton');
const editingModule = $('#editingModule');
const toast = $('#toast');

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

function updateProcessButton() {
  processButton.disabled = state.processing || !state.image;
}

function updateCropInfo() {
  // The canvas is a scaled-down view, so report the crop in the source image's pixels.
  const scale = state.image && cropCanvas.width ? state.image.width / cropCanvas.width : 1;
  const w = Math.round(state.crop.w * scale);
  const h = Math.round(state.crop.h * scale);
  cropDimensions.textContent = `${w} × ${h}px`;
  if (state.crop.aspect) {
    cropDimensions.textContent += ` (${state.crop.aspect})`;
  }
}

// Keeps the crop inside the canvas. Size is capped to the canvas and then the box is slid
// back inside, rather than squashed — so a box dragged to an edge keeps the size it had, and
// a locked ratio is preserved by scaling both sides together.
function constrainCrop() {
  const maxW = cropCanvas.width;
  const maxH = cropCanvas.height;

  state.crop.w = clamp(state.crop.w, Math.min(20, maxW), maxW);
  state.crop.h = clamp(state.crop.h, Math.min(20, maxH), maxH);

  if (state.crop.aspect) {
    const [ratioW, ratioH] = state.crop.aspect.split(':').map(Number);
    state.crop.h = state.crop.w * (ratioH / ratioW);
    const fit = Math.min(1, maxW / state.crop.w, maxH / state.crop.h);
    if (fit < 1) {
      state.crop.w *= fit;
      state.crop.h *= fit;
    }
  }

  state.crop.x = clamp(state.crop.x, 0, maxW - state.crop.w);
  state.crop.y = clamp(state.crop.y, 0, maxH - state.crop.h);
}

function setCropAspectRatio(aspect) {
  if (!state.image) return;
  const width = cropCanvas.width;
  const height = cropCanvas.height;
  const availWidth = width * 0.9;
  const availHeight = height * 0.9;

  let w, h;
  if (aspect === 'free') {
    w = availWidth;
    h = availHeight;
    state.crop.aspect = null;
  } else {
    const [ratioW, ratioH] = aspect.split(':').map(Number);
    if (availWidth / availHeight > ratioW / ratioH) {
      h = availHeight;
      w = h * (ratioW / ratioH);
    } else {
      w = availWidth;
      h = w * (ratioH / ratioW);
    }
    state.crop.aspect = aspect;
  }

  state.crop.w = w;
  state.crop.h = h;
  state.crop.x = (width - w) / 2;
  state.crop.y = (height - h) / 2;

  constrainCrop();
  updateCropInfo();
  drawCrop();
}

function drawCrop() {
  let box = canvasWrap.querySelector('.crop-box');
  if (!box) {
    box = document.createElement('div');
    box.className = 'crop-box';
    box.innerHTML = '<i class="crop-handle tl"></i><i class="crop-handle tr"></i>'
      + '<i class="crop-handle bl"></i><i class="crop-handle br"></i>';
    canvasWrap.appendChild(box);
  }
  // state.crop is in canvas pixels, but the box is positioned against .canvas-wrap, which
  // centres the canvas inside its padding — so shift by the canvas's offset within it.
  box.style.left = (cropCanvas.offsetLeft + state.crop.x) + 'px';
  box.style.top = (cropCanvas.offsetTop + state.crop.y) + 'px';
  box.style.width = state.crop.w + 'px';
  box.style.height = state.crop.h + 'px';
}

function loadImage(file) {
  if (!file.type.startsWith('image/')) {
    showToast('Please select an image file', true);
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.sourceFile = file;
      // The canvas is measured against its container, so it has to be on screen first —
      // measuring while the module is still hidden yields a zero-sized container.
      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      cropCanvas.classList.remove('is-hidden');
      displayImage();
      updateProcessButton();

      assetName.textContent = file.name;
      assetMeta.textContent = `${img.width} × ${img.height}`;
      assetCard.classList.remove('is-hidden');
      assetThumbLetter.textContent = 'I';

      setCropAspectRatio('16:9');
    };
    img.onerror = () => showToast('Could not load image', true);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function displayImage() {
  state.canvas = cropCanvas;
  state.ctx = cropCanvas.getContext('2d');
  const container = canvasWrap;
  // Measure against the stage the stylesheet sets, not a height this function left behind — and
  // with the previous canvas out of flow, or the stage just reports the size it already had and
  // the image can never shrink to fit a shorter screen.
  container.style.minHeight = '';
  cropCanvas.style.display = 'none';
  const containerRect = container.getBoundingClientRect();
  cropCanvas.style.display = '';

  const maxWidth = containerRect.width - 36;
  const maxHeight = containerRect.height - 36;

  let scale = Math.min(maxWidth / state.image.width, maxHeight / state.image.height);
  const displayWidth = state.image.width * scale;
  const displayHeight = state.image.height * scale;

  cropCanvas.width = displayWidth;
  cropCanvas.height = displayHeight;
  // The stage is centred and taller than a wide image needs, which on a phone leaves a screenful
  // of empty grey under the picture. Shrink it to what was actually drawn.
  container.style.minHeight = Math.round(displayHeight + 36) + 'px';

  state.ctx.drawImage(state.image, 0, 0, displayWidth, displayHeight);
}

function cropImage() {
  if (!state.image || !state.canvas) return;

  processingCard.classList.remove('is-hidden');
  processButton.disabled = true;
  state.processing = true;

  window.setTimeout(() => {
    const scaleFactor = state.image.width / state.canvas.width;
    const cropX = Math.round(state.crop.x * scaleFactor);
    const cropY = Math.round(state.crop.y * scaleFactor);
    const cropW = Math.round(state.crop.w * scaleFactor);
    const cropH = Math.round(state.crop.h * scaleFactor);

    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = cropW;
    tempCanvas.height = cropH;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(state.image, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    state.resultUrl = tempCanvas.toDataURL('image/png');
    resultImage.src = state.resultUrl;
    resultMeta.textContent = `${cropW} × ${cropH}px`;

    processingCard.classList.add('is-hidden');
    resultCard.classList.remove('is-hidden');
    processButton.disabled = false;
    state.processing = false;

    const filename = state.sourceFile.name.split('.')[0] + '-cropped.png';
    downloadButton.href = state.resultUrl;
    downloadButton.download = filename;

    showToast('Crop complete');
  }, 100);
}

const HANDLE_HIT = 16;
const HANDLE_CURSOR = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize' };

function canvasPoint(event) {
  const rect = cropCanvas.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) * (cropCanvas.width / rect.width), 0, cropCanvas.width),
    y: clamp((event.clientY - rect.top) * (cropCanvas.height / rect.height), 0, cropCanvas.height),
  };
}

function handleAt(x, y) {
  const c = state.crop;
  const corners = { tl: [c.x, c.y], tr: [c.x + c.w, c.y], bl: [c.x, c.y + c.h], br: [c.x + c.w, c.y + c.h] };
  return Object.keys(corners).find((name) => {
    const [hx, hy] = corners[name];
    return Math.abs(x - hx) <= HANDLE_HIT && Math.abs(y - hy) <= HANDLE_HIT;
  }) || null;
}

function insideCrop(x, y) {
  const c = state.crop;
  return x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
}

// The rectangle spanned between a fixed anchor and the pointer. Drawing a fresh box and
// dragging a corner are the same gesture — only the anchor differs.
function rectFrom(anchorX, anchorY, x, y) {
  const w = Math.abs(x - anchorX);
  let h = Math.abs(y - anchorY);
  if (state.crop.aspect) {
    const [ratioW, ratioH] = state.crop.aspect.split(':').map(Number);
    h = w * (ratioH / ratioW);
  }
  return { x: x < anchorX ? anchorX - w : anchorX, y: y < anchorY ? anchorY - h : anchorY, w, h };
}

cropCanvas.addEventListener('pointerdown', (event) => {
  if (!state.image) return;
  event.preventDefault();
  const start = canvasPoint(event);
  const handle = handleAt(start.x, start.y);

  if (handle) {
    // Resizing pivots on the opposite corner, so that corner stays put.
    state.anchor = {
      x: handle === 'tl' || handle === 'bl' ? state.crop.x + state.crop.w : state.crop.x,
      y: handle === 'tl' || handle === 'tr' ? state.crop.y + state.crop.h : state.crop.y,
    };
    state.dragMode = 'resize';
  } else if (insideCrop(start.x, start.y)) {
    state.anchor = { x: start.x - state.crop.x, y: start.y - state.crop.y };
    state.dragMode = 'move';
  } else {
    state.anchor = start;
    state.dragMode = 'resize';
  }

  state.dragging = true;
  cropCanvas.setPointerCapture(event.pointerId);
});

cropCanvas.addEventListener('pointermove', (event) => {
  if (!state.image) return;
  const point = canvasPoint(event);

  if (!state.dragging) {
    const handle = handleAt(point.x, point.y);
    cropCanvas.style.cursor = handle ? HANDLE_CURSOR[handle]
      : insideCrop(point.x, point.y) ? 'move' : 'crosshair';
    return;
  }

  if (state.dragMode === 'move') {
    state.crop.x = clamp(point.x - state.anchor.x, 0, cropCanvas.width - state.crop.w);
    state.crop.y = clamp(point.y - state.anchor.y, 0, cropCanvas.height - state.crop.h);
  } else {
    Object.assign(state.crop, rectFrom(state.anchor.x, state.anchor.y, point.x, point.y));
  }

  constrainCrop();
  updateCropInfo();
  drawCrop();
});

function endDrag(event) {
  if (!state.dragging) return;
  state.dragging = false;
  state.dragMode = null;
  if (cropCanvas.hasPointerCapture(event.pointerId)) cropCanvas.releasePointerCapture(event.pointerId);
}

cropCanvas.addEventListener('pointerup', endDrag);
cropCanvas.addEventListener('pointercancel', endDrag);

imageInput.addEventListener('change', (e) => {
  if (e.target.files[0]) loadImage(e.target.files[0]);
});

dropzone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropzone.classList.add('drag-over');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('drag-over');
});

dropzone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropzone.classList.remove('drag-over');
  if (e.dataTransfer.files[0]) loadImage(e.dataTransfer.files[0]);
});

replaceButton.addEventListener('click', () => {
  imageInput.click();
});

processButton.addEventListener('click', cropImage);

$('#preset16x9').addEventListener('click', () => setCropAspectRatio('16:9'));
$('#preset9x16').addEventListener('click', () => setCropAspectRatio('9:16'));
$('#preset1x1').addEventListener('click', () => setCropAspectRatio('1:1'));
$('#preset4x5').addEventListener('click', () => setCropAspectRatio('4:5'));
$('#presetFree').addEventListener('click', () => setCropAspectRatio('free'));

updateProcessButton();

// displayImage() sizes the canvas from .canvas-wrap's measured box, once. Rotating a phone or
// resizing the window changes that box, so re-fit and carry the crop across in proportion —
// state.crop is in canvas pixels, which the new canvas no longer shares.
let refitTimer;
let lastStageWidth = 0;

function refitStage() {
  if (!state.image) return;
  const width = Math.round(canvasWrap.getBoundingClientRect().width);
  // displayImage sets the stage's own height, so reacting to height would loop. Width-only also
  // means mobile browser chrome sliding in and out does not rescale the image under the finger.
  if (width === lastStageWidth) return;
  lastStageWidth = width;
  window.clearTimeout(refitTimer);
  refitTimer = window.setTimeout(() => {
    const prevWidth = cropCanvas.width;
    const prevHeight = cropCanvas.height;
    displayImage();
    if (prevWidth && prevHeight) {
      const scaleX = cropCanvas.width / prevWidth;
      const scaleY = cropCanvas.height / prevHeight;
      state.crop.x *= scaleX;
      state.crop.y *= scaleY;
      state.crop.w *= scaleX;
      state.crop.h *= scaleY;
    }
    constrainCrop();
    updateCropInfo();
    drawCrop();
  }, 150);
}

// Both signals, because neither is dependable alone: ResizeObserver catches layout changes the
// window never reports, but is tied to the rendering lifecycle and stays silent while the page
// is not being painted; resize/orientationchange fire regardless. refitStage is idempotent, so
// whichever arrives first wins and the other returns at the width check.
// The observer is kept in a variable — an unreferenced one can be collected.
const stageObserver = new ResizeObserver(refitStage);
stageObserver.observe(canvasWrap);
window.addEventListener('resize', refitStage);
window.addEventListener('orientationchange', refitStage);
