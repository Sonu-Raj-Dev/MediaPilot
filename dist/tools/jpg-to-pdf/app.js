// Shared by /tools/jpg-to-pdf and /tools/png-to-pdf — the conversion is identical, only the
// page copy differs, so both pages load this one script.
const state = {
  items: [], // { file, url, width, height }
  resultUrl: null,
  converting: false,
};

const $ = (selector) => document.querySelector(selector);

const imageInput = $('#imageInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const addButton = $('#addButton');
const emptyPreview = $('#emptyPreview');
const imageGrid = $('#imageGrid');
const pageSizeSelect = $('#pageSize');
const orientationSelect = $('#orientation');
const marginSelect = $('#margin');
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

// Points (1/72 inch), as jsPDF measures pages.
const PAGE_SIZES = { a4: [595.28, 841.89], letter: [612, 792] };

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
  // A ReferenceError here means a converter library never loaded (e.g. "jspdf is not defined").
  if (err instanceof ReferenceError || /fetch|network/i.test(err?.message || '')) {
    return 'Part of the converter did not load. Check your internet connection and refresh the page.';
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

// Reads the EXIF orientation tag (1 = upright). PDF viewers ignore EXIF, so a phone photo stored
// sideways with a "rotate me" tag would come out sideways if its bytes went into the PDF as-is.
function jpegOrientation(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  try {
    if (view.getUint16(0) !== 0xffd8) return 1;
    let offset = 2;
    while (offset + 4 <= view.byteLength) {
      const marker = view.getUint16(offset);
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) return 1; // start of image data
      const length = view.getUint16(offset + 2);
      if (marker === 0xffe1 && view.getUint32(offset + 4) === 0x45786966) { // "Exif"
        const tiff = offset + 10;
        const little = view.getUint16(tiff) === 0x4949;
        const ifd = tiff + view.getUint32(tiff + 4, little);
        const count = view.getUint16(ifd, little);
        for (let i = 0; i < count; i++) {
          const entry = ifd + 2 + i * 12;
          if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
        }
        return 1;
      }
      offset += 2 + length;
    }
  } catch {
    // Truncated or malformed EXIF: treat as upright, as browsers do.
  }
  return 1;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('not a readable image'));
    img.src = url;
  });
}

// Each page's input declares what it takes (JPG page: JPG only, PNG page: PNG only). The picker
// enforces that itself, but drag-and-drop does not, so dropped files are checked against it here.
const accepted = imageInput.accept.split(',').map((token) => token.trim().toLowerCase());
const formatLabel = $('h1').textContent.replace(/ to PDF$/, '');

function isAccepted(file) {
  const ext = '.' + file.name.split('.').pop().toLowerCase();
  return accepted.includes(file.type.toLowerCase()) || accepted.includes(ext);
}

async function addFiles(fileList) {
  const files = [...(fileList || [])];
  if (!files.length) return;
  let skipped = 0;
  for (const file of files) {
    if (!isAccepted(file)) { skipped++; continue; }
    const url = URL.createObjectURL(file);
    try {
      // naturalWidth/Height already have EXIF rotation applied, i.e. the size as the user sees it.
      const img = await loadImage(url);
      state.items.push({ file, url, width: img.naturalWidth, height: img.naturalHeight });
    } catch {
      URL.revokeObjectURL(url);
      skipped++;
    }
  }
  if (skipped) showToast(`${skipped} file${skipped > 1 ? 's were' : ' was'} skipped — only ${formatLabel} images can be added here.`, true);
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
  URL.revokeObjectURL(state.items[index].url);
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
  processButton.disabled = !count || state.converting;
  if (!count) {
    imageGrid.replaceChildren();
    return;
  }
  const total = state.items.reduce((sum, item) => sum + item.file.size, 0);
  assetName.textContent = count === 1 ? state.items[0].file.name : `${count} images`;
  assetMeta.textContent = `${formatSize(total)} · ${count} page${count > 1 ? 's' : ''}`;

  imageGrid.replaceChildren(...state.items.map((item, index) => {
    const card = document.createElement('figure');
    card.className = 'image-card';
    card.innerHTML = `
      <div class="image-thumb"><img alt=""></div>
      <figcaption><span class="page-number">${index + 1}</span><span class="image-name"></span></figcaption>
      <div class="image-actions">
        <button type="button" data-move="-1" aria-label="Move earlier" title="Move earlier" ${index === 0 ? 'disabled' : ''}>←</button>
        <button type="button" data-move="1" aria-label="Move later" title="Move later" ${index === count - 1 ? 'disabled' : ''}>→</button>
        <button type="button" data-remove aria-label="Remove image" title="Remove">×</button>
      </div>`;
    card.querySelector('img').src = item.url;
    card.querySelector('.image-name').textContent = item.file.name;
    card.querySelector('[data-move="-1"]').addEventListener('click', () => moveItem(index, -1));
    card.querySelector('[data-move="1"]').addEventListener('click', () => moveItem(index, 1));
    card.querySelector('[data-remove]').addEventListener('click', () => removeItem(index));
    return card;
  }));
}

