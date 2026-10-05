// Code Compare: a line diff of two texts with the exact changed words highlighted inside each
// changed line (removed in red, added in green), side-by-side or unified, unchanged stretches
// folded, next/previous change navigation, and the result as a standard .diff patch.
// The diff engine is vendored (/vendor/diff.min.js, global `Diff`).
const $ = (selector) => document.querySelector(selector);
const original = $('#originalInput');
const changed = $('#changedInput');
const result = $('#diffResult');
const summary = $('#diffSummary');
const position = $('#changePosition');
const toast = $('#toast');

const CONTEXT = 3;             // unchanged lines kept visible around each change
const WORD_DIFF_MAX = 3000;    // longer lines are marked as a whole instead of word by word
const DIFF_TIMEOUT_MS = 5000;  // stop instead of freezing on two huge, completely different files
const MAX_FILE_MB = 20;

let view = matchMedia('(max-width: 760px)').matches ? 'unified' : 'split';
let rows = [];               // the current comparison, see buildRows()
let folds = [];              // folded stretches of unchanged rows, by fold number
const openFolds = new Set(); // fold numbers the user expanded; folds are numbered the same each draw
let compareTimer;
let toastTimer;

const SAMPLE_ORIGINAL = `function calculateTotal(items) {
  let total = 0;
  for (let i = 0; i < items.length; i++) {
    total += items[i].price;
  }
  return total;
}

function formatPrice(value) {
  return "$" + value.toFixed(2);
}

module.exports = { calculateTotal, formatPrice };
`;
const SAMPLE_CHANGED = `function calculateTotal(items, taxRate = 0) {
  let total = 0;
  for (const item of items) {
    total += item.price * item.quantity;
  }
  return total * (1 + taxRate);
}

function formatPrice(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(value);
}

module.exports = { calculateTotal, formatPrice };
`;

function notify(text, isError = false) {
  clearTimeout(toastTimer);
  toast.textContent = text;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Lines as the diff engine counts them: Windows line endings unified, and a final newline added
// so "last line without a newline" never shows up as a change on its own.
function normalize(text) {
  const unified = text.replace(/\r\n?/g, '\n');
  return unified && !unified.endsWith('\n') ? unified + '\n' : unified;
}
const toLines = (text) => (text ? text.slice(0, -1).split('\n') : []);

function comparator() {
  const ignoreSpace = $('#ignoreSpace').checked;
  const ignoreCase = $('#ignoreCase').checked;
  if (!ignoreSpace && !ignoreCase) return undefined;
  // Like `git diff -b`: indentation, trailing spaces and the amount of spacing are ignored, but a
  // space added or removed inside a word ("@Customer InvoiceNumber") is still a change. Removing
  // all whitespace hid exactly those edits.
  const key = (line) => {
    let value = ignoreSpace ? line.trim().replace(/\s+/g, ' ') : line;
    if (ignoreCase) value = value.toLowerCase();
    return value;
  };
  return (left, right) => key(left) === key(right);
}

// Turns the engine's line chunks into display rows. A removed block directly followed by an added
// one is paired line by line ("change" rows, compared word by word); the rest are plain removals
// or additions. Each side's own text is used, so ignored whitespace/case still shows as typed.
function buildRows(a, b) {
  const parts = Diff.diffLines(a, b, { comparator: comparator(), timeout: DIFF_TIMEOUT_MS });
  if (!parts) return null;
  const oldLines = toLines(a);
  const newLines = toLines(b);
  let o = 0;
  let n = 0;
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part.added && !part.removed) {
      for (let k = 0; k < part.count; k++) out.push({ type: 'same', oldNo: o + 1, newNo: n + 1, oldText: oldLines[o++], newText: newLines[n++] });
      continue;
    }
    if (part.removed && parts[i + 1]?.added) {
      const removedCount = part.count;
      const addedCount = parts[++i].count;
      for (let k = 0; k < Math.max(removedCount, addedCount); k++) {
        if (k < removedCount && k < addedCount) out.push({ type: 'change', oldNo: o + 1, newNo: n + 1, oldText: oldLines[o++], newText: newLines[n++] });
        else if (k < removedCount) out.push({ type: 'del', oldNo: o + 1, oldText: oldLines[o++] });
        else out.push({ type: 'add', newNo: n + 1, newText: newLines[n++] });
      }
      continue;
    }
    for (let k = 0; k < part.count; k++) {
      out.push(part.removed ? { type: 'del', oldNo: o + 1, oldText: oldLines[o++] } : { type: 'add', newNo: n + 1, newText: newLines[n++] });
    }
  }
  return out;
}

