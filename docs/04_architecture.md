# Architecture

CogAIt has three parts:
- **React frontend** (`src/`): the student and lecturer UIs.
- **Convex backend** (`convex/`): data, auth, the tutor action, scores, crons.
- **Agent layer** (`agents/`): small Node/Hono services that analyse sessions after the fact.

The tutor itself runs in Convex, so it works without the agent layer. The agents add analysis and, optionally, the Socratic reply generation (Agent 1).

## System context
Students and lecturers use the web app. All AI calls go to Google Gemini.
[View diagram](assets/diagrams/01_system_context.md)

## Components
- **Frontend:** React 19 + Vite, Tailwind, Convex React hooks and Convex Auth.
- **Convex:** schema (29 application tables, organisation-scoped), queries/mutations/actions, 4 cron jobs (dashboard rollups, drift detection, AI job timeouts), and an HTTP router with data exports and the Gemini proxy used by the agents.
- **Agents:** 8 agents plus the negotiation node, each a Hono service with input/output schema validation, guardrail hooks and authenticated endpoints. Service-to-service calls use `X-Agent-Key`; browser calls use the user's Convex Auth token.

[View diagram](assets/diagrams/02_component_architecture.md)

## Main user flow
A student attempts a question, asks for help, receives a Socratic reply (never the answer), and submits. On submit, the browser notifies Agent 2, which starts the analysis chain.
[View diagram](assets/diagrams/03_user_flow.md)

## Data flow
Operational data lives in Convex. Agents read what they need through key-protected Convex functions (`convex/agentAPI.ts`) and keep their own records (briefings, verdicts, cohort buffers) as JSON files in `agents/.memory/`.
[View diagram](assets/diagrams/04_data_flow.md)

## Deployment
The frontend is a static Vite build, and Convex is hosted by Convex. The agents ship with Dockerfiles and Cloud Build configs for Cloud Run, but that deployment has **not** been verified. To run there they also need durable storage for agent memory and `AGENTn_URL` routes between services; see FUTURE_ACTIONS.
[View diagram](assets/diagrams/05_deployment.md)

## Agent LLM calls (Gemini proxy)
Agents call Gemini's OpenAI-compatible endpoint through the Convex route `/api/gemini-proxy/openai/v1/chat/completions`. The route is a pass-through: it forwards the request and the caller's key and does **not** enforce rate limits or cost governance.
[View diagram](assets/diagrams/07_api_sequence.md)

## History
[Architecture evolution](assets/diagrams/06_architecture_evolution.md)
