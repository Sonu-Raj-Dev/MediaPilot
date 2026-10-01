// Shared by the PDF tools built on qpdf (Protect PDF, Unlock PDF): qpdf, the standard open-source
// PDF tool, compiled to WebAssembly. Exposes window.QpdfRunner.
window.QpdfRunner = (() => {
  let scriptPromise = null;

  // The 1.3 MB engine loads on first use, not with the page.
  function load() {
    scriptPromise ||= new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/qpdf/qpdf.js';
      script.onload = () => resolve(window.Module);
      script.onerror = () => {
        scriptPromise = null; // let the next attempt retry
        reject(Object.assign(new Error('qpdf failed to load'), { qpdfLoad: true }));
      };
      document.head.append(script);
    });
    return scriptPromise;
  }

  // Runs one qpdf command with `input` at /in.pdf and returns { code, out, err, output }, where
  // output is /out.pdf if the command wrote one. Exit codes: 0 ok, 2 error, 3 ok with warnings.
  // This build ignores emscripten's print hooks and binds console.log / console.error when an
  // instance is created, so the console is swapped for collectors before creating it and restored
  // after the command. A fresh instance per command keeps runs independent; the browser caches the
  // compiled WebAssembly, so this costs only a few ms.
  async function run(args, input) {
    const factory = await load();
    const out = [];
    const err = [];
    const { log, error, warn } = console;
    console.log = (...parts) => out.push(parts.join(' '));
    console.error = (...parts) => err.push(parts.join(' '));
    console.warn = (...parts) => err.push(parts.join(' '));
    let qpdf;
    let code;
    try {
      qpdf = await factory({ locateFile: () => '/vendor/qpdf/qpdf.wasm' });
      qpdf.FS.writeFile('/in.pdf', input);
      code = qpdf.callMain(args);
    } catch (exit) {
      if (!qpdf) throw exit; // the engine itself failed to start
      code = typeof exit?.status === 'number' ? exit.status : 2;
    } finally {
      Object.assign(console, { log, error, warn });
    }
    let output = null;
    try {
      output = qpdf.FS.readFile('/out.pdf');
    } catch { /* no output for this command */ }
    return { code, out, err, output };
  }

  // How a PDF opens: { status: 'open' | 'password' | 'damaged', pages, encrypted }.
  // 'open' with encrypted=true means it opens freely but carries permission restrictions.
  async function inspect(input) {
    const check = await run(['--show-npages', '/in.pdf'], input);
    if (check.code !== 0 && check.code !== 3) {
      if (check.err.some((line) => /invalid password/i.test(line))) return { status: 'password' };
      console.error('qpdf:', check.err.join(' '));
      return { status: 'damaged' };
    }
    const pages = Number(check.out.find((line) => /^\d+$/.test(line.trim()))) || 0;
    const encryption = await run(['--show-encryption', '/in.pdf'], input);
    const encrypted = !encryption.out.some((line) => /not encrypted/i.test(line));
    return { status: 'open', pages, encrypted };
  }

  return { run, inspect };
})();
