const $ = (selector) => document.querySelector(selector);

const videoInput = $('#videoInput');
const dropzone = $('#dropzone');
const assetCard = $('#assetCard');
const assetName = $('#assetName');
const assetMeta = $('#assetMeta');
const replaceButton = $('#replaceButton');
const editingModule = $('#editingModule');
const previewStatus = $('#previewStatus');
const compareEmpty = $('#compareEmpty');
const compareGrid = $('#compareGrid');
const beforeFrame = $('#beforeFrame');
const afterFrame = $('#afterFrame');
const frameReadout = $('#frameReadout');
const presetGrid = $('#presetGrid');
const sizeBlock = $('#sizeBlock');
const sizeGrid = $('#sizeGrid');
const processButton = $('#processButton');
const processingCard = $('#processingCard');
const processingMessage = $('#processingMessage');
const progressBar = $('#progressBar');
const progressValue = $('#progressValue');
const resultCard = $('#resultCard');
const resultMeta = $('#resultMeta');
const resultVideo = $('#resultVideo');
const downloadButton = $('#downloadButton');
const toast = $('#toast');

const ACCEPTED = /\.(mp4|mov|m4v|webm|avi|mkv|wmv)$/i;
// The engine holds the whole file in WebAssembly memory, which tops out well below this.
const MAX_BYTES = 1024 * 1024 * 1024;

const state = {
  file: null,
  asset: null,
  engineInput: null,
  busy: false,
  previewQueued: false,
  previewUrls: [],
  resultUrl: null,
};

// Each preset is one chain of standard ffmpeg filters. Measured against a clean reference,
// any sharpening left noisy footage worse than untouched and put halos on clean footage, so
// only the soft-footage preset sharpens. Chroma is never sharpened: it fringes edges.
const PRESETS = {
  auto: {
    denoise: 'hqdn3d=6:4.5:9:6.75',
    color: 'eq=contrast=1.05:saturation=1.1',
  },
  lowlight: {
    denoise: 'hqdn3d=8:6:12:9',
    color: 'eq=brightness=0.05:contrast=1.08:gamma=1.2:saturation=1.05',
  },
  soft: {
    sharpen: 'unsharp=5:5:1.5:5:5:0',
    color: 'eq=contrast=1.04',
  },
  old: {
    deinterlace: 'yadif=deint=interlaced',
    denoise: 'hqdn3d=8:6:12:9',
    color: 'eq=contrast=1.12:saturation=1.15',
  },
};

// Upscale targets are measured on the short side, so a vertical 1080p video is 1080 wide.
// Only sizes larger than the source are offered; the tool never downscales.
function outputSizes(width, height) {
  const shortSide = Math.min(width, height);
  return [720, 1080].filter((target) => target > shortSide);
}

// Order matters: denoising before the upscale is cheaper and avoids enlarging the noise, and
// sharpening after it works at the final resolution.
function buildEnhanceFilter(presetName, width, height, target) {
  const preset = PRESETS[presetName];
  if (!preset) throw new Error(`Unknown preset: ${presetName}`);
  const chain = [];
  if (preset.deinterlace) chain.push(preset.deinterlace);
  if (preset.denoise) chain.push(preset.denoise);
  if (target && target > Math.min(width, height)) {
    chain.push(width >= height ? `scale=-2:${target}:flags=lanczos` : `scale=${target}:-2:flags=lanczos`);
  } else if (width % 2 || height % 2) {
    // yuv420p output needs even dimensions; trim the odd pixel rather than resample.
    chain.push('crop=trunc(iw/2)*2:trunc(ih/2)*2');
  }
  if (preset.sharpen) chain.push(preset.sharpen);
  chain.push(preset.color);
  return chain.join(',');
}

function scaledSize(width, height, target) {
  if (!target || target <= Math.min(width, height)) return [width - (width % 2), height - (height % 2)];
  const even = (value) => Math.round(value / 2) * 2;
  return width >= height ? [even((width * target) / height), target] : [target, even((height * target) / width)];
}

// Same sampling rule as the metadata reader: the very first frame is often black.
function previewTime(duration) {
  return Number.isFinite(duration) && duration > 1 ? Math.min(0.5, duration / 3) : 0;
}

let toastTimer;

