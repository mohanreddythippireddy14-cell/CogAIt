# Roadmap

The concrete, step-by-step list is in [FUTURE_ACTIONS.md](../FUTURE_ACTIONS.md). This page is the high-level view.

## Phase 1: Prototype (now)
- JEE/NEET student platform with the 4-level Socratic tutor, answer-leak validation and help limits.
- Lecturer dashboards, AI assignment generation, integrity monitoring.
- Agent layer for post-session analysis (beta).

## Phase 2: Pilot
- Enforce the think-first gate.
- Deploy the agents (Cloud Run) with durable memory and real Pub/Sub.
- Run a first pilot with an institution, and publish measured results: tutor latency, cost per help request, answer-leak rate and CIS change over time.

## Phase 3: B2B SaaS
- White-label platform for coaching institutes, multi-institution analytics, per-institution cost governance.

## Phase 4: Reasoning-focused models
- Fine-tune a model trained to *ask* rather than *answer*, using the logged tutor interactions and Judge verdicts.

## Known limitations
- STEM only (Physics, Chemistry, Math), English only, web only.
- Agent 3 content is not grounded in verified sources yet.
- The UI is mid-transition from a dark "spatial" theme to a light Google-Classroom-style theme.
