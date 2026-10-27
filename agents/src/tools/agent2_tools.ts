// Tools for Agent 2 (Assignment Analyst)
import { appendUserSessionRecord } from '../memory/long_term_memory.js';

/**
 * Stores the structured session record in the agent's own memory (agents/.memory).
 * Agent 4 reads attempt history from Convex; this record keeps the LLM's topic analysis.
 */
export const convexWrite = async (studentId: string, payload: any): Promise<void> => {
  await appendUserSessionRecord(studentId, payload, payload?.assignment_id);
  console.log(`[SessionRecord] Stored session record for ${studentId} in agent memory.`);
};
