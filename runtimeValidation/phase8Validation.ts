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
import { evaluateCostGovernanceDecision, shouldBlockAiRequest } from "../convex/domain/costGovernance.js";

function read(file: string) {
  return fs.readFileSync(path.resolve(process.cwd(), file), "utf8");
}

export async function runPhase8Validation() {
  resetAllFeatureFlags();
  const defaults = getFeatureFlagSnapshot("org_phase8");
  assert(defaults.adminDashboard === false, "adminDashboard must default to false");
  assert(defaults.multiInstitutionAnalytics === false, "multiInstitutionAnalytics must default to false");
  assert(defaults.costGovernance === false, "costGovernance must default to false");

  const schema = read("convex/schema.ts");
  assert(schema.includes("costGovernancePolicies: defineTable"), "costGovernancePolicies table must exist");
  assert(schema.includes("costGovernanceDaily: defineTable"), "costGovernanceDaily table must exist");
  const cgSource = read("convex/costGovernance.ts");
  assert(cgSource.includes("getCostGovernanceDashboard"), "cost governance dashboard endpoint must exist");
  assert(cgSource.includes("getMultiInstitutionAnalytics"), "multi-institution analytics endpoint must exist");
  assert(cgSource.includes("evaluateBeforeAi"), "cost governance pre-check endpoint must exist");
  assert(cgSource.includes("recordAiUsage"), "cost governance usage recorder must exist");

  // Mandatory rollback simulation for hard-stop behavior.
  setOrganizationFeatureFlag("org_phase8", "costGovernance", true);
  const decision = evaluateCostGovernanceDecision({
    currentTokensUsed: 1000,
    requestedTokens: 1,
    dailyCap: 1000,
    softWarningThreshold: 0.8,
    hardStopTriggered: true,
    adminOverrideUntil: undefined,
    now: Date.now(),
  });
  assert(shouldBlockAiRequest({ costGovernanceEnabled: true, hardStop: decision.hardStop }), "hard stop must block when costGovernance is enabled");
  clearOrganizationFeatureFlag("org_phase8", "costGovernance");
  assert(!shouldBlockAiRequest({ costGovernanceEnabled: false, hardStop: decision.hardStop }), "disabling costGovernance must resume requests safely");

  setOrganizationFeatureFlag("org_phase8", "adminDashboard", true);
  setOrganizationFeatureFlag("org_phase8", "multiInstitutionAnalytics", true);
  assert(isFeatureEnabled("adminDashboard", "org_phase8"), "adminDashboard should enable");
  assert(isFeatureEnabled("multiInstitutionAnalytics", "org_phase8"), "multiInstitutionAnalytics should enable");
  clearOrganizationFeatureFlag("org_phase8", "adminDashboard");
  clearOrganizationFeatureFlag("org_phase8", "multiInstitutionAnalytics");
  assert(!isFeatureEnabled("adminDashboard", "org_phase8"), "adminDashboard should disable");
  assert(!isFeatureEnabled("multiInstitutionAnalytics", "org_phase8"), "multiInstitutionAnalytics should disable");
}
