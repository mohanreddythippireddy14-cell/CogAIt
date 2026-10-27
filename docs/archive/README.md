# Archive

Working notes from earlier documentation and audit passes, kept for history. **They are not current documentation.** Several claims in them were later found to be wrong. The current state is described in the root `README.md` and `FUTURE_ACTIONS.md`.

| Path | What it is |
|---|---|
| `_state/` | Ledger, inventory, interviews and progress logs from the AI-assisted documentation pass (Sept–Oct 2026) |
| `_original/` | Byte copies of the root docs taken before that pass |
| `PROJECT_AUDIT.md` | Pre-push audit. Stale: it says there is no test framework, and it describes the agent layer as fully working |
| `STRESS_TEST_SUITE.md` | 30 planned edge-case scenarios (a design list, not executed results) |
| `VERIFICATION_final.md`, `VERIFICATION_session1.md` | Doc verification notes. `VERIFICATION_final.md` wrongly marks the 100-character think-first gate and the "gemini-2.5-flash via Groq" claim as verified |
| `README_NEW.md` | Draft README from the documentation pass |

Corrections made in the October 2026 cleanup (see `FUTURE_ACTIONS.md`):
- The think-first gate is **not enforced** in code yet. `minReasoningChars` (default 30) is stored per assignment but never checked.
- The "5 requests / 5 minutes" help limit was a no-op. It is now enforced in `convex/application/aiService.ts`.
- The agent layer had stubbed tools and two broken hand-offs. These are now fixed or labelled.
