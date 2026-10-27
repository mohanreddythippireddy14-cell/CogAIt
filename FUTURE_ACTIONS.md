# Future Actions & Current Limitations

What still needs doing, in priority order. Each item says **what you need** and gives **concrete steps**, so it can be picked up as soon as the resources are available. It replaces `docs/OPEN_ITEMS.md`, which is now in `docs/archive/`.

Last reviewed: 2026-10-27.

## A. Do next (no extra resources needed)

### A0. Right after merging PR #2 (October 2026 cleanup) · *needs: your Convex dev deployment* · **do first**
The cleanup added a Convex index and new environment variables. It was typechecked, unit-tested and built (locally and in CI), but nothing was run against a live Convex deployment or Gemini. Until steps 1–3 are done, the agents cannot talk to Convex.
0. Check that the CI badge on `main` is green (Actions tab → CI).
1. `npx convex env set AGENT_SECRET <random-string>` and put the same value in `agents/.env` (`AGENT_SECRET=`). Without it, every agent-facing Convex function refuses calls.
2. `npx convex env set GOOGLE_API_KEY <key>` if not set already. Then copy `agents/.env.example` to `agents/.env` and set `CONVEX_URL` and `GOOGLE_API_KEY`.
3. `npm run convex:check` (`npx convex dev --once`). This pushes the new `aiInteractions.by_student` index and the changed functions.
4. Smoke test: as a student, ask the tutor for help 6 times within 5 minutes. The 6th request should be refused with a "try again in …s" message.
5. Run the agents (`npm run dev:agents`), submit an answer, and check the results-page chat: Agent 2's summary, then the negotiation offer.
6. Optional: `npm --prefix agents run test:negotiation` (runs against your deployment).

### A1. Enforce the think-first gate · *needs: nothing* · **highest product priority**
**Problem:** the core promise ("think first") is not enforced. `assignments.minReasoningChars` is stored (default 30) but nothing checks it before AI help.
1. In `convex/ai.ts` `sendChatMessage` and `sendImageFeedback`, load the assignment and reject the request when `(attempt.studentReasoning ?? "").trim().length < assignment.minReasoningChars`, with a student-readable message.
2. In `src/components/QuestionView.tsx`, disable the chat Send button and show a counter until the reasoning box reaches the minimum (the assignment is already loaded there).
3. Decide the default: keep 30, or raise it to 100 as the original pitch said (`convex/assignments.ts` lines 80/284/337, `CreateAssignment.tsx`, `CreateAIAssignment.tsx`).
4. Add a unit test for the check (put the length rule in `convex/domain/` so it is pure), and update the README guardrail table.

### A2. Limit help-level jumps in code · *needs: nothing*
The prompt tells the model to move one level at a time, but `ai.ts` accepts any level from 1 to 4. Clamp `effectiveHelpLevel` to `activeHelpLevel ± 1`, and add a test.

### A3. Commit lockfiles · *needs: nothing*
`package-lock.json` is git-ignored (a template leftover), so installs are not reproducible. Remove it from `.gitignore`, commit `package-lock.json` and `agents/package-lock.json`, and switch CI to `npm ci`.

### A4. Product assets · *needs: a running app*
- Capture screenshots for the README: sign-in, student question view with the help levels, integrity consent, results with CIS and heatmap, lecturer dashboard, live session monitor.
- Record a 60–90 s demo video.
- `index.html` references a missing `/og-preview.png`. Add the image or remove the tag.
- `public/branding/logo.png` is 636 KB. Export a compressed PNG/SVG.

### A5. Finish the UI theme transition · *needs: a design decision*
`index.html` and `App.tsx` still use the dark "spatial" theme while toasts use the light theme. Pick one and apply it. (The abandoned redesign export is in git history under `_ui_replacement/`.)

## B. Do when you have Google Cloud resources

