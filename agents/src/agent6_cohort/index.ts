import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Groq from 'groq-sdk';
import { publishEvent } from '../pubsub/index.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { bigqueryCohortQuery, reportAggregator, riskDetector, convexWriteCohort } from '../tools/agent6_tools.js';
import type { CohortAnalystInput, CohortAnalystOutput } from '../types/index.js';

const app = new Hono();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY, baseURL: process.env.CONVEX_URL?.replace(".cloud", ".site") + "/api/gemini-proxy/" || "https://dynamic-alpaca-596.convex.site/api/gemini-proxy/" });
const MODELS = [(process.env.GEMINI_MODEL || 'gemini-3.8-flash')];

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('OK');
  await next();
});

const systemPrompt = `You are the batch-level intelligence analyst for CogAIt. You receive individual student reports from Agent 4 for an entire batch.

Aggregate these into cohort-level patterns:
- Identify topics failing across > 40% of students
- Identify students with CIS declining > 5% week-on-week
- Detect class-wide AI dependency patterns
- Flag students at risk of disengagement

You forward structured cohort intelligence to Agent 7. You never generate recommendations yourself — that is Agent 7's responsibility.

You MUST respond with ONLY valid JSON in this exact format:
{"batch_id":"string","report_date":"string","failing_topics":[{"topic":"string","failure_rate_pct":50,"avg_scaffold_depth":2}],"at_risk_students":[{"student_id":"string","reason":"string"}],"ai_dependency_students":["string"],"cohort_cis_avg":75.0,"cohort_cis_trend":"improving|stable|declining"}`;

app.post('/workflow/cohort_analysis', async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent6') as CohortAnalystInput;
    let lastErr: any;

    if (input.student_reports.length < 5) {
      return c.json({ error: "Minimum batch size of 5 required before generating cohort report." }, 400);
    }

    const bqData = await bigqueryCohortQuery(input.batch_id);
    const aggregated = reportAggregator(input.student_reports);
    const risks = riskDetector(input.student_reports);

    for (const model of MODELS) {
      try {
        console.log(`[Agent6] Trying ${model}`);
        const result = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Batch: ${input.batch_id}\nReport Date: ${input.report_date}\nAggregated Student Reports: ${JSON.stringify(aggregated || [])}` }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });

        let out = JSON.parse(result.choices[0]?.message?.content || '{}') as CohortAnalystOutput;
        out.batch_id = input.batch_id;
        out.report_date = input.report_date;
        out = await runPostExecutionHooks<CohortAnalystOutput>(out, 'Agent6', 'CohortAnalystOutput');
        
        const actualLecturerId = (input as any).lecturer_id || 'default_lecturer';
        await convexWriteCohort(out.batch_id, out, actualLecturerId);
        console.log(`[Agent6] Success with ${model}`);
        await publishEvent('cohort_intelligence_ready', { lecturer_id: actualLecturerId, cohort_intelligence: out, report_date: out.report_date });
        return c.json({ success: true, cohort_report: out });
      } catch (e: any) { lastErr = e; console.warn(`[Agent6] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8086;
console.log(`[agent6_cohort] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
