# VERIFICATION — Session 1 (Phase 0)

Purpose: prove the file-safety rules were obeyed, and record two anomalies honestly.

All timestamps are local, 2026-09-30.

## 1. What I created (and nothing else)

| Time | File/folder | Bytes |
|---|---|---|
| 23:11:44 | `docs/_state/BASELINE_git_status.txt` | 2 955 |
| 23:11:44 | `docs/_state/HASHES.txt` | 3 160 |
| 23:11:45 | `docs/_state/PROGRESS.md` | 3 682 |
| 23:12:20 | `docs/_state/INTERVIEW.md` | 3 820 |
| 23:13:43 | `docs/OPEN_ITEMS.md` | 7 901 |
| 23:14:20 | `docs/_state/LEDGER.md` | 18 011 |
| 23:14:23 | `docs/_state/INVENTORY.md` | 20 537 |
| 23:15 | `docs/_state/HASHES_session1_end.txt` | 457 file fingerprints |
| 23:11:4x | `docs/_original/` — 10 copy-only files (`README.md`, `AGENTS.md`, `PROJECT_AUDIT.md`, `STRESS_TEST_SUITE.md`, `docs__CIS_SPEC.md`, `docs__HEATMAP_SPEC.md`, `docs__api-v1-migration.md`, `docs__QA_RELEASE_CHECKLIST.md`, `convex__README.md`) | — |
| 23:11:4x | `docs/assets/diagrams/`, `docs/assets/screenshots/`, `docs/proposed/` (empty folders) | — |
| — | `docs/VERIFICATION_session1.md` (this file) | — |

Commands used that can write: `New-Item`, `Copy-Item` (into `docs/` only), `Out-File` (into `docs/_state/` only), `Get-FileHash`. No `npm`, `node`, `npx convex`, `tsc`, `git add/commit/checkout/stash/clean`, no installs, no redirects onto pre-existing files.

## 2. Proof that no pre-existing file changed

1. **Working-tree state is identical.** `git status --porcelain`, with all `docs/` lines removed, compared against the recorded baseline: **92 entries identical, 0 added, 0 removed**. Untracked/tracked status outside `docs/` is unchanged (63 modified tracked files, 1 deletion `readme1.md`, 29 untracked paths).
2. **Content fingerprints.** SHA1 of the 36 files the ledger draws from, re-checked at the end of the session: **drift count = 0**.
3. **Only `docs/` is new.** `git status --porcelain | grep docs` returns exactly: `?? docs/OPEN_ITEMS.md`, `?? docs/_original/`, `?? docs/_state/` (plus `docs/assets/`, `docs/proposed/` — empty folders are invisible to git).
4. **`docs/_original/` is copy-only.** Originals remain in place: `README.md`, `AGENTS.md`, `PROJECT_AUDIT.md`, `STRESS_TEST_SUITE.md`, and the four `docs/*.md` spec files are all still present and unmodified (they are the exact same byte length as their copies).
5. **Secrets untouched.** `.env.local`, `.env.local.agents`, `agents/.env` exist and were never opened, printed, or copied. Only variable *names* from `.env.example` files and code references appear in the docs.

## 3. Anomaly A — `BASELINE_git_status.txt` was written twice

The first capture attempt failed (`docs/_state/` did not exist yet), so the baseline was re-captured after the folder was created. The surviving file contains the status as of 23:11:44 — **after** the folder creation and the `docs/_original` copies, **before** all ledger writes. Consequence: it already contains one of my own entries (`?? docs/_state/`). It is still a valid baseline for everything outside `docs/`, which is what the comparison in §2.1 uses.

## 4. Anomaly B — an external process wrote inside `agents/` during my session

The mtime scan shows writes **outside `docs/`** at:

- `23:11:25` — `agents/src/agent1_socratic/index.ts`, `agent2…agent8`, `agents/src/hooks/post_hooks.ts`, `agents/src/hooks/pre_hooks.ts`, `convex/ai.ts`, `convex/facultyAssignments.ts` (and more `convex/*` files)
- `23:12:48` — the whole of `agents/dist/**` (TypeScript build output)
- `23:02:56` — `convex/router.ts`
- `23:05:54–55` — many `.git/objects/**` files plus a new ref `.git/refs/cline/checkpoints/1790789750671_z3ggj/1`

My first write was `23:11:44`; the newest non-`docs` write is `23:12:48`.

**I did not cause any of these.** My command history in this session contains no compiler, bundler, package manager or file-writing operation outside `docs/`. There are two plausible external causes, in my order of likelihood:

1. **The user's own tooling** — an editor/IDE save pass and an agents build (`npm run build` inside `agents/`, which is what `npm run dev:agents` and `start.sh` both do) running in another terminal; the timestamps are 19–20 s before my first write and 64 s after it.
2. **Cline's checkpoint mechanism** — the `.git/refs/cline/checkpoints/…` ref and the burst of loose objects at `23:05:54–55` show snapshots being taken; if a checkpoint *restore* ran at `23:12:48`, it would rewrite files from that snapshot and could reset mtimes across `agents/`.

**Impact on the ledger:** low but not zero. `convex/ai.ts` has mtime `23:11:25`, and its SHA1 recorded at `23:11:44` still matches now — so its content was stable across that window. However, `agents/src/**` is **not** in my 36-file hash set, so a content change between my reads and the end of the session would be invisible to me. Everything in the ledger about `agents/src` is drawn from files read before `23:12:48` (routes, ports, prompts) or from the route/port scan, so it is likely correct, but it should be re-checked if `agents/src` changed after that point.

**Mitigation already in place:** `HASHES_session1_end.txt` fingerprints 457 source/config/doc files (excluding `node_modules`, `.git`, `docs/`) with mtimes, captured at `23:15`. Any later session can detect drift with one comparison.

## 5. Open questions for the user

- **Q1.** Are the `23:11:25` and `23:12:48` writes inside `agents/` (and `convex/ai.ts`) yours — e.g. your editor plus an agents build — or was another process/agent instance active in this workspace?
- **Q2.** Should I treat the modified working tree (63 modified tracked files, `readme1.md` deleted, uncommitted new features such as `studentClassroom`, `RemediationConsent`, `deepDive`, `pendingRemediations`) as the intended current product state for the documentation? Phase 1 assumes yes.
