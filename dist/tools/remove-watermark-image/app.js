const imageInput = document.getElementById('imageInput');
const previewStage = document.getElementById('previewStage');
const emptyPreview = document.getElementById('emptyPreview');
const imageCanvasWrap = document.getElementById('imageCanvasWrap');
const imageCanvas = document.getElementById('imageCanvas');
const selectionInfo = document.getElementById('selectionInfo');
const clearSelectionButton = document.getElementById('clearSelection');
const resetImageButton = document.getElementById('resetImage');
const processButton = document.getElementById('processButton');
const processingState = document.getElementById('processingState');
const processingLabel = document.getElementById('processingLabel');
const errorBox = document.getElementById('errorBox');
const resultPanel = document.getElementById('resultPanel');
const beforePreview = document.getElementById('beforePreview');
const afterPreview = document.getElementById('afterPreview');
const downloadLink = document.getElementById('downloadLink');


const ctx = imageCanvas.getContext('2d');

const state = {
  image: null,
  selection: null,
  drawing: false,
  start: null,
  processing: false,
  originalDataUrl: '',
  processedDataUrl: '',
  fileName: '',
};

function showError(message) {
  errorBox.textContent = message;
  errorBox.classList.remove('is-hidden');
}

function clearError() {
  errorBox.textContent = '';
  errorBox.classList.add('is-hidden');
}

function setProcessing(active, message = 'Processing…') {
  state.processing = active;
  processingState.classList.toggle('is-hidden', !active);
  processingLabel.textContent = message;
  processButton.disabled = active || !state.image || !state.selection;
}

function drawImageToCanvas() {
  if (!state.image) return;
  const image = state.image;
  const maxWidth = Math.min(window.innerWidth - 120, 980);
  const ratio = Math.min(1, maxWidth / image.width);
  const width = Math.max(200, Math.round(image.width * ratio));
  const height = Math.round(image.height * ratio);
  imageCanvas.width = width;
  imageCanvas.height = height;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);
  if (state.selection) {
    const s = state.selection;
    const x = s.x * width;
    const y = s.y * height;
    const w = s.w * width;
    const h = s.h * height;
    ctx.strokeStyle = '#7dd3fc';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(125,211,252,0.18)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);
  }
}

function updateSelectionInfo() {
  if (!state.selection) {
    selectionInfo.classList.add('is-hidden');
    return;
  }
  const rect = state.selection;
  selectionInfo.textContent = `Selection: ${Math.round(rect.w * 100)}% × ${Math.round(rect.h * 100)}%`;
  selectionInfo.classList.remove('is-hidden');
}

function resetSelection() {
  state.selection = null;
  drawImageToCanvas();
  updateSelectionInfo();
  processButton.disabled = true;
}

function getPointerPosition(event) {
  const rect = imageCanvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) / rect.width;
  const y = (event.clientY - rect.top) / rect.height;
  return { x: Math.min(1, Math.max(0, x)), y: Math.min(1, Math.max(0, y)) };
}

imageInput.addEventListener('change', (event) => {
  const [file] = event.target.files || [];
  if (!file) return;
  clearError();
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(file.type) && !/\.(jpg|jpeg|png|webp)$/i.test(file.name)) {
    showError('Unsupported file type. Please upload JPG, JPEG, PNG, or WEBP.');
    return;
  }
  if (file.size > 25 * 1024 * 1024) {
    showError('Image file is too large. Please upload an image under 25 MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const img = new Image();
    img.onload = () => {
      state.image = img;
      state.originalDataUrl = reader.result;
      state.fileName = file.name;
      state.selection = null;
      emptyPreview.classList.add('is-hidden');
      imageCanvasWrap.classList.remove('is-hidden');
      drawImageToCanvas();
      updateSelectionInfo();
      processButton.disabled = true;
      resultPanel.classList.add('is-hidden');
      // Clearing the input lets the same file be picked again; otherwise the value is
      // unchanged, no change event fires, and the previous image stays on screen.
      imageInput.value = '';
    };
    img.onerror = () => {
      imageInput.value = '';
      showError('That image could not be opened. Try a different JPG, PNG, or WEBP file.');
    };
    img.src = reader.result;
  };
  reader.onerror = () => showError('That image could not be read. Please try again.');
  reader.readAsDataURL(file);
});

clearSelectionButton.addEventListener('click', () => {
  resetSelection();
});

