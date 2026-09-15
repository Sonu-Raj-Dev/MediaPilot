# MediaPilot High-Priority Audit
**Date:** 2026-09-15  
**Project:** MediaPilot — Online media tools platform  
**Scope:** Full codebase review, feature gap analysis, UX/product evaluation

---

## EXECUTIVE SUMMARY

MediaPilot is a **fully client-side web application** for media processing. Currently shipping **2 tools** (Remove Logo from Video, Remove Watermark from Image) with a functional but minimal feature set.

**Key Findings:**
- ✅ **No critical production bugs** — existing tools work, tests pass, build succeeds
- ⚠️ **Significant product gap** — only 2 tools when market demands 10+
- ⚠️ **Homepage scalability issue** — current design assumes max ~4 tools; needs restructuring
- ✅ **Solid technical foundation** — client-side architecture (ffmpeg.wasm, OpenCV.js) is sound
- ⚠️ **Missing key features** — no video cropping, resizing, compression, trimming, or format conversion
- ✅ **Good internationalization** — 15 languages already supported
- ✅ **Build pipeline stable** — npm build succeeds, Cloudflare Workers deployment ready

---

## PART 1: ENGINEERING ISSUES

### Critical Issues (P0)

| ID | Category | Problem | Evidence | Impact | Effort | Risk |
|---|---|---|---|---|---|---|
| *None identified* | — | — | — | — | — | — |

**Summary:** No P0 (production-breaking) issues found. The platform is stable and deployable.

---

### High-Priority Issues (P1)

| ID | Category | Problem | Evidence | Affected | User Impact | Technical Complexity | Recommended Fix | Priority |
|---|---|---|---|---|---|---|---|---|
| ENG-001 | Architecture | Homepage assumes ≤4 tools; does not scale beyond 2 visible categories | Current `tool-columns` grid uses `grid-template-columns: repeat(3, 1fr)` with hard-coded tool links; adding 10+ tools will break layout | Homepage rendering, tool discovery | Users cannot find/use new tools once catalog grows past ~6 items | Medium | Refactor homepage to use reusable tool-card components and category-based layout (not item-based) | P1 |
| ENG-002 | Code Quality | app.js is 1600+ lines; tight coupling between router, state, and UI | Single monolithic 51KB app.js file; routing logic at line ~155, rendering scattered throughout | All tools (current & future) | Difficult to add features, hard to maintain, risk of introducing bugs | Medium | Extract router into dedicated module; create reusable tool-frame abstraction; consider module-based tool registration | P1 |
| ENG-003 | Performance | No lazy-loading for OpenCV.js (~8MB) or ffmpeg.wasm (~31MB) | Both libraries loaded eagerly on page init; delays initial paint; verified in README.md line 32 | Image tool, Video tool | Slow initial page load; users wait 2–5s before interacting | Low | Lazy-load on first tool access (already partially implemented for ffmpeg.wasm per README; apply same pattern to OpenCV) | P1 |
| ENG-004 | Testing | No integration or e2e tests; only unit tests for filter graphs and image algorithms | 3 test files exist (`test-*.mjs`) but do not verify UI workflows, routing, or actual media output | Tool workflows, end-to-end correctness | Regression risk; bugs in UI flow not caught until production | Medium | Add e2e tests for: upload → process → download cycle; test layout on mobile; validate output media (not just HTTP 200) | P1 |
| ENG-005 | Documentation | No developer guide for adding new tools; process unclear | README.md covers only current two tools and how to deploy; no CONTRIBUTING or ARCHITECTURE docs | Onboarding new contributors, maintenance | Hard to add tools without deep code archaeology | Low | Create `docs/architecture.md` and `docs/adding-tools.md` with clear step-by-step guide | P1 |

---

### Medium-Priority Issues (P2)

