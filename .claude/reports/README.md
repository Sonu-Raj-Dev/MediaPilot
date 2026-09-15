# Daily Reports

One file per day, `.claude/reports/YYYY-MM-DD.md`, written at the end of
every daily Autopilot cycle (`.claude/agents/autopilot.md`,
`docs/scheduling.md`). None exist yet as of this setup — the first is
written by the first scheduled run (06:12 AM local, `mediapilot-daily-cycle`).

Read the last 2-3 of these (plus `.claude/tasks/*`) before creating any new
task or approval request — duplicate protection depends on it.

## Template

```markdown
# MediaPilot Daily Report — YYYY-MM-DD

## System health
Test suite, build status, error rate, processing time. "All green" or specific failures.

## Product insights
What Autopilot analyzed about current features, gaps, user feedback.

## User insights
What Analytics agent reported about behavior, engagement, churn signals.
(Or: "Analytics integration not configured yet" — state it plainly.)

## Market insights
What Market Research agent found about demand, competitor moves, underserved
use cases.

## SEO insights
High-opportunity keywords, ranking gaps, landing-page recommendations.

## Revenue insights
Monetization proposals, revenue-driven product ideas, traffic-to-revenue
efficiency.

## Bugs found
Real issues discovered today. Each: name, severity, impact.

## Feature opportunities
Candidates identified. Each: name, user value, business value, score, risk.

## TOP OPPORTUNITY
The single highest-priority item Autopilot is working on today (or "no work
selected — all candidates below threshold").

## Work completed
What was built, tested, and approved today.
- Feature/fix name
- Branch
- Test results
- Build result
- Approval filed? Status?

## Test results
Full command output: `node test-*.mjs` results (pass/fail/details).

## Build results
Full output: `npm run build` result.

## Pending approvals
Tasks filed today awaiting decision. Read from the MediaPilot Approvals board.

## Deployed features
(Usually none — deployments are human decisions.) If deployed: what was it,
when, any early signals?

## Results of previous features
If a feature/experiment deployed recently: how's it measuring against success
criteria?
(Or: "No recent deployments to measure yet.")

## Recommended next action
1–2 sentences on what Autopilot should prioritize tomorrow based on today's
findings.
```

Do not fabricate content in any section — an honest "none" or "no data
source configured yet" is correct far more often than a populated-looking
section, per `docs/daily-report-template.md`'s same rule for the
traffic/SEO/revenue sections (those need analytics/GSC/ad integrations that
don't exist yet).
