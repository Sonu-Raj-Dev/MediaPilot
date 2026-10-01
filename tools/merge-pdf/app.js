const state = {
  items: [], // { file, pages }
  resultUrl: null,
  merging: false,
};

const $ = (selector) => document.querySelector(selector);

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const addButton = $('#addButton');
const emptyPreview = $('#emptyPreview');
const fileGrid = $('#fileGrid');
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

// pdf-lib holds every input and the merged output in memory at once (~2-3x the total size), so
// the total is capped lower on devices reporting 4 GB of RAM or less (navigator.deviceMemory).
const MAX_TOTAL_MB = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 100 : 300;

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
  // A ReferenceError here means the PDF library never loaded ("PDFLib is not defined").
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

function isPdf(file) {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

// Opening each file as it is added both counts its pages and rejects broken or locked PDFs up
// front, instead of failing halfway through the merge.
async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  const problems = [];
  let total = state.items.reduce((sum, item) => sum + item.file.size, 0);
  for (const file of files) {
    if (!isPdf(file)) {
      problems.push(`${file.name} is not a PDF.`);
      continue;
    }
    if (total + file.size > MAX_TOTAL_MB * 1024 * 1024) {
      problems.push(`${file.name} was not added — the files together can be at most ${MAX_TOTAL_MB} MB.`);
      continue;
    }
    try {
      const doc = await PDFLib.PDFDocument.load(await file.arrayBuffer(), { updateMetadata: false });
      state.items.push({ file, pages: doc.getPageCount() });
      total += file.size;
    } catch (err) {
      if (err instanceof ReferenceError) {
        showToast(friendlyError(err, ''), true);
        return;
      }
      console.error(err);
      problems.push(/encrypt/i.test(err?.message || '')
        ? `${file.name} is password-protected. Remove the password first.`
        : `${file.name} could not be opened. It may be damaged.`);
    }
  }
  if (problems.length) showToast(problems.join(' '), true);
  clearResult();
  render();
}

function moveItem(index, delta) {
  const target = index + delta;
  if (target < 0 || target >= state.items.length) return;
  [state.items[index], state.items[target]] = [state.items[target], state.items[index]];
  clearResult();
  render();
}

function removeItem(index) {
  state.items.splice(index, 1);
  clearResult();
  render();
}

function render() {
  const count = state.items.length;
  editingModule.classList.toggle('is-hidden', !count);
  assetCard.classList.toggle('is-hidden', !count);
  dropzone.classList.toggle('is-hidden', !!count);
  emptyPreview.classList.toggle('is-hidden', !!count);
  // Merging needs at least two files; one file is shown so the user can add the rest.
  processButton.disabled = count < 2 || state.merging;
  if (!count) {
    fileGrid.replaceChildren();
    return;
  }
  const size = state.items.reduce((sum, item) => sum + item.file.size, 0);
  const pages = state.items.reduce((sum, item) => sum + item.pages, 0);
  assetName.textContent = count === 1 ? state.items[0].file.name : `${count} PDFs`;
  assetMeta.textContent = `${formatSize(size)} · ${pages} page${pages === 1 ? '' : 's'}`;

  fileGrid.replaceChildren(...state.items.map((item, index) => {
    const card = document.createElement('figure');
    card.className = 'file-card';
    card.innerHTML = `
      <div class="file-thumb"><span>PDF</span></div>
      <figcaption><span class="file-number">${index + 1}</span><span class="file-name"></span></figcaption>
      <p class="file-meta"></p>
      <div class="file-actions">
        <button type="button" data-move="-1" aria-label="Move earlier" title="Move earlier" ${index === 0 ? 'disabled' : ''}>←</button>
        <button type="button" data-move="1" aria-label="Move later" title="Move later" ${index === count - 1 ? 'disabled' : ''}>→</button>
        <button type="button" data-remove aria-label="Remove file" title="Remove">×</button>
      </div>`;
    card.querySelector('.file-name').textContent = item.file.name;
    card.querySelector('.file-name').title = item.file.name;
    card.querySelector('.file-meta').textContent = `${item.pages} page${item.pages === 1 ? '' : 's'} · ${formatSize(item.file.size)}`;
    card.querySelector('[data-move="-1"]').addEventListener('click', () => moveItem(index, -1));
    card.querySelector('[data-move="1"]').addEventListener('click', () => moveItem(index, 1));
    card.querySelector('[data-remove]').addEventListener('click', () => removeItem(index));
    return card;
  }));
}

// Pages are copied as-is (content, fonts, images, links), never redrawn, so nothing is lost.
async function mergePdfs() {
  if (state.items.length < 2 || state.merging) return;
  state.merging = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');

  try {
    const merged = await PDFLib.PDFDocument.create();
    for (const [index, item] of state.items.entries()) {
      setProgress('Merging…', `File ${index + 1} of ${state.items.length}`, 0.05 + 0.85 * (index / state.items.length));
      const source = await PDFLib.PDFDocument.load(await item.file.arrayBuffer(), { updateMetadata: false });
      const pages = await merged.copyPages(source, source.getPageIndices());
      for (const page of pages) merged.addPage(page);
    }
    setProgress('Finishing…', 'Saving PDF', 0.95);
    const bytes = await merged.save();
    const blob = new Blob([bytes], { type: 'application/pdf' });
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = 'merged.pdf';
    resultMeta.textContent = `${formatSize(blob.size)} · ${merged.getPageCount()} pages`;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Merged successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while merging. Please try again.'), true);
    setProgress('Error', 'Merge failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.merging = false;
    processButton.disabled = state.items.length < 2;
  }
}

fileInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  fileInput.value = ''; // so picking the same file again still fires change
});
addButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', mergePdfs);

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('drag-over');
});
dropzone.addEventListener('dragleave', () => dropzone.classList.remove('drag-over'));
dropzone.addEventListener('drop', (event) => {
  event.preventDefault();
  dropzone.classList.remove('drag-over');
  addFiles(event.dataTransfer?.files);
});
