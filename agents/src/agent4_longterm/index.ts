import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { publishEvent } from '../pubsub/index.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { convexReadHistory, bigqueryQuery, cisCalculator, vectorSearchRead, convexWriteCis } from '../tools/agent4_tools.js';
import type { LongTermAnalystInput, LongTermAnalystOutput } from '../types/index.js';

const app = createAgentApp();
const MODELS = [getModel()];

const systemPrompt = `You are the long-term strategic analyst for CogAIt. You never interact with students.
You analyze the complete performance history of a student across four time windows:
1 week, 1 month, 3 months, 1 year.

For each window, identify:
- CIS (Cognitive Independence Score) trajectory
- Topic-level trend: improving, plateauing, or declining
- Scaffolding dependency patterns
- Engagement consistency signals

You produce individual student reports consumed by Agent 6.

You MUST respond with ONLY valid JSON in this exact format:
{"student_id":"str","report_date":"str","cis_trajectory":{"week_1":0,"month_1":0,"month_3":0,"year_1":0},"topic_trends":[{"topic":"str","trend":"improving|stable|declining","avg_scaffold_depth":0,"sessions_count":0}],"at_risk":false,"ai_dependency_flag":false,"narrative_summary":"str"}`;

app.post('/task/longterm_analysis', requireAgentKey, async (c: Context) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent4') as LongTermAnalystInput;
    let lastErr: any;
    
    // Tools logic (Simulated Execution)
    const history = await convexReadHistory(input.student_id);
    const analyticsTrend = await bigqueryQuery(`SELECT * FROM trends WHERE user='${input.student_id}'`);
    const cisBase = cisCalculator(history);
    const vectorPatterns = await vectorSearchRead(input.student_id);

    for (const model of MODELS) {
      try {
        console.log(`[Agent4] Trying ${model}`);
        const result = await llm().chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Student ID: ${input.student_id}\nReport Date: ${input.report_date}\nHistory DB: [${history.length} items]\nCalculated Base CIS: ${cisBase}` }
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' }
        });
        let out = parseJsonReply(result.choices[0]?.message?.content) as LongTermAnalystOutput;
        out.student_id = input.student_id;
        out.report_date = input.report_date;
        out = await runPostExecutionHooks<LongTermAnalystOutput>(out, 'Agent4', 'LongTermAnalystOutput');
        
        console.log(`[Agent4] Success with ${model}`);
        await convexWriteCis(out.student_id, out.cis_trajectory.week_1);
        await publishEvent('student_report_ready', out);
        return c.json({ success: true, report: out });
      } catch (e: any) { lastErr = e; console.warn(`[Agent4] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent4_longterm', 8084);
export default app;
