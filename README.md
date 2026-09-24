# MediaPilot — video watermark cleanup

A web tool for removing a fixed watermark from a video you own or have permission to edit.
Everything runs in the browser, so the deployed site is static and there is no backend.

## Run locally

```bash
npm run build
python -m http.server 4173 -d dist
```

Then open `http://localhost:4173`.

## Deploy

Hosted on Vercel as a static site. `vercel.json` sets the build command, the output
directory and the response headers; Vercel installs dependencies and runs the build itself,
so nothing in `dist/` is committed or uploaded.

```bash
npx vercel --prod
```

From a connected Git repository the same settings apply automatically. If the repository root
is the parent folder rather than this one, set the project's **Root Directory** to `MediaPilot`.

`wrangler.jsonc` is the previous Cloudflare Workers config. It is unused and not uploaded.

### Headers, and one that must not be added

`vercel.json` deliberately does **not** set `Cross-Origin-Embedder-Policy` or
`Cross-Origin-Opener-Policy`. ffmpeg.wasm here is the single-threaded core, which does not need
them, and `COEP: require-corp` would block the ffmpeg and ONNX bundles loaded from jsDelivr.
Those headers only become necessary alongside a switch to `@ffmpeg/core-mt`, and then the CDN
loads have to move too.

## How it works

1. Pick a video. The browser decodes the first frame for the preview; AVI, MKV and WMV fall back
   to ffmpeg.wasm, which browsers cannot decode natively.
2. Draw one or more rectangles around the watermark(s), or use the corner presets.
3. Choose reconstruct (ffmpeg `delogo`), soften (`boxblur`) or pixelate.
4. ffmpeg.wasm re-encodes the video to MP4 (H.264 + AAC) and the cleaned file downloads directly.

The ~31 MB ffmpeg.wasm core is fetched from jsDelivr on first use and then served from the browser
cache. It runs single-threaded, which avoids needing COOP/COEP headers but makes long videos slow —
expect roughly real-time or worse. The original audio track is carried over when the source has one.

For best results use fixed-position watermarks and tight selection boxes. Reconstruct works best
where the surrounding background has enough texture to fill the marked area.

## Image tool

`/tools/remove-watermark-image` removes a marked rectangle by exemplar-based inpainting
(Criminisi et al.): the fill front is walked in priority order and whole patches are copied from
the surrounding image, so texture and edges carry across the hole. Blur mode softens the
rectangle instead. Everything runs on a canvas, with no dependencies.

Patches are feathered where they overlap so the fill does not look tiled, and matches are
biased towards similar heights in the frame, since photographs are stratified — sky above,
ground below. A tight selection takes well under a second; one covering a large region takes a
few seconds.

## Checks

`test-filter-graph.mjs` checks the ffmpeg filter builder and `test-image-regions.mjs` the image
pixel maths: `node test-filter-graph.mjs && node test-image-regions.mjs`.

`server.py` and `vendor/` are the previous Python + OpenCV backend. Nothing calls them any more.
