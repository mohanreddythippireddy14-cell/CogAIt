# LEDGER

One row per fact: `ID | fact | value | source file(s) | source hash or mtime | status | date`.

Status: **VERIFIED** = read directly from the named source · **USER-STATED** = the user told me · **UNVERIFIED** = claimed by a document or by a tool run I did not perform · **TODO** = missing, must be supplied.

Staleness check (cheap): `Get-FileHash -Algorithm SHA1 <file>` and compare with `HASHES.txt` (36 files). Re-read a source **only** if its hash changed or it has no row. Session 1 date: **2026-09-30**. Nothing was executed in session 1 unless a row says so; all build/test/benchmark claims below are second-hand.

---

## A. Identity, licence, history
| ID | Fact | Value | Source | Status | Date |
|---|---|---|---|---|---|
| A1 | Product name | CogAIt | `index.html` `<title>` | VERIFIED | 2026-09-30 |
| A2 | Tagline | "CogAIt — Think-First AI Learning" | `index.html` | VERIFIED | 2026-09-30 |
| A3 | Meta description | "AI-powered learning platform that builds independent thinking through Socratic tutoring." | `index.html` | VERIFIED | 2026-09-30 |
| A4 | Licence | MIT, "Copyright (c) 2026 CogAIt" | `LICENSE` | VERIFIED | 2026-09-30 |
| A5 | Git history | 1 commit: `736400e`, 2026-04-12, Mohan Reddy, subject `"b"` | `git log` | VERIFIED | 2026-09-30 |
| A6 | Branch | `master` only | `git branch -a` | VERIFIED | 2026-09-30 |
| A7 | Tracked file count | 193 | `git ls-tree -r HEAD` | VERIFIED | 2026-09-30 |
| A8 | Repo author | Mohan Reddy (git author of the single commit) | `git log` | VERIFIED | 2026-09-30 |
| A9 | Intended exam audience | "JEE and NEET aspirants" | `agents/src/agent1_socratic/index.ts:21` | VERIFIED | 2026-09-30 |
| A10 | Pitch, personas, aha moment | Target: JEE/NEET. Aha moment: building independence without immediate answers. | INTERVIEW_v2.md A1/A2 | USER-STATED | 2026-10-01 |
| A11 | Business model / pricing / public-or-private | Repo is public. Target audience: research hiring managers. B2B SaaS later. | INTERVIEW_v2.md | USER-STATED | 2026-10-01 |
| A12 | Pre-session working-tree state | 63 modified tracked files, 29 untracked paths, 1 deletion (`readme1.md`) — all pre-existing | `docs/_state/BASELINE_git_status.txt` | VERIFIED | 2026-09-30 |

## B. Stack and toolchain
| ID | Fact | Value | Source | Status |
|---|---|---|---|---|
| B1 | Package manifest | `flex-template` `0.0.0`, `"type": "module"`, `private: true` | `package.json` | VERIFIED |
| B2 | Frontend stack | React 19.2, Vite 6.2, TypeScript 5.7, Tailwind 3.4, react-router-dom 7.13, lucide-react 0.564, sonner 2.0 | `package.json` | VERIFIED |
| B3 | Backend platform | Convex 1.31.2 + `@convex-dev/auth` 0.0.80, `@auth/core` 0.37, `oauth4webapi`, `oslo` | `package.json` | VERIFIED |
| B4 | AI SDK (backend) | `@google/generative-ai` 0.24.1 | `package.json` | VERIFIED |
| B5 | Maths rendering | `katex` 0.18.9 + `react-latex-next` 3.0 | `package.json` | VERIFIED |
| B6 | Test runner | Vitest 5.0.3 devDependency; script `"test": "vitest run"` | `package.json` | VERIFIED |
| B7 | npm scripts | `dev` = frontend+backend+agents parallel · `dev:frontend` `dev:backend` `dev:agents` · `build` = `tsc -b && vite build` · `typecheck` = `tsc -p . && npm --prefix agents run build` · `test` · `lint` = typecheck → `npx convex dev --once` → build · `compile:runtime` · `validate:runtime` | `package.json` | VERIFIED |
| B8 | Node requirement | "v20+ recommended" | `PROJECT_AUDIT.md` §3 | UNVERIFIED |
| B9 | Lint config | eslint 9 packages declared; **no `eslint.config.js` in root listing** | root listing | UNVERIFIED |
| B10 | Prettier | prettier 3.5 declared; no config file seen | `package.json` | UNVERIFIED |
| B11 | Convex deployment id | `dynamic-alpaca-596` | `stressTest/cogait_stress_test.mjs:10`; agent fallback baseURL | VERIFIED as text |
| B12 | Ports | frontend 5173 · agent1–8 8081–8088 · watchdog 8089 · vite proxy 8082/8087/8089 | `start.sh`, `vite.config.ts`, agent sources | VERIFIED |
| B13 | Bun config | `.bunfig.toml` → npmjs registry | `.bunfig.toml` | VERIFIED |
| B14 | Build/typecheck result | "typecheck and build exited 0; 1818 modules transformed" — **not re-run** | `PROJECT_AUDIT.md` §5 | UNVERIFIED |
| B15 | CI | none (`.github/` absent); Cloud Build YAMLs exist per agent with no triggers | listing, `agents/deploy/` | VERIFIED |
| B16 | Secret scanning | `.githooks/pre-commit` and `.husky/pre-commit` both run `gitleaks protect --staged` and **fail** if gitleaks is missing; README documents `git config core.hooksPath .githooks` | those files, `README.md` | VERIFIED |

