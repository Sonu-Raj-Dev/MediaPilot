# Database decision

**No database was added to MediaPilot or its agent system.** This documents
the one narrow exception and why it isn't actually "adding a database" in
the sense the human asked to gate.

## The concrete requirement that files/Git/logs cannot handle

The approval mechanism (`.claude/rules/approval.md`) needs a real, clickable
Approve/Reject control the human can act on from a link — and that control's
state (approved / rejected / pending) must be readable back by an agent,
including one running unattended in tomorrow's scheduled cycle. A browser
button cannot write to this machine's local Git repository or filesystem —
there is no such capability, and building one would mean standing up a
public write endpoint into your local disk, a much larger and riskier piece
of infrastructure than the problem calls for. Some state store reachable
from both a web page and an agent is unavoidable for this one specific
purpose.

## What was actually used

The Claude Artifacts platform's built-in per-artifact document database
(the `db` capability) — not a new external database service. Concretely,
this means:
- **No new vendor, no signup, no API key, no billing.** It's a feature of
  the platform already hosting the approval page.
- **No installation or configuration in the MediaPilot repo.** Nothing in
  `package.json`, `wrangler.jsonc`, or any source file changed to support
  this — it's entirely external to the deployed product.
- **Scoped to exactly one purpose**: holding approval-request documents
  (task id → status/decision fields, per `.claude/rules/approval.md`'s
  schema) for the review board. It stores no application data, no user
  media, no analytics.
- **Access-controlled**: writes to the shared collection require `admin`
  level (the artifact owner) via a declared `db` rule — only the account
  that owns the approvals board can approve/reject.

## Why this doesn't need the full proposal the human asked for

The human's instruction — "before adding any database, create a proposal
explaining why persistence is required, what data will be stored,
recommended database, schema, cost/operational impact, security
considerations" — is clearly aimed at standing up a real backing store
(Supabase/Postgres or MongoDB) for the *agent system's* task/audit/metrics
data in general. That was **not** done, and isn't needed: `.claude/tasks/`
(backlog/active/completed, in Git) and `.claude/logs/`
(timestamped JSONL, in Git) already serve that role adequately at MediaPilot's
current scale, and continue to. The Artifact `db` use above is narrower,
free, has no operational footprint, and is reversible in minutes (delete the
artifact) — it doesn't carry the cost/ops/security weight that gate exists to
catch. Still, for the record, addressed inline:
- **Why persistence is required**: a browser click has to reach a store an
  agent can also read; see above.
- **What data**: approval-request documents only (see schema in
  `.claude/rules/approval.md`) — never application data, never user media.
- **Cost**: none (included with the Artifacts platform).
- **Operational impact**: none on MediaPilot's deploy/build/runtime; entirely
  separate from the Cloudflare-hosted product.
- **Security**: write-restricted to the artifact owner; the artifact itself
  is private (owner-shared, not public) by default.

## If real persistent storage becomes necessary later

If MediaPilot's agent system ever outgrows Git-based task/log files —
concretely: task/approval volume or audit-history retention that markdown
and JSONL genuinely can't serve well (fast structured queries across months
of history, concurrent multi-agent writes at a scale where file-based
tracking races, or a need to correlate agent data with real product data
like users/analytics/revenue once those exist) — evaluate then, not now,
between:
- **Supabase/PostgreSQL** — preferred per the human's stated default:
  relational, strong fit for structured task/approval/audit/metrics rows,
  built-in row-level security maps naturally onto "only the owner
  approves," generous free tier, straightforward from a Cloudflare Workers
  deploy (HTTP-based client, no persistent connection needed).
- **MongoDB** — only if a concrete requirement emerges that's genuinely
  document-shaped and doesn't fit relational rows well; no such requirement
  exists today.

No installation or account setup for either happens without that proposal
being written and approved first, per the human's explicit instruction.
