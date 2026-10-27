# Future Actions: what to do next, and exactly how

This is the to-do list for CogAIt, in priority order. Every item says **what you need**, the **exact steps** (commands, files, code) and **how to check it worked**, so you can pick up any item without re-reading the code first.

Last reviewed: 2026-10-27 (after PR #2 was merged). It replaces `docs/OPEN_ITEMS.md`, which is now in `docs/archive/`.

## Contents
- [0. How to make any change (do this every time)](#0-how-to-make-any-change-do-this-every-time)
- [A0. Set up your deployment after PR #2](#a0-set-up-your-deployment-after-pr-2--needs-15-minutes--do-first) (**do first**)
- [A1. Enforce the think-first gate](#a1-enforce-the-think-first-gate--needs-about-1-hour--highest-product-priority)
- [A2. Limit help-level jumps in code](#a2-limit-help-level-jumps-in-code--needs-about-30-minutes)
- [A3. Commit lockfiles](#a3-commit-lockfiles--needs-10-minutes)
- [A4. Product assets](#a4-product-assets-screenshots-demo-preview-image)
- [A5. Finish the UI theme](#a5-finish-the-ui-theme-transition)
- [B1. Deploy the agents to Cloud Run](#b1-deploy-the-agents-to-google-cloud-run--needs-a-gcp-project-with-billing)
- [B2. Ground Agent 3 in verified content](#b2-ground-agent-3-in-verified-content--needs-vertex-ai-search)
- [B3. Document AI for Agent 5](#b3-document-ai-ocr-for-agent-5--needs-a-document-ai-processor)
- [C. Evidence to collect in a pilot](#c-evidence-to-collect-in-a-pilot)
- [D. Planned product features](#d-planned-product-features)
- [E. Current limitations](#e-current-limitations)
- [F. Troubleshooting: error messages and what they mean](#f-troubleshooting-error-messages-and-what-they-mean)

---

## 0. How to make any change (do this every time)

1. Start from an up-to-date `main` and create a branch:
   ```bash
   git checkout main
   git pull
   git checkout -b fix/<short-name>
   ```
2. Make the change. Then run the same checks CI runs:
   ```bash
   npm run typecheck          # must print no errors
   npm test                   # all tests must pass
   npm run validate:runtime   # must exit without an error message
   npm run build              # must end with "built in ..."
   ```
   On Windows, if `npm test` fails with `spawn ... esbuild.exe ENOENT`, the folder path is too long. Clone the repo into a short path such as `C:\code\CogAIt` and run it there.
3. Commit, push and open a pull request:
   ```bash
   git add -A
   git commit -m "what you changed"
   git push -u origin fix/<short-name>
   gh pr create --fill
   ```
4. Wait for the **CI** check to go green on the PR, then merge it on GitHub. Auto-merge is switched off for this repository, so you have to click merge yourself.
5. If you changed anything in `convex/`, push it to your deployment: `npx convex dev --once`.

---

## A. Do next (no extra accounts or money needed)

### A0. Set up your deployment after PR #2 · *needs: 15 minutes* · **do first**
**Why:** PR #2 added a database index, a shared secret between the agents and Convex, and new settings. It was typechecked, unit-tested and built (locally and in CI), but it has **never run against your live Convex deployment or Gemini**. Until steps 1–4 are done, every agent call to Convex is refused.

**You need:** your Convex account, a Gemini API key, and the repo on your computer.

1. **Update your local copy:**
   ```bash
   git checkout main
   git pull
   npm install
   npm --prefix agents install
   ```
2. **Create one shared secret** (any long random string). This prints one:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Copy the output. In the steps below it is called `<SECRET>`.
3. **Put the secret and the Gemini key in Convex:**
   ```bash
   npx convex env set AGENT_SECRET <SECRET>
   npx convex env set GOOGLE_API_KEY <your-gemini-key>      # skip if already set
   npx convex env list                                      # check both appear
   ```
   You get a Gemini key at https://aistudio.google.com/apikey. You can also set these in the Convex dashboard under **Settings → Environment Variables**.
4. **Configure the agents.** Copy the example file and fill in three values:
   ```bash
   cp agents/.env.example agents/.env      # PowerShell: Copy-Item agents\.env.example agents\.env
   ```
   In `agents/.env`:
   ```
   CONVEX_URL=https://<your-deployment>.convex.cloud     # same as VITE_CONVEX_URL in .env.local
   GOOGLE_API_KEY=<your-gemini-key>
   AGENT_SECRET=<SECRET>                                  # exactly the same value as in step 3
   ```
5. **Push the new index and functions to Convex:**
   ```bash
   npx convex dev --once
   ```
   It should end with "Convex functions ready!". If it fails with `Missing GOOGLE_API_KEY`, do step 3 first and run it again.
6. **Start everything:**
   ```bash
   npm run dev
   ```
   You should see the Vite URL (usually http://localhost:5173), Convex syncing, and nine lines like `[agent2_analyst] Starting on port 8082`.
7. **Check the agents are up:**
   ```bash
   curl http://localhost:8082/health      # prints OK
   curl http://localhost:8088/health      # prints OK
   ```
8. **Smoke test the tutor** (sign in as a student):
   - Open a question and ask the AI for help. A Socratic question should come back, never the answer.
   - Ask again within 30 seconds. You should see "Take Ns more to think before asking again."
   - Ask 6 times within 5 minutes (waiting 30 s between asks). The 6th should say "Help limit reached (5 requests per 5 minutes)…".
9. **Smoke test the agent chain:**
   - Submit an answer, then open the assignment's **Results** page. Within about 30 s the chat panel should show Agent 2's summary, then a remediation offer. In the terminal look for `[Agent2] Success` and `[NegotiationNode]` lines.
   - Reply "yes" in the chat. Agent 3 should post practice material labelled "AI-generated, not yet reviewed by your lecturer".
   - As a lecturer, click **Generate Briefing** on the dashboard (the "AI Daily Briefing" card). A briefing should appear.
   - Check the Judge recorded the tutor's outputs (replace `<SECRET>`):
     ```bash
     curl -X POST http://localhost:8088/schedule/evaluate -H "Content-Type: application/json" -H "X-Agent-Key: <SECRET>" -d "{\"evaluation_target\":\"Agent1\",\"sample_size\":10,\"evaluation_type\":\"policy_violation\"}"
     ```
     This only shows results once Agent 1 is in use (step 10). Agents 3 and 7 also report here: use `"evaluation_target":"Agent3"` or `"Agent7"`.
10. **Optional: route the tutor through Agent 1.** Convex runs in the cloud and cannot reach `localhost`, so locally the tutor uses its direct-Gemini path. To test Agent 1, expose it with a tunnel and tell Convex where it is:
    ```bash
    npx cloudflared tunnel --url http://localhost:8081      # or: ngrok http 8081
    npx convex env set AGENT1_URL https://<the-tunnel-url>
    ```
    Ask the tutor for help again. The agents' terminal should print `[PubSub] Emitting agent_output_produced`, which means Agent 1 wrote the reply and sent it to the Judge. To switch back, remove the variable: `npx convex env remove AGENT1_URL`.
11. **Optional: the negotiation integration test**, which runs against your deployment: `npm --prefix agents run test:negotiation`.

**Done when:** steps 7–9 behave as described. If something fails, look up the message in [section F](#f-troubleshooting-error-messages-and-what-they-mean).

---

### A1. Enforce the think-first gate · *needs: about 1 hour* · **highest product priority**
**Why:** "Think first, AI next" is the core promise, but today a student can ask for help without writing anything. Every assignment already stores `minReasoningChars` (default 30); nothing checks it.

**Steps:**
1. **Add a pure rule** to `convex/domain/aiPolicy.ts`, so it can be unit-tested:
   ```ts
   export const DEFAULT_MIN_REASONING_CHARS = 30;

   /** Characters still missing before AI help is allowed (0 = allowed). */
   export function reasoningShortfall(reasoning: string | undefined, minChars: number | undefined): number {
     const required = Math.max(0, minChars ?? DEFAULT_MIN_REASONING_CHARS);
     return Math.max(0, required - (reasoning ?? "").trim().length);
   }
   ```
2. **Enforce it on the server** in `convex/ai.ts`, in **both** `sendChatMessage` and `sendImageFeedback`, right after the line `const assignmentPolicy = studentAssignments.find(...)` and its "not found" check:
   ```ts
   const missing = reasoningShortfall(attempt.studentReasoning, assignmentPolicy.minReasoningChars);
   if (missing > 0) {
     throw new Error(`Write ${missing} more characters of your own reasoning before asking CogAIt for help.`);
   }
   ```
   (Import `reasoningShortfall` from `./domain/aiPolicy`.) This works because `QuestionView` saves the draft, including the reasoning text, before it calls the action.
3. **Show it in the UI** in `src/components/QuestionView.tsx`:
   - Near the other derived values (after `assignmentMeta`, around line 92):
     ```ts
     const reasoningMissing = reasoningShortfall(studentReasoning, assignmentMeta?.minReasoningChars);
     ```
     Import it from `"../../convex/domain/aiPolicy"`.
   - Add `|| reasoningMissing > 0` to the chat Send button's `disabled={...}` (search for `disabled={isChatting || isImageSubmitting`).
   - Under the chat box, show a hint while `reasoningMissing > 0`, e.g. "Write N more characters of your reasoning to unlock help".
4. **Decide the default.** Keep 30, or use 100 as the original pitch said. To change it, replace `30` with `100` (or use `DEFAULT_MIN_REASONING_CHARS`) in:
   - `convex/assignments.ts`: the `?? 30` defaults (search `minReasoningChars`)
   - `src/components/CreateAssignment.tsx` and `src/components/CreateAIAssignment.tsx` (search `minReasoningChars: 30`)
   - `convex/agentAPI.ts` (`minReasoningChars: 30` in `createDraftAssignment`)

   Existing assignments keep their stored value, so edit them in the lecturer UI if needed.
5. **Test** in `convex/domain/aiPolicy.test.ts`: `reasoningShortfall("", 30) === 30`, `reasoningShortfall("x".repeat(30), 30) === 0`, `reasoningShortfall("  a  ", 3) === 2`.
6. **Update the docs.** In the README guardrail table and `docs/03_features.md`, change the think-first gate row to "Enforced", and remove it from section E below.

**Check:** as a student, the Send button stays disabled until you type enough reasoning. Calling the action directly (e.g. from the browser console) still returns the error.

---

### A2. Limit help-level jumps in code · *needs: about 30 minutes*
**Why:** the prompt tells the model to move one help level at a time, but the code accepts any level from 1 to 4. So the model can jump from level 1 straight to 4.

**Steps:**
1. Add to `convex/domain/aiPolicy.ts`:
   ```ts
   /** The next help level may differ from the current one by at most 1, within 1-4. */
   export function clampLevelStep(current: number, proposed: number): 1 | 2 | 3 | 4 {
     const step = Math.max(current - 1, Math.min(current + 1, Math.round(proposed)));
     return Math.max(1, Math.min(4, step)) as 1 | 2 | 3 | 4;
   }
   ```
2. In `convex/ai.ts` `sendChatMessage`, apply it in the three places `effectiveHelpLevel` is set from the model: the Agent 1 branch (`agentReply.scaffoldingDepth`), the Gemini branch (`parsed.new_level`) and the regeneration loop (`retryParsed.new_level`). Each becomes `clampLevelStep(activeHelpLevel, <value>)`.
3. Add tests: `clampLevelStep(1, 4) === 2`, `clampLevelStep(3, 1) === 2`, `clampLevelStep(4, 9) === 4`.
4. In the README "The idea" section, say the code enforces the one-level step.

---

### A3. Commit lockfiles · *needs: 10 minutes*
**Why:** `package-lock.json` is git-ignored (a template leftover), so every install can pick different dependency versions.

**Steps:**
1. In `.gitignore`, delete these two lines:
   ```
   # Ignored for the template, you probably want to remove it:
   package-lock.json
   ```
2. Generate the lockfiles and commit them:
   ```bash
   npm install
   npm --prefix agents install
   git add package-lock.json agents/package-lock.json .gitignore
   ```
3. In `.github/workflows/ci.yml`, replace both `npm install --no-audit --no-fund` with `npm ci`, and delete the comment above them.
4. In `agents/docker/*.Dockerfile`, `npm install` can become `npm ci`. Edit `agents/generate_deployment_files.mjs`, then run `node generate_deployment_files.mjs` inside `agents/`.

---

### A4. Product assets (screenshots, demo, preview image)
**Why:** the README has no screenshots, and `index.html` points to a missing `/og-preview.png`, so link previews are broken.

**Steps:**
1. Run the app (A0), sign in as a student and a lecturer, and capture: sign-in page, student question view with the help chat, integrity consent screen, results page with CIS and the topic heatmap, lecturer dashboard with the AI Daily Briefing, and the live session monitor.
2. Save them as `docs/assets/screenshots/<name>.png` (keep each under about 300 KB), and add a "Screenshots" section to the README.
3. Record a 60–90 s demo (student asks for help → gets questions, not answers → submits → lecturer sees the briefing). Upload it to YouTube or Loom and link it in the README.
4. Make a 1200×630 image, save it as `public/og-preview.png`, or delete the `og:image` line in `index.html`.
5. `public/branding/logo.png` is 636 KB. Compress it (e.g. with https://squoosh.app) or replace it with an SVG.

---

### A5. Finish the UI theme transition
**Why:** the app mixes the old dark "spatial" theme (`index.html` sets `background: #0a0a0f`, and `src/App.tsx` uses `spatial-*` classes) with a newer light theme (toasts).

**Steps:**
1. Decide on one theme.
2. **Light:** change the `body` background in `index.html`, then replace the `spatial-*` and `widget-*` classes in `src/` (search for `spatial-`) with the light styles in `src/index.css`. The abandoned light redesign is in git history under `_ui_replacement/`; see it with `git show e8d1c93:_ui_replacement/app/globals.css`.
3. **Dark:** make the toast styles dark instead (`src/App.tsx`, `<Toaster toastOptions=...>`).
4. Update the "Known limitations" line in `docs/06_roadmap.md`.

---

## B. Do when you have Google Cloud resources

### B1. Deploy the agents to Google Cloud Run · *needs: a GCP project with billing*
**Why:** the agents only run on your computer today. On Cloud Run three things break, and the steps below fix them:
- the agents' own records (JSON files in `agents/.memory`) are lost on every restart;
- events default to `localhost`;
- the browser calls `/agent2/...`-style paths that only the local Vite proxy understands.

**Steps:**
1. **Move agent memory into Convex** (code change, do it first):
   - In `convex/schema.ts` add tables, for example: `agentBriefings` (lecturerId, payload, recordedAt), `agentCohortBuffers` (batchId, reports, analyzedAtSize), `judgeVerdicts` (agent, traceId, passed, severity, violations, timestamp), `agentCisSnapshots` (studentId, cis, recordedAt).
   - In `convex/agentAPI.ts` add key-protected functions to read and write them (copy the pattern of `getStudentHistory`: `...agentKeyArg` plus `requireAgentKey(args.agentKey)`).
   - In `agents/src/memory/convex_client.ts` add wrappers. Then switch `long_term_memory.ts`, `tools/agent6_tools.ts` and `agent8_judge/index.ts` from `readJsonFile`/`writeJsonFile` to those wrappers.
2. **Let the browser reach each service.** The frontend calls `${VITE_AGENT_URL}/agent2/...`, `/agent7/...` and `/agent-negotiation/...`. Choose one:
   - **Simplest:** change the three components (`QuestionView.tsx`, `LecturerDashboard.tsx`, `RemediationConsent.tsx`/`StudentResults.tsx`) to use `VITE_AGENT2_URL`, `VITE_AGENT7_URL` and `VITE_NEGOTIATION_URL`, without the path prefix.
   - Or put a load balancer / API gateway in front that routes `/agent2/*` → Agent 2 and so on.
3. **Prepare Google Cloud** (install the gcloud CLI first: https://cloud.google.com/sdk/docs/install):
   ```bash
   gcloud auth login
   gcloud config set project <your-project-id>
   gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com
   ```
4. **Store the secrets once** in Secret Manager:
   ```bash
   printf "%s" "<SECRET>" | gcloud secrets create agent-secret --data-file=-
   printf "%s" "<your-gemini-key>" | gcloud secrets create google-api-key --data-file=-
   ```
   Give the Cloud Run service account access: in the console, **Secret Manager → each secret → Permissions → add** `<project-number>-compute@developer.gserviceaccount.com` with the role **Secret Manager Secret Accessor**.
5. **Build and deploy each service** from the `agents/` folder. There are 9 configs: agent1 … agent8 and negotiation.
   ```bash
   cd agents
   gcloud builds submit --config deploy/cloudbuild-agent1.yaml .
   gcloud builds submit --config deploy/cloudbuild-negotiation.yaml .
   # ...one command per config file in agents/deploy/
   ```
   Each prints a service URL like `https://cogait-agent1-socratic-xxxx.a.run.app`. Note them all.
6. **Configure every service** (repeat for each of the 9 service names):
   ```bash
   gcloud run services update cogait-agent2-analyst --region us-central1 \
     --set-secrets AGENT_SECRET=agent-secret:latest,GOOGLE_API_KEY=google-api-key:latest \
     --set-env-vars CONVEX_URL=https://<deployment>.convex.cloud,AGENT2_URL=<url>,AGENT3_URL=<url>,AGENT4_URL=<url>,AGENT5_URL=<url>,AGENT6_URL=<url>,AGENT7_URL=<url>,AGENT8_URL=<url>,NEGOTIATION_URL=<url>
   ```
7. **Point Convex and the frontend at them:**
   ```bash
   npx convex env set AGENT1_URL https://cogait-agent1-socratic-xxxx.a.run.app
   ```
   In Vercel (Project → Settings → Environment Variables), set `VITE_CONVEX_URL` and the agent URL variables from step 2, then redeploy.
8. **Check:** `curl https://<each-service-url>/health` prints `OK`. Then repeat the A0 smoke tests (steps 8–9) on the deployed site.
9. **Harden** (after it works):
   - Replace `AGENT_SECRET` between services with Cloud Run IAM (service accounts, ID tokens), and remove `--allow-unauthenticated` for agents the browser does not call (1, 3, 4, 5, 6, 8).
   - Optionally replace `agents/src/pubsub/index.ts` with Cloud Pub/Sub topics and push subscriptions. `TOPIC_ROUTES` already lists every topic and target.

---

### B2. Ground Agent 3 in verified content · *needs: Vertex AI Search*
**Why:** practice material is generated from the model's own knowledge, so it is capped at 0.6 confidence and always flagged for review.

**Steps:**
1. Collect content you are allowed to use (e.g. NCERT textbooks, past NTA papers; check their licences) as PDFs in a Cloud Storage bucket.
2. In the Google Cloud console, open **AI Applications (Vertex AI Search) → Data stores → Create**, choose **Cloud Storage**, and point it at the bucket. Then create a **Search app** on that data store. Note the data store ID.
3. In `agents/`: `npm install @google-cloud/discoveryengine`.
4. In `agents/src/tools/agent3_tools.ts`, add `searchSources(topic)`. It calls `SearchServiceClient.search` with your project, location and data store ID, and returns the top passages with their source titles.
5. In `agents/src/agent3_content/index.ts`, call it for each weak topic and pass the passages and titles in the prompt instead of `GROUNDING_SOURCE`. Tell the model to cite only those titles. Allow confidence above `MAX_UNGROUNDED_CONFIDENCE` only when passages were found.
6. Add a lecturer review step: store Agent 3 output in a Convex table with `status: "pending_review"`, and show it to students only after a lecturer approves it.

---

### B3. Document AI OCR for Agent 5 · *needs: a Document AI processor*
**Why:** Agent 5 turns extracted text into a draft assignment, but nothing extracts text from PDFs for it, and the UI uses the Convex generator instead.

**Steps:**
1. In the console: **Document AI → Create processor → Document OCR**. Note the processor ID and region.
2. Write the OCR call, for example in a new agent endpoint: `npm install @google-cloud/documentai`, then `DocumentProcessorServiceClient.processDocument` with the PDF bytes. Pass the returned `document.text` as `document_ai_extracted_text` to Agent 5's `/webhook/document_uploaded`, together with `lecturer_id` (the Convex user id) and `source_filename`.
3. Decide how the UI uses it: either replace the PDF path in `convex/facultyAssignments.ts`, or add a separate "Import with OCR" button in `CreateAIAssignment.tsx` that uploads the PDF to the agent.
4. **Check:** the draft appears in the lecturer dashboard as an unpublished assignment (status "review_ready").

---

## C. Evidence to collect in a pilot

These numbers make the project credible. All of them can be computed from data CogAIt already stores.

1. **Export the data:**
   ```bash
   npx convex export --path cogait-export.zip
   ```
   The zip has one JSONL file per table (load them with Python/pandas or a spreadsheet).
2. **Latency and cost:** from `aiInteractions`, report the median and 95th percentile of `responseTimeMs`, and the average `tokensUsed` per help request. Multiply by Gemini's price per token for the cost per request.
3. **Answer-leak rate:** `aiViolations` gets one row per rejected reply.
   - **First-reply leak rate:** rows with `regenerationAttempt` = 1, divided by the rows in `aiInteractions`. This is how often the model's first reply broke the rules.
   - **Fallback rate:** rows with `regenerationAttempt` = 4, divided by the rows in `aiInteractions`. This is how often all 3 regenerations failed and the fixed fallback question was served.
   - With Agent 1 in use, add the Judge's numbers from `/schedule/evaluate`.
4. **Learning effect:** the CIS distribution of the same students over several weeks (`cis_trajectory` in Agent 4 reports, or computed from `attempts`).
5. **Pilot details:** institution (or anonymised), number of students, dates, and two or three teacher quotes.
6. **Privacy note** before the pilot starts: what student data is stored, for how long, and that prompts are sent to Google Gemini. Get the institution's consent in writing.

---

## D. Planned product features

| Feature | What to do |
|---|---|
| Organisation rate limits and cost governance | The code exists behind the `orgRateLimit` / `costGovernance` flags (off). Flags live in memory (`convex/infrastructure/featureFlags.ts`), so first move per-organisation overrides into a Convex table, then switch the flags on per institution |
| Lecturer alert delivery | Agent 7's critical alerts are only logged (`agent7AlertDispatcher`). Send them by email through Resend, which `convex/notifications.ts` already uses |
| Admin / ops dashboard | Flags `adminDashboard` and `internalOpsPanels` exist; build the pages behind them |
| Multi-institution white label (B2B) | The data model is already organisation-scoped; add per-organisation branding and onboarding |
| Hindi / regional languages | Prompts and UI are English-only; translate the UI strings and add a language instruction to the prompts |
| Mobile app / offline | Not started |
| Reasoning-focused fine-tuned model | Use the exported interactions (C1) and Judge verdicts as training and evaluation data |

---

## E. Current limitations

| Area | Limitation | Fixed by |
|---|---|---|
| Think-first gate | Not enforced | A1 |
| Help levels | Level jumps are limited only by the prompt | A2 |
| Installs | No lockfiles, so versions can drift | A3 |
| Agents | Local only; memory is local JSON; events default to localhost | B1 |
| Agent 1 routing | Convex in the cloud cannot reach local agents, so locally the tutor uses direct Gemini | A0 step 10 or B1 |
| Agent 3 | Not grounded in verified sources; always needs review | B2 |
| Agent 5 | Needs text as input; not used by the UI | B3 |
| Agent 8 | Records verdicts; does not block replies (the Convex validator does) | by design |
| Gemini proxy route | Pass-through for agents; anyone with their own Gemini key can use it as a relay | restrict to `X-Agent-Key` callers |
| Tests | Unit tests cover pure logic only; no automated end-to-end test | add Playwright tests |
| Verification | PR #2 changes have not been run against a live deployment | A0 |

---

## F. Troubleshooting: error messages and what they mean

| Message (where you see it) | Meaning | Fix |
|---|---|---|
| `AGENT_SECRET is not set on this Convex deployment` (agent terminal, from Convex) | Convex has no `AGENT_SECRET` | A0 step 3 |
| `Unauthorized agent call` (agent terminal) | `AGENT_SECRET` in `agents/.env` differs from Convex | Make both values identical |
| `AGENT_SECRET is not set. Copy agents/.env.example...` (agent terminal) | `agents/.env` missing or incomplete | A0 step 4 |
| `CONVEX_URL is not set...` / `GOOGLE_API_KEY is not set...` (agent terminal) | Same | A0 step 4 |
| `Unauthorized: missing or invalid X-Agent-Key` (HTTP 401 from an agent) | A service call without the right key | Send the header `X-Agent-Key: <SECRET>` |
| `Unauthorized: sign in required` / `invalid session token` (browser console) | A browser call to an agent without a valid login | Sign in again; check `CONVEX_URL` in `agents/.env` is the same deployment the app uses |
| `Missing GOOGLE_API_KEY environment variable` (during `npx convex dev`) | Convex has no Gemini key | `npx convex env set GOOGLE_API_KEY <key>` |
| `Help limit reached (5 requests per 5 minutes)...` / `Take Ns more to think...` (student UI) | The help limit is working | Wait the stated time |
| `CogAIt needs more of your own thinking first: ...` (student UI) | Agent 1's guardrails rejected the message (too short, "just tell me", personal data, prompt injection) | Expected; the student rewrites the message |
| `[SecurityException] Guardrail service unavailable...` (agent terminal) | The guardrail LLM call failed, so the agent refuses the input (fail-closed) | Check `GOOGLE_API_KEY` and network; for local testing only, set `MOCK_LLM=true` |
| `Gemini API error: ...` (student UI) | The Gemini call failed (key, quota or model name) | Check the key and quota; check `GEMINI_MODEL` if you set it |
| `spawn ... esbuild.exe ENOENT` (`npm test` on Windows) | Folder path too long | Work from a short path such as `C:\code\CogAIt` |
