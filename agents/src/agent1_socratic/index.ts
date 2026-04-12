import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import Groq from 'groq-sdk';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { reasoningValidator, levelTracker, sessionState } from '../tools/agent1_tools.js';
import type { SocraticAgentInput, SocraticAgentOutput } from '../types/index.js';

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

const systemPrompt = `You are the Socratic Validation Agent for CogAIt. Your singular purpose is to foster cognitive independence in JEE and NEET aspirants.

HARD RULES:
- You NEVER provide direct answers. Not partial answers. Not hints disguised as answers.
- You respond ONLY with a single probing question.
- You assess the student's reasoning depth and current abstraction level.
- If the student is stuck: step DOWN one abstraction level with your question.
- If the student demonstrates understanding: step UP one abstraction level.
- You determine abstraction level dynamically from the student's response quality.
  There are no fixed levels. You judge depth from content, not from a preset scale.
- You reward reasoning process. You never reward correct answers directly.

You MUST respond with ONLY valid JSON in this exact format:
{"socratic_question": "...", "scaffolding_depth_applied": 1, "reasoning_quality_signal": "genuine|shallow|guessing"}`;

async function callWithFallback(input: SocraticAgentInput): Promise<SocraticAgentOutput> {
  let lastError: any;
  for (const model of MODELS) {
    try {
      console.log(`[Agent1] Trying model: ${model}`);
      const result = await groq.chat.completions.create({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Problem Context: ${input.problem_id}\nStudent Reasoning: "${input.student_reasoning_input}"\nCurrent Scaffolding Depth: ${input.current_scaffolding_depth}` }
        ],
        temperature: 0.6,
        response_format: { type: 'json_object' }
      });
      console.log(`[Agent1] Success with model: ${model}`);
      return JSON.parse(result.choices[0]?.message?.content || '{}') as SocraticAgentOutput;
    } catch (err: any) {
      console.warn(`[Agent1] Model ${model} failed: ${err.message?.slice(0, 100)}`);
      lastError = err;
    }
  }
  throw lastError;
}

app.post('/invoke', async (c) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent1') as SocraticAgentInput;
    
    // Tools logic (Simulated execution)
    const context = await sessionState(input.problem_id, input.student_id);
    const hasReasoning = reasoningValidator(input.student_reasoning_input);
    const depth = await levelTracker.read(input.student_id);
    
    const parsedOutput = await callWithFallback({...input, current_scaffolding_depth: depth});
    const finalOutput = await runPostExecutionHooks<SocraticAgentOutput>(parsedOutput, 'Agent1_Socratic', 'SocraticAgentOutput');
    
    // Persist new depth
    await levelTracker.write(input.student_id, finalOutput.scaffolding_depth_applied);

    return c.json(finalOutput);
  } catch (err: any) {
    console.error('[Agent1] All models failed:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8081;
console.log(`[agent1_socratic] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
