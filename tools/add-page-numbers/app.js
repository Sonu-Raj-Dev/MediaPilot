const state = {
  file: null,
  doc: null, // pdf.js document, for the preview
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
const previewCanvas = $('#previewCanvas');
const previewStage = $('#previewStage');
const previewLabel = $('#previewLabel');
const previewCaption = $('#previewCaption');
const positionSelect = $('#position');
const formatSelect = $('#format');
const sizeSelect = $('#size');
const startPageInput = $('#startPage');
const firstNumberInput = $('#firstNumber');
const optionsHint = $('#optionsHint');
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
const toast = $('#toast');
const inlineMessage = $('#inlineMessage');

// pdf.js (preview) and pdf-lib (saving) each hold the PDF in memory; phones
// (navigator.deviceMemory <= 4 GB, Chromium only) get a lower limit.
const MAX_FILE_MB = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 100 : 300;
const MARGIN = 28; // points from the page edge (about 1 cm)
const TEXT_COLOR = [0.2, 0.2, 0.2];

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

// An error whose message is already written for the user and is shown as-is.
function userError(message) {
  return Object.assign(new Error(message), { forUser: true });
}

// Users see a plain message, never the raw technical error, which goes to the console instead.
function friendlyError(err, fallback) {
  if (err?.forUser) return err.message;
  console.error(err);
  if (!navigator.onLine) return 'You appear to be offline. Check your internet connection and try again.';
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

// ---- Options --------------------------------------------------------------------------------

// The current settings, validated against the open PDF. Throws a user-facing error if invalid.
function readOptions() {
  const total = state.doc.numPages;
  const startPage = Number(startPageInput.value);
  const firstNumber = Number(firstNumberInput.value);
  if (!Number.isInteger(startPage) || startPage < 1 || startPage > total) {
    throw userError(`Start at a page between 1 and ${total}.`);
  }
  if (!Number.isInteger(firstNumber) || firstNumber < 0) {
    throw userError('The first number must be a whole number, 0 or more.');
  }
  const [vertical, horizontal] = positionSelect.value.split('-');
  return {
    startPage,
    firstNumber,
    lastNumber: firstNumber + (total - startPage),
    vertical,
    horizontal,
    format: formatSelect.value,
    size: Number(sizeSelect.value),
  };
}

function labelFor(number, options) {
  return {
    n: `${number}`,
    page: `Page ${number}`,
    slash: `${number} / ${options.lastNumber}`,
    of: `Page ${number} of ${options.lastNumber}`,
  }[options.format];
}

// Where the label's baseline starts, in the page's *visual* frame (origin bottom-left, as the
// page appears in a reader), for a label `width` points wide on a `w` × `h` visual page.
function visualPosition(options, width, w, h) {
  const x = options.horizontal === 'left' ? MARGIN : options.horizontal === 'right' ? w - MARGIN - width : (w - width) / 2;
  const y = options.vertical === 'bottom' ? MARGIN : h - MARGIN - options.size * 0.72;
  return { x, y };
}

// ---- Preview: the first numbered page with its label laid over it ---------------------------

// The canvas can only be drawn by one render at a time, so changes made while a page is being
// drawn are coalesced into a single redraw once it finishes.
let previewBusy = false;
let previewStale = false;

async function updatePreview() {
  clearResult();
  if (!state.doc) return;
  try {
    const options = readOptions();
    optionsHint.textContent = `Pages ${options.startPage}–${state.doc.numPages} will be numbered ${options.firstNumber}–${options.lastNumber}.`;
    optionsHint.classList.remove('is-error');
    processButton.disabled = state.saving;
  } catch (err) {
    optionsHint.textContent = friendlyError(err, 'Check the numbering options.');
    optionsHint.classList.add('is-error');
    processButton.disabled = true;
    return;
  }
  previewStale = true;
  if (previewBusy) return;
  previewBusy = true;
  try {
    while (previewStale) {
      previewStale = false;
      await drawPreview();
    }
  } catch (err) {
    console.error(err); // a failed preview must not block saving
  } finally {
    previewBusy = false;
  }
}

async function drawPreview() {
  let options;
  try {
    options = readOptions(); // the latest settings, not the ones that started the redraw
  } catch {
    return;
  }
  const page = await state.doc.getPage(options.startPage);
  const viewport = page.getViewport({ scale: 1 }); // includes the page's own rotation
  const scale = Math.min(380 / viewport.width, 500 / viewport.height);
  await PdfPreview.renderPage(state.doc, options.startPage, scale, previewCanvas);
  const text = labelFor(options.firstNumber, options);
  // Helvetica's average digit/letter width is close to 0.55 em; the preview only needs to place
  // the label where it will land, the saved PDF measures it exactly.
  const width = text.length * options.size * 0.55;
  const pos = visualPosition(options, width, viewport.width, viewport.height);
  previewLabel.textContent = text;
  previewLabel.style.fontSize = `${options.size * scale}px`;
  previewLabel.style.left = `${pos.x * scale}px`;
  previewLabel.style.bottom = `${pos.y * scale}px`;
  previewStage.style.width = `${previewCanvas.width}px`;
  previewStage.style.height = `${previewCanvas.height}px`;
  previewCaption.textContent = `Preview of page ${options.startPage}`;
}

// ---- Saving ---------------------------------------------------------------------------------

// Converts a point in the visual frame to the page's own coordinates and the text angle, so the
// number reads upright at the visual bottom even on pages stored sideways (/Rotate 90, 180, 270).
function toPageSpace(vx, vy, rotation, box) {
  switch (rotation) {
    case 90: return { x: box.x + box.width - vy, y: box.y + vx, rotate: 90 };
    case 180: return { x: box.x + box.width - vx, y: box.y + box.height - vy, rotate: 180 };
    case 270: return { x: box.x + vy, y: box.y + box.height - vx, rotate: 270 };
    default: return { x: box.x + vx, y: box.y + vy, rotate: 0 };
  }
}

async function save() {
  if (!state.file || state.saving) return;
  let options;
  try {
    options = readOptions();
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Check the numbering options.'), true);
    return;
  }
  state.saving = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');
  try {
    setProgress('Numbering…', 'Reading PDF', 0.15);
    const { PDFDocument, StandardFonts, rgb, degrees } = PDFLib;
    const pdf = await PDFDocument.load(await state.file.arrayBuffer(), { updateMetadata: false });
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();
    for (let i = options.startPage - 1; i < pages.length; i++) {
      const page = pages[i];
      const text = labelFor(options.firstNumber + (i - (options.startPage - 1)), options);
      const width = font.widthOfTextAtSize(text, options.size);
      const box = page.getCropBox();
      const rotation = ((page.getRotation().angle % 360) + 360) % 360;
      const sideways = rotation === 90 || rotation === 270;
      const visualW = sideways ? box.height : box.width;
      const visualH = sideways ? box.width : box.height;
      const v = visualPosition(options, width, visualW, visualH);
      const p = toPageSpace(v.x, v.y, rotation, box);
      page.drawText(text, { x: p.x, y: p.y, size: options.size, font, color: rgb(...TEXT_COLOR), rotate: degrees(p.rotate) });
    }
    setProgress('Finishing…', 'Saving PDF', 0.85);
    const blob = new Blob([await pdf.save()], { type: 'application/pdf' });
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = state.file.name.replace(/\.pdf$/i, '') + '-numbered.pdf';
    const count = pages.length - options.startPage + 1;
    resultMeta.textContent = `${formatSize(blob.size)} · ${count} page${count === 1 ? '' : 's'} numbered`;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Page numbers added.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(/encrypt/i.test(err?.message || '')
      ? 'This PDF is password-protected. Remove the password first.'
      : friendlyError(err, 'Something went wrong while adding page numbers. Please try again.'), true);
    setProgress('Error', 'Numbering failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.saving = false;
    processButton.disabled = false; // the options were valid when saving started
  }
}

// ---- Loading --------------------------------------------------------------------------------

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
  try {
    const doc = await PdfPreview.open(file);
    if (state.doc) state.doc.destroy();
    state.doc = doc;
    state.file = file;
  } catch (err) {
    showToast(err?.name === 'PasswordException'
      ? 'This PDF is password-protected. Remove the password first.'
      : friendlyError(err, 'This file could not be opened. It may be damaged.'), true);
    return;
  }
  editingModule.classList.remove('is-hidden');
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = `${formatSize(file.size)} · ${state.doc.numPages} page${state.doc.numPages === 1 ? '' : 's'}`;
  startPageInput.value = '1';
  startPageInput.max = String(state.doc.numPages);
  firstNumberInput.value = '1';
  updatePreview();
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', save);
for (const control of [positionSelect, formatSelect, sizeSelect, startPageInput, firstNumberInput]) {
  control.addEventListener('input', updatePreview);
}

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