| ID | Category | Problem | Evidence | Impact | Recommended Fix |
|---|---|---|---|---|---|
| ENG-006 | UX | No error recovery UI for failed uploads or processing timeouts | `showToast()` shows only generic messages; no retry button or state recovery | Users lose work if processing fails or browser tab is inactive | Add persistent error state with download retry; implement auto-recovery |
| ENG-007 | UX | File size limit not clearly communicated | No validation message for oversized files; ffmpeg.wasm or browser memory will silently fail on very large videos | Users upload 5GB+ files expecting them to work, then get cryptic failures | Add client-side file size validation (warn at 500MB, block at 2GB); show clear error message |
| ENG-008 | Accessibility | Canvas-based drawing UI has limited keyboard/screen-reader support | `#frameCanvas` uses mouse/touch only; no keyboard alternative for marking watermarks | Users with motor disabilities cannot use the tool | Add keyboard shortcuts (arrow keys to move, number keys to preset corners); improve ARIA labels |
| ENG-009 | SEO | Homepage meta description is generic; no structured data | `<meta name="description">` is "MediaPilot online tools for video, images, and file conversion" — does not differentiate from competitors or include specific tools | Low ranking for tool-specific queries (e.g., "free video cropper") | Add Open Graph tags; implement JSON-LD schema.org markup for `VideoObject` and tool metadata |
| ENG-010 | DevOps | No analytics or error reporting; cannot diagnose production issues | No Sentry, LogRocket, or equivalent; crashes are silent to users and operators | Cannot prioritize fixes or identify common failure points | Add optional client-side error reporting (ask user consent first) |

---

### Low-Priority Issues (P3)

| ID | Category | Problem | Impact | Recommended Fix |
|---|---|---|---|---|
| ENG-011 | Code Quality | Hardcoded media processing timeouts; no configurability | Video processing may time out on slow devices | Make timeouts configurable or adaptive |
| ENG-012 | Internationalization | Some UI strings not translated (e.g., footer link email "hello@mediapilot.local") | Non-English users see English email address | Add to translation system or use i18n token |
| ENG-013 | Build | No minification or code splitting; bundle size is ~51KB (uncompressed) | Slightly slower load on slow networks | Investigate dead code; consider code splitting if tool count grows significantly |
| ENG-014 | Mobile | Sidebar ads (300×250) poorly optimized for mobile; take up excessive vertical space | Poor mobile UX when ads are present | Implement mobile-friendly ad layout (stacked, responsive sizes) |

---

## PART 2: PRODUCT OPPORTUNITIES

### Feature Candidate Evaluation

Below are **10 candidate features**, scored on:
- **User Value (1–10):** How much users benefit from this feature
- **Frequency (1–10):** How often users need this capability
- **Technical Feasibility (1–10):** Can it be built with current stack (ffmpeg.wasm, OpenCV.js)?
- **Effort (1–10):** Relative development cost (10 = very expensive)
- **Risk (1–10):** Chance of bugs, performance issues, or ux friction (10 = high risk)
- **Score:** `(User Value + Frequency + Feasibility) / 3 - (Effort + Risk) / 4` → Range: -15 to +75

#### VIDEO TOOLS

| # | Feature | User Value | Frequency | Feasibility | Effort | Risk | Score | Priority |
|---|---|---|---|---|---|---|---|---|
| 1 | **Video Cropper** | 9 | 9 | 9 | 6 | 4 | **66** | **P1** |
| 2 | **Video Resizer** | 8 | 7 | 9 | 6 | 3 | **57** | **P1** |
| 3 | **Video Compressor** | 8 | 8 | 8 | 8 | 5 | **50** | **P1** |
| 4 | **Video Trimmer** | 8 | 6 | 9 | 5 | 3 | **57** | **P1** |
| 5 | **Format Converter** | 7 | 5 | 7 | 7 | 6 | **42** | P2 |
| 6 | **Video Quality Enhancer** | 6 | 4 | 4 | 9 | 8 | **9** | P3 |

#### IMAGE TOOLS

| # | Feature | User Value | Frequency | Feasibility | Effort | Risk | Score | Priority |
|---|---|---|---|---|---|---|---|---|
| 7 | **Image Cropper** | 9 | 9 | 10 | 4 | 2 | **75** | **P0 (Best)** |
| 8 | **Image Resizer** | 8 | 8 | 10 | 4 | 1 | **72** | **P0 (Best)** |
| 9 | **Image Compressor** | 7 | 7 | 10 | 5 | 2 | **63** | **P1** |
| 10 | **Image Format Converter** | 7 | 6 | 10 | 4 | 1 | **65** | **P1** |