// JPEG and PNG bytes go into the PDF untouched, so there is no quality loss and PNG keeps its
// transparency. A JPEG that needs EXIF rotation is redrawn through a canvas, which applies the
// rotation, and embedded as a high-quality JPEG.
async function pdfImageData(item) {
  const bytes = new Uint8Array(await item.file.arrayBuffer());
  if (item.file.type === 'image/png') return { data: bytes, format: 'PNG' };
  if (item.file.type === 'image/jpeg' && jpegOrientation(bytes) === 1) return { data: bytes, format: 'JPEG' };
  const img = await loadImage(item.url);
  const canvas = document.createElement('canvas');
  canvas.width = item.width;
  canvas.height = item.height;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
  return { data: new Uint8Array(await blob.arrayBuffer()), format: 'JPEG' };
}

function pageLayout(item) {
  const margin = Number(marginSelect.value);
  // Images are sized as if 96 dpi (1px = 0.75pt), the same scale browsers print at.
  const imageW = item.width * 0.75;
  const imageH = item.height * 0.75;
  if (pageSizeSelect.value === 'fit') {
    return { pageW: imageW + margin * 2, pageH: imageH + margin * 2, x: margin, y: margin, w: imageW, h: imageH };
  }
  let [pageW, pageH] = PAGE_SIZES[pageSizeSelect.value];
  const landscape = orientationSelect.value === 'auto' ? item.width > item.height : orientationSelect.value === 'landscape';
  if (landscape) [pageW, pageH] = [pageH, pageW];
  const boxW = pageW - margin * 2;
  const boxH = pageH - margin * 2;
  // Shrink to fit but never enlarge a small image past its natural size — upscaling only blurs it.
  const scale = Math.min(boxW / imageW, boxH / imageH, 1);
  const w = imageW * scale;
  const h = imageH * scale;
  return { pageW, pageH, x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

async function convertToPdf() {
  if (!state.items.length || state.converting) return;
  state.converting = true;
  processButton.disabled = true;
  clearResult();
  processingCard.classList.remove('is-hidden');

  try {
    let pdf;
    for (const [index, item] of state.items.entries()) {
      setProgress('Converting…', `Image ${index + 1} of ${state.items.length}`, index / state.items.length);
      const { data, format } = await pdfImageData(item);
      const { pageW, pageH, x, y, w, h } = pageLayout(item);
      const orientation = pageW > pageH ? 'l' : 'p';
      if (!pdf) pdf = new jspdf.jsPDF({ orientation, unit: 'pt', format: [pageW, pageH], compress: true });
      else pdf.addPage([pageW, pageH], orientation);
      pdf.addImage(data, format, x, y, w, h, undefined, 'FAST');
    }

    setProgress('Finishing…', 'Building PDF', 0.95);
    const blob = pdf.output('blob');
    state.resultUrl = URL.createObjectURL(blob);
    const baseName = state.items.length === 1 ? state.items[0].file.name.replace(/\.[^.]+$/, '') : 'images';
    downloadButton.href = state.resultUrl;
    downloadButton.download = baseName + '.pdf';
    resultMeta.textContent = `${formatSize(blob.size)} · ${state.items.length} page${state.items.length > 1 ? 's' : ''}`;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Converted successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while creating the PDF. Please try again.'), true);
    setProgress('Error', 'Conversion failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    state.converting = false;
    processButton.disabled = !state.items.length;
  }
}

function syncOrientation() {
  // Orientation has no meaning when each page takes its image's own size.
  orientationSelect.disabled = pageSizeSelect.value === 'fit';
}

imageInput.addEventListener('change', (event) => {
  addFiles(event.target.files);
  imageInput.value = ''; // so picking the same file again still fires change
});
addButton.addEventListener('click', () => imageInput.click());
processButton.addEventListener('click', convertToPdf);
for (const select of [pageSizeSelect, orientationSelect, marginSelect]) select.addEventListener('change', clearResult);
pageSizeSelect.addEventListener('change', syncOrientation);
syncOrientation();

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
