const state = {
  file: null,
  workbook: null,
  theme: null,
  resultUrl: null,
  converting: false,
};

const $ = (selector) => document.querySelector(selector);

const fileInput = $('#fileInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const previewStatus = $('#previewStatus');
const sheetList = $('#sheetList');
const pageSizeSelect = $('#pageSize');
const orientationSelect = $('#orientation');
const gridlinesInput = $('#gridlines');
const scalingSelect = $('#scaling');
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

// Page sizes in CSS px (96 dpi); the PDF gets px * 0.75 points.
const PAPER = { a4: [794, 1123], letter: [816, 1056] };
// Excel's own default page margins, in inches, when the sheet does not set any.
const DEFAULT_MARGINS = { left: 0.7, right: 0.7, top: 0.75, bottom: 0.75 };
// Auto scaling never shrinks below this (11pt text → ~6.5pt); wider sheets continue on more pages.
const MIN_READABLE_SCALE = 0.6;
// The workbook (ExcelJS, ~50x the file size) and the finished PDF are both held in memory. Measured:
// a 10 MB workbook → 2,185 pages in 31s with a ~2 GB memory peak; 2.6 MB → 575 pages, ~0.5 GB.
// Fine on a desktop (Chrome allows ~4 GB per tab), too much for a phone, so devices reporting
// 4 GB of RAM or less (navigator.deviceMemory; Chromium only) get half the limit.
const MAX_FILE_MB = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 5 : 10;

// Office theme order as cells reference it: 0 = lt1, 1 = dk1, 2 = lt2, 3 = dk2, 4-9 = accent1-6.
const THEME_ORDER = ['lt1', 'dk1', 'lt2', 'dk2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'];
const DEFAULT_THEME = ['FFFFFF', '000000', 'E7E6E6', '44546A', '4472C4', 'ED7D31', 'A5A5A5', 'FFC000', '5B9BD5', '70AD47', '0563C1', '954F72'];
// Legacy indexed palette used by older files; 64/65 are the system foreground/background.
const INDEXED = [
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '000000', 'FFFFFF', 'FF0000', '00FF00', '0000FF', 'FFFF00', 'FF00FF', '00FFFF',
  '800000', '008000', '000080', '808000', '800080', '008080', 'C0C0C0', '808080',
  '9999FF', '993366', 'FFFFCC', 'CCFFFF', '660066', 'FF8080', '0066CC', 'CCCCFF',
  '000080', 'FF00FF', 'FFFF00', '00FFFF', '800080', '800000', '008080', '0000FF',
  '00CCFF', 'CCFFFF', 'CCFFCC', 'FFFF99', '99CCFF', 'FF99CC', 'CC99FF', 'FFCC99',
  '3366FF', '33CCCC', '99CC00', 'FFCC00', 'FF9900', 'FF6600', '666699', '969696',
  '003366', '339966', '003300', '333300', '993300', '993366', '333399', '333333',
  '000000', 'FFFFFF',
];
// Canvas stroke for each Excel border style: width in px and dash pattern.
const BORDER = {
  thin: { width: 1 }, hair: { width: 0.5 }, dotted: { width: 1, dash: [1, 2] }, dashed: { width: 1, dash: [4, 2] },
  dashDot: { width: 1, dash: [6, 2, 2, 2] }, dashDotDot: { width: 1, dash: [6, 2, 2, 2, 2, 2] },
  medium: { width: 2 }, mediumDashed: { width: 2, dash: [6, 3] }, mediumDashDot: { width: 2, dash: [8, 3, 3, 3] },
  mediumDashDotDot: { width: 2, dash: [8, 3, 3, 3, 3, 3] }, slantDashDot: { width: 2, dash: [8, 3, 3, 3] },
  thick: { width: 3 }, double: { width: 1, double: true },
};
// Pages are drawn at 2 canvas pixels per CSS pixel (192 dpi) so small text stays sharp.
const RENDER_SCALE = 2;

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
  // A ReferenceError here means a converter library never loaded (e.g. "ExcelJS is not defined").
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

// ---- Colours --------------------------------------------------------------------------------

function readTheme(workbook) {
  const xml = workbook._themes && Object.values(workbook._themes)[0];
  if (!xml) return DEFAULT_THEME;
  const scheme = new DOMParser().parseFromString(xml, 'application/xml').getElementsByTagName('a:clrScheme')[0];
  if (!scheme) return DEFAULT_THEME;
  return THEME_ORDER.map((name, i) => {
    const colour = scheme.getElementsByTagName('a:' + name)[0]?.firstElementChild;
    return colour?.getAttribute('lastClr') || colour?.getAttribute('val') || DEFAULT_THEME[i];
  });
}

// Excel's tint: shifts HSL lightness toward black (tint < 0) or white (tint > 0).
function applyTint(hex, tint) {
  let [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  let l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    h /= 6;
  }
  l = tint < 0 ? l * (1 + tint) : l * (1 - tint) + tint;
  const hue = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    [r, g, b] = [hue(p, q, h + 1 / 3), hue(p, q, h), hue(p, q, h - 1 / 3)];
  }
  return [r, g, b].map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
}

