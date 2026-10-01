# Architecture

CogAIt is built on a modern, serverless-first stack designed for high concurrency and strict data integrity. The core innovation is an asynchronous, 8-agent orchestration layer that acts independently of the main request-response cycle.

## System Context
The platform serves Students and Lecturers, brokering data through Convex, and utilizing Google Gemini (via Groq) for high-speed inference.

[View System Context Diagram](assets/diagrams/01_system_context.md)

## Component Architecture
- **Frontend:** React 19.2 + Vite, heavily utilizing shadcn/Tailwind for the UI.
- **Backend Datastore & Logic:** Convex handles all operational data, role-based access, and cron jobs.
- **Agentic Layer:** Node.js/Hono microservices. 8 distinct agents communicate via webhooks and tasks, each with a narrow, focused system prompt.

[View Component Architecture Diagram](assets/diagrams/02_component_architecture.md)

## Main User Flow
The critical loop involves a student attempting a problem, getting blocked, and requesting help. The AI intervenes *without* giving the answer, forcing the student to resolve the logic gap.

[View User Flow Diagram](assets/diagrams/03_user_flow.md)

## Data Flow & Privacy
Operational data flows from the React client into Convex. The agentic layer pulls sanitized, anonymized session data to perform long-term analysis, passing context to the LLMs.

[View Data Flow Diagram](assets/diagrams/04_data_flow.md)

## Deployment
Convex acts as the serverless backbone. The Agentic layer is containerized (Docker) and deployed to Google Cloud Run, scaling to zero when idle.

[View Deployment Diagram](assets/diagrams/05_deployment.md)

## Architecture Evolution
The architecture has matured from a simple CRUD MVP to a complex, multi-agent enterprise infrastructure.

[View Architecture Evolution Diagram](assets/diagrams/06_architecture_evolution.md)

## API Sequence (Gemini Proxy)
To protect API keys and manage cost governance, all Agent LLM requests are proxied through a Convex HTTP endpoint.

[View API Sequence Diagram](assets/diagrams/07_api_sequence.md)
