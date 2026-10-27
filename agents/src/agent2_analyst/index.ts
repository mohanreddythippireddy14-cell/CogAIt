import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKeyOrUser } from '../middleware/auth.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { publishEvent } from '../pubsub/index.js';
import { convexWrite } from '../tools/agent2_tools.js';
import type { AssignmentAnalystInput, AssignmentAnalystOutput } from '../types/index.js';

const app = createAgentApp();
const MODELS = [getModel()];

const systemPrompt = `You are the session intelligence recorder for CogAIt. You receive the complete interaction log of a student's assignment session. Convert raw interaction data into structured learning signals.
For each topic: identify max scaffolding depth, classify as strong/developing/weak, extract proctoring signals.

You MUST respond with ONLY valid JSON in this exact format:
{"student_id":"string","assignment_id":"string","topic_performance":[{"topic_name":"string","max_scaffold_depth":1,"classification":"strong|developing|weak"}],"weak_topics":["string"],"strong_topics":["string"],"remediation_recommended":true,"session_integrity_score":0.8,"time_available_for_remediation":false}`;

app.post('/webhook/session_ended', requireAgentKeyOrUser, async (c: Context) => {
  try {
    const rawInput = await c.req.json();
    // A browser caller may only submit its own session.
    if (!c.get('callerIsService')) rawInput.student_id = c.get('callerUserId');
    const input = await runPreExecutionHooks(rawInput, 'Agent2') as AssignmentAnalystInput;
    let lastErr: any;
    for (const model of MODELS) {
      try {
        console.log(`[Agent2] Trying ${model}`);
        const result = await llm().chat.completions.create({
          model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Session Log: ${JSON.stringify(input.session_log)}\nProctoring Signals: ${JSON.stringify(input.proctoring_signals)}` }
          ],
          temperature: 0.2,
          response_format: { type: 'json_object' }
        });
        let parsedOutput = parseJsonReply(result.choices[0]?.message?.content) as AssignmentAnalystOutput;
        parsedOutput.student_id = input.student_id;
        parsedOutput.assignment_id = input.assignment_id;
        parsedOutput = await runPostExecutionHooks<AssignmentAnalystOutput>(parsedOutput, 'Agent2', 'AssignmentAnalystOutput');
        await convexWrite(parsedOutput.student_id, parsedOutput);
        console.log(`[Agent2] Success with ${model}`);

        // --- NEW: Generate a conversational summary and push to unified chat ---
        try {
          const { getOrCreateConversation, appendAgentMessage } = await import('../memory/convex_client.js');
          const rawSummaryResult = await llm().chat.completions.create({
            model,
            messages: [
              { role: 'system', content: "You are the Analyst Agent. Write a friendly, 2-sentence conversational summary of the student's performance directly addressing them. Do not use markdown formatting. Be encouraging." },
              { role: 'user', content: `Performance JSON: ${JSON.stringify(parsedOutput)}` }
            ],
            temperature: 0.5,
          });
          const summaryTextRaw = rawSummaryResult.choices[0]?.message?.content || "Your performance analysis is complete. Let's review.";
          
          const summaryText = await runPostExecutionHooks<string>(summaryTextRaw, 'Agent2Summary');

          
          const conversationId = await getOrCreateConversation(parsedOutput.student_id, parsedOutput.assignment_id);
          // Set status to negotiating so the Negotiation Node can take over next
          await appendAgentMessage(conversationId, summaryText, "negotiating");
          console.log(`[Agent2] Appended conversational summary to chat`);
        } catch (e: any) {
          console.error(`[Agent2] Failed to push conversational summary: ${e.message}`);
        }
        // ----------------------------------------------------------------------

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

startAgentServer(app, 'agent2_analyst', 8082);
export default app;