## C. Convex data model — 28 application tables (+ Convex auth tables)
Source: `convex/schema.ts` (539 lines). Declarations read directly on 2026-09-30. Nearly every app table carries `organizationId` (multi-tenant by design).

| ID | Table | Notable fields | Indexes |
|---|---|---|---|
| C1 | `organizations` | name, createdAt, createdBy, planTier, isActive | 1 |
| C2 | `userProfiles` | userId, organizationId, fullName, role ∈ {student, lecturer, organizationAdmin}, institution, isInternalAdmin | 2 |
| C3 | `assignments` | lecturerId, classroomId, title, subject ∈ {Physics, Chemistry, Math}, chapter, difficulty, dueDate, timeLimitMinutes, totalQuestions, minReasoningChars, aiProcessingStatus ∈ {processing, review_ready, completed, failed, failed_timeout}, aiJobId, targetStudentId, isDeepDive, sourceAssignmentId; `allowedLevels` marked "Deprecated by Agents" | 5 |
| C4 | `classrooms` | joinCode, subject, batchName, studentLimit, isActive | 4 |
| C5 | `classEnrollments` | classroomId, studentId, joinedAt | 4 |
| C6 | `questions` | questionNumber, questionText, contentBlocks, mcqOptions, correctOption A–D, topic/subtopic, difficulty, correctAnswer, aiAnswer, confidenceLevel/Score, reviewed(+At), imageId | 2 |
| C7 | `facultyAssignmentJobs` | status, inputType ∈ {pdf, text}, sourceStorageId, sourceText, uploadRequestKey, sourceHash, extractedText, processedQuestions, error | 8 |
| C8 | `attempts` | studentAnswer, studentReasoning, reasoningTextSnapshot, reasoningCharCountBeforeFirstHelp, firstHelpRequestedAt, timeSpentBeforeFirstHelp, totalHelpRequests, helpLevelsUsed[], retryCount, copyPasteDetected, answerBeforeReasoning, independenceScore, cognitiveScore, questionStatus ∈ {unattempted, answered, skipped, review}, markedForReview | 8 |
| C9 | `assignmentProgress` | activeTimeMs, sessionStartedAt, submittedAt, lastUpdatedAt | 3 |
| C10 | `aiInteractions` | attemptId, helpLevel, studentInput, aiResponse, tokensUsed, responseTimeMs, reflectionProvided/Text, assignmentId, studentId | 3 |
| C11 | `aiViolations` | attemptId, helpLevel, violations[], severity ∈ {low, high}, regenerationAttempt, timestamp | 2 |
| C12 | `dependencyAlerts` | alertType ∈ {high_help_frequency, low_independence, increasing_dependency, level_4_overuse}, severity, message, acknowledged(+By/At), interventionNotes | 6 |
| C13 | `recommendationState` | recommendationId, dismissed, actedUpon | 2 |
| C14 | `lecturerHints` | message, createdAt, deliveredAt, readAt | 2 |
| C15 | `sessionLocks` | isLocked, tabSwitchCount, copyPasteAttempts, violationWarnings[{type, timestamp}], heartbeat fields | ≥1 (line 291+) |
| C16–C19 | `aiUsageMetrics`, `auditLogs`, `orgRateLimitCounters`, `promptVersionEvents` | telemetry/audit/rate-limit/prompt-version tables backing the same-named default-off flags | — |
| C20 | `assignmentNotifications` | notification records for the Resend email path | — |
| C21–C23 | `assignmentAnalyticsRollups`, `studentAnalyticsRollups`, `topicAnalyticsRollups` | precomputed rollups (ROLLUP_v1) incl. needsRecompute/computedAt and org+assignment+topic indexes | — |
| C24 | `costGovernancePolicies` | dailyTokenCap, softWarningThreshold, adminOverrideUntil, isActive, updatedBy | 1 |
| C25 | `costGovernanceDaily` | dayStart, tokensUsed, hardStopTriggered, anomalyDetected, lastUpdated | 2 |
| C26 | `agentConversations` | messages[{role ∈ agent/student, content, timestamp}], status ∈ {active, closed}, deepDiveRequested, weakTopics[] | 2 |
| C27 | `deepDiveSessions` | weakTopics[], studentPreferences, status ∈ {pending, generating, ready, failed}, generatedAssignmentId, webSources[], questionCount, error | 3 |
| C28 | `pendingRemediations` | student_id, assignment_id, weak_topics[], status ∈ {awaiting_consent, accepted, declined, expired}, expires_at, preference ∈ {pyqs, fundamentals, theory, all}, decline_reason | 3 |
| C29 | Auth tables | `users` + sessions from `@convex-dev/auth`, merged via `...authTables` | — |
| C30 | Naming note | `pendingRemediations` uses snake_case while all other tables use camelCase | — |

