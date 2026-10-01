import { buildMemoryPath, readJsonFile, writeJsonFile } from "./file_store.js";

export interface LongTermSessionRecord {
  assignmentId?: string;
  recordedAt: string;
  payload: unknown;
}

export interface CisEntry {
  recordedAt: string;
  cis: number;
}

export interface VectorPatternEntry {
  recordedAt: string;
  payload: unknown;
}

export interface LongTermUserMemory {
  userId: string;
  studyPreferences: {
    preferredStudyWindowStart?: string;
    preferredStudyWindowEnd?: string;
  };
  sessionHistory: LongTermSessionRecord[];
  cisHistory: CisEntry[];
  vectorPatterns: VectorPatternEntry[];
  lastUpdatedAt: string;
}

export interface LecturerLongTermMemory {
  lecturerId: string;
  briefings: Array<{
    recordedAt: string;
    payload: unknown;
  }>;
  cohortSummaries: Array<{
    batchId: string;
    recordedAt: string;
    payload: unknown;
  }>;
  lastUpdatedAt: string;
}

function getUserMemoryFilePath(userId: string): string {
  return buildMemoryPath("long-term", "users", `${userId}.json`);
}

function getLecturerMemoryFilePath(lecturerId: string): string {
  return buildMemoryPath("long-term", "lecturers", `${lecturerId}.json`);
}

function createDefaultUserMemory(userId: string): LongTermUserMemory {
  return {
    userId,
    studyPreferences: {
      preferredStudyWindowStart: "17:00",
      preferredStudyWindowEnd: "22:00",
    },
    sessionHistory: [],
    cisHistory: [],
    vectorPatterns: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

function createDefaultLecturerMemory(lecturerId: string): LecturerLongTermMemory {
  return {
    lecturerId,
    briefings: [],
    cohortSummaries: [],
    lastUpdatedAt: new Date().toISOString(),
  };
}

export async function getLongTermUserMemory(userId: string): Promise<LongTermUserMemory> {
  return readJsonFile(getUserMemoryFilePath(userId), createDefaultUserMemory(userId));
}

export async function saveLongTermUserMemory(memory: LongTermUserMemory): Promise<void> {
  memory.lastUpdatedAt = new Date().toISOString();
  await writeJsonFile(getUserMemoryFilePath(memory.userId), memory);
}

export async function updateLongTermUserMemory(
  userId: string,
  updater: (memory: LongTermUserMemory) => LongTermUserMemory,
): Promise<LongTermUserMemory> {
  const current = await getLongTermUserMemory(userId);
  const next = updater(current);
  await saveLongTermUserMemory(next);
  return next;
}

export async function appendUserSessionRecord(
  userId: string,
  payload: unknown,
  assignmentId?: string,
): Promise<LongTermUserMemory> {
  return updateLongTermUserMemory(userId, (memory) => ({
    ...memory,
    sessionHistory: [
      ...memory.sessionHistory.slice(-199),
      { assignmentId, recordedAt: new Date().toISOString(), payload },
    ],
  }));
}

export async function appendUserCis(userId: string, cis: number): Promise<LongTermUserMemory> {
  return updateLongTermUserMemory(userId, (memory) => ({
    ...memory,
    cisHistory: [...memory.cisHistory.slice(-99), { recordedAt: new Date().toISOString(), cis }],
  }));
}

export async function appendVectorPattern(userId: string, payload: unknown): Promise<LongTermUserMemory> {
  return updateLongTermUserMemory(userId, (memory) => ({
    ...memory,
    vectorPatterns: [...memory.vectorPatterns.slice(-99), { recordedAt: new Date().toISOString(), payload }],
  }));
}

export async function getLecturerLongTermMemory(lecturerId: string): Promise<LecturerLongTermMemory> {
  return readJsonFile(getLecturerMemoryFilePath(lecturerId), createDefaultLecturerMemory(lecturerId));
}

export async function saveLecturerBriefing(lecturerId: string, payload: unknown): Promise<LecturerLongTermMemory> {
  const current = await getLecturerLongTermMemory(lecturerId);
  const next: LecturerLongTermMemory = {
    ...current,
    briefings: [...current.briefings.slice(-29), { recordedAt: new Date().toISOString(), payload }],
    lastUpdatedAt: new Date().toISOString(),
  };
  await writeJsonFile(getLecturerMemoryFilePath(lecturerId), next);
  return next;
}

export async function saveLecturerCohortSummary(
  lecturerId: string,
  batchId: string,
  payload: unknown,
): Promise<LecturerLongTermMemory> {
  const current = await getLecturerLongTermMemory(lecturerId);
  const next: LecturerLongTermMemory = {
    ...current,
    cohortSummaries: [
      ...current.cohortSummaries.slice(-29),
      { batchId, recordedAt: new Date().toISOString(), payload },
    ],
    lastUpdatedAt: new Date().toISOString(),
  };
  await writeJsonFile(getLecturerMemoryFilePath(lecturerId), next);
  return next;
}
