const state = {
  image: null,
  sourceFile: null,
  resultUrl: null,
  resultBlob: null,
  encoding: false,
  queued: false,
};

const $ = (selector) => document.querySelector(selector);

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const compressCanvas = $('#compressCanvas');
const canvasWrap = $('#canvasWrap');
const frameReadout = $('#frameReadout');
const previewStatus = $('#previewStatus');
const qualityRange = $('#qualityRange');
const qualityLabel = $('#qualityLabel');
const qualityHint = $('#qualityHint');
const formatSelect = $('#formatSelect');
const formatNote = $('#formatNote');
const targetSelect = $('#targetSelect');
const customTargetRow = $('#customTargetRow');
const customTarget = $('#customTarget');
const savingsLine = $('#savingsLine');
const savingsText = $('#savingsText');
const savingsPercent = $('#savingsPercent');
const processButton = $('#processButton');
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

// Canvas has no quality setting for PNG — it is lossless, so a "compressed" PNG comes back the
// same size or larger. Auto therefore sends PNG and GIF to WebP, which is lossy *and* keeps the
// alpha channel that JPG would throw away.
function autoType(sourceType) {
  if (sourceType === 'image/jpeg' || sourceType === 'image/webp') return sourceType;
  return 'image/webp';
}

function targetType(sourceType, chosen) {
  return chosen || autoType(sourceType);
}

function qualityApplies(type) {
  return type !== 'image/png';
}

function savingsPercentOf(beforeBytes, afterBytes) {
  if (!beforeBytes) return 0;
  return Math.round(((beforeBytes - afterBytes) / beforeBytes) * 100);
}

function extensionFor(type) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type] || 'jpg';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function qualityDescription(value) {
  if (value >= 90) return 'Near-original';
  if (value >= 70) return 'Recommended';
  if (value >= 45) return 'Small file';
  return 'Smallest, visible loss';
}

// Target size in bytes, or 0 when the quality slider is in charge. A KB is counted as 1000 bytes:
// some upload forms count that way and some use 1024, and 1000 passes both.
function targetBytes() {
  const kb = targetSelect.value === 'custom' ? Number(customTarget.value) : Number(targetSelect.value);
  return kb > 0 ? Math.round(kb * 1000) : 0;
}

function currentType() {
  const type = targetType(state.sourceFile?.type || '', formatSelect.value);
  // PNG cannot be made smaller by quality, so a size target needs a lossy format.
  return type === 'image/png' && targetBytes() ? 'image/webp' : type;
}

function updateControls() {
  const type = currentType();
  const applies = qualityApplies(type);
  const target = targetBytes();
  customTargetRow.classList.toggle('is-hidden', targetSelect.value !== 'custom');
  qualityRange.disabled = !applies || Boolean(target);
  qualityLabel.textContent = target ? 'Auto' : applies ? qualityRange.value : '—';
  qualityHint.textContent = target ? `Best quality under ${formatSize(target)}` : applies ? qualityDescription(Number(qualityRange.value)) : 'PNG is lossless';
  formatNote.textContent = target && formatSelect.value === 'image/png'
    ? 'PNG cannot be shrunk to a set size, so WebP is used instead (it keeps transparency).'
    : applies
      ? 'Auto keeps JPG and WebP as they are, and switches PNG to WebP, which makes much smaller files while keeping transparency.'
      : 'PNG is lossless, so quality has no effect. Choose WebP to actually shrink this image.';
}

// One encode of the current image at a scale (1 = original size) and quality (0..1).
async function encodeAt(scale, quality, type) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(state.image.width * scale));
  canvas.height = Math.max(1, Math.round(state.image.height * scale));
  const context = canvas.getContext('2d');
  if (type === 'image/jpeg') {
    // JPG has no transparency; without a fill, transparent areas turn black.
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(state.image, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, type, qualityApplies(type) ? quality : undefined));
  const size = { width: canvas.width, height: canvas.height };
  canvas.width = 0;
  canvas.height = 0;
  return blob && Object.assign(blob, { dimensions: size });
}

// Below this quality JPG/WebP turn visibly blocky; a slightly smaller picture looks better.
const MIN_TARGET_QUALITY = 0.45;

// Best result under maxBytes. First the picture size: if even MIN_TARGET_QUALITY is too big, the
// image is made smaller by the area that should be needed (one encode per try, usually one or
// two). Then the highest quality that fits at that size, by halving the range (6 encodes at the
// final, often much smaller, size). Real encodes, not estimates: how small a picture gets depends
// entirely on its content.
async function fitToTarget(type, maxBytes) {
  let scale = 1;
  let fits = null;
  for (let attempt = 0; attempt < 10; attempt++) {
    const probe = await encodeAt(scale, MIN_TARGET_QUALITY, type);
    if (!probe) return null;
    if (probe.size <= maxBytes) { fits = probe; break; }
    scale *= Math.max(0.2, Math.sqrt(maxBytes / probe.size) * 0.92);
    if (state.image.width * scale < 16 || state.image.height * scale < 16) return null;
  }
  if (!fits) return null;
  let low = MIN_TARGET_QUALITY;
  let high = 0.95;
  for (let step = 0; step < 6; step++) {
    const quality = (low + high) / 2;
    const blob = await encodeAt(scale, quality, type);
    if (!blob) break;
    if (blob.size <= maxBytes) { fits = blob; low = quality; } else { high = quality; }
  }
  return fits;
}