## D. Scoring and AI policy
| ID | Fact | Value | Source | Status |
|---|---|---|---|---|
| D1 | Help levels | 4: 1 Audit Mode, 2 Socratic Mode, 3 Instruction Mode, 4 Deep Assistance | `convex/constants.ts` | VERIFIED |
| D2 | CIS v1 per question | `clamp(100 − maxHelpLevel·15 − totalHelpRequests·5 + (reasoningCharsBeforeFirstHelp > 50 ? 10 : 0), 0, 100)`; `maxHelpLevel = 0` if no help | `docs/CIS_SPEC.md`, `convex/domain/scoring.ts` | VERIFIED (two sources agree) |
| D3 | CIS overall | `round(mean(per-question CIS over submitted attempts))`; `0` if none attempted; UI never recomputes it | `docs/CIS_SPEC.md`, `computeOverallCis` | VERIFIED |
| D4 | Independence score | `0.5·correctnessScore + 0.35·helpScore + 0.15·timeScore`, `helpPenalty = min(totalHelpRequests·12, 60)`, correctness 100/25/50 for right/wrong/ungraded, `0` if no submission | `scoring.ts:computeFinalIndependenceScore` | VERIFIED |
| D5 | Cognitive score | `clamp((0.4·correctness + 0.3·independence + 0.2·timeEfficiency + 0.1·thinkingTime) × difficultyMultiplier)`; thinking baseline 5 min | `scoring.ts:computeCognitiveScore` | VERIFIED |
| D6 | `COGNITIVE_WEIGHTS` | 0.4/0.3/0.2/0.1 — matches D5's inline weights | `constants.ts` | VERIFIED |
| D7 | Difficulty multiplier | `getDifficultyMultiplier` → hard 1.2 / medium 1.1 / easy 1.0 (used by D5) **but** `DIFFICULTY_MULTIPLIERS` constant = 0.8/1.0/1.2 → **contradiction** | `scoring.ts`, `constants.ts` | VERIFIED (open: OPEN-037) |
| D8 | Risk bands | high < 40, medium < 60, else low; each band has a canned recommended action | `constants.ts`, `riskFromIndependence` | VERIFIED |
| D9 | Metric contract versions | `CIS_v1`, `RiskScore_v1`, `ROLLUP_v1`; stale TTL 5 min; drift mismatch threshold 0.05 | `constants.ts` | VERIFIED |
| D10 | Time expectation | 240 s per question | `constants.ts` | VERIFIED |
| D11 | AI rate limit | 5 requests per 5-min window, 30 s cooldown, regeneration limit 3 | `convex/domain/aiPolicy.ts` | VERIFIED |
| D12 | AI response violation rules | categories: final numerical answer · complete solution · direct confirmation · response > 500 chars when level ≤ 2; severity "high" for the first two, else "low" | `aiPolicy.ts:validateAiResponse` | VERIFIED |
| D13 | Fallback responses | one canned Socratic question per level, used when the model output is rejected | `aiPolicy.ts:getAiFallbackResponse` | VERIFIED |
| D14 | Auto-submit threshold | `VIOLATION_LIMITS.autoSubmitViolations = 5` in code vs "3 tab switches" in `AGENTS.md`/brief → **needs confirmation** | `constants.ts` | UNVERIFIED (OPEN-034) |
| D15 | Reasoning gate | `AGENTS.md` and `PROJECT_AUDIT.md` say "100+ characters of reasoning before AI help"; `assignments.minReasoningChars` exists and flag `thinkFirstGate` defaults on, but the literal threshold was **not** confirmed in code | `AGENTS.md`, `schema.ts`, `featureFlags.ts` | UNVERIFIED |
| D16 | Answer-leak rate at level 4 | **TODO: needs input** — computable from `aiViolations`, never measured | — | TODO |
| D17 | Canonical scoring source | **TODO: needs input** — four coexisting implementations (see OPEN-035) | — | TODO |

