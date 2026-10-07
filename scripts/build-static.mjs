import fs from 'node:fs';
import path from 'node:path';
import { transformSync } from 'esbuild';
import { TOOLS } from '../tools-data.js';

// Search engines are told about the site from the same catalogue the pages are built from, so
// adding a tool cannot leave the sitemap behind.
const SITE = 'https://mediapilottools.com';

const root = process.cwd();
const srcDir = root;
const outDir = path.join(root, 'dist');

const sourceFiles = ['index.html', 'app.js', 'styles.css', 'home.css', 'home.js', 'hero-canvas.js', 'tools-data.js', 'tool.css', 'tool-shell.js', 'adsense-config.js', 'adsense-component.js', 'favicon.svg', 'og-image.png'];
const vendorFiles = [
  ['node_modules/diff/dist/diff.min.js', 'vendor/diff.min.js'],
  ['node_modules/diff/dist/diff.min.js', 'dist/vendor/diff.min.js'],
  ['node_modules/js-beautify/js/lib/beautifier.min.js', 'vendor/beautifier.min.js'],
  ['node_modules/js-beautify/js/lib/beautifier.min.js', 'dist/vendor/beautifier.min.js'],
  ['node_modules/@techstark/opencv-js/dist/opencv.js', 'vendor/opencv.js'],
  ['node_modules/@techstark/opencv-js/dist/opencv.js', 'dist/vendor/opencv.js'],
  ['node_modules/tesseract.js/dist/tesseract.min.js', 'dist/vendor/tesseract.min.js'],
  ['node_modules/tesseract.js/dist/worker.min.js', 'dist/vendor/worker.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'vendor/jszip.min.js'],
  ['node_modules/jszip/dist/jszip.min.js', 'dist/vendor/jszip.min.js'],
  ['node_modules/docx-preview/dist/docx-preview.min.js', 'vendor/docx-preview.min.js'],
  ['node_modules/docx-preview/dist/docx-preview.min.js', 'dist/vendor/docx-preview.min.js'],
  ['node_modules/exceljs/dist/exceljs.min.js', 'vendor/exceljs.min.js'],
  ['node_modules/exceljs/dist/exceljs.min.js', 'dist/vendor/exceljs.min.js'],
  ['node_modules/ssf/ssf.js', 'vendor/ssf.js'],
  ['node_modules/ssf/ssf.js', 'dist/vendor/ssf.js'],
  ['node_modules/@expo-google-fonts/carlito/400Regular/Carlito_400Regular.ttf', 'vendor/carlito-regular.ttf'],
  ['node_modules/@expo-google-fonts/carlito/400Regular/Carlito_400Regular.ttf', 'dist/vendor/carlito-regular.ttf'],
  ['node_modules/@expo-google-fonts/carlito/700Bold/Carlito_700Bold.ttf', 'vendor/carlito-bold.ttf'],
  ['node_modules/@expo-google-fonts/carlito/700Bold/Carlito_700Bold.ttf', 'dist/vendor/carlito-bold.ttf'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'vendor/pdf-lib.min.js'],
  ['node_modules/pdf-lib/dist/pdf-lib.min.js', 'dist/vendor/pdf-lib.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'vendor/pdfjs/pdf.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.min.mjs', 'dist/vendor/pdfjs/pdf.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'vendor/pdfjs/pdf.worker.min.js'],
  ['node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'dist/vendor/pdfjs/pdf.worker.min.js'],
  ['node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js', 'vendor/qpdf/qpdf.js'],
  ['node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.js', 'dist/vendor/qpdf/qpdf.js'],
  ['node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', 'vendor/qpdf/qpdf.wasm'],
  ['node_modules/@neslinesli93/qpdf-wasm/dist/qpdf.wasm', 'dist/vendor/qpdf/qpdf.wasm'],
  ['node_modules/jspdf/dist/jspdf.umd.min.js', 'dist/vendor/jspdf.min.js'],
  ['node_modules/html2canvas/dist/html2canvas.min.js', 'dist/vendor/html2canvas.min.js'],
];

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

for (const file of sourceFiles) {
  const sourcePath = path.join(srcDir, file);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Required frontend file not found: ${file}`);
  }
  fs.copyFileSync(sourcePath, path.join(outDir, file));
}

// Whole vendor folders: pdf.js fetches individual character maps and standard fonts on demand.
const vendorDirs = [
  ['node_modules/pdfjs-dist/cmaps', 'pdfjs/cmaps'],
  ['node_modules/pdfjs-dist/standard_fonts', 'pdfjs/standard_fonts'],
];

for (const [sourceRel, targetRel] of vendorDirs) {
  for (const base of ['vendor', 'dist/vendor']) copyDirectory(path.join(srcDir, sourceRel), path.resolve(root, base, targetRel));
}

for (const [sourceRel, targetRel] of vendorFiles) {
  const sourcePath = path.join(srcDir, sourceRel);
  const targetPath = path.resolve(root, targetRel);
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Required vendor file not found: ${sourceRel}`);
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.copyFileSync(sourcePath, targetPath);
}

const toolRoot = path.join(srcDir, 'tools');
if (fs.existsSync(toolRoot)) {
  copyDirectory(toolRoot, path.join(outDir, 'tools'));
}

// Standalone pages served at /<name> (each is a folder with an index.html).
const pageDirs = ['privacy', 'terms'];
for (const dir of pageDirs) {
  copyDirectory(path.join(srcDir, dir), path.join(outDir, dir));
}

// Hero artwork layers.
copyDirectory(path.join(srcDir, 'assets'), path.join(outDir, 'assets'));

const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: `${SITE}/`, priority: '1.0' },
  ...TOOLS.map((tool) => ({ loc: `${SITE}${tool.href}`, priority: '0.8' })),
  ...pageDirs.map((dir) => ({ loc: `${SITE}/${dir}`, priority: '0.3' })),
  // Pages for specific searches; each presets an existing tool (see tools/<slug>/index.html).
  ...['compress-jpeg-to-50kb', 'compress-image-to-100kb', 'compress-image-for-whatsapp'].map((slug) => ({ loc: `${SITE}/tools/${slug}`, priority: '0.7' })),
];
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(({ loc, priority }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${priority}</priority>
  </url>
`).join('')}</urlset>
`;
fs.writeFileSync(path.join(outDir, 'sitemap.xml'), sitemap);

fs.writeFileSync(path.join(outDir, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${SITE}/sitemap.xml
`);

fs.writeFileSync(path.join(outDir, 'ads.txt'), `google.com, pub-5308568581303754, DIRECT, f08c47fec0942fa0
`);

// Ship our own code minified: no comments, short local names, no source maps. This does not stop
// anyone saving the files (a browser has to download code to run it), but it makes them much
// harder to read or reuse and keeps the explanatory comments out of public view.
// Third-party files in vendor/ are left as published; they are already minified and their
// license notices must stay.
const skipDirs = new Set([path.join(outDir, 'vendor'), path.join(outDir, 'assets')]);
// Plain (non-module) scripts get their own scope first, so their top-level names can be shortened
// too. Nothing relies on those names across files: shared helpers are attached to window explicitly
// (window.VideoKit, window.PdfPreview, ...), and pages use no inline onclick-style handlers.
const isModule = (code) => /^\s*(import|export)\b/m.test(code);
const minifyJs = (code) => transformSync(isModule(code) ? code : `(()=>{\n${code}\n})();`, { loader: 'js', minify: true, legalComments: 'none' }).code;
const minifyCss = (code) => transformSync(code, { loader: 'css', minify: true, legalComments: 'none' }).code;
function minifyHtml(html) {
  return html
    .replace(/<!--(?!\[if)[\s\S]*?-->/g, '')
    .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (m, open, css, close) => open + minifyCss(css).trim() + close)
    .replace(/(<script\b([^>]*)>)([\s\S]*?)(<\/script>)/gi, (m, open, attrs, code, close) => {
      if (!code.trim() || /\bsrc=/.test(attrs)) return m;
      if (/application\/ld\+json/.test(attrs)) return open + JSON.stringify(JSON.parse(code)) + close;
      // Inline snippets (analytics, theme) define globals on purpose, so they are not wrapped.
      return open + transformSync(code, { loader: 'js', minify: true, legalComments: 'none' }).code.trim() + close;
    })
    .replace(/\n\s*\n+/g, '\n');
}
let minified = 0;
let savedBytes = 0;
(function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { if (!skipDirs.has(file)) walk(file); continue; }
    const transform = { '.js': minifyJs, '.css': minifyCss, '.html': minifyHtml }[path.extname(entry.name)];
    if (!transform) continue;
    const source = fs.readFileSync(file, 'utf8');
    const output = transform(source);
    fs.writeFileSync(file, output);
    minified++;
    savedBytes += Buffer.byteLength(source) - Buffer.byteLength(output);
  }
})(outDir);

console.log(`Built frontend bundle in ${outDir} (${urls.length} urls in sitemap.xml; ${minified} files minified, ${Math.round(savedBytes / 1024)} KB smaller)`);
