import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Groq from 'groq-sdk';
import type { JudgeInput, JudgeOutput } from '../types/index.js';

const app = new Hono();
const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
const MODELS = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'];

app.use('*', async (c, next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('OK');
  await next();
});

const systemPrompt = `You are The Judge — the automated QA system for CogAIt agents. Audit agent outputs against rubrics:
- Agent 1 (Socratic): ZERO tolerance for direct answers. Must end with question.
- Agent 2 (Analyst): Integrity score 0-100. Valid topic classifications.
- Agent 3 (Content): Exactly 2 hinge questions. PYQ reference required.
- Agent 7 (Recommendation): Specific and actionable, not generic.
Flag policy violations with severity (warning/critical).

Respond with ONLY valid JSON: {"evaluation_id":"string","timestamp":"ISO","agent_evaluated":"string","policy_violations_detected":0,"schema_failures_detected":0,"latency_anomaly":false,"error_rate_anomaly":false,"alert_fired":false,"evaluation_details":[{"check_name":"string","passed":true,"details":"string"}]}`;

app.post('/schedule/evaluate', async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = rawInput as JudgeInput;
    let lastErr: any;
    for (const model of MODELS) {
      try {
        console.log(`[Agent8] Trying ${model} to evaluate ${input.evaluation_target}`);
        const result = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Evaluate agent: ${input.evaluation_target}\nSample size: ${input.sample_size}\nEval type: ${input.evaluation_type}` }
          ],
          temperature: 0.1,
          response_format: { type: 'json_object' }
        });
        const out = JSON.parse(result.choices[0]?.message?.content || '{}') as JudgeOutput;
        console.log(`[Agent8] Evaluation complete: ${out.policy_violations_detected} violations, alert=${out.alert_fired}`);
        return c.json({ success: true, evaluation: out });
      } catch (e: any) { lastErr = e; console.warn(`[Agent8] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8088;
console.log(`[agent8_judge] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
