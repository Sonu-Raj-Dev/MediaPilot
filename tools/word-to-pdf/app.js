const state = {
  file: null,
  resultUrl: null,
  converting: false,
};

const $ = (selector) => document.querySelector(selector);

const docInput = $('#docInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const emptyPreview = $('#emptyPreview');
const docPreview = $('#docPreview');
const previewStatus = $('#previewStatus');
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
const wordMessage = $('#wordMessage');

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

function showInlineMessage(message, isError) {
  wordMessage.textContent = message;
  wordMessage.classList.remove('is-hidden', 'is-error', 'is-success');
  wordMessage.classList.add(isError ? 'is-error' : 'is-success');
}

function clearInlineMessage() {
  wordMessage.classList.add('is-hidden');
  wordMessage.textContent = '';
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

// Only the modern zip-based format is readable in the browser without a server: legacy .doc
// is a binary OLE format mammoth.js cannot parse.
function isDocx(file) {
  if (file.name.toLowerCase().endsWith('.docx')) return true;
  return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

function readArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Could not read that file.'));
    reader.readAsArrayBuffer(file);
  });
}

async function loadFile(file) {
  if (!file) return;
  if (file.name.toLowerCase().endsWith('.doc')) {
    showToast('Legacy .doc files are not supported — save as .docx first.', true);
    return;
  }
  if (!isDocx(file)) {
    showToast('Please choose a .docx file.', true);
    return;
  }

  state.file = file;
  if (state.resultUrl) {
    URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = null;
  }
  resultCard.classList.add('is-hidden');
  clearInlineMessage();

  editingModule.classList.remove('is-hidden');
  emptyPreview.classList.add('is-hidden');
  docPreview.classList.remove('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = formatSize(file.size);
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');

  previewStatus.className = 'preview-status working';
  docPreview.innerHTML = '<p>Reading document…</p>';
  try {
    const arrayBuffer = await readArrayBuffer(file);
    const { value: html } = await mammoth.convertToHtml({ arrayBuffer });
    docPreview.innerHTML = html || '<p><em>This document has no readable text.</em></p>';
    processButton.disabled = false;
  } catch (err) {
    docPreview.innerHTML = '';
    showInlineMessage('Could not read this document: ' + (err.message || 'unknown error'), true);
    processButton.disabled = true;
  } finally {
    previewStatus.className = 'preview-status ready';
  }
}

async function convertToPdf() {
  if (!state.file || state.converting || processButton.disabled) return;
  state.converting = true;
  processButton.disabled = true;
  processingCard.classList.remove('is-hidden');
  resultCard.classList.add('is-hidden');
  clearInlineMessage();
  setProgress('Rendering…', 'Laying out pages', 0.2);

  try {
    const pdf = new jspdf.jsPDF('p', 'pt', 'a4');
    await new Promise((resolve, reject) => {
      pdf.html(docPreview, {
        callback: () => resolve(),
        margin: [40, 40, 40, 40],
        // 'text' mode reflows around page breaks by walking the DOM, which corrupts row
        // heights on tables (rows render overlapping each other). This document is
        // table-heavy (spec/property tables throughout), so 'slice' — a literal image
        // cut at each page boundary — is used instead. It can cut a table row across a
        // page break, but never produces overlapping/unreadable text.
        autoPaging: 'slice',
        // jsPDF derives its own html2canvas scale from width/windowWidth (515/750) to fit
        // the page exactly — passing an html2canvas.scale here would silently overwrite
        // that and push content past the right edge, so it's left unset.
        width: 515,
        windowWidth: 750,
      }).catch(reject);
    });

    setProgress('Finishing…', 'Building PDF', 0.9);
    const blob = pdf.output('blob');
    if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
    state.resultUrl = URL.createObjectURL(blob);

    const baseName = state.file.name.replace(/\.[^.]+$/, '');
    downloadButton.href = state.resultUrl;
    downloadButton.download = baseName + '.pdf';
    resultMeta.textContent = formatSize(blob.size) + ' · PDF';
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Converted successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage('Conversion failed: ' + (err.message || 'unknown error'), true);
    setProgress('Error', err.message || 'Conversion failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.converting = false;
    processButton.disabled = false;
  }
}

docInput.addEventListener('change', (event) => loadFile(event.target.files[0]));
replaceButton.addEventListener('click', () => docInput.click());
processButton.addEventListener('click', convertToPdf);

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
