# Task Prioritization — MediaPilot

Used by Autopilot (`.claude/agents/autopilot.md`) and Manager
(`.claude/agents/manager.md`) to score and order every task before deciding
whether it can be automated.

## Scoring

```
Priority Score = Severity × Impact × Confidence
```

- **Severity** (how bad is the underlying problem, independent of who it
  affects): 1 = informational, 2 = minor, 3 = moderate, 4 = major,
  5 = critical.
- **Impact** (1–5): how much of the product/traffic/users this touches.
  Given MediaPilot has exactly two tools and no traffic instrumentation yet
  (`docs/known-issues.md` #7), impact is mostly "how many of the two tools,
  and how central the affected path is" until real usage data exists —
  say so explicitly rather than inventing a user-count-based estimate.
- **Confidence** (1–5): how sure you are this is real and correctly
  diagnosed, not a guess. Evidence you can point to (a failing test, a grep
  result, a reproduced error) earns high confidence; a hunch does not.

Score range: 1–125. Record all three inputs and the product, not just the
final number, in every task entry — the inputs are what a reviewer checks,
not the score alone.

## This score is NOT the same axis as risk

Priority Score says how much a problem matters. `.claude/rules/safety.md`'s
LOW/MEDIUM/HIGH says how much its *fix* could break. A critical, high-impact,
high-confidence bug (score near 125) can still have a LOW-risk fix (e.g. a
one-line guard) or a HIGH-risk one (e.g. touching the upload pipeline). Score
first to decide what matters; classify risk separately to decide who can act
on it and how.

## Automatic implementation gate

**"Auto-implement" means: in an isolated branch, tested and built, with an
approval record filed. It never means merged or deployed** — per
`.claude/rules/approval.md`, every behavior-modifying change needs a human's
explicit Approve on the MediaPilot Approvals board before `main`/production,
at every risk level. This gate only decides whether an agent may write and
test code *without waiting for a human to greenlight starting the work*.

An agent may implement a task **without waiting for a human to authorize
starting it** only if *all* of the following hold:
1. Risk classification is **LOW** per `.claude/rules/safety.md` (additive,
   reversible, no deletion, no deploy, no new dependency/credential/
   third-party script, no touched upload/size-limit/architecture code).
2. The fix is covered by the standard gate: full existing test suite passes,
   `npm run build` succeeds, diff reviewed and scoped to the task.
3. Priority Score inputs are evidence-backed (Confidence ≥ 3 — a task built
   on a guess doesn't get auto-implemented no matter how "urgent" it looks).

Even when all three hold, the change still stops at a filed, pending
approval record — never merge, never deploy. MEDIUM/HIGH tasks need human
sign-off before implementation even starts (`safety.md`).

Any task failing #1 goes to backlog/active with its score and waits for
Manager routing + (for MEDIUM/HIGH) human approval, regardless of how high
its score is. A score of 125 does not override a HIGH risk classification —
urgency is not a reason to skip approval, it's a reason to ask sooner.

## Worked example (from the user's own sample)

```
TASK: Video resize failure rate increased.
Evidence: previous 1.8%, current 5.2%
Severity: 4   Impact: 5   Confidence: 5   → Priority Score = 100
Risk of the FIX: unknown until investigated — do not assume LOW just because
the score is high. Assigned: Developer + QA (investigate first; risk gets
classified once a concrete fix is proposed).
```
Note: MediaPilot has no resize feature today (`docs/media-processing.md`,
"what's NOT implemented") and no failure-rate telemetry
(`docs/known-issues.md` #7) — this example is illustrative of the scoring
mechanics only, not a real observed condition. Don't log it as a real task.
