const state = {
  file: null,
  doc: null, // pdf.js document, for thumbnails
  turns: [], // extra rotation per page in degrees (0, 90, 180, 270), index 0 = page 1
  resultUrl: null,
  saving: false,
};

const $ = (selector) => document.querySelector(selector);

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const pageGrid = $('#pageGrid');
const rotateSummary = $('#rotateSummary');
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

// pdf.js (thumbnails) and pdf-lib (saving) each hold the PDF in memory; phones
// (navigator.deviceMemory <= 4 GB, Chromium only) get a lower limit.
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
  // module or fetch, and a missing pdf-lib or PdfPreview as a ReferenceError.
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

let thumbs = null;

function syncSummary() {
  const changed = state.turns.filter((t) => t !== 0).length;
  rotateSummary.textContent = changed
    ? `${changed} of ${state.turns.length} page${state.turns.length === 1 ? '' : 's'} will be rotated.`
    : 'Rotate pages with the buttons, then save.';
  processButton.disabled = !changed || state.saving;
}

// Turns one page by delta degrees and redraws its thumbnail at the new angle.
function turnPage(index, delta) {
  state.turns[index] = (state.turns[index] + delta + 360) % 360;
  const card = pageGrid.children[index];
  card.dataset.rotate = String(state.turns[index]);
  card.classList.toggle('is-turned', state.turns[index] !== 0);
  card.querySelector('.turn-badge').textContent = { 0: '', 90: '90° right', 180: '180°', 270: '90° left' }[state.turns[index]];
  // Only redraw thumbnails already shown; the rest read data-rotate when they scroll into view, so
  // "rotate all" on a long PDF does not render every page at once.
  if (card.querySelector('img.is-loaded')) thumbs.refresh(card);
  clearResult();
  syncSummary();
}

function turnAll(delta) {
  for (let i = 0; i < state.turns.length; i++) turnPage(i, delta);
}

function buildGrid() {
  thumbs = PdfPreview.thumbnails(state.doc);
  const cards = [];
  for (let n = 1; n <= state.doc.numPages; n++) {
    const card = document.createElement('figure');
    card.className = 'page-card';
    card.dataset.page = String(n);
    card.dataset.rotate = '0';
    card.innerHTML = `
      <div class="page-thumb"><img alt="Page ${n}"><span class="turn-badge"></span></div>
      <figcaption>Page ${n}</figcaption>
      <div class="page-actions">
        <button type="button" data-turn="-90" aria-label="Rotate page ${n} left" title="Rotate left">↺</button>
        <button type="button" data-turn="90" aria-label="Rotate page ${n} right" title="Rotate right">↻</button>
      </div>`;
    for (const button of card.querySelectorAll('[data-turn]')) {
      button.addEventListener('click', () => turnPage(n - 1, Number(button.dataset.turn)));
    }
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
  state.turns = new Array(state.doc.numPages).fill(0);
  editingModule.classList.remove('is-hidden');
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = `${formatSize(file.size)} · ${state.doc.numPages} page${state.doc.numPages === 1 ? '' : 's'}`;
  buildGrid();
  syncSummary();
  previewStatus.className = 'preview-status ready';
}

// Only each page's rotation setting changes; content, text, images and links are untouched.
async function save() {
  if (!state.file || state.saving) return;
  state.saving = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');
  try {
    setProgress('Rotating…', 'Reading PDF', 0.2);
    const pdf = await PDFLib.PDFDocument.load(await state.file.arrayBuffer(), { updateMetadata: false });
    pdf.getPages().forEach((page, i) => {
      if (state.turns[i]) page.setRotation(PDFLib.degrees((page.getRotation().angle + state.turns[i]) % 360));
    });
    setProgress('Finishing…', 'Saving PDF', 0.8);
    const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = state.file.name.replace(/\.pdf$/i, '') + '-rotated.pdf';
    resultMeta.textContent = `${formatSize(blob.size)} · ${pdf.getPageCount()} pages`;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Rotated successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(/encrypt/i.test(err?.message || '')
      ? 'This PDF is password-protected. Remove the password first.'
      : friendlyError(err, 'Something went wrong while rotating. Please try again.'), true);
    setProgress('Error', 'Rotation failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.saving = false;
    syncSummary();
  }
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', save);
$('#rotateAllLeft').addEventListener('click', () => turnAll(-90));
$('#rotateAllRight').addEventListener('click', () => turnAll(90));
$('#resetAll').addEventListener('click', () => {
  state.turns.forEach((turn, i) => { if (turn) turnPage(i, -turn); });
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
