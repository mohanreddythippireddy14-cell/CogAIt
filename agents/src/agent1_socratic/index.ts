import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { publishEvent } from '../pubsub/index.js';
import type { SocraticAgentInput, SocraticAgentOutput } from '../types/index.js';

/**
 * Agent 1: the Socratic tutor. Called by the Convex action `ai.sendChatMessage` (when the
 * deployment sets AGENT1_URL), which owns the help level, leak validation and scoring.
 */
const app = createAgentApp();

const systemPrompt = `You are the Socratic Validation Agent for CogAIt. Your singular purpose is to foster cognitive independence in JEE and NEET aspirants.

HARD RULES:
- You NEVER provide direct answers. Not partial answers. Not hints disguised as answers.
- You NEVER give a full or partial worked solution, and never confirm that an answer is correct.
- You respond with at most two short probing questions, and your reply ends with a question.
- You assess the student's reasoning depth from what they wrote, not from a preset scale.

SCAFFOLDING DEPTH (1 = least help, 4 = most help). You receive the current depth.
- 1: one open conceptual question; no method, formula or direction.
- 2: acknowledge their thinking, expose a gap through a question; do not name a formula.
- 3: you may name a relevant concept or formula, framed as a question about how to apply it.
- 4: one concrete next step or micro-hint, then ask them to take it; they still do all the work.
- If the student is stuck or frustrated: increase depth by 1 (max 4).
- If the student shows understanding: keep or decrease depth (min 1).

You MUST respond with ONLY valid JSON in this exact format:
{"socratic_question": "...", "scaffolding_depth_applied": 1, "reasoning_quality_signal": "genuine|shallow|guessing"}`;

/** Errors caused by the student's input (guardrails), reported as 422 so the caller can show them. */
function isInputRejection(message: string): boolean {
  return message.startsWith('[PreHook') || message.startsWith('[SecurityException] Input violates');
}

app.post('/invoke', requireAgentKey, async (c: Context) => {
  let input: SocraticAgentInput;
  try {
    input = (await runPreExecutionHooks(await c.req.json(), 'Agent1')) as SocraticAgentInput;
  } catch (err: any) {
    const message = String(err.message ?? err);
    if (isInputRejection(message)) {
      return c.json({ error: message.replace(/^\[[^\]]+\]\s*/, '') }, 422);
    }
    return c.json({ error: message }, message.includes('unavailable') ? 503 : 400);
  }

  try {
    const depth = Math.max(1, Math.min(4, Math.round(input.current_scaffolding_depth || 1)));
    const transcript = (input.conversation ?? [])
      .map((turn) => `Student: ${turn.student}\nTutor: ${turn.assistant}`)
      .join('\n');
    const result = await llm().chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `Problem:\n${input.problem_context || input.problem_id}\n\n` +
            (transcript ? `Conversation so far:\n${transcript}\n\n` : '') +
            `Student's latest message: "${input.student_reasoning_input}"\n` +
            `Current scaffolding depth: ${depth}`,
        },
      ],
      temperature: 0.6,
      response_format: { type: 'json_object' },
    });

    const parsed = parseJsonReply<SocraticAgentOutput>(result.choices[0]?.message?.content);
    const output = await runPostExecutionHooks<SocraticAgentOutput>(parsed, 'Agent1_Socratic', 'SocraticAgentOutput');
    output.scaffolding_depth_applied = Math.max(1, Math.min(4, Math.round(output.scaffolding_depth_applied)));
    output.tokens_used = result.usage?.total_tokens ?? 0;

    // Let the Judge (Agent 8) audit the reply asynchronously.
    await publishEvent('agent_output_produced', {
      agent: 'Agent1',
      output_text: output.socratic_question,
      context: input.problem_context?.slice(0, 2000),
      trace_id: `${input.student_id}:${input.problem_id}:${Date.now()}`,
    });

    return c.json(output);
  } catch (err: any) {
    console.error('[Agent1] Failed:', err.message);
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent1_socratic', 8081);
export default app;
