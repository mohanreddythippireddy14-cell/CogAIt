# Data & AI

## Data model (Convex)
`convex/schema.ts` defines 29 application tables, plus the Convex Auth tables. The key ones:
- `organizations`, `userProfiles`: tenants and the `student` / `lecturer` / `organizationAdmin` roles.
- `assignments`, `questions`, `attempts`, `assignmentProgress`: the assessment model.
- `aiInteractions`, `aiViolations`, `aiUsageMetrics`, `promptVersionEvents`: tutor telemetry.
- `sessionLocks`: integrity (tab switches, copy/paste, violations).
- `agentConversations`, `pendingRemediations`: post-session chat and remediation offers used by the agents.
- `*AnalyticsRollups`, `costGovernance*`, `orgRateLimitCounters`: dashboards and (flagged) limits.

Most tables carry `organizationId`, and queries check it (`requireSameOrganization`).

## The tutor (Convex)
`ai.sendChatMessage` (and `sendImageFeedback` for photos of written work):
1. Authenticates the student and checks attempt ownership.
2. Applies the per-student help limit: 5 requests per 5 minutes, at least 30 s apart.
3. Builds the Socratic prompt for the current level (taken from the last interaction).
4. Gets a reply from **Agent 1** if `AGENT1_URL` is configured, otherwise from Gemini directly (`gemini-3.5-flash` by default).
5. Runs the **answer-leak validator**: final numerical answer, step-by-step solution, direct confirmation, and over-long replies at levels 1–2. It regenerates up to 3 times, then serves a fixed fallback question.
6. Stores the interaction and updates help stats, which feed the CIS.

The interaction, violation and help-stat writes are internal mutations, so students cannot write their own help history.

## The agent layer

| Agent | Input | Output | Notes |
|---|---|---|---|
| 1 Socratic | Question context, last turns, message, level | One Socratic question + new level | Input guardrails: ≥15 chars, "give me the answer" patterns, PII, LLM injection check |
| 2 Analyst | Session log + proctoring signals | Topic classification, weak/strong topics, chat summary | LLM; output checked by an LLM quality judge |
| Negotiation | Agent 2 output; student replies | Remediation offer, consent handling | 15-minute consent window with expiry sweep |
| 3 Content | Weak topics, preference, time | Theory + timed practice set | No verified sources connected: confidence capped at 0.6, always flagged for human review |
| 4 Long-term | Student id (+ assignment) | CIS per window, topic trends, risk flags, narrative | Numbers computed from Convex history; LLM writes only the narrative |
| 5 Ingestion | Extracted document text | Draft assignment in Convex | Needs text as input; Document AI OCR is not integrated |
| 6 Cohort | Agent 4 reports (≥5 per assignment) | Failing topics, at-risk / AI-dependent students, cohort CIS trend | Deterministic |
| 7 Recommendation | Cohort data | Lecturer briefing | LLM + deterministic fallback when the LLM is unavailable |
| 8 Judge | Outputs of agents 1, 3, 7 | Verdict log; scheduled summaries | Regex leak check (same patterns as Convex) + LLM rubric |

All agent inputs and outputs are validated against hand-written schemas (`agents/src/guardrails/schema_validator.ts`).

## Model and prompt strategy
- One default model: `gemini-3.5-flash`, overridable with `GEMINI_MODEL` in Convex and in the agents.
- Agents request strict JSON (`response_format: json_object`) and validate it.
- The agents' Gemini calls go through the Convex proxy route using the Groq SDK as an OpenAI-compatible client. No Groq-hosted models are used.

## Guardrails: summary
1. **Answer-leak validator** on every tutor reply: enforced.
2. **Help limit** (5 per 5 minutes, 30 s apart, per student): enforced.
3. **Agent 1 input guardrails:** enforced when the tutor routes through Agent 1.
4. **Think-first gate:** *not enforced yet* (see FUTURE_ACTIONS A1).
5. **Judge (Agent 8):** audits after the fact; it records verdicts and does not block replies.
