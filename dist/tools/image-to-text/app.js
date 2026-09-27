const state = {
  image: null,
  sourceFile: null,
  processing: false,
  worker: null,
};

const $ = (selector) => document.querySelector(selector);

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const ocrCanvas = $('#ocrCanvas');
const canvasWrap = $('#canvasWrap');
const frameReadout = $('#frameReadout');
const previewStatus = $('#previewStatus');
const processButton = $('#processButton');
const processingCard = $('#processingCard');
const processingLabel = $('#processingLabel');
const processingDetail = $('#processingDetail');
const processingPercent = $('#processingPercent');
const progressBar = $('#progressBar');
const ocrOutput = $('#ocrOutput');
const ocrText = $('#ocrText');
const copyButton = $('#copyButton');
const downloadTextButton = $('#downloadTextButton');
const selectAllButton = $('#selectAllButton');
const wordCount = $('#wordCount');
const editingModule = $('#editingModule');
const toast = $('#toast');
const ocrMessage = $('#ocrMessage');

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

// OCR results/errors are tied to the Extract button above them, so they show inline here
// instead of the corner toast — a floating notification felt disconnected from the action.
function showInlineMessage(message, isError = false) {
  ocrMessage.textContent = message;
  ocrMessage.classList.remove('is-hidden', 'is-error', 'is-success');
  ocrMessage.classList.add(isError ? 'is-error' : 'is-success');
}

function clearInlineMessage() {
  ocrMessage.classList.add('is-hidden');
  ocrMessage.textContent = '';
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// No language picker — English + Hindi covers the common case (including mixed-language
// documents) without asking the user to know their image's languages up front.
var OCR_LANGUAGES = 'eng+hin';

function previewScale() {
  var rect = canvasWrap.getBoundingClientRect();
  return Math.min(
    (rect.width - 36) / state.image.width,
    (rect.height - 36) / state.image.height,
    1
  );
}

function showPreview() {
  if (!state.image) return;
  var scale = previewScale();
  ocrCanvas.width = Math.max(1, Math.round(state.image.width * scale));
  ocrCanvas.height = Math.max(1, Math.round(state.image.height * scale));
  ocrCanvas.getContext('2d').drawImage(state.image, 0, 0, ocrCanvas.width, ocrCanvas.height);
}

function loadImage(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    showToast('Please choose an image file.', true);
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    showToast('File is too large. Maximum size is 50 MB.', true);
    return;
  }
  var reader = new FileReader();
  reader.onload = function (event) {
    var image = new Image();
    image.onload = function () {
      state.image = image;
      state.sourceFile = file;
      editingModule.classList.remove('is-hidden');
      emptyPreview.classList.add('is-hidden');
      ocrCanvas.classList.remove('is-hidden');
      ocrOutput.classList.add('is-hidden');
      ocrText.value = '';
      wordCount.textContent = '';
      processingCard.classList.add('is-hidden');
      clearInlineMessage();
      showPreview();

      assetName.textContent = file.name;
      assetMeta.textContent = image.width + ' × ' + image.height + ' · ' + formatSize(file.size);
      assetCard.classList.remove('is-hidden');
      dropzone.classList.add('is-hidden');
      frameReadout.textContent = image.width + ' × ' + image.height;
      processButton.disabled = false;
    };
    image.onerror = function () {
      showToast('That image could not be read.', true);
    };
    image.src = event.target.result;
  };
  reader.readAsDataURL(file);
}

function setProgress(label, detail, percent) {
  processingLabel.textContent = label;
  processingDetail.textContent = detail;
  var pct = Math.round(percent * 100);
  processingPercent.textContent = pct + '%';
  progressBar.style.width = pct + '%';
}

function loadTesseract() {
  return new Promise(function (resolve, reject) {
    if (typeof Tesseract !== 'undefined') { resolve(); return; }
    var s = document.createElement('script');
    s.src = '/vendor/tesseract.min.js';
    s.onload = function () {
      if (typeof Tesseract !== 'undefined') resolve();
      else reject(new Error('Tesseract library failed to initialize'));
    };
    s.onerror = function () { reject(new Error('Could not load OCR engine')); };
    document.head.appendChild(s);
  });
}