resetImageButton.addEventListener('click', () => {
  imageInput.value = '';
  state.image = null;
  state.selection = null;
  state.originalDataUrl = '';
  state.processedDataUrl = '';
  state.fileName = '';
  emptyPreview.classList.remove('is-hidden');
  imageCanvasWrap.classList.add('is-hidden');
  resultPanel.classList.add('is-hidden');
  clearError();
});

imageCanvas.addEventListener('pointerdown', (event) => {
  if (!state.image || state.processing) return;
  event.preventDefault();
  imageCanvas.setPointerCapture?.(event.pointerId);
  const { x, y } = getPointerPosition(event);
  state.drawing = true;
  state.start = { x, y };
  state.selection = null;
});

imageCanvas.addEventListener('pointermove', (event) => {
  if (!state.image || !state.drawing || state.processing) return;
  event.preventDefault();
  const current = getPointerPosition(event);
  const x1 = state.start.x;
  const y1 = state.start.y;
  let x = Math.min(x1, current.x);
  let y = Math.min(y1, current.y);
  let w = Math.abs(current.x - x1);
  let h = Math.abs(current.y - y1);
  if (w < 0.02 || h < 0.02) {
    state.selection = null;
    drawImageToCanvas();
    return;
  }
  state.selection = { x, y, w, h };
  drawImageToCanvas();
  updateSelectionInfo();
  processButton.disabled = false;
});

imageCanvas.addEventListener('pointerup', (event) => {
  if (!state.image || !state.drawing) return;
  event.preventDefault();
  state.drawing = false;
  if (!state.selection) {
    processButton.disabled = true;
    return;
  }
  const { w, h } = state.selection;
  if (w < 0.02 || h < 0.02) {
    state.selection = null;
    processButton.disabled = true;
    return;
  }
  updateSelectionInfo();
  processButton.disabled = false;
});

imageCanvas.addEventListener('pointercancel', () => {
  if (!state.drawing) return;
  state.drawing = false;
  state.selection = null;
  drawImageToCanvas();
  updateSelectionInfo();
  processButton.disabled = true;
});

imageCanvas.addEventListener('pointerleave', () => {
  if (!state.image || !state.drawing) return;
  state.drawing = false;
  if (state.selection) {
    processButton.disabled = false;
  }
});

// Clamps the drawn selection to whole pixels inside the image.
function selectionToBox(selection, width, height) {
  const sx = Math.min(width - 1, Math.max(0, Math.floor(selection.x * width)));
  const sy = Math.min(height - 1, Math.max(0, Math.floor(selection.y * height)));
  const sw = Math.max(1, Math.min(width - sx, Math.ceil(selection.w * width)));
  const sh = Math.max(1, Math.min(height - sy, Math.ceil(selection.h * height)));
  return { sx, sy, sw, sh };
}

function selectionToOriginalBox(selection, originalWidth, originalHeight) {
  const x = Number.isFinite(selection.x) ? selection.x : 0;
  const y = Number.isFinite(selection.y) ? selection.y : 0;
  const w = Number.isFinite(selection.w) ? selection.w : 0;
  const h = Number.isFinite(selection.h) ? selection.h : 0;

  const sx = Math.min(originalWidth - 1, Math.max(0, Math.floor(x * originalWidth)));
  const sy = Math.min(originalHeight - 1, Math.max(0, Math.floor(y * originalHeight)));
  const sw = Math.max(1, Math.min(originalWidth - sx, Math.ceil(w * originalWidth)));
  const sh = Math.max(1, Math.min(originalHeight - sy, Math.ceil(h * originalHeight)));
  return { sx, sy, sw, sh };
}

function clampMaskBox(box, width, height) {
  const sx = Math.max(0, box.sx);
  const sy = Math.max(0, box.sy);
  const sw = Math.max(1, Math.min(width - sx, box.sw));
  const sh = Math.max(1, Math.min(height - sy, box.sh));
  return { sx, sy, sw, sh };
}

