/**
 * Client for Agent 1 (Socratic agent, agents/src/agent1_socratic).
 *
 * Enabled when the deployment has AGENT1_URL and AGENT_SECRET set. Returns null when the
 * agent is not configured or unreachable, so the caller can fall back to direct Gemini.
 * Throws Agent1RejectedError when the agent's guardrails reject the student's input.
 */
export class Agent1RejectedError extends Error {}

export type Agent1Reply = {
  socraticQuestion: string;
  scaffoldingDepth: number;
  tokensUsed: number;
};

const AGENT1_TIMEOUT_MS = 45_000;

export function isAgent1Configured(): boolean {
  return Boolean(process.env.AGENT1_URL && process.env.AGENT_SECRET);
}

export async function askAgent1(input: {
  studentId: string;
  problemId: string;
  problemContext: string;
  conversation: Array<{ student: string; assistant: string }>;
  studentInput: string;
  currentLevel: number;
}): Promise<Agent1Reply | null> {
  const baseUrl = process.env.AGENT1_URL?.replace(/\/$/, "");
  const agentKey = process.env.AGENT_SECRET;
  if (!baseUrl || !agentKey) {
    return null;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AGENT1_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(`${baseUrl}/invoke`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Agent-Key": agentKey },
      body: JSON.stringify({
        student_id: input.studentId,
        problem_id: input.problemId,
        problem_context: input.problemContext,
        conversation: input.conversation,
        student_reasoning_input: input.studentInput,
        current_scaffolding_depth: input.currentLevel,
      }),
      signal: controller.signal,
    });
  } catch (error) {
    console.warn("Agent 1 unreachable, falling back to direct Gemini", String(error));
    return null;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 422) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Agent1RejectedError(body.error ?? "Your message was not accepted. Explain your own reasoning first.");
  }
  if (!response.ok) {
    console.warn("Agent 1 returned an error, falling back to direct Gemini", response.status);
    return null;
  }

  const data = (await response.json().catch(() => null)) as {
    socratic_question?: unknown;
    scaffolding_depth_applied?: unknown;
    tokens_used?: unknown;
  } | null;
  if (!data || typeof data.socratic_question !== "string" || !data.socratic_question.trim()) {
    return null;
  }
  const depth = Number(data.scaffolding_depth_applied);
  return {
    socraticQuestion: data.socratic_question.trim(),
    scaffoldingDepth: Number.isFinite(depth) ? Math.max(1, Math.min(4, Math.round(depth))) : input.currentLevel,
    tokensUsed: typeof data.tokens_used === "number" ? data.tokens_used : 0,
  };
}
