# Heatmap Specification

Version: `HEATMAP_v1`

## Objective
Provide a topic-level performance heatmap on the student results screen.

## Data Source
- Join `attempts` with `questions` by `questionId`.
- Topic keys:
  - `subject`
  - `topic`
  - `subtopic` (optional)

## Aggregation Scope
- Primary view: per-student, per-assignment.

## Metrics per topic cell
- `attemptedCount`
- `avgCis`
- `avgIndependence`
- `avgHelpRequests`
- `dependencyPercent` = percentage of attempts with `totalHelpRequests > 0`

## Color Rules
- Green: `avgCis >= 75`
- Amber: `avgCis >= 50 and < 75`
- Red: `avgCis < 50`

## API Shape

```
{
  assignmentId,
  studentId,
  cells: [
    {
      subject,
      topic,
      subtopic,
      attemptedCount,
      avgCis,
      avgIndependence,
      avgHelpRequests,
      dependencyPercent
    }
  ]
}
```

## Rendering
- Grid of topic cells with legend.
- Tooltip: counts + CIS + dependency.
- Sort by `subject`, then `topic`, then `subtopic`.
