# Production Approval Gate

**Every change that modifies MediaPilot's application behavior — new
feature, new tool, processing/algorithm change, UI change, SEO
implementation, performance change, or any other production-affecting
change — requires the human's explicit approval before it is merged to
`main` or deployed.** This applies at every risk level, including LOW. Risk
level (`.claude/rules/safety.md`) controls how much scrutiny a change gets
and whether it can be auto-*implemented* in a branch; it never controls
whether approval is required before merge/deploy. Read-only analysis
(reports, proposed tasks) needs no approval — only a change to what ships
does.

## The real approval mechanism

**MediaPilot Approvals board**: https://claude.ai/artifact/CQTHC3soZdr372oyzyC3Us

A live, persistent page (Claude Artifacts `db` capability — a real hosted
document store, not a spreadsheet or a markdown checkbox) with Approve/Reject
buttons per task. This is not simulated: clicking a button writes a real,
versioned document to a real database that any agent can read back via the
Artifact tool's `read_db`. Write access to the shared `approvals` collection
is restricted to `admin` level (the artifact owner) — see the `db` capability
rules declared on the page — so only the account that owns this artifact can
approve or reject; a reader-level share could view but not decide.

**Email is not wired up.** No email connector (Gmail/Outlook/etc.) or
transactional email API (Resend/etc.) is connected to this environment —
confirmed via the MCP connector status check, not assumed. Until one is
connected, agents notify via `PushNotification` (a real, already-available
desktop/mobile push) with a one-line summary and the board URL. See
`docs/database-decision.md` and the final report in this task's
conversation history for exactly what's needed to add real email.

## Approval record schema (one document per task, in the `approvals`
collection, doc id = task id)

```
title            string
problem          string  — what was detected
evidence         string  — numbers, commands, log lines; never empty
proposedSolution string
filesChanged     string[]
diffSummary      string
testsExecuted    string  — command(s) + pass/fail
buildResult      string  — pass/fail
riskLevel        "LOW" | "MEDIUM" | "HIGH"
expectedImpact   string
rollbackPlan     string
previewUrl       string | null  — null is honest; no staging env exists yet
branch           string
commitSha        string  — the exact commit this approval covers
status           "pending" | "approved" | "rejected"
createdAt        ISO 8601
decidedAt        ISO 8601 | null
```

## Security rules (non-negotiable, enforced by construction where possible)

1. **One task, one document, one decision.** Each approval record lives at
   its own `approvals/<taskId>` path and the page's Approve/Reject buttons
   only ever write to the document currently rendered on that card — there
   is no generic "approve" action that could resolve to the wrong task.
   An approval for one task id must never be read as covering another.
2. **Rejected tasks are not retried.** A `rejected` document is never
   flipped back to `pending`/`approved` by any agent or by the page itself.
   A genuinely new attempt at the same underlying issue gets a **new task
   id** (e.g. append `-v2` or a new date) and a fresh, full approval record
   — it inherits no approval from its predecessor.
3. **Stale approvals are void.** An `approved` record is only valid for the
   exact `commitSha` it names. Before merging, an agent must confirm the
   branch's current HEAD commit still matches that SHA. If the branch moved
   (amended, rebased, or further commits added) after approval, treat it as
   unapproved and file a fresh record — do not merge on an old approval
   against new code.
4. **No agent sets `status` to `approved` or `rejected`.** Only a human
   clicking the button on the board does that (enforced by the `write:
   "admin"` rule — the artifact owner's click, not an agent's API call).
   Agents only ever create records at `status: "pending"` and read the
   result back.
5. **No merge/deploy without a confirmed, fresh `approved` read.** An agent
   proposing to merge must `read_db` the specific task id immediately
   before acting, not rely on a cached belief that it was approved earlier
   in the conversation.

## What this does NOT cover yet

A rejected/approved decision has no expiry timestamp of its own beyond the
commit-SHA staleness check above — if you want records to also expire after
N days regardless of commit match, that's a small addition to the schema
(`expiresAt`) and the board's render logic, not built speculatively here
since no concrete need for it has come up.