// Word-level highlight of one changed line pair: [oldHtml, newHtml].
function wordDiff(oldText, newText) {
  if (oldText.length + newText.length > WORD_DIFF_MAX) return [escapeHtml(oldText), escapeHtml(newText)];
  let oldHtml = '';
  let newHtml = '';
  // With whitespace ignored, spacing-only differences inside a changed line are not marked either.
  const ignoreSpace = $('#ignoreSpace').checked;
  const diffWords = ignoreSpace ? Diff.diffWords : Diff.diffWordsWithSpace;
  for (const part of diffWords(ignoreSpace ? oldText.trimEnd() : oldText, ignoreSpace ? newText.trimEnd() : newText, { ignoreCase: $('#ignoreCase').checked })) {
    const text = escapeHtml(part.value);
    if (part.removed) oldHtml += `<del>${text}</del>`;
    else if (part.added) newHtml += `<ins>${text}</ins>`;
    else { oldHtml += text; newHtml += text; }
  }
  return [oldHtml, newHtml];
}

// Unchanged stretches longer than the context on both sides fold into one "show lines" row.
function foldRows(list) {
  const out = [];
  folds = [];
  let i = 0;
  while (i < list.length) {
    if (list[i].type !== 'same') { out.push(list[i++]); continue; }
    let end = i;
    while (end < list.length && list[end].type === 'same') end++;
    const keepBefore = i === 0 ? 0 : CONTEXT;
    const keepAfter = end === list.length ? 0 : CONTEXT;
    if (end - i > keepBefore + keepAfter + 1) {
      out.push(...list.slice(i, i + keepBefore));
      folds.push(list.slice(i + keepBefore, end - keepAfter));
      out.push({ type: 'fold', fold: folds.length - 1 });
      out.push(...list.slice(end - keepAfter, end));
    } else {
      out.push(...list.slice(i, end));
    }
    i = end;
  }
  return out;
}

const lineNo = (value) => `<span class="ln">${value ?? ''}</span>`;
const code = (cls, html) => `<span class="code ${cls}">${html || ' '}</span>`;

function rowHtml(row, first) {
  const hunk = first ? ' hunk' : '';
  if (row.type === 'fold') {
    const count = folds[row.fold].length;
    return `<button type="button" class="fold" data-fold="${row.fold}">⋯ Show ${count.toLocaleString()} unchanged line${count === 1 ? '' : 's'}</button>`;
  }
  if (row.type === 'same') {
    const text = escapeHtml(row.newText);
    return view === 'split'
      ? `<div class="d-row">${lineNo(row.oldNo)}${code('', escapeHtml(row.oldText))}${lineNo(row.newNo)}${code('', text)}</div>`
      : `<div class="d-row">${lineNo(row.oldNo)}${lineNo(row.newNo)}${code('', ' ' + text)}</div>`;
  }
  const [oldHtml, newHtml] = row.type === 'change' ? wordDiff(row.oldText, row.newText)
    : [row.oldText !== undefined ? escapeHtml(row.oldText) : '', row.newText !== undefined ? escapeHtml(row.newText) : ''];
  if (view === 'split') {
    const left = row.type === 'add' ? lineNo('') + code('empty', '') : lineNo(row.oldNo) + code('del', oldHtml);
    const right = row.type === 'del' ? lineNo('') + code('empty', '') : lineNo(row.newNo) + code('add', newHtml);
    return `<div class="d-row${hunk}">${left}${right}</div>`;
  }
  let html = '';
  if (row.type !== 'add') html += `<div class="d-row${hunk}">${lineNo(row.oldNo)}${lineNo('')}${code('del', '−' + oldHtml)}</div>`;
  if (row.type !== 'del') html += `<div class="d-row${row.type === 'add' ? hunk : ''}">${lineNo('')}${lineNo(row.newNo)}${code('add', '+' + newHtml)}</div>`;
  return html;
}

