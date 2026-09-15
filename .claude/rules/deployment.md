# Deployment Rules — MediaPilot

Full context: `docs/deployment.md`.

## The chain

```
npm run build   →   node test-filter-graph.mjs && node test-image-regions.mjs   →   npx wrangler deploy
```
`npm run build` must run (and succeed) immediately before any deploy —
`dist/` is regenerated from scratch every time and is not itself the source
of truth.

## Rules

1. **`npx wrangler deploy` is a HIGH-risk action** (per `safety.md`) and
   requires explicit human approval every time, regardless of how confident
   an agent is in the change. No agent runs this autonomously.
2. **No agent modifies `wrangler.jsonc`** (asset directory, routes, bindings,
   compatibility date) without human approval — this is the entire production
   configuration surface for a site with no other server-side config.
3. **Nightly/automated workflows build and stage only.** Per the Phase 6
   design, the autonomous nightly pass may implement a LOW-risk fix, run
   tests, and run the build — it stops there. It does not deploy. "Staging"
   for this project currently means "a successful local `dist/` build plus
   passing tests," since no staging environment/URL exists yet (see
   `docs/deployment.md`) — do not claim a staging deployment happened if it
   didn't.
4. **Rollback is manual today** (`wrangler rollback`, not scripted). If a
   deploy an agent prepared turns out to be bad, say so and hand rollback to
   the human rather than attempting a corrective deploy autonomously.
5. **Never commit secrets.** Cloudflare auth (`wrangler login` token or
   `CLOUDFLARE_API_TOKEN`) is environment-level, never repo-level. If a task
   seems to need a new secret or API key, that's a HIGH-risk item for a human
   to provision, not something to generate or hardcode.

## What "the Manager verifies tests passed before deployment" means concretely

Before recommending or requesting approval for a deploy, the Manager agent
must be able to point to: the branch/commit, the test command output (both
scripts, exit 0), and a successful `npm run build`. Absence of any of the
three blocks the deploy request.
