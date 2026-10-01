import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MEMORY_ROOT = path.resolve(__dirname, "../../.memory");

export async function ensureDirectory(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export function sanitizeKey(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await ensureDirectory(path.dirname(filePath));
  await writeFile(filePath, JSON.stringify(value, null, 2), "utf-8");
}

export function buildMemoryPath(...parts: string[]): string {
  return path.join(MEMORY_ROOT, ...parts.map(sanitizeKey));
}
