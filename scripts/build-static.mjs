import fs from 'node:fs';
import path from 'node:path';
import { TOOLS } from '../tools-data.js';

// Search engines are told about the site from the same catalogue the pages are built from, so
// adding a tool cannot leave the sitemap behind.
const SITE = 'https://mediapilottools.com';

const root = process.cwd();
const srcDir = root;
const outDir = path.join(root, 'dist');

const sourceFiles = ['index.html', 'app.js', 'styles.css', 'home.css', 'home.js', 'hero-canvas.js', 'tools-data.js', 'tool.css', 'tool-shell.js', 'adsense-config.js', 'adsense-component.js', 'favicon.svg', 'og-image.png'];
const vendorFiles = [
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

console.log(`Built frontend bundle in ${outDir} (${urls.length} urls in sitemap.xml)`);