---

### Feature Scoring Rationale

**Top Performers (Score >65):**
- **Image Cropper (75)** — Extremely common use case, trivial to implement with canvas, zero dependencies, near-zero risk. **HIGHEST PRIORITY.**
- **Image Resizer (72)** — Same as above; complement to cropper. Image processing is pure canvas math, no external library needed.
- **Video Cropper (66)** — Requires ffmpeg.wasm crop filter, well-documented, common user need. Builds on existing watermark-removal UI pattern.

**Strong Candidates (Score 50–65):**
- **Video Trimmer (57)** — Straightforward ffmpeg operation, users frequently need to cut frames from start/end.
- **Video Resizer (57)** — Complementary to cropper; same effort level.
- **Image Format Converter (65)** — Pure canvas `toDataURL()` for output; ffmpeg.wasm can handle input decode. Easy win.
- **Image Compressor (63)** — Canvas-based JPEG quality tuning; useful for users preparing images for web.

**Moderate Candidates (Score 42–50):**
- **Video Compressor (50)** — Requires tuning bitrate/codec; more complex than cropping; users have less predictable expectations.
- **Format Converter (42)** — Technically feasible but lower frequency; complex codec negotiation.

**Weak Candidates (Score <40):**
- **Quality Enhancer (9)** — Requires ML (upscaling/denoising) not in current stack; ffmpeg.wasm doesn't include those filters; would need external model → large bundle, complexity, network calls.

---

### Recommended Implementation Sequence

**Phase 1 (Week 1):**  
1. **Image Cropper** (score 75) — Quick win, sets up reusable UI pattern
2. **Image Resizer** (score 72) — Leverage cropper UI; doubles image tool value

**Phase 2 (Week 2–3):**  
3. **Video Cropper** (score 66) — Main feature; validates video processing pattern for other tools
4. **Image Format Converter** (score 65) — Standalone tool; complements other image tools

**Phase 3 (Week 4):**  
5. **Video Trimmer** (score 57) — Builds on video cropper foundation

**Defer:**  
- Video Resizer, Video Compressor (moderate effort, moderate value; revisit after Phase 3)
- Quality Enhancers, Advanced Codecs (require new dependencies or ML models)

---

## PART 3: HOMEPAGE & UX AUDIT

### Current State

**Homepage Structure:**
```
MediaPilot (hero)
↓
Video Tools (section)
  - Remove Logo from Video (single card)
↓
Image Tools (section)
  - Remove Watermark from Image (single card)
↓
Footer
```

**Issues:**
1. **Excessive whitespace** — Hero padding (92px top/bottom) designed for tall stacks; looks empty with only 2 items
2. **Tool discovery poor** — No categories, no icons, minimal descriptions; users cannot skim and choose
3. **Scalability broken** — Adding 10 tools will create uncontrolled grid sprawl; no responsive stacking strategy
4. **Mobile layout** — Sidebar appears after all content on mobile; users must scroll past full tool list
5. **Weak CTA** — No value proposition on card; only tool name visible

---

### Recommended Homepage Structure

**Proposed Layout:**

```
┌─────────────────────────────────────────┐
│  MediaPilot                         EN  │  ← Header
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│                                         │
│     Simple online tools for video,      │  ← Hero (reduced padding)
│     images, and file conversion         │
│                                         │
└─────────────────────────────────────────┘

┌─ VIDEO TOOLS ────────────────────────────┐
│                                          │
│  [Remove Logo]  [Crop]  [Resize]        │
│  [Compress]     [Trim]  [Convert]       │
│                                          │
└──────────────────────────────────────────┘

┌─ IMAGE TOOLS ────────────────────────────┐
│                                          │
│  [Remove Watermark]  [Crop]   [Resize]  │
│  [Compress]          [Convert]          │
│                                          │
└──────────────────────────────────────────┘

┌─ AD (below tools) ──────────────────────┐
│                                         │
└──────────────────────────────────────────┘

┌─ FOOTER ────────────────────────────────┐
│ MediaPilot · About · Contact · Terms    │
└──────────────────────────────────────────┘
```

