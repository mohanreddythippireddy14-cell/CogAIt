fetch('http://localhost:8087/workflow/recommendation_generation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    "lecturer_id": "lecturer-123",
    "report_date": "2026-10-01",
    "cohort_intelligence": {
      "batch_id": "batch-1",
      "report_date": "2026-10-01",
      "failing_topics": [{"topic":"Arrays", "failure_rate_pct":60, "avg_scaffold_depth":2}],
      "at_risk_students": [{"student_id":"s1", "reason":"Low score"}],
      "ai_dependency_students": ["s2"],
      "cohort_cis_avg": 0.5,
      "cohort_cis_trend": "declining"
    }
  })
}).then(async r => {
  console.log("Status:", r.status);
  console.log("Body:", await r.text());
}).catch(e => console.error(e));
