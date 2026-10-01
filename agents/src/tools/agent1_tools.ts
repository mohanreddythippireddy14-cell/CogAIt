// Tools for Agent 1 (Socratic Agent)
import { convex } from '../memory/convex_client.js';
import { appendShortTermInteraction, getShortTermSessionMemory, updateShortTermSessionMemory } from '../memory/short_term_memory.js';

/**
 * reasoning_validator(): evaluates whether student input contains genuine reasoning attempt
 */
export const reasoningValidator = (input: string): boolean => {
  const words = input.trim().split(/\s+/).length;
  // Naive heuristic: if > 5 words, assume genuine attempt for now.
  // A real implementation might use a small LLM or NLP technique.
  return words > 5;
};

/**
 * level_tracker(): reads and writes current scaffolding depth for this session
 */
export const levelTracker = {
  read: async (sessionId: string): Promise<number> => {
    const memory = await getShortTermSessionMemory(sessionId, "active");
    return memory.currentScaffoldingDepth || 1;
  },
  write: async (sessionId: string, newDepth: number): Promise<void> => {
    await updateShortTermSessionMemory(sessionId, "active", (memory) => ({
      ...memory,
      currentScaffoldingDepth: newDepth,
    }));
    console.log(`[LevelTracker] Updated scaffolding depth to ${newDepth} for session ${sessionId}`);
  }
};

/**
 * session_state(): reads current problem context and student history for this session
 */
export const sessionState = async (problemId: string, studentId: string): Promise<string> => {
  const memory = await appendShortTermInteraction(studentId, "active", {
    timestamp: new Date().toISOString(),
    problemId,
    scaffoldingDepth: (await getShortTermSessionMemory(studentId, "active")).currentScaffoldingDepth,
  });
  const recentContext = memory.interactions
    .slice(-3)
    .map((item) => `${item.problemId}:${item.studentInput ?? "context_opened"}`)
    .join(" | ");
  return `Context for problem ${problemId}. Recent user session memory: ${recentContext || "none yet"}.`;
};
