# INVENTORY

Read this instead of rescanning the repo. One line per item. Everything here was observed by reading files in session 1 (2026-09-30); nothing was executed. `docs/_state/HASHES.txt` holds SHA1 + mtime for the 36 files that facts were drawn from — re-read a source only if its hash changed.

Legend: `[T]` = tracked at HEAD · `[U]` = untracked in working tree · `[?]` = significance unclear

---

## 1. Repo shape

- 193 files tracked at HEAD (`git ls-tree -r HEAD | wc -l`).
- **1 commit total**: `736400e` · 2026-04-12 · Mohan Reddy · message `"b"`. No branches other than `master`. ⇒ No usable history for CHANGELOG or an evolution timeline.
- Working tree is dirty **before** this session: 63 modified tracked files, 29 untracked paths, 1 deletion (`readme1.md`). Snapshot: `docs/_state/BASELINE_git_status.txt`.

### Top-level map
| Path | What it is | Status |
|---|---|---|
| `src/` | React 19 + Vite + TS + Tailwind frontend (proposal app) | active [T] |
| `convex/` | Convex backend: schema, auth, HTTP routes, crons, domain logic | active [T] |
| `agents/` | 8 Hono/Groq micro-agents + negotiation node + watchdog, Docker + Cloud Build files | active, partly stubbed [T] |
| `runtimeValidation/` | Source-invariant validators (phase3–phase8, tenant isolation, auth, rollback, AI question) | active [T] |
| `stressTest/` | `cogait_stress_test.mjs` v3 — black-box suite against a live Convex deployment | present [T] |
| `_ui_replacement/` | Whole alternative UI (Next.js/shadcn) + 15 handover MDs, dated 2026-04-14 | unmerged [U] |
| `ui_export_unpacked/` | Handful of exported component copies (`StudentResults.tsx` etc.) | artifact [U] |
| `dist/`, `dist-validation/`, `dist-validation-2/`, `agents/dist/` | Build outputs | artifacts [U]/ignored |
| `tmp_pdf/`, `.tmp_sim/`, `agents/.memory/` | Temp/PDF renders, sim copies, agent memory dumps | artifacts [U] |
| `docs/` | 4 pre-existing specs (`CIS_SPEC.md`, `HEATMAP_SPEC.md`, `api-v1-migration.md`, `QA_RELEASE_CHECKLIST.md`) | active docs [T] |
| `public/` | `branding/logo.png`, `spatial_ar.html` | assets [T]/[U] |
| Root | `index.html`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.*`, `components.json`, 4 tsconfigs, `start.sh`, `setup.mjs`, `.bunfig.toml`, 3 ZIPs, `AGENTS.md`, `README.md`, `LICENSE`, `PROJECT_AUDIT.md`, `STRESS_TEST_SUITE.md`, `spatial_ui.html` | mixed |

## 2. Frontend (`src/`)

- Entry: `src/main.tsx` — `new ConvexReactClient(import.meta.env.VITE_CONVEX_URL)` wrapped in `ConvexAuthProvider`.
- Router: `src/App.tsx` (single file, role-gated). Outer routes:
  - `/signup` → `SignUpPage`, `/login` → `LoginPage`, `/add-account` → `AddAccountPage`, `/*` → `AuthenticatedApp`.
- Student routes (`role === "student"`): `/` → redirect `/student/dashboard`; `/student/dashboard`; `/student/analytics`; `/student/join-class`; `/student/assignment/:assignmentId/question/:questionNumber`; `/student/assignment/:assignmentId/results`; `/student/classroom/:classroomId`.
- Lecturer routes (`role === "lecturer"`): `/` → redirect `/lecturer/dashboard`; `/lecturer/dashboard`; `/lecturer/assignments`; `/lecturer/assignment/create`; `/lecturer/assignment/ai-create`; `/lecturer/assignment/:assignmentId/edit`; `/lecturer/assignment/:assignmentId/analytics`; `/lecturer/assignment/:assignmentId/live`; `/admin/system`.
- Note: role check uses `isStudent` / `isLecturer` local flags only — no `organizationAdmin` branch in the router.
- UI kit: Tailwind + custom `ui-*` CSS classes in `src/index.css`; `components.json` is configured for **shadcn "new-york" + lucide** but there is **no `src/components/ui/` folder** — only `_ui_replacement/components/ui/*` (unmerged).
- Pages/components (22): `StudentDashboard`, `StudentAnalytics`, `StudentClassroom`, `StudentResults`, `QuestionView`, `JoinClassPage`, `LecturerDashboard`, `CreateAssignment`, `CreateAIAssignment`, `EditAssignment`, `AssignmentAnalytics`, `LiveSessionMonitor`, `AdminSystemMonitor`, `ContentBlocksRenderer`, `MathRenderer`, `RemediationConsent`, `SpatialWrapper`, `AppErrorBoundary`, `AppLogo`, `SignUpForm`, `ProfileMenu`, plus root `src/SignInForm.tsx`, `src/SignOutButton.tsx`.
- Notifications: `sonner` `<Toaster richColors closeButton position="top-right">` — inline-styled to a light palette (white / `#202124`) while `index.html` sets `body { background: #0a0a0f; }` (dark). Possible leftover from the unmerged redesign.
- Dev proxy (`vite.config.ts`): `/agent2` → `http://localhost:8082`, `/agent7` → `:8087`, `/agent-negotiation` → `:8089`. A Chef dev-only plugin is injected in `mode === "development"`.
- Vite dev server default port is 5173 (per `README.md` and `start.sh` port list).

## 3. Convex backend (`convex/`) — data and configuration

- **28 application tables** + Convex auth tables (`convex/schema.ts`, 539 lines, ends with `defineSchema({...authTables, ...applicationTables})`). Most tables carry `organizationId` → multi-tenant by design, with matching `by_org_and_*` indexes.
- Tables: `organizations`, `userProfiles`, `assignments`, `classrooms`, `classEnrollments`, `questions`, `facultyAssignmentJobs`, `attempts`, `assignmentProgress`, `aiInteractions`, `aiViolations`, `dependencyAlerts`, `recommendationState`, `lecturerHints`, `sessionLocks`, `aiUsageMetrics`, `auditLogs`, `orgRateLimitCounters`, `promptVersionEvents`, `assignmentNotifications`, `assignmentAnalyticsRollups`, `studentAnalyticsRollups`, `topicAnalyticsRollups`, `costGovernancePolicies`, `costGovernanceDaily`, `agentConversations`, `deepDiveSessions`, `pendingRemediations`.
- **Role model** (`userProfiles.role`): `student` | `lecturer` | `organizationAdmin`, plus optional `isInternalAdmin`.
- **Layering inside `convex/`**: root function files (`ai.ts` 30 KB, `attempts.ts`, `assignments.ts`, `analytics.ts`, `classrooms.ts`, `facultyAssignments.ts`, `questions.ts`, `sessionLocks.ts`, `sessions.ts`, `studentAnalytics.ts`, `users.ts`, `notifications.ts`, `interventions.ts`, `migrations.ts`, `export.ts`, `dashboardRollups.ts`, `demoSeed.ts`, `geminiProxy.ts`, `deepDive.ts`, `agentConversation.ts`, `pendingRemediations.ts`, `adminMetrics.ts`, `costGovernance.ts`, `agentAPI.ts`, `apiV1.ts`, `rateLimits.ts`) → `api/` thin re-exports → `application/` services → `domain/` pure logic (`aiPolicy`, `scoring`, `contentBlocks`, `costGovernance`, `strictJsonValidation`, `aiRegression`, `aiQuestionNormalization`) → `infrastructure/` (`geminiClient`, `aiQueue`, `cache`, `featureFlags`, `logger`, `auditTrail`, `authGuards`, `organizationGuard`) · plus `dashboard/` (rollups, jobs, alerts, recommendations, monitoring, backfill) and `calculations/` (independence, cognitiveScore, dependencyAlerts, topicAnalytics) · `lib/authGuards.ts` is a second copy of the guard.
- **HTTP routes** (`convex/router.ts`; auth routes merged in `convex/http.ts` via `auth.addHttpRoutes(http)`):
  - `GET /export/assignment` → `exportAssignmentData`
  - `GET /export/institution` → `exportLecturerDataset`
  - `POST /api/gemini-proxy/openai/v1/chat/completions` → `proxyChatCompletions`, plus `OPTIONS` → `proxyOptions`
- **Cron jobs** (`convex/crons.ts`, 4 total): hourly `dashboard/jobs.reconcileRecentRollups`; daily `0 1 * * *` `nightlyRollupSnapshot`; every 2 h `detectRollupDrift`; every 10 min `facultyAssignments.expireStaleProcessingJobsGlobal({timeoutMs: 20 min})`.
- **Feature flags** (`convex/infrastructure/featureFlags.ts`): 24 flags, in-memory global overrides + per-organization overrides, resolved by `isFeatureEnabled(flag, orgId?)`.
  - Default **true**: `dashboardRollups`, `teacherDashboardApi`, `thinkFirstGate`, `mathRendering`, `questionNavigator`, `enhancedIntegrity`, `resultsV2`
## 4. Agentic layer (`agents/`)

- Own manifest `agents/package.json` (`cogait-agentic` 1.0.0, ESM): `@google/genai` 1.49, `groq-sdk` 1.1, `hono` 4.2 + `@hono/node-server`, `convex` 1.10, `undici`; `build` = `tsc` (outputs both `dist/*` and a mirrored `dist/agents/src|convex/*`); `test:negotiation` = `tsx src/scripts/test_negotiation_flow.ts`; per-agent `dev:agentN` = `node --env-file=.env dist/agentN_*/index.js`.
- Agents, ports, endpoints: **1 Socratic 8081 /invoke** · **2 Analyst 8082 /webhook/session_ended** · **3 Content 8083 /webhook/remediation_requested** · **4 Long-term 8084 /task/longterm_analysis** · **5 Ingestion 8085 /webhook/document_uploaded** · **6 Cohort 8086 /workflow/cohort_analysis** · **7 Recommendation 8087 /workflow/recommendation_generation** · **8 Judge 8088 /schedule/evaluate** · negotiation node 8089 (`/webhook/weak_topics_identified`, `/negotiation/respond`, `/schedule/expire_pending`, `/webhook/remediation_offer_ready`, `/webhook/remediation_declined`) · watchdog 8089 (`/health`).
- **Model access path**: every agent instantiates the **Groq** SDK but points `baseURL` at the Convex Gemini proxy — `CONVEX_URL.replace(".cloud", ".site") + "/api/gemini-proxy/"` — with model list `['gemini-2.5-flash']` and `response_format: { type: 'json_object' }`. CORS is wide open (`Access-Control-Allow-Origin: '*'`).
- Shared modules: `hooks/pre_hooks.ts` / `hooks/post_hooks.ts`, `guardrails/pii_detector.ts` / `guardrails/schema_validator.ts`, `memory/{convex_client, file_store, short_term_memory, long_term_memory, vector_search_mock}.ts`, `middleware/{auth, negotiation_node}.ts`, `pubsub/index.ts` + `pubsub/schemas/{remediation_offer_ready, remediation_declined}.json`, `tools/agent1..7_tools.ts`, `types/index.ts` (all input/output interfaces for the 8 agents), `utils/retry.ts` (`withRetry`), `watchdog/index.ts`, `scripts/{test_negotiation_flow,test_pre_hooks}.ts`.
- Agent 1's system prompt: never gives direct answers; responds with a single probing question; steps abstraction up/down dynamically ("There are no fixed levels"); returns strict JSON `{socratic_question, scaffolding_depth_applied, reasoning_quality_signal}`.
- Agent 5's system prompt: converts Document AI OCR text into the CogAIt question schema, enforces KaTeX/LaTeX rules (`$...$` for math only), never guesses topic mapping below a confidence threshold, returns `{assignment_id, lecturer_id, questions[], unmapped_items[], mapping_confidence_avg}`.
- Agent 6 aggregates per-student reports from Agent 4; Agent 7 turns cohort data into lecturer briefings; Agent 8 is the judge (policy violation / schema failure / latency spike / error rate).
- Deployment artifacts: 8 × `docker/AgentN.Dockerfile` (node:20-slim multi-stage, `EXPOSE 8080`, `ENV PORT=8080`, `CMD node dist/agentN_*/index.js`) and 8 × `deploy/cloudbuild-agentN.yaml` (docker build + push to `gcr.io/$PROJECT_ID/cogait-agentN_*`, then `gcloud run deploy … --region us-central1 --platform managed --allow-unauthenticated`).
- Runtime state on disk: `agents/.memory/long-term/{lecturers,users}/*.json`, `agents/.memory/short-term/users/direct_user/active.json` (file-based memory, plus `agents/.memory` is untracked).
- Maintenance scripts in `agents/`: `fix_hono_serve.mjs`, `fix_ports.mjs`, `fix_ts.mjs`, `generate_deployment_files.mjs` (codegen of the Docker/Cloud Build files).

## 5. Runtime validation (`runtimeValidation/`)

- `runner.ts` executes 10 suites in order: phase3, phase4, phase5, phase6, phase7, phase8, tenantIsolation, auth, rollback, aiQuestion. Run via `npm run validate:runtime` (= `compile:runtime` then `node dist/runtimeValidation/runner.js`), compiled with `tsconfig.runtime.json` (ES2022/NodeNext, `outDir: dist`, includes only `runtimeValidation/**` + `convex/domain/aiQuestionNormalization.ts` + `convex/infrastructure/featureFlags.ts` + `convex/infrastructure/logger.ts`).
- Technique: suites **read source files as text** and assert on their content (`fs.readFileSync` + regex/substring), and exercise pure functions directly.
  - `phase3Validation`: `structuredLogging` default false; logger emits nothing when off, emits JSON when on; `logAiUsageMetric` must not accept a client-supplied `organizationId`; `adminMetrics` must contain `systemObservabilityHealth` and gate `aiUsageMetrics`.
  - `phase8Validation`: `adminDashboard`, `multiInstitutionAnalytics`, `costGovernance` default false; `costGovernancePolicies`/`costGovernanceDaily` tables must exist; `getCostGovernanceDashboard`, `getMultiInstitutionAnalytics`, `evaluateBeforeAi`, `recordAiUsage` endpoints must exist; hard stop blocks AI only when the flag is enabled (rollback simulation).
  - Others (from names): `tenantIsolationValidation`, `authValidation` (createUserProfile must not accept `organizationAdmin` directly; role union must exist), `rollbackValidation`, `aiQuestionValidation`.
- This is an **invariant/contract test harness**, not a functional test suite; it proves structure, not behaviour.

## 6. Black-box test and stress material

- `stressTest/cogait_stress_test.mjs` (26 KB, "v3 — Production-Ready"): `ConvexHttpClient` against `https://dynamic-alpaca-596.convex.cloud`; helpers `createAuthenticatedClient` (calls `auth:signIn` with the password provider, sets the token), `registerOrLogin`, `attempt`, `expectFail` (warns "SECURITY GAP?" when something that should fail succeeds); colour-coded PASS/FAIL/WARN accounting. Run: `node stressTest/cogait_stress_test.mjs`.
- `STRESS_TEST_SUITE.md`: 30 defined edge cases in 7 categories (bypass/injection/over-scaffolding/tab-switch lock/image spam; analyst classification; content generation incl. hallucinated PYQ years; negotiation concurrency incl. double acceptance and expiry races; ingestion at 500-page scale; cohort at 1 and 10 000 students; judge/guardrail PII). **No results are recorded anywhere** (OPEN-005/F5).
- `convex/domain/aiPolicy.test.ts`: the single Vitest file (8 cases).

## 7. Unmerged UI work and stale output trees (not active code)

- `_ui_replacement/` — a complete alternative front end: Next.js-style `app/layout.tsx` + `app/globals.css`, 60+ shadcn `components/ui/*`, `hooks/`, `src/{App,main,ProfileMenu,SignInForm}.tsx`, `src/components/{LecturerDashboard,StudentDashboard,SignUpForm,AppErrorBoundary,AppLogo,stubs}.tsx`, `public/` icons, `scripts/collect-ui-files.js` + `create-ui-archive.{js,sh}`.
- Its 15 handover documents: `00_READ_ME_FIRST.txt`, `START_HERE.md`, `INDEX.md`, `CHANGELOG.md` (dated **2026-04-14**, the only dated changelog in the repo), `BEFORE_AND_AFTER.md`, `GLITCH_REPORT_AND_FIXES.md` (90 KB), `GOOGLE_CLASSROOM_REDESIGN.md`, `IMPLEMENTATION_SUMMARY.md`, `QUICK_REFERENCE.md`, `UI_FILES_MANIFEST.md`, `COMPLETE_FILE_LIST.txt`, `FINAL_SUMMARY.txt`, `COMPLETION_CERTIFICATE.txt`, `ARCHIVE_INSTRUCTIONS.md`, `ZIP_CHECKLIST.md`.
- Design shift recorded there: primary `#4820dc` purple → `#1f73e6` Google Blue; background `#0a0a0f` dark → `#ffffff`; glow/bloom/spatial effects removed; claim of "All original features preserved • No breaking changes" (an author claim — UNVERIFIED).
- `ui_export_unpacked/`: exported copies of `StudentResults.tsx` (19 KB vs 15.6 KB in `src/`) and others; unclear provenance.
- `dist/`, `dist-validation/`, `dist-validation-2/`, `agents/dist/`, `.tmp_sim/`: build/temp outputs. `dist/` also contains `branding/logo.png` (a copy of `public/branding/logo.png`).

## 8. Existing documentation (all read, all preserved)

| File | Content | Disposition |
|---|---|---|
| `README.md` [T, modified] | Sections: what the project is, runtime architecture, data model, key flows, dev commands, gitleaks pre-commit hook, Convex links. Says "two-role system" and lists only 4 cron jobs. | copy → `docs/_original/README.md`; new version goes to **`docs/README_NEW.md`** (root README already exists) |
| `AGENTS.md` [T] | Build/lint commands, "Critical Rules" (`never edit convex/_generated`), 4 help levels, independence thresholds, "auto-submit after 3 tab switches", Convex function conventions. **Stale/contradictory** (see OPEN-032/033/034). | copy → `docs/_original/AGENTS.md` |
| `PROJECT_AUDIT.md` [U, 80 lines] | Pre-push audit: structure, deps, architecture, status table, P0/P1/P2 checklist, USP claim, open questions. Contains the only Mermaid diagram and the "1818 modules" figure. | copy → `docs/_original/PROJECT_AUDIT.md`; findings imported as trusted |
| `STRESS_TEST_SUITE.md` [U, 39 lines] | 30 stress cases, 7 categories. | copy → `docs/_original/` |
| `docs/CIS_SPEC.md`, `docs/HEATMAP_SPEC.md`, `docs/api-v1-migration.md`, `docs/QA_RELEASE_CHECKLIST.md` [T] | CIS formula + ownership; heatmap data source/colour rules/API shape; API v1 flag behaviour + rollback; release QA checklist. | copy → `docs/_original/docs__*.md`; to be merged into the new suite |
| `convex/README.md` [T] | Unmodified Convex starter boilerplate (not project documentation). | copy → `docs/_original/convex__README.md` |

## 9. Assets available today

- `public/branding/logo.png` (636 573 bytes) — identical copy at `dist/branding/logo.png`. **Only real brand asset.**
- `tmp_pdf/page_1.png` … `page_4.png` (~105–142 KB) — page renders of an unidentified PDF. **Privacy risk until classified** (OPEN-009).
- `_ui_replacement/public/`: `icon.svg`, `icon-light-32x32.png`, `icon-dark-32x32.png`, `apple-icon.png`, `placeholder-logo.{png,svg}`, `placeholder-user.jpg`, `placeholder.jpg`, `placeholder.svg`.
- `ui_export_unpacked/` — code copies, not images.
- **No screenshots, no demo video, no GIF, no sample dataset, no benchmark chart.**
- `docs/assets/screenshots/` and `docs/assets/diagrams/` created empty this session; populated only in Phases 2–3.

## 10. Measured results found in the repo

**None.** No benchmark, latency, cost, token, accuracy, coverage, usage or user-feedback file exists. The only quantitative statements anywhere are prose claims in `PROJECT_AUDIT.md` ("zero TypeScript errors", "1818 modules transformed", "npm install/typecheck complete successfully") — all UNVERIFIED until re-run, and none are product-outcome metrics. `F5`/`F8` mark the gap.

## 11. Config and metadata files (for the configuration doc)

- Root: `package.json`, `package-lock.json` (present despite being gitignored by the template), `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.runtime.json`, `vite.config.ts`, `tailwind.config.js`, `postcss.config.js` + `postcss.config.cjs` (both present), `components.json` (shadcn, new-york, lucide), `index.html`, `.gitignore`, `.gitattributes`? (not found), `.bunfig.toml`, `setup.mjs`, `start.sh`, `AGENTS.md`, `.env.example`, `.env.local` + `.env.local.agents` (**secrets — not read**).
- Tooling dirs: `.husky/pre-commit`, `.githooks/pre-commit` (both = gitleaks secret scan), `.cursor/rules/convex_rules.mdc`, `.agents/`, `.vscode/settings.json`, `.tmp_sim/`.
- `agents/`: `package.json`, `package-lock.json`, `tsconfig.json`, `.env` (**secrets — not read**), `.env.example` (GROQ_API_KEY, CONVEX_URL), `deploy/`, `docker/`.
- Env var names (from `.env.example` + code references): `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_AGENT_URL`, `CONVEX_URL`, `CONVEX_SITE_URL`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AGENT_SECRET`, `PORT`, `NODE_ENV`.

## 12. Known gaps in this inventory

- `convex/ai.ts` (30 KB) was read only via its exported symbol list and helpers — the prompt text and gate order are **not** yet in the ledger.
- `src/components/QuestionView.tsx` (the core student screen), `StudentResults.tsx`, `LecturerDashboard.tsx`, `AdminSystemMonitor.tsx` were **not** read yet (Phase 3/5 targeted reads).
- `convex/costGovernance.ts`, `geminiProxy.ts`, `export.ts`, `migrations.ts`, `demoSeed.ts`, `interventions.ts`, `notifications.ts` — existence and function names only.
- `runtimeValidation/phase4/5/6/7`, `tenantIsolation`, `rollback` suites — names only.
- `agents/src/**` bodies beyond agent1/agent5 heads and the route/port scan.
- The Convex **deployed** state (reality vs code) is unknown; it cannot be inspected without network access and approval.



- **Environment variables referenced in code**: `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_AGENT_URL`, `CONVEX_URL`, `CONVEX_SITE_URL`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AGENT_SECRET`, `PORT`, `NODE_ENV`. A root `.env.example` and an `agents/.env.example` exist with placeholder values. Secret files (`.env.local`, `.env.local.agents`, `agents/.env`) exist and were **not opened**.