function buildInpaintMask(width, height, box, expansion = 3) {
  const safe = clampMaskBox(box, width, height);
  const radius = Math.max(1, Math.min(12, Math.round(Math.min(safe.sw, safe.sh) * 0.08) + expansion));
  const x1 = Math.max(0, safe.sx - radius);
  const y1 = Math.max(0, safe.sy - radius);
  const x2 = Math.min(width - 1, safe.sx + safe.sw + radius - 1);
  const y2 = Math.min(height - 1, safe.sy + safe.sh + radius - 1);

  const mask = new Uint8ClampedArray(width * height);
  for (let y = y1; y <= y2; y += 1) {
    for (let x = x1; x <= x2; x += 1) {
      const inside = x >= safe.sx && x < safe.sx + safe.sw && y >= safe.sy && y < safe.sy + safe.sh;
      if (inside || (x >= safe.sx - radius && x <= safe.sx + safe.sw + radius && y >= safe.sy - radius && y <= safe.sy + safe.sh + radius)) {
        mask[y * width + x] = 255;
      }
    }
  }
  return { mask, x1, y1, x2, y2 };
}

function loadOpenCV() {
  return new Promise((resolve, reject) => {
    if (window.cv && window.cv.imread) {
      resolve(window.cv);
      return;
    }

    const existing = document.getElementById('opencv-script');
    if (existing) {
      existing.addEventListener('load', () => resolve(window.cv), { once: true });
      existing.addEventListener('error', () => reject(new Error('OpenCV failed to load.')), { once: true });
      return;
    }

    const script = document.createElement('script');
    script.id = 'opencv-script';
    script.src = '/vendor/opencv.js';
    script.async = true;
    script.onload = () => {
      if (window.cv && window.cv.imread) {
        resolve(window.cv);
      } else {
        reject(new Error('OpenCV did not initialize correctly.'));
      }
    };
    script.onerror = () => reject(new Error('OpenCV failed to load from the local static bundle.'));
    document.head.appendChild(script);
  });
}

// These four constants trade quality against time. Each step of the fill compares every
// candidate patch against the target, so the cost is roughly
//   (selection area / patch area) x (source band area / stride²) x (patch area / step²).
// The values below keep a full-width watermark on a large photo to a few seconds.
// Smaller patches leave finer detail and less visible blocking; larger ones are faster.
const PATCH_RADIUS = 4;
// How far around the selection to look for matching texture. Wider finds better matches but
// costs proportionally more, and distant texture rarely belongs next to the hole anyway.
const SOURCE_MARGIN = 28;
// Only every other pixel of a patch is compared when matching.
const COMPARE_STEP = 2;
// Candidate patches are sampled on this grid and the winner is then refined pixel by pixel.
const CANDIDATE_STRIDE = 2;
// How strongly a new patch is blended over pixels an earlier patch already filled. Copying
// straight over them leaves the rectangular seams that give patch fills their tiled look.
const BLEND_STRENGTH = 0.55;
// Penalty per sample for each pixel of vertical distance between a candidate and its target,
// squared. Photographs are stratified by height — sky above, ground below — so a distant
// vertical match needs to be much better to win. Without it the most textured side of a
// selection creeps across boundaries like a horizon.
const VERTICAL_BIAS = 0.05;

// True when every pixel of the patch centred on (cx, cy) came from the original image.
function patchIsSource(origKnown, width, height, cx, cy) {
  if (cx < PATCH_RADIUS || cy < PATCH_RADIUS || cx >= width - PATCH_RADIUS || cy >= height - PATCH_RADIUS) return false;
  for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy += 1) {
    for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx += 1) {
      if (!origKnown[(cy + dy) * width + (cx + dx)]) return false;
    }
  }
  return true;
}

// Last resort when the selection leaves no intact area to copy from: average its border.
function fillWithBorderAverage(pixels, width, height, box) {
  const { sx, sy, sw, sh } = box;
  const totals = [0, 0, 0];
  let count = 0;
  for (let x = sx; x < sx + sw; x += 1) {
    for (const y of [sy - 1, sy + sh]) {
      if (y < 0 || y >= height) continue;
      const i = (y * width + x) * 4;
      totals[0] += pixels[i]; totals[1] += pixels[i + 1]; totals[2] += pixels[i + 2];
      count += 1;
    }
  }
  for (let y = sy; y < sy + sh; y += 1) {
    for (const x of [sx - 1, sx + sw]) {
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      totals[0] += pixels[i]; totals[1] += pixels[i + 1]; totals[2] += pixels[i + 2];
      count += 1;
    }
  }
  if (!count) return;
  const average = totals.map((value) => Math.round(value / count));
  for (let y = sy; y < sy + sh; y += 1) {
    for (let x = sx; x < sx + sw; x += 1) {
      const i = (y * width + x) * 4;
      pixels[i] = average[0]; pixels[i + 1] = average[1]; pixels[i + 2] = average[2];
    }
  }
}

