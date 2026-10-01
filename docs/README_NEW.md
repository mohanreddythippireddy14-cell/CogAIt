# CogAIt — Think First, AI Next

> **Protecting independent thinking in the age of artificial intelligence — a learning system designed to strengthen reasoning, judgment, and cognitive independence before AI ever steps in.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

CogAIt is an agentic AI learning platform built for JEE and NEET aspirants. Unlike standard EdTech tools that provide instant step-by-step solutions, CogAIt utilizes a strict **Socratic tutoring framework**. It forces students to earn their answers through cognitive struggle, tracking their reasoning and identifying AI dependency risks.

## Documentation Suite

Welcome to the CogAIt documentation. Whether you are an educator, a developer, or a system architect, these guides will help you understand and deploy the platform.

1. **[Pitch & Product Vision](01_pitch.md)** - The problem we solve and why it matters.
2. **[Getting Started](02_getting_started.md)** - Local setup, environment variables, and dev commands.
3. **[Features Matrix](03_features.md)** - What's live, what's beta, and what's out of scope.
4. **[System Architecture](04_architecture.md)** - Diagrams of the 8-agent orchestration layer and data flow.
5. **[Data & AI](05_data_and_ai.md)** - Database schemas, guardrails, and model strategy.
6. **[Roadmap](06_roadmap.md)** - The future of CogAIt.

## Quick Start

```bash
# Clone the repository
git clone https://github.com/your-username/cogait.git
cd cogait

# Install dependencies and start the full stack (Frontend, Backend, and Agents)
npm install
npm run dev
```

For full environment configuration, see the [Getting Started guide](02_getting_started.md).

## Built With
- **Frontend:** React 19.2, Vite 6.2, Tailwind CSS 3.4
- **Backend:** Convex (Serverless Database & Functions)
- **Agentic Layer:** Node.js, Hono, Groq SDK, Google Gemini (2.5 Flash)
- **Infrastructure:** Google Cloud Run
