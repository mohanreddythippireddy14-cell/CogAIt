# CIS Specification

Version: `CIS_v1`

## Purpose
Define one canonical Cognitive Independence Score (CIS) formula used in results and analytics.

## Per-question CIS

```
base = 100
helpLevelPenalty = maxHelpLevelUsed * 15
helpCountPenalty = totalHelpRequests * 5
reasoningBonus = reasoningCharsBeforeFirstHelp > 50 ? 10 : 0

cis = clamp(base - helpLevelPenalty - helpCountPenalty + reasoningBonus, 0, 100)
```

Rules:
- `maxHelpLevelUsed` is `0` if no help was used.
- `reasoningCharsBeforeFirstHelp` uses `reasoningCharCountBeforeFirstHelp`; if absent, use current reasoning length.
- Clamp output to `[0, 100]`.

## Assignment CIS
- `overallCis = round(mean(perQuestionCis for submitted/attempted questions))`
- If no attempted questions, `overallCis = 0`.

## Ownership
- CIS is computed server-side only.
- UI renders values returned by backend, never re-implements formula.
