// Trim Video: keeps the part between start and end. Re-encoded so the cut lands exactly on the
// chosen times rather than on the nearest keyframe.
let range;
const problem = () => { const r = range.read(); return typeof r === 'string' ? r : undefined; };
const ctx = VideoKit.mount({
  busyLabel: 'Trimming…',
  onReady: () => range.reset(),
  validate: problem,
  build({ input, file, baseName }) {
    const [start, end] = range.read();
    return {
      args: ['-ss', start.toFixed(3), '-i', input, '-t', (end - start).toFixed(3), '-map', '0:v:0', '-map', '0:a?',
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
      duration: end - start,
      output: 'out.mp4',
      mime: 'video/mp4',
      fileName: `${baseName(file.name)}-trimmed.mp4`,
    };
  },
});
range = VideoKit.bindRange(ctx);