function cssColor(color) {
  if (!color) return null;
  let hex;
  if (color.argb) hex = color.argb.slice(-6);
  else if (color.theme !== undefined) hex = state.theme[color.theme];
  else if (color.indexed !== undefined) hex = INDEXED[color.indexed];
  if (!hex) return null;
  return '#' + (color.tint ? applyTint(hex, color.tint) : hex);
}

// ---- Cell values ----------------------------------------------------------------------------

function formatNumber(code, value) {
  try {
    return SSF.format(code, value);
  } catch {
    return String(value);
  }
}

// What Excel would display in the cell, plus its kind (for Excel's default "General" alignment).
function cellDisplay(cell) {
  let value = cell.value;
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if (value.richText) return { kind: 'text', runs: value.richText };
    if ('formula' in value || 'sharedFormula' in value || 'result' in value) value = value.result;
    else if ('hyperlink' in value) value = value.text;
  }
  if (value && typeof value === 'object' && value.richText) return { kind: 'text', runs: value.richText };
  if (value && typeof value === 'object' && 'error' in value) return { kind: 'error', text: value.error };
  if (value === null || value === undefined || value === '') return { kind: 'empty', text: '' };
  if (typeof value === 'boolean') return { kind: 'bool', text: value ? 'TRUE' : 'FALSE' };
  // ExcelJS gives dates as UTC Dates; SSF wants Excel's serial day number.
  if (value instanceof Date) return { kind: 'number', text: formatNumber(cell.numFmt || 'm/d/yyyy', value.getTime() / 86400000 + 25569) };
  if (typeof value === 'number') return { kind: 'number', text: formatNumber(cell.numFmt || 'General', value) };
  return { kind: 'text', text: String(value) };
}

// ---- Cell formatting ------------------------------------------------------------------------