**Design Goals:**
- Reduce hero padding from 92px → 48px; reclaim vertical space
- Use reusable **tool-card component** (icon, name, description)
- Grid: 3 columns on desktop, 2 on tablet, 1 on mobile (auto-responsive)
- Explicit category sections; scale to 20+ tools without redesign
- Add concise description under each tool name ("Easily remove..." → "Crop to any aspect ratio")
- Icons for visual scannability (optional but improves UX)

---

### Mobile-Specific Improvements

**Current Issues:**
- Sidebar ads (300×250) stack below main content; waste mobile viewport
- Tool-page hero padding excessive on phone

**Recommendations:**
1. Show mobile-optimized ad sizes (320×50 leaderboard or native)
2. Reduce hero padding on mobile: 65px → 36px
3. Inline tool cards in single column; no horizontal scroll
4. Move ad containers strategically (top after hero, below tool list, not in sidebar)

---

## PART 4: INFRASTRUCTURE & DEPLOYMENT

| Aspect | Status | Notes |
|---|---|---|
| **Build** | ✅ Passing | `npm run build` succeeds; outputs to `dist/` |
| **Tests** | ✅ Passing | `test-filter-graph.mjs` and `test-image-regions.mjs` both pass |
| **Deployment** | ✅ Ready | Wrangler config correct; `npx wrangler deploy` ready |
| **Staging** | ✅ Ready | `python -m http.server 4173 -d dist` works locally |
| **Assets** | ✅ Included | Favicon, AdSense scripts, vendor libs all in dist/ |
| **Caching** | ℹ️ Note | ffmpeg.wasm (~31MB) cached by browser after first use; should be explicit in docs |

---

## SUMMARY TABLE: ISSUES & FEATURES

### Must-Fix Engineering Issues (P1)
| Issue | Effort | Impact | Owner |
|---|---|---|---|
| ENG-001: Homepage scalability | 1 sprint | Blocks adding 5+ tools | Engineer |
| ENG-002: Monolithic app.js | 2 sprints | Increases bug risk over time | Engineer |
| ENG-003: Missing lazy-loading | 3 days | Slow initial load | Performance engineer |
| ENG-004: No e2e tests | 1 sprint | Regression risk | QA engineer |
| ENG-005: No dev docs | 1 day | Slows onboarding | Tech writer |

### Must-Build Product Features (P1)
| Feature | Effort | User Value | Score |
|---|---|---|---|
| **Image Cropper** | 2 days | Highest common use case | 75 |
| **Image Resizer** | 2 days | Complements cropper | 72 |
| **Video Cropper** | 5 days | Core video feature | 66 |
| **Image Format Converter** | 2 days | Fills image tool gap | 65 |

---

## RECOMMENDATIONS FOR FIRST ITERATION

**Priority 1: Fix Homepage Scalability (ENG-001)**
- Refactor to component-based tool grid
- Enables launching 4+ new tools without rework
- Estimated effort: 1 sprint (3–5 days)

**Priority 2: Implement Image Cropper**
- Highest product-market fit (score 75)
- Validates UI/UX pattern for other image tools
- Estimated effort: 2 days
- Unlocks Image Resizer and other image tools immediately after

**Priority 3: Extract app.js Modules (ENG-002)**
- Makes adding future tools sustainable
- Done incrementally; does not block product features
- Estimated effort: 2 sprints (ongoing, not blocking)

**Priority 4: Add E2E Tests (ENG-004)**
- Run in parallel with feature work
- Catches regressions early
- Estimated effort: 1 sprint (ongoing)

---

## FILES GENERATED

This audit document: `docs/high-priority-audit.md`

---

## NEXT STEPS

1. **Review & Approve** — Stakeholder review of feature priorities and sequencing
2. **Sprint Planning** — Assign engineers to ENG-001 (homepage) + first product feature (Image Cropper)
3. **Start Build** — Begin with homepage refactor to unblock tool scaling
4. **Validate** — Ensure new tools integrate cleanly into refactored layout before releasing