## E. Integrity / proctoring
| ID | Fact | Value | Source | Status |
|---|---|---|---|---|
| E1 | Signals stored | `tabSwitchCount`, `copyPasteAttempts`, `violationWarnings[{type,timestamp}]`, `isLocked` | `sessionLocks` table | VERIFIED |
| E2 | Session API | `startSession`, `updateHeartbeat`, `logViolation`, `endSession` | `convex/sessionLocks.ts` | VERIFIED |
| E3 | Per-attempt flags | `copyPasteDetected`, `answerBeforeReasoning` | `attempts` table | VERIFIED |
| E4 | Consent step | `src/components/RemediationConsent.tsx` exists (untracked); `QA_RELEASE_CHECKLIST.md` requires the consent screen before an assessment starts | listing, docs | VERIFIED as existence |
| E5 | Server-side integrity | flag `serverSideIntegrity` defaults **false** | `featureFlags.ts` | VERIFIED |
| E6 | Client-side violation handling | described as auto-submit; the exact logic in `src/components/QuestionView.tsx` has not been read yet (it is a modified tracked file that will need a targeted read in a later phase) | — | UNVERIFIED |

## F. Tests, validation and quality evidence
| ID | Fact | Value | Source | Status |
|---|---|---|---|---|
| F1 | Unit tests | 1 file, 8 cases, Vitest | `convex/domain/aiPolicy.test.ts` | VERIFIED |
| F2 | Runtime validators | 10 suites (phase3–8, tenantIsolation, auth, rollback, aiQuestion) run by `npm run validate:runtime`; they assert on source text and pure-function behaviour | `runtimeValidation/*` | VERIFIED |
| F3 | Black-box suite | `stressTest/cogait_stress_test.mjs` v3 against a live Convex deployment, with PASS/FAIL/WARN accounting and a `SECURITY GAP?` warning when a should-fail operation succeeds | that file | VERIFIED |
| F4 | Edge cases defined | 30 cases across 7 categories | `STRESS_TEST_SUITE.md` | VERIFIED as definitions |
| F5 | Stress-test results | **none recorded** | — | TODO |
| F6 | Coverage | **no coverage report exists** | — | TODO |
| F7 | QA checklist | 6 areas: core student flow, CIS consistency, integrity flow, LaTeX rendering, responsive/empty states, and 3 commands (`npx tsc -p . --noEmit`, `npx tsc -p convex --noEmit`, `npx convex dev --once` marked as needing a reachable backend) | `docs/QA_RELEASE_CHECKLIST.md` | VERIFIED |
| F8 | Benchmark / latency / cost numbers | **none found** | — | TODO |
| F9 | Self-reported build state | "typecheck and build exit 0; 1818 modules transformed" | `PROJECT_AUDIT.md` §5 | UNVERIFIED (not re-run) |