### B1. Deploy the agents to Cloud Run · *needs: a GCP project, billing* · **highest infra priority**
**Problem:** the agents only run locally today. On Cloud Run three things break: agent memory (`agents/.memory` JSON files) is lost on restart, events default to `localhost`, and Convex cannot reach agents on a laptop.
1. Move agent memory (briefings, judge verdicts, cohort buffers, CIS snapshots) to durable storage, ideally new Convex tables written through `agentAPI.ts` (keeps one database), or Firestore.
2. Build and deploy each service with `gcloud builds submit --config agents/deploy/cloudbuild-<name>.yaml agents/`.
3. On every service set `CONVEX_URL`, `GOOGLE_API_KEY`, `AGENT_SECRET` and the routes `AGENT2_URL` … `AGENT8_URL` and `NEGOTIATION_URL`.
4. In Convex: `npx convex env set AGENT1_URL https://<agent1-service-url>`. In the frontend build: `VITE_AGENT_URL` (and change the `/agent2`-style paths, or put a gateway in front of the services).
5. Replace the shared `AGENT_SECRET` with Cloud Run IAM (service accounts, ID tokens) and drop `--allow-unauthenticated` for service-only agents.
6. Optionally replace `agents/src/pubsub` with Cloud Pub/Sub topics and push subscriptions; the topic names and routes are already defined there.

### B2. Ground Agent 3 in verified content · *needs: Vertex AI Search, licensed or open content*
**Problem:** practice material is generated from model knowledge alone, so it is capped at 0.6 confidence and flagged for review.
1. Build a Vertex AI Search datastore from content you are allowed to use (e.g. NCERT, past NTA papers with their licences checked).
2. Add a search tool in `agents/src/tools/agent3_tools.ts`, pass the retrieved passages and citations into the prompt, and raise `MAX_UNGROUNDED_CONFIDENCE` only for grounded output.
3. Add a lecturer review queue for `human_review_required` sets before students see them.

### B3. Document AI for Agent 5, and use it from the UI · *needs: Document AI processor*
1. OCR uploaded PDFs with Document AI and pass the text to Agent 5's `/webhook/document_uploaded`.
2. Decide whether Agent 5 replaces or complements the Convex PDF generator (`convex/facultyAssignments.ts`), and wire the lecturer upload flow accordingly.

## C. Evidence for a pilot (needs real usage)
- **Latency and cost:** p50/p95 reply time and tokens per help request, from `aiInteractions` (`responseTimeMs`, `tokensUsed`).
- **Leak rate:** the share of replies that needed regeneration or the fallback (`aiViolations`), plus Agent 8 verdicts.
- **Learning effect:** CIS distribution for the same cohort over several weeks (Agent 4 reports).
- **Pilot details:** institution (or anonymised), cohort size, dates, teacher quotes.
- **Privacy note** before any pilot: what student data is stored, retention, and where the LLM provider processes it.

## D. Product features (planned, not built)

| Feature | Notes |
|---|---|
| Organisation rate limits and cost governance | Code exists behind `orgRateLimit` / `costGovernance` flags (off). Feature flags are in-memory, so per-org overrides need a persisted flag table first |
| Lecturer alert delivery | Agent 7 critical alerts are only logged. Send them through Resend (already used in `convex/notifications.ts`) |
| Admin / ops dashboard | `adminDashboard`, `internalOpsPanels` flags exist |
| Multi-institution white label (B2B) | Data model is organisation-scoped already |
| Hindi / regional languages | Prompts and UI are English-only |
| Mobile app / offline | Not started |
| Reasoning-focused fine-tuned model | Use the logged interactions and Judge verdicts as training/eval data |

## E. Current limitations (summary)

| Area | Limitation |
|---|---|
| Think-first gate | Not enforced (A1) |
| Help levels | Level jumps are limited only by the prompt (A2) |
| Agents | Local only; memory is local JSON; events default to localhost (B1) |
| Agent 1 routing | Convex cloud cannot reach local agents, so locally the tutor uses direct Gemini |
| Agent 3 | Not grounded in verified sources; always needs review (B2) |
| Agent 5 | Needs text as input; not used by the UI (B3) |
| Agent 8 | Records verdicts; does not block replies (the Convex validator does) |
| Gemini proxy route | Pass-through for agents; anyone who has a Gemini key can use it as a relay |
| Tests | Unit tests cover pure logic; no automated end-to-end test against a deployment |
| Verification | The October 2026 changes were typechecked, unit-tested and built, but not run against a live Convex deployment or Gemini (A0) |
