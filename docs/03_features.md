# Features & Status

The CogAIt platform makes extensive use of feature flags to manage rollouts. Below is the current matrix of features, their status, and what is deliberately out of scope.

## Feature Matrix

| Feature | Status | Description |
|---|---|---|
| **Student Platform (JEE/NEET)** | **Live** | Full exam-style interface with Socratic AI interaction. |
| **Think-First Gate** | **Live** | Requires students to input >100 characters of reasoning before requesting AI help. |
| **4-Level AI Assistance** | **Live** | Dynamic Socratic agent that scales from Logic Checks to Maximum Scaffolding. |
| **Math Rendering** | **Live** | KaTeX/LaTeX support for complex STEM problems. |
| **Enhanced Integrity & Proctoring** | **Live** | Tab-switch locking and copy/paste detection during assignments. |
| **Teacher Dashboard API** | **Live** | Core endpoints for teacher classroom analytics. |
| **Results V2** | **Live** | Advanced results and cognitive independence readouts. |
| **Agentic Layer** | **Beta** | 8-node microservice orchestration for asynchronous analysis and generation. |
| **B2B SaaS / White-labeling** | **Planned (Phase 2)** | Multi-institution white-label platform for coaching centers. |
| **Cost Governance** | **Planned** | Hard limits and dashboarding for LLM usage and billing. |
| **Admin Dashboard** | **Planned** | System-wide monitoring and internal operations panels. |
| **AI Regression Enforcement** | **Planned** | Automated gating for AI prompt/model updates. |

## Out of Scope
CogAIt deliberately **does not** support the following, as they directly conflict with our pedagogical mission:
- **Instant Gratification Solutions:** The AI will never provide a direct numerical answer or a fully completed step-by-step solution.
- **Cognitively Passive Learning:** Features that allow students to bypass the "struggle" phase of problem-solving.

*(Currently unoptimized for non-STEM subjects or native offline mobile apps).*
