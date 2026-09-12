import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const srcDir = root;
const outDir = path.join(root, 'dist');

const sourceFiles = ['index.html', 'app.js', 'styles.css'];

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

const toolRoot = path.join(srcDir, 'tools');
if (fs.existsSync(toolRoot)) {
  copyDirectory(toolRoot, path.join(outDir, 'tools'));
}

console.log(`Built frontend bundle in ${outDir}`);
