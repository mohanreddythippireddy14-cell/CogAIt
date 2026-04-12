import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Groq from 'groq-sdk';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { publishEvent } from '../pubsub/index.js';
import type { AssignmentAnalystInput, AssignmentAnalystOutput } from '../types/index.js';

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

const systemPrompt = `You are the session intelligence recorder for CogAIt. You receive the complete interaction log of a student's assignment session. Convert raw interaction data into structured learning signals.
For each topic: identify max scaffolding depth, classify as strong/developing/weak, extract proctoring signals.

You MUST respond with ONLY valid JSON in this exact format:
{"student_id":"string","assignment_id":"string","topic_performance":[{"topic_name":"string","max_scaffold_depth":1,"classification":"strong|developing|weak"}],"weak_topics":["string"],"strong_topics":["string"],"remediation_recommended":true,"session_integrity_score":0.8,"time_available_for_remediation":false}`;

app.post('/webhook/session_ended', async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent2') as AssignmentAnalystInput;
    let lastErr: any;
    for (const model of MODELS) {
      try {
        console.log(`[Agent2] Trying ${model}`);
        const result = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Session Log: ${JSON.stringify(input.session_log)}\nProctoring Signals: ${JSON.stringify(input.proctoring_signals)}` }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });
        const parsedOutput = JSON.parse(result.choices[0]?.message?.content || '{}') as AssignmentAnalystOutput;
        console.log(`[Agent2] Success with ${model}`);
        await publishEvent('weak_topics_identified', { ...parsedOutput, remediation_preference: 'pyqs' });
        await publishEvent('session_record_written', { student_id: parsedOutput.student_id, report_date: new Date().toISOString() });
        return c.json({ success: true, logged: parsedOutput });
      } catch (e: any) { lastErr = e; console.warn(`[Agent2] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8082;
console.log(`[agent2_analyst] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
