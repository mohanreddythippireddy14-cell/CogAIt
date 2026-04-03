import fs from "node:fs";
import path from "node:path";
import { assert } from "./assert.js";
import {
  clearOrganizationFeatureFlag,
  getFeatureFlagSnapshot,
  isFeatureEnabled,
  resetAllFeatureFlags,
  setOrganizationFeatureFlag,
} from "../convex/infrastructure/featureFlags.js";
import { logEvent } from "../convex/infrastructure/logger.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

export async function runPhase3Validation() {
  resetAllFeatureFlags();
  const defaults = getFeatureFlagSnapshot("org_phase3");
  assert(defaults.structuredLogging === false, "structuredLogging must default to false");
  assert(defaults.aiUsageMetrics === false, "aiUsageMetrics must default to false");
  assert(defaults.integrityDashboard === false, "integrityDashboard must default to false");

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  };

  try {
    logEvent({ event: "phase3.logger.disabled", organizationId: "org_phase3" });
    await Promise.resolve();
    assert(logs.length === 0, "logger must not emit when structuredLogging is off");

    setOrganizationFeatureFlag("org_phase3", "structuredLogging", true);
    logEvent({ event: "phase3.logger.enabled", organizationId: "org_phase3", payload: { ok: true } });
    await Promise.resolve();
    assert(logs.length === 1, "logger must emit once when structuredLogging is on");
    const parsed = JSON.parse(logs[0]) as { event?: string; payload?: { ok?: boolean } };
    assert(parsed.event === "phase3.logger.enabled", "structured log must include event");
    assert(parsed.payload?.ok === true, "structured log must include payload");
  } finally {
    console.log = originalLog;
    clearOrganizationFeatureFlag("org_phase3", "structuredLogging");
  }

  const aiSource = read("convex/ai.ts");
  const hasClientOrgArg = /logAiUsageMetric\s*=\s*mutation\([\s\S]*?args:\s*\{[\s\S]*organizationId:\s*v\.id\("organizations"\)/m.test(aiSource);
  assert(!hasClientOrgArg, "logAiUsageMetric must not accept client-supplied organizationId");

  const adminMetricsSource = read("convex/adminMetrics.ts");
  assert(adminMetricsSource.includes("systemObservabilityHealth"), "systemObservabilityHealth endpoint must exist");
  assert(adminMetricsSource.includes("isFeatureEnabled(\"aiUsageMetrics\""), "observability health must gate aiUsageMetrics checks");

  assert(isFeatureEnabled("structuredLogging", "org_phase3") === false, "structuredLogging should be off after cleanup");
}
