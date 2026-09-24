import fs from 'node:fs';
import path from 'node:path';
import { TOOLS } from '../tools-data.js';

// Search engines are told about the site from the same catalogue the pages are built from, so
// adding a tool cannot leave the sitemap behind.
const SITE = 'https://mediapilottools.com';

const root = process.cwd();
const srcDir = root;
const outDir = path.join(root, 'dist');

const sourceFiles = ['index.html', 'app.js', 'styles.css', 'home.css', 'home.js', 'tools-data.js', 'tool.css', 'tool-shell.js', 'adsense-config.js', 'adsense-component.js', 'favicon.svg'];
const vendorFiles = [
  ['node_modules/@techstark/opencv-js/dist/opencv.js', 'vendor/opencv.js'],
  ['node_modules/@techstark/opencv-js/dist/opencv.js', 'dist/vendor/opencv.js'],
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

const today = new Date().toISOString().slice(0, 10);
const urls = [
  { loc: `${SITE}/`, priority: '1.0' },
  ...TOOLS.map((tool) => ({ loc: `${SITE}${tool.href}`, priority: '0.8' })),
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
