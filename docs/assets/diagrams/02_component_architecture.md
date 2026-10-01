# Component Architecture Diagram

```mermaid
C4Container
    title Component Architecture for CogAIt

    Container_Boundary(frontend, "Frontend Application") {
        Container(react_app, "React App", "React 19.2, Vite 6.2", "Role-based router, UI, Dashboards, Socratic chat interface")
    }

    Container_Boundary(backend, "Convex Backend") {
        Container(convex_db, "Convex Database", "Convex", "Stores UserProfiles, Assignments, Sessions, AiInteractions, Analytics")
        Container(convex_logic, "Convex Server Functions", "TypeScript", "Mutations, Queries, Cron Jobs, Rollups, API V1")
        Container(gemini_proxy, "Gemini Proxy", "TypeScript", "Proxies requests from agents to Gemini models")
    }

    Container_Boundary(agent_layer, "Agentic Layer (Microservices)") {
        Container(agent1, "Agent 1: Socratic", "Node.js / Hono", "Socratic tutoring (Port 8081)")
        Container(agent2, "Agent 2: Analyst", "Node.js / Hono", "Session analysis (Port 8082)")
        Container(agent3, "Agent 3: Content", "Node.js / Hono", "Remediation generation (Port 8083)")
        Container(agent4, "Agent 4: Long-term", "Node.js / Hono", "Tracks mastery over time (Port 8084)")
        Container(agent5, "Agent 5: Ingestion", "Node.js / Hono", "Document ingestion & extraction (Port 8085)")
        Container(agent6, "Agent 6: Cohort", "Node.js / Hono", "Cohort analysis (Port 8086)")
        Container(agent7, "Agent 7: Recommendation", "Node.js / Hono", "Generates teacher recommendations (Port 8087)")
        Container(agent8, "Agent 8: Judge", "Node.js / Hono", "Validates policies and schemas (Port 8088)")
        Container(negotiation, "Negotiation Node", "Node.js", "Handles student remediation offers (Port 8089)")
    }

    Rel(react_app, convex_logic, "Calls APIs", "HTTPS / WebSocket")
    Rel(convex_logic, convex_db, "Reads/Writes", "Internal")
    Rel(convex_logic, agent1, "Triggers AI Help", "HTTP")
    Rel(convex_logic, agent5, "Triggers Document Ingestion", "HTTP")
    Rel(agent_layer, gemini_proxy, "Requests Completions", "HTTP")
    Rel(gemini_proxy, convex_logic, "Returns Validated Responses", "Internal")
```
