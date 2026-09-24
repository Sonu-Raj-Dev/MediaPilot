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

function currentType() {
  return targetType(state.sourceFile?.type || '', formatSelect.value);
}

function updateControls() {
  const type = currentType();
  const applies = qualityApplies(type);
  qualityRange.disabled = !applies;
  qualityLabel.textContent = applies ? qualityRange.value : '—';
  qualityHint.textContent = applies ? qualityDescription(Number(qualityRange.value)) : 'PNG is lossless';
  formatNote.textContent = applies
    ? 'Auto keeps JPG and WebP as they are, and switches PNG to WebP — canvas cannot compress a PNG, and JPG would drop transparency.'
    : 'PNG is lossless, so quality has no effect. Choose WebP to actually shrink this image.';
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
    const quality = Number(qualityRange.value) / 100;
    const canvas = document.createElement('canvas');
    canvas.width = state.image.width;
    canvas.height = state.image.height;
    canvas.getContext('2d').drawImage(state.image, 0, 0);

    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, type, qualityApplies(type) ? quality : undefined);
    });
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      showToast('This image could not be written in that format.', true);
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
    frameReadout.textContent = `${state.image.width} × ${state.image.height} · ${extensionFor(type).toUpperCase()}`;
    processButton.disabled = false;
    if (!resultCard.classList.contains('is-hidden')) refreshResult();
  } finally {
    state.encoding = false;
    previewStatus.classList.remove('working');
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
