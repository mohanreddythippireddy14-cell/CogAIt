import {
  clearOrganizationFeatureFlag,
  isFeatureEnabled,
  resetAllFeatureFlags,
  setOrganizationFeatureFlag,
} from "../convex/infrastructure/featureFlags.js";
import { assert } from "./assert.js";
import { logEvent } from "../convex/infrastructure/logger.js";

export async function runRollbackValidation() {
  resetAllFeatureFlags();
  setOrganizationFeatureFlag("org_rb", "structuredLogging", true);
  setOrganizationFeatureFlag("org_rb", "aiUsageMetrics", true);
  setOrganizationFeatureFlag("org_rb", "integrityDashboard", true);
  setOrganizationFeatureFlag("org_rb", "optimizedQueries", true);
  setOrganizationFeatureFlag("org_rb", "cachingLayer", true);
  setOrganizationFeatureFlag("org_rb", "aiQueueAbstraction", true);
  setOrganizationFeatureFlag("org_rb", "auditTrail", true);
  setOrganizationFeatureFlag("org_rb", "orgRateLimit", true);
  setOrganizationFeatureFlag("org_rb", "serverSideIntegrity", true);
  setOrganizationFeatureFlag("org_rb", "apiV1Routing", true);
  setOrganizationFeatureFlag("org_rb", "adminDashboard", true);
  setOrganizationFeatureFlag("org_rb", "multiInstitutionAnalytics", true);
  setOrganizationFeatureFlag("org_rb", "costGovernance", true);

  assert(isFeatureEnabled("structuredLogging", "org_rb"), "structuredLogging should be enabled before rollback");
  assert(isFeatureEnabled("aiUsageMetrics", "org_rb"), "aiUsageMetrics should be enabled before rollback");
  assert(isFeatureEnabled("integrityDashboard", "org_rb"), "integrityDashboard should be enabled before rollback");
  assert(isFeatureEnabled("optimizedQueries", "org_rb"), "optimizedQueries should be enabled before rollback");
  assert(isFeatureEnabled("cachingLayer", "org_rb"), "cachingLayer should be enabled before rollback");
  assert(isFeatureEnabled("aiQueueAbstraction", "org_rb"), "aiQueueAbstraction should be enabled before rollback");
  assert(isFeatureEnabled("auditTrail", "org_rb"), "auditTrail should be enabled before rollback");
  assert(isFeatureEnabled("orgRateLimit", "org_rb"), "orgRateLimit should be enabled before rollback");
  assert(isFeatureEnabled("serverSideIntegrity", "org_rb"), "serverSideIntegrity should be enabled before rollback");
  assert(isFeatureEnabled("apiV1Routing", "org_rb"), "apiV1Routing should be enabled before rollback");
  assert(isFeatureEnabled("adminDashboard", "org_rb"), "adminDashboard should be enabled before rollback");
  assert(isFeatureEnabled("multiInstitutionAnalytics", "org_rb"), "multiInstitutionAnalytics should be enabled before rollback");
  assert(isFeatureEnabled("costGovernance", "org_rb"), "costGovernance should be enabled before rollback");

  clearOrganizationFeatureFlag("org_rb", "structuredLogging");
  clearOrganizationFeatureFlag("org_rb", "aiUsageMetrics");
  clearOrganizationFeatureFlag("org_rb", "integrityDashboard");
  clearOrganizationFeatureFlag("org_rb", "optimizedQueries");
  clearOrganizationFeatureFlag("org_rb", "cachingLayer");
  clearOrganizationFeatureFlag("org_rb", "aiQueueAbstraction");
  clearOrganizationFeatureFlag("org_rb", "auditTrail");
  clearOrganizationFeatureFlag("org_rb", "orgRateLimit");
  clearOrganizationFeatureFlag("org_rb", "serverSideIntegrity");
  clearOrganizationFeatureFlag("org_rb", "apiV1Routing");
  clearOrganizationFeatureFlag("org_rb", "adminDashboard");
  clearOrganizationFeatureFlag("org_rb", "multiInstitutionAnalytics");
  clearOrganizationFeatureFlag("org_rb", "costGovernance");

  assert(!isFeatureEnabled("structuredLogging", "org_rb"), "structuredLogging should be disabled after rollback");
  assert(!isFeatureEnabled("aiUsageMetrics", "org_rb"), "aiUsageMetrics should be disabled after rollback");
  assert(!isFeatureEnabled("integrityDashboard", "org_rb"), "integrityDashboard should be disabled after rollback");
  assert(!isFeatureEnabled("optimizedQueries", "org_rb"), "optimizedQueries should be disabled after rollback");
  assert(!isFeatureEnabled("cachingLayer", "org_rb"), "cachingLayer should be disabled after rollback");
  assert(!isFeatureEnabled("aiQueueAbstraction", "org_rb"), "aiQueueAbstraction should be disabled after rollback");
  assert(!isFeatureEnabled("auditTrail", "org_rb"), "auditTrail should be disabled after rollback");
  assert(!isFeatureEnabled("orgRateLimit", "org_rb"), "orgRateLimit should be disabled after rollback");
  assert(!isFeatureEnabled("serverSideIntegrity", "org_rb"), "serverSideIntegrity should be disabled after rollback");
  assert(!isFeatureEnabled("apiV1Routing", "org_rb"), "apiV1Routing should be disabled after rollback");
  assert(!isFeatureEnabled("adminDashboard", "org_rb"), "adminDashboard should be disabled after rollback");
  assert(!isFeatureEnabled("multiInstitutionAnalytics", "org_rb"), "multiInstitutionAnalytics should be disabled after rollback");
  assert(!isFeatureEnabled("costGovernance", "org_rb"), "costGovernance should be disabled after rollback");

  // Rollback safety: logging should be a no-op when disabled.
  logEvent({ event: "rollback.validation", organizationId: "org_rb" });
}