// Re-encodes at the current settings and reports the real byte count. Guessing a size from the
// quality number would be a lie: how well an image compresses depends entirely on its content.
async function encode() {
  if (!state.image) return;
  if (state.encoding) {
    state.queued = true;
    return;
  }
  state.encoding = true;
  previewStatus.classList.add('working');

  try {
    const type = currentType();
    const target = targetBytes();
    if (target) previewStatus.lastElementChild.textContent = 'Finding the best quality…';
    const blob = target ? await fitToTarget(type, target) : await encodeAt(1, Number(qualityRange.value) / 100, type);
    if (!blob) {
      showToast(target ? `This image could not be made smaller than ${formatSize(target)}.` : 'This image could not be written in that format.', true);
      return;
    }

    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultBlob = blob;
    state.resultUrl = URL.createObjectURL(blob);
    resultImage.src = state.resultUrl;
    // Draw the encoded bytes back into the preview, not the original: the whole point is to
    // see the artefacts the chosen quality actually produces.
    await drawIntoPreview(state.resultUrl);

    const saved = savingsPercentOf(state.sourceFile.size, blob.size);
    savingsLine.classList.remove('is-hidden');
    savingsLine.classList.toggle('is-good', saved > 0);
    savingsLine.classList.toggle('is-bad', saved <= 0);
    savingsText.textContent = `${formatSize(state.sourceFile.size)} → ${formatSize(blob.size)}`;
    savingsPercent.textContent = saved > 0 ? `−${saved}%` : `+${Math.abs(saved)}%`;
    const { width, height } = blob.dimensions;
    const resized = width !== state.image.width;
    frameReadout.textContent = `${width} × ${height}${resized ? ' (made smaller to fit)' : ''} · ${extensionFor(type).toUpperCase()}`;
    processButton.disabled = false;
    if (!resultCard.classList.contains('is-hidden')) refreshResult();
  } finally {
    state.encoding = false;
    previewStatus.classList.remove('working');
    previewStatus.lastElementChild.textContent = 'Ready';
    if (state.queued) {
      state.queued = false;
      encode();
    }
  }
}

function previewScale() {
  const rect = canvasWrap.getBoundingClientRect();
  return Math.min(
    (rect.width - 36) / state.image.width,
    (rect.height - 36) / state.image.height,
    1,
  );
}

function showPreview(source = state.image) {
  const scale = previewScale();
  compressCanvas.width = Math.max(1, Math.round(state.image.width * scale));
  compressCanvas.height = Math.max(1, Math.round(state.image.height * scale));
  compressCanvas.getContext('2d').drawImage(source, 0, 0, compressCanvas.width, compressCanvas.height);
}

function drawIntoPreview(url) {
  return new Promise((resolve) => {
    const encoded = new Image();
    encoded.onload = () => {
      showPreview(encoded);
      resolve();
    };
    encoded.onerror = resolve;
    encoded.src = url;
  });
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
      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      compressCanvas.classList.remove('is-hidden');
      resultCard.classList.add('is-hidden');
      showPreview();

      assetName.textContent = file.name;
      assetMeta.textContent = `${image.width} × ${image.height} · ${formatSize(file.size)}`;
      assetCard.classList.remove('is-hidden');
      dropzone.classList.add('is-hidden');

      updateControls();
      encode();
    };
    image.onerror = () => showToast('That image could not be read.', true);
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

// Re-encoding revokes the previous blob URL, so anything already shown has to be repointed at
// the new bytes — otherwise the Download button keeps a dead URL and the file never saves.
function refreshResult() {
  if (!state.resultBlob) return;
  const type = currentType();
  resultMeta.textContent = `${formatSize(state.resultBlob.size)} · ${extensionFor(type).toUpperCase()}`;
  downloadButton.href = state.resultUrl;
  downloadButton.download = `${state.sourceFile.name.replace(/\.[^.]+$/, '')}-compressed.${extensionFor(type)}`;
}

function publishResult() {
  if (!state.resultBlob) return;
  refreshResult();
  resultCard.classList.remove('is-hidden');
  showToast('Done — your image is ready.');
}

qualityRange.addEventListener('input', () => {
  qualityLabel.textContent = qualityRange.value;
  qualityHint.textContent = qualityDescription(Number(qualityRange.value));
});
qualityRange.addEventListener('change', encode);
formatSelect.addEventListener('change', () => {
  updateControls();
  encode();
});
targetSelect.addEventListener('change', () => {
  updateControls();
  if (targetSelect.value === 'custom') { customTarget.focus(); if (!customTarget.value) return; }
  encode();
});
customTarget.addEventListener('change', () => {
  updateControls();
  encode();
});

// Pages for a specific size ("compress JPEG to 50KB") preset the target and format through
// data attributes on <body>; ?kb=80 in the address does the same for any size.
(function applyPreset() {
  const kb = Number(new URLSearchParams(location.search).get('kb')) || Number(document.body.dataset.targetKb) || 0;
  const format = document.body.dataset.format;
  if (format) formatSelect.value = format;
  if (kb > 0) {
    const option = [...targetSelect.options].find((o) => Number(o.value) === kb);
    if (option) targetSelect.value = option.value;
    else { targetSelect.value = 'custom'; customTarget.value = String(kb); }
  }
  updateControls();
})();

imageInput.addEventListener('change', (event) => loadImage(event.target.files[0]));
replaceButton.addEventListener('click', () => imageInput.click());
processButton.addEventListener('click', publishResult);

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
