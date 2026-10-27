# CogAIt - AI Learning Platform

This is a project built with [Chef](https://chef.convex.dev) using [Convex](https://convex.dev) as its backend, and Vite + React for the frontend.

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

### Convex HTTP routes
User-defined http routes are defined in the `convex/router.ts` file. We split these routes into a separate file from `convex/http.ts` to allow us to prevent the LLM from modifying the authentication routes.

### Convex cron jobs
Defined in `convex/crons.ts`:
- Hourly: dashboard rollup reconcile
- Nightly `0 1 * * *`: rollup snapshot
- Every 2 hours: rollup drift detection
- Every 10 minutes: stale faculty AI job timeout sweep

## 3. Data Model (Convex Schema)
Schema is in `convex/schema.ts` and includes Convex auth tables + application tables (e.g., `organizations`, `userProfiles`, `assignments`, `questions`, `attempts`, `aiInteractions`, `sessionLocks`).

## 4. Key Functional Flows

### Student assignment flow
- Attempt lifecycle in `attempts.ts` (start, draft, submit, autoSubmit).
- AI help flow in `ai.ts` (validateReasoningForUnlock, sendChatMessage, sendImageFeedback).
- Help counters updated via `attempts.updateHelpStats`.
- AI requests are gated (reasoning relevance, anti-gibberish, no "final answer").

### Integrity/session flow
- `sessionLocks.ts` tracks violations and heartbeat.
- Auto-submit trigger is based on total violations (e.g. copy-paste, tab switches).

## 5. Development Commands

1. Install dependencies: `npm install`
2. Set `.env.local` with required values (see `.env.example`).
3. Start development servers: `npm run dev`
4. Open frontend: `http://localhost:5173`

Scripts available:
- `npm run dev` (frontend + backend + agents concurrently)
- `npm run build` (builds the project)
- `npm run typecheck` (typechecks the project)

## 6. Security pre-commit hook

Enable repository hooks and install `gitleaks` locally:

```bash
git config core.hooksPath .githooks
gitleaks detect --source .
```

## 7. Additional Resources
* [Convex Docs](https://docs.convex.dev/)
* [Hosting and Deployment](https://docs.convex.dev/production/)
