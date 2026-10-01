# CogAIt — Think First, AI Next

> **Protecting independent thinking in the age of artificial intelligence — a learning system designed to strengthen reasoning, judgment, and cognitive independence before AI ever steps in.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

CogAIt is an agentic AI learning platform built initially for JEE and NEET aspirants. Unlike standard EdTech tools that provide instant step-by-step solutions, CogAIt utilizes a strict **Socratic tutoring framework**. It forces students to earn their answers through cognitive struggle, tracking their reasoning and identifying AI dependency risks.

---

## 🛑 The Problem: AI Is Outsourcing Our Thinking

When students rely on AI for instant answers, they skip the cognitive effort that builds real understanding. Routine use of AI for solutions and step-by-step walkthroughs feels productive, but it replaces the mental struggle required for deep learning. This creates a "reasoning gap"—students memorize patterns but cannot apply first principles when under pressure. The result is faster completion, but weaker reasoning, judgment, and independent problem-solving skills.

## 💡 The Solution: Socratic AI Framework

CogAIt is an agentic AI learning platform designed to strengthen reasoning. Every interaction is engineered to progressively reduce dependency. The AI never closes the loop; the student always does.

1. **Logic Check Only**: AI evaluates if the student's approach is logically sound and confirms direction without revealing the path.
2. **Light Hints**: AI offers a gentle nudge, surfacing a relevant principle (e.g., "Have you considered how energy conservation applies here?").
3. **Strong Guidance**: AI breaks down the problem structure and guides reconstruction step-by-step, but does not complete any step.
4. **Maximum Support**: Full scaffolding is provided (concept explanation, analogies), but the final answer and solution steps are left for the student to complete.

### Why It Wins
- **It is a Painkiller, Not a Vitamin:** The market is flooded with tools that help students *get* answers. CogAIt helps students *earn* answers. 
- **Cognitive Health Visibility:** Institutions get a cognitive health report card for their student body. Dashboards reveal reasoning patterns and flag dependency risks early.
- **Architectural Depth:** CogAIt is powered by an orchestration of 8 specialized, autonomous agents that monitor progress, surface risks, and deliver timely support even when offline.

---

## 🏗 System Architecture

CogAIt is built on a modern, serverless-first stack designed for high concurrency and strict data integrity. The core innovation is an asynchronous, 8-agent orchestration layer that acts independently of the main request-response cycle.

### Tech Stack
- **Frontend:** React 19.2, Vite 6.2, Tailwind CSS 3.4
- **Backend & Datastore:** Convex (Serverless Database & Functions)
- **Agentic Layer:** Node.js, Hono, Groq SDK, Google Gemini (2.5 Flash)
- **Infrastructure:** Google Cloud Run

### 8-Agent Orchestration
CogAIt uses 8 specialized autonomous agents:
- **Agent 1 (Socratic):** The core tutor. Never gives direct answers.
- **Agent 2 (Analyst):** Evaluates completed sessions to determine cognitive gaps.
- **Agent 3 (Content):** Generates targeted remediation assignments.
- **Agent 4 (Long-term):** Maintains longitudinal mastery profiles.
- **Agent 5 (Ingestion):** OCR/PDF processing to generate new assignments.
- **Agent 6 (Cohort):** Aggregates data for class-wide insights.
- **Agent 7 (Recommendation):** Generates actionable briefs for lecturers.
- **Agent 8 (Judge):** Evaluates AI responses for policy violations and schema errors.

*(For detailed visual diagrams including Data Flow, User Flow, and Component Architecture, see the [`docs/assets/diagrams/`](docs/assets/diagrams) folder).*

---

## 🛡️ Data, AI & Guardrails

The platform relies on a strict separation of concerns between operational data and AI processing. Operational data flows from the React client into Convex. The agentic layer pulls sanitized, anonymized session data to perform long-term analysis, passing context to the LLMs.

**Guardrails Enforced:**
1. **The Think-First Gate:** A student must provide at least 100 characters of reasoning before Agent 1 will engage.
2. **Proxy Bottleneck:** All agent traffic routes through a Convex HTTP endpoint (`/api/gemini-proxy/...`) which enforces cost governance and rate limits (5 requests per 5 minutes per user).
3. **Response Validation (Agent 8):** AI responses are audited for final numerical answers or complete solutions. If an answer leak is detected, a fallback Socratic response is served instead.
4. **Enhanced Integrity & Proctoring:** Tab-switch locking and copy/paste detection during assignments.

---

## 🚀 Getting Started

CogAIt is a full-stack monorepo.

### Prerequisites
- Node.js (v20+ recommended)
- `npm` (Project uses `npm` scripts heavily)
- A [Convex](https://convex.dev/) account and project

### Environment Variables
You will need to set up the following environment variables. Do not commit these to source control. Refer to `.env.example` in the root and in the `agents/` directory.

**Root `.env.local`:**
`VITE_CONVEX_URL`, `VITE_CONVEX_SITE_URL`, `VITE_AGENT_URL`, `CONVEX_DEPLOY_KEY`, `CONVEX_DEPLOYMENT`

**Agents `.env` (`agents/.env`):**
`CONVEX_URL`, `CONVEX_SITE_URL`, `GROQ_API_KEY`, `GOOGLE_API_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `AGENT_SECRET`, `PORT`, `NODE_ENV`

### Running Locally

To start the entire stack (Frontend, Backend, and all 8 Agents), use the unified dev script:
```bash
npm install
npm run dev
```

Alternatively, run components individually:
- **Frontend only:** `npm run dev:frontend`
- **Backend only:** `npm run dev:backend`
- **Agents only:** `npm run dev:agents`

### Testing & Validation
CogAIt includes a custom runtime invariant validator and a black-box stress test suite.
```bash
# Run 10 invariant validation suites
npm run validate:runtime

# Run the black-box stress test against live deployment
node stressTest/cogait_stress_test.mjs
```

---

## 🗺️ Roadmap & Features

| Feature | Status | Description |
|---|---|---|
| **Student Platform (JEE/NEET)** | **Live** | Full exam-style interface with Socratic AI interaction. |
| **Think-First Gate** | **Live** | Requires >100 characters of reasoning before requesting AI help. |
| **4-Level AI Assistance** | **Live** | Dynamic Socratic agent scaling from Logic Checks to Maximum Scaffolding. |
| **Agentic Layer** | **Beta** | 8-node microservice orchestration for asynchronous analysis. |
| **B2B SaaS / White-labeling** | **Planned** | Multi-institution white-label platform for coaching centers (Phase 2). |

---

## 📖 Deep Dive Documentation
For deeper context into individual architecture pillars, review the standalone documentation files:
- [Pitch & Product Vision](docs/01_pitch.md)
- [Getting Started & Operations](docs/02_getting_started.md)
- [Features & Scope](docs/03_features.md)
- [System Architecture](docs/04_architecture.md)
- [Data & AI Guardrails](docs/05_data_and_ai.md)
- [Roadmap](docs/06_roadmap.md)
