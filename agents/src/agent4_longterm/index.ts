import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { publishEvent } from '../pubsub/index.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { buildStudentReport, latestCis } from '../lib/analytics.js';
import { convexReadHistory, saveCisSnapshot } from '../tools/agent4_tools.js';
import type { LongTermAnalystInput, LongTermAnalystOutput } from '../types/index.js';

/**
 * Agent 4: long-term student report. CIS windows, topic trends and risk flags are computed
 * from the student's real attempt history in Convex (lib/analytics.ts); the LLM only writes
 * the narrative summary.
 */
const app = createAgentApp();

const systemPrompt = `You are the long-term strategic analyst for CogAIt. You never interact with students.
You receive a student's computed performance report: CIS (Cognitive Independence Score, 0-100) per time window
(null = no attempts in that window), per-topic trends and help depth, and risk flags.
Write a 2-3 sentence narrative for the lecturer: the trajectory, the weakest topics, and any dependency risk.
Use only the numbers given. Do not invent data.
Respond with ONLY valid JSON: {"narrative_summary": "string"}`;

app.post('/task/longterm_analysis', requireAgentKey, async (c: Context) => {
  try {
    const input = await runPreExecutionHooks(await c.req.json(), 'Agent4') as LongTermAnalystInput;
    const history = await convexReadHistory(input.student_id);
    const computed = buildStudentReport(input.student_id, input.report_date, history, Date.now());

    let narrative = `${history.length} submitted attempts; latest CIS ${latestCis(computed.cis_trajectory) ?? 'n/a'}.`;
    try {
      const result = await llm().chat.completions.create({
        model: getModel(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: JSON.stringify({ ...computed, attempts: history.length }) },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      });
      const parsed = JSON.parse(result.choices[0]?.message?.content || '{}');
      if (typeof parsed.narrative_summary === 'string' && parsed.narrative_summary.trim()) {
        narrative = parsed.narrative_summary.trim();
      }
    } catch (err: any) {
      console.warn(`[Agent4] Narrative generation failed, using computed summary: ${err.message}`);
    }

    const report = await runPostExecutionHooks<LongTermAnalystOutput>(
      { ...computed, narrative_summary: narrative },
      'Agent4',
      'LongTermAnalystOutput',
    );
    const current = latestCis(report.cis_trajectory);
    if (current !== null) await saveCisSnapshot(report.student_id, current);

    // Agent 6 collects reports per assignment (cohort) and runs once enough students reported.
    await publishEvent('student_report_ready', { batch_id: input.assignment_id ?? 'unassigned', report });
    return c.json({ success: true, report });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent4_longterm', 8084);
export default app;