function draw() {
  const list = [];
  for (const row of foldRows(rows)) {
    if (row.type === 'fold' && openFolds.has(row.fold)) list.push(...folds[row.fold]);
    else list.push(row);
  }
  let html = '';
  let previous = 'same';
  for (const row of list) {
    const isChange = row.type === 'change' || row.type === 'del' || row.type === 'add';
    html += rowHtml(row, isChange && (previous === 'same' || previous === 'fold'));
    previous = row.type;
  }
  result.className = 'diff ' + view;
  result.innerHTML = html;
  updatePosition();
}

function compare() {
  clearTimeout(compareTimer);
  openFolds.clear();
  const a = normalize(original.value);
  const b = normalize(changed.value);
  $('#originalStats').textContent = stats(original.value);
  $('#changedStats').textContent = stats(changed.value);
  if (!a && !b) {
    rows = [];
    summary.textContent = '';
    result.className = 'diff';
    result.innerHTML = '<p class="fmt-empty">Paste or open two versions above to see what changed.</p>';
    updatePosition();
    return;
  }
  const built = buildRows(a, b);
  if (!built) {
    rows = [];
    summary.textContent = '';
    result.innerHTML = '<p class="fmt-empty">These two files are too different to compare quickly. Try comparing smaller parts.</p>';
    updatePosition();
    return;
  }
  rows = built;
  const removed = rows.filter((row) => row.type === 'del' || row.type === 'change').length;
  const added = rows.filter((row) => row.type === 'add' || row.type === 'change').length;
  if (!removed && !added) {
    summary.innerHTML = '<span class="same-badge">Identical</span>';
    result.className = 'diff';
    result.innerHTML = `<p class="fmt-empty">No differences${$('#ignoreSpace').checked || $('#ignoreCase').checked ? ' (with the ignore options you chose)' : ''}. The two versions match.</p>`;
    updatePosition();
    return;
  }
  summary.innerHTML = `<span class="stat-del">−${removed.toLocaleString()}</span> <span class="stat-add">+${added.toLocaleString()}</span> lines`;
  draw();
}

function stats(text) {
  if (!text) return '';
  const lines = text.split('\n').length;
  return `${lines.toLocaleString()} line${lines === 1 ? '' : 's'}`;
}

function scheduleCompare() {
  clearTimeout(compareTimer);
  const size = original.value.length + changed.value.length;
  compareTimer = setTimeout(compare, Math.min(1500, 250 + size / 4000));
}

// ---- Change navigation ----------------------------------------------------------------------
const hunks = () => [...result.querySelectorAll('.hunk')];

function updatePosition() {
  const list = hunks();
  $('#prevChange').disabled = $('#nextChange').disabled = !list.length;
  if (!list.length) { position.textContent = ''; return; }
  position.textContent = `${list.length.toLocaleString()} change${list.length === 1 ? '' : 's'}`;
}

function jump(step) {
  const list = hunks();
  if (!list.length) return;
  const top = result.scrollTop;
  const target = step > 0
    ? list.find((el) => el.offsetTop > top + 8) ?? list[0]
    : [...list].reverse().find((el) => el.offsetTop < top - 8) ?? list[list.length - 1];
  result.scrollTo({ top: Math.max(0, target.offsetTop - 40), behavior: 'smooth' });
  target.classList.remove('flash');
  void target.offsetWidth;
  target.classList.add('flash');
  position.textContent = `Change ${list.indexOf(target) + 1} of ${list.length.toLocaleString()}`;
}

