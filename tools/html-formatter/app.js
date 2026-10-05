// HTML Formatter & Viewer: a live preview in a sandboxed frame (scripts run, but the frame has an
// opaque origin, so it cannot touch this site), plus format (including inline CSS/JS) and minify.
const frame = document.querySelector('#preview');
const stage = document.querySelector('#stage');
const status = document.querySelector('#status');
const autoRun = document.querySelector('#autoRun');
const editToggle = document.querySelector('#editToggle');
let editing = false;     // the preview is editable and writes back into the HTML
let fromPreview = false; // the editor text was just rewritten from a preview edit

const SAMPLE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>My page</title>
<style>
body{font-family:system-ui,sans-serif;margin:0;padding:32px;background:#f5f7ff;color:#1b1f2a}
.card{max-width:420px;margin:auto;padding:24px;border-radius:14px;background:#fff;box-shadow:0 8px 30px rgba(46,99,255,.12)}
h1{margin:0 0 8px;font-size:24px} button{padding:10px 16px;border:0;border-radius:9px;background:#2e63ff;color:#fff;font-weight:600;cursor:pointer}
</style>
</head>
<body>
<div class="card"><h1>Hello from MediaPilot</h1><p>Edit this HTML on the left and watch the preview update.</p><button id="hi">Click me</button><p id="out"></p></div>
<script>
document.getElementById('hi').addEventListener('click',function(){document.getElementById('out').textContent='It works! '+new Date().toLocaleTimeString();});
</script>
</body>
</html>`;

const editor = FormatterKit.bind({ extension: 'html', mime: 'text/html', sample: SAMPLE, onChange: update });

// Text with no tags at all (an email, notes) is shown the way it reads: its line breaks kept and
// web addresses clickable. A browser would run it together into one line with plain-text links.
const looksLikeHtml = (text) => /<\/?[a-z][^>]*>|<!--|<!doctype/i.test(text);
const LINKS = /\bhttps?:\/\/[^\s<>"']*[^\s<>"'.,;:!?)\]]|\bwww\.[^\s<>"']*[^\s<>"'.,;:!?)\]]|[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function linkify(text) {
  let html = '';
  let last = 0;
  for (const match of text.matchAll(LINKS)) {
    const link = match[0];
    const href = link.includes('@') && !/^https?:|^www\./i.test(link) ? 'mailto:' + link : /^www\./i.test(link) ? 'https://' + link : link;
    html += escapeHtml(text.slice(last, match.index)) + `<a href="${escapeHtml(href)}">${escapeHtml(link)}</a>`;
    last = match.index + link.length;
  }
  return html + escapeHtml(text.slice(last));
}

// HTML that was escaped once or more (&lt;p&gt;, &amp;lt;p&amp;gt;) shows its tags as text. Each
// round reads the text a browser would display, which undoes one level of escaping, and keeps
// going while that text still contains tags or escaped tags.
const TAG_IN_TEXT = /<\/?[a-z][a-z0-9-]*(?:\s[^<>]*)?\/?>/i;
const ESCAPED_TAG = /&(?:amp;)*lt;\/?[a-z][a-z0-9-]*[\s\S]*?&(?:amp;)*gt;/i;
const shownText = (html) => new DOMParser().parseFromString(html, 'text/html').documentElement.textContent;
const hasEscapedTags = (text) => ESCAPED_TAG.test(text) || TAG_IN_TEXT.test(shownText(text));

function decodeEscaped(text) {
  let html = text;
  for (let round = 0; round < 5; round++) {
    const shown = shownText(html);
    if (!TAG_IN_TEXT.test(shown) && !ESCAPED_TAG.test(shown)) break;
    html = shown;
  }
  return html;
}

// Blank lines start a new paragraph; single line breaks stay as line breaks.
function textToHtml(text) {
  return text.trim().split(/\n[ \t]*\n+/)
    .map((paragraph) => `<p>${linkify(paragraph.trim()).replace(/\n/g, '<br>\n')}</p>`)
    .join('\n');
}

// Text with no real tags but escaped ones is escaped HTML, decoded without asking. Real HTML that
// also shows escaped tags could be a page about HTML, so there it waits for the Decode button.
const kindOf = (text) => (!text.trim() ? 'empty'
  : looksLikeHtml(text) ? (hasEscapedTags(text) ? 'html-with-escaped' : 'html')
    : ESCAPED_TAG.test(text) ? 'escaped' : 'text');

function update(text) {
  if (fromPreview) {
    // The preview already shows this (it was typed there); reloading it would lose the cursor.
    fromPreview = false;
    status.textContent = 'Editing: the HTML on the left updates as you type in the preview.';
    return;
  }
  if (editing && kindOf(text) !== 'html' && kindOf(text) !== 'html-with-escaped' && text.trim()) setEditing(false);
  status.textContent = editing ? 'Editing: click into the preview and type. Scripts are paused while editing.' : {
    empty: 'Waiting for HTML',
    html: 'Preview is up to date',
    'html-with-escaped': 'Some tags are escaped (like &lt;p&gt;), so they show as text. Press Decode to turn them into real HTML.',
    escaped: 'Escaped HTML: shown decoded. Press Format or Decode to turn it into real HTML.',
    text: 'Plain text: shown with its line breaks and links. Press Format to turn it into HTML.',
  }[kindOf(text)];
  if (autoRun.checked) run();
}

// Links in the preview open in a new tab rather than replacing the preview itself.
function withNewTabLinks(html) {
  if (/<base\b/i.test(html)) return html;
  const base = '<base data-mp target="_blank">';
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + base + html.slice(head.index + head[0].length);
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  return doctype ? doctype[0] + base + html.slice(doctype[0].length) : base + html;
}

function run() {
  const text = editor.input.value;
  const kind = kindOf(text);
  if (editing) { frame.srcdoc = editableDocument(text); return; }
  frame.srcdoc = withNewTabLinks(kind === 'escaped' ? decodeEscaped(text)
    : kind === 'text' ? `<!doctype html><meta charset="utf-8"><style>body{margin:16px;font:15px/1.6 system-ui,sans-serif;color:#1b1f2a}a{color:#2e63ff}</style>${textToHtml(text)}`
      : text);
}

// ---- Editing in the preview -------------------------------------------------------------------
// The preview frame is sealed off (no access to this page), so a small helper script inside it
// makes the page editable and posts the edited HTML back. The page's own scripts are switched off
// while editing: otherwise anything they draw would be saved into the source as if typed.
function disableScripts(html) {
  return html.replace(/<script\b([^>]*)>/gi, (tag, attrs) => {
    const type = /\stype\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(attrs);
    const original = type ? (type[2] ?? type[3] ?? type[4]) : '';
    const rest = type ? attrs.replace(type[0], '') : attrs;
    // The parser keeps the first type attribute, so this one wins; the original is restored on save.
    return `<script type="text/x-mp-paused" data-mp-type="${escapeHtml(original)}"${rest}>`;
  });
}

function editableDocument(source) {
  // Whole documents are saved whole; fragments (no <html>/<body>) are saved as fragments again.
  const options = JSON.stringify({ full: /<(html|body)[\s>]/i.test(source), doctype: (/^\s*<!doctype[^>]*>/i.exec(source) || [''])[0].trim() });
  const helper = `<script data-mp>(${previewHelper})(${options})<\/script>`;
  return withNewTabLinks(disableScripts(source)) + helper;
}

// Runs inside the preview frame (stringified above), so it may use only its own variables.
function previewHelper(options) {
  const body = document.body;
  const hadEditable = body.hasAttribute('contenteditable');
  body.contentEditable = 'true';
  body.focus();
  const serialize = () => {
    const root = document.documentElement.cloneNode(true);
    for (const el of root.querySelectorAll('[data-mp]')) el.remove();
    const clonedBody = root.querySelector('body');
    if (!hadEditable) clonedBody.removeAttribute('contenteditable');
    for (const script of root.querySelectorAll('script[data-mp-type]')) {
      const type = script.getAttribute('data-mp-type');
      script.removeAttribute('data-mp-type');
      if (type) script.setAttribute('type', type); else script.removeAttribute('type');
    }
    if (options.full) return (options.doctype ? options.doctype + '\n' : '') + root.outerHTML;
    const node = (n) => (n.nodeType === 1 ? n.outerHTML : n.nodeType === 8 ? '<!--' + n.data + '-->' : n.textContent);
    return [...root.querySelector('head').childNodes].map(node).join('') + clonedBody.innerHTML;
  };
  let timer;
  const send = () => { clearTimeout(timer); timer = setTimeout(() => parent.postMessage({ mpEdit: serialize() }, '*'), 250); };
  document.addEventListener('input', send);
  // Links would navigate away while editing; let clicks place the cursor instead.
  document.addEventListener('click', (event) => { if (event.target.closest('a')) event.preventDefault(); }, true);
}

window.addEventListener('message', (event) => {
  if (!editing || event.source !== frame.contentWindow || typeof event.data?.mpEdit !== 'string') return;
  fromPreview = true;
  editor.setText(event.data.mpEdit, { keepFocus: true });
});

function setEditing(on) {
  const kind = kindOf(editor.input.value);
  if (on && kind !== 'html' && kind !== 'html-with-escaped') {
    editor.notify(kind === 'empty' ? 'Paste or open some HTML first.' : 'Press Format first to turn this into HTML, then edit it in the preview.', true);
    return;
  }
  editing = on;
  editToggle.setAttribute('aria-pressed', String(on));
  editToggle.textContent = on ? '✓ Done editing' : '✎ Edit in preview';
  stage.classList.toggle('is-editing', on);
  status.textContent = on ? 'Editing: click into the preview and type. Scripts are paused while editing.' : 'Preview is up to date';
  run();
}
editToggle.addEventListener('click', () => setEditing(!editing));

function beautifyOptions() {
  const unit = editor.indent();
  return {
    indent_size: unit === '\t' ? 1 : unit.length,
    indent_char: unit === '\t' ? '\t' : ' ',
    indent_with_tabs: unit === '\t',
    indent_inner_html: true,
    preserve_newlines: true,
    max_preserve_newlines: 2,
    wrap_line_length: 0,
    end_with_newline: true,
    extra_liners: [],
  };
}

// Removes comments and the whitespace between tags; pre, textarea, script and style keep their
// content exactly, since whitespace there is meaningful.
function minify(source) {
  const kept = [];
  const masked = source.replace(/<(pre|textarea|script|style)\b[\s\S]*?<\/\1\s*>/gi, (block) => `\u0000${kept.push(block) - 1}\u0000`);
  const compact = masked
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/>\s+</g, '><')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return compact.replace(/\u0000(\d+)\u0000/g, (_, index) => kept[Number(index)]);
}

function format() {
  const text = editor.input.value;
  if (!text.trim()) { editor.notify('Paste or open some HTML first.', true); return; }
  try {
    // Escaped HTML is decoded and plain text turned into HTML (paragraphs, line breaks, links)
    // before indenting. Escaping it again instead is what produced &amp;lt;p&amp;gt;.
    const kind = kindOf(text);
    const html = kind === 'escaped' ? decodeEscaped(text) : kind === 'text' ? textToHtml(text) : text;
    editor.setText(window.beautifier.html(html, beautifyOptions()));
    if (kind === 'escaped') editor.notify('The escaped tags were turned back into real HTML.');
    else if (kind === 'text') editor.notify('Your text was turned into HTML, with its links made clickable.');
  } catch (error) {
    console.error(error);
    editor.notify('This HTML could not be formatted.', true);
  }
}
document.querySelector('#formatBtn').addEventListener('click', format);
document.querySelector('#decodeBtn').addEventListener('click', () => {
  const text = editor.input.value;
  if (!text.trim()) { editor.notify('Paste or open some HTML first.', true); return; }
  const decoded = decodeEscaped(text);
  if (decoded === text) { editor.notify('There are no escaped tags to decode.'); return; }
  editor.setText(window.beautifier.html(decoded, beautifyOptions()));
  editor.notify('The escaped tags were turned back into real HTML.');
});
document.querySelector('#formatBtnPane').addEventListener('click', format);
document.querySelector('#minifyBtn').addEventListener('click', () => {
  if (!editor.input.value.trim()) { editor.notify('Paste or open some HTML first.', true); return; }
  editor.setText(minify(editor.input.value));
});
document.querySelector('#runBtn').addEventListener('click', run);
autoRun.addEventListener('change', () => autoRun.checked && run());
for (const button of document.querySelectorAll('[data-width]')) {
  button.addEventListener('click', () => {
    const width = button.dataset.width;
    frame.style.width = width ? width + 'px' : '100%';
    stage.classList.toggle('is-narrow', Boolean(width));
    for (const other of document.querySelectorAll('[data-width]')) other.setAttribute('aria-pressed', String(other === button));
  });
}
