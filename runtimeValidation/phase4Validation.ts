import fs from "node:fs";
import path from "node:path";
import { assert } from "./assert.js";
import {
  clearOrganizationFeatureFlag,
  getFeatureFlagSnapshot,
  resetAllFeatureFlags,
  setOrganizationFeatureFlag,
} from "../convex/infrastructure/featureFlags.js";
import { buildOrgCacheKey, clearAllCache, getCacheValue, setCacheValue } from "../convex/infrastructure/cache.js";
import { enqueueAiJob } from "../convex/infrastructure/aiQueue.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

export async function runPhase4Validation() {
  resetAllFeatureFlags();
  clearAllCache();
  const defaults = getFeatureFlagSnapshot("org_phase4");
  assert(defaults.optimizedQueries === false, "optimizedQueries must default to false");
  assert(defaults.cachingLayer === false, "cachingLayer must default to false");
  assert(defaults.aiQueueAbstraction === false, "aiQueueAbstraction must default to false");

  const keyA = buildOrgCacheKey("org_a", "studentAssignments", "user_1");
  const keyB = buildOrgCacheKey("org_b", "studentAssignments", "user_1");
  assert(keyA !== keyB, "cache keys must be org-scoped");
  setCacheValue(keyA, { ok: true }, 60000);
  assert(getCacheValue<{ ok: boolean }>(keyA)?.ok === true, "cache should return value for matching key");
  assert(getCacheValue<{ ok: boolean }>(keyB) === null, "cache must not leak across org keys");

  const queueCalls: Array<{ delayMs: number; args: Record<string, unknown> }> = [];
  let fallbackCalled = false;
  const scheduler = {
    runAfter: async (delayMs: number, _fnRef: unknown, args: Record<string, unknown>) => {
      queueCalls.push({ delayMs, args });
      return null;
    },
  };
  await enqueueAiJob({
    organizationId: "org_phase4",
    scheduler,
    delayMs: 0,
    fnRef: "fn",
    args: { jobId: "j1" },
    fallback: async () => {
      fallbackCalled = true;
    },
  });
  assert(fallbackCalled, "fallback must run when aiQueueAbstraction is disabled");
  assert(queueCalls.length === 0, "scheduler should not run when aiQueueAbstraction is disabled");

  setOrganizationFeatureFlag("org_phase4", "aiQueueAbstraction", true);
  fallbackCalled = false;
  await enqueueAiJob({
    organizationId: "org_phase4",
    scheduler,
    delayMs: 0,
    fnRef: "fn",
    args: { jobId: "j2" },
    fallback: async () => {
      fallbackCalled = true;
    },
  });
  assert(!fallbackCalled, "fallback must not run when aiQueueAbstraction is enabled");
  assert(queueCalls.length === 1, "scheduler should run once when aiQueueAbstraction is enabled");
  clearOrganizationFeatureFlag("org_phase4", "aiQueueAbstraction");

  const analyticsSource = read("convex/analytics.ts");
  assert(analyticsSource.includes("isFeatureEnabled(\"optimizedQueries\""), "analytics must gate optimized queries");
  const assignmentsSource = read("convex/assignments.ts");
  assert(assignmentsSource.includes("isFeatureEnabled(\"cachingLayer\""), "assignments must gate cache layer");
  const facultySource = read("convex/facultyAssignments.ts");
  assert(facultySource.includes("enqueueAiJob("), "faculty assignments must use queue abstraction");
}
