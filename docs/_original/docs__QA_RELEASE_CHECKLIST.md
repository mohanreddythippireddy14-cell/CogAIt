# Release QA Checklist

## Core student flow
- Run a full 5-question assignment attempt with a test student account.
- Verify draft save survives refresh and question navigation.
- Verify final submission redirects to results.

## CIS and results consistency
- Confirm per-question CIS and overall CIS are visible on results page.
- Confirm lecturer-side analytics/overview CIS is non-zero after submitted attempts.
- Confirm CIS values are backend-driven (no client-side mismatch).

## Integrity flow
- Accept consent screen before assessment starts.
- Trigger tab-switch violations and verify violation count increments.
- Verify auto-submit triggers when threshold is reached.
- Verify current draft is saved before auto-submit navigation.

## LaTeX/math rendering
- Spot-check at least 10 expressions across question text and AI responses:
  - inline `$...$`
  - block `$$...$$`
  - legacy malformed wrappers normalized by migration

## Responsive and empty states
- Check desktop and mobile layouts for `QuestionView` and `StudentResults`.
- Validate empty states: no assignments, no results, no interactions.

## Command checks
- `npx tsc -p . --noEmit`
- `npx tsc -p convex --noEmit`
- `npx convex dev --once` (requires reachable Convex backend/network)
