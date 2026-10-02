// Shared page controller and in-browser video engine for the simple video tools (compress, trim,
// to MP3, to GIF, mute, rotate). Each tool's app.js calls VideoKit.mount() with one function that
// turns the chosen options into an engine command; picking, progress, errors and download live
// here. The watermark tool keeps its own copy of the engine in /app.js.
// ponytail: single-threaded engine, no COOP/COEP headers needed. The multi-threaded core is the
// upgrade if speed becomes the complaint (see /app.js).
(() => {
  const ENGINE_DIST = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';
  const ENGINE_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
  // The whole file sits in the engine's memory next to its output; phones get a lower limit.
  const MAX_FILE_MB = navigator.deviceMemory && navigator.deviceMemory <= 4 ? 300 : 700;

  let enginePromise = null;
  let progressSink = null; // (seconds of output written) => void
  let engineLog = [];

  function getEngine() {
    if (!enginePromise) {
      enginePromise = (async () => {
        const { FFmpeg } = await import(`${ENGINE_DIST}/index.js`);
        const engine = new FFmpeg();
        // Progress comes from the "time=" the engine logs for the output, which stays right when
        // only part of the input is used (trim, GIF), unlike its own ratio of the input length.
        engine.on('log', (event) => {
          const time = /time=(\d+):(\d+):([\d.]+)/.exec(event.message);
          if (time) progressSink?.(+time[1] * 3600 + +time[2] * 60 + +time[3]);
          engineLog.push(event.message);
          if (engineLog.length > 200) engineLog.shift();
        });
        // A worker cannot be built from another origin, so start it from a same-origin blob that
        // re-imports the real one.
        const shim = URL.createObjectURL(new Blob([`import "${ENGINE_DIST}/worker.js";`], { type: 'text/javascript' }));
        try {
          await engine.load({ classWorkerURL: shim, coreURL: `${ENGINE_CORE}/ffmpeg-core.js`, wasmURL: `${ENGINE_CORE}/ffmpeg-core.wasm` });
        } finally {
          URL.revokeObjectURL(shim);
        }
        return engine;
      })();
      enginePromise.catch(() => { enginePromise = null; });
    }
    return enginePromise;
  }

  // An error whose message is already fit to show the user.
  function userError(message) {
    const error = new Error(message);
    error.userFacing = true;
    return error;
  }

  async function run(engine, args) {
    engineLog = [];
    let code;
    try {
      code = await engine.exec(args);
    } catch (error) {
      // The instance itself died (out of memory); drop it so the next try starts fresh.
      enginePromise = null;
      try { engine.terminate(); } catch {}
      console.error(error);
      throw userError('Your device ran out of memory for this video. Try a shorter or smaller clip.');
    }
    if (code === 0) return;
    const log = engineLog.join('\n');
    console.error(log);
    if (/does not contain any stream|Output file .* does not contain|matches no streams/i.test(log)) {
      throw userError('This video has no sound track.');
    }
    if (/Invalid data found|could not find codec|Unknown format|moov atom not found/i.test(log)) {
      throw userError('This file could not be read as a video. It may be damaged or in an unsupported format.');
    }
    // A failed allocation right after a big job often succeeds on an immediate retry.
    engineLog = [];
    if (await engine.exec(args) !== 0) throw userError('This video could not be processed. Try a different file.');
  }

  function friendlyError(error, fallback) {
    if (error?.userFacing) return error.message;
    console.error(error);
    if (!navigator.onLine) return 'You appear to be offline. Check your internet connection and try again.';
    if (/fetch|network|module|import|load/i.test(error?.message || '')) {
      return 'Part of the tool did not load. Check your internet connection and refresh the page.';
    }
    return fallback;
  }

  function formatSize(bytes) {
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(seconds) {
    if (!Number.isFinite(seconds)) return '—';
    const s = Math.max(0, seconds);
    const m = Math.floor(s / 60);
    return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
  }

  // Accepts "75", "75.5", "1:15" or "1:15.5" and returns seconds, or NaN.
  function parseTime(text) {
    const parts = String(text).trim().split(':').map(Number);
    if (!parts.length || parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return NaN;
    return parts.reduce((total, n) => total * 60 + n, 0);
  }

  const extensionOf = (name) => (/\.([a-z0-9]+)$/i.exec(name || '')?.[1] || 'mp4').toLowerCase();
  const baseName = (name) => (name || 'video').replace(/\.[^.]+$/, '');

  // Reads size and duration with the browser's own decoder; null when it cannot play the file
  // (the engine still can, so that is not an error).
  function readMetadata(url) {
    return new Promise((resolve) => {
      const video = document.createElement('video');
      const timer = setTimeout(() => resolve(null), 6000);
      video.preload = 'metadata';
      video.muted = true;
      video.onloadedmetadata = () => {
        clearTimeout(timer);
        resolve(video.videoWidth ? { width: video.videoWidth, height: video.videoHeight, duration: Number.isFinite(video.duration) ? video.duration : 0 } : null);
      };
      video.onerror = () => { clearTimeout(timer); resolve(null); };
      video.src = url;
    });
  }

  // Asks the engine for duration and size when the browser cannot decode the file.
  async function probe(engine, inputName) {
    engineLog = [];
    try { await engine.exec(['-hide_banner', '-i', inputName]); } catch {}
    const log = engineLog.join('\n');
    const d = /Duration: (\d+):(\d+):([\d.]+)/.exec(log);
    const v = /Video: .*?, (\d{2,5})x(\d{2,5})/.exec(log);
    return {
      duration: d ? +d[1] * 3600 + +d[2] * 60 + +d[3] : 0,
      width: v ? +v[1] : 0,
      height: v ? +v[2] : 0,
    };
  }

  // tool: { build(ctx) -> { args, output, mime, fileName }, onReady?(ctx), validate?(ctx) -> string|undefined,
  //         preview: 'video' | 'audio' | 'image', busyLabel }
  function mount(tool) {
    const $ = (selector) => document.querySelector(selector);
    const el = {
      input: $('#fileInput'), dropzone: $('#dropzone'), assetCard: $('#assetCard'), assetName: $('#assetName'),
      assetMeta: $('#assetMeta'), replace: $('#replaceButton'), module: $('#editingModule'), player: $('#sourcePlayer'),
      process: $('#processButton'), processing: $('#processingCard'), label: $('#processingLabel'),
      detail: $('#processingDetail'), percent: $('#processingPercent'), bar: $('#progressBar'), result: $('#resultCard'),
      resultMeta: $('#resultMeta'), download: $('#downloadButton'), resultPreview: $('#resultPreview'),
      message: $('#inlineMessage'), toast: $('#toast'),
    };
    const ctx = { file: null, url: null, meta: null, player: el.player, formatTime, parseTime, baseName, extensionOf, userError };
    let resultUrl = null;
    let busy = false;
    let toastTimer;

    const showToast = (text) => {
      clearTimeout(toastTimer);
      el.toast.textContent = text;
      el.toast.classList.add('show', 'error');
      toastTimer = setTimeout(() => el.toast.classList.remove('show'), 4200);
    };
    const showMessage = (text, isError) => {
      el.message.textContent = text;
      el.message.classList.remove('is-hidden', 'is-error', 'is-success');
      el.message.classList.add(isError ? 'is-error' : 'is-success');
    };
    const clearResult = () => {
      if (resultUrl) URL.revokeObjectURL(resultUrl);
      resultUrl = null;
      el.result.classList.add('is-hidden');
      el.message.classList.add('is-hidden');
      el.resultPreview.replaceChildren();
    };
    const setProgress = (label, detail, ratio) => {
      el.label.textContent = label;
      el.detail.textContent = detail;
      const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
      el.percent.textContent = pct + '%';
      el.bar.style.width = pct + '%';
    };
    ctx.refresh = () => { el.process.disabled = busy || !ctx.file; clearResult(); };

    async function loadFile(file) {
      if (!file) return;
      if (busy) { showToast('Please wait for the current video to finish.'); return; }
      if (!file.type.startsWith('video/') && !/\.(mp4|mov|m4v|webm|mkv|avi|wmv|flv|3gp|mpeg|mpg|ts|ogv)$/i.test(file.name)) {
        showToast('Please choose a video file.');
        return;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        showToast(`This video is larger than ${MAX_FILE_MB} MB. Please choose a smaller file.`);
        return;
      }
      clearResult();
      if (ctx.url) URL.revokeObjectURL(ctx.url);
      ctx.file = file;
      ctx.url = URL.createObjectURL(file);
      ctx.meta = await readMetadata(ctx.url);
      el.player.src = ctx.url;
      el.assetName.textContent = file.name;
      el.assetMeta.textContent = formatSize(file.size) + (ctx.meta ? ` · ${ctx.meta.width}×${ctx.meta.height} · ${formatTime(ctx.meta.duration)}` : '');
      el.dropzone.classList.add('is-hidden');
      el.assetCard.classList.remove('is-hidden');
      el.module.classList.remove('is-hidden');
      tool.onReady?.(ctx);
      ctx.refresh();
    }

    async function process() {
      if (!ctx.file || busy) return;
      const problem = tool.validate?.(ctx);
      if (problem) { showMessage(problem, true); return; }
      busy = true;
      ctx.refresh();
      el.processing.classList.remove('is-hidden');
      setProgress(tool.busyLabel || 'Processing…', 'Loading the video engine (one-time download)', 0.02);
      const inputName = 'input.' + extensionOf(ctx.file.name);
      let engine;
      try {
        engine = await getEngine();
        setProgress(tool.busyLabel || 'Processing…', 'Reading your video', 0.05);
        await engine.writeFile(inputName, new Uint8Array(await ctx.file.arrayBuffer()));
        if (!ctx.meta || !ctx.meta.duration) {
          ctx.meta = { ...(ctx.meta || {}), ...(await probe(engine, inputName)) };
          // Ranges checked before the engine knew the length are checked again now.
          const problem = tool.validate?.(ctx);
          if (problem) throw userError(problem);
        }
        const job = tool.build({ ...ctx, input: inputName });
        const total = job.duration || ctx.meta.duration;
        progressSink = (seconds) => total && setProgress(tool.busyLabel || 'Processing…', `Working on your video · ${formatTime(seconds)} of ${formatTime(total)}`, 0.05 + Math.min(1, seconds / total) * 0.93);
        await run(engine, ['-hide_banner', ...job.args, job.output]);
        const data = await engine.readFile(job.output);
        if (!data.length) throw userError('This video could not be processed. Try a different file.');
        const blob = new Blob([data.buffer], { type: job.mime });
        resultUrl = URL.createObjectURL(blob);
        el.download.href = resultUrl;
        el.download.download = job.fileName;
        const ratio = blob.size / ctx.file.size;
        el.resultMeta.textContent = `${job.fileName} · ${formatSize(blob.size)}` +
          (tool.compareSize ? (ratio < 1 ? ` · ${Math.round((1 - ratio) * 100)}% smaller` : ' · not smaller than the original') : '');
        const preview = document.createElement(tool.preview === 'image' ? 'img' : tool.preview || 'video');
        preview.src = resultUrl;
        if (preview.tagName !== 'IMG') preview.controls = true;
        preview.alt = 'Result preview';
        el.resultPreview.replaceChildren(preview);
        setProgress('Done', 'Your file is ready', 1);
        el.result.classList.remove('is-hidden');
        if (tool.compareSize && ratio >= 1) showMessage('This video was already well compressed, so the new file is not smaller. Try a lower quality or resolution.', true);
      } catch (error) {
        showMessage(friendlyError(error, 'This video could not be processed. Try a different file.'), true);
      } finally {
        progressSink = null;
        // Free the engine's copies; the next run re-reads the file (writeFile detaches its buffer).
        if (engine) {
          for (const name of [inputName, 'out.mp4', 'out.mp3', 'out.gif', 'out.' + extensionOf(ctx.file.name)]) {
            try { await engine.deleteFile(name); } catch {}
          }
        }
        busy = false;
        el.processing.classList.add('is-hidden');
        el.process.disabled = !ctx.file;
      }
    }

    el.input.addEventListener('change', () => { loadFile(el.input.files[0]); el.input.value = ''; });
    el.replace.addEventListener('click', () => el.input.click());
    el.dropzone.addEventListener('dragover', (event) => { event.preventDefault(); el.dropzone.classList.add('is-dragging'); });
    el.dropzone.addEventListener('dragleave', () => el.dropzone.classList.remove('is-dragging'));
    el.dropzone.addEventListener('drop', (event) => {
      event.preventDefault();
      el.dropzone.classList.remove('is-dragging');
      loadFile(event.dataTransfer.files[0]);
    });
    el.process.addEventListener('click', process);
    return ctx;
  }

  // Start/end fields plus "set from the player" buttons, shared by Trim and Video to GIF.
  // defaultLength: seconds selected when a video loads (whole video when omitted).
  function bindRange(ctx, defaultLength) {
    const start = document.querySelector('#startTime');
    const end = document.querySelector('#endTime');
    document.querySelector('#setStart').addEventListener('click', () => { start.value = formatTime(ctx.player.currentTime); ctx.refresh(); });
    document.querySelector('#setEnd').addEventListener('click', () => { end.value = formatTime(ctx.player.currentTime); ctx.refresh(); });
    for (const field of [start, end]) field.addEventListener('change', ctx.refresh);
    return {
      reset() {
        const duration = ctx.meta?.duration || 0;
        start.value = formatTime(0);
        end.value = formatTime(defaultLength && duration ? Math.min(defaultLength, duration) : duration || defaultLength || 0);
      },
      // [start, end] in seconds, or a message saying what is wrong.
      read(maxLength) {
        const s = parseTime(start.value), e = parseTime(end.value), duration = ctx.meta?.duration || Infinity;
        if (Number.isNaN(s) || Number.isNaN(e)) return 'Enter times as minutes:seconds, for example 1:05.5.';
        if (e <= s) return 'The end must be after the start.';
        if (s >= duration) return `The start is past the end of the video (${formatTime(duration)}).`;
        if (maxLength && Math.min(e, duration) - s > maxLength + 0.05) return `Choose a part up to ${maxLength} seconds long.`;
        return [s, Math.min(e, duration)];
      },
    };
  }

  window.VideoKit = { mount, bindRange, formatTime, parseTime };
})();
