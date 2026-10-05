// JSON Formatter: validates as you type, shows the data as a grid of tables (objects as key/value
// rows, lists of objects as one row per item) or as highlighted formatted text, and formats or
// minifies the editor contents. Nested parts render only when opened, and long lists 200 rows at
// a time, so multi-megabyte files stay responsive.
const ROWS_PER_CHUNK = 200;
const viewer = document.querySelector('#viewer');
const status = document.querySelector('#status');
let view = 'grid';
let parsed; // { ok, value } | { ok: false } | undefined when empty
let smallDoc = true; // small documents open their first few levels automatically
// A Format/Minify result too long for the editor to show without freezing (browsers lay out
// every line of a textarea up front: ~13 s for 240,000 lines). It is shown in the Formatted view
// instead, and Copy/Download save it.
let bigOutput = null;
const EDITOR_MAX_LINES = 25000;
const EDITOR_MAX_CHARS = 3_000_000;

const SAMPLE = JSON.stringify({
  site: 'MediaPilot',
  private: true,
  version: 2.1,
  categories: ['Video', 'Image', 'PDF', 'Formatters'],
  tools: [
    { id: 'json-formatter', name: 'JSON Formatter', popular: true, tags: ['json', 'grid'] },
    { id: 'compress-video', name: 'Compress Video', popular: true, tags: ['video'] },
    { id: 'merge-pdf', name: 'Merge PDF', popular: false, tags: null },
  ],
  owner: { name: 'Media team', contact: { email: 'hello@example.com', country: 'IN' } },
}, null, 2);

const editor = FormatterKit.bind({ extension: 'json', mime: 'application/json', sample: SAMPLE, onChange: update, output: () => bigOutput });

function setStatus(text, kind) {
  status.textContent = text;
  status.className = 'fmt-status' + (kind ? ' is-' + kind : '');
}

// Index of the first syntax error in text, or -1. Engines word errors differently and recent
// Chrome gives no position at all, so the location is found here and the engine's wording kept.
function errorIndex(t) {
  let i = 0;
  const ws = () => { while (i < t.length && ' \t\n\r'.includes(t[i])) i++; };
  const fail = () => { throw i; };
  const string = () => {
    i++;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') { i++; return; }
      if (c === '\\') { i += t[i + 1] === 'u' ? 6 : 2; continue; }
      if (c < ' ') fail();
      i++;
    }
    fail();
  };
  const value = () => {
    ws();
    const c = t[i];
    if (c === '{' || c === '[') {
      const close = c === '{' ? '}' : ']';
      i++; ws();
      if (t[i] === close) { i++; return; }
      for (;;) {
        if (c === '{') {
          ws();
          if (t[i] !== '"') fail();
          string(); ws();
          if (t[i] !== ':') fail();
          i++;
        }
        value(); ws();
        if (t[i] === ',') { i++; continue; }
        if (t[i] === close) { i++; return; }
        fail();
      }
    }
    if (c === '"') return string();
    const m = /^(?:-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)/.exec(t.slice(i, i + 400));
    if (!m) fail();
    i += m[0].length;
  };
  try {
    value(); ws();
    if (i < t.length) fail();
    return -1;
  } catch (error) {
    if (typeof error === 'number') return error;
    return -1; // nesting too deep to scan; the message alone will have to do
  }
}