## G. Agents, deployment and infrastructure
| ID | Fact | Value | Source | Status |
|---|---|---|---|---|
| G1 | Agent ports | 8081–8088 for agents 1–8; 8089 negotiation + watchdog | agent `index.ts`, `start.sh` | VERIFIED |
| G2 | Agent endpoints | see INVENTORY §4 | agent sources | VERIFIED |
| G3 | Model used by agents | `['gemini-2.5-flash']` via Groq SDK against the Convex Gemini proxy | agent sources | VERIFIED |
| G4 | Containerisation | 8 Dockerfiles, node:20-slim, PORT 8080 | `agents/docker/*` | VERIFIED |
| G5 | Cloud Run deploy config | 8 Cloud Build YAMLs, region `us-central1`, `--allow-unauthenticated` | `agents/deploy/*` | VERIFIED |
| G6 | Whether Cloud Run is live today | **TODO: needs input** | INTERVIEW F1 | TODO |
| G7 | Local launcher | `start.sh` builds agents, kills ports 5173+8081–8088, starts all 8 agents, then `npm run dev:backend` + `dev:frontend` (bash; uses nvm) | `start.sh` | VERIFIED |
| G8 | CI/CD | none for frontend/Convex; no `.github/` | listing | VERIFIED |
| G9 | Backups / monitoring | only the in-app `dashboard/monitoring.getRollupMonitoring` + rollup drift jobs; no infra-level monitoring, backup or alerting config found | — | UNVERIFIED |
| G10 | Resend email path | `ASSIGNMENT notifications` table + `notifications.ts` + `RESEND_*` env vars | schema, code, `.env.example` | VERIFIED |

## H. Documentation and assets
| ID | Fact | Value | Source | Status |
|---|---|---|---|---|
| H1 | Pre-existing docs in `docs/` | `CIS_SPEC.md` (CIS v1), `HEATMAP_SPEC.md` (HEATMAP_v1), `api-v1-migration.md` (flag `apiV1Routing`, org scope, default off, rollback = disable flag), `QA_RELEASE_CHECKLIST.md` | those files | VERIFIED |
| H2 | Root docs | `README.md` (user-modified), `AGENTS.md` (stale), `PROJECT_AUDIT.md` (pre-push audit), `STRESS_TEST_SUITE.md`, `convex/README.md` (Convex template boilerplate), `LICENSE` (MIT) | those files | VERIFIED |
| H3 | Copy-only archive | `docs/_original/` holds 9 untouched copies (README, AGENTS, PROJECT_AUDIT, STRESS_TEST_SUITE, the 4 `docs/*` specs, `convex/README.md`) | this session | VERIFIED |
| H4 | Screenshots of the product | **none exist** | repo-wide image search | VERIFIED (absence) |
| H5 | Images that do exist | `public/branding/logo.png` + `dist/branding/logo.png` (636 KB, identical size), `tmp_pdf/page_1..4.png` (unidentified document renders), `_ui_replacement/public/*` shadcn placeholders, `_ui_replacement/public/icon.svg` | image search | VERIFIED |
| H6 | Diagrams | only one Mermaid block, inside `PROJECT_AUDIT.md` §4 (frontend/backend/agents flow) | `PROJECT_AUDIT.md` | VERIFIED |
| H7 | Demo video / GIF | none | search | VERIFIED (absence) |
| H8 | `og-preview.png` | referenced by `index.html` but **missing** | `index.html` + image search | VERIFIED |
| H9 | Screenshot/asset permissions | No images or assets exist currently | INTERVIEW_v2.md | USER-STATED |

## I. Open-risk index (details in `docs/OPEN_ITEMS.md`)
| ID | Risk | Ledger ref |
|---|---|---|
| I1 | Agent persistence endpoints are stubs | OPEN-030 |
| I2 | Auto-submit threshold conflict (5 vs 3) | D14 / OPEN-034 |
| I3 | Four scoring implementations | D4–D7 / OPEN-035 |
| I4 | Difficulty multiplier contradiction | D7 / OPEN-037 |
| I5 | Hard-coded live deployment URL in repo | B11 / OPEN-036 |
| I6 | Export + AI-proxy HTTP endpoints (auth posture unreviewed) | OPEN-043 |
| I7 | No CI, no coverage, no recorded test results | F5–F8 / OPEN-041 |
| I8 | English-only vs JEE/NEET audience | OPEN-042 |
| I9 | Text in the repo that contradicts the code (`AGENTS.md`, `PROJECT_AUDIT.md` on tests/roles/crons) | OPEN-032/033 |
| I10 | Partially applied redesign → screenshots would show an inconsistent theme | OPEN-045 |



