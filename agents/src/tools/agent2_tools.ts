// Tools for Agent 2 (Assignment Analyst)
import { convex } from '../memory/convex_client.js';
import { appendUserSessionRecord, getLongTermUserMemory } from '../memory/long_term_memory.js';

/**
 * topic_mapper(): maps interaction content to CogAIt topic taxonomy
 */
export const topicMapper = async (rawTopics: string[]): Promise<string[]> => {
  console.log(`[TopicMapper] Mapping raw topics to taxonomy...`);
  // Simulated: normally this asks an embeddings search or static taxonomy list
  return rawTopics.map(t => t.toLowerCase().replace(/\s+/g, '-'));
};

/**
 * convex_write(): writes structured record to student's Convex document
 */
export const convexWrite = async (studentId: string, payload: any): Promise<void> => {
  await appendUserSessionRecord(studentId, payload, payload?.assignment_id);
  console.log(`[ConvexWrite] Stored session record for ${studentId} into Convex.`);
};

/**
 * time_context(): returns current time and student's configured study window
 */
export const timeContext = async (studentId: string): Promise<{
  currentTime: string;
  isWithinStudyWindow: boolean;
}> => {
  const memory = await getLongTermUserMemory(studentId);
  const now = new Date();
  const hhmm = now.toISOString().slice(11, 16);
  const start = memory.studyPreferences.preferredStudyWindowStart ?? "17:00";
  const end = memory.studyPreferences.preferredStudyWindowEnd ?? "22:00";
  return {
    currentTime: now.toISOString(),
    isWithinStudyWindow: hhmm >= start && hhmm <= end,
  };
};