// Removes the selection by exemplar-based inpainting (Criminisi et al.): the fill front is
// walked in priority order rather than uniformly inward, and whole patches are copied from the
// intact surroundings.
//
// Priority is confidence (how much of a patch is already settled) times the data term (how
// strongly an edge runs into the front there), so edges such as a horizon are extended across
// the hole before the flat areas either side are filled. Filling uniformly instead lets the
// most textured side win every match and bulge across such a boundary, and interpolating from
// the four border pixels — what delogo does — smears any texture into streaks.
// ponytail: strided exhaustive patch search, no pyramid or PatchMatch; revisit if selections
// on large photos feel slow.
function inpaintRegion(pixels, width, height, box) {
  const { sx, sy, sw, sh } = box;
  const total = width * height;
  const origKnown = new Uint8Array(total).fill(1);
  for (let y = sy; y < sy + sh; y += 1) {
    for (let x = sx; x < sx + sw; x += 1) origKnown[y * width + x] = 0;
  }

  const candidates = [];
  const searchX0 = Math.max(PATCH_RADIUS, sx - SOURCE_MARGIN);
  const searchX1 = Math.min(width - 1 - PATCH_RADIUS, sx + sw + SOURCE_MARGIN);
  const searchY0 = Math.max(PATCH_RADIUS, sy - SOURCE_MARGIN);
  const searchY1 = Math.min(height - 1 - PATCH_RADIUS, sy + sh + SOURCE_MARGIN);
  for (let y = searchY0; y <= searchY1; y += CANDIDATE_STRIDE) {
    for (let x = searchX0; x <= searchX1; x += CANDIDATE_STRIDE) {
      if (patchIsSource(origKnown, width, height, x, y)) candidates.push(y * width + x);
    }
  }
  if (!candidates.length) {
    fillWithBorderAverage(pixels, width, height, box);
    return;
  }

  const known = origKnown.slice();
  const confidence = Float32Array.from(origKnown);
  const grey = (index) => {
    const i = index * 4;
    return 0.299 * pixels[i] + 0.587 * pixels[i + 1] + 0.114 * pixels[i + 2];
  };

  let remaining = sw * sh;
  while (remaining > 0) {
    // Pick the point on the fill front with the highest priority.
    let bestPriority = -1;
    let frontIndex = -1;
    let frontConfidence = 0;
    for (let y = sy; y < sy + sh; y += 1) {
      for (let x = sx; x < sx + sw; x += 1) {
        const i = y * width + x;
        if (known[i]) continue;
        const onFront = (x > 0 && known[i - 1]) || (x < width - 1 && known[i + 1])
          || (y > 0 && known[i - width]) || (y < height - 1 && known[i + width]);
        if (!onFront) continue;

        let settled = 0;
        let cells = 0;
        // Strongest edge in the patch, measured only where every pixel involved is settled.
        // Unfilled pixels still hold the watermark, so including them would steer the fill by
        // the mark being removed rather than by the picture around it.
        let strongest = 0;
        let edgeX = 0;
        let edgeY = 0;
        for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy += 1) {
          const py = y + dy;
          if (py < 0 || py >= height - 1) continue;
          for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx += 1) {
            const px = x + dx;
            if (px < 0 || px >= width - 1) continue;
            const qi = py * width + px;
            settled += confidence[qi];
            cells += 1;
            if (!known[qi] || !known[qi + 1] || !known[qi + width]) continue;
            const here = grey(qi);
            const gradientX = grey(qi + 1) - here;
            const gradientY = grey(qi + width) - here;
            const magnitude = gradientX * gradientX + gradientY * gradientY;
            if (magnitude > strongest) {
              strongest = magnitude;
              edgeX = gradientX;
              edgeY = gradientY;
            }
          }
        }
        const patchConfidence = cells ? settled / cells : 0;

        // Isophote (the direction the edge runs, across the gradient) against the normal of
        // the fill front. Edges pointing into the hole get filled first and so stay straight.
        const left = Math.max(0, x - 1);
        const right = Math.min(width - 1, x + 1);
        const up = Math.max(0, y - 1);
        const down = Math.min(height - 1, y + 1);
        const normalX = known[y * width + right] - known[y * width + left];
        const normalY = known[down * width + x] - known[up * width + x];
        const normalLength = Math.hypot(normalX, normalY) || 1;
        const data = Math.abs(-edgeY * (normalX / normalLength) + edgeX * (normalY / normalLength)) / 255;

        // The floor keeps flat areas progressing once every edge has been carried across.
        const priority = patchConfidence * (data + 0.001);
        if (priority > bestPriority) {
          bestPriority = priority;
          frontIndex = i;
          frontConfidence = patchConfidence;
        }
      }
    }
    if (frontIndex < 0) break;

    const tx = frontIndex % width;
    const ty = (frontIndex - tx) / width;

    // Positions inside the target patch that are already settled. The set is the same for
    // every candidate, so raw sums compare directly and a candidate can be abandoned as soon
    // as it is worse than the best so far.
    const sampleTarget = [];
    const sampleOffset = [];
    for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy += COMPARE_STEP) {
      const py = ty + dy;
      if (py < 0 || py >= height) continue;
      for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx += COMPARE_STEP) {
        const px = tx + dx;
        if (px < 0 || px >= width) continue;
        const targetIndex = py * width + px;
        if (!known[targetIndex]) continue;
        sampleTarget.push(targetIndex * 4);
        sampleOffset.push((dy * width + dx) * 4);
      }
    }

    let bestSum = Infinity;
    let bestX = -1;
    let bestY = -1;
    const consider = (cx, cy) => {
      const base = (cy * width + cx) * 4;
      const drop = cy - ty;
      let sum = VERTICAL_BIAS * drop * drop * sampleTarget.length;
      if (sum >= bestSum) return;
      for (let s = 0; s < sampleTarget.length; s += 1) {
        const a = sampleTarget[s];
        const b = base + sampleOffset[s];
        const dr = pixels[a] - pixels[b];
        const dg = pixels[a + 1] - pixels[b + 1];
        const db = pixels[a + 2] - pixels[b + 2];
        sum += dr * dr + dg * dg + db * db;
        if (sum >= bestSum) return;
      }
      bestSum = sum;
      bestX = cx;
      bestY = cy;
    };

    if (sampleTarget.length) {
      for (const candidate of candidates) {
        const cx = candidate % width;
        consider(cx, (candidate - cx) / width);
      }
      if (bestX >= 0) {
        // Refine within the gaps the coarse grid skipped.
        const coarseX = bestX;
        const coarseY = bestY;
        for (let dy = -(CANDIDATE_STRIDE - 1); dy <= CANDIDATE_STRIDE - 1; dy += 1) {
          for (let dx = -(CANDIDATE_STRIDE - 1); dx <= CANDIDATE_STRIDE - 1; dx += 1) {
            if (!dx && !dy) continue;
            if (patchIsSource(origKnown, width, height, coarseX + dx, coarseY + dy)) {
              consider(coarseX + dx, coarseY + dy);
            }
          }
        }
      }
    }
    if (bestX < 0) {
      const fallback = candidates[0];
      bestX = fallback % width;
      bestY = (fallback - bestX) / width;
    }

    // Copy the patch, which is what carries structure rather than just colour. Pixels an
    // earlier patch already filled are blended rather than overwritten, which feathers the
    // joins; original pixels are never touched.
    for (let dy = -PATCH_RADIUS; dy <= PATCH_RADIUS; dy += 1) {
      const py = ty + dy;
      if (py < sy || py >= sy + sh) continue;
      for (let dx = -PATCH_RADIUS; dx <= PATCH_RADIUS; dx += 1) {
        const px = tx + dx;
        if (px < sx || px >= sx + sw) continue;
        const targetIndex = py * width + px;
        const from = ((bestY + dy) * width + (bestX + dx)) * 4;
        const to = targetIndex * 4;
        if (!known[targetIndex]) {
          pixels[to] = pixels[from];
          pixels[to + 1] = pixels[from + 1];
          pixels[to + 2] = pixels[from + 2];
          known[targetIndex] = 1;
          confidence[targetIndex] = frontConfidence;
          remaining -= 1;
          continue;
        }
        if (origKnown[targetIndex]) continue;
        // Feather towards the patch centre, where the match is most trustworthy.
        const reach = Math.max(Math.abs(dx), Math.abs(dy));
        const weight = BLEND_STRENGTH * (1 - reach / (PATCH_RADIUS + 1));
        pixels[to] += (pixels[from] - pixels[to]) * weight;
        pixels[to + 1] += (pixels[from + 1] - pixels[to + 1]) * weight;
        pixels[to + 2] += (pixels[from + 2] - pixels[to + 2]) * weight;
      }
    }
  }
}