function showToast(message, isError = false) {
  window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle('error', isError);
  toast.classList.add('show');
  toastTimer = window.setTimeout(() => toast.classList.remove('show'), 4200);
}

function setPreviewStatus(label, kind = '') {
  previewStatus.className = `preview-status ${kind}`.trim();
  const dot = document.createElement('span');
  dot.className = 'status-dot';
  const text = document.createElement('span');
  text.textContent = label;
  previewStatus.replaceChildren(dot, text);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return 'duration unknown';
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  const remainder = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.max(1, Math.round(bytes / (1024 * 1024)))} MB`;
}

// ---------------------------------------------------------------------------
// Engine code below is copied from /app.js, which cannot be loaded here: it binds the
// watermark page's elements at top level and throws on any other page.
// ponytail: move this into a shared module if a third ffmpeg tool is added.
const FFMPEG_DIST = 'https://cdn.jsdelivr.net/npm/@ffmpeg/ffmpeg@0.12.15/dist/esm';
const FFMPEG_CORE = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';

let enginePromise = null;
let progressSink = null;
let lastEngineLog = '';

function getEngine(onMessage) {
  if (!enginePromise) {
    enginePromise = (async () => {
      onMessage?.('Loading the video engine (one-time download)…');
      const { FFmpeg } = await import(`${FFMPEG_DIST}/index.js`);
      const engine = new FFmpeg();
      engine.on('progress', (event) => progressSink?.(event.progress));
      engine.on('log', (event) => { lastEngineLog = event.message; });
      // A worker cannot be constructed from another origin, so it is started from a same-origin
      // blob that re-imports the real one.
      const workerShim = URL.createObjectURL(
        new Blob([`import "${FFMPEG_DIST}/worker.js";`], { type: 'text/javascript' })
      );
      try {
        await engine.load({
          classWorkerURL: workerShim,
          coreURL: `${FFMPEG_CORE}/ffmpeg-core.js`,
          wasmURL: `${FFMPEG_CORE}/ffmpeg-core.wasm`,
        });
      } finally {
        URL.revokeObjectURL(workerShim);
      }
      return engine;
    })();
    enginePromise.catch(() => { enginePromise = null; });
  }
  return enginePromise;
}

function extensionOf(name) {
  const match = /\.[a-z0-9]+$/i.exec(name || '');
  return match ? match[0].toLowerCase() : '.mp4';
}

async function runEngine(engine, args) {
  lastEngineLog = '';
  const code = await engine.exec(args);
  if (code !== 0) throw new Error(lastEngineLog || 'The video engine could not process this file.');
}

function readVideoMetadata(file) {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);
    let settled = false;
    const finish = (action) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
      action();
    };
    const capture = () => {
      if (!video.videoWidth || !video.videoHeight) {
        finish(() => reject(new Error('This video cannot be decoded by the browser.')));
        return;
      }
      const duration = Number.isFinite(video.duration) ? video.duration : 0;
      finish(() => resolve({ width: video.videoWidth, height: video.videoHeight, duration }));
    };
    const timer = window.setTimeout(capture, 4000);
    video.preload = 'metadata';
    video.muted = true;
    video.onloadedmetadata = capture;
    video.onerror = () => finish(() => reject(new Error('This video cannot be decoded by the browser.')));
    video.src = url;
  });
}

// Fallback for AVI, MKV and WMV, which browsers generally refuse to decode.
async function readVideoMetadataWithEngine(file, onMessage) {
  const engine = await getEngine(onMessage);
  const input = `probe${extensionOf(file.name)}`;
  onMessage?.('Reading the first frame…');
  await engine.writeFile(input, new Uint8Array(await file.arrayBuffer()));
  try {
    await runEngine(engine, ['-i', input, '-frames:v', '1', 'probe.png']);
    const png = await engine.readFile('probe.png');
    const bitmap = await createImageBitmap(new Blob([png], { type: 'image/png' }));
    const size = { width: bitmap.width, height: bitmap.height, duration: 0 };
    bitmap.close();
    return size;
  } finally {
    await engine.deleteFile(input).catch(() => {});
    await engine.deleteFile('probe.png').catch(() => {});
  }
}
// ---------------------------------------------------------------------------

function setBusy(busy) {
  state.busy = busy;
  processButton.disabled = busy || !state.asset;
  replaceButton.disabled = busy;
}

function currentSettings() {
  return {
    preset: document.querySelector('input[name="preset"]:checked')?.value || 'auto',
    target: Number(document.querySelector('input[name="size"]:checked')?.value || 0),
  };
}

// The source is written to the engine once and shared by every preview and the export.
async function ensureInput(engine) {
  if (state.engineInput) return state.engineInput;
  const name = `source${extensionOf(state.file.name)}`;
  await engine.writeFile(name, new Uint8Array(await state.file.arrayBuffer()));
  state.engineInput = name;
  return name;
}

async function releaseInput() {
  const name = state.engineInput;
  state.engineInput = null;
  if (!name || !enginePromise) return;
  const engine = await enginePromise.catch(() => null);
  await engine?.deleteFile(name).catch(() => {});
}

function renderSizeOptions() {
  const { width, height } = state.asset;
  const sizes = outputSizes(width, height);
  sizeBlock.classList.toggle('is-hidden', sizes.length === 0);
  sizeGrid.replaceChildren(...[0, ...sizes].map((target, index) => {
    const [outW, outH] = scaledSize(width, height, target);
    const label = document.createElement('label');
    label.className = 'mode-option';
    label.innerHTML = '<input type="radio" name="size"><span class="mode-symbol"></span><span><strong></strong><small></small></span><span class="radio-dot"></span>';
    const input = label.querySelector('input');
    input.value = String(target);
    input.checked = index === 0;
    label.querySelector('.mode-symbol').textContent = target ? '⤢' : '▭';
    label.querySelector('strong').textContent = target ? `${target}p` : 'Original size';
    label.querySelector('small').textContent = `${outW} × ${outH}`;
    return label;
  }));
}

function showCompare(beforeBlob, afterBlob) {
  for (const url of state.previewUrls) URL.revokeObjectURL(url);
  state.previewUrls = [URL.createObjectURL(beforeBlob), URL.createObjectURL(afterBlob)];
  [beforeFrame.src, afterFrame.src] = state.previewUrls;
  compareEmpty.classList.add('is-hidden');
  compareGrid.classList.remove('is-hidden');
}

function resetOutputs() {
  for (const url of state.previewUrls) URL.revokeObjectURL(url);
  state.previewUrls = [];
  compareGrid.classList.add('is-hidden');
  compareEmpty.classList.remove('is-hidden');
  frameReadout.textContent = '—';
  resultCard.classList.add('is-hidden');
  processingCard.classList.add('is-hidden');
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = null;
  resultVideo.removeAttribute('src');
}

async function loadFile(file) {
  if (!file) return;
  if (state.busy) {
    showToast('Wait for the current task to finish first.', true);
    return;
  }
  if (!ACCEPTED.test(file.name) && !file.type.startsWith('video/')) {
    showToast('Choose a video file: MP4, MOV, WebM, AVI, MKV or WMV.', true);
    return;
  }
  if (file.size > MAX_BYTES) {
    showToast('This video is over 1 GB, which is more than the in-browser engine can hold.', true);
    return;
  }

  setBusy(true);
  try {
    await releaseInput();
    resetOutputs();
    editingModule.classList.remove('is-hidden');
    setPreviewStatus('Reading video…', 'working');
    let asset;
    try {
      asset = await readVideoMetadata(file);
    } catch {
      asset = await readVideoMetadataWithEngine(file, (message) => setPreviewStatus(message, 'working'));
    }
    state.file = file;
    state.asset = asset;
    assetName.textContent = file.name;
    assetMeta.textContent = `${asset.width} × ${asset.height} · ${formatDuration(asset.duration)} · ${formatSize(file.size)}`;
    assetCard.classList.remove('is-hidden');
    dropzone.classList.add('is-hidden');
    renderSizeOptions();
  } catch (error) {
    setPreviewStatus('Could not read video', 'error');
    showToast(error.message || 'This video could not be opened.', true);
    return;
  } finally {
    setBusy(false);
  }
  renderPreview();
}

// Renders the same frame before and after in one engine run, so the pair always matches.
// Setting changes made while a render is running are queued rather than dropped.
async function renderPreview() {
  if (!state.asset) return;
  if (state.busy) {
    state.previewQueued = true;
    return;
  }
  state.previewQueued = false;
  setBusy(true);
  const { preset, target } = currentSettings();
  let engine = null;
  try {
    engine = await getEngine((message) => setPreviewStatus(message, 'working'));
    setPreviewStatus('Rendering preview…', 'working');
    const input = await ensureInput(engine);
    const chain = buildEnhanceFilter(preset, state.asset.width, state.asset.height, target);
    const time = previewTime(state.asset.duration);
    // Frames before `time` are dropped after filtering rather than skipped with -ss: hqdn3d's
    // temporal pass needs the frames leading up to the preview, and a seeked single frame
    // showed a fraction of the denoising the export actually applies.
    const skip = `trim=start=${time}`;
    await runEngine(engine, [
      '-i', input,
      '-filter_complex', `[0:v]split[o][b];[o]${skip}[before];[b]${chain},${skip}[after]`,
      '-map', '[before]', '-frames:v', '1', 'before.png',
      '-map', '[after]', '-frames:v', '1', 'after.png',
    ]);
    const before = await engine.readFile('before.png');
    const after = await engine.readFile('after.png');
    showCompare(new Blob([before], { type: 'image/png' }), new Blob([after], { type: 'image/png' }));
    frameReadout.textContent = `Frame at ${time.toFixed(1)} s`;
    setPreviewStatus('Preview ready', 'ready');
  } catch (error) {
    setPreviewStatus('Preview failed', 'error');
    showToast(error.message || 'Could not render a preview.', true);
  } finally {
    if (engine) {
      await engine.deleteFile('before.png').catch(() => {});
      await engine.deleteFile('after.png').catch(() => {});
    }
    setBusy(false);
    if (state.previewQueued) renderPreview();
  }
}

function setProgress(ratio) {
  const percent = Math.max(0, Math.min(100, Math.round((ratio || 0) * 100)));
  progressBar.style.width = `${percent}%`;
  progressValue.textContent = `${percent}%`;
}

async function enhanceVideo() {
  if (!state.asset || state.busy) return;
  setBusy(true);
  const { preset, target } = currentSettings();
  const { width, height } = state.asset;
  processingCard.classList.remove('is-hidden');
  resultCard.classList.add('is-hidden');
  setProgress(0);
  let engine = null;
  try {
    engine = await getEngine((message) => { processingMessage.textContent = message; });
    processingMessage.textContent = 'Reading your video…';
    const input = await ensureInput(engine);
    processingMessage.textContent = 'Enhancing frames…';
    progressSink = setProgress;
    await runEngine(engine, [
      '-i', input,
      '-fps_mode', 'passthrough',
      '-vf', buildEnhanceFilter(preset, width, height, target),
      '-map', '0:v:0',
      '-map', '0:a?',
      // CRF 18 rather than the watermark tool's 23: a lossier encode would throw away the
      // detail the filters just recovered.
      '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-movflags', '+faststart',
      'enhanced.mp4',
    ]);
    const data = await engine.readFile('enhanced.mp4');
    showResult(new Blob([data], { type: 'video/mp4' }), scaledSize(width, height, target));
  } catch (error) {
    processingCard.classList.add('is-hidden');
    showToast(error.message || 'Could not enhance this video.', true);
  } finally {
    progressSink = null;
    if (engine) await engine.deleteFile('enhanced.mp4').catch(() => {});
    setBusy(false);
    if (state.previewQueued) renderPreview();
  }
}

function showResult(blob, [width, height]) {
  processingCard.classList.add('is-hidden');
  setProgress(1);
  if (state.resultUrl) URL.revokeObjectURL(state.resultUrl);
  state.resultUrl = URL.createObjectURL(blob);
  resultVideo.src = state.resultUrl;
  const name = `enhanced-${state.file.name.replace(/\.[^.]+$/, '')}.mp4`;
  downloadButton.href = state.resultUrl;
  downloadButton.setAttribute('download', name);
  resultMeta.textContent = `MP4 · ${width} × ${height} · ${formatSize(blob.size)}`;
  resultCard.classList.remove('is-hidden');
  showToast('Done — your enhanced video is ready.');
}

videoInput.addEventListener('change', () => {
  const [file] = videoInput.files || [];
  videoInput.value = '';
  loadFile(file);
});

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

replaceButton.addEventListener('click', () => videoInput.click());
presetGrid.addEventListener('change', renderPreview);
sizeGrid.addEventListener('change', renderPreview);
processButton.addEventListener('click', enhanceVideo);
