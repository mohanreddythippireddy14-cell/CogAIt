# Getting Started

CogAIt is a full-stack monorepo featuring a React frontend, a Convex backend, and an 8-agent Node.js orchestration layer.

## Prerequisites
- Node.js (v20+ recommended)
- `npm` or `bun` (Project contains a `.bunfig.toml` but uses `npm` scripts heavily)
- A Convex account and project

## Environment Variables
You will need to set up the following environment variables. Do not commit these to source control. Refer to `.env.example` in the root and in the `agents/` directory.

**Root `.env.local`:**
- `VITE_CONVEX_URL`
- `VITE_CONVEX_SITE_URL`
- `VITE_AGENT_URL`
- `CONVEX_DEPLOY_KEY`
- `CONVEX_DEPLOYMENT`

**Agents `.env` (`agents/.env`):**
- `CONVEX_URL`
- `CONVEX_SITE_URL`
- `GROQ_API_KEY` (Used by agents for fast inference)
- `GOOGLE_API_KEY` (Used for Gemini models via proxy)
- `RESEND_API_KEY` (Optional, for email notifications)
- `RESEND_FROM_EMAIL`
- `AGENT_SECRET`
- `PORT`
- `NODE_ENV`

## Running Locally

To start the entire stack (Frontend, Backend, and all 8 Agents), use the unified dev script:
```bash
npm run dev
```

Alternatively, you can run the components individually:
- **Frontend only:** `npm run dev:frontend` (Vite dev server, typically port 5173)
- **Backend only:** `npm run dev:backend` (Convex dev server)
- **Agents only:** `npm run dev:agents` (Starts the agent mesh on ports 8081-8089)

*(Note: The repo includes a `start.sh` script which manages port cleanup and starts all services.)*

## Building and Typechecking

To run typechecking across the monorepo:
```bash
npm run typecheck
```

To build for production:
```bash
npm run build
```

## Testing & Validation
CogAIt includes a custom runtime invariant validator and a black-box stress test suite.

**Run Invariant Validators:**
```bash
npm run validate:runtime
```
This runs 10 suites that assert on source text, structure, and pure-function behavior to prevent regressions across architecture phases.

**Run Black-Box Stress Test:**
```bash
node stressTest/cogait_stress_test.mjs
```
This executes a suite against the live Convex deployment to verify security guards, locks, and agent concurrency.
