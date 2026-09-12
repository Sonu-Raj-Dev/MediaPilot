const imageInput = document.getElementById('imageInput');
const previewStage = document.getElementById('previewStage');
const emptyPreview = document.getElementById('emptyPreview');
const imageCanvasWrap = document.getElementById('imageCanvasWrap');
const imageCanvas = document.getElementById('imageCanvas');
const selectionInfo = document.getElementById('selectionInfo');
const clearSelectionButton = document.getElementById('clearSelection');
const resetImageButton = document.getElementById('resetImage');
const processButton = document.getElementById('processButton');
const processingState = document.getElementById('processingState');
const processingLabel = document.getElementById('processingLabel');
const errorBox = document.getElementById('errorBox');
const resultPanel = document.getElementById('resultPanel');
const beforePreview = document.getElementById('beforePreview');
const afterPreview = document.getElementById('afterPreview');
const downloadLink = document.getElementById('downloadLink');

const ctx = imageCanvas.getContext('2d');


const state = {
  image: null,
  selection: null,
  drawing: false,
  start: null,
  processing: false,
  originalDataUrl: '',
  processedDataUrl: '',
};

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('is-hidden');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('is-hidden');
}

function setProcessing(active, message = 'Processing…') {
  state.processing = active;
  processingState.classList.toggle('is-hidden', !active);
  processingLabel.textContent = message;
  processButton.disabled = active || !state.image || !state.selection;
}

function drawImageToCanvas() {
  if (!state.image) return;
  const image = state.image;
  const maxWidth = Math.min(window.innerWidth - 120, 980);
  const ratio = Math.min(1, maxWidth / image.width);
  const width = Math.max(200, Math.round(image.width * ratio));
  const height = Math.round(image.height * ratio);
  imageCanvas.width = width;
  imageCanvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if (state.selection) {
    const s = state.selection;
    const x = s.x * width;
    const y = s.y * height;
    const w = s.w * width;
    const h = s.h * height;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(125,211,252,0.18)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
}

function updateSelectionInfo() {
  if (!state.selection) {
    selectionInfo.classList.add('is-hidden');
    return;
  }
  const rect = state.selection;
  selectionInfo.textContent = `Selection: ${Math.round(rect.w * 100)}% × ${Math.round(rect.h * 100)}%`;
  selectionInfo.classList.remove('is-hidden');
}

function resetSelection() {
  state.selection = null;
  drawImageToCanvas();
  updateSelectionInfo();
  processButton.disabled = true;
}

function getPointerPosition(event) {
  const rect = imageCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

imageInput.addEventListener('change', (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  clearError();
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type) && !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
    showError('Unsupported file type. Please upload JPG, JPEG, PNG, or WEBP.');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showError('Image file is too large. Please upload an image under 25 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.originalDataUrl = reader.result;
      state.selection = null;
      emptyPreview.classList.add('is-hidden');
      imageCanvasWrap.classList.remove('is-hidden');
      drawImageToCanvas();
      updateSelectionInfo();
      processButton.disabled = true;
      resultPanel.classList.add('is-hidden');
    };
    img.src = reader.result;
  };
  reader.readAsDataURL(file);
});

clearSelectionButton.addEventListener('click', () => {
  resetSelection();
});

resetImageButton.addEventListener('click', () => {
  imageInput.value = '';
  state.image = null;
  state.selection = null;
  state.originalDataUrl = '';
  state.processedDataUrl = '';
  emptyPreview.classList.remove('is-hidden');
  imageCanvasWrap.classList.add('is-hidden');
  resultPanel.classList.add('is-hidden');
  clearError();
});

imageCanvas.addEventListener('pointerdown', (event) => {
  if (!state.image || state.processing) return;
  const { x, y } = getPointerPosition(event);
  state.drawing = true;
  state.start = { x, y };
  state.selection = null;
});

imageCanvas.addEventListener('pointermove', (event) => {
  if (!state.image || !state.drawing || state.processing) return;
  const current = getPointerPosition(event);
  const x1 = state.start.x;
  const y1 = state.start.y;
  let x = Math.min(x1, current.x);
  let y = Math.min(y1, current.y);
  let w = Math.abs(current.x - x1);
  let h = Math.abs(current.y - y1);
  if (w < 0.02 || h < 0.02) {
    state.selection = null;
    drawImageToCanvas();
    return;
  }
  state.selection = { x, y, w, h };
  drawImageToCanvas();
  updateSelectionInfo();
  processButton.disabled = false;
});

imageCanvas.addEventListener('pointerup', () => {
  if (!state.image || !state.drawing) return;
  state.drawing = false;
  if (!state.selection) {
    processButton.disabled = true;
    return;
  }
  const { w, h } = state.selection;
  if (w < 0.02 || h < 0.02) {
    state.selection = null;
    processButton.disabled = true;
    return;
  }
  updateSelectionInfo();
  processButton.disabled = false;
});

imageCanvas.addEventListener('pointerleave', () => {
  if (!state.image || !state.drawing) return;
  state.drawing = false;
  if (state.selection) {
    processButton.disabled = false;
  }
});

async function processImage() {
  if (!state.image || !state.selection || state.processing) return;
  clearError();
  setProcessing(true, 'Removing watermark…');

  try {
    const img = state.image;
    const canvas = document.createElement('canvas');
    const tctx = canvas.getContext('2d');
    canvas.width = img.width;
    canvas.height = img.height;
    tctx.drawImage(img, 0, 0);

    const { x, y, w, h } = state.selection;
    const sx = Math.max(0, Math.floor(x * img.width));
    const sy = Math.max(0, Math.floor(y * img.height));
    const sw = Math.max(1, Math.ceil(w * img.width));
    const sh = Math.max(1, Math.ceil(h * img.height));

    const original = tctx.getImageData(sx, sy, sw, sh);
    const data = original.data;
    for (let i = 0; i < data.length; i += 4) {
      const avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      data[i] = avg;
      data[i + 1] = avg;
      data[i + 2] = avg;
    }
    tctx.putImageData(original, sx, sy);

    const outputUrl = canvas.toDataURL('image/png');
    state.processedDataUrl = outputUrl;

    beforePreview.src = state.originalDataUrl;
    afterPreview.src = outputUrl;
    resultPanel.classList.remove('is-hidden');
    downloadLink.href = outputUrl;
    downloadLink.download = 'watermark-removed.png';
  } catch (error) {
    showError('Processing failed. Please choose a different selection and try again.');
  } finally {
    setProcessing(false, 'Processing…');
  }
}

processButton.addEventListener('click', processImage);
