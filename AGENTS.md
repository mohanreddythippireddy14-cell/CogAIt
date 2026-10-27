# AGENTS.md

Guidance for AI coding assistants (and humans) working in this repository.

## Commands

```bash
npm run dev                # frontend (Vite) + Convex dev + all agent services
npm run dev:frontend       # Vite only
npm run dev:backend        # convex dev only
npm run dev:agents         # build agents, start agents 1-8 + negotiation node (ports 8081-8089)

npm run typecheck          # tsc: frontend (tsconfig.app.json), convex/, agents/
npm test                   # Vitest: convex/**/*.test.ts, agents/src/**/*.test.ts (no network)
npm run validate:runtime   # invariant suites in runtimeValidation/
npm run build              # production frontend build
npm run convex:check       # npx convex dev --once (pushes to your dev deployment)
```

Run one test file: `npx vitest run convex/domain/scoring.test.ts`. Run one test by name: add `-t "name"`.

Node 22.12+ is required. Configuration lives in `.env.local`, `agents/.env` and Convex env vars; see `.env.example` and `agents/.env.example`.

## Critical rules

- **Never edit `convex/_generated/*` by hand.** Regenerate with `npx convex dev --once`.
- **The tutor must never reveal answers.** Any change to tutor prompts must keep the answer-leak validator (`convex/domain/aiPolicy.ts`) in the reply path. Keep the regex patterns in sync with `agents/src/lib/judge.ts`.
- **Writes that affect scores stay internal.** `ai.storeInteraction`, `ai.logAiViolation`, `ai.logAiUsageMetric`, `ai.logPromptVersionEvent` and `attempts.updateHelpStats` are `internalMutation`s; call them through `internal.*` from actions.
- **Agent-facing Convex functions require the agent key.** Use `agentKeyArg` / `requireAgentKey` from `convex/lib/agentAuth.ts`.
- **Agent endpoints are authenticated.** Use `requireAgentKey` for service routes, and `requireAgentKeyOrUser` for routes the browser calls. On browser routes, take the user id from `c.get('callerUserId')`, never from the body.

## Architecture overview

### Roles
`userProfiles.role` is `student`, `lecturer` or `organizationAdmin`. Routes are role-gated in `src/App.tsx`. Data is organisation-scoped (`organizationId`, `requireSameOrganization`).

### Frontend (`src/`)
React 19 + Vite + TypeScript + Tailwind; Convex React hooks; Convex Auth (password); `sonner` toasts; MathJax from CDN (`MathRenderer.tsx`).

### Backend (`convex/`)
- `schema.ts`: 29 application tables.
- `ai.ts`: the tutor (`sendChatMessage`, `sendImageFeedback`).
- `application/aiService.ts`: help limit (5 per 5 min, 30 s apart, per student).
- `domain/`: pure logic (`aiPolicy.ts` leak validator, `scoring.ts` formulas). Unit-test here.
- `infrastructure/`: Gemini client (`DEFAULT_GEMINI_MODEL`), Agent 1 client, feature flags, logger.
- `calculations/`: independence and cognitive score mutations.
- `agentAPI.ts`, `agentConversation.ts`, `pendingRemediations.ts`: used by the agents.
- `router.ts` / `http.ts`: HTTP routes (exports, Gemini proxy) + auth routes.

### Agents (`agents/src/`)
One Hono service per agent (`agentN_*/index.ts`), plus `middleware/negotiation_node.ts`.
- `lib/`: `llm.ts` (shared Gemini client via the Convex proxy), `server.ts`, `analytics.ts`, `judge.ts`, `retry.ts`.
- `hooks/`: schema validation + PII + LLM guardrail before, schema + policy + LLM judge after.
- `pubsub/`: authenticated HTTP events between services.
- `memory/`: `convex_client.ts` (Convex calls with the agent key) and the local JSON store (`agents/.memory`).

### Request flows
**Help request:** `QuestionView.tsx` → `api.ai.sendChatMessage` → help limit → Agent 1 or Gemini → leak validator → `internal.ai.storeInteraction` + `internal.attempts.updateHelpStats`.

**Submission:** `attempts.submitAttempt` → score calculations. The browser also posts `session_ended` to Agent 2, which leads to negotiation/Agent 3, Agent 4 → Agent 6 → Agent 7, with outputs going to Agent 8.

**Integrity:** `QuestionView.tsx` visibility/clipboard events → `api.attempts.recordViolation` → `sessionLocks.logViolation`. Auto-submit happens at `VIOLATION_LIMITS.autoSubmitViolations` (5).

### Help levels (`convex/constants.ts`)
1 Audit Mode · 2 Socratic Mode · 3 Instruction Mode · 4 Deep Assistance. The model proposes the next level and the code clamps it to 1–4. `assignments.minReasoningChars` exists but is **not enforced** yet.

## Convex patterns
- New function syntax with `args` and `returns` validators.
- `query`/`mutation`/`action` for client-callable functions; `internal*` for everything else.
- Prefer `.withIndex()` to `.filter()`; index fields must be given in index order.
- Actions use `ctx.runQuery` / `ctx.runMutation`; the user's auth is propagated.
