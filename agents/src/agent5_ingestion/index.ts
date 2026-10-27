import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { documentAiOutputParser, jsonFormatter, convexWriteAssignment } from '../tools/agent5_tools.js';
import type { AssignmentCreatorInput, AssignmentCreatorOutput } from '../types/index.js';

/**
 * Agent 5: turns OCR/extracted text of a lecturer's document into CogAIt questions and
 * stores them as an unpublished draft assignment in Convex for the lecturer to review.
 * The text must already be extracted (Document AI integration is listed in FUTURE_ACTIONS.md).
 */
const app = createAgentApp();

const systemPrompt = `You are the onboarding specialist for CogAIt. You receive text extracted from a lecturer's document. Your job is flawless conversion of lecturer content into CogAIt-compatible structured questions.

You map every question to a topic and to one subject: Physics, Chemistry or Math. You never guess topic mapping — if confidence is below threshold, put the item in unmapped_items for manual lecturer review.
Your output must be valid JSON matching the schema exactly.

CRITICAL MATHEMATICAL FORMATTING RULES:
1. Format all mathematical equations, variables, and units using standard LaTeX notation.
2. Use inline math delimiters $...$ STRICTLY for math ONLY. DO NOT wrap normal English text inside $ delimiters.
3. BAD: $at 2 m/s^{2} for 10$ seconds.
4. GOOD: at $2 \\text{ m/s}^2$ for $10$ seconds.
5. Use proper integration symbols (\\int), fractions (\\frac), and exponents.

You MUST respond with ONLY valid JSON in this exact format:
{"assignment_id":"string","lecturer_id":"string","questions":[{"text":"string","options":["string"],"correct_answer":"string","mapped_topic":"string","subject":"Physics|Chemistry|Math"}],"unmapped_items":[{"raw_text":"string","reason":"string"}],"mapping_confidence_avg":0.9}`;

app.post('/webhook/document_uploaded', requireAgentKey, async (c: Context) => {
  try {
    const input = await runPreExecutionHooks(await c.req.json(), 'Agent5') as AssignmentCreatorInput;
    const parsedText = documentAiOutputParser(input.document_ai_extracted_text);

    const result = await llm().chat.completions.create({
      model: getModel(),
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Document content:\n${parsedText}\nExtract and map all questions.` },
      ],
      temperature: 0.2,
      response_format: { type: 'json_object' },
    });

    let out = jsonFormatter(parseJsonReply(result.choices[0]?.message?.content));
    out.lecturer_id = input.lecturer_id;
    out = await runPostExecutionHooks<AssignmentCreatorOutput>(out, 'Agent5', 'AssignmentCreatorOutput');

    if (out.questions.length === 0) {
      return c.json({ success: false, error: 'No questions could be extracted.', assignment: out }, 422);
    }
    // The Convex id of the stored draft replaces the model's placeholder id.
    out.assignment_id = await convexWriteAssignment(input, out);

    console.log(`[Agent5] Stored draft ${out.assignment_id} with ${out.questions.length} questions`);
    return c.json({ success: true, assignment: out });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent5_ingestion', 8085);
export default app;
