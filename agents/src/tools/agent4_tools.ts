// Tools for Agent 4 (Long-Term Analyst)
import { fetchStudentHistory, type StudentHistoryEntry } from '../memory/convex_client.js';
import { appendUserCis } from '../memory/long_term_memory.js';

/** Submitted attempts of the student from Convex (agentAPI.getStudentHistory). */
export const convexReadHistory = async (studentId: string): Promise<StudentHistoryEntry[]> => {
  console.log(`[ConvexReadHistory] Fetching history for student ${studentId}...`);
  return fetchStudentHistory(studentId);
};

/** Keeps a CIS snapshot in the agent's own memory (agents/.memory) for later comparison. */
export const saveCisSnapshot = async (studentId: string, cis: number): Promise<void> => {
  await appendUserCis(studentId, cis);
  console.log(`[CisSnapshot] Stored CIS ${cis} for student ${studentId} in agent memory`);
};
