# OPEN ITEMS

Every TODO, unverified claim, missing asset and credibility gap. Format: **ID — item — what closes it**. IDs correspond to `docs/_state/LEDGER.md` rows where one exists.

Rule: nothing enters `README.md` or `docs/0x_*.md` as a number, date or claim unless it traces to a ledger row. Everything below is either `TODO: needs input` or explicitly labelled unverified.

---

## A. Blocking inputs (asked once, in `docs/_state/INTERVIEW.md`)
- **OPEN-001** — Product one-liner, primary persona, "aha moment" (Group A). *Closes with:* interview answer.
- **OPEN-002** — Which of the 17 default-off feature flags work today vs are planned (B1).
- **OPEN-003** — Explicit non-goals / unsupported cases (B2).
- **OPEN-004** — Named competitors + differentiation claim (C1).
- **OPEN-005** — All metrics + provenance + headline numbers (D1/D2). **No benchmark, coverage, latency, cost or usage file exists in the repo.**
- **OPEN-006** — Phase-by-phase journey incl. failures (E1).
- **OPEN-007** — Real deployment topology; do the 8 agents actually run on Cloud Run today (F1).
- **OPEN-008** — Mandatory vs optional external services for a first run (F2).
- **OPEN-009** — Privacy/retention/compliance posture + status of `tmp_pdf/page_*.png` (F3).
- **OPEN-010** — Business model, pricing, licence confirmation (G1).
- **OPEN-011** — Documentation audience priority + public/private repo (H1/H2).
- **OPEN-012** — Second-drive path + publishable assets (I1/I2).
- **OPEN-013** — Roadmap + next asks (J1).

## B. Missing assets (Phase 2 blocked)
- **OPEN-020** — **No product screenshots exist anywhere in the repo.** Capture shortlist (only with user permission; I will not start the app otherwise): (1) sign-in, (2) student dashboard, (3) `QuestionView` reasoning gate + help levels 1–4, (4) integrity consent/violation screen, (5) student results with CIS + topic heatmap, (6) lecturer dashboard, (7) assignment analytics, (8) live session monitor, (9) empty states, (10) mobile layout.
- **OPEN-021** — Only brand asset is `public/branding/logo.png` (636 KB; no SVG found). `index.html` references `/og-preview.png`, which **does not exist** → broken social preview.
- **OPEN-022** — No demo video, GIF, sample dataset or sample PDF. `tmp_pdf/page_1..4.png` are page renders of an unidentified document.
## C. Broken / risky things found by reading (nothing was executed)
- **OPEN-030** — `convex/agentAPI.ts`: 7 agent-facing internal endpoints are stubs — `getStudentHistory` returns `[]`, `getCohortData` returns `null`, `updateCISScore` / `logTopicPerformance` / `saveSessionRecord` return `null`, several marked `// TODO: implement logic`. No doc may claim the agentic layer persists analytics until this is confirmed.
- **OPEN-031** — `agents/src/memory/vector_search_mock.ts` — vector search is mocked.
- **OPEN-032** — Two docs disagree with the code: `PROJECT_AUDIT.md` says "no test framework installed" (stale — `"test": "vitest run"` plus `convex/domain/aiPolicy.test.ts` exist) and `AGENTS.md` says "No test runner is currently configured" (also stale).
- **OPEN-033** — `AGENTS.md` is materially out of date: missing `/agents`, `convex/api|application|domain|infrastructure|dashboard`, the 24 feature flags, 4 cron jobs, Resend, and it claims a **two-role** system when the schema defines **three** (`student`, `lecturer`, `organizationAdmin`).
- **OPEN-034** — Threshold conflict: `VIOLATION_LIMITS.autoSubmitViolations = 5` (`convex/constants.ts`) vs "auto-submit after 3 tab switches" (brief/`AGENTS.md`). Confirm the real rule before documenting it.
- **OPEN-035** — Four scoring paths coexist: `computeFinalIndependenceScore` (0.5/0.35/0.15), CIS-v1 (`100 − 15·level − 5·count + bonus`), `computeCognitiveScore` (0.4/0.3/0.2/0.1 × difficulty), and `COGNITIVE_WEIGHTS`. Which is canonical (and which is still shown in the UI) needs a decision.
- **OPEN-036** — Hard-coded deployment URL `https://dynamic-alpaca-596.convex.cloud` in `stressTest/cogait_stress_test.mjs:10` and as the agent fallback baseURL in every `agents/src/agent*/index.ts`. Decide publishability.
- **OPEN-037** — `getDifficultyMultiplier` (1.2/1.1/1.0) contradicts `DIFFICULTY_MULTIPLIERS` (0.8/1.0/1.2).
- **OPEN-038** — Large binaries in the working tree: `project.zip`, `cogait_backup.zip`, `cogait-ui-export.zip`. `.gitignore` now ignores `*.zip`; confirm they are not needed as doc sources.
- **OPEN-039** — Overlapping stale outputs that must not appear as "active code" in the repo map: `dist/`, `dist-validation/`, `dist-validation-2/`, `ui_export_unpacked/`, `_ui_replacement/`, `.tmp_sim/`. Nothing may be deleted (safety rule).
- **OPEN-040** — `src/.ProfileMenu.tsx.swp` — stray Vim swap file inside `src/`.
- **OPEN-041** — No CI: `.github/` absent; `agents/deploy/cloudbuild-agent*.yaml` exist with no triggers; no pipeline for frontend or Convex.
- **OPEN-042** — English-only (`<html lang="en">`, English prompts) while the audience is JEE/NEET. Candidate non-goal.
- **OPEN-043** — `convex/router.ts` exposes two **data-export** endpoints (`GET /export/assignment`, `GET /export/institution`) and an AI proxy (`POST /api/gemini-proxy/openai/v1/chat/completions`) whose auth posture is not yet read. Needs a security review before any public-deployment claim.
- **OPEN-044** — `AGENTS.md` states every function must declare a return validator, yet `convex/agentAPI.ts` uses `returns: v.any()` with a `// TODO` — the convention is not applied consistently.
- **OPEN-045** — Theme mismatch: `index.html` still sets `body { background: #0a0a0f; }` (dark) and `src/App.tsx` keeps `spatial-*` classes, while the toaster is styled light (`#ffffff` / `#202124`) — evidence that the `_ui_replacement` redesign is only partly applied. Confirm the intended visual identity before taking screenshots for the docs.

