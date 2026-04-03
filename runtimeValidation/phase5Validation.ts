import fs from "node:fs";
import path from "node:path";
import { assert } from "./assert.js";
import {
  getFeatureFlagSnapshot,
  resetAllFeatureFlags,
  setOrganizationFeatureFlag,
  isFeatureEnabled,
  clearOrganizationFeatureFlag,
} from "../convex/infrastructure/featureFlags.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

export async function runPhase5Validation() {
  resetAllFeatureFlags();
  const defaults = getFeatureFlagSnapshot("org_phase5");
  assert(defaults.auditTrail === false, "auditTrail must default to false");
  assert(defaults.orgRateLimit === false, "orgRateLimit must default to false");
  assert(defaults.serverSideIntegrity === false, "serverSideIntegrity must default to false");

  const schema = read("convex/schema.ts");
  assert(schema.includes("auditLogs: defineTable"), "auditLogs table must exist");
  assert(schema.includes("orgRateLimitCounters: defineTable"), "orgRateLimitCounters table must exist");

  const aiSource = read("convex/ai.ts");
  assert(
    aiSource.includes("rateLimits.consumeOrgRateLimit"),
    "AI flow must enforce org rate limit",
  );

  const sessionLocksSource = read("convex/sessionLocks.ts");
  assert(sessionLocksSource.includes("isFeatureEnabled(\"serverSideIntegrity\""), "integrity flow must gate server-side mode");
  assert(sessionLocksSource.includes("writeAuditLog("), "integrity flow must write audit logs");

  const adminMetricsSource = read("convex/adminMetrics.ts");
  assert(adminMetricsSource.includes("writeAuditLog("), "admin feature flag changes must be audited");

  // Convergence sanity: toggles can be enabled and rolled back.
  setOrganizationFeatureFlag("org_phase5", "auditTrail", true);
  setOrganizationFeatureFlag("org_phase5", "orgRateLimit", true);
  setOrganizationFeatureFlag("org_phase5", "serverSideIntegrity", true);
  assert(isFeatureEnabled("auditTrail", "org_phase5"), "auditTrail should enable");
  assert(isFeatureEnabled("orgRateLimit", "org_phase5"), "orgRateLimit should enable");
  assert(isFeatureEnabled("serverSideIntegrity", "org_phase5"), "serverSideIntegrity should enable");
  clearOrganizationFeatureFlag("org_phase5", "auditTrail");
  clearOrganizationFeatureFlag("org_phase5", "orgRateLimit");
  clearOrganizationFeatureFlag("org_phase5", "serverSideIntegrity");
  assert(!isFeatureEnabled("auditTrail", "org_phase5"), "auditTrail should disable");
  assert(!isFeatureEnabled("orgRateLimit", "org_phase5"), "orgRateLimit should disable");
  assert(!isFeatureEnabled("serverSideIntegrity", "org_phase5"), "serverSideIntegrity should disable");
}
