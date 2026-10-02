// Compress Video: re-encodes to H.264 MP4 at the chosen quality, optionally scaling the short side
// down to 1080/720/480. Videos already at or below that size keep their own size.
const quality = document.querySelector('#qualitySelect');
const size = document.querySelector('#sizeSelect');

const ctx = VideoKit.mount({
  busyLabel: 'Compressing…',
  compareSize: true,
  build({ input, meta, file, baseName }) {
    const target = Number(size.value);
    const { width = 0, height = 0 } = meta || {};
    const scale = target && width && height && Math.min(width, height) > target
      ? (width >= height ? `scale=-2:${target}` : `scale=${target}:-2`)
      : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
    return {
      args: ['-i', input, '-map', '0:v:0', '-map', '0:a?', '-vf', scale, '-c:v', 'libx264', '-preset', 'veryfast',
        '-crf', quality.value, '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'],
      output: 'out.mp4',
      mime: 'video/mp4',
      fileName: `${baseName(file.name)}-compressed.mp4`,
    };
  },
});
for (const field of [quality, size]) field.addEventListener('change', () => ctx.refresh());
