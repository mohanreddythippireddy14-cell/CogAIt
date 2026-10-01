# INTERVIEW

Rules: ask **once**, in **one batch**, grouped by topic. Record answers verbatim below the question. Never ask again. Items already answered by repo evidence are marked **[KNOWN FROM REPO]** and are not re-asked.

Status: **QUESTIONS ISSUED, ANSWERS PENDING** (Phase 1).

---

## Group A — Product
**A1.** In one sentence, what is CogAIt, who is it for, and what do those people do today instead?
- Already in repo: page title "CogAIt — Think-First AI Learning" (`index.html`); meta description "AI-powered learning platform that builds independent thinking through Socratic tutoring"; the Socratic agent's system prompt names "JEE and NEET aspirants" (`agents/src/agent1_socratic/index.ts`).
- **ANSWER:**

**A2.** What is the "aha moment", and are the top 3 use cases what I assume? **[KNOWN FROM REPO — confirm or correct: student = attempt an assignment, escalate through tiered help, see cognitive/independence results; lecturer = build assignments, read analytics, watch live sessions]**
- **ANSWER:**

## Group B — Users and status
**B1.** Which features are **shipped and stable**, which are **beta**, which are **planned only**? The repo has 24 feature flags — 7 default ON, 17 default OFF. Default-OFF does *not* automatically mean "planned", so please classify.
- Default ON: `dashboardRollups`, `teacherDashboardApi`, `thinkFirstGate`, `mathRendering`, `questionNavigator`, `enhancedIntegrity`, `resultsV2`.
- Default OFF: `structuredLogging`, `aiUsageMetrics`, `integrityDashboard`, `optimizedQueries`, `cachingLayer`, `aiQueueAbstraction`, `auditTrail`, `orgRateLimit`, `serverSideIntegrity`, `strictJsonValidation`, `promptVersioning`, `aiRegressionEnforcement`, `apiV1Routing`, `adminDashboard`, `multiInstitutionAnalytics`, `costGovernance`, `internalOpsPanels`.
- **ANSWER:**

**B2.** What is deliberately **out of scope** / not supported? (candidates from code: languages other than English; subjects other than Physics/Chemistry/Math; proctoring beyond tab-switch + copy/paste; native mobile apps; offline mode.)
- **ANSWER:**

## Group C — Differentiation
**C1.** Which direct competitors/alternatives should the comparison doc cover (e.g. Khanmigo, ChatGPT/Claude, Photomath, an institutional LMS, plain paper practice), and what do you claim CogAIt does differently?
- Note: `PROJECT_AUDIT.md` already asserts a "Socratic constraint architecture" as the USP — I treat that as an auditor's opinion until you confirm it as your claim.
- **ANSWER:**

## Group D — Evidence and metrics
**D1.** Which numbers exist, and where? Performance, accuracy, latency, cost per request, token usage, user counts, pilot or lecturer/student feedback, test results, build stats. **I found no metrics, benchmark, coverage or results file anywhere in the repo** — so every figure is currently `TODO: needs input`.
- **ANSWER (metric → value → file/link → measured how → date):**

**D2.** Which of those may appear as **headline** numbers in the README, and how was each measured (hardware, dataset, load, date)?
- **ANSWER:**

## Group E — Journey
**E1.** Phase by phase: what you built, in what order, why, and what failed or changed direction.
- Evidence I already have (correct it and fill gaps): `runtimeValidation/phase3…phase8Validation.ts` imply numbered engineering phases with rollback simulations; `_ui_replacement/` is a UI redesign dated **2026-04-14** replacing a dark purple/neon theme (`#4820dc` / `#0a0a0f`) with a Google-Classroom light theme (`#1f73e6` / `#ffffff`) — unknown whether merged into `src/`, abandoned, or pending; `PROJECT_AUDIT.md` records one pre-push state; git has a **single** commit (`736400e`, message `"b"`, 2026-04-12, Mohan Reddy), so commit history cannot supply a timeline.
- **ANSWER:**
