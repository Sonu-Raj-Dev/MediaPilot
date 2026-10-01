// Shared by /tools/pdf-to-jpg and /tools/pdf-to-png; each page sets <body data-format>.
const FORMAT = document.body.dataset.format === 'png' ? 'png' : 'jpeg';
const EXT = FORMAT === 'png' ? 'png' : 'jpg';
const MIME = `image/${FORMAT}`;

const state = {
  file: null,
  doc: null,
  selected: new Set(), // 1-based page numbers
  resultUrl: null,
  converting: false,
};

const $ = (selector) => document.querySelector(selector);

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const pageGrid = $('#pageGrid');
const selectionCount = $('#selectionCount');
const selectAllButton = $('#selectAll');
const selectNoneButton = $('#selectNone');
const qualitySelect = $('#quality');
const processButton = $('#processButton');
const processingCard = $('#processingCard');
const processingLabel = $('#processingLabel');
const processingDetail = $('#processingDetail');
const processingPercent = $('#processingPercent');
const progressBar = $('#progressBar');
const resultCard = $('#resultCard');
const resultMeta = $('#resultMeta');
const downloadButton = $('#downloadButton');
const editingModule = $('#editingModule');
const previewStatus = $('#previewStatus');
const toast = $('#toast');
const inlineMessage = $('#inlineMessage');

// pdf.js keeps the whole PDF in memory while pages are rendered; phones (navigator.deviceMemory
// <= 4 GB, Chromium only) get a lower limit.
const MAX_FILE_MB = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 100 : 300;

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

function showInlineMessage(message, isError) {
  inlineMessage.textContent = message;
  inlineMessage.classList.remove('is-hidden', 'is-error', 'is-success');
  inlineMessage.classList.add(isError ? 'is-error' : 'is-success');
}

function clearResult() {
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = null;
  resultCard.classList.add('is-hidden');
  inlineMessage.classList.add('is-hidden');
}

// Users see a plain message, never the raw technical error, which goes to the console instead.
function friendlyError(err, fallback) {
  console.error(err);
  if (!navigator.onLine) return 'You appear to be offline. Check your internet connection and try again.';
  // pdf.js arrives by dynamic import; a failed download surfaces as a TypeError mentioning the
  // module or fetch, and a missing JSZip or PdfPreview as a ReferenceError.
  if (err instanceof ReferenceError || /fetch|network|module|import/i.test(err?.message || '')) {
    return 'Part of the tool did not load. Check your internet connection and refresh the page.';
  }
  return fallback;
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return Math.round(bytes / 1024) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function setProgress(label, detail, percent) {
  processingLabel.textContent = label;
  processingDetail.textContent = detail;
  const pct = Math.round(percent * 100);
  processingPercent.textContent = pct + '%';
  progressBar.style.width = pct + '%';
}

function syncSelection() {
  const total = state.doc ? state.doc.numPages : 0;
  const count = state.selected.size;
  selectionCount.textContent = `${count} of ${total} page${total === 1 ? '' : 's'} selected`;
  processButton.disabled = !count || state.converting;
  for (const card of pageGrid.children) {
    const on = state.selected.has(Number(card.dataset.page));
    card.classList.toggle('is-selected', on);
    card.querySelector('input').checked = on;
  }
}

let thumbs = null;

function buildGrid() {
  thumbs?.stop();
  thumbs = PdfPreview.thumbnails(state.doc);
  const cards = [];
  for (let n = 1; n <= state.doc.numPages; n++) {
    const card = document.createElement('label');
    card.className = 'page-card is-selected';
    card.dataset.page = String(n);
    card.innerHTML = `
      <div class="page-thumb"><img alt="Page ${n}"></div>
      <span class="page-foot"><input type="checkbox" checked aria-label="Convert page ${n}"><span>Page ${n}</span></span>`;
    card.querySelector('input').addEventListener('change', (event) => {
      if (event.target.checked) state.selected.add(n);
      else state.selected.delete(n);
      clearResult();
      syncSelection();
    });
    cards.push(card);
  }
  pageGrid.replaceChildren(...cards);
  for (const card of cards) thumbs.watch(card);
}

async function loadFile(file) {
  if (!file) return;
  if (!(file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf'))) {
    showToast('Please choose a PDF file.', true);
    return;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    showToast(`This file is ${formatSize(file.size)}. The maximum is ${MAX_FILE_MB} MB.`, true);
    return;
  }
  clearResult();
  previewStatus.className = 'preview-status working';
  try {
    const doc = await PdfPreview.open(file);
    thumbs?.stop(); // before destroying the old document it may still be drawing from
    if (state.doc) state.doc.destroy();
    state.doc = doc;
    state.file = file;
  } catch (err) {
    previewStatus.className = 'preview-status ready';
    showToast(err?.name === 'PasswordException'
      ? 'This PDF is password-protected. Remove the password first.'
      : friendlyError(err, 'This file could not be opened. It may be damaged.'), true);
    return;
  }
  state.selected = new Set(Array.from({ length: state.doc.numPages }, (_, i) => i + 1));
  editingModule.classList.remove('is-hidden');
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = `${formatSize(file.size)} · ${state.doc.numPages} page${state.doc.numPages === 1 ? '' : 's'}`;
  buildGrid();
  syncSelection();
  previewStatus.className = 'preview-status ready';
}

async function convert() {
  if (!state.doc || state.converting || !state.selected.size) return;
  state.converting = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');
  const pages = [...state.selected].sort((a, b) => a - b);
  const scale = Number(qualitySelect.value) / 72;
  const baseName = state.file.name.replace(/\.pdf$/i, '');
  const pad = String(state.doc.numPages).length;
  const canvas = document.createElement('canvas');

  try {
    const images = [];
    for (const [index, n] of pages.entries()) {
      setProgress('Converting…', `Page ${n} (${index + 1} of ${pages.length})`, 0.03 + 0.87 * (index / pages.length));
      await PdfPreview.renderPage(state.doc, n, scale, canvas);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, MIME, 0.92));
      if (!blob) throw new Error('canvas export failed');
      images.push({ name: `${baseName}-page-${String(n).padStart(pad, '0')}.${EXT}`, blob });
    }

    let blob;
    let downloadName;
    if (images.length === 1) {
      ({ blob } = images[0]);
      downloadName = images[0].name;
      resultMeta.textContent = `${formatSize(blob.size)} · ${EXT.toUpperCase()} image`;
    } else {
      setProgress('Finishing…', 'Packing ZIP', 0.92);
      const zip = new JSZip();
      for (const image of images) zip.file(image.name, image.blob);
      // Images are already compressed; storing them makes the ZIP much faster to build.
      blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      downloadName = `${baseName}-${EXT}.zip`;
      resultMeta.textContent = `${formatSize(blob.size)} · ${images.length} ${EXT.toUpperCase()} images in one ZIP`;
    }
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = downloadName;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'Ready', 1);
    showInlineMessage('Converted successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while converting. Please try again.'), true);
    setProgress('Error', 'Conversion failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    canvas.width = canvas.height = 0; // release the bitmap now rather than at GC
    state.converting = false;
    processButton.disabled = !state.selected.size;
  }
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', convert);
qualitySelect.addEventListener('change', clearResult);
selectAllButton.addEventListener('click', () => {
  state.selected = new Set(Array.from({ length: state.doc.numPages }, (_, i) => i + 1));
  clearResult();
  syncSelection();
});
selectNoneButton.addEventListener('click', () => {
  state.selected.clear();
  clearResult();
  syncSelection();
});

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  loadFile(event.dataTransfer?.files?.[0]);
});