// Text is laid out and drawn in Carlito (metric-compatible with Calibri, Excel's default font),
// the font embedded in the PDF, so line wrapping measured here matches what the PDF shows. The
// cell's own font only serves as the canvas fallback for characters Carlito lacks (e.g. Hindi).
function fontSpec(font = {}) {
  const px = (font.size || 11) * (96 / 72);
  const name = (font.name || 'Calibri').replace(/"/g, '');
  return {
    css: `${font.italic ? 'italic ' : ''}${font.bold ? 'bold ' : ''}${px}px Carlito, "${name}", Calibri, Arial, sans-serif`,
    px,
    bold: !!font.bold,
    color: cssColor(font.color) || '#000',
    underline: !!font.underline,
    strike: !!font.strike,
  };
}

function cellFormat(cell, kind) {
  const style = cell.style || {};
  const fill = style.fill;
  let background = null;
  if (fill?.type === 'pattern' && fill.pattern && fill.pattern !== 'none') background = cssColor(fill.fgColor) || cssColor(fill.bgColor);
  else if (fill?.type === 'gradient') background = cssColor(fill.stops?.[0]?.color);
  const borders = {};
  for (const side of ['top', 'right', 'bottom', 'left']) {
    const border = style.border?.[side];
    if (border?.style && BORDER[border.style]) borders[side] = { ...BORDER[border.style], color: cssColor(border.color) || '#000' };
  }
  const alignment = style.alignment || {};
  let horizontal = alignment.horizontal;
  if (!horizontal || horizontal === 'general') horizontal = kind === 'number' ? 'right' : kind === 'bool' || kind === 'error' ? 'center' : 'left';
  horizontal = { centerContinuous: 'center', distributed: 'center', justify: 'left', fill: 'left' }[horizontal] || horizontal;
  return {
    font: fontSpec(style.font),
    background,
    borders,
    horizontal,
    vertical: { top: 'top', middle: 'middle', center: 'middle' }[alignment.vertical] || 'bottom',
    wrap: !!alignment.wrapText,
    indent: (alignment.indent || 0) * 9,
  };
}

// ---- Sheet layout ---------------------------------------------------------------------------

function columnNumber(letters) {
  return [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
}

function parseRange(ref) {
  const m = ref.replace(/\$/g, '').split('!').pop().match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
  if (!m) return null;
  return { left: columnNumber(m[1]), top: +m[2], right: columnNumber(m[3] || m[1]), bottom: +(m[4] || m[2]) };
}

function hasContent(cell) {
  const value = cell.value;
  if (value !== null && value !== undefined && value !== '') return true;
  const border = cell.style?.border;
  return !!(border && Object.values(border).some((b) => b?.style));
}

const measureCtx = document.createElement('canvas').getContext('2d');
const LINE_HEIGHT = 1.22; // Calibri's line spacing; 11pt → one 15pt (20px) Excel row
const CELL_PAD = 2;
// Longer cell text is cut before layout: Excel allows 32k characters, far more than a page shows.
const MAX_CELL_TEXT = 2000;

function cellText(display) {
  const text = display.runs ? display.runs.map((run) => run.text).join('') : display.text;
  return text.length > MAX_CELL_TEXT ? text.slice(0, MAX_CELL_TEXT) + '…' : text;
}

// Breaks text into lines no wider than maxWidth, the way Excel wraps: at spaces, and mid-word only
// when a single word is wider than the cell. measure(text) returns a width in sheet px.
function wrapLines(measure, text, maxWidth) {
  const lines = [];
  for (const paragraph of text.split('\n')) {
    let line = '';
    for (const word of paragraph.split(/(\s+)/)) {
      if (!word) continue;
      const candidate = line + word;
      if (line && measure(candidate) > maxWidth) {
        lines.push(line.trimEnd());
        line = word.trimStart();
      } else {
        line = candidate;
      }
      while (line.length > 1 && measure(line) > maxWidth) {
        let lo = 1;
        let hi = line.length - 1;
        while (lo < hi) {
          const mid = Math.ceil((lo + hi) / 2);
          if (measure(line.slice(0, mid)) <= maxWidth) lo = mid;
          else hi = mid - 1;
        }
        lines.push(line.slice(0, lo));
        line = line.slice(lo);
      }
    }
    lines.push(line);
  }
  return lines;
}

// Works out the sheet's printable area and every row's height — numbers only, no DOM, so this
// stays cheap even for very long sheets. Returns null for an empty sheet.
function prepareSheet(ws) {
  const merges = (ws.model.merges || []).map(parseRange).filter(Boolean);
  const mergeAt = new Map(merges.map((m) => [m.top + ',' + m.left, m]));
  let range = ws.pageSetup?.printArea && parseRange(ws.pageSetup.printArea.split(',')[0]);
  if (!range) {
    range = { bottom: 0, right: 0 };
    ws.eachRow((row, r) => {
      row.eachCell((cell, c) => {
        if (cell.isMerged && cell.master !== cell) return;
        if (!hasContent(cell)) return;
        const merge = mergeAt.get(r + ',' + c);
        range.bottom = Math.max(range.bottom, merge ? merge.bottom : r);
        range.right = Math.max(range.right, merge ? merge.right : c);
      });
    });
    if (!range.bottom) return null;
    // Excel prints from A1, keeping any leading blank rows/columns as space.
    range.top = 1;
    range.left = 1;
  }

  const defaultWidth = ws.properties.defaultColWidth || 8.43;
  const defaultHeight = (ws.properties.defaultRowHeight || 15) * (4 / 3);
  const columns = [];
  const colX = [];
  let width = 0;
  for (let c = range.left; c <= range.right; c++) {
    const column = ws.getColumn(c);
    if (column.hidden) continue;
    // Excel column width is in "characters" of the default font; 7px each plus 5px padding.
    const w = Math.round((column.width || defaultWidth) * 7 + 5);
    columns.push({ c, width: w });
    colX.push(width);
    width += w;
  }
  const colIndex = new Map(columns.map((col, i) => [col.c, i]));
  const countIn = (index, from, to) => { let n = 0; for (let k = from; k <= to; k++) if (index.has(k)) n++; return n; };

  const covered = new Set();
  const masters = new Map();
  for (const m of merges) {
    for (let r = m.top; r <= m.bottom; r++) for (let c = m.left; c <= m.right; c++) covered.add(r + ',' + c);
    covered.delete(m.top + ',' + m.left);
  }

  const rows = [];
  for (let r = range.top; r <= range.bottom; r++) {
    const row = ws.getRow(r);
    if (row.hidden) continue;
    let height = row.height ? row.height * (4 / 3) : defaultHeight;
    // Rows without a set height grow to fit wrapped text and large fonts, as Excel auto-fits them.
    if (!row.height) {
      row.eachCell((cell, c) => {
        const ci = colIndex.get(c);
        if (ci === undefined || covered.has(r + ',' + c)) return;
        const format = cellFormat(cell, 'text');
        if (!format.wrap && format.font.px <= 15) return;
        // Like Excel: a merged cell grows its row for a big font only when the merge is one row
        // tall, and never for wrapped text.
        const merge = mergeAt.get(r + ',' + c);
        if (merge && (merge.bottom > merge.top || format.wrap)) return;
        const display = cellDisplay(cell);
        if (display.kind === 'empty') return;
        let lines = 1;
        if (format.wrap) {
          measureCtx.font = format.font.css;
          lines = wrapLines((s) => measureCtx.measureText(s).width, cellText(display), columns[ci].width - CELL_PAD * 2 - format.indent).length;
        }
        height = Math.max(height, lines * format.font.px * LINE_HEIGHT + CELL_PAD);
      });
    }
    rows.push({ r, row, height });
  }
  const rowIndex = new Map(rows.map((row, i) => [row.r, i]));

  // A merge that spans rows ties those rows together so a page break never cuts it.
  const blockEnd = rows.map((_, i) => i);
  for (const m of merges) {
    masters.set(m.top + ',' + m.left, { rows: countIn(rowIndex, m.top, m.bottom), cols: countIn(colIndex, m.left, m.right) });
    let first = -1;
    let last = -1;
    for (let r = m.top; r <= m.bottom; r++) {
      const i = rowIndex.get(r);
      if (i === undefined) continue;
      if (first < 0) first = i;
      last = i;
    }
    for (let i = first; i >= 0 && i <= last; i++) blockEnd[i] = Math.max(blockEnd[i], last);
  }

  return { columns, colX, rows, masters, covered, blockEnd, width };
}

function pageGeometry(ws, width) {
  const setup = ws.pageSetup || {};
  const paperKey = pageSizeSelect.value === 'auto' ? (setup.paperSize === 1 ? 'letter' : 'a4') : pageSizeSelect.value;
  let [pageW, pageH] = PAPER[paperKey];
  const inch = { ...DEFAULT_MARGINS, ...(setup.margins || {}) };
  const margin = { left: inch.left * 96, right: inch.right * 96, top: inch.top * 96, bottom: inch.bottom * 96 };
  // ponytail: "auto" goes landscape when the sheet asks for it or would need >20% shrinking in
  // portrait; Excel itself never switches orientation on its own.
  const landscape = orientationSelect.value === 'landscape'
    || (orientationSelect.value === 'auto' && (setup.orientation === 'landscape' || width > (pageW - margin.left - margin.right) * 1.2));
  if (landscape) [pageW, pageH] = [pageH, pageW];
  const contentW = pageW - margin.left - margin.right;
  // Never enlarged. "fit" squeezes every column onto one page however small the text gets; "auto"
  // stops shrinking at a readable size and lets the extra columns continue on further pages.
  const fitAll = Math.min(1, contentW / width);
  const fit = scalingSelect.value === 'fit' ? fitAll : scalingSelect.value === 'actual' ? 1 : Math.max(fitAll, MIN_READABLE_SCALE);
  return { pageW, pageH, margin, contentW, contentH: pageH - margin.top - margin.bottom, fit };
}

// Groups columns into bands that each fit across one page. A column wider than the page gets a
// band of its own and is clipped, as in Excel.
function columnBands(sheet, geo) {
  const limit = geo.contentW / geo.fit + 0.5;
  const bands = [];
  let from = 0;
  for (let ci = 1; ci <= sheet.columns.length; ci++) {
    const x0 = sheet.colX[from];
    const right = ci < sheet.columns.length ? sheet.colX[ci] + sheet.columns[ci].width : Infinity;
    if (ci === sheet.columns.length || right - x0 > limit) {
      const width = (ci < sheet.columns.length ? sheet.colX[ci] : sheet.width) - x0;
      bands.push({ from, to: ci - 1, x0, width });
      from = ci;
    }
  }
  return bands;
}

// Row indices repeated at the top of every page after the first: the sheet's own print titles
// ("Rows to repeat at top") when set, otherwise the first row — so every page keeps its column titles.
function headerRows(ws, sheet) {
  let indices = [];
  const titles = ws.pageSetup?.printTitlesRow?.replace(/\$/g, '').match(/^(\d+):(\d+)$/);
  if (titles) {
    indices = sheet.rows.map((row, i) => (row.r >= +titles[1] && row.r <= +titles[2] ? i : -1)).filter((i) => i >= 0);
  } else if (sheet.rows.length > 1) {
    indices = [0];
  }
  if (!indices.length) return [];
  // A merge reaching below the header rows must come along whole.
  const last = sheet.blockEnd[indices[indices.length - 1]];
  const all = [];
  for (let i = indices[0]; i <= last; i++) all.push(i);
  return all;
}

// Splits the rows into pages. Pure arithmetic — nothing is drawn yet. Each page is its row range
// plus whether the header rows are repeated above it.
function paginate(sheet, geo, header) {
  const pages = [];
  const limit = geo.contentH / geo.fit;
  const headerEnd = header.length ? header[header.length - 1] : -1;
  const headerH = header.reduce((sum, i) => sum + sheet.rows[i].height, 0);
  // Repeating a header that eats most of the page would leave no room for data, so drop it then.
  const repeat = headerH > 0 && headerH < limit / 2;
  let start = 0;
  let used = 0;
  for (let i = 0; i < sheet.rows.length;) {
    const end = sheet.blockEnd[i];
    let blockH = 0;
    for (let k = i; k <= end; k++) blockH += sheet.rows[k].height;
    if (i > start && used + blockH > limit) {
      pages.push({ start, end: i - 1, withHeader: repeat && start > headerEnd });
      start = i;
      used = repeat && start > headerEnd ? headerH : 0;
    }
    used += blockH;
    i = end + 1;
  }
  pages.push({ start, end: sheet.rows.length - 1, withHeader: repeat && start > headerEnd });
  return pages;
}

// ---- Page layout (shared by both renderers) -------------------------------------------------

// Every visible cell on one page with its box in sheet px, relative to the band's left edge and
// the page's top. Header rows come first when the page repeats them.
function layoutPage(sheet, band, page, header) {
  const { rows, columns, colX, masters, covered } = sheet;
  const drawRows = page.withHeader ? [...header] : [];
  for (let i = page.start; i <= page.end; i++) drawRows.push(i);
  const rowY = new Map();
  let y = 0;
  for (const i of drawRows) {
    rowY.set(i, y);
    y += rows[i].height;
  }
  const cells = [];
  for (const i of drawRows) {
    const { r, row, height } = rows[i];
    for (let ci = band.from; ci <= band.to; ci++) {
      const { c, width } = columns[ci];
      const key = r + ',' + c;
      if (covered.has(key)) continue;
      const span = masters.get(key);
      if (span && (!span.rows || !span.cols)) continue; // merge hidden entirely by hidden rows/columns
      const cell = row.getCell(c);
      const display = cellDisplay(cell);
      const format = cellFormat(cell, display.kind);
      let w = width;
      let h = height;
      if (span) {
        w = 0;
        for (let k = ci; k < ci + span.cols && k < columns.length; k++) w += columns[k].width;
        h = 0;
        for (let k = i; k < i + span.rows && rowY.has(k); k++) h += rows[k].height;
      }
      const next = columns[ci + (span?.cols || 1)];
      // Unwrapped text spills over empty neighbours, as in Excel; otherwise it is clipped to its cell.
      const clip = format.wrap || !!span || (next && hasContent(row.getCell(next.c)));
      cells.push({ cell, x: colX[ci] - band.x0, y: rowY.get(i), w, h, display, format, clip });
    }
  }
  return cells;
}

// Lines of text for a cell, each a list of segments with their x position and width, laid out with
// whichever renderer's measure(text, font) is passed in. Also returns whether the text strays
// outside the area it may occupy, so the PDF only pays for a clipping path when one is needed.
function layoutText(cell, measure, areaWidth) {
  const { x, y, w, h, display, format } = cell;
  const text = cellText(display);
  let lines;
  if (format.wrap) {
    lines = wrapLines((s) => measure(s, format.font), text, w - CELL_PAD * 2 - format.indent)
      .map((line) => [{ text: line, font: format.font }]);
  } else if (display.runs) {
    // ponytail: rich text keeps per-run fonts only when unwrapped; wrapped rich text uses the cell font.
    lines = [display.runs.map((run) => ({ text: run.text.replace(/\n/g, ' '), font: run.font ? fontSpec({ ...cell.cell.style?.font, ...run.font }) : format.font }))];
  } else {
    let single = text.replace(/\n/g, ' ');
    // Like Excel, a number or date too wide for its column shows as ##### rather than being cut,
    // which could turn 123,456 into a believable 23,456.
    const room = w - CELL_PAD * 2 - format.indent;
    if (display.kind === 'number' && measure(single, format.font) > room) {
      single = '#'.repeat(Math.max(1, Math.floor(room / measure('#', format.font))));
    }
    lines = [[{ text: single, font: format.font }]];
  }
  const lineH = format.font.px * LINE_HEIGHT;
  const blockH = lines.length * lineH;
  const top = format.vertical === 'top' ? y + CELL_PAD / 2
    : format.vertical === 'middle' ? y + (h - blockH) / 2
      : y + h - CELL_PAD / 2 - blockH;
  let left = Infinity;
  let right = -Infinity;
  const laidOut = lines.map((segments, k) => {
    let total = 0;
    for (const seg of segments) {
      seg.width = measure(seg.text, seg.font);
      total += seg.width;
    }
    let lx;
    if (format.horizontal === 'right') lx = x + w - CELL_PAD - format.indent - total;
    else if (format.horizontal === 'center') lx = x + (w - total) / 2;
    else lx = x + CELL_PAD + format.indent;
    left = Math.min(left, lx);
    right = Math.max(right, lx + total);
    for (const seg of segments) {
      seg.x = lx;
      lx += seg.width;
    }
    return { segments, y: top + lineH * (k + 0.5) };
  });
  const clipX = cell.clip ? x : 0;
  const clipW = cell.clip ? w : areaWidth;
  const overflows = left < clipX || right > clipX + clipW || top < y || top + blockH > y + h;
  return { lines: laidOut, clipX, clipW, overflows };
}

// Characters the embedded font cannot draw (Devanagari and other complex scripts, emoji). A page
// containing any of them is drawn as a picture instead, where the browser supplies the glyphs and
// joins the letters correctly.
function pageNeedsPicture(cells, hasGlyph) {
  for (const { display } of cells) {
    if (display.kind === 'empty') continue;
    for (const ch of cellText(display)) {
      const code = ch.codePointAt(0);
      if (code > 0x7e && code !== 0x0a && !hasGlyph(code)) return true;
    }
  }
  return false;
}

// ---- PDF renderer (real text) ---------------------------------------------------------------

const PDF_FONT = 'Carlito';

function drawPagePdf(pdf, geo, band, cells, gridlines) {
  // Sheet px → PDF points: scaled by the page fit, then 96 dpi px → 72 dpi pt.
  const k = geo.fit * 0.75;
  const X = (x) => geo.margin.left * 0.75 + x * k;
  const Y = (y) => geo.margin.top * 0.75 + y * k;
  const setFont = (font) => {
    pdf.setFont(PDF_FONT, font.bold ? 'bold' : 'normal');
    pdf.setFontSize(font.px * k);
  };
  const measure = (text, font) => {
    setFont(font);
    return pdf.getTextWidth(text) / k;
  };

  for (const cell of cells) {
    if (!cell.format.background) continue;
    pdf.setFillColor(cell.format.background);
    pdf.rect(X(cell.x), Y(cell.y), cell.w * k, cell.h * k, 'F');
  }
  if (gridlines) {
    pdf.setDrawColor('#d4d4d4');
    pdf.setLineWidth(0.4);
    for (const cell of cells) pdf.rect(X(cell.x), Y(cell.y), cell.w * k, cell.h * k, 'S');
  }

  for (const cell of cells) {
    if (cell.display.kind === 'empty') continue;
    const { lines, clipX, clipW, overflows } = layoutText(cell, measure, band.width);
    if (overflows) {
      pdf.saveGraphicsState();
      pdf.rect(X(clipX), Y(cell.y), clipW * k, cell.h * k, null);
      pdf.clip();
      pdf.discardPath();
    }
    for (const line of lines) {
      for (const seg of line.segments) {
        if (!seg.text) continue;
        setFont(seg.font);
        pdf.setTextColor(seg.font.color);
        pdf.text(seg.text, X(seg.x), Y(line.y), { baseline: 'middle' });
        if (seg.font.underline || seg.font.strike) {
          pdf.setDrawColor(seg.font.color);
          pdf.setLineWidth(Math.max(0.5, (seg.font.px / 14) * k));
          const ly = Y(line.y + (seg.font.underline ? seg.font.px * 0.45 : 0));
          pdf.line(X(seg.x), ly, X(seg.x + seg.width), ly);
        }
      }
    }
    if (overflows) pdf.restoreGraphicsState();
  }

  for (const { x, y, w, h, format } of cells) {
    for (const [side, b] of Object.entries(format.borders)) {
      pdf.setDrawColor(b.color);
      pdf.setLineWidth(b.width * k);
      pdf.setLineDashPattern((b.dash || []).map((d) => d * k), 0);
      const [x1, y1, x2, y2] = { top: [x, y, x + w, y], bottom: [x, y + h, x + w, y + h], left: [x, y, x, y + h], right: [x + w, y, x + w, y + h] }[side];
      if (b.double) {
        const horizontal = side === 'top' || side === 'bottom';
        for (const offset of [-1, 1]) {
          const dx = horizontal ? 0 : offset;
          const dy = horizontal ? offset : 0;
          pdf.line(X(x1 + dx), Y(y1 + dy), X(x2 + dx), Y(y2 + dy));
        }
      } else {
        pdf.line(X(x1), Y(y1), X(x2), Y(y2));
      }
    }
  }
  pdf.setLineDashPattern([], 0);
}

// ---- Canvas renderer (picture fallback) -----------------------------------------------------

function strokeLine(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawBorders(ctx, { x, y, w, h, format }) {
  for (const [side, b] of Object.entries(format.borders)) {
    ctx.strokeStyle = b.color;
    ctx.lineWidth = b.width;
    ctx.setLineDash(b.dash || []);
    const line = { top: [x, y, x + w, y], bottom: [x, y + h, x + w, y + h], left: [x, y, x, y + h], right: [x + w, y, x + w, y + h] }[side];
    if (b.double) {
      const horizontal = side === 'top' || side === 'bottom';
      for (const offset of [-1, 1]) {
        const [x1, y1, x2, y2] = line;
        strokeLine(ctx, x1 + (horizontal ? 0 : offset), y1 + (horizontal ? offset : 0), x2 + (horizontal ? 0 : offset), y2 + (horizontal ? offset : 0));
      }
    } else {
      strokeLine(ctx, ...line);
    }
  }
  ctx.setLineDash([]);
}

function drawPageCanvas(ctx, geo, band, cells, gridlines) {
  const canvas = ctx.canvas;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const unit = RENDER_SCALE * geo.fit;
  ctx.setTransform(unit, 0, 0, unit, RENDER_SCALE * geo.margin.left, RENDER_SCALE * geo.margin.top);
  ctx.save();
  ctx.beginPath();
  // Clip at the band's right edge, as Excel does, so overflowing text stays off the margin.
  ctx.rect(0, 0, band.width, geo.contentH / geo.fit);
  ctx.clip();

  for (const cell of cells) {
    if (!cell.format.background) continue;
    ctx.fillStyle = cell.format.background;
    ctx.fillRect(cell.x, cell.y, cell.w, cell.h);
  }
  if (gridlines) {
    ctx.strokeStyle = '#d4d4d4';
    ctx.lineWidth = 1 / geo.fit;
    for (const cell of cells) ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
  }
  const measure = (text, font) => {
    ctx.font = font.css;
    return ctx.measureText(text).width;
  };
  ctx.textBaseline = 'middle';
  for (const cell of cells) {
    if (cell.display.kind === 'empty') continue;
    const { lines, clipX, clipW } = layoutText(cell, measure, band.width);
    ctx.save();
    ctx.beginPath();
    ctx.rect(clipX, cell.y, clipW, cell.h);
    ctx.clip();
    for (const line of lines) {
      for (const seg of line.segments) {
        ctx.font = seg.font.css;
        ctx.fillStyle = seg.font.color;
        ctx.fillText(seg.text, seg.x, line.y);
        const thickness = Math.max(1, seg.font.px / 14);
        if (seg.font.underline) ctx.fillRect(seg.x, line.y + seg.font.px * 0.45, seg.width, thickness);
        if (seg.font.strike) ctx.fillRect(seg.x, line.y, seg.width, thickness);
      }
    }
    ctx.restore();
  }
  for (const cell of cells) drawBorders(ctx, cell);
  ctx.restore();
}

// ---- Fonts ----------------------------------------------------------------------------------

let fontsPromise = null;

// Fetches Carlito once per visit: registered with the page (so canvas measuring and the picture
// fallback use it) and kept as base64 for embedding into each PDF.
function loadFonts() {
  fontsPromise ||= (async () => {
    const [regular, bold] = await Promise.all(['/vendor/carlito-regular.ttf', '/vendor/carlito-bold.ttf'].map(async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error('network: font ' + response.status);
      return response.arrayBuffer();
    }));
    const faces = [new FontFace(PDF_FONT, regular, { weight: '400' }), new FontFace(PDF_FONT, bold, { weight: '700' })];
    for (const face of faces) document.fonts.add(await face.load());
    const toBase64 = (buffer) => {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
      return btoa(binary);
    };
    return { regular: toBase64(regular), bold: toBase64(bold) };
  })();
  // A failed download must be retryable on the next click.
  fontsPromise.catch(() => { fontsPromise = null; });
  return fontsPromise;
}

function embedFonts(pdf, fonts) {
  pdf.addFileToVFS('Carlito-Regular.ttf', fonts.regular);
  pdf.addFont('Carlito-Regular.ttf', PDF_FONT, 'normal');
  pdf.addFileToVFS('Carlito-Bold.ttf', fonts.bold);
  pdf.addFont('Carlito-Bold.ttf', PDF_FONT, 'bold');
  pdf.setFont(PDF_FONT, 'normal');
  const codeMap = pdf.getFont().metadata?.cmap?.unicode?.codeMap || {};
  return (code) => code in codeMap;
}

// Lets the browser paint and handle input between pages. A MessageChannel task is not throttled
// the way setTimeout is when the tab is in the background.
function yieldToBrowser() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(null);
  });
}

