# Backlog

Not yet started. Autopilot pulls from here into `active.md` when work begins.

## Task types

Every task falls into one or more categories:
- **BUGS** — something is broken
- **IMPROVEMENTS** — something exists but could be better
- **NEW FEATURES** — new functionality
- **SEO** — search/content opportunities
- **PERFORMANCE** — processing speed, bundle size, load time
- **REVENUE** — monetization or business value
- **EXPERIMENTS** — measurable tests
- **RESEARCH** — investigation/analysis needed before implementing

Manual entries may use the short format:
`- [TYPE] [RISK] Title — owner agent — one-line why (source)`

Examples:
- `- BUGS [MEDIUM] Video processing timeout on large files — developer — files over 500MB hang the tab`
- `- NEW FEATURES [MEDIUM] Video cropping — developer — users need Instagram aspect ratios`
- `- SEO [LOW] Add landing page for "remove watermark from video" — developer — high-traffic keyword with zero pages ranking`

## Autopilot-detected task template

Every task Autopilot creates uses this full form. Do not silently implement;
a task must exist first.

```
### TASK: <short description>
Type: <BUGS | IMPROVEMENTS | NEW FEATURES | SEO | PERFORMANCE | REVENUE | EXPERIMENTS | RESEARCH>
Evidence: <what was observed, with data/commands/analysis>
User Value: <1-5>   Business Value: <1-5>   Evidence Strength: <1-5>
  Effort: <1-5>   Risk: <1-5>   Score: <(U×B×E)-(Effort×Risk)>
  (see docs/product-prioritization.md)
Risk classification: <LOW/MEDIUM/HIGH per .claude/rules/safety.md>
Success metrics: <how we'll measure if this worked>
Recommended investigation: <what the owning agent should research first>
Assigned: <agent(s)>
Status: backlog
```

## Seeded from the Phase 1 audit (docs/known-issues.md)

- [HIGH] Decide the image-tool inpainting story: wire in the tested custom
  exemplar algorithm, or retarget `test-image-regions.mjs` at the live
  `cv.inpaint` path — owner: developer — zero test coverage exists for what
  actually ships today (known-issues.md #1)
- [HIGH] Delete `tools/remove-watermark-video/app.js` (confirmed orphaned,
  not loaded by any page) — owner: developer — the LOW-risk half of this
  (marking it dead + a wiring regression test) shipped in
  `completed.md` (2026-09-15, commit `7b19434`); actual deletion is a
  destructive change and needs explicit human approval per safety.md before
  any agent acts on it (known-issues.md #2).
- [MEDIUM] Add a processing timeout + cancel affordance to the video pipeline
  (`cleanVideo()` in `app.js`) — owner: developer — a large/corrupt file can
  hang the tab indefinitely today (known-issues.md #3)
- [LOW] Audit i18n key parity across all 15 locales and document/fix gaps —
  owner: developer — several locales fall back to English per-key with no
  automated check (known-issues.md #4)
- [LOW] Defer/lazy-load `vendor/opencv.js` on the image tool page instead of
  a blocking `<head>` script tag — owner: performance — 13 MB loads before
  the user does anything (known-issues.md #5)
- [LOW] Add `robots.txt`, `sitemap.xml`, canonical links, per-page meta
  descriptions, and JSON-LD structured data — owner: seo — none exist today
  (known-issues.md #6)
- [MEDIUM] Propose and (on approval) instrument privacy-respecting analytics
  — owner: analytics — zero instrumentation exists (known-issues.md #7)
- [LOW] Produce an initial monetization proposal — owner: revenue — zero
  monetization exists (known-issues.md #7)
- [LOW] Stand up CI (GitHub Actions: run both test scripts + `npm run build`
  on every PR) — owner: developer, propose to Manager first — no CI exists
  (known-issues.md #9)
- [LOW] Add a `package.json` `"test"` script wrapping both existing checks —
  owner: developer — currently only documented in README prose
  (known-issues.md #9)

## Found during 2026-09-15 daily cycle

### TASK: .claude/ and docs/ are not committed to git on any branch
Type: RESEARCH
Evidence: `git ls-tree -r <branch> --name-only` returns zero `.claude/`or
  `docs/` entries on `main`, `agents/audit-and-agent-system`,
  `chore/mark-dead-video-app-js`, and the current branch. They exist only as
  untracked working-tree files. This contradicts `completed.md`'s claim that
  "Phase 2/3 agent system scaffolding... created on branch
  `agents/audit-and-agent-system`" — nothing was actually committed there.
  The entire agent system (rules, agent defs, task files, this backlog
  itself) and all audit docs currently live only on this one machine's
  working directory with no git history/backup.
User Value: 1   Business Value: 3   Evidence Strength: 5
  Effort: 2   Risk: 2   Score: (1×3×5)-(2×2) = 11
Risk classification: LOW to commit as-is (purely additive, touches no app
  code); the open question is a scope/intent decision, not a safety one —
  should these be committed to `main`, kept on a dedicated branch, or is
  there a deliberate reason they were left out (e.g. meant to be
  machine-local)? That decision needs a human call before any agent commits
  ~20+ new files sight-unseen.
Success metrics: agent system and audit docs survive a fresh clone / a lost
  working directory.
Recommended investigation: ask the human whether `.claude/` and `docs/`
  should be committed (and to which branch), then commit as a single
  no-app-behavior-change, LOW-risk task once scope is confirmed.
Assigned: developer (after human scope decision)
Status: backlog

## Product gaps (new features, not bugs — see docs/media-processing.md
"What's NOT implemented today")

- [MEDIUM] Cropping (image and/or video) — doesn't exist
- [MEDIUM] Resizing — doesn't exist
- [MEDIUM] General compression controls — doesn't exist (video is fixed
  CRF 23; image is always lossless PNG)
- [MEDIUM] Quality-enhancement step — doesn't exist
