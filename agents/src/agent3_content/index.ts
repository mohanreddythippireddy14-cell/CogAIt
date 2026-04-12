import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Groq from 'groq-sdk';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { vertexSearchAllen, vertexSearchNTA, contentCache, contentValidator } from '../tools/agent3_tools.js';
import type { ContentAgentInput, ContentAgentOutput } from '../types/index.js';

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

const systemPrompt = `You are the curriculum builder for CogAIt. You are paranoid about academic accuracy.
You only trust verified sources. You never fetch from unverified domains.
You build two-phase micro-assignments: exploration first, timed practice second.

HARD RULES:
- Only query whitelisted Vertex AI datastores. Never open internet.
- Validate every fetched item for relevance before including it.
- Structure Phase 1 with no hard time limit but with soft pace warnings.
- Structure Phase 2 with per-question time limits benchmarked to JEE/NEET pacing.
- If confidence in fetched content is below threshold: flag for human review, do not deliver.

You MUST respond with ONLY valid JSON in this exact format:
{"student_id":"str","assignment":{"phase_1":{"title":"str","theory_sections":[{"heading":"str","content":"str"}],"pace_warning_threshold_minutes":10},"phase_2":{"questions":[{"question_text":"str","time_limit_seconds":60}],"total_time_minutes":10}},"content_confidence_score":0.9,"human_review_required":false}`;

app.post('/webhook/remediation_requested', async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent3') as ContentAgentInput;
    let lastErr: any;
    for (const model of MODELS) {
      try {
        console.log(`[Agent3] Trying ${model}`);
        
        let fetchedSources = "";
        for (const topic of input.weak_topics) {
          let cached = await contentCache.read(topic);
          if (!cached) {
            const ntaData = await vertexSearchNTA(topic);
            const allenData = await vertexSearchAllen(topic);
            cached = JSON.stringify({ nta: ntaData, allen: allenData });
            await contentCache.write(topic, cached);
          }
          const relevance = await contentValidator(cached, topic);
          if (relevance > 0.8) {
             fetchedSources += `\nTopic: ${topic} Source Data: ${cached}`;
          }
        }
        
        const result = await groq.chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Weak Topics: ${input.weak_topics.join(', ')}\nTime Available: ${input.time_available_minutes}m\nFetched Data Context: ${fetchedSources}` }
          ],
          temperature: 0.4,
          response_format: { type: 'json_object' }
        });
        let out = JSON.parse(result.choices[0]?.message?.content || '{}') as ContentAgentOutput;
        out.student_id = input.student_id; // enforce id transfer
        out = await runPostExecutionHooks<ContentAgentOutput>(out, 'Agent3', 'ContentAgentOutput');
        console.log(`[Agent3] Success with ${model}`);
        return c.json({ success: true, remediation_plan: out });
      } catch (e: any) { lastErr = e; console.warn(`[Agent3] ${model} failed: ${e.message?.slice(0,80)}`); }
    }
    throw lastErr;
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8083;
console.log(`[agent3_content] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
