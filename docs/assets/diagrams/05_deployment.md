# Deployment Architecture

Target topology. The frontend and Convex parts are standard; the Cloud Run part is prepared
(Dockerfiles, Cloud Build configs) but **not yet deployed or verified**. See FUTURE_ACTIONS.

```mermaid
flowchart LR
    Browser[Student / Lecturer Browser]

    subgraph Static["Static hosting (any)"]
        React[Vite build]
    end

    subgraph ConvexCloud["Convex Cloud"]
        Router[HTTP router + Gemini proxy]
        Functions[Queries / Mutations / Actions / Crons]
        Datastore[(Convex DB)]
    end

    subgraph GCP["Google Cloud Run (planned)"]
        A1[Agent 1]
        A2[Agent 2]
        AN[Agents 3-8 + Negotiation]
        Store[(Durable agent memory - TODO)]
    end

    Browser <--> React
    Browser <-->|WebSocket| Functions
    Browser -->|user token| A2
    Functions -->|X-Agent-Key| A1
    A2 -->|events, X-Agent-Key| AN
    A1 & A2 & AN -->|agent key| Functions
    A1 & A2 & AN -->|chat completions| Router
    Functions <--> Datastore
    AN --> Store
```
