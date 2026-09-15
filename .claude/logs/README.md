# Execution Log

Persistent record of what every agent/Autopilot run actually did — the audit
trail Phase 9 asks for. This directory holds real logs from real runs only;
it is not seeded with fabricated example entries.

## Format

One file per day, `YYYY-MM-DD.jsonl` (newline-delimited JSON, one object per
line, append-only). Created on first use — none exist yet as of this setup.

## Schema (one line per logged action)

```json
{
  "timestamp": "2026-09-15T14:32:07-07:00",
  "task_id": "2026-09-15-mark-dead-video-app-js",
  "agent": "developer",
  "action": "implement",
  "result": "success",
  "commit": "7b19434",
  "test_result": "pass",
  "build_result": "pass",
  "approval_status": "pending",
  "deployment_status": "not_deployed",
  "rollback_status": "n/a",
  "error": null
}
```

Field notes:
- `task_id` — must match the document id on the MediaPilot Approvals board
  (`.claude/rules/approval.md`) when one exists for this task, and the entry
  in `.claude/tasks/{backlog,active,completed}.md`. This is what lets a
  later run trace a deploy back to the exact approval that authorized it.
- `agent` — one of the `.claude/agents/*.md` names, or `autopilot`/`manager`
  for coordination-level entries.
- `action` — `observe` | `analyze` | `detect` | `prioritize` | `create_task`
  | `investigate` | `implement` | `test` | `build` | `quality_check` |
  `file_approval_request` | `merge` (only after a confirmed `approved`
  status + matching commit SHA) | `deploy` (should almost never appear —
  `npx wrangler deploy` is never automated, `.claude/rules/deployment.md`) |
  `monitor`.
- `result` — `success` | `failure` | `blocked_on_approval` | `no_action_needed`.
- `commit` — the git commit SHA this log line concerns, or `n/a`.
- `test_result` / `build_result` — `pass` | `fail` | `n/a` (n/a for actions
  that don't touch code, e.g. a pure analytics/report read).
- `approval_status` — `n/a` | `pending` | `approved` | `rejected` |
  `stale` (approved commit no longer matches branch HEAD — see
  `.claude/rules/approval.md` rule 3) — read fresh from the approvals board,
  never assumed from a prior log line.
- `deployment_status` — `not_deployed` (expected for almost everything —
  see `.claude/rules/deployment.md`) | `staged` | `deployed` | `n/a`.
- `rollback_status` — `n/a` unless something was actually rolled back.
- `error` — `null` or a short message; never a full secret-containing stack
  trace (`.claude/rules/safety.md` — no secrets in anything committed).

## What writes here

Any agent completing a logged action (per `.claude/agents/autopilot.md`'s
loop) appends a line. This is plain-text/JSONL by design — no framework, no
log service dependency, consistent with the rest of this repo's "stdlib
first" style (`.claude/rules/coding-standards.md`).

## What's NOT here yet

Real production error/performance logs — those need the error-monitoring/
analytics integrations described in `docs/known-issues.md` #7 and
`docs/scheduling.md`; this directory only captures what *agents* did, not
what the deployed site's visitors experienced.
