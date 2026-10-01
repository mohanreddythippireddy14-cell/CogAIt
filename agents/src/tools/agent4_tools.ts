// Tools for Agent 4 (Long-Term Analyst)
import { convex } from '../memory/convex_client.js';
import { appendUserCis, appendVectorPattern, getLongTermUserMemory } from '../memory/long_term_memory.js';

export const convexReadHistory = async (studentId: string): Promise<any[]> => {
  console.log(`[ConvexReadHistory] Fetching history for student ${studentId}...`);
  const memory = await getLongTermUserMemory(studentId);
  return memory.sessionHistory;
};

export const bigqueryQuery = async (query: string): Promise<any[]> => {
  console.log(`[BigQuery] Executing analytics query for trends...`);
  return []; // Simulated analytics data
};

export const cisCalculator = (history: any[]): number => {
  if (history.length === 0) return 75.5;
  const integrityScores = history
    .map((entry) => Number((entry?.payload as any)?.session_integrity_score))
    .filter((score) => !Number.isNaN(score));
  if (integrityScores.length === 0) return 75.5;
  const avg = integrityScores.reduce((sum, score) => sum + score, 0) / integrityScores.length;
  return Math.round(avg * 1000) / 10;
};

export const vectorSearchRead = async (studentId: string): Promise<any[]> => {
  console.log(`[VectorSearch] Retrieving behavior patterns for ${studentId}`);
  const memory = await getLongTermUserMemory(studentId);
  return memory.vectorPatterns;
};

export const convexWriteCis = async (studentId: string, cis: number): Promise<void> => {
  await appendUserCis(studentId, cis);
  await appendVectorPattern(studentId, { cis, source: "agent4_longterm" });
  console.log(`[ConvexWriteCIS] Updated dashboard CIS for student ${studentId} to ${cis}`);
};
