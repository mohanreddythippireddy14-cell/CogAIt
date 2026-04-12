# CogAIt AI Learning Platform (Current Architecture)

This document reflects the **current codebase architecture** in this repository.
It does not modify or replace `README.md`.

## 1. What This Project Is

CogAIt is a role-based learning platform built with:
- **Frontend**: React 19 + Vite + TypeScript + Tailwind
- **Backend**: Convex (queries/mutations/actions + HTTP routes + cron jobs)
- **Auth**: `@convex-dev/auth` password provider
- **AI**: Google Gemini (text + image feedback)

Primary roles:
- `student`
- `lecturer`
- `organizationAdmin`

## 2. Runtime Architecture

### Frontend entry
- `src/main.tsx` initializes `ConvexReactClient` with `VITE_CONVEX_URL` and wraps app in `ConvexAuthProvider`.

### Frontend router
Main router is in `src/App.tsx`.

Public/auth routes:
- `/login`
- `/signup`
- `/add-account`

Student routes:
- `/student/dashboard`
- `/student/join-class`
- `/student/assignment/:assignmentId/question/:questionNumber`
- `/student/assignment/:assignmentId/results`

Lecturer/Admin routes:
- `/lecturer/dashboard`
- `/lecturer/assignments`
- `/lecturer/assignment/create`
- `/lecturer/assignment/ai-create`
- `/lecturer/assignment/:assignmentId/edit`
- `/lecturer/assignment/:assignmentId/analytics`
- `/lecturer/assignment/:assignmentId/live`
- `/admin/system`

### Convex HTTP routes
Registered in `convex/router.ts` and exported from `convex/http.ts`:
- `GET /export/assignment`
- `GET /export/institution`

Auth HTTP routes are also attached via `auth.addHttpRoutes(http)`.

### Convex cron jobs
Defined in `convex/crons.ts`:
- Hourly: dashboard rollup reconcile
- Nightly `0 1 * * *`: rollup snapshot
- Every 2 hours: rollup drift detection
- Every 10 minutes: stale faculty AI job timeout sweep

## 3. Data Model (Convex Schema)

Schema is in `convex/schema.ts` and includes Convex auth tables + application tables.

Application tables:
- `organizations`
- `userProfiles`
- `assignments`
- `classrooms`
- `classEnrollments`
- `questions`
- `facultyAssignmentJobs`
- `attempts`
- `assignmentProgress`
- `aiInteractions`
- `aiViolations`
- `dependencyAlerts`
- `recommendationState`
- `lecturerHints`
- `sessionLocks`
- `aiUsageMetrics`
- `auditLogs`
- `orgRateLimitCounters`
- `promptVersionEvents`
- `assignmentNotifications`
- `assignmentAnalyticsRollups`
- `studentAnalyticsRollups`
- `topicAnalyticsRollups`
- `costGovernancePolicies`
- `costGovernanceDaily`

## 4. Backend Module Map (Current)

Top-level Convex modules (`convex/*.ts`):
- `auth.ts`, `auth.config.ts`
- `users.ts`
- `assignments.ts`, `questions.ts`, `attempts.ts`
- `classrooms.ts`
- `ai.ts`
- `analytics.ts`
- `interventions.ts`
- `sessions.ts`, `sessionLocks.ts`
- `facultyAssignments.ts` (AI-assisted assignment drafting pipeline)
- `dashboardRollups.ts`
- `adminMetrics.ts`
- `costGovernance.ts`, `rateLimits.ts`
- `notifications.ts`
- `export.ts`
- `apiV1.ts`
- `migrations.ts`
- `constants.ts`

Additional backend layers:
- `convex/application/*` (service-level orchestration)
- `convex/domain/*` (policy/scoring/validation logic)
- `convex/infrastructure/*` (feature flags, logging, guards, Gemini client, cache, audit)
- `convex/dashboard/*` (teacher overview, assignment dashboard, student profile, alerts, monitoring, jobs, backfill)
- `convex/calculations/*` (independence, cognitive score, dependency alerts, topic analytics)