## D. Evidence that would most strengthen credibility (by audience)
For **investors / partners**
1. One measured end-to-end run: N students × M questions, with p50/p95 latency per AI turn and USD cost per help request, exported from `aiInteractions` (latency + tokens are already stored per interaction).
2. Pre/post result: CIS distribution before vs after the tiered-help gate on the same cohort.
3. Any pilot detail: institution (or anonymised), cohort size, dates, lecturer quotes.

For **customers / lecturers**
4. A 60–90 s screen recording of the real student flow (reasoning gate → level escalation → auto-submit) plus the lecturer analytics view.
5. A published "leak rate": how often a level-4 response still contains the final answer. `aiViolations` already logs candidate violations, so this is computable from real data.

For **developers / contributors**
6. A transcript of `npm test`, `npx tsc -p convex --noEmit`, `npx tsc -p . --noEmit` and `npm run validate:runtime` with versions and pass counts. *Note:* `runtimeValidation` and the stress suite read source files and call a live deployment, so I will only run them in a scratch copy, with your permission.
7. A coverage number for `convex/domain/*` (currently 1 test file, 8 cases) and a decision on OPEN-035 so tests can assert one canonical formula.

## E. Safety / process notes
- **OPEN-050** — Before any command is executed (install, build, typecheck, test, `convex dev`, app start), get explicit approval: `.env.local` holds live keys per `PROJECT_AUDIT.md` §7, and the repo is a live-connected project — a build or `convex dev --once` would touch a real deployment.
- **OPEN-051** — The two commit-ready items from `PROJECT_AUDIT.md` §7 are still open in the working tree (large ZIPs present; secret files present but `.gitignore`d). I will not act on them; they are recorded for the eventual `SECURITY.md` and `docs/12_roadmap.md`.