function describeError(error, text) {
  // Keep the engine's description, minus the copy of the input and the position it may append.
  const message = String(error.message || error)
    .replace(/^JSON\.parse: /, '')
    .replace(/,\s*(?:\.\.\.)?".*$/s, '')
    .replace(/ in JSON at position \d+.*$/s, '')
    .replace(/ at line \d+ column \d+.*$/s, '')
    .replace(/ is not valid JSON$/, '');
  const at = Math.min(errorIndex(text), text.length);
  if (at < 0) return { text: message };
  const before = text.slice(0, at);
  const line = before.split('\n').length;
  const column = at - before.lastIndexOf('\n');
  const what = at >= text.length ? 'The JSON ends too early' : message;
  return { text: `Line ${line}, column ${column}: ${what}`, line, column };
}

function update(text) {
  bigOutput = null; // the editor changed, so an earlier large result no longer matches it
  if (!text.trim()) {
    parsed = undefined;
    setStatus('Waiting for JSON');
    viewer.innerHTML = '<p class="fmt-empty">Your JSON appears here as a grid.</p>';
    return;
  }
  smallDoc = text.length < 60000;
  try {
    parsed = { ok: true, value: JSON.parse(text) };
    setStatus('✓ Valid JSON', 'ok');
  } catch (error) {
    parsed = { ok: false };
    const problem = describeError(error, text);
    setStatus('✕ ' + problem.text, 'error');
    viewer.innerHTML = '<p class="fmt-empty">Fix the error shown under the editor to see your JSON here.</p>';
    return;
  }
  render();
}

function render() {
  if (!parsed?.ok) return;
  viewer.onscroll = null;
  viewer.replaceChildren(view === 'grid' ? grid(parsed.value) : code(bigOutput ?? JSON.stringify(parsed.value, null, editor.indent())));
}

function showView(name) {
  view = name;
  for (const button of document.querySelectorAll('[data-view]')) button.setAttribute('aria-pressed', String(button.dataset.view === name));
  render();
}

// ---- Grid view -----------------------------------------------------------------------------
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function scalar(value) {
  const span = document.createElement('span');
  if (value === null) { span.className = 'tok-null'; span.textContent = 'null'; }
  else if (typeof value === 'string') { span.className = 'tok-str'; span.textContent = value === '' ? '""' : value; }
  else if (typeof value === 'number') { span.className = 'tok-num'; span.textContent = String(value); }
  else { span.className = 'tok-bool'; span.textContent = String(value); }
  return span;
}

function cell(value, depth) {
  return value !== null && typeof value === 'object' ? nested(value, depth) : scalar(value);
}

// A {…} / […] toggle whose table is built the first time it opens. Small documents open the first
// few levels straight away; big ones start closed.
function nested(value, depth) {
  const wrap = document.createElement('div');
  const button = document.createElement('button');
  const count = Array.isArray(value) ? value.length : Object.keys(value).length;
  button.type = 'button';
  button.className = 'jg-toggle';
  button.textContent = Array.isArray(value) ? `[${count}]` : `{${count}}`;
  button.title = Array.isArray(value) ? `List of ${count}` : `Object with ${count} field${count === 1 ? '' : 's'}`;
  button.setAttribute('aria-expanded', 'false');
  let body = null;
  button.addEventListener('click', () => {
    const open = button.getAttribute('aria-expanded') !== 'true';
    if (open && !body) wrap.append(body = table(value, depth + 1));
    if (body) body.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
  });
  wrap.append(button);
  if (count && (depth === 0 || (smallDoc && depth < 3))) button.click();
  return wrap;
}

function table(value, depth) {
  const box = document.createElement('div');
  const entries = Array.isArray(value) ? value : Object.entries(value);
  if (!entries.length) {
    box.append(Object.assign(document.createElement('span'), { className: 'tok-null', textContent: Array.isArray(value) ? 'empty list' : 'empty object' }));
    return box;
  }
  const tableEl = document.createElement('table');
  const tbody = document.createElement('tbody');
  let rowOf;
  // A list where every item is an object reads best as a table: one column per field.
  if (Array.isArray(value) && value.every(isObject)) {
    const columns = [...new Set(value.flatMap((item) => Object.keys(item)))];
    const head = tableEl.createTHead().insertRow();
    head.append(Object.assign(document.createElement('th'), { textContent: '#' }));
    for (const column of columns) head.append(Object.assign(document.createElement('th'), { textContent: column }));
    rowOf = (item, index) => {
      const row = document.createElement('tr');
      row.append(Object.assign(document.createElement('td'), { className: 'idx', textContent: index }));
      for (const column of columns) {
        const td = document.createElement('td');
        if (column in item) td.append(cell(item[column], depth));
        row.append(td);
      }
      return row;
    };
  } else {
    rowOf = (entry, index) => {
      const row = document.createElement('tr');
      const [key, item] = Array.isArray(value) ? [index, entry] : entry;
      row.append(Object.assign(document.createElement(Array.isArray(value) ? 'td' : 'th'), { className: Array.isArray(value) ? 'idx' : '', textContent: key }));
      const td = document.createElement('td');
      td.append(cell(item, depth));
      row.append(td);
      return row;
    };
  }
  tableEl.append(tbody);
  box.append(tableEl);
  let shown = 0;
  const more = Object.assign(document.createElement('button'), { type: 'button', className: 'fmt-btn jg-more' });
  const showMore = () => {
    const end = Math.min(entries.length, shown + ROWS_PER_CHUNK);
    const rows = document.createDocumentFragment();
    for (; shown < end; shown++) rows.append(rowOf(entries[shown], shown));
    tbody.append(rows);
    const left = entries.length - shown;
    more.textContent = `Show ${Math.min(left, ROWS_PER_CHUNK).toLocaleString()} more of ${left.toLocaleString()} remaining`;
    more.hidden = left <= 0;
  };
  more.addEventListener('click', showMore);
  showMore();
  box.append(more);
  return box;
}

function grid(value) {
  const root = document.createElement('div');
  root.className = 'jg';
  root.append(value !== null && typeof value === 'object' ? table(value, 0) : scalar(value));
  return root;
}

// ---- Formatted view ------------------------------------------------------------------------
// Only the lines in view are drawn, so even hundreds of thousands of lines scroll smoothly.
const LINE_HEIGHT = 20;
const TOKENS = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;
const escapeHtml = (text) => text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function highlight(text) {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(TOKENS)) {
    html += escapeHtml(text.slice(last, match.index));
    const [token, string, colon, bool] = match;
    const kind = string ? (colon ? 'key' : 'str') : bool ? 'bool' : token === 'null' ? 'null' : 'num';
    html += `<span class="tok-${kind}">${escapeHtml(string || token)}</span>${colon ? escapeHtml(colon) : ''}`;
    last = match.index + token.length;
  }
  return html + escapeHtml(text.slice(last));
}

