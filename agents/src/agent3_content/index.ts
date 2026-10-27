import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { publishEvent } from '../pubsub/index.js';
import { GROUNDING_SOURCE, MAX_UNGROUNDED_CONFIDENCE } from '../tools/agent3_tools.js';
import type { ContentAgentInput, ContentAgentOutput } from '../types/index.js';

/**
 * Agent 3: builds a two-phase remediation set for the student's weak topics.
 * No verified source datastore (e.g. Vertex AI Search over NTA papers) is connected yet, so
 * content comes from the model alone and is always flagged for human review.
 */
const app = createAgentApp();

const systemPrompt = `You are the curriculum builder for CogAIt. You are paranoid about academic accuracy.
You build two-phase micro-assignments: exploration first, timed practice second.

HARD RULES:
- You have NO access to verified source material. Write from your own knowledge, keep claims standard
  and conservative, and never invent citations, exam years or "previous year question" labels.
- Structure Phase 1 with no hard time limit but with soft pace warnings.
- Structure Phase 2 with per-question time limits benchmarked to JEE/NEET pacing.
- Never include answers or worked solutions to the practice questions.

CRITICAL MATHEMATICAL FORMATTING RULES:
1. Format all mathematical equations, variables, and units using standard LaTeX notation.
2. Use inline math delimiters $...$ STRICTLY for math ONLY. DO NOT wrap normal English text inside $ delimiters.
3. BAD: $at 2 m/s^{2} for 10$ seconds.
4. GOOD: at $2 \\text{ m/s}^2$ for $10$ seconds.
5. Use proper integration symbols (\\int), fractions (\\frac), and exponents.

You MUST respond with ONLY valid JSON in this exact format:
{"student_id":"str","assignment":{"phase_1":{"title":"str","theory_sections":[{"heading":"str","content":"str"}],"pace_warning_threshold_minutes":10},"phase_2":{"questions":[{"question_text":"str","time_limit_seconds":60}],"total_time_minutes":10}},"content_confidence_score":0.5,"human_review_required":true}`;

app.post('/webhook/remediation_requested', requireAgentKey, async (c: Context) => {
  try {
    const input = await runPreExecutionHooks(await c.req.json(), 'Agent3') as ContentAgentInput;

    const result = await llm().chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        {
          role: 'user',
          content:
            `Weak Topics: ${input.weak_topics.join(', ')}\n` +
            `Preference: ${input.remediation_preference}\n` +
            `Time Available: ${input.time_available_minutes}m\n` +
            `Source material: ${GROUNDING_SOURCE}`,
        },
      ],
      temperature: 0.4,
      response_format: { type: 'json_object' },
    });
    let out = parseJsonReply<ContentAgentOutput>(result.choices[0]?.message?.content);
    out.student_id = input.student_id; // enforce id transfer
    // Ungrounded content is never trusted blindly, whatever the model claims.
    out.content_confidence_score = Math.min(Number(out.content_confidence_score) || 0, MAX_UNGROUNDED_CONFIDENCE);
    out.human_review_required = true;
    out = await runPostExecutionHooks<ContentAgentOutput>(out, 'Agent3', 'ContentAgentOutput');

    await publishEvent('agent_output_produced', {
      agent: 'Agent3',
      output_text: out.assignment.phase_1.theory_sections.map((ts) => ts.content).join('\n'),
      context: input.weak_topics.join(', '),
      trace_id: `${input.student_id}:agent3:${Date.now()}`,
    });

    if (input.conversation_id) {
      try {
        const { appendAgentMessage } = await import('../memory/convex_client.js');
        const markdownMsg =
          `Here is your practice material (AI-generated, not yet reviewed by your lecturer):\n\n**${out.assignment.phase_1.title}**\n\n` +
          out.assignment.phase_1.theory_sections.map((ts) => `### ${ts.heading}\n${ts.content}`).join('\n\n') +
          `\n\n---\n\n**Practice Questions**\n` +
          out.assignment.phase_2.questions
            .map((q, i) => `${i + 1}. ${q.question_text} (Time limit: ${q.time_limit_seconds}s)`)
            .join('\n');
        await appendAgentMessage(input.conversation_id, markdownMsg, 'closed');
      } catch (e: any) {
        console.error(`[Agent3] Failed to append message: ${e.message}`);
      }
    }

    return c.json({ success: true, remediation_plan: out });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent3_content', 8083);
export default app;
