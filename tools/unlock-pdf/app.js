const state = {
  file: null,
  bytes: null,
  resultUrl: null,
  working: false,
};

const $ = (selector) => document.querySelector(selector);

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const passwordInput = $('#password');
const showPassword = $('#showPassword');
const passwordHint = $('#passwordHint');
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

// qpdf copies the PDF into its own memory and writes a second, decrypted copy; phones
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
  if (err?.qpdfLoad || err instanceof ReferenceError || /fetch|network|wasm/i.test(err?.message || '')) {
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

function syncButton() {
  processButton.disabled = !state.bytes || !passwordInput.value || state.working;
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
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    const info = await QpdfRunner.inspect(bytes);
    if (info.status === 'damaged') {
      showToast('This file could not be opened. It may be damaged.', true);
      return;
    }
    if (info.status === 'open') {
      // ponytail: restriction-only PDFs (open freely, no print/copy) are deliberately not
      // unlocked — removing an author's restrictions without their password is circumvention.
      showToast(info.encrypted
        ? 'This PDF opens without a password. Its print and copy limits were set by its author and can only be removed with their software.'
        : 'This PDF has no password — there is nothing to unlock.', info.encrypted);
      return;
    }
  } catch (err) {
    showToast(friendlyError(err, 'This file could not be opened. It may be damaged.'), true);
    return;
  }
  state.file = file;
  state.bytes = bytes;
  editingModule.classList.remove('is-hidden');
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = `${formatSize(file.size)} · password-protected`;
  passwordInput.value = '';
  passwordHint.textContent = 'Enter the password used to open this PDF.';
  passwordHint.classList.remove('is-error');
  syncButton();
  passwordInput.focus();
}

async function unlock() {
  if (!state.bytes || state.working || processButton.disabled) return;
  state.working = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');
  try {
    setProgress('Unlocking…', 'Checking password', 0.3);
    const result = await QpdfRunner.run(['--password=' + passwordInput.value, '--decrypt', '/in.pdf', '/out.pdf'], state.bytes);
    if (result.err.some((line) => /invalid password/i.test(line))) {
      processingCard.classList.add('is-hidden');
      passwordHint.textContent = 'That password is not correct. Check it and try again.';
      passwordHint.classList.add('is-error');
      passwordInput.select();
      return;
    }
    // qpdf exits 3 for warnings (e.g. minor damage it repaired); the output is still valid.
    if ((result.code !== 0 && result.code !== 3) || !result.output) throw new Error('qpdf: ' + result.err.join(' '));
    if (result.code === 3) console.warn('qpdf warnings:', result.err.join(' '));
    const blob = new Blob([result.output], { type: 'application/pdf' });
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = state.file.name.replace(/\.pdf$/i, '') + '-unlocked.pdf';
    resultMeta.textContent = `${formatSize(blob.size)} · no password`;
    resultCard.classList.remove('is-hidden');
    passwordHint.textContent = 'Password accepted.';
    passwordHint.classList.remove('is-error');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Unlocked successfully. The new copy opens without a password.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while unlocking the PDF. Please try again.'), true);
    setProgress('Error', 'Unlock failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.working = false;
    syncButton();
  }
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', unlock);
passwordInput.addEventListener('input', () => {
  clearResult();
  passwordHint.textContent = 'Enter the password used to open this PDF.';
  passwordHint.classList.remove('is-error');
  syncButton();
});
passwordInput.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') unlock();
});
showPassword.addEventListener('change', () => {
  passwordInput.type = showPassword.checked ? 'text' : 'password';
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
