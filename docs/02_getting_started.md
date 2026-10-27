# Getting Started

CogAIt is a monorepo with a React frontend (`src/`), a Convex backend (`convex/`) and an agent layer of Node.js services (`agents/`).

## Prerequisites
- Node.js **22.12+** (Vitest 5 requires it)
- npm
- A [Convex](https://convex.dev) account
- A [Gemini API key](https://aistudio.google.com/apikey)

## Environment variables

There are three places to configure. The `.env.example` files list each variable with a comment.

**Frontend: `.env.local`** (copy from `.env.example`)
- `CONVEX_DEPLOYMENT`, `VITE_CONVEX_URL`: written for you by `npx convex dev`
- `VITE_AGENT_URL`: leave empty in local dev (Vite proxies `/agent2`, `/agent7` and `/agent-negotiation` to localhost)

**Convex deployment:** set with `npx convex env set NAME value`
- `GOOGLE_API_KEY` (required): Gemini key for the tutor and assignment generation
- `AGENT_SECRET` (required for agents): shared secret; must equal the one in `agents/.env`
- `GEMINI_MODEL` (optional): defaults to `gemini-3.5-flash`
- `AGENT1_URL` (optional): public URL of Agent 1. When set, the tutor asks Agent 1 for each reply and falls back to direct Gemini if it is unreachable
- `RESEND_API_KEY`, `RESEND_FROM_EMAIL` (optional): email notifications

**Agents: `agents/.env`** (copy from `agents/.env.example`)
- `CONVEX_URL`: your deployment URL (`https://<name>.convex.cloud`)
- `GOOGLE_API_KEY`: Gemini key (agents call Gemini through the Convex proxy route)
- `AGENT_SECRET`: same value as in Convex
- `GEMINI_MODEL`, `MOCK_LLM`, `PORT` (optional)
- `AGENT2_URL` … `AGENT8_URL`, `NEGOTIATION_URL` (optional): where to deliver events when services do not run on localhost

## Running locally

```bash
npm install
npm --prefix agents install
cp .env.example .env.local
cp agents/.env.example agents/.env
npx convex dev --once
npx convex env set GOOGLE_API_KEY <key>
npx convex env set AGENT_SECRET <random-string>
npm run dev
```

`npm run dev` starts the Vite frontend, `convex dev` and all agents (ports 8081–8089). To run one part only, use `npm run dev:frontend`, `npm run dev:backend` or `npm run dev:agents`. `start.sh` does the same on macOS/Linux with nvm, and frees the ports first.

**Note:** Convex runs in the cloud, so it cannot call agents on your `localhost`. Locally the tutor therefore uses its direct-Gemini path. The browser still reaches agents 2, 7 and negotiation through the Vite proxy.

## Checks

```bash
npm run typecheck          # frontend, Convex and agents
npm test                   # unit tests, no network
npm run validate:runtime   # 10 invariant suites over the source code
npm run build              # production frontend build
npm run convex:check       # pushes and validates functions on your dev deployment
```

The black-box stress test (`stressTest/cogait_stress_test.mjs`) creates users and data on a **live** deployment. Run it only against a test deployment: `CONVEX_URL=https://<test>.convex.cloud node stressTest/cogait_stress_test.mjs`.
