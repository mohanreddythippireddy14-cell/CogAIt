# Data & AI

CogAIt relies on a strict separation of concerns between operational data and AI processing. 

## Data Model (Convex)
The database schema defines 28 tables. Key entities include:
- `userProfiles`: Defines `student`, `lecturer`, and `organizationAdmin` roles.
- `assignments`, `questions`, `attempts`: Standard LMS entities.
- `sessionLocks`, `aiViolations`: Proctoring and integrity tables.
- `aiInteractions`, `aiUsageMetrics`: Telemetry for AI cost governance and student analysis.
- `organizations`: Multi-tenant boundary. Most operational tables possess a `by_org_and_...` index to enforce tenant isolation.

## The Agentic Layer
CogAIt uses 8 specialized autonomous agents built with Hono on Node.js.
- **Agent 1 (Socratic):** The core tutor. Never gives direct answers.
- **Agent 2 (Analyst):** Evaluates completed sessions to determine cognitive gaps.
- **Agent 3 (Content):** Generates targeted remediation assignments.
- **Agent 4 (Long-term):** Maintains longitudinal mastery profiles.
- **Agent 5 (Ingestion):** OCR/PDF processing to generate new assignments.
- **Agent 6 (Cohort):** Aggregates data for class-wide insights.
- **Agent 7 (Recommendation):** Generates actionable briefs for lecturers.
- **Agent 8 (Judge):** Evaluates AI responses for policy violations and schema errors.

## Model and Prompt Strategy
The agents use the `gemini-2.5-flash` model, accessed via the Groq SDK.
To enforce strict JSON responses, all agents pass `response_format: { type: 'json_object' }`. 

### Guardrails
1. **The Think-First Gate:** A student must provide at least 100 characters of reasoning before Agent 1 will engage.
2. **Proxy Bottleneck:** All agent traffic routes through a Convex HTTP endpoint (`/api/gemini-proxy/...`) which enforces cost governance and rate limits (5 requests per 5 minutes per user).
3. **Response Validation (Agent 8):** AI responses are audited for final numerical answers or complete solutions. If an answer leak is detected, a fallback Socratic response is served instead.
