const state = {
  image: null,
  sourceFile: null,
  resultUrl: null,
};

const $ = (selector) => document.querySelector(selector);
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const resizeCanvas = $('#resizeCanvas');
const canvasWrap = $('#canvasWrap');
const frameReadout = $('#frameReadout');
const widthInput = $('#widthInput');
const heightInput = $('#heightInput');
const lockAspect = $('#lockAspect');
const formatSelect = $('#formatSelect');
const resetSize = $('#resetSize');
const processButton = $('#processButton');
const resultCard = $('#resultCard');
const resultImage = $('#resultImage');
const resultMeta = $('#resultMeta');
const downloadButton = $('#downloadButton');
const editingModule = $('#editingModule');
const toast = $('#toast');

const MAX_SIDE = 20000;

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

// The one piece of real arithmetic here: given the side the user just edited, work out the
// other one. With the ratio locked the image never distorts, whichever field they type in.
function matchAspect(sourceWidth, sourceHeight, requested, edited) {
  const ratio = sourceWidth / sourceHeight;
  if (edited === 'width') {
    const width = clamp(Math.round(requested.width) || 1, 1, MAX_SIDE);
    return { width, height: clamp(Math.max(1, Math.round(width / ratio)), 1, MAX_SIDE) };
  }
  const height = clamp(Math.round(requested.height) || 1, 1, MAX_SIDE);
  return { width: clamp(Math.max(1, Math.round(height * ratio)), 1, MAX_SIDE), height };
}

function currentSize() {
  return {
    width: clamp(Math.round(Number(widthInput.value)) || 1, 1, MAX_SIDE),
    height: clamp(Math.round(Number(heightInput.value)) || 1, 1, MAX_SIDE),
  };
}

function setSize({ width, height }) {
  widthInput.value = String(width);
  heightInput.value = String(height);
  updateReadout();
}

function updateReadout() {
  if (!state.image) return;
  const { width, height } = currentSize();
  const percent = Math.round((width / state.image.width) * 100);
  frameReadout.textContent = `${state.image.width} × ${state.image.height} → ${width} × ${height} (${percent}%)`;
}

function onSideEdited(edited) {
  if (!state.image) return;
  if (lockAspect.checked) {
    setSize(matchAspect(state.image.width, state.image.height, currentSize(), edited));
  } else {
    setSize(currentSize());
  }
}

// Halving in steps before the final draw. A single drawImage from a large source to a small
// target aliases badly; each halving averages neighbouring pixels, which is what makes a
// downscale look clean.
function drawResized(image, width, height) {
  let source = image;
  let currentWidth = image.width;
  let currentHeight = image.height;

  while (currentWidth / 2 >= width && currentHeight / 2 >= height && currentWidth > 2 && currentHeight > 2) {
    const halfWidth = Math.max(1, Math.floor(currentWidth / 2));
    const halfHeight = Math.max(1, Math.floor(currentHeight / 2));
    const step = document.createElement('canvas');
    step.width = halfWidth;
    step.height = halfHeight;
    const stepCtx = step.getContext('2d');
    stepCtx.imageSmoothingQuality = 'high';
    stepCtx.drawImage(source, 0, 0, halfWidth, halfHeight);
    if (source !== image) {
      source.width = 0;
      source.height = 0;
    }
    source = step;
    currentWidth = halfWidth;
    currentHeight = halfHeight;
  }

  const target = document.createElement('canvas');
  target.width = width;
  target.height = height;
  const ctx = target.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  if (source !== image) {
    source.width = 0;
    source.height = 0;
  }
  return target;
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

function displayPreview() {
  const rect = canvasWrap.getBoundingClientRect();
  const scale = Math.min(
    (rect.width - 36) / state.image.width,
    (rect.height - 36) / state.image.height,
    1,
  );
  resizeCanvas.width = Math.max(1, Math.round(state.image.width * scale));
  resizeCanvas.height = Math.max(1, Math.round(state.image.height * scale));
  resizeCanvas.getContext('2d').drawImage(state.image, 0, 0, resizeCanvas.width, resizeCanvas.height);
}

function loadImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.', true);
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    const image = new Image();
    image.onload = () => {
      state.image = image;
      state.sourceFile = file;
      // Reveal the module before measuring: a hidden container measures as zero.
      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      resizeCanvas.classList.remove('is-hidden');
      resultCard.classList.add('is-hidden');
      displayPreview();

      assetName.textContent = file.name;
      assetMeta.textContent = `${image.width} × ${image.height} · ${formatSize(file.size)}`;
      assetCard.classList.remove('is-hidden');
      dropzone.classList.add('is-hidden');

      setSize({ width: image.width, height: image.height });
      processButton.disabled = false;
    };
    image.onerror = () => showToast('That image could not be read.', true);
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function resizeImage() {
  if (!state.image) return;
  const { width, height } = currentSize();
  const type = outputType(state.sourceFile, formatSelect.value);
  const canvas = drawResized(state.image, width, height);

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast('This image could not be written in that format.', true);
      return;
    }
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);
    resultImage.src = state.resultUrl;
    resultMeta.textContent = `${width} × ${height} · ${formatSize(blob.size)}`;
    downloadButton.href = state.resultUrl;
    downloadButton.download = `${state.sourceFile.name.replace(/\.[^.]+$/, '')}-${width}x${height}.${extensionFor(type)}`;
    resultCard.classList.remove('is-hidden');
    canvas.width = 0;
    canvas.height = 0;
    showToast('Done — your image is ready.');
  }, type, 0.92);
}

widthInput.addEventListener('input', () => onSideEdited('width'));
heightInput.addEventListener('input', () => onSideEdited('height'));
lockAspect.addEventListener('change', () => onSideEdited('width'));

for (const button of document.querySelectorAll('[data-scale], [data-width]')) {
  button.addEventListener('click', () => {
    if (!state.image) return;
    const scale = Number(button.dataset.scale);
    const width = scale
      ? Math.max(1, Math.round(state.image.width * scale))
      : Number(button.dataset.width);
    setSize(matchAspect(state.image.width, state.image.height, { width }, 'width'));
  });
}

resetSize.addEventListener('click', () => {
  if (!state.image) return;
  setSize({ width: state.image.width, height: state.image.height });
});

imageInput.addEventListener('change', (event) => loadImage(event.target.files[0]));
replaceButton.addEventListener('click', () => imageInput.click());
processButton.addEventListener('click', resizeImage);

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
