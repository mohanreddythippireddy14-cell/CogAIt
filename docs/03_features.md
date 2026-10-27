# Features & Status

CogAIt is a working prototype. "Working" below means implemented and exercised by the code paths described, not production-proven.

## Feature matrix

| Feature | Status | Notes |
|---|---|---|
| Student assignment flow (JEE/NEET style) | Working | Questions, drafts, navigator, timer, results |
| Socratic AI tutor, 4 help levels | Working | `convex/ai.ts`; optional routing through Agent 1 |
| Answer-leak validator + regeneration + fallback | Working | `convex/domain/aiPolicy.ts`, unit-tested |
| Help limit: 5 per 5 min, 30 s apart, per student | Working | `convex/application/aiService.ts`, unit-tested |
| Image feedback on handwritten work | Working | Same leak validator; a violating reply is replaced by the fallback question (no regeneration) |
| Math rendering | Working | MathJax (loaded from CDN) |
| Exam integrity (tab-switch, copy/paste, auto-submit after 5 violations) | Working | `QuestionView.tsx`, `convex/sessionLocks.ts` |
| CIS, independence and cognitive scores; topic heatmap | Working | `convex/domain/scoring.ts`, [CIS_SPEC](CIS_SPEC.md), [HEATMAP_SPEC](HEATMAP_SPEC.md) |
| Lecturer dashboards, AI assignment generation from PDF/text | Working | Convex + Gemini |
| Agent layer (analysis, remediation, reports, briefings, judge) | Beta | See the agent table in the [README](../README.md#the-agent-layer) |
| **Think-first gate** (minimum reasoning before help) | **Planned** | `minReasoningChars` is stored per assignment (default 30) but not enforced |
| Organisation rate limit, cost governance, admin dashboard | Behind flags, off | Code exists in `convex/rateLimits.ts`, `convex/costGovernance.ts` |
| AI regression enforcement | Behind flag, off | Blocks invalid replies instead of serving the fallback |
| Multi-institution white-label (B2B) | Planned | Data model is organisation-scoped already |

## Out of scope
CogAIt deliberately does **not** support:
- **Instant solutions.** The AI never provides a final numerical answer or a completed step-by-step solution.
- **Passive learning.** No feature lets a student skip the attempt-first phase.

It is currently tuned for STEM (Physics, Chemistry, Math), in English, as a web app (no native mobile or offline mode).
