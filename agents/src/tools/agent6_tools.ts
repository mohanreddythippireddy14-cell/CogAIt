// Tools for Agent 6 (Cohort Analyst)
import { fetchAssignmentContext } from '../memory/convex_client.js';
import { buildMemoryPath, readJsonFile, writeJsonFile } from '../memory/file_store.js';
import { saveLecturerCohortSummary } from '../memory/long_term_memory.js';
import { MIN_COHORT_SIZE } from '../lib/analytics.js';
import type { LongTermAnalystOutput } from '../types/index.js';

interface CohortBuffer {
  batchId: string;
  reports: Record<string, LongTermAnalystOutput>; // latest report per student
  analyzedAtSize: number; // number of students at the last cohort run
}

const bufferPath = (batchId: string) => buildMemoryPath('cohorts', `${batchId}.json`);

/**
 * Adds a student report to the batch buffer. Returns the batch's reports when a cohort run
 * is due: first at MIN_COHORT_SIZE students, then each time MIN_COHORT_SIZE more report.
 */
export async function bufferStudentReport(
  batchId: string,
  report: LongTermAnalystOutput,
): Promise<LongTermAnalystOutput[] | null> {
  const buffer = await readJsonFile<CohortBuffer>(bufferPath(batchId), { batchId, reports: {}, analyzedAtSize: 0 });
  buffer.reports[report.student_id] = report;
  const size = Object.keys(buffer.reports).length;
  const due = size >= MIN_COHORT_SIZE && size >= buffer.analyzedAtSize + MIN_COHORT_SIZE;
  if (due) buffer.analyzedAtSize = size;
  await writeJsonFile(bufferPath(batchId), buffer);
  return due ? Object.values(buffer.reports) : null;
}

/** Lecturer who owns the batch (assignment), or null when unknown. */
export async function lecturerForBatch(batchId: string): Promise<string | null> {
  if (batchId === 'unassigned') return null;
  try {
    return (await fetchAssignmentContext(batchId))?.lecturerId ?? null;
  } catch (err: any) {
    console.warn(`[Agent6] Could not resolve lecturer for batch ${batchId}: ${err.message}`);
    return null;
  }
}

export const convexWriteCohort = async (batchId: string, cohortSummary: unknown, lecturerId: string): Promise<void> => {
  await saveLecturerCohortSummary(lecturerId, batchId, cohortSummary);
  console.log(`[CohortSummary] Stored cohort summary for batch ${batchId} (lecturer ${lecturerId}) in agent memory`);
};
