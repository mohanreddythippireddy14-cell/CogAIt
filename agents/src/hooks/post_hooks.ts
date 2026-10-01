import Groq from "groq-sdk";
import { validateSchema } from "../guardrails/schema_validator.js";

function enforceDeterministicPolicies<T>(validated: T, agentId: string): void {
  const output = validated as Record<string, unknown>;

  if (agentId === "Agent3") {
    const score = Number(output.content_confidence_score ?? 0);
    const humanReviewRequired = Boolean(output.human_review_required);
    if (score < 0.8 && !humanReviewRequired) {
      throw new Error("[PostHook - Agent3] Low-confidence remediation content must be flagged for human review.");
    }
  }
}

async function runLlmJudge(agentId: string, output: unknown): Promise<void> {
  if (!process.env.GOOGLE_API_KEY) return;

  const outputStr = typeof output === "string" ? output : JSON.stringify(output);
  const groq = new Groq({ apiKey: process.env.GOOGLE_API_KEY, baseURL: process.env.CONVEX_URL?.replace(".cloud", ".site") + "/api/gemini-proxy/" || "https://dynamic-alpaca-596.convex.site/api/gemini-proxy/" });

  let judgePrompt: string | null = null;

  if (agentId === "Agent2") {
    judgePrompt = `You are the quality judge for CogAIt's Assignment Analyst.
Reject if topic classifications are inconsistent, weak/strong topic summaries contradict the topic performance, or the integrity score is not behaviorally plausible from the output.
Respond ONLY with valid JSON: {"passed": boolean, "reason": "string"}.`;
  } else if (agentId === "Agent7") {
    judgePrompt = `You are the final quality judge for CogAIt's lecturer briefing agent.
Reject generic advice. Pass only if the briefing is specific, prioritized, actionable, and tied to failing topics or named at-risk students.
Respond ONLY with valid JSON: {"passed": boolean, "reason": "string"}.`;
  }

  if (!judgePrompt) return;

  let retries = 3;
  while (retries > 0) {
    try {
      const evaluation = await groq.chat.completions.create({
        model: (process.env.GEMINI_MODEL || "gemini-3.8-flash"),
        messages: [
          { role: "system", content: judgePrompt },
          { role: "user", content: `Agent: ${agentId}\nOutput: ${outputStr}` },
        ],
        temperature: 0.1,
        response_format: { type: "json_object" },
      });

      const result = JSON.parse(evaluation.choices[0]?.message?.content || '{"passed":true,"reason":"ok"}');
      if (!result.passed) {
        throw new Error(`[PolicyException] ${result.reason}`);
      }
      return; // Success, return early
    } catch (err: any) {
      if (String(err.message).includes("[PolicyException]")) throw err;
      
      if (process.env.MOCK_LLM === 'true') {
        console.warn(`[PolicyException Mock] LLM Judge service unavailable, allowing output: ${err.message}`);
        console.warn(`[PolicyException Mock] LLM Judge service unavailable, allowing output: ${err.message}`);
        return;
      }
      
      throw new Error(`[PolicyException] LLM Judge service unavailable or timed out: ${err.message}`);
    }
  }
}

export const runPostExecutionHooks = async <T>(output: unknown, agentId: string, schemaName?: string): Promise<T> => {
  let validated: T = output as T;
  if (schemaName) {
    try {
      validated = validateSchema<T>(output, schemaName);
    } catch (err: any) {
      throw new Error(`[PostHook - ${agentId}] Schema validation failed: ${err.message}`);
    }
  }

  enforceDeterministicPolicies(validated, agentId);

  try {
    await runLlmJudge(agentId, validated);
  } catch (err: any) {
    if (String(err.message).includes("[PolicyException]")) throw err;
    console.warn(`[PostHook LLM Warning] ${err.message}`);
  }

  if (process.env.MOCK_LLM === 'true' && typeof validated === 'object' && validated !== null) {
    (validated as any).mock = true;
  }

  return validated;
};
