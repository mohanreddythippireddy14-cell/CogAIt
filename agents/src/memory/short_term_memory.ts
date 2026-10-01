import { buildMemoryPath, readJsonFile, writeJsonFile } from "./file_store.js";

export interface SessionInteraction {
  timestamp: string;
  problemId: string;
  studentInput?: string;
  agentOutput?: string;
  scaffoldingDepth?: number;
}

export interface ShortTermSessionMemory {
  userId: string;
  sessionId: string;
  currentScaffoldingDepth: number;
  activeProblemId?: string;
  lastUpdatedAt: string;
  interactions: SessionInteraction[];
}

function getSessionFilePath(userId: string, sessionId: string): string {
  return buildMemoryPath("short-term", "users", userId, `${sessionId}.json`);
}

function createDefaultSession(userId: string, sessionId: string): ShortTermSessionMemory {
  return {
    userId,
    sessionId,
    currentScaffoldingDepth: 1,
    lastUpdatedAt: new Date().toISOString(),
    interactions: [],
  };
}

export async function getShortTermSessionMemory(userId: string, sessionId = "default"): Promise<ShortTermSessionMemory> {
  return readJsonFile(getSessionFilePath(userId, sessionId), createDefaultSession(userId, sessionId));
}

export async function saveShortTermSessionMemory(memory: ShortTermSessionMemory): Promise<void> {
  memory.lastUpdatedAt = new Date().toISOString();
  await writeJsonFile(getSessionFilePath(memory.userId, memory.sessionId), memory);
}

export async function updateShortTermSessionMemory(
  userId: string,
  sessionId: string,
  updater: (memory: ShortTermSessionMemory) => ShortTermSessionMemory,
): Promise<ShortTermSessionMemory> {
  const current = await getShortTermSessionMemory(userId, sessionId);
  const next = updater(current);
  await saveShortTermSessionMemory(next);
  return next;
}

export async function appendShortTermInteraction(
  userId: string,
  sessionId: string,
  interaction: SessionInteraction,
): Promise<ShortTermSessionMemory> {
  return updateShortTermSessionMemory(userId, sessionId, (memory) => ({
    ...memory,
    activeProblemId: interaction.problemId || memory.activeProblemId,
    currentScaffoldingDepth: interaction.scaffoldingDepth ?? memory.currentScaffoldingDepth,
    interactions: [...memory.interactions.slice(-24), interaction],
  }));
}
