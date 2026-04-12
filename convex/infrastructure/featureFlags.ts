import type { Id } from "../_generated/dataModel.js";

export type FeatureFlag =
  | "structuredLogging"
  | "aiUsageMetrics"
  | "integrityDashboard"
  | "optimizedQueries"
  | "cachingLayer"
  | "aiQueueAbstraction"
  | "auditTrail"
  | "orgRateLimit"
  | "serverSideIntegrity"
  | "strictJsonValidation"
  | "promptVersioning"
  | "aiRegressionEnforcement"
  | "apiV1Routing"
  | "adminDashboard"
  | "multiInstitutionAnalytics"
  | "costGovernance"
  | "dashboardRollups"
  | "teacherDashboardApi"
  | "thinkFirstGate"
  | "mathRendering"
  | "questionNavigator"
  | "enhancedIntegrity"
  | "resultsV2"
  | "internalOpsPanels";

const defaultFlags: Record<FeatureFlag, boolean> = {
  structuredLogging: false,
  aiUsageMetrics: false,
  integrityDashboard: false,
  optimizedQueries: false,
  cachingLayer: false,
  aiQueueAbstraction: false,
  auditTrail: false,
  orgRateLimit: false,
  serverSideIntegrity: false,
  strictJsonValidation: false,
  promptVersioning: false,
  aiRegressionEnforcement: false,
  apiV1Routing: false,
  adminDashboard: false,
  multiInstitutionAnalytics: false,
  costGovernance: false,
  dashboardRollups: true,
  teacherDashboardApi: true,
  thinkFirstGate: true,
  mathRendering: true,
  questionNavigator: true,
  enhancedIntegrity: true,
  resultsV2: true,
  internalOpsPanels: false,
};

const globalOverrides: Partial<Record<FeatureFlag, boolean>> = {};
const organizationOverrides = new Map<string, Partial<Record<FeatureFlag, boolean>>>();

function toOrgKey(orgId?: Id<"organizations"> | string): string | null {
  if (!orgId) {
    return null;
  }
  return String(orgId);
}

export function isFeatureEnabled(flag: FeatureFlag, orgId?: Id<"organizations"> | string): boolean {
  const orgKey = toOrgKey(orgId);
  if (orgKey) {
    const orgMap = organizationOverrides.get(orgKey);
    if (orgMap && Object.prototype.hasOwnProperty.call(orgMap, flag)) {
      return Boolean(orgMap[flag]);
    }
  }
  if (Object.prototype.hasOwnProperty.call(globalOverrides, flag)) {
    return Boolean(globalOverrides[flag]);
  }
  return defaultFlags[flag];
}

export function setGlobalFeatureFlag(flag: FeatureFlag, enabled: boolean) {
  globalOverrides[flag] = enabled;
}

export function clearGlobalFeatureFlag(flag: FeatureFlag) {
  delete globalOverrides[flag];
}

export function setOrganizationFeatureFlag(
  orgId: Id<"organizations"> | string,
  flag: FeatureFlag,
  enabled: boolean,
) {
  const key = String(orgId);
  const current = organizationOverrides.get(key) ?? {};
  current[flag] = enabled;
  organizationOverrides.set(key, current);
}

export function clearOrganizationFeatureFlag(orgId: Id<"organizations"> | string, flag: FeatureFlag) {
  const key = String(orgId);
  const current = organizationOverrides.get(key);
  if (!current) {
    return;
  }
  delete current[flag];
  if (Object.keys(current).length === 0) {
    organizationOverrides.delete(key);
  } else {
    organizationOverrides.set(key, current);
  }
}

export function getFeatureFlagSnapshot(orgId?: Id<"organizations"> | string): Record<FeatureFlag, boolean> {
  const result = { ...defaultFlags };
  for (const key of Object.keys(globalOverrides) as FeatureFlag[]) {
    result[key] = Boolean(globalOverrides[key]);
  }
  const orgKey = toOrgKey(orgId);
  if (orgKey) {
    const current = organizationOverrides.get(orgKey) ?? {};
    for (const key of Object.keys(current) as FeatureFlag[]) {
      result[key] = Boolean(current[key]);
    }
  }
  return result;
}

export function resetAllFeatureFlags() {
  for (const key of Object.keys(globalOverrides) as FeatureFlag[]) {
    delete globalOverrides[key];
  }
  organizationOverrides.clear();
}
