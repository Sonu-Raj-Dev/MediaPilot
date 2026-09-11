# MediaPilot — video watermark cleanup

A small local web tool for removing a fixed watermark from a video you own or have permission to edit.

## Run

```bash
cd watermark-remover
python3 server.py
```

Then open `http://localhost:8000`.

The app listens on `0.0.0.0` for local connections, but in the browser use `localhost` or `127.0.0.1` instead of `0.0.0.0` to avoid the browser's invalid-address error. It uses Python's standard library plus the already-installed OpenCV package; there are no frontend dependencies.

## How it works

1. Upload a video.
2. Draw one or more rectangles around the watermark(s) on the first-frame preview, or use the lower-corner preset.
3. Choose reconstruct, soften, or pixelate.
4. Run the local frame-by-frame processor and download the cleaned MP4.

It creates an MP4 download and a browser-compatible WebM review copy so the in-app preview works reliably. If the source contains audio, the original track is muxed back into both exports. For best results, use fixed-position watermarks and tight selection boxes. Reconstruct works best where the surrounding background has enough texture to fill the marked area.