function code(text) {
  const lines = text.split('\n');
  const spacer = document.createElement('div');
  spacer.className = 'code-spacer';
  spacer.style.height = lines.length * LINE_HEIGHT + 24 + 'px';
  const pre = document.createElement('pre');
  pre.className = 'code-lines';
  spacer.append(pre);
  let drawn = '';
  const draw = () => {
    const first = Math.max(0, Math.floor(viewer.scrollTop / LINE_HEIGHT) - 40);
    const last = Math.min(lines.length, first + Math.ceil(viewer.clientHeight / LINE_HEIGHT) + 80);
    if (drawn === `${first}:${last}`) return;
    drawn = `${first}:${last}`;
    pre.style.transform = `translateY(${first * LINE_HEIGHT}px)`;
    // A single line can be megabytes long (minified JSON); colour only lines of sane length.
    pre.innerHTML = lines.slice(first, last).map((line) => (line.length > 20000 ? escapeHtml(line) : highlight(line))).join('\n');
  };
  let frame = 0;
  viewer.onscroll = () => { if (!frame) frame = requestAnimationFrame(() => { frame = 0; draw(); }); };
  requestAnimationFrame(draw);
  return spacer;
}

// ---- Toolbar -------------------------------------------------------------------------------
function rewrite(spacing) {
  const source = editor.input.value;
  if (!source.trim()) { editor.notify('Paste or open some JSON first.', true); return; }
  let result;
  try {
    result = JSON.stringify(JSON.parse(source), null, spacing);
  } catch (error) {
    const problem = describeError(error, source);
    editor.notify('This JSON has an error. ' + problem.text, true);
    if (problem.line) {
      // Put the cursor on the problem so it is easy to find.
      const offset = source.split('\n').slice(0, problem.line - 1).reduce((sum, line) => sum + line.length + 1, 0) + problem.column - 1;
      editor.input.focus();
      editor.input.setSelectionRange(offset, offset + 1);
    }
    return;
  }
  let lineCount = 1;
  for (let i = result.indexOf('\n'); i !== -1 && lineCount <= EDITOR_MAX_LINES; i = result.indexOf('\n', i + 1)) lineCount++;
  if (lineCount <= EDITOR_MAX_LINES && result.length <= EDITOR_MAX_CHARS) {
    editor.setText(result);
    return;
  }
  bigOutput = result;
  showView('code');
  editor.notify('This JSON is very large, so the result is shown on the right instead of in the editor. Copy and Download save the result.');
}

document.querySelector('#formatBtn').addEventListener('click', () => rewrite(editor.indent()));
document.querySelector('#minifyBtn').addEventListener('click', () => rewrite(0));
document.querySelector('#indentSelect').addEventListener('change', () => view === 'code' && !bigOutput && render());
for (const button of document.querySelectorAll('[data-view]')) {
  button.addEventListener('click', () => showView(button.dataset.view));
}
