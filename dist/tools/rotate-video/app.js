// Rotate Video: turns or mirrors the picture itself (not just a rotation flag), so it plays the
// right way in every player. The source player previews the choice with a CSS transform.
const FILTERS = { right: 'transpose=1', left: 'transpose=2', half: 'transpose=1,transpose=1', hflip: 'hflip', vflip: 'vflip' };
const choice = () => document.querySelector('input[name="turn"]:checked').value;

const ctx = VideoKit.mount({
  busyLabel: 'Rotating…',
  onReady: preview,
  build({ input, file, baseName }) {
    return {
      args: ['-i', input, '-map', '0:v:0', '-map', '0:a?', '-vf', `${FILTERS[choice()]},scale=trunc(iw/2)*2:trunc(ih/2)*2`,
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'],
      output: 'out.mp4',
      mime: 'video/mp4',
      fileName: `${baseName(file.name)}-rotated.mp4`,
    };
  },
});

function preview() {
  const player = ctx.player;
  // A quarter turn swaps width and height, so shrink it to stay inside the frame.
  const fit = player.clientWidth && player.clientHeight ? Math.min(1, player.clientHeight / player.clientWidth) : 1;
  player.style.transform = {
    right: `rotate(90deg) scale(${fit})`, left: `rotate(-90deg) scale(${fit})`, half: 'rotate(180deg)',
    hflip: 'scaleX(-1)', vflip: 'scaleY(-1)',
  }[choice()];
}
ctx.player.addEventListener('loadedmetadata', preview);
for (const radio of document.querySelectorAll('input[name="turn"]')) {
  radio.addEventListener('change', () => { preview(); ctx.refresh(); });
}