Re-export wrappers:
- `convex/api/*.ts` re-export core modules (assignments, attempts, ai, analytics, adminMetrics, faculty).

## 5. Key Functional Flows

### Student assignment flow
- Assignment list from `assignments.getStudentAssignments`
- Attempt lifecycle in `attempts.ts`:
  - `startAttempt` / `createAttempt`
  - `saveAttemptDraft`
  - `submitAttempt`
  - `autoSubmitAssignment`
- Results from `attempts.getResultsReport`

### AI help flow
- Actions in `ai.ts`:
  - `validateReasoningForUnlock`
  - `sendChatMessage`
  - `sendImageFeedback`
- AI interactions persisted via `ai.storeInteraction`
- Help counters updated via `attempts.updateHelpStats`
- Request gating includes:
  - reasoning relevance gate
  - anti-gibberish check
  - “final answer” request block
  - per-attempt recent help policy enforcement

### Classroom flow
- Faculty: create/manage classrooms and join codes (`classrooms.ts`)
- Student: join via code (`joinClassByCode`) and unenroll (`unenrollFromClass`)

### Integrity/session flow
- `sessionLocks.ts` tracks violations and heartbeat.
- Auto-submit trigger is based on **total violations** (`VIOLATION_LIMITS.autoSubmitViolations`), currently set to `5` in `convex/constants.ts`.
- Question page records tab/copy-paste violations and heartbeats.

### Rollups/analytics flow
- Rollups maintained in `dashboardRollups.ts` and consumed via `convex/dashboard/*` actions/queries.
- Cron jobs reconcile/snapshot/detect drift.

### Notifications
- Publishing assignments schedules notification action.
- Email sending uses Resend in `notifications.ts`.
- If Resend env vars are missing, notifications are recorded as `skipped`.

## 6. Feature Flags (In-Memory)

Defined in `convex/infrastructure/featureFlags.ts`.

Flags defaulted **true** in current code:
- `dashboardRollups`
- `teacherDashboardApi`
- `thinkFirstGate`
- `mathRendering`
- `questionNavigator`
- `enhancedIntegrity`
- `resultsV2`

Most other flags default false and can be changed via admin mutations.

## 7. Environment Variables (From Code Usage)

Required/used:
- `VITE_CONVEX_URL` (frontend Convex client)
- `CONVEX_SITE_URL` or `VITE_CONVEX_SITE_URL` (auth domain / notification links)
- `GOOGLE_API_KEY` (Gemini integration; required by AI modules)
- `RESEND_API_KEY` (optional for email delivery)
- `RESEND_FROM_EMAIL` (optional for email delivery)
- `CONVEX_DEPLOYMENT` / `CONVEX_DEPLOY_KEY` (Convex CLI/deployment workflow)

## 8. Development Commands (Actual `package.json`)

Available scripts:
- `npm run dev` (frontend + backend concurrently)
- `npm run dev:frontend` (Vite)
- `npm run dev:backend` (Convex dev)
- `npm run prepare` (husky install)
- `npm run compile:runtime` (compile runtime validation TS)
- `npm run validate:runtime` (compile + execute runtime validation runner)

Important: there is currently **no** `build`, `lint`, or `test` script in `package.json`.

## 9. Repository Structure (High Level)

- `src/` frontend app and UI components
- `convex/` backend functions, schema, cron, HTTP router, domain/application/infrastructure layers
- `runtimeValidation/` runtime verification suites
- `docs/` architecture/spec/checklist docs
- `public/` static assets

## 10. Operational Notes

- Do not manually edit `convex/_generated/*`; regenerate through Convex tooling.
- Tenant scoping is enforced broadly using `organizationId` + guard helpers.
- Default organization bootstrap happens in `users.createUserProfile`:
  - first profile can become `organizationAdmin` for the default org.

## 11. Quick Start (Current)

1. Install dependencies:
   - `npm install`
2. Set `.env.local` with required values.
3. Start development:
   - `npm run dev`
4. Open frontend (Vite default):
   - `http://localhost:5173`

---

Generated from direct code inspection of this repository’s current state.
