// Mute Video: copies every stream except sound, untouched, so it is fast and lossless.
VideoKit.mount({
  busyLabel: 'Removing audio…',
  build({ input, file, baseName, extensionOf }) {
    const ext = extensionOf(file.name);
    return {
      args: ['-i', input, '-map', '0', '-map', '-0:a', '-c', 'copy'],
      output: `out.${ext}`,
      mime: file.type || 'video/mp4',
      fileName: `${baseName(file.name)}-muted.${ext}`,
    };
  },
});
