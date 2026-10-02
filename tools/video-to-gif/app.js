// Video to GIF: one pass builds a palette from the clip and maps every frame onto it, which gives
// far cleaner colour than a fixed 256-colour palette.
const MAX_SECONDS = 30;
const width = document.querySelector('#widthSelect');
const fps = document.querySelector('#fpsSelect');
let range;
const problem = () => { const r = range.read(MAX_SECONDS); return typeof r === 'string' ? r : undefined; };
const ctx = VideoKit.mount({
  busyLabel: 'Making GIF…',
  preview: 'image',
  onReady: () => range.reset(),
  validate: problem,
  build({ input, meta, file, baseName }) {
    const [start, end] = range.read(MAX_SECONDS);
    const w = Math.min(Number(width.value), meta?.width || Infinity);
    return {
      args: ['-ss', start.toFixed(3), '-t', (end - start).toFixed(3), '-i', input,
        '-vf', `fps=${fps.value},scale=${w}:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4`,
        '-loop', '0'],
      duration: end - start,
      output: 'out.gif',
      mime: 'image/gif',
      fileName: `${baseName(file.name)}.gif`,
    };
  },
});
range = VideoKit.bindRange(ctx, 5);
for (const field of [width, fps]) field.addEventListener('change', () => ctx.refresh());