function selectedSheets() {
  return [...sheetList.querySelectorAll('input:checked')].map((input) => state.workbook.getWorksheet(Number(input.value)));
}

function syncConvertButton() {
  processButton.disabled = state.converting || !state.workbook || !sheetList.querySelector('input:checked');
}

// ---- File loading ---------------------------------------------------------------------------

async function loadFile(file) {
  if (!file) return;
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) {
    showToast('Legacy .xls files are not supported — open it in Excel and save as .xlsx first.', true);
    return;
  }
  if (!name.endsWith('.xlsx') && !name.endsWith('.xlsm')) {
    showToast('Please choose an Excel .xlsx file.', true);
    return;
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    showToast(`This file is ${formatSize(file.size)}. The maximum is ${MAX_FILE_MB} MB.`, true);
    return;
  }

  state.file = file;
  state.workbook = null;
  clearResult();
  editingModule.classList.remove('is-hidden');
  assetName.textContent = file.name;
  assetMeta.textContent = formatSize(file.size);
  assetCard.classList.remove('is-hidden');
  dropzone.classList.add('is-hidden');
  previewStatus.className = 'preview-status working';
  sheetList.replaceChildren();
  syncConvertButton();

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(await file.arrayBuffer());
    state.workbook = workbook;
    state.theme = readTheme(workbook);
    for (const ws of workbook.worksheets) {
      const visible = ws.state === 'visible' || !ws.state;
      const label = document.createElement('label');
      label.className = 'sheet-option';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = ws.id;
      input.checked = visible;
      input.addEventListener('change', () => { clearResult(); syncConvertButton(); });
      const text = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = ws.name + (visible ? '' : ' (hidden)');
      const size = document.createElement('small');
      size.textContent = ws.actualRowCount
        ? `${ws.actualRowCount.toLocaleString()} rows × ${ws.actualColumnCount.toLocaleString()} columns`
        : 'Empty';
      text.append(title, size);
      label.append(input, text);
      sheetList.append(label);
    }
  } catch (err) {
    showInlineMessage(friendlyError(err, 'This file could not be opened. Make sure it is a valid Excel file and not password-protected.'), true);
  } finally {
    previewStatus.className = 'preview-status ready';
    syncConvertButton();
  }
}