async function runOCR() {
  if (!state.image || state.processing) return;
  state.processing = true;
  processButton.disabled = true;
  processingCard.classList.remove('is-hidden');
  ocrOutput.classList.add('is-hidden');
  clearInlineMessage();
  previewStatus.className = 'preview-status working';

  setProgress('Initializing OCR…', 'Loading engine', 0);

  try {
    await loadTesseract();
  } catch (err) {
    showInlineMessage(err.message || 'OCR engine not available', true);
    setProgress('Error', err.message || 'OCR engine not available', 0);
    processingCard.classList.add('is-hidden');
    state.processing = false;
    processButton.disabled = false;
    previewStatus.className = 'preview-status ready';
    return;
  }

  try {
    if (state.worker) {
      try { await state.worker.terminate(); } catch (e) { /* ignore */ }
      state.worker = null;
    }

    var worker = await Tesseract.createWorker(OCR_LANGUAGES, 1, {
      workerPath: '/vendor/worker.min.js',
      logger: function (m) {
        if (m.status === 'loading tesseract core') {
          setProgress('Loading OCR engine…', 'Downloading core files', m.progress || 0);
        } else if (m.status === 'initializing tesseract') {
          setProgress('Initializing…', 'Setting up engine', m.progress || 0.1);
        } else if (m.status === 'loading language traineddata') {
          setProgress('Loading language data…', 'English, Hindi', m.progress || 0.2);
        } else if (m.status === 'initializing api') {
          setProgress('Preparing…', 'Almost ready', 0.4);
        } else if (m.status === 'recognizing text') {
          setProgress('Recognizing text…', 'Scanning image', 0.4 + (m.progress || 0) * 0.6);
        }
      },
    });
    state.worker = worker;
    // PSM 4 = "single column of text of variable sizes" — matches row-based layouts like
    // tables, lists and receipts far better than Tesseract's general-purpose default, which
    // tends to fuse adjacent cells together and drop sparse lines entirely.
    await worker.setParameters({ tessedit_pageseg_mode: '4' });

    setProgress('Recognizing text…', 'Scanning image', 0.45);

    // Small screenshots (dense tables, chat captures) have too few pixels per character for
    // Tesseract to resolve reliably, so upscale toward a minimum dimension before recognizing.
    var minDimension = 1400;
    var scale = 1;
    if (state.image.width < minDimension && state.image.height < minDimension) {
      scale = Math.min(3, minDimension / Math.max(state.image.width, state.image.height));
    }

    var canvas = document.createElement('canvas');
    canvas.width = Math.round(state.image.width * scale);
    canvas.height = Math.round(state.image.height * scale);
    var ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(state.image, 0, 0, canvas.width, canvas.height);

    var result = await worker.recognize(canvas);
    canvas.width = 0;
    canvas.height = 0;

    var text = (result.data.text || '').trim();

    if (!text) {
      showInlineMessage('No text was found in this image.', true);
      ocrText.value = '';
      wordCount.textContent = '';
    } else {
      ocrText.value = text;
      var words = text.split(/\s+/).filter(function (w) { return w.length > 0; }).length;
      var chars = text.length;
      wordCount.textContent = words + ' word' + (words === 1 ? '' : 's') + ', ' + chars + ' character' + (chars === 1 ? '' : 's');
      showInlineMessage('Text extracted successfully.', false);
    }

    ocrOutput.classList.remove('is-hidden');
    setProgress('Done', 'Text extracted', 1);
    setTimeout(function () { processingCard.classList.add('is-hidden'); }, 900);

  } catch (err) {
    showInlineMessage('OCR failed: ' + (err.message || 'Unknown error'), true);
    setProgress('Error', err.message || 'OCR failed', 0);
    setTimeout(function () { processingCard.classList.add('is-hidden'); }, 3000);
  } finally {
    state.processing = false;
    processButton.disabled = false;
    previewStatus.className = 'preview-status ready';
  }
}

imageInput.addEventListener('change', function (event) {
  loadImage(event.target.files[0]);
});

replaceButton.addEventListener('click', function () {
  imageInput.click();
});

processButton.addEventListener('click', runOCR);

copyButton.addEventListener('click', function () {
  var text = ocrText.value;
  if (!text) return;
  navigator.clipboard.writeText(text).then(function () {
    showToast('Copied to clipboard.');
  }).catch(function () {
    ocrText.select();
    document.execCommand('copy');
    showToast('Copied to clipboard.');
  });
});

downloadTextButton.addEventListener('click', function () {
  var text = ocrText.value;
  if (!text) return;
  var baseName = state.sourceFile
    ? state.sourceFile.name.replace(/\.[^.]+$/, '')
    : 'extracted';
  var blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  a.download = baseName + '-text.txt';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToast('Downloaded ' + a.download);
});

selectAllButton.addEventListener('click', function () {
  ocrText.select();
  ocrText.focus();
});

dropzone.addEventListener('dragover', function (event) {
  event.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', function () {
  dropzone.classList.remove('drag-over');
});
dropzone.addEventListener('drop', function (event) {
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  var files = event.dataTransfer && event.dataTransfer.files;
  if (files && files[0]) loadImage(files[0]);
});
