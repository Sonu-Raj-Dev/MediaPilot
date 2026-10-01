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
const docSummary = $('#docSummary');
const passwordInput = $('#password');
const confirmInput = $('#confirmPassword');
const showPasswords = $('#showPasswords');
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

// qpdf copies the PDF into its own memory and writes a second, encrypted copy; phones
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

// ---- qpdf (the standard open-source PDF tool, compiled to WebAssembly) -----------------------

let qpdfScript = null;

// The 1.3 MB engine loads only when a file is chosen, not with the page.
function loadQpdf() {
  qpdfScript ||= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/vendor/qpdf/qpdf.js';
    script.onload = () => resolve(window.Module);
    script.onerror = () => {
      qpdfScript = null; // let the next attempt retry
      reject(Object.assign(new Error('qpdf failed to load'), { qpdfLoad: true }));
    };
    document.head.append(script);
  });
  return qpdfScript;
}

// Runs one qpdf command on `input` and returns its exit code, output lines and /out.pdf if made.
// This build ignores emscripten's print hooks and binds console.log / console.error when an
// instance is created, so the console is swapped for collectors before creating it and restored
// after the command. A fresh instance per command keeps runs independent; the browser caches the
// compiled WebAssembly, so this costs only a few ms.
async function runQpdf(args, input) {
  const factory = await loadQpdf();
  const out = [];
  const err = [];
  const { log, error, warn } = console;
  console.log = (...parts) => out.push(parts.join(' '));
  console.error = (...parts) => err.push(parts.join(' '));
  console.warn = (...parts) => err.push(parts.join(' '));
  let qpdf;
  let code;
  try {
    qpdf = await factory({ locateFile: () => '/vendor/qpdf/qpdf.wasm' });
    qpdf.FS.writeFile('/in.pdf', input);
    code = qpdf.callMain(args);
  } catch (exit) {
    if (!qpdf) throw exit; // the engine itself failed to start
    code = typeof exit?.status === 'number' ? exit.status : 2;
  } finally {
    Object.assign(console, { log, error, warn });
  }
  let output = null;
  try {
    output = qpdf.FS.readFile('/out.pdf');
  } catch { /* no output for this command */ }
  return { code, out, err, output };
}

// ---- Page logic -----------------------------------------------------------------------------

// Live check under the password fields; the button only enables for a usable pair.
function validate() {
  clearResult();
  const password = passwordInput.value;
  const confirm = confirmInput.value;
  let message = 'Anyone who opens the PDF will need this password.';
  let ok = false;
  if (!password) {
    message = 'Choose a password to protect the PDF.';
  } else if (password.length < 4) {
    message = 'Use at least 4 characters.';
  } else if (!confirm) {
    message = 'Type the password again to confirm it.';
  } else if (password !== confirm) {
    message = 'The two passwords do not match.';
  } else {
    ok = true;
  }
  passwordHint.textContent = message;
  passwordHint.classList.toggle('is-error', !ok && confirm.length > 0);
  processButton.disabled = !ok || !state.bytes || state.working;
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
  let pages;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
    const check = await runQpdf(['--show-npages', '/in.pdf'], bytes);
    if (check.code !== 0) {
      console.error('qpdf:', check.err.join(' '));
      showToast(check.err.some((line) => /invalid password/i.test(line))
        ? 'This PDF already has a password. Remove it first if you want to set a new one.'
        : 'This file could not be opened. It may be damaged.', true);
      return;
    }
    pages = Number(check.out.find((line) => /^\d+$/.test(line.trim()))) || 0;
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
  const pageText = pages ? `${pages} page${pages === 1 ? '' : 's'}` : 'PDF';
  assetMeta.textContent = `${formatSize(file.size)} · ${pageText}`;
  docSummary.textContent = pageText;
  validate();
  passwordInput.focus();
}

async function protect() {
  if (!state.bytes || state.working || processButton.disabled) return;
  state.working = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');
  try {
    setProgress('Protecting…', 'Encrypting with AES-256', 0.3);
    const password = passwordInput.value;
    // The same password as user and owner password: whoever can open the PDF can also print and
    // copy from it, which is what people expect from "add a password".
    const result = await runQpdf(['--encrypt', password, password, '256', '--', '/in.pdf', '/out.pdf'], state.bytes);
    if (result.code !== 0 && result.code !== 3) throw new Error('qpdf: ' + result.err.join(' '));
    if (!result.output) throw new Error('qpdf produced no output');
    // qpdf exits 3 for warnings (e.g. minor damage it repaired); the output is still valid.
    if (result.code === 3) console.warn('qpdf warnings:', result.err.join(' '));
    const blob = new Blob([result.output], { type: 'application/pdf' });
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = state.file.name.replace(/\.pdf$/i, '') + '-protected.pdf';
    resultMeta.textContent = `${formatSize(blob.size)} · AES-256 encrypted`;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Protected successfully. Keep your password safe — it cannot be recovered.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while protecting the PDF. Please try again.'), true);
    setProgress('Error', 'Protection failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.working = false;
    processButton.disabled = false; // the passwords were valid when protection started
  }
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', protect);
passwordInput.addEventListener('input', validate);
confirmInput.addEventListener('input', validate);
showPasswords.addEventListener('change', () => {
  const type = showPasswords.checked ? 'text' : 'password';
  passwordInput.type = type;
  confirmInput.type = type;
});
for (const input of [passwordInput, confirmInput]) {
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') protect();
  });
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
