import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { requireAgentKey } from '../middleware/auth.js';
import { publishEvent } from '../pubsub/index.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { validateSchema } from '../guardrails/schema_validator.js';
import { aggregateCohort, MIN_COHORT_SIZE } from '../lib/analytics.js';
import { bufferStudentReport, convexWriteCohort, lecturerForBatch } from '../tools/agent6_tools.js';
import type { CohortAnalystInput, CohortAnalystOutput, LongTermAnalystOutput } from '../types/index.js';

/**
 * Agent 6: cohort analyst. Deterministic aggregation of Agent 4's student reports
 * (lib/analytics.ts aggregateCohort); it never writes recommendations (that is Agent 7).
 */
const app = createAgentApp();

async function analyzeAndForward(input: CohortAnalystInput, lecturerId: string | null): Promise<CohortAnalystOutput> {
  const cohort = await runPostExecutionHooks<CohortAnalystOutput>(
    aggregateCohort(input.batch_id, input.report_date, input.student_reports),
    'Agent6',
    'CohortAnalystOutput',
  );
  if (lecturerId) {
    await convexWriteCohort(cohort.batch_id, cohort, lecturerId);
    await publishEvent('cohort_intelligence_ready', {
      lecturer_id: lecturerId,
      cohort_intelligence: cohort,
      report_date: cohort.report_date,
    });
  } else {
    console.warn(`[Agent6] No lecturer for batch ${input.batch_id}; cohort report not forwarded to Agent 7.`);
  }
  return cohort;
}

// Event from Agent 4: one student report at a time, collected per batch (assignment).
app.post('/webhook/student_report_ready', requireAgentKey, async (c: Context) => {
  try {
    const body = await c.req.json();
    const batchId = String(body.batch_id ?? 'unassigned');
    const report = validateSchema<LongTermAnalystOutput>(body.report, 'LongTermAnalystOutput');
    const due = await bufferStudentReport(batchId, report);
    if (!due) return c.json({ success: true, buffered: true });

    const cohort = await analyzeAndForward(
      { batch_id: batchId, report_date: new Date().toISOString().slice(0, 10), student_reports: due },
      await lecturerForBatch(batchId),
    );
    return c.json({ success: true, cohort_report: cohort });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

// Direct call with a full batch (e.g. a scheduled job).
app.post('/workflow/cohort_analysis', requireAgentKey, async (c: Context) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent6') as CohortAnalystInput;
    if (input.student_reports.length < MIN_COHORT_SIZE) {
      return c.json({ error: `Minimum batch size of ${MIN_COHORT_SIZE} required before generating cohort report.` }, 400);
    }
    const lecturerId = typeof rawInput.lecturer_id === 'string' ? rawInput.lecturer_id : await lecturerForBatch(input.batch_id);
    return c.json({ success: true, cohort_report: await analyzeAndForward(input, lecturerId) });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent6_cohort', 8086);
export default app;
