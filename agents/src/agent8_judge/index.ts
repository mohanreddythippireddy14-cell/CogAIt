import type { Context } from 'hono';
import { createAgentApp, startAgentServer } from '../lib/server.js';
import { getModel, llm, parseJsonReply } from '../lib/llm.js';
import { requireAgentKey } from '../middleware/auth.js';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { buildVerdict, summarizeVerdicts, type Verdict } from '../lib/judge.js';
import { buildMemoryPath, readJsonFile, writeJsonFile } from '../memory/file_store.js';
import type { JudgeInput, JudgeOutput } from '../types/index.js';

/**
 * Agent 8: the Judge. Agents 1, 3 and 7 send their outputs here (topic agent_output_produced).
 * Each output gets a deterministic answer-leak check (student-facing agents) plus an LLM
 * rubric verdict, recorded in agent memory. /schedule/evaluate summarizes recent verdicts.
 */
const app = createAgentApp();

const RUBRICS: Record<string, string> = {
  Agent1: 'Socratic tutor reply to a student. ZERO tolerance for direct answers, final values or worked steps. Must end with a question.',
  Agent3: 'Remediation theory for a student. Must be accurate, must not include answers to its own practice questions, must not invent exam citations.',
  Agent7: 'Lecturer briefing. Must be specific, prioritized and actionable, tied to the failing topics or named students. Generic advice fails.',
};

const MAX_STORED_VERDICTS = 1000;
const verdictLogPath = () => buildMemoryPath('judge', 'verdicts.json');

async function rubricVerdict(agent: string, outputText: string, context?: string) {
  const rubric = RUBRICS[agent];
  if (!rubric || !process.env.GOOGLE_API_KEY) return null;
  try {
    const result = await llm().chat.completions.create({
      model: getModel(),
      messages: [
        {
          role: 'system',
          content: `You are The Judge, the automated QA system for CogAIt. Rubric: ${rubric}\nRespond with ONLY valid JSON: {"passed": boolean, "reason": "string"}`,
        },
        { role: 'user', content: `${context ? `Context:\n${context}\n\n` : ''}Output to audit:\n${outputText}` },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    });
    return parseJsonReply<{ passed: boolean; reason: string }>(result.choices[0]?.message?.content);
  } catch (err: any) {
    console.warn(`[Agent8] Rubric check unavailable, recording regex result only: ${err.message}`);
    return null;
  }
}

app.post('/judge/output', requireAgentKey, async (c: Context) => {
  try {
    const body = await c.req.json();
    const agent = String(body.agent ?? '');
    const outputText = String(body.output_text ?? '');
    if (!agent || !outputText) return c.json({ error: 'agent and output_text are required' }, 400);

    const verdict = buildVerdict({
      agent,
      traceId: String(body.trace_id ?? `${agent}:${Date.now()}`),
      outputText,
      llmVerdict: await rubricVerdict(agent, outputText, typeof body.context === 'string' ? body.context : undefined),
    });

    const log = await readJsonFile<Verdict[]>(verdictLogPath(), []);
    await writeJsonFile(verdictLogPath(), [...log, verdict].slice(-MAX_STORED_VERDICTS));
    if (verdict.severity === 'high') {
      console.error(`[Agent8] HIGH severity violation in ${agent} output (${verdict.trace_id}): ${verdict.violations.join('; ')}`);
    }
    return c.json({ success: true, verdict });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

app.post('/schedule/evaluate', requireAgentKey, async (c: Context) => {
  try {
    const input = await runPreExecutionHooks(await c.req.json(), 'Agent8') as JudgeInput;
    const verdicts = await readJsonFile<Verdict[]>(verdictLogPath(), []);
    const summary = summarizeVerdicts({
      verdicts,
      target: input.evaluation_target,
      sampleSize: input.sample_size,
      evaluationType: input.evaluation_type,
    });
    const out = await runPostExecutionHooks<JudgeOutput>(summary, 'Agent8', 'JudgeOutput');
    console.log(`[Agent8] ${out.agent_evaluated}: ${out.policy_violations_detected}/${out.evaluation_details.length} failed, alert=${out.alert_fired}`);
    return c.json({ success: true, evaluation: out });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

startAgentServer(app, 'agent8_judge', 8088);
export default app;
