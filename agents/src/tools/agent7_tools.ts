// Tools for Agent 7 (Recommendation Agent)
import { saveLecturerBriefing } from '../memory/long_term_memory.js';
import type { CohortIntelligence } from '../types/index.js';

/**
 * Deterministic starting points for the briefing, derived from the cohort data; the LLM
 * turns them into a prioritized narrative.
 */
export const recommendationEngine = (cohort: CohortIntelligence): { priority_interventions: string[] } => {
  const ideas: string[] = [];
  for (const topic of (cohort.failing_topics ?? []).slice(0, 3)) {
    ideas.push(
      topic.avg_scaffold_depth >= 3
        ? `${topic.topic}: ${topic.failure_rate_pct}% struggling and relying on level-3/4 help; reteach the core concept before more practice.`
        : `${topic.topic}: ${topic.failure_rate_pct}% declining; assign a short independent practice set and review errors in class.`,
    );
  }
  if ((cohort.ai_dependency_students ?? []).length > 0) {
    ideas.push(`${cohort.ai_dependency_students.length} student(s) lean on AI help; require a written first attempt before help on the next assignment.`);
  }
  if (cohort.cohort_cis_trend === 'declining') {
    ideas.push(`Class CIS is declining (avg ${cohort.cohort_cis_avg}); schedule a no-AI problem-solving session this week.`);
  }
  return { priority_interventions: ideas };
};

export const briefingFormatter = (summary: string): string => {
  return `# Lecturer Briefing

${summary}

`;
};

/** Stores the briefing in the agent's own memory (agents/.memory). */
export const convexWriteBriefing = async (lecturerId: string, briefing: unknown): Promise<void> => {
  await saveLecturerBriefing(lecturerId, briefing);
  console.log(`[Briefing] Stored briefing for lecturer ${lecturerId} in agent memory`);
};

/** Critical alerts are logged; email/Telegram delivery is listed in FUTURE_ACTIONS.md. */
export const agent7AlertDispatcher = async (message: string): Promise<void> => {
  console.log(`[Agent7Alert] CRITICAL LECTURER ALERT: ${message}`);
};
