const state = {
  image: null,
  canvas: null,
  ctx: null,
  crop: { x: 0, y: 0, w: 100, h: 100, aspect: null },
  dragging: false,
  dragHandle: null,
  processing: false,
  sourceFile: null,
  resultUrl: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => Array.from(document.querySelectorAll(selector));

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
  const w = Math.round(state.crop.w);
  const h = Math.round(state.crop.h);
  cropDimensions.textContent = `${w} × ${h}px`;
  if (state.crop.aspect) {
    cropDimensions.textContent += ` (${state.crop.aspect})`;
  }
}

function setCropAspectRatio(aspect) {
  if (!state.image) return;
  const canvasRect = cropCanvas.getBoundingClientRect();
  const availWidth = canvasRect.width * 0.8;
  const availHeight = canvasRect.height * 0.8;

  let w, h;
  const [ratioW, ratioH] = aspect === 'free' ? [1, 1] : aspect.split(':').map(Number);

  if (aspect === 'free') {
    w = availWidth;
    h = availHeight;
    state.crop.aspect = null;
  } else {
    if (availWidth / availHeight > ratioW / ratioH) {
      h = availHeight;
      w = h * (ratioW / ratioH);
    } else {
      w = availWidth;
      h = w * (ratioH / ratioW);
    }
    state.crop.aspect = aspect;
  }

  state.crop.w = Math.max(50, Math.min(w, canvasRect.width * 0.95));
  state.crop.h = Math.max(50, Math.min(h, canvasRect.height * 0.95));
  state.crop.x = (canvasRect.width - state.crop.w) / 2;
  state.crop.y = (canvasRect.height - state.crop.h) / 2;

  updateCropInfo();
  drawCrop();
}

function drawCrop() {
  const canvasRect = cropCanvas.getBoundingClientRect();
  const style = cropCanvas.style;

  const cropBox = document.querySelector('.crop-box');
  if (cropBox) cropBox.remove();

  const box = document.createElement('div');
  box.className = 'crop-box';
  box.style.left = state.crop.x + 'px';
  box.style.top = state.crop.y + 'px';
  box.style.width = state.crop.w + 'px';
  box.style.height = state.crop.h + 'px';
  cropCanvas.parentElement.appendChild(box);
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
      displayImage();
      updateProcessButton();
      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      cropCanvas.classList.remove('is-hidden');

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
  const containerRect = container.getBoundingClientRect();

  const maxWidth = containerRect.width - 36;
  const maxHeight = containerRect.height - 36;

  let scale = Math.min(maxWidth / state.image.width, maxHeight / state.image.height);
  const displayWidth = state.image.width * scale;
  const displayHeight = state.image.height * scale;

  cropCanvas.width = displayWidth;
  cropCanvas.height = displayHeight;

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

cropCanvas.addEventListener('mousedown', (e) => {
  if (!state.image) return;
  const rect = cropCanvas.getBoundingClientRect();
  const x = e.clientX - rect.left;
  const y = e.clientY - rect.top;

  state.dragging = true;
  const startX = state.crop.x;
  const startY = state.crop.y;
  const startW = state.crop.w;
  const startH = state.crop.h;

  const handleDistance = 15;

  cropCanvas.addEventListener('mousemove', onDragMove);
  cropCanvas.addEventListener('mouseup', onDragEnd);

  function onDragMove(moveEvent) {
    if (!state.dragging) return;
    const moveRect = cropCanvas.getBoundingClientRect();
    const moveX = moveEvent.clientX - moveRect.left;
    const moveY = moveEvent.clientY - moveRect.top;
    const dx = moveX - x;
    const dy = moveY - y;

    const nearTL = Math.abs(startX - x) < handleDistance && Math.abs(startY - y) < handleDistance;
    const nearTR = Math.abs((startX + startW) - x) < handleDistance && Math.abs(startY - y) < handleDistance;
    const nearBL = Math.abs(startX - x) < handleDistance && Math.abs((startY + startH) - y) < handleDistance;
    const nearBR = Math.abs((startX + startW) - x) < handleDistance && Math.abs((startY + startH) - y) < handleDistance;

    if (nearTL) {
      state.crop.x = startX + dx;
      state.crop.y = startY + dy;
      state.crop.w = startW - dx;
      state.crop.h = startH - dy;
    } else if (nearTR) {
      state.crop.y = startY + dy;
      state.crop.w = startW + dx;
      state.crop.h = startH - dy;
    } else if (nearBL) {
      state.crop.x = startX + dx;
      state.crop.w = startW - dx;
      state.crop.h = startH + dy;
    } else if (nearBR) {
      state.crop.w = startW + dx;
      state.crop.h = startH + dy;
    } else {
      state.crop.x = startX + dx;
      state.crop.y = startY + dy;
    }

    state.crop.x = Math.max(0, Math.min(state.crop.x, cropCanvas.width - 50));
    state.crop.y = Math.max(0, Math.min(state.crop.y, cropCanvas.height - 50));
    state.crop.w = Math.max(50, Math.min(state.crop.w, cropCanvas.width - state.crop.x));
    state.crop.h = Math.max(50, Math.min(state.crop.h, cropCanvas.height - state.crop.y));

    updateCropInfo();
    drawCrop();
  }

  function onDragEnd() {
    state.dragging = false;
    cropCanvas.removeEventListener('mousemove', onDragMove);
    cropCanvas.removeEventListener('mouseup', onDragEnd);
  }
});

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
