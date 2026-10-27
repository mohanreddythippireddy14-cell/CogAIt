# Component Architecture Diagram

```mermaid
C4Container
    title Component Architecture for CogAIt

    Container_Boundary(frontend, "Frontend") {
        Container(react_app, "React App", "React 19, Vite 6", "Student and lecturer UIs, Socratic chat, dashboards")
    }

    Container_Boundary(backend, "Convex") {
        Container(convex_logic, "Convex Functions", "TypeScript", "Tutor action (ai.sendChatMessage), scores, rollups, crons, agentAPI")
        Container(convex_db, "Convex Database", "Convex", "29 organisation-scoped tables")
        Container(gemini_proxy, "Gemini proxy route", "HTTP action", "Pass-through to Gemini's OpenAI-compatible API for the agents")
    }

    Container_Boundary(agent_layer, "Agent services (Node.js / Hono)") {
        Container(agent1, "Agent 1: Socratic", "8081", "Tutor reply generation (optional)")
        Container(agent2, "Agent 2: Analyst", "8082", "Session -> topic signals")
        Container(negotiation, "Negotiation node", "8089", "Remediation offers")
        Container(agent3, "Agent 3: Content", "8083", "Practice sets")
        Container(agent4, "Agent 4: Long-term", "8084", "Student reports")
        Container(agent5, "Agent 5: Ingestion", "8085", "Text -> draft assignment")
        Container(agent6, "Agent 6: Cohort", "8086", "Cohort patterns")
        Container(agent7, "Agent 7: Recommendation", "8087", "Lecturer briefings")
        Container(agent8, "Agent 8: Judge", "8088", "Audits agent outputs")
    }

    Rel(react_app, convex_logic, "Queries, mutations, actions", "WebSocket/HTTPS")
    Rel(react_app, agent2, "Session ended (user token)", "HTTPS")
    Rel(react_app, agent7, "Request briefing (user token)", "HTTPS")
    Rel(react_app, negotiation, "Consent / chat replies (user token)", "HTTPS")
    Rel(convex_logic, convex_db, "Reads/Writes", "Internal")
    Rel(convex_logic, agent1, "Socratic reply (X-Agent-Key)", "HTTPS")
    Rel(agent_layer, convex_logic, "agentAPI, conversations (agent key)", "HTTPS")
    Rel(agent_layer, gemini_proxy, "Chat completions", "HTTPS")
```
