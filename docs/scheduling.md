# Scheduling

## What's active right now

**One schedule, daily only** — created this session via
`mcp__scheduled-tasks__create_scheduled_task` (the durable mechanism: stored
to disk, survives app restarts, real recurring cron in local time; the
alternative, `CronCreate`, is session-only and was not used for exactly that
reason).

```
taskId:  mediapilot-daily-cycle
cron:    "12 6 * * *"   (06:12 AM local, every day)
```

Confirm current state any time with `mcp__scheduled-tasks__list_scheduled_tasks`
and see individual run history/logs with `mcp__scheduled-tasks__list_task_runs`
— don't trust this document's claim indefinitely, it can go stale.

**No hourly or nightly schedule exists, and none should be created.** The
human explicitly limited MediaPilot's autonomous cycle to once per day —
`.claude/agents/autopilot.md` states this and no other scheduled task should
be added without a new, explicit request.

## What the daily run does

The full loop in `.claude/agents/autopilot.md`: observe → analyze → detect →
prioritize → create task → investigate → implement (isolated branch only) →
test → build → quality-check → file a real approval request on the
MediaPilot Approvals board → notify via push → stop. **It never merges to
`main` or deploys** — that requires a human's Approve on the board first,
checked fresh (task id + commit SHA) in a later action, per
`.claude/rules/approval.md`.

## Logging and failure handling

Every run appends to `.claude/logs/YYYY-MM-DD.jsonl` (schema in
`.claude/logs/README.md`) and writes `.claude/reports/YYYY-MM-DD.md`. A
failed test/build/observe step stops the run before it reaches
implementation or approval-filing and is recorded, not silently retried.

## Changing the schedule

To pause, retime, or remove it: `mcp__scheduled-tasks__update_scheduled_task`
or `delete_scheduled_task` with `taskId: "mediapilot-daily-cycle"`. To run it
once on demand without waiting for 06:12: `run_scheduled_task` with the same
id.