// Box blur confined to the selection. Samples are clamped to the image, so pixels at the
// edge of the box pull in the surrounding scene instead of smearing the mark outwards.
// ponytail: naive O(radius²) per pixel; make it separable if large selections drag.
function blurRegion(pixels, width, height, box, radius) {
  const { sx, sy, sw, sh } = box;
  const source = pixels.slice();
  for (let y = sy; y < sy + sh; y += 1) {
    for (let x = sx; x < sx + sw; x += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const py = Math.min(height - 1, Math.max(0, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const px = Math.min(width - 1, Math.max(0, x + dx));
          const i = (py * width + px) * 4;
          r += source[i];
          g += source[i + 1];
          b += source[i + 2];
          count += 1;
        }
      }
      const target = (y * width + x) * 4;
      pixels[target] = Math.round(r / count);
      pixels[target + 1] = Math.round(g / count);
      pixels[target + 2] = Math.round(b / count);
    }
  }
}

async function processImage() {
  if (!state.image || !state.selection || state.processing) return;
  clearError();
  setProcessing(true, 'Removing watermark…');

  try {
    const img = state.image;
    const originalCanvas = document.createElement('canvas');
    const originalCtx = originalCanvas.getContext('2d');
    const originalWidth = img.naturalWidth || img.width;
    const originalHeight = img.naturalHeight || img.height;
    originalCanvas.width = originalWidth;
    originalCanvas.height = originalHeight;
    originalCtx.drawImage(img, 0, 0, originalWidth, originalHeight);

    const originalBox = selectionToOriginalBox(state.selection, originalWidth, originalHeight);
    const box = clampMaskBox(originalBox, originalWidth, originalHeight);
    const cv = await loadOpenCV();

    const src = cv.imread(originalCanvas);
    const mask = new cv.Mat.zeros(originalHeight, originalWidth, cv.CV_8UC1);
    const maskColor = new cv.Scalar(255);
    const rect = new cv.Rect(box.sx, box.sy, box.sw, box.sh);
    cv.rectangle(mask, new cv.Point(box.sx, box.sy), new cv.Point(box.sx + box.sw - 1, box.sy + box.sh - 1), maskColor, -1);

    const expanded = new cv.Mat();
    const kernelSize = Math.max(3, Math.min(17, Math.round(Math.min(box.sw, box.sh) * 0.08) + 3));
    const kernel = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(kernelSize, kernelSize));
    cv.dilate(mask, expanded, kernel, new cv.Point(-1, -1), 1, cv.BORDER_CONSTANT, cv.Scalar.all(0));

    const inpainted = new cv.Mat();
    const selectedMode = document.querySelector('input[name="mode"]:checked')?.value || 'telea';
    const inpaintFlags = selectedMode === 'ns' ? cv.INPAINT_NS : cv.INPAINT_TELEA;
    const radius = Math.max(1, Math.min(12, Math.round(Math.min(box.sw, box.sh) * 0.05) + 1));
    cv.inpaint(src, expanded, inpainted, radius, inpaintFlags);

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = originalWidth;
    outputCanvas.height = originalHeight;
    cv.imshow(outputCanvas, inpainted);

    const outputUrl = outputCanvas.toDataURL('image/png');
    state.processedDataUrl = outputUrl;

    src.delete();
    mask.delete();
    expanded.delete();
    kernel.delete();
    inpainted.delete();

    beforePreview.src = state.originalDataUrl;
    afterPreview.src = outputUrl;
    resultPanel.classList.remove('is-hidden');
    downloadLink.href = outputUrl;
    downloadLink.download = `${(state.fileName || 'watermark-removed').replace(/\.[^.]+$/, '')}.png`;
  } catch (error) {
    console.error(error);
    showError('Processing failed. Please choose a different selection and try again.');
  } finally {
    setProcessing(false, 'Processing…');
  }
}

processButton.addEventListener('click', processImage);
