// Shared by the PDF tools that show page thumbnails (PDF to JPG/PNG, Rotate PDF). Loads pdf.js on
// first use and exposes window.PdfPreview.
window.PdfPreview = (() => {
  let pdfjs;

  async function load() {
    if (!pdfjs) {
      // Vendored as .js rather than pdf.js's own .mjs: some servers (including Python's on Windows)
      // send .mjs as text/plain, which browsers refuse to run as a module.
      pdfjs = await import('/vendor/pdfjs/pdf.min.js');
      pdfjs.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.js';
    }
    return pdfjs;
  }

  // Opens a PDF File. Throws pdf.js's PasswordException for locked files.
  async function open(file) {
    const lib = await load();
    return lib.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      // Needed for PDFs whose fonts are not embedded (common in older and Asian-language files).
      cMapUrl: '/vendor/pdfjs/cmaps/',
      cMapPacked: true,
      standardFontDataUrl: '/vendor/pdfjs/standard_fonts/',
    }).promise;
  }

  // Browsers refuse canvases past ~16k px a side or ~270M px in area (less on phones); a 300 DPI
  // render of a poster-size page would exceed that, so very large pages are scaled down to fit.
  const MAX_SIDE = 10000;
  const MAX_AREA = 40_000_000;

  // Renders page n onto the canvas at `scale` (1 = 72 DPI), turned by `extraRotation` degrees on
  // top of the page's own rotation. Pages get a white background (JPEG has no transparency).
  async function renderPage(doc, n, scale, canvas, extraRotation = 0) {
    const page = await doc.getPage(n);
    const rotation = (page.rotate + extraRotation + 360) % 360;
    const base = page.getViewport({ scale: 1, rotation });
    const fit = Math.min(scale, MAX_SIDE / Math.max(base.width, base.height), Math.sqrt(MAX_AREA / (base.width * base.height)));
    const viewport = page.getViewport({ scale: fit, rotation });
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    // 'print' draws the page as it would print, and — unlike the default 'display' intent — does
    // not pace itself with requestAnimationFrame, which browsers pause in background tabs.
    await page.render({ canvas, canvasContext: ctx, viewport, intent: 'print' }).promise;
    page.cleanup();
  }

  // Thumbnails for a grid of cards, each with data-page and an <img>. A card is drawn only when it
  // scrolls near the viewport, one at a time, into a small JPEG <img> rather than a live canvas,
  // so hundreds of pages stay light. A card's data-rotate (degrees) turns its thumbnail.
  function thumbnails(doc, width = 180) {
    const queue = [];
    const canvas = document.createElement('canvas');
    let busy = false;
    let stopped = false;
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        observer.unobserve(entry.target);
        queue.push(entry.target);
      }
      drain();
    }, { rootMargin: '400px' });

    async function drain() {
      if (busy) return;
      busy = true;
      while (queue.length && !stopped) {
        const card = queue.shift();
        try {
          const n = Number(card.dataset.page);
          const extra = Number(card.dataset.rotate || 0);
          const page = await doc.getPage(n);
          const rotated = page.getViewport({ scale: 1, rotation: (page.rotate + extra + 360) % 360 });
          await renderPage(doc, n, width / Math.max(rotated.width, rotated.height * 0.75), canvas, extra);
          if (stopped) break;
          const img = card.querySelector('img');
          img.src = canvas.toDataURL('image/jpeg', 0.7);
          img.classList.add('is-loaded');
        } catch (err) {
          console.error(err);
        }
      }
      busy = false;
    }

    return {
      watch(card) { observer.observe(card); },
      // Redraw a card already shown (e.g. after its rotation changed); jumps the queue.
      refresh(card) {
        queue.unshift(card);
        drain();
      },
      stop() {
        stopped = true;
        observer.disconnect();
        queue.length = 0;
      },
    };
  }

  return { open, renderPage, thumbnails };
})();
