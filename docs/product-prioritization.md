# Product Opportunity Scoring

How the Autopilot chooses which opportunity to build next from a list of
candidates, and how to score both product opportunities AND maintenance work
(bug fixes, performance improvements, etc.).

## The scoring formula

```
Score = (User Value × Business Value × Evidence Strength) - (Effort × Risk)
```

All inputs are 1–5 scales. Result range: roughly -15 (high effort/risk, low
value) to +75 (high value, low effort/risk).

### Input definitions

**User Value** (1–5)
- How much does this improve the user experience?
- 1 = nice-to-have, doesn't solve a real problem
- 2 = solves a minor pain point (misspelled button text)
- 3 = solves a moderate pain point (can't crop video)
- 4 = solves a major pain point (tool crashes on 10% of files)
- 5 = removes a blocker that stops users cold (can't process the file format
  they need)

**Business Value** (1–5)
- How much does this improve MediaPilot's business metrics? Consider: growth,
  retention, revenue, competitive positioning.
- 1 = no business impact (nice polish)
- 2 = vanity metrics only (more page views, not more completions)
- 3 = plausible impact (might improve retention by a small %)
- 4 = meaningful impact (likely improves completion rate by >5%)
- 5 = game-changer (major revenue opportunity, or retention killer if we
  don't fix)

**Evidence Strength** (1–5)
- How confident are you this is real?
- 1 = pure guess, no data
- 2 = hypothesis based on heuristics
- 3 = some data or competitive evidence
- 4 = strong user demand signals or analytics data
- 5 = confirmed blockers (bug report + reproducible test case, or high-traffic
  SEO keyword with zero pages ranking)

**Effort** (1–5)
- How much work is this? (coding + testing + deployment prep, not approval
  gate which is outside the estimate)
- 1 = trivial (one-line fix or config change)
- 2 = small (under 200 lines, no new dependencies, self-contained)
- 3 = medium (200–1000 lines, maybe refactoring some shared logic)
- 4 = large (1000+ lines, new pipeline or cross-tool changes)
- 5 = architectural (new tech stack, backend, major rewrite)

**Risk** (1–5)
- Per `.claude/rules/safety.md`, LOW/MEDIUM/HIGH map to numeric risk as
  follows:
- 1 = LOW risk (additive, reversible, no deletion, no new dependencies)
- 2 = LOW–MEDIUM transition (touches existing logic but scoped, or adds new
  code in isolation)
- 3 = MEDIUM risk (affects core logic, processing pipeline, or data flow)
- 4 = HIGH risk (touches infrastructure, auth, billing, ad policy, or involves
  deletion/architecture change)
- 5 = HIGHEST risk (production deploy, wrangler.jsonc, data destructive)

## Worked examples

### Example 1: Fix a typo in the image-tool button

- User Value: 1 (doesn't affect function)
- Business Value: 1 (not why users abandon)
- Evidence Strength: 5 (we can see the typo)
- Effort: 1 (one-word fix)
- Risk: 1 (LOW, purely additive)

**Score** = (1 × 1 × 5) - (1 × 1) = 5 - 1 = **4**

Verdict: Ship it if you're already working on the tool; otherwise, not worth
a dedicated run.

### Example 2: Video cropping feature

- User Value: 4 (users repeatedly ask for aspect-ratio adaptation for social
  media)
- Business Value: 3 (might increase completion rate; social-media creators are
  valuable users)
- Evidence Strength: 3 (feature requests + market research suggesting demand,
  but no proprietary data yet)
- Effort: 3 (medium — new UI, new ffmpeg filter, new test cases)
- Risk: 2 (touches processing pipeline, but scoped to one feature)

**Score** = (4 × 3 × 3) - (3 × 2) = 36 - 6 = **30**

Verdict: High priority. Worth scheduling a dedicated day for this.

### Example 3: Add SEO landing pages for "how to remove watermark from video"

- User Value: 2 (users already have the tool; these pages don't improve the
  tool itself)
- Business Value: 4 (high-traffic keywords = more users discovering the tool)
- Evidence Strength: 4 (GSC data showing we rank #15 for this keyword, organic
  competitors rank #1–5, keyword has 1000+ monthly searches)
- Effort: 2 (write one blog post, add structured data, relink)
- Risk: 1 (LOW, purely additive content)

**Score** = (2 × 4 × 4) - (2 × 1) = 32 - 2 = **30**

Verdict: Tied with video cropping; both are high priority. Autopilot picks one
based on: (a) which unblocks other work? (b) which is lower effort? (c) which
has lower risk? In this case, blog post is lower effort (2 vs 3), so do that
first.

### Example 4: Improve ffmpeg.wasm error messaging

- User Value: 3 (confusing errors hurt adoption when users hit edge cases)
- Business Value: 2 (might help retention by 1–2%, but not a primary driver)
- Evidence Strength: 2 (we see error messages in logs, but no specific user
  complaints — hypothesis only)
- Effort: 2 (add error detail to a few call sites)
- Risk: 2 (touches error handling, but low risk of breaking happy path)

**Score** = (3 × 2 × 2) - (2 × 2) = 12 - 4 = **8**

Verdict: Medium priority. Worth doing if you're optimizing error handling for
other reasons, but not urgent.

## Why this formula? Why these dimensions?

**User Value × Business Value × Evidence Strength** amplifies the three things
that matter:
- A feature with high user value but no business impact is still worth
  building (user delight)
- A feature with high business value but low user value is suspicious — it
  might be a vanity metric
- A feature with high value but low evidence strength is a hypothesis, not
  proof — rank it lower than proven wins

**(Effort × Risk) subtracted** penalizes work that's hard or risky relative to
value. This keeps the system from over-engineering.

**Why not use ONLY revenue?** Because:
1. MediaPilot is a free tool. There's no revenue today, and monetization is
   optional. Optimizing for revenue alone would mean never building features
   that delight users.
2. Retention beats revenue. If you build features users love, revenue follows.
   If you optimize for revenue first, users leave.
3. Building a sustainable business means ship products people want, not squeeze
   every dollar from them.

## How Autopilot uses this score

1. **Generate opportunities** — Product Manager and Market Research agents
   identify candidates
2. **Score each one** — Apply this formula
3. **Rank by score** — Highest to lowest
4. **Select top item** — Pick the #1 score for implementation (or top 2 if
   they're both "small improvements" per the daily limit)
5. **Measure results** — After deployment, log what changed. Feed this back
   into next run's scoring to improve estimates.

## Calibration: why your estimates will be wrong (and that's fine)

- User Value is subjective. You might think something is 4, the user might
  think it's 2. That's okay — estimate honestly, measure after deployment.
- Evidence Strength should improve over time. Today you might score it 2
  (hypothesis). After analytics connects, it becomes 4 (data). That's the
  feedback loop working.
- Effort estimates are usually wrong. Say 2 (small), ship 3 (medium). That's
  part of the learning — adjust your estimates.

Over several runs, your estimates will calibrate. The system learns.

## Special case: bugs & maintenance

Bugs don't "have business value" in the same way features do. Reframe:

- **Critical bug** (crashes 10% of uses): User Value = 5, Business Value = 5
  (retention killer), Evidence = 5 (reproducible), Effort = 2–3, Risk = 2
  (focused fix)
  → Score = 50 – 6 = **44** (top priority)

- **Performance regression** (processing 20% slower): User Value = 3, Business
  Value = 3 (users abandon when it's slow), Evidence = 5 (measurable), Effort =
  2, Risk = 2
  → Score = 45 – 4 = **41** (high priority)

- **Broken test** (test-image-regions fails): User Value = 4 (this test
  prevents us from shipping broken image-tool), Business Value = 4 (we ship
  broken stuff without it), Evidence = 5 (test fails), Effort = 1 (fix the
  test), Risk = 1
  → Score = 20 – 1 = **19** (should fix before shipping anything else)

## Scoring conversation starters

If Autopilot asks "should we do X first or Y first?":
- What's the score for each?
- If they're tied, ask: which has lower risk? Shorter effort? Unblocks more
  work?
- If one is vastly higher-scored, do that one.
- If you disagree with the score, update the formula (maybe User Value should
  be higher, or Effort was underestimated). Re-score, then decide.

## One more rule: don't game it

The system can be gamed. You can claim high User Value for something trivial.
You can claim low Effort for something complex. Don't. The score is only useful
if the inputs are honest. Autopilot will measure the result after deployment —
if you claimed 4/5 user value for something that actually had 1/5, you'll see
that in the next run's analytics, and your credibility tanks.

Play honest.
