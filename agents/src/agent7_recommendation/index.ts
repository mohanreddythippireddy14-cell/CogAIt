import { EnvHttpProxyAgent, setGlobalDispatcher } from 'undici';
setGlobalDispatcher(new EnvHttpProxyAgent());
import { serve } from '@hono/node-server';
import { Hono, Context, Next } from 'hono';
import Groq from 'groq-sdk';
import { runPreExecutionHooks } from '../hooks/pre_hooks.js';
import { runPostExecutionHooks } from '../hooks/post_hooks.js';
import { recommendationEngine, briefingFormatter, convexWriteBriefing, agent7AlertDispatcher } from '../tools/agent7_tools.js';
import type { RecommendationAgentInput, RecommendationAgentOutput } from '../types/index.js';

const app = new Hono();
const groq = new Groq({ apiKey: process.env.GOOGLE_API_KEY, baseURL: process.env.CONVEX_URL?.replace(".cloud", ".site") + "/api/gemini-proxy/" || "https://dynamic-alpaca-596.convex.site/api/gemini-proxy/" });
const MODELS = [(process.env.GEMINI_MODEL || 'gemini-3.8-flash')];

app.use('*', async (c: Context, next: Next) => {
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type');
  if (c.req.method === 'OPTIONS') return c.text('OK');
  await next();
});

const systemPrompt = `You are the liaison between the CogAIt intelligence system and human educators. You receive cohort intelligence from Agent 6 and translate it into a structured, prioritized, actionable daily briefing for the lecturer.

Your briefing must:
1. Identify top 3 failing topics with specific intervention suggestions
2. Name specific students whose CIS dropped > 5% due to AI scaffolding dependency
3. Recommend concrete teaching actions — not generic advice
4. Flag critical cases requiring immediate lecturer attention

Be specific. Be prioritized. Be actionable. Generic output is a failure.

You MUST respond with ONLY valid JSON in this exact format:
{"lecturer_id":"string","report_date":"string","briefing_markdown":"string","priority_topics":[{"topic":"str","failure_rate_pct":50,"recommended_action":"str"}],"at_risk_students":[{"student_id":"id","reason":"str"}],"critical_alerts":[{"alert_text":"str","severity":"high|critical"}],"recommended_interventions":[{"target":"str","action":"str"}]}`;

/**
 * Builds a deterministic fallback briefing when model calls time out.
 */
function buildFallbackBriefing(input: RecommendationAgentInput): RecommendationAgentOutput {
  const failingTopics = input.cohort_intelligence.failing_topics ?? [];
  const atRisk = input.cohort_intelligence.at_risk_students ?? [];
  const topics = failingTopics.slice(0, 3).map((topic) => ({
    topic: topic.topic,
    failure_rate_pct: topic.failure_rate_pct,
    recommended_action: "Run a targeted revision session and assign practice on this topic.",
  }));
  const alerts = atRisk.slice(0, 3).map((student) => ({
    alert_text: `Student ${student.student_id} requires immediate check-in (${student.reason}).`,
    severity: "high" as const,
  }));

  return {
    lecturer_id: input.lecturer_id,
    report_date: input.report_date,
    briefing_markdown: `# Lecturer Briefing\n\nThis is a fallback briefing generated without LLM output due to upstream timeouts.\n\n` +
      `## Priority Topics\n${topics.length > 0 ? topics.map((t) => `- ${t.topic} (${t.failure_rate_pct}%)`).join("\n") : "- No failing topics detected."}\n\n` +
      `## At-Risk Students\n${atRisk.length > 0 ? atRisk.map((s) => `- ${s.student_id}: ${s.reason}`).join("\n") : "- No at-risk students detected."}\n`,
    priority_topics: topics,
    at_risk_students: atRisk.map((student) => ({
      student_id: student.student_id,
      reason: student.reason,
    })),
    critical_alerts: alerts,
    recommended_interventions: topics.map((topic) => ({
      target: topic.topic,
      action: "Assign a remediation worksheet and monitor next attempt.",
    })),
  };
}

app.post('/workflow/recommendation_generation', async (c: Context) => {
  try {
    const rawInput = await c.req.json();
    const input = await runPreExecutionHooks(rawInput, 'Agent7') as RecommendationAgentInput;
    let lastErr: any;
    
    // Tools logic (Simulated execution)
    const interventions = await recommendationEngine(input.cohort_intelligence);
    

    for (let attempts = 0; attempts < 5; attempts++) {
      for (const model of MODELS) {
        try {
          console.log(`[Agent7] Trying ${model} (Attempt ${attempts + 1})`);
          const result = await groq.chat.completions.create({
            model,
            messages: [
              { role: 'system', content: systemPrompt },
              { role: 'user', content: `Lecturer: ${input.lecturer_id}\nReport Date: ${input.report_date}\nCohort Intelligence: ${JSON.stringify(input.cohort_intelligence || {})}\nEngine Ideas: ${JSON.stringify(interventions)}` }
            ],
            temperature: 0.4,
            response_format: { type: 'json_object' }
          });
          
          let out = JSON.parse(result.choices[0]?.message?.content || '{}') as RecommendationAgentOutput;
          out.lecturer_id = input.lecturer_id;
          out.report_date = input.report_date;
          out.briefing_markdown = briefingFormatter(out.briefing_markdown, out);
          
          out = await runPostExecutionHooks<RecommendationAgentOutput>(out, 'Agent7', 'RecommendationAgentOutput');
          
          // Finalize
          await convexWriteBriefing(out.lecturer_id, out);
          if (out.critical_alerts && out.critical_alerts.length > 0) {
            await agent7AlertDispatcher(`Found ${out.critical_alerts.length} critical alerts for lecturer ${out.lecturer_id}`);
          }
          
          console.log(`[Agent7] Success with ${model}`);
          return c.json({ success: true, briefing: out });
        } catch (e: any) {
          lastErr = e;
          console.warn(`[Agent7] ${model} failed: ${e.message?.slice(0,80)}`);
        }
      }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    const fallback = buildFallbackBriefing(input);
    // Bypass PostHooks (LLM Judge) for fallback to prevent recursive API timeouts
    await convexWriteBriefing(fallback.lecturer_id, fallback);
    console.warn(`[Agent7] All models failed; returning fallback briefing.`);
    return c.json({ success: true, briefing: fallback, fallback: true });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

const port = process.env.PORT ? parseInt(process.env.PORT) : 8087;
console.log(`[agent7_recommendation] Starting on port ${port}`);
serve({ fetch: app.fetch, port });
export default app;
