// Video to MP3: the first sound track, whole length, as MP3 at the chosen bitrate.
const bitrate = document.querySelector('#bitrateSelect');
const ctx = VideoKit.mount({
  busyLabel: 'Converting…',
  preview: 'audio',
  build({ input, file, baseName }) {
    return {
      args: ['-i', input, '-map', '0:a:0', '-vn', '-c:a', 'libmp3lame', '-b:a', `${bitrate.value}k`],
      output: 'out.mp3',
      mime: 'audio/mpeg',
      fileName: `${baseName(file.name)}.mp3`,
    };
  },
});
bitrate.addEventListener('change', () => ctx.refresh());
