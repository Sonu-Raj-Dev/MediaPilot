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
// is a binary OLE format docx-preview cannot parse.
function isDocx(file) {
  if (file.name.toLowerCase().endsWith('.docx')) return true;
  return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
}

// Word only records a break where it last paginated; where a document pushes text to the next
// page with blank lines instead, docx-preview leaves one over-tall page. Move trailing blocks to
// a new page until it fits. Pages only slightly too tall are browser font-metric drift from a
// page Word did fit, so those are left whole and shrunk at export instead.
// ponytail: 25% threshold is a heuristic; a doc that overflows by less without a Word break stays shrunk.
function splitOverflowingPages() {
  for (let page = docPreview.querySelector('section.docx'); page; page = page.nextElementSibling) {
    // +2px: offsetHeight is rounded, so a page exactly at min-height can read a fraction over.
    const limit = page.offsetWidth * (parseFloat(page.style.minHeight) / parseFloat(page.style.width)) + 2;
    const article = page.querySelector(':scope > article');
    if (!article || page.offsetHeight <= limit * 1.25) continue;
    const next = page.cloneNode(false);
    const nextArticle = article.cloneNode(false);
    for (const part of page.children) next.appendChild(part === article ? nextArticle : part.cloneNode(true));
    page.after(next);
    while (page.offsetHeight > limit && article.children.length > 1) {
      nextArticle.prepend(article.lastElementChild);
    }
  }
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
    docPreview.innerHTML = '';
    // lastRenderedPageBreak markers are where Word itself broke the pages when the file was
    // last saved, so honouring them makes each rendered <section> one Word page.
    await docx.renderAsync(file, docPreview, null, {
      breakPages: true,
      ignoreLastRenderedPageBreak: false,
      experimental: true,
      useBase64URL: true, // data: URLs so html2canvas can draw the images
    });
    splitOverflowingPages();
    processButton.disabled = !docPreview.querySelector('section.docx');
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
    const pages = [...docPreview.querySelectorAll('section.docx')];
    let pdf;
    for (const [i, page] of pages.entries()) {
      setProgress('Rendering…', `Page ${i + 1} of ${pages.length}`, 0.05 + 0.85 * (i / pages.length));
      // The section's CSS size is the Word page size, so px * 0.75 gives the page in points.
      const w = page.offsetWidth * 0.75;
      const h = parseFloat(page.style.minHeight) * (page.style.minHeight.endsWith('pt') ? 1 : 0.75) || page.offsetHeight * 0.75;
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        // html2canvas paints the preview's page shadow as a grey fill over the whole page.
        onclone: (doc) => doc.querySelectorAll('section.docx').forEach((s) => { s.style.boxShadow = 'none'; }),
      });
      const orientation = w > h ? 'l' : 'p';
      if (!pdf) pdf = new jspdf.jsPDF({ orientation, unit: 'pt', format: [w, h] });
      else pdf.addPage([w, h], orientation);
      // A page whose content ran past Word's break is shrunk to fit rather than split.
      const fit = Math.min(w / canvas.width, h / canvas.height);
      pdf.addImage(canvas, 'JPEG', 0, 0, canvas.width * fit, canvas.height * fit, undefined, 'FAST');
    }

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