// ---- Export ---------------------------------------------------------------------------------

async function convertToPdf() {
  if (!state.workbook || state.converting) return;
  state.converting = true;
  syncConvertButton();
  processingCard.classList.remove('is-hidden');
  clearResult();
  setProgress('Preparing…', 'Reading sheets', 0.02);
  await yieldToBrowser();

  const gridlines = gridlinesInput.checked;
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  try {
    // The font must be in place before any row is measured, so wrapping matches the PDF.
    const fonts = await loadFonts();
    // Every page break is worked out before anything is drawn, so the page count is known up front.
    const jobs = [];
    for (const ws of selectedSheets()) {
      const sheet = prepareSheet(ws);
      if (!sheet) continue;
      const geo = pageGeometry(ws, sheet.width);
      const header = headerRows(ws, sheet);
      const pages = paginate(sheet, geo, header);
      // Excel's "down, then over" order: every row of the first column band, then the next band.
      for (const band of columnBands(sheet, geo)) {
        for (const page of pages) jobs.push({ ws, sheet, geo, band, page, header });
      }
      await yieldToBrowser();
    }
    if (!jobs.length) throw userError('The selected sheets are empty — there is nothing to convert.');

    let pdf;
    let hasGlyph;
    for (let i = 0; i < jobs.length; i++) {
      const { ws, sheet, geo, band, page, header } = jobs[i];
      // Updating the label every page costs more than drawing a text page; every 10th is plenty.
      if (i % 10 === 0) setProgress('Rendering…', `Page ${i + 1} of ${jobs.length.toLocaleString()} · ${ws.name}`, 0.03 + 0.92 * (i / jobs.length));
      const w = geo.pageW * 0.75;
      const h = geo.pageH * 0.75;
      const orientation = w > h ? 'l' : 'p';
      if (!pdf) {
        pdf = new jspdf.jsPDF({ orientation, unit: 'pt', format: [w, h], compress: true });
        hasGlyph = embedFonts(pdf, fonts);
      } else {
        pdf.addPage([w, h], orientation);
      }
      const cells = layoutPage(sheet, band, page, header);
      const asPicture = pageNeedsPicture(cells, hasGlyph);
      if (asPicture) {
        // ponytail: picture pages cost ~400 KB each; a workbook that is mostly Hindi text and
        // thousands of pages long can still exhaust memory. Shaping-aware text would fix that.
        const pixelW = Math.round(geo.pageW * RENDER_SCALE);
        const pixelH = Math.round(geo.pageH * RENDER_SCALE);
        if (canvas.width !== pixelW || canvas.height !== pixelH) {
          canvas.width = pixelW;
          canvas.height = pixelH;
        }
        drawPageCanvas(ctx, geo, band, cells, gridlines);
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.85), 'JPEG', 0, 0, w, h, undefined, 'FAST');
      } else {
        drawPagePdf(pdf, geo, band, cells, gridlines);
      }
      // A text page takes a few ms, so yield every few pages; a picture page (~100 ms) every time.
      if (asPicture || i % 8 === 7) await yieldToBrowser();
    }
    const total = jobs.length;

    setProgress('Finishing…', 'Building PDF', 0.97);
    await yieldToBrowser();
    const blob = pdf.output('blob');
    state.resultUrl = URL.createObjectURL(blob);
    downloadButton.href = state.resultUrl;
    downloadButton.download = state.file.name.replace(/\.[^.]+$/, '') + '.pdf';
    resultMeta.textContent = `${formatSize(blob.size)} · ${total} page${total > 1 ? 's' : ''}`;
    resultCard.classList.remove('is-hidden');
    setProgress('Done', 'PDF ready', 1);
    showInlineMessage('Converted successfully.', false);
    setTimeout(() => processingCard.classList.add('is-hidden'), 700);
  } catch (err) {
    showInlineMessage(friendlyError(err, 'Something went wrong while creating the PDF. Please try again.'), true);
    setProgress('Error', 'Conversion failed', 0);
    setTimeout(() => processingCard.classList.add('is-hidden'), 3000);
  } finally {
    canvas.width = canvas.height = 0; // release the bitmap now rather than at GC
    state.converting = false;
    syncConvertButton();
  }
}

fileInput.addEventListener('change', (event) => {
  loadFile(event.target.files[0]);
  fileInput.value = '';
});
replaceButton.addEventListener('click', () => fileInput.click());
processButton.addEventListener('click', convertToPdf);
for (const control of [pageSizeSelect, orientationSelect, scalingSelect, gridlinesInput]) control.addEventListener('change', clearResult);

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
