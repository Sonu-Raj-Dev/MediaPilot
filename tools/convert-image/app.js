const state = {
  image: null,
  sourceFile: null,
  sourceHasAlpha: false,
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
const convertCanvas = $('#convertCanvas');
const canvasWrap = $('#canvasWrap');
const frameReadout = $('#frameReadout');
const previewStatus = $('#previewStatus');
const formatGrid = $('#formatGrid');
const sourceFormatLine = $('#sourceFormatLine');
const qualityBlock = $('#qualityBlock');
const qualityRange = $('#qualityRange');
const qualityLabel = $('#qualityLabel');
const flattenRow = $('#flattenRow');
const flattenColor = $('#flattenColor');
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

// JPEG has no alpha channel at all. PNG and WebP do.
function keepsTransparency(type) {
  return type !== 'image/jpeg';
}

function qualityApplies(type) {
  return type !== 'image/png';
}

// The case worth getting right: converting a transparent image to JPG. Left alone the browser
// composites onto black, which looks like the tool broke the image, so the flattening colour is
// made explicit instead.
function needsFlatten(sourceHasAlpha, targetType) {
  return sourceHasAlpha && !keepsTransparency(targetType);
}

function savingsPercentOf(beforeBytes, afterBytes) {
  if (!beforeBytes) return 0;
  return Math.round(((beforeBytes - afterBytes) / beforeBytes) * 100);
}

function extensionFor(type) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[type] || 'png';
}

function labelFor(type) {
  return { 'image/jpeg': 'JPG', 'image/png': 'PNG', 'image/webp': 'WebP', 'image/gif': 'GIF', 'image/bmp': 'BMP' }[type] || 'Image';
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function selectedType() {
  return formatGrid.querySelector('input:checked')?.value || 'image/png';
}

// Sampled at small size rather than full resolution: this only has to answer "is there any
// transparency here", and downscaling averages alpha, so a partly transparent area still reads
// as transparent. Erring toward "yes" is the safe direction — it only shows a colour picker.
function detectAlpha(image) {
  const limit = 160;
  const scale = Math.min(limit / image.width, limit / image.height, 1);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true;
  }
  return false;
}

function updateControls() {
  const type = selectedType();
  qualityBlock.classList.toggle('is-hidden', !qualityApplies(type));
  flattenRow.classList.toggle('is-hidden', !needsFlatten(state.sourceHasAlpha, type));
  qualityLabel.textContent = qualityRange.value;
}

function renderTo(canvas, width, height) {
  const ctx = canvas.getContext('2d');
  canvas.width = width;
  canvas.height = height;
  if (needsFlatten(state.sourceHasAlpha, selectedType())) {
    ctx.fillStyle = flattenColor.value;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(state.image, 0, 0, width, height);
}

async function encode() {
  if (!state.image) return;
  if (state.encoding) {
    state.queued = true;
    return;
  }
  state.encoding = true;
  previewStatus.classList.add('working');

  try {
    const type = selectedType();
    const canvas = document.createElement('canvas');
    renderTo(canvas, state.image.width, state.image.height);
    const blob = await new Promise((resolve) => {
      canvas.toBlob(resolve, type, qualityApplies(type) ? Number(qualityRange.value) / 100 : undefined);
    });
    canvas.width = 0;
    canvas.height = 0;
    if (!blob) {
      showToast(`This browser cannot write ${labelFor(type)}.`, true);
      return;
    }

    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultBlob = blob;
    state.resultUrl = URL.createObjectURL(blob);
    resultImage.src = state.resultUrl;
    await drawIntoPreview(state.resultUrl);

    const saved = savingsPercentOf(state.sourceFile.size, blob.size);
    savingsLine.classList.remove('is-hidden');
    savingsLine.classList.toggle('is-good', saved > 0);
    savingsLine.classList.toggle('is-bad', saved <= 0);
    savingsText.textContent = `${formatSize(state.sourceFile.size)} → ${formatSize(blob.size)}`;
    savingsPercent.textContent = saved > 0 ? `−${saved}%` : `+${Math.abs(saved)}%`;
    frameReadout.textContent = `${state.image.width} × ${state.image.height} · ${labelFor(type)}`;
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

function drawIntoPreview(url) {
  return new Promise((resolve) => {
    const encoded = new Image();
    encoded.onload = () => {
      const scale = previewScale();
      convertCanvas.width = Math.max(1, Math.round(state.image.width * scale));
      convertCanvas.height = Math.max(1, Math.round(state.image.height * scale));
      const ctx = convertCanvas.getContext('2d');
      // Cleared, not filled: the checkerboard behind the canvas has to show through wherever
      // the converted image is actually transparent.
      ctx.clearRect(0, 0, convertCanvas.width, convertCanvas.height);
      ctx.drawImage(encoded, 0, 0, convertCanvas.width, convertCanvas.height);
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
      state.sourceHasAlpha = detectAlpha(image);

      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      convertCanvas.classList.remove('is-hidden');
      resultCard.classList.add('is-hidden');

      assetName.textContent = file.name;
      assetMeta.textContent = `${image.width} × ${image.height} · ${formatSize(file.size)}`;
      assetCard.classList.remove('is-hidden');
      dropzone.classList.add('is-hidden');
      sourceFormatLine.textContent = state.sourceHasAlpha
        ? `From ${labelFor(file.type)} · has transparency`
        : `From ${labelFor(file.type)}`;

      // Default to a format that is actually a change from the source.
      const preferred = file.type === 'image/png' ? 'image/webp' : 'image/png';
      const option = formatGrid.querySelector(`input[value="${preferred}"]`);
      if (option) option.checked = true;

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
  const type = selectedType();
  resultMeta.textContent = `${formatSize(state.resultBlob.size)} · ${labelFor(type)}`;
  downloadButton.href = state.resultUrl;
  downloadButton.download = `${state.sourceFile.name.replace(/\.[^.]+$/, '')}.${extensionFor(type)}`;
}

function publishResult() {
  if (!state.resultBlob) return;
  refreshResult();
  resultCard.classList.remove('is-hidden');
  showToast('Done — your image is ready.');
}

formatGrid.addEventListener('change', () => {
  updateControls();
  encode();
});
qualityRange.addEventListener('input', () => { qualityLabel.textContent = qualityRange.value; });
qualityRange.addEventListener('change', encode);
flattenColor.addEventListener('change', encode);

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
