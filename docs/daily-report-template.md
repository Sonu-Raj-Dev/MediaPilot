# Daily Report — Template

**This is a template, not a live report.** MediaPilot has no analytics,
error-monitoring, revenue, or search-console integration today
(`docs/known-issues.md` #7; Phase 1 integration audit). Every section below
is a placeholder shape for the Analytics/SEO/Revenue/Performance agents to
fill in once its data source actually exists — do not invent numbers to make
this look populated. Until then, the Autopilot's daily run should output
this same structure with explicit `NO DATA SOURCE CONFIGURED` markers rather
than silently omitting sections.

```
# MediaPilot Daily Report — <date>
Compared against: <previous period date>

## Traffic
Users:            <n>  (Δ vs previous: <±n%>)  [NO DATA SOURCE CONFIGURED]
Sessions:         <n>  (Δ: <±n%>)               [NO DATA SOURCE CONFIGURED]
Top pages:        <ranked list>                 [NO DATA SOURCE CONFIGURED]
Top tools:        video vs image split           [NO DATA SOURCE CONFIGURED]
Traffic sources:  <breakdown>                    [NO DATA SOURCE CONFIGURED]
Search traffic:   <n>  (Δ: <±n%>)               [NO DATA SOURCE CONFIGURED — needs GSC]

## Processing
Success rate:       <%>  (Δ: <±pp>)   [NO DATA SOURCE CONFIGURED]
Failure rate:        <%>  (Δ: <±pp>)   [NO DATA SOURCE CONFIGURED]
Avg processing time: <s>  (Δ: <±%>)    [NO DATA SOURCE CONFIGURED]
Download rate:       <%>  (Δ: <±pp>)   [NO DATA SOURCE CONFIGURED]

## SEO
Indexed pages:      <n>                          [NO DATA SOURCE CONFIGURED — needs GSC]
Ranking changes:     <summary>                    [NO DATA SOURCE CONFIGURED — needs GSC]
Changes shipped today: <list from completed.md>   [derivable from .claude/tasks/completed.md]

## Revenue
RPM:                 <$>  (Δ: <±%>)    [NO DATA SOURCE CONFIGURED — no monetization integrated]
CTR:                 <%>  (Δ: <±pp>)   [NO DATA SOURCE CONFIGURED]
Estimated revenue:   <$>  (Δ: <±%>)    [NO DATA SOURCE CONFIGURED]

## Health
Major errors:         <list>                      [NO DATA SOURCE CONFIGURED — no error monitoring]
Performance regressions: <list>                    [derivable today from test/build timing trends
                                                     once tracked run-over-run — not yet tracked]
Test suite status:    node test-filter-graph.mjs && node test-image-regions.mjs &&
                       node test-script-wiring.mjs && node validate-media-contracts.mjs
                       → <pass/fail, from the actual last run>
Build status:          npm run build → <pass/fail, from the actual last run>
```

## What's real and reportable today, without any new integration

The **Test suite status** and **Build status** lines, and a **Changes shipped
today** line pulled straight from `.claude/tasks/completed.md`. That's the
entire truthful daily report available right now. Everything else needs one
of: Cloudflare Web Analytics (or similar), Google Search Console access, an
ad network integration, or an error-monitoring SDK — each a human-approved
addition per `.claude/rules/safety.md` and the relevant agent
(`analytics.md`, `seo.md`, `revenue.md`).
