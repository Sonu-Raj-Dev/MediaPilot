# MediaPilot — Deployment

## Platform

**Cloudflare Workers**, static-assets mode (`wrangler.jsonc`):
```jsonc
{
  "name": "mediapilot",
  "compatibility_date": "2025-09-12",
  "assets": { "directory": "./dist", "not_found_handling": "single-page-application" }
}
```
No Worker script, no KV/D1/R2 bindings, no environment variables, no secrets in
the config. `not_found_handling: single-page-application` means any unknown
path falls back to serving the SPA shell — relevant because `/tools/...` pages
are real files today, but this setting will also mask a genuinely missing page
as 200 OK.

## Build

```bash
npm run build      # runs scripts/build-static.mjs
```
Rebuilds `dist/` from scratch every time (`fs.rmSync(outDir, {recursive:true})`)
by copying `index.html`, `app.js`, `styles.css`, `tools/**`, and
`node_modules/@techstark/opencv-js/dist/opencv.js` (to both `vendor/opencv.js`
and `dist/vendor/opencv.js`). No minification, no bundling, no source maps —
files ship as authored.

## Deploy

```bash
npm run build
npx wrangler deploy
```
Requires Cloudflare credentials (`wrangler login` or `CLOUDFLARE_API_TOKEN`)
configured in whatever environment runs this — not present in this repo, and
correctly not checked in. **No CI/CD pipeline exists**: deploys are manual,
local, and there's no automated gate (tests aren't run as part of `deploy`).

## Local run

```bash
npm run build
python -m http.server 4173 -d dist
```
Serves the built static bundle; equally `npx serve dist` or any static server
works since there's no server-side behavior to emulate.

## Environments

There is exactly one environment described anywhere in the repo (production,
via `wrangler deploy`). No staging config, no preview-deployment setup in
`wrangler.jsonc`, though Cloudflare Workers supports named environments/
preview URLs if added later — needed for the Phase 6 "prepare staging
deployment" nightly workflow to mean anything concrete.

## Rollback

Not configured in-repo. Cloudflare Workers retains prior deployments and
`wrangler rollback` works out of the box, but nothing here scripts or
documents it. Worth an explicit runbook line before any agent is trusted to
deploy autonomously.