// ---- Inputs ---------------------------------------------------------------------------------
async function loadFile(file, target) {
  if (!file) return;
  if (file.size > MAX_FILE_MB * 1024 * 1024) { notify(`This file is larger than ${MAX_FILE_MB} MB. Please choose a smaller file.`, true); return; }
  try {
    target.value = await file.text();
    target.dataset.name = file.name;
    compare();
  } catch (error) {
    console.error(error);
    notify('This file could not be read.', true);
  }
}

for (const [input, button, picker] of [[original, '#openOriginal', '#originalFile'], [changed, '#openChanged', '#changedFile']]) {
  $(button).addEventListener('click', () => $(picker).click());
  $(picker).addEventListener('change', (event) => { loadFile(event.target.files[0], input); event.target.value = ''; });
  input.addEventListener('input', scheduleCompare);
  input.addEventListener('dragover', (event) => { event.preventDefault(); input.classList.add('is-dragging'); });
  input.addEventListener('dragleave', () => input.classList.remove('is-dragging'));
  input.addEventListener('drop', (event) => {
    if (!event.dataTransfer.files.length) return; // dropped text is inserted by the browser as usual
    event.preventDefault();
    input.classList.remove('is-dragging');
    loadFile(event.dataTransfer.files[0], input);
  });
}

$('#compareBtn').addEventListener('click', compare);
$('#swapBtn').addEventListener('click', () => {
  [original.value, changed.value] = [changed.value, original.value];
  [original.dataset.name, changed.dataset.name] = [changed.dataset.name || '', original.dataset.name || ''];
  compare();
});
$('#sampleBtn').addEventListener('click', () => { original.value = SAMPLE_ORIGINAL; changed.value = SAMPLE_CHANGED; compare(); });
$('#clearBtn').addEventListener('click', () => { original.value = ''; changed.value = ''; original.dataset.name = changed.dataset.name = ''; compare(); });
for (const box of ['#ignoreSpace', '#ignoreCase']) $(box).addEventListener('change', compare);
for (const button of document.querySelectorAll('[data-view]')) {
  button.setAttribute('aria-pressed', String(button.dataset.view === view));
  button.addEventListener('click', () => {
    view = button.dataset.view;
    for (const other of document.querySelectorAll('[data-view]')) other.setAttribute('aria-pressed', String(other === button));
    if (rows.some((row) => row.type !== 'same')) draw();
  });
}
$('#prevChange').addEventListener('click', () => jump(-1));
$('#nextChange').addEventListener('click', () => jump(1));
result.addEventListener('click', (event) => {
  const button = event.target.closest('.fold');
  if (!button) return;
  openFolds.add(Number(button.dataset.fold));
  const scroll = result.scrollTop;
  draw();
  result.scrollTop = scroll;
});

function patchText() {
  const a = normalize(original.value);
  const b = normalize(changed.value);
  return Diff.createTwoFilesPatch(original.dataset.name || 'original', changed.dataset.name || 'changed', a, b, undefined, undefined, { context: CONTEXT });
}
$('#copyPatch').addEventListener('click', async () => {
  if (!original.value && !changed.value) { notify('There is nothing to compare yet.', true); return; }
  try { await navigator.clipboard.writeText(patchText()); notify('Patch copied to clipboard.'); }
  catch { notify('Copying is blocked in this browser. Use Download instead.', true); }
});
$('#downloadPatch').addEventListener('click', () => {
  if (!original.value && !changed.value) { notify('There is nothing to compare yet.', true); return; }
  const url = URL.createObjectURL(new Blob([patchText()], { type: 'text/x-diff' }));
  Object.assign(document.createElement('a'), { href: url, download: 'changes.diff' }).click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});
compare();
