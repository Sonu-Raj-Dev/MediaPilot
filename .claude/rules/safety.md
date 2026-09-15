# Safety Rules — all agents

These rules bind every agent in `.claude/agents/`. An agent that cannot
comply with a rule for a given task must stop and hand the task back to the
Manager rather than proceed.

## Risk classification (Manager assigns this on every task)

**Risk level controls how much scrutiny a change gets and whether it may be
auto-*implemented* in an isolated branch. It never controls whether
merge/deploy needs approval — per `.claude/rules/approval.md`, EVERY
behavior-modifying change requires a human decision on the MediaPilot
Approvals board before it reaches `main` or production, LOW included.**

- **LOW** — may be auto-implemented (branch, commit) and auto-filed as an
  approval request without waiting for a human to greenlight the
  *implementation* step. Still requires an approved record before merge.
  Examples: fixing a typo, adding a missing i18n key, adding a test for
  existing behavior, updating a doc, adding `robots.txt`/meta tags that don't
  touch app logic.
- **MEDIUM** — implement → test → build → stage, then file an approval
  request; do not implement speculatively without a task already agreed by
  Manager. Examples: bug fixes in `app.js` or either tool's `app.js`, changes
  to the ffmpeg filter graph or OpenCV inpaint parameters, dependency bumps,
  build script changes.
- **HIGH** — requires explicit human approval **before implementation
  begins**, not just before merge. Examples: anything touching
  `wrangler.jsonc` / deploy config, deleting the dead custom inpainting code
  or `tools/remove-watermark-video/app.js` (see `docs/known-issues.md`
  #1–2) or any other file removal, changes to file upload/size limits,
  anything that changes what data leaves the browser, anything resembling
  monetization/ad integration, and any production deploy
  (`npx wrangler deploy` — always human-run, never automated at any risk
  level).

When in doubt, classify up (treat MEDIUM as HIGH), not down.

## Always-HIGH categories (explicit approval list)

These require human approval regardless of how they'd otherwise score on
`.claude/rules/prioritization.md`'s priority formula — priority is not risk,
and urgency is never a reason to skip approval here (see that doc's "this
score is NOT the same axis as risk"):

- Database destructive changes (moot today — no database exists — but binding
  if/when one is added)
- Authentication/security changes (moot today — no auth exists — same caveat)
- Production infrastructure changes (`wrangler.jsonc`, deploy config, DNS/
  domain, any Cloudflare account-level setting)
- Billing changes (none exist today; applies the moment any paid
  integration — Cloudflare plan, ad network, GSC API quota, etc. — is added)
- Ad-policy-sensitive changes (anything the Revenue agent's recommendations
  touch — see `.claude/agents/revenue.md`, which never implements these
  itself)
- Deleting production data or deployed assets
- Major dependency upgrades (a version bump that changes behavior, not a
  patch-level security fix — use judgment, and classify up if unsure)
- Large architectural rewrites (e.g. reintroducing a server backend,
  swapping the client-side processing model — see rule 6 below)

## Hard rules

1. **Never rewrite or delete existing functionality without evidence.** Cite
   the specific file/lines and, ideally, the known-issues.md entry that
   justifies a change. "This looks unused" is not evidence by itself — trace
   every caller first (grep, don't guess) as documented in
   `docs/architecture.md` and `docs/media-processing.md`.
2. **Every code change is followed by build + tests**, at minimum:
   ```bash
   node test-filter-graph.mjs && node test-image-regions.mjs
   npm run build
   ```
   A change is not "done" until both succeed. If a change makes an existing
   test meaningless (e.g. it tests dead code — see known-issues.md #1),
   flag that explicitly rather than quietly deleting the test.
3. **Non-trivial changes happen on a branch**, never directly on `main`.
   One branch per task; do not stack unrelated work on someone else's branch.
4. **No destructive production changes**, ever, without HIGH-risk human
   approval: no `wrangler deploy`, no force-push, no deleting deployed
   assets, no changing `wrangler.jsonc`.
5. **Never expose secrets, API keys, tokens, or credentials.** This repo has
   none checked in today — keep it that way. If Cloudflare credentials or any
   future API key are needed, they belong in environment variables /
   Cloudflare's own secret store, never in source, `wrangler.jsonc`, or a
   committed `.env`.
6. **User-owned media never leaves the browser** unless a human explicitly
   approves adding a server component. The entire point of the current
   architecture (per `docs/architecture.md`) is that uploads are processed
   client-side. Reintroducing a backend upload endpoint is a HIGH-risk,
   human-approved architectural decision, not something any agent does
   unilaterally, however tempting `server.py` looks as a shortcut.
7. **No spammy/manipulative SEO** (keyword stuffing, cloaking, hidden text,
   fake structured data, doorway pages). The SEO agent's job is legitimate
   indexability and correctness only.
8. **No changes that could violate ad-network or platform policy** (e.g.
   deceptive placement, encouraging accidental clicks, misrepresenting the
   tool for ad approval purposes). The Revenue agent recommends; it does not
   implement monetization changes itself.
9. **Prefer reversible, additive changes.** Before any command that could
   discard uncommitted work (`git checkout`/`restore`/`reset --hard`/`clean`),
   run `git status` and stash or commit first.

## Escalation path

`production error → detect → task created → Manager classifies risk →
Developer investigates/fixes (branch only) → QA tests → staged build →
approval record filed on the MediaPilot Approvals board
(.claude/rules/approval.md) → human clicks Approve/Reject → deploy`.
No agent skips a step in this chain, and no agent ever merges or deploys on
its own belief that something "should be fine" — it checks the approval
board's actual recorded decision for that exact task id and commit first.
