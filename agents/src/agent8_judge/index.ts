import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import type { JudgeInput, JudgeOutput } from '../types/index.js';

const app = createAgentApp();
const MODELS = [getModel()];

const systemPrompt = `You are The Judge — the automated QA system for CogAIt agents. Audit agent outputs against rubrics:
- Agent 1 (Socratic): ZERO tolerance for direct answers. Must end with question.
- Agent 2 (Analyst): Integrity score 0-100. Valid topic classifications.
- Agent 3 (Content): Exactly 2 hinge questions. PYQ reference required.
- Agent 7 (Recommendation): Specific and actionable, not generic.
Flag policy violations with severity (warning/critical).

Respond with ONLY valid JSON: {"evaluation_id":"string","timestamp":"ISO","agent_evaluated":"string","policy_violations_detected":0,"schema_failures_detected":0,"latency_anomaly":false,"error_rate_anomaly":false,"alert_fired":false,"evaluation_details":[{"check_name":"string","passed":true,"details":"string"}]}`;

app.post('/schedule/evaluate', requireAgentKey, async (c: Context) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent8') as JudgeInput;
    let lastErr: any;
    for (const model of MODELS) {
      try {
        console.log(`[Agent8] Trying ${model} to evaluate ${input.evaluation_target}`);
        const result = await llm().chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Evaluate agent: ${input.evaluation_target}\nSample size: ${input.sample_size}\nEval type: ${input.evaluation_type}` }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        });
        let out = parseJsonReply(result.choices[0]?.message?.content) as JudgeOutput;
        out = await runPostExecutionHooks<JudgeOutput>(out, 'Agent8', 'JudgeOutput');
        console.log(`[Agent8] Evaluation complete: ${out.policy_violations_detected} violations, alert=${out.alert_fired}`);
        return c.json({ success: true, evaluation: out });
      } catch (e: any) { lastErr = e; console.warn(`[Agent8] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent8_judge', 8088);
export default app;
