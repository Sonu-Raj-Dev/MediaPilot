const state = {
  file: null,
  pageCount: 0,
  resultUrl: null,
  splitting: false,
};

const $ = (selector) => document.querySelector(selector);

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const docSummary = $('#docSummary');
const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const rangesInput = $('#ranges');
const everyInput = $('#every');
const extractInput = $('#extract');
const planText = $('#plan');
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

// pdf-lib keeps the source and every output in memory, so very large files are refused up front;
// devices reporting 4 GB of RAM or less (navigator.deviceMemory) get a lower limit.
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

// An error whose message is already written for the user and is shown as-is.
function userError(message) {
  return Object.assign(new Error(message), { forUser: true });
}

// Users see a plain message, never the raw technical error, which goes to the console instead.
function friendlyError(err, fallback) {
  if (err?.forUser) return err.message;
  console.error(err);
  if (!navigator.onLine) return 'You appear to be offline. Check your internet connection and try again.';
  // A ReferenceError here means a library never loaded ("PDFLib is not defined").
  if (err instanceof ReferenceError || /fetch|network/i.test(err?.message || '')) {
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

// Parses "1-3, 5, 8-" into [[1,3],[5,5],[8,last]] (1-based, inclusive). Throws a user-facing
// error naming the bad part, so the user can fix exactly that.
function parseRanges(text, last) {
  const parts = text.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (!parts.length) throw userError('Enter the pages to use, for example 1-3, 5.');
  return parts.map((part) => {
    const m = part.match(/^(\d+)\s*(?:[-–]\s*(\d*))?$/);
    if (!m) throw userError(`"${part}" is not a page or range. Use numbers like 2 or 4-7.`);
    const from = Number(m[1]);
    const to = m[2] === undefined ? from : m[2] === '' ? last : Number(m[2]);
    if (from < 1 || to < 1) throw userError('Page numbers start at 1.');
    if (from > last || to > last) throw userError(`"${part}" goes past the last page — this PDF has ${last} page${last === 1 ? '' : 's'}.`);
    if (from > to) throw userError(`"${part}" is backwards. Write the smaller page first, like ${to}-${from}.`);
    return [from, to];
  });
}

function currentMode() {
  return modeInputs.find((input) => input.checked).value;
}

// The output files as lists of 1-based page numbers, plus a label for each file name.
function plannedOutputs() {
  const last = state.pageCount;
  const mode = currentMode();
  if (mode === 'ranges') {
    return parseRanges(rangesInput.value, last).map(([from, to]) => ({
      label: from === to ? `page-${from}` : `pages-${from}-${to}`,
      pages: Array.from({ length: to - from + 1 }, (_, i) => from + i),
    }));
  }
  if (mode === 'every') {
    const n = Number(everyInput.value);
    if (!Number.isInteger(n) || n < 1) throw userError('Enter how many pages each file should have, for example 2.');
    const outputs = [];
    for (let from = 1; from <= last; from += n) {
      const to = Math.min(last, from + n - 1);
      outputs.push({ label: from === to ? `page-${from}` : `pages-${from}-${to}`, pages: Array.from({ length: to - from + 1 }, (_, i) => from + i) });
    }
    return outputs;
  }
  // extract: all chosen pages, in the order typed, into one file
  const pages = parseRanges(extractInput.value, last).flatMap(([from, to]) => Array.from({ length: to - from + 1 }, (_, i) => from + i));
  return [{ label: 'extracted', pages }];
}

// Live summary under the options ("3 PDFs: 1-3, 4-6, 7") so mistakes show before splitting.
function updatePlan() {
  clearResult();
  for (const input of modeInputs) input.closest('.mode-row').classList.toggle('is-active', input.checked);
  if (!state.pageCount) return;
  try {
    const outputs = plannedOutputs();
    const describe = (pages) => (pages.length === 1 ? `${pages[0]}` : pages.every((p, i) => i === 0 || p === pages[i - 1] + 1) ? `${pages[0]}-${pages[pages.length - 1]}` : `${pages.length} pages`);
    planText.textContent = outputs.length === 1
      ? `1 PDF with ${outputs[0].pages.length} page${outputs[0].pages.length === 1 ? '' : 's'}.`
      : `${outputs.length} PDFs in one ZIP: ${outputs.slice(0, 6).map((o) => describe(o.pages)).join(', ')}${outputs.length > 6 ? ', …' : ''}`;
    planText.classList.remove('is-error');
    processButton.disabled = state.splitting;
  } catch (err) {
    planText.textContent = friendlyError(err, 'Check the page numbers.');
    planText.classList.add('is-error');
    processButton.disabled = true;
  }
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
  try {
    const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
    state.file = file;
    state.pageCount = doc.getPageCount();
  } catch (err) {
    showToast(/encrypt/i.test(err?.message || '')
      ? 'This PDF is password-protected. Remove the password first.'
      : friendlyError(err, 'This file could not be opened. It may be damaged.'), true);
    return;
  }
  editingModule.classList.remove('is-hidden');
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = `${formatSize(file.size)} · ${state.pageCount} page${state.pageCount === 1 ? '' : 's'}`;
  docSummary.textContent = `${state.pageCount} page${state.pageCount === 1 ? '' : 's'}`;
  // Sensible starting values for this file: halves for ranges, every page, the first page.
  const half = Math.ceil(state.pageCount / 2);
  rangesInput.value = state.pageCount > 1 ? `1-${half}, ${half + 1}-${state.pageCount}` : '1';
  everyInput.value = '1';
  everyInput.max = String(state.pageCount);
  extractInput.value = '1';
  updatePlan();
}

// Pages are copied as-is (content, fonts, images, links), never redrawn, so nothing is lost.
async function splitPdf() {
  if (!state.file || state.splitting) return;
  let outputs;
  try {
    outputs = plannedOutputs();
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Check the page numbers.'), true);
    return;
  }
  state.splitting = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');

  try {
    const source = await PDFLib.PDFDocument.load(await state.file.arrayBuffer(), { updateMetadata: false });
    const baseName = state.file.name.replace(/\.pdf$/i, '');
    const files = [];
    for (const [index, output] of outputs.entries()) {
      setProgress('Splitting…', `File ${index + 1} of ${outputs.length}`, 0.05 + 0.8 * (index / outputs.length));
      const doc = await PDFLib.PDFDocument.create();
      const pages = await doc.copyPages(source, output.pages.map((p) => p - 1));
      for (const page of pages) doc.addPage(page);
      files.push({ name: `${baseName}-${output.label}.pdf`, bytes: await doc.save(), pages: output.pages.length });
    }

    let blob;
    let downloadName;
    if (files.length === 1) {
      blob = new Blob([files[0].bytes], { type: 'application/pdf' });
      downloadName = files[0].name;
      resultMeta.textContent = `${formatSize(blob.size)} · ${files[0].pages} page${files[0].pages === 1 ? '' : 's'}`;
    } else {
      setProgress('Finishing…', 'Packing ZIP', 0.9);
      const zip = new JSZip();
      for (const file of files) zip.file(file.name, file.bytes);
      // PDFs are already compressed; storing them uncompressed makes the ZIP much faster to build.
      blob = await zip.generateAsync({ type: 'blob', compression: 'STORE' });
      downloadName = `${baseName}-split.zip`;
      resultMeta.textContent = `${formatSize(blob.size)} · ${files.length} PDFs in one ZIP`;
    }
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = downloadName;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'Ready', 1);
    showInlineMessage('Split successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while splitting. Please try again.'), true);
    setProgress('Error', 'Split failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.splitting = false;
    processButton.disabled = false; // the plan was valid when the split started
  }
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', splitPdf);
for (const input of [...modeInputs, rangesInput, everyInput, extractInput]) input.addEventListener('input', updatePlan);
// Clicking anywhere in a mode's box, or typing in its field, selects that mode.
for (const input of modeInputs) {
  const row = input.closest('.mode-row');
  const select = () => {
    if (input.checked) return;
    input.checked = true;
    updatePlan();
  };
  row.addEventListener('click', select);
  row.querySelector('input:not([type="radio"])').addEventListener('focus', select);
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
