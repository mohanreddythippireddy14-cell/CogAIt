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

export async function runPhase7Validation() {
  resetAllFeatureFlags();
  const defaults = getFeatureFlagSnapshot("org_phase7");
  assert(defaults.apiV1Routing === false, "apiV1Routing must default to false");

  const apiV1Source = read("convex/apiV1.ts");
  assert(apiV1Source.includes("isFeatureEnabled(\"apiV1Routing\""), "api v1 routing must be feature-gated");
  assert(apiV1Source.includes("getStudentAssignmentsV1"), "api v1 endpoint must exist");

  const migrationDoc = read("docs/api-v1-migration.md");
  assert(migrationDoc.includes("Feature flag: `apiV1Routing`"), "migration documentation must reference apiV1Routing");
  assert(migrationDoc.includes("Rollback"), "migration documentation must include rollback section");

  setOrganizationFeatureFlag("org_phase7", "apiV1Routing", true);
  assert(isFeatureEnabled("apiV1Routing", "org_phase7"), "apiV1Routing should enable");
  clearOrganizationFeatureFlag("org_phase7", "apiV1Routing");
  assert(!isFeatureEnabled("apiV1Routing", "org_phase7"), "apiV1Routing should disable");
}
